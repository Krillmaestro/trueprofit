import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { decrypt } from '@/lib/encryption'
import { GoogleSheetsAdsClient } from '@/services/ads/google-sheets'

/**
 * Configure Google Sheets integration
 *
 * POST /api/ads/google-sheets/setup
 * Body: { accountId: string, spreadsheetUrl: string }
 */
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { accountId, spreadsheetUrl } = await request.json()

  if (!accountId || !spreadsheetUrl) {
    return NextResponse.json({ error: 'Missing accountId or spreadsheetUrl' }, { status: 400 })
  }

  // Extract spreadsheet ID from URL
  // Format: https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/edit
  const spreadsheetIdMatch = spreadsheetUrl.match(/\/d\/([a-zA-Z0-9-_]+)/)
  if (!spreadsheetIdMatch) {
    return NextResponse.json({ error: 'Ogiltig Google Sheets URL' }, { status: 400 })
  }
  const spreadsheetId = spreadsheetIdMatch[1]

  // Get the pending account
  const account = await prisma.adAccount.findFirst({
    where: {
      platformAccountId: accountId,
      team: {
        members: {
          some: { userId: session.user.id },
        },
      },
    },
  })

  if (!account) {
    return NextResponse.json({ error: 'Kontot hittades inte' }, { status: 404 })
  }

  if (!account.accessTokenEncrypted) {
    return NextResponse.json({ error: 'Ingen access token' }, { status: 400 })
  }

  // Test the connection
  try {
    const accessToken = decrypt(account.accessTokenEncrypted)
    const client = new GoogleSheetsAdsClient({
      accessToken,
      spreadsheetId,
    })

    const testResult = await client.testConnection()

    if (!testResult.success) {
      return NextResponse.json({
        error: 'Kunde inte ansluta till Google Sheet. Kontrollera att det är delat med ditt Google-konto.',
      }, { status: 400 })
    }

    // Check if "Ad Spend" sheet exists
    if (!testResult.sheetNames.includes('Ad Spend')) {
      return NextResponse.json({
        error: 'Hittade inte fliken "Ad Spend" i sheetet. Se till att den finns och har rätt format.',
        sheetNames: testResult.sheetNames,
      }, { status: 400 })
    }

    // Update the account with the real spreadsheet ID
    await prisma.adAccount.update({
      where: { id: account.id },
      data: {
        platformAccountId: `sheets:${spreadsheetId}`,
        accountName: `Google Ads (via Sheets)`,
        isActive: true,
      },
    })

    return NextResponse.json({
      success: true,
      message: 'Google Sheets-integration konfigurerad!',
      spreadsheetId,
    })
  } catch (error) {
    console.error('Google Sheets setup error:', error)
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Konfiguration misslyckades',
    }, { status: 500 })
  }
}
