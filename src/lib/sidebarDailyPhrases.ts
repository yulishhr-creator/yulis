/**
 * One short line per weekday (Sunday = index 0 … Saturday = 6).
 * Shown under the sidebar greeting and on the week-progress card; edit these to your copy.
 */
export const SIDEBAR_DAILY_PHRASES: readonly string[] = [
  'Rest up — Monday will wait.',
  'One focused block beats a scattered day.',
  'Progress beats perfection.',
  'Halfway through — protect your calendar.',
  'Almost Friday — clear the small wins.',
  'Close the loops, then disconnect.',
  'Recharge — you earned the pause.',
] as const

export function sidebarDailyPhrase(date: Date = new Date()): string {
  const i = date.getDay()
  return SIDEBAR_DAILY_PHRASES[i] ?? SIDEBAR_DAILY_PHRASES[0]!
}
