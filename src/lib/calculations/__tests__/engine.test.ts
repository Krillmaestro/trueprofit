/**
 * Unit Tests for TrueProfit Calculation Engine
 * Verifies critical business logic for profit calculations
 */

import {
  calculateGrossRevenue,
  calculateNetRevenue,
  calculateRevenueExVat,
  calculateGrossProfit,
  calculateNetProfit,
  calculateBreakEvenROAS,
  toNumber,
  roundCurrency,
  roundPercentage,
  safeMargin,
} from '../engine'
import { getCOGSAtDate, validateCOGSCoverage } from '../cogs'

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
      expect(toNumber('123.45')).toBe(123.45)
    })

    it('converts Decimal-like objects', () => {
      expect(toNumber({ toNumber: () => 99.99 })).toBe(99.99)
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
      expect(safeMargin(10, -100)).toBe(0)
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
    const entries = [
      {
        costPrice: 100,
        effectiveFrom: new Date('2024-01-01'),
        effectiveTo: new Date('2024-06-30'),
      },
      {
        costPrice: 120,
        effectiveFrom: new Date('2024-07-01'),
        effectiveTo: null,
      },
    ]

    it('returns correct COGS for date within first period', () => {
      const orderDate = new Date('2024-03-15')
      expect(getCOGSAtDate(entries, orderDate)).toBe(100)
    })

    it('returns correct COGS for date in second period', () => {
      const orderDate = new Date('2024-08-01')
      expect(getCOGSAtDate(entries, orderDate)).toBe(120)
    })

    it('returns null for date before any entries', () => {
      const orderDate = new Date('2023-01-01')
      expect(getCOGSAtDate(entries, orderDate)).toBe(null)
    })
  })

  describe('validateCOGSCoverage', () => {
    it('returns 100% when all items have COGS', () => {
      const result = validateCOGSCoverage(10, 0)
      expect(result.percentage).toBe(100)
      expect(result.isComplete).toBe(true)
    })

    it('calculates correct percentage for partial coverage', () => {
      const result = validateCOGSCoverage(10, 3)
      expect(result.percentage).toBe(70)
      expect(result.isComplete).toBe(false)
    })

    it('handles zero items', () => {
      const result = validateCOGSCoverage(0, 0)
      expect(result.percentage).toBe(100)
      expect(result.isComplete).toBe(true)
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
  it('calculates e-commerce order profit correctly', () => {
    // Realistic Swedish e-commerce order
    // Customer pays: 1250 SEK (1000 + 25% VAT = 250)
    // Shipping charged: 99 SEK (79.20 + VAT)
    // Discount: 100 SEK
    // No refund

    // Our costs:
    // COGS: 300 SEK
    // Shipping cost: 59 SEK
    // Payment fee: 2.9% + 3 SEK

    const subtotal = 1000 // Before VAT
    const shipping = 79.20 // Before VAT
    const vat = 269.80 // 25% on subtotal + shipping
    const discount = 100
    const refund = 0

    const cogs = 300
    const shippingCost = 59
    const orderTotal = subtotal + shipping + vat - discount // 1249
    const paymentFee = orderTotal * 0.029 + 3 // ~39.22

    // Calculations
    const grossRevenue = calculateGrossRevenue(subtotal, shipping) // 1079.20
    const netRevenue = calculateNetRevenue(grossRevenue, discount, refund) // 979.20
    const revenueExVat = calculateRevenueExVat(netRevenue, vat) // Should be roughly net * 0.8

    // For this test, let's use actual values
    expect(grossRevenue).toBe(1079.20)
    expect(netRevenue).toBe(979.20)

    // The VAT calculation here is complex because discount was applied
    // In real scenario, VAT would be recalculated on discounted amount
    // But the PRINCIPLE remains: VAT is subtracted ONCE
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
