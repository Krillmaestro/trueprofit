import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { FacebookAdsClient, extractConversions, extractRoas } from '@/services/ads/facebook'
import { GoogleAdsClient, refreshGoogleAccessToken } from '@/services/ads/google'
import crypto from 'crypto'

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || crypto.randomBytes(32).toString('hex')
const GOOGLE_ADS_CLIENT_ID = process.env.GOOGLE_ADS_CLIENT_ID || ''
const GOOGLE_ADS_CLIENT_SECRET = process.env.GOOGLE_ADS_CLIENT_SECRET || ''
const GOOGLE_ADS_DEVELOPER_TOKEN = process.env.GOOGLE_ADS_DEVELOPER_TOKEN || ''

function decrypt(encryptedText: string): string {
  const [ivHex, encrypted] = encryptedText.split(':')
  const iv = Buffer.from(ivHex, 'hex')
  const key = Buffer.from(ENCRYPTION_KEY.slice(0, 64), 'hex')
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv)
  let decrypted = decipher.update(encrypted, 'hex', 'utf8')
  decrypted += decipher.final('utf8')
  return decrypted
}

function encrypt(text: string): string {
  const iv = crypto.randomBytes(16)
  const key = Buffer.from(ENCRYPTION_KEY.slice(0, 64), 'hex')
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv)
  let encrypted = cipher.update(text, 'utf8', 'hex')
  encrypted += cipher.final('hex')
  return iv.toString('hex') + ':' + encrypted
}

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

    const date = new Date(insight.date_start)
    const campaignId = insight.campaign_id || null
    const adSetId = insight.adset_id || null

    // Find existing record
    const existing = await prisma.adSpend.findFirst({
      where: {
        adAccountId: adAccount.id,
        date,
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
          campaignId,
          campaignName: insight.campaign_name || null,
          adSetId,
          adSetName: insight.adset_name || null,
        },
      })
    }

    count++
  }

  return count
}

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
  if (!GOOGLE_ADS_DEVELOPER_TOKEN) {
    throw new Error('Google Ads developer token not configured')
  }

  let accessToken = decrypt(adAccount.accessTokenEncrypted)

  // Check if token needs refresh
  const account = await prisma.adAccount.findUnique({
    where: { id: adAccount.id },
    select: { tokenExpiresAt: true },
  })

  if (account?.tokenExpiresAt && account.tokenExpiresAt < new Date()) {
    // Token expired, refresh it
    if (!adAccount.refreshTokenEncrypted) {
      throw new Error('Token expired and no refresh token available')
    }

    const refreshToken = decrypt(adAccount.refreshTokenEncrypted)
    const newTokens = await refreshGoogleAccessToken(
      refreshToken,
      GOOGLE_ADS_CLIENT_ID,
      GOOGLE_ADS_CLIENT_SECRET
    )

    accessToken = newTokens.access_token

    // Update stored token
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

  const client = new GoogleAdsClient(accessToken, GOOGLE_ADS_DEVELOPER_TOKEN)
  const metrics = await client.getMetrics(
    adAccount.platformAccountId,
    dateFrom,
    dateTo,
    'campaign'
  )

  let count = 0

  for (const metric of metrics) {
    const roas = metric.cost > 0 ? metric.conversionValue / metric.cost : 0
    const cpc = metric.clicks > 0 ? metric.cost / metric.clicks : 0
    const cpm = metric.impressions > 0 ? (metric.cost / metric.impressions) * 1000 : 0

    const date = new Date(metric.date)
    const campaignId = metric.campaignId || null
    const adSetId = metric.adGroupId || null

    // Find existing record
    const existing = await prisma.adSpend.findFirst({
      where: {
        adAccountId: adAccount.id,
        date,
        campaignId,
        adSetId,
      },
    })

    if (existing) {
      await prisma.adSpend.update({
        where: { id: existing.id },
        data: {
          spend: metric.cost,
          impressions: metric.impressions,
          clicks: metric.clicks,
          conversions: Math.round(metric.conversions),
          revenue: metric.conversionValue,
          roas,
          cpc,
          cpm,
          campaignName: metric.campaignName || null,
          adSetName: metric.adGroupName || null,
        },
      })
    } else {
      await prisma.adSpend.create({
        data: {
          adAccountId: adAccount.id,
          date,
          spend: metric.cost,
          impressions: metric.impressions,
          clicks: metric.clicks,
          conversions: Math.round(metric.conversions),
          revenue: metric.conversionValue,
          roas,
          cpc,
          cpm,
          currency: adAccount.currency,
          campaignId,
          campaignName: metric.campaignName || null,
          adSetId,
          adSetName: metric.adGroupName || null,
        },
      })
    }

    count++
  }

  return count
}
