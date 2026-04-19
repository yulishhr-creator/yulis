import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { differenceInCalendarDays, formatDistanceToNow } from 'date-fns'
import {
  Briefcase,
  Check,
  ChevronRight,
  ClipboardList,
  History,
  Link2,
  Mail,
  MapPin,
  Pencil,
  User,
  X,
} from 'lucide-react'

import { useAuth } from '@/auth/useAuth'
import { getSupabase } from '@/lib/supabase'
import { isMissingArchivedAtColumnError } from '@/lib/postgrestErrors'
import { formatDateTime, formatDue } from '@/lib/dates'
import { normalizeEmail, normalizePhone } from '@/lib/normalize'
import { linkedinHref } from '@/lib/urls'
import { assignmentStatusPill, candidateGlobalPill } from '@/lib/candidateStatus'
import { ScreenHeader } from '@/components/layout/ScreenHeader'
import { useToast } from '@/hooks/useToast'

type TabId = 'overview' | 'positions' | 'tasks' | 'activity'

type ActivityRow = {
  id: string
  event_type: string
  title: string
  subtitle: string | null
  created_at: string
  position_id: string
}

function stageName(st: { name: string } | { name: string }[] | null): string {
  if (!st) return '—'
  if (Array.isArray(st)) return st[0]?.name?.trim() || '—'
  return st.name?.trim() || '—'
}

function companyName(co: unknown): string | null {
  if (!co || typeof co !== 'object') return null
  const o = co as { name?: string }
  return o.name ?? null
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

function formatSalaryExpectationDisplay(raw: string | null | undefined): string {
  const t = raw?.trim() ?? ''
  if (!t) return '—'
  const p = parseIlsAmountInput(t)
  return typeof p === 'number' ? `${p.toLocaleString('en-US')}₪` : t
}

type OverviewEditKey =
  | 'email'
  | 'phone'
  | 'linkedin'
  | 'current_title'
  | 'location'
  | 'years_exp'
  | 'salary'

function OverviewFieldRow({
  label,
  isEditing,
  view,
  editSlot,
  onRequestEdit,
  colSpan2,
}: {
  label: string
  isEditing: boolean
  view: ReactNode
  editSlot: ReactNode
  onRequestEdit: () => void
  colSpan2?: boolean
}) {
  return (
    <div className={colSpan2 ? 'sm:col-span-2' : ''}>
      <dt className="text-ink-muted text-xs font-semibold dark:text-stone-500">{label}</dt>
      <dd className="group/ovfield mt-0.5 flex min-h-[1.75rem] flex-wrap items-center gap-2 text-sm">
        {isEditing ? (
          editSlot
        ) : (
          <>
            <div className="min-w-0 flex-1">{view}</div>
            <button
              type="button"
              className="text-ink-muted shrink-0 rounded-lg p-1.5 opacity-0 transition hover:bg-stone-200/80 hover:text-ink group-hover/ovfield:opacity-100 dark:hover:bg-stone-700 dark:hover:text-stone-100"
              aria-label={`Edit ${label}`}
              onClick={onRequestEdit}
            >
              <Pencil className="h-4 w-4" aria-hidden />
            </button>
          </>
        )}
      </dd>
    </div>
  )
}

export function CandidateDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const supabase = getSupabase()
  const uid = user?.id
  const qc = useQueryClient()
  const { success, error: toastError } = useToast()
  const [tab, setTab] = useState<TabId>('overview')
  const [overviewEdit, setOverviewEdit] = useState<null | OverviewEditKey>(null)
  const [overviewDraft, setOverviewDraft] = useState('')

  const commitCandidatePatch = useCallback(
    async (patch: Record<string, unknown>) => {
      if (!supabase || !uid || !id) return
      const { error } = await supabase.from('candidates').update(patch).eq('id', id).eq('user_id', uid)
      if (error) {
        toastError(error)
        return
      }
      success('Saved')
      setOverviewEdit(null)
      await qc.invalidateQueries({ queryKey: ['candidate-detail', id, uid] })
      await qc.invalidateQueries({ queryKey: ['all-candidates'] })
    },
    [supabase, uid, id, qc, success, toastError],
  )

  const candidateQ = useQuery({
    queryKey: ['candidate-detail', id, uid],
    enabled: Boolean(supabase && uid && id),
    queryFn: async () => {
      const selectWithArchive = `
          id, full_name, email, phone, linkedin, location, current_title, years_exp, salary_expectation,
          notes, lead_source, status, created_at, updated_at, resume_storage_path,
          position_candidates (
            id,
            status,
            source,
            created_at,
            archived_at,
            position_stage_id,
            position_stages ( name ),
            positions ( id, title, status, companies ( name ) )
          )
        `
      const selectWithoutArchive = `
          id, full_name, email, phone, linkedin, location, current_title, years_exp, salary_expectation,
          notes, lead_source, status, created_at, updated_at, resume_storage_path,
          position_candidates (
            id,
            status,
            source,
            created_at,
            position_stage_id,
            position_stages ( name ),
            positions ( id, title, status, companies ( name ) )
          )
        `
      let { data, error } = await supabase!
        .from('candidates')
        .select(selectWithArchive)
        .eq('id', id!)
        .eq('user_id', uid!)
        .is('deleted_at', null)
        .maybeSingle()
      if (error && isMissingArchivedAtColumnError(error)) {
        ;({ data, error } = await supabase!
          .from('candidates')
          .select(selectWithoutArchive)
          .eq('id', id!)
          .eq('user_id', uid!)
          .is('deleted_at', null)
          .maybeSingle())
      }
      if (error) throw error
      return data
    },
  })

  const tasksQ = useQuery({
    queryKey: ['candidate-tasks', id, uid],
    enabled: Boolean(supabase && uid && id),
    queryFn: async () => {
      const { data: pcs, error: e1 } = await supabase!
        .from('position_candidates')
        .select('id')
        .eq('candidate_id', id!)
        .eq('user_id', uid!)
      if (e1) throw e1
      const pcids = (pcs ?? []).map((r) => r.id as string)
      if (pcids.length === 0) return []
      const { data, error } = await supabase!
        .from('tasks')
        .select('id, title, status, due_at, created_at, updated_at, position_id, positions ( title )')
        .eq('user_id', uid!)
        .in('position_candidate_id', pcids)
        .order('due_at', { ascending: true, nullsFirst: false })
      if (error) throw error
      return data ?? []
    },
  })

  const activityQ = useQuery({
    queryKey: ['candidate-activity', id, uid],
    enabled: Boolean(supabase && uid && id),
    queryFn: async () => {
      const { data, error } = await supabase!
        .from('activity_events')
        .select('id, event_type, title, subtitle, created_at, position_id')
        .eq('candidate_id', id!)
        .eq('user_id', uid!)
        .order('created_at', { ascending: false })
        .limit(100)
      if (error) throw error
      return (data ?? []) as ActivityRow[]
    },
  })

  const c = candidateQ.data

  const assignments = useMemo(() => {
    const raw = c?.position_candidates as
      | Array<{
          id: string
          status: string
          source: string
          created_at: string
          archived_at?: string | null
          position_stages: { name: string } | { name: string }[] | null
          positions: { id: string; title: string; status: string; companies: unknown } | null
        }>
      | {
          id: string
          status: string
          source: string
          created_at: string
          archived_at?: string | null
          position_stages: { name: string } | { name: string }[] | null
          positions: { id: string; title: string; status: string; companies: unknown } | null
        }
      | null
      | undefined
    if (!raw) return []
    const list = Array.isArray(raw) ? raw : [raw]
    return list.filter((pc) => !pc.archived_at)
  }, [c?.position_candidates])

  const primaryAssignment = useMemo(
    () =>
      assignments.find((a) => a.status === 'in_progress') ??
      assignments.find((a) => a.status === 'hired') ??
      assignments[0] ??
      null,
    [assignments],
  )
  const pos = primaryAssignment?.positions ?? null
  const coName = companyName(pos?.companies)
  const outPill = c ? candidateGlobalPill(c.status as string) : null

  const subtitle = useMemo(() => {
    if (!pos) return assignments.length ? `${assignments.length} role(s)` : 'Candidate pool'
    const parts = [pos.title]
    if (coName) parts.push(coName)
    return parts.join(' · ')
  }, [pos, coName, assignments.length])

  if (candidateQ.isLoading) {
    return (
      <div className="flex flex-col gap-6">
        <ScreenHeader title="Candidate" subtitle="Loading…" backTo="/candidates" />
        <p className="text-ink-muted text-sm">Loading…</p>
      </div>
    )
  }

  if (!c) {
    return (
      <div className="flex flex-col gap-6">
        <ScreenHeader title="Not found" subtitle="This candidate may have been removed." backTo="/candidates" />
        <Link to="/candidates" className="text-accent text-sm font-semibold underline dark:text-orange-300">
          Back to Candidates
        </Link>
      </div>
    )
  }

  const daysInPool = differenceInCalendarDays(new Date(), new Date(c.created_at))
  const headStage = primaryAssignment ? stageName(primaryAssignment.position_stages) : '—'

  return (
    <div className="flex flex-col gap-6">
      <ScreenHeader
        title={c.full_name}
        subtitle={subtitle}
        backTo="/candidates"
        right={
          pos ? (
            <Link
              to={`/positions/${pos.id}?candidate=${c.id}&tab=candidates`}
              className="border-line bg-white/90 text-ink inline-flex items-center gap-2 rounded-2xl border px-3 py-2 text-sm font-semibold shadow-sm transition hover:bg-stone-50 dark:border-line-dark dark:bg-stone-900/90 dark:hover:bg-stone-800"
            >
              Open primary role
              <ChevronRight className="h-4 w-4 opacity-60" aria-hidden />
            </Link>
          ) : null
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <span
          className="border-violet-400/70 bg-violet-100 text-violet-950 inline-flex items-center rounded-full border-2 px-3 py-1 text-xs font-extrabold tracking-wide uppercase shadow-sm dark:border-violet-500/80 dark:bg-violet-950/80 dark:text-violet-100"
          title="Stage on primary assignment"
        >
          {headStage}
        </span>
        {outPill ? (
          <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-bold uppercase ${outPill.className}`}>
            {outPill.label}
          </span>
        ) : null}
        <span className="text-ink-muted text-xs dark:text-stone-500">
          Updated {formatDateTime(c.updated_at)} · {daysInPool}d in pool
        </span>
      </div>

      <nav
        className="border-line -mx-1 flex flex-wrap gap-1 rounded-2xl border bg-white/50 p-1 dark:border-line-dark dark:bg-stone-900/40"
        aria-label="Candidate sections"
      >
        {(
          [
            ['overview', 'Overview', User],
            ['positions', 'Positions', Briefcase],
            ['tasks', 'Tasks', ClipboardList],
            ['activity', 'Activity', History],
          ] as const
        ).map(([tid, label, Icon]) => (
          <button
            key={tid}
            type="button"
            onClick={() => setTab(tid)}
            className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-bold transition ${
              tab === tid
                ? 'bg-[#9b3e20] text-white shadow-sm dark:bg-orange-600'
                : 'text-ink-muted hover:bg-white/80 dark:hover:bg-stone-800/80'
            }`}
          >
            <Icon className="h-4 w-4 opacity-80" aria-hidden />
            {label}
            {tid === 'tasks' ? (
              <span className="bg-white/20 rounded-full px-1.5 py-0.5 text-[10px] tabular-nums">{tasksQ.data?.length ?? 0}</span>
            ) : null}
          </button>
        ))}
      </nav>

      {tab === 'overview' ? (
        <div className="border-line space-y-6 rounded-2xl border bg-white/70 p-4 dark:border-line-dark dark:bg-stone-900/45">
          <section>
            <h2 className="text-ink flex items-center gap-2 text-sm font-bold uppercase tracking-wide dark:text-stone-200">
              <Mail className="h-4 w-4 opacity-70" aria-hidden />
              Contact
            </h2>
            <dl className="mt-3 grid gap-3 sm:grid-cols-2">
              <OverviewFieldRow
                label="Email"
                isEditing={overviewEdit === 'email'}
                onRequestEdit={() => {
                  setOverviewDraft(c.email ?? '')
                  setOverviewEdit('email')
                }}
                view={
                  c.email ? (
                    <a href={`mailto:${c.email}`} className="text-[#006384] font-medium underline dark:text-cyan-300">
                      {c.email}
                    </a>
                  ) : (
                    <span className="text-ink-muted">—</span>
                  )
                }
                editSlot={
                  <>
                    <input
                      value={overviewDraft}
                      onChange={(e) => setOverviewDraft(e.target.value)}
                      type="email"
                      className="border-line text-ink min-w-0 flex-1 rounded-lg border bg-white px-2 py-1 text-sm dark:border-line-dark dark:bg-stone-900 dark:text-stone-100"
                      autoFocus
                    />
                    <button
                      type="button"
                      className="rounded-lg bg-emerald-600 p-1.5 text-white hover:bg-emerald-700"
                      aria-label="Save email"
                      onClick={() => {
                        const em = overviewDraft.trim() || null
                        void commitCandidatePatch({
                          email: em,
                          email_normalized: normalizeEmail(em),
                        })
                      }}
                    >
                      <Check className="h-4 w-4" aria-hidden />
                    </button>
                    <button
                      type="button"
                      className="border-line rounded-lg border bg-white p-1.5 dark:border-line-dark dark:bg-stone-800"
                      aria-label="Cancel"
                      onClick={() => setOverviewEdit(null)}
                    >
                      <X className="h-4 w-4" aria-hidden />
                    </button>
                  </>
                }
              />
              <OverviewFieldRow
                label="Phone"
                isEditing={overviewEdit === 'phone'}
                onRequestEdit={() => {
                  setOverviewDraft(c.phone ?? '')
                  setOverviewEdit('phone')
                }}
                view={
                  c.phone ? (
                    <a href={`tel:${c.phone.replace(/\s/g, '')}`} className="text-[#006384] font-medium underline dark:text-cyan-300">
                      {c.phone}
                    </a>
                  ) : (
                    <span className="text-ink-muted">—</span>
                  )
                }
                editSlot={
                  <>
                    <input
                      value={overviewDraft}
                      onChange={(e) => setOverviewDraft(e.target.value)}
                      type="tel"
                      className="border-line text-ink min-w-0 flex-1 rounded-lg border bg-white px-2 py-1 text-sm dark:border-line-dark dark:bg-stone-900 dark:text-stone-100"
                      autoFocus
                    />
                    <button
                      type="button"
                      className="rounded-lg bg-emerald-600 p-1.5 text-white hover:bg-emerald-700"
                      aria-label="Save phone"
                      onClick={() => {
                        const ph = overviewDraft.trim() || null
                        void commitCandidatePatch({
                          phone: ph,
                          phone_normalized: normalizePhone(ph),
                        })
                      }}
                    >
                      <Check className="h-4 w-4" aria-hidden />
                    </button>
                    <button
                      type="button"
                      className="border-line rounded-lg border bg-white p-1.5 dark:border-line-dark dark:bg-stone-800"
                      aria-label="Cancel"
                      onClick={() => setOverviewEdit(null)}
                    >
                      <X className="h-4 w-4" aria-hidden />
                    </button>
                  </>
                }
              />
              <OverviewFieldRow
                label="LinkedIn"
                colSpan2
                isEditing={overviewEdit === 'linkedin'}
                onRequestEdit={() => {
                  setOverviewDraft(c.linkedin ?? '')
                  setOverviewEdit('linkedin')
                }}
                view={
                  c.linkedin?.trim() ? (
                    (() => {
                      const href = linkedinHref(c.linkedin)
                      return href ? (
                        <a
                          href={href}
                          target="_blank"
                          rel="noreferrer"
                          className="break-all text-[#006384] font-medium underline dark:text-cyan-300"
                        >
                          {c.linkedin}
                        </a>
                      ) : (
                        <span className="text-ink-muted break-all">{c.linkedin}</span>
                      )
                    })()
                  ) : (
                    <span className="text-ink-muted">—</span>
                  )
                }
                editSlot={
                  <>
                    <Link2 className="text-ink-muted h-4 w-4 shrink-0 opacity-70" aria-hidden />
                    <input
                      value={overviewDraft}
                      onChange={(e) => setOverviewDraft(e.target.value)}
                      type="url"
                      placeholder="https://linkedin.com/in/…"
                      className="border-line text-ink min-w-0 flex-1 rounded-lg border bg-white px-2 py-1 text-sm dark:border-line-dark dark:bg-stone-900 dark:text-stone-100"
                      autoFocus
                    />
                    <button
                      type="button"
                      className="rounded-lg bg-emerald-600 p-1.5 text-white hover:bg-emerald-700"
                      aria-label="Save LinkedIn"
                      onClick={() => void commitCandidatePatch({ linkedin: overviewDraft.trim() || null })}
                    >
                      <Check className="h-4 w-4" aria-hidden />
                    </button>
                    <button
                      type="button"
                      className="border-line rounded-lg border bg-white p-1.5 dark:border-line-dark dark:bg-stone-800"
                      aria-label="Cancel"
                      onClick={() => setOverviewEdit(null)}
                    >
                      <X className="h-4 w-4" aria-hidden />
                    </button>
                  </>
                }
              />
            </dl>
          </section>

          <section>
            <h2 className="text-ink flex items-center gap-2 text-sm font-bold uppercase tracking-wide dark:text-stone-200">
              <Briefcase className="h-4 w-4 opacity-70" aria-hidden />
              Roles
            </h2>
            <dl className="mt-3 grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <dt className="text-ink-muted text-xs font-semibold dark:text-stone-500">Assignments</dt>
                <dd className="mt-0.5 text-sm">
                  {assignments.length ? (
                    <button
                      type="button"
                      onClick={() => setTab('positions')}
                      className="text-left text-[#9b3e20] font-semibold underline dark:text-orange-300"
                    >
                      {assignments.length} role{assignments.length === 1 ? '' : 's'} — view Positions tab
                    </button>
                  ) : (
                    'Not on any role yet'
                  )}
                </dd>
              </div>
              {c.lead_source ? (
                <div>
                  <dt className="text-ink-muted text-xs font-semibold dark:text-stone-500">Lead source</dt>
                  <dd className="mt-0.5 text-sm">{c.lead_source}</dd>
                </div>
              ) : null}
            </dl>
          </section>

          <section>
            <h2 className="text-ink flex items-center gap-2 text-sm font-bold uppercase tracking-wide dark:text-stone-200">
              <MapPin className="h-4 w-4 opacity-70" aria-hidden />
              Profile
            </h2>
            <dl className="mt-3 grid gap-3 sm:grid-cols-2">
              <OverviewFieldRow
                label="Current title"
                isEditing={overviewEdit === 'current_title'}
                onRequestEdit={() => {
                  setOverviewDraft(c.current_title ?? '')
                  setOverviewEdit('current_title')
                }}
                view={<span className="text-ink dark:text-stone-100">{c.current_title?.trim() || '—'}</span>}
                editSlot={
                  <>
                    <input
                      value={overviewDraft}
                      onChange={(e) => setOverviewDraft(e.target.value)}
                      className="border-line text-ink min-w-0 flex-1 rounded-lg border bg-white px-2 py-1 text-sm dark:border-line-dark dark:bg-stone-900 dark:text-stone-100"
                      autoFocus
                    />
                    <button
                      type="button"
                      className="rounded-lg bg-emerald-600 p-1.5 text-white hover:bg-emerald-700"
                      aria-label="Save current title"
                      onClick={() => void commitCandidatePatch({ current_title: overviewDraft.trim() || null })}
                    >
                      <Check className="h-4 w-4" aria-hidden />
                    </button>
                    <button
                      type="button"
                      className="border-line rounded-lg border bg-white p-1.5 dark:border-line-dark dark:bg-stone-800"
                      aria-label="Cancel"
                      onClick={() => setOverviewEdit(null)}
                    >
                      <X className="h-4 w-4" aria-hidden />
                    </button>
                  </>
                }
              />
              <OverviewFieldRow
                label="Location"
                isEditing={overviewEdit === 'location'}
                onRequestEdit={() => {
                  setOverviewDraft(c.location ?? '')
                  setOverviewEdit('location')
                }}
                view={<span className="text-ink dark:text-stone-100">{c.location?.trim() || '—'}</span>}
                editSlot={
                  <>
                    <input
                      value={overviewDraft}
                      onChange={(e) => setOverviewDraft(e.target.value)}
                      className="border-line text-ink min-w-0 flex-1 rounded-lg border bg-white px-2 py-1 text-sm dark:border-line-dark dark:bg-stone-900 dark:text-stone-100"
                      autoFocus
                    />
                    <button
                      type="button"
                      className="rounded-lg bg-emerald-600 p-1.5 text-white hover:bg-emerald-700"
                      aria-label="Save location"
                      onClick={() => void commitCandidatePatch({ location: overviewDraft.trim() || null })}
                    >
                      <Check className="h-4 w-4" aria-hidden />
                    </button>
                    <button
                      type="button"
                      className="border-line rounded-lg border bg-white p-1.5 dark:border-line-dark dark:bg-stone-800"
                      aria-label="Cancel"
                      onClick={() => setOverviewEdit(null)}
                    >
                      <X className="h-4 w-4" aria-hidden />
                    </button>
                  </>
                }
              />
              <OverviewFieldRow
                label="Years experience"
                isEditing={overviewEdit === 'years_exp'}
                onRequestEdit={() => {
                  setOverviewDraft(c.years_exp != null ? String(c.years_exp) : '')
                  setOverviewEdit('years_exp')
                }}
                view={<span className="text-ink dark:text-stone-100">{c.years_exp != null ? String(c.years_exp) : '—'}</span>}
                editSlot={
                  <>
                    <input
                      value={overviewDraft}
                      onChange={(e) => setOverviewDraft(e.target.value)}
                      inputMode="numeric"
                      className="border-line text-ink min-w-0 max-w-[8rem] rounded-lg border bg-white px-2 py-1 text-sm tabular-nums dark:border-line-dark dark:bg-stone-900 dark:text-stone-100"
                      autoFocus
                    />
                    <button
                      type="button"
                      className="rounded-lg bg-emerald-600 p-1.5 text-white hover:bg-emerald-700"
                      aria-label="Save years of experience"
                      onClick={() => {
                        const t = overviewDraft.trim()
                        if (!t) {
                          void commitCandidatePatch({ years_exp: null })
                          return
                        }
                        if (!/^\d{1,3}$/.test(t)) {
                          toastError('Enter years as a whole number (e.g. 5) or leave empty.')
                          return
                        }
                        void commitCandidatePatch({ years_exp: parseInt(t, 10) })
                      }}
                    >
                      <Check className="h-4 w-4" aria-hidden />
                    </button>
                    <button
                      type="button"
                      className="border-line rounded-lg border bg-white p-1.5 dark:border-line-dark dark:bg-stone-800"
                      aria-label="Cancel"
                      onClick={() => setOverviewEdit(null)}
                    >
                      <X className="h-4 w-4" aria-hidden />
                    </button>
                  </>
                }
              />
              <OverviewFieldRow
                label="Salary expectation"
                isEditing={overviewEdit === 'salary'}
                onRequestEdit={() => {
                  setOverviewDraft(c.salary_expectation ?? '')
                  setOverviewEdit('salary')
                }}
                view={
                  <span className="text-ink dark:text-stone-100">{formatSalaryExpectationDisplay(c.salary_expectation)}</span>
                }
                editSlot={
                  <>
                    <input
                      value={overviewDraft}
                      onChange={(e) => setOverviewDraft(e.target.value)}
                      placeholder="ILS amount"
                      className="border-line text-ink min-w-0 flex-1 rounded-lg border bg-white px-2 py-1 text-sm tabular-nums dark:border-line-dark dark:bg-stone-900 dark:text-stone-100"
                      autoFocus
                    />
                    <button
                      type="button"
                      className="rounded-lg bg-emerald-600 p-1.5 text-white hover:bg-emerald-700"
                      aria-label="Save salary expectation"
                      onClick={() => {
                        const t = overviewDraft.trim()
                        if (!t) {
                          void commitCandidatePatch({ salary_expectation: null })
                          return
                        }
                        const p = parseIlsAmountInput(t)
                        if (p === 'invalid') {
                          toastError('Enter a valid amount or leave empty.')
                          return
                        }
                        void commitCandidatePatch({ salary_expectation: p !== null ? String(p) : null })
                      }}
                    >
                      <Check className="h-4 w-4" aria-hidden />
                    </button>
                    <button
                      type="button"
                      className="border-line rounded-lg border bg-white p-1.5 dark:border-line-dark dark:bg-stone-800"
                      aria-label="Cancel"
                      onClick={() => setOverviewEdit(null)}
                    >
                      <X className="h-4 w-4" aria-hidden />
                    </button>
                  </>
                }
              />
              <div className="sm:col-span-2">
                <dt className="text-ink-muted text-xs font-semibold dark:text-stone-500">Résumé</dt>
                <dd className="mt-0.5 text-sm">{c.resume_storage_path ? 'On file — manage uploads on the role page.' : '—'}</dd>
              </div>
            </dl>
          </section>

          {c.notes?.trim() ? (
            <section>
              <h2 className="text-ink text-sm font-bold uppercase tracking-wide dark:text-stone-200">Notes</h2>
              <p className="text-ink-muted mt-2 whitespace-pre-wrap text-sm leading-relaxed dark:text-stone-300">{c.notes}</p>
            </section>
          ) : null}

          <p className="text-ink-muted border-t border-stone-200/80 pt-3 text-xs dark:border-stone-600">
            To change per-role stage, assignment status, or uploads, open the{' '}
            <Link to={pos ? `/positions/${pos.id}?candidate=${c.id}&tab=candidates` : '/candidates'} className="text-accent font-semibold underline dark:text-orange-300">
              position
            </Link>
            .
          </p>
        </div>
      ) : null}

      {tab === 'positions' ? (
        <section className="border-line rounded-2xl border bg-white/70 p-4 dark:border-line-dark dark:bg-stone-900/45">
          <h2 className="text-ink text-sm font-bold uppercase tracking-wide dark:text-stone-200">Positions</h2>
          {assignments.length === 0 ? (
            <p className="text-ink-muted mt-2 text-sm">Not assigned to any role yet. Assign from the Candidates list or a position page.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {assignments.map((a) => {
                const p = a.positions
                const ast = assignmentStatusPill(a.status)
                return (
                  <li key={a.id} className="border-line rounded-xl border bg-white/80 px-3 py-2 dark:border-line-dark dark:bg-stone-800/60">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Link
                        to={p ? `/positions/${p.id}?candidate=${c.id}&tab=candidates` : '/positions'}
                        className="font-semibold text-[#9b3e20] hover:underline dark:text-orange-300"
                      >
                        {p?.title ?? 'Role'}
                        {p?.companies ? ` · ${companyName(p.companies) ?? ''}` : ''}
                      </Link>
                      <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${ast.className}`}>
                        {ast.label}
                      </span>
                    </div>
                    <p className="text-ink-muted mt-1 text-xs">
                      Stage: {stageName(a.position_stages)} · Per-role source: <span className="capitalize">{a.source}</span>
                    </p>
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      ) : null}

      {tab === 'tasks' ? (
        <section className="border-line rounded-2xl border bg-white/70 p-4 dark:border-line-dark dark:bg-stone-900/45">
          <h2 className="sr-only">Tasks</h2>
          {tasksQ.isLoading ? (
            <p className="text-sm">Loading tasks…</p>
          ) : (tasksQ.data ?? []).length === 0 ? (
            <p className="text-ink-muted text-sm">No tasks linked to this candidate.</p>
          ) : (
            <ul className="space-y-2">
              {(tasksQ.data ?? []).map((t) => {
                const pTitle = (t.positions as unknown as { title?: string } | null)?.title
                return (
                  <li
                    key={t.id}
                    className="border-line flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-white/80 px-3 py-2 text-sm dark:border-line-dark dark:bg-stone-800/60"
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-[#302e2b] dark:text-stone-100">{t.title}</p>
                      <p className="text-ink-muted text-xs">
                        {t.status}
                        {t.due_at ? ` · due ${formatDue(t.due_at)}` : ''}
                        {pTitle ? ` · ${pTitle}` : ''}
                      </p>
                    </div>
                    {t.position_id ? (
                      <Link
                        to={`/positions/${t.position_id}`}
                        className="text-accent shrink-0 text-xs font-semibold underline dark:text-orange-300"
                      >
                        Role
                      </Link>
                    ) : null}
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      ) : null}

      {tab === 'activity' ? (
        <section className="border-line rounded-2xl border bg-white/70 p-4 dark:border-line-dark dark:bg-stone-900/45">
          <h2 className="sr-only">Activity</h2>
          {activityQ.isLoading ? (
            <p className="text-sm">Loading activity…</p>
          ) : (activityQ.data ?? []).length === 0 ? (
            <p className="text-ink-muted text-sm">No activity logged for this candidate yet.</p>
          ) : (
            <ul className="space-y-3">
              {(activityQ.data ?? []).map((a) => (
                <li key={a.id} className="border-line rounded-xl border border-stone-200/80 bg-stone-50/80 px-3 py-2 dark:border-stone-600 dark:bg-stone-800/50">
                  <p className="font-medium text-[#302e2b] dark:text-stone-100">{a.title}</p>
                  {a.subtitle ? <p className="text-ink-muted text-xs dark:text-stone-400">{a.subtitle}</p> : null}
                  <p className="text-ink-muted mt-1 text-[10px] uppercase tracking-wide dark:text-stone-500">
                    {formatDistanceToNow(new Date(a.created_at), { addSuffix: true })}
                    {a.position_id ? (
                      <>
                        {' · '}
                        <Link to={`/positions/${a.position_id}`} className="underline">
                          View role
                        </Link>
                      </>
                    ) : null}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}
    </div>
  )
}
