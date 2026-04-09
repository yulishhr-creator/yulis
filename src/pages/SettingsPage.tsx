import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import { List, Mail, Download, User, FileJson, FileSpreadsheet, Archive } from 'lucide-react'
import { useState } from 'react'
import { format } from 'date-fns'
import JSZip from 'jszip'

import { useAuth } from '@/auth/useAuth'
import { getSupabase } from '@/lib/supabase'
import { downloadCsv, downloadJson, downloadXlsx } from '@/lib/export'
import { ScreenHeader } from '@/components/layout/ScreenHeader'
import { useToast } from '@/hooks/useToast'

const items = [
  { to: '/settings/profile', label: 'Profile & avatar', desc: 'Display name, photo, and how you appear in greetings.', icon: User },
  { to: '/settings/lists', label: 'Lists & dropdowns', desc: 'Industries, payment presets, and other options.', icon: List },
  { to: '/settings/email-templates', label: 'Email templates', desc: 'Subjects and bodies with {{variables}}.', icon: Mail },
] as const

export function SettingsPage() {
  const { user } = useAuth()
  const supabase = getSupabase()
  const reduceMotion = useReducedMotion()
  const { success, error: toastError } = useToast()
  const [gdprBusy, setGdprBusy] = useState(false)

  const exportQ = useQuery({
    queryKey: ['export-preview', user?.id],
    enabled: Boolean(supabase && user),
    queryFn: async () => {
      const [p, c] = await Promise.all([
        supabase!.from('positions').select('id, title, status, company_id, planned_fee_ils, actual_fee_ils, created_at').eq('user_id', user!.id),
        supabase!.from('candidates').select('id, full_name, email, source, outcome, position_id, created_at').eq('user_id', user!.id),
      ])
      return { positions: p.data ?? [], candidates: c.data ?? [] }
    },
  })

  const pos = exportQ.data?.positions as Record<string, unknown>[] | undefined
  const cand = exportQ.data?.candidates as Record<string, unknown>[] | undefined

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
                <p className="font-stitch-head font-bold text-[#302e2b] dark:text-stone-100">{label}</p>
                <p className="text-stitch-muted text-sm dark:text-stone-400">{desc}</p>
              </div>
            </Link>
          </motion.li>
        ))}
      </ul>

      <motion.section
        className="border-stitch-on-surface/10 rounded-3xl border bg-gradient-to-br from-white to-[#97daff]/10 p-5 shadow-[0_20px_48px_rgba(48,46,43,0.08)] dark:border-stone-700 dark:from-stone-900 dark:to-cyan-950/30"
        initial={reduceMotion ? false : { opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
      >
        <h2 className="font-stitch-head flex items-center gap-2 text-lg font-extrabold text-[#302e2b] dark:text-stone-100">
          <Download className="h-5 w-5 text-[#9b3e20] dark:text-orange-300" aria-hidden />
          Export (full dataset)
        </h2>
        <p className="text-stitch-muted mt-1 text-sm">Phase 1 plan: CSV + JSON + XLSX for positions and candidates.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <motion.button
            type="button"
            className="rounded-full border border-[#b4fdb4]/60 bg-white px-4 py-2 text-sm font-bold text-[#165c25] shadow-sm dark:border-emerald-900 dark:bg-stone-800 dark:text-emerald-300"
            whileHover={reduceMotion ? undefined : { scale: 1.02 }}
            whileTap={reduceMotion ? undefined : { scale: 0.98 }}
            onClick={() => {
              if (pos?.length) downloadCsv('positions.csv', pos)
            }}
          >
            Positions CSV
          </motion.button>
          <motion.button
            type="button"
            className="rounded-full border border-[#b4fdb4]/60 bg-white px-4 py-2 text-sm font-bold text-[#165c25] shadow-sm dark:border-emerald-900 dark:bg-stone-800 dark:text-emerald-300"
            whileHover={reduceMotion ? undefined : { scale: 1.02 }}
            whileTap={reduceMotion ? undefined : { scale: 0.98 }}
            onClick={() => {
              if (cand?.length) downloadCsv('candidates.csv', cand)
            }}
          >
            Candidates CSV
          </motion.button>
          <motion.button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-full border border-[#97daff]/60 bg-white px-4 py-2 text-sm font-bold text-[#006384] shadow-sm dark:border-cyan-800 dark:bg-stone-800 dark:text-cyan-300"
            whileHover={reduceMotion ? undefined : { scale: 1.02 }}
            whileTap={reduceMotion ? undefined : { scale: 0.98 }}
            onClick={() => {
              if (pos?.length || cand?.length)
                downloadJson('yulis-export.json', { positions: pos ?? [], candidates: cand ?? [], exportedAt: new Date().toISOString() })
            }}
          >
            <FileJson className="h-4 w-4" aria-hidden />
            JSON bundle
          </motion.button>
          <motion.button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-full border border-[#fd8863]/50 bg-white px-4 py-2 text-sm font-bold text-[#9b3e20] shadow-sm dark:border-orange-800 dark:bg-stone-800 dark:text-orange-300"
            whileHover={reduceMotion ? undefined : { scale: 1.02 }}
            whileTap={reduceMotion ? undefined : { scale: 0.98 }}
            onClick={() => {
              if (pos?.length) downloadXlsx('positions.xlsx', pos)
            }}
          >
            <FileSpreadsheet className="h-4 w-4" aria-hidden />
            Positions XLSX
          </motion.button>
          <motion.button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-full border border-[#fd8863]/50 bg-white px-4 py-2 text-sm font-bold text-[#9b3e20] shadow-sm dark:border-orange-800 dark:bg-stone-800 dark:text-orange-300"
            whileHover={reduceMotion ? undefined : { scale: 1.02 }}
            whileTap={reduceMotion ? undefined : { scale: 0.98 }}
            onClick={() => {
              if (cand?.length) downloadXlsx('candidates.xlsx', cand)
            }}
          >
            <FileSpreadsheet className="h-4 w-4" aria-hidden />
            Candidates XLSX
          </motion.button>
        </div>
      </motion.section>

      <motion.section
        className="border-stitch-on-surface/10 rounded-3xl border bg-white/80 p-5 shadow-sm dark:border-stone-700 dark:bg-stone-900/60"
        initial={reduceMotion ? false : { opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
      >
        <h2 className="font-stitch-head flex items-center gap-2 text-lg font-extrabold text-[#302e2b] dark:text-stone-100">
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
