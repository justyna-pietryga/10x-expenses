# Finance Domain Foundation - Plan Brief

> Full plan: `context/changes/finance-domain-foundation/plan.md`

## What & Why

Build the database and type foundation for the Expenses MVP. F-01 exists so later slices can rely on one consistent, per-user model for finance records, import batches, categories, limits, rules, and summaries.

## Starting Point

Supabase auth and protected routes already exist, but there are no expenses-domain migrations yet. The current app can identify authenticated users; it cannot persist budgeting or statement-review data.

## Desired End State

The repo has a Supabase migration defining the v1 finance domain with strict per-user RLS. Generated TypeScript database types are available to the app, and the foundation has documented RLS verification proving users cannot access each other's finance data.

## Key Decisions Made

| Decision | Choice | Why |
| --- | --- | --- |
| Foundation boundary | Schema, RLS, and generated types only | Keeps F-01 focused and avoids guessing later UI/API contracts. |
| Categories | User-owned categories only | Matches the PRD's custom-category requirement with simple isolation. |
| Limits | Percentage limit stored on category | Supports S-01 directly without adding monthly limit history prematurely. |
| Import grouping | Import batch per user, bank, and statement period | Gives later replace-batch behavior a stable target. |
| Money/date storage | Postgres `numeric` and `date` | Keeps SQL values readable while matching statement-derived monthly summaries. |
| Rules | Simple merchant text pattern to target category | Matches the PRD example `Lidl -> Food` without overbuilding a rule engine. |
| RLS | Direct `user_id` ownership on every finance table | Makes the privacy boundary explicit and auditable. |
| Verification | Migration smoke plus RLS checks | Tests the highest-risk part of this foundation: per-user isolation. |

## Scope

**In scope:**

- Initial finance-domain Supabase migration.
- Tables for categories, income, import batches, transactions, categorization rules, and monthly summaries.
- Constraints, indexes, and direct owner-column RLS policies.
- Generated TypeScript database types.
- Typed Supabase client generic.
- RLS verification notes.

**Out of scope:**

- UI, API routes, parser logic, service helpers, and seed/demo data.
- Global/default category catalog.
- Bank sync, family sharing, mobile app, or AI-only categorization.

## Architecture / Approach

Use Supabase as the source of truth for the finance domain. Every table includes `user_id`, every table has RLS enabled, and policies enforce `auth.uid() = user_id`. The Astro app keeps the existing Supabase SSR client but adds generated database typing for downstream work.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Domain Migration and RLS | Finance tables, constraints, indexes, and ownership policies | Schema misses a future slice need or RLS is too loose. |
| 2. Type Contracts and Supabase Client Typing | Generated database types wired into the existing client | Type generation or client typing breaks current auth flow. |
| 3. Isolation Verification and Handoff Readiness | Repeatable RLS verification notes and handoff evidence | Privacy checks are not specific enough for later review. |

**Prerequisites:** Local Supabase CLI workflow is available, and Supabase env vars remain outside committed files.
**Estimated effort:** About 2-3 implementation sessions across 3 phases.

## Open Risks & Assumptions

- Local Supabase may need startup/config work before migrations can be applied.
- The exact statement-period representation should be chosen during migration implementation, but it must support one batch per user, bank, and period.
- Generated database types should be committed because later slices depend on them.

## Success Criteria (Summary)

- Later slices can reference stable tables for budget setup, imports, review, rules, and summaries.
- RLS prevents cross-user access to all finance-domain data.
- `npx astro check`, `npm run lint`, and `npm run build` pass after type wiring.
