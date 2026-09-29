import { afterEach, describe, expect, it, vi } from 'vitest'
import { GoogleAdsClient } from '@/services/ads/google'
import { FacebookAdsClient } from '@/services/ads/facebook'
import { ShopifyClient } from '@/services/shopify/client'
import { normalizeShopDomain } from '@/services/shopify/domain'
import { fetchIntegration } from '@/lib/integration-http'

const json = (data: unknown) => new Response(JSON.stringify(data), { status: 200 })
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })

describe('provider responses', () => {
  it('reads customer info from Google streaming arrays', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json([{ results: [{ customer: { id: '123', descriptiveName: 'Shop', currencyCode: 'SEK', timeZone: 'Europe/Stockholm' } }] }])))
    const info = await new GoogleAdsClient('token', 'developer').getCustomerInfo('123')
    expect(info.currencyCode).toBe('SEK')
    expect(info.descriptiveName).toBe('Shop')
  })
  it('flattens every Google stream chunk and converts micros exactly once', async () => {
    const result = (date: string) => ({ segments: { date }, metrics: { costMicros: '12500000', impressions: '10', clicks: '2', conversions: '1.5', conversionsValue: '100' } })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json([{ results: [result('2026-09-01')] }, { results: [result('2026-09-02')] }])))
    const rows = await new GoogleAdsClient('token', 'developer').getMetrics('123', '2026-09-01', '2026-09-02')
    expect(rows).toHaveLength(2)
    expect(rows[0].cost).toBe(12.5)
    expect(rows[0].conversions).toBe(1.5)
  })
  it('discovers advertiser accounts under a configured Google manager', async () => {
    const fetch = vi.fn().mockResolvedValue(json([{ results: [{ customerClient: { id: '111' } }, { customerClient: { id: '222' } }] }]))
    vi.stubGlobal('fetch', fetch)
    expect(await new GoogleAdsClient('token', 'developer', '123-456-7890').getAccessibleCustomers()).toEqual(['111', '222'])
    expect(fetch.mock.calls[0][0]).toContain('/customers/1234567890/googleAds:searchStream')
    expect(fetch.mock.calls[0][1].headers['login-customer-id']).toBe('1234567890')
  })
  it('accepts empty Google stream results', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json([{}])))
    expect(await new GoogleAdsClient('token', 'developer').getCampaigns('123')).toEqual([])
  })
  it('fetches every Meta page without following a token-bearing next URL', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(json({ data: [{ account_id: '1' }], paging: { next: 'https://graph.facebook.com/next?access_token=secret', cursors: { after: 'page-two' } } }))
      .mockResolvedValueOnce(json({ data: [{ account_id: '2' }] }))
    vi.stubGlobal('fetch', fetch)
    expect(await new FacebookAdsClient('token').getAdAccounts()).toHaveLength(2)
    expect(new URL(fetch.mock.calls[1][0]).searchParams.get('after')).toBe('page-two')
    expect(fetch.mock.calls[1][0]).not.toContain('access_token')
    expect(fetch.mock.calls[1][1].headers.Authorization).toBe('Bearer token')
  })
  it('fails rather than silently returning partial Meta data on a pagination loop', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => json({ data: [], paging: { next: 'next', cursors: { after: 'same' } } })))
    await expect(new FacebookAdsClient('token').getInsights('1', '2026-09-01', '2026-09-02')).rejects.toThrow('did not advance')
  })
  it('sends Shopify updated_at_min only on the first page', async () => {
    const fetch = vi.fn().mockImplementation(async () => json({ orders: [] }))
    vi.stubGlobal('fetch', fetch)
    const client = new ShopifyClient({ shopDomain: 'my-shop', accessToken: 'token' })
    await client.getOrders({ updated_at_min: '2026-09-01T00:00:00Z', status: 'any', limit: 250 })
    await client.getOrders({ updated_at_min: '2026-09-01T00:00:00Z', page_info: 'next', limit: 250 })
    expect(new URL(fetch.mock.calls[0][0]).searchParams.has('updated_at_min')).toBe(true)
    expect(new URL(fetch.mock.calls[1][0]).searchParams.has('updated_at_min')).toBe(false)
  })
  it.each(['shop.myshopify.com.evil.test', 'shop.myshopify.com@evil.test', 'localhost:3000', 'shop/path', 'shop?x=y'])('rejects unsafe Shopify domain %s', input => {
    expect(normalizeShopDomain(input)).toBeNull()
  })
  it('normalizes a pasted Shopify URL', () => {
    expect(normalizeShopDomain(' https://My-Shop.myshopify.com/ ')).toBe('my-shop.myshopify.com')
  })
  it('retries throttling but does not retry invalid credentials', async () => {
    vi.useFakeTimers()
    const fetch = vi.fn().mockResolvedValueOnce(new Response('', { status: 429, headers: { 'retry-after': '1' } })).mockResolvedValueOnce(json({ ok: true }))
    vi.stubGlobal('fetch', fetch)
    const pending = fetchIntegration('https://example.com')
    await vi.runAllTimersAsync()
    expect((await pending).status).toBe(200)
    expect(fetch).toHaveBeenCalledTimes(2)
    fetch.mockReset().mockResolvedValue(new Response('', { status: 401 }))
    expect((await fetchIntegration('https://example.com')).status).toBe(401)
    expect(fetch).toHaveBeenCalledTimes(1)
  })
})
