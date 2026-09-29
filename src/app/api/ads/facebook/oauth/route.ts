import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { ensureUserTeam } from '@/lib/user-team'
import { encrypt } from '@/lib/encryption'
import { generateStateToken, validateStateToken } from '@/lib/oauth-state'
import { FacebookAdsClient, FACEBOOK_API_VERSION } from '@/services/ads/facebook'

const FACEBOOK_APP_ID = process.env.FACEBOOK_APP_ID!
const FACEBOOK_APP_SECRET = process.env.FACEBOOK_APP_SECRET!
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
    console.error('Facebook OAuth error:', error, searchParams.get('error_description'))
    return NextResponse.redirect(new URL('/ads?error=facebook_oauth_denied', APP_URL))
  }

  if (!FACEBOOK_APP_ID || !FACEBOOK_APP_SECRET) {
    return NextResponse.redirect(new URL('/ads?error=facebook_not_configured', APP_URL))
  }

  // Step 1: Initiate OAuth flow
  if (!code) {
    const redirectUri = `${APP_URL}/api/ads/facebook/oauth`
    // Note: read_insights is NOT valid for Facebook Login - it's for Pages
    // Analytics needs read access, never campaign mutation permissions.
    const scopes = [
      'ads_read',           // Read ad performance data
      'business_management', // Access Business Manager accounts
    ].join(',')

    // Generate and store a secure state token for CSRF protection
    const stateToken = await generateStateToken(session.user.id, { provider: 'facebook' })

    // Use latest Graph API version
    const authUrl = new URL(`https://www.facebook.com/${FACEBOOK_API_VERSION}/dialog/oauth`)
    authUrl.searchParams.set('client_id', FACEBOOK_APP_ID)
    authUrl.searchParams.set('redirect_uri', redirectUri)
    authUrl.searchParams.set('scope', scopes)
    authUrl.searchParams.set('state', stateToken)
    authUrl.searchParams.set('response_type', 'code')

    return NextResponse.redirect(authUrl.toString())
  }

  // Step 2: Exchange code for access token
  // Validate state token to prevent CSRF attacks
  if (!state) {
    console.error('Missing state token in Facebook OAuth callback')
    return NextResponse.redirect(new URL('/ads?error=invalid_state', APP_URL))
  }

  const stateValidation = await validateStateToken(state, session.user.id, { provider: 'facebook' })
  if (!stateValidation.valid) {
    console.error('Invalid state token:', stateValidation.error)
    return NextResponse.redirect(new URL('/ads?error=invalid_state', APP_URL))
  }

  try {
    const redirectUri = `${APP_URL}/api/ads/facebook/oauth`

    // Exchange code for short-lived token
    const tokenUrl = new URL(`https://graph.facebook.com/${FACEBOOK_API_VERSION}/oauth/access_token`)
    tokenUrl.searchParams.set('client_id', FACEBOOK_APP_ID)
    tokenUrl.searchParams.set('client_secret', FACEBOOK_APP_SECRET)
    tokenUrl.searchParams.set('redirect_uri', redirectUri)
    tokenUrl.searchParams.set('code', code)

    const tokenResponse = await fetch(tokenUrl.toString())
    if (!tokenResponse.ok) {
      const error = await tokenResponse.json()
      console.error('Failed to get access token:', error)
      return NextResponse.redirect(new URL('/ads?error=token_failed', APP_URL))
    }

    const { access_token } = await tokenResponse.json()

    // Exchange for long-lived token
    const client = new FacebookAdsClient(access_token)
    const longLivedToken = await client.refreshLongLivedToken(FACEBOOK_APP_ID, FACEBOOK_APP_SECRET)

    // Get ad accounts
    const longLivedClient = new FacebookAdsClient(longLivedToken.access_token)
    const adAccounts = await longLivedClient.getAdAccounts()

    if (adAccounts.length === 0) {
      return NextResponse.redirect(new URL('/ads?error=no_ad_accounts', APP_URL))
    }

    const teamMember = await ensureUserTeam(session.user.id)

    // Calculate token expiry (Facebook long-lived tokens last ~60 days)
    // Default to 60 days if expires_in is not provided
    const expiresInSeconds = longLivedToken.expires_in || 60 * 24 * 60 * 60 // 60 days default
    const tokenExpiresAt = new Date(Date.now() + expiresInSeconds * 1000)

    // Save ad accounts
    for (const account of adAccounts) {
      await prisma.adAccount.upsert({
        where: {
          teamId_platform_platformAccountId: {
            teamId: teamMember.teamId,
            platform: 'FACEBOOK',
            platformAccountId: account.account_id,
          },
        },
        create: {
          teamId: teamMember.teamId,
          platform: 'FACEBOOK',
          platformAccountId: account.account_id,
          accountName: account.name,
          accessTokenEncrypted: encrypt(longLivedToken.access_token),
          tokenExpiresAt,
          currency: account.currency,
          isActive: true,
        },
        update: {
          accountName: account.name,
          accessTokenEncrypted: encrypt(longLivedToken.access_token),
          tokenExpiresAt,
          currency: account.currency,
          isActive: true,
        },
      })
    }

    return NextResponse.redirect(new URL('/ads?success=facebook_connected', APP_URL))
  } catch (error) {
    console.error('Facebook OAuth error:', error)
    return NextResponse.redirect(new URL('/ads?error=facebook_failed', APP_URL))
  }
}
