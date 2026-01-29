import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { parseSwedishBankCSV } from '@/services/bank/parser'
import { categorizeTransaction } from '@/services/bank/categorizer'

// POST /api/bank/import - Import bank transactions from CSV
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const formData = await request.formData()
  const file = formData.get('file') as File
  const accountId = formData.get('accountId') as string

  if (!file) {
    return NextResponse.json({ error: 'File is required' }, { status: 400 })
  }

  // Get or create account
  let account
  if (accountId) {
    account = await prisma.bankAccount.findFirst({
      where: {
        id: accountId,
        team: {
          members: {
            some: {
              userId: session.user.id,
            },
          },
        },
      },
    })

    if (!account) {
      return NextResponse.json({ error: 'Account not found or access denied' }, { status: 404 })
    }
  } else {
    // Create a default account
    const teamMember = await prisma.teamMember.findFirst({
      where: { userId: session.user.id },
    })

    if (!teamMember) {
      return NextResponse.json({ error: 'No team found' }, { status: 404 })
    }

    account = await prisma.bankAccount.create({
      data: {
        teamId: teamMember.teamId,
        name: 'Bank Account',
        bankName: 'Unknown',
        currency: 'SEK',
      },
    })
  }

  const csvContent = await file.text()
  const parseResult = parseSwedishBankCSV(csvContent)

  if (parseResult.errors.length > 0 && parseResult.transactions.length === 0) {
    return NextResponse.json(
      { error: 'Failed to parse CSV', details: parseResult.errors },
      { status: 400 }
    )
  }

  const results = {
    imported: 0,
    duplicates: 0,
    errors: parseResult.errors,
  }

  // Get existing categories
  const categories = await prisma.bankTransactionCategory.findMany({
    where: { teamId: account.teamId },
  })

  const categoryMap = new Map<string, string>()
  for (const cat of categories) {
    categoryMap.set(cat.name.toLowerCase(), cat.id)
  }

  for (const txn of parseResult.transactions) {
    // Check for duplicates based on date, amount, and description
    const existing = await prisma.bankTransaction.findFirst({
      where: {
        accountId: account.id,
        transactionDate: txn.date,
        amount: txn.amount,
        description: txn.description,
      },
    })

    if (existing) {
      results.duplicates++
      continue
    }

    // Categorize transaction
    const categorized = categorizeTransaction(txn.description, txn.amount)

    // Find or create category
    let categoryId: string | null = null
    if (categorized.category) {
      const catKey = categorized.category.toLowerCase()
      if (categoryMap.has(catKey)) {
        categoryId = categoryMap.get(catKey)!
      } else {
        const slug = categorized.category.toLowerCase().replace(/[^a-z0-9]+/g, '-')
        const newCat = await prisma.bankTransactionCategory.create({
          data: {
            teamId: account.teamId,
            name: categorized.category,
            slug,
            type: categorized.isExpense ? 'EXPENSE' : 'INCOME',
            color: getRandomColor(),
          },
        })
        categoryMap.set(catKey, newCat.id)
        categoryId = newCat.id
      }
    }

    // Create transaction
    await prisma.bankTransaction.create({
      data: {
        accountId: account.id,
        transactionDate: txn.date,
        description: txn.description,
        amount: txn.amount,
        balance: txn.balance,
        rawText: txn.rawText,
        categoryId,
        normalizedMerchant: categorized.merchant,
        isIncome: !categorized.isExpense,
        isRecurring: categorized.isSubscription,
        isSubscription: categorized.isSubscription,
        hasVat: categorized.hasVat,
        userNotes: categorized.notes,
      },
    })

    results.imported++
  }

  // Update account balance
  if (parseResult.transactions.length > 0) {
    const lastTxn = parseResult.transactions[parseResult.transactions.length - 1]
    await prisma.bankAccount.update({
      where: { id: account.id },
      data: {
        currentBalance: lastTxn.balance,
      },
    })
  }

  return NextResponse.json(results)
}

function getRandomColor(): string {
  const colors = [
    '#3b82f6', '#ef4444', '#22c55e', '#f59e0b', '#8b5cf6',
    '#06b6d4', '#ec4899', '#14b8a6', '#f97316', '#6366f1',
  ]
  return colors[Math.floor(Math.random() * colors.length)]
}
