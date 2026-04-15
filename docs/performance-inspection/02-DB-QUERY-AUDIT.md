# Phase 2: Database and query inspection

**Source of truth:** [`supabase/migrations/`](../../supabase/migrations/) (Postgres + RLS + indexes).  
**App access:** Supabase JS `.from(...).select(...)` across `src/pages/**`, `src/hooks/**`, `src/lib/**`.

## 2.1 Index coverage vs hot queries

### Strong coverage (examples from migrations)

- `companies(user_id)`, `positions(user_id, company_id)`, `position_stages(position_id)`
- `position_candidates(user_id, position_id, candidate_id)`, `(position_id, status)`
- `tasks(user_id)`, `tasks(position_id)`, partial indexes on `position_candidate_id` / `candidate_id`
- `tasks(user_id, status, sort_order)`, `tasks(user_id, updated_at desc)`
- `activity_events(position_id, created_at desc)` (+ partial candidate / position_candidate variants in `014_architecture_refactor.sql`)
- `calendar_events(user_id, starts_at)`, reminder/important variants in `010_calendar_events_enhancements.sql`
- `work_time_entries` user/position/time indexes (`003_work_time.sql`)
- Token tables: partial indexes on `token` where not revoked

### Gaps / risks

| Gap | Evidence | Risk |
|-----|----------|------|
| **`reminders` table** | Created in `001_initial.sql`; **no `CREATE INDEX`** on `user_id` / `due_at` in migration grep | List/count by `user_id` may seq-scan as rows grow. |
| **Candidate dedup lookups** | `candidates.email_normalized`, `phone_normalized` in `001_initial.sql`; **no btree** on `(user_id, email_normalized)` or `(user_id, phone_normalized)` | Excel import / dedup in `PositionDetailPage` does per-row `maybeSingle()` lookups. |
| **Large IN lists** | `usePipelineHeadlineStats` loads all active `positions.id` then `position_candidates` rows in `in_progress` | OK for small tenants; degrades with many positions (wide `IN`, large row payloads). |

## 2.2 Unbounded reads (missing pagination)

| Location | Pattern |
|----------|---------|
| `src/pages/CandidatesPage.tsx` | Loads user’s candidates with **deep nested** `position_candidates → positions → companies` / stages; no `.range()` observed in inventory. |
| `src/pages/PositionsPage.tsx` | Loads positions with nested candidates/assignments for board UI; **full list** pattern. |
| `src/pages/TasksPage.tsx` | Loads all user tasks with deep embeds; filter toggles may still be client-side on full set. |

**Recommendation:** keyset pagination (`updated_at`, `id`), virtualized lists, or server-side filtered views/RPCs.

## 2.3 N+1 and sequential write/read loops

| Location | Pattern |
|----------|---------|
| `src/pages/PositionDetailPage.tsx` (`onExcel` path, ~796+) | **Per spreadsheet row**: sequential `await` on candidate lookup by email/phone, insert candidate, insert `position_candidates`. |
| `src/pages/CandidatesPage.tsx` (`archiveMutation`, ~333+) | Loop over in-progress `position_candidates`: **sequential** update + transition logging per row. |
| `src/pages/TasksPage.tsx` (`reorderTasksMutation`, ~381+) | `Promise.all` of one `update` per task (parallel but many round-trips); acceptable at small N, noisy at scale. |

## 2.4 Counts and head queries

| Location | Issue |
|----------|--------|
| `src/hooks/useDashboardTaskKpis.ts` | **Three** separate `count: 'exact', head: true` queries (open/closed/archived). Correct but triple round-trip. |
| `src/hooks/useNotificationCount.ts` | Four parallel queries; calendar legs use **`select('id')`** in a window then **dedupe in JS** — heavier than pure counts when many events exist. |

## 2.5 `select('*')` and wide payloads

| File | Use |
|------|-----|
| `src/pages/SettingsPage.tsx` | GDPR ZIP: loops tables, each `select('*').eq('user_id', uid)` — **unbounded** rows per table, sequential. |
| `src/pages/PositionDetailPage.tsx` | `position_stages` uses `select('*')`; position row uses wide `*` + companies embed. |
| `src/pages/CompanyDetailPage.tsx`, `ListSettingsPage.tsx`, `EmailTemplatesPage.tsx` | `select('*')` patterns widen over time. |

## 2.6 Limits (good patterns to extend)

- `PositionDetailPage` / `CandidateDetailPage`: `activity_events` with `.limit(...)` (good template for other feeds).

## 2.7 Suggested migration follow-ups (when implementing)

Add indexes only after validating query plans / access paths:

1. `create index ... on public.reminders (user_id, due_at);` (or `(user_id)` + sort on `due_at` depending on queries).
2. Partial or full indexes on `candidates (user_id, email_normalized)` and `(user_id, phone_normalized)` where normalized is not null.

**Rule:** Any new migration must be applied to the hosted Supabase project per project conventions (MCP `apply_migration` or linked CLI).
