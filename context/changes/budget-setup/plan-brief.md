# Budget Setup - Plan Brief

> Full plan: `context/changes/budget-setup/plan.md`

## What & Why

Build S-01 from the roadmap: the user can define monthly income, custom categories, and percentage-based limits before importing transactions. This gives the app a trustworthy personal budget frame so later import and summary slices can map spending against user-defined targets.

## Starting Point

F-01 already created the core finance tables, including `monthly_incomes` and `budget_categories`, with per-user RLS. The app currently has only auth pages plus a placeholder protected dashboard; there is no budget setup page, no budget API, no category archive field, and no test harness.

## Desired End State

A signed-in user can open `/budget`, save income for one month, create/edit/archive active categories, and keep active category percentage limits at or below 100 percent. The workflow uses server-side Astro API routes for writes and React islands only for interactive setup controls.

## Key Decisions Made

| Decision | Choice | Why |
| --- | --- | --- |
| Route | Dedicated `/budget` route | Keeps budget setup separate from the placeholder dashboard and gives later finance screens a clear place to link from. |
| Income model | One month at a time | Matches the existing `monthly_incomes` schema and the upcoming monthly-summary flow. |
| Category management | Full create/edit/archive | Users need to correct setup mistakes before importing transactions. |
| Category removal | Add `archived_at` | Preserves category history semantics better than hard delete and avoids blocking cleanup. |
| Limit total | Block active total above 100 percent | Keeps the budget setup mathematically usable for the MVP. |
| Write path | Astro API routes | Matches the existing server-side auth route pattern and keeps validation off the client. |
| UX shape | Compact operational page | Best fit for repeated finance setup work and the current app surface. |
| Testing | API and validation tests | Covers the risky data path without introducing a full browser-test stack yet. |

## Scope

**In scope:**

- Protected `/budget` page.
- Monthly income setup for one selected month.
- Active category create/edit/archive.
- Percentage-limit validation and total active limit enforcement.
- Additive category archive migration and regenerated database types.
- Minimal test harness plus validation/API tests.
- Roadmap S-01 readiness metadata.

**Out of scope:**

- Statement import and parser work.
- Transaction review and category correction.
- Categorization rules.
- Monthly summary generation.
- Carry-over accounting.
- Global/default income across months.

## Architecture / Approach

Add the missing archive field to the finance schema, then build a small budget domain layer in `src/lib/budget/` for validation and Supabase access. Astro API routes perform authenticated writes, while `/budget` loads initial data server-side and hydrates React islands for income and category editing.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Schema and Type Support | `archived_at` migration and regenerated types | Migration or generated types drift from the Supabase schema. |
| 2. Budget Domain Validation and API Routes | Server-side validation, data helpers, and budget API endpoints | Total-limit enforcement must be consistent across create/update paths. |
| 3. Protected Budget Page and UI | `/budget` page with income and category controls | UI must stay clear while blocking invalid totals. |
| 4. Tests, Documentation, and Roadmap Sync | Test harness, focused tests, and status alignment | Adding tests should stay small and not become a framework migration. |

**Prerequisites:** F-01 finance foundation is available in the local schema and generated types.
**Estimated effort:** Around 3-4 implementation sessions across 4 phases.

## Open Risks & Assumptions

- F-01 is treated as released enough to unblock S-01, even if the F-01 change folder still needs `/10x-archive`.
- Adding `archived_at` is accepted as part of S-01 because the chosen category-delete behavior is archive, not hard delete.
- The test runner should be minimal, with Vitest preferred unless implementation discovers a stronger local convention.
- S-02, S-03, and S-04 remain proposed until their own prerequisites are completed.

## Success Criteria (Summary)

- Signed-out users cannot access `/budget`.
- Signed-in users can save one month's income and manage active categories.
- Active category percentage limits cannot exceed 100 percent, both in server validation and in the UI.
