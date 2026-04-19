import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'

import { useAuth } from '@/auth/useAuth'
import { getSupabase } from '@/lib/supabase'
import { useToast } from '@/hooks/useToast'
import { Modal } from '@/components/ui/Modal'

export type ScheduleStageOption = {
  id: string
  name: string
  duration_minutes?: number | null
}

export type CandidateScheduleInitial = {
  startsAt: string
  durationMin: number
  stageId: string
  interviewer: string
}

type Props = {
  open: boolean
  onClose: () => void
  initial: CandidateScheduleInitial | null
  stages: ScheduleStageOption[]
  candidateId: string
  candidateName: string
  positionTitle: string
}

function defaultStartsAtLocal(): string {
  const d = new Date()
  d.setMinutes(0, 0, 0)
  d.setHours(d.getHours() + 1)
  return format(d, "yyyy-MM-dd'T'HH:mm")
}

export function CandidateInterviewScheduleModal({
  open,
  onClose,
  initial,
  stages,
  candidateId,
  candidateName,
  positionTitle,
}: Props) {
  const { user } = useAuth()
  const supabase = getSupabase()
  const uid = user?.id
  const qc = useQueryClient()
  const { success, error: toastError } = useToast()

  const [taskName, setTaskName] = useState('')
  const [startsAt, setStartsAt] = useState('')
  const [durationMin, setDurationMin] = useState(60)
  const [stageId, setStageId] = useState('')
  const [interviewer, setInterviewer] = useState('')
  const [notes, setNotes] = useState('')

  useEffect(() => {
    if (!open || !initial) return
    setTaskName('')
    setStartsAt(initial.startsAt || defaultStartsAtLocal())
    setDurationMin(Number.isFinite(initial.durationMin) && initial.durationMin > 0 ? initial.durationMin : 60)
    const sid =
      initial.stageId && stages.some((s) => s.id === initial.stageId) ? initial.stageId : stages[0]?.id ?? ''
    setStageId(sid)
    setInterviewer(initial.interviewer)
    setNotes('')
  }, [open, initial, stages])

  const saveEvent = useMutation({
    mutationFn: async () => {
      if (!supabase || !uid) throw new Error('Not signed in')
      const title = taskName.trim()
      if (!title) throw new Error('Enter a task name')
      const start = new Date(startsAt)
      if (Number.isNaN(start.getTime())) throw new Error('Invalid start time')
      const dm = Math.max(5, Math.min(24 * 60, Math.round(durationMin) || 60))
      const end = new Date(start.getTime() + dm * 60_000)
      const stage = stages.find((s) => s.id === stageId)
      const stageLabel = stage?.name?.trim() || '—'
      const iv = interviewer.trim()
      const n = notes.trim()
      const subtitleLines = [
        `Role: ${positionTitle.trim() || '—'}`,
        `Candidate: ${candidateName.trim() || '—'}`,
        `Stage: ${stageLabel}`,
        iv ? `Interviewer: ${iv}` : null,
        n ? `Notes: ${n}` : null,
      ].filter(Boolean) as string[]
      const { error } = await supabase.from('calendar_events').insert({
        user_id: uid,
        title,
        subtitle: subtitleLines.join('\n'),
        starts_at: start.toISOString(),
        ends_at: end.toISOString(),
        reminder_at: null,
        is_important: false,
        position_id: null,
        candidate_id: candidateId,
        company_id: null,
      })
      if (error) throw error
    },
    onSuccess: async () => {
      success('Event added to calendar')
      await qc.invalidateQueries({ queryKey: ['calendar-events'] })
      await qc.invalidateQueries({ queryKey: ['notification-count'] })
      await qc.invalidateQueries({ queryKey: ['notifications-calendar-events'] })
      onClose()
    },
    onError: (e: Error) => toastError(e),
  })

  function handleClose() {
    if (saveEvent.isPending) return
    onClose()
  }

  function onStageChange(nextId: string) {
    setStageId(nextId)
    const st = stages.find((s) => s.id === nextId)
    if (st?.duration_minutes != null && st.duration_minutes > 0) {
      setDurationMin(st.duration_minutes)
    }
  }

  return (
    <Modal open={open} onClose={handleClose} title="Schedule interview" size="lg">
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault()
          saveEvent.mutate()
        }}
      >
        <p className="text-ink-muted text-xs dark:text-stone-400">
          Creates a calendar block on your Overview. It is linked to this candidate; role, stage, and interviewer are
          saved in the event description.
        </p>

        <label className="flex min-w-0 flex-col gap-1 text-sm font-medium">
          Task name <span className="text-rose-600 dark:text-rose-400">*</span>
          <input
            value={taskName}
            onChange={(e) => setTaskName(e.target.value)}
            className="border-line rounded-xl border px-3 py-2 font-normal dark:border-line-dark dark:bg-stone-900/50"
            placeholder={`e.g. Interview — ${candidateName}`}
            required
            autoComplete="off"
          />
        </label>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="flex min-w-0 flex-col gap-1 text-sm font-medium">
            Start (date &amp; time)
            <input
              type="datetime-local"
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
              className="border-line rounded-xl border px-3 py-2 font-normal dark:border-line-dark dark:bg-stone-900/50"
              required
            />
          </label>
          <label className="flex min-w-0 flex-col gap-1 text-sm font-medium">
            Duration (minutes)
            <input
              type="number"
              min={5}
              max={24 * 60}
              step={5}
              value={durationMin}
              onChange={(e) => setDurationMin(Number(e.target.value))}
              className="border-line rounded-xl border px-3 py-2 font-normal dark:border-line-dark dark:bg-stone-900/50"
            />
          </label>
        </div>

        <label className="flex min-w-0 flex-col gap-1 text-sm font-medium">
          Stage
          <select
            value={stageId}
            onChange={(e) => onStageChange(e.target.value)}
            className="border-line rounded-xl border px-3 py-2 font-normal dark:border-line-dark dark:bg-stone-900/50"
            disabled={stages.length === 0}
          >
            {stages.length === 0 ? <option value="">No stages defined</option> : null}
            {stages.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>

        <label className="flex min-w-0 flex-col gap-1 text-sm font-medium">
          Interviewer
          <input
            value={interviewer}
            onChange={(e) => setInterviewer(e.target.value)}
            className="border-line rounded-xl border px-3 py-2 font-normal dark:border-line-dark dark:bg-stone-900/50"
            placeholder="Name or who will run the interview"
            autoComplete="off"
          />
        </label>

        <label className="flex min-w-0 flex-col gap-1 text-sm font-medium">
          Notes
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="border-line resize-y rounded-xl border px-3 py-2 text-sm font-normal dark:border-line-dark dark:bg-stone-900/50"
            placeholder="Brief context for you (optional)"
          />
        </label>

        <div className="mt-2 flex flex-wrap gap-2 border-t border-stone-200/80 pt-4 dark:border-stone-600">
          <button
            type="submit"
            disabled={saveEvent.isPending || !taskName.trim()}
            className="bg-accent text-stone-50 rounded-full px-5 py-2 text-sm font-semibold disabled:opacity-50"
          >
            {saveEvent.isPending ? 'Creating…' : 'Create'}
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
