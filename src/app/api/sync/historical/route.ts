import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { decrypt, encrypt } from '@/lib/encryption'
import { syncRateLimiter, getRateLimitKey, getRateLimitHeaders } from '@/lib/rate-limit'
import { ShopifyClient } from '@/services/shopify/client'
import { FacebookAdsClient, extractConversions, extractRoas } from '@/services/ads/facebook'
import { GoogleSheetsAdsClient, refreshGoogleSheetsToken } from '@/services/ads/google-sheets'

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

  const endDateParsed = endDate ? new Date(endDate) : new Date()
  const syncDateFrom = startDate
  const syncDateTo = endDateParsed.toISOString().split('T')[0]

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
      success: true,
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
        const result = await syncFacebookHistorical(account, syncDateFrom, syncDateTo)
        results.push({
          source: account.accountName || `Facebook ${account.platformAccountId}`,
          type: 'facebook',
          ...result
        })
      } else if (account.platform === 'GOOGLE') {
        const result = await syncGoogleHistorical(account, syncDateFrom, syncDateTo)
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
      status: 'completed',
      progress: `Klar! Synkade ${totalCount} poster från ${successCount} källor.`,
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
      const result = await syncFacebookHistorical(account, syncDateFrom, syncDateTo)
      results.push({ source: account.accountName || `Facebook`, type: 'facebook', ...result })
    } else if (account.platform === 'GOOGLE') {
      const result = await syncGoogleHistorical(account, syncDateFrom, syncDateTo)
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
      const response = await client.getOrders({
        limit: 250,
        page_info: pageInfo,
        created_at_min: sinceDate.toISOString(),
        status: 'any',
      })
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
            totalShippingPrice: 0,
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

async function syncFacebookHistorical(
  account: {
    id: string
    platformAccountId: string
    accessTokenEncrypted: string | null
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

    for (const insight of insights) {
      const spend = parseFloat(insight.spend || '0')
      const impressions = parseInt(insight.impressions || '0', 10)
      const clicks = parseInt(insight.clicks || '0', 10)
      const conversions = extractConversions(insight.actions)
      const roas = extractRoas(insight.purchase_roas)

      const cpc = clicks > 0 ? spend / clicks : 0
      const cpm = impressions > 0 ? (spend / impressions) * 1000 : 0
      const revenue = roas * spend

      const dateStr = insight.date_start
      const [year, month, day] = dateStr.split('-').map(Number)
      const date = new Date(Date.UTC(year, month - 1, day, 12, 0, 0))
      const campaignId = insight.campaign_id || null
      const adSetId = insight.adset_id || null

      const dateStart = new Date(Date.UTC(year, month - 1, day, 0, 0, 0))
      const dateEnd = new Date(Date.UTC(year, month - 1, day, 23, 59, 59))

      const existing = await prisma.adSpend.findFirst({
        where: {
          adAccountId: account.id,
          date: { gte: dateStart, lte: dateEnd },
          campaignId,
          adSetId,
        },
      })

      if (existing) {
        await prisma.adSpend.update({
          where: { id: existing.id },
          data: {
            spend,
            impressions,
            clicks,
            conversions,
            revenue,
            roas,
            cpc,
            cpm,
            campaignName: insight.campaign_name || null,
            adSetName: insight.adset_name || null,
          },
        })
      } else {
        await prisma.adSpend.create({
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
      }

      count++
    }

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
    console.error('Facebook historical sync error:', error)

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

async function syncGoogleHistorical(
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

    for (const row of data) {
      const [year, month, day] = row.date.split('-').map(Number)
      const date = new Date(Date.UTC(year, month - 1, day, 12, 0, 0))
      const roas = row.cost > 0 ? row.conversionValue / row.cost : 0
      const cpc = row.clicks > 0 ? row.cost / row.clicks : 0
      const cpm = row.impressions > 0 ? (row.cost / row.impressions) * 1000 : 0

      const dateStart = new Date(Date.UTC(year, month - 1, day, 0, 0, 0))
      const dateEnd = new Date(Date.UTC(year, month - 1, day, 23, 59, 59))

      const existing = await prisma.adSpend.findFirst({
        where: {
          adAccountId: account.id,
          date: { gte: dateStart, lte: dateEnd },
          campaignId: row.campaignId,
        },
      })

      if (existing) {
        await prisma.adSpend.update({
          where: { id: existing.id },
          data: {
            spend: row.cost,
            impressions: row.impressions,
            clicks: row.clicks,
            conversions: Math.round(row.conversions),
            revenue: row.conversionValue,
            roas,
            cpc,
            cpm,
            campaignName: row.campaignName,
          },
        })
      } else {
        await prisma.adSpend.create({
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
            campaignId: row.campaignId,
            campaignName: row.campaignName,
          },
        })
      }

      count++
    }

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
    console.error('Google historical sync error:', error)

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
