import { useQuery } from '@tanstack/react-query'

import { useAuth } from '@/auth/useAuth'
import { getSupabase } from '@/lib/supabase'

export type DashboardTaskKpis = {
  todo: number
  inProgress: number
  overdue: number
  done: number
}

/**
 * Aggregate task counts for the user. When `companyId` is set, only tasks on positions for that client.
 * Pass `{ enabled: false }` to skip the query (e.g. when the UI only needs scoped KPIs sometimes).
 */
export function useDashboardTaskKpis(companyId?: string | null, options?: { enabled?: boolean }) {
  const { user } = useAuth()
  const supabase = getSupabase()
  const uid = user?.id
  const queryEnabled = options?.enabled !== false

  return useQuery({
    queryKey: ['dashboard-task-kpis', uid, companyId ?? 'all'],
    enabled: Boolean(supabase && uid && queryEnabled),
    queryFn: async (): Promise<DashboardTaskKpis> => {
      const now = new Date().toISOString()

      let positionIds: string[] | null = null
      if (companyId) {
        const { data: posRows, error: pe } = await supabase!
          .from('positions')
          .select('id')
          .eq('user_id', uid!)
          .eq('company_id', companyId)
          .is('deleted_at', null)
        if (pe) throw pe
        positionIds = (posRows ?? []).map((r) => r.id as string)
        if (positionIds.length === 0) {
          return { todo: 0, inProgress: 0, overdue: 0, done: 0 }
        }
      }

      const baseTodo = supabase!.from('tasks').select('*', { count: 'exact', head: true }).eq('user_id', uid!).eq('status', 'todo')
      const baseInProgress = supabase!.from('tasks').select('*', { count: 'exact', head: true }).eq('user_id', uid!).eq('status', 'in_progress')
      const baseOverdue = supabase!
        .from('tasks')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', uid!)
        .neq('status', 'done')
        .not('due_at', 'is', null)
        .lt('due_at', now)
      const baseDone = supabase!.from('tasks').select('*', { count: 'exact', head: true }).eq('user_id', uid!).eq('status', 'done')

      const todoQ = positionIds ? baseTodo.in('position_id', positionIds) : baseTodo
      const inProgressQ = positionIds ? baseInProgress.in('position_id', positionIds) : baseInProgress
      const overdueQ = positionIds ? baseOverdue.in('position_id', positionIds) : baseOverdue
      const doneQ = positionIds ? baseDone.in('position_id', positionIds) : baseDone

      const [open, inProgress, overdue, done] = await Promise.all([todoQ, inProgressQ, overdueQ, doneQ])
      return {
        todo: open.count ?? 0,
        inProgress: inProgress.count ?? 0,
        overdue: overdue.count ?? 0,
        done: done.count ?? 0,
      }
    },
  })
}
