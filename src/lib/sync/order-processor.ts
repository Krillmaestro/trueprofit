/**
 * TrueProfit Unified Order Processor
 * Single function that handles orders from both webhooks and sync
 * Ensures consistent data regardless of source
 */

import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import {
  calculateOrderCOGS,
  buildCOGSData,
} from '@/lib/calculations/cogs'
import {
  COGSEntry,
  OrderForCalculation,
  PaymentFeeConfig,
  toNumber,
  roundCurrency,
} from '@/lib/calculations/types'
import { logError } from '@/lib/errors/safe-error'

// ===========================================
// TYPES
// ===========================================

export type OrderSource = 'webhook' | 'sync'

export interface ShopifyOrderData {
  id: number | bigint
  order_number?: string
  name?: string
  financial_status?: string
  fulfillment_status?: string
  currency?: string
  presentment_currency?: string

  // Prices
  subtotal_price?: string
  total_discounts?: string
  total_shipping_price_set?: {
    shop_money?: { amount?: string }
  }
  total_tax?: string
  total_price?: string

  // Customer
  email?: string
  customer?: {
    email?: string
    first_name?: string
    last_name?: string
  }
  shipping_address?: {
    country_code?: string
    city?: string
  }

  // Dates
  created_at: string
  updated_at: string
  processed_at?: string
  cancelled_at?: string

  // Metadata
  tags?: string
  note?: string
  source_url?: string
  landing_site?: string
  referring_site?: string

  // Related data
  line_items?: ShopifyLineItem[]
  transactions?: ShopifyTransaction[]
  refunds?: ShopifyRefund[]
}

export interface ShopifyLineItem {
  id: number | bigint
  product_id?: number | bigint
  variant_id?: number | bigint
  title: string
  variant_title?: string
  sku?: string
  quantity: number
  price: string
  total_discount?: string
  tax_lines?: Array<{ price: string }>
}

export interface ShopifyTransaction {
  id: number | bigint
  kind: string
  gateway: string
  status: string
  amount: string
  currency?: string
  processed_at?: string
}

export interface ShopifyRefund {
  id: number | bigint
  note?: string
  restock?: boolean
  created_at?: string
  processed_at?: string
  transactions?: Array<{
    id: number | bigint
    amount: string
  }>
  refund_line_items?: Array<{
    id: number | bigint
    line_item_id: number | bigint
    quantity: number
    subtotal: string
  }>
}

export interface OrderProcessResult {
  orderId: string
  created: boolean
  updated: boolean
  totalCOGS: number
  totalPaymentFees: number
  cogsMatchRate: number
}

// ===========================================
// HELPER FUNCTIONS
// ===========================================

function parseDecimal(value: string | number | undefined): number {
  if (value === undefined || value === null) return 0
  const parsed = typeof value === 'string' ? parseFloat(value) : value
  return isNaN(parsed) ? 0 : parsed
}

function parseTags(tags: string | undefined): string[] {
  if (!tags) return []
  return tags.split(',').map(t => t.trim()).filter(Boolean)
}

// ===========================================
// COGS LOOKUP
// ===========================================

async function getCOGSDataForStore(storeId: string) {
  const variants = await prisma.productVariant.findMany({
    where: {
      product: { storeId },
    },
    include: {
      cogsEntries: {
        orderBy: { effectiveFrom: 'desc' },
      },
    },
  })

  const entries: COGSEntry[] = []
  for (const variant of variants) {
    for (const cogs of variant.cogsEntries) {
      entries.push({
        id: cogs.id,
        variantId: variant.id,
        costPrice: cogs.costPrice,
        effectiveFrom: cogs.effectiveFrom,
        effectiveTo: cogs.effectiveTo,
        source: cogs.source,
        zoneId: cogs.zoneId,
      })
    }
  }

  return buildCOGSData(entries)
}

// ===========================================
// PAYMENT FEE CALCULATION
// ===========================================

async function getPaymentFeeConfigs(storeId: string): Promise<PaymentFeeConfig[]> {
  const configs = await prisma.paymentFeeConfig.findMany({
    where: { storeId, isActive: true },
  })

  return configs.map(c => ({
    gateway: c.gateway,
    feeType: c.feeType,
    percentageFee: c.percentageFee,
    fixedFee: c.fixedFee,
    currency: c.currency,
    isActive: c.isActive,
  }))
}

function calculatePaymentFee(
  amount: number,
  gateway: string,
  configs: PaymentFeeConfig[]
): number {
  const config = configs.find(
    c => c.gateway.toLowerCase() === gateway.toLowerCase()
  )

  if (!config) return 0

  const percentageFee = toNumber(config.percentageFee)
  const fixedFee = toNumber(config.fixedFee)

  switch (config.feeType) {
    case 'PERCENTAGE_ONLY':
      return roundCurrency(amount * percentageFee)
    case 'FIXED_ONLY':
      return roundCurrency(fixedFee)
    case 'PERCENTAGE_PLUS_FIXED':
      return roundCurrency(amount * percentageFee + fixedFee)
    default:
      return 0
  }
}

// ===========================================
// VARIANT LOOKUP
// ===========================================

async function findVariantId(
  storeId: string,
  shopifyVariantId: bigint | null
): Promise<string | null> {
  if (!shopifyVariantId) return null

  const variant = await prisma.productVariant.findFirst({
    where: {
      shopifyVariantId,
      product: { storeId },
    },
    select: { id: true },
  })

  return variant?.id || null
}

// ===========================================
// MAIN ORDER PROCESSOR
// ===========================================

/**
 * Process an order from either webhook or sync
 * Uses a transaction to ensure atomicity
 */
export async function processOrder(
  orderData: ShopifyOrderData,
  storeId: string,
  source: OrderSource
): Promise<OrderProcessResult> {
  const shopifyOrderId = BigInt(orderData.id)

  // Get COGS data and payment configs
  const [cogsData, paymentFeeConfigs] = await Promise.all([
    getCOGSDataForStore(storeId),
    getPaymentFeeConfigs(storeId),
  ])

  // Use transaction for atomicity
  return await prisma.$transaction(async (tx) => {
    // Check if order exists
    const existingOrder = await tx.order.findUnique({
      where: {
        storeId_shopifyOrderId: {
          storeId,
          shopifyOrderId,
        },
      },
      select: { id: true },
    })

    const isUpdate = existingOrder !== null

    // Prepare line items and calculate COGS
    const lineItemsData: Prisma.OrderLineItemCreateManyInput[] = []
    let totalCOGS = 0
    let cogsMatchedCount = 0
    let cogsTotalCount = 0

    for (const item of orderData.line_items || []) {
      const shopifyVariantId = item.variant_id ? BigInt(item.variant_id) : null
      const variantId = await findVariantId(storeId, shopifyVariantId)

      // Calculate tax for this line item
      const taxAmount = (item.tax_lines || []).reduce(
        (sum, tax) => sum + parseDecimal(tax.price),
        0
      )

      // Look up COGS
      let unitCOGS = 0
      let cogsSource: 'MANUAL' | 'CSV_IMPORT' | 'SHOPIFY_COST' | 'API' = 'MANUAL'

      if (variantId && cogsData.entries.has(variantId)) {
        const entries = cogsData.entries.get(variantId)!
        const orderDate = new Date(orderData.created_at)

        // Find COGS effective at order date
        for (const entry of entries) {
          if (entry.effectiveFrom <= orderDate &&
              (!entry.effectiveTo || entry.effectiveTo >= orderDate)) {
            unitCOGS = toNumber(entry.costPrice)
            cogsSource = entry.source as typeof cogsSource
            cogsMatchedCount++
            break
          }
        }
      }

      cogsTotalCount++
      const itemTotalCOGS = roundCurrency(unitCOGS * item.quantity)
      totalCOGS += itemTotalCOGS

      lineItemsData.push({
        orderId: existingOrder?.id || '', // Will be set after order creation
        shopifyLineItemId: BigInt(item.id),
        shopifyProductId: item.product_id ? BigInt(item.product_id) : null,
        shopifyVariantId,
        variantId,
        title: item.title,
        variantTitle: item.variant_title,
        sku: item.sku,
        quantity: item.quantity,
        price: new Prisma.Decimal(item.price),
        totalDiscount: new Prisma.Decimal(item.total_discount || '0'),
        taxAmount: new Prisma.Decimal(taxAmount),
        unitCOGS: new Prisma.Decimal(unitCOGS),
        totalCOGS: new Prisma.Decimal(itemTotalCOGS),
        cogsSource,
      })
    }

    // Calculate payment fees from transactions
    let totalPaymentFees = 0
    const transactionsData: Prisma.OrderTransactionCreateManyInput[] = []

    for (const txn of orderData.transactions || []) {
      const amount = parseDecimal(txn.amount)
      let paymentFee = 0

      if (txn.kind === 'sale' && txn.status === 'success') {
        paymentFee = calculatePaymentFee(amount, txn.gateway, paymentFeeConfigs)
        totalPaymentFees += paymentFee
      }

      transactionsData.push({
        orderId: existingOrder?.id || '', // Will be set after order creation
        shopifyTransactionId: BigInt(txn.id),
        kind: txn.kind,
        gateway: txn.gateway,
        status: txn.status,
        amount: new Prisma.Decimal(amount),
        currency: txn.currency || orderData.currency || 'SEK',
        paymentFee: new Prisma.Decimal(paymentFee),
        paymentFeeCalculated: true,
        processedAt: txn.processed_at ? new Date(txn.processed_at) : null,
      })
    }

    // Calculate total refunds from refund records
    let totalRefundAmount = 0
    const refundsData: Prisma.OrderRefundCreateManyInput[] = []

    for (const refund of orderData.refunds || []) {
      const refundAmount = (refund.transactions || []).reduce(
        (sum, t) => sum + parseDecimal(t.amount),
        0
      )
      totalRefundAmount += refundAmount

      refundsData.push({
        orderId: existingOrder?.id || '', // Will be set after order creation
        shopifyRefundId: BigInt(refund.id),
        note: refund.note,
        amount: new Prisma.Decimal(refundAmount),
        restock: refund.restock || false,
        processedAt: refund.processed_at
          ? new Date(refund.processed_at)
          : new Date(refund.created_at || Date.now()),
      })
    }

    // Calculate revenue and profit
    const subtotalPrice = parseDecimal(orderData.subtotal_price)
    const totalDiscounts = parseDecimal(orderData.total_discounts)
    const totalShippingPrice = parseDecimal(
      orderData.total_shipping_price_set?.shop_money?.amount
    )
    const totalTax = parseDecimal(orderData.total_tax)
    const totalPrice = parseDecimal(orderData.total_price)

    // Calculate profits
    // Net Revenue = Subtotal + Shipping - Discounts - Refunds
    const netRevenue = subtotalPrice + totalShippingPrice - totalDiscounts - totalRefundAmount
    // Revenue Ex VAT
    const revenueExVat = netRevenue - totalTax
    // Gross Profit = Revenue Ex VAT - COGS
    const grossProfit = revenueExVat - totalCOGS
    // Net Profit = Gross Profit - Payment Fees (shipping costs handled separately)
    const netProfit = grossProfit - totalPaymentFees
    // Profit Margin
    const profitMargin = revenueExVat > 0 ? netProfit / revenueExVat : 0

    // Prepare order data
    const orderUpsertData = {
      storeId,
      shopifyOrderId,
      orderNumber: orderData.order_number?.toString() || orderData.id.toString(),
      orderName: orderData.name,
      financialStatus: orderData.financial_status,
      fulfillmentStatus: orderData.fulfillment_status,
      currency: orderData.currency || 'SEK',
      presentmentCurrency: orderData.presentment_currency,

      // Revenue
      subtotalPrice: new Prisma.Decimal(subtotalPrice),
      totalDiscounts: new Prisma.Decimal(totalDiscounts),
      totalShippingPrice: new Prisma.Decimal(totalShippingPrice),
      totalTax: new Prisma.Decimal(totalTax),
      totalPrice: new Prisma.Decimal(totalPrice),

      // Costs (calculated)
      totalCOGS: new Prisma.Decimal(totalCOGS),
      totalShippingCost: new Prisma.Decimal(0), // Calculated from tiers separately
      totalPaymentFees: new Prisma.Decimal(totalPaymentFees),
      totalRefundAmount: new Prisma.Decimal(totalRefundAmount),

      // Profit
      grossProfit: new Prisma.Decimal(grossProfit),
      netProfit: new Prisma.Decimal(netProfit),
      profitMargin: new Prisma.Decimal(profitMargin),

      // Customer
      customerEmail: orderData.email || orderData.customer?.email,
      customerFirstName: orderData.customer?.first_name,
      customerLastName: orderData.customer?.last_name,
      shippingCountry: orderData.shipping_address?.country_code,
      shippingCity: orderData.shipping_address?.city,

      // Dates
      shopifyCreatedAt: new Date(orderData.created_at),
      shopifyUpdatedAt: new Date(orderData.updated_at),
      processedAt: orderData.processed_at ? new Date(orderData.processed_at) : null,
      cancelledAt: orderData.cancelled_at ? new Date(orderData.cancelled_at) : null,

      // Metadata
      tags: parseTags(orderData.tags),
      note: orderData.note,
      sourceUrl: orderData.source_url,
      landingSite: orderData.landing_site,
      referringSite: orderData.referring_site,
    }

    // Upsert order
    const order = await tx.order.upsert({
      where: {
        storeId_shopifyOrderId: {
          storeId,
          shopifyOrderId,
        },
      },
      create: orderUpsertData,
      update: orderUpsertData,
    })

    // Delete existing line items, transactions, refunds (for clean update)
    if (isUpdate) {
      await Promise.all([
        tx.orderLineItem.deleteMany({ where: { orderId: order.id } }),
        tx.orderTransaction.deleteMany({ where: { orderId: order.id } }),
        tx.orderRefund.deleteMany({ where: { orderId: order.id } }),
      ])
    }

    // Create line items
    if (lineItemsData.length > 0) {
      await tx.orderLineItem.createMany({
        data: lineItemsData.map(item => ({ ...item, orderId: order.id })),
      })
    }

    // Create transactions
    if (transactionsData.length > 0) {
      await tx.orderTransaction.createMany({
        data: transactionsData.map(txn => ({ ...txn, orderId: order.id })),
      })
    }

    // Create refunds
    if (refundsData.length > 0) {
      await tx.orderRefund.createMany({
        data: refundsData.map(refund => ({ ...refund, orderId: order.id })),
      })
    }

    const cogsMatchRate = cogsTotalCount > 0
      ? Math.round((cogsMatchedCount / cogsTotalCount) * 100)
      : 100

    return {
      orderId: order.id,
      created: !isUpdate,
      updated: isUpdate,
      totalCOGS,
      totalPaymentFees,
      cogsMatchRate,
    }
  })
}

// ===========================================
// BATCH PROCESSING
// ===========================================

/**
 * Process multiple orders in batch
 */
export async function processOrdersBatch(
  ordersData: ShopifyOrderData[],
  storeId: string,
  source: OrderSource
): Promise<{
  processed: number
  created: number
  updated: number
  failed: number
  errors: Array<{ orderId: string; error: string }>
}> {
  let processed = 0
  let created = 0
  let updated = 0
  let failed = 0
  const errors: Array<{ orderId: string; error: string }> = []

  for (const orderData of ordersData) {
    try {
      const result = await processOrder(orderData, storeId, source)
      processed++
      if (result.created) created++
      if (result.updated) updated++
    } catch (error) {
      failed++
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      errors.push({
        orderId: orderData.id.toString(),
        error: errorMessage,
      })
      logError(error, {
        context: 'processOrdersBatch',
        orderId: orderData.id.toString(),
        storeId,
      })
    }
  }

  return { processed, created, updated, failed, errors }
}
