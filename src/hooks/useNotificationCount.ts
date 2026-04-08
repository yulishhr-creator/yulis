import { useQuery } from '@tanstack/react-query'

import { useAuth } from '@/auth/useAuth'
import { getSupabase } from '@/lib/supabase'

/** Reminders + overdue tasks (with due_at set), for badge in shell. */
export function useNotificationCount() {
  const { user } = useAuth()
  const supabase = getSupabase()

  return useQuery({
    queryKey: ['notification-count', user?.id],
    enabled: Boolean(supabase && user),
    queryFn: async () => {
      const uid = user!.id
      const now = new Date().toISOString()
      const [rem, ovr] = await Promise.all([
        supabase!.from('reminders').select('*', { count: 'exact', head: true }).eq('user_id', uid),
        supabase!
          .from('tasks')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', uid)
          .neq('status', 'done')
          .not('due_at', 'is', null)
          .lt('due_at', now),
      ])
      return (rem.count ?? 0) + (ovr.count ?? 0)
    },
  })
}
