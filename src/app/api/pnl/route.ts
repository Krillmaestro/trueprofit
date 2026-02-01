import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { pnlReportSchema } from '@/lib/validation/schemas'
import { createSafeResponse, Errors, logError } from '@/lib/errors/safe-error'
import {
  simpleGrossRevenue,
  simpleNetRevenue,
  simpleRevenueExVat,
  simpleGrossProfit,
  toNumber,
  roundCurrency,
  roundPercentage,
  safeMargin,
} from '@/lib/calculations'
import { getCOGSAtDateFromEntries } from '@/lib/calculations/cogs'
import { calculateShippingCost, ShippingTier } from '@/lib/shipping'

// ===========================================
// GET /api/pnl - Get P&L report data
// ===========================================

export async function GET(request: NextRequest) {
  try {
    // Authenticate
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return createSafeResponse(Errors.unauthorized())
    }

    // Parse and validate query params
    const searchParams = request.nextUrl.searchParams
    const rawParams = {
      startDate: searchParams.get('startDate'),
      endDate: searchParams.get('endDate'),
      storeId: searchParams.get('storeId'),
      periodType: searchParams.get('periodType') || 'month',
    }

    const validation = pnlReportSchema.safeParse(rawParams)
    if (!validation.success) {
      return createSafeResponse(
        Errors.badRequest(`Validation failed: ${validation.error.issues[0].message}`)
      )
    }

    const params = validation.data

    // Get team membership
    const teamMember = await prisma.teamMember.findFirst({
      where: { userId: session.user.id },
    })

    if (!teamMember) {
      return createSafeResponse(Errors.notFound('team'))
    }

    // Calculate date range based on period type
    const startDateParsed = params.startDate ? new Date(params.startDate) : null
    const endDateParsed = params.endDate ? new Date(params.endDate) : null

    const { periodStart, periodEnd, periodName } = calculatePeriodDates(
      startDateParsed,
      endDateParsed,
      params.periodType
    )

    const dateFilter = { gte: periodStart, lte: periodEnd }

    // Compute P&L report
    const result = await computePnLReport(teamMember.teamId, dateFilter, params.storeId ?? null, periodName)

    return NextResponse.json(result)
  } catch (error) {
    logError(error, { source: 'pnl-report' })
    return createSafeResponse(Errors.internal())
  }
}

// ===========================================
// PERIOD DATE CALCULATION
// ===========================================

function calculatePeriodDates(
  startDate: Date | null,
  endDate: Date | null,
  periodType: 'month' | 'quarter' | 'year'
): { periodStart: Date; periodEnd: Date; periodName: string } {
  const now = new Date()

  if (startDate && endDate) {
    return {
      periodStart: startDate,
      periodEnd: endDate,
      periodName: `${startDate.toLocaleDateString('sv-SE')} - ${endDate.toLocaleDateString('sv-SE')}`,
    }
  }

  switch (periodType) {
    case 'quarter': {
      const quarter = Math.floor(now.getMonth() / 3)
      return {
        periodStart: new Date(now.getFullYear(), quarter * 3, 1),
        periodEnd: new Date(now.getFullYear(), (quarter + 1) * 3, 0),
        periodName: `Q${quarter + 1} ${now.getFullYear()}`,
      }
    }
    case 'year': {
      return {
        periodStart: new Date(now.getFullYear(), 0, 1),
        periodEnd: new Date(now.getFullYear(), 11, 31),
        periodName: `${now.getFullYear()}`,
      }
    }
    default: {
      const monthNames = [
        'Januari', 'Februari', 'Mars', 'April', 'Maj', 'Juni',
        'Juli', 'Augusti', 'September', 'Oktober', 'November', 'December',
      ]
      return {
        periodStart: new Date(now.getFullYear(), now.getMonth(), 1),
        periodEnd: new Date(now.getFullYear(), now.getMonth() + 1, 0),
        periodName: `${monthNames[now.getMonth()]} ${now.getFullYear()}`,
      }
    }
  }
}

// ===========================================
// COMPUTE P&L REPORT
// ===========================================

async function computePnLReport(
  teamId: string,
  dateFilter: { gte: Date; lte: Date },
  storeId: string | null,
  periodName: string
) {
  // Build store filter
  const storeFilter: { teamId: string; id?: string } = { teamId }
  if (storeId) storeFilter.id = storeId

  // Get stores with shipping tiers
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

  // Create shipping tier map
  const storeShippingTiers = new Map<string, ShippingTier[]>()
  for (const store of stores) {
    if (store.shippingCostTiers.length > 0) {
      storeShippingTiers.set(
        store.id,
        store.shippingCostTiers.map((t) => ({
          minItems: t.minItems,
          maxItems: t.maxItems,
          cost: Number(t.cost),
          costPerAdditionalItem: Number(t.costPerAdditionalItem),
          shippingZone: t.shippingZone,
        }))
      )
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
      percentageFee: toNumber(config.percentageFee),
      fixedFee: toNumber(config.fixedFee),
    })
  }

  const defaultFeeConfig = { percentageFee: 2.9, fixedFee: 3 }

  // Get orders with all related data
  const orders = await prisma.order.findMany({
    where: {
      storeId: { in: storeIds },
      processedAt: dateFilter,
      financialStatus: { in: ['paid', 'partially_paid', 'partially_refunded'] },
      cancelledAt: null,
    },
    include: {
      lineItems: {
        include: {
          variant: {
            include: {
              cogsEntries: {
                orderBy: { effectiveFrom: 'desc' },
              },
              product: {
                select: { isShippingExempt: true },
              },
            },
          },
        },
      },
      transactions: true,
      refunds: true,
    },
  })

  // ===========================================
  // CALCULATE REVENUE BREAKDOWN
  // ===========================================

  let totalSubtotal = 0
  let totalShippingRevenue = 0
  let totalTax = 0
  let totalDiscounts = 0
  let totalRefunds = 0

  // COGS breakdown
  let productCosts = 0
  let shippingCosts = 0

  // Payment fees by gateway
  const paymentFeesByGateway: Record<string, number> = {}

  for (const order of orders) {
    const subtotal = toNumber(order.subtotalPrice)
    const shippingRevenue = toNumber(order.totalShippingPrice)
    const tax = toNumber(order.totalTax)
    const discounts = toNumber(order.totalDiscounts)
    const orderDate = order.processedAt ?? order.createdAt

    totalSubtotal += subtotal
    totalShippingRevenue += shippingRevenue
    totalTax += tax
    totalDiscounts += discounts

    // Calculate refunds from refund records
    const orderRefunds = order.refunds?.reduce((sum, r) => sum + toNumber(r.amount), 0) ?? 0
    totalRefunds += orderRefunds || toNumber(order.totalRefundAmount)

    // Calculate COGS with HISTORICAL lookup
    for (const item of order.lineItems) {
      if (item.variant?.cogsEntries && item.variant.cogsEntries.length > 0) {
        const cogsPrice = getCOGSAtDateFromEntries(item.variant.cogsEntries, orderDate)
        if (cogsPrice !== null) {
          productCosts += cogsPrice * item.quantity
        }
      }
    }

    // ═══════════════════════════════════════════════════════════
    // ADJUST COGS FOR REFUNDED ITEMS
    // When items are returned, reverse the COGS to reflect true cost
    // ═══════════════════════════════════════════════════════════
    for (const refund of order.refunds || []) {
      productCosts -= toNumber(refund.totalCOGSReversed)
    }

    // Calculate our ACTUAL shipping cost based on configured tiers
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

        if (tx.paymentFeeCalculated && toNumber(tx.paymentFee) > 0) {
          fee = toNumber(tx.paymentFee)
        } else {
          const config = feeConfigMap.get(gateway) ?? defaultFeeConfig
          fee = (toNumber(tx.amount) * config.percentageFee) / 100 + config.fixedFee
        }

        const gatewayName = normalizeGatewayName(gateway)
        paymentFeesByGateway[gatewayName] = (paymentFeesByGateway[gatewayName] || 0) + fee
      }
    }
  }

  const totalPaymentFees = Object.values(paymentFeesByGateway).reduce((sum, fee) => sum + fee, 0)

  // ===========================================
  // CALCULATE OPERATING COSTS
  // ===========================================

  const daysInPeriod = Math.max(
    1,
    Math.ceil((dateFilter.lte.getTime() - dateFilter.gte.getTime()) / (1000 * 60 * 60 * 24)) + 1
  )
  const daysInMonth = new Date(dateFilter.gte.getFullYear(), dateFilter.gte.getMonth() + 1, 0).getDate()
  const dailyDistributionFactor = daysInPeriod / daysInMonth

  // Get monthly recurring costs
  const monthlyCosts = await prisma.customCost.findMany({
    where: { teamId, isActive: true, recurrenceType: 'MONTHLY' },
  })

  // Get direct cost entries
  const customCosts = await prisma.customCostEntry.findMany({
    where: {
      cost: { teamId, isActive: true },
      date: dateFilter,
    },
    include: { cost: true },
  })

  // Group costs by type and name
  const fixedCostsByName: Record<string, number> = {}
  const variableCostsByName: Record<string, number> = {}
  let totalSalaries = 0
  let totalOneTime = 0

  for (const entry of customCosts) {
    const amount = toNumber(entry.amount)
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
    .reduce((sum, c) => sum + toNumber(c.amount) * dailyDistributionFactor, 0)

  const distributedSalaries = monthlyCosts
    .filter((c) => c.costType === 'SALARY')
    .reduce((sum, c) => sum + toNumber(c.amount) * dailyDistributionFactor, 0)

  const totalFixedCosts = Object.values(fixedCostsByName).reduce((sum, v) => sum + v, 0) + distributedFixedCosts
  const totalVariableCosts = Object.values(variableCostsByName).reduce((sum, v) => sum + v, 0)
  totalSalaries += distributedSalaries

  // Get ad spend by platform
  const adSpendData = await prisma.adSpend.findMany({
    where: {
      adAccount: { teamId },
      date: dateFilter,
    },
    include: { adAccount: true },
  })

  const adSpendByPlatform: Record<string, number> = {}
  for (const ad of adSpendData) {
    const platform = ad.adAccount.platform
    adSpendByPlatform[platform] = (adSpendByPlatform[platform] || 0) + toNumber(ad.spend)
  }
  const totalAdSpend = Object.values(adSpendByPlatform).reduce((sum, v) => sum + v, 0)

  // ===========================================
  // USE CALCULATION ENGINE FOR FINAL NUMBERS
  // ===========================================

  // Revenue calculations
  // IMPORTANT: Shopify's subtotalPrice is ALREADY excluding VAT!
  const grossRevenue = simpleGrossRevenue(totalSubtotal, totalShippingRevenue)
  const netRevenue = simpleNetRevenue(grossRevenue, totalDiscounts, totalRefunds)
  // Since Shopify's subtotalPrice already EXCLUDES VAT, netRevenue IS the ex-VAT amount
  const revenueExVat = netRevenue  // NOT: simpleRevenueExVat(netRevenue, totalTax)

  // COGS = ONLY product costs (shipping is Operating Expense per Swedish accounting)
  const totalCOGS = productCosts
  const grossProfit = simpleGrossProfit(revenueExVat, totalCOGS)
  const grossMargin = safeMargin(grossProfit, revenueExVat)

  // Operating expenses (includes shipping costs - NOT in COGS!)
  const totalOperatingExpenses = totalAdSpend + totalPaymentFees + shippingCosts + totalFixedCosts + totalVariableCosts + totalSalaries + totalOneTime
  const operatingProfit = grossProfit - totalOperatingExpenses
  const operatingMargin = safeMargin(operatingProfit, revenueExVat)

  // Total costs (EXCLUDING VAT - VAT is pass-through)
  const totalCosts = totalCOGS + totalOperatingExpenses

  // Net profit = Revenue ex VAT - All Costs
  const netProfit = revenueExVat - totalCosts
  const netMargin = safeMargin(netProfit, revenueExVat)

  // Estimated corporate tax (Swedish 20.6%)
  const taxRate = 0.206
  const estimatedCorporateTax = netProfit > 0 ? netProfit * taxRate : 0
  const profitAfterTax = netProfit - estimatedCorporateTax

  // ===========================================
  // BUILD P&L STRUCTURE
  // ===========================================

  return {
    period: periodName,
    dateRange: {
      start: dateFilter.gte,
      end: dateFilter.lte,
    },

    // Revenue Section
    revenue: {
      // Line items
      grossSales: roundCurrency(totalSubtotal + totalTax),
      shippingRevenue: roundCurrency(totalShippingRevenue),
      grossRevenue: roundCurrency(grossRevenue + totalTax), // Matches Shopify "Omsättning"

      // Deductions
      discounts: roundCurrency(-totalDiscounts),
      returns: roundCurrency(-totalRefunds),
      vat: roundCurrency(-totalTax), // VAT is pass-through

      // Net
      netRevenue: roundCurrency(revenueExVat),
    },

    // Cost of Goods Sold Section (Product costs only - shipping is OpEx)
    cogs: {
      productCosts: roundCurrency(productCosts),
      totalCOGS: roundCurrency(totalCOGS),
    },

    // Gross Profit
    grossProfit: roundCurrency(grossProfit),
    grossMargin: roundPercentage(grossMargin),

    // Operating Expenses Section
    operatingExpenses: {
      // Fulfillment costs (shipping)
      fulfillment: {
        shippingCosts: roundCurrency(shippingCosts),
        total: roundCurrency(shippingCosts),
      },
      marketing: {
        byPlatform: Object.fromEntries(
          Object.entries(adSpendByPlatform).map(([k, v]) => [k, roundCurrency(v)])
        ),
        total: roundCurrency(totalAdSpend),
      },
      paymentFees: {
        byGateway: Object.fromEntries(
          Object.entries(paymentFeesByGateway).map(([k, v]) => [k, roundCurrency(v)])
        ),
        total: roundCurrency(totalPaymentFees),
      },
      fixed: {
        byName: Object.fromEntries(
          Object.entries(fixedCostsByName).map(([k, v]) => [k, roundCurrency(v)])
        ),
        distributed: roundCurrency(distributedFixedCosts),
        salaries: roundCurrency(totalSalaries),
        total: roundCurrency(totalFixedCosts + totalSalaries),
      },
      variable: {
        byName: Object.fromEntries(
          Object.entries(variableCostsByName).map(([k, v]) => [k, roundCurrency(v)])
        ),
        total: roundCurrency(totalVariableCosts),
      },
      oneTime: roundCurrency(totalOneTime),
      totalOpex: roundCurrency(totalOperatingExpenses),
    },

    // Operating Profit
    operatingProfit: roundCurrency(operatingProfit),
    operatingMargin: roundPercentage(operatingMargin),

    // Total Costs
    totalCosts: roundCurrency(totalCosts),

    // Net Profit (BEFORE corporate tax)
    netProfit: roundCurrency(netProfit),
    netMargin: roundPercentage(netMargin),

    // Tax Estimate (informational only)
    taxEstimate: {
      rate: roundPercentage(taxRate * 100),
      amount: roundCurrency(estimatedCorporateTax),
      profitAfterTax: roundCurrency(profitAfterTax),
    },

    // Summary metrics
    metrics: {
      orderCount: orders.length,
      avgOrderValue: orders.length > 0 ? roundCurrency(revenueExVat / orders.length) : 0,
      profitPerOrder: orders.length > 0 ? roundCurrency(netProfit / orders.length) : 0,
      daysInPeriod,
      dailyAvgRevenue: roundCurrency(revenueExVat / daysInPeriod),
      dailyAvgProfit: roundCurrency(netProfit / daysInPeriod),
    },
  }
}

// ===========================================
// HELPER FUNCTIONS
// ===========================================

function normalizeGatewayName(gateway: string): string {
  const gatewayMap: Record<string, string> = {
    stripe: 'Stripe',
    klarna: 'Klarna',
    paypal: 'PayPal',
    shopify_payments: 'Shopify Payments',
    manual: 'Manuell',
    cash: 'Kontant',
    bank_transfer: 'Banköverföring',
  }

  return gatewayMap[gateway] || gateway.charAt(0).toUpperCase() + gateway.slice(1)
}
