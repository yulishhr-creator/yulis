import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router-dom'
import { useEffect, useState } from 'react'

import { useAuth } from '@/auth/useAuth'
import { getSupabase } from '@/lib/supabase'

export function CompanyDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const supabase = getSupabase()
  const qc = useQueryClient()
  const isNew = id === 'new'

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [website, setWebsite] = useState('')
  const [contactPerson, setContactPerson] = useState('')
  const [contactEmail, setContactEmail] = useState('')
  const [contactPhone, setContactPhone] = useState('')
  const [paymentTerms, setPaymentTerms] = useState('')

  const companyQ = useQuery({
    queryKey: ['company', id, user?.id],
    enabled: Boolean(supabase && user && id && !isNew),
    queryFn: async () => {
      const { data, error } = await supabase!
        .from('companies')
        .select('*')
        .eq('id', id!)
        .eq('user_id', user!.id)
        .single()
      if (error) throw error
      return data
    },
  })

  useEffect(() => {
    const c = companyQ.data
    if (!c) return
    setName(c.name ?? '')
    setDescription(c.description ?? '')
    setWebsite(c.website ?? '')
    setContactPerson(c.contact_person ?? '')
    setContactEmail(c.contact_email ?? '')
    setContactPhone(c.contact_phone ?? '')
    setPaymentTerms((c.payment_terms as string[] | null)?.join('\n') ?? '')
  }, [companyQ.data])

  const save = useMutation({
    mutationFn: async () => {
      const terms = paymentTerms
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean)
      if (isNew) {
        const { data, error } = await supabase!
          .from('companies')
          .insert({
            user_id: user!.id,
            name: name.trim() || 'Untitled company',
            description: description.trim() || null,
            website: website.trim() || null,
            contact_person: contactPerson.trim() || null,
            contact_email: contactEmail.trim() || null,
            contact_phone: contactPhone.trim() || null,
            payment_terms: terms,
          })
          .select('id')
          .single()
        if (error) throw error
        return data!.id as string
      }
      const { error } = await supabase!
        .from('companies')
        .update({
          name: name.trim() || 'Untitled company',
          description: description.trim() || null,
          website: website.trim() || null,
          contact_person: contactPerson.trim() || null,
          contact_email: contactEmail.trim() || null,
          contact_phone: contactPhone.trim() || null,
          payment_terms: terms,
        })
        .eq('id', id!)
        .eq('user_id', user!.id)
      if (error) throw error
      return id!
    },
    onSuccess: async (savedId) => {
      await qc.invalidateQueries({ queryKey: ['companies'] })
      if (isNew) navigate(`/companies/${savedId}`, { replace: true })
    },
  })

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="font-display text-2xl font-semibold">{isNew ? 'New company' : 'Company'}</h1>
      <form
        className="mt-6 flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          void save.mutateAsync()
        }}
      >
        <label className="flex flex-col gap-1 text-sm font-medium">
          Name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="border-line bg-white/80 focus:ring-accent rounded-xl border px-3 py-2.5 outline-none focus:ring-2 dark:bg-stone-900/50 dark:border-line-dark"
            required
          />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          Description
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="border-line bg-white/80 focus:ring-accent rounded-xl border px-3 py-2.5 outline-none focus:ring-2 dark:bg-stone-900/50 dark:border-line-dark"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          Website
          <input
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
            className="border-line bg-white/80 focus:ring-accent rounded-xl border px-3 py-2.5 outline-none focus:ring-2 dark:bg-stone-900/50 dark:border-line-dark"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          Contact person
          <input
            value={contactPerson}
            onChange={(e) => setContactPerson(e.target.value)}
            className="border-line bg-white/80 focus:ring-accent rounded-xl border px-3 py-2.5 outline-none focus:ring-2 dark:bg-stone-900/50 dark:border-line-dark"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          Contact email
          <input
            type="email"
            value={contactEmail}
            onChange={(e) => setContactEmail(e.target.value)}
            className="border-line bg-white/80 focus:ring-accent rounded-xl border px-3 py-2.5 outline-none focus:ring-2 dark:bg-stone-900/50 dark:border-line-dark"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          Contact phone
          <input
            value={contactPhone}
            onChange={(e) => setContactPhone(e.target.value)}
            className="border-line bg-white/80 focus:ring-accent rounded-xl border px-3 py-2.5 outline-none focus:ring-2 dark:bg-stone-900/50 dark:border-line-dark"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          Payment terms (one per line)
          <textarea
            value={paymentTerms}
            onChange={(e) => setPaymentTerms(e.target.value)}
            rows={3}
            className="border-line bg-white/80 focus:ring-accent rounded-xl border px-3 py-2.5 outline-none focus:ring-2 dark:bg-stone-900/50 dark:border-line-dark"
          />
        </label>
        {save.isError ? (
          <p className="text-sm text-red-600 dark:text-red-400">{(save.error as Error).message}</p>
        ) : null}
        <button
          type="submit"
          disabled={save.isPending}
          className="bg-accent text-stone-50 hover:bg-accent/90 w-fit rounded-full px-6 py-2.5 text-sm font-semibold disabled:opacity-60"
        >
          {save.isPending ? 'Saving…' : 'Save'}
        </button>
      </form>
    </div>
  )
}
