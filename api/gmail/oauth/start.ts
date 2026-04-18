import type { VercelRequest, VercelResponse } from '@vercel/node'

import { requireUserId } from '../../_lib/auth'
import { requireEnv } from '../../_lib/env'
import { createOAuthState } from '../../_lib/oauth-state'

/** Google OAuth scopes (space-separated). */
const SCOPES = ['openid', 'email', 'profile', 'https://www.googleapis.com/auth/gmail.send'].join(' ')

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
    const secret = requireEnv('OAUTH_STATE_SECRET')
    const state = createOAuthState(secret, userId)
    const params = new URLSearchParams({
      client_id: requireEnv('GOOGLE_CLIENT_ID'),
      redirect_uri: requireEnv('GOOGLE_OAUTH_REDIRECT_URI'),
      response_type: 'code',
      scope: SCOPES,
      state,
      access_type: 'offline',
      prompt: 'consent',
      include_granted_scopes: 'true',
    })
    const url = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
    res.status(200).json({ url })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'oauth_start_failed' })
  }
}
