import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// POST /api/cogs/import - Import COGS from CSV
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const formData = await request.formData()
  const file = formData.get('file') as File
  const storeId = formData.get('storeId') as string

  if (!file) {
    return NextResponse.json({ error: 'File is required' }, { status: 400 })
  }

  // Verify store access
  const store = await prisma.store.findFirst({
    where: {
      id: storeId,
      team: {
        members: {
          some: {
            userId: session.user.id,
          },
        },
      },
    },
  })

  if (!store) {
    return NextResponse.json({ error: 'Store not found or access denied' }, { status: 404 })
  }

  const csvContent = await file.text()
  const lines = csvContent.split('\n')
  const headers = lines[0].split(',').map((h) => h.trim().toLowerCase())

  // Expected headers: sku, cost
  const skuIndex = headers.findIndex((h) => h === 'sku' || h === 'variant_sku')
  const costIndex = headers.findIndex((h) => h === 'cost' || h === 'cogs')

  if (skuIndex === -1 || costIndex === -1) {
    return NextResponse.json(
      { error: 'CSV must have "sku" and "cost" columns' },
      { status: 400 }
    )
  }

  const results = {
    success: 0,
    failed: 0,
    errors: [] as string[],
  }

  const now = new Date()

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue

    // Handle both comma and semicolon delimiters, and quoted values
    const values = line.match(/(".*?"|[^,;]+)(?=\s*[,;]|\s*$)/g)?.map((v) =>
      v.replace(/^"|"$/g, '').trim()
    ) || []

    const sku = values[skuIndex]
    const costStr = values[costIndex]?.replace(',', '.') // Handle Swedish decimal format

    if (!sku || !costStr) {
      results.errors.push(`Row ${i + 1}: Missing SKU or cost`)
      results.failed++
      continue
    }

    const cost = parseFloat(costStr)
    if (isNaN(cost)) {
      results.errors.push(`Row ${i + 1}: Invalid cost value "${costStr}"`)
      results.failed++
      continue
    }

    // Find variant by SKU
    const variant = await prisma.productVariant.findFirst({
      where: {
        sku,
        product: {
          storeId: store.id,
        },
      },
    })

    if (!variant) {
      results.errors.push(`Row ${i + 1}: SKU "${sku}" not found`)
      results.failed++
      continue
    }

    // Set end date on previous COGS
    await prisma.variantCOGS.updateMany({
      where: { variantId: variant.id, effectiveTo: null },
      data: { effectiveTo: now },
    })

    // Create new COGS
    await prisma.variantCOGS.create({
      data: {
        variantId: variant.id,
        costPrice: cost,
        effectiveFrom: now,
        source: 'CSV_IMPORT',
        notes: 'Imported from CSV',
      },
    })

    results.success++
  }

  return NextResponse.json(results)
}
