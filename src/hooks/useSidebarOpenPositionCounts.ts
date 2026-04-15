import { useQuery } from '@tanstack/react-query'

import { useAuth } from '@/auth/useAuth'
import { getSupabase } from '@/lib/supabase'

/** Open pipeline positions (active + on hold) for sidebar badges; invalidated with `['positions']`. */
export function useSidebarOpenPositionCounts() {
  const { user } = useAuth()
  const supabase = getSupabase()

  return useQuery({
    queryKey: ['positions', 'sidebar-open-counts', user?.id],
    enabled: Boolean(supabase && user?.id),
    queryFn: async () => {
      const { data, error } = await supabase!
        .from('positions')
        .select('company_id')
        .eq('user_id', user!.id)
        .is('deleted_at', null)
        .in('status', ['active', 'on_hold'])
      if (error) throw error
      const byCompany: Record<string, number> = {}
      let total = 0
      for (const row of data ?? []) {
        total += 1
        const cid = row.company_id as string
        byCompany[cid] = (byCompany[cid] ?? 0) + 1
      }
      return { total, byCompany }
    },
  })
}
