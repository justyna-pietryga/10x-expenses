# Transaction Inclusion Control - Plan Brief

> Full plan: `context/changes/transaction-inclusion-control/plan.md`

## What & Why

Implement `UX-05` so users can exclude any imported transaction from budget calculations without deleting the source row. This protects budget trust while preserving a complete statement record and prepares safely for `S-05` by retaining separate excluded outflow and inflow information.

## Starting Point

Import review already supports bulk drafts, partial-save reconciliation, rule provenance, completed-batch corrections, and guarded history switching. Dashboard math currently ignores positive amounts but counts every negative imported row in trusted, uncategorized, or incomplete-review spend; transactions have no inclusion state.

## Desired End State

Any imported row can be excluded through the existing save workflow. Exclusion clears category and rule provenance, removes the row from all budget and carry-over math, and moves it into a collapsed excluded-transactions section. Restore is explicit and returns the row included but uncategorized. The dashboard reconciles excluded outflow and inflow separately without treating inclusion as a future cashflow type.

## Key Decisions Made

| Decision               | Choice                                          | Why                                                                                      |
| ---------------------- | ----------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Eligible rows          | All imported rows                               | Keeps inclusion state consistent and preserves positive-row intent for future `S-05`.    |
| Persistent model       | Boolean `is_included`, default `true`           | Provides narrow included/excluded semantics without introducing cashflow types.          |
| Exclusion side effects | Clear category and rule provenance              | Prevents excluded rows from retaining categorization metadata the user chose to discard. |
| Draft precedence       | Exclusion clears an unsaved category draft      | Avoids contradictory pending state.                                                      |
| Restore state          | Included and uncategorized                      | Matches the deliberate metadata-clearing contract.                                       |
| Rule application       | Skip excluded matching rows                     | Prevents actions on hidden, budget-irrelevant rows.                                      |
| Review visibility      | Collapsed excluded section below the main table | Gives a clear audit and restore path without a broader filter redesign.                  |
| Completed batches      | Preserve `review_completed_at`                  | Matches the existing correction model for reopened history.                              |
| Replacement imports    | Reset rows to included                          | Avoids unsafe heuristic matching between old and replacement statement rows.             |
| Summary representation | Separate excluded outflow and inflow            | Avoids lossy netting and prepares for positive-flow support without pre-building `S-05`. |
| Dashboard presentation | One reconciliation panel                        | Keeps excluded flows visible without crowding budget summary cards.                      |
| Browser coverage       | One focused Playwright flow                     | Protects cross-surface behavior lower-level tests cannot fully prove.                    |

## Scope

**In scope:** transaction schema and generated types, generalized review update contracts, category/provenance clearing, rule skip behavior, collapsed exclusion/restore UI, split summary fields, reconciliation panel, Vitest coverage, and one focused Playwright flow.

**Out of scope:** exclusion reasons, notes, automatic exclusion rules, cashflow classification, prior-category restoration, exclusion carry-forward during replacement, autosave, and general review filtering.

## Architecture / Approach

Persist `transactions.is_included`. Import review sends full review updates and merges returned persisted rows. Summary aggregation branches on inclusion before review status or category: excluded negatives become outflow magnitude, excluded positives become inflow, and neither reaches budget totals or carry-over. UI state and navigation continue using the existing generic dirty-review controls.

## Phases at a Glance

| Phase                           | What it delivers                                                | Key risk                                                               |
| ------------------------------- | --------------------------------------------------------------- | ---------------------------------------------------------------------- |
| 1. Schema and Summary Semantics | Inclusion persistence and split excluded-flow math              | Incorrect branching could silently distort budget or carry-over totals |
| 2. Review Persistence Contracts | Truthful single-row/bulk updates and rule skipping              | Clearing metadata must remain atomic under partial failures            |
| 3. Import Review UI             | Exclude, collapsed reveal, restore, and dirty-state integration | Hidden or drafted rows could become confusing after partial saves      |
| 4. Dashboard Reconciliation     | Separate excluded outflow/inflow presentation                   | Labels could blur budget totals with informational flows               |
| 5. Focused Browser Verification | Cross-surface Playwright protection                             | Seed data must remain independent and deterministic                    |

**Prerequisites:** `UX-01`, `S-03`, `UX-02`, and implemented `UX-06` history switching behavior.

**Estimated effort:** ~4-5 implementation sessions across 5 phases.

## Open Risks & Assumptions

- The boolean inclusion field remains independent from the future cashflow type field.
- Clearing category/provenance is intentionally destructive; restore does not recover prior categorization.
- The collapsed section is sufficient until a broader review-filtering slice is planned.
- Existing summary snapshots are refreshed on demand, so no snapshot data migration is required.

## Success Criteria (Summary)

- Users can exclude and restore any imported row without deleting source data.
- Excluded rows never affect trusted, uncategorized, incomplete-review, total-spend, warning, or carry-over calculations.
- Excluded outflow and inflow remain separately visible for reconciliation.
- Completed historical batches stay completed after inclusion corrections.
- A focused browser test proves the review-to-dashboard workflow.
