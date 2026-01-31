/**
 * TrueProfit Idempotent Webhook Handler
 * Ensures webhooks are processed exactly once
 */

import crypto from 'crypto'
import { prisma } from '@/lib/prisma'
import { logError, createSafeError, ErrorCodes } from '@/lib/errors/safe-error'

// ===========================================
// TYPES
// ===========================================

export interface WebhookPayload {
  id: string | number
  [key: string]: unknown
}

export interface WebhookContext {
  topic: string
  shopDomain: string
  webhookId: string
  apiVersion?: string
  hmacHeader: string
  rawBody: string
}

export interface WebhookResult {
  success: boolean
  processed: boolean
  skipped: boolean
  message: string
  data?: unknown
}

// ===========================================
// HMAC VERIFICATION
// ===========================================

/**
 * Verify Shopify webhook HMAC signature
 * Uses timing-safe comparison to prevent timing attacks
 */
export function verifyWebhookHMAC(
  rawBody: string,
  hmacHeader: string,
  secret: string
): boolean {
  if (!rawBody || !hmacHeader || !secret) {
    return false
  }

  try {
    const generatedHmac = crypto
      .createHmac('sha256', secret)
      .update(rawBody, 'utf8')
      .digest('base64')

    // Use timing-safe comparison
    return crypto.timingSafeEqual(
      Buffer.from(generatedHmac),
      Buffer.from(hmacHeader)
    )
  } catch (error) {
    logError(error, { context: 'HMAC verification' })
    return false
  }
}

// ===========================================
// IDEMPOTENCY
// ===========================================

/**
 * Generate a unique webhook ID from the payload
 */
export function generateWebhookId(
  topic: string,
  shopDomain: string,
  payload: WebhookPayload
): string {
  // Use payload ID + topic + shop to create unique identifier
  const payloadId = payload.id?.toString() || crypto.randomUUID()
  const components = [topic, shopDomain, payloadId]

  return crypto
    .createHash('sha256')
    .update(components.join(':'))
    .digest('hex')
    .substring(0, 32)
}

/**
 * Check if a webhook has already been processed
 */
export async function isWebhookProcessed(webhookId: string): Promise<boolean> {
  try {
    const existing = await prisma.webhookLog.findUnique({
      where: { webhookId },
      select: { id: true },
    })
    return existing !== null
  } catch (error) {
    logError(error, { context: 'isWebhookProcessed', webhookId })
    // On error, assume not processed to avoid data loss
    return false
  }
}

/**
 * Mark a webhook as processed
 */
export async function markWebhookProcessed(
  webhookId: string,
  topic: string,
  storeId: string,
  payload: unknown,
  status: 'PROCESSED' | 'FAILED' | 'SKIPPED',
  errorMessage?: string
): Promise<void> {
  try {
    await prisma.webhookLog.create({
      data: {
        webhookId,
        topic,
        storeId,
        payload: payload as object,
        status,
        errorMessage,
        processedAt: new Date(),
      },
    })
  } catch (error) {
    // Log but don't throw - webhook was already processed
    logError(error, { context: 'markWebhookProcessed', webhookId })
  }
}

// ===========================================
// WEBHOOK HANDLER
// ===========================================

export type WebhookProcessor<T = unknown> = (
  payload: T,
  storeId: string,
  context: WebhookContext
) => Promise<{ success: boolean; data?: unknown }>

/**
 * Handle a webhook with idempotency
 */
export async function handleWebhook<T extends WebhookPayload>(
  context: WebhookContext,
  processor: WebhookProcessor<T>
): Promise<WebhookResult> {
  const { topic, shopDomain, hmacHeader, rawBody } = context

  // 1. Verify HMAC
  const apiSecret = process.env.SHOPIFY_API_SECRET
  if (!apiSecret) {
    logError(new Error('SHOPIFY_API_SECRET not configured'), { topic })
    return {
      success: false,
      processed: false,
      skipped: false,
      message: 'Webhook verification failed',
    }
  }

  if (!verifyWebhookHMAC(rawBody, hmacHeader, apiSecret)) {
    return {
      success: false,
      processed: false,
      skipped: false,
      message: 'Invalid HMAC signature',
    }
  }

  // 2. Parse payload
  let payload: T
  try {
    payload = JSON.parse(rawBody) as T
  } catch (error) {
    logError(error, { context: 'parseWebhookPayload', topic })
    return {
      success: false,
      processed: false,
      skipped: false,
      message: 'Invalid JSON payload',
    }
  }

  // 3. Generate webhook ID
  const webhookId = context.webhookId || generateWebhookId(topic, shopDomain, payload)

  // 4. Check idempotency
  const alreadyProcessed = await isWebhookProcessed(webhookId)
  if (alreadyProcessed) {
    return {
      success: true,
      processed: false,
      skipped: true,
      message: 'Webhook already processed',
    }
  }

  // 5. Find store
  const store = await prisma.store.findUnique({
    where: { shopifyDomain: shopDomain },
    select: { id: true, isActive: true },
  })

  if (!store) {
    return {
      success: false,
      processed: false,
      skipped: false,
      message: 'Store not found',
    }
  }

  if (!store.isActive) {
    await markWebhookProcessed(webhookId, topic, store.id, payload, 'SKIPPED', 'Store inactive')
    return {
      success: true,
      processed: false,
      skipped: true,
      message: 'Store is inactive',
    }
  }

  // 6. Process webhook
  try {
    const result = await processor(payload, store.id, context)

    await markWebhookProcessed(
      webhookId,
      topic,
      store.id,
      payload,
      result.success ? 'PROCESSED' : 'FAILED',
      result.success ? undefined : 'Processing failed'
    )

    return {
      success: result.success,
      processed: true,
      skipped: false,
      message: result.success ? 'Webhook processed successfully' : 'Processing failed',
      data: result.data,
    }
  } catch (error) {
    const safeError = createSafeError(error, 'Webhook processing failed')

    await markWebhookProcessed(
      webhookId,
      topic,
      store.id,
      payload,
      'FAILED',
      safeError.message
    )

    logError(error, {
      context: 'webhookProcessor',
      topic,
      shopDomain,
      webhookId,
    })

    return {
      success: false,
      processed: true,
      skipped: false,
      message: safeError.message,
    }
  }
}

// ===========================================
// WEBHOOK CLEANUP
// ===========================================

/**
 * Clean up old webhook logs (keep last 30 days)
 */
export async function cleanupWebhookLogs(daysToKeep: number = 30): Promise<number> {
  const cutoffDate = new Date()
  cutoffDate.setDate(cutoffDate.getDate() - daysToKeep)

  try {
    const result = await prisma.webhookLog.deleteMany({
      where: {
        processedAt: {
          lt: cutoffDate,
        },
      },
    })
    return result.count
  } catch (error) {
    logError(error, { context: 'cleanupWebhookLogs' })
    return 0
  }
}
