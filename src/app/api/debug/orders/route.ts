import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Get order counts and revenue by financial status
  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999)

  const teamMember = await prisma.teamMember.findFirst({
    where: { userId: session.user.id },
  })

  if (!teamMember) {
    return NextResponse.json({ error: 'No team' }, { status: 404 })
  }

  const stores = await prisma.store.findMany({
    where: { teamId: teamMember.teamId },
  })
  const storeIds = stores.map(s => s.id)

  // Get all orders for the month (no financial status filter)
  const allOrders = await prisma.order.findMany({
    where: {
      storeId: { in: storeIds },
      processedAt: {
        gte: startOfMonth,
        lte: endOfMonth,
      },
    },
    select: {
      financialStatus: true,
      subtotalPrice: true,
      totalPrice: true,
      cancelledAt: true,
    },
  })

  // Group by financial status
  const byStatus: Record<string, { count: number; subtotal: number; total: number }> = {}
  let cancelledCount = 0
  let cancelledRevenue = 0

  for (const order of allOrders) {
    const status = order.financialStatus || 'null'
    if (!byStatus[status]) {
      byStatus[status] = { count: 0, subtotal: 0, total: 0 }
    }
    byStatus[status].count++
    byStatus[status].subtotal += Number(order.subtotalPrice)
    byStatus[status].total += Number(order.totalPrice)

    if (order.cancelledAt) {
      cancelledCount++
      cancelledRevenue += Number(order.subtotalPrice)
    }
  }

  // Calculate totals
  const totalOrders = allOrders.length
  const totalSubtotal = allOrders.reduce((sum, o) => sum + Number(o.subtotalPrice), 0)
  const totalTotal = allOrders.reduce((sum, o) => sum + Number(o.totalPrice), 0)

  // What dashboard excludes (refunded, voided, cancelled)
  const excluded = allOrders.filter(o =>
    o.financialStatus === 'refunded' ||
    o.financialStatus === 'voided' ||
    o.cancelledAt !== null
  )
  const excludedRevenue = excluded.reduce((sum, o) => sum + Number(o.subtotalPrice), 0)

  return NextResponse.json({
    period: { start: startOfMonth, end: endOfMonth },
    totalOrders,
    totalSubtotalRevenue: totalSubtotal,
    totalTotalRevenue: totalTotal,
    byFinancialStatus: byStatus,
    cancelledOrders: { count: cancelledCount, revenue: cancelledRevenue },
    excludedFromDashboard: { count: excluded.length, revenue: excludedRevenue },
    includedInDashboard: {
      count: totalOrders - excluded.length,
      revenue: totalSubtotal - excludedRevenue
    },
  })
}
