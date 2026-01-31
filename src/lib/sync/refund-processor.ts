/**
 * TrueProfit Refund Processor
 * Consistent refund handling for both webhooks and sync
 *
 * CRITICAL RULES:
 * 1. Refunds are ALWAYS calculated from OrderRefund records (never increment)
 * 2. COGS reversal is done per LINE ITEM (not proportionally)
 * 3. Uses upsert to handle duplicates gracefully
 */

import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import { logError } from '@/lib/errors/safe-error'
import { roundCurrency, toNumber } from '@/lib/calculations/types'

// ===========================================
// TYPES
// ===========================================

export interface ShopifyRefundData {
  id: number | bigint
  order_id: number | bigint
  note?: string
  restock?: boolean
  created_at: string
  processed_at?: string
  transactions?: Array<{
    id: number | bigint
    kind: string
    amount: string
    currency?: string
  }>
  refund_line_items?: Array<{
    id: number | bigint
    line_item_id: number | bigint
    quantity: number
    subtotal: string
    total_tax?: string
    restock_type?: string // "no_restock", "cancel", "return"
  }>
}

export interface RefundProcessResult {
  refundId: string
  orderId: string
  amount: number
  cogsReversed: number
  lineItemsProcessed: number
  created: boolean
  orderUpdated: boolean
}

// ===========================================
// MAIN REFUND PROCESSOR
// ===========================================

/**
 * Process a refund from either webhook or sync
 * Uses upsert to handle duplicates gracefully
 * Includes LINE ITEM level COGS reversal
 */
export async function processRefund(
  refundData: ShopifyRefundData,
  storeId: string
): Promise<RefundProcessResult> {
  const shopifyRefundId = BigInt(refundData.id)
  const shopifyOrderId = BigInt(refundData.order_id)

  // Calculate refund amount from transactions
  const refundAmount = (refundData.transactions || [])
    .filter(t => t.kind === 'refund')
    .reduce((sum, t) => sum + parseFloat(t.amount || '0'), 0)

  return await prisma.$transaction(async (tx) => {
    // Find the order with line items for COGS lookup
    const order = await tx.order.findUnique({
      where: {
        storeId_shopifyOrderId: {
          storeId,
          shopifyOrderId,
        },
      },
      select: {
        id: true,
        lineItems: {
          select: {
            id: true,
            shopifyLineItemId: true,
            unitCOGS: true,
          },
        },
      },
    })

    if (!order) {
      throw new Error(`Order not found: ${shopifyOrderId}`)
    }

    // Create a lookup map for line items
    const lineItemMap = new Map(
      order.lineItems.map(li => [li.shopifyLineItemId.toString(), li])
    )

    // Check if refund already exists
    const existingRefund = await tx.orderRefund.findUnique({
      where: {
        orderId_shopifyRefundId: {
          orderId: order.id,
          shopifyRefundId,
        },
      },
      select: { id: true },
    })

    // Calculate total COGS to reverse from line items
    let totalCOGSReversed = 0
    const refundLineItemsData: Array<{
      shopifyLineItemId: bigint
      lineItemId: string | null
      quantity: number
      restockType: string | null
      unitCOGS: number
      totalCOGS: number
    }> = []

    if (refundData.refund_line_items && refundData.refund_line_items.length > 0) {
      for (const rli of refundData.refund_line_items) {
        const shopifyLineItemId = BigInt(rli.line_item_id)
        const lineItem = lineItemMap.get(shopifyLineItemId.toString())

        const unitCOGS = lineItem ? toNumber(lineItem.unitCOGS) : 0
        const lineCOGS = unitCOGS * rli.quantity
        totalCOGSReversed += lineCOGS

        refundLineItemsData.push({
          shopifyLineItemId,
          lineItemId: lineItem?.id ?? null,
          quantity: rli.quantity,
          restockType: rli.restock_type ?? null,
          unitCOGS: roundCurrency(unitCOGS),
          totalCOGS: roundCurrency(lineCOGS),
        })
      }
    }

    // Upsert the refund record
    const refund = await tx.orderRefund.upsert({
      where: {
        orderId_shopifyRefundId: {
          orderId: order.id,
          shopifyRefundId,
        },
      },
      create: {
        orderId: order.id,
        shopifyRefundId,
        note: refundData.note,
        amount: new Prisma.Decimal(refundAmount),
        totalCOGSReversed: new Prisma.Decimal(totalCOGSReversed),
        restock: refundData.restock || false,
        processedAt: refundData.processed_at
          ? new Date(refundData.processed_at)
          : new Date(refundData.created_at),
      },
      update: {
        note: refundData.note,
        amount: new Prisma.Decimal(refundAmount),
        totalCOGSReversed: new Prisma.Decimal(totalCOGSReversed),
        restock: refundData.restock || false,
        processedAt: refundData.processed_at
          ? new Date(refundData.processed_at)
          : new Date(refundData.created_at),
      },
    })

    // Upsert refund line items for detailed COGS tracking
    if (refundLineItemsData.length > 0) {
      // Delete existing line items for this refund (to handle updates)
      await tx.orderRefundLineItem.deleteMany({
        where: { refundId: refund.id },
      })

      // Create new line items
      await tx.orderRefundLineItem.createMany({
        data: refundLineItemsData.map(rli => ({
          refundId: refund.id,
          lineItemId: rli.lineItemId,
          shopifyLineItemId: rli.shopifyLineItemId,
          quantity: rli.quantity,
          restockType: rli.restockType,
          unitCOGS: new Prisma.Decimal(rli.unitCOGS),
          totalCOGS: new Prisma.Decimal(rli.totalCOGS),
        })),
      })
    }

    // Recalculate total refund amount from ALL refund records
    const totals = await tx.orderRefund.aggregate({
      where: { orderId: order.id },
      _sum: {
        amount: true,
        totalCOGSReversed: true,
      },
    })

    const totalRefundAmount = toNumber(totals._sum.amount)
    const totalRefundCOGS = toNumber(totals._sum.totalCOGSReversed)

    // Update order with recalculated totals
    await recalculateOrderProfits(tx, order.id, totalRefundAmount, totalRefundCOGS)

    return {
      refundId: refund.id,
      orderId: order.id,
      amount: refundAmount,
      cogsReversed: roundCurrency(totalCOGSReversed),
      lineItemsProcessed: refundLineItemsData.length,
      created: existingRefund === null,
      orderUpdated: true,
    }
  })
}

// ===========================================
// ORDER PROFIT RECALCULATION
// ===========================================

/**
 * Recalculate order profits after a refund
 * Includes COGS reversal from line items
 */
async function recalculateOrderProfits(
  tx: Prisma.TransactionClient,
  orderId: string,
  totalRefundAmount: number,
  totalRefundCOGS: number
): Promise<void> {
  // Get current order data
  const order = await tx.order.findUnique({
    where: { id: orderId },
    select: {
      subtotalPrice: true,
      totalDiscounts: true,
      totalShippingPrice: true,
      totalTax: true,
      totalCOGS: true,
      totalPaymentFees: true,
    },
  })

  if (!order) return

  const subtotal = toNumber(order.subtotalPrice)
  const discounts = toNumber(order.totalDiscounts)
  const shipping = toNumber(order.totalShippingPrice)
  const tax = toNumber(order.totalTax)
  const originalCOGS = toNumber(order.totalCOGS)
  const paymentFees = toNumber(order.totalPaymentFees)

  // Adjust COGS for refunded items
  const effectiveCOGS = originalCOGS - totalRefundCOGS

  // Recalculate profits
  const netRevenue = subtotal + shipping - discounts - totalRefundAmount
  const revenueExVat = netRevenue - tax
  const grossProfit = revenueExVat - effectiveCOGS
  const netProfit = grossProfit - paymentFees
  const profitMargin = revenueExVat > 0 ? netProfit / revenueExVat : 0

  // Update order
  await tx.order.update({
    where: { id: orderId },
    data: {
      totalRefundAmount: new Prisma.Decimal(totalRefundAmount),
      grossProfit: new Prisma.Decimal(roundCurrency(grossProfit)),
      netProfit: new Prisma.Decimal(roundCurrency(netProfit)),
      profitMargin: new Prisma.Decimal(profitMargin),
    },
  })
}

// ===========================================
// BULK REFUND SYNC
// ===========================================

/**
 * Sync all refunds for an order
 * Used during full sync to ensure consistency
 */
export async function syncOrderRefunds(
  orderId: string,
  storeId: string,
  refundsData: ShopifyRefundData[]
): Promise<{
  synced: number
  totalRefundAmount: number
  totalCOGSReversed: number
}> {
  return await prisma.$transaction(async (tx) => {
    // Get order with line items
    const order = await tx.order.findUnique({
      where: { id: orderId },
      select: {
        lineItems: {
          select: {
            id: true,
            shopifyLineItemId: true,
            unitCOGS: true,
          },
        },
      },
    })

    if (!order) {
      throw new Error(`Order not found: ${orderId}`)
    }

    const lineItemMap = new Map(
      order.lineItems.map(li => [li.shopifyLineItemId.toString(), li])
    )

    // Get current refunds
    const existingRefunds = await tx.orderRefund.findMany({
      where: { orderId },
      select: { shopifyRefundId: true },
    })

    const existingIds = new Set(existingRefunds.map(r => r.shopifyRefundId.toString()))
    const newIds = new Set(refundsData.map(r => r.id.toString()))

    // Delete refunds that no longer exist in Shopify
    const toDelete = [...existingIds].filter(id => !newIds.has(id))
    if (toDelete.length > 0) {
      // First delete the line items
      const refundsToDelete = await tx.orderRefund.findMany({
        where: {
          orderId,
          shopifyRefundId: { in: toDelete.map(id => BigInt(id)) },
        },
        select: { id: true },
      })

      if (refundsToDelete.length > 0) {
        await tx.orderRefundLineItem.deleteMany({
          where: { refundId: { in: refundsToDelete.map(r => r.id) } },
        })

        await tx.orderRefund.deleteMany({
          where: { id: { in: refundsToDelete.map(r => r.id) } },
        })
      }
    }

    // Upsert all refunds from Shopify
    for (const refundData of refundsData) {
      const shopifyRefundId = BigInt(refundData.id)
      const refundAmount = (refundData.transactions || [])
        .filter(t => t.kind === 'refund')
        .reduce((sum, t) => sum + parseFloat(t.amount || '0'), 0)

      // Calculate COGS from line items
      let refundCOGS = 0
      const lineItemsData: Array<{
        shopifyLineItemId: bigint
        lineItemId: string | null
        quantity: number
        restockType: string | null
        unitCOGS: number
        totalCOGS: number
      }> = []

      if (refundData.refund_line_items) {
        for (const rli of refundData.refund_line_items) {
          const shopifyLineItemId = BigInt(rli.line_item_id)
          const lineItem = lineItemMap.get(shopifyLineItemId.toString())
          const unitCOGS = lineItem ? toNumber(lineItem.unitCOGS) : 0
          const lineCOGS = unitCOGS * rli.quantity
          refundCOGS += lineCOGS

          lineItemsData.push({
            shopifyLineItemId,
            lineItemId: lineItem?.id ?? null,
            quantity: rli.quantity,
            restockType: rli.restock_type ?? null,
            unitCOGS: roundCurrency(unitCOGS),
            totalCOGS: roundCurrency(lineCOGS),
          })
        }
      }

      const refund = await tx.orderRefund.upsert({
        where: {
          orderId_shopifyRefundId: {
            orderId,
            shopifyRefundId,
          },
        },
        create: {
          orderId,
          shopifyRefundId,
          note: refundData.note,
          amount: new Prisma.Decimal(refundAmount),
          totalCOGSReversed: new Prisma.Decimal(refundCOGS),
          restock: refundData.restock || false,
          processedAt: refundData.processed_at
            ? new Date(refundData.processed_at)
            : new Date(refundData.created_at),
        },
        update: {
          note: refundData.note,
          amount: new Prisma.Decimal(refundAmount),
          totalCOGSReversed: new Prisma.Decimal(refundCOGS),
          restock: refundData.restock || false,
        },
      })

      // Update line items
      if (lineItemsData.length > 0) {
        await tx.orderRefundLineItem.deleteMany({
          where: { refundId: refund.id },
        })

        await tx.orderRefundLineItem.createMany({
          data: lineItemsData.map(rli => ({
            refundId: refund.id,
            lineItemId: rli.lineItemId,
            shopifyLineItemId: rli.shopifyLineItemId,
            quantity: rli.quantity,
            restockType: rli.restockType,
            unitCOGS: new Prisma.Decimal(rli.unitCOGS),
            totalCOGS: new Prisma.Decimal(rli.totalCOGS),
          })),
        })
      }
    }

    // Recalculate totals
    const totals = await tx.orderRefund.aggregate({
      where: { orderId },
      _sum: {
        amount: true,
        totalCOGSReversed: true,
      },
    })

    const totalRefundAmount = toNumber(totals._sum.amount)
    const totalCOGSReversed = toNumber(totals._sum.totalCOGSReversed)

    // Update order
    await recalculateOrderProfits(tx, orderId, totalRefundAmount, totalCOGSReversed)

    return {
      synced: refundsData.length,
      totalRefundAmount: roundCurrency(totalRefundAmount),
      totalCOGSReversed: roundCurrency(totalCOGSReversed),
    }
  })
}

// ===========================================
// REFUND COGS CALCULATION (For reporting)
// ===========================================

/**
 * Get total COGS adjustment for refunds on an order
 * Uses line-item level tracking when available
 */
export async function getRefundCOGSAdjustment(
  orderId: string
): Promise<{
  totalCOGSReversed: number
  hasLineItemDetail: boolean
}> {
  const refunds = await prisma.orderRefund.findMany({
    where: { orderId },
    select: {
      totalCOGSReversed: true,
      lineItems: {
        select: { totalCOGS: true },
      },
    },
  })

  let totalCOGSReversed = 0
  let hasLineItemDetail = false

  for (const refund of refunds) {
    if (refund.lineItems.length > 0) {
      hasLineItemDetail = true
      totalCOGSReversed += refund.lineItems.reduce(
        (sum, li) => sum + toNumber(li.totalCOGS),
        0
      )
    } else {
      totalCOGSReversed += toNumber(refund.totalCOGSReversed)
    }
  }

  return {
    totalCOGSReversed: roundCurrency(totalCOGSReversed),
    hasLineItemDetail,
  }
}
