import type { ReactNode } from 'react'
import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { differenceInCalendarDays } from 'date-fns'
import { format } from 'date-fns'
import { Mail, MessageCircle, X } from 'lucide-react'

import { getSupabase } from '@/lib/supabase'
import { assignmentStatusPill, positionLifecyclePill } from '@/lib/candidateStatus'
import { useToast } from '@/hooks/useToast'

type PipelineCandidate = {
  full_name: string
  status?: string
  position_candidate_id?: string
  email?: string | null
  linkedin?: string | null
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

type PublicPipelineTab = 'in_progress' | 'rejected_withdrawn'

type ThreadMessage = {
  role: 'team' | 'viewer'
  at: string
  body: string
}

const STAGE_ACCENT = [
  'from-lume-coral to-orange-600',
  'from-lume-sky to-cyan-600',
  'from-lume-violet to-violet-600',
  'from-lume-jade to-teal-600',
  'from-lume-gold to-amber-600',
  'from-lume-rose to-rose-600',
] as const

function formatOpenedRelative(value: string | null | undefined): string | null {
  if (value == null || String(value).trim() === '') return null
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return null
  const days = differenceInCalendarDays(new Date(), d)
  if (days <= 0) return 'Today'
  if (days === 1) return '1 day ago'
  return `${days} days ago`
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

function assignmentMatchesTab(c: PipelineCandidate, tab: PublicPipelineTab): boolean {
  const st = c.status ?? 'in_progress'
  if (tab === 'in_progress') return st === 'in_progress'
  return st === 'rejected' || st === 'withdrawn'
}

function filterStagesForTab(stages: PipelineStageGroup[], tab: PublicPipelineTab): PipelineStageGroup[] {
  return stages
    .map((s) => ({
      ...s,
      candidates: (Array.isArray(s.candidates) ? s.candidates : []).filter((c) => assignmentMatchesTab(c, tab)),
    }))
    .filter((s) => s.candidates.length > 0)
}

function linkedinHref(raw: string | null | undefined): string | null {
  const t = raw?.trim()
  if (!t) return null
  if (t.startsWith('http://') || t.startsWith('https://')) return t
  return `https://${t}`
}

function IconLinkedIn(props: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className={props.className}>
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
    </svg>
  )
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
  const qc = useQueryClient()
  const { success, error: toastError } = useToast()
  const [pipelineTab, setPipelineTab] = useState<PublicPipelineTab>('in_progress')
  const [threadPcId, setThreadPcId] = useState<string | null>(null)
  const [threadName, setThreadName] = useState('')
  const [composerDraft, setComposerDraft] = useState('')

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

  const threadQ = useQuery({
    queryKey: ['public-assignment-thread', token, threadPcId],
    enabled: Boolean(supabase && token && threadPcId),
    queryFn: async () => {
      const { data, error } = await supabase!.rpc('get_position_public_assignment_thread', {
        p_token: token!,
        p_position_candidate_id: threadPcId!,
      })
      if (error) throw error
      if (data == null) return [] as ThreadMessage[]
      return Array.isArray(data) ? (data as ThreadMessage[]) : ([] as ThreadMessage[])
    },
  })

  const postViewerMessage = useMutation({
    mutationFn: async (body: string) => {
      const { error } = await supabase!.rpc('post_position_public_viewer_message', {
        p_token: token!,
        p_position_candidate_id: threadPcId!,
        p_body: body,
      })
      if (error) throw error
    },
    onSuccess: async () => {
      success('Message posted')
      setComposerDraft('')
      await qc.invalidateQueries({ queryKey: ['public-assignment-thread', token, threadPcId] })
    },
    onError: (e: Error) => toastError(e.message),
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
  const openedLabel = formatOpenedRelative(position.opened_at)

  const flatCandidates = sortedStages.flatMap((s) => (Array.isArray(s.candidates) ? s.candidates : []))
  const inProgressCount = flatCandidates.filter((c) => (c.status ?? 'in_progress') === 'in_progress').length
  const closedCount = flatCandidates.filter((c) => {
    const st = c.status ?? 'in_progress'
    return st === 'rejected' || st === 'withdrawn'
  }).length

  const filteredStages = filterStagesForTab(sortedStages, pipelineTab)

  const threadRows: ThreadMessage[] = Array.isArray(threadQ.data) ? threadQ.data : []

  function openThread(pcId: string | undefined, name: string) {
    if (!pcId) return
    setThreadPcId(pcId)
    setThreadName(name)
    setComposerDraft('')
  }

  function closeThread() {
    setThreadPcId(null)
    setThreadName('')
    setComposerDraft('')
  }

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
            Live funnel view by stage. Use the tabs to switch between active candidates and closed assignments. LinkedIn
            and email icons appear when your recruiter chose to share them on this link.
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
            <div
              className="border-line/80 mb-10 flex flex-wrap gap-2 rounded-2xl border bg-white/80 p-1.5 shadow-sm backdrop-blur-sm dark:border-line-dark dark:bg-stone-900/70"
              role="tablist"
              aria-label="Pipeline view"
            >
              <button
                type="button"
                role="tab"
                aria-selected={pipelineTab === 'in_progress'}
                className={`min-h-[2.75rem] flex-1 rounded-xl px-4 py-2.5 text-sm font-bold transition sm:min-w-[12rem] ${
                  pipelineTab === 'in_progress'
                    ? 'bg-accent text-white shadow-md dark:bg-orange-600'
                    : 'text-ink-muted hover:bg-stone-100/90 dark:hover:bg-stone-800/80'
                }`}
                onClick={() => setPipelineTab('in_progress')}
              >
                In progress
                <span className="ml-1.5 tabular-nums opacity-90">({inProgressCount})</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={pipelineTab === 'rejected_withdrawn'}
                className={`min-h-[2.75rem] flex-1 rounded-xl px-4 py-2.5 text-sm font-bold transition sm:min-w-[12rem] ${
                  pipelineTab === 'rejected_withdrawn'
                    ? 'bg-accent text-white shadow-md dark:bg-orange-600'
                    : 'text-ink-muted hover:bg-stone-100/90 dark:hover:bg-stone-800/80'
                }`}
                onClick={() => setPipelineTab('rejected_withdrawn')}
              >
                Rejected / withdrawn
                <span className="ml-1.5 tabular-nums opacity-90">({closedCount})</span>
              </button>
            </div>

            {filteredStages.length === 0 ? (
              <div className="border-line/80 rounded-2xl border border-dashed bg-white/60 px-6 py-14 text-center dark:border-line-dark dark:bg-stone-900/40">
                <IconUsers className="text-ink-muted mx-auto mb-3 h-10 w-10 opacity-50" />
                <p className="text-stitch-on-surface font-medium dark:text-stone-200">
                  {pipelineTab === 'in_progress' ? 'No in-progress candidates in this view.' : 'No rejected or withdrawn candidates in this view.'}
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-12">
                {filteredStages.map((stage, idx) => {
                  const rows = Array.isArray(stage.candidates) ? stage.candidates : []
                  const n = rows.length
                  const accentBar = STAGE_ACCENT[idx % STAGE_ACCENT.length]!
                  const animClass =
                    idx % 3 === 0 ? 'animate-fade-up' : idx % 3 === 1 ? 'animate-fade-up-delay' : 'animate-fade-up-delay-2'
                  return (
                    <section
                      key={`${stage.name}-${idx}-${pipelineTab}`}
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

                          <ul className="mt-6 grid grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] gap-3">
                            {rows.map((c, i) => {
                              const st = c.status ?? 'in_progress'
                              const isClosed = st === 'rejected' || st === 'withdrawn'
                              const pill = assignmentStatusPill(st)
                              const ini = initialsFromName(c.full_name)
                              const pcId = c.position_candidate_id
                              const liHref = linkedinHref(c.linkedin ?? null)
                              const em = c.email?.trim() || ''
                              const cardKey = pcId ?? `${c.full_name}-${i}`
                              const cardClass = `border-line/80 flex w-full items-center gap-3 rounded-xl border bg-gradient-to-br from-white to-stone-50/80 px-3 py-3 text-left shadow-sm dark:border-stone-600 dark:from-stone-900 dark:to-stone-900/60 ${
                                isClosed ? 'opacity-80' : ''
                              }`
                              return (
                                <li key={cardKey}>
                                  <button
                                    type="button"
                                    className={`${cardClass} cursor-pointer transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0 disabled:hover:shadow-sm`}
                                    onClick={() => {
                                      if (!pcId) {
                                        toastError('Refresh this page after your host updates the share link to open threads.')
                                        return
                                      }
                                      openThread(pcId, c.full_name)
                                    }}
                                    title={pcId ? 'Open updates thread' : 'Thread needs an updated share link'}
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
                                      <p
                                        className={`mt-1.5 inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${pill.className}`}
                                      >
                                        {pill.label}
                                      </p>
                                    </div>
                                    <span
                                      className="flex shrink-0 items-center gap-1"
                                      onClick={(e) => {
                                        e.stopPropagation()
                                      }}
                                      onKeyDown={(e) => e.stopPropagation()}
                                    >
                                      {liHref ? (
                                        <a
                                          href={liHref}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="text-ink-muted hover:text-[#0a66c2] flex h-9 w-9 items-center justify-center rounded-lg transition hover:bg-stone-100 dark:hover:bg-stone-800"
                                          aria-label={`Open ${c.full_name} on LinkedIn`}
                                          title="LinkedIn"
                                        >
                                          <IconLinkedIn className="h-4 w-4" />
                                        </a>
                                      ) : null}
                                      {em ? (
                                        <button
                                          type="button"
                                          className="text-ink-muted hover:text-accent flex h-9 w-9 items-center justify-center rounded-lg transition hover:bg-stone-100 dark:hover:bg-stone-800 dark:hover:text-orange-300"
                                          aria-label="Copy email"
                                          title="Copy email"
                                          onClick={() => {
                                            void navigator.clipboard.writeText(em).then(
                                              () => success('Email copied'),
                                              () => toastError('Could not copy'),
                                            )
                                          }}
                                        >
                                          <Mail className="h-4 w-4" aria-hidden />
                                        </button>
                                      ) : null}
                                      {pcId ? (
                                        <span
                                          className="text-ink-muted flex h-9 w-9 items-center justify-center rounded-lg opacity-70"
                                          title="Open thread"
                                          aria-hidden
                                        >
                                          <MessageCircle className="h-4 w-4" aria-hidden />
                                        </span>
                                      ) : null}
                                    </span>
                                  </button>
                                </li>
                              )
                            })}
                          </ul>
                        </div>
                      </div>
                    </section>
                  )
                })}
              </div>
            )}
          </>
        )}
      </main>

      <footer className="border-line/60 text-ink-muted border-t px-4 py-8 text-center text-xs dark:border-line-dark">
        <p>Shared hiring report · Yuli&apos;s</p>
      </footer>

      {threadPcId ? (
        <>
          <button
            type="button"
            className="fixed inset-0 z-[100] bg-black/45 backdrop-blur-[1px]"
            aria-label="Close thread"
            onClick={closeThread}
          />
          <aside
            className="border-line fixed top-0 right-0 z-[110] flex h-full w-full max-w-md flex-col border-l bg-white shadow-2xl dark:border-line-dark dark:bg-stone-900"
            aria-label="Candidate thread"
          >
            <div className="border-line flex shrink-0 items-start justify-between gap-3 border-b bg-gradient-to-r from-stone-50 to-white px-4 py-4 dark:border-line-dark dark:from-stone-900 dark:to-stone-900/95">
              <div className="min-w-0">
                <p className="text-ink-muted text-[10px] font-bold uppercase tracking-[0.14em]">Thread</p>
                <p className="text-stitch-on-surface truncate text-lg font-bold dark:text-stone-100">{threadName}</p>
                <p className="text-ink-muted mt-1 text-xs">Recruiter notes and your messages (newest at the bottom).</p>
              </div>
              <button
                type="button"
                className="text-ink-muted hover:text-ink shrink-0 rounded-xl p-2 transition hover:bg-stone-100 dark:hover:bg-stone-800"
                aria-label="Close"
                onClick={closeThread}
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
              {threadQ.isLoading ? (
                <p className="text-ink-muted text-sm">Loading…</p>
              ) : threadRows.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-stone-200/90 bg-stone-50/80 px-4 py-6 text-center dark:border-stone-600 dark:bg-stone-800/40">
                  <p className="text-ink-muted text-sm">
                    No notes yet. When your recruiter adds comments in Yuli&apos;s, they appear here as{' '}
                    <strong className="text-stitch-on-surface dark:text-stone-200">Team</strong>. You can post below as{' '}
                    <strong className="text-stitch-on-surface dark:text-stone-200">You</strong>.
                  </p>
                </div>
              ) : (
                threadRows.map((m, mi) => {
                  const isTeam = m.role === 'team'
                  const t = m.at ? format(new Date(m.at), 'MMM d · h:mm a') : ''
                  return (
                    <div key={`${m.at}-${mi}`} className={`flex w-full ${isTeam ? 'justify-start' : 'justify-end'}`}>
                      <div
                        className={`max-w-[min(100%,18rem)] rounded-2xl px-3.5 py-2.5 text-sm shadow-sm ${
                          isTeam
                            ? 'border border-stone-200/90 bg-white text-stone-800 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-100'
                            : 'border border-orange-200/80 bg-gradient-to-br from-orange-50 to-amber-50/90 text-stone-900 dark:border-orange-800/50 dark:from-orange-950/50 dark:to-stone-900 dark:text-orange-50'
                        }`}
                      >
                        <p className="text-[10px] font-bold uppercase tracking-wide opacity-80">
                          {isTeam ? 'Team' : 'You'}
                          {t ? <span className="text-ink-muted ml-2 font-normal normal-case opacity-90">· {t}</span> : null}
                        </p>
                        <p className="mt-1.5 whitespace-pre-wrap leading-relaxed">{m.body}</p>
                      </div>
                    </div>
                  )
                })
              )}
            </div>

            <div className="border-line shrink-0 border-t bg-stone-50/90 p-4 dark:border-line-dark dark:bg-stone-900/90">
              <label className="text-ink-muted mb-1 block text-[10px] font-bold uppercase tracking-wide">Message as you</label>
              <textarea
                value={composerDraft}
                onChange={(e) => setComposerDraft(e.target.value)}
                rows={3}
                placeholder="Share a brief update or question…"
                className="border-line text-ink w-full resize-y rounded-xl border bg-white px-3 py-2 text-sm dark:border-line-dark dark:bg-stone-900 dark:text-stone-100"
              />
              <button
                type="button"
                disabled={postViewerMessage.isPending || composerDraft.trim().length === 0}
                className="bg-accent text-stone-50 mt-3 w-full rounded-full py-2.5 text-sm font-bold disabled:opacity-45"
                onClick={() => {
                  const b = composerDraft.trim()
                  if (!b) return
                  void postViewerMessage.mutateAsync(b)
                }}
              >
                {postViewerMessage.isPending ? 'Sending…' : 'Post message'}
              </button>
            </div>
          </aside>
        </>
      ) : null}
    </div>
  )
}
