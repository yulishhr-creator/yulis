import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

type OffCanvasContextValue = {
  openCount: number
  open: () => void
  close: () => void
}

const OffCanvasContext = createContext<OffCanvasContextValue | null>(null)

export function OffCanvasProvider({ children }: { children: ReactNode }) {
  const [openCount, setOpenCount] = useState(0)

  const open = useCallback(() => {
    setOpenCount((n) => n + 1)
  }, [])

  const close = useCallback(() => {
    setOpenCount((n) => Math.max(0, n - 1))
  }, [])

  const value = useMemo(
    () => ({
      openCount,
      open,
      close,
    }),
    [openCount, open, close],
  )

  return <OffCanvasContext.Provider value={value}>{children}</OffCanvasContext.Provider>
}

export function useOffCanvas(): OffCanvasContextValue {
  const ctx = useContext(OffCanvasContext)
  if (!ctx) {
    throw new Error('useOffCanvas must be used within OffCanvasProvider')
  }
  return ctx
}

/** Returns null when no provider (e.g. outside the app shell). */
export function useOffCanvasOptional(): OffCanvasContextValue | null {
  return useContext(OffCanvasContext)
}

/** Registers one open overlay (drawer, modal, etc.). */
export function OffCanvasRegistrar({ active }: { active: boolean }) {
  const { open, close } = useOffCanvas()

  useEffect(() => {
    if (!active) return
    open()
    return () => close()
  }, [active, open, close])

  return null
}
