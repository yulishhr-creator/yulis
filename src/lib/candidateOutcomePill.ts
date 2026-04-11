/** Styles for candidate outcome chips (active, hired, rejected, withdrawn). */
export function candidateOutcomePill(outcome: string): { label: string; className: string } {
  switch (outcome) {
    case 'active':
      return {
        label: 'Active',
        className:
          'border-sky-200/80 bg-sky-50 text-sky-900 dark:border-cyan-700/60 dark:bg-cyan-950/40 dark:text-cyan-100',
      }
    case 'hired':
      return {
        label: 'Hired',
        className:
          'border-emerald-200/80 bg-emerald-50 text-emerald-900 dark:border-emerald-700/60 dark:bg-emerald-950/40 dark:text-emerald-100',
      }
    case 'rejected':
      return {
        label: 'Rejected',
        className:
          'border-red-200/80 bg-red-50 text-red-900 dark:border-red-800/60 dark:bg-red-950/40 dark:text-red-100',
      }
    case 'withdrawn':
      return {
        label: 'Withdrawn',
        className:
          'border-stone-200/80 bg-stone-100 text-stone-700 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-300',
      }
    default:
      return {
        label: outcome,
        className: 'border-stone-200/80 bg-stone-50 text-stone-700 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-300',
      }
  }
}
