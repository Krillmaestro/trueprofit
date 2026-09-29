export const SHOPIFY_API_VERSION = process.env.SHOPIFY_API_VERSION || '2026-07'

export function normalizeShopDomain(input: string): string | null {
  const value = input.trim().toLowerCase().replace(/^https:\/\//, '').replace(/\/$/, '')
  const domain = value.endsWith('.myshopify.com') ? value : `${value}.myshopify.com`
  return /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(domain) ? domain : null
}
