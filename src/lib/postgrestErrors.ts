/** Postgres undefined_column (42703) from PostgREST — e.g. column not created on hosted DB yet. */
export function isPostgresUndefinedColumn(err: unknown, columnFragment: string): boolean {
  if (err == null || typeof err !== 'object') return false
  const o = err as { code?: string; message?: string }
  if (o.code !== '42703' || typeof o.message !== 'string') return false
  return o.message.includes(columnFragment)
}

export function isMissingArchivedAtColumnError(err: unknown): boolean {
  return isPostgresUndefinedColumn(err, 'archived_at')
}
