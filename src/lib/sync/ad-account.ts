import { prisma } from '@/lib/prisma'
import { encrypt, decrypt } from '@/lib/encryption'
import { FacebookAdsClient, extractConversions, extractRoas } from '@/services/ads/facebook'
import { GoogleAdsClient, refreshGoogleAccessToken } from '@/services/ads/google'
import { GoogleSheetsAdsClient } from '@/services/ads/google-sheets'
import type { AdAccount } from '@prisma/client'

export type SyncAccount = Pick<AdAccount, 'id' | 'platform' | 'platformAccountId' | 'accessTokenEncrypted' | 'refreshTokenEncrypted' | 'tokenExpiresAt' | 'currency'>

export function validDateRange(from: unknown, to: unknown): from is string {
  const valid = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value
  return valid(from) && valid(to) && from <= to
}

export async function getGoogleSpend(account: SyncAccount, dateFrom: string, dateTo: string) {
  if (!account.accessTokenEncrypted) throw new Error('Account is not connected')
  const isSheets = account.platformAccountId.startsWith('sheets:')
  let accessToken = decrypt(account.accessTokenEncrypted)
  // Refresh proactively so a token does not expire halfway through a request.
  if (!account.tokenExpiresAt || account.tokenExpiresAt.getTime() < Date.now() + 60_000) {
    if (!account.refreshTokenEncrypted) throw new Error('Google access expired. Reconnect this account.')
    const clientId = (!isSheets && process.env.GOOGLE_ADS_CLIENT_ID) || process.env.GOOGLE_CLIENT_ID || ''
    const clientSecret = (!isSheets && process.env.GOOGLE_ADS_CLIENT_SECRET) || process.env.GOOGLE_CLIENT_SECRET || ''
    if (!clientId || !clientSecret) throw new Error('Google OAuth is not configured')
    const tokens = await refreshGoogleAccessToken(decrypt(account.refreshTokenEncrypted), clientId, clientSecret)
    accessToken = tokens.access_token
    await prisma.adAccount.update({ where: { id: account.id }, data: {
      accessTokenEncrypted: encrypt(accessToken), tokenExpiresAt: new Date(Date.now() + tokens.expires_in * 1000),
    } })
  }
  if (isSheets) {
    if (account.platformAccountId.startsWith('sheets:pending_')) throw new Error('Finish Google Sheets setup first')
    return new GoogleSheetsAdsClient({ accessToken, spreadsheetId: account.platformAccountId.slice(7) }).getAdSpendData(dateFrom, dateTo)
  }
  if (!/^\d+$/.test(account.platformAccountId)) throw new Error('Unknown Google account format. Reconnect this account.')
  const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN
  if (!developerToken) throw new Error('Google Ads developer token is not configured')
  const rows = await new GoogleAdsClient(accessToken, developerToken, process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID)
    .getMetrics(account.platformAccountId, dateFrom, dateTo)
  return rows.map(row => ({ ...row, currency: account.currency }))
}

export async function syncAdAccount(account: SyncAccount, dateFrom: string, dateTo: string) {
  try {
    if (!validDateRange(dateFrom, dateTo)) throw new Error('Invalid date range')
    if (!account.accessTokenEncrypted) throw new Error('Account is not connected')
    let rows: Array<{ date: string; campaignId?: string; campaignName?: string; cost: number; impressions: number; clicks: number; conversions: number; conversionValue: number; currency: string }>
    if (account.platform === 'GOOGLE') {
      rows = await getGoogleSpend(account, dateFrom, dateTo)
    } else if (account.platform === 'FACEBOOK') {
      if (account.tokenExpiresAt && account.tokenExpiresAt <= new Date()) throw new Error('Meta access expired. Reconnect this account.')
      const insights = await new FacebookAdsClient(decrypt(account.accessTokenEncrypted))
        .getInsights(account.platformAccountId, dateFrom, dateTo, 'campaign')
      rows = insights.map(row => ({
        date: row.date_start, campaignId: row.campaign_id, campaignName: row.campaign_name,
        cost: Number(row.spend || 0), impressions: Number(row.impressions || 0), clicks: Number(row.clicks || 0),
        conversions: extractConversions(row.actions), conversionValue: Number(row.spend || 0) * extractRoas(row.purchase_roas),
        currency: account.currency,
      }))
    } else throw new Error('Unsupported ads platform')

    for (const row of rows) {
      if (!validDateRange(row.date, row.date) || row.date < dateFrom || row.date > dateTo ||
          ![row.cost, row.impressions, row.clicks, row.conversions, row.conversionValue].every(Number.isFinite)) {
        throw new Error('The provider returned invalid ad spend data')
      }
    }
    // Bounded transactions avoid timeouts on large histories. The account lock
    // also serializes legacy-null cleanup and writes from overlapping syncs.
    for (let i = 0; i < rows.length; i += 50) {
      await prisma.$transaction(async tx => {
        await tx.$queryRaw`SELECT id FROM ad_accounts WHERE id = ${account.id} FOR UPDATE`
        for (const row of rows.slice(i, i + 50)) {
          const date = new Date(`${row.date}T00:00:00.000Z`)
          const campaignId = row.campaignId || ''
          const adSetId = ''
          await tx.adSpend.deleteMany({ where: {
            adAccountId: account.id, date,
            OR: [
              { campaignId, adSetId: null },
              ...(campaignId === '' ? [{ campaignId: null, adSetId: null }, { campaignId: null, adSetId: '' }] : []),
            ],
          } })
          const data = {
            spend: row.cost, impressions: row.impressions, clicks: row.clicks,
            conversions: Math.round(row.conversions), revenue: row.conversionValue,
            roas: row.cost > 0 ? row.conversionValue / row.cost : 0,
            cpc: row.clicks > 0 ? row.cost / row.clicks : 0,
            cpm: row.impressions > 0 ? row.cost / row.impressions * 1000 : 0,
            currency: row.currency || account.currency, campaignName: row.campaignName || null,
          }
          await tx.adSpend.upsert({
            where: { adAccountId_date_campaignId_adSetId: { adAccountId: account.id, date, campaignId, adSetId } },
            create: { adAccountId: account.id, date, campaignId, adSetId, ...data }, update: data,
          })
        }
      }, { timeout: 30_000 })
    }
    await prisma.adAccount.update({ where: { id: account.id }, data: {
      lastSyncAt: new Date(), lastSyncStatus: 'SUCCESS', syncError: null,
    } })
    return { success: true, count: rows.length }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Ad sync failed'
    await prisma.adAccount.update({ where: { id: account.id }, data: { lastSyncStatus: 'FAILED', syncError: message } })
    return { success: false, count: 0, error: message }
  }
}
