/**
 * In-memory rate limiter for API protection
 *
 * This provides basic rate limiting to protect against:
 * - Brute force attacks on authentication
 * - DoS attacks on expensive endpoints
 * - API abuse
 *
 * For production at scale, consider using Redis-based rate limiting.
 */

interface RateLimitEntry {
  count: number
  resetAt: number
}

interface RateLimitConfig {
  /** Maximum number of requests allowed */
  limit: number
  /** Time window in seconds */
  windowSeconds: number
}

// Store rate limit data in memory
const rateLimitStore = new Map<string, RateLimitEntry>()

// Cleanup old entries periodically
let cleanupInterval: NodeJS.Timeout | null = null

function startCleanup() {
  if (cleanupInterval) return

  cleanupInterval = setInterval(() => {
    const now = Date.now()
    for (const [key, entry] of rateLimitStore.entries()) {
      if (now > entry.resetAt) {
        rateLimitStore.delete(key)
      }
    }
  }, 60 * 1000) // Run every minute

  // Don't prevent process from exiting
  if (cleanupInterval.unref) {
    cleanupInterval.unref()
  }
}

// Start cleanup on module load
startCleanup()

/**
 * Check if a request is rate limited
 * @param identifier - Unique identifier (usually IP address or user ID)
 * @param config - Rate limit configuration
 * @returns Object with limited status and remaining info
 */
export function checkRateLimit(
  identifier: string,
  config: RateLimitConfig
): { limited: boolean; remaining: number; resetAt: number } {
  const now = Date.now()
  const key = identifier
  const entry = rateLimitStore.get(key)

  // If no entry or window expired, create new entry
  if (!entry || now > entry.resetAt) {
    const resetAt = now + config.windowSeconds * 1000
    rateLimitStore.set(key, { count: 1, resetAt })
    return { limited: false, remaining: config.limit - 1, resetAt }
  }

  // Increment count
  entry.count++

  // Check if over limit
  if (entry.count > config.limit) {
    return { limited: true, remaining: 0, resetAt: entry.resetAt }
  }

  return { limited: false, remaining: config.limit - entry.count, resetAt: entry.resetAt }
}

/**
 * Get rate limit headers for response
 */
export function getRateLimitHeaders(
  limit: number,
  remaining: number,
  resetAt: number
): Record<string, string> {
  return {
    'X-RateLimit-Limit': limit.toString(),
    'X-RateLimit-Remaining': Math.max(0, remaining).toString(),
    'X-RateLimit-Reset': Math.ceil(resetAt / 1000).toString(),
  }
}

/**
 * Create a rate limiter middleware function
 */
export function createRateLimiter(config: RateLimitConfig) {
  return function rateLimit(identifier: string) {
    return checkRateLimit(identifier, config)
  }
}

// Pre-configured rate limiters for common use cases

/**
 * Rate limiter for authentication endpoints
 * Strict: 5 attempts per 15 minutes
 */
export const authRateLimiter = createRateLimiter({
  limit: 5,
  windowSeconds: 15 * 60, // 15 minutes
})

/**
 * Rate limiter for registration
 * Very strict: 3 registrations per hour per IP
 */
export const registrationRateLimiter = createRateLimiter({
  limit: 3,
  windowSeconds: 60 * 60, // 1 hour
})

/**
 * Rate limiter for sync operations
 * Moderate: 10 syncs per 5 minutes
 */
export const syncRateLimiter = createRateLimiter({
  limit: 10,
  windowSeconds: 5 * 60, // 5 minutes
})

/**
 * Rate limiter for OAuth initiations
 * Moderate: 5 OAuth attempts per 5 minutes
 */
export const oauthRateLimiter = createRateLimiter({
  limit: 5,
  windowSeconds: 5 * 60, // 5 minutes
})

/**
 * Rate limiter for general API endpoints
 * Relaxed: 100 requests per minute
 */
export const apiRateLimiter = createRateLimiter({
  limit: 100,
  windowSeconds: 60, // 1 minute
})

/**
 * Rate limiter for file imports
 * Strict: 5 imports per 10 minutes
 */
export const importRateLimiter = createRateLimiter({
  limit: 5,
  windowSeconds: 10 * 60, // 10 minutes
})

/**
 * Get client IP from request
 */
export function getClientIp(request: Request): string {
  // Check common headers used by proxies/load balancers
  const forwardedFor = request.headers.get('x-forwarded-for')
  if (forwardedFor) {
    // x-forwarded-for can contain multiple IPs, first one is client
    return forwardedFor.split(',')[0].trim()
  }

  const realIp = request.headers.get('x-real-ip')
  if (realIp) {
    return realIp.trim()
  }

  // Cloudflare
  const cfConnectingIp = request.headers.get('cf-connecting-ip')
  if (cfConnectingIp) {
    return cfConnectingIp.trim()
  }

  // Fallback - this may not be reliable in all environments
  return 'unknown'
}

/**
 * Combine IP and user ID for rate limiting authenticated endpoints
 */
export function getRateLimitKey(request: Request, userId?: string): string {
  const ip = getClientIp(request)
  if (userId) {
    return `${ip}:${userId}`
  }
  return ip
}
