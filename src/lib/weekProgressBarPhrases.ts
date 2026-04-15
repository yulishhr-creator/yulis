/**
 * One line per calendar day for the sidebar week-progress card only (Sun = 0 … Sat = 6).
 * Not used under the avatar — edit freely. “UGLY BABY” is Wednesday per product copy.
 */
export const WEEK_PROGRESS_BAR_PHRASES: readonly string[] = [
  'Sunday: the week hasn’t won yet.',
  'WHY GOD WHY?!',
  'WHY GOD WHY?!',
  'UGLY BABY.',
  'WHY GOD WHY?!',
  'FRIDAY IS CALLING',
  'WE MADE IT — weekend.',
] as const

export function weekProgressBarPhrase(date: Date = new Date()): string {
  const i = date.getDay()
  return WEEK_PROGRESS_BAR_PHRASES[i] ?? WEEK_PROGRESS_BAR_PHRASES[0]!
}
