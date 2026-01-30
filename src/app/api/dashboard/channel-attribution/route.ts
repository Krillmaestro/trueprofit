import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

/**
 * GET /api/dashboard/channel-attribution
 * Returns ROAS and profit metrics per marketing channel
 */
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const searchParams = request.nextUrl.searchParams
  const startDate = searchParams.get('startDate')
  const endDate = searchParams.get('endDate')

  const teamMember = await prisma.teamMember.findFirst({
    where: { userId: session.user.id },
  })

  if (!teamMember) {
    return NextResponse.json({ error: 'No team found' }, { status: 404 })
  }

  // Default to current month
  const now = new Date()
  const defaultStartDate = new Date(now.getFullYear(), now.getMonth(), 1)
  const defaultEndDate = new Date(now.getFullYear(), now.getMonth() + 1, 0)

  const dateFilter = {
    gte: startDate ? new Date(startDate) : defaultStartDate,
    lte: endDate ? new Date(endDate) : defaultEndDate,
  }

  // Get ad spend grouped by platform
  const adSpendByPlatform = await prisma.adSpend.groupBy({
    by: ['adAccountId'],
    where: {
      adAccount: {
        teamId: teamMember.teamId,
        isActive: true,
      },
      date: dateFilter,
    },
    _sum: {
      spend: true,
      revenue: true,
      impressions: true,
      clicks: true,
      conversions: true,
    },
  })

  // Get ad account details for platform info
  const adAccounts = await prisma.adAccount.findMany({
    where: {
      teamId: teamMember.teamId,
      isActive: true,
    },
    select: {
      id: true,
      platform: true,
      accountName: true,
    },
  })

  const accountMap = new Map(adAccounts.map(a => [a.id, a]))

  // Get stores for the team
  const stores = await prisma.store.findMany({
    where: { teamId: teamMember.teamId },
    select: { id: true },
  })
  const storeIds = stores.map(s => s.id)

  // Get total revenue and COGS for break-even calculation
  const orders = await prisma.order.findMany({
    where: {
      storeId: { in: storeIds },
      processedAt: dateFilter,
      financialStatus: { notIn: ['refunded', 'voided'] },
      cancelledAt: null,
    },
    select: {
      totalPrice: true,
      totalTax: true,
      lineItems: {
        select: {
          quantity: true,
          variant: {
            select: {
              cogsEntries: {
                where: { effectiveTo: null },
                take: 1,
                select: { costPrice: true },
              },
            },
          },
        },
      },
    },
  })

  // Calculate totals for break-even ROAS
  let totalRevenue = 0
  let totalCOGS = 0
  let totalTax = 0

  for (const order of orders) {
    totalRevenue += Number(order.totalPrice)
    totalTax += Number(order.totalTax)
    for (const item of order.lineItems) {
      if (item.variant?.cogsEntries?.[0]) {
        totalCOGS += Number(item.variant.cogsEntries[0].costPrice) * item.quantity
      }
    }
  }

  const netRevenue = totalRevenue - totalTax
  const variableCostRatio = netRevenue > 0 ? totalCOGS / netRevenue : 0
  const contributionMarginRatio = 1 - variableCostRatio
  const breakEvenRoas = contributionMarginRatio > 0 ? 1 / contributionMarginRatio : 999

  // Build channel data
  const channels: Array<{
    platform: string
    name: string
    spend: number
    revenue: number
    profit: number
    roas: number
    breakEvenRoas: number
    isProfitable: boolean
    impressions: number
    clicks: number
    conversions: number
    cpc: number
    cpm: number
    ctr: number
    conversionRate: number
  }> = []

  // Group by platform
  const platformTotals = new Map<string, {
    spend: number
    revenue: number
    impressions: number
    clicks: number
    conversions: number
  }>()

  for (const spend of adSpendByPlatform) {
    const account = accountMap.get(spend.adAccountId)
    if (!account) continue

    const platform = account.platform
    const existing = platformTotals.get(platform) || {
      spend: 0,
      revenue: 0,
      impressions: 0,
      clicks: 0,
      conversions: 0,
    }

    platformTotals.set(platform, {
      spend: existing.spend + Number(spend._sum.spend || 0),
      revenue: existing.revenue + Number(spend._sum.revenue || 0),
      impressions: existing.impressions + Number(spend._sum.impressions || 0),
      clicks: existing.clicks + Number(spend._sum.clicks || 0),
      conversions: existing.conversions + Number(spend._sum.conversions || 0),
    })
  }

  // Convert to array with calculations
  for (const [platform, data] of platformTotals) {
    const roas = data.spend > 0 ? data.revenue / data.spend : 0
    // Profit = Revenue - (Revenue × Variable Cost Ratio) - Ad Spend
    const profit = data.revenue - (data.revenue * variableCostRatio) - data.spend

    channels.push({
      platform,
      name: formatPlatformName(platform),
      spend: data.spend,
      revenue: data.revenue,
      profit,
      roas,
      breakEvenRoas,
      isProfitable: roas >= breakEvenRoas,
      impressions: data.impressions,
      clicks: data.clicks,
      conversions: data.conversions,
      cpc: data.clicks > 0 ? data.spend / data.clicks : 0,
      cpm: data.impressions > 0 ? (data.spend / data.impressions) * 1000 : 0,
      ctr: data.impressions > 0 ? (data.clicks / data.impressions) * 100 : 0,
      conversionRate: data.clicks > 0 ? (data.conversions / data.clicks) * 100 : 0,
    })
  }

  // Sort by spend (highest first)
  channels.sort((a, b) => b.spend - a.spend)

  // Calculate totals
  const totals = {
    spend: channels.reduce((sum, c) => sum + c.spend, 0),
    revenue: channels.reduce((sum, c) => sum + c.revenue, 0),
    profit: channels.reduce((sum, c) => sum + c.profit, 0),
    impressions: channels.reduce((sum, c) => sum + c.impressions, 0),
    clicks: channels.reduce((sum, c) => sum + c.clicks, 0),
    conversions: channels.reduce((sum, c) => sum + c.conversions, 0),
  }

  const totalRoas = totals.spend > 0 ? totals.revenue / totals.spend : 0

  return NextResponse.json({
    channels,
    totals: {
      ...totals,
      roas: totalRoas,
      breakEvenRoas,
      isProfitable: totalRoas >= breakEvenRoas,
      cpc: totals.clicks > 0 ? totals.spend / totals.clicks : 0,
      cpm: totals.impressions > 0 ? (totals.spend / totals.impressions) * 1000 : 0,
    },
    period: {
      startDate: dateFilter.gte.toISOString(),
      endDate: dateFilter.lte.toISOString(),
    },
  })
}

function formatPlatformName(platform: string): string {
  const names: Record<string, string> = {
    FACEBOOK: 'Facebook Ads',
    GOOGLE: 'Google Ads',
    TIKTOK: 'TikTok Ads',
    SNAPCHAT: 'Snapchat Ads',
    PINTEREST: 'Pinterest Ads',
  }
  return names[platform] || platform
}
