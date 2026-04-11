import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { differenceInCalendarDays } from 'date-fns'
import { ChevronDown, ChevronRight, GripVertical } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

import { useAuth } from '@/auth/useAuth'
import { getSupabase } from '@/lib/supabase'
import { ScreenHeader } from '@/components/layout/ScreenHeader'
import { logActivityEvent } from '@/lib/activityLog'
import { candidateOutcomePill } from '@/lib/candidateOutcomePill'
import { useToast } from '@/hooks/useToast'
const DRAFT_KEY = 'yulis_position_wizard_draft'

const STEP_COLORS = [
  'from-[#fd8863]/30 to-[#97daff]/25',
  'from-[#97daff]/25 to-[#b4fdb4]/20',
  'from-[#b4fdb4]/20 to-[#fd8863]/20',
  'from-[#9b3e20]/20 to-[#006384]/20',
] as const

type Draft = {
  step: number
  companyId: string
  title: string
  industry: string
  status: string
  plannedFee: string
  requirements: string
}

function loadDraft(): Partial<Draft> {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY)
    if (!raw) return {}
    return JSON.parse(raw) as Partial<Draft>
  } catch {
    return {}
  }
}

function saveDraft(d: Partial<Draft>) {
  try {
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify(d))
  } catch {
    /* ignore */
  }
}

/** Position row status — same visual language as dashboard / mobile list. */
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
        label: 'Goal achieved',
        className:
          'border-emerald-200/80 bg-emerald-50 text-emerald-900 dark:border-emerald-700/60 dark:bg-emerald-950/40 dark:text-emerald-100',
      }
    case 'cancelled':
      return {
        label: 'Withdrawn',
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

/** Tenure on role: days under a week, else rounded weeks (e.g. 5d, 2w). */
function formatCandidateAge(createdAt: string): string {
  const days = differenceInCalendarDays(new Date(), new Date(createdAt))
  if (days < 7) return `${days}d`
  const w = Math.max(1, Math.round(days / 7))
  return `${w}w`
}

type CandidateNested = {
  id: string
  full_name: string
  outcome: string
  created_at: string
  updated_at: string
  deleted_at: string | null
  /** Supabase may return object or single-element array for nested FK */
  position_stages: { name: string } | { name: string }[] | null
}

function candidateStageName(st: CandidateNested['position_stages']): string {
  if (!st) return '—'
  if (Array.isArray(st)) return st[0]?.name ?? '—'
  return st.name ?? '—'
}

type PositionListItem = {
  id: string
  title: string
  status: string
  created_at: string
  companies: unknown
  candidates?: CandidateNested[] | null
}

function PositionCard({
  p,
  isDragging,
  onDragStart,
  onDragEnd,
}: {
  p: PositionListItem
  isDragging: boolean
  onDragStart: (id: string) => void
  onDragEnd: () => void
}) {
  const co = p.companies as { name: string } | null
  const daysSince = differenceInCalendarDays(new Date(), new Date(p.created_at))
  const pill = positionStatusPill(p.status)
  const cands = (p.candidates ?? []).filter((c) => !c.deleted_at)
  const [expanded, setExpanded] = useState(false)

  return (
    <li>
      <div
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData('application/json', JSON.stringify({ id: p.id, status: p.status, title: p.title }))
          e.dataTransfer.effectAllowed = 'move'
          onDragStart(p.id)
        }}
        onDragEnd={onDragEnd}
        className={`border-line bg-white/70 flex rounded-2xl border transition-[opacity,box-shadow] dark:border-line-dark dark:bg-stone-900/45 ${
          isDragging ? 'opacity-60 shadow-lg ring-2 ring-[#9b3e20]/30' : ''
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
            <Link
              to={`/positions/${p.id}`}
              draggable={false}
              onDragStart={(e) => e.preventDefault()}
              className="min-w-0 flex-1 text-base leading-snug font-semibold break-words text-[#302e2b] underline-offset-2 hover:underline dark:text-stone-100"
            >
              {p.title}
            </Link>
            <span
              className="shrink-0 rounded-xl bg-gradient-to-br from-[#fd8863]/35 to-[#97daff]/40 px-2.5 py-1 text-xs font-extrabold tabular-nums text-[#9b3e20] ring-1 ring-[#9b3e20]/25 dark:from-orange-500/30 dark:to-cyan-500/25 dark:text-orange-200 dark:ring-orange-400/35"
              title="Days since this position was created"
            >
              {daysSince}d
            </span>
          </div>
          <div className="text-ink-muted mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs dark:text-stone-500">
            <span className="text-sm font-medium text-stone-800 dark:text-stone-200">{co?.name ?? '—'}</span>
            <span aria-hidden className="select-none">
              ·
            </span>
            <span
              className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[10px] font-bold tracking-wide uppercase ${pill.className}`}
            >
              {pill.label}
            </span>
            <span aria-hidden className="select-none">
              ·
            </span>
            <button
              type="button"
              draggable={false}
              onClick={() => setExpanded((v) => !v)}
              className="text-ink-muted hover:text-ink inline-flex items-center gap-1 font-bold tracking-wide uppercase transition dark:text-stone-500 dark:hover:text-stone-300"
              aria-expanded={expanded}
            >
              {expanded ? <ChevronDown className="h-3.5 w-3.5 shrink-0" aria-hidden /> : <ChevronRight className="h-3.5 w-3.5 shrink-0" aria-hidden />}
              {cands.length === 0 ? 'No candidates' : `${cands.length} candidate${cands.length === 1 ? '' : 's'}`}
            </button>
          </div>
          {expanded && cands.length > 0 ? (
            <ul className="mt-1.5 space-y-1.5 border-t border-stone-200/70 pt-1.5 dark:border-stone-600">
              {cands.map((c) => {
                const st = candidateStageName(c.position_stages)
                const out = candidateOutcomePill(c.outcome)
                return (
                  <li
                    key={c.id}
                    className="flex flex-wrap items-center gap-2 rounded-xl bg-stone-50/90 px-2.5 py-2 text-sm dark:bg-stone-800/60"
                  >
                    <Link to={`/positions/${p.id}?candidate=${c.id}`} className="min-w-0 flex-1 font-medium text-[#006384] hover:underline dark:text-cyan-300" draggable={false}>
                      {c.full_name}
                    </Link>
                    <span
                      className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${out.className}`}
                    >
                      {out.label}
                    </span>
                    <span className="text-ink-muted shrink-0 text-[10px] font-semibold tabular-nums dark:text-stone-500" title="Time on role">
                      {formatCandidateAge(c.created_at)}
                    </span>
                    <span className="text-ink-muted w-full text-[10px] dark:text-stone-500">{st}</span>
                  </li>
                )
              })}
            </ul>
          ) : null}
        </div>
      </div>
    </li>
  )
}

type DropZone = 'active' | 'success' | 'cancelled'

export function PositionsPage() {
  const { user } = useAuth()
  const supabase = getSupabase()
  const [search] = useSearchParams()
  const qc = useQueryClient()
  const { success, error: toastError } = useToast()
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dropHover, setDropHover] = useState<DropZone | null>(null)

  const companiesQ = useQuery({
    queryKey: ['companies', user?.id],
    enabled: Boolean(supabase && user),
    queryFn: async () => {
      const { data, error } = await supabase!
        .from('companies')
        .select('id, name')
        .eq('user_id', user!.id)
        .is('deleted_at', null)
        .order('name')
      if (error) throw error
      return data ?? []
    },
  })

  const positionsQ = useQuery({
    queryKey: ['positions', user?.id],
    enabled: Boolean(supabase && user),
    queryFn: async () => {
      const { data, error } = await supabase!
        .from('positions')
        .select(
          `
          id, title, status, company_id, created_at, updated_at,
          companies ( name ),
          candidates (
            id, full_name, outcome, created_at, updated_at, deleted_at,
            position_stages ( name )
          )
        `,
        )
        .eq('user_id', user!.id)
        .is('deleted_at', null)
        .order('updated_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as unknown as PositionListItem[]
    },
  })

  const movePosition = useMutation({
    mutationFn: async ({ id, next, prev }: { id: string; next: string; prev: string }) => {
      const { error } = await supabase!.from('positions').update({ status: next }).eq('id', id).eq('user_id', user!.id)
      if (error) throw error
      return { id, next, prev }
    },
    onSuccess: async ({ next, prev, id }) => {
      if (!supabase || !user) return
      if (next === 'success') {
        success('Moved to Goal achieved')
        await logActivityEvent(supabase, user.id, {
          event_type: 'position_status_changed',
          position_id: id,
          title: 'Position fulfilled',
          subtitle: `${prev} → ${next}`,
          metadata: { from: prev, to: next },
        })
      } else if (next === 'cancelled') {
        success('Moved to Withdrawn')
        await logActivityEvent(supabase, user.id, {
          event_type: 'position_status_changed',
          position_id: id,
          title: 'Position withdrawn',
          subtitle: `${prev} → ${next}`,
          metadata: { from: prev, to: next },
        })
      } else {
        success('Moved to Active')
        await logActivityEvent(supabase, user.id, {
          event_type: 'position_status_changed',
          position_id: id,
          title: 'Position reopened',
          subtitle: `${prev} → ${next}`,
          metadata: { from: prev, to: next },
        })
      }
      await qc.invalidateQueries({ queryKey: ['positions'] })
      await qc.invalidateQueries({ queryKey: ['dashboard-top-positions'] })
    },
    onError: (e: Error) => toastError(e.message),
  })

  function parseDragPayload(e: React.DragEvent): { id: string; status: string; title: string } | null {
    try {
      const raw = e.dataTransfer.getData('application/json')
      if (!raw) return null
      const o = JSON.parse(raw) as { id?: string; status?: string; title?: string }
      if (!o.id || !o.status) return null
      return { id: o.id, status: o.status, title: o.title ?? 'Role' }
    } catch {
      return null
    }
  }

  function targetStatusForZone(zone: DropZone, current: string): 'pending' | 'in_progress' | 'success' | 'cancelled' | null {
    if (zone === 'success') return current === 'success' ? null : 'success'
    if (zone === 'cancelled') return current === 'cancelled' ? null : 'cancelled'
    if (zone === 'active') {
      if (current === 'pending' || current === 'in_progress') return null
      return 'in_progress'
    }
    return null
  }

  function handleDragOver(e: React.DragEvent, zone: DropZone) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDropHover(zone)
  }

  function handleDrop(e: React.DragEvent, zone: DropZone) {
    e.preventDefault()
    setDropHover(null)
    setDraggingId(null)
    const payload = parseDragPayload(e)
    if (!payload) return
    const next = targetStatusForZone(zone, payload.status)
    if (!next) return
    movePosition.mutate({ id: payload.id, next, prev: payload.status })
  }

  const createOpen = search.get('create') === '1'

  const companies = companiesQ.data ?? []
  const positions = positionsQ.data ?? []

  const activePositions = useMemo(
    () => positions.filter((p) => p.status === 'pending' || p.status === 'in_progress'),
    [positions],
  )
  const goalAchieved = useMemo(() => positions.filter((p) => p.status === 'success'), [positions])
  const withdrawn = useMemo(() => positions.filter((p) => p.status === 'cancelled'), [positions])

  const zoneClass = (zone: DropZone) =>
    `mt-3 min-h-[3rem] rounded-2xl transition-colors ${
      dropHover === zone ? 'bg-[#fd8863]/10 ring-2 ring-[#9b3e20]/35 dark:bg-orange-500/10 dark:ring-orange-400/40' : ''
    }`

  return (
    <div className="flex flex-col gap-6">
      <ScreenHeader title="Positions" subtitle="Roles you’re hiring for — add tasks from each role." backTo="/" />

      {createOpen && companies.length === 0 ? (
        <p className="text-ink-muted rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm dark:border-amber-900/50 dark:bg-amber-950/30">
          Add a{' '}
          <Link className="text-accent font-medium underline dark:text-orange-300" to="/companies/new">
            company
          </Link>{' '}
          first, then create a position.
        </p>
      ) : null}

      {createOpen && companies.length > 0 ? <CreatePositionWizard companies={companies} /> : null}

      <p className="text-ink-muted text-xs dark:text-stone-500">
        Drag a role by the grip to move it between <strong className="text-ink dark:text-stone-300">Active</strong>,{' '}
        <strong className="text-ink dark:text-stone-300">Goal achieved</strong>, and <strong className="text-ink dark:text-stone-300">Withdrawn</strong>.
      </p>

      {positionsQ.isLoading ? (
        <p className="text-ink-muted text-sm">Loading…</p>
      ) : positions.length === 0 ? (
        <p className="text-ink-muted text-sm">No positions yet.</p>
      ) : (
        <div className="flex flex-col gap-8">
          <section
            aria-labelledby="active-positions-heading"
            onDragOver={(e) => handleDragOver(e, 'active')}
            onDrop={(e) => handleDrop(e, 'active')}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropHover((h) => (h === 'active' ? null : h))
            }}
            className={dropHover === 'active' ? 'rounded-3xl ring-2 ring-[#9b3e20]/25 ring-offset-2 ring-offset-paper dark:ring-offset-paper-dark' : ''}
          >
            <h2 id="active-positions-heading" className="text-lg font-extrabold text-[#302e2b] dark:text-stone-100">
              Active positions
            </h2>
            <p className="text-ink-muted mt-1 text-xs dark:text-stone-500">Open roles you&apos;re still working (pending or in progress).</p>
            <div className={zoneClass('active')}>
              {activePositions.length === 0 ? (
                <p className="text-ink-muted px-2 py-4 text-sm">None in this category — drop a role here to reopen as in progress.</p>
              ) : (
                <ul className="space-y-2 pt-1">
                  {activePositions.map((p) => (
                    <PositionCard
                      key={p.id}
                      p={p}
                      isDragging={draggingId === p.id}
                      onDragStart={(id) => setDraggingId(id)}
                      onDragEnd={() => {
                        setDraggingId(null)
                        setDropHover(null)
                      }}
                    />
                  ))}
                </ul>
              )}
            </div>
          </section>

          <section
            aria-labelledby="goal-achieved-heading"
            onDragOver={(e) => handleDragOver(e, 'success')}
            onDrop={(e) => handleDrop(e, 'success')}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropHover((h) => (h === 'success' ? null : h))
            }}
            className={dropHover === 'success' ? 'rounded-3xl ring-2 ring-emerald-500/30 ring-offset-2 ring-offset-paper dark:ring-offset-paper-dark' : ''}
          >
            <h2 id="goal-achieved-heading" className="text-lg font-extrabold text-[#302e2b] dark:text-stone-100">
              Goal achieved
            </h2>
            <p className="text-ink-muted mt-1 text-xs dark:text-stone-500">Roles marked fulfilled — placement or hire completed.</p>
            <div className={zoneClass('success')}>
              {goalAchieved.length === 0 ? (
                <p className="text-ink-muted px-2 py-4 text-sm">None in this category — drop here to mark fulfilled.</p>
              ) : (
                <ul className="space-y-2 pt-1">
                  {goalAchieved.map((p) => (
                    <PositionCard
                      key={p.id}
                      p={p}
                      isDragging={draggingId === p.id}
                      onDragStart={(id) => setDraggingId(id)}
                      onDragEnd={() => {
                        setDraggingId(null)
                        setDropHover(null)
                      }}
                    />
                  ))}
                </ul>
              )}
            </div>
          </section>

          <section
            aria-labelledby="withdrawn-positions-heading"
            onDragOver={(e) => handleDragOver(e, 'cancelled')}
            onDrop={(e) => handleDrop(e, 'cancelled')}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropHover((h) => (h === 'cancelled' ? null : h))
            }}
            className={dropHover === 'cancelled' ? 'rounded-3xl ring-2 ring-stone-400/40 ring-offset-2 ring-offset-paper dark:ring-offset-paper-dark' : ''}
          >
            <h2 id="withdrawn-positions-heading" className="text-lg font-extrabold text-[#302e2b] dark:text-stone-100">
              Withdrawn
            </h2>
            <p className="text-ink-muted mt-1 text-xs dark:text-stone-500">Roles pulled or closed without a hire.</p>
            <div className={zoneClass('cancelled')}>
              {withdrawn.length === 0 ? (
                <p className="text-ink-muted px-2 py-4 text-sm">None in this category — drop here to withdraw.</p>
              ) : (
                <ul className="space-y-2 pt-1">
                  {withdrawn.map((p) => (
                    <PositionCard
                      key={p.id}
                      p={p}
                      isDragging={draggingId === p.id}
                      onDragStart={(id) => setDraggingId(id)}
                      onDragEnd={() => {
                        setDraggingId(null)
                        setDropHover(null)
                      }}
                    />
                  ))}
                </ul>
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  )
}

function CreatePositionWizard({ companies }: { companies: { id: string; name: string }[] }) {
  const { user } = useAuth()
  const supabase = getSupabase()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { success, error: toastError } = useToast()
  const d0 = loadDraft()
  const [step, setStep] = useState(Math.min(3, Math.max(0, d0.step ?? 0)))
  const [companyId, setCompanyId] = useState(d0.companyId ?? companies[0]?.id ?? '')
  const [title, setTitle] = useState(d0.title ?? '')
  const [industry, setIndustry] = useState(d0.industry ?? '')
  const [status, setStatus] = useState(d0.status ?? 'pending')
  const [plannedFee, setPlannedFee] = useState(d0.plannedFee ?? '')
  const [requirements, setRequirements] = useState(
    typeof d0.requirements === 'string'
      ? d0.requirements
      : Array.isArray((d0 as { requirementItemValues?: string[] }).requirementItemValues)
        ? ((d0 as { requirementItemValues: string[] }).requirementItemValues ?? []).join('\n')
        : '',
  )
  const [pending, setPending] = useState(false)

  useEffect(() => {
    saveDraft({ step, companyId, title, industry, status, plannedFee, requirements })
  }, [step, companyId, title, industry, status, plannedFee, requirements])

  const headlines = ['Company', 'Role & industry', 'Status & fees', 'Review & create']

  async function onCreate() {
    if (!supabase || !user || !companyId) return
    setPending(true)
    const { data, error } = await supabase
      .from('positions')
      .insert({
        user_id: user.id,
        company_id: companyId,
        title: title.trim() || 'New position',
        industry: industry.trim() || null,
        status: status as 'pending' | 'in_progress' | 'success' | 'cancelled',
        planned_fee_ils: plannedFee.trim() ? Number(plannedFee) : null,
        requirements: requirements.trim() || null,
      })
      .select('id, title')
      .single()
    if (error) {
      setPending(false)
      toastError(error.message)
      return
    }
    const posId = data!.id as string
    const posTitle = (data!.title as string) ?? 'Role'
    const defaultStages = ['Applied', 'Screening', 'Interview', 'Offer']
    for (let i = 0; i < defaultStages.length; i++) {
      await supabase.from('position_stages').insert({
        user_id: user.id,
        position_id: posId,
        sort_order: i,
        name: defaultStages[i],
      })
    }
    await logActivityEvent(supabase, user.id, {
      event_type: 'position_created',
      position_id: posId,
      title: 'Position created',
      subtitle: posTitle,
      metadata: { company_id: companyId },
    })
    try {
      sessionStorage.removeItem(DRAFT_KEY)
    } catch {
      /* ignore */
    }
    setPending(false)
    success('Position created')
    await qc.invalidateQueries({ queryKey: ['positions'] })
    navigate(`/positions/${posId}`)
  }

  function canNext(): boolean {
    if (step === 0) return Boolean(companyId)
    if (step === 1) return title.trim().length > 0
    return true
  }

  return (
    <div className="border-line overflow-hidden rounded-2xl border bg-white/80 dark:border-line-dark dark:bg-stone-900/50">
      <div className={`bg-gradient-to-r px-4 py-3 ${STEP_COLORS[step] ?? STEP_COLORS[0]} dark:opacity-95`}>
        <p className="text-sm font-extrabold tracking-wide text-[#302e2b] uppercase dark:text-stone-100">
          Step {step + 1} of 4 — {headlines[step]}
        </p>
      </div>
      <div className="flex gap-1 border-b border-stone-200/80 px-2 pt-2 dark:border-stone-600">
        {headlines.map((h, i) => (
          <button
            key={h}
            type="button"
            onClick={() => setStep(i)}
            className={`min-w-0 flex-1 truncate rounded-t-lg px-2 py-2 text-[10px] font-bold uppercase ${
              i === step ? 'bg-white text-[#9b3e20] shadow-sm dark:bg-stone-800 dark:text-orange-300' : 'text-stone-500'
            }`}
          >
            {i + 1}
          </button>
        ))}
      </div>

      <div className="p-4">
        {step === 0 ? (
          <label className="flex flex-col gap-1 text-sm">
            Client company
            <select
              value={companyId}
              onChange={(e) => setCompanyId(e.target.value)}
              className="border-line rounded-xl border px-3 py-2 dark:border-line-dark dark:bg-stone-900/50"
              required
            >
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        {step === 1 ? (
          <div className="flex flex-col gap-3">
            <label className="flex flex-col gap-1 text-sm">
              Role title
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="border-line rounded-xl border px-3 py-2 dark:border-line-dark dark:bg-stone-900/50"
                placeholder="e.g. Senior Software Engineer"
                required
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              Industry (optional)
              <input
                value={industry}
                onChange={(e) => setIndustry(e.target.value)}
                className="border-line rounded-xl border px-3 py-2 dark:border-line-dark dark:bg-stone-900/50"
                placeholder="e.g. Software"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              Requirements from client (optional)
              <textarea
                value={requirements}
                onChange={(e) => setRequirements(e.target.value)}
                disabled={pending}
                rows={10}
                placeholder="Paste 8–12 lines from the client brief (one line per bullet is fine)."
                className="border-line resize-y rounded-xl border px-3 py-2 dark:border-line-dark dark:bg-stone-900/50"
              />
            </label>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="flex flex-col gap-3">
            <label className="flex flex-col gap-1 text-sm">
              Status
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="border-line rounded-xl border px-3 py-2 dark:border-line-dark dark:bg-stone-900/50"
              >
                <option value="pending">Pending</option>
                <option value="in_progress">In progress</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              Planned fee (₪, optional)
              <input
                value={plannedFee}
                onChange={(e) => setPlannedFee(e.target.value)}
                className="border-line rounded-xl border px-3 py-2 dark:border-line-dark dark:bg-stone-900/50"
                inputMode="decimal"
              />
            </label>
          </div>
        ) : null}

        {step === 3 ? (
          <ul className="text-sm leading-relaxed text-[#302e2b] dark:text-stone-200">
            <li>
              <span className="text-ink-muted">Company: </span>
              {companies.find((c) => c.id === companyId)?.name ?? '—'}
            </li>
            <li>
              <span className="text-ink-muted">Title: </span>
              {title.trim() || '—'}
            </li>
            <li>
              <span className="text-ink-muted">Industry: </span>
              {industry.trim() || '—'}
            </li>
            <li>
              <span className="text-ink-muted">Requirements: </span>
              {requirements.trim() ? (
                <span className="whitespace-pre-wrap">{requirements.trim()}</span>
              ) : (
                '—'
              )}
            </li>
            <li>
              <span className="text-ink-muted">Status: </span>
              {status.replace('_', ' ')}
            </li>
            <li>
              <span className="text-ink-muted">Planned fee: </span>
              {plannedFee.trim() ? `₪${plannedFee}` : '—'}
            </li>
            <li className="text-ink-muted mt-2 text-xs">Default pipeline stages: Applied → Screening → Interview → Offer.</li>
          </ul>
        ) : null}

        <div className="mt-4 flex flex-wrap gap-2">
          {step > 0 ? (
            <button
              type="button"
              className="rounded-full border border-stone-300 px-4 py-2 text-sm font-semibold dark:border-stone-600"
              onClick={() => setStep((s) => s - 1)}
            >
              Back
            </button>
          ) : null}
          {step < 3 ? (
            <button
              type="button"
              disabled={!canNext()}
              className="rounded-full bg-gradient-to-r from-[#9b3e20] to-[#fd8863] px-5 py-2 text-sm font-bold text-white disabled:opacity-50"
              onClick={() => canNext() && setStep((s) => s + 1)}
            >
              Next
            </button>
          ) : (
            <button
              type="button"
              disabled={pending || !title.trim()}
              className="rounded-full bg-gradient-to-r from-[#9b3e20] to-[#fd8863] px-5 py-2 text-sm font-bold text-white disabled:opacity-50"
              onClick={() => void onCreate()}
            >
              {pending ? 'Creating…' : 'Create & open'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
