import type { VercelRequest, VercelResponse } from '@vercel/node'

import { requireUserId } from '../_lib/auth.js'
import { requireEnv } from '../_lib/env.js'
import { sendApiError } from '../_lib/respond.js'

type ComposePayload = {
  to: string[]
  cc?: string[]
  bcc?: string[]
  subject: string
  bodyText: string
  bodyHtml?: string
}

function isEmailish(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim())
}

/** Make.com webhook may return JSON with `Message ID` (compose) or `Event ID` (interview calendar). */
function parseMakeWebhookIds(responseText: string): { messageId?: string; eventId?: string } {
  const t = responseText.trim()
  if (!t) return {}
  try {
    const j = JSON.parse(t) as Record<string, unknown>
    const messageIdRaw = j['Message ID'] ?? j.messageId ?? j.message_id
    const eventIdRaw = j['Event ID'] ?? j.eventId ?? j.event_id
    const messageId = typeof messageIdRaw === 'string' && messageIdRaw.trim() ? messageIdRaw.trim() : undefined
    const eventId = typeof eventIdRaw === 'string' && eventIdRaw.trim() ? eventIdRaw.trim() : undefined
    return { messageId, eventId }
  } catch {
    return {}
  }
}

type InterviewMakePayload = {
  eventType: 'interview'
  interviewDesc: string
  interviewerName: string
  interviewerMail: string
  candidateName: string
  candidateMail: string
  interviewDate: string
  interviewDuration: string
}

function parseInterviewPayload(
  raw: unknown,
): { ok: true; value: InterviewMakePayload } | { ok: false; status: number; code: string; missing?: string[] } {
  if (!raw || typeof raw !== 'object') {
    return { ok: false, status: 400, code: 'invalid_body' }
  }
  const o = raw as Record<string, unknown>
  if (o.eventType !== 'interview') {
    return { ok: false, status: 400, code: 'invalid_event_type' }
  }

  const interviewDesc = typeof o.interviewDesc === 'string' ? o.interviewDesc.trim() : ''
  const interviewerName = typeof o.interviewerName === 'string' ? o.interviewerName.trim() : ''
  const interviewerMail = typeof o.interviewerMail === 'string' ? o.interviewerMail.trim() : ''
  const candidateName = typeof o.candidateName === 'string' ? o.candidateName.trim() : ''
  const candidateMail = typeof o.candidateMail === 'string' ? o.candidateMail.trim() : ''
  const interviewDate = typeof o.interviewDate === 'string' ? o.interviewDate.trim() : ''
  const durationRaw = o.interviewDuration
  const interviewDuration =
    typeof durationRaw === 'number' && Number.isFinite(durationRaw)
      ? String(durationRaw)
      : typeof durationRaw === 'string'
        ? durationRaw.trim()
        : ''

  const missing: string[] = []
  if (!interviewDesc) missing.push('interviewDesc')
  if (!interviewerName) missing.push('interviewerName')
  if (!interviewerMail) missing.push('interviewerMail')
  else if (!isEmailish(interviewerMail)) missing.push('interviewerMail (invalid email)')
  if (!candidateName) missing.push('candidateName')
  if (!candidateMail) missing.push('candidateMail')
  else if (!isEmailish(candidateMail)) missing.push('candidateMail (invalid email)')
  if (!interviewDate) missing.push('interviewDate')
  else if (Number.isNaN(Date.parse(interviewDate))) missing.push('interviewDate (invalid)')
  if (!interviewDuration) missing.push('interviewDuration')

  if (missing.length) {
    return { ok: false, status: 400, code: 'interview_missing_fields', missing }
  }

  return {
    ok: true,
    value: {
      eventType: 'interview',
      interviewDesc,
      interviewerName,
      interviewerMail,
      candidateName,
      candidateMail,
      interviewDate,
      interviewDuration,
    },
  }
}

function parsePayload(raw: unknown): { ok: true; value: ComposePayload } | { ok: false; status: number; code: string } {
  if (!raw || typeof raw !== 'object') {
    return { ok: false, status: 400, code: 'invalid_body' }
  }
  const o = raw as Record<string, unknown>
  const toRaw = o.to
  const subject = o.subject
  const bodyText = o.bodyText

  if (!Array.isArray(toRaw) || toRaw.length === 0 || !toRaw.every((x) => typeof x === 'string')) {
    return { ok: false, status: 400, code: 'invalid_recipients' }
  }
  const to = (toRaw as string[]).map((x) => x.trim()).filter(Boolean)
  if (to.length === 0 || !to.every(isEmailish)) {
    return { ok: false, status: 400, code: 'invalid_recipients' }
  }

  if (typeof subject !== 'string' || !subject.trim()) {
    return { ok: false, status: 400, code: 'missing_subject' }
  }
  if (typeof bodyText !== 'string') {
    return { ok: false, status: 400, code: 'missing_body' }
  }

  const ccRaw = o.cc
  const bccRaw = o.bcc
  const cc =
    ccRaw === undefined ? undefined : Array.isArray(ccRaw)
      ? (ccRaw as string[]).map((x) => x.trim()).filter(Boolean)
      : null
  const bcc =
    bccRaw === undefined ? undefined : Array.isArray(bccRaw)
      ? (bccRaw as string[]).map((x) => x.trim()).filter(Boolean)
      : null
  if (cc === null || bcc === null) {
    return { ok: false, status: 400, code: 'invalid_cc_or_bcc' }
  }
  if (cc?.length && !cc.every(isEmailish)) return { ok: false, status: 400, code: 'invalid_cc_or_bcc' }
  if (bcc?.length && !bcc.every(isEmailish)) return { ok: false, status: 400, code: 'invalid_cc_or_bcc' }

  const bodyHtml = o.bodyHtml
  return {
    ok: true,
    value: {
      to,
      cc,
      bcc,
      subject: subject.trim(),
      bodyText,
      bodyHtml: typeof bodyHtml === 'string' ? bodyHtml : undefined,
    },
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' })
    return
  }

  try {
    const userId = await requireUserId(req)
    if (!userId) {
      res.status(401).json({ error: 'unauthorized' })
      return
    }

    let rawBody: unknown = req.body
    if (typeof rawBody === 'string') {
      try {
        rawBody = JSON.parse(rawBody) as unknown
      } catch {
        res.status(400).json({ error: 'invalid_json' })
        return
      }
    }

    const webhookUrl = requireEnv('MAKE_EMAIL_WEBHOOK_URL')
    const secret = process.env.MAKE_EMAIL_WEBHOOK_SECRET?.trim()

    const bodyObj = rawBody && typeof rawBody === 'object' ? (rawBody as Record<string, unknown>) : null
    if (bodyObj?.eventType === 'interview') {
      const interviewParsed = parseInterviewPayload(rawBody)
      if (!interviewParsed.ok) {
        res.status(interviewParsed.status).json({
          error: interviewParsed.code,
          missing: interviewParsed.missing,
        })
        return
      }
      const forward = {
        ...interviewParsed.value,
        initiatedByUserId: userId,
        source: 'yulis',
      }
      const makeRes = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json, text/plain, */*',
          ...(secret ? { 'X-Email-Webhook-Secret': secret } : {}),
        },
        body: JSON.stringify(forward),
      })
      const textInterview = await makeRes.text()
      if (!makeRes.ok) {
        console.error('make_webhook_failed', makeRes.status, textInterview.slice(0, 800))
        res.status(502).json({
          error: 'make_webhook_failed',
          detail: textInterview.slice(0, 240),
        })
        return
      }
      const ids = parseMakeWebhookIds(textInterview)
      res.status(200).json({
        ok: true,
        ...(ids.messageId ? { messageId: ids.messageId } : {}),
        ...(ids.eventId ? { eventId: ids.eventId } : {}),
      })
      return
    }

    const parsed = parsePayload(rawBody)
    if (!parsed.ok) {
      res.status(parsed.status).json({ error: parsed.code })
      return
    }

    const forward = {
      eventType: 'Registration' as const,
      ...parsed.value,
      initiatedByUserId: userId,
      source: 'yulis',
    }

    const makeRes = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/plain, */*',
        ...(secret ? { 'X-Email-Webhook-Secret': secret } : {}),
      },
      body: JSON.stringify(forward),
    })

    const text = await makeRes.text()
    if (!makeRes.ok) {
      console.error('make_webhook_failed', makeRes.status, text.slice(0, 800))
      res.status(502).json({
        error: 'make_webhook_failed',
        detail: text.slice(0, 240),
      })
      return
    }

    const ids = parseMakeWebhookIds(text)
    res.status(200).json({
      ok: true,
      ...(ids.messageId ? { messageId: ids.messageId } : {}),
      ...(ids.eventId ? { eventId: ids.eventId } : {}),
    })
  } catch (e) {
    sendApiError(res, 500, e, 'email_send_failed')
  }
}
