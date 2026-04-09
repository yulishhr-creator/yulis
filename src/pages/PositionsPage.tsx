import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { differenceInCalendarDays } from 'date-fns'
import { ListFilter } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'

import { useAuth } from '@/auth/useAuth'
import { getSupabase } from '@/lib/supabase'
import { ScreenHeader } from '@/components/layout/ScreenHeader'
import { logActivityEvent } from '@/lib/activityLog'
import { useToast } from '@/hooks/useToast'
import { RequirementsMultiSelect } from '@/components/RequirementsMultiSelect'

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
  requirementItemValues: string[]
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

type PositionListItem = {
  id: string
  title: string
  status: string
  created_at: string
  companies: unknown
}

function PositionListRow({ p }: { p: PositionListItem }) {
  const co = p.companies as { name: string } | null
  const daysSince = differenceInCalendarDays(new Date(), new Date(p.created_at))
  return (
    <li>
      <Link
        to={`/positions/${p.id}`}
        className="border-line bg-white/70 hover:border-accent flex flex-col gap-2.5 rounded-2xl border px-4 py-4 transition-colors dark:border-line-dark dark:bg-stone-900/45"
      >
        <div className="flex items-start justify-between gap-3">
          <span className="font-display min-w-0 flex-1 text-base leading-snug font-semibold break-words text-[#302e2b] dark:text-stone-100">
            {p.title}
          </span>
          <span
            className="shrink-0 rounded-xl bg-gradient-to-br from-[#fd8863]/35 to-[#97daff]/40 px-2.5 py-1 text-xs font-extrabold tabular-nums text-[#9b3e20] ring-1 ring-[#9b3e20]/25 dark:from-orange-500/30 dark:to-cyan-500/25 dark:text-orange-200 dark:ring-orange-400/35"
            title="Days since this position was created"
          >
            {daysSince}d
          </span>
        </div>
        <p className="text-sm leading-snug text-stone-600 dark:text-stone-400">
          <span className="font-medium text-stone-800 dark:text-stone-200">{co?.name ?? '—'}</span>
          <span className="text-stone-400 dark:text-stone-500"> · </span>
          <span className="capitalize">{p.status.replace('_', ' ')}</span>
        </p>
      </Link>
    </li>
  )
}

export function PositionsPage() {
  const { user } = useAuth()
  const supabase = getSupabase()
  const [search] = useSearchParams()
  const [companyFilter, setCompanyFilter] = useState<string>('')
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [statusFilterOpen, setStatusFilterOpen] = useState(false)
  const statusFilterRef = useRef<HTMLDivElement>(null)

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
    queryKey: ['positions', user?.id, companyFilter, statusFilter],
    enabled: Boolean(supabase && user),
    queryFn: async () => {
      let q = supabase!
        .from('positions')
        .select('id, title, status, company_id, created_at, companies ( name )')
        .eq('user_id', user!.id)
        .is('deleted_at', null)
        .order('updated_at', { ascending: false })
      if (companyFilter) q = q.eq('company_id', companyFilter)
      if (statusFilter) q = q.eq('status', statusFilter)
      const { data, error } = await q
      if (error) throw error
      return data ?? []
    },
  })

  const createOpen = search.get('create') === '1'

  const companies = companiesQ.data ?? []
  const positions = positionsQ.data ?? []

  const STATUS_OPTIONS = [
    { value: '', label: 'All statuses' },
    { value: 'pending', label: 'Pending' },
    { value: 'in_progress', label: 'In progress' },
    { value: 'success', label: 'Success' },
    { value: 'cancelled', label: 'Cancelled' },
  ] as const

  const activePositions = useMemo(
    () => positions.filter((p) => p.status === 'pending' || p.status === 'in_progress'),
    [positions],
  )
  const goalAchieved = useMemo(() => positions.filter((p) => p.status === 'success'), [positions])
  const withdrawn = useMemo(() => positions.filter((p) => p.status === 'cancelled'), [positions])

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!statusFilterRef.current?.contains(e.target as Node)) setStatusFilterOpen(false)
    }
    if (statusFilterOpen) document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [statusFilterOpen])

  const showActiveBlock = !statusFilter || statusFilter === 'pending' || statusFilter === 'in_progress'
  const showGoalBlock = !statusFilter || statusFilter === 'success'
  const showWithdrawnBlock = !statusFilter || statusFilter === 'cancelled'

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

      <div className="flex items-end gap-3">
        <label className="flex min-w-0 flex-1 flex-col gap-1 text-sm font-medium">
          Company
          <select
            value={companyFilter}
            onChange={(e) => setCompanyFilter(e.target.value)}
            className="border-line bg-white/80 focus:ring-accent w-full min-w-0 rounded-xl border px-3 py-2.5 outline-none focus:ring-2 dark:bg-stone-900/50 dark:border-line-dark"
          >
            <option value="">All companies</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <div className="relative shrink-0" ref={statusFilterRef}>
          <button
            type="button"
            onClick={() => setStatusFilterOpen((o) => !o)}
            className={`border-line flex h-10 w-10 items-center justify-center rounded-2xl border shadow-sm transition dark:border-line-dark ${
              statusFilter
                ? 'bg-[#9b3e20]/15 text-[#9b3e20] ring-2 ring-[#9b3e20]/25 dark:text-orange-300'
                : 'bg-white/90 text-stone-600 dark:bg-stone-800 dark:text-stone-300'
            }`}
            aria-expanded={statusFilterOpen}
            aria-haspopup="listbox"
            aria-label="Filter by status"
          >
            <ListFilter className="h-5 w-5" aria-hidden />
          </button>
          {statusFilterOpen ? (
            <div
              className="border-line bg-paper absolute top-full left-0 z-20 mt-2 w-52 rounded-2xl border p-2 shadow-xl dark:border-line-dark dark:bg-stone-900"
              role="listbox"
              aria-label="Status filter"
            >
              {STATUS_OPTIONS.map(({ value, label }) => (
                <button
                  key={value || 'all'}
                  type="button"
                  role="option"
                  aria-selected={statusFilter === value}
                  className={`w-full rounded-xl px-3 py-2 text-left text-sm font-medium ${
                    statusFilter === value ? 'bg-[#9b3e20] text-white dark:bg-orange-600' : 'hover:bg-stone-100 dark:hover:bg-stone-800'
                  }`}
                  onClick={() => {
                    setStatusFilter(value)
                    setStatusFilterOpen(false)
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      {positionsQ.isLoading ? (
        <p className="text-ink-muted text-sm">Loading…</p>
      ) : positions.length === 0 ? (
        <p className="text-ink-muted text-sm">No positions yet.</p>
      ) : (
        <div className="flex flex-col gap-8">
          {showActiveBlock ? (
            <section aria-labelledby="active-positions-heading">
              <h2 id="active-positions-heading" className="font-stitch-head text-lg font-extrabold text-[#302e2b] dark:text-stone-100">
                Active positions
              </h2>
              <p className="text-ink-muted mt-1 text-xs dark:text-stone-500">Open roles you&apos;re still working (pending or in progress).</p>
              {activePositions.length === 0 ? (
                <p className="text-ink-muted mt-3 text-sm">None in this category.</p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {activePositions.map((p) => (
                    <PositionListRow key={p.id} p={p} />
                  ))}
                </ul>
              )}
            </section>
          ) : null}

          {showGoalBlock ? (
            <section aria-labelledby="goal-achieved-heading">
              <h2 id="goal-achieved-heading" className="font-stitch-head text-lg font-extrabold text-[#302e2b] dark:text-stone-100">
                Goal achieved
              </h2>
              <p className="text-ink-muted mt-1 text-xs dark:text-stone-500">Roles marked fulfilled — placement or hire completed.</p>
              {goalAchieved.length === 0 ? (
                <p className="text-ink-muted mt-3 text-sm">None in this category.</p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {goalAchieved.map((p) => (
                    <PositionListRow key={p.id} p={p} />
                  ))}
                </ul>
              )}
            </section>
          ) : null}

          {showWithdrawnBlock ? (
            <section aria-labelledby="withdrawn-positions-heading">
              <h2 id="withdrawn-positions-heading" className="font-stitch-head text-lg font-extrabold text-[#302e2b] dark:text-stone-100">
                Withdrawn
              </h2>
              <p className="text-ink-muted mt-1 text-xs dark:text-stone-500">Roles pulled or closed without a hire.</p>
              {withdrawn.length === 0 ? (
                <p className="text-ink-muted mt-3 text-sm">None in this category.</p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {withdrawn.map((p) => (
                    <PositionListRow key={p.id} p={p} />
                  ))}
                </ul>
              )}
            </section>
          ) : null}
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
  const [requirementItemValues, setRequirementItemValues] = useState<string[]>(d0.requirementItemValues ?? [])
  const [pending, setPending] = useState(false)

  useEffect(() => {
    saveDraft({ step, companyId, title, industry, status, plannedFee, requirementItemValues })
  }, [step, companyId, title, industry, status, plannedFee, requirementItemValues])

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
        requirement_item_values: requirementItemValues,
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
        <p className="font-stitch-head text-sm font-extrabold tracking-wide text-[#302e2b] uppercase dark:text-stone-100">
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
            <div className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Requirements (optional)</span>
              <RequirementsMultiSelect value={requirementItemValues} onChange={setRequirementItemValues} disabled={pending} />
            </div>
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
              {requirementItemValues.length ? requirementItemValues.join(', ') : '—'}
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
