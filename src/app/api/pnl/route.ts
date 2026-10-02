import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createSafeResponse, Errors, logError } from '@/lib/errors/safe-error'
import { computePnL } from '@/lib/pnl/engine'
import { addDays, todayStockholm } from '@/lib/pnl/period'
import { getSessionTeamId, loadPnLSettings } from '@/lib/pnl/team'

// ===========================================
// GET /api/pnl?start=YYYY-MM-DD&end=YYYY-MM-DD[&storeId=]
// Dates are Stockholm calendar days, both inclusive. Default: the last three
// calendar months including the current one.
// ===========================================

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const querySchema = z.object({
  start: dateStr.optional(),
  end: dateStr.optional(),
  storeId: z.string().min(1).optional(),
})

export async function GET(request: NextRequest) {
  try {
    const teamId = await getSessionTeamId()
    if (!teamId) return createSafeResponse(Errors.unauthorized())

    const sp = request.nextUrl.searchParams
    const parsed = querySchema.safeParse({
      start: sp.get('start') ?? undefined,
      end: sp.get('end') ?? undefined,
      storeId: sp.get('storeId') ?? undefined,
    })
    if (!parsed.success) {
      return createSafeResponse(Errors.badRequest(`Validation failed: ${parsed.error.issues[0].message}`))
    }

    const today = todayStockholm()
    const end = parsed.data.end ?? today
    let start = parsed.data.start
    if (!start) {
      const [y, m] = end.split('-').map(Number)
      const d = new Date(Date.UTC(y, m - 3, 1))
      start = d.toISOString().slice(0, 10)
    }
    if (start > end) return createSafeResponse(Errors.badRequest('start måste vara före end'))
    if (addDays(start, 731) < end) return createSafeResponse(Errors.badRequest('Max 24 månader per rapport'))

    const settings = await loadPnLSettings(teamId)
    const report = await computePnL({ teamId, storeId: parsed.data.storeId ?? null, start, end, settings })
    return NextResponse.json(report)
  } catch (error) {
    logError(error, { source: 'pnl-report' })
    return createSafeResponse(Errors.internal())
  }
}
