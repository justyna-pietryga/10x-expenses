# Budget Setup Implementation Plan

## Overview

Build S-01 from the roadmap: a signed-in user can define monthly income, create custom budget categories, and set percentage-based category limits before importing transactions. This plan turns the existing finance foundation tables into the first real protected finance workflow in the app.

## Current State Analysis

The application has Astro server output, React islands, Supabase SSR auth, a protected `/dashboard` placeholder, and the F-01 finance-domain tables. The data foundation already includes `monthly_incomes` and `budget_categories`, with per-user RLS and constraints for month-start income records, non-blank category names, unique category names per user, and category percentage values between 0 and 100.

There is no budget setup UI, no budget API surface, no test harness, and no archive column for categories. The current middleware protects `/dashboard` only, so a new `/budget` page must be added to the protected route list.

## Desired End State

A logged-in user can open `/budget`, save income for one selected month, add/edit/archive active budget categories, and see validation feedback when category limits exceed 100 percent. The implementation keeps all writes server-side through Astro API routes, stores data under the authenticated user's Supabase identity, and leaves later import, categorization, and summary workflows for S-02/S-03.

### Key Discoveries:

- Roadmap S-01 requires income, custom categories, and percentage-based limits: `context/foundation/roadmap.md:67`.
- PRD FR-007, FR-008, and FR-009 define income, category, and percentage-limit setup as must-have MVP requirements: `context/foundation/prd.md`.
- F-01 already created `monthly_incomes` and `budget_categories`, including per-user RLS and database constraints: `supabase/migrations/20260526103000_finance_domain_foundation.sql`.
- The current app protects routes through `PROTECTED_ROUTES` in `src/middleware.ts`, currently containing only `/dashboard`.
- Existing interactive forms use React islands with client validation and server POST endpoints, as shown by the auth forms and `src/pages/api/auth/*`.
- The repo has no test runner or test files yet, so API/validation tests require adding a minimal test setup.
- Accepted lesson: commits for this work should use the roadmap item in the scope, for example `feat(S-01): budget setup route`.

## What We're NOT Doing

- No bank statement import, parser work, transaction review, or replace-batch behavior.
- No categorization rules or automatic category assignment.
- No monthly summary generation or carry-over accounting.
- No global/default income concept across months.
- No multi-user, family, admin, or shared-budget model.
- No direct browser writes to Supabase for budget setup data.
- No redesign of authentication beyond protecting `/budget`.

## Implementation Approach

Use a small vertical path: extend the schema for category archiving, isolate validation and Supabase mutations in server-side budget modules/API routes, render a dedicated protected `/budget` page, and add focused tests around the validation/API contracts. The page should be operational and compact: income controls, active category list/table, clear total-limit feedback, and simple create/edit/archive actions.

## Critical Implementation Details

### Category Archive Model

The current F-01 schema supports hard delete only. S-01 should add `archived_at timestamptz` to `budget_categories` and treat categories with `archived_at is null` as active. Archive actions update that column instead of deleting rows so future transaction history can remain understandable.

### Total Limit Enforcement

The active category total must not exceed 100 percent. Enforce this server-side for create/update operations using the authenticated user's active categories, excluding the edited category when relevant, and mirror the same rule in the UI for immediate feedback.

## Phase 1: Schema and Type Support

### Overview

Add the category archive field and keep generated database types aligned with the updated Supabase schema.

### Changes Required:

#### 1. Category Archive Migration

**File**: `supabase/migrations/<timestamp>_budget_setup_category_archive.sql`

**Intent**: Add archive support for `budget_categories` without changing the existing RLS ownership model or existing category constraints.

**Contract**: Add nullable `archived_at timestamptz` to `public.budget_categories`. Add an index suitable for loading active categories by user, such as `(user_id, archived_at)`. Existing rows remain active because `archived_at` defaults to null.

#### 2. Generated Database Types

**File**: `src/lib/database.types.ts`

**Intent**: Keep TypeScript table types synchronized with the new `budget_categories.archived_at` column.

**Contract**: Regenerate Supabase types after the migration so `Row`, `Insert`, and `Update` shapes expose `archived_at`.

### Success Criteria:

#### Automated Verification:

- Supabase reset applies the new migration cleanly: `npx supabase db reset`.
- Generated types include `budget_categories.archived_at`.
- Type checking passes: `npx astro check`.

#### Manual Verification:

- Confirm existing `budget_categories` records remain active when `archived_at` is null.
- Confirm the migration does not weaken existing RLS policies.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Budget Domain Validation and API Routes

### Overview

Create the server-side contracts that load and mutate budget setup data for the authenticated user.

### Changes Required:

#### 1. Budget Validation Helpers

**File**: `src/lib/budget/validation.ts`

**Intent**: Centralize budget setup validation so API routes and tests share one ruleset.

**Contract**: Export validation helpers for month strings, income amount, estimated flag, category name, category percentage limit, and active total percentage limit. Validation must reject blank category names, invalid months, negative income, non-finite values, percentages outside `0..100`, and active totals above `100`.

#### 2. Budget Data Access Helpers

**File**: `src/lib/budget/data.ts`

**Intent**: Keep Supabase queries out of UI components and API route boilerplate.

**Contract**: Export functions to list active categories, load one month of income, upsert monthly income, create category, update category, and archive category for a given `userId`. All category reads for setup must filter `archived_at is null`.

#### 3. Income API Route

**File**: `src/pages/api/budget/income.ts`

**Intent**: Provide a server-side endpoint for saving one month of income.

**Contract**: `POST` accepts form data or JSON containing `month`, `amount`, and `is_estimated`. It requires `Astro.locals.user`, validates input, upserts `monthly_incomes` by `(user_id, month)`, and returns a redirect or JSON response consistent with the calling UI contract chosen during implementation.

#### 4. Category API Routes

**File**: `src/pages/api/budget/categories/index.ts`

**Intent**: Provide server-side category creation for the authenticated user.

**Contract**: `POST` accepts `name` and `percentage_limit`, validates them, verifies active total percentage would stay at or below 100, and inserts a category for `Astro.locals.user.id`.

**File**: `src/pages/api/budget/categories/[id].ts`

**Intent**: Provide server-side category update and archive actions.

**Contract**: `PUT` updates `name` and `percentage_limit` for an active category owned by the user and enforces total percentage at or below 100. `DELETE` archives the category by setting `archived_at` and must not physically delete the row.

### Success Criteria:

#### Automated Verification:

- Validation tests pass for income, category names, percentage values, and total-limit enforcement.
- API/data helper tests pass for unauthenticated rejection and authenticated create/update/archive contracts.
- Linting passes: `npm run lint`.
- Type checking passes: `npx astro check`.

#### Manual Verification:

- Unauthenticated requests to budget API routes do not write data.
- Duplicate category names surface a clear validation or persistence error.
- Updating one category cannot push the active total above 100 percent.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Protected Budget Page and UI

### Overview

Add the protected `/budget` page and interactive budget setup controls.

### Changes Required:

#### 1. Route Protection

**File**: `src/middleware.ts`

**Intent**: Protect the budget setup route with the existing auth middleware.

**Contract**: Add `/budget` to `PROTECTED_ROUTES`. Unauthenticated users visiting `/budget` must redirect to `/auth/signin`.

#### 2. Budget Page

**File**: `src/pages/budget.astro`

**Intent**: Render the signed-in user's budget setup workspace.

**Contract**: Load `Astro.locals.user`, fetch the selected month income and active categories through the server-side helpers, and render a compact operational page with an income section and category setup section. Use React islands only for interactive controls.

#### 3. Budget Setup Components

**File**: `src/components/budget/BudgetSetup.tsx`

**Intent**: Provide the main interactive budget setup island.

**Contract**: Accept initial income, active categories, and selected month as props. Coordinate child forms/lists, show the current active category total, and prevent client-side submission when the total would exceed 100 percent.

**File**: `src/components/budget/IncomeForm.tsx`

**Intent**: Let the user save one month of income and mark it as estimated.

**Contract**: Submit to the income API route with `month`, `amount`, and `is_estimated`; show inline client validation and server errors.

**File**: `src/components/budget/CategoryManager.tsx`

**Intent**: Let the user create, edit, and archive custom categories with percentage limits.

**Contract**: Render active categories, inline edit controls, archive actions, and total-limit feedback. Archive actions must call the category delete API route but label the user-facing action as removing or archiving the category from the active budget.

### Success Criteria:

#### Automated Verification:

- `/budget` route type-checks with the new data-loading code.
- UI components pass linting and TypeScript checks.
- Build passes: `npm run build`.

#### Manual Verification:

- Visiting `/budget` while signed out redirects to `/auth/signin`.
- A signed-in user can save income for a selected month.
- A signed-in user can create, edit, and archive categories.
- The UI blocks or clearly rejects active category totals above 100 percent.
- Archived categories disappear from the active setup view.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 4: Tests, Documentation, and Roadmap Sync

### Overview

Make S-01 verifiable and keep roadmap/backlog status aligned with the new plan.

### Changes Required:

#### 1. Test Harness

**File**: `package.json`

**Intent**: Add the smallest test runner setup needed for validation and route/helper tests.

**Contract**: Add a `test` script and necessary dev dependency/config for the chosen runner. Prefer Vitest unless the repository already has another test runner by implementation time.

#### 2. Focused Tests

**File**: `tests/budget-setup.test.ts` or co-located `*.test.ts` files

**Intent**: Cover the risky S-01 contracts without building a full browser-test stack.

**Contract**: Test validation helpers and data/API behavior around auth, active category filtering, archive semantics, duplicate/blank names, percentage bounds, and total-limit enforcement.

#### 3. Roadmap Status

**File**: `context/foundation/roadmap.md`

**Intent**: Keep the roadmap aligned with S-01 planning state.

**Contract**: S-01 should remain `ready` before implementation starts. Do not mark it `done` until the change is implemented, reviewed, and archived through the normal workflow.

### Success Criteria:

#### Automated Verification:

- Tests pass: `npm test`.
- Linting passes: `npm run lint`.
- Astro check passes: `npx astro check`.
- Production build passes: `npm run build`.

#### Manual Verification:

- Review the plan brief and full plan for phase clarity before starting `/10x-implement budget-setup phase 1`.
- Confirm S-02, S-03, and S-04 remain blocked until their prerequisites complete.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before archiving or marking the roadmap item done.

---

## Testing Strategy

### Unit Tests:

- Validate month strings and month-start normalization expectations.
- Validate income amount parsing and rejection of negative or non-finite values.
- Validate category name trimming and blank-name rejection.
- Validate percentage bounds for individual categories.
- Validate active category total calculation, including excluding archived categories and excluding the edited category during update.

### Integration Tests:

- Authenticated income upsert writes exactly one row for `(user_id, month)`.
- Authenticated category create/update/archive operations only affect the signed-in user's records.
- Unauthenticated API calls do not write budget data.
- Archived categories are excluded from setup reads.

### Manual Testing Steps:

1. Sign out and verify `/budget` redirects to `/auth/signin`.
2. Sign in and open `/budget`.
3. Save income for the current month with `is_estimated` on and off.
4. Add categories whose total is below 100 percent.
5. Try to add or edit a category so the active total exceeds 100 percent and verify it is blocked.
6. Edit a category name and percentage limit.
7. Archive a category and verify it disappears from the active setup view.

## Performance Considerations

S-01 is expected to handle small personal budgets, not large datasets. Load active categories and one selected income month in a single page request; avoid premature caching. The active total calculation can be done in application code because the number of categories per user should be small.

## Migration Notes

The category archive migration is additive and should be low risk. Existing categories remain active because `archived_at` is nullable and defaults to null. Rollback would remove archive support and any archive timestamps, so avoid relying on archive data until the migration has landed in all target environments.

## References

- Roadmap item: `context/foundation/roadmap.md`
- Product requirements: `context/foundation/prd.md`
- Accepted lessons: `context/foundation/lessons.md`
- Finance foundation migration: `supabase/migrations/20260526103000_finance_domain_foundation.sql`
- Supabase client: `src/lib/supabase.ts`
- Auth middleware: `src/middleware.ts`
- Existing auth API pattern: `src/pages/api/auth/signin.ts`
- Existing React form pattern: `src/components/auth/SignInForm.tsx`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` - <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Schema and Type Support

#### Automated

- [x] 1.1 Supabase reset applies the new migration cleanly: `npx supabase db reset` — 5680b5d
- [x] 1.2 Generated types include `budget_categories.archived_at` — 5680b5d
- [x] 1.3 Type checking passes: `npx astro check` — 5680b5d

#### Manual

- [x] 1.4 Confirm existing `budget_categories` records remain active when `archived_at` is null — 5680b5d
- [x] 1.5 Confirm the migration does not weaken existing RLS policies — 5680b5d

### Phase 2: Budget Domain Validation and API Routes

#### Automated

- [x] 2.1 Validation tests pass for income, category names, percentage values, and total-limit enforcement — 5c1d008
- [x] 2.2 API/data helper tests pass for unauthenticated rejection and authenticated create/update/archive contracts — 5c1d008
- [x] 2.3 Linting passes: `npm run lint` — 5c1d008
- [x] 2.4 Type checking passes: `npx astro check` — 5c1d008

#### Manual

- [x] 2.5 Unauthenticated requests to budget API routes do not write data — 5c1d008
- [x] 2.6 Duplicate category names surface a clear validation or persistence error — 5c1d008
- [x] 2.7 Updating one category cannot push the active total above 100 percent — 5c1d008

### Phase 3: Protected Budget Page and UI

#### Automated

- [x] 3.1 `/budget` route type-checks with the new data-loading code — 0a714e8
- [x] 3.2 UI components pass linting and TypeScript checks — 0a714e8
- [x] 3.3 Build passes: `npm run build` — 0a714e8

#### Manual

- [x] 3.4 Visiting `/budget` while signed out redirects to `/auth/signin` — 0a714e8
- [x] 3.5 A signed-in user can save income for a selected month — 0a714e8
- [x] 3.6 A signed-in user can create, edit, and archive categories — 0a714e8
- [x] 3.7 The UI blocks or clearly rejects active category totals above 100 percent — 0a714e8
- [x] 3.8 Archived categories disappear from the active setup view — 0a714e8

### Phase 4: Tests, Documentation, and Roadmap Sync

#### Automated

- [x] 4.1 Tests pass: `npm test` — e083bcc
- [x] 4.2 Linting passes: `npm run lint` — e083bcc
- [x] 4.3 Astro check passes: `npx astro check` — e083bcc
- [x] 4.4 Production build passes: `npm run build` — e083bcc

#### Manual

- [x] 4.5 Review the plan brief and full plan for phase clarity before starting `/10x-implement budget-setup phase 1` — e083bcc
- [x] 4.6 Confirm S-02, S-03, and S-04 remain blocked until their prerequisites complete — e083bcc
