import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// This endpoint repairs a user's account by creating missing Team and TeamSettings
export async function POST() {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const userId = session.user.id
    const userEmail = session.user.email || ''
    const userName = session.user.name || userEmail

    // Check if user exists
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { teamMembers: { include: { team: true } } },
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found in database' }, { status: 404 })
    }

    // Check if user already has a team
    if (user.teamMembers.length > 0) {
      const team = user.teamMembers[0].team

      // Check if team has settings
      const settings = await prisma.teamSettings.findUnique({
        where: { teamId: team.id },
      })

      if (!settings) {
        // Create missing settings
        await prisma.teamSettings.create({
          data: {
            teamId: team.id,
            defaultCurrency: 'SEK',
            timezone: 'Europe/Stockholm',
            vatRate: 25,
          },
        })

        return NextResponse.json({
          success: true,
          message: 'Team settings were missing and have been created',
          team: { id: team.id, name: team.name },
        })
      }

      return NextResponse.json({
        success: true,
        message: 'Account is already set up correctly',
        team: { id: team.id, name: team.name },
      })
    }

    // Create new team for user
    const slug = userEmail.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '-')

    const team = await prisma.team.create({
      data: {
        name: `${userName}'s Team`,
        slug: `${slug}-${Date.now()}`,
        members: {
          create: {
            userId: user.id,
            role: 'OWNER',
          },
        },
        settings: {
          create: {
            defaultCurrency: 'SEK',
            timezone: 'Europe/Stockholm',
            vatRate: 25,
          },
        },
      },
    })

    return NextResponse.json({
      success: true,
      message: 'Team created successfully',
      team: { id: team.id, name: team.name },
    })
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
