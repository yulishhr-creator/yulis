import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from 'date-fns'
import { Pencil, Star, Trash2 } from 'lucide-react'

import { useAuth } from '@/auth/useAuth'
import { getSupabase } from '@/lib/supabase'
import { Modal } from '@/components/ui/Modal'
import { useToast } from '@/hooks/useToast'

type One<T> = T | T[] | null

type CalendarEventRow = {
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
  candidates: One<{ full_name: string; position_id: string }>
  companies: One<{ name: string }>
}

function one<T>(v: T | T[] | null | undefined): T | null {
  if (v == null) return null
  return Array.isArray(v) ? (v[0] ?? null) : v
}

type RelKind = 'none' | 'position' | 'candidate' | 'company'

const EVENT_SELECT = `id, title, subtitle, starts_at, ends_at, reminder_at, is_important, position_id, candidate_id, company_id,
  positions ( title ),
  candidates ( full_name, position_id ),
  companies ( name )`

const CAL_STALE_MS = 60_000

function titleDayPreview(title: string, maxChars = 22): string {
  const t = title.trim()
  if (!t) return ''
  if (t.length <= maxChars) return t
  return `${t.slice(0, maxChars - 3).trimEnd()}…`
}

function relKindFromRow(ev: Pick<CalendarEventRow, 'position_id' | 'candidate_id' | 'company_id'>): RelKind {
  if (ev.position_id) return 'position'
  if (ev.candidate_id) return 'candidate'
  if (ev.company_id) return 'company'
  return 'none'
}

function toDatetimeLocal(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return format(d, "yyyy-MM-dd'T'HH:mm")
}

export function CalendarPage() {
  const { user } = useAuth()
  const supabase = getSupabase()
  const uid = user?.id
  const qc = useQueryClient()
  const { success, error: toastError } = useToast()
  const [search, setSearchParams] = useSearchParams()
  const [cursor, setCursor] = useState(() => startOfMonth(new Date()))
  const [title, setTitle] = useState('')
  const [subtitle, setSubtitle] = useState('')
  const [startsAt, setStartsAt] = useState(() => format(new Date(), "yyyy-MM-dd'T'HH:mm"))
  const [endsAt, setEndsAt] = useState('')
  const [reminderAt, setReminderAt] = useState('')
  const [relKind, setRelKind] = useState<RelKind>('none')
  const [relId, setRelId] = useState('')
  const [isImportant, setIsImportant] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  const monthStart = startOfMonth(cursor)
  const monthEnd = endOfMonth(cursor)
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 0 })
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 0 })

  const showForm = search.get('new') === '1' || editingId !== null

  const eventsQ = useQuery({
    queryKey: ['calendar-events', uid, gridStart.toISOString(), gridEnd.toISOString()],
    enabled: Boolean(supabase && uid),
    staleTime: CAL_STALE_MS,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const { data, error } = await supabase!
        .from('calendar_events')
        .select(EVENT_SELECT)
        .eq('user_id', uid!)
        .gte('starts_at', gridStart.toISOString())
        .lte('starts_at', gridEnd.toISOString())
        .order('starts_at')
      if (error) throw error
      return (data ?? []) as CalendarEventRow[]
    },
  })

  const upcomingQ = useQuery({
    queryKey: ['calendar-events', 'upcoming', uid],
    enabled: Boolean(supabase && uid),
    staleTime: CAL_STALE_MS,
    queryFn: async () => {
      const from = startOfDay(new Date()).toISOString()
      const { data, error } = await supabase!
        .from('calendar_events')
        .select(EVENT_SELECT)
        .eq('user_id', uid!)
        .gte('starts_at', from)
        .order('starts_at', { ascending: true })
        .limit(40)
      if (error) throw error
      return (data ?? []) as CalendarEventRow[]
    },
  })

  const relationsQ = useQuery({
    queryKey: ['calendar-relations', uid],
    enabled: Boolean(supabase && uid && showForm),
    queryFn: async () => {
      const [pos, cand, comp] = await Promise.all([
        supabase!
          .from('positions')
          .select('id, title')
          .eq('user_id', uid!)
          .is('deleted_at', null)
          .order('title'),
        supabase!
          .from('candidates')
          .select('id, full_name, position_id')
          .eq('user_id', uid!)
          .is('deleted_at', null)
          .order('full_name'),
        supabase!
          .from('companies')
          .select('id, name, status')
          .eq('user_id', uid!)
          .is('deleted_at', null)
          .order('name'),
      ])
      if (pos.error) throw pos.error
      if (cand.error) throw cand.error
      if (comp.error) throw comp.error
      return {
        positions: pos.data ?? [],
        candidates: cand.data ?? [],
        companies: comp.data ?? [],
      }
    },
  })

  const dateFromUrl = search.get('date')

  useEffect(() => {
    if (search.get('new') === '1') setEditingId(null)
  }, [search])

  useEffect(() => {
    if (!dateFromUrl || !/^\d{4}-\d{2}-\d{2}$/.test(dateFromUrl)) return
    if (!editingId) setStartsAt(`${dateFromUrl}T09:00`)
  }, [dateFromUrl, editingId])

  function resetForm() {
    setTitle('')
    setSubtitle('')
    setEndsAt('')
    setReminderAt('')
    setRelKind('none')
    setRelId('')
    setIsImportant(false)
    setEditingId(null)
  }

  function openEdit(ev: CalendarEventRow) {
    setPicked(null)
    setEditingId(ev.id)
    setTitle(ev.title)
    setSubtitle(ev.subtitle ?? '')
    setStartsAt(toDatetimeLocal(ev.starts_at))
    setEndsAt(toDatetimeLocal(ev.ends_at))
    setReminderAt(toDatetimeLocal(ev.reminder_at))
    setIsImportant(ev.is_important)
    const rk = relKindFromRow(ev)
    setRelKind(rk)
    setRelId(
      rk === 'position'
        ? ev.position_id ?? ''
        : rk === 'candidate'
          ? ev.candidate_id ?? ''
          : rk === 'company'
            ? ev.company_id ?? ''
            : '',
    )
  }

  function buildPayload() {
    const startIso = new Date(startsAt).toISOString()
    const endIso = endsAt.trim() ? new Date(endsAt).toISOString() : null
    const remIso = reminderAt.trim() ? new Date(reminderAt).toISOString() : null
    const pid = relKind === 'position' && relId ? relId : null
    const cid = relKind === 'candidate' && relId ? relId : null
    const coid = relKind === 'company' && relId ? relId : null
    return {
      title: title.trim() || 'Event',
      subtitle: subtitle.trim() || null,
      starts_at: startIso,
      ends_at: endIso,
      reminder_at: remIso,
      is_important: isImportant,
      position_id: pid,
      candidate_id: cid,
      company_id: coid,
    }
  }

  const saveEvent = useMutation({
    mutationFn: async (): Promise<{ wasEdit: boolean }> => {
      const wasEdit = Boolean(editingId)
      const payload = buildPayload()
      if (editingId) {
        const { error } = await supabase!.from('calendar_events').update(payload).eq('id', editingId).eq('user_id', uid!)
        if (error) throw error
      } else {
        const { error } = await supabase!.from('calendar_events').insert({
          user_id: uid!,
          ...payload,
        })
        if (error) throw error
      }
      return { wasEdit }
    },
    onSuccess: async ({ wasEdit }) => {
      resetForm()
      success(wasEdit ? 'Event updated' : 'Event added')
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          next.delete('new')
          next.delete('date')
          return next
        },
        { replace: true },
      )
      await qc.invalidateQueries({ queryKey: ['calendar-events'] })
      await qc.invalidateQueries({ queryKey: ['notification-count'] })
      await qc.invalidateQueries({ queryKey: ['notifications-calendar-events'] })
    },
    onError: (e: Error) => toastError(e.message),
  })

  const deleteEvent = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase!.from('calendar_events').delete().eq('id', id).eq('user_id', uid!)
      if (error) throw error
    },
    onSuccess: async () => {
      success('Event deleted')
      await qc.invalidateQueries({ queryKey: ['calendar-events'] })
      await qc.invalidateQueries({ queryKey: ['notification-count'] })
      await qc.invalidateQueries({ queryKey: ['notifications-calendar-events'] })
    },
    onError: (e: Error) => toastError(e.message),
  })

  const days = useMemo(() => eachDayOfInterval({ start: gridStart, end: gridEnd }), [gridStart, gridEnd])

  const [picked, setPicked] = useState<Date | null>(null)

  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalendarEventRow[]>()
    for (const ev of eventsQ.data ?? []) {
      const key = format(new Date(ev.starts_at), 'yyyy-MM-dd')
      const list = map.get(key) ?? []
      list.push(ev)
      map.set(key, list)
    }
    return map
  }, [eventsQ.data])

  const pickedKey = picked ? format(picked, 'yyyy-MM-dd') : null
  const pickedDayEvents = pickedKey ? (eventsByDay.get(pickedKey) ?? []) : []

  function openCreateForPickedDay() {
    if (!picked) return
    const d = format(picked, 'yyyy-MM-dd')
    setPicked(null)
    resetForm()
    setSearchParams({ new: '1', date: d }, { replace: false })
    setStartsAt(`${d}T09:00`)
  }

  const positions = relationsQ.data?.positions ?? []
  const candidates = relationsQ.data?.candidates ?? []
  const companies = relationsQ.data?.companies ?? []

  const upcomingAll = upcomingQ.data ?? []
  const upcomingImportant = upcomingAll.filter((e) => e.is_important)
  const upcomingRest = upcomingAll.filter((e) => !e.is_important)

  function relationLabel(ev: CalendarEventRow): { label: string; to?: string } | null {
    const company = one(ev.companies)
    const position = one(ev.positions)
    const candidate = one(ev.candidates)
    if (ev.company_id) {
      return company ?
          { label: company.name, to: `/companies/${ev.company_id}` }
        : { label: 'Company' }
    }
    if (ev.position_id) {
      return position ?
          { label: position.title, to: `/positions/${ev.position_id}` }
        : { label: 'Position' }
    }
    if (ev.candidate_id) {
      const to = candidate?.position_id ? `/positions/${candidate.position_id}` : undefined
      return candidate ? { label: candidate.full_name, to } : { label: 'Candidate' }
    }
    return null
  }

  function renderEventLine(ev: CalendarEventRow, opts: { showDate?: boolean } = {}) {
    const rel = relationLabel(ev)
    return (
      <li
        key={ev.id}
        className="rounded-xl border border-stone-200/80 px-3 py-2.5 dark:border-stone-600"
      >
        <div className="flex items-start gap-2">
          {ev.is_important ? (
            <Star className="mt-0.5 h-4 w-4 shrink-0 fill-amber-400 text-amber-500" aria-label="Important" />
          ) : (
            <span className="w-4 shrink-0" aria-hidden />
          )}
          <div className="min-w-0 flex-1">
            <p className="font-semibold">{ev.title}</p>
            {ev.subtitle ? <p className="text-ink-muted mt-0.5 text-sm">{ev.subtitle}</p> : null}
            <p className="text-ink-muted mt-1 text-xs tabular-nums">
              {opts.showDate ? format(new Date(ev.starts_at), 'EEE, MMM d · HH:mm') : format(new Date(ev.starts_at), 'HH:mm')}
              {ev.ends_at ? ` – ${format(new Date(ev.ends_at), 'HH:mm')}` : ''}
            </p>
            {ev.reminder_at ? (
              <p className="text-ink-muted mt-1 text-xs">Reminder {format(new Date(ev.reminder_at), 'MMM d · HH:mm')}</p>
            ) : null}
            {rel ? (
              <p className="text-ink-muted mt-1 text-xs">
                {rel.to ? (
                  <Link to={rel.to} className="text-[#006384] font-medium underline-offset-2 hover:underline dark:text-cyan-400">
                    {rel.label}
                  </Link>
                ) : (
                  rel.label
                )}
              </p>
            ) : null}
          </div>
        </div>
      </li>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex w-full justify-center px-1">
        <div className="flex items-center gap-2 sm:gap-3">
          <button
            type="button"
            className="border-line rounded-xl border px-3 py-2 text-sm font-semibold dark:border-line-dark"
            onClick={() => setCursor((d) => addMonths(d, -1))}
            aria-label="Previous month"
          >
            ←
          </button>
          <span className="text-stitch-on-surface min-w-[11rem] text-center text-lg font-semibold sm:min-w-[14rem] sm:text-xl dark:text-stone-100">
            {format(cursor, 'MMMM yyyy')}
          </span>
          <button
            type="button"
            className="border-line rounded-xl border px-3 py-2 text-sm font-semibold dark:border-line-dark"
            onClick={() => setCursor((d) => addMonths(d, 1))}
            aria-label="Next month"
          >
            →
          </button>
        </div>
      </div>

      {showForm ? (
        <form
          className="border-line rounded-2xl border bg-white/80 p-4 dark:border-line-dark dark:bg-stone-900/50 sm:p-5"
          onSubmit={(e) => {
            e.preventDefault()
            saveEvent.mutate()
          }}
        >
          <div className="mb-4 flex flex-col gap-3 border-b border-stone-200/80 pb-4 dark:border-stone-600 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-semibold">{editingId ? 'Edit event' : 'New event'}</p>
              <p className="text-ink-muted mt-0.5 max-w-xl text-xs">
                Two columns on wider screens — times, reminder, and optional CRM link.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setIsImportant((v) => !v)}
              className="self-start rounded-xl p-2 text-stone-500 transition hover:bg-stone-100 sm:self-center dark:hover:bg-stone-800"
              aria-label={isImportant ? 'Unmark important' : 'Mark important'}
              aria-pressed={isImportant}
            >
              <Star className={`h-5 w-5 ${isImportant ? 'fill-amber-400 text-amber-500' : ''}`} />
            </button>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-x-4 sm:gap-y-3">
            <label className="flex min-w-0 flex-col gap-1 text-sm">
              Subject
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="border-line rounded-xl border px-3 py-2 dark:border-line-dark dark:bg-stone-900/50"
                placeholder="e.g. Meet with Dr. Schwartz"
                required
              />
            </label>
            <label className="flex min-w-0 flex-col gap-1 text-sm">
              <span>
                Short description <span className="text-ink-muted font-normal">(optional)</span>
              </span>
              <input
                value={subtitle}
                onChange={(e) => setSubtitle(e.target.value)}
                className="border-line rounded-xl border px-3 py-2 dark:border-line-dark dark:bg-stone-900/50"
                placeholder="A few words…"
              />
            </label>
            <label className="flex min-w-0 flex-col gap-1 text-sm">
              Starts
              <input
                type="datetime-local"
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
                className="border-line rounded-xl border px-3 py-2 dark:border-line-dark dark:bg-stone-900/50"
                required
              />
            </label>
            <label className="flex min-w-0 flex-col gap-1 text-sm">
              <span>
                End <span className="text-ink-muted font-normal">(optional)</span>
              </span>
              <input
                type="datetime-local"
                value={endsAt}
                onChange={(e) => setEndsAt(e.target.value)}
                className="border-line rounded-xl border px-3 py-2 dark:border-line-dark dark:bg-stone-900/50"
              />
            </label>
            <label className="flex min-w-0 flex-col gap-1 text-sm">
              <span>
                Reminder <span className="text-ink-muted font-normal">(optional)</span>
              </span>
              <input
                type="datetime-local"
                value={reminderAt}
                onChange={(e) => setReminderAt(e.target.value)}
                className="border-line rounded-xl border px-3 py-2 dark:border-line-dark dark:bg-stone-900/50"
              />
            </label>
            <div className="flex min-w-0 flex-col gap-1 text-sm">
              <span>
                Related to <span className="text-ink-muted font-normal">(optional)</span>
              </span>
              <select
                value={relKind}
                onChange={(e) => {
                  const v = e.target.value as RelKind
                  setRelKind(v)
                  setRelId('')
                }}
                className="border-line rounded-xl border px-3 py-2 dark:border-line-dark dark:bg-stone-900/50"
              >
                <option value="none">None</option>
                <option value="position">Position</option>
                <option value="candidate">Candidate</option>
                <option value="company">Company</option>
              </select>
            </div>
            {relKind === 'position' ? (
              <label className="flex min-w-0 flex-col gap-1 text-sm sm:col-span-2">
                Position
                <select
                  value={relId}
                  onChange={(e) => setRelId(e.target.value)}
                  className="border-line rounded-xl border px-3 py-2 dark:border-line-dark dark:bg-stone-900/50"
                >
                  <option value="">Select position…</option>
                  {positions.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            {relKind === 'candidate' ? (
              <label className="flex min-w-0 flex-col gap-1 text-sm sm:col-span-2">
                Candidate
                <select
                  value={relId}
                  onChange={(e) => setRelId(e.target.value)}
                  className="border-line rounded-xl border px-3 py-2 dark:border-line-dark dark:bg-stone-900/50"
                >
                  <option value="">Select candidate…</option>
                  {candidates.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.full_name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            {relKind === 'company' ? (
              <label className="flex min-w-0 flex-col gap-1 text-sm sm:col-span-2">
                Company
                <select
                  value={relId}
                  onChange={(e) => setRelId(e.target.value)}
                  className="border-line rounded-xl border px-3 py-2 dark:border-line-dark dark:bg-stone-900/50"
                >
                  <option value="">Select company…</option>
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                      {(c as { status?: string }).status === 'inactive' ? ' (inactive)' : ''}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
          </div>

          <div className="mt-4 flex flex-wrap gap-2 border-t border-stone-200/80 pt-4 dark:border-stone-600">
            <button
              type="submit"
              disabled={saveEvent.isPending}
              className="rounded-full bg-gradient-to-r from-[#9b3e20] to-[#fd8863] px-5 py-2 text-sm font-bold text-white disabled:opacity-60"
            >
              {saveEvent.isPending ? 'Saving…' : editingId ? 'Save changes' : 'Save event'}
            </button>
            <button
              type="button"
              className="border-line rounded-full border px-5 py-2 text-sm font-semibold dark:border-line-dark"
              onClick={() => {
                resetForm()
                setSearchParams(
                  (prev) => {
                    const next = new URLSearchParams(prev)
                    next.delete('new')
                    next.delete('date')
                    return next
                  },
                  { replace: true },
                )
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : null}

      <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-bold tracking-wide uppercase text-stone-500 dark:text-stone-400">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
          <div key={d} className="py-1">
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {days.map((day) => {
          const key = format(day, 'yyyy-MM-dd')
          const dayEvents = eventsByDay.get(key) ?? []
          const inMonth = isSameMonth(day, cursor)
          const isPick = picked && isSameDay(day, picked)
          return (
            <button
              key={key}
              type="button"
              onClick={() => setPicked(day)}
              className={`flex min-h-[5.25rem] flex-col rounded-xl border p-1 text-left text-[10px] transition sm:text-xs ${
                inMonth ? 'bg-white/90 dark:bg-stone-900/60' : 'opacity-40'
              } ${isPick ? 'ring-2 ring-[#9b3e20] dark:ring-orange-400' : 'border-stone-200/80 dark:border-stone-600'}`}
            >
              <span className="flex items-center gap-0.5 font-semibold tabular-nums">
                {format(day, 'd')}
                {dayEvents.some((e) => e.is_important) ? (
                  <Star className="h-2.5 w-2.5 fill-amber-400 text-amber-500" aria-hidden />
                ) : null}
              </span>
              <div className="mt-0.5 flex min-h-0 flex-1 flex-col gap-0.5 overflow-hidden">
                {dayEvents.slice(0, 2).map((ev) => (
                  <span
                    key={ev.id}
                    className="truncate text-stone-600 leading-tight dark:text-stone-300"
                    title={ev.title}
                  >
                    {titleDayPreview(ev.title)}
                  </span>
                ))}
                {dayEvents.length > 2 ? (
                  <span className="text-[9px] text-stone-500">+{dayEvents.length - 2} more</span>
                ) : null}
              </div>
            </button>
          )
        })}
      </div>

      <section aria-labelledby="upcoming-events-heading" className="border-line rounded-2xl border bg-white/80 p-4 dark:border-line-dark dark:bg-stone-900/50">
        <h2 id="upcoming-events-heading" className="text-lg font-extrabold text-[#302e2b] dark:text-stone-100">
          Upcoming
        </h2>
        <p className="text-stitch-muted mt-1 text-xs dark:text-stone-400">From today onward, soonest first.</p>
        {upcomingQ.isLoading ? (
          <p className="text-ink-muted mt-3 text-sm">Loading…</p>
        ) : upcomingAll.length === 0 ? (
          <p className="text-ink-muted mt-3 text-sm">No upcoming events. Add one from a day or Quick actions.</p>
        ) : (
          <div className="mt-3 space-y-6">
            {upcomingImportant.length > 0 ? (
              <div>
                <h3 className="text-ink-muted mb-2 text-[11px] font-bold uppercase tracking-[0.18em] text-[#9b3e20] dark:text-orange-400">
                  Important events
                </h3>
                <ul className="space-y-2">{upcomingImportant.map((ev) => renderEventLine(ev, { showDate: true }))}</ul>
              </div>
            ) : null}
            <div>
              <h3 className="text-ink-muted mb-2 text-[11px] font-bold uppercase tracking-[0.18em]">Upcoming events</h3>
              {upcomingRest.length === 0 ? (
                <p className="text-ink-muted text-sm">No other upcoming events.</p>
              ) : (
                <ul className="space-y-2">{upcomingRest.map((ev) => renderEventLine(ev, { showDate: true }))}</ul>
              )}
            </div>
          </div>
        )}
      </section>

      <Modal
        open={picked !== null}
        onClose={() => setPicked(null)}
        title={picked ? format(picked, 'EEEE, MMM d') : ''}
        size="md"
      >
        <div className="flex flex-col gap-3">
          {pickedDayEvents.length === 0 ? (
            <>
              <p className="text-ink-muted text-sm">Nothing here yet.</p>
              <button
                type="button"
                className="w-full rounded-full bg-gradient-to-r from-[#9b3e20] to-[#fd8863] py-2.5 text-sm font-bold text-white"
                onClick={openCreateForPickedDay}
              >
                Create event
              </button>
            </>
          ) : (
            <ul className="space-y-3 text-sm">
              {pickedDayEvents.map((ev) => {
                const rel = relationLabel(ev)
                return (
                  <li key={ev.id} className="rounded-xl border border-stone-200/80 px-3 py-2 dark:border-stone-600">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          {ev.is_important ? (
                            <Star className="h-3.5 w-3.5 shrink-0 fill-amber-400 text-amber-500" aria-label="Important" />
                          ) : null}
                          <p className="font-semibold">{ev.title}</p>
                        </div>
                        {ev.subtitle ? <p className="text-ink-muted mt-0.5 text-xs">{ev.subtitle}</p> : null}
                        <p className="text-ink-muted mt-1 text-xs tabular-nums">
                          {format(new Date(ev.starts_at), 'HH:mm')}
                          {ev.ends_at ? ` – ${format(new Date(ev.ends_at), 'HH:mm')}` : ''}
                        </p>
                        {ev.reminder_at ? (
                          <p className="text-ink-muted mt-1 text-xs">
                            Reminder {format(new Date(ev.reminder_at), 'HH:mm')}
                          </p>
                        ) : null}
                        {rel ? (
                          <p className="text-ink-muted mt-1 text-xs">
                            {rel.to ? (
                              <Link
                                to={rel.to}
                                className="text-[#006384] font-medium underline-offset-2 hover:underline dark:text-cyan-400"
                              >
                                {rel.label}
                              </Link>
                            ) : (
                              rel.label
                            )}
                          </p>
                        ) : null}
                      </div>
                      <div className="flex shrink-0 gap-0.5">
                        <button
                          type="button"
                          className="rounded-lg p-2 text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800"
                          aria-label="Edit event"
                          onClick={() => openEdit(ev)}
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          className="rounded-lg p-2 text-stone-500 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40 dark:hover:text-red-400"
                          aria-label="Delete event"
                          disabled={deleteEvent.isPending}
                          onClick={() => {
                            if (window.confirm('Delete this event?')) deleteEvent.mutate(ev.id)
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
          {pickedDayEvents.length > 0 ? (
            <button
              type="button"
              className="border-line w-full rounded-full border py-2 text-sm font-bold dark:border-stone-600"
              onClick={openCreateForPickedDay}
            >
              Create event
            </button>
          ) : null}
        </div>
      </Modal>
    </div>
  )
}
