import { Link, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { differenceInCalendarDays } from 'date-fns'
import { ChevronDown, ChevronRight, GripVertical, Plus, Search } from 'lucide-react'
import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react'

import { useAuth } from '@/auth/useAuth'
import { getSupabase } from '@/lib/supabase'
import { ScreenHeader } from '@/components/layout/ScreenHeader'
import { PageSpinner } from '@/components/ui/PageSpinner'
import { logActivityEvent } from '@/lib/activityLog'
import { assignmentStatusPill } from '@/lib/candidateStatus'
import { useToast } from '@/hooks/useToast'
import { useDashboardTaskKpis } from '@/hooks/useDashboardTaskKpis'
import { usePipelineHeadlineStats } from '@/hooks/usePipelineHeadlineStats'
import { CompanyClientAvatar } from '@/components/companies/CompanyClientAvatar'
import { CreatePositionWizard } from '@/pages/CreatePositionWizard'
import { mapUserFacingError } from '@/lib/errors'

/** Tenure on role: days under a week, else rounded weeks (e.g. 5d, 2w). */
function formatCandidateAge(createdAt: string): string {
  const days = differenceInCalendarDays(new Date(), new Date(createdAt))
  if (days < 7) return `${days}d`
  const w = Math.max(1, Math.round(days / 7))
  return `${w}w`
}

/** One row from position_candidates with nested candidate + stage. */
type BoardAssignmentRow = {
  id: string
  status: string
  created_at: string
  archived_at?: string | null
  candidates: { id: string; full_name: string; deleted_at: string | null } | { id: string; full_name: string; deleted_at: string | null }[] | null
  position_stages: { name: string } | { name: string }[] | null
}

function candidateStageName(st: BoardAssignmentRow['position_stages']): string {
  if (!st) return '—'
  if (Array.isArray(st)) return st[0]?.name ?? '—'
  return st.name ?? '—'
}

function boardCandidateOne(
  v: BoardAssignmentRow['candidates'],
): { id: string; full_name: string; deleted_at: string | null } | null {
  if (v == null) return null
  return Array.isArray(v) ? (v[0] ?? null) : v
}

function positionMatchesSearch(p: PositionListItem, raw: string): boolean {
  const q = raw.trim().toLowerCase()
  if (!q) return true
  if ((p.title ?? '').toLowerCase().includes(q)) return true
  const co = (p.companies as { name?: string } | null)?.name ?? ''
  if (co.toLowerCase().includes(q)) return true
  for (const pc of p.position_candidates ?? []) {
    if (pc.archived_at) continue
    if (pc.status === 'rejected') continue
    const c = boardCandidateOne(pc.candidates)
    if (!c || c.deleted_at) continue
    if ((c.full_name ?? '').toLowerCase().includes(q)) return true
    if (candidateStageName(pc.position_stages).toLowerCase().includes(q)) return true
  }
  return false
}

function partitionByStatus(list: PositionListItem[]) {
  const live = list
    .filter((p) => p.status === 'active' || p.status === 'on_hold')
    .sort((a, b) => {
      const ta = new Date(a.updated_at ?? a.created_at).getTime()
      const tb = new Date(b.updated_at ?? b.created_at).getTime()
      return tb - ta
    })
  const succeeded = list.filter((p) => p.status === 'succeeded')
  const cancelled = list.filter((p) => p.status === 'cancelled')
  return { live, succeeded, cancelled }
}

type PositionListItem = {
  id: string
  title: string
  status: string
  company_id: string
  created_at: string
  updated_at?: string
  opened_at?: string
  companies: unknown
  position_candidates?: BoardAssignmentRow[] | null
}

function PositionCard({
  p,
  isDragging,
  onDragStart,
  onDragEnd,
  showCompanyName = true,
}: {
  p: PositionListItem
  isDragging: boolean
  onDragStart: (id: string) => void
  onDragEnd: () => void
  showCompanyName?: boolean
}) {
  const co = p.companies as { name: string } | null
  const openedRef = p.opened_at ? `${p.opened_at}T12:00:00` : p.created_at
  const daysSinceOpened = differenceInCalendarDays(new Date(), new Date(openedRef))
  const daysSinceCreated = differenceInCalendarDays(new Date(), new Date(p.created_at))
  const cands = (p.position_candidates ?? []).filter((pc) => {
    if (pc.archived_at) return false
    if (pc.status === 'rejected') return false
    const c = boardCandidateOne(pc.candidates)
    return Boolean(c && !c.deleted_at)
  })
  const [expanded, setExpanded] = useState(false)

  return (
    <li>
      <div
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData('application/json', JSON.stringify({ id: p.id, status: p.status, title: p.title }))
          e.dataTransfer.effectAllowed = 'move'
          onDragStart(p.id)
        }}
        onDragEnd={onDragEnd}
        className={`border-line bg-white/70 flex rounded-2xl border transition-[opacity,box-shadow] dark:border-line-dark dark:bg-stone-900/45 ${
          isDragging ? 'opacity-60 shadow-lg ring-2 ring-[#9b3e20]/30' : ''
        }`}
      >
        <div
          className="text-ink-muted hover:text-ink flex w-9 shrink-0 cursor-grab items-center justify-center border-r border-stone-200/80 active:cursor-grabbing dark:border-stone-600"
          aria-hidden
        >
          <GripVertical className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1 px-3 py-2.5">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <Link
              to={`/positions/${p.id}`}
              draggable={false}
              onDragStart={(e) => e.preventDefault()}
              className="min-w-0 flex-1 text-base leading-snug font-semibold break-words text-[#302e2b] underline-offset-2 hover:underline dark:text-stone-100"
            >
              {p.title}
            </Link>
            <span
              className="text-stitch-muted shrink-0 tabular-nums text-xs font-normal dark:text-stone-500"
              title="Days open (role opened-on) / days since record created"
            >
              {daysSinceOpened}d / {daysSinceCreated}d
            </span>
          </div>
          <div className="text-ink-muted mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs dark:text-stone-500">
            {showCompanyName ? (
              <>
                <span className="text-sm font-medium text-stone-800 dark:text-stone-200">{co?.name ?? '—'}</span>
                <span aria-hidden className="select-none">
                  ·
                </span>
              </>
            ) : null}
            <button
              type="button"
              draggable={false}
              onClick={() => setExpanded((v) => !v)}
              className="text-ink-muted hover:text-ink inline-flex items-center gap-1 font-bold tracking-wide uppercase transition dark:text-stone-500 dark:hover:text-stone-300"
              aria-expanded={expanded}
            >
              {expanded ? <ChevronDown className="h-3.5 w-3.5 shrink-0" aria-hidden /> : <ChevronRight className="h-3.5 w-3.5 shrink-0" aria-hidden />}
              {cands.length === 0 ? 'No candidates' : `${cands.length} candidate${cands.length === 1 ? '' : 's'}`}
            </button>
          </div>
          {expanded && cands.length > 0 ? (
            <ul className="mt-1.5 space-y-1.5 border-t border-stone-200/70 pt-1.5 dark:border-stone-600">
              {cands.map((pc) => {
                const c = boardCandidateOne(pc.candidates)!
                const st = candidateStageName(pc.position_stages)
                const out = assignmentStatusPill(pc.status)
                return (
                  <li
                    key={pc.id}
                    className="flex flex-wrap items-center gap-2 rounded-xl bg-stone-50/90 px-2.5 py-2 text-sm dark:bg-stone-800/60"
                  >
                    <Link to={`/positions/${p.id}?candidate=${c.id}`} className="min-w-0 flex-1 font-medium text-[#006384] hover:underline dark:text-cyan-300" draggable={false}>
                      {c.full_name}
                    </Link>
                    <span
                      className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${out.className}`}
                    >
                      {out.label}
                    </span>
                    <span className="text-ink-muted shrink-0 text-[10px] font-semibold tabular-nums dark:text-stone-500" title="Time on role">
                      {formatCandidateAge(pc.created_at)}
                    </span>
                    <span className="text-ink-muted w-full text-[10px] dark:text-stone-500">{st}</span>
                  </li>
                )
              })}
            </ul>
          ) : null}
        </div>
      </div>
    </li>
  )
}

type DropZone = 'live' | 'succeeded' | 'cancelled'

function dropSlotKey(companyId: string, zone: DropZone): string {
  return `${companyId}:${zone}`
}

function columnHeading(zone: DropZone, title: string) {
  const base =
    'mb-3 w-full border-b-2 pb-2 text-center text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-800 sm:text-xs dark:text-stone-200'
  if (zone === 'live') {
    return <h4 className={`${base} border-[#9b3e20]`}>{title}</h4>
  }
  if (zone === 'succeeded') {
    return <h4 className={`${base} border-emerald-700 dark:border-emerald-600`}>{title}</h4>
  }
  return <h4 className={`${base} border-stone-400 dark:border-stone-500`}>{title}</h4>
}

function CompanyBoardColumn({
  companyId,
  companyName,
  companyAvatarUrl,
  positions: colPositions,
  showCompanyOnCards,
  layout = 'scroll',
  draggingId,
  setDraggingId,
  dropHover,
  setDropHover,
  onDragOverSlot,
  onDropSlot,
}: {
  companyId: string
  companyName: string
  companyAvatarUrl?: string | null
  positions: PositionListItem[]
  showCompanyOnCards: boolean
  layout?: 'scroll' | 'kanban'
  draggingId: string | null
  setDraggingId: Dispatch<SetStateAction<string | null>>
  dropHover: string | null
  setDropHover: Dispatch<SetStateAction<string | null>>
  onDragOverSlot: (e: React.DragEvent, companyId: string, zone: DropZone) => void
  onDropSlot: (e: React.DragEvent, companyId: string, zone: DropZone) => void
}) {
  const { live, succeeded, cancelled } = partitionByStatus(colPositions)

  function leaveSlot(e: React.DragEvent, slot: string) {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setDropHover((h) => (h === slot ? null : h))
    }
  }

  function bucketClass(zone: DropZone) {
    const slot = dropSlotKey(companyId, zone)
    const hot = dropHover === slot
    const base = 'mt-2 min-h-[2.5rem] rounded-xl transition-colors'
    if (!hot) return `${base} border border-transparent`
    if (zone === 'succeeded') return `${base} bg-emerald-500/10 ring-2 ring-emerald-500/35`
    if (zone === 'cancelled') return `${base} bg-stone-400/10 ring-2 ring-stone-400/40`
    return `${base} bg-[#fd8863]/10 ring-2 ring-[#9b3e20]/35 dark:bg-orange-500/10 dark:ring-orange-400/40`
  }

  function sectionShell(zone: DropZone, title: string, list: PositionListItem[]) {
    const slot = dropSlotKey(companyId, zone)
    return (
      <section
        onDragOver={(e) => onDragOverSlot(e, companyId, zone)}
        onDrop={(e) => onDropSlot(e, companyId, zone)}
        onDragLeave={(e) => leaveSlot(e, slot)}
        className={
          dropHover === slot
            ? zone === 'succeeded'
              ? 'rounded-xl ring-2 ring-emerald-500/30 ring-offset-1 ring-offset-white dark:ring-offset-stone-900'
              : zone === 'cancelled'
                ? 'rounded-xl ring-2 ring-stone-400/40 ring-offset-1 ring-offset-white dark:ring-offset-stone-900'
                : 'rounded-xl ring-2 ring-[#9b3e20]/25 ring-offset-1 ring-offset-white dark:ring-offset-stone-900'
            : ''
        }
      >
        {columnHeading(zone, title)}
        <div className={bucketClass(zone)}>
          {list.length === 0 ? (
            <p className="text-ink-muted px-1 py-3 text-xs">None — drop a role here.</p>
          ) : (
            <ul className="space-y-2 pt-1">
              {list.map((p) => (
                <PositionCard
                  key={p.id}
                  p={p}
                  showCompanyName={showCompanyOnCards}
                  isDragging={draggingId === p.id}
                  onDragStart={(id) => setDraggingId(id)}
                  onDragEnd={() => {
                    setDraggingId(null)
                    setDropHover(null)
                  }}
                />
              ))}
            </ul>
          )}
        </div>
      </section>
    )
  }

  const scrollShell =
    'border-line bg-white/50 flex min-w-[17.5rem] max-w-md flex-1 flex-col gap-4 rounded-2xl border p-3 shadow-sm dark:border-line-dark dark:bg-stone-900/40'

  const statusBlocks = (
    <>
      {sectionShell('live', 'Active & on hold', live)}
      {sectionShell('succeeded', 'Succeeded', succeeded)}
      {sectionShell('cancelled', 'Cancelled', cancelled)}
    </>
  )

  if (layout === 'kanban') {
    const zones = [
      { zone: 'live' as const, title: 'Active & on hold', list: live },
      { zone: 'succeeded' as const, title: 'Succeeded', list: succeeded },
      { zone: 'cancelled' as const, title: 'Cancelled', list: cancelled },
    ]
    return (
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
          <CompanyClientAvatar companyId={companyId} companyName={companyName} avatarUrl={companyAvatarUrl} />
          <h2 className="text-ink text-lg font-extrabold tracking-tight dark:text-stone-100">{companyName}</h2>
        </div>
        <div className="flex gap-4 overflow-x-auto pb-2 [scrollbar-width:thin] md:grid md:min-h-0 md:grid-cols-2 md:overflow-visible md:pb-0 xl:grid-cols-3">
          {zones.map(({ zone, title, list }) => (
            <div
              key={zone}
              className="border-line bg-white/50 flex min-h-[min(60vh,28rem)] min-w-[min(100%,17.5rem)] shrink-0 flex-col rounded-2xl border p-3 shadow-sm md:min-h-[min(70vh,32rem)] md:min-w-0 dark:border-line-dark dark:bg-stone-900/40"
            >
              {sectionShell(zone, title, list)}
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className={scrollShell}>
      <h3 className="text-ink border-stitch-on-surface/10 border-b pb-2 text-sm font-extrabold dark:border-stone-600 dark:text-stone-100">
        {companyName}
      </h3>
      {statusBlocks}
    </div>
  )
}

export function PositionsPage() {
  const { user } = useAuth()
  const supabase = getSupabase()
  const [search, setSearchParams] = useSearchParams()
  const qc = useQueryClient()
  const { success, error: toastError } = useToast()
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dropHover, setDropHover] = useState<string | null>(null)
  const [searchText, setSearchText] = useState('')

  const companiesQ = useQuery({
    queryKey: ['companies', user?.id],
    enabled: Boolean(supabase && user),
    queryFn: async () => {
      const { data, error } = await supabase!
        .from('companies')
        .select('id, name, status')
        .eq('user_id', user!.id)
        .is('deleted_at', null)
        .order('name')
      if (error) throw error
      return data ?? []
    },
  })

  const positionsQ = useQuery({
    queryKey: ['positions', user?.id],
    enabled: Boolean(supabase && user),
    queryFn: async () => {
      const { data, error } = await supabase!
        .from('positions')
        .select(
          `
          id, title, status, company_id, created_at, updated_at, opened_at,
          companies ( name ),
          position_candidates (
            id,
            status,
            created_at,
            archived_at,
            position_stages ( name ),
            candidates ( id, full_name, deleted_at )
          )
        `,
        )
        .eq('user_id', user!.id)
        .is('deleted_at', null)
        .order('updated_at', { ascending: false })
      // #region agent log
      fetch('http://127.0.0.1:7883/ingest/253f2f27-b59e-401e-9330-b3044ff73852', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '0e315a' },
        body: JSON.stringify({
          sessionId: '0e315a',
          runId: error ? 'pre-fix' : 'post-fix',
          hypothesisId: 'H1',
          location: 'PositionsPage.tsx:positionsQ.queryFn',
          message: 'positions supabase select finished',
          data: {
            hasError: Boolean(error),
            errorCode: error?.code ?? null,
            errorMessage: error?.message ?? null,
            rowCount: Array.isArray(data) ? data.length : null,
          },
          timestamp: Date.now(),
        }),
      }).catch(() => {})
      // #endregion
      if (error) throw error
      return (data ?? []) as unknown as PositionListItem[]
    },
  })

  const movePosition = useMutation({
    mutationFn: async ({ id, next, prev }: { id: string; next: string; prev: string }) => {
      const { error } = await supabase!.from('positions').update({ status: next }).eq('id', id).eq('user_id', user!.id)
      if (error) throw error
      return { id, next, prev }
    },
    onSuccess: async ({ next, prev, id }) => {
      if (!supabase || !user) return
      if (next === 'succeeded') {
        success('Moved to Succeeded')
        await logActivityEvent(supabase, user.id, {
          event_type: 'position_status_changed',
          position_id: id,
          title: 'Position succeeded',
          subtitle: `${prev} → ${next}`,
          metadata: { from: prev, to: next },
        })
      } else if (next === 'cancelled') {
        success('Moved to Cancelled')
        await logActivityEvent(supabase, user.id, {
          event_type: 'position_status_changed',
          position_id: id,
          title: 'Position withdrawn',
          subtitle: `${prev} → ${next}`,
          metadata: { from: prev, to: next },
        })
      } else if (next === 'on_hold') {
        success('Moved to On hold')
        await logActivityEvent(supabase, user.id, {
          event_type: 'position_status_changed',
          position_id: id,
          title: 'Position on hold',
          subtitle: `${prev} → ${next}`,
          metadata: { from: prev, to: next },
        })
      } else {
        success('Moved to Active')
        await logActivityEvent(supabase, user.id, {
          event_type: 'position_status_changed',
          position_id: id,
          title: 'Position status updated',
          subtitle: `${prev} → ${next}`,
          metadata: { from: prev, to: next },
        })
      }
      await qc.invalidateQueries({ queryKey: ['positions'] })
      await qc.invalidateQueries({ queryKey: ['dashboard-top-positions'] })
      await qc.invalidateQueries({ queryKey: ['pipeline-headline-stats'] })
    },
    onError: (e: Error) => toastError(e),
  })

  function parseDragPayload(e: React.DragEvent): { id: string; status: string; title: string } | null {
    try {
      const raw = e.dataTransfer.getData('application/json')
      if (!raw) return null
      const o = JSON.parse(raw) as { id?: string; status?: string; title?: string }
      if (!o.id || !o.status) return null
      return { id: o.id, status: o.status, title: o.title ?? 'Role' }
    } catch {
      return null
    }
  }

  function targetStatusForZone(zone: DropZone, current: string): 'active' | 'on_hold' | 'succeeded' | 'cancelled' | null {
    if (zone === 'succeeded') return current === 'succeeded' ? null : 'succeeded'
    if (zone === 'cancelled') return current === 'cancelled' ? null : 'cancelled'
    if (zone === 'live') {
      if (current === 'active' || current === 'on_hold') return null
      return 'active'
    }
    return null
  }

  function handleDragOverSlot(e: React.DragEvent, companyId: string, zone: DropZone) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDropHover(dropSlotKey(companyId, zone))
  }

  function handleDropSlot(e: React.DragEvent, _companyId: string, zone: DropZone) {
    e.preventDefault()
    setDropHover(null)
    setDraggingId(null)
    const payload = parseDragPayload(e)
    if (!payload) return
    const next = targetStatusForZone(zone, payload.status)
    if (!next) return
    movePosition.mutate({ id: payload.id, next, prev: payload.status })
  }

  const createOpen = search.get('create') === '1'

  const companies = companiesQ.data ?? []
  const positions = positionsQ.data ?? []

  const filteredPositions = useMemo(
    () => positions.filter((p) => positionMatchesSearch(p, searchText)),
    [positions, searchText],
  )

  const tabCompanies = useMemo(() => {
    const list = companies.map((c) => ({
      id: c.id,
      name: c.name,
      avatar_url: (c as { avatar_url?: string | null }).avatar_url ?? null,
    }))
    const ids = new Set(list.map((c) => c.id))
    for (const p of filteredPositions) {
      if (!ids.has(p.company_id)) {
        ids.add(p.company_id)
        const nm = (p.companies as { name?: string } | null)?.name?.trim() || 'Unknown client'
        list.push({ id: p.company_id, name: nm, avatar_url: null })
      }
    }
    return list.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
  }, [companies, filteredPositions])

  const companyFromUrl = search.get('company')
  const scopedCompanyId = useMemo(() => {
    if (!companyFromUrl) return null
    return tabCompanies.some((c) => c.id === companyFromUrl) ? companyFromUrl : null
  }, [companyFromUrl, tabCompanies])

  const scopedClientName = tabCompanies.find((c) => c.id === scopedCompanyId)?.name
  const { data: clientHeadline, isLoading: clientPipelineHeadlineLoading } = usePipelineHeadlineStats(scopedCompanyId)
  const { data: clientTaskKpis, isPending: clientTaskKpisPending } = useDashboardTaskKpis(scopedCompanyId, {
    enabled: Boolean(scopedCompanyId),
  })
  const clientHeroLoading =
    clientPipelineHeadlineLoading || (Boolean(scopedCompanyId) && clientTaskKpisPending)
  const clientCandCount = clientHeadline?.activeCandidateCount ?? 0
  const clientPosCount = clientHeadline?.activePositionCount ?? 0
  const clientOpenTasksCount = clientTaskKpis?.open ?? 0

  /** Drop stale ?company= from URL once we know client list */
  useEffect(() => {
    if (!companyFromUrl) return
    if (positionsQ.isLoading) return
    if (tabCompanies.some((c) => c.id === companyFromUrl)) return
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.delete('company')
        return next
      },
      { replace: true },
    )
  }, [companyFromUrl, tabCompanies, positionsQ.isLoading, setSearchParams])

  useEffect(() => {
    const err = positionsQ.error
    const errMsg = err instanceof Error ? err.message : err != null ? String(err) : null
    const rows = positionsQ.data
    const posLen = rows?.length ?? 0
    const sampleCompanyIds = (rows ?? []).slice(0, 8).map((p) => p.company_id)
    const scopedMatch =
      scopedCompanyId != null ? (rows ?? []).filter((p) => p.company_id === scopedCompanyId).length : null
    // #region agent log
    fetch('http://127.0.0.1:7883/ingest/253f2f27-b59e-401e-9330-b3044ff73852', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '0e315a' },
      body: JSON.stringify({
        sessionId: '0e315a',
        runId: positionsQ.isError ? 'pre-fix' : 'post-fix',
        hypothesisId: 'H2-H5',
        location: 'PositionsPage.tsx:agentDebugEffect',
        message: 'positions page derived state',
        data: {
          positionsStatus: positionsQ.status,
          positionsFetchStatus: positionsQ.fetchStatus,
          positionsIsLoading: positionsQ.isLoading,
          positionsIsError: positionsQ.isError,
          positionsErrorMessage: errMsg,
          positionsLen: posLen,
          filteredLen: filteredPositions.length,
          companiesLen: companies.length,
          companyFromUrl,
          scopedCompanyId,
          urlInTabCompanies: companyFromUrl != null ? tabCompanies.some((c) => c.id === companyFromUrl) : null,
          tabCompaniesCount: tabCompanies.length,
          searchTextLen: searchText.trim().length,
          scopedMatchCount: scopedMatch,
          samplePositionCompanyIds: sampleCompanyIds,
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {})
    // #endregion
  }, [
    positionsQ.status,
    positionsQ.fetchStatus,
    positionsQ.isLoading,
    positionsQ.isError,
    positionsQ.error,
    positionsQ.data,
    filteredPositions,
    companies.length,
    companyFromUrl,
    scopedCompanyId,
    tabCompanies,
    searchText,
  ])

  return (
    <div className="flex flex-col gap-6">
      <ScreenHeader
        title="Positions"
        subtitle="Drag roles by the grip between Active & on hold, Succeeded, and Cancelled."
        showBack={false}
        right={
          <Link
            to="/positions?create=1"
            className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-r from-[#9b3e20] to-[#fd8863] text-white shadow-sm transition hover:brightness-105 dark:from-orange-700 dark:to-orange-500"
            aria-label="New position"
          >
            <Plus className="h-8 w-8 stroke-[2.75]" strokeLinecap="round" strokeLinejoin="round" aria-hidden />
          </Link>
        }
      />

      {scopedCompanyId ? (
        <section
          className="border-stitch-on-surface/10 relative overflow-hidden rounded-3xl border bg-gradient-to-br from-lume-coral/22 via-white to-lume-violet/16 p-6 shadow-[0_24px_60px_rgba(155,62,32,0.14),0_0_0_1px_rgba(167,139,250,0.08)] md:p-8 dark:from-orange-500/18 dark:via-stone-900 dark:to-violet-900/25 dark:shadow-[0_0_0_1px_rgba(167,139,250,0.12)]"
          aria-label="Pipeline summary for this client"
        >
          <div className="pointer-events-none absolute -right-16 -bottom-16 h-40 w-40 rounded-full bg-lume-coral/25 blur-3xl dark:bg-orange-500/22" />
          <div className="relative z-10">
            {scopedClientName ? (
              <p className="text-ink-muted mb-2 text-sm font-semibold dark:text-stone-400">
                Client: <span className="text-ink dark:text-stone-200">{scopedClientName}</span>
              </p>
            ) : null}
            <h2 className="text-page-title text-xl font-extrabold tracking-tight md:text-2xl">
              {clientHeroLoading ? (
                <>You&apos;re currently working on…</>
              ) : (
                <>
                  You&apos;re currently working on {clientCandCount}{' '}
                  {clientCandCount === 1 ? 'Candidate' : 'Candidates'} within {clientPosCount}{' '}
                  {clientPosCount === 1 ? 'Position' : 'Positions'} - {clientOpenTasksCount} open{' '}
                  {clientOpenTasksCount === 1 ? 'Task' : 'Tasks'}.
                </>
              )}
            </h2>
          </div>
        </section>
      ) : null}

      {createOpen && companies.length === 0 ? (
        <p className="text-ink-muted rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm dark:border-amber-900/50 dark:bg-amber-950/30">
          Add a{' '}
          <Link className="text-accent font-medium underline dark:text-orange-300" to="/companies/new">
            company
          </Link>{' '}
          first, then create a position.
        </p>
      ) : null}

      {createOpen && companies.length > 0 ? <CreatePositionWizard companies={companies} /> : null}

      <div className="relative">
        <Search
          className="text-ink-muted pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
          aria-hidden
        />
        <input
          type="search"
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          placeholder="Search roles, clients, candidates, stages…"
          className="border-line bg-white/80 focus:ring-accent/30 w-full rounded-2xl border py-2.5 pr-3 pl-10 text-sm shadow-sm outline-none focus:ring-2 dark:border-line-dark dark:bg-stone-900/50"
          aria-label="Search positions and candidates"
        />
      </div>

      {positionsQ.isLoading ? (
        <PageSpinner message="Loading roles…" />
      ) : positionsQ.isError ? (
        <p className="text-ink-muted rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm dark:border-red-900/40 dark:bg-red-950/25" role="alert">
          Could not load roles. {mapUserFacingError(positionsQ.error)}
        </p>
      ) : positions.length === 0 ? (
        <p className="text-ink-muted text-sm">No positions yet.</p>
      ) : filteredPositions.length === 0 ? (
        <p className="text-ink-muted text-sm">No positions match your search.</p>
      ) : (
        <div className="flex flex-col gap-4">
          {!scopedCompanyId ? (
            <div className="flex gap-4 overflow-x-auto pb-2 [scrollbar-width:thin] md:flex-wrap md:overflow-x-visible">
              {tabCompanies.map((c) => (
                <CompanyBoardColumn
                  key={c.id}
                  companyId={c.id}
                  companyName={c.name}
                  layout="scroll"
                  positions={filteredPositions.filter((p) => p.company_id === c.id)}
                  showCompanyOnCards={false}
                  draggingId={draggingId}
                  setDraggingId={setDraggingId}
                  dropHover={dropHover}
                  setDropHover={setDropHover}
                  onDragOverSlot={handleDragOverSlot}
                  onDropSlot={handleDropSlot}
                />
              ))}
            </div>
          ) : (
            <CompanyBoardColumn
              companyId={scopedCompanyId}
              companyName={tabCompanies.find((c) => c.id === scopedCompanyId)?.name ?? 'Company'}
              companyAvatarUrl={tabCompanies.find((c) => c.id === scopedCompanyId)?.avatar_url}
              layout="kanban"
              positions={filteredPositions.filter((p) => p.company_id === scopedCompanyId)}
              showCompanyOnCards={false}
              draggingId={draggingId}
              setDraggingId={setDraggingId}
              dropHover={dropHover}
              setDropHover={setDropHover}
              onDragOverSlot={handleDragOverSlot}
              onDropSlot={handleDropSlot}
            />
          )}
        </div>
      )}
    </div>
  )
}
