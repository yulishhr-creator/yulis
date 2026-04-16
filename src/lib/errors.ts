const FALLBACK = 'Something went wrong. Try again.'

/** Map Supabase / RPC errors to short, user-safe copy (avoid leaking SQL/constraint text). */
export function mapUserFacingError(err: unknown): string {
  const raw =
    typeof err === 'string'
      ? err
      : err instanceof Error
        ? err.message
        : typeof err === 'object' && err !== null && 'message' in err && typeof (err as { message: unknown }).message === 'string'
          ? String((err as { message: string }).message)
          : ''
  const m = raw.trim()
  if (!m) return FALLBACK
  if (/rate_limit/i.test(m)) return 'Too many attempts. Please wait a bit and try again.'
  if (/invalid token|invalid assignment|invalid position|^invalid$/i.test(m)) return 'This link is not valid.'
  if (/violates|constraint|duplicate key|23505/i.test(m)) return 'That value is not allowed or already exists.'
  if (/JWT|session expired|not authenticated/i.test(m)) return 'Please sign in again.'
  if (m.length > 160) return FALLBACK
  return m
}
