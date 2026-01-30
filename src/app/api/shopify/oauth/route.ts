import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { encrypt } from '@/lib/encryption'
import { oauthRateLimiter, getRateLimitKey } from '@/lib/rate-limit'
import { generateStateToken, validateStateToken } from '@/lib/oauth-state'
import crypto from 'crypto'

const SHOPIFY_API_KEY = process.env.SHOPIFY_API_KEY || ''
const SHOPIFY_API_SECRET = process.env.SHOPIFY_API_SECRET || ''
const APP_URL = process.env.NEXTAUTH_URL || 'http://localhost:3000'

const SCOPES = [
  'read_products',
  'read_orders',
  'read_customers',
  'read_inventory',
  'read_fulfillments',
  'read_shipping',
].join(',')

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)

  if (!session?.user?.id) {
    return NextResponse.redirect(new URL('/login', APP_URL))
  }

  const searchParams = request.nextUrl.searchParams
  const shop = searchParams.get('shop')
  const code = searchParams.get('code')
  const state = searchParams.get('state')
  const hmac = searchParams.get('hmac')

  // Only apply rate limiting for OAuth initiations (not callbacks)
  const isCallback = code && hmac
  if (!isCallback) {
    const rateLimitKey = getRateLimitKey(request, session.user.id)
    const rateLimitResult = oauthRateLimiter(rateLimitKey)

    if (rateLimitResult.limited) {
      return NextResponse.redirect(new URL('/settings/stores?error=rate_limited', APP_URL))
    }
  }

  // Check if Shopify is configured
  if (!SHOPIFY_API_KEY || !SHOPIFY_API_SECRET) {
    console.error('Shopify OAuth not configured: missing API credentials')
    return NextResponse.redirect(new URL('/settings/stores?error=shopify_not_configured', APP_URL))
  }

  // Step 1: Initial OAuth request - redirect to Shopify
  if (shop && !code) {
    // Generate and store a secure state token for CSRF protection
    const stateToken = generateStateToken(session.user.id, { shop })

    // Normalize shop domain - ensure it ends with .myshopify.com
    const shopDomain = shop.includes('.myshopify.com') ? shop : `${shop}.myshopify.com`

    const redirectUri = `${APP_URL}/api/shopify/oauth`
    const authUrl = `https://${shopDomain}/admin/oauth/authorize?` +
      `client_id=${SHOPIFY_API_KEY}&` +
      `scope=${SCOPES}&` +
      `redirect_uri=${encodeURIComponent(redirectUri)}&` +
      `state=${stateToken}`

    return NextResponse.redirect(authUrl)
  }

  // Step 2: Callback from Shopify with authorization code
  if (code && shop && hmac) {
    // Validate state token to prevent CSRF attacks
    if (!state) {
      console.error('Missing state token in OAuth callback')
      return NextResponse.redirect(new URL('/settings/stores?error=invalid_state', APP_URL))
    }

    const stateValidation = validateStateToken(state, session.user.id)
    if (!stateValidation.valid) {
      console.error('Invalid state token:', stateValidation.error)
      return NextResponse.redirect(new URL('/settings/stores?error=invalid_state', APP_URL))
    }

    // Verify HMAC
    const params = new URLSearchParams(searchParams)
    params.delete('hmac')
    params.sort()

    const message = params.toString()
    const generatedHmac = crypto
      .createHmac('sha256', SHOPIFY_API_SECRET)
      .update(message)
      .digest('hex')

    if (generatedHmac !== hmac) {
      return NextResponse.json({ error: 'Invalid HMAC' }, { status: 401 })
    }

    // Exchange code for access token
    const shopDomain = shop.includes('.myshopify.com') ? shop : `${shop}.myshopify.com`

    let tokenResponse
    let access_token: string
    let scope: string

    try {
      tokenResponse = await fetch(`https://${shopDomain}/admin/oauth/access_token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          client_id: SHOPIFY_API_KEY,
          client_secret: SHOPIFY_API_SECRET,
          code,
        }),
      })

      if (!tokenResponse.ok) {
        const errorText = await tokenResponse.text()
        console.error('Failed to get access token:', errorText)
        return NextResponse.redirect(new URL('/settings/stores?error=token_failed', APP_URL))
      }

      const tokenData = await tokenResponse.json()
      access_token = tokenData.access_token
      scope = tokenData.scope
    } catch (fetchError) {
      console.error('Fetch error during token exchange:', fetchError)
      return NextResponse.redirect(new URL('/settings/stores?error=connection_failed', APP_URL))
    }

    // Get shop info
    let shopInfo
    try {
      const shopResponse = await fetch(`https://${shopDomain}/admin/api/2024-10/shop.json`, {
        headers: {
          'X-Shopify-Access-Token': access_token,
        },
      })

      if (!shopResponse.ok) {
        console.error('Failed to get shop info:', await shopResponse.text())
        return NextResponse.redirect(new URL('/settings/stores?error=shop_info_failed', APP_URL))
      }

      const shopData = await shopResponse.json()
      shopInfo = shopData.shop
    } catch (fetchError) {
      console.error('Fetch error during shop info:', fetchError)
      return NextResponse.redirect(new URL('/settings/stores?error=connection_failed', APP_URL))
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
        },
      })

      teamMember = await prisma.teamMember.findFirst({
        where: { userId: session.user.id, teamId: team.id },
        include: { team: true },
      })

      if (!teamMember) {
        console.error('Failed to create team for user')
        return NextResponse.redirect(new URL('/settings/stores?error=team_creation_failed', APP_URL))
      }
    }

    // Save or update store with encrypted access token
    const encryptedToken = encrypt(access_token)

    await prisma.store.upsert({
      where: {
        shopifyDomain: shopDomain,
      },
      create: {
        teamId: teamMember.teamId,
        shopifyDomain: shopDomain,
        shopifyAccessTokenEncrypted: encryptedToken,
        shopifyScopes: scope.split(','),
        name: shopInfo.name,
        currency: shopInfo.currency,
        timezone: shopInfo.iana_timezone,
        isActive: true,
      },
      update: {
        shopifyAccessTokenEncrypted: encryptedToken,
        shopifyScopes: scope.split(','),
        name: shopInfo.name,
        currency: shopInfo.currency,
        timezone: shopInfo.iana_timezone,
        isActive: true,
      },
    })

    // Redirect to success
    return NextResponse.redirect(new URL('/settings/stores?success=connected', APP_URL))
  }

  return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
}
