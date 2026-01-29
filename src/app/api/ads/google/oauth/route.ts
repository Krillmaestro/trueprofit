import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { GoogleAdsClient, exchangeGoogleAuthCode } from '@/services/ads/google'
import crypto from 'crypto'

// Use Google Ads specific credentials if available, otherwise fall back to regular Google OAuth
const GOOGLE_ADS_CLIENT_ID = process.env.GOOGLE_ADS_CLIENT_ID || process.env.GOOGLE_CLIENT_ID || ''
const GOOGLE_ADS_CLIENT_SECRET = process.env.GOOGLE_ADS_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET || ''
const GOOGLE_ADS_DEVELOPER_TOKEN = process.env.GOOGLE_ADS_DEVELOPER_TOKEN || ''
const APP_URL = process.env.NEXTAUTH_URL || 'http://localhost:3000'

// Encryption for storing tokens
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || crypto.randomBytes(32).toString('hex')

function encrypt(text: string): string {
  const iv = crypto.randomBytes(16)
  const key = Buffer.from(ENCRYPTION_KEY.slice(0, 64), 'hex')
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv)
  let encrypted = cipher.update(text, 'utf8', 'hex')
  encrypted += cipher.final('hex')
  return iv.toString('hex') + ':' + encrypted
}

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)

  if (!session?.user?.id) {
    return NextResponse.redirect(new URL('/login', APP_URL))
  }

  const searchParams = request.nextUrl.searchParams
  const code = searchParams.get('code')
  const error = searchParams.get('error')

  // Handle OAuth errors
  if (error) {
    console.error('Google Ads OAuth error:', error)
    return NextResponse.redirect(new URL('/ads?error=google_oauth_denied', APP_URL))
  }

  // Check if Google Ads is properly configured
  if (!GOOGLE_ADS_CLIENT_ID || !GOOGLE_ADS_CLIENT_SECRET) {
    console.error('Google Ads OAuth not configured: missing client credentials')
    return NextResponse.redirect(new URL('/ads?error=google_not_configured', APP_URL))
  }

  if (!GOOGLE_ADS_DEVELOPER_TOKEN) {
    console.error('Google Ads developer token not configured')
    return NextResponse.redirect(new URL('/ads?error=google_developer_token_missing', APP_URL))
  }

  // Step 1: Initiate OAuth flow
  if (!code) {
    const redirectUri = `${APP_URL}/api/ads/google/oauth`
    const scopes = [
      'https://www.googleapis.com/auth/adwords',
    ].join(' ')

    const stateToken = crypto.randomBytes(16).toString('hex')

    const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth')
    authUrl.searchParams.set('client_id', GOOGLE_ADS_CLIENT_ID)
    authUrl.searchParams.set('redirect_uri', redirectUri)
    authUrl.searchParams.set('scope', scopes)
    authUrl.searchParams.set('state', stateToken)
    authUrl.searchParams.set('response_type', 'code')
    authUrl.searchParams.set('access_type', 'offline')
    authUrl.searchParams.set('prompt', 'consent')

    return NextResponse.redirect(authUrl.toString())
  }

  // Step 2: Exchange code for access token
  try {
    const redirectUri = `${APP_URL}/api/ads/google/oauth`

    const tokens = await exchangeGoogleAuthCode(
      code,
      GOOGLE_ADS_CLIENT_ID,
      GOOGLE_ADS_CLIENT_SECRET,
      redirectUri
    )

    // Get accessible customers
    const client = new GoogleAdsClient(tokens.access_token, GOOGLE_ADS_DEVELOPER_TOKEN)
    const customerIds = await client.getAccessibleCustomers()

    if (customerIds.length === 0) {
      return NextResponse.redirect(new URL('/ads?error=no_google_accounts', APP_URL))
    }

    // Get user's team
    const teamMember = await prisma.teamMember.findFirst({
      where: { userId: session.user.id },
      include: { team: true },
    })

    if (!teamMember) {
      return NextResponse.redirect(new URL('/ads?error=no_team', APP_URL))
    }

    // Calculate token expiry
    const tokenExpiresAt = new Date()
    tokenExpiresAt.setSeconds(tokenExpiresAt.getSeconds() + tokens.expires_in)

    // Get info for each customer and save
    for (const customerId of customerIds) {
      try {
        const customerInfo = await client.getCustomerInfo(customerId)

        await prisma.adAccount.upsert({
          where: {
            teamId_platform_platformAccountId: {
              teamId: teamMember.teamId,
              platform: 'GOOGLE',
              platformAccountId: customerId,
            },
          },
          create: {
            teamId: teamMember.teamId,
            platform: 'GOOGLE',
            platformAccountId: customerId,
            accountName: customerInfo.descriptiveName,
            accessTokenEncrypted: encrypt(tokens.access_token),
            refreshTokenEncrypted: tokens.refresh_token ? encrypt(tokens.refresh_token) : null,
            tokenExpiresAt,
            currency: customerInfo.currencyCode,
            isActive: true,
          },
          update: {
            accountName: customerInfo.descriptiveName,
            accessTokenEncrypted: encrypt(tokens.access_token),
            refreshTokenEncrypted: tokens.refresh_token ? encrypt(tokens.refresh_token) : null,
            tokenExpiresAt,
            currency: customerInfo.currencyCode,
            isActive: true,
          },
        })
      } catch (err) {
        console.error(`Failed to get info for customer ${customerId}:`, err)
        // Continue with other customers
      }
    }

    return NextResponse.redirect(new URL('/ads?success=google_connected', APP_URL))
  } catch (error) {
    console.error('Google Ads OAuth error:', error)
    return NextResponse.redirect(new URL('/ads?error=google_failed', APP_URL))
  }
}
