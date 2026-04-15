import { Link, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { differenceInCalendarDays } from 'date-fns'
import { Mail, Plus } from 'lucide-react'
import { useMemo } from 'react'

import { useAuth } from '@/auth/useAuth'
import { getSupabase } from '@/lib/supabase'
import { buildMailto } from '@/lib/mailto'
import { ScreenHeader } from '@/components/layout/ScreenHeader'

function formatIls(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '—'
  return `₪${Math.round(n).toLocaleString('he-IL')}`
}

function formatSuccessRatio(succeeded: number, cancelled: number): string {
  const closed = succeeded + cancelled
  if (closed <= 0) return '—'
  return `${Math.round((succeeded / closed) * 100)}%`
}

type PositionIncomeRow = {
  company_id: string | null
  planned_fee_ils: number | string | null
  actual_fee_ils: number | string | null
  status: string
}

type CompanyStats = {
  succeeded: number
  cancelled: number
  open: number
  earned: number
  missed: number
  pending: number
}

function emptyStats(): CompanyStats {
  return { succeeded: 0, cancelled: 0, open: 0, earned: 0, missed: 0, pending: 0 }
}

function num(v: number | string | null | undefined): number {
  if (v == null) return NaN
  const n = typeof v === 'string' ? Number(v) : v
  return Number.isFinite(n) ? n : NaN
}

export function CompaniesPage() {
  const { user } = useAuth()
  const supabase = getSupabase()
  const [searchParams, setSearchParams] = useSearchParams()
  const sendEmailMode = searchParams.get('sendEmail') === '1'

  const q = useQuery({
    queryKey: ['companies', user?.id],
    enabled: Boolean(supabase && user),
    queryFn: async () => {
      const { data, error } = await supabase!
        .from('companies')
        .select('id, name, contact_email, created_at, status')
        .eq('user_id', user!.id)
        .is('deleted_at', null)
        .order('name')
      if (error) throw error
      return data ?? []
    },
  })

  const positionsIncomeQ = useQuery({
    queryKey: ['companies-positions-income', user?.id],
    enabled: Boolean(supabase && user),
    queryFn: async () => {
      const { data, error } = await supabase!
        .from('positions')
        .select('company_id, planned_fee_ils, actual_fee_ils, status')
        .eq('user_id', user!.id)
        .is('deleted_at', null)
      if (error) throw error
      return (data ?? []) as PositionIncomeRow[]
    },
  })

  const statsByCompany = useMemo(() => {
    const m = new Map<string, CompanyStats>()
    for (const p of positionsIncomeQ.data ?? []) {
      const cid = p.company_id
      if (!cid) continue
      const s = m.get(cid) ?? emptyStats()
      const st = p.status
      const planned = num(p.planned_fee_ils)
      const plannedOk = planned > 0
      const actual = num(p.actual_fee_ils)

      if (st === 'succeeded') {
        s.succeeded += 1
        const earnedAdd = actual > 0 ? actual : plannedOk ? planned : 0
        s.earned += earnedAdd
      } else if (st === 'cancelled') {
        s.cancelled += 1
        if (plannedOk) s.missed += planned
      } else if (st === 'active' || st === 'on_hold') {
        s.open += 1
        if (plannedOk) s.pending += planned
      }
      m.set(cid, s)
    }
    return m
  }, [positionsIncomeQ.data])

  const loadingIncome = positionsIncomeQ.isLoading

  return (
    <div className="flex flex-col gap-6">
      <ScreenHeader
        title="Companies"
        subtitle={sendEmailMode ? 'Choose a client to open your mail app — add a contact email on their profile if missing.' : 'Clients you recruit for.'}
        backTo="/"
        right={
          <Link
            to="/companies/new"
            className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-r from-[#9b3e20] to-[#fd8863] text-white shadow-sm transition hover:brightness-105 dark:from-orange-700 dark:to-orange-500"
            aria-label="New company"
            title="New company"
          >
            <Plus className="h-7 w-7 stroke-[2.5]" strokeLinecap="round" strokeLinejoin="round" aria-hidden />
          </Link>
        }
      />

      {sendEmailMode ? (
        <div className="border-line flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-violet-200/80 bg-violet-50/80 px-4 py-3 dark:border-violet-900/40 dark:bg-violet-950/30">
          <p className="text-sm font-medium text-violet-950 dark:text-violet-100">Send An Email — clients with an address show a mail button.</p>
          <button
            type="button"
            className="shrink-0 rounded-full border border-violet-300 px-3 py-1 text-xs font-bold dark:border-violet-700"
            onClick={() => setSearchParams({}, { replace: true })}
          >
            Done
          </button>
        </div>
      ) : null}

      {q.isLoading ? (
        <p className="text-ink-muted text-sm">Loading…</p>
      ) : (q.data ?? []).length === 0 ? (
        <p className="text-ink-muted text-sm">No companies yet. Add your first client.</p>
      ) : (
        <ul className="space-y-3">
          {(q.data ?? []).map((c) => {
            const daysSince = differenceInCalendarDays(new Date(), new Date(c.created_at))
            const st = statsByCompany.get(c.id) ?? emptyStats()
            const ratio = formatSuccessRatio(st.succeeded, st.cancelled)
            return (
              <li key={c.id}>
                <div className="border-line bg-white/70 flex flex-wrap items-stretch gap-2 rounded-2xl border px-4 py-4 dark:border-line-dark dark:bg-stone-900/45">
                  <Link
                    to={`/companies/${c.id}`}
                    className="hover:border-accent min-w-0 flex-1 flex flex-col gap-3 rounded-xl border border-transparent transition-colors dark:hover:border-orange-400/40"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <span className="min-w-0 flex-1 text-base leading-snug font-semibold break-words">
                        {c.name}
                        {c.status === 'inactive' ? (
                          <span className="text-ink-muted ml-2 align-middle text-xs font-bold normal-case">Inactive</span>
                        ) : null}
                      </span>
                      <span
                        className="shrink-0 rounded-xl bg-gradient-to-br from-[#fd8863]/35 to-[#97daff]/40 px-2.5 py-1 text-xs font-extrabold tabular-nums text-[#9b3e20] ring-1 ring-[#9b3e20]/25 dark:from-orange-500/30 dark:to-cyan-500/25 dark:text-orange-200 dark:ring-orange-400/35"
                        title="Days since this client was added"
                      >
                        {daysSince}d
                      </span>
                    </div>
                    {c.contact_email ? <span className="text-ink-muted text-sm">{c.contact_email}</span> : null}
                    {sendEmailMode && !c.contact_email ? (
                      <span className="text-ink-muted text-xs">No email on file — open profile to add one.</span>
                    ) : null}

                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="border-stitch-on-surface/10 rounded-xl border border-stone-200/80 bg-stone-50/80 p-3 dark:border-stone-600 dark:bg-stone-800/40">
                        <p className="text-ink-muted text-[10px] font-bold tracking-wide uppercase dark:text-stone-500">Positions</p>
                        <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-2 text-xs sm:grid-cols-4">
                          <div>
                            <dt className="text-ink-muted font-medium dark:text-stone-400">Succeeded</dt>
                            <dd className="text-stitch-on-surface text-lg font-bold tabular-nums dark:text-stone-100">
                              {loadingIncome ? '…' : st.succeeded}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-ink-muted font-medium dark:text-stone-400">Failed</dt>
                            <dd className="text-stitch-on-surface text-lg font-bold tabular-nums dark:text-stone-100">
                              {loadingIncome ? '…' : st.cancelled}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-ink-muted font-medium dark:text-stone-400">Open</dt>
                            <dd className="text-stitch-on-surface text-lg font-bold tabular-nums dark:text-stone-100">
                              {loadingIncome ? '…' : st.open}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-ink-muted font-medium dark:text-stone-400">Success ratio</dt>
                            <dd
                              className="text-stitch-on-surface text-lg font-bold tabular-nums dark:text-stone-100"
                              title="Succeeded ÷ (succeeded + cancelled). Open roles are excluded."
                            >
                              {loadingIncome ? '…' : ratio}
                            </dd>
                          </div>
                        </dl>
                      </div>

                      <div className="border-stitch-on-surface/10 rounded-xl border border-stone-200/80 bg-stone-50/80 p-3 dark:border-stone-600 dark:bg-stone-800/40">
                        <p className="text-ink-muted text-[10px] font-bold tracking-wide uppercase dark:text-stone-500">Income (₪)</p>
                        <dl className="mt-2 grid grid-cols-1 gap-2 text-xs sm:grid-cols-3">
                          <div>
                            <dt className="text-ink-muted font-medium dark:text-stone-400">Earned</dt>
                            <dd className="text-stitch-on-surface text-base font-bold tabular-nums dark:text-stone-100">
                              {loadingIncome ? '…' : formatIls(st.earned)}
                            </dd>
                            <dd className="text-ink-muted mt-0.5 text-[10px] leading-tight dark:text-stone-500">Realized on succeeded roles</dd>
                          </div>
                          <div>
                            <dt className="text-ink-muted font-medium dark:text-stone-400">Missed</dt>
                            <dd className="text-stitch-on-surface text-base font-bold tabular-nums dark:text-stone-100">
                              {loadingIncome ? '…' : formatIls(st.missed)}
                            </dd>
                            <dd className="text-ink-muted mt-0.5 text-[10px] leading-tight dark:text-stone-500">Planned fees on cancelled roles</dd>
                          </div>
                          <div>
                            <dt className="text-ink-muted font-medium dark:text-stone-400">Pending</dt>
                            <dd className="text-stitch-on-surface text-base font-bold tabular-nums dark:text-stone-100">
                              {loadingIncome ? '…' : formatIls(st.pending)}
                            </dd>
                            <dd className="text-ink-muted mt-0.5 text-[10px] leading-tight dark:text-stone-500">Planned on open / on-hold roles</dd>
                          </div>
                        </dl>
                      </div>
                    </div>
                  </Link>
                  {sendEmailMode && c.contact_email ? (
                    <a
                      href={buildMailto({
                        to: c.contact_email,
                        subject: `Re: ${c.name}`,
                        body: 'Hi,\n\n',
                      })}
                      className="inline-flex shrink-0 items-center justify-center gap-2 self-center rounded-xl bg-violet-600 px-4 py-2 text-sm font-bold text-white dark:bg-violet-700"
                    >
                      <Mail className="h-4 w-4" aria-hidden />
                      Email
                    </a>
                  ) : null}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
