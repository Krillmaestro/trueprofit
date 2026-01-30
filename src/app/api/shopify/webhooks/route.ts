import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { prisma } from '@/lib/prisma'

const SHOPIFY_API_SECRET = process.env.SHOPIFY_API_SECRET!

// Verify Shopify webhook HMAC
function verifyWebhook(rawBody: string, hmacHeader: string): boolean {
  const generatedHmac = crypto
    .createHmac('sha256', SHOPIFY_API_SECRET)
    .update(rawBody, 'utf8')
    .digest('base64')

  return crypto.timingSafeEqual(
    Buffer.from(generatedHmac),
    Buffer.from(hmacHeader)
  )
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text()
  const hmacHeader = request.headers.get('x-shopify-hmac-sha256')
  const topic = request.headers.get('x-shopify-topic')
  const shopDomain = request.headers.get('x-shopify-shop-domain')

  if (!hmacHeader || !verifyWebhook(rawBody, hmacHeader)) {
    return NextResponse.json({ error: 'Invalid HMAC' }, { status: 401 })
  }

  const data = JSON.parse(rawBody)

  // Find the store
  const store = await prisma.store.findUnique({
    where: { shopifyDomain: shopDomain?.replace('.myshopify.com', '') || '' },
  })

  if (!store) {
    return NextResponse.json({ error: 'Store not found' }, { status: 404 })
  }

  try {
    switch (topic) {
      case 'orders/create':
      case 'orders/updated':
        await handleOrderWebhook(store.id, data)
        break

      case 'products/create':
      case 'products/update':
        await handleProductWebhook(store.id, data)
        break

      case 'products/delete':
        await handleProductDelete(store.id, data)
        break

      case 'refunds/create':
        await handleRefundWebhook(store.id, data)
        break

      case 'app/uninstalled':
        await handleAppUninstalled(store.id)
        break

      default:
        console.log(`Unhandled webhook topic: ${topic}`)
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error(`Webhook error for ${topic}:`, error)
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 })
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleOrderWebhook(storeId: string, orderData: Record<string, any>) {
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

  // Process line items
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

  // Process transactions
  for (const txn of orderData.transactions || []) {
    if (txn.status === 'success') {
      await prisma.orderTransaction.upsert({
        where: {
          orderId_shopifyTransactionId: {
            orderId: order.id,
            shopifyTransactionId: BigInt(txn.id),
          },
        },
        create: {
          orderId: order.id,
          shopifyTransactionId: BigInt(txn.id),
          kind: txn.kind,
          gateway: txn.gateway,
          status: txn.status,
          amount: parseFloat(txn.amount || '0'),
          currency: txn.currency,
          processedAt: txn.processed_at ? new Date(txn.processed_at) : new Date(),
        },
        update: {
          status: txn.status,
          amount: parseFloat(txn.amount || '0'),
        },
      })
    }
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleProductWebhook(storeId: string, productData: Record<string, any>) {
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

  // Process variants
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
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleProductDelete(storeId: string, productData: Record<string, any>) {
  await prisma.product.updateMany({
    where: {
      storeId,
      shopifyProductId: BigInt(productData.id),
    },
    data: {
      status: 'archived',
    },
  })
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleRefundWebhook(storeId: string, refundData: Record<string, any>) {
  const order = await prisma.order.findFirst({
    where: {
      storeId,
      shopifyOrderId: BigInt(refundData.order_id),
    },
  })

  if (!order) return

  // Calculate total refund amount
  const refundAmount = refundData.transactions?.reduce(
    (sum: number, t: { amount: string }) => sum + parseFloat(t.amount || '0'),
    0
  ) || 0

  // Update order's refunded amount
  await prisma.order.update({
    where: { id: order.id },
    data: {
      totalRefundAmount: {
        increment: refundAmount,
      },
    },
  })

  // Create refund record
  await prisma.orderRefund.create({
    data: {
      orderId: order.id,
      shopifyRefundId: BigInt(refundData.id),
      amount: refundAmount,
      note: refundData.note || null,
      processedAt: refundData.processed_at ? new Date(refundData.processed_at) : new Date(),
    },
  })
}

async function handleAppUninstalled(storeId: string) {
  await prisma.store.update({
    where: { id: storeId },
    data: {
      isActive: false,
      shopifyAccessTokenEncrypted: null,
    },
  })
}
