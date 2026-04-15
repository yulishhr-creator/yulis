import type { Session } from '@supabase/supabase-js'
import { useCallback, useEffect, useMemo, useState } from 'react'

import { AuthContext, type AuthState } from '@/auth/auth-context'
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase'
import { seedDemoIfEmpty } from '@/lib/seed'

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(isSupabaseConfigured)

  useEffect(() => {
    const supabase = getSupabase()
    if (!supabase) return

    void supabase.auth
      .getSession()
      .then(({ data }) => {
        // #region agent log
        fetch('http://127.0.0.1:7883/ingest/253f2f27-b59e-401e-9330-b3044ff73852', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': 'da550c' },
          body: JSON.stringify({
            sessionId: 'da550c',
            runId: 'pre',
            hypothesisId: 'H2',
            location: 'AuthProvider.tsx:getSession',
            message: 'getSession settled',
            data: { hasSession: Boolean(data.session) },
            timestamp: Date.now(),
          }),
        }).catch(() => {})
        // #endregion
        setSession(data.session ?? null)
        setLoading(false)
      })
      .catch((e) => {
        // #region agent log
        fetch('http://127.0.0.1:7883/ingest/253f2f27-b59e-401e-9330-b3044ff73852', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': 'da550c' },
          body: JSON.stringify({
            sessionId: 'da550c',
            runId: 'pre',
            hypothesisId: 'H2',
            location: 'AuthProvider.tsx:getSession',
            message: 'getSession rejected',
            data: { err: String((e as Error)?.message ?? e).slice(0, 120) },
            timestamp: Date.now(),
          }),
        }).catch(() => {})
        // #endregion
        setLoading(false)
      })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, next) => {
      // #region agent log
      fetch('http://127.0.0.1:7883/ingest/253f2f27-b59e-401e-9330-b3044ff73852', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': 'da550c' },
        body: JSON.stringify({
          sessionId: 'da550c',
          runId: 'pre',
          hypothesisId: 'H2',
          location: 'AuthProvider.tsx:onAuthStateChange',
          message: 'auth event',
          data: { event, hasSession: Boolean(next) },
          timestamp: Date.now(),
        }),
      }).catch(() => {})
      // #endregion
      setSession(next)
      // Unblock UI even if getSession() hangs (storage lock, extension interference).
      setLoading(false)
    })

    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    const supabase = getSupabase()
    const uid = session?.user?.id
    if (!supabase || !uid) return
    void seedDemoIfEmpty(supabase, uid)
  }, [session?.user?.id])

  const signIn = useCallback(async (email: string, password: string) => {
    const supabase = getSupabase()
    if (!supabase) return { error: new Error('Supabase not configured') }
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error: error ? new Error(error.message) : null }
  }, [])

  const signUp = useCallback(async (email: string, password: string) => {
    const supabase = getSupabase()
    if (!supabase) return { error: new Error('Supabase not configured') }
    const { error } = await supabase.auth.signUp({ email, password })
    return { error: error ? new Error(error.message) : null }
  }, [])

  const signOut = useCallback(async () => {
    const supabase = getSupabase()
    await supabase?.auth.signOut()
  }, [])

  const value = useMemo<AuthState>(
    () => ({
      user: session?.user ?? null,
      session,
      loading,
      configured: isSupabaseConfigured,
      signIn,
      signUp,
      signOut,
    }),
    [session, loading, signIn, signUp, signOut],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
