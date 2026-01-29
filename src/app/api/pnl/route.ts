import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// Default payment fee configuration
const DEFAULT_FEE_RATE = 2.9
const DEFAULT_FIXED_FEE = 3

// GET /api/pnl - Get P&L report data
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const searchParams = request.nextUrl.searchParams
  const startDate = searchParams.get('startDate')
  const endDate = searchParams.get('endDate')
  const storeId = searchParams.get('storeId')
  const periodType = searchParams.get('periodType') || 'month' // month, quarter, year

  const teamMember = await prisma.teamMember.findFirst({
    where: { userId: session.user.id },
  })

  if (!teamMember) {
    return NextResponse.json({ error: 'No team found' }, { status: 404 })
  }

  // Calculate date range based on period type
  const now = new Date()
  let periodStart: Date
  let periodEnd: Date
  let periodName: string

  if (startDate && endDate) {
    periodStart = new Date(startDate)
    periodEnd = new Date(endDate)
    periodName = `${periodStart.toLocaleDateString('sv-SE')} - ${periodEnd.toLocaleDateString('sv-SE')}`
  } else {
    switch (periodType) {
      case 'quarter':
        const quarter = Math.floor(now.getMonth() / 3)
        periodStart = new Date(now.getFullYear(), quarter * 3, 1)
        periodEnd = new Date(now.getFullYear(), (quarter + 1) * 3, 0)
        periodName = `Q${quarter + 1} ${now.getFullYear()}`
        break
      case 'year':
        periodStart = new Date(now.getFullYear(), 0, 1)
        periodEnd = new Date(now.getFullYear(), 11, 31)
        periodName = `${now.getFullYear()}`
        break
      default: // month
        periodStart = new Date(now.getFullYear(), now.getMonth(), 1)
        periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0)
        const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
          'July', 'August', 'September', 'October', 'November', 'December']
        periodName = `${monthNames[now.getMonth()]} ${now.getFullYear()}`
    }
  }

  const dateFilter = { gte: periodStart, lte: periodEnd }

  // Build store filter
  const storeFilter: { teamId: string; id?: string } = {
    teamId: teamMember.teamId,
  }
  if (storeId) {
    storeFilter.id = storeId
  }

  const stores = await prisma.store.findMany({ where: storeFilter })
  const storeIds = stores.map((s) => s.id)

  // Get payment fee configurations
  const paymentFeeConfigs = await prisma.paymentFeeConfig.findMany({
    where: {
      storeId: storeId ? storeId : { in: storeIds },
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

  // Get orders with all related data
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

  // Revenue breakdown
  let grossSales = 0
  let totalDiscounts = 0
  let totalRefunds = 0
  let totalShipping = 0
  let totalTax = 0

  // COGS breakdown
  let productCosts = 0
  let shippingCosts = 0

  // Payment fees by gateway
  const paymentFeesByGateway: Record<string, number> = {}

  for (const order of orders) {
    grossSales += Number(order.subtotalPrice)
    totalDiscounts += Number(order.totalDiscounts)
    totalShipping += Number(order.totalShippingPrice)
    totalTax += Number(order.totalTax)

    // Calculate refunds
    const orderRefunds = order.refunds?.reduce((sum, r) => sum + Number(r.amount), 0) || 0
    totalRefunds += orderRefunds || Number(order.totalRefundAmount)

    // Calculate COGS from line items
    for (const item of order.lineItems) {
      if (item.variant?.cogsEntries?.[0]) {
        const cogsEntry = item.variant.cogsEntries[0]
        productCosts += Number(cogsEntry.costPrice) * item.quantity
      }
    }

    // Shipping costs come from the order's shipping price
    shippingCosts += Number(order.totalShippingPrice)

    // Calculate payment fees by gateway
    if (order.transactions && order.transactions.length > 0) {
      for (const tx of order.transactions) {
        const gateway = tx.gateway?.toLowerCase() || 'other'
        let fee = 0

        if (tx.paymentFeeCalculated && Number(tx.paymentFee) > 0) {
          fee = Number(tx.paymentFee)
        } else {
          const config = feeConfigMap.get(gateway)
          if (config) {
            fee = (Number(tx.amount) * config.percentageFee / 100) + config.fixedFee
          } else {
            fee = (Number(tx.amount) * DEFAULT_FEE_RATE / 100) + DEFAULT_FIXED_FEE
          }
        }

        const gatewayName = normalizeGatewayName(gateway)
        paymentFeesByGateway[gatewayName] = (paymentFeesByGateway[gatewayName] || 0) + fee
      }
    }
  }

  const totalPaymentFees = Object.values(paymentFeesByGateway).reduce((sum, fee) => sum + fee, 0)

  // Get custom costs by type
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

  // Group costs by type and name
  const fixedCostsByName: Record<string, number> = {}
  const variableCostsByName: Record<string, number> = {}
  let totalSalaries = 0
  let totalOneTime = 0

  for (const entry of customCosts) {
    const amount = Number(entry.amount)
    const name = entry.cost.name

    switch (entry.cost.costType) {
      case 'FIXED':
        fixedCostsByName[name] = (fixedCostsByName[name] || 0) + amount
        break
      case 'VARIABLE':
        variableCostsByName[name] = (variableCostsByName[name] || 0) + amount
        break
      case 'SALARY':
        totalSalaries += amount
        break
      case 'ONE_TIME':
        totalOneTime += amount
        break
    }
  }

  const totalFixedCosts = Object.values(fixedCostsByName).reduce((sum, v) => sum + v, 0)
  const totalVariableCosts = Object.values(variableCostsByName).reduce((sum, v) => sum + v, 0)

  // Get ad spend by platform
  const adSpendData = await prisma.adSpend.findMany({
    where: {
      adAccount: {
        teamId: teamMember.teamId,
      },
      date: dateFilter,
    },
    include: {
      adAccount: true,
    },
  })

  const adSpendByPlatform: Record<string, number> = {}
  for (const ad of adSpendData) {
    const platform = ad.adAccount.platform
    adSpendByPlatform[platform] = (adSpendByPlatform[platform] || 0) + Number(ad.spend)
  }
  const totalAdSpend = Object.values(adSpendByPlatform).reduce((sum, v) => sum + v, 0)

  // Calculate totals
  const netRevenue = grossSales - totalDiscounts - totalRefunds
  const totalCOGS = productCosts + shippingCosts
  const grossProfit = netRevenue - totalCOGS
  const grossMargin = netRevenue > 0 ? (grossProfit / netRevenue) * 100 : 0

  const totalOperatingExpenses = totalAdSpend + totalPaymentFees + totalFixedCosts + totalVariableCosts + totalSalaries + totalOneTime
  const operatingProfit = grossProfit - totalOperatingExpenses
  const operatingMargin = netRevenue > 0 ? (operatingProfit / netRevenue) * 100 : 0

  // Estimate taxes (Swedish corporate tax is 20.6%)
  const taxRate = 0.206
  const estimatedTaxes = operatingProfit > 0 ? operatingProfit * taxRate : 0
  const netProfit = operatingProfit - estimatedTaxes
  const netMargin = netRevenue > 0 ? (netProfit / netRevenue) * 100 : 0

  return NextResponse.json({
    period: periodName,
    dateRange: {
      start: periodStart,
      end: periodEnd,
    },
    revenue: {
      grossSales,
      discounts: -totalDiscounts,
      returns: -totalRefunds,
      shipping: totalShipping,
      tax: totalTax,
      netRevenue,
    },
    cogs: {
      productCosts,
      shippingCosts,
      totalCOGS,
    },
    grossProfit,
    grossMargin: Math.round(grossMargin * 10) / 10,
    operatingExpenses: {
      marketing: {
        byPlatform: adSpendByPlatform,
        total: totalAdSpend,
      },
      paymentFees: {
        byGateway: paymentFeesByGateway,
        total: totalPaymentFees,
      },
      fixed: {
        byName: fixedCostsByName,
        salaries: totalSalaries,
        total: totalFixedCosts + totalSalaries,
      },
      variable: {
        byName: variableCostsByName,
        total: totalVariableCosts,
      },
      oneTime: totalOneTime,
      totalOpex: totalOperatingExpenses,
    },
    operatingProfit,
    operatingMargin: Math.round(operatingMargin * 10) / 10,
    taxes: {
      rate: taxRate * 100,
      amount: estimatedTaxes,
    },
    netProfit,
    netMargin: Math.round(netMargin * 10) / 10,
    orderCount: orders.length,
    avgOrderValue: orders.length > 0 ? netRevenue / orders.length : 0,
  })
}

function normalizeGatewayName(gateway: string): string {
  const gatewayMap: Record<string, string> = {
    'stripe': 'Stripe',
    'klarna': 'Klarna',
    'paypal': 'PayPal',
    'shopify_payments': 'Shopify Payments',
    'manual': 'Manual',
    'cash': 'Cash',
    'bank_transfer': 'Bank Transfer',
  }

  return gatewayMap[gateway] || gateway.charAt(0).toUpperCase() + gateway.slice(1)
}
