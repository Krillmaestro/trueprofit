import { beforeEach, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
const mocks = vi.hoisted(() => ({
  session: vi.fn(), store: vi.fn(), member: vi.fn(), watermark: vi.fn(),
  orders: vi.fn(), products: vi.fn(), variants: vi.fn(), accounts: vi.fn(), syncAds: vi.fn(),
}))
vi.mock('next-auth', () => ({ getServerSession: mocks.session }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('@/lib/prisma', () => ({ prisma: {
  store: { findFirst: mocks.store, updateMany: mocks.watermark },
  adAccount: { findMany: mocks.accounts },
  teamMember: { findFirst: mocks.member }, productVariant: { findMany: mocks.variants },
} }))
vi.mock('@/lib/sync/ad-account', async importOriginal => ({
  ...await importOriginal<typeof import('@/lib/sync/ad-account')>(), syncAdAccount: mocks.syncAds,
}))
vi.mock('@/lib/encryption', () => ({ decrypt: () => 'test-token' }))
vi.mock('@/lib/rate-limit', () => ({ syncRateLimiter: () => ({ limited: false }), getRateLimitKey: () => '', getRateLimitHeaders: () => ({}) }))
vi.mock('@/services/shopify/client', () => ({ ShopifyClient: class {
  getOrders = mocks.orders
  getProducts = mocks.products
} }))
import { POST, GET as getShopify } from '@/app/api/shopify/sync/route'
import { GET as getHistorical, POST as postHistorical } from '@/app/api/sync/historical/route'
import { GET as getBulk } from '@/app/api/sync/bulk/route'
const request = (body: unknown) => new NextRequest('https://example.com/api/shopify/sync', { method: 'POST', body: JSON.stringify(body) })
beforeEach(() => {
  vi.resetAllMocks()
  mocks.session.mockResolvedValue({ user: { id: 'user' } })
  mocks.store.mockResolvedValue({ id: 'store', shopifyDomain: 'test.myshopify.com', shopifyAccessTokenEncrypted: 'encrypted', lastSyncAt: new Date('2026-09-01') })
  mocks.orders.mockResolvedValue({ data: { orders: [] } })
  mocks.products.mockResolvedValue({ data: { products: [] } })
  mocks.variants.mockResolvedValue([])
})
it('uses update time to import refunds on older orders and preserves the starting watermark', async () => {
  const before = Date.now()
  expect((await POST(request({ storeId: 'store', type: 'orders', incremental: true }))).status).toBe(200)
  expect(mocks.orders).toHaveBeenCalledWith(expect.objectContaining({ updated_at_min: '2026-09-01T00:00:00.000Z' }))
  expect(mocks.orders.mock.calls[0][0]).not.toHaveProperty('created_at_min')
  const watermark = mocks.watermark.mock.calls[0][0].data.lastSyncAt.getTime()
  expect(watermark).toBeGreaterThanOrEqual(before)
  expect(watermark).toBeLessThanOrEqual(Date.now())
})
it('uses creation time for an explicit historical start', async () => {
  await POST(request({ storeId: 'store', type: 'orders', incremental: true, sinceDate: '2025-01-01' }))
  expect(mocks.orders.mock.calls[0][0]).toMatchObject({ created_at_min: '2025-01-01T00:00:00.000Z' })
  expect(mocks.orders.mock.calls[0][0]).not.toHaveProperty('updated_at_min')
})
it('does not advance the order watermark for a product-only import', async () => {
  await POST(request({ storeId: 'store', type: 'products' }))
  expect(mocks.watermark).not.toHaveBeenCalled()
})
it('does not advance the watermark when the provider fails', async () => {
  mocks.orders.mockRejectedValue(new Error('Provider unavailable'))
  expect((await POST(request({ storeId: 'store', type: 'orders' }))).status).toBe(500)
  expect(mocks.watermark).not.toHaveBeenCalled()
})
it('rejects invalid sync parameters before contacting Shopify', async () => {
  for (const body of [{}, { storeId: 'store', type: 'orders', sinceDate: 'invalid' }, { storeId: 'store', type: 'invalid' }]) {
    expect((await POST(request(body))).status).toBe(400)
  }
  expect(mocks.orders).not.toHaveBeenCalled()
})
it('checks membership before exposing historical or bulk job status', async () => {
  mocks.member.mockResolvedValue(null)
  for (const [handler, syncId] of [[getHistorical, 'other-team-historical-123'], [getBulk, 'other-team-bulk-123']] as const) {
    const response = await handler(new NextRequest(`https://example.com/api/sync?syncId=${syncId}`))
    expect(response.status).toBe(404)
    expect(mocks.member).toHaveBeenLastCalledWith({ where: { teamId: 'other-team', userId: 'user' }, select: { teamId: true } })
  }
})
it('checks store ownership before exposing Shopify job status', async () => {
  mocks.store.mockResolvedValue(null)
  expect((await getShopify(new NextRequest('https://example.com/api/shopify/sync?syncId=other-store-123'))).status).toBe(404)
  expect(mocks.store).toHaveBeenCalledWith({ where: { id: 'other-store', team: { members: { some: { userId: 'user' } } } }, select: { id: true } })
})
it('rejects reversed or malformed historical ranges', async () => {
  for (const endDate of ['bad', '2025-01-01']) {
    expect((await postHistorical(request({ startDate: '2026-09-01', endDate }))).status).toBe(400)
  }
})

it('routes historical direct Google Ads and Sheets imports through the shared sync implementation', async () => {
  const accounts = [
    { id: 'direct', platform: 'GOOGLE', platformAccountId: '123456', accessTokenEncrypted: 'token' },
    { id: 'sheet', platform: 'GOOGLE', platformAccountId: 'sheets:test', accessTokenEncrypted: 'token' },
  ]
  mocks.member.mockResolvedValue({ teamId: 'team' })
  mocks.accounts.mockResolvedValue(accounts)
  mocks.syncAds.mockResolvedValue({ success: true, count: 1 })
  const response = await postHistorical(request({ startDate: '2026-09-01', endDate: '2026-09-02', syncShopify: false, background: false }))
  expect((await response.json()).success).toBe(true)
  for (const account of accounts) expect(mocks.syncAds).toHaveBeenCalledWith(account, '2026-09-01', '2026-09-02')
})
it('reports historical provider failures without claiming success', async () => {
  mocks.member.mockResolvedValue({ teamId: 'team' })
  mocks.accounts.mockResolvedValue([{ id: 'direct', platform: 'GOOGLE', accessTokenEncrypted: 'token' }])
  mocks.syncAds.mockResolvedValue({ success: false, count: 0, error: 'Reconnect Google' })
  const response = await postHistorical(request({ startDate: '2026-09-01', endDate: '2026-09-02', syncShopify: false, background: false }))
  expect(await response.json()).toMatchObject({ success: false, summary: { failed: 1 } })
})
