import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useAuth } from '@/auth/useAuth'
import { getSupabase } from '@/lib/supabase'
import { useToast } from '@/hooks/useToast'
import { ScreenHeader } from '@/components/layout/ScreenHeader'

const LIST_CHOICES = [
  { key: 'industry', label: 'Industry' },
  { key: 'payment_term_preset', label: 'Payment term preset' },
  { key: 'candidate_outcome_label', label: 'Candidate outcome label' },
] as const

function slugifyLabel(label: string): string {
  const x = label
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
  return (x || 'item').slice(0, 80)
}

export function ListSettingsPage() {
  const { user } = useAuth()
  const supabase = getSupabase()
  const qc = useQueryClient()
  const { error: toastError } = useToast()
  const [listKey, setListKey] = useState<string>(LIST_CHOICES[0]!.key)
  const [valueToAdd, setValueToAdd] = useState('')
  const [showActiveValues, setShowActiveValues] = useState(true)

  const q = useQuery({
    queryKey: ['list-items', user?.id, listKey],
    enabled: Boolean(supabase && user),
    queryFn: async () => {
      const { data, error } = await supabase!
        .from('list_items')
        .select('*')
        .eq('user_id', user!.id)
        .eq('list_key', listKey)
        .eq('archived', false)
        .order('sort_order')
      if (error) throw error
      return data ?? []
    },
  })

  const insert = useMutation({
    mutationFn: async () => {
      const label = valueToAdd.trim()
      if (!label) throw new Error('empty')

      let base = slugifyLabel(label)
      let value = base
      let suffix = 0
      // Retry on unique (user_id, list_key, value) violation
      for (;;) {
        const { error } = await supabase!.from('list_items').insert({
          user_id: user!.id,
          list_key: listKey,
          value,
          label,
          sort_order: (q.data?.length ?? 0) + 1,
        })
        if (!error) return
        if (error.code !== '23505') throw error
        suffix += 1
        value = `${base}_${suffix}`
        if (suffix > 50) throw new Error('Could not generate a unique value')
      }
    },
    onSuccess: async () => {
      setValueToAdd('')
      await qc.invalidateQueries({ queryKey: ['list-items'] })
    },
    onError: (err) => {
      toastError(err instanceof Error ? err.message : 'Could not add value')
    },
  })

  return (
    <div className="mx-auto max-w-xl">
      <ScreenHeader title="Lists" subtitle="Add options used in dropdowns across the app." backTo="/settings" />

      <div className="mt-2">
        <label className="text-sm font-medium">
          Choose list
          <select
            value={listKey}
            onChange={(e) => setListKey(e.target.value)}
            className="border-line bg-white/80 mt-1 w-full rounded-xl border px-3 py-2 dark:border-line-dark dark:bg-stone-900/50"
          >
            {LIST_CHOICES.map(({ key, label }) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <form
        className="border-line bg-white/60 mt-4 flex flex-col gap-3 rounded-2xl border p-4 dark:border-line-dark dark:bg-stone-900/40"
        onSubmit={(e) => {
          e.preventDefault()
          insert.mutate()
        }}
      >
        <label className="text-sm font-medium">
          Value to add
          <input
            value={valueToAdd}
            onChange={(e) => setValueToAdd(e.target.value)}
            className="border-line mt-1 w-full rounded-xl border px-3 py-2 dark:border-line-dark dark:bg-stone-900/50"
            placeholder="Shown in dropdowns"
            required
          />
        </label>
        <button type="submit" className="bg-accent text-stone-50 w-fit rounded-full px-5 py-2 text-sm font-semibold" disabled={insert.isPending}>
          {insert.isPending ? 'Adding…' : 'Add'}
        </button>
      </form>

      <div className="mt-8 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-stitch-head text-lg font-extrabold text-[#302e2b] dark:text-stone-100">Active values</h2>
        <button
          type="button"
          onClick={() => setShowActiveValues((v) => !v)}
          className="border-line text-ink-muted hover:border-[#fd8863]/40 rounded-full border bg-white/80 px-3 py-1.5 text-xs font-bold tracking-wide uppercase dark:border-line-dark dark:bg-stone-800 dark:text-stone-400 dark:hover:text-stone-200"
        >
          {showActiveValues ? 'Hide' : 'Show'}
        </button>
      </div>

      {showActiveValues ? (
        <ul className="mt-3 space-y-2">
          {(q.data ?? []).length === 0 ? (
            <li className="text-ink-muted text-sm">No values yet for this list.</li>
          ) : (
            (q.data ?? []).map((row) => (
              <li key={row.id} className="border-line bg-white/60 rounded-xl border px-3 py-2 text-sm dark:border-line-dark dark:bg-stone-900/40">
                <span className="font-medium">{row.label}</span>
                <span className="text-ink-muted"> · {row.value}</span>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  )
}
