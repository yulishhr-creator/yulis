import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Plus, Mail } from 'lucide-react'

import { useAuth } from '@/auth/useAuth'
import { getSupabase } from '@/lib/supabase'
import { formatDue } from '@/lib/dates'

export function DashboardPage() {
  const { user } = useAuth()
  const supabase = getSupabase()
  const uid = user?.id

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
    queryKey: ['dashboard-kpis', uid],
    enabled: Boolean(supabase && uid),
    queryFn: async () => {
      const [t, p, c, overdue] = await Promise.all([
        supabase!.from('tasks').select('*', { count: 'exact', head: true }).eq('user_id', uid!).neq('status', 'done'),
        supabase!.from('positions').select('*', { count: 'exact', head: true }).eq('user_id', uid!).is('deleted_at', null),
        supabase!.from('candidates').select('*', { count: 'exact', head: true }).eq('user_id', uid!).is('deleted_at', null),
        supabase!.from('tasks').select('*', { count: 'exact', head: true }).eq('user_id', uid!).neq('status', 'done').lt('due_at', new Date().toISOString()),
      ])
      return {
        openTasks: t.count ?? 0,
        positions: p.count ?? 0,
        candidates: c.count ?? 0,
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

  return (
    <div className="flex flex-col gap-10">
      <div>
        <h1 className="font-display text-ink text-2xl font-semibold tracking-tight dark:text-stone-100">My work</h1>
        <p className="text-ink-muted mt-1 text-sm dark:text-stone-400">What to do next — tasks, reminders, and open positions.</p>
      </div>

      {kpis ? (
        <section aria-label="Overview">
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { label: 'Open tasks', value: kpis.openTasks },
              { label: 'Overdue', value: kpis.overdue },
              { label: 'Active positions', value: kpis.positions },
              { label: 'Candidates', value: kpis.candidates },
            ].map((k) => (
              <li
                key={k.label}
                className="border-line bg-white/60 rounded-2xl border px-4 py-4 dark:border-line-dark dark:bg-stone-900/40"
              >
                <p className="text-ink-muted text-xs font-medium uppercase tracking-wide dark:text-stone-500">{k.label}</p>
                <p className="font-display text-ink mt-1 text-3xl font-semibold tabular-nums dark:text-stone-100">{k.value}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section aria-labelledby="reminders-heading">
        <h2 id="reminders-heading" className="font-display text-lg font-semibold">
          Reminders
        </h2>
        {remindersQ.isLoading ? (
          <p className="text-ink-muted mt-2 text-sm">Loading…</p>
        ) : reminders.length === 0 ? (
          <p className="text-ink-muted mt-2 text-sm">No reminders yet.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {reminders.map((r) => (
              <li
                key={r.id}
                className="border-line bg-white/60 flex flex-col gap-1 rounded-2xl border px-4 py-3 dark:border-line-dark dark:bg-stone-900/40"
              >
                <span className="font-medium">{r.title}</span>
                {r.body ? <span className="text-ink-muted text-sm">{r.body}</span> : null}
                {r.due_at ? <span className="text-ink-muted text-xs">Due {formatDue(r.due_at)}</span> : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="fast-actions-heading">
        <h2 id="fast-actions-heading" className="sr-only">
          Fast actions
        </h2>
        <div className="flex flex-wrap gap-3">
          <Link
            to="/positions?create=1"
            className="bg-accent text-stone-50 hover:bg-accent/90 inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold shadow-sm"
          >
            <Plus className="h-4 w-4" aria-hidden />
            Create position
          </Link>
          <Link
            to="/positions"
            className="border-line bg-white/70 text-ink hover:border-accent inline-flex items-center gap-2 rounded-full border px-5 py-2.5 text-sm font-semibold dark:border-line-dark dark:bg-stone-900/50 dark:text-stone-100"
          >
            <Plus className="h-4 w-4" aria-hidden />
            Create task
          </Link>
          <Link
            to="/settings/email-templates"
            className="border-line bg-white/70 text-ink hover:border-accent inline-flex items-center gap-2 rounded-full border px-5 py-2.5 text-sm font-semibold dark:border-line-dark dark:bg-stone-900/50 dark:text-stone-100"
          >
            <Mail className="h-4 w-4" aria-hidden />
            Email templates
          </Link>
        </div>
      </section>

      <section aria-labelledby="tasks-heading">
        <h2 id="tasks-heading" className="font-display text-lg font-semibold">
          Tasks
        </h2>
        {tasksQ.isLoading ? (
          <p className="text-ink-muted mt-2 text-sm">Loading…</p>
        ) : tasks.length === 0 ? (
          <p className="text-ink-muted mt-2 text-sm">No tasks yet. Create one from a position or use the button above.</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {tasks.map((row) => {
              const pos = row.positions as unknown as
                | { id: string; title: string; companies: { name: string } | null }
                | null
              const cand = row.candidates as unknown as { id: string; full_name: string } | null
              const posTitle = pos?.title ?? 'Position'
              const companyName = pos?.companies?.name
              const due = formatDue(row.due_at)
              return (
                <li
                  key={row.id}
                  className="border-line bg-white/70 rounded-2xl border px-4 py-4 text-sm leading-relaxed dark:border-line-dark dark:bg-stone-900/45"
                >
                  <p className="text-ink dark:text-stone-100">
                    You need to <span className="font-semibold">{row.title}</span> for position{' '}
                    <Link to={`/positions/${row.position_id}`} className="text-accent font-medium underline-offset-2 hover:underline dark:text-orange-300">
                      {posTitle}
                    </Link>
                    {companyName ? (
                      <span className="text-ink-muted dark:text-stone-400"> ({companyName})</span>
                    ) : null}
                    {cand ? (
                      <>
                        {' '}
                        for candidate{' '}
                        <Link
                          to={`/positions/${row.position_id}?candidate=${cand.id}`}
                          className="text-accent font-medium underline-offset-2 hover:underline dark:text-orange-300"
                        >
                          {cand.full_name}
                        </Link>
                      </>
                    ) : null}{' '}
                    until <span className="font-medium">{due}</span>.
                  </p>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <section aria-labelledby="positions-heading">
        <h2 id="positions-heading" className="font-display text-lg font-semibold">
          Positions you’re driving
        </h2>
        {topPositionsQ.isLoading ? (
          <p className="text-ink-muted mt-2 text-sm">Loading…</p>
        ) : (topPositionsQ.data ?? []).length === 0 ? (
          <p className="text-ink-muted mt-2 text-sm">No positions yet.</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {(topPositionsQ.data ?? []).map((p) => {
              const company = (p.companies as unknown as { name: string } | null)?.name
              const cands = (p.candidates as unknown as Array<{
                id: string
                full_name: string
                outcome: string
                position_stages: { name: string } | null
              }>) ?? []
              return (
                <li key={p.id} className="border-line bg-white/60 rounded-2xl border dark:border-line-dark dark:bg-stone-900/40">
                  <div className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-3">
                    <Link to={`/positions/${p.id}`} className="font-display text-ink font-semibold hover:underline dark:text-stone-100">
                      {p.title}
                    </Link>
                    <span className="text-ink-muted text-xs uppercase dark:text-stone-500">{p.status.replace('_', ' ')}</span>
                  </div>
                  {company ? <p className="text-ink-muted px-4 pb-2 text-xs dark:text-stone-400">{company}</p> : null}
                  {cands.length ? (
                    <ul className="border-line border-t px-4 py-2 dark:border-line-dark">
                      {cands.map((c) => (
                        <li key={c.id} className="flex flex-wrap gap-2 py-1.5 text-sm">
                          <Link to={`/positions/${p.id}?candidate=${c.id}`} className="text-accent hover:underline dark:text-orange-300">
                            {c.full_name}
                          </Link>
                          <span className="text-ink-muted dark:text-stone-500">
                            {c.position_stages?.name ?? '—'} · {c.outcome}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-ink-muted px-4 pb-3 text-xs dark:text-stone-500">No candidates yet.</p>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}
