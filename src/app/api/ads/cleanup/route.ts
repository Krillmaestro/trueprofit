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
 * Shows current state before cleanup with detailed duplicate analysis
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

    // Count duplicates by account
    const platformCounts = new Map<string, number>()
    for (const account of accounts) {
      const key = `${account.platform}:${account.platformAccountId}`
      platformCounts.set(key, (platformCounts.get(key) || 0) + 1)
    }

    const duplicateAccounts = [...platformCounts.entries()].filter(([, count]) => count > 1)

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

    // Check for duplicate ad spend entries (same date, same account)
    // This happens when NULL campaignId/adSetId creates duplicates
    const spendByDateAccount = await prisma.$queryRaw<Array<{
      ad_account_id: string;
      date: Date;
      campaign_id: string | null;
      adset_id: string | null;
      count: bigint;
      total_spend: number;
    }>>`
      SELECT
        ad_account_id,
        date,
        campaign_id,
        adset_id,
        COUNT(*) as count,
        SUM(spend::numeric) as total_spend
      FROM ad_spends
      WHERE ad_account_id IN (
        SELECT id FROM ad_accounts WHERE team_id = ${teamMember.teamId}
      )
      GROUP BY ad_account_id, date, campaign_id, adset_id
      HAVING COUNT(*) > 1
      ORDER BY count DESC
      LIMIT 20
    `

    // Get spend by date to see if values are reasonable
    const spendByDate = await prisma.adSpend.groupBy({
      by: ['date'],
      where: {
        adAccount: {
          teamId: teamMember.teamId
        }
      },
      _sum: {
        spend: true
      },
      _count: true,
      orderBy: {
        date: 'desc'
      },
      take: 14 // Last 2 weeks
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
      duplicateAccounts: duplicateAccounts.map(([key, count]) => ({ key, count })),
      duplicateSpendEntries: spendByDateAccount.map(d => ({
        adAccountId: d.ad_account_id,
        date: d.date,
        campaignId: d.campaign_id,
        adSetId: d.adset_id,
        count: Number(d.count),
        totalSpend: Number(d.total_spend),
      })),
      spendByDate: spendByDate.map(d => ({
        date: d.date,
        totalSpend: Number(d._sum.spend || 0),
        recordCount: d._count,
      })),
      totalSpendRecords: totalSpend._count,
      totalSpendAmount: totalSpend._sum.spend ? Number(totalSpend._sum.spend) : 0,
      hasDuplicateAccounts: duplicateAccounts.length > 0,
      hasDuplicateSpends: spendByDateAccount.length > 0,
      recommendation: spendByDateAccount.length > 0
        ? 'Du har duplicerade ad spend-poster. Anropa DELETE /api/ads/cleanup för att rensa och synka sedan om.'
        : 'Ingen duplicering hittad.',
    })
  } catch (error) {
    console.error('Status check error:', error)
    return NextResponse.json({
      error: 'Failed to check status',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}
