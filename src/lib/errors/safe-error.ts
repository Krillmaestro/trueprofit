/**
 * TrueProfit Safe Error Handling
 * Sanitizes error messages to prevent token/sensitive data exposure
 */

import { NextResponse } from 'next/server'

// ===========================================
// SENSITIVE PATTERNS
// ===========================================

const SENSITIVE_PATTERNS = [
  // Tokens and keys
  /token[s]?[:=\s]["']?[a-zA-Z0-9_-]{20,}/gi,
  /key[s]?[:=\s]["']?[a-zA-Z0-9_-]{20,}/gi,
  /secret[s]?[:=\s]["']?[a-zA-Z0-9_-]{20,}/gi,
  /api[_-]?key[:=\s]["']?[a-zA-Z0-9_-]{20,}/gi,
  /access[_-]?token[:=\s]["']?[a-zA-Z0-9_-]{20,}/gi,
  /refresh[_-]?token[:=\s]["']?[a-zA-Z0-9_-]{20,}/gi,
  /bearer\s+[a-zA-Z0-9_-]{20,}/gi,
  /shpat_[a-zA-Z0-9]{32,}/gi, // Shopify access tokens
  /shpca_[a-zA-Z0-9]{32,}/gi, // Shopify client access tokens
  /shpss_[a-zA-Z0-9]{32,}/gi, // Shopify session tokens

  // IP addresses
  /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g,

  // URLs with credentials
  /https?:\/\/[^:]+:[^@]+@[^\s]+/gi,

  // Database connection strings
  /postgres(ql)?:\/\/[^\s]+/gi,
  /mysql:\/\/[^\s]+/gi,
  /mongodb(\+srv)?:\/\/[^\s]+/gi,

  // Email addresses (in error context)
  /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,

  // Shopify domains with access info
  /[a-zA-Z0-9-]+\.myshopify\.com\/admin\/oauth/gi,

  // AWS credentials
  /AKIA[0-9A-Z]{16}/g,

  // Private keys
  /-----BEGIN [A-Z]+ PRIVATE KEY-----/g,
]

// ===========================================
// ERROR CODES
// ===========================================

export const ErrorCodes = {
  // Authentication
  AUTH_INVALID_CREDENTIALS: 'AUTH_INVALID_CREDENTIALS',
  AUTH_TOKEN_EXPIRED: 'AUTH_TOKEN_EXPIRED',
  AUTH_UNAUTHORIZED: 'AUTH_UNAUTHORIZED',
  AUTH_FORBIDDEN: 'AUTH_FORBIDDEN',

  // Validation
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  INVALID_INPUT: 'INVALID_INPUT',
  MISSING_REQUIRED_FIELD: 'MISSING_REQUIRED_FIELD',

  // Resources
  NOT_FOUND: 'NOT_FOUND',
  ALREADY_EXISTS: 'ALREADY_EXISTS',
  CONFLICT: 'CONFLICT',

  // External services
  SHOPIFY_ERROR: 'SHOPIFY_ERROR',
  SHOPIFY_RATE_LIMITED: 'SHOPIFY_RATE_LIMITED',
  FACEBOOK_ERROR: 'FACEBOOK_ERROR',
  GOOGLE_ERROR: 'GOOGLE_ERROR',
  EXTERNAL_SERVICE_ERROR: 'EXTERNAL_SERVICE_ERROR',

  // Database
  DATABASE_ERROR: 'DATABASE_ERROR',
  CONNECTION_ERROR: 'CONNECTION_ERROR',

  // General
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  UNKNOWN_ERROR: 'UNKNOWN_ERROR',
  RATE_LIMITED: 'RATE_LIMITED',
} as const

export type ErrorCode = typeof ErrorCodes[keyof typeof ErrorCodes]

// ===========================================
// SAFE ERROR CLASS
// ===========================================

export class SafeError extends Error {
  public readonly code: ErrorCode
  public readonly statusCode: number
  public readonly isOperational: boolean
  public readonly details?: Record<string, unknown>

  constructor(
    message: string,
    code: ErrorCode = ErrorCodes.INTERNAL_ERROR,
    statusCode: number = 500,
    details?: Record<string, unknown>
  ) {
    super(message)
    this.name = 'SafeError'
    this.code = code
    this.statusCode = statusCode
    this.isOperational = true
    this.details = details

    // Capture stack trace
    Error.captureStackTrace(this, this.constructor)
  }
}

// ===========================================
// SANITIZATION FUNCTIONS
// ===========================================

/**
 * Remove sensitive data from a string
 */
export function sanitizeString(str: string): string {
  let sanitized = str

  for (const pattern of SENSITIVE_PATTERNS) {
    sanitized = sanitized.replace(pattern, '[REDACTED]')
  }

  return sanitized
}

/**
 * Check if a string contains sensitive data
 */
export function containsSensitiveData(str: string): boolean {
  for (const pattern of SENSITIVE_PATTERNS) {
    if (pattern.test(str)) {
      return true
    }
    // Reset lastIndex for global patterns
    pattern.lastIndex = 0
  }
  return false
}

/**
 * Create a safe error message from an unknown error
 */
export function createSafeError(
  error: unknown,
  defaultMessage: string = 'An unexpected error occurred'
): { message: string; code: ErrorCode } {
  // If it's already a SafeError, return as-is
  if (error instanceof SafeError) {
    return {
      message: error.message,
      code: error.code,
    }
  }

  // If it's a standard Error
  if (error instanceof Error) {
    const originalMessage = error.message

    // Check for known error patterns
    if (originalMessage.includes('ECONNREFUSED')) {
      return {
        message: 'Unable to connect to external service',
        code: ErrorCodes.CONNECTION_ERROR,
      }
    }

    if (originalMessage.includes('ETIMEDOUT') || originalMessage.includes('timeout')) {
      return {
        message: 'Request timed out',
        code: ErrorCodes.EXTERNAL_SERVICE_ERROR,
      }
    }

    if (originalMessage.includes('rate limit') || originalMessage.includes('429')) {
      return {
        message: 'Rate limit exceeded. Please try again later.',
        code: ErrorCodes.RATE_LIMITED,
      }
    }

    if (originalMessage.includes('unauthorized') || originalMessage.includes('401')) {
      return {
        message: 'Authentication failed',
        code: ErrorCodes.AUTH_UNAUTHORIZED,
      }
    }

    if (originalMessage.includes('forbidden') || originalMessage.includes('403')) {
      return {
        message: 'Access denied',
        code: ErrorCodes.AUTH_FORBIDDEN,
      }
    }

    if (originalMessage.includes('not found') || originalMessage.includes('404')) {
      return {
        message: 'Resource not found',
        code: ErrorCodes.NOT_FOUND,
      }
    }

    // Check for Shopify-specific errors
    if (originalMessage.includes('Shopify') || originalMessage.includes('shopify')) {
      return {
        message: 'Shopify integration error. Please try again or reconnect your store.',
        code: ErrorCodes.SHOPIFY_ERROR,
      }
    }

    // Check for sensitive data in message
    if (containsSensitiveData(originalMessage)) {
      console.error('[SENSITIVE DATA DETECTED]', sanitizeString(originalMessage))
      return {
        message: defaultMessage,
        code: ErrorCodes.INTERNAL_ERROR,
      }
    }

    // Return sanitized message if it looks safe
    if (originalMessage.length < 200 && !originalMessage.includes('Error:')) {
      return {
        message: sanitizeString(originalMessage),
        code: ErrorCodes.UNKNOWN_ERROR,
      }
    }
  }

  // Default fallback
  return {
    message: defaultMessage,
    code: ErrorCodes.UNKNOWN_ERROR,
  }
}

// ===========================================
// LOGGING FUNCTIONS
// ===========================================

/**
 * Log error safely (full details internally, sanitized externally)
 */
export function logError(
  error: unknown,
  context?: Record<string, unknown>
): void {
  const timestamp = new Date().toISOString()

  if (error instanceof Error) {
    // Log full error internally (server logs)
    console.error(JSON.stringify({
      timestamp,
      type: 'error',
      name: error.name,
      message: sanitizeString(error.message),
      stack: error.stack,
      context: context ? sanitizeObject(context) : undefined,
    }))
  } else {
    console.error(JSON.stringify({
      timestamp,
      type: 'error',
      message: 'Unknown error type',
      error: sanitizeString(String(error)),
      context: context ? sanitizeObject(context) : undefined,
    }))
  }
}

/**
 * Sanitize an object recursively
 */
function sanitizeObject(obj: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(obj)) {
    // Skip sensitive keys entirely
    const lowerKey = key.toLowerCase()
    if (
      lowerKey.includes('token') ||
      lowerKey.includes('secret') ||
      lowerKey.includes('password') ||
      lowerKey.includes('key') ||
      lowerKey.includes('credential')
    ) {
      sanitized[key] = '[REDACTED]'
      continue
    }

    if (typeof value === 'string') {
      sanitized[key] = sanitizeString(value)
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizeObject(value as Record<string, unknown>)
    } else {
      sanitized[key] = value
    }
  }

  return sanitized
}

// ===========================================
// API RESPONSE HELPERS
// ===========================================

/**
 * Create a safe API error response
 */
export function createErrorResponse(
  error: unknown,
  defaultMessage?: string
): {
  error: {
    message: string
    code: ErrorCode
  }
  statusCode: number
} {
  if (error instanceof SafeError) {
    return {
      error: {
        message: error.message,
        code: error.code,
      },
      statusCode: error.statusCode,
    }
  }

  const safeError = createSafeError(error, defaultMessage)

  // Determine status code
  let statusCode = 500
  if (safeError.code === ErrorCodes.NOT_FOUND) statusCode = 404
  if (safeError.code === ErrorCodes.AUTH_UNAUTHORIZED) statusCode = 401
  if (safeError.code === ErrorCodes.AUTH_FORBIDDEN) statusCode = 403
  if (safeError.code === ErrorCodes.VALIDATION_FAILED) statusCode = 400
  if (safeError.code === ErrorCodes.RATE_LIMITED) statusCode = 429
  if (safeError.code === ErrorCodes.CONFLICT) statusCode = 409

  return {
    error: safeError,
    statusCode,
  }
}

// ===========================================
// ERROR FACTORY FUNCTIONS
// ===========================================

export const Errors = {
  notFound: (resource: string) =>
    new SafeError(`${resource} not found`, ErrorCodes.NOT_FOUND, 404),

  unauthorized: (message: string = 'Unauthorized') =>
    new SafeError(message, ErrorCodes.AUTH_UNAUTHORIZED, 401),

  forbidden: (message: string = 'Access denied') =>
    new SafeError(message, ErrorCodes.AUTH_FORBIDDEN, 403),

  validation: (message: string, details?: Record<string, unknown>) =>
    new SafeError(message, ErrorCodes.VALIDATION_FAILED, 400, details),

  badRequest: (message: string, details?: Record<string, unknown>) =>
    new SafeError(message, ErrorCodes.INVALID_INPUT, 400, details),

  conflict: (message: string) =>
    new SafeError(message, ErrorCodes.CONFLICT, 409),

  rateLimited: (message: string = 'Rate limit exceeded') =>
    new SafeError(message, ErrorCodes.RATE_LIMITED, 429),

  shopify: (message: string = 'Shopify integration error') =>
    new SafeError(message, ErrorCodes.SHOPIFY_ERROR, 502),

  internal: (message: string = 'Internal server error') =>
    new SafeError(message, ErrorCodes.INTERNAL_ERROR, 500),
}

// ===========================================
// NEXTJS RESPONSE HELPER
// ===========================================

/**
 * Create a NextResponse from a SafeError
 */
export function createSafeResponse(error: SafeError): NextResponse {
  return NextResponse.json(
    {
      error: {
        message: error.message,
        code: error.code,
      },
    },
    { status: error.statusCode }
  )
}
