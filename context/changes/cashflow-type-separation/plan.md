# Cashflow Type Separation Implementation Plan

## Overview

Implement roadmap slice S-05 by adding explicit cashflow types to imported transactions: `expense`, `income`, `reimbursement`, and `transfer`. The change preserves raw signed bank amounts while making budget math type-aware: expenses drive category usage, income and reimbursements increase the income basis, and transfers stay neutral.

## Current State Analysis

The current product stores imported transactions as source rows with signed `amount`, optional `category_id`, optional `categorized_by_rule_id`, and `is_included`. Summary code derives spend from sign: negative amounts become absolute spend, positive included amounts are ignored for income, and excluded rows are reported separately as excluded inflow/outflow.

The import review UI has only two semantic states: included rows are categorized or left uncategorized, and excluded rows are kept in history but removed from budget math. There is no valid way to classify salary, refunds, reimbursements, or bank transfers without either forcing them through the expense category model or excluding them.

## Desired End State

Imported transactions carry a required `cashflow_type` with values `expense`, `income`, `reimbursement`, or `transfer`. New and existing rows are defaulted by amount sign: negative rows become `expense`, positive rows become `income`, and users can correct reimbursements/transfers during review.

After implementation:

- Expenses are the only cashflow type that can have `category_id` or `categorized_by_rule_id`.
- Income and reimbursements from completed reviewed batches add to manual monthly income for category limits and carry-over.
- Transfers are included source rows visible in import review/history but do not affect income, spend, category usage, incomplete-review spend, or carry-over.
- Excluded rows still bypass all budget math before cashflow-specific branching.
- Categorization rules remain expense-only.

### Key Discoveries:

- `transactions` has no cashflow concept beyond signed `amount`; generated types mirror this in `src/lib/database.types.ts`.
- Import DTOs currently carry only `transaction_date`, `title`, `recipient`, and `amount` in `src/lib/imports/types.ts`.
- Review updates currently mutate only `category_id`, `categorized_by_rule_id`, and `is_included` in `src/lib/imports/data.ts`.
- Summary math currently derives spend through sign-only logic in `src/lib/summary/data.ts`.
- Historical plans established important invariants: source import rows remain authoritative, review completion is the trust boundary, exclusion is not classification, and mixed-result bulk saves remain valid.

## What We're NOT Doing

- We are not adding cashflow-type rules or auto-classification beyond amount-sign defaults.
- We are not offsetting reimbursements against original expense categories.
- We are not reconciling transfers across accounts or matching both sides of a transfer.
- We are not renaming `monthly_incomes`, `monthly_incomes.amount`, or `is_estimated` in the database.
- We are not adding a full cashflow dashboard, chart, or transfer analytics surface.
- We are not changing auth, RLS, or ownership semantics.

## Implementation Approach

Add the cashflow type as a persisted transaction contract first, then thread it through import parsing, validation, commit/restore, review updates, UI drafts, and summary calculations. Keep the existing signed `amount` as the bank source value and make all derived budget math choose rows by `cashflow_type` plus review/inclusion status.

## Critical Implementation Details

### State Sequencing

Exclusion remains the highest-precedence state. If `is_included` is false, the row must clear `category_id` and `categorized_by_rule_id` and bypass all summary buckets before cashflow type is considered.

### User Experience Spec

Changing a row from `expense` to any non-expense type must clear category/rule provenance immediately in the draft and persisted update. Restoring or changing the row back to `expense` should leave it uncategorized in this phase.

### Debug & Observability

Summary verification should compare the saved `monthly_summaries.summary_snapshot` against the API response because snapshots are derived cache output, not source of truth.

## Phase 1: Data Contract and Backfill

### Overview

Add the persisted cashflow type contract, deterministic backfill, TypeScript types, and parser defaults before review or summary logic starts depending on it.

### Changes Required:

#### 1. Transaction Schema Migration

**File**: `supabase/migrations/<timestamp>_cashflow_type_separation.sql`

**Intent**: Add a required cashflow type column to imported transactions without changing raw signed amount storage.

**Contract**: `transactions.cashflow_type text not null default 'expense'` with a check constraint limited to `expense`, `income`, `reimbursement`, and `transfer`; backfill existing rows to `expense` when `amount < 0` and `income` when `amount >= 0`.

#### 2. Generated Database Types

**File**: `src/lib/database.types.ts`

**Intent**: Reflect the new database column so data modules and fixtures can use the cashflow type safely.

**Contract**: Add `cashflow_type` to `transactions.Row`, `transactions.Insert`, and `transactions.Update` with a string-literal-compatible type.

#### 3. Shared Import Types

**File**: `src/lib/imports/types.ts`

**Intent**: Make cashflow type part of imported transaction drafts before commit persistence.

**Contract**: Export a `CashflowType` union and add `cashflow_type: CashflowType` to `ImportedTransactionDraft`.

#### 4. Parser Defaults

**File**: `src/lib/imports/revolutCsv.ts`

**Intent**: Preserve current import behavior while assigning a deterministic initial type.

**Contract**: Each parsed transaction draft includes `cashflow_type` inferred from net amount sign.

**File**: `src/lib/imports/ingCsv.ts`

**Intent**: Preserve current import behavior while assigning a deterministic initial type.

**Contract**: Each parsed transaction draft includes `cashflow_type` inferred from parsed amount sign.

#### 5. Commit Validation and Persistence

**File**: `src/lib/imports/validation.ts`

**Intent**: Validate cashflow type for import commit payloads while keeping review update compatibility for later phases.

**Contract**: Commit transaction drafts accept `cashflow_type`; if omitted by older client code during import commit, infer it from `amount`.

**File**: `src/lib/imports/data.ts`

**Intent**: Persist the type during new imports, replacement imports, and replacement rollback restore.

**Contract**: `buildImportedTransactionRows` and `restoreImportTransactions` preserve `cashflow_type`.

### Success Criteria:

#### Automated Verification:

- Migration applies locally through the existing Supabase migration flow.
- `src/lib/database.types.ts` includes `transactions.cashflow_type` in row/insert/update contracts.
- Parser and validation unit tests cover sign-derived defaults and valid/invalid cashflow types.
- `npm run lint` passes.
- `npm run check` passes.

#### Manual Verification:

- Inspect a locally imported statement and confirm persisted transaction rows include `expense` for negative rows and `income` for positive rows.
- Confirm old rows after migration have deterministic cashflow types and still retain original signed `amount` values.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Import Review Semantics

### Overview

Extend import review so users can change cashflow type atomically with category and inclusion changes, while preserving existing mixed-result bulk-save behavior.

### Changes Required:

#### 1. Review Update Validation

**File**: `src/lib/imports/validation.ts`

**Intent**: Allow review updates to carry an optional cashflow type without forcing all clients to send it.

**Contract**: `ImportReviewUpdate` includes optional/preserved `cashflow_type`; validation accepts known values and lets omitted values preserve the stored transaction type.

#### 2. Review Persistence Semantics

**File**: `src/lib/imports/data.ts`

**Intent**: Persist cashflow type changes with category/inclusion changes and enforce expense-only category/rule invariants.

**Contract**: `buildReviewUpdateValues` clears `category_id` and `categorized_by_rule_id` when a row is excluded or when `cashflow_type !== 'expense'`; owned category checks run only for included expense rows with a category.

#### 3. Rule Guards

**File**: `src/lib/imports/data.ts`

**Intent**: Keep categorization rules expense-only.

**Contract**: Rule creation/application is allowed only for included expense rows; non-expense rows cannot be rule anchors or rule targets.

#### 4. Review API Routes

**File**: `src/pages/api/imports/transactions/[id].ts`

**Intent**: Preserve the thin route contract while allowing single-row type updates.

**Contract**: The route passes validated review updates through unchanged and keeps `transaction_id` route/body consistency.

**File**: `src/pages/api/imports/transactions/bulk.ts`

**Intent**: Preserve mixed-result bulk saves for category/inclusion/type updates.

**Contract**: Bulk payload entries can include `cashflow_type`; failures remain row-scoped.

#### 5. Import Review UI State

**File**: `src/components/imports/TransactionReviewTable.tsx`

**Intent**: Let users review and edit type alongside category/inclusion while keeping dirty-state and pending-switch behavior accurate.

**Contract**: `ImportReviewDraft` includes `cashflow_type`; dirty detection compares it; non-expense drafts hide/disable category and rule actions; switching away from `expense` clears category in the draft.

#### 6. Workspace Merge Helpers

**File**: `src/components/imports/ImportWorkspace.tsx`

**Intent**: Keep client state synchronized after type updates, rule actions, and mixed bulk saves.

**Contract**: Merge helpers preserve returned `cashflow_type` and clear `category_rule` when the persisted row is non-expense or no longer rule-backed.

### Success Criteria:

#### Automated Verification:

- Review validation tests cover optional `cashflow_type`, invalid types, and non-expense category clearing.
- Import data tests cover single-row and bulk type updates, mixed-result failures, and expense-only rule guards.
- UI helper tests cover dirty-state detection for type changes and category clearing when switching to non-expense.
- `npm run test` passes.
- `npm run lint` passes.
- `npm run check` passes.

#### Manual Verification:

- In import review, change an expense row to transfer and verify category/rule controls are removed or disabled and the row can be saved.
- Change a transfer row back to expense and verify it returns uncategorized rather than restoring stale category/rule state.
- Confirm unsaved type edits block batch switching and review completion just like unsaved category/inclusion edits.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Summary Income Basis and Budget Math

### Overview

Make monthly summary calculations type-aware so expenses drive spending, imported income/reimbursements increase the income basis, and transfers remain neutral.

### Changes Required:

#### 1. Summary Result Contract

**File**: `src/lib/summary/data.ts`

**Intent**: Expose enough values for the dashboard to explain the income basis without turning transfers into primary dashboard content.

**Contract**: `MonthlySummaryResult` includes manual income, imported income, imported reimbursement income, total income, and neutral transfer movement fields as derived values.

#### 2. Type-Aware Selected-Month Summary

**File**: `src/lib/summary/data.ts`

**Intent**: Replace sign-only spend math with type-aware budget math.

**Contract**: Included completed `expense` rows count toward reviewed categorized/uncategorized spend; included pending `expense` rows count toward incomplete review spend; included completed `income` and `reimbursement` rows add to income basis; included `transfer` rows do not affect income or spend.

#### 3. Type-Aware Carry-Over Timeline

**File**: `src/lib/summary/data.ts`

**Intent**: Ensure historical carry-over allowances use the same total income basis as the selected month.

**Contract**: Carry-over month income equals manual monthly income plus completed reviewed imported income/reimbursements for that month; carry-over spend includes completed reviewed categorized expenses only.

#### 4. Summary Snapshot Persistence

**File**: `src/lib/summary/data.ts`

**Intent**: Keep cached monthly summaries aligned with the API response.

**Contract**: `monthly_summaries.total_income`, `total_spent`, and `summary_snapshot` use the new derived values.

### Success Criteria:

#### Automated Verification:

- Summary tests cover manual income plus imported income/reimbursement aggregation.
- Summary tests prove transfers do not affect income, spend, category usage, incomplete-review spend, or carry-over.
- Summary tests preserve excluded-row precedence before type branching.
- Summary snapshot tests confirm persisted cache values match API response values.
- `npm run test` passes.
- `npm run lint` passes.
- `npm run check` passes.

#### Manual Verification:

- With manual income set to 0 and a completed imported salary row, dashboard limits are based on imported salary.
- With manual income set above 0 and a completed imported salary row, dashboard limits are based on their sum.
- A transfer row remains visible in import review/history but does not change category usage or income cards.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 4: UI Copy and Review Controls

### Overview

Update user-facing copy and controls so the new semantics are understandable without overemphasizing transfers on the dashboard.

### Changes Required:

#### 1. Import Review Type Control

**File**: `src/components/imports/TransactionReviewTable.tsx`

**Intent**: Make cashflow type correction an ordinary part of row review.

**Contract**: Each included row exposes a cashflow type selector; non-expense rows show explanatory copy that categories/rules apply only to expenses.

#### 2. Import Upload Preview Copy

**File**: `src/components/imports/ImportUploadForm.tsx`

**Intent**: Set expectations that type defaults are inferred and can be corrected during review.

**Contract**: Preview or supporting copy mentions imported rows are initially classified by amount sign.

#### 3. Budget Income Copy

**File**: `src/components/budget/IncomeForm.tsx`

**Intent**: Reframe manual income as an adjustment/additional amount that can be 0 when imported salary is present.

**Contract**: UI copy no longer centers “estimated amount” as the primary concept; the stored `is_estimated` flag can remain under the hood or be represented as softer helper text.

**File**: `src/pages/budget.astro`

**Intent**: Align the budget page introduction with imported income contributing to dashboard limits.

**Contract**: Copy explains that manual income can supplement imported income.

#### 4. Dashboard Cards and Notices

**File**: `src/components/dashboard/SummaryCards.tsx`

**Intent**: Keep dashboard focused on spending while making the income basis transparent.

**Contract**: The income card labels total income basis and can show manual/imported breakdown if the component contract receives it.

**File**: `src/components/dashboard/CategoryUsageTable.tsx`

**Intent**: Keep category copy focused on reviewed expense rows.

**Contract**: Copy distinguishes expense category totals from income/reimbursement/transfer rows.

**File**: `src/components/dashboard/IncompleteReviewNotice.tsx`

**Intent**: Keep pending-review warnings accurate after type separation.

**Contract**: Warning copy refers to pending expense spend rather than all pending imported movement.

**File**: `src/components/dashboard/ExcludedTransactionsPanel.tsx`

**Intent**: Preserve excluded-row diagnostics without turning transfers into dashboard emphasis.

**Contract**: Excluded inflow/outflow remains a diagnostic panel; transfer totals are not promoted to primary dashboard cards.

### Success Criteria:

#### Automated Verification:

- Component/helper tests cover visible type labels, non-expense category disabling, and summary card income breakdown props where applicable.
- Existing dashboard and import review tests are updated for changed copy.
- `npm run test` passes.
- `npm run lint` passes.
- `npm run check` passes.

#### Manual Verification:

- Review UI clearly communicates that transfers and income are not categorized.
- Budget income UI makes it clear the user may enter 0 when salary is imported from statements.
- Dashboard remains focused on where money was spent, with income basis visible but transfers not promoted as primary cards.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 5: Verification Coverage

### Overview

Finish the cross-cutting verification pass and add one browser-level flow that proves review type changes affect summary math as intended.

### Changes Required:

#### 1. Import and Review Unit Coverage

**File**: `tests/import-review.test.ts`

**Intent**: Cover parser defaults, commit validation, review persistence, and rule guards.

**Contract**: Fixtures include `cashflow_type`; assertions cover invalid type rejection, sign-derived defaults, expense-only categories/rules, and replacement restore preservation.

#### 2. Summary Integration Coverage

**File**: `tests/monthly-summary-and-rules.test.ts`

**Intent**: Cover the end-to-end summary contract for income basis and type-aware budget math.

**Contract**: Fixtures include expense, income, reimbursement, transfer, excluded, pending, categorized, and uncategorized rows.

#### 3. Ownership Regression Coverage

**File**: `tests/auth-and-ownership-boundaries.test.ts`

**Intent**: Preserve user isolation for the new field and type-aware summary logic.

**Contract**: Harness builders include `cashflow_type`; foreign rows with income/transfer types remain ignored or hidden according to existing route contracts.

#### 4. Focused E2E Flow

**File**: `tests/e2e/transaction-inclusion-control.spec.ts` or a new focused E2E spec under `tests/e2e/`

**Intent**: Prove a user-visible flow where a row is changed to transfer or income and dashboard math responds correctly.

**Contract**: Use role/label/text locators, no CSS selectors or `page.waitForTimeout()`, and keep the test independent with unique seeded data.

### Success Criteria:

#### Automated Verification:

- `npm run test` passes.
- `npm run test:e2e` passes for the focused browser coverage.
- `npm run lint` passes.
- `npm run check` passes.
- `npm run build` passes.

#### Manual Verification:

- Execute a full import-review-summary smoke test with one expense, one salary/income row, one reimbursement row, and one transfer row.
- Confirm the implementation command progress entries can be checked off phase by phase without missing verification guidance.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before marking the change implemented.

---

## Testing Strategy

### Unit Tests:

- Parser defaults for Revolut and ING transaction drafts.
- Validation for valid/invalid cashflow types in commit and review payloads.
- Import persistence and replacement rollback preserving `cashflow_type`.
- Review update semantics for type/category/inclusion interactions.
- Summary helpers for expense spend, income basis, reimbursement-as-income, and transfer neutrality.

### Integration Tests:

- Import commit plus review update writes persisted transaction types correctly.
- Summary API aggregates manual and imported income only from reviewed completed batches.
- Carry-over uses type-aware historical income and expense spend.
- Ownership tests ensure foreign income/transfer rows do not leak into another user's summary.

### Manual Testing Steps:

1. Import a CSV containing negative and positive rows and inspect initial type defaults.
2. Change a positive row from income to transfer and save.
3. Mark review complete and open the dashboard.
4. Confirm expense category usage excludes the transfer.
5. Confirm total income includes manual income plus reviewed income/reimbursement rows.
6. Set manual income to 0 and confirm imported salary still drives category limits.

## Performance Considerations

The expected data volume is small, but summary now needs historical imported income as well as historical spend for carry-over. Keep queries scoped by `user_id`, month, and selected batch IDs, and avoid loading unrelated users or unbounded transaction sets.

## Migration Notes

Backfill is deterministic and non-destructive: existing signed amounts remain unchanged. Existing negative rows become `expense`, and zero/positive rows become `income`. Users can later correct positive transfers or reimbursements during review.

No rollback migration is required in this plan, but implementation should be reversible by dropping the new column and check constraint in local development if the migration is not yet deployed.

## References

- Roadmap item: `context/foundation/roadmap.md` S-05
- Prior inclusion plan: `context/changes/transaction-inclusion-control/plan.md`
- Import data module: `src/lib/imports/data.ts`
- Summary data module: `src/lib/summary/data.ts`
- Import review UI: `src/components/imports/TransactionReviewTable.tsx`
- Budget income UI: `src/components/budget/IncomeForm.tsx`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Data Contract and Backfill

#### Automated

- [ ] 1.1 Migration applies locally through the existing Supabase migration flow
- [x] 1.1 Migration applies locally through the existing Supabase migration flow
- [x] 1.2 Database types include transactions.cashflow_type
- [x] 1.3 Parser and validation unit tests cover cashflow defaults and validation
- [x] 1.4 npm run lint passes
- [x] 1.5 npm run check passes

#### Manual

- [ ] 1.6 Inspect imported rows for sign-derived cashflow types
- [ ] 1.7 Confirm migrated rows preserve original signed amounts

### Phase 2: Import Review Semantics

#### Automated

- [ ] 2.1 Review validation tests cover optional cashflow_type and invalid types
- [ ] 2.2 Import data tests cover type updates, row failures, and expense-only rule guards
- [ ] 2.3 UI helper tests cover type dirty-state and category clearing
- [ ] 2.4 npm run test passes
- [ ] 2.5 npm run lint passes
- [ ] 2.6 npm run check passes

#### Manual

- [ ] 2.7 Change expense to transfer and verify category/rule controls clear
- [ ] 2.8 Change transfer back to expense and verify it is uncategorized
- [ ] 2.9 Confirm unsaved type edits block switching and review completion

### Phase 3: Summary Income Basis and Budget Math

#### Automated

- [ ] 3.1 Summary tests cover manual plus imported income aggregation
- [ ] 3.2 Summary tests prove transfer neutrality
- [ ] 3.3 Summary tests preserve excluded-row precedence
- [ ] 3.4 Summary snapshot tests match API response values
- [ ] 3.5 npm run test passes
- [ ] 3.6 npm run lint passes
- [ ] 3.7 npm run check passes

#### Manual

- [ ] 3.8 Verify imported salary drives limits when manual income is zero
- [ ] 3.9 Verify manual income and imported salary are additive
- [ ] 3.10 Verify transfer rows do not change category usage or income cards

### Phase 4: UI Copy and Review Controls

#### Automated

- [ ] 4.1 Component/helper tests cover type labels and non-expense category disabling
- [ ] 4.2 Dashboard and import review tests are updated for changed copy
- [ ] 4.3 npm run test passes
- [ ] 4.4 npm run lint passes
- [ ] 4.5 npm run check passes

#### Manual

- [ ] 4.6 Review UI explains transfers and income are not categorized
- [ ] 4.7 Budget income UI explains manual income can be zero when salary is imported
- [ ] 4.8 Dashboard stays spend-focused without promoting transfers to primary cards

### Phase 5: Verification Coverage

#### Automated

- [ ] 5.1 npm run test passes
- [ ] 5.2 npm run test:e2e passes for focused browser coverage
- [ ] 5.3 npm run lint passes
- [ ] 5.4 npm run check passes
- [ ] 5.5 npm run build passes

#### Manual

- [ ] 5.6 Execute full import-review-summary smoke test with expense, income, reimbursement, and transfer rows
- [ ] 5.7 Confirm progress entries are actionable phase by phase
