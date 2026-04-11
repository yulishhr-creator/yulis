import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Banknote } from 'lucide-react'

import { useAuth } from '@/auth/useAuth'
import { getSupabase } from '@/lib/supabase'
import { ScreenHeader } from '@/components/layout/ScreenHeader'

/** Hub under Settings: jump to fee & milestone editor for any role. */
export function PositionFeesListPage() {
  const { user } = useAuth()
  const supabase = getSupabase()

  const q = useQuery({
    queryKey: ['positions', user?.id, 'fees-list'],
    enabled: Boolean(supabase && user),
    queryFn: async () => {
      const { data, error } = await supabase!
        .from('positions')
        .select('id, title, status, planned_fee_ils, actual_fee_ils, companies ( name )')
        .eq('user_id', user!.id)
        .is('deleted_at', null)
        .order('updated_at', { ascending: false })
      if (error) throw error
      return data ?? []
    },
  })

  const rows = q.data ?? []

  return (
    <div className="flex flex-col gap-6">
      <ScreenHeader
        title="Position fees & milestones"
        subtitle="Planned and actual fees (₪) and critical-stage threshold per role."
        backTo="/settings"
      />
      {q.isLoading ? (
        <p className="text-ink-muted text-sm">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-ink-muted text-sm">No positions yet.</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((p) => {
            const co = p.companies as unknown as { name: string } | null
            return (
              <li key={p.id as string}>
                <Link
                  to={`/settings/positions/${p.id}/fees`}
                  className="border-line bg-white/60 flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 transition hover:bg-white/90 dark:border-line-dark dark:bg-stone-900/40 dark:hover:bg-stone-900/70"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-[#302e2b] dark:text-stone-100">{p.title as string}</p>
                    <p className="text-ink-muted truncate text-xs dark:text-stone-500">
                      {co?.name ?? '—'} · {(p.status as string)?.replace('_', ' ')}
                      {p.planned_fee_ils != null ? ` · planned ₪${p.planned_fee_ils}` : ''}
                      {p.actual_fee_ils != null ? ` · actual ₪${p.actual_fee_ils}` : ''}
                    </p>
                  </div>
                  <span className="text-accent flex shrink-0 items-center gap-1 text-sm font-semibold dark:text-orange-300">
                    <Banknote className="h-4 w-4" aria-hidden />
                    Edit
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
