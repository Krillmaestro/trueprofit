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

    if (type === 'products' || type === 'all') {
      syncedCount += await syncProducts(store.id, client)
    }

    if (type === 'orders' || type === 'all') {
      syncedCount += await syncOrders(store.id, client)
    }

    // Update last sync time
    await prisma.store.update({
      where: { id: store.id },
      data: { lastSyncAt: new Date() },
    })

    return NextResponse.json({
      success: true,
      syncedCount,
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
    const { products } = await client.getProducts({ limit: 250, page_info: pageInfo })

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

    // Pagination would need to be implemented via Link header parsing
    // For simplicity, we'll break after first page for now
    pageInfo = undefined
  } while (pageInfo)

  return count
}

async function syncOrders(storeId: string, client: ShopifyClient): Promise<number> {
  let count = 0
  let pageInfo: string | undefined

  // Get orders from the last 60 days by default
  const sinceDate = new Date()
  sinceDate.setDate(sinceDate.getDate() - 60)

  do {
    const { orders } = await client.getOrders({
      limit: 250,
      page_info: pageInfo,
      created_at_min: sinceDate.toISOString(),
    })

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

      // Sync line items
      for (const item of orderData.line_items || []) {
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
            title: item.title,
            variantTitle: item.variant_title,
            sku: item.sku,
            quantity: item.quantity,
            price: parseFloat(item.price || '0'),
            totalDiscount: parseFloat(item.total_discount || '0'),
            taxAmount: item.tax_lines?.reduce((sum: number, t: { price: string }) => sum + parseFloat(t.price || '0'), 0) || 0,
          },
          update: {
            quantity: item.quantity,
            price: parseFloat(item.price || '0'),
            totalDiscount: parseFloat(item.total_discount || '0'),
          },
        })
      }

      count++
    }

    // Pagination would need to be implemented via Link header parsing
    // For simplicity, we'll break after first page for now
    pageInfo = undefined
  } while (pageInfo)

  return count
}
