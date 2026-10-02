'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { useToast } from '@/components/ui/toast'
import { AlertTriangle, Copy, Loader2, Plus, RotateCcw, Save, Trash2, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { calcBlended, calcTier, OfferConfig, OfferGift, OfferTier, TierResult } from '@/lib/offers/calc'
import type { PnLSettings } from '@/lib/pnl/settings'
import type { OfferActuals } from '@/lib/offers/actuals'
import type { ShippingTier } from '@/lib/shipping'

// ===========================================
// TYPES & FORMATTING
// ===========================================

interface Offer {
  id: string
  name: string
  sortOrder: number
  config: OfferConfig
  updatedAt: string
}

interface OffersResponse {
  offers: Offer[]
  settings: PnLSettings
  shippingTiers: Array<ShippingTier & { name: string }>
  actuals: OfferActuals
  productGroups: Array<{ key: string; name: string }>
}

const kr = (v: number) =>
  Number.isFinite(v) ? new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 0 }).format(Math.round(v)) + ' kr' : '–'
const num = (v: number, d = 0) =>
  Number.isFinite(v) ? new Intl.NumberFormat('sv-SE', { minimumFractionDigits: d, maximumFractionDigits: d }).format(v) : '∞'

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v))

// ===========================================
// PAGE
// ===========================================

export default function OffersPage() {
  const { addToast } = useToast()
  const [data, setData] = useState<OffersResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [drafts, setDrafts] = useState<Record<string, Offer>>({})
  const [settingsDraft, setSettingsDraft] = useState<PnLSettings | null>(null)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/offers')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json: OffersResponse = await res.json()
      setData(json)
      setSettingsDraft(json.settings)
      setDrafts(Object.fromEntries(json.offers.map((o) => [o.id, clone(o)])))
      setSelectedId((cur) => (cur && json.offers.some((o) => o.id === cur) ? cur : json.offers[0]?.id ?? null))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Kunde inte hämta erbjudanden')
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const saved = useMemo(() => Object.fromEntries((data?.offers ?? []).map((o) => [o.id, o])), [data])
  const isDirty = (id: string) => JSON.stringify(drafts[id]) !== JSON.stringify(saved[id])
  const settingsDirty = data && settingsDraft && JSON.stringify(settingsDraft) !== JSON.stringify(data.settings)

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    )
  }
  if (!data || !settingsDraft) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-40" />
        <Skeleton className="h-[500px]" />
      </div>
    )
  }

  const shippingTiers = data.shippingTiers
  const selected = selectedId ? drafts[selectedId] : null

  const updateSelected = (fn: (o: Offer) => void) => {
    if (!selectedId) return
    setDrafts((d) => {
      const next = clone(d[selectedId])
      fn(next)
      return { ...d, [selectedId]: next }
    })
  }

  const saveOffer = async (id: string) => {
    setSaving(true)
    try {
      const o = drafts[id]
      const res = await fetch(`/api/offers/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: o.name, config: o.config }),
      })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error)
      const updated: Offer = await res.json()
      setData((d) => d && { ...d, offers: d.offers.map((x) => (x.id === id ? updated : x)) })
      setDrafts((d) => ({ ...d, [id]: clone(updated) }))
      addToast({ title: `${updated.name} sparat`, type: 'success' })
    } catch (e) {
      addToast({ title: 'Kunde inte spara', message: e instanceof Error ? e.message : undefined, type: 'error' })
    } finally {
      setSaving(false)
    }
  }

  const saveSettings = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/pnl/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settingsDraft),
      })
      if (!res.ok) throw new Error()
      const next: PnLSettings = await res.json()
      setData((d) => d && { ...d, settings: next })
      setSettingsDraft(next)
      addToast({ title: 'Antaganden sparade', type: 'success' })
    } catch {
      addToast({ title: 'Kunde inte spara antaganden', type: 'error' })
    } finally {
      setSaving(false)
    }
  }

  const createOffer = async (name: string, config: OfferConfig) => {
    const res = await fetch('/api/offers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, config }),
    })
    if (!res.ok) {
      addToast({ title: 'Kunde inte skapa', type: 'error' })
      return
    }
    const created: Offer = await res.json()
    setData((d) => d && { ...d, offers: [...d.offers, created] })
    setDrafts((d) => ({ ...d, [created.id]: clone(created) }))
    setSelectedId(created.id)
  }

  const deleteOffer = async (id: string) => {
    const res = await fetch(`/api/offers/${id}`, { method: 'DELETE' })
    if (!res.ok) {
      addToast({ title: 'Kunde inte ta bort', type: 'error' })
      return
    }
    setData((d) => d && { ...d, offers: d.offers.filter((o) => o.id !== id) })
    setDrafts((d) => {
      const next = { ...d }
      delete next[id]
      return next
    })
    setSelectedId(data.offers.find((o) => o.id !== id)?.id ?? null)
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Offers</h1>
        <p className="text-slate-600">
          Räkna på erbjudandena per burk-steg. Allt räknas om direkt – spara när du vill behålla det.
        </p>
      </div>

      <Overview data={data} drafts={drafts} settings={settingsDraft} onSelect={setSelectedId} selectedId={selectedId} />

      <AssumptionsCard
        settings={settingsDraft}
        actuals={data.actuals}
        shippingTiers={shippingTiers}
        onChange={setSettingsDraft}
        dirty={!!settingsDirty}
        saving={saving}
        onSave={saveSettings}
        onReset={() => setSettingsDraft(data.settings)}
      />

      {/* Offer tabs */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl bg-card p-2 text-card-foreground">
        {data.offers.map((o) => (
          <Button
            key={o.id}
            size="sm"
            variant={o.id === selectedId ? 'default' : 'outline'}
            onClick={() => setSelectedId(o.id)}
          >
            {drafts[o.id]?.name ?? o.name}
            {isDirty(o.id) && <span className="ml-1 text-amber-400">●</span>}
          </Button>
        ))}
        {selected && (
          <Button size="sm" variant="ghost" onClick={() => createOffer(`${selected.name} – scenario`, clone(selected.config))}>
            <Copy className="mr-1 h-4 w-4" /> Kopiera som scenario
          </Button>
        )}
      </div>

      {selected && (
        <OfferEditor
          offer={selected}
          dirty={isDirty(selected.id)}
          saving={saving}
          settings={settingsDraft}
          shippingTiers={shippingTiers}
          actuals={data.actuals}
          productGroups={data.productGroups}
          onChange={updateSelected}
          onSave={() => saveOffer(selected.id)}
          onReset={() => setDrafts((d) => ({ ...d, [selected.id]: clone(saved[selected.id]) }))}
          onDelete={() => deleteOffer(selected.id)}
        />
      )}
    </div>
  )
}

// ===========================================
// OVERVIEW – every offer blended, against actual CAC
// ===========================================

function Overview({
  data,
  drafts,
  settings,
  selectedId,
  onSelect,
}: {
  data: OffersResponse
  drafts: Record<string, Offer>
  settings: PnLSettings
  selectedId: string | null
  onSelect: (id: string) => void
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle>Översikt – viktat på mixen</CardTitle>
        <CardDescription>
          Faktisk CAC = annonser på produktens kampanjer / produktens ordrar, senaste {data.actuals.days} dagarna
          ({data.actuals.start} – {data.actuals.end}).
        </CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="w-full text-sm tabular-nums">
          <thead>
            <tr className="border-b border-border text-right text-xs uppercase tracking-wide text-muted-foreground">
              <th className="py-2 pr-4 text-left font-medium">Erbjudande</th>
              <th className="px-3 py-2 font-medium">Snittorder inkl. moms</th>
              <th className="px-3 py-2 font-medium">TB före mf</th>
              <th className="px-3 py-2 font-medium">TB %</th>
              <th className="px-3 py-2 font-medium">Break-even CPA</th>
              <th className="px-3 py-2 font-medium">Break-even ROAS</th>
              <th className="px-3 py-2 font-medium">Mål-CPA ({num(settings.targetMarginPct)} %)</th>
              <th className="px-3 py-2 font-medium">Faktisk CAC</th>
              <th className="py-2 pl-3 font-medium">Vinst/order nu</th>
            </tr>
          </thead>
          <tbody>
            {data.offers.map((o) => {
              const draft = drafts[o.id] ?? o
              const b = calcBlended(draft.config, settings, data.shippingTiers)
              const actual = data.actuals.groups[draft.config.productGroup]
              const cac = actual && actual.orders > 0 && actual.adSpend > 0 ? actual.cac : null
              const profitNow = b && cac !== null ? b.contribution - cac : null
              return (
                <tr
                  key={o.id}
                  onClick={() => onSelect(o.id)}
                  className={cn('cursor-pointer border-t border-border/50 hover:bg-muted/50', o.id === selectedId && 'bg-primary/10')}
                >
                  <td className="py-1.5 pr-4 font-medium text-foreground">
                    {draft.name}
                    {b?.giftCostMissing && <AlertTriangle className="ml-1 inline h-3.5 w-3.5 text-amber-500" />}
                  </td>
                  <td className="px-3 py-1.5 text-right">{b ? kr(b.grossInklMoms) : '–'}</td>
                  <td className="px-3 py-1.5 text-right">{b ? kr(b.contribution) : '–'}</td>
                  <td className="px-3 py-1.5 text-right">{b ? `${num(b.contributionPct, 1)} %` : '–'}</td>
                  <td className="px-3 py-1.5 text-right font-semibold">{b ? kr(b.breakEvenCpa) : '–'}</td>
                  <td className="px-3 py-1.5 text-right">{b ? num(b.breakEvenRoas, 2) : '–'}</td>
                  <td className="px-3 py-1.5 text-right">{b ? kr(b.targetCpa) : '–'}</td>
                  <td className="px-3 py-1.5 text-right">{cac !== null ? `${kr(cac)} (${actual!.orders} ordr.)` : '–'}</td>
                  <td className={cn('py-1.5 pl-3 text-right font-semibold', profitNow !== null && (profitNow >= 0 ? 'text-emerald-500' : 'text-red-500'))}>
                    {profitNow !== null ? kr(profitNow) : '–'}
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

// ===========================================
// ASSUMPTIONS
// ===========================================

function AssumptionsCard({
  settings,
  actuals,
  shippingTiers,
  onChange,
  dirty,
  saving,
  onSave,
  onReset,
}: {
  settings: PnLSettings
  actuals: OfferActuals
  shippingTiers: Array<ShippingTier & { name: string }>
  onChange: (s: PnLSettings) => void
  dirty: boolean
  saving: boolean
  onSave: () => void
  onReset: () => void
}) {
  const field = (key: keyof PnLSettings, label: string, hint?: string) => (
    <label className="space-y-1 text-sm">
      <span className="block text-muted-foreground">{label}</span>
      <Input
        type="number"
        step="0.1"
        value={settings[key] as number}
        onChange={(e) => onChange({ ...settings, [key]: Number(e.target.value) })}
      />
      {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
    </label>
  )
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between">
          <span>Antaganden (gäller alla erbjudanden + P&L)</span>
          {dirty && (
            <span className="flex gap-2">
              <Button size="sm" variant="ghost" onClick={onReset}><RotateCcw className="mr-1 h-4 w-4" /> Ångra</Button>
              <Button size="sm" onClick={onSave} disabled={saving}><Save className="mr-1 h-4 w-4" /> Spara</Button>
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
          {field('paymentFeePct', 'Betalavgift %')}
          {field('paymentFeeFixed', 'Betalavgift kr/order')}
          {field('protectionPrice', 'Leveransskydd, pris')}
          {field('protectionAttachPct', 'Leveransskydd, anslutning %', `Faktiskt ${num(actuals.protectionAttachPct, 1)} % senaste ${actuals.days} d`)}
          {field('refundPct', 'Returer, % av netto')}
          {field('targetMarginPct', 'Önskad vinst, % av netto')}
        </div>
        <div className="text-xs text-muted-foreground">
          3PL & frakt (från Stores): {shippingTiers.length === 0
            ? 'inga fraktnivåer inlagda'
            : shippingTiers.map((t) => `${t.minItems}${t.maxItems === t.minItems ? '' : t.maxItems ? `–${t.maxItems}` : '+'} st: ${num(t.cost)} kr${t.costPerAdditionalItem ? ` + ${num(t.costPerAdditionalItem)} kr/extra` : ''}`).join(' · ')}
          . Fysiska gåvor räknas som en extra artikel i paketet.
        </div>
      </CardContent>
    </Card>
  )
}

// ===========================================
// OFFER EDITOR
// ===========================================

const RESULT_ROWS: Array<{ key: string; label: string; get: (r: TierResult) => number; fmt?: 'kr' | 'pct' | 'x'; strong?: boolean; neg?: boolean }> = [
  { key: 'gross', label: 'Kunden betalar inkl. moms (inkl. Leveransskydd-snitt)', get: (r) => r.grossInklMoms },
  { key: 'vat', label: 'Moms', get: (r) => r.vat, neg: true },
  { key: 'net', label: 'Netto ex moms', get: (r) => r.netExVat, strong: true },
  { key: 'cogs', label: 'Varukostnad burkar', get: (r) => r.productCogs, neg: true },
  { key: 'gifts', label: 'Gåvor', get: (r) => r.giftCogs, neg: true },
  { key: 'ful', label: '3PL & frakt', get: (r) => r.fulfillment, neg: true },
  { key: 'fee', label: 'Betalavgift', get: (r) => r.paymentFee, neg: true },
  { key: 'ref', label: 'Returer', get: (r) => r.refunds, neg: true },
  { key: 'tb', label: 'TB före marknadsföring', get: (r) => r.contribution, strong: true },
  { key: 'tbp', label: 'TB % av netto', get: (r) => r.contributionPct, fmt: 'pct' },
  { key: 'be', label: 'Break-even CPA', get: (r) => r.breakEvenCpa, strong: true },
  { key: 'ber', label: 'Break-even ROAS (inkl. moms)', get: (r) => r.breakEvenRoas, fmt: 'x' },
  { key: 'tcpa', label: 'Mål-CPA', get: (r) => r.targetCpa },
  { key: 'troas', label: 'Mål-ROAS', get: (r) => r.targetRoas, fmt: 'x' },
]

function fmtResult(v: number, fmt?: 'kr' | 'pct' | 'x', neg?: boolean) {
  if (fmt === 'pct') return `${num(v, 1)} %`
  if (fmt === 'x') return num(v, 2)
  return kr(neg && v !== 0 ? -v : v)
}

function NumField({
  value,
  onChange,
  step = '1',
  className,
  placeholder,
  nullable,
}: {
  value: number | null
  onChange: (v: number | null) => void
  step?: string
  className?: string
  placeholder?: string
  nullable?: boolean
}) {
  return (
    <Input
      type="number"
      step={step}
      className={cn('h-8', className)}
      placeholder={placeholder}
      value={value ?? ''}
      onChange={(e) => {
        const raw = e.target.value
        if (raw === '' && nullable) onChange(null)
        else onChange(Number(raw))
      }}
    />
  )
}

function OfferEditor({
  offer,
  dirty,
  saving,
  settings,
  shippingTiers,
  actuals,
  productGroups,
  onChange,
  onSave,
  onReset,
  onDelete,
}: {
  offer: Offer
  dirty: boolean
  saving: boolean
  settings: PnLSettings
  shippingTiers: ShippingTier[]
  actuals: OfferActuals
  productGroups: Array<{ key: string; name: string }>
  onChange: (fn: (o: Offer) => void) => void
  onSave: () => void
  onReset: () => void
  onDelete: () => void
}) {
  const { config } = offer
  const results = config.tiers.map((t) => calcTier(config, t, settings, shippingTiers))
  const blended = calcBlended(config, settings, shippingTiers)
  const actual = actuals.groups[config.productGroup]
  const actualByQty = new Map((actual?.tiers ?? []).map((t) => [t.qty, t]))
  const missingGiftCost = results.some((r) => r.giftCostMissing)

  const setTier = (i: number, fn: (t: OfferTier) => void) => onChange((o) => fn(o.config.tiers[i]))
  const setGift = (i: number, g: number, fn: (gift: OfferGift) => void) => onChange((o) => fn(o.config.tiers[i].gifts[g]))

  const useActualMix = () =>
    onChange((o) => {
      for (const t of o.config.tiers) t.mixPct = actualByQty.get(t.qty)?.sharePct ?? 0
    })

  const addTier = () =>
    onChange((o) => {
      const last = o.config.tiers[o.config.tiers.length - 1]
      const qty = (last?.qty ?? 0) + 1
      o.config.tiers.push({
        id: `t${Date.now()}`,
        label: `${qty} burkar`,
        qty,
        price: last ? Math.round((last.price / last.qty) * qty) : 399,
        compareAt: last?.compareAt ? Math.round((last.compareAt / last.qty) * qty) : null,
        shippingCharged: 0,
        gifts: last ? clone(last.gifts) : [],
        mixPct: 0,
      })
    })

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="grid flex-1 grid-cols-2 gap-3 md:grid-cols-5">
            <label className="col-span-2 space-y-1 text-sm">
              <span className="block text-muted-foreground">Namn</span>
              <Input className="h-8" value={offer.name} onChange={(e) => onChange((o) => { o.name = e.target.value })} />
            </label>
            <label className="space-y-1 text-sm">
              <span className="block text-muted-foreground">Varukostnad/burk ex moms</span>
              <NumField step="0.01" value={config.unitCogs} onChange={(v) => onChange((o) => { o.config.unitCogs = v ?? 0 })} />
            </label>
            <label className="space-y-1 text-sm">
              <span className="block text-muted-foreground">Moms %</span>
              <NumField value={config.vatPct} onChange={(v) => onChange((o) => { o.config.vatPct = v ?? 0 })} />
            </label>
            <label className="space-y-1 text-sm" title="Andel av priset som bokas som e-bok med 6 % moms">
              <span className="block text-muted-foreground">E-boksandel % (6 % moms)</span>
              <NumField step="0.01" value={config.bookSharePct} onChange={(v) => onChange((o) => { o.config.bookSharePct = v ?? 0 })} />
            </label>
            <label className="col-span-2 space-y-1 text-sm md:col-span-2">
              <span className="block text-muted-foreground">Kopplad produkt (för faktiska siffror)</span>
              <select
                className="h-8 w-full rounded-md border border-border bg-card px-2 text-sm"
                value={config.productGroup}
                onChange={(e) => onChange((o) => { o.config.productGroup = e.target.value })}
              >
                {productGroups.map((g) => <option key={g.key} value={g.key}>{g.name}</option>)}
              </select>
            </label>
            <label className="col-span-2 space-y-1 text-sm md:col-span-3">
              <span className="block text-muted-foreground">Anteckning</span>
              <Input className="h-8" value={config.notes ?? ''} onChange={(e) => onChange((o) => { o.config.notes = e.target.value })} />
            </label>
          </div>
          <div className="flex gap-2">
            {dirty && <Button size="sm" variant="ghost" onClick={onReset}><RotateCcw className="mr-1 h-4 w-4" /> Ångra</Button>}
            <Button size="sm" onClick={onSave} disabled={!dirty || saving}>
              {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Save className="mr-1 h-4 w-4" />} Spara
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-red-500"
              onClick={() => { if (window.confirm(`Ta bort ${offer.name}?`)) onDelete() }}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {missingGiftCost && (
          <Alert className="border-amber-500/40 bg-amber-500/10">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            <AlertDescription className="text-amber-700 dark:text-amber-300">
              En eller flera gåvor saknar kostnad (tomt fält) och räknas som 0 kr. Fyll i inköpspris ex moms så blir TB rätt.
            </AlertDescription>
          </Alert>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-sm tabular-nums">
            <thead>
              <tr className="align-top">
                <th className="w-[260px] min-w-[220px] py-2 pr-4 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Steg
                </th>
                {config.tiers.map((t, i) => (
                  <th key={t.id} className="min-w-[220px] px-2 py-2 text-left font-normal">
                    <div className="space-y-2 rounded-lg border border-border bg-muted/50 p-2">
                      <div className="flex items-center gap-1">
                        <Input className="h-8 font-semibold" value={t.label} onChange={(e) => setTier(i, (x) => { x.label = e.target.value })} />
                        {config.tiers.length > 1 && (
                          <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" onClick={() => onChange((o) => { o.config.tiers.splice(i, 1) })}>
                            <X className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                      <TierInput label="Antal burkar"><NumField value={t.qty} onChange={(v) => setTier(i, (x) => { x.qty = Math.max(1, Math.round(v ?? 1)) })} /></TierInput>
                      <TierInput label="Pris inkl. moms"><NumField value={t.price} onChange={(v) => setTier(i, (x) => { x.price = v ?? 0 })} /></TierInput>
                      <TierInput label="Ordinarie (jämförpris)"><NumField nullable value={t.compareAt} onChange={(v) => setTier(i, (x) => { x.compareAt = v })} /></TierInput>
                      <TierInput label="Frakt kunden betalar"><NumField value={t.shippingCharged} onChange={(v) => setTier(i, (x) => { x.shippingCharged = v ?? 0 })} /></TierInput>
                      <TierInput label="Mix % av ordrar"><NumField value={t.mixPct} onChange={(v) => setTier(i, (x) => { x.mixPct = v ?? 0 })} /></TierInput>
                      <div className="space-y-1 border-t border-border pt-2">
                        <div className="text-xs font-medium text-muted-foreground">Gåvor / ingår</div>
                        {t.gifts.map((g, gi) => (
                          <div key={gi} className="space-y-1 rounded border border-border bg-card p-1.5">
                            <div className="flex items-center gap-1">
                              <Input className="h-7 text-xs" value={g.name} onChange={(e) => setGift(i, gi, (x) => { x.name = e.target.value })} />
                              <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={() => setTier(i, (x) => { x.gifts.splice(gi, 1) })}>
                                <X className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                            <div className="grid grid-cols-[48px_1fr_auto] items-center gap-1 text-xs">
                              <NumField className="h-7 text-xs" value={g.qty} onChange={(v) => setGift(i, gi, (x) => { x.qty = Math.max(0, Math.round(v ?? 0)) })} />
                              <NumField
                                nullable
                                step="0.01"
                                placeholder="kostnad?"
                                className={cn('h-7 text-xs', g.unitCost === null && 'border-amber-500 bg-amber-500/10')}
                                value={g.unitCost}
                                onChange={(v) => setGift(i, gi, (x) => { x.unitCost = v })}
                              />
                              <label className="flex items-center gap-1 whitespace-nowrap text-muted-foreground" title="Ligger i paketet (räknas i 3PL-nivån)">
                                <input type="checkbox" checked={g.physical} onChange={(e) => setGift(i, gi, (x) => { x.physical = e.target.checked })} />
                                fysisk
                              </label>
                            </div>
                          </div>
                        ))}
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-full text-xs"
                          onClick={() => setTier(i, (x) => { x.gifts.push({ name: 'Ny gåva', qty: 1, unitCost: null, physical: true }) })}
                        >
                          <Plus className="mr-1 h-3.5 w-3.5" /> Gåva
                        </Button>
                      </div>
                    </div>
                  </th>
                ))}
                <th className="min-w-[160px] px-2 py-2 text-left align-top">
                  <div className="rounded-lg border border-primary/30 bg-primary/10 p-2 text-sm font-semibold text-foreground">
                    Viktat snitt
                    <div className="mt-1 text-xs font-normal text-muted-foreground">
                      {blended ? `${num(blended.units, 2)} burkar/order` : 'Ange mix'}
                    </div>
                  </div>
                  <Button size="sm" variant="outline" className="mt-2 w-full" onClick={addTier}>
                    <Plus className="mr-1 h-4 w-4" /> Steg
                  </Button>
                </th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-t border-border">
                <td className="py-1.5 pr-4 text-muted-foreground">Pris per burk · rabatt</td>
                {results.map((r, i) => (
                  <td key={i} className="px-3 py-1.5 text-right">
                    {kr(r.pricePerUnit)}
                    {r.discountPct !== null && <Badge variant="secondary" className="ml-2">−{num(r.discountPct)} %</Badge>}
                  </td>
                ))}
                <td />
              </tr>
              {RESULT_ROWS.map((row) => (
                <tr
                  key={row.key}
                  className={cn('border-t border-border/50', row.strong && 'bg-muted/50 font-semibold', row.key === 'be' && 'bg-emerald-500/10')}
                >
                  <td className="py-1.5 pr-4 text-foreground">{row.label}</td>
                  {results.map((r, i) => (
                    <td
                      key={i}
                      className={cn(
                        'whitespace-nowrap px-3 py-1.5 text-right',
                        row.key === 'gifts' && r.giftCostMissing && 'text-amber-500',
                        row.key === 'tb' && (r.contribution >= 0 ? 'text-emerald-500' : 'text-red-500')
                      )}
                    >
                      {fmtResult(row.get(r), row.fmt, row.neg)}
                      {row.key === 'gifts' && r.giftCostMissing && ' ?'}
                    </td>
                  ))}
                  <td className="whitespace-nowrap px-3 py-1.5 text-right text-foreground">
                    {blended ? fmtResult(row.get(blended), row.fmt, row.neg) : '–'}
                  </td>
                </tr>
              ))}
              <tr className="border-t border-border/50">
                <td className="py-1.5 pr-4 text-foreground">TB per burk</td>
                {results.map((r, i) => <td key={i} className="px-3 py-1.5 text-right">{kr(r.contributionPerUnit)}</td>)}
                <td className="px-3 py-1.5 text-right text-foreground">{blended && blended.units > 0 ? kr(blended.contribution / blended.units) : '–'}</td>
              </tr>

              {/* Actuals */}
              <tr>
                <td colSpan={config.tiers.length + 2} className="pb-1 pt-5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Faktiskt senaste {actuals.days} dagarna (ordrar med bara den här produkten)
                </td>
              </tr>
              <tr className="border-t border-border/50">
                <td className="py-1.5 pr-4 text-foreground">Ordrar · andel</td>
                {config.tiers.map((t) => {
                  const a = actualByQty.get(t.qty)
                  return <td key={t.id} className="px-3 py-1.5 text-right">{a ? `${num(a.orders)} · ${num(a.sharePct, 1)} %` : '–'}</td>
                })}
                <td className="px-3 py-1.5 text-right">
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={useActualMix} disabled={!actual}>
                    Använd faktisk mix
                  </Button>
                </td>
              </tr>
              <tr className="border-t border-border/50">
                <td className="py-1.5 pr-4 text-foreground">Snittorder inkl. moms (faktisk vs kalkyl)</td>
                {config.tiers.map((t, i) => {
                  const a = actualByQty.get(t.qty)
                  const diff = a ? a.avgGrossInklMoms - results[i].grossInklMoms : 0
                  return (
                    <td key={t.id} className="px-3 py-1.5 text-right">
                      {a ? (
                        <>
                          {kr(a.avgGrossInklMoms)}{' '}
                          <span className={cn('text-xs', Math.abs(diff) > 15 ? 'text-amber-500' : 'text-muted-foreground/70')}>
                            ({diff >= 0 ? '+' : ''}{num(diff)})
                          </span>
                        </>
                      ) : '–'}
                    </td>
                  )
                })}
                <td />
              </tr>
              <tr className="border-t border-border/50">
                <td className="py-1.5 pr-4 text-foreground">Faktisk CAC vs break-even</td>
                <td colSpan={config.tiers.length} className="px-3 py-1.5 text-right text-muted-foreground">
                  {actual ? `${kr(actual.adSpend)} annonser / ${num(actual.orders)} ordrar` : 'Ingen data'}
                </td>
                <td className={cn('px-3 py-1.5 text-right font-semibold', actual && blended && (actual.cac <= blended.breakEvenCpa ? 'text-emerald-500' : 'text-red-500'))}>
                  {actual && actual.adSpend > 0 ? kr(actual.cac) : '–'}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="text-xs text-muted-foreground">
          Avvikelser i snittordern kommer av rabattkoder, Leveransskydd och blandade ordrar. Break-even CPA = vad en order får
          kosta i annonser innan den går med förlust. Break-even ROAS räknas på ordervärdet inkl. moms, som Meta och Google
          rapporterar det.
        </p>
      </CardContent>
    </Card>
  )
}

function TierInput({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid grid-cols-[1fr_96px] items-center gap-2 text-xs text-muted-foreground">
      <span>{label}</span>
      {children}
    </label>
  )
}
