import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { differenceInCalendarDays } from 'date-fns'

import { useAuth } from '@/auth/useAuth'
import { getSupabase } from '@/lib/supabase'
import { ScreenHeader } from '@/components/layout/ScreenHeader'

type Outcome = 'active' | 'rejected' | 'withdrawn' | 'hired'

export function CandidatesPage() {
  const { user } = useAuth()
  const supabase = getSupabase()
  const uid = user?.id
  const [outcomeFilter, setOutcomeFilter] = useState<'all' | Outcome>('active')

  const q = useQuery({
    queryKey: ['all-candidates', uid, outcomeFilter],
    enabled: Boolean(supabase && uid),
    queryFn: async () => {
      let query = supabase!
        .from('candidates')
        .select(
          `
          id, full_name, outcome, created_at, position_id,
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
      return data ?? []
    },
  })

  const rows = q.data ?? []

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

      {q.isLoading ? (
        <p className="text-ink-muted text-sm">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-ink-muted text-sm">No candidates match this filter.</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((c) => {
            const pos = c.positions as unknown as {
              id: string
              title: string
              companies: { name: string } | null
            } | null
            const stage = (c.position_stages as unknown as { name: string } | null)?.name
            const company = pos?.companies?.name
            const days = differenceInCalendarDays(new Date(), new Date(c.created_at as string))
            return (
              <li
                key={c.id as string}
                className="border-line rounded-2xl border bg-white/80 px-4 py-3 shadow-sm dark:border-line-dark dark:bg-stone-900/50"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <Link
                    to={`/positions/${c.position_id}?candidate=${c.id}`}
                    className="font-stitch-head font-bold text-[#006384] hover:underline dark:text-cyan-300"
                  >
                    {c.full_name as string}
                  </Link>
                  <span className="text-stitch-muted text-xs font-semibold uppercase">{c.outcome as string}</span>
                </div>
                <p className="text-stitch-muted mt-1 text-sm">
                  {pos ? (
                    <>
                      <span className="text-ink dark:text-stone-200">{pos.title}</span>
                      {company ? <span> · {company}</span> : null}
                    </>
                  ) : (
                    'Role unavailable'
                  )}
                </p>
                <p className="text-stitch-muted mt-1 text-xs">
                  {stage ?? '—'} · {days}d on role
                </p>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
