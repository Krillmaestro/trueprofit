import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { importRateLimiter, getRateLimitKey, getRateLimitHeaders } from '@/lib/rate-limit'

// File size and row limits
const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5 MB
const MAX_ROWS = 10000 // Maximum number of rows

// POST /api/cogs/import - Import COGS from CSV
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Apply rate limiting
  const rateLimitKey = getRateLimitKey(request, session.user.id)
  const rateLimitResult = importRateLimiter(rateLimitKey)

  if (rateLimitResult.limited) {
    return NextResponse.json(
      { error: 'Too many import requests. Please wait before importing again.' },
      {
        status: 429,
        headers: getRateLimitHeaders(5, rateLimitResult.remaining, rateLimitResult.resetAt),
      }
    )
  }

  const formData = await request.formData()
  const file = formData.get('file') as File
  const storeId = formData.get('storeId') as string

  if (!file) {
    return NextResponse.json({ error: 'File is required' }, { status: 400 })
  }

  // Validate file type
  const fileName = file.name.toLowerCase()
  if (!fileName.endsWith('.csv') && !fileName.endsWith('.txt')) {
    return NextResponse.json(
      { error: 'Invalid file type. Only CSV and TXT files are allowed.' },
      { status: 400 }
    )
  }

  // Validate file size
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json(
      { error: `File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024} MB.` },
      { status: 400 }
    )
  }

  // Validate file is not empty
  if (file.size === 0) {
    return NextResponse.json(
      { error: 'File is empty.' },
      { status: 400 }
    )
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

  // Validate row count
  if (lines.length > MAX_ROWS + 1) { // +1 for header row
    return NextResponse.json(
      { error: `Too many rows. Maximum is ${MAX_ROWS.toLocaleString()} rows per import.` },
      { status: 400 }
    )
  }

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
