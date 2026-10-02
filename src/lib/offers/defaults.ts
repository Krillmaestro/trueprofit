// ===========================================
// The live ApotekHunden offers, read from the orders 15 sep – 2 okt 2026
// ===========================================
//
// Seeded into the offers table the first time the Offers page is opened.
// After that the database is the source of truth – edit in the UI.
//
// Prices are what the customer pays (inkl. moms). 1 burk 399 + 49 kr frakt,
// 2 burkar 719 och 3 burkar 999 med fri frakt. Probiotika books 170.91 kr of
// every 399 as the e-bok "Svenska Guiden Till En Klådfri Hund" at 6 % moms.
// COGS = Fluffy invoices 47/09/2026 + ZAM411 incl. inbound freight (30 sep 2026).
// Belöningsbitar+ Kalkon and Tandstensskrapa have no known cost yet (null).

import type { OfferConfig, OfferGift, OfferTier } from './calc'

const kalkon = (qty: number): OfferGift => ({ name: 'Belöningsbitar+ Kalkon', qty, unitCost: null, physical: true })
const ebok = (name: string): OfferGift => ({ name, qty: 1, unitCost: 0, physical: false })
const munKit = (bookName: string): OfferGift[] => [
  ebok(bookName),
  { name: 'FingerBorste (kit)', qty: 1, unitCost: 4.84, physical: true },
  { name: 'Tandstensskrapa (kit)', qty: 1, unitCost: null, physical: true },
]

function standardTiers(opts: {
  unitPrice?: number
  compareAt?: number | null
  gifts2?: OfferGift[]
  gifts3?: OfferGift[]
  gifts1?: OfferGift[]
  mix: [number, number, number]
  price2?: number
  price3?: number
}): OfferTier[] {
  const unit = opts.unitPrice ?? 399
  const cmp = opts.compareAt === undefined ? 449 : opts.compareAt
  return [
    { id: 't1', label: '1 burk', qty: 1, price: unit, compareAt: cmp, shippingCharged: 49, gifts: opts.gifts1 ?? [], mixPct: opts.mix[0] },
    { id: 't2', label: '2 burkar', qty: 2, price: opts.price2 ?? 719, compareAt: cmp ? cmp * 2 : null, shippingCharged: 0, gifts: opts.gifts2 ?? [kalkon(1)], mixPct: opts.mix[1] },
    { id: 't3', label: '3 burkar', qty: 3, price: opts.price3 ?? 999, compareAt: cmp ? cmp * 3 : null, shippingCharged: 0, gifts: opts.gifts3 ?? [kalkon(2)], mixPct: opts.mix[2] },
  ]
}

export const DEFAULT_OFFERS: Array<{ name: string; config: OfferConfig }> = [
  {
    name: 'Probiotika',
    config: {
      productGroup: 'probiotika',
      unitCogs: 64.9,
      vatPct: 25,
      bookSharePct: 42.84,
      tiers: standardTiers({ mix: [55, 38, 7] }),
      notes: 'E-boken "Svenska Guiden Till En Klådfri Hund" ingår i priset (170,91 kr av 399 kr, 6 % moms).',
    },
  },
  {
    name: 'Quercetin+ (Klåda & Allergi)',
    config: {
      productGroup: 'allergi',
      unitCogs: 84.96,
      vatPct: 25,
      bookSharePct: 0,
      tiers: standardTiers({ compareAt: 499, mix: [70, 24, 6] }),
    },
  },
  {
    name: 'Munhälsa+ (hund & katt)',
    config: {
      productGroup: 'munhalsa',
      unitCogs: 76.24,
      vatPct: 25,
      bookSharePct: 0,
      tiers: standardTiers({
        gifts1: [ebok('E-bok Tandvårdsguiden (ingår)')],
        gifts2: munKit('E-bok Tandvårdsguiden (ingår)'),
        gifts3: munKit('E-bok Tandvårdsguiden (ingår)'),
        mix: [73, 25, 2],
      }),
      notes: 'Tandvårdskitet (fingerborste + tandstensskrapa) ingår endast vid 2+ burkar. E-boken ingår alltid.',
    },
  },
  {
    name: 'Rörelse+',
    config: {
      productGroup: 'led',
      unitCogs: 72.61,
      vatPct: 25,
      bookSharePct: 0,
      tiers: standardTiers({ mix: [61, 27, 12] }),
    },
  },
  {
    name: 'Skin & Coat',
    config: {
      productGroup: 'skin',
      unitCogs: 56.97,
      vatPct: 25,
      bookSharePct: 0,
      tiers: standardTiers({ unitPrice: 359, compareAt: null, price2: 575, mix: [55, 45, 0] }).slice(0, 2),
      notes: 'Bara 1- och 2-pack syns i ordrarna (359 / 575).',
    },
  },
  {
    name: 'Relax+',
    config: {
      productGroup: 'calming',
      unitCogs: 57.54,
      vatPct: 25,
      bookSharePct: 0,
      tiers: standardTiers({ mix: [100, 0, 0] }),
      notes: '2- och 3-pack är antagna enligt standardstegen 719/999 – inte verifierade mot ordrar.',
    },
  },
]
