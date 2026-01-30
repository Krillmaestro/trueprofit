import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const productId = searchParams.get('productId')
    const startDateParam = searchParams.get('startDate')
    const endDateParam = searchParams.get('endDate')

    if (!productId) {
      return NextResponse.json({ error: 'Product ID required' }, { status: 400 })
    }

    // Default to last 30 days if no dates provided
    const endDate = endDateParam ? new Date(endDateParam) : new Date()
    const startDate = startDateParam
      ? new Date(startDateParam)
      : new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000)

    // Get user's team
    const teamMember = await prisma.teamMember.findFirst({
      where: { userId: session.user.id },
    })

    if (!teamMember) {
      return NextResponse.json({ error: 'No team found' }, { status: 404 })
    }

    // Get user's stores
    const stores = await prisma.store.findMany({
      where: { teamId: teamMember.teamId },
      select: { id: true },
    })
    const storeIds = stores.map((s) => s.id)

    // Get product information
    const product = await prisma.product.findFirst({
      where: {
        id: productId,
        storeId: { in: storeIds },
      },
      include: {
        variants: true,
      },
    })

    if (!product) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 })
    }

    // Get all orders with line items for this product in the date range
    const orders = await prisma.order.findMany({
      where: {
        storeId: { in: storeIds },
        processedAt: {
          gte: startDate,
          lte: endDate,
        },
        financialStatus: { notIn: ['refunded', 'voided'] },
        cancelledAt: null,
        lineItems: {
          some: {
            shopifyProductId: product.shopifyProductId,
          },
        },
      },
      include: {
        lineItems: {
          where: {
            shopifyProductId: product.shopifyProductId,
          },
          include: {
            variant: {
              select: {
                id: true,
                title: true,
                sku: true,
              },
            },
          },
        },
        refunds: true,
      },
    })

    // Calculate totals
    let totalRevenue = 0
    let totalCogs = 0
    let totalQuantity = 0
    const variantStats: Record<string, { name: string; sku: string; revenue: number; profit: number; orders: number }> = {}
    const dailyStats: Record<string, { revenue: number; profit: number; orders: number }> = {}
    const channelStats: Record<string, { orders: number; revenue: number }> = {}

    for (const order of orders) {
      for (const item of order.lineItems) {
        const revenue = Number(item.price) * item.quantity
        const cogs = Number(item.totalCOGS || 0)
        const profit = revenue - cogs

        totalRevenue += revenue
        totalCogs += cogs
        totalQuantity += item.quantity

        // Variant stats
        const variantKey = item.variantId || 'default'
        if (!variantStats[variantKey]) {
          variantStats[variantKey] = {
            name: item.variantTitle || item.variant?.title || 'Standard',
            sku: item.sku || item.variant?.sku || 'N/A',
            revenue: 0,
            profit: 0,
            orders: 0,
          }
        }
        variantStats[variantKey].revenue += revenue
        variantStats[variantKey].profit += profit
        variantStats[variantKey].orders += 1

        // Daily stats
        const dateKey = (order.processedAt || order.shopifyCreatedAt).toISOString().split('T')[0]
        if (!dailyStats[dateKey]) {
          dailyStats[dateKey] = { revenue: 0, profit: 0, orders: 0 }
        }
        dailyStats[dateKey].revenue += revenue
        dailyStats[dateKey].profit += profit
        dailyStats[dateKey].orders += 1

        // Channel attribution
        const referrer = order.referringSite || order.landingSite || ''
        let channel = 'Organic'
        if (referrer.toLowerCase().includes('facebook') || referrer.toLowerCase().includes('fb.')) {
          channel = 'Facebook Ads'
        } else if (referrer.toLowerCase().includes('google') || referrer.toLowerCase().includes('gclid')) {
          channel = 'Google Ads'
        } else if (referrer.toLowerCase().includes('tiktok')) {
          channel = 'TikTok Ads'
        } else if (referrer.trim() === '') {
          channel = 'Direct'
        }

        if (!channelStats[channel]) {
          channelStats[channel] = { orders: 0, revenue: 0 }
        }
        channelStats[channel].orders += 1
        channelStats[channel].revenue += revenue
      }
    }

    // Calculate refund totals for this product
    let totalRefunds = 0
    for (const order of orders) {
      for (const refund of order.refunds) {
        // Estimate refund based on this product's share of order
        const orderTotal = order.lineItems.reduce((sum, li) => sum + Number(li.price) * li.quantity, 0)
        const productRevenue = order.lineItems
          .filter((li) => li.shopifyProductId === product.shopifyProductId)
          .reduce((sum, li) => sum + Number(li.price) * li.quantity, 0)

        if (orderTotal > 0) {
          const productShare = productRevenue / orderTotal
          totalRefunds += Number(refund.amount) * productShare
        }
      }
    }

    const totalOrders = orders.length
    const profit = totalRevenue - totalCogs
    const margin = totalRevenue > 0 ? (profit / totalRevenue) * 100 : 0
    const avgPrice = totalQuantity > 0 ? totalRevenue / totalQuantity : 0
    const refundRate = totalRevenue > 0 ? (totalRefunds / totalRevenue) * 100 : 0

    // Format variant data
    const variants = Object.values(variantStats)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10)

    // Format daily data (last 7 days)
    const dailyData = Object.entries(dailyStats)
      .map(([date, stats]) => ({
        date,
        ...stats,
      }))
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-7)

    // Format channel breakdown
    const totalChannelOrders = Object.values(channelStats).reduce((sum, c) => sum + c.orders, 0)
    const channelBreakdown = Object.entries(channelStats)
      .map(([channel, stats]) => ({
        channel,
        orders: stats.orders,
        revenue: stats.revenue,
        percentage: totalChannelOrders > 0 ? Math.round((stats.orders / totalChannelOrders) * 100) : 0,
      }))
      .sort((a, b) => b.orders - a.orders)

    return NextResponse.json({
      id: product.id,
      name: product.title,
      sku: product.variants[0]?.sku || 'N/A',
      revenue: totalRevenue,
      profit: profit,
      margin: margin,
      orders: totalOrders,
      quantity: totalQuantity,
      avgPrice: avgPrice,
      cogs: totalCogs,
      refunds: totalRefunds,
      refundRate: refundRate,
      variants: variants,
      dailyData: dailyData,
      channelBreakdown: channelBreakdown,
    })
  } catch (error) {
    console.error('Error fetching product details:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
