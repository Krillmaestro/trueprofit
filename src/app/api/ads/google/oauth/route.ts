import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { encrypt } from '@/lib/encryption'
import { generateStateToken, validateStateToken } from '@/lib/oauth-state'
import { GoogleAdsClient, exchangeGoogleAuthCode } from '@/services/ads/google'

// Use Google Ads specific credentials if available, otherwise fall back to regular Google OAuth
const GOOGLE_ADS_CLIENT_ID = process.env.GOOGLE_ADS_CLIENT_ID || process.env.GOOGLE_CLIENT_ID || ''
const GOOGLE_ADS_CLIENT_SECRET = process.env.GOOGLE_ADS_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET || ''
const GOOGLE_ADS_DEVELOPER_TOKEN = process.env.GOOGLE_ADS_DEVELOPER_TOKEN || ''
const APP_URL = process.env.NEXTAUTH_URL || 'http://localhost:3000'

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)

  if (!session?.user?.id) {
    return NextResponse.redirect(new URL('/login', APP_URL))
  }

  const searchParams = request.nextUrl.searchParams
  const code = searchParams.get('code')
  const state = searchParams.get('state')
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

    // Generate and store a secure state token for CSRF protection
    const stateToken = generateStateToken(session.user.id, { provider: 'google' })

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
  // Validate state token to prevent CSRF attacks
  if (!state) {
    console.error('Missing state token in Google OAuth callback')
    return NextResponse.redirect(new URL('/ads?error=invalid_state', APP_URL))
  }

  const stateValidation = validateStateToken(state, session.user.id)
  if (!stateValidation.valid) {
    console.error('Invalid state token:', stateValidation.error)
    return NextResponse.redirect(new URL('/ads?error=invalid_state', APP_URL))
  }

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

    // Get user's team, or create one if it doesn't exist
    let teamMember = await prisma.teamMember.findFirst({
      where: { userId: session.user.id },
      include: { team: true },
    })

    if (!teamMember) {
      // Auto-create a team for the user
      const user = await prisma.user.findUnique({
        where: { id: session.user.id },
      })

      const teamSlug = `team-${session.user.id.slice(0, 8)}-${Date.now()}`
      const team = await prisma.team.create({
        data: {
          name: user?.name ? `${user.name}'s Team` : 'My Team',
          slug: teamSlug,
          members: {
            create: {
              userId: session.user.id,
              role: 'OWNER',
            },
          },
          settings: {
            create: {
              defaultCurrency: 'SEK',
              timezone: 'Europe/Stockholm',
              vatRate: 25,
            },
          },
        },
      })

      teamMember = await prisma.teamMember.findFirst({
        where: { userId: session.user.id, teamId: team.id },
        include: { team: true },
      })

      if (!teamMember) {
        console.error('Failed to create team for user')
        return NextResponse.redirect(new URL('/ads?error=team_creation_failed', APP_URL))
      }
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
