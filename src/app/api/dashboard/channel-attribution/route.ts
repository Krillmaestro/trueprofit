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

  // Get payment fee configurations
  const paymentFeeConfigs = await prisma.paymentFeeConfig.findMany({
    where: {
      storeId: { in: storeIds },
      isActive: true,
    },
  })
  const feeConfigMap = new Map<string, { percentageFee: number; fixedFee: number }>()
  for (const config of paymentFeeConfigs) {
    feeConfigMap.set(config.gateway.toLowerCase(), {
      percentageFee: Number(config.percentageFee),
      fixedFee: Number(config.fixedFee),
    })
  }

  // Default payment fee configuration
  const DEFAULT_FEE_RATE = 2.9 // percentage
  const DEFAULT_FIXED_FEE = 3 // SEK

  // Get orders with line items, transactions for break-even calculation
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
      transactions: {
        select: {
          gateway: true,
          amount: true,
          paymentFee: true,
          paymentFeeCalculated: true,
        },
      },
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
              product: {
                select: { isShippingExempt: true },
              },
            },
          },
        },
      },
    },
  })

  // Get shipping cost tiers
  const shippingTiers = await prisma.shippingCostTier.findMany({
    where: {
      storeId: { in: storeIds },
      isActive: true,
    },
    orderBy: { minItems: 'asc' },
  })

  // Calculate totals for break-even ROAS
  // Break-Even ROAS = 1 / (1 - Variable Cost Ratio)
  // Variable Costs = COGS + Payment Fees + Shipping Costs
  let totalRevenue = 0
  let totalCOGS = 0
  let totalTax = 0
  let totalFees = 0
  let totalShippingCost = 0

  for (const order of orders) {
    totalRevenue += Number(order.totalPrice)
    totalTax += Number(order.totalTax)

    // Calculate COGS and count physical items for shipping
    let physicalItemCount = 0
    for (const item of order.lineItems) {
      if (item.variant?.cogsEntries?.[0]) {
        totalCOGS += Number(item.variant.cogsEntries[0].costPrice) * item.quantity
      }
      // Count physical items for shipping
      const isExempt = item.variant?.product?.isShippingExempt || false
      if (!isExempt) {
        physicalItemCount += item.quantity
      }
    }

    // Calculate payment fees
    if (order.transactions && order.transactions.length > 0) {
      for (const tx of order.transactions) {
        if (tx.paymentFeeCalculated && Number(tx.paymentFee) > 0) {
          totalFees += Number(tx.paymentFee)
        } else {
          const gateway = tx.gateway?.toLowerCase() || ''
          const config = feeConfigMap.get(gateway)
          if (config) {
            totalFees += (Number(tx.amount) * config.percentageFee / 100) + config.fixedFee
          } else {
            totalFees += (Number(tx.amount) * DEFAULT_FEE_RATE / 100) + DEFAULT_FIXED_FEE
          }
        }
      }
    } else {
      totalFees += (Number(order.totalPrice) * DEFAULT_FEE_RATE / 100) + DEFAULT_FIXED_FEE
    }

    // Calculate shipping cost based on tiers
    if (shippingTiers.length > 0 && physicalItemCount > 0) {
      // Find the appropriate tier
      const tier = shippingTiers.find(t =>
        physicalItemCount >= t.minItems &&
        (t.maxItems === null || physicalItemCount <= t.maxItems)
      ) || shippingTiers[shippingTiers.length - 1]

      if (tier) {
        totalShippingCost += Number(tier.cost)
      }
    }
  }

  // Net revenue excluding VAT (for contribution margin calculation)
  const netRevenue = totalRevenue - totalTax

  // Variable costs that scale with each sale
  const variableCosts = totalCOGS + totalFees + totalShippingCost
  const variableCostRatio = netRevenue > 0 ? variableCosts / netRevenue : 0
  const contributionMarginRatio = 1 - variableCostRatio

  // Break-Even ROAS = 1 / Contribution Margin Ratio
  // Example: If variable costs are 45% of revenue, contribution margin is 55%
  // Break-Even ROAS = 1 / 0.55 = 1.82x
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
