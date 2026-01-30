/**
 * Google Sheets Service for Google Ads Data
 *
 * Reads Google Ads spend data from a Google Sheet populated by a Google Ads Script.
 * This approach doesn't require a Google Ads Developer Token (MCC account).
 */

interface GoogleSheetsConfig {
  accessToken: string
  spreadsheetId: string
}

export interface GoogleAdsSpendFromSheets {
  date: string
  campaignId: string
  campaignName: string
  cost: number
  impressions: number
  clicks: number
  conversions: number
  conversionValue: number
  currency: string
}

export class GoogleSheetsAdsClient {
  private accessToken: string
  private spreadsheetId: string
  private baseUrl = 'https://sheets.googleapis.com/v4/spreadsheets'

  constructor(config: GoogleSheetsConfig) {
    if (!config.accessToken) {
      throw new Error('Access token is required')
    }
    if (!config.spreadsheetId) {
      throw new Error('Spreadsheet ID is required')
    }
    this.accessToken = config.accessToken
    this.spreadsheetId = config.spreadsheetId
  }

  /**
   * Fetch ad spend data from Google Sheets
   * Expected sheet format (columns A-I):
   * Date | Campaign ID | Campaign Name | Spend | Impressions | Clicks | Conversions | Conversion Value | Currency
   */
  async getAdSpendData(
    dateFrom: string,
    dateTo: string,
    sheetName = 'Ad Spend'
  ): Promise<GoogleAdsSpendFromSheets[]> {
    const range = `${sheetName}!A:I`
    const url = `${this.baseUrl}/${this.spreadsheetId}/values/${encodeURIComponent(range)}`

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
      },
    })

    if (!response.ok) {
      const errorText = await response.text()

      // Provide user-friendly error messages
      if (response.status === 404) {
        throw new Error(`Kunde inte hitta Google Sheet. Kontrollera att URL:en är korrekt.`)
      }
      if (response.status === 403) {
        throw new Error(`Ingen åtkomst till Google Sheet. Kontrollera att du har delat sheetet korrekt.`)
      }
      if (response.status === 401) {
        throw new Error(`Din Google-inloggning har gått ut. Koppla om Google Sheets.`)
      }

      throw new Error(`Kunde inte hämta data från Google Sheets: ${errorText}`)
    }

    const data = await response.json()
    const rows: unknown[][] = data.values || []

    if (rows.length < 2) {
      // No data or only header row - this is not an error, just empty
      return []
    }

    // Normalize date strings to YYYY-MM-DD format for comparison
    // This avoids timezone issues when comparing dates
    const normalizedFromDate = this.normalizeDateString(dateFrom)
    const normalizedToDate = this.normalizeDateString(dateTo)

    if (!normalizedFromDate || !normalizedToDate) {
      throw new Error('Invalid date format. Expected YYYY-MM-DD.')
    }

    console.log(`[GoogleSheets] Filtering data from ${normalizedFromDate} to ${normalizedToDate}`)

    // Skip header row and parse data
    const results: GoogleAdsSpendFromSheets[] = []

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i]

      // Skip incomplete rows
      if (!row || row.length < 4) continue

      // Parse and validate date - normalize to YYYY-MM-DD string
      const rowDateStr = String(row[0] || '')
      const normalizedRowDate = this.normalizeDateString(rowDateStr)

      if (!normalizedRowDate) continue // Skip rows with invalid dates

      // Filter by date range using string comparison (YYYY-MM-DD format sorts correctly)
      if (normalizedRowDate < normalizedFromDate || normalizedRowDate > normalizedToDate) continue

      // Parse numeric values safely
      const cost = this.parseNumber(row[3])
      const impressions = Math.round(this.parseNumber(row[4]))
      const clicks = Math.round(this.parseNumber(row[5]))
      const conversions = this.parseNumber(row[6])
      const conversionValue = this.parseNumber(row[7])

      results.push({
        date: rowDateStr,
        campaignId: String(row[1] || ''),
        campaignName: String(row[2] || 'Unknown Campaign'),
        cost,
        impressions,
        clicks,
        conversions,
        conversionValue,
        currency: String(row[8] || 'SEK'),
      })
    }

    return results
  }

  /**
   * Get aggregated spend for a date range
   */
  async getAggregatedSpend(
    dateFrom: string,
    dateTo: string,
    sheetName = 'Ad Spend'
  ): Promise<{
    totalSpend: number
    totalImpressions: number
    totalClicks: number
    totalConversions: number
    totalConversionValue: number
    roas: number
    byCampaign: Map<string, { name: string; spend: number; impressions: number; clicks: number; conversions: number }>
  }> {
    const data = await this.getAdSpendData(dateFrom, dateTo, sheetName)

    let totalSpend = 0
    let totalImpressions = 0
    let totalClicks = 0
    let totalConversions = 0
    let totalConversionValue = 0
    const byCampaign = new Map<string, { name: string; spend: number; impressions: number; clicks: number; conversions: number }>()

    for (const row of data) {
      totalSpend += row.cost
      totalImpressions += row.impressions
      totalClicks += row.clicks
      totalConversions += row.conversions
      totalConversionValue += row.conversionValue

      const existing = byCampaign.get(row.campaignId) || {
        name: row.campaignName,
        spend: 0,
        impressions: 0,
        clicks: 0,
        conversions: 0,
      }
      byCampaign.set(row.campaignId, {
        name: row.campaignName,
        spend: existing.spend + row.cost,
        impressions: existing.impressions + row.impressions,
        clicks: existing.clicks + row.clicks,
        conversions: existing.conversions + row.conversions,
      })
    }

    return {
      totalSpend,
      totalImpressions,
      totalClicks,
      totalConversions,
      totalConversionValue,
      roas: totalSpend > 0 ? totalConversionValue / totalSpend : 0,
      byCampaign,
    }
  }

  /**
   * Test connection to the spreadsheet and validate structure
   */
  async testConnection(): Promise<{
    success: boolean
    sheetNames: string[]
    error?: string
  }> {
    try {
      const url = `${this.baseUrl}/${this.spreadsheetId}`

      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
        },
      })

      if (!response.ok) {
        if (response.status === 404) {
          return { success: false, sheetNames: [], error: 'Spreadsheet hittades inte' }
        }
        if (response.status === 403) {
          return { success: false, sheetNames: [], error: 'Ingen åtkomst till spreadsheet' }
        }
        return { success: false, sheetNames: [], error: `HTTP ${response.status}` }
      }

      const data = await response.json()
      const sheetNames = (data.sheets || [])
        .map((s: { properties?: { title?: string } }) => s.properties?.title || '')
        .filter(Boolean)

      return { success: true, sheetNames }
    } catch (error) {
      return {
        success: false,
        sheetNames: [],
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  }

  /**
   * Normalize a date string to YYYY-MM-DD format for safe comparison
   * This avoids timezone issues by working with strings only
   */
  private normalizeDateString(dateStr: string): string | null {
    if (!dateStr) return null

    const cleanStr = String(dateStr).trim()

    // If already in YYYY-MM-DD format
    const isoMatch = cleanStr.match(/^(\d{4})-(\d{2})-(\d{2})/)
    if (isoMatch) {
      const [, year, month, day] = isoMatch
      return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
    }

    // Handle ISO datetime format (2026-01-15T00:00:00.000Z)
    const isoDateTimeMatch = cleanStr.match(/^(\d{4})-(\d{2})-(\d{2})T/)
    if (isoDateTimeMatch) {
      const [, year, month, day] = isoDateTimeMatch
      return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
    }

    // Handle DD/MM/YYYY format (common in Google Sheets)
    const ddmmyyyyMatch = cleanStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/)
    if (ddmmyyyyMatch) {
      const [, day, month, year] = ddmmyyyyMatch
      return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
    }

    // Handle MM/DD/YYYY format (US format)
    const mmddyyyyMatch = cleanStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/)
    if (mmddyyyyMatch) {
      // Ambiguous - assume DD/MM/YYYY for European users
      const [, day, month, year] = mmddyyyyMatch
      return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
    }

    // Try parsing as Date and extracting date parts (fallback)
    const date = new Date(cleanStr)
    if (!isNaN(date.getTime())) {
      const year = date.getFullYear()
      const month = String(date.getMonth() + 1).padStart(2, '0')
      const day = String(date.getDate()).padStart(2, '0')
      return `${year}-${month}-${day}`
    }

    return null
  }

  /**
   * Parse a date string in YYYY-MM-DD format to Date object
   * Note: Use normalizeDateString for comparisons to avoid timezone issues
   */
  private parseDate(dateStr: string): Date | null {
    const normalized = this.normalizeDateString(dateStr)
    if (!normalized) return null

    const [year, month, day] = normalized.split('-').map(Number)
    // Use UTC to avoid timezone issues
    return new Date(Date.UTC(year, month - 1, day))
  }

  /**
   * Parse a number safely, handling various formats
   */
  private parseNumber(value: unknown): number {
    if (value === null || value === undefined || value === '') {
      return 0
    }

    if (typeof value === 'number') {
      return isNaN(value) ? 0 : value
    }

    // Handle string numbers (including Swedish format with comma as decimal separator)
    const strValue = String(value).replace(/\s/g, '').replace(',', '.')
    const num = parseFloat(strValue)

    return isNaN(num) ? 0 : num
  }
}

/**
 * Refresh Google OAuth access token
 */
export async function refreshGoogleSheetsToken(
  refreshToken: string,
  clientId: string,
  clientSecret: string
): Promise<{ access_token: string; expires_in: number }> {
  if (!refreshToken || !clientId || !clientSecret) {
    throw new Error('Missing required credentials for token refresh')
  }

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()

    if (response.status === 400) {
      throw new Error('Refresh token har gått ut. Du behöver koppla om Google Sheets.')
    }

    throw new Error(`Kunde inte förnya access token: ${errorText}`)
  }

  const data = await response.json()

  if (!data.access_token) {
    throw new Error('No access token in response')
  }

  return {
    access_token: data.access_token,
    expires_in: data.expires_in || 3600,
  }
}
