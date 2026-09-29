import { prisma } from './prisma'

export async function ensureUserTeam(userId: string) {
  return prisma.$transaction(async tx => {
    // Serialize first-login/setup requests for this user across replicas.
    const users = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`
    if (!users.length) throw new Error('User not found')
    const member = await tx.teamMember.findFirst({
      where: { userId }, orderBy: { createdAt: 'asc' },
    })
    if (member) {
      await tx.teamSettings.upsert({ where: { teamId: member.teamId }, update: {}, create: { teamId: member.teamId } })
      return member
    }
    const user = await tx.user.findUniqueOrThrow({ where: { id: userId } })
    const team = await tx.team.create({
      data: {
        name: `${user.name || user.email}'s Team`,
        slug: `personal-${user.id}`,
        settings: { create: { defaultCurrency: 'SEK', timezone: 'Europe/Stockholm', vatRate: 25 } },
        members: { create: { userId, role: 'OWNER' } },
      }, include: { members: true },
    })
    return team.members[0]
  })
}
