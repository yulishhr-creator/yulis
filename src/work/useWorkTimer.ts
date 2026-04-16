import { useContext } from 'react'

import { WorkTimerContext } from './WorkTimerContext'

export function useWorkTimer() {
  const ctx = useContext(WorkTimerContext)
  if (!ctx) throw new Error('useWorkTimer must be used within WorkTimerProvider')
  return ctx
}
