import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'

import { getSupabase } from '@/lib/supabase'
import { formatCandidateGlobalStatus } from '@/lib/candidateStatus'

type SharePayload = {
  candidate: {
    id: string
    full_name: string
    email: string | null
    current_title: string | null
    status?: string
  }
  position: { id: string; title: string; status: string }
  company: { name: string } | null
}

export function PublicSharePage() {
  const { token } = useParams()
  const supabase = getSupabase()

  const q = useQuery({
    queryKey: ['public-share', token],
    enabled: Boolean(supabase && token && token.length >= 8),
    queryFn: async () => {
      const { data, error } = await supabase!.rpc('get_candidate_share_payload', { p_token: token! })
      if (error) throw error
      return data as SharePayload | null
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
        <p className="text-center text-sm font-semibold text-[#302e2b] dark:text-stone-100">Link expired or revoked</p>
        <p className="text-ink-muted text-center text-xs">Ask the recruiter for a new link.</p>
      </div>
    )
  }

  const { candidate, position, company } = q.data
  const candStatus = candidate.status ?? 'active'

  return (
    <div className="bg-paper text-ink min-h-dvh dark:bg-paper-dark dark:text-stone-100">
      <header className="border-line border-b bg-white/90 px-4 py-4 dark:border-line-dark dark:bg-stone-900/90">
        <p className="text-accent text-[10px] font-bold tracking-[0.2em] uppercase dark:text-orange-300">Yuli&apos;s HR — shared view</p>
        <h1 className="text-ink mt-1 text-xl font-semibold dark:text-stone-100">Candidate preview</h1>
      </header>
      <main className="mx-auto max-w-md space-y-4 px-4 py-8">
        <section className="rounded-2xl border border-stone-200/80 bg-white/90 p-4 shadow-sm dark:border-stone-600 dark:bg-stone-900/70">
          <h2 className="text-lg font-bold">{candidate.full_name}</h2>
          {candidate.current_title ? <p className="text-ink-muted text-sm">{candidate.current_title}</p> : null}
          {candidate.email ? (
            <p className="mt-2 text-sm">
              <span className="text-ink-muted">Email: </span>
              {candidate.email}
            </p>
          ) : null}
          <p className="mt-2 text-xs font-medium uppercase tracking-wide text-stone-500">
            Status: {formatCandidateGlobalStatus(candStatus)}
          </p>
        </section>
        <section className="rounded-2xl border border-stone-200/80 bg-white/90 p-4 dark:border-stone-600 dark:bg-stone-900/70">
          <h3 className="text-ink text-sm font-semibold dark:text-stone-100">Role</h3>
          <p className="mt-1 font-medium">{position.title}</p>
          <p className="text-ink-muted text-xs">Status: {position.status.replace('_', ' ')}</p>
          {company?.name ? <p className="text-ink-muted mt-2 text-sm">{company.name}</p> : null}
        </section>
      </main>
    </div>
  )
}
