# First Bank Import Review — Plan Brief

> Full plan: `context/changes/first-bank-import-review/plan.md`

## What & Why

Build S-02 so a signed-in user can import one exact Revolut CSV statement, review parsed transactions, correct categories, and safely replace an existing Revolut month batch only after explicit confirmation. The supported file contract is now grounded in the sanitized sample at `context/foundation/resources/revolut-statement-example.csv`, including localized headers, completed-row filtering, completion-date month derivation, and net amount handling with fees folded in.

## Starting Point

F-01 already created per-user tables for import batches, transactions, and categorization rules, while S-01 added the protected route, Astro API, helper-module, and Vitest patterns the repo now uses for finance workflows. What’s missing is the entire import surface: no upload route, no parser, no batch replacement contract, and no review UI.

## Desired End State

A user can open a dedicated protected import workspace, choose Revolut, upload the supported CSV, and either see a clear parse error before anything destructive happens or land in a transaction review screen with date, title, recipient, amount, and category. Same-bank same-month re-imports warn before replacement, and the persisted batch stays marked review-pending until the user explicitly finishes review.

## Key Decisions Made

| Decision | Choice | Why | Source |
| --- | --- | --- | --- |
| First supported format | Revolut CSV only | Keeps S-02 bounded to one exact format while still delivering the full import-review loop. | Plan |
| Review surface | Dedicated `/imports` route | Keeps import/review separate from `/budget` and leaves room for later slices. | Plan |
| Parse strictness | Fail whole import on parse mismatch | Financial trust matters more than salvaging partial rows, while still filtering out pending and reversed rows before import. | Plan |
| Replacement model | Parse first, replace only after explicit confirmation | Prevents destructive overwrites from bad or accidental uploads. | Plan |
| Initial categorization | Apply saved rules, otherwise leave uncategorized | Honest default that fits the existing schema and review-first workflow. | Plan |
| Review persistence | Save batch first, then persist review edits on saved rows | Reuses the repo’s current Astro API pattern and makes review resumable. | Plan |
| Rule creation | Explicit opt-in per correction | Supports FR-011 without creating noisy automatic rules. | Plan |
| Batch readiness | Add review-complete marker on import batches | Downstream summaries must distinguish imported from reviewed data. | Plan |

## Scope

**In scope:** additive batch schema updates, Revolut CSV parser, upload preview and commit APIs, same-month replacement confirmation, persisted transaction review, category-only corrections, opt-in rule creation, dedicated protected import page, focused tests.

**Out of scope:** second bank/format support, PDF parsing, editing parsed amount/date/title/recipient, summary generation, duplicate-merge logic, automatic rule creation.

## Architecture / Approach

Extend `statement_import_batches` with a canonical `statement_month` key and a `review_completed_at` marker, then build the import flow under `src/lib/imports/` plus Astro API routes. The parser accepts one localized Revolut CSV shape, imports only completed rows, derives the month from completion dates, folds fees into the stored net amount, and fails fast on malformed completed rows. The UI lives on one protected `/imports` page: upload to preview, confirm replacement if needed, commit the batch, review saved transactions, optionally save rules, then explicitly mark the batch complete.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Import Batch Contract and Schema Support | Canonical bank-month key and review-state batch contract | Choosing the wrong persistence key would complicate every later import slice. |
| 2. Revolut CSV Parsing and Import API Flow | Fail-fast parser plus preview, commit, replacement, and review APIs | Parsing or replacement mistakes could damage user trust in financial data. |
| 3. Protected Import Review UI | Dedicated `/imports` workspace with upload, review, and completion flow | The UI must stay clear while handling destructive replacement safely. |
| 4. Test Fixtures, Regression Coverage, and Roadmap Sync | Repeatable fixtures, regression tests, and roadmap readiness update | Weak fixtures or gaps here would make parser changes fragile later. |

**Prerequisites:** F-01 and S-01 complete, which they now are.
**Estimated effort:** ~3-4 implementation sessions across 4 phases.

## Open Risks & Assumptions

- Replacement should remain whole-batch and explicit; any drift toward partial merge would exceed S-02 scope.
- Downstream slices must honor the review-complete marker instead of assuming all imported data is summary-ready.

## Success Criteria (Summary)

- A signed-in user can upload the supported Revolut CSV, review parsed transactions, and correct categories.
- Same-month Revolut re-imports require explicit confirmation before replacing the existing batch.
- Imported batches persist safely but remain clearly review-pending until the user explicitly completes review.
