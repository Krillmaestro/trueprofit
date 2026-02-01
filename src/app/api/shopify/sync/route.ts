import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { decrypt } from '@/lib/encryption'
import { ShopifyClient } from '@/services/shopify/client'
import { syncRateLimiter, getRateLimitKey, getRateLimitHeaders } from '@/lib/rate-limit'

// Shopify allows 2 requests per second - we'll be conservative with 600ms delay
const SHOPIFY_API_DELAY_MS = 600

// Helper to delay between API calls to avoid rate limiting
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

// Track active sync jobs (in production, use Redis or database)
const activeSyncs = new Map<string, { status: 'running' | 'completed' | 'failed'; progress?: string; result?: unknown; error?: string }>()

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Apply rate limiting based on user ID
  const rateLimitKey = getRateLimitKey(request, session.user.id)
  const rateLimitResult = syncRateLimiter(rateLimitKey)

  if (rateLimitResult.limited) {
    return NextResponse.json(
      { error: 'Too many sync requests. Please wait before syncing again.' },
      {
        status: 429,
        headers: getRateLimitHeaders(10, rateLimitResult.remaining, rateLimitResult.resetAt),
      }
    )
  }

  const { storeId, type, background, incremental, sinceDate } = await request.json()

  // Get store and verify access
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

  if (!store || !store.shopifyAccessTokenEncrypted) {
    return NextResponse.json({ error: 'Store not found or not connected' }, { status: 404 })
  }

  // Decrypt the access token for API calls
  const accessToken = decrypt(store.shopifyAccessTokenEncrypted)

  const client = new ShopifyClient({
    shopDomain: store.shopifyDomain,
    accessToken,
  })

  // Determine the date to sync from:
  // 1. If sinceDate is provided, use it (for historical sync)
  // 2. If incremental and lastSyncAt exists, use lastSyncAt
  // 3. Otherwise start from January 1st, 2026
  let sinceDateForOrders: Date
  if (sinceDate) {
    sinceDateForOrders = new Date(sinceDate)
  } else if (incremental && store.lastSyncAt) {
    sinceDateForOrders = store.lastSyncAt
  } else {
    sinceDateForOrders = new Date('2026-01-01T00:00:00Z')
  }

  // Background sync: start the job and return immediately
  if (background) {
    const syncId = `${storeId}-${Date.now()}`

    // Check if there's already a running sync for this store
    for (const [key, value] of activeSyncs.entries()) {
      if (key.startsWith(storeId) && value.status === 'running') {
        return NextResponse.json({
          error: 'Sync already in progress',
          syncId: key
        }, { status: 409 })
      }
    }

    activeSyncs.set(syncId, { status: 'running', progress: 'Starting sync...' })

    // Start sync in background (fire and forget)
    runBackgroundSync(syncId, store.id, client, type, sinceDateForOrders).catch(err => {
      console.error('Background sync error:', err)
      activeSyncs.set(syncId, {
        status: 'failed',
        error: err instanceof Error ? err.message : 'Unknown error'
      })
    })

    return NextResponse.json({
      success: true,
      syncId,
      message: 'Sync started in background. You can leave this page.',
      checkStatusUrl: `/api/shopify/sync/status?syncId=${syncId}`
    })
  }

  // Foreground sync (original behavior)
  try {
    let syncedCount = 0
    const syncDetails: { products?: number; orders?: number; transactions?: number; refunds?: number } = {}

    if (type === 'products' || type === 'all') {
      const productCount = await syncProducts(store.id, client)
      syncedCount += productCount
      syncDetails.products = productCount
    }

    if (type === 'orders' || type === 'all') {
      const { orders, transactions, refunds } = await syncOrders(store.id, client, sinceDateForOrders)
      syncedCount += orders
      syncDetails.orders = orders
      syncDetails.transactions = transactions
      syncDetails.refunds = refunds
    }

    // Update last sync time
    await prisma.store.update({
      where: { id: store.id },
      data: { lastSyncAt: new Date() },
    })

    return NextResponse.json({
      success: true,
      syncedCount,
      details: syncDetails,
      message: `Synced ${syncedCount} items`
    })
  } catch (error) {
    console.error('Sync error:', error)
    return NextResponse.json({
      error: 'Sync failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

// GET endpoint to check sync status
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const syncId = request.nextUrl.searchParams.get('syncId')

  if (!syncId) {
    return NextResponse.json({ error: 'Missing syncId' }, { status: 400 })
  }

  const syncStatus = activeSyncs.get(syncId)

  if (!syncStatus) {
    return NextResponse.json({ error: 'Sync not found' }, { status: 404 })
  }

  return NextResponse.json(syncStatus)
}

// Background sync runner
async function runBackgroundSync(
  syncId: string,
  storeId: string,
  client: ShopifyClient,
  type: string,
  sinceDate: Date
) {
  try {
    let syncedCount = 0
    const syncDetails: { products?: number; orders?: number; transactions?: number; refunds?: number } = {}

    if (type === 'products' || type === 'all') {
      activeSyncs.set(syncId, { status: 'running', progress: 'Syncing products...' })
      const productCount = await syncProducts(storeId, client)
      syncedCount += productCount
      syncDetails.products = productCount
    }

    if (type === 'orders' || type === 'all') {
      activeSyncs.set(syncId, { status: 'running', progress: 'Syncing orders...' })
      const { orders, transactions, refunds } = await syncOrders(storeId, client, sinceDate)
      syncedCount += orders
      syncDetails.orders = orders
      syncDetails.transactions = transactions
      syncDetails.refunds = refunds
    }

    // Update last sync time
    await prisma.store.update({
      where: { id: storeId },
      data: { lastSyncAt: new Date() },
    })

    activeSyncs.set(syncId, {
      status: 'completed',
      result: {
        success: true,
        syncedCount,
        details: syncDetails,
        message: `Synced ${syncedCount} items`
      }
    })

    // Clean up after 5 minutes
    setTimeout(() => activeSyncs.delete(syncId), 5 * 60 * 1000)

  } catch (error) {
    console.error('Background sync error:', error)
    activeSyncs.set(syncId, {
      status: 'failed',
      error: error instanceof Error ? error.message : 'Unknown error'
    })

    // Clean up after 5 minutes
    setTimeout(() => activeSyncs.delete(syncId), 5 * 60 * 1000)
  }
}

async function syncProducts(storeId: string, client: ShopifyClient): Promise<number> {
  let count = 0
  let pageInfo: string | undefined

  do {
    const response = await client.getProducts({ limit: 250, page_info: pageInfo })
    const { products } = response.data

    // Collect all inventory_item_ids to fetch COGS in batch
    const inventoryItemIds: string[] = []
    for (const productData of products) {
      for (const variant of productData.variants || []) {
        if (variant.inventory_item_id) {
          inventoryItemIds.push(variant.inventory_item_id.toString())
        }
      }
    }

    // Fetch COGS from Shopify inventory items (max 100 per request)
    const costLookup = new Map<string, number>()
    if (inventoryItemIds.length > 0) {
      try {
        // Process in batches of 100
        for (let i = 0; i < inventoryItemIds.length; i += 100) {
          const batch = inventoryItemIds.slice(i, i + 100)
          await delay(SHOPIFY_API_DELAY_MS) // Rate limiting
          const { inventory_items } = await client.getInventoryItems(batch)
          for (const item of inventory_items) {
            if (item.cost) {
              costLookup.set(item.id.toString(), parseFloat(item.cost))
            }
          }
        }
      } catch (error) {
        console.warn('Failed to fetch inventory item costs:', error)
      }
    }

    for (const productData of products) {
      const product = await prisma.product.upsert({
        where: {
          storeId_shopifyProductId: {
            storeId,
            shopifyProductId: BigInt(productData.id),
          },
        },
        create: {
          storeId,
          shopifyProductId: BigInt(productData.id),
          title: productData.title,
          handle: productData.handle,
          vendor: productData.vendor,
          productType: productData.product_type,
          status: productData.status,
          imageUrl: productData.image?.src,
        },
        update: {
          title: productData.title,
          handle: productData.handle,
          vendor: productData.vendor,
          productType: productData.product_type,
          status: productData.status,
          imageUrl: productData.image?.src,
        },
      })

      // Sync variants
      for (const variant of productData.variants || []) {
        const savedVariant = await prisma.productVariant.upsert({
          where: {
            productId_shopifyVariantId: {
              productId: product.id,
              shopifyVariantId: BigInt(variant.id),
            },
          },
          create: {
            productId: product.id,
            shopifyVariantId: BigInt(variant.id),
            inventoryItemId: variant.inventory_item_id ? BigInt(variant.inventory_item_id) : null,
            title: variant.title,
            sku: variant.sku,
            barcode: variant.barcode,
            price: parseFloat(variant.price || '0'),
            compareAtPrice: variant.compare_at_price ? parseFloat(variant.compare_at_price) : null,
            inventoryQuantity: Math.max(0, variant.inventory_quantity || 0), // Never allow negative inventory
            weight: variant.weight,
            weightUnit: variant.weight_unit,
          },
          update: {
            title: variant.title,
            sku: variant.sku,
            barcode: variant.barcode,
            inventoryItemId: variant.inventory_item_id ? BigInt(variant.inventory_item_id) : null,
            price: parseFloat(variant.price || '0'),
            compareAtPrice: variant.compare_at_price ? parseFloat(variant.compare_at_price) : null,
            inventoryQuantity: Math.max(0, variant.inventory_quantity || 0), // Never allow negative inventory
          },
        })

        // Sync COGS from Shopify if available
        const shopifyCost = costLookup.get(variant.inventory_item_id?.toString() || '')
        if (shopifyCost && shopifyCost > 0) {
          // Check if we already have a SHOPIFY_COST entry for this variant
          const existingCogs = await prisma.variantCOGS.findFirst({
            where: {
              variantId: savedVariant.id,
              source: 'SHOPIFY_COST',
              effectiveTo: null, // Current active entry
            },
          })

          if (!existingCogs || Number(existingCogs.costPrice) !== shopifyCost) {
            // Close the old entry if it exists and cost changed
            if (existingCogs && Number(existingCogs.costPrice) !== shopifyCost) {
              await prisma.variantCOGS.update({
                where: { id: existingCogs.id },
                data: { effectiveTo: new Date() },
              })
            }

            // Create new COGS entry if it doesn't exist or cost changed
            if (!existingCogs || Number(existingCogs.costPrice) !== shopifyCost) {
              await prisma.variantCOGS.create({
                data: {
                  variantId: savedVariant.id,
                  costPrice: shopifyCost,
                  source: 'SHOPIFY_COST',
                  effectiveFrom: new Date(),
                  notes: 'Imported from Shopify inventory item cost',
                },
              })
            }
          }
        }
      }

      count++
    }

    // Continue to next page if available
    pageInfo = response.nextPageInfo
  } while (pageInfo)

  return count
}

async function syncOrders(storeId: string, client: ShopifyClient, sinceDate: Date): Promise<{ orders: number; transactions: number; refunds: number }> {
  let orderCount = 0
  let transactionCount = 0
  let refundCount = 0
  let pageInfo: string | undefined

  // Use the provided sinceDate for incremental sync
  console.log(`Syncing orders since: ${sinceDate.toISOString()}`)

  // Pre-fetch all variants for this store to avoid N+1 queries
  // This is more efficient than querying for each line item individually
  const allVariants = await prisma.productVariant.findMany({
    where: {
      product: { storeId },
    },
    select: {
      id: true,
      shopifyVariantId: true,
    },
  })

  // Build a lookup map for O(1) variant lookups
  const variantLookup = new Map<string, string>()
  for (const v of allVariants) {
    variantLookup.set(v.shopifyVariantId.toString(), v.id)
  }

  do {
    const response = await client.getOrders({
      limit: 250,
      page_info: pageInfo,
      created_at_min: sinceDate.toISOString(),
      status: 'any', // Include all orders, not just open
    })
    const { orders } = response.data

    for (const orderData of orders) {
      const order = await prisma.order.upsert({
        where: {
          storeId_shopifyOrderId: {
            storeId,
            shopifyOrderId: BigInt(orderData.id),
          },
        },
        create: {
          storeId,
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
          tags: orderData.tags ? orderData.tags.split(',').map(t => t.trim()) : [],
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

      // Sync line items and link to variants using pre-fetched lookup map
      for (const item of orderData.line_items || []) {
        // Use lookup map for O(1) variant lookup instead of N+1 queries
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
            variantId, // Link to our variant record
            title: item.title,
            variantTitle: item.variant_title,
            sku: item.sku,
            quantity: item.quantity,
            price: parseFloat(item.price || '0'),
            totalDiscount: parseFloat(item.total_discount || '0'),
            taxAmount: item.tax_lines?.reduce((sum: number, t: { price: string }) => sum + parseFloat(t.price || '0'), 0) || 0,
          },
          update: {
            variantId, // Update the link
            quantity: item.quantity,
            price: parseFloat(item.price || '0'),
            totalDiscount: parseFloat(item.total_discount || '0'),
          },
        })
      }

      // Sync transactions for payment fee calculation
      // Add delay to avoid Shopify rate limiting (2 calls/second)
      await delay(SHOPIFY_API_DELAY_MS)
      try {
        const { transactions } = await client.getTransactions(orderData.id.toString())
        for (const tx of transactions) {
          if (tx.status === 'success') {
            const feeAmount = tx.receipt?.fee_amount ? parseFloat(tx.receipt.fee_amount) : 0
            await prisma.orderTransaction.upsert({
              where: {
                orderId_shopifyTransactionId: {
                  orderId: order.id,
                  shopifyTransactionId: BigInt(tx.id),
                },
              },
              create: {
                orderId: order.id,
                shopifyTransactionId: BigInt(tx.id),
                kind: tx.kind,
                gateway: tx.gateway,
                status: tx.status,
                amount: parseFloat(tx.amount || '0'),
                currency: tx.currency,
                processedAt: new Date(tx.processed_at),
                paymentFee: feeAmount,
                paymentFeeCalculated: feeAmount > 0,
              },
              update: {
                status: tx.status,
                amount: parseFloat(tx.amount || '0'),
                paymentFee: feeAmount,
                paymentFeeCalculated: feeAmount > 0,
              },
            })
            transactionCount++
          }
        }
      } catch (txError) {
        // Continue if transaction sync fails for individual order
        console.warn(`Failed to sync transactions for order ${orderData.id}:`, txError)
      }

      // Sync refunds
      for (const refundData of orderData.refunds || []) {
        const refundAmount = refundData.transactions?.reduce(
          (sum, t) => sum + parseFloat(t.amount || '0'),
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
        refundCount++
      }

      // Update order's total refund amount
      const totalRefundAmount = (orderData.refunds || []).reduce((sum, r) => {
        return sum + (r.transactions?.reduce((tSum, t) => tSum + parseFloat(t.amount || '0'), 0) || 0)
      }, 0)

      if (totalRefundAmount > 0) {
        await prisma.order.update({
          where: { id: order.id },
          data: { totalRefundAmount },
        })
      }

      orderCount++
    }

    // Continue to next page if available
    pageInfo = response.nextPageInfo
  } while (pageInfo)

  return { orders: orderCount, transactions: transactionCount, refunds: refundCount }
}
