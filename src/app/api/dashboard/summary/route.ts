import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// Default payment fee configuration (used when no gateway-specific config exists)
const DEFAULT_FEE_RATE = 2.9 // percentage
const DEFAULT_FIXED_FEE = 3 // SEK per transaction

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
  const storeFilter: { teamId: string; id?: string } = {
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

  // Get payment fee configurations for the team
  const paymentFeeConfigs = await prisma.paymentFeeConfig.findMany({
    where: {
      storeId: storeId ? storeId : { in: storeIds },
      isActive: true,
    },
  })

  // Create a map of gateway -> fee config
  const feeConfigMap = new Map<string, { percentageFee: number; fixedFee: number }>()
  for (const config of paymentFeeConfigs) {
    feeConfigMap.set(config.gateway.toLowerCase(), {
      percentageFee: Number(config.percentageFee),
      fixedFee: Number(config.fixedFee),
    })
  }

  // Get orders in date range with transactions
  const orders = await prisma.order.findMany({
    where: {
      storeId: { in: storeIds },
      processedAt: dateFilter,
      financialStatus: { in: ['paid', 'partially_paid', 'partially_refunded'] },
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
      refunds: true,
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
  let unmatchedLineItems = 0

  for (const order of orders) {
    totalRevenue += Number(order.subtotalPrice)
    totalShipping += Number(order.totalShippingPrice)
    totalTax += Number(order.totalTax)
    totalDiscounts += Number(order.totalDiscounts)

    // Calculate refunds from actual refund records
    const orderRefunds = order.refunds?.reduce((sum, r) => sum + Number(r.amount), 0) || 0
    totalRefunds += orderRefunds || Number(order.totalRefundAmount)

    // Calculate COGS from line items
    for (const item of order.lineItems) {
      if (item.variant?.cogsEntries?.[0]) {
        const cogsEntry = item.variant.cogsEntries[0]
        totalCOGS += Number(cogsEntry.costPrice) * item.quantity
      } else {
        // Track unmatched line items for reporting
        unmatchedLineItems++
      }
    }

    // Calculate payment fees - prefer actual transaction fees if available
    let orderFees = 0
    if (order.transactions && order.transactions.length > 0) {
      for (const tx of order.transactions) {
        if (tx.paymentFeeCalculated && Number(tx.paymentFee) > 0) {
          // Use actual fee from transaction
          orderFees += Number(tx.paymentFee)
        } else {
          // Calculate based on gateway config or default
          const gateway = tx.gateway?.toLowerCase() || ''
          const config = feeConfigMap.get(gateway)

          if (config) {
            orderFees += (Number(tx.amount) * config.percentageFee / 100) + config.fixedFee
          } else {
            // Use default rates
            orderFees += (Number(tx.amount) * DEFAULT_FEE_RATE / 100) + DEFAULT_FIXED_FEE
          }
        }
      }
    } else {
      // Fallback: estimate fees based on total order price
      orderFees = (Number(order.totalPrice) * DEFAULT_FEE_RATE / 100) + DEFAULT_FIXED_FEE
    }
    totalFees += orderFees
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

  const oneTimeCosts = customCosts
    .filter((c) => c.cost.costType === 'ONE_TIME')
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

  const totalCosts = totalCOGS + totalShipping + totalFees + fixedCosts + variableCosts + salaries + oneTimeCosts + totalAdSpend
  const netProfit = netRevenue - totalCosts

  const profitMargin = netRevenue > 0 ? (netProfit / netRevenue) * 100 : 0
  const grossMargin = netRevenue > 0 ? (grossProfit / netRevenue) * 100 : 0
  const roas = totalAdSpend > 0 ? adRevenue / totalAdSpend : 0

  // Build daily chart data with proper date aggregation
  const dailyOrders = await prisma.order.groupBy({
    by: ['processedAt'],
    where: {
      storeId: { in: storeIds },
      processedAt: dateFilter,
      financialStatus: { in: ['paid', 'partially_paid', 'partially_refunded'] },
    },
    _sum: {
      subtotalPrice: true,
      totalShippingPrice: true,
      totalTax: true,
      totalDiscounts: true,
      totalRefundAmount: true,
    },
    _count: true,
  })

  // Aggregate by date (remove time component)
  const dailyDataMap = new Map<string, {
    date: string
    revenue: number
    shipping: number
    tax: number
    discounts: number
    refunds: number
    orders: number
  }>()

  for (const day of dailyOrders) {
    if (!day.processedAt) continue
    const dateKey = day.processedAt.toISOString().split('T')[0]
    const existing = dailyDataMap.get(dateKey) || {
      date: dateKey,
      revenue: 0,
      shipping: 0,
      tax: 0,
      discounts: 0,
      refunds: 0,
      orders: 0,
    }
    existing.revenue += Number(day._sum.subtotalPrice || 0)
    existing.shipping += Number(day._sum.totalShippingPrice || 0)
    existing.tax += Number(day._sum.totalTax || 0)
    existing.discounts += Number(day._sum.totalDiscounts || 0)
    existing.refunds += Number(day._sum.totalRefundAmount || 0)
    existing.orders += day._count
    dailyDataMap.set(dateKey, existing)
  }

  const dailyData = Array.from(dailyDataMap.values()).sort((a, b) => a.date.localeCompare(b.date))

  // Cost breakdown for pie chart
  const costBreakdown = [
    { name: 'COGS', value: totalCOGS, color: '#3b82f6' },
    { name: 'Shipping', value: totalShipping, color: '#ef4444' },
    { name: 'Payment Fees', value: totalFees, color: '#f59e0b' },
    { name: 'Ad Spend', value: totalAdSpend, color: '#8b5cf6' },
    { name: 'Fixed Costs', value: fixedCosts, color: '#22c55e' },
    { name: 'Salaries', value: salaries, color: '#06b6d4' },
    { name: 'Variable Costs', value: variableCosts, color: '#64748b' },
    { name: 'One-time', value: oneTimeCosts, color: '#14b8a6' },
  ].filter((c) => c.value > 0)

  // Revenue breakdown for analysis
  const revenueBreakdown = {
    gross: totalRevenue,
    discounts: totalDiscounts,
    refunds: totalRefunds,
    shipping: totalShipping,
    tax: totalTax,
    net: netRevenue,
  }

  return NextResponse.json({
    summary: {
      revenue: netRevenue,
      grossRevenue: totalRevenue,
      costs: totalCosts,
      profit: netProfit,
      margin: profitMargin,
      grossMargin,
      orders: orders.length,
      avgOrderValue: orders.length > 0 ? netRevenue / orders.length : 0,
    },
    breakdown: {
      revenue: revenueBreakdown,
      costs: {
        cogs: totalCOGS,
        shipping: totalShipping,
        fees: totalFees,
        adSpend: totalAdSpend,
        fixed: fixedCosts,
        variable: variableCosts,
        salaries,
        oneTime: oneTimeCosts,
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
    dataQuality: {
      totalLineItems: orders.reduce((sum, o) => sum + o.lineItems.length, 0),
      unmatchedLineItems,
      cogsCompleteness: orders.reduce((sum, o) => sum + o.lineItems.length, 0) > 0
        ? ((orders.reduce((sum, o) => sum + o.lineItems.length, 0) - unmatchedLineItems) / orders.reduce((sum, o) => sum + o.lineItems.length, 0)) * 100
        : 100,
    },
  })
}
