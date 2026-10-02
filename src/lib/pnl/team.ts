import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { PnLSettings, resolvePnLSettings } from './settings'

/** Team of the signed-in user, or null when not signed in / no team. */
export async function getSessionTeamId(): Promise<string | null> {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return null
  const member = await prisma.teamMember.findFirst({ where: { userId: session.user.id } })
  return member?.teamId ?? null
}

export async function loadPnLSettings(teamId: string): Promise<PnLSettings> {
  const row = await prisma.teamSettings.findUnique({ where: { teamId }, select: { pnlSettings: true } })
  return resolvePnLSettings(row?.pnlSettings)
}
