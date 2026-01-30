/**
 * Shipping Cost Calculator
 * Handles bundled/tiered shipping cost calculations
 *
 * Example configuration:
 * - 1 item = 32 kr
 * - 2 items = 42 kr
 * - 3+ items = 52 kr base + 5 kr per additional item
 */

export interface ShippingTier {
  minItems: number
  maxItems: number | null
  cost: number
  costPerAdditionalItem: number
  shippingZone?: string | null
}

/**
 * Calculate the shipping cost for an order based on item count and tiers
 *
 * @param itemCount - Number of items in the order
 * @param tiers - Shipping cost tiers (should be sorted by minItems ascending)
 * @param zone - Optional shipping zone to filter tiers
 * @returns The calculated shipping cost
 *
 * @example
 * const tiers = [
 *   { minItems: 1, maxItems: 1, cost: 32, costPerAdditionalItem: 0 },
 *   { minItems: 2, maxItems: 2, cost: 42, costPerAdditionalItem: 0 },
 *   { minItems: 3, maxItems: null, cost: 52, costPerAdditionalItem: 5 },
 * ]
 *
 * calculateShippingCost(1, tiers) // Returns 32
 * calculateShippingCost(2, tiers) // Returns 42
 * calculateShippingCost(3, tiers) // Returns 52
 * calculateShippingCost(5, tiers) // Returns 52 + (5-3)*5 = 62
 */
export function calculateShippingCost(
  itemCount: number,
  tiers: ShippingTier[],
  zone?: string
): number {
  if (itemCount <= 0 || tiers.length === 0) {
    return 0
  }

  // Filter by zone if specified
  const applicableTiers = zone
    ? tiers.filter((t) => !t.shippingZone || t.shippingZone === zone)
    : tiers

  if (applicableTiers.length === 0) {
    return 0
  }

  // Sort by minItems ascending
  const sortedTiers = [...applicableTiers].sort((a, b) => a.minItems - b.minItems)

  // Find the matching tier
  let matchingTier: ShippingTier | null = null

  for (const tier of sortedTiers) {
    if (itemCount >= tier.minItems) {
      if (tier.maxItems === null || itemCount <= tier.maxItems) {
        matchingTier = tier
        break
      }
    }
  }

  // If no exact match, use the highest tier
  if (!matchingTier) {
    matchingTier = sortedTiers[sortedTiers.length - 1]
  }

  if (!matchingTier) {
    return 0
  }

  // Calculate base cost
  let cost = matchingTier.cost

  // Add per-additional-item cost if applicable
  if (matchingTier.costPerAdditionalItem > 0 && itemCount > matchingTier.minItems) {
    const extraItems = itemCount - matchingTier.minItems
    cost += extraItems * matchingTier.costPerAdditionalItem
  }

  return Math.round(cost * 100) / 100 // Round to 2 decimal places
}

/**
 * Calculate total shipping savings compared to per-item shipping
 *
 * @param itemCount - Number of items in the order
 * @param tiers - Shipping cost tiers
 * @param perItemCost - What shipping would cost per item without bundling
 * @returns Object with bundled cost, unbundled cost, and savings
 */
export function calculateShippingSavings(
  itemCount: number,
  tiers: ShippingTier[],
  perItemCost?: number
): {
  bundledCost: number
  unbundledCost: number
  savings: number
  savingsPercent: number
} {
  const bundledCost = calculateShippingCost(itemCount, tiers)

  // Use the first tier's cost as per-item cost if not provided
  const singleItemCost = perItemCost ?? tiers[0]?.cost ?? 0
  const unbundledCost = singleItemCost * itemCount

  const savings = unbundledCost - bundledCost
  const savingsPercent = unbundledCost > 0 ? (savings / unbundledCost) * 100 : 0

  return {
    bundledCost,
    unbundledCost,
    savings,
    savingsPercent: Math.round(savingsPercent * 10) / 10,
  }
}

/**
 * Create default shipping tiers for Swedish e-commerce
 * Based on typical PostNord/DHL rates
 */
export function getDefaultSwedishShippingTiers(): ShippingTier[] {
  return [
    { minItems: 1, maxItems: 1, cost: 32, costPerAdditionalItem: 0, shippingZone: 'SE' },
    { minItems: 2, maxItems: 2, cost: 42, costPerAdditionalItem: 0, shippingZone: 'SE' },
    { minItems: 3, maxItems: 5, cost: 52, costPerAdditionalItem: 5, shippingZone: 'SE' },
    { minItems: 6, maxItems: null, cost: 72, costPerAdditionalItem: 3, shippingZone: 'SE' },
  ]
}

/**
 * Validate shipping tiers configuration
 * @returns Array of validation errors, empty if valid
 */
export function validateShippingTiers(tiers: ShippingTier[]): string[] {
  const errors: string[] = []

  if (tiers.length === 0) {
    errors.push('At least one shipping tier is required')
    return errors
  }

  // Sort by minItems
  const sortedTiers = [...tiers].sort((a, b) => a.minItems - b.minItems)

  // Check that first tier starts at 1
  if (sortedTiers[0].minItems !== 1) {
    errors.push('First tier must start at 1 item')
  }

  // Check for gaps or overlaps
  for (let i = 0; i < sortedTiers.length - 1; i++) {
    const current = sortedTiers[i]
    const next = sortedTiers[i + 1]

    if (current.maxItems !== null) {
      if (current.maxItems + 1 !== next.minItems) {
        errors.push(
          `Gap or overlap between tier ${i + 1} (max: ${current.maxItems}) and tier ${i + 2} (min: ${next.minItems})`
        )
      }
    }
  }

  // Check for negative costs
  for (const tier of tiers) {
    if (tier.cost < 0) {
      errors.push(`Tier with minItems=${tier.minItems} has negative cost`)
    }
    if (tier.costPerAdditionalItem < 0) {
      errors.push(`Tier with minItems=${tier.minItems} has negative per-item cost`)
    }
  }

  return errors
}
