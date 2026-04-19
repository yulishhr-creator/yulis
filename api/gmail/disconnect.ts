import type { VercelRequest, VercelResponse } from '@vercel/node'

import { requireUserId } from '../_lib/auth.js'
import { revokeGoogleToken } from '../_lib/google-oauth.js'
import { sendApiError } from '../_lib/respond.js'
import { createServiceRoleClient } from '../_lib/supabase-admin.js'

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

    const admin = createServiceRoleClient()
    const { data: row } = await admin
      .from('user_oauth_integrations')
      .select('refresh_token_encrypted')
      .eq('user_id', userId)
      .eq('provider', 'gmail')
      .maybeSingle()

    const rt = row?.refresh_token_encrypted as string | undefined
    if (rt) {
      try {
        await revokeGoogleToken(rt)
      } catch (e) {
        console.error('revoke_failed', e)
      }
    }

    const { error } = await admin.from('user_oauth_integrations').delete().eq('user_id', userId).eq('provider', 'gmail')

    if (error) throw error

    res.status(200).json({ ok: true })
  } catch (e) {
    sendApiError(res, 500, e, 'disconnect_failed')
  }
}
