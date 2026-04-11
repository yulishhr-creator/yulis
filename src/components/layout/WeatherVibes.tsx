import { Cloud, CloudRain, CloudSnow, CloudSun, Moon, Sun, Zap } from 'lucide-react'

import { useOpenMeteoWeather, type WeatherMood } from '@/hooks/useOpenMeteoWeather'

function MoodIcon({ mood, isDay, className }: { mood: WeatherMood; isDay: boolean; className?: string }) {
  const cn = className ?? 'h-5 w-5'
  switch (mood) {
    case 'clear':
      return isDay ? <Sun className={cn} aria-hidden /> : <Moon className={cn} aria-hidden />
    case 'partly':
      return isDay ? <CloudSun className={cn} aria-hidden /> : <Cloud className={cn} aria-hidden />
    case 'fog':
      return <Cloud className={cn} aria-hidden />
    case 'rain':
      return <CloudRain className={cn} aria-hidden />
    case 'snow':
      return <CloudSnow className={cn} aria-hidden />
    case 'storm':
      return <Zap className={cn} aria-hidden />
    default:
      return <CloudSun className={cn} aria-hidden />
  }
}

/** Compact weather + vibe line for the sidebar (°C only). */
export function WeatherVibes() {
  const { data, loading, error, phrase } = useOpenMeteoWeather()

  return (
    <div className="border-line border-b px-4 py-3 dark:border-line-dark">
      <div className="flex items-center gap-2.5">
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#f8b3c8]/35 via-[#ec6f9d]/25 to-[#5a2b7e]/20 text-[#5a2b7e] shadow-inner dark:from-pink-500/20 dark:via-fuchsia-500/15 dark:to-violet-900/30 dark:text-pink-200"
          aria-hidden
        >
          {loading ? (
            <span className="h-4 w-4 animate-pulse rounded-full bg-current opacity-40" />
          ) : data ? (
            <MoodIcon mood={data.mood} isDay={data.isDay} className="h-5 w-5" />
          ) : (
            <CloudSun className="h-5 w-5 opacity-50" aria-hidden />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-ink font-stitch-head text-lg font-extrabold tabular-nums leading-none dark:text-stone-100">
            {loading ? (
              <span className="text-ink-muted text-sm font-semibold dark:text-stone-500">…</span>
            ) : error || !data ? (
              <span className="text-ink-muted text-sm font-semibold dark:text-stone-500">—°C</span>
            ) : (
              <span className="bg-gradient-to-r from-[#ec6f9d] to-[#5a2b7e] bg-clip-text text-transparent dark:from-pink-300 dark:to-violet-300">
                {data.tempC}°C
              </span>
            )}
          </p>
          <p className="text-ink-muted mt-1 text-[11px] font-medium leading-snug dark:text-stone-400">
            {loading ? 'Scanning the sky…' : phrase || 'Step outside when you can'}
          </p>
        </div>
      </div>
    </div>
  )
}
