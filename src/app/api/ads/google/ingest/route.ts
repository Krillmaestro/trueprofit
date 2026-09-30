import crypto from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { decrypt } from '@/lib/encryption'
import { isScriptAccount } from '@/lib/google-ads-script'

/**
 * Receives Google Ads data pushed by the TrueProfit Google Ads Script.
 *
 * POST /api/ads/google/ingest
 * Authorization: Bearer <adAccountId>.<secret>
 * Body: { customerId, accountName, currency, dateFrom, dateTo, rows[] }
 *
 * The payload is the full truth for dateFrom–dateTo, so existing rows in that
 * window are replaced. Re-sending the same window is idempotent.
 */

const MAX_RANGE_DAYS = 400
const MAX_ROWS = 50000
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

interface IngestRow {
  date: string
  campaignId: string
  campaignName?: string
  cost: number
  impressions?: number
  clicks?: number
  conversions?: number
  conversionValue?: number
}

function toUtcDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0))
}

function num(value: unknown): number {
  const n = typeof value === 'number' ? value : parseFloat(String(value ?? ''))
  return Number.isFinite(n) ? n : 0
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

function unauthorized() {
  return NextResponse.json({ error: 'Ogiltig nyckel' }, { status: 401 })
}

export async function POST(request: NextRequest) {
  const auth = request.headers.get('authorization') || ''
  const key = auth.startsWith('Bearer ') ? auth.slice(7).trim() : ''
  const dot = key.indexOf('.')
  if (dot <= 0) return unauthorized()

  const accountId = key.slice(0, dot)
  const secret = key.slice(dot + 1)

  const account = await prisma.adAccount.findUnique({ where: { id: accountId } })
  if (!account || account.platform !== 'GOOGLE' || !isScriptAccount(account.platformAccountId) || !account.accessTokenEncrypted) {
    return unauthorized()
  }

  const expected = Buffer.from(decrypt(account.accessTokenEncrypted))
  const given = Buffer.from(secret)
  if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) {
    return unauthorized()
  }

  const body = await request.json().catch(() => null)
  if (!body || !Array.isArray(body.rows) || !DATE_RE.test(body.dateFrom) || !DATE_RE.test(body.dateTo)) {
    return NextResponse.json({ error: 'Ogiltigt format: dateFrom, dateTo och rows krävs' }, { status: 400 })
  }

  const from = toUtcDate(body.dateFrom)
  const to = toUtcDate(body.dateTo)
  const rangeDays = (to.getTime() - from.getTime()) / 86400000
  if (rangeDays < 0 || rangeDays > MAX_RANGE_DAYS) {
    return NextResponse.json({ error: `Datumintervallet måste vara 0–${MAX_RANGE_DAYS} dagar` }, { status: 400 })
  }
  if (body.rows.length > MAX_ROWS) {
    return NextResponse.json({ error: `Max ${MAX_ROWS} rader per körning` }, { status: 400 })
  }

  const currency = typeof body.currency === 'string' && /^[A-Z]{3}$/.test(body.currency)
    ? body.currency
    : account.currency

  // Google returns one row per campaign and day; merge defensively in case of duplicates
  const merged = new Map<string, IngestRow>()
  for (const raw of body.rows as IngestRow[]) {
    if (!raw || !DATE_RE.test(raw.date) || !raw.campaignId) continue
    if (raw.date < body.dateFrom || raw.date > body.dateTo) continue
    const k = `${raw.date}|${raw.campaignId}`
    const prev = merged.get(k)
    merged.set(k, {
      date: raw.date,
      campaignId: String(raw.campaignId),
      campaignName: raw.campaignName || prev?.campaignName,
      cost: num(raw.cost) + (prev?.cost ?? 0),
      impressions: num(raw.impressions) + (prev?.impressions ?? 0),
      clicks: num(raw.clicks) + (prev?.clicks ?? 0),
      conversions: num(raw.conversions) + (prev?.conversions ?? 0),
      conversionValue: num(raw.conversionValue) + (prev?.conversionValue ?? 0),
    })
  }

  const data = [...merged.values()].map((row) => {
    const cost = round2(row.cost)
    const impressions = Math.round(row.impressions ?? 0)
    const clicks = Math.round(row.clicks ?? 0)
    const revenue = round2(row.conversionValue ?? 0)
    return {
      adAccountId: account.id,
      date: toUtcDate(row.date),
      spend: cost,
      impressions,
      clicks,
      conversions: Math.round(row.conversions ?? 0),
      revenue,
      roas: cost > 0 ? Math.round((revenue / cost) * 10000) / 10000 : 0,
      cpc: clicks > 0 ? round2(cost / clicks) : 0,
      cpm: impressions > 0 ? round2((cost / impressions) * 1000) : 0,
      currency,
      campaignId: row.campaignId,
      campaignName: row.campaignName || null,
      adSetId: null,
      adSetName: null,
    }
  })

  const customerId = typeof body.customerId === 'string' ? body.customerId : ''
  const googleName = typeof body.accountName === 'string' ? body.accountName.slice(0, 120) : ''
  const accountName = googleName
    ? `${googleName}${customerId ? ` (${customerId})` : ''}`
    : account.accountName

  await prisma.$transaction(async (tx) => {
    await tx.adSpend.deleteMany({
      where: { adAccountId: account.id, date: { gte: from, lte: to } },
    })
    if (data.length > 0) {
      await tx.adSpend.createMany({ data })
    }
    await tx.adAccount.update({
      where: { id: account.id },
      data: {
        accountName,
        currency,
        isActive: true,
        lastSyncAt: new Date(),
        lastSyncStatus: 'SUCCESS',
        syncError: null,
      },
    })
  }, { timeout: 60000 })

  const totalSpend = data.reduce((s, r) => s + r.spend, 0)
  const totalRevenue = data.reduce((s, r) => s + r.revenue, 0)

  return NextResponse.json({
    ok: true,
    rows: data.length,
    dateFrom: body.dateFrom,
    dateTo: body.dateTo,
    spend: round2(totalSpend),
    revenue: round2(totalRevenue),
    currency,
  })
}
