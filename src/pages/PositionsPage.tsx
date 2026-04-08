import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'

import { useAuth } from '@/auth/useAuth'
import { getSupabase } from '@/lib/supabase'

export function PositionsPage() {
  const { user } = useAuth()
  const supabase = getSupabase()
  const [search] = useSearchParams()
  const [companyFilter, setCompanyFilter] = useState<string>('')
  const [statusFilter, setStatusFilter] = useState<string>('')

  const companiesQ = useQuery({
    queryKey: ['companies', user?.id],
    enabled: Boolean(supabase && user),
    queryFn: async () => {
      const { data, error } = await supabase!
        .from('companies')
        .select('id, name')
        .eq('user_id', user!.id)
        .is('deleted_at', null)
        .order('name')
      if (error) throw error
      return data ?? []
    },
  })

  const positionsQ = useQuery({
    queryKey: ['positions', user?.id, companyFilter, statusFilter],
    enabled: Boolean(supabase && user),
    queryFn: async () => {
      let q = supabase!
        .from('positions')
        .select('id, title, status, company_id, companies ( name )')
        .eq('user_id', user!.id)
        .is('deleted_at', null)
        .order('updated_at', { ascending: false })
      if (companyFilter) q = q.eq('company_id', companyFilter)
      if (statusFilter) q = q.eq('status', statusFilter)
      const { data, error } = await q
      if (error) throw error
      return data ?? []
    },
  })

  const createOpen = search.get('create') === '1'

  const companies = companiesQ.data ?? []

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold">Positions</h1>
          <p className="text-ink-muted mt-1 text-sm dark:text-stone-400">Roles you’re hiring for across clients.</p>
        </div>
        <Link
          to="/positions?create=1"
          className="bg-accent text-stone-50 hover:bg-accent/90 rounded-full px-5 py-2.5 text-sm font-semibold"
        >
          Create position
        </Link>
      </div>

      {createOpen && companies.length === 0 ? (
        <p className="text-ink-muted rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm dark:border-amber-900/50 dark:bg-amber-950/30">
          Add a <Link className="text-accent font-medium underline dark:text-orange-300" to="/companies/new">company</Link> first, then create a position.
        </p>
      ) : null}

      {createOpen && companies.length > 0 ? (
        <CreatePositionInline companies={companies} />
      ) : null}

      <div className="flex flex-wrap gap-3">
        <label className="text-sm font-medium">
          Company
          <select
            value={companyFilter}
            onChange={(e) => setCompanyFilter(e.target.value)}
            className="border-line bg-white/80 focus:ring-accent ml-2 rounded-xl border px-3 py-2 outline-none focus:ring-2 dark:bg-stone-900/50 dark:border-line-dark"
          >
            <option value="">All</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-medium">
          Status
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="border-line bg-white/80 focus:ring-accent ml-2 rounded-xl border px-3 py-2 outline-none focus:ring-2 dark:bg-stone-900/50 dark:border-line-dark"
          >
            <option value="">All</option>
            {['pending', 'in_progress', 'success', 'cancelled'].map((s) => (
              <option key={s} value={s}>
                {s.replace('_', ' ')}
              </option>
            ))}
          </select>
        </label>
      </div>

      {positionsQ.isLoading ? (
        <p className="text-ink-muted text-sm">Loading…</p>
      ) : (positionsQ.data ?? []).length === 0 ? (
        <p className="text-ink-muted text-sm">No positions yet.</p>
      ) : (
        <ul className="space-y-2">
          {(positionsQ.data ?? []).map((p) => {
            const co = p.companies as unknown as { name: string } | null
            return (
              <li key={p.id}>
                <Link
                  to={`/positions/${p.id}`}
                  className="border-line bg-white/70 hover:border-accent flex flex-wrap items-baseline justify-between gap-2 rounded-2xl border px-4 py-4 dark:border-line-dark dark:bg-stone-900/45"
                >
                  <span className="font-display font-semibold">{p.title}</span>
                  <span className="text-ink-muted text-sm dark:text-stone-400">
                    {co?.name ?? '—'} · {p.status.replace('_', ' ')}
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

function CreatePositionInline({ companies }: { companies: { id: string; name: string }[] }) {
  const { user } = useAuth()
  const supabase = getSupabase()
  const [companyId, setCompanyId] = useState(companies[0]?.id ?? '')
  const [title, setTitle] = useState('')
  const [pending, setPending] = useState(false)
  const navigate = useNavigate()

  async function onCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!supabase || !user || !companyId) return
    setPending(true)
    const { data, error } = await supabase
      .from('positions')
      .insert({
        user_id: user.id,
        company_id: companyId,
        title: title.trim() || 'New position',
        status: 'pending',
      })
      .select('id')
      .single()
    setPending(false)
    if (error) return
    navigate(`/positions/${data!.id}`)
  }

  return (
    <form
      onSubmit={onCreate}
      className="border-line bg-white/70 flex flex-col gap-3 rounded-2xl border p-4 dark:border-line-dark dark:bg-stone-900/40"
    >
      <p className="font-medium">New position</p>
      <label className="flex flex-col gap-1 text-sm">
        Company
        <select
          value={companyId}
          onChange={(e) => setCompanyId(e.target.value)}
          className="border-line rounded-xl border px-3 py-2 dark:border-line-dark dark:bg-stone-900/50"
          required
        >
          {companies.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Title
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="border-line rounded-xl border px-3 py-2 dark:border-line-dark dark:bg-stone-900/50"
          placeholder="e.g. Senior Software Engineer"
          required
        />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="bg-accent text-stone-50 w-fit rounded-full px-5 py-2 text-sm font-semibold disabled:opacity-60"
      >
        {pending ? 'Creating…' : 'Create & open'}
      </button>
    </form>
  )
}
