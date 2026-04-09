/** Normalize Postgres `text[]` / JSON array from Supabase into stable string[]. */
export function normalizeRequirementItemValues(v: unknown): string[] {
  if (!Array.isArray(v)) return []
  return v.filter((x): x is string => typeof x === 'string')
}
