import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { decrypt } from '@/lib/encryption'
import { syncRateLimiter, getRateLimitKey, getRateLimitHeaders } from '@/lib/rate-limit'
import { ShopifyClient } from '@/services/shopify/client'
import { syncAdAccount, validDateRange } from '@/lib/sync/ad-account'

// Shopify rate limit delay - 500ms for 2 req/sec limit
const SHOPIFY_API_DELAY_MS = 500
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

interface SyncResult {
  platform: string
  success: boolean
  count: number
  error?: string
}

/**
 * Unified sync endpoint - syncs Shopify, Facebook Ads, and Google Ads (via Sheets)
 *
 * POST /api/sync/all
 * Body: {
 *   dateFrom?: string,   // For historical/full sync - default: uses lastSyncAt
 *   dateTo?: string,     // Default: today
 *   fullSync?: boolean   // If true, sync ALL data from dateFrom (ignores lastSyncAt)
 * }
 *
 * SMART SYNC BEHAVIOR:
 * - Shopify: Only syncs orders UPDATED since lastSyncAt (not all orders!)
 *   This is fast because it only gets new/changed orders
 * - Ads: Syncs last 7 days (needed because ad data can change retroactively)
 * - fullSync: Forces sync from dateFrom, ignoring lastSyncAt
 */
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Apply rate limiting
  const rateLimitKey = getRateLimitKey(request, session.user.id)
  const rateLimitResult = syncRateLimiter(rateLimitKey)

  if (rateLimitResult.limited) {
    return NextResponse.json(
      { error: 'För många synkförfrågningar. Vänta en stund.' },
      {
        status: 429,
        headers: getRateLimitHeaders(10, rateLimitResult.remaining, rateLimitResult.resetAt),
      }
    )
  }

  const body = await request.json().catch(() => ({}))
  const { dateFrom, dateTo, fullSync = false } = body

  // Default dates
  const now = new Date()

  // For Shopify: 30 days default, or use provided dateFrom
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
  const shopifyDateFrom = dateFrom ? new Date(dateFrom) : thirtyDaysAgo

  // For ads: 7 days default, or use provided dateFrom
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  const adsDateFrom = dateFrom || sevenDaysAgo.toISOString().split('T')[0]
  const adsDateTo = dateTo || now.toISOString().split('T')[0]

  if (!validDateRange(adsDateFrom, adsDateTo)) {
    return NextResponse.json({ error: 'Invalid date range' }, { status: 400 })
  }

  // Get user's team
  const teamMember = await prisma.teamMember.findFirst({
    where: { userId: session.user.id },
    select: { teamId: true },
  })

  if (!teamMember) {
    return NextResponse.json({ error: 'No team found' }, { status: 404 })
  }

  const teamId = teamMember.teamId

  // Get all connected stores and ad accounts
  const [stores, adAccounts] = await Promise.all([
    prisma.store.findMany({
      where: { teamId, isActive: true },
      select: {
        id: true,
        name: true,
        shopifyDomain: true,
        shopifyAccessTokenEncrypted: true,
        lastSyncAt: true,
      },
    }),
    prisma.adAccount.findMany({
      where: { teamId, isActive: true },
      select: {
        id: true,
        platform: true,
        platformAccountId: true,
        accountName: true,
        accessTokenEncrypted: true,
        refreshTokenEncrypted: true,
        tokenExpiresAt: true,
        currency: true,
      },
    }),
  ])

  const results: SyncResult[] = []
  const syncPromises: Promise<void>[] = []

  // Sync Shopify stores
  for (const store of stores) {
    if (!store.shopifyAccessTokenEncrypted) continue

    // SMART SYNC: Use lastSyncAt for incremental sync (much faster!)
    // fullSync: Ignore lastSyncAt and sync from dateFrom
    const isIncrementalSync = !fullSync && store.lastSyncAt !== null
    const syncFromDate = fullSync
      ? shopifyDateFrom
      : (store.lastSyncAt || shopifyDateFrom)

    syncPromises.push(
      syncShopifyStoreIncremental(store, syncFromDate, isIncrementalSync).then(result => {
        results.push({ platform: `Shopify: ${store.name}`, ...result })
      })
    )
  }

  // Sync Ad Accounts
  for (const account of adAccounts) {
    if (!account.accessTokenEncrypted) continue

    syncPromises.push(
      syncAdAccount(account, adsDateFrom, adsDateTo).then(result => {
        results.push({ platform: `${account.platform}: ${account.accountName || account.platformAccountId}`, ...result })
      })
    )
  }

  // Wait for all syncs to complete
  await Promise.all(syncPromises)

  // Calculate totals
  const totalSynced = results.reduce((sum, r) => sum + (r.success ? r.count : 0), 0)
  const successCount = results.filter(r => r.success).length
  const failCount = results.filter(r => !r.success).length

  return NextResponse.json({
    success: failCount === 0,
    message: `Synkade ${totalSynced} poster från ${successCount} källor`,
    results,
    summary: {
      total: results.length,
      successful: successCount,
      failed: failCount,
      itemsSynced: totalSynced,
    },
  })
}

/**
 * Sync Shopify store with SMART INCREMENTAL SYNC
 *
 * - Incremental mode (isIncremental=true): Uses updated_at_min
 *   Only fetches orders that have been UPDATED since last sync.
 *   This is FAST because most days you only have a few new/updated orders.
 *
 * - Full mode (isIncremental=false): Uses created_at_min
 *   Fetches ALL orders created since the date. Use for initial sync.
 */
async function syncShopifyStoreIncremental(
  store: {
    id: string
    name: string
    shopifyDomain: string
    shopifyAccessTokenEncrypted: string | null
  },
  sinceDate: Date,
  isIncremental: boolean
): Promise<{ success: boolean; count: number; error?: string }> {
  if (!store.shopifyAccessTokenEncrypted) {
    return { success: false, count: 0, error: 'No access token' }
  }

  try {
    const syncStartedAt = new Date()
    const accessToken = decrypt(store.shopifyAccessTokenEncrypted)
    const client = new ShopifyClient({
      shopDomain: store.shopifyDomain,
      accessToken,
    })

    // Pre-fetch variants for linking
    const allVariants = await prisma.productVariant.findMany({
      where: { product: { storeId: store.id } },
      select: { id: true, shopifyVariantId: true },
    })
    const variantLookup = new Map<string, string>()
    for (const v of allVariants) {
      variantLookup.set(v.shopifyVariantId.toString(), v.id)
    }

    let totalCount = 0
    let pageInfo: string | undefined
    let pageNumber = 0

    // PAGINATION LOOP
    do {
      pageNumber++

      const params: {
        limit: number
        page_info?: string
        created_at_min?: string
        updated_at_min?: string
        status: string
      } = {
        limit: 250,
        status: 'any',
      }

      if (pageInfo) {
        params.page_info = pageInfo
      } else if (isIncremental) {
        // INCREMENTAL: Only get orders UPDATED since last sync
        // This is much faster - typically only a few orders per day
        params.updated_at_min = sinceDate.toISOString()
      } else {
        // FULL SYNC: Get all orders CREATED since date
        params.created_at_min = sinceDate.toISOString()
      }

      const response = await client.getOrders(params)
      const { orders } = response.data

      if (orders.length === 0) break

      // Process orders
      for (const orderData of orders) {
        try {
          const order = await prisma.order.upsert({
            where: {
              storeId_shopifyOrderId: {
                storeId: store.id,
                shopifyOrderId: BigInt(orderData.id),
              },
            },
            create: {
              storeId: store.id,
              shopifyOrderId: BigInt(orderData.id),
              orderNumber: orderData.order_number?.toString() || orderData.name,
              orderName: orderData.name,
              currency: orderData.currency,
              totalPrice: parseFloat(orderData.total_price || '0'),
              subtotalPrice: parseFloat(orderData.subtotal_price || '0'),
              totalTax: parseFloat(orderData.total_tax || '0'),
              totalDiscounts: parseFloat(orderData.total_discounts || '0'),
              totalShippingPrice: parseFloat(orderData.total_shipping_price_set?.shop_money?.amount || '0'),
              financialStatus: orderData.financial_status,
              fulfillmentStatus: orderData.fulfillment_status,
              processedAt: orderData.processed_at ? new Date(orderData.processed_at) : null,
              cancelledAt: orderData.cancelled_at ? new Date(orderData.cancelled_at) : null,
              customerFirstName: orderData.customer?.first_name,
              customerLastName: orderData.customer?.last_name,
              customerEmail: orderData.customer?.email,
              shippingCountry: orderData.shipping_address?.country_code,
              shippingCity: orderData.shipping_address?.city,
              tags: orderData.tags ? orderData.tags.split(',').map((t: string) => t.trim()) : [],
              note: orderData.note,
              shopifyCreatedAt: new Date(orderData.created_at),
              shopifyUpdatedAt: new Date(orderData.updated_at),
            },
            update: {
              totalPrice: parseFloat(orderData.total_price || '0'),
              subtotalPrice: parseFloat(orderData.subtotal_price || '0'),
              totalTax: parseFloat(orderData.total_tax || '0'),
              totalDiscounts: parseFloat(orderData.total_discounts || '0'),
              totalShippingPrice: parseFloat(orderData.total_shipping_price_set?.shop_money?.amount || '0'),
              financialStatus: orderData.financial_status,
              fulfillmentStatus: orderData.fulfillment_status,
              cancelledAt: orderData.cancelled_at ? new Date(orderData.cancelled_at) : null,
              shopifyUpdatedAt: new Date(orderData.updated_at),
            },
          })

          // Sync line items
          for (const item of orderData.line_items || []) {
            const variantId = item.variant_id
              ? variantLookup.get(item.variant_id.toString()) || null
              : null

            await prisma.orderLineItem.upsert({
              where: {
                orderId_shopifyLineItemId: {
                  orderId: order.id,
                  shopifyLineItemId: BigInt(item.id),
                },
              },
              create: {
                orderId: order.id,
                shopifyLineItemId: BigInt(item.id),
                shopifyProductId: item.product_id ? BigInt(item.product_id) : null,
                shopifyVariantId: item.variant_id ? BigInt(item.variant_id) : null,
                variantId,
                title: item.title,
                variantTitle: item.variant_title,
                sku: item.sku,
                quantity: item.quantity,
                price: parseFloat(item.price || '0'),
                totalDiscount: parseFloat(item.total_discount || '0'),
                taxAmount: item.tax_lines?.reduce((sum: number, t: { price: string }) => sum + parseFloat(t.price || '0'), 0) || 0,
              },
              update: {
                variantId,
                quantity: item.quantity,
                price: parseFloat(item.price || '0'),
                totalDiscount: parseFloat(item.total_discount || '0'),
              },
            })
          }

          // Sync refunds
          for (const refundData of orderData.refunds || []) {
            const refundAmount = refundData.transactions?.reduce(
              (sum: number, t: { amount: string }) => sum + parseFloat(t.amount || '0'),
              0
            ) || 0

            await prisma.orderRefund.upsert({
              where: {
                orderId_shopifyRefundId: {
                  orderId: order.id,
                  shopifyRefundId: BigInt(refundData.id),
                },
              },
              create: {
                orderId: order.id,
                shopifyRefundId: BigInt(refundData.id),
                amount: refundAmount,
                note: refundData.note || null,
                restock: refundData.restock || false,
                processedAt: new Date(refundData.created_at),
              },
              update: {
                amount: refundAmount,
                note: refundData.note || null,
                restock: refundData.restock || false,
              },
            })
          }

          // Update order's total refund amount
          const totalRefundAmount = (orderData.refunds || []).reduce((sum: number, r: { transactions?: Array<{ amount: string }> }) => {
            return sum + (r.transactions?.reduce((tSum: number, t: { amount: string }) => tSum + parseFloat(t.amount || '0'), 0) || 0)
          }, 0)

          if (totalRefundAmount > 0) {
            await prisma.order.update({
              where: { id: order.id },
              data: { totalRefundAmount },
            })
          }

          totalCount++
        } catch (err) {
          console.error(`Error processing order ${orderData.id}:`, err)
          throw err
        }
      }

      pageInfo = response.nextPageInfo

      // Rate limit delay between pages
      if (pageInfo) {
        await delay(SHOPIFY_API_DELAY_MS)
      }
    } while (pageInfo)

    // Update last sync time
    await prisma.store.update({
      where: { id: store.id },
      data: { lastSyncAt: syncStartedAt, lastSyncStatus: 'SUCCESS', syncError: null },
    })

    return { success: true, count: totalCount }
  } catch (error) {
    console.error(`Shopify sync error for ${store.name}:`, error)
    return {
      success: false,
      count: 0,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}
