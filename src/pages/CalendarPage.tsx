import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
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

import { useAuth } from '@/auth/useAuth'
import { getSupabase } from '@/lib/supabase'
import { Modal } from '@/components/ui/Modal'
import { useToast } from '@/hooks/useToast'
import { useSearchParams } from 'react-router-dom'

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

  const monthStart = startOfMonth(cursor)
  const monthEnd = endOfMonth(cursor)
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 0 })
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 0 })

  const eventsQ = useQuery({
    queryKey: ['calendar-events', uid, gridStart.toISOString(), gridEnd.toISOString()],
    enabled: Boolean(supabase && uid),
    queryFn: async () => {
      const { data, error } = await supabase!
        .from('calendar_events')
        .select('id, title, subtitle, starts_at, ends_at')
        .eq('user_id', uid!)
        .gte('starts_at', gridStart.toISOString())
        .lte('starts_at', gridEnd.toISOString())
        .order('starts_at')
      if (error) throw error
      return data ?? []
    },
  })

  const upcomingQ = useQuery({
    queryKey: ['calendar-events', 'upcoming', uid],
    enabled: Boolean(supabase && uid),
    queryFn: async () => {
      const from = startOfDay(new Date()).toISOString()
      const { data, error } = await supabase!
        .from('calendar_events')
        .select('id, title, subtitle, starts_at, ends_at')
        .eq('user_id', uid!)
        .gte('starts_at', from)
        .order('starts_at', { ascending: true })
        .limit(40)
      if (error) throw error
      return data ?? []
    },
  })

  const addEvent = useMutation({
    mutationFn: async () => {
      const startIso = new Date(startsAt).toISOString()
      const endIso = endsAt.trim() ? new Date(endsAt).toISOString() : null
      const { error } = await supabase!.from('calendar_events').insert({
        user_id: uid!,
        title: title.trim() || 'Event',
        subtitle: subtitle.trim() || null,
        starts_at: startIso,
        ends_at: endIso,
      })
      if (error) throw error
    },
    onSuccess: async () => {
      setTitle('')
      setSubtitle('')
      setEndsAt('')
      success('Event added')
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
    },
    onError: (e: Error) => toastError(e.message),
  })

  const showForm = search.get('new') === '1'
  const dateFromUrl = search.get('date')

  useEffect(() => {
    if (!dateFromUrl || !/^\d{4}-\d{2}-\d{2}$/.test(dateFromUrl)) return
    setStartsAt(`${dateFromUrl}T09:00`)
  }, [dateFromUrl])

  const days = useMemo(() => eachDayOfInterval({ start: gridStart, end: gridEnd }), [gridStart, gridEnd])

  const [picked, setPicked] = useState<Date | null>(null)

  const eventsByDay = useMemo(() => {
    const map = new Map<string, NonNullable<typeof eventsQ.data>>()
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
    setSearchParams({ new: '1', date: d }, { replace: false })
    setStartsAt(`${d}T09:00`)
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
          <span className="font-stitch-head min-w-[11rem] text-center text-lg font-extrabold sm:min-w-[14rem] sm:text-xl">
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
          className="border-line flex flex-col gap-3 rounded-2xl border bg-white/80 p-4 dark:border-line-dark dark:bg-stone-900/50"
          onSubmit={(e) => {
            e.preventDefault()
            addEvent.mutate()
          }}
        >
          <p className="font-semibold">New event</p>
          <p className="text-ink-muted text-xs">Date and time, subject, and a short note. Optional end time.</p>
          <label className="flex flex-col gap-1 text-sm">
            Subject
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="border-line rounded-xl border px-3 py-2 dark:border-line-dark dark:bg-stone-900/50"
              placeholder="e.g. Call with client"
              required
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Short description <span className="text-ink-muted font-normal">(optional)</span>
            <input
              value={subtitle}
              onChange={(e) => setSubtitle(e.target.value)}
              className="border-line rounded-xl border px-3 py-2 dark:border-line-dark dark:bg-stone-900/50"
              placeholder="A few words…"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Date &amp; time
            <input
              type="datetime-local"
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
              className="border-line rounded-xl border px-3 py-2 dark:border-line-dark dark:bg-stone-900/50"
              required
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            End <span className="text-ink-muted font-normal">(optional)</span>
            <input
              type="datetime-local"
              value={endsAt}
              onChange={(e) => setEndsAt(e.target.value)}
              className="border-line rounded-xl border px-3 py-2 dark:border-line-dark dark:bg-stone-900/50"
            />
          </label>
          <button
            type="submit"
            disabled={addEvent.isPending}
            className="w-fit rounded-full bg-gradient-to-r from-[#9b3e20] to-[#fd8863] px-5 py-2 text-sm font-bold text-white disabled:opacity-60"
          >
            {addEvent.isPending ? 'Saving…' : 'Save event'}
          </button>
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
              className={`flex min-h-[4.5rem] flex-col rounded-xl border p-1 text-left text-xs transition ${
                inMonth ? 'bg-white/90 dark:bg-stone-900/60' : 'opacity-40'
              } ${isPick ? 'ring-2 ring-[#9b3e20] dark:ring-orange-400' : 'border-stone-200/80 dark:border-stone-600'}`}
            >
              <span className="font-semibold tabular-nums">{format(day, 'd')}</span>
              <span className="mt-1 flex flex-wrap gap-0.5">
                {dayEvents.slice(0, 3).map((ev) => (
                  <span
                    key={ev.id}
                    className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#006384] dark:bg-cyan-400"
                    title={ev.title}
                  />
                ))}
                {dayEvents.length > 3 ? <span className="text-[9px] text-stone-500">+{dayEvents.length - 3}</span> : null}
              </span>
            </button>
          )
        })}
      </div>

      <section aria-labelledby="upcoming-events-heading" className="border-line rounded-2xl border bg-white/80 p-4 dark:border-line-dark dark:bg-stone-900/50">
        <h2 id="upcoming-events-heading" className="font-stitch-head text-lg font-extrabold text-[#302e2b] dark:text-stone-100">
          Upcoming events
        </h2>
        <p className="text-stitch-muted mt-1 text-xs dark:text-stone-400">Soonest first — from today onward.</p>
        {upcomingQ.isLoading ? (
          <p className="text-ink-muted mt-3 text-sm">Loading…</p>
        ) : (upcomingQ.data ?? []).length === 0 ? (
          <p className="text-ink-muted mt-3 text-sm">No upcoming events. Add one from a day or Quick actions.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {(upcomingQ.data ?? []).map((ev) => (
              <li
                key={ev.id}
                className="rounded-xl border border-stone-200/80 px-3 py-2.5 dark:border-stone-600"
              >
                <p className="font-semibold">{ev.title}</p>
                {ev.subtitle ? <p className="text-ink-muted mt-0.5 text-sm">{ev.subtitle}</p> : null}
                <p className="text-ink-muted mt-1 text-xs tabular-nums">
                  {format(new Date(ev.starts_at), 'EEE, MMM d · HH:mm')}
                  {ev.ends_at ? ` – ${format(new Date(ev.ends_at), 'HH:mm')}` : ''}
                </p>
              </li>
            ))}
          </ul>
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
              {pickedDayEvents.map((ev) => (
                <li key={ev.id} className="rounded-xl border border-stone-200/80 px-3 py-2 dark:border-stone-600">
                  <p className="font-semibold">{ev.title}</p>
                  {ev.subtitle ? <p className="text-ink-muted mt-0.5 text-xs">{ev.subtitle}</p> : null}
                  <p className="text-ink-muted mt-1 text-xs tabular-nums">
                    {format(new Date(ev.starts_at), 'HH:mm')}
                    {ev.ends_at ? ` – ${format(new Date(ev.ends_at), 'HH:mm')}` : ''}
                  </p>
                </li>
              ))}
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
