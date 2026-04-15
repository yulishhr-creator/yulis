# Phase 4: Code health and duplication

## 4.1 “God modules” (split candidates)

| Module | Lines (approx.) | Notes |
|--------|-----------------|--------|
| `src/pages/PositionDetailPage.tsx` | ~2686 | Pipeline, tasks, activity, tokens, Excel import, mutations, many queries. |
| `src/pages/TasksPage.tsx` | ~1243 | Drag/drop, templates, nested joins. |
| `src/pages/CandidatesPage.tsx` | ~936 | Tabs, filters, nested `position_candidates`. |

**Direction:** feature folders — `position-detail/{hooks,components,mutations}.tsx`, shared types, colocated tests.

## 4.2 Repeated Supabase relation shaping

Same problem (PostgREST returns **object or array** for nested 1:1) solved **three different ways**:

| Helper | File |
|--------|------|
| `nestedOne<T>` | `src/pages/TasksPage.tsx` |
| `nestedCandidate` | `src/pages/PositionDetailPage.tsx` |
| `nestedPcList` | `src/pages/CandidatesPage.tsx` |

**Recommendation:** one module e.g. `src/lib/supabaseNested.ts` with typed helpers + unit tests.

## 4.3 Task ordering / ranking logic

Similar **open / closed / archived** ordering and `sort_order` / `due_at` / `updated_at` tie-break logic appears in:

- `src/pages/TasksPage.tsx`
- `src/pages/PositionDetailPage.tsx` (task sections)

**Risk:** behavior drift when only one copy is updated.

## 4.4 UI primitives overlap

| Area | Candidates |
|------|--------------|
| Page headers | `src/components/ui/PageHeader.tsx` vs `src/components/layout/ScreenHeader.tsx` (both Framer Motion + title patterns). |
| Loaders | `BrandLoader`, `PageSpinner`, `SplashFuturisticLoader` — overlapping UX roles. |
| Pipeline column headings | Comments link `PositionsPage` column styling with `PositionDetailPage` pipeline heading classes — near-duplicate CSS/strings. |

## 4.5 DateTime local helpers

`toDatetimeLocalValue` (and similar) referenced in plan:

- `TasksPage` — local helper
- `CalendarEventFormModal`, `NotificationsPage` — similar `datetime-local` handling

**Recommendation:** single `src/lib/datetimeLocal.ts`.

## 4.6 Dead / legacy signals

- `/calendar` → `/` redirect in `App.tsx` (legacy bookmarks).
- Tech debt is often **implicit in file size**, not `TODO` comments — rely on audits and ownership.

## 4.7 Tables / fields cleanup (process)

Do **not** drop columns/tables from this doc alone. Recommended sequence:

1. Inventory columns: `information_schema` vs `grep` usage in `src/`.
2. Mark deprecated in UI/migrations with comments.
3. Remove reads/writes, then migration to drop with backup.

Candidate areas for **usage review** (not confirmed unused): legacy routes, old export keys in `SettingsPage`, OAuth tables if feature unused.
