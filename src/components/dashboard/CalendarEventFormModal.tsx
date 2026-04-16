import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Star } from 'lucide-react'

import { useAuth } from '@/auth/useAuth'
import { getSupabase } from '@/lib/supabase'
import { useToast } from '@/hooks/useToast'
import { Modal } from '@/components/ui/Modal'
import {
  type CalendarEventRow,
  type RelKind,
  relKindFromRow,
  toDatetimeLocal,
} from '@/lib/calendarEventModel'

type Props = {
  open: boolean
  onClose: () => void
  /** New event default start (datetime-local string). */
  defaultStartsAt: string
  /** Edit this row; null = create. */
  editingEvent: CalendarEventRow | null
}

export function CalendarEventFormModal({ open, onClose, defaultStartsAt, editingEvent }: Props) {
  const { user } = useAuth()
  const supabase = getSupabase()
  const uid = user?.id
  const qc = useQueryClient()
  const { success, error: toastError } = useToast()

  const [title, setTitle] = useState('')
  const [subtitle, setSubtitle] = useState('')
  const [startsAt, setStartsAt] = useState(defaultStartsAt)
  const [endsAt, setEndsAt] = useState('')
  const [reminderAt, setReminderAt] = useState('')
  const [relKind, setRelKind] = useState<RelKind>('none')
  const [relId, setRelId] = useState('')
  const [isImportant, setIsImportant] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    if (editingEvent) {
      setEditingId(editingEvent.id)
      setTitle(editingEvent.title)
      setSubtitle(editingEvent.subtitle ?? '')
      setStartsAt(toDatetimeLocal(editingEvent.starts_at))
      setEndsAt(toDatetimeLocal(editingEvent.ends_at))
      setReminderAt(toDatetimeLocal(editingEvent.reminder_at))
      setIsImportant(editingEvent.is_important)
      const rk = relKindFromRow(editingEvent)
      setRelKind(rk)
      setRelId(
        rk === 'position'
          ? editingEvent.position_id ?? ''
          : rk === 'candidate'
            ? editingEvent.candidate_id ?? ''
            : rk === 'company'
              ? editingEvent.company_id ?? ''
              : '',
      )
    } else {
      setEditingId(null)
      setTitle('')
      setSubtitle('')
      setStartsAt(defaultStartsAt)
      setEndsAt('')
      setReminderAt('')
      setRelKind('none')
      setRelId('')
      setIsImportant(false)
    }
  }, [open, editingEvent, defaultStartsAt])

  const relationsQ = useQuery({
    queryKey: ['calendar-relations', uid],
    enabled: Boolean(supabase && uid && open),
    queryFn: async () => {
      const [pos, cand, comp] = await Promise.all([
        supabase!
          .from('positions')
          .select('id, title')
          .eq('user_id', uid!)
          .is('deleted_at', null)
          .order('title'),
        supabase!
          .from('candidates')
          .select('id, full_name')
          .eq('user_id', uid!)
          .is('deleted_at', null)
          .order('full_name'),
        supabase!
          .from('companies')
          .select('id, name, status')
          .eq('user_id', uid!)
          .is('deleted_at', null)
          .order('name'),
      ])
      if (pos.error) throw pos.error
      if (cand.error) throw cand.error
      if (comp.error) throw comp.error
      return {
        positions: pos.data ?? [],
        candidates: cand.data ?? [],
        companies: comp.data ?? [],
      }
    },
  })

  function buildPayload() {
    const startIso = new Date(startsAt).toISOString()
    const endIso = endsAt.trim() ? new Date(endsAt).toISOString() : null
    const remIso = reminderAt.trim() ? new Date(reminderAt).toISOString() : null
    const pid = relKind === 'position' && relId ? relId : null
    const cid = relKind === 'candidate' && relId ? relId : null
    const coid = relKind === 'company' && relId ? relId : null
    return {
      title: title.trim() || 'Event',
      subtitle: subtitle.trim() || null,
      starts_at: startIso,
      ends_at: endIso,
      reminder_at: remIso,
      is_important: isImportant,
      position_id: pid,
      candidate_id: cid,
      company_id: coid,
    }
  }

  const saveEvent = useMutation({
    mutationFn: async (): Promise<{ wasEdit: boolean }> => {
      if (!supabase || !uid) throw new Error('Not signed in')
      const wasEdit = Boolean(editingId)
      const payload = buildPayload()
      if (editingId) {
        const { error } = await supabase.from('calendar_events').update(payload).eq('id', editingId).eq('user_id', uid)
        if (error) throw error
      } else {
        const { error } = await supabase.from('calendar_events').insert({
          user_id: uid,
          ...payload,
        })
        if (error) throw error
      }
      return { wasEdit }
    },
    onSuccess: async ({ wasEdit }) => {
      success(wasEdit ? 'Event updated' : 'Event added')
      await qc.invalidateQueries({ queryKey: ['calendar-events'] })
      await qc.invalidateQueries({ queryKey: ['notification-count'] })
      await qc.invalidateQueries({ queryKey: ['notifications-calendar-events'] })
      onClose()
    },
    onError: (e: Error) => toastError(e.message),
  })

  function handleClose() {
    if (saveEvent.isPending) return
    onClose()
  }

  const positions = relationsQ.data?.positions ?? []
  const candidates = relationsQ.data?.candidates ?? []
  const companies = relationsQ.data?.companies ?? []

  return (
    <Modal open={open} onClose={handleClose} title={editingId ? 'Edit event' : 'New event'} size="lg">
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault()
          saveEvent.mutate()
        }}
      >
        <p className="text-ink-muted text-xs dark:text-stone-400">
          Events live on your Overview calendar only — times, reminder, and optional link to a role, candidate, or client.
        </p>

        <div className="mb-1 flex items-center justify-between gap-2 border-b border-stone-200/80 pb-3 dark:border-stone-600">
          <span className="text-sm font-semibold">Details</span>
          <button
            type="button"
            onClick={() => setIsImportant((v) => !v)}
            className="rounded-xl p-2 text-stone-500 transition hover:bg-stone-100 dark:hover:bg-stone-800"
            aria-label={isImportant ? 'Unmark important' : 'Mark important'}
            aria-pressed={isImportant}
          >
            <Star className={`h-5 w-5 ${isImportant ? 'fill-amber-400 text-amber-500' : ''}`} />
          </button>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-x-4 sm:gap-y-3">
          <label className="flex min-w-0 flex-col gap-1 text-sm">
            Subject
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="border-line rounded-xl border px-3 py-2 dark:border-line-dark dark:bg-stone-900/50"
              placeholder="e.g. Meet with Dr. Schwartz"
              required
            />
          </label>
          <label className="flex min-w-0 flex-col gap-1 text-sm">
            <span>
              Short description <span className="text-ink-muted font-normal">(optional)</span>
            </span>
            <input
              value={subtitle}
              onChange={(e) => setSubtitle(e.target.value)}
              className="border-line rounded-xl border px-3 py-2 dark:border-line-dark dark:bg-stone-900/50"
              placeholder="A few words…"
            />
          </label>
          <label className="flex min-w-0 flex-col gap-1 text-sm">
            Starts
            <input
              type="datetime-local"
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
              className="border-line rounded-xl border px-3 py-2 dark:border-line-dark dark:bg-stone-900/50"
              required
            />
          </label>
          <label className="flex min-w-0 flex-col gap-1 text-sm">
            <span>
              End <span className="text-ink-muted font-normal">(optional)</span>
            </span>
            <input
              type="datetime-local"
              value={endsAt}
              onChange={(e) => setEndsAt(e.target.value)}
              className="border-line rounded-xl border px-3 py-2 dark:border-line-dark dark:bg-stone-900/50"
            />
          </label>
          <label className="flex min-w-0 flex-col gap-1 text-sm">
            <span>
              Reminder <span className="text-ink-muted font-normal">(optional)</span>
            </span>
            <input
              type="datetime-local"
              value={reminderAt}
              onChange={(e) => setReminderAt(e.target.value)}
              className="border-line rounded-xl border px-3 py-2 dark:border-line-dark dark:bg-stone-900/50"
            />
          </label>
          <div className="flex min-w-0 flex-col gap-1 text-sm">
            <span>
              Related to <span className="text-ink-muted font-normal">(optional)</span>
            </span>
            <select
              value={relKind}
              onChange={(e) => {
                const v = e.target.value as RelKind
                setRelKind(v)
                setRelId('')
              }}
              className="border-line rounded-xl border px-3 py-2 dark:border-line-dark dark:bg-stone-900/50"
            >
              <option value="none">None</option>
              <option value="position">Position</option>
              <option value="candidate">Candidate</option>
              <option value="company">Company</option>
            </select>
          </div>
          {relKind === 'position' ? (
            <label className="flex min-w-0 flex-col gap-1 text-sm sm:col-span-2">
              Position
              <select
                value={relId}
                onChange={(e) => setRelId(e.target.value)}
                className="border-line rounded-xl border px-3 py-2 dark:border-line-dark dark:bg-stone-900/50"
              >
                <option value="">Select position…</option>
                {positions.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {relKind === 'candidate' ? (
            <label className="flex min-w-0 flex-col gap-1 text-sm sm:col-span-2">
              Candidate
              <select
                value={relId}
                onChange={(e) => setRelId(e.target.value)}
                className="border-line rounded-xl border px-3 py-2 dark:border-line-dark dark:bg-stone-900/50"
              >
                <option value="">Select candidate…</option>
                {candidates.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.full_name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {relKind === 'company' ? (
            <label className="flex min-w-0 flex-col gap-1 text-sm sm:col-span-2">
              Company
              <select
                value={relId}
                onChange={(e) => setRelId(e.target.value)}
                className="border-line rounded-xl border px-3 py-2 dark:border-line-dark dark:bg-stone-900/50"
              >
                <option value="">Select company…</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {(c as { status?: string }).status === 'inactive' ? ' (inactive)' : ''}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>

        <div className="mt-2 flex flex-wrap gap-2 border-t border-stone-200/80 pt-4 dark:border-stone-600">
          <button
            type="submit"
            disabled={saveEvent.isPending}
            className="rounded-full bg-gradient-to-r from-[#9b3e20] to-[#fd8863] px-5 py-2 text-sm font-bold text-white disabled:opacity-60"
          >
            {saveEvent.isPending ? 'Saving…' : editingId ? 'Save changes' : 'Save event'}
          </button>
          <button
            type="button"
            className="border-line rounded-full border px-5 py-2 text-sm font-semibold dark:border-line-dark"
            disabled={saveEvent.isPending}
            onClick={handleClose}
          >
            Cancel
          </button>
        </div>
      </form>
    </Modal>
  )
}
