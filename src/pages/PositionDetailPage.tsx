import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, Navigate, useParams, useSearchParams } from 'react-router-dom'
import { useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from 'react'
import * as XLSX from 'xlsx'
import {
  Check,
  CheckCircle,
  CheckCircle2,
  X,
  PartyPopper,
  FileText,
  Link2,
  Trash2,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  Upload,
  Copy,
  ExternalLink,
  GitBranch,
  Mail,
  Phone,
  Ban,
  Play,
  Pause,
  Share2,
  Pencil,
  ArrowLeft,
  GripVertical,
} from 'lucide-react'
import { differenceInCalendarDays, format } from 'date-fns'

import { useAuth } from '@/auth/useAuth'
import { getSupabase } from '@/lib/supabase'
import { normalizeEmail, normalizePhone } from '@/lib/normalize'
import { formatDue } from '@/lib/dates'
import { Modal } from '@/components/ui/Modal'
import { PageSpinner } from '@/components/ui/PageSpinner'
import { useToast } from '@/hooks/useToast'
import { criticalStageThreshold, logActivityEvent } from '@/lib/activityLog'
import { assignmentStatusPill, formatAssignmentStatus } from '@/lib/candidateStatus'
import { logPositionCandidateTransition } from '@/lib/positionTransitions'
import { isMissingRequirementsColumnError, normalizeRequirementsText, parseRequirementTokens } from '@/lib/requirementValues'
import { CompanyClientAvatar } from '@/components/companies/CompanyClientAvatar'

type StageRow = {
  id: string
  name: string
  sort_order: number
  description?: string | null
  interviewers?: string | null
  duration_minutes?: number | null
  is_remote?: boolean | null
}

type CandidateProfile = {
  id: string
  full_name: string
  email: string | null
  phone: string | null
  linkedin?: string | null
  salary_expectation?: string | null
  resume_storage_path?: string | null
  profile_photo_storage_path?: string | null
  deleted_at?: string | null
}

type PositionCandidateJunction = {
  id: string
  candidate_id: string
  position_stage_id: string | null
  status: string
  source: string
  created_at: string
  candidates: CandidateProfile | CandidateProfile[] | null
  position_stages: { name: string } | { name: string }[] | null
}

function nestedCandidate(v: PositionCandidateJunction['candidates']): CandidateProfile | null {
  if (v == null) return null
  return Array.isArray(v) ? (v[0] ?? null) : v
}

function nestedStageName(v: PositionCandidateJunction['position_stages']): string {
  if (v == null) return '—'
  return Array.isArray(v) ? (v[0]?.name ?? '—') : (v.name ?? '—')
}

const ASSIGNMENT_SOURCE_VALUES = ['import', 'sourcing', 'cv', 'referral'] as const
type AssignmentSourceValue = (typeof ASSIGNMENT_SOURCE_VALUES)[number]

const ASSIGNMENT_SOURCE_LABELS: Record<AssignmentSourceValue, string> = {
  import: 'Import',
  sourcing: 'Sourcing',
  cv: 'CV',
  referral: 'Referral',
}

function normalizeAssignmentSource(raw: string): AssignmentSourceValue {
  const s = raw.trim()
  if (s === 'import' || s === 'sourcing' || s === 'cv' || s === 'referral') return s
  if (s === 'external') return 'import'
  if (s === 'app') return 'sourcing'
  return 'sourcing'
}

/** Days on role for compact kanban badge; under a week show Nd, else rounded weeks. */
function formatTenureOnRoleShort(createdAt: string): string {
  const days = differenceInCalendarDays(new Date(), new Date(createdAt))
  if (days < 7) return `${days}d`
  const w = Math.max(1, Math.round(days / 7))
  return `${w}w`
}

/** Matches positions board column headers (PositionsPage columnHeading). */
const pipelineStageHeadingClass =
  'mb-3 w-full border-b-2 pb-2 text-center text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-800 sm:text-xs dark:text-stone-200 border-[#9b3e20]'

/** Subsection heading — grey accent bar like cancelled column on positions board. */
const pipelineSubsectionHeadingClass =
  'mb-3 w-full border-b-2 border-stone-400 pb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-800 sm:text-xs dark:border-stone-500 dark:text-stone-200'

type ActivityRow = {
  id: string
  event_type: string
  title: string
  subtitle: string | null
  created_at: string
  candidate_id: string | null
  position_candidate_id: string | null
  metadata?: Record<string, unknown> | null
}

type PositionTaskStatus = 'open' | 'closed' | 'archived'

type PositionTaskRow = {
  id: string
  title: string
  description: string | null
  note_in_progress: string | null
  status: string
  due_at: string | null
  created_at: string
  updated_at: string
  sort_order?: number | null
  position_candidate_id: string | null
  position_candidates: unknown
}

function nestedTaskCandidate(
  v: { id: string; full_name: string } | { id: string; full_name: string }[] | null | undefined,
): { id: string; full_name: string } | null {
  if (v == null) return null
  return Array.isArray(v) ? (v[0] ?? null) : v
}

function taskLinkedCandidate(t: PositionTaskRow): { id: string; full_name: string } | null {
  const raw = t.position_candidates
  if (raw == null) return null
  const pc = Array.isArray(raw) ? raw[0] : raw
  if (!pc) return null
  const profile = nestedTaskCandidate(
    pc.candidates as { id: string; full_name: string } | { id: string; full_name: string }[] | null | undefined,
  )
  if (!profile?.id) return null
  return { id: profile.id, full_name: profile.full_name ?? 'Unnamed' }
}

/** Two-letter style initials from a person or free-text label (e.g. "Dor Farjun" → "DF"). */
function personInitials(label: string): string {
  const parts = label.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) {
    const w = parts[0]!
    return w.length >= 2 ? w.slice(0, 2).toUpperCase() : (w[0]! + w[0]!).toUpperCase()
  }
  return (parts[0]![0]! + parts[1]![0]!).toUpperCase()
}

function formatIlsAmountDisplay(rawDigits: string): string {
  const t = rawDigits.replace(/,/g, '').trim()
  if (!t) return ''
  const n = Number(t)
  if (!Number.isFinite(n)) return rawDigits.trim()
  return `₪${n.toLocaleString('en-US')}`
}

function activityKindCopy(eventType: string): { label: string; explainer: string } {
  const map: Record<string, { label: string; explainer: string }> = {
    candidate_created: { label: 'Candidate added', explainer: 'Someone was added to this role.' },
    candidate_stage_changed: { label: 'Moved to a stage', explainer: 'Pipeline stage updated for a candidate.' },
    candidate_status_changed: { label: 'Assignment status', explainer: 'In progress, rejected, or withdrawn changed.' },
    candidate_outcome_changed: { label: 'Outcome', explainer: 'Final outcome updated for a candidate.' },
    candidate_reached_critical_stage: { label: 'Critical stage', explainer: 'A candidate reached an important step in the funnel.' },
    position_status_changed: { label: 'Role status', explainer: 'This job was set to active, on hold, succeeded, or cancelled.' },
    candidate_file_uploaded: { label: 'File', explainer: 'A document was attached to a candidate.' },
    note_added: { label: 'Your note', explainer: 'A manual note you logged on this role.' },
    candidate_tag: { label: 'Tag', explainer: 'A label on this candidate for this role.' },
  }
  return map[eventType] ?? { label: 'Event', explainer: 'Something changed on this role.' }
}

function DetailHoverField({
  label,
  value,
  multiline,
  rows,
  onSave,
  disabled,
  readOnlyFormat,
}: {
  label: string
  value: string
  multiline?: boolean
  rows?: number
  onSave: (next: string) => void | Promise<void>
  disabled?: boolean
  /** When set, non-edit view shows this instead of raw `value` (still saves `draft` from typed input). */
  readOnlyFormat?: (value: string) => string
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    if (!editing) setDraft(value)
  }, [value, editing])
  return (
    <div className="group relative rounded-xl border border-transparent px-1 py-2 transition hover:border-stone-200/80 hover:bg-stone-50/60 dark:hover:border-stone-600 dark:hover:bg-stone-800/40">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-stitch-muted text-[11px] font-bold tracking-wide uppercase dark:text-stone-500">{label}</p>
          {!editing ? (
            <p className="text-stitch-on-surface mt-0.5 whitespace-pre-wrap text-sm dark:text-stone-100">
              {!value.trim()
                ? '—'
                : readOnlyFormat
                  ? readOnlyFormat(value)
                  : value}
            </p>
          ) : multiline ? (
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={rows ?? 8}
              className="border-line mt-1 w-full max-w-2xl rounded-lg border bg-white px-2 py-2 text-sm dark:border-line-dark dark:bg-stone-900/80"
              autoFocus
            />
          ) : (
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              className="border-line mt-1 w-full max-w-xl rounded-lg border bg-white px-2 py-2 text-sm dark:border-line-dark dark:bg-stone-900/80"
              autoFocus
            />
          )}
        </div>
        {!editing ? (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-ink-muted shrink-0 rounded-lg p-1.5 opacity-0 transition hover:bg-stone-200/90 hover:text-ink group-hover:opacity-100 dark:hover:bg-stone-600 dark:hover:text-stone-100"
            aria-label={`Edit ${label}`}
            disabled={disabled}
          >
            <Pencil className="h-4 w-4" aria-hidden />
          </button>
        ) : (
          <div className="flex shrink-0 flex-col gap-1">
            <button
              type="button"
              className="rounded-lg bg-emerald-600 p-1.5 text-white hover:bg-emerald-700 disabled:opacity-50"
              aria-label="Save"
              disabled={saving}
              onClick={async () => {
                setSaving(true)
                try {
                  await onSave(draft)
                  setEditing(false)
                } finally {
                  setSaving(false)
                }
              }}
            >
              <Check className="h-4 w-4" aria-hidden />
            </button>
            <button
              type="button"
              className="border-line rounded-lg border bg-white p-1.5 dark:border-line-dark dark:bg-stone-800"
              aria-label="Cancel"
              disabled={saving}
              onClick={() => {
                setDraft(value)
                setEditing(false)
              }}
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export function PositionDetailPage() {
  const { id } = useParams()
  const { user } = useAuth()
  const supabase = getSupabase()
  const qc = useQueryClient()
  const { success, error: toastError } = useToast()
  const [search, setSearch] = useSearchParams()
  const highlightCandidate = search.get('candidate')

  type TabId = 'details' | 'candidates' | 'openings' | 'tasks' | 'activity'
  const tab = useMemo<TabId>(() => {
    if (highlightCandidate) return 'candidates'
    const v = search.get('tab')
    if (v === 'approaches') return 'openings'
    if (v === 'details' || v === 'candidates' || v === 'openings' || v === 'tasks' || v === 'activity') return v
    return 'details'
  }, [search, highlightCandidate])

  const setTab = (tid: TabId) => {
    setSearch(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.set('tab', tid)
        if (tid !== 'candidates') next.delete('candidate')
        return next
      },
      { replace: true },
    )
  }

  const resumeFileRef = useRef<HTMLInputElement>(null)
  const candidatePhotoInputRef = useRef<HTMLInputElement>(null)
  const drawerBulkFilesRef = useRef<HTMLInputElement>(null)
  const excelImportRef = useRef<HTMLInputElement>(null)
  const [resumePickForId, setResumePickForId] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    sessionStorage.setItem('yulis_task_prefill_position_id', id)
    return () => {
      sessionStorage.removeItem('yulis_task_prefill_position_id')
    }
  }, [id])

  const posQ = useQuery({
    queryKey: ['position', id, user?.id],
    networkMode: 'always',
    enabled: Boolean(supabase && user && id),
    queryFn: async () => {
      const { data, error } = await supabase!
        .from('positions')
        // Omit companies.avatar_url unless migration 016 is applied (Postgres 42703 undefined_column).
        .select('*, companies ( id, name, contact_email )')
        .eq('id', id!)
        .eq('user_id', user!.id)
        .single()
      if (error) throw error
      return data
    },
  })

  const stagesQ = useQuery({
    queryKey: ['position-stages', id, user?.id],
    networkMode: 'always',
    enabled: Boolean(supabase && user && id),
    queryFn: async () => {
      const { data, error } = await supabase!
        .from('position_stages')
        .select('*')
        .eq('position_id', id!)
        .eq('user_id', user!.id)
        .order('sort_order')
      if (error) throw error
      return (data ?? []) as StageRow[]
    },
  })

  const candidatesQ = useQuery({
    queryKey: ['position-candidates', id, user?.id],
    networkMode: 'always',
    enabled: Boolean(supabase && user && id),
    queryFn: async () => {
      const { data, error } = await supabase!
        .from('position_candidates')
        .select(
          `
          id,
          candidate_id,
          position_stage_id,
          status,
          source,
          created_at,
          candidates ( id, full_name, email, phone, linkedin, salary_expectation, resume_storage_path, profile_photo_storage_path, deleted_at ),
          position_stages ( name )
        `,
        )
        .eq('position_id', id!)
        .eq('user_id', user!.id)
        .order('created_at', { ascending: false })
      if (error) throw error
      const rows = (data ?? []) as PositionCandidateJunction[]
      return rows.filter((row) => {
        const c = nestedCandidate(row.candidates)
        return c == null || !c.deleted_at
      })
    },
  })

  const tasksQ = useQuery({
    queryKey: ['position-tasks', id, user?.id],
    networkMode: 'always',
    enabled: Boolean(supabase && user && id),
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
          position_candidate_id,
          position_candidates ( id, candidates ( id, full_name ) )
        `,
        )
        .eq('position_id', id!)
        .eq('user_id', user!.id)
        .order('due_at', { ascending: true, nullsFirst: false })
      if (error) throw error
      return (data ?? []) as PositionTaskRow[]
    },
  })

  const activityQ = useQuery({
    queryKey: ['position-activity', id, user?.id],
    networkMode: 'always',
    enabled: Boolean(supabase && user && id),
    queryFn: async () => {
      const { data, error } = await supabase!
        .from('activity_events')
        .select('id, event_type, title, subtitle, created_at, candidate_id, position_candidate_id, metadata')
        .eq('position_id', id!)
        .eq('user_id', user!.id)
        .order('created_at', { ascending: false })
        .limit(80)
      if (error) throw error
      return (data ?? []) as ActivityRow[]
    },
  })

  const candidateDrawerFilesQ = useQuery({
    queryKey: ['candidate-docs-files', user?.id, highlightCandidate],
    enabled: Boolean(supabase && user?.id && highlightCandidate),
    queryFn: async () => {
      const folder = `${user!.id}/${highlightCandidate}`
      const { data, error } = await supabase!.storage.from('candidate-docs').list(folder, { limit: 200 })
      if (error) throw error
      return data ?? []
    },
  })

  const positionIsOpen = useMemo(
    () => posQ.data?.status === 'active' || posQ.data?.status === 'on_hold',
    [posQ.data?.status],
  )

  const publicListTokenQ = useQuery({
    queryKey: ['position-public-list-token', id, user?.id],
    networkMode: 'always',
    enabled: Boolean(supabase && user && id && positionIsOpen),
    queryFn: async () => {
      const { data, error } = await supabase!
        .from('position_public_list_tokens')
        .select('token')
        .eq('position_id', id!)
        .is('revoked_at', null)
        .maybeSingle()
      if (error) throw error
      return (data as { token: string } | null)?.token ?? null
    },
  })

  const position = posQ.data
  const company = position?.companies as unknown as {
    id: string
    name: string
    contact_email: string | null
    avatar_url?: string | null
  } | undefined

  const backToPositionsList = useMemo(() => {
    if (company?.id) return `/positions?company=${encodeURIComponent(company.id)}`
    return '/positions'
  }, [company?.id])

  const [title, setTitle] = useState('')
  const [requirements, setRequirements] = useState('')
  const [hiringManagerName, setHiringManagerName] = useState('')
  const [hiringManagerEmail, setHiringManagerEmail] = useState('')
  const [hiringManagerPhone, setHiringManagerPhone] = useState('')
  const [salaryBudgetStr, setSalaryBudgetStr] = useState('')
  const [recruitmentFeeStr, setRecruitmentFeeStr] = useState('')
  const [welcome1, setWelcome1] = useState('')
  const [welcome2, setWelcome2] = useState('')
  const [welcome3, setWelcome3] = useState('')
  const [linkedinSearchUrl, setLinkedinSearchUrl] = useState('')
  const [positionSetupOpen, setPositionSetupOpen] = useState(false)
  const [candStatusFilter, setCandStatusFilter] = useState<Set<string>>(() => new Set(['in_progress']))
  const [status, setStatus] = useState('active')
  const [activityFilter, setActivityFilter] = useState<'all' | 'milestones'>('all')
  const [noteText, setNoteText] = useState('')
  const [shareOpen, setShareOpen] = useState(false)
  const [shareUrl, setShareUrl] = useState<string | null>(null)
  const [shareChannelOpen, setShareChannelOpen] = useState(false)
  const [selectedPositionTask, setSelectedPositionTask] = useState<PositionTaskRow | null>(null)
  const [headerStatusOpen, setHeaderStatusOpen] = useState(false)
  const headerStatusRef = useRef<HTMLDivElement>(null)
  const shareChannelRef = useRef<HTMLDivElement>(null)
  const [candidateDragId, setCandidateDragId] = useState<string | null>(null)
  const [candidateDropStage, setCandidateDropStage] = useState<string | null>(null)
  const [candidateDrawerPanel, setCandidateDrawerPanel] = useState<'overview' | 'files' | 'comments'>('overview')
  const [drawerPanelEntered, setDrawerPanelEntered] = useState(false)
  const [drawerFieldEdit, setDrawerFieldEdit] = useState<null | 'name' | 'email' | 'phone'>(null)
  const [drawerFieldDraft, setDrawerFieldDraft] = useState('')
  const [drawerAvatarBroken, setDrawerAvatarBroken] = useState(false)
  const [drawerFilesDragging, setDrawerFilesDragging] = useState(false)
  const [drawerCommentText, setDrawerCommentText] = useState('')
  const [drawerAssignStatusOpen, setDrawerAssignStatusOpen] = useState(false)
  const drawerAssignStatusRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (tab !== 'tasks') setSelectedPositionTask(null)
  }, [tab])

  useEffect(() => {
    if (highlightCandidate) {
      setCandidateDrawerPanel('overview')
      setDrawerFieldEdit(null)
      setDrawerAvatarBroken(false)
      setDrawerFilesDragging(false)
      setDrawerAssignStatusOpen(false)
      const id = requestAnimationFrame(() => setDrawerPanelEntered(true))
      return () => cancelAnimationFrame(id)
    }
    setDrawerPanelEntered(false)
    setCandidateDrawerPanel('overview')
    setDrawerFieldEdit(null)
    setDrawerAvatarBroken(false)
    setDrawerFilesDragging(false)
  }, [highlightCandidate])

  useEffect(() => {
    if (!position) return
    setTitle(position.title ?? '')
    const pos = position as {
      requirements?: unknown
      requirement_item_values?: unknown
      hiring_manager_name?: string | null
      hiring_manager_email?: string | null
      hiring_manager_phone?: string | null
      salary_budget?: number | null
      planned_fee_ils?: number | null
    }
    let reqText = normalizeRequirementsText(pos.requirements)
    if (!reqText && Array.isArray(pos.requirement_item_values)) {
      reqText = (pos.requirement_item_values as string[]).filter(Boolean).join('\n')
    }
    setRequirements(reqText)
    setHiringManagerName(pos.hiring_manager_name ?? '')
    setHiringManagerEmail(pos.hiring_manager_email ?? '')
    setHiringManagerPhone(pos.hiring_manager_phone ?? '')
    setSalaryBudgetStr(pos.salary_budget != null ? String(pos.salary_budget) : '')
    setRecruitmentFeeStr(pos.planned_fee_ils != null ? String(pos.planned_fee_ils) : '')
    setWelcome1(position.welcome_1 ?? '')
    setWelcome2(position.welcome_2 ?? '')
    setWelcome3(position.welcome_3 ?? '')
    setLinkedinSearchUrl((position as { linkedin_saved_search_url?: string | null }).linkedin_saved_search_url ?? '')
    setStatus(position.status ?? 'active')
  }, [position])

  useEffect(() => {
    if (search.get('setup') !== '1') return
    setPositionSetupOpen(true)
    setSearch(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.delete('setup')
        return next
      },
      { replace: true },
    )
  }, [search, setSearch])

  useEffect(() => {
    if (search.get('addCandidate') !== '1') return
    setSearch(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.delete('addCandidate')
        next.set('tab', 'candidates')
        return next
      },
      { replace: true },
    )
    requestAnimationFrame(() => {
      document.getElementById('position-candidates-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }, [search, setSearch])

  const invalidateAll = async () => {
    await qc.invalidateQueries({ queryKey: ['position', id] })
    await qc.invalidateQueries({ queryKey: ['position-candidates', id] })
    await qc.invalidateQueries({ queryKey: ['position-transition-stats', id] })
    await qc.invalidateQueries({ queryKey: ['position-activity', id] })
    await qc.invalidateQueries({ queryKey: ['position-public-list-token', id] })
    await qc.invalidateQueries({ queryKey: ['positions'] })
    await qc.invalidateQueries({ queryKey: ['dashboard-top-positions'] })
    await qc.invalidateQueries({ queryKey: ['pipeline-headline-stats'] })
    await qc.invalidateQueries({ queryKey: ['companies-positions-income'] })
    await qc.invalidateQueries({ queryKey: ['candidates'] })
    await qc.invalidateQueries({ queryKey: ['tasks-page'] })
    await qc.invalidateQueries({ queryKey: ['position-tasks', id] })
    await qc.invalidateQueries({ queryKey: ['notification-count'] })
  }

  async function saveCandidateFromDrawer(
    candidateId: string,
    patch: { full_name?: string; email?: string | null; phone?: string | null },
  ) {
    if (!supabase || !user) return
    const row: Record<string, unknown> = {}
    if (patch.full_name !== undefined) row.full_name = patch.full_name.trim() || 'Unnamed'
    if (patch.email !== undefined) {
      const em = patch.email?.trim() || null
      row.email = em
      row.email_normalized = normalizeEmail(em)
    }
    if (patch.phone !== undefined) {
      const ph = patch.phone?.trim() || null
      row.phone = ph
      row.phone_normalized = normalizePhone(ph)
    }
    const { error } = await supabase.from('candidates').update(row).eq('id', candidateId).eq('user_id', user.id)
    if (error) toastError(error.message)
    else {
      success('Saved')
      setDrawerFieldEdit(null)
      await invalidateAll()
    }
  }

  async function saveJobDescription(next: string) {
    const trimmed = next.trim() || null
    const { error } = await supabase!
      .from('positions')
      .update({ requirements: trimmed })
      .eq('id', id!)
      .eq('user_id', user!.id)
    if (!error) {
      setRequirements(normalizeRequirementsText(trimmed ?? ''))
      success('Saved')
      await invalidateAll()
      return
    }
    if (isMissingRequirementsColumnError(error.message)) {
      const tokens = parseRequirementTokens(next)
      const { error: e2 } = await supabase!
        .from('positions')
        .update({ requirement_item_values: tokens } as never)
        .eq('id', id!)
        .eq('user_id', user!.id)
      if (e2) {
        toastError(e2.message)
        return
      }
      setRequirements(tokens.length ? tokens.join('\n') : '')
      success('Saved')
      await invalidateAll()
      return
    }
    toastError(error.message)
  }

  function parseIlsAmountInput(raw: string): number | null | 'invalid' {
    const t = raw
      .replace(/,/g, '')
      .replace(/\s/g, '')
      .replace(/₪/g, '')
      .replace(/NIS/gi, '')
      .replace(/ILS/gi, '')
      .trim()
    if (!t) return null
    const n = Number(t)
    return Number.isFinite(n) ? n : 'invalid'
  }

  const savePos = useMutation({
    mutationFn: async () => {
      const base = {
        title: title.trim() || 'Untitled',
        welcome_1: welcome1.trim() || null,
        welcome_2: welcome2.trim() || null,
        welcome_3: welcome3.trim() || null,
        linkedin_saved_search_url: linkedinSearchUrl.trim() || null,
        status,
      }
      const withRequirements = { ...base, requirements: requirements.trim() || null }
      let { error } = await supabase!.from('positions').update(withRequirements).eq('id', id!).eq('user_id', user!.id)
      if (error && isMissingRequirementsColumnError(error.message)) {
        const tokens = parseRequirementTokens(requirements)
        const { error: e2 } = await supabase!
          .from('positions')
          .update({ ...base, requirement_item_values: tokens } as never)
          .eq('id', id!)
          .eq('user_id', user!.id)
        error = e2
      }
      if (error) throw error
    },
    onSuccess: async () => {
      success('Position saved')
      await invalidateAll()
    },
    onError: (e: Error) => toastError(e.message),
  })

  const setPositionTerminal = useMutation({
    mutationFn: async (next: 'succeeded' | 'cancelled') => {
      const prev = position?.status ?? 'active'
      const { error } = await supabase!
        .from('positions')
        .update({ status: next })
        .eq('id', id!)
        .eq('user_id', user!.id)
      if (error) throw error
      return { prev, next }
    },
    onSuccess: async ({ prev, next }) => {
      setStatus(next)
      success(next === 'succeeded' ? 'Marked succeeded' : 'Marked cancelled')
      await logActivityEvent(supabase!, user!.id, {
        event_type: 'position_status_changed',
        position_id: id!,
        title: next === 'succeeded' ? 'Position succeeded' : 'Position cancelled',
        subtitle: `${prev} → ${next}`,
        metadata: { from: prev, to: next },
      })
      await invalidateAll()
    },
    onError: (e: Error) => toastError(e.message),
  })

  const reopenPosition = useMutation({
    mutationFn: async () => {
      const { error } = await supabase!.from('positions').update({ status: 'active' }).eq('id', id!).eq('user_id', user!.id)
      if (error) throw error
    },
    onSuccess: async () => {
      setStatus('active')
      success('Position reopened')
      await invalidateAll()
    },
    onError: (e: Error) => toastError(e.message),
  })

  const setOpenPositionStatus = useMutation({
    mutationFn: async (next: 'active' | 'on_hold') => {
      const { error } = await supabase!.from('positions').update({ status: next }).eq('id', id!).eq('user_id', user!.id)
      if (error) throw error
    },
    onSuccess: async (_, next) => {
      setStatus(next)
      success('Status updated')
      await logActivityEvent(supabase!, user!.id, {
        event_type: 'position_status_changed',
        position_id: id!,
        title: 'Position status updated',
        subtitle: String(next),
        metadata: { to: next },
      })
      await invalidateAll()
    },
    onError: (e: Error) => toastError(e.message),
  })

  const [newStageName, setNewStageName] = useState('')

  const addStage = useMutation({
    mutationFn: async () => {
      const order = stagesQ.data?.length ?? 0
      const { error } = await supabase!.from('position_stages').insert({
        user_id: user!.id,
        position_id: id!,
        sort_order: order,
        name: newStageName.trim() || 'Stage',
      })
      if (error) throw error
    },
    onSuccess: async () => {
      setNewStageName('')
      success('Stage added')
      await qc.invalidateQueries({ queryKey: ['position-stages', id] })
    },
    onError: (e: Error) => toastError(e.message),
  })

  const updateStageMeta = useMutation({
    mutationFn: async (patch: { id: string } & Partial<Pick<StageRow, 'name' | 'description' | 'interviewers' | 'duration_minutes' | 'is_remote'>>) => {
      const { id: stageId, ...rest } = patch
      const { error } = await supabase!.from('position_stages').update(rest).eq('id', stageId).eq('user_id', user!.id)
      if (error) throw error
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['position-stages', id] })
    },
    onError: (e: Error) => toastError(e.message),
  })

  const deleteStageMut = useMutation({
    mutationFn: async (stageId: string) => {
      const using = (candidatesQ.data ?? []).filter((c) => c.position_stage_id === stageId).length
      if (using > 0) {
        const ok = window.confirm(
          `${using} assignment(s) use this stage. Their stage link will be cleared and the stage deleted. Continue?`,
        )
        if (!ok) throw new Error('cancelled')
        const { error: u1 } = await supabase!
          .from('position_candidates')
          .update({ position_stage_id: null })
          .eq('position_stage_id', stageId)
          .eq('user_id', user!.id)
          .eq('position_id', id!)
        if (u1) throw u1
      }
      const { error } = await supabase!.from('position_stages').delete().eq('id', stageId).eq('user_id', user!.id)
      if (error) throw error
    },
    onSuccess: async () => {
      success('Stage removed')
      await invalidateAll()
    },
    onError: (e: Error) => {
      if (e.message === 'cancelled') return
      toastError(e.message)
    },
  })

  async function moveStage(stageId: string, dir: -1 | 1) {
    const rows = [...(stagesQ.data ?? [])]
    const i = rows.findIndex((r) => r.id === stageId)
    const j = i + dir
    if (i < 0 || j < 0 || j >= rows.length) return
    const a = rows[i]!
    const b = rows[j]!
    await supabase!.from('position_stages').update({ sort_order: b.sort_order }).eq('id', a.id)
    await supabase!.from('position_stages').update({ sort_order: a.sort_order }).eq('id', b.id)
    await qc.invalidateQueries({ queryKey: ['position-stages', id] })
  }

  const [importError, setImportError] = useState<string | null>(null)

  async function onExcel(file: File | null) {
    setImportError(null)
    if (!file || !supabase || !user || !id) return
    const buf = await file.arrayBuffer()
    const wb = XLSX.read(buf, { type: 'array' })
    const sheet = wb.Sheets[wb.SheetNames[0]!]
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' })
    if (!rows.length) {
      setImportError('No rows found.')
      return
    }
    const first = rows[0]!
    const keys = Object.keys(first)
    const nameKey = keys.find((k) => /name/i.test(k)) ?? keys[0]!
    const emailKey = keys.find((k) => /email/i.test(k)) ?? keys[1]!
    const phoneKey = keys.find((k) => /phone|mobile|tel/i.test(k)) ?? keys[2]!

    await supabase.from('candidate_import_batches').insert({
      user_id: user.id,
      position_id: id,
      filename: file.name,
      row_count: rows.length,
    })

    const stageId = stagesQ.data?.[0]?.id ?? null
    let ok = 0
    for (const r of rows) {
      const nm = String(r[nameKey] ?? '').trim()
      if (!nm) continue
      const em = String(r[emailKey] ?? '').trim()
      const ph = String(r[phoneKey] ?? '').trim()
      const enNorm = normalizeEmail(em)
      const phNorm = normalizePhone(ph)
      let candId: string | null = null
      if (enNorm) {
        const { data: byEmail } = await supabase.from('candidates').select('id').eq('user_id', user.id).eq('email_normalized', enNorm).maybeSingle()
        candId = byEmail?.id ?? null
      }
      if (!candId && phNorm) {
        const { data: byPhone } = await supabase.from('candidates').select('id').eq('user_id', user.id).eq('phone_normalized', phNorm).maybeSingle()
        candId = byPhone?.id ?? null
      }
      if (!candId) {
        const { data: ins, error: insE } = await supabase
          .from('candidates')
          .insert({
            user_id: user.id,
            full_name: nm,
            email: em || null,
            phone: ph || null,
            status: 'active',
            email_normalized: enNorm,
            phone_normalized: phNorm,
          })
          .select('id')
          .single()
        if (insE || !ins) continue
        candId = ins.id
      }
      const { error: pcE } = await supabase.from('position_candidates').insert({
        user_id: user.id,
        position_id: id,
        candidate_id: candId,
        position_stage_id: stageId,
        status: 'in_progress',
        source: 'import',
      })
      if (!pcE) ok++
    }
    await qc.invalidateQueries({ queryKey: ['position-candidates', id] })
    await qc.invalidateQueries({ queryKey: ['position-transition-stats', id] })
    await qc.invalidateQueries({ queryKey: ['candidates'] })
    if (ok === 0) setImportError('Could not import rows — check column headers (name, email, phone).')
    else {
      success(`Imported ${ok} candidate(s)`)
      await logActivityEvent(supabase, user.id, {
        event_type: 'candidate_created',
        position_id: id,
        title: `Imported ${ok} candidates`,
        subtitle: file.name,
        metadata: { batch: true, count: ok },
      })
      await qc.invalidateQueries({ queryKey: ['position-activity', id] })
    }
  }

  const updatePositionTaskStatus = useMutation({
    mutationFn: async ({ taskId, status }: { taskId: string; status: PositionTaskStatus }) => {
      const { error } = await supabase!.from('tasks').update({ status }).eq('id', taskId).eq('user_id', user!.id)
      if (error) throw error
    },
    onSuccess: async (_d, { taskId, status }) => {
      setSelectedPositionTask((prev) => (prev && prev.id === taskId ? { ...prev, status } : prev))
      await qc.invalidateQueries({ queryKey: ['position-tasks', id] })
      await qc.invalidateQueries({ queryKey: ['tasks-page'] })
      await qc.invalidateQueries({ queryKey: ['dashboard-task-kpis'] })
      await qc.invalidateQueries({ queryKey: ['notification-count'] })
    },
    onError: (e: Error) => toastError(e.message),
  })

  const updateCandidateStage = useMutation({
    mutationFn: async ({ positionCandidateId, stageId }: { positionCandidateId: string; stageId: string | null }) => {
      const row = (candidatesQ.data ?? []).find((c) => c.id === positionCandidateId)
      const oldStageId = row?.position_stage_id as string | null
      const stages = stagesQ.data ?? []
      const oldS = oldStageId ? stages.find((s) => s.id === oldStageId) : null
      const newS = stageId ? stages.find((s) => s.id === stageId) : null
      const prof = nestedCandidate(row?.candidates ?? null)
      const { error } = await supabase!
        .from('position_candidates')
        .update({ position_stage_id: stageId })
        .eq('id', positionCandidateId)
        .eq('user_id', user!.id)
      if (error) throw error
      return {
        positionCandidateId,
        candidateId: prof?.id ?? row?.candidate_id,
        oldS,
        newS,
        candName: prof?.full_name ?? 'Candidate',
      }
    },
    onSuccess: async ({ positionCandidateId, candidateId, oldS, newS, candName }) => {
      success('Stage updated')
      const fromName = oldS?.name ?? '—'
      const toName = newS?.name ?? '—'
      await logPositionCandidateTransition(supabase!, user!.id, {
        position_candidate_id: positionCandidateId,
        transition_type: 'stage',
        from_stage_id: oldS?.id ?? null,
        to_stage_id: newS?.id ?? null,
      })
      await logActivityEvent(supabase!, user!.id, {
        event_type: 'candidate_stage_changed',
        position_id: id!,
        candidate_id: candidateId ?? null,
        position_candidate_id: positionCandidateId,
        title: `${candName}: stage change`,
        subtitle: `${fromName} → ${toName}`,
        metadata: {
          from_stage_id: oldS?.id,
          to_stage_id: newS?.id,
          from_sort_order: oldS?.sort_order,
          to_sort_order: newS?.sort_order,
        },
      })
      const N = criticalStageThreshold(position as { critical_stage_sort_order?: number | null })
      if (newS && candidateId && newS.sort_order >= N) {
        await logActivityEvent(supabase!, user!.id, {
          event_type: 'candidate_reached_critical_stage',
          position_id: id!,
          candidate_id: candidateId,
          position_candidate_id: positionCandidateId,
          title: `${candName} reached stage ${N}+`,
          subtitle: newS.name,
          metadata: { sort_order: newS.sort_order, threshold: N },
        })
      }
      await invalidateAll()
    },
    onError: (e: Error) => toastError(e.message),
  })

  const patchAssignmentStatus = useMutation({
    mutationFn: async ({
      positionCandidateId,
      nextStatus,
      closeTasks,
    }: {
      positionCandidateId: string
      nextStatus: 'in_progress' | 'rejected' | 'withdrawn'
      closeTasks: boolean
    }) => {
      const row = (candidatesQ.data ?? []).find((c) => c.id === positionCandidateId)
      const prev = (row?.status as string) ?? 'in_progress'
      const { error } = await supabase!
        .from('position_candidates')
        .update({ status: nextStatus })
        .eq('id', positionCandidateId)
        .eq('user_id', user!.id)
      if (error) throw error
      if (closeTasks && nextStatus !== 'in_progress') {
        await supabase!
          .from('tasks')
          .update({ status: 'closed' })
          .eq('position_candidate_id', positionCandidateId)
          .eq('user_id', user!.id)
          .neq('status', 'closed')
      }
      const prof = nestedCandidate(row?.candidates ?? null)
      return {
        positionCandidateId,
        candidateId: prof?.id ?? row?.candidate_id,
        prev,
        nextStatus,
        name: prof?.full_name ?? 'Candidate',
      }
    },
    onSuccess: async ({ positionCandidateId, candidateId, prev, nextStatus, name }) => {
      success('Status updated')
      await logPositionCandidateTransition(supabase!, user!.id, {
        position_candidate_id: positionCandidateId,
        transition_type: 'status',
        from_status: prev,
        to_status: nextStatus,
      })
      await logActivityEvent(supabase!, user!.id, {
        event_type: 'candidate_status_changed',
        position_id: id!,
        candidate_id: candidateId ?? null,
        position_candidate_id: positionCandidateId,
        title: `${name}: ${nextStatus}`,
        subtitle: `${prev} → ${nextStatus}`,
        metadata: { from: prev, to: nextStatus },
      })
      await invalidateAll()
    },
    onError: (e: Error) => toastError(e.message),
  })

  const withdrawFromRole = useMutation({
    mutationFn: async (positionCandidateId: string) => {
      const row = (candidatesQ.data ?? []).find((c) => c.id === positionCandidateId)
      const prevStatus = (row?.status as string) ?? 'in_progress'
      const prof = nestedCandidate(row?.candidates ?? null)
      const { error } = await supabase!
        .from('position_candidates')
        .update({ status: 'withdrawn' })
        .eq('id', positionCandidateId)
        .eq('user_id', user!.id)
      if (error) throw error
      return {
        positionCandidateId,
        prevStatus,
        candidateId: prof?.id ?? row?.candidate_id ?? null,
        name: prof?.full_name ?? 'Candidate',
      }
    },
    onSuccess: async ({ positionCandidateId, prevStatus, candidateId, name }) => {
      success('Withdrawn from this role')
      await logPositionCandidateTransition(supabase!, user!.id, {
        position_candidate_id: positionCandidateId,
        transition_type: 'status',
        from_status: prevStatus,
        to_status: 'withdrawn',
      })
      await logActivityEvent(supabase!, user!.id, {
        event_type: 'candidate_status_changed',
        position_id: id!,
        candidate_id: candidateId,
        position_candidate_id: positionCandidateId,
        title: `${name}: withdrawn from role`,
        subtitle: 'Assignment closed',
      })
      if (highlightCandidate && candidateId === highlightCandidate) setSearch({}, { replace: true })
      await invalidateAll()
    },
    onError: (e: Error) => toastError(e.message),
  })

  const addNote = useMutation({
    mutationFn: async () => {
      if (!noteText.trim()) throw new Error('Enter a note')
      const positionCandidateId = highlightCandidate
        ? ((candidatesQ.data ?? []).find((r) => nestedCandidate(r.candidates)?.id === highlightCandidate)?.id ?? null)
        : null
      await logActivityEvent(supabase!, user!.id, {
        event_type: 'note_added',
        position_id: id!,
        candidate_id: highlightCandidate || null,
        position_candidate_id: positionCandidateId,
        title: 'Note',
        subtitle: noteText.trim(),
      })
    },
    onSuccess: async () => {
      setNoteText('')
      success('Note saved')
      await qc.invalidateQueries({ queryKey: ['position-activity', id] })
    },
    onError: (e: Error) => toastError(e.message),
  })

  const addDrawerComment = useMutation({
    mutationFn: async (payload: { text: string; candidateId: string; positionCandidateId: string }) => {
      const t = payload.text.trim()
      if (!t) throw new Error('Enter a comment')
      await logActivityEvent(supabase!, user!.id, {
        event_type: 'note_added',
        position_id: id!,
        candidate_id: payload.candidateId,
        position_candidate_id: payload.positionCandidateId,
        title: 'Comment',
        subtitle: t,
      })
    },
    onSuccess: async () => {
      setDrawerCommentText('')
      success('Comment added')
      await qc.invalidateQueries({ queryKey: ['position-activity', id] })
    },
    onError: (e: Error) => toastError(e.message),
  })

  const updateAssignmentSource = useMutation({
    mutationFn: async (payload: { positionCandidateId: string; source: AssignmentSourceValue }) => {
      const { error } = await supabase!
        .from('position_candidates')
        .update({ source: payload.source })
        .eq('id', payload.positionCandidateId)
        .eq('user_id', user!.id)
      if (error) throw error
    },
    onSuccess: async () => {
      success('Source updated')
      await invalidateAll()
    },
    onError: (e: Error) => toastError(e.message),
  })

  const deleteActivityEvent = useMutation({
    mutationFn: async (eventId: string) => {
      const { error } = await supabase!.from('activity_events').delete().eq('id', eventId).eq('user_id', user!.id)
      if (error) throw error
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['position-activity', id] })
    },
    onError: (e: Error) => toastError(e.message),
  })

  const createShareToken = useMutation({
    mutationFn: async (candidateId: string) => {
      const token = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '').slice(0, 16)
      const { error } = await supabase!.from('candidate_share_tokens').insert({
        user_id: user!.id,
        candidate_id: candidateId,
        token,
        expires_at: new Date(Date.now() + 7 * 864e5).toISOString(),
      })
      if (error) throw error
      return token
    },
    onSuccess: (token) => {
      const url = `${window.location.origin}/p/${token}`
      setShareUrl(url)
      setShareOpen(true)
      void navigator.clipboard.writeText(url).catch(() => {})
      success('Share link copied')
    },
    onError: (e: Error) => toastError(e.message),
  })

  const ensurePositionPublicListToken = useMutation({
    mutationFn: async () => {
      if (!supabase || !user || !id) throw new Error('Not signed in')
      const now = new Date().toISOString()
      const { error: revErr } = await supabase
        .from('position_public_list_tokens')
        .update({ revoked_at: now })
        .eq('position_id', id)
        .eq('user_id', user.id)
        .is('revoked_at', null)
      if (revErr) throw revErr
      const token = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '').slice(0, 16)
      const { error } = await supabase.from('position_public_list_tokens').insert({
        user_id: user.id,
        position_id: id,
        token,
      })
      if (error) throw error
      return token
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['position-public-list-token', id] })
    },
    onError: (e: Error) => toastError(e.message),
  })

  async function uploadResume(candidateId: string, file: File | null) {
    if (!file || !supabase || !user) return
    const path = `${user.id}/${candidateId}/${Date.now()}-${file.name.replace(/[^\w.-]/g, '_')}`
    const { error: upErr } = await supabase.storage.from('candidate-docs').upload(path, file)
    if (upErr) {
      toastError(upErr.message)
      return
    }
    const { error } = await supabase.from('candidates').update({ resume_storage_path: path }).eq('id', candidateId).eq('user_id', user.id)
    if (error) {
      toastError(error.message)
      return
    }
    success('Resume uploaded')
    const positionCandidateId =
      (candidatesQ.data ?? []).find((r) => nestedCandidate(r.candidates)?.id === candidateId)?.id ?? null
    await logActivityEvent(supabase, user.id, {
      event_type: 'candidate_file_uploaded',
      position_id: id!,
      candidate_id: candidateId,
      position_candidate_id: positionCandidateId,
      title: 'Resume uploaded',
      subtitle: file.name,
      metadata: { file_kind: 'resume', path },
    })
    await qc.invalidateQueries({ queryKey: ['position-candidates', id] })
    await qc.invalidateQueries({ queryKey: ['position-activity', id] })
    await qc.invalidateQueries({ queryKey: ['candidate-docs-files', user.id, candidateId] })
  }

  async function uploadCandidateAttachment(candidateId: string, file: File | null) {
    if (!file || !supabase || !user || !id) return
    const path = `${user.id}/${candidateId}/${Date.now()}-${file.name.replace(/[^\w.-]/g, '_')}`
    const { error: upErr } = await supabase.storage.from('candidate-docs').upload(path, file)
    if (upErr) {
      toastError(upErr.message)
      return
    }
    success('File uploaded')
    const positionCandidateId =
      (candidatesQ.data ?? []).find((r) => nestedCandidate(r.candidates)?.id === candidateId)?.id ?? null
    await logActivityEvent(supabase, user.id, {
      event_type: 'candidate_file_uploaded',
      position_id: id,
      candidate_id: candidateId,
      position_candidate_id: positionCandidateId,
      title: 'File uploaded',
      subtitle: file.name,
      metadata: { file_kind: 'attachment', path },
    })
    await qc.invalidateQueries({ queryKey: ['position-candidates', id] })
    await qc.invalidateQueries({ queryKey: ['position-activity', id] })
    await qc.invalidateQueries({ queryKey: ['candidate-docs-files', user.id, candidateId] })
  }

  async function uploadCandidatePhoto(candidateId: string, file: File | null) {
    if (!file || !supabase || !user || !id) return
    if (!file.type.startsWith('image/')) {
      toastError('Use an image file (JPEG, PNG, or WebP).')
      return
    }
    const ext = (file.name.split('.').pop() ?? 'jpg').replace(/[^\w]/g, '') || 'jpg'
    const path = `${user.id}/${candidateId}/avatar-${Date.now()}.${ext}`
    const { error: upErr } = await supabase.storage.from('candidate-docs').upload(path, file)
    if (upErr) {
      toastError(upErr.message)
      return
    }
    const { error } = await supabase
      .from('candidates')
      .update({ profile_photo_storage_path: path })
      .eq('id', candidateId)
      .eq('user_id', user.id)
    if (error) {
      toastError(error.message)
      return
    }
    success('Photo updated')
    const positionCandidateId =
      (candidatesQ.data ?? []).find((r) => nestedCandidate(r.candidates)?.id === candidateId)?.id ?? null
    await logActivityEvent(supabase, user.id, {
      event_type: 'candidate_file_uploaded',
      position_id: id,
      candidate_id: candidateId,
      position_candidate_id: positionCandidateId,
      title: 'Profile photo updated',
      subtitle: file.name,
      metadata: { file_kind: 'avatar', path },
    })
    await qc.invalidateQueries({ queryKey: ['position-candidates', id] })
    await qc.invalidateQueries({ queryKey: ['position-activity', id] })
    await qc.invalidateQueries({ queryKey: ['candidate-docs-files', user.id, candidateId] })
  }

  async function previewResume(storagePath: string) {
    if (!supabase) return
    const { data, error } = await supabase.storage.from('candidate-docs').createSignedUrl(storagePath, 120)
    if (error || !data?.signedUrl) {
      toastError(error?.message ?? 'Could not open file')
      return
    }
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
  }

  const filteredActivity = useMemo(() => {
    const rows = activityQ.data ?? []
    if (activityFilter === 'milestones') {
      return rows.filter((r) =>
        [
          'candidate_reached_critical_stage',
          'candidate_created',
          'position_status_changed',
          'candidate_outcome_changed',
          'candidate_status_changed',
        ].includes(r.event_type),
      )
    }
    return rows
  }, [activityQ.data, activityFilter])

  const activityByDay = useMemo(() => {
    const groups: { dayKey: string; dayLabel: string; rows: ActivityRow[] }[] = []
    const indexByKey = new Map<string, number>()
    for (const a of filteredActivity) {
      const d = new Date(a.created_at)
      const dayKey = format(d, 'yyyy-MM-dd')
      const dayLabel = format(d, 'EEEE, MMM d, yyyy')
      let idx = indexByKey.get(dayKey)
      if (idx === undefined) {
        idx = groups.length
        indexByKey.set(dayKey, idx)
        groups.push({ dayKey, dayLabel, rows: [] })
      }
      groups[idx]!.rows.push(a)
    }
    return groups
  }, [filteredActivity])

  const terminalPosition = status === 'succeeded' || status === 'cancelled'

  const filteredCandidates = useMemo(
    () => (candidatesQ.data ?? []).filter((c) => candStatusFilter.has(c.status as string)),
    [candidatesQ.data, candStatusFilter],
  )

  const pipelineKanbanCandidates = useMemo(
    () => (candidatesQ.data ?? []).filter((c) => c.status === 'in_progress'),
    [candidatesQ.data],
  )

  const candidateTabCount = (candidatesQ.data ?? []).length

  const positionTasksListOrdered = useMemo(() => {
    const list = tasksQ.data ?? []
    const rank: Record<string, number> = { open: 0, closed: 1, archived: 2 }
    return [...list].sort((a, b) => {
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
  }, [tasksQ.data])

  const candidateNameById = useMemo(() => {
    const m = new Map<string, string>()
    for (const c of candidatesQ.data ?? []) {
      const p = nestedCandidate(c.candidates)
      if (p?.id) m.set(p.id, p.full_name ?? 'Unnamed')
    }
    return m
  }, [candidatesQ.data])

  function stageDropSlot(stageId: string | null) {
    return stageId ?? '__unassigned__'
  }

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!headerStatusRef.current?.contains(e.target as Node)) setHeaderStatusOpen(false)
    }
    if (headerStatusOpen) document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [headerStatusOpen])

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!drawerAssignStatusRef.current?.contains(e.target as Node)) setDrawerAssignStatusOpen(false)
    }
    if (drawerAssignStatusOpen) document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [drawerAssignStatusOpen])

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!shareChannelRef.current?.contains(e.target as Node)) setShareChannelOpen(false)
    }
    if (shareChannelOpen) document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [shareChannelOpen])

  const drawerCandidate = useMemo(() => {
    if (!highlightCandidate) return null
    return (candidatesQ.data ?? []).find((r) => nestedCandidate(r.candidates)?.id === highlightCandidate) ?? null
  }, [candidatesQ.data, highlightCandidate])

  function toggleCandStatusFilter(key: string) {
    setCandStatusFilter((prev) => {
      const next = new Set(prev)
      if (next.has(key)) {
        if (next.size <= 1) return prev
        next.delete(key)
      } else next.add(key)
      return next
    })
  }

  function copyWelcomeSnippet(text: string, label: string) {
    if (!text.trim()) {
      toastError('Nothing to copy')
      return
    }
    void navigator.clipboard.writeText(text).then(
      () => success(`${label} copied`),
      () => toastError('Could not copy'),
    )
  }

  function openSavedLinkedin() {
    const raw = linkedinSearchUrl.trim()
    if (!raw) {
      toastError('Enter a URL first')
      return
    }
    try {
      const href = raw.startsWith('http://') || raw.startsWith('https://') ? raw : `https://${raw}`
      const u = new URL(href)
      window.open(u.href, '_blank', 'noopener,noreferrer')
    } catch {
      toastError('Invalid URL')
    }
  }

  function openCandidateDrawer(candId: string) {
    setSearch(
      (prev) => {
        const n = new URLSearchParams(prev)
        n.set('tab', 'candidates')
        n.set('candidate', candId)
        return n
      },
      { replace: true },
    )
  }

  function closeCandidateDrawer() {
    setSearch(
      (prev) => {
        const n = new URLSearchParams(prev)
        n.delete('candidate')
        return n
      },
      { replace: true },
    )
  }

  function parseCandidateDragPayload(e: DragEvent): { pcId: string } | null {
    try {
      const raw = e.dataTransfer.getData('application/json')
      if (!raw) return null
      const o = JSON.parse(raw) as { kind?: string; pcId?: string }
      if (o.kind !== 'position_candidate' || !o.pcId) return null
      return { pcId: o.pcId }
    } catch {
      return null
    }
  }

  function onCandidateDragOverStage(e: DragEvent, stageId: string | null) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setCandidateDropStage(stageDropSlot(stageId))
  }

  function onCandidateDragLeaveStage(e: DragEvent, stageId: string | null) {
    const slot = stageDropSlot(stageId)
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setCandidateDropStage((h) => (h === slot ? null : h))
    }
  }

  function onCandidateDropStage(e: DragEvent, stageId: string | null) {
    e.preventDefault()
    setCandidateDropStage(null)
    setCandidateDragId(null)
    const p = parseCandidateDragPayload(e)
    if (!p) return
    const row = (candidatesQ.data ?? []).find((c) => c.id === p.pcId)
    if (!row || row.status !== 'in_progress') return
    if (row.position_stage_id === stageId) return
    void updateCandidateStage.mutateAsync({ positionCandidateId: p.pcId, stageId })
  }

  if (!id) {
    return <Navigate to="/positions" replace />
  }

  if (!supabase || !user?.id) {
    return <PageSpinner message="Getting ready…" className="min-h-[50vh]" />
  }

  if (posQ.isError) {
    return (
      <div className="bg-paper text-ink flex min-h-dvh flex-col items-center justify-center gap-3 px-6 dark:bg-paper-dark dark:text-stone-100">
        <p className="text-center text-sm font-semibold text-stone-800 dark:text-stone-100">We couldn&apos;t load this role.</p>
        <p className="text-ink-muted max-w-sm text-center text-xs dark:text-stone-400">
          It may have been removed, or you don&apos;t have access to it.
        </p>
        <Link to="/positions" className="text-accent text-sm font-semibold underline dark:text-orange-300">
          Back to positions
        </Link>
      </div>
    )
  }

  if (posQ.isPending) {
    return <PageSpinner message="Loading role…" className="min-h-[50vh]" />
  }

  if (!position) {
    return (
      <div className="bg-paper text-ink flex min-h-dvh flex-col items-center justify-center gap-3 px-6 dark:bg-paper-dark dark:text-stone-100">
        <p className="text-center text-sm font-semibold text-stone-800 dark:text-stone-100">We couldn&apos;t load this role.</p>
        <p className="text-ink-muted max-w-sm text-center text-xs dark:text-stone-400">
          Something went wrong while fetching this page. Try again or go back to your positions list.
        </p>
        <Link to="/positions" className="text-accent text-sm font-semibold underline dark:text-orange-300">
          Back to positions
        </Link>
      </div>
    )
  }

  const createdAt = (position as { created_at?: string }).created_at
  const daysSinceCreated = createdAt ? differenceInCalendarDays(new Date(), new Date(createdAt)) : 0
  const openedLabel = createdAt
    ? `Opened ${format(new Date(createdAt), 'MMM d, yyyy')}`
    : 'Opened —'

  function formatActivityArrowPath(subtitle: string | null): string {
    if (!subtitle) return '—'
    return subtitle.replace(/\s*→\s*/g, ' > ').replace(/\s*->\s*/g, ' > ').trim()
  }

  function timelineKindStyles(eventType: string): { rail: string; dot: string; pill: string; pillLabel: string } {
    switch (eventType) {
      case 'candidate_stage_changed':
        return {
          rail: 'bg-sky-200/90 dark:bg-sky-900/50',
          dot: 'bg-sky-500 shadow-sm dark:bg-sky-400',
          pill: 'border-sky-200/90 bg-sky-50 text-sky-950 dark:border-sky-800 dark:bg-sky-950/45 dark:text-sky-100',
          pillLabel: 'Stage',
        }
      case 'candidate_status_changed':
        return {
          rail: 'bg-violet-200/90 dark:bg-violet-900/45',
          dot: 'bg-violet-500 shadow-sm dark:bg-violet-400',
          pill: 'border-violet-200/90 bg-violet-50 text-violet-950 dark:border-violet-800 dark:bg-violet-950/40 dark:text-violet-100',
          pillLabel: 'Status',
        }
      case 'candidate_created':
        return {
          rail: 'bg-emerald-200/90 dark:bg-emerald-900/45',
          dot: 'bg-emerald-500 shadow-sm dark:bg-emerald-400',
          pill: 'border-emerald-200/90 bg-emerald-50 text-emerald-950 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-100',
          pillLabel: 'Joined',
        }
      case 'candidate_file_uploaded':
        return {
          rail: 'bg-amber-200/90 dark:bg-amber-900/45',
          dot: 'bg-amber-500 shadow-sm dark:bg-amber-400',
          pill: 'border-amber-200/90 bg-amber-50 text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100',
          pillLabel: 'File',
        }
      case 'candidate_reached_critical_stage':
        return {
          rail: 'bg-orange-200/90 dark:bg-orange-900/45',
          dot: 'bg-orange-500 shadow-sm dark:bg-orange-400',
          pill: 'border-orange-200/90 bg-orange-50 text-orange-950 dark:border-orange-800 dark:bg-orange-950/40 dark:text-orange-100',
          pillLabel: 'Milestone',
        }
      default:
        return {
          rail: 'bg-stone-200/90 dark:bg-stone-700/60',
          dot: 'bg-stone-500 dark:bg-stone-400',
          pill: 'border-stone-200/80 bg-stone-50 text-stone-800 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-200',
          pillLabel: 'Event',
        }
    }
  }

  function tailStatusFromSubtitle(subtitle: string | null): string {
    if (!subtitle) return 'in_progress'
    const parts = subtitle.split(/→|->/)
    const last = parts[parts.length - 1]?.trim()
    if (!last) return 'in_progress'
    return last.replace(/\s+/g, '_')
  }

  function renderWithdrawnCandidateRow(c: PositionCandidateJunction) {
    const prof = nestedCandidate(c.candidates)
    const candId = prof?.id
    const stageName = nestedStageName(c.position_stages)
    const displayName = prof?.full_name ?? 'Unnamed'
    return (
      <li
        key={c.id}
        id={candId ? `cand-${candId}` : `pc-${c.id}`}
        className="border-line rounded-xl border bg-white/60 p-3 dark:border-line-dark dark:bg-stone-900/40"
      >
        <div className="flex flex-wrap items-start justify-between gap-2">
          <Link
            to={`?tab=candidates&candidate=${candId ?? ''}`}
            className="text-accent min-w-0 flex-1 font-semibold hover:underline dark:text-orange-300"
          >
            {displayName}
            <ChevronRight className="ml-1 inline h-4 w-4 opacity-50" aria-hidden />
          </Link>
          <button
            type="button"
            onClick={() => {
              if (window.confirm(`Withdraw ${displayName} from this role?`)) void withdrawFromRole.mutateAsync(c.id)
            }}
            className="text-ink-muted hover:text-red-600 flex shrink-0 items-center gap-1 text-xs"
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden />
            Withdraw
          </button>
        </div>
        <p className="text-ink-muted mt-1 text-xs">
          {ASSIGNMENT_SOURCE_LABELS[normalizeAssignmentSource(c.source)]} · {stageName} ·{' '}
          {formatAssignmentStatus(c.status as string)}
        </p>
      </li>
    )
  }

  function renderPipelineKanbanCard(c: PositionCandidateJunction) {
    const prof = nestedCandidate(c.candidates)
    const candId = prof?.id
    const tenure = formatTenureOnRoleShort(c.created_at as string)
    return (
      <div
        key={c.id}
        role="button"
        tabIndex={0}
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData('application/json', JSON.stringify({ kind: 'position_candidate', pcId: c.id }))
          e.dataTransfer.effectAllowed = 'move'
          setCandidateDragId(c.id)
        }}
        onDragEnd={() => setCandidateDragId(null)}
        onClick={() => candId && openCandidateDrawer(candId)}
        onKeyDown={(e) => {
          if ((e.key === 'Enter' || e.key === ' ') && candId) {
            e.preventDefault()
            openCandidateDrawer(candId)
          }
        }}
        className={`border-line flex cursor-grab rounded-2xl border bg-white/70 transition-[opacity,box-shadow] active:cursor-grabbing dark:border-line-dark dark:bg-stone-900/45 ${
          candidateDragId === c.id ? 'opacity-60 shadow-lg ring-2 ring-[#9b3e20]/30' : 'shadow-sm'
        }`}
      >
        <div
          className="text-ink-muted hover:text-ink flex w-9 shrink-0 cursor-grab items-center justify-center border-r border-stone-200/80 active:cursor-grabbing dark:border-stone-600"
          aria-hidden
        >
          <GripVertical className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1 px-3 py-2.5">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <p
              className="min-w-0 flex-1 truncate text-base leading-snug font-semibold text-[#302e2b] dark:text-stone-100"
              title={prof?.full_name ?? 'Unnamed'}
            >
              {prof?.full_name ?? 'Unnamed'}
            </p>
            <span
              className="text-stitch-muted shrink-0 tabular-nums text-xs font-normal dark:text-stone-500"
              title="Time on role"
            >
              {tenure}
            </span>
          </div>
        </div>
      </div>
    )
  }

  const statusLabelShort =
    status === 'active' ? 'Active' : status === 'on_hold' ? 'On hold' : status === 'succeeded' ? 'Succeeded' : 'Cancelled'

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-4 border-b border-stone-200/90 pb-5 dark:border-stone-700">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 flex-1 items-start gap-3">
            <Link
              to={backToPositionsList}
              className="border-line text-ink-muted hover:bg-stone-100 dark:hover:bg-stone-800 mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border bg-white/90 shadow-sm transition dark:border-line-dark dark:bg-stone-900"
              aria-label="Back to positions"
            >
              <ArrowLeft className="h-5 w-5" aria-hidden />
            </Link>
            <div className="min-w-0 flex-1">
              <h1 className="border-b-2 border-[#9b3e20] pb-2 text-xl font-semibold uppercase tracking-[0.14em] text-stone-800 sm:text-2xl md:text-3xl dark:border-orange-400/90 dark:text-stone-100">
                {position.title}
              </h1>
              <p className="text-ink-muted mt-0.5 text-sm font-medium dark:text-stone-400">
                by {company?.name ?? '—'}
              </p>
              <p className="text-ink-muted mt-2 text-xs dark:text-stone-500">
                {openedLabel}
                <span aria-hidden className="mx-2">
                  ·
                </span>
                <span title="Days since this role was created in Yulis">On books {daysSinceCreated}d</span>
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-1.5">
            <div className="relative" ref={headerStatusRef}>
              <button
                type="button"
                onClick={() => setHeaderStatusOpen((o) => !o)}
                className={`border-line flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-bold shadow-sm transition dark:border-line-dark ${
                  status === 'active'
                    ? 'border-emerald-200/90 bg-gradient-to-br from-emerald-50 to-white text-emerald-900 dark:border-emerald-800/80 dark:from-emerald-950/60 dark:to-stone-900 dark:text-emerald-200'
                    : status === 'on_hold'
                      ? 'border-amber-200/90 bg-gradient-to-br from-amber-50 to-white text-amber-900 dark:border-amber-800/80 dark:from-amber-950/50 dark:to-stone-900 dark:text-amber-200'
                      : status === 'succeeded'
                        ? 'border-emerald-300/80 bg-gradient-to-br from-emerald-100/80 to-white text-emerald-950 dark:border-emerald-800/60 dark:from-emerald-950/40 dark:to-stone-900 dark:text-emerald-100'
                        : 'border-stone-200/90 bg-gradient-to-br from-stone-100 to-white text-stone-800 dark:border-stone-600 dark:from-stone-800/80 dark:to-stone-900 dark:text-stone-200'
                }`}
                aria-expanded={headerStatusOpen}
                aria-haspopup="listbox"
              >
                {status === 'active' ? (
                  <Play className="h-4 w-4 shrink-0 fill-current text-emerald-600 dark:text-emerald-400" aria-hidden />
                ) : status === 'on_hold' ? (
                  <Pause className="h-4 w-4 shrink-0 text-amber-700 dark:text-amber-300" aria-hidden />
                ) : status === 'succeeded' ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
                ) : (
                  <Ban className="h-4 w-4 shrink-0 text-stone-500 dark:text-stone-400" aria-hidden />
                )}
                <span>{statusLabelShort}</span>
                <ChevronDown className="h-4 w-4 shrink-0 opacity-60" aria-hidden />
              </button>
              {headerStatusOpen ? (
                <div
                  role="listbox"
                  className="border-line absolute top-full right-0 z-50 mt-1 min-w-[12rem] rounded-xl border bg-white py-1 shadow-xl dark:border-line-dark dark:bg-stone-900"
                >
                  {!terminalPosition ? (
                    <>
                      <button
                        type="button"
                        role="option"
                        className="hover:bg-stone-50 dark:hover:bg-stone-800 flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-semibold text-emerald-800 dark:text-emerald-300"
                        onClick={() => {
                          setHeaderStatusOpen(false)
                          void setOpenPositionStatus.mutateAsync('active')
                        }}
                      >
                        <Play className="h-4 w-4 shrink-0 opacity-80" aria-hidden />
                        Active
                      </button>
                      <button
                        type="button"
                        role="option"
                        className="hover:bg-stone-50 dark:hover:bg-stone-800 flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-semibold text-amber-800 dark:text-amber-200"
                        onClick={() => {
                          setHeaderStatusOpen(false)
                          void setOpenPositionStatus.mutateAsync('on_hold')
                        }}
                      >
                        <Pause className="h-4 w-4 shrink-0 opacity-80" aria-hidden />
                        On hold
                      </button>
                      <button
                        type="button"
                        role="option"
                        className="hover:bg-stone-50 dark:hover:bg-stone-800 flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-stone-700 dark:text-stone-200"
                        onClick={() => {
                          setHeaderStatusOpen(false)
                          if (window.confirm('Mark this role as succeeded?')) void setPositionTerminal.mutateAsync('succeeded')
                        }}
                      >
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
                        Succeeded
                      </button>
                      <button
                        type="button"
                        role="option"
                        className="hover:bg-stone-50 dark:hover:bg-stone-800 flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-stone-600 dark:text-stone-300"
                        onClick={() => {
                          setHeaderStatusOpen(false)
                          if (window.confirm('Mark this role as cancelled?')) void setPositionTerminal.mutateAsync('cancelled')
                        }}
                      >
                        <Ban className="h-4 w-4 shrink-0 opacity-70" aria-hidden />
                        Cancelled
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      className="hover:bg-stone-50 dark:hover:bg-stone-800 flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-semibold"
                      onClick={() => {
                        setHeaderStatusOpen(false)
                        void reopenPosition.mutateAsync()
                      }}
                    >
                      <Play className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden />
                      Reopen as Active
                    </button>
                  )}
                </div>
              ) : null}
            </div>
            <button
              type="button"
              title="Workflow — stages and role setup"
              aria-label="Workflow and role setup"
              onClick={() => setPositionSetupOpen(true)}
              className="border-line flex h-10 w-10 items-center justify-center rounded-xl border bg-white/90 text-[#006384] shadow-sm transition hover:bg-cyan-50 dark:border-line-dark dark:bg-stone-800 dark:text-cyan-300 dark:hover:bg-stone-700"
            >
              <GitBranch className="h-4 w-4" aria-hidden />
            </button>
            {!terminalPosition ? (
              <div className="relative" ref={shareChannelRef}>
                <button
                  type="button"
                  title="Share"
                  aria-label="Share options"
                  aria-expanded={shareChannelOpen}
                  aria-haspopup="menu"
                  onClick={() => setShareChannelOpen((o) => !o)}
                  className="border-line flex h-10 items-center gap-1 rounded-xl border bg-white/90 px-2.5 text-stone-700 shadow-sm transition hover:bg-stone-100 dark:border-line-dark dark:bg-stone-800 dark:text-stone-200 dark:hover:bg-stone-700"
                >
                  <Share2 className="h-4 w-4 shrink-0" aria-hidden />
                  <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-60" aria-hidden />
                </button>
                {shareChannelOpen ? (
                  <div
                    role="menu"
                    className="border-line absolute top-full right-0 z-50 mt-1 min-w-[11rem] rounded-xl border bg-white py-1 shadow-xl dark:border-line-dark dark:bg-stone-900"
                  >
                    <button
                      type="button"
                      role="menuitem"
                      className="hover:bg-stone-50 dark:hover:bg-stone-800 flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-stone-700 dark:text-stone-200"
                      onClick={() => setShareChannelOpen(false)}
                    >
                      <Mail className="h-4 w-4 shrink-0 opacity-70" aria-hidden />
                      Email
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      disabled={publicListTokenQ.isLoading || ensurePositionPublicListToken.isPending}
                      className="hover:bg-stone-50 dark:hover:bg-stone-800 flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-stone-700 disabled:opacity-50 dark:text-stone-200"
                      onClick={async () => {
                        setShareChannelOpen(false)
                        if (!id) return
                        let tok = publicListTokenQ.data ?? null
                        if (tok == null) {
                          try {
                            tok = await ensurePositionPublicListToken.mutateAsync()
                          } catch {
                            return
                          }
                        }
                        const url = `${window.location.origin}/pub/pos/${tok}`
                        void navigator.clipboard.writeText(url).then(
                          () => success('Public URL copied'),
                          () => toastError('Could not copy'),
                        )
                      }}
                    >
                      <Link2 className="h-4 w-4 shrink-0 opacity-70" aria-hidden />
                      Public URL
                    </button>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>

        <nav
          className="flex flex-wrap gap-1 rounded-full bg-stone-100/95 p-1 dark:bg-stone-800/80"
          aria-label="Position sections"
        >
          {(
            [
              ['details', 'Details', null],
              ['candidates', 'Candidates', candidateTabCount],
              ['openings', 'Openings', null],
              ['tasks', 'Tasks', (tasksQ.data ?? []).length],
              ['activity', 'Activity', (activityQ.data ?? []).length],
            ] as const
          ).map(([tid, label, count]) => (
            <button
              key={tid}
              type="button"
              onClick={() => setTab(tid)}
              className={`rounded-full px-4 py-2 text-sm font-bold transition ${
                tab === tid
                  ? 'bg-accent text-white shadow-sm dark:bg-orange-600'
                  : 'text-ink-muted hover:bg-white/90 dark:text-stone-400 dark:hover:bg-stone-700/80'
              }`}
            >
              {label}
              {count != null ? ` (${count})` : ''}
            </button>
          ))}
        </nav>
      </header>

      {tab === 'details' ? (
        <section className="border-line max-w-3xl rounded-2xl border border-stone-200/80 bg-white/70 p-5 dark:border-line-dark dark:bg-stone-900/45">
          <h2 className="text-stitch-on-surface text-lg font-extrabold tracking-tight dark:text-stone-100">Details</h2>
          <div className="mt-4 flex flex-col gap-1">
            <DetailHoverField
              label="Title"
              value={title}
              onSave={async (next) => {
                const v = next.trim() || 'Untitled'
                const { error } = await supabase!
                  .from('positions')
                  .update({ title: v })
                  .eq('id', id!)
                  .eq('user_id', user!.id)
                if (error) toastError(error.message)
                else {
                  setTitle(v)
                  success('Saved')
                  await invalidateAll()
                }
              }}
            />
            <DetailHoverField
              label="Job description"
              value={requirements}
              multiline
              rows={10}
              onSave={async (next) => {
                await saveJobDescription(next)
              }}
            />
            <DetailHoverField
              label="Client salary budget (ILS)"
              value={salaryBudgetStr}
              onSave={async (next) => {
                const parsed = parseIlsAmountInput(next)
                if (parsed === 'invalid') {
                  toastError('Enter a valid number or leave empty.')
                  return
                }
                const { error } = await supabase!
                  .from('positions')
                  .update({ salary_budget: parsed })
                  .eq('id', id!)
                  .eq('user_id', user!.id)
                if (error) toastError(error.message)
                else {
                  setSalaryBudgetStr(parsed != null ? String(parsed) : '')
                  success('Saved')
                  await invalidateAll()
                }
              }}
            />
          </div>

          <h2 className="text-stitch-on-surface mt-10 text-lg font-extrabold tracking-tight dark:text-stone-100">Hiring manager</h2>
          <p className="text-ink-muted mt-2 text-xs dark:text-stone-500">
            Client-side contact for this role (name, email, and phone).
          </p>
          <div className="mt-3 flex flex-col gap-1">
            <DetailHoverField
              label="Name"
              value={hiringManagerName}
              onSave={async (next) => {
                const v = next.trim() || null
                const { error } = await supabase!
                  .from('positions')
                  .update({ hiring_manager_name: v })
                  .eq('id', id!)
                  .eq('user_id', user!.id)
                if (error) toastError(error.message)
                else {
                  setHiringManagerName(v ?? '')
                  success('Saved')
                  await invalidateAll()
                }
              }}
            />
            <DetailHoverField
              label="Email"
              value={hiringManagerEmail}
              onSave={async (next) => {
                const v = next.trim() || null
                const { error } = await supabase!
                  .from('positions')
                  .update({ hiring_manager_email: v })
                  .eq('id', id!)
                  .eq('user_id', user!.id)
                if (error) toastError(error.message)
                else {
                  setHiringManagerEmail(v ?? '')
                  success('Saved')
                  await invalidateAll()
                }
              }}
            />
            <DetailHoverField
              label="Phone"
              value={hiringManagerPhone}
              onSave={async (next) => {
                const v = next.trim() || null
                const { error } = await supabase!
                  .from('positions')
                  .update({ hiring_manager_phone: v })
                  .eq('id', id!)
                  .eq('user_id', user!.id)
                if (error) toastError(error.message)
                else {
                  setHiringManagerPhone(v ?? '')
                  success('Saved')
                  await invalidateAll()
                }
              }}
            />
          </div>

          <h2 className="text-stitch-on-surface mt-10 text-lg font-extrabold tracking-tight dark:text-stone-100">Milestones &amp; fees</h2>
          <p className="text-ink-muted mt-2 text-xs dark:text-stone-500">
            Recruitment fee for this role — the amount you expect from the client (same as in the creation flow).
          </p>
          <div className="mt-3 flex flex-col gap-1">
            <DetailHoverField
              label="Recruitment fee (ILS)"
              value={recruitmentFeeStr}
              readOnlyFormat={formatIlsAmountDisplay}
              onSave={async (next) => {
                const parsed = parseIlsAmountInput(next)
                if (parsed === 'invalid') {
                  toastError('Enter a valid number or leave empty.')
                  return
                }
                const { error } = await supabase!
                  .from('positions')
                  .update({ planned_fee_ils: parsed })
                  .eq('id', id!)
                  .eq('user_id', user!.id)
                if (error) toastError(error.message)
                else {
                  setRecruitmentFeeStr(parsed != null ? String(parsed) : '')
                  success('Saved')
                  await invalidateAll()
                }
              }}
            />
          </div>
        </section>
      ) : null}

      {tab === 'candidates' ? (
        <div className="relative">
          <section id="position-candidates-section" className="scroll-mt-24 space-y-4">
            <p className="text-ink-muted text-xs dark:text-stone-400">
              Pipeline board: drag cards between stages. Click a card to open the side panel (status, tags, comments, and
              history).
            </p>

            <input
              ref={resumeFileRef}
              type="file"
              accept=".pdf,.doc,.docx,application/pdf"
              className="sr-only"
              tabIndex={-1}
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null
                const cid = resumePickForId
                setResumePickForId(null)
                e.target.value = ''
                if (cid && f) void uploadResume(cid, f)
              }}
            />

            <div className="flex gap-4 overflow-x-auto pb-2 [scrollbar-width:thin]">
              {((): ReactNode => {
                const stages = stagesQ.data ?? []
                if (!stages.length) {
                  return (
                    <div className="border-line flex min-h-[min(50vh,22rem)] min-w-[220px] max-w-[280px] shrink-0 flex-col rounded-2xl border bg-white/50 p-3 shadow-sm dark:border-line-dark dark:bg-stone-900/40">
                      <h3 className={pipelineStageHeadingClass}>Pipeline</h3>
                      <p className="text-ink-muted px-1 py-3 text-xs dark:text-stone-500">Add stages in workflow to organize candidates by step.</p>
                      <div className="mt-2 flex flex-1 flex-col gap-2 overflow-y-auto pt-1">
                        {pipelineKanbanCandidates.length === 0 ? (
                          <p className="text-ink-muted px-1 py-3 text-xs">None — drop a candidate here.</p>
                        ) : (
                          pipelineKanbanCandidates.map((c) => renderPipelineKanbanCard(c))
                        )}
                      </div>
                    </div>
                  )
                }
                return stages.map((st, stageIdx) => {
                  const isFirst = stageIdx === 0
                  const cards = pipelineKanbanCandidates.filter(
                    (c) => c.position_stage_id === st.id || (isFirst && !c.position_stage_id),
                  )
                  const slotHot = candidateDropStage === stageDropSlot(st.id)
                  return (
                    <div
                      key={st.id}
                      className={`border-line flex min-h-[min(50vh,22rem)] min-w-[220px] max-w-[280px] shrink-0 flex-col rounded-2xl border bg-white/50 p-3 shadow-sm dark:border-line-dark dark:bg-stone-900/40 ${
                        slotHot ? 'ring-2 ring-[#9b3e20]/45 ring-offset-1 ring-offset-white dark:ring-orange-400/50 dark:ring-offset-stone-900' : ''
                      }`}
                      onDragOver={(e) => onCandidateDragOverStage(e, st.id)}
                      onDragLeave={(e) => onCandidateDragLeaveStage(e, st.id)}
                      onDrop={(e) => onCandidateDropStage(e, st.id)}
                    >
                      <h3 className={pipelineStageHeadingClass}>{st.name}</h3>
                      <div className="flex flex-1 flex-col gap-2 overflow-y-auto pt-1">
                        {cards.length === 0 ? (
                          <p className="text-ink-muted px-1 py-3 text-xs">None — drop a candidate here.</p>
                        ) : (
                          cards.map((c) => renderPipelineKanbanCard(c))
                        )}
                      </div>
                    </div>
                  )
                })
              })()}
            </div>

            <section className="border-line rounded-2xl border bg-white/50 p-4 shadow-sm dark:border-line-dark dark:bg-stone-900/40">
              <h3 className={pipelineSubsectionHeadingClass}>Rejected &amp; withdrawn</h3>
              <p className="text-ink-muted px-1 text-xs dark:text-stone-500">Filter the list — same tools as before for these assignments.</p>
              <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Filter candidates by status">
                {(
                  [
                    { id: 'in_progress', label: 'In progress' },
                    { id: 'rejected', label: 'Rejected' },
                    { id: 'withdrawn', label: 'Withdrawn' },
                  ] as const
                ).map(({ id: fid, label }) => (
                  <button
                    key={fid}
                    type="button"
                    onClick={() => toggleCandStatusFilter(fid)}
                    className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${
                      candStatusFilter.has(fid) ? 'bg-accent text-white' : 'border border-stone-200 bg-white/90 dark:border-stone-600 dark:bg-stone-900/60'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <ul className="mt-4 space-y-3">
                {filteredCandidates.filter((c) => c.status !== 'in_progress').length === 0 ? (
                  <li className="text-ink-muted text-sm">No rejected or withdrawn assignments with current filters.</li>
                ) : (
                  filteredCandidates.filter((c) => c.status !== 'in_progress').map(renderWithdrawnCandidateRow)
                )}
              </ul>
            </section>
          </section>

          {drawerCandidate && highlightCandidate ? (
            <>
              <button
                type="button"
                className="fixed inset-0 z-40 bg-black/40"
                aria-label="Close candidate panel"
                onClick={closeCandidateDrawer}
              />
              <aside
                className={`border-line fixed top-0 right-0 z-50 flex h-full w-full max-w-2xl flex-col border-l bg-white shadow-2xl transition-transform duration-300 ease-out dark:border-line-dark dark:bg-stone-900 sm:max-w-[34rem] ${
                  drawerPanelEntered ? 'translate-x-0' : 'translate-x-full'
                }`}
                aria-label="Candidate details"
              >
                <div className="flex items-center justify-end gap-3 border-b border-stone-200/90 px-3 py-2 dark:border-stone-700">
                  <button
                    type="button"
                    className="rounded-lg p-2 hover:bg-stone-100 dark:hover:bg-stone-800"
                    onClick={closeCandidateDrawer}
                    aria-label="Close"
                  >
                    <X className="h-5 w-5" aria-hidden />
                  </button>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto">
                  {(() => {
                    const c = drawerCandidate
                    const prof = nestedCandidate(c.candidates)
                    const candId = prof?.id
                    const displayName = prof?.full_name ?? 'Unnamed'
                    const resumePath = prof?.resume_storage_path ?? null
                    const photoPath = prof?.profile_photo_storage_path ?? null
                    const photoPublic =
                      photoPath && supabase
                        ? supabase.storage.from('candidate-docs').getPublicUrl(photoPath).data.publicUrl
                        : null
                    const email = prof?.email?.trim() || null
                    const phone = prof?.phone?.trim() || null
                    const linkedinRaw = prof?.linkedin?.trim() || null
                    const linkedinHref =
                      linkedinRaw != null && linkedinRaw !== ''
                        ? linkedinRaw.startsWith('http')
                          ? linkedinRaw
                          : `https://${linkedinRaw}`
                        : null
                    const salaryRaw = prof?.salary_expectation?.trim() ?? ''
                    const actRows = (activityQ.data ?? []).filter(
                      (a) => a.candidate_id === candId || a.position_candidate_id === c.id,
                    )
                    const tagRows = actRows.filter((a) => a.event_type === 'candidate_tag')
                    const commentRows = actRows
                      .filter((a) => a.event_type === 'note_added')
                      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                    const timelineRows = actRows
                      .filter((a) => a.event_type !== 'note_added' && a.event_type !== 'candidate_tag')
                      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                    const storageFiles = (candidateDrawerFilesQ.data ?? []).filter(
                      (f) => Boolean(f.name) && !f.name.startsWith('.'),
                    )
                    const fileCount = storageFiles.length
                    const salaryTitleSuffix = (() => {
                      const t = salaryRaw.trim()
                      if (!t) return null as string | null
                      const p = parseIlsAmountInput(t)
                      if (typeof p === 'number') return `(${p.toLocaleString('en-US')}₪)`
                      return null
                    })()
                    const posBudget = (position as { salary_budget?: number | null }).salary_budget
                    const budgetDisplay =
                      posBudget != null && Number.isFinite(Number(posBudget))
                        ? `${Number(posBudget).toLocaleString('en-US')}₪`
                        : '—'
                    return (
                      <>
                        <input
                          ref={candidatePhotoInputRef}
                          type="file"
                          accept="image/jpeg,image/png,image/webp,image/gif"
                          className="sr-only"
                          tabIndex={-1}
                          onChange={(e) => {
                            const f = e.target.files?.[0] ?? null
                            e.target.value = ''
                            if (f && candId) void uploadCandidatePhoto(candId, f)
                          }}
                        />
                        <input
                          ref={drawerBulkFilesRef}
                          type="file"
                          multiple
                          className="sr-only"
                          tabIndex={-1}
                          onChange={(e) => {
                            const fs = e.target.files
                            e.target.value = ''
                            if (!candId || !fs?.length) return
                            for (let i = 0; i < fs.length; i++) void uploadCandidateAttachment(candId, fs[i]!)
                          }}
                        />
                        <div className="border-b border-stone-200/90 px-5 pb-4 pt-2 dark:border-stone-700">
                          <div className="flex gap-4">
                            <div className="flex w-[4.5rem] shrink-0 flex-col items-stretch gap-2">
                              <div className="group/avatar relative mx-auto h-[4.5rem] w-[4.5rem] shrink-0">
                                <div className="flex h-[4.5rem] w-[4.5rem] items-center justify-center overflow-hidden rounded-full border border-stone-200 bg-stone-100 text-base font-bold text-stone-600 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-300">
                                  {photoPublic && !drawerAvatarBroken ? (
                                    <img
                                      src={photoPublic}
                                      alt=""
                                      className="h-full w-full object-cover"
                                      onError={() => setDrawerAvatarBroken(true)}
                                    />
                                  ) : (
                                    personInitials(displayName)
                                  )}
                                </div>
                                <button
                                  type="button"
                                  className="border-line absolute -bottom-0.5 -right-0.5 flex h-7 w-7 items-center justify-center rounded-full border bg-white text-stone-600 opacity-0 shadow-md transition hover:bg-stone-50 group-hover/avatar:opacity-100 dark:border-line-dark dark:bg-stone-800 dark:text-stone-200 dark:hover:bg-stone-700"
                                  aria-label="Change profile photo"
                                  title="Change photo"
                                  onClick={() => candidatePhotoInputRef.current?.click()}
                                >
                                  <Pencil className="h-3 w-3" aria-hidden />
                                </button>
                              </div>
                              <select
                                className="w-full cursor-pointer rounded-md border border-stone-200/70 bg-stone-50/90 py-1 pl-1.5 pr-6 text-[10px] font-medium text-stone-700 shadow-sm dark:border-stone-600 dark:bg-stone-900/70 dark:text-stone-200"
                                value={normalizeAssignmentSource(c.source)}
                                disabled={updateAssignmentSource.isPending}
                                onChange={(e) => {
                                  const v = e.target.value as AssignmentSourceValue
                                  if (v === normalizeAssignmentSource(c.source)) return
                                  void updateAssignmentSource.mutateAsync({
                                    positionCandidateId: c.id,
                                    source: v,
                                  })
                                }}
                                aria-label="Source for this assignment"
                              >
                                {ASSIGNMENT_SOURCE_VALUES.map((val) => (
                                  <option key={val} value={val}>
                                    {ASSIGNMENT_SOURCE_LABELS[val]}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex min-w-0 flex-wrap items-start gap-x-2 gap-y-1 sm:flex-nowrap sm:items-center">
                                <div className="group/name flex min-w-0 flex-1 flex-wrap items-center gap-x-1.5 gap-y-0.5">
                                  {drawerFieldEdit === 'name' && candId ? (
                                    <>
                                      <input
                                        value={drawerFieldDraft}
                                        onChange={(e) => setDrawerFieldDraft(e.target.value)}
                                        className="border-line text-stitch-on-surface min-w-0 max-w-[16rem] rounded-lg border bg-white px-2 py-1 text-xl font-bold tracking-tight dark:border-line-dark dark:bg-stone-900 dark:text-stone-100"
                                        autoFocus
                                      />
                                      <button
                                        type="button"
                                        className="rounded-lg bg-emerald-600 p-1.5 text-white hover:bg-emerald-700"
                                        aria-label="Save name"
                                        onClick={() => void saveCandidateFromDrawer(candId, { full_name: drawerFieldDraft })}
                                      >
                                        <Check className="h-4 w-4" aria-hidden />
                                      </button>
                                      <button
                                        type="button"
                                        className="border-line rounded-lg border bg-white p-1.5 dark:border-line-dark dark:bg-stone-800"
                                        aria-label="Cancel"
                                        onClick={() => setDrawerFieldEdit(null)}
                                      >
                                        <X className="h-4 w-4" aria-hidden />
                                      </button>
                                    </>
                                  ) : (
                                    <>
                                      <h2 className="text-stitch-on-surface flex min-w-0 flex-wrap items-baseline gap-x-1.5 text-xl font-bold tracking-tight dark:text-stone-100">
                                        <span className="min-w-0 truncate">{displayName}</span>
                                        {salaryTitleSuffix ? (
                                          <span className="shrink-0 font-bold tabular-nums text-stone-600 dark:text-stone-400">
                                            {salaryTitleSuffix}
                                          </span>
                                        ) : null}
                                      </h2>
                                      <button
                                        type="button"
                                        className="text-ink-muted shrink-0 rounded-lg p-1.5 opacity-0 transition hover:bg-stone-200/90 hover:text-ink group-hover/name:opacity-100 dark:hover:bg-stone-600 dark:hover:text-stone-100"
                                        aria-label="Edit name"
                                        onClick={() => {
                                          setDrawerFieldDraft(displayName)
                                          setDrawerFieldEdit('name')
                                        }}
                                      >
                                        <Pencil className="h-4 w-4" aria-hidden />
                                      </button>
                                    </>
                                  )}
                                </div>
                                <div className="relative shrink-0" ref={drawerAssignStatusRef}>
                                  <button
                                    type="button"
                                    onClick={() => setDrawerAssignStatusOpen((o) => !o)}
                                    disabled={patchAssignmentStatus.isPending}
                                    className={`border-line flex h-10 items-center gap-1 rounded-xl border px-2.5 text-sm font-bold shadow-sm transition dark:border-line-dark ${
                                      drawerCandidate!.status === 'in_progress'
                                        ? 'border-emerald-200/90 bg-gradient-to-br from-emerald-50 to-white text-emerald-900 dark:border-emerald-800/80 dark:from-emerald-950/60 dark:to-stone-900 dark:text-emerald-200'
                                        : drawerCandidate!.status === 'rejected'
                                          ? 'border-rose-200/90 bg-gradient-to-br from-rose-50 to-white text-rose-900 dark:border-rose-800/80 dark:from-rose-950/50 dark:to-stone-900 dark:text-rose-100'
                                          : 'border-stone-200/90 bg-gradient-to-br from-stone-100 to-white text-stone-800 dark:border-stone-600 dark:from-stone-800/80 dark:to-stone-900 dark:text-stone-200'
                                    }`}
                                    aria-expanded={drawerAssignStatusOpen}
                                    aria-haspopup="listbox"
                                    aria-label="Assignment status"
                                    title="Assignment status"
                                  >
                                    {drawerCandidate!.status === 'in_progress' ? (
                                      <Play className="h-4 w-4 shrink-0 fill-current text-emerald-600 dark:text-emerald-400" aria-hidden />
                                    ) : drawerCandidate!.status === 'rejected' ? (
                                      <Ban className="h-4 w-4 shrink-0 text-rose-600 dark:text-rose-300" aria-hidden />
                                    ) : (
                                      <Pause className="h-4 w-4 shrink-0 text-stone-600 dark:text-stone-400" aria-hidden />
                                    )}
                                    <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-60" aria-hidden />
                                  </button>
                                  {drawerAssignStatusOpen ? (
                                    <div
                                      role="listbox"
                                      className="border-line absolute top-full right-0 z-[60] mt-1 min-w-[12rem] rounded-xl border bg-white py-1 shadow-xl dark:border-line-dark dark:bg-stone-900"
                                    >
                                      {(
                                        [
                                          { v: 'in_progress' as const, label: 'In progress', icon: Play, cls: 'text-emerald-800 dark:text-emerald-300' },
                                          { v: 'rejected' as const, label: 'Rejected', icon: Ban, cls: 'text-rose-800 dark:text-rose-200' },
                                          { v: 'withdrawn' as const, label: 'Withdrawn', icon: Pause, cls: 'text-stone-700 dark:text-stone-300' },
                                        ] as const
                                      ).map(({ v, label, icon: Icon, cls }) => (
                                        <button
                                          key={v}
                                          type="button"
                                          role="option"
                                          className={`hover:bg-stone-50 dark:hover:bg-stone-800 flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-semibold ${cls}`}
                                          onClick={() => {
                                            setDrawerAssignStatusOpen(false)
                                            if (v === drawerCandidate!.status) return
                                            if (!window.confirm('Change this assignment’s status?')) return
                                            const closeTasks = v !== 'in_progress' ? window.confirm('Also mark open tasks for this assignment as done?') : false
                                            void patchAssignmentStatus.mutateAsync({
                                              positionCandidateId: drawerCandidate!.id,
                                              nextStatus: v,
                                              closeTasks,
                                            })
                                          }}
                                        >
                                          <Icon className="h-4 w-4 shrink-0 opacity-80" aria-hidden />
                                          {label}
                                        </button>
                                      ))}
                                    </div>
                                  ) : null}
                                </div>
                              </div>
                              {tagRows.length > 0 ? (
                                <div className="mt-2 flex flex-wrap gap-1.5">
                                  {tagRows.map((t) => (
                                    <span
                                      key={t.id}
                                      className="inline-flex items-center gap-1 rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-xs font-medium text-violet-900 dark:border-violet-800 dark:bg-violet-950/40 dark:text-violet-100"
                                    >
                                      {t.title}
                                      <button
                                        type="button"
                                        className="hover:text-rose-600 rounded p-0.5 dark:hover:text-rose-400"
                                        aria-label={`Remove tag ${t.title}`}
                                        onClick={() => {
                                          if (window.confirm('Remove this tag?')) void deleteActivityEvent.mutateAsync(t.id)
                                        }}
                                      >
                                        <Trash2 className="h-3 w-3" aria-hidden />
                                      </button>
                                    </span>
                                  ))}
                                </div>
                              ) : null}
                              <div className="mt-1.5 flex flex-col gap-1 text-sm">
                                <div className="group/email flex min-w-0 items-center gap-2">
                                  <Mail className="text-ink-muted h-4 w-4 shrink-0 opacity-80 dark:text-stone-500" aria-hidden />
                                  {drawerFieldEdit === 'email' && candId ? (
                                    <>
                                      <input
                                        value={drawerFieldDraft}
                                        onChange={(e) => setDrawerFieldDraft(e.target.value)}
                                        className="border-line text-stitch-on-surface min-w-0 flex-1 rounded-lg border bg-white px-2 py-1 dark:border-line-dark dark:bg-stone-900 dark:text-stone-100"
                                        type="email"
                                        autoFocus
                                      />
                                      <button
                                        type="button"
                                        className="rounded-lg bg-emerald-600 p-1.5 text-white hover:bg-emerald-700"
                                        aria-label="Save email"
                                        onClick={() => void saveCandidateFromDrawer(candId, { email: drawerFieldDraft.trim() || null })}
                                      >
                                        <Check className="h-4 w-4" aria-hidden />
                                      </button>
                                      <button
                                        type="button"
                                        className="border-line rounded-lg border bg-white p-1.5 dark:border-line-dark dark:bg-stone-800"
                                        aria-label="Cancel"
                                        onClick={() => setDrawerFieldEdit(null)}
                                      >
                                        <X className="h-4 w-4" aria-hidden />
                                      </button>
                                    </>
                                  ) : (
                                    <>
                                      {email ? (
                                        <a
                                          href={`mailto:${email}`}
                                          className="text-stitch-on-surface min-w-0 flex-1 truncate hover:text-[#006384] dark:text-stone-100 dark:hover:text-cyan-300"
                                        >
                                          {email}
                                        </a>
                                      ) : (
                                        <span className="text-ink-muted flex-1 dark:text-stone-500">—</span>
                                      )}
                                      <button
                                        type="button"
                                        className="text-ink-muted shrink-0 rounded-lg p-1.5 opacity-0 transition hover:bg-stone-200/90 hover:text-ink group-hover/email:opacity-100 dark:hover:bg-stone-600 dark:hover:text-stone-100"
                                        aria-label="Edit email"
                                        onClick={() => {
                                          setDrawerFieldDraft(email ?? '')
                                          setDrawerFieldEdit('email')
                                        }}
                                      >
                                        <Pencil className="h-4 w-4" aria-hidden />
                                      </button>
                                    </>
                                  )}
                                </div>
                                <div className="group/phone flex min-w-0 items-center gap-2">
                                  <Phone className="text-ink-muted h-4 w-4 shrink-0 opacity-80 dark:text-stone-500" aria-hidden />
                                  {drawerFieldEdit === 'phone' && candId ? (
                                    <>
                                      <input
                                        value={drawerFieldDraft}
                                        onChange={(e) => setDrawerFieldDraft(e.target.value)}
                                        className="border-line text-stitch-on-surface min-w-0 flex-1 rounded-lg border bg-white px-2 py-1 dark:border-line-dark dark:bg-stone-900 dark:text-stone-100"
                                        type="tel"
                                        autoFocus
                                      />
                                      <button
                                        type="button"
                                        className="rounded-lg bg-emerald-600 p-1.5 text-white hover:bg-emerald-700"
                                        aria-label="Save phone"
                                        onClick={() => void saveCandidateFromDrawer(candId, { phone: drawerFieldDraft.trim() || null })}
                                      >
                                        <Check className="h-4 w-4" aria-hidden />
                                      </button>
                                      <button
                                        type="button"
                                        className="border-line rounded-lg border bg-white p-1.5 dark:border-line-dark dark:bg-stone-800"
                                        aria-label="Cancel"
                                        onClick={() => setDrawerFieldEdit(null)}
                                      >
                                        <X className="h-4 w-4" aria-hidden />
                                      </button>
                                    </>
                                  ) : (
                                    <>
                                      {phone ? (
                                        <a
                                          href={`tel:${phone}`}
                                          className="text-stitch-on-surface min-w-0 flex-1 truncate hover:text-[#006384] dark:text-stone-100 dark:hover:text-cyan-300"
                                        >
                                          {phone}
                                        </a>
                                      ) : (
                                        <span className="text-ink-muted flex-1 dark:text-stone-500">—</span>
                                      )}
                                      <button
                                        type="button"
                                        className="text-ink-muted shrink-0 rounded-lg p-1.5 opacity-0 transition hover:bg-stone-200/90 hover:text-ink group-hover/phone:opacity-100 dark:hover:bg-stone-600 dark:hover:text-stone-100"
                                        aria-label="Edit phone"
                                        onClick={() => {
                                          setDrawerFieldDraft(phone ?? '')
                                          setDrawerFieldEdit('phone')
                                        }}
                                      >
                                        <Pencil className="h-4 w-4" aria-hidden />
                                      </button>
                                    </>
                                  )}
                                </div>
                                <div className="group/linkedin flex min-w-0 items-center gap-2">
                                  <Link2 className="text-ink-muted h-4 w-4 shrink-0 opacity-80 dark:text-stone-500" aria-hidden />
                                  {linkedinHref ? (
                                    <a
                                      href={linkedinHref}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="min-w-0 flex-1 truncate font-medium text-[#006384] hover:underline dark:text-cyan-300"
                                    >
                                      LinkedIn profile
                                    </a>
                                  ) : (
                                    <span className="text-ink-muted flex-1 dark:text-stone-500">—</span>
                                  )}
                                </div>
                              </div>
                              <div className="mt-2 space-y-2 border-t border-stone-100 pt-2 dark:border-stone-700">
                                <DetailHoverField
                                  label="LinkedIn profile"
                                  value={linkedinRaw ?? ''}
                                  disabled={!candId}
                                  onSave={async (next) => {
                                    if (!candId) return
                                    const { error } = await supabase!
                                      .from('candidates')
                                      .update({ linkedin: next.trim() || null })
                                      .eq('id', candId)
                                      .eq('user_id', user!.id)
                                    if (error) toastError(error.message)
                                    else {
                                      success('Saved')
                                      await invalidateAll()
                                    }
                                  }}
                                />
                                <DetailHoverField
                                  label="Expected salary (ILS)"
                                  value={salaryRaw}
                                  disabled={!candId}
                                  readOnlyFormat={(v) => {
                                    const t = v.trim()
                                    if (!t) return '—'
                                    const p = parseIlsAmountInput(t)
                                    return typeof p === 'number' ? `₪${p.toLocaleString('en-US')} (ILS)` : t
                                  }}
                                  onSave={async (next) => {
                                    if (!candId) return
                                    const t = next.trim()
                                    let toSave: string | null = t
                                    if (t) {
                                      const p = parseIlsAmountInput(t)
                                      if (p === 'invalid') {
                                        toastError('Enter a valid amount or leave empty.')
                                        return
                                      }
                                      if (p !== null) toSave = String(p)
                                    } else toSave = null
                                    const { error } = await supabase!
                                      .from('candidates')
                                      .update({ salary_expectation: toSave })
                                      .eq('id', candId)
                                      .eq('user_id', user!.id)
                                    if (error) toastError(error.message)
                                    else {
                                      success('Saved')
                                      await invalidateAll()
                                    }
                                  }}
                                />
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-1 border-b border-stone-100 px-3 py-2 dark:border-stone-700">
                          {(
                            [
                              { id: 'overview' as const, label: 'Overview' },
                              { id: 'files' as const, label: `Files (${fileCount})` },
                              { id: 'comments' as const, label: `Comments (${commentRows.length})` },
                            ] as const
                          ).map(({ id: tid, label }) => (
                            <button
                              key={tid}
                              type="button"
                              onClick={() => setCandidateDrawerPanel(tid)}
                              className={`rounded-xl px-3 py-2 text-sm font-semibold transition ${
                                candidateDrawerPanel === tid
                                  ? 'bg-stone-900 text-white shadow-sm dark:bg-stone-100 dark:text-stone-900'
                                  : 'text-stone-600 hover:bg-stone-100 dark:text-stone-400 dark:hover:bg-stone-800'
                              }`}
                            >
                              {label}
                            </button>
                          ))}
                        </div>

                        {candidateDrawerPanel === 'overview' ? (
                          <div className="px-5 py-4">
                            <div className="border-line mb-4 rounded-xl border bg-stone-50/80 p-3 text-sm dark:border-line-dark dark:bg-stone-800/50">
                              <p className="text-stitch-on-surface font-semibold leading-snug dark:text-stone-100">
                                {position.title}
                              </p>
                              <p className="text-ink-muted mt-0.5 text-xs font-medium dark:text-stone-400">
                                {company?.name ?? '—'}
                              </p>
                              <dl className="mt-2 grid gap-1.5 text-xs text-stone-700 dark:text-stone-300">
                                <div className="flex flex-wrap gap-x-2 gap-y-0.5">
                                  <dt className="text-ink-muted font-medium dark:text-stone-500">Opened</dt>
                                  <dd className="tabular-nums">{openedLabel}</dd>
                                </div>
                                <div className="flex flex-wrap gap-x-2 gap-y-0.5">
                                  <dt className="text-ink-muted font-medium dark:text-stone-500">Created on</dt>
                                  <dd className="tabular-nums">
                                    {c.created_at
                                      ? format(new Date(c.created_at as string), 'MMM d, yyyy')
                                      : '—'}
                                  </dd>
                                </div>
                                <div className="flex flex-wrap gap-x-2 gap-y-0.5">
                                  <dt className="text-ink-muted font-medium dark:text-stone-500">Role budget</dt>
                                  <dd className="font-semibold tabular-nums">{budgetDisplay}</dd>
                                </div>
                              </dl>
                            </div>
                            {timelineRows.length === 0 ? (
                              <p className="text-ink-muted text-sm">No pipeline events for this candidate yet.</p>
                            ) : (
                              <ul className="mt-1 space-y-0">
                                {timelineRows.map((a) => {
                                  const deco = timelineKindStyles(a.event_type)
                                  const primary =
                                    a.event_type === 'candidate_status_changed'
                                      ? formatActivityArrowPath(a.subtitle)
                                      : a.event_type === 'candidate_stage_changed'
                                        ? formatActivityArrowPath(a.subtitle)
                                        : a.title
                                  const statusTail =
                                    a.event_type === 'candidate_status_changed'
                                      ? assignmentStatusPill(tailStatusFromSubtitle(a.subtitle))
                                      : null
                                  const pillLabel =
                                    a.event_type === 'candidate_status_changed' && statusTail
                                      ? statusTail.label
                                      : deco.pillLabel
                                  const pillClass =
                                    a.event_type === 'candidate_status_changed' && statusTail
                                      ? statusTail.className
                                      : deco.pill
                                  return (
                                    <li key={a.id} className="relative flex gap-3 pb-6 last:pb-0">
                                      <div className="flex flex-col items-center">
                                        <span className={`z-[1] h-3.5 w-3.5 rounded-full ${deco.dot}`} />
                                        <span className={`mt-0.5 w-0.5 flex-1 min-h-[1.25rem] rounded-full ${deco.rail}`} />
                                      </div>
                                      <div className="min-w-0 flex-1 pt-0.5">
                                        <p className="text-stitch-on-surface text-sm font-semibold leading-snug dark:text-stone-100">
                                          {primary}
                                        </p>
                                        <div className="mt-1.5 flex flex-wrap items-center gap-2">
                                          <span
                                            className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${pillClass}`}
                                          >
                                            {pillLabel}
                                          </span>
                                          <time
                                            className="text-ink-muted text-xs tabular-nums"
                                            dateTime={a.created_at}
                                          >
                                            {format(new Date(a.created_at), 'MMM d, yyyy · h:mm a')}
                                          </time>
                                        </div>
                                      </div>
                                    </li>
                                  )
                                })}
                              </ul>
                            )}
                          </div>
                        ) : null}

                        {candidateDrawerPanel === 'files' ? (
                          <div className="space-y-4 px-5 py-4">
                            {candId ? (
                              <button
                                type="button"
                                onClick={() => void createShareToken.mutateAsync(candId)}
                                className="border-line w-full rounded-xl border bg-white px-4 py-3 text-left text-sm font-semibold shadow-sm transition hover:bg-stone-50 dark:border-line-dark dark:bg-stone-800 dark:hover:bg-stone-700"
                              >
                                Candidate share link
                                <span className="text-ink-muted mt-0.5 block text-xs font-normal">Creates a link and copies it to your clipboard.</span>
                              </button>
                            ) : null}
                            <div
                              className={`rounded-2xl border-2 border-dashed px-4 py-8 text-center transition dark:border-stone-600 ${
                                drawerFilesDragging
                                  ? 'border-[#9b3e20] bg-orange-50/50 dark:border-orange-400/60 dark:bg-orange-950/25'
                                  : 'border-stone-200 bg-stone-50/40 dark:bg-stone-900/40'
                              }`}
                              onDragOver={(e) => {
                                e.preventDefault()
                                setDrawerFilesDragging(true)
                              }}
                              onDragLeave={() => setDrawerFilesDragging(false)}
                              onDrop={(e) => {
                                e.preventDefault()
                                setDrawerFilesDragging(false)
                                if (!candId) return
                                const fs = e.dataTransfer.files
                                for (let i = 0; i < fs.length; i++) void uploadCandidateAttachment(candId, fs[i]!)
                              }}
                            >
                              <Upload className="text-ink-muted mx-auto h-8 w-8 opacity-60" aria-hidden />
                              <p className="text-stitch-on-surface mt-2 text-sm font-semibold dark:text-stone-100">Drag files here to upload</p>
                              <button
                                type="button"
                                className="text-[#006384] hover:text-[#004d63] mt-3 text-sm font-semibold dark:text-cyan-300 dark:hover:text-cyan-200"
                                onClick={() => drawerBulkFilesRef.current?.click()}
                              >
                                Or browse…
                              </button>
                            </div>
                            <div>
                              <p className="text-ink-muted text-xs font-bold uppercase tracking-wide">Files on record</p>
                              {candidateDrawerFilesQ.isLoading ? (
                                <p className="text-ink-muted mt-2 text-sm">Loading…</p>
                              ) : storageFiles.length === 0 ? (
                                <p className="text-ink-muted mt-2 text-sm">No files in storage for this candidate yet.</p>
                              ) : (
                                <ul className="mt-2 space-y-2">
                                  {storageFiles.map((f) => {
                                    const fullPath = `${user!.id}/${candId}/${f.name}`
                                    return (
                                      <li
                                        key={f.name}
                                        className="border-line flex items-center justify-between gap-2 rounded-xl border bg-white px-3 py-2 text-sm dark:border-line-dark dark:bg-stone-900/80"
                                      >
                                        <span className="min-w-0 flex-1 truncate font-medium text-stone-800 dark:text-stone-100">
                                          {f.name}
                                        </span>
                                        <button
                                          type="button"
                                          className="text-[#006384] hover:text-[#004d63] shrink-0 text-xs font-semibold dark:text-cyan-300"
                                          onClick={() => void previewResume(fullPath)}
                                        >
                                          Open
                                        </button>
                                      </li>
                                    )
                                  })}
                                </ul>
                              )}
                            </div>
                            {resumePath ? (
                              <p className="text-ink-muted text-xs dark:text-stone-500">
                                Linked résumé path is set on the candidate. Matching files in the list above open the same document.
                              </p>
                            ) : null}
                          </div>
                        ) : null}

                        {candidateDrawerPanel === 'comments' ? (
                          <div className="bg-stone-50/60 px-5 py-4 dark:bg-stone-900/50">
                            <div className="flex gap-2">
                              <input
                                value={drawerCommentText}
                                onChange={(e) => setDrawerCommentText(e.target.value)}
                                placeholder="Write a comment…"
                                className="border-line min-w-0 flex-1 rounded-xl border bg-white px-3 py-2 text-sm dark:border-line-dark dark:bg-stone-900"
                              />
                              <button
                                type="button"
                                disabled={!drawerCommentText.trim() || addDrawerComment.isPending || !candId}
                                onClick={() => {
                                  if (!candId) return
                                  void addDrawerComment.mutateAsync({
                                    text: drawerCommentText,
                                    candidateId: candId,
                                    positionCandidateId: c.id,
                                  })
                                }}
                                className="bg-accent text-white shrink-0 rounded-xl px-4 py-2 text-sm font-semibold disabled:opacity-40 dark:bg-orange-600"
                              >
                                Add
                              </button>
                            </div>
                            <ul className="mt-3 space-y-2">
                              {commentRows.map((cm) => (
                                <li
                                  key={cm.id}
                                  className="flex items-start justify-between gap-2 rounded-xl border border-stone-200/90 bg-white px-3 py-2 text-sm dark:border-stone-600 dark:bg-stone-900/80"
                                >
                                  <div className="min-w-0 flex-1">
                                    <p className="text-stone-800 dark:text-stone-100">{cm.subtitle}</p>
                                    <p className="text-ink-muted mt-1 text-xs tabular-nums">
                                      {format(new Date(cm.created_at), 'MMM d, yyyy · h:mm a')}
                                    </p>
                                  </div>
                                  <button
                                    type="button"
                                    className="text-ink-muted hover:text-rose-600 shrink-0 rounded p-1 dark:hover:text-rose-400"
                                    aria-label="Delete comment"
                                    onClick={() => {
                                      if (window.confirm('Delete this comment?')) void deleteActivityEvent.mutateAsync(cm.id)
                                    }}
                                  >
                                    <Trash2 className="h-4 w-4" aria-hidden />
                                  </button>
                                </li>
                              ))}
                            </ul>
                          </div>
                        ) : null}
                      </>
                    )
                  })()}
                </div>
              </aside>
            </>
          ) : null}
        </div>
      ) : null}

      {tab === 'openings' ? (
        <section className="border-line rounded-2xl border border-stone-200/80 bg-white/70 p-5 dark:border-line-dark dark:bg-stone-900/45">
          <h2 className="text-stitch-on-surface text-lg font-bold dark:text-stone-100">Openings</h2>
          <p className="text-ink-muted mt-1 text-sm dark:text-stone-400">LinkedIn search and welcome messages for outreach.</p>
          <form
            className="mt-4 flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault()
              void savePos.mutateAsync()
            }}
          >
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium">LinkedIn saved search</span>
                <button
                  type="button"
                  onClick={() => openSavedLinkedin()}
                  disabled={!linkedinSearchUrl.trim()}
                  className="border-line flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border bg-white/90 text-[#006384] shadow-sm hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-line-dark dark:bg-stone-800 dark:text-cyan-300 dark:hover:bg-stone-700"
                  title="Open saved LinkedIn URL in a new tab"
                  aria-label="Open LinkedIn saved search in new tab"
                >
                  <ExternalLink className="h-4 w-4" aria-hidden />
                </button>
              </div>
              <input
                value={linkedinSearchUrl}
                onChange={(e) => setLinkedinSearchUrl(e.target.value)}
                placeholder="https://www.linkedin.com/search/results/people/?..."
                className="border-line mt-1 w-full rounded-xl border px-3 py-2 text-sm dark:border-line-dark dark:bg-stone-900/50"
              />
              <p className="text-ink-muted text-xs">Save, then open with the link icon.</p>
            </div>
            <div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium">Welcome approach (1)</span>
                <button
                  type="button"
                  onClick={() => copyWelcomeSnippet(welcome1, 'Welcome 1')}
                  className="border-line flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border bg-white/90 shadow-sm hover:bg-stone-50 dark:border-line-dark dark:bg-stone-800 dark:hover:bg-stone-700"
                  aria-label="Copy welcome approach 1"
                >
                  <Copy className="h-4 w-4" aria-hidden />
                </button>
              </div>
              <textarea value={welcome1} onChange={(e) => setWelcome1(e.target.value)} rows={4} className="border-line mt-1 w-full rounded-xl border px-3 py-2 dark:border-line-dark dark:bg-stone-900/50" />
            </div>
            <div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium">Welcome approach (2)</span>
                <button
                  type="button"
                  onClick={() => copyWelcomeSnippet(welcome2, 'Welcome 2')}
                  className="border-line flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border bg-white/90 shadow-sm hover:bg-stone-50 dark:border-line-dark dark:bg-stone-800 dark:hover:bg-stone-700"
                  aria-label="Copy welcome approach 2"
                >
                  <Copy className="h-4 w-4" aria-hidden />
                </button>
              </div>
              <textarea value={welcome2} onChange={(e) => setWelcome2(e.target.value)} rows={4} className="border-line mt-1 w-full rounded-xl border px-3 py-2 dark:border-line-dark dark:bg-stone-900/50" />
            </div>
            <div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium">Welcome approach (3)</span>
                <button
                  type="button"
                  onClick={() => copyWelcomeSnippet(welcome3, 'Welcome 3')}
                  className="border-line flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border bg-white/90 shadow-sm hover:bg-stone-50 dark:border-line-dark dark:bg-stone-800 dark:hover:bg-stone-700"
                  aria-label="Copy welcome approach 3"
                >
                  <Copy className="h-4 w-4" aria-hidden />
                </button>
              </div>
              <textarea value={welcome3} onChange={(e) => setWelcome3(e.target.value)} rows={4} className="border-line mt-1 w-full rounded-xl border px-3 py-2 dark:border-line-dark dark:bg-stone-900/50" />
            </div>
            <button type="submit" className="bg-accent text-stone-50 w-fit rounded-full px-5 py-2 text-sm font-semibold" disabled={savePos.isPending}>
              Save openings
            </button>
          </form>
        </section>
      ) : null}

      {tab === 'tasks' ? (
        <section className="space-y-4">
          <p className="text-ink-muted text-xs dark:text-stone-400">
            Same layout as the main tasks list. Add or reorder tasks from{' '}
            <Link to="/tasks" className="text-accent font-semibold underline dark:text-orange-300">
              All tasks
            </Link>
            .
          </p>

          <div className="border-stitch-on-surface/10 overflow-x-auto rounded-2xl border border-stone-200/80 bg-white/80 dark:border-stone-600 dark:bg-stone-900/50">
            {tasksQ.isPending && !tasksQ.data ? (
              <PageSpinner message="Loading tasks…" className="p-6" />
            ) : (tasksQ.data ?? []).length === 0 ? (
              <p className="text-ink-muted p-6 text-sm">No tasks for this role yet.</p>
            ) : (
              <ul className="space-y-3 p-4 md:p-6" aria-label="Tasks for this position">
                {positionTasksListOrdered.map((row) => {
                  const pcJoin = row.position_candidates as {
                    candidates: { id: string; full_name: string } | { id: string; full_name: string }[] | null
                  } | null
                  const cand = nestedTaskCandidate(pcJoin?.candidates ?? null)
                  const hasCandidate = Boolean(cand)
                  const posTitle = position.title ?? 'This role'
                  const companyName = company?.name ?? 'Client'
                  const companyId = company?.id
                  const taskCardClass =
                    'border-stitch-on-surface/10 cursor-pointer rounded-2xl border-b-4 border-b-[#006384]/60 bg-white p-4 shadow-[0_16px_36px_rgba(48,46,43,0.08)] transition hover:border-stone-300/80 dark:border-stone-700 dark:bg-stone-900 dark:hover:border-stone-600'
                  const canComplete = row.status === 'open'
                  const canArchive = row.status !== 'archived'
                  return (
                    <li
                      key={row.id}
                      className={taskCardClass}
                      onClick={(e) => {
                        const t = e.target as HTMLElement
                        if (t.closest('a, button')) return
                        setSelectedPositionTask(row)
                      }}
                    >
                      <div className="flex items-start gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="text-stitch-on-surface font-bold dark:text-stone-100">
                            <span className="text-left underline-offset-2 hover:underline">{row.title}</span>
                            {row.description?.trim() ? (
                              <>
                                <span className="text-stitch-muted font-normal dark:text-stone-400"> — </span>
                                <span className="text-stitch-muted text-sm font-semibold dark:text-stone-400">{row.description.trim()}</span>
                              </>
                            ) : null}
                            <span className="mt-1 block text-sm font-normal text-stone-600 dark:text-stone-400">
                              <span className="inline-flex flex-wrap items-center gap-x-1 gap-y-1">
                                <span>for</span>
                                <span className="inline-flex items-center gap-1.5">
                                  {companyId ? (
                                    <CompanyClientAvatar
                                      companyId={companyId}
                                      companyName={companyName}
                                      avatarUrl={company?.avatar_url}
                                      readOnly
                                      size="sm"
                                    />
                                  ) : null}
                                  <Link
                                    to={`/positions/${id}`}
                                    className="font-semibold text-[#9b3e20] underline-offset-2 hover:underline dark:text-orange-400"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    {posTitle}
                                  </Link>
                                </span>
                              </span>
                              {hasCandidate ? (
                                <span className="inline-flex flex-wrap items-center gap-x-1">
                                  <span className="mx-0.5">·</span>
                                  <span>about</span>{' '}
                                  <Link
                                    to={`/positions/${id}?tab=candidates&candidate=${cand!.id}`}
                                    className="font-semibold text-[#006384] underline-offset-2 hover:underline dark:text-cyan-300"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    {cand!.full_name}
                                  </Link>
                                </span>
                              ) : null}
                            </span>
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
                              disabled={updatePositionTaskStatus.isPending}
                              onClick={(e) => {
                                e.stopPropagation()
                                updatePositionTaskStatus.mutate({ taskId: row.id, status: 'closed' })
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
                              disabled={updatePositionTaskStatus.isPending}
                              onClick={(e) => {
                                e.stopPropagation()
                                updatePositionTaskStatus.mutate({ taskId: row.id, status: 'archived' })
                              }}
                            >
                              <Trash2 className="h-4 w-4" aria-hidden />
                            </button>
                          ) : null}
                        </div>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </section>
      ) : null}

      {tab === 'activity' ? (
        <section className="space-y-5">
          <div className="rounded-2xl border border-stone-200/80 bg-white/70 p-4 dark:border-line-dark dark:bg-stone-900/45">
            <h2 className="text-stitch-on-surface text-sm font-bold dark:text-stone-100">What you are seeing</h2>
            <p className="text-ink-muted mt-2 text-sm dark:text-stone-400">
              This is a chronological log of changes on this role — who moved in the pipeline, status updates, files, and
              notes. Each card explains the type of event in plain language, then shows the technical detail we stored.
            </p>
            <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Activity filter">
              <button
                type="button"
                onClick={() => setActivityFilter('all')}
                className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${
                  activityFilter === 'all'
                    ? 'bg-accent text-white'
                    : 'border border-stone-200 bg-white/90 dark:border-stone-600 dark:bg-stone-900/60'
                }`}
              >
                All activity
              </button>
              <button
                type="button"
                onClick={() => setActivityFilter('milestones')}
                className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${
                  activityFilter === 'milestones'
                    ? 'bg-accent text-white'
                    : 'border border-stone-200 bg-white/90 dark:border-stone-600 dark:bg-stone-900/60'
                }`}
              >
                Highlights only
              </button>
            </div>
          </div>

          <div className="border-line rounded-2xl border border-stone-200/80 bg-white/70 p-4 dark:border-line-dark dark:bg-stone-900/45">
            <h3 className="text-sm font-bold text-stone-900 dark:text-stone-100">Add a note</h3>
            <p className="text-ink-muted mt-1 text-xs dark:text-stone-500">
              {highlightCandidate && candidateNameById.get(highlightCandidate)
                ? `This note will be linked to ${candidateNameById.get(highlightCandidate)} (candidate panel is open).`
                : 'Saved as a role note. Open a candidate from the Candidates tab to attach notes to a person.'}
            </p>
            <textarea
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              rows={3}
              placeholder="What happened? What should the team know?"
              className="border-line mt-2 w-full rounded-xl border px-3 py-2 text-sm dark:border-line-dark dark:bg-stone-900/50"
            />
            <button
              type="button"
              className="bg-accent text-stone-50 mt-2 rounded-full px-4 py-2 text-sm font-semibold disabled:opacity-50"
              disabled={addNote.isPending}
              onClick={() => void addNote.mutateAsync()}
            >
              Save note
            </button>
          </div>

          <div className="space-y-6">
            {activityByDay.length === 0 ? (
              <p className="text-ink-muted text-sm">No activity yet.</p>
            ) : (
              activityByDay.map((group) => (
                <div key={group.dayKey}>
                  <h3 className="text-ink border-b border-stone-200/90 pb-2 text-xs font-extrabold tracking-wide uppercase dark:border-stone-600 dark:text-stone-200">
                    {group.dayLabel}
                  </h3>
                  <ul className="mt-3 space-y-3">
                    {group.rows.map((a) => {
                      const kind = activityKindCopy(a.event_type)
                      const whoLabel =
                        a.candidate_id != null ? (candidateNameById.get(a.candidate_id) ?? 'Candidate') : null
                      return (
                        <li
                          key={a.id}
                          className="border-line flex gap-3 rounded-2xl border border-stone-200/80 bg-white/80 p-3 dark:border-stone-600 dark:bg-stone-900/50"
                        >
                          <ActivityIcon type={a.event_type} />
                          <div className="min-w-0 flex-1">
                            <p className="text-accent text-[11px] font-extrabold uppercase tracking-wide dark:text-orange-300">
                              {kind.label}
                            </p>
                            <p className="text-ink-muted text-xs dark:text-stone-500">{kind.explainer}</p>
                            <p className="text-stitch-on-surface mt-1 text-sm font-semibold dark:text-stone-100">{a.title}</p>
                            {a.subtitle ? (
                              <p className="text-ink-muted mt-0.5 whitespace-pre-wrap text-sm dark:text-stone-400">{a.subtitle}</p>
                            ) : null}
                            <div className="text-ink-muted mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                              {a.candidate_id ? (
                                <Link
                                  to={`/candidates/${a.candidate_id}`}
                                  className="font-medium text-[#006384] hover:underline dark:text-cyan-300"
                                >
                                  About: {whoLabel}
                                </Link>
                              ) : (
                                <span>Role-wide event</span>
                              )}
                              <time className="tabular-nums" dateTime={a.created_at}>
                                {format(new Date(a.created_at), 'p')}
                              </time>
                            </div>
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              ))
            )}
          </div>
        </section>
      ) : null}

      <Modal open={positionSetupOpen} onClose={() => setPositionSetupOpen(false)} title="Role setup" size="lg">
        <div className="max-h-[min(70vh,32rem)] space-y-8 overflow-y-auto pr-1">
          <div>
            <h3 className="font-semibold">Recruitment stages</h3>
            <ul className="mt-3 space-y-3">
              {(stagesQ.data ?? []).map((s, idx) => (
                <li key={s.id} className="border-line bg-white/60 space-y-3 rounded-xl border px-3 py-3 dark:border-line-dark dark:bg-stone-900/40">
                  <div className="flex items-start justify-between gap-3 border-b border-stone-200/80 pb-3 dark:border-stone-600">
                    <div className="min-w-0 flex-1">
                      <input
                        defaultValue={s.name}
                        onBlur={(e) => {
                          const v = e.target.value.trim()
                          if (!v || v === s.name) return
                          void updateStageMeta.mutateAsync({ id: s.id, name: v })
                        }}
                        placeholder="Stage name"
                        aria-label="Stage name"
                        className="placeholder:text-stitch-muted w-full border-0 bg-transparent text-xl font-extrabold tracking-tight text-stone-900 outline-none ring-0 placeholder:font-semibold focus:ring-0 dark:text-stone-100 dark:placeholder:text-stone-500 md:text-2xl"
                      />
                      <p className="text-ink-muted mt-1 text-[11px] font-semibold uppercase tracking-wide dark:text-stone-500">
                        Sort order {s.sort_order}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <button
                        type="button"
                        className="border-line text-ink-muted hover:bg-stone-50 dark:hover:bg-stone-800 flex h-9 w-9 items-center justify-center rounded-xl border bg-white/90 shadow-sm transition disabled:cursor-not-allowed disabled:opacity-35 dark:border-line-dark dark:bg-stone-900/80"
                        onClick={() => void moveStage(s.id, -1)}
                        disabled={idx === 0}
                        aria-label="Move stage up"
                      >
                        <ChevronUp className="h-4 w-4" aria-hidden />
                      </button>
                      <button
                        type="button"
                        className="border-line text-ink-muted hover:bg-stone-50 dark:hover:bg-stone-800 flex h-9 w-9 items-center justify-center rounded-xl border bg-white/90 shadow-sm transition disabled:cursor-not-allowed disabled:opacity-35 dark:border-line-dark dark:bg-stone-900/80"
                        onClick={() => void moveStage(s.id, 1)}
                        disabled={idx === (stagesQ.data ?? []).length - 1}
                        aria-label="Move stage down"
                      >
                        <ChevronDown className="h-4 w-4" aria-hidden />
                      </button>
                      <button
                        type="button"
                        className="border-line text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30 flex h-9 w-9 items-center justify-center rounded-xl border border-red-200 bg-white/90 shadow-sm transition disabled:cursor-not-allowed disabled:opacity-35 dark:border-red-900/50 dark:bg-stone-900/80 dark:text-red-300"
                        onClick={() => {
                          if (window.confirm(`Delete stage “${s.name}”?`)) void deleteStageMut.mutateAsync(s.id)
                        }}
                        disabled={deleteStageMut.isPending}
                        aria-label="Delete stage"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden />
                      </button>
                    </div>
                  </div>
                  <div className="flex flex-col gap-4 md:flex-row md:items-start md:gap-6">
                    <label className="block max-w-xl flex-1 text-xs font-medium text-stone-600 dark:text-stone-400">
                      Description
                      <textarea
                        rows={2}
                        defaultValue={s.description ?? ''}
                        onBlur={(e) => void updateStageMeta.mutateAsync({ id: s.id, description: e.target.value.trim() || null })}
                        className="border-line mt-0.5 max-w-xl w-full rounded-lg border px-2 py-1.5 text-sm dark:border-line-dark dark:bg-stone-900/50"
                      />
                    </label>
                    <div className="flex min-w-0 shrink-0 flex-col gap-2 md:w-56">
                      <label className="block text-xs font-medium text-stone-600 dark:text-stone-400">
                        Interviewers
                        <div className="mt-0.5 flex items-center gap-2">
                          <span
                            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-stone-200 bg-stone-100 text-[10px] font-bold tracking-tight text-stone-600 tabular-nums dark:border-stone-600 dark:bg-stone-800 dark:text-stone-300"
                            title={s.interviewers?.trim() ? s.interviewers : 'No interviewer name'}
                            aria-hidden
                          >
                            {personInitials(s.interviewers ?? '')}
                          </span>
                          <input
                            defaultValue={s.interviewers ?? ''}
                            onBlur={(e) => void updateStageMeta.mutateAsync({ id: s.id, interviewers: e.target.value.trim() || null })}
                            className="border-line min-w-0 flex-1 rounded-lg border px-2 py-1.5 text-sm dark:border-line-dark dark:bg-stone-900/50"
                            placeholder="Name(s)"
                          />
                        </div>
                      </label>
                      <div className="flex flex-wrap items-end gap-3">
                        <label className="text-xs font-medium text-stone-600 dark:text-stone-400">
                          Duration (min)
                          <input
                            type="number"
                            min={0}
                            defaultValue={s.duration_minutes ?? ''}
                            onBlur={(e) => {
                              const raw = e.target.value.trim()
                              if (raw === '') {
                                void updateStageMeta.mutateAsync({ id: s.id, duration_minutes: null })
                                return
                              }
                              const n = parseInt(raw, 10)
                              if (!Number.isFinite(n)) return
                              void updateStageMeta.mutateAsync({ id: s.id, duration_minutes: n })
                            }}
                            className="border-line mt-0.5 block w-full max-w-[7rem] rounded-lg border px-2 py-1.5 text-sm dark:border-line-dark dark:bg-stone-900/50"
                          />
                        </label>
                        <label className="flex cursor-pointer items-center gap-2 pb-2 text-xs font-medium text-stone-600 dark:text-stone-400">
                          <input
                            type="checkbox"
                            defaultChecked={Boolean(s.is_remote)}
                            onChange={(e) => void updateStageMeta.mutateAsync({ id: s.id, is_remote: e.target.checked })}
                            className="rounded border-stone-300 dark:border-stone-600"
                          />
                          Remote
                        </label>
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
            <form
              className="mt-3 flex flex-wrap gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                void addStage.mutateAsync()
              }}
            >
              <input
                value={newStageName}
                onChange={(e) => setNewStageName(e.target.value)}
                placeholder="New stage name"
                className="border-line min-w-[12rem] flex-1 rounded-xl border px-3 py-2 dark:border-line-dark dark:bg-stone-900/50"
              />
              <button type="submit" className="bg-ink/90 text-paper rounded-full px-4 py-2 text-sm font-medium dark:bg-stone-200 dark:text-stone-900">
                Add stage
              </button>
            </form>
          </div>
          <div>
            <h3 className="font-semibold">Import candidates (Excel)</h3>
            <p className="text-ink-muted mt-1 text-sm">Upload a spreadsheet with one row per candidate. We detect columns by header names (name, email, phone).</p>
            <input
              ref={excelImportRef}
              type="file"
              accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
              className="sr-only"
              onChange={(e) => {
                void onExcel(e.target.files?.[0] ?? null)
                e.target.value = ''
              }}
            />
            <button
              type="button"
              onClick={() => excelImportRef.current?.click()}
              className="border-line mt-3 inline-flex w-full max-w-md items-center justify-center gap-2 rounded-xl border bg-white/80 px-4 py-3 text-sm font-semibold shadow-sm dark:border-line-dark dark:bg-stone-900/60 sm:w-auto"
            >
              <Upload className="h-4 w-4 shrink-0" aria-hidden />
              Choose Excel file
            </button>
            <p className="text-ink-muted mt-2 text-xs">Supported: .xlsx, .xls. No file is uploaded until you confirm the import.</p>
            {importError ? <p className="mt-2 text-sm text-amber-700 dark:text-amber-400">{importError}</p> : null}
          </div>
        </div>
      </Modal>

      {selectedPositionTask ? (
        <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-labelledby="position-task-drawer-title">
          <button
            type="button"
            className="absolute inset-0 bg-black/40 backdrop-blur-[1px]"
            aria-label="Close task panel"
            onClick={() => setSelectedPositionTask(null)}
          />
          <aside className="border-line relative flex h-full w-full max-w-md flex-col border-l bg-white shadow-2xl dark:border-line-dark dark:bg-stone-900">
            <div className="border-line flex items-start justify-between gap-2 border-b px-4 py-4 dark:border-line-dark">
              <h2 id="position-task-drawer-title" className="text-lg font-extrabold text-[#302e2b] dark:text-stone-100">
                {selectedPositionTask.title}
              </h2>
              <button
                type="button"
                className="rounded-xl p-2 text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800"
                onClick={() => setSelectedPositionTask(null)}
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-4 text-sm">
              <p className="text-ink-muted text-xs font-bold uppercase">Status</p>
              <p className="mt-1 font-semibold capitalize">{selectedPositionTask.status.replace('_', ' ')}</p>

              <p className="text-ink-muted mt-4 text-xs font-bold uppercase">Due</p>
              <p className="mt-1">{selectedPositionTask.due_at ? formatDue(selectedPositionTask.due_at) : 'Not set'}</p>

              {(() => {
                const cand = taskLinkedCandidate(selectedPositionTask)
                return cand ? (
                  <>
                    <p className="text-ink-muted mt-4 text-xs font-bold uppercase">Candidate</p>
                    <p className="mt-1">
                      <Link
                        to={`/positions/${id}?tab=candidates&candidate=${cand.id}`}
                        className="font-semibold text-[#006384] hover:underline dark:text-cyan-300"
                        onClick={() => setSelectedPositionTask(null)}
                      >
                        {cand.full_name}
                      </Link>
                    </p>
                  </>
                ) : null
              })()}

              {selectedPositionTask.description ? (
                <>
                  <p className="text-ink-muted mt-4 text-xs font-bold uppercase">Description</p>
                  <p className="mt-1 whitespace-pre-wrap text-[#302e2b] dark:text-stone-200">{selectedPositionTask.description}</p>
                </>
              ) : null}

              {selectedPositionTask.note_in_progress ? (
                <>
                  <p className="text-ink-muted mt-4 text-xs font-bold uppercase">In progress notes</p>
                  <p className="mt-1 whitespace-pre-wrap text-[#302e2b] dark:text-stone-200">{selectedPositionTask.note_in_progress}</p>
                </>
              ) : null}

              <p className="text-ink-muted mt-4 text-xs font-bold uppercase">Updated</p>
              <p className="mt-1 tabular-nums">{new Date(selectedPositionTask.updated_at).toLocaleString()}</p>
            </div>
          </aside>
        </div>
      ) : null}

      <Modal open={shareOpen} onClose={() => setShareOpen(false)} title="Share link" size="sm">
        <p className="text-ink-muted text-sm">Anyone with this link can view a summary (expires in 7 days).</p>
        <p className="mt-2 break-all rounded-lg bg-stone-100 p-2 text-xs dark:bg-stone-800">{shareUrl}</p>
      </Modal>
    </div>
  )
}

function ActivityIcon({ type }: { type: string }) {
  const cls = 'mt-0.5 h-8 w-8 shrink-0 rounded-lg bg-stone-100 p-1.5 dark:bg-stone-800'
  if (
    type === 'candidate_outcome_changed' ||
    type === 'candidate_status_changed' ||
    type === 'position_status_changed'
  )
    return <PartyPopper className={cls} aria-hidden />
  if (type === 'candidate_reached_critical_stage') return <CheckCircle className={cls} aria-hidden />
  if (type === 'candidate_file_uploaded') return <FileText className={cls} aria-hidden />
  return <ChevronRight className={cls} aria-hidden />
}
