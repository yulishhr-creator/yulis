import { useQuery } from '@tanstack/react-query'

import { useAuth } from '@/auth/useAuth'
import { getSupabase } from '@/lib/supabase'

/** Reminders + overdue tasks + calendar events starting within the next 48 hours. */
export function useNotificationCount() {
  const { user } = useAuth()
  const supabase = getSupabase()

  return useQuery({
    queryKey: ['notification-count', user?.id],
    enabled: Boolean(supabase && user),
    queryFn: async () => {
      const uid = user!.id
      const now = new Date()
      const nowIso = now.toISOString()
      const horizon = new Date(now.getTime() + 48 * 3600 * 1000).toISOString()
      const [rem, ovr, cal] = await Promise.all([
        supabase!.from('reminders').select('*', { count: 'exact', head: true }).eq('user_id', uid),
        supabase!
          .from('tasks')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', uid)
          .neq('status', 'done')
          .not('due_at', 'is', null)
          .lt('due_at', nowIso),
        supabase!
          .from('calendar_events')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', uid)
          .gte('starts_at', nowIso)
          .lte('starts_at', horizon),
      ])
      return (rem.count ?? 0) + (ovr.count ?? 0) + (cal.count ?? 0)
    },
  })
}
