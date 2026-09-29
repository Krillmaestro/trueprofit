import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { decrypt } from '@/lib/encryption'
import { syncRateLimiter, getRateLimitKey, getRateLimitHeaders } from '@/lib/rate-limit'
import { ShopifyClient } from '@/services/shopify/client'
import { syncAdAccount, validDateRange } from '@/lib/sync/ad-account'

// Shopify rate limit delay
const SHOPIFY_API_DELAY_MS = 600
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

interface HistoricalSyncResult {
  source: string
  type: 'shopify' | 'facebook' | 'google'
  success: boolean
  count: number
  error?: string
}

// Track active sync jobs
const activeSyncs = new Map<string, {
  status: 'running' | 'completed' | 'failed'
  progress?: string
  results?: HistoricalSyncResult[]
  error?: string
  startedAt: Date
}>()

/**
 * Historical Sync API - Syncs both Shopify orders and Ads data from a specific date
 *
 * POST /api/sync/historical
 * Body: {
 *   startDate: string (YYYY-MM-DD),
 *   endDate?: string (YYYY-MM-DD, defaults to today),
 *   syncShopify?: boolean (default: true),
 *   syncAds?: boolean (default: true),
 *   background?: boolean (default: true)
 * }
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
  const {
    startDate,
    endDate,
    syncShopify = true,
    syncAds = true,
    background = true
  } = body

  if (!startDate) {
    return NextResponse.json({ error: 'startDate is required' }, { status: 400 })
  }

  // Validate date format
  const startDateParsed = new Date(startDate)
  if (isNaN(startDateParsed.getTime())) {
    return NextResponse.json({ error: 'Invalid startDate format' }, { status: 400 })
  }

  const syncDateFrom = startDateParsed.toISOString().slice(0, 10)
  const endDateParsed = endDate ? new Date(endDate) : new Date()
  if (!Number.isFinite(endDateParsed.getTime())) {
    return NextResponse.json({ error: 'Invalid endDate format' }, { status: 400 })
  }
  const syncDateTo = endDateParsed.toISOString().slice(0, 10)
  if (!validDateRange(syncDateFrom, syncDateTo)) {
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

  // Check for existing running sync
  for (const [key, value] of activeSyncs.entries()) {
    if (key.startsWith(teamId) && value.status === 'running') {
      return NextResponse.json({
        error: 'En synkronisering pågår redan',
        syncId: key
      }, { status: 409 })
    }
  }

  const syncId = `${teamId}-historical-${Date.now()}`

  if (background) {
    // Start background sync
    activeSyncs.set(syncId, {
      status: 'running',
      progress: 'Startar historisk synkronisering...',
      startedAt: new Date()
    })

    // Fire and forget
    runHistoricalSync(syncId, teamId, startDateParsed, syncDateFrom, syncDateTo, syncShopify, syncAds)
      .catch(err => {
        console.error('Historical sync error:', err)
        activeSyncs.set(syncId, {
          status: 'failed',
          error: err instanceof Error ? err.message : 'Unknown error',
          startedAt: activeSyncs.get(syncId)?.startedAt || new Date()
        })
      })

    return NextResponse.json({
      success: true,
      syncId,
      message: 'Historisk synkronisering startad! Du kan lämna sidan.',
      checkStatusUrl: `/api/sync/historical?syncId=${syncId}`
    })
  }

  // Foreground sync (blocking)
  try {
    const results = await runHistoricalSyncBlocking(teamId, startDateParsed, syncDateFrom, syncDateTo, syncShopify, syncAds)

    const totalCount = results.reduce((sum, r) => sum + (r.success ? r.count : 0), 0)
    const successCount = results.filter(r => r.success).length

    return NextResponse.json({
      success: results.length > 0 && results.every(result => result.success),
      message: `Synkade ${totalCount} poster från ${successCount} källor`,
      results,
      summary: {
        total: results.length,
        successful: successCount,
        failed: results.filter(r => !r.success).length,
        itemsSynced: totalCount,
      },
    })
  } catch (error) {
    console.error('Historical sync error:', error)
    return NextResponse.json({
      error: 'Sync failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

/**
 * GET /api/sync/historical?syncId=xxx - Check sync status
 */
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const syncId = request.nextUrl.searchParams.get('syncId')

  if (!syncId) {
    return NextResponse.json({ error: 'Missing syncId' }, { status: 400 })
  }

  const teamId = syncId.slice(0, syncId.lastIndexOf('-historical-'))
  const membership = await prisma.teamMember.findFirst({
    where: { teamId, userId: session.user.id }, select: { teamId: true },
  })
  if (!syncId.includes('-historical-') || !membership) {
    return NextResponse.json({ error: 'Sync not found or expired' }, { status: 404 })
  }

  const syncStatus = activeSyncs.get(syncId)

  if (!syncStatus) {
    return NextResponse.json({ error: 'Sync not found or expired' }, { status: 404 })
  }

  return NextResponse.json(syncStatus)
}

async function runHistoricalSync(
  syncId: string,
  teamId: string,
  startDateParsed: Date,
  syncDateFrom: string,
  syncDateTo: string,
  syncShopify: boolean,
  syncAds: boolean
) {
  const results: HistoricalSyncResult[] = []

  try {
    // Get all stores and ad accounts
    const [stores, adAccounts] = await Promise.all([
      syncShopify ? prisma.store.findMany({
        where: { teamId, isActive: true },
        select: {
          id: true,
          name: true,
          shopifyDomain: true,
          shopifyAccessTokenEncrypted: true,
        },
      }) : [],
      syncAds ? prisma.adAccount.findMany({
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
      }) : [],
    ])

    const totalSources = stores.length + adAccounts.length
    let completedSources = 0

    // Sync Shopify stores
    for (const store of stores) {
      if (!store.shopifyAccessTokenEncrypted) continue

      activeSyncs.set(syncId, {
        status: 'running',
        progress: `Synkar Shopify: ${store.name || store.shopifyDomain} (${completedSources + 1}/${totalSources})`,
        startedAt: activeSyncs.get(syncId)?.startedAt || new Date()
      })

      const result = await syncShopifyHistorical(store, startDateParsed)
      results.push({
        source: store.name || store.shopifyDomain,
        type: 'shopify',
        ...result
      })
      completedSources++
    }

    // Sync Ad Accounts
    for (const account of adAccounts) {
      if (!account.accessTokenEncrypted) continue

      const platformName = account.platform === 'FACEBOOK' ? 'Facebook' : 'Google'
      activeSyncs.set(syncId, {
        status: 'running',
        progress: `Synkar ${platformName}: ${account.accountName || account.platformAccountId} (${completedSources + 1}/${totalSources})`,
        startedAt: activeSyncs.get(syncId)?.startedAt || new Date()
      })

      if (account.platform === 'FACEBOOK') {
        const result = await syncAdAccount(account, syncDateFrom, syncDateTo)
        results.push({
          source: account.accountName || `Facebook ${account.platformAccountId}`,
          type: 'facebook',
          ...result
        })
      } else if (account.platform === 'GOOGLE') {
        const result = await syncAdAccount(account, syncDateFrom, syncDateTo)
        results.push({
          source: account.accountName || `Google ${account.platformAccountId}`,
          type: 'google',
          ...result
        })
      }
      completedSources++
    }

    const totalCount = results.reduce((sum, r) => sum + (r.success ? r.count : 0), 0)
    const successCount = results.filter(r => r.success).length

    activeSyncs.set(syncId, {
      status: results.length > 0 && results.every(result => result.success) ? 'completed' : 'failed',
      error: results.length === 0 ? 'Inga anslutna datakällor kunde synkas.' : results.some(result => !result.success) ? 'En eller flera datakällor misslyckades. Se resultaten.' : undefined,
      progress: `Synkningen avslutad. Synkade ${totalCount} poster från ${successCount} källor.`,
      results,
      startedAt: activeSyncs.get(syncId)?.startedAt || new Date()
    })

    // Clean up after 10 minutes
    setTimeout(() => activeSyncs.delete(syncId), 10 * 60 * 1000)

  } catch (error) {
    console.error('Historical sync error:', error)
    activeSyncs.set(syncId, {
      status: 'failed',
      error: error instanceof Error ? error.message : 'Unknown error',
      results,
      startedAt: activeSyncs.get(syncId)?.startedAt || new Date()
    })

    // Clean up after 10 minutes
    setTimeout(() => activeSyncs.delete(syncId), 10 * 60 * 1000)
  }
}

async function runHistoricalSyncBlocking(
  teamId: string,
  startDateParsed: Date,
  syncDateFrom: string,
  syncDateTo: string,
  syncShopify: boolean,
  syncAds: boolean
): Promise<HistoricalSyncResult[]> {
  const results: HistoricalSyncResult[] = []

  const [stores, adAccounts] = await Promise.all([
    syncShopify ? prisma.store.findMany({
      where: { teamId, isActive: true },
      select: {
        id: true,
        name: true,
        shopifyDomain: true,
        shopifyAccessTokenEncrypted: true,
      },
    }) : [],
    syncAds ? prisma.adAccount.findMany({
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
    }) : [],
  ])

  // Sync sequentially for blocking mode
  for (const store of stores) {
    if (!store.shopifyAccessTokenEncrypted) continue
    const result = await syncShopifyHistorical(store, startDateParsed)
    results.push({ source: store.name || store.shopifyDomain, type: 'shopify', ...result })
  }

  for (const account of adAccounts) {
    if (!account.accessTokenEncrypted) continue

    if (account.platform === 'FACEBOOK') {
      const result = await syncAdAccount(account, syncDateFrom, syncDateTo)
      results.push({ source: account.accountName || `Facebook`, type: 'facebook', ...result })
    } else if (account.platform === 'GOOGLE') {
      const result = await syncAdAccount(account, syncDateFrom, syncDateTo)
      results.push({ source: account.accountName || `Google`, type: 'google', ...result })
    }
  }

  return results
}

async function syncShopifyHistorical(
  store: {
    id: string
    name: string | null
    shopifyDomain: string
    shopifyAccessTokenEncrypted: string | null
  },
  sinceDate: Date
): Promise<{ success: boolean; count: number; error?: string }> {
  if (!store.shopifyAccessTokenEncrypted) {
    return { success: false, count: 0, error: 'No access token' }
  }

  try {
    const accessToken = decrypt(store.shopifyAccessTokenEncrypted)
    const client = new ShopifyClient({
      shopDomain: store.shopifyDomain,
      accessToken,
    })

    let orderCount = 0
    let pageInfo: string | undefined

    // Pre-fetch variants
    const allVariants = await prisma.productVariant.findMany({
      where: { product: { storeId: store.id } },
      select: { id: true, shopifyVariantId: true },
    })
    const variantLookup = new Map<string, string>()
    for (const v of allVariants) {
      variantLookup.set(v.shopifyVariantId.toString(), v.id)
    }

    do {
      // Format date as YYYY-MM-DD for Shopify API (more reliable than ISO)
      // Only pass created_at_min on first page - page_info handles subsequent pages
      const params: {
        limit: number
        page_info?: string
        created_at_min?: string
        status: string
      } = {
        limit: 250,
        status: 'any',
      }

      if (pageInfo) {
        // Shopify ignores all params except limit when page_info is present
        params.page_info = pageInfo
      } else {
        // First page - use date filter
        params.created_at_min = sinceDate.toISOString()
      }

      const response = await client.getOrders(params)
      const { orders } = response.data

      for (const orderData of orders) {
        await prisma.order.upsert({
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

        // Get the created/updated order for line items and refunds
        const order = await prisma.order.findUnique({
          where: {
            storeId_shopifyOrderId: {
              storeId: store.id,
              shopifyOrderId: BigInt(orderData.id),
            },
          },
          select: { id: true },
        })

        if (order) {
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
        }

        orderCount++
      }

      pageInfo = response.nextPageInfo

      // Add delay between pages to avoid rate limiting
      if (pageInfo) {
        await delay(SHOPIFY_API_DELAY_MS)
      }
    } while (pageInfo)

    // Update last sync time
    await prisma.store.update({
      where: { id: store.id },
      data: { lastSyncAt: new Date() },
    })

    return { success: true, count: orderCount }
  } catch (error) {
    console.error(`Shopify historical sync error for ${store.name}:`, error)
    return {
      success: false,
      count: 0,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}
