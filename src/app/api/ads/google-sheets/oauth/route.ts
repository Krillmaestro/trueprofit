import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { encrypt } from '@/lib/encryption'
import { oauthRateLimiter, getRateLimitKey } from '@/lib/rate-limit'
import { generateStateToken, validateStateToken } from '@/lib/oauth-state'

/**
 * Google Sheets OAuth for Google Ads data import
 *
 * This is an alternative to direct Google Ads API integration.
 * Users set up a Google Ads Script that exports data to a Google Sheet,
 * then we read from that sheet using the Sheets API.
 */

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || ''
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || ''
const APP_URL = process.env.NEXTAUTH_URL || 'http://localhost:3000'

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)

  if (!session?.user?.id) {
    return NextResponse.redirect(new URL('/login', APP_URL))
  }

  // Apply rate limiting
  const rateLimitKey = getRateLimitKey(request, session.user.id)
  const rateLimitResult = oauthRateLimiter(rateLimitKey)

  if (rateLimitResult.limited) {
    return NextResponse.redirect(new URL('/ads?error=rate_limited', APP_URL))
  }

  const searchParams = request.nextUrl.searchParams
  const code = searchParams.get('code')
  const state = searchParams.get('state')
  const error = searchParams.get('error')

  // Handle OAuth errors
  if (error) {
    console.error('Google Sheets OAuth error:', error)
    return NextResponse.redirect(new URL('/ads?error=google_oauth_denied', APP_URL))
  }

  // Check if Google OAuth is configured
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    console.error('Google OAuth not configured')
    return NextResponse.redirect(new URL('/ads?error=google_not_configured', APP_URL))
  }

  // Step 1: Initiate OAuth flow
  if (!code) {
    const redirectUri = `${APP_URL}/api/ads/google-sheets/oauth`
    const scopes = [
      'https://www.googleapis.com/auth/spreadsheets.readonly',
      'https://www.googleapis.com/auth/drive.readonly',
    ].join(' ')

    // Generate state token for CSRF protection
    const stateToken = generateStateToken(session.user.id, { provider: 'google_sheets' })

    const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth')
    authUrl.searchParams.set('client_id', GOOGLE_CLIENT_ID)
    authUrl.searchParams.set('redirect_uri', redirectUri)
    authUrl.searchParams.set('scope', scopes)
    authUrl.searchParams.set('state', stateToken)
    authUrl.searchParams.set('response_type', 'code')
    authUrl.searchParams.set('access_type', 'offline')
    authUrl.searchParams.set('prompt', 'consent')

    return NextResponse.redirect(authUrl.toString())
  }

  // Step 2: Exchange code for access token
  if (!state) {
    console.error('Missing state token in Google Sheets OAuth callback')
    return NextResponse.redirect(new URL('/ads?error=invalid_state', APP_URL))
  }

  const stateValidation = validateStateToken(state, session.user.id)
  if (!stateValidation.valid) {
    console.error('Invalid state token:', stateValidation.error)
    return NextResponse.redirect(new URL('/ads?error=invalid_state', APP_URL))
  }

  try {
    const redirectUri = `${APP_URL}/api/ads/google-sheets/oauth`

    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    })

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.text()
      console.error('Token exchange failed:', errorData)
      return NextResponse.redirect(new URL('/ads?error=token_exchange_failed', APP_URL))
    }

    const tokens = await tokenResponse.json()

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
    tokenExpiresAt.setSeconds(tokenExpiresAt.getSeconds() + (tokens.expires_in || 3600))

    // Store the tokens temporarily in session/cache for the next step
    // The spreadsheet ID will be provided by the user in the next step
    // We'll use a special marker to indicate this needs setup
    const tempAccountId = `sheets:pending_${session.user.id}_${Date.now()}`

    await prisma.adAccount.create({
      data: {
        teamId: teamMember.teamId,
        platform: 'GOOGLE',
        platformAccountId: tempAccountId,
        accountName: 'Google Sheets (Väntar på konfiguration)',
        accessTokenEncrypted: encrypt(tokens.access_token),
        refreshTokenEncrypted: tokens.refresh_token ? encrypt(tokens.refresh_token) : null,
        tokenExpiresAt,
        currency: 'SEK',
        isActive: false, // Not active until spreadsheet is configured
      },
    })

    // Redirect to setup page where user will enter their spreadsheet URL
    return NextResponse.redirect(new URL(`/ads/google-sheets-setup?account=${tempAccountId}`, APP_URL))
  } catch (error) {
    console.error('Google Sheets OAuth error:', error)
    return NextResponse.redirect(new URL('/ads?error=google_sheets_failed', APP_URL))
  }
}
