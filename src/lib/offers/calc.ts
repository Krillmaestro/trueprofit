// ===========================================
// OFFER CALCULATOR – pure functions, runs in the browser
// ===========================================
//
// Unit economics per offer tier (1 burk, 2 burkar, 3 burkar …):
//
//   Kunden betalar (inkl. moms) = pris + frakt + Leveransskydd × anslutning
//   − moms                        25 % på produkt/frakt, 6 % på e-boksandelen
//   = Netto ex moms
//   − varukostnad (burkar + gåvor), 3PL & frakt, betalavgift, returer
//   = TB före marknadsföring  → det är vad du max kan betala för en order (break-even CPA)
//
// Break-even ROAS uses what Meta/Google count as purchase value: the order
// total including moms.

import { calculateShippingCost, ShippingTier } from '@/lib/shipping'
import type { PnLSettings } from '@/lib/pnl/settings'

export interface OfferGift {
  name: string
  qty: number
  /** SEK ex moms per unit; null = not known yet */
  unitCost: number | null
  /** Takes space in the parcel (counts towards 3PL tier) */
  physical: boolean
}

export interface OfferTier {
  id: string
  label: string
  qty: number
  /** What the customer pays for the products, inkl. moms */
  price: number
  /** Ordinary price for the same quantity, inkl. moms (for the "spara X %" line) */
  compareAt: number | null
  /** Shipping charged to the customer, inkl. moms */
  shippingCharged: number
  gifts: OfferGift[]
  /** Share of orders expected on this tier, used for the blended view */
  mixPct: number
}

export interface OfferConfig {
  /** Product group key from src/lib/pnl/products.ts – links to actual orders/ads */
  productGroup: string
  /** Varukostnad per burk, SEK ex moms (landed) */
  unitCogs: number
  vatPct: number
  /** Share of the price booked as e-bok at 6 % moms */
  bookSharePct: number
  tiers: OfferTier[]
  notes?: string
}

export interface TierResult {
  grossInklMoms: number
  vat: number
  netExVat: number
  productCogs: number
  giftCogs: number
  giftCostMissing: boolean
  fulfillment: number
  paymentFee: number
  refunds: number
  contribution: number
  contributionPct: number
  contributionPerUnit: number
  breakEvenCpa: number
  breakEvenRoas: number
  targetCpa: number
  targetRoas: number
  discountPct: number | null
  pricePerUnit: number
}

const BOOK_VAT = 6
const STANDARD_VAT = 25

export function calcTier(
  config: OfferConfig,
  tier: OfferTier,
  settings: PnLSettings,
  shippingTiers: ShippingTier[]
): TierResult {
  const bookShare = Math.min(Math.max(config.bookSharePct, 0), 100) / 100
  const protection = (settings.protectionPrice * settings.protectionAttachPct) / 100

  const grossInklMoms = tier.price + tier.shippingCharged + protection
  const netExVat =
    (tier.price * (1 - bookShare)) / (1 + config.vatPct / 100) +
    (tier.price * bookShare) / (1 + BOOK_VAT / 100) +
    tier.shippingCharged / (1 + STANDARD_VAT / 100) +
    protection / (1 + STANDARD_VAT / 100)
  const vat = grossInklMoms - netExVat

  const productCogs = tier.qty * config.unitCogs
  let giftCogs = 0
  let giftCostMissing = false
  let physicalGifts = 0
  for (const g of tier.gifts) {
    if (g.unitCost === null) giftCostMissing = true
    giftCogs += g.qty * (g.unitCost ?? 0)
    if (g.physical) physicalGifts += g.qty
  }

  const fulfillment = calculateShippingCost(tier.qty + physicalGifts, shippingTiers)
  const paymentFee = (grossInklMoms * settings.paymentFeePct) / 100 + settings.paymentFeeFixed
  const refunds = (netExVat * settings.refundPct) / 100

  const contribution = netExVat - productCogs - giftCogs - fulfillment - paymentFee - refunds
  const targetCpa = contribution - (netExVat * settings.targetMarginPct) / 100

  return {
    grossInklMoms,
    vat,
    netExVat,
    productCogs,
    giftCogs,
    giftCostMissing,
    fulfillment,
    paymentFee,
    refunds,
    contribution,
    contributionPct: netExVat > 0 ? (contribution / netExVat) * 100 : 0,
    contributionPerUnit: tier.qty > 0 ? contribution / tier.qty : 0,
    breakEvenCpa: contribution,
    breakEvenRoas: contribution > 0 ? grossInklMoms / contribution : Infinity,
    targetCpa,
    targetRoas: targetCpa > 0 ? grossInklMoms / targetCpa : Infinity,
    discountPct: tier.compareAt && tier.compareAt > 0 ? (1 - tier.price / tier.compareAt) * 100 : null,
    pricePerUnit: tier.qty > 0 ? tier.price / tier.qty : 0,
  }
}

/** Weighted average over tiers by mixPct (normalised, so it need not sum to 100). */
export function calcBlended(
  config: OfferConfig,
  settings: PnLSettings,
  shippingTiers: ShippingTier[],
  mixOverride?: Record<string, number>
): (TierResult & { units: number }) | null {
  const weights = config.tiers.map((t) => Math.max(mixOverride?.[t.id] ?? t.mixPct, 0))
  const sum = weights.reduce((s, w) => s + w, 0)
  if (sum <= 0) return null

  const results = config.tiers.map((t) => calcTier(config, t, settings, shippingTiers))
  const avg = (pick: (r: TierResult) => number) =>
    results.reduce((s, r, i) => s + pick(r) * weights[i], 0) / sum

  const grossInklMoms = avg((r) => r.grossInklMoms)
  const netExVat = avg((r) => r.netExVat)
  const contribution = avg((r) => r.contribution)
  const targetCpa = avg((r) => r.targetCpa)
  return {
    grossInklMoms,
    vat: avg((r) => r.vat),
    netExVat,
    productCogs: avg((r) => r.productCogs),
    giftCogs: avg((r) => r.giftCogs),
    giftCostMissing: results.some((r, i) => r.giftCostMissing && weights[i] > 0),
    fulfillment: avg((r) => r.fulfillment),
    paymentFee: avg((r) => r.paymentFee),
    refunds: avg((r) => r.refunds),
    contribution,
    contributionPct: netExVat > 0 ? (contribution / netExVat) * 100 : 0,
    contributionPerUnit: 0,
    breakEvenCpa: contribution,
    breakEvenRoas: contribution > 0 ? grossInklMoms / contribution : Infinity,
    targetCpa,
    targetRoas: targetCpa > 0 ? grossInklMoms / targetCpa : Infinity,
    discountPct: null,
    pricePerUnit: 0,
    units: config.tiers.reduce((s, t, i) => s + t.qty * weights[i], 0) / sum,
  }
}
