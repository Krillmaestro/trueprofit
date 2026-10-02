'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { useToast } from '@/components/ui/toast'
import { AlertCircle, AlertTriangle, Download, Loader2, Settings2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { PnLColumn, PnLReport } from '@/lib/pnl/engine'
import type { PnLSettings } from '@/lib/pnl/settings'

// ===========================================
// FORMATTING
// ===========================================

const kr = (v: number) =>
  new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(Math.round(v)) + ' kr'
const num = (v: number, d = 0) =>
  new Intl.NumberFormat('sv-SE', { minimumFractionDigits: d, maximumFractionDigits: d }).format(v)
const pct = (v: number) => `${num(v, 1)} %`

// ===========================================
// PERIODS (Stockholm calendar days)
// ===========================================

function todayStr() {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm' }).format(new Date())
}
function monthStart(date: string, monthsBack: number) {
  const [y, m] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1 - monthsBack, 1)).toISOString().slice(0, 10)
}
function monthEnd(date: string, monthsBack: number) {
  const [y, m] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - monthsBack, 0)).toISOString().slice(0, 10)
}

const PRESETS: Array<{ key: string; label: string; range: () => [string, string] }> = [
  { key: 'mtd', label: 'Denna månad', range: () => [monthStart(todayStr(), 0), todayStr()] },
  { key: 'last', label: 'Förra månaden', range: () => [monthStart(todayStr(), 1), monthEnd(todayStr(), 1)] },
  { key: '3m', label: '3 mån', range: () => [monthStart(todayStr(), 2), todayStr()] },
  { key: '6m', label: '6 mån', range: () => [monthStart(todayStr(), 5), todayStr()] },
  { key: '12m', label: '12 mån', range: () => [monthStart(todayStr(), 11), todayStr()] },
  { key: 'ytd', label: 'I år', range: () => [`${todayStr().slice(0, 4)}-01-01`, todayStr()] },
]

// ===========================================
// ROW MODEL
// ===========================================

type RowKind = 'line' | 'sub' | 'subtotal' | 'result' | 'section' | 'memo'
interface Row {
  key: string
  label: string
  kind: RowKind
  value?: (c: PnLColumn) => number | null
  help?: string
}

function buildRows(report: PnLReport): Row[] {
  const platforms = new Set<string>()
  const opexNames = new Set<string>()
  for (const c of [...report.columns, report.total]) {
    Object.keys(c.marketing.byPlatform).forEach((p) => platforms.add(p))
    Object.keys(c.opex.byName).forEach((p) => opexNames.add(p))
  }

  return [
    { key: 's-rev', label: 'Intäkter', kind: 'section' },
    { key: 'gross', label: 'Bruttoförsäljning (inkl. moms)', kind: 'sub', value: (c) => c.revenue.grossSales, help: 'Σ pris × antal före rabatt' },
    { key: 'disc', label: 'Rabatter', kind: 'sub', value: (c) => c.revenue.discounts },
    { key: 'ship', label: 'Fraktintäkter', kind: 'sub', value: (c) => c.revenue.shippingRevenue },
    { key: 'oms', label: 'Omsättning inkl. moms', kind: 'line', value: (c) => c.revenue.omsattningInklMoms, help: '= Shopify total_price. Ska stämma mot Shopify Analytics.' },
    { key: 'vat', label: 'Moms', kind: 'line', value: (c) => c.revenue.vat },
    { key: 'ref', label: 'Returer (ex moms)', kind: 'line', value: (c) => c.revenue.refunds, help: 'Bokförs den dag återbetalningen gjordes.' },
    { key: 'net', label: 'Nettoomsättning', kind: 'subtotal', value: (c) => c.revenue.netRevenue },

    { key: 's-cogs', label: 'Varukostnad', kind: 'section' },
    { key: 'cogs-p', label: 'Produkter', kind: 'sub', value: (c) => c.cogs.products },
    { key: 'cogs-g', label: 'Gåvor (0 kr-rader)', kind: 'sub', value: (c) => c.cogs.gifts },
    { key: 'tb1', label: 'Bruttovinst (TB1)', kind: 'subtotal', value: (c) => c.grossProfit },

    { key: 's-var', label: 'Rörliga kostnader', kind: 'section' },
    { key: 'ful', label: '3PL & frakt', kind: 'sub', value: (c) => c.variable.fulfillment },
    { key: 'fees', label: 'Betalavgifter', kind: 'sub', value: (c) => c.variable.paymentFees, help: `Schablon ${num(report.settings.paymentFeePct, 2)} % + ${num(report.settings.paymentFeeFixed)} kr per order på det kunden betalar.` },
    { key: 'tb2', label: 'TB2 – före marknadsföring', kind: 'subtotal', value: (c) => c.contributionBeforeMarketing },

    { key: 's-mkt', label: 'Marknadsföring', kind: 'section' },
    ...[...platforms].sort().map<Row>((p) => ({ key: `mkt-${p}`, label: p, kind: 'sub', value: (c) => c.marketing.byPlatform[p] ?? 0 })),
    { key: 'tb3', label: 'TB3 – efter marknadsföring', kind: 'subtotal', value: (c) => c.contributionAfterMarketing },

    { key: 's-opex', label: 'Fasta & övriga kostnader', kind: 'section' },
    ...(opexNames.size === 0
      ? [{ key: 'opex-none', label: 'Inga kostnader inlagda under Expenses', kind: 'memo' as RowKind, value: () => 0 }]
      : [...opexNames].sort().map<Row>((name) => ({ key: `opex-${name}`, label: name, kind: 'sub', value: (c) => c.opex.byName[name] ?? 0 }))),
    { key: 'op', label: 'Rörelseresultat', kind: 'result', value: (c) => c.operatingProfit },
    { key: 'tax', label: `Bolagsskatt (${num(report.settings.corporateTaxPct, 1)} %, uppskattad)`, kind: 'sub', value: (c) => c.corporateTax },
    { key: 'pat', label: 'Resultat efter skatt', kind: 'result', value: (c) => c.profitAfterTax },
    ...(report.settings.booked
      ? [
          { key: 's-booked', label: `Avstämning mot bokföringen (${report.settings.booked.source})`, kind: 'section' as RowKind },
          { key: 'bk-model', label: '3PL & frakt enligt modellen', kind: 'memo' as RowKind, value: (c: PnLColumn) => -c.variable.fulfillment },
          { key: 'bk-ship', label: 'Frakt, 3PL & emballage bokfört', kind: 'memo' as RowKind, value: (c: PnLColumn) => c.booked.shipping, help: 'Konto 5700/5710/5410/5460 + Konsido. Hela månader. Tomt = inte bokfört än.' },
          { key: 'bk-cogs', label: 'Varukostnad enligt modellen', kind: 'memo' as RowKind, value: (c: PnLColumn) => -c.cogs.total },
          { key: 'bk-inv', label: 'Varuinköp bokfört (lager – blir kostnad när det säljs)', kind: 'memo' as RowKind, value: (c: PnLColumn) => c.booked.inventory, help: 'Konto 4010/4056/4515. Inköp till lager, inte förbrukning.' },
        ]
      : []),
  ]
}

const METRICS: Array<{ key: string; label: string; fmt: (c: PnLColumn) => string; help?: string }> = [
  { key: 'orders', label: 'Ordrar', fmt: (c) => num(c.metrics.orders) },
  { key: 'units', label: 'Burkar (huvudprodukt)', fmt: (c) => num(c.metrics.units) },
  { key: 'aov', label: 'AOV inkl. moms', fmt: (c) => kr(c.metrics.aovInklMoms) },
  { key: 'cac', label: 'CAC (marknadsföring / order)', fmt: (c) => kr(c.metrics.cac) },
  { key: 'ppo', label: 'TB3 per order', fmt: (c) => kr(c.metrics.profitPerOrder) },
  { key: 'mer', label: 'MER (omsättning inkl. moms / ads)', fmt: (c) => num(c.metrics.mer, 2) },
  { key: 'bemer', label: 'Break-even MER', fmt: (c) => num(c.metrics.breakEvenMer, 2), help: 'MER där TB3 blir 0 kr' },
  { key: 'refunds', label: 'Returer (antal / inkl. moms)', fmt: (c) => `${c.metrics.refundCount} / ${kr(c.metrics.refundsInklMoms)}` },
]

// ===========================================
// PAGE
// ===========================================

export default function PnLPage() {
  const [preset, setPreset] = useState('3m')
  const [range, setRange] = useState<[string, string]>(() => PRESETS.find((p) => p.key === '3m')!.range())
  const [report, setReport] = useState<PnLReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)

  const load = useCallback(async (start: string, end: string) => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/pnl?start=${start}&end=${end}`)
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`)
      setReport(await res.json())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Kunde inte hämta P&L')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load(range[0], range[1])
  }, [range, load])

  const rows = useMemo(() => (report ? buildRows(report) : []), [report])
  const showColumns = report && report.columns.length > 1 ? report.columns : []

  const exportCsv = () => {
    if (!report) return
    const cols = [...showColumns, report.total]
    const lines = [['Rad', ...cols.map((c) => c.label)].join(';')]
    for (const r of rows) {
      if (!r.value) continue
      lines.push([r.label, ...cols.map((c) => { const v = r.value!(c); return v === null ? "" : Math.round(v) })].join(";"))
    }
    const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `pnl-${report.range.start}-${report.range.end}.csv`
    a.click()
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">P&L</h1>
          <p className="text-slate-600">
            Resultaträkning per månad, svensk tid. Allt under nettoomsättning är ex moms.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 rounded-xl bg-card p-2 text-card-foreground">
          {PRESETS.map((p) => (
            <Button
              key={p.key}
              size="sm"
              variant={preset === p.key ? 'default' : 'outline'}
              onClick={() => {
                setPreset(p.key)
                setRange(p.range())
              }}
            >
              {p.label}
            </Button>
          ))}
          <div className="flex items-center gap-1">
            <Input
              type="date"
              className="h-8 w-[140px]"
              value={range[0]}
              onChange={(e) => {
                setPreset('custom')
                if (e.target.value) setRange([e.target.value, range[1]])
              }}
            />
            <span className="text-muted-foreground/70">–</span>
            <Input
              type="date"
              className="h-8 w-[140px]"
              value={range[1]}
              onChange={(e) => {
                setPreset('custom')
                if (e.target.value) setRange([range[0], e.target.value])
              }}
            />
          </div>
          <Button size="sm" variant="outline" onClick={exportCsv} disabled={!report}>
            <Download className="mr-1 h-4 w-4" /> CSV
          </Button>
          <Button size="sm" variant="outline" onClick={() => setSettingsOpen(true)} disabled={!report}>
            <Settings2 className="mr-1 h-4 w-4" /> Antaganden
          </Button>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {loading && !report ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
            {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-24" />)}
          </div>
          <Skeleton className="h-[600px]" />
        </div>
      ) : report ? (
        <div className={cn('space-y-6 transition-opacity', loading && 'opacity-50')}>
          <KpiRow total={report.total} />
          <DataQualityPanel report={report} />

          {/* P&L table */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2">
                Resultaträkning
                {loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground/70" />}
              </CardTitle>
              <CardDescription>
                {report.range.start} – {report.range.end} · {report.range.days} dagar
              </CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-sm tabular-nums">
                <thead>
                  <tr className="border-b border-border text-right text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="sticky left-0 bg-card py-2 pr-4 text-left font-medium">Rad</th>
                    {showColumns.map((c) => (
                      <th key={c.key} className="whitespace-nowrap px-3 py-2 font-medium">
                        {c.label}
                      </th>
                    ))}
                    <th className="whitespace-nowrap px-3 py-2 font-semibold text-foreground">Totalt</th>
                    <th className="whitespace-nowrap py-2 pl-3 font-medium">% av netto</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <PnLRow key={r.key} row={r} columns={showColumns} total={report.total} />
                  ))}
                </tbody>
              </table>

              {/* Metrics */}
              <table className="mt-6 w-full text-sm tabular-nums">
                <tbody>
                  <tr>
                    <td colSpan={showColumns.length + 3} className="pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Nyckeltal
                    </td>
                  </tr>
                  {METRICS.map((m) => (
                    <tr key={m.key} className="border-t border-border/50">
                      <td className="sticky left-0 bg-card py-1.5 pr-4 text-muted-foreground" title={m.help}>
                        {m.label}
                      </td>
                      {showColumns.map((c) => (
                        <td key={c.key} className="whitespace-nowrap px-3 py-1.5 text-right text-foreground">{m.fmt(c)}</td>
                      ))}
                      <td className="whitespace-nowrap px-3 py-1.5 text-right font-medium text-foreground">{m.fmt(report.total)}</td>
                      <td />
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>

          <ProductTable report={report} />

          <p className="text-xs leading-relaxed text-slate-500">
            Ordrar räknas på processed_at i svensk tid, avbrutna ordrar exkluderas. Varukostnad slås upp per orderdatum
            (COGS-historik). 3PL & frakt räknas från fraktnivåerna per burk. Annonskostnad hämtas per kontodag och räknas om
            till SEK. Produktraden får hela orderns intäkt och kostnad enligt huvudprodukten; annonser fördelas på
            kampanjnamnet. Returer bokförs på återbetalningsdagen och dras ex moms.
          </p>
        </div>
      ) : null}

      {report && (
        <SettingsDialog
          open={settingsOpen}
          onOpenChange={setSettingsOpen}
          settings={report.settings}
          onSaved={() => load(range[0], range[1])}
        />
      )}
    </div>
  )
}

// ===========================================
// COMPONENTS
// ===========================================

function PnLRow({ row, columns, total }: { row: Row; columns: PnLColumn[]; total: PnLColumn }) {
  if (row.kind === 'section') {
    return (
      <tr>
        <td colSpan={columns.length + 3} className="pb-1 pt-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {row.label}
        </td>
      </tr>
    )
  }
  const value = row.value!
  const totalValue = value(total) ?? 0
  const net = total.revenue.netRevenue
  const strong = row.kind === 'subtotal' || row.kind === 'result'
  const colored = row.kind === 'result' || row.key === 'tb3'

  const cell = (v: number | null) =>
    v === null ? '–' : <span className={cn(colored && (v >= 0 ? 'text-emerald-500' : 'text-red-500'))}>{kr(v)}</span>
  const isEmptyMemo = row.key === 'opex-none'

  return (
    <tr
      className={cn(
        'border-t border-border/50',
        row.kind === 'subtotal' && 'border-border bg-muted/50',
        row.kind === 'result' && 'border-border bg-muted',
        row.kind === 'memo' && 'text-muted-foreground'
      )}
    >
      <td
        className={cn(
          'sticky left-0 py-1.5 pr-4',
          row.kind === 'sub' ? 'pl-4 text-muted-foreground' : 'text-foreground',
          strong ? 'font-semibold' : '',
          row.kind === 'subtotal' ? 'bg-muted/50' : row.kind === 'result' ? 'bg-muted' : 'bg-card'
        )}
        title={row.help}
      >
        {row.label}
        {row.help && <span className="ml-1 cursor-help text-muted-foreground/70">ⓘ</span>}
      </td>
      {columns.map((c) => (
        <td key={c.key} className={cn('whitespace-nowrap px-3 py-1.5 text-right', strong && 'font-semibold')}>
          {isEmptyMemo ? '–' : cell(value(c))}
        </td>
      ))}
      <td className={cn('whitespace-nowrap px-3 py-1.5 text-right font-medium', strong && 'font-bold')}>
        {isEmptyMemo ? '–' : cell(value(total))}
      </td>
      <td className="whitespace-nowrap py-1.5 pl-3 text-right text-muted-foreground">
        {row.kind !== 'memo' && net !== 0 && !['gross', 'disc', 'ship', 'oms', 'vat'].includes(row.key)
          ? pct((totalValue / net) * 100)
          : ''}
      </td>
    </tr>
  )
}

function Kpi({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'good' | 'bad' }) {
  return (
    <Card className="gap-1 py-4">
      <CardContent className="px-4">
        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className={cn('mt-1 text-xl font-bold tabular-nums text-foreground', tone === 'good' && 'text-emerald-500', tone === 'bad' && 'text-red-500')}>
          {value}
        </div>
        {sub && <div className="mt-0.5 text-xs text-muted-foreground">{sub}</div>}
      </CardContent>
    </Card>
  )
}

function KpiRow({ total }: { total: PnLColumn }) {
  const net = total.revenue.netRevenue
  const share = (v: number) => (net ? `${num((v / net) * 100, 1)} % av netto` : '')
  const merOk = total.metrics.mer >= total.metrics.breakEvenMer
  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
      <Kpi label="Nettoomsättning" value={kr(net)} sub={`${kr(total.revenue.omsattningInklMoms)} inkl. moms`} />
      <Kpi label="TB2 före marknadsf." value={kr(total.contributionBeforeMarketing)} sub={share(total.contributionBeforeMarketing)} />
      <Kpi label="Marknadsföring" value={kr(-total.marketing.total)} sub={share(-total.marketing.total)} />
      <Kpi
        label="TB3 efter marknadsf."
        value={kr(total.contributionAfterMarketing)}
        sub={share(total.contributionAfterMarketing)}
        tone={total.contributionAfterMarketing >= 0 ? 'good' : 'bad'}
      />
      <Kpi
        label="MER"
        value={num(total.metrics.mer, 2)}
        sub={`Break-even ${num(total.metrics.breakEvenMer, 2)}`}
        tone={merOk ? 'good' : 'bad'}
      />
      <Kpi label="Rörelseresultat" value={kr(total.operatingProfit)} sub={share(total.operatingProfit)} tone={total.operatingProfit >= 0 ? 'good' : 'bad'} />
    </div>
  )
}

function DataQualityPanel({ report }: { report: PnLReport }) {
  const dq = report.dataQuality
  const issues: React.ReactNode[] = []

  if (dq.missingCogs.length > 0) {
    const units = dq.missingCogs.reduce((s, m) => s + m.units, 0)
    issues.push(
      <span key="cogs">
        <strong>{num(units)} enheter saknar varukostnad</strong> och räknas som 0 kr:{' '}
        {dq.missingCogs.slice(0, 5).map((m) => `${m.title} (${num(m.units)} st)`).join(', ')}.{' '}
        <Link href="/cogs" className="underline">Lägg in COGS</Link>
      </span>
    )
  }
  if (dq.noFixedCosts) {
    issues.push(
      <span key="fixed">
        <strong>Inga fasta kostnader inlagda</strong> (Shopify, appar, löner, lokal, verktyg …) – rörelseresultatet är
        därför lika med TB3. <Link href="/expenses" className="underline">Lägg in under Expenses</Link>
      </span>
    )
  }
  for (const a of dq.adAccounts.filter((a) => a.stale)) {
    issues.push(
      <span key={`ad-${a.name}`}>
        <strong>{a.platform}-kontot {a.name}</strong> har data bara t.o.m. {a.lastDate} – synka under{' '}
        <Link href="/ads" className="underline">Ads</Link>.
      </span>
    )
  }
  if (dq.unknownCurrencies.length > 0) {
    issues.push(
      <span key="fx">
        Annonsvaluta utan växelkurs: {dq.unknownCurrencies.join(', ')} – räknas 1:1. Lägg till kursen under Antaganden.
      </span>
    )
  }
  if (dq.ordersWithoutShippingTier > 0) {
    issues.push(<span key="tiers">{num(dq.ordersWithoutShippingTier)} ordrar saknar fraktnivå – 3PL räknas som 0 kr.</span>)
  }

  if (issues.length === 0) return null
  return (
    <Alert className="border-amber-300 bg-amber-50 text-amber-900">
      <AlertTriangle className="h-4 w-4 text-amber-600" />
      <AlertDescription className="space-y-1 text-amber-900">
        <div className="font-semibold">Det här gör siffrorna mindre exakta</div>
        <ul className="list-disc space-y-0.5 pl-5">
          {issues.map((i, idx) => <li key={idx}>{i}</li>)}
        </ul>
      </AlertDescription>
    </Alert>
  )
}

function ProductTable({ report }: { report: PnLReport }) {
  const rows = report.products
  if (rows.length === 0) return null
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle>Per produkt</CardTitle>
        <CardDescription>
          Hela orderns intäkt och kostnad följer huvudprodukten. Annonser fördelas på kampanjnamnet. Break-even CAC = TB2 per order.
        </CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="w-full text-sm tabular-nums">
          <thead>
            <tr className="border-b border-border text-right text-xs uppercase tracking-wide text-muted-foreground">
              <th className="py-2 pr-4 text-left font-medium">Produkt</th>
              <th className="px-3 py-2 font-medium">Ordrar</th>
              <th className="px-3 py-2 font-medium">Netto</th>
              <th className="px-3 py-2 font-medium">Varukostn.</th>
              <th className="px-3 py-2 font-medium">3PL + avg.</th>
              <th className="px-3 py-2 font-medium">Returer</th>
              <th className="px-3 py-2 font-medium">TB2</th>
              <th className="px-3 py-2 font-medium">Annonser</th>
              <th className="px-3 py-2 font-medium">TB3</th>
              <th className="px-3 py-2 font-medium">TB3 %</th>
              <th className="px-3 py-2 font-medium">CAC</th>
              <th className="py-2 pl-3 font-medium">Break-even CAC</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => {
              const cacBad = p.orders > 0 && p.cac > p.breakEvenCac
              return (
                <tr key={p.key} className="border-t border-border/50">
                  <td className="py-1.5 pr-4 font-medium text-foreground">{p.name}</td>
                  <td className="px-3 py-1.5 text-right">{p.orders ? num(p.orders) : '–'}</td>
                  <td className="px-3 py-1.5 text-right">{kr(p.netRevenue)}</td>
                  <td className="px-3 py-1.5 text-right text-muted-foreground">{kr(-p.cogs)}</td>
                  <td className="px-3 py-1.5 text-right text-muted-foreground">{kr(-(p.fulfillment + p.paymentFees))}</td>
                  <td className="px-3 py-1.5 text-right text-muted-foreground">{kr(p.refunds)}</td>
                  <td className="px-3 py-1.5 text-right">{kr(p.contributionBeforeMarketing)}</td>
                  <td className="px-3 py-1.5 text-right text-muted-foreground">{kr(p.adSpend ? -p.adSpend : 0)}</td>
                  <td className={cn('px-3 py-1.5 text-right font-semibold', p.contributionAfterMarketing >= 0 ? 'text-emerald-500' : 'text-red-500')}>
                    {kr(p.contributionAfterMarketing)}
                  </td>
                  <td className="px-3 py-1.5 text-right">{p.netRevenue ? pct(p.marginPct) : '–'}</td>
                  <td className={cn('px-3 py-1.5 text-right', cacBad && 'font-semibold text-red-500')}>
                    {p.orders ? kr(p.cac) : '–'}
                  </td>
                  <td className="py-1.5 pl-3 text-right">
                    {p.orders ? kr(p.breakEvenCac) : '–'}
                    {cacBad && <Badge variant="destructive" className="ml-2">över</Badge>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </CardContent>
    </Card>
  )
}

function SettingsDialog({
  open,
  onOpenChange,
  settings,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  settings: PnLSettings
  onSaved: () => void
}) {
  const { addToast } = useToast()
  const [draft, setDraft] = useState(settings)
  const [saving, setSaving] = useState(false)
  useEffect(() => setDraft(settings), [settings, open])

  const field = (key: keyof PnLSettings, label: string, step = '0.01') => (
    <label className="grid grid-cols-[1fr_120px] items-center gap-3 text-sm">
      <span className="text-foreground">{label}</span>
      <Input
        type="number"
        step={step}
        value={draft[key] as number}
        onChange={(e) => setDraft({ ...draft, [key]: Number(e.target.value) })}
      />
    </label>
  )

  const save = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/pnl/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      })
      if (!res.ok) throw new Error()
      addToast({ title: 'Antaganden sparade', type: 'success' })
      onOpenChange(false)
      onSaved()
    } catch {
      addToast({ title: 'Kunde inte spara', type: 'error' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[96vw] sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Antaganden</DialogTitle>
          <DialogDescription>Gäller både P&L och Offers-kalkylen.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {field('paymentFeePct', 'Betalavgift, % av kundens belopp')}
          {field('paymentFeeFixed', 'Betalavgift, kr per order')}
          {field('corporateTaxPct', 'Bolagsskatt, %')}
          {Object.entries(draft.fxToSek)
            .filter(([c]) => c !== 'SEK')
            .map(([cur, rate]) => (
              <label key={cur} className="grid grid-cols-[1fr_120px] items-center gap-3 text-sm">
                <span className="text-foreground">SEK per {cur} (annonskonton)</span>
                <Input
                  type="number"
                  step="0.01"
                  value={rate}
                  onChange={(e) => setDraft({ ...draft, fxToSek: { ...draft.fxToSek, [cur]: Number(e.target.value) } })}
                />
              </label>
            ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Avbryt</Button>
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />} Spara
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
