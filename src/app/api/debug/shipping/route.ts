import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { calculateShippingCost, ShippingTier } from '@/lib/shipping'

/**
 * Debug endpoint to check shipping cost calculations
 * GET /api/debug/shipping
 */
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const teamMember = await prisma.teamMember.findFirst({
    where: { userId: session.user.id },
  })

  if (!teamMember) {
    return NextResponse.json({ error: 'No team found' }, { status: 404 })
  }

  // Get stores with shipping tiers
  const stores = await prisma.store.findMany({
    where: { teamId: teamMember.teamId },
    include: {
      shippingCostTiers: {
        where: { isActive: true },
        orderBy: { minItems: 'asc' },
      },
    },
  })

  // Get some recent orders to test calculations
  const recentOrders = await prisma.order.findMany({
    where: {
      store: { teamId: teamMember.teamId },
      cancelledAt: null,
    },
    include: {
      lineItems: {
        include: {
          variant: {
            include: {
              product: {
                select: { isShippingExempt: true },
              },
            },
          },
        },
      },
    },
    orderBy: { processedAt: 'desc' },
    take: 10,
  })

  // Calculate shipping for each order
  const orderShippingCalcs = recentOrders.map((order) => {
    const store = stores.find((s) => s.id === order.storeId)
    const tiers: ShippingTier[] = store?.shippingCostTiers.map((t) => ({
      minItems: t.minItems,
      maxItems: t.maxItems,
      cost: Number(t.cost),
      costPerAdditionalItem: Number(t.costPerAdditionalItem),
      shippingZone: t.shippingZone,
    })) || []

    const physicalItemCount = order.lineItems.reduce((sum, item) => {
      const isExempt = item.variant?.product?.isShippingExempt || false
      return sum + (isExempt ? 0 : item.quantity)
    }, 0)

    const shippingCost = tiers.length > 0 && physicalItemCount > 0
      ? calculateShippingCost(physicalItemCount, tiers)
      : 0

    return {
      orderId: order.id,
      orderNumber: order.orderNumber,
      storeName: store?.name || 'Unknown',
      lineItemsCount: order.lineItems.length,
      physicalItemCount,
      tiersConfigured: tiers.length,
      calculatedShippingCost: shippingCost,
      shippingRevenue: Number(order.totalShippingPrice),
    }
  })

  // Summary
  const totalCalculatedShipping = orderShippingCalcs.reduce((sum, o) => sum + o.calculatedShippingCost, 0)
  const ordersWithShipping = orderShippingCalcs.filter((o) => o.calculatedShippingCost > 0).length

  return NextResponse.json({
    stores: stores.map((s) => ({
      id: s.id,
      name: s.name,
      shippingTiersCount: s.shippingCostTiers.length,
      tiers: s.shippingCostTiers.map((t) => ({
        name: t.name,
        minItems: t.minItems,
        maxItems: t.maxItems,
        cost: Number(t.cost),
        costPerAdditionalItem: Number(t.costPerAdditionalItem),
        isActive: t.isActive,
      })),
    })),
    summary: {
      totalStores: stores.length,
      storesWithTiers: stores.filter((s) => s.shippingCostTiers.length > 0).length,
      recentOrdersChecked: recentOrders.length,
      ordersWithShippingCost: ordersWithShipping,
      totalCalculatedShipping,
    },
    orderCalculations: orderShippingCalcs,
  })
}
