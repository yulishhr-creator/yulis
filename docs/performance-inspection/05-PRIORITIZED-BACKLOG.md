# Phase 5: Prioritized remediation backlog

Each item: **Problem → Impact → Scope → Effort → Risk → Validate**.

Effort: **S** small (<1d), **M** (1–3d), **L** (>3d).  
Impact: **H** high, **M** medium, **L** low.

---

## Lane A — Quick wins (1–2 days total, low risk)

| ID | Problem | Impact | Scope | Effort | Risk | Validate |
|----|---------|--------|-------|--------|------|----------|
| A1 | Sequential `invalidateAll` causes refetch waterfall | H | `PositionDetailPage.tsx` | S | M | Network: parallel invalidations or targeted keys; fewer sequential awaits |
| A2 | `select('*')` on stages / templates / list settings widens payloads | M | `PositionDetailPage`, `EmailTemplatesPage`, `ListSettingsPage`, `CompanyDetailPage` | S | L | Smaller JSON in Network; same UI |
| A3 | Notification calendar legs fetch `id` rows vs counts | M | `useNotificationCount.ts` | S | L | Head `count` or single RPC; same badge number |
| A4 | Three separate task KPI counts | M | `useDashboardTaskKpis.ts` | S | L | One RPC or `GROUP BY`; 1 round-trip |
| A5 | `reminders` / candidate lookup missing supporting indexes | M–H | New migration under `supabase/migrations/` | S | M | `EXPLAIN` on slow queries; apply to hosted DB per project rules |
| A6 | Document splash vs product tradeoff | L (UX) | `AppSplash.tsx` + product | S | L | Decision: shorten or skip for returning users |

---

## Lane B — Performance core (3–7 days)

| ID | Problem | Impact | Scope | Effort | Risk | Validate |
|----|---------|--------|-------|--------|------|----------|
| B1 | Single ~1.45 MB JS chunk; no route splitting | H | `App.tsx`, Vite config, lazy boundaries | M | M | Build: multiple chunks; LCP/TTI on 4G |
| B2 | `xlsx` / `jszip` on critical path | H | `PositionDetailPage`, `SettingsPage` | S–M | M | Dynamic `import()`; smaller initial bundle |
| B3 | Unbounded list queries (candidates, positions, tasks) | H | `CandidatesPage`, `PositionsPage`, `TasksPage` | L | H | Pagination + virtualizer; stable memory |
| B4 | Excel import row loop (N round-trips) | H | `PositionDetailPage` `onExcel` | M–L | M | Batch RPC or chunked client; time for N rows |
| B5 | GDPR export sequential `select('*')` | H (power users) | `SettingsPage.tsx` | M | M | Chunked `range`, column lists, or Edge Function |
| B6 | `usePipelineHeadlineStats` row scan | M–H | `usePipelineHeadlineStats.ts` + optional RPC | M | M | Same numbers; fewer rows over wire |
| B7 | Archive mutation sequential updates | M | `CandidatesPage.tsx` | M | M | Bulk update or RPC |

---

## Lane C — Structural health (ongoing)

| ID | Problem | Impact | Scope | Effort | Risk | Validate |
|----|---------|--------|-------|--------|------|----------|
| C1 | God page `PositionDetailPage` | H (maintainability) | Split into feature modules | L | H | Same E2E flows; smaller PRs |
| C2 | Duplicate nested relation helpers | M | New `src/lib/supabaseNested.ts`; replace 3 copies | M | M | Types + one golden test |
| C3 | Duplicate task sort logic | M | Shared `taskSort.ts` | S | M | Order parity tests |
| C4 | `AppShell` + timer coupling | M–H | Isolate timer display from shell context | M | M | Profiler: no 1Hz shell commits |
| C5 | `AnimatedOutlet` remount strategy | M | Router layout / motion scope | M | M | State preserved where expected |
| C6 | Header / loader consolidation | L–M | `PageHeader` vs `ScreenHeader`; loaders | M | M | Visual regression checklist |
| C7 | Dead tables/columns | L until proven | DB + app grep + migration | L | H | Staging + backup before drop |

---

## Execution order (suggested)

1. **A1, A2, A3, A4** — cheap latency wins and less load on Supabase.
2. **A5** — indexes after confirming query shapes (requires migration apply).
3. **B2, B1** — bundle and TTI.
4. **B3, B4, B5** — scale paths.
5. **C1–C5** — parallelize with feature work to avoid re-godding files.

---

## Validation checklist (after each lane)

- [ ] `npm run build` passes.
- [ ] `npm run perf:baseline` (or full manual checklist in `01-BASELINE.md`) recorded.
- [ ] Core flows: dashboard, position detail, tasks, candidates — manual smoke.
- [ ] No regression on auth, timer stop/start, notifications badge count.
- [ ] If DB migrations added: applied to hosted Supabase + spot-check PostgREST.

---

## Out of scope for this inspection pass

- Rewriting product requirements (e.g. removing splash) without PM sign-off.
- Dropping production tables without a deprecation window and backup.
