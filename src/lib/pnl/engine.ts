// ===========================================
// P&L ENGINE
// ===========================================
//
// One place that turns orders, refunds, COGS, shipping tiers, ad spend and
// custom costs into a P&L. Everything below "Nettoomsättning" is ex moms.
//
//   Omsättning inkl. moms   = Shopify total_price (bruttoförsäljning − rabatter + frakt)
//   − Moms                  = Shopify total_tax
//   − Returer (ex moms)     dated by the refund, not by the order
//   = Nettoomsättning
//   − Varukostnad           produkter + gåvor (historisk COGS per orderdatum)
//   = Bruttovinst (TB1)
//   − 3PL & frakt, betalavgifter
//   = TB2 (före marknadsföring)
//   − Marknadsföring        Meta, Google … omräknat till SEK
//   = TB3 (efter marknadsföring)
//   − Fasta kostnader, löner, övriga
//   = Rörelseresultat

import { prisma } from '@/lib/prisma'
import { getCOGSAtDateFromEntries } from '@/lib/calculations/cogs'
import { calculateShippingCost, ShippingTier } from '@/lib/shipping'
import {
  PeriodBucket,
  monthBuckets,
  stockholmMidnight,
  stockholmDate,
  addDays,
  daysBetweenInclusive,
  daysInMonth,
} from './period'
import { PnLSettings } from './settings'
import {
  PRODUCT_GROUPS,
  OTHER_GROUP,
  UNALLOCATED_ADS,
  campaignGroupKey,
  groupName,
  primaryProduct,
} from './products'

// ===========================================
// TYPES
// ===========================================

export interface PnLColumn {
  key: string
  label: string
  start: string
  end: string
  partial: boolean
  revenue: {
    grossSales: number          // Σ pris × antal, inkl. moms, före rabatt
    discounts: number           // negative
    shippingRevenue: number
    omsattningInklMoms: number  // = Shopify total_price
    vat: number                 // negative
    refunds: number             // negative, ex moms
    netRevenue: number
  }
  cogs: { products: number; gifts: number; total: number }
  grossProfit: number
  variable: { fulfillment: number; paymentFees: number; total: number }
  contributionBeforeMarketing: number
  marketing: { byPlatform: Record<string, number>; total: number }
  contributionAfterMarketing: number
  opex: {
    fixed: number
    salaries: number
    variable: number
    oneTime: number
    byName: Record<string, number>
    total: number
  }
  operatingProfit: number
  corporateTax: number
  profitAfterTax: number
  metrics: {
    orders: number
    units: number
    refundsInklMoms: number
    refundCount: number
    aovInklMoms: number
    netRevenuePerOrder: number
    profitPerOrder: number
    cac: number                 // marknadsföring / ordrar
    mer: number                 // omsättning inkl. moms / marknadsföring
    breakEvenMer: number        // MER där TB3 = 0
    days: number
  }
}

export interface ProductRow {
  key: string
  name: string
  orders: number
  units: number
  netRevenue: number
  cogs: number
  fulfillment: number
  paymentFees: number
  refunds: number
  contributionBeforeMarketing: number
  adSpend: number
  contributionAfterMarketing: number
  marginPct: number
  cac: number
  breakEvenCac: number
}

export interface DataQuality {
  missingCogs: Array<{ title: string; units: number; lines: number }>
  adAccounts: Array<{ name: string; platform: string; currency: string; lastDate: string | null; spend: number; stale: boolean }>
  noFixedCosts: boolean
  unknownCurrencies: string[]
  lastOrderAt: string | null
  ordersWithoutShippingTier: number
}

export interface PnLReport {
  range: { start: string; end: string; days: number }
  columns: PnLColumn[]
  total: PnLColumn
  products: ProductRow[]
  dataQuality: DataQuality
  settings: PnLSettings
}

// ===========================================
// HELPERS
// ===========================================

const n = (v: unknown): number => {
  if (v === null || v === undefined) return 0
  if (typeof v === 'number') return v
  return Number(v.toString())
}
const r2 = (v: number) => Math.round(v * 100) / 100

type Acc = {
  grossSales: number; discounts: number; shippingRevenue: number; omsattning: number; vat: number
  refundsExVat: number; refundsInklMoms: number; refundCount: number
  cogsProducts: number; cogsGifts: number; fulfillment: number; paymentFees: number
  marketingByPlatform: Record<string, number>
  fixed: number; salaries: number; variableOpex: number; oneTime: number; opexByName: Record<string, number>
  orders: number; units: number
}

const emptyAcc = (): Acc => ({
  grossSales: 0, discounts: 0, shippingRevenue: 0, omsattning: 0, vat: 0,
  refundsExVat: 0, refundsInklMoms: 0, refundCount: 0,
  cogsProducts: 0, cogsGifts: 0, fulfillment: 0, paymentFees: 0,
  marketingByPlatform: {},
  fixed: 0, salaries: 0, variableOpex: 0, oneTime: 0, opexByName: {},
  orders: 0, units: 0,
})

type ProductAcc = {
  orders: number; units: number; netRevenue: number; cogs: number
  fulfillment: number; paymentFees: number; refunds: number; adSpend: number
}
const emptyProductAcc = (): ProductAcc => ({
  orders: 0, units: 0, netRevenue: 0, cogs: 0, fulfillment: 0, paymentFees: 0, refunds: 0, adSpend: 0,
})

const PLATFORM_NAMES: Record<string, string> = {
  FACEBOOK: 'Meta',
  GOOGLE: 'Google Ads',
  TIKTOK: 'TikTok',
  SNAPCHAT: 'Snapchat',
  PINTEREST: 'Pinterest',
}

/** Daily rate of a recurring custom cost on a given month. */
function dailyRate(amount: number, recurrence: string, monthKey: string): number {
  switch (recurrence) {
    case 'DAILY': return amount
    case 'WEEKLY': return amount / 7
    case 'BIWEEKLY': return amount / 14
    case 'MONTHLY': return amount / daysInMonth(monthKey)
    case 'QUARTERLY': return (amount * 4) / 365
    case 'YEARLY': return amount / 365
    default: return 0
  }
}

// ===========================================
// MAIN
// ===========================================

export async function computePnL(params: {
  teamId: string
  storeId: string | null
  start: string // YYYY-MM-DD (Stockholm), inclusive
  end: string   // YYYY-MM-DD (Stockholm), inclusive
  settings: PnLSettings
}): Promise<PnLReport> {
  const { teamId, storeId, start, end, settings } = params
  const buckets = monthBuckets(start, end)
  const startInstant = stockholmMidnight(start)
  const endExclusive = stockholmMidnight(addDays(end, 1))

  const bucketOf = (dateStr: string): number => buckets.findIndex((b) => dateStr >= b.start && dateStr <= b.end)
  const accs = buckets.map(() => emptyAcc())
  const productAccs = new Map<string, ProductAcc>()
  const productAcc = (key: string) => {
    let a = productAccs.get(key)
    if (!a) { a = emptyProductAcc(); productAccs.set(key, a) }
    return a
  }

  // ---------- Stores, shipping tiers, COGS ----------
  const stores = await prisma.store.findMany({
    where: { teamId, ...(storeId ? { id: storeId } : {}) },
    include: { shippingCostTiers: { where: { isActive: true }, orderBy: { minItems: 'asc' } } },
  })
  const storeIds = stores.map((s) => s.id)
  const tiersByStore = new Map<string, ShippingTier[]>(
    stores.map((s) => [s.id, s.shippingCostTiers.map((t) => ({
      minItems: t.minItems,
      maxItems: t.maxItems,
      cost: n(t.cost),
      costPerAdditionalItem: n(t.costPerAdditionalItem),
      shippingZone: t.shippingZone,
    }))])
  )

  const cogsRows = await prisma.variantCOGS.findMany({
    where: { variant: { product: { storeId: { in: storeIds } } } },
    select: { variantId: true, costPrice: true, effectiveFrom: true, effectiveTo: true },
    orderBy: { effectiveFrom: 'desc' },
  })
  const cogsByVariant = new Map<string, typeof cogsRows>()
  for (const row of cogsRows) {
    const list = cogsByVariant.get(row.variantId) ?? []
    list.push(row)
    cogsByVariant.set(row.variantId, list)
  }

  // ---------- Orders ----------
  const orderStatusFilter = {
    OR: [
      { financialStatus: { in: ['paid', 'partially_paid', 'partially_refunded', 'refunded'] } },
      { financialStatus: null },
    ],
    cancelledAt: null,
  }

  const orders = await prisma.order.findMany({
    where: {
      storeId: { in: storeIds },
      processedAt: { gte: startInstant, lt: endExclusive },
      ...orderStatusFilter,
    },
    select: {
      storeId: true,
      processedAt: true,
      totalPrice: true,
      subtotalPrice: true,
      totalTax: true,
      totalDiscounts: true,
      totalShippingPrice: true,
      lineItems: {
        select: {
          title: true,
          price: true,
          quantity: true,
          variantId: true,
          variant: { select: { product: { select: { isShippingExempt: true } } } },
        },
      },
    },
  })

  const missingCogs = new Map<string, { units: number; lines: number }>()
  let ordersWithoutShippingTier = 0

  for (const order of orders) {
    const day = stockholmDate(order.processedAt!)
    const b = bucketOf(day)
    if (b < 0) continue
    const acc = accs[b]

    const totalPrice = n(order.totalPrice)
    const tax = n(order.totalTax)
    const shipping = n(order.totalShippingPrice)
    const discounts = n(order.totalDiscounts)

    let gross = 0
    let cogsProducts = 0
    let cogsGifts = 0
    let physicalItems = 0
    const lines = order.lineItems.map((li) => ({ title: li.title, price: n(li.price), quantity: li.quantity }))

    order.lineItems.forEach((li, i) => {
      const price = lines[i].price
      gross += price * li.quantity
      const entries = li.variantId ? cogsByVariant.get(li.variantId) : undefined
      const unitCost = entries ? getCOGSAtDateFromEntries(entries, order.processedAt!) : null
      if (unitCost === null) {
        const m = missingCogs.get(li.title) ?? { units: 0, lines: 0 }
        m.units += li.quantity
        m.lines += 1
        missingCogs.set(li.title, m)
      } else if (price <= 0) {
        cogsGifts += unitCost * li.quantity
      } else {
        cogsProducts += unitCost * li.quantity
      }
      if (!li.variant?.product?.isShippingExempt) physicalItems += li.quantity
    })

    const tiers = tiersByStore.get(order.storeId) ?? []
    let fulfillment = 0
    if (physicalItems > 0) {
      if (tiers.length === 0) ordersWithoutShippingTier++
      fulfillment = calculateShippingCost(physicalItems, tiers)
    }
    const fee = totalPrice > 0 ? (totalPrice * settings.paymentFeePct) / 100 + settings.paymentFeeFixed : 0

    const primary = primaryProduct(lines)

    acc.grossSales += gross
    acc.discounts += discounts
    acc.shippingRevenue += shipping
    acc.omsattning += totalPrice
    acc.vat += tax
    acc.cogsProducts += cogsProducts
    acc.cogsGifts += cogsGifts
    acc.fulfillment += fulfillment
    acc.paymentFees += fee
    acc.orders += 1
    acc.units += primary.units

    const p = productAcc(primary.key)
    p.orders += 1
    p.units += primary.units
    p.netRevenue += totalPrice - tax
    p.cogs += cogsProducts + cogsGifts
    p.fulfillment += fulfillment
    p.paymentFees += fee
  }

  // ---------- Refunds (dated by refund) ----------
  const refunds = await prisma.orderRefund.findMany({
    where: {
      processedAt: { gte: startInstant, lt: endExclusive },
      order: { storeId: { in: storeIds }, ...orderStatusFilter },
    },
    select: {
      processedAt: true,
      amount: true,
      order: {
        select: {
          totalPrice: true,
          totalTax: true,
          lineItems: { select: { title: true, price: true, quantity: true } },
        },
      },
    },
  })

  for (const refund of refunds) {
    const b = bucketOf(stockholmDate(refund.processedAt))
    if (b < 0) continue
    const amount = n(refund.amount)
    const orderTotal = n(refund.order.totalPrice)
    const vatShare = orderTotal > 0 ? n(refund.order.totalTax) / orderTotal : 0.2
    const exVat = amount * (1 - vatShare)
    accs[b].refundsInklMoms += amount
    accs[b].refundsExVat += exVat
    accs[b].refundCount += 1
    const primary = primaryProduct(refund.order.lineItems.map((li) => ({ title: li.title, price: n(li.price), quantity: li.quantity })))
    productAcc(primary.key).refunds += exVat
  }

  // ---------- Ad spend ----------
  const adRows = await prisma.adSpend.findMany({
    where: {
      adAccount: { teamId },
      date: { gte: new Date(`${start}T00:00:00Z`), lte: new Date(`${end}T00:00:00Z`) },
    },
    select: {
      date: true,
      spend: true,
      currency: true,
      campaignName: true,
      adAccountId: true,
      adAccount: { select: { platform: true } },
    },
  })

  const unknownCurrencies = new Set<string>()
  const spendByAccount = new Map<string, number>()
  for (const row of adRows) {
    const b = bucketOf(row.date.toISOString().slice(0, 10))
    if (b < 0) continue
    const rate = settings.fxToSek[row.currency] ?? (row.currency === 'SEK' ? 1 : undefined)
    if (rate === undefined) unknownCurrencies.add(row.currency)
    const spendSek = n(row.spend) * (rate ?? 1)
    const platform = PLATFORM_NAMES[row.adAccount.platform] ?? row.adAccount.platform
    accs[b].marketingByPlatform[platform] = (accs[b].marketingByPlatform[platform] ?? 0) + spendSek
    spendByAccount.set(row.adAccountId, (spendByAccount.get(row.adAccountId) ?? 0) + spendSek)
    productAcc(campaignGroupKey(row.campaignName)).adSpend += spendSek
  }

  // ---------- Custom costs ----------
  const customCosts = await prisma.customCost.findMany({
    where: { teamId, isActive: true, ...(storeId ? { OR: [{ storeId }, { storeId: null }] } : {}) },
    include: { entries: { where: { date: { gte: startInstant, lt: endExclusive } } }, _count: { select: { entries: true } } },
  })

  const addOpex = (acc: Acc, costType: string, name: string, amount: number) => {
    if (costType === 'SALARY') acc.salaries += amount
    else if (costType === 'VARIABLE') acc.variableOpex += amount
    else if (costType === 'ONE_TIME') acc.oneTime += amount
    else acc.fixed += amount
    acc.opexByName[name] = (acc.opexByName[name] ?? 0) + amount
  }

  for (const cost of customCosts) {
    // Dated entries win; a cost with entries is never also spread as recurring
    for (const entry of cost.entries) {
      const b = bucketOf(stockholmDate(entry.date))
      if (b >= 0) addOpex(accs[b], cost.costType, cost.name, n(entry.amount))
    }
    if (cost._count.entries > 0) continue

    if (cost.recurrenceType && cost.amount !== null) {
      const from = cost.recurrenceStart ? stockholmDate(cost.recurrenceStart) : '0000-01-01'
      const to = cost.recurrenceEnd ? stockholmDate(cost.recurrenceEnd) : '9999-12-31'
      buckets.forEach((bucket, i) => {
        const s = bucket.start > from ? bucket.start : from
        const e = bucket.end < to ? bucket.end : to
        if (s > e) return
        const days = daysBetweenInclusive(s, e)
        addOpex(accs[i], cost.costType, cost.name, dailyRate(n(cost.amount), cost.recurrenceType!, bucket.key) * days)
      })
    } else if (cost.occurrenceDate && cost.amount !== null) {
      const b = bucketOf(stockholmDate(cost.occurrenceDate))
      if (b >= 0) addOpex(accs[b], cost.costType, cost.name, n(cost.amount))
    }
  }

  // ---------- Build columns ----------
  const columns = buckets.map((bucket, i) => buildColumn(bucket, accs[i], settings))
  const totalAcc = accs.reduce(mergeAcc, emptyAcc())
  const total = buildColumn(
    {
      key: 'total',
      label: 'Totalt',
      start,
      end,
      partial: false,
    },
    totalAcc,
    settings
  )

  // ---------- Products ----------
  const productKeys = [...PRODUCT_GROUPS.map((g) => g.key), OTHER_GROUP.key, UNALLOCATED_ADS.key]
  const products: ProductRow[] = productKeys
    .filter((key) => productAccs.has(key))
    .map((key) => {
      const p = productAccs.get(key)!
      const net = p.netRevenue - p.refunds
      const tb2 = net - p.cogs - p.fulfillment - p.paymentFees
      const tb3 = tb2 - p.adSpend
      return {
        key,
        name: groupName(key),
        orders: p.orders,
        units: p.units,
        netRevenue: r2(net),
        cogs: r2(p.cogs),
        fulfillment: r2(p.fulfillment),
        paymentFees: r2(p.paymentFees),
        refunds: r2(-p.refunds),
        contributionBeforeMarketing: r2(tb2),
        adSpend: r2(p.adSpend),
        contributionAfterMarketing: r2(tb3),
        marginPct: net !== 0 ? r2((tb3 / net) * 100) : 0,
        cac: p.orders > 0 ? r2(p.adSpend / p.orders) : 0,
        breakEvenCac: p.orders > 0 ? r2(tb2 / p.orders) : 0,
      }
    })
    .sort((a, b) => b.netRevenue - a.netRevenue)

  // ---------- Data quality ----------
  const adAccounts = await prisma.adAccount.findMany({
    where: { teamId, isActive: true },
    select: {
      id: true,
      accountName: true,
      platform: true,
      currency: true,
      spends: { select: { date: true }, orderBy: { date: 'desc' }, take: 1 },
    },
  })
  const lastOrder = await prisma.order.findFirst({
    where: { storeId: { in: storeIds } },
    orderBy: { processedAt: 'desc' },
    select: { processedAt: true },
  })
  const yesterday = addDays(stockholmDate(new Date()), -1)
  const expectedLatest = end < yesterday ? end : yesterday

  const dataQuality: DataQuality = {
    missingCogs: [...missingCogs.entries()]
      .map(([title, m]) => ({ title, ...m }))
      .sort((a, b) => b.units - a.units),
    adAccounts: adAccounts
      .map((a) => {
        const lastDate = a.spends[0]?.date.toISOString().slice(0, 10) ?? null
        return {
          name: a.accountName ?? a.platform,
          platform: PLATFORM_NAMES[a.platform] ?? a.platform,
          currency: a.currency,
          lastDate,
          spend: r2(spendByAccount.get(a.id) ?? 0),
          // Only flag accounts that have ever had spend
          stale: lastDate !== null && lastDate < expectedLatest && lastDate >= addDays(start, -14),
        }
      }),
    noFixedCosts: customCosts.length === 0,
    unknownCurrencies: [...unknownCurrencies],
    lastOrderAt: lastOrder?.processedAt?.toISOString() ?? null,
    ordersWithoutShippingTier,
  }
  return {
    range: { start, end, days: daysBetweenInclusive(start, end) },
    columns,
    total,
    products,
    dataQuality,
    settings,
  }
}

function mergeAcc(a: Acc, b: Acc): Acc {
  const out = emptyAcc()
  for (const k of Object.keys(out) as (keyof Acc)[]) {
    if (k === 'marketingByPlatform' || k === 'opexByName') {
      const merged: Record<string, number> = { ...a[k] }
      for (const [name, v] of Object.entries(b[k])) merged[name] = (merged[name] ?? 0) + v
      out[k] = merged
    } else {
      (out[k] as number) = (a[k] as number) + (b[k] as number)
    }
  }
  return out
}

function buildColumn(bucket: PeriodBucket, a: Acc, settings: PnLSettings): PnLColumn {
  const netRevenue = a.omsattning - a.vat - a.refundsExVat
  const cogsTotal = a.cogsProducts + a.cogsGifts
  const grossProfit = netRevenue - cogsTotal
  const variableTotal = a.fulfillment + a.paymentFees
  const tb2 = grossProfit - variableTotal
  const marketingTotal = Object.values(a.marketingByPlatform).reduce((s, v) => s + v, 0)
  const tb3 = tb2 - marketingTotal
  const opexTotal = a.fixed + a.salaries + a.variableOpex + a.oneTime
  const operatingProfit = tb3 - opexTotal
  const corporateTax = operatingProfit > 0 ? (operatingProfit * settings.corporateTaxPct) / 100 : 0
  const round = (rec: Record<string, number>) => Object.fromEntries(Object.entries(rec).map(([k, v]) => [k, r2(v)]))

  // MER where TB3 = 0: marketing may eat all of TB2
  const tb2ShareOfOmsattning = a.omsattning > 0 ? tb2 / a.omsattning : 0

  return {
    key: bucket.key,
    label: bucket.label,
    start: bucket.start,
    end: bucket.end,
    partial: bucket.partial,
    revenue: {
      grossSales: r2(a.grossSales),
      discounts: r2(-a.discounts),
      shippingRevenue: r2(a.shippingRevenue),
      omsattningInklMoms: r2(a.omsattning),
      vat: r2(-a.vat),
      refunds: r2(-a.refundsExVat),
      netRevenue: r2(netRevenue),
    },
    cogs: { products: r2(-a.cogsProducts), gifts: r2(-a.cogsGifts), total: r2(-cogsTotal) },
    grossProfit: r2(grossProfit),
    variable: { fulfillment: r2(-a.fulfillment), paymentFees: r2(-a.paymentFees), total: r2(-variableTotal) },
    contributionBeforeMarketing: r2(tb2),
    marketing: {
      byPlatform: Object.fromEntries(Object.entries(round(a.marketingByPlatform)).map(([k, v]) => [k, -v])),
      total: r2(-marketingTotal),
    },
    contributionAfterMarketing: r2(tb3),
    opex: {
      fixed: r2(-a.fixed),
      salaries: r2(-a.salaries),
      variable: r2(-a.variableOpex),
      oneTime: r2(-a.oneTime),
      byName: Object.fromEntries(Object.entries(round(a.opexByName)).map(([k, v]) => [k, -v])),
      total: r2(-opexTotal),
    },
    operatingProfit: r2(operatingProfit),
    corporateTax: r2(-corporateTax),
    profitAfterTax: r2(operatingProfit - corporateTax),
    metrics: {
      orders: a.orders,
      units: a.units,
      refundsInklMoms: r2(a.refundsInklMoms),
      refundCount: a.refundCount,
      aovInklMoms: a.orders > 0 ? r2(a.omsattning / a.orders) : 0,
      netRevenuePerOrder: a.orders > 0 ? r2(netRevenue / a.orders) : 0,
      profitPerOrder: a.orders > 0 ? r2(tb3 / a.orders) : 0,
      cac: a.orders > 0 ? r2(marketingTotal / a.orders) : 0,
      mer: marketingTotal > 0 ? r2(a.omsattning / marketingTotal) : 0,
      breakEvenMer: tb2ShareOfOmsattning > 0 ? r2(1 / tb2ShareOfOmsattning) : 0,
      days: daysBetweenInclusive(bucket.start, bucket.end),
    },
  }
}
