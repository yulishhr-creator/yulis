import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { motion, useReducedMotion } from 'framer-motion'
import { Bell, CalendarClock, Trash2, AlertTriangle } from 'lucide-react'

import { useAuth } from '@/auth/useAuth'
import { getSupabase } from '@/lib/supabase'
import { formatDue } from '@/lib/dates'
import { ScreenHeader } from '@/components/layout/ScreenHeader'
import { useToast } from '@/hooks/useToast'

export function NotificationsPage() {
  const { user } = useAuth()
  const supabase = getSupabase()
  const qc = useQueryClient()
  const { success, error: toastError } = useToast()
  const reduceMotion = useReducedMotion()
  const uid = user?.id

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

  return (
    <div className="flex flex-col gap-8">
      <ScreenHeader title="Notifications" subtitle="Reminders and overdue tasks in one place." backTo="/" />

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

      <section aria-labelledby="reminders-heading">
        <h2 id="reminders-heading" className="font-stitch-label text-[#006384] mb-3 flex items-center gap-2 text-xs font-bold tracking-[0.2em] uppercase dark:text-cyan-400">
          <Bell className="h-4 w-4" aria-hidden />
          Reminders
        </h2>
        {remindersQ.isLoading ? (
          <p className="text-stitch-muted text-sm">Loading…</p>
        ) : reminders.length === 0 ? (
          <p className="text-stitch-muted text-sm">No reminders. Add them from the dashboard workflow when you build that flow, or via your data tool.</p>
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
