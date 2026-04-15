# Phase 1: Baseline and profiling

## 1.1 Repo-derived baseline (captured during inspection)

| Signal | Value | Notes |
|--------|--------|--------|
| Main JS bundle (prod) | **~1,455 kB** minified, **~426 kB** gzip | Single `index-*.js` chunk; Vite warns >500 kB. |
| Main CSS | **~165 kB** minified, **~20 kB** gzip | |
| Build time (local run) | **~0.4–0.5 s** | Does not reflect user TTI on slow networks. |
| PWA precache | **~2.1 MB** (19 entries) | First install / update adds work to cold start. |
| Code splitting | **None** | No `React.lazy` / dynamic imports for routes in `src/`. |
| First-session splash | **~5.2 s** gate | `AppSplash`: `HEADLINE_MS * 2` before children render (`src/components/ui/AppSplash.tsx`). |
| `PositionDetailPage` | **2686** lines, **24** `useQuery`/`useMutation` hooks | Primary complexity and parallel-query surface. |
| `TasksPage` | **1243** lines | Second large surface. |
| `CandidatesPage` | **936** lines | Deep nested selects. |
| `AppShell` | **495** lines | Global chrome + data. |

**Command used:** `npm run build` (see `package.json`).

## 1.2 Repeatable manual benchmark (operator checklist)

Run these in **Chrome** (or Chromium) with **Slow 4G** + **4× CPU slowdown** optional for stress.

### A) App boot and dashboard (`/`)

1. Open DevTools → **Performance** → record from reload until dashboard interactive.
2. **Network**: note document + JS + first Supabase calls; total transferred and waterfall length.
3. **React Profiler**: record mount of `App` → `AppShell` → `DashboardPage`; note commit duration.
4. Note whether **first visit** shows splash (~5.2s) vs returning tab (`sessionStorage` key `yulis_splash_seen`).

### B) Position detail (`/positions/:id`)

1. Navigate from list to a position with **realistic** candidate/task counts.
2. Performance: time from click to stable paint; watch long tasks.
3. Network: count parallel `.from(...)` requests on entry; total response bytes.
4. Profiler: commits while idle vs after a save (invalidation burst).

### C) Tasks (`/tasks`)

1. Toggle archived / open filters; watch duplicate fetches if any.
2. Profiler: drag-reorder or bulk actions if used.

### D) Candidates (`/candidates`)

1. Network: size of `candidates` + embedded `position_candidates` payload.
2. Profiler: filter/tab switch cost (derived lists on client).

## 1.3 What to record each run

- Date, branch, build command.
- Throttle preset.
- Screenshots or exported Performance trace paths.
- Top 3 slow network requests (URL pattern, size, duration).
- Top 3 React commits by duration (component name).

## 1.4 Post-remediation comparison

Re-run the same four flows after each **lane** (see `05-PRIORITIZED-BACKLOG.md`) and append a row to a simple table (same metrics columns).
