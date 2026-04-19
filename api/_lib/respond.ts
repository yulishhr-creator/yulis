import type { VercelResponse } from '@vercel/node'

export function parseMissingEnvKey(e: unknown): string | null {
  const msg = e instanceof Error ? e.message : String(e)
  const missing = /^Missing required environment variable: (\w+)$/.exec(msg)
  return missing?.[1] ?? null
}

function hasHeadersSent(res: VercelResponse): boolean {
  return 'headersSent' in res && Boolean((res as { headersSent?: boolean }).headersSent)
}

/** Maps config errors to JSON so production debugging does not require log access. */
export function sendApiError(res: VercelResponse, status: number, e: unknown, fallbackCode: string) {
  try {
    const key = parseMissingEnvKey(e)
    if (key) {
      if (!hasHeadersSent(res)) {
        res.status(status).json({ error: fallbackCode, missing_env: key })
      }
      return
    }
    console.error(fallbackCode, e)
    if (!hasHeadersSent(res)) {
      res.status(status).json({ error: fallbackCode })
    }
  } catch (sendErr) {
    console.error('sendApiError failed', sendErr, e)
    if (hasHeadersSent(res)) return
    const body = JSON.stringify({ error: fallbackCode })
    res.statusCode = status
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.end(body)
  }
}
