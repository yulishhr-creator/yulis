import { Link, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { motion, useReducedMotion } from 'framer-motion'
import { Check, ChevronDown, GripVertical, ListFilter, Pencil, Trash2, X } from 'lucide-react'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'

import { useAuth } from '@/auth/useAuth'
import { useDashboardTaskKpis } from '@/hooks/useDashboardTaskKpis'
import { getSupabase } from '@/lib/supabase'
import { isMissingArchivedAtColumnError } from '@/lib/postgrestErrors'
import { formatDue } from '@/lib/dates'
import { CompanyClientAvatar } from '@/components/companies/CompanyClientAvatar'
import { OffCanvasRegistrar } from '@/components/layout/OffCanvasContext'
import { Modal } from '@/components/ui/Modal'
import { PageSpinner } from '@/components/ui/PageSpinner'
import { useWorkTimer } from '@/work/useWorkTimer'
import { useToast } from '@/hooks/useToast'

function nestedOne<T>(v: T | T[] | null | undefined): T | null {
  if (v == null) return null
  return Array.isArray(v) ? (v[0] ?? null) : v
}

function defaultReminderDatetimeLocal(): string {
  const d = new Date()
  d.setHours(d.getHours() + 1, 0, 0, 0)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

type TaskStatus = 'open' | 'closed' | 'archived'

function isTaskStatus(s: string): s is TaskStatus {
  return s === 'open' || s === 'closed' || s === 'archived'
}

function TaskDrawerEditableBlock({
  label,
  multiline,
  editing,
  draft,
  onDraft,
  onStart,
  onCancel,
  onSave,
  display,
  emptyHint,
  disabled,
}: {
  label: string
  multiline?: boolean
  editing: boolean
  draft: string
  onDraft: (v: string) => void
  onStart: () => void
  onCancel: () => void
  onSave: () => void
  display: string
  emptyHint?: string
  disabled?: boolean
}) {
  const hasText = display.trim().length > 0
  return (
    <div className="mt-6 first:mt-0">
      <p className="text-ink-muted text-xs font-bold uppercase tracking-wide">{label}</p>
      <div className="group/tdf mt-2 flex min-h-8 flex-wrap items-start gap-2">
        {editing ? (
          <>
            {multiline ? (
              <textarea
                value={draft}
                onChange={(e) => onDraft(e.target.value)}
                rows={5}
                className="border-line text-ink min-h-[7rem] w-full min-w-0 flex-1 resize-y rounded-xl border bg-white px-3 py-2 text-sm dark:border-line-dark dark:bg-stone-900/50 dark:text-stone-100"
                autoFocus
              />
            ) : (
              <input
                value={draft}
                onChange={(e) => onDraft(e.target.value)}
                className="border-line text-ink min-w-0 flex-1 rounded-xl border bg-white px-3 py-2 text-sm font-semibold dark:border-line-dark dark:bg-stone-900/50 dark:text-stone-100"
                autoFocus
              />
            )}
            <div className="flex shrink-0 gap-1 pt-0.5">
              <button
                type="button"
                className="rounded-lg bg-emerald-600 p-2 text-white hover:bg-emerald-700 disabled:opacity-50"
                aria-label={`Save ${label}`}
                disabled={disabled}
                onClick={onSave}
              >
                <Check className="h-4 w-4" aria-hidden />
              </button>
              <button
                type="button"
                className="border-line rounded-lg border bg-white p-2 dark:border-line-dark dark:bg-stone-800"
                aria-label="Cancel"
                disabled={disabled}
                onClick={onCancel}
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="text-ink min-w-0 flex-1 text-sm leading-relaxed dark:text-stone-100">
              {hasText ? (
                multiline ? (
                  <span className="whitespace-pre-wrap">{display}</span>
                ) : (
                  <span className="font-semibold">{display}</span>
                )
              ) : (
                <span className="text-ink-muted">{emptyHint ?? '—'}</span>
              )}
            </div>
            <button
              type="button"
              className="text-ink-muted shrink-0 rounded-lg p-2 opacity-0 transition hover:bg-stone-100 hover:text-ink group-hover/tdf:opacity-100 dark:hover:bg-stone-800 dark:hover:text-stone-100 disabled:cursor-not-allowed disabled:opacity-0"
              aria-label={`Edit ${label}`}
              disabled={disabled}
              onClick={onStart}
            >
              <Pencil className="h-4 w-4" aria-hidden />
            </button>
          </>
        )}
      </div>
    </div>
  )
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
  sort_order: number
  position_id: string | null
  position_candidate_id: string | null
  candidate_id: string | null
  positions: unknown
  position_candidates: unknown
  candidates: unknown
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
  /** Keep intent params until modal closes — stripping on open breaks first paint after animated route transitions */
  const addTaskIntentUrl = searchParams.get('addTask') === '1'
  const trackTimeIntentUrl = searchParams.get('trackTime') === '1'

  const [trackOpen, setTrackOpen] = useState(false)
  const [trackPosId, setTrackPosId] = useState('')
  const [taskModalOpen, setTaskModalOpen] = useState(false)
  const [newTaskTitle, setNewTaskTitle] = useState('')
  const [newTaskPositionId, setNewTaskPositionId] = useState('')
  const [newTaskPositionCandidateId, setNewTaskPositionCandidateId] = useState('')
  const [newTaskDescription, setNewTaskDescription] = useState('')
  const [newTaskStandaloneCandidateId, setNewTaskStandaloneCandidateId] = useState('')
  const [taskReminderEnabled, setTaskReminderEnabled] = useState(false)
  const [taskReminderAt, setTaskReminderAt] = useState('')
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false)
  const templatePickerRef = useRef<HTMLDivElement>(null)

  const [companyTaskFilter, setCompanyTaskFilter] = useState<'all' | Set<string>>('all')
  const [companyFilterOpen, setCompanyFilterOpen] = useState(false)
  const companyFilterRef = useRef<HTMLDivElement>(null)

  const [searchText, setSearchText] = useState('')
  const [selectedTask, setSelectedTask] = useState<TaskRow | null>(null)
  const [drawerEdit, setDrawerEdit] = useState<null | 'title' | 'description' | 'notes'>(null)
  const [drawerDraft, setDrawerDraft] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null)
  const tasksListOrderedRef = useRef<TaskRow[]>([])

  const taskModalShowing = taskModalOpen || addTaskIntentUrl
  const trackUiOpen = trackOpen || trackTimeIntentUrl

  const tasksQ = useQuery({
    queryKey: ['tasks-page', uid],
    enabled: Boolean(supabase && uid),
    staleTime: 20_000,
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
          sort_order,
          position_id,
          position_candidate_id,
          candidate_id,
          positions ( id, title, company_id, companies ( id, name ) ),
          position_candidates ( id, candidates ( id, full_name ) ),
          candidates ( id, full_name )
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
    enabled: Boolean(supabase && uid && taskModalShowing),
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
    enabled: Boolean(supabase && uid && taskModalShowing),
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

  const candidatesForTaskModalQ = useQuery({
    queryKey: ['tasks-modal-candidates', uid],
    enabled: Boolean(supabase && uid && taskModalShowing),
    queryFn: async () => {
      const { data, error } = await supabase!
        .from('candidates')
        .select('id, full_name')
        .eq('user_id', uid!)
        .eq('status', 'active')
        .is('deleted_at', null)
        .order('full_name')
      if (error) throw error
      return (data ?? []) as { id: string; full_name: string }[]
    },
  })

  const positionCandidatesForTaskQ = useQuery({
    queryKey: ['dashboard-task-pcs', uid, newTaskPositionId],
    enabled: Boolean(supabase && uid && taskModalShowing && newTaskPositionId.trim()),
    queryFn: async () => {
      let { data, error } = await supabase!
        .from('position_candidates')
        .select('id, status, candidates ( id, full_name )')
        .eq('user_id', uid!)
        .eq('position_id', newTaskPositionId.trim())
        .eq('status', 'in_progress')
        .is('archived_at', null)
        .order('created_at', { ascending: false })
      if (error && isMissingArchivedAtColumnError(error)) {
        ;({ data, error } = await supabase!
          .from('position_candidates')
          .select('id, status, candidates ( id, full_name )')
          .eq('user_id', uid!)
          .eq('position_id', newTaskPositionId.trim())
          .eq('status', 'in_progress')
          .order('created_at', { ascending: false }))
      }
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
    if (!showArchived && urlStatusFilter !== 'archived') {
      list = list.filter((row) => row.status !== 'archived')
    }
    if (companyTaskFilter !== 'all' && companyTaskFilter.size > 0) {
      list = list.filter((row) => {
        const pos = row.positions as { companies: { id: string } | null; company_id?: string | null } | null
        const cid = pos?.companies?.id ?? pos?.company_id
        if (cid == null) return false
        return companyTaskFilter.has(cid)
      })
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
        const pool = nestedOne(row.candidates as { full_name?: string } | { full_name?: string }[] | null)
        if ((pool?.full_name ?? '').toLowerCase().includes(q)) return true
        return false
      })
    }
    if (urlStatusFilter) {
      list = list.filter((row) => row.status === urlStatusFilter)
    }
    return list
  }, [tasks, companyTaskFilter, searchText, urlStatusFilter, showArchived])

  const tasksListOrdered = useMemo(() => {
    const rank: Record<string, number> = { open: 0, closed: 1, archived: 2 }
    return [...filteredTasks].sort((a, b) => {
      const ra = rank[a.status] ?? 99
      const rb = rank[b.status] ?? 99
      if (ra !== rb) return ra - rb
      const so = (a.sort_order ?? 0) - (b.sort_order ?? 0)
      if (so !== 0) return so
      if (a.status === 'open' && b.status === 'open') {
        const ad = a.due_at ? new Date(a.due_at).getTime() : Infinity
        const bd = b.due_at ? new Date(b.due_at).getTime() : Infinity
        return ad - bd
      }
      return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    })
  }, [filteredTasks])

  useLayoutEffect(() => {
    tasksListOrderedRef.current = tasksListOrdered
  }, [tasksListOrdered])

  useEffect(() => {
    if (!selectedTask) return
    setDrawerEdit(null)
    setDrawerDraft('')
  }, [selectedTask?.id])

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
    if (!templatePickerOpen) return
    function onDoc(e: MouseEvent) {
      if (templatePickerRef.current?.contains(e.target as Node)) return
      setTemplatePickerOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [templatePickerOpen])

  useEffect(() => {
    if (!addTaskIntentUrl) return
    setNewTaskTitle('')
    setNewTaskDescription('')
    setNewTaskPositionCandidateId('')
    setNewTaskStandaloneCandidateId('')
    setTaskReminderEnabled(false)
    setTaskReminderAt('')
    setTemplatePickerOpen(false)
    const pid = sessionStorage.getItem('yulis_task_prefill_position_id')
    setNewTaskPositionId(pid ?? '')
    setTaskModalOpen(true)
  }, [addTaskIntentUrl])

  function stripAddTaskQuery() {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.delete('addTask')
        return next
      },
      { replace: true },
    )
  }

  function stripTrackTimeQuery() {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.delete('trackTime')
        return next
      },
      { replace: true },
    )
  }

  useEffect(() => {
    setNewTaskPositionCandidateId('')
    if (newTaskPositionId.trim()) setNewTaskStandaloneCandidateId('')
  }, [newTaskPositionId])

  useEffect(() => {
    if (!trackUiOpen) return
    const rows = timerPositionsQ.data ?? []
    if (rows.length && !trackPosId) setTrackPosId(rows[0]!.id)
  }, [trackUiOpen, timerPositionsQ.data, trackPosId])

  const updateTaskStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: TaskStatus }) => {
      const { error } = await supabase!.from('tasks').update({ status }).eq('id', id).eq('user_id', uid!)
      if (error) throw error
    },
    onSuccess: async (_data, { id, status }) => {
      setSelectedTask((prev) => {
        if (!prev || prev.id !== id) return prev
        if (status === 'closed' || status === 'archived') return null
        return { ...prev, status }
      })
      await qc.invalidateQueries({ queryKey: ['tasks-page'] })
      await qc.invalidateQueries({ queryKey: ['dashboard-task-kpis'] })
      await qc.invalidateQueries({ queryKey: ['position-tasks'] })
      await qc.invalidateQueries({ queryKey: ['notification-count'] })
    },
    onError: (e: Error) => toastError(e),
  })

  const reorderTasksMutation = useMutation({
    mutationFn: async (orderedSameStatus: TaskRow[]) => {
      if (!supabase || !uid) throw new Error('Not signed in')
      await Promise.all(
        orderedSameStatus.map((t, i) =>
          supabase.from('tasks').update({ sort_order: i * 1000 }).eq('id', t.id).eq('user_id', uid),
        ),
      ).then((results) => {
        for (const r of results) {
          if (r.error) throw r.error
        }
      })
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['tasks-page'] })
      await qc.invalidateQueries({ queryKey: ['dashboard-task-kpis'] })
      await qc.invalidateQueries({ queryKey: ['position-tasks'] })
    },
    onError: (e: Error) => toastError(e),
  })

  const patchTaskMutation = useMutation({
    mutationFn: async (patch: { title?: string; description?: string | null; note_in_progress?: string | null }) => {
      if (!supabase || !uid || !selectedTask) throw new Error('No task')
      const { error } = await supabase.from('tasks').update(patch).eq('id', selectedTask.id).eq('user_id', uid)
      if (error) throw error
    },
    onSuccess: async (_d, patch) => {
      success('Saved')
      setDrawerEdit(null)
      setDrawerDraft('')
      setSelectedTask((prev) => (prev ? { ...prev, ...patch, updated_at: new Date().toISOString() } : prev))
      await qc.invalidateQueries({ queryKey: ['tasks-page'] })
      await qc.invalidateQueries({ queryKey: ['dashboard-task-kpis'] })
      await qc.invalidateQueries({ queryKey: ['position-tasks'] })
      await qc.invalidateQueries({ queryKey: ['notification-count'] })
    },
    onError: (e: Error) => toastError(e),
  })

  function onTaskDragStart(e: React.DragEvent, taskId: string) {
    e.stopPropagation()
    setDraggingTaskId(taskId)
    e.dataTransfer.setData('text/plain', taskId)
    e.dataTransfer.effectAllowed = 'move'
  }

  function onTaskDragOver(e: React.DragEvent) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }

  function onTaskDrop(e: React.DragEvent, overId: string) {
    e.preventDefault()
    e.stopPropagation()
    const dragId = e.dataTransfer.getData('text/plain') || draggingTaskId
    setDraggingTaskId(null)
    if (!dragId || dragId === overId || !uid) return

    const list = tasksListOrderedRef.current
    const dragged = list.find((t) => t.id === dragId)
    const target = list.find((t) => t.id === overId)
    if (!dragged || !target || dragged.status !== target.status) return

    const status = dragged.status
    const bucket = list.filter((t) => t.status === status)
    const fromIdx = bucket.findIndex((t) => t.id === dragId)
    const toIdx = bucket.findIndex((t) => t.id === overId)
    if (fromIdx < 0 || toIdx < 0 || fromIdx === toIdx) return

    const next = [...bucket]
    const [removed] = next.splice(fromIdx, 1)
    next.splice(toIdx, 0, removed!)
    reorderTasksMutation.mutate(next)
  }

  function resetNewTaskForm() {
    setNewTaskTitle('')
    setNewTaskDescription('')
    setNewTaskPositionId('')
    setNewTaskPositionCandidateId('')
    setNewTaskStandaloneCandidateId('')
    setTaskReminderEnabled(false)
    setTaskReminderAt('')
    setTemplatePickerOpen(false)
  }

  const addTaskMutation = useMutation({
    mutationFn: async (opts?: { saveTemplate?: boolean }) => {
      if (taskReminderEnabled) {
        if (!taskReminderAt.trim()) throw new Error('Choose a date and time for the reminder')
        const t = new Date(taskReminderAt).getTime()
        if (Number.isNaN(t)) throw new Error('Invalid reminder date')
      }
      const row: Record<string, unknown> = {
        user_id: uid!,
        title: newTaskTitle.trim() || 'Task',
        description: newTaskDescription.trim() || null,
        status: 'open',
        due_at: taskReminderEnabled && taskReminderAt.trim() ? new Date(taskReminderAt).toISOString() : null,
      }
      const pid = newTaskPositionId.trim()
      if (pid) {
        row.position_id = pid
        row.candidate_id = null
        row.position_candidate_id = newTaskPositionCandidateId.trim() || null
      } else {
        row.position_id = null
        row.position_candidate_id = null
        row.candidate_id = newTaskStandaloneCandidateId.trim() || null
      }
      const { error } = await supabase!.from('tasks').insert(row)
      if (error) throw error
      if (opts?.saveTemplate) {
        const { error: te } = await supabase!.from('task_templates').insert({
          user_id: uid!,
          title: newTaskTitle.trim() || 'Task',
          description: newTaskDescription.trim() || null,
        })
        if (te) throw te
      }
    },
    onSuccess: async (_d, opts) => {
      success(opts?.saveTemplate ? 'Task created and template saved' : 'Task added')
      setTaskModalOpen(false)
      stripAddTaskQuery()
      resetNewTaskForm()
      await qc.invalidateQueries({ queryKey: ['tasks-page'] })
      await qc.invalidateQueries({ queryKey: ['dashboard-task-kpis'] })
      await qc.invalidateQueries({ queryKey: ['position-tasks'] })
      await qc.invalidateQueries({ queryKey: ['notification-count'] })
      await qc.invalidateQueries({ queryKey: ['task-templates', uid] })
    },
    onError: (e: Error) => toastError(e),
  })

  function setStatusUrl(next: string | null) {
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
      <OffCanvasRegistrar active={Boolean(selectedTask)} />
      {kpis ? (
        <motion.section aria-label="Task counts" initial={reduceMotion ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          <div className="grid grid-cols-3 gap-3">
            {(
              [
                { key: 'open', label: 'Open', value: kpis.open, sub: kpis.open === 1 ? '1 open' : `${kpis.open} open` },
                { key: 'closed', label: 'Closed', value: kpis.closed, sub: 'Completed' },
                { key: 'archived', label: 'Archived', value: kpis.archived, sub: 'Hidden by default' },
              ] as const
            ).map((card) => (
              <button
                key={card.key}
                type="button"
                onClick={() => {
                  if (card.key === 'archived') {
                    setShowArchived(true)
                    setStatusUrl('archived')
                  } else {
                    setStatusUrl(card.key)
                  }
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
            ))}
          </div>
          {urlStatusFilter ? (
            <button
              type="button"
              className="text-ink-muted hover:text-ink mt-3 text-xs font-bold underline dark:text-stone-400 dark:hover:text-stone-200"
              onClick={() => {
                setStatusUrl(null)
                if (urlStatusFilter === 'archived') setShowArchived(false)
              }}
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
                  onClick={() => setCompanyTaskFilter('all')}
                >
                  Clear client filter
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

      <div className="border-stitch-on-surface/10 overflow-x-auto rounded-2xl border border-stone-200/80 bg-white/80 dark:border-stone-600 dark:bg-stone-900/50">
        {tasksQ.isError ? (
          <p className="text-ink-muted p-6 text-sm">
            Couldn&apos;t load tasks. If this persists, refresh the page or confirm your database includes the latest
            migrations.
          </p>
        ) : tasksQ.isPending && tasks.length === 0 ? (
          <PageSpinner message="Loading tasks…" className="p-6" />
        ) : tasksQ.isFetching && tasks.length === 0 && kpis && kpis.open + kpis.closed + kpis.archived > 0 ? (
          <PageSpinner message="Loading tasks…" className="p-6" />
        ) : tasks.length === 0 ? (
          <p className="text-ink-muted p-6 text-sm">No tasks yet. Add one from the quick menu.</p>
        ) : filteredTasks.length === 0 ? (
          <p className="text-ink-muted p-6 text-sm">No tasks match your filters.</p>
        ) : (
          <ul className="space-y-3 p-4 md:p-6" aria-label="Tasks">
            {tasksListOrdered.map((row, i) => {
              const pos = row.positions as
                | {
                    id: string
                    title: string
                    companies: { id?: string; name?: string; avatar_url?: string | null } | null
                  }
                | null
              const pcJoin = row.position_candidates as {
                candidates: { id: string; full_name: string } | { id: string; full_name: string }[] | null
              } | null
              const candFromRole = nestedOne(pcJoin?.candidates ?? null)
              const candPool = nestedOne(
                row.candidates as { id: string; full_name: string } | { id: string; full_name: string }[] | null,
              )
              const cand = candFromRole ?? candPool
              const hasPosition = Boolean(row.position_id && pos)
              const hasCandidate = Boolean(cand)
              const companyForPos = pos?.companies
              const companyId = companyForPos?.id
              const companyName = companyForPos?.name ?? 'Client'
              const taskCardClass =
                'border-stitch-on-surface/10 cursor-pointer rounded-2xl border-b-4 border-b-[#006384]/60 bg-white p-4 shadow-[0_16px_36px_rgba(48,46,43,0.08)] transition hover:border-stone-300/80 dark:border-stone-700 dark:bg-stone-900 dark:hover:border-stone-600'
              const canComplete = row.status === 'open'
              const canArchive = row.status !== 'archived'
              const isDragging = draggingTaskId === row.id
              return (
                <motion.li
                  key={row.id}
                  initial={reduceMotion ? false : { opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: reduceMotion ? 0 : Math.min(i, 12) * 0.03 }}
                  className={`${taskCardClass} ${isDragging ? 'opacity-50' : ''}`}
                  onDragOver={onTaskDragOver}
                  onDrop={(e) => onTaskDrop(e, row.id)}
                  onClick={(e) => {
                    const t = e.target as HTMLElement
                    if (t.closest('a, button, [data-drag-handle]')) return
                    setSelectedTask(row)
                  }}
                >
                  <div className="flex items-start gap-2">
                    <button
                      type="button"
                      data-drag-handle
                      draggable
                      onDragStart={(e) => onTaskDragStart(e, row.id)}
                      onDragEnd={() => setDraggingTaskId(null)}
                      className="text-ink-muted hover:text-ink mt-0.5 shrink-0 cursor-grab rounded-lg p-1.5 active:cursor-grabbing dark:hover:text-stone-200"
                      aria-label="Drag to reorder"
                      title="Drag to reorder"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <GripVertical className="h-4 w-4" aria-hidden />
                    </button>
                    <div className="min-w-0 flex-1">
                      <p className="text-stitch-on-surface font-bold dark:text-stone-100">
                        <span className="text-left underline-offset-2 hover:underline">{row.title}</span>
                        {row.description?.trim() ? (
                          <>
                            <span className="text-stitch-muted font-normal dark:text-stone-400"> — </span>
                            <span className="text-stitch-muted text-sm font-semibold dark:text-stone-400">{row.description.trim()}</span>
                          </>
                        ) : null}
                        {hasPosition || hasCandidate ? (
                          <span className="mt-1 block text-sm font-normal text-stone-600 dark:text-stone-400">
                            {hasPosition ? (
                              <span className="inline-flex flex-wrap items-center gap-x-1 gap-y-1">
                                <span>for</span>
                                <span className="inline-flex items-center gap-1.5">
                                  {companyId ? (
                                    <CompanyClientAvatar
                                      companyId={companyId}
                                      companyName={companyName}
                                      avatarUrl={companyForPos?.avatar_url}
                                      readOnly
                                      size="sm"
                                    />
                                  ) : null}
                                  <Link
                                    to={`/positions/${row.position_id}`}
                                    className="font-semibold text-[#9b3e20] underline-offset-2 hover:underline dark:text-orange-400"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    {pos!.title}
                                  </Link>
                                </span>
                              </span>
                            ) : null}
                            {hasCandidate ? (
                              <span className="inline-flex flex-wrap items-center gap-x-1">
                                {hasPosition ? <span className="mx-0.5">·</span> : <span> </span>}
                                <span>about</span>{' '}
                                <Link
                                  to={
                                    row.position_id
                                      ? `/positions/${row.position_id}?candidate=${cand!.id}`
                                      : `/candidates/${cand!.id}`
                                  }
                                  className="font-semibold text-[#006384] underline-offset-2 hover:underline dark:text-cyan-300"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  {cand!.full_name}
                                </Link>
                              </span>
                            ) : null}
                          </span>
                        ) : null}
                      </p>
                      {row.due_at ? (
                        <p className="mt-2 text-xs font-semibold tabular-nums text-[#006384] dark:text-cyan-300">
                          Due {formatDue(row.due_at)}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      {canComplete ? (
                        <button
                          type="button"
                          className="text-ink-muted hover:text-emerald-600 dark:hover:text-emerald-400 rounded-lg p-2 transition disabled:opacity-40"
                          aria-label="Mark complete"
                          disabled={updateTaskStatus.isPending}
                          onClick={(e) => {
                            e.stopPropagation()
                            updateTaskStatus.mutate({ id: row.id, status: 'closed' })
                          }}
                        >
                          <Check className="h-4 w-4" aria-hidden />
                        </button>
                      ) : null}
                      {canArchive ? (
                        <button
                          type="button"
                          className="text-ink-muted hover:text-rose-600 dark:hover:text-rose-400 rounded-lg p-2 transition disabled:opacity-40"
                          aria-label="Archive task"
                          disabled={updateTaskStatus.isPending}
                          onClick={(e) => {
                            e.stopPropagation()
                            updateTaskStatus.mutate({ id: row.id, status: 'archived' })
                          }}
                        >
                          <Trash2 className="h-4 w-4" aria-hidden />
                        </button>
                      ) : null}
                    </div>
                  </div>
                </motion.li>
              )
            })}
          </ul>
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
            className="border-line relative flex h-full w-full max-w-lg flex-col border-l bg-white shadow-2xl dark:border-line-dark dark:bg-stone-900"
            initial={reduceMotion ? false : { x: '100%' }}
            animate={{ x: 0 }}
            transition={{ type: 'spring', stiffness: 380, damping: 34 }}
          >
            {(() => {
              const pos = selectedTask.positions as
                | {
                    id: string
                    title: string
                    companies: { id?: string; name?: string; avatar_url?: string | null } | null
                  }
                | null
              const pcJoin = selectedTask.position_candidates as {
                candidates: { id: string; full_name: string } | { id: string; full_name: string }[] | null
              } | null
              const candFromRole = nestedOne(pcJoin?.candidates ?? null)
              const candPool = nestedOne(
                selectedTask.candidates as { id: string; full_name: string } | { id: string; full_name: string }[] | null,
              )
              const cand = candFromRole ?? candPool
              const pid = selectedTask.position_id
              const co = pos?.companies
              const cid = co?.id
              const clientName = co?.name?.trim()
              const hasPosition = Boolean(pid && pos)
              const initials = (name: string) => {
                const p = name.trim().split(/\s+/).filter(Boolean)
                if (p.length === 0) return '?'
                if (p.length === 1) return (p[0]!.slice(0, 2)).toUpperCase()
                return (p[0]![0]! + p[1]![0]!).toUpperCase()
              }
              return (
                <>
                  <div className="shrink-0 px-4 pb-2 pt-4">
                    <div className="flex items-start justify-between gap-3">
                      <h2 id="task-drawer-title" className="text-lg font-extrabold tracking-tight text-[#302e2b] dark:text-stone-100">
                        Edit task
                      </h2>
                      <div className="flex shrink-0 items-center gap-0.5">
                        {selectedTask.status === 'open' ? (
                          <button
                            type="button"
                            className="rounded-xl p-2.5 text-emerald-600 transition hover:bg-emerald-50 disabled:opacity-40 dark:text-emerald-400 dark:hover:bg-emerald-950/40"
                            aria-label="Mark done"
                            disabled={updateTaskStatus.isPending}
                            onClick={() => updateTaskStatus.mutate({ id: selectedTask.id, status: 'closed' })}
                          >
                            <Check className="h-5 w-5" aria-hidden />
                          </button>
                        ) : null}
                        {selectedTask.status !== 'archived' ? (
                          <button
                            type="button"
                            className="rounded-xl p-2.5 text-rose-600 transition hover:bg-rose-50 disabled:opacity-40 dark:text-rose-400 dark:hover:bg-rose-950/35"
                            aria-label="Archive task"
                            disabled={updateTaskStatus.isPending}
                            onClick={() => updateTaskStatus.mutate({ id: selectedTask.id, status: 'archived' })}
                          >
                            <Trash2 className="h-5 w-5" aria-hidden />
                          </button>
                        ) : null}
                      </div>
                    </div>

                    {hasPosition || clientName || cand ? (
                      <div className="mt-4 flex flex-col gap-2">
                        {hasPosition && pos && pid ? (
                          <Link
                            to={`/positions/${pid}`}
                            className="border-line flex items-center gap-3 rounded-2xl border border-stone-200/90 bg-gradient-to-br from-orange-50/95 to-white p-3.5 shadow-sm transition hover:border-[#9b3e20]/35 hover:shadow-md dark:border-stone-600 dark:from-orange-950/30 dark:to-stone-900 dark:hover:border-orange-500/40"
                          >
                            {cid ? (
                              <CompanyClientAvatar
                                companyId={cid}
                                companyName={clientName ?? 'Client'}
                                avatarUrl={co?.avatar_url}
                                readOnly
                                size="md"
                              />
                            ) : (
                              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-stone-200 text-xs font-bold text-stone-600 dark:bg-stone-700 dark:text-stone-200">
                                Role
                              </div>
                            )}
                            <div className="min-w-0 flex-1">
                              <p className="text-[10px] font-extrabold uppercase tracking-wide text-stone-500 dark:text-stone-400">
                                Position
                              </p>
                              <p className="mt-0.5 font-bold leading-snug text-[#9b3e20] dark:text-orange-300">{pos.title}</p>
                            </div>
                          </Link>
                        ) : null}

                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                          {clientName ? (
                            cid ? (
                              <Link
                                to={`/positions?company=${encodeURIComponent(cid)}`}
                                className="border-line flex items-center gap-3 rounded-2xl border border-stone-200/90 bg-stone-50/90 p-3.5 shadow-sm transition hover:border-stone-300 hover:bg-white dark:border-stone-600 dark:bg-stone-800/60 dark:hover:border-stone-500"
                              >
                                <CompanyClientAvatar
                                  companyId={cid}
                                  companyName={clientName}
                                  avatarUrl={co?.avatar_url}
                                  readOnly
                                  size="md"
                                />
                                <div className="min-w-0 flex-1">
                                  <p className="text-[10px] font-extrabold uppercase tracking-wide text-stone-500 dark:text-stone-400">
                                    Client
                                  </p>
                                  <p className="mt-0.5 truncate font-bold text-stone-900 dark:text-stone-100">{clientName}</p>
                                </div>
                              </Link>
                            ) : (
                              <div className="border-line flex items-center gap-3 rounded-2xl border border-stone-200/90 bg-stone-50/90 p-3.5 dark:border-stone-600 dark:bg-stone-800/60">
                                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-stone-200 text-xs font-bold text-stone-600 dark:bg-stone-700 dark:text-stone-200">
                                  {initials(clientName)}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <p className="text-[10px] font-extrabold uppercase tracking-wide text-stone-500 dark:text-stone-400">
                                    Client
                                  </p>
                                  <p className="mt-0.5 truncate font-bold text-stone-900 dark:text-stone-100">{clientName}</p>
                                </div>
                              </div>
                            )
                          ) : null}

                          {cand ? (
                            <Link
                              to={pid ? `/positions/${pid}?candidate=${cand.id}` : `/candidates/${cand.id}`}
                              className="border-line flex items-center gap-3 rounded-2xl border border-cyan-200/80 bg-gradient-to-br from-cyan-50/90 to-white p-3.5 shadow-sm transition hover:border-[#006384]/40 hover:shadow-md dark:border-cyan-900/40 dark:from-cyan-950/25 dark:to-stone-900 dark:hover:border-cyan-500/40"
                            >
                              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#006384]/15 text-xs font-bold text-[#006384] dark:bg-cyan-500/20 dark:text-cyan-200">
                                {initials(cand.full_name)}
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="text-[10px] font-extrabold uppercase tracking-wide text-stone-500 dark:text-stone-400">
                                  Candidate
                                </p>
                                <p className="mt-0.5 truncate font-bold text-[#006384] dark:text-cyan-300">{cand.full_name}</p>
                              </div>
                            </Link>
                          ) : null}
                        </div>
                      </div>
                    ) : (
                      <p className="text-ink-muted mt-3 text-xs dark:text-stone-500">Standalone task — not linked to a role or person.</p>
                    )}
                  </div>

                  <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6 pt-2 text-sm">
                    <TaskDrawerEditableBlock
                      label="Title"
                      editing={drawerEdit === 'title'}
                      draft={drawerDraft}
                      onDraft={setDrawerDraft}
                      display={selectedTask.title}
                      emptyHint="Untitled"
                      disabled={patchTaskMutation.isPending}
                      onStart={() => {
                        setDrawerDraft(selectedTask.title)
                        setDrawerEdit('title')
                      }}
                      onCancel={() => {
                        setDrawerEdit(null)
                        setDrawerDraft('')
                      }}
                      onSave={() => patchTaskMutation.mutate({ title: drawerDraft.trim() || 'Task' })}
                    />

                    <TaskDrawerEditableBlock
                      label="Description"
                      multiline
                      editing={drawerEdit === 'description'}
                      draft={drawerDraft}
                      onDraft={setDrawerDraft}
                      display={selectedTask.description ?? ''}
                      emptyHint="No description"
                      disabled={patchTaskMutation.isPending}
                      onStart={() => {
                        setDrawerDraft(selectedTask.description ?? '')
                        setDrawerEdit('description')
                      }}
                      onCancel={() => {
                        setDrawerEdit(null)
                        setDrawerDraft('')
                      }}
                      onSave={() =>
                        patchTaskMutation.mutate({
                          description: drawerDraft.trim() ? drawerDraft.trim() : null,
                        })
                      }
                    />

                    <TaskDrawerEditableBlock
                      label="In progress notes"
                      multiline
                      editing={drawerEdit === 'notes'}
                      draft={drawerDraft}
                      onDraft={setDrawerDraft}
                      display={selectedTask.note_in_progress ?? ''}
                      emptyHint="No notes yet"
                      disabled={patchTaskMutation.isPending}
                      onStart={() => {
                        setDrawerDraft(selectedTask.note_in_progress ?? '')
                        setDrawerEdit('notes')
                      }}
                      onCancel={() => {
                        setDrawerEdit(null)
                        setDrawerDraft('')
                      }}
                      onSave={() =>
                        patchTaskMutation.mutate({
                          note_in_progress: drawerDraft.trim() ? drawerDraft.trim() : null,
                        })
                      }
                    />

                    <p className="text-ink-muted mt-8 text-[10px] font-bold uppercase tracking-wide">Updated</p>
                    <p className="text-ink-muted mt-1 text-xs tabular-nums dark:text-stone-500">
                      {new Date(selectedTask.updated_at).toLocaleString()}
                    </p>
                  </div>
                </>
              )
            })()}
          </motion.aside>
        </div>
      ) : null}

      <Modal
        open={trackUiOpen}
        onClose={() => {
          setTrackOpen(false)
          stripTrackTimeQuery()
        }}
        title="Track time on a role"
      >
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
                  stripTrackTimeQuery()
                  await qc.invalidateQueries({ queryKey: ['notification-count'] })
                }
              }}
            >
              Start timer
            </button>
          </>
        )}
      </Modal>

      <Modal
        open={taskModalShowing}
        onClose={() => {
          setTaskModalOpen(false)
          stripAddTaskQuery()
          resetNewTaskForm()
        }}
        title="New task"
        headerAside={
          <div className="relative" ref={templatePickerRef}>
            <button
              type="button"
              onClick={() => setTemplatePickerOpen((o) => !o)}
              className="border-line text-ink-muted hover:bg-accent-soft/50 flex items-center gap-1 rounded-xl border px-2.5 py-1.5 text-xs font-bold dark:border-line-dark dark:hover:bg-stone-800"
              aria-expanded={templatePickerOpen}
              aria-haspopup="listbox"
            >
              Templates
              <ChevronDown className="h-3.5 w-3.5 opacity-70" aria-hidden />
            </button>
            {templatePickerOpen ? (
              <ul
                className="border-line bg-paper absolute right-0 z-20 mt-1 max-h-48 min-w-[14rem] overflow-y-auto rounded-xl border py-1 shadow-lg dark:border-line-dark dark:bg-stone-900"
                role="listbox"
              >
                {(taskTemplatesQ.data ?? []).length === 0 ? (
                  <li className="text-ink-muted px-3 py-2 text-xs">No templates yet</li>
                ) : (
                  (taskTemplatesQ.data ?? []).map((t) => (
                    <li key={t.id} role="option">
                      <button
                        type="button"
                        className="hover:bg-accent-soft/40 w-full px-3 py-2 text-left text-sm dark:hover:bg-stone-800"
                        onClick={() => {
                          setNewTaskTitle(t.title)
                          setNewTaskDescription((t.description as string | null) ?? '')
                          setTemplatePickerOpen(false)
                        }}
                      >
                        {t.title}
                      </button>
                    </li>
                  ))
                )}
              </ul>
            ) : null}
          </div>
        }
      >
        <p className="text-ink-muted mb-3 text-sm">
          {sessionStorage.getItem('yulis_task_prefill_position_id')
            ? 'Role is pre-filled from the position you were viewing. Change it if needed.'
            : 'Optionally link this task to a role or a candidate.'}
        </p>
        {allPositionsForTaskQ.isLoading ? (
          <p className="text-sm">Loading roles…</p>
        ) : (
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault()
            }}
          >
            <label className="flex flex-col gap-1 text-sm font-medium">
              Position (optional)
              <select
                value={newTaskPositionId}
                onChange={(e) => setNewTaskPositionId(e.target.value)}
                className="border-line rounded-xl border px-3 py-2 dark:border-line-dark dark:bg-stone-900/50"
              >
                <option value="">None (standalone task)</option>
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
            ) : (
              <label className="flex flex-col gap-1 text-sm font-medium">
                Candidate (optional)
                <select
                  value={newTaskStandaloneCandidateId}
                  onChange={(e) => setNewTaskStandaloneCandidateId(e.target.value)}
                  className="border-line rounded-xl border px-3 py-2 dark:border-line-dark dark:bg-stone-900/50"
                  disabled={candidatesForTaskModalQ.isLoading}
                >
                  <option value="">None</option>
                  {(candidatesForTaskModalQ.data ?? []).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.full_name}
                    </option>
                  ))}
                </select>
              </label>
            )}
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
              <input
                type="checkbox"
                checked={taskReminderEnabled}
                onChange={(e) => {
                  const on = e.target.checked
                  setTaskReminderEnabled(on)
                  if (on && !taskReminderAt) setTaskReminderAt(defaultReminderDatetimeLocal())
                }}
              />
              Set reminder
            </label>
            {taskReminderEnabled ? (
              <label className="flex flex-col gap-1 text-sm font-medium">
                Remind at
                <input
                  type="datetime-local"
                  value={taskReminderAt}
                  onChange={(e) => setTaskReminderAt(e.target.value)}
                  className="border-line rounded-xl border px-3 py-2 dark:border-line-dark dark:bg-stone-900/50"
                />
              </label>
            ) : null}
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
              <button
                type="button"
                disabled={addTaskMutation.isPending}
                className="rounded-full bg-gradient-to-r from-[#9b3e20] to-[#fd8863] px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50"
                onClick={() => void addTaskMutation.mutateAsync(undefined)}
              >
                {addTaskMutation.isPending ? 'Saving…' : 'Create'}
              </button>
              <button
                type="button"
                disabled={addTaskMutation.isPending}
                className="border-line rounded-full border px-5 py-2.5 text-sm font-bold dark:border-line-dark dark:text-stone-100 disabled:opacity-50"
                onClick={() => void addTaskMutation.mutateAsync({ saveTemplate: true })}
              >
                {addTaskMutation.isPending ? 'Saving…' : 'Create & save template'}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  )
}
