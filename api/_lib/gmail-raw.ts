import { randomBytes } from 'node:crypto'

function b64utf8(s: string): string {
  return Buffer.from(s, 'utf8').toString('base64')
}

/** Minimal RFC 5322 message with multipart/alternative when HTML is provided. */
export function buildRfc822Message(opts: {
  from: string
  to: string[]
  cc: string[]
  bcc: string[]
  subject: string
  text: string
  html?: string
}): string {
  const lines: string[] = []
  lines.push(`From: ${opts.from}`)
  lines.push(`To: ${opts.to.join(', ')}`)
  if (opts.cc.length) lines.push(`Cc: ${opts.cc.join(', ')}`)
  if (opts.bcc.length) lines.push(`Bcc: ${opts.bcc.join(', ')}`)
  lines.push(`Subject: ${opts.subject}`)
  lines.push(`MIME-Version: 1.0`)

  if (opts.html) {
    const boundary = `bound_${randomBytes(12).toString('hex')}`
    lines.push(`Content-Type: multipart/alternative; boundary="${boundary}"`)
    lines.push('')
    lines.push(`--${boundary}`)
    lines.push(`Content-Type: text/plain; charset=UTF-8`)
    lines.push(`Content-Transfer-Encoding: base64`)
    lines.push('')
    lines.push(b64utf8(opts.text))
    lines.push(`--${boundary}`)
    lines.push(`Content-Type: text/html; charset=UTF-8`)
    lines.push(`Content-Transfer-Encoding: base64`)
    lines.push('')
    lines.push(b64utf8(opts.html))
    lines.push(`--${boundary}--`)
  } else {
    lines.push(`Content-Type: text/plain; charset=UTF-8`)
    lines.push(`Content-Transfer-Encoding: base64`)
    lines.push('')
    lines.push(b64utf8(opts.text))
  }

  return lines.join('\r\n')
}

export function toGmailRawBase64Url(raw: string): string {
  return Buffer.from(raw, 'utf8').toString('base64url')
}
