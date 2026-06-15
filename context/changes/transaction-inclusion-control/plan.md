# Transaction Inclusion Control Implementation Plan

## Overview

Implement roadmap item `UX-05`: let a signed-in user exclude any imported transaction from budget calculations without deleting the imported row. Exclusion is persistent, reversible through an explicit restore action, compatible with the existing bulk review workflow, and reflected clearly in the dashboard. Separate excluded outflow and inflow values preserve reconciliation and prepare safely for future `S-05` cashflow typing without introducing that model early.

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

On the dashboard, excluded rows do not count toward budget totals or category usage. A reconciliation panel reports excluded outflows and excluded inflows separately so positive and negative records remain explainable without netting. The summary continues to distinguish reviewed trusted spend, reviewed uncategorized spend, incomplete-review spend, excluded outflow, and excluded inflow.

## What We're NOT Doing

- No exclusion reason taxonomy such as transfer, reimbursement, duplicate, or ignore.
- No free-text notes on why a row was excluded.
- No cashflow-type separation for income, reimbursements, or transfers; that remains future `S-05`.
- No automatic rule-driven exclusion.
- No silent autosave for exclusion changes.
- No deletion or mutation of source transaction fields such as date, title, recipient, or amount.
- No broad import-review filtering/sorting redesign beyond a collapsible excluded-transactions section.
- No preservation of the prior category or rule provenance after exclusion.
- No heuristic transfer of exclusions when a bank/month import is replaced.

## Implementation Approach

Add boolean `is_included` to `transactions`, defaulting to `true`. Expand the existing import-review transaction update contracts so single-row and bulk save flows persist category and inclusion changes together. Excluding a row atomically clears `category_id` and `categorized_by_rule_id`; restoring it leaves both null. Reuse the current dirty-state workflow instead of introducing a second save model.

For summaries, branch on exclusion before review status or category. Excluded rows never contribute to reviewed categorized spend, reviewed uncategorized spend, incomplete-review spend, warning state, category carry-over, or total imported budget spend. Negative excluded amounts add their absolute value to `excluded_outflow`; positive excluded amounts add to `excluded_inflow`; zero adds to neither.

## Critical Implementation Details

### Exclusion Overrides Review State

Once a transaction is excluded, it should bypass both reviewed and incomplete-review summary buckets immediately. This preserves user intent and prevents obvious transfers or duplicates from continuing to inflate incomplete-review warnings after the user has already marked them out of scope.

### Restore Is Explicit, Not Symmetric

The user chose a separate restore action rather than a simple toggle. Exclusion clears category and rule provenance, while restoration returns the row as included and uncategorized.

### Hidden-by-Default Review Surface

Excluded rows should not stay inline in the main review list by default. Render a collapsed "Excluded transactions" section below the main table, showing the excluded count and a distinct restore action when expanded.

### Inclusion Is Orthogonal to Cashflow Type

All imported rows may be excluded, including positive rows. Positive transactions currently produce zero spend because `toSpendAmount()` ignores amounts greater than or equal to zero. Split excluded outflow/inflow fields preserve information for `S-05` without treating inclusion as expense, income, reimbursement, or transfer classification.

### Completed Reviews and Replacement Imports

Saving inclusion corrections on a completed batch does not clear `review_completed_at`, matching the existing historical correction contract. Replacing a bank/month import creates replacement rows with the default included state and does not attempt unsafe heuristic matching against prior exclusions.

## Phase 1: Schema and Summary Semantics

### Overview

Add persistent transaction inclusion state and update the summary engine so excluded rows are removed from budget calculations but tracked in a separate excluded bucket.

### Changes Required:

#### 1. Transaction Inclusion Schema

**File**: `supabase/migrations/<timestamp>_transaction_inclusion_control.sql`

**Intent**: Persist whether an imported transaction should participate in budget calculations.

**Contract**: Add non-null boolean `is_included` with default `true`. Existing rows backfill to included. New and replacement import rows use the same default, so bank/month replacement intentionally resets prior exclusion decisions.

#### 2. Generated Types Refresh

**File**: `src/lib/database.types.ts`

**Intent**: Keep application contracts aligned with the transaction schema before helper and UI changes consume the new field.

**Contract**: Refresh generated table types so `transactions` exposes the inclusion field across `Row`, `Insert`, and `Update`.

#### 3. Summary Domain Extension

**File**: `src/lib/summary/data.ts`

**Intent**: Keep excluded transactions out of budget math while preserving a visible excluded bucket in summary results.

**Contract**: Extend `MonthlySummaryResult` with `excluded_outflow` and `excluded_inflow`. Excluded transactions bypass reviewed, uncategorized, incomplete, warning, total-spend, and carry-over paths. Aggregate negative values as positive outflow magnitude and positive values as inflow without netting.

#### 4. Summary Snapshot Contract

**File**: `src/lib/summary/data.ts`

**Intent**: Keep cached monthly summary snapshots structurally consistent with the live result.

**Contract**: Persist both excluded-flow fields in `summary_snapshot`. Keep `monthly_summaries.total_spent` equal to budget-relevant imported spend only.

#### 5. Summary Tests

**File**: `tests/monthly-summary-and-rules.test.ts`

**Intent**: Protect the budget-trust contract before the review UI starts mutating inclusion state.

**Contract**: Cover excluded negative, positive, and zero rows; reviewed and pending batches; historical carry-over; snapshot persistence; and replacement rows defaulting to included. Preserve existing behavior for included rows.

### Success Criteria:

#### Automated Verification:

- `npm test -- tests/monthly-summary-and-rules.test.ts` passes with split excluded-flow coverage.
- `npx astro check` passes after the type refresh and summary contract changes.
- Targeted `npx eslint src/lib/summary/data.ts tests/monthly-summary-and-rules.test.ts` passes.

#### Manual Verification:

- Review the migration and confirm all existing transactions default to included behavior after rollout.
- Confirm an excluded transaction no longer contributes to trusted spend, uncategorized spend, incomplete-review spend, or carry-over math.
- Confirm the summary contract exposes separate excluded outflow and inflow values without netting.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before changing import-review save contracts.

---

## Phase 2: Review Persistence Contracts

### Overview

Expand the transaction update contracts so inclusion state can be saved through the existing single-row and bulk review paths with the same ownership and partial-failure protections as category changes.

### Changes Required:

#### 1. Import Validation Contract

**File**: `src/lib/imports/validation.ts`

**Intent**: Validate inclusion updates centrally and keep category-only assumptions from leaking into the routes.

**Contract**: Replace category-only payload naming with a general review-update contract carrying `transaction_id`, nullable `category_id`, and boolean `is_included`. Keep `save_rule` isolated to the single-row shortcut and reject it in bulk updates.

#### 2. Import Data Helpers

**File**: `src/lib/imports/data.ts`

**Intent**: Persist inclusion state together with category changes for owned transactions only.

**Contract**: Exclusion atomically writes `is_included = false`, `category_id = null`, and `categorized_by_rule_id = null`. Restoration writes `is_included = true` while leaving category/provenance null. Preserve ownership validation and mixed failures, returning full persisted rows.

#### 3. Single-Row Transaction Route

**File**: `src/pages/api/imports/transactions/[id].ts`

**Intent**: Keep the row-level route consistent with the expanded transaction contract.

**Contract**: `PATCH` accepts the general review-update payload. Exclusion takes precedence over category input, and excluded rows cannot create a rule.

#### 4. Bulk Transaction Route

**File**: `src/pages/api/imports/transactions/bulk.ts`

**Intent**: Let the review table save multiple category and inclusion changes in one request.

**Contract**: `PATCH /api/imports/transactions/bulk` accepts general review updates and returns mixed `updated` and `failed` rows. Bulk updates never create or mutate rules.

#### 5. Import Contract Tests

**File**: `tests/import-review.test.ts`

**Intent**: Lock in ownership, single-row parity, uncategorized compatibility, and bulk partial-failure behavior for the new field.

**Contract**: Prove exclusion clears category/provenance, restore stays uncategorized, foreign rows remain protected, completed batches remain completed, mixed outcomes stay truthful, and rule apply-now skips excluded matches.

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

## Phase 3: Import Review UI

### Overview

Add exclusion and restore controls to import review while preserving the existing bulk dirty-state workflow and hiding excluded rows from the default list.

### Changes Required:

#### 1. Review Table Draft Model

**File**: `src/components/imports/TransactionReviewTable.tsx`

**Intent**: Let the review table draft inclusion changes alongside category changes using one save/discard workflow.

**Contract**: Replace category-only drafts with per-row review drafts. Exclusion supersedes and clears any category draft; restoration stages included plus null category. Dirty state remains derived from draft-versus-persisted values.

#### 2. Exclude Action in Main Review List

**File**: `src/components/imports/TransactionReviewTable.tsx`

**Intent**: Give the user an explicit action to remove an included row from budget calculations.

**Contract**: Every included row, including positive rows, exposes an exclusion action that stages a draft. Unsaved counts and save/discard controls cover category and inclusion edits together.

#### 3. Hidden-by-Default Excluded Rows and Restore Path

**File**: `src/components/imports/TransactionReviewTable.tsx`

**Intent**: Keep the default review view focused on budget-relevant rows while preserving reversibility.

**Contract**: Persisted or drafted-excluded rows leave the main table and appear in a collapsed section below it. The accessible section exposes count and a distinct restore action. Restore follows the same draft-and-save model and returns the row uncategorized.

#### 4. Workspace Merge and Notice Handling

**File**: `src/components/imports/ImportWorkspace.tsx`

**Intent**: Keep persisted inclusion state synchronized with local review data after successful saves.

**Contract**: Rename category-only fetch/merge helpers to review-update equivalents and merge full persisted rows. Preserve failed drafts and keep history switching, import commit, and review completion blocked by any unsaved review change.

#### 5. Completion Guard Alignment

**Files**:

- `src/components/imports/ImportWorkspace.tsx`
- `src/components/imports/ReviewCompletionBar.tsx`

**Intent**: Preserve the `UX-01` rule that review completion is blocked while unsaved review edits exist.

**Contract**: The completion guard copy and disabled state must cover unsaved inclusion changes as well as unsaved category changes.

#### 6. Review UI Tests

**File**: `tests/import-review.test.ts`

**Intent**: Protect the visible review workflow and restore semantics.

**Contract**: Cover positive-row eligibility, category-draft supersession, hidden main-list behavior, collapsed reveal, uncategorized restore, partial-save reconciliation, completed-batch stability, and generic completion-blocked copy.

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

## Phase 4: Dashboard Reconciliation

### Overview

Surface excluded spend clearly in the dashboard and complete final regression coverage so the feature is trustworthy from import review through monthly summary.

### Changes Required:

#### 1. Excluded Transactions Panel

**File**: `src/components/dashboard/ExcludedTransactionsPanel.tsx`

**Intent**: Reconcile intentionally ignored records without giving them equal weight to budget totals.

**Contract**: Add one panel labeled "Excluded transactions" showing outflow and inflow separately. Do not net the values. Keep top-level cards focused on budget-relevant totals.

#### 2. Summary Workspace Wiring

**File**: `src/components/dashboard/SummaryWorkspace.tsx`

**Intent**: Pass the new excluded bucket through the existing dashboard composition cleanly.

**Contract**: Pass `excluded_outflow` and `excluded_inflow` into the reconciliation panel. The imported-spend card continues to represent budget-relevant imported spend only.

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

- The dashboard shows excluded outflow and inflow separately from trusted categorized spend and incomplete-review spend.
- The top-level imported-spend total now reflects only budget-relevant imported rows.
- The dashboard copy still makes it clear that excluded rows remain in the imported record history even though they no longer affect budget calculations.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before browser verification.

---

## Phase 5: Focused Browser Verification

### Overview

Add one deterministic Playwright flow for the highest-risk cross-surface behavior.

### Changes Required:

#### 1. Transaction Inclusion E2E

**File**: `tests/e2e/transaction-inclusion-control.spec.ts`

**Intent**: Prove persisted inclusion remains truthful across import review, completed historical-batch editing, and dashboard reconciliation.

**Contract**: Following `/10x-e2e`, seed unique owned data and cover exclude, save, disappearance from the main table, expansion of the excluded section, restore as uncategorized, completed-status preservation, and separate dashboard excluded outflow/inflow values. Use role/label/text locators, state-based waits, and independent cleanup.

### Success Criteria:

#### Automated Verification:

- `npm run test:e2e -- tests/e2e/transaction-inclusion-control.spec.ts` passes.
- The E2E test uses no CSS/XPath locators and no `page.waitForTimeout()`.
- `npm run lint`, `npm run check`, and `npm run build` pass.

#### Manual Verification:

- Review the browser flow and confirm it covers the user-visible risk without duplicating lower-level Vitest coverage.

**Implementation Note**: Generate and review this phase with `/10x-e2e`, then pause for manual confirmation before impl-review or archive.

## Testing Strategy

### Unit Tests:

- General review-update validation for single-row and bulk contracts.
- Dirty-update derivation, category clearing, and uncategorized restoration.
- Split excluded-flow math proving excluded rows bypass reviewed, uncategorized, incomplete, and carry-over calculations.

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
8. Open `/dashboard` for that month and confirm excluded outflow and inflow appear separately while trusted and incomplete-review totals omit excluded rows.
9. Confirm reviewed uncategorized and incomplete-review messaging still behaves correctly for included rows.

## Performance Considerations

This slice stays within MVP-scale monthly batch sizes, so extending the existing synchronous review-save and summary-recompute paths is acceptable. Inclusion should ride the current row-update flow instead of introducing a separate synchronization path. If excluded-row counts grow large later, the hidden-by-default review surface can be optimized in a future UI slice rather than now.

## Migration Notes

Land the transaction schema migration and generated type refresh before changing import-review helpers or summary math. Existing transactions must backfill to the included state so historical summaries preserve current behavior until users intentionally exclude rows.

Because "Imported spend" changes to budget-relevant imported spend, UI copy and tests must update together. Inclusion remains independent from future `S-05` cashflow classification; split excluded-flow fields are observational preparation, not a type model.

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

### Phase 1: Schema and Summary Semantics

#### Automated

- [x] 1.1 `npm test -- tests/monthly-summary-and-rules.test.ts` passes with split excluded-flow coverage.
- [x] 1.2 `npx astro check` passes after the type refresh and summary contract changes.
- [x] 1.3 Targeted `npx eslint src/lib/summary/data.ts tests/monthly-summary-and-rules.test.ts` passes.

#### Manual

- [ ] 1.4 Review the migration and confirm all existing transactions default to included behavior after rollout.
- [ ] 1.5 Confirm an excluded transaction no longer contributes to trusted spend, uncategorized spend, incomplete-review spend, or carry-over math.
- [ ] 1.6 Confirm the summary contract exposes separate excluded outflow and inflow values without netting them.

### Phase 2: Review Persistence Contracts

#### Automated

- [ ] 2.1 `npm test -- tests/import-review.test.ts` passes with inclusion-contract coverage.
- [ ] 2.2 `npx astro check` passes.
- [ ] 2.3 Targeted `npx eslint src/lib/imports/validation.ts src/lib/imports/data.ts src/pages/api/imports/transactions/[id].ts src/pages/api/imports/transactions/bulk.ts tests/import-review.test.ts` passes.

#### Manual

- [ ] 2.4 Confirm both single-row and bulk routes can persist inclusion changes for owned transactions.
- [ ] 2.5 Confirm excluded rows are allowed to stay uncategorized.
- [ ] 2.6 Confirm bulk inclusion changes do not create or mutate categorization rules.

### Phase 3: Import Review UI

#### Automated

- [ ] 3.1 `npm test -- tests/import-review.test.ts` passes with inclusion UI coverage.
- [ ] 3.2 `npx astro check` passes.
- [ ] 3.3 Targeted `npx eslint src/components/imports/TransactionReviewTable.tsx src/components/imports/ImportWorkspace.tsx src/components/imports/ReviewCompletionBar.tsx tests/import-review.test.ts` passes.

#### Manual

- [ ] 3.4 A user can exclude multiple included rows and save those changes through the existing bulk-save workflow.
- [ ] 3.5 Excluded rows disappear from the default review list after persistence.
- [ ] 3.6 A user can reveal excluded rows and restore one intentionally through a dedicated restore action.
- [ ] 3.7 `Mark review complete` remains blocked while any category or inclusion changes are unsaved.

### Phase 4: Dashboard Reconciliation

#### Automated

- [ ] 4.1 `npm test -- tests/import-review.test.ts tests/monthly-summary-and-rules.test.ts` passes.
- [ ] 4.2 `npx astro check` passes.
- [ ] 4.3 `npm run build` passes.
- [ ] 4.4 Targeted lint passes for the touched dashboard, import-review, and summary files.

#### Manual

- [ ] 4.5 The dashboard shows excluded outflow and inflow separately from trusted categorized spend and incomplete-review spend.
- [ ] 4.6 The top-level imported-spend total now reflects only budget-relevant imported rows.
- [ ] 4.7 The dashboard copy still makes it clear that excluded rows remain in the imported record history even though they no longer affect budget calculations.

### Phase 5: Focused Browser Verification

#### Automated

- [ ] 5.1 `npm run test:e2e -- tests/e2e/transaction-inclusion-control.spec.ts` passes.
- [ ] 5.2 The E2E test uses no CSS/XPath locators and no `page.waitForTimeout()`.
- [ ] 5.3 `npm run lint`, `npm run check`, and `npm run build` pass.

#### Manual

- [ ] 5.4 Review the browser flow and confirm it covers the user-visible risk without duplicating lower-level Vitest coverage.
