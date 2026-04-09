import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfWeek,
} from 'date-fns'

import { useAuth } from '@/auth/useAuth'
import { getSupabase } from '@/lib/supabase'
import { ScreenHeader } from '@/components/layout/ScreenHeader'
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
    queryKey: ['calendar-events', uid, format(monthStart, 'yyyy-MM')],
    enabled: Boolean(supabase && uid),
    queryFn: async () => {
      const { data, error } = await supabase!
        .from('calendar_events')
        .select('id, title, subtitle, starts_at, ends_at')
        .eq('user_id', uid!)
        .gte('starts_at', monthStart.toISOString())
        .lte('starts_at', monthEnd.toISOString())
        .order('starts_at')
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
          return next
        },
        { replace: true },
      )
      await qc.invalidateQueries({ queryKey: ['calendar-events'] })
      await qc.invalidateQueries({ queryKey: ['notification-count'] })
    },
    onError: (e: Error) => toastError(e.message),
  })

  const days = useMemo(() => eachDayOfInterval({ start: gridStart, end: gridEnd }), [gridStart, gridEnd])

  const [picked, setPicked] = useState<Date | null>(null)

  const eventsByDay = useMemo(() => {
    const map = new Map<string, typeof eventsQ.data>()
    for (const ev of eventsQ.data ?? []) {
      const key = format(new Date(ev.starts_at), 'yyyy-MM-dd')
      const list = map.get(key) ?? []
      list.push(ev)
      map.set(key, list)
    }
    return map
  }, [eventsQ.data])

  const showForm = search.get('new') === '1'

  return (
    <div className="flex flex-col gap-6">
      <ScreenHeader title="Calendar" subtitle="Your events — shown in alerts when upcoming." backTo="/" />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="border-line rounded-xl border px-3 py-2 text-sm font-semibold dark:border-line-dark"
            onClick={() => setCursor((d) => addMonths(d, -1))}
          >
            ←
          </button>
          <span className="font-stitch-head min-w-[10rem] text-center text-lg font-extrabold">{format(cursor, 'MMMM yyyy')}</span>
          <button
            type="button"
            className="border-line rounded-xl border px-3 py-2 text-sm font-semibold dark:border-line-dark"
            onClick={() => setCursor((d) => addMonths(d, 1))}
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
          <p className="font-semibold">New calendar event</p>
          <label className="flex flex-col gap-1 text-sm">
            Title
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="border-line rounded-xl border px-3 py-2 dark:border-line-dark dark:bg-stone-900/50"
              required
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Subtitle (optional)
            <input
              value={subtitle}
              onChange={(e) => setSubtitle(e.target.value)}
              className="border-line rounded-xl border px-3 py-2 dark:border-line-dark dark:bg-stone-900/50"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Starts
            <input
              type="datetime-local"
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
              className="border-line rounded-xl border px-3 py-2 dark:border-line-dark dark:bg-stone-900/50"
              required
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Ends (optional)
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

      {picked ? (
        <section className="border-line rounded-2xl border bg-white/80 p-4 dark:border-line-dark dark:bg-stone-900/50">
          <h3 className="font-semibold">{format(picked, 'EEEE, MMM d')}</h3>
          <ul className="mt-2 space-y-2 text-sm">
            {(eventsByDay.get(format(picked, 'yyyy-MM-dd')) ?? []).length === 0 ? (
              <li className="text-ink-muted">No events</li>
            ) : (
              (eventsByDay.get(format(picked, 'yyyy-MM-dd')) ?? []).map((ev) => (
                <li key={ev.id} className="rounded-lg border border-stone-200/80 px-3 py-2 dark:border-stone-600">
                  <p className="font-medium">{ev.title}</p>
                  {ev.subtitle ? <p className="text-ink-muted text-xs">{ev.subtitle}</p> : null}
                  <p className="text-ink-muted mt-1 text-xs tabular-nums">
                    {format(new Date(ev.starts_at), 'HH:mm')}
                    {ev.ends_at ? ` – ${format(new Date(ev.ends_at), 'HH:mm')}` : ''}
                  </p>
                </li>
              ))
            )}
          </ul>
        </section>
      ) : null}
    </div>
  )
}
