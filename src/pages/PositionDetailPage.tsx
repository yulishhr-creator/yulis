import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { useEffect, useState } from 'react'
import * as XLSX from 'xlsx'

import { useAuth } from '@/auth/useAuth'
import { getSupabase } from '@/lib/supabase'
import { normalizeEmail, normalizePhone } from '@/lib/normalize'
import { formatDue } from '@/lib/dates'
import { buildMailto } from '@/lib/mailto'

export function PositionDetailPage() {
  const { id } = useParams()
  const { user } = useAuth()
  const supabase = getSupabase()
  const qc = useQueryClient()
  const [search] = useSearchParams()
  const highlightCandidate = search.get('candidate')

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
      return data ?? []
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

  const position = posQ.data
  const company = position?.companies as unknown as { id: string; name: string; contact_email: string | null } | undefined

  const [title, setTitle] = useState('')
  const [requirements, setRequirements] = useState('')
  const [welcome1, setWelcome1] = useState('')
  const [status, setStatus] = useState('pending')
  const [planned, setPlanned] = useState('')
  const [actual, setActual] = useState('')

  useEffect(() => {
    if (!position) return
    setTitle(position.title ?? '')
    setRequirements(position.requirements ?? '')
    setWelcome1(position.welcome_1 ?? '')
    setStatus(position.status ?? 'pending')
    setPlanned(position.planned_fee_ils != null ? String(position.planned_fee_ils) : '')
    setActual(position.actual_fee_ils != null ? String(position.actual_fee_ils) : '')
  }, [position])

  const savePos = useMutation({
    mutationFn: async () => {
      const { error } = await supabase!
        .from('positions')
        .update({
          title: title.trim() || 'Untitled',
          requirements: requirements.trim() || null,
          welcome_1: welcome1.trim() || null,
          status,
          planned_fee_ils: planned ? Number(planned) : null,
          actual_fee_ils: actual ? Number(actual) : null,
        })
        .eq('id', id!)
        .eq('user_id', user!.id)
      if (error) throw error
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['position', id] })
      await qc.invalidateQueries({ queryKey: ['positions'] })
      await qc.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })

  const [newStageName, setNewStageName] = useState('')

  const addStage = useMutation({
    mutationFn: async () => {
      const order = (stagesQ.data?.length ?? 0)
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
      await qc.invalidateQueries({ queryKey: ['position-stages', id] })
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
        const externals = (candidatesQ.data ?? []).filter((c) => c.source === 'external')
        const hit = externals.find((c) => {
          if (en && c.email_normalized && c.email_normalized === en) return true
          if (pn && c.phone_normalized && c.phone_normalized === pn) return true
          return false
        })
        if (hit) {
          const ok = window.confirm(
            `This matches imported candidate “${hit.full_name}”. Create another record anyway?`,
          )
          if (!ok) throw new Error('cancelled')
        }
      }
      const firstStage = stagesQ.data?.[0]?.id ?? null
      const { error } = await supabase!.from('candidates').insert({
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
      })
      if (error) throw error
    },
    onSuccess: async () => {
      setCName('')
      setCEmail('')
      setCPhone('')
      await qc.invalidateQueries({ queryKey: ['position-candidates', id] })
    },
    onError: (e) => {
      if ((e as Error).message === 'cancelled') return
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
  }

  const [taskTitle, setTaskTitle] = useState('')
  const [taskDue, setTaskDue] = useState('')

  const addTask = useMutation({
    mutationFn: async () => {
      const { error } = await supabase!.from('tasks').insert({
        user_id: user!.id,
        position_id: id!,
        title: taskTitle.trim() || 'Task',
        status: 'todo',
        due_at: taskDue ? new Date(taskDue).toISOString() : null,
      })
      if (error) throw error
    },
    onSuccess: async () => {
      setTaskTitle('')
      setTaskDue('')
      await qc.invalidateQueries({ queryKey: ['position-tasks', id] })
      await qc.invalidateQueries({ queryKey: ['dashboard-tasks'] })
    },
  })

  if (posQ.isLoading || !position) {
    return <p className="text-ink-muted text-sm">Loading…</p>
  }

  return (
    <div className="flex flex-col gap-10">
      <div>
        <p className="text-ink-muted text-sm">
          <Link to="/positions" className="hover:underline">
            Positions
          </Link>
          {company ? <span> · {company.name}</span> : null}
        </p>
        <h1 className="font-display mt-2 text-2xl font-semibold">{position.title}</h1>
      </div>

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
          <label className="text-sm font-medium">
            Status
            <select value={status} onChange={(e) => setStatus(e.target.value)} className="border-line mt-1 w-full rounded-xl border px-3 py-2 dark:border-line-dark dark:bg-stone-900/50">
              {['pending', 'in_progress', 'success', 'cancelled'].map((s) => (
                <option key={s} value={s}>
                  {s.replace('_', ' ')}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-medium">
            Requirements
            <textarea value={requirements} onChange={(e) => setRequirements(e.target.value)} rows={4} className="border-line mt-1 w-full rounded-xl border px-3 py-2 dark:border-line-dark dark:bg-stone-900/50" />
          </label>
          <label className="text-sm font-medium">
            Welcome approach (1)
            <textarea value={welcome1} onChange={(e) => setWelcome1(e.target.value)} rows={3} className="border-line mt-1 w-full rounded-xl border px-3 py-2 dark:border-line-dark dark:bg-stone-900/50" />
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
          <button type="submit" className="bg-accent text-stone-50 w-fit rounded-full px-5 py-2 text-sm font-semibold" disabled={savePos.isPending}>
            Save
          </button>
        </form>
      </section>

      <section>
        <h2 className="font-display font-semibold">Recruitment stages</h2>
        <ul className="mt-3 space-y-2">
          {(stagesQ.data ?? []).map((s, idx) => (
            <li key={s.id} className="border-line bg-white/60 flex items-center justify-between gap-2 rounded-xl border px-3 py-2 dark:border-line-dark dark:bg-stone-900/40">
              <span>{s.name}</span>
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
      </section>

      <section>
        <h2 className="font-display font-semibold">Import candidates (Excel)</h2>
        <p className="text-ink-muted mt-1 text-sm">Columns should include name, email, phone (headers detected automatically).</p>
        <input
          type="file"
          accept=".xlsx,.xls"
          className="mt-2 text-sm"
          onChange={(e) => void onExcel(e.target.files?.[0] ?? null)}
        />
        {importError ? <p className="mt-2 text-sm text-amber-700 dark:text-amber-400">{importError}</p> : null}
      </section>

      <section>
        <h2 className="font-display font-semibold">Candidates</h2>
        <form
          className="border-line bg-white/60 mt-3 grid gap-2 rounded-2xl border p-4 dark:border-line-dark dark:bg-stone-900/40 sm:grid-cols-2"
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

        <ul className="mt-4 space-y-2">
          {(candidatesQ.data ?? []).map((c) => {
            const st = c.position_stages as unknown as { name: string } | null
            const hl = highlightCandidate === c.id
            return (
              <li
                key={c.id}
                id={`cand-${c.id}`}
                className={`border-line bg-white/60 flex flex-wrap items-baseline justify-between gap-2 rounded-xl border px-3 py-2 dark:border-line-dark dark:bg-stone-900/40 ${hl ? 'ring-accent ring-2' : ''}`}
              >
                <span className="font-medium">{c.full_name}</span>
                <span className="text-ink-muted text-xs">
                  {c.source} · {st?.name ?? '—'} · {c.outcome}
                </span>
              </li>
            )
          })}
        </ul>
      </section>

      <section>
        <h2 className="font-display font-semibold">Tasks</h2>
        <form
          className="mt-3 flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            void addTask.mutateAsync()
          }}
        >
          <input
            value={taskTitle}
            onChange={(e) => setTaskTitle(e.target.value)}
            placeholder="Task title"
            className="border-line min-w-[12rem] flex-1 rounded-xl border px-3 py-2 dark:border-line-dark dark:bg-stone-900/50"
            required
          />
          <input type="datetime-local" value={taskDue} onChange={(e) => setTaskDue(e.target.value)} className="border-line rounded-xl border px-3 py-2 dark:border-line-dark dark:bg-stone-900/50" />
          <button type="submit" className="bg-ink/90 text-paper rounded-full px-4 py-2 text-sm font-medium dark:bg-stone-200 dark:text-stone-900">
            Add task
          </button>
        </form>
        <ul className="mt-3 space-y-2">
          {(tasksQ.data ?? []).map((t) => (
            <li key={t.id} className="border-line bg-white/60 rounded-xl border px-3 py-2 text-sm dark:border-line-dark dark:bg-stone-900/40">
              {t.title} · {t.status}
              {t.due_at ? <span className="text-ink-muted"> · due {formatDue(t.due_at)}</span> : null}
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="font-display font-semibold">Email</h2>
        <p className="text-ink-muted mt-1 text-sm">Opens your mail client with company or candidate prefilled (Gmail API connect comes in Settings).</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {company?.contact_email ? (
            <a
              href={buildMailto({
                to: company.contact_email,
                subject: `Re: ${position.title}`,
                body: 'Hi,\n\n',
              })}
              className="border-line inline-flex rounded-full border px-4 py-2 text-sm font-medium dark:border-line-dark"
            >
              Email company
            </a>
          ) : null}
        </div>
      </section>
    </div>
  )
}
