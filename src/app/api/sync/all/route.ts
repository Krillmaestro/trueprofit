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

interface SyncResult {
  platform: string
  success: boolean
  count: number
  error?: string
}

/**
 * Unified sync endpoint - syncs Shopify, Facebook Ads, and Google Ads (via Sheets) in parallel
 *
 * POST /api/sync/all
 * Body: { dateFrom?: string, dateTo?: string }
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
  const { dateFrom, dateTo } = body

  // Default to last 7 days if no dates provided
  const now = new Date()
  const defaultDateFrom = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  const defaultDateTo = now.toISOString().split('T')[0]

  const syncDateFrom = dateFrom || defaultDateFrom
  const syncDateTo = dateTo || defaultDateTo

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

    syncPromises.push(
      syncShopifyStore(store, store.lastSyncAt).then(result => {
        results.push({ platform: `Shopify: ${store.name}`, ...result })
      })
    )
  }

  // Sync Ad Accounts
  for (const account of adAccounts) {
    if (!account.accessTokenEncrypted) continue

    if (account.platform === 'FACEBOOK') {
      syncPromises.push(
        syncFacebookAdsAccount(account, syncDateFrom, syncDateTo).then(result => {
          results.push({ platform: `Facebook: ${account.accountName || account.platformAccountId}`, ...result })
        })
      )
    } else if (account.platform === 'GOOGLE') {
      // For Google, we use Google Sheets integration
      syncPromises.push(
        syncGoogleAdsFromSheets(account, syncDateFrom, syncDateTo).then(result => {
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

async function syncShopifyStore(
  store: {
    id: string
    name: string
    shopifyDomain: string
    shopifyAccessTokenEncrypted: string | null
  },
  lastSyncAt: Date | null
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

    // Only sync recent orders (last 24 hours for quick refresh)
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    const sinceDate = lastSyncAt && lastSyncAt > yesterday ? lastSyncAt : yesterday

    // Quick sync - only orders
    const response = await client.getOrders({
      limit: 50,
      created_at_min: sinceDate.toISOString(),
      status: 'any',
    })

    const { orders } = response.data

    // Pre-fetch variants for linking
    const allVariants = await prisma.productVariant.findMany({
      where: { product: { storeId: store.id } },
      select: { id: true, shopifyVariantId: true },
    })
    const variantLookup = new Map<string, string>()
    for (const v of allVariants) {
      variantLookup.set(v.shopifyVariantId.toString(), v.id)
    }

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
    }

    // Update last sync time
    await prisma.store.update({
      where: { id: store.id },
      data: { lastSyncAt: new Date() },
    })

    return { success: true, count: orders.length }
  } catch (error) {
    console.error(`Shopify sync error for ${store.name}:`, error)
    return {
      success: false,
      count: 0,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
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

    for (const insight of insights) {
      const spend = parseFloat(insight.spend || '0')
      const impressions = parseInt(insight.impressions || '0', 10)
      const clicks = parseInt(insight.clicks || '0', 10)
      const conversions = extractConversions(insight.actions)
      const roas = extractRoas(insight.purchase_roas)

      const cpc = clicks > 0 ? spend / clicks : 0
      const cpm = impressions > 0 ? (spend / impressions) * 1000 : 0
      const revenue = roas * spend

      const date = new Date(insight.date_start)
      const campaignId = insight.campaign_id || null
      const adSetId = insight.adset_id || null

      const existing = await prisma.adSpend.findFirst({
        where: { adAccountId: account.id, date, campaignId, adSetId },
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

    for (const row of data) {
      const date = new Date(row.date)
      const roas = row.cost > 0 ? row.conversionValue / row.cost : 0
      const cpc = row.clicks > 0 ? row.cost / row.clicks : 0
      const cpm = row.impressions > 0 ? (row.cost / row.impressions) * 1000 : 0

      const existing = await prisma.adSpend.findFirst({
        where: {
          adAccountId: account.id,
          date,
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
