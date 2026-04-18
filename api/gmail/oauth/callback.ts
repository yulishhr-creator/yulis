import type { VercelRequest, VercelResponse } from '@vercel/node'

import { appOrigin, requireEnv } from '../../_lib/env'
import { exchangeAuthorizationCode, fetchGoogleEmail } from '../../_lib/google-oauth'
import { parseOAuthState } from '../../_lib/oauth-state'
import { parseMissingEnvKey } from '../../_lib/respond'
import { createServiceRoleClient } from '../../_lib/supabase-admin'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.status(405).send('Method Not Allowed')
    return
  }

  const origin = appOrigin()

  try {
    const oauthErr = typeof req.query.error === 'string' ? req.query.error : null
    if (oauthErr) {
      res.redirect(302, `${origin}/settings/gmail?error=${encodeURIComponent(oauthErr)}`)
      return
    }

    const code = typeof req.query.code === 'string' ? req.query.code : null
    const stateEnc = typeof req.query.state === 'string' ? req.query.state : null
    if (!code || !stateEnc) {
      res.redirect(302, `${origin}/settings/gmail?error=missing_params`)
      return
    }

    const secret = requireEnv('OAUTH_STATE_SECRET')
    const parsed = parseOAuthState(secret, stateEnc)
    if (!parsed) {
      res.redirect(302, `${origin}/settings/gmail?error=invalid_state`)
      return
    }

    const tokens = await exchangeAuthorizationCode(code)
    const email = await fetchGoogleEmail(tokens.access_token)

    const admin = createServiceRoleClient()
    const { data: existing } = await admin
      .from('user_oauth_integrations')
      .select('refresh_token_encrypted')
      .eq('user_id', parsed.userId)
      .eq('provider', 'gmail')
      .maybeSingle()

    const refresh =
      tokens.refresh_token ??
      (existing?.refresh_token_encrypted as string | null | undefined) ??
      null
    if (!refresh) {
      res.redirect(302, `${origin}/settings/gmail?error=no_refresh_token`)
      return
    }

    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString()

    const { error } = await admin.from('user_oauth_integrations').upsert(
      {
        user_id: parsed.userId,
        provider: 'gmail',
        provider_account_email: email,
        refresh_token_encrypted: refresh,
        access_token: tokens.access_token,
        access_token_expires_at: expiresAt,
        scope: tokens.scope ?? null,
        revoked_at: null,
      },
      { onConflict: 'user_id,provider' },
    )

    if (error) throw error

    res.redirect(302, `${origin}/settings/gmail?connected=1`)
  } catch (e) {
    const key = parseMissingEnvKey(e)
    if (key) {
      res.redirect(302, `${origin}/settings/gmail?error=${encodeURIComponent(`missing_env:${key}`)}`)
      return
    }
    console.error(e)
    res.redirect(302, `${origin}/settings/gmail?error=callback_failed`)
  }
}
