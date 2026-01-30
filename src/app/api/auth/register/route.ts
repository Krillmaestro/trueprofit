import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'
import {
  registrationRateLimiter,
  getClientIp,
  getRateLimitHeaders,
} from '@/lib/rate-limit'

const registerSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
})

export async function POST(request: NextRequest) {
  // Apply rate limiting
  const clientIp = getClientIp(request)
  const rateLimitResult = registrationRateLimiter(clientIp)

  if (rateLimitResult.limited) {
    return NextResponse.json(
      { error: 'Too many registration attempts. Please try again later.' },
      {
        status: 429,
        headers: getRateLimitHeaders(3, rateLimitResult.remaining, rateLimitResult.resetAt),
      }
    )
  }

  try {
    const body = await request.json()
    const { name, email, password } = registerSchema.parse(body)

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email },
    })

    if (existingUser) {
      return NextResponse.json(
        { error: 'User with this email already exists' },
        { status: 400 }
      )
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 12)

    // Create user with default team
    const slug = email.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '-')

    const user = await prisma.user.create({
      data: {
        name,
        email,
        passwordHash,
        teamMembers: {
          create: {
            role: 'OWNER',
            team: {
              create: {
                name: `${name}'s Team`,
                slug: `${slug}-${Date.now()}`,
                settings: {
                  create: {
                    defaultCurrency: 'SEK',
                    timezone: 'Europe/Stockholm',
                    vatRate: 25,
                  },
                },
              },
            },
          },
        },
      },
      select: {
        id: true,
        name: true,
        email: true,
        createdAt: true,
      },
    })

    return NextResponse.json({ user }, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      const zodError = error as z.ZodError<unknown>
      return NextResponse.json(
        { error: zodError.issues[0]?.message || 'Validation error' },
        { status: 400 }
      )
    }

    console.error('Registration error:', error)
    return NextResponse.json(
      { error: 'Something went wrong' },
      { status: 500 }
    )
  }
}
