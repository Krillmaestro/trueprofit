import { NextAuthOptions } from 'next-auth'
import { PrismaAdapter } from '@auth/prisma-adapter'
import GoogleProvider from 'next-auth/providers/google'
import CredentialsProvider from 'next-auth/providers/credentials'
import bcrypt from 'bcryptjs'
import { prisma } from './prisma'

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma) as NextAuthOptions['adapter'],
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID || '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    }),
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error('Email and password are required')
        }

        const user = await prisma.user.findUnique({
          where: { email: credentials.email },
        })

        if (!user || !user.passwordHash) {
          throw new Error('Invalid credentials')
        }

        const isValid = await bcrypt.compare(credentials.password, user.passwordHash)

        if (!isValid) {
          throw new Error('Invalid credentials')
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image,
        }
      },
    }),
  ],
  session: {
    strategy: 'jwt',
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string
      }
      return session
    },
    async signIn({ user, account }) {
      // Auto-create team for new users
      if (account?.provider === 'google' || account?.provider === 'credentials') {
        const existingUser = await prisma.user.findUnique({
          where: { email: user.email! },
          include: { teamMembers: true },
        })

        // If user has no teams, create a default one
        if (existingUser && existingUser.teamMembers.length === 0) {
          const slug = user.email!.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '-')

          await prisma.team.create({
            data: {
              name: `${user.name || user.email}'s Team`,
              slug: `${slug}-${Date.now()}`,
              members: {
                create: {
                  userId: existingUser.id,
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
        }
      }
      return true
    },
  },
  pages: {
    signIn: '/login',
    error: '/login',
  },
}
