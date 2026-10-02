import { z } from 'zod'

const money = z.number().min(0).max(1_000_000)

export const offerConfigSchema = z.object({
  productGroup: z.string().max(50),
  unitCogs: money,
  vatPct: z.number().min(0).max(100),
  bookSharePct: z.number().min(0).max(100),
  notes: z.string().max(2000).optional(),
  tiers: z.array(z.object({
    id: z.string().min(1).max(50),
    label: z.string().max(80),
    qty: z.number().int().min(1).max(100),
    price: money,
    compareAt: money.nullable(),
    shippingCharged: money,
    mixPct: z.number().min(0).max(100),
    gifts: z.array(z.object({
      name: z.string().max(120),
      qty: z.number().int().min(0).max(100),
      unitCost: money.nullable(),
      physical: z.boolean(),
    })).max(20),
  })).min(1).max(12),
})
