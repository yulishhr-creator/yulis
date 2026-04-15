/**
 * Quotes for the sidebar week-progress card. One line per local calendar day,
 * index chosen deterministically from the date (same quote all day, changes daily).
 */
export const SIDEBAR_PROGRESS_QUOTES: readonly string[] = [
  'Perhaps a wicked-wango card?',
  'NO MORE FALAFEL FOR YOU!',
  'Can I interest you in a sarcastic comment?',
  "It's like a cow's opinion. It's moo.",
  'Unagi is a state of total awareness.',
  'Welcome to the real world. It sucks!',
  'Hopeless and awkward and desperate for love!',
  'I am the Holiday Armadillo!',
  'We were on a break!',
  "They don't know that we know they know.",
  'Smelly cat, what are they feeding you?',
  'You ate my sandwich? My sandwich?!',
  "I'm not great at the advice.",
  'I will pee on any one of you!',
  'Custard? Good. Jam? Good. Meat? Good.',
  'It was eighteen pages! Front and back!',
  'That is not even a word!',
  "I'm a doctor, not a mathematician.",
  'I am a double eight!',
  'Was that place the sun?',
  "Actually, it's Miss Chanandler Bong.",
  "I'm very sorry, would you like a muffin?",
  "It's paper, snow, a ghost!",
  "I'm not good with the advice.",
] as const

function dayKeyIndex(date: Date, modulo: number): number {
  const y = date.getFullYear()
  const m = date.getMonth() + 1
  const d = date.getDate()
  let h = 2166136261
  h = Math.imul(h ^ y, 16777619)
  h = Math.imul(h ^ m, 16777619)
  h = Math.imul(h ^ d, 16777619)
  return Math.abs(h) % modulo
}

export function sidebarDailyProgressQuote(date: Date = new Date()): string {
  const arr = SIDEBAR_PROGRESS_QUOTES
  const i = dayKeyIndex(date, arr.length)
  return arr[i]!
}
