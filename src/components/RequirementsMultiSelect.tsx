import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useAuth } from '@/auth/useAuth'
import { getSupabase } from '@/lib/supabase'
import { useToast } from '@/hooks/useToast'
import { slugifyListItemValue } from '@/lib/listItemSlug'

const LIST_KEY = 'requirements' as const

type Row = { id: string; value: string; label: string; sort_order: number }

type Props = {
  value: string[]
  onChange: (next: string[]) => void
  disabled?: boolean
  className?: string
}

export function RequirementsMultiSelect({ value, onChange, disabled, className }: Props) {
  const { user } = useAuth()
  const supabase = getSupabase()
  const qc = useQueryClient()
  const { success, error: toastError } = useToast()
  const [newLabel, setNewLabel] = useState('')

  const q = useQuery({
    queryKey: ['list-items', user?.id, LIST_KEY],
    enabled: Boolean(supabase && user),
    queryFn: async () => {
      const { data, error } = await supabase!
        .from('list_items')
        .select('id,value,label,sort_order')
        .eq('user_id', user!.id)
        .eq('list_key', LIST_KEY)
        .eq('archived', false)
        .order('sort_order')
      if (error) throw error
      return (data ?? []) as Row[]
    },
  })

  const insertMutation = useMutation({
    mutationFn: async (label: string) => {
      const lbl = label.trim()
      if (!lbl) throw new Error('Enter a label')
      const existing = q.data ?? []
      let base = slugifyListItemValue(lbl)
      let slug = base
      let suffix = 0
      for (;;) {
        const { error } = await supabase!.from('list_items').insert({
          user_id: user!.id,
          list_key: LIST_KEY,
          value: slug,
          label: lbl,
          sort_order: existing.length + 1 + suffix,
        })
        if (!error) return slug
        if (error.code !== '23505') throw error
        suffix += 1
        slug = `${base}_${suffix}`
        if (suffix > 50) throw new Error('Could not generate a unique value')
      }
    },
    onSuccess: async (slug) => {
      setNewLabel('')
      success('Requirement added')
      await qc.invalidateQueries({ queryKey: ['list-items'] })
      if (!value.includes(slug)) onChange([...value, slug])
    },
    onError: (err) => {
      toastError(err instanceof Error ? err.message : 'Could not add')
    },
  })

  function toggle(v: string) {
    if (disabled) return
    if (value.includes(v)) onChange(value.filter((x) => x !== v))
    else onChange([...value, v])
  }

  const rows = q.data ?? []
  const labelByValue = new Map(rows.map((r) => [r.value, r.label]))
  const orphanValues = value.filter((v) => !labelByValue.has(v))

  return (
    <div className={className}>
      <div className="mt-1 flex flex-wrap gap-2">
        {rows.map((r) => {
          const sel = value.includes(r.value)
          return (
            <button
              key={r.id}
              type="button"
              disabled={disabled}
              onClick={() => toggle(r.value)}
              className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                sel ? 'border-accent bg-accent text-white' : 'border-line bg-white/80 dark:border-line-dark dark:bg-stone-900/50'
              }`}
            >
              {r.label}
            </button>
          )
        })}
        {orphanValues.map((v) => (
          <button
            key={`orphan-${v}`}
            type="button"
            disabled={disabled}
            onClick={() => toggle(v)}
            className="rounded-full border border-amber-400/80 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-950 dark:border-amber-500/50 dark:bg-amber-950/40 dark:text-amber-100"
            title="Not in your current list — tap to remove or keep until you add a matching list item in Settings"
          >
            {v}
          </button>
        ))}
        {rows.length === 0 && !q.isLoading ? (
          <span className="text-ink-muted text-xs">No requirements in your list yet — add one below or under Settings → Lists.</span>
        ) : null}
      </div>
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <label className="min-w-0 flex-1 text-xs font-medium">
          Add new requirement
          <input
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            placeholder="e.g. Security clearance"
            className="border-line mt-1 w-full rounded-xl border px-3 py-2 text-sm dark:border-line-dark dark:bg-stone-900/50"
            disabled={disabled}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                insertMutation.mutate(newLabel)
              }
            }}
          />
        </label>
        <button
          type="button"
          disabled={disabled || insertMutation.isPending || !newLabel.trim()}
          onClick={() => insertMutation.mutate(newLabel)}
          className="bg-ink/90 rounded-full px-4 py-2 text-sm font-medium text-white dark:bg-stone-200 dark:text-stone-900"
        >
          {insertMutation.isPending ? 'Adding…' : 'Add & select'}
        </button>
      </div>
    </div>
  )
}
