import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { motion, useReducedMotion } from 'framer-motion'
import { Plus, Mail, ListTodo, AlertTriangle, CheckCircle2, PlayCircle, ChevronDown } from 'lucide-react'

import { useAuth } from '@/auth/useAuth'
import { getSupabase } from '@/lib/supabase'
import { formatDue } from '@/lib/dates'
import { StitchKpiCard } from '@/components/ui/StitchKpiCard'

export function DashboardPage() {
  const { user } = useAuth()
  const supabase = getSupabase()
  const uid = user?.id
  const reduceMotion = useReducedMotion()

  const tasksQ = useQuery({
    queryKey: ['dashboard-tasks', uid],
    enabled: Boolean(supabase && uid),
    queryFn: async () => {
      const { data, error } = await supabase!
        .from('tasks')
        .select(
          `
          id,
          title,
          status,
          due_at,
          position_id,
          candidate_id,
          positions ( id, title, companies ( name ) ),
          candidates ( id, full_name )
        `,
        )
        .eq('user_id', uid!)
        .neq('status', 'done')
        .order('due_at', { ascending: true, nullsFirst: false })

      if (error) throw error
      return data ?? []
    },
  })

  const remindersQ = useQuery({
    queryKey: ['dashboard-reminders', uid],
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

  const kpisQ = useQuery({
    queryKey: ['dashboard-task-kpis', uid],
    enabled: Boolean(supabase && uid),
    queryFn: async () => {
      const now = new Date().toISOString()
      const [open, inProgress, overdue] = await Promise.all([
        supabase!.from('tasks').select('*', { count: 'exact', head: true }).eq('user_id', uid!).eq('status', 'todo'),
        supabase!.from('tasks').select('*', { count: 'exact', head: true }).eq('user_id', uid!).eq('status', 'in_progress'),
        supabase!
          .from('tasks')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', uid!)
          .neq('status', 'done')
          .not('due_at', 'is', null)
          .lt('due_at', now),
      ])
      return {
        todo: open.count ?? 0,
        inProgress: inProgress.count ?? 0,
        overdue: overdue.count ?? 0,
      }
    },
  })

  const topPositionsQ = useQuery({
    queryKey: ['dashboard-top-positions', uid],
    enabled: Boolean(supabase && uid),
    queryFn: async () => {
      const { data, error } = await supabase!
        .from('positions')
        .select(
          `
          id,
          title,
          status,
          company_id,
          companies ( name ),
          candidates ( id, full_name, outcome, position_stage_id, position_stages ( name ) )
        `,
        )
        .eq('user_id', uid!)
        .is('deleted_at', null)
        .order('updated_at', { ascending: false })
        .limit(10)

      if (error) throw error
      return data ?? []
    },
  })

  const tasks = tasksQ.data ?? []
  const reminders = remindersQ.data ?? []
  const kpis = kpisQ.data

  function taskAccent(status: string): string {
    if (status === 'in_progress') return 'border-l-[#97daff] bg-gradient-to-r from-[#97daff]/12 to-white dark:from-cyan-500/15 dark:to-stone-900'
    return 'border-l-[#b4fdb4] bg-gradient-to-r from-[#b4fdb4]/10 to-white dark:from-emerald-500/10 dark:to-stone-900'
  }

  return (
    <div className="flex flex-col gap-8 md:gap-10">
      {/* Stitch-style hero — task focus */}
      <motion.section
        className="border-stitch-on-surface/10 relative overflow-hidden rounded-3xl border bg-gradient-to-br from-[#fd8863]/18 via-white to-[#97daff]/20 p-6 shadow-[0_24px_60px_rgba(155,62,32,0.12)] md:p-10 dark:from-orange-500/15 dark:via-stone-900 dark:to-cyan-900/20 dark:shadow-none"
        initial={reduceMotion ? false : { opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45 }}
      >
        <div className="pointer-events-none absolute -right-16 -bottom-16 h-48 w-48 rounded-full bg-[#fd8863]/20 blur-3xl dark:bg-orange-500/20" />
        <div className="pointer-events-none absolute top-0 left-1/2 h-32 w-32 -translate-x-1/2 rounded-full bg-[#97daff]/30 blur-2xl dark:bg-cyan-500/15" />
        <div className="relative z-10">
          <h1 className="font-stitch-head text-stitch-on-surface text-3xl font-extrabold tracking-tight md:text-4xl dark:text-stone-100">
            What you need to do{' '}
            <span className="bg-gradient-to-r from-[#9b3e20] to-[#006384] bg-clip-text text-transparent dark:from-orange-300 dark:to-cyan-300">
              right now
            </span>
          </h1>
          <p className="text-stitch-muted mt-2 max-w-xl text-sm leading-relaxed md:text-base dark:text-stone-400">
            Your task queue is the center of the app — knock out work, then glance at reminders and pipeline.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <motion.div whileHover={reduceMotion ? undefined : { scale: 1.02 }} whileTap={reduceMotion ? undefined : { scale: 0.98 }}>
              <Link
                to="/notifications"
                className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-[#9b3e20] to-[#fd8863] px-5 py-2.5 text-sm font-bold tracking-wide text-white uppercase shadow-lg shadow-[#9b3e20]/25"
              >
                Open alerts
              </Link>
            </motion.div>
            <motion.div whileHover={reduceMotion ? undefined : { scale: 1.02 }} whileTap={reduceMotion ? undefined : { scale: 0.98 }}>
              <Link
                to="/positions"
                className="border-stitch-on-surface/15 inline-flex items-center gap-2 rounded-full border bg-white/80 px-5 py-2.5 text-sm font-bold text-[#006384] shadow-sm dark:border-stone-600 dark:bg-stone-800 dark:text-cyan-300"
              >
                <Plus className="h-4 w-4" aria-hidden />
                Log task on a role
              </Link>
            </motion.div>
          </div>
        </div>
      </motion.section>

      {kpis ? (
        <motion.section aria-label="Task overview" initial="hidden" animate="show" variants={{ hidden: {}, show: { transition: { staggerChildren: reduceMotion ? 0 : 0.08 } } }}>
          <h2 className="sr-only">Task counts</h2>
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-3 sm:gap-6">
            <motion.li
              variants={{ hidden: { opacity: 0, y: 14 }, show: { opacity: 1, y: 0 } }}
              transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
              className="list-none"
            >
              <StitchKpiCard
                label="To do"
                value={kpis.todo}
                variant="green"
                icon={ListTodo}
                footer={kpis.todo === 1 ? '1 task waiting' : `${kpis.todo} tasks waiting`}
              />
            </motion.li>
            <motion.li
              variants={{ hidden: { opacity: 0, y: 14 }, show: { opacity: 1, y: 0 } }}
              transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
              className="list-none"
            >
              <StitchKpiCard
                label="In progress"
                value={kpis.inProgress}
                variant="blue"
                icon={PlayCircle}
                footer={kpis.inProgress === 0 ? 'Nothing active' : `${kpis.inProgress} in flight`}
              />
            </motion.li>
            <motion.li
              variants={{ hidden: { opacity: 0, y: 14 }, show: { opacity: 1, y: 0 } }}
              transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
              className="list-none"
            >
              <StitchKpiCard
                label="Overdue"
                value={kpis.overdue}
                variant={kpis.overdue > 0 ? 'danger' : 'green'}
                icon={kpis.overdue > 0 ? AlertTriangle : CheckCircle2}
                footer={kpis.overdue > 0 ? `${kpis.overdue} past due` : 'On schedule'}
              />
            </motion.li>
          </ul>
        </motion.section>
      ) : null}

      <section aria-labelledby="tasks-heading">
        <h2 id="tasks-heading" className="font-stitch-head text-stitch-on-surface text-xl font-extrabold md:text-2xl dark:text-stone-100">
          Your tasks
        </h2>
        <p className="text-stitch-muted mt-1 text-sm">Everything open — sorted by due date.</p>
        {tasksQ.isLoading ? (
          <p className="text-stitch-muted mt-4 text-sm">Loading…</p>
        ) : tasks.length === 0 ? (
          <motion.p
            className="text-stitch-muted mt-4 rounded-2xl border border-dashed border-[#97daff]/60 bg-[#97daff]/10 px-4 py-6 text-center text-sm dark:border-cyan-800 dark:bg-cyan-950/30"
            initial={reduceMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            No open tasks. Open a <Link to="/positions" className="font-semibold text-[#9b3e20] underline dark:text-orange-300">position</Link> and add one.
          </motion.p>
        ) : (
          <ul className="mt-4 space-y-3">
            {tasks.map((row, i) => {
              const pos = row.positions as unknown as
                | { id: string; title: string; companies: { name: string } | null }
                | null
              const cand = row.candidates as unknown as { id: string; full_name: string } | null
              const posTitle = pos?.title ?? 'Position'
              const companyName = pos?.companies?.name
              const due = formatDue(row.due_at)
              return (
                <motion.li
                  key={row.id}
                  initial={reduceMotion ? false : { opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: reduceMotion ? 0 : i * 0.03 }}
                  className={`rounded-2xl border border-white/60 py-4 pl-5 pr-4 shadow-[0_12px_32px_rgba(48,46,43,0.06)] dark:border-stone-700 ${taskAccent(row.status)} border-l-4`}
                >
                  <p className="text-sm leading-relaxed text-[#302e2b] dark:text-stone-100">
                    You need to <span className="font-bold">{row.title}</span> for position{' '}
                    <Link to={`/positions/${row.position_id}`} className="font-semibold text-[#9b3e20] underline-offset-2 hover:underline dark:text-orange-300">
                      {posTitle}
                    </Link>
                    {companyName ? <span className="text-stitch-muted dark:text-stone-400"> ({companyName})</span> : null}
                    {cand ? (
                      <>
                        {' '}
                        for candidate{' '}
                        <Link
                          to={`/positions/${row.position_id}?candidate=${cand.id}`}
                          className="font-semibold text-[#006384] underline-offset-2 hover:underline dark:text-cyan-300"
                        >
                          {cand.full_name}
                        </Link>
                      </>
                    ) : null}{' '}
                    until <span className="font-semibold">{due}</span>.
                  </p>
                  {row.status === 'in_progress' ? (
                    <p className="text-[#006384] mt-2 text-xs font-bold uppercase tracking-wide dark:text-cyan-400">In progress</p>
                  ) : null}
                </motion.li>
              )
            })}
          </ul>
        )}
      </section>

      <section aria-labelledby="reminders-heading">
        <h2 id="reminders-heading" className="font-stitch-head text-stitch-on-surface text-lg font-extrabold dark:text-stone-100">
          Reminders
        </h2>
        {remindersQ.isLoading ? (
          <p className="text-stitch-muted mt-2 text-sm">Loading…</p>
        ) : reminders.length === 0 ? (
          <p className="text-stitch-muted mt-2 text-sm">No reminders.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {reminders.map((r) => (
              <motion.li
                key={r.id}
                initial={reduceMotion ? false : { opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex flex-col gap-1 rounded-2xl border border-[#97daff]/40 bg-white/90 px-4 py-3 shadow-sm dark:border-cyan-900/50 dark:bg-stone-900/60"
              >
                <span className="font-semibold text-[#302e2b] dark:text-stone-100">{r.title}</span>
                {r.body ? <span className="text-stitch-muted text-sm dark:text-stone-400">{r.body}</span> : null}
                {r.due_at ? <span className="text-xs font-medium text-[#006384] dark:text-cyan-400">Due {formatDue(r.due_at)}</span> : null}
              </motion.li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="fast-actions-heading">
        <h2 id="fast-actions-heading" className="font-stitch-head text-stitch-on-surface text-lg font-extrabold dark:text-stone-100">
          Fast actions
        </h2>
        <div className="mt-3 flex flex-wrap gap-3">
          <motion.div whileHover={reduceMotion ? undefined : { y: -2 }} whileTap={reduceMotion ? undefined : { scale: 0.98 }}>
            <Link
              to="/positions?create=1"
              className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-[#9b3e20] to-[#fd8863] px-5 py-2.5 text-sm font-bold text-white shadow-lg"
            >
              <Plus className="h-4 w-4" aria-hidden />
              Create position
            </Link>
          </motion.div>
          <motion.div whileHover={reduceMotion ? undefined : { y: -2 }} whileTap={reduceMotion ? undefined : { scale: 0.98 }}>
            <Link
              to="/positions"
              className="inline-flex items-center gap-2 rounded-full border border-[#97daff]/50 bg-white px-5 py-2.5 text-sm font-bold text-[#006384] shadow-sm dark:border-cyan-800 dark:bg-stone-800 dark:text-cyan-300"
            >
              <Plus className="h-4 w-4" aria-hidden />
              Jump to roles
            </Link>
          </motion.div>
          <motion.div whileHover={reduceMotion ? undefined : { y: -2 }} whileTap={reduceMotion ? undefined : { scale: 0.98 }}>
            <Link
              to="/settings/email-templates"
              className="inline-flex items-center gap-2 rounded-full border border-[#b4fdb4]/60 bg-white px-5 py-2.5 text-sm font-bold text-[#165c25] shadow-sm dark:border-emerald-900 dark:bg-stone-800 dark:text-emerald-300"
            >
              <Mail className="h-4 w-4" aria-hidden />
              Email templates
            </Link>
          </motion.div>
        </div>
      </section>

      <details className="group border-stitch-on-surface/10 rounded-3xl border bg-white/50 open:bg-white/90 open:shadow-md dark:border-stone-700 dark:bg-stone-900/40 dark:open:bg-stone-900/70">
        <summary className="font-stitch-head flex cursor-pointer list-none items-center justify-between gap-2 rounded-3xl px-4 py-4 text-lg font-extrabold text-[#302e2b] marker:hidden dark:text-stone-100 [&::-webkit-details-marker]:hidden">
          <span>Pipeline overview</span>
          <ChevronDown className="text-stitch-muted h-5 w-5 shrink-0 transition group-open:rotate-180" aria-hidden />
        </summary>
        <div className="border-stitch-on-surface/10 border-t px-4 pb-4 dark:border-stone-700">
          <p className="text-stitch-muted py-3 text-sm">Roles and candidates — expand when you need the big picture.</p>
          {topPositionsQ.isLoading ? (
            <p className="text-stitch-muted text-sm">Loading…</p>
          ) : (topPositionsQ.data ?? []).length === 0 ? (
            <p className="text-stitch-muted text-sm">No positions yet.</p>
          ) : (
            <ul className="space-y-3">
              {(topPositionsQ.data ?? []).map((p) => {
                const company = (p.companies as unknown as { name: string } | null)?.name
                const cands =
                  (p.candidates as unknown as Array<{
                    id: string
                    full_name: string
                    outcome: string
                    position_stages: { name: string } | null
                  }>) ?? []
                return (
                  <li
                    key={p.id}
                    className="rounded-2xl border border-stone-200/80 bg-white/80 p-3 shadow-sm dark:border-stone-600 dark:bg-stone-900/50"
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <Link to={`/positions/${p.id}`} className="font-stitch-head font-bold text-[#9b3e20] hover:underline dark:text-orange-300">
                        {p.title}
                      </Link>
                      <span className="text-stitch-muted text-xs uppercase">{p.status.replace('_', ' ')}</span>
                    </div>
                    {company ? <p className="text-stitch-muted text-xs">{company}</p> : null}
                    {cands.length ? (
                      <ul className="mt-2 space-y-1 border-t border-stone-200/60 pt-2 dark:border-stone-600">
                        {cands.map((c) => (
                          <li key={c.id} className="flex flex-wrap gap-2 text-sm">
                            <Link to={`/positions/${p.id}?candidate=${c.id}`} className="font-medium text-[#006384] hover:underline dark:text-cyan-300">
                              {c.full_name}
                            </Link>
                            <span className="text-stitch-muted text-xs">
                              {c.position_stages?.name ?? '—'} · {c.outcome}
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-stitch-muted mt-1 text-xs">No candidates yet.</p>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </details>
    </div>
  )
}
