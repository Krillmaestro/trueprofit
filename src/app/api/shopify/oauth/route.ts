import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { ensureUserTeam } from '@/lib/user-team'
import { encrypt } from '@/lib/encryption'
import { generateStateToken, validateStateToken } from '@/lib/oauth-state'
import crypto from 'crypto'
import { normalizeShopDomain, SHOPIFY_API_VERSION } from '@/services/shopify/domain'

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
  const shopDomain = shop ? normalizeShopDomain(shop) : null
  if (!shopDomain) return NextResponse.redirect(new URL('/settings/stores?error=invalid_shop', APP_URL))

  // Check if Shopify is configured
  if (!SHOPIFY_API_KEY || !SHOPIFY_API_SECRET) {
    console.error('Shopify OAuth not configured: missing API credentials')
    return NextResponse.redirect(new URL('/settings/stores?error=shopify_not_configured', APP_URL))
  }

  // Step 1: Initial OAuth request - redirect to Shopify
  if (shop && !code) {
    // Generate and store a secure state token for CSRF protection
    const stateToken = await generateStateToken(session.user.id, { provider: 'shopify', shop: shopDomain })

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

    const stateValidation = await validateStateToken(state, session.user.id, { provider: 'shopify', shop: shopDomain })
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

    if (!/^[a-f0-9]{64}$/i.test(hmac) || !crypto.timingSafeEqual(Buffer.from(generatedHmac, 'hex'), Buffer.from(hmac, 'hex'))) {
      return NextResponse.json({ error: 'Invalid HMAC' }, { status: 401 })
    }

    // Exchange code for access token

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
      const shopResponse = await fetch(`https://${shopDomain}/admin/api/${SHOPIFY_API_VERSION}/shop.json`, {
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

    const teamMember = await ensureUserTeam(session.user.id)

    const existingStore = await prisma.store.findUnique({ where: { shopifyDomain: shopDomain } })
    if (existingStore && existingStore.teamId !== teamMember.teamId) {
      return NextResponse.redirect(new URL('/settings/stores?error=store_already_connected', APP_URL))
    }

    // Save or update store with encrypted access token
    const encryptedToken = encrypt(access_token)

    await prisma.store.upsert({
      where: {
        shopifyDomain: shopDomain,
        teamId: teamMember.teamId,
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
