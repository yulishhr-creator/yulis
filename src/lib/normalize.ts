export function normalizeEmail(s: string | null | undefined): string | null {
  if (!s?.trim()) return null
  return s.trim().toLowerCase()
}

export function normalizePhone(s: string | null | undefined): string | null {
  if (!s?.trim()) return null
  const digits = s.replace(/\D/g, '')
  return digits.length ? digits : null
}
