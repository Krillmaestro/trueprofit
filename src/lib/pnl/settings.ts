// ===========================================
// P&L assumptions (stored as JSON on team_settings.pnl_settings)
// ===========================================

export interface PnLSettings {
  /** Payment fee: % of what the customer is charged (inkl. moms) */
  paymentFeePct: number
  /** Payment fee: fixed SEK per order */
  paymentFeeFixed: number
  /** Swedish corporate tax, % of positive operating profit */
  corporateTaxPct: number
  /** SEK per unit of foreign ad account currency */
  fxToSek: Record<string, number>
  /** Offer calculator: Leveransskydd add-on */
  protectionPrice: number
  protectionAttachPct: number
  /** Offer calculator: expected refunds, % of net revenue */
  refundPct: number
  /** Offer calculator: profit you want left per order, % of net revenue */
  targetMarginPct: number
}

// 2.9 % + 3 kr is the agreed schablon (Kristoffer 30 sep 2026: "kör bara med schablon").
// Measured September 2026: Shopify Payments 53 464 kr on 1.77 Mkr ≈ 3.0 % all-in.
export const DEFAULT_PNL_SETTINGS: PnLSettings = {
  paymentFeePct: 2.9,
  paymentFeeFixed: 3,
  corporateTaxPct: 20.6,
  fxToSek: { SEK: 1, USD: 9.5, EUR: 11.33 },
  protectionPrice: 39,
  protectionAttachPct: 58,
  refundPct: 1,
  targetMarginPct: 10,
}

export function resolvePnLSettings(raw: unknown): PnLSettings {
  const stored = (raw && typeof raw === 'object' ? raw : {}) as Partial<PnLSettings>
  return {
    ...DEFAULT_PNL_SETTINGS,
    ...stored,
    fxToSek: { ...DEFAULT_PNL_SETTINGS.fxToSek, ...(stored.fxToSek ?? {}) },
  }
}
