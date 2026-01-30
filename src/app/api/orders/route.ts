import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// Default payment fee configuration
const DEFAULT_FEE_RATE = 2.9
const DEFAULT_FIXED_FEE = 3

// GET /api/orders - Get orders list with profit calculations
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const searchParams = request.nextUrl.searchParams
  const storeId = searchParams.get('storeId')
  const startDate = searchParams.get('startDate')
  const endDate = searchParams.get('endDate')
  const search = searchParams.get('search')
  const page = parseInt(searchParams.get('page') || '1')
  const limit = parseInt(searchParams.get('limit') || '50')
  const skip = (page - 1) * limit

  const teamMember = await prisma.teamMember.findFirst({
    where: { userId: session.user.id },
  })

  if (!teamMember) {
    return NextResponse.json({ error: 'No team found' }, { status: 404 })
  }

  // Build date filter
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

  const stores = await prisma.store.findMany({
    where: storeFilter,
  })

  const storeIds = stores.map((s) => s.id)

  // Build search filter
  const searchFilter = search
    ? {
        OR: [
          { orderNumber: { contains: search, mode: 'insensitive' as const } },
          { orderName: { contains: search, mode: 'insensitive' as const } },
          { customerEmail: { contains: search, mode: 'insensitive' as const } },
          { customerFirstName: { contains: search, mode: 'insensitive' as const } },
          { customerLastName: { contains: search, mode: 'insensitive' as const } },
        ],
      }
    : {}

  // Get payment fee configs
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

  // Count total
  const totalCount = await prisma.order.count({
    where: {
      storeId: { in: storeIds },
      processedAt: dateFilter,
      financialStatus: { in: ['paid', 'partially_paid', 'partially_refunded'] },
      ...searchFilter,
    },
  })

  // Get orders with line items for COGS calculation
  const orders = await prisma.order.findMany({
    where: {
      storeId: { in: storeIds },
      processedAt: dateFilter,
      financialStatus: { in: ['paid', 'partially_paid', 'partially_refunded'] },
      ...searchFilter,
    },
    include: {
      lineItems: {
        include: {
          variant: {
            include: {
              cogsEntries: {
                where: { effectiveTo: null },
                take: 1,
              },
            },
          },
        },
      },
      transactions: true,
      refunds: true,
      store: {
        select: { name: true, currency: true },
      },
    },
    orderBy: { processedAt: 'desc' },
    skip,
    take: limit,
  })

  // Calculate profit for each order
  const ordersWithProfit = orders.map((order) => {
    // Revenue matches Shopify (totalPrice includes tax and shipping)
    const grossRevenue = Number(order.totalPrice)
    const tax = Number(order.totalTax)
    const refunds = order.refunds?.reduce((sum, r) => sum + Number(r.amount), 0) || Number(order.totalRefundAmount)
    // Net revenue excludes VAT and refunds for profit calculation
    const revenueExVat = grossRevenue - tax - refunds
    const netRevenue = revenueExVat - Number(order.totalDiscounts)

    // Calculate COGS
    let cogs = 0
    let matchedItems = 0
    for (const item of order.lineItems) {
      if (item.variant?.cogsEntries?.[0]) {
        cogs += Number(item.variant.cogsEntries[0].costPrice) * item.quantity
        matchedItems++
      }
    }

    // Calculate fees
    let fees = 0
    if (order.transactions && order.transactions.length > 0) {
      for (const tx of order.transactions) {
        if (tx.paymentFeeCalculated && Number(tx.paymentFee) > 0) {
          fees += Number(tx.paymentFee)
        } else {
          const gateway = tx.gateway?.toLowerCase() || ''
          const config = feeConfigMap.get(gateway)
          if (config) {
            fees += (Number(tx.amount) * config.percentageFee / 100) + config.fixedFee
          } else {
            fees += (Number(tx.amount) * DEFAULT_FEE_RATE / 100) + DEFAULT_FIXED_FEE
          }
        }
      }
    } else {
      fees = (Number(order.totalPrice) * DEFAULT_FEE_RATE / 100) + DEFAULT_FIXED_FEE
    }

    const shipping = Number(order.totalShippingPrice)
    const profit = netRevenue - cogs - shipping - fees
    const margin = netRevenue > 0 ? (profit / netRevenue) * 100 : 0

    return {
      id: order.id,
      orderNumber: order.orderName || order.orderNumber,
      date: order.processedAt?.toISOString().split('T')[0] || '',
      customer: [order.customerFirstName, order.customerLastName].filter(Boolean).join(' ') || 'Unknown',
      customerEmail: order.customerEmail,
      items: order.lineItems.length,
      revenue: grossRevenue,  // Matches Shopify (totalPrice)
      tax,  // VAT amount
      revenueExVat,  // Revenue excluding VAT
      netRevenue,  // After VAT, discounts, refunds
      cogs,
      shipping,
      fees,
      profit,
      margin,
      status: order.fulfillmentStatus || 'unfulfilled',
      financialStatus: order.financialStatus,
      currency: order.currency || order.store?.currency || 'SEK',
      cogsMatched: matchedItems,
      cogsTotal: order.lineItems.length,
    }
  })

  // Calculate totals
  const totals = ordersWithProfit.reduce(
    (acc, o) => ({
      revenue: acc.revenue + o.revenue,
      cogs: acc.cogs + o.cogs,
      fees: acc.fees + o.fees,
      profit: acc.profit + o.profit,
      items: acc.items + o.items,
    }),
    { revenue: 0, cogs: 0, fees: 0, profit: 0, items: 0 }
  )

  const avgMargin = totals.revenue > 0 ? (totals.profit / totals.revenue) * 100 : 0

  return NextResponse.json({
    orders: ordersWithProfit,
    totals: {
      ...totals,
      avgMargin,
      orderCount: ordersWithProfit.length,
    },
    pagination: {
      page,
      limit,
      total: totalCount,
      totalPages: Math.ceil(totalCount / limit),
    },
    period: {
      startDate: dateFilter.gte.toISOString(),
      endDate: dateFilter.lte.toISOString(),
    },
  })
}
