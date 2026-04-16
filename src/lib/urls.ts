const LINKEDIN_HOSTS = new Set(['linkedin.com', 'www.linkedin.com', 'il.linkedin.com', 'mobile.linkedin.com'])

/** Normalize recruiter-entered LinkedIn to a safe https URL on linkedin.com only. */
export function linkedinHref(raw: string | null | undefined): string | null {
  const t = raw?.trim()
  if (!t) return null
  let url: URL
  try {
    url = new URL(t.startsWith('http://') || t.startsWith('https://') ? t : `https://${t}`)
  } catch {
    return null
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
  const host = url.hostname.toLowerCase()
  if (!LINKEDIN_HOSTS.has(host)) return null
  if (url.protocol === 'http:') url.protocol = 'https:'
  return url.toString()
}
