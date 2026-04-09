/** Human-readable tracked time, e.g. `5h 20s`, `1h 30m`, `45s`. */
export function formatWorkedDuration(totalSeconds: number): string {
  const sec = Math.max(0, Math.floor(totalSeconds))
  if (sec === 0) return '0s'
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = sec % 60
  const parts: string[] = []
  if (h > 0) parts.push(`${h}h`)
  if (m > 0) parts.push(`${m}m`)
  if (s > 0 || parts.length === 0) parts.push(`${s}s`)
  return parts.join(' ')
}
