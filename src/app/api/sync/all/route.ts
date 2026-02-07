import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { decrypt, encrypt } from '@/lib/encryption'
import { syncRateLimiter, getRateLimitKey, getRateLimitHeaders } from '@/lib/rate-limit'
import { ShopifyClient } from '@/services/shopify/client'
import { FacebookAdsClient, extractConversions, extractRoas } from '@/services/ads/facebook'
import { GoogleSheetsAdsClient, refreshGoogleSheetsToken } from '@/services/ads/google-sheets'

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

    if (account.platform === 'FACEBOOK') {
      syncPromises.push(
        syncFacebookAdsAccount(account, adsDateFrom, adsDateTo).then(result => {
          results.push({ platform: `Facebook: ${account.accountName || account.platformAccountId}`, ...result })
        })
      )
    } else if (account.platform === 'GOOGLE') {
      // For Google, we use Google Sheets integration
      syncPromises.push(
        syncGoogleAdsFromSheets(account, adsDateFrom, adsDateTo).then(result => {
          results.push({ platform: `Google Ads: ${account.accountName || account.platformAccountId}`, ...result })
        })
      )
    }
  }

  // Wait for all syncs to complete
  await Promise.all(syncPromises)

  // Calculate totals
  const totalSynced = results.reduce((sum, r) => sum + (r.success ? r.count : 0), 0)
  const successCount = results.filter(r => r.success).length
  const failCount = results.filter(r => !r.success).length

  return NextResponse.json({
    success: true,
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
          // Continue with next order
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
      data: { lastSyncAt: new Date() },
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

/**
 * Normalize date to midnight UTC for consistent storage
 */
function normalizeDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0))
}

async function syncFacebookAdsAccount(
  account: {
    id: string
    platformAccountId: string
    accessTokenEncrypted: string | null
    refreshTokenEncrypted: string | null
    tokenExpiresAt: Date | null
    currency: string
  },
  dateFrom: string,
  dateTo: string
): Promise<{ success: boolean; count: number; error?: string }> {
  if (!account.accessTokenEncrypted) {
    return { success: false, count: 0, error: 'No access token' }
  }

  try {
    const accessToken = decrypt(account.accessTokenEncrypted)
    const client = new FacebookAdsClient(accessToken)

    const insights = await client.getInsights(
      account.platformAccountId,
      dateFrom,
      dateTo,
      'campaign'
    )

    let count = 0

    // Use transaction for atomicity
    await prisma.$transaction(async (tx) => {
      for (const insight of insights) {
        const spend = parseFloat(insight.spend || '0')
        const impressions = parseInt(insight.impressions || '0', 10)
        const clicks = parseInt(insight.clicks || '0', 10)
        const conversions = extractConversions(insight.actions)
        const roas = extractRoas(insight.purchase_roas)

        const cpc = clicks > 0 ? spend / clicks : 0
        const cpm = impressions > 0 ? (spend / impressions) * 1000 : 0
        const revenue = roas * spend

        // Normalize date to midnight UTC
        const date = normalizeDate(insight.date_start)
        const campaignId = insight.campaign_id || null
        const adSetId = insight.adset_id || null

        // Delete existing record first, then create new one
        // This avoids null vs empty string mismatch issues with unique constraint
        await tx.adSpend.deleteMany({
          where: {
            adAccountId: account.id,
            date,
            OR: [
              { campaignId: campaignId || '', adSetId: adSetId || '' },
              { campaignId, adSetId },
            ],
          },
        })

        await tx.adSpend.create({
          data: {
            adAccountId: account.id,
            date,
            spend,
            impressions,
            clicks,
            conversions,
            revenue,
            roas,
            cpc,
            cpm,
            currency: account.currency,
            campaignId,
            campaignName: insight.campaign_name || null,
            adSetId,
            adSetName: insight.adset_name || null,
          },
        })

        count++
      }
    })

    // Update last sync time
    await prisma.adAccount.update({
      where: { id: account.id },
      data: {
        lastSyncAt: new Date(),
        lastSyncStatus: 'SUCCESS',
        syncError: null,
      },
    })

    return { success: true, count }
  } catch (error) {
    console.error('Facebook Ads sync error:', error)

    await prisma.adAccount.update({
      where: { id: account.id },
      data: {
        lastSyncStatus: 'FAILED',
        syncError: error instanceof Error ? error.message : 'Unknown error',
      },
    })

    return {
      success: false,
      count: 0,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

async function syncGoogleAdsFromSheets(
  account: {
    id: string
    platformAccountId: string
    accessTokenEncrypted: string | null
    refreshTokenEncrypted: string | null
    tokenExpiresAt: Date | null
    currency: string
  },
  dateFrom: string,
  dateTo: string
): Promise<{ success: boolean; count: number; error?: string }> {
  if (!account.accessTokenEncrypted) {
    return { success: false, count: 0, error: 'No access token' }
  }

  // The platformAccountId for Google Sheets integration contains the spreadsheet ID
  // Format: "sheets:SPREADSHEET_ID" or just the spreadsheet ID
  const spreadsheetId = account.platformAccountId.startsWith('sheets:')
    ? account.platformAccountId.substring(7)
    : account.platformAccountId

  try {
    let accessToken = decrypt(account.accessTokenEncrypted)

    // Check if token needs refresh
    if (account.tokenExpiresAt && account.tokenExpiresAt < new Date()) {
      if (!account.refreshTokenEncrypted) {
        return { success: false, count: 0, error: 'Token expired and no refresh token' }
      }

      const refreshToken = decrypt(account.refreshTokenEncrypted)
      const clientId = process.env.GOOGLE_CLIENT_ID || ''
      const clientSecret = process.env.GOOGLE_CLIENT_SECRET || ''

      const newTokens = await refreshGoogleSheetsToken(refreshToken, clientId, clientSecret)
      accessToken = newTokens.access_token

      const tokenExpiresAt = new Date()
      tokenExpiresAt.setSeconds(tokenExpiresAt.getSeconds() + newTokens.expires_in)

      await prisma.adAccount.update({
        where: { id: account.id },
        data: {
          accessTokenEncrypted: encrypt(accessToken),
          tokenExpiresAt,
        },
      })
    }

    const client = new GoogleSheetsAdsClient({
      accessToken,
      spreadsheetId,
    })

    const data = await client.getAdSpendData(dateFrom, dateTo)
    let count = 0

    // Process in batches to avoid transaction timeout
    const BATCH_SIZE = 50
    for (let i = 0; i < data.length; i += BATCH_SIZE) {
      const batch = data.slice(i, i + BATCH_SIZE)

      // Use transaction with extended timeout for each batch
      await prisma.$transaction(async (tx) => {
        for (const row of batch) {
          // Normalize date to midnight UTC for consistent storage
          const date = normalizeDate(row.date)
          const roas = row.cost > 0 ? row.conversionValue / row.cost : 0
          const cpc = row.clicks > 0 ? row.cost / row.clicks : 0
          const cpm = row.impressions > 0 ? (row.cost / row.impressions) * 1000 : 0
          const campaignId = row.campaignId || null

          // Use delete-then-create pattern to avoid null vs empty string mismatch issues
          // Google Sheets doesn't have ad sets, so adSetId is always null
          const normalizedCampaignId = campaignId || ''

          // First, delete any existing record for this combination
          await tx.adSpend.deleteMany({
            where: {
              adAccountId: account.id,
              date,
              OR: [
                { campaignId: normalizedCampaignId, adSetId: '' },
                { campaignId: normalizedCampaignId, adSetId: null },
                { campaignId: campaignId, adSetId: '' },
                { campaignId: campaignId, adSetId: null },
              ],
            },
          })

          // Then create fresh record
          await tx.adSpend.create({
            data: {
              adAccountId: account.id,
              date,
              spend: row.cost,
              impressions: row.impressions,
              clicks: row.clicks,
              conversions: Math.round(row.conversions),
              revenue: row.conversionValue,
              roas,
              cpc,
              cpm,
              currency: row.currency || account.currency,
              campaignId: campaignId || null,
              campaignName: row.campaignName || null,
              adSetId: null,
              adSetName: null,
            },
          })

          count++
        }
      }, { timeout: 30000 }) // 30 second timeout per batch
    }

    // Update last sync time
    await prisma.adAccount.update({
      where: { id: account.id },
      data: {
        lastSyncAt: new Date(),
        lastSyncStatus: 'SUCCESS',
        syncError: null,
      },
    })

    return { success: true, count }
  } catch (error) {
    console.error('Google Ads (Sheets) sync error:', error)

    // Create a more descriptive error message
    let errorMessage = 'Unknown error'
    if (error instanceof Error) {
      errorMessage = error.message

      // Check for common issues
      if (error.message.includes('401') || error.message.includes('Unauthorized')) {
        errorMessage = 'Din Google-inloggning har gått ut. Koppla om Google Sheets.'
      } else if (error.message.includes('403') || error.message.includes('Forbidden')) {
        errorMessage = 'Ingen åtkomst till Google Sheet. Kontrollera att du har delat sheetet.'
      } else if (error.message.includes('404') || error.message.includes('not found')) {
        errorMessage = 'Kunde inte hitta Google Sheet. Kontrollera URL:en.'
      } else if (error.message.includes('refresh token')) {
        errorMessage = 'Behöver logga in igen. Koppla om Google Sheets.'
      }
    }

    await prisma.adAccount.update({
      where: { id: account.id },
      data: {
        lastSyncStatus: 'FAILED',
        syncError: errorMessage,
      },
    })

    return {
      success: false,
      count: 0,
      error: errorMessage,
    }
  }
}
