# Auth and Ownership Boundaries Implementation Plan

## Overview

Implement Phase 3 of the test rollout by adding dedicated integration coverage for finance ownership boundaries across imports, budget, rules, and dashboard summary flows. This phase also allows narrowly scoped production changes so cross-user access fails with explicit `403` contracts instead of the current mostly-implicit `404` behavior that falls out of `user_id` filtering.

## Current State Analysis

The codebase already has a coherent finance ownership model. Route helpers require authentication and create a scoped Supabase client, while most domain helpers further constrain reads and writes with `user_id` filters. The database layer reinforces that shape with composite `(id, user_id)` foreign keys and per-table RLS policies.

What is missing is a single rollout artifact that proves those ownership guarantees at the application contract level. Existing tests cover unauthenticated failures and some same-user not-found scenarios, but they do not systematically prove that one authenticated user cannot read or mutate another user's finance records across the full finance surface.

### Key Discoveries:

- All finance API surfaces already centralize auth checks through helper wrappers, which return `401` before any data access when `context.locals.user` is missing: `src/lib/budget/http.ts:11`, `src/lib/imports/http.ts:11`, `src/lib/summary/http.ts:14`
- Budget helpers scope writes and reads with `user_id`, but current tests focus on unauthenticated denial rather than cross-user denial: `src/lib/budget/data.ts:26`, `src/lib/budget/data.ts:54`, `src/lib/budget/data.ts:101`, `src/lib/budget/data.ts:125`, `tests/budget-setup.test.ts:190`
- Import helpers already gate batch, transaction, and completion mutations by `user_id`, making imports the broadest existing ownership seam to formalize in tests: `src/lib/imports/data.ts:51`, `src/lib/imports/data.ts:261`, `src/lib/imports/data.ts:304`, `src/lib/imports/data.ts:367`, `src/lib/imports/data.ts:413`
- Summary and rule flows share the same user-scoped pattern, but there is no explicit proof yet that another user's batches, categories, incomes, summaries, or rules cannot influence the authenticated user's dashboard payload: `src/lib/summary/data.ts:121`, `src/lib/summary/data.ts:185`, `src/lib/rules/data.ts:81`, `src/lib/rules/data.ts:97`, `src/lib/rules/data.ts:120`, `src/lib/rules/data.ts:143`
- The schema and policies are ownership-oriented by design, so Phase 3 should assert app-level contracts rather than duplicate RLS internals: `supabase/migrations/20260526103000_finance_domain_foundation.sql:58`, `supabase/migrations/20260526103000_finance_domain_foundation.sql:73`, `supabase/migrations/20260526103000_finance_domain_foundation.sql:107`, `supabase/migrations/20260526103000_finance_domain_foundation.sql:114`

## Desired End State

After this change:

- a dedicated Phase 3 integration suite proves authenticated users can only read or mutate their own finance data across imports, budget, rules, and summary flows
- cross-user item and mutation attempts that target real foreign records fail with explicit `403` contracts where this phase chooses to make ownership denial visible
- summary reads are proven to exclude other users' categories, incomes, batches, transactions, summaries, and rules from the authenticated user's result
- `context/foundation/test-plan.md` contains concrete cookbook guidance for adding future ownership-boundary tests at the correct seam

Verification is complete when the dedicated suite passes, the normal repo quality gates still pass, and the rollout artifact makes the ownership-testing pattern reusable for later finance endpoints.

## What We're NOT Doing

- No browser or Playwright expansion for this phase
- No broad rewrite of the auth model, session model, or middleware redirect behavior
- No attempt to re-test Supabase RLS itself as an external platform concern
- No conversion of every not-found case in the finance domain to `403`; only targeted cross-user ownership denials that this phase explicitly owns
- No summary math, review-persistence, or import-integrity regression work already covered by Phases 1 and 2
- No snapshot-heavy UI coverage
- No changes under `context/archive/`

## Implementation Approach

Create one dedicated root integration suite for Phase 3 and keep the rollout at the repo's existing cheapest useful seam: direct domain-helper coverage plus direct Astro route invocation with hand-built Supabase stubs. The suite should model two authenticated users and assert both read isolation and mutation denial at business-contract boundaries.

Because the chosen contract is explicit `403` for cross-user access, Phase 3 is allowed to make targeted production changes in the helper and route layers where current `user_id` filtering silently collapses ownership denial into not-found behavior. Those changes should stay narrow: preserve `401` for unauthenticated requests, preserve ordinary `404` for genuinely missing records, and introduce `403` only where the code can truthfully distinguish "record exists but belongs to someone else."

## Critical Implementation Details

### State sequencing

Ownership detection must happen before destructive mutations report success. For item-based import, budget, and rule mutations, the helper flow may need an existence-or-ownership preflight before the final scoped update or delete. The plan should preserve current persistence invariants while making the denial contract explicit.

### Debug and observability

The new assertions must keep the oracle at the user-facing contract boundary: status code, JSON payload, and resulting visible state. Do not pin the tests to query-builder choreography or raw Supabase call counts.

## Phase 1: Dedicated Phase 3 Ownership Test Harness

### Overview

Introduce a dedicated integration suite for finance ownership boundaries so Phase 3 stays auditable and does not blur into the existing Phase 1 and Phase 2 suites.

### Changes Required:

#### 1. Dedicated Phase 3 integration suite

**File**: `tests/auth-and-ownership-boundaries.test.ts`

**Intent**: Create one root suite that owns cross-user finance access coverage across imports, budget, rules, and summary, instead of scattering Phase 3 scenarios across older rollout files.

**Contract**: Add a root-level Vitest file that groups ownership cases by finance area and reuses the existing direct-helper plus direct-route test style. The suite must make the authenticated-user identity explicit in each scenario and keep a clean distinction between unauthenticated `401`, cross-user `403`, and genuine missing-record `404`.

#### 2. Shared multi-user fixture builders

**File**: `tests/auth-and-ownership-boundaries.test.ts`

**Intent**: Keep the new suite maintainable by centralizing user A and user B records, route contexts, and per-table stub behavior.

**Contract**: The suite should expose helper builders for categories, monthly incomes, import batches, transactions, summaries, rules, and authenticated route contexts for at least two users. The stub layer must be able to represent "owned by current user," "owned by another user," and "missing entirely" without copy-pasted inline setup.

### Success Criteria:

#### Automated Verification:

- `tests/auth-and-ownership-boundaries.test.ts` exists and runs as the dedicated Phase 3 integration suite.
- The new suite reuses direct helper and direct Astro route seams instead of browser setup or generic end-to-end mocks.
- The new suite explicitly distinguishes `401`, `403`, and `404` ownership-related outcomes.
- `npm test -- tests/auth-and-ownership-boundaries.test.ts` passes.

#### Manual Verification:

- Read the suite structure and confirm it is clearly partitioned into budget, imports, rules, and summary ownership sections.
- Confirm the fixture builders make user ownership explicit instead of hiding it in opaque stub defaults.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Targeted Ownership Contract Changes

### Overview

Adjust the helper and route contract only where needed so cross-user access can fail with explicit `403` outcomes instead of collapsing into generic not-found behavior.

### Changes Required:

#### 1. Ownership-aware error mapping for item mutations

**File**: `src/lib/budget/data.ts`

**Intent**: Make category update and archive operations capable of distinguishing "not yours" from "does not exist" when Phase 3 targets a known foreign record.

**Contract**: Update the budget item-mutation helpers so cross-user category operations can surface explicit forbidden errors without changing the create/list/income contracts unnecessarily. Preserve genuine missing-category behavior as `404`.

#### 2. Ownership-aware error mapping for import item and batch mutations

**File**: `src/lib/imports/data.ts`

**Intent**: Make direct import-item and import-batch ownership denials explicit for the Phase 3 surfaces that take concrete ids.

**Contract**: Update the relevant import helpers for single transaction update, bulk transaction updates, batch review completion, and batch-review loading so a foreign owned transaction or batch can produce a stable `403` contract. Keep invalid payload, unauthenticated, and genuinely missing-record behavior unchanged.

#### 3. Ownership-aware error mapping for rules and summary-adjacent item flows

**File**: `src/lib/rules/data.ts`

**Intent**: Make rule update and delete ownership denial explicit, and keep target-category ownership checks truthful when a user points a rule at another user's category.

**Contract**: Update the rule helper layer so foreign rule ids and foreign target categories can return stable forbidden outcomes where appropriate, while preserving ordinary validation and not-found behavior.

#### 4. Shared HTTP error-contract alignment

**Files**:
- `src/lib/budget/http.ts`
- `src/lib/imports/http.ts`
- `src/lib/summary/http.ts`

**Intent**: Keep the route JSON error shape stable after the new ownership distinctions are introduced.

**Contract**: Preserve the current structured error envelope (`error`, `field`) while allowing the new helper-level ownership errors to flow through with `403` status where Phase 3 adopts that contract.

### Success Criteria:

#### Automated Verification:

- Cross-user category update and archive attempts can surface explicit `403` outcomes.
- Cross-user import transaction and batch operations can surface explicit `403` outcomes.
- Cross-user rule update, delete, and foreign target-category scenarios can surface explicit `403` outcomes.
- Existing `401` auth-denial and genuine `404` missing-record contracts remain intact.
- `npm test -- tests/auth-and-ownership-boundaries.test.ts` passes.
- `npx astro check` passes after the helper changes.

#### Manual Verification:

- Review the helper changes and confirm `403` is introduced only for deliberate cross-user ownership denials, not for every lookup miss.
- Confirm the route JSON shape remains stable while the status code semantics become more explicit.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Budget and Import Ownership Coverage

### Overview

Prove the two broadest finance surfaces enforce ownership across both reads and writes, including direct-id mutation paths.

### Changes Required:

#### 1. Budget ownership coverage

**File**: `tests/auth-and-ownership-boundaries.test.ts`

**Intent**: Cover the budget area end-to-end enough that the full finance-surface claim is credible.

**Contract**: Add helper and route scenarios for active-category reads, monthly-income reads or upserts, category updates, and category archives. The assertions must prove user A cannot read or mutate user B's budget data, while user A can still operate on their own data through unchanged contracts.

#### 2. Import lifecycle ownership coverage

**File**: `tests/auth-and-ownership-boundaries.test.ts`

**Intent**: Cover the full import lifecycle because it contains the densest set of direct-id ownership risks.

**Contract**: Add helper and route scenarios for preview/commit batch lookup behavior, batch review loading, single transaction category update, bulk category update, and review completion. The suite must prove that user A cannot operate on or complete user B's batch or transaction rows even when valid ids are supplied.

#### 3. Existing-suite regression alignment

**Files**:
- `tests/budget-setup.test.ts`
- `tests/import-review.test.ts`

**Intent**: Keep prior auth coverage truthful and non-conflicting after the new ownership distinctions land.

**Contract**: Adjust only the minimal existing assertions that would otherwise conflict with the new explicit-ownership contracts. Preserve the earlier rollout intent rather than migrating broad Phase 3 coverage into those files.

### Success Criteria:

#### Automated Verification:

- The Phase 3 suite proves budget reads and writes remain scoped to the authenticated user.
- The Phase 3 suite proves the full import lifecycle denies cross-user access on both read and write paths.
- Existing budget and import suites still pass after any minimal contract-alignment updates.
- `npm test -- tests/auth-and-ownership-boundaries.test.ts tests/budget-setup.test.ts tests/import-review.test.ts` passes.

#### Manual Verification:

- Read the budget ownership test names and confirm they cover both read and write boundaries rather than only auth checks.
- Read the import ownership test names and confirm they cover batch-level and row-level denial paths separately.
- Confirm the older Phase 1 and Phase 2 suites remain focused on their original risks instead of absorbing broad ownership work.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 4: Rules and Summary Read-Isolation Coverage

### Overview

Finish the ownership rollout by proving rules cannot be managed across users and that summary payloads are unaffected by another user's finance state.

### Changes Required:

#### 1. Rule ownership coverage

**File**: `tests/auth-and-ownership-boundaries.test.ts`

**Intent**: Cover both rule-record ownership and target-category ownership in the summary-adjacent rules surface.

**Contract**: Add helper and route scenarios for listing rules, creating rules against owned categories, rejecting foreign target categories, and denying cross-user update or delete of existing rules. The tests should keep rule management scoped to the authenticated user's dashboard context.

#### 2. Summary read-isolation coverage

**File**: `tests/auth-and-ownership-boundaries.test.ts`

**Intent**: Prove ownership on the read side, where leakage is more subtle than direct mutation.

**Contract**: Add helper and route scenarios showing that `loadDashboardSummary` and `/api/dashboard/summary` only use the authenticated user's categories, monthly incomes, batches, transactions, and saved summaries. The test data must include another user's plausible finance records and prove they do not influence available months, selected month, totals, category rows, warning batches, or cached summary identity.

#### 3. Existing summary-suite regression alignment

**Files**:
- `tests/monthly-summary-and-rules.test.ts`
- `tests/review-persistence-and-rule-application.test.ts`

**Intent**: Keep prior rule and summary coverage aligned with the new ownership contract without blurring rollout boundaries.

**Contract**: Apply only targeted assertion adjustments if the explicit-ownership behavior changes an existing expectation. Do not migrate Phase 3 ownership scenarios into these older suites.

### Success Criteria:

#### Automated Verification:

- The Phase 3 suite proves rules cannot be created against foreign categories or mutated across users.
- The Phase 3 suite proves summary outputs ignore another user's finance records entirely.
- Existing rule and summary suites still pass after any targeted contract-alignment updates.
- `npm test -- tests/auth-and-ownership-boundaries.test.ts tests/monthly-summary-and-rules.test.ts tests/review-persistence-and-rule-application.test.ts` passes.
- `npx astro check` passes.

#### Manual Verification:

- Read the rule ownership tests and confirm they separate foreign rule-id denial from foreign target-category denial.
- Confirm the summary tests prove data isolation, not just route authentication.
- Confirm the assertions describe user-visible outcomes like months, totals, and rule lists rather than internal query choreography.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 5: Cookbook and Rollout Alignment

### Overview

Backfill the test rollout artifact with concrete Phase 3 ownership guidance and mark the rollout phase as implemented when the work lands.

### Changes Required:

#### 1. Phase 3 cookbook entry

**File**: `context/foundation/test-plan.md`

**Intent**: Replace the current Phase 3 placeholder with reusable ownership-testing guidance for future finance endpoints.

**Contract**: Update Section `6.3` so contributors know the dedicated suite name, the preferred helper-and-route integration seam, the distinction between `401`, `403`, and `404`, and the requirement to prove both mutation denial and read isolation where relevant.

#### 2. Rollout status alignment

**File**: `context/foundation/test-plan.md`

**Intent**: Keep the rollout table and notes truthful once Phase 3 implementation is complete.

**Contract**: Update the Phase 3 row and any related notes so the artifact records the dedicated ownership suite and the explicit-forbidden decision instead of leaving Phase 3 as TBD.

### Success Criteria:

#### Automated Verification:

- `context/foundation/test-plan.md` contains concrete Phase 3 cookbook guidance for auth and ownership integration checks.
- The rollout table reflects Phase 3 as implemented with the new change folder.
- `npm run lint` passes.
- `npx astro check` passes.
- `npm run build` passes.

#### Manual Verification:

- Read the updated Phase 3 cookbook entry and confirm a contributor could add a new ownership-boundary test without rediscovering the seam or status-code rules.
- Confirm the cookbook language stays pattern-oriented and does not degrade into a changelog of individual assertions.
- Confirm the rollout remains bounded to finance ownership checks and does not absorb unrelated auth UX or middleware work.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

## Testing Strategy

### Unit Tests:

- Keep unit-style coverage minimal and limited to any new error-mapping helpers introduced to distinguish `403` from `404`.
- Avoid implementation-mirror assertions around query-builder sequencing or Supabase method call counts.

### Integration Tests:

- Unauthenticated finance routes still return `401` before touching data.
- Cross-user direct-id budget, import, and rule mutations return explicit `403` where Phase 3 adopts that contract.
- Genuine missing ids still return `404` where no owned or foreign record exists.
- Summary reads remain fully isolated from another user's categories, incomes, batches, transactions, rules, and cached summaries.
- Older finance suites still pass after the ownership contract is introduced.

### Manual Testing Steps:

1. Read the dedicated Phase 3 suite and confirm the scenarios are grouped by finance area rather than by helper implementation.
2. Inspect the cross-user denial cases and confirm they distinguish unauthenticated, forbidden, and genuinely missing outcomes cleanly.
3. Read the summary isolation assertions and confirm they prove another user's data cannot influence months, totals, warnings, or rule-driven outputs.
4. Read the updated Phase 3 cookbook entry in `context/foundation/test-plan.md` and confirm it points future work to the dedicated suite and correct status-code expectations.

## Performance Considerations

This rollout should stay within the repo's current lightweight testing model. One dedicated suite increases logical clarity, not infrastructure cost. Reuse in-memory multi-user Supabase stubs and direct route invocation; do not introduce browser bootstrapping, external databases, or platform-level RLS harnesses for this phase.

## Migration Notes

No schema migration is expected. Production changes are limited to targeted helper and route contract updates that allow truthful `403` ownership denials at selected finance boundaries. The rollout must not broaden into a full auth-contract rewrite across unrelated surfaces.

## References

- Rollout source: `context/foundation/test-plan.md`
- Budget auth and data helpers: `src/lib/budget/http.ts:11`, `src/lib/budget/data.ts:26`
- Import auth and data helpers: `src/lib/imports/http.ts:11`, `src/lib/imports/data.ts:51`, `src/lib/imports/data.ts:304`
- Summary auth and aggregation helpers: `src/lib/summary/http.ts:14`, `src/lib/summary/data.ts:121`, `src/lib/summary/data.ts:185`
- Rule ownership helpers: `src/lib/rules/data.ts:67`, `src/lib/rules/data.ts:81`, `src/lib/rules/data.ts:120`
- Existing auth baseline: `tests/budget-setup.test.ts:190`
- Ownership-oriented schema and RLS design: `supabase/migrations/20260526103000_finance_domain_foundation.sql:58`, `supabase/migrations/20260526103000_finance_domain_foundation.sql:107`, `supabase/migrations/20260526103000_finance_domain_foundation.sql:114`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Dedicated Phase 3 Ownership Test Harness

#### Automated

- [x] 1.1 `tests/auth-and-ownership-boundaries.test.ts` exists and runs as the dedicated Phase 3 integration suite.
- [x] 1.2 The new suite reuses direct helper and direct Astro route seams instead of browser setup or generic end-to-end mocks.
- [x] 1.3 The new suite explicitly distinguishes `401`, `403`, and `404` ownership-related outcomes.
- [x] 1.4 `npm test -- tests/auth-and-ownership-boundaries.test.ts` passes.

#### Manual

- [x] 1.5 Read the suite structure and confirm it is clearly partitioned into budget, imports, rules, and summary ownership sections.
- [x] 1.6 Confirm the fixture builders make user ownership explicit instead of hiding it in opaque stub defaults.

### Phase 2: Targeted Ownership Contract Changes

#### Automated

- [ ] 2.1 Cross-user category update and archive attempts can surface explicit `403` outcomes.
- [ ] 2.2 Cross-user import transaction and batch operations can surface explicit `403` outcomes.
- [ ] 2.3 Cross-user rule update, delete, and foreign target-category scenarios can surface explicit `403` outcomes.
- [ ] 2.4 Existing `401` auth-denial and genuine `404` missing-record contracts remain intact.
- [ ] 2.5 `npm test -- tests/auth-and-ownership-boundaries.test.ts` passes.
- [ ] 2.6 `npx astro check` passes after the helper changes.

#### Manual

- [ ] 2.7 Review the helper changes and confirm `403` is introduced only for deliberate cross-user ownership denials, not for every lookup miss.
- [ ] 2.8 Confirm the route JSON shape remains stable while the status code semantics become more explicit.

### Phase 3: Budget and Import Ownership Coverage

#### Automated

- [ ] 3.1 The Phase 3 suite proves budget reads and writes remain scoped to the authenticated user.
- [ ] 3.2 The Phase 3 suite proves the full import lifecycle denies cross-user access on both read and write paths.
- [ ] 3.3 Existing budget and import suites still pass after any minimal contract-alignment updates.
- [ ] 3.4 `npm test -- tests/auth-and-ownership-boundaries.test.ts tests/budget-setup.test.ts tests/import-review.test.ts` passes.

#### Manual

- [ ] 3.5 Read the budget ownership test names and confirm they cover both read and write boundaries rather than only auth checks.
- [ ] 3.6 Read the import ownership test names and confirm they cover batch-level and row-level denial paths separately.
- [ ] 3.7 Confirm the older Phase 1 and Phase 2 suites remain focused on their original risks instead of absorbing broad ownership work.

### Phase 4: Rules and Summary Read-Isolation Coverage

#### Automated

- [ ] 4.1 The Phase 3 suite proves rules cannot be created against foreign categories or mutated across users.
- [ ] 4.2 The Phase 3 suite proves summary outputs ignore another user's finance records entirely.
- [ ] 4.3 Existing rule and summary suites still pass after any targeted contract-alignment updates.
- [ ] 4.4 `npm test -- tests/auth-and-ownership-boundaries.test.ts tests/monthly-summary-and-rules.test.ts tests/review-persistence-and-rule-application.test.ts` passes.
- [ ] 4.5 `npx astro check` passes.

#### Manual

- [ ] 4.6 Read the rule ownership tests and confirm they separate foreign rule-id denial from foreign target-category denial.
- [ ] 4.7 Confirm the summary tests prove data isolation, not just route authentication.
- [ ] 4.8 Confirm the assertions describe user-visible outcomes like months, totals, and rule lists rather than internal query choreography.

### Phase 5: Cookbook and Rollout Alignment

#### Automated

- [ ] 5.1 `context/foundation/test-plan.md` contains concrete Phase 3 cookbook guidance for auth and ownership integration checks.
- [ ] 5.2 The rollout table reflects Phase 3 as implemented with the new change folder.
- [ ] 5.3 `npm run lint` passes.
- [ ] 5.4 `npx astro check` passes.
- [ ] 5.5 `npm run build` passes.

#### Manual

- [ ] 5.6 Read the updated Phase 3 cookbook entry and confirm a contributor could add a new ownership-boundary test without rediscovering the seam or status-code rules.
- [ ] 5.7 Confirm the cookbook language stays pattern-oriented and does not degrade into a changelog of individual assertions.
- [ ] 5.8 Confirm the rollout remains bounded to finance ownership checks and does not absorb unrelated auth UX or middleware work.
