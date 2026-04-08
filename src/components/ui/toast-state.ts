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
  error: (message: string) => void
}

export const ToastContext = createContext<ToastContextValue | null>(null)
