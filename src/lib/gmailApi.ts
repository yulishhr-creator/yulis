import { getSupabase } from '@/lib/supabase'

async function getAccessToken(): Promise<string | null> {
  const supabase = getSupabase()
  if (!supabase) return null
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token ?? null
}

async function apiFetch(path: string, init: RequestInit): Promise<Response> {
  const token = await getAccessToken()
  const headers = new Headers(init.headers)
  if (token) headers.set('Authorization', `Bearer ${token}`)
  const method = (init.method ?? 'GET').toUpperCase()
  if (method !== 'GET' && init.body !== undefined) {
    headers.set('Content-Type', 'application/json')
  }
  return fetch(path, { ...init, headers })
}

export type GmailStatus = {
  connected: boolean
  email: string | null
}

export async function getGmailStatus(): Promise<GmailStatus> {
  const res = await apiFetch('/api/gmail/status', { method: 'GET' })
  if (!res.ok) {
    const j = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(j.error ?? `status_${res.status}`)
  }
  return (await res.json()) as GmailStatus
}

export async function disconnectGmail(): Promise<void> {
  const res = await apiFetch('/api/gmail/disconnect', { method: 'POST', body: '{}' })
  if (!res.ok) {
    const j = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(j.error ?? `disconnect_${res.status}`)
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
    const j = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(j.error ?? `send_${res.status}`)
  }
  return (await res.json()) as { id?: string; threadId?: string }
}

/** Returns Google authorize URL; caller should assign `window.location.href = url`. */
export async function startGmailOAuth(): Promise<string> {
  const res = await apiFetch('/api/gmail/oauth/start', { method: 'POST', body: '{}' })
  if (!res.ok) {
    const j = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(j.error ?? `oauth_start_${res.status}`)
  }
  const j = (await res.json()) as { url?: string }
  if (!j.url) throw new Error('missing_authorize_url')
  return j.url
}
