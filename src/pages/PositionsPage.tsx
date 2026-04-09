import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'

import { useAuth } from '@/auth/useAuth'
import { getSupabase } from '@/lib/supabase'
import { ScreenHeader } from '@/components/layout/ScreenHeader'
import { logActivityEvent } from '@/lib/activityLog'
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

export function PositionsPage() {
  const { user } = useAuth()
  const supabase = getSupabase()
  const [search] = useSearchParams()
  const [companyFilter, setCompanyFilter] = useState<string>('')
  const [statusFilter, setStatusFilter] = useState<string>('')

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
        .select('id, title, status, company_id, companies ( name )')
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

  return (
    <div className="flex flex-col gap-6">
      <ScreenHeader
        title="Positions"
        subtitle="Roles you’re hiring for — add tasks from each role."
        backTo="/"
        right={
          <Link
            to="/positions?create=1"
            className="rounded-full bg-gradient-to-r from-[#9b3e20] to-[#fd8863] px-4 py-2 text-sm font-bold text-white shadow-md"
          >
            New role
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

      <div className="flex flex-wrap gap-3">
        <label className="text-sm font-medium">
          Company
          <select
            value={companyFilter}
            onChange={(e) => setCompanyFilter(e.target.value)}
            className="border-line bg-white/80 focus:ring-accent ml-2 rounded-xl border px-3 py-2 outline-none focus:ring-2 dark:bg-stone-900/50 dark:border-line-dark"
          >
            <option value="">All</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-medium">
          Status
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="border-line bg-white/80 focus:ring-accent ml-2 rounded-xl border px-3 py-2 outline-none focus:ring-2 dark:bg-stone-900/50 dark:border-line-dark"
          >
            <option value="">All</option>
            {['pending', 'in_progress', 'success', 'cancelled'].map((s) => (
              <option key={s} value={s}>
                {s.replace('_', ' ')}
              </option>
            ))}
          </select>
        </label>
      </div>

      {positionsQ.isLoading ? (
        <p className="text-ink-muted text-sm">Loading…</p>
      ) : (positionsQ.data ?? []).length === 0 ? (
        <p className="text-ink-muted text-sm">No positions yet.</p>
      ) : (
        <ul className="space-y-2">
          {(positionsQ.data ?? []).map((p) => {
            const co = p.companies as unknown as { name: string } | null
            return (
              <li key={p.id}>
                <Link
                  to={`/positions/${p.id}`}
                  className="border-line bg-white/70 hover:border-accent flex flex-wrap items-baseline justify-between gap-2 rounded-2xl border px-4 py-4 dark:border-line-dark dark:bg-stone-900/45"
                >
                  <span className="font-display font-semibold">{p.title}</span>
                  <span className="text-ink-muted text-sm dark:text-stone-400">
                    {co?.name ?? '—'} · {p.status.replace('_', ' ')}
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
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
  const [pending, setPending] = useState(false)

  useEffect(() => {
    saveDraft({ step, companyId, title, industry, status, plannedFee })
  }, [step, companyId, title, industry, status, plannedFee])

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
