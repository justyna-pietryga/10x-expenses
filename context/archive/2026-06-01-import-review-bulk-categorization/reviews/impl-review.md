<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Import Review Bulk Categorization

- **Plan**: `context/changes/import-review-bulk-categorization/plan.md`
- **Scope**: Full plan review
- **Date**: 2026-06-01
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 2 warnings, 0 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | WARNING |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | WARNING |

## Findings

### F1 — Full-failure bulk saves lose row-level error detail

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: `src/pages/api/imports/transactions/bulk.ts:13`
- **Detail**: The plan requires failed rows to remain retryable with row-level error feedback. When a bulk save has zero successes, the route throws `No transaction categories could be updated` instead of returning the collected `failed` rows. The workspace helper then throws a generic error from `src/components/imports/ImportWorkspace.tsx:41`, so the table can only show a global message in that case. Partial failures work, but full-failure batches lose the per-row error detail the plan asked to preserve.
- **Fix A ⭐ Recommended**: Return `failed` rows even when `updated` is empty, and let the table render them as row errors.
  - Strength: Fixes the behavior at the source and fully matches the Phase 2/3 contract for retryable failed rows.
  - Tradeoff: Slight API contract change; the UI path must treat zero-success responses as structured failure rather than exceptional failure.
  - Confidence: HIGH — the route already has the failed metadata, it is just being discarded on the all-fail path.
  - Blind spot: None significant.
- **Fix B**: Keep the 400 response, but include `failed` in the error body and teach the workspace helper to preserve it.
  - Strength: Preserves the current HTTP error semantics.
  - Tradeoff: Splits failure handling across success and error payload shapes, which is harder to reason about long-term.
  - Confidence: MEDIUM — workable, but more awkward than fixing the route contract directly.
  - Blind spot: We have not verified whether any future caller depends on the current error-only shape.
- **Decision**: FIXED via Fix A

### F2 — Roadmap handoff still presents UX-01 as unimplemented planning work

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: `context/foundation/roadmap.md:178`
- **Detail**: Phase 4 required roadmap/brief alignment for handoff, but the roadmap still shows `UX-01` as `Status: proposed`, and the backlog handoff row still says `Ready for a dedicated /10x-plan cycle`. That creates drift between the completed implementation and the roadmap source of truth.
- **Fix**: Update `UX-01` in the roadmap to reflect that implementation is complete or archive-pending, and remove the “ready for /10x-plan” note.
- **Decision**: FIXED
