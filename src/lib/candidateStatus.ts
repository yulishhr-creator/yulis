/** Global candidate pool (not per-position). */
export type CandidateGlobalStatus = 'active' | 'archived'

/** Assignment of a candidate to a specific position (junction). */
export type PositionCandidateStatus = 'in_progress' | 'rejected' | 'withdrawn'

export function formatCandidateGlobalStatus(value: string): string {
  switch (value) {
    case 'active':
      return 'Active'
    case 'archived':
      return 'Archived'
    default:
      return value.replace(/_/g, ' ')
  }
}

export function candidateGlobalPill(status: string): { label: string; className: string } {
  switch (status) {
    case 'active':
      return {
        label: 'Active',
        className:
          'border-sky-200/80 bg-sky-50 text-sky-900 dark:border-cyan-700/60 dark:bg-cyan-950/40 dark:text-cyan-100',
      }
    case 'archived':
      return {
        label: 'Archived',
        className:
          'border-stone-200/80 bg-stone-100 text-stone-700 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-300',
      }
    default:
      return {
        label: formatCandidateGlobalStatus(status),
        className: 'border-stone-200/80 bg-stone-50 text-stone-700 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-300',
      }
  }
}

export function formatAssignmentStatus(value: string): string {
  switch (value) {
    case 'in_progress':
      return 'In progress'
    case 'rejected':
      return 'Rejected'
    case 'withdrawn':
      return 'Withdrawn'
    default:
      return value.replace(/_/g, ' ')
  }
}

/** Chip styles for position_candidates.status */
export function assignmentStatusPill(status: string): { label: string; className: string } {
  switch (status) {
    case 'in_progress':
      return {
        label: 'In progress',
        className:
          'border-sky-200/80 bg-sky-50 text-sky-900 dark:border-cyan-700/60 dark:bg-cyan-950/40 dark:text-cyan-100',
      }
    case 'rejected':
      return {
        label: 'Rejected',
        className:
          'border-rose-200/80 bg-rose-50 text-rose-900 dark:border-rose-800/60 dark:bg-rose-950/40 dark:text-rose-100',
      }
    case 'withdrawn':
      return {
        label: 'Withdrawn',
        className:
          'border-stone-200/80 bg-stone-100 text-stone-700 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-300',
      }
    default:
      return {
        label: formatAssignmentStatus(status),
        className: 'border-stone-200/80 bg-stone-50 text-stone-700 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-300',
      }
  }
}

/** Position lifecycle (positions.status). */
export type PositionLifecycleStatus = 'active' | 'on_hold' | 'cancelled' | 'succeeded'

export function formatPositionLifecycleStatus(value: string): string {
  switch (value) {
    case 'active':
      return 'Active'
    case 'on_hold':
      return 'On hold'
    case 'cancelled':
      return 'Cancelled'
    case 'succeeded':
      return 'Succeeded'
    default:
      return value.replace(/_/g, ' ')
  }
}

export function positionLifecyclePill(status: string): { label: string; className: string } {
  switch (status) {
    case 'active':
      return {
        label: 'Active',
        className:
          'border-sky-200/80 bg-sky-50 text-sky-900 dark:border-cyan-700/60 dark:bg-cyan-950/40 dark:text-cyan-100',
      }
    case 'on_hold':
      return {
        label: 'On hold',
        className:
          'border-amber-200/80 bg-amber-50 text-amber-900 dark:border-amber-800/60 dark:bg-amber-950/40 dark:text-amber-100',
      }
    case 'succeeded':
      return {
        label: 'Succeeded',
        className:
          'border-emerald-200/80 bg-emerald-50 text-emerald-900 dark:border-emerald-700/60 dark:bg-emerald-950/40 dark:text-emerald-100',
      }
    case 'cancelled':
      return {
        label: 'Cancelled',
        className:
          'border-stone-200/80 bg-stone-100 text-stone-700 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-300',
      }
    default:
      return {
        label: formatPositionLifecycleStatus(status),
        className: 'border-stone-200/80 bg-stone-50 text-stone-700 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-300',
      }
  }
}

/** Legacy activity rows + shared chip helper — prefer assignmentStatusPill for junction status. */
export function candidateStatusPill(status: string): { label: string; className: string } {
  if (status === 'in_progress' || status === 'rejected' || status === 'withdrawn') {
    return assignmentStatusPill(status)
  }
  switch (status) {
    case 'pending':
    case 'active':
      return {
        label: 'In progress',
        className:
          'border-sky-200/80 bg-sky-50 text-sky-900 dark:border-cyan-700/60 dark:bg-cyan-950/40 dark:text-cyan-100',
      }
    case 'success':
    case 'hired':
      return {
        label: 'Success',
        className:
          'border-emerald-200/80 bg-emerald-50 text-emerald-900 dark:border-emerald-700/60 dark:bg-emerald-950/40 dark:text-emerald-100',
      }
    case 'cancelled':
    case 'rejected':
    case 'withdrawn':
      return {
        label: 'Closed',
        className:
          'border-stone-200/80 bg-stone-100 text-stone-700 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-300',
      }
    default:
      return assignmentStatusPill(status)
  }
}

export function formatCandidateStatus(value: string): string {
  if (value === 'in_progress' || value === 'rejected' || value === 'withdrawn') {
    return formatAssignmentStatus(value)
  }
  switch (value) {
    case 'pending':
    case 'active':
      return 'In progress'
    case 'success':
    case 'hired':
      return 'Success'
    case 'cancelled':
      return 'Cancelled'
    default:
      return value.replace(/_/g, ' ')
  }
}
