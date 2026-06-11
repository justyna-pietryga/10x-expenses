# Transaction Inclusion Control - Plan Brief

> Full plan: `context/changes/transaction-inclusion-control/plan.md`

## What & Why

Implement `UX-05` so a user can exclude imported transactions from budget calculations without deleting the imported source row. This closes the current trust gap where transfers, duplicates, or other out-of-scope rows still inflate budget totals unless the user deletes data or forces an unnatural category choice.

## Starting Point

The app already has two important building blocks: import review supports bulk draft-and-save editing for transaction categories, and the dashboard summary already separates trusted reviewed spend from incomplete-review spend. What is missing is a persistent transaction-level inclusion state; today every negative imported row is still counted somewhere in summary math.

## Desired End State

A user can exclude an imported row during review, save that decision through the same bulk-save workflow as category edits, and keep the row in the audit trail without counting it in the budget. Excluded rows disappear from the default review list, can be restored through a dedicated excluded-row path, and appear in the dashboard only as a separate excluded amount rather than inside trusted, uncategorized, or incomplete-review spend.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Exclusion model | Single included/excluded state | Keeps `UX-05` narrow and avoids overlapping early with future cashflow typing. | Plan |
| Summary visibility | Separate excluded bucket in dashboard | Preserves reconciliation and trust instead of silently dropping rows. | Plan |
| Category requirement | Excluded rows may remain uncategorized | Avoids wasted categorization work for rows that intentionally should not affect the budget. | Plan |
| Reversal model | Separate restore action | Makes re-inclusion intentional and fits the hidden-by-default excluded-row view. | Plan |
| Review save model | Reuse bulk dirty-state save workflow | Matches the existing `UX-01` interaction pattern and avoids mixed autosave semantics. | Plan |
| Review-state precedence | Exclusion overrides reviewed/incomplete buckets immediately | Reflects explicit user intent and prevents excluded rows from continuing to inflate pending totals. | Plan |
| Default review visibility | Hide excluded rows by default | Keeps the main review list focused on budget-relevant work while preserving a dedicated restore path. | Plan |

## Scope

**In scope:** transaction schema extension, summary excluded bucket, import-review single-row and bulk save contract updates, excluded-row hide/restore UI, dashboard excluded-spend presentation, focused import-review and summary tests.

**Out of scope:** exclusion reasons, free-text notes, cashflow-type separation, automatic exclusion rules, autosave, and broader import-review filter/sorting redesign.

## Architecture / Approach

Add one persistent inclusion field to `transactions`, defaulting to included. Extend existing review save contracts so category and inclusion changes are saved together, then update summary recomputation so excluded rows bypass trusted, uncategorized, incomplete, and carry-over math entirely. Finally, surface the result in both interfaces: hidden-by-default excluded rows with explicit restore in `/imports`, and a separate excluded-spend bucket in `/dashboard`.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Schema and Summary Contract | Persistent inclusion field plus excluded-spend summary bucket | Wrong bucket math could silently distort trusted or incomplete totals |
| 2. Import Review Save Contracts | Single-row and bulk persistence for inclusion changes | Contract drift could break partial-failure handling or ownership guarantees |
| 3. Import Review UI | Exclude, reveal excluded, restore, and dirty-state handling | Hidden rows can become confusing if restore flow is not explicit enough |
| 4. Dashboard Presentation and Regression | Visible excluded-spend UI plus end-to-end contract hardening | The dashboard could become semantically confusing if labels are not updated precisely |

**Prerequisites:** `UX-01` bulk category review and `S-03` monthly summary are already in place.
**Estimated effort:** ~3-4 implementation sessions across 4 phases.

## Open Risks & Assumptions

- A single included/excluded state is enough for this slice and will not block later cashflow-type separation.
- The default hidden excluded-row view remains understandable without adding a full filter system now.
- "Imported spend" can be safely redefined in the dashboard as budget-relevant imported spend as long as excluded spend is surfaced separately.

## Success Criteria (Summary)

- A user can exclude and later restore imported rows without deleting source statement data.
- Excluded rows no longer affect trusted spend, uncategorized spend, incomplete-review spend, or carry-over calculations.
- The dashboard shows excluded spend explicitly so the budget stays trustworthy and the imported statement remains explainable.
