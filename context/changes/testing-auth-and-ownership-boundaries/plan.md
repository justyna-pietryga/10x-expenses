# Auth and Ownership Boundaries Implementation Plan

## Overview

Implement Phase 3 of the test rollout by adding dedicated integration coverage for finance ownership boundaries across imports, budget, rules, and dashboard summary flows. Under the current anon-key plus RLS architecture, foreign-owned rows are intentionally invisible to the server client, so this rollout proves ownership through hidden-denial `404` and row-failure behavior rather than explicit `403` contracts.

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
- cross-user item and mutation attempts that target real foreign records stay hidden behind the current not-found or row-failure contracts enforced by user-scoped queries plus RLS
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

Because the server client uses the public anon key together with table RLS, foreign-owned rows are not distinguishable from missing rows at the helper boundary. Phase 3 therefore keeps the existing truthful contract: preserve `401` for unauthenticated requests, preserve ordinary `404` or row-failure behavior for hidden or missing records, and prove read isolation through dedicated ownership tests rather than through an impossible explicit-forbidden distinction.

## Critical Implementation Details

### State sequencing

Ownership enforcement must stay at the existing user-scoped query plus RLS boundary. For item-based import, budget, and rule mutations, the implementation must not introduce fake authorization distinctions the runtime cannot prove; instead it should preserve current persistence invariants while making the hidden-denial contract explicit in tests and cookbook guidance.

### Debug and observability

The new assertions must keep the oracle at the user-facing contract boundary: status code, JSON payload, row-level failure payloads, and resulting visible state. Do not pin the tests to query-builder choreography or raw Supabase call counts.

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

## Phase 2: Hidden-Ownership Contract Verification

### Overview

Adjust the dedicated ownership suite and supporting plan artifacts to reflect the real finance contract under the current anon-key plus RLS architecture: cross-user access stays hidden behind existing not-found or row-failure behavior.

### Changes Required:

#### 1. Ownership-aware coverage for item mutations

**File**: `tests/auth-and-ownership-boundaries.test.ts`

**Intent**: Prove the real category ownership contract instead of designing a fake forbidden distinction the runtime cannot support.

**Contract**: Add route and helper coverage showing that foreign-owned category mutations remain hidden behind the same not-found contract as genuinely missing rows, while unauthenticated requests still return `401`.

#### 2. Ownership-aware coverage for import item and batch mutations

**File**: `tests/auth-and-ownership-boundaries.test.ts`

**Intent**: Prove the real import ownership contract across single-row, bulk, and batch boundaries.

**Contract**: Add route and helper coverage showing that foreign-owned import batches and transactions stay hidden behind existing not-found or row-failure behavior, while unauthenticated requests still return `401`.

#### 3. Ownership-aware coverage for rules and summary-adjacent item flows

**File**: `tests/auth-and-ownership-boundaries.test.ts`

**Intent**: Prove the real rule ownership contract, including hidden denial for foreign rule ids and foreign target categories.

**Contract**: Add route and helper coverage showing that foreign rule ids and foreign target categories remain invisible through existing not-found behavior, while preserving normal validation and auth handling.

#### 4. Shared HTTP error-contract alignment

**Files**:
- `src/lib/budget/http.ts`
- `src/lib/imports/http.ts`
- `src/lib/summary/http.ts`

**Intent**: Keep the route JSON error shape stable after the architecture adaptation is made explicit in tests and docs.

**Contract**: Preserve the current structured error envelope (`error`, `field`) while documenting and testing that ownership denial remains hidden behind existing `404` or row-failure behavior.

### Success Criteria:

#### Automated Verification:

- Cross-user category update and archive attempts stay hidden behind existing `404` outcomes.
- Cross-user import transaction and batch operations stay hidden behind existing `404` or row-failure outcomes.
- Cross-user rule update, delete, and foreign target-category scenarios stay hidden behind existing not-found behavior.
- Existing `401` auth-denial and genuine missing-record contracts remain intact.
- `npm test -- tests/auth-and-ownership-boundaries.test.ts` passes.
- `npx astro check` passes after the helper changes.

#### Manual Verification:

- Review the ownership tests and confirm they document hidden denial under the current anon-key plus RLS architecture instead of claiming a forbidden distinction the runtime cannot prove.
- Confirm the route JSON shape remains stable while the ownership semantics stay hidden behind the current not-found or row-failure contract.

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

**Contract**: Update Section `6.3` so contributors know the dedicated suite name, the preferred helper-and-route integration seam, the distinction between `401` and hidden-denial `404` or row-failure outcomes, and the requirement to prove both mutation denial and read isolation where relevant.

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
- Cross-user direct-id budget, import, and rule mutations stay hidden behind existing `404` or row-failure behavior.
- Genuine missing ids still return the same visible contract as hidden foreign-owned ids under the current server-client architecture.
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

No schema migration is expected. This rollout should stay test- and documentation-focused unless a later phase exposes a real ownership bug in the current hidden-denial contract. It must not broaden into a full auth-contract rewrite across unrelated surfaces.

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

- [x] 1.1 `tests/auth-and-ownership-boundaries.test.ts` exists and runs as the dedicated Phase 3 integration suite. — a3b0a9a
- [x] 1.2 The new suite reuses direct helper and direct Astro route seams instead of browser setup or generic end-to-end mocks. — a3b0a9a
- [x] 1.3 The new suite explicitly distinguishes `401`, `403`, and `404` ownership-related outcomes. — a3b0a9a
- [x] 1.4 `npm test -- tests/auth-and-ownership-boundaries.test.ts` passes. — a3b0a9a

#### Manual

- [x] 1.5 Read the suite structure and confirm it is clearly partitioned into budget, imports, rules, and summary ownership sections. — a3b0a9a
- [x] 1.6 Confirm the fixture builders make user ownership explicit instead of hiding it in opaque stub defaults. — a3b0a9a

### Phase 2: Targeted Ownership Contract Changes

#### Automated

- [x] 2.1 Cross-user category update and archive attempts stay hidden behind existing `404` outcomes.
- [x] 2.2 Cross-user import transaction and batch operations stay hidden behind existing `404` or row-failure outcomes.
- [x] 2.3 Cross-user rule update, delete, and foreign target-category scenarios stay hidden behind existing not-found behavior.
- [x] 2.4 Existing `401` auth-denial and genuine `404` missing-record contracts remain intact.
- [x] 2.5 `npm test -- tests/auth-and-ownership-boundaries.test.ts` passes.
- [x] 2.6 `npx astro check` passes after the helper changes.

#### Manual

- [x] 2.7 Review the ownership tests and confirm they document hidden denial under the current anon-key plus RLS architecture instead of claiming a forbidden distinction the runtime cannot prove.
- [x] 2.8 Confirm the route JSON shape remains stable while the ownership semantics stay hidden behind the current not-found or row-failure contract.

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
