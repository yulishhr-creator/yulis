import { Cloud, CloudRain, CloudSnow, CloudSun, Moon, Sun, Zap } from 'lucide-react'

import { useOpenMeteoWeather, type WeatherMood } from '@/hooks/useOpenMeteoWeather'

function MoodIcon({ mood, isDay, className }: { mood: WeatherMood; isDay: boolean; className?: string }) {
  const cn = className ?? 'h-4 w-4'
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

/** Compact weather + phrase for the main header (outside the sidebar). */
export function WeatherVibes() {
  const { data, loading, error, phrase } = useOpenMeteoWeather()

  return (
    <div
      className="flex min-w-0 max-w-[min(100%,12rem)] items-center gap-2 sm:max-w-[14rem]"
      aria-live="polite"
    >
      <div
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-[#f8b3c8]/35 via-[#ec6f9d]/25 to-[#5a2b7e]/20 text-[#5a2b7e] shadow-inner dark:from-pink-500/20 dark:via-fuchsia-500/15 dark:to-violet-900/30 dark:text-pink-200"
        aria-hidden
      >
        {loading ? (
          <span className="h-3 w-3 animate-pulse rounded-full bg-current opacity-40" />
        ) : data ? (
          <MoodIcon mood={data.mood} isDay={data.isDay} />
        ) : (
          <CloudSun className="h-4 w-4 opacity-50" aria-hidden />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-ink text-sm font-extrabold tabular-nums leading-none dark:text-stone-100">
          {loading ? (
            <span className="text-ink-muted text-xs font-semibold dark:text-stone-500">…</span>
          ) : error || !data ? (
            <span className="text-ink-muted text-xs font-semibold dark:text-stone-500">—°C</span>
          ) : (
            <span>{data.tempC}°C</span>
          )}
        </p>
        <p className="text-ink-muted mt-0.5 truncate text-[10px] font-medium leading-tight dark:text-stone-400">
          {loading ? 'Scanning the sky…' : phrase || 'Step outside when you can'}
        </p>
      </div>
    </div>
  )
}
