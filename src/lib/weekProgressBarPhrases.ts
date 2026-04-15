/**
 * One line per calendar day for the sidebar week-progress card only (Sun = 0 … Sat = 6).
 * Not used under the avatar.
 */
export const WEEK_PROGRESS_BAR_PHRASES: readonly string[] = [
  'WHY GOD? WHY?!',
  'Why are you doing this to us?',
  'Can I be-anymore-bored?',
  'Glieba is a word!',
  'Open for mingling..',
  "It's Friday-ni-hu!",
  'UGLY BABY judges you!',
] as const

export function weekProgressBarPhrase(date: Date = new Date()): string {
  const i = date.getDay()
  return WEEK_PROGRESS_BAR_PHRASES[i] ?? WEEK_PROGRESS_BAR_PHRASES[0]!
}
