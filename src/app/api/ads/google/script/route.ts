import crypto from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { decrypt, encrypt } from '@/lib/encryption'
import { SCRIPT_ACCOUNT_PREFIX, buildGoogleAdsScript, isScriptAccount } from '@/lib/google-ads-script'

const APP_URL = process.env.NEXTAUTH_URL || 'http://localhost:3000'

/**
 * Create a Google Ads Script connection, or return the script of an existing one.
 *
 * POST /api/ads/google/script
 * Body: { accountId?: string, rotate?: boolean }  // omit accountId to create a new connection
 *
 * Showing an existing connection keeps its key so the installed script keeps
 * working; only rotate: true issues a new key (and breaks the old script).
 */
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const teamMember = await prisma.teamMember.findFirst({
    where: { userId: session.user.id },
  })

  if (!teamMember) {
    return NextResponse.json({ error: 'Inget team hittades' }, { status: 404 })
  }

  const { accountId, rotate = false } = await request.json().catch(() => ({}))
  let secret = crypto.randomBytes(32).toString('hex')

  let account
  let rotated = false
  if (accountId) {
    const existing = await prisma.adAccount.findFirst({
      where: { id: accountId, teamId: teamMember.teamId, platform: 'GOOGLE' },
    })
    if (!existing || !isScriptAccount(existing.platformAccountId)) {
      return NextResponse.json({ error: 'Kontot hittades inte' }, { status: 404 })
    }
    if (rotate || !existing.accessTokenEncrypted) {
      // Rotating the key invalidates any previously pasted script
      account = await prisma.adAccount.update({
        where: { id: existing.id },
        data: { accessTokenEncrypted: encrypt(secret) },
      })
      rotated = true
    } else {
      account = existing
      secret = decrypt(existing.accessTokenEncrypted)
    }
  } else {
    const id = crypto.randomBytes(12).toString('hex')
    account = await prisma.adAccount.create({
      data: {
        teamId: teamMember.teamId,
        platform: 'GOOGLE',
        platformAccountId: `${SCRIPT_ACCOUNT_PREFIX}${id}`,
        accountName: 'Google Ads (väntar på första körningen)',
        accessTokenEncrypted: encrypt(secret),
        currency: 'SEK',
        isActive: true,
      },
    })
  }

  const ingestUrl = `${APP_URL.replace(/\/$/, '')}/api/ads/google/ingest`
  const script = buildGoogleAdsScript(ingestUrl, `${account.id}.${secret}`)

  return NextResponse.json({ accountId: account.id, script, rotated })
}
