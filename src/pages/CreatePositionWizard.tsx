import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { Briefcase, Building2, ChevronDown, ChevronUp, Coins, Plus, Sparkles, Trash2 } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'

import { useAuth } from '@/auth/useAuth'
import { getSupabase } from '@/lib/supabase'
import { logActivityEvent } from '@/lib/activityLog'
import { useToast } from '@/hooks/useToast'
import { isMissingRequirementsColumnError, parseRequirementTokens } from '@/lib/requirementValues'

const DRAFT_KEY = 'yulis_position_wizard_draft'

export const WIZARD_STEPS = ['Basics', 'Workflow', 'Candidates', 'Summary'] as const

export type StageDraft = {
  name: string
  description: string
  interviewers: string
  durationMinutes: string
  isRemote: boolean
}

type Draft = {
  step: number
  companyId: string
  openedAt: string
  title: string
  industry: string
  salaryBudget: string
  plannedFee: string
  requirements: string
  hiringManagerName: string
  hiringManagerEmail: string
  hiringManagerPhone: string
  stages: StageDraft[]
  welcome1: string
  welcome2: string
  welcome3: string
  linkedinUrl: string
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

function emptyStage(): StageDraft {
  return { name: '', description: '', interviewers: '', durationMinutes: '', isRemote: false }
}

function wizardSectionClass(): string {
  return 'rounded-2xl border border-stone-200/90 bg-stone-50/40 p-4 dark:border-stone-600/80 dark:bg-stone-900/35'
}

/** Keeps label text, * and “(optional)” on one line; avoids flex-col splitting text and * into separate rows. */
function FieldLabel({
  children,
  required,
  optionalHint,
}: {
  children: ReactNode
  required?: boolean
  optionalHint?: string
}) {
  return (
    <span className="inline-flex max-w-full flex-wrap items-baseline gap-x-1">
      <span className="min-w-0">{children}</span>
      {required ? (
        <abbr title="Required" className="shrink-0 cursor-help text-rose-600 no-underline dark:text-rose-400">
          *
        </abbr>
      ) : null}
      {optionalHint ? <span className="text-ink-muted shrink-0 font-normal">{optionalHint}</span> : null}
    </span>
  )
}

const dateInputClass =
  'border-line w-full max-w-full rounded-xl border bg-white px-3 py-2.5 text-left text-base shadow-sm [direction:ltr] dark:border-line-dark dark:bg-stone-900/80 [&::-webkit-datetime-edit]:inline-flex [&::-webkit-datetime-edit]:justify-start'

function parseOptionalNumber(raw: string): number | null {
  const t = raw.trim().replace(/\s/g, '').replace(',', '.')
  if (!t) return null
  const n = Number(t)
  if (!Number.isFinite(n) || n < 0) return null
  return n
}

export function CreatePositionWizard({ companies }: { companies: { id: string; name: string; status?: string }[] }) {
  const { user } = useAuth()
  const supabase = getSupabase()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { success, error: toastError } = useToast()
  const d0 = loadDraft()
  const [step, setStep] = useState(Math.min(3, Math.max(0, d0.step ?? 0)))
  const [companyId, setCompanyId] = useState(d0.companyId ?? companies[0]?.id ?? '')
  const [openedAt, setOpenedAt] = useState(d0.openedAt ?? new Date().toISOString().slice(0, 10))
  const [title, setTitle] = useState(d0.title ?? '')
  const [industry, setIndustry] = useState(d0.industry ?? '')
  const [salaryBudget, setSalaryBudget] = useState(d0.salaryBudget ?? '')
  const [plannedFee, setPlannedFee] = useState(d0.plannedFee ?? '')
  const [requirements, setRequirements] = useState(
    typeof d0.requirements === 'string'
      ? d0.requirements
      : Array.isArray((d0 as { requirementItemValues?: string[] }).requirementItemValues)
        ? ((d0 as { requirementItemValues: string[] }).requirementItemValues ?? []).join('\n')
        : '',
  )
  const [hiringManagerName, setHiringManagerName] = useState(d0.hiringManagerName ?? '')
  const [hiringManagerEmail, setHiringManagerEmail] = useState(d0.hiringManagerEmail ?? '')
  const [hiringManagerPhone, setHiringManagerPhone] = useState(d0.hiringManagerPhone ?? '')
  const [stages, setStages] = useState<StageDraft[]>(
    Array.isArray(d0.stages) && d0.stages.length ? d0.stages : [emptyStage()],
  )
  const [welcome1, setWelcome1] = useState(d0.welcome1 ?? '')
  const [welcome2, setWelcome2] = useState(d0.welcome2 ?? '')
  const [welcome3, setWelcome3] = useState(d0.welcome3 ?? '')
  const [linkedinUrl, setLinkedinUrl] = useState(d0.linkedinUrl ?? '')
  const [pending, setPending] = useState(false)

  useEffect(() => {
    saveDraft({
      step,
      companyId,
      openedAt,
      title,
      industry,
      salaryBudget,
      plannedFee,
      requirements,
      hiringManagerName,
      hiringManagerEmail,
      hiringManagerPhone,
      stages,
      welcome1,
      welcome2,
      welcome3,
      linkedinUrl,
    })
  }, [
    step,
    companyId,
    openedAt,
    title,
    industry,
    salaryBudget,
    plannedFee,
    requirements,
    hiringManagerName,
    hiringManagerEmail,
    hiringManagerPhone,
    stages,
    welcome1,
    welcome2,
    welcome3,
    linkedinUrl,
  ])

  const feeIls = parseOptionalNumber(plannedFee)
  const salaryNum = parseOptionalNumber(salaryBudget)

  async function onCreate() {
    if (!supabase || !user || !companyId) return
    if (plannedFee.trim() && feeIls == null) {
      toastError('Recruitment fee must be a valid number, or leave it empty.')
      return
    }
    if (salaryBudget.trim() && salaryNum == null) {
      toastError('Salary budget must be a valid number, or leave it empty.')
      return
    }
    if (!stages.length || !stages.every((s) => s.name.trim())) {
      toastError('Each workflow stage needs a name.')
      return
    }
    setPending(true)
    const trimmedReq = requirements.trim()
    const baseRow = {
      user_id: user.id,
      company_id: companyId,
      title: title.trim() || 'New position',
      industry: industry.trim() || null,
      status: 'active' as const,
      planned_fee_ils: feeIls,
      salary_budget: salaryNum,
      opened_at: openedAt,
      hiring_manager_name: hiringManagerName.trim() || null,
      hiring_manager_email: hiringManagerEmail.trim() || null,
      hiring_manager_phone: hiringManagerPhone.trim() || null,
      welcome_1: welcome1.trim() || null,
      welcome_2: welcome2.trim() || null,
      welcome_3: welcome3.trim() || null,
      linkedin_saved_search_url: linkedinUrl.trim() || null,
    }

    let data: { id: string; title: string } | null = null
    let err: { message: string } | null = null

    if (trimmedReq) {
      const tryText = await supabase.from('positions').insert({ ...baseRow, requirements: trimmedReq }).select('id, title').single()
      if (!tryText.error) {
        data = tryText.data as { id: string; title: string }
      } else if (isMissingRequirementsColumnError(tryText.error.message)) {
        const tokens = parseRequirementTokens(requirements)
        const tryArr = await supabase
          .from('positions')
          .insert({ ...baseRow, requirement_item_values: tokens } as never)
          .select('id, title')
          .single()
        data = tryArr.data as { id: string; title: string } | null
        err = tryArr.error
      } else {
        err = tryText.error
      }
    } else {
      const ins = await supabase.from('positions').insert(baseRow).select('id, title').single()
      data = ins.data as { id: string; title: string } | null
      err = ins.error
    }

    if (err) {
      setPending(false)
      toastError(err.message)
      return
    }
    const posId = data!.id
    const posTitle = data!.title ?? 'Role'

    for (let i = 0; i < stages.length; i++) {
      const s = stages[i]!
      const dm = parseOptionalNumber(s.durationMinutes)
      await supabase.from('position_stages').insert({
        user_id: user.id,
        position_id: posId,
        sort_order: i,
        name: s.name.trim(),
        description: s.description.trim() || null,
        interviewers: s.interviewers.trim() || null,
        duration_minutes: dm != null ? Math.round(dm) : null,
        is_remote: s.isRemote,
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

  const canStep0 = Boolean(companyId && title.trim())
  const canStep1 = stages.length > 0 && stages.every((s) => s.name.trim())

  function moveStage(i: number, dir: -1 | 1) {
    const j = i + dir
    if (j < 0 || j >= stages.length) return
    const next = [...stages]
    ;[next[i], next[j]] = [next[j]!, next[i]!]
    setStages(next)
  }

  const stepHint =
    step === 0
      ? 'Client, opened date, title, budgets, job description, and hiring manager contact.'
      : step === 1
        ? 'Add at least one stage. Reorder with the arrows.'
        : step === 2
          ? 'Welcome approaches and LinkedIn filter. Import candidates from Excel on the role page after creation.'
          : 'Review everything, then confirm.'

  return (
    <div className="border-line overflow-hidden rounded-3xl border border-stone-200/80 bg-white shadow-sm dark:border-line-dark dark:bg-stone-900/60 dark:shadow-none">
      <div className="from-[#fd8863]/20 via-[#97daff]/15 to-[#b4fdb4]/15 border-b border-stone-200/80 bg-gradient-to-br px-5 py-4 dark:border-stone-600 dark:from-orange-950/40 dark:via-stone-900 dark:to-stone-900">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-accent flex items-center gap-2 text-[11px] font-bold tracking-[0.2em] uppercase dark:text-orange-300">
              <Sparkles className="h-3.5 w-3.5" aria-hidden />
              New role
            </p>
            <h2 className="mt-1 text-lg font-extrabold tracking-tight text-[#302e2b] dark:text-stone-100">{WIZARD_STEPS[step]}</h2>
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
        <p className="text-ink-muted mt-2 text-xs dark:text-stone-400">{stepHint}</p>
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
                <FieldLabel required>Company</FieldLabel>
                <select
                  value={companyId}
                  onChange={(e) => setCompanyId(e.target.value)}
                  className="border-line rounded-xl border bg-white px-3 py-2.5 text-base shadow-sm dark:border-line-dark dark:bg-stone-900/80"
                  required
                >
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                      {c.status === 'inactive' ? ' (inactive)' : ''}
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
                  <FieldLabel required>Opened on</FieldLabel>
                  <input
                    type="date"
                    value={openedAt}
                    onChange={(e) => setOpenedAt(e.target.value)}
                    className={dateInputClass}
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-sm font-medium text-[#302e2b] dark:text-stone-200">
                  <FieldLabel required>Role title</FieldLabel>
                  <input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="border-line rounded-xl border bg-white px-3 py-2.5 text-base shadow-sm dark:border-line-dark dark:bg-stone-900/80"
                    placeholder="e.g. Senior Software Engineer"
                    autoComplete="off"
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-sm font-medium text-[#302e2b] dark:text-stone-200">
                  <FieldLabel optionalHint="(optional)">Industry</FieldLabel>
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
                <FieldLabel optionalHint="(optional)">Job description</FieldLabel>
                <textarea
                  value={requirements}
                  onChange={(e) => setRequirements(e.target.value)}
                  disabled={pending}
                  rows={6}
                  placeholder="Paste job description or client brief."
                  className="border-line resize-y rounded-xl border bg-white px-3 py-2.5 text-sm leading-relaxed shadow-sm dark:border-line-dark dark:bg-stone-900/80"
                />
              </label>
            </div>

            <div className={wizardSectionClass()}>
              <div className="text-ink-muted mb-3 flex items-center gap-2 text-xs font-bold tracking-wide uppercase dark:text-stone-500">
                <Coins className="h-4 w-4 text-[#9b3e20] dark:text-orange-400" aria-hidden />
                Budgets
              </div>
              <div className="flex flex-col gap-4">
                <label className="flex flex-col gap-1.5 text-sm font-medium text-[#302e2b] dark:text-stone-200">
                  <FieldLabel optionalHint="(optional, single amount)">Client salary budget</FieldLabel>
                  <input
                    value={salaryBudget}
                    onChange={(e) => setSalaryBudget(e.target.value)}
                    className="border-line rounded-xl border bg-white px-3 py-2.5 text-base shadow-sm dark:border-line-dark dark:bg-stone-900/80"
                    placeholder="e.g. 25000"
                    inputMode="decimal"
                    autoComplete="off"
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-sm font-medium text-[#302e2b] dark:text-stone-200">
                  <FieldLabel optionalHint="(optional)">Recruitment fee (₪)</FieldLabel>
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

            <div className={wizardSectionClass()}>
              <div className="text-ink-muted mb-3 text-xs font-bold tracking-wide uppercase dark:text-stone-500">Hiring manager</div>
              <div className="flex flex-col gap-3">
                <label className="flex flex-col gap-1.5 text-sm font-medium text-[#302e2b] dark:text-stone-200">
                  <FieldLabel optionalHint="(optional)">Name</FieldLabel>
                  <input
                    value={hiringManagerName}
                    onChange={(e) => setHiringManagerName(e.target.value)}
                    placeholder="Full name"
                    className="border-line rounded-xl border bg-white px-3 py-2.5 text-sm dark:border-line-dark dark:bg-stone-900/80"
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-sm font-medium text-[#302e2b] dark:text-stone-200">
                  <FieldLabel optionalHint="(optional)">Email</FieldLabel>
                  <input
                    value={hiringManagerEmail}
                    onChange={(e) => setHiringManagerEmail(e.target.value)}
                    placeholder="name@company.com"
                    type="email"
                    autoComplete="email"
                    className="border-line rounded-xl border bg-white px-3 py-2.5 text-sm dark:border-line-dark dark:bg-stone-900/80"
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-sm font-medium text-[#302e2b] dark:text-stone-200">
                  <FieldLabel optionalHint="(optional)">Phone</FieldLabel>
                  <input
                    value={hiringManagerPhone}
                    onChange={(e) => setHiringManagerPhone(e.target.value)}
                    placeholder="+972…"
                    type="tel"
                    autoComplete="tel"
                    className="border-line rounded-xl border bg-white px-3 py-2.5 text-sm dark:border-line-dark dark:bg-stone-900/80"
                  />
                </label>
              </div>
            </div>
          </div>
        ) : null}

        {step === 1 ? (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-ink-muted text-sm dark:text-stone-400">Define your interview workflow for this role.</p>
              <button
                type="button"
                onClick={() => setStages((s) => [...s, emptyStage()])}
                className="inline-flex items-center gap-1 rounded-full border border-stone-300 px-3 py-1.5 text-xs font-bold dark:border-stone-600"
              >
                <Plus className="h-3.5 w-3.5" aria-hidden />
                Add stage
              </button>
            </div>
            <ul className="space-y-3">
              {stages.map((s, i) => (
                <li key={i} className={wizardSectionClass()}>
                  <div className="mb-4 flex items-start justify-between gap-3 border-b border-stone-200/80 pb-3 dark:border-stone-600">
                    <div className="min-w-0 flex-1">
                      <input
                        value={s.name}
                        onChange={(e) => {
                          const v = e.target.value
                          setStages((prev) => prev.map((row, j) => (j === i ? { ...row, name: v } : row)))
                        }}
                        placeholder="Stage name"
                        required
                        aria-label="Stage name (required)"
                        className="placeholder:text-stitch-muted w-full border-0 bg-transparent text-xl font-extrabold tracking-tight text-[#302e2b] outline-none ring-0 placeholder:font-semibold focus:ring-0 dark:text-stone-100 dark:placeholder:text-stone-500 md:text-2xl"
                      />
                      <p className="text-ink-muted mt-1 text-[11px] font-semibold uppercase tracking-wide dark:text-stone-500">
                        Stage {i + 1}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <button
                        type="button"
                        className="border-line text-ink-muted hover:bg-stone-50 dark:hover:bg-stone-800 flex h-9 w-9 items-center justify-center rounded-xl border bg-white/90 shadow-sm transition disabled:cursor-not-allowed disabled:opacity-35 dark:border-line-dark dark:bg-stone-900/80"
                        onClick={() => moveStage(i, -1)}
                        disabled={i === 0}
                        aria-label="Move stage up"
                      >
                        <ChevronUp className="h-4 w-4" aria-hidden />
                      </button>
                      <button
                        type="button"
                        className="border-line text-ink-muted hover:bg-stone-50 dark:hover:bg-stone-800 flex h-9 w-9 items-center justify-center rounded-xl border bg-white/90 shadow-sm transition disabled:cursor-not-allowed disabled:opacity-35 dark:border-line-dark dark:bg-stone-900/80"
                        onClick={() => moveStage(i, 1)}
                        disabled={i === stages.length - 1}
                        aria-label="Move stage down"
                      >
                        <ChevronDown className="h-4 w-4" aria-hidden />
                      </button>
                      <button
                        type="button"
                        className="border-line text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/40 flex h-9 w-9 items-center justify-center rounded-xl border border-rose-200 bg-white/90 shadow-sm transition disabled:cursor-not-allowed disabled:opacity-35 dark:border-rose-900/50 dark:bg-stone-900/80 dark:text-rose-300"
                        onClick={() => stages.length > 1 && setStages((prev) => prev.filter((_, j) => j !== i))}
                        disabled={stages.length <= 1}
                        aria-label="Remove stage"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden />
                      </button>
                    </div>
                  </div>
                  <div className="flex flex-col gap-4 md:flex-row md:items-start md:gap-6">
                    <label className="flex max-w-xl flex-1 flex-col gap-1.5 text-sm font-medium text-[#302e2b] dark:text-stone-200">
                      <FieldLabel optionalHint="(optional)">Description</FieldLabel>
                      <textarea
                        value={s.description}
                        onChange={(e) => {
                          const v = e.target.value
                          setStages((prev) => prev.map((row, j) => (j === i ? { ...row, description: v } : row)))
                        }}
                        rows={2}
                        placeholder="What happens in this stage"
                        className="border-line max-w-xl rounded-xl border bg-white px-3 py-2 text-sm dark:border-line-dark dark:bg-stone-900/80"
                      />
                    </label>
                    <div className="flex min-w-0 shrink-0 flex-col gap-3 md:w-56">
                      <label className="flex flex-col gap-1.5 text-sm font-medium text-[#302e2b] dark:text-stone-200">
                        <FieldLabel optionalHint="(optional)">Interviewers</FieldLabel>
                        <input
                          value={s.interviewers}
                          onChange={(e) => {
                            const v = e.target.value
                            setStages((prev) => prev.map((row, j) => (j === i ? { ...row, interviewers: v } : row)))
                          }}
                          placeholder="Names or emails"
                          className="border-line rounded-xl border bg-white px-3 py-2 text-sm dark:border-line-dark dark:bg-stone-900/80"
                        />
                      </label>
                      <div className="flex flex-wrap items-end gap-3">
                        <label className="flex min-w-0 flex-1 flex-col gap-1.5 text-sm font-medium text-[#302e2b] dark:text-stone-200">
                          <FieldLabel optionalHint="(optional)">Duration (min)</FieldLabel>
                          <input
                            value={s.durationMinutes}
                            onChange={(e) => {
                              const v = e.target.value
                              setStages((prev) => prev.map((row, j) => (j === i ? { ...row, durationMinutes: v } : row)))
                            }}
                            className="border-line rounded-xl border bg-white px-2 py-1.5 text-sm dark:border-line-dark dark:bg-stone-900/80"
                            inputMode="numeric"
                            placeholder="e.g. 45"
                          />
                        </label>
                        <label className="text-ink-muted flex shrink-0 cursor-pointer items-center gap-2 pb-2 text-sm dark:text-stone-400">
                          <input
                            type="checkbox"
                            checked={s.isRemote}
                            onChange={(e) => {
                              const v = e.target.checked
                              setStages((prev) => prev.map((row, j) => (j === i ? { ...row, isRemote: v } : row)))
                            }}
                            className="rounded border-stone-300 dark:border-stone-600"
                          />
                          <span className="font-medium text-[#302e2b] dark:text-stone-200">Remote</span>
                        </label>
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="flex flex-col gap-5">
            <div className={wizardSectionClass()}>
              <p className="text-ink-muted mb-3 text-xs font-bold uppercase dark:text-stone-500">Welcome approaches</p>
              <div className="flex flex-col gap-4">
                <label className="flex flex-col gap-1.5 text-sm font-medium text-[#302e2b] dark:text-stone-200">
                  <FieldLabel optionalHint="(optional)">Welcome message 1</FieldLabel>
                  <textarea
                    value={welcome1}
                    onChange={(e) => setWelcome1(e.target.value)}
                    rows={3}
                    placeholder="First outreach angle…"
                    className="border-line w-full rounded-xl border bg-white px-3 py-2 text-sm dark:border-line-dark dark:bg-stone-900/80"
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-sm font-medium text-[#302e2b] dark:text-stone-200">
                  <FieldLabel optionalHint="(optional)">Welcome message 2</FieldLabel>
                  <textarea
                    value={welcome2}
                    onChange={(e) => setWelcome2(e.target.value)}
                    rows={3}
                    placeholder="Second angle…"
                    className="border-line w-full rounded-xl border bg-white px-3 py-2 text-sm dark:border-line-dark dark:bg-stone-900/80"
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-sm font-medium text-[#302e2b] dark:text-stone-200">
                  <FieldLabel optionalHint="(optional)">Welcome message 3</FieldLabel>
                  <textarea
                    value={welcome3}
                    onChange={(e) => setWelcome3(e.target.value)}
                    rows={3}
                    placeholder="Third angle…"
                    className="border-line w-full rounded-xl border bg-white px-3 py-2 text-sm dark:border-line-dark dark:bg-stone-900/80"
                  />
                </label>
              </div>
            </div>
            <label className="flex flex-col gap-1.5 text-sm font-medium text-[#302e2b] dark:text-stone-200">
              <FieldLabel optionalHint="(optional)">LinkedIn saved filter URL</FieldLabel>
              <input
                value={linkedinUrl}
                onChange={(e) => setLinkedinUrl(e.target.value)}
                className="border-line rounded-xl border bg-white px-3 py-2 dark:border-line-dark dark:bg-stone-900/80"
                placeholder="https://…"
                autoComplete="off"
              />
            </label>
            <p className="text-ink-muted text-xs dark:text-stone-500">
              After the role is created, open <strong>Role setup</strong> on the position to import candidates from Excel.
            </p>
          </div>
        ) : null}

        {step === 3 ? (
          <div className="rounded-2xl border border-stone-200/90 bg-stone-50/50 p-5 dark:border-stone-600 dark:bg-stone-900/40">
            <h3 className="text-sm font-extrabold text-[#302e2b] dark:text-stone-100">Summary</h3>
            <dl className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between gap-2 border-b border-stone-200/70 pb-2 dark:border-stone-600/80">
                <dt className="text-ink-muted">Company</dt>
                <dd className="font-semibold">{companies.find((c) => c.id === companyId)?.name ?? '—'}</dd>
              </div>
              <div className="flex justify-between gap-2 border-b border-stone-200/70 pb-2 dark:border-stone-600/80">
                <dt className="text-ink-muted">Opened</dt>
                <dd className="font-semibold">{openedAt}</dd>
              </div>
              <div className="flex justify-between gap-2 border-b border-stone-200/70 pb-2 dark:border-stone-600/80">
                <dt className="text-ink-muted">Title</dt>
                <dd className="font-semibold">{title.trim() || '—'}</dd>
              </div>
              <div className="flex justify-between gap-2 border-b border-stone-200/70 pb-2 dark:border-stone-600/80">
                <dt className="text-ink-muted">Stages</dt>
                <dd className="max-w-[14rem] text-right font-semibold">{stages.map((s) => s.name.trim()).join(' → ')}</dd>
              </div>
              <div className="flex justify-between gap-2 border-b border-stone-200/70 pb-2 dark:border-stone-600/80">
                <dt className="text-ink-muted">Salary budget</dt>
                <dd className="font-semibold">{salaryNum != null ? String(salaryNum) : '—'}</dd>
              </div>
              <div className="flex justify-between gap-2 border-b border-stone-200/70 pb-2 dark:border-stone-600/80">
                <dt className="text-ink-muted">Recruitment fee</dt>
                <dd className="font-semibold">{feeIls != null ? `₪${feeIls.toLocaleString('he-IL')}` : '—'}</dd>
              </div>
            </dl>
            <p className="text-ink-muted mt-3 text-xs">Status will start as <strong>Active</strong>.</p>
          </div>
        ) : null}

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
          {step < 3 ? (
            <button
              type="button"
              disabled={
                (step === 0 && !canStep0) || (step === 1 && !canStep1)
              }
              className="rounded-full bg-gradient-to-r from-[#9b3e20] to-[#fd8863] px-6 py-2.5 text-sm font-bold text-white shadow-md disabled:cursor-not-allowed disabled:opacity-45 dark:shadow-none"
              onClick={() => {
                if (step === 0 && !canStep0) return
                if (step === 1 && !canStep1) return
                setStep((s) => s + 1)
              }}
            >
              Continue
            </button>
          ) : (
            <button
              type="button"
              disabled={pending || !title.trim() || !canStep1}
              className="rounded-full bg-gradient-to-r from-[#9b3e20] to-[#fd8863] px-6 py-2.5 text-sm font-bold text-white shadow-md disabled:cursor-not-allowed disabled:opacity-45 dark:shadow-none"
              onClick={() => void onCreate()}
            >
              {pending ? 'Creating…' : 'Confirm & create'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
