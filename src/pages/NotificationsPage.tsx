import { Link, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { motion, useReducedMotion } from 'framer-motion'
import { Bell, CalendarClock, Trash2, AlertTriangle, CalendarDays, Star } from 'lucide-react'
import { format } from 'date-fns'
import { useState } from 'react'

import { useAuth } from '@/auth/useAuth'
import { getSupabase } from '@/lib/supabase'
import { formatDue } from '@/lib/dates'
import { ScreenHeader } from '@/components/layout/ScreenHeader'
import { useToast } from '@/hooks/useToast'

type One<T> = T | T[] | null

type NotificationCalendarEventRow = {
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

function NotificationCalendarEventCard({
  ev,
  i,
  reduceMotion,
}: {
  ev: NotificationCalendarEventRow
  i: number
  reduceMotion: boolean | null
}) {
  const company = one(ev.companies)
  const position = one(ev.positions)
  const candidate = one(ev.candidates)
  const rel =
    ev.company_id && company
      ? { label: company.name, to: `/companies/${ev.company_id}` as const }
      : ev.position_id && position
        ? { label: position.title, to: `/positions/${ev.position_id}` as const }
        : ev.candidate_id && candidate
          ? {
              label: candidate.full_name,
              to:
                candidate.position_id ?
                  (`/positions/${candidate.position_id}` as const)
                : undefined,
            }
          : null

  return (
    <motion.li
      initial={reduceMotion ? false : { opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: reduceMotion ? 0 : i * 0.04 }}
      className="border-stitch-on-surface/10 rounded-2xl border-b-4 border-b-[#006384]/60 bg-white p-4 shadow-[0_16px_36px_rgba(48,46,43,0.08)] dark:border-stone-700 dark:bg-stone-900"
    >
      <div className="flex items-start gap-2">
        {ev.is_important ? (
          <Star className="mt-0.5 h-4 w-4 shrink-0 fill-amber-400 text-amber-500" aria-label="Important" />
        ) : (
          <span className="w-4 shrink-0" aria-hidden />
        )}
        <div className="min-w-0 flex-1">
          <p className="font-stitch-head text-stitch-on-surface font-bold dark:text-stone-100">{ev.title}</p>
          {ev.subtitle ? <p className="text-stitch-muted mt-1 text-sm dark:text-stone-400">{ev.subtitle}</p> : null}
          <p className="text-[#006384] mt-2 text-xs font-semibold tabular-nums dark:text-cyan-300">
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
              {rel.to ?
                <Link to={rel.to} className="font-semibold text-[#006384] underline-offset-2 hover:underline dark:text-cyan-300">
                  {rel.label}
                </Link>
              : <span className="text-stitch-muted dark:text-stone-400">{rel.label}</span>}
            </p>
          ) : null}
        </div>
      </div>
    </motion.li>
  )
}

export function NotificationsPage() {
  const { user } = useAuth()
  const supabase = getSupabase()
  const qc = useQueryClient()
  const { success, error: toastError } = useToast()
  const reduceMotion = useReducedMotion()
  const uid = user?.id
  const [searchParams, setSearchParams] = useSearchParams()
  const showNewReminder = searchParams.get('newReminder') === '1'
  const [remTitle, setRemTitle] = useState('')
  const [remBody, setRemBody] = useState('')
  const [remDue, setRemDue] = useState('')

  const remindersQ = useQuery({
    queryKey: ['notifications-reminders', uid],
    enabled: Boolean(supabase && uid),
    queryFn: async () => {
      const { data, error } = await supabase!
        .from('reminders')
        .select('id, title, body, due_at')
        .eq('user_id', uid!)
        .order('due_at', { ascending: true, nullsFirst: false })
      if (error) throw error
      return data ?? []
    },
  })

  const upcomingEventsQ = useQuery({
    queryKey: ['notifications-calendar-events', uid],
    enabled: Boolean(supabase && uid),
    queryFn: async () => {
      const now = new Date().toISOString()
      const horizon = new Date(Date.now() + 14 * 864e5).toISOString()
      const { data, error } = await supabase!
        .from('calendar_events')
        .select(
          `id, title, subtitle, starts_at, ends_at, reminder_at, is_important, position_id, candidate_id, company_id,
           positions ( title ),
           candidates ( full_name, position_id ),
           companies ( name )`,
        )
        .eq('user_id', uid!)
        .gte('starts_at', now)
        .lte('starts_at', horizon)
        .order('starts_at', { ascending: true })
      if (error) throw error
      return data ?? []
    },
  })

  const overdueQ = useQuery({
    queryKey: ['notifications-overdue-tasks', uid],
    enabled: Boolean(supabase && uid),
    queryFn: async () => {
      const now = new Date().toISOString()
      const { data, error } = await supabase!
        .from('tasks')
        .select('id, title, due_at, position_id, positions ( title )')
        .eq('user_id', uid!)
        .neq('status', 'done')
        .not('due_at', 'is', null)
        .lt('due_at', now)
        .order('due_at', { ascending: true })
      if (error) throw error
      return data ?? []
    },
  })

  const addReminder = useMutation({
    mutationFn: async () => {
      if (!remTitle.trim()) throw new Error('Enter a title')
      const dueIso = remDue.trim() ? new Date(remDue).toISOString() : null
      const { error } = await supabase!.from('reminders').insert({
        user_id: uid!,
        title: remTitle.trim(),
        body: remBody.trim() || null,
        due_at: dueIso,
      })
      if (error) throw error
    },
    onSuccess: async () => {
      setRemTitle('')
      setRemBody('')
      setRemDue('')
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          next.delete('newReminder')
          return next
        },
        { replace: true },
      )
      await qc.invalidateQueries({ queryKey: ['notifications-reminders'] })
      await qc.invalidateQueries({ queryKey: ['dashboard-reminders'] })
      await qc.invalidateQueries({ queryKey: ['notification-count'] })
      success('Reminder saved')
    },
    onError: (e: Error) => toastError(e.message),
  })

  const removeReminder = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase!.from('reminders').delete().eq('id', id).eq('user_id', uid!)
      if (error) throw error
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['notifications-reminders'] })
      await qc.invalidateQueries({ queryKey: ['notification-count'] })
      await qc.invalidateQueries({ queryKey: ['dashboard-reminders'] })
      success('Reminder dismissed')
    },
    onError: (e: Error) => toastError(e.message),
  })

  const reminders = remindersQ.data ?? []
  const overdue = overdueQ.data ?? []
  const upcomingEvents = upcomingEventsQ.data ?? []
  const upcomingImportant = upcomingEvents.filter((e) => e.is_important)
  const upcomingRest = upcomingEvents.filter((e) => !e.is_important)

  return (
    <div className="flex flex-col gap-8">
      <ScreenHeader
        title="Notifications"
        subtitle="Overdue tasks, upcoming calendar events, and reminders. Calendar events live on your grid; reminders are separate nudges."
        backTo="/"
      />

      {showNewReminder ? (
        <form
          className="border-line flex flex-col gap-3 rounded-2xl border border-amber-200/80 bg-amber-50/50 p-4 dark:border-amber-900/40 dark:bg-amber-950/25"
          onSubmit={(e) => {
            e.preventDefault()
            void addReminder.mutateAsync()
          }}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-semibold text-amber-950 dark:text-amber-100">Set Reminder</p>
            <button
              type="button"
              className="text-xs font-bold text-amber-900 underline dark:text-amber-300"
              onClick={() =>
                setSearchParams(
                  (prev) => {
                    const next = new URLSearchParams(prev)
                    next.delete('newReminder')
                    return next
                  },
                  { replace: true },
                )
              }
            >
              Cancel
            </button>
          </div>
          <p className="text-ink-muted text-xs dark:text-stone-400">
            Reminders are personal nudges (optional time). They are not added to your month calendar — use Calendar for that.
          </p>
          <label className="flex flex-col gap-1 text-sm">
            Title
            <input
              value={remTitle}
              onChange={(e) => setRemTitle(e.target.value)}
              className="border-line rounded-xl border px-3 py-2 dark:border-line-dark dark:bg-stone-900/50"
              placeholder="What should you remember?"
              required
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Note (optional)
            <input
              value={remBody}
              onChange={(e) => setRemBody(e.target.value)}
              className="border-line rounded-xl border px-3 py-2 dark:border-line-dark dark:bg-stone-900/50"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Remind me at (optional)
            <input
              type="datetime-local"
              value={remDue}
              onChange={(e) => setRemDue(e.target.value)}
              className="border-line rounded-xl border px-3 py-2 dark:border-line-dark dark:bg-stone-900/50"
            />
          </label>
          <button
            type="submit"
            disabled={addReminder.isPending}
            className="w-fit rounded-full bg-gradient-to-r from-amber-700 to-amber-600 px-5 py-2 text-sm font-bold text-white disabled:opacity-50 dark:from-amber-600 dark:to-amber-500"
          >
            {addReminder.isPending ? 'Saving…' : 'Save reminder'}
          </button>
        </form>
      ) : null}

      <section aria-labelledby="overdue-heading">
        <h2 id="overdue-heading" className="font-stitch-label text-[#9f0519] mb-3 flex items-center gap-2 text-xs font-bold tracking-[0.2em] uppercase dark:text-red-400">
          <AlertTriangle className="h-4 w-4" aria-hidden />
          Overdue tasks
        </h2>
        {overdueQ.isLoading ? (
          <p className="text-stitch-muted text-sm">Loading…</p>
        ) : overdue.length === 0 ? (
          <p className="text-stitch-muted rounded-2xl border border-emerald-200/80 bg-emerald-50/80 px-4 py-3 text-sm dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-stone-400">
            You’re all caught up — no overdue tasks with a due date.
          </p>
        ) : (
          <ul className="space-y-3">
            {overdue.map((t, i) => {
              const pos = t.positions as unknown as { title: string } | null
              return (
                <motion.li
                  key={t.id}
                  initial={reduceMotion ? false : { opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: reduceMotion ? 0 : i * 0.04 }}
                >
                  <Link
                    to={`/positions/${t.position_id}`}
                    className="border-stitch-on-surface/10 flex flex-col gap-1 rounded-2xl border-b-4 border-b-red-400 bg-white p-4 shadow-[0_16px_36px_rgba(48,46,43,0.08)] dark:border-stone-700 dark:bg-stone-900"
                  >
                    <span className="font-stitch-head text-stitch-on-surface font-bold dark:text-stone-100">{t.title}</span>
                    <span className="text-stitch-muted text-sm dark:text-stone-400">
                      {pos?.title ?? 'Position'} · was due {formatDue(t.due_at)}
                    </span>
                  </Link>
                </motion.li>
              )
            })}
          </ul>
        )}
      </section>

      <section aria-labelledby="calendar-events-heading">
        <h2 id="calendar-events-heading" className="font-stitch-label text-[#006384] mb-3 flex items-center gap-2 text-xs font-bold tracking-[0.2em] uppercase dark:text-cyan-400">
          <CalendarDays className="h-4 w-4" aria-hidden />
          Upcoming calendar events
        </h2>
        <p className="text-ink-muted mb-3 text-xs dark:text-stone-500">
          Scheduled on your calendar (next 14 days). You can set an event reminder on the calendar; standalone reminders below stay separate.
        </p>
        {upcomingEventsQ.isLoading ? (
          <p className="text-stitch-muted text-sm">Loading…</p>
        ) : upcomingEvents.length === 0 ? (
          <p className="text-stitch-muted text-sm">No upcoming events in the next two weeks. Add one from Quick actions → Add Calendar Event.</p>
        ) : (
          <div className="space-y-6">
            {upcomingImportant.length > 0 ? (
              <div>
                <h3 className="text-stitch-muted mb-2 text-[11px] font-bold uppercase tracking-[0.18em] text-[#9b3e20] dark:text-orange-400">
                  Important events
                </h3>
                <ul className="space-y-3">
                  {upcomingImportant.map((ev, i) => (
                    <NotificationCalendarEventCard key={ev.id} ev={ev} i={i} reduceMotion={reduceMotion} />
                  ))}
                </ul>
              </div>
            ) : null}
            <div>
              <h3 className="text-stitch-muted mb-2 text-[11px] font-bold uppercase tracking-[0.18em] dark:text-stone-500">
                Upcoming events
              </h3>
              {upcomingRest.length === 0 ? (
                <p className="text-stitch-muted text-sm">No other events in the next two weeks.</p>
              ) : (
                <ul className="space-y-3">
                  {upcomingRest.map((ev, i) => (
                    <NotificationCalendarEventCard key={ev.id} ev={ev} i={i} reduceMotion={reduceMotion} />
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </section>

      <section aria-labelledby="reminders-heading">
        <h2 id="reminders-heading" className="font-stitch-label text-[#006384] mb-3 flex items-center gap-2 text-xs font-bold tracking-[0.2em] uppercase dark:text-cyan-400">
          <Bell className="h-4 w-4" aria-hidden />
          Reminders
        </h2>
        <p className="text-ink-muted mb-3 text-xs dark:text-stone-500">
          Lightweight to-dos or notes with an optional time — they do not appear as blocks on the calendar grid.
        </p>
        {remindersQ.isLoading ? (
          <p className="text-stitch-muted text-sm">Loading…</p>
        ) : reminders.length === 0 ? (
          <p className="text-stitch-muted text-sm">No reminders yet. Set one from the + menu → Set Reminder.</p>
        ) : (
          <ul className="space-y-3">
            {reminders.map((r, i) => (
              <motion.li
                key={r.id}
                initial={reduceMotion ? false : { opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: reduceMotion ? 0 : i * 0.04 }}
                className="border-stitch-on-surface/10 flex flex-col gap-2 rounded-2xl border-b-4 border-b-[#97daff] bg-white p-4 shadow-[0_16px_36px_rgba(48,46,43,0.08)] dark:border-stone-700 dark:bg-stone-900"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-stitch-head text-stitch-on-surface font-bold dark:text-stone-100">{r.title}</p>
                    {r.body ? <p className="text-stitch-muted mt-1 text-sm dark:text-stone-400">{r.body}</p> : null}
                    {r.due_at ? (
                      <p className="text-[#006384] mt-2 flex items-center gap-1 text-xs font-semibold dark:text-cyan-300">
                        <CalendarClock className="h-3.5 w-3.5" aria-hidden />
                        {formatDue(r.due_at)}
                      </p>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    onClick={() => void removeReminder.mutateAsync(r.id)}
                    disabled={removeReminder.isPending}
                    className="text-stitch-muted hover:text-red-600 shrink-0 rounded-xl p-2 transition dark:hover:text-red-400"
                    aria-label="Dismiss reminder"
                  >
                    <Trash2 className="h-5 w-5" />
                  </button>
                </div>
              </motion.li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
