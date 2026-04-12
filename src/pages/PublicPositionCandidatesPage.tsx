import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'

import { getSupabase } from '@/lib/supabase'
import { formatCandidateStatus } from '@/lib/candidateStatus'

type PublicCandidateRow = {
  full_name: string
  status?: string
  outcome?: string
  current_title: string | null
  stage_name: string
}

type PublicPositionListPayload = {
  position: { id: string; title: string; status: string }
  company: { name: string } | null
  candidates: PublicCandidateRow[]
}

function rowStatusLabel(row: PublicCandidateRow): string {
  return formatCandidateStatus(row.status ?? row.outcome ?? 'pending')
}

export function PublicPositionCandidatesPage() {
  const { token } = useParams()
  const supabase = getSupabase()

  const q = useQuery({
    queryKey: ['public-position-candidates', token],
    enabled: Boolean(supabase && token && token.length >= 8),
    queryFn: async () => {
      const { data, error } = await supabase!.rpc('get_position_public_candidates_list', { p_token: token! })
      if (error) throw error
      return data as PublicPositionListPayload | null
    },
  })

  if (!token || token.length < 8) {
    return (
      <div className="bg-paper flex min-h-dvh items-center justify-center px-4 dark:bg-paper-dark">
        <p className="text-ink-muted text-sm">Invalid link.</p>
      </div>
    )
  }

  if (q.isLoading) {
    return (
      <div className="bg-paper flex min-h-dvh items-center justify-center dark:bg-paper-dark">
        <p className="text-ink-muted text-sm">Loading…</p>
      </div>
    )
  }

  if (!q.data) {
    return (
      <div className="bg-paper flex min-h-dvh flex-col items-center justify-center gap-2 px-4 dark:bg-paper-dark">
        <p className="text-center text-sm font-semibold text-[#302e2b] dark:text-stone-100">Link unavailable</p>
        <p className="text-ink-muted max-w-sm text-center text-xs">
          This link may have been revoked, or the role is no longer open. Ask the recruiter for an updated link.
        </p>
      </div>
    )
  }

  const { position, company, candidates } = q.data
  const rows = Array.isArray(candidates) ? candidates : []

  return (
    <div className="bg-paper text-ink min-h-dvh dark:bg-paper-dark dark:text-stone-100">
      <header className="border-line border-b bg-white/90 px-4 py-4 dark:border-line-dark dark:bg-stone-900/90">
        <p className="text-accent text-[10px] font-bold tracking-[0.2em] uppercase dark:text-orange-300">Yuli&apos;s HR — shared view</p>
        <h1 className="text-ink mt-1 text-xl font-semibold dark:text-stone-100">Candidates on this role</h1>
        <p className="mt-1 text-lg font-bold text-[#302e2b] dark:text-stone-100">{position.title}</p>
        {company?.name ? <p className="text-ink-muted mt-0.5 text-sm">{company.name}</p> : null}
        <p className="text-ink-muted mt-2 text-xs">Names and pipeline stage only — no contact details.</p>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-6">
        {rows.length === 0 ? (
          <p className="text-ink-muted text-sm">No candidates on this role yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-stone-200/80 bg-white/90 shadow-sm dark:border-stone-600 dark:bg-stone-900/70">
            <table className="w-full min-w-[20rem] text-left text-sm">
              <thead>
                <tr className="border-b border-stone-200/90 bg-stone-50/90 text-xs font-bold tracking-wide uppercase dark:border-stone-600 dark:bg-stone-800/80">
                  <th scope="col" className="px-4 py-3">
                    Name
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Stage
                  </th>
                  <th scope="col" className="px-4 py-3">
                    Status
                  </th>
                  <th scope="col" className="hidden px-4 py-3 sm:table-cell">
                    Title
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c, i) => (
                  <tr
                    key={`${c.full_name}-${i}`}
                    className="border-b border-stone-100 last:border-0 dark:border-stone-700/80"
                  >
                    <td className="px-4 py-3 font-semibold">{c.full_name}</td>
                    <td className="text-ink-muted px-4 py-3">{c.stage_name || '—'}</td>
                    <td className="px-4 py-3">{rowStatusLabel(c)}</td>
                    <td className="text-ink-muted hidden px-4 py-3 sm:table-cell">{c.current_title?.trim() || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  )
}
