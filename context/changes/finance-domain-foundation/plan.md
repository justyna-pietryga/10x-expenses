# Finance Domain Foundation Implementation Plan

## Overview

Implement the database and type foundation for the Expenses MVP. This change creates the per-user finance domain model that later roadmap slices can use for budget setup, statement imports, category review, reusable rules, and monthly summaries.

## Current State Analysis

The application already has Supabase SSR auth and protected route plumbing, but no expenses-domain persistence model yet. F-01 is a foundation item, so this plan intentionally stops at schema, row-level security, type contracts, and verification; UI screens, import parsing, and feature endpoints belong to later slices.

## Desired End State

The repo has a first Supabase migration defining the finance domain tables, constraints, relationships, and RLS policies. Every finance row is owned by a user via `user_id`, and policies enforce `auth.uid() = user_id`. The app has generated TypeScript database contracts ready for later slices, and verification proves the migration applies and user-owned rows are isolated.

### Replan Note (2026-05-26):

Phase 2 uncovered a repo-wide lint baseline issue unrelated to this change: `npm run lint` currently fails on existing CRLF/Prettier formatting errors across many pre-existing files outside the finance foundation scope. The plan is adjusted so this foundation change still proves its own correctness without silently absorbing unrelated formatting churn.

### Key Discoveries:

- Roadmap F-01 requires one consistent persistence model for finance records, import batches, categories, limits, rules, and summaries: `context/foundation/roadmap.md:52`.
- PRD must-haves require account login, imports, supported banks, replace-batch behavior, transaction review, custom categories, percentage limits, reusable rules, and summaries: `context/foundation/prd.md:63`.
- Privacy is a product requirement: one user's financial data must never be visible to another user: `context/foundation/prd.md:90`.
- Supabase SSR auth already exists in `src/lib/supabase.ts:5` and middleware stores `context.locals.user` from Supabase auth in `src/middleware.ts:6`.
- Supabase has local config, but there are no existing migrations or seed files under `supabase/`.

## What We're NOT Doing

- No UI for budget setup, imports, reviews, rules, or summaries.
- No API route or service helper implementation beyond generated type contracts.
- No parser implementation for bank statement formats.
- No global/default category catalog.
- No seed/demo data that depends on auth users.
- No family/member sharing, automatic bank sync, or AI-only categorization.

## Implementation Approach

Use a single initial Supabase migration to define the v1 domain model and RLS contract. Keep the schema broad enough to unlock roadmap slices S-01 through S-04, but avoid adding workflow logic that belongs to those slices. After the migration is in place, generate TypeScript database types and update the Supabase client to carry the generated database type.

## Critical Implementation Details

### Security Boundary

Every finance-domain table should include a direct `user_id uuid not null references auth.users(id) on delete cascade` column, even when it also belongs to another owned parent. This makes RLS policies simple, auditable, and aligned with the decision to enforce `auth.uid() = user_id` on every finance table.

### Money and Dates

Money values should use Postgres `numeric`, not floating point. Transaction dates should use `date`, because the PRD requires statement-derived monthly summaries rather than timestamp-level accounting.

## Phase 1: Domain Migration and RLS

### Overview

Create the initial Supabase migration for the finance domain model, including table relationships, constraints, indexes, and row-level security.

### Changes Required:

#### 1. Finance Domain Migration

**File**: `supabase/migrations/<timestamp>_finance_domain_foundation.sql`

**Intent**: Define the database tables that later slices will use for categories, limits, income, statement batches, transactions, reusable categorization rules, and monthly summaries. This is the core contract for all downstream finance work.

**Contract**: The migration must create user-owned tables for:

- `budget_categories`: user-owned custom categories with a percentage limit stored on the category.
- `monthly_incomes`: user-owned income or estimated income per month.
- `statement_import_batches`: user-owned import batch per selected bank and statement period.
- `transactions`: user-owned parsed transactions belonging to an import batch, with transaction `date`, title, recipient, amount as `numeric`, and category assignment.
- `categorization_rules`: user-owned simple merchant text pattern mapped to a target category.
- `monthly_summaries`: user-owned monthly summary records that later slices can populate from reviewed data.

The schema must include constraints for:

- percentage limits bounded to a valid percentage range.
- one import batch per user, bank, and period so replacement behavior has a stable target.
- transactions belonging to owned import batches.
- categorization rules targeting owned categories.
- monthly income and monthly summary uniqueness per user and month.

#### 2. Row-Level Security Policies

**File**: `supabase/migrations/<timestamp>_finance_domain_foundation.sql`

**Intent**: Enforce the PRD privacy requirement that users can only see and mutate their own finance data.

**Contract**: Enable RLS on every finance-domain table and add explicit policies for `select`, `insert`, `update`, and `delete` using direct ownership:

- `using (auth.uid() = user_id)` for read/update/delete visibility.
- `with check (auth.uid() = user_id)` for inserts and writes.

Do not rely only on parent-table joins for security.

#### 3. Indexes and Integrity Helpers

**File**: `supabase/migrations/<timestamp>_finance_domain_foundation.sql`

**Intent**: Add the minimum indexes needed for later slices to query by user, month, import batch, category, and rule matching without scanning all finance rows.

**Contract**: Add indexes on common access paths:

- `user_id` on every finance table.
- `(user_id, month)` or equivalent monthly key on income and summary tables.
- `(user_id, bank, period_start, period_end)` on import batches.
- `import_batch_id`, `category_id`, and `transaction_date` on transactions.
- `target_category_id` and merchant pattern fields on rules.

### Success Criteria:

#### Automated Verification:

- The migration file exists under `supabase/migrations/` and applies with Supabase CLI local reset or migration apply.
- SQL inspection confirms RLS is enabled for every finance-domain table.
- SQL inspection confirms every finance-domain table has a `user_id` ownership column.
- SQL inspection confirms all PRD-owned finance entities are represented: categories, income, import batches, transactions, categorization rules, and monthly summaries.

#### Manual Verification:

- Review the migration and confirm it contains no UI/API workflow decisions beyond the domain persistence contract.
- Review constraints and confirm they support later roadmap prerequisites S-01, S-02, S-03, and S-04.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation that the migration shape is acceptable before proceeding to the next phase.

---

## Phase 2: Type Contracts and Supabase Client Typing

### Overview

Generate database type contracts from the migrated Supabase schema and wire them into the app's Supabase client without changing auth behavior.

### Changes Required:

#### 1. Generated Database Types

**File**: `src/lib/database.types.ts`

**Intent**: Give later slices strongly typed access to finance tables, inserts, updates, relationships, and enum-like fields.

**Contract**: Generate TypeScript types from the local Supabase database after Phase 1 migration applies. The file should be committed so downstream work can import the `Database` type without needing to regenerate types first.

#### 2. Supabase Client Generic

**File**: `src/lib/supabase.ts`

**Intent**: Preserve the existing SSR Supabase setup while attaching the generated database type.

**Contract**: Import the generated `Database` type and pass it to `createServerClient<Database>`. Keep the existing null-return behavior when Supabase env vars are missing, and do not change cookie/session handling.

#### 3. Locals Type Compatibility

**File**: `src/env.d.ts`

**Intent**: Confirm existing `App.Locals.user` typing still works after the Supabase client type becomes schema-aware.

**Contract**: Keep `App.Locals.user` compatible with `@supabase/supabase-js` `User | null`. Only adjust this file if TypeScript checking requires it.

### Success Criteria:

#### Automated Verification:

- Supabase type generation succeeds and creates `src/lib/database.types.ts`.
- `npx astro check` passes.
- `npm run lint` passes, or if it fails due to pre-existing repo-wide formatting debt outside this change, the implementer documents that failure and confirms the Phase 2 touched files are lint-clean in isolation.
- `npm run build` passes.

#### Manual Verification:

- Review `src/lib/supabase.ts` and confirm auth/session behavior is unchanged.
- Review generated types and confirm finance-domain tables appear under the `public` schema.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before proceeding to the next phase.

---

## Phase 3: Isolation Verification and Handoff Readiness

### Overview

Verify the foundation is safe to build on by checking RLS behavior, migration repeatability, and downstream handoff readiness.

### Changes Required:

#### 1. RLS Verification Script or SQL Notes

**File**: `context/changes/finance-domain-foundation/rls-verification.md`

**Intent**: Record how RLS was verified so later implementers know the privacy boundary was tested, not just declared.

**Contract**: Document the SQL/manual verification steps used to prove:

- authenticated user A can access only their finance rows.
- authenticated user B cannot access user A's finance rows.
- inserts fail when `user_id` does not match `auth.uid()`.
- unauthenticated access cannot read or mutate finance tables.

If the implementer chooses to add executable SQL instead, place it under the change folder unless the repo establishes a test harness first.

#### 2. Roadmap and GitHub Issue Handoff Notes

**File**: `context/changes/finance-domain-foundation/rls-verification.md`

**Intent**: Capture the result of the foundation work in a way that can be referenced from the GitHub issue and later `/10x-archive`.

**Contract**: Include the GitHub issue reference `#1` and list which downstream roadmap items are now unblocked when this foundation lands: S-01, S-02, S-03, S-04.

### Success Criteria:

#### Automated Verification:

- RLS verification notes or SQL exist at `context/changes/finance-domain-foundation/rls-verification.md`.
- `npx astro check` passes.
- `npm run lint` passes.
- `npm run build` passes.

#### Manual Verification:

- Confirm the verification notes are specific enough for another agent to repeat the RLS checks.
- Confirm GitHub issue `#1` can be updated with the migration/type verification result.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before archiving or marking the roadmap item done.

---

## Testing Strategy

### Unit Tests:

- No app unit tests are required in F-01 unless the implementer adds custom helper code beyond generated type wiring.
- If helper code is added despite the plan boundary, tests must cover ownership-aware queries and null Supabase client behavior.

### Integration Tests:

- Apply the migration to a local Supabase database.
- Generate TypeScript types from the migrated schema.
- Verify RLS with at least two authenticated user contexts or equivalent SQL role simulation.
- Run `npx astro check`, `npm run lint`, and `npm run build`.
- If `npm run lint` is blocked by unrelated baseline formatting debt, run targeted lint verification on the files changed by this plan and record that the repo-wide failure is pre-existing.

### Manual Testing Steps:

1. Inspect the migration for all required finance entities and direct `user_id` ownership.
2. Confirm every table has RLS enabled and policies for select/insert/update/delete.
3. Confirm cross-user read/write attempts are blocked.
4. Confirm existing auth flows still redirect unauthenticated `/dashboard` users to `/auth/signin`.

## Performance Considerations

This foundation should add indexes for the obvious MVP access paths: per-user monthly records, transactions by batch/date/category, and import batch lookup by user/bank/period. Do not add advanced reporting indexes until summary queries in S-03 reveal concrete access patterns.

## Migration Notes

This is the first expenses-domain migration, so there is no existing finance data to preserve. The implementer should still keep the migration reversible in practice by avoiding destructive operations outside newly created finance tables.

If local Supabase is not already running, use the project's `supabase/config.toml` local setup before applying or resetting migrations. Do not commit `.env`, `.dev.vars`, or service secrets.

## References

- Roadmap item: `context/foundation/roadmap.md:52`
- PRD functional requirements: `context/foundation/prd.md:63`
- PRD privacy requirements: `context/foundation/prd.md:90`
- PRD business logic: `context/foundation/prd.md:95`
- Existing Supabase client: `src/lib/supabase.ts:5`
- Existing auth middleware: `src/middleware.ts:6`
- Change identity: `context/changes/finance-domain-foundation/change.md`
- GitHub issue: `https://github.com/justyna-pietryga/10x-expenses/issues/1`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Domain Migration and RLS

#### Automated

- [x] 1.1 The migration file exists under `supabase/migrations/` and applies with Supabase CLI local reset or migration apply. — 702ffde
- [x] 1.2 SQL inspection confirms RLS is enabled for every finance-domain table. — 702ffde
- [x] 1.3 SQL inspection confirms every finance-domain table has a `user_id` ownership column. — 702ffde
- [x] 1.4 SQL inspection confirms all PRD-owned finance entities are represented: categories, income, import batches, transactions, categorization rules, and monthly summaries. — 702ffde

#### Manual

- [x] 1.5 Review the migration and confirm it contains no UI/API workflow decisions beyond the domain persistence contract. — 702ffde
- [x] 1.6 Review constraints and confirm they support later roadmap prerequisites S-01, S-02, S-03, and S-04. — 702ffde

### Phase 2: Type Contracts and Supabase Client Typing

#### Automated

- [x] 2.1 Supabase type generation succeeds and creates `src/lib/database.types.ts`.
- [x] 2.2 `npx astro check` passes.
- [x] 2.3 Lint verification passes for this phase: either `npm run lint` passes, or any repo-wide failure is documented as pre-existing and the Phase 2 touched files are lint-clean in isolation.
- [x] 2.4 `npm run build` passes.

#### Manual

- [x] 2.5 Review `src/lib/supabase.ts` and confirm auth/session behavior is unchanged.
- [x] 2.6 Review generated types and confirm finance-domain tables appear under the `public` schema.

### Phase 3: Isolation Verification and Handoff Readiness

#### Automated

- [ ] 3.1 RLS verification notes or SQL exist at `context/changes/finance-domain-foundation/rls-verification.md`.
- [ ] 3.2 `npx astro check` passes.
- [ ] 3.3 `npm run lint` passes.
- [ ] 3.4 `npm run build` passes.

#### Manual

- [ ] 3.5 Confirm the verification notes are specific enough for another agent to repeat the RLS checks.
- [ ] 3.6 Confirm GitHub issue `#1` can be updated with the migration/type verification result.
