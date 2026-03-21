import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'

// One-time endpoint to add a password to an existing Google-auth user.
// Call: POST /api/setup-password
// Body: { "email": "your@email.com", "password": "YourNewPassword", "secret": "trueprofit-setup-2026" }

export async function POST(request: NextRequest) {
  try {
    const { email, password, secret } = await request.json()

    if (secret !== 'trueprofit-setup-2026') {
      return NextResponse.json({ error: 'Invalid secret' }, { status: 403 })
    }

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password required' }, { status: 400 })
    }

    if (password.length < 6) {
      return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 })
    }

    const user = await prisma.user.findUnique({
      where: { email },
      include: { accounts: true, teamMembers: true },
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const passwordHash = await bcrypt.hash(password, 12)

    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash },
    })

    return NextResponse.json({
      success: true,
      message: `Password set for ${email}. You can now log in with email+password.`,
      userId: user.id,
      name: user.name,
      hasGoogleAccount: user.accounts.some(a => a.provider === 'google'),
      teams: user.teamMembers.length,
    })
  } catch (error) {
    console.error('Setup password error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed' },
      { status: 500 }
    )
  }
}
