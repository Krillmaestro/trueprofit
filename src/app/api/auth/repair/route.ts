import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { ensureUserTeam } from '@/lib/user-team'

// This endpoint repairs a user's account by creating missing Team and TeamSettings
export async function POST() {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const member = await ensureUserTeam(session.user.id)
    const team = await prisma.team.findUniqueOrThrow({ where: { id: member.teamId }, select: { id: true, name: true } })
    return NextResponse.json({ success: true, message: 'Account is set up correctly', team })
  } catch (error) {
    console.error('Repair error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to repair account' },
      { status: 500 }
    )
  }
}

// GET endpoint to check account status
export async function GET() {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      include: {
        teamMembers: {
          include: {
            team: {
              include: {
                settings: true,
                stores: true,
                adAccounts: true,
              },
            },
          },
        },
      },
    })

    if (!user) {
      return NextResponse.json({
        status: 'error',
        message: 'User not found',
        hasUser: false,
        hasTeam: false,
        hasSettings: false,
      })
    }

    const team = user.teamMembers[0]?.team
    const hasSettings = !!team?.settings

    return NextResponse.json({
      status: team && hasSettings ? 'ok' : 'needs_repair',
      message: team && hasSettings ? 'Account is set up correctly' : 'Account needs repair - call POST /api/auth/repair',
      hasUser: true,
      hasTeam: !!team,
      hasSettings,
      team: team ? {
        id: team.id,
        name: team.name,
        storeCount: team.stores.length,
        adAccountCount: team.adAccounts.length,
      } : null,
    })
  } catch (error) {
    console.error('Status check error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to check status' },
      { status: 500 }
    )
  }
}
