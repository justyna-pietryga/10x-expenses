# Testing Critical Import and Summary Integrity Implementation Plan

## Overview

Harden Phase 1 of the test rollout by extending the existing finance-domain Vitest suites to cover the highest-signal gaps in import replacement integrity, summary trust-edge behavior, and user-facing invalid request boundaries. This plan includes the minimal production change needed to make the same-month replacement flow safe under failure, because the current uncovered risk is a real integrity flaw rather than a missing assertion only.

## Current State Analysis

The repo already has the right testing seam for this rollout: root-level Vitest suites call domain helpers directly, invoke Astro API routes as integration boundaries, and use hand-built Supabase stubs instead of browser automation. `tests/import-review.test.ts` already covers happy-path import commit, replace confirmation, review-pending state, and bulk category mutations, while `tests/monthly-summary-and-rules.test.ts` already covers the core summary trust split between reviewed categorized, reviewed uncategorized, and incomplete-review spend.

What is still missing is targeted protection for the three highest-priority risks from `context/foundation/test-plan.md` Phase 1:

- same bank/month replacement can leave a corrupted intermediate state if persistence fails after destructive steps begin
- summary trust behavior is not fully covered at the default-month and pending-only edges
- request-boundary invalid inputs are validated in helpers but not consistently covered at the user-facing route layer

### Key Discoveries:

- `commitImportBatch` deletes prior transactions and updates the batch before inserting replacement rows, so the current flow is not atomic from the caller's point of view: `context/changes/testing-critical-import-and-summary-integrity/research.md`, `src/lib/imports/data.ts:99`
- Existing import tests already prove confirmation and review-pending happy paths, so Phase 1 should add failure-mode coverage rather than duplicate current assertions: `tests/import-review.test.ts:562`
- `loadDashboardSummary` already enforces the trust split through `review_completed_at`, and existing tests already prove the main bucket math: `src/lib/summary/data.ts:185`, `tests/monthly-summary-and-rules.test.ts:342`
- The default selected month currently prefers the latest imported month whether it is pending or completed, which should be preserved and explicitly tested: `src/lib/summary/data.ts:168`
- Import and summary HTTP helpers already centralize content-type and request parsing, making route-level invalid-boundary tests cheap and high-signal: `src/lib/imports/http.ts:28`, `src/lib/summary/http.ts:30`

## Desired End State

After this change, the finance-domain suites should protect the highest-risk behaviors from Phase 1 of the rollout:

- same-month import replacement either leaves one truthful month state or fails without destructive partial replacement
- summary behavior is covered at the default-month and pending-review edges while preserving the current dashboard contract
- user-facing import and summary routes reject malformed boundary inputs with truthful, stable errors

The desired end state is both behavioral and operational: `npm test` should catch these regressions using the existing helper-and-route harness, and `context/foundation/test-plan.md` Phase 1 should be able to point future contributors to concrete patterns instead of placeholders.

## What We're NOT Doing

- No browser or Playwright coverage for this phase
- No broad rewrite of the finance test harness
- No generic negative-case expansion across every import or summary route
- No review workflow or rule-application coverage from rollout Phase 2
- No ownership/auth boundary expansion from rollout Phase 3
- No testing of Supabase internals or generated type layers
- No snapshot-heavy UI regression coverage

## Implementation Approach

Keep the rollout at the existing integration seam. Extend `tests/import-review.test.ts` for import commit and route-boundary cases, and extend `tests/monthly-summary-and-rules.test.ts` for summary selection and trust-edge cases. Add one minimal production change to the import replacement flow so the new integrity test can end green: replacement must not destructively delete the old month state before the new batch state is safely persisted.

The plan treats the replace-path gap as a test-first defect, not a documentation-only finding. Summary and invalid-input coverage remain test-only unless the new tests reveal an actual contract mismatch.

## Critical Implementation Details

### State sequencing

The load-bearing production risk is ordering inside same-month replacement. The obvious sequence in the current code is wrong for integrity: destructive delete happens before replacement rows are safely established. The implementation phase must change sequencing or persistence strategy so the new tests can assert a truthful month state after failure without coupling to internal call order.

### Debug and observability

The new tests must keep their oracle at the business boundary, not the mocked query-chain boundary. Assertions should describe visible outcomes like "old month state preserved on failed replacement" or "pending month remains incomplete-only" rather than pinning specific internal helper call counts.

## Phase 1: Import Replacement Integrity

### Overview

Add high-signal coverage for same-month replacement failure behavior and make the replacement path safe enough for the new tests to end green.

### Changes Required:

#### 1. Import commit helper coverage

**File**: `tests/import-review.test.ts`

**Intent**: Add focused integration tests around the highest-risk import contract rather than re-covering the existing confirmation and happy-path assertions.

**Contract**: Extend the import helper section with cases that simulate failure during same-month replacement after replacement work has started. The new assertions should verify the business-level month-state outcome, not only that an error is thrown. Keep the existing replace-confirmation and review-pending tests intact as baseline coverage.

#### 2. Replacement-safe commit behavior

**File**: `src/lib/imports/data.ts`

**Intent**: Make the same-month replacement flow safe under failure so the new integrity coverage can land green.

**Contract**: Adjust `commitImportBatch` so a failed replacement attempt does not leave the selected bank/month in a corrupted intermediate state with deleted old rows, missing rows, or a half-replaced batch. Preserve the external route contract (`batch`, `transactions`, `replaced`) and keep the same bank/month replacement semantics.

#### 3. Commit-route failure truthfulness

**File**: `tests/import-review.test.ts`

**Intent**: Verify that route-level replacement failures surface truthful errors through the existing import API contract.

**Contract**: Add route-focused assertions that a failed replace attempt returns the expected structured error shape and does not silently report success. Reuse the existing Astro route invocation pattern already present in the suite.

### Success Criteria:

#### Automated Verification:

- `tests/import-review.test.ts` covers same-month replacement failure behavior at the helper level.
- `tests/import-review.test.ts` covers replacement failure truthfulness at the commit-route level.
- `npm test -- tests/import-review.test.ts` passes.
- `npx astro check` passes after the import helper change.
- Targeted lint passes for `src/lib/imports/data.ts` and `tests/import-review.test.ts`.

#### Manual Verification:

- Read the replacement test names and confirm they describe business outcomes, not internal mock choreography.
- Review the import helper change and confirm the bank-month contract is still "one truthful month state" after a failed replacement attempt.
- Confirm the new coverage still keeps explicit replacement confirmation as a separate concern from replacement safety.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Summary Trust Edge Coverage

### Overview

Extend summary coverage only at the three research-backed gaps: default month selection, pending-only month behavior, and repeated snapshot refresh behavior.

### Changes Required:

#### 1. Default-month selection coverage

**File**: `tests/monthly-summary-and-rules.test.ts`

**Intent**: Lock in the current dashboard default-selection contract so later refactors do not silently change which month a user sees first.

**Contract**: Add summary-helper and/or route-level assertions that, when no explicit month is requested, the dashboard defaults to the latest imported month even if that month is still pending review. Keep the current implementation behavior as the oracle.

#### 2. Pending-only month trust coverage

**File**: `tests/monthly-summary-and-rules.test.ts`

**Intent**: Protect the case where a month has imports but no completed review, which is the most likely trust-edge for users landing on the freshest month.

**Contract**: Add a case where the selected month has only pending batches and assert that category totals remain untrusted while `incomplete_review_spend` and `warning_batches` stay populated. Reuse the current summary helper seam rather than pushing this into UI-only coverage.

#### 3. Snapshot refresh behavior

**File**: `tests/monthly-summary-and-rules.test.ts`

**Intent**: Ensure `monthly_summaries` remains a cache refreshed from live computation rather than a stale authority.

**Contract**: Add a case that simulates an existing snapshot and verifies `loadDashboardSummary` recomputes and refreshes the saved snapshot on repeated loads. The test should assert live-behavior truthfulness, not just that an upsert method was called.

### Success Criteria:

#### Automated Verification:

- `tests/monthly-summary-and-rules.test.ts` covers default selected-month behavior with no explicit `month`.
- `tests/monthly-summary-and-rules.test.ts` covers a pending-only month with incomplete-review separation.
- `tests/monthly-summary-and-rules.test.ts` covers snapshot refresh behavior when a prior summary already exists.
- `npm test -- tests/monthly-summary-and-rules.test.ts` passes.
- `npx astro check` passes.

#### Manual Verification:

- Read the new summary test names and confirm they preserve the current dashboard default-month contract.
- Confirm the pending-only month scenario keeps category totals separate from incomplete imported spend.
- Confirm the snapshot-refresh case still treats live tables as the source of truth rather than the prior cached snapshot.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Request-Boundary Rejection Coverage

### Overview

Add focused route-contract tests for malformed import and summary requests that users can actually hit, without broadening into generic error-matrix testing.

### Changes Required:

#### 1. Import route boundary coverage

**File**: `tests/import-review.test.ts`

**Intent**: Verify that user-facing import routes reject malformed requests through the real HTTP contract rather than only through helper validators.

**Contract**: Add route tests for wrong content type on JSON import routes, malformed or missing commit payload fields, and invalid preview upload shape such as empty or non-CSV uploads. Keep the assertions on structured error payloads and status behavior produced by `importErrorResponse`.

#### 2. Summary route boundary coverage

**File**: `tests/monthly-summary-and-rules.test.ts`

**Intent**: Verify that invalid selected-month requests fail truthfully at the summary API boundary.

**Contract**: Add route coverage for an invalid `month` query value and assert the route returns the expected summary error shape instead of silently coercing or accepting the request.

### Success Criteria:

#### Automated Verification:

- `tests/import-review.test.ts` covers user-facing invalid boundary cases for commit and preview routes.
- `tests/monthly-summary-and-rules.test.ts` covers invalid selected-month rejection at the summary route.
- `npm test -- tests/import-review.test.ts tests/monthly-summary-and-rules.test.ts` passes.
- Targeted lint passes for the touched test files.

#### Manual Verification:

- Review the negative route cases and confirm they exercise real request boundaries rather than duplicating pure validator tests.
- Confirm the new import-route assertions stay focused on malformed user inputs, not internal Supabase failures already covered elsewhere.
- Confirm the summary invalid-month case preserves the current JSON error contract shape.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 4: Cookbook and Rollout Alignment

### Overview

Finish the rollout by updating the test-plan cookbook guidance and leaving Phase 1 with a reusable pattern for future finance-domain test work.

### Changes Required:

#### 1. Phase 1 cookbook backfill

**File**: `context/foundation/test-plan.md`

**Intent**: Replace the current Phase 1 placeholder with the concrete patterns that actually shipped in this rollout.

**Contract**: Update the relevant `§6` cookbook entries so future contributors know where import/summary integration tests live, what seam they should use, and what business behaviors these tests are meant to prove. Keep the guidance pattern-oriented rather than file-inventory heavy.

#### 2. Phase status alignment

**File**: `context/foundation/test-plan.md`

**Intent**: Keep the rollout status truthful once Phase 1 implementation is complete.

**Contract**: The final implementation phase should update Phase 1 progress and leave the rollout ready to advance to Phase 2 without re-deriving test patterns from scratch.

### Success Criteria:

#### Automated Verification:

- `context/foundation/test-plan.md` Phase 1 cookbook placeholders are replaced with concrete integration-test guidance.
- `npm test` passes for the touched finance-domain suites.
- `npm run lint` passes.
- `npx astro check` passes.
- `npm run build` passes.

#### Manual Verification:

- Read the updated cookbook entry and confirm a fresh contributor could identify the right suite and seam for a new import or summary integrity test.
- Confirm the cookbook language describes business behaviors and cheapest useful layers, not implementation trivia.
- Confirm the rollout remains clearly bounded to Phase 1 and does not absorb Phase 2 review-persistence work.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

## Testing Strategy

### Unit Tests:

- Keep pure validation coverage limited to cases that are not already exercised in existing validator tests.
- Avoid implementation-mirror assertions around summary math internals or import sequencing.

### Integration Tests:

- Same bank/month replacement fails without leaving corrupted persisted month state.
- Commit route surfaces replacement failure truthfully through the existing import error contract.
- Summary defaults to the latest imported month when no explicit month is provided.
- Pending-only selected months keep spend in incomplete-review buckets instead of trusted category totals.
- Summary refresh recomputes from live data and refreshes cached snapshot state.
- Import and summary routes reject malformed request boundaries with stable structured errors.

### Manual Testing Steps:

1. Read the new import replacement tests and confirm they describe month-state outcomes like preserved or truthful replacement state, not internal query ordering.
2. Read the new summary edge tests and confirm they cover default month, pending-only month, and snapshot refresh without duplicating the already-covered reviewed-versus-incomplete happy path.
3. Run the focused suites and inspect any failure messages to confirm they are understandable at the finance-domain contract level.
4. Read the updated cookbook entry in `context/foundation/test-plan.md` and confirm it points future work to the correct seam and files.

## Performance Considerations

This rollout stays within the repo's current lightweight test model. Reusing the existing Supabase-stub integration harness keeps runtime and maintenance cost low while still covering multi-step helper behavior. No new browser tooling, external fixtures, or heavyweight environment bootstrapping should be added in this phase.

## Migration Notes

No schema migration is expected for this rollout. The only allowed production-code change is the minimal helper adjustment needed to make same-month replacement integrity testable and safe under failure while preserving the existing import API contract.

## References

- Related research: `context/changes/testing-critical-import-and-summary-integrity/research.md`
- Rollout source: `context/foundation/test-plan.md`
- Import replacement flow: `src/lib/imports/data.ts:99`
- Summary trust flow: `src/lib/summary/data.ts:185`
- Existing import test harness: `tests/import-review.test.ts:562`
- Existing summary test harness: `tests/monthly-summary-and-rules.test.ts:342`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Import Replacement Integrity

#### Automated

- [x] 1.1 `tests/import-review.test.ts` covers same-month replacement failure behavior at the helper level. — 78e51f2
- [x] 1.2 `tests/import-review.test.ts` covers replacement failure truthfulness at the commit-route level. — 78e51f2
- [x] 1.3 `npm test -- tests/import-review.test.ts` passes. — 78e51f2
- [x] 1.4 `npx astro check` passes after the import helper change. — 78e51f2
- [x] 1.5 Targeted lint passes for `src/lib/imports/data.ts` and `tests/import-review.test.ts`. — 78e51f2

#### Manual

- [x] 1.6 Read the replacement test names and confirm they describe business outcomes, not internal mock choreography. — 78e51f2
- [x] 1.7 Review the import helper change and confirm the bank-month contract is still "one truthful month state" after a failed replacement attempt. — 78e51f2
- [x] 1.8 Confirm the new coverage still keeps explicit replacement confirmation as a separate concern from replacement safety. — 78e51f2

### Phase 2: Summary Trust Edge Coverage

#### Automated

- [x] 2.1 `tests/monthly-summary-and-rules.test.ts` covers default selected-month behavior with no explicit `month`. — 50254c1
- [x] 2.2 `tests/monthly-summary-and-rules.test.ts` covers a pending-only month with incomplete-review separation. — 50254c1
- [x] 2.3 `tests/monthly-summary-and-rules.test.ts` covers snapshot refresh behavior when a prior summary already exists. — 50254c1
- [x] 2.4 `npm test -- tests/monthly-summary-and-rules.test.ts` passes. — 50254c1
- [x] 2.5 `npx astro check` passes. — 50254c1

#### Manual

- [x] 2.6 Read the new summary test names and confirm they preserve the current dashboard default-month contract. — ad67392
- [x] 2.7 Confirm the pending-only month scenario keeps category totals separate from incomplete imported spend. — ad67392
- [x] 2.8 Confirm the snapshot-refresh case still treats live tables as the source of truth rather than the prior cached snapshot. — ad67392

### Phase 3: Request-Boundary Rejection Coverage

#### Automated

- [x] 3.1 `tests/import-review.test.ts` covers user-facing invalid boundary cases for commit and preview routes. â€” 49edc3a
- [x] 3.2 `tests/monthly-summary-and-rules.test.ts` covers invalid selected-month rejection at the summary route. â€” 49edc3a
- [x] 3.3 `npm test -- tests/import-review.test.ts tests/monthly-summary-and-rules.test.ts` passes. â€” 49edc3a
- [x] 3.4 Targeted lint passes for the touched test files. â€” 49edc3a

#### Manual

- [x] 3.5 Review the negative route cases and confirm they exercise real request boundaries rather than duplicating pure validator tests. â€” 49edc3a
- [x] 3.6 Confirm the new import-route assertions stay focused on malformed user inputs, not internal Supabase failures already covered elsewhere. â€” 49edc3a
- [x] 3.7 Confirm the summary invalid-month case preserves the current JSON error contract shape. â€” 49edc3a

### Phase 4: Cookbook and Rollout Alignment

#### Automated

- [x] 4.1 `context/foundation/test-plan.md` Phase 1 cookbook placeholders are replaced with concrete integration-test guidance. — ad67392
- [x] 4.2 `npm test` passes for the touched finance-domain suites. — ad67392
- [x] 4.3 `npm run lint` passes. — ad67392
- [x] 4.4 `npx astro check` passes. — ad67392
- [x] 4.5 `npm run build` passes. — ad67392

#### Manual

- [x] 4.6 Read the updated cookbook entry and confirm a fresh contributor could identify the right suite and seam for a new import or summary integrity test. — ad67392
- [x] 4.7 Confirm the cookbook language describes business behaviors and cheapest useful layers, not implementation trivia. — ad67392
- [x] 4.8 Confirm the rollout remains clearly bounded to Phase 1 and does not absorb Phase 2 review-persistence work. — ad67392
