import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

/**
 * DEBUG ENDPOINT - Remove in production
 * Shows raw database values to debug revenue calculation
 */
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const searchParams = request.nextUrl.searchParams
  const startDate = searchParams.get('startDate')
  const endDate = searchParams.get('endDate')

  const teamMember = await prisma.teamMember.findFirst({
    where: { userId: session.user.id },
  })

  if (!teamMember) {
    return NextResponse.json({ error: 'No team found' }, { status: 404 })
  }

  // Default to current month
  const now = new Date()
  const dateFilter = {
    gte: startDate ? new Date(startDate) : new Date(now.getFullYear(), now.getMonth(), 1),
    lte: endDate ? new Date(endDate) : new Date(now.getFullYear(), now.getMonth() + 1, 0),
  }

  // Get stores
  const stores = await prisma.store.findMany({
    where: { teamId: teamMember.teamId },
    select: { id: true, name: true, shopifyDomain: true },
  })
  const storeIds = stores.map(s => s.id)

  // Get raw order data
  const orders = await prisma.order.findMany({
    where: {
      storeId: { in: storeIds },
      processedAt: dateFilter,
      financialStatus: { in: ['paid', 'partially_paid', 'partially_refunded'] },
      cancelledAt: null,
    },
    select: {
      id: true,
      orderName: true,
      totalPrice: true,
      subtotalPrice: true,
      totalTax: true,
      totalDiscounts: true,
      totalShippingPrice: true,
      totalRefundAmount: true,
      financialStatus: true,
      processedAt: true,
    },
    orderBy: { processedAt: 'asc' },
  })

  // Calculate totals from raw data
  let sumTotalPrice = 0
  let sumSubtotalPrice = 0
  let sumTotalTax = 0
  let sumTotalDiscounts = 0
  let sumTotalShippingPrice = 0
  let sumTotalRefundAmount = 0

  for (const order of orders) {
    sumTotalPrice += Number(order.totalPrice) || 0
    sumSubtotalPrice += Number(order.subtotalPrice) || 0
    sumTotalTax += Number(order.totalTax) || 0
    sumTotalDiscounts += Number(order.totalDiscounts) || 0
    sumTotalShippingPrice += Number(order.totalShippingPrice) || 0
    sumTotalRefundAmount += Number(order.totalRefundAmount) || 0
  }

  // Calculate omsättning both ways
  const nettoForsaljning = sumSubtotalPrice - sumTotalDiscounts - sumTotalRefundAmount
  const omsattningCalculated = nettoForsaljning + sumTotalShippingPrice + sumTotalTax

  // Sample orders (first 5 and last 5)
  const sampleOrders = [
    ...orders.slice(0, 5),
    ...orders.slice(-5),
  ].map(o => ({
    orderName: o.orderName,
    totalPrice: Number(o.totalPrice),
    subtotalPrice: Number(o.subtotalPrice),
    totalTax: Number(o.totalTax),
    totalDiscounts: Number(o.totalDiscounts),
    totalShippingPrice: Number(o.totalShippingPrice),
    totalRefundAmount: Number(o.totalRefundAmount),
    processedAt: o.processedAt,
  }))

  return NextResponse.json({
    period: {
      start: dateFilter.gte.toISOString(),
      end: dateFilter.lte.toISOString(),
    },
    orderCount: orders.length,
    stores,

    // Raw sums from database
    rawSums: {
      totalPrice: sumTotalPrice,
      subtotalPrice: sumSubtotalPrice,
      totalTax: sumTotalTax,
      totalDiscounts: sumTotalDiscounts,
      totalShippingPrice: sumTotalShippingPrice,
      totalRefundAmount: sumTotalRefundAmount,
    },

    // Calculated values
    calculations: {
      // Shopify's total_price should = Omsättning
      shopifyTotalPrice: sumTotalPrice,

      // Our calculation: Nettoförsäljning + Frakt + Moms
      nettoForsaljning,
      omsattningCalculated,

      // Difference
      difference: sumTotalPrice - omsattningCalculated,
    },

    // Shopify expected value
    shopifyExpected: 1117206.70,

    // Debug: What's the difference?
    differenceFromShopify: {
      ourTotalPrice: sumTotalPrice,
      shopifyOmsattning: 1117206.70,
      diff: sumTotalPrice - 1117206.70,
    },

    // Check for orders by month to debug historical sync
    ordersByMonth: await prisma.order.groupBy({
      by: ['processedAt'],
      where: {
        storeId: { in: storeIds },
        financialStatus: { in: ['paid', 'partially_paid', 'partially_refunded'] },
        cancelledAt: null,
      },
      _count: true,
      _sum: {
        totalPrice: true,
      },
    }).then(data => {
      // Group by year-month
      const byMonth: Record<string, { count: number; total: number }> = {}
      for (const d of data) {
        if (!d.processedAt) continue
        const key = d.processedAt.toISOString().substring(0, 7) // YYYY-MM
        if (!byMonth[key]) byMonth[key] = { count: 0, total: 0 }
        byMonth[key].count += d._count
        byMonth[key].total += Number(d._sum.totalPrice) || 0
      }
      return byMonth
    }),

    // Sample orders for inspection
    sampleOrders,
  })
}
