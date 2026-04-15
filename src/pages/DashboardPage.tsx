import { Link, useNavigate, useSearchParams, Navigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { motion, useReducedMotion } from 'framer-motion'
import { ChevronDown, Users } from 'lucide-react'
import { useMemo, useState } from 'react'
import { differenceInCalendarDays } from 'date-fns'

import { useAuth } from '@/auth/useAuth'
import { getSupabase } from '@/lib/supabase'
import { useDashboardTaskKpis } from '@/hooks/useDashboardTaskKpis'
import { usePipelineHeadlineStats } from '@/hooks/usePipelineHeadlineStats'
import { assignmentStatusPill, positionLifecyclePill } from '@/lib/candidateStatus'
import { OverviewCalendarAndEvents } from '@/components/dashboard/OverviewCalendarAndEvents'

function nestedOne<T>(v: T | T[] | null | undefined): T | null {
  if (v == null) return null
  return Array.isArray(v) ? (v[0] ?? null) : v
}

export function DashboardPage() {
  const [searchParams] = useSearchParams()
  if (
    searchParams.has('taskStatus') ||
    searchParams.get('addTask') === '1' ||
    searchParams.get('trackTime') === '1'
  ) {
    return <Navigate to={{ pathname: '/tasks', search: searchParams.toString() }} replace />
  }
  /** Client-scoped pipeline board (columns by position status) lives on Positions, not Overview. */
  if (searchParams.get('company')) {
    return <Navigate to={{ pathname: '/positions', search: searchParams.toString() }} replace />
  }
  return <DashboardHome />
}

function DashboardHome() {
  const { user } = useAuth()
  const supabase = getSupabase()
  const uid = user?.id
  const reduceMotion = useReducedMotion()
  const navigate = useNavigate()
  const [positionsScope, setPositionsScope] = useState<'open' | 'on_hold' | 'all'>('open')

  const topPositionsQ = useQuery({
    queryKey: ['dashboard-top-positions', uid, positionsScope, ''],
    enabled: Boolean(supabase && uid),
    queryFn: async () => {
      let q = supabase!
        .from('positions')
        .select(
          `
          id,
          title,
          status,
          updated_at,
          company_id,
          companies ( name ),
          position_candidates (
            id,
            status,
            updated_at,
            created_at,
            candidate_id,
            candidates ( id, full_name ),
            position_stages ( name )
          )
        `,
        )
        .eq('user_id', uid!)
        .is('deleted_at', null)
        .order('updated_at', { ascending: false })
        .limit(12)
      if (positionsScope === 'open') q = q.in('status', ['active', 'on_hold'])
      else if (positionsScope === 'on_hold') q = q.eq('status', 'on_hold')
      const { data, error } = await q
      if (error) throw error
      return data ?? []
    },
  })

  const { data: pipelineStats, isLoading: pipelineHeadlineLoading } = usePipelineHeadlineStats()

  const { data: taskKpis, isPending: taskKpisPending } = useDashboardTaskKpis()

  const displayTopPositions = useMemo(() => topPositionsQ.data ?? [], [topPositionsQ.data])

  const pipelineHints = useMemo(() => {
    const rows = displayTopPositions
    const stuck: string[] = []
    const stale: string[] = []
    const now = new Date()
    for (const p of rows) {
      const posUpdated = new Date(p.updated_at as string)
      if ((p.status === 'active' || p.status === 'on_hold') && differenceInCalendarDays(now, posUpdated) >= 14) {
        stale.push(p.title as string)
      }
      const pcs =
        (p.position_candidates as unknown as Array<{
          status: string
          updated_at: string
          candidates: { full_name: string } | { full_name: string }[] | null
        }>) ?? []
      for (const pc of pcs) {
        if (pc.status !== 'in_progress') continue
        const cand = nestedOne(pc.candidates)
        if (!cand?.full_name) continue
        if (differenceInCalendarDays(now, new Date(pc.updated_at)) >= 7) {
          stuck.push(`${cand.full_name} · ${p.title}`)
        }
      }
    }
    return { stuck, stale }
  }, [displayTopPositions])

  return (
    <div className="flex flex-col gap-8 md:gap-10">
      <motion.section
        className="border-stitch-on-surface/10 relative overflow-hidden rounded-3xl border bg-gradient-to-br from-lume-coral/22 via-white to-lume-violet/16 p-6 shadow-[0_24px_60px_rgba(155,62,32,0.14),0_0_0_1px_rgba(167,139,250,0.08)] md:p-10 dark:from-orange-500/18 dark:via-stone-900 dark:to-violet-900/25 dark:shadow-[0_0_0_1px_rgba(167,139,250,0.12)]"
        initial={reduceMotion ? false : { opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45 }}
      >
        <div className="pointer-events-none absolute -right-16 -bottom-16 h-48 w-48 rounded-full bg-lume-coral/25 blur-3xl dark:bg-orange-500/22" />
        <div className="pointer-events-none absolute top-0 left-1/2 h-32 w-32 -translate-x-1/2 rounded-full bg-lume-violet/25 blur-2xl dark:bg-violet-500/18" />
        <div className="relative z-10">
          <h1 className="text-page-title text-2xl font-extrabold tracking-tight md:text-3xl">
            {pipelineHeadlineLoading ? (
              <>You&apos;re currently working on…</>
            ) : (
              <>
                You&apos;re currently working on {pipelineStats?.activeCandidateCount ?? 0} candidates within{' '}
                {pipelineStats?.activePositionCount ?? 0}{' '}
                {pipelineStats?.activePositionCount === 1 ? 'position' : 'positions'}.
              </>
            )}
          </h1>
        </div>
      </motion.section>

      {!pipelineHeadlineLoading && pipelineStats ? (
        <motion.section
          className="border-stitch-on-surface/10 grid gap-3 rounded-3xl border bg-white/60 p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-4 dark:border-stone-700 dark:bg-stone-900/50"
          initial={reduceMotion ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: reduceMotion ? 0 : 0.05 }}
          aria-label="Pipeline and task overview"
        >
          <div className="rounded-2xl border border-stone-200/80 bg-white/90 px-4 py-3 dark:border-stone-600 dark:bg-stone-900/70">
            <p className="text-ink-muted text-[10px] font-bold tracking-wide uppercase dark:text-stone-500">Candidates</p>
            <p className="text-stitch-on-surface mt-1 text-2xl font-extrabold tabular-nums dark:text-stone-100">
              {pipelineStats.activeCandidateCount}
            </p>
            <p className="text-stitch-muted mt-0.5 text-xs dark:text-stone-500">In progress — not rejected or withdrawn</p>
          </div>
          <div className="rounded-2xl border border-stone-200/80 bg-white/90 px-4 py-3 dark:border-stone-600 dark:bg-stone-900/70">
            <p className="text-ink-muted text-[10px] font-bold tracking-wide uppercase dark:text-stone-500">Positions</p>
            <p className="text-stitch-on-surface mt-1 text-2xl font-extrabold tabular-nums dark:text-stone-100">
              {pipelineStats.activePositionCount}
            </p>
            <p className="text-stitch-muted mt-0.5 text-xs dark:text-stone-500">Open or on-hold roles with someone in the pipeline</p>
          </div>
          <div className="rounded-2xl border border-stone-200/80 bg-white/90 px-4 py-3 dark:border-stone-600 dark:bg-stone-900/70">
            <p className="text-ink-muted text-[10px] font-bold tracking-wide uppercase dark:text-stone-500">Tasks waiting</p>
            <p className="text-stitch-on-surface mt-1 text-2xl font-extrabold tabular-nums dark:text-stone-100">
              {taskKpisPending ? '–' : (taskKpis?.todo ?? 0) + (taskKpis?.inProgress ?? 0)}
            </p>
            <p className="text-stitch-muted mt-0.5 text-xs dark:text-stone-500">To do + in progress</p>
          </div>
          <Link
            to="/tasks"
            className="rounded-2xl border border-stone-200/80 bg-gradient-to-br from-teal-50/90 to-white px-4 py-3 transition hover:border-[#9b3e20]/40 hover:shadow-md dark:border-stone-600 dark:from-teal-950/40 dark:to-stone-900/70 dark:hover:border-orange-500/35"
          >
            <p className="text-ink-muted text-[10px] font-bold tracking-wide uppercase dark:text-stone-500">Task completion</p>
            <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="text-stitch-on-surface text-2xl font-extrabold tabular-nums dark:text-stone-100">
                {taskKpisPending ? '–' : taskKpis?.done ?? 0}
              </span>
              <span className="text-stitch-muted text-sm dark:text-stone-500">
                done
                {!taskKpisPending && (taskKpis?.overdue ?? 0) > 0 ? (
                  <span className="text-rose-600 dark:text-rose-400"> · {taskKpis?.overdue} overdue</span>
                ) : null}
              </span>
            </div>
            <p className="text-accent mt-2 text-xs font-bold underline dark:text-orange-300">Open tasks →</p>
          </Link>
        </motion.section>
      ) : null}

      {pipelineHints.stuck.length > 0 || pipelineHints.stale.length > 0 ? (
        <motion.section
          className="rounded-2xl border border-amber-200/80 bg-amber-50/50 p-4 dark:border-amber-900/40 dark:bg-amber-950/20"
          initial={reduceMotion ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <h2 className="text-ink text-lg font-semibold dark:text-stone-100">Pipeline health</h2>
          <p className="text-stitch-muted mt-1 text-xs dark:text-stone-400">
            Candidates active with no update in 7+ days; open roles with no update in 14+ days.
          </p>
          {pipelineHints.stuck.length ? (
            <ul className="text-ink mt-2 list-inside list-disc text-sm dark:text-stone-200">
              {pipelineHints.stuck.slice(0, 6).map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          ) : null}
          {pipelineHints.stale.length ? (
            <ul className="text-ink mt-2 list-inside list-disc text-sm dark:text-stone-200">
              {pipelineHints.stale.slice(0, 6).map((s) => (
                <li key={s}>Stale role: {s}</li>
              ))}
            </ul>
          ) : null}
        </motion.section>
      ) : null}

      <OverviewCalendarAndEvents />

      <section aria-labelledby="candidates-overview-heading">
        <details
          open
          className="group border-stitch-on-surface/10 rounded-3xl border bg-white/50 open:bg-white/90 open:shadow-md dark:border-stone-700 dark:bg-stone-900/40 dark:open:bg-stone-900/70"
        >
          <summary className="list-none cursor-pointer rounded-t-3xl px-4 py-4 marker:hidden [&::-webkit-details-marker]:hidden">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <h2
                id="candidates-overview-heading"
                className="text-stitch-on-surface flex items-center gap-2 text-xl font-extrabold md:text-2xl dark:text-stone-100"
              >
                <span className="bg-stone-100 text-stitch-on-surface flex h-9 w-9 items-center justify-center rounded-xl dark:bg-stone-800 dark:text-stone-100">
                  <Users className="h-5 w-5 stroke-[2.25]" aria-hidden />
                </span>
                Candidates overview
              </h2>
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                <div className="flex flex-wrap gap-2 text-xs font-bold uppercase">
                  <button
                    type="button"
                    className={`rounded-full px-3 py-1 ${positionsScope === 'open' ? 'bg-[#9b3e20] text-white dark:bg-orange-600' : 'border border-stone-300 dark:border-stone-600'}`}
                    onClick={(e) => {
                      e.stopPropagation()
                      setPositionsScope('open')
                    }}
                  >
                    Open
                  </button>
                  <button
                    type="button"
                    className={`rounded-full px-3 py-1 ${positionsScope === 'on_hold' ? 'bg-[#9b3e20] text-white dark:bg-orange-600' : 'border border-stone-300 dark:border-stone-600'}`}
                    onClick={(e) => {
                      e.stopPropagation()
                      setPositionsScope('on_hold')
                    }}
                  >
                    On hold
                  </button>
                  <button
                    type="button"
                    className={`rounded-full px-3 py-1 ${positionsScope === 'all' ? 'bg-[#9b3e20] text-white dark:bg-orange-600' : 'border border-stone-300 dark:border-stone-600'}`}
                    onClick={(e) => {
                      e.stopPropagation()
                      setPositionsScope('all')
                    }}
                  >
                    All
                  </button>
                </div>
                <ChevronDown className="text-stitch-muted h-5 w-5 shrink-0 transition group-open:rotate-180" aria-hidden />
              </div>
            </div>
            <p className="text-stitch-muted mt-1 text-sm">Roles and who you&apos;re moving — filter the list, or collapse this block.</p>
          </summary>
          <div className="border-stitch-on-surface/10 border-t px-4 pb-4 dark:border-stone-700">
            {topPositionsQ.isLoading ? (
              <p className="text-stitch-muted text-sm">Loading…</p>
            ) : displayTopPositions.length === 0 ? (
              <p className="text-stitch-muted text-sm">No positions yet.</p>
            ) : (
              <ul className="space-y-3">
                {displayTopPositions.map((p) => {
                  const company = (p.companies as unknown as { name: string } | null)?.name
                  const cands =
                    (p.position_candidates as unknown as Array<{
                      id: string
                      status: string
                      created_at: string
                      updated_at: string
                      candidate_id: string
                      candidates: { id: string; full_name: string } | { id: string; full_name: string }[] | null
                      position_stages: { name: string } | { name: string }[] | null
                    }>) ?? []
                  const pill = positionLifecyclePill(p.status as string)
                  return (
                    <li
                      key={p.id}
                      className="rounded-2xl border border-stone-200/80 bg-white/80 shadow-sm dark:border-stone-600 dark:bg-stone-900/50"
                    >
                      <div
                        role="button"
                        tabIndex={0}
                        className="cursor-pointer rounded-2xl p-3 transition hover:bg-stone-50/90 dark:hover:bg-stone-800/40"
                        onClick={() => navigate(`/positions/${p.id}`)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            navigate(`/positions/${p.id}`)
                          }
                        }}
                      >
                        <div className="flex items-start gap-3">
                          <div className="min-w-0 flex-1">
                            <span className="text-stitch-on-surface block truncate font-semibold dark:text-stone-100" title={p.title}>
                              {p.title}
                            </span>
                            {company ? <p className="text-stitch-muted mt-1 truncate text-xs">{company}</p> : null}
                          </div>
                          <span
                            className={`inline-flex shrink-0 items-center self-start rounded-full border px-2.5 py-0.5 text-[11px] font-bold tracking-wide whitespace-nowrap uppercase ${pill.className}`}
                          >
                            {pill.label}
                          </span>
                        </div>
                        {cands.length === 0 ? <p className="text-stitch-muted mt-2 text-xs">No candidates yet.</p> : null}
                      </div>
                      {cands.length ? (
                        <ul
                          className="space-y-1 border-t border-stone-200/60 px-3 pt-2 pb-3 dark:border-stone-600"
                          onClick={(e) => e.stopPropagation()}
                          onKeyDown={(e) => e.stopPropagation()}
                        >
                          {cands.map((pc) => {
                            const cand = nestedOne(pc.candidates)
                            const cid = cand?.id ?? pc.candidate_id
                            const daysOnRole = differenceInCalendarDays(new Date(), new Date(pc.created_at))
                            const stageName = nestedOne(pc.position_stages)?.name ?? '—'
                            const stPill = assignmentStatusPill(pc.status)
                            return (
                              <li key={pc.id} className="flex flex-wrap items-center gap-2 text-sm">
                                <Link
                                  to={`/positions/${p.id}?candidate=${cid}`}
                                  className="font-medium text-[#006384] hover:underline dark:text-cyan-300"
                                >
                                  {cand?.full_name ?? '—'}
                                </Link>
                                <span
                                  className="text-stitch-muted shrink-0 rounded-md border border-stone-200/80 bg-stone-50 px-1.5 py-0.5 text-[10px] font-bold tabular-nums dark:border-stone-600 dark:bg-stone-800"
                                  title="Days since added to this role"
                                >
                                  {daysOnRole}d
                                </span>
                                <span className="text-stitch-muted text-xs">{stageName}</span>
                                <span
                                  className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[10px] font-bold tracking-wide uppercase ${stPill.className}`}
                                >
                                  {stPill.label}
                                </span>
                              </li>
                            )
                          })}
                        </ul>
                      ) : null}
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </details>
      </section>
    </div>
  )
}
