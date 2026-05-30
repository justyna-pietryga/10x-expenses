<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: First Bank Import Review

- **Plan**: `context/changes/first-bank-import-review/plan.md`
- **Scope**: Full plan
- **Date**: 2026-05-30
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 2 warnings, 1 observation

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | FAIL |

## Findings

### F1 â€” Phase 4 records a lint pass that did not happen

- **Severity**: âš ď¸Ź WARNING
- **Impact**: đź”Ž MEDIUM â€” real tradeoff; pause to reason through it
- **Dimension**: Success Criteria
- **Location**: `context/changes/first-bank-import-review/plan.md:459`
- **Detail**: The plan marks `4.2 npm run lint passes` as complete, but the actual Phase 4 run failed with repo-wide baseline errors outside S-02. The implementation was explicitly adapted around that mismatch, so the progress row now overstates what was verified.
- **Fix**: Change the Phase 4 record to reflect reality: either uncheck `4.2`, or rewrite the row/text to say full lint is blocked by pre-existing baseline issues and only targeted lint passed.
  - Strength: Brings the review trail back in sync with the actual verification evidence and removes a false green signal.
  - Tradeoff: Leaves the plan with an acknowledged exception instead of a clean all-green checklist.
  - Confidence: HIGH â€” the recorded command output and later adaptation discussion both confirm the mismatch.
  - Blind spot: None significant.
- **Decision**: FIXED

### F2 â€” The imports page shows â€śPending reviewâ€ť even when no batch exists

- **Severity**: âš ď¸Ź WARNING
- **Impact**: đźŞ LOW â€” quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: `src/pages/imports.astro:79`
- **Detail**: The header status is derived from `batch?.review_completed_at ? "Review complete" : "Pending review"`. When `batch` is `null`, the page still says `Pending review`, which implies there is an active import waiting for work when there may be no batch at all.
- **Fix**: Add a third state for `batch === null`, such as `No batch yet` or `Ready to import`.
  - Strength: Removes a misleading first impression on an empty workspace with a tiny UI-only change.
  - Tradeoff: None significant.
  - Confidence: HIGH â€” direct code path, no external dependency.
  - Blind spot: None significant.
- **Decision**: FIXED

### F3 â€” Rule-save UX is ambiguous enough to confuse manual verification

- **Severity**: â„ąď¸Ź OBSERVATION
- **Impact**: đź”Ž MEDIUM â€” real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: `src/components/imports/TransactionReviewTable.tsx:28`
- **Detail**: After a successful save, the `Save as rule` checkbox is reset immediately, and the only confirmation is a page-level notice from `src/components/imports/ImportWorkspace.tsx:102`. During manual testing, this made it unclear whether rule creation had actually been processed. The behavior matches the implementation, but the feedback is weak.
- **Fix**: Keep the success feedback local to the edited row, or show explicit rule-created copy that includes what was saved.
  - Strength: Makes a sensitive finance workflow easier to trust without changing the underlying rule model.
  - Tradeoff: Small UX follow-up rather than a strict correctness fix.
  - Confidence: HIGH â€” confirmed by the current code and manual verification feedback.
  - Blind spot: We have not designed the final copy or row-level affordance.
- **Decision**: FIXED
