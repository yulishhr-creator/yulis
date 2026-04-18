import { appendFileSync } from 'node:fs'

/** NDJSON line for Cursor debug session (local `vercel dev` only; cloud has no access to this path). */
const LOG_PATH = '/Users/dr/yulis/.cursor/debug-938437.log'

export function agentDebugLog(entry: {
  location: string
  message: string
  hypothesisId: string
  data?: Record<string, unknown>
}) {
  try {
    appendFileSync(
      LOG_PATH,
      `${JSON.stringify({
        sessionId: '938437',
        timestamp: Date.now(),
        ...entry,
      })}\n`,
    )
  } catch {
    // ignore (e.g. Vercel production filesystem)
  }
}
