/** Shared wizard types/constants (separate file for react-refresh fast refresh). */

export const WIZARD_STEPS = ['Basics', 'Workflow', 'Candidates', 'Summary'] as const

export type StageDraft = {
  name: string
  description: string
  interviewers: string
  durationMinutes: string
  isRemote: boolean
}
