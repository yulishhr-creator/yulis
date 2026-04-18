import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

const SEP = '|'
const MAX_AGE_MS = 15 * 60 * 1000

export function createOAuthState(secret: string, userId: string): string {
  const ts = Date.now()
  const nonce = randomBytes(16).toString('hex')
  const payload = `${userId}${SEP}${ts}${SEP}${nonce}`
  const sig = createHmac('sha256', secret).update(payload).digest('base64url')
  const combined = `${payload}.${sig}`
  return Buffer.from(combined, 'utf8').toString('base64url')
}

export function parseOAuthState(secret: string, encoded: string): { userId: string } | null {
  let combined: string
  try {
    combined = Buffer.from(encoded, 'base64url').toString('utf8')
  } catch {
    return null
  }
  const dot = combined.lastIndexOf('.')
  if (dot <= 0) return null
  const payload = combined.slice(0, dot)
  const sig = combined.slice(dot + 1)
  const expected = createHmac('sha256', secret).update(payload).digest('base64url')
  const a = Buffer.from(sig, 'utf8')
  const b = Buffer.from(expected, 'utf8')
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null

  const parts = payload.split(SEP)
  if (parts.length !== 3) return null
  const [userId, tsStr] = parts
  const ts = Number(tsStr)
  if (!userId || !Number.isFinite(ts) || Date.now() - ts > MAX_AGE_MS) return null
  return { userId }
}
