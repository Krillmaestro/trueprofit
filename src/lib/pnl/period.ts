// ===========================================
// Calendar periods in Europe/Stockholm
// ===========================================
//
// Orders are stored with UTC timestamps. A Swedish month starts at local
// midnight, i.e. 22:00 or 23:00 UTC the day before. Ad spend is stored as a
// plain date (00:00 UTC = the ad account's local day), so it is filtered by
// date string, not by instant.

export const TIMEZONE = 'Europe/Stockholm'

const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'Maj', 'Jun',
  'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dec',
]

/** Offset in ms between Stockholm wall time and UTC at the given instant. */
function stockholmOffsetMs(instant: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TIMEZONE,
    hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(instant)
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value)
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'))
  return asUtc - instant.getTime()
}

/** UTC instant of 00:00 Stockholm time on the given calendar date. */
export function stockholmMidnight(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number)
  const guess = Date.UTC(y, m - 1, d)
  const first = guess - stockholmOffsetMs(new Date(guess))
  // Second pass handles the DST switch day
  return new Date(guess - stockholmOffsetMs(new Date(first)))
}

/** Calendar date (YYYY-MM-DD) in Stockholm for an instant. */
export function stockholmDate(instant: Date): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: TIMEZONE }).format(instant)
}

export function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}

export function daysBetweenInclusive(start: string, end: string): number {
  return Math.round((Date.parse(end) - Date.parse(start)) / 86_400_000) + 1
}

export function daysInMonth(monthKey: string): number {
  const [y, m] = monthKey.split('-').map(Number)
  return new Date(Date.UTC(y, m, 0)).getUTCDate()
}

export interface PeriodBucket {
  key: string        // YYYY-MM
  label: string      // "Sep 2026", or "Okt 2026 (1–2/10)" when partial
  start: string      // YYYY-MM-DD, inclusive
  end: string        // YYYY-MM-DD, inclusive
  partial: boolean   // the range does not cover the whole month
}

/** Split an inclusive date range into calendar-month buckets. */
export function monthBuckets(start: string, end: string): PeriodBucket[] {
  const buckets: PeriodBucket[] = []
  let cursor = start
  while (cursor <= end) {
    const [y, m] = cursor.split('-').map(Number)
    const key = `${y}-${String(m).padStart(2, '0')}`
    const monthEnd = `${key}-${String(daysInMonth(key)).padStart(2, '0')}`
    const bucketEnd = monthEnd < end ? monthEnd : end
    const partial = cursor !== `${key}-01` || bucketEnd !== monthEnd
    const startDay = Number(cursor.slice(8, 10))
    const endDay = Number(bucketEnd.slice(8, 10))
    buckets.push({
      key,
      label: `${MONTH_NAMES[m - 1]} ${y}${partial ? ` (${startDay}–${endDay}/${m})` : ''}`,
      start: cursor,
      end: bucketEnd,
      partial,
    })
    cursor = addDays(monthEnd, 1)
  }
  return buckets
}

export function todayStockholm(): string {
  return stockholmDate(new Date())
}
