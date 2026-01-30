/**
 * Centralized encryption utilities for sensitive data
 *
 * CRITICAL: ENCRYPTION_KEY must be set in production.
 * Without it, encrypted data will be lost on server restart.
 */

import crypto from 'crypto'

// Validate encryption key at module load time
function getEncryptionKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY

  if (!key) {
    // In development, allow a warning but don't crash
    if (process.env.NODE_ENV === 'development') {
      console.warn(
        '\n⚠️  WARNING: ENCRYPTION_KEY environment variable is not set.\n' +
        '   Using a temporary key - encrypted data will be LOST on restart!\n' +
        '   Set ENCRYPTION_KEY in your .env file for persistent encryption.\n' +
        '   Generate one with: openssl rand -hex 32\n'
      )
      // Use a deterministic key in development so data persists across hot reloads
      // This is NOT secure for production but prevents data loss in dev
      return Buffer.from('development_key_not_secure_32b!', 'utf8')
    }

    // In production, throw an error - this must be configured
    throw new Error(
      'CRITICAL: ENCRYPTION_KEY environment variable is required in production.\n' +
      'Generate one with: openssl rand -hex 32\n' +
      'Then add to your environment: ENCRYPTION_KEY=<generated_key>'
    )
  }

  // Validate key format (should be 64 hex characters = 32 bytes)
  if (!/^[a-fA-F0-9]{64}$/.test(key)) {
    throw new Error(
      'ENCRYPTION_KEY must be exactly 64 hexadecimal characters (32 bytes).\n' +
      'Generate one with: openssl rand -hex 32'
    )
  }

  return Buffer.from(key, 'hex')
}

// Initialize key once at module load
let encryptionKey: Buffer | null = null

function getKey(): Buffer {
  if (!encryptionKey) {
    encryptionKey = getEncryptionKey()
  }
  return encryptionKey
}

/**
 * Encrypt sensitive text using AES-256-CBC
 * @param text - Plain text to encrypt
 * @returns Encrypted string in format: iv:encryptedData
 */
export function encrypt(text: string): string {
  if (!text) {
    throw new Error('Cannot encrypt empty or null text')
  }

  const key = getKey()
  const iv = crypto.randomBytes(16)
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv)

  let encrypted = cipher.update(text, 'utf8', 'hex')
  encrypted += cipher.final('hex')

  return iv.toString('hex') + ':' + encrypted
}

/**
 * Decrypt text that was encrypted with encrypt()
 * @param encryptedText - Encrypted string in format: iv:encryptedData
 * @returns Decrypted plain text
 */
export function decrypt(encryptedText: string): string {
  if (!encryptedText) {
    throw new Error('Cannot decrypt empty or null text')
  }

  const parts = encryptedText.split(':')
  if (parts.length !== 2) {
    throw new Error('Invalid encrypted text format. Expected format: iv:encryptedData')
  }

  const [ivHex, encrypted] = parts

  if (!/^[a-fA-F0-9]{32}$/.test(ivHex)) {
    throw new Error('Invalid IV format in encrypted text')
  }

  const key = getKey()
  const iv = Buffer.from(ivHex, 'hex')
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv)

  try {
    let decrypted = decipher.update(encrypted, 'hex', 'utf8')
    decrypted += decipher.final('utf8')
    return decrypted
  } catch {
    throw new Error(
      'Failed to decrypt data. This may indicate:\n' +
      '1. The ENCRYPTION_KEY has changed since the data was encrypted\n' +
      '2. The encrypted data is corrupted\n' +
      '3. The data was encrypted with a different algorithm'
    )
  }
}

/**
 * Check if encryption is properly configured
 * @returns true if encryption is ready for production use
 */
export function isEncryptionConfigured(): boolean {
  try {
    const key = process.env.ENCRYPTION_KEY
    return !!key && /^[a-fA-F0-9]{64}$/.test(key)
  } catch {
    return false
  }
}

/**
 * Verify encryption round-trip works correctly
 * Useful for health checks
 */
export function verifyEncryption(): boolean {
  try {
    const testData = 'encryption_test_' + Date.now()
    const encrypted = encrypt(testData)
    const decrypted = decrypt(encrypted)
    return decrypted === testData
  } catch {
    return false
  }
}
