import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import { List, Mail, Download, User, Archive, Clock, Banknote } from 'lucide-react'
import { useMemo, useState } from 'react'
import { format } from 'date-fns'
import JSZip from 'jszip'

import { useAuth } from '@/auth/useAuth'
import { getSupabase } from '@/lib/supabase'
import { downloadCsv, downloadXlsx } from '@/lib/export'
import { formatWorkedDuration } from '@/lib/formatWorkedDuration'
import { ScreenHeader } from '@/components/layout/ScreenHeader'
import { useToast } from '@/hooks/useToast'

type WorkEntryRow = {
  id: string
  started_at: string
  duration_seconds: number | null
  positions: {
    title: string
    companies: { name: string } | null
  } | null
}

const items = [
  { to: '/settings/profile', label: 'Profile & avatar', desc: 'Display name, photo, and how you appear in greetings.', icon: User },
  { to: '/settings/position-fees', label: 'Position fees & milestones', desc: 'Planned and actual fees (₪) and critical-stage threshold per role.', icon: Banknote },
  { to: '/settings/lists', label: 'Lists & dropdowns', desc: 'Industries, payment presets, and other options.', icon: List },
  { to: '/settings/email-templates', label: 'Email templates', desc: 'Subjects and bodies with {{variables}}.', icon: Mail },
] as const

const DATASET_EXPORT_OPTIONS = [
  { value: 'positions_csv', label: 'Positions — CSV' },
  { value: 'candidates_csv', label: 'Candidates — CSV' },
  { value: 'positions_xlsx', label: 'Positions — XLSX' },
  { value: 'candidates_xlsx', label: 'Candidates — XLSX' },
] as const

type DatasetExportValue = (typeof DATASET_EXPORT_OPTIONS)[number]['value']

export function SettingsPage() {
  const { user } = useAuth()
  const supabase = getSupabase()
  const reduceMotion = useReducedMotion()
  const { success, error: toastError } = useToast()
  const [gdprBusy, setGdprBusy] = useState(false)
  const [datasetExport, setDatasetExport] = useState<DatasetExportValue>('positions_csv')

  const exportQ = useQuery({
    queryKey: ['export-preview', user?.id],
    enabled: Boolean(supabase && user),
    queryFn: async () => {
      const [p, c] = await Promise.all([
        supabase!.from('positions').select('id, title, status, company_id, planned_fee_ils, actual_fee_ils, created_at').eq('user_id', user!.id),
        supabase!.from('candidates').select('id, full_name, email, status, created_at').eq('user_id', user!.id),
      ])
      return { positions: p.data ?? [], candidates: c.data ?? [] }
    },
  })

  const workRecentQ = useQuery({
    queryKey: ['work-time-entries', 'settings-recent', user?.id],
    enabled: Boolean(supabase && user),
    queryFn: async () => {
      const { data, error } = await supabase!
        .from('work_time_entries')
        .select('id, started_at, duration_seconds, positions ( title, companies ( name ) )')
        .eq('user_id', user!.id)
        .not('ended_at', 'is', null)
        .order('started_at', { ascending: false })
        .limit(40)
      if (error) throw error
      return (data ?? []) as unknown as WorkEntryRow[]
    },
  })

  const workEntries = workRecentQ.data ?? []

  const workRecentTotalSeconds = useMemo(
    () => workEntries.reduce((acc, row) => acc + (row.duration_seconds ?? 0), 0),
    [workEntries],
  )

  const pos = exportQ.data?.positions as Record<string, unknown>[] | undefined
  const cand = exportQ.data?.candidates as Record<string, unknown>[] | undefined

  function runDatasetExport() {
    switch (datasetExport) {
      case 'positions_csv':
        if (pos?.length) downloadCsv('positions.csv', pos)
        else toastError('No positions to export')
        return
      case 'candidates_csv':
        if (cand?.length) downloadCsv('candidates.csv', cand)
        else toastError('No candidates to export')
        return
      case 'positions_xlsx':
        if (pos?.length) downloadXlsx('positions.xlsx', pos)
        else toastError('No positions to export')
        return
      case 'candidates_xlsx':
        if (cand?.length) downloadXlsx('candidates.xlsx', cand)
        else toastError('No candidates to export')
        return
    }
  }

  async function downloadGdprZip() {
    if (!supabase || !user) return
    setGdprBusy(true)
    try {
      const uid = user.id
      const zip = new JSZip()
      zip.file(
        'manifest.json',
        JSON.stringify({ exportedAt: new Date().toISOString(), app: "Yuli's HR", user_id: uid }, null, 2),
      )
      const tables = [
        'companies',
        'positions',
        'position_stages',
        'candidates',
        'tasks',
        'reminders',
        'candidate_import_batches',
        'email_templates',
        'list_items',
        'activity_events',
        'calendar_events',
        'work_time_entries',
        'candidate_share_tokens',
        'position_public_list_tokens',
        'position_candidates',
        'position_candidate_transitions',
        'task_templates',
        'user_oauth_integrations',
      ] as const
      for (const name of tables) {
        const { data, error } = await supabase.from(name).select('*').eq('user_id', uid)
        if (error) throw new Error(error.message)
        zip.file(`${name}.json`, JSON.stringify(data ?? [], null, 2))
      }
      const blob = await zip.generateAsync({ type: 'blob' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `yulis-my-data-${format(new Date(), 'yyyy-MM-dd')}.zip`
      a.click()
      URL.revokeObjectURL(url)
      success('ZIP export started')
    } catch (e) {
      toastError(e instanceof Error ? e.message : 'Export failed')
    } finally {
      setGdprBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <ScreenHeader title="Settings" subtitle="Manage profile, lists, templates, and exports." backTo="/" />

      <ul className="space-y-3">
        {items.map(({ to, label, desc, icon: Icon }, i) => (
          <motion.li
            key={to}
            initial={reduceMotion ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: reduceMotion ? 0 : i * 0.05 }}
          >
            <Link
              to={to}
              className="border-stitch-on-surface/10 group flex gap-4 rounded-2xl border bg-white/80 px-4 py-4 shadow-sm transition-all hover:border-[#fd8863]/40 hover:shadow-md dark:border-stone-700 dark:bg-stone-900/60"
            >
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#fd8863]/25 to-[#97daff]/30 text-[#9b3e20] dark:from-orange-500/20 dark:to-cyan-500/20 dark:text-orange-300">
                <Icon className="h-6 w-6" aria-hidden />
              </span>
              <div>
                <p className="font-bold text-[#302e2b] dark:text-stone-100">{label}</p>
                <p className="text-stitch-muted text-sm dark:text-stone-400">{desc}</p>
              </div>
            </Link>
          </motion.li>
        ))}
      </ul>

      <motion.section
        className="border-stitch-on-surface/10 rounded-3xl border bg-white/85 p-5 shadow-sm dark:border-stone-700 dark:bg-stone-900/60"
        initial={reduceMotion ? false : { opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-extrabold text-[#302e2b] dark:text-stone-100">
              <Clock className="h-5 w-5 text-[#006384] dark:text-cyan-300" aria-hidden />
              Work effort
            </h2>
            <p className="text-stitch-muted mt-1 text-sm dark:text-stone-400">
              Recent tracked sessions (newest first). Totals below are for this list only — open Working time for date filters.
            </p>
          </div>
          <Link
            to="/time"
            className="text-accent shrink-0 text-sm font-bold underline dark:text-orange-300"
          >
            Working time →
          </Link>
        </div>

        <p className="text-stitch-muted mt-3 text-sm tabular-nums dark:text-stone-400">
          <span className="font-semibold text-[#302e2b] dark:text-stone-200">Worked (this list):</span>{' '}
          <span className="font-bold text-[#9b3e20] dark:text-orange-300">{formatWorkedDuration(workRecentTotalSeconds)}</span>
          <span className="text-stitch-muted"> · {workEntries.length} sessions</span>
        </p>

        {workRecentQ.isLoading ? (
          <p className="text-stitch-muted mt-4 text-sm">Loading sessions…</p>
        ) : workEntries.length === 0 ? (
          <p className="text-stitch-muted mt-4 text-sm">No completed sessions yet. Start a timer from the home screen.</p>
        ) : (
          <>
            <h3 className="mt-5 text-base font-extrabold text-[#302e2b] dark:text-stone-100">Recent activity</h3>
            <ul className="mt-3 space-y-2">
              {workEntries.map((row) => {
                const title = row.positions?.title ?? 'Role'
                const company = row.positions?.companies?.name?.trim() || 'No company'
                const dur = row.duration_seconds ?? 0
                return (
                  <li
                    key={row.id}
                    className="border-line flex flex-wrap items-baseline justify-between gap-2 rounded-xl border bg-stone-50/80 px-3 py-2.5 text-sm dark:border-line-dark dark:bg-stone-800/50"
                  >
                    <div className="min-w-0">
                      <span className="font-medium">{title}</span>
                      <span className="text-ink-muted block text-xs dark:text-stone-400">{company}</span>
                    </div>
                    <div className="text-ink-muted shrink-0 text-right text-xs tabular-nums dark:text-stone-400">
                      <div>{format(new Date(row.started_at), 'MMM d, HH:mm')}</div>
                      <div className="mt-0.5 font-semibold text-[#9b3e20] dark:text-orange-300">worked: {formatWorkedDuration(dur)}</div>
                    </div>
                  </li>
                )
              })}
            </ul>
          </>
        )}
      </motion.section>

      <motion.section
        className="border-stitch-on-surface/10 rounded-3xl border bg-gradient-to-br from-white to-[#97daff]/10 p-5 shadow-[0_20px_48px_rgba(48,46,43,0.08)] dark:border-stone-700 dark:from-stone-900 dark:to-cyan-950/30"
        initial={reduceMotion ? false : { opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
      >
        <h2 className="flex items-center gap-2 text-lg font-extrabold text-[#302e2b] dark:text-stone-100">
          <Download className="h-5 w-5 text-[#9b3e20] dark:text-orange-300" aria-hidden />
          Export (full dataset)
        </h2>
        <p className="text-stitch-muted mt-1 text-sm">CSV and XLSX for positions and candidates.</p>
        <div className="mt-4 flex max-w-md flex-col gap-3 sm:flex-row sm:items-end">
          <label className="min-w-0 flex-1 text-sm font-medium">
            Export format
            <select
              value={datasetExport}
              onChange={(e) => setDatasetExport(e.target.value as DatasetExportValue)}
              className="border-line bg-white/90 mt-1 w-full rounded-xl border px-3 py-2.5 dark:border-line-dark dark:bg-stone-900/50"
            >
              {DATASET_EXPORT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
          <motion.button
            type="button"
            onClick={() => runDatasetExport()}
            className="bg-accent text-stone-50 shrink-0 rounded-full px-6 py-2.5 text-sm font-bold shadow-md dark:bg-orange-600"
            whileHover={reduceMotion ? undefined : { scale: 1.02 }}
            whileTap={reduceMotion ? undefined : { scale: 0.98 }}
          >
            Export
          </motion.button>
        </div>
      </motion.section>

      <motion.section
        className="border-stitch-on-surface/10 rounded-3xl border bg-white/80 p-5 shadow-sm dark:border-stone-700 dark:bg-stone-900/60"
        initial={reduceMotion ? false : { opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
      >
        <h2 className="flex items-center gap-2 text-lg font-extrabold text-[#302e2b] dark:text-stone-100">
          <Archive className="h-5 w-5 text-[#006384] dark:text-cyan-300" aria-hidden />
          Download my data (GDPR-style)
        </h2>
        <p className="text-stitch-muted mt-1 text-sm">
          ZIP of JSON files for all tables owned by your account (companies, positions, candidates, tasks, reminders, activity, time
          entries, and more).
        </p>
        <button
          type="button"
          disabled={gdprBusy || !user}
          onClick={() => void downloadGdprZip()}
          className="mt-4 rounded-full bg-gradient-to-r from-[#006384] to-[#97daff] px-5 py-2.5 text-sm font-bold text-white shadow-md disabled:opacity-50 dark:from-cyan-800 dark:to-cyan-600"
        >
          {gdprBusy ? 'Preparing…' : 'Download ZIP'}
        </button>
      </motion.section>
    </div>
  )
}
