# Second Supported Format - Plan Brief

> Full plan: `context/changes/second-supported-format/plan.md`

## What & Why

Build S-04 so a signed-in user can repeat the existing import-and-review loop with one supported ING CSV statement in addition to Revolut. The goal is not generic bank ingestion; it is one exact second format that proves the import architecture can support another real bank without changing the downstream review and summary model.

## Starting Point

S-02 already shipped a protected `/imports` workspace, explicit bank-month replacement, persisted transaction review, and a strict Revolut CSV parser. What is still single-bank is everything around it: the upload UI, import validation, preview route, shared draft types, and tests still assume `bank = "revolut"` and one exact comma-delimited parser contract.

## Desired End State

A signed-in user can open `/imports`, choose either Revolut or ING, upload the supported CSV for that bank, preview the parsed rows, confirm any same-bank same-month replacement, and land in the same review flow with date, title, recipient, amount, and category. ING imports follow the same persistence and summary pipeline as Revolut, including reusable rule application, while still honoring ING-specific parsing rules such as semicolon delimiters, metadata preamble handling, multi-account files, and fallback date logic for rows without booking dates.

## Key Decisions Made

| Decision | Choice | Why |
| --- | --- | --- |
| ING scope | One exact ING CSV shape matching the provided sample | Keeps S-04 bounded to the roadmap slice instead of broadening into generic ING support. |
| Multi-account handling | Import one multi-account ING file into one ING bank-month batch | Matches the real sample and avoids forcing manual file splitting. |
| Unbooked rows | Import them using transaction date when booking date is blank | Preserves more real user activity from the ING export, even though it adds a trust tradeoff. |
| Canonical month | Derive one effective month from imported row dates, with booking date preferred and transaction date used only as fallback | Keeps replacement and summary semantics consistent while respecting the chosen fallback behavior. |
| Bank choice UX | Add a required bank selector in `/imports` | Makes two-format support explicit and keeps the API contract honest. |
| Shared import contract | Normalize ING rows into the same draft shape the rest of the pipeline already uses | Lets review, rules, and summaries stay bank-agnostic. |
| Rule behavior | Reuse the existing cross-bank rule engine without bank scoping | Delivers consistent categorization behavior without reopening the S-03 rule model. |

## Scope

**In scope:** ING parser, shared multi-bank import types and validation, preview/commit route dispatch, required bank selector in `/imports`, multi-account ING file support, focused parser and import regression tests.

**Out of scope:** generic ING support, account-level batches, bank-scoped rules, PDF statements, transaction field editing beyond categories, and third-bank work.

## Architecture / Approach

Generalize the import pipeline just enough to stop hard-coding Revolut, then add an ING-specific parser behind the shared preview and commit flow. The parser layer becomes bank-dispatched, while persistence, replacement, review, rules, and dashboard behavior remain shared. The `/imports` UI moves from one fixed-bank upload to a required bank selector plus format-specific copy, but it still lands in the same saved-batch review experience.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Shared Multi-Bank Import Contract | Shared bank/type/parser contract instead of Revolut-only assumptions | If the abstraction is too narrow, ING support becomes a pile of conditionals. |
| 2. ING Parser and API Dispatch | Exact ING CSV parsing plus preview/commit route integration | Parser mistakes could import wrong financial totals or dates. |
| 3. Two-Bank Import Workspace UI | Required bank choice and ING-aware upload/review UX | The UI must become explicit without making the import flow confusing. |
| 4. Regression Coverage and Handoff | Stable parser coverage, route regression checks, and plan/roadmap readiness | Weak regression coverage would make future bank additions brittle. |

**Prerequisites:** S-02 and S-03 are complete and archived.
**Estimated effort:** ~3-4 implementation sessions across 4 phases.

## Open Risks & Assumptions

- The ING sample is treated as the exact supported export contract; nearby ING variants may still be rejected.
- Multi-account ING files are intentionally kept bank-level, not account-level, so downstream summaries remain unchanged.
- Falling back to transaction date for rows without booking dates increases usefulness, but it may occasionally import activity that has not fully settled yet.

## Success Criteria (Summary)

- A signed-in user can choose ING in `/imports`, upload the supported CSV, and reach the same review flow already used for Revolut.
- Same-bank same-month replacement still works correctly for both supported banks.
- ING imports feed the existing rule and summary pipeline without bank-specific downstream forks.
