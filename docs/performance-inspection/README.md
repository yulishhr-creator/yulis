# Performance & code health inspection

**CI:** On pushes to `main`, GitHub Actions runs `npm ci`, `npm run lint`, `npm run test`, and `npm run build` (see `.github/workflows/ci.yml`). Add focused unit tests under `src/**/*.test.ts` (e.g. `src/lib/urls.test.ts`).

This folder contains the **evidence-first inspection** outputs from the refactor plan: baseline signals, DB/query audit, frontend runtime audit, duplication map, and a **prioritized remediation backlog**.

| Doc | Purpose |
|-----|---------|
| [01-BASELINE.md](./01-BASELINE.md) | Repeatable profiling steps + repo-derived baseline (bundle, splash, module size). |
| [02-DB-QUERY-AUDIT.md](./02-DB-QUERY-AUDIT.md) | Schema/index cross-check vs app queries; N+1 and unbounded reads. |
| [03-FRONTEND-RUNTIME-AUDIT.md](./03-FRONTEND-RUNTIME-AUDIT.md) | Rerender, navigation, invalidation, and startup behavior. |
| [04-DUPLICATION-AUDIT.md](./04-DUPLICATION-AUDIT.md) | Near-duplicate helpers/components and god-module hotspots. |
| [05-PRIORITIZED-BACKLOG.md](./05-PRIORITIZED-BACKLOG.md) | Lanes A/B/C with impact, effort, risk, and validation. |

## Repeatable baseline (local)

From repo root:

```bash
npm run perf:baseline
```

This runs a production build and prints chunk sizes plus key file line counts. For full traces, follow the manual steps in `01-BASELINE.md` (Chrome Performance + React Profiler + Network).
