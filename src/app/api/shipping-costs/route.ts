import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// GET /api/shipping-costs - Get shipping cost tiers for a store
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const searchParams = request.nextUrl.searchParams
  const storeId = searchParams.get('storeId')

  const teamMember = await prisma.teamMember.findFirst({
    where: { userId: session.user.id },
  })

  if (!teamMember) {
    return NextResponse.json({ error: 'No team found' }, { status: 404 })
  }

  // Get stores for this team
  const storeFilter = storeId
    ? { id: storeId, teamId: teamMember.teamId }
    : { teamId: teamMember.teamId }

  const stores = await prisma.store.findMany({
    where: storeFilter,
    include: {
      shippingCostTiers: {
        where: { isActive: true },
        orderBy: { minItems: 'asc' },
      },
    },
  })

  // Format response
  const result = stores.map((store) => ({
    storeId: store.id,
    storeName: store.name,
    tiers: store.shippingCostTiers.map((tier) => ({
      id: tier.id,
      name: tier.name,
      minItems: tier.minItems,
      maxItems: tier.maxItems,
      cost: Number(tier.cost),
      costPerAdditionalItem: Number(tier.costPerAdditionalItem),
      maxWeightGrams: tier.maxWeightGrams,
      shippingZone: tier.shippingZone,
    })),
  }))

  return NextResponse.json(result)
}

// POST /api/shipping-costs - Create a new shipping cost tier
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const {
    storeId,
    name,
    minItems = 1,
    maxItems,
    cost,
    costPerAdditionalItem = 0,
    maxWeightGrams,
    shippingZone,
  } = body

  if (!storeId || !name || cost === undefined) {
    return NextResponse.json(
      { error: 'storeId, name, and cost are required' },
      { status: 400 }
    )
  }

  // Verify store access
  const store = await prisma.store.findFirst({
    where: {
      id: storeId,
      team: {
        members: {
          some: { userId: session.user.id },
        },
      },
    },
  })

  if (!store) {
    return NextResponse.json({ error: 'Store not found or access denied' }, { status: 404 })
  }

  const tier = await prisma.shippingCostTier.create({
    data: {
      storeId,
      name,
      minItems,
      maxItems: maxItems || null,
      cost: parseFloat(cost),
      costPerAdditionalItem: parseFloat(costPerAdditionalItem),
      maxWeightGrams: maxWeightGrams || null,
      shippingZone: shippingZone || null,
    },
  })

  return NextResponse.json({
    id: tier.id,
    name: tier.name,
    minItems: tier.minItems,
    maxItems: tier.maxItems,
    cost: Number(tier.cost),
    costPerAdditionalItem: Number(tier.costPerAdditionalItem),
    maxWeightGrams: tier.maxWeightGrams,
    shippingZone: tier.shippingZone,
  })
}

// PUT /api/shipping-costs - Update a shipping cost tier
export async function PUT(request: NextRequest) {
  const session = await getServerSession(authOptions)

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { id, ...updateData } = body

  if (!id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 })
  }

  // Verify access
  const tier = await prisma.shippingCostTier.findFirst({
    where: {
      id,
      store: {
        team: {
          members: {
            some: { userId: session.user.id },
          },
        },
      },
    },
  })

  if (!tier) {
    return NextResponse.json({ error: 'Tier not found or access denied' }, { status: 404 })
  }

  const updated = await prisma.shippingCostTier.update({
    where: { id },
    data: {
      name: updateData.name,
      minItems: updateData.minItems,
      maxItems: updateData.maxItems,
      cost: updateData.cost ? parseFloat(updateData.cost) : undefined,
      costPerAdditionalItem: updateData.costPerAdditionalItem
        ? parseFloat(updateData.costPerAdditionalItem)
        : undefined,
      maxWeightGrams: updateData.maxWeightGrams,
      shippingZone: updateData.shippingZone,
      isActive: updateData.isActive,
    },
  })

  return NextResponse.json({
    id: updated.id,
    name: updated.name,
    minItems: updated.minItems,
    maxItems: updated.maxItems,
    cost: Number(updated.cost),
    costPerAdditionalItem: Number(updated.costPerAdditionalItem),
  })
}

// DELETE /api/shipping-costs - Delete a shipping cost tier
export async function DELETE(request: NextRequest) {
  const session = await getServerSession(authOptions)

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const searchParams = request.nextUrl.searchParams
  const id = searchParams.get('id')

  if (!id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 })
  }

  // Verify access
  const tier = await prisma.shippingCostTier.findFirst({
    where: {
      id,
      store: {
        team: {
          members: {
            some: { userId: session.user.id },
          },
        },
      },
    },
  })

  if (!tier) {
    return NextResponse.json({ error: 'Tier not found or access denied' }, { status: 404 })
  }

  await prisma.shippingCostTier.delete({
    where: { id },
  })

  return NextResponse.json({ success: true })
}

// Helper function to calculate shipping cost for an order
export function calculateShippingCost(
  itemCount: number,
  tiers: Array<{ minItems: number; maxItems: number | null; cost: number; costPerAdditionalItem: number }>
): number {
  // Find the matching tier
  const matchingTier = tiers.find((tier) => {
    if (itemCount < tier.minItems) return false
    if (tier.maxItems === null) return true
    return itemCount <= tier.maxItems
  })

  if (!matchingTier) {
    // No matching tier, use the highest tier
    const highestTier = tiers[tiers.length - 1]
    if (!highestTier) return 0

    // Calculate cost with per-additional-item pricing
    const extraItems = itemCount - highestTier.minItems
    return highestTier.cost + extraItems * highestTier.costPerAdditionalItem
  }

  // Calculate cost with per-additional-item pricing if applicable
  const extraItems = Math.max(0, itemCount - matchingTier.minItems)
  return matchingTier.cost + extraItems * matchingTier.costPerAdditionalItem
}
