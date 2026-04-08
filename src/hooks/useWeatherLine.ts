import { useEffect, useState } from 'react'

/** Open-Meteo: no API key. Best-effort; fails quietly. */
export function useWeatherLine(): string | null {
  const [line, setLine] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      try {
        const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
          if (!navigator.geolocation) {
            reject(new Error('no geo'))
            return
          }
          navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 8000 })
        })
        const lat = pos.coords.latitude
        const lon = pos.coords.longitude
        const w = await fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code&timezone=auto`,
        )
        const j = (await w.json()) as {
          current?: { temperature_2m?: number; weather_code?: number }
        }
        const t = j.current?.temperature_2m
        if (cancelled || t === undefined) return
        setLine(`Outside ~${Math.round(t)}°C nearby`)
      } catch {
        if (!cancelled) setLine(null)
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [])

  return line
}
