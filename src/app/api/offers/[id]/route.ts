import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createSafeResponse, Errors, logError } from '@/lib/errors/safe-error'
import { getSessionTeamId } from '@/lib/pnl/team'
import { offerConfigSchema } from '@/lib/offers/schema'

// PUT /api/offers/:id – save name/config
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const teamId = await getSessionTeamId()
    if (!teamId) return createSafeResponse(Errors.unauthorized())
    const { id } = await params
    const existing = await prisma.offer.findFirst({ where: { id, teamId } })
    if (!existing) return createSafeResponse(Errors.notFound('offer'))

    const body = await request.json()
    const config = offerConfigSchema.safeParse(body.config)
    if (!config.success) return createSafeResponse(Errors.badRequest(`Ogiltigt erbjudande: ${config.error.issues[0].message}`))
    const name = typeof body.name === 'string' && body.name.trim() ? body.name.trim().slice(0, 120) : existing.name

    const offer = await prisma.offer.update({ where: { id }, data: { name, config: config.data as object } })
    return NextResponse.json({ id: offer.id, name: offer.name, sortOrder: offer.sortOrder, config: offer.config, updatedAt: offer.updatedAt })
  } catch (error) {
    logError(error, { source: 'offers-update' })
    return createSafeResponse(Errors.internal())
  }
}

// DELETE /api/offers/:id
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const teamId = await getSessionTeamId()
    if (!teamId) return createSafeResponse(Errors.unauthorized())
    const { id } = await params
    const result = await prisma.offer.deleteMany({ where: { id, teamId } })
    if (result.count === 0) return createSafeResponse(Errors.notFound('offer'))
    return NextResponse.json({ ok: true })
  } catch (error) {
    logError(error, { source: 'offers-delete' })
    return createSafeResponse(Errors.internal())
  }
}
