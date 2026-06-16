# Cashflow Type Separation Implementation Plan

## Overview

Implement roadmap slice S-05 at MVP scope by keeping imported transaction cashflow type deterministic and sign-derived: negative imported amounts are `expense`, and zero/positive imported amounts are `income`. The persisted type remains useful for summary math, but import review does not expose a type selector and does not support `reimbursement` or `transfer` editing in this change.

## Current State Analysis

The framing outcome found that the previous plan over-scoped the MVP by treating cashflow type as a review-time user decision. The PRD and roadmap require reliable expense category usage against income, not a full cashflow taxonomy. Current review APIs and UI are category/inclusion-centric, and adding type editing would expand draft state, dirty detection, rule behavior, copy, and bulk-save semantics before the core budget loop needs that complexity.

Phase 1 work has already introduced a persisted `cashflow_type` and sign-derived parser defaults, but the current contract still allows `reimbursement` and `transfer`. The reduced MVP plan should correct that contract before building later phases on top of it.

## Desired End State

Imported transactions have a required `cashflow_type` limited to `expense` or `income`. New and existing rows are classified by amount sign: negative rows are expenses; zero/positive rows are income. Users can still review categories and inclusion, but they cannot change cashflow type during review.

After implementation:

- Negative imported amounts remain `expense`.
- Zero and positive imported amounts remain `income`.
- Only included, reviewed expense rows drive category usage, spend, incomplete-review spend, and categorization rules.
- Included, reviewed income rows add to the dashboard income basis alongside manual monthly income.
- Excluded rows bypass all budget math before cashflow-specific branching.
- Reimbursement and transfer semantics, editing, labels, UI states, rules, and E2E flows are deferred.

### Key Discoveries

- Frame brief: `context/changes/cashflow-type-separation/frame.md` identifies review-time cashflow editing as MVP scope expansion.
- Existing import defaults already infer type from amount sign in `src/lib/imports/types.ts`.
- Review validation currently accepts category/inclusion updates, not cashflow type updates, in `src/lib/imports/validation.ts`.
- Review UI draft state in `src/components/imports/TransactionReviewTable.tsx` is built around `category_id` and `is_included`.
- Summary math in `src/lib/summary/data.ts` still derives budget spend and income from manual income plus signed transaction amounts, and needs to become type-aware for `expense`/`income`.

## What We're NOT Doing

- We are not adding a review-time cashflow type selector.
- We are not allowing users to edit imported rows into `reimbursement` or `transfer`.
- We are not adding reimbursement offset logic.
- We are not reconciling transfers across accounts or classifying bank-to-bank movement.
- We are not adding cashflow-type rules or auto-classification beyond amount-sign defaults.
- We are not changing auth, RLS, ownership semantics, or source signed amount storage.
- We are not renaming `monthly_incomes`, `monthly_incomes.amount`, or `is_estimated`.

## Implementation Approach

Treat `cashflow_type` as a persisted derived attribute, not a review workflow field. First narrow the database, TypeScript, validation, and tests to the two-value MVP contract. Then update summary math so reviewed expenses affect spend and reviewed income affects income basis. Finally adjust user-facing copy and verification so the product communicates sign-derived behavior without adding new controls.

## Phase 1: MVP Data Contract Correction

### Overview

Correct the already-started data contract from a four-value taxonomy to the MVP two-value contract. This phase preserves the useful persisted field and sign-derived defaults while removing `reimbursement` and `transfer` from schema, types, validation, fixtures, and error messages.

### Changes Required

#### 1. Transaction Schema Migration

**File**: `supabase/migrations/20260616113000_cashflow_type_separation.sql`

**Intent**: Limit persisted cashflow type to the MVP values that the app can derive reliably without user editing.

**Contract**: `transactions.cashflow_type` is required and constrained to `expense` or `income`; existing/backfilled rows use `expense` when `amount < 0` and `income` when `amount >= 0`.

#### 2. Generated Database Types

**File**: `src/lib/database.types.ts`

**Intent**: Keep generated/local database contracts aligned with the narrowed schema.

**Contract**: `transactions.Row`, `transactions.Insert`, and `transactions.Update` expose `cashflow_type` as `"expense" | "income"` only.

#### 3. Shared Import Types

**File**: `src/lib/imports/types.ts`

**Intent**: Make the cashflow type contract explicit and deterministic at import time.

**Contract**: `CashflowType` is `"expense" | "income"`; `inferCashflowTypeFromAmount(amount)` returns `expense` for negative amounts and `income` for zero/positive amounts.

#### 4. Commit Validation and Persistence

**File**: `src/lib/imports/validation.ts`

**Intent**: Validate only the two MVP cashflow types for import commits, while preserving compatibility for omitted values.

**Contract**: Commit transaction drafts accept optional `cashflow_type`; omitted values are inferred from amount. Invalid values, including `reimbursement` and `transfer`, are rejected with updated two-value copy.

**File**: `src/lib/imports/data.ts`

**Intent**: Persist and restore the sign-derived type without introducing review-time edit paths.

**Contract**: Import insert, replacement insert, and replacement rollback restore preserve `cashflow_type`; review update builders do not accept or mutate it.

#### 5. Parser and Fixture Updates

**Files**: `src/lib/imports/revolutCsv.ts`, `src/lib/imports/ingCsv.ts`, `tests/import-review.test.ts`, `tests/review-persistence-and-rule-application.test.ts`, `tests/auth-and-ownership-boundaries.test.ts`, `tests/monthly-summary-and-rules.test.ts`

**Intent**: Keep parser defaults and tests aligned with the reduced type set.

**Contract**: Negative parsed rows assert `expense`; zero/positive parsed rows assert `income`; test fixtures no longer use or expect `reimbursement` or `transfer` values.

### Success Criteria

#### Automated Verification

- Migration check constraint allows only `expense` and `income`.
- TypeScript database and import types expose only `expense | income`.
- Parser and validation tests cover negative, zero, and positive amount inference.
- Validation tests reject `reimbursement`, `transfer`, and arbitrary invalid strings.
- `npm run lint` passes.
- `npm run check` passes.

#### Manual Verification

- Inspect a local import and confirm negative persisted rows are `expense`.
- Inspect a local import and confirm zero/positive persisted rows are `income`.
- Confirm existing signed `amount` values are unchanged after migration/backfill.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Type-Aware Summary Math

### Overview

Use the persisted two-value type in summary calculations so reviewed expenses drive spending and reviewed imported income contributes to the income basis. This phase does not add reimbursement, transfer, or review editing behavior.

### Changes Required

#### 1. Selected-Month Summary

**File**: `src/lib/summary/data.ts`

**Intent**: Replace sign-only budget math with the narrowed cashflow contract.

**Contract**: Included completed `expense` rows count toward reviewed categorized/uncategorized spend; included pending `expense` rows count toward incomplete-review spend; included completed `income` rows add to total income; excluded rows are ignored before type branching.

#### 2. Income Basis Contract

**File**: `src/lib/summary/data.ts`

**Intent**: Make dashboard income limits reflect both manual monthly income and trusted reviewed imported income.

**Contract**: `MonthlySummaryResult.total_income` equals manual monthly income plus included completed imported income for the selected month. If a manual income row is absent, imported income can still drive limits.

#### 3. Carry-Over Timeline

**File**: `src/lib/summary/data.ts`

**Intent**: Keep historical allowances consistent with selected-month math.

**Contract**: Carry-over month income equals manual monthly income plus included completed imported income; carry-over spend includes completed reviewed categorized expenses only.

#### 4. Summary Snapshot Persistence

**File**: `src/lib/summary/data.ts`

**Intent**: Keep cached monthly summaries aligned with API responses.

**Contract**: `monthly_summaries.total_income`, `total_spent`, and `summary_snapshot` use the same type-aware values returned by the summary API.

### Success Criteria

#### Automated Verification

- Summary tests cover manual income plus reviewed imported income aggregation.
- Summary tests prove positive imported income does not appear in expense category usage.
- Summary tests prove pending imported income does not change trusted limits until review completion.
- Summary tests preserve excluded-row precedence before type branching.
- Summary snapshot tests confirm persisted cache values match API response values.
- `npm run test` passes.
- `npm run lint` passes.
- `npm run check` passes.

#### Manual Verification

- With manual income set to 0 and a completed imported salary row, dashboard limits are based on imported salary.
- With manual income set above 0 and a completed imported salary row, dashboard limits are based on their sum.
- A positive imported row remains visible in import review/history without requiring a category.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Review and UI Alignment

### Overview

Keep import review focused on category and inclusion while updating copy and UI assumptions that previously implied every included row is an expense. This phase deliberately avoids cashflow type controls.

### Changes Required

#### 1. Import Review Row Semantics

**File**: `src/components/imports/TransactionReviewTable.tsx`

**Intent**: Make positive income rows understandable without adding a selector.

**Contract**: Review rows may display a passive type label or amount-sign cue if useful, but there is no editable type control. Income rows do not require category selection and do not offer categorization rule actions.

#### 2. Workspace Merge Helpers

**File**: `src/components/imports/ImportWorkspace.tsx`

**Intent**: Keep client state synchronized with persisted cashflow type returned from import/load APIs.

**Contract**: Merge helpers preserve `cashflow_type` but do not treat it as draft-editable or dirty state.

#### 3. Import Upload Preview Copy

**File**: `src/components/imports/ImportUploadForm.tsx`

**Intent**: Set expectations that imported transaction type is inferred automatically from amount sign.

**Contract**: Supporting copy can mention that negative rows are treated as expenses and positive rows as income; it must not promise type correction during review.

#### 4. Budget Income Copy

**File**: `src/components/budget/IncomeForm.tsx`

**Intent**: Explain manual income as a supplement to imported income without renaming the stored model.

**Contract**: UI copy makes it clear users may enter 0 when salary/income is imported, or enter additional manual income as needed.

#### 5. Dashboard Copy

**Files**: `src/components/dashboard/SummaryCards.tsx`, `src/components/dashboard/CategoryUsageTable.tsx`, `src/components/dashboard/IncompleteReviewNotice.tsx`

**Intent**: Keep dashboard language accurate after imported income contributes to limits.

**Contract**: Copy distinguishes expense category totals from imported income; pending-review warnings refer to pending expense spend, not all pending imported movement.

### Success Criteria

#### Automated Verification

- Component/helper tests cover income rows being non-categorizable without type editing.
- Existing dashboard and import review tests are updated for changed copy.
- Tests prove `cashflow_type` is not part of review dirty-state or review update payloads.
- `npm run test` passes.
- `npm run lint` passes.
- `npm run check` passes.

#### Manual Verification

- Review UI does not show a cashflow type selector.
- Positive imported rows can be reviewed without assigning an expense category.
- Budget income UI explains manual income can supplement imported income.
- Dashboard remains focused on expense category usage while showing the correct income basis.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 4: Verification Coverage

### Overview

Finish the cross-cutting verification pass for the reduced MVP behavior. Browser-level coverage should prove the sign-derived import-to-summary path, not reimbursement/transfer editing.

### Changes Required

#### 1. Import and Review Unit Coverage

**File**: `tests/import-review.test.ts`

**Intent**: Cover parser defaults, commit validation, import persistence, replacement restore, and review invariants.

**Contract**: Fixtures include only `expense` and `income`; assertions cover sign-derived defaults, invalid type rejection, and absence of review-time type mutation.

#### 2. Summary Integration Coverage

**File**: `tests/monthly-summary-and-rules.test.ts`

**Intent**: Cover the end-to-end summary contract for expense spend and imported income basis.

**Contract**: Fixtures include negative expense rows, positive income rows, excluded rows, pending rows, categorized rows, and uncategorized rows.

#### 3. Ownership Regression Coverage

**File**: `tests/auth-and-ownership-boundaries.test.ts`

**Intent**: Preserve user isolation for imported income and type-aware summary logic.

**Contract**: Harness builders include two-value `cashflow_type`; foreign imported income remains ignored according to existing route and query boundaries.

#### 4. Focused E2E Flow

**File**: `tests/e2e/transaction-inclusion-control.spec.ts` or a new focused E2E spec under `tests/e2e/`

**Intent**: Prove a user-visible flow where a positive imported income row contributes to dashboard income without category assignment.

**Contract**: Use role/label/text locators, no CSS selectors or `page.waitForTimeout()`, and keep the test independent with unique seeded data. Do not test reimbursement/transfer editing.

### Success Criteria

#### Automated Verification

- `npm run test` passes.
- `npm run test:e2e` passes for the focused browser coverage if E2E is added in this change.
- `npm run lint` passes.
- `npm run check` passes.
- `npm run build` passes.

#### Manual Verification

- Execute a full import-review-summary smoke test with one negative expense row and one positive income row.
- Confirm the positive row does not require category assignment during review.
- Confirm the dashboard income basis includes the reviewed positive row and category usage excludes it.
- Confirm progress entries are actionable phase by phase.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before marking the change implemented.

---

## Testing Strategy

### Unit Tests

- Parser defaults for Revolut and ING transaction drafts.
- Validation for `expense`, `income`, omitted type inference, and invalid type rejection.
- Import persistence and replacement rollback preserving sign-derived `cashflow_type`.
- Review update validation proving type is not editable through review payloads.
- Summary helpers for expense spend, imported income basis, pending review, exclusion precedence, and snapshots.

### Integration Tests

- Import commit writes persisted transaction types by sign.
- Review completion can succeed with positive income rows that have no category.
- Summary API aggregates manual monthly income plus reviewed imported income.
- Carry-over uses type-aware historical income and expense spend.
- Ownership tests ensure foreign imported income rows do not leak into another user's summary.

### Manual Testing Steps

1. Import a CSV containing one negative row and one positive row.
2. Confirm the negative row persists with `cashflow_type = expense`.
3. Confirm the positive row persists with `cashflow_type = income`.
4. Review the batch without assigning a category to the positive row.
5. Mark review complete and open the dashboard.
6. Confirm expense category usage excludes the positive row.
7. Confirm total income includes manual income plus the reviewed positive row.

## Performance Considerations

The expected data volume is small, but summary now needs reviewed imported income as well as reviewed spend for carry-over. Keep queries scoped by `user_id`, month, and selected batch IDs, and avoid loading unrelated users or unbounded transaction sets.

## Migration Notes

Backfill is deterministic and non-destructive: existing signed amounts remain unchanged. Existing negative rows become `expense`, and zero/positive rows become `income`.

Because this plan corrects a not-yet-finalized MVP migration that currently allows four values, implementation should narrow the check constraint and generated types before depending on the field in summary/UI work. If the migration has already been applied in a local database, reset/reapply local migrations or add an explicit corrective migration according to the project's migration practice.

## References

- Frame brief: `context/changes/cashflow-type-separation/frame.md`
- Roadmap item: `context/foundation/roadmap.md` S-05
- Prior inclusion plan: `context/changes/transaction-inclusion-control/plan.md`
- Import data module: `src/lib/imports/data.ts`
- Summary data module: `src/lib/summary/data.ts`
- Import review UI: `src/components/imports/TransactionReviewTable.tsx`
- Budget income UI: `src/components/budget/IncomeForm.tsx`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` - <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: MVP Data Contract Correction

#### Automated

- [x] 1.1 Migration check constraint allows only expense and income
- [x] 1.2 Database and import types expose only expense and income
- [x] 1.3 Parser and validation tests cover negative, zero, and positive amount inference
- [x] 1.4 Validation tests reject reimbursement, transfer, and arbitrary invalid strings
- [x] 1.5 npm run lint passes
- [x] 1.6 npm run check passes

#### Manual

- [ ] 1.7 Inspect imported rows for negative expense defaults
- [ ] 1.8 Inspect imported rows for zero/positive income defaults
- [ ] 1.9 Confirm migrated rows preserve original signed amounts

### Phase 2: Type-Aware Summary Math

#### Automated

- [ ] 2.1 Summary tests cover manual plus reviewed imported income aggregation
- [ ] 2.2 Summary tests prove positive imported income is excluded from expense category usage
- [ ] 2.3 Summary tests prove pending imported income does not change trusted limits
- [ ] 2.4 Summary tests preserve excluded-row precedence
- [ ] 2.5 Summary snapshot tests match API response values
- [ ] 2.6 npm run test passes
- [ ] 2.7 npm run lint passes
- [ ] 2.8 npm run check passes

#### Manual

- [ ] 2.9 Verify imported salary drives limits when manual income is zero
- [ ] 2.10 Verify manual income and imported salary are additive
- [ ] 2.11 Verify positive imported rows stay visible without category usage

### Phase 3: Review and UI Alignment

#### Automated

- [ ] 3.1 Component/helper tests cover income rows being non-categorizable without type editing
- [ ] 3.2 Dashboard and import review tests are updated for changed copy
- [ ] 3.3 Tests prove cashflow_type is not review dirty-state or review update payload
- [ ] 3.4 npm run test passes
- [ ] 3.5 npm run lint passes
- [ ] 3.6 npm run check passes

#### Manual

- [ ] 3.7 Review UI does not show a cashflow type selector
- [ ] 3.8 Positive imported rows can be reviewed without expense categories
- [ ] 3.9 Budget income UI explains manual income can supplement imported income
- [ ] 3.10 Dashboard stays focused on expense category usage with correct income basis

### Phase 4: Verification Coverage

#### Automated

- [ ] 4.1 npm run test passes
- [ ] 4.2 npm run test:e2e passes for focused browser coverage if added
- [ ] 4.3 npm run lint passes
- [ ] 4.4 npm run check passes
- [ ] 4.5 npm run build passes

#### Manual

- [ ] 4.6 Execute full import-review-summary smoke test with one expense and one income row
- [ ] 4.7 Confirm positive rows do not require category assignment during review
- [ ] 4.8 Confirm dashboard income includes the reviewed positive row and category usage excludes it
- [ ] 4.9 Confirm progress entries are actionable phase by phase
