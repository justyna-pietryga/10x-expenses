# Import Review Workflow Enhancements Roadmap Plan

## Overview

Turn the post-roadmap enhancement notes into clear roadmap follow-up slices. This change is intentionally documentation-only: it updates `context/foundation/roadmap.md` so the next work can go through the normal `/10x-plan -> /10x-implement` flow one task at a time.

## Scope Correction

The original plan mixed two different jobs:

- Structuring the roadmap after the first MVP loop.
- Implementing `UX-01` bulk import review behavior.

That was too broad for the user's stated intent. Phase 2 implementation work was started by mistake and reverted in commit `492a914`. No `UX-01` product implementation should remain in this change.

## Desired End State

The roadmap lists three separate proposed follow-up slices:

- `UX-01 import-review-bulk-categorization`: bulk review save with clear unsaved state.
- `UX-02 import-review-rule-application`: field-aware rules from import review, visible rule provenance, and current-batch rule application.
- `UX-03 management-surface-density`: denser category and rule management layouts.

Each follow-up should be planned and implemented separately. The next classic flow should be:

1. `/10x-plan import-review-bulk-categorization` for `UX-01`.
2. `/10x-implement <ux-01-change-id> phase 1`.
3. Repeat separately for `UX-02` and `UX-03` only after their prerequisites are ready.

## What This Change Does Not Implement

- No bulk category update API.
- No batch-oriented import review UI.
- No review-complete dirty-state guard.
- No field-aware import rule creation.
- No current-batch rule application.
- No category/rule density redesign.

## Phase 1: Roadmap Follow-Up Structure

### Overview

Add the framed post-MVP follow-ups to `context/foundation/roadmap.md` so the backlog reflects the problems found after completing S-04.

### Changes Required

**File**:

- `context/foundation/roadmap.md`

**Contract**:

- Add `UX-01`, `UX-02`, and `UX-03` to the "At a glance" table.
- Add matching sections under `## UX Follow-ups`.
- Mark all three as `proposed`.
- Set dependencies:
  - `UX-01` depends on `S-02`.
  - `UX-02` depends on `UX-01` and `S-03`.
  - `UX-03` depends on `UX-01` and `UX-02`.
- Add backlog handoff rows for all three follow-ups.
- Mark `UX-01` as ready for planning.
- Mark `UX-02` and `UX-03` as not ready until their prerequisites land.
- Keep completed `F-01` and `S-01` through `S-04` unchanged.

### Success Criteria

#### Automated Verification

- `rg -n "UX-01|UX-02|UX-03" context/foundation/roadmap.md` shows all three entries.
- `npx prettier --check context/foundation/roadmap.md` passes.

#### Manual Verification

- Confirm the roadmap reflects three separate follow-ups rather than one large mixed enhancement.
- Confirm `UX-01` is the first implementation target and `UX-02`/`UX-03` remain follow-ups.

## References

- Frame brief: `context/changes/import-review-workflow-enhancements/frame.md`
- User notes: `context/foundation/resources/enhancements-notes-after-first-roadmap.md`
- Current roadmap: `context/foundation/roadmap.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append `— <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Roadmap Follow-Up Structure

#### Automated

- [x] 1.1 `rg -n "UX-01|UX-02|UX-03" context/foundation/roadmap.md` shows all three entries. — fb2c994
- [x] 1.2 `npx prettier --check context/foundation/roadmap.md` passes. — fb2c994

#### Manual

- [x] 1.3 Confirm the roadmap reflects three separate follow-ups rather than one large mixed enhancement. — fb2c994
- [x] 1.4 Confirm `UX-01` is the first implementation target and `UX-02`/`UX-03` remain follow-ups. — fb2c994
