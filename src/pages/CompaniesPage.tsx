import { Link, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { differenceInCalendarDays } from 'date-fns'
import { Mail } from 'lucide-react'
import { useMemo } from 'react'

import { useAuth } from '@/auth/useAuth'
import { getSupabase } from '@/lib/supabase'
import { buildMailto } from '@/lib/mailto'
import { ScreenHeader } from '@/components/layout/ScreenHeader'

function formatIls(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '—'
  return `₪${Math.round(n).toLocaleString('he-IL')}`
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
        .select('id, name, contact_email, created_at')
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
      return data ?? []
    },
  })

  const incomeByCompany = useMemo(() => {
    const m = new Map<string, { gained: number; pending: number }>()
    for (const p of positionsIncomeQ.data ?? []) {
      const cid = p.company_id as string | null
      if (!cid) continue
      const cur = m.get(cid) ?? { gained: 0, pending: 0 }
      if (p.status === 'success') {
        const actual = p.actual_fee_ils != null ? Number(p.actual_fee_ils) : NaN
        const planned = p.planned_fee_ils != null ? Number(p.planned_fee_ils) : NaN
        const add = Number.isFinite(actual) && actual > 0 ? actual : Number.isFinite(planned) && planned > 0 ? planned : 0
        m.set(cid, { ...cur, gained: cur.gained + add })
      } else if (p.status === 'pending' || p.status === 'in_progress') {
        const planned = p.planned_fee_ils != null ? Number(p.planned_fee_ils) : 0
        if (Number.isFinite(planned) && planned > 0) {
          m.set(cid, { ...cur, pending: cur.pending + planned })
        } else {
          m.set(cid, cur)
        }
      } else {
        m.set(cid, cur)
      }
    }
    return m
  }, [positionsIncomeQ.data])

  return (
    <div className="flex flex-col gap-6">
      <ScreenHeader
        title="Companies"
        subtitle={sendEmailMode ? 'Choose a client to open your mail app — add a contact email on their profile if missing.' : 'Clients you recruit for.'}
        backTo="/"
        right={
          <Link
            to="/companies/new"
            className="inline-flex shrink-0 items-center rounded-full bg-gradient-to-r from-[#9b3e20] to-[#fd8863] px-4 py-2 text-sm font-bold text-white shadow-sm dark:from-orange-700 dark:to-orange-500"
          >
            New
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
        <ul className="space-y-2">
          {(q.data ?? []).map((c) => {
            const daysSince = differenceInCalendarDays(new Date(), new Date(c.created_at))
            const inc = incomeByCompany.get(c.id) ?? { gained: 0, pending: 0 }
            return (
            <li key={c.id}>
              <div className="border-line bg-white/70 flex flex-wrap items-stretch gap-2 rounded-2xl border px-4 py-4 dark:border-line-dark dark:bg-stone-900/45">
                <Link
                  to={`/companies/${c.id}`}
                  className="hover:border-accent min-w-0 flex-1 flex flex-col gap-2 rounded-xl border border-transparent transition-colors dark:hover:border-orange-400/40"
                >
                  <div className="flex items-start justify-between gap-3">
                    <span className="min-w-0 flex-1 text-base leading-snug font-semibold break-words">{c.name}</span>
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
                  <div className="mt-1 grid grid-cols-2 gap-2 text-xs sm:flex sm:flex-wrap sm:gap-x-6">
                    <div>
                      <p className="text-ink-muted font-medium tracking-wide uppercase dark:text-stone-500">Income gained</p>
                      <p className="text-stitch-on-surface text-lg font-semibold tabular-nums dark:text-stone-100">
                        {positionsIncomeQ.isLoading ? '…' : formatIls(inc.gained)}
                      </p>
                    </div>
                    <div>
                      <p className="text-ink-muted font-medium tracking-wide uppercase dark:text-stone-500">Pending incomes</p>
                      <p
                        className="text-stitch-on-surface text-lg font-semibold tabular-nums dark:text-stone-100"
                        title="Planned fees on open roles — if those placements succeed"
                      >
                        {positionsIncomeQ.isLoading ? '…' : formatIls(inc.pending)}
                      </p>
                      <p className="text-ink-muted mt-0.5 text-[10px] leading-tight dark:text-stone-500">If open roles close successfully</p>
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
