/**
 * Smart Bank Transaction Categorizer
 * Ported from Python bank_analyzer.py
 */

export interface CategorizedTransaction {
  normalizedMerchant: string
  merchant: string
  category: string
  isSubscription: boolean
  isUnnecessary: boolean
  isExpense: boolean
  hasVat: boolean
  notes: string | null
}

// Subscription keywords
const SUBSCRIPTION_KEYWORDS = [
  'netflix', 'spotify', 'notion', 'adobe', 'dropbox', 'slack',
  'github', 'aws', 'google', 'microsoft', 'apple', 'icloud',
  'premium', 'pro', 'subscription', 'monthly', 'yearly',
  'canva', 'figma', 'zoom', 'linkedin', 'chatgpt', 'openai',
]

// Keywords that may indicate unnecessary expenses (for flagging)
const UNNECESSARY_KEYWORDS = [
  'facebook', 'facebk', 'instagram', 'ads', 'advertising',
  'meta platforms',
]

// VAT-applicable categories (25% in Sweden)
const VAT_CATEGORIES = [
  'Software Subscription',
  'Marketing & Ads',
  'Office Expenses',
  'Equipment',
]

// Merchant normalization rules
const MERCHANT_PATTERNS: Array<{
  pattern: RegExp | string
  merchant: string
  category: string
  isSubscription?: boolean
}> = [
  // Payment processors (Income)
  { pattern: /stripe/i, merchant: 'Stripe (Shopify)', category: 'Revenue - Shopify' },
  { pattern: /shopify/i, merchant: 'Shopify', category: 'Revenue - Shopify' },
  { pattern: /klarna/i, merchant: 'Klarna', category: 'Payments' },
  { pattern: /paypal/i, merchant: 'PayPal', category: 'Payments' },
  { pattern: /swish/i, merchant: 'Swish', category: 'Payments' },

  // Marketing & Ads
  { pattern: /facebk|facebook|meta platforms/i, merchant: 'Facebook Ads', category: 'Marketing & Ads' },
  { pattern: /google ads|adwords/i, merchant: 'Google Ads', category: 'Marketing & Ads' },
  { pattern: /tiktok/i, merchant: 'TikTok Ads', category: 'Marketing & Ads' },
  { pattern: /snapchat/i, merchant: 'Snapchat Ads', category: 'Marketing & Ads' },

  // Software subscriptions
  { pattern: /notion/i, merchant: 'Notion Labs', category: 'Software Subscription', isSubscription: true },
  { pattern: /adobe/i, merchant: 'Adobe', category: 'Software Subscription', isSubscription: true },
  { pattern: /canva/i, merchant: 'Canva', category: 'Software Subscription', isSubscription: true },
  { pattern: /figma/i, merchant: 'Figma', category: 'Software Subscription', isSubscription: true },
  { pattern: /slack/i, merchant: 'Slack', category: 'Software Subscription', isSubscription: true },
  { pattern: /github/i, merchant: 'GitHub', category: 'Software Subscription', isSubscription: true },
  { pattern: /dropbox/i, merchant: 'Dropbox', category: 'Software Subscription', isSubscription: true },
  { pattern: /zoom/i, merchant: 'Zoom', category: 'Software Subscription', isSubscription: true },
  { pattern: /microsoft/i, merchant: 'Microsoft', category: 'Software Subscription', isSubscription: true },
  { pattern: /openai|chatgpt/i, merchant: 'OpenAI', category: 'Software Subscription', isSubscription: true },
  { pattern: /aws|amazon web/i, merchant: 'AWS', category: 'Cloud Services', isSubscription: true },

  // Streaming & Entertainment
  { pattern: /netflix/i, merchant: 'Netflix', category: 'Entertainment', isSubscription: true },
  { pattern: /spotify/i, merchant: 'Spotify', category: 'Entertainment', isSubscription: true },
  { pattern: /apple music/i, merchant: 'Apple Music', category: 'Entertainment', isSubscription: true },

  // Banking & Fees
  { pattern: /income sorter/i, merchant: 'Income Sorter Fee', category: 'Transaction Fees' },
  { pattern: /avgift|fee|bankavgift/i, merchant: 'Bank Fee', category: 'Bank Fees' },
  { pattern: /ränta/i, merchant: 'Interest', category: 'Bank Fees' },

  // E-commerce platforms
  { pattern: /aliexpress/i, merchant: 'AliExpress', category: 'COGS - Supplier' },
  { pattern: /alibaba/i, merchant: 'Alibaba', category: 'COGS - Supplier' },
  { pattern: /cjdropshipping/i, merchant: 'CJ Dropshipping', category: 'COGS - Supplier' },

  // Shipping
  { pattern: /postnord/i, merchant: 'PostNord', category: 'Shipping' },
  { pattern: /dhl/i, merchant: 'DHL', category: 'Shipping' },
  { pattern: /ups/i, merchant: 'UPS', category: 'Shipping' },
  { pattern: /fedex/i, merchant: 'FedEx', category: 'Shipping' },
]

/**
 * Categorize a bank transaction
 */
export function categorizeTransaction(
  description: string,
  amount: number
): CategorizedTransaction {
  const descLower = description.toLowerCase()

  // Check subscription keywords
  const isSubscription = SUBSCRIPTION_KEYWORDS.some((kw) => descLower.includes(kw))
  const isUnnecessary = UNNECESSARY_KEYWORDS.some((kw) => descLower.includes(kw))

  // Try to match against known merchant patterns
  for (const rule of MERCHANT_PATTERNS) {
    const pattern = typeof rule.pattern === 'string'
      ? new RegExp(rule.pattern, 'i')
      : rule.pattern

    if (pattern.test(description)) {
      const hasVat = VAT_CATEGORIES.includes(rule.category)
      return {
        normalizedMerchant: rule.merchant,
        merchant: rule.merchant,
        category: amount > 0 && rule.category.startsWith('Revenue')
          ? rule.category
          : rule.category,
        isSubscription: rule.isSubscription || isSubscription,
        isUnnecessary,
        isExpense: amount < 0,
        hasVat,
        notes: null,
      }
    }
  }

  // Default categorization based on amount
  if (amount > 0) {
    // Check if it looks like a customer name (personal names)
    if (description.includes(',') || /^[A-ZÅÄÖ][a-zåäö]+ [A-ZÅÄÖ][a-zåäö]+$/.test(description)) {
      return {
        normalizedMerchant: 'Customer Payment',
        merchant: 'Customer Payment',
        category: 'Income',
        isSubscription: false,
        isUnnecessary: false,
        isExpense: false,
        hasVat: false,
        notes: null,
      }
    }

    return {
      normalizedMerchant: normalizeMerchantName(description),
      merchant: normalizeMerchantName(description),
      category: 'Income',
      isSubscription: false,
      isUnnecessary: false,
      isExpense: false,
      hasVat: false,
      notes: null,
    }
  }

  // Default expense
  return {
    normalizedMerchant: normalizeMerchantName(description),
    merchant: normalizeMerchantName(description),
    category: 'Other Expenses',
    isSubscription,
    isUnnecessary,
    isExpense: true,
    hasVat: false,
    notes: null,
  }
}

/**
 * Normalize merchant name from raw description
 */
export function normalizeMerchantName(description: string): string {
  // Remove common prefixes/suffixes
  let name = description
    .replace(/^\d{4}-\d{2}-\d{2}\s*/i, '') // Remove dates
    .replace(/\s*\d{2}:\d{2}:\d{2}\s*/i, '') // Remove times
    .replace(/\s*kortköp\s*/i, '')
    .replace(/\s*betalning\s*/i, '')
    .replace(/\s*överföring\s*/i, '')
    .trim()

  // Split by common delimiters and take first meaningful part
  const parts = name.split(/[*\s,;]+/)
  if (parts.length > 0) {
    name = parts[0]
  }

  // Capitalize first letter of each word
  return name
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ')
}

/**
 * Get category suggestions based on partial description
 */
export function suggestCategories(description: string): string[] {
  const suggestions: string[] = []
  const descLower = description.toLowerCase()

  for (const rule of MERCHANT_PATTERNS) {
    const pattern = typeof rule.pattern === 'string'
      ? new RegExp(rule.pattern, 'i')
      : rule.pattern

    if (pattern.test(description)) {
      if (!suggestions.includes(rule.category)) {
        suggestions.push(rule.category)
      }
    }
  }

  // Add default suggestions
  if (suggestions.length === 0) {
    suggestions.push('Other Expenses', 'Income', 'Office Expenses')
  }

  return suggestions.slice(0, 5)
}
