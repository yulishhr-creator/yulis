import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'

import { useAuth } from '@/auth/useAuth'
import { getSupabase } from '@/lib/supabase'
import { ScreenHeader } from '@/components/layout/ScreenHeader'

export function CompaniesPage() {
  const { user } = useAuth()
  const supabase = getSupabase()

  const q = useQuery({
    queryKey: ['companies', user?.id],
    enabled: Boolean(supabase && user),
    queryFn: async () => {
      const { data, error } = await supabase!
        .from('companies')
        .select('id, name, contact_email, created_at')
        .eq('user_id', user!.id)
        .is('deleted_at', null)
        .order('name')
      if (error) throw error
      return data ?? []
    },
  })

  return (
    <div className="flex flex-col gap-6">
      <ScreenHeader
        title="Companies"
        subtitle="Clients you recruit for."
        backTo="/"
        right={
          <Link
            to="/companies/new"
            className="rounded-full bg-gradient-to-r from-[#9b3e20] to-[#fd8863] px-4 py-2 text-sm font-bold text-white shadow-md"
          >
            Add
          </Link>
        }
      />

      {q.isLoading ? (
        <p className="text-ink-muted text-sm">Loading…</p>
      ) : (q.data ?? []).length === 0 ? (
        <p className="text-ink-muted text-sm">No companies yet. Add your first client.</p>
      ) : (
        <ul className="space-y-2">
          {(q.data ?? []).map((c) => (
            <li key={c.id}>
              <Link
                to={`/companies/${c.id}`}
                className="border-line bg-white/70 hover:border-accent flex flex-col rounded-2xl border px-4 py-4 transition-colors dark:border-line-dark dark:bg-stone-900/45 dark:hover:border-orange-400/40"
              >
                <span className="font-display font-semibold">{c.name}</span>
                {c.contact_email ? <span className="text-ink-muted text-sm">{c.contact_email}</span> : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
