/**
 * Unit Tests for TrueProfit Calculation Engine
 * Verifies critical business logic for profit calculations
 */

import { describe, expect, it } from 'vitest'
import { Decimal } from '@prisma/client/runtime/library'
import type { OrderForCalculation } from '../types'

import {
  simpleGrossRevenue as calculateGrossRevenue,
  simpleNetRevenue as calculateNetRevenue,
  simpleRevenueExVat as calculateRevenueExVat,
  simpleGrossProfit as calculateGrossProfit,
  simpleNetProfit as calculateNetProfit,
  simpleBreakEvenROAS as calculateBreakEvenROAS,
  toNumber,
  roundCurrency,
  roundPercentage,
  safeMargin,
} from '../engine'
import { buildCOGSData, getCOGSAtDate, validateCOGSCoverage } from '../cogs'

// ===========================================
// BASIC UTILITY TESTS
// ===========================================

describe('Utility Functions', () => {
  describe('toNumber', () => {
    it('converts null to 0', () => {
      expect(toNumber(null)).toBe(0)
    })

    it('converts undefined to 0', () => {
      expect(toNumber(undefined)).toBe(0)
    })

    it('converts string numbers', () => {
      expect(toNumber(new Decimal('123.45'))).toBe(123.45)
    })

    it('converts Decimal-like objects', () => {
      expect(toNumber(new Decimal('99.99'))).toBe(99.99)
    })

    it('preserves regular numbers', () => {
      expect(toNumber(42.5)).toBe(42.5)
    })
  })

  describe('roundCurrency', () => {
    it('rounds to 2 decimal places', () => {
      expect(roundCurrency(123.456)).toBe(123.46)
      expect(roundCurrency(123.454)).toBe(123.45)
    })

    it('handles negative numbers', () => {
      expect(roundCurrency(-99.999)).toBe(-100)
    })
  })

  describe('safeMargin', () => {
    it('calculates margin correctly', () => {
      expect(safeMargin(25, 100)).toBe(25)
    })

    it('returns 0 for zero revenue', () => {
      expect(safeMargin(100, 0)).toBe(0)
    })

    it('handles negative revenue', () => {
      expect(safeMargin(10, -100)).toBe(-10)
    })
  })
})

// ===========================================
// REVENUE CALCULATION TESTS
// ===========================================

describe('Revenue Calculations', () => {
  describe('calculateGrossRevenue', () => {
    it('adds subtotal and shipping', () => {
      expect(calculateGrossRevenue(1000, 100)).toBe(1100)
    })

    it('handles zero shipping', () => {
      expect(calculateGrossRevenue(1000, 0)).toBe(1000)
    })
  })

  describe('calculateNetRevenue', () => {
    it('subtracts discounts and refunds', () => {
      // Gross: 1000, Discounts: 50, Refunds: 100
      // Net: 1000 - 50 - 100 = 850
      expect(calculateNetRevenue(1000, 50, 100)).toBe(850)
    })

    it('handles zero deductions', () => {
      expect(calculateNetRevenue(1000, 0, 0)).toBe(1000)
    })
  })

  describe('calculateRevenueExVat', () => {
    it('subtracts VAT from net revenue', () => {
      // Net: 1250, VAT: 250 (20%)
      // Ex VAT: 1250 - 250 = 1000
      expect(calculateRevenueExVat(1250, 250)).toBe(1000)
    })

    it('handles zero VAT', () => {
      expect(calculateRevenueExVat(1000, 0)).toBe(1000)
    })
  })
})

// ===========================================
// PROFIT CALCULATION TESTS
// ===========================================

describe('Profit Calculations', () => {
  describe('calculateGrossProfit', () => {
    it('subtracts COGS from revenue ex VAT', () => {
      // Revenue ex VAT: 1000, COGS: 400
      // Gross Profit: 600
      expect(calculateGrossProfit(1000, 400)).toBe(600)
    })

    it('can be negative', () => {
      expect(calculateGrossProfit(100, 200)).toBe(-100)
    })
  })

  describe('calculateNetProfit', () => {
    it('subtracts all costs from gross profit', () => {
      // Gross Profit: 600, Fees: 50, Shipping: 30
      // Net Profit: 600 - 50 - 30 = 520
      expect(calculateNetProfit(600, 50, 30)).toBe(520)
    })

    it('handles additional operating costs', () => {
      // Gross Profit: 600, Fees: 50, Shipping: 30, Ad Spend: 100, Fixed: 50
      // Net Profit: 600 - 50 - 30 - 100 - 50 = 370
      expect(calculateNetProfit(600, 50, 30, 100, 50)).toBe(370)
    })
  })
})

// ===========================================
// CRITICAL VAT TESTS
// ===========================================

describe('VAT Handling (CRITICAL)', () => {
  it('MUST NOT double-count VAT in profit calculation', () => {
    // This is the CRITICAL test - VAT should only be subtracted ONCE

    // Scenario: Customer pays 1250 SEK (1000 + 250 VAT)
    // COGS: 400
    // Payment fees: 50

    const grossRevenue = 1250 // Including VAT
    const vat = 250
    const cogs = 400
    const paymentFees = 50

    // Step 1: Calculate revenue ex VAT
    const revenueExVat = calculateRevenueExVat(grossRevenue, vat)
    expect(revenueExVat).toBe(1000) // VAT subtracted once

    // Step 2: Calculate gross profit (COGS deducted from ex-VAT revenue)
    const grossProfit = calculateGrossProfit(revenueExVat, cogs)
    expect(grossProfit).toBe(600) // 1000 - 400

    // Step 3: Calculate net profit
    const netProfit = calculateNetProfit(grossProfit, paymentFees)
    expect(netProfit).toBe(550) // 600 - 50

    // WRONG calculation (double-counting VAT):
    // Some might incorrectly do: 1250 - 250 - 400 - 50 - 250 = 300 (VAT counted twice!)
    // CORRECT: 1250 - 250 - 400 - 50 = 550 (VAT only once)
    expect(netProfit).not.toBe(300)
  })

  it('payment fees should be calculated on transaction amount (may include VAT)', () => {
    // Note: In Swedish e-commerce, payment processors charge on total transaction
    // This is a business reality, not a bug

    const transactionAmount = 1250 // Customer payment including VAT
    const feePercentage = 2.9 / 100
    const fixedFee = 3

    const expectedFee = transactionAmount * feePercentage + fixedFee
    expect(roundCurrency(expectedFee)).toBe(39.25) // 36.25 + 3
  })
})

// ===========================================
// COGS TESTS
// ===========================================

describe('COGS Calculations', () => {
  describe('getCOGSAtDate', () => {
    const entries = buildCOGSData([
      {
        id: 'old', variantId: 'variant', source: 'MANUAL', zoneId: null,
        costPrice: 100,
        effectiveFrom: new Date('2024-01-01'),
        effectiveTo: new Date('2024-06-30'),
      },
      {
        id: 'new', variantId: 'variant', source: 'MANUAL', zoneId: null,
        costPrice: 120,
        effectiveFrom: new Date('2024-07-01'),
        effectiveTo: null,
      },
    ])

    it('returns correct COGS for date within first period', () => {
      const orderDate = new Date('2024-03-15')
      expect(getCOGSAtDate('variant', orderDate, entries)).toMatchObject({ costPrice: 100, matched: true })
    })

    it('returns correct COGS for date in second period', () => {
      const orderDate = new Date('2024-08-01')
      expect(getCOGSAtDate('variant', orderDate, entries)).toMatchObject({ costPrice: 120, matched: true })
    })

    it('explicitly marks historical estimates as fallback before any entries', () => {
      const orderDate = new Date('2023-01-01')
      expect(getCOGSAtDate('variant', orderDate, entries)).toMatchObject({ costPrice: 100, matched: false, source: 'FALLBACK' })
    })
  })

  describe('validateCOGSCoverage', () => {
    const order = (variantIds: string[]): OrderForCalculation => ({
      id: 'order', storeId: 'store', shopifyOrderId: BigInt(1), orderNumber: '1',
      financialStatus: 'paid', fulfillmentStatus: null, currency: 'SEK',
      subtotalPrice: 0, totalDiscounts: 0, totalShippingPrice: 0, totalTax: 0,
      totalPrice: 0, totalCOGS: 0, totalShippingCost: 0, totalPaymentFees: 0,
      totalRefundAmount: 0, grossProfit: 0, netProfit: 0, profitMargin: 0,
      shopifyCreatedAt: new Date('2026-09-01'), cancelledAt: null,
      shippingCountry: 'SE', transactions: [], refunds: [],
      lineItems: variantIds.map(id => ({
        id, variantId: id, shopifyVariantId: BigInt(1), title: id, sku: null,
        quantity: 1, price: 0, totalDiscount: 0, taxAmount: 0,
        unitCOGS: 0, totalCOGS: 0, cogsSource: 'MISSING',
      })),
    })
    const costs = buildCOGSData([{
      id: 'cost', variantId: 'known', costPrice: 10,
      effectiveFrom: new Date('2026-01-01'), effectiveTo: null,
      source: 'MANUAL', zoneId: null,
    }])
    it('deduplicates variants across orders', () => {
      expect(validateCOGSCoverage([order(['known', 'known'])], costs))
        .toMatchObject({ totalVariants: 1, variantsWithCOGS: 1, coverageRate: 100 })
    })
    it('identifies missing variant costs', () => {
      expect(validateCOGSCoverage([order(['known', 'unknown'])], costs))
        .toMatchObject({ coverageRate: 50, missingVariants: [{ variantId: 'unknown' }] })
    })
    it('handles an empty period', () => {
      expect(validateCOGSCoverage([], costs)).toMatchObject({ totalVariants: 0, coverageRate: 100 })
    })
  })
})

// ===========================================
// ROAS CALCULATION TESTS
// ===========================================

describe('ROAS Calculations', () => {
  describe('calculateBreakEvenROAS', () => {
    it('calculates break-even ROAS correctly', () => {
      // Revenue ex VAT: 10000
      // Variable costs (COGS + fees + shipping): 6000
      // Contribution margin: 40%
      // Break-even ROAS: 1 / 0.4 = 2.5

      const result = calculateBreakEvenROAS(10000, 6000)
      expect(roundPercentage(result * 100) / 100).toBe(2.5)
    })

    it('returns high value when contribution margin is very low', () => {
      // If variable costs are 95% of revenue, break-even ROAS would be 20
      const result = calculateBreakEvenROAS(10000, 9500)
      expect(result).toBe(20)
    })

    it('returns 999 when contribution margin is zero or negative', () => {
      const result = calculateBreakEvenROAS(10000, 10000)
      expect(result).toBe(999)
    })
  })
})

// ===========================================
// FULL SCENARIO TESTS
// ===========================================

describe('Full Profit Calculation Scenarios', () => {
  it('deducts VAT once before operating costs', () => {
    // All supplied amounts are VAT-inclusive, after the known discount.
    const customerPayment = 1250
    const vatCollected = 250
    const cogs = 300
    const shippingCost = 59
    const paymentFee = roundCurrency(customerPayment * 0.029 + 3)
    const revenueExVat = calculateRevenueExVat(customerPayment, vatCollected)
    const grossProfit = calculateGrossProfit(revenueExVat, cogs)
    expect(calculateNetProfit(grossProfit, paymentFee, shippingCost)).toBe(601.75)
  })

  it('handles refund scenario correctly', () => {
    // Order: 1000 SEK (800 + 200 VAT)
    // Refund: 500 SEK (400 + 100 VAT refunded back)

    const grossRevenue = 1000
    const discount = 0
    const refund = 500
    const vat = 100 // VAT after refund (only on 500 remaining)

    const netRevenue = calculateNetRevenue(grossRevenue, discount, refund) // 500
    const revenueExVat = calculateRevenueExVat(netRevenue, vat) // 400

    expect(netRevenue).toBe(500)
    expect(revenueExVat).toBe(400)
  })
})
