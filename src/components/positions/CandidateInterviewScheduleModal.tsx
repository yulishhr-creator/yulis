import { useEffect, useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'

import { useAuth } from '@/auth/useAuth'
import { getSupabase } from '@/lib/supabase'
import { sendInterviewScheduleToMake } from '@/lib/emailSendApi'
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
  interviewerMailDefault?: string | null
  interviewerName2Default?: string | null
  interviewerMail2Default?: string | null
}

type Props = {
  open: boolean
  onClose: () => void
  initial: CandidateScheduleInitial | null
  stages: ScheduleStageOption[]
  candidateId: string
  candidateName: string
  /** From candidate profile; user can edit when scheduling a Google meeting. */
  candidateEmail?: string | null
  positionTitle: string
  positionId: string
}

function defaultStartsAtLocal(): string {
  const d = new Date()
  d.setMinutes(0, 0, 0)
  d.setHours(d.getHours() + 1)
  return format(d, "yyyy-MM-dd'T'HH:mm")
}

function isEmailish(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim())
}

export function CandidateInterviewScheduleModal({
  open,
  onClose,
  initial,
  stages,
  candidateId,
  candidateName,
  candidateEmail = null,
  positionTitle,
  positionId,
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
  const [scheduleMeetingEmail, setScheduleMeetingEmail] = useState(false)
  const [interviewerMail, setInterviewerMail] = useState('')
  const [interviewer2Name, setInterviewer2Name] = useState('')
  const [interviewer2Mail, setInterviewer2Mail] = useState('')
  const [candidateNameEdit, setCandidateNameEdit] = useState('')
  const [candidateMail, setCandidateMail] = useState('')

  /** Parent passes `stages={data ?? []}` — new array ref every render; must not reset the form or focus is lost while typing. */
  const stagesRef = useRef(stages)
  stagesRef.current = stages

  useEffect(() => {
    if (!open || !initial) return
    const stList = stagesRef.current
    setTaskName('')
    setStartsAt(initial.startsAt || defaultStartsAtLocal())
    setDurationMin(Number.isFinite(initial.durationMin) && initial.durationMin > 0 ? initial.durationMin : 60)
    const sid =
      initial.stageId && stList.some((s) => s.id === initial.stageId) ? initial.stageId : stList[0]?.id ?? ''
    setStageId(sid)
    setInterviewer(initial.interviewer)
    setNotes('')
    setScheduleMeetingEmail(false)
    setInterviewerMail((initial.interviewerMailDefault ?? '').trim())
    setInterviewer2Name((initial.interviewerName2Default ?? '').trim())
    setInterviewer2Mail((initial.interviewerMail2Default ?? '').trim())
    setCandidateNameEdit((candidateName ?? '').trim())
    setCandidateMail((candidateEmail ?? '').trim())
  }, [open, initial, candidateEmail, candidateName])

  function validateInterviewMake(): string | null {
    const missing: string[] = []
    const title = taskName.trim()
    const ivName = interviewer.trim()
    const ivMail = interviewerMail.trim()
    const iv2n = interviewer2Name.trim()
    const iv2m = interviewer2Mail.trim()
    const candMail = candidateMail.trim()
    const candName = candidateNameEdit.trim()
    const start = new Date(startsAt)
    const dm = Math.max(5, Math.min(24 * 60, Math.round(durationMin) || 60))

    if (!title) missing.push('Task name')
    if (!ivName) missing.push('Interviewer name')
    if (!ivMail) missing.push('Interviewer email')
    else if (!isEmailish(ivMail)) missing.push('Interviewer email (valid address)')
    const hasIv2 = iv2n.length > 0 || iv2m.length > 0
    if (hasIv2) {
      if (!iv2n) missing.push('Interviewer 2 name')
      if (!iv2m) missing.push('Interviewer 2 email')
      else if (!isEmailish(iv2m)) missing.push('Interviewer 2 email (valid address)')
    }
    if (!candName) missing.push('Candidate name')
    if (!candMail) missing.push('Candidate email')
    else if (!isEmailish(candMail)) missing.push('Candidate email (valid address)')
    if (Number.isNaN(start.getTime())) missing.push('Start date and time')
    if (!Number.isFinite(dm) || dm < 5) missing.push('Duration (minutes)')

    return missing.length ? missing.join('; ') : null
  }

  const saveEvent = useMutation({
    mutationFn: async (): Promise<{ didMake: boolean; messageId?: string; eventId?: string }> => {
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
      const iv2 = interviewer2Name.trim()
      const candLine = candidateNameEdit.trim() || candidateName.trim() || '—'
      const n = notes.trim()
      const subtitleLines = [
        `Role: ${positionTitle.trim() || '—'}`,
        `Candidate: ${candLine}`,
        `Stage: ${stageLabel}`,
        iv ? `Interviewer: ${iv}` : null,
        iv2 ? `Interviewer 2: ${iv2}` : null,
        n ? `Notes: ${n}` : null,
      ].filter(Boolean) as string[]
      const stageFk = stageId.trim() ? stageId : null
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
        position_stage_id: stageFk,
      })
      if (error) throw error

      if (scheduleMeetingEmail) {
        const v = validateInterviewMake()
        if (v) throw new Error(v)
        const interviewDesc = [title, n].filter(Boolean).join('\n\n')
        const makeIds = await sendInterviewScheduleToMake({
          eventType: 'interview',
          interviewDesc,
          interviewerName: interviewer.trim(),
          interviewerMail: interviewerMail.trim(),
          interviewerName2: interviewer2Name.trim(),
          interviewerMail2: interviewer2Mail.trim(),
          candidateName: candidateNameEdit.trim(),
          candidateMail: candidateMail.trim(),
          interviewDate: start.toISOString(),
          interviewDuration: String(dm),
        })
        return { didMake: true, ...makeIds }
      }
      return { didMake: false }
    },
    onSuccess: async (data) => {
      const idSuffix =
        data.eventId != null && data.eventId !== ''
          ? ` Event ID: ${data.eventId}`
          : data.messageId != null && data.messageId !== ''
            ? ` Message ID: ${data.messageId}`
            : ''
      success(
        (data.didMake ? 'Event added and meeting scheduled.' : 'Event added to calendar.') + (idSuffix ? `${idSuffix}.` : ''),
      )
      await qc.invalidateQueries({ queryKey: ['calendar-events'] })
      await qc.invalidateQueries({ queryKey: ['position-calendar-events', positionId] })
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
          if (scheduleMeetingEmail) {
            const v = validateInterviewMake()
            if (v) {
              toastError(v)
              return
            }
          }
          saveEvent.mutate()
        }}
      >
        <p className="text-ink-muted text-xs dark:text-stone-400">
          Creates a calendar block on your Overview. It is linked to this candidate; role, stage, and interviewer are
          saved in the event description.
        </p>

        <label className="flex min-w-0 flex-col gap-1 text-sm font-medium">
          <span className="inline-flex flex-wrap items-baseline gap-0">
            Task name<span className="text-rose-600 dark:text-rose-400">*</span>
          </span>
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

        {!scheduleMeetingEmail ? (
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
        ) : null}

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

        <div className="mt-1 flex flex-col gap-3 border-t border-stone-200/80 pt-4 dark:border-stone-600">
          <label className="text-ink-muted flex cursor-pointer items-start gap-2 text-sm dark:text-stone-400">
            <input
              type="checkbox"
              checked={scheduleMeetingEmail}
              onChange={(e) => setScheduleMeetingEmail(e.target.checked)}
              className="border-line mt-0.5 rounded border-stone-300 dark:border-stone-600"
            />
            <span>Schedule Meeting (Email)</span>
          </label>

          {scheduleMeetingEmail ? (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <div className="min-w-0 flex flex-col gap-2 rounded-xl border border-stone-200/90 bg-stone-50/50 p-3 dark:border-stone-600 dark:bg-stone-900/40">
                <p className="text-ink-muted text-xs font-semibold dark:text-stone-400">Interviewer</p>
                <label className="flex min-w-0 flex-col gap-1 text-sm font-medium">
                  <span className="inline-flex flex-wrap items-baseline gap-x-1">
                    Name
                    <abbr
                      title="Required"
                      className="cursor-help text-rose-600 no-underline dark:text-rose-400"
                    >
                      *
                    </abbr>
                  </span>
                  <input
                    value={interviewer}
                    onChange={(e) => setInterviewer(e.target.value)}
                    className="border-line rounded-xl border px-3 py-2 font-normal dark:border-line-dark dark:bg-stone-900/50"
                    placeholder="Name"
                    autoComplete="name"
                  />
                </label>
                <label className="flex min-w-0 flex-col gap-1 text-sm font-medium">
                  <span className="inline-flex flex-wrap items-baseline gap-x-1">
                    Email
                    <abbr
                      title="Required"
                      className="cursor-help text-rose-600 no-underline dark:text-rose-400"
                    >
                      *
                    </abbr>
                  </span>
                  <input
                    type="email"
                    value={interviewerMail}
                    onChange={(e) => setInterviewerMail(e.target.value)}
                    className="border-line rounded-xl border px-3 py-2 font-normal dark:border-line-dark dark:bg-stone-900/50"
                    placeholder="email@company.com"
                    autoComplete="email"
                  />
                </label>
              </div>
              <div className="min-w-0 flex flex-col gap-2 rounded-xl border border-stone-200/90 bg-stone-50/50 p-3 dark:border-stone-600 dark:bg-stone-900/40">
                <p className="text-ink-muted text-xs font-semibold dark:text-stone-400">Interviewer 2</p>
                <label className="flex min-w-0 flex-col gap-1 text-sm font-medium">
                  <span className="inline-flex flex-wrap items-baseline gap-x-1">
                    Name
                  </span>
                  <input
                    value={interviewer2Name}
                    onChange={(e) => setInterviewer2Name(e.target.value)}
                    className="border-line rounded-xl border px-3 py-2 font-normal dark:border-line-dark dark:bg-stone-900/50"
                    placeholder="Optional"
                    autoComplete="off"
                  />
                </label>
                <label className="flex min-w-0 flex-col gap-1 text-sm font-medium">
                  <span className="inline-flex flex-wrap items-baseline gap-x-1">
                    Email
                  </span>
                  <input
                    type="email"
                    value={interviewer2Mail}
                    onChange={(e) => setInterviewer2Mail(e.target.value)}
                    className="border-line rounded-xl border px-3 py-2 font-normal dark:border-line-dark dark:bg-stone-900/50"
                    placeholder="Optional"
                    autoComplete="email"
                  />
                </label>
              </div>
              <div className="min-w-0 flex flex-col gap-2 rounded-xl border border-stone-200/90 bg-stone-50/50 p-3 dark:border-stone-600 dark:bg-stone-900/40">
                <p className="text-ink-muted text-xs font-semibold dark:text-stone-400">Candidate</p>
                <label className="flex min-w-0 flex-col gap-1 text-sm font-medium">
                  <span className="inline-flex flex-wrap items-baseline gap-x-1">
                    Name
                    <abbr
                      title="Required"
                      className="cursor-help text-rose-600 no-underline dark:text-rose-400"
                    >
                      *
                    </abbr>
                  </span>
                  <input
                    value={candidateNameEdit}
                    onChange={(e) => setCandidateNameEdit(e.target.value)}
                    className="border-line rounded-xl border px-3 py-2 font-normal dark:border-line-dark dark:bg-stone-900/50"
                    placeholder="Candidate name"
                    autoComplete="name"
                  />
                </label>
                <label className="flex min-w-0 flex-col gap-1 text-sm font-medium">
                  <span className="inline-flex flex-wrap items-baseline gap-x-1">
                    Email
                    <abbr
                      title="Required"
                      className="cursor-help text-rose-600 no-underline dark:text-rose-400"
                    >
                      *
                    </abbr>
                  </span>
                  <input
                    type="email"
                    value={candidateMail}
                    onChange={(e) => setCandidateMail(e.target.value)}
                    className="border-line rounded-xl border px-3 py-2 font-normal dark:border-line-dark dark:bg-stone-900/50"
                    placeholder="candidate@email.com"
                    autoComplete="email"
                  />
                </label>
              </div>
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2">
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
        </div>
      </form>
    </Modal>
  )
}
