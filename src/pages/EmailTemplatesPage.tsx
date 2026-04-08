import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router-dom'

import { useAuth } from '@/auth/useAuth'
import { getSupabase } from '@/lib/supabase'

export function EmailTemplatesPage() {
  const { user } = useAuth()
  const supabase = getSupabase()
  const qc = useQueryClient()
  const [name, setName] = useState('')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')

  const q = useQuery({
    queryKey: ['email-templates', user?.id],
    enabled: Boolean(supabase && user),
    queryFn: async () => {
      const { data, error } = await supabase!.from('email_templates').select('*').eq('user_id', user!.id).order('name')
      if (error) throw error
      return data ?? []
    },
  })

  const insert = useMutation({
    mutationFn: async () => {
      const { error } = await supabase!.from('email_templates').insert({
        user_id: user!.id,
        name: name.trim() || 'Untitled',
        subject: subject.trim() || '(no subject)',
        body: body.trim() || '',
      })
      if (error) throw error
    },
    onSuccess: async () => {
      setName('')
      setSubject('')
      setBody('')
      await qc.invalidateQueries({ queryKey: ['email-templates'] })
    },
  })

  return (
    <div className="mx-auto max-w-2xl">
      <p className="text-sm">
        <Link to="/settings" className="text-accent hover:underline dark:text-orange-300">
          Settings
        </Link>
      </p>
      <h1 className="font-display mt-2 text-2xl font-semibold">Email templates</h1>
      <p className="text-ink-muted mt-2 text-sm">
        Use tokens like{' '}
        <code className="rounded bg-accent-soft/80 px-1">{'{{position_title}}'}</code>,{' '}
        <code className="rounded bg-accent-soft/80 px-1">{'{{candidate_name}}'}</code>,{' '}
        <code className="rounded bg-accent-soft/80 px-1">{'{{company_name}}'}</code>,{' '}
        <code className="rounded bg-accent-soft/80 px-1">{'{{due_date}}'}</code>,{' '}
        <code className="rounded bg-accent-soft/80 px-1">{'{{user_name}}'}</code>.
      </p>

      <form
        className="border-line bg-white/60 mt-6 flex flex-col gap-3 rounded-2xl border p-4 dark:border-line-dark dark:bg-stone-900/40"
        onSubmit={(e) => {
          e.preventDefault()
          void insert.mutateAsync()
        }}
      >
        <label className="text-sm font-medium">
          Name
          <input value={name} onChange={(e) => setName(e.target.value)} className="border-line mt-1 w-full rounded-xl border px-3 py-2 dark:border-line-dark dark:bg-stone-900/50" required />
        </label>
        <label className="text-sm font-medium">
          Subject
          <input value={subject} onChange={(e) => setSubject(e.target.value)} className="border-line mt-1 w-full rounded-xl border px-3 py-2 dark:border-line-dark dark:bg-stone-900/50" />
        </label>
        <label className="text-sm font-medium">
          Body
          <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={6} className="border-line mt-1 w-full rounded-xl border px-3 py-2 dark:border-line-dark dark:bg-stone-900/50" />
        </label>
        <button type="submit" className="bg-accent text-stone-50 w-fit rounded-full px-5 py-2 text-sm font-semibold">
          Save template
        </button>
      </form>

      <ul className="mt-8 space-y-2">
        {(q.data ?? []).map((t) => (
          <li key={t.id} className="border-line bg-white/60 rounded-xl border px-3 py-3 dark:border-line-dark dark:bg-stone-900/40">
            <p className="font-medium">{t.name}</p>
            <p className="text-ink-muted text-sm">{t.subject}</p>
          </li>
        ))}
      </ul>
    </div>
  )
}
