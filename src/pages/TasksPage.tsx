import { Link, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { motion, useReducedMotion } from 'framer-motion'
import { GripVertical, ListFilter, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'

import { useAuth } from '@/auth/useAuth'
import { useDashboardTaskKpis } from '@/hooks/useDashboardTaskKpis'
import { getSupabase } from '@/lib/supabase'
import { formatDue } from '@/lib/dates'
import { Modal } from '@/components/ui/Modal'
import { useWorkTimer } from '@/work/WorkTimerContext'
import { useToast } from '@/hooks/useToast'

function nestedOne<T>(v: T | T[] | null | undefined): T | null {
  if (v == null) return null
  return Array.isArray(v) ? (v[0] ?? null) : v
}

const VISIBLE_STATUS_ORDER = ['open', 'closed'] as const
type TaskStatus = 'open' | 'closed' | 'archived'

function isTaskStatus(s: string): s is TaskStatus {
  return s === 'open' || s === 'closed' || s === 'archived'
}

function statusLabel(s: TaskStatus): string {
  if (s === 'open') return 'Open'
  if (s === 'closed') return 'Closed'
  return 'Archived'
}

type TaskRow = {
  id: string
  title: string
  description: string | null
  note_in_progress: string | null
  status: string
  due_at: string | null
  created_at: string
  updated_at: string
  position_id: string | null
  position_candidate_id: string | null
  positions: unknown
  position_candidates: unknown
}

export function TasksPage() {
  const { user } = useAuth()
  const supabase = getSupabase()
  const uid = user?.id
  const reduceMotion = useReducedMotion()
  const [searchParams, setSearchParams] = useSearchParams()
  const qc = useQueryClient()
  const timer = useWorkTimer()
  const { success, error: toastError } = useToast()

  const taskStatusParam = searchParams.get('taskStatus')
  const urlStatusFilter = taskStatusParam && isTaskStatus(taskStatusParam) ? taskStatusParam : null
  const companyParam = searchParams.get('company')

  const [trackOpen, setTrackOpen] = useState(false)
  const [trackPosId, setTrackPosId] = useState('')
  const [taskModalOpen, setTaskModalOpen] = useState(false)
  const [newTaskTitle, setNewTaskTitle] = useState('')
  const [newTaskPositionId, setNewTaskPositionId] = useState('')
  const [newTaskPositionCandidateId, setNewTaskPositionCandidateId] = useState('')
  const [newTaskDescription, setNewTaskDescription] = useState('')
  const [taskTemplateId, setTaskTemplateId] = useState('')
  const [saveTaskAsTemplate, setSaveTaskAsTemplate] = useState(false)

  const [companyTaskFilter, setCompanyTaskFilter] = useState<'all' | Set<string>>('all')
  const [companyFilterOpen, setCompanyFilterOpen] = useState(false)
  const companyFilterRef = useRef<HTMLDivElement>(null)

  const [searchText, setSearchText] = useState('')
  const [selectedTask, setSelectedTask] = useState<TaskRow | null>(null)
  const [dropHoverStatus, setDropHoverStatus] = useState<TaskStatus | null>(null)

  const tasksQ = useQuery({
    queryKey: ['tasks-page', uid],
    enabled: Boolean(supabase && uid),
    queryFn: async () => {
      const { data, error } = await supabase!
        .from('tasks')
        .select(
          `
          id,
          title,
          description,
          note_in_progress,
          status,
          due_at,
          created_at,
          updated_at,
          position_id,
          position_candidate_id,
          positions ( id, title, company_id, companies ( id, name ) ),
          position_candidates ( id, candidates ( id, full_name ) )
        `,
        )
        .eq('user_id', uid!)
        .order('updated_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as TaskRow[]
    },
  })

  const kpisQ = useDashboardTaskKpis()

  const timerPositionsQ = useQuery({
    queryKey: ['dashboard-timer-positions', uid],
    enabled: Boolean(supabase && uid),
    queryFn: async () => {
      const { data, error } = await supabase!
        .from('positions')
        .select('id, title, status, companies ( name )')
        .eq('user_id', uid!)
        .is('deleted_at', null)
        .in('status', ['active', 'on_hold'])
        .order('title')
      if (error) throw error
      return data ?? []
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

  const taskTemplatesQ = useQuery({
    queryKey: ['task-templates', uid],
    enabled: Boolean(supabase && uid && taskModalOpen),
    queryFn: async () => {
      const { data, error } = await supabase!
        .from('task_templates')
        .select('id, title, description')
        .eq('user_id', uid!)
        .order('title')
      if (error) throw error
      return data ?? []
    },
  })

  const positionCandidatesForTaskQ = useQuery({
    queryKey: ['dashboard-task-pcs', uid, newTaskPositionId],
    enabled: Boolean(supabase && uid && taskModalOpen && newTaskPositionId.trim()),
    queryFn: async () => {
      const { data, error } = await supabase!
        .from('position_candidates')
        .select('id, status, candidates ( id, full_name )')
        .eq('user_id', uid!)
        .eq('position_id', newTaskPositionId.trim())
        .eq('status', 'in_progress')
        .order('created_at', { ascending: false })
      if (error) throw error
      return data ?? []
    },
  })

  const tasks = tasksQ.data ?? []
  const kpis = kpisQ.data

  const taskCompanyIds = useMemo(() => {
    const map = new Map<string, string>()
    for (const row of tasks) {
      const pos = row.positions as
        | { companies: { id: string; name: string } | null; company_id?: string | null }
        | null
      const id = pos?.companies?.id ?? pos?.company_id
      const name = pos?.companies?.name
      if (id && name) map.set(id, name)
    }
    return map
  }, [tasks])

  const filteredTasks = useMemo(() => {
    let list = tasks
    if (companyTaskFilter !== 'all') {
      if (companyTaskFilter.size === 0) list = []
      else {
        list = list.filter((row) => {
          const pos = row.positions as { companies: { id: string } | null; company_id?: string | null } | null
          const cid = pos?.companies?.id ?? pos?.company_id
          if (cid == null) return false
          return companyTaskFilter.has(cid)
        })
      }
    }
    const q = searchText.trim().toLowerCase()
    if (q) {
      list = list.filter((row) => {
        if (row.title.toLowerCase().includes(q)) return true
        const pos = row.positions as { title?: string; companies?: { name?: string } | null } | null
        if ((pos?.title ?? '').toLowerCase().includes(q)) return true
        const co = pos?.companies?.name ?? ''
        if (co.toLowerCase().includes(q)) return true
        const pc = row.position_candidates as { candidates?: { full_name?: string } | null } | null
        const cand = nestedOne(pc?.candidates ?? null)
        if ((cand?.full_name ?? '').toLowerCase().includes(q)) return true
        return false
      })
    }
    if (urlStatusFilter) {
      list = list.filter((row) => row.status === urlStatusFilter)
    }
    return list
  }, [tasks, companyTaskFilter, searchText, urlStatusFilter])

  const tasksByStatus = useMemo(() => {
    const m: Record<TaskStatus, TaskRow[]> = { todo: [], in_progress: [], done: [] }
    for (const t of filteredTasks) {
      const s = t.status
      if (isTaskStatus(s)) m[s].push(t)
    }
    for (const s of STATUS_ORDER) {
      m[s].sort((a, b) => {
        if (s === 'done') return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
        const ad = a.due_at ? new Date(a.due_at).getTime() : Infinity
        const bd = b.due_at ? new Date(b.due_at).getTime() : Infinity
        return ad - bd
      })
    }
    return m
  }, [filteredTasks])

  useEffect(() => {
    if (!companyParam) return
    setCompanyTaskFilter(new Set([companyParam]))
  }, [companyParam])

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
    setNewTaskDescription('')
    setNewTaskPositionCandidateId('')
    setTaskTemplateId('')
    setSaveTaskAsTemplate(false)
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

  useEffect(() => {
    setNewTaskPositionCandidateId('')
  }, [newTaskPositionId])

  useEffect(() => {
    if (!trackOpen) return
    const rows = timerPositionsQ.data ?? []
    if (rows.length && !trackPosId) setTrackPosId(rows[0]!.id)
  }, [trackOpen, timerPositionsQ.data, trackPosId])

  const updateTaskStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: TaskStatus }) => {
      const { error } = await supabase!.from('tasks').update({ status }).eq('id', id).eq('user_id', uid!)
      if (error) throw error
    },
    onSuccess: async (_data, { id, status }) => {
      setSelectedTask((prev) => (prev && prev.id === id ? { ...prev, status } : prev))
      await qc.invalidateQueries({ queryKey: ['tasks-page'] })
      await qc.invalidateQueries({ queryKey: ['dashboard-task-kpis'] })
      await qc.invalidateQueries({ queryKey: ['position-tasks'] })
      await qc.invalidateQueries({ queryKey: ['notification-count'] })
    },
    onError: (e: Error) => toastError(e.message),
  })

  const addTaskMutation = useMutation({
    mutationFn: async () => {
      if (!newTaskPositionId.trim()) throw new Error('Choose a position')
      const row: Record<string, unknown> = {
        user_id: uid!,
        position_id: newTaskPositionId.trim(),
        title: newTaskTitle.trim() || 'Task',
        description: newTaskDescription.trim() || null,
        status: 'todo',
        due_at: null,
      }
      if (newTaskPositionCandidateId.trim()) {
        row.position_candidate_id = newTaskPositionCandidateId.trim()
      }
      const { error } = await supabase!.from('tasks').insert(row)
      if (error) throw error
      if (saveTaskAsTemplate && newTaskTitle.trim()) {
        const { error: te } = await supabase!.from('task_templates').insert({
          user_id: uid!,
          title: newTaskTitle.trim(),
          description: newTaskDescription.trim() || null,
        })
        if (te) throw te
      }
    },
    onSuccess: async () => {
      success('Task added')
      setTaskModalOpen(false)
      setNewTaskTitle('')
      setNewTaskDescription('')
      setNewTaskPositionId('')
      setNewTaskPositionCandidateId('')
      setTaskTemplateId('')
      setSaveTaskAsTemplate(false)
      await qc.invalidateQueries({ queryKey: ['tasks-page'] })
      await qc.invalidateQueries({ queryKey: ['dashboard-task-kpis'] })
      await qc.invalidateQueries({ queryKey: ['position-tasks'] })
      await qc.invalidateQueries({ queryKey: ['task-templates'] })
      await qc.invalidateQueries({ queryKey: ['notification-count'] })
    },
    onError: (e: Error) => toastError(e.message),
  })

  function parseDragPayload(e: React.DragEvent): { id: string; status: TaskStatus } | null {
    try {
      const raw = e.dataTransfer.getData('application/json')
      if (!raw) return null
      const o = JSON.parse(raw) as { id?: string; status?: string }
      if (!o.id || !o.status || !isTaskStatus(o.status)) return null
      return { id: o.id, status: o.status }
    } catch {
      return null
    }
  }

  function onDragStartTask(e: React.DragEvent, row: TaskRow) {
    if (!isTaskStatus(row.status)) return
    e.dataTransfer.setData('application/json', JSON.stringify({ id: row.id, status: row.status }))
    e.dataTransfer.effectAllowed = 'move'
  }

  function onDragOverStatus(e: React.DragEvent, target: TaskStatus) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDropHoverStatus(target)
  }

  function onDropOnStatus(e: React.DragEvent, target: TaskStatus) {
    e.preventDefault()
    setDropHoverStatus(null)
    const payload = parseDragPayload(e)
    if (!payload || payload.status === target) return
    updateTaskStatus.mutate({ id: payload.id, status: target })
  }

  function setStatusUrl(next: TaskStatus | null) {
    setSearchParams(
      (prev) => {
        const p = new URLSearchParams(prev)
        if (next) p.set('taskStatus', next)
        else p.delete('taskStatus')
        return p
      },
      { replace: true },
    )
  }

  return (
    <div className="flex flex-col gap-8 md:gap-10">
      <motion.section
        className="border-stitch-on-surface/10 relative overflow-hidden rounded-3xl border bg-gradient-to-br from-lume-jade/18 via-white to-lume-sky/14 p-6 shadow-sm md:p-8 dark:from-teal-950/35 dark:via-stone-900 dark:to-cyan-950/25"
        initial={reduceMotion ? false : { opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <h1 className="text-page-title text-2xl font-extrabold tracking-tight md:text-3xl">Tasks</h1>
        <p className="text-ink-muted mt-2 max-w-2xl text-sm dark:text-stone-400">
          Drag rows between status groups to update progress. Open a task for full details.
        </p>
      </motion.section>

      {kpis ? (
        <motion.section aria-label="Task counts" initial={reduceMotion ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {(
              [
                { key: 'todo' as const, label: 'To do', value: kpis.todo, sub: kpis.todo === 1 ? '1 waiting' : `${kpis.todo} waiting` },
                {
                  key: 'in_progress' as const,
                  label: 'In progress',
                  value: kpis.inProgress,
                  sub: kpis.inProgress === 0 ? 'None active' : `${kpis.inProgress} active`,
                },
                {
                  key: 'overdue' as const,
                  label: 'Overdue',
                  value: kpis.overdue,
                  sub: kpis.overdue > 0 ? `${kpis.overdue} past due` : 'On schedule',
                },
                { key: 'done' as const, label: 'Done', value: kpis.done, sub: 'Completed' },
              ] as const
            ).map((card) =>
              card.key === 'overdue' ? (
                <div
                  key={card.key}
                  role="note"
                  className="rounded-2xl border border-stone-200/80 bg-white/90 px-4 py-4 dark:border-stone-600 dark:bg-stone-900/70"
                >
                  <p className="text-ink-muted text-[10px] font-bold tracking-[0.15em] uppercase dark:text-stone-400">{card.label}</p>
                  <p className="text-stitch-on-surface mt-1 text-2xl font-extrabold tabular-nums dark:text-stone-100">{card.value}</p>
                  <p className="text-stitch-muted mt-0.5 text-[11px] dark:text-stone-500">{card.sub}</p>
                </div>
              ) : (
                <button
                  key={card.key}
                  type="button"
                  onClick={() => {
                    if (card.key === 'done') setStatusUrl('done')
                    else if (card.key === 'todo') setStatusUrl('todo')
                    else setStatusUrl('in_progress')
                  }}
                  className={`rounded-2xl border px-4 py-4 text-left transition dark:border-stone-600 ${
                    urlStatusFilter === card.key
                      ? 'border-[#9b3e20] bg-[#fd8863]/12 ring-2 ring-[#9b3e20]/30 dark:bg-orange-950/40'
                      : 'border-stone-200/80 bg-white/90 dark:border-stone-600 dark:bg-stone-900/70'
                  }`}
                >
                  <p className="text-ink-muted text-[10px] font-bold tracking-[0.15em] uppercase dark:text-stone-400">{card.label}</p>
                  <p className="text-stitch-on-surface mt-1 text-2xl font-extrabold tabular-nums dark:text-stone-100">{card.value}</p>
                  <p className="text-stitch-muted mt-0.5 text-[11px] dark:text-stone-500">{card.sub}</p>
                </button>
              ),
            )}
          </div>
          {urlStatusFilter ? (
            <button
              type="button"
              className="text-ink-muted hover:text-ink mt-3 text-xs font-bold underline dark:text-stone-400 dark:hover:text-stone-200"
              onClick={() => setStatusUrl(null)}
            >
              Clear status filter
            </button>
          ) : null}
        </motion.section>
      ) : null}

      <div className="flex flex-wrap items-end justify-between gap-3">
        <label className="flex min-w-[12rem] flex-1 flex-col gap-1 text-sm font-medium">
          Search
          <input
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="Title, role, client, candidate…"
            className="border-line rounded-xl border bg-white px-3 py-2 dark:border-line-dark dark:bg-stone-900/80"
          />
        </label>
        <div className="relative shrink-0" ref={companyFilterRef}>
          <button
            type="button"
            onClick={() => setCompanyFilterOpen((o) => !o)}
            className={`border-line flex h-10 items-center gap-2 rounded-2xl border px-3 text-sm font-semibold shadow-sm dark:border-line-dark ${
              companyTaskFilter !== 'all'
                ? 'bg-stone-200/90 ring-2 ring-stone-300 dark:bg-stone-700 dark:ring-stone-600'
                : 'bg-white/90 dark:bg-stone-800'
            }`}
            aria-expanded={companyFilterOpen}
            aria-label="Filter tasks by company"
          >
            <ListFilter className="h-4 w-4" aria-hidden />
            Client
          </button>
          {companyFilterOpen ? (
            <div className="border-line bg-paper absolute top-full right-0 z-20 mt-2 w-[min(18rem,calc(100vw-2rem))] rounded-2xl border p-3 shadow-xl dark:border-line-dark dark:bg-stone-900">
              <p className="text-ink-muted mb-2 text-xs font-semibold uppercase">Companies</p>
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
            </div>
          ) : null}
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-stone-200/80 bg-white/80 dark:border-stone-600 dark:bg-stone-900/50">
        {tasksQ.isLoading ? (
          <p className="text-ink-muted p-6 text-sm">Loading…</p>
        ) : tasks.length === 0 ? (
          <p className="text-ink-muted p-6 text-sm">No tasks yet. Add one from the quick menu or a position page.</p>
        ) : filteredTasks.length === 0 ? (
          <p className="text-ink-muted p-6 text-sm">No tasks match your filters.</p>
        ) : (
          <table className="w-full min-w-[720px] border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-stone-200/90 bg-stone-50/90 dark:border-stone-600 dark:bg-stone-800/80">
                <th className="w-8 px-2 py-3" aria-hidden />
                <th className="px-3 py-3 font-bold">Task</th>
                <th className="px-3 py-3 font-bold">Due</th>
                <th className="px-3 py-3 font-bold">Position</th>
                <th className="px-3 py-3 font-bold">Client</th>
                <th className="px-3 py-3 font-bold">Candidate</th>
              </tr>
            </thead>
            {STATUS_ORDER.map((st) => (
              <tbody
                key={st}
                className={`border-b border-stone-200/70 dark:border-stone-600 ${
                  dropHoverStatus === st ? 'bg-[#97daff]/12 dark:bg-cyan-950/30' : ''
                }`}
                onDragOver={(e) => onDragOverStatus(e, st)}
                onDragLeave={() => setDropHoverStatus((h) => (h === st ? null : h))}
                onDrop={(e) => onDropOnStatus(e, st)}
              >
                <tr className="bg-stone-100/95 dark:bg-stone-800/90">
                  <td colSpan={6} className="px-3 py-2 text-xs font-extrabold tracking-wide text-stone-600 uppercase dark:text-stone-300">
                    {statusLabel(st)} ({tasksByStatus[st].length})
                  </td>
                </tr>
                {tasksByStatus[st].length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-ink-muted px-3 py-4 text-xs italic dark:text-stone-500">
                      Drop a task here or drag from another group.
                    </td>
                  </tr>
                ) : (
                  tasksByStatus[st].map((row) => {
                    const pos = row.positions as
                      | { id: string; title: string; companies: { name?: string } | null }
                      | null
                    const pcJoin = row.position_candidates as {
                      candidates: { id: string; full_name: string } | { id: string; full_name: string }[] | null
                    } | null
                    const cand = nestedOne(pcJoin?.candidates ?? null)
                    const dueLabel = row.due_at ? formatDue(row.due_at) : '—'
                    return (
                      <tr
                        key={row.id}
                        draggable
                        onDragStart={(e) => onDragStartTask(e, row)}
                        onDragEnd={() => setDropHoverStatus(null)}
                        className="border-t border-stone-100 transition hover:bg-stone-50/90 dark:border-stone-700/80 dark:hover:bg-stone-800/60"
                      >
                        <td className="px-1 py-2 align-middle">
                          <span className="text-ink-muted inline-flex cursor-grab p-1 active:cursor-grabbing" aria-hidden>
                            <GripVertical className="h-4 w-4" />
                          </span>
                        </td>
                        <td className="px-3 py-2 align-middle">
                          <button
                            type="button"
                            className="text-left font-semibold text-[#302e2b] underline-offset-2 hover:underline dark:text-stone-100"
                            onClick={() => setSelectedTask(row)}
                          >
                            {row.title}
                          </button>
                        </td>
                        <td className="text-ink-muted px-3 py-2 align-middle tabular-nums dark:text-stone-400">{dueLabel}</td>
                        <td className="px-3 py-2 align-middle">
                          <Link to={`/positions/${row.position_id}`} className="text-[#006384] font-medium hover:underline dark:text-cyan-300">
                            {pos?.title ?? '—'}
                          </Link>
                        </td>
                        <td className="text-ink-muted px-3 py-2 align-middle dark:text-stone-400">{pos?.companies?.name ?? '—'}</td>
                        <td className="px-3 py-2 align-middle">
                          {cand ? (
                            <Link
                              to={`/positions/${row.position_id}?candidate=${cand.id}`}
                              className="text-[#006384] font-medium hover:underline dark:text-cyan-300"
                            >
                              {cand.full_name}
                            </Link>
                          ) : (
                            <span className="text-ink-muted dark:text-stone-500">—</span>
                          )}
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            ))}
          </table>
        )}
      </div>

      {/* Task detail drawer */}
      {selectedTask ? (
        <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-labelledby="task-drawer-title">
          <button
            type="button"
            className="absolute inset-0 bg-black/40 backdrop-blur-[1px]"
            aria-label="Close task panel"
            onClick={() => setSelectedTask(null)}
          />
          <motion.aside
            className="border-line relative flex h-full w-full max-w-md flex-col border-l bg-white shadow-2xl dark:border-line-dark dark:bg-stone-900"
            initial={reduceMotion ? false : { x: '100%' }}
            animate={{ x: 0 }}
            transition={{ type: 'spring', stiffness: 380, damping: 34 }}
          >
            <div className="border-line flex items-start justify-between gap-2 border-b px-4 py-4 dark:border-line-dark">
              <h2 id="task-drawer-title" className="text-lg font-extrabold text-[#302e2b] dark:text-stone-100">
                {selectedTask.title}
              </h2>
              <button
                type="button"
                className="rounded-xl p-2 text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800"
                onClick={() => setSelectedTask(null)}
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-4 text-sm">
              <p className="text-ink-muted text-xs font-bold uppercase">Status</p>
              <p className="mt-1 font-semibold capitalize">{selectedTask.status.replace('_', ' ')}</p>

              <p className="text-ink-muted mt-4 text-xs font-bold uppercase">Due</p>
              <p className="mt-1">{selectedTask.due_at ? formatDue(selectedTask.due_at) : 'Not set'}</p>

              {(() => {
                const pos = selectedTask.positions as
                  | { id: string; title: string; companies: { name?: string } | null }
                  | null
                const pcJoin = selectedTask.position_candidates as {
                  candidates: { id: string; full_name: string } | { id: string; full_name: string }[] | null
                } | null
                const cand = nestedOne(pcJoin?.candidates ?? null)
                return (
                  <>
                    <p className="text-ink-muted mt-4 text-xs font-bold uppercase">Position</p>
                    <p className="mt-1">
                      <Link to={`/positions/${selectedTask.position_id}`} className="font-semibold text-[#006384] hover:underline dark:text-cyan-300">
                        {pos?.title ?? '—'}
                      </Link>
                    </p>
                    <p className="text-ink-muted mt-4 text-xs font-bold uppercase">Client</p>
                    <p className="mt-1">{pos?.companies?.name ?? '—'}</p>
                    {cand ? (
                      <>
                        <p className="text-ink-muted mt-4 text-xs font-bold uppercase">Candidate</p>
                        <p className="mt-1">
                          <Link
                            to={`/positions/${selectedTask.position_id}?candidate=${cand.id}`}
                            className="font-semibold text-[#006384] hover:underline dark:text-cyan-300"
                          >
                            {cand.full_name}
                          </Link>
                        </p>
                      </>
                    ) : null}
                  </>
                )
              })()}

              {selectedTask.description ? (
                <>
                  <p className="text-ink-muted mt-4 text-xs font-bold uppercase">Description</p>
                  <p className="mt-1 whitespace-pre-wrap text-[#302e2b] dark:text-stone-200">{selectedTask.description}</p>
                </>
              ) : null}

              {selectedTask.note_in_progress ? (
                <>
                  <p className="text-ink-muted mt-4 text-xs font-bold uppercase">In progress notes</p>
                  <p className="mt-1 whitespace-pre-wrap text-[#302e2b] dark:text-stone-200">{selectedTask.note_in_progress}</p>
                </>
              ) : null}

              <p className="text-ink-muted mt-4 text-xs font-bold uppercase">Updated</p>
              <p className="mt-1 tabular-nums">{new Date(selectedTask.updated_at).toLocaleString()}</p>
            </div>
          </motion.aside>
        </div>
      ) : null}

      <Modal open={trackOpen} onClose={() => setTrackOpen(false)} title="Track time on a role">
        <p className="text-ink-muted mb-3 text-sm">Every session is tied to a position. Stop the header timer when you are done.</p>
        {timer.open ? (
          <p className="text-ink mb-3 text-sm font-medium dark:text-stone-200">A timer is already running — stop it first.</p>
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
              void addTaskMutation.mutateAsync()
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
              From template
              <select
                value={taskTemplateId}
                onChange={(e) => {
                  const v = e.target.value
                  setTaskTemplateId(v)
                  const t = (taskTemplatesQ.data ?? []).find((x) => x.id === v)
                  if (t) {
                    setNewTaskTitle(t.title)
                    setNewTaskDescription((t.description as string | null) ?? '')
                  }
                }}
                className="border-line rounded-xl border px-3 py-2 dark:border-line-dark dark:bg-stone-900/50"
              >
                <option value="">None</option>
                {(taskTemplatesQ.data ?? []).map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                  </option>
                ))}
              </select>
            </label>
            {newTaskPositionId.trim() ? (
              <label className="flex flex-col gap-1 text-sm font-medium">
                Candidate on role (optional)
                <select
                  value={newTaskPositionCandidateId}
                  onChange={(e) => setNewTaskPositionCandidateId(e.target.value)}
                  className="border-line rounded-xl border px-3 py-2 dark:border-line-dark dark:bg-stone-900/50"
                >
                  <option value="">Position-wide task</option>
                  {(positionCandidatesForTaskQ.data ?? []).map((pc) => {
                    const h = nestedOne(pc.candidates as { id: string; full_name: string } | { id: string; full_name: string }[] | null)
                    return (
                      <option key={pc.id} value={pc.id}>
                        {h?.full_name ?? 'Candidate'}
                      </option>
                    )
                  })}
                </select>
              </label>
            ) : null}
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
              Description
              <textarea
                value={newTaskDescription}
                onChange={(e) => setNewTaskDescription(e.target.value)}
                rows={3}
                className="border-line rounded-xl border px-3 py-2 dark:border-line-dark dark:bg-stone-900/50"
                placeholder="Optional details"
              />
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
              <input type="checkbox" checked={saveTaskAsTemplate} onChange={(e) => setSaveTaskAsTemplate(e.target.checked)} />
              Save as template
            </label>
            <button
              type="submit"
              disabled={addTaskMutation.isPending}
              className="rounded-full bg-gradient-to-r from-[#9b3e20] to-[#fd8863] py-2.5 text-sm font-bold text-white disabled:opacity-50"
            >
              {addTaskMutation.isPending ? 'Saving…' : 'Save task'}
            </button>
          </form>
        )}
      </Modal>
    </div>
  )
}
