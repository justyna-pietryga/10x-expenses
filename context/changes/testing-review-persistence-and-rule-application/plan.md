# Review Persistence and Rule Application Implementation Plan

## Overview

Implement Phase 2 of the test rollout by adding a dedicated integration suite that locks in truthful partial-save behavior for import review, contract-level review completion boundaries, and full dashboard-to-import rule lifecycle coverage. The plan stays test-first and only permits minimal production fixes when the new coverage exposes a real mismatch between persisted state and what the app tells the user.

## Current State Analysis

The repo already has the relevant domain seams, but they are spread across two existing suites and one narrow E2E smoke. Bulk review persistence currently runs row-by-row and returns mixed `updated` / `failed` results rather than an all-or-nothing transaction. The import UI treats that response as the contract by merging only updated rows into local state, keeping failed drafts attached, and blocking review completion only while dirty drafts still exist.

Rule behavior is also split across two areas. Import-time categorization applies the first matching saved rule to each imported transaction, while dashboard rule management owns create, update, and delete flows. That means Phase 2 must verify not just isolated helper behavior, but that dashboard-managed rules actually mutate the intended future imports and do not leak across match-field boundaries.

There is already browser coverage for the user-visible dirty-state slice of risk `#3`, so this phase should not duplicate the same browser journey. The cheapest useful layer remains helper-and-route integration with hand-built Supabase stubs, but this rollout will use a dedicated Phase 2 suite rather than extending the current root finance suites.

## Desired End State

After this change:

- a dedicated integration suite proves bulk review saves are truthful under full success, mixed success, and full failure
- review completion behavior is covered at the contract boundary relative to saved versus unsaved category state
- dashboard rule creation, editing, and deletion are verified through to downstream import-time categorization outcomes
- `context/foundation/test-plan.md` contains concrete Phase 2 cookbook guidance for future review-persistence and rule-scope tests

Verification is complete when the dedicated Phase 2 suite passes, the existing quality gates still pass, and a contributor can read the updated cookbook entry and know which seam to use for future review-persistence work.

### Key Discoveries:

- Bulk review persistence is intentionally partial-success today: `updateImportTransactionCategories` loops through each update, accumulates `updated` and `failed`, and never rolls back earlier row successes: `src/lib/imports/data.ts:367`
- The bulk review route returns that mixed result directly as the HTTP contract with no extra reconciliation layer: `src/pages/api/imports/transactions/bulk.ts:6`
- The import workspace only merges returned `updated` rows into local state and shows a mixed-outcome notice when `failed` rows remain: `src/components/imports/ImportWorkspace.tsx:165`
- Dirty drafts and row-level feedback are owned by `TransactionReviewTable`, which clears only successful drafts and leaves failed rows attached to the user-visible review state: `src/components/imports/TransactionReviewTable.tsx:61`
- Import-time categorization uses the first rule whose normalized `recipient`, `title`, or combined `both` candidate contains the saved rule text, so Phase 2 must assert match-field scope explicitly: `src/lib/rules/data.ts:39`
- Dashboard rule CRUD is mediated by `SummaryWorkspace`, which updates in-memory rule state from `/api/rules` responses and is the right boundary for lifecycle contract tests: `src/components/dashboard/SummaryWorkspace.tsx:68`

## What We're NOT Doing

- No Playwright expansion or browser-matrix testing for this phase
- No conversion of bulk review save into all-or-nothing persistence unless tests prove the current contract is misleading
- No rewrite of the import-review UI architecture
- No broad summary or import integrity work already covered by Phase 1
- No auth or ownership testing from rollout Phase 3
- No snapshot-heavy UI coverage
- No testing of Supabase internals or generated types

## Implementation Approach

Create one dedicated root integration suite for Phase 2, centered on review persistence and rule application behavior. Reuse the existing hand-built Supabase stub style and direct Astro route invocation patterns, but keep the new coverage isolated from the Phase 1 suites so the rollout has a clean Phase 2 boundary.

The core strategy is to assert business truth at the persistence boundary:

- for bulk review saves, assert persisted transaction state and route payload agree
- for review completion, assert the contract remains truthful relative to saved versus unsaved changes without duplicating browser interactions
- for rules, assert dashboard CRUD changes the future import categorization set exactly where the saved match-field contract says it should

If implementation reveals a real truthfulness bug, allow the smallest production correction needed to make the test pass honestly. Otherwise keep the phase test-only.

## Critical Implementation Details

### State sequencing

The import UI has two distinct save paths: bulk category persistence and row-level rule saving. The tests must keep those contracts separate. Bulk save truthfulness belongs to the `/api/imports/transactions/bulk` seam, while rule-saving shortcuts and dashboard rule CRUD must be treated as separate flows that can influence later imports but do not redefine the bulk-save contract.

### Debug and observability

Mixed-result tests must assert at the business boundary, not helper call choreography. The oracle is persisted transaction state plus the returned JSON payload, with UI helper assertions only where they prove drafts and row feedback remain truthful after reconciliation.

## Phase 1: Dedicated Phase 2 Test Harness

### Overview

Introduce a dedicated integration suite for Phase 2 that reuses the repo's current helper-and-route testing style without extending the existing Phase 1 files.

### Changes Required:

#### 1. Dedicated Phase 2 integration suite

**File**: `tests/review-persistence-and-rule-application.test.ts`

**Intent**: Create a single suite that groups the new rollout coverage under one Phase 2 boundary, keeping the test plan and future cookbook guidance easier to follow.

**Contract**: Add a root-level Vitest file that houses review persistence, review completion boundary, and rule lifecycle coverage. Reuse the same style of Supabase query-chain stubs and direct Astro route invocation already used in the finance-domain suites, but keep the fixture builders Phase 2-specific so the assertions stay focused on review and rule behavior.

#### 2. Shared Phase 2 fixture builders

**File**: `tests/review-persistence-and-rule-application.test.ts`

**Intent**: Keep the new suite maintainable by centralizing the specific transaction, rule, and category state needed for truthfulness assertions.

**Contract**: The suite should expose helper builders for transactions, categories, existing rules, and route-auth contexts so each scenario can assert persisted state and payload truth without copy-pasting large inline stubs.

### Success Criteria:

#### Automated Verification:

- `tests/review-persistence-and-rule-application.test.ts` exists and runs as the dedicated Phase 2 integration suite.
- The new suite reuses direct helper and direct Astro route seams instead of introducing browser setup or generic mocks.
- `npm test -- tests/review-persistence-and-rule-application.test.ts` passes.

#### Manual Verification:

- Read the suite structure and confirm it is clearly partitioned into review persistence, completion boundary, and rule lifecycle sections.
- Confirm the dedicated suite stays Phase 2-specific instead of duplicating broad Phase 1 import and summary coverage.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Review Persistence Truthfulness

### Overview

Lock in the current partial-success review-save contract by proving persisted state, route payload, and local reconciliation remain truthful across full success, mixed success, and full failure outcomes.

### Changes Required:

#### 1. Bulk helper persistence coverage

**File**: `tests/review-persistence-and-rule-application.test.ts`

**Intent**: Prove the domain helper persists only the rows it reports as updated and leaves failed rows untouched.

**Contract**: Add helper-level tests for `updateImportTransactionCategories` covering:

- all rows save successfully
- one or more rows fail while other rows persist
- no rows save and all failures are reported

Assertions must verify final persisted transaction state per row, not just the returned arrays.

#### 2. Bulk route truthfulness coverage

**File**: `tests/review-persistence-and-rule-application.test.ts`

**Intent**: Verify the `/api/imports/transactions/bulk` route preserves the helper's truthful mixed-result contract.

**Contract**: Add Astro route tests that assert the route returns `200` with accurate `updated` and `failed` payload sections for mixed outcomes, and that those payload rows correspond to the persisted helper state underneath the route call.

#### 3. Local reconciliation helper coverage

**File**: `tests/review-persistence-and-rule-application.test.ts`

**Intent**: Ensure the client-side review state stays aligned with the persistence contract after a mixed save.

**Contract**: Cover `buildBulkSaveFeedback`, `mergeImportedTransactionCategoryUpdates`, and any adjacent helper assertions needed to prove successful rows clear drafts and failed rows remain attached with row-level feedback. Keep this focused on the partial-success contract rather than generic component rendering breadth.

### Success Criteria:

#### Automated Verification:

- The new suite proves persisted transaction state matches helper-level `updated` / `failed` results.
- The new suite proves `/api/imports/transactions/bulk` returns truthful mixed-result payloads.
- The new suite proves successful drafts clear while failed drafts remain attached after reconciliation.
- `npm test -- tests/review-persistence-and-rule-application.test.ts` passes.
- Targeted lint passes for the dedicated Phase 2 suite.

#### Manual Verification:

- Read the mixed-save test names and confirm they describe user-truthful persisted outcomes rather than internal query order.
- Confirm the tests preserve the chosen partial-success contract instead of silently redefining it as all-or-nothing.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Review Completion Boundary Truthfulness

### Overview

Add cheaper integration coverage for completion behavior so the system remains truthful about when a review can be marked complete relative to unsaved or saved category changes.

### Changes Required:

#### 1. Completion guard coverage at the UI-helper seam

**File**: `tests/review-persistence-and-rule-application.test.ts`

**Intent**: Complement the existing Playwright smoke with deterministic contract checks around completion blocking and unblocking.

**Contract**: Add focused coverage that proves unsaved drafts keep completion blocked and that successful reconciliation removes that block. The assertions should stay at the view-model or helper/render seam already available in the import workspace components rather than recreating the full browser workflow.

#### 2. Review completion route contract coverage

**File**: `tests/review-persistence-and-rule-application.test.ts`

**Intent**: Verify that completion route behavior remains truthful when called after valid saved-review state.

**Contract**: Add route or helper coverage around `markBatchReviewComplete` and the completion endpoint so the batch completion response reflects the persisted state change and does not blur the distinction between dirty drafts and persisted categories.

### Success Criteria:

#### Automated Verification:

- The new suite proves completion remains blocked while dirty drafts still exist at the client-side contract seam.
- The new suite proves completion becomes available again after successful category persistence reconciliation.
- The new suite proves the completion route returns a truthful updated batch state.
- `npm test -- tests/review-persistence-and-rule-application.test.ts` passes.

#### Manual Verification:

- Confirm the completion-boundary assertions complement, rather than duplicate, the existing E2E dirty-state smoke.
- Confirm the tests keep the focus on truthful saved-versus-unsaved state, not generic UI rendering.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 4: Dashboard Rule Lifecycle and Downstream Mutation Scope

### Overview

Cover the full dashboard rule lifecycle and prove its downstream import-time effects only touch the transactions the saved rule contract should match.

### Changes Required:

#### 1. Dashboard rule CRUD contract coverage

**File**: `tests/review-persistence-and-rule-application.test.ts`

**Intent**: Verify the dashboard rule endpoints and workspace contract remain truthful for create, update, and delete flows.

**Contract**: Add route and targeted workspace-helper coverage for `/api/rules` and `/api/rules/[id]` so rule lifecycle changes update in-memory dashboard state truthfully. The focus is on contract behavior and target-category ownership, not exhaustive UI rendering permutations.

#### 2. Match-field mutation-scope coverage

**File**: `tests/review-persistence-and-rule-application.test.ts`

**Intent**: Protect against the core risk that a rule appears correct in the table but mutates the wrong future transactions.

**Contract**: Add explicit assertions for `recipient`, `title`, and `both` semantics under normalized contains matching. The test data must prove that each saved rule affects intended future import rows and leaves non-matching rows untouched, including cases where one field matches and the other does not.

#### 3. Dashboard-to-import downstream effect coverage

**File**: `tests/review-persistence-and-rule-application.test.ts`

**Intent**: Close the gap between dashboard rule management and import-time categorization so the suite proves the full lifecycle the user actually relies on.

**Contract**: After creating or updating a rule through the dashboard route seam, run import commit behavior against a future batch and assert that categorized rows reflect the saved rule set exactly. Deletion coverage must prove removed rules no longer influence downstream imports.

### Success Criteria:

#### Automated Verification:

- The new suite covers create, update, and delete rule contracts through the dashboard route seams.
- The new suite proves `recipient`, `title`, and `both` matching only mutate intended future imported rows.
- The new suite proves deleted rules stop affecting downstream imports.
- `npm test -- tests/review-persistence-and-rule-application.test.ts` passes.
- `npx astro check` passes.

#### Manual Verification:

- Read the rule-lifecycle test names and confirm they describe downstream user-visible categorization outcomes, not only helper internals.
- Confirm the match-field coverage demonstrates both intended matches and untouched non-matches.
- Confirm the scope stays on future import categorization effects rather than drifting into summary behavior already covered elsewhere.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 5: Cookbook and Rollout Alignment

### Overview

Backfill the rollout artifact with concrete Phase 2 guidance and keep the phased rollout status truthful once implementation lands.

### Changes Required:

#### 1. Phase 2 cookbook entry

**File**: `context/foundation/test-plan.md`

**Intent**: Replace the current Phase 2 placeholder with reusable testing guidance for review persistence and rule mutation scope.

**Contract**: Update Section 6.2 so contributors know the dedicated suite name, which helper-and-route seams to prefer, and what business outcomes these tests should prove: truthful mixed saves, truthful completion boundaries, and precise downstream rule mutation scope.

#### 2. Rollout status alignment

**File**: `context/foundation/test-plan.md`

**Intent**: Keep the rollout table and notes accurate once Phase 2 is complete.

**Contract**: Update the Phase 2 row and related notes so the artifact reflects the shipped dedicated suite and does not require future contributors to rediscover the Phase 2 testing boundary.

### Success Criteria:

#### Automated Verification:

- `context/foundation/test-plan.md` contains concrete Phase 2 cookbook guidance for review persistence and rule application.
- `npm test -- tests/review-persistence-and-rule-application.test.ts` passes.
- `npm run lint` passes.
- `npx astro check` passes.
- `npm run build` passes.

#### Manual Verification:

- Read the updated Phase 2 cookbook entry and confirm a new contributor could identify the dedicated suite and correct seam for future work.
- Confirm the cookbook guidance stays pattern-oriented and does not degrade into a per-test changelog.
- Confirm the rollout remains clearly bounded to Phase 2 and does not absorb Phase 3 ownership concerns.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

## Testing Strategy

### Unit Tests:

- Keep unit-style coverage limited to local reconciliation helpers such as draft derivation, partial-save feedback, and downstream merge behavior.
- Avoid implementation-mirror assertions on query-chain call counts or internal helper ordering.

### Integration Tests:

- Mixed bulk save persists successful rows, leaves failed rows untouched, and reports both truthfully.
- Full bulk failure reports no saved rows and preserves prior persisted category state.
- Review completion remains blocked while dirty drafts exist and becomes truthful again after successful save reconciliation.
- Dashboard rule create, update, and delete flows preserve the route and workspace contract.
- `recipient`, `title`, and `both` rules categorize only intended future import rows.
- Deleted or changed rules stop affecting future imports outside their saved mutation scope.

### Manual Testing Steps:

1. Read the dedicated Phase 2 suite and confirm the scenarios are grouped into persistence, completion, and rule lifecycle sections.
2. Inspect the mixed-result tests and confirm the oracle is persisted row state plus returned payload truth.
3. Read the rule lifecycle assertions and confirm they demonstrate intended matches and untouched non-matches across all three match-field modes.
4. Read the updated Phase 2 cookbook entry in `context/foundation/test-plan.md` and confirm it points future work to the dedicated suite and cheapest useful seams.

## Performance Considerations

This rollout should stay within the repo's current lightweight test architecture. A dedicated suite increases logical separation, not infrastructure cost. Reuse the existing direct-helper and direct-route patterns with in-memory Supabase stubs; do not introduce browser bootstrapping, external fixtures, or database containers for this phase.

## Migration Notes

No schema migration is expected. Production changes are allowed only if the new tests expose a real truthfulness bug in review persistence, completion signaling, or rule downstream effects. Any such change should be the smallest correction that preserves the selected partial-success contract.

## References

- Rollout source: `context/foundation/test-plan.md`
- Existing import persistence helper: `src/lib/imports/data.ts:367`
- Bulk review route contract: `src/pages/api/imports/transactions/bulk.ts:6`
- Import workspace reconciliation: `src/components/imports/ImportWorkspace.tsx:165`
- Dirty draft and feedback helpers: `src/components/imports/TransactionReviewTable.tsx:35`
- Rule matching semantics: `src/lib/rules/data.ts:39`
- Dashboard rule lifecycle boundary: `src/components/dashboard/SummaryWorkspace.tsx:68`
- Existing browser smoke for risk `#3`: `context/changes/review-persistence-e2e-risk-3/plan.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Dedicated Phase 2 Test Harness

#### Automated

- [x] 1.1 `tests/review-persistence-and-rule-application.test.ts` exists and runs as the dedicated Phase 2 integration suite. — cde4be7
- [x] 1.2 The new suite reuses direct helper and direct Astro route seams instead of introducing browser setup or generic mocks. — cde4be7
- [x] 1.3 `npm test -- tests/review-persistence-and-rule-application.test.ts` passes. — cde4be7

#### Manual

- [x] 1.4 Read the suite structure and confirm it is clearly partitioned into review persistence, completion boundary, and rule lifecycle sections. — cde4be7
- [x] 1.5 Confirm the dedicated suite stays Phase 2-specific instead of duplicating broad Phase 1 import and summary coverage. — cde4be7

### Phase 2: Review Persistence Truthfulness

#### Automated

- [x] 2.1 The new suite proves persisted transaction state matches helper-level `updated` / `failed` results. — cde4be7
- [x] 2.2 The new suite proves `/api/imports/transactions/bulk` returns truthful mixed-result payloads. — cde4be7
- [x] 2.3 The new suite proves successful drafts clear while failed drafts remain attached after reconciliation. — cde4be7
- [x] 2.4 `npm test -- tests/review-persistence-and-rule-application.test.ts` passes. — cde4be7
- [x] 2.5 Targeted lint passes for the dedicated Phase 2 suite. — cde4be7

#### Manual

- [x] 2.6 Read the mixed-save test names and confirm they describe user-truthful persisted outcomes rather than internal query order. — cde4be7
- [x] 2.7 Confirm the tests preserve the chosen partial-success contract instead of silently redefining it as all-or-nothing. — cde4be7

### Phase 3: Review Completion Boundary Truthfulness

#### Automated

- [x] 3.1 The new suite proves completion remains blocked while dirty drafts still exist at the client-side contract seam. — cde4be7
- [x] 3.2 The new suite proves completion becomes available again after successful category persistence reconciliation. — cde4be7
- [x] 3.3 The new suite proves the completion route returns a truthful updated batch state. — cde4be7
- [x] 3.4 `npm test -- tests/review-persistence-and-rule-application.test.ts` passes. — cde4be7

#### Manual

- [x] 3.5 Confirm the completion-boundary assertions complement, rather than duplicate, the existing E2E dirty-state smoke. — cde4be7
- [x] 3.6 Confirm the tests keep the focus on truthful saved-versus-unsaved state, not generic UI rendering. — cde4be7

### Phase 4: Dashboard Rule Lifecycle and Downstream Mutation Scope

#### Automated

- [x] 4.1 The new suite covers create, update, and delete rule contracts through the dashboard route seams. — cde4be7
- [x] 4.2 The new suite proves `recipient`, `title`, and `both` matching only mutate intended future imported rows. — cde4be7
- [x] 4.3 The new suite proves deleted rules stop affecting downstream imports. — cde4be7
- [x] 4.4 `npm test -- tests/review-persistence-and-rule-application.test.ts` passes. — cde4be7
- [x] 4.5 `npx astro check` passes. — cde4be7

#### Manual

- [x] 4.6 Read the rule-lifecycle test names and confirm they describe downstream user-visible categorization outcomes, not only helper internals. — cde4be7
- [x] 4.7 Confirm the match-field coverage demonstrates both intended matches and untouched non-matches. — cde4be7
- [x] 4.8 Confirm the scope stays on future import categorization effects rather than drifting into summary behavior already covered elsewhere. — cde4be7

### Phase 5: Cookbook and Rollout Alignment

#### Automated

- [x] 5.1 `context/foundation/test-plan.md` contains concrete Phase 2 cookbook guidance for review persistence and rule application. — cde4be7
- [x] 5.2 `npm test -- tests/review-persistence-and-rule-application.test.ts` passes. — cde4be7
- [x] 5.3 `npm run lint` passes. — cde4be7
- [x] 5.4 `npx astro check` passes. — cde4be7
- [x] 5.5 `npm run build` passes. — cde4be7

#### Manual

- [x] 5.6 Read the updated Phase 2 cookbook entry and confirm a new contributor could identify the dedicated suite and correct seam for future work. — cde4be7
- [x] 5.7 Confirm the cookbook guidance stays pattern-oriented and does not degrade into a per-test changelog. — cde4be7
- [x] 5.8 Confirm the rollout remains clearly bounded to Phase 2 and does not absorb Phase 3 ownership concerns. — cde4be7
