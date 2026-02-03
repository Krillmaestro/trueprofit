import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

/**
 * DELETE /api/ads/cleanup
 * Removes duplicate ad accounts and clears all ad spend data
 * Use this to fix duplicated ad spend issues
 */
export async function DELETE() {
  const session = await getServerSession(authOptions)

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const teamMember = await prisma.teamMember.findFirst({
      where: { userId: session.user.id },
    })

    if (!teamMember) {
      return NextResponse.json({ error: 'No team found' }, { status: 404 })
    }

    // Get all ad accounts for this team
    const allAccounts = await prisma.adAccount.findMany({
      where: { teamId: teamMember.teamId },
      include: {
        _count: {
          select: { spends: true }
        }
      },
      orderBy: { createdAt: 'asc' },
    })

    // Group by platform + platformAccountId to find duplicates
    const accountMap = new Map<string, typeof allAccounts>()
    for (const account of allAccounts) {
      const key = `${account.platform}:${account.platformAccountId}`
      const existing = accountMap.get(key) || []
      existing.push(account)
      accountMap.set(key, existing)
    }

    let deletedAccounts = 0
    let deletedSpends = 0
    const keptAccounts: string[] = []

    for (const [key, accounts] of accountMap) {
      if (accounts.length > 1) {
        // Keep the first one (oldest), delete the rest
        const [keep, ...duplicates] = accounts
        keptAccounts.push(`${keep.platform}: ${keep.accountName || keep.platformAccountId}`)

        for (const dup of duplicates) {
          // Delete ad spends first
          const deleted = await prisma.adSpend.deleteMany({
            where: { adAccountId: dup.id }
          })
          deletedSpends += deleted.count

          // Delete the duplicate account
          await prisma.adAccount.delete({
            where: { id: dup.id }
          })
          deletedAccounts++
        }
      } else {
        keptAccounts.push(`${accounts[0].platform}: ${accounts[0].accountName || accounts[0].platformAccountId}`)
      }
    }

    // Now clear ALL ad spend data to start fresh
    const clearedSpends = await prisma.adSpend.deleteMany({
      where: {
        adAccount: {
          teamId: teamMember.teamId
        }
      }
    })

    return NextResponse.json({
      success: true,
      deletedDuplicateAccounts: deletedAccounts,
      deletedDuplicateSpends: deletedSpends,
      clearedAllSpends: clearedSpends.count,
      remainingAccounts: keptAccounts,
      message: `Rensade ${deletedAccounts} duplicerade konton och ${clearedSpends.count} ad spend-poster. Synka om för att hämta korrekt data.`
    })
  } catch (error) {
    console.error('Cleanup error:', error)
    return NextResponse.json({
      error: 'Cleanup failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

/**
 * GET /api/ads/cleanup
 * Shows current state before cleanup
 */
export async function GET() {
  const session = await getServerSession(authOptions)

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const teamMember = await prisma.teamMember.findFirst({
      where: { userId: session.user.id },
    })

    if (!teamMember) {
      return NextResponse.json({ error: 'No team found' }, { status: 404 })
    }

    // Get all ad accounts with spend counts
    const accounts = await prisma.adAccount.findMany({
      where: { teamId: teamMember.teamId },
      include: {
        _count: {
          select: { spends: true }
        }
      },
      orderBy: { createdAt: 'asc' },
    })

    // Count duplicates
    const platformCounts = new Map<string, number>()
    for (const account of accounts) {
      const key = `${account.platform}:${account.platformAccountId}`
      platformCounts.set(key, (platformCounts.get(key) || 0) + 1)
    }

    const duplicates = [...platformCounts.entries()].filter(([, count]) => count > 1)

    // Get total ad spend
    const totalSpend = await prisma.adSpend.aggregate({
      where: {
        adAccount: {
          teamId: teamMember.teamId
        }
      },
      _sum: {
        spend: true
      },
      _count: true
    })

    return NextResponse.json({
      accounts: accounts.map(a => ({
        id: a.id,
        platform: a.platform,
        accountName: a.accountName,
        platformAccountId: a.platformAccountId,
        spendCount: a._count.spends,
        lastSyncAt: a.lastSyncAt,
        createdAt: a.createdAt,
      })),
      duplicates: duplicates.map(([key, count]) => ({ key, count })),
      totalSpendRecords: totalSpend._count,
      totalSpendAmount: totalSpend._sum.spend ? Number(totalSpend._sum.spend) : 0,
      hasDuplicates: duplicates.length > 0,
    })
  } catch (error) {
    console.error('Status check error:', error)
    return NextResponse.json({
      error: 'Failed to check status',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}
