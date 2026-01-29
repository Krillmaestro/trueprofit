/**
 * Swedish Bank CSV Parser
 * Parses CSV files from Swedish banks (semicolon-separated, comma decimals)
 */

export interface ParsedBankTransaction {
  date: Date
  description: string
  amount: number
  balance: number
  rawText: string
}

export interface ParseResult {
  transactions: ParsedBankTransaction[]
  errors: string[]
  totalRows: number
  importedRows: number
  skippedRows: number
}

/**
 * Parse Swedish bank CSV format
 * Expected columns: Datum, Text, Belopp, Saldo (or similar variations)
 */
export function parseSwedishBankCSV(csvContent: string): ParseResult {
  const lines = csvContent.trim().split('\n')
  const transactions: ParsedBankTransaction[] = []
  const errors: string[] = []

  if (lines.length < 2) {
    return {
      transactions: [],
      errors: ['CSV file is empty or has no data rows'],
      totalRows: 0,
      importedRows: 0,
      skippedRows: 0,
    }
  }

  // Parse header row to find column indices
  const headerLine = lines[0]
  const delimiter = headerLine.includes(';') ? ';' : ','
  const headers = headerLine.split(delimiter).map((h) => h.trim().toLowerCase())

  // Find column indices (Swedish bank formats vary)
  const dateIdx = findColumnIndex(headers, ['datum', 'date', 'bokföringsdatum', 'transaktionsdatum'])
  const textIdx = findColumnIndex(headers, ['text', 'beskrivning', 'description', 'meddelande'])
  const amountIdx = findColumnIndex(headers, ['belopp', 'amount', 'summa'])
  const balanceIdx = findColumnIndex(headers, ['saldo', 'balance', 'behållning'])

  if (dateIdx === -1 || textIdx === -1 || amountIdx === -1) {
    return {
      transactions: [],
      errors: ['Could not find required columns (Datum, Text, Belopp)'],
      totalRows: lines.length - 1,
      importedRows: 0,
      skippedRows: lines.length - 1,
    }
  }

  // Parse data rows
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue

    try {
      const values = parseCSVLine(line, delimiter)

      const dateStr = values[dateIdx]?.trim()
      const description = values[textIdx]?.trim() || ''
      const amountStr = values[amountIdx]?.trim() || '0'
      const balanceStr = balanceIdx !== -1 ? values[balanceIdx]?.trim() || '0' : '0'

      // Parse date (Swedish format: YYYY-MM-DD or DD-MM-YYYY)
      const date = parseSwedishDate(dateStr)
      if (!date) {
        errors.push(`Row ${i + 1}: Invalid date format "${dateStr}"`)
        continue
      }

      // Parse amount (Swedish format: uses comma as decimal separator)
      const amount = parseSwedishNumber(amountStr)
      const balance = parseSwedishNumber(balanceStr)

      transactions.push({
        date,
        description,
        amount,
        balance,
        rawText: line,
      })
    } catch (error) {
      errors.push(`Row ${i + 1}: ${error instanceof Error ? error.message : 'Parse error'}`)
    }
  }

  return {
    transactions,
    errors,
    totalRows: lines.length - 1,
    importedRows: transactions.length,
    skippedRows: lines.length - 1 - transactions.length,
  }
}

function findColumnIndex(headers: string[], candidates: string[]): number {
  for (const candidate of candidates) {
    const index = headers.findIndex((h) => h.includes(candidate))
    if (index !== -1) return index
  }
  return -1
}

function parseCSVLine(line: string, delimiter: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const char = line[i]

    if (char === '"') {
      inQuotes = !inQuotes
    } else if (char === delimiter && !inQuotes) {
      result.push(current.trim())
      current = ''
    } else {
      current += char
    }
  }

  result.push(current.trim())
  return result
}

function parseSwedishDate(dateStr: string): Date | null {
  if (!dateStr) return null

  // Try YYYY-MM-DD format
  const isoMatch = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (isoMatch) {
    return new Date(parseInt(isoMatch[1]), parseInt(isoMatch[2]) - 1, parseInt(isoMatch[3]))
  }

  // Try DD-MM-YYYY format
  const euMatch = dateStr.match(/^(\d{2})-(\d{2})-(\d{4})$/)
  if (euMatch) {
    return new Date(parseInt(euMatch[3]), parseInt(euMatch[2]) - 1, parseInt(euMatch[1]))
  }

  // Try DD/MM/YYYY format
  const slashMatch = dateStr.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (slashMatch) {
    return new Date(parseInt(slashMatch[3]), parseInt(slashMatch[2]) - 1, parseInt(slashMatch[1]))
  }

  return null
}

function parseSwedishNumber(numStr: string): number {
  if (!numStr) return 0

  // Remove any thousand separators (space or period in Swedish)
  // Replace comma with period for decimal
  const normalized = numStr
    .replace(/\s/g, '') // Remove spaces
    .replace(/\.(?=\d{3})/g, '') // Remove thousand separators (periods followed by 3 digits)
    .replace(',', '.') // Replace comma decimal separator with period

  const num = parseFloat(normalized)
  return isNaN(num) ? 0 : num
}
