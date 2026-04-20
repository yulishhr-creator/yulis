import { getSupabase } from '@/lib/supabase'

async function getAccessToken(): Promise<string | null> {
  const supabase = getSupabase()
  if (!supabase) return null
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token ?? null
}

function formatApiError(j: { error?: string; missing_env?: string }, fallback: string): string {
  if (j.missing_env) {
    return `${j.error ?? 'config'}: add "${j.missing_env}" in Vercel Environment Variables and redeploy`
  }
  return j.error ?? fallback
}

async function apiFetch(path: string, init: RequestInit): Promise<Response> {
  const token = await getAccessToken()
  const headers = new Headers(init.headers)
  if (token) headers.set('Authorization', `Bearer ${token}`)
  const method = (init.method ?? 'GET').toUpperCase()
  if (method !== 'GET' && init.body !== undefined) {
    headers.set('Content-Type', 'application/json')
  }

  try {
    return await fetch(path, { ...init, headers })
  } catch (e) {
    if (import.meta.env.DEV && path.startsWith('/api')) {
      throw new Error(
        'Cannot reach API (network error). For local dev run `npm run dev:stack` or `vercel dev` so `/api/*` is available.',
      )
    }
    throw e
  }
}

export type SendComposePayload = {
  to: string[]
  cc?: string[]
  bcc?: string[]
  subject: string
  bodyText: string
  bodyHtml?: string
}

/** Payload for Make.com “interview” route (Google Meet + Calendar). Same webhook as compose. */
export type InterviewScheduleMakePayload = {
  eventType: 'interview'
  interviewDesc: string
  interviewerName: string
  interviewerMail: string
  candidateName: string
  candidateMail: string
  /** ISO 8601 datetime string */
  interviewDate: string
  /** Duration in minutes (string for Make compatibility) */
  interviewDuration: string
}

/** Sends email via server → Make.com webhook (configure MAKE_EMAIL_WEBHOOK_URL on Vercel). */
export async function sendComposeEmail(payload: SendComposePayload): Promise<void> {
  const res = await apiFetch('/api/email/send', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    const j = (await res.json().catch(() => ({}))) as { error?: string; missing_env?: string; detail?: string }
    const extra = j.detail ? ` (${j.detail})` : ''
    throw new Error(formatApiError(j, `send_${res.status}`) + extra)
  }
}

/** Triggers Make scenario for interview scheduling (eventType `interview`). */
export async function sendInterviewScheduleToMake(payload: InterviewScheduleMakePayload): Promise<void> {
  const res = await apiFetch('/api/email/send', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    const j = (await res.json().catch(() => ({}))) as {
      error?: string
      missing_env?: string
      detail?: string
      missing?: string[]
    }
    if (j.error === 'interview_missing_fields' && j.missing?.length) {
      throw new Error(`Missing required fields: ${j.missing.join(', ')}`)
    }
    const extra = j.detail ? ` (${j.detail})` : ''
    throw new Error(formatApiError(j, `send_${res.status}`) + extra)
  }
}
