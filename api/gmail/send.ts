import type { VercelRequest, VercelResponse } from '@vercel/node'

import { requireUserId } from '../_lib/auth.js'
import { buildRfc822Message, toGmailRawBase64Url } from '../_lib/gmail-raw.js'
import { refreshAccessToken } from '../_lib/google-oauth.js'
import { sendApiError } from '../_lib/respond.js'
import { createServiceRoleClient } from '../_lib/supabase-admin.js'

type Row = {
  provider_account_email: string | null
  refresh_token_encrypted: string | null
  access_token: string | null
  access_token_expires_at: string | null
}

function splitRecipients(s: string): string[] {
  return s
    .split(/[,;\n]+/)
    .map((x) => x.trim())
    .filter(Boolean)
}

async function ensureAccessToken(row: Row, userId: string): Promise<{ accessToken: string; fromEmail: string } | null> {
  const fromEmail = row.provider_account_email?.trim()
  const refresh = row.refresh_token_encrypted?.trim()
  if (!fromEmail || !refresh) return null

  const admin = createServiceRoleClient()
  const exp = row.access_token_expires_at ? new Date(row.access_token_expires_at).getTime() : 0
  const slack = 30_000
  if (row.access_token && exp - slack > Date.now()) {
    return { accessToken: row.access_token, fromEmail }
  }

  const tok = await refreshAccessToken(refresh)
  const expiresAt = new Date(Date.now() + tok.expires_in * 1000).toISOString()
  await admin
    .from('user_oauth_integrations')
    .update({
      access_token: tok.access_token,
      access_token_expires_at: expiresAt,
      ...(tok.scope ? { scope: tok.scope } : {}),
    })
    .eq('user_id', userId)
    .eq('provider', 'gmail')

  return { accessToken: tok.access_token, fromEmail }
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

    let body: {
      to?: string[] | string
      cc?: string[] | string
      bcc?: string[] | string
      subject?: string
      bodyText?: string
      bodyHtml?: string
    }
    try {
      if (typeof req.body === 'string') {
        body = JSON.parse(req.body) as typeof body
      } else if (req.body && typeof req.body === 'object') {
        body = req.body as typeof body
      } else {
        res.status(400).json({ error: 'invalid_json' })
        return
      }
    } catch {
      res.status(400).json({ error: 'invalid_json' })
      return
    }

    const toRaw = body.to
    const to = Array.isArray(toRaw)
      ? toRaw.map((x) => String(x).trim()).filter(Boolean)
      : splitRecipients(String(toRaw ?? ''))

    const ccRaw = body.cc
    const cc = Array.isArray(ccRaw)
      ? ccRaw.map((x) => String(x).trim()).filter(Boolean)
      : splitRecipients(String(ccRaw ?? ''))

    const bccRaw = body.bcc
    const bcc = Array.isArray(bccRaw)
      ? bccRaw.map((x) => String(x).trim()).filter(Boolean)
      : splitRecipients(String(bccRaw ?? ''))

    const subject = (body.subject ?? '').trim()
    const text = (body.bodyText ?? '').trim()
    const html = body.bodyHtml?.trim()

    if (!to.length) {
      res.status(400).json({ error: 'missing_to' })
      return
    }
    if (!subject) {
      res.status(400).json({ error: 'missing_subject' })
      return
    }
    if (!text && !html) {
      res.status(400).json({ error: 'missing_body' })
      return
    }

    const admin = createServiceRoleClient()
    const { data: row, error: qErr } = await admin
      .from('user_oauth_integrations')
      .select('provider_account_email, refresh_token_encrypted, access_token, access_token_expires_at')
      .eq('user_id', userId)
      .eq('provider', 'gmail')
      .maybeSingle()

    if (qErr) throw qErr
    if (!row) {
      res.status(400).json({ error: 'gmail_not_connected' })
      return
    }

    const auth = await ensureAccessToken(row as Row, userId)
    if (!auth) {
      res.status(400).json({ error: 'gmail_not_connected' })
      return
    }

    const plainText = text || (html ? html.replace(/<[^>]+>/g, ' ') : '')
    const htmlBody = html ?? undefined

    const raw = buildRfc822Message({
      from: auth.fromEmail,
      to,
      cc,
      bcc,
      subject,
      text: plainText,
      html: htmlBody,
    })

    const rawB64 = toGmailRawBase64Url(raw)

    const sendRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${auth.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ raw: rawB64 }),
    })

    const sendJson = (await sendRes.json()) as { id?: string; threadId?: string; error?: { message?: string } }
    if (!sendRes.ok) {
      console.error('gmail_send', sendJson)
      res.status(502).json({ error: sendJson.error?.message ?? 'gmail_send_failed' })
      return
    }

    res.status(200).json({ id: sendJson.id, threadId: sendJson.threadId })
  } catch (e) {
    sendApiError(res, 500, e, 'send_failed')
  }
}
