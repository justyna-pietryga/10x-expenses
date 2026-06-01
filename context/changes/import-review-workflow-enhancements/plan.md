# Import Review Workflow Enhancements Implementation Plan

## Overview

Extend the roadmap after the first MVP loop by turning the post-roadmap enhancement notes into three follow-up slices, then implement the first slice: bulk category review for imported transactions. The primary user-facing change is that a user can edit many imported rows, clearly see what is unsaved, and save all category changes in one action instead of clicking `Save category` on every row.

## Current State Analysis

The frame brief found that the import review experience is still row-local and opaque about rules. The current implementation already supports protected imports, per-user transactions, category edits, and reusable rules, but the review table makes the user repeat the same save action many times.

Key findings from the frame and codebase:

- `src/components/imports/TransactionReviewTable.tsx` keeps `drafts`, `saveRuleById`, `busyId`, and `successById` by row, and each row has its own `Save category` button.
- `src/components/imports/ImportWorkspace.tsx` calls one transaction PATCH at a time through `handleSaveCategory`.
- `src/pages/api/imports/transactions/[id].ts` accepts a single transaction id and updates one transaction category.
- `src/lib/imports/data.ts` updates one transaction via `updateTransactionCategoryAndMaybeRule`.
- Import-created rules are still recipient-only, while `src/components/rules/RuleForm.tsx` and `src/lib/rules/data.ts` already support field-aware rules. That work belongs in the next roadmap slice, not in this first implementation.
- Category and rule surfaces are visually large, but density is a separate polish problem and should not obscure the workflow semantics.

## Desired End State

The roadmap gains three follow-up slices:

- `UX-01 import-review-bulk-categorization`: bulk review save with clear unsaved state.
- `UX-02 import-review-rule-application`: field-aware rules from import review, visible rule provenance, and confirmed current-batch rule application.
- `UX-03 management-surface-density`: denser category and rule management layouts.

This plan implements `UX-01`. A signed-in user reviewing an import batch can change categories across many rows, see an unsaved-change count, save all changed rows at once, and understand which rows saved or failed. Rule creation remains the existing recipient-only per-row behavior until `UX-02`.

## What We're NOT Doing

- No field-aware import rule creation in this plan.
- No current-batch rule preview or rule propagation in this plan.
- No rule provenance badges in this plan.
- No category/rule density redesign in this plan.
- No transaction amount/date/title/recipient editing.
- No schema migration unless implementation discovers the current transaction model cannot support bulk category updates.
- No generic redesign of `/imports`; keep the existing route and review table structure.

## Implementation Approach

First, make the roadmap reflect the new follow-up sequence so future planning has clear scope boundaries. Then add a bulk category update helper and API route that can update multiple owned imported transactions in one request while returning per-row results. Finally, replace the row-level save workflow in the review table with dirty-state tracking, row status, and one explicit `Save all changes` action.

The bulk save should be practical rather than fully transactional: rows save independently, successful rows update local state, and failed rows remain dirty with row-level errors. This matches the existing API-driven architecture and avoids adding transactional complexity before the workflow is proven.

## Critical Implementation Details

### Dirty State Contract

A row is dirty when the selected category differs from the persisted `transaction.category_id`. Dirty state must be derived from local draft values plus the latest persisted transaction values, not from a separate boolean that can drift.

### Bulk Save Result Contract

The bulk route should return a result per requested transaction id so the UI can distinguish saved rows from failed rows. A failure on one row must not erase successful updates from other rows.

### Review Completion Guard

If a user has unsaved category changes, the UI should prevent or clearly block `Mark review complete` until changes are saved or discarded. Completing review with unsaved draft categories would recreate the trust problem this slice is meant to remove.

## Phase 1: Roadmap Follow-Up Structure

### Overview

Add the framed post-MVP follow-ups to `context/foundation/roadmap.md` so the backlog reflects the problems found after completing S-04.

### Changes Required:

#### 1. Roadmap Entries

**File**:
- `context/foundation/roadmap.md`

**Intent**: Add a clear follow-up sequence after S-04 without rewriting completed roadmap history.

**Contract**:
- Add `UX-01`, `UX-02`, and `UX-03` to the "At a glance" table.
- Add matching sections under a new `## UX Follow-ups` section or the existing slices area.
- Mark all three as `proposed`.
- Set dependencies:
  - `UX-01` depends on `S-02`.
  - `UX-02` depends on `UX-01` and `S-03`.
  - `UX-03` depends on `UX-01` and `UX-02`.
- Keep completed `F-01` and `S-01` through `S-04` unchanged.

#### 2. Backlog Handoff Update

**File**:
- `context/foundation/roadmap.md`

**Intent**: Make the new work discoverable to later `/10x-plan` runs.

**Contract**:
- Add backlog handoff rows for `UX-01`, `UX-02`, and `UX-03`.
- Mark `UX-01` as ready for planning/implementation from this plan.
- Mark `UX-02` and `UX-03` as not ready until their prerequisites land.

### Success Criteria:

#### Automated Verification:

- `rg -n "UX-01|UX-02|UX-03" context/foundation/roadmap.md` shows all three entries in the roadmap and backlog handoff.
- `npx prettier --check context/foundation/roadmap.md` passes, or formatting is confirmed unchanged if the repo's markdown formatting baseline is already noisy.

#### Manual Verification:

- Confirm the roadmap reflects three separate follow-ups rather than one large mixed enhancement.
- Confirm `UX-01` is the first implementation target and `UX-02`/`UX-03` remain follow-ups.

**Implementation Note**: After completing this phase and automated verification, pause for manual confirmation before changing import APIs or UI.

---

## Phase 2: Bulk Category Update API

### Overview

Add backend support for saving multiple category changes for a user's imported transactions in one request.

### Changes Required:

#### 1. Bulk Validation Contract

**Files**:
- `src/lib/imports/validation.ts`
- `src/lib/imports/types.ts` if shared request/response types are useful

**Intent**: Validate an array of transaction category updates before touching data.

**Contract**:
- Accept an object with an `updates` array.
- Each update contains:
  - `transaction_id`
  - `category_id`, nullable for uncategorized
- Reject empty update arrays.
- Reject malformed ids and malformed categories using existing import error patterns.
- Do not include `save_rule` in this bulk contract; that remains part of `UX-02`.

#### 2. Bulk Data Helper

**File**:
- `src/lib/imports/data.ts`

**Intent**: Update multiple owned imported transactions while preserving per-row failure information.

**Contract**:
- Add a helper such as `updateImportTransactionCategories`.
- Verify any non-null category belongs to the user by reusing the active category lookup.
- Update only transactions owned by the current user.
- Return:
  - `updated`: successfully updated transactions
  - `failed`: transaction ids with user-safe error messages
- Do not mark batch review complete.
- Do not create or update categorization rules.

#### 3. Bulk API Route

**File**:
- `src/pages/api/imports/transactions/bulk.ts` or an equivalent route that matches existing Astro route conventions

**Intent**: Give the UI one endpoint for saving all dirty rows.

**Contract**:
- Require import auth through `requireImportAuth`.
- Read JSON through `readImportJsonPayload`.
- Validate with the new bulk validator.
- Return `200` with per-row results when at least one row saves and failures, if any, are included.
- Return a clear error when no row can be saved.

#### 4. API and Helper Tests

**File**:
- `tests/import-review.test.ts`

**Intent**: Protect ownership, partial failure semantics, and the no-rule side effect boundary.

**Contract**:
- Cover a successful multi-row category update.
- Cover nullable `category_id` to uncategorize a row.
- Cover a mixed result where one row fails and another succeeds.
- Cover the route contract for authenticated user context.

### Success Criteria:

#### Automated Verification:

- `npm test -- tests/import-review.test.ts` passes with bulk update helper and route coverage.
- `npx astro check` passes.
- Targeted `npx eslint` passes for touched import API/helper/test files.

#### Manual Verification:

- Confirm the new bulk endpoint is category-only and does not create rules.
- Confirm the endpoint cannot update another user's transactions or categories.

**Implementation Note**: After completing this phase and automated verification, pause for manual confirmation before replacing the review table workflow.

---

## Phase 3: Batch-Oriented Review UI

### Overview

Replace per-row category save buttons with local dirty state, row-level status, and one explicit save action for all changed categories.

### Changes Required:

#### 1. Transaction Review Table State

**File**:
- `src/components/imports/TransactionReviewTable.tsx`

**Intent**: Let users edit many category selects before committing the changes.

**Contract**:
- Remove the row-level `Save category` action for category-only changes.
- Track category drafts per transaction.
- Derive dirty rows by comparing draft category values to persisted transaction categories.
- Show an unsaved-change count.
- Show row-level saved/error states after a bulk save attempt.
- Keep parsed date, title, recipient, and amount read-only.

#### 2. Workspace Bulk Save Wiring

**File**:
- `src/components/imports/ImportWorkspace.tsx`

**Intent**: Call the new bulk route, update saved rows locally, and keep failed rows dirty.

**Contract**:
- Add an `onSaveCategoryChanges` callback that sends dirty updates to the bulk endpoint.
- Update local `transactions` with returned successful rows.
- Return failed row metadata to the table so failed rows stay visible and retryable.
- Keep upload, commit, replacement confirmation, and review-complete behavior unchanged.

#### 3. Review Completion Guard

**Files**:
- `src/components/imports/ImportWorkspace.tsx`
- `src/components/imports/ReviewCompletionBar.tsx` if the guard needs a disabled state or explanatory message

**Intent**: Prevent users from completing review while category drafts are unsaved.

**Contract**:
- Disable or block `Mark review complete` when dirty rows exist.
- Show clear copy that unsaved category changes must be saved or discarded first.
- Once changes are saved or discarded, completion works as before.

#### 4. UI Tests

**File**:
- `tests/import-review.test.ts`

**Intent**: Lock in the new review interaction model.

**Contract**:
- Cover rendering of an unsaved-change count.
- Cover absence of row-level `Save category` buttons for category-only edits.
- Cover save-all affordance in the table or footer.
- Cover the review-complete guard state when unsaved changes exist.

### Success Criteria:

#### Automated Verification:

- `npm test -- tests/import-review.test.ts` passes with bulk review UI coverage.
- `npx astro check` passes.
- `npm run build` passes.
- Targeted `npx eslint` passes for touched import UI files and tests.

#### Manual Verification:

- A signed-in user can edit categories on multiple imported rows and save them with one action.
- Unsaved changes are visibly counted before save.
- Successful rows update in place after save.
- Failed rows remain dirty and show row-level errors.
- Review completion is blocked while unsaved category changes exist and works after saving or discarding them.

**Implementation Note**: After completing this phase and automated verification, pause for manual confirmation before final closeout.

---

## Phase 4: Regression and Handoff

### Overview

Stabilize the bulk-review slice, keep roadmap handoff clear, and leave `UX-02` and `UX-03` ready for later planning.

### Changes Required:

#### 1. Regression Coverage

**Files**:
- `tests/import-review.test.ts`
- any touched import helper or UI files

**Intent**: Make sure the new bulk flow does not regress import preview, commit, replacement, or category review persistence.

**Contract**:
- Keep existing Revolut and ING import tests passing.
- Keep same-bank same-month replacement behavior covered.
- Keep rule creation tests for the existing per-row recipient-only path if it remains available, or explicitly move those expectations to the future `UX-02` scope if removed from the UI.

#### 2. Plan and Brief Alignment

**Files**:
- `context/changes/import-review-workflow-enhancements/plan.md`
- `context/changes/import-review-workflow-enhancements/plan-brief.md`
- `context/foundation/roadmap.md`

**Intent**: Keep the plan, brief, and roadmap synchronized with what was actually implemented.

**Contract**:
- The brief says this plan implemented `UX-01` only.
- The roadmap still lists `UX-02` and `UX-03` as follow-ups.
- No documentation implies that field-aware import rules or density polish shipped in this slice.

### Success Criteria:

#### Automated Verification:

- `npm test -- tests/import-review.test.ts` passes.
- `npx astro check` passes.
- `npm run build` passes.
- Targeted lint passes for the touched files.

#### Manual Verification:

- Review the plan brief and roadmap entries and confirm `UX-01`, `UX-02`, and `UX-03` remain separate.
- Confirm the shipped app behavior addresses bulk category review without claiming to solve import rule application or density polish.

**Implementation Note**: After completing this phase and automated verification, pause for manual confirmation before impl-review or archive.

## Testing Strategy

### Unit Tests:

- Bulk import category update payload validation.
- Category ownership validation for non-null categories.
- Per-row success/failure result shaping.
- Dirty-state derivation in the review UI where practical through rendered markup.

### Integration Tests:

- Bulk category update route saves multiple rows for the current user.
- Partial failure results leave failed rows identifiable.
- Existing import preview, commit, replacement, review-complete, and parser tests continue to pass.

### Manual Testing Steps:

1. Import or resume a batch with several transactions.
2. Change categories on at least three rows without saving.
3. Confirm the UI shows the correct unsaved-change count.
4. Save all changes once.
5. Confirm saved rows update in place and the unsaved count clears.
6. Try marking review complete while unsaved changes exist and confirm it is blocked.
7. Confirm review completion works after saving or discarding changes.
8. Confirm rule creation from import review has not been expanded yet and remains future `UX-02` scope.

## Performance Considerations

Bulk saves are MVP-scale and should handle a typical monthly import batch synchronously. The route can update rows one by one behind one request for now because batch sizes are expected to be small. If later imports grow into hundreds or thousands of rows, `UX-02` or a future performance slice can revisit server-side bulk update strategy.

## Migration Notes

No database migration is expected for `UX-01`. The existing `transactions.category_id` field is sufficient for category-only bulk review. If implementation pressure suggests storing draft state server-side, stop and re-plan because that would materially change the data lifecycle.

## References

- Frame brief: `context/changes/import-review-workflow-enhancements/frame.md`
- User notes: `context/foundation/resources/enhancements-notes-after-first-roadmap.md`
- Import review table: `src/components/imports/TransactionReviewTable.tsx`
- Import workspace: `src/components/imports/ImportWorkspace.tsx`
- Review completion bar: `src/components/imports/ReviewCompletionBar.tsx`
- Import data helpers: `src/lib/imports/data.ts`
- Import validation: `src/lib/imports/validation.ts`
- Transaction update API: `src/pages/api/imports/transactions/[id].ts`
- Rule form for future UX-02: `src/components/rules/RuleForm.tsx`
- Rule manager for future UX-03: `src/components/rules/RuleManager.tsx`
- Current roadmap: `context/foundation/roadmap.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Roadmap Follow-Up Structure

#### Automated

- [x] 1.1 `rg -n "UX-01|UX-02|UX-03" context/foundation/roadmap.md` shows all three entries. — 1f8b01d
- [x] 1.2 `npx prettier --check context/foundation/roadmap.md` passes or formatting baseline is explicitly recorded. — 1f8b01d

#### Manual

- [x] 1.3 Confirm the roadmap reflects three separate follow-ups rather than one large mixed enhancement. — 1f8b01d
- [x] 1.4 Confirm `UX-01` is the first implementation target and `UX-02`/`UX-03` remain follow-ups. — 1f8b01d

### Phase 2: Bulk Category Update API

#### Automated

- [x] 2.1 `npm test -- tests/import-review.test.ts` passes with bulk update helper and route coverage.
- [x] 2.2 `npx astro check` passes.
- [x] 2.3 Targeted `npx eslint` passes for touched import API/helper/test files.

#### Manual

- [x] 2.4 Confirm the new bulk endpoint is category-only and does not create rules.
- [x] 2.5 Confirm the endpoint cannot update another user's transactions or categories.

### Phase 3: Batch-Oriented Review UI

#### Automated

- [ ] 3.1 `npm test -- tests/import-review.test.ts` passes with bulk review UI coverage.
- [ ] 3.2 `npx astro check` passes.
- [ ] 3.3 `npm run build` passes.
- [ ] 3.4 Targeted `npx eslint` passes for touched import UI files and tests.

#### Manual

- [ ] 3.5 A signed-in user can edit categories on multiple imported rows and save them with one action.
- [ ] 3.6 Unsaved changes are visibly counted before save.
- [ ] 3.7 Successful rows update in place after save.
- [ ] 3.8 Failed rows remain dirty and show row-level errors.
- [ ] 3.9 Review completion is blocked while unsaved category changes exist and works after saving or discarding them.

### Phase 4: Regression and Handoff

#### Automated

- [ ] 4.1 `npm test -- tests/import-review.test.ts` passes.
- [ ] 4.2 `npx astro check` passes.
- [ ] 4.3 `npm run build` passes.
- [ ] 4.4 Targeted lint passes for the touched files.

#### Manual

- [ ] 4.5 Review the plan brief and roadmap entries and confirm `UX-01`, `UX-02`, and `UX-03` remain separate.
- [ ] 4.6 Confirm the shipped app behavior addresses bulk category review without claiming to solve import rule application or density polish.
