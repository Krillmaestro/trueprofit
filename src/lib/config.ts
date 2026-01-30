/**
 * Environment configuration validation
 *
 * This module validates required environment variables at startup
 * to catch configuration issues early rather than at runtime.
 */

// Track if validation has been run
let validated = false

interface ConfigError {
  variable: string
  message: string
  severity: 'error' | 'warning'
}

/**
 * Validate all required environment variables
 * Call this at app startup to catch configuration issues early
 */
export function validateConfig(): void {
  if (validated) return
  validated = true

  const errors: ConfigError[] = []
  const warnings: ConfigError[] = []

  const isProduction = process.env.NODE_ENV === 'production'
  // Check if we're in build phase (Next.js sets this during build)
  const isBuild = process.env.NEXT_PHASE === 'phase-production-build'

  // ===================
  // CRITICAL VARIABLES
  // ===================

  // NEXTAUTH_SECRET - Required for secure session signing
  const nextAuthSecret = process.env.NEXTAUTH_SECRET
  if (!nextAuthSecret) {
    errors.push({
      variable: 'NEXTAUTH_SECRET',
      message: 'Not set. Sessions will be insecure. Generate with: openssl rand -base64 32',
      severity: 'error',
    })
  } else if (nextAuthSecret === 'your-super-secret-key-change-in-production') {
    // Check for common default values
    if (isProduction) {
      errors.push({
        variable: 'NEXTAUTH_SECRET',
        message: 'Using default/example value in production. Generate a unique secret.',
        severity: 'error',
      })
    } else {
      warnings.push({
        variable: 'NEXTAUTH_SECRET',
        message: 'Using default value. Change before deploying to production.',
        severity: 'warning',
      })
    }
  } else if (nextAuthSecret.length < 32) {
    warnings.push({
      variable: 'NEXTAUTH_SECRET',
      message: 'Secret is short. Recommend at least 32 characters.',
      severity: 'warning',
    })
  }

  // DATABASE_URL - Required for Prisma
  if (!process.env.DATABASE_URL) {
    errors.push({
      variable: 'DATABASE_URL',
      message: 'Not set. Database connection will fail.',
      severity: 'error',
    })
  }

  // ENCRYPTION_KEY - Required for token encryption
  const encryptionKey = process.env.ENCRYPTION_KEY
  if (!encryptionKey) {
    if (isProduction) {
      errors.push({
        variable: 'ENCRYPTION_KEY',
        message: 'Not set. Encrypted data will be lost on restart. Generate with: openssl rand -hex 32',
        severity: 'error',
      })
    } else {
      warnings.push({
        variable: 'ENCRYPTION_KEY',
        message: 'Not set. Using temporary key. Data may be lost on restart.',
        severity: 'warning',
      })
    }
  } else if (!/^[a-fA-F0-9]{64}$/.test(encryptionKey)) {
    errors.push({
      variable: 'ENCRYPTION_KEY',
      message: 'Invalid format. Must be exactly 64 hex characters (32 bytes).',
      severity: 'error',
    })
  }

  // ===================
  // OPTIONAL VARIABLES
  // ===================

  // NEXTAUTH_URL - Important for OAuth callbacks
  if (!process.env.NEXTAUTH_URL && isProduction) {
    warnings.push({
      variable: 'NEXTAUTH_URL',
      message: 'Not set. OAuth redirects may not work correctly.',
      severity: 'warning',
    })
  }

  // Shopify configuration
  if (!process.env.SHOPIFY_API_KEY || !process.env.SHOPIFY_API_SECRET) {
    warnings.push({
      variable: 'SHOPIFY_API_KEY/SECRET',
      message: 'Not configured. Shopify integration will not work.',
      severity: 'warning',
    })
  }

  // Google OAuth (optional but recommended)
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    warnings.push({
      variable: 'GOOGLE_CLIENT_ID/SECRET',
      message: 'Not configured. Google sign-in will not work.',
      severity: 'warning',
    })
  }

  // Facebook Ads (optional)
  if (!process.env.FACEBOOK_APP_ID || !process.env.FACEBOOK_APP_SECRET) {
    // Only warn in production since it's optional
    if (isProduction) {
      warnings.push({
        variable: 'FACEBOOK_APP_ID/SECRET',
        message: 'Not configured. Facebook Ads integration will not work.',
        severity: 'warning',
      })
    }
  }

  // Google Ads (optional)
  if (!process.env.GOOGLE_ADS_DEVELOPER_TOKEN) {
    if (isProduction) {
      warnings.push({
        variable: 'GOOGLE_ADS_DEVELOPER_TOKEN',
        message: 'Not configured. Google Ads integration will not work.',
        severity: 'warning',
      })
    }
  }

  // ===================
  // OUTPUT RESULTS
  // ===================

  if (errors.length > 0 || warnings.length > 0) {
    console.log('\n========================================')
    console.log('  Environment Configuration Check')
    console.log('========================================\n')

    if (errors.length > 0) {
      console.error('❌ ERRORS (must fix before production):')
      for (const err of errors) {
        console.error(`   ${err.variable}: ${err.message}`)
      }
      console.log()
    }

    if (warnings.length > 0) {
      console.warn('⚠️  WARNINGS:')
      for (const warn of warnings) {
        console.warn(`   ${warn.variable}: ${warn.message}`)
      }
      console.log()
    }

    console.log('========================================\n')

    // In production runtime (not build), throw on critical errors
    if (isProduction && !isBuild && errors.length > 0) {
      throw new Error(
        `Configuration errors found. Cannot start in production.\n` +
        errors.map(e => `  - ${e.variable}: ${e.message}`).join('\n')
      )
    }
  }
}

/**
 * Get a typed config value with fallback
 */
export function getConfig<T extends string | number | boolean>(
  key: string,
  defaultValue: T
): T {
  const value = process.env[key]

  if (value === undefined) {
    return defaultValue
  }

  // Handle type coercion based on default value type
  if (typeof defaultValue === 'number') {
    const num = Number(value)
    return (isNaN(num) ? defaultValue : num) as T
  }

  if (typeof defaultValue === 'boolean') {
    return (value === 'true' || value === '1') as T
  }

  return value as T
}

// Run validation when this module is imported
validateConfig()
