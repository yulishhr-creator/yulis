import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { motion, useReducedMotion } from 'framer-motion'
import { Check, ChevronDown, Timer, ListFilter, Plus, Users } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { differenceInCalendarDays } from 'date-fns'

import { useAuth } from '@/auth/useAuth'
import { getSupabase } from '@/lib/supabase'
import { formatDue } from '@/lib/dates'
import { Modal } from '@/components/ui/Modal'
import { useWorkTimer } from '@/work/WorkTimerContext'
import { useToast } from '@/hooks/useToast'
function positionStatusPill(status: string): { label: string; className: string } {
  switch (status) {
    case 'pending':
      return {
        label: 'Pending',
        className:
          'border-amber-200/80 bg-amber-50 text-amber-900 dark:border-amber-700/60 dark:bg-amber-950/50 dark:text-amber-100',
      }
    case 'in_progress':
      return {
        label: 'In progress',
        className:
          'border-sky-200/80 bg-sky-50 text-sky-900 dark:border-cyan-700/60 dark:bg-cyan-950/40 dark:text-cyan-100',
      }
    case 'success':
      return {
        label: 'Success',
        className:
          'border-emerald-200/80 bg-emerald-50 text-emerald-900 dark:border-emerald-700/60 dark:bg-emerald-950/40 dark:text-emerald-100',
      }
    case 'cancelled':
      return {
        label: 'Cancelled',
        className:
          'border-stone-200/80 bg-stone-100 text-stone-700 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-300',
      }
    default:
      return {
        label: status.replace('_', ' '),
        className: 'border-stone-200/80 bg-stone-50 text-stone-700 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-300',
      }
  }
}

export function DashboardPage() {
  const { user } = useAuth()
  const supabase = getSupabase()
  const uid = user?.id
  const reduceMotion = useReducedMotion()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const qc = useQueryClient()
  const timer = useWorkTimer()
  const { success, error: toastError } = useToast()
  const [trackOpen, setTrackOpen] = useState(false)
  const [trackPosId, setTrackPosId] = useState('')
  const [positionsScope, setPositionsScope] = useState<'open' | 'in_progress' | 'all'>('open')
  /** `all` = show every task; `Set` = only tasks whose position's company id is in the set */
  const [companyTaskFilter, setCompanyTaskFilter] = useState<'all' | Set<string>>('all')
  const [companyFilterOpen, setCompanyFilterOpen] = useState(false)
  const companyFilterRef = useRef<HTMLDivElement>(null)
  const [taskModalOpen, setTaskModalOpen] = useState(false)
  const [newTaskTitle, setNewTaskTitle] = useState('')
  const [newTaskDue, setNewTaskDue] = useState('')
  const [newTaskPositionId, setNewTaskPositionId] = useState('')
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
          positions ( id, title, company_id, companies ( id, name ) ),
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
    queryKey: ['dashboard-top-positions', uid, positionsScope],
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
          candidates ( id, full_name, outcome, position_stage_id, updated_at, created_at, position_stages ( name ) )
        `,
        )
        .eq('user_id', uid!)
        .is('deleted_at', null)
        .order('updated_at', { ascending: false })
        .limit(12)
      if (positionsScope === 'open') q = q.eq('status', 'pending')
      else if (positionsScope === 'in_progress') q = q.eq('status', 'in_progress')
      const { data, error } = await q
      if (error) throw error
      return data ?? []
    },
  })

  const pipelineStatsQ = useQuery({
    queryKey: ['dashboard-pipeline-stats', uid],
    enabled: Boolean(supabase && uid),
    queryFn: async () => {
      const { data: positions, error: pErr } = await supabase!
        .from('positions')
        .select('id')
        .eq('user_id', uid!)
        .is('deleted_at', null)
        .in('status', ['pending', 'in_progress'])
      if (pErr) throw pErr
      const posIds = (positions ?? []).map((p) => p.id)
      if (posIds.length === 0) {
        return { activeCandidateCount: 0, activePositionCount: 0 }
      }
      const { count, error: cErr } = await supabase!
        .from('candidates')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', uid!)
        .is('deleted_at', null)
        .eq('outcome', 'active')
        .in('position_id', posIds)
      if (cErr) throw cErr
      return { activeCandidateCount: count ?? 0, activePositionCount: posIds.length }
    },
  })

  const allPositionsForTaskQ = useQuery({
    queryKey: ['dashboard-all-positions', uid],
    enabled: Boolean(supabase && uid && taskModalOpen),
    queryFn: async () => {
      const { data, error } = await supabase!
        .from('positions')
        .select('id, title, companies ( name )')
        .eq('user_id', uid!)
        .is('deleted_at', null)
        .order('title')
      if (error) throw error
      return data ?? []
    },
  })

  const timerPositionsQ = useQuery({
    queryKey: ['dashboard-timer-positions', uid],
    enabled: Boolean(supabase && uid),
    queryFn: async () => {
      const { data, error } = await supabase!
        .from('positions')
        .select('id, title, status, companies ( name )')
        .eq('user_id', uid!)
        .is('deleted_at', null)
        .in('status', ['pending', 'in_progress'])
        .order('title')
      if (error) throw error
      return data ?? []
    },
  })

  const tasks = tasksQ.data ?? []
  const kpis = kpisQ.data
  const pipelineStats = pipelineStatsQ.data

  const taskCompanyIds = useMemo(() => {
    const map = new Map<string, string>()
    for (const row of tasks) {
      const pos = row.positions as unknown as
        | { companies: { id: string; name: string } | null; company_id?: string | null }
        | null
      const id = pos?.companies?.id ?? pos?.company_id
      const name = pos?.companies?.name
      if (id && name) map.set(id, name)
    }
    return map
  }, [tasks])

  const filteredTasks = useMemo(() => {
    if (companyTaskFilter === 'all') return tasks
    if (companyTaskFilter.size === 0) return []
    return tasks.filter((row) => {
      const pos = row.positions as unknown as
        | { companies: { id: string } | null; company_id?: string | null }
        | null
      const cid = pos?.companies?.id ?? pos?.company_id
      if (cid == null) return false
      return companyTaskFilter.has(cid)
    })
  }, [tasks, companyTaskFilter])

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!companyFilterRef.current?.contains(e.target as Node)) setCompanyFilterOpen(false)
    }
    if (companyFilterOpen) document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [companyFilterOpen])

  useEffect(() => {
    if (searchParams.get('addTask') !== '1') return
    setNewTaskTitle('')
    setNewTaskDue('')
    const pid = sessionStorage.getItem('yulis_task_prefill_position_id')
    setNewTaskPositionId(pid ?? '')
    setTaskModalOpen(true)
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.delete('addTask')
        return next
      },
      { replace: true },
    )
  }, [searchParams, setSearchParams])

  useEffect(() => {
    if (searchParams.get('trackTime') !== '1') return
    setTrackOpen(true)
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.delete('trackTime')
        return next
      },
      { replace: true },
    )
  }, [searchParams, setSearchParams])

  const addTaskFromDashboard = useMutation({
    mutationFn: async () => {
      if (!newTaskPositionId.trim()) throw new Error('Choose a position')
      const { error } = await supabase!.from('tasks').insert({
        user_id: uid!,
        position_id: newTaskPositionId.trim(),
        title: newTaskTitle.trim() || 'Task',
        status: 'todo',
        due_at: newTaskDue ? new Date(newTaskDue).toISOString() : null,
      })
      if (error) throw error
    },
    onSuccess: async () => {
      success('Task added')
      setTaskModalOpen(false)
      setNewTaskTitle('')
      setNewTaskDue('')
      setNewTaskPositionId('')
      await qc.invalidateQueries({ queryKey: ['dashboard-tasks'] })
      await qc.invalidateQueries({ queryKey: ['dashboard-task-kpis'] })
      await qc.invalidateQueries({ queryKey: ['position-tasks'] })
      await qc.invalidateQueries({ queryKey: ['notifications-overdue-tasks'] })
      await qc.invalidateQueries({ queryKey: ['notification-count'] })
    },
    onError: (e: Error) => toastError(e.message),
  })

  const pipelineHints = useMemo(() => {
    const rows = topPositionsQ.data ?? []
    const stuck: string[] = []
    const stale: string[] = []
    const now = new Date()
    for (const p of rows) {
      const posUpdated = new Date(p.updated_at as string)
      if (
        (p.status === 'pending' || p.status === 'in_progress') &&
        differenceInCalendarDays(now, posUpdated) >= 14
      ) {
        stale.push(p.title as string)
      }
      const cands =
        (p.candidates as unknown as Array<{
          full_name: string
          outcome: string
          updated_at: string
        }>) ?? []
      for (const c of cands) {
        if (c.outcome !== 'active') continue
        if (differenceInCalendarDays(now, new Date(c.updated_at)) >= 7) {
          stuck.push(`${c.full_name} · ${p.title}`)
        }
      }
    }
    return { stuck, stale }
  }, [topPositionsQ.data])

  useEffect(() => {
    if (!trackOpen) return
    const rows = timerPositionsQ.data ?? []
    if (rows.length && !trackPosId) setTrackPosId(rows[0]!.id)
  }, [trackOpen, timerPositionsQ.data, trackPosId])

  const markTaskDone = useMutation({
    mutationFn: async (taskId: string) => {
      const { error } = await supabase!.from('tasks').update({ status: 'done' }).eq('id', taskId).eq('user_id', uid!)
      if (error) throw error
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['dashboard-tasks'] })
      await qc.invalidateQueries({ queryKey: ['dashboard-task-kpis'] })
      await qc.invalidateQueries({ queryKey: ['position-tasks'] })
      await qc.invalidateQueries({ queryKey: ['notifications-overdue-tasks'] })
      await qc.invalidateQueries({ queryKey: ['notification-count'] })
    },
  })

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
          <h1 className="font-stitch-head text-stitch-on-surface text-2xl font-extrabold tracking-tight md:text-3xl dark:text-stone-100">
            {pipelineStatsQ.isLoading ? (
              <>You&apos;re currently working on…</>
            ) : (
              <>
                You&apos;re currently working on{' '}
                <span className="text-[#9b3e20] dark:text-orange-300">{pipelineStats?.activeCandidateCount ?? 0}</span> candidates within{' '}
                <span className="text-[#9b3e20] dark:text-orange-300">{pipelineStats?.activePositionCount ?? 0}</span> positions, good luck
              </>
            )}
          </h1>
          <p className="text-stitch-muted mt-3 max-w-xl text-base leading-relaxed md:text-lg dark:text-stone-400">
            So, what would you like to do now?
          </p>
          <div className="mt-5 flex flex-wrap items-center gap-2">
            <motion.div className="min-w-0 flex-1 sm:flex-none" whileHover={reduceMotion ? undefined : { scale: 1.02 }} whileTap={reduceMotion ? undefined : { scale: 0.98 }}>
              <Link
                to="/?addTask=1"
                className="inline-flex w-full min-w-0 items-center justify-center gap-1.5 rounded-full bg-gradient-to-r from-[#9b3e20] to-[#fd8863] px-3 py-2 text-xs font-bold tracking-wide text-white uppercase shadow-md shadow-[#9b3e20]/20 sm:w-auto sm:px-4 sm:text-sm"
              >
                <Plus className="h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4" aria-hidden />
                Create task
              </Link>
            </motion.div>
            <motion.div className="min-w-0 flex-1 sm:flex-none" whileHover={reduceMotion ? undefined : { scale: 1.02 }} whileTap={reduceMotion ? undefined : { scale: 0.98 }}>
              <button
                type="button"
                onClick={() => setTrackOpen(true)}
                className="border-[#9b3e20]/35 inline-flex w-full min-w-0 items-center justify-center gap-1.5 rounded-full border-2 bg-stone-900/5 px-3 py-2 text-xs font-bold text-[#7c2d12] shadow-sm dark:border-orange-400/35 dark:bg-stone-800/80 dark:text-amber-200 sm:w-auto sm:px-4 sm:text-sm"
              >
                <Timer className="h-3.5 w-3.5 shrink-0 text-[#9b3e20] dark:text-orange-300 sm:h-4 sm:w-4" aria-hidden />
                Track time
              </button>
            </motion.div>
          </div>
        </div>
      </motion.section>

      {kpis ? (
        <motion.section
          aria-label="Task overview"
          initial={reduceMotion ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
        >
          <h2 className="sr-only">Task counts</h2>
          <p className="font-stitch-head text-sm font-semibold tracking-tight text-[#302e2b] dark:text-stone-200">
            Everything open — sorted by due date.
          </p>
          <article className="mt-3 grid grid-cols-3 gap-0 overflow-hidden rounded-2xl border border-stone-200/80 bg-white shadow-[0_16px_40px_rgba(48,46,43,0.07)] dark:border-stone-600 dark:bg-stone-900 dark:shadow-[0_16px_40px_rgba(0,0,0,0.25)] md:rounded-3xl">
            <div className="flex flex-col items-center justify-center border-r border-stone-200/70 px-2 py-4 text-center dark:border-stone-600 sm:px-4 sm:py-5">
              <span className="font-stitch-label mb-0.5 text-[10px] font-bold tracking-[0.18em] text-[#165c25] uppercase dark:text-emerald-400">
                To do
              </span>
              <p className="font-stitch-head text-stitch-on-surface text-2xl font-extrabold tabular-nums sm:text-3xl dark:text-stone-100">{kpis.todo}</p>
              <span className="text-stitch-muted mt-1 hidden text-[11px] font-medium sm:inline dark:text-stone-500">
                {kpis.todo === 1 ? '1 waiting' : `${kpis.todo} waiting`}
              </span>
            </div>
            <div className="flex flex-col items-center justify-center border-r border-stone-200/70 px-2 py-4 text-center dark:border-stone-600 sm:px-4 sm:py-5">
              <span className="font-stitch-label mb-0.5 text-[10px] font-bold tracking-[0.18em] text-[#004d68] uppercase dark:text-cyan-400">
                In progress
              </span>
              <p className="font-stitch-head text-stitch-on-surface text-2xl font-extrabold tabular-nums sm:text-3xl dark:text-stone-100">{kpis.inProgress}</p>
              <span className="text-stitch-muted mt-1 hidden text-[11px] font-medium sm:inline dark:text-stone-500">
                {kpis.inProgress === 0 ? 'None active' : `${kpis.inProgress} active`}
              </span>
            </div>
            <div className="flex flex-col items-center justify-center px-2 py-4 text-center sm:px-4 sm:py-5">
              <span className="font-stitch-label mb-0.5 text-[10px] font-bold tracking-[0.18em] text-[#9f0519] uppercase dark:text-red-400">
                Overdue
              </span>
              <p className="font-stitch-head text-stitch-on-surface text-2xl font-extrabold tabular-nums sm:text-3xl dark:text-stone-100">{kpis.overdue}</p>
              <span className="text-stitch-muted mt-1 hidden text-[11px] font-medium sm:inline dark:text-stone-500">
                {kpis.overdue > 0 ? `${kpis.overdue} past due` : 'On schedule'}
              </span>
            </div>
          </article>
        </motion.section>
      ) : null}

      {pipelineHints.stuck.length > 0 || pipelineHints.stale.length > 0 ? (
        <motion.section
          className="rounded-2xl border border-amber-200/80 bg-amber-50/50 p-4 dark:border-amber-900/40 dark:bg-amber-950/20"
          initial={reduceMotion ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <h2 className="font-stitch-head text-lg font-extrabold text-amber-950 dark:text-amber-100">Pipeline health</h2>
          <p className="text-stitch-muted mt-1 text-xs dark:text-stone-400">
            Candidates active with no update in 7+ days; open roles with no update in 14+ days.
          </p>
          {pipelineHints.stuck.length ? (
            <ul className="mt-2 list-inside list-disc text-sm text-amber-950 dark:text-amber-50">
              {pipelineHints.stuck.slice(0, 6).map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          ) : null}
          {pipelineHints.stale.length ? (
            <ul className="mt-2 list-inside list-disc text-sm text-amber-900/90 dark:text-amber-100/90">
              {pipelineHints.stale.slice(0, 6).map((s) => (
                <li key={s}>Stale role: {s}</li>
              ))}
            </ul>
          ) : null}
        </motion.section>
      ) : null}

      <section aria-labelledby="tasks-heading">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h2
            id="tasks-heading"
            className="font-stitch-head text-stitch-on-surface flex items-center gap-2 text-xl font-extrabold md:text-2xl dark:text-stone-100"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-[#b4fdb4]/50 to-[#97daff]/40 text-[#165c25] dark:from-emerald-900/40 dark:to-cyan-900/30 dark:text-emerald-300">
              <Check className="h-5 w-5 stroke-[2.5]" aria-hidden />
            </span>
            Your tasks
          </h2>
          <div className="relative shrink-0" ref={companyFilterRef}>
            <button
              type="button"
              onClick={() => setCompanyFilterOpen((o) => !o)}
              className={`border-line flex h-10 w-10 items-center justify-center rounded-2xl border shadow-sm transition dark:border-line-dark ${
                companyTaskFilter !== 'all'
                  ? 'bg-[#9b3e20]/15 text-[#9b3e20] ring-2 ring-[#9b3e20]/25 dark:text-orange-300'
                  : 'bg-white/90 text-stone-600 dark:bg-stone-800 dark:text-stone-300'
              }`}
              aria-expanded={companyFilterOpen}
              aria-haspopup="listbox"
              aria-label="Filter tasks by company"
            >
              <ListFilter className="h-5 w-5" aria-hidden />
            </button>
            {companyFilterOpen ? (
              <div
                className="border-line bg-paper absolute top-full right-0 z-20 mt-2 w-[min(18rem,calc(100vw-2rem))] rounded-2xl border p-3 shadow-xl dark:border-line-dark dark:bg-stone-900"
                role="listbox"
                aria-label="Companies"
              >
                <p className="text-ink-muted mb-2 text-xs font-semibold uppercase tracking-wide">Companies</p>
                <div className="mb-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="rounded-full bg-[#9b3e20] px-3 py-1 text-xs font-bold text-white dark:bg-orange-600"
                    onClick={() => {
                      setCompanyTaskFilter('all')
                      setCompanyFilterOpen(false)
                    }}
                  >
                    All
                  </button>
                  <button
                    type="button"
                    className="border-line rounded-full border px-3 py-1 text-xs font-bold dark:border-stone-600"
                    onClick={() => setCompanyTaskFilter(new Set())}
                  >
                    Unselect all
                  </button>
                </div>
                <ul className="max-h-52 space-y-1 overflow-y-auto">
                  {[...taskCompanyIds.entries()].map(([id, name]) => {
                    const checked = companyTaskFilter === 'all' ? true : companyTaskFilter.has(id)
                    return (
                      <li key={id}>
                        <label className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-stone-100 dark:hover:bg-stone-800">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => {
                              if (companyTaskFilter === 'all') {
                                const all = new Set(taskCompanyIds.keys())
                                all.delete(id)
                                setCompanyTaskFilter(all)
                                return
                              }
                              const next = new Set(companyTaskFilter)
                              if (next.has(id)) next.delete(id)
                              else next.add(id)
                              if (next.size === taskCompanyIds.size) setCompanyTaskFilter('all')
                              else setCompanyTaskFilter(next)
                            }}
                          />
                          <span className="truncate">{name}</span>
                        </label>
                      </li>
                    )
                  })}
                </ul>
                {taskCompanyIds.size === 0 ? (
                  <p className="text-ink-muted text-xs">No companies on open tasks yet.</p>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
        <p className="text-stitch-muted mt-1 text-sm">Everything open — sorted by due date.</p>
        {tasksQ.isLoading ? (
          <p className="text-stitch-muted mt-4 text-sm">Loading…</p>
        ) : tasks.length === 0 ? (
          <motion.p
            className="text-stitch-muted mt-4 rounded-2xl border border-dashed border-[#97daff]/60 bg-[#97daff]/10 px-4 py-6 text-center text-sm dark:border-cyan-800 dark:bg-cyan-950/30"
            initial={reduceMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            No open tasks. Use the <span className="font-semibold">+</span> button (Add task) or open a{' '}
            <Link to="/positions" className="font-semibold text-[#9b3e20] underline dark:text-orange-300">position</Link>.
          </motion.p>
        ) : filteredTasks.length === 0 && companyTaskFilter !== 'all' ? (
          <p className="text-stitch-muted mt-4 rounded-2xl border border-dashed border-stone-300 px-4 py-6 text-center text-sm dark:border-stone-600">
            No tasks for the selected companies. Choose <span className="font-semibold">All</span> or pick at least one company.
          </p>
        ) : (
          <ul className="mt-4 space-y-3">
            {filteredTasks.map((row, i) => {
              const pos = row.positions as unknown as
                | { id: string; title: string; companies: { id?: string; name: string } | null }
                | null
              const cand = row.candidates as unknown as { id: string; full_name: string } | null
              const posTitle = pos?.title ?? 'Position'
              const companyName = pos?.companies?.name
              const dueLabel = row.due_at ? formatDue(row.due_at) : null
              return (
                <motion.li
                  key={row.id}
                  initial={reduceMotion ? false : { opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: reduceMotion ? 0 : i * 0.03 }}
                  className={`flex gap-3 rounded-2xl border border-white/60 py-4 pl-5 pr-3 shadow-[0_12px_32px_rgba(48,46,43,0.06)] dark:border-stone-700 ${taskAccent(row.status)} border-l-4`}
                >
                  <div className="min-w-0 flex-1">
                    {dueLabel ? (
                      <p className="text-stitch-muted mb-1 text-[11px] font-medium dark:text-stone-500">Due date: {dueLabel}</p>
                    ) : (
                      <p className="text-stitch-muted mb-1 text-[11px] font-medium dark:text-stone-500">Due date: none set</p>
                    )}
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
                      ) : null}
                      .
                    </p>
                    {row.status === 'in_progress' ? (
                      <p className="text-[#006384] mt-2 text-xs font-bold uppercase tracking-wide dark:text-cyan-400">In progress</p>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    className="text-stitch-muted hover:bg-emerald-500/15 hover:text-emerald-700 dark:hover:text-emerald-300 mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center self-start rounded-2xl border border-emerald-200/60 bg-white/80 transition dark:border-emerald-800/60 dark:bg-stone-800/80"
                    aria-label={`Mark done: ${row.title}`}
                    disabled={markTaskDone.isPending && markTaskDone.variables === row.id}
                    onClick={() => markTaskDone.mutate(row.id)}
                  >
                    {markTaskDone.isPending && markTaskDone.variables === row.id ? (
                      <span className="h-5 w-5 animate-pulse rounded-full bg-emerald-400/50" aria-hidden />
                    ) : (
                      <Check className="h-5 w-5 stroke-[2.75] text-emerald-700 dark:text-emerald-400" aria-hidden />
                    )}
                  </button>
                </motion.li>
              )
            })}
          </ul>
        )}
      </section>

      <Modal open={trackOpen} onClose={() => setTrackOpen(false)} title="Track time on a role">
        <p className="text-ink-muted mb-3 text-sm">Every session is tied to a position. Stop the header timer when you are done.</p>
        {timer.open ? (
          <p className="mb-3 text-sm font-medium text-[#9b3e20] dark:text-orange-300">A timer is already running — stop it first.</p>
        ) : null}
        {timerPositionsQ.isLoading ? (
          <p className="text-sm">Loading roles…</p>
        ) : (timerPositionsQ.data ?? []).length === 0 ? (
          <p className="text-sm">No active positions. Create or reopen a role first.</p>
        ) : (
          <>
            <label className="mb-3 flex flex-col gap-1 text-sm">
              Position
              <select
                value={trackPosId}
                onChange={(e) => setTrackPosId(e.target.value)}
                className="border-line rounded-xl border px-3 py-2 dark:border-line-dark dark:bg-stone-900/50"
              >
                {(timerPositionsQ.data ?? []).map((row) => {
                  const co = row.companies as unknown as { name: string } | null
                  return (
                    <option key={row.id} value={row.id}>
                      {row.title}
                      {co?.name ? ` — ${co.name}` : ''}
                    </option>
                  )
                })}
              </select>
            </label>
            <button
              type="button"
              disabled={Boolean(timer.open) || !trackPosId}
              className="w-full rounded-full bg-gradient-to-r from-[#9b3e20] to-[#fd8863] py-2.5 text-sm font-bold text-white disabled:opacity-50"
              onClick={async () => {
                const row = (timerPositionsQ.data ?? []).find((r) => r.id === trackPosId)
                const title = row?.title ?? 'Role'
                const r = await timer.start(trackPosId, title)
                if (r.error) toastError(r.error)
                else {
                  success('Timer started')
                  setTrackOpen(false)
                  await qc.invalidateQueries({ queryKey: ['notification-count'] })
                }
              }}
            >
              Start timer
            </button>
          </>
        )}
      </Modal>

      <Modal open={taskModalOpen} onClose={() => setTaskModalOpen(false)} title="New task">
        <p className="text-ink-muted mb-3 text-sm">
          {sessionStorage.getItem('yulis_task_prefill_position_id')
            ? 'Role is pre-filled from the position you were viewing. Change it if needed.'
            : 'Pick which role this task belongs to.'}
        </p>
        {allPositionsForTaskQ.isLoading ? (
          <p className="text-sm">Loading roles…</p>
        ) : (allPositionsForTaskQ.data ?? []).length === 0 ? (
          <p className="text-sm">No positions yet. Create a role first.</p>
        ) : (
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault()
              void addTaskFromDashboard.mutateAsync()
            }}
          >
            <label className="flex flex-col gap-1 text-sm font-medium">
              Position
              <select
                value={newTaskPositionId}
                onChange={(e) => setNewTaskPositionId(e.target.value)}
                className="border-line rounded-xl border px-3 py-2 dark:border-line-dark dark:bg-stone-900/50"
                required
              >
                <option value="">Select a role…</option>
                {(allPositionsForTaskQ.data ?? []).map((row) => {
                  const co = row.companies as unknown as { name: string } | null
                  return (
                    <option key={row.id} value={row.id}>
                      {row.title}
                      {co?.name ? ` — ${co.name}` : ''}
                    </option>
                  )
                })}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium">
              Title
              <input
                value={newTaskTitle}
                onChange={(e) => setNewTaskTitle(e.target.value)}
                className="border-line rounded-xl border px-3 py-2 dark:border-line-dark dark:bg-stone-900/50"
                placeholder="What needs doing?"
                required
              />
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium">
              Due (optional)
              <input
                type="datetime-local"
                value={newTaskDue}
                onChange={(e) => setNewTaskDue(e.target.value)}
                className="border-line rounded-xl border px-3 py-2 dark:border-line-dark dark:bg-stone-900/50"
              />
            </label>
            <button
              type="submit"
              disabled={addTaskFromDashboard.isPending}
              className="rounded-full bg-gradient-to-r from-[#9b3e20] to-[#fd8863] py-2.5 text-sm font-bold text-white disabled:opacity-50"
            >
              {addTaskFromDashboard.isPending ? 'Saving…' : 'Save task'}
            </button>
          </form>
        )}
      </Modal>

      <section aria-labelledby="candidates-overview-heading">
      <details
        open
        className="group border-stitch-on-surface/10 rounded-3xl border bg-white/50 open:bg-white/90 open:shadow-md dark:border-stone-700 dark:bg-stone-900/40 dark:open:bg-stone-900/70"
      >
        <summary className="font-stitch-head list-none cursor-pointer rounded-t-3xl px-4 py-4 marker:hidden [&::-webkit-details-marker]:hidden">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <h2
              id="candidates-overview-heading"
              className="text-stitch-on-surface flex items-center gap-2 text-xl font-extrabold md:text-2xl dark:text-stone-100"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-[#fd8863]/35 to-[#97daff]/40 text-[#9b3e20] dark:from-orange-500/30 dark:to-cyan-500/25 dark:text-orange-300">
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
                  className={`rounded-full px-3 py-1 ${positionsScope === 'in_progress' ? 'bg-[#9b3e20] text-white dark:bg-orange-600' : 'border border-stone-300 dark:border-stone-600'}`}
                  onClick={(e) => {
                    e.stopPropagation()
                    setPositionsScope('in_progress')
                  }}
                >
                  In progress
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
          <p className="text-stitch-muted mt-1 text-sm">Roles and who you&apos;re moving — filter the list, or collapse this block to focus on tasks.</p>
        </summary>
        <div className="border-stitch-on-surface/10 border-t px-4 pb-4 dark:border-stone-700">
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
                    created_at: string
                    position_stages: { name: string } | null
                  }>) ?? []
                const pill = positionStatusPill(p.status)
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
                          <span className="font-stitch-head block truncate font-bold text-[#9b3e20] dark:text-orange-300" title={p.title}>
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
                        {cands.map((c) => {
                          const daysOnRole = differenceInCalendarDays(new Date(), new Date(c.created_at))
                          return (
                            <li key={c.id} className="flex flex-wrap items-center gap-2 text-sm">
                              <Link to={`/positions/${p.id}?candidate=${c.id}`} className="font-medium text-[#006384] hover:underline dark:text-cyan-300">
                                {c.full_name}
                              </Link>
                              <span
                                className="text-stitch-muted shrink-0 rounded-md border border-stone-200/80 bg-stone-50 px-1.5 py-0.5 text-[10px] font-bold tabular-nums dark:border-stone-600 dark:bg-stone-800"
                                title="Days since added to this role"
                              >
                                {daysOnRole}d
                              </span>
                              <span className="text-stitch-muted text-xs">
                                {c.position_stages?.name ?? '—'} · {c.outcome}
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
