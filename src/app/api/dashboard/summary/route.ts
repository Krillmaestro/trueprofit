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
  // CALCULATE METRICS USING CALCULATION ENGINE
  // ===========================================

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
    const subtotal = toNumber(order.subtotalPrice)
    const shippingRevenue = toNumber(order.totalShippingPrice)
    const tax = toNumber(order.totalTax)
    const discounts = toNumber(order.totalDiscounts)
    const orderDate = order.processedAt ?? order.createdAt

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

    // ═══════════════════════════════════════════════════════════
    // ADJUST COGS FOR REFUNDED ITEMS
    // When items are returned, reverse the COGS to reflect true cost
    // ═══════════════════════════════════════════════════════════
    for (const refund of order.refunds || []) {
      totalCOGS -= toNumber(refund.totalCOGSReversed)
    }

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
  // USE CALCULATION ENGINE FOR FINAL NUMBERS
  // ===========================================

  // Gross revenue = subtotal + shipping (what customer paid before tax)
  const grossRevenue = simpleGrossRevenue(totalSubtotal, totalShippingRevenue)

  // Net revenue = gross - discounts - refunds
  const netRevenue = simpleNetRevenue(grossRevenue, totalDiscounts, totalRefunds)

  // Revenue ex VAT (basis for profit calculation)
  const revenueExVat = simpleRevenueExVat(netRevenue, totalTax)

  // Gross profit = Revenue ex VAT - COGS
  const grossProfit = simpleGrossProfit(revenueExVat, totalCOGS)

  // Net profit = Gross profit - Payment fees - Shipping cost
  const netProfit = simpleNetProfit(grossProfit, totalPaymentFees, totalShippingCost)

  // Margins
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

  // Total operating costs (EXCLUDING VAT - VAT is pass-through)
  const totalOperatingCosts = fixedCosts + variableCosts + salaries + oneTimeCosts + totalAdSpend

  // Total costs = COGS + Shipping Cost + Payment Fees + Operating Costs
  const totalCosts = totalCOGS + totalShippingCost + totalPaymentFees + totalOperatingCosts

  // Final net profit after all costs
  const finalNetProfit = revenueExVat - totalCosts
  const finalNetMargin = safeMargin(finalNetProfit, revenueExVat)

  // ROAS calculations
  const roas = totalAdSpend > 0 ? adRevenue / totalAdSpend : 0
  const breakEvenRoas = simpleBreakEvenROAS(revenueExVat, totalCOGS + totalPaymentFees + totalShippingCost)
  const isAdsProfitable = roas >= breakEvenRoas

  // ===========================================
  // BUILD DAILY CHART DATA
  // ===========================================

  const dailyOrders = await prisma.order.groupBy({
    by: ['processedAt'],
    where: {
      storeId: { in: storeIds },
      processedAt: dateFilter,
      financialStatus: { in: ['paid', 'partially_paid', 'partially_refunded'] },
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

  const costBreakdown = [
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
      // Revenue metrics
      grossRevenue: roundCurrency(grossRevenue + totalTax), // Include VAT for "Omsättning"
      revenueExVat: roundCurrency(revenueExVat),
      netRevenue: roundCurrency(netRevenue),
      tax: roundCurrency(totalTax),

      // Cost metrics
      totalCosts: roundCurrency(totalCosts),

      // Profit metrics
      grossProfit: roundCurrency(grossProfit),
      netProfit: roundCurrency(finalNetProfit),
      grossMargin: roundPercentage(grossMargin),
      netMargin: roundPercentage(finalNetMargin),

      // Order metrics
      orders: orders.length,
      avgOrderValue: orders.length > 0 ? roundCurrency(revenueExVat / orders.length) : 0,
    },
    breakdown: {
      revenue: {
        gross: roundCurrency(grossRevenue + totalTax),
        subtotal: roundCurrency(totalSubtotal),
        shipping: roundCurrency(totalShippingRevenue),
        discounts: roundCurrency(totalDiscounts),
        refunds: roundCurrency(totalRefunds),
        tax: roundCurrency(totalTax),
        exVat: roundCurrency(revenueExVat),
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
    },
  }
}
