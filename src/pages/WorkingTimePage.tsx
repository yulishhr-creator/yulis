import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, subDays, format } from 'date-fns'

import { useAuth } from '@/auth/useAuth'
import { getSupabase } from '@/lib/supabase'
import { ScreenHeader } from '@/components/layout/ScreenHeader'
import { formatWorkedDuration } from '@/lib/formatWorkedDuration'

type Preset = 'today' | 'week' | 'month' | '7d' | 'custom'

function fmtDuration(sec: number | null | undefined): string {
  if (sec == null || sec <= 0) return '—'
  return formatWorkedDuration(sec)
}

export function WorkingTimePage() {
  const { user } = useAuth()
  const supabase = getSupabase()
  const uid = user?.id
  const [preset, setPreset] = useState<Preset>('week')
  const [customFrom, setCustomFrom] = useState(() => format(subDays(new Date(), 7), 'yyyy-MM-dd'))
  const [customTo, setCustomTo] = useState(() => format(new Date(), 'yyyy-MM-dd'))

  const range = useMemo(() => {
    const now = new Date()
    switch (preset) {
      case 'today':
        return { from: startOfDay(now).toISOString(), to: endOfDay(now).toISOString() }
      case 'week':
        return { from: startOfWeek(now, { weekStartsOn: 0 }).toISOString(), to: endOfWeek(now, { weekStartsOn: 0 }).toISOString() }
      case 'month':
        return { from: startOfMonth(now).toISOString(), to: endOfMonth(now).toISOString() }
      case '7d':
        return { from: startOfDay(subDays(now, 7)).toISOString(), to: endOfDay(now).toISOString() }
      case 'custom': {
        const a = new Date(customFrom + 'T00:00:00')
        const b = new Date(customTo + 'T23:59:59.999')
        return { from: a.toISOString(), to: b.toISOString() }
      }
      default:
        return { from: startOfWeek(now, { weekStartsOn: 0 }).toISOString(), to: endOfWeek(now, { weekStartsOn: 0 }).toISOString() }
    }
  }, [preset, customFrom, customTo])

  const entriesQ = useQuery({
    queryKey: ['work-time-entries', uid, range.from, range.to],
    enabled: Boolean(supabase && uid),
    queryFn: async () => {
      const { data, error } = await supabase!
        .from('work_time_entries')
        .select('id, position_id, started_at, ended_at, duration_seconds, positions ( title, planned_fee_ils )')
        .eq('user_id', uid!)
        .not('ended_at', 'is', null)
        .gte('started_at', range.from)
        .lte('started_at', range.to)
        .order('started_at', { ascending: false })
      if (error) throw error
      return data ?? []
    },
  })

  const totalSeconds = useMemo(() => {
    return (entriesQ.data ?? []).reduce((acc, row) => acc + (row.duration_seconds ?? 0), 0)
  }, [entriesQ.data])

  const hours = totalSeconds / 3600

  return (
    <div className="flex flex-col gap-6">
      <ScreenHeader title="Working time" subtitle="Sessions tied to roles — filter by date range." backTo="/" />

      <div className="flex flex-wrap items-center gap-2">
        {(
          [
            ['today', 'Today'],
            ['week', 'This week'],
            ['month', 'This month'],
            ['7d', 'Last 7 days'],
            ['custom', 'Custom'],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setPreset(k)}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
              preset === k
                ? 'bg-gradient-to-r from-[#9b3e20] to-[#fd8863] text-white shadow-md'
                : 'border-line border bg-white/80 dark:border-line-dark dark:bg-stone-900/50'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {preset === 'custom' ? (
        <div className="flex flex-wrap gap-3 text-sm">
          <label className="flex flex-col gap-1">
            From
            <input
              type="date"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
              className="border-line rounded-xl border px-3 py-2 dark:border-line-dark dark:bg-stone-900/50"
            />
          </label>
          <label className="flex flex-col gap-1">
            To
            <input
              type="date"
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
              className="border-line rounded-xl border px-3 py-2 dark:border-line-dark dark:bg-stone-900/50"
            />
          </label>
        </div>
      ) : null}

      <section className="border-line rounded-2xl border bg-white/80 p-4 dark:border-line-dark dark:bg-stone-900/50">
        <h2 className="text-lg font-extrabold text-[#302e2b] dark:text-stone-100">Summary</h2>
        <p className="text-stitch-muted mt-1 text-sm tabular-nums dark:text-stone-400">
          Total tracked: <span className="text-ink font-semibold dark:text-stone-100">{hours.toFixed(2)}</span> hours (
          {entriesQ.data?.length ?? 0} sessions)
        </p>
        <p className="text-stitch-muted mt-2 text-xs dark:text-stone-500">
          When a role has a planned fee (₪), compare informally to hours — not billing advice.
        </p>
      </section>

      {entriesQ.isLoading ? (
        <p className="text-ink-muted text-sm">Loading…</p>
      ) : (entriesQ.data ?? []).length === 0 ? (
        <p className="text-ink-muted text-sm">No completed sessions in this range. Start a timer from the dashboard.</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-stone-200/80 dark:border-stone-600">
          <table className="w-full min-w-[28rem] text-left text-sm">
            <thead className="border-b border-stone-200 bg-stone-50/90 dark:border-stone-600 dark:bg-stone-800/80">
              <tr>
                <th className="px-3 py-2 font-semibold">Role</th>
                <th className="px-3 py-2 font-semibold">Started</th>
                <th className="px-3 py-2 font-semibold">Duration</th>
                <th className="px-3 py-2 font-semibold">Fee hint</th>
              </tr>
            </thead>
            <tbody>
              {(entriesQ.data ?? []).map((row) => {
                const pos = row.positions as unknown as { title: string; planned_fee_ils: number | null } | null
                const fee = pos?.planned_fee_ils
                const dur = row.duration_seconds ?? 0
                const h = dur / 3600
                return (
                  <tr key={row.id} className="border-b border-stone-100 dark:border-stone-700/80">
                    <td className="px-3 py-2 font-medium">{pos?.title ?? '—'}</td>
                    <td className="text-ink-muted px-3 py-2 tabular-nums dark:text-stone-400">
                      {format(new Date(row.started_at), 'MMM d, HH:mm')}
                    </td>
                    <td className="px-3 py-2 tabular-nums">{fmtDuration(dur)}</td>
                    <td className="text-ink-muted px-3 py-2 text-xs dark:text-stone-400">
                      {fee != null && h > 0 ? `~₪${(fee / h).toFixed(0)}/hr effective` : fee != null ? `Planned ₪${fee}` : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
