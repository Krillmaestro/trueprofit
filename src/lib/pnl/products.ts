// ===========================================
// Product groups – maps order lines and ad campaigns to one product
// ===========================================
//
// Shopify has several duplicate products per item (old FirstZoo/FirstNutri
// listings, bundle copies), so grouping goes on title, not product id.
// E-books, guides, Leveransskydd and 0-kr gifts are add-ons: they follow the
// order's main product.

export interface ProductGroup {
  key: string
  name: string
  /** Matches order line titles */
  line: RegExp
  /** Matches campaign names (Meta + Google) */
  campaign: RegExp
}

export const PRODUCT_GROUPS: ProductGroup[] = [
  { key: 'probiotika', name: 'Probiotika', line: /probiotika/i, campaign: /probiotic|probiotika/i },
  { key: 'allergi', name: 'Quercetin+ (Klåda & Allergi)', line: /quercetin|klåda\s*&\s*allergi|klada/i, campaign: /allergi|klåda|klada|quercetin/i },
  { key: 'munhalsa', name: 'Munhälsa+', line: /munhälsa|munhalsa/i, campaign: /munhälsa|munhalsa|dental|tandvård/i },
  { key: 'led', name: 'Rörelse+', line: /ledtillskott|rörelse\+?/i, campaign: /ledtillskott|rörelse|\bled\b|joint/i },
  { key: 'skin', name: 'Skin & Coat', line: /skin\s*&\s*coat/i, campaign: /skin|päls/i },
  { key: 'calming', name: 'Relax+', line: /relax|daglig|calming/i, campaign: /relax|daglig|calming/i },
  { key: 'belöningsbitar', name: 'Belöningsbitar+', line: /belöningsbitar/i, campaign: /belöningsbitar|godis/i },
]

export const OTHER_GROUP = { key: 'ovrigt', name: 'Övrigt' }
export const UNALLOCATED_ADS = { key: 'ej-produkt', name: 'Ej produktspecifik (Shopping, Branded, Demand Gen …)' }

const ADDON = /guide|e-?bok|e-?book|leverans\s*skydd/i

export function isAddonLine(title: string, unitPrice: number): boolean {
  return unitPrice <= 0 || ADDON.test(title)
}

export function lineGroupKey(title: string): string {
  return PRODUCT_GROUPS.find((g) => g.line.test(title))?.key ?? OTHER_GROUP.key
}

export function campaignGroupKey(campaignName: string | null): string {
  if (!campaignName) return UNALLOCATED_ADS.key
  return PRODUCT_GROUPS.find((g) => g.campaign.test(campaignName))?.key ?? UNALLOCATED_ADS.key
}

export function groupName(key: string): string {
  if (key === OTHER_GROUP.key) return OTHER_GROUP.name
  if (key === UNALLOCATED_ADS.key) return UNALLOCATED_ADS.name
  return PRODUCT_GROUPS.find((g) => g.key === key)?.name ?? key
}

/**
 * The order's main product: the paid, non-add-on line with the highest value.
 * Returns the group key and number of units of that product.
 */
export function primaryProduct(
  lines: Array<{ title: string; price: number; quantity: number }>
): { key: string; units: number; singleProduct: boolean } {
  const totals = new Map<string, { value: number; units: number }>()
  for (const l of lines) {
    if (isAddonLine(l.title, l.price)) continue
    const key = lineGroupKey(l.title)
    const t = totals.get(key) ?? { value: 0, units: 0 }
    t.value += l.price * l.quantity
    t.units += l.quantity
    totals.set(key, t)
  }
  let best: { key: string; units: number } = { key: OTHER_GROUP.key, units: 0 }
  let bestValue = -1
  for (const [key, t] of totals) {
    if (t.value > bestValue) {
      best = { key, units: t.units }
      bestValue = t.value
    }
  }
  return { ...best, singleProduct: totals.size === 1 }
}
