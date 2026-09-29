import crypto from 'crypto'
import { prisma } from './prisma'

const PREFIX = 'integration-oauth:'
const TTL_MS = 10 * 60 * 1000
const hash = (token: string) => crypto.createHash('sha256').update(token).digest('hex')

// Shared, durable storage lets callbacks survive restarts and reach any replica.
// Reuse the existing verification-token table; never store the raw nonce.
export async function generateStateToken(userId: string, metadata: Record<string, string>): Promise<string> {
  const token = crypto.randomBytes(32).toString('hex')
  await prisma.verificationToken.deleteMany({
    where: { identifier: { startsWith: PREFIX }, expires: { lt: new Date() } },
  })
  await prisma.verificationToken.create({
    data: {
      token: hash(token),
      identifier: PREFIX + JSON.stringify({ userId, metadata }),
      expires: new Date(Date.now() + TTL_MS),
    },
  })
  return token
}

export async function validateStateToken(
  token: string,
  userId: string,
  expected: Record<string, string>
): Promise<{ valid: true; metadata: Record<string, string> } | { valid: false; error: string }> {
  const invalid = { valid: false as const, error: 'Invalid or expired state token' }
  if (!/^[a-f0-9]{64}$/.test(token)) return invalid
  const entry = await prisma.verificationToken.findUnique({ where: { token: hash(token) } })
  if (!entry || !entry.identifier.startsWith(PREFIX) || entry.expires <= new Date()) return invalid
  let payload: { userId: string; metadata: Record<string, string> }
  try {
    payload = JSON.parse(entry.identifier.slice(PREFIX.length))
  } catch {
    return invalid
  }
  if (payload.userId !== userId || !payload.metadata ||
      Object.entries(expected).some(([key, value]) => payload.metadata[key] !== value)) return invalid
  // Atomic consumption prevents concurrent callbacks from replaying a nonce.
  const consumed = await prisma.verificationToken.deleteMany({
    where: { token: entry.token, identifier: entry.identifier, expires: { gt: new Date() } },
  })
  return consumed.count === 1 ? { valid: true, metadata: payload.metadata } : invalid
}
