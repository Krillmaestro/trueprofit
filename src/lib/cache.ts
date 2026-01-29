/**
 * Simple in-memory cache with TTL support
 * Useful for caching expensive calculations like dashboard summaries
 */

interface CacheEntry<T> {
  data: T
  expiresAt: number
}

class SimpleCache {
  private cache = new Map<string, CacheEntry<unknown>>()
  private cleanupInterval: ReturnType<typeof setInterval> | null = null

  constructor() {
    // Run cleanup every 5 minutes
    if (typeof setInterval !== 'undefined') {
      this.cleanupInterval = setInterval(() => this.cleanup(), 5 * 60 * 1000)
    }
  }

  /**
   * Get cached value if it exists and hasn't expired
   */
  get<T>(key: string): T | null {
    const entry = this.cache.get(key) as CacheEntry<T> | undefined
    if (!entry) return null

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key)
      return null
    }

    return entry.data
  }

  /**
   * Set a cached value with TTL in seconds
   */
  set<T>(key: string, data: T, ttlSeconds: number): void {
    this.cache.set(key, {
      data,
      expiresAt: Date.now() + (ttlSeconds * 1000),
    })
  }

  /**
   * Delete a specific cache entry
   */
  delete(key: string): void {
    this.cache.delete(key)
  }

  /**
   * Delete all cache entries matching a prefix
   */
  deleteByPrefix(prefix: string): void {
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) {
        this.cache.delete(key)
      }
    }
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    this.cache.clear()
  }

  /**
   * Remove expired entries
   */
  private cleanup(): void {
    const now = Date.now()
    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(key)
      }
    }
  }

  /**
   * Get cache statistics
   */
  stats(): { size: number; keys: string[] } {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys()),
    }
  }
}

// Singleton cache instance
export const cache = new SimpleCache()

// Cache key generators for consistent key naming
export const cacheKeys = {
  dashboardSummary: (teamId: string, startDate: string, endDate: string, storeId?: string) =>
    `dashboard:${teamId}:${startDate}:${endDate}:${storeId || 'all'}`,

  pnlReport: (teamId: string, periodType: string, storeId?: string) =>
    `pnl:${teamId}:${periodType}:${storeId || 'all'}`,

  stores: (teamId: string) => `stores:${teamId}`,

  products: (storeId: string) => `products:${storeId}`,

  orders: (storeId: string, page: number) => `orders:${storeId}:${page}`,
}

// Cache TTL constants (in seconds)
export const cacheTTL = {
  dashboardSummary: 60, // 1 minute
  pnlReport: 120, // 2 minutes
  stores: 300, // 5 minutes
  products: 300, // 5 minutes
  orders: 60, // 1 minute
}

/**
 * Helper to get or compute cached value
 */
export async function getOrCompute<T>(
  key: string,
  ttlSeconds: number,
  compute: () => Promise<T>
): Promise<T> {
  const cached = cache.get<T>(key)
  if (cached !== null) {
    return cached
  }

  const data = await compute()
  cache.set(key, data, ttlSeconds)
  return data
}
