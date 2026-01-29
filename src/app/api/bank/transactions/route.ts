import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'

// GET /api/bank/transactions - Get bank transactions
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const searchParams = request.nextUrl.searchParams
  const accountId = searchParams.get('accountId')
  const startDate = searchParams.get('startDate')
  const endDate = searchParams.get('endDate')
  const categoryId = searchParams.get('categoryId')
  const limit = parseInt(searchParams.get('limit') || '100')
  const offset = parseInt(searchParams.get('offset') || '0')

  const teamMember = await prisma.teamMember.findFirst({
    where: { userId: session.user.id },
  })

  if (!teamMember) {
    return NextResponse.json({ error: 'No team found' }, { status: 404 })
  }

  const whereClause: Prisma.BankTransactionWhereInput = {
    account: {
      teamId: teamMember.teamId,
    },
  }

  if (accountId) {
    whereClause.accountId = accountId
  }

  if (startDate || endDate) {
    whereClause.transactionDate = {
      ...(startDate && { gte: new Date(startDate) }),
      ...(endDate && { lte: new Date(endDate) }),
    }
  }

  if (categoryId) {
    whereClause.categoryId = categoryId
  }

  const transactions = await prisma.bankTransaction.findMany({
    where: whereClause,
    include: {
      category: true,
      account: {
        select: {
          id: true,
          name: true,
          bankName: true,
        },
      },
    },
    orderBy: {
      transactionDate: 'desc',
    },
    take: limit,
    skip: offset,
  })

  const total = await prisma.bankTransaction.count({ where: whereClause })

  // Calculate summary
  const summary = await prisma.bankTransaction.groupBy({
    by: ['categoryId'],
    where: whereClause,
    _sum: {
      amount: true,
    },
    _count: true,
  })

  const categories = await prisma.bankTransactionCategory.findMany({
    where: { teamId: teamMember.teamId },
  })

  const categoryLookup = new Map<string, (typeof categories)[0]>()
  for (const cat of categories) {
    categoryLookup.set(cat.id, cat)
  }

  const categorySummary = summary.map((s) => ({
    category: s.categoryId ? categoryLookup.get(s.categoryId) : { name: 'Uncategorized', color: '#64748b' },
    total: s._sum.amount || 0,
    count: s._count,
  }))

  const totalIncome = transactions
    .filter((t) => Number(t.amount) > 0)
    .reduce((sum, t) => sum + Number(t.amount), 0)

  const totalExpenses = transactions
    .filter((t) => Number(t.amount) < 0)
    .reduce((sum, t) => sum + Math.abs(Number(t.amount)), 0)

  return NextResponse.json({
    transactions,
    total,
    summary: {
      totalIncome,
      totalExpenses,
      netFlow: totalIncome - totalExpenses,
      byCategory: categorySummary,
    },
  })
}

// PUT /api/bank/transactions - Update transaction category
export async function PUT(request: NextRequest) {
  const session = await getServerSession(authOptions)

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { id, categoryId, notes, merchant } = body

  if (!id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 })
  }

  // Verify access
  const transaction = await prisma.bankTransaction.findFirst({
    where: {
      id,
      account: {
        team: {
          members: {
            some: {
              userId: session.user.id,
            },
          },
        },
      },
    },
  })

  if (!transaction) {
    return NextResponse.json({ error: 'Transaction not found or access denied' }, { status: 404 })
  }

  const updated = await prisma.bankTransaction.update({
    where: { id },
    data: {
      categoryId: categoryId !== undefined ? categoryId : undefined,
      userNotes: notes !== undefined ? notes : undefined,
      normalizedMerchant: merchant !== undefined ? merchant : undefined,
    },
    include: {
      category: true,
    },
  })

  return NextResponse.json(updated)
}
