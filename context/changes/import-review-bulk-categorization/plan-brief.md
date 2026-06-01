# Import Review Bulk Categorization - Plan Brief

> Full plan: `context/changes/import-review-bulk-categorization/plan.md`
> Frame brief: `context/changes/import-review-workflow-enhancements/frame.md`

## What & Why

The actual problem is that import review is still row-local: users must click `Save category` on every edited transaction. This plan implements `UX-01` by making category review batch-oriented while keeping rule semantics out of scope for `UX-02`.

## Starting Point

`TransactionReviewTable` stores per-row drafts and saves one row at a time. `ImportWorkspace` calls the existing single-row transaction route, and `ReviewCompletionBar` can mark review complete without knowing about unsaved local category drafts.

## Desired End State

Users can edit multiple transaction categories, see an unsaved-change count, save all changed categories once, discard drafts, and retry failed rows. Review completion is blocked until category drafts are saved or discarded. Bulk save is category-only and does not create rules.

## Key Decisions Made

| Decision         | Choice                                                          | Why                                                                                   | Source         |
| ---------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------- | -------------- |
| Scope            | `UX-01` only                                                    | Keeps rule provenance and current-batch rule application in `UX-02`.                  | Roadmap / Plan |
| Save model       | Explicit `Save all changes`                                     | Preserves user control over financial edits while removing row-by-row category saves. | Plan           |
| Failure handling | Save successes, keep failed rows dirty                          | Preserves progress and makes retry behavior clear.                                    | Plan           |
| Completion guard | Disable with explanation                                        | Prevents summaries from trusting unsaved local category drafts.                       | Plan           |
| Discard behavior | Add `Discard changes`                                           | Gives users a safe way out of dirty state.                                            | Plan           |
| API shape        | New category-only bulk endpoint                                 | Keeps one-request save-all behavior without breaking the existing single-row route.   | Plan           |
| Rule shortcut    | Keep separate/temporary                                         | Avoids absorbing `UX-02` rule work into this slice.                                   | Frame / Plan   |
| Testing depth    | Backend plus UI-state coverage in `tests/import-review.test.ts` | Protects the risky contracts without adding a browser test stack.                     | Plan           |

## Scope

**In scope:** bulk category update validation/helper/API, dirty-state review table, unsaved count, save-all, discard, partial-failure row feedback, review-complete guard, focused tests.

**Out of scope:** field-aware import rules, rule provenance, current-batch rule application, category/rule density redesign, schema changes, transaction source-field editing, autosave.

## Architecture / Approach

Add `PATCH /api/imports/transactions/bulk` beside the existing single-row route. The UI derives dirty category updates from local drafts, sends them through the bulk endpoint, merges successful returned transactions into workspace state, and keeps failures visible in the table. The completion bar receives dirty-state information from the workspace and blocks completion until changes are saved or discarded.

## Phases at a Glance

| Phase                                    | What it delivers                                           | Key risk                                                          |
| ---------------------------------------- | ---------------------------------------------------------- | ----------------------------------------------------------------- |
| 1. Bulk Category Save Contract           | Category-only bulk validation/helper/API and backend tests | Ownership and no-rule side effects must stay safe                 |
| 2. Review Table Dirty-State UI           | Unsaved count, save-all, discard, row status/error UI      | Dirty state can drift if not derived from persisted values        |
| 3. Workspace Wiring and Completion Guard | Bulk endpoint integration and blocked review completion    | Failed rows must remain retryable without losing successful saves |
| 4. Regression and Handoff                | Final validation and scope alignment                       | Avoid claiming `UX-02` rule behavior shipped                      |

**Prerequisites:** Completed import review flow from `S-02`; field-aware rules from `S-03` may exist but are not changed here.
**Estimated effort:** ~3-4 implementation sessions across 4 phases.

## Open Risks & Assumptions

- Normal monthly import batch sizes are small enough for a synchronous bulk request.
- Existing row-level `Save as rule` can remain separate temporarily without confusing users too much.
- Static/rendered tests are sufficient for this slice; full browser automation can remain optional manual verification.

## Success Criteria Summary

- Users save multiple category changes with one explicit action.
- Failed rows stay dirty and retryable while successful rows update in place.
- Review completion is blocked until category drafts are saved or discarded.
- Rule creation/application remains clearly out of scope for `UX-01`.
