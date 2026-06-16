# Frame Brief: Cashflow Type Separation

> Framing step before /10x-plan. This document captures what is *actually*
> at issue, separated from what was initially assumed.

## Reported Observation

The current plan assumes review-time editing of imported transaction cashflow
types (`expense`, `income`, `reimbursement`, `transfer`), but MVP review-time
type controls may add too much UI complexity, some type/sign combinations are
semantically weak, and the simplest useful behavior may be sign-derived only:
negative = expense, positive = income.

## Initial Framing (preserved)

- **User's stated cause or approach**: Editable per-row cashflow type controls may be too complex for MVP, and `reimbursement` / `transfer` may not be strong enough MVP concepts to justify manual override.
- **User's proposed direction**: Keep imported transaction type fixed by amount sign, support only `expense` and `income`, and remove review-time type editing entirely.
- **Pre-dispatch narrowing**: Treat this as several separate observations: review UI complexity, semantic validity of type/sign combinations, MVP scope, and whether reimbursement/transfer should be deferred.

## Dimension Map

The observation could originate at any of these dimensions:

1. **MVP product boundary** - the PRD requires reviewing transaction categories and seeing expense category usage against income, but does not require user-editable cashflow taxonomy.
2. **Cashflow data contract** - the current plan and landed Phase 1 schema allow four stored values, but import defaults are already sign-derived.
3. **Review interaction model** - the existing review UI and API mutate category and inclusion only; adding type editing expands dirty state, rule behavior, and row controls.
4. **Summary math semantics** - S-05 exists because positive rows and transfers should not be forced into expense categorization, but the minimum useful summary behavior may be sign/type-derived rather than user-edited.

## Hypothesis Investigation

| Hypothesis | Evidence | Verdict |
| --- | --- | --- |
| MVP only needs category review for expenses; cashflow type editing is scope expansion. | PRD success criteria require import, income setup, category/rule review, and summary usage against income, not reviewable cashflow types (`context/foundation/prd.md:32`, `context/foundation/prd.md:48`, `context/foundation/prd.md:55`, `context/foundation/prd.md:81`, `context/foundation/prd.md:97`). Roadmap says first release is time-constrained and should keep breadth narrow (`context/foundation/roadmap.md:20`, `context/foundation/roadmap.md:22`). | STRONG |
| Four cashflow types are already required as persisted user-facing review state. | The current change plan defines four types and review-time correction (`context/changes/cashflow-type-separation/plan.md`, Desired End State and Phase 2/4), and the migration/type union already allow four values (`supabase/migrations/20260616113000_cashflow_type_separation.sql:1`, `src/lib/imports/types.ts:2`). But current review validation does not accept `cashflow_type`, and review updates only include category/inclusion (`src/lib/imports/validation.ts:20`, `src/lib/imports/validation.ts:27`, `src/lib/imports/validation.ts:297`). | WEAK |
| Sign-derived `expense` / `income` covers the minimum useful MVP semantics. | Import type inference is exactly amount-sign based (`src/lib/imports/types.ts:4`), commit validation infers a missing value from amount (`src/lib/imports/validation.ts:158`), parsers persist that inferred value (`src/lib/imports/revolutCsv.ts:191`, `src/lib/imports/ingCsv.ts:197`), and the migration backfills negative rows to `expense`, all other rows to `income` (`supabase/migrations/20260616113000_cashflow_type_separation.sql:6`). | STRONG |
| Review UI can absorb type editing without major extra complexity. | Existing review draft state stores only `category_id` and `is_included` (`src/components/imports/TransactionReviewTable.tsx:12`), dirty detection compares only those two fields (`src/components/imports/TransactionReviewTable.tsx:185`, `src/components/imports/TransactionReviewTable.tsx:399`), and the visible row control is category plus exclude/restore (`src/components/imports/TransactionReviewTable.tsx:505`, `src/components/imports/TransactionReviewTable.tsx:653`, `src/components/imports/TransactionReviewTable.tsx:729`). Adding type editing would touch draft shape, dirty state, category clearing, rule actions, bulk save, and copy. | NONE |
| Reimbursement and transfer must be solved now to satisfy S-05. | S-05 says users can separate expenses, income, reimbursements, and transfers so summaries do not force all rows into expense categorization (`context/foundation/roadmap.md:46`). But UX-05 explicitly left open whether MVP needs reasons like transfer/reimbursement versus a single exclusion flag (`context/foundation/roadmap.md:184`), and the PRD business logic still centers expense categorization against income (`context/foundation/prd.md:97`, `context/foundation/prd.md:99`). | WEAK |

## Narrowing Signals

- The user classified this as several observations, not one defect; that rules out a single implementation fix and points to a scope correction.
- Current persisted/import-time work already supports deterministic sign-derived classification, so removing review-time type editing does not discard the useful Phase 1 behavior.
- The existing review model is category/inclusion-centric; type editing would create a second semantic editing axis in the densest workflow.
- The original product value is trustworthy expense category usage against income, not a full cashflow statement.

## Cross-System Convention

For MVP personal-budget imports, the common minimum viable convention is to keep raw signed bank amounts authoritative, derive outflow/inflow from sign, and let users correct expense categorization rather than exposing a full transaction-type taxonomy. Transfers and reimbursements usually need either account reconciliation, matching, or user-specific semantics to be reliable. The leading hypothesis matches that convention: sign-derived `expense` / `income` is enough for MVP budget math, while richer non-expense classification can remain a later roadmap item.

## Reframed Problem Statement

> **The actual problem to plan around is**: The current plan over-scopes S-05 by treating cashflow type as a review-time user decision, when the MVP only needs deterministic sign-derived separation between expenses and income to keep budget math from forcing positive rows into expense categorization.

This does not mean cashflow type is useless. The useful part is the persisted/import-time distinction between expense and income, because that supports clearer summary math without adding another review control. Reimbursement and transfer are weaker MVP concepts because they require semantics beyond the signed amount and would complicate category/rule invariants before the core budget loop needs them.

## Confidence

**HIGH** - strong evidence from the PRD and current code, direct match with the user's narrowing signal, and the minimum behavior aligns with MVP budgeting convention.

## What Changes for /10x-plan

The plan should be re-scoped around sign-derived imported cashflow type only: negative rows are `expense`, zero/positive rows are `income`, and import review does not expose cashflow type editing. Reimbursement and transfer should be deferred from the MVP plan, including their review controls, rule guards, summary fields, and E2E scenarios.

## References

- Source files: `context/foundation/prd.md:32`, `context/foundation/prd.md:48`, `context/foundation/prd.md:55`, `context/foundation/prd.md:81`, `context/foundation/prd.md:97`, `context/foundation/roadmap.md:20`, `context/foundation/roadmap.md:22`, `context/foundation/roadmap.md:46`, `context/foundation/roadmap.md:184`, `supabase/migrations/20260616113000_cashflow_type_separation.sql:1`, `supabase/migrations/20260616113000_cashflow_type_separation.sql:6`, `src/lib/imports/types.ts:2`, `src/lib/imports/types.ts:4`, `src/lib/imports/validation.ts:20`, `src/lib/imports/validation.ts:158`, `src/lib/imports/validation.ts:297`, `src/components/imports/TransactionReviewTable.tsx:12`, `src/components/imports/TransactionReviewTable.tsx:185`, `src/components/imports/TransactionReviewTable.tsx:399`, `src/components/imports/TransactionReviewTable.tsx:505`
- Related research: none present for `context/changes/cashflow-type-separation/research.md`
- Investigation tasks: local repo inspection only; no sub-agent tasks spawned.
