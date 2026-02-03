/**
 * TrueProfit Webhook Handler
 * Handles Shopify webhooks with HMAC verification
 */

import crypto from 'crypto'
import { prisma } from '@/lib/prisma'
import { logError, createSafeError } from '@/lib/errors/safe-error'

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
// IDEMPOTENCY (In-memory for simplicity)
// ===========================================

// Simple in-memory cache for processed webhooks (last 1000)
const processedWebhooks = new Map<string, number>()
const MAX_CACHE_SIZE = 1000

/**
 * Generate a unique webhook ID from the payload
 */
export function generateWebhookId(
  topic: string,
  shopDomain: string,
  payload: WebhookPayload
): string {
  const payloadId = payload.id?.toString() || crypto.randomUUID()
  const components = [topic, shopDomain, payloadId]

  return crypto
    .createHash('sha256')
    .update(components.join(':'))
    .digest('hex')
    .substring(0, 32)
}

/**
 * Check if a webhook has already been processed (in-memory check)
 */
export async function isWebhookProcessed(webhookId: string): Promise<boolean> {
  return processedWebhooks.has(webhookId)
}

/**
 * Mark a webhook as processed (in-memory)
 */
export async function markWebhookProcessed(
  webhookId: string,
  _topic: string,
  _storeId: string,
  _payload: unknown,
  _status: 'PROCESSED' | 'FAILED' | 'SKIPPED',
  _errorMessage?: string
): Promise<void> {
  // Clean up old entries if cache is too large
  if (processedWebhooks.size >= MAX_CACHE_SIZE) {
    const entries = Array.from(processedWebhooks.entries())
    entries.sort((a, b) => a[1] - b[1])
    // Remove oldest 20%
    const toRemove = Math.floor(MAX_CACHE_SIZE * 0.2)
    for (let i = 0; i < toRemove; i++) {
      processedWebhooks.delete(entries[i][0])
    }
  }

  processedWebhooks.set(webhookId, Date.now())
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
