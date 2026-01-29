import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { ShopifyClient } from '@/services/shopify/client'

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
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

  if (!store || !store.shopifyAccessToken) {
    return NextResponse.json({ error: 'Store not found or not connected' }, { status: 404 })
  }

  const client = new ShopifyClient({
    shopDomain: store.shopifyDomain,
    accessToken: store.shopifyAccessToken,
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

  // Get orders from the last 90 days by default (increased from 60)
  const sinceDate = new Date()
  sinceDate.setDate(sinceDate.getDate() - 90)

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

      // Sync line items and link to variants
      for (const item of orderData.line_items || []) {
        // Try to find the variant in our database
        let variantId: string | null = null
        if (item.variant_id) {
          const variant = await prisma.productVariant.findFirst({
            where: {
              shopifyVariantId: BigInt(item.variant_id),
              product: { storeId },
            },
          })
          variantId = variant?.id || null
        }

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
