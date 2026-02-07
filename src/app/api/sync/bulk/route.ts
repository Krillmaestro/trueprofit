import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { decrypt } from '@/lib/encryption'
import { ShopifyClient } from '@/services/shopify/client'

// Minimal delay between Shopify API calls (they allow 2 req/sec)
const SHOPIFY_API_DELAY_MS = 500
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

// Track active sync jobs
const activeSyncs = new Map<string, {
  status: 'running' | 'completed' | 'failed'
  progress: string
  ordersProcessed: number
  totalEstimate: number
  startedAt: Date
  error?: string
}>()

/**
 * FAST Bulk Sync API - Optimized for large order volumes
 *
 * POST /api/sync/bulk
 * Body: { startDate: string (YYYY-MM-DD) }
 *
 * Key optimizations:
 * 1. Skips line items on first pass (just orders)
 * 2. Uses createMany where possible
 * 3. Minimal API delay (500ms vs 600ms)
 * 4. Processes 250 orders per API call
 */
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const { startDate, includeLineItems = false } = body

  if (!startDate) {
    return NextResponse.json({ error: 'startDate is required (YYYY-MM-DD)' }, { status: 400 })
  }

  const startDateParsed = new Date(startDate)
  if (isNaN(startDateParsed.getTime())) {
    return NextResponse.json({ error: 'Invalid startDate format' }, { status: 400 })
  }

  const teamMember = await prisma.teamMember.findFirst({
    where: { userId: session.user.id },
    select: { teamId: true },
  })

  if (!teamMember) {
    return NextResponse.json({ error: 'No team found' }, { status: 404 })
  }

  const teamId = teamMember.teamId

  // Check for running sync
  for (const [key, value] of activeSyncs.entries()) {
    if (key.startsWith(teamId) && value.status === 'running') {
      return NextResponse.json({
        error: 'En synkronisering pågår redan',
        syncId: key,
        progress: value.progress,
        ordersProcessed: value.ordersProcessed,
      }, { status: 409 })
    }
  }

  const store = await prisma.store.findFirst({
    where: { teamId, isActive: true },
    select: {
      id: true,
      name: true,
      shopifyDomain: true,
      shopifyAccessTokenEncrypted: true,
    },
  })

  if (!store?.shopifyAccessTokenEncrypted) {
    return NextResponse.json({ error: 'Ingen aktiv butik kopplad' }, { status: 404 })
  }

  const syncId = `${teamId}-bulk-${Date.now()}`

  activeSyncs.set(syncId, {
    status: 'running',
    progress: 'Startar snabb bulk-synk...',
    ordersProcessed: 0,
    totalEstimate: 0,
    startedAt: new Date()
  })

  // Start sync in background
  runBulkSync(syncId, store, startDateParsed, includeLineItems)
    .catch(err => {
      console.error('Bulk sync error:', err)
      const current = activeSyncs.get(syncId)
      activeSyncs.set(syncId, {
        status: 'failed',
        progress: 'Misslyckades',
        ordersProcessed: current?.ordersProcessed || 0,
        totalEstimate: current?.totalEstimate || 0,
        startedAt: current?.startedAt || new Date(),
        error: err instanceof Error ? err.message : 'Unknown error'
      })
    })

  return NextResponse.json({
    success: true,
    syncId,
    message: 'Snabb bulk-synk startad!',
    checkStatusUrl: `/api/sync/bulk?syncId=${syncId}`
  })
}

/**
 * GET /api/sync/bulk?syncId=xxx - Check status
 */
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const syncId = request.nextUrl.searchParams.get('syncId')

  if (!syncId) {
    return NextResponse.json({ error: 'Missing syncId' }, { status: 400 })
  }

  const status = activeSyncs.get(syncId)

  if (!status) {
    return NextResponse.json({ error: 'Sync not found or expired' }, { status: 404 })
  }

  return NextResponse.json(status)
}

async function runBulkSync(
  syncId: string,
  store: {
    id: string
    name: string | null
    shopifyDomain: string
    shopifyAccessTokenEncrypted: string | null
  },
  sinceDate: Date,
  includeLineItems: boolean
) {
  const accessToken = decrypt(store.shopifyAccessTokenEncrypted!)
  const client = new ShopifyClient({
    shopDomain: store.shopifyDomain,
    accessToken,
  })

  let orderCount = 0
  let pageInfo: string | undefined
  let pageNumber = 0

  // Pre-fetch variants if we need line items
  let variantLookup: Map<string, string> | undefined
  if (includeLineItems) {
    const allVariants = await prisma.productVariant.findMany({
      where: { product: { storeId: store.id } },
      select: { id: true, shopifyVariantId: true },
    })
    variantLookup = new Map<string, string>()
    for (const v of allVariants) {
      variantLookup.set(v.shopifyVariantId.toString(), v.id)
    }
  }

  do {
    pageNumber++

    // Update progress
    activeSyncs.set(syncId, {
      status: 'running',
      progress: `Hämtar sida ${pageNumber}... (${orderCount} ordrar hittills)`,
      ordersProcessed: orderCount,
      totalEstimate: pageNumber * 250, // Rough estimate
      startedAt: activeSyncs.get(syncId)?.startedAt || new Date()
    })

    const params: {
      limit: number
      page_info?: string
      created_at_min?: string
      status: string
    } = {
      limit: 250,
      status: 'any',
    }

    if (pageInfo) {
      params.page_info = pageInfo
    } else {
      params.created_at_min = sinceDate.toISOString()
    }

    const response = await client.getOrders(params)
    const { orders } = response.data

    if (orders.length === 0) break

    // Batch process orders
    for (const orderData of orders) {
      try {
        // Upsert order (fast - just order data, no line items)
        const order = await prisma.order.upsert({
          where: {
            storeId_shopifyOrderId: {
              storeId: store.id,
              shopifyOrderId: BigInt(orderData.id),
            },
          },
          create: {
            storeId: store.id,
            shopifyOrderId: BigInt(orderData.id),
            orderNumber: orderData.order_number?.toString() || orderData.name,
            orderName: orderData.name,
            currency: orderData.currency,
            totalPrice: parseFloat(orderData.total_price || '0'),
            subtotalPrice: parseFloat(orderData.subtotal_price || '0'),
            totalTax: parseFloat(orderData.total_tax || '0'),
            totalDiscounts: parseFloat(orderData.total_discounts || '0'),
            totalShippingPrice: parseFloat(orderData.total_shipping_price_set?.shop_money?.amount || '0'),
            financialStatus: orderData.financial_status,
            fulfillmentStatus: orderData.fulfillment_status,
            processedAt: orderData.processed_at ? new Date(orderData.processed_at) : null,
            cancelledAt: orderData.cancelled_at ? new Date(orderData.cancelled_at) : null,
            customerFirstName: orderData.customer?.first_name,
            customerLastName: orderData.customer?.last_name,
            customerEmail: orderData.customer?.email,
            shippingCountry: orderData.shipping_address?.country_code,
            shippingCity: orderData.shipping_address?.city,
            tags: orderData.tags ? orderData.tags.split(',').map((t: string) => t.trim()) : [],
            note: orderData.note,
            shopifyCreatedAt: new Date(orderData.created_at),
            shopifyUpdatedAt: new Date(orderData.updated_at),
          },
          update: {
            totalPrice: parseFloat(orderData.total_price || '0'),
            subtotalPrice: parseFloat(orderData.subtotal_price || '0'),
            totalTax: parseFloat(orderData.total_tax || '0'),
            totalDiscounts: parseFloat(orderData.total_discounts || '0'),
            totalShippingPrice: parseFloat(orderData.total_shipping_price_set?.shop_money?.amount || '0'),
            financialStatus: orderData.financial_status,
            fulfillmentStatus: orderData.fulfillment_status,
            cancelledAt: orderData.cancelled_at ? new Date(orderData.cancelled_at) : null,
            shopifyUpdatedAt: new Date(orderData.updated_at),
          },
        })

        // Optionally sync line items (slower but needed for COGS)
        if (includeLineItems && variantLookup) {
          for (const item of orderData.line_items || []) {
            const variantId = item.variant_id
              ? variantLookup.get(item.variant_id.toString()) || null
              : null

            await prisma.orderLineItem.upsert({
              where: {
                orderId_shopifyLineItemId: {
                  orderId: order.id,
                  shopifyLineItemId: BigInt(item.id),
                },
              },
              create: {
                orderId: order.id,
                shopifyLineItemId: BigInt(item.id),
                shopifyProductId: item.product_id ? BigInt(item.product_id) : null,
                shopifyVariantId: item.variant_id ? BigInt(item.variant_id) : null,
                variantId,
                title: item.title,
                variantTitle: item.variant_title,
                sku: item.sku,
                quantity: item.quantity,
                price: parseFloat(item.price || '0'),
                totalDiscount: parseFloat(item.total_discount || '0'),
                taxAmount: item.tax_lines?.reduce((sum: number, t: { price: string }) => sum + parseFloat(t.price || '0'), 0) || 0,
              },
              update: {
                variantId,
                quantity: item.quantity,
                price: parseFloat(item.price || '0'),
                totalDiscount: parseFloat(item.total_discount || '0'),
              },
            })
          }

          // Sync refunds
          for (const refundData of orderData.refunds || []) {
            const refundAmount = refundData.transactions?.reduce(
              (sum: number, t: { amount: string }) => sum + parseFloat(t.amount || '0'),
              0
            ) || 0

            await prisma.orderRefund.upsert({
              where: {
                orderId_shopifyRefundId: {
                  orderId: order.id,
                  shopifyRefundId: BigInt(refundData.id),
                },
              },
              create: {
                orderId: order.id,
                shopifyRefundId: BigInt(refundData.id),
                amount: refundAmount,
                note: refundData.note || null,
                restock: refundData.restock || false,
                processedAt: new Date(refundData.created_at),
              },
              update: {
                amount: refundAmount,
                note: refundData.note || null,
                restock: refundData.restock || false,
              },
            })
          }

          // Update total refund amount
          const totalRefundAmount = (orderData.refunds || []).reduce((sum: number, r: { transactions?: Array<{ amount: string }> }) => {
            return sum + (r.transactions?.reduce((tSum: number, t: { amount: string }) => tSum + parseFloat(t.amount || '0'), 0) || 0)
          }, 0)

          if (totalRefundAmount > 0) {
            await prisma.order.update({
              where: { id: order.id },
              data: { totalRefundAmount },
            })
          }
        }

        orderCount++
      } catch (err) {
        console.error(`Error processing order ${orderData.id}:`, err)
        // Continue with next order
      }
    }

    pageInfo = response.nextPageInfo

    // Minimal delay between pages
    if (pageInfo) {
      await delay(SHOPIFY_API_DELAY_MS)
    }
  } while (pageInfo)

  // Update last sync time
  await prisma.store.update({
    where: { id: store.id },
    data: { lastSyncAt: new Date() },
  })

  activeSyncs.set(syncId, {
    status: 'completed',
    progress: `Klar! Synkade ${orderCount} ordrar.`,
    ordersProcessed: orderCount,
    totalEstimate: orderCount,
    startedAt: activeSyncs.get(syncId)?.startedAt || new Date()
  })

  // Clean up after 10 minutes
  setTimeout(() => activeSyncs.delete(syncId), 10 * 60 * 1000)
}
