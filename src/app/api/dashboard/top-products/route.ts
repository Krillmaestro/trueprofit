import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// Default payment fee configuration
const DEFAULT_FEE_RATE = 2.9
const DEFAULT_FIXED_FEE = 3

// GET /api/dashboard/top-products - Get top performing products
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const searchParams = request.nextUrl.searchParams
  const startDate = searchParams.get('startDate')
  const endDate = searchParams.get('endDate')
  const storeId = searchParams.get('storeId')
  const limit = parseInt(searchParams.get('limit') || '5')

  const teamMember = await prisma.teamMember.findFirst({
    where: { userId: session.user.id },
  })

  if (!teamMember) {
    return NextResponse.json({ error: 'No team found' }, { status: 404 })
  }

  // Default to current month if no dates specified
  const now = new Date()
  const defaultStartDate = new Date(now.getFullYear(), now.getMonth(), 1)
  const defaultEndDate = new Date(now.getFullYear(), now.getMonth() + 1, 0)

  const dateFilter = {
    gte: startDate ? new Date(startDate) : defaultStartDate,
    lte: endDate ? new Date(endDate) : defaultEndDate,
  }

  // Build store filter
  const storeFilter: { teamId: string; id?: string } = {
    teamId: teamMember.teamId,
  }
  if (storeId) {
    storeFilter.id = storeId
  }

  // Get stores
  const stores = await prisma.store.findMany({
    where: storeFilter,
  })

  const storeIds = stores.map((s) => s.id)

  // Get payment fee configurations
  const paymentFeeConfigs = await prisma.paymentFeeConfig.findMany({
    where: {
      storeId: storeId ? storeId : { in: storeIds },
      isActive: true,
    },
  })

  const feeConfigMap = new Map<string, { percentageFee: number; fixedFee: number }>()
  for (const config of paymentFeeConfigs) {
    feeConfigMap.set(config.gateway.toLowerCase(), {
      percentageFee: Number(config.percentageFee),
      fixedFee: Number(config.fixedFee),
    })
  }

  // Get all line items with orders in the date range
  const lineItems = await prisma.orderLineItem.findMany({
    where: {
      order: {
        storeId: { in: storeIds },
        processedAt: dateFilter,
        financialStatus: { in: ['paid', 'partially_paid', 'partially_refunded'] },
        cancelledAt: null,
      },
    },
    include: {
      order: {
        include: {
          transactions: true,
        },
      },
      variant: {
        include: {
          product: true,
          cogsEntries: {
            where: { effectiveTo: null },
            take: 1,
          },
        },
      },
    },
  })

  // Aggregate by product
  const productMap = new Map<string, {
    id: string
    name: string
    sku: string
    revenue: number
    cogs: number
    fees: number
    orders: Set<string>
    quantity: number
    hasCogs: boolean  // Track if this product has COGS data
  }>()

  for (const item of lineItems) {
    if (!item.variant?.product) continue

    const product = item.variant.product
    const productId = product.id

    const existing = productMap.get(productId) || {
      id: productId,
      name: product.title,
      sku: item.variant.sku || item.sku || 'N/A',
      revenue: 0,
      cogs: 0,
      fees: 0,
      orders: new Set<string>(),
      quantity: 0,
      hasCogs: false,
    }

    // Calculate revenue (price * quantity)
    const lineRevenue = Number(item.price) * item.quantity
    existing.revenue += lineRevenue

    // Calculate COGS
    if (item.variant.cogsEntries?.[0]) {
      existing.cogs += Number(item.variant.cogsEntries[0].costPrice) * item.quantity
      existing.hasCogs = true
    }

    // Calculate proportional fees based on line item revenue vs order total
    const orderTotal = Number(item.order.totalPrice)
    const lineRevenueRatio = orderTotal > 0 ? lineRevenue / orderTotal : 0

    let orderFees = 0
    if (item.order.transactions && item.order.transactions.length > 0) {
      for (const tx of item.order.transactions) {
        if (tx.paymentFeeCalculated && Number(tx.paymentFee) > 0) {
          orderFees += Number(tx.paymentFee)
        } else {
          const gateway = tx.gateway?.toLowerCase() || ''
          const config = feeConfigMap.get(gateway)
          if (config) {
            orderFees += (Number(tx.amount) * config.percentageFee / 100) + config.fixedFee
          } else {
            orderFees += (Number(tx.amount) * DEFAULT_FEE_RATE / 100) + DEFAULT_FIXED_FEE
          }
        }
      }
    } else {
      orderFees = (orderTotal * DEFAULT_FEE_RATE / 100) + DEFAULT_FIXED_FEE
    }

    existing.fees += orderFees * lineRevenueRatio
    existing.orders.add(item.orderId)
    existing.quantity += item.quantity

    productMap.set(productId, existing)
  }

  // Convert to array and calculate profits
  const products = Array.from(productMap.values())
    .map((p) => {
      const profit = p.revenue - p.cogs - p.fees
      // Only show margin if we have COGS data, otherwise null
      const margin = p.hasCogs && p.revenue > 0 ? (profit / p.revenue) * 100 : null

      return {
        id: p.id,
        name: p.name,
        sku: p.sku,
        revenue: Math.round(p.revenue * 100) / 100,
        cogs: Math.round(p.cogs * 100) / 100,
        profit: Math.round(profit * 100) / 100,
        margin: margin !== null ? Math.round(margin * 10) / 10 : null,  // null = no COGS data
        orders: p.orders.size,
        quantity: p.quantity,
        hasCogs: p.hasCogs,
        trend: 'stable' as const, // TODO: Could calculate by comparing with previous period
      }
    })
    .sort((a, b) => b.profit - a.profit)
    .slice(0, limit)

  return NextResponse.json({
    products,
    period: {
      startDate: dateFilter.gte.toISOString(),
      endDate: dateFilter.lte.toISOString(),
    },
  })
}
