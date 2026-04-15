import { Link, useNavigate } from 'react-router-dom'
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
import { CalendarClock, CalendarDays, Pencil, Star, Trash2 } from 'lucide-react'
import { motion, useReducedMotion } from 'framer-motion'
import { useMemo, useState } from 'react'

import { useAuth } from '@/auth/useAuth'
import { useToast } from '@/hooks/useToast'
import { Modal } from '@/components/ui/Modal'
import { getSupabase } from '@/lib/supabase'

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
  candidates: One<{ full_name: string }>
  companies: One<{ name: string }>
}

function one<T>(v: T | T[] | null | undefined): T | null {
  if (v == null) return null
  return Array.isArray(v) ? (v[0] ?? null) : v
}

const EVENT_SELECT = `id, title, subtitle, starts_at, ends_at, reminder_at, is_important, position_id, candidate_id, company_id,
  positions ( title ),
  candidates ( full_name ),
  companies ( name )`

const CAL_STALE_MS = 60_000

function titleDayPreview(title: string, maxChars = 20): string {
  const t = title.trim()
  if (!t) return ''
  if (t.length <= maxChars) return t
  return `${t.slice(0, maxChars - 3).trimEnd()}…`
}

function relationForEvent(ev: CalendarEventRow): { label: string; to: string } | null {
  const company = one(ev.companies)
  const position = one(ev.positions)
  const candidate = one(ev.candidates)
  if (ev.company_id && company) return { label: company.name, to: `/companies/${ev.company_id}` }
  if (ev.position_id && position) return { label: position.title, to: `/positions/${ev.position_id}` }
  if (ev.candidate_id && candidate) return { label: candidate.full_name, to: `/candidates/${ev.candidate_id}` }
  return null
}

function relationLabelOverview(ev: CalendarEventRow): { label: string; to?: string } | null {
  const company = one(ev.companies)
  const position = one(ev.positions)
  const candidate = one(ev.candidates)
  if (ev.company_id) {
    return company ? { label: company.name, to: `/companies/${ev.company_id}` } : { label: 'Company' }
  }
  if (ev.position_id) {
    return position ? { label: position.title, to: `/positions/${ev.position_id}` } : { label: 'Position' }
  }
  if (ev.candidate_id) {
    return candidate ? { label: candidate.full_name, to: `/candidates/${ev.candidate_id}` } : { label: 'Candidate' }
  }
  return null
}

const notifCardClass =
  'border-stitch-on-surface/10 rounded-2xl border-b-4 border-b-[#006384]/60 bg-white p-4 shadow-[0_16px_36px_rgba(48,46,43,0.08)] dark:border-stone-700 dark:bg-stone-900'

export function OverviewCalendarAndEvents() {
  const { user } = useAuth()
  const supabase = getSupabase()
  const uid = user?.id
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { success, error: toastError } = useToast()
  const reduceMotion = useReducedMotion()
  const [cursor, setCursor] = useState(() => startOfMonth(new Date()))
  const [picked, setPicked] = useState<Date | null>(null)

  const monthStart = startOfMonth(cursor)
  const monthEnd = endOfMonth(cursor)
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 0 })
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 0 })

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

  const days = useMemo(() => eachDayOfInterval({ start: gridStart, end: gridEnd }), [gridStart, gridEnd])

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

  function openCreateForPickedDay() {
    if (!picked) return
    const d = format(picked, 'yyyy-MM-dd')
    setPicked(null)
    navigate(`/calendar?new=1&date=${d}`)
  }

  function goEditOnCalendar(ev: CalendarEventRow) {
    setPicked(null)
    navigate('/calendar', { state: { editEventId: ev.id } })
  }

  const upcomingAll = upcomingQ.data ?? []
  const upcomingImportant = upcomingAll.filter((e) => e.is_important)
  const upcomingRest = upcomingAll.filter((e) => !e.is_important)
  const upcomingPreviewLimit = 6
  const upcomingImportantShow = upcomingImportant.slice(0, upcomingPreviewLimit)
  const restSlots = Math.max(0, upcomingPreviewLimit - upcomingImportantShow.length)
  const upcomingRestShow = upcomingRest.slice(0, restSlots)

  return (
    <div className="flex flex-col gap-6">
      <section
        aria-labelledby="overview-calendar-heading"
        className="border-stitch-on-surface/10 rounded-3xl border bg-white/60 p-4 shadow-sm dark:border-stone-700 dark:bg-stone-900/50 md:p-6"
      >
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2
            id="overview-calendar-heading"
            className="text-stitch-on-surface flex items-center gap-2 text-lg font-extrabold md:text-xl dark:text-stone-100"
          >
            <span className="bg-stone-100 text-stitch-on-surface flex h-9 w-9 items-center justify-center rounded-xl dark:bg-stone-800 dark:text-stone-100">
              <CalendarDays className="h-5 w-5" aria-hidden />
            </span>
            Calendar
          </h2>
          <Link
            to="/calendar"
            className="text-accent text-sm font-bold underline-offset-2 hover:underline dark:text-orange-300"
          >
            Full calendar
          </Link>
        </div>

        <div className="mb-4 flex w-full justify-center px-1">
          <div className="flex items-center gap-2 sm:gap-3">
            <button
              type="button"
              className="border-line rounded-xl border px-3 py-2 text-sm font-semibold dark:border-line-dark"
              onClick={() => setCursor((d) => addMonths(d, -1))}
              aria-label="Previous month"
            >
              ←
            </button>
            <span className="text-stitch-on-surface min-w-[11rem] text-center text-base font-semibold sm:min-w-[14rem] sm:text-lg dark:text-stone-100">
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
            const isToday = isSameDay(day, new Date())
            return (
              <button
                key={key}
                type="button"
                onClick={() => setPicked(day)}
                className={`flex min-h-[4.5rem] flex-col rounded-xl border border-stone-200/80 p-1 text-left text-[10px] transition hover:bg-stone-50/90 sm:min-h-[5rem] sm:text-xs dark:border-stone-600 dark:hover:bg-stone-800/50 ${
                  inMonth ? 'bg-white/90 dark:bg-stone-900/60' : 'opacity-40'
                } ${isToday ? 'ring-2 ring-[#006384]/50 dark:ring-cyan-400/45' : ''}`}
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
                      className="truncate leading-tight text-stone-600 dark:text-stone-300"
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
      </section>

      <section
        aria-labelledby="overview-upcoming-events-heading"
        className="border-stitch-on-surface/10 rounded-3xl border bg-white/60 p-4 shadow-sm dark:border-stone-700 dark:bg-stone-900/50 md:p-6"
      >
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2
            id="overview-upcoming-events-heading"
            className="text-ink-muted flex items-center gap-2 text-xs font-bold tracking-[0.2em] uppercase dark:text-stone-400"
          >
            <CalendarClock className="h-4 w-4" aria-hidden />
            Upcoming events
          </h2>
          <Link
            to="/calendar"
            className="text-accent text-xs font-bold underline-offset-2 hover:underline dark:text-orange-300"
          >
            Manage on calendar
          </Link>
        </div>
        <p className="text-stitch-muted text-xs dark:text-stone-500">Starting today, soonest first — like your notification list.</p>

        {upcomingQ.isLoading ? (
          <p className="text-stitch-muted mt-4 text-sm">Loading…</p>
        ) : upcomingAll.length === 0 ? (
          <p className="text-stitch-muted mt-4 text-sm">No upcoming events. Add one from Quick actions or the full calendar.</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {upcomingImportantShow.map((ev, i) => (
              <UpcomingEventNotificationCard key={ev.id} ev={ev} i={i} reduceMotion={reduceMotion} />
            ))}
            {upcomingRestShow.map((ev, i) => (
              <UpcomingEventNotificationCard
                key={ev.id}
                ev={ev}
                i={i + upcomingImportantShow.length}
                reduceMotion={reduceMotion}
              />
            ))}
          </ul>
        )}
        {upcomingAll.length > upcomingPreviewLimit ? (
          <p className="text-stitch-muted mt-3 text-center text-xs">
            <Link to="/calendar" className="text-accent font-semibold underline dark:text-orange-300">
              +{upcomingAll.length - upcomingPreviewLimit} more on calendar
            </Link>
          </p>
        ) : null}
      </section>

      <Modal open={picked !== null} onClose={() => setPicked(null)} title={picked ? format(picked, 'EEEE, MMM d') : ''} size="md">
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
                const rel = relationLabelOverview(ev)
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
                          onClick={() => goEditOnCalendar(ev)}
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

function UpcomingEventNotificationCard({
  ev,
  i,
  reduceMotion,
}: {
  ev: CalendarEventRow
  i: number
  reduceMotion: boolean | null
}) {
  const rel = relationForEvent(ev)
  return (
    <motion.li
      initial={reduceMotion ? false : { opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: reduceMotion ? 0 : i * 0.04 }}
      className={notifCardClass}
    >
      <div className="flex items-start gap-2">
        {ev.is_important ? (
          <Star className="mt-0.5 h-4 w-4 shrink-0 fill-amber-400 text-amber-500" aria-label="Important" />
        ) : (
          <span className="w-4 shrink-0" aria-hidden />
        )}
        <div className="min-w-0 flex-1">
          <p className="text-stitch-on-surface font-bold dark:text-stone-100">{ev.title}</p>
          {ev.subtitle ? <p className="text-stitch-muted mt-1 text-sm dark:text-stone-400">{ev.subtitle}</p> : null}
          <p className="mt-2 text-xs font-semibold tabular-nums text-[#006384] dark:text-cyan-300">
            {format(new Date(ev.starts_at), 'EEE, MMM d · HH:mm')}
            {ev.ends_at ? ` – ${format(new Date(ev.ends_at), 'HH:mm')}` : ''}
          </p>
          {ev.reminder_at ? (
            <p className="text-stitch-muted mt-1 flex items-center gap-1 text-xs dark:text-stone-400">
              <CalendarClock className="h-3.5 w-3.5 shrink-0" aria-hidden />
              Reminder {format(new Date(ev.reminder_at), 'EEE, MMM d · HH:mm')}
            </p>
          ) : null}
          {rel ? (
            <p className="mt-2 text-xs">
              <Link to={rel.to} className="font-semibold text-[#006384] underline-offset-2 hover:underline dark:text-cyan-300">
                {rel.label}
              </Link>
            </p>
          ) : null}
        </div>
      </div>
    </motion.li>
  )
}
