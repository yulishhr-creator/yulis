import { getSupabase } from '@/lib/supabase'

const AGENT_INGEST = 'http://127.0.0.1:7883/ingest/253f2f27-b59e-401e-9330-b3044ff73852'

function agentIngest(payload: {
  location: string
  message: string
  hypothesisId: string
  data?: Record<string, unknown>
}) {
  fetch(AGENT_INGEST, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '938437' },
    body: JSON.stringify({ sessionId: '938437', timestamp: Date.now(), ...payload }),
  }).catch(() => {})
}

async function getAccessToken(): Promise<string | null> {
  const supabase = getSupabase()
  if (!supabase) return null
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token ?? null
}

function formatApiError(j: { error?: string; missing_env?: string }, fallback: string): string {
  if (j.missing_env) {
    return `${j.error ?? 'config'}: add "${j.missing_env}" in Vercel (Environment Variables) and redeploy`
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
  let res: Response
  try {
    res = await fetch(path, { ...init, headers })
  } catch (e) {
    // #region agent log
    agentIngest({
      location: 'gmailApi.ts:apiFetch',
      message: 'fetch_network_error',
      hypothesisId: 'H5',
      data: { path, err: e instanceof Error ? e.name : 'unknown' },
    })
    // #endregion
    throw e
  }
  // #region agent log
  void (async () => {
    try {
      const ct = res.headers.get('content-type') ?? ''
      const clone = res.clone()
      const t = await clone.text()
      const snippet = t
        .slice(0, 220)
        .replace(/\s+/g, ' ')
        .replace(/Bearer\s+[\w.-]+/gi, 'Bearer [redacted]')
      const looksLikeHtml = /^\s*</.test(t) || /<html/i.test(t.slice(0, 80))
      let errKey: string | undefined
      let missingEnv: string | undefined
      try {
        const j = JSON.parse(t) as { error?: string; missing_env?: string }
        errKey = j.error
        missingEnv = j.missing_env
      } catch {
        /* not JSON */
      }
      agentIngest({
        location: 'gmailApi.ts:apiFetch',
        message: 'gmail_api_response',
        hypothesisId: 'H1-H2-H3',
        data: {
          path,
          status: res.status,
          contentType: ct,
          looksLikeHtml,
          error: errKey,
          missing_env: missingEnv,
          hasToken: Boolean(token),
        },
      })
      if (snippet && !looksLikeHtml && snippet.length > 0) {
        agentIngest({
          location: 'gmailApi.ts:apiFetch',
          message: 'body_snippet',
          hypothesisId: 'H2',
          data: { path, snippet },
        })
      }
    } catch (e) {
      agentIngest({
        location: 'gmailApi.ts:apiFetch',
        message: 'log_clone_failed',
        hypothesisId: 'H2',
        data: { path, err: String(e) },
      })
    }
  })()
  // #endregion
  return res
}

export type GmailStatus = {
  connected: boolean
  email: string | null
}

export async function getGmailStatus(): Promise<GmailStatus> {
  const res = await apiFetch('/api/gmail/status', { method: 'GET' })
  if (!res.ok) {
    const j = (await res.json().catch(() => ({}))) as { error?: string; missing_env?: string }
    throw new Error(formatApiError(j, `status_${res.status}`))
  }
  return (await res.json()) as GmailStatus
}

export async function disconnectGmail(): Promise<void> {
  const res = await apiFetch('/api/gmail/disconnect', { method: 'POST', body: '{}' })
  if (!res.ok) {
    const j = (await res.json().catch(() => ({}))) as { error?: string; missing_env?: string }
    throw new Error(formatApiError(j, `disconnect_${res.status}`))
  }
}

export type SendGmailPayload = {
  to: string[]
  cc?: string[]
  bcc?: string[]
  subject: string
  bodyText: string
  bodyHtml?: string
}

export async function sendGmail(payload: SendGmailPayload): Promise<{ id?: string; threadId?: string }> {
  const res = await apiFetch('/api/gmail/send', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    const j = (await res.json().catch(() => ({}))) as { error?: string; missing_env?: string }
    throw new Error(formatApiError(j, `send_${res.status}`))
  }
  return (await res.json()) as { id?: string; threadId?: string }
}

/** Returns Google authorize URL; caller should assign `window.location.href = url`. */
export async function startGmailOAuth(): Promise<string> {
  const res = await apiFetch('/api/gmail/oauth/start', { method: 'POST', body: '{}' })
  if (!res.ok) {
    const j = (await res.json().catch(() => ({}))) as { error?: string; missing_env?: string }
    throw new Error(formatApiError(j, `oauth_start_${res.status}`))
  }
  const j = (await res.json()) as { url?: string }
  if (!j.url) throw new Error('missing_authorize_url')
  return j.url
}
