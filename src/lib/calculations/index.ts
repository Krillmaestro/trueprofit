/**
 * TrueProfit Calculations Module
 * Export all calculation functions and types
 */

// Types
export * from './types'

// COGS Service
export * from './cogs'

// Calculation Engine (includes simple helpers)
export * from './engine'

// Re-export simple helpers explicitly for clarity
export {
  simpleGrossRevenue,
  simpleNetRevenue,
  simpleRevenueExVat,
  simpleGrossProfit,
  simpleNetProfit,
  simpleBreakEvenROAS,
} from './engine'

// Default export
export { default as calculations } from './engine'
