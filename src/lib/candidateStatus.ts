export type CandidateDisposition = 'pending' | 'success' | 'cancelled'

/** Human label for DB value (includes legacy outcome strings for activity history). */
export function formatCandidateStatus(value: string): string {
  switch (value) {
    case 'pending':
      return 'Pending'
    case 'success':
      return 'Success'
    case 'cancelled':
      return 'Cancelled'
    case 'active':
      return 'Pending'
    case 'hired':
      return 'Success'
    case 'rejected':
    case 'withdrawn':
      return 'Cancelled'
    default:
      return value.replace(/_/g, ' ')
  }
}

/** Chip styles for candidate disposition (pending / success / cancelled). */
export function candidateStatusPill(status: string): { label: string; className: string } {
  switch (status) {
    case 'pending':
    case 'active':
      return {
        label: 'Pending',
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
        label: 'Cancelled',
        className:
          'border-stone-200/80 bg-stone-100 text-stone-700 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-300',
      }
    default:
      return {
        label: formatCandidateStatus(status),
        className: 'border-stone-200/80 bg-stone-50 text-stone-700 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-300',
      }
  }
}
