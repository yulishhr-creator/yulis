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
  if (/archived_at|position_candidates.*column/i.test(m) && /could not find|schema cache|42703/i.test(m))
    return 'The database is missing assignment columns (e.g. archived_at). In Supabase SQL Editor, run supabase/migrations/029_ensure_position_candidates_archived_at.sql, then retry.'
  if (/requirements/i.test(m) && /could not find|schema cache|42703/i.test(m))
    return 'The database is missing positions.requirements. In Supabase SQL Editor, run supabase/migrations/015_positions_requirements_column.sql, then retry.'
  if (/schema cache|could not find.*column/i.test(m))
    return 'The database needs pending migrations applied. In Supabase: run SQL from supabase/migrations (especially 029 if removing candidates fails), then retry or reload schema cache.'
  if (/function public\.ensure_position_public_share_token|42883|does not exist/i.test(m))
    return 'Sharing needs a quick database update. Apply migration031_ensure_position_public_share_token_rpc.sql in Supabase, then retry.'
  if (/rate_limit/i.test(m)) return 'Too many attempts. Please wait a bit and try again.'
  if (/^forbidden$|permission denied|42501/i.test(m)) return 'You do not have access to share this role.'
  if (/position not found/i.test(m)) return 'This role was removed or is unavailable.'
  if (/invalid token|invalid assignment|invalid position|^invalid$/i.test(m)) return 'This link is not valid.'
  if (/violates|constraint|duplicate key|23505/i.test(m)) return 'That value is not allowed or already exists.'
  if (/JWT|session expired|not authenticated/i.test(m)) return 'Please sign in again.'
  if (m.length > 160) return FALLBACK
  return m
}
