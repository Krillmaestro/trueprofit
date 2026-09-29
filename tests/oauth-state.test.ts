import { beforeEach, describe, expect, it, vi } from 'vitest'
import crypto from 'node:crypto'
const db = vi.hoisted(() => ({ create: vi.fn(), findUnique: vi.fn(), deleteMany: vi.fn() }))
vi.mock('@/lib/prisma', () => ({ prisma: { verificationToken: db } }))
import { generateStateToken, validateStateToken } from '@/lib/oauth-state'

beforeEach(() => { vi.resetAllMocks(); db.deleteMany.mockResolvedValue({ count: 1 }) })
describe('durable OAuth state', () => {
  it('stores only a hash, and validates in a fresh module instance', async () => {
    const token = await generateStateToken('user', { provider: 'google' })
    const entry = db.create.mock.calls[0][0].data
    expect(entry.token).not.toBe(token)
    expect(entry.token).toBe(crypto.createHash('sha256').update(token).digest('hex'))
    db.findUnique.mockResolvedValue(entry)
    vi.resetModules()
    const fresh = await import('@/lib/oauth-state')
    expect(await fresh.validateStateToken(token, 'user', { provider: 'google' })).toMatchObject({ valid: true })
  })
  it.each([
    ['other-user', { provider: 'google' }],
    ['user', { provider: 'facebook' }],
    ['user', { provider: 'google', shop: 'other.myshopify.com' }],
  ])('rejects a mismatched user/provider/shop', async (user, expected) => {
    const token = await generateStateToken('user', { provider: 'google' })
    db.findUnique.mockResolvedValue(db.create.mock.calls[0][0].data)
    db.deleteMany.mockClear()
    expect(await validateStateToken(token, user, expected)).toMatchObject({ valid: false })
    expect(db.deleteMany).not.toHaveBeenCalled()
  })
  it('rejects expired tokens and a callback that lost the atomic consumption race', async () => {
    const token = await generateStateToken('user', { provider: 'google' })
    const entry = db.create.mock.calls[0][0].data
    db.findUnique.mockResolvedValue({ ...entry, expires: new Date(0) })
    expect(await validateStateToken(token, 'user', { provider: 'google' })).toMatchObject({ valid: false })
    db.findUnique.mockResolvedValue(entry)
    db.deleteMany.mockResolvedValue({ count: 0 })
    expect(await validateStateToken(token, 'user', { provider: 'google' })).toMatchObject({ valid: false })
  })
})
