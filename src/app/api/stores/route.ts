import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// GET /api/stores - Get all stores for the user's team
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function GET(_request: NextRequest) {
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

  const stores = await prisma.store.findMany({
    where: {
      teamId: teamMember.teamId,
    },
    select: {
      id: true,
      shopifyDomain: true,
      name: true,
      currency: true,
      timezone: true,
      isActive: true,
      lastSyncAt: true,
      createdAt: true,
      _count: {
        select: {
          products: true,
          orders: true,
        },
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
  })

  const result = stores.map((store) => ({
    id: store.id,
    shopifyDomain: store.shopifyDomain,
    name: store.name,
    currency: store.currency,
    timezone: store.timezone,
    isActive: store.isActive,
    lastSyncAt: store.lastSyncAt,
    createdAt: store.createdAt,
    productCount: store._count.products,
    orderCount: store._count.orders,
  }))

  return NextResponse.json(result)
}

// DELETE /api/stores - Disconnect a store
export async function DELETE(request: NextRequest) {
  const session = await getServerSession(authOptions)

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const searchParams = request.nextUrl.searchParams
  const storeId = searchParams.get('id')

  if (!storeId) {
    return NextResponse.json({ error: 'Store ID is required' }, { status: 400 })
  }

  // Verify access
  const store = await prisma.store.findFirst({
    where: {
      id: storeId,
      team: {
        members: {
          some: {
            userId: session.user.id,
            role: { in: ['OWNER', 'ADMIN'] },
          },
        },
      },
    },
  })

  if (!store) {
    return NextResponse.json({ error: 'Store not found or access denied' }, { status: 404 })
  }

  // Soft delete - just mark as inactive and clear token
  await prisma.store.update({
    where: { id: storeId },
    data: {
      isActive: false,
      shopifyAccessTokenEncrypted: null,
    },
  })

  return NextResponse.json({ success: true })
}
