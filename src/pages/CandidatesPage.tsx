import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { differenceInCalendarDays } from 'date-fns'
import { Search } from 'lucide-react'

import { useAuth } from '@/auth/useAuth'
import { getSupabase } from '@/lib/supabase'
import { candidateOutcomePill } from '@/lib/candidateOutcomePill'
import { ScreenHeader } from '@/components/layout/ScreenHeader'

type Outcome = 'active' | 'rejected' | 'withdrawn' | 'hired'

type CandidateRow = {
  id: string
  full_name: string
  outcome: string
  created_at: string
  position_id: string
  email: string | null
  phone: string | null
  position_stages: { name: string } | null
  positions: {
    id: string
    title: string
    companies: { name: string } | null
  } | null
}

function digitsOnly(s: string): string {
  return s.replace(/\D/g, '')
}

function candidateMatchesSearch(c: CandidateRow, raw: string): boolean {
  const q = raw.trim().toLowerCase()
  if (!q) return true
  const name = (c.full_name ?? '').toLowerCase()
  const email = (c.email ?? '').toLowerCase()
  const phoneRaw = (c.phone ?? '').toLowerCase()
  if (name.includes(q) || email.includes(q) || phoneRaw.includes(q)) return true
  const qDigits = digitsOnly(q)
  if (qDigits.length >= 2) {
    const phoneDigits = digitsOnly(c.phone ?? '')
    if (phoneDigits.includes(qDigits)) return true
  }
  return false
}

export function CandidatesPage() {
  const { user } = useAuth()
  const supabase = getSupabase()
  const uid = user?.id
  const [outcomeFilter, setOutcomeFilter] = useState<'all' | Outcome>('active')
  const [search, setSearch] = useState('')

  const q = useQuery({
    queryKey: ['all-candidates', uid, outcomeFilter],
    enabled: Boolean(supabase && uid),
    queryFn: async () => {
      let query = supabase!
        .from('candidates')
        .select(
          `
          id, full_name, email, phone, outcome, created_at, position_id,
          position_stages ( name ),
          positions ( id, title, status, companies ( name ) )
        `,
        )
        .eq('user_id', uid!)
        .is('deleted_at', null)
        .order('updated_at', { ascending: false })
      if (outcomeFilter !== 'all') {
        query = query.eq('outcome', outcomeFilter)
      }
      const { data, error } = await query
      if (error) throw error
      return (data ?? []) as unknown as CandidateRow[]
    },
  })

  const rows = q.data ?? []
  const filteredRows = useMemo(() => rows.filter((c) => candidateMatchesSearch(c, search)), [rows, search])

  return (
    <div className="flex flex-col gap-6">
      <ScreenHeader
        title="Candidates"
        subtitle="Everyone in your pipeline — open a role to edit details or import."
        backTo="/"
      />

      <div className="flex flex-wrap gap-2">
        {(['all', 'active', 'rejected', 'withdrawn', 'hired'] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setOutcomeFilter(k)}
            className={`rounded-full px-3 py-1 text-xs font-bold uppercase transition ${
              outcomeFilter === k
                ? 'bg-[#9b3e20] text-white dark:bg-orange-600'
                : 'border border-stone-300 dark:border-stone-600'
            }`}
          >
            {k === 'all' ? 'All' : k}
          </button>
        ))}
      </div>

      <div className="relative">
        <Search
          className="text-ink-muted pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
          aria-hidden
        />
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, email, or phone…"
          className="border-line bg-white/80 focus:ring-accent/30 w-full rounded-2xl border py-2.5 pr-3 pl-10 text-sm shadow-sm outline-none focus:ring-2 dark:border-line-dark dark:bg-stone-900/50"
          aria-label="Search candidates by name, email, or phone"
        />
      </div>

      {q.isLoading ? (
        <p className="text-ink-muted text-sm">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-ink-muted text-sm">No candidates match this filter.</p>
      ) : filteredRows.length === 0 ? (
        <p className="text-ink-muted text-sm">No candidates match your search.</p>
      ) : (
        <ul className="space-y-2">
          {filteredRows.map((c) => {
            const pos = c.positions
            const stage = c.position_stages?.name
            const company = pos?.companies?.name
            const days = differenceInCalendarDays(new Date(), new Date(c.created_at))
            const out = candidateOutcomePill(c.outcome)
            return (
              <li
                key={c.id}
                className="border-line rounded-2xl border bg-white/80 px-4 py-3 shadow-sm dark:border-line-dark dark:bg-stone-900/50"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <Link
                    to={`/positions/${c.position_id}?candidate=${c.id}`}
                    className="text-ink font-semibold hover:underline dark:text-stone-100"
                  >
                    {c.full_name}
                  </Link>
                  <span
                    className={`inline-flex shrink-0 items-center rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase ${out.className}`}
                  >
                    {out.label}
                  </span>
                </div>
                <p className="text-stitch-muted mt-1 text-sm">
                  {pos ? (
                    <>
                      <span className="text-ink dark:text-stone-200">{pos.title}</span>
                      {company ? (
                        <>
                          <span className="text-stitch-muted"> · </span>
                          <span className="text-ink-muted font-medium dark:text-stone-400">{company}</span>
                        </>
                      ) : null}
                    </>
                  ) : (
                    'Role unavailable'
                  )}
                </p>
                <p className="text-stitch-muted mt-2 flex flex-wrap items-center gap-2 text-xs">
                  <span className="border-line bg-stone-50/90 text-ink inline-flex max-w-full items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold dark:border-line-dark dark:bg-stone-800/80 dark:text-stone-200">
                    {stage?.trim() ? stage : '—'}
                  </span>
                  <span className="text-stitch-muted">·</span>
                  <span>
                    {days}d on role
                  </span>
                </p>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
