<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Transaction Inclusion Control Implementation Plan

- **Plan**: `context/changes/transaction-inclusion-control/plan.md`
- **Scope**: Phases 1-5 of 5
- **Date**: 2026-06-15
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 5 warnings, 0 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | WARNING |
| Scope Discipline | WARNING |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | PASS |

## Findings

### F1 — Single-row review save can partially commit before rule failure

- **Severity**: ⚠️ WARNING
- **Impact**: 🔬 HIGH — architectural stakes; think carefully before deciding
- **Dimension**: Safety & Quality
- **Location**: `src/lib/imports/data.ts:553`
- **Detail**: `updateTransactionReviewAndMaybeRule()` updates the transaction before it finishes the optional rule path. If the later rule upsert or rule-backed transaction update fails, the route returns an error after already mutating the transaction row. That leaves the single-row `PATCH` flow non-atomic and makes retries ambiguous.
- **Fix A ⭐ Recommended**: Move the transaction update and optional rule persistence into one transactional boundary.
  - Strength: Restores the contract the plan describes: one review update operation with truthful success or failure.
  - Tradeoff: Requires either a database transaction/RPC or a deliberate restructuring of the persistence layer.
  - Confidence: HIGH — the current control flow visibly mutates `transactions` before later failure points.
  - Blind spot: I did not verify whether Supabase RPC/transaction helpers are already available elsewhere in this repo.
- **Fix B**: Keep the current flow but validate all rule preconditions before the first update and add explicit rollback on later failure.
  - Strength: Narrower patch if introducing a transactional wrapper is too heavy for this slice.
  - Tradeoff: More fragile than a true transaction; rollback logic can still drift from the write path over time.
  - Confidence: MEDIUM — it addresses the visible failure modes but remains easier to regress.
  - Blind spot: I did not test rollback behavior against all PostgREST failure shapes.
- **Decision**: FIXED via Fix A

### F2 — Row `PATCH` can update a different transaction than the URL identifies

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: `src/pages/api/imports/transactions/[id].ts:11`
- **Detail**: The route validates `transaction_id` from the JSON body and only uses the path id as a default. A request to `/api/imports/transactions/tx-1` can send `{"transaction_id":"tx-2"}` and update a different owned row than the URL names. Ownership still applies, but the route contract is no longer tied to the path resource.
- **Fix**: Ignore `transaction_id` from the body for this route, or reject payloads whose `transaction_id` does not equal `context.params.id`.
- **Decision**: FIXED

### F3 — Excluded transactions can still create rules through the dedicated rule endpoint

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: `src/lib/imports/data.ts:760`
- **Detail**: The single-row review `PATCH` blocks rule creation for excluded transactions, but `createImportReviewRule()` does not check `anchorTransaction.is_included`. A direct `POST /api/imports/transactions/rule` can therefore create and optionally apply a reusable rule from an excluded anchor row, bypassing the feature's own inclusion guard.
- **Fix**: Reject the rule request when the anchor transaction is excluded and add direct route coverage for that case.
- **Decision**: FIXED

### F4 — Import-history ordering and layout work landed outside the approved plan

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: `src/components/imports/ImportHistory.tsx:154`
- **Detail**: The implementation changed import-history breakpoints (`lg` to `xl`) and shipped statement-month-first ordering/copy via the workspace history path, but the plan explicitly scoped the UI work to transaction inclusion and said there would be no broader import-review surface redesign beyond the excluded-transactions section. The change may be useful, but it is not documented in the plan.
- **Fix**: Either document the import-history adjustment as an explicit plan addendum or revert it and move it into a follow-up change.
- **Decision**: FIXED via plan addendum

### F5 — Dashboard warning copy contains a mojibake separator

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: `src/components/dashboard/IncompleteReviewNotice.tsx:33`
- **Detail**: The batch list renders `Â·` instead of the intended separator, which is a visible encoding regression in user-facing copy.
- **Fix**: Replace the corrupted separator with plain ASCII text or a correctly encoded bullet and keep the file ASCII-clean.
- **Decision**: FIXED

## Triage Summary

- **Fixed**: F1, F2, F3, F5
- **Plan updated**: F4
