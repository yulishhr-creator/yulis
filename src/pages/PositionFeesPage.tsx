import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { useEffect, useState } from 'react'

import { useAuth } from '@/auth/useAuth'
import { getSupabase } from '@/lib/supabase'
import { ScreenHeader } from '@/components/layout/ScreenHeader'
import { useToast } from '@/hooks/useToast'

/** Planned / actual fees and critical-stage milestone threshold for one role (linked from Settings and position header). */
export function PositionFeesPage() {
  const { id } = useParams()
  const { user } = useAuth()
  const supabase = getSupabase()
  const qc = useQueryClient()
  const { success, error: toastError } = useToast()
  const [planned, setPlanned] = useState('')
  const [actual, setActual] = useState('')
  const [criticalN, setCriticalN] = useState('3')

  const posQ = useQuery({
    queryKey: ['position', id, user?.id],
    enabled: Boolean(supabase && user && id),
    queryFn: async () => {
      const { data, error } = await supabase!
        .from('positions')
        .select('id, title, planned_fee_ils, actual_fee_ils, critical_stage_sort_order, companies ( name )')
        .eq('id', id!)
        .eq('user_id', user!.id)
        .single()
      if (error) throw error
      return data
    },
  })

  const position = posQ.data
  const company = position?.companies as unknown as { name: string } | undefined

  useEffect(() => {
    if (!position) return
    setPlanned(position.planned_fee_ils != null ? String(position.planned_fee_ils) : '')
    setActual(position.actual_fee_ils != null ? String(position.actual_fee_ils) : '')
    const c = (position as { critical_stage_sort_order?: number | null }).critical_stage_sort_order
    setCriticalN(c != null ? String(c) : '3')
  }, [position])

  const save = useMutation({
    mutationFn: async () => {
      const crit = criticalN.trim() ? Number(criticalN) : null
      const { error } = await supabase!
        .from('positions')
        .update({
          planned_fee_ils: planned.trim() ? Number(planned) : null,
          actual_fee_ils: actual.trim() ? Number(actual) : null,
          critical_stage_sort_order: crit != null && !Number.isNaN(crit) ? crit : null,
        })
        .eq('id', id!)
        .eq('user_id', user!.id)
      if (error) throw error
    },
    onSuccess: async () => {
      success('Fees saved')
      await qc.invalidateQueries({ queryKey: ['position', id] })
      await qc.invalidateQueries({ queryKey: ['positions'] })
      await qc.invalidateQueries({ queryKey: ['companies-positions-income'] })
    },
    onError: (e: Error) => toastError(e),
  })

  if (posQ.isLoading) {
    return <p className="text-ink-muted text-sm">Loading…</p>
  }
  if (!position) {
    return <p className="text-ink-muted text-sm">Position not found.</p>
  }

  return (
    <div className="flex flex-col gap-6">
      <ScreenHeader
        title="Fees & milestones"
        subtitle={`${position.title as string}${company?.name ? ` · ${company.name}` : ''}`}
        backTo={`/positions/${id}`}
      />
      <p className="text-ink-muted text-sm dark:text-stone-400">
        Planned and actual fees (₪) and when a candidate counts as reaching a <strong className="text-ink dark:text-stone-200">milestone</strong> stage (by
        stage sort order). Also available from{' '}
        <Link to="/settings/position-fees" className="text-accent font-medium underline dark:text-orange-300">
          Settings → Position fees
        </Link>
        .
      </p>
      <form
        className="border-line bg-white/60 max-w-lg rounded-2xl border p-4 dark:border-line-dark dark:bg-stone-900/40"
        onSubmit={(e) => {
          e.preventDefault()
          void save.mutateAsync()
        }}
      >
        <label className="text-sm font-medium">
          Critical stage threshold (sort order ≥ this = milestone)
          <input
            value={criticalN}
            onChange={(e) => setCriticalN(e.target.value)}
            inputMode="numeric"
            className="border-line mt-1 w-full rounded-xl border px-3 py-2 dark:border-line-dark dark:bg-stone-900/50"
          />
        </label>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-medium">
            Planned fee (ILS)
            <input
              value={planned}
              onChange={(e) => setPlanned(e.target.value)}
              inputMode="decimal"
              className="border-line mt-1 w-full rounded-xl border px-3 py-2 dark:border-line-dark dark:bg-stone-900/50"
            />
          </label>
          <label className="text-sm font-medium">
            Actual fee (ILS)
            <input
              value={actual}
              onChange={(e) => setActual(e.target.value)}
              inputMode="decimal"
              className="border-line mt-1 w-full rounded-xl border px-3 py-2 dark:border-line-dark dark:bg-stone-900/50"
            />
          </label>
        </div>
        <button
          type="submit"
          className="bg-accent text-stone-50 mt-4 rounded-full px-5 py-2 text-sm font-semibold disabled:opacity-50"
          disabled={save.isPending}
        >
          Save
        </button>
      </form>
    </div>
  )
}
