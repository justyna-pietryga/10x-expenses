<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Import History and Parallel Review

- **Plan**: `context/changes/import-history-and-parallel-review/plan.md`
- **Scope**: Phases 1-4
- **Date**: 2026-06-15
- **Verdict**: REJECTED
- **Findings**: 1 critical, 3 warnings, 1 observation

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | WARNING |
| Scope Discipline | WARNING |
| Safety & Quality | FAIL |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | WARNING |

## Findings

### F1 - Import commit bypasses dirty-state protection

- **Severity**: CRITICAL
- **Impact**: HIGH
- **Dimension**: Safety & Quality
- **Location**: `src/components/imports/ImportWorkspace.tsx:331`
- **Detail**: Committing a new or replacement import replaces the active review without the save/discard protection used for batch switching, so unsaved local drafts can be lost.
- **Fix**: Block import commit while review drafts are dirty, or route import commit through the same guarded switching flow.
- **Decision**: FIXED

### F2 - History query is bounded in UI but unbounded in data access

- **Severity**: WARNING
- **Impact**: MEDIUM
- **Dimension**: Plan Adherence
- **Location**: `src/lib/imports/data.ts:416`
- **Detail**: The implementation reads all owned batches and all owned transaction ids before slicing to the top 50 and counting in memory, which drifts from the bounded history-read intent.
- **Fix**: Push batch limiting and transaction scoping closer to the database.
- **Decision**: FIXED

### F3 - Client default selection differs from server default selection

- **Severity**: WARNING
- **Impact**: MEDIUM
- **Dimension**: Plan Adherence
- **Location**: `src/components/imports/ImportWorkspace.tsx:491`, `src/lib/imports/data.ts:462`
- **Detail**: The client popstate fallback uses the first visible history row, while the server selects the newest pending batch by import time and otherwise the newest completed batch.
- **Fix**: Share one default-selection rule between server and client.
- **Decision**: FIXED

### F4 - Phase 3 switching coverage is narrower than planned

- **Severity**: WARNING
- **Impact**: LOW
- **Dimension**: Success Criteria
- **Location**: `tests/import-review.test.ts:2148`, `tests/review-persistence-and-rule-application.test.ts:851`
- **Detail**: The tests cover helpers and completion semantics, but they do not fully exercise the planned switching flows and failure behavior at the integration level.
- **Fix**: Add targeted switching and reconciliation coverage for the actual workspace flows.
- **Decision**: FIXED

### F5 - Status artifacts are out of sync with implementation state

- **Severity**: OBSERVATION
- **Impact**: LOW
- **Dimension**: Scope Discipline
- **Location**: `context/foundation/roadmap.md:194`, `context/changes/import-history-and-parallel-review/plan.md:508`, `supabase/snippets/Untitled query 549.sql:1`
- **Detail**: The roadmap still contains a `proposed` status in the detailed UX-06 section, the Phase 4 manual checks remain unchecked, and an unplanned SQL snippet is present.
- **Fix**: Align roadmap/manual status and remove or justify the stray snippet.
- **Decision**: FIXED
