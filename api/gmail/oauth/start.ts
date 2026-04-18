import type { VercelRequest, VercelResponse } from '@vercel/node'

import { requireUserId } from '../../_lib/auth'
import { requireEnv } from '../../_lib/env'
import { createOAuthState } from '../../_lib/oauth-state'
import { agentDebugLog } from '../../_lib/agent-debug-log'
import { sendApiError } from '../../_lib/respond'

/** Google OAuth scopes (space-separated). */
const SCOPES = ['openid', 'email', 'profile', 'https://www.googleapis.com/auth/gmail.send'].join(' ')

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' })
    return
  }
  // #region agent log
  agentDebugLog({
    location: 'api/gmail/oauth/start.ts:entry',
    message: 'oauth_start_entry',
    hypothesisId: 'H3',
    data: { hasAuthHeader: Boolean(req.headers?.authorization) },
  })
  // #endregion
  try {
    const userId = await requireUserId(req)
    if (!userId) {
      // #region agent log
      agentDebugLog({
        location: 'api/gmail/oauth/start.ts:unauthorized',
        message: 'oauth_start_no_user',
        hypothesisId: 'H3',
        data: {},
      })
      // #endregion
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
    // #region agent log
    agentDebugLog({
      location: 'api/gmail/oauth/start.ts:success',
      message: 'oauth_start_ok',
      hypothesisId: 'H1',
      data: {},
    })
    // #endregion
    res.status(200).json({ url })
  } catch (e) {
    // #region agent log
    const msg = e instanceof Error ? e.message : String(e)
    agentDebugLog({
      location: 'api/gmail/oauth/start.ts:catch',
      message: 'oauth_start_error',
      hypothesisId: 'H1',
      data: {
        errName: e instanceof Error ? e.name : 'unknown',
        isMissingEnv: msg.startsWith('Missing required environment variable'),
      },
    })
    // #endregion
    sendApiError(res, 500, e, 'oauth_start_failed')
  }
}
