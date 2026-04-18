import type { VercelRequest, VercelResponse } from '@vercel/node'

import { requireUserId } from '../_lib/auth'
import { createServiceRoleClient } from '../_lib/supabase-admin'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
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
    const { data, error } = await admin
      .from('user_oauth_integrations')
      .select('provider_account_email, revoked_at')
      .eq('user_id', userId)
      .eq('provider', 'gmail')
      .maybeSingle()

    if (error) throw error

    const connected = Boolean(data && !data.revoked_at && data.provider_account_email)
    res.status(200).json({
      connected,
      email: connected ? data!.provider_account_email : null,
    })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: 'status_failed' })
  }
}
