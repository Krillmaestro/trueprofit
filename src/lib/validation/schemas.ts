/**
 * TrueProfit Validation Schemas
 * Zod schemas for all API inputs
 */

import { z } from 'zod'

// ===========================================
// BASE SCHEMAS
// ===========================================

/**
 * CUID validation (Prisma default ID format)
 */
export const cuidSchema = z.string().regex(
  /^c[a-z0-9]{24}$/,
  'Invalid ID format'
)

/**
 * Optional CUID
 */
export const optionalCuidSchema = cuidSchema.optional()

/**
 * Currency code validation
 */
export const currencySchema = z.enum(['SEK', 'USD', 'EUR', 'GBP', 'NOK', 'DKK'])

/**
 * Positive number
 */
export const positiveNumberSchema = z.number().positive()

/**
 * Non-negative number
 */
export const nonNegativeNumberSchema = z.number().min(0)

/**
 * Percentage (0-100)
 */
export const percentageSchema = z.number().min(0).max(100)

/**
 * Rate (0-1)
 */
export const rateSchema = z.number().min(0).max(1)

// ===========================================
// DATE SCHEMAS
// ===========================================

/**
 * ISO date string
 */
export const isoDateSchema = z.string().datetime({ message: 'Invalid date format. Use ISO 8601 format.' })

/**
 * Date range validation
 */
export const dateRangeSchema = z.object({
  startDate: isoDateSchema,
  endDate: isoDateSchema,
}).refine(
  (data) => new Date(data.startDate) <= new Date(data.endDate),
  { message: 'startDate must be before or equal to endDate' }
)

/**
 * Optional date range (uses defaults if not provided)
 */
export const optionalDateRangeSchema = z.object({
  startDate: isoDateSchema.optional(),
  endDate: isoDateSchema.optional(),
})

// ===========================================
// PAGINATION SCHEMAS
// ===========================================

/**
 * Pagination parameters
 */
export const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
})

/**
 * Cursor-based pagination
 */
export const cursorPaginationSchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().positive().max(100).default(20),
})

// ===========================================
// DASHBOARD SCHEMAS
// ===========================================

/**
 * Dashboard summary request
 */
export const dashboardSummarySchema = z.object({
  storeId: cuidSchema.optional().nullable(),
  startDate: isoDateSchema.optional().nullable().transform(val => val ? new Date(val) : null),
  endDate: isoDateSchema.optional().nullable().transform(val => val ? new Date(val) : null),
  compareWithPrevious: z.coerce.boolean().default(false),
  excludeCancelled: z.coerce.boolean().default(true),
})

/**
 * Dashboard top products request
 */
export const topProductsSchema = z.object({
  storeId: cuidSchema.optional(),
  startDate: isoDateSchema.optional(),
  endDate: isoDateSchema.optional(),
  limit: z.coerce.number().int().positive().max(50).default(10),
  sortBy: z.enum(['revenue', 'profit', 'quantity', 'margin']).default('profit'),
})

// ===========================================
// P&L SCHEMAS
// ===========================================

/**
 * P&L report request
 */
export const pnlReportSchema = z.object({
  storeId: cuidSchema.optional().nullable(),
  startDate: isoDateSchema.optional().nullable(),
  endDate: isoDateSchema.optional().nullable(),
  includeAdSpend: z.coerce.boolean().default(true),
  includeExpenses: z.coerce.boolean().default(true),
  groupBy: z.enum(['day', 'week', 'month']).optional(),
  periodType: z.enum(['month', 'quarter', 'year']).default('month'),
})

// ===========================================
// STORE SCHEMAS
// ===========================================

/**
 * Store ID parameter
 */
export const storeIdSchema = z.object({
  id: cuidSchema,
})

/**
 * Create store request
 */
export const createStoreSchema = z.object({
  shopifyDomain: z.string()
    .min(1, 'Shopify domain is required')
    .regex(
      /^[a-zA-Z0-9-]+\.myshopify\.com$/,
      'Invalid Shopify domain format'
    ),
})

// ===========================================
// COGS SCHEMAS
// ===========================================

/**
 * Single COGS entry
 */
export const cogsEntrySchema = z.object({
  variantId: cuidSchema,
  costPrice: nonNegativeNumberSchema,
  effectiveFrom: isoDateSchema.optional(),
  effectiveTo: isoDateSchema.optional(),
  source: z.enum(['MANUAL', 'CSV_IMPORT', 'SHOPIFY_COST', 'API']).default('MANUAL'),
  notes: z.string().max(500).optional(),
})

/**
 * Bulk COGS import
 */
export const bulkCogsImportSchema = z.object({
  entries: z.array(z.object({
    sku: z.string().min(1),
    costPrice: nonNegativeNumberSchema,
    effectiveFrom: isoDateSchema.optional(),
  })).min(1).max(1000),
})

// ===========================================
// EXPENSE SCHEMAS
// ===========================================

/**
 * Create expense request
 */
export const createExpenseSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(1000).optional(),
  categoryId: cuidSchema.optional(),
  costType: z.enum(['FIXED', 'VARIABLE', 'ONE_TIME', 'SALARY']),
  amount: nonNegativeNumberSchema.optional(),
  percentageRate: rateSchema.optional(),
  recurrenceType: z.enum(['DAILY', 'WEEKLY', 'BIWEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY']).optional(),
  recurrenceStart: isoDateSchema.optional(),
  recurrenceEnd: isoDateSchema.optional(),
  occurrenceDate: isoDateSchema.optional(),
}).refine(
  (data) => {
    // Fixed costs need amount
    if (data.costType === 'FIXED' || data.costType === 'ONE_TIME' || data.costType === 'SALARY') {
      return data.amount !== undefined
    }
    // Variable costs need percentage
    if (data.costType === 'VARIABLE') {
      return data.percentageRate !== undefined
    }
    return true
  },
  { message: 'Amount required for fixed costs, percentage required for variable costs' }
)

// ===========================================
// SHIPPING SCHEMAS
// ===========================================

/**
 * Shipping cost tier
 */
export const shippingTierSchema = z.object({
  name: z.string().min(1).max(100),
  minItems: z.number().int().min(1).default(1),
  maxItems: z.number().int().min(1).optional(),
  cost: nonNegativeNumberSchema,
  costPerAdditionalItem: nonNegativeNumberSchema.default(0),
  maxWeightGrams: z.number().int().positive().optional(),
  shippingZone: z.string().max(50).optional(),
  isActive: z.boolean().default(true),
})

// ===========================================
// PAYMENT FEE SCHEMAS
// ===========================================

/**
 * Payment fee configuration
 */
export const paymentFeeConfigSchema = z.object({
  gateway: z.string().min(1).max(100),
  feeType: z.enum(['PERCENTAGE_ONLY', 'FIXED_ONLY', 'PERCENTAGE_PLUS_FIXED']),
  percentageFee: rateSchema.default(0),
  fixedFee: nonNegativeNumberSchema.default(0),
  currency: currencySchema.default('SEK'),
  isActive: z.boolean().default(true),
})

// ===========================================
// SYNC SCHEMAS
// ===========================================

/**
 * Sync request
 */
export const syncRequestSchema = z.object({
  storeId: cuidSchema.optional(),
  type: z.enum(['products', 'orders', 'all']).default('all'),
  sinceDate: isoDateSchema.optional(),
  incremental: z.coerce.boolean().default(true),
})

// ===========================================
// WEBHOOK SCHEMAS
// ===========================================

/**
 * Shopify webhook header validation
 */
export const shopifyWebhookHeadersSchema = z.object({
  'x-shopify-hmac-sha256': z.string().min(1),
  'x-shopify-topic': z.string().min(1),
  'x-shopify-shop-domain': z.string().min(1),
  'x-shopify-api-version': z.string().optional(),
})

// ===========================================
// HELPER FUNCTIONS
// ===========================================

/**
 * Parse and validate request data
 */
export function parseRequest<T>(
  schema: z.ZodSchema<T>,
  data: unknown
): { success: true; data: T } | { success: false; error: z.ZodError } {
  const result = schema.safeParse(data)
  if (result.success) {
    return { success: true, data: result.data }
  }
  return { success: false, error: result.error }
}

/**
 * Parse URL search params into object
 */
export function parseSearchParams(searchParams: URLSearchParams): Record<string, string> {
  const result: Record<string, string> = {}
  searchParams.forEach((value, key) => {
    result[key] = value
  })
  return result
}

/**
 * Format Zod error for API response
 */
export function formatZodError(error: z.ZodError): {
  message: string
  errors: Array<{ field: string; message: string }>
} {
  const errors = error.issues.map((issue) => ({
    field: issue.path.join('.'),
    message: issue.message,
  }))

  return {
    message: 'Validation failed',
    errors,
  }
}
