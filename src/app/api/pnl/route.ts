import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { calculateShippingCost, ShippingTier } from '@/lib/shipping'

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

  const stores = await prisma.store.findMany({
    where: storeFilter,
    include: {
      shippingCostTiers: {
        where: { isActive: true },
        orderBy: { minItems: 'asc' },
      },
    },
  })
  const storeIds = stores.map((s) => s.id)

  // Create a map of store -> shipping tiers for quick lookup
  const storeShippingTiers = new Map<string, ShippingTier[]>()
  for (const store of stores) {
    if (store.shippingCostTiers.length > 0) {
      storeShippingTiers.set(store.id, store.shippingCostTiers.map(t => ({
        minItems: t.minItems,
        maxItems: t.maxItems,
        cost: Number(t.cost),
        costPerAdditionalItem: Number(t.costPerAdditionalItem),
        shippingZone: t.shippingZone,
      })))
    }
  }

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
      cancelledAt: null, // Match dashboard filter
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
              product: {
                select: {
                  isShippingExempt: true,
                },
              },
            },
          },
        },
      },
      transactions: true,
      refunds: true,
    },
  })

  // Revenue breakdown - use totalPrice to match Shopify "Omsättning"
  let grossRevenue = 0  // totalPrice (inkl VAT + frakt)
  let totalDiscounts = 0
  let totalRefunds = 0
  let totalShippingRevenue = 0  // What customer paid for shipping
  let totalTax = 0

  // COGS breakdown
  let productCosts = 0
  let shippingCosts = 0  // Our ACTUAL shipping cost (from tiers)

  // Payment fees by gateway
  const paymentFeesByGateway: Record<string, number> = {}

  for (const order of orders) {
    // Use totalPrice to match Shopify's "Omsättning" (includes tax and shipping)
    grossRevenue += Number(order.totalPrice)
    totalDiscounts += Number(order.totalDiscounts)
    totalShippingRevenue += Number(order.totalShippingPrice)
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

    // Calculate our ACTUAL shipping cost based on configured tiers
    // NOT what the customer paid - that's revenue, not cost!
    const storeTiers = storeShippingTiers.get(order.storeId)
    if (storeTiers && storeTiers.length > 0) {
      const physicalItemCount = order.lineItems.reduce((sum, item) => {
        const isExempt = item.variant?.product?.isShippingExempt || false
        return sum + (isExempt ? 0 : item.quantity)
      }, 0)
      if (physicalItemCount > 0) {
        shippingCosts += calculateShippingCost(physicalItemCount, storeTiers)
      }
    }

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

  // Calculate days in the selected period for monthly cost distribution
  const periodStartMs = periodStart.getTime()
  const periodEndMs = periodEnd.getTime()
  const daysInPeriod = Math.max(1, Math.ceil((periodEndMs - periodStartMs) / (1000 * 60 * 60 * 24)) + 1)
  const daysInMonth = new Date(periodStart.getFullYear(), periodStart.getMonth() + 1, 0).getDate()
  const dailyDistributionFactor = daysInPeriod / daysInMonth

  // Get monthly recurring costs that should be distributed
  const monthlyCosts = await prisma.customCost.findMany({
    where: {
      teamId: teamMember.teamId,
      isActive: true,
      recurrenceType: 'MONTHLY',
    },
  })

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

  // Add distributed monthly costs
  const distributedFixedCosts = monthlyCosts
    .filter((c) => c.costType === 'FIXED')
    .reduce((sum, c) => sum + (Number(c.amount || 0) * dailyDistributionFactor), 0)

  const distributedSalaries = monthlyCosts
    .filter((c) => c.costType === 'SALARY')
    .reduce((sum, c) => sum + (Number(c.amount || 0) * dailyDistributionFactor), 0)

  const totalFixedCosts = Object.values(fixedCostsByName).reduce((sum, v) => sum + v, 0) + distributedFixedCosts
  const totalVariableCosts = Object.values(variableCostsByName).reduce((sum, v) => sum + v, 0)
  totalSalaries += distributedSalaries

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

  // Calculate totals - MATCHING DASHBOARD LOGIC
  // Revenue ex VAT = Gross Revenue - VAT - Refunds - Discounts
  const revenueExVat = grossRevenue - totalTax - totalRefunds - totalDiscounts

  // COGS = Product costs + Our actual shipping costs (NOT what customer paid!)
  const totalCOGS = productCosts + shippingCosts
  const grossProfit = revenueExVat - totalCOGS
  const grossMargin = revenueExVat > 0 ? (grossProfit / revenueExVat) * 100 : 0

  // Operating expenses = all other costs
  const totalOperatingExpenses = totalAdSpend + totalPaymentFees + totalFixedCosts + totalVariableCosts + totalSalaries + totalOneTime
  const operatingProfit = grossProfit - totalOperatingExpenses
  const operatingMargin = revenueExVat > 0 ? (operatingProfit / revenueExVat) * 100 : 0

  // Total costs = COGS + Operating expenses (EXCLUDING VAT - VAT is pass-through)
  const totalCosts = totalCOGS + totalOperatingExpenses

  // Net profit = Revenue ex VAT - All Costs
  // NOTE: Corporate tax (20.6%) is NOT deducted here to match Dashboard
  // Users can see estimated tax separately if needed
  const netProfit = revenueExVat - totalCosts
  const netMargin = revenueExVat > 0 ? (netProfit / revenueExVat) * 100 : 0

  // Estimate taxes for informational purposes only (Swedish corporate tax is 20.6%)
  const taxRate = 0.206
  const estimatedCorporateTax = netProfit > 0 ? netProfit * taxRate : 0
  const profitAfterTax = netProfit - estimatedCorporateTax

  return NextResponse.json({
    period: periodName,
    dateRange: {
      start: periodStart,
      end: periodEnd,
    },
    revenue: {
      grossRevenue,  // Matches Shopify "Omsättning" (totalPrice inkl VAT)
      vat: totalTax,  // VAT is pass-through (not a cost)
      discounts: -totalDiscounts,
      returns: -totalRefunds,
      shippingRevenue: totalShippingRevenue,  // What customer paid for shipping
      revenueExVat,  // Revenue excluding VAT, refunds, discounts - basis for profit
      // Legacy fields for backward compatibility
      grossSales: grossRevenue,
      shipping: totalShippingRevenue,
      tax: totalTax,
      netRevenue: revenueExVat,
    },
    cogs: {
      productCosts,
      shippingCosts,  // Our ACTUAL shipping cost (from tiers)
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
    // Total costs (excluding VAT) - matches Dashboard
    totalCosts,
    // Net profit BEFORE corporate tax - matches Dashboard
    netProfit,
    netMargin: Math.round(netMargin * 10) / 10,
    // Estimated corporate tax (for information only, not deducted from netProfit)
    estimatedTax: {
      rate: taxRate * 100,
      amount: estimatedCorporateTax,
      profitAfterTax,
    },
    orderCount: orders.length,
    avgOrderValue: orders.length > 0 ? revenueExVat / orders.length : 0,
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
