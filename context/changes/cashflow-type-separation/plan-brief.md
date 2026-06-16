# Cashflow Type Separation - Plan Brief

> Full plan: `context/changes/cashflow-type-separation/plan.md`
> Frame brief: `context/changes/cashflow-type-separation/frame.md`

## What & Why

The actual problem to plan around is: The current plan over-scopes S-05 by treating cashflow type as a review-time user decision, when the MVP only needs deterministic sign-derived separation between expenses and income to keep budget math from forcing positive rows into expense categorization.

## Starting Point

Phase 1 already introduced a persisted `cashflow_type` and sign-derived parser defaults, but the current contract still allows `expense`, `income`, `reimbursement`, and `transfer`. Review remains category/inclusion-centric, and the frame found that adding type editing would expand the densest workflow without MVP justification.

## Desired End State

Imported transactions carry a required two-value `cashflow_type`: negative amounts are `expense`, and zero/positive amounts are `income`. Users review categories and inclusion only; imported income contributes to dashboard income basis after review completion, while reimbursement and transfer editing are deferred.

## Key Decisions Made

| Decision | Choice | Why | Source |
| --- | --- | --- | --- |
| MVP type set | `expense`, `income` only | These are reliably derivable from signed imported amounts. | Frame |
| Import default | Infer from amount sign | Preserves raw bank amounts and avoids review-time classification work. | Frame |
| Review UI | No type selector | Keeps review focused on category/inclusion and avoids draft-state expansion. | Frame |
| Positive amounts | Remain income | MVP income basis needs inflow support without reimbursement/transfer semantics. | Frame |
| Negative amounts | Remain expense | Expense category usage remains tied to outflows. | Frame |
| Reimbursements/transfers | Deferred | They require semantics beyond signed amount and add UI/rule complexity. | Frame |
| Summary math | Type-aware for `expense`/`income` | Expenses drive spend; reviewed income adds to income basis. | Plan |
| Testing | Unit/integration plus focused E2E if needed | Verifies the reduced import-review-summary path without a type-editing matrix. | Plan |

## Scope

**In scope:**

- Narrow `transactions.cashflow_type` to `expense | income`.
- Keep deterministic backfill: negative rows `expense`, zero/positive rows `income`.
- Keep parser and commit defaults sign-derived.
- Reject `reimbursement`, `transfer`, and arbitrary cashflow values in MVP validation.
- Keep review updates limited to category and inclusion.
- Let reviewed imported income contribute to dashboard income basis.
- Keep expense category usage based only on reviewed included expenses.
- Update copy/tests so positive rows are not treated as expense-category work.

**Out of scope:**

- Review-time cashflow type selector.
- Reimbursement editing or reimbursement offset logic.
- Transfer editing, transfer matching, or transfer analytics.
- Cashflow-type rules or auto-classification beyond amount sign.
- Full cashflow dashboard.
- Database renames for `monthly_incomes` or `is_estimated`.

## Architecture / Approach

Treat `cashflow_type` as persisted derived state, not user-editable review state. Import parsers and commit validation assign it from the signed amount, review APIs preserve it without mutation, and summary code branches on the two-value type so expenses affect spend while reviewed income affects the income basis.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. MVP Data Contract Correction | Schema, types, validation, parsers, and fixtures narrowed to `expense | income`. | Existing Phase 1 artifacts still allow four values and must be corrected before later work. |
| 2. Type-Aware Summary Math | Reviewed expenses drive spend; reviewed income adds to income basis. | Pending/excluded rows must keep existing trust boundaries. |
| 3. Review and UI Alignment | Review stays category/inclusion-only, with copy adjusted for imported income. | Positive rows must not feel broken when they have no category. |
| 4. Verification Coverage | Unit/integration/browser coverage for the reduced MVP path. | Tests must avoid reintroducing reimbursement/transfer expectations. |

**Prerequisites:** Existing UX-05 inclusion behavior and S-03 summary/rules foundations remain in place.
**Estimated effort:** ~2-4 implementation sessions across 4 phases.

## Open Risks & Assumptions

- Imported income is counted only from reviewed completed batches; pending income should not change trusted limits.
- Zero-amount rows are treated as `income` because the sign-derived rule is `amount < 0` only for expenses.
- Existing local databases that already applied the four-value migration may need reset/reapply or a corrective migration.
- Reimbursement and transfer support can be revisited after MVP with a separate product decision.

## Success Criteria (Summary)

- Imported negative rows persist and summarize as expenses.
- Imported zero/positive rows persist and summarize as income without requiring category review.
- No MVP UI allows review-time cashflow type editing or exposes reimbursement/transfer classification.
