import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// GET /api/expenses - Get all custom costs/expenses
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const searchParams = request.nextUrl.searchParams
  const type = searchParams.get('type') // FIXED, VARIABLE, SALARY
  const startDate = searchParams.get('startDate')
  const endDate = searchParams.get('endDate')

  const teamMember = await prisma.teamMember.findFirst({
    where: { userId: session.user.id },
  })

  if (!teamMember) {
    return NextResponse.json({ error: 'No team found' }, { status: 404 })
  }

  const whereClause: any = {
    teamId: teamMember.teamId,
  }

  if (type) {
    whereClause.costType = type
  }

  const expenses = await prisma.customCost.findMany({
    where: whereClause,
    include: {
      category: true,
      entries: startDate || endDate
        ? {
            where: {
              date: {
                gte: startDate ? new Date(startDate) : undefined,
                lte: endDate ? new Date(endDate) : undefined,
              },
            },
            orderBy: {
              date: 'desc',
            },
          }
        : {
            orderBy: {
              date: 'desc',
            },
            take: 12, // Last 12 entries
          },
    },
    orderBy: {
      name: 'asc',
    },
  })

  // Calculate totals
  const totals = expenses.reduce(
    (acc, exp) => {
      const total = exp.entries.reduce((sum, e) => sum + Number(e.amount), 0)
      acc[exp.costType] = (acc[exp.costType] || 0) + total
      acc.total += total
      return acc
    },
    { FIXED: 0, VARIABLE: 0, SALARY: 0, ONE_TIME: 0, total: 0 } as Record<string, number>
  )

  return NextResponse.json({ expenses, totals })
}

// POST /api/expenses - Create a new expense
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const {
    name,
    type,
    categoryId,
    amount,
    isRecurring,
    recurrenceType,
    recurrenceDay,
    startDate,
    endDate,
    notes,
  } = body

  if (!name || !type || amount === undefined) {
    return NextResponse.json(
      { error: 'name, type, and amount are required' },
      { status: 400 }
    )
  }

  const teamMember = await prisma.teamMember.findFirst({
    where: { userId: session.user.id },
  })

  if (!teamMember) {
    return NextResponse.json({ error: 'No team found' }, { status: 404 })
  }

  const expense = await prisma.customCost.create({
    data: {
      teamId: teamMember.teamId,
      name,
      costType: type,
      categoryId: categoryId || null,
      amount: parseFloat(amount),
      recurrenceType: recurrenceType || null,
      recurrenceStart: startDate ? new Date(startDate) : null,
      recurrenceEnd: endDate ? new Date(endDate) : null,
      description: notes || null,
      isActive: true,
    },
    include: {
      category: true,
    },
  })

  // If not recurring, create an entry for the current month
  if (!isRecurring) {
    await prisma.customCostEntry.create({
      data: {
        costId: expense.id,
        date: new Date(),
        amount: parseFloat(amount),
      },
    })
  }

  return NextResponse.json(expense)
}

// PUT /api/expenses - Update an expense
export async function PUT(request: NextRequest) {
  const session = await getServerSession(authOptions)

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { id, ...updateData } = body

  if (!id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 })
  }

  // Verify access
  const expense = await prisma.customCost.findFirst({
    where: {
      id,
      team: {
        members: {
          some: {
            userId: session.user.id,
          },
        },
      },
    },
  })

  if (!expense) {
    return NextResponse.json({ error: 'Expense not found or access denied' }, { status: 404 })
  }

  const updated = await prisma.customCost.update({
    where: { id },
    data: {
      name: updateData.name,
      costType: updateData.type,
      categoryId: updateData.categoryId,
      amount: updateData.amount ? parseFloat(updateData.amount) : undefined,
      recurrenceType: updateData.recurrenceType,
      recurrenceStart: updateData.startDate ? new Date(updateData.startDate) : undefined,
      recurrenceEnd: updateData.endDate ? new Date(updateData.endDate) : undefined,
      description: updateData.notes,
      isActive: updateData.isActive,
    },
    include: {
      category: true,
    },
  })

  return NextResponse.json(updated)
}

// DELETE /api/expenses - Delete an expense
export async function DELETE(request: NextRequest) {
  const session = await getServerSession(authOptions)

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const searchParams = request.nextUrl.searchParams
  const id = searchParams.get('id')

  if (!id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 })
  }

  // Verify access
  const expense = await prisma.customCost.findFirst({
    where: {
      id,
      team: {
        members: {
          some: {
            userId: session.user.id,
          },
        },
      },
    },
  })

  if (!expense) {
    return NextResponse.json({ error: 'Expense not found or access denied' }, { status: 404 })
  }

  // Delete entries first, then the expense
  await prisma.customCostEntry.deleteMany({
    where: { costId: id },
  })

  await prisma.customCost.delete({
    where: { id },
  })

  return NextResponse.json({ success: true })
}
