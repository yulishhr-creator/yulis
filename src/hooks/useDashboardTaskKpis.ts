import { useQuery } from '@tanstack/react-query'

import { useAuth } from '@/auth/useAuth'
import { getSupabase } from '@/lib/supabase'

export type DashboardTaskKpis = {
  todo: number
  inProgress: number
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
          return { todo: 0, inProgress: 0, done: 0 }
        }
      }

      const baseTodo = supabase!.from('tasks').select('*', { count: 'exact', head: true }).eq('user_id', uid!).eq('status', 'todo')
      const baseInProgress = supabase!.from('tasks').select('*', { count: 'exact', head: true }).eq('user_id', uid!).eq('status', 'in_progress')
      const baseDone = supabase!.from('tasks').select('*', { count: 'exact', head: true }).eq('user_id', uid!).eq('status', 'done')

      const todoQ = positionIds ? baseTodo.in('position_id', positionIds) : baseTodo
      const inProgressQ = positionIds ? baseInProgress.in('position_id', positionIds) : baseInProgress
      const doneQ = positionIds ? baseDone.in('position_id', positionIds) : baseDone

      const [todoR, inProgressR, doneR] = await Promise.all([todoQ, inProgressQ, doneQ])
      return {
        todo: todoR.count ?? 0,
        inProgress: inProgressR.count ?? 0,
        done: doneR.count ?? 0,
      }
    },
  })
}
