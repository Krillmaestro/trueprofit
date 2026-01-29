import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// GET /api/cogs - Get COGS for all products
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const searchParams = request.nextUrl.searchParams
  const storeId = searchParams.get('storeId')

  // Get user's team
  const teamMember = await prisma.teamMember.findFirst({
    where: { userId: session.user.id },
  })

  if (!teamMember) {
    return NextResponse.json({ error: 'No team found' }, { status: 404 })
  }

  const storeFilter = storeId
    ? { storeId }
    : { store: { teamId: teamMember.teamId } }

  const variants = await prisma.productVariant.findMany({
    where: {
      product: storeFilter,
    },
    include: {
      product: {
        select: {
          id: true,
          title: true,
          imageUrl: true,
          store: {
            select: {
              id: true,
              name: true,
              currency: true,
            },
          },
        },
      },
      cogsEntries: {
        where: {
          effectiveTo: null, // Active COGS entries have no end date
        },
        orderBy: {
          effectiveFrom: 'desc',
        },
        take: 1,
      },
    },
  })

  const result = variants.map((v) => ({
    variantId: v.id,
    shopifyVariantId: v.shopifyVariantId,
    productId: v.product.id,
    productTitle: v.product.title,
    variantTitle: v.title,
    sku: v.sku,
    price: v.price,
    inventoryQuantity: v.inventoryQuantity,
    imageUrl: v.product.imageUrl,
    store: v.product.store,
    cogs: v.cogsEntries[0] || null,
    hasCogs: v.cogsEntries.length > 0,
  }))

  return NextResponse.json(result)
}

// POST /api/cogs - Create or update COGS for a variant
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { variantId, cost, zoneId, notes } = body

  if (!variantId || cost === undefined) {
    return NextResponse.json({ error: 'variantId and cost are required' }, { status: 400 })
  }

  // Verify access to the variant
  const variant = await prisma.productVariant.findFirst({
    where: {
      id: variantId,
      product: {
        store: {
          team: {
            members: {
              some: {
                userId: session.user.id,
              },
            },
          },
        },
      },
    },
  })

  if (!variant) {
    return NextResponse.json({ error: 'Variant not found or access denied' }, { status: 404 })
  }

  const now = new Date()

  // Set end date on previous active COGS entries
  await prisma.variantCOGS.updateMany({
    where: {
      variantId,
      effectiveTo: null,
    },
    data: {
      effectiveTo: now,
    },
  })

  // Create new COGS entry
  const cogs = await prisma.variantCOGS.create({
    data: {
      variantId,
      costPrice: parseFloat(cost),
      zoneId: zoneId || null,
      effectiveFrom: now,
      notes: notes || null,
      source: 'MANUAL',
    },
  })

  return NextResponse.json(cogs)
}

// PUT /api/cogs - Bulk update COGS
export async function PUT(request: NextRequest) {
  const session = await getServerSession(authOptions)

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { updates } = body // Array of { variantId, cost }

  if (!Array.isArray(updates) || updates.length === 0) {
    return NextResponse.json({ error: 'updates array is required' }, { status: 400 })
  }

  // Get user's team for verification
  const teamMember = await prisma.teamMember.findFirst({
    where: { userId: session.user.id },
  })

  if (!teamMember) {
    return NextResponse.json({ error: 'No team found' }, { status: 404 })
  }

  const results = []
  const now = new Date()

  for (const update of updates) {
    const { variantId, cost } = update

    // Verify access
    const variant = await prisma.productVariant.findFirst({
      where: {
        id: variantId,
        product: {
          store: {
            teamId: teamMember.teamId,
          },
        },
      },
    })

    if (!variant) {
      results.push({ variantId, error: 'Not found or access denied' })
      continue
    }

    // Set end date on previous COGS
    await prisma.variantCOGS.updateMany({
      where: { variantId, effectiveTo: null },
      data: { effectiveTo: now },
    })

    // Create new COGS
    const cogs = await prisma.variantCOGS.create({
      data: {
        variantId,
        costPrice: parseFloat(cost),
        effectiveFrom: now,
        source: 'MANUAL',
      },
    })

    results.push({ variantId, cogs })
  }

  return NextResponse.json({ results })
}
