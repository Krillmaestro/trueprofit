/**
 * TrueProfit Calculation Engine
 * The CORE calculation module - ALL financial calculations go through here
 *
 * CRITICAL RULES:
 * 1. VAT is NEVER double-counted
 * 2. Payment fees are calculated on amount EXCLUDING VAT
 * 3. Shipping is NOT part of COGS - it's an Operating Expense
 * 4. Refunds reduce revenue, they don't increase costs
 * 5. Negative values are NEVER converted with Math.abs()
 * 6. All calculations use historical COGS at order date
 */

import {
  OrderForCalculation,
  PaymentFeeConfig,
  ShippingCostTier,
  CalculationConfig,
  RevenueBreakdown,
  CostBreakdown,
  ProfitBreakdown,
  DashboardSummary,
  DataQuality,
  CalculationWarning,
  CalculationResult,
  DateRange,
  toNumber,
  roundCurrency,
  roundPercentage,
  safeMargin,
  safePercentage,
  COGSData,
} from './types'

// Re-export helper functions for convenience
export { toNumber, roundCurrency, roundPercentage, safeMargin, safePercentage } from './types'

// ===========================================
// SIMPLE ARITHMETIC HELPERS
// For use in API routes with individual values
// ===========================================

/**
 * Simple gross revenue calculation (subtotal + shipping)
 */
export function simpleGrossRevenue(subtotal: number, shipping: number): number {
  return roundCurrency(subtotal + shipping)
}

/**
 * Simple net revenue calculation (gross - discounts - refunds)
 */
export function simpleNetRevenue(grossRevenue: number, discounts: number, refunds: number): number {
  return roundCurrency(grossRevenue - discounts - refunds)
}

/**
 * Simple revenue ex VAT calculation
 */
export function simpleRevenueExVat(netRevenue: number, tax: number): number {
  return roundCurrency(netRevenue - tax)
}

/**
 * Simple gross profit calculation
 */
export function simpleGrossProfit(revenueExVat: number, cogs: number): number {
  return roundCurrency(revenueExVat - cogs)
}

/**
 * Simple net profit calculation
 */
export function simpleNetProfit(
  grossProfit: number,
  paymentFees: number,
  shippingCosts: number = 0,
  adSpend: number = 0,
  otherExpenses: number = 0
): number {
  return roundCurrency(grossProfit - paymentFees - shippingCosts - adSpend - otherExpenses)
}

/**
 * Simple break-even ROAS calculation from contribution margin
 */
export function simpleBreakEvenROAS(revenueExVat: number, variableCosts: number): number {
  const contributionMargin = revenueExVat > 0 ? (revenueExVat - variableCosts) / revenueExVat : 0
  if (contributionMargin <= 0) return 999
  return roundCurrency(1 / contributionMargin)
}

import {
  calculateOrderCOGS,
  calculateTotalCOGS,
  validateCOGSCoverage,
  calculateRefundCOGSAdjustment,
} from './cogs'

// ===========================================
// REVENUE CALCULATIONS
// ===========================================

/**
 * Calculate gross revenue (before any deductions)
 */
export function calculateGrossRevenue(orders: OrderForCalculation[]): number {
  let total = 0
  for (const order of orders) {
    // Gross revenue = subtotal + shipping charged to customer
    total += toNumber(order.subtotalPrice) + toNumber(order.totalShippingPrice)
  }
  return roundCurrency(total)
}

/**
 * Calculate total discounts given
 */
export function calculateTotalDiscounts(orders: OrderForCalculation[]): number {
  let total = 0
  for (const order of orders) {
    total += toNumber(order.totalDiscounts)
  }
  return roundCurrency(total)
}

/**
 * Calculate total refunds
 * IMPORTANT: Always calculate from OrderRefund records, not order.totalRefundAmount
 */
export function calculateTotalRefunds(orders: OrderForCalculation[]): number {
  let total = 0
  for (const order of orders) {
    // Sum from refund records for accuracy
    const refundTotal = order.refunds.reduce(
      (sum, refund) => sum + toNumber(refund.amount),
      0
    )
    // Fall back to order field if no refund records
    total += refundTotal > 0 ? refundTotal : toNumber(order.totalRefundAmount)
  }
  return roundCurrency(total)
}

/**
 * Calculate net revenue (gross - discounts - refunds)
 */
export function calculateNetRevenue(
  orders: OrderForCalculation[],
  includeShipping: boolean = true
): number {
  const grossRevenue = calculateGrossRevenue(orders)
  const discounts = calculateTotalDiscounts(orders)
  const refunds = calculateTotalRefunds(orders)

  let netRevenue = grossRevenue - discounts - refunds

  if (!includeShipping) {
    // Subtract shipping revenue if not included
    const shippingRevenue = orders.reduce(
      (sum, order) => sum + toNumber(order.totalShippingPrice),
      0
    )
    netRevenue -= shippingRevenue
  }

  return roundCurrency(netRevenue)
}

/**
 * Calculate total VAT/Tax collected
 */
export function calculateTotalTax(orders: OrderForCalculation[]): number {
  let total = 0
  for (const order of orders) {
    total += toNumber(order.totalTax)
  }
  return roundCurrency(total)
}

/**
 * Calculate revenue excluding VAT
 * CRITICAL: This is the correct revenue figure for profit calculations
 */
export function calculateRevenueExVat(orders: OrderForCalculation[]): number {
  const netRevenue = calculateNetRevenue(orders, true)
  const totalTax = calculateTotalTax(orders)

  // Revenue ex VAT = Net Revenue - Tax
  // The tax is already included in the prices, so we subtract it
  return roundCurrency(netRevenue - totalTax)
}

/**
 * Calculate shipping revenue (what customer paid for shipping)
 */
export function calculateShippingRevenue(orders: OrderForCalculation[]): number {
  let total = 0
  for (const order of orders) {
    total += toNumber(order.totalShippingPrice)
  }
  return roundCurrency(total)
}

/**
 * Calculate complete revenue breakdown
 */
export function calculateRevenueBreakdown(
  orders: OrderForCalculation[]
): RevenueBreakdown {
  const grossRevenue = calculateGrossRevenue(orders)
  const totalDiscounts = calculateTotalDiscounts(orders)
  const totalRefunds = calculateTotalRefunds(orders)
  const netRevenue = grossRevenue - totalDiscounts - totalRefunds
  const totalTax = calculateTotalTax(orders)
  const revenueExVat = netRevenue - totalTax
  const shippingRevenue = calculateShippingRevenue(orders)

  return {
    grossRevenue: roundCurrency(grossRevenue),
    totalDiscounts: roundCurrency(totalDiscounts),
    totalRefunds: roundCurrency(totalRefunds),
    netRevenue: roundCurrency(netRevenue),
    totalTax: roundCurrency(totalTax),
    revenueExVat: roundCurrency(revenueExVat),
    shippingRevenue: roundCurrency(shippingRevenue),
  }
}

// ===========================================
// COST CALCULATIONS
// ===========================================

/**
 * Calculate shipping costs (what we pay to ship)
 * Uses shipping cost tiers if provided, otherwise uses stored values
 */
export function calculateShippingCosts(
  orders: OrderForCalculation[],
  shippingTiers?: ShippingCostTier[]
): number {
  let total = 0

  for (const order of orders) {
    if (shippingTiers && shippingTiers.length > 0) {
      // Calculate from tiers
      const itemCount = order.lineItems.reduce((sum, item) => sum + item.quantity, 0)
      const shippingZone = order.shippingCountry || 'DEFAULT'

      // Find matching tier
      const matchingTier = findShippingTier(itemCount, shippingZone, shippingTiers)
      if (matchingTier) {
        let cost = toNumber(matchingTier.cost)
        // Add per-additional-item cost
        if (itemCount > matchingTier.minItems && matchingTier.costPerAdditionalItem) {
          const additionalItems = itemCount - matchingTier.minItems
          cost += additionalItems * toNumber(matchingTier.costPerAdditionalItem)
        }
        total += cost
      } else {
        // Fallback to stored value
        total += toNumber(order.totalShippingCost)
      }
    } else {
      // Use stored value
      total += toNumber(order.totalShippingCost)
    }
  }

  return roundCurrency(total)
}

/**
 * Find the appropriate shipping tier for an order
 */
function findShippingTier(
  itemCount: number,
  zone: string,
  tiers: ShippingCostTier[]
): ShippingCostTier | null {
  // Filter active tiers
  const activeTiers = tiers.filter(t => t.isActive)

  // First try to find a tier matching the zone
  let matchingTiers = activeTiers.filter(
    t => t.shippingZone === zone || t.shippingZone === null
  )

  // If no zone matches, use all tiers
  if (matchingTiers.length === 0) {
    matchingTiers = activeTiers
  }

  // Find tier that matches item count
  for (const tier of matchingTiers) {
    const minItems = tier.minItems
    const maxItems = tier.maxItems ?? Infinity

    if (itemCount >= minItems && itemCount <= maxItems) {
      return tier
    }
  }

  return null
}

/**
 * Calculate payment processing fees
 * CRITICAL: Fees are calculated on amount EXCLUDING VAT
 */
export function calculatePaymentFees(
  orders: OrderForCalculation[],
  feeConfigs: PaymentFeeConfig[]
): number {
  let totalFees = 0

  for (const order of orders) {
    // Get the primary sale transaction
    const saleTransaction = order.transactions.find(
      t => t.kind === 'sale' && t.status === 'success'
    )

    if (!saleTransaction) continue

    // Find fee config for this gateway
    const feeConfig = feeConfigs.find(
      c => c.gateway.toLowerCase() === saleTransaction.gateway.toLowerCase() && c.isActive
    )

    if (feeConfig) {
      // Calculate fee on the transaction amount
      // IMPORTANT: For correct accounting, fees should be on ex-VAT amount
      // However, payment processors charge on gross amount
      // We calculate on gross but this is a known simplification
      const amount = toNumber(saleTransaction.amount)
      const fee = calculateFee(amount, feeConfig)
      totalFees += fee
    } else {
      // Use stored fee if no config found
      totalFees += toNumber(saleTransaction.paymentFee)
    }
  }

  return roundCurrency(totalFees)
}

/**
 * Calculate fee for a single transaction
 */
function calculateFee(amount: number, config: PaymentFeeConfig): number {
  const percentageFee = toNumber(config.percentageFee)
  const fixedFee = toNumber(config.fixedFee)

  switch (config.feeType) {
    case 'PERCENTAGE_ONLY':
      return amount * percentageFee
    case 'FIXED_ONLY':
      return fixedFee
    case 'PERCENTAGE_PLUS_FIXED':
      return amount * percentageFee + fixedFee
    default:
      return 0
  }
}

/**
 * Calculate complete cost breakdown
 * IMPORTANT: COGS does NOT include shipping - shipping is an operating expense
 */
export function calculateCostBreakdown(
  orders: OrderForCalculation[],
  cogsData: COGSData,
  config: CalculationConfig,
  adSpend: number = 0,
  otherExpenses: number = 0
): CostBreakdown {
  // Calculate COGS from historical data
  const cogsResult = calculateTotalCOGS(orders, cogsData)
  const totalCOGS = cogsResult.totalCOGS

  // Calculate shipping costs (NOT part of COGS)
  const totalShippingCosts = calculateShippingCosts(orders, config.shippingCostTiers)

  // Calculate payment fees
  const totalPaymentFees = calculatePaymentFees(orders, config.paymentFeeConfigs)

  // Total operating costs
  const totalCosts = totalCOGS + totalShippingCosts + totalPaymentFees + adSpend + otherExpenses

  return {
    totalCOGS: roundCurrency(totalCOGS),
    totalShippingCosts: roundCurrency(totalShippingCosts),
    totalPaymentFees: roundCurrency(totalPaymentFees),
    totalAdSpend: roundCurrency(adSpend),
    totalOtherExpenses: roundCurrency(otherExpenses),
    totalCosts: roundCurrency(totalCosts),
  }
}

// ===========================================
// PROFIT CALCULATIONS
// ===========================================

/**
 * Calculate gross profit
 * Gross Profit = Revenue Ex VAT - COGS
 * IMPORTANT: Shipping is NOT included in COGS
 */
export function calculateGrossProfit(
  revenueExVat: number,
  totalCOGS: number
): number {
  // NEVER use Math.abs() - negative profit is valid!
  return roundCurrency(revenueExVat - totalCOGS)
}

/**
 * Calculate net profit
 * Net Profit = Gross Profit - Operating Expenses
 */
export function calculateNetProfit(
  grossProfit: number,
  shippingCosts: number,
  paymentFees: number,
  adSpend: number = 0,
  otherExpenses: number = 0
): number {
  // NEVER use Math.abs() - negative profit is valid!
  return roundCurrency(grossProfit - shippingCosts - paymentFees - adSpend - otherExpenses)
}

/**
 * Calculate profit breakdown with margins
 */
export function calculateProfitBreakdown(
  revenue: RevenueBreakdown,
  costs: CostBreakdown
): ProfitBreakdown {
  const grossProfit = calculateGrossProfit(revenue.revenueExVat, costs.totalCOGS)

  const netProfit = calculateNetProfit(
    grossProfit,
    costs.totalShippingCosts,
    costs.totalPaymentFees,
    costs.totalAdSpend,
    costs.totalOtherExpenses
  )

  // Gross margin = Gross Profit / Revenue Ex VAT
  const grossMargin = safeMargin(grossProfit, revenue.revenueExVat)

  // Net margin = Net Profit / Revenue Ex VAT
  const netMargin = safeMargin(netProfit, revenue.revenueExVat)

  // Contribution margin = (Revenue - Variable Costs) / Revenue
  // Variable costs = COGS + Payment Fees (shipping can be variable too)
  const variableCosts = costs.totalCOGS + costs.totalPaymentFees
  const contributionMargin = safeMargin(
    revenue.revenueExVat - variableCosts,
    revenue.revenueExVat
  )

  return {
    grossProfit: roundCurrency(grossProfit),
    grossMargin: roundPercentage(grossMargin),
    netProfit: roundCurrency(netProfit),
    netMargin: roundPercentage(netMargin),
    contributionMargin: roundPercentage(contributionMargin),
  }
}

// ===========================================
// DATA QUALITY
// ===========================================

/**
 * Calculate data quality metrics
 */
export function calculateDataQuality(
  orders: OrderForCalculation[],
  cogsData: COGSData
): DataQuality {
  const cogsCoverage = validateCOGSCoverage(orders, cogsData)
  const cogsResult = calculateTotalCOGS(orders, cogsData)

  // Count orders with refunds
  const ordersWithRefunds = orders.filter(
    o => toNumber(o.totalRefundAmount) > 0 || o.refunds.length > 0
  ).length

  // Count cancelled orders (should be excluded)
  const cancelledOrdersExcluded = orders.filter(o => o.cancelledAt !== null).length

  // Count missing COGS products with order count
  const missingProductCounts = new Map<string, number>()
  for (const order of orders) {
    const orderCOGS = cogsResult.orderResults.get(order.id)
    if (!orderCOGS) continue

    for (const item of orderCOGS.lineItemCOGS) {
      if (!item.matched && item.variantId) {
        const count = missingProductCounts.get(item.variantId) || 0
        missingProductCounts.set(item.variantId, count + 1)
      }
    }
  }

  const missingCOGSProducts = cogsCoverage.missingVariants.map(v => ({
    ...v,
    orderCount: missingProductCounts.get(v.variantId) || 0,
  }))

  return {
    cogsMatchRate: cogsResult.aggregateMatchRate,
    cogsMatchedCount: cogsCoverage.variantsWithCOGS,
    cogsMissingCount: cogsCoverage.variantsWithoutCOGS,
    missingCOGSProducts,
    ordersWithRefunds,
    cancelledOrdersExcluded,
  }
}

// ===========================================
// DASHBOARD SUMMARY CALCULATION
// ===========================================

/**
 * Calculate complete dashboard summary
 * This is the main entry point for dashboard data
 */
export function calculateDashboardSummary(
  orders: OrderForCalculation[],
  cogsData: COGSData,
  config: CalculationConfig,
  adSpend: number = 0,
  otherExpenses: number = 0,
  previousPeriodOrders?: OrderForCalculation[]
): CalculationResult<DashboardSummary> {
  const warnings: CalculationWarning[] = []

  // Filter out cancelled orders if configured
  let filteredOrders = orders
  if (config.excludeCancelledOrders) {
    filteredOrders = orders.filter(o => o.cancelledAt === null)
  }

  // Calculate revenue
  const revenue = calculateRevenueBreakdown(filteredOrders)

  // Calculate costs
  const costs = calculateCostBreakdown(
    filteredOrders,
    cogsData,
    config,
    adSpend,
    otherExpenses
  )

  // Calculate profit
  const profit = calculateProfitBreakdown(revenue, costs)

  // Calculate order stats
  const orderCount = filteredOrders.length
  const averageOrderValue = orderCount > 0
    ? roundCurrency(revenue.netRevenue / orderCount)
    : 0

  // Calculate data quality
  const dataQuality = calculateDataQuality(filteredOrders, cogsData)

  // Add warnings based on data quality
  if (dataQuality.cogsMatchRate < 100) {
    warnings.push({
      code: 'INCOMPLETE_COGS',
      message: `${dataQuality.cogsMissingCount} produkter saknar COGS-data. Vinsten kan vara felaktig.`,
      severity: dataQuality.cogsMatchRate < 80 ? 'error' : 'warning',
      affectedItems: dataQuality.missingCOGSProducts.map(p => p.variantId),
    })
  }

  if (dataQuality.cancelledOrdersExcluded > 0) {
    warnings.push({
      code: 'CANCELLED_EXCLUDED',
      message: `${dataQuality.cancelledOrdersExcluded} avbrutna ordrar exkluderade från beräkningen.`,
      severity: 'info',
    })
  }

  // Calculate previous period if provided
  let previousPeriod: DashboardSummary['previousPeriod']
  let trends: DashboardSummary['trends']

  if (previousPeriodOrders && previousPeriodOrders.length > 0) {
    let filteredPrevious = previousPeriodOrders
    if (config.excludeCancelledOrders) {
      filteredPrevious = previousPeriodOrders.filter(o => o.cancelledAt === null)
    }

    const prevRevenue = calculateRevenueBreakdown(filteredPrevious)
    const prevCosts = calculateCostBreakdown(filteredPrevious, cogsData, config, 0, 0)
    const prevProfit = calculateProfitBreakdown(prevRevenue, prevCosts)

    previousPeriod = {
      revenue: prevRevenue,
      costs: prevCosts,
      profit: prevProfit,
      orderCount: filteredPrevious.length,
    }

    // Calculate trends
    trends = {
      revenueChange: safePercentage(
        revenue.netRevenue - prevRevenue.netRevenue,
        prevRevenue.netRevenue
      ),
      profitChange: safePercentage(
        profit.netProfit - prevProfit.netProfit,
        Math.abs(prevProfit.netProfit) || 1
      ),
      orderCountChange: safePercentage(
        orderCount - filteredPrevious.length,
        filteredPrevious.length
      ),
      marginChange: roundPercentage(profit.netMargin - prevProfit.netMargin),
    }
  }

  const summary: DashboardSummary = {
    revenue,
    costs,
    profit,
    orderCount,
    averageOrderValue,
    previousPeriod,
    trends,
  }

  return {
    data: summary,
    warnings,
    dataQuality,
    calculatedAt: new Date(),
    dateRange: {
      startDate: filteredOrders.length > 0
        ? new Date(Math.min(...filteredOrders.map(o => o.shopifyCreatedAt.getTime())))
        : new Date(),
      endDate: filteredOrders.length > 0
        ? new Date(Math.max(...filteredOrders.map(o => o.shopifyCreatedAt.getTime())))
        : new Date(),
    },
  }
}

// ===========================================
// BREAK-EVEN CALCULATIONS
// ===========================================

/**
 * Calculate break-even ROAS (Return on Ad Spend)
 * Break-even ROAS = 1 / Net Margin (as decimal)
 */
export function calculateBreakEvenROAS(netMargin: number): number {
  if (netMargin <= 0) return Infinity
  const marginDecimal = netMargin / 100
  return roundCurrency(1 / marginDecimal)
}

/**
 * Calculate break-even point in revenue
 */
export function calculateBreakEvenRevenue(
  fixedCosts: number,
  contributionMargin: number
): number {
  if (contributionMargin <= 0) return Infinity
  const marginDecimal = contributionMargin / 100
  return roundCurrency(fixedCosts / marginDecimal)
}

// ===========================================
// EXPORT CALCULATIONS MODULE
// ===========================================

export const calculations = {
  // Revenue
  calculateGrossRevenue,
  calculateTotalDiscounts,
  calculateTotalRefunds,
  calculateNetRevenue,
  calculateTotalTax,
  calculateRevenueExVat,
  calculateShippingRevenue,
  calculateRevenueBreakdown,

  // Costs
  calculateShippingCosts,
  calculatePaymentFees,
  calculateCostBreakdown,

  // Profit
  calculateGrossProfit,
  calculateNetProfit,
  calculateProfitBreakdown,

  // Data Quality
  calculateDataQuality,

  // Dashboard
  calculateDashboardSummary,

  // Break-even
  calculateBreakEvenROAS,
  calculateBreakEvenRevenue,
}

export default calculations
