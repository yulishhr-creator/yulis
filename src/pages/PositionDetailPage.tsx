import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, Navigate, useParams, useSearchParams } from 'react-router-dom'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from 'react'
import * as XLSX from '@e965/xlsx'
import {
  Check,
  CheckCircle2,
  X,
  Link2,
  Trash2,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  Upload,
  Copy,
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
  CalendarPlus,
} from 'lucide-react'
import { differenceInCalendarDays, format, parse } from 'date-fns'

import { useAuth } from '@/auth/useAuth'
import { getSupabase } from '@/lib/supabase'
import { isMissingArchivedAtColumnError } from '@/lib/postgrestErrors'
import { normalizeEmail, normalizePhone } from '@/lib/normalize'
import { addDaysIso, formatDue } from '@/lib/dates'
import { OffCanvasRegistrar } from '@/components/layout/OffCanvasContext'
import { Modal } from '@/components/ui/Modal'
import { PageSpinner } from '@/components/ui/PageSpinner'
import { useToast } from '@/hooks/useToast'
import { criticalStageThreshold, logActivityEvent } from '@/lib/activityLog'
import { assignmentStatusPill, formatAssignmentStatus } from '@/lib/candidateStatus'
import { logPositionCandidateTransition } from '@/lib/positionTransitions'
import { fireInsaneHireConfetti } from '@/lib/hireConfetti'
import { normalizeRequirementsText } from '@/lib/requirementValues'
import { CompanyClientAvatar } from '@/components/companies/CompanyClientAvatar'
import {
  CandidateInterviewScheduleModal,
  type CandidateScheduleInitial,
} from '@/components/positions/CandidateInterviewScheduleModal'
import { linkedinHref } from '@/lib/urls'

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
  archived_at?: string | null
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

/** Colored dots for upcoming calendar events on pipeline cards (cycles by stage column index). */
const PIPELINE_STAGE_EVENT_DOT_PALETTE = [
  'bg-emerald-500',
  'bg-sky-500',
  'bg-violet-500',
  'bg-amber-500',
  'bg-rose-500',
  'bg-cyan-500',
] as const

/** Past (ended) events use a fixed blue dot so they stay visible after the slot. */
const PIPELINE_STAGE_EVENT_DOT_PAST = 'bg-blue-500 dark:bg-blue-400' as const

type PositionScopedCalendarEventRow = {
  id: string
  title: string
  subtitle: string | null
  starts_at: string
  ends_at: string | null
  candidate_id: string | null
  position_stage_id: string | null
  candidates: { full_name: string } | { full_name: string }[] | null
  position_stages: { name: string } | { name: string }[] | null
}

function positionCalendarCandidateLabel(ev: PositionScopedCalendarEventRow): string {
  const v = ev.candidates
  if (v == null) return '—'
  const o = Array.isArray(v) ? v[0] : v
  return o?.full_name?.trim() || '—'
}

function positionCalendarStageLabel(ev: PositionScopedCalendarEventRow): string {
  const v = ev.position_stages
  if (v == null) return '—'
  const o = Array.isArray(v) ? v[0] : v
  return o?.name?.trim() || '—'
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

const ASSIGNMENT_OUTCOME_REJECTED_REASONS: ReadonlyArray<{ id: string; label: string }> = [
  { id: 'profile_mismatch', label: 'Not a fit — profile or experience mismatch' },
  { id: 'client_passed', label: 'Client passed — chose another candidate' },
  { id: 'process_exit', label: 'Dropped out during process (interview / assessment)' },
  { id: 'compensation', label: 'Compensation or terms misalignment' },
  { id: 'other', label: 'Other' },
]

const ASSIGNMENT_OUTCOME_WITHDRAWN_REASONS: ReadonlyArray<{ id: string; label: string }> = [
  { id: 'candidate_withdrew', label: 'Candidate withdrew interest' },
  { id: 'other_offer', label: 'Accepted another offer elsewhere' },
  { id: 'personal', label: 'Personal, relocation, or availability change' },
  { id: 'other', label: 'Other' },
]

const DRAWER_WIDTH_SCALE = 1.3

const MAX_RESUME_UPLOAD_BYTES = 15 * 1024 * 1024
const MAX_ATTACHMENT_UPLOAD_BYTES = 15 * 1024 * 1024
const MAX_AVATAR_UPLOAD_BYTES = 5 * 1024 * 1024

const RESUME_UPLOAD_MIME = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
])

const ATTACHMENT_UPLOAD_MIME = new Set([
  ...RESUME_UPLOAD_MIME,
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'text/plain',
  'application/zip',
])

function validateResumeUpload(file: File): string | null {
  if (file.size > MAX_RESUME_UPLOAD_BYTES) return `Resume must be under ${MAX_RESUME_UPLOAD_BYTES / (1024 * 1024)} MB`
  if (file.type && !RESUME_UPLOAD_MIME.has(file.type)) return 'Resume must be PDF or Word (.doc/.docx)'
  return null
}

function validateAttachmentUpload(file: File): string | null {
  if (file.size > MAX_ATTACHMENT_UPLOAD_BYTES) return `File must be under ${MAX_ATTACHMENT_UPLOAD_BYTES / (1024 * 1024)} MB`
  if (file.type && !ATTACHMENT_UPLOAD_MIME.has(file.type))
    return 'Allowed: PDF, Word, Excel, images, plain text, or ZIP'
  return null
}

function validateAvatarUpload(file: File): string | null {
  if (file.size > MAX_AVATAR_UPLOAD_BYTES) return `Photo must be under ${MAX_AVATAR_UPLOAD_BYTES / (1024 * 1024)} MB`
  if (!file.type.startsWith('image/')) return 'Use an image file (JPEG, PNG, or WebP).'
  if (file.type === 'image/gif') return 'GIF is not supported; use JPEG, PNG, or WebP.'
  return null
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

function formatClosureDateDisplay(raw: string): string {
  const t = raw.trim()
  if (!t) return ''
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return t
  const d = parse(t, 'yyyy-MM-dd', new Date())
  if (Number.isNaN(d.getTime())) return t
  return format(d, 'MMM d, yyyy')
}

/** Postgres `date` or ISO string → short display (MMM d, yyyy) or em dash. */
function formatOpenedAtShort(openedAt: string | null | undefined): string {
  if (openedAt == null || openedAt === '') return '—'
  const slice = String(openedAt).slice(0, 10)
  if (/^\d{4}-\d{2}-\d{2}$/.test(slice)) {
    const d = parse(slice, 'yyyy-MM-dd', new Date())
    if (!Number.isNaN(d.getTime())) return format(d, 'MMM d, yyyy')
  }
  const d = new Date(openedAt)
  return !Number.isNaN(d.getTime()) ? format(d, 'MMM d, yyyy') : '—'
}

function DetailHoverField({
  label,
  value,
  multiline,
  rows,
  onSave,
  disabled,
  readOnlyFormat,
  inputType = 'text',
}: {
  label: string
  value: string
  multiline?: boolean
  rows?: number
  onSave: (next: string) => void | Promise<void>
  disabled?: boolean
  /** When set, non-edit view shows this instead of raw `value` (still saves `draft` from typed input). */
  readOnlyFormat?: (value: string) => string
  /** Use native date picker in edit mode (value / saved value should be YYYY-MM-DD). */
  inputType?: 'text' | 'date'
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
              type={inputType}
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

  type TabId = 'details' | 'candidates' | 'openings' | 'tasks' | 'events' | 'comments' | 'activity'
  const tab = useMemo<TabId>(() => {
    if (highlightCandidate) return 'candidates'
    const v = search.get('tab')
    if (v === 'approaches') return 'openings'
    if (
      v === 'details' ||
      v === 'candidates' ||
      v === 'openings' ||
      v === 'tasks' ||
      v === 'events' ||
      v === 'comments' ||
      v === 'activity'
    )
      return v
    return 'details'
  }, [search, highlightCandidate])

  const setTab = (tid: TabId) => {
    setSearch(
      (prev) => {
        const next = new URLSearchParams(prev)
        const urlTab = tid === 'openings' ? 'approaches' : tid
        next.set('tab', urlTab)
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
      const selectWithArchive = `
          id,
          candidate_id,
          position_stage_id,
          status,
          source,
          created_at,
          archived_at,
          candidates ( id, full_name, email, phone, linkedin, salary_expectation, resume_storage_path, profile_photo_storage_path, deleted_at ),
          position_stages ( name )
        `
      const selectWithoutArchive = `
          id,
          candidate_id,
          position_stage_id,
          status,
          source,
          created_at,
          candidates ( id, full_name, email, phone, linkedin, salary_expectation, resume_storage_path, profile_photo_storage_path, deleted_at ),
          position_stages ( name )
        `
      const first = await supabase!
        .from('position_candidates')
        .select(selectWithArchive)
        .eq('position_id', id!)
        .eq('user_id', user!.id)
        .is('archived_at', null)
        .order('created_at', { ascending: false })
      let data = first.data as PositionCandidateJunction[] | null
      let error = first.error
      if (error && isMissingArchivedAtColumnError(error)) {
        const second = await supabase!
          .from('position_candidates')
          .select(selectWithoutArchive)
          .eq('position_id', id!)
          .eq('user_id', user!.id)
          .order('created_at', { ascending: false })
        data = second.data as PositionCandidateJunction[] | null
        error = second.error
      }
      if (error) throw error
      const rows = data ?? []
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

  type ViewerCommentRow = {
    id: string
    position_candidate_id: string
    candidate_id: string
    candidate_full_name: string
    body: string
    created_at: string
  }

  const viewerCommentsQ = useQuery({
    queryKey: ['position-viewer-comments', id, user?.id],
    networkMode: 'always',
    enabled: Boolean(supabase && user && id),
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase!.rpc('list_position_public_viewer_messages_for_owner', {
        p_position_id: id!,
      })
      if (error) throw error
      return (data ?? []) as ViewerCommentRow[]
    },
  })

  const seenViewerMessageIdsRef = useRef<Set<string> | null>(null)
  useEffect(() => {
    seenViewerMessageIdsRef.current = null
  }, [id])

  useEffect(() => {
    if (!viewerCommentsQ.isSuccess || !viewerCommentsQ.data?.length) {
      if (viewerCommentsQ.isSuccess && viewerCommentsQ.data?.length === 0) {
        seenViewerMessageIdsRef.current = new Set()
      }
      return
    }
    const rows = viewerCommentsQ.data
    if (seenViewerMessageIdsRef.current === null) {
      seenViewerMessageIdsRef.current = new Set(rows.map((r) => r.id))
      return
    }
    for (const r of rows) {
      if (!seenViewerMessageIdsRef.current.has(r.id)) {
        seenViewerMessageIdsRef.current.add(r.id)
        const preview = r.body.length > 140 ? `${r.body.slice(0, 140)}…` : r.body
        success(`New viewer comment (${r.candidate_full_name}): ${preview}`)
      }
    }
  }, [viewerCommentsQ.isSuccess, viewerCommentsQ.data, success])

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

  const candidateDrawerPhotoStoragePath = useMemo(() => {
    if (!highlightCandidate) return null
    const row = (candidatesQ.data ?? []).find((r) => nestedCandidate(r.candidates)?.id === highlightCandidate)
    const p = nestedCandidate(row?.candidates ?? null)?.profile_photo_storage_path?.trim()
    return p || null
  }, [candidatesQ.data, highlightCandidate])

  const candidateDrawerPhotoSignedUrlQ = useQuery({
    queryKey: ['candidate-doc-signed-photo', user?.id, candidateDrawerPhotoStoragePath],
    enabled: Boolean(supabase && user?.id && candidateDrawerPhotoStoragePath),
    staleTime: 50 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase!.storage
        .from('candidate-docs')
        .createSignedUrl(candidateDrawerPhotoStoragePath!, 3600)
      if (error) throw error
      return data.signedUrl
    },
  })

  const positionIsOpen = useMemo(
    () => posQ.data?.status === 'active' || posQ.data?.status === 'on_hold',
    [posQ.data?.status],
  )

  const [shareChannelOpen, setShareChannelOpen] = useState(false)

  const publicListTokenQ = useQuery({
    queryKey: ['position-public-list-token', id, user?.id],
    networkMode: 'always',
    staleTime: 5 * 60 * 1000,
    enabled: Boolean(supabase && user && id && positionIsOpen && shareChannelOpen),
    queryFn: async () => {
      const { data, error } = await supabase!
        .from('position_public_list_tokens')
        .select('token, expose_contact')
        .eq('position_id', id!)
        .is('revoked_at', null)
        .maybeSingle()
      if (error) throw error
      const row = data as { token: string; expose_contact?: boolean | null } | null
      if (!row?.token) return null
      return { token: row.token, expose_contact: Boolean(row.expose_contact) }
    },
  })

  const [publicShareExposeContact, setPublicShareExposeContact] = useState(false)
  useEffect(() => {
    const d = publicListTokenQ.data
    if (d) setPublicShareExposeContact(d.expose_contact)
  }, [publicListTokenQ.data])

  /** Single RPC: verifies you own the position, returns token, handles races (SECURITY DEFINER). */
  const resolvePublicListToken = useCallback(
    async (exposeContact: boolean): Promise<string> => {
      if (!supabase || !user || !id) throw new Error('Not signed in')
      const { data, error } = await supabase.rpc('ensure_position_public_share_token', {
        p_position_id: id,
        p_expose_contact: exposeContact,
      })
      if (error) throw error
      if (typeof data !== 'string' || !data.trim()) throw new Error('No share token returned')
      void qc.invalidateQueries({ queryKey: ['position-public-list-token', id, user.id] })
      return data.trim()
    },
    [supabase, user, id, qc],
  )

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
  const [openedAtStr, setOpenedAtStr] = useState('')
  const [closureDateStr, setClosureDateStr] = useState('')
  const [terminalFinish, setTerminalFinish] = useState<null | 'succeeded' | 'cancelled'>(null)
  const [terminalClosureDate, setTerminalClosureDate] = useState('')
  const [positionSetupOpen, setPositionSetupOpen] = useState(false)
  const [status, setStatus] = useState('active')
  const [shareOpen, setShareOpen] = useState(false)
  const [shareUrl, setShareUrl] = useState<string | null>(null)
  const [selectedPositionTask, setSelectedPositionTask] = useState<PositionTaskRow | null>(null)
  const [headerStatusOpen, setHeaderStatusOpen] = useState(false)
  const headerStatusRef = useRef<HTMLDivElement>(null)
  const shareChannelRef = useRef<HTMLDivElement>(null)
  const [candidateDragId, setCandidateDragId] = useState<string | null>(null)
  const [candidateDropStage, setCandidateDropStage] = useState<string | null>(null)
  const [candidateDrawerPanel, setCandidateDrawerPanel] = useState<'overview' | 'events' | 'files' | 'notes'>(
    'overview',
  )
  const [drawerPanelEntered, setDrawerPanelEntered] = useState(false)
  const [drawerFieldEdit, setDrawerFieldEdit] = useState<null | 'name' | 'email' | 'phone' | 'linkedin' | 'salary'>(null)
  const [drawerFieldDraft, setDrawerFieldDraft] = useState('')
  const [drawerAvatarBroken, setDrawerAvatarBroken] = useState(false)
  const [drawerFilesDragging, setDrawerFilesDragging] = useState(false)
  const [drawerCommentText, setDrawerCommentText] = useState('')
  const [drawerAssignStatusOpen, setDrawerAssignStatusOpen] = useState(false)
  const drawerAssignStatusRef = useRef<HTMLDivElement>(null)
  const drawerNameMeasureRef = useRef<HTMLSpanElement>(null)
  const [candidateDrawerWidthPx, setCandidateDrawerWidthPx] = useState<number | null>(null)
  const [assignmentOutcomeModal, setAssignmentOutcomeModal] = useState<null | {
    nextStatus: 'rejected' | 'withdrawn'
    positionCandidateId: string
    source: 'drawer' | 'list_withdraw'
  }>(null)
  const [hiredFollowUpPcId, setHiredFollowUpPcId] = useState<string | null>(null)
  const hireConfettiStopRef = useRef<(() => void) | null>(null)
  const [outcomeReasonId, setOutcomeReasonId] = useState('')
  const [outcomeReasonOther, setOutcomeReasonOther] = useState('')
  const [outcomeCloseTasks, setOutcomeCloseTasks] = useState(true)
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
    return () => {
      hireConfettiStopRef.current?.()
      hireConfettiStopRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!position) return
    setTitle(position.title ?? '')
    const pos = position as {
      requirements?: unknown
      hiring_manager_name?: string | null
      hiring_manager_email?: string | null
      hiring_manager_phone?: string | null
      salary_budget?: number | null
      planned_fee_ils?: number | null
    }
    const reqText = normalizeRequirementsText(pos.requirements)
    setRequirements(reqText)
    setHiringManagerName(pos.hiring_manager_name ?? '')
    setHiringManagerEmail(pos.hiring_manager_email ?? '')
    setHiringManagerPhone(pos.hiring_manager_phone ?? '')
    setSalaryBudgetStr(pos.salary_budget != null ? String(pos.salary_budget) : '')
    setRecruitmentFeeStr(pos.planned_fee_ils != null ? String(pos.planned_fee_ils) : '')
    setWelcome1(position.welcome_1 ?? '')
    setWelcome2(position.welcome_2 ?? '')
    setWelcome3(position.welcome_3 ?? '')
    const oa = (position as { opened_at?: string | null }).opened_at
    setOpenedAtStr(oa ? String(oa).slice(0, 10) : '')
    setClosureDateStr((position as { closure_date?: string | null }).closure_date ?? '')
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
    await qc.invalidateQueries({ queryKey: ['position-stages', id] })
    await qc.invalidateQueries({ queryKey: ['position-candidates', id] })
    await qc.invalidateQueries({ queryKey: ['position-transition-stats', id] })
    await qc.invalidateQueries({ queryKey: ['position-activity', id] })
    await qc.invalidateQueries({ queryKey: ['position-viewer-comments', id] })
    await qc.invalidateQueries({ queryKey: ['position-calendar-events', id] })
    await qc.invalidateQueries({ queryKey: ['position-public-list-token', id] })
    await qc.invalidateQueries({ queryKey: ['positions'] })
    await qc.invalidateQueries({ queryKey: ['dashboard-top-positions'] })
    await qc.invalidateQueries({ queryKey: ['pipeline-headline-stats'] })
    await qc.invalidateQueries({ queryKey: ['companies-positions-income'] })
    await qc.invalidateQueries({ queryKey: ['all-candidates'] })
    await qc.invalidateQueries({ queryKey: ['tasks-page'] })
    await qc.invalidateQueries({ queryKey: ['position-tasks', id] })
    await qc.invalidateQueries({ queryKey: ['notification-count'] })
  }

  async function saveCandidateFromDrawer(
    candidateId: string,
    patch: {
      full_name?: string
      email?: string | null
      phone?: string | null
      linkedin?: string | null
      salary_expectation?: string | null
    },
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
    if (patch.linkedin !== undefined) row.linkedin = patch.linkedin?.trim() || null
    if (patch.salary_expectation !== undefined) row.salary_expectation = patch.salary_expectation
    const { error } = await supabase.from('candidates').update(row).eq('id', candidateId).eq('user_id', user.id)
    if (error) toastError(error)
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
    toastError(error)
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
        status,
      }
      const withRequirements = { ...base, requirements: requirements.trim() || null }
      const { error } = await supabase!.from('positions').update(withRequirements).eq('id', id!).eq('user_id', user!.id)
      if (error) throw error
    },
    onSuccess: async () => {
      success('Position saved')
      await invalidateAll()
    },
    onError: (e: Error) => toastError(e),
  })

  const setPositionTerminal = useMutation({
    mutationFn: async (payload: { next: 'succeeded' | 'cancelled'; closureDate: string | null }) => {
      const { next, closureDate } = payload
      const prev = position?.status ?? 'active'
      const { error } = await supabase!
        .from('positions')
        .update({ status: next, closure_date: closureDate })
        .eq('id', id!)
        .eq('user_id', user!.id)
      if (error) throw error
      return { prev, next }
    },
    onSuccess: async ({ prev, next }) => {
      setTerminalFinish(null)
      setTerminalClosureDate('')
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
    onError: (e: Error) => toastError(e),
  })

  const reopenPosition = useMutation({
    mutationFn: async () => {
      const { error } = await supabase!
        .from('positions')
        .update({ status: 'active', closure_date: null })
        .eq('id', id!)
        .eq('user_id', user!.id)
      if (error) throw error
    },
    onSuccess: async () => {
      setStatus('active')
      success('Position reopened')
      await invalidateAll()
    },
    onError: (e: Error) => toastError(e),
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
    onError: (e: Error) => toastError(e),
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
    onError: (e: Error) => toastError(e),
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
    onError: (e: Error) => toastError(e),
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
      toastError(e)
    },
  })

  async function moveStage(stageId: string, dir: -1 | 1) {
    const rows = [...(stagesQ.data ?? [])]
    const i = rows.findIndex((r) => r.id === stageId)
    const j = i + dir
    if (i < 0 || j < 0 || j >= rows.length) return
    const a = rows[i]!
    const b = rows[j]!
    const { error } = await supabase!.rpc('swap_position_stages', {
      p_position_id: id!,
      p_stage_id: a.id,
      p_other_stage_id: b.id,
    })
    if (error) {
      toastError(error)
      return
    }
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
    await qc.invalidateQueries({ queryKey: ['all-candidates'] })
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
    onError: (e: Error) => toastError(e),
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
    onError: (e: Error) => toastError(e),
  })

  const patchAssignmentStatus = useMutation({
    mutationFn: async ({
      positionCandidateId,
      nextStatus,
      closeTasks,
      outcomeReason,
    }: {
      positionCandidateId: string
      nextStatus: 'in_progress' | 'rejected' | 'withdrawn' | 'hired'
      closeTasks: boolean
      outcomeReason?: string | null
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
        outcomeReason: outcomeReason?.trim() || null,
      }
    },
    onSuccess: async ({ positionCandidateId, candidateId, prev, nextStatus, name, outcomeReason }) => {
      success('Status updated')
      if (nextStatus === 'hired') {
        hireConfettiStopRef.current?.()
        hireConfettiStopRef.current = fireInsaneHireConfetti(10_000)
        setHiredFollowUpPcId(positionCandidateId)
      }
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
        subtitle: outcomeReason ? `${prev} → ${nextStatus} · ${outcomeReason}` : `${prev} → ${nextStatus}`,
        metadata: {
          from: prev,
          to: nextStatus,
          ...(outcomeReason ? { outcome_reason: outcomeReason } : {}),
        },
      })
      await invalidateAll()
    },
    onError: (e: Error) => toastError(e),
  })

  const bulkRejectOthersAndSucceedPosition = useMutation({
    mutationFn: async (hiredPcId: string) => {
      const otherIds = (candidatesQ.data ?? []).filter((c) => c.id !== hiredPcId).map((c) => c.id)
      if (otherIds.length > 0) {
        const { error } = await supabase!
          .from('position_candidates')
          .update({ status: 'rejected' })
          .in('id', otherIds)
          .eq('user_id', user!.id)
          .eq('position_id', id!)
        if (error) throw error
        const { error: taskErr } = await supabase!
          .from('tasks')
          .update({ status: 'closed' })
          .in('position_candidate_id', otherIds)
          .eq('user_id', user!.id)
          .neq('status', 'closed')
        if (taskErr) throw taskErr
      }
      const prev = position?.status ?? 'active'
      const { error: posErr } = await supabase!
        .from('positions')
        .update({ status: 'succeeded', closure_date: null })
        .eq('id', id!)
        .eq('user_id', user!.id)
      if (posErr) throw posErr
      return { prev, otherCount: otherIds.length }
    },
    onSuccess: async ({ prev, otherCount }) => {
      setHiredFollowUpPcId(null)
      setStatus('succeeded')
      success(
        otherCount > 0
          ? `Position marked succeeded · ${otherCount} other assignment(s) set to Rejected`
          : 'Position marked succeeded',
      )
      await logActivityEvent(supabase!, user!.id, {
        event_type: 'position_status_changed',
        position_id: id!,
        title: 'Position closed after hire',
        subtitle: `${prev} → succeeded · bulk rejected ${otherCount}`,
        metadata: { from: prev, to: 'succeeded', bulk_reject_count: otherCount },
      })
      await invalidateAll()
    },
    onError: (e: Error) => toastError(e),
  })

  const archiveAssignmentOnRole = useMutation({
    mutationFn: async (positionCandidateId: string) => {
      const { error } = await supabase!
        .from('position_candidates')
        .update({ archived_at: new Date().toISOString() })
        .eq('id', positionCandidateId)
        .eq('user_id', user!.id)
      if (error) throw error
    },
    onSuccess: async () => {
      success('Candidate removed from this role')
      setSearch(
        (prev) => {
          const n = new URLSearchParams(prev)
          n.delete('candidate')
          return n
        },
        { replace: true },
      )
      await invalidateAll()
    },
    onError: (e: Error) => toastError(e),
  })

  const withdrawFromRole = useMutation({
    mutationFn: async ({
      positionCandidateId,
      outcomeReason,
      closeTasks,
    }: {
      positionCandidateId: string
      outcomeReason?: string | null
      closeTasks?: boolean
    }) => {
      const row = (candidatesQ.data ?? []).find((c) => c.id === positionCandidateId)
      const prevStatus = (row?.status as string) ?? 'in_progress'
      const prof = nestedCandidate(row?.candidates ?? null)
      const { error } = await supabase!
        .from('position_candidates')
        .update({ status: 'withdrawn' })
        .eq('id', positionCandidateId)
        .eq('user_id', user!.id)
      if (error) throw error
      if (closeTasks) {
        await supabase!
          .from('tasks')
          .update({ status: 'closed' })
          .eq('position_candidate_id', positionCandidateId)
          .eq('user_id', user!.id)
          .neq('status', 'closed')
      }
      return {
        positionCandidateId,
        prevStatus,
        candidateId: prof?.id ?? row?.candidate_id ?? null,
        name: prof?.full_name ?? 'Candidate',
        outcomeReason: outcomeReason?.trim() || null,
      }
    },
    onSuccess: async ({ positionCandidateId, prevStatus, candidateId, name, outcomeReason }) => {
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
        subtitle: outcomeReason ? `Assignment closed · ${outcomeReason}` : 'Assignment closed',
        metadata: outcomeReason ? { outcome_reason: outcomeReason } : {},
      })
      if (highlightCandidate && candidateId === highlightCandidate) setSearch({}, { replace: true })
      await invalidateAll()
    },
    onError: (e: Error) => toastError(e),
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
      await qc.invalidateQueries({ queryKey: ['position-viewer-comments', id] })
    },
    onError: (e: Error) => toastError(e),
  })

  const [commentsTabDrafts, setCommentsTabDrafts] = useState<Record<string, string>>({})

  const replyFromCommentsTab = useMutation({
    mutationFn: async (payload: {
      messageId: string
      text: string
      candidateId: string
      positionCandidateId: string
    }) => {
      const t = payload.text.trim()
      if (!t) throw new Error('Enter a reply')
      await logActivityEvent(supabase!, user!.id, {
        event_type: 'note_added',
        position_id: id!,
        candidate_id: payload.candidateId,
        position_candidate_id: payload.positionCandidateId,
        title: 'Reply (public thread)',
        subtitle: t,
      })
    },
    onSuccess: async (_, v) => {
      setCommentsTabDrafts((prev) => {
        const next = { ...prev }
        delete next[v.messageId]
        return next
      })
      success('Reply added')
      await qc.invalidateQueries({ queryKey: ['position-activity', id] })
      await qc.invalidateQueries({ queryKey: ['position-viewer-comments', id] })
    },
    onError: (e: Error) => toastError(e),
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
    onError: (e: Error) => toastError(e),
  })

  const deleteActivityEvent = useMutation({
    mutationFn: async (eventId: string) => {
      const { error } = await supabase!.from('activity_events').delete().eq('id', eventId).eq('user_id', user!.id)
      if (error) throw error
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['position-activity', id] })
    },
    onError: (e: Error) => toastError(e),
  })

  const createShareToken = useMutation({
    mutationFn: async (candidateId: string) => {
      const token = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '').slice(0, 16)
      const { error } = await supabase!.from('candidate_share_tokens').insert({
        user_id: user!.id,
        candidate_id: candidateId,
        token,
        expires_at: addDaysIso(7),
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
    onError: (e: Error) => toastError(e),
  })

  async function uploadResume(candidateId: string, file: File | null) {
    if (!file || !supabase || !user) return
    const bad = validateResumeUpload(file)
    if (bad) {
      toastError(bad)
      return
    }
    const path = `${user.id}/${candidateId}/${crypto.randomUUID()}-${file.name.replace(/[^\w.-]/g, '_')}`
    const { error: upErr } = await supabase.storage.from('candidate-docs').upload(path, file)
    if (upErr) {
      toastError(upErr)
      return
    }
    const { error } = await supabase.from('candidates').update({ resume_storage_path: path }).eq('id', candidateId).eq('user_id', user.id)
    if (error) {
      toastError(error)
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
    const bad = validateAttachmentUpload(file)
    if (bad) {
      toastError(bad)
      return
    }
    const path = `${user.id}/${candidateId}/${crypto.randomUUID()}-${file.name.replace(/[^\w.-]/g, '_')}`
    const { error: upErr } = await supabase.storage.from('candidate-docs').upload(path, file)
    if (upErr) {
      toastError(upErr)
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
    const bad = validateAvatarUpload(file)
    if (bad) {
      toastError(bad)
      return
    }
    const ext = (file.name.split('.').pop() ?? 'jpg').replace(/[^\w]/g, '') || 'jpg'
    const path = `${user.id}/${candidateId}/avatar-${crypto.randomUUID()}.${ext}`
    const { error: upErr } = await supabase.storage.from('candidate-docs').upload(path, file)
    if (upErr) {
      toastError(upErr)
      return
    }
    const { error } = await supabase
      .from('candidates')
      .update({ profile_photo_storage_path: path })
      .eq('id', candidateId)
      .eq('user_id', user.id)
    if (error) {
      toastError(error)
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
    await qc.invalidateQueries({ queryKey: ['candidate-doc-signed-photo'] })
  }

  async function previewResume(storagePath: string) {
    if (!supabase) return
    const { data, error } = await supabase.storage.from('candidate-docs').createSignedUrl(storagePath, 120)
    if (error || !data?.signedUrl) {
      toastError(error ?? new Error('Could not open file'))
      return
    }
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
  }

  const activityByDay = useMemo(() => {
    const rows = activityQ.data ?? []
    const groups: { dayKey: string; dayLabel: string; rows: ActivityRow[] }[] = []
    const indexByKey = new Map<string, number>()
    for (const a of rows) {
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
  }, [activityQ.data])

  const terminalPosition = status === 'succeeded' || status === 'cancelled'

  const rejectedWithdrawnCandidates = useMemo(() => {
    return (candidatesQ.data ?? [])
      .filter((c) => c.status === 'rejected' || c.status === 'withdrawn')
      .sort((a, b) => new Date(b.created_at as string).getTime() - new Date(a.created_at as string).getTime())
  }, [candidatesQ.data])

  const hiredCandidates = useMemo(() => {
    return (candidatesQ.data ?? [])
      .filter((c) => c.status === 'hired')
      .sort((a, b) => new Date(b.created_at as string).getTime() - new Date(a.created_at as string).getTime())
  }, [candidatesQ.data])

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

  const positionCalendarCandidateIdsKey = useMemo(
    () =>
      (candidatesQ.data ?? [])
        .map((r) => r.candidate_id)
        .filter(Boolean)
        .sort()
        .join(','),
    [candidatesQ.data],
  )

  const positionCalendarEventsQ = useQuery({
    queryKey: ['position-calendar-events', id, user?.id, positionCalendarCandidateIdsKey],
    networkMode: 'always',
    enabled: Boolean(supabase && user && id && positionCalendarCandidateIdsKey.length > 0),
    queryFn: async () => {
      const ids = (candidatesQ.data ?? []).map((r) => r.candidate_id).filter(Boolean) as string[]
      if (ids.length === 0) return [] as PositionScopedCalendarEventRow[]
      const { data, error } = await supabase!
        .from('calendar_events')
        .select(
          'id, title, subtitle, starts_at, ends_at, candidate_id, position_stage_id, candidates ( full_name ), position_stages ( name )',
        )
        .eq('user_id', user!.id)
        .in('candidate_id', ids)
        .order('starts_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as PositionScopedCalendarEventRow[]
    },
  })

  const positionActiveStageEventsMap = useMemo(() => {
    const rows = positionCalendarEventsQ.data ?? []
    const now = Date.now()
    const active = rows.filter((ev) => {
      if (!ev.candidate_id || !ev.position_stage_id || !ev.ends_at) return false
      return new Date(ev.ends_at).getTime() > now
    })
    active.sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime())
    const m = new Map<string, { title: string }>()
    for (const ev of active) {
      const k = `${ev.candidate_id}:${ev.position_stage_id}`
      if (!m.has(k)) m.set(k, { title: ev.title })
    }
    return m
  }, [positionCalendarEventsQ.data])

  /** Ended events for the same candidate+stage (most recently ended wins). Shown with a blue dot when no upcoming slot exists. */
  const positionPastStageEventsMap = useMemo(() => {
    const rows = positionCalendarEventsQ.data ?? []
    const now = Date.now()
    const past = rows.filter((ev) => {
      if (!ev.candidate_id || !ev.position_stage_id || !ev.ends_at) return false
      return new Date(ev.ends_at).getTime() <= now
    })
    past.sort((a, b) => new Date(b.ends_at as string).getTime() - new Date(a.ends_at as string).getTime())
    const m = new Map<string, { title: string }>()
    for (const ev of past) {
      const k = `${ev.candidate_id}:${ev.position_stage_id}`
      if (!m.has(k)) m.set(k, { title: ev.title })
    }
    return m
  }, [positionCalendarEventsQ.data])

  const positionEventsForTab = useMemo(() => {
    const rows = positionCalendarEventsQ.data ?? []
    const now = Date.now()
    const upcoming: PositionScopedCalendarEventRow[] = []
    const previous: PositionScopedCalendarEventRow[] = []
    for (const ev of rows) {
      const endMs = ev.ends_at ? new Date(ev.ends_at).getTime() : null
      if (endMs != null) {
        if (endMs > now) upcoming.push(ev)
        else previous.push(ev)
      } else if (new Date(ev.starts_at).getTime() > now) upcoming.push(ev)
      else previous.push(ev)
    }
    upcoming.sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime())
    previous.sort((a, b) => new Date(b.starts_at).getTime() - new Date(a.starts_at).getTime())
    return { upcoming, previous }
  }, [positionCalendarEventsQ.data])

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

  const [candidateSchedule, setCandidateSchedule] = useState<CandidateScheduleInitial | null>(null)
  const [candidateScheduleModalKey, setCandidateScheduleModalKey] = useState(0)

  const openCandidateScheduleModal = useCallback(() => {
    if (!drawerCandidate) return
    const stages = stagesQ.data ?? []
    const sid = drawerCandidate.position_stage_id ?? stages[0]?.id ?? ''
    const stageRow = stages.find((s) => s.id === sid)
    const dur =
      stageRow?.duration_minutes != null && stageRow.duration_minutes > 0 ? stageRow.duration_minutes : 60
    const hm = (posQ.data as { hiring_manager_name?: string | null } | undefined)?.hiring_manager_name?.trim() ?? ''
    const d = new Date()
    d.setMinutes(0, 0, 0)
    d.setHours(d.getHours() + 1)
    setCandidateSchedule({
      startsAt: format(d, "yyyy-MM-dd'T'HH:mm"),
      durationMin: dur,
      stageId: sid,
      interviewer: hm,
    })
    setCandidateScheduleModalKey((k) => k + 1)
  }, [drawerCandidate, stagesQ.data, posQ.data])

  useEffect(() => {
    if (!highlightCandidate) setCandidateSchedule(null)
  }, [highlightCandidate])

  const drawerNameForMeasure = useMemo(() => {
    if (!drawerCandidate) return ''
    const nm = nestedCandidate(drawerCandidate.candidates)?.full_name ?? 'Unnamed'
    if (drawerFieldEdit === 'name') return drawerFieldDraft || nm
    return nm
  }, [drawerCandidate, drawerFieldEdit, drawerFieldDraft])

  useLayoutEffect(() => {
    if (!highlightCandidate || !drawerCandidate) {
      setCandidateDrawerWidthPx(null)
      return
    }
    // Below `sm`, use full-width drawer (Tailwind `w-full`); dynamic width felt arbitrarily narrow on phones.
    if (typeof window !== 'undefined' && window.innerWidth < 640) {
      setCandidateDrawerWidthPx(null)
      return
    }
    const el = drawerNameMeasureRef.current
    if (!el) return
    const nameW = el.scrollWidth
    const minW = 360
    const cap = typeof window !== 'undefined' ? Math.min(window.innerWidth - 24, 560) : 560
    const base = Math.min(cap, Math.max(minW, nameW + 220))
    const vwCap = typeof window !== 'undefined' ? Math.floor((window.innerWidth - 24) * 0.98) : base
    setCandidateDrawerWidthPx(Math.min(vwCap, Math.round(base * DRAWER_WIDTH_SCALE)))
  }, [highlightCandidate, drawerCandidate, drawerNameForMeasure])

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
  const openedAtForHeader = (position as { opened_at?: string | null }).opened_at
  const openedShort = formatOpenedAtShort(openedAtForHeader)
  const openedLabel = openedShort === '—' ? 'Opened —' : `Opened ${openedShort}`

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
      case 'note_added':
        return {
          rail: 'bg-slate-200/90 dark:bg-slate-800/60',
          dot: 'bg-slate-500 shadow-sm dark:bg-slate-400',
          pill: 'border-slate-200/90 bg-slate-50 text-slate-900 dark:border-slate-600 dark:bg-slate-800/80 dark:text-slate-100',
          pillLabel: 'Note',
        }
      case 'candidate_tag':
        return {
          rail: 'bg-fuchsia-200/90 dark:bg-fuchsia-900/40',
          dot: 'bg-fuchsia-500 shadow-sm dark:bg-fuchsia-400',
          pill: 'border-fuchsia-200/90 bg-fuchsia-50 text-fuchsia-950 dark:border-fuchsia-800 dark:bg-fuchsia-950/35 dark:text-fuchsia-100',
          pillLabel: 'Tag',
        }
      case 'position_status_changed':
        return {
          rail: 'bg-teal-200/90 dark:bg-teal-900/45',
          dot: 'bg-teal-600 shadow-sm dark:bg-teal-400',
          pill: 'border-teal-200/90 bg-teal-50 text-teal-950 dark:border-teal-800 dark:bg-teal-950/40 dark:text-teal-100',
          pillLabel: 'Role',
        }
      case 'candidate_outcome_changed':
        return {
          rail: 'bg-indigo-200/90 dark:bg-indigo-900/45',
          dot: 'bg-indigo-500 shadow-sm dark:bg-indigo-400',
          pill: 'border-indigo-200/90 bg-indigo-50 text-indigo-950 dark:border-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-100',
          pillLabel: 'Outcome',
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

  function renderRejectedWithdrawnCard(c: PositionCandidateJunction) {
    const prof = nestedCandidate(c.candidates)
    const candId = prof?.id
    const stageName = nestedStageName(c.position_stages)
    const displayName = prof?.full_name ?? 'Unnamed'
    const isRejected = c.status === 'rejected'
    const when = format(new Date(c.created_at as string), 'MMM d, yyyy')
    return (
      <li
        key={c.id}
        id={candId ? `cand-${candId}` : `pc-${c.id}`}
        className={`group overflow-hidden rounded-2xl border shadow-sm transition hover:shadow-md dark:shadow-none ${
          candId ? 'cursor-pointer' : ''
        } ${
          isRejected
            ? 'border-rose-200/90 bg-gradient-to-br from-rose-50/95 via-white to-white dark:border-rose-900/55 dark:from-rose-950/35 dark:via-stone-900 dark:to-stone-950'
            : 'border-stone-200/90 bg-gradient-to-br from-stone-100/90 via-white to-white dark:border-stone-600 dark:from-stone-900 dark:via-stone-900 dark:to-stone-950'
        }`}
        role={candId ? 'button' : undefined}
        tabIndex={candId ? 0 : undefined}
        aria-label={candId ? `Open details for ${displayName}` : undefined}
        onClick={() => {
          if (candId) openCandidateDrawer(candId)
        }}
        onKeyDown={(e) => {
          if (!candId) return
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            openCandidateDrawer(candId)
          }
        }}
      >
        <div className="flex gap-3 p-4">
          <div
            className={`mt-1.5 h-10 w-10 shrink-0 rounded-xl border flex items-center justify-center ${
              isRejected
                ? 'border-rose-200/80 bg-rose-100 text-rose-700 dark:border-rose-800/60 dark:bg-rose-950/50 dark:text-rose-200'
                : 'border-stone-200/80 bg-stone-100 text-stone-600 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-300'
            }`}
            aria-hidden
          >
            {isRejected ? <Ban className="h-5 w-5" /> : <Pause className="h-5 w-5" />}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <span className="text-stitch-on-surface inline-flex min-w-0 items-center gap-1 text-base font-bold tracking-tight group-hover:text-[#9b3e20] dark:text-stone-100 dark:group-hover:text-orange-300">
                  <span className="truncate">{displayName}</span>
                  <ChevronRight className="h-4 w-4 shrink-0 opacity-50" aria-hidden />
                </span>
                <p className="text-ink-muted mt-1 text-xs leading-relaxed dark:text-stone-400">
                  <span className="font-semibold text-stone-600 dark:text-stone-300">{stageName}</span>
                  <span aria-hidden className="mx-1.5">
                    ·
                  </span>
                  {ASSIGNMENT_SOURCE_LABELS[normalizeAssignmentSource(c.source)]}
                  <span aria-hidden className="mx-1.5">
                    ·
                  </span>
                  Added {when}
                </p>
              </div>
              <span
                className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide ${
                  isRejected
                    ? 'border-rose-300/80 bg-rose-100 text-rose-900 dark:border-rose-800 dark:bg-rose-950/60 dark:text-rose-100'
                    : 'border-stone-300/80 bg-stone-200/80 text-stone-800 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-200'
                }`}
              >
                {formatAssignmentStatus(c.status as string)}
              </span>
            </div>
            {c.status === 'rejected' ? (
              <div className="mt-3 flex flex-wrap items-center justify-end gap-2 border-t border-stone-200/70 pt-3 dark:border-stone-600/60">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    if (!window.confirm(`Withdraw ${displayName} from this role?`)) return
                    setOutcomeReasonId('')
                    setOutcomeReasonOther('')
                    setOutcomeCloseTasks(true)
                    setAssignmentOutcomeModal({
                      nextStatus: 'withdrawn',
                      positionCandidateId: c.id,
                      source: 'list_withdraw',
                    })
                  }}
                  className="text-ink-muted hover:text-red-600 inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold transition hover:bg-red-50 dark:hover:bg-red-950/30 dark:hover:text-rose-300"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  Mark withdrawn
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </li>
    )
  }

  function renderHiredAssignmentCard(c: PositionCandidateJunction) {
    const prof = nestedCandidate(c.candidates)
    const candId = prof?.id
    const stageName = nestedStageName(c.position_stages)
    const displayName = prof?.full_name ?? 'Unnamed'
    const when = format(new Date(c.created_at as string), 'MMM d, yyyy')
    return (
      <li
        key={c.id}
        id={candId ? `cand-${candId}` : `pc-${c.id}`}
        className={`group overflow-hidden rounded-2xl border border-emerald-200/90 bg-gradient-to-br from-emerald-50/95 via-white to-white shadow-sm transition hover:shadow-md dark:border-emerald-800/55 dark:from-emerald-950/40 dark:via-stone-900 dark:to-stone-950 dark:shadow-none ${
          candId ? 'cursor-pointer' : ''
        }`}
        role={candId ? 'button' : undefined}
        tabIndex={candId ? 0 : undefined}
        aria-label={candId ? `Open details for ${displayName}` : undefined}
        onClick={() => {
          if (candId) openCandidateDrawer(candId)
        }}
        onKeyDown={(e) => {
          if (!candId) return
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            openCandidateDrawer(candId)
          }
        }}
      >
        <div className="flex gap-3 p-4">
          <div
            className="mt-1.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-emerald-200/80 bg-emerald-100 text-emerald-700 dark:border-emerald-800/60 dark:bg-emerald-950/50 dark:text-emerald-200"
            aria-hidden
          >
            <CheckCircle2 className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <span className="text-stitch-on-surface inline-flex min-w-0 items-center gap-1 text-base font-bold tracking-tight group-hover:text-[#9b3e20] dark:text-stone-100 dark:group-hover:text-orange-300">
                  <span className="truncate">{displayName}</span>
                  <ChevronRight className="h-4 w-4 shrink-0 opacity-50" aria-hidden />
                </span>
                <p className="text-ink-muted mt-1 text-xs leading-relaxed dark:text-stone-400">
                  <span className="font-semibold text-stone-600 dark:text-stone-300">{stageName}</span>
                  <span aria-hidden className="mx-1.5">
                    ·
                  </span>
                  {ASSIGNMENT_SOURCE_LABELS[normalizeAssignmentSource(c.source)]}
                  <span aria-hidden className="mx-1.5">
                    ·
                  </span>
                  Added {when}
                </p>
              </div>
              <span className="shrink-0 rounded-full border border-emerald-300/80 bg-emerald-100 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-100">
                Hired
              </span>
            </div>
          </div>
        </div>
      </li>
    )
  }

  function renderPipelineKanbanCard(
    c: PositionCandidateJunction,
    pipelineEvent: { title: string; variant: 'upcoming' | 'past' } | null,
    stageDotIdx: number,
  ) {
    const prof = nestedCandidate(c.candidates)
    const candId = prof?.id
    const tenure = formatTenureOnRoleShort(c.created_at as string)
    const dotClass =
      pipelineEvent?.variant === 'past'
        ? PIPELINE_STAGE_EVENT_DOT_PAST
        : PIPELINE_STAGE_EVENT_DOT_PALETTE[stageDotIdx % PIPELINE_STAGE_EVENT_DOT_PALETTE.length] ?? 'bg-emerald-500'
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
          {pipelineEvent ? (
            <div className="mt-1 flex min-w-0 items-center gap-1.5">
              <span className={`h-2 w-2 shrink-0 rounded-full ${dotClass}`} aria-hidden />
              <span
                className="text-ink-muted min-w-0 truncate text-xs font-semibold dark:text-stone-400"
                title={pipelineEvent.title}
              >
                {pipelineEvent.title}
              </span>
            </div>
          ) : null}
        </div>
      </div>
    )
  }

  const statusLabelShort =
    status === 'active' ? 'Active' : status === 'on_hold' ? 'On hold' : status === 'succeeded' ? 'Succeeded' : 'Cancelled'

  return (
    <div className="flex flex-col gap-6">
      <OffCanvasRegistrar
        active={Boolean(selectedPositionTask) || Boolean(drawerCandidate && highlightCandidate)}
      />
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
                          setTerminalClosureDate('')
                          setTerminalFinish('succeeded')
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
                          setTerminalClosureDate('')
                          setTerminalFinish('cancelled')
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
                    className="border-line absolute top-full right-0 z-50 mt-1 min-w-[14rem] rounded-xl border bg-white py-1 shadow-xl dark:border-line-dark dark:bg-stone-900"
                  >
                    <label className="flex cursor-pointer items-start gap-2 border-b border-stone-100 px-3 py-2.5 text-left text-xs text-stone-600 dark:border-stone-800 dark:text-stone-300">
                      <input
                        type="checkbox"
                        className="mt-0.5 shrink-0 rounded border-stone-300"
                        checked={publicShareExposeContact}
                        onChange={(e) => setPublicShareExposeContact(e.target.checked)}
                      />
                      <span>Show email &amp; LinkedIn on the public pipeline page</span>
                    </label>
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
                      className="hover:bg-stone-50 dark:hover:bg-stone-800 flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-stone-700 dark:text-stone-200"
                      onClick={() => {
                        void (async () => {
                          if (!id) return
                          const cached = publicListTokenQ.data
                          let tok: string
                          if (cached?.token && cached.expose_contact === publicShareExposeContact) {
                            tok = cached.token
                          } else {
                            try {
                              tok = await resolvePublicListToken(publicShareExposeContact)
                            } catch (e) {
                              toastError(e)
                              return
                            }
                          }
                          const url = `${window.location.origin}/pub/pos/${tok}`
                          void navigator.clipboard.writeText(url).then(
                            () => {
                              success('Public URL copied')
                              setShareChannelOpen(false)
                            },
                            () => {
                              toastError('Could not copy')
                              setShareChannelOpen(false)
                            },
                          )
                        })()
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
              ['openings', 'Approaches', null],
              ['tasks', 'Tasks', (tasksQ.data ?? []).length],
              ['events', 'Events', (positionCalendarEventsQ.data ?? []).length],
              ['comments', 'Comments', (viewerCommentsQ.data ?? []).length],
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
                if (error) toastError(error)
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
              readOnlyFormat={formatIlsAmountDisplay}
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
                if (error) toastError(error)
                else {
                  setSalaryBudgetStr(parsed != null ? String(parsed) : '')
                  success('Saved')
                  await invalidateAll()
                }
              }}
            />
            <DetailHoverField
              label="Opened on"
              value={openedAtStr}
              inputType="date"
              readOnlyFormat={formatClosureDateDisplay}
              onSave={async (next) => {
                const t = next.trim()
                const created = (position as { created_at?: string }).created_at
                const fallbackOpened =
                  created && /^\d{4}-\d{2}-\d{2}/.test(created)
                    ? created.slice(0, 10)
                    : format(new Date(), 'yyyy-MM-dd')
                const v = t === '' ? fallbackOpened : t
                if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) {
                  toastError('Use YYYY-MM-DD.')
                  return
                }
                const { error } = await supabase!
                  .from('positions')
                  .update({ opened_at: v })
                  .eq('id', id!)
                  .eq('user_id', user!.id)
                if (error) toastError(error)
                else {
                  setOpenedAtStr(v)
                  success('Saved')
                  await invalidateAll()
                }
              }}
            />
            <DetailHoverField
              label="Closure date (optional)"
              value={closureDateStr}
              inputType="date"
              readOnlyFormat={formatClosureDateDisplay}
              onSave={async (next) => {
                const t = next.trim()
                const v = t === '' ? null : t
                if (v && !/^\d{4}-\d{2}-\d{2}$/.test(v)) {
                  toastError('Use YYYY-MM-DD or leave empty.')
                  return
                }
                const { error } = await supabase!
                  .from('positions')
                  .update({ closure_date: v })
                  .eq('id', id!)
                  .eq('user_id', user!.id)
                if (error) toastError(error)
                else {
                  setClosureDateStr(v ?? '')
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
                if (error) toastError(error)
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
                if (error) toastError(error)
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
                if (error) toastError(error)
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
                if (error) toastError(error)
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
                          pipelineKanbanCandidates.map((c) => renderPipelineKanbanCard(c, null, 0))
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
                      <div className="relative">
                        <h3 className={pipelineStageHeadingClass}>{st.name}</h3>
                        <button
                          type="button"
                          className="text-ink-muted hover:text-rose-600 absolute top-0 right-0 rounded-lg p-1 transition hover:bg-rose-50 dark:hover:bg-rose-950/30 dark:hover:text-rose-400"
                          title={`Delete stage “${st.name}”`}
                          aria-label={`Delete stage ${st.name}`}
                          disabled={deleteStageMut.isPending}
                          onClick={() => {
                            if (window.confirm(`Delete stage “${st.name}”?`)) void deleteStageMut.mutateAsync(st.id)
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden />
                        </button>
                      </div>
                      <div className="flex flex-1 flex-col gap-2 overflow-y-auto pt-1">
                        {cards.length === 0 ? (
                          <p className="text-ink-muted px-1 py-3 text-xs">None — drop a candidate here.</p>
                        ) : (
                          cards.map((c) => {
                            const cid = nestedCandidate(c.candidates)?.id
                            const key = cid ? `${cid}:${st.id}` : ''
                            const upcoming = cid ? positionActiveStageEventsMap.get(key) : undefined
                            const ended = cid ? positionPastStageEventsMap.get(key) : undefined
                            const pipelineEvent =
                              upcoming != null
                                ? { title: upcoming.title, variant: 'upcoming' as const }
                                : ended != null
                                  ? { title: ended.title, variant: 'past' as const }
                                  : null
                            return renderPipelineKanbanCard(c, pipelineEvent, stageIdx)
                          })
                        )}
                      </div>
                    </div>
                  )
                })
              })()}
            </div>

            <section className="border-line rounded-2xl border bg-white/50 p-4 shadow-sm dark:border-line-dark dark:bg-stone-900/40">
              <h3 className={pipelineSubsectionHeadingClass}>Hired</h3>
              <p className="text-ink-muted mt-1 px-1 text-xs dark:text-stone-500">
                Candidates marked hired on this role — most recent first.
              </p>
              <ul className="mt-4 space-y-3">
                {hiredCandidates.length === 0 ? (
                  <li className="text-ink-muted text-sm">No hired candidates on this role yet.</li>
                ) : (
                  hiredCandidates.map(renderHiredAssignmentCard)
                )}
              </ul>
            </section>

            <section className="border-line rounded-2xl border bg-white/50 p-4 shadow-sm dark:border-line-dark dark:bg-stone-900/40">
              <h3 className={pipelineSubsectionHeadingClass}>Rejected &amp; withdrawn</h3>
              <p className="text-ink-muted mt-1 px-1 text-xs dark:text-stone-500">
                Candidates who are no longer in progress on this role — most recent first.
              </p>
              <ul className="mt-4 space-y-3">
                {rejectedWithdrawnCandidates.length === 0 ? (
                  <li className="text-ink-muted text-sm">No rejected or withdrawn candidates on this role yet.</li>
                ) : (
                  rejectedWithdrawnCandidates.map(renderRejectedWithdrawnCard)
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
                className={`border-line fixed top-0 right-0 z-50 flex h-full w-full max-w-full flex-col border-l bg-white shadow-2xl transition-transform duration-300 ease-out sm:max-w-[min(100vw-8px,54.6rem)] dark:border-line-dark dark:bg-stone-900 ${
                  candidateDrawerWidthPx == null ? '' : 'sm:max-w-none'
                } ${drawerPanelEntered ? 'translate-x-0' : 'translate-x-full'}`}
                style={
                  candidateDrawerWidthPx != null
                    ? { width: candidateDrawerWidthPx, maxWidth: 'min(100vw - 8px, 100%)' }
                    : undefined
                }
                aria-label="Candidate details"
              >
                <div className="min-h-0 flex-1 overflow-y-auto">
                  {(() => {
                    const c = drawerCandidate
                    const prof = nestedCandidate(c.candidates)
                    const candId = prof?.id
                    const displayName = prof?.full_name ?? 'Unnamed'
                    const resumePath = prof?.resume_storage_path ?? null
                    const photoSignedUrl = candidateDrawerPhotoSignedUrlQ.data ?? null
                    const email = prof?.email?.trim() || null
                    const phone = prof?.phone?.trim() || null
                    const linkedinRaw = prof?.linkedin?.trim() || null
                    const linkedinUrl = linkedinHref(prof?.linkedin ?? null)
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
                    const candidateCalendarRows = (positionCalendarEventsQ.data ?? [])
                      .filter((ev) => ev.candidate_id === candId)
                      .sort(
                        (a, b) =>
                          new Date(b.starts_at).getTime() - new Date(a.starts_at).getTime(),
                      )
                    const eventCount = candidateCalendarRows.length
                    const salaryTitleSuffix = (() => {
                      const t = salaryRaw.trim()
                      if (!t) return null as string | null
                      const p = parseIlsAmountInput(t)
                      if (typeof p === 'number') return `₪${p.toLocaleString('he-IL')}`
                      return `(${t})`
                    })()
                    const posBudget = (position as { salary_budget?: number | null }).salary_budget
                    const budgetDisplay =
                      posBudget != null && Number.isFinite(Number(posBudget))
                        ? `₪${Number(posBudget).toLocaleString('he-IL')}`
                        : '—'
                    const positionOpenedShort = formatOpenedAtShort(
                      (position as { opened_at?: string | null }).opened_at,
                    )
                    return (
                      <>
                        <span
                          ref={drawerNameMeasureRef}
                          className="text-stitch-on-surface pointer-events-none fixed top-0 left-0 z-[-1] whitespace-nowrap text-xl font-bold tracking-tight opacity-0 dark:text-stone-100"
                          aria-hidden
                        >
                          {drawerNameForMeasure}
                        </span>
                        <input
                          ref={candidatePhotoInputRef}
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
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
                        <div className="border-b border-stone-200/90 relative px-4 pb-3 pt-[max(1.25rem,env(safe-area-inset-top))] dark:border-stone-700 sm:pt-5">
                          <button
                            type="button"
                            className="text-ink-muted hover:text-rose-600 absolute top-3.5 right-2 rounded-lg p-2 transition hover:bg-rose-50 dark:hover:bg-rose-950/30 dark:hover:text-rose-400 sm:top-4"
                            title="Remove from this role"
                            aria-label="Remove candidate from this role"
                            disabled={archiveAssignmentOnRole.isPending}
                            onClick={() => {
                              if (
                                window.confirm(
                                  'Remove this candidate from this role? They stay in your pool but will no longer appear here.',
                                )
                              ) {
                                void archiveAssignmentOnRole.mutateAsync(c.id)
                              }
                            }}
                          >
                            <Trash2 className="h-4 w-4" aria-hidden />
                          </button>
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-5">
                            <div className="order-2 flex w-full shrink-0 flex-col items-stretch gap-2 sm:order-1 sm:min-w-[11rem] sm:max-w-[13rem] sm:w-44">
                              <div className="group/avatar relative h-[4.5rem] w-[4.5rem] shrink-0 sm:mx-auto">
                                <div className="flex h-[4.5rem] w-[4.5rem] items-center justify-center overflow-hidden rounded-full border border-stone-200 bg-stone-100 text-base font-bold text-stone-600 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-300">
                                  {photoSignedUrl && !drawerAvatarBroken ? (
                                    <img
                                      src={photoSignedUrl}
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
                              <div className="relative w-full shrink-0" ref={drawerAssignStatusRef}>
                                <button
                                  type="button"
                                  onClick={() => setDrawerAssignStatusOpen((o) => !o)}
                                  disabled={patchAssignmentStatus.isPending}
                                  className={`border-line flex h-8 w-full shrink-0 items-center justify-between gap-1 rounded-lg border px-2 text-xs font-bold shadow-sm transition dark:border-line-dark ${
                                    drawerCandidate!.status === 'in_progress'
                                      ? 'border-emerald-200/90 bg-gradient-to-br from-emerald-50 to-white text-emerald-900 dark:border-emerald-800/80 dark:from-emerald-950/60 dark:to-stone-900 dark:text-emerald-200'
                                      : drawerCandidate!.status === 'hired'
                                        ? 'border-amber-200/90 bg-gradient-to-br from-emerald-100 via-amber-50/90 to-white text-emerald-950 dark:border-emerald-700/70 dark:from-emerald-950/55 dark:via-amber-950/25 dark:to-stone-900 dark:text-emerald-100'
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
                                    <Play className="h-3.5 w-3.5 shrink-0 fill-current text-emerald-600 dark:text-emerald-400" aria-hidden />
                                  ) : drawerCandidate!.status === 'hired' ? (
                                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
                                  ) : drawerCandidate!.status === 'rejected' ? (
                                    <Ban className="h-3.5 w-3.5 shrink-0 text-rose-600 dark:text-rose-300" aria-hidden />
                                  ) : (
                                    <Pause className="h-3.5 w-3.5 shrink-0 text-stone-600 dark:text-stone-400" aria-hidden />
                                  )}
                                  <span className="min-w-0 flex-1 text-left whitespace-nowrap">
                                    {formatAssignmentStatus(drawerCandidate!.status)}
                                  </span>
                                  <ChevronDown className="h-3 w-3 shrink-0 opacity-60" aria-hidden />
                                </button>
                                {drawerAssignStatusOpen ? (
                                  <div
                                    role="listbox"
                                    className="border-line absolute top-full left-0 right-0 z-[60] mt-1 rounded-xl border bg-white py-1 shadow-xl dark:border-line-dark dark:bg-stone-900 sm:left-auto sm:right-0 sm:min-w-[12rem]"
                                  >
                                    {(
                                      [
                                        { v: 'in_progress' as const, label: 'In progress', icon: Play, cls: 'text-emerald-800 dark:text-emerald-300' },
                                        { v: 'hired' as const, label: 'Hired', icon: CheckCircle2, cls: 'text-emerald-800 dark:text-emerald-300' },
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
                                          if (v === 'in_progress') {
                                            if (!window.confirm('Move this assignment back to in progress?')) return
                                            void patchAssignmentStatus.mutateAsync({
                                              positionCandidateId: drawerCandidate!.id,
                                              nextStatus: v,
                                              closeTasks: false,
                                            })
                                            return
                                          }
                                          if (v === 'hired') {
                                            void patchAssignmentStatus.mutateAsync({
                                              positionCandidateId: drawerCandidate!.id,
                                              nextStatus: 'hired',
                                              closeTasks: true,
                                            })
                                            return
                                          }
                                          setOutcomeReasonId('')
                                          setOutcomeReasonOther('')
                                          setOutcomeCloseTasks(true)
                                          setAssignmentOutcomeModal({
                                            nextStatus: v,
                                            positionCandidateId: drawerCandidate!.id,
                                            source: 'drawer',
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
                              <button
                                type="button"
                                onClick={() => openCandidateScheduleModal()}
                                className="border-line flex h-8 w-full shrink-0 items-center justify-center gap-1.5 rounded-lg border bg-white px-2 text-[11px] font-bold text-[#006384] shadow-sm transition hover:bg-stone-50 dark:border-line-dark dark:bg-stone-900 dark:text-cyan-300 dark:hover:bg-stone-800"
                                title="Schedule interview on Overview calendar"
                              >
                                <CalendarPlus className="h-3.5 w-3.5 shrink-0 opacity-90" aria-hidden />
                                Schedule
                              </button>
                              <div className="min-w-0 w-full">
                                <select
                                  className="w-full min-w-0 cursor-pointer rounded-md border border-stone-200/70 bg-stone-50/90 py-1 pl-1.5 pr-7 text-[11px] font-medium text-stone-700 shadow-sm dark:border-stone-600 dark:bg-stone-900/70 dark:text-stone-200"
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
                            </div>
                            <div className="order-1 min-w-0 w-full flex-1 sm:order-2 sm:pl-1 md:pl-3">
                              <div className="flex min-w-0 flex-col gap-2">
                                <div className="flex min-h-[4.5rem] flex-col justify-center gap-1 pr-10 sm:pr-12">
                                  <div className="group/name flex min-w-0 w-full flex-col gap-1">
                                    <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
                                    {drawerFieldEdit === 'name' && candId ? (
                                      <>
                                        <input
                                          value={drawerFieldDraft}
                                          onChange={(e) => setDrawerFieldDraft(e.target.value)}
                                          className="border-line text-stitch-on-surface min-w-0 max-w-full flex-1 rounded-lg border bg-white px-2 py-1 text-xl font-bold tracking-tight sm:max-w-[16rem] sm:flex-none dark:border-line-dark dark:bg-stone-900 dark:text-stone-100"
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
                                    ) : drawerFieldEdit === 'salary' && candId ? (
                                      <>
                                        <span className="text-stitch-on-surface shrink-0 text-xl font-bold tracking-tight dark:text-stone-100">
                                          {displayName}
                                        </span>
                                        <input
                                          value={drawerFieldDraft}
                                          onChange={(e) => setDrawerFieldDraft(e.target.value)}
                                          className="border-line text-stitch-on-surface min-w-0 max-w-full flex-1 rounded-lg border bg-white px-2 py-1 text-sm font-semibold tabular-nums sm:max-w-[12rem] dark:border-line-dark dark:bg-stone-900 dark:text-stone-100"
                                          placeholder="₪ amount"
                                          autoFocus
                                        />
                                        <button
                                          type="button"
                                          className="rounded-lg bg-emerald-600 p-1.5 text-white hover:bg-emerald-700"
                                          aria-label="Save salary expectation"
                                          onClick={() => {
                                            const t = drawerFieldDraft.trim()
                                            let toSave: string | null = t
                                            if (t) {
                                              const p = parseIlsAmountInput(t)
                                              if (p === 'invalid') {
                                                toastError('Enter a valid amount or leave empty.')
                                                return
                                              }
                                              if (p !== null) toSave = String(p)
                                            } else toSave = null
                                            void saveCandidateFromDrawer(candId, { salary_expectation: toSave })
                                          }}
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
                                        <div className="text-stitch-on-surface flex min-w-0 w-full max-w-full flex-wrap items-baseline gap-x-2 gap-y-0.5 text-lg font-bold tracking-tight sm:text-xl dark:text-stone-100">
                                          <h2 className="min-w-0 max-w-full break-words">{displayName}</h2>
                                          {salaryTitleSuffix ? (
                                            <button
                                              type="button"
                                              className="shrink-0 rounded px-0.5 font-bold tabular-nums text-stone-600 transition hover:bg-stone-200/80 hover:text-stone-800 dark:text-stone-400 dark:hover:bg-stone-700 dark:hover:text-stone-200"
                                              aria-label="Edit expected salary"
                                              title="Edit expected salary"
                                              onClick={() => {
                                                setDrawerFieldDraft(salaryRaw)
                                                setDrawerFieldEdit('salary')
                                              }}
                                            >
                                              {salaryTitleSuffix}
                                            </button>
                                          ) : (
                                            <button
                                              type="button"
                                              className="text-ink-muted shrink-0 rounded px-1 text-sm font-semibold tabular-nums underline decoration-dotted underline-offset-2 hover:text-stone-800 dark:hover:text-stone-200"
                                              aria-label="Add expected salary"
                                              title="Expected salary for this candidate"
                                              onClick={() => {
                                                setDrawerFieldDraft(salaryRaw)
                                                setDrawerFieldEdit('salary')
                                              }}
                                            >
                                              · Add salary
                                            </button>
                                          )}
                                        </div>
                                        <button
                                          type="button"
                                          className="text-ink-muted shrink-0 rounded-lg p-1.5 opacity-100 transition hover:bg-stone-200/90 hover:text-ink sm:opacity-0 sm:group-hover/name:opacity-100 dark:hover:bg-stone-600 dark:hover:text-stone-100"
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
                                          className="text-stitch-on-surface min-w-0 flex-1 break-all hover:text-[#006384] sm:break-normal sm:truncate dark:text-stone-100 dark:hover:text-cyan-300"
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
                                          className="text-stitch-on-surface min-w-0 flex-1 break-all hover:text-[#006384] sm:break-normal sm:truncate dark:text-stone-100 dark:hover:text-cyan-300"
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
                                  {drawerFieldEdit === 'linkedin' && candId ? (
                                    <>
                                      <input
                                        value={drawerFieldDraft}
                                        onChange={(e) => setDrawerFieldDraft(e.target.value)}
                                        className="border-line text-stitch-on-surface min-w-0 flex-1 rounded-lg border bg-white px-2 py-1 dark:border-line-dark dark:bg-stone-900 dark:text-stone-100"
                                        type="url"
                                        placeholder="linkedin.com/in/…"
                                        autoFocus
                                      />
                                      <button
                                        type="button"
                                        className="rounded-lg bg-emerald-600 p-1.5 text-white hover:bg-emerald-700"
                                        aria-label="Save LinkedIn"
                                        onClick={() =>
                                          void saveCandidateFromDrawer(candId, { linkedin: drawerFieldDraft.trim() || null })
                                        }
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
                                      {linkedinUrl ? (
                                        <a
                                          href={linkedinUrl}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          title={linkedinRaw ?? undefined}
                                          className="text-stitch-on-surface min-w-0 flex-1 break-all hover:text-[#006384] sm:break-normal sm:truncate dark:text-stone-100 dark:hover:text-cyan-300"
                                        >
                                          {linkedinRaw}
                                        </a>
                                      ) : (
                                        <span className="text-ink-muted flex-1 dark:text-stone-500">—</span>
                                      )}
                                      <button
                                        type="button"
                                        className="text-ink-muted shrink-0 rounded-lg p-1.5 opacity-0 transition hover:bg-stone-200/90 hover:text-ink group-hover/linkedin:opacity-100 dark:hover:bg-stone-600 dark:hover:text-stone-100"
                                        aria-label="Edit LinkedIn"
                                        onClick={() => {
                                          setDrawerFieldDraft(linkedinRaw ?? '')
                                          setDrawerFieldEdit('linkedin')
                                        }}
                                      >
                                        <Pencil className="h-4 w-4" aria-hidden />
                                      </button>
                                    </>
                                  )}
                                </div>
                                {!salaryTitleSuffix ? (
                                  <div className="group/salary flex min-w-0 items-center gap-2">
                                    <span
                                      className="text-ink-muted w-4 shrink-0 text-center text-xs font-bold opacity-80 dark:text-stone-500"
                                      aria-hidden
                                    >
                                      ₪
                                    </span>
                                    {drawerFieldEdit === 'salary' && candId ? (
                                      <>
                                        <input
                                          value={drawerFieldDraft}
                                          onChange={(e) => setDrawerFieldDraft(e.target.value)}
                                          className="border-line text-stitch-on-surface min-w-0 flex-1 rounded-lg border bg-white px-2 py-1 dark:border-line-dark dark:bg-stone-900 dark:text-stone-100"
                                          placeholder="Expected salary (ILS)"
                                          autoFocus
                                        />
                                        <button
                                          type="button"
                                          className="rounded-lg bg-emerald-600 p-1.5 text-white hover:bg-emerald-700"
                                          aria-label="Save salary expectation"
                                          onClick={() => {
                                            const t = drawerFieldDraft.trim()
                                            let toSave: string | null = t
                                            if (t) {
                                              const p = parseIlsAmountInput(t)
                                              if (p === 'invalid') {
                                                toastError('Enter a valid amount or leave empty.')
                                                return
                                              }
                                              if (p !== null) toSave = String(p)
                                            } else toSave = null
                                            void saveCandidateFromDrawer(candId, { salary_expectation: toSave })
                                          }}
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
                                        <span className="text-ink-muted flex-1 dark:text-stone-500">—</span>
                                        <button
                                          type="button"
                                          className="text-ink-muted shrink-0 rounded-lg p-1.5 opacity-0 transition hover:bg-stone-200/90 hover:text-ink group-hover/salary:opacity-100 dark:hover:bg-stone-600 dark:hover:text-stone-100"
                                          aria-label="Add expected salary"
                                          onClick={() => {
                                            setDrawerFieldDraft(salaryRaw)
                                            setDrawerFieldEdit('salary')
                                          }}
                                        >
                                          <Pencil className="h-4 w-4" aria-hidden />
                                        </button>
                                      </>
                                    )}
                                  </div>
                                ) : null}
                              </div>
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-1 border-b border-stone-100 px-3 py-2 dark:border-stone-700">
                          {(
                            [
                              { id: 'overview' as const, label: 'Overview' },
                              { id: 'events' as const, label: `Events (${eventCount})` },
                              { id: 'files' as const, label: `Files (${fileCount})` },
                              { id: 'notes' as const, label: `Notes (${commentRows.length})` },
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
                            <div className="border-line mb-4 overflow-hidden rounded-2xl border bg-gradient-to-br from-stone-50 via-white to-stone-50/90 text-sm shadow-sm dark:border-line-dark dark:from-stone-900/90 dark:via-stone-900 dark:to-stone-950/80">
                              <div className="border-b border-stone-200/70 px-4 py-3 dark:border-stone-600/60">
                                <p className="text-stitch-on-surface text-[0.95rem] font-bold leading-snug tracking-tight dark:text-stone-100">
                                  {position.title}
                                </p>
                                <p className="text-ink-muted mt-1 text-xs font-semibold dark:text-stone-400">
                                  {company?.name ?? '—'}
                                </p>
                              </div>
                              <dl className="divide-y divide-stone-100 px-4 py-1 text-xs dark:divide-stone-700/80">
                                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 py-2">
                                  <dt className="text-ink-muted font-medium dark:text-stone-500">Opened</dt>
                                  <dd className="text-stitch-on-surface font-semibold tabular-nums dark:text-stone-200">
                                    {positionOpenedShort}
                                  </dd>
                                </div>
                                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 py-2">
                                  <dt className="text-ink-muted font-medium dark:text-stone-500">Created on</dt>
                                  <dd className="text-stitch-on-surface font-semibold tabular-nums dark:text-stone-200">
                                    {c.created_at
                                      ? format(new Date(c.created_at as string), 'MMM d, yyyy')
                                      : '—'}
                                  </dd>
                                </div>
                                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 py-2">
                                  <dt className="text-ink-muted font-medium dark:text-stone-500">Role budget</dt>
                                  <dd className="text-stitch-on-surface text-sm font-bold tabular-nums dark:text-stone-100">
                                    {budgetDisplay}
                                  </dd>
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

                        {candidateDrawerPanel === 'events' ? (
                          <div className="px-5 py-4">
                            <p className="text-ink-muted mb-3 text-xs dark:text-stone-400">
                              Your calendar events linked to this candidate (scheduled from this role or Overview).
                            </p>
                            {positionCalendarEventsQ.isLoading ? (
                              <p className="text-ink-muted text-sm">Loading…</p>
                            ) : candidateCalendarRows.length === 0 ? (
                              <p className="text-ink-muted text-sm">
                                No calendar events yet. Use <span className="font-semibold">Schedule</span> above or add
                                an event on Overview.
                              </p>
                            ) : (
                              <ul className="space-y-3">
                                {candidateCalendarRows.map((ev) => {
                                  const endMs = ev.ends_at ? new Date(ev.ends_at).getTime() : null
                                  const now = Date.now()
                                  const isUpcoming =
                                    endMs != null ? endMs > now : new Date(ev.starts_at).getTime() > now
                                  const dotClass = isUpcoming
                                    ? 'bg-emerald-500'
                                    : PIPELINE_STAGE_EVENT_DOT_PAST
                                  const stageName = nestedStageName(
                                    ev.position_stages as PositionCandidateJunction['position_stages'],
                                  )
                                  const startLabel = format(new Date(ev.starts_at), 'MMM d, yyyy · h:mm a')
                                  const endLabel =
                                    ev.ends_at != null
                                      ? format(new Date(ev.ends_at), 'MMM d, yyyy · h:mm a')
                                      : null
                                  return (
                                    <li
                                      key={ev.id}
                                      className="border-line flex gap-3 rounded-2xl border bg-white/80 px-3 py-3 dark:border-line-dark dark:bg-stone-900/60"
                                    >
                                      <span
                                        className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${dotClass}`}
                                        title={isUpcoming ? 'Upcoming' : 'Past'}
                                        aria-hidden
                                      />
                                      <div className="min-w-0 flex-1">
                                        <p className="text-stitch-on-surface text-sm font-semibold leading-snug dark:text-stone-100">
                                          {ev.title || 'Event'}
                                        </p>
                                        <p className="text-ink-muted mt-1 text-xs font-medium dark:text-stone-400">
                                          Stage: {stageName}
                                        </p>
                                        <p className="text-ink-muted mt-1 text-xs tabular-nums dark:text-stone-500">
                                          {endLabel ? `${startLabel} → ${endLabel}` : startLabel}
                                        </p>
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

                        {candidateDrawerPanel === 'notes' ? (
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
              {candidateSchedule && highlightCandidate ? (
                <CandidateInterviewScheduleModal
                  key={candidateScheduleModalKey}
                  open
                  initial={candidateSchedule}
                  onClose={() => setCandidateSchedule(null)}
                  stages={stagesQ.data ?? []}
                  candidateId={highlightCandidate}
                  candidateName={
                    nestedCandidate(drawerCandidate?.candidates ?? null)?.full_name?.trim() || 'Candidate'
                  }
                  positionTitle={position?.title?.trim() ?? ''}
                  positionId={id!}
                />
              ) : null}
            </>
          ) : null}
        </div>
      ) : null}

      {tab === 'openings' ? (
        <section className="border-line rounded-2xl border border-stone-200/80 bg-white/70 p-5 dark:border-line-dark dark:bg-stone-900/45">
          <h2 className="text-stitch-on-surface text-lg font-bold dark:text-stone-100">Approaches</h2>
          <p className="text-ink-muted mt-1 text-sm dark:text-stone-400">Welcome messages for outreach — copy when you need them.</p>
          <form
            className="mt-4 flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault()
              void savePos.mutateAsync()
            }}
          >
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
              Save approaches
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

      {tab === 'events' ? (
        <section className="border-line max-w-3xl rounded-2xl border border-stone-200/80 bg-white/70 p-5 dark:border-line-dark dark:bg-stone-900/45">
          <h2 className="text-stitch-on-surface text-lg font-extrabold tracking-tight dark:text-stone-100">
            Events on this role
          </h2>
          <p className="text-ink-muted mt-2 text-sm dark:text-stone-400">
            Calendar interviews for candidates assigned here. Upcoming events have not ended yet; previous events have
            passed their end time.
          </p>
          {!positionCalendarCandidateIdsKey.length ? (
            <p className="text-ink-muted mt-6 text-sm">Add candidates to this role to track scheduled interviews.</p>
          ) : positionCalendarEventsQ.isLoading ? (
            <p className="text-ink-muted mt-6 text-sm">Loading…</p>
          ) : positionCalendarEventsQ.isError ? (
            <p className="mt-6 text-sm text-rose-600 dark:text-rose-400">Could not load events.</p>
          ) : (
            <div className="mt-6 space-y-10">
              <div>
                <h3 className="text-ink border-b border-stone-200/90 pb-2 text-xs font-extrabold uppercase tracking-wide dark:border-stone-600 dark:text-stone-200">
                  Upcoming events
                </h3>
                {positionEventsForTab.upcoming.length === 0 ? (
                  <p className="text-ink-muted mt-4 text-sm">No upcoming events.</p>
                ) : (
                  <ul className="mt-4 space-y-3">
                    {positionEventsForTab.upcoming.map((ev) => (
                      <li
                        key={ev.id}
                        className="border-line rounded-xl border border-stone-200/90 bg-white/90 px-4 py-3 dark:border-line-dark dark:bg-stone-900/60"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <p className="text-stitch-on-surface min-w-0 flex-1 font-semibold dark:text-stone-100">
                            {ev.title}
                          </p>
                          <time
                            className="text-ink-muted shrink-0 text-xs tabular-nums dark:text-stone-500"
                            dateTime={ev.starts_at}
                          >
                            {format(new Date(ev.starts_at), 'MMM d · h:mm a')}
                            {ev.ends_at ? ` – ${format(new Date(ev.ends_at), 'h:mm a')}` : ''}
                          </time>
                        </div>
                        <div className="text-ink-muted mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs">
                          <span>
                            <span className="font-semibold text-stone-600 dark:text-stone-400">Candidate:</span>{' '}
                            {ev.candidate_id ? (
                              <Link
                                className="font-medium text-[#006384] hover:underline dark:text-cyan-300"
                                to={`/positions/${id}?tab=candidates&candidate=${encodeURIComponent(ev.candidate_id)}`}
                              >
                                {positionCalendarCandidateLabel(ev)}
                              </Link>
                            ) : (
                              '—'
                            )}
                          </span>
                          <span>
                            <span className="font-semibold text-stone-600 dark:text-stone-400">Stage:</span>{' '}
                            {positionCalendarStageLabel(ev)}
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <h3 className="text-ink border-b border-stone-200/90 pb-2 text-xs font-extrabold uppercase tracking-wide dark:border-stone-600 dark:text-stone-200">
                  Previous events
                </h3>
                {positionEventsForTab.previous.length === 0 ? (
                  <p className="text-ink-muted mt-4 text-sm">No previous events.</p>
                ) : (
                  <ul className="mt-4 space-y-3">
                    {positionEventsForTab.previous.map((ev) => (
                      <li
                        key={ev.id}
                        className="border-line rounded-xl border border-stone-200/80 bg-stone-50/90 px-4 py-3 dark:border-line-dark dark:bg-stone-900/40"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <p className="text-stitch-on-surface min-w-0 flex-1 font-semibold dark:text-stone-200">
                            {ev.title}
                          </p>
                          <time
                            className="text-ink-muted shrink-0 text-xs tabular-nums dark:text-stone-500"
                            dateTime={ev.starts_at}
                          >
                            {format(new Date(ev.starts_at), 'MMM d · h:mm a')}
                            {ev.ends_at ? ` – ${format(new Date(ev.ends_at), 'h:mm a')}` : ''}
                          </time>
                        </div>
                        <div className="text-ink-muted mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs">
                          <span>
                            <span className="font-semibold text-stone-600 dark:text-stone-400">Candidate:</span>{' '}
                            {ev.candidate_id ? (
                              <Link
                                className="font-medium text-[#006384] hover:underline dark:text-cyan-300"
                                to={`/positions/${id}?tab=candidates&candidate=${encodeURIComponent(ev.candidate_id)}`}
                              >
                                {positionCalendarCandidateLabel(ev)}
                              </Link>
                            ) : (
                              '—'
                            )}
                          </span>
                          <span>
                            <span className="font-semibold text-stone-600 dark:text-stone-400">Stage:</span>{' '}
                            {positionCalendarStageLabel(ev)}
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </section>
      ) : null}

      {tab === 'comments' ? (
        <section className="border-line max-w-3xl rounded-2xl border border-stone-200/80 bg-white/70 p-5 dark:border-line-dark dark:bg-stone-900/45">
          <h2 className="text-stitch-on-surface text-lg font-extrabold tracking-tight dark:text-stone-100">
            Comments from public link viewers
          </h2>
          <p className="text-ink-muted mt-2 text-sm dark:text-stone-400">
            Messages left on the shared pipeline appear here. Your replies are logged as notes on the assignment and in
            Activity.
          </p>
          {viewerCommentsQ.isLoading ? (
            <p className="text-ink-muted mt-6 text-sm">Loading…</p>
          ) : viewerCommentsQ.isError ? (
            <p className="mt-6 text-sm text-rose-600 dark:text-rose-400">Could not load viewer comments.</p>
          ) : (viewerCommentsQ.data ?? []).length === 0 ? (
            <p className="text-ink-muted mt-6 text-sm">No viewer comments yet.</p>
          ) : (
            <ul className="mt-6 space-y-6">
              {(viewerCommentsQ.data ?? []).map((row) => {
                const draft = commentsTabDrafts[row.id] ?? ''
                return (
                  <li
                    key={row.id}
                    className="border-line rounded-xl border border-stone-200/90 bg-white/90 p-4 dark:border-line-dark dark:bg-stone-900/60"
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <Link
                        to={`/positions/${id}?tab=candidates&candidate=${encodeURIComponent(row.candidate_id)}`}
                        className="text-sm font-bold text-[#006384] underline-offset-2 hover:underline dark:text-cyan-300"
                      >
                        {row.candidate_full_name}
                      </Link>
                      <time
                        className="text-ink-muted text-xs tabular-nums dark:text-stone-500"
                        dateTime={row.created_at}
                      >
                        {format(new Date(row.created_at), 'MMM d, yyyy · h:mm a')}
                      </time>
                    </div>
                    <p className="text-stitch-on-surface mt-3 whitespace-pre-wrap text-sm leading-relaxed dark:text-stone-100">
                      {row.body}
                    </p>
                    <label className="mt-4 flex flex-col gap-1 text-xs font-semibold text-stone-600 dark:text-stone-400">
                      Your reply
                      <textarea
                        value={draft}
                        onChange={(e) =>
                          setCommentsTabDrafts((prev) => ({ ...prev, [row.id]: e.target.value }))
                        }
                        rows={3}
                        placeholder="Reply as an internal note…"
                        className="border-line rounded-xl border px-3 py-2 text-sm font-normal text-stone-800 placeholder:text-stone-400 dark:border-line-dark dark:bg-stone-900/50 dark:text-stone-100 dark:placeholder:text-stone-500"
                      />
                    </label>
                    <div className="mt-2 flex justify-end">
                      <button
                        type="button"
                        disabled={!draft.trim() || replyFromCommentsTab.isPending}
                        className="bg-accent text-stone-50 rounded-full px-4 py-2 text-sm font-semibold disabled:opacity-50"
                        onClick={() =>
                          void replyFromCommentsTab.mutateAsync({
                            messageId: row.id,
                            text: draft,
                            candidateId: row.candidate_id,
                            positionCandidateId: row.position_candidate_id,
                          })
                        }
                      >
                        {replyFromCommentsTab.isPending ? 'Sending…' : 'Send reply'}
                      </button>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      ) : null}

      {tab === 'activity' ? (
        <section className="space-y-5">
          <div className="space-y-6">
            {activityByDay.length === 0 ? (
              <p className="text-ink-muted text-sm">No activity yet.</p>
            ) : (
              activityByDay.map((group) => (
                <div key={group.dayKey}>
                  <h3 className="text-ink border-b border-stone-200/90 pb-2 text-xs font-extrabold tracking-wide uppercase dark:border-stone-600 dark:text-stone-200">
                    {group.dayLabel}
                  </h3>
                  <ul className="mt-4 space-y-0">
                    {group.rows.map((a) => {
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
                      const whoLabel =
                        a.candidate_id != null ? (candidateNameById.get(a.candidate_id) ?? 'Candidate') : null
                      const showSubtitle =
                        Boolean(a.subtitle?.trim()) &&
                        a.event_type !== 'candidate_status_changed' &&
                        a.event_type !== 'candidate_stage_changed'
                      return (
                        <li key={a.id} className="relative flex gap-3 pb-7 last:pb-0">
                          <div className="flex flex-col items-center">
                            <span className={`z-1 h-4 w-4 rounded-full ${deco.dot}`} />
                            <span className={`mt-0.5 w-0.5 flex-1 min-h-6 rounded-full ${deco.rail}`} />
                          </div>
                          <div className="min-w-0 flex-1 pt-0.5">
                            <p className="text-stitch-on-surface text-sm font-semibold leading-snug dark:text-stone-100">
                              {primary}
                            </p>
                            {showSubtitle ? (
                              <p className="text-ink-muted mt-1 whitespace-pre-wrap text-xs leading-relaxed dark:text-stone-400">
                                {a.subtitle}
                              </p>
                            ) : null}
                            <div className="mt-2 flex flex-wrap items-center gap-2">
                              <span
                                className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${pillClass}`}
                              >
                                {pillLabel}
                              </span>
                              <time className="text-ink-muted text-xs tabular-nums" dateTime={a.created_at}>
                                {format(new Date(a.created_at), 'MMM d, yyyy · h:mm a')}
                              </time>
                            </div>
                            <div className="text-ink-muted mt-2 text-xs">
                              {a.candidate_id ? (
                                <Link
                                  to={`/candidates/${a.candidate_id}`}
                                  className="font-medium text-[#006384] hover:underline dark:text-cyan-300"
                                >
                                  {whoLabel}
                                </Link>
                              ) : (
                                <span>Role-wide</span>
                              )}
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

      <Modal
        open={terminalFinish != null}
        onClose={() => {
          setTerminalFinish(null)
          setTerminalClosureDate('')
        }}
        title={terminalFinish === 'succeeded' ? 'Mark role as succeeded' : 'Mark role as cancelled'}
      >
        {terminalFinish === 'succeeded' ? (
          <p className="text-ink-muted text-sm dark:text-stone-400">
            <strong className="text-stitch-on-surface font-semibold dark:text-stone-200">Please set the closure date</strong>{' '}
            if you know when this role closed — it keeps records clear and helps reporting. You can still continue without
            it and add it later under <strong className="font-semibold">Details</strong>.
          </p>
        ) : (
          <p className="text-ink-muted text-sm dark:text-stone-400">
            Optionally set a closure date for your records. You can skip this and add it later from Details.
          </p>
        )}
        <label className="mt-4 flex flex-col gap-1 text-sm font-medium">
          Closure date {terminalFinish === 'succeeded' ? '(recommended)' : '(optional)'}
          <input
            type="date"
            value={terminalClosureDate}
            onChange={(e) => setTerminalClosureDate(e.target.value)}
            className="border-line rounded-xl border px-3 py-2 dark:border-line-dark dark:bg-stone-900/50"
          />
        </label>
        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            className="border-line rounded-full border px-4 py-2 text-sm font-semibold dark:border-line-dark"
            onClick={() => {
              setTerminalFinish(null)
              setTerminalClosureDate('')
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={setPositionTerminal.isPending || !terminalFinish}
            className="bg-accent text-stone-50 rounded-full px-4 py-2 text-sm font-semibold disabled:opacity-50"
            onClick={() => {
              if (!terminalFinish) return
              if (terminalFinish === 'succeeded' && !terminalClosureDate.trim()) {
                const proceed = window.confirm(
                  'You have not set a closure date. It helps with records and reporting. Mark as succeeded without a date? You can add one later under Details.',
                )
                if (!proceed) return
              }
              const d = terminalClosureDate.trim()
              void setPositionTerminal.mutateAsync({
                next: terminalFinish,
                closureDate: d === '' ? null : d,
              })
            }}
          >
            {setPositionTerminal.isPending ? 'Saving…' : 'Confirm'}
          </button>
        </div>
      </Modal>

      <Modal
        open={assignmentOutcomeModal != null}
        onClose={() => {
          setAssignmentOutcomeModal(null)
          setOutcomeReasonId('')
          setOutcomeReasonOther('')
        }}
        title={
          assignmentOutcomeModal == null
            ? 'Assignment update'
            : assignmentOutcomeModal.nextStatus === 'rejected'
              ? 'Why was this assignment rejected?'
              : 'Why was this assignment withdrawn?'
        }
      >
        {assignmentOutcomeModal ? (
          <>
            <p className="text-ink-muted text-sm dark:text-stone-400">
              Choose the closest reason. It is stored on the activity timeline for your records.
            </p>
            <div className="mt-4 flex max-h-[min(50vh,16rem)] flex-col gap-2 overflow-y-auto pr-0.5">
              {(assignmentOutcomeModal.nextStatus === 'rejected'
                ? ASSIGNMENT_OUTCOME_REJECTED_REASONS
                : ASSIGNMENT_OUTCOME_WITHDRAWN_REASONS
              ).map((opt) => (
                <label
                  key={opt.id}
                  className={`flex cursor-pointer items-start gap-2 rounded-xl border px-3 py-2.5 text-sm transition ${
                    outcomeReasonId === opt.id
                      ? 'border-accent bg-accent/8 dark:bg-accent/15'
                      : 'border-stone-200 dark:border-stone-600'
                  }`}
                >
                  <input
                    type="radio"
                    name="outcome-reason"
                    className="border-line mt-1 accent-[#9b3e20] dark:border-stone-500"
                    checked={outcomeReasonId === opt.id}
                    onChange={() => setOutcomeReasonId(opt.id)}
                  />
                  <span className="text-stitch-on-surface dark:text-stone-100">{opt.label}</span>
                </label>
              ))}
            </div>
            {outcomeReasonId === 'other' ? (
              <label className="mt-3 flex flex-col gap-1 text-sm font-medium">
                Please specify
                <textarea
                  value={outcomeReasonOther}
                  onChange={(e) => setOutcomeReasonOther(e.target.value)}
                  rows={3}
                  className="border-line font-normal rounded-xl border px-3 py-2 dark:border-line-dark dark:bg-stone-900/50"
                  placeholder="Briefly explain…"
                />
              </label>
            ) : null}
            <label className="mt-4 flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="border-line rounded accent-[#9b3e20] dark:border-stone-500"
                checked={outcomeCloseTasks}
                onChange={(e) => setOutcomeCloseTasks(e.target.checked)}
              />
              Close open tasks linked to this assignment
            </label>
            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                className="border-line rounded-full border px-4 py-2 text-sm font-semibold dark:border-line-dark"
                onClick={() => {
                  setAssignmentOutcomeModal(null)
                  setOutcomeReasonId('')
                  setOutcomeReasonOther('')
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={patchAssignmentStatus.isPending || withdrawFromRole.isPending}
                className="bg-accent text-stone-50 rounded-full px-4 py-2 text-sm font-semibold disabled:opacity-50"
                onClick={() => {
                  if (!assignmentOutcomeModal) return
                  const opts =
                    assignmentOutcomeModal.nextStatus === 'rejected'
                      ? ASSIGNMENT_OUTCOME_REJECTED_REASONS
                      : ASSIGNMENT_OUTCOME_WITHDRAWN_REASONS
                  if (!outcomeReasonId) {
                    toastError('Select a reason')
                    return
                  }
                  const preset = opts.find((p) => p.id === outcomeReasonId)
                  let reasonText = ''
                  if (outcomeReasonId === 'other') {
                    const t = outcomeReasonOther.trim()
                    if (!t) {
                      toastError('Please describe the reason')
                      return
                    }
                    reasonText = `Other: ${t}`
                  } else {
                    reasonText = preset?.label ?? outcomeReasonId
                  }
                  const { nextStatus, positionCandidateId, source } = assignmentOutcomeModal
                  setAssignmentOutcomeModal(null)
                  setOutcomeReasonId('')
                  setOutcomeReasonOther('')
                  if (source === 'list_withdraw') {
                    void withdrawFromRole.mutateAsync({
                      positionCandidateId,
                      outcomeReason: reasonText,
                      closeTasks: outcomeCloseTasks,
                    })
                  } else {
                    void patchAssignmentStatus.mutateAsync({
                      positionCandidateId,
                      nextStatus,
                      closeTasks: outcomeCloseTasks,
                      outcomeReason: reasonText,
                    })
                  }
                }}
              >
                {patchAssignmentStatus.isPending || withdrawFromRole.isPending ? 'Saving…' : 'Confirm'}
              </button>
            </div>
          </>
        ) : null}
      </Modal>

      <Modal
        open={hiredFollowUpPcId != null}
        onClose={() => setHiredFollowUpPcId(null)}
        title="Hired — next steps"
        size="sm"
      >
        {hiredFollowUpPcId ? (
          <>
            <p className="text-stitch-on-surface text-sm leading-relaxed dark:text-stone-200">
              Should we set all of this position&apos;s candidates into <strong>Rejected</strong> and set the position to{' '}
              <strong>Success</strong>?
            </p>
            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                className="rounded-full bg-orange-500 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-orange-600 disabled:opacity-50"
                disabled={bulkRejectOthersAndSucceedPosition.isPending}
                onClick={() => setHiredFollowUpPcId(null)}
              >
                Skip
              </button>
              <button
                type="button"
                className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-50"
                disabled={bulkRejectOthersAndSucceedPosition.isPending}
                onClick={() => void bulkRejectOthersAndSucceedPosition.mutateAsync(hiredFollowUpPcId)}
              >
                {bulkRejectOthersAndSucceedPosition.isPending ? 'Working…' : 'Sure thing!'}
              </button>
            </div>
          </>
        ) : null}
      </Modal>

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

