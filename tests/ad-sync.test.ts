import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({
  update: vi.fn(), query: vi.fn(), deleteMany: vi.fn(), upsert: vi.fn(), transaction: vi.fn(),
  google: vi.fn(), sheets: vi.fn(), meta: vi.fn(), refresh: vi.fn(),
}))
vi.mock('@/lib/prisma', () => ({ prisma: { adAccount: { update: mocks.update }, $transaction: mocks.transaction } }))
vi.mock('@/lib/encryption', () => ({ encrypt: (s: string) => s, decrypt: (s: string) => s }))
vi.mock('@/services/ads/google', () => ({ GoogleAdsClient: class { getMetrics = mocks.google }, refreshGoogleAccessToken: mocks.refresh }))
vi.mock('@/services/ads/google-sheets', () => ({ GoogleSheetsAdsClient: class { getAdSpendData = mocks.sheets } }))
vi.mock('@/services/ads/facebook', () => ({ FacebookAdsClient: class { getInsights = mocks.meta }, extractConversions: () => 0, extractRoas: () => 0 }))
import { syncAdAccount, getGoogleSpend, validDateRange, type SyncAccount } from '@/lib/sync/ad-account'

const account: SyncAccount = { id: 'account', platform: 'GOOGLE', platformAccountId: '1234567890', accessTokenEncrypted: 'access', refreshTokenEncrypted: 'refresh', tokenExpiresAt: new Date('2099-01-01'), currency: 'SEK' }
const row = { date: '2026-09-01', campaignId: 'campaign', cost: 20, impressions: 100, clicks: 2, conversions: 1, conversionValue: 80, currency: 'SEK' }
beforeEach(() => {
  vi.resetAllMocks()
  vi.stubEnv('GOOGLE_ADS_DEVELOPER_TOKEN', 'developer')
  mocks.transaction.mockImplementation(async fn => fn({ $queryRaw: mocks.query, adSpend: { deleteMany: mocks.deleteMany, upsert: mocks.upsert } }))
})
afterEach(() => vi.unstubAllEnvs())
describe('shared ad sync', () => {
  it('routes direct Google accounts to Ads and prefixed accounts to Sheets', async () => {
    mocks.google.mockResolvedValue([row]); mocks.sheets.mockResolvedValue([row])
    await getGoogleSpend(account, '2026-09-01', '2026-09-02')
    expect(mocks.google).toHaveBeenCalledTimes(1)
    expect(mocks.sheets).not.toHaveBeenCalled()
    await getGoogleSpend({ ...account, platformAccountId: 'sheets:spreadsheet' }, '2026-09-01', '2026-09-02')
    expect(mocks.sheets).toHaveBeenCalledTimes(1)
  })
  it('refreshes direct Ads using Ads credentials, not Sheets credentials', async () => {
    vi.stubEnv('GOOGLE_ADS_CLIENT_ID', 'ads-id'); vi.stubEnv('GOOGLE_ADS_CLIENT_SECRET', 'ads-secret')
    vi.stubEnv('GOOGLE_CLIENT_ID', 'sheets-id'); vi.stubEnv('GOOGLE_CLIENT_SECRET', 'sheets-secret')
    mocks.refresh.mockResolvedValue({ access_token: 'renewed', expires_in: 3600 }); mocks.google.mockResolvedValue([])
    await getGoogleSpend({ ...account, tokenExpiresAt: new Date(0) }, '2026-09-01', '2026-09-02')
    expect(mocks.refresh).toHaveBeenCalledWith('refresh', 'ads-id', 'ads-secret')
    expect(mocks.update.mock.calls[0][0].data.accessTokenEncrypted).toBe('renewed')
  })
  it('uses the same non-null unique key across repeated syncs', async () => {
    mocks.google.mockResolvedValue([row])
    expect(await syncAdAccount(account, '2026-09-01', '2026-09-02')).toEqual({ success: true, count: 1 })
    await syncAdAccount(account, '2026-09-01', '2026-09-02')
    const first = mocks.upsert.mock.calls[0][0]
    expect(first.where).toEqual(mocks.upsert.mock.calls[1][0].where)
    expect(first.create.adSetId).toBe('')
    expect(first.create.roas).toBe(4)
    expect(first.create.date.toISOString()).toBe('2026-09-01T00:00:00.000Z')
  })
  it('fails without writes or a success timestamp when the provider fails', async () => {
    mocks.google.mockRejectedValue(new Error('Provider denied access'))
    expect(await syncAdAccount(account, '2026-09-01', '2026-09-02')).toMatchObject({ success: false })
    expect(mocks.upsert).not.toHaveBeenCalled()
    expect(mocks.update).toHaveBeenCalledWith({ where: { id: account.id }, data: { lastSyncStatus: 'FAILED', syncError: 'Provider denied access' } })
  })
  it('rejects invalid ranges, dates and provider metrics', async () => {
    expect(validDateRange('2026-02-30', '2026-03-02')).toBe(false)
    expect(validDateRange('2026-09-02', '2026-09-01')).toBe(false)
    mocks.google.mockResolvedValue([{ ...row, cost: NaN }])
    expect(await syncAdAccount(account, '2026-09-01', '2026-09-02')).toMatchObject({ success: false })
    expect(mocks.upsert).not.toHaveBeenCalled()
  })
})
