import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createSafeResponse, Errors, logError } from '@/lib/errors/safe-error'
import { getSessionTeamId, loadPnLSettings } from '@/lib/pnl/team'
import { DEFAULT_OFFERS } from '@/lib/offers/defaults'
import { loadOfferActuals } from '@/lib/offers/actuals'
import { offerConfigSchema } from '@/lib/offers/schema'
import { PRODUCT_GROUPS } from '@/lib/pnl/products'

// GET /api/offers – offers + assumptions + shipping tiers + last 30 days actuals.
// Seeds the live offers on first use.
export async function GET() {
  try {
    const teamId = await getSessionTeamId()
    if (!teamId) return createSafeResponse(Errors.unauthorized())

    let offers = await prisma.offer.findMany({ where: { teamId }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] })
    if (offers.length === 0) {
      await prisma.offer.createMany({
        data: DEFAULT_OFFERS.map((o, i) => ({ teamId, name: o.name, sortOrder: i, config: o.config as object })),
      })
      offers = await prisma.offer.findMany({ where: { teamId }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] })
    }

    const store = await prisma.store.findFirst({
      where: { teamId, isActive: true },
      include: { shippingCostTiers: { where: { isActive: true }, orderBy: { minItems: 'asc' } } },
    })
    const shippingTiers = (store?.shippingCostTiers ?? []).map((t) => ({
      name: t.name,
      minItems: t.minItems,
      maxItems: t.maxItems,
      cost: Number(t.cost),
      costPerAdditionalItem: Number(t.costPerAdditionalItem),
      shippingZone: t.shippingZone,
    }))

    const [settings, actuals] = await Promise.all([loadPnLSettings(teamId), loadOfferActuals(teamId, 30)])

    return NextResponse.json({
      offers: offers.map((o) => ({ id: o.id, name: o.name, sortOrder: o.sortOrder, config: o.config, updatedAt: o.updatedAt })),
      settings,
      shippingTiers,
      actuals,
      productGroups: PRODUCT_GROUPS.map((g) => ({ key: g.key, name: g.name })),
    })
  } catch (error) {
    logError(error, { source: 'offers-list' })
    return createSafeResponse(Errors.internal())
  }
}

// POST /api/offers – new offer (e.g. a copy to test a new price ladder)
export async function POST(request: NextRequest) {
  try {
    const teamId = await getSessionTeamId()
    if (!teamId) return createSafeResponse(Errors.unauthorized())
    const body = await request.json()
    const config = offerConfigSchema.safeParse(body.config)
    const name = typeof body.name === 'string' && body.name.trim() ? body.name.trim().slice(0, 120) : null
    if (!config.success || !name) return createSafeResponse(Errors.badRequest('Ogiltigt erbjudande'))
    const count = await prisma.offer.count({ where: { teamId } })
    const offer = await prisma.offer.create({ data: { teamId, name, sortOrder: count, config: config.data as object } })
    return NextResponse.json({ id: offer.id, name: offer.name, sortOrder: offer.sortOrder, config: offer.config, updatedAt: offer.updatedAt })
  } catch (error) {
    logError(error, { source: 'offers-create' })
    return createSafeResponse(Errors.internal())
  }
}
