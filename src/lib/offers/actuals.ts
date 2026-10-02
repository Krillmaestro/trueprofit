// ===========================================
// What the offers actually did – last N days of orders and ad spend
// ===========================================

import { prisma } from '@/lib/prisma'
import { addDays, stockholmMidnight, todayStockholm } from '@/lib/pnl/period'
import { campaignGroupKey, primaryProduct } from '@/lib/pnl/products'

export interface TierActual {
  qty: number
  orders: number
  sharePct: number
  avgGrossInklMoms: number
  avgNetExVat: number
}

export interface GroupActual {
  orders: number
  adSpend: number
  cac: number
  tiers: TierActual[]
}

export interface OfferActuals {
  days: number
  start: string
  end: string
  protectionAttachPct: number
  groups: Record<string, GroupActual>
}

const n = (v: unknown) => (v === null || v === undefined ? 0 : Number(v.toString()))

export async function loadOfferActuals(teamId: string, days = 30): Promise<OfferActuals> {
  const end = addDays(todayStockholm(), -1)
  const start = addDays(end, -(days - 1))
  const stores = await prisma.store.findMany({ where: { teamId }, select: { id: true } })

  const orders = await prisma.order.findMany({
    where: {
      storeId: { in: stores.map((s) => s.id) },
      processedAt: { gte: stockholmMidnight(start), lt: stockholmMidnight(addDays(end, 1)) },
      cancelledAt: null,
      OR: [
        { financialStatus: { in: ['paid', 'partially_paid', 'partially_refunded', 'refunded'] } },
        { financialStatus: null },
      ],
    },
    select: {
      totalPrice: true,
      totalTax: true,
      lineItems: { select: { title: true, price: true, quantity: true } },
    },
  })

  const groups: Record<string, { orders: number; adSpend: number; tiers: Map<number, { orders: number; gross: number; net: number }> }> = {}
  const group = (key: string) => (groups[key] ??= { orders: 0, adSpend: 0, tiers: new Map() })
  let withProtection = 0

  for (const o of orders) {
    const lines = o.lineItems.map((l) => ({ title: l.title, price: n(l.price), quantity: l.quantity }))
    if (lines.some((l) => /leverans\s*skydd/i.test(l.title))) withProtection++
    const primary = primaryProduct(lines)
    const g = group(primary.key)
    g.orders++
    // Tier stats only from single-product orders, so the price matches the tier
    if (!primary.singleProduct) continue
    const t = g.tiers.get(primary.units) ?? { orders: 0, gross: 0, net: 0 }
    t.orders++
    t.gross += n(o.totalPrice)
    t.net += n(o.totalPrice) - n(o.totalTax)
    g.tiers.set(primary.units, t)
  }

  const ads = await prisma.adSpend.findMany({
    where: {
      adAccount: { teamId },
      date: { gte: new Date(`${start}T00:00:00Z`), lte: new Date(`${end}T00:00:00Z`) },
      currency: 'SEK',
    },
    select: { spend: true, campaignName: true },
  })
  for (const a of ads) group(campaignGroupKey(a.campaignName)).adSpend += n(a.spend)

  const out: Record<string, GroupActual> = {}
  for (const [key, g] of Object.entries(groups)) {
    const tierOrders = [...g.tiers.values()].reduce((s, t) => s + t.orders, 0)
    out[key] = {
      orders: g.orders,
      adSpend: Math.round(g.adSpend),
      cac: g.orders > 0 ? Math.round(g.adSpend / g.orders) : 0,
      tiers: [...g.tiers.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([qty, t]) => ({
          qty,
          orders: t.orders,
          sharePct: tierOrders > 0 ? Math.round((t.orders / tierOrders) * 1000) / 10 : 0,
          avgGrossInklMoms: Math.round(t.gross / t.orders),
          avgNetExVat: Math.round(t.net / t.orders),
        })),
    }
  }

  return {
    days,
    start,
    end,
    protectionAttachPct: orders.length > 0 ? Math.round((withProtection / orders.length) * 1000) / 10 : 0,
    groups: out,
  }
}
