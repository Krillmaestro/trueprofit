import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getToken } from 'next-auth/jwt'

// Paths that don't require authentication
const publicPaths = ['/login', '/register', '/api/auth', '/api/health']

// Paths that should redirect to dashboard if already logged in
const authPaths = ['/login', '/register']

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Allow health check endpoint
  if (pathname === '/api/health') {
    return NextResponse.next()
  }

  // Allow public API routes
  if (pathname.startsWith('/api/auth')) {
    return NextResponse.next()
  }

  // Allow static files and Next.js internals
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon') ||
    pathname.includes('.')
  ) {
    return NextResponse.next()
  }

  const token = await getToken({ req: request })

  // Redirect root to appropriate page
  if (pathname === '/') {
    if (token) {
      return NextResponse.redirect(new URL('/dashboard', request.url))
    } else {
      return NextResponse.redirect(new URL('/login', request.url))
    }
  }

  // If user is on auth pages and already logged in, redirect to dashboard
  if (authPaths.some(path => pathname.startsWith(path)) && token) {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  // Check if path requires authentication
  const isPublicPath = publicPaths.some(path => pathname.startsWith(path))

  if (!isPublicPath && !token) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('callbackUrl', pathname)
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
