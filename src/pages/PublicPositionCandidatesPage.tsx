import type { ReactNode } from 'react'
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

const STAGE_ACCENT = [
  'from-lume-coral to-orange-600',
  'from-lume-sky to-cyan-600',
  'from-lume-violet to-violet-600',
  'from-lume-jade to-teal-600',
  'from-lume-gold to-amber-600',
  'from-lume-rose to-rose-600',
] as const

function formatOpenedAt(value: string | null | undefined): string | null {
  if (value == null || String(value).trim() === '') return null
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase()
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase()
}

function sortStages(stages: PipelineStageGroup[]): PipelineStageGroup[] {
  return [...stages].sort((a, b) => {
    const ao = a.sort_order
    const bo = b.sort_order
    if (ao == null && bo == null) return 0
    if (ao == null) return 1
    if (bo == null) return -1
    return ao - bo
  })
}

function IconLock(props: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden className={props.className}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
      />
    </svg>
  )
}

function IconUsers(props: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden className={props.className}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
      />
    </svg>
  )
}

function IconBuilding(props: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden className={props.className}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
      />
    </svg>
  )
}

function IconCalendar(props: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden className={props.className}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
      />
    </svg>
  )
}

function PageBackdrop() {
  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="animate-aurora-drift absolute -left-1/4 top-0 h-[42rem] w-[42rem] rounded-full bg-gradient-to-br from-accent/20 via-lume-violet/15 to-lume-sky/10 blur-3xl dark:from-accent/15 dark:via-lume-violet/10 dark:to-lume-sky/8" />
      <div className="animate-aurora-drift absolute -right-1/4 bottom-0 h-[36rem] w-[36rem] rounded-full bg-gradient-to-tl from-lume-jade/12 via-transparent to-lume-gold/10 blur-3xl opacity-80 dark:from-lume-jade/8 dark:to-lume-gold/6" />
      <div
        className="absolute inset-0 opacity-[0.35] dark:opacity-[0.12]"
        style={{
          backgroundImage: `radial-gradient(circle at 1px 1px, var(--color-line) 1px, transparent 0)`,
          backgroundSize: '28px 28px',
        }}
      />
    </div>
  )
}

function LoadingSkeleton() {
  return (
    <div className="bg-paper text-ink relative min-h-dvh dark:bg-paper-dark dark:text-stone-100">
      <PageBackdrop />
      <div className="border-line/80 relative border-b bg-white/70 px-4 py-10 backdrop-blur-md dark:border-line-dark dark:bg-stone-900/70 sm:px-8">
        <div className="mx-auto max-w-4xl">
          <div className="bg-accent/15 mb-4 h-2.5 w-40 animate-pulse rounded-full" />
          <div className="bg-stone-200/90 mb-3 h-9 w-4/5 max-w-md animate-pulse rounded-lg dark:bg-stone-700/80" />
          <div className="mt-6 flex flex-wrap gap-3">
            <div className="h-20 w-36 animate-pulse rounded-2xl bg-white/80 dark:bg-stone-800/80" />
            <div className="h-20 w-36 animate-pulse rounded-2xl bg-white/80 dark:bg-stone-800/80" />
            <div className="h-20 w-36 animate-pulse rounded-2xl bg-white/80 dark:bg-stone-800/80" />
          </div>
        </div>
      </div>
      <div className="mx-auto max-w-4xl px-4 py-10 sm:px-8">
        <div className="mb-8 h-14 animate-pulse rounded-2xl bg-white/60 dark:bg-stone-800/60" />
        <div className="grid grid-cols-[repeat(auto-fill,minmax(12rem,1fr))] gap-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-xl bg-white/70 dark:bg-stone-800/70" />
          ))}
        </div>
      </div>
    </div>
  )
}

function MetaChip({
  icon,
  label,
  value,
}: {
  icon: ReactNode
  label: string
  value: string
}) {
  return (
    <div className="border-line/90 flex min-w-[10.5rem] flex-1 items-start gap-3 rounded-2xl border bg-white/85 px-4 py-3 shadow-sm backdrop-blur-sm dark:border-line-dark dark:bg-stone-900/75">
      <span className="text-accent mt-0.5 shrink-0 opacity-90 dark:text-orange-300">{icon}</span>
      <div className="min-w-0">
        <p className="text-ink-muted text-[10px] font-bold uppercase tracking-[0.14em]">{label}</p>
        <p className="text-stitch-on-surface mt-0.5 truncate text-sm font-semibold dark:text-stone-100">{value}</p>
      </div>
    </div>
  )
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
      <div className="bg-paper relative flex min-h-dvh items-center justify-center px-4 dark:bg-paper-dark">
        <PageBackdrop />
        <div className="border-line/80 max-w-sm rounded-2xl border bg-white/90 p-8 text-center shadow-xl backdrop-blur-md dark:border-line-dark dark:bg-stone-900/90">
          <p className="text-stitch-on-surface text-base font-semibold dark:text-stone-100">Invalid link</p>
          <p className="text-ink-muted mt-2 text-sm">Check the URL or request a new shared report from your contact.</p>
        </div>
      </div>
    )
  }

  if (q.isLoading) {
    return <LoadingSkeleton />
  }

  if (!q.data) {
    return (
      <div className="bg-paper relative flex min-h-dvh flex-col items-center justify-center gap-4 px-4 dark:bg-paper-dark">
        <PageBackdrop />
        <div className="border-line/80 max-w-md rounded-2xl border bg-white/90 p-10 text-center shadow-xl backdrop-blur-md dark:border-line-dark dark:bg-stone-900/90">
          <div className="bg-accent-soft text-accent mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl dark:bg-stone-800 dark:text-orange-300">
            <IconLock className="h-7 w-7" />
          </div>
          <p className="text-stitch-on-surface text-lg font-semibold dark:text-stone-100">Link unavailable</p>
          <p className="text-ink-muted mt-2 text-sm leading-relaxed">
            This link may have been revoked, or the role is no longer open. Ask the recruiter for an updated link.
          </p>
        </div>
      </div>
    )
  }

  const { position, company, total_candidates, stages } = q.data
  const stageList = Array.isArray(stages) ? stages : []
  const sortedStages = sortStages(stageList)
  const posPill = positionLifecyclePill(position.status ?? 'active')
  const openedLabel = formatOpenedAt(position.opened_at)
  const maxStageCount = sortedStages.reduce((m, s) => Math.max(m, (Array.isArray(s.candidates) ? s.candidates : []).length), 0)

  return (
    <div className="bg-paper text-ink relative min-h-dvh dark:bg-paper-dark dark:text-stone-100">
      <PageBackdrop />

      <header className="border-line/80 relative overflow-hidden border-b bg-white/75 px-4 py-10 backdrop-blur-md dark:border-line-dark dark:bg-stone-900/70 sm:px-8">
        <div className="from-accent/8 pointer-events-none absolute inset-0 bg-gradient-to-br via-transparent to-lume-violet/5 dark:from-accent/10 dark:to-lume-violet/8" />
        <div className="relative mx-auto max-w-4xl">
          <div className="animate-fade-up flex flex-wrap items-center gap-2">
            <span className="text-accent inline-flex items-center gap-1.5 rounded-full border border-accent/25 bg-accent-soft/80 px-3 py-1 text-[10px] font-bold tracking-[0.18em] uppercase dark:border-orange-400/30 dark:bg-orange-950/40 dark:text-orange-200">
              <span className="bg-accent h-1.5 w-1.5 rounded-full dark:bg-orange-400" aria-hidden />
              Yuli&apos;s — shared pipeline
            </span>
          </div>
          <h1 className="text-page-title animate-fade-up-delay mt-4 text-3xl font-bold tracking-tight sm:text-4xl">
            {position.title}
          </h1>
          <p className="text-ink-muted animate-fade-up-delay mt-2 max-w-2xl text-sm leading-relaxed sm:text-base">
            Live view of where candidates sit in the funnel. Names only — no emails or phone numbers.
          </p>

          <div className="animate-fade-up-delay-2 mt-8 flex flex-wrap gap-3">
            {company?.name ? (
              <MetaChip icon={<IconBuilding className="h-5 w-5" />} label="Company" value={company.name} />
            ) : null}
            {openedLabel ? (
              <MetaChip icon={<IconCalendar className="h-5 w-5" />} label="Opened" value={openedLabel} />
            ) : null}
            <MetaChip
              icon={<IconUsers className="h-5 w-5" />}
              label="In pipeline"
              value={total_candidates === 1 ? '1 candidate' : `${total_candidates} candidates`}
            />
            <div className="border-line/90 flex min-w-[10.5rem] flex-1 items-center justify-between gap-3 rounded-2xl border bg-white/85 px-4 py-3 shadow-sm backdrop-blur-sm dark:border-line-dark dark:bg-stone-900/75">
              <div>
                <p className="text-ink-muted text-[10px] font-bold uppercase tracking-[0.14em]">Role status</p>
                <span
                  className={`mt-1.5 inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${posPill.className}`}
                >
                  {posPill.label}
                </span>
              </div>
            </div>
          </div>

          <div className="animate-fade-up-delay-2 border-line/70 text-ink-muted mt-8 flex gap-3 rounded-2xl border bg-stone-50/90 px-4 py-3 text-xs leading-relaxed dark:border-line-dark dark:bg-stone-800/50 sm:text-sm">
            <IconLock className="text-accent mt-0.5 h-5 w-5 shrink-0 opacity-80 dark:text-orange-300" />
            <p>
              Counts reflect the <strong className="text-stitch-on-surface font-semibold dark:text-stone-200">last stage</strong>{' '}
              each candidate reached on this role. This page refreshes about once a minute.
            </p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-10 sm:px-8 sm:py-12">
        {sortedStages.length === 0 ? (
          <div className="border-line/80 rounded-2xl border border-dashed bg-white/60 px-6 py-14 text-center dark:border-line-dark dark:bg-stone-900/40">
            <IconUsers className="text-ink-muted mx-auto mb-3 h-10 w-10 opacity-50" />
            <p className="text-stitch-on-surface font-medium dark:text-stone-200">No candidates on this role yet</p>
            <p className="text-ink-muted mt-1 text-sm">Check back later — new applicants will appear here.</p>
          </div>
        ) : (
          <>
            {maxStageCount > 0 ? (
              <section aria-label="Pipeline overview" className="animate-fade-up mb-12">
                <h2 className="text-ink-muted mb-4 text-xs font-bold uppercase tracking-[0.16em]">Pipeline overview</h2>
                <div className="border-line/80 overflow-x-auto rounded-2xl border bg-white/80 p-4 shadow-sm backdrop-blur-sm dark:border-line-dark dark:bg-stone-900/70">
                  <ol className="flex min-w-min items-stretch gap-0">
                    {sortedStages.map((stage, idx) => {
                      const n = Array.isArray(stage.candidates) ? stage.candidates.length : 0
                      const widthPct = maxStageCount > 0 ? Math.max(12, Math.round((n / maxStageCount) * 100)) : 12
                      const accent = STAGE_ACCENT[idx % STAGE_ACCENT.length]!
                      const isLast = idx === sortedStages.length - 1
                      return (
                        <li key={`overview-${stage.name}-${idx}`} className="flex min-w-[5.5rem] flex-1">
                          <div className="flex w-full flex-col items-center px-1 sm:px-2">
                            <div
                              className="flex h-24 w-full max-w-[4.5rem] flex-col justify-end sm:h-28 sm:max-w-[5.5rem]"
                              title={`${stage.name}: ${n}`}
                            >
                              <div
                                className={`w-full rounded-t-lg bg-gradient-to-t ${accent} shadow-inner transition-all duration-500`}
                                style={{ height: `${widthPct}%`, minHeight: n > 0 ? '18%' : '4px' }}
                              />
                            </div>
                            <p className="text-stitch-on-surface mt-2 line-clamp-2 text-center text-[10px] font-semibold leading-tight sm:text-xs dark:text-stone-200">
                              {stage.name}
                            </p>
                            <p className="text-ink-muted text-[10px] font-medium tabular-nums sm:text-xs">{n}</p>
                          </div>
                          {!isLast ? (
                            <div
                              className="text-line dark:text-line-dark flex w-3 shrink-0 items-center justify-center self-start pt-14 sm:w-4 sm:pt-16"
                              aria-hidden
                            >
                              <svg viewBox="0 0 16 24" className="h-6 w-3 opacity-40" fill="currentColor">
                                <path d="M0 12 L12 6 L12 18 Z" />
                              </svg>
                            </div>
                          ) : null}
                        </li>
                      )
                    })}
                  </ol>
                </div>
              </section>
            ) : null}

            <div className="flex flex-col gap-12">
              {sortedStages.map((stage, idx) => {
                const rows = Array.isArray(stage.candidates) ? stage.candidates : []
                const n = rows.length
                const accentBar = STAGE_ACCENT[idx % STAGE_ACCENT.length]!
                const animClass =
                  idx % 3 === 0 ? 'animate-fade-up' : idx % 3 === 1 ? 'animate-fade-up-delay' : 'animate-fade-up-delay-2'
                return (
                  <section
                    key={`${stage.name}-${idx}`}
                    className={`${animClass} group relative`}
                    aria-labelledby={`stage-heading-${idx}`}
                  >
                    <div className="border-line/80 relative overflow-hidden rounded-2xl border bg-white/90 shadow-lg shadow-stone-200/40 backdrop-blur-sm dark:border-line-dark dark:bg-stone-900/85 dark:shadow-black/40">
                      <div
                        className={`absolute inset-y-3 left-0 w-1 rounded-full bg-gradient-to-b ${accentBar} opacity-90`}
                        aria-hidden
                      />
                      <div className="relative pl-5 pr-4 pb-6 pt-5 sm:pl-6 sm:pr-6">
                        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-stone-100 pb-4 dark:border-stone-700/80">
                          <h2
                            id={`stage-heading-${idx}`}
                            className="text-stitch-on-surface text-xl font-bold tracking-tight dark:text-stone-100"
                          >
                            {stage.name}
                          </h2>
                          <span className="text-ink-muted rounded-full bg-stone-100 px-3 py-1 text-xs font-semibold tabular-nums dark:bg-stone-800 dark:text-stone-300">
                            {n} {n === 1 ? 'person' : 'people'}
                          </span>
                        </div>
                        <p className="text-ink-muted mt-2 text-xs sm:text-sm">Last stage reached: {stage.name}</p>

                        {n === 0 ? (
                          <p className="text-ink-muted mt-6 text-sm italic">No one at this stage right now.</p>
                        ) : (
                          <ul className="mt-6 grid grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] gap-3">
                            {rows.map((c, i) => {
                              const st = c.status ?? 'in_progress'
                              const isClosed = st === 'rejected' || st === 'withdrawn'
                              const pill = assignmentStatusPill(st)
                              const ini = initialsFromName(c.full_name)
                              return (
                                <li
                                  key={`${c.full_name}-${i}`}
                                  className={`border-line/80 flex items-center gap-3 rounded-xl border bg-gradient-to-br from-white to-stone-50/80 px-3 py-3 shadow-sm transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-md dark:border-stone-600 dark:from-stone-900 dark:to-stone-900/60 ${
                                    isClosed ? 'opacity-70' : ''
                                  }`}
                                >
                                  <div
                                    className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-xs font-bold text-white shadow-inner ${accentBar}`}
                                    aria-hidden
                                  >
                                    {ini}
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <p
                                      className={`text-stitch-on-surface truncate text-sm font-semibold dark:text-stone-100 ${
                                        isClosed ? 'line-through decoration-stone-400 decoration-2' : ''
                                      }`}
                                    >
                                      {c.full_name}
                                    </p>
                                    {st !== 'in_progress' ? (
                                      <p
                                        className={`mt-1.5 inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${pill.className}`}
                                      >
                                        {pill.label}
                                      </p>
                                    ) : (
                                      <p className="text-ink-muted mt-1 text-[10px] font-medium uppercase tracking-wide">
                                        In progress
                                      </p>
                                    )}
                                  </div>
                                </li>
                              )
                            })}
                          </ul>
                        )}
                      </div>
                    </div>
                  </section>
                )
              })}
            </div>
          </>
        )}
      </main>

      <footer className="border-line/60 text-ink-muted border-t px-4 py-8 text-center text-xs dark:border-line-dark">
        <p>Shared hiring report · Yuli&apos;s</p>
      </footer>
    </div>
  )
}
