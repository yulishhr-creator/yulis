import { Link, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { differenceInCalendarDays } from 'date-fns'
import { ChevronDown, ChevronRight, GripVertical, Search } from 'lucide-react'
import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react'

import { useAuth } from '@/auth/useAuth'
import { getSupabase } from '@/lib/supabase'
import { ScreenHeader } from '@/components/layout/ScreenHeader'
import { logActivityEvent } from '@/lib/activityLog'
import { assignmentStatusPill, positionLifecyclePill } from '@/lib/candidateStatus'
import { useToast } from '@/hooks/useToast'
import { CreatePositionWizard } from '@/pages/CreatePositionWizard'

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
  for (const pc of p.candidates ?? []) {
    const c = boardCandidateOne(pc.candidates)
    if (!c || c.deleted_at) continue
    if ((c.full_name ?? '').toLowerCase().includes(q)) return true
    if (candidateStageName(pc.position_stages).toLowerCase().includes(q)) return true
  }
  return false
}

function partitionByStatus(list: PositionListItem[]) {
  const active = list.filter((p) => p.status === 'active')
  const onHold = list.filter((p) => p.status === 'on_hold')
  const succeeded = list.filter((p) => p.status === 'succeeded')
  const cancelled = list.filter((p) => p.status === 'cancelled')
  return { active, onHold, succeeded, cancelled }
}

type PositionListItem = {
  id: string
  title: string
  status: string
  company_id: string
  created_at: string
  companies: unknown
  candidates?: BoardAssignmentRow[] | null
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
  const daysSince = differenceInCalendarDays(new Date(), new Date(p.created_at))
  const pill = positionLifecyclePill(p.status)
  const cands = (p.candidates ?? []).filter((pc) => {
    const c = boardCandidateOne(pc.candidates)
    return c && !c.deleted_at
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
              className="shrink-0 rounded-xl bg-gradient-to-br from-[#fd8863]/35 to-[#97daff]/40 px-2.5 py-1 text-xs font-extrabold tabular-nums text-[#9b3e20] ring-1 ring-[#9b3e20]/25 dark:from-orange-500/30 dark:to-cyan-500/25 dark:text-orange-200 dark:ring-orange-400/35"
              title="Days since this position was created"
            >
              {daysSince}d
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
            <span
              className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[10px] font-bold tracking-wide uppercase ${pill.className}`}
            >
              {pill.label}
            </span>
            <span aria-hidden className="select-none">
              ·
            </span>
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

type DropZone = 'active' | 'on_hold' | 'succeeded' | 'cancelled'

function dropSlotKey(companyId: string, zone: DropZone): string {
  return `${companyId}:${zone}`
}

function CompanyBoardColumn({
  companyId,
  companyName,
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
  positions: PositionListItem[]
  showCompanyOnCards: boolean
  layout?: 'scroll' | 'single'
  draggingId: string | null
  setDraggingId: Dispatch<SetStateAction<string | null>>
  dropHover: string | null
  setDropHover: Dispatch<SetStateAction<string | null>>
  onDragOverSlot: (e: React.DragEvent, companyId: string, zone: DropZone) => void
  onDropSlot: (e: React.DragEvent, companyId: string, zone: DropZone) => void
}) {
  const { active, onHold, succeeded, cancelled } = partitionByStatus(colPositions)

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
    if (zone === 'on_hold') return `${base} bg-amber-500/10 ring-2 ring-amber-500/35`
    if (zone === 'cancelled') return `${base} bg-stone-400/10 ring-2 ring-stone-400/40`
    return `${base} bg-[#fd8863]/10 ring-2 ring-[#9b3e20]/35 dark:bg-orange-500/10 dark:ring-orange-400/40`
  }

  function sectionShell(zone: DropZone, title: string, hint: string, list: PositionListItem[]) {
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
                : zone === 'on_hold'
                  ? 'rounded-xl ring-2 ring-amber-400/35 ring-offset-1 ring-offset-white dark:ring-offset-stone-900'
                  : 'rounded-xl ring-2 ring-[#9b3e20]/25 ring-offset-1 ring-offset-white dark:ring-offset-stone-900'
            : ''
        }
      >
        <h4 className="text-xs font-extrabold tracking-wide text-[#302e2b] uppercase dark:text-stone-200">{title}</h4>
        <p className="text-ink-muted text-[11px] leading-snug dark:text-stone-500">{hint}</p>
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

  const colShell =
    layout === 'single'
      ? 'border-line bg-white/50 mx-auto w-full max-w-xl flex flex-col gap-4 rounded-2xl border p-3 shadow-sm dark:border-line-dark dark:bg-stone-900/40'
      : 'border-line bg-white/50 flex min-w-[17.5rem] max-w-md flex-1 flex-col gap-4 rounded-2xl border p-3 shadow-sm dark:border-line-dark dark:bg-stone-900/40'

  return (
    <div className={colShell}>
      <h3 className="text-ink border-stitch-on-surface/10 border-b pb-2 text-sm font-extrabold dark:border-stone-600 dark:text-stone-100">
        {companyName}
      </h3>
      {sectionShell('active', 'Active', 'Open roles — actively sourcing.', active)}
      {sectionShell('on_hold', 'On hold', 'Paused roles.', onHold)}
      {sectionShell('succeeded', 'Succeeded', 'Fulfilled placements.', succeeded)}
      {sectionShell('cancelled', 'Cancelled', 'Closed without hire.', cancelled)}
    </div>
  )
}

export function PositionsPage() {
  const { user } = useAuth()
  const supabase = getSupabase()
  const [search] = useSearchParams()
  const qc = useQueryClient()
  const { success, error: toastError } = useToast()
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dropHover, setDropHover] = useState<string | null>(null)
  const [companyTab, setCompanyTab] = useState<'all' | string>('all')
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
          id, title, status, company_id, created_at, updated_at,
          companies ( name ),
          position_candidates (
            id,
            status,
            created_at,
            position_stages ( name ),
            candidates ( id, full_name, deleted_at )
          )
        `,
        )
        .eq('user_id', user!.id)
        .is('deleted_at', null)
        .order('updated_at', { ascending: false })
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
    },
    onError: (e: Error) => toastError(e.message),
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
    if (zone === 'active') return current === 'active' ? null : 'active'
    if (zone === 'on_hold') return current === 'on_hold' ? null : 'on_hold'
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
    const list = companies.map((c) => ({ id: c.id, name: c.name }))
    const ids = new Set(list.map((c) => c.id))
    for (const p of filteredPositions) {
      if (!ids.has(p.company_id)) {
        ids.add(p.company_id)
        const nm = (p.companies as { name?: string } | null)?.name?.trim() || 'Unknown client'
        list.push({ id: p.company_id, name: nm })
      }
    }
    return list.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
  }, [companies, filteredPositions])

  useEffect(() => {
    if (companyTab === 'all') return
    if (tabCompanies.some((c) => c.id === companyTab)) return
    setCompanyTab('all')
  }, [companyTab, tabCompanies])

  return (
    <div className="flex flex-col gap-6">
      <ScreenHeader
        title="Positions"
        subtitle="Filter by client, then drag roles between Active, On hold, Succeeded, and Cancelled."
        backTo="/"
        right={
          <Link
            to="/positions?create=1"
            className="inline-flex shrink-0 items-center rounded-full bg-gradient-to-r from-[#9b3e20] to-[#fd8863] px-4 py-2 text-sm font-bold text-white shadow-sm dark:from-orange-700 dark:to-orange-500"
          >
            New
          </Link>
        }
      />

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

      <p className="text-ink-muted text-xs dark:text-stone-500">
        Drag a role by the grip into <strong className="text-ink dark:text-stone-300">Active</strong>,{' '}
        <strong className="text-ink dark:text-stone-300">On hold</strong>, <strong className="text-ink dark:text-stone-300">Succeeded</strong>, or{' '}
        <strong className="text-ink dark:text-stone-300">Cancelled</strong> within a client column.
      </p>

      {positionsQ.isLoading ? (
        <p className="text-ink-muted text-sm">Loading…</p>
      ) : positions.length === 0 ? (
        <p className="text-ink-muted text-sm">No positions yet.</p>
      ) : filteredPositions.length === 0 ? (
        <p className="text-ink-muted text-sm">No positions match your search.</p>
      ) : (
        <div className="flex flex-col gap-4">
          <div
            className="border-line flex flex-wrap gap-2 border-b border-stone-200/80 pb-3 dark:border-stone-600"
            role="tablist"
            aria-label="Filter by company"
          >
            <button
              type="button"
              role="tab"
              aria-selected={companyTab === 'all'}
              onClick={() => setCompanyTab('all')}
              className={`rounded-full px-4 py-2 text-xs font-bold transition ${
                companyTab === 'all'
                  ? 'bg-[#9b3e20] text-white dark:bg-orange-600'
                  : 'border border-stone-300 bg-white/80 dark:border-stone-600 dark:bg-stone-900/50'
              }`}
            >
              All
            </button>
            {tabCompanies.map((c) => (
              <button
                key={c.id}
                type="button"
                role="tab"
                aria-selected={companyTab === c.id}
                onClick={() => setCompanyTab(c.id)}
                className={`max-w-[14rem] truncate rounded-full px-4 py-2 text-xs font-bold transition ${
                  companyTab === c.id
                    ? 'bg-[#9b3e20] text-white dark:bg-orange-600'
                    : 'border border-stone-300 bg-white/80 dark:border-stone-600 dark:bg-stone-900/50'
                }`}
                title={c.name}
              >
                {c.name}
              </button>
            ))}
          </div>

          {companyTab === 'all' ? (
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
              companyId={companyTab}
              companyName={tabCompanies.find((c) => c.id === companyTab)?.name ?? 'Company'}
              layout="single"
              positions={filteredPositions.filter((p) => p.company_id === companyTab)}
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
