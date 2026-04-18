import { createClient } from '@supabase/supabase-js'
import type { VercelRequest } from '@vercel/node'

import { requireEnv } from './env.ts'

export function getBearerToken(req: VercelRequest): string | null {
  const h = req.headers.authorization
  if (!h || typeof h !== 'string') return null
  const m = /^Bearer\s+(.+)$/i.exec(h.trim())
  return m?.[1] ?? null
}

export async function requireUserId(req: VercelRequest): Promise<string | null> {
  const jwt = getBearerToken(req)
  if (!jwt) return null
  const url = requireEnv('SUPABASE_URL')
  const anon = requireEnv('SUPABASE_ANON_KEY')
  const supabase = createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(jwt)
  if (error || !user) return null
  return user.id
}
