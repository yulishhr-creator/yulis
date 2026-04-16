import { createContext } from 'react'

export type ToastKind = 'success' | 'error' | 'info'

export type ToastItem = {
  id: number
  message: string
  kind: ToastKind
}

export type ToastContextValue = {
  push: (message: string, kind?: ToastKind) => void
  success: (message: string) => void
  /** Pass a string (shown as-is if short) or an Error / thrown value for safe mapping. */
  error: (message: string | unknown) => void
}

export const ToastContext = createContext<ToastContextValue | null>(null)
