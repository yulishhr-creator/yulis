import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { List, Mail, Plug, Download } from 'lucide-react'

import { useAuth } from '@/auth/useAuth'
import { getSupabase } from '@/lib/supabase'
import { downloadCsv } from '@/lib/export'

const items = [
  { to: '/settings/lists', label: 'Lists & dropdowns', desc: 'Industries, payment presets, and other options.', icon: List },
  { to: '/settings/email-templates', label: 'Email templates', desc: 'Subjects and bodies with {{variables}}.', icon: Mail },
  { to: '/settings/integrations', label: 'Integrations', desc: 'Connect Gmail to send from the app.', icon: Plug },
] as const

export function SettingsPage() {
  const { user } = useAuth()
  const supabase = getSupabase()

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
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl font-semibold">Settings</h1>
        <p className="text-ink-muted mt-1 text-sm dark:text-stone-400">Manage lists, templates, and email.</p>
      </div>

      <section className="border-line bg-white/60 rounded-2xl border p-4 dark:border-line-dark dark:bg-stone-900/40">
        <h2 className="font-display flex items-center gap-2 font-semibold">
          <Download className="h-5 w-5" aria-hidden />
          Export (full dataset)
        </h2>
        <p className="text-ink-muted mt-1 text-sm">Download CSV of all positions and candidates.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            className="border-line rounded-full border px-4 py-2 text-sm font-medium dark:border-line-dark"
            onClick={() => {
              const rows = exportQ.data?.positions as Record<string, unknown>[] | undefined
              if (rows?.length) downloadCsv('positions.csv', rows)
            }}
          >
            Positions CSV
          </button>
          <button
            type="button"
            className="border-line rounded-full border px-4 py-2 text-sm font-medium dark:border-line-dark"
            onClick={() => {
              const rows = exportQ.data?.candidates as Record<string, unknown>[] | undefined
              if (rows?.length) downloadCsv('candidates.csv', rows)
            }}
          >
            Candidates CSV
          </button>
        </div>
      </section>

      <ul className="space-y-2">
        {items.map(({ to, label, desc, icon: Icon }) => (
          <li key={to}>
            <Link
              to={to}
              className="border-line bg-white/70 hover:border-accent flex gap-4 rounded-2xl border px-4 py-4 dark:border-line-dark dark:bg-stone-900/45"
            >
              <Icon className="text-accent mt-0.5 h-6 w-6 shrink-0 dark:text-orange-300" aria-hidden />
              <div>
                <p className="font-display font-semibold">{label}</p>
                <p className="text-ink-muted text-sm dark:text-stone-400">{desc}</p>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
