import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

/**
 * DEBUG ENDPOINT - Shows raw ad spend data to debug ad spend calculation
 * GET /api/debug/adspend?date=2025-02-05 (single day)
 * GET /api/debug/adspend?startDate=2025-02-01&endDate=2025-02-28 (date range)
 */
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const searchParams = request.nextUrl.searchParams
  const singleDate = searchParams.get('date')
  const startDate = searchParams.get('startDate')
  const endDate = searchParams.get('endDate')

  const teamMember = await prisma.teamMember.findFirst({
    where: { userId: session.user.id },
  })

  if (!teamMember) {
    return NextResponse.json({ error: 'No team found' }, { status: 404 })
  }

  // Calculate date filter
  let dateFilter: { gte: Date; lte: Date }

  if (singleDate) {
    // Single day - from 00:00:00 to 23:59:59
    const date = new Date(singleDate)
    dateFilter = {
      gte: new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0)),
      lte: new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999)),
    }
  } else {
    const now = new Date()
    dateFilter = {
      gte: startDate ? new Date(startDate) : new Date(now.getFullYear(), now.getMonth(), 1),
      lte: endDate ? new Date(endDate) : new Date(now.getFullYear(), now.getMonth() + 1, 0),
    }
  }

  // Get ad accounts
  const adAccounts = await prisma.adAccount.findMany({
    where: { teamId: teamMember.teamId },
    select: {
      id: true,
      platform: true,
      platformAccountId: true,
      accountName: true,
      lastSyncAt: true,
      lastSyncStatus: true,
      syncError: true,
    },
  })

  // Get ALL ad spend records for the period
  const adSpendRecords = await prisma.adSpend.findMany({
    where: {
      adAccount: { teamId: teamMember.teamId },
      date: dateFilter,
    },
    include: {
      adAccount: {
        select: {
          platform: true,
          accountName: true,
          platformAccountId: true,
        },
      },
    },
    orderBy: [{ date: 'asc' }, { adAccountId: 'asc' }],
  })

  // Group by platform
  const byPlatform: Record<string, { count: number; totalSpend: number; records: typeof adSpendRecords }> = {}

  for (const record of adSpendRecords) {
    const platform = record.adAccount.platform
    if (!byPlatform[platform]) {
      byPlatform[platform] = { count: 0, totalSpend: 0, records: [] }
    }
    byPlatform[platform].count++
    byPlatform[platform].totalSpend += Number(record.spend) || 0
    byPlatform[platform].records.push(record)
  }

  // Group by date
  const byDate: Record<string, { count: number; totalSpend: number }> = {}

  for (const record of adSpendRecords) {
    const dateKey = record.date.toISOString().split('T')[0]
    if (!byDate[dateKey]) {
      byDate[dateKey] = { count: 0, totalSpend: 0 }
    }
    byDate[dateKey].count++
    byDate[dateKey].totalSpend += Number(record.spend) || 0
  }

  // Calculate total
  const totalSpend = adSpendRecords.reduce((sum, r) => sum + (Number(r.spend) || 0), 0)

  // Check for duplicates (same date + account + campaign)
  const seen = new Map<string, number>()
  const duplicates: Array<{ key: string; count: number }> = []

  for (const record of adSpendRecords) {
    const key = `${record.adAccountId}|${record.date.toISOString()}|${record.campaignId || 'null'}|${record.adSetId || 'null'}`
    const count = (seen.get(key) || 0) + 1
    seen.set(key, count)
  }

  for (const [key, count] of seen.entries()) {
    if (count > 1) {
      duplicates.push({ key, count })
    }
  }

  return NextResponse.json({
    period: {
      start: dateFilter.gte.toISOString(),
      end: dateFilter.lte.toISOString(),
      isSingleDay: !!singleDate,
    },

    adAccounts: adAccounts.map(a => ({
      ...a,
      lastSyncAt: a.lastSyncAt?.toISOString(),
    })),

    summary: {
      totalRecords: adSpendRecords.length,
      totalSpend: Math.round(totalSpend * 100) / 100,
      duplicatesFound: duplicates.length,
    },

    byPlatform: Object.fromEntries(
      Object.entries(byPlatform).map(([platform, data]) => [
        platform,
        {
          recordCount: data.count,
          totalSpend: Math.round(data.totalSpend * 100) / 100,
        },
      ])
    ),

    byDate: Object.fromEntries(
      Object.entries(byDate)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, data]) => [
          date,
          {
            recordCount: data.count,
            totalSpend: Math.round(data.totalSpend * 100) / 100,
          },
        ])
    ),

    duplicates: duplicates.length > 0 ? duplicates : 'No duplicates found',

    // Show all records for single day
    records: singleDate
      ? adSpendRecords.map((r) => ({
          id: r.id,
          platform: r.adAccount.platform,
          accountName: r.adAccount.accountName,
          date: r.date.toISOString(),
          spend: Number(r.spend),
          impressions: r.impressions,
          clicks: r.clicks,
          conversions: r.conversions,
          campaignId: r.campaignId,
          campaignName: r.campaignName,
          adSetId: r.adSetId,
          adSetName: r.adSetName,
          createdAt: r.createdAt.toISOString(),
        }))
      : `Use ?date=YYYY-MM-DD to see individual records`,
  })
}
