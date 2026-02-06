import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

/**
 * DEBUG ENDPOINT - Shows raw database values to debug revenue calculation
 * GET /api/debug/revenue?date=2025-02-05 (single day)
 * GET /api/debug/revenue?startDate=2025-02-01&endDate=2025-02-28 (date range)
 */
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const searchParams = request.nextUrl.searchParams
  const singleDate = searchParams.get('date')
  const startDate = searchParams.get('startDate')
  const endDate = searchParams.get('endDate')

  const teamMember = await prisma.teamMember.findFirst({
    where: { userId: session.user.id },
  })

  if (!teamMember) {
    return NextResponse.json({ error: 'No team found' }, { status: 404 })
  }

  // Calculate date filter
  let dateFilter: { gte: Date; lte: Date }

  if (singleDate) {
    // Single day - from 00:00:00 to 23:59:59
    const date = new Date(singleDate)
    dateFilter = {
      gte: new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0),
      lte: new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59),
    }
  } else {
    const now = new Date()
    dateFilter = {
      gte: startDate ? new Date(startDate) : new Date(now.getFullYear(), now.getMonth(), 1),
      lte: endDate ? new Date(endDate) : new Date(now.getFullYear(), now.getMonth() + 1, 0),
    }
  }

  // Get stores
  const stores = await prisma.store.findMany({
    where: { teamId: teamMember.teamId },
    select: { id: true, name: true, shopifyDomain: true },
  })
  const storeIds = stores.map(s => s.id)

  // Get ALL orders for the period (no financial status filter first)
  const allOrders = await prisma.order.findMany({
    where: {
      storeId: { in: storeIds },
      processedAt: dateFilter,
    },
    select: {
      id: true,
      orderName: true,
      orderNumber: true,
      totalPrice: true,
      subtotalPrice: true,
      totalTax: true,
      totalDiscounts: true,
      totalShippingPrice: true,
      totalRefundAmount: true,
      financialStatus: true,
      fulfillmentStatus: true,
      cancelledAt: true,
      processedAt: true,
      shopifyCreatedAt: true,
      shopifyOrderId: true,
    },
    orderBy: { processedAt: 'asc' },
  })

  // Group by financial status to understand what we have
  const byFinancialStatus: Record<string, { count: number; totalPrice: number }> = {}
  for (const order of allOrders) {
    const status = order.financialStatus || 'null'
    if (!byFinancialStatus[status]) {
      byFinancialStatus[status] = { count: 0, totalPrice: 0 }
    }
    byFinancialStatus[status].count++
    byFinancialStatus[status].totalPrice += Number(order.totalPrice) || 0
  }

  // Get orders with our current filter (matching dashboard)
  const filteredOrders = allOrders.filter(o =>
    o.cancelledAt === null &&
    (o.financialStatus === null ||
     ['paid', 'partially_paid', 'partially_refunded', 'refunded'].includes(o.financialStatus || ''))
  )

  // Calculate totals from filtered orders
  let sumTotalPrice = 0
  let sumSubtotalPrice = 0
  let sumTotalTax = 0
  let sumTotalDiscounts = 0
  let sumTotalShippingPrice = 0
  let sumTotalRefundAmount = 0

  for (const order of filteredOrders) {
    sumTotalPrice += Number(order.totalPrice) || 0
    sumSubtotalPrice += Number(order.subtotalPrice) || 0
    sumTotalTax += Number(order.totalTax) || 0
    sumTotalDiscounts += Number(order.totalDiscounts) || 0
    sumTotalShippingPrice += Number(order.totalShippingPrice) || 0
    sumTotalRefundAmount += Number(order.totalRefundAmount) || 0
  }

  // Also calculate including cancelled orders
  let sumTotalPriceAll = 0
  for (const order of allOrders) {
    sumTotalPriceAll += Number(order.totalPrice) || 0
  }

  return NextResponse.json({
    period: {
      start: dateFilter.gte.toISOString(),
      end: dateFilter.lte.toISOString(),
      isSingleDay: !!singleDate,
    },
    stores,

    // Order counts
    counts: {
      allOrdersInPeriod: allOrders.length,
      afterFiltering: filteredOrders.length,
      cancelledOrders: allOrders.filter(o => o.cancelledAt !== null).length,
    },

    // Orders by financial status (helps identify what's missing)
    byFinancialStatus,

    // Raw sums from database (filtered)
    filteredSums: {
      totalPrice: Math.round(sumTotalPrice * 100) / 100,
      subtotalPrice: Math.round(sumSubtotalPrice * 100) / 100,
      totalTax: Math.round(sumTotalTax * 100) / 100,
      totalDiscounts: Math.round(sumTotalDiscounts * 100) / 100,
      totalShippingPrice: Math.round(sumTotalShippingPrice * 100) / 100,
      totalRefundAmount: Math.round(sumTotalRefundAmount * 100) / 100,
    },

    // Sum including ALL orders (no filter)
    allOrdersSum: Math.round(sumTotalPriceAll * 100) / 100,

    // All orders for inspection (for single day)
    orders: singleDate ? allOrders.map(o => ({
      orderName: o.orderName,
      orderNumber: o.orderNumber,
      shopifyOrderId: o.shopifyOrderId?.toString(),
      totalPrice: Number(o.totalPrice),
      subtotalPrice: Number(o.subtotalPrice),
      totalTax: Number(o.totalTax),
      totalDiscounts: Number(o.totalDiscounts),
      totalShippingPrice: Number(o.totalShippingPrice),
      totalRefundAmount: Number(o.totalRefundAmount),
      financialStatus: o.financialStatus,
      fulfillmentStatus: o.fulfillmentStatus,
      cancelledAt: o.cancelledAt,
      processedAt: o.processedAt,
      shopifyCreatedAt: o.shopifyCreatedAt,
    })) : `Use ?date=YYYY-MM-DD to see individual orders`,

    // Explanation
    explanation: {
      'Shopify Omsättning': 'Should equal sum of totalPrice for orders with paid/partially_paid/partially_refunded/refunded status, not cancelled',
      'If lower than Shopify': 'Either orders are missing (not synced) or we have wrong filter',
      'If higher than Shopify': 'We might be including orders Shopify excludes',
    },
  })
}
