import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { syncAdAccount, validDateRange } from '@/lib/sync/ad-account'

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await request.json().catch(() => null)
  if (!body || typeof body.adAccountId !== 'string' || !validDateRange(body.dateFrom, body.dateTo)) {
    return NextResponse.json({ error: 'An account and valid date range are required' }, { status: 400 })
  }
  const account = await prisma.adAccount.findFirst({ where: {
    id: body.adAccountId, isActive: true, team: { members: { some: { userId: session.user.id } } },
  } })
  if (!account) return NextResponse.json({ error: 'Ad account not found' }, { status: 404 })
  const result = await syncAdAccount(account, body.dateFrom, body.dateTo)
  return NextResponse.json({ ...result, syncedCount: result.count }, { status: result.success ? 200 : 502 })
}
