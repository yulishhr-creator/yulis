export function formatDue(iso: string | null): string {
  if (!iso) return 'no due date'
  try {
    const d = new Date(iso)
    return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
  } catch {
    return 'no due date'
  }
}
