import { Link, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Mail } from 'lucide-react'

import { useAuth } from '@/auth/useAuth'
import { getSupabase } from '@/lib/supabase'
import { buildMailto } from '@/lib/mailto'
import { ScreenHeader } from '@/components/layout/ScreenHeader'

export function CompaniesPage() {
  const { user } = useAuth()
  const supabase = getSupabase()
  const [searchParams, setSearchParams] = useSearchParams()
  const sendEmailMode = searchParams.get('sendEmail') === '1'

  const q = useQuery({
    queryKey: ['companies', user?.id],
    enabled: Boolean(supabase && user),
    queryFn: async () => {
      const { data, error } = await supabase!
        .from('companies')
        .select('id, name, contact_email, created_at')
        .eq('user_id', user!.id)
        .is('deleted_at', null)
        .order('name')
      if (error) throw error
      return data ?? []
    },
  })

  return (
    <div className="flex flex-col gap-6">
      <ScreenHeader
        title="Companies"
        subtitle={sendEmailMode ? 'Choose a client to open your mail app — add a contact email on their profile if missing.' : 'Clients you recruit for.'}
        backTo="/"
        right={
          <Link
            to="/companies/new"
            className="rounded-full bg-gradient-to-r from-[#9b3e20] to-[#fd8863] px-4 py-2 text-sm font-bold text-white shadow-md"
          >
            Add
          </Link>
        }
      />

      {sendEmailMode ? (
        <div className="border-line flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-violet-200/80 bg-violet-50/80 px-4 py-3 dark:border-violet-900/40 dark:bg-violet-950/30">
          <p className="text-sm font-medium text-violet-950 dark:text-violet-100">Send An Email — clients with an address show a mail button.</p>
          <button
            type="button"
            className="shrink-0 rounded-full border border-violet-300 px-3 py-1 text-xs font-bold dark:border-violet-700"
            onClick={() => setSearchParams({}, { replace: true })}
          >
            Done
          </button>
        </div>
      ) : null}

      {q.isLoading ? (
        <p className="text-ink-muted text-sm">Loading…</p>
      ) : (q.data ?? []).length === 0 ? (
        <p className="text-ink-muted text-sm">No companies yet. Add your first client.</p>
      ) : (
        <ul className="space-y-2">
          {(q.data ?? []).map((c) => (
            <li key={c.id}>
              <div className="border-line bg-white/70 flex flex-wrap items-stretch gap-2 rounded-2xl border px-4 py-4 dark:border-line-dark dark:bg-stone-900/45">
                <Link
                  to={`/companies/${c.id}`}
                  className="hover:border-accent min-w-0 flex-1 flex flex-col rounded-xl border border-transparent transition-colors dark:hover:border-orange-400/40"
                >
                  <span className="font-display font-semibold">{c.name}</span>
                  {c.contact_email ? <span className="text-ink-muted text-sm">{c.contact_email}</span> : null}
                  {sendEmailMode && !c.contact_email ? (
                    <span className="text-ink-muted mt-1 text-xs">No email on file — open profile to add one.</span>
                  ) : null}
                </Link>
                {sendEmailMode && c.contact_email ? (
                  <a
                    href={buildMailto({
                      to: c.contact_email,
                      subject: `Re: ${c.name}`,
                      body: 'Hi,\n\n',
                    })}
                    className="inline-flex shrink-0 items-center justify-center gap-2 self-center rounded-xl bg-violet-600 px-4 py-2 text-sm font-bold text-white dark:bg-violet-700"
                  >
                    <Mail className="h-4 w-4" aria-hidden />
                    Email
                  </a>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
