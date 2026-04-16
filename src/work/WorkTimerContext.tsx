/* eslint-disable react-refresh/only-export-components -- WorkTimerContext is consumed only by useWorkTimer.ts */
import type { ReactNode } from 'react'
import { createContext, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'

import { useAuth } from '@/auth/useAuth'
import { getSupabase } from '@/lib/supabase'

type OpenEntry = {
  id: string
  positionId: string
  positionTitle: string
  startedAt: string
}

type WorkTimerContextValue = {
  open: OpenEntry | null
  elapsedSeconds: number
  loading: boolean
  refresh: () => Promise<void>
  start: (positionId: string, positionTitle: string) => Promise<{ error?: string }>
  stop: () => Promise<{ error?: string }>
}

export const WorkTimerContext = createContext<WorkTimerContextValue | null>(null)

export function WorkTimerProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const supabase = getSupabase()
  const qc = useQueryClient()
  const uid = user?.id
  const [open, setOpen] = useState<OpenEntry | null>(null)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [loading, setLoading] = useState(true)
  const tickRef = useRef<number | null>(null)

  const refresh = useCallback(async () => {
    if (!supabase || !uid) {
      setOpen(null)
      setLoading(false)
      return
    }
    setLoading(true)
    const { data, error } = await supabase
      .from('work_time_entries')
      .select('id, position_id, started_at, positions ( title )')
      .eq('user_id', uid)
      .is('ended_at', null)
      .maybeSingle()
    setLoading(false)
    if (error || !data) {
      setOpen(null)
      return
    }
    const pos = data.positions as unknown as { title: string } | null
    setOpen({
      id: data.id,
      positionId: data.position_id,
      positionTitle: pos?.title ?? 'Role',
      startedAt: data.started_at,
    })
  }, [supabase, uid])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    if (!open?.startedAt) {
      setElapsedSeconds(0)
      return
    }
    const startMs = new Date(open.startedAt).getTime()
    const tick = () => setElapsedSeconds(Math.max(0, Math.floor((Date.now() - startMs) / 1000)))
    tick()
    tickRef.current = window.setInterval(tick, 1000)
    return () => {
      if (tickRef.current) window.clearInterval(tickRef.current)
    }
  }, [open?.startedAt, open?.id])

  const start = useCallback(
    async (positionId: string, positionTitle: string) => {
      if (!supabase || !uid) return { error: 'Not signed in' }
      const { data: existing } = await supabase
        .from('work_time_entries')
        .select('id')
        .eq('user_id', uid)
        .is('ended_at', null)
        .maybeSingle()
      if (existing) return { error: 'Stop the current timer first.' }
      const { data, error } = await supabase
        .from('work_time_entries')
        .insert({
          user_id: uid,
          position_id: positionId,
        })
        .select('id, position_id, started_at')
        .single()
      if (error) return { error: error.message }
      setOpen({
        id: data.id,
        positionId: data.position_id,
        positionTitle,
        startedAt: data.started_at,
      })
      await qc.invalidateQueries({ queryKey: ['work-time-entries'] })
      return {}
    },
    [supabase, uid, qc],
  )

  const stop = useCallback(async () => {
    if (!supabase || !uid || !open) return { error: 'No active timer' }
    const ended = new Date().toISOString()
    const startMs = new Date(open.startedAt).getTime()
    const durationSeconds = Math.max(0, Math.floor((Date.now() - startMs) / 1000))
    const { error } = await supabase
      .from('work_time_entries')
      .update({ ended_at: ended, duration_seconds: durationSeconds })
      .eq('id', open.id)
      .eq('user_id', uid)
    if (error) return { error: error.message }
    setOpen(null)
    setElapsedSeconds(0)
    await qc.invalidateQueries({ queryKey: ['work-time-entries'] })
    return {}
  }, [supabase, uid, open, qc])

  const value = useMemo<WorkTimerContextValue>(
    () => ({
      open,
      elapsedSeconds,
      loading,
      refresh,
      start,
      stop,
    }),
    [open, elapsedSeconds, loading, refresh, start, stop],
  )

  return <WorkTimerContext.Provider value={value}>{children}</WorkTimerContext.Provider>
}
