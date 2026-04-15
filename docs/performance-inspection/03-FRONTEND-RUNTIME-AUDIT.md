# Phase 3: Frontend runtime and state-stability

Stack: **Vite + React 19 + TanStack Query + React Router 7** (`src/App.tsx`, `src/main.tsx`).

## 3.1 Global 1 Hz rerenders (work timer)

**File:** `src/work/WorkTimerContext.tsx`

- `elapsedSeconds` updates every **1s** via `setInterval` while a session is open.
- Context `value` is `useMemo`’d with **`elapsedSeconds` in the dependency array**, so **all consumers** of `useWorkTimer()` get a new object every tick.

**File:** `src/components/layout/AppShell.tsx`

- Calls `useWorkTimer()` and renders `timer.elapsedSeconds` in the shell.

**Impact:** Entire `AppShell` subtree can rerender **once per second** during an active timer — sidebar, nav, children layout included unless isolated.

**Validate:** React Profiler with timer running; consider splitting “tick display” into a small child or `useSyncExternalStore` subscription so the shell does not subscribe to `elapsedSeconds`.

## 3.2 Route remounts and animation

**File:** `src/components/layout/AnimatedOutlet.tsx`

- `key={location.pathname}` on the animated wrapper → **full remount** of the active route’s outlet subtree on path change.

**Impact:** Local component state resets on navigation; mount effects rerun; can amplify “weird” behavior and duplicate fetches in dev.

**Validate:** Profiler when switching `/positions` ↔ `/tasks`; check for unintended state loss.

## 3.3 Query invalidation waterfalls

**File:** `src/pages/PositionDetailPage.tsx` — `invalidateAll` (~544–557)

- **Sequential** `await qc.invalidateQueries(...)` over **many** query keys (position, candidates, tasks, dashboard stats, notification count, companies income, etc.).

**Impact:** After saves, user can see **serial refetch** waves and UI “busy” periods; risk of **form reset** if position query refetches while editing (see below).

**Validate:** Network tab after “Save”; count sequential refetches vs parallel `refetchQueries`.

## 3.4 Draft overwrite risk (server-driven form reset)

**File:** `src/pages/PositionDetailPage.tsx`

- Effects keyed on **`position`** that bulk-copy server fields into local React state will **reset drafts** whenever the `position` object identity changes after refetch.

**Impact:** “Random” field resets if `refetchOnWindowFocus` / invalidations fire during edits (TanStack Query default refetch behavior beyond `staleTime`).

**Validate:** Edit a field → trigger refocus/refetch → observe state.

## 3.5 Startup and perceived latency

| Factor | Location |
|--------|----------|
| Splash gate ~5.2s | `src/components/ui/AppSplash.tsx` |
| No route-level code splitting | `src/App.tsx` — static imports of all pages |
| Heavy libs in main graph | `xlsx`, `jszip` in dependencies; `PositionDetailPage` imports `xlsx` at module top |
| **StrictMode** double mount in dev | `src/main.tsx` — effects run twice in development |

## 3.6 Misc runtime hotspots

- **Weather:** `useOpenMeteoWeather` + `WeatherVibes` — local `useEffect` fetch (not React Query); **StrictMode** can double geolocation/fetch in dev (`src/hooks/useOpenMeteoWeather.ts` if present).
- **Dashboard calendar:** `OverviewCalendarAndEvents.tsx` — two queries to `calendar_events` (month grid + upcoming); overlapping traffic vs single query + split.
- **Auth seed:** `AuthProvider` + `seedDemoIfEmpty` — post-login work adds latency (inspect `src/auth/AuthProvider.tsx`, `src/lib/seed.ts`).

## 3.7 Hydration

Client-only `createRoot` — **no SSR hydration** in this repo; “hydration mismatch” is unlikely unless SSR is added later.
