import { beforeEach, expect, it, vi } from 'vitest'
const db = vi.hoisted(() => ({ query: vi.fn(), member: vi.fn(), settings: vi.fn(), user: vi.fn(), team: vi.fn(), transaction: vi.fn() }))
vi.mock('@/lib/prisma', () => ({ prisma: { $transaction: db.transaction } }))
import { ensureUserTeam } from '@/lib/user-team'
beforeEach(() => {
  vi.resetAllMocks()
  db.transaction.mockImplementation(async fn => fn({ $queryRaw: db.query, teamMember: { findFirst: db.member }, teamSettings: { upsert: db.settings }, user: { findUniqueOrThrow: db.user }, team: { create: db.team } }))
  db.query.mockResolvedValue([{ id: 'user' }])
})
it('creates membership and settings together for a first login', async () => {
  db.member.mockResolvedValue(null); db.user.mockResolvedValue({ id: 'user', name: 'Person', email: 'person@example.com' })
  db.team.mockResolvedValue({ members: [{ teamId: 'team', userId: 'user', role: 'OWNER' }] })
  expect(await ensureUserTeam('user')).toMatchObject({ teamId: 'team' })
  expect(db.team.mock.calls[0][0].data).toMatchObject({ settings: { create: { defaultCurrency: 'SEK' } }, members: { create: { userId: 'user', role: 'OWNER' } } })
})
it('preserves membership and existing settings on later logins', async () => {
  db.member.mockResolvedValue({ userId: 'user', teamId: 'team', role: 'VIEWER' })
  expect(await ensureUserTeam('user')).toMatchObject({ role: 'VIEWER' })
  expect(db.team).not.toHaveBeenCalled()
  expect(db.settings).toHaveBeenCalledWith({ where: { teamId: 'team' }, update: {}, create: { teamId: 'team' } })
})
