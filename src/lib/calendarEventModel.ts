import { format } from 'date-fns'

export type One<T> = T | T[] | null

export type CalendarEventRow = {
  id: string
  title: string
  subtitle: string | null
  starts_at: string
  ends_at: string | null
  reminder_at: string | null
  is_important: boolean
  position_id: string | null
  candidate_id: string | null
  company_id: string | null
  positions: One<{ title: string }>
  candidates: One<{ full_name: string }>
  companies: One<{ name: string }>
}

export function one<T>(v: T | T[] | null | undefined): T | null {
  if (v == null) return null
  return Array.isArray(v) ? (v[0] ?? null) : v
}

export const CALENDAR_EVENT_SELECT = `id, title, subtitle, starts_at, ends_at, reminder_at, is_important, position_id, candidate_id, company_id,
  positions ( title ),
  candidates ( full_name ),
  companies ( name )`

export type RelKind = 'none' | 'position' | 'candidate' | 'company'

export function relKindFromRow(ev: Pick<CalendarEventRow, 'position_id' | 'candidate_id' | 'company_id'>): RelKind {
  if (ev.position_id) return 'position'
  if (ev.candidate_id) return 'candidate'
  if (ev.company_id) return 'company'
  return 'none'
}

export function toDatetimeLocal(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return format(d, "yyyy-MM-dd'T'HH:mm")
}
