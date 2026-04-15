import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import {
  Check,
  CheckCircle,
  X,
  PartyPopper,
  FileText,
  Link2,
  Trash2,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  Upload,
  Copy,
  ExternalLink,
  Settings,
  Banknote,
  Globe,
} from 'lucide-react'
import { differenceInCalendarDays, formatDistanceToNow } from 'date-fns'

import { useAuth } from '@/auth/useAuth'
import { getSupabase } from '@/lib/supabase'
import { normalizeEmail, normalizePhone } from '@/lib/normalize'
import { formatDue } from '@/lib/dates'
import { ScreenHeader } from '@/components/layout/ScreenHeader'
import { Modal } from '@/components/ui/Modal'
import { useToast } from '@/hooks/useToast'
import { criticalStageThreshold, logActivityEvent } from '@/lib/activityLog'
import { formatAssignmentStatus } from '@/lib/candidateStatus'
import { logPositionCandidateTransition } from '@/lib/positionTransitions'
import { normalizeRequirementsText } from '@/lib/requirementValues'

type StageRow = {
  id: string
  name: string
  sort_order: number
  description?: string | null
  interviewers?: string | null
  duration_minutes?: number | null
  is_remote?: boolean | null
}

type CandidateProfile = {
  id: string
  full_name: string
  email: string | null
  phone: string | null
  resume_storage_path?: string | null
}

type PositionCandidateJunction = {
  id: string
  candidate_id: string
  position_stage_id: string | null
  status: string
  source: string
  created_at: string
  candidates: CandidateProfile | CandidateProfile[] | null
  position_stages: { name: string } | { name: string }[] | null
}

function nestedCandidate(v: PositionCandidateJunction['candidates']): CandidateProfile | null {
  if (v == null) return null
  return Array.isArray(v) ? (v[0] ?? null) : v
}

function nestedStageName(v: PositionCandidateJunction['position_stages']): string {
  if (v == null) return '—'
  return Array.isArray(v) ? (v[0]?.name ?? '—') : (v.name ?? '—')
}

type ActivityRow = {
  id: string
  event_type: string
  title: string
  subtitle: string | null
  created_at: string
  candidate_id: string | null
  position_candidate_id: string | null
}

function taskLinkedCandidateName(t: {
  position_candidates?: { candidates?: { full_name?: string } | { full_name?: string }[] | null } | { candidates?: { full_name?: string } | { full_name?: string }[] | null }[] | null
}): string | null {
  const raw = t.position_candidates
  if (raw == null) return null
  const pc = Array.isArray(raw) ? raw[0] : raw
  if (!pc) return null
  const cand = pc.candidates
  const profile = cand == null ? null : Array.isArray(cand) ? cand[0] : cand
  return profile?.full_name ?? null
}

export function PositionDetailPage() {
  const { id } = useParams()
  const { user } = useAuth()
  const supabase = getSupabase()
  const qc = useQueryClient()
  const { success, error: toastError } = useToast()
  const [search, setSearch] = useSearchParams()
  const highlightCandidate = search.get('candidate')

  type TabId = 'details' | 'candidates' | 'requirements' | 'approaches'
  const tab = useMemo<TabId>(() => {
    if (highlightCandidate) return 'candidates'
    const v = search.get('tab')
    if (v === 'details' || v === 'candidates' || v === 'requirements' || v === 'approaches') return v
    return 'details'
  }, [search, highlightCandidate])

  const setTab = (tid: TabId) => {
    setSearch(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.set('tab', tid)
        return next
      },
      { replace: true },
    )
  }
  const resumeFileRef = useRef<HTMLInputElement>(null)
  const excelImportRef = useRef<HTMLInputElement>(null)
  const [resumePickForId, setResumePickForId] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    sessionStorage.setItem('yulis_task_prefill_position_id', id)
    return () => {
      sessionStorage.removeItem('yulis_task_prefill_position_id')
    }
  }, [id])

  const posQ = useQuery({
    queryKey: ['position', id, user?.id],
    enabled: Boolean(supabase && user && id),
    queryFn: async () => {
      const { data, error } = await supabase!
        .from('positions')
        .select('*, companies ( id, name, contact_email )')
        .eq('id', id!)
        .eq('user_id', user!.id)
        .single()
      if (error) throw error
      return data
    },
  })

  const stagesQ = useQuery({
    queryKey: ['position-stages', id, user?.id],
    enabled: Boolean(supabase && user && id),
    queryFn: async () => {
      const { data, error } = await supabase!
        .from('position_stages')
        .select('*')
        .eq('position_id', id!)
        .eq('user_id', user!.id)
        .order('sort_order')
      if (error) throw error
      return (data ?? []) as StageRow[]
    },
  })

  const candidatesQ = useQuery({
    queryKey: ['position-candidates', id, user?.id],
    enabled: Boolean(supabase && user && id),
    queryFn: async () => {
      const { data, error } = await supabase!
        .from('position_candidates')
        .select(
          `
          id,
          candidate_id,
          position_stage_id,
          status,
          source,
          created_at,
          candidates ( id, full_name, email, phone, resume_storage_path, deleted_at ),
          position_stages ( name )
        `,
        )
        .eq('position_id', id!)
        .eq('user_id', user!.id)
        .is('candidates.deleted_at', null)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as PositionCandidateJunction[]
    },
  })

  const transitionsStatsQ = useQuery({
    queryKey: ['position-transition-stats', id, user?.id],
    enabled: Boolean(supabase && user && id),
    queryFn: async () => {
      const { data: pcRows, error: e1 } = await supabase!.from('position_candidates').select('id').eq('position_id', id!).eq('user_id', user!.id)
      if (e1) throw e1
      const pcs = (pcRows ?? []).map((r) => r.id as string)
      if (pcs.length === 0) return [] as { to_stage_id: string | null; c: number }[]
      const { data, error } = await supabase!
        .from('position_candidate_transitions')
        .select('to_stage_id, position_candidate_id')
        .eq('user_id', user!.id)
        .eq('transition_type', 'stage')
        .in('position_candidate_id', pcs)
      if (error) throw error
      const byStage = new Map<string, Set<string>>()
      for (const row of data ?? []) {
        const k = (row as { to_stage_id: string | null; position_candidate_id: string }).to_stage_id
        const pcid = (row as { position_candidate_id: string }).position_candidate_id
        if (!k) continue
        if (!byStage.has(k)) byStage.set(k, new Set())
        byStage.get(k)!.add(pcid)
      }
      return [...byStage.entries()].map(([to_stage_id, set]) => ({ to_stage_id, c: set.size }))
    },
  })

  const tasksQ = useQuery({
    queryKey: ['position-tasks', id, user?.id],
    enabled: Boolean(supabase && user && id),
    queryFn: async () => {
      const { data, error } = await supabase!
        .from('tasks')
        .select('*, position_candidates ( candidates ( full_name ) )')
        .eq('position_id', id!)
        .eq('user_id', user!.id)
        .order('due_at', { ascending: true, nullsFirst: false })
      if (error) throw error
      return data ?? []
    },
  })

  const activityQ = useQuery({
    queryKey: ['position-activity', id, user?.id],
    enabled: Boolean(supabase && user && id),
    queryFn: async () => {
      const { data, error } = await supabase!
        .from('activity_events')
        .select('id, event_type, title, subtitle, created_at, candidate_id, position_candidate_id')
        .eq('position_id', id!)
        .eq('user_id', user!.id)
        .order('created_at', { ascending: false })
        .limit(80)
      if (error) throw error
      return (data ?? []) as ActivityRow[]
    },
  })

  const positionIsOpen = useMemo(
    () => posQ.data?.status === 'active' || posQ.data?.status === 'on_hold',
    [posQ.data?.status],
  )

  const publicListTokenQ = useQuery({
    queryKey: ['position-public-list-token', id, user?.id],
    enabled: Boolean(supabase && user && id && positionIsOpen),
    queryFn: async () => {
      const { data, error } = await supabase!
        .from('position_public_list_tokens')
        .select('token')
        .eq('position_id', id!)
        .is('revoked_at', null)
        .maybeSingle()
      if (error) throw error
      return (data as { token: string } | null)?.token ?? null
    },
  })

  const position = posQ.data
  const company = position?.companies as unknown as { id: string; name: string; contact_email: string | null } | undefined

  const [title, setTitle] = useState('')
  const [requirements, setRequirements] = useState('')
  const [welcome1, setWelcome1] = useState('')
  const [welcome2, setWelcome2] = useState('')
  const [welcome3, setWelcome3] = useState('')
  const [linkedinSearchUrl, setLinkedinSearchUrl] = useState('')
  const [positionSetupOpen, setPositionSetupOpen] = useState(false)
  const [candStatusFilter, setCandStatusFilter] = useState<Set<string>>(() => new Set(['in_progress']))
  const [status, setStatus] = useState('active')
  const [activityFilter, setActivityFilter] = useState<'all' | 'milestones'>('all')
  const [noteText, setNoteText] = useState('')
  const [shareOpen, setShareOpen] = useState(false)
  const [shareUrl, setShareUrl] = useState<string | null>(null)
  const [publicListOpen, setPublicListOpen] = useState(false)
  const [publicListUrl, setPublicListUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!position) return
    setTitle(position.title ?? '')
    setRequirements(normalizeRequirementsText((position as { requirements?: unknown }).requirements))
    setWelcome1(position.welcome_1 ?? '')
    setWelcome2(position.welcome_2 ?? '')
    setWelcome3(position.welcome_3 ?? '')
    setLinkedinSearchUrl((position as { linkedin_saved_search_url?: string | null }).linkedin_saved_search_url ?? '')
    setStatus(position.status ?? 'active')
  }, [position])

  useEffect(() => {
    if (search.get('setup') !== '1') return
    setPositionSetupOpen(true)
    setSearch(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.delete('setup')
        return next
      },
      { replace: true },
    )
  }, [search, setSearch])

  useEffect(() => {
    if (search.get('addCandidate') !== '1') return
    setSearch(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.delete('addCandidate')
        next.set('tab', 'candidates')
        return next
      },
      { replace: true },
    )
    requestAnimationFrame(() => {
      document.getElementById('position-candidates-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      const el = document.getElementById('position-add-candidate')
      const firstInput = el?.querySelector('input') as HTMLInputElement | null
      firstInput?.focus()
    })
  }, [search, setSearch])

  const invalidateAll = async () => {
    await qc.invalidateQueries({ queryKey: ['position', id] })
    await qc.invalidateQueries({ queryKey: ['position-candidates', id] })
    await qc.invalidateQueries({ queryKey: ['position-transition-stats', id] })
    await qc.invalidateQueries({ queryKey: ['position-activity', id] })
    await qc.invalidateQueries({ queryKey: ['position-public-list-token', id] })
    await qc.invalidateQueries({ queryKey: ['positions'] })
    await qc.invalidateQueries({ queryKey: ['candidates'] })
    await qc.invalidateQueries({ queryKey: ['tasks-page'] })
    await qc.invalidateQueries({ queryKey: ['notification-count'] })
  }

  const savePos = useMutation({
    mutationFn: async () => {
      const { error } = await supabase!
        .from('positions')
        .update({
          title: title.trim() || 'Untitled',
          requirements: requirements.trim() || null,
          welcome_1: welcome1.trim() || null,
          welcome_2: welcome2.trim() || null,
          welcome_3: welcome3.trim() || null,
          linkedin_saved_search_url: linkedinSearchUrl.trim() || null,
          status,
        })
        .eq('id', id!)
        .eq('user_id', user!.id)
      if (error) throw error
    },
    onSuccess: async () => {
      success('Position saved')
      await invalidateAll()
    },
    onError: (e: Error) => toastError(e.message),
  })

  const setPositionTerminal = useMutation({
    mutationFn: async (next: 'succeeded' | 'cancelled') => {
      const prev = position?.status ?? 'active'
      const { error } = await supabase!
        .from('positions')
        .update({ status: next })
        .eq('id', id!)
        .eq('user_id', user!.id)
      if (error) throw error
      return { prev, next }
    },
    onSuccess: async ({ prev, next }) => {
      setStatus(next)
      success(next === 'succeeded' ? 'Marked succeeded' : 'Marked cancelled')
      await logActivityEvent(supabase!, user!.id, {
        event_type: 'position_status_changed',
        position_id: id!,
        title: next === 'succeeded' ? 'Position succeeded' : 'Position cancelled',
        subtitle: `${prev} → ${next}`,
        metadata: { from: prev, to: next },
      })
      await invalidateAll()
    },
    onError: (e: Error) => toastError(e.message),
  })

  const reopenPosition = useMutation({
    mutationFn: async () => {
      const { error } = await supabase!.from('positions').update({ status: 'active' }).eq('id', id!).eq('user_id', user!.id)
      if (error) throw error
    },
    onSuccess: async () => {
      setStatus('active')
      success('Position reopened')
      await invalidateAll()
    },
    onError: (e: Error) => toastError(e.message),
  })

  const setOpenPositionStatus = useMutation({
    mutationFn: async (next: 'active' | 'on_hold') => {
      const { error } = await supabase!.from('positions').update({ status: next }).eq('id', id!).eq('user_id', user!.id)
      if (error) throw error
    },
    onSuccess: async (_, next) => {
      setStatus(next)
      success('Status updated')
      await logActivityEvent(supabase!, user!.id, {
        event_type: 'position_status_changed',
        position_id: id!,
        title: 'Position status updated',
        subtitle: String(next),
        metadata: { to: next },
      })
      await invalidateAll()
    },
    onError: (e: Error) => toastError(e.message),
  })

  const [newStageName, setNewStageName] = useState('')

  const addStage = useMutation({
    mutationFn: async () => {
      const order = stagesQ.data?.length ?? 0
      const { error } = await supabase!.from('position_stages').insert({
        user_id: user!.id,
        position_id: id!,
        sort_order: order,
        name: newStageName.trim() || 'Stage',
      })
      if (error) throw error
    },
    onSuccess: async () => {
      setNewStageName('')
      success('Stage added')
      await qc.invalidateQueries({ queryKey: ['position-stages', id] })
    },
    onError: (e: Error) => toastError(e.message),
  })

  const updateStageMeta = useMutation({
    mutationFn: async (patch: { id: string } & Partial<Pick<StageRow, 'name' | 'description' | 'interviewers' | 'duration_minutes' | 'is_remote'>>) => {
      const { id: stageId, ...rest } = patch
      const { error } = await supabase!.from('position_stages').update(rest).eq('id', stageId).eq('user_id', user!.id)
      if (error) throw error
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['position-stages', id] })
    },
    onError: (e: Error) => toastError(e.message),
  })

  const deleteStageMut = useMutation({
    mutationFn: async (stageId: string) => {
      const using = (candidatesQ.data ?? []).filter((c) => c.position_stage_id === stageId).length
      if (using > 0) {
        const ok = window.confirm(
          `${using} assignment(s) use this stage. Their stage link will be cleared and the stage deleted. Continue?`,
        )
        if (!ok) throw new Error('cancelled')
        const { error: u1 } = await supabase!
          .from('position_candidates')
          .update({ position_stage_id: null })
          .eq('position_stage_id', stageId)
          .eq('user_id', user!.id)
          .eq('position_id', id!)
        if (u1) throw u1
      }
      const { error } = await supabase!.from('position_stages').delete().eq('id', stageId).eq('user_id', user!.id)
      if (error) throw error
    },
    onSuccess: async () => {
      success('Stage removed')
      await invalidateAll()
    },
    onError: (e: Error) => {
      if (e.message === 'cancelled') return
      toastError(e.message)
    },
  })

  async function moveStage(stageId: string, dir: -1 | 1) {
    const rows = [...(stagesQ.data ?? [])]
    const i = rows.findIndex((r) => r.id === stageId)
    const j = i + dir
    if (i < 0 || j < 0 || j >= rows.length) return
    const a = rows[i]!
    const b = rows[j]!
    await supabase!.from('position_stages').update({ sort_order: b.sort_order }).eq('id', a.id)
    await supabase!.from('position_stages').update({ sort_order: a.sort_order }).eq('id', b.id)
    await qc.invalidateQueries({ queryKey: ['position-stages', id] })
  }

  const [cName, setCName] = useState('')
  const [cEmail, setCEmail] = useState('')
  const [cPhone, setCPhone] = useState('')
  const [cSource, setCSource] = useState<'app' | 'external'>('app')

  const addCandidate = useMutation({
    mutationFn: async () => {
      const en = normalizeEmail(cEmail)
      const pn = normalizePhone(cPhone)
      if (cSource === 'app' && id) {
        const externals = (candidatesQ.data ?? []).filter((pc) => pc.source === 'external')
        const hit = externals.find((pc) => {
          const h = nestedCandidate(pc.candidates)
          if (!h) return false
          if (en && h.email && normalizeEmail(h.email) === en) return true
          if (pn && h.phone && normalizePhone(h.phone) === pn) return true
          return false
        })
        if (hit) {
          const nm = nestedCandidate(hit.candidates)?.full_name ?? 'Candidate'
          const ok = window.confirm(`This matches imported candidate “${nm}”. Create another record anyway?`)
          if (!ok) throw new Error('cancelled')
        }
      }
      const firstStage = stagesQ.data?.[0]?.id ?? null
      const { data: candIns, error: insErr } = await supabase!
        .from('candidates')
        .insert({
          user_id: user!.id,
          full_name: cName.trim() || 'Unnamed',
          email: cEmail.trim() || null,
          phone: cPhone.trim() || null,
          status: 'active',
          email_normalized: en,
          phone_normalized: pn,
        })
        .select('id, full_name')
        .single()
      if (insErr) throw insErr
      const { data: pcRow, error: pcErr } = await supabase!
        .from('position_candidates')
        .insert({
          user_id: user!.id,
          position_id: id!,
          candidate_id: candIns.id,
          position_stage_id: firstStage,
          status: 'in_progress',
          source: cSource,
        })
        .select('id')
        .single()
      if (pcErr) throw pcErr
      if (firstStage && pcRow?.id) {
        await logPositionCandidateTransition(supabase!, user!.id, {
          position_candidate_id: pcRow.id,
          transition_type: 'stage',
          from_stage_id: null,
          to_stage_id: firstStage,
        })
      }
      return { ...candIns, position_candidate_id: pcRow?.id as string }
    },
    onSuccess: async (data) => {
      setCName('')
      setCEmail('')
      setCPhone('')
      success('Candidate added')
      await logActivityEvent(supabase!, user!.id, {
        event_type: 'candidate_created',
        position_id: id!,
        candidate_id: data.id,
        position_candidate_id: data.position_candidate_id,
        title: `New candidate: ${data.full_name}`,
      })
      await invalidateAll()
    },
    onError: (e: Error) => {
      if (e.message === 'cancelled') return
      toastError(e.message)
    },
  })

  const [importError, setImportError] = useState<string | null>(null)

  async function onExcel(file: File | null) {
    setImportError(null)
    if (!file || !supabase || !user || !id) return
    const buf = await file.arrayBuffer()
    const wb = XLSX.read(buf, { type: 'array' })
    const sheet = wb.Sheets[wb.SheetNames[0]!]
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' })
    if (!rows.length) {
      setImportError('No rows found.')
      return
    }
    const first = rows[0]!
    const keys = Object.keys(first)
    const nameKey = keys.find((k) => /name/i.test(k)) ?? keys[0]!
    const emailKey = keys.find((k) => /email/i.test(k)) ?? keys[1]!
    const phoneKey = keys.find((k) => /phone|mobile|tel/i.test(k)) ?? keys[2]!

    await supabase.from('candidate_import_batches').insert({
      user_id: user.id,
      position_id: id,
      filename: file.name,
      row_count: rows.length,
    })

    const stageId = stagesQ.data?.[0]?.id ?? null
    let ok = 0
    for (const r of rows) {
      const nm = String(r[nameKey] ?? '').trim()
      if (!nm) continue
      const em = String(r[emailKey] ?? '').trim()
      const ph = String(r[phoneKey] ?? '').trim()
      const enNorm = normalizeEmail(em)
      const phNorm = normalizePhone(ph)
      let candId: string | null = null
      if (enNorm) {
        const { data: byEmail } = await supabase.from('candidates').select('id').eq('user_id', user.id).eq('email_normalized', enNorm).maybeSingle()
        candId = byEmail?.id ?? null
      }
      if (!candId && phNorm) {
        const { data: byPhone } = await supabase.from('candidates').select('id').eq('user_id', user.id).eq('phone_normalized', phNorm).maybeSingle()
        candId = byPhone?.id ?? null
      }
      if (!candId) {
        const { data: ins, error: insE } = await supabase
          .from('candidates')
          .insert({
            user_id: user.id,
            full_name: nm,
            email: em || null,
            phone: ph || null,
            status: 'active',
            email_normalized: enNorm,
            phone_normalized: phNorm,
          })
          .select('id')
          .single()
        if (insE || !ins) continue
        candId = ins.id
      }
      const { error: pcE } = await supabase.from('position_candidates').insert({
        user_id: user.id,
        position_id: id,
        candidate_id: candId,
        position_stage_id: stageId,
        status: 'in_progress',
        source: 'external',
      })
      if (!pcE) ok++
    }
    await qc.invalidateQueries({ queryKey: ['position-candidates', id] })
    await qc.invalidateQueries({ queryKey: ['position-transition-stats', id] })
    await qc.invalidateQueries({ queryKey: ['candidates'] })
    if (ok === 0) setImportError('Could not import rows — check column headers (name, email, phone).')
    else {
      success(`Imported ${ok} candidate(s)`)
      await logActivityEvent(supabase, user.id, {
        event_type: 'candidate_created',
        position_id: id,
        title: `Imported ${ok} candidates`,
        subtitle: file.name,
        metadata: { batch: true, count: ok },
      })
      await qc.invalidateQueries({ queryKey: ['position-activity', id] })
    }
  }

  const deleteTask = useMutation({
    mutationFn: async (taskId: string) => {
      const { error } = await supabase!.from('tasks').delete().eq('id', taskId).eq('user_id', user!.id)
      if (error) throw error
    },
    onSuccess: async () => {
      success('Task removed')
      await qc.invalidateQueries({ queryKey: ['position-tasks', id] })
      await qc.invalidateQueries({ queryKey: ['tasks-page'] })
    },
    onError: (e: Error) => toastError(e.message),
  })

  const updateCandidateStage = useMutation({
    mutationFn: async ({ positionCandidateId, stageId }: { positionCandidateId: string; stageId: string | null }) => {
      const row = (candidatesQ.data ?? []).find((c) => c.id === positionCandidateId)
      const oldStageId = row?.position_stage_id as string | null
      const stages = stagesQ.data ?? []
      const oldS = oldStageId ? stages.find((s) => s.id === oldStageId) : null
      const newS = stageId ? stages.find((s) => s.id === stageId) : null
      const prof = nestedCandidate(row?.candidates ?? null)
      const { error } = await supabase!
        .from('position_candidates')
        .update({ position_stage_id: stageId })
        .eq('id', positionCandidateId)
        .eq('user_id', user!.id)
      if (error) throw error
      return {
        positionCandidateId,
        candidateId: prof?.id ?? row?.candidate_id,
        oldS,
        newS,
        candName: prof?.full_name ?? 'Candidate',
      }
    },
    onSuccess: async ({ positionCandidateId, candidateId, oldS, newS, candName }) => {
      success('Stage updated')
      const fromName = oldS?.name ?? '—'
      const toName = newS?.name ?? '—'
      await logPositionCandidateTransition(supabase!, user!.id, {
        position_candidate_id: positionCandidateId,
        transition_type: 'stage',
        from_stage_id: oldS?.id ?? null,
        to_stage_id: newS?.id ?? null,
      })
      await logActivityEvent(supabase!, user!.id, {
        event_type: 'candidate_stage_changed',
        position_id: id!,
        candidate_id: candidateId ?? null,
        position_candidate_id: positionCandidateId,
        title: `${candName}: stage change`,
        subtitle: `${fromName} → ${toName}`,
        metadata: {
          from_stage_id: oldS?.id,
          to_stage_id: newS?.id,
          from_sort_order: oldS?.sort_order,
          to_sort_order: newS?.sort_order,
        },
      })
      const N = criticalStageThreshold(position as { critical_stage_sort_order?: number | null })
      if (newS && candidateId && newS.sort_order >= N) {
        await logActivityEvent(supabase!, user!.id, {
          event_type: 'candidate_reached_critical_stage',
          position_id: id!,
          candidate_id: candidateId,
          position_candidate_id: positionCandidateId,
          title: `${candName} reached stage ${N}+`,
          subtitle: newS.name,
          metadata: { sort_order: newS.sort_order, threshold: N },
        })
      }
      await invalidateAll()
    },
    onError: (e: Error) => toastError(e.message),
  })

  const patchAssignmentStatus = useMutation({
    mutationFn: async ({
      positionCandidateId,
      nextStatus,
      closeTasks,
    }: {
      positionCandidateId: string
      nextStatus: 'in_progress' | 'rejected' | 'withdrawn'
      closeTasks: boolean
    }) => {
      const row = (candidatesQ.data ?? []).find((c) => c.id === positionCandidateId)
      const prev = (row?.status as string) ?? 'in_progress'
      const { error } = await supabase!
        .from('position_candidates')
        .update({ status: nextStatus })
        .eq('id', positionCandidateId)
        .eq('user_id', user!.id)
      if (error) throw error
      if (closeTasks && nextStatus !== 'in_progress') {
        await supabase!
          .from('tasks')
          .update({ status: 'done' })
          .eq('position_candidate_id', positionCandidateId)
          .eq('user_id', user!.id)
          .neq('status', 'done')
      }
      const prof = nestedCandidate(row?.candidates ?? null)
      return {
        positionCandidateId,
        candidateId: prof?.id ?? row?.candidate_id,
        prev,
        nextStatus,
        name: prof?.full_name ?? 'Candidate',
      }
    },
    onSuccess: async ({ positionCandidateId, candidateId, prev, nextStatus, name }) => {
      success('Status updated')
      await logPositionCandidateTransition(supabase!, user!.id, {
        position_candidate_id: positionCandidateId,
        transition_type: 'status',
        from_status: prev,
        to_status: nextStatus,
      })
      await logActivityEvent(supabase!, user!.id, {
        event_type: 'candidate_status_changed',
        position_id: id!,
        candidate_id: candidateId ?? null,
        position_candidate_id: positionCandidateId,
        title: `${name}: ${nextStatus}`,
        subtitle: `${prev} → ${nextStatus}`,
        metadata: { from: prev, to: nextStatus },
      })
      await invalidateAll()
    },
    onError: (e: Error) => toastError(e.message),
  })

  const withdrawFromRole = useMutation({
    mutationFn: async (positionCandidateId: string) => {
      const row = (candidatesQ.data ?? []).find((c) => c.id === positionCandidateId)
      const prevStatus = (row?.status as string) ?? 'in_progress'
      const prof = nestedCandidate(row?.candidates ?? null)
      const { error } = await supabase!
        .from('position_candidates')
        .update({ status: 'withdrawn' })
        .eq('id', positionCandidateId)
        .eq('user_id', user!.id)
      if (error) throw error
      return {
        positionCandidateId,
        prevStatus,
        candidateId: prof?.id ?? row?.candidate_id ?? null,
        name: prof?.full_name ?? 'Candidate',
      }
    },
    onSuccess: async ({ positionCandidateId, prevStatus, candidateId, name }) => {
      success('Withdrawn from this role')
      await logPositionCandidateTransition(supabase!, user!.id, {
        position_candidate_id: positionCandidateId,
        transition_type: 'status',
        from_status: prevStatus,
        to_status: 'withdrawn',
      })
      await logActivityEvent(supabase!, user!.id, {
        event_type: 'candidate_status_changed',
        position_id: id!,
        candidate_id: candidateId,
        position_candidate_id: positionCandidateId,
        title: `${name}: withdrawn from role`,
        subtitle: 'Assignment closed',
      })
      if (highlightCandidate && candidateId === highlightCandidate) setSearch({}, { replace: true })
      await invalidateAll()
    },
    onError: (e: Error) => toastError(e.message),
  })

  const addNote = useMutation({
    mutationFn: async () => {
      if (!noteText.trim()) throw new Error('Enter a note')
      const positionCandidateId = highlightCandidate
        ? ((candidatesQ.data ?? []).find((r) => nestedCandidate(r.candidates)?.id === highlightCandidate)?.id ?? null)
        : null
      await logActivityEvent(supabase!, user!.id, {
        event_type: 'note_added',
        position_id: id!,
        candidate_id: highlightCandidate || null,
        position_candidate_id: positionCandidateId,
        title: 'Note',
        subtitle: noteText.trim(),
      })
    },
    onSuccess: async () => {
      setNoteText('')
      success('Note saved')
      await qc.invalidateQueries({ queryKey: ['position-activity', id] })
    },
    onError: (e: Error) => toastError(e.message),
  })

  const createShareToken = useMutation({
    mutationFn: async (candidateId: string) => {
      const token = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '').slice(0, 16)
      const { error } = await supabase!.from('candidate_share_tokens').insert({
        user_id: user!.id,
        candidate_id: candidateId,
        token,
        expires_at: new Date(Date.now() + 7 * 864e5).toISOString(),
      })
      if (error) throw error
      return token
    },
    onSuccess: (token) => {
      const url = `${window.location.origin}/p/${token}`
      setShareUrl(url)
      setShareOpen(true)
      void navigator.clipboard.writeText(url).catch(() => {})
      success('Share link copied')
    },
    onError: (e: Error) => toastError(e.message),
  })

  const ensurePositionPublicListToken = useMutation({
    mutationFn: async () => {
      if (!supabase || !user || !id) throw new Error('Not signed in')
      const now = new Date().toISOString()
      const { error: revErr } = await supabase
        .from('position_public_list_tokens')
        .update({ revoked_at: now })
        .eq('position_id', id)
        .eq('user_id', user.id)
        .is('revoked_at', null)
      if (revErr) throw revErr
      const token = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '').slice(0, 16)
      const { error } = await supabase.from('position_public_list_tokens').insert({
        user_id: user.id,
        position_id: id,
        token,
      })
      if (error) throw error
      return token
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['position-public-list-token', id] })
    },
    onError: (e: Error) => toastError(e.message),
  })

  async function uploadResume(candidateId: string, file: File | null) {
    if (!file || !supabase || !user) return
    const path = `${user.id}/${candidateId}/${Date.now()}-${file.name.replace(/[^\w.-]/g, '_')}`
    const { error: upErr } = await supabase.storage.from('candidate-docs').upload(path, file)
    if (upErr) {
      toastError(upErr.message)
      return
    }
    const { error } = await supabase.from('candidates').update({ resume_storage_path: path }).eq('id', candidateId).eq('user_id', user.id)
    if (error) {
      toastError(error.message)
      return
    }
    success('Resume uploaded')
    const positionCandidateId =
      (candidatesQ.data ?? []).find((r) => nestedCandidate(r.candidates)?.id === candidateId)?.id ?? null
    await logActivityEvent(supabase, user.id, {
      event_type: 'candidate_file_uploaded',
      position_id: id!,
      candidate_id: candidateId,
      position_candidate_id: positionCandidateId,
      title: 'Resume uploaded',
      subtitle: file.name,
      metadata: { file_kind: 'resume', path },
    })
    await qc.invalidateQueries({ queryKey: ['position-candidates', id] })
    await qc.invalidateQueries({ queryKey: ['position-activity', id] })
  }

  async function previewResume(storagePath: string) {
    if (!supabase) return
    const { data, error } = await supabase.storage.from('candidate-docs').createSignedUrl(storagePath, 120)
    if (error || !data?.signedUrl) {
      toastError(error?.message ?? 'Could not open file')
      return
    }
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
  }

  const filteredActivity = useMemo(() => {
    const rows = activityQ.data ?? []
    if (activityFilter === 'milestones') {
      return rows.filter((r) =>
        [
          'candidate_reached_critical_stage',
          'candidate_created',
          'position_status_changed',
          'candidate_outcome_changed',
          'candidate_status_changed',
        ].includes(r.event_type),
      )
    }
    return rows
  }, [activityQ.data, activityFilter])

  const terminalPosition = status === 'succeeded' || status === 'cancelled'

  const activePipelineCandidates = useMemo(
    () => (candidatesQ.data ?? []).filter((c) => c.status === 'in_progress'),
    [candidatesQ.data],
  )

  const funnelByStage = useMemo(() => {
    const stats = transitionsStatsQ.data ?? []
    const stages = stagesQ.data ?? []
    return stages.map((s) => {
      const hit = stats.find((x) => x.to_stage_id === s.id)
      return { id: s.id, name: s.name, count: hit?.c ?? 0 }
    })
  }, [transitionsStatsQ.data, stagesQ.data])

  const filteredCandidates = useMemo(
    () => (candidatesQ.data ?? []).filter((c) => candStatusFilter.has(c.status as string)),
    [candidatesQ.data, candStatusFilter],
  )

  function toggleCandStatusFilter(key: string) {
    setCandStatusFilter((prev) => {
      const next = new Set(prev)
      if (next.has(key)) {
        if (next.size <= 1) return prev
        next.delete(key)
      } else next.add(key)
      return next
    })
  }

  function copyWelcomeSnippet(text: string, label: string) {
    if (!text.trim()) {
      toastError('Nothing to copy')
      return
    }
    void navigator.clipboard.writeText(text).then(
      () => success(`${label} copied`),
      () => toastError('Could not copy'),
    )
  }

  function openSavedLinkedin() {
    const raw = linkedinSearchUrl.trim()
    if (!raw) {
      toastError('Enter a URL first')
      return
    }
    try {
      const href = raw.startsWith('http://') || raw.startsWith('https://') ? raw : `https://${raw}`
      const u = new URL(href)
      window.open(u.href, '_blank', 'noopener,noreferrer')
    } catch {
      toastError('Invalid URL')
    }
  }

  if (posQ.isLoading || !position) {
    return <p className="text-ink-muted text-sm">Loading…</p>
  }

  function renderCandidateCard(c: PositionCandidateJunction) {
    const prof = nestedCandidate(c.candidates)
    const candId = prof?.id
    const stageName = nestedStageName(c.position_stages)
    const hl = Boolean(candId && highlightCandidate === candId)
    const inPipeline = c.status === 'in_progress'
    const resumePath = prof?.resume_storage_path ?? null
    const displayName = prof?.full_name ?? 'Unnamed'
    return (
      <li
        key={c.id}
        id={candId ? `cand-${candId}` : `pc-${c.id}`}
        className={`border-line rounded-xl border bg-white/60 p-3 dark:border-line-dark dark:bg-stone-900/40 ${hl ? 'ring-accent ring-2' : ''}`}
      >
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
            {resumePath ? (
              <button
                type="button"
                className="border-line text-ink-muted hover:bg-paper hover:text-accent shrink-0 rounded-lg border p-1.5 transition dark:border-line-dark dark:hover:bg-stone-800"
                title="Preview résumé"
                aria-label="Preview résumé"
                onClick={() => void previewResume(resumePath)}
              >
                <FileText className="h-4 w-4" aria-hidden />
              </button>
            ) : null}
            <Link
              to={`?tab=candidates&candidate=${candId ?? ''}`}
              className="font-medium text-[#9b3e20] hover:underline dark:text-orange-300"
            >
              {displayName}
              <ChevronRight className="ml-1 inline h-4 w-4 opacity-50" aria-hidden />
            </Link>
            {hl && inPipeline ? (
              <div className="flex items-center gap-0.5">
                <button
                  type="button"
                  title="Mark rejected"
                  aria-label="Mark rejected"
                  onClick={() => {
                    if (!window.confirm('Mark this assignment as rejected?')) return
                    const close = window.confirm('Also mark open tasks for this assignment as done?')
                    void patchAssignmentStatus.mutateAsync({ positionCandidateId: c.id, nextStatus: 'rejected', closeTasks: close })
                  }}
                  className="border-line flex h-7 w-7 items-center justify-center rounded-md border bg-white text-stone-800 hover:bg-stone-50 dark:border-stone-600 dark:bg-stone-900 dark:text-stone-100 dark:hover:bg-stone-800"
                >
                  <X className="h-3.5 w-3.5 stroke-[2.5]" aria-hidden />
                </button>
                <button
                  type="button"
                  title="Withdraw from role"
                  aria-label="Withdraw from role"
                  onClick={() => {
                    if (!window.confirm('Withdraw this candidate from this role?')) return
                    const close = window.confirm('Also mark open tasks for this assignment as done?')
                    void patchAssignmentStatus.mutateAsync({ positionCandidateId: c.id, nextStatus: 'withdrawn', closeTasks: close })
                  }}
                  className="border-line flex h-7 w-7 items-center justify-center rounded-md border bg-white text-stone-800 hover:bg-stone-50 dark:border-stone-600 dark:bg-stone-900 dark:text-stone-100 dark:hover:bg-stone-800"
                >
                  <Trash2 className="h-3.5 w-3.5 stroke-[2.5]" aria-hidden />
                </button>
              </div>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => {
              if (window.confirm(`Withdraw ${displayName} from this role?`)) void withdrawFromRole.mutateAsync(c.id)
            }}
            className="text-ink-muted hover:text-red-600 flex items-center gap-1 text-xs"
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden />
            Withdraw
          </button>
        </div>
        <p className="text-ink-muted text-xs">
          {c.source} · {stageName} · {formatAssignmentStatus(c.status as string)}
        </p>
        <label className="mt-2 block text-xs font-medium">
          Stage
          <select
            value={c.position_stage_id ?? ''}
            onChange={(e) =>
              void updateCandidateStage.mutateAsync({ positionCandidateId: c.id, stageId: e.target.value || null })
            }
            className="border-line mt-1 w-full rounded-lg border px-2 py-1.5 text-sm dark:border-line-dark dark:bg-stone-900/50"
          >
            <option value="">—</option>
            {(stagesQ.data ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className="mt-2 block text-xs font-medium">
          Status
          <select
            key={`${c.id}-${c.status}`}
            value={c.status as string}
            disabled={patchAssignmentStatus.isPending}
            onChange={(e) => {
              const v = e.target.value as 'in_progress' | 'rejected' | 'withdrawn'
              if (v === c.status) return
              if (!window.confirm('Change this assignment’s status?')) return
              const closeTasks = v !== 'in_progress' ? window.confirm('Also mark open tasks for this assignment as done?') : false
              void patchAssignmentStatus.mutateAsync({ positionCandidateId: c.id, nextStatus: v, closeTasks })
            }}
            className="border-line mt-1 w-full rounded-lg border px-2 py-1.5 text-sm dark:border-line-dark dark:bg-stone-900/50"
          >
            <option value="in_progress">In progress</option>
            <option value="rejected">Rejected</option>
            <option value="withdrawn">Withdrawn</option>
          </select>
        </label>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              if (!candId) return
              setResumePickForId(candId)
              queueMicrotask(() => resumeFileRef.current?.click())
            }}
            className="border-line inline-flex items-center gap-2 rounded-lg border bg-white/80 px-3 py-2 text-xs font-medium shadow-sm dark:border-line-dark dark:bg-stone-900/60"
          >
            <Upload className="h-3.5 w-3.5 shrink-0" aria-hidden />
            {resumePath ? 'Replace résumé' : 'Upload résumé'}
          </button>
          <span className="text-ink-muted text-[11px]">PDF or Word</span>
          {candId ? (
            <button
              type="button"
              onClick={() => void createShareToken.mutateAsync(candId)}
              className="inline-flex items-center gap-1 rounded-lg border border-line px-2 py-1 text-xs dark:border-line-dark"
            >
              <Link2 className="h-3.5 w-3.5" aria-hidden />
              Share link
            </button>
          ) : null}
        </div>
        {hl && !inPipeline ? (
          <p className="mt-2 text-sm font-medium text-stone-600 dark:text-stone-400">
            Status: {formatAssignmentStatus(c.status as string)}
          </p>
        ) : null}
        {hl && candId ? (
          <div className="mt-3 border-t border-stone-200/80 pt-3 dark:border-stone-600">
            <h3 className="text-xs font-bold uppercase tracking-wide text-stone-500">Candidate activity</h3>
            <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto text-sm">
              {(activityQ.data ?? [])
                .filter((a) => a.candidate_id === candId || a.position_candidate_id === c.id)
                .map((a) => (
                  <li key={a.id} className="text-ink-muted text-xs">
                    <span className="text-ink font-medium">{a.title}</span>
                    {a.subtitle ? ` — ${a.subtitle}` : null} · {formatDistanceToNow(new Date(a.created_at), { addSuffix: true })}
                  </li>
                ))}
            </ul>
          </div>
        ) : null}
      </li>
    )
  }

  return (
    <div className="flex flex-col gap-8">
      <ScreenHeader
        title={position.title}
        subtitle={company?.name}
        backTo="/positions"
        right={
          <div className="flex flex-wrap items-center justify-end gap-1.5">
            <Link
              to={`/settings/positions/${id}/fees`}
              title="Fees & milestones (Settings)"
              aria-label="Fees and milestones"
              className="border-line flex h-9 w-9 items-center justify-center rounded-xl border bg-white/90 text-stone-700 shadow-sm transition hover:bg-stone-100 dark:border-line-dark dark:bg-stone-800 dark:text-stone-200 dark:hover:bg-stone-700"
            >
              <Banknote className="h-4 w-4" aria-hidden />
            </Link>
            <button
              type="button"
              title="Role setup: recruitment stages & Excel import"
              aria-label="Role setup: recruitment stages and import candidates"
              onClick={() => setPositionSetupOpen(true)}
              className="border-line flex h-9 w-9 items-center justify-center rounded-xl border bg-white/90 text-stone-700 shadow-sm transition hover:bg-stone-100 dark:border-line-dark dark:bg-stone-800 dark:text-stone-200 dark:hover:bg-stone-700"
            >
              <Settings className="h-4 w-4" aria-hidden />
            </button>
            {!terminalPosition ? (
              <>
                <button
                  type="button"
                  title="Public list of candidates (shareable link)"
                  aria-label="Public list of candidates"
                  disabled={publicListTokenQ.isLoading || ensurePositionPublicListToken.isPending}
                  onClick={async () => {
                    if (!id) return
                    let tok = publicListTokenQ.data ?? null
                    if (tok == null) {
                      try {
                        tok = await ensurePositionPublicListToken.mutateAsync()
                      } catch {
                        return
                      }
                    }
                    const url = `${window.location.origin}/pub/pos/${tok}`
                    setPublicListUrl(url)
                    setPublicListOpen(true)
                    void navigator.clipboard.writeText(url).catch(() => {})
                    success('Public link copied')
                  }}
                  className="border-line flex h-9 w-9 items-center justify-center rounded-xl border bg-white/90 text-stone-700 shadow-sm transition hover:bg-stone-100 disabled:opacity-50 dark:border-line-dark dark:bg-stone-800 dark:text-stone-200 dark:hover:bg-stone-700"
                >
                  <Globe className="h-4 w-4" aria-hidden />
                </button>
                <button
                  type="button"
                  title="Mark role succeeded"
                  aria-label="Mark role succeeded"
                  onClick={() => {
                    if (!window.confirm('Are you sure you want to mark this role as succeeded?')) return
                    void setPositionTerminal.mutateAsync('succeeded')
                  }}
                  className="border-line flex h-9 w-9 items-center justify-center rounded-xl border border-stone-300 bg-white text-stone-800 shadow-sm transition hover:bg-stone-50 dark:border-stone-600 dark:bg-stone-900 dark:text-stone-100 dark:hover:bg-stone-800"
                >
                  <Check className="h-4 w-4 stroke-[2.5]" aria-hidden />
                </button>
                <button
                  type="button"
                  title="Mark role cancelled"
                  aria-label="Mark role cancelled"
                  onClick={() => {
                    if (!window.confirm('Are you sure you want to mark this role as cancelled?')) return
                    void setPositionTerminal.mutateAsync('cancelled')
                  }}
                  className="border-line flex h-9 w-9 items-center justify-center rounded-xl border border-stone-300 bg-white text-stone-800 shadow-sm transition hover:bg-stone-50 dark:border-stone-600 dark:bg-stone-900 dark:text-stone-100 dark:hover:bg-stone-800"
                >
                  <X className="h-4 w-4 stroke-[2.5]" aria-hidden />
                </button>
              </>
            ) : (
              <>
                <span className="border-line rounded-full border bg-white/80 px-2.5 py-1 text-xs font-semibold dark:bg-stone-800">
                  {status === 'succeeded' ? 'Succeeded' : 'Cancelled'}
                </span>
                <button type="button" onClick={() => void reopenPosition.mutateAsync()} className="text-accent text-xs font-semibold underline">
                  Reopen
                </button>
              </>
            )}
          </div>
        }
      />

      <nav
        className="border-line -mx-1 flex flex-wrap gap-1 rounded-2xl border bg-white/50 p-1 dark:border-line-dark dark:bg-stone-900/40"
        aria-label="Position sections"
      >
        {(
          [
            ['details', 'Details'],
            ['candidates', 'Candidates'],
            ['approaches', 'Approaches'],
          ] as const
        ).map(([tid, label]) => (
          <button
            key={tid}
            type="button"
            onClick={() => setTab(tid)}
            className={`rounded-xl px-3 py-2 text-sm font-bold transition ${
              tab === tid
                ? 'bg-accent text-white shadow-sm'
                : 'text-ink-muted hover:bg-white/80 dark:hover:bg-stone-800/80'
            }`}
          >
            {label}
          </button>
        ))}
      </nav>

      {tab === 'details' ? (
        <>
      <section className="border-line bg-white/60 rounded-2xl border p-4 dark:border-line-dark dark:bg-stone-900/40">
        <h2 className="font-semibold">Position details</h2>
        <form
          className="mt-4 flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault()
            void savePos.mutateAsync()
          }}
        >
          <label className="text-sm font-medium">
            Title
            <input value={title} onChange={(e) => setTitle(e.target.value)} className="border-line mt-1 w-full rounded-xl border px-3 py-2 dark:border-line-dark dark:bg-stone-900/50" />
          </label>

          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium">Role status</span>
            {!terminalPosition ? (
              <div className="flex flex-wrap gap-2">
                {(['active', 'on_hold'] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    disabled={setOpenPositionStatus.isPending}
                    onClick={() => void setOpenPositionStatus.mutateAsync(s)}
                    className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${
                      status === s ? 'bg-accent text-white' : 'border-line border bg-white/80 hover:bg-stone-50 dark:border-line-dark dark:bg-stone-900/50 dark:hover:bg-stone-800'
                    }`}
                  >
                    {s === 'active' ? 'Active' : 'On hold'}
                  </button>
                ))}
                <button
                  type="button"
                  disabled={setPositionTerminal.isPending}
                  onClick={() => {
                    if (!window.confirm('Are you sure you want to mark this role as succeeded?')) return
                    void setPositionTerminal.mutateAsync('succeeded')
                  }}
                  className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${
                    status === 'succeeded' ? 'bg-emerald-700 text-white' : 'border-line border bg-white/80 hover:bg-stone-50 dark:border-line-dark dark:bg-stone-900/50 dark:hover:bg-stone-800'
                  }`}
                >
                  Succeeded
                </button>
                <button
                  type="button"
                  disabled={setPositionTerminal.isPending}
                  onClick={() => {
                    if (!window.confirm('Are you sure you want to mark this role as cancelled?')) return
                    void setPositionTerminal.mutateAsync('cancelled')
                  }}
                  className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${
                    status === 'cancelled' ? 'bg-stone-600 text-white' : 'border-line border bg-white/80 hover:bg-stone-50 dark:border-line-dark dark:bg-stone-900/50 dark:hover:bg-stone-800'
                  }`}
                >
                  Cancelled
                </button>
              </div>
            ) : (
              <p className="text-ink-muted text-xs">
                This role is closed — use <span className="font-semibold">Reopen</span> in the header to work it again, or adjust status after reopening.
              </p>
            )}
          </div>

          <label className="block text-sm font-medium">
            Requirements from client
            <textarea
              value={requirements}
              onChange={(e) => setRequirements(e.target.value)}
              disabled={savePos.isPending}
              rows={12}
              placeholder="Paste 8–12 lines from the client brief (one line per bullet is fine)."
              className="border-line mt-1 w-full resize-y rounded-xl border px-3 py-2 dark:border-line-dark dark:bg-stone-900/50"
            />
          </label>

          <p className="text-ink-muted text-xs dark:text-stone-500">
            Planned/actual fees and milestone stage threshold:{' '}
            <Link to={`/settings/positions/${id}/fees`} className="text-accent font-semibold underline dark:text-orange-300">
              Settings → Fees for this role
            </Link>
            .
          </p>
          <button type="submit" className="bg-accent text-stone-50 w-fit rounded-full px-5 py-2 text-sm font-semibold" disabled={savePos.isPending}>
            Save
          </button>
        </form>
      </section>

      <section className="border-line bg-white/60 rounded-2xl border p-4 dark:border-line-dark dark:bg-stone-900/40">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">Position activity</h2>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setActivityFilter('all')}
              className={`rounded-full px-3 py-1 text-xs font-bold uppercase ${activityFilter === 'all' ? 'bg-accent text-white' : 'border-line border'}`}
            >
              All
            </button>
            <button
              type="button"
              onClick={() => setActivityFilter('milestones')}
              className={`rounded-full px-3 py-1 text-xs font-bold uppercase ${activityFilter === 'milestones' ? 'bg-accent text-white' : 'border-line border'}`}
            >
              Milestones
            </button>
          </div>
        </div>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <input
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            placeholder="Log a quick note (email sent, call, …)"
            className="border-line min-w-0 flex-1 rounded-xl border px-3 py-2 text-sm dark:border-line-dark dark:bg-stone-900/50"
          />
          <button type="button" onClick={() => void addNote.mutateAsync()} className="rounded-full bg-ink/90 px-4 py-2 text-sm font-medium text-white dark:bg-stone-200 dark:text-stone-900">
            Add note
          </button>
        </div>
        <ul className="mt-4 max-h-80 space-y-2 overflow-y-auto">
          {activityQ.isLoading ? (
            <li className="text-ink-muted text-sm">Loading…</li>
          ) : filteredActivity.length === 0 ? (
            <li className="text-ink-muted text-sm">No activity yet.</li>
          ) : (
            filteredActivity.map((a) => (
              <li key={a.id} className="border-line flex gap-2 rounded-xl border bg-white/70 px-3 py-2 text-sm dark:border-line-dark dark:bg-stone-900/50">
                <ActivityIcon type={a.event_type} />
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{a.title}</p>
                  {a.subtitle ? <p className="text-ink-muted text-xs">{a.subtitle}</p> : null}
                  <p className="text-ink-muted mt-0.5 text-[10px] uppercase tracking-wide">
                    {formatDistanceToNow(new Date(a.created_at), { addSuffix: true })}
                  </p>
                </div>
              </li>
            ))
          )}
        </ul>
      </section>

      <section className="border-line bg-white/60 rounded-2xl border p-4 dark:border-line-dark dark:bg-stone-900/40">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">Active in pipeline</h2>
          <button type="button" onClick={() => setTab('candidates')} className="text-accent text-sm font-semibold underline dark:text-orange-300">
            All candidates →
          </button>
        </div>
        <p className="text-ink-muted mt-1 text-xs dark:text-stone-500">
          Assignments in progress on this role — open Candidates for imports, filters, and full cards.
        </p>
        {activePipelineCandidates.length === 0 ? (
          <p className="text-ink-muted mt-3 text-sm">No in-progress assignments yet.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {activePipelineCandidates.map((c) => {
              const prof = nestedCandidate(c.candidates)
              const candId = prof?.id
              const days = differenceInCalendarDays(new Date(), new Date(c.created_at as string))
              return (
                <li
                  key={c.id}
                  className="border-line flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-white/70 px-3 py-2 text-sm dark:border-line-dark dark:bg-stone-900/50"
                >
                  <Link
                    to={candId ? `?tab=candidates&candidate=${candId}` : '?tab=candidates'}
                    className="font-medium text-[#9b3e20] hover:underline dark:text-orange-300"
                  >
                    {prof?.full_name ?? 'Unnamed'}
                  </Link>
                  <span className="text-ink-muted text-xs">
                    {nestedStageName(c.position_stages)} · {days}d
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <section className="border-line bg-white/60 rounded-2xl border p-4 dark:border-line-dark dark:bg-stone-900/40">
        <h2 className="font-semibold">Pipeline reach</h2>
        <p className="text-ink-muted mt-1 text-xs dark:text-stone-500">
          Distinct candidates who reached each stage (from assignment history). Updates when stages change.
        </p>
        {transitionsStatsQ.isLoading ? (
          <p className="text-ink-muted mt-3 text-sm">Loading stats…</p>
        ) : funnelByStage.length === 0 ? (
          <p className="text-ink-muted mt-3 text-sm">No stages defined yet.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {funnelByStage.map((row) => (
              <li
                key={row.id}
                className="border-line flex items-center justify-between gap-2 rounded-lg border bg-white/70 px-3 py-2 text-sm dark:border-line-dark dark:bg-stone-900/50"
              >
                <span className="font-medium">{row.name}</span>
                <span className="text-ink-muted text-xs tabular-nums">{row.count} reached</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="border-line bg-white/60 rounded-2xl border p-4 dark:border-line-dark dark:bg-stone-900/40">
        <h2 className="font-semibold">Tasks for this role</h2>
        <p className="text-ink-muted mt-1 text-sm">
          To add a task, use the <span className="text-ink font-semibold">+</span> button in the bottom bar and choose{' '}
          <span className="text-ink font-medium">Add task</span>. Company and position are filled from this page automatically.
        </p>
        <ul className="mt-3 space-y-2">
          {(tasksQ.data ?? []).length === 0 ? (
            <li className="text-ink-muted text-sm">No tasks linked to this role yet.</li>
          ) : (
            (tasksQ.data ?? []).map((t) => (
              <li
                key={t.id}
                className="border-line bg-white/60 flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2 text-sm dark:border-line-dark dark:bg-stone-900/40"
              >
                <span className="pointer-events-none select-none">
                  {t.title} · {t.status}
                  {t.due_at ? <span className="text-ink-muted"> · due {formatDue(t.due_at)}</span> : null}
                  {(() => {
                    const linkedName = taskLinkedCandidateName(t)
                    return linkedName ? <span className="text-ink-muted"> · {linkedName}</span> : null
                  })()}
                </span>
                <button type="button" onClick={() => void deleteTask.mutateAsync(t.id)} className="text-red-600 text-xs font-semibold">
                  Remove
                </button>
              </li>
            ))
          )}
        </ul>
      </section>
        </>
      ) : null}

      {tab === 'candidates' ? (
      <section id="position-candidates-section" className="scroll-mt-24">
        <h2 className="font-semibold">Candidates</h2>
        <p className="text-ink-muted mt-2 text-sm">
          Filter by assignment status (multi-select). Default shows in-progress pipeline only.
        </p>
        <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="Filter candidates by status">
          {(
            [
              { id: 'in_progress', label: 'In progress' },
              { id: 'rejected', label: 'Rejected' },
              { id: 'withdrawn', label: 'Withdrawn' },
            ] as const
          ).map(({ id, label }) => (
            <button
              key={id}
              type="button"
              onClick={() => toggleCandStatusFilter(id)}
              className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${
                candStatusFilter.has(id) ? 'bg-accent text-white' : 'border-line border bg-white/80 dark:border-line-dark dark:bg-stone-900/50'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <form
          id="position-add-candidate"
          className="border-line bg-white/60 mt-4 grid gap-2 scroll-mt-24 rounded-2xl border p-4 dark:border-line-dark dark:bg-stone-900/40 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault()
            void addCandidate.mutateAsync()
          }}
        >
          <label className="text-sm">
            Full name
            <input value={cName} onChange={(e) => setCName(e.target.value)} className="border-line mt-1 w-full rounded-xl border px-3 py-2 dark:border-line-dark dark:bg-stone-900/50" required />
          </label>
          <label className="text-sm">
            Source
            <select value={cSource} onChange={(e) => setCSource(e.target.value as 'app' | 'external')} className="border-line mt-1 w-full rounded-xl border px-3 py-2 dark:border-line-dark dark:bg-stone-900/50">
              <option value="app">App</option>
              <option value="external">External (import-style)</option>
            </select>
          </label>
          <label className="text-sm">
            Email
            <input value={cEmail} onChange={(e) => setCEmail(e.target.value)} className="border-line mt-1 w-full rounded-xl border px-3 py-2 dark:border-line-dark dark:bg-stone-900/50" />
          </label>
          <label className="text-sm">
            Phone
            <input value={cPhone} onChange={(e) => setCPhone(e.target.value)} className="border-line mt-1 w-full rounded-xl border px-3 py-2 dark:border-line-dark dark:bg-stone-900/50" />
          </label>
          <button type="submit" className="bg-accent text-stone-50 sm:col-span-2 w-fit rounded-full px-4 py-2 text-sm font-semibold">
            Add candidate
          </button>
        </form>

        <input
          ref={resumeFileRef}
          type="file"
          accept=".pdf,.doc,.docx,application/pdf"
          className="sr-only"
          tabIndex={-1}
          onChange={(e) => {
            const f = e.target.files?.[0] ?? null
            const cid = resumePickForId
            setResumePickForId(null)
            e.target.value = ''
            if (cid && f) void uploadResume(cid, f)
          }}
        />

        <ul className="mt-4 space-y-3">
          {filteredCandidates.length === 0 ? (
            <li className="text-ink-muted text-sm">No candidates match the selected filters.</li>
          ) : (
            filteredCandidates.map(renderCandidateCard)
          )}
        </ul>
      </section>
      ) : null}

      {tab === 'approaches' ? (
        <section className="border-line bg-white/60 rounded-2xl border p-4 dark:border-line-dark dark:bg-stone-900/40">
          <h2 className="font-semibold">Approaches</h2>
          <p className="text-ink-muted mt-1 text-sm dark:text-stone-500">LinkedIn search and outreach snippets you can copy into messages.</p>
          <form
            className="mt-4 flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault()
              void savePos.mutateAsync()
            }}
          >
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium">LinkedIn saved search</span>
                <button
                  type="button"
                  onClick={() => openSavedLinkedin()}
                  disabled={!linkedinSearchUrl.trim()}
                  className="border-line flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border bg-white/90 text-[#006384] shadow-sm hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-line-dark dark:bg-stone-800 dark:text-cyan-300 dark:hover:bg-stone-700"
                  title="Open saved LinkedIn URL in a new tab"
                  aria-label="Open LinkedIn saved search in new tab"
                >
                  <ExternalLink className="h-4 w-4" aria-hidden />
                </button>
              </div>
              <input
                value={linkedinSearchUrl}
                onChange={(e) => setLinkedinSearchUrl(e.target.value)}
                placeholder="https://www.linkedin.com/search/results/people/?..."
                className="border-line mt-1 w-full rounded-xl border px-3 py-2 text-sm dark:border-line-dark dark:bg-stone-900/50"
              />
              <p className="text-ink-muted text-xs">Save, then open with the link icon.</p>
            </div>
            <div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium">Welcome approach (1)</span>
                <button
                  type="button"
                  onClick={() => copyWelcomeSnippet(welcome1, 'Welcome 1')}
                  className="border-line flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border bg-white/90 shadow-sm hover:bg-stone-50 dark:border-line-dark dark:bg-stone-800 dark:hover:bg-stone-700"
                  aria-label="Copy welcome approach 1"
                >
                  <Copy className="h-4 w-4" aria-hidden />
                </button>
              </div>
              <textarea value={welcome1} onChange={(e) => setWelcome1(e.target.value)} rows={4} className="border-line mt-1 w-full rounded-xl border px-3 py-2 dark:border-line-dark dark:bg-stone-900/50" />
            </div>
            <div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium">Welcome approach (2)</span>
                <button
                  type="button"
                  onClick={() => copyWelcomeSnippet(welcome2, 'Welcome 2')}
                  className="border-line flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border bg-white/90 shadow-sm hover:bg-stone-50 dark:border-line-dark dark:bg-stone-800 dark:hover:bg-stone-700"
                  aria-label="Copy welcome approach 2"
                >
                  <Copy className="h-4 w-4" aria-hidden />
                </button>
              </div>
              <textarea value={welcome2} onChange={(e) => setWelcome2(e.target.value)} rows={4} className="border-line mt-1 w-full rounded-xl border px-3 py-2 dark:border-line-dark dark:bg-stone-900/50" />
            </div>
            <div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium">Welcome approach (3)</span>
                <button
                  type="button"
                  onClick={() => copyWelcomeSnippet(welcome3, 'Welcome 3')}
                  className="border-line flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border bg-white/90 shadow-sm hover:bg-stone-50 dark:border-line-dark dark:bg-stone-800 dark:hover:bg-stone-700"
                  aria-label="Copy welcome approach 3"
                >
                  <Copy className="h-4 w-4" aria-hidden />
                </button>
              </div>
              <textarea value={welcome3} onChange={(e) => setWelcome3(e.target.value)} rows={4} className="border-line mt-1 w-full rounded-xl border px-3 py-2 dark:border-line-dark dark:bg-stone-900/50" />
            </div>
            <button type="submit" className="bg-accent text-stone-50 w-fit rounded-full px-5 py-2 text-sm font-semibold" disabled={savePos.isPending}>
              Save approaches
            </button>
          </form>
        </section>
      ) : null}

      <Modal open={positionSetupOpen} onClose={() => setPositionSetupOpen(false)} title="Role setup" size="lg">
        <div className="max-h-[min(70vh,32rem)] space-y-8 overflow-y-auto pr-1">
          <div>
            <h3 className="font-semibold">Recruitment stages</h3>
            <ul className="mt-3 space-y-3">
              {(stagesQ.data ?? []).map((s, idx) => (
                <li key={s.id} className="border-line bg-white/60 space-y-3 rounded-xl border px-3 py-3 dark:border-line-dark dark:bg-stone-900/40">
                  <div className="flex items-start justify-between gap-3 border-b border-stone-200/80 pb-3 dark:border-stone-600">
                    <div className="min-w-0 flex-1">
                      <input
                        defaultValue={s.name}
                        onBlur={(e) => {
                          const v = e.target.value.trim()
                          if (!v || v === s.name) return
                          void updateStageMeta.mutateAsync({ id: s.id, name: v })
                        }}
                        placeholder="Stage name"
                        aria-label="Stage name"
                        className="placeholder:text-stitch-muted w-full border-0 bg-transparent text-xl font-extrabold tracking-tight text-stone-900 outline-none ring-0 placeholder:font-semibold focus:ring-0 dark:text-stone-100 dark:placeholder:text-stone-500 md:text-2xl"
                      />
                      <p className="text-ink-muted mt-1 text-[11px] font-semibold uppercase tracking-wide dark:text-stone-500">
                        Sort order {s.sort_order}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <button
                        type="button"
                        className="border-line text-ink-muted hover:bg-stone-50 dark:hover:bg-stone-800 flex h-9 w-9 items-center justify-center rounded-xl border bg-white/90 shadow-sm transition disabled:cursor-not-allowed disabled:opacity-35 dark:border-line-dark dark:bg-stone-900/80"
                        onClick={() => void moveStage(s.id, -1)}
                        disabled={idx === 0}
                        aria-label="Move stage up"
                      >
                        <ChevronUp className="h-4 w-4" aria-hidden />
                      </button>
                      <button
                        type="button"
                        className="border-line text-ink-muted hover:bg-stone-50 dark:hover:bg-stone-800 flex h-9 w-9 items-center justify-center rounded-xl border bg-white/90 shadow-sm transition disabled:cursor-not-allowed disabled:opacity-35 dark:border-line-dark dark:bg-stone-900/80"
                        onClick={() => void moveStage(s.id, 1)}
                        disabled={idx === (stagesQ.data ?? []).length - 1}
                        aria-label="Move stage down"
                      >
                        <ChevronDown className="h-4 w-4" aria-hidden />
                      </button>
                      <button
                        type="button"
                        className="border-line text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30 flex h-9 w-9 items-center justify-center rounded-xl border border-red-200 bg-white/90 shadow-sm transition disabled:cursor-not-allowed disabled:opacity-35 dark:border-red-900/50 dark:bg-stone-900/80 dark:text-red-300"
                        onClick={() => {
                          if (window.confirm(`Delete stage “${s.name}”?`)) void deleteStageMut.mutateAsync(s.id)
                        }}
                        disabled={deleteStageMut.isPending}
                        aria-label="Delete stage"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden />
                      </button>
                    </div>
                  </div>
                  <div className="flex flex-col gap-4 md:flex-row md:items-start md:gap-6">
                    <label className="block max-w-xl flex-1 text-xs font-medium text-stone-600 dark:text-stone-400">
                      Description
                      <textarea
                        rows={2}
                        defaultValue={s.description ?? ''}
                        onBlur={(e) => void updateStageMeta.mutateAsync({ id: s.id, description: e.target.value.trim() || null })}
                        className="border-line mt-0.5 max-w-xl w-full rounded-lg border px-2 py-1.5 text-sm dark:border-line-dark dark:bg-stone-900/50"
                      />
                    </label>
                    <div className="flex min-w-0 shrink-0 flex-col gap-2 md:w-56">
                      <label className="block text-xs font-medium text-stone-600 dark:text-stone-400">
                        Interviewers
                        <input
                          defaultValue={s.interviewers ?? ''}
                          onBlur={(e) => void updateStageMeta.mutateAsync({ id: s.id, interviewers: e.target.value.trim() || null })}
                          className="border-line mt-0.5 w-full rounded-lg border px-2 py-1.5 text-sm dark:border-line-dark dark:bg-stone-900/50"
                        />
                      </label>
                      <div className="flex flex-wrap items-end gap-3">
                        <label className="text-xs font-medium text-stone-600 dark:text-stone-400">
                          Duration (min)
                          <input
                            type="number"
                            min={0}
                            defaultValue={s.duration_minutes ?? ''}
                            onBlur={(e) => {
                              const raw = e.target.value.trim()
                              if (raw === '') {
                                void updateStageMeta.mutateAsync({ id: s.id, duration_minutes: null })
                                return
                              }
                              const n = parseInt(raw, 10)
                              if (!Number.isFinite(n)) return
                              void updateStageMeta.mutateAsync({ id: s.id, duration_minutes: n })
                            }}
                            className="border-line mt-0.5 block w-full max-w-[7rem] rounded-lg border px-2 py-1.5 text-sm dark:border-line-dark dark:bg-stone-900/50"
                          />
                        </label>
                        <label className="flex cursor-pointer items-center gap-2 pb-2 text-xs font-medium text-stone-600 dark:text-stone-400">
                          <input
                            type="checkbox"
                            defaultChecked={Boolean(s.is_remote)}
                            onChange={(e) => void updateStageMeta.mutateAsync({ id: s.id, is_remote: e.target.checked })}
                            className="rounded border-stone-300 dark:border-stone-600"
                          />
                          Remote
                        </label>
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
            <form
              className="mt-3 flex flex-wrap gap-2"
              onSubmit={(e) => {
                e.preventDefault()
                void addStage.mutateAsync()
              }}
            >
              <input
                value={newStageName}
                onChange={(e) => setNewStageName(e.target.value)}
                placeholder="New stage name"
                className="border-line min-w-[12rem] flex-1 rounded-xl border px-3 py-2 dark:border-line-dark dark:bg-stone-900/50"
              />
              <button type="submit" className="bg-ink/90 text-paper rounded-full px-4 py-2 text-sm font-medium dark:bg-stone-200 dark:text-stone-900">
                Add stage
              </button>
            </form>
          </div>
          <div>
            <h3 className="font-semibold">Import candidates (Excel)</h3>
            <p className="text-ink-muted mt-1 text-sm">Upload a spreadsheet with one row per candidate. We detect columns by header names (name, email, phone).</p>
            <input
              ref={excelImportRef}
              type="file"
              accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
              className="sr-only"
              onChange={(e) => {
                void onExcel(e.target.files?.[0] ?? null)
                e.target.value = ''
              }}
            />
            <button
              type="button"
              onClick={() => excelImportRef.current?.click()}
              className="border-line mt-3 inline-flex w-full max-w-md items-center justify-center gap-2 rounded-xl border bg-white/80 px-4 py-3 text-sm font-semibold shadow-sm dark:border-line-dark dark:bg-stone-900/60 sm:w-auto"
            >
              <Upload className="h-4 w-4 shrink-0" aria-hidden />
              Choose Excel file
            </button>
            <p className="text-ink-muted mt-2 text-xs">Supported: .xlsx, .xls. No file is uploaded until you confirm the import.</p>
            {importError ? <p className="mt-2 text-sm text-amber-700 dark:text-amber-400">{importError}</p> : null}
          </div>
        </div>
      </Modal>

      <Modal open={shareOpen} onClose={() => setShareOpen(false)} title="Share link" size="sm">
        <p className="text-ink-muted text-sm">Anyone with this link can view a summary (expires in 7 days).</p>
        <p className="mt-2 break-all rounded-lg bg-stone-100 p-2 text-xs dark:bg-stone-800">{shareUrl}</p>
      </Modal>

      <Modal open={publicListOpen} onClose={() => setPublicListOpen(false)} title="Public candidate list" size="sm">
        <p className="text-ink-muted text-sm">
          Anyone with this link can see names, pipeline stage, and status for this open role. Contact details are not
          included. The page stops working if the role is marked succeeded or cancelled.
        </p>
        {publicListUrl ? (
          <>
            <p className="mt-2 break-all rounded-lg bg-stone-100 p-2 text-xs dark:bg-stone-800">{publicListUrl}</p>
            <a
              href={publicListUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent mt-3 inline-flex items-center gap-1 text-sm font-semibold underline dark:text-orange-300"
            >
              <ExternalLink className="h-4 w-4 shrink-0" aria-hidden />
              Open in new tab
            </a>
          </>
        ) : null}
      </Modal>
    </div>
  )
}

function ActivityIcon({ type }: { type: string }) {
  const cls = 'mt-0.5 h-8 w-8 shrink-0 rounded-lg bg-stone-100 p-1.5 dark:bg-stone-800'
  if (
    type === 'candidate_outcome_changed' ||
    type === 'candidate_status_changed' ||
    type === 'position_status_changed'
  )
    return <PartyPopper className={cls} aria-hidden />
  if (type === 'candidate_reached_critical_stage') return <CheckCircle className={cls} aria-hidden />
  if (type === 'candidate_file_uploaded') return <FileText className={cls} aria-hidden />
  return <ChevronRight className={cls} aria-hidden />
}
