import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { createSafeResponse, Errors, logError } from '@/lib/errors/safe-error'
import { resolvePnLSettings } from '@/lib/pnl/settings'
import { getSessionTeamId, loadPnLSettings } from '@/lib/pnl/team'

// GET/PUT /api/pnl/settings – P&L and offer-calculator assumptions

const pct = z.number().min(0).max(100)
const settingsSchema = z.object({
  paymentFeePct: pct,
  paymentFeeFixed: z.number().min(0).max(1000),
  corporateTaxPct: pct,
  fxToSek: z.record(z.string(), z.number().positive()),
  protectionPrice: z.number().min(0).max(10000),
  protectionAttachPct: pct,
  refundPct: pct,
  targetMarginPct: pct,
}).partial()

export async function GET() {
  const teamId = await getSessionTeamId()
  if (!teamId) return createSafeResponse(Errors.unauthorized())
  return NextResponse.json(await loadPnLSettings(teamId))
}

export async function PUT(request: NextRequest) {
  try {
    const teamId = await getSessionTeamId()
    if (!teamId) return createSafeResponse(Errors.unauthorized())

    const parsed = settingsSchema.safeParse(await request.json())
    if (!parsed.success) {
      return createSafeResponse(Errors.badRequest(`Validation failed: ${parsed.error.issues[0].message}`))
    }
    const current = await loadPnLSettings(teamId)
    const next = resolvePnLSettings({ ...current, ...parsed.data })

    await prisma.teamSettings.upsert({
      where: { teamId },
      create: { teamId, pnlSettings: next as object },
      update: { pnlSettings: next as object },
    })
    return NextResponse.json(next)
  } catch (error) {
    logError(error, { source: 'pnl-settings' })
    return createSafeResponse(Errors.internal())
  }
}
