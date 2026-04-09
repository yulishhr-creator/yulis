import type { NavigateFunction } from 'react-router-dom'
import type { LucideIcon } from 'lucide-react'
import {
  Bell,
  Briefcase,
  Building2,
  CalendarPlus,
  ClipboardList,
  Clock,
  Mail,
  Settings,
  UserPlus,
} from 'lucide-react'

export type QuickFabAction = {
  id: string
  title: string
  subtitle?: string
  icon: LucideIcon
  iconBgClass: string
  onSelect: () => void
}

const iconBriefcase = 'rounded-xl bg-[#fd8863]/20 text-[#9b3e20] dark:text-orange-300'
const iconBuilding = 'rounded-xl bg-[#97daff]/20 text-[#006384] dark:text-cyan-300'
const iconTask = 'rounded-xl bg-emerald-500/15 text-emerald-800 dark:text-emerald-300'
const iconCal = 'rounded-xl bg-[#97daff]/25 text-[#006384] dark:text-cyan-300'
const iconMail = 'rounded-xl bg-violet-500/15 text-violet-900 dark:text-violet-300'
const iconBell = 'rounded-xl bg-amber-500/15 text-amber-900 dark:text-amber-300'
const iconClock = 'rounded-xl bg-sky-500/15 text-sky-900 dark:text-sky-300'
const iconUser = 'rounded-xl bg-orange-500/15 text-orange-900 dark:text-orange-300'
const iconGear = 'rounded-xl bg-stone-500/15 text-stone-800 dark:text-stone-300'

function mergeSearch(pathname: string, currentSearch: string, patch: Record<string, string>) {
  const raw = currentSearch.startsWith('?') ? currentSearch.slice(1) : currentSearch
  const p = new URLSearchParams(raw)
  for (const [k, v] of Object.entries(patch)) p.set(k, v)
  const q = p.toString()
  return { pathname, search: q ? `?${q}` : '' }
}

/** Actions for the bottom + menu, ordered for the current route (mobile). */
export function buildQuickFabActions(opts: {
  pathname: string
  search: string
  navigate: NavigateFunction
  closeModal: () => void
  /** True when viewing a single position (UUID path). */
  onPositionDetail: boolean
  positionDetailPath?: string
}): QuickFabAction[] {
  const { pathname, search, navigate, closeModal, onPositionDetail, positionDetailPath } = opts

  const done = (fn: () => void) => () => {
    closeModal()
    fn()
  }

  const createTask = (subtitle?: string): QuickFabAction => ({
    id: 'task',
    title: 'Create Task',
    subtitle: subtitle ?? 'Choose role on the next screen',
    icon: ClipboardList,
    iconBgClass: iconTask,
    onSelect: done(() => navigate('/?addTask=1')),
  })

  const createPosition = (subtitle?: string): QuickFabAction => ({
    id: 'position',
    title: 'Create new Position',
    subtitle: subtitle ?? 'New role for a client',
    icon: Briefcase,
    iconBgClass: iconBriefcase,
    onSelect: done(() => navigate('/positions?create=1')),
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

  const addCompany = (): QuickFabAction => ({
    id: 'add-company',
    title: 'Add company',
    subtitle: 'New client profile',
    icon: Building2,
    iconBgClass: iconBuilding,
    onSelect: done(() => navigate('/companies/new')),
  })

  // Single position: role-specific shortcuts first
  if (onPositionDetail && positionDetailPath) {
    return [
      {
        id: 'add-candidate',
        title: 'Add candidate',
        subtitle: 'Scrolls to the form on this role',
        icon: UserPlus,
        iconBgClass: iconUser,
        onSelect: done(() => navigate(mergeSearch(positionDetailPath, search, { addCandidate: '1' }))),
      },
      createTask('Company & role filled from this page'),
      {
        id: 'role-setup',
        title: 'Role setup',
        subtitle: 'Recruitment stages & Excel import',
        icon: Settings,
        iconBgClass: iconGear,
        onSelect: done(() => navigate(mergeSearch(positionDetailPath, search, { setup: '1' }))),
      },
      createPosition(),
      calendar(),
      email(),
      reminder(),
    ]
  }

  // Companies list
  if (pathname === '/companies') {
    return [addCompany(), email(), createTask(), createPosition(), calendar(), reminder()]
  }

  // New or existing company form
  if (pathname.startsWith('/companies/')) {
    return [createTask(), createPosition(), calendar(), email(), reminder(), addCompany()]
  }

  // Positions list (not detail)
  if (pathname === '/positions') {
    return [
      createPosition('Start the create-role flow'),
      createTask(),
      calendar(),
      email(),
      reminder(),
    ]
  }

  if (pathname === '/calendar') {
    return [calendar(), createTask(), createPosition(), email(), reminder()]
  }

  if (pathname === '/notifications') {
    return [reminder(), createTask(), createPosition(), calendar(), email()]
  }

  if (pathname === '/time') {
    return [trackTime(), createTask(), createPosition(), calendar(), email(), reminder()]
  }

  const assignCandidate = (): QuickFabAction => ({
    id: 'assign-candidate',
    title: 'Assign candidate',
    subtitle: 'Move someone to another open role',
    icon: UserPlus,
    iconBgClass: iconUser,
    onSelect: done(() => navigate('/?assignCandidate=1')),
  })

  // Dashboard home
  if (pathname === '/') {
    return [createPosition(), createTask(), assignCandidate(), calendar(), email(), reminder()]
  }

  // Settings, profile, templates, etc.
  return [createTask(), createPosition(), calendar(), email(), reminder()]
}
