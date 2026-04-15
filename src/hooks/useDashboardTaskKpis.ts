import { useQuery } from '@tanstack/react-query'

import { useAuth } from '@/auth/useAuth'
import { getSupabase } from '@/lib/supabase'

export type DashboardTaskKpis = {
  todo: number
  inProgress: number
  overdue: number
  done: number
}

export function useDashboardTaskKpis() {
  const { user } = useAuth()
  const supabase = getSupabase()
  const uid = user?.id

  return useQuery({
    queryKey: ['dashboard-task-kpis', uid],
    enabled: Boolean(supabase && uid),
    queryFn: async (): Promise<DashboardTaskKpis> => {
      const now = new Date().toISOString()
      const [open, inProgress, overdue, done] = await Promise.all([
        supabase!.from('tasks').select('*', { count: 'exact', head: true }).eq('user_id', uid!).eq('status', 'todo'),
        supabase!.from('tasks').select('*', { count: 'exact', head: true }).eq('user_id', uid!).eq('status', 'in_progress'),
        supabase!
          .from('tasks')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', uid!)
          .neq('status', 'done')
          .not('due_at', 'is', null)
          .lt('due_at', now),
        supabase!.from('tasks').select('*', { count: 'exact', head: true }).eq('user_id', uid!).eq('status', 'done'),
      ])
      return {
        todo: open.count ?? 0,
        inProgress: inProgress.count ?? 0,
        overdue: overdue.count ?? 0,
        done: done.count ?? 0,
      }
    },
  })
}
