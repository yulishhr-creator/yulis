import { Link, useSearchParams, Navigate } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'

import { useDashboardTaskKpis } from '@/hooks/useDashboardTaskKpis'
import { usePipelineHeadlineStats } from '@/hooks/usePipelineHeadlineStats'
import { OverviewCalendarAndEvents } from '@/components/dashboard/OverviewCalendarAndEvents'

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
  const reduceMotion = useReducedMotion()
  const { data: pipelineStats, isLoading: pipelineHeadlineLoading } = usePipelineHeadlineStats()
  const { data: taskKpis, isPending: taskKpisPending } = useDashboardTaskKpis()

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
              <span className="text-stitch-muted text-sm dark:text-stone-500">done</span>
            </div>
            <p className="text-accent mt-2 text-xs font-bold underline dark:text-orange-300">Open tasks →</p>
          </Link>
        </motion.section>
      ) : null}

      <OverviewCalendarAndEvents />
    </div>
  )
}
