# Import Review Bulk Categorization Implementation Plan

## Overview

Implement roadmap item `UX-01`: make import review category editing batch-oriented. A signed-in user should be able to change categories across many imported transactions, see a clear unsaved-change count, save all category changes with one action, retry only failed rows, discard unsaved changes, and be prevented from marking review complete while category drafts are pending.

## Current State Analysis

The import review flow already supports protected imports, persisted transaction categories, optional per-row rule creation, and review completion. The current review table is still row-local: each transaction has its own category draft, `Save category` button, busy state, and success message. This makes monthly review repetitive and creates trust friction because category changes can be left unsaved row by row.

### Key Discoveries

- Roadmap `UX-01` is ready for a dedicated plan and is scoped to bulk category review, while `UX-02` owns rule application/provenance: `context/foundation/roadmap.md`.
- The frame brief identified row-local review as a strong root cause: `context/changes/import-review-workflow-enhancements/frame.md`.
- `TransactionReviewTable` currently owns per-row `drafts`, `saveRuleById`, `busyId`, `successById`, and one `Save category` button per row: `src/components/imports/TransactionReviewTable.tsx`.
- `ImportWorkspace` currently calls one transaction PATCH at a time through `handleSaveCategory`: `src/components/imports/ImportWorkspace.tsx`.
- The existing single-row transaction route updates one owned transaction and may create a rule when `save_rule` is true: `src/pages/api/imports/transactions/[id].ts`.
- The current import data helper validates category ownership and updates one transaction via `updateTransactionCategoryAndMaybeRule`: `src/lib/imports/data.ts`.
- `ReviewCompletionBar` currently has no awareness of unsaved category drafts, so review can be completed while local category changes are pending: `src/components/imports/ReviewCompletionBar.tsx`.
- `tests/import-review.test.ts` already centralizes parser, helper, route, and static UI coverage for the import review workflow.

## Desired End State

A user reviewing an import batch can change category selects on multiple rows without saving each row. The table shows how many category changes are unsaved and exposes `Save all changes` plus `Discard changes` only when drafts differ from persisted transaction categories. Saving sends one category-only bulk request, updates successful rows in place, leaves failed rows dirty with row-level errors, and does not create categorization rules. Review completion is disabled with explanatory copy until all category drafts are saved or discarded.

## What We're NOT Doing

- No field-aware import rule creation.
- No current-batch rule application.
- No rule provenance badges.
- No change to dashboard rule management.
- No schema migration.
- No editing of transaction date, title, recipient, or amount.
- No automatic category autosave.
- No replacement of the existing single-row route; it remains available for the temporary row-level rule shortcut and future compatibility.

## Implementation Approach

Add a new category-only bulk update contract beside the existing single-row route. The backend validates `{ updates: [{ transaction_id, category_id }] }`, verifies category ownership, updates only transactions owned by the current user, and returns per-row `updated` and `failed` results. The frontend then changes the category review table from row-save behavior to derived dirty state and a single explicit save action. The existing `Save as rule` shortcut should remain row-level or separate until `UX-02`; it must not be folded into bulk category saving.

## Critical Implementation Details

### Dirty State Derivation

Dirty state must be derived by comparing the local draft category value to the latest persisted `transaction.category_id`. Do not store a separate `isDirty` flag that can drift after successful saves or after `transactions` are refreshed.

### Rule Shortcut Boundary

The bulk endpoint and `Save all changes` action are category-only. Existing import rule creation can remain as a row-level shortcut temporarily, but this plan must not create rules from bulk updates or change rule matching semantics.

### Completion Guard

`ReviewCompletionBar` should be disabled from the parent while unsaved category drafts exist. The copy should make the next action obvious: save or discard category changes first.

## Phase 1: Bulk Category Save Contract

### Overview

Add the backend contract for saving multiple category changes in one authenticated request while preserving per-row success and failure details.

### Changes Required:

#### 1. Bulk Validation Contract

**File**: `src/lib/imports/validation.ts`

**Intent**: Validate a bulk category update payload before any data writes happen.

**Contract**: Add a validator for an object with an `updates` array. Each update has `transaction_id` and nullable `category_id`. Reject non-object payloads, empty update arrays, malformed transaction IDs, and malformed category IDs using the existing `ImportError` pattern. Do not accept `save_rule`.

#### 2. Bulk Data Helper

**File**: `src/lib/imports/data.ts`

**Intent**: Save multiple owned transaction category changes and return row-level results.

**Contract**: Add a helper such as `updateImportTransactionCategories`. It should reuse active category lookup for non-null category ownership validation, update only rows matching both transaction ID and `user_id`, return `updated` transactions and `failed` `{ transaction_id, error }` rows, and never mark review complete or touch `categorization_rules`.

#### 3. Bulk API Route

**File**: `src/pages/api/imports/transactions/bulk.ts`

**Intent**: Give the UI one endpoint for `Save all changes`.

**Contract**: Add `PATCH /api/imports/transactions/bulk`. It must require import auth, read JSON through `readImportJsonPayload`, validate with the new bulk validator, call the bulk helper, return `200` when at least one row saves, include both `updated` and `failed`, and return a clear error when no requested row can be saved.

#### 4. Helper and Route Tests

**File**: `tests/import-review.test.ts`

**Intent**: Protect ownership, partial failure semantics, uncategorizing, and the no-rule side-effect boundary.

**Contract**: Add tests for successful multi-row category updates, nullable `category_id`, mixed success/failure results, rejecting another user's transaction, route response shape, and ensuring bulk category updates do not create rules.

### Success Criteria:

#### Automated Verification:

- `npm test -- tests/import-review.test.ts` passes with bulk validation, helper, and route coverage.
- `npx astro check` passes.
- Targeted `npx eslint src/lib/imports/validation.ts src/lib/imports/data.ts src/pages/api/imports/transactions/bulk.ts tests/import-review.test.ts` passes.

#### Manual Verification:

- Confirm the bulk endpoint accepts only `updates[].transaction_id` and `updates[].category_id`.
- Confirm the bulk endpoint does not accept `save_rule` and does not create categorization rules.
- Confirm updates are filtered by current user and cannot update another user's transactions or categories.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before changing the review table UI.

---

## Phase 2: Review Table Dirty-State UI

### Overview

Replace category row-save behavior with batch dirty state, unsaved-change controls, and row-level save result feedback.

### Changes Required:

#### 1. Review Table Props and State

**File**: `src/components/imports/TransactionReviewTable.tsx`

**Intent**: Let the table hold category drafts across many rows and submit only changed category assignments.

**Contract**: Replace `onSaveCategory` as the category-save path with an `onSaveCategoryChanges` callback that receives dirty updates. Continue accepting categories and transactions. Keep local category drafts keyed by transaction ID and derive dirty updates by comparing draft values to each persisted transaction category.

#### 2. Batch Save and Discard Controls

**File**: `src/components/imports/TransactionReviewTable.tsx`

**Intent**: Make unsaved work visible and controllable.

**Contract**: Show an unsaved-change count when dirty rows exist. Show `Save all changes` and `Discard changes` controls only while dirty rows exist. `Discard changes` resets category drafts and row errors/statuses back to the persisted transaction values.

#### 3. Row Status Feedback

**File**: `src/components/imports/TransactionReviewTable.tsx`

**Intent**: Preserve user trust after a partial bulk save.

**Contract**: After saving, show success status for rows returned in `updated`. For failed rows, keep their draft category selected, keep them dirty, and show a row-level error. A global error can exist for request-level failures, but per-row failures should remain attached to the affected rows.

#### 4. Temporary Rule Shortcut Boundary

**File**: `src/components/imports/TransactionReviewTable.tsx`

**Intent**: Avoid accidentally absorbing `UX-02` rule work into bulk category saving.

**Contract**: Keep existing `Save as rule` behavior as row-level or separate from the bulk category action if it remains visible. The bulk `Save all changes` action must not read or mutate rule draft state. If keeping the row-level rule shortcut creates too much UI confusion, document it as unchanged/temporary and leave full rule redesign to `UX-02`.

#### 5. UI Contract Tests

**File**: `tests/import-review.test.ts`

**Intent**: Lock in the visible batch-review model.

**Contract**: Add static/rendered UI tests for unsaved-change count, `Save all changes`, `Discard changes`, absence of category row-save buttons for category-only edits, and row-level status/error copy where practical.

### Success Criteria:

#### Automated Verification:

- `npm test -- tests/import-review.test.ts` passes with review table dirty-state coverage.
- `npx astro check` passes.
- Targeted `npx eslint src/components/imports/TransactionReviewTable.tsx tests/import-review.test.ts` passes.

#### Manual Verification:

- Confirm the table shows no unsaved-change controls before categories are changed.
- Confirm changing categories on multiple rows shows the correct unsaved-change count.
- Confirm `Discard changes` returns category selects to their persisted values.
- Confirm `Save all changes` is category-only and does not create rules.
- Confirm failed rows remain dirty and display row-level errors after a partial failure.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before wiring the workspace and completion guard.

---

## Phase 3: Workspace Wiring and Completion Guard

### Overview

Wire the bulk endpoint through the import workspace, update local transactions after successful saves, and block review completion while category drafts are unsaved.

### Changes Required:

#### 1. Bulk Save Workspace Handler

**File**: `src/components/imports/ImportWorkspace.tsx`

**Intent**: Bridge the table's dirty updates to the new bulk endpoint.

**Contract**: Add an `onSaveCategoryChanges` handler that sends dirty updates to `/api/imports/transactions/bulk`, updates local `transactions` with returned `updated` rows, and returns or throws failure metadata in a shape the table can use to keep failed rows dirty.

#### 2. Dirty-State Lift for Completion Guard

**File**: `src/components/imports/ImportWorkspace.tsx`

**Intent**: Let the completion bar know when unsaved category drafts exist.

**Contract**: Track whether the table currently has dirty category rows. Pass that state and a clear explanatory message to the completion bar. Do not allow `handleCompleteReview` to proceed while dirty category changes exist.

#### 3. Completion Bar Disabled State

**File**: `src/components/imports/ReviewCompletionBar.tsx`

**Intent**: Make the blocked completion state obvious and actionable.

**Contract**: Accept optional disabled state/copy props such as `isCompletionBlocked` and `completionBlockedReason`. Disable `Mark review complete` while blocked and show copy telling the user to save or discard category changes first.

#### 4. Workspace and Guard Tests

**File**: `tests/import-review.test.ts`

**Intent**: Verify the interaction contract between table, workspace, and completion guard.

**Contract**: Add focused tests for bulk route wiring shape, local transaction update after successful saves, failed row metadata preservation, and rendered completion-blocked copy/state.

### Success Criteria:

#### Automated Verification:

- `npm test -- tests/import-review.test.ts` passes with workspace and completion guard coverage.
- `npx astro check` passes.
- `npm run build` passes.
- Targeted `npx eslint src/components/imports/ImportWorkspace.tsx src/components/imports/ReviewCompletionBar.tsx tests/import-review.test.ts` passes.

#### Manual Verification:

- A signed-in user can change categories on multiple imported rows and save them once.
- Saved rows update in place and the unsaved count clears for those rows.
- Failed rows remain dirty and retryable.
- `Mark review complete` is disabled while category changes are unsaved.
- Review completion works after saving or discarding all category changes.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before final regression and handoff.

---

## Phase 4: Regression and Handoff

### Overview

Run final regression coverage, keep the roadmap and brief aligned, and leave `UX-02` clearly separate.

### Changes Required:

#### 1. Import Review Regression Coverage

**File**: `tests/import-review.test.ts`

**Intent**: Ensure the new bulk review workflow does not regress import preview, commit, replacement, parser coverage, existing single-row route compatibility, or review completion.

**Contract**: Keep existing Revolut and ING import tests passing. Keep replacement behavior covered. Keep existing rule creation tests passing if the temporary row-level shortcut remains available. Ensure no test expectation implies field-aware import rule creation or current-batch rule application shipped in this slice.

#### 2. Plan and Brief Alignment

**Files**:

- `context/changes/import-review-bulk-categorization/plan.md`
- `context/changes/import-review-bulk-categorization/plan-brief.md`
- `context/foundation/roadmap.md`

**Intent**: Make the handoff clear for implementation review and future `UX-02`.

**Contract**: The brief and roadmap should say `UX-01` delivers bulk category review only. Do not claim rule provenance, field-aware import rules, current-batch rule application, or density polish.

### Success Criteria:

#### Automated Verification:

- `npm test -- tests/import-review.test.ts` passes.
- `npx astro check` passes.
- `npm run build` passes.
- Targeted lint passes for the touched import API/UI/test files.

#### Manual Verification:

- Review the plan brief and confirm `UX-01` is scoped to bulk category review only.
- Confirm `UX-02` remains the future home for rule provenance, field-aware import rule creation, and current-batch rule application.
- Confirm the manual verification instructions for each implementation phase are specific enough to follow step by step.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before impl-review or archive.

## Testing Strategy

### Unit Tests:

- Bulk category update payload validation.
- Owned-category and owned-transaction filtering.
- Partial success/failure result shaping.
- Dirty update derivation from draft category values versus persisted transaction values.

### Integration Tests:

- Bulk route saves multiple category updates for the current user.
- Bulk route returns mixed updated/failed results.
- Import workspace sends dirty updates to the bulk endpoint and merges returned transactions locally.
- Completion guard blocks review completion while dirty category drafts exist.

### Manual Testing Steps:

1. Sign in and open `/imports` with an existing import batch.
2. Change categories on at least three rows.
3. Confirm the unsaved-change count matches the number of changed rows.
4. Use `Discard changes` and confirm selects return to persisted values.
5. Change multiple rows again and click `Save all changes`.
6. Confirm successful rows update in place and the unsaved count clears.
7. Simulate or trigger a failed save and confirm failed rows remain dirty with row-level errors.
8. Change a row and confirm `Mark review complete` is disabled until changes are saved or discarded.
9. Confirm any visible rule shortcut remains separate from `Save all changes`.

## Performance Considerations

Bulk saves are MVP-scale and should handle a normal monthly import batch synchronously. Updating rows one by one behind a single request is acceptable for expected batch sizes and keeps per-row failure reporting straightforward. If import batches grow substantially later, a future performance slice can revisit server-side bulk update strategy.

## Migration Notes

No database migration is expected. This change uses existing `transactions.category_id`, existing category ownership rules, and existing import batch review state.

## References

- Roadmap item: `context/foundation/roadmap.md`
- Frame brief: `context/changes/import-review-workflow-enhancements/frame.md`
- Import review table: `src/components/imports/TransactionReviewTable.tsx`
- Import workspace: `src/components/imports/ImportWorkspace.tsx`
- Review completion bar: `src/components/imports/ReviewCompletionBar.tsx`
- Single-row transaction route: `src/pages/api/imports/transactions/[id].ts`
- Import data helpers: `src/lib/imports/data.ts`
- Import validation: `src/lib/imports/validation.ts`
- Import HTTP helpers: `src/lib/imports/http.ts`
- Import tests: `tests/import-review.test.ts`
- Rule helpers for out-of-scope boundary: `src/lib/rules/data.ts`
- Accepted lessons: `context/foundation/lessons.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append `— <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Bulk Category Save Contract

#### Automated

- [x] 1.1 `npm test -- tests/import-review.test.ts` passes with bulk validation, helper, and route coverage.
- [x] 1.2 `npx astro check` passes.
- [x] 1.3 Targeted `npx eslint src/lib/imports/validation.ts src/lib/imports/data.ts src/pages/api/imports/transactions/bulk.ts tests/import-review.test.ts` passes.

#### Manual

- [x] 1.4 Confirm the bulk endpoint accepts only `updates[].transaction_id` and `updates[].category_id`.
- [x] 1.5 Confirm the bulk endpoint does not accept `save_rule` and does not create categorization rules.
- [x] 1.6 Confirm updates are filtered by current user and cannot update another user's transactions or categories.

### Phase 2: Review Table Dirty-State UI

#### Automated

- [x] 2.1 `npm test -- tests/import-review.test.ts` passes with review table dirty-state coverage.
- [x] 2.2 `npx astro check` passes.
- [x] 2.3 Targeted `npx eslint src/components/imports/TransactionReviewTable.tsx tests/import-review.test.ts` passes.

#### Manual

- [x] 2.4 Confirm the table shows no unsaved-change controls before categories are changed.
- [x] 2.5 Confirm changing categories on multiple rows shows the correct unsaved-change count.
- [x] 2.6 Confirm `Discard changes` returns category selects to their persisted values.
- [x] 2.7 Confirm `Save all changes` is category-only and does not create rules.
- [x] 2.8 Confirm failed rows remain dirty and display row-level errors after a partial failure.

### Phase 3: Workspace Wiring and Completion Guard

#### Automated

- [x] 3.1 `npm test -- tests/import-review.test.ts` passes with workspace and completion guard coverage. — c43d4e8
- [x] 3.2 `npx astro check` passes. — c43d4e8
- [x] 3.3 `npm run build` passes. — c43d4e8
- [x] 3.4 Targeted `npx eslint src/components/imports/ImportWorkspace.tsx src/components/imports/ReviewCompletionBar.tsx tests/import-review.test.ts` passes. — c43d4e8

#### Manual

- [x] 3.5 A signed-in user can change categories on multiple imported rows and save them once. — c43d4e8
- [x] 3.6 Saved rows update in place and the unsaved count clears for those rows. — c43d4e8
- [x] 3.7 Failed rows remain dirty and retryable. — c43d4e8
- [x] 3.8 `Mark review complete` is disabled while category changes are unsaved. — c43d4e8
- [x] 3.9 Review completion works after saving or discarding all category changes. — c43d4e8

### Phase 4: Regression and Handoff

#### Automated

- [x] 4.1 `npm test -- tests/import-review.test.ts` passes.
- [x] 4.2 `npx astro check` passes.
- [x] 4.3 `npm run build` passes.
- [x] 4.4 Targeted lint passes for the touched import API/UI/test files.

#### Manual

- [x] 4.5 Review the plan brief and confirm `UX-01` is scoped to bulk category review only.
- [x] 4.6 Confirm `UX-02` remains the future home for rule provenance, field-aware import rule creation, and current-batch rule application.
- [x] 4.7 Confirm the manual verification instructions for each implementation phase are specific enough to follow step by step.
