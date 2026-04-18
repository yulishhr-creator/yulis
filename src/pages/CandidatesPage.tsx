import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import { differenceInCalendarDays, formatDistanceToNow } from 'date-fns'
import { Mail, Phone, Plus, Search, UserPlus } from 'lucide-react'

import { useAuth } from '@/auth/useAuth'
import { getSupabase } from '@/lib/supabase'
import { logActivityEvent } from '@/lib/activityLog'
import { candidateGlobalPill } from '@/lib/candidateStatus'
import { logPositionCandidateTransition } from '@/lib/positionTransitions'
import { ScreenHeader } from '@/components/layout/ScreenHeader'
import { PageSpinner } from '@/components/ui/PageSpinner'
import { Modal } from '@/components/ui/Modal'
import { useToast } from '@/hooks/useToast'
import { formatDateTime } from '@/lib/dates'

type NestedPosition = {
  id: string
  title: string
  company_id: string
  companies: { id: string; name: string } | null
} | null

type PositionCandidateNest = {
  id: string
  status: string
  position_id: string
  positions: NestedPosition
  position_stages: { name: string } | null
}

type CandidateRow = {
  id: string
  full_name: string
  email: string | null
  phone: string | null
  current_title: string | null
  status: string
  created_at: string
  updated_at: string
  position_candidates: PositionCandidateNest[] | PositionCandidateNest | null
}

type AssignPositionOption = {
  id: string
  title: string
  companies: { name: string } | null | { name: string }[]
}

function nestedPcList(v: CandidateRow['position_candidates']): PositionCandidateNest[] {
  if (v == null) return []
  return Array.isArray(v) ? v : [v]
}

function nestedCompanyName(c: AssignPositionOption['companies']): string | null {
  if (!c) return null
  if (Array.isArray(c)) return c[0]?.name ?? null
  return c.name
}

function digitsOnly(s: string): string {
  return s.replace(/\D/g, '')
}

function activeAssignmentCount(c: CandidateRow): number {
  return nestedPcList(c.position_candidates).filter((pc) => pc.status === 'in_progress').length
}

function candidateMatchesSearch(c: CandidateRow, raw: string): boolean {
  const q = raw.trim().toLowerCase()
  if (!q) return true
  const name = (c.full_name ?? '').toLowerCase()
  const email = (c.email ?? '').toLowerCase()
  const title = (c.current_title ?? '').toLowerCase()
  const phoneRaw = (c.phone ?? '').toLowerCase()
  if (name.includes(q) || email.includes(q) || phoneRaw.includes(q) || title.includes(q)) return true
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
  const qc = useQueryClient()
  const navigate = useNavigate()
  const { success, error: toastError } = useToast()
  const [searchParams, setSearchParams] = useSearchParams()
  const companyFromUrl = searchParams.get('company')
  const showAssignHint = searchParams.get('assign') === '1'
  /** Opening intent — keep param until modal closes so route transition double-mount does not swallow it */
  const newCandidateIntentUrl = searchParams.get('new') === '1'
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'archived'>('active')
  const [companyTab, setCompanyTab] = useState<'all' | string>('all')
  const [search, setSearch] = useState('')
  const [assignFor, setAssignFor] = useState<CandidateRow | null>(null)
  const [assignPositionId, setAssignPositionId] = useState('')
  const [newCandidateOpen, setNewCandidateOpen] = useState(false)
  const [newCandidateStep, setNewCandidateStep] = useState<'form' | 'assign'>('form')
  const [newCandidateIdForAssign, setNewCandidateIdForAssign] = useState<string | null>(null)
  const [newCandidateAssignPositionId, setNewCandidateAssignPositionId] = useState('')
  const [newName, setNewName] = useState('')
  const [newEmail, setNewEmail] = useState('')
  const [newPhone, setNewPhone] = useState('')
  const [newTitle, setNewTitle] = useState('')

  function resetNewCandidateModal() {
    setNewCandidateStep('form')
    setNewCandidateIdForAssign(null)
    setNewCandidateAssignPositionId('')
    setNewName('')
    setNewEmail('')
    setNewPhone('')
    setNewTitle('')
  }

  function closeNewCandidateModal() {
    setNewCandidateOpen(false)
    resetNewCandidateModal()
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.delete('new')
        return next
      },
      { replace: true },
    )
  }

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

  const companiesQ = useQuery({
    queryKey: ['companies', uid],
    enabled: Boolean(supabase && uid),
    queryFn: async () => {
      const { data, error } = await supabase!
        .from('companies')
        .select('id, name')
        .eq('user_id', uid!)
        .is('deleted_at', null)
        .order('name')
      if (error) throw error
      return (data ?? []) as { id: string; name: string }[]
    },
  })

  const q = useQuery({
    queryKey: ['all-candidates', uid, statusFilter],
    enabled: Boolean(supabase && uid),
    queryFn: async () => {
      let query = supabase!
        .from('candidates')
        .select(
          `
          id, full_name, email, phone, current_title, status, created_at, updated_at,
          position_candidates (
            id,
            status,
            position_id,
            positions ( id, title, company_id, companies ( id, name ) ),
            position_stages ( name )
          )
        `,
        )
        .eq('user_id', uid!)
        .is('deleted_at', null)
        .order('updated_at', { ascending: false })
      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter)
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
        .in('status', ['active', 'on_hold'])
        .order('updated_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as unknown as AssignPositionOption[]
    },
  })

  const assignMutation = useMutation({
    mutationFn: async ({
      candidateId,
      newPositionId,
      fromNewCandidateWizard,
    }: {
      candidateId: string
      newPositionId: string
      fromNewCandidateWizard?: boolean
    }) => {
      if (!supabase || !uid) throw new Error('Not signed in')
      const { data: dup, error: dErr } = await supabase
        .from('position_candidates')
        .select('id')
        .eq('position_id', newPositionId)
        .eq('candidate_id', candidateId)
        .maybeSingle()
      if (dErr) throw dErr
      if (dup?.id) throw new Error('Already assigned to this role')
      const { data: stages, error: stErr } = await supabase
        .from('position_stages')
        .select('id')
        .eq('position_id', newPositionId)
        .order('sort_order', { ascending: true })
        .limit(1)
      if (stErr) throw stErr
      const firstStageId = stages?.[0]?.id ?? null
      const { data: pcRow, error: pcErr } = await supabase
        .from('position_candidates')
        .insert({
          user_id: uid,
          position_id: newPositionId,
          candidate_id: candidateId,
          position_stage_id: firstStageId,
          status: 'in_progress',
          // Omit `source`: DB default is `app` (legacy) or `sourcing` (after migration 021).
        })
        .select('id')
        .single()
      if (pcErr) throw pcErr
      if (firstStageId && pcRow?.id) {
        await logPositionCandidateTransition(supabase, uid, {
          position_candidate_id: pcRow.id,
          transition_type: 'stage',
          from_stage_id: null,
          to_stage_id: firstStageId,
        })
      }
      await logActivityEvent(supabase, uid, {
        event_type: 'candidate_created',
        position_id: newPositionId,
        candidate_id: candidateId,
        position_candidate_id: pcRow?.id ?? null,
        title: 'Candidate assigned to role',
        subtitle: 'New position assignment',
      })
      return { newPid: newPositionId, fromNewCandidateWizard: Boolean(fromNewCandidateWizard), candidateId }
    },
    onSuccess: async ({ newPid, fromNewCandidateWizard, candidateId }) => {
      success('Assigned to role')
      if (fromNewCandidateWizard) {
        closeNewCandidateModal()
        navigate(`/positions/${newPid}?candidate=${candidateId}`)
      } else {
        setAssignFor(null)
        setAssignPositionId('')
      }
      await qc.invalidateQueries({ queryKey: ['all-candidates'] })
      await qc.invalidateQueries({ queryKey: ['position-candidates', newPid] })
      await qc.invalidateQueries({ queryKey: ['position-transition-stats', newPid] })
      await qc.invalidateQueries({ queryKey: ['position-activity', newPid] })
      await qc.invalidateQueries({ queryKey: ['candidate-detail'] })
    },
    onError: (e: Error) => toastError(e),
  })

  const createCandidateMutation = useMutation({
    mutationFn: async () => {
      if (!supabase || !uid) throw new Error('Not signed in')
      const nm = newName.trim()
      if (!nm) throw new Error('Name is required')
      const { data, error } = await supabase
        .from('candidates')
        .insert({
          user_id: uid,
          full_name: nm,
          email: newEmail.trim() || null,
          phone: newPhone.trim() || null,
          current_title: newTitle.trim() || null,
          status: 'active',
        })
        .select('id')
        .single()
      if (error) throw error
      return { id: data.id as string }
    },
    onSuccess: async ({ id }) => {
      success('Candidate created')
      await qc.invalidateQueries({ queryKey: ['all-candidates'] })
      setNewCandidateStep('assign')
      setNewCandidateIdForAssign(id)
      setNewCandidateAssignPositionId('')
    },
    onError: (e: Error) => toastError(e),
  })

  const archiveMutation = useMutation({
    mutationFn: async ({ candidateId, withdrawActive }: { candidateId: string; withdrawActive: boolean }) => {
      if (!supabase || !uid) throw new Error('Not signed in')
      if (withdrawActive) {
        const { data: rows } = await supabase
          .from('position_candidates')
          .select('id')
          .eq('candidate_id', candidateId)
          .eq('user_id', uid)
          .eq('status', 'in_progress')
        for (const r of rows ?? []) {
          await supabase.from('position_candidates').update({ status: 'withdrawn' }).eq('id', r.id).eq('user_id', uid)
          await logPositionCandidateTransition(supabase, uid, {
            position_candidate_id: r.id,
            transition_type: 'status',
            from_status: 'in_progress',
            to_status: 'withdrawn',
          })
        }
      }
      const { error } = await supabase.from('candidates').update({ status: 'archived' }).eq('id', candidateId).eq('user_id', uid)
      if (error) throw error
    },
    onSuccess: async () => {
      success('Candidate archived')
      await qc.invalidateQueries({ queryKey: ['all-candidates'] })
      await qc.invalidateQueries({ queryKey: ['positions'] })
      await qc.invalidateQueries({ queryKey: ['position-candidates'] })
    },
    onError: (e: Error) => toastError(e),
  })

  const unarchiveMutation = useMutation({
    mutationFn: async (candidateId: string) => {
      if (!supabase || !uid) throw new Error('Not signed in')
      const { error } = await supabase.from('candidates').update({ status: 'active' }).eq('id', candidateId).eq('user_id', uid)
      if (error) throw error
    },
    onSuccess: async () => {
      success('Candidate restored')
      await qc.invalidateQueries({ queryKey: ['all-candidates'] })
    },
    onError: (e: Error) => toastError(e),
  })

  const rows = q.data ?? []

  const assignOptions = useMemo(() => {
    if (!assignFor) return []
    const assigned = new Set(nestedPcList(assignFor.position_candidates).map((pc) => pc.position_id))
    return (positionsForAssignQ.data ?? []).filter((p) => !assigned.has(p.id))
  }, [assignFor, positionsForAssignQ.data])

  const companiesInView = useMemo(() => {
    const map = new Map<string, string>()
    for (const c of rows) {
      for (const pc of nestedPcList(c.position_candidates)) {
        const cid = pc.positions?.company_id
        const name = pc.positions?.companies?.name?.trim()
        if (cid) map.set(cid, name || 'Unknown client')
      }
    }
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
  }, [rows])

  const clientTabs = useMemo(() => {
    const map = new Map<string, string>()
    for (const c of companiesQ.data ?? []) {
      map.set(c.id, c.name?.trim() || 'Client')
    }
    for (const c of companiesInView) {
      map.set(c.id, c.name)
    }
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
  }, [companiesQ.data, companiesInView])

  useEffect(() => {
    if (companyTab === 'all') return
    if (clientTabs.some((co) => co.id === companyTab)) return
    setCompanyTab('all')
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.delete('company')
        return next
      },
      { replace: true },
    )
  }, [clientTabs, companyTab, setSearchParams])

  useEffect(() => {
    if (!companyFromUrl) return
    if (!clientTabs.some((co) => co.id === companyFromUrl)) return
    setCompanyTab(companyFromUrl)
  }, [companyFromUrl, clientTabs])

  const filteredRows = useMemo(() => {
    let list = rows.filter((c) => candidateMatchesSearch(c, search))
    if (companyTab !== 'all') {
      list = list.filter((c) =>
        nestedPcList(c.position_candidates).some((pc) => pc.positions?.company_id === companyTab),
      )
    }
    return list
  }, [rows, search, companyTab])

  return (
    <div className="flex flex-col gap-6">
      <Modal
        open={newCandidateOpen || newCandidateIntentUrl}
        onClose={() => {
          if (createCandidateMutation.isPending || assignMutation.isPending) return
          closeNewCandidateModal()
        }}
        title={newCandidateStep === 'form' ? 'New candidate' : 'Assign this role'}
        size="md"
      >
        {newCandidateStep === 'form' ? (
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault()
              void createCandidateMutation.mutateAsync()
            }}
          >
            <p className="text-ink-muted text-sm dark:text-stone-400">
              Enter their details, then choose which open role to add them to (first pipeline stage).
            </p>
            <label className="flex flex-col gap-1 text-sm font-medium">
              Full name
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="border-line rounded-xl border px-3 py-2 dark:border-line-dark dark:bg-stone-900/50"
                required
              />
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium">
              Current title
              <input
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                className="border-line rounded-xl border px-3 py-2 dark:border-line-dark dark:bg-stone-900/50"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium">
              Email
              <input
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                className="border-line rounded-xl border px-3 py-2 dark:border-line-dark dark:bg-stone-900/50"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium">
              Phone
              <input
                value={newPhone}
                onChange={(e) => setNewPhone(e.target.value)}
                className="border-line rounded-xl border px-3 py-2 dark:border-line-dark dark:bg-stone-900/50"
              />
            </label>
            <div className="mt-2 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                className="border-line rounded-full border px-4 py-2 text-sm font-medium dark:border-line-dark"
                onClick={() => closeNewCandidateModal()}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={createCandidateMutation.isPending || !newName.trim()}
                className="rounded-full bg-[#9b3e20] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 dark:bg-orange-600"
              >
                {createCandidateMutation.isPending ? 'Saving…' : 'Continue'}
              </button>
            </div>
          </form>
        ) : (
          <div className="flex flex-col gap-4">
            <p className="text-ink-muted text-sm dark:text-stone-400">
              <span className="text-ink font-semibold dark:text-stone-200">{newName.trim() || 'Candidate'}</span> was
              added. Pick an open role to place them on the pipeline (first stage).
            </p>
            {positionsForAssignQ.isLoading ? (
              <p className="text-sm">Loading roles…</p>
            ) : (positionsForAssignQ.data ?? []).length === 0 ? (
              <p className="text-sm text-amber-800 dark:text-amber-200">
                No open roles yet. Create a role under Positions, then assign them from this list.
              </p>
            ) : (
              <label className="flex flex-col gap-1 text-sm font-medium">
                Role
                <select
                  value={newCandidateAssignPositionId}
                  onChange={(e) => setNewCandidateAssignPositionId(e.target.value)}
                  className="border-line rounded-xl border px-3 py-2 dark:border-line-dark dark:bg-stone-900/50"
                >
                  <option value="">Select a role…</option>
                  {(positionsForAssignQ.data ?? []).map((p) => {
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
                onClick={() => closeNewCandidateModal()}
              >
                Cancel
              </button>
              <button
                type="button"
                className="border-line rounded-full border px-4 py-2 text-sm font-medium dark:border-line-dark"
                disabled={assignMutation.isPending || !newCandidateIdForAssign}
                onClick={() => {
                  const id = newCandidateIdForAssign
                  if (!id) return
                  closeNewCandidateModal()
                  navigate(`/candidates/${id}`)
                }}
              >
                Skip for now
              </button>
              <button
                type="button"
                className="rounded-full bg-[#9b3e20] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 dark:bg-orange-600"
                disabled={
                  assignMutation.isPending ||
                  !newCandidateIdForAssign ||
                  !newCandidateAssignPositionId ||
                  (positionsForAssignQ.data ?? []).length === 0
                }
                onClick={() => {
                  if (!newCandidateIdForAssign || !newCandidateAssignPositionId) return
                  assignMutation.mutate({
                    candidateId: newCandidateIdForAssign,
                    newPositionId: newCandidateAssignPositionId,
                    fromNewCandidateWizard: true,
                  })
                }}
              >
                {assignMutation.isPending ? 'Assigning…' : 'Assign to role'}
              </button>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={assignFor !== null}
        onClose={() => {
          if (assignMutation.isPending) return
          setAssignFor(null)
          setAssignPositionId('')
        }}
        title="Assign to role"
        size="md"
      >
        {assignFor ? (
          <div className="flex flex-col gap-4">
            <p className="text-ink-muted text-sm dark:text-stone-400">
              Add <span className="text-ink font-semibold dark:text-stone-200">{assignFor.full_name}</span> to an open
              role. Their stage starts at the first step on that role.
            </p>
            {positionsForAssignQ.isLoading ? (
              <p className="text-sm">Loading roles…</p>
            ) : assignOptions.length === 0 ? (
              <p className="text-sm text-amber-800 dark:text-amber-200">
                No open roles available, or they&apos;re already on every open role. Create a role under Positions first.
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
                className="rounded-full bg-[#9b3e20] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 dark:bg-orange-600"
                disabled={assignMutation.isPending || !assignPositionId || assignOptions.length === 0}
                onClick={() => {
                  if (!assignFor || !assignPositionId) return
                  assignMutation.mutate({ candidateId: assignFor.id, newPositionId: assignPositionId, fromNewCandidateWizard: false })
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
        subtitle="Global pool — assign people to roles, track each assignment on the position."
        backTo="/"
        right={
          <button
            type="button"
            className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-r from-[#9b3e20] to-[#fd8863] text-white shadow-sm transition hover:brightness-105 dark:from-orange-700 dark:to-orange-500"
            aria-label="New candidate"
            title="New candidate"
            onClick={() => {
              setNewName('')
              setNewEmail('')
              setNewPhone('')
              setNewTitle('')
              setNewCandidateOpen(true)
            }}
          >
            <Plus className="h-7 w-7 stroke-[2.5]" strokeLinecap="round" strokeLinejoin="round" aria-hidden />
          </button>
        }
      />

      {showAssignHint ? (
        <div
          className="border-line flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-violet-200/90 bg-gradient-to-r from-violet-100/90 to-fuchsia-100/70 px-4 py-3 dark:border-violet-800/60 dark:from-violet-950/80 dark:to-fuchsia-950/50"
          role="status"
        >
          <p className="text-sm font-medium text-violet-950 dark:text-violet-100">
            Use <span className="font-extrabold">Assign</span> to add this person to another open role.
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
          <p className="text-ink-muted mb-2 text-[10px] font-bold tracking-wide uppercase dark:text-stone-500">Pool status</p>
          <div className="flex flex-wrap gap-2">
            {(
              [
                { k: 'all' as const, label: 'All' },
                { k: 'active' as const, label: 'Active' },
                { k: 'archived' as const, label: 'Archived' },
              ] as const
            ).map(({ k, label }) => (
              <button
                key={k}
                type="button"
                onClick={() => setStatusFilter(k)}
                className={`rounded-full px-3 py-1 text-xs font-bold uppercase transition ${
                  statusFilter === k
                    ? 'bg-[#9b3e20] text-white dark:bg-orange-600'
                    : 'border border-stone-300 dark:border-stone-600'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {clientTabs.length > 0 ? (
          <div>
            <p className="text-ink-muted mb-2 text-[10px] font-bold tracking-wide uppercase dark:text-stone-500">Client</p>
            <div className="flex flex-wrap gap-2" role="tablist" aria-label="Filter by client">
              <button
                type="button"
                role="tab"
                aria-selected={companyTab === 'all'}
                onClick={() => {
                  setCompanyTab('all')
                  setSearchParams(
                    (prev) => {
                      const next = new URLSearchParams(prev)
                      next.delete('company')
                      return next
                    },
                    { replace: true },
                  )
                }}
                className={`rounded-full px-3 py-1 text-xs font-bold transition ${
                  companyTab === 'all'
                    ? 'bg-[#006384] text-white dark:bg-cyan-700'
                    : 'border border-stone-300 dark:border-stone-600'
                }`}
              >
                All clients
              </button>
              {clientTabs.map((co) => (
                <button
                  key={co.id}
                  type="button"
                  role="tab"
                  aria-selected={companyTab === co.id}
                  onClick={() => {
                    setCompanyTab(co.id)
                    setSearchParams(
                      (prev) => {
                        const next = new URLSearchParams(prev)
                        next.set('company', co.id)
                        return next
                      },
                      { replace: true },
                    )
                  }}
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
          placeholder="Search by name, title, email, or phone…"
          className="border-line bg-white/80 focus:ring-accent/30 w-full rounded-2xl border py-2.5 pr-3 pl-10 text-sm shadow-sm outline-none focus:ring-2 dark:border-line-dark dark:bg-stone-900/50"
          aria-label="Search candidates"
        />
      </div>

      {q.isLoading ? (
        <PageSpinner message="Loading candidates…" />
      ) : rows.length === 0 ? (
        <p className="text-ink-muted text-sm">No candidates match this filter.</p>
      ) : filteredRows.length === 0 ? (
        <p className="text-ink-muted text-sm">No candidates match your search.</p>
      ) : (
        <ul id="candidate-list" className="space-y-2">
          {filteredRows.map((c) => {
            const nActive = activeAssignmentCount(c)
            const pill = candidateGlobalPill(c.status)
            const updatedRel = formatDistanceToNow(new Date(c.updated_at), { addSuffix: true })
            const days = differenceInCalendarDays(new Date(), new Date(c.created_at))
            const primaryRole = nestedPcList(c.position_candidates).find((pc) => pc.status === 'in_progress')
            const pos = primaryRole?.positions
            const company = pos?.companies?.name
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
                      className={`inline-flex shrink-0 items-center rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase ${pill.className}`}
                    >
                      {pill.label}
                    </span>
                  </div>
                  {c.current_title ? (
                    <p className="mt-1 text-sm font-medium text-[#302e2b] dark:text-stone-200">{c.current_title}</p>
                  ) : null}
                  <p className="text-ink-muted mt-1 text-sm">
                    <span className="font-semibold text-stone-700 dark:text-stone-300">{nActive}</span> active role
                    {nActive === 1 ? '' : 's'}
                    {pos ? (
                      <>
                        <span className="opacity-60"> · </span>
                        <span className="text-ink font-medium dark:text-stone-200">{pos.title}</span>
                        {company ? (
                          <>
                            <span className="opacity-60"> · </span>
                            <span className="font-medium dark:text-stone-400">{company}</span>
                          </>
                        ) : null}
                      </>
                    ) : null}
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
                    <span title={formatDateTime(c.updated_at)} className="font-medium text-stone-600 dark:text-stone-400">
                      Updated {updatedRel}
                    </span>
                    <span className="text-stitch-muted mx-2" aria-hidden>
                      ·
                    </span>
                    <span className="font-medium text-stone-600 dark:text-stone-400">In pool {days}d</span>
                  </p>
                </Link>
                <div className="border-line flex shrink-0 flex-col border-l dark:border-line-dark">
                  {c.status === 'active' ? (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          setAssignFor(c)
                          setAssignPositionId('')
                        }}
                        className="text-ink-muted hover:bg-[#9b3e20]/10 hover:text-[#9b3e20] dark:hover:bg-orange-500/15 dark:hover:text-orange-300 flex min-h-[3.5rem] flex-col items-center justify-center gap-1 border-b border-stone-200/80 px-3 text-xs font-semibold transition dark:border-stone-700"
                        aria-label={`Assign ${c.full_name}`}
                      >
                        <UserPlus className="h-4 w-4" aria-hidden />
                        Assign
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (!window.confirm(`Archive ${c.full_name}?`)) return
                          const withdraw =
                            nActive > 0 ? window.confirm(`Also withdraw from all ${nActive} active role(s)?`) : false
                          void archiveMutation.mutateAsync({ candidateId: c.id, withdrawActive: withdraw })
                        }}
                        className="text-ink-muted hover:bg-stone-100 dark:hover:bg-stone-800 flex min-h-[3rem] flex-col items-center justify-center px-3 text-xs font-semibold transition"
                      >
                        Archive
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void unarchiveMutation.mutateAsync(c.id)}
                      className="text-ink-muted hover:bg-stone-100 dark:hover:bg-stone-800 flex min-h-[6rem] flex-col items-center justify-center px-3 text-xs font-semibold transition"
                    >
                      Unarchive
                    </button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
