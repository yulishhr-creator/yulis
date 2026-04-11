/** Normalize Postgres `text` / null from Supabase into a stable string for editing. */
export function normalizeRequirementsText(v: unknown): string {
  if (v == null) return ''
  if (typeof v === 'string') return v
  return ''
}
