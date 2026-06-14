# Import History and Parallel Review - Plan Brief

> Full plan: `context/changes/import-history-and-parallel-review/plan.md`

## What & Why

Add a collapsible import-history surface to `/imports` so users can find older imports, resume unfinished batches, correct completed reviews, and keep several bank-month imports moving independently. Today the data model supports multiple batches, but the interface exposes only one active review and defaults to the most recently imported batch.

## Starting Point

`/imports?batch=<id>` can already server-render one owned batch, and persisted transactions remain editable after completion. The missing pieces are a bounded history query, pending-first default selection, responsive navigation, and protection against losing local drafts while switching.

## Desired End State

The import workspace shows up to 50 batches in a collapsible desktop sidebar or mobile slide-over. Pending batches appear first, and the newest pending review opens by default. Users can switch cleanly, or choose to stay, discard and switch, or save and switch when edits are pending.

Completed batches reopen in the normal editable review surface and remain marked complete after corrections. New and replacement imports update history and become selected immediately.

## Key Decisions Made

| Decision            | Choice                                           | Why                                                                                  |
| ------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------ |
| History location    | Collapsible panel inside `/imports`              | Keeps upload, history, and review together without permanently reducing review space |
| Default batch       | Newest pending, then newest completed            | Resumes unfinished work before revisiting finished imports                           |
| Completed reviews   | Editable while retaining completed status        | Allows historical corrections without a new reopen lifecycle                         |
| Dirty switching     | Stay, discard and switch, or save and switch     | Protects work while supporting quick movement                                        |
| Ordering            | Pending first; newest month/import within groups | Makes unfinished work visible and keeps each group predictable                       |
| History metadata    | Bank, month, status, filename, row count         | Gives enough context to identify a batch without loading its transactions            |
| History size        | Latest 50 batches                                | Fits personal MVP scale without pagination or unbounded reads                        |
| After import        | Update history and select committed batch        | Preserves the direct transition from import into review                              |
| Collapse preference | Browser `localStorage`                           | Keeps the panel out of the way across visits without adding server state             |
| Mobile layout       | Accessible slide-over                            | Preserves transaction review width on small screens                                  |
| Testing             | Vitest contracts plus one focused E2E            | Covers ownership and ordering while exercising dirty switching in a browser          |

## Scope

**In scope:**

- Pending-first batch selection and bounded history reads.
- Collapsible desktop history and mobile slide-over.
- On-demand switching with URL synchronization.
- Save/discard confirmation for any unsaved review edits.
- Editable completed batches that retain completion status.
- Immediate history reconciliation after create or replace.
- Ownership, integration, and focused Playwright coverage.

**Out of scope:**

- Simultaneous multi-table editing or persistent per-batch drafts.
- Pagination, search, filtering, deletion, archival, or file download.
- Cross-device layout preferences.
- A separate history route or dashboard surface.
- Schema and RLS changes.

## Architecture / Approach

`imports.astro` server-loads categories, the 50-row history summary, and one selected review. `ImportWorkspace` coordinates history selection, generic dirty-state save/discard operations, on-demand review fetches, URL updates, and import reconciliation. `TransactionReviewTable` continues to own draft details, keeping navigation compatible with both current category edits and planned inclusion edits.

## Phases at a Glance

| Phase                | What it delivers                                           | Key risk                                          |
| -------------------- | ---------------------------------------------------------- | ------------------------------------------------- |
| 1. Read contracts    | Bounded history, pending-first selection, owned review API | Efficient transaction counts without N+1 queries  |
| 2. History surface   | Desktop collapse, mobile slide-over, batch metadata        | Responsive accessibility and hydration preference |
| 3. Guarded switching | Save/discard navigation, URL sync, historical edits        | Partial save or load failure losing active state  |
| 4. E2E and handoff   | Browser regression and repository quality gates            | Reliable independent setup and cleanup            |

**Prerequisites:** Existing bank-month identity and bulk dirty-state review workflow; coordinate with the planned transaction-inclusion change.

**Estimated effort:** Approximately 4 implementation sessions across 4 phases.

## Open Risks & Assumptions

- Supabase count aggregation must support one bounded history query; otherwise use a narrowly scoped database aggregate rather than per-batch queries.
- Browser back/forward navigation must not bypass the dirty-state guard.
- Transaction inclusion may change the review draft shape, so the switch contract must remain field-agnostic.
- History is intentionally limited to recent 50 batches; older-history discovery is deferred.

## Success Criteria (Summary)

- Users can quickly find and reopen pending or completed imports without finishing another batch first.
- Switching never silently drops unsaved review edits, including save-failure cases.
- History stays out of the way when collapsed and remains accessible on desktop and mobile.
