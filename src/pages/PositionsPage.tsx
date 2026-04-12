import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { differenceInCalendarDays } from 'date-fns'
import { Briefcase, Building2, ChevronDown, ChevronRight, Coins, GripVertical, Sparkles } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

import { useAuth } from '@/auth/useAuth'
import { getSupabase } from '@/lib/supabase'
import { ScreenHeader } from '@/components/layout/ScreenHeader'
import { logActivityEvent } from '@/lib/activityLog'
import { candidateOutcomePill } from '@/lib/candidateOutcomePill'
import { useToast } from '@/hooks/useToast'
import { isMissingRequirementsColumnError, parseRequirementTokens } from '@/lib/requirementValues'
const DRAFT_KEY = 'yulis_position_wizard_draft'

const WIZARD_STEPS = ['Details', 'Review'] as const

type Draft = {
  step: number
  companyId: string
  title: string
  industry: string
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
      <ScreenHeader
        title="Positions"
        subtitle="Roles you’re hiring for — add tasks from each role."
        backTo="/"
        right={
          <Link
            to="/positions?create=1"
            className="inline-flex shrink-0 items-center rounded-full bg-gradient-to-r from-[#9b3e20] to-[#fd8863] px-4 py-2 text-sm font-bold text-white shadow-sm dark:from-orange-700 dark:to-orange-500"
          >
            New
          </Link>
        }
      />

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

function wizardSectionClass(): string {
  return 'rounded-2xl border border-stone-200/90 bg-stone-50/40 p-4 dark:border-stone-600/80 dark:bg-stone-900/35'
}

function CreatePositionWizard({ companies }: { companies: { id: string; name: string }[] }) {
  const { user } = useAuth()
  const supabase = getSupabase()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { success, error: toastError } = useToast()
  const d0 = loadDraft()
  const [step, setStep] = useState(Math.min(1, Math.max(0, d0.step ?? 0)))
  const [companyId, setCompanyId] = useState(d0.companyId ?? companies[0]?.id ?? '')
  const [title, setTitle] = useState(d0.title ?? '')
  const [industry, setIndustry] = useState(d0.industry ?? '')
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
    saveDraft({ step, companyId, title, industry, plannedFee, requirements })
  }, [step, companyId, title, industry, plannedFee, requirements])

  function parseBudgetIls(): number | null {
    const raw = plannedFee.trim().replace(/\s/g, '').replace(',', '.')
    if (!raw) return null
    const n = Number(raw)
    if (!Number.isFinite(n) || n < 0) return null
    return n
  }

  async function onCreate() {
    if (!supabase || !user || !companyId) return
    const budget = parseBudgetIls()
    if (plannedFee.trim() && budget == null) {
      toastError('Budget must be a valid number, or leave it empty.')
      return
    }
    setPending(true)
    const trimmedReq = requirements.trim()
    const baseRow = {
      user_id: user.id,
      company_id: companyId,
      title: title.trim() || 'New position',
      industry: industry.trim() || null,
      status: 'pending' as const,
      planned_fee_ils: budget,
    }

    let data: { id: string; title: string } | null = null
    let error: { message: string } | null = null

    if (trimmedReq) {
      const tryText = await supabase.from('positions').insert({ ...baseRow, requirements: trimmedReq }).select('id, title').single()
      if (!tryText.error) {
        data = tryText.data as { id: string; title: string }
      } else if (isMissingRequirementsColumnError(tryText.error.message)) {
        const tokens = parseRequirementTokens(requirements)
        const tryArr = await supabase
          .from('positions')
          .insert({ ...baseRow, requirement_item_values: tokens })
          .select('id, title')
          .single()
        data = tryArr.data as { id: string; title: string } | null
        error = tryArr.error
      } else {
        error = tryText.error
      }
    } else {
      const ins = await supabase.from('positions').insert(baseRow).select('id, title').single()
      data = ins.data as { id: string; title: string } | null
      error = ins.error
    }

    if (error) {
      setPending(false)
      toastError(error.message)
      return
    }
    const posId = data!.id
    const posTitle = data!.title ?? 'Role'
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
    navigate('/positions', { replace: true })
  }

  const canContinue = Boolean(companyId && title.trim())

  return (
    <div className="border-line overflow-hidden rounded-3xl border border-stone-200/80 bg-white shadow-sm dark:border-line-dark dark:bg-stone-900/60 dark:shadow-none">
      <div className="from-[#fd8863]/20 via-[#97daff]/15 to-[#b4fdb4]/15 border-b border-stone-200/80 bg-gradient-to-br px-5 py-4 dark:border-stone-600 dark:from-orange-950/40 dark:via-stone-900 dark:to-stone-900">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-accent flex items-center gap-2 text-[11px] font-bold tracking-[0.2em] uppercase dark:text-orange-300">
              <Sparkles className="h-3.5 w-3.5" aria-hidden />
              New role
            </p>
            <h2 className="mt-1 text-lg font-extrabold tracking-tight text-[#302e2b] dark:text-stone-100">
              {WIZARD_STEPS[step]}
            </h2>
          </div>
          <div className="flex items-center gap-2" aria-hidden>
            {WIZARD_STEPS.map((_, i) => (
              <span
                key={i}
                className={`h-2 rounded-full transition-all ${i === step ? 'w-8 bg-[#9b3e20] dark:bg-orange-500' : 'w-2 bg-stone-300/90 dark:bg-stone-600'}`}
              />
            ))}
          </div>
        </div>
        <p className="text-ink-muted mt-2 text-xs dark:text-stone-400">
          {step === 0
            ? 'Everything optional except client and role title — you can refine the role on the next screen.'
            : 'Check the summary, then create. New roles start as Pending; change status anytime on the role page.'}
        </p>
      </div>

      <div className="p-5 sm:p-6">
        {step === 0 ? (
          <div className="flex flex-col gap-5">
            <div className={wizardSectionClass()}>
              <div className="text-ink-muted mb-3 flex items-center gap-2 text-xs font-bold tracking-wide uppercase dark:text-stone-500">
                <Building2 className="h-4 w-4 text-[#9b3e20] dark:text-orange-400" aria-hidden />
                Client
              </div>
              <label className="flex flex-col gap-1.5 text-sm font-medium text-[#302e2b] dark:text-stone-200">
                Company
                <select
                  value={companyId}
                  onChange={(e) => setCompanyId(e.target.value)}
                  className="border-line rounded-xl border bg-white px-3 py-2.5 text-base shadow-sm dark:border-line-dark dark:bg-stone-900/80"
                  required
                >
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className={wizardSectionClass()}>
              <div className="text-ink-muted mb-3 flex items-center gap-2 text-xs font-bold tracking-wide uppercase dark:text-stone-500">
                <Briefcase className="h-4 w-4 text-[#9b3e20] dark:text-orange-400" aria-hidden />
                Role
              </div>
              <div className="flex flex-col gap-4">
                <label className="flex flex-col gap-1.5 text-sm font-medium text-[#302e2b] dark:text-stone-200">
                  Role title <span className="text-rose-600 dark:text-rose-400">*</span>
                  <input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="border-line rounded-xl border bg-white px-3 py-2.5 text-base shadow-sm dark:border-line-dark dark:bg-stone-900/80"
                    placeholder="e.g. Senior Software Engineer"
                    autoComplete="off"
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-sm font-medium text-[#302e2b] dark:text-stone-200">
                  Industry <span className="text-ink-muted font-normal">(optional)</span>
                  <input
                    value={industry}
                    onChange={(e) => setIndustry(e.target.value)}
                    className="border-line rounded-xl border bg-white px-3 py-2.5 text-base shadow-sm dark:border-line-dark dark:bg-stone-900/80"
                    placeholder="e.g. Fintech, Healthcare…"
                    autoComplete="off"
                  />
                </label>
              </div>
            </div>

            <div className={wizardSectionClass()}>
              <label className="flex flex-col gap-1.5 text-sm font-medium text-[#302e2b] dark:text-stone-200">
                Client brief / requirements <span className="text-ink-muted font-normal">(optional)</span>
                <textarea
                  value={requirements}
                  onChange={(e) => setRequirements(e.target.value)}
                  disabled={pending}
                  rows={6}
                  placeholder="Paste bullets or notes from the client. Skip if you’ll add this later on the role page."
                  className="border-line resize-y rounded-xl border bg-white px-3 py-2.5 text-sm leading-relaxed shadow-sm dark:border-line-dark dark:bg-stone-900/80"
                />
              </label>
            </div>

            <div className={wizardSectionClass()}>
              <div className="text-ink-muted mb-3 flex items-center gap-2 text-xs font-bold tracking-wide uppercase dark:text-stone-500">
                <Coins className="h-4 w-4 text-[#9b3e20] dark:text-orange-400" aria-hidden />
                Fee
              </div>
              <label className="flex flex-col gap-1.5 text-sm font-medium text-[#302e2b] dark:text-stone-200">
                Budget <span className="text-ink-muted font-normal">(optional, ₪)</span>
                <input
                  value={plannedFee}
                  onChange={(e) => setPlannedFee(e.target.value)}
                  className="border-line rounded-xl border bg-white px-3 py-2.5 text-base shadow-sm dark:border-line-dark dark:bg-stone-900/80"
                  placeholder="Leave empty if unknown"
                  inputMode="decimal"
                  autoComplete="off"
                />
              </label>
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-stone-200/90 bg-stone-50/50 p-5 dark:border-stone-600 dark:bg-stone-900/40">
            <h3 className="text-sm font-extrabold text-[#302e2b] dark:text-stone-100">Summary</h3>
            <dl className="mt-4 space-y-3 text-sm">
              <div className="flex flex-wrap justify-between gap-2 border-b border-stone-200/70 pb-3 dark:border-stone-600/80">
                <dt className="text-ink-muted font-medium">Company</dt>
                <dd className="text-right font-semibold text-[#302e2b] dark:text-stone-100">
                  {companies.find((c) => c.id === companyId)?.name ?? '—'}
                </dd>
              </div>
              <div className="flex flex-wrap justify-between gap-2 border-b border-stone-200/70 pb-3 dark:border-stone-600/80">
                <dt className="text-ink-muted font-medium">Role title</dt>
                <dd className="text-right font-semibold text-[#302e2b] dark:text-stone-100">{title.trim() || '—'}</dd>
              </div>
              <div className="flex flex-wrap justify-between gap-2 border-b border-stone-200/70 pb-3 dark:border-stone-600/80">
                <dt className="text-ink-muted font-medium">Industry</dt>
                <dd className="text-right font-semibold text-[#302e2b] dark:text-stone-100">{industry.trim() || '—'}</dd>
              </div>
              <div className="flex flex-wrap justify-between gap-2 border-b border-stone-200/70 pb-3 dark:border-stone-600/80">
                <dt className="text-ink-muted font-medium">Client brief</dt>
                <dd className="max-w-[min(100%,20rem)] text-right text-[#302e2b] dark:text-stone-100">
                  {requirements.trim() ? <span className="whitespace-pre-wrap">{requirements.trim()}</span> : '—'}
                </dd>
              </div>
              <div className="flex flex-wrap justify-between gap-2">
                <dt className="text-ink-muted font-medium">Budget</dt>
                <dd className="text-right font-semibold text-[#302e2b] dark:text-stone-100">
                  {parseBudgetIls() != null ? `₪${parseBudgetIls()!.toLocaleString('he-IL')}` : '—'}
                </dd>
              </div>
            </dl>
            <p className="text-ink-muted mt-4 text-xs leading-relaxed dark:text-stone-500">
              Default pipeline: Applied → Screening → Interview → Offer. Status starts as <strong className="text-stone-700 dark:text-stone-300">Pending</strong>.
            </p>
          </div>
        )}

        <div className="mt-6 flex flex-wrap items-center gap-3">
          {step > 0 ? (
            <button
              type="button"
              className="rounded-full border border-stone-300 px-5 py-2.5 text-sm font-semibold text-stone-800 transition hover:bg-stone-50 dark:border-stone-600 dark:text-stone-200 dark:hover:bg-stone-800/80"
              onClick={() => setStep((s) => s - 1)}
            >
              Back
            </button>
          ) : null}
          {step < 1 ? (
            <button
              type="button"
              disabled={!canContinue}
              className="rounded-full bg-gradient-to-r from-[#9b3e20] to-[#fd8863] px-6 py-2.5 text-sm font-bold text-white shadow-md shadow-orange-900/10 disabled:cursor-not-allowed disabled:opacity-45 dark:shadow-none"
              onClick={() => canContinue && setStep(1)}
            >
              Review
            </button>
          ) : (
            <button
              type="button"
              disabled={pending || !title.trim()}
              className="rounded-full bg-gradient-to-r from-[#9b3e20] to-[#fd8863] px-6 py-2.5 text-sm font-bold text-white shadow-md shadow-orange-900/10 disabled:cursor-not-allowed disabled:opacity-45 dark:shadow-none"
              onClick={() => void onCreate()}
            >
              {pending ? 'Creating…' : 'Create position'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
