import type { VercelRequest, VercelResponse } from '@vercel/node'

import { requireUserId } from '../_lib/auth.js'
import { createServiceRoleClient } from '../_lib/supabase-admin.js'
import { agentDebugLog } from '../_lib/agent-debug-log.js'
import { sendApiError } from '../_lib/respond.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'method_not_allowed' })
    return
  }

  // #region agent log
  agentDebugLog({
    location: 'api/gmail/status.ts:entry',
    message: 'status_entry',
    hypothesisId: 'H3',
    data: { hasAuthHeader: Boolean(req.headers?.authorization) },
  })
  // #endregion
  try {
    const hardcodedEmail = process.env.GMAIL_FROM_EMAIL?.trim()
    const hardcodedToken = process.env.GMAIL_REFRESH_TOKEN?.trim()
    if (hardcodedEmail && hardcodedToken) {
      res.status(200).json({ connected: true, email: hardcodedEmail })
      return
    }

    const userId = await requireUserId(req)
    if (!userId) {
      // #region agent log
      agentDebugLog({
        location: 'api/gmail/status.ts:unauthorized',
        message: 'status_no_user',
        hypothesisId: 'H3',
        data: {},
      })
      // #endregion
      res.status(401).json({ error: 'unauthorized' })
      return
    }

    const admin = createServiceRoleClient()
    const { data, error } = await admin
      .from('user_oauth_integrations')
      .select('provider_account_email, revoked_at')
      .eq('user_id', userId)
      .eq('provider', 'gmail')
      .maybeSingle()

    if (error) {
      // #region agent log
      agentDebugLog({
        location: 'api/gmail/status.ts:supabase',
        message: 'status_supabase_error',
        hypothesisId: 'H4',
        data: { code: error.code, hint: error.hint ?? null },
      })
      // #endregion
      throw error
    }

    const connected = Boolean(data && !data.revoked_at && data.provider_account_email)
    // #region agent log
    agentDebugLog({
      location: 'api/gmail/status.ts:success',
      message: 'status_ok',
      hypothesisId: 'H4',
      data: { connected },
    })
    // #endregion
    res.status(200).json({
      connected,
      email: connected ? data!.provider_account_email : null,
    })
  } catch (e) {
    // #region agent log
    const msg = e instanceof Error ? e.message : String(e)
    agentDebugLog({
      location: 'api/gmail/status.ts:catch',
      message: 'status_error',
      hypothesisId: 'H1',
      data: {
        errName: e instanceof Error ? e.name : 'unknown',
        isMissingEnv: msg.startsWith('Missing required environment variable'),
      },
    })
    // #endregion
    sendApiError(res, 500, e, 'status_failed')
  }
}
