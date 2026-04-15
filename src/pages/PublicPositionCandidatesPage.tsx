import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'

import { getSupabase } from '@/lib/supabase'
import { assignmentStatusPill, positionLifecyclePill } from '@/lib/candidateStatus'

type PipelineCandidate = {
  full_name: string
  status?: string
}

type PipelineStageGroup = {
  name: string
  sort_order: number | null
  candidates: PipelineCandidate[]
}

type PublicPipelineReportPayload = {
  position: { id: string; title: string; status: string; opened_at: string | null }
  company: { name: string } | null
  total_candidates: number
  stages: PipelineStageGroup[]
}

function formatOpenedAt(value: string | null | undefined): string | null {
  if (value == null || String(value).trim() === '') return null
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

export function PublicPositionCandidatesPage() {
  const { token } = useParams()
  const supabase = getSupabase()

  const q = useQuery({
    queryKey: ['public-position-pipeline', token],
    enabled: Boolean(supabase && token && token.length >= 8),
    queryFn: async () => {
      const { data, error } = await supabase!.rpc('get_position_public_pipeline_report', { p_token: token! })
      if (error) throw error
      return data as PublicPipelineReportPayload | null
    },
    refetchInterval: 60_000,
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

  const { position, company, total_candidates, stages } = q.data
  const stageList = Array.isArray(stages) ? stages : []
  const posPill = positionLifecyclePill(position.status ?? 'active')
  const openedLabel = formatOpenedAt(position.opened_at)

  return (
    <div className="bg-paper text-ink min-h-dvh dark:bg-paper-dark dark:text-stone-100">
      <header className="border-line border-b bg-white/90 px-4 py-5 dark:border-line-dark dark:bg-stone-900/90">
        <p className="text-accent text-[10px] font-bold tracking-[0.2em] uppercase dark:text-orange-300">
          Yuli&apos;s HR — client pipeline report
        </p>
        <h1 className="text-ink mt-2 text-2xl font-semibold tracking-tight dark:text-stone-100">{position.title}</h1>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          {company?.name ? (
            <p className="text-ink-muted">
              <span className="font-medium text-[#302e2b] dark:text-stone-200">Company</span> — {company.name}
            </p>
          ) : null}
          {openedLabel ? (
            <p className="text-ink-muted">
              <span className="font-medium text-[#302e2b] dark:text-stone-200">Opened</span> — {openedLabel}
            </p>
          ) : null}
          <p className="flex items-center gap-2">
            <span className="text-ink-muted font-medium text-[#302e2b] dark:text-stone-200">Status</span>
            <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${posPill.className}`}>
              {posPill.label}
            </span>
          </p>
        </div>
        <p className="text-ink-muted mt-3 text-sm">
          Total candidates: <span className="font-semibold text-[#302e2b] dark:text-stone-100">{total_candidates}</span>
        </p>
        <p className="text-ink-muted mt-2 max-w-2xl text-xs">
          Counts show how many candidates are currently at each pipeline stage (last stage reached on this role). Names
          only — no contact details.
        </p>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-8">
        {stageList.length === 0 ? (
          <p className="text-ink-muted text-sm">No candidates on this role yet.</p>
        ) : (
          <div className="flex flex-col gap-10">
            {stageList.map((stage, idx) => {
              const rows = Array.isArray(stage.candidates) ? stage.candidates : []
              const n = rows.length
              return (
                <section key={`${stage.name}-${idx}`} aria-labelledby={`stage-heading-${idx}`}>
                  <h2
                    id={`stage-heading-${idx}`}
                    className="text-ink border-line mb-4 border-b pb-2 text-lg font-semibold dark:border-line-dark dark:text-stone-100"
                  >
                    Last: {stage.name}{' '}
                    <span className="text-ink-muted font-normal">({n})</span>
                  </h2>
                  <ul className="grid grid-cols-[repeat(auto-fill,minmax(11rem,1fr))] gap-3">
                    {rows.map((c, i) => {
                      const st = c.status ?? 'in_progress'
                      const isClosed = st === 'rejected' || st === 'withdrawn'
                      const pill = assignmentStatusPill(st)
                      return (
                        <li
                          key={`${c.full_name}-${i}`}
                          className={`rounded-xl border border-stone-200/90 bg-white/95 px-3 py-3 shadow-sm dark:border-stone-600 dark:bg-stone-900/80 ${
                            isClosed ? 'opacity-75' : ''
                          }`}
                        >
                          <p
                            className={`text-sm font-semibold text-[#302e2b] dark:text-stone-100 ${
                              isClosed ? 'line-through decoration-stone-400' : ''
                            }`}
                          >
                            {c.full_name}
                          </p>
                          {st !== 'in_progress' ? (
                            <p className={`mt-2 inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${pill.className}`}>
                              {pill.label}
                            </p>
                          ) : null}
                        </li>
                      )
                    })}
                  </ul>
                </section>
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}
