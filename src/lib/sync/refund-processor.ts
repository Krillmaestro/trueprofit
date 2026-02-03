/**
 * TrueProfit Refund Processor
 * Consistent refund handling for both webhooks and sync
 *
 * CRITICAL RULES:
 * 1. Refunds are ALWAYS calculated from OrderRefund records (never increment)
 * 2. Uses upsert to handle duplicates gracefully
 */

import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
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
  created: boolean
  orderUpdated: boolean
}

// ===========================================
// MAIN REFUND PROCESSOR
// ===========================================

/**
 * Process a refund from either webhook or sync
 * Uses upsert to handle duplicates gracefully
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
    // Find the order
    const order = await tx.order.findUnique({
      where: {
        storeId_shopifyOrderId: {
          storeId,
          shopifyOrderId,
        },
      },
      select: {
        id: true,
      },
    })

    if (!order) {
      throw new Error(`Order not found: ${shopifyOrderId}`)
    }

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
        restock: refundData.restock || false,
        processedAt: refundData.processed_at
          ? new Date(refundData.processed_at)
          : new Date(refundData.created_at),
      },
      update: {
        note: refundData.note,
        amount: new Prisma.Decimal(refundAmount),
        restock: refundData.restock || false,
        processedAt: refundData.processed_at
          ? new Date(refundData.processed_at)
          : new Date(refundData.created_at),
      },
    })

    // Recalculate total refund amount from ALL refund records
    const totals = await tx.orderRefund.aggregate({
      where: { orderId: order.id },
      _sum: {
        amount: true,
      },
    })

    const totalRefundAmount = toNumber(totals._sum.amount)

    // Update order with recalculated totals
    await tx.order.update({
      where: { id: order.id },
      data: {
        totalRefundAmount: new Prisma.Decimal(totalRefundAmount),
      },
    })

    return {
      refundId: refund.id,
      orderId: order.id,
      amount: refundAmount,
      created: existingRefund === null,
      orderUpdated: true,
    }
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
  _storeId: string,
  refundsData: ShopifyRefundData[]
): Promise<{
  synced: number
  totalRefundAmount: number
}> {
  return await prisma.$transaction(async (tx) => {
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
      await tx.orderRefund.deleteMany({
        where: {
          orderId,
          shopifyRefundId: { in: toDelete.map(id => BigInt(id)) },
        },
      })
    }

    // Upsert all refunds from Shopify
    for (const refundData of refundsData) {
      const shopifyRefundId = BigInt(refundData.id)
      const refundAmount = (refundData.transactions || [])
        .filter(t => t.kind === 'refund')
        .reduce((sum, t) => sum + parseFloat(t.amount || '0'), 0)

      await tx.orderRefund.upsert({
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
          restock: refundData.restock || false,
          processedAt: refundData.processed_at
            ? new Date(refundData.processed_at)
            : new Date(refundData.created_at),
        },
        update: {
          note: refundData.note,
          amount: new Prisma.Decimal(refundAmount),
          restock: refundData.restock || false,
        },
      })
    }

    // Recalculate totals
    const totals = await tx.orderRefund.aggregate({
      where: { orderId },
      _sum: {
        amount: true,
      },
    })

    const totalRefundAmount = toNumber(totals._sum.amount)

    // Update order
    await tx.order.update({
      where: { id: orderId },
      data: {
        totalRefundAmount: new Prisma.Decimal(totalRefundAmount),
      },
    })

    return {
      synced: refundsData.length,
      totalRefundAmount: roundCurrency(totalRefundAmount),
    }
  })
}
