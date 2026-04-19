/** Hosted Vercel or unknown cloud env: never touch the filesystem. Only `vercel dev` keeps VERCEL_ENV=development. */
function shouldSkipFileLog(): boolean {
  if (process.env.VERCEL !== '1') return false
  return process.env.VERCEL_ENV !== 'development'
}

/**
 * Append NDJSON to the Cursor debug log (local `vercel dev` / non-Vercel only).
 * No top-level `node:fs` import — avoids bundler/runtime issues on Vercel.
 */
export function agentDebugLog(entry: {
  location: string
  message: string
  hypothesisId: string
  data?: Record<string, unknown>
}): void {
  if (shouldSkipFileLog()) return

  const LOG_PATH = '/Users/dr/yulis/.cursor/debug-938437.log'
  void (async () => {
    try {
      const { appendFileSync } = await import('node:fs')
      appendFileSync(
        LOG_PATH,
        `${JSON.stringify({
          sessionId: '938437',
          timestamp: Date.now(),
          ...entry,
        })}\n`,
      )
    } catch {
      // ignore
    }
  })()
}
