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

  const { storeId, type } = await request.json()

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

  try {
    let syncedCount = 0
    const syncDetails: { products?: number; orders?: number; transactions?: number; refunds?: number } = {}

    if (type === 'products' || type === 'all') {
      const productCount = await syncProducts(store.id, client)
      syncedCount += productCount
      syncDetails.products = productCount
    }

    if (type === 'orders' || type === 'all') {
      const { orders, transactions, refunds } = await syncOrders(store.id, client)
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

async function syncProducts(storeId: string, client: ShopifyClient): Promise<number> {
  let count = 0
  let pageInfo: string | undefined

  do {
    const response = await client.getProducts({ limit: 250, page_info: pageInfo })
    const { products } = response.data

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
        await prisma.productVariant.upsert({
          where: {
            productId_shopifyVariantId: {
              productId: product.id,
              shopifyVariantId: BigInt(variant.id),
            },
          },
          create: {
            productId: product.id,
            shopifyVariantId: BigInt(variant.id),
            title: variant.title,
            sku: variant.sku,
            barcode: variant.barcode,
            price: parseFloat(variant.price || '0'),
            compareAtPrice: variant.compare_at_price ? parseFloat(variant.compare_at_price) : null,
            inventoryQuantity: variant.inventory_quantity || 0,
            weight: variant.weight,
            weightUnit: variant.weight_unit,
          },
          update: {
            title: variant.title,
            sku: variant.sku,
            barcode: variant.barcode,
            price: parseFloat(variant.price || '0'),
            compareAtPrice: variant.compare_at_price ? parseFloat(variant.compare_at_price) : null,
            inventoryQuantity: variant.inventory_quantity || 0,
          },
        })
      }

      count++
    }

    // Continue to next page if available
    pageInfo = response.nextPageInfo
  } while (pageInfo)

  return count
}

async function syncOrders(storeId: string, client: ShopifyClient): Promise<{ orders: number; transactions: number; refunds: number }> {
  let orderCount = 0
  let transactionCount = 0
  let refundCount = 0
  let pageInfo: string | undefined

  // Get all orders from January 1st, 2026 onwards
  const sinceDate = new Date('2026-01-01T00:00:00Z')

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
