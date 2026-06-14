# Import History and Parallel Review - Plan Brief

> Full plan: `context/changes/import-history-and-parallel-review/plan.md`

## What & Why

Implement `UX-06` so users can see past import batches, reopen an older batch intentionally, and move across several bank-month reviews without the app collapsing everything into "latest batch only." The goal is to make interrupted review and multi-account backfilling trustworthy, while keeping one active review surface at a time instead of inventing a heavy multi-pane editor.

## Starting Point

The app already persists import batches and their transactions, supports reopening one explicit batch through `?batch=<id>`, and tracks review completion per batch. What is missing is a discovery surface for older batches, a client-side switching model that can preserve unsaved drafts per batch, and a clear rule for what happens when a completed batch is edited later.

## Desired End State

A user can open `/imports`, see an inline history list with bank, month, imported date, review status, and row count, and choose which batch to work on. The default no longer forces a latest batch open; instead, the page can land on history-only until the user picks a batch, then let them switch between batches while preserving unsaved drafts client-side per batch. If a saved change touches a previously completed batch, that batch returns to pending review until the user marks it complete again.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| History surface | Inline history panel on `/imports` | Keeps import, resume, and review in one workspace instead of splitting the core flow across routes. | Plan |
| Default list ordering | Incomplete first, then newest imported | Prioritizes unfinished work without hiding fresh imports. | Plan |
| History metadata | Bank, month, imported date, review status, row count | Gives enough context to reopen the right batch confidently without overcrowding the panel. | Plan |
| Completed-batch behavior | Completed batches reopen editable with visible completed state | Supports real correction workflows without pretending older reviewed data is immutable. | Plan |
| Post-edit review state | Saved edits clear completion and return batch to pending review | Preserves the trust model that "review complete" means this exact saved state was reviewed. | Plan |
| Unsaved switch behavior | Preserve drafts client-side per batch | Lets users move across multiple batches without forced save/discard interruptions on every switch. | Plan |
| No-selection landing | Show history only until a batch is picked | Makes the new history capability explicit and avoids silently privileging one batch. | Plan |
| Parallel-review scope | One active batch at a time with fast switching | Delivers the roadmap value without a much riskier multi-pane editor. | Plan |

## Scope

**In scope:** import-history list data and UI, client-side batch detail loading, per-batch draft preservation in the review workspace, completed-batch reopen semantics, completion reset on saved edits, focused import and summary regressions.

**Out of scope:** multi-pane review, local-storage draft persistence across refresh, cross-tab synchronization, bulk actions across multiple batches, import-history analytics, and dashboard redesign beyond behavior that naturally changes when review completion is cleared.

## Architecture / Approach

Keep `/imports` as the single workspace, but split it into two concerns: a history panel that lists available batches and a review pane that loads one selected batch on demand. Add lightweight batch-list and batch-detail contracts for client-side switching, store unsaved drafts keyed by batch id in the React workspace, and update transaction-save helpers so successful edits to a completed batch clear `review_completed_at`. Reuse the existing review-complete action to let the user explicitly re-certify that batch afterward.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. History Data and Read Contracts | Batch list metadata plus client-side detail loading for one selected batch | New read surfaces can drift on ownership or expose incomplete metadata |
| 2. Imports Workspace History UX | Inline history panel and history-first landing with active-batch switching | Switching can feel confusing if selection and status cues are weak |
| 3. Parallel Review State and Completion Semantics | Per-batch draft preservation and completion reset after saved edits | Draft state can become inconsistent if batch-local state is not isolated cleanly |
| 4. Regression and Summary Integrity | Trustworthy behavior when reopened edits affect review-complete months | Summary trust cues can silently drift if reopened batches do not become pending again |

**Prerequisites:** `S-02`, `S-04`, and `UX-01` are already in place.
**Estimated effort:** ~3-4 implementation sessions across 4 phases.

## Open Risks & Assumptions

- In-memory per-batch draft preservation is sufficient for this slice; drafts do not need to survive a full page refresh.
- The existing transaction save endpoints can carry completion-reset behavior without a separate reopen endpoint.
- Row counts can be derived cheaply enough for MVP-scale batch history without adding a dedicated aggregate table.

## Success Criteria (Summary)

- A user can discover and reopen older import batches from `/imports` without relying on a manual query param.
- A user can switch across multiple batches in one session while unsaved drafts remain isolated to the batch where they were created.
- Editing a completed batch makes it pending again until the user explicitly re-marks review complete, and downstream trust cues reflect that change.
