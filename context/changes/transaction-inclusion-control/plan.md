# Transaction Inclusion Control Implementation Plan

## Overview

Implement roadmap item `UX-05`: let a signed-in user exclude imported transactions from budget calculations without deleting the imported row. Exclusion must be persistent, reversible through an explicit restore action, compatible with the existing bulk review workflow, and reflected clearly in the dashboard so budget totals remain trustworthy and reconcilable.

## Current State Analysis

The import-review flow already supports protected imports, persisted transactions, bulk category saves, optional row-level rule creation, and review completion. The dashboard summary already distinguishes trusted reviewed spend from incomplete-review spend. What is missing is a way to preserve imported rows that should not count toward the budget at all, such as transfers, duplicates, or other rows the user intentionally wants outside budget calculations.

Today the transaction model has no inclusion state. The only persisted transaction edit path is `category_id`, and the summary service counts every negative imported transaction into either reviewed or incomplete buckets. That means `UX-05` is a domain contract change across schema, import-review save contracts, summary math, and the review/dashboard UI.

### Key Discoveries

- The roadmap defines `UX-05` as excluding imported rows from budget calculations without deleting the source statement row, and it explicitly positions this before future cashflow-type separation: `context/foundation/roadmap.md`.
- The `transactions` table currently stores only source data plus optional category assignment; there is no inclusion or exclusion field yet: `supabase/migrations/20260526103000_finance_domain_foundation.sql`, `src/lib/database.types.ts`.
- Import review bulk editing already exists and is the strongest workflow fit for inclusion changes because users can already draft multiple row changes and save them together: `src/components/imports/TransactionReviewTable.tsx`, `src/components/imports/ImportWorkspace.tsx`.
- Single-row and bulk transaction routes currently update only `category_id`, so the transaction update contract must expand rather than bolt on a separate exclusion endpoint: `src/pages/api/imports/transactions/[id].ts`, `src/pages/api/imports/transactions/bulk.ts`, `src/lib/imports/data.ts`.
- The summary service currently counts every negative selected-month transaction into reviewed categorized, reviewed uncategorized, or incomplete-review totals, with no escape hatch for intentionally excluded rows: `src/lib/summary/data.ts`.
- The dashboard UI is already built around separate trust buckets such as "Imported spend", "Trusted categorized spend", and "Incomplete review spend", so an explicit excluded bucket fits the existing mental model better than silently hiding excluded rows: `src/components/dashboard/SummaryCards.tsx`, `src/components/dashboard/IncompleteReviewNotice.tsx`, `src/components/dashboard/CategoryUsageTable.tsx`.
- Existing tests centralize import-review and summary contract coverage in `tests/import-review.test.ts` and `tests/monthly-summary-and-rules.test.ts`, which is the right place to harden this slice.

## Desired End State

A signed-in user reviewing imported transactions can exclude a row from budget calculations without deleting it. The excluded state persists on the transaction, can be saved in the same draft-and-bulk-save workflow as category edits, and removes that row from both trusted category totals and incomplete-review spend calculations. Excluded rows are hidden from the default import-review list, but the UI provides a dedicated restore path so the user can re-include a row intentionally.

On the dashboard, excluded rows do not count toward budget totals or category usage, but the user can still see a separate excluded amount so the imported statement remains explainable. The summary continues to distinguish reviewed trusted spend, reviewed uncategorized spend, incomplete-review spend, and now excluded spend as a separate explicit bucket.

## What We're NOT Doing

- No exclusion reason taxonomy such as transfer, reimbursement, duplicate, or ignore.
- No free-text notes on why a row was excluded.
- No cashflow-type separation for income, reimbursements, or transfers; that remains future `S-05`.
- No automatic rule-driven exclusion.
- No silent autosave for exclusion changes.
- No deletion or mutation of source transaction fields such as date, title, recipient, or amount.
- No broad import-review filtering/sorting redesign beyond the minimum excluded-row visibility needed for this slice.

## Implementation Approach

Add one persistent inclusion field to `transactions`, defaulting to included. Expand the existing import-review transaction update contracts so both single-row and bulk save flows can persist category changes and inclusion changes together. Reuse the current dirty-state workflow in the review table instead of introducing a second save model.

For summaries, treat excluded rows as intentionally out of scope for budget math regardless of whether the batch review is complete. They should never contribute to reviewed categorized spend, reviewed uncategorized spend, incomplete-review spend, category carry-over math, or total imported budget spend. Instead, compute them into a separate excluded bucket that the dashboard surfaces explicitly for reconciliation and auditability.

## Critical Implementation Details

### Exclusion Overrides Review State

Once a transaction is excluded, it should bypass both reviewed and incomplete-review summary buckets immediately. This preserves user intent and prevents obvious transfers or duplicates from continuing to inflate incomplete-review warnings after the user has already marked them out of scope.

### Restore Is Explicit, Not Symmetric

The user chose a separate restore action rather than a simple toggle. The review UI therefore needs a clear way to reveal excluded rows and restore them intentionally, instead of letting hidden rows flip back to included accidentally through the default table controls.

### Hidden-by-Default Review Surface

Excluded rows should not stay inline in the main review list by default. The import-review surface needs a dedicated excluded-row view or reveal control so the default workflow stays focused on included rows that still affect the budget, while preserving a clear audit trail and restore path.

## Phase 1: Transaction Inclusion Schema and Summary Contract

### Overview

Add persistent transaction inclusion state and update the summary engine so excluded rows are removed from budget calculations but tracked in a separate excluded bucket.

### Changes Required:

#### 1. Transaction Inclusion Schema

**File**: `supabase/migrations/<timestamp>_transaction_inclusion_control.sql`

**Intent**: Persist whether an imported transaction should participate in budget calculations.

**Contract**: Add a non-null inclusion field to `transactions` with a default included state. The field should support simple MVP semantics only: included versus excluded. Existing transactions must backfill to included automatically so historical data keeps current behavior until the user changes it.

#### 2. Generated Types Refresh

**File**: `src/lib/database.types.ts`

**Intent**: Keep application contracts aligned with the transaction schema before helper and UI changes consume the new field.

**Contract**: Refresh generated table types so `transactions` exposes the inclusion field across `Row`, `Insert`, and `Update`.

#### 3. Summary Domain Extension

**File**: `src/lib/summary/data.ts`

**Intent**: Keep excluded transactions out of budget math while preserving a visible excluded bucket in summary results.

**Contract**: Extend `MonthlySummaryResult` with an explicit excluded-spend field. During selected-month and historical aggregation, excluded transactions must not contribute to reviewed categorized spend, reviewed uncategorized spend, incomplete-review spend, total imported budget spend, or carry-over calculations. They should instead aggregate into the separate excluded amount for the selected month.

#### 4. Summary Snapshot Contract

**File**: `src/lib/summary/data.ts`

**Intent**: Keep cached monthly summary snapshots structurally consistent with the live result.

**Contract**: Include the excluded-spend field in the summary snapshot written to `monthly_summaries`, alongside the existing reviewed and incomplete buckets.

#### 5. Summary Tests

**File**: `tests/monthly-summary-and-rules.test.ts`

**Intent**: Protect the budget-trust contract before the review UI starts mutating inclusion state.

**Contract**: Add coverage proving that excluded negative transactions are removed from trusted, uncategorized, and incomplete buckets; bypass carry-over calculations; and accumulate only in the excluded bucket. Keep existing reviewed-versus-incomplete behaviors unchanged for included rows.

### Success Criteria:

#### Automated Verification:

- `npm test -- tests/monthly-summary-and-rules.test.ts` passes with excluded-bucket coverage.
- `npx astro check` passes after the type refresh and summary contract changes.
- Targeted `npx eslint src/lib/summary/data.ts tests/monthly-summary-and-rules.test.ts` passes.

#### Manual Verification:

- Review the migration and confirm all existing transactions default to included behavior after rollout.
- Confirm an excluded transaction no longer contributes to trusted spend, uncategorized spend, incomplete-review spend, or carry-over math.
- Confirm the summary contract now exposes excluded spend as its own top-level bucket instead of silently dropping excluded rows.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before changing import-review save contracts.

---

## Phase 2: Import Review Save Contracts

### Overview

Expand the transaction update contracts so inclusion state can be saved through the existing single-row and bulk review paths with the same ownership and partial-failure protections as category changes.

### Changes Required:

#### 1. Import Validation Contract

**File**: `src/lib/imports/validation.ts`

**Intent**: Validate inclusion updates centrally and keep category-only assumptions from leaking into the routes.

**Contract**: Extend the single-row and bulk import-review payload validators so transaction updates can carry both nullable `category_id` and the inclusion field. Keep `save_rule` isolated to the single-row rule shortcut path and disallow it from the bulk contract.

#### 2. Import Data Helpers

**File**: `src/lib/imports/data.ts`

**Intent**: Persist inclusion state together with category changes for owned transactions only.

**Contract**: Expand the single-row helper and the bulk helper so they update the inclusion field alongside `category_id`. Preserve existing category ownership validation, row-level failure behavior, and no-rule side-effect boundaries for bulk saves. The returned transaction payloads must include the inclusion field so UI state can refresh from persisted data.

#### 3. Single-Row Transaction Route

**File**: `src/pages/api/imports/transactions/[id].ts`

**Intent**: Keep the row-level route consistent with the expanded transaction contract.

**Contract**: `PATCH` continues to support row-level category update and optional rule creation, but now also accepts the inclusion field as part of the same transaction update contract.

#### 4. Bulk Transaction Route

**File**: `src/pages/api/imports/transactions/bulk.ts`

**Intent**: Let the review table save multiple category and inclusion changes in one request.

**Contract**: `PATCH /api/imports/transactions/bulk` accepts an array of transaction updates that may include category changes, inclusion changes, or both. It returns mixed `updated` and `failed` rows using the existing partial-failure pattern.

#### 5. Import Contract Tests

**File**: `tests/import-review.test.ts`

**Intent**: Lock in ownership, single-row parity, uncategorized compatibility, and bulk partial-failure behavior for the new field.

**Contract**: Add tests proving that inclusion changes persist through both routes, another user's rows still cannot be mutated, excluded rows can remain uncategorized, and bulk updates preserve mixed success/failure semantics without touching rule creation.

### Success Criteria:

#### Automated Verification:

- `npm test -- tests/import-review.test.ts` passes with inclusion-contract coverage.
- `npx astro check` passes.
- Targeted `npx eslint src/lib/imports/validation.ts src/lib/imports/data.ts src/pages/api/imports/transactions/[id].ts src/pages/api/imports/transactions/bulk.ts tests/import-review.test.ts` passes.

#### Manual Verification:

- Confirm both single-row and bulk routes can persist inclusion changes for owned transactions.
- Confirm excluded rows are allowed to stay uncategorized.
- Confirm bulk inclusion changes do not create or mutate categorization rules.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before changing the import-review UI.

---

## Phase 3: Import Review Inclusion UI

### Overview

Add exclusion and restore controls to import review while preserving the existing bulk dirty-state workflow and hiding excluded rows from the default list.

### Changes Required:

#### 1. Review Table Draft Model

**File**: `src/components/imports/TransactionReviewTable.tsx`

**Intent**: Let the review table draft inclusion changes alongside category changes using one save/discard workflow.

**Contract**: Expand local draft state and dirty-update derivation so a row can have pending category changes, pending inclusion changes, or both. Dirty state must continue to be derived by comparing local drafts to persisted transaction data rather than tracking a separate mutable flag.

#### 2. Exclude Action in Main Review List

**File**: `src/components/imports/TransactionReviewTable.tsx`

**Intent**: Give the user an explicit action to remove an included row from budget calculations.

**Contract**: Included rows in the default review list expose an exclusion action that updates local draft state rather than saving immediately. The unsaved-change count and bulk `Save all changes` / `Discard changes` controls must account for inclusion edits the same way they already account for category edits.

#### 3. Hidden-by-Default Excluded Rows and Restore Path

**File**: `src/components/imports/TransactionReviewTable.tsx`

**Intent**: Keep the default review view focused on budget-relevant rows while preserving reversibility.

**Contract**: Excluded rows are hidden from the default review list. The component must provide a dedicated reveal surface for excluded rows and a distinct restore action that returns a row to included state. Restore should follow the same draft-and-save model instead of bypassing bulk save.

#### 4. Workspace Merge and Notice Handling

**File**: `src/components/imports/ImportWorkspace.tsx`

**Intent**: Keep persisted inclusion state synchronized with local review data after successful saves.

**Contract**: Expand workspace save helpers so successful bulk and single-row updates merge persisted inclusion state back into `transactions`, preserve failure metadata for dirty rows, and keep review-completion blocking tied to any unsaved transaction changes, not category-only changes.

#### 5. Completion Guard Alignment

**Files**:

- `src/components/imports/ImportWorkspace.tsx`
- `src/components/imports/ReviewCompletionBar.tsx`

**Intent**: Preserve the `UX-01` rule that review completion is blocked while unsaved review edits exist.

**Contract**: The completion guard copy and disabled state must cover unsaved inclusion changes as well as unsaved category changes.

#### 6. Review UI Tests

**File**: `tests/import-review.test.ts`

**Intent**: Protect the visible review workflow and restore semantics.

**Contract**: Add rendered/helper coverage for excluded rows being hidden by default, the excluded-row reveal path, restore action visibility, inclusion changes contributing to dirty-state counts, persisted inclusion merges after save, and completion-blocked copy for any unsaved review change.

### Success Criteria:

#### Automated Verification:

- `npm test -- tests/import-review.test.ts` passes with inclusion UI coverage.
- `npx astro check` passes.
- Targeted `npx eslint src/components/imports/TransactionReviewTable.tsx src/components/imports/ImportWorkspace.tsx src/components/imports/ReviewCompletionBar.tsx tests/import-review.test.ts` passes.

#### Manual Verification:

- A user can exclude multiple included rows and save those changes through the existing bulk-save workflow.
- Excluded rows disappear from the default review list after persistence.
- A user can reveal excluded rows and restore one intentionally through a dedicated restore action.
- `Mark review complete` remains blocked while any category or inclusion changes are unsaved.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before updating dashboard presentation.

---

## Phase 4: Dashboard Presentation and Regression Handoff

### Overview

Surface excluded spend clearly in the dashboard and complete final regression coverage so the feature is trustworthy from import review through monthly summary.

### Changes Required:

#### 1. Summary Cards Update

**File**: `src/components/dashboard/SummaryCards.tsx`

**Intent**: Make excluded spend visible at the same abstraction level as the other top-line budget buckets.

**Contract**: Add an excluded-spend card or equivalent top-level summary element. The existing imported-spend label should continue to represent budget-relevant imported spend only, while excluded spend is shown separately for reconciliation.

#### 2. Summary Workspace Wiring

**File**: `src/components/dashboard/SummaryWorkspace.tsx`

**Intent**: Pass the new excluded bucket through the existing dashboard composition cleanly.

**Contract**: Consume the extended `MonthlySummaryResult` and render the excluded-spend presentation alongside the existing trusted and incomplete-review surfaces.

#### 3. Dashboard Messaging Alignment

**Files**:

- `src/components/dashboard/IncompleteReviewNotice.tsx`
- `src/components/dashboard/CategoryUsageTable.tsx`

**Intent**: Keep the summary copy precise now that there is a third non-category bucket beside reviewed uncategorized and incomplete spend.

**Contract**: Update wording where needed so users can distinguish trusted reviewed totals, incomplete-review spend, reviewed uncategorized spend, and excluded spend without misreading the budget math.

#### 4. Cross-Flow Regression Coverage

**Files**:

- `tests/monthly-summary-and-rules.test.ts`
- `tests/import-review.test.ts`

**Intent**: Ensure the feature stays coherent across both the review and dashboard surfaces.

**Contract**: Keep regression coverage proving that an excluded row saved in import review would be omitted from budget totals and visible only through the excluded bucket in dashboard results and UI-facing summary surfaces.

### Success Criteria:

#### Automated Verification:

- `npm test -- tests/import-review.test.ts tests/monthly-summary-and-rules.test.ts` passes.
- `npx astro check` passes.
- `npm run build` passes.
- Targeted lint passes for the touched dashboard, import-review, and summary files.

#### Manual Verification:

- The dashboard shows excluded spend separately from trusted categorized spend and incomplete-review spend.
- The top-level imported-spend total now reflects only budget-relevant imported rows.
- The dashboard copy still makes it clear that excluded rows remain in the imported record history even though they no longer affect budget calculations.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before impl-review or archive.

## Testing Strategy

### Unit Tests:

- Transaction update payload validation for inclusion state in both single-row and bulk save contracts.
- Dirty-update derivation for category plus inclusion drafts.
- Summary bucket math proving excluded rows bypass reviewed, uncategorized, incomplete, and carry-over calculations.

### Integration Tests:

- Single-row and bulk import-review routes persist inclusion changes for owned transactions only.
- Import workspace merges persisted inclusion state back into local transactions after successful saves.
- Dashboard summary recomputation returns excluded spend separately from budget-relevant totals.

### Manual Testing Steps:

1. Sign in and open `/imports` with an existing import batch.
2. Exclude at least two rows from the default review list without saving yet.
3. Confirm the unsaved-change count reflects those draft exclusion changes.
4. Save all review changes and confirm the excluded rows are no longer visible in the default list.
5. Reveal excluded rows and restore one row through the dedicated restore path.
6. Save again and confirm the restored row returns to the default review list.
7. Mark another row excluded in a batch that is still not review-complete.
8. Open `/dashboard` for that month and confirm the excluded amount appears separately while trusted and incomplete-review totals no longer include the excluded row.
9. Confirm reviewed uncategorized and incomplete-review messaging still behaves correctly for included rows.

## Performance Considerations

This slice stays within MVP-scale monthly batch sizes, so extending the existing synchronous review-save and summary-recompute paths is acceptable. Inclusion should ride the current row-update flow instead of introducing a separate synchronization path. If excluded-row counts grow large later, the hidden-by-default review surface can be optimized in a future UI slice rather than now.

## Migration Notes

Land the transaction schema migration and generated type refresh before changing import-review helpers or summary math. Existing transactions must backfill to the included state so historical summaries preserve current behavior until users intentionally exclude rows.

Because the dashboard meaning of "Imported spend" changes to budget-relevant imported spend, UI copy and tests need to be updated together to avoid a silent semantic regression.

## References

- Roadmap item: `context/foundation/roadmap.md`
- Import review bulk-save plan: `context/archive/2026-06-01-import-review-bulk-categorization/plan.md`
- Monthly summary plan: `context/archive/2026-05-30-monthly-summary-and-rules/plan.md`
- Transaction review table: `src/components/imports/TransactionReviewTable.tsx`
- Import workspace: `src/components/imports/ImportWorkspace.tsx`
- Review completion bar: `src/components/imports/ReviewCompletionBar.tsx`
- Single-row transaction route: `src/pages/api/imports/transactions/[id].ts`
- Bulk transaction route: `src/pages/api/imports/transactions/bulk.ts`
- Import validation and data helpers: `src/lib/imports/validation.ts`, `src/lib/imports/data.ts`
- Summary domain: `src/lib/summary/data.ts`
- Dashboard UI: `src/components/dashboard/SummaryWorkspace.tsx`, `src/components/dashboard/SummaryCards.tsx`, `src/components/dashboard/IncompleteReviewNotice.tsx`, `src/components/dashboard/CategoryUsageTable.tsx`
- Accepted lessons: `context/foundation/lessons.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` - <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Transaction Inclusion Schema and Summary Contract

#### Automated

- [x] 1.1 `npm test -- tests/monthly-summary-and-rules.test.ts` passes with excluded-bucket coverage.
- [x] 1.2 `npx astro check` passes after the type refresh and summary contract changes.
- [x] 1.3 Targeted `npx eslint src/lib/summary/data.ts tests/monthly-summary-and-rules.test.ts` passes.

#### Manual

- [x] 1.4 Review the migration and confirm all existing transactions default to included behavior after rollout.
- [x] 1.5 Confirm an excluded transaction no longer contributes to trusted spend, uncategorized spend, incomplete-review spend, or carry-over math.
- [x] 1.6 Confirm the summary contract now exposes excluded spend as its own top-level bucket instead of silently dropping excluded rows.

### Phase 2: Import Review Save Contracts

#### Automated

- [x] 2.1 `npm test -- tests/import-review.test.ts` passes with inclusion-contract coverage.
- [x] 2.2 `npx astro check` passes.
- [x] 2.3 Targeted `npx eslint src/lib/imports/validation.ts src/lib/imports/data.ts src/pages/api/imports/transactions/[id].ts src/pages/api/imports/transactions/bulk.ts tests/import-review.test.ts` passes.

#### Manual

- [x] 2.4 Confirm both single-row and bulk routes can persist inclusion changes for owned transactions.
- [x] 2.5 Confirm excluded rows are allowed to stay uncategorized.
- [x] 2.6 Confirm bulk inclusion changes do not create or mutate categorization rules.

### Phase 3: Import Review Inclusion UI

#### Automated

- [x] 3.1 `npm test -- tests/import-review.test.ts` passes with inclusion UI coverage.
- [x] 3.2 `npx astro check` passes.
- [x] 3.3 Targeted `npx eslint src/components/imports/TransactionReviewTable.tsx src/components/imports/ImportWorkspace.tsx src/components/imports/ReviewCompletionBar.tsx tests/import-review.test.ts` passes.

#### Manual

- [x] 3.4 A user can exclude multiple included rows and save those changes through the existing bulk-save workflow.
- [x] 3.5 Excluded rows disappear from the default review list after persistence.
- [x] 3.6 A user can reveal excluded rows and restore one intentionally through a dedicated restore action.
- [x] 3.7 `Mark review complete` remains blocked while any category or inclusion changes are unsaved.

### Phase 4: Dashboard Presentation and Regression Handoff

#### Automated

- [x] 4.1 `npm test -- tests/import-review.test.ts tests/monthly-summary-and-rules.test.ts` passes.
- [x] 4.2 `npx astro check` passes.
- [x] 4.3 `npm run build` passes.
- [x] 4.4 Targeted lint passes for the touched dashboard, import-review, and summary files.

#### Manual

- [x] 4.5 The dashboard shows excluded spend separately from trusted categorized spend and incomplete-review spend.
- [x] 4.6 The top-level imported-spend total now reflects only budget-relevant imported rows.
- [x] 4.7 The dashboard copy still makes it clear that excluded rows remain in the imported record history even though they no longer affect budget calculations.
