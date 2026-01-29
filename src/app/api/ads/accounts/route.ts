import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const session = await getServerSession(authOptions)

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const teamMember = await prisma.teamMember.findFirst({
      where: { userId: session.user.id },
    })

    if (!teamMember) {
      return NextResponse.json({ accounts: [] })
    }

    const accounts = await prisma.adAccount.findMany({
      where: {
        teamId: teamMember.teamId,
      },
      select: {
        id: true,
        platform: true,
        platformAccountId: true,
        accountName: true,
        isActive: true,
        lastSyncAt: true,
        lastSyncStatus: true,
        currency: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    })

    return NextResponse.json({ accounts })
  } catch (error) {
    console.error('Failed to fetch ad accounts:', error)
    return NextResponse.json({ error: 'Failed to fetch ad accounts' }, { status: 500 })
  }
}
