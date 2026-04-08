import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router-dom'

import { useAuth } from '@/auth/useAuth'
import { getSupabase } from '@/lib/supabase'

const KEYS = ['industry', 'payment_term_preset', 'candidate_outcome_label'] as const

export function ListSettingsPage() {
  const { user } = useAuth()
  const supabase = getSupabase()
  const qc = useQueryClient()
  const [listKey, setListKey] = useState<string>(KEYS[0]!)
  const [label, setLabel] = useState('')
  const [value, setValue] = useState('')

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
      const { error } = await supabase!.from('list_items').insert({
        user_id: user!.id,
        list_key: listKey,
        value: value.trim() || label.trim().toLowerCase().replace(/\s+/g, '_'),
        label: label.trim() || 'Item',
        sort_order: (q.data?.length ?? 0) + 1,
      })
      if (error) throw error
    },
    onSuccess: async () => {
      setLabel('')
      setValue('')
      await qc.invalidateQueries({ queryKey: ['list-items'] })
    },
  })

  return (
    <div className="mx-auto max-w-xl">
      <p className="text-sm">
        <Link to="/settings" className="text-accent hover:underline dark:text-orange-300">
          Settings
        </Link>
      </p>
      <h1 className="font-display mt-2 text-2xl font-semibold">Lists</h1>
      <p className="text-ink-muted mt-1 text-sm">Add options used in dropdowns across the app.</p>

      <div className="mt-6">
        <label className="text-sm font-medium">
          List
          <select
            value={listKey}
            onChange={(e) => setListKey(e.target.value)}
            className="border-line bg-white/80 mt-1 w-full rounded-xl border px-3 py-2 dark:border-line-dark dark:bg-stone-900/50"
          >
            {KEYS.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </label>
      </div>

      <form
        className="border-line bg-white/60 mt-4 flex flex-col gap-3 rounded-2xl border p-4 dark:border-line-dark dark:bg-stone-900/40"
        onSubmit={(e) => {
          e.preventDefault()
          void insert.mutateAsync()
        }}
      >
        <label className="text-sm font-medium">
          Label
          <input value={label} onChange={(e) => setLabel(e.target.value)} className="border-line mt-1 w-full rounded-xl border px-3 py-2 dark:border-line-dark dark:bg-stone-900/50" required />
        </label>
        <label className="text-sm font-medium">
          Value (slug, optional)
          <input value={value} onChange={(e) => setValue(e.target.value)} className="border-line mt-1 w-full rounded-xl border px-3 py-2 dark:border-line-dark dark:bg-stone-900/50" />
        </label>
        <button type="submit" className="bg-accent text-stone-50 w-fit rounded-full px-5 py-2 text-sm font-semibold">
          Add
        </button>
      </form>

      <ul className="mt-6 space-y-2">
        {(q.data ?? []).map((row) => (
          <li key={row.id} className="border-line bg-white/60 rounded-xl border px-3 py-2 text-sm dark:border-line-dark dark:bg-stone-900/40">
            <span className="font-medium">{row.label}</span>
            <span className="text-ink-muted"> · {row.value}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
