/**
 * OAuth State Token Management
 *
 * Provides secure state token generation and validation for OAuth flows.
 * Prevents CSRF attacks by ensuring the state parameter in callbacks
 * matches what was originally sent.
 *
 * Uses in-memory storage with automatic expiration.
 * For production at scale, consider using Redis or database storage.
 */

import crypto from 'crypto'

interface StateEntry {
  userId: string
  createdAt: number
  metadata?: Record<string, string>
}

// In-memory store for state tokens
// Key: state token, Value: StateEntry
const stateStore = new Map<string, StateEntry>()

// State tokens expire after 10 minutes
const STATE_TOKEN_TTL_MS = 10 * 60 * 1000

// Cleanup interval
let cleanupInterval: NodeJS.Timeout | null = null

function startCleanup() {
  if (cleanupInterval) return

  cleanupInterval = setInterval(() => {
    const now = Date.now()
    for (const [token, entry] of stateStore.entries()) {
      if (now - entry.createdAt > STATE_TOKEN_TTL_MS) {
        stateStore.delete(token)
      }
    }
  }, 60 * 1000) // Run every minute

  if (cleanupInterval.unref) {
    cleanupInterval.unref()
  }
}

startCleanup()

/**
 * Generate a new OAuth state token and store it
 * @param userId - The user ID initiating the OAuth flow
 * @param metadata - Optional metadata to store with the token
 * @returns The generated state token
 */
export function generateStateToken(
  userId: string,
  metadata?: Record<string, string>
): string {
  const token = crypto.randomBytes(32).toString('hex')

  stateStore.set(token, {
    userId,
    createdAt: Date.now(),
    metadata,
  })

  return token
}

/**
 * Validate and consume an OAuth state token
 * @param token - The state token to validate
 * @param userId - The expected user ID
 * @returns The stored metadata if valid, null if invalid
 */
export function validateStateToken(
  token: string,
  userId: string
): { valid: true; metadata?: Record<string, string> } | { valid: false; error: string } {
  if (!token) {
    return { valid: false, error: 'Missing state token' }
  }

  const entry = stateStore.get(token)

  if (!entry) {
    return { valid: false, error: 'Invalid or expired state token' }
  }

  // Check if token has expired
  if (Date.now() - entry.createdAt > STATE_TOKEN_TTL_MS) {
    stateStore.delete(token)
    return { valid: false, error: 'State token has expired' }
  }

  // Verify user ID matches
  if (entry.userId !== userId) {
    return { valid: false, error: 'State token user mismatch' }
  }

  // Consume the token (one-time use)
  stateStore.delete(token)

  return { valid: true, metadata: entry.metadata }
}

/**
 * Check if a state token exists (without consuming it)
 * Useful for debugging
 */
export function hasStateToken(token: string): boolean {
  return stateStore.has(token)
}

/**
 * Get statistics about stored state tokens
 * Useful for monitoring
 */
export function getStateTokenStats(): { count: number; oldestAge: number } {
  const now = Date.now()
  let oldestAge = 0

  for (const entry of stateStore.values()) {
    const age = now - entry.createdAt
    if (age > oldestAge) {
      oldestAge = age
    }
  }

  return {
    count: stateStore.size,
    oldestAge: Math.round(oldestAge / 1000), // in seconds
  }
}
