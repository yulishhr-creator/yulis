import type { SupabaseClient } from '@supabase/supabase-js'

export async function logPositionCandidateTransition(
  supabase: SupabaseClient,
  userId: string,
  input: {
    position_candidate_id: string
    transition_type: 'stage' | 'status'
    from_stage_id?: string | null
    to_stage_id?: string | null
    from_status?: string | null
    to_status?: string | null
  },
): Promise<void> {
  const { error } = await supabase.from('position_candidate_transitions').insert({
    user_id: userId,
    position_candidate_id: input.position_candidate_id,
    transition_type: input.transition_type,
    from_stage_id: input.from_stage_id ?? null,
    to_stage_id: input.to_stage_id ?? null,
    from_status: input.from_status ?? null,
    to_status: input.to_status ?? null,
  })
  if (error) console.error('[position_candidate_transitions]', error.message)
}
