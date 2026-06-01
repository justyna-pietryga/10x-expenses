# Import Review Workflow Enhancements - Plan Brief

> Full plan: `context/changes/import-review-workflow-enhancements/plan.md`
> Frame brief: `context/changes/import-review-workflow-enhancements/frame.md`

## What & Why

This change converts the post-roadmap enhancement notes into three clear roadmap follow-ups. It is a roadmap-structure change only, so each follow-up can go through the normal `/10x-plan -> /10x-implement` cycle separately.

## Desired End State

The roadmap lists:

- `UX-01`: bulk import review/category saving with clear unsaved state.
- `UX-02`: field-aware import rules, rule provenance, and current-batch rule application.
- `UX-03`: denser category and rule management surfaces.

## Scope

**In scope:** roadmap entries, UX follow-up sections, dependencies, and backlog handoff rows.

**Out of scope:** implementing `UX-01`, `UX-02`, or `UX-03` product behavior.

## Correction Note

An earlier version of this plan accidentally mixed roadmap structuring with implementing `UX-01`. The accidental Phase 2 implementation work was reverted in commit `492a914`. Future implementation should start with a fresh dedicated plan for the selected roadmap item.

## Next Classic Flow

1. Pick the next roadmap item, probably `UX-01`.
2. Run `/10x-plan <change-id>` for that one item only.
3. Review the plan.
4. Run `/10x-implement <change-id> phase 1`.
