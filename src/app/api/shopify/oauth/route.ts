import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import crypto from 'crypto'

const SHOPIFY_API_KEY = process.env.SHOPIFY_API_KEY!
const SHOPIFY_API_SECRET = process.env.SHOPIFY_API_SECRET!
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

  // Step 1: Initial OAuth request - redirect to Shopify
  if (shop && !code) {
    const nonce = crypto.randomBytes(16).toString('hex')

    // Store nonce in session/database for verification
    // In production, you'd want to store this securely

    const redirectUri = `${APP_URL}/api/shopify/oauth`
    const authUrl = `https://${shop}.myshopify.com/admin/oauth/authorize?` +
      `client_id=${SHOPIFY_API_KEY}&` +
      `scope=${SCOPES}&` +
      `redirect_uri=${encodeURIComponent(redirectUri)}&` +
      `state=${nonce}`

    return NextResponse.redirect(authUrl)
  }

  // Step 2: Callback from Shopify with authorization code
  if (code && shop && hmac) {
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
    const tokenResponse = await fetch(`https://${shop}.myshopify.com/admin/oauth/access_token`, {
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
      console.error('Failed to get access token:', await tokenResponse.text())
      return NextResponse.redirect(new URL('/settings/stores?error=token_failed', APP_URL))
    }

    const { access_token, scope } = await tokenResponse.json()

    // Get shop info
    const shopResponse = await fetch(`https://${shop}.myshopify.com/admin/api/2024-01/shop.json`, {
      headers: {
        'X-Shopify-Access-Token': access_token,
      },
    })

    if (!shopResponse.ok) {
      return NextResponse.redirect(new URL('/settings/stores?error=shop_info_failed', APP_URL))
    }

    const { shop: shopInfo } = await shopResponse.json()

    // Get user's team
    const teamMember = await prisma.teamMember.findFirst({
      where: { userId: session.user.id },
      include: { team: true },
    })

    if (!teamMember) {
      return NextResponse.redirect(new URL('/settings/stores?error=no_team', APP_URL))
    }

    // Save or update store
    await prisma.store.upsert({
      where: {
        shopifyDomain: shop,
      },
      create: {
        teamId: teamMember.teamId,
        shopifyDomain: shop,
        shopifyAccessToken: access_token,
        shopifyScopes: scope.split(','),
        name: shopInfo.name,
        currency: shopInfo.currency,
        timezone: shopInfo.iana_timezone,
        isActive: true,
      },
      update: {
        shopifyAccessToken: access_token,
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
