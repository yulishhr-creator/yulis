import { useQuery } from '@tanstack/react-query'

import { useAuth } from '@/auth/useAuth'
import { getSupabase } from '@/lib/supabase'

/** Overdue tasks + calendar events starting within 48h + reminders (any). Events vs reminders are distinct product concepts. */
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
      const [rem, ovr, calStarts, calReminders] = await Promise.all([
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
          .select('id')
          .eq('user_id', uid)
          .gte('starts_at', nowIso)
          .lte('starts_at', horizon),
        supabase!
          .from('calendar_events')
          .select('id')
          .eq('user_id', uid)
          .not('reminder_at', 'is', null)
          .gte('reminder_at', nowIso)
          .lte('reminder_at', horizon),
      ])
      const calIds = new Set<string>()
      for (const row of calStarts.data ?? []) calIds.add(row.id)
      for (const row of calReminders.data ?? []) calIds.add(row.id)
      return (rem.count ?? 0) + (ovr.count ?? 0) + calIds.size
    },
  })
}
