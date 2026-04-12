import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import { differenceInCalendarDays, formatDistanceToNow } from 'date-fns'
import { Mail, Phone, Search, UserPlus } from 'lucide-react'

import { useAuth } from '@/auth/useAuth'
import { getSupabase } from '@/lib/supabase'
import { logActivityEvent } from '@/lib/activityLog'
import { candidateOutcomePill } from '@/lib/candidateOutcomePill'
import { ScreenHeader } from '@/components/layout/ScreenHeader'
import { Modal } from '@/components/ui/Modal'
import { useToast } from '@/hooks/useToast'
import { formatDateTime } from '@/lib/dates'

type Outcome = 'active' | 'rejected' | 'withdrawn' | 'hired'

type CandidateRow = {
  id: string
  full_name: string
  outcome: string
  created_at: string
  updated_at: string
  position_id: string
  email: string | null
  phone: string | null
  position_stages: { name: string } | null
  positions: {
    id: string
    title: string
    status: string
    company_id: string
    companies: { id: string; name: string } | null
  } | null
}

type AssignPositionOption = {
  id: string
  title: string
  companies: { name: string } | null | { name: string }[]
}

function nestedCompanyName(c: AssignPositionOption['companies']): string | null {
  if (!c) return null
  if (Array.isArray(c)) return c[0]?.name ?? null
  return c.name
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

const newCandidateButtonClass =
  'inline-flex shrink-0 items-center rounded-full bg-gradient-to-r from-[#9b3e20] to-[#fd8863] px-4 py-2 text-sm font-bold text-white shadow-sm dark:from-orange-700 dark:to-orange-500'

export function CandidatesPage() {
  const { user } = useAuth()
  const supabase = getSupabase()
  const uid = user?.id
  const qc = useQueryClient()
  const navigate = useNavigate()
  const { success, error: toastError } = useToast()
  const [searchParams, setSearchParams] = useSearchParams()
  const showAssignHint = searchParams.get('assign') === '1'
  const openNewCandidateFromQuery = searchParams.get('new') === '1'
  const [outcomeFilter, setOutcomeFilter] = useState<'all' | Outcome>('active')
  const [companyTab, setCompanyTab] = useState<'all' | string>('all')
  const [search, setSearch] = useState('')
  const [assignFor, setAssignFor] = useState<CandidateRow | null>(null)
  const [assignPositionId, setAssignPositionId] = useState('')
  const [newCandidateOpen, setNewCandidateOpen] = useState(false)
  const [newCandidatePositionId, setNewCandidatePositionId] = useState('')

  function dismissAssignHint() {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.delete('assign')
        return next
      },
      { replace: true },
    )
  }

  useEffect(() => {
    if (!showAssignHint) return
    const id = window.requestAnimationFrame(() => {
      document.getElementById('candidate-list')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
    return () => cancelAnimationFrame(id)
  }, [showAssignHint])

  useEffect(() => {
    if (!openNewCandidateFromQuery) return
    setNewCandidatePositionId('')
    setNewCandidateOpen(true)
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.delete('new')
        return next
      },
      { replace: true },
    )
  }, [openNewCandidateFromQuery, setSearchParams])

  const q = useQuery({
    queryKey: ['all-candidates', uid, outcomeFilter],
    enabled: Boolean(supabase && uid),
    queryFn: async () => {
      let query = supabase!
        .from('candidates')
        .select(
          `
          id, full_name, email, phone, outcome, created_at, updated_at, position_id,
          position_stages ( name ),
          positions ( id, title, status, company_id, companies ( id, name ) )
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

  const positionsForAssignQ = useQuery({
    queryKey: ['candidates-assign-positions', uid],
    enabled: Boolean(supabase && uid),
    queryFn: async () => {
      const { data, error } = await supabase!
        .from('positions')
        .select('id, title, companies ( name )')
        .eq('user_id', uid!)
        .in('status', ['pending', 'in_progress'])
        .order('updated_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as unknown as AssignPositionOption[]
    },
  })

  const assignMutation = useMutation({
    mutationFn: async ({ candidate, newPositionId }: { candidate: CandidateRow; newPositionId: string }) => {
      if (!supabase || !uid) throw new Error('Not signed in')
      if (newPositionId === candidate.position_id) throw new Error('Already on this role')
      const oldTitle = candidate.positions?.title ?? 'Previous role'
      const { data: stages, error: stErr } = await supabase
        .from('position_stages')
        .select('id')
        .eq('position_id', newPositionId)
        .order('sort_order', { ascending: true })
        .limit(1)
      if (stErr) throw stErr
      const firstStageId = stages?.[0]?.id ?? null
      const { error: upErr } = await supabase
        .from('candidates')
        .update({
          position_id: newPositionId,
          position_stage_id: firstStageId,
          updated_at: new Date().toISOString(),
        })
        .eq('id', candidate.id)
        .eq('user_id', uid)
      if (upErr) throw upErr
      const { error: taskErr } = await supabase
        .from('tasks')
        .update({ position_id: newPositionId, updated_at: new Date().toISOString() })
        .eq('candidate_id', candidate.id)
        .eq('user_id', uid)
      if (taskErr) throw taskErr
      await logActivityEvent(supabase, uid, {
        event_type: 'candidate_reassigned',
        position_id: newPositionId,
        candidate_id: candidate.id,
        title: `${candidate.full_name} assigned here`,
        subtitle: `From: ${oldTitle}`,
        metadata: { from_position_id: candidate.position_id, to_position_id: newPositionId },
      })
      return { oldPid: candidate.position_id, newPid: newPositionId }
    },
    onSuccess: async ({ oldPid, newPid }) => {
      success('Candidate assigned to role')
      setAssignFor(null)
      setAssignPositionId('')
      await qc.invalidateQueries({ queryKey: ['all-candidates'] })
      await qc.invalidateQueries({ queryKey: ['position-candidates', oldPid] })
      await qc.invalidateQueries({ queryKey: ['position-candidates', newPid] })
      await qc.invalidateQueries({ queryKey: ['position-activity', oldPid] })
      await qc.invalidateQueries({ queryKey: ['position-activity', newPid] })
      await qc.invalidateQueries({ queryKey: ['position-tasks', oldPid] })
      await qc.invalidateQueries({ queryKey: ['position-tasks', newPid] })
      await qc.invalidateQueries({ queryKey: ['dashboard-tasks'] })
      await qc.invalidateQueries({ queryKey: ['candidate-detail'] })
    },
    onError: (e: Error) => toastError(e.message),
  })

  const rows = q.data ?? []
  const assignOptions = useMemo(() => {
    if (!assignFor) return []
    return (positionsForAssignQ.data ?? []).filter((p) => p.id !== assignFor.position_id)
  }, [assignFor, positionsForAssignQ.data])

  const companiesInView = useMemo(() => {
    const map = new Map<string, string>()
    for (const c of rows) {
      const cid = c.positions?.company_id
      if (!cid) continue
      const name = c.positions?.companies?.name?.trim()
      map.set(cid, name || 'Unknown client')
    }
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
  }, [rows])

  useEffect(() => {
    if (companyTab === 'all') return
    if (companiesInView.some((co) => co.id === companyTab)) return
    setCompanyTab('all')
  }, [companiesInView, companyTab])

  const filteredRows = useMemo(() => {
    let list = rows.filter((c) => candidateMatchesSearch(c, search))
    if (companyTab !== 'all') {
      list = list.filter((c) => c.positions?.company_id === companyTab)
    }
    return list
  }, [rows, search, companyTab])
  const newCandidatePositionOptions = positionsForAssignQ.data ?? []

  return (
    <div className="flex flex-col gap-6">
      <Modal
        open={newCandidateOpen}
        onClose={() => setNewCandidateOpen(false)}
        title="Add candidate"
        size="md"
      >
        <div className="flex flex-col gap-4">
          <p className="text-ink-muted text-sm dark:text-stone-400">
            Choose an active role — you&apos;ll add their name and contact details on the next screen.
          </p>
          {positionsForAssignQ.isLoading ? (
            <p className="text-sm">Loading roles…</p>
          ) : newCandidatePositionOptions.length === 0 ? (
            <p className="text-sm text-amber-800 dark:text-amber-200">
              No active roles yet.{' '}
              <Link to="/positions?create=1" className="font-semibold underline">
                Create a position
              </Link>{' '}
              first.
            </p>
          ) : (
            <label className="flex flex-col gap-1 text-sm font-medium">
              Role
              <select
                value={newCandidatePositionId}
                onChange={(e) => setNewCandidatePositionId(e.target.value)}
                className="border-line rounded-xl border px-3 py-2 dark:border-line-dark dark:bg-stone-900/50"
              >
                <option value="">Select a role…</option>
                {newCandidatePositionOptions.map((p) => {
                  const co = nestedCompanyName(p.companies)
                  return (
                    <option key={p.id} value={p.id}>
                      {p.title}
                      {co ? ` — ${co}` : ''}
                    </option>
                  )
                })}
              </select>
            </label>
          )}
          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              className="border-line rounded-full border px-4 py-2 text-sm font-medium dark:border-line-dark"
              onClick={() => {
                setNewCandidateOpen(false)
                setNewCandidatePositionId('')
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              className="rounded-full bg-[#9b3e20] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 dark:bg-orange-600"
              disabled={!newCandidatePositionId || newCandidatePositionOptions.length === 0}
              onClick={() => {
                if (!newCandidatePositionId) return
                setNewCandidateOpen(false)
                const pid = newCandidatePositionId
                setNewCandidatePositionId('')
                navigate(`/positions/${pid}?addCandidate=1`)
              }}
            >
              Continue
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        open={assignFor !== null}
        onClose={() => {
          if (assignMutation.isPending) return
          setAssignFor(null)
          setAssignPositionId('')
        }}
        title="Assign candidate"
        size="md"
      >
        {assignFor ? (
          <div className="flex flex-col gap-4">
            <p className="text-ink-muted text-sm dark:text-stone-400">
              Move <span className="text-ink font-semibold dark:text-stone-200">{assignFor.full_name}</span> to another
              active role. Their pipeline stage resets to the first stage on the new role. Open tasks for this candidate
              are moved to the new role.
            </p>
            {positionsForAssignQ.isLoading ? (
              <p className="text-sm">Loading roles…</p>
            ) : assignOptions.length === 0 ? (
              <p className="text-sm text-amber-800 dark:text-amber-200">
                No other active roles available. Create or reopen a role under Positions first.
              </p>
            ) : (
              <label className="flex flex-col gap-1 text-sm font-medium">
                Role
                <select
                  value={assignPositionId}
                  onChange={(e) => setAssignPositionId(e.target.value)}
                  className="border-line rounded-xl border px-3 py-2 dark:border-line-dark dark:bg-stone-900/50"
                >
                  <option value="">Select a role…</option>
                  {assignOptions.map((p) => {
                    const co = nestedCompanyName(p.companies)
                    return (
                      <option key={p.id} value={p.id}>
                        {p.title}
                        {co ? ` — ${co}` : ''}
                      </option>
                    )
                  })}
                </select>
              </label>
            )}
            <div className="flex flex-wrap justify-end gap-2">
              <button
                type="button"
                className="border-line rounded-full border px-4 py-2 text-sm font-medium dark:border-line-dark"
                disabled={assignMutation.isPending}
                onClick={() => {
                  setAssignFor(null)
                  setAssignPositionId('')
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="bg-[#9b3e20] text-white rounded-full px-4 py-2 text-sm font-semibold disabled:opacity-50 dark:bg-orange-600"
                disabled={assignMutation.isPending || !assignPositionId || assignOptions.length === 0}
                onClick={() => {
                  if (!assignFor || !assignPositionId) return
                  assignMutation.mutate({ candidate: assignFor, newPositionId: assignPositionId })
                }}
              >
                {assignMutation.isPending ? 'Assigning…' : 'Assign'}
              </button>
            </div>
          </div>
        ) : null}
      </Modal>

      <ScreenHeader
        title="Candidates"
        subtitle="Everyone in your pipeline — open a role to edit details or import."
        backTo="/"
        right={
          <button
            type="button"
            className={newCandidateButtonClass}
            onClick={() => {
              setNewCandidatePositionId('')
              setNewCandidateOpen(true)
            }}
          >
            New
          </button>
        }
      />

      {showAssignHint ? (
        <div
          className="border-line flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-violet-200/90 bg-gradient-to-r from-violet-100/90 to-fuchsia-100/70 px-4 py-3 dark:border-violet-800/60 dark:from-violet-950/80 dark:to-fuchsia-950/50"
          role="status"
        >
          <p className="text-sm font-medium text-violet-950 dark:text-violet-100">
            Use <span className="font-extrabold">Assign</span> on a row to move that candidate to another active role.
          </p>
          <button
            type="button"
            className="shrink-0 rounded-full border border-violet-300 bg-white/90 px-3 py-1 text-xs font-bold text-violet-900 dark:border-violet-600 dark:bg-violet-900/40 dark:text-violet-100"
            onClick={dismissAssignHint}
          >
            OK
          </button>
        </div>
      ) : null}

      <div className="flex flex-col gap-4">
        <div>
          <p className="text-ink-muted mb-2 text-[10px] font-bold tracking-wide uppercase dark:text-stone-500">Outcome</p>
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
        </div>

        {companiesInView.length > 0 ? (
          <div>
            <p className="text-ink-muted mb-2 text-[10px] font-bold tracking-wide uppercase dark:text-stone-500">Client</p>
            <div className="flex flex-wrap gap-2" role="tablist" aria-label="Filter by client">
              <button
                type="button"
                role="tab"
                aria-selected={companyTab === 'all'}
                onClick={() => setCompanyTab('all')}
                className={`rounded-full px-3 py-1 text-xs font-bold transition ${
                  companyTab === 'all'
                    ? 'bg-[#006384] text-white dark:bg-cyan-700'
                    : 'border border-stone-300 dark:border-stone-600'
                }`}
              >
                All clients
              </button>
              {companiesInView.map((co) => (
                <button
                  key={co.id}
                  type="button"
                  role="tab"
                  aria-selected={companyTab === co.id}
                  onClick={() => setCompanyTab(co.id)}
                  className={`max-w-[14rem] truncate rounded-full px-3 py-1 text-xs font-bold transition ${
                    companyTab === co.id
                      ? 'bg-[#006384] text-white dark:bg-cyan-700'
                      : 'border border-stone-300 dark:border-stone-600'
                  }`}
                  title={co.name}
                >
                  {co.name}
                </button>
              ))}
            </div>
          </div>
        ) : null}
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
        <ul id="candidate-list" className="space-y-2">
          {filteredRows.map((c) => {
            const pos = c.positions
            const stage = c.position_stages?.name?.trim()
            const company = pos?.companies?.name
            const days = differenceInCalendarDays(new Date(), new Date(c.created_at))
            const out = candidateOutcomePill(c.outcome)
            const updatedRel = formatDistanceToNow(new Date(c.updated_at), { addSuffix: true })
            return (
              <li
                key={c.id}
                className="border-line flex overflow-hidden rounded-2xl border bg-white/80 shadow-sm transition dark:border-line-dark dark:bg-stone-900/50"
              >
                <Link
                  to={`/candidates/${c.id}`}
                  className="text-ink-muted min-w-0 flex-1 px-4 py-3 transition hover:bg-stone-50/90 dark:hover:bg-stone-800/50"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-ink text-lg font-bold tracking-tight dark:text-stone-100">{c.full_name}</span>
                    <span
                      className={`inline-flex shrink-0 items-center rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase ${out.className}`}
                    >
                      {out.label}
                    </span>
                  </div>
                  <p className="mt-1 text-sm">
                    {pos ? (
                      <>
                        <span className="text-ink font-medium dark:text-stone-200">{pos.title}</span>
                        {company ? (
                          <>
                            <span className="opacity-60"> · </span>
                            <span className="font-medium dark:text-stone-400">{company}</span>
                          </>
                        ) : null}
                      </>
                    ) : (
                      <span>Role unavailable</span>
                    )}
                  </p>
                  <div className="mt-2 flex flex-col gap-1 text-xs sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-3 sm:gap-y-1">
                    {c.email ? (
                      <span className="inline-flex min-w-0 items-center gap-1">
                        <Mail className="h-3.5 w-3.5 shrink-0 opacity-50" aria-hidden />
                        <span className="truncate">{c.email}</span>
                      </span>
                    ) : null}
                    {c.phone ? (
                      <span className="inline-flex min-w-0 items-center gap-1">
                        <Phone className="h-3.5 w-3.5 shrink-0 opacity-50" aria-hidden />
                        <span className="truncate">{c.phone}</span>
                      </span>
                    ) : null}
                    {!c.email && !c.phone ? <span className="text-stitch-muted">No email or phone on file</span> : null}
                  </div>
                  <p className="text-stitch-muted mt-2 text-xs">
                    <span className="text-ink/80 dark:text-stone-400">Pipeline stage:</span>{' '}
                    <span className="font-medium text-[#302e2b] dark:text-stone-200">{stage || '—'}</span>
                    <span className="text-stitch-muted mx-2" aria-hidden>
                      ·
                    </span>
                    <span title={formatDateTime(c.updated_at)} className="font-medium text-stone-600 dark:text-stone-400">
                      Updated {updatedRel}
                    </span>
                    <span className="text-stitch-muted mx-2" aria-hidden>
                      ·
                    </span>
                    <span className="font-medium text-stone-600 dark:text-stone-400">{days}d on role</span>
                  </p>
                </Link>
                <div className="border-line flex shrink-0 flex-col border-l dark:border-line-dark">
                  <button
                    type="button"
                    onClick={() => {
                      setAssignFor(c)
                      setAssignPositionId('')
                    }}
                    className="text-ink-muted hover:bg-[#9b3e20]/10 hover:text-[#9b3e20] dark:hover:bg-orange-500/15 dark:hover:text-orange-300 flex h-full min-h-[4.5rem] flex-col items-center justify-center gap-1 px-3 text-xs font-semibold transition"
                    aria-label={`Assign ${c.full_name} to another role`}
                  >
                    <UserPlus className="h-4 w-4" aria-hidden />
                    Assign
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
