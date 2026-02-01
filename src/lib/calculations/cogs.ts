/**
 * TrueProfit COGS Service
 * Handles Cost of Goods Sold calculations with historical data support
 */

import {
  COGSEntry,
  COGSLookupResult,
  COGSData,
  COGSSourceType,
  OrderForCalculation,
  OrderLineItemForCalculation,
  toNumber,
  roundCurrency,
} from './types'

// ===========================================
// COGS LOOKUP
// ===========================================

/**
 * Simple COGS lookup from an array of entries at a specific date
 * Used by API routes for direct lookups without full COGSData structure
 *
 * IMPORTANT: If no entry matches the exact date, we use the OLDEST entry as fallback.
 * This ensures historical orders still get COGS even if effectiveFrom is set later.
 */
export function getCOGSAtDateFromEntries(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  entries: Array<{ costPrice: any; effectiveFrom: Date; effectiveTo: Date | null }>,
  date: Date
): number | null {
  if (!entries || entries.length === 0) {
    return null
  }

  // Helper to extract price value
  const extractPrice = (price: unknown): number => {
    if (typeof price === 'number') return price
    if (price && typeof (price as { toNumber?: () => number }).toNumber === 'function') {
      return (price as { toNumber: () => number }).toNumber()
    }
    if (price) return Number(price)
    return 0
  }

  // Find the entry that was effective at the given date
  for (const entry of entries) {
    const effectiveFrom = new Date(entry.effectiveFrom)
    const effectiveTo = entry.effectiveTo ? new Date(entry.effectiveTo) : null

    if (effectiveFrom <= date && (effectiveTo === null || effectiveTo >= date)) {
      return extractPrice(entry.costPrice)
    }
  }

  // FALLBACK: If order date is BEFORE all effectiveFrom dates,
  // use the oldest entry (first chronologically) as the best guess
  // This handles historical orders before COGS was set up
  const sortedEntries = [...entries].sort((a, b) =>
    new Date(a.effectiveFrom).getTime() - new Date(b.effectiveFrom).getTime()
  )

  const oldestEntry = sortedEntries[0]
  if (oldestEntry) {
    return extractPrice(oldestEntry.costPrice)
  }

  return null
}

/**
 * Get COGS for a variant at a specific date
 * Uses the COGS entry that was effective at the order date, not current COGS
 */
export function getCOGSAtDate(
  variantId: string,
  date: Date,
  cogsData: COGSData
): COGSLookupResult {
  const entries = cogsData.entries.get(variantId)

  if (!entries || entries.length === 0) {
    // No COGS data for this variant
    if (cogsData.defaultCOGS !== undefined) {
      return {
        costPrice: cogsData.defaultCOGS,
        source: 'FALLBACK',
        effectiveDate: null,
        variantId,
        matched: false,
      }
    }
    return {
      costPrice: 0,
      source: 'MISSING',
      effectiveDate: null,
      variantId,
      matched: false,
    }
  }

  // Find the COGS entry that was effective at the order date
  // Entries should be sorted by effectiveFrom DESC
  for (const entry of entries) {
    const effectiveFrom = new Date(entry.effectiveFrom)
    const effectiveTo = entry.effectiveTo ? new Date(entry.effectiveTo) : null

    // Check if this entry was effective at the order date
    if (effectiveFrom <= date && (effectiveTo === null || effectiveTo >= date)) {
      return {
        costPrice: toNumber(entry.costPrice),
        source: entry.source,
        effectiveDate: effectiveFrom,
        variantId,
        matched: true,
      }
    }
  }

  // No matching date range - use the earliest entry as fallback
  const earliestEntry = entries[entries.length - 1]
  return {
    costPrice: toNumber(earliestEntry.costPrice),
    source: 'FALLBACK',
    effectiveDate: new Date(earliestEntry.effectiveFrom),
    variantId,
    matched: false,
  }
}

/**
 * Build COGS data structure from database entries
 */
export function buildCOGSData(
  entries: COGSEntry[],
  defaultCOGS?: number
): COGSData {
  const entriesMap = new Map<string, COGSEntry[]>()

  for (const entry of entries) {
    const existing = entriesMap.get(entry.variantId) || []
    existing.push(entry)
    entriesMap.set(entry.variantId, existing)
  }

  // Sort each variant's entries by effectiveFrom DESC (newest first)
  for (const [variantId, variantEntries] of entriesMap) {
    variantEntries.sort((a, b) =>
      new Date(b.effectiveFrom).getTime() - new Date(a.effectiveFrom).getTime()
    )
    entriesMap.set(variantId, variantEntries)
  }

  return {
    entries: entriesMap,
    defaultCOGS,
  }
}

// ===========================================
// ORDER COGS CALCULATION
// ===========================================

export interface OrderCOGSResult {
  totalCOGS: number
  lineItemCOGS: Array<{
    lineItemId: string
    variantId: string | null
    unitCOGS: number
    totalCOGS: number
    quantity: number
    source: COGSSourceType
    matched: boolean
  }>
  matchedCount: number
  missingCount: number
  matchRate: number
}

/**
 * Calculate COGS for an entire order using historical COGS data
 */
export function calculateOrderCOGS(
  order: OrderForCalculation,
  cogsData: COGSData
): OrderCOGSResult {
  const lineItemCOGS: OrderCOGSResult['lineItemCOGS'] = []
  let totalCOGS = 0
  let matchedCount = 0
  let missingCount = 0

  for (const lineItem of order.lineItems) {
    let unitCOGS = 0
    let source: COGSSourceType = 'MISSING'
    let matched = false

    if (lineItem.variantId) {
      // Look up COGS at the order date
      const lookup = getCOGSAtDate(
        lineItem.variantId,
        order.shopifyCreatedAt,
        cogsData
      )
      unitCOGS = lookup.costPrice
      source = lookup.source
      matched = lookup.matched

      if (matched) {
        matchedCount++
      } else if (source === 'MISSING') {
        missingCount++
      }
    } else {
      // No variant ID - can't look up COGS
      missingCount++
    }

    const itemTotalCOGS = roundCurrency(unitCOGS * lineItem.quantity)
    totalCOGS += itemTotalCOGS

    lineItemCOGS.push({
      lineItemId: lineItem.id,
      variantId: lineItem.variantId,
      unitCOGS,
      totalCOGS: itemTotalCOGS,
      quantity: lineItem.quantity,
      source,
      matched,
    })
  }

  const totalItems = matchedCount + missingCount
  const matchRate = totalItems > 0 ? (matchedCount / totalItems) * 100 : 0

  return {
    totalCOGS: roundCurrency(totalCOGS),
    lineItemCOGS,
    matchedCount,
    missingCount,
    matchRate: Math.round(matchRate * 100) / 100,
  }
}

// ===========================================
// COGS VALIDATION
// ===========================================

export interface COGSCoverageResult {
  totalVariants: number
  variantsWithCOGS: number
  variantsWithoutCOGS: number
  coverageRate: number
  missingVariants: Array<{
    variantId: string
    title: string
    sku: string | null
  }>
}

/**
 * Validate COGS coverage for a set of orders
 */
export function validateCOGSCoverage(
  orders: OrderForCalculation[],
  cogsData: COGSData
): COGSCoverageResult {
  const variantsSeen = new Map<string, { title: string; sku: string | null }>()
  const variantsMissing = new Map<string, { title: string; sku: string | null }>()

  for (const order of orders) {
    for (const lineItem of order.lineItems) {
      if (!lineItem.variantId) continue

      const variantInfo = { title: lineItem.title, sku: lineItem.sku }
      variantsSeen.set(lineItem.variantId, variantInfo)

      // Check if this variant has COGS
      if (!cogsData.entries.has(lineItem.variantId)) {
        variantsMissing.set(lineItem.variantId, variantInfo)
      }
    }
  }

  const totalVariants = variantsSeen.size
  const variantsWithoutCOGS = variantsMissing.size
  const variantsWithCOGS = totalVariants - variantsWithoutCOGS
  const coverageRate = totalVariants > 0
    ? Math.round((variantsWithCOGS / totalVariants) * 10000) / 100
    : 100

  return {
    totalVariants,
    variantsWithCOGS,
    variantsWithoutCOGS,
    coverageRate,
    missingVariants: Array.from(variantsMissing.entries()).map(([variantId, info]) => ({
      variantId,
      ...info,
    })),
  }
}

// ===========================================
// COGS AGGREGATION
// ===========================================

/**
 * Calculate total COGS for multiple orders
 */
export function calculateTotalCOGS(
  orders: OrderForCalculation[],
  cogsData: COGSData
): {
  totalCOGS: number
  orderResults: Map<string, OrderCOGSResult>
  aggregateMatchRate: number
} {
  const orderResults = new Map<string, OrderCOGSResult>()
  let totalCOGS = 0
  let totalMatched = 0
  let totalMissing = 0

  for (const order of orders) {
    const result = calculateOrderCOGS(order, cogsData)
    orderResults.set(order.id, result)
    totalCOGS += result.totalCOGS
    totalMatched += result.matchedCount
    totalMissing += result.missingCount
  }

  const totalItems = totalMatched + totalMissing
  const aggregateMatchRate = totalItems > 0
    ? Math.round((totalMatched / totalItems) * 10000) / 100
    : 100

  return {
    totalCOGS: roundCurrency(totalCOGS),
    orderResults,
    aggregateMatchRate,
  }
}

// ===========================================
// COGS ADJUSTMENT FOR REFUNDS
// ===========================================

/**
 * Calculate COGS adjustment for refunded items
 * Note: This is a simplified version - full implementation would need refund line items
 */
export function calculateRefundCOGSAdjustment(
  order: OrderForCalculation,
  cogsData: COGSData
): number {
  // If there are no refunds, no adjustment needed
  const totalRefunds = toNumber(order.totalRefundAmount)
  if (totalRefunds === 0) return 0

  // Calculate the refund ratio
  const totalPrice = toNumber(order.totalPrice)
  if (totalPrice === 0) return 0

  const refundRatio = totalRefunds / totalPrice

  // Calculate the COGS and apply the ratio
  // This is a simplification - ideally we'd track which items were refunded
  const cogsResult = calculateOrderCOGS(order, cogsData)
  const cogsAdjustment = roundCurrency(cogsResult.totalCOGS * refundRatio)

  return cogsAdjustment
}
