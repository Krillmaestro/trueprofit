import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// GET /api/products - Get products with sales and profit data
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

  // Build date filter for order data
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

  // Build search filter for products
  const searchFilter = search
    ? {
        OR: [
          { title: { contains: search, mode: 'insensitive' as const } },
          { handle: { contains: search, mode: 'insensitive' as const } },
          { vendor: { contains: search, mode: 'insensitive' as const } },
          { variants: { some: { sku: { contains: search, mode: 'insensitive' as const } } } },
        ],
      }
    : {}

  // Count total products
  const totalCount = await prisma.product.count({
    where: {
      storeId: { in: storeIds },
      status: { not: 'archived' },
      ...searchFilter,
    },
  })

  // Get products with variants and COGS
  const products = await prisma.product.findMany({
    where: {
      storeId: { in: storeIds },
      status: { not: 'archived' },
      ...searchFilter,
    },
    include: {
      variants: {
        include: {
          cogsEntries: {
            where: { effectiveTo: null },
            take: 1,
          },
        },
      },
      store: {
        select: { name: true, currency: true },
      },
    },
    orderBy: { title: 'asc' },
    skip,
    take: limit,
  })

  // Get sales data for these products from line items
  const variantIds = products.flatMap((p) => p.variants.map((v) => v.id))

  // Get aggregated sales data per variant
  const salesData = await prisma.orderLineItem.groupBy({
    by: ['variantId'],
    where: {
      variantId: { in: variantIds },
      order: {
        processedAt: dateFilter,
        financialStatus: { in: ['paid', 'partially_paid', 'partially_refunded'] },
      },
    },
    _sum: {
      quantity: true,
      price: true,
      totalDiscount: true,
    },
    _count: true,
  })

  // Build sales lookup
  const salesLookup = new Map<string, { quantity: number; revenue: number; orders: number }>()
  for (const sale of salesData) {
    if (sale.variantId) {
      const quantity = sale._sum.quantity || 0
      const price = Number(sale._sum.price || 0)
      const discount = Number(sale._sum.totalDiscount || 0)
      salesLookup.set(sale.variantId, {
        quantity,
        revenue: price * quantity - discount,
        orders: sale._count,
      })
    }
  }

  // Map products with calculated data
  const productsWithData = products.map((product) => {
    let totalSold = 0
    let totalRevenue = 0
    let totalCOGS = 0
    let totalOrders = 0
    let hasCOGS = false
    let avgPrice = 0

    for (const variant of product.variants) {
      const sales = salesLookup.get(variant.id) || { quantity: 0, revenue: 0, orders: 0 }
      totalSold += sales.quantity
      totalRevenue += sales.revenue
      totalOrders += sales.orders

      if (variant.cogsEntries?.[0]) {
        hasCOGS = true
        totalCOGS += Number(variant.cogsEntries[0].costPrice) * sales.quantity
      }

      avgPrice += Number(variant.price)
    }

    if (product.variants.length > 0) {
      avgPrice = avgPrice / product.variants.length
    }

    const profit = totalRevenue - totalCOGS
    const margin = totalRevenue > 0 ? (profit / totalRevenue) * 100 : 0

    return {
      id: product.id,
      title: product.title,
      handle: product.handle,
      vendor: product.vendor,
      productType: product.productType,
      status: product.status,
      imageUrl: product.imageUrl,
      variants: product.variants.length,
      unitsSold: totalSold,
      revenue: totalRevenue,
      cogs: totalCOGS,
      profit,
      margin,
      orders: totalOrders,
      avgPrice,
      hasCOGS,
      currency: product.store?.currency || 'SEK',
    }
  })

  // Calculate totals
  const totals = productsWithData.reduce(
    (acc, p) => ({
      unitsSold: acc.unitsSold + p.unitsSold,
      revenue: acc.revenue + p.revenue,
      cogs: acc.cogs + p.cogs,
      profit: acc.profit + p.profit,
    }),
    { unitsSold: 0, revenue: 0, cogs: 0, profit: 0 }
  )

  const avgMargin = totals.revenue > 0 ? (totals.profit / totals.revenue) * 100 : 0

  return NextResponse.json({
    products: productsWithData,
    totals: {
      ...totals,
      avgMargin,
      productCount: productsWithData.length,
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
