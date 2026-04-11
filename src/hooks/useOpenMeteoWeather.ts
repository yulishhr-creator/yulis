import { useCallback, useEffect, useState } from 'react'

export type WeatherMood = 'clear' | 'partly' | 'fog' | 'rain' | 'snow' | 'storm'

export type WeatherSnapshot = {
  tempC: number
  code: number
  isDay: boolean
  mood: WeatherMood
}

const PARIS_FALLBACK = { latitude: 48.8566, longitude: 2.3522 }

function moodFromCode(code: number): WeatherMood {
  if (code === 0) return 'clear'
  if (code >= 1 && code <= 3) return 'partly'
  if (code >= 45 && code <= 48) return 'fog'
  if (code >= 51 && code <= 67) return 'rain'
  if (code >= 71 && code <= 77) return 'snow'
  if (code >= 80) return 'storm'
  return 'partly'
}

/** Short vibe line from local hour + conditions (Celsius-focused copy). */
export function weatherVibePhrase(hour: number, mood: WeatherMood): string {
  const night = hour >= 21 || hour < 5
  const dawn = hour >= 5 && hour < 8
  const morning = hour >= 8 && hour < 12
  const afternoon = hour >= 12 && hour < 17
  const golden = hour >= 17 && hour < 20

  if (mood === 'rain' || mood === 'storm') {
    if (night) return 'Cozy rain rhythm tonight'
    if (morning) return 'Misty start — coffee weather'
    return 'Drizzle mood, stay sharp'
  }
  if (mood === 'snow') {
    return 'Quiet flakes outside'
  }
  if (mood === 'fog') {
    return 'Soft fog, slow tempo'
  }
  if (mood === 'partly') {
    if (dawn) return 'Pastel skies waking up'
    if (golden) return 'Twilight feeling outside'
    if (night) return 'Clouds drifting overhead'
    return 'Partly dreamy skies'
  }
  if (mood === 'clear') {
    if (dawn) return 'First light energy'
    if (morning) return 'Morning Vibes'
    if (afternoon) return 'Bright focus hours'
    if (golden) return 'Golden hour glow'
    if (night) return 'Clear night clarity'
  }
  return 'Fresh air moment'
}

async function fetchWeather(lat: number, lon: number): Promise<WeatherSnapshot> {
  const u = new URL('https://api.open-meteo.com/v1/forecast')
  u.searchParams.set('latitude', String(lat))
  u.searchParams.set('longitude', String(lon))
  u.searchParams.set('current', 'temperature_2m,weather_code,is_day')
  u.searchParams.set('temperature_unit', 'celsius')
  const res = await fetch(u.toString())
  if (!res.ok) throw new Error('weather')
  const data = (await res.json()) as {
    current: { temperature_2m: number; weather_code: number; is_day: number }
  }
  const c = data.current
  const code = c.weather_code ?? 0
  return {
    tempC: Math.round(c.temperature_2m),
    code,
    isDay: c.is_day === 1,
    mood: moodFromCode(code),
  }
}

export function useOpenMeteoWeather() {
  const [data, setData] = useState<WeatherSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback((lat: number, lon: number) => {
    setLoading(true)
    setError(null)
    void fetchWeather(lat, lon)
      .then(setData)
      .catch(() => setError('unavailable'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (!navigator.geolocation) {
      load(PARIS_FALLBACK.latitude, PARIS_FALLBACK.longitude)
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => load(pos.coords.latitude, pos.coords.longitude),
      () => load(PARIS_FALLBACK.latitude, PARIS_FALLBACK.longitude),
      { maximumAge: 30 * 60 * 1000, timeout: 12_000 },
    )
  }, [load])

  const hour = new Date().getHours()
  const phrase = data ? weatherVibePhrase(hour, data.mood) : ''

  return { data, loading, error, phrase }
}
