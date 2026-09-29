import { beforeEach, describe, expect, it, vi } from 'vitest'
import crypto from 'node:crypto'
import { NextRequest } from 'next/server'
const mocks = vi.hoisted(() => ({
  ensureTeam: vi.fn(), store: vi.fn(), getToken: vi.fn(),
  processed: vi.fn(), mark: vi.fn(), query: vi.fn(), membership: vi.fn(), settings: vi.fn(), user: vi.fn(), team: vi.fn(),
}))
vi.mock('@/lib/config', () => ({}))
vi.mock('@/lib/prisma', () => ({ prisma: { store: { findUnique: mocks.store } } }))
vi.mock('@/lib/user-team', () => ({ ensureUserTeam: mocks.ensureTeam }))
vi.mock('next-auth/jwt', () => ({ getToken: mocks.getToken }))
import { authOptions } from '@/lib/auth'
import { middleware } from '@/middleware'
import { verifyWebhookHMAC, generateWebhookId, isWebhookProcessed, markWebhookProcessed } from '@/lib/webhooks/handler'
import { POST as disabledPasswordSetup } from '@/app/api/setup-password/route'

beforeEach(() => vi.clearAllMocks())
describe('login lifecycle and webhook ingress', () => {
  it('provisions a persisted user at sign-in event time, not before Google creates the user', async () => {
    expect(authOptions.callbacks?.signIn).toBeUndefined()
    await authOptions.events!.signIn!({ user: { id: 'persisted-user' }, account: null })
    expect(mocks.ensureTeam).toHaveBeenCalledWith('persisted-user')
  })
  it('does not make the public password setup endpoint usable', async () => {
    const response = await disabledPasswordSetup()
    expect(response.status).toBe(410)
  })
  it('lets Shopify reach signature verification without a browser session', async () => {
    const response = await middleware(new NextRequest('https://app.example/api/shopify/webhooks', { method: 'POST' }))
    expect(response.headers.get('location')).toBeNull()
    expect(mocks.getToken).not.toHaveBeenCalled()
  })
  it('keeps other Shopify endpoints protected', async () => {
    mocks.getToken.mockResolvedValue(null)
    const response = await middleware(new NextRequest('https://app.example/api/shopify/sync', { method: 'POST' }))
    expect(response.headers.get('location')).toContain('/login')
  })
  it('accepts valid webhook signatures and rejects forged and malformed ones', () => {
    const body = '{"id":1}'
    const signature = crypto.createHmac('sha256', 'test-secret').update(body).digest('base64')
    expect(verifyWebhookHMAC(body, signature, 'test-secret')).toBe(true)
    expect(verifyWebhookHMAC('{"id":2}', signature, 'test-secret')).toBe(false)
    expect(verifyWebhookHMAC(body, '', 'test-secret')).toBe(false)
  })
  it('distinguishes successive updates to one order and permits retry after failure', async () => {
    const one = generateWebhookId('orders/updated', 'test.myshopify.com', { id: 1, updated_at: '2026-09-01' })
    const two = generateWebhookId('orders/updated', 'test.myshopify.com', { id: 1, updated_at: '2026-09-02' })
    expect(one).not.toBe(two)
    await markWebhookProcessed(one, 'orders/updated', 'store', {}, 'FAILED')
    expect(await isWebhookProcessed(one)).toBe(false)
    await markWebhookProcessed(one, 'orders/updated', 'store', {}, 'PROCESSED')
    expect(await isWebhookProcessed(one)).toBe(true)
  })
})
