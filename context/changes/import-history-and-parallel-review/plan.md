# Import History and Parallel Review Implementation Plan

## Overview

Implement roadmap item `UX-06`: let a signed-in user see past import batches, reopen older reviews intentionally, and work across multiple persisted bank-month batches without being trapped in a "latest batch only" flow. The first cut should keep one active review pane at a time, add an inline import-history panel inside `/imports`, preserve unsaved drafts client-side per batch while switching, and invalidate prior review completion when saved edits change a previously completed batch.

## Current State Analysis

The import domain already persists statement batches by bank and statement month, stores reviewed transactions, and supports explicit review completion with `review_completed_at`. The imports page can also open a specific batch through the `?batch=` query parameter. That means the domain already supports resumable review at the storage layer.

What is missing is the workspace around that domain. Today `/imports` either loads the requested `batch` query param or silently falls back to the latest batch. There is no import-history surface to discover older batches, no client-side contract for switching between batches without a full page reload, and no rule for what happens when a user saves edits against a batch that was previously marked complete.

### Key Discoveries

- The roadmap defines `UX-06` as seeing older imports, reopening past batches, and reviewing multiple bank-month imports in parallel without being forced to finish one first: `context/foundation/roadmap.md`.
- The imports page already resolves either `selectedBatchId` or the latest batch server-side, which proves batch reopening exists but discoverability does not: `src/pages/imports.astro`.
- Import review data helpers already have a clean seam for loading one batch and its transactions, but only expose single-batch reads and latest-batch fallback: `src/lib/imports/data.ts`.
- The workspace and review table are currently designed around one static initial batch plus local dirty state, not around a switchable history-backed set of batches: `src/components/imports/ImportWorkspace.tsx`, `src/components/imports/TransactionReviewTable.tsx`.
- Transaction saves and review completion are separate flows today. Saving category or inclusion edits does not currently mutate the parent batch's `review_completed_at`, so a reopened completed batch could remain falsely trusted after edits unless this slice changes that contract: `src/lib/imports/data.ts`, `src/pages/api/imports/transactions/[id].ts`, `src/pages/api/imports/transactions/bulk.ts`, `src/pages/api/imports/batches/[id]/complete.ts`.
- The dashboard summary already treats batch completion as the trust boundary for reviewed versus incomplete spend, so clearing completion after saved edits is the least surprising way to keep summary semantics honest: `src/lib/summary/data.ts`.
- Existing tests already cover import-review contracts, route ownership boundaries, and summary trust behavior in the right places for this slice: `tests/import-review.test.ts`, `tests/auth-and-ownership-boundaries.test.ts`, `tests/monthly-summary-and-rules.test.ts`.

## Desired End State

A signed-in user opens `/imports` and sees a history panel listing past import batches with bank, statement month, imported date, review status, and row count. If no batch is preselected, the page can land in a history-first state instead of auto-opening the latest batch. When the user chooses a batch, the workspace loads that batch into the existing review pane without leaving the page.

The user can then move between batches in the same session. Unsaved drafts remain isolated per batch in client memory, so switching away from one batch does not force immediate save or discard and does not leak those drafts into other batches. Only one batch is actively rendered for editing at a time.

If the user saves review changes against a batch that had already been marked complete, the app clears that batch's completion marker and shows it as pending review again. The user can still explicitly complete the batch afterward through the existing completion action. As a result, the dashboard summary for that month remains aligned with what has truly been reviewed in the latest saved state.

## What We're NOT Doing

- No simultaneous multi-pane or side-by-side batch editing.
- No draft persistence across full page refresh, browser restart, or another tab.
- No new schema for batch-level notes, tags, or archival labels.
- No history filtering beyond the default ordering and the selected-item state.
- No import-history analytics, charts, or dashboard duplication of the history panel.
- No cross-batch bulk operations such as "mark all complete" or "apply rule to several batches."
- No new reopen endpoint that changes batch state without an actual saved review edit.

## Implementation Approach

Keep `/imports` as the single review workspace, but split it into two data contracts:

1. a batch-history list contract for the left-side or top-side history panel
2. a batch-detail contract for loading one selected batch's transactions on demand

The server-rendered page should load categories plus history metadata for all visible import batches. Batch details should be fetched client-side when the user selects a batch so the page can preserve local draft state keyed by batch id rather than hard-reloading the whole route.

On the write path, reuse the existing transaction save endpoints instead of inventing a separate reopen flow. When a save request changes one or more transactions inside a batch that currently has `review_completed_at`, that save should clear the batch completion marker as part of the same trusted transition. The existing "mark review complete" action then becomes the explicit re-certification step after edits.

## Critical Implementation Details

### Draft Preservation Is Batch-Scoped, Not Global

The user's chosen behavior is not "block switching until save or discard"; it is "preserve drafts client-side per batch." That means the workspace state must be keyed by batch id for drafts, per-row errors, success notices, and any related UI toggles that would otherwise bleed between batches. A single top-level `drafts` object is no longer sufficient.

### Viewing a Completed Batch Must Not Reopen It

Opening an older completed batch should remain a read of persisted data only. The batch becomes pending again only after a save actually changes transaction review state. This preserves the distinction between "I looked at it again" and "I changed what was previously certified."

### History-Only Landing Is Intentional

When no batch is selected, the page should show history without auto-picking a batch. This is a deliberate UX choice, not an incomplete state. The workspace needs an empty-state message that invites the user to choose a batch from history or create a new import above.

### Review Completion Is a Trust Boundary

Clearing completion on saved edits is not cosmetic. The summary service already uses completion to decide what counts as reviewed versus incomplete. This slice should preserve that trust contract instead of introducing hidden exceptions for reopened batches.

## Phase 1: Import History Data and Read Contracts

### Overview

Add the data helpers and read surfaces needed to render import history and load one batch on demand without relying on a full page reload.

### Changes Required:

#### 1. Import Batch Summary Type

**File**: `src/lib/imports/data.ts`

**Intent**: Define one stable shape for batch-history cards so the page and API do not duplicate ad hoc batch metadata rules.

**Contract**: Introduce a batch-summary contract that includes `id`, `bank`, `statement_month`, `imported_at`, `review_completed_at`, `source_filename`, and `row_count`. Keep it separate from full batch-detail payloads.

#### 2. Batch History Loader

**File**: `src/lib/imports/data.ts`

**Intent**: Load all user-owned import batches in the product-chosen ordering for the history panel.

**Contract**: Add a helper that returns import batches ordered as incomplete first, then newest import timestamp descending within each group. The helper should derive row counts per batch and return only user-owned rows.

#### 3. Batch Detail Loader Reuse

**File**: `src/lib/imports/data.ts`

**Intent**: Keep one authoritative way to load a batch and its transactions whether the consumer is Astro SSR or a client-side fetch route.

**Contract**: Reuse or lightly refactor `loadImportBatchReview` so the same helper can serve both initial page loads and a new batch-detail API route without changing the returned review-row contract.

#### 4. Batch Detail API Route

**File**: `src/pages/api/imports/batches/[id].ts`

**Intent**: Let the imports workspace fetch one batch's current persisted review state after the page has already loaded.

**Contract**: Add a protected `GET` route that returns `{ batch, transactions }` for one owned batch id and preserves the existing import JSON error shape for missing or unauthorized access.

#### 5. Imports Page Server Load

**File**: `src/pages/imports.astro`

**Intent**: Shift the page from "always one preloaded batch" toward "history plus optional active batch."

**Contract**: Load active categories and import history on every request. Only preload batch detail when an explicit `batch` query param is present; otherwise pass `null` for the active batch/transactions so the client can render the history-first state.

#### 6. Read-Contract Tests

**Files**:

- `tests/import-review.test.ts`
- `tests/auth-and-ownership-boundaries.test.ts`

**Intent**: Protect the new history metadata and batch-detail ownership boundary before UI complexity lands.

**Contract**: Add coverage proving history ordering, row-count metadata, and batch-detail ownership enforcement. A user must never be able to load another user's batch through the new route.

### Success Criteria:

#### Automated Verification:

- `npm test -- tests/import-review.test.ts tests/auth-and-ownership-boundaries.test.ts` passes with history-read coverage.
- `npx astro check` passes after the new read contracts are wired in.
- Targeted `npx eslint src/lib/imports/data.ts src/pages/api/imports/batches/[id].ts src/pages/imports.astro tests/import-review.test.ts tests/auth-and-ownership-boundaries.test.ts` passes.

#### Manual Verification:

- Confirm the history contract exposes bank, month, imported date, review status, and row count for each batch.
- Confirm incomplete batches sort ahead of completed ones, with newer imports first inside each status group.
- Confirm requesting another user's batch id through the new detail route returns the expected protected error response.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before changing the imports workspace UI.

---

## Phase 2: Imports Workspace History UX

### Overview

Add the inline history panel and history-first landing so users can intentionally choose which batch to review.

### Changes Required:

#### 1. Imports Page Composition

**Files**:

- `src/pages/imports.astro`
- `src/components/imports/ImportWorkspace.tsx`

**Intent**: Reframe `/imports` around a history-aware workspace instead of a single preselected review table.

**Contract**: Pass history data into `ImportWorkspace` alongside categories and any optionally preloaded active batch detail. The client component becomes responsible for rendering the history panel and the active review pane together.

#### 2. History Panel UI

**File**: `src/components/imports/ImportWorkspace.tsx`

**Intent**: Make past import batches discoverable and scannable in the same workspace where review happens.

**Contract**: Render an inline history panel showing one item per batch with bank, statement month, imported date, review status, and row count. The active item must be visually distinct, and completed versus pending states must be obvious without opening the batch.

#### 3. History-First Empty State

**File**: `src/components/imports/ImportWorkspace.tsx`

**Intent**: Respect the chosen no-selection default behavior.

**Contract**: When no active batch is selected, show a deliberate empty state in the review pane that asks the user to choose a batch from history or create a new import. Do not silently auto-select the highest-priority batch.

#### 4. Client-Side Batch Switching

**File**: `src/components/imports/ImportWorkspace.tsx`

**Intent**: Switch active review batches without a full document reload.

**Contract**: Selecting a history item fetches batch detail from the new detail route, updates the active review pane, and preserves the rest of the page state. Loading and error states should be batch-specific and should not wipe the entire history list.

#### 5. URL Alignment

**File**: `src/components/imports/ImportWorkspace.tsx`

**Intent**: Keep direct links and refresh behavior useful even though switching is now client-driven.

**Contract**: When the active batch changes, keep the `?batch=` query param synchronized so refresh and sharing still reopen that batch. When no batch is selected, the URL should omit the query param or leave it empty consistently.

#### 6. Workspace-History Tests

**File**: `tests/import-review.test.ts`

**Intent**: Protect the visible history experience before draft preservation complicates state transitions.

**Contract**: Add rendered/helper coverage for the history panel metadata, selected-batch styling/copy, history-first empty state, and client-side fetch behavior expectations at the helper seam.

### Success Criteria:

#### Automated Verification:

- `npm test -- tests/import-review.test.ts` passes with history-panel coverage.
- `npx astro check` passes.
- Targeted `npx eslint src/components/imports/ImportWorkspace.tsx src/pages/imports.astro tests/import-review.test.ts` passes.

#### Manual Verification:

- Opening `/imports` with no `batch` query param shows import history instead of silently opening the latest batch.
- Clicking a history item loads that batch into the review pane and updates the selected state clearly.
- Refreshing the page with `?batch=<id>` still reopens the selected batch.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before adding per-batch draft preservation and completion-reset logic.

---

## Phase 3: Parallel Review State and Completion Semantics

### Overview

Preserve unsaved review drafts per batch while switching, and make saved edits to completed batches return them to pending review.

### Changes Required:

#### 1. Batch-Scoped Draft Store

**Files**:

- `src/components/imports/ImportWorkspace.tsx`
- `src/components/imports/TransactionReviewTable.tsx`

**Intent**: Keep unsaved changes attached to the batch where they were made instead of blocking every switch.

**Contract**: Store draft review state keyed by batch id, including pending category/inclusion edits and row-level feedback needed to resume that batch cleanly. Switching to another batch must restore that batch's local draft state if it exists, without mixing drafts across batches.

#### 2. Review Table State Injection

**File**: `src/components/imports/TransactionReviewTable.tsx`

**Intent**: Let the review table render whichever batch-local draft state the workspace selects.

**Contract**: Expand the component props and callbacks so the table can receive externally managed initial/current state per batch rather than assuming a single global draft lifecycle for the whole page.

#### 3. Save-Merge Behavior for Completed Batches

**Files**:

- `src/lib/imports/data.ts`
- `src/pages/api/imports/transactions/[id].ts`
- `src/pages/api/imports/transactions/bulk.ts`

**Intent**: Preserve summary trust when a completed batch is edited later.

**Contract**: When a save request actually changes one or more transactions in a batch whose `review_completed_at` is set, clear that completion marker as part of the same persisted transition. Return the updated batch review state needed for the workspace to reflect the now-pending status.

#### 4. Review Completion Bar Refresh

**Files**:

- `src/components/imports/ImportWorkspace.tsx`
- `src/components/imports/ReviewCompletionBar.tsx`

**Intent**: Make the completion state truthful after reopening and saving changes.

**Contract**: After successful edits to a previously completed batch, the completion bar and status copy must switch back to pending review. The existing complete action remains the way to re-mark that batch as done after the user finishes reviewing the saved changes.

#### 5. Batch-Switch Messaging

**File**: `src/components/imports/ImportWorkspace.tsx`

**Intent**: Prevent preserved drafts from feeling invisible or lost.

**Contract**: Add lightweight notices or status cues so the user can tell when the active batch has unsaved local drafts versus clean persisted state. The cue should be batch-local and should not imply cross-refresh persistence.

#### 6. Parallel-Review and Completion Tests

**Files**:

- `tests/import-review.test.ts`
- `tests/monthly-summary-and-rules.test.ts`

**Intent**: Lock in the batch-switching and trust-boundary behavior that makes this slice valuable.

**Contract**: Add coverage proving drafts remain isolated per batch in the workspace seam, saving a reopened completed batch clears completion, and summary trust calculations move that batch back into incomplete-review behavior until completion is restored.

### Success Criteria:

#### Automated Verification:

- `npm test -- tests/import-review.test.ts tests/monthly-summary-and-rules.test.ts` passes with parallel-review and completion-reset coverage.
- `npx astro check` passes.
- Targeted `npx eslint src/components/imports/ImportWorkspace.tsx src/components/imports/TransactionReviewTable.tsx src/components/imports/ReviewCompletionBar.tsx src/lib/imports/data.ts tests/import-review.test.ts tests/monthly-summary-and-rules.test.ts` passes.

#### Manual Verification:

- Make unsaved changes in one batch, switch to another batch, then return and confirm the first batch's drafts are still present in that browser session.
- Save changes to a previously completed batch and confirm its status becomes pending review immediately afterward.
- Confirm the user can explicitly mark that batch complete again once review is finished.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before final regression cleanup.

---

## Phase 4: Regression Hardening and Handoff

### Overview

Complete the slice with regression coverage and small integration polish so import history, reopened review, and summary trust remain coherent together.

### Changes Required:

#### 1. Import Commit and History Refresh

**File**: `src/components/imports/ImportWorkspace.tsx`

**Intent**: Keep the history panel current when a new batch is created or replaced from the same workspace.

**Contract**: After a successful import commit, update local history metadata so the new or replaced batch appears with correct ordering, row count, and pending/completed status without forcing a full page refresh.

#### 2. Cross-Flow Status Consistency

**Files**:

- `src/pages/imports.astro`
- `src/components/imports/ImportWorkspace.tsx`
- `src/lib/summary/data.ts`

**Intent**: Ensure the reopened-batch trust model stays consistent across imports and dashboard behavior.

**Contract**: Preserve one meaning of review completion everywhere: if saved edits cleared it, imports history and summary calculations must both treat that batch as pending until the user completes review again.

#### 3. Final Regression Coverage

**Files**:

- `tests/import-review.test.ts`
- `tests/auth-and-ownership-boundaries.test.ts`
- `tests/monthly-summary-and-rules.test.ts`

**Intent**: Protect the whole slice against regressions after the state-management changes settle.

**Contract**: Keep targeted coverage for history ordering, batch-detail ownership, history-first landing, per-batch draft preservation, completion reset on edit, and summary incomplete-review fallout from reopened batches.

### Success Criteria:

#### Automated Verification:

- `npm test -- tests/import-review.test.ts tests/auth-and-ownership-boundaries.test.ts tests/monthly-summary-and-rules.test.ts` passes.
- `npm run lint` passes.
- `npm run build` passes.

#### Manual Verification:

- Import a new batch and confirm it appears in history with the expected metadata and pending status.
- Reopen an older completed batch, save a change, and confirm both imports history and dashboard trust cues now treat it as pending review.
- Re-complete that batch and confirm the pending-review cues disappear again.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before impl-review or archive.

## Testing Strategy

### Unit Tests:

- Batch-history ordering and row-count derivation.
- Batch-scoped draft preservation and restore behavior in workspace helpers.
- Completion-reset logic when transaction saves touch a previously completed batch.

### Integration Tests:

- Protected batch-detail route returns owned batch review data only.
- Imports workspace can load, switch, and restore batch-local drafts across several batches.
- Summary recomputation treats edited completed batches as pending until review is re-completed.

### Manual Testing Steps:

1. Sign in and open `/imports` with no `batch` query param.
2. Confirm the page shows import history and an empty-state review pane rather than auto-opening a batch.
3. Open one pending batch and make a draft change without saving.
4. Switch to another batch and confirm the page loads it without losing the first batch's draft state.
5. Return to the first batch and confirm the draft is still present.
6. Open a previously completed batch, save a review change, and confirm its status becomes pending review.
7. Open `/dashboard` for that month and confirm incomplete-review behavior now reflects the reopened batch.
8. Return to `/imports`, re-complete the batch, and confirm the pending-review cues clear again.

## Performance Considerations

This slice stays within MVP-scale import history, so loading batch history plus one selected batch detail is acceptable without pagination or background sync. Deriving row counts in application code is also acceptable at current scale as long as the helper stays scoped to one user's batches. If import volume grows materially later, history pagination and batched aggregate queries can be planned separately.

## Migration Notes

No schema migration is expected for this slice if row counts are derived rather than persisted. The main migration is behavioral: `/imports` no longer treats "latest batch" as the default open review when no batch is selected.

Because saved edits to completed batches now clear `review_completed_at`, tests and UI copy should be updated together so the team does not accidentally preserve the old semantics in one layer and the new semantics in another.

## References

- Roadmap item: `context/foundation/roadmap.md`
- Import page entrypoint: `src/pages/imports.astro`
- Import domain helpers: `src/lib/imports/data.ts`
- Review workspace: `src/components/imports/ImportWorkspace.tsx`
- Review table: `src/components/imports/TransactionReviewTable.tsx`
- Review completion route: `src/pages/api/imports/batches/[id]/complete.ts`
- Transaction update routes: `src/pages/api/imports/transactions/[id].ts`, `src/pages/api/imports/transactions/bulk.ts`
- Summary trust logic: `src/lib/summary/data.ts`
- Accepted lessons: `context/foundation/lessons.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` - <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Import History Data and Read Contracts

#### Automated

- [x] 1.1 `npm test -- tests/import-review.test.ts tests/auth-and-ownership-boundaries.test.ts` passes with history-read coverage.
- [x] 1.2 `npx astro check` passes after the new read contracts are wired in.
- [x] 1.3 Targeted `npx eslint src/lib/imports/data.ts src/pages/api/imports/batches/[id].ts src/pages/imports.astro tests/import-review.test.ts tests/auth-and-ownership-boundaries.test.ts` passes.

#### Manual

- [ ] 1.4 Confirm the history contract exposes bank, month, imported date, review status, and row count for each batch.
- [ ] 1.5 Confirm incomplete batches sort ahead of completed ones, with newer imports first inside each status group.
- [ ] 1.6 Confirm requesting another user's batch id through the new detail route returns the expected protected error response.

### Phase 2: Imports Workspace History UX

#### Automated

- [x] 2.1 `npm test -- tests/import-review.test.ts` passes with history-panel coverage.
- [x] 2.2 `npx astro check` passes.
- [x] 2.3 Targeted `npx eslint src/components/imports/ImportWorkspace.tsx src/pages/imports.astro tests/import-review.test.ts` passes.

#### Manual

- [ ] 2.4 Opening `/imports` with no `batch` query param shows import history instead of silently opening the latest batch.
- [ ] 2.5 Clicking a history item loads that batch into the review pane and updates the selected state clearly.
- [ ] 2.6 Refreshing the page with `?batch=<id>` still reopens the selected batch.

### Phase 3: Parallel Review State and Completion Semantics

#### Automated

- [x] 3.1 `npm test -- tests/import-review.test.ts tests/monthly-summary-and-rules.test.ts` passes with parallel-review and completion-reset coverage.
- [x] 3.2 `npx astro check` passes.
- [x] 3.3 Targeted `npx eslint src/components/imports/ImportWorkspace.tsx src/components/imports/TransactionReviewTable.tsx src/components/imports/ReviewCompletionBar.tsx src/lib/imports/data.ts tests/import-review.test.ts tests/monthly-summary-and-rules.test.ts` passes.

#### Manual

- [ ] 3.4 Make unsaved changes in one batch, switch to another batch, then return and confirm the first batch's drafts are still present in that browser session.
- [ ] 3.5 Save changes to a previously completed batch and confirm its status becomes pending review immediately afterward.
- [ ] 3.6 Confirm the user can explicitly mark that batch complete again once review is finished.

### Phase 4: Regression Hardening and Handoff

#### Automated

- [x] 4.1 `npm test -- tests/import-review.test.ts tests/auth-and-ownership-boundaries.test.ts tests/monthly-summary-and-rules.test.ts` passes.
- [x] 4.2 `npm run lint` passes.
- [x] 4.3 `npm run build` passes.

#### Manual

- [ ] 4.4 Import a new batch and confirm it appears in history with the expected metadata and pending status.
- [ ] 4.5 Reopen an older completed batch, save a change, and confirm both imports history and dashboard trust cues now treat it as pending review.
- [ ] 4.6 Re-complete that batch and confirm the pending-review cues disappear again.
