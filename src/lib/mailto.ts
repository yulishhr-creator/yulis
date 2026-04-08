export function buildMailto(opts: { to: string; subject: string; body: string }): string {
  const params = new URLSearchParams({
    subject: opts.subject,
    body: opts.body,
  })
  return `mailto:${encodeURIComponent(opts.to)}?${params.toString()}`
}
