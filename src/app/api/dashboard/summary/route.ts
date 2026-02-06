import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { cacheKeys, cacheTTL, getOrCompute } from '@/lib/cache'
import { dashboardSummarySchema } from '@/lib/validation/schemas'
import { createSafeResponse, Errors, logError } from '@/lib/errors/safe-error'
import {
  calculateDashboardSummary,
  simpleGrossRevenue,
  simpleNetRevenue,
  simpleRevenueExVat,
  simpleGrossProfit,
  simpleNetProfit,
  simpleBreakEvenROAS,
  toNumber,
  roundCurrency,
  roundPercentage,
  safeMargin,
} from '@/lib/calculations'
import { getCOGSAtDateFromEntries, validateCOGSCoverage } from '@/lib/calculations/cogs'
import { calculateShippingCost, ShippingTier } from '@/lib/shipping'

// ===========================================
// GET /api/dashboard/summary
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
    }

    const validation = dashboardSummarySchema.safeParse(rawParams)
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

    // Calculate date range
    const now = new Date()
    const dateFilter = {
      gte: params.startDate ?? new Date(now.getFullYear(), now.getMonth(), 1),
      lte: params.endDate ?? new Date(now.getFullYear(), now.getMonth() + 1, 0),
    }

    // Build cache key
    const cacheKey = cacheKeys.dashboardSummary(
      teamMember.teamId,
      dateFilter.gte.toISOString().split('T')[0],
      dateFilter.lte.toISOString().split('T')[0],
      params.storeId ?? undefined
    )

    // Get or compute result
    const result = await getOrCompute(cacheKey, cacheTTL.dashboardSummary, async () => {
      return await computeDashboardSummary(teamMember.teamId, dateFilter, params.storeId ?? null)
    })

    return NextResponse.json(result)
  } catch (error) {
    logError(error, { source: 'dashboard-summary' })
    return createSafeResponse(Errors.internal())
  }
}

// ===========================================
// COMPUTE DASHBOARD SUMMARY
// ===========================================

async function computeDashboardSummary(
  teamId: string,
  dateFilter: { gte: Date; lte: Date },
  storeId: string | null
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

  // Default fee config
  const defaultFeeConfig = { percentageFee: 2.9, fixedFee: 3 }

  // Get orders with all related data
  // IMPORTANT: Include 'refunded' to match Shopify's revenue calculation
  // Also handle null financial_status (some orders may not have this set)
  const orders = await prisma.order.findMany({
    where: {
      storeId: { in: storeIds },
      processedAt: dateFilter,
      OR: [
        { financialStatus: { in: ['paid', 'partially_paid', 'partially_refunded', 'refunded'] } },
        { financialStatus: null },  // Include orders with null status
      ],
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
  // CALCULATE METRICS USING CALCULATION ENGINE
  // ===========================================

  let totalOmsattning = 0  // USE total_price DIRECTLY from Shopify = Omsättning
  let totalSubtotal = 0
  let totalShippingRevenue = 0
  let totalTax = 0
  let totalDiscounts = 0
  let totalRefunds = 0
  let totalCOGS = 0
  let totalShippingCost = 0
  let totalPaymentFees = 0
  let unmatchedLineItems = 0
  let totalLineItems = 0

  for (const order of orders) {
    // CRITICAL: Use totalPrice directly - this IS Shopify's "Omsättning"
    const omsattning = toNumber(order.totalPrice)
    const subtotal = toNumber(order.subtotalPrice)
    const shippingRevenue = toNumber(order.totalShippingPrice)
    const tax = toNumber(order.totalTax)
    const discounts = toNumber(order.totalDiscounts)
    const orderDate = order.processedAt ?? order.createdAt

    totalOmsattning += omsattning
    totalSubtotal += subtotal
    totalShippingRevenue += shippingRevenue
    totalTax += tax
    totalDiscounts += discounts

    // Calculate refunds from refund records (NEVER use increment!)
    const orderRefunds = order.refunds?.reduce((sum, r) => sum + toNumber(r.amount), 0) ?? 0
    totalRefunds += orderRefunds || toNumber(order.totalRefundAmount)

    // Calculate COGS with HISTORICAL lookup
    for (const item of order.lineItems) {
      totalLineItems++
      if (item.variant?.cogsEntries && item.variant.cogsEntries.length > 0) {
        const cogsPrice = getCOGSAtDateFromEntries(item.variant.cogsEntries, orderDate)
        if (cogsPrice !== null) {
          totalCOGS += cogsPrice * item.quantity
        } else {
          unmatchedLineItems++
        }
      } else {
        unmatchedLineItems++
      }
    }

    // Note: COGS adjustment for refunds would require tracking which items were refunded
    // For now, COGS remains based on items sold (refunds reduce revenue but not COGS)

    // Calculate shipping cost (our actual cost, NOT what customer paid)
    const storeTiers = storeShippingTiers.get(order.storeId)
    if (storeTiers && storeTiers.length > 0) {
      const physicalItemCount = order.lineItems.reduce((sum, item) => {
        const isExempt = item.variant?.product?.isShippingExempt || false
        return sum + (isExempt ? 0 : item.quantity)
      }, 0)
      if (physicalItemCount > 0) {
        totalShippingCost += calculateShippingCost(physicalItemCount, storeTiers)
      }
    }

    // Calculate payment fees
    if (order.transactions && order.transactions.length > 0) {
      for (const tx of order.transactions) {
        if (tx.paymentFeeCalculated && toNumber(tx.paymentFee) > 0) {
          totalPaymentFees += toNumber(tx.paymentFee)
        } else {
          const gateway = tx.gateway?.toLowerCase() || ''
          const config = feeConfigMap.get(gateway) ?? defaultFeeConfig
          // CRITICAL: Calculate fees on the amount EXCLUDING VAT
          const txAmount = toNumber(tx.amount)
          totalPaymentFees += (txAmount * config.percentageFee) / 100 + config.fixedFee
        }
      }
    } else {
      // Fallback: estimate based on amount EXCLUDING VAT (payment gateways charge on net amount)
      const amountExVat = toNumber(order.subtotalPrice) +
                          toNumber(order.totalShippingPrice) -
                          toNumber(order.totalDiscounts)
      totalPaymentFees += (amountExVat * defaultFeeConfig.percentageFee) / 100 + defaultFeeConfig.fixedFee
    }
  }

  // ===========================================
  // SHOPIFY DATA STRUCTURE - USING TOTAL_PRICE DIRECTLY
  // ===========================================
  //
  // CRITICAL FIX: Shopify's total_price IS the "Omsättning" directly!
  // We should NOT calculate it from parts - just use total_price.
  //
  // total_price = OMSÄTTNING (what customer actually paid)
  //               This is the authoritative value from Shopify.
  //
  // The other fields are for breakdown purposes only:
  // - subtotal_price = Line items before discounts
  // - total_discounts = Discount amount
  // - total_tax = VAT
  // - total_shipping_price = Shipping fee
  //
  // ===========================================

  // OMSÄTTNING - Use totalPrice DIRECTLY from Shopify (already accumulated above)
  const omsattning = totalOmsattning

  // Calculate Nettoförsäljning (Net Sales) for breakdown display
  // = Bruttoförsäljning - Rabatter - Returer
  const nettoForsaljning = totalSubtotal - totalDiscounts - totalRefunds

  // Revenue ex VAT for profit calculations
  // = Nettoförsäljning + Fraktavgifter (without tax)
  const revenueExVat = nettoForsaljning + totalShippingRevenue

  // Gross revenue (for internal calculations)
  const grossRevenue = totalSubtotal + totalShippingRevenue

  // Net revenue after discounts and refunds
  const netRevenue = grossRevenue - totalDiscounts - totalRefunds

  // Gross profit = Revenue ex VAT - COGS
  const grossProfit = simpleGrossProfit(revenueExVat, totalCOGS)

  // Net profit = Gross profit - Payment fees - Shipping cost
  const netProfit = simpleNetProfit(grossProfit, totalPaymentFees, totalShippingCost)

  // Margins based on revenue ex VAT
  const grossMargin = safeMargin(grossProfit, revenueExVat)
  const netMargin = safeMargin(netProfit, revenueExVat)

  // ===========================================
  // GET OPERATING COSTS
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

  // Get direct cost entries for the period
  const customCostEntries = await prisma.customCostEntry.findMany({
    where: {
      cost: { teamId, isActive: true },
      date: dateFilter,
    },
    include: { cost: true },
  })

  // Calculate costs by type
  const distributedFixedCosts = monthlyCosts
    .filter((c) => c.costType === 'FIXED')
    .reduce((sum, c) => sum + toNumber(c.amount) * dailyDistributionFactor, 0)

  const distributedSalaries = monthlyCosts
    .filter((c) => c.costType === 'SALARY')
    .reduce((sum, c) => sum + toNumber(c.amount) * dailyDistributionFactor, 0)

  const directFixedCosts = customCostEntries
    .filter((c) => c.cost.costType === 'FIXED')
    .reduce((sum, c) => sum + toNumber(c.amount), 0)

  const directVariableCosts = customCostEntries
    .filter((c) => c.cost.costType === 'VARIABLE')
    .reduce((sum, c) => sum + toNumber(c.amount), 0)

  const directSalaries = customCostEntries
    .filter((c) => c.cost.costType === 'SALARY')
    .reduce((sum, c) => sum + toNumber(c.amount), 0)

  const oneTimeCosts = customCostEntries
    .filter((c) => c.cost.costType === 'ONE_TIME')
    .reduce((sum, c) => sum + toNumber(c.amount), 0)

  const fixedCosts = distributedFixedCosts + directFixedCosts
  const variableCosts = directVariableCosts
  const salaries = distributedSalaries + directSalaries

  // Get ad spend
  const adSpend = await prisma.adSpend.aggregate({
    where: {
      adAccount: { teamId },
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

  const totalAdSpend = toNumber(adSpend._sum.spend)
  const adRevenue = toNumber(adSpend._sum.revenue)

  // Total operating costs
  const totalOperatingCosts = fixedCosts + variableCosts + salaries + oneTimeCosts + totalAdSpend

  // ===========================================
  // TOTAL COSTS CALCULATION - MOMS SOM KOSTNAD
  // ===========================================
  // Total costs = COGS + Shipping Cost + Payment Fees + Operating Costs + MOMS
  // USER REQUEST: Moms behandlas som en vanlig kostnad
  // Revenue = Omsättning INKL moms
  const totalCosts = totalCOGS + totalShippingCost + totalPaymentFees + totalOperatingCosts + totalTax

  // ===========================================
  // FINAL NET PROFIT
  // ===========================================
  // Net Profit = Omsättning (inkl moms) - Total Costs (inkl moms)
  const finalNetProfit = omsattning - totalCosts

  // Margin based on omsättning (inkl moms)
  const finalNetMargin = safeMargin(finalNetProfit, omsattning)

  // ROAS calculations
  const roas = totalAdSpend > 0 ? adRevenue / totalAdSpend : 0
  // Break-even ROAS based on variable costs as percentage of revenue
  const variableCostsForRoas = totalCOGS + totalPaymentFees + totalShippingCost
  const breakEvenRoas = simpleBreakEvenROAS(revenueExVat, variableCostsForRoas)
  const isAdsProfitable = roas >= breakEvenRoas

  // ===========================================
  // BUILD DAILY CHART DATA
  // ===========================================

  const dailyOrders = await prisma.order.groupBy({
    by: ['processedAt'],
    where: {
      storeId: { in: storeIds },
      processedAt: dateFilter,
      // Match the same filter as main orders query
      OR: [
        { financialStatus: { in: ['paid', 'partially_paid', 'partially_refunded', 'refunded'] } },
        { financialStatus: null },
      ],
      cancelledAt: null,
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
    existing.revenue += toNumber(day._sum.subtotalPrice) + toNumber(day._sum.totalShippingPrice)
    existing.shipping += toNumber(day._sum.totalShippingPrice)
    existing.tax += toNumber(day._sum.totalTax)
    existing.discounts += toNumber(day._sum.totalDiscounts)
    existing.refunds += toNumber(day._sum.totalRefundAmount)
    existing.orders += day._count
    dailyDataMap.set(dateKey, existing)
  }

  const dailyData = Array.from(dailyDataMap.values()).sort((a, b) => a.date.localeCompare(b.date))

  // ===========================================
  // BUILD COST BREAKDOWN
  // ===========================================

  // Cost breakdown for visualization
  // MOMS är nu inkluderad som kostnad per användarens önskan
  const costBreakdown = [
    { name: 'Moms', value: roundCurrency(totalTax), color: '#ef4444' },
    { name: 'COGS', value: roundCurrency(totalCOGS), color: '#3b82f6' },
    { name: 'Ad Spend', value: roundCurrency(totalAdSpend), color: '#8b5cf6' },
    { name: 'Fraktkostnad', value: roundCurrency(totalShippingCost), color: '#ec4899' },
    { name: 'Betalningsavgifter', value: roundCurrency(totalPaymentFees), color: '#f59e0b' },
    { name: 'Fasta kostnader', value: roundCurrency(fixedCosts), color: '#22c55e' },
    { name: 'Löner', value: roundCurrency(salaries), color: '#06b6d4' },
    { name: 'Variabla kostnader', value: roundCurrency(variableCosts), color: '#64748b' },
    { name: 'Engångskostnader', value: roundCurrency(oneTimeCosts), color: '#14b8a6' },
  ].filter((c) => c.value > 0)

  // ===========================================
  // RETURN RESPONSE
  // ===========================================

  return {
    summary: {
      // Revenue metrics - matching Shopify Analytics exactly
      // "Omsättning" = Nettoförsäljning + Frakt + Moms
      revenue: roundCurrency(omsattning), // Omsättning (matches Shopify)
      grossRevenue: roundCurrency(omsattning), // Same as revenue for backward compatibility
      revenueExVat: roundCurrency(revenueExVat), // Omsättning minus moms
      netRevenue: roundCurrency(netRevenue),
      tax: roundCurrency(totalTax),

      // Cost metrics
      costs: roundCurrency(totalCosts),
      totalCosts: roundCurrency(totalCosts),

      // Profit metrics
      grossProfit: roundCurrency(grossProfit),
      profit: roundCurrency(finalNetProfit),
      netProfit: roundCurrency(finalNetProfit),
      margin: roundPercentage(finalNetMargin),
      grossMargin: roundPercentage(grossMargin),
      netMargin: roundPercentage(finalNetMargin),

      // Order metrics
      orders: orders.length,
      avgOrderValue: orders.length > 0 ? roundCurrency(omsattning / orders.length) : 0,
    },
    breakdown: {
      revenue: {
        // Shopify terminology mapping:
        gross: roundCurrency(omsattning), // Omsättning (total inkl moms)
        subtotal: roundCurrency(totalSubtotal), // Bruttoförsäljning (före rabatter)
        shipping: roundCurrency(totalShippingRevenue), // Fraktavgifter
        discounts: roundCurrency(totalDiscounts), // Rabatter
        refunds: roundCurrency(totalRefunds), // Returer
        tax: roundCurrency(totalTax), // Skatter (moms)
        netSales: roundCurrency(nettoForsaljning), // Nettoförsäljning (Brutto - Rabatter - Returer)
        exVat: roundCurrency(revenueExVat), // Nettoförsäljning + Frakt (utan moms)
        net: roundCurrency(netRevenue),
      },
      costs: {
        cogs: roundCurrency(totalCOGS),
        shippingRevenue: roundCurrency(totalShippingRevenue),
        shippingCost: roundCurrency(totalShippingCost),
        fees: roundCurrency(totalPaymentFees),
        adSpend: roundCurrency(totalAdSpend),
        fixed: roundCurrency(fixedCosts),
        variable: roundCurrency(variableCosts),
        salaries: roundCurrency(salaries),
        oneTime: roundCurrency(oneTimeCosts),
        total: roundCurrency(totalCosts),
      },
      profit: {
        gross: roundCurrency(grossProfit),
        operating: roundCurrency(grossProfit - totalPaymentFees - totalShippingCost),
        net: roundCurrency(finalNetProfit),
      },
    },
    chartData: {
      daily: dailyData,
      costBreakdown,
    },
    ads: {
      spend: roundCurrency(totalAdSpend),
      revenue: roundCurrency(adRevenue),
      roas: roundPercentage(roas * 100) / 100,
      breakEvenRoas: roundPercentage(breakEvenRoas * 100) / 100,
      isAdsProfitable,
      impressions: adSpend._sum.impressions || 0,
      clicks: adSpend._sum.clicks || 0,
      conversions: adSpend._sum.conversions || 0,
      hasData: totalAdSpend > 0,  // Flag to indicate if ads data exists for this period
    },
    period: {
      startDate: dateFilter.gte.toISOString(),
      endDate: dateFilter.lte.toISOString(),
      days: daysInPeriod,
    },
    dataQuality: {
      totalLineItems,
      unmatchedLineItems,
      cogsCompleteness: totalLineItems > 0
        ? roundPercentage(((totalLineItems - unmatchedLineItems) / totalLineItems) * 100)
        : 100,
      cogsWarning: unmatchedLineItems > 0
        ? `${unmatchedLineItems} produkter saknar COGS-data`
        : null,
      adsWarning: totalAdSpend === 0 && orders.length > 0
        ? 'Ingen annonsdata för denna period. Synka historisk data i Ads-inställningarna.'
        : null,
    },
  }
}
