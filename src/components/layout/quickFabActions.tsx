import type { NavigateFunction } from 'react-router-dom'
import type { LucideIcon } from 'lucide-react'
import {
  ArrowRightLeft,
  Bell,
  Briefcase,
  Building2,
  CalendarPlus,
  ClipboardList,
  Clock,
  Mail,
} from 'lucide-react'

export type QuickFabAction = {
  id: string
  title: string
  subtitle?: string
  icon: LucideIcon
  /** Tile wrapper: gradient background; icon renders white on top */
  iconBgClass: string
  onSelect: () => void
}

/** Vibrant tiles (match accent system: coral, cyan, violet — readable on light + dark UI). */
const iconAssign =
  'rounded-xl bg-gradient-to-br from-violet-600 to-fuchsia-500 text-white shadow-md shadow-violet-500/35 dark:from-violet-500 dark:to-fuchsia-600 dark:shadow-violet-900/40'
const iconClient =
  'rounded-xl bg-gradient-to-br from-sky-500 to-cyan-600 text-white shadow-md shadow-sky-500/30 dark:from-sky-400 dark:to-cyan-700 dark:shadow-cyan-900/30'
const iconBriefcase =
  'rounded-xl bg-gradient-to-br from-amber-600 to-[#fd8863] text-white shadow-md shadow-orange-500/30 dark:from-amber-500 dark:to-orange-500 dark:shadow-orange-900/35'
const iconTask =
  'rounded-xl bg-gradient-to-br from-emerald-600 to-teal-500 text-white shadow-md shadow-emerald-500/25 dark:from-emerald-500 dark:to-teal-600 dark:shadow-emerald-900/30'
const iconCal =
  'rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-500/30 dark:from-blue-500 dark:to-indigo-700 dark:shadow-blue-900/35'
const iconMail =
  'rounded-xl bg-gradient-to-br from-rose-500 to-pink-600 text-white shadow-md shadow-rose-500/25 dark:from-rose-400 dark:to-pink-700 dark:shadow-rose-900/30'
const iconBell =
  'rounded-xl bg-gradient-to-br from-amber-500 to-amber-600 text-white shadow-md shadow-amber-500/25 dark:from-amber-400 dark:to-amber-700'
const iconClock =
  'rounded-xl bg-gradient-to-br from-slate-600 to-slate-800 text-white shadow-md shadow-slate-500/25 dark:from-slate-500 dark:to-slate-900 dark:shadow-black/40'

/**
 * Same quick actions on every screen (sidebar + modal).
 * Order: Assign Candidate → Create Client → …
 */
export function buildQuickFabActions(opts: {
  navigate: NavigateFunction
  closeModal: () => void
}): QuickFabAction[] {
  const { navigate, closeModal } = opts

  const done = (fn: () => void) => () => {
    closeModal()
    fn()
  }

  const assignCandidate = (): QuickFabAction => ({
    id: 'assign-candidate',
    title: 'Assign Candidate',
    subtitle: 'Move someone to another active role',
    icon: ArrowRightLeft,
    iconBgClass: iconAssign,
    onSelect: done(() => navigate('/candidates?assign=1')),
  })

  const createClient = (): QuickFabAction => ({
    id: 'create-client',
    title: 'Create Client',
    subtitle: 'New company profile',
    icon: Building2,
    iconBgClass: iconClient,
    onSelect: done(() => navigate('/companies/new')),
  })

  const createPosition = (): QuickFabAction => ({
    id: 'position',
    title: 'Create new Position',
    subtitle: 'New role for a client',
    icon: Briefcase,
    iconBgClass: iconBriefcase,
    onSelect: done(() => navigate('/positions?create=1')),
  })

  const createTask = (): QuickFabAction => ({
    id: 'task',
    title: 'Create Task',
    subtitle: 'Choose role on the next screen',
    icon: ClipboardList,
    iconBgClass: iconTask,
    onSelect: done(() => navigate('/?addTask=1')),
  })

  const calendar = (): QuickFabAction => ({
    id: 'calendar',
    title: 'Add Calendar Event',
    subtitle: 'On your calendar — separate from reminders',
    icon: CalendarPlus,
    iconBgClass: iconCal,
    onSelect: done(() => navigate('/calendar?new=1')),
  })

  const email = (): QuickFabAction => ({
    id: 'email',
    title: 'Send An Email',
    subtitle: 'Pick a client with a contact email',
    icon: Mail,
    iconBgClass: iconMail,
    onSelect: done(() => navigate('/companies?sendEmail=1')),
  })

  const reminder = (): QuickFabAction => ({
    id: 'reminder',
    title: 'Set Reminder',
    subtitle: 'A nudge for yourself — not a calendar block',
    icon: Bell,
    iconBgClass: iconBell,
    onSelect: done(() => navigate('/notifications?newReminder=1')),
  })

  const trackTime = (): QuickFabAction => ({
    id: 'track',
    title: 'Track time',
    subtitle: 'Start a timer on a role',
    icon: Clock,
    iconBgClass: iconClock,
    onSelect: done(() => navigate('/?trackTime=1')),
  })

  return [
    assignCandidate(),
    createClient(),
    createPosition(),
    createTask(),
    calendar(),
    email(),
    reminder(),
    trackTime(),
  ]
}
