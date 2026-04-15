import type { SupabaseClient } from '@supabase/supabase-js'

export type ActivityEventType =
  | 'candidate_created'
  | 'candidate_stage_changed'
  | 'candidate_file_uploaded'
  | 'candidate_outcome_changed'
  | 'candidate_status_changed'
  | 'candidate_reassigned'
  | 'position_status_changed'
  | 'candidate_reached_critical_stage'
  | 'position_created'
  | 'note_added'
  /** Lightweight per-assignment tag stored as an activity row (user-deletable). */
  | 'candidate_tag'

export type LogActivityInput = {
  event_type: ActivityEventType
  position_id: string
  candidate_id?: string | null
  position_candidate_id?: string | null
  title: string
  subtitle?: string | null
  metadata?: Record<string, unknown>
}

/** Best-effort activity row; logs console on failure (non-blocking for UX). */
export async function logActivityEvent(supabase: SupabaseClient, userId: string, input: LogActivityInput): Promise<void> {
  const { error } = await supabase.from('activity_events').insert({
    user_id: userId,
    event_type: input.event_type,
    position_id: input.position_id,
    candidate_id: input.candidate_id ?? null,
    position_candidate_id: input.position_candidate_id ?? null,
    title: input.title,
    subtitle: input.subtitle ?? null,
    metadata: (input.metadata ?? {}) as never,
  })
  if (error) console.error('[activity_events]', error.message)
}

export function criticalStageThreshold(position: { critical_stage_sort_order?: number | null } | null | undefined): number {
  const n = position?.critical_stage_sort_order
  return n != null && n > 0 ? n : 3
}
