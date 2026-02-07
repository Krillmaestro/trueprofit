import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { encrypt, decrypt } from '@/lib/encryption'
import { FacebookAdsClient, extractConversions, extractRoas } from '@/services/ads/facebook'
import { GoogleSheetsAdsClient, refreshGoogleSheetsToken } from '@/services/ads/google-sheets'

// Google OAuth credentials for Sheets integration
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || ''
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || ''

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { adAccountId, dateFrom, dateTo } = await request.json()

  // Get ad account and verify access
  const adAccount = await prisma.adAccount.findFirst({
    where: {
      id: adAccountId,
      team: {
        members: {
          some: {
            userId: session.user.id,
          },
        },
      },
    },
  })

  if (!adAccount || !adAccount.accessTokenEncrypted) {
    return NextResponse.json({ error: 'Ad account not found or not connected' }, { status: 404 })
  }

  try {
    let syncedCount = 0

    if (adAccount.platform === 'FACEBOOK') {
      syncedCount = await syncFacebookAds(adAccount, dateFrom, dateTo)
    } else if (adAccount.platform === 'GOOGLE') {
      syncedCount = await syncGoogleAds(adAccount, dateFrom, dateTo)
    }

    // Update last sync time
    await prisma.adAccount.update({
      where: { id: adAccount.id },
      data: {
        lastSyncAt: new Date(),
        lastSyncStatus: 'SUCCESS',
        syncError: null,
      },
    })

    return NextResponse.json({
      success: true,
      syncedCount,
      message: `Synced ${syncedCount} ad spend records`,
    })
  } catch (error) {
    console.error('Ad sync error:', error)

    // Update sync status
    await prisma.adAccount.update({
      where: { id: adAccount.id },
      data: {
        lastSyncStatus: 'FAILED',
        syncError: error instanceof Error ? error.message : 'Unknown error',
      },
    })

    return NextResponse.json({
      error: 'Sync failed',
      details: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 })
  }
}

/**
 * Normalize date to midnight UTC for consistent storage
 * This ensures the same date always produces the same timestamp
 */
function normalizeDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0))
}

async function syncFacebookAds(
  adAccount: { id: string; platformAccountId: string; accessTokenEncrypted: string | null; currency: string },
  dateFrom: string,
  dateTo: string
): Promise<number> {
  if (!adAccount.accessTokenEncrypted) return 0

  const accessToken = decrypt(adAccount.accessTokenEncrypted)
  const client = new FacebookAdsClient(accessToken)

  const insights = await client.getInsights(
    adAccount.platformAccountId,
    dateFrom,
    dateTo,
    'campaign'
  )

  let count = 0

  // Use transaction to ensure atomicity
  await prisma.$transaction(async (tx) => {
    for (const insight of insights) {
      const spend = parseFloat(insight.spend || '0')
      const impressions = parseInt(insight.impressions || '0', 10)
      const clicks = parseInt(insight.clicks || '0', 10)
      const conversions = extractConversions(insight.actions)
      const roas = extractRoas(insight.purchase_roas)

      // Calculate metrics
      const cpc = clicks > 0 ? spend / clicks : 0
      const cpm = impressions > 0 ? (spend / impressions) * 1000 : 0
      const revenue = roas * spend

      // Normalize date to midnight UTC
      const date = normalizeDate(insight.date_start)
      const campaignId = insight.campaign_id || null
      const adSetId = insight.adset_id || null

      // IMPORTANT: Use empty string consistently for null campaignId/adSetId
      // This ensures upsert works correctly with the unique constraint
      const normalizedCampaignId = campaignId || ''
      const normalizedAdSetId = adSetId || ''

      // First, try to delete any existing record for this combination
      // This handles the null vs empty string mismatch issue
      await tx.adSpend.deleteMany({
        where: {
          adAccountId: adAccount.id,
          date,
          OR: [
            { campaignId: normalizedCampaignId, adSetId: normalizedAdSetId },
            { campaignId: campaignId, adSetId: adSetId },
            { campaignId: normalizedCampaignId, adSetId: adSetId },
            { campaignId: campaignId, adSetId: normalizedAdSetId },
          ],
        },
      })

      // Then create fresh record
      await tx.adSpend.create({
        data: {
          adAccountId: adAccount.id,
          date,
          spend,
          impressions,
          clicks,
          conversions,
          revenue,
          roas,
          cpc,
          cpm,
          currency: adAccount.currency,
          campaignId: normalizedCampaignId || null,
          campaignName: insight.campaign_name || null,
          adSetId: normalizedAdSetId || null,
          adSetName: insight.adset_name || null,
        },
      })

      count++
    }
  })

  return count
}

/**
 * Sync Google Ads data via Google Sheets
 */
async function syncGoogleAds(
  adAccount: {
    id: string
    platformAccountId: string
    accessTokenEncrypted: string | null
    refreshTokenEncrypted: string | null
    currency: string
  },
  dateFrom: string,
  dateTo: string
): Promise<number> {
  if (!adAccount.accessTokenEncrypted) return 0

  // Extract spreadsheet ID from platformAccountId
  const spreadsheetId = adAccount.platformAccountId.startsWith('sheets:')
    ? adAccount.platformAccountId.substring(7)
    : adAccount.platformAccountId

  let accessToken = decrypt(adAccount.accessTokenEncrypted)

  // Check if token needs refresh
  const account = await prisma.adAccount.findUnique({
    where: { id: adAccount.id },
    select: { tokenExpiresAt: true },
  })

  if (account?.tokenExpiresAt && account.tokenExpiresAt < new Date()) {
    if (!adAccount.refreshTokenEncrypted) {
      throw new Error('Token har gått ut och det finns ingen refresh token')
    }

    const refreshToken = decrypt(adAccount.refreshTokenEncrypted)
    const newTokens = await refreshGoogleSheetsToken(
      refreshToken,
      GOOGLE_CLIENT_ID,
      GOOGLE_CLIENT_SECRET
    )

    accessToken = newTokens.access_token

    const tokenExpiresAt = new Date()
    tokenExpiresAt.setSeconds(tokenExpiresAt.getSeconds() + newTokens.expires_in)

    await prisma.adAccount.update({
      where: { id: adAccount.id },
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

  console.log(`[Google Ads Sync] Got ${data.length} records from Google Sheets`)

  // Use transaction to ensure atomicity
  await prisma.$transaction(async (tx) => {
    for (const row of data) {
      const roas = row.cost > 0 ? row.conversionValue / row.cost : 0
      const cpc = row.clicks > 0 ? row.cost / row.clicks : 0
      const cpm = row.impressions > 0 ? (row.cost / row.impressions) * 1000 : 0

      // Normalize date to midnight UTC
      const date = normalizeDate(row.date)
      const campaignId = row.campaignId || null

      // IMPORTANT: Use empty string consistently for null campaignId
      const normalizedCampaignId = campaignId || ''

      // First, delete any existing record for this combination
      await tx.adSpend.deleteMany({
        where: {
          adAccountId: adAccount.id,
          date,
          OR: [
            { campaignId: normalizedCampaignId },
            { campaignId: campaignId },
          ],
          adSetId: null,
        },
      })

      // Then create fresh record
      await tx.adSpend.create({
        data: {
          adAccountId: adAccount.id,
          date,
          spend: row.cost,
          impressions: row.impressions,
          clicks: row.clicks,
          conversions: Math.round(row.conversions),
          revenue: row.conversionValue,
          roas,
          cpc,
          cpm,
          currency: row.currency || adAccount.currency,
          campaignId: normalizedCampaignId || null,
          campaignName: row.campaignName || null,
          adSetId: null,
          adSetName: null,
        },
      })

      count++
    }
  })

  console.log(`[Google Ads Sync] Synced ${count} records total`)
  return count
}
