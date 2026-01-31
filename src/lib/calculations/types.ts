/**
 * TrueProfit Calculation Types
 * Central type definitions for all financial calculations
 */

import { Decimal } from '@prisma/client/runtime/library'

// ===========================================
// BASE TYPES
// ===========================================

export type Currency = 'SEK' | 'USD' | 'EUR' | 'GBP' | 'NOK' | 'DKK'

export type TrendDirection = 'up' | 'down' | 'neutral'

export type COGSSourceType = 'MANUAL' | 'CSV_IMPORT' | 'SHOPIFY_COST' | 'API' | 'FALLBACK' | 'MISSING'

export interface DateRange {
  startDate: Date
  endDate: Date
}

// ===========================================
// ORDER & LINE ITEM TYPES
// ===========================================

export interface OrderLineItemForCalculation {
  id: string
  quantity: number
  price: number | Decimal
  totalDiscount: number | Decimal
  taxAmount: number | Decimal
  unitCOGS: number | Decimal
  totalCOGS: number | Decimal
  cogsSource: COGSSourceType
  variantId: string | null
  shopifyVariantId: bigint | null
  title: string
  sku: string | null
}

export interface OrderTransactionForCalculation {
  id: string
  kind: string
  gateway: string
  status: string
  amount: number | Decimal
  paymentFee: number | Decimal
  paymentFeeCalculated: boolean
}

export interface OrderRefundForCalculation {
  id: string
  amount: number | Decimal
  processedAt: Date
}

export interface OrderForCalculation {
  id: string
  storeId: string
  shopifyOrderId: bigint
  orderNumber: string
  financialStatus: string | null
  fulfillmentStatus: string | null
  currency: Currency | string

  // Revenue fields
  subtotalPrice: number | Decimal
  totalDiscounts: number | Decimal
  totalShippingPrice: number | Decimal
  totalTax: number | Decimal
  totalPrice: number | Decimal

  // Cost fields (may need recalculation)
  totalCOGS: number | Decimal
  totalShippingCost: number | Decimal
  totalPaymentFees: number | Decimal
  totalRefundAmount: number | Decimal

  // Profit fields
  grossProfit: number | Decimal
  netProfit: number | Decimal
  profitMargin: number | Decimal

  // Dates
  shopifyCreatedAt: Date
  cancelledAt: Date | null

  // Related data
  lineItems: OrderLineItemForCalculation[]
  transactions: OrderTransactionForCalculation[]
  refunds: OrderRefundForCalculation[]

  // Shipping info for zone-based calculations
  shippingCountry: string | null
}

// ===========================================
// COGS TYPES
// ===========================================

export interface COGSEntry {
  id: string
  variantId: string
  costPrice: number | Decimal
  effectiveFrom: Date
  effectiveTo: Date | null
  source: COGSSourceType
  zoneId: string | null
}

export interface COGSLookupResult {
  costPrice: number
  source: COGSSourceType
  effectiveDate: Date | null
  variantId: string
  matched: boolean
}

export interface COGSData {
  entries: Map<string, COGSEntry[]> // variantId -> entries sorted by effectiveFrom desc
  defaultCOGS?: number // Fallback if no match
}

// ===========================================
// FEE CONFIGURATION TYPES
// ===========================================

export type FeeType = 'PERCENTAGE_ONLY' | 'FIXED_ONLY' | 'PERCENTAGE_PLUS_FIXED'

export interface PaymentFeeConfig {
  gateway: string
  feeType: FeeType
  percentageFee: number | Decimal // e.g., 0.029 for 2.9%
  fixedFee: number | Decimal // e.g., 3.00 for 3 SEK
  currency: Currency | string
  isActive: boolean
}

export interface ShippingCostTier {
  id: string
  name: string
  minItems: number
  maxItems: number | null
  cost: number | Decimal
  costPerAdditionalItem: number | Decimal
  maxWeightGrams: number | null
  shippingZone: string | null
  isActive: boolean
}

// ===========================================
// CALCULATION RESULT TYPES
// ===========================================

export interface CalculationWarning {
  code: string
  message: string
  severity: 'info' | 'warning' | 'error'
  affectedItems?: string[]
}

export interface DataQuality {
  cogsMatchRate: number // 0-100 percentage
  cogsMatchedCount: number
  cogsMissingCount: number
  missingCOGSProducts: Array<{
    variantId: string
    title: string
    sku: string | null
    orderCount: number
  }>
  ordersWithRefunds: number
  cancelledOrdersExcluded: number
}

export interface RevenueBreakdown {
  grossRevenue: number
  totalDiscounts: number
  totalRefunds: number
  netRevenue: number
  totalTax: number
  revenueExVat: number
  shippingRevenue: number
}

export interface CostBreakdown {
  totalCOGS: number
  totalShippingCosts: number
  totalPaymentFees: number
  totalAdSpend: number
  totalOtherExpenses: number
  totalCosts: number
}

export interface ProfitBreakdown {
  grossProfit: number
  grossMargin: number
  netProfit: number
  netMargin: number
  contributionMargin: number
}

export interface CalculationResult<T> {
  data: T
  warnings: CalculationWarning[]
  dataQuality: DataQuality
  calculatedAt: Date
  dateRange: DateRange
}

// ===========================================
// DASHBOARD SUMMARY TYPES
// ===========================================

export interface DashboardSummary {
  // Revenue
  revenue: RevenueBreakdown

  // Costs
  costs: CostBreakdown

  // Profit
  profit: ProfitBreakdown

  // Order stats
  orderCount: number
  averageOrderValue: number

  // Comparison (optional)
  previousPeriod?: {
    revenue: RevenueBreakdown
    costs: CostBreakdown
    profit: ProfitBreakdown
    orderCount: number
  }

  // Trends
  trends?: {
    revenueChange: number
    profitChange: number
    orderCountChange: number
    marginChange: number
  }
}

// ===========================================
// P&L TYPES
// ===========================================

export interface PnLLineItem {
  label: string
  value: number
  percentage?: number // of revenue
  isSubtotal?: boolean
  isTotal?: boolean
  indent?: number
}

export interface PnLSection {
  title: string
  items: PnLLineItem[]
  subtotal?: PnLLineItem
}

export interface PnLStatement {
  period: DateRange
  currency: Currency | string

  sections: {
    revenue: PnLSection
    costOfGoodsSold: PnLSection
    grossProfit: PnLLineItem
    operatingExpenses: PnLSection
    operatingProfit: PnLLineItem
    otherExpenses?: PnLSection
    netProfit: PnLLineItem
  }

  // Key metrics
  metrics: {
    grossMargin: number
    netMargin: number
    operatingMargin: number
  }
}

// ===========================================
// CONFIGURATION TYPES
// ===========================================

export interface CalculationConfig {
  vatRate: number // e.g., 0.25 for 25%
  currency: Currency | string
  includeRefundsInRevenue: boolean
  includeShippingInRevenue: boolean
  excludeCancelledOrders: boolean
  paymentFeeConfigs: PaymentFeeConfig[]
  shippingCostTiers: ShippingCostTier[]
}

// ===========================================
// HELPER FUNCTIONS
// ===========================================

/**
 * Safely convert Decimal or number to number
 */
export function toNumber(value: number | Decimal | null | undefined): number {
  if (value === null || value === undefined) return 0
  if (typeof value === 'number') return value
  return Number(value)
}

/**
 * Round to 2 decimal places for currency
 */
export function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100
}

/**
 * Round to 4 decimal places for percentages/rates
 */
export function roundPercentage(value: number): number {
  return Math.round(value * 10000) / 10000
}

/**
 * Calculate percentage safely (avoid division by zero)
 */
export function safePercentage(numerator: number, denominator: number): number {
  if (denominator === 0) return 0
  return roundPercentage((numerator / denominator) * 100)
}

/**
 * Calculate margin safely
 */
export function safeMargin(profit: number, revenue: number): number {
  if (revenue === 0) return 0
  return roundPercentage((profit / revenue) * 100)
}
