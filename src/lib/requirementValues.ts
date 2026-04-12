/** Normalize Postgres `text` / null from Supabase into a stable string for editing. */
export function normalizeRequirementsText(v: unknown): string {
  if (v == null) return ''
  if (typeof v === 'string') return v
  return ''
}

/** Split client brief prose into tokens (matches legacy DB migrations). */
export function parseRequirementTokens(text: string): string[] {
  return text
    .split(/[\n,;|]+/)
    .map((s) => s.trim())
    .filter(Boolean)
}

/** PostgREST error when `positions.requirements` was dropped (migration 009) but 011 not applied. */
export function isMissingRequirementsColumnError(message: string): boolean {
  return (
    message.includes('requirements') &&
    (message.includes('schema cache') || message.includes('column') || message.includes('does not exist'))
  )
}
