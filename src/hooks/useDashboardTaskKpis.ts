import { useQuery } from '@tanstack/react-query'

import { useAuth } from '@/auth/useAuth'
import { getSupabase } from '@/lib/supabase'

export type DashboardTaskKpis = {
  open: number
  closed: number
  archived: number
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
          return { open: 0, closed: 0, archived: 0 }
        }
      }

      const baseOpen = supabase!.from('tasks').select('*', { count: 'exact', head: true }).eq('user_id', uid!).eq('status', 'open')
      const baseClosed = supabase!.from('tasks').select('*', { count: 'exact', head: true }).eq('user_id', uid!).eq('status', 'closed')
      const baseArchived = supabase!.from('tasks').select('*', { count: 'exact', head: true }).eq('user_id', uid!).eq('status', 'archived')

      const openQ = positionIds ? baseOpen.in('position_id', positionIds) : baseOpen
      const closedQ = positionIds ? baseClosed.in('position_id', positionIds) : baseClosed
      const archivedQ = positionIds ? baseArchived.in('position_id', positionIds) : baseArchived

      const [openR, closedR, archivedR] = await Promise.all([openQ, closedQ, archivedQ])
      return {
        open: openR.count ?? 0,
        closed: closedR.count ?? 0,
        archived: archivedR.count ?? 0,
      }
    },
  })
}
