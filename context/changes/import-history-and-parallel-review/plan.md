# Import History and Parallel Review Implementation Plan

## Overview

Implement roadmap item `UX-06`: let a signed-in user see recent import batches, resume pending work, reopen completed batches for corrections, and move among independent bank-month reviews without finishing one before starting another. History belongs inside `/imports` as a collapsible workspace panel so it is available when needed but does not permanently reduce the active review area.

## Current State Analysis

The database already persists many import batches per user, keyed by bank and canonical statement month. The import page can load a specific owned batch through `?batch=<id>` and otherwise loads the most recently imported batch. The React workspace, however, receives only one initial batch and has no history collection, batch-loading action, or guarded navigation between reviews.

The review editor already derives dirty state from local drafts, supports explicit save and discard actions, and blocks completion while category changes remain unsaved. The planned transaction-inclusion change will extend the same dirty workflow beyond categories. UX-06 therefore needs a generic workspace navigation boundary that asks the active editor to save or discard before switching, rather than reimplementing draft details in the history panel.

### Key Discoveries

- `src/pages/imports.astro` already accepts `?batch=<id>` and loads it with `loadImportBatchReview`; without a query parameter it calls `loadLatestImportBatchReview`.
- `src/lib/imports/data.ts` can load one owned batch and its transactions, but it has no bounded history query or batch-summary contract.
- `ImportWorkspace` owns the active batch, transactions, preview, notices, and one boolean dirty signal. A successful import replaces that active state immediately.
- `TransactionReviewTable` owns the actual drafts and exposes dirty-state changes, but its discard operation is not callable by the workspace.
- Same bank-month imports replace the existing batch in place, retaining the batch ID and resetting `review_completed_at`.
- Completed batches remain technically editable because transaction mutation routes are ownership-scoped rather than completion-scoped.
- Summary calculations already respond to historical category corrections, so keeping completed status after an edit matches the chosen behavior.
- The batch schema and RLS already provide the required ownership boundary; no schema migration is expected.
- Existing Vitest suites cover import ownership, review persistence, replacement, and completion. The existing Playwright seed demonstrates API-assisted import setup and accessible locators.
- The adjacent transaction-inclusion plan expands review dirty state. History switching must stay compatible with any unsaved review edit, not only category changes.

## Desired End State

Opening `/imports` selects the most recently imported pending batch, falling back to the latest completed batch when no pending review exists. A collapsible desktop sidebar lists up to 50 owned batches with pending reviews first, followed by completed reviews, and orders each status group by newest statement month/import. Each item shows bank, statement month, status, source filename, and transaction count.

On mobile, the same history appears in an accessible slide-over so the transaction review keeps the available width. The collapsed preference is remembered in `localStorage`. Selecting another batch loads it without forcing the current review to complete. When unsaved edits exist, the user can stay, discard and switch, or save and switch; a failed save leaves the user on the current batch with its drafts intact.

Completed batches reopen in the same editable review surface and retain their completed status after corrections. Committing a new or replacement import updates the history list and selects that batch immediately.

## What We're NOT Doing

- No server-persisted layout preference or cross-device history-panel synchronization.
- No unbounded history, pagination, search, filtering, or bank-grouped navigation.
- No persistent per-batch unsaved drafts; only one active batch may hold local drafts.
- No multi-pane simultaneous editing of several transaction tables.
- No new completed-to-pending lifecycle when historical transactions are corrected.
- No separate `/imports/history` route or dashboard history surface.
- No batch deletion, archival, renaming, or source-file download.
- No transaction schema or RLS changes.
- No broad redesign of upload, category, rule, inclusion, or completion semantics.

## Implementation Approach

Add a bounded import-history summary query and an authenticated API route for loading one review on demand. Server-render `/imports` with history plus the selected review, using pending-first selection when no valid `batch` parameter is supplied. Extend `ImportWorkspace` into the navigation coordinator while leaving transaction drafts owned by `TransactionReviewTable`.

The history UI will be a reusable responsive component: a collapsible sidebar at desktop widths and a modal slide-over on mobile. Batch selection is a controlled request from history to the workspace. Clean reviews switch immediately; dirty reviews open a confirmation dialog. `Save and switch` invokes the table's existing save operation through an imperative or callback contract, and `Discard and switch` resets drafts before loading the target review.

The URL remains a durable pointer to the active batch. After a successful client-side switch, update `?batch=<id>` without a full reload. Direct navigation and refresh must still load the same owned batch server-side. Unknown or foreign IDs must not reveal batch existence and should fall back to the normal default selection with clear, non-sensitive feedback.

## Critical Implementation Details

### Parallel Review Means Independent Resumable Batches

This slice does not render several review tables at once or persist drafts for multiple batches. It removes the workflow constraint that one batch must be completed before another can be imported or reviewed. Persisted batch state is parallel; local unsaved state remains limited to the active batch.

### Generic Dirty-State Navigation Contract

The workspace must not know whether drafts represent category, inclusion, or later review fields. The table should expose operations such as save pending changes and discard pending changes, plus its existing dirty signal. Switching must wait for these operations to finish before replacing active batch data.

### Save-and-Switch Failure

If saving returns row failures or throws a request error, switching must stop. Successful rows may reconcile through the existing save model, while failed rows remain selected and dirty in the current batch. The destination review must not load until the active table reports no remaining dirty edits.

### Selection and Ordering

Default selection and history ordering are related but distinct:

- Select the newest pending batch by import recency.
- If none is pending, select the newest completed batch.
- Display all pending batches first.
- Within pending and completed groups, order by newest statement month, then newest import timestamp as a stable tiebreaker.

### Completed Review Semantics

Editing a completed batch does not clear `review_completed_at`. The marker means the user explicitly completed review at least once, not that the batch became immutable. Corrections must continue to affect summaries through existing persisted transaction updates.

## Phase 1: Import History Read Contracts

### Overview

Add bounded, ownership-safe history and review-loading contracts before introducing navigation state in the UI.

### Changes Required:

#### 1. Batch History Summary Model

**File**: `src/lib/imports/data.ts`

**Intent**: Give the import workspace enough metadata to identify, order, and reopen recent batches without loading every transaction.

**Contract**: Add an exported history-row type containing batch identity and provenance fields plus `transaction_count`. Add a helper that lists at most 50 owned batches, places pending batches before completed batches, and applies deterministic newest-first ordering within each group.

The count query must avoid one review-load query per batch. Use a relational aggregate supported by the existing Supabase client contract or a database-side aggregate/RPC only if the client cannot express the count safely.

#### 2. Default Batch Selection

**File**: `src/lib/imports/data.ts`

**Intent**: Resume unfinished review work by default instead of merely opening the latest imported batch.

**Contract**: Replace or supplement `loadLatestImportBatchReview` with a pending-first selector. It selects the newest pending owned batch and falls back to the newest completed owned batch. Keep direct `loadImportBatchReview` behavior for explicit IDs.

#### 3. Review Read API

**File**: `src/pages/api/imports/batches/[id].ts`

**Intent**: Load a selected batch and its transactions without a full page refresh.

**Contract**: Add authenticated `GET /api/imports/batches/:id` returning the same batch-plus-review-row shape used by server rendering. Ownership failures and unknown IDs must use the existing not-found behavior so foreign batch existence is not disclosed.

#### 4. Server Route Data Loading

**File**: `src/pages/imports.astro`

**Intent**: Provide the initial history and active review in one server render while preserving direct-link behavior.

**Contract**: Load active categories and bounded history in parallel. When `?batch=<id>` resolves to an owned batch, select it. Otherwise use pending-first default selection. Pass history and the selected batch ID into `ImportWorkspace`.

#### 5. Data and Ownership Tests

**Files**:

- `tests/import-review.test.ts`
- `tests/auth-and-ownership-boundaries.test.ts`

**Intent**: Protect ordering, limits, counts, direct reads, and non-disclosure before UI work depends on them.

**Contract**: Cover pending-first default selection, completed fallback, status-group ordering, statement-month/import tiebreakers, 50-row limit, transaction counts, empty history, owned review load, and unknown/foreign not-found behavior.

### Success Criteria:

#### Automated Verification:

- `npm test -- tests/import-review.test.ts tests/auth-and-ownership-boundaries.test.ts` passes with history and review-read coverage.
- `npm run check` passes.
- Targeted ESLint passes for the Phase 1 import helper, API route, page, and tests.

#### Manual Verification:

- Confirm an account with pending and completed batches defaults to the newest pending review.
- Confirm an account with only completed batches defaults to its newest completed review.
- Confirm direct `/imports?batch=<owned-id>` navigation opens that batch and foreign IDs reveal no batch metadata.
- Confirm the history response is capped at 50 rows and includes accurate transaction counts.

**Implementation Note**: After completing this phase and all automated verification passes, pause for manual confirmation before building the history presentation.

---

## Phase 2: Collapsible and Responsive History Surface

### Overview

Add the history navigation surface without changing review mutation behavior.

### Changes Required:

#### 1. Import History Component

**File**: `src/components/imports/ImportHistory.tsx`

**Intent**: Present recent batches as an accessible, status-oriented navigation list.

**Contract**: Render batch items with bank, statement month, pending/completed status, source filename, and row count. Mark the active item semantically and visually. Expose selection through a callback rather than navigating independently so the workspace can enforce dirty-state rules.

#### 2. Desktop Collapse Behavior

**Files**:

- `src/components/imports/ImportHistory.tsx`
- `src/components/imports/ImportWorkspace.tsx`

**Intent**: Keep history available without permanently reducing review space.

**Contract**: Use a two-column desktop layout while expanded and restore the review area to full width while collapsed. Persist the collapsed preference under a versioned, import-specific `localStorage` key. Read the preference after hydration without making the server render depend on browser storage.

#### 3. Mobile Slide-Over

**File**: `src/components/imports/ImportHistory.tsx`

**Intent**: Preserve transaction-table width on small screens.

**Contract**: Present history as a modal slide-over with an explicit open control, close control, focus management, escape-key dismissal, backdrop dismissal, and an accessible title. Selecting a clean destination closes the panel after the workspace accepts the switch.

#### 4. Workspace Layout and Empty States

**Files**:

- `src/components/imports/ImportWorkspace.tsx`
- `src/pages/imports.astro`

**Intent**: Integrate upload, history, and active review as one coherent workspace.

**Contract**: Keep upload available regardless of history state. Show useful empty history and no-active-review states. Preserve current review status and transaction-table behavior for the active batch.

#### 5. Presentation Tests

**File**: `tests/import-review.test.ts`

**Intent**: Lock in the history information hierarchy and accessible controls.

**Contract**: Cover metadata rendering, pending/completed labels, active item state, collapse controls, empty history, and mobile dialog semantics where practical in the existing component-test approach.

### Success Criteria:

#### Automated Verification:

- `npm test -- tests/import-review.test.ts` passes with history presentation coverage.
- `npm run check` passes.
- Targeted ESLint passes for the history component, workspace, page, and tests.

#### Manual Verification:

- On desktop, expand and collapse history and confirm the active review regains the unused width when collapsed.
- Reload the page and confirm the desktop collapsed preference is restored from the same browser.
- At a mobile viewport, open history as a slide-over and verify keyboard focus, escape dismissal, close control, and backdrop behavior.
- Confirm each history row clearly identifies bank, month, status, filename, and transaction count.

**Implementation Note**: After completing this phase and all automated verification passes, pause for manual confirmation before enabling batch switching.

---

## Phase 3: Guarded Batch Switching and Historical Editing

### Overview

Connect history selection to on-demand review loading, protect unsaved work, and keep new imports synchronized with history.

### Changes Required:

#### 1. Review Editor Control Contract

**File**: `src/components/imports/TransactionReviewTable.tsx`

**Intent**: Let the workspace request the same save and discard operations the user can already invoke.

**Contract**: Expose a narrow control surface for `savePendingChanges` and `discardPendingChanges`, while retaining generic dirty-state notification. Saving must report whether all drafts reconciled; partial or request failure must leave remaining drafts and errors intact.

This contract must encompass all current review drafts and remain compatible with transaction inclusion changes without the workspace inspecting individual fields.

#### 2. Switch Confirmation Dialog

**File**: `src/components/imports/ImportWorkspace.tsx`

**Intent**: Prevent silent loss of edits when the user selects another batch.

**Contract**: Clean selection switches immediately. Dirty selection opens a dialog offering:

- `Stay` to close the dialog without changing state.
- `Discard and switch` to reset active drafts and continue.
- `Save and switch` to save, verify that no dirty drafts remain, and continue.

Disable duplicate actions while save or load work is in flight. Save failure remains on the current review and surfaces through the existing review feedback.

#### 3. On-Demand Batch Load and URL Sync

**File**: `src/components/imports/ImportWorkspace.tsx`

**Intent**: Replace the active review only after navigation is accepted and the destination loads successfully.

**Contract**: Fetch the selected review from `/api/imports/batches/:id`, then atomically replace active batch and transactions. Preserve the current batch if loading fails. After success, update `?batch=<id>` through the History API so refresh and copied URLs reopen the same batch.

Handle browser back/forward navigation through the same guarded switching path. If dirty state makes `popstate` navigation unsafe, keep the current review selected and restore its URL until the user resolves the drafts.

#### 4. Completed Historical Editing

**Files**:

- `src/components/imports/ImportWorkspace.tsx`
- `src/components/imports/ReviewCompletionBar.tsx`

**Intent**: Make completed imports clearly editable without implying that corrections reopen review.

**Contract**: Continue rendering transaction controls for completed batches. Keep `review_completed_at` unchanged after transaction saves. Present completed status as prior confirmation rather than read-only state, and avoid offering another completion action unless existing idempotent behavior intentionally supports it.

#### 5. Import-to-History Reconciliation

**File**: `src/components/imports/ImportWorkspace.tsx`

**Intent**: Keep history truthful after a new import or same-month replacement.

**Contract**: After commit, select the committed batch immediately. Insert or replace its history summary, update its transaction count and provenance, reset status to pending, and move it into the pending group according to the chosen ordering. Do not require a full route refresh.

#### 6. Switching Integration Tests

**Files**:

- `tests/import-review.test.ts`
- `tests/review-persistence-and-rule-application.test.ts`

**Intent**: Protect navigation state, dirty outcomes, completed edits, and replacement reconciliation.

**Contract**: Cover clean switching, stay, discard-and-switch, save-and-switch, save failure, load failure, URL updates, completed-batch edit persistence without status reset, and history update after create/replace.

### Success Criteria:

#### Automated Verification:

- `npm test -- tests/import-review.test.ts tests/review-persistence-and-rule-application.test.ts` passes with guarded-switching coverage.
- `npm run check` passes.
- `npm run build` passes.
- Targeted ESLint passes for the Phase 3 review components and tests.

#### Manual Verification:

- Switch between two clean batches and confirm the selected review and URL update without a full reload.
- With unsaved edits, verify `Stay` preserves the current batch and drafts.
- Verify `Discard and switch` removes drafts and opens the selected batch.
- Verify `Save and switch` persists changes before opening the selected batch, and that a failed save prevents switching.
- Edit a completed historical batch and confirm its summary changes while its status remains complete.
- Import or replace a batch and confirm it becomes selected and moves to the correct pending history position.

**Implementation Note**: After completing this phase and all automated verification passes, pause for manual confirmation before final browser-level regression coverage.

---

## Phase 4: Focused E2E Regression and Handoff

### Overview

Exercise the highest-risk navigation path in a real browser and complete the repository-wide quality gates.

### Changes Required:

#### 1. Parallel Review E2E Test

**File**: `tests/e2e/import-history-switching.spec.ts`

**Intent**: Verify that accessible history navigation cannot lose active review drafts.

**Contract**: Using independent API-assisted setup with unique timestamped data, create or identify two owned bank-month batches. Exercise the visible history controls and verify:

- pending-first default selection;
- dirty selection opens the switch dialog;
- `Stay` preserves the active draft;
- `Save and switch` persists the edit and opens the destination;
- returning to the first batch shows the persisted change;
- completed history remains reopenable and editable.

Use role, label, and text locators only. Wait for visible state, URL, or responses; never use fixed timeouts. Clean up created test data through available owned API paths where the application supports it.

#### 2. History and Ownership Regression

**Files**:

- `tests/import-review.test.ts`
- `tests/auth-and-ownership-boundaries.test.ts`
- `tests/e2e/import-review-dirty-state.spec.ts`

**Intent**: Preserve existing import, ownership, dirty completion, replacement, rules, and future inclusion behavior after workspace navigation expands.

**Contract**: Keep existing tests passing and update assertions only where user-facing copy becomes generically about unsaved review changes rather than category-only changes.

#### 3. Plan and Roadmap Alignment

**Files**:

- `context/changes/import-history-and-parallel-review/plan.md`
- `context/changes/import-history-and-parallel-review/plan-brief.md`
- `context/foundation/roadmap.md`

**Intent**: Keep the implementation handoff and roadmap status aligned.

**Contract**: Preserve the scope boundary that "parallel review" means independent resumable persisted batches, not simultaneous multi-table editing or persistent per-batch drafts. Update roadmap status according to the repository's implementation/archive workflow after the change lands.

### Success Criteria:

#### Automated Verification:

- `npm run test:e2e -- tests/e2e/import-history-switching.spec.ts` passes.
- `npm test` passes.
- `npm run lint` passes.
- `npm run check` passes.
- `npm run build` passes.

#### Manual Verification:

- Backfill or create several bank-month imports and confirm unfinished reviews remain easy to find.
- Confirm history can stay collapsed during normal import/review work and does not reduce the active workspace when hidden.
- Confirm desktop, mobile, refresh, direct-link, and browser back/forward behavior preserve the correct active batch.
- Confirm the final experience supports starting and resuming several batches without requiring completion of another batch first.

**Implementation Note**: After completing this phase and all automated verification passes, pause for final manual confirmation before implementation review or archive.

## Testing Strategy

### Unit Tests:

- Pending-first selection and completed fallback.
- History grouping, deterministic ordering, 50-row cap, and transaction-count mapping.
- History reconciliation after new and replacement imports.
- Review editor save/discard control outcomes.

### Integration Tests:

- Owned batch-history and review-read contracts.
- Unknown and foreign batch non-disclosure.
- Clean and dirty switching outcomes.
- Load/save failures preserving the active review.
- Historical corrections retaining completed status.
- URL synchronization and direct server-side batch loading.

### E2E Tests:

- One focused browser test for history visibility, dirty-state confirmation, save-and-switch, persisted return, and completed review reopening.

### Manual Testing Steps:

1. Sign in with at least two pending batches and one completed batch.
2. Open `/imports` without a query parameter and confirm the newest pending batch is selected.
3. Expand and collapse history, reload, and confirm the browser remembers the preference.
4. Switch to another clean batch and confirm the URL changes to its batch ID.
5. Make an unsaved review edit and attempt another switch.
6. Choose `Stay` and confirm the draft remains.
7. Attempt again with `Discard and switch`, then verify the old draft was not persisted.
8. Make another edit and use `Save and switch`; return and verify it persisted.
9. Open and edit a completed batch; confirm it remains complete.
10. Import or replace a bank-month batch and confirm it becomes the selected pending history item.
11. Repeat core navigation at a mobile viewport using the slide-over.

## Performance Considerations

History is explicitly bounded to 50 summaries, and review transactions load only for the active batch. Avoid N+1 transaction-count queries. Client switching should fetch one review at a time and ignore or cancel stale responses when users select destinations quickly. No virtualization, infinite scrolling, or prefetching is needed at MVP scale.

## Migration Notes

No database migration is expected. Existing `statement_import_batches` fields, bank-month uniqueness, transaction ownership, and review completion markers are sufficient.

The transaction-inclusion change may land before or during UX-06. Implement the navigation contract against generic pending review changes so either landing order remains valid. Do not overwrite unrelated work in `ImportWorkspace`, `TransactionReviewTable`, or their tests when integrating the two changes.

## References

- Roadmap item: `context/foundation/roadmap.md`
- First import plan: `context/archive/2026-05-29-first-bank-import-review/plan.md`
- Bulk review plan: `context/archive/2026-06-01-import-review-bulk-categorization/plan.md`
- Bulk review implementation review: `context/archive/2026-06-01-import-review-bulk-categorization/reviews/impl-review.md`
- Adjacent inclusion plan: `context/changes/transaction-inclusion-control/plan.md`
- Imports page: `src/pages/imports.astro`
- Import workspace: `src/components/imports/ImportWorkspace.tsx`
- Review table: `src/components/imports/TransactionReviewTable.tsx`
- Import data helpers: `src/lib/imports/data.ts`
- Existing E2E seed: `tests/e2e/import-review-dirty-state.spec.ts`
- Accepted lessons: `context/foundation/lessons.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` - <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Import History Read Contracts

#### Automated

- [x] 1.1 `npm test -- tests/import-review.test.ts tests/auth-and-ownership-boundaries.test.ts` passes with history and review-read coverage. — 49cfb2a
- [x] 1.2 `npm run check` passes. — 49cfb2a
- [x] 1.3 Targeted ESLint passes for the Phase 1 import helper, API route, page, and tests. — 49cfb2a

#### Manual

- [x] 1.4 Confirm pending-first and completed-fallback default selection. — 49cfb2a
- [x] 1.5 Confirm direct owned batch links work and foreign IDs disclose no metadata. — 49cfb2a
- [x] 1.6 Confirm history is capped at 50 rows with accurate transaction counts. — 49cfb2a

### Phase 2: Collapsible and Responsive History Surface

#### Automated

- [x] 2.1 `npm test -- tests/import-review.test.ts` passes with history presentation coverage. — e963345
- [x] 2.2 `npm run check` passes. — e963345
- [x] 2.3 Targeted ESLint passes for the history component, workspace, page, and tests. — e963345

#### Manual

- [x] 2.4 Confirm desktop collapse restores review width and persists across reloads. — e963345
- [x] 2.5 Confirm the mobile slide-over meets focus, dismissal, and accessible-title requirements. — e963345
- [x] 2.6 Confirm every history item shows bank, month, status, filename, and row count. — e963345

### Phase 3: Guarded Batch Switching and Historical Editing

#### Automated

- [x] 3.1 `npm test -- tests/import-review.test.ts tests/review-persistence-and-rule-application.test.ts` passes with guarded-switching coverage. — f2f616d
- [x] 3.2 `npm run check` passes. — f2f616d
- [x] 3.3 `npm run build` passes. — f2f616d
- [x] 3.4 Targeted ESLint passes for the Phase 3 review components and tests. — f2f616d

#### Manual

- [x] 3.5 Confirm clean switching updates the review and URL without a full reload. — f2f616d
- [x] 3.6 Confirm stay, discard-and-switch, save-and-switch, and save-failure outcomes. — f2f616d
- [x] 3.7 Confirm completed historical edits persist without resetting completion status. — f2f616d
- [x] 3.8 Confirm new and replacement imports reconcile and select the correct pending history item. — f2f616d

### Phase 4: Focused E2E Regression and Handoff

#### Automated

- [x] 4.1 `npm run test:e2e -- tests/e2e/import-history-switching.spec.ts` passes.
- [x] 4.2 `npm test` passes.
- [x] 4.3 `npm run lint` passes.
- [x] 4.4 `npm run check` passes.
- [x] 4.5 `npm run build` passes.

#### Manual

- [ ] 4.6 Confirm several bank-month imports can be started, found, reopened, and edited independently.
- [ ] 4.7 Confirm collapsed desktop, mobile slide-over, refresh, direct-link, and back/forward behavior.
- [ ] 4.8 Confirm the final scope is resumable persisted batches, not simultaneous multi-table editing or persistent local drafts.
