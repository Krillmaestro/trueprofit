import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const searchParams = request.nextUrl.searchParams
  const dateFrom = searchParams.get('dateFrom')
  const dateTo = searchParams.get('dateTo')

  try {
    const teamMember = await prisma.teamMember.findFirst({
      where: { userId: session.user.id },
    })

    if (!teamMember) {
      return NextResponse.json({ spends: [] })
    }

    // Default to last 30 days if no dates provided
    const startDate = dateFrom ? new Date(dateFrom) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    const endDate = dateTo ? new Date(dateTo) : new Date()

    const spends = await prisma.adSpend.findMany({
      where: {
        adAccount: {
          teamId: teamMember.teamId,
        },
        date: {
          gte: startDate,
          lte: endDate,
        },
      },
      include: {
        adAccount: {
          select: {
            platform: true,
          },
        },
      },
      orderBy: {
        date: 'desc',
      },
    })

    // Transform data to include platform at top level
    const transformedSpends = spends.map(spend => ({
      id: spend.id,
      date: spend.date.toISOString(),
      campaignId: spend.campaignId,
      campaignName: spend.campaignName,
      adSetId: spend.adSetId,
      adSetName: spend.adSetName,
      spend: Number(spend.spend),
      impressions: spend.impressions,
      clicks: spend.clicks,
      conversions: spend.conversions,
      revenue: Number(spend.revenue),
      roas: Number(spend.roas),
      cpc: Number(spend.cpc),
      cpm: Number(spend.cpm),
      currency: spend.currency,
      platform: spend.adAccount.platform,
    }))

    return NextResponse.json({ spends: transformedSpends })
  } catch (error) {
    console.error('Failed to fetch ad spend:', error)
    return NextResponse.json({ error: 'Failed to fetch ad spend' }, { status: 500 })
  }
}
