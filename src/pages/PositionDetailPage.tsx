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
  Upload,
  Copy,
  ExternalLink,
  Settings,
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'

import { useAuth } from '@/auth/useAuth'
import { getSupabase } from '@/lib/supabase'
import { normalizeEmail, normalizePhone } from '@/lib/normalize'
import { formatDue } from '@/lib/dates'
import { ScreenHeader } from '@/components/layout/ScreenHeader'
import { Modal } from '@/components/ui/Modal'
import { useToast } from '@/hooks/useToast'
import { criticalStageThreshold, logActivityEvent } from '@/lib/activityLog'
import { RequirementsMultiSelect } from '@/components/RequirementsMultiSelect'
import { normalizeRequirementItemValues } from '@/lib/requirementValues'

type StageRow = { id: string; name: string; sort_order: number }
type ActivityRow = {
  id: string
  event_type: string
  title: string
  subtitle: string | null
  created_at: string
  candidate_id: string | null
}

export function PositionDetailPage() {
  const { id } = useParams()
  const { user } = useAuth()
  const supabase = getSupabase()
  const qc = useQueryClient()
  const { success, error: toastError } = useToast()
  const [search, setSearch] = useSearchParams()
  const highlightCandidate = search.get('candidate')
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
        .from('candidates')
        .select('*, position_stages ( name )')
        .eq('position_id', id!)
        .eq('user_id', user!.id)
        .is('deleted_at', null)
        .order('full_name')
      if (error) throw error
      return data ?? []
    },
  })

  type PositionCandidate = NonNullable<typeof candidatesQ.data>[number] & { resume_storage_path?: string | null }

  const tasksQ = useQuery({
    queryKey: ['position-tasks', id, user?.id],
    enabled: Boolean(supabase && user && id),
    queryFn: async () => {
      const { data, error } = await supabase!
        .from('tasks')
        .select('*, candidates ( full_name )')
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
        .select('id, event_type, title, subtitle, created_at, candidate_id')
        .eq('position_id', id!)
        .eq('user_id', user!.id)
        .order('created_at', { ascending: false })
        .limit(80)
      if (error) throw error
      return (data ?? []) as ActivityRow[]
    },
  })

  const position = posQ.data
  const company = position?.companies as unknown as { id: string; name: string; contact_email: string | null } | undefined

  const [title, setTitle] = useState('')
  const [requirementItemValues, setRequirementItemValues] = useState<string[]>([])
  const [welcome1, setWelcome1] = useState('')
  const [welcome2, setWelcome2] = useState('')
  const [welcome3, setWelcome3] = useState('')
  const [linkedinSearchUrl, setLinkedinSearchUrl] = useState('')
  const [positionSetupOpen, setPositionSetupOpen] = useState(false)
  const [outcomeFilter, setOutcomeFilter] = useState<Set<string>>(() => new Set(['active']))
  const [status, setStatus] = useState('pending')
  const [planned, setPlanned] = useState('')
  const [actual, setActual] = useState('')
  const [criticalN, setCriticalN] = useState('3')
  const [activityFilter, setActivityFilter] = useState<'all' | 'milestones'>('all')
  const [noteText, setNoteText] = useState('')
  const [shareOpen, setShareOpen] = useState(false)
  const [shareUrl, setShareUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!position) return
    setTitle(position.title ?? '')
    setRequirementItemValues(normalizeRequirementItemValues((position as { requirement_item_values?: unknown }).requirement_item_values))
    setWelcome1(position.welcome_1 ?? '')
    setWelcome2(position.welcome_2 ?? '')
    setWelcome3(position.welcome_3 ?? '')
    setLinkedinSearchUrl((position as { linkedin_saved_search_url?: string | null }).linkedin_saved_search_url ?? '')
    setStatus(position.status ?? 'pending')
    setPlanned(position.planned_fee_ils != null ? String(position.planned_fee_ils) : '')
    setActual(position.actual_fee_ils != null ? String(position.actual_fee_ils) : '')
    const c = (position as { critical_stage_sort_order?: number | null }).critical_stage_sort_order
    setCriticalN(c != null ? String(c) : '3')
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
    const el = document.getElementById('position-add-candidate')
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    const firstInput = el?.querySelector('input') as HTMLInputElement | null
    requestAnimationFrame(() => firstInput?.focus())
    setSearch(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.delete('addCandidate')
        return next
      },
      { replace: true },
    )
  }, [search, setSearch])

  const invalidateAll = async () => {
    await qc.invalidateQueries({ queryKey: ['position', id] })
    await qc.invalidateQueries({ queryKey: ['position-candidates', id] })
    await qc.invalidateQueries({ queryKey: ['position-activity', id] })
    await qc.invalidateQueries({ queryKey: ['positions'] })
    await qc.invalidateQueries({ queryKey: ['dashboard-tasks'] })
    await qc.invalidateQueries({ queryKey: ['notification-count'] })
  }

  const savePos = useMutation({
    mutationFn: async () => {
      const crit = criticalN.trim() ? Number(criticalN) : null
      const { error } = await supabase!
        .from('positions')
        .update({
          title: title.trim() || 'Untitled',
          requirement_item_values: requirementItemValues,
          welcome_1: welcome1.trim() || null,
          welcome_2: welcome2.trim() || null,
          welcome_3: welcome3.trim() || null,
          linkedin_saved_search_url: linkedinSearchUrl.trim() || null,
          status,
          planned_fee_ils: planned ? Number(planned) : null,
          actual_fee_ils: actual ? Number(actual) : null,
          critical_stage_sort_order: crit != null && !Number.isNaN(crit) ? crit : null,
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
    mutationFn: async (next: 'success' | 'cancelled') => {
      const prev = position?.status ?? 'pending'
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
      success(next === 'success' ? 'Marked fulfilled' : 'Marked withdrawn')
      await logActivityEvent(supabase!, user!.id, {
        event_type: 'position_status_changed',
        position_id: id!,
        title: next === 'success' ? 'Position fulfilled' : 'Position withdrawn',
        subtitle: `${prev} → ${next}`,
        metadata: { from: prev, to: next },
      })
      await invalidateAll()
    },
    onError: (e: Error) => toastError(e.message),
  })

  const reopenPosition = useMutation({
    mutationFn: async () => {
      const { error } = await supabase!.from('positions').update({ status: 'in_progress' }).eq('id', id!).eq('user_id', user!.id)
      if (error) throw error
    },
    onSuccess: async () => {
      setStatus('in_progress')
      success('Position reopened')
      await invalidateAll()
    },
    onError: (e: Error) => toastError(e.message),
  })

  const setOpenPositionStatus = useMutation({
    mutationFn: async (next: 'pending' | 'in_progress') => {
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
        subtitle: next,
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
  const [cRequirementItemValues, setCRequirementItemValues] = useState<string[]>([])

  const addCandidate = useMutation({
    mutationFn: async () => {
      const en = normalizeEmail(cEmail)
      const pn = normalizePhone(cPhone)
      if (cSource === 'app' && id) {
        const externals = (candidatesQ.data ?? []).filter((c) => c.source === 'external')
        const hit = externals.find((c) => {
          if (en && c.email_normalized && c.email_normalized === en) return true
          if (pn && c.phone_normalized && c.phone_normalized === pn) return true
          return false
        })
        if (hit) {
          const ok = window.confirm(`This matches imported candidate “${hit.full_name}”. Create another record anyway?`)
          if (!ok) throw new Error('cancelled')
        }
      }
      const firstStage = stagesQ.data?.[0]?.id ?? null
      const { data, error } = await supabase!
        .from('candidates')
        .insert({
          user_id: user!.id,
          position_id: id!,
          position_stage_id: firstStage,
          full_name: cName.trim() || 'Unnamed',
          email: cEmail.trim() || null,
          phone: cPhone.trim() || null,
          source: cSource,
          outcome: 'active',
          email_normalized: en,
          phone_normalized: pn,
          requirement_item_values: cRequirementItemValues,
        })
        .select('id, full_name')
        .single()
      if (error) throw error
      return data
    },
    onSuccess: async (data) => {
      setCName('')
      setCEmail('')
      setCPhone('')
      setCRequirementItemValues([])
      success('Candidate added')
      await logActivityEvent(supabase!, user!.id, {
        event_type: 'candidate_created',
        position_id: id!,
        candidate_id: data.id,
        title: `New candidate: ${data.full_name}`,
      })
      await qc.invalidateQueries({ queryKey: ['position-candidates', id] })
      await qc.invalidateQueries({ queryKey: ['position-activity', id] })
    },
    onError: (e: Error) => {
      if (e.message === 'cancelled') return
      toastError(e.message)
    },
  })

  const updateCandidateRequirements = useMutation({
    mutationFn: async ({ candidateId, values }: { candidateId: string; values: string[] }) => {
      const { error } = await supabase!
        .from('candidates')
        .update({ requirement_item_values: values })
        .eq('id', candidateId)
        .eq('user_id', user!.id)
      if (error) throw error
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['position-candidates', id] })
    },
    onError: (e: Error) => toastError(e.message),
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
      const { error } = await supabase.from('candidates').insert({
        user_id: user.id,
        position_id: id,
        position_stage_id: stageId,
        full_name: nm,
        email: em || null,
        phone: ph || null,
        source: 'external',
        outcome: 'active',
        email_normalized: normalizeEmail(em),
        phone_normalized: normalizePhone(ph),
      })
      if (!error) ok++
    }
    await qc.invalidateQueries({ queryKey: ['position-candidates', id] })
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
      await qc.invalidateQueries({ queryKey: ['dashboard-tasks'] })
    },
    onError: (e: Error) => toastError(e.message),
  })

  const updateCandidateStage = useMutation({
    mutationFn: async ({ candidateId, stageId }: { candidateId: string; stageId: string | null }) => {
      const cand = (candidatesQ.data ?? []).find((c) => c.id === candidateId)
      const oldStageId = cand?.position_stage_id as string | null
      const stages = stagesQ.data ?? []
      const oldS = oldStageId ? stages.find((s) => s.id === oldStageId) : null
      const newS = stageId ? stages.find((s) => s.id === stageId) : null
      const { error } = await supabase!
        .from('candidates')
        .update({ position_stage_id: stageId })
        .eq('id', candidateId)
        .eq('user_id', user!.id)
      if (error) throw error
      return { candidateId, oldS, newS, candName: cand?.full_name ?? 'Candidate' }
    },
    onSuccess: async ({ candidateId, oldS, newS, candName }) => {
      success('Stage updated')
      const fromName = oldS?.name ?? '—'
      const toName = newS?.name ?? '—'
      await logActivityEvent(supabase!, user!.id, {
        event_type: 'candidate_stage_changed',
        position_id: id!,
        candidate_id: candidateId,
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
      if (newS && newS.sort_order >= N) {
        await logActivityEvent(supabase!, user!.id, {
          event_type: 'candidate_reached_critical_stage',
          position_id: id!,
          candidate_id: candidateId,
          title: `${candName} reached stage ${N}+`,
          subtitle: newS.name,
          metadata: { sort_order: newS.sort_order, threshold: N },
        })
      }
      await qc.invalidateQueries({ queryKey: ['position-candidates', id] })
      await qc.invalidateQueries({ queryKey: ['position-activity', id] })
    },
    onError: (e: Error) => toastError(e.message),
  })

  const setCandidateOutcome = useMutation({
    mutationFn: async ({
      candidateId,
      outcome,
      closeTasks,
    }: {
      candidateId: string
      outcome: 'active' | 'hired' | 'rejected' | 'withdrawn'
      closeTasks: boolean
    }) => {
      const cand = (candidatesQ.data ?? []).find((c) => c.id === candidateId)
      const prev = cand?.outcome ?? 'active'
      const { error } = await supabase!.from('candidates').update({ outcome }).eq('id', candidateId).eq('user_id', user!.id)
      if (error) throw error
      if (closeTasks && outcome !== 'active') {
        await supabase!.from('tasks').update({ status: 'done' }).eq('candidate_id', candidateId).eq('user_id', user!.id).neq('status', 'done')
      }
      return { candidateId, prev, outcome, name: cand?.full_name ?? 'Candidate' }
    },
    onSuccess: async ({ candidateId, prev, outcome, name }) => {
      success('Outcome updated')
      await logActivityEvent(supabase!, user!.id, {
        event_type: 'candidate_outcome_changed',
        position_id: id!,
        candidate_id: candidateId,
        title: `${name}: ${outcome}`,
        subtitle: `${prev} → ${outcome}`,
        metadata: { from: prev, to: outcome },
      })
      await invalidateAll()
    },
    onError: (e: Error) => toastError(e.message),
  })

  const softDeleteCandidate = useMutation({
    mutationFn: async (candidateId: string) => {
      const { error } = await supabase!.from('candidates').update({ deleted_at: new Date().toISOString() }).eq('id', candidateId).eq('user_id', user!.id)
      if (error) throw error
    },
    onSuccess: async () => {
      success('Candidate archived')
      if (highlightCandidate) setSearch({}, { replace: true })
      await invalidateAll()
    },
    onError: (e: Error) => toastError(e.message),
  })

  const addNote = useMutation({
    mutationFn: async () => {
      if (!noteText.trim()) throw new Error('Enter a note')
      await logActivityEvent(supabase!, user!.id, {
        event_type: 'note_added',
        position_id: id!,
        candidate_id: highlightCandidate || null,
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
    await logActivityEvent(supabase, user.id, {
      event_type: 'candidate_file_uploaded',
      position_id: id!,
      candidate_id: candidateId,
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
        ['candidate_reached_critical_stage', 'candidate_created', 'position_status_changed', 'candidate_outcome_changed'].includes(r.event_type),
      )
    }
    return rows
  }, [activityQ.data, activityFilter])

  const terminalPosition = status === 'success' || status === 'cancelled'

  const filteredCandidates = useMemo(
    () => (candidatesQ.data ?? []).filter((c) => outcomeFilter.has(c.outcome)),
    [candidatesQ.data, outcomeFilter],
  )

  function toggleOutcomeFilter(key: string) {
    setOutcomeFilter((prev) => {
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

  function renderCandidateCard(c: PositionCandidate) {
    const st = c.position_stages as unknown as { name: string } | null
    const hl = highlightCandidate === c.id
    const active = c.outcome === 'active'
    const resumePath = c.resume_storage_path ?? null
    return (
      <li
        key={c.id}
        id={`cand-${c.id}`}
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
            <Link to={`?candidate=${c.id}`} className="font-medium text-[#9b3e20] hover:underline dark:text-orange-300">
              {c.full_name}
              <ChevronRight className="ml-1 inline h-4 w-4 opacity-50" aria-hidden />
            </Link>
            {hl && active ? (
              <div className="flex items-center gap-0.5">
                <button
                  type="button"
                  title="Mark hired"
                  aria-label="Mark hired"
                  onClick={() => {
                    if (!window.confirm('Are you sure you want to mark this candidate as hired?')) return
                    const close = window.confirm('Also mark open tasks for this candidate as done?')
                    void setCandidateOutcome.mutateAsync({ candidateId: c.id, outcome: 'hired', closeTasks: close })
                  }}
                  className="border-line flex h-7 w-7 items-center justify-center rounded-md border bg-white text-stone-800 hover:bg-stone-50 dark:border-stone-600 dark:bg-stone-900 dark:text-stone-100 dark:hover:bg-stone-800"
                >
                  <Check className="h-3.5 w-3.5 stroke-[2.5]" aria-hidden />
                </button>
                <button
                  type="button"
                  title="Mark rejected"
                  aria-label="Mark rejected"
                  onClick={() => {
                    if (!window.confirm('Are you sure you want to reject this candidate?')) return
                    const close = window.confirm('Also mark open tasks for this candidate as done?')
                    void setCandidateOutcome.mutateAsync({ candidateId: c.id, outcome: 'rejected', closeTasks: close })
                  }}
                  className="border-line flex h-7 w-7 items-center justify-center rounded-md border bg-white text-stone-800 hover:bg-stone-50 dark:border-stone-600 dark:bg-stone-900 dark:text-stone-100 dark:hover:bg-stone-800"
                >
                  <X className="h-3.5 w-3.5 stroke-[2.5]" aria-hidden />
                </button>
              </div>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => {
              if (window.confirm(`Archive ${c.full_name}?`)) void softDeleteCandidate.mutateAsync(c.id)
            }}
            className="text-ink-muted hover:text-red-600 flex items-center gap-1 text-xs"
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden />
            Archive
          </button>
        </div>
        <p className="text-ink-muted text-xs">
          {c.source} · {st?.name ?? '—'} · {c.outcome}
        </p>
        <div className="mt-2 text-xs font-medium">
          Requirements
          <RequirementsMultiSelect
            className="mt-1"
            value={normalizeRequirementItemValues(c.requirement_item_values)}
            onChange={(next) => void updateCandidateRequirements.mutateAsync({ candidateId: c.id, values: next })}
            disabled={updateCandidateRequirements.isPending}
          />
        </div>
        <label className="mt-2 block text-xs font-medium">
          Stage
          <select
            value={c.position_stage_id ?? ''}
            onChange={(e) => void updateCandidateStage.mutateAsync({ candidateId: c.id, stageId: e.target.value || null })}
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
          Outcome
          <select
            key={`${c.id}-${c.outcome}`}
            value={c.outcome}
            disabled={setCandidateOutcome.isPending}
            onChange={(e) => {
              const v = e.target.value as 'active' | 'hired' | 'rejected' | 'withdrawn'
              if (v === c.outcome) return
              if (!window.confirm('Are you sure you want to change this candidate’s outcome?')) return
              const closeTasks = v !== 'active' ? window.confirm('Also mark open tasks for this candidate as done?') : false
              void setCandidateOutcome.mutateAsync({ candidateId: c.id, outcome: v, closeTasks })
            }}
            className="border-line mt-1 w-full rounded-lg border px-2 py-1.5 text-sm dark:border-line-dark dark:bg-stone-900/50"
          >
            <option value="active">Active</option>
            <option value="hired">Hired</option>
            <option value="rejected">Rejected</option>
            <option value="withdrawn">Withdrawn</option>
          </select>
        </label>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setResumePickForId(c.id)
              queueMicrotask(() => resumeFileRef.current?.click())
            }}
            className="border-line inline-flex items-center gap-2 rounded-lg border bg-white/80 px-3 py-2 text-xs font-medium shadow-sm dark:border-line-dark dark:bg-stone-900/60"
          >
            <Upload className="h-3.5 w-3.5 shrink-0" aria-hidden />
            {resumePath ? 'Replace résumé' : 'Upload résumé'}
          </button>
          <span className="text-ink-muted text-[11px]">PDF or Word</span>
          <button type="button" onClick={() => void createShareToken.mutateAsync(c.id)} className="inline-flex items-center gap-1 rounded-lg border border-line px-2 py-1 text-xs dark:border-line-dark">
            <Link2 className="h-3.5 w-3.5" aria-hidden />
            Share link
          </button>
        </div>
        {hl && !active ? <p className="mt-2 text-sm font-medium text-stone-600 dark:text-stone-400">Outcome: {c.outcome}</p> : null}
        {hl ? (
          <div className="mt-3 border-t border-stone-200/80 pt-3 dark:border-stone-600">
            <h3 className="text-xs font-bold uppercase tracking-wide text-stone-500">Candidate activity</h3>
            <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto text-sm">
              {(activityQ.data ?? [])
                .filter((a) => a.candidate_id === c.id)
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
                  title="Mark role fulfilled"
                  aria-label="Mark role fulfilled"
                  onClick={() => {
                    if (!window.confirm('Are you sure you want to mark this role as fulfilled?')) return
                    void setPositionTerminal.mutateAsync('success')
                  }}
                  className="border-line flex h-9 w-9 items-center justify-center rounded-xl border border-stone-300 bg-white text-stone-800 shadow-sm transition hover:bg-stone-50 dark:border-stone-600 dark:bg-stone-900 dark:text-stone-100 dark:hover:bg-stone-800"
                >
                  <Check className="h-4 w-4 stroke-[2.5]" aria-hidden />
                </button>
                <button
                  type="button"
                  title="Mark role withdrawn"
                  aria-label="Mark role withdrawn"
                  onClick={() => {
                    if (!window.confirm('Are you sure you want to mark this role as withdrawn?')) return
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
                  {status === 'success' ? 'Fulfilled' : 'Withdrawn'}
                </span>
                <button type="button" onClick={() => void reopenPosition.mutateAsync()} className="text-accent text-xs font-semibold underline">
                  Reopen
                </button>
              </>
            )}
          </div>
        }
      />

      <section className="border-line bg-white/60 rounded-2xl border p-4 dark:border-line-dark dark:bg-stone-900/40">
        <h2 className="font-display font-semibold">Position details</h2>
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
                {(['pending', 'in_progress'] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    disabled={setOpenPositionStatus.isPending}
                    onClick={() => void setOpenPositionStatus.mutateAsync(s)}
                    className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${
                      status === s ? 'bg-accent text-white' : 'border-line border bg-white/80 hover:bg-stone-50 dark:border-line-dark dark:bg-stone-900/50 dark:hover:bg-stone-800'
                    }`}
                  >
                    {s === 'pending' ? 'Pending' : 'In progress'}
                  </button>
                ))}
                <button
                  type="button"
                  disabled={setPositionTerminal.isPending}
                  onClick={() => {
                    if (!window.confirm('Are you sure you want to mark this role as fulfilled?')) return
                    void setPositionTerminal.mutateAsync('success')
                  }}
                  className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${
                    status === 'success' ? 'bg-emerald-700 text-white' : 'border-line border bg-white/80 hover:bg-stone-50 dark:border-line-dark dark:bg-stone-900/50 dark:hover:bg-stone-800'
                  }`}
                >
                  Fulfilled
                </button>
                <button
                  type="button"
                  disabled={setPositionTerminal.isPending}
                  onClick={() => {
                    if (!window.confirm('Are you sure you want to mark this role as withdrawn?')) return
                    void setPositionTerminal.mutateAsync('cancelled')
                  }}
                  className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${
                    status === 'cancelled' ? 'bg-stone-600 text-white' : 'border-line border bg-white/80 hover:bg-stone-50 dark:border-line-dark dark:bg-stone-900/50 dark:hover:bg-stone-800'
                  }`}
                >
                  Withdrawn
                </button>
              </div>
            ) : (
              <p className="text-ink-muted text-xs">
                This role is closed — use <span className="font-semibold">Reopen</span> in the header to work it again, or adjust status after reopening.
              </p>
            )}
          </div>

          <details className="rounded-xl border border-stone-200/80 bg-stone-50/50 p-3 dark:border-stone-600 dark:bg-stone-900/30">
            <summary className="cursor-pointer text-sm font-semibold">Advanced fees & milestones</summary>
            <div className="mt-3 flex flex-col gap-3">
              <label className="text-sm font-medium">
                Critical stage threshold (sort order ≥ this = milestone)
                <input
                  value={criticalN}
                  onChange={(e) => setCriticalN(e.target.value)}
                  inputMode="numeric"
                  className="border-line mt-1 w-full rounded-xl border px-3 py-2 dark:border-line-dark dark:bg-stone-900/50"
                />
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-sm font-medium">
                  Planned fee (ILS)
                  <input value={planned} onChange={(e) => setPlanned(e.target.value)} inputMode="decimal" className="border-line mt-1 w-full rounded-xl border px-3 py-2 dark:border-line-dark dark:bg-stone-900/50" />
                </label>
                <label className="text-sm font-medium">
                  Actual fee (ILS)
                  <input value={actual} onChange={(e) => setActual(e.target.value)} inputMode="decimal" className="border-line mt-1 w-full rounded-xl border px-3 py-2 dark:border-line-dark dark:bg-stone-900/50" />
                </label>
              </div>
            </div>
          </details>
          <div className="text-sm font-medium">
            Requirements
            <RequirementsMultiSelect
              value={requirementItemValues}
              onChange={setRequirementItemValues}
              disabled={savePos.isPending}
            />
          </div>

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
            <p className="text-ink-muted text-xs">Paste your LinkedIn people search URL; open it anytime with the link icon (after saving).</p>
          </div>

          <div className="flex flex-col gap-3">
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
              <textarea value={welcome1} onChange={(e) => setWelcome1(e.target.value)} rows={3} className="border-line mt-1 w-full rounded-xl border px-3 py-2 dark:border-line-dark dark:bg-stone-900/50" />
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
              <textarea value={welcome2} onChange={(e) => setWelcome2(e.target.value)} rows={3} className="border-line mt-1 w-full rounded-xl border px-3 py-2 dark:border-line-dark dark:bg-stone-900/50" />
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
              <textarea value={welcome3} onChange={(e) => setWelcome3(e.target.value)} rows={3} className="border-line mt-1 w-full rounded-xl border px-3 py-2 dark:border-line-dark dark:bg-stone-900/50" />
            </div>
          </div>
          <button type="submit" className="bg-accent text-stone-50 w-fit rounded-full px-5 py-2 text-sm font-semibold" disabled={savePos.isPending}>
            Save
          </button>
        </form>
      </section>

      <section className="border-line bg-white/60 rounded-2xl border p-4 dark:border-line-dark dark:bg-stone-900/40">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display font-semibold">Position activity</h2>
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

      <section>
        <h2 className="font-display font-semibold">Candidates</h2>
        <p className="text-ink-muted mt-2 text-sm">Filter by candidate outcome (multi-select). Default shows active pipeline only.</p>
        <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="Filter candidates by outcome">
          {(
            [
              { id: 'active', label: 'Active' },
              { id: 'hired', label: 'Hired' },
              { id: 'rejected', label: 'Rejected' },
              { id: 'withdrawn', label: 'Withdrawn' },
            ] as const
          ).map(({ id, label }) => (
            <button
              key={id}
              type="button"
              onClick={() => toggleOutcomeFilter(id)}
              className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${
                outcomeFilter.has(id) ? 'bg-accent text-white' : 'border-line border bg-white/80 dark:border-line-dark dark:bg-stone-900/50'
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
          <div className="text-sm sm:col-span-2">
            <span className="font-medium">Requirements</span>
            <RequirementsMultiSelect
              value={cRequirementItemValues}
              onChange={setCRequirementItemValues}
              disabled={addCandidate.isPending}
            />
          </div>
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

      <Modal open={positionSetupOpen} onClose={() => setPositionSetupOpen(false)} title="Role setup" size="lg">
        <div className="max-h-[min(70vh,32rem)] space-y-8 overflow-y-auto pr-1">
          <div>
            <h3 className="font-display font-semibold">Recruitment stages</h3>
            <ul className="mt-3 space-y-2">
              {(stagesQ.data ?? []).map((s, idx) => (
                <li key={s.id} className="border-line bg-white/60 flex items-center justify-between gap-2 rounded-xl border px-3 py-2 dark:border-line-dark dark:bg-stone-900/40">
                  <span>
                    {s.name} <span className="text-ink-muted text-xs">(order {s.sort_order})</span>
                  </span>
                  <span className="flex gap-1">
                    <button type="button" className="rounded-lg border px-2 py-1 text-xs dark:border-line-dark" onClick={() => void moveStage(s.id, -1)} disabled={idx === 0}>
                      Up
                    </button>
                    <button
                      type="button"
                      className="rounded-lg border px-2 py-1 text-xs dark:border-line-dark"
                      onClick={() => void moveStage(s.id, 1)}
                      disabled={idx === (stagesQ.data ?? []).length - 1}
                    >
                      Down
                    </button>
                  </span>
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
            <h3 className="font-display font-semibold">Import candidates (Excel)</h3>
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

      <section>
        <h2 className="font-display font-semibold">Tasks for this role</h2>
        <p className="text-ink-muted mt-1 text-sm">
          To add a task, use the <span className="text-ink font-semibold">+</span> button in the bottom bar and choose <span className="text-ink font-medium">Add task</span>. Company and position are filled from this page automatically.
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
                  {(t as { candidates?: { full_name?: string } | null }).candidates?.full_name ? (
                    <span className="text-ink-muted"> · {(t as { candidates: { full_name: string } }).candidates.full_name}</span>
                  ) : null}
                </span>
                <button type="button" onClick={() => void deleteTask.mutateAsync(t.id)} className="text-red-600 text-xs font-semibold">
                  Remove
                </button>
              </li>
            ))
          )}
        </ul>
      </section>

      <Modal open={shareOpen} onClose={() => setShareOpen(false)} title="Share link" size="sm">
        <p className="text-ink-muted text-sm">Anyone with this link can view a summary (expires in 7 days).</p>
        <p className="mt-2 break-all rounded-lg bg-stone-100 p-2 text-xs dark:bg-stone-800">{shareUrl}</p>
      </Modal>
    </div>
  )
}

function ActivityIcon({ type }: { type: string }) {
  const cls = 'mt-0.5 h-8 w-8 shrink-0 rounded-lg bg-stone-100 p-1.5 dark:bg-stone-800'
  if (type === 'candidate_outcome_changed' || type === 'position_status_changed') return <PartyPopper className={cls} aria-hidden />
  if (type === 'candidate_reached_critical_stage') return <CheckCircle className={cls} aria-hidden />
  if (type === 'candidate_file_uploaded') return <FileText className={cls} aria-hidden />
  return <ChevronRight className={cls} aria-hidden />
}
