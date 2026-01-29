import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// GET /api/dashboard/summary - Get dashboard summary data
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const searchParams = request.nextUrl.searchParams
  const startDate = searchParams.get('startDate')
  const endDate = searchParams.get('endDate')
  const storeId = searchParams.get('storeId')

  const teamMember = await prisma.teamMember.findFirst({
    where: { userId: session.user.id },
  })

  if (!teamMember) {
    return NextResponse.json({ error: 'No team found' }, { status: 404 })
  }

  // Default to current month if no dates specified
  const now = new Date()
  const defaultStartDate = new Date(now.getFullYear(), now.getMonth(), 1)
  const defaultEndDate = new Date(now.getFullYear(), now.getMonth() + 1, 0)

  const dateFilter = {
    gte: startDate ? new Date(startDate) : defaultStartDate,
    lte: endDate ? new Date(endDate) : defaultEndDate,
  }

  // Build store filter
  const storeFilter: any = {
    teamId: teamMember.teamId,
  }
  if (storeId) {
    storeFilter.id = storeId
  }

  // Get stores
  const stores = await prisma.store.findMany({
    where: storeFilter,
  })

  const storeIds = stores.map((s) => s.id)

  // Get orders in date range
  const orders = await prisma.order.findMany({
    where: {
      storeId: { in: storeIds },
      processedAt: dateFilter,
      financialStatus: { in: ['paid', 'partially_refunded'] },
    },
    include: {
      lineItems: {
        include: {
          variant: {
            include: {
              cogsEntries: {
                where: { effectiveTo: null },
                take: 1,
              },
            },
          },
        },
      },
      transactions: true,
    },
  })

  // Calculate metrics
  let totalRevenue = 0
  let totalCOGS = 0
  let totalShipping = 0
  let totalFees = 0
  let totalTax = 0
  let totalDiscounts = 0
  let totalRefunds = 0

  for (const order of orders) {
    totalRevenue += Number(order.subtotalPrice)
    totalShipping += Number(order.totalShippingPrice)
    totalTax += Number(order.totalTax)
    totalDiscounts += Number(order.totalDiscounts)
    totalRefunds += Number(order.totalRefundAmount)

    // Calculate COGS from line items
    for (const item of order.lineItems) {
      if (item.variant?.cogsEntries?.[0]) {
        const cogsEntry = item.variant.cogsEntries[0]
        totalCOGS += Number(cogsEntry.costPrice) * item.quantity
      }
    }

    // Estimate payment fees (2.9% + kr 3 per transaction as default)
    // TODO: Move these defaults to a configuration or PaymentFeeConfig lookup
    const feeRate = 2.9
    const fixedFee = 3
    totalFees += (Number(order.totalPrice) * feeRate / 100) + fixedFee
  }

  const netRevenue = totalRevenue - totalDiscounts - totalRefunds
  const grossProfit = netRevenue - totalCOGS - totalShipping
  const operatingProfit = grossProfit - totalFees

  // Get custom costs for the period
  const customCosts = await prisma.customCostEntry.findMany({
    where: {
      cost: {
        teamId: teamMember.teamId,
        isActive: true,
      },
      date: dateFilter,
    },
    include: {
      cost: true,
    },
  })

  const fixedCosts = customCosts
    .filter((c) => c.cost.costType === 'FIXED')
    .reduce((sum, c) => sum + Number(c.amount), 0)

  const variableCosts = customCosts
    .filter((c) => c.cost.costType === 'VARIABLE')
    .reduce((sum, c) => sum + Number(c.amount), 0)

  const salaries = customCosts
    .filter((c) => c.cost.costType === 'SALARY')
    .reduce((sum, c) => sum + Number(c.amount), 0)

  // Get ad spend for the period
  const adSpend = await prisma.adSpend.aggregate({
    where: {
      adAccount: {
        teamId: teamMember.teamId,
      },
      date: dateFilter,
    },
    _sum: {
      spend: true,
      impressions: true,
      clicks: true,
      conversions: true,
      revenue: true,
    },
  })

  const totalAdSpend = Number(adSpend._sum.spend || 0)
  const adRevenue = Number(adSpend._sum.revenue || 0)

  const totalCosts = totalCOGS + totalShipping + totalFees + fixedCosts + variableCosts + salaries + totalAdSpend
  const netProfit = netRevenue - totalCosts

  const profitMargin = netRevenue > 0 ? (netProfit / netRevenue) * 100 : 0
  const roas = totalAdSpend > 0 ? adRevenue / totalAdSpend : 0

  // Build daily chart data
  const dailyData = await prisma.order.groupBy({
    by: ['processedAt'],
    where: {
      storeId: { in: storeIds },
      processedAt: dateFilter,
      financialStatus: { in: ['paid', 'partially_refunded'] },
    },
    _sum: {
      subtotalPrice: true,
      totalShippingPrice: true,
      totalTax: true,
      totalDiscounts: true,
    },
    _count: true,
  })

  // Cost breakdown for pie chart
  const costBreakdown = [
    { name: 'COGS', value: totalCOGS, color: '#3b82f6' },
    { name: 'Shipping', value: totalShipping, color: '#ef4444' },
    { name: 'Payment Fees', value: totalFees, color: '#f59e0b' },
    { name: 'Ad Spend', value: totalAdSpend, color: '#8b5cf6' },
    { name: 'Fixed Costs', value: fixedCosts, color: '#22c55e' },
    { name: 'Salaries', value: salaries, color: '#06b6d4' },
    { name: 'Variable Costs', value: variableCosts, color: '#64748b' },
  ].filter((c) => c.value > 0)

  return NextResponse.json({
    summary: {
      revenue: netRevenue,
      grossRevenue: totalRevenue,
      costs: totalCosts,
      profit: netProfit,
      margin: profitMargin,
      orders: orders.length,
      avgOrderValue: orders.length > 0 ? netRevenue / orders.length : 0,
    },
    breakdown: {
      revenue: {
        gross: totalRevenue,
        discounts: totalDiscounts,
        refunds: totalRefunds,
        net: netRevenue,
      },
      costs: {
        cogs: totalCOGS,
        shipping: totalShipping,
        fees: totalFees,
        adSpend: totalAdSpend,
        fixed: fixedCosts,
        variable: variableCosts,
        salaries,
        total: totalCosts,
      },
      profit: {
        gross: grossProfit,
        operating: operatingProfit,
        net: netProfit,
      },
    },
    chartData: {
      daily: dailyData,
      costBreakdown,
    },
    ads: {
      spend: totalAdSpend,
      revenue: adRevenue,
      roas,
      impressions: adSpend._sum.impressions || 0,
      clicks: adSpend._sum.clicks || 0,
      conversions: adSpend._sum.conversions || 0,
    },
    period: {
      startDate: dateFilter.gte,
      endDate: dateFilter.lte,
    },
  })
}
