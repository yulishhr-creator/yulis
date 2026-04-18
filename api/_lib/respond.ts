import type { VercelResponse } from '@vercel/node'

export function parseMissingEnvKey(e: unknown): string | null {
  const msg = e instanceof Error ? e.message : String(e)
  const missing = /^Missing required environment variable: (\w+)$/.exec(msg)
  return missing?.[1] ?? null
}

/** Maps config errors to JSON so production debugging does not require log access. */
export function sendApiError(res: VercelResponse, status: number, e: unknown, fallbackCode: string) {
  const key = parseMissingEnvKey(e)
  if (key) {
    res.status(status).json({ error: fallbackCode, missing_env: key })
    return
  }
  console.error(fallbackCode, e)
  res.status(status).json({ error: fallbackCode })
}
