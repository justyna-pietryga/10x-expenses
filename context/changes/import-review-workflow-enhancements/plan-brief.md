# Import Review Workflow Enhancements - Plan Brief

> Full plan: `context/changes/import-review-workflow-enhancements/plan.md`
> Frame brief: `context/changes/import-review-workflow-enhancements/frame.md`

## What & Why

Import review needs to become a batch-oriented categorization workflow with visible rule semantics, not a table of isolated row updates. This plan turns the post-roadmap notes into three roadmap follow-ups, then implements the first one: bulk category review and save.

## Starting Point

The import review table currently saves one row at a time. Import-created rules are recipient-only and do not apply to other current rows, while the dashboard rule manager already supports richer field-aware rules. Category and rule management surfaces are also spacious, but density is a separate polish problem.

## Desired End State

The roadmap clearly lists `UX-01`, `UX-02`, and `UX-03` as separate follow-ups. `UX-01` ships first: users can change several imported transaction categories, see the unsaved-change count, save all category changes once, and retry only failed rows if something goes wrong.

## Key Decisions Made

| Decision | Choice | Why | Source |
| --- | --- | --- | --- |
| Roadmap shape | Two implementation slices plus one later polish slice | Keeps workflow behavior separate from visual density work. | Plan |
| First priority | Bulk review save first | Fixes the highest-frequency repeated action and creates better state foundations for later rule work. | Plan |
| Save model | Explicit `Save all changes` | Preserves user control over financial edits while removing row-by-row saves. | Plan |
| Failure handling | Per-row partial failures | Successful rows stay saved and failed rows remain retryable. | Plan |
| Rule improvements | Separate `UX-02` | Avoids making the first follow-up too broad. | Plan |
| Current-batch rule behavior | Preview then apply on confirmation in future `UX-02` | Protects trust when a rule may affect multiple finance rows. | Plan |
| Rule provenance | Future row rule badge | Directly answers whether a row already has a saved matching rule. | Plan |
| Density work | Later `UX-03` | Prevents layout polish from obscuring workflow correctness. | Plan |

## Scope

**In scope:** roadmap entries for `UX-01`, `UX-02`, and `UX-03`; bulk category update API; batch-oriented import review UI; dirty-state and save-all behavior; review-complete guard; focused tests.

**Out of scope:** field-aware import rule creation, current-batch rule application, rule provenance badges, category/rule density redesign, transaction source-field editing, and schema changes.

## Architecture / Approach

The plan keeps the existing `/imports` route and transaction model. It adds a category-only bulk update route that returns per-row results, then changes the review UI to hold local drafts, derive dirty rows, and submit all changed categories through one save action.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Roadmap Follow-Up Structure | Adds `UX-01`, `UX-02`, and `UX-03` to roadmap/handoff | Accidentally making one broad enhancement blob instead of sequenced follow-ups |
| 2. Bulk Category Update API | Adds category-only bulk save backend and tests | Ownership and partial failure semantics must stay safe |
| 3. Batch-Oriented Review UI | Replaces row saves with dirty state and save-all flow | Users must not lose unsaved work or complete review with drafts pending |
| 4. Regression and Handoff | Confirms behavior and docs stay aligned | UX-02/UX-03 must remain clearly future work |

**Prerequisites:** Completed import review flow from S-02 and two-bank support from S-04.
**Estimated effort:** ~3-4 implementation sessions across 4 phases.

## Open Risks & Assumptions

- Bulk updates are expected to handle normal monthly statement sizes synchronously.
- No schema migration is needed because only persisted `transactions.category_id` changes.
- Existing row-level rule save behavior may need to remain temporarily until `UX-02`, even if the category save model changes.

## Success Criteria Summary

- The roadmap explicitly captures the three post-MVP UX follow-ups.
- Import review lets users edit multiple categories and save them once.
- The UI clearly shows unsaved rows, save results, and blocks review completion while drafts are pending.
