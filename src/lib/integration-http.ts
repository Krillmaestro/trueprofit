// Retry only reads (including Google Ads read-only search POSTs). OAuth code
// exchanges are deliberately excluded because authorization codes are single-use.
export async function fetchIntegration(url: string, init: RequestInit = {}): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    const response = await fetch(url, { ...init, cache: 'no-store', signal: AbortSignal.timeout(30_000) })
    if (attempt >= 2 || (response.status !== 429 && response.status < 500)) return response
    const retryAfter = response.headers.get('retry-after')
    const seconds = retryAfter ? Number(retryAfter) : NaN
    const delay = Number.isFinite(seconds) ? Math.min(Math.max(seconds * 1000, 0), 30_000) : 500 * 2 ** attempt
    await response.body?.cancel()
    await new Promise(resolve => setTimeout(resolve, delay))
  }
}
