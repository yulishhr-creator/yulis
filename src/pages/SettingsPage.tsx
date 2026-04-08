import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import { List, Mail, Plug, Download, User } from 'lucide-react'

import { useAuth } from '@/auth/useAuth'
import { getSupabase } from '@/lib/supabase'
import { downloadCsv } from '@/lib/export'
import { PageHeader } from '@/components/ui/PageHeader'

const items = [
  { to: '/settings/profile', label: 'Profile & avatar', desc: 'Display name and how you appear in greetings.', icon: User },
  { to: '/settings/lists', label: 'Lists & dropdowns', desc: 'Industries, payment presets, and other options.', icon: List },
  { to: '/settings/email-templates', label: 'Email templates', desc: 'Subjects and bodies with {{variables}}.', icon: Mail },
  { to: '/settings/integrations', label: 'Integrations', desc: 'Connect Gmail to send from the app.', icon: Plug },
] as const

export function SettingsPage() {
  const { user } = useAuth()
  const supabase = getSupabase()
  const reduceMotion = useReducedMotion()

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

  return (
    <div className="flex flex-col gap-8">
      <PageHeader title="Settings" subtitle="Manage profile, lists, templates, and email." />

      <motion.section
        className="border-line bg-white/65 rounded-2xl border p-5 shadow-sm dark:border-line-dark dark:bg-stone-900/45"
        initial={reduceMotion ? false : { opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
      >
        <h2 className="font-display flex items-center gap-2 font-semibold">
          <Download className="h-5 w-5 text-accent dark:text-orange-300" aria-hidden />
          Export (full dataset)
        </h2>
        <p className="text-ink-muted mt-1 text-sm">Download CSV of all positions and candidates.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <motion.button
            type="button"
            className="border-line hover:border-accent rounded-full border px-4 py-2 text-sm font-medium transition dark:border-line-dark"
            whileHover={reduceMotion ? undefined : { scale: 1.02 }}
            whileTap={reduceMotion ? undefined : { scale: 0.98 }}
            onClick={() => {
              const rows = exportQ.data?.positions as Record<string, unknown>[] | undefined
              if (rows?.length) downloadCsv('positions.csv', rows)
            }}
          >
            Positions CSV
          </motion.button>
          <motion.button
            type="button"
            className="border-line hover:border-accent rounded-full border px-4 py-2 text-sm font-medium transition dark:border-line-dark"
            whileHover={reduceMotion ? undefined : { scale: 1.02 }}
            whileTap={reduceMotion ? undefined : { scale: 0.98 }}
            onClick={() => {
              const rows = exportQ.data?.candidates as Record<string, unknown>[] | undefined
              if (rows?.length) downloadCsv('candidates.csv', rows)
            }}
          >
            Candidates CSV
          </motion.button>
        </div>
      </motion.section>

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
              className="border-line bg-white/70 hover:border-accent/50 group flex gap-4 rounded-2xl border px-4 py-4 shadow-sm transition-all hover:shadow-md dark:border-line-dark dark:bg-stone-900/50"
            >
              <span className="bg-accent-soft/80 text-accent group-hover:bg-accent/15 flex h-12 w-12 shrink-0 items-center justify-center rounded-xl transition dark:bg-stone-800 dark:text-orange-300 dark:group-hover:bg-orange-400/15">
                <Icon className="h-6 w-6" aria-hidden />
              </span>
              <div>
                <p className="font-display font-semibold">{label}</p>
                <p className="text-ink-muted text-sm dark:text-stone-400">{desc}</p>
              </div>
            </Link>
          </motion.li>
        ))}
      </ul>
    </div>
  )
}
