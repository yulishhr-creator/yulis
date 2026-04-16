import { useQuery } from '@tanstack/react-query'

import { useAuth } from '@/auth/useAuth'
import { getSupabase } from '@/lib/supabase'

export type PipelineHeadlineStats = {
  activeCandidateCount: number
  activePositionCount: number
}

/**
 * Counts in-progress assignments and how many distinct open/on-hold roles have at least one such assignment.
 * When `companyId` is set, only positions for that client are included.
 */
export function usePipelineHeadlineStats(companyId?: string | null) {
  const { user } = useAuth()
  const supabase = getSupabase()
  const uid = user?.id

  return useQuery({
    queryKey: ['pipeline-headline-stats', uid, companyId ?? 'all'],
    enabled: Boolean(supabase && uid),
    queryFn: async (): Promise<PipelineHeadlineStats> => {
      let posQ = supabase!
        .from('positions')
        .select('id')
        .eq('user_id', uid!)
        .is('deleted_at', null)
        .in('status', ['active', 'on_hold'])
      if (companyId) posQ = posQ.eq('company_id', companyId)
      const { data: positions, error: pErr } = await posQ
      if (pErr) throw pErr
      const posIds = (positions ?? []).map((p) => p.id as string)
      if (posIds.length === 0) {
        return { activeCandidateCount: 0, activePositionCount: 0 }
      }
      const { data: rows, error: cErr } = await supabase!
        .from('position_candidates')
        .select('position_id')
        .eq('user_id', uid!)
        .in('status', ['in_progress'])
        .is('archived_at', null)
        .in('position_id', posIds)
      if (cErr) throw cErr
      const list = rows ?? []
      const activeCandidateCount = list.length
      const activePositionCount = new Set(list.map((r) => r.position_id as string)).size
      return { activeCandidateCount, activePositionCount }
    },
  })
}
