# First Bank Import Review Implementation Plan

## Overview

Build S-02 from the roadmap: a signed-in user can choose Revolut, upload one exact Revolut CSV export format, persist the import as a per-user monthly batch, review parsed transactions, correct categories, optionally save reusable rules, and replace an existing Revolut month batch only after explicit confirmation.

## Current State Analysis

The app already has the finance foundation tables (`statement_import_batches`, `transactions`, `categorization_rules`) with per-user RLS, plus the S-01 budget setup workflow with protected routes, server-side Astro API writes, shared validation/data helpers, and focused Vitest coverage. What does not exist yet is any file-upload flow, import parser, import-batch lifecycle, transaction review UI, category-assignment mutation path, or rule-creation workflow.

### Key Discoveries

- Roadmap S-02 requires one supported bank import, parsed transaction review, and same-bank-month replacement behavior: `context/foundation/roadmap.md:79`.
- PRD FR-002, FR-003, FR-005, FR-006, and FR-010 define date-derived month handling, supported-bank selection, batch replacement, transaction detail visibility, and category correction as must-haves: `context/foundation/prd.md:65`.
- The shaped MVP already narrowed import scope to one supported CSV bank format: `context/foundation/shape-notes.md:17`.
- The existing finance schema stores batch period start/end, but not a canonical statement month or review-complete state, so S-02 needs a small additive migration to represent those contracts cleanly.
- S-01 established the preferred implementation pattern for this repo: protected Astro pages, React islands for interactivity, server-only Supabase writes, and targeted Vitest route/helper tests in `tests/budget-setup.test.ts`.
- Accepted lesson: roadmap-linked implementation commits should use the roadmap ID in the Conventional Commit scope, for example `feat(S-02): revolut csv parser`.

## Desired End State

A signed-in user can open a dedicated protected import workspace, choose Revolut, upload the supported CSV export, and see either a parse error before any destructive action or a parsed review table with date, title, recipient, amount, and assigned category. If the uploaded file maps to a month that already has a Revolut batch, the app warns the user and only replaces the old batch after explicit confirmation. Imported transactions remain visible for continued review, but the batch is not considered summary-ready until review is completed.

## What We're NOT Doing

- No support for multiple banks or a second format in this slice.
- No PDF parsing or mixed-format import support.
- No editing of parsed date, title, recipient, or amount fields.
- No transaction-level duplicate merge or reconciliation logic beyond whole-batch replacement.
- No monthly summary generation or budget usage visualization.
- No automatic rule creation from every correction; rules remain explicit user opt-in.
- No direct browser writes to Supabase storage or database tables.

## Implementation Approach

Add the smallest domain extensions needed for S-02, then build the import flow as a dedicated protected route backed by server-side Astro API endpoints and `src/lib/imports/` helpers. The upload step parses and validates the Revolut CSV before any replacement, derives one canonical statement month from parsed transaction dates, and persists a batch plus transactions only after the user confirms creation or replacement. Review then operates on saved rows: category changes and optional rule creation update server data incrementally, while a batch-level review-complete flag prevents downstream slices from treating the import as ready too early.

## Critical Implementation Details

### Monthly Replacement Key

The existing `statement_import_batches` uniqueness on `(user_id, bank, period_start, period_end)` is not enough for FR-005 because two files for the same month can have slightly different statement date ranges. S-02 should add a canonical `statement_month date` column constrained to month-start and use `(user_id, bank, statement_month)` as the replacement key while keeping period start/end for provenance.

### Review Readiness Contract

The PRD requires the product to make it clear when data still depends on review. S-02 should add a nullable batch review marker such as `review_completed_at timestamptz` and treat batches with `review_completed_at is null` as not summary-ready. This keeps the data persisted and resumable without letting later slices accidentally consume half-reviewed imports as trustworthy summaries.

### Parser Safety Boundary

Revolut CSV parsing must be fail-fast: if the file shape, header contract, dates, or amounts do not match the supported format, the API returns a clear validation error and no batch replacement occurs. Partial-row imports are out of scope because skipped or malformed rows would undermine trust in financial totals.

## Phase 1: Import Batch Contract and Schema Support

### Overview

Add the minimal schema fields needed to represent monthly replacement and review lifecycle without disturbing the existing ownership and RLS model.

### Changes Required:

#### 1. Import Batch Lifecycle Migration

**File**: `supabase/migrations/<timestamp>_first_bank_import_review_batch_contract.sql`

**Intent**: Extend `statement_import_batches` so S-02 can replace by bank-month and track whether an import has completed review.

**Contract**: Add:

- `statement_month date not null` with a month-start check.
- `review_completed_at timestamptz null`.

Backfill existing rows, if any, by deriving `statement_month` from `period_start` normalized to month start. Replace the uniqueness/index contract so the canonical lookup becomes `(user_id, bank, statement_month)`. Keep `period_start`, `period_end`, `source_filename`, and `imported_at` for provenance.

#### 2. Generated Database Types

**File**: `src/lib/database.types.ts`

**Intent**: Keep application contracts synchronized with the new batch fields before implementation code starts using them.

**Contract**: Regenerate Supabase types so `statement_import_batches` exposes `statement_month` and `review_completed_at` across `Row`, `Insert`, and `Update`.

### Success Criteria:

#### Automated Verification:

- `npx supabase db reset` applies the new migration cleanly.
- Generated types expose `statement_import_batches.statement_month` and `statement_import_batches.review_completed_at`.
- `npx astro check` passes after the type refresh.

#### Manual Verification:

- Review the migration and confirm replacement is keyed by one canonical bank-month contract rather than raw statement date range equality.
- Confirm the new review-state field is additive and does not weaken per-user ownership or RLS assumptions from F-01.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before building parser and API layers.

---

## Phase 2: Revolut CSV Parsing and Import API Flow

### Overview

Create the server-side upload, parse, preview, and persist contracts for one exact Revolut CSV format.

### Changes Required:

#### 1. Import Parser Module

**File**: `src/lib/imports/revolutCsv.ts`

**Intent**: Isolate the supported Revolut CSV format contract so parsing rules remain explicit, testable, and easy to extend later for S-04.

**Contract**: Export parser helpers that:

- validate the expected Revolut CSV header and required columns.
- parse every row into a normalized transaction draft with `transaction_date`, `title`, `recipient`, and `amount`.
- derive one canonical `statement_month`, `period_start`, and `period_end` from parsed transaction dates.
- fail the whole import if any required row cannot be parsed accurately.

The parser should produce structured parse errors suitable for user-facing API responses and should not write to the database directly.

#### 2. Import Domain Helpers

**File**: `src/lib/imports/data.ts`

**Intent**: Keep batch persistence, replacement lookup, transaction creation, and review queries out of route files.

**Contract**: Export helpers to:

- find an existing import batch for `(user_id, bank, statement_month)`.
- create a new batch and its imported transactions.
- replace an existing batch only after the caller has opted into replacement.
- load one saved batch with its transactions for review.
- list active budget categories and existing categorization rules needed for assignment.
- update one transaction category and optionally create a new categorization rule in the same authenticated workflow.
- mark a batch review as complete when the review flow is explicitly finalized.

Whole-batch replacement should remain atomic from the caller's point of view: after confirmation, the user ends up with exactly one Revolut batch for that month and no duplicated transactions.

#### 3. Import Validation and HTTP Helpers

**File**: `src/lib/imports/validation.ts`

**Intent**: Centralize import-specific validation separate from the existing budget-setup rules.

**Contract**: Export helpers for:

- supported bank validation, limited to `revolut` for S-02.
- file presence and content-type/filename checks appropriate to the chosen upload mechanism.
- review mutation payload validation for transaction IDs, category IDs, and rule opt-in data.

**File**: `src/lib/imports/http.ts`

**Intent**: Mirror the S-01 budget HTTP pattern so import routes share one authenticated response contract.

**Contract**: Provide authenticated route guards, structured JSON success/error helpers, and request parsing for multipart upload plus JSON mutation requests.

#### 4. Upload and Review API Routes

**File**: `src/pages/api/imports/preview.ts`

**Intent**: Parse the uploaded Revolut CSV and detect replacement risk before any destructive write.

**Contract**: `POST` accepts multipart upload plus explicit bank selection. It validates `revolut`, parses the CSV, derives the canonical month, and returns either:

- a parse/format error with no persisted changes, or
- a preview payload containing normalized transaction drafts, derived month/period, and an existing-batch summary if a replacement target already exists.

**File**: `src/pages/api/imports/commit.ts`

**Intent**: Persist a new import batch or replace an existing one only after explicit user confirmation.

**Contract**: `POST` accepts the validated preview payload or a server-verifiable preview token plus a `confirm_replace` signal. It writes the batch and transactions, sets `review_completed_at` to null, and refuses to replace an existing bank-month batch unless confirmation is explicit.

**File**: `src/pages/api/imports/transactions/[id].ts`

**Intent**: Persist review-time category corrections on saved transactions.

**Contract**: `PATCH` updates only `category_id` for one owned transaction and may optionally create a categorization rule when the payload includes explicit rule opt-in metadata. It must not allow edits to date, title, recipient, or amount.

**File**: `src/pages/api/imports/batches/[id]/complete.ts`

**Intent**: Mark a saved batch as reviewed so later slices can safely distinguish imported versus summary-ready data.

**Contract**: `POST` sets `review_completed_at` for one owned batch after review is complete. The route should be idempotent from the user perspective.

### Success Criteria:

#### Automated Verification:

- Parser tests pass for the supported Revolut CSV header, row normalization, month derivation, and fail-fast error cases.
- API/data helper tests pass for preview, explicit replacement confirmation, authenticated batch creation, transaction category update, and rule opt-in behavior.
- `npm run lint` passes.
- `npx astro check` passes.

#### Manual Verification:

- Uploading an invalid or mismatched file returns a clear error and does not create or replace any batch.
- Uploading a Revolut CSV for a month that already exists warns before replacement and only proceeds after explicit confirmation.
- A newly committed batch starts as review-pending rather than review-complete.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before building the review page UI.

---

## Phase 3: Protected Import Review UI

### Overview

Add the dedicated protected route and user-facing flow for upload, replacement confirmation, transaction review, and completion.

### Changes Required:

#### 1. Route Protection and Navigation

**File**: `src/middleware.ts`

**Intent**: Protect the import workspace with the same auth boundary as `/budget`.

**Contract**: Add the dedicated import route prefix, such as `/imports`, to `PROTECTED_ROUTES`. Unauthenticated users must still redirect to `/auth/signin`.

**File**: `src/components/Topbar.astro`

**Intent**: Make the new import workspace reachable from the existing protected navigation.

**Contract**: Add a navigation link to the dedicated import route without disturbing the current budget and auth actions.

#### 2. Import Workspace Page

**File**: `src/pages/imports.astro`

**Intent**: Render one dedicated protected workspace for upload and review, linked from budget but not embedded inside it.

**Contract**: Load the signed-in user context plus the active category list needed for review. Render:

- a Revolut-only bank selector or supported-bank badge for S-02.
- a file upload panel that submits to preview/commit endpoints.
- explicit replacement confirmation UI when an existing batch is detected.
- a transaction review table for the committed batch.
- a clear review status indicator showing whether the batch is still pending review or complete.

The page may load the most recently committed batch or a selected batch ID for resumed review, but it must remain dedicated to imports rather than expanding `/budget`.

#### 3. Review UI Components

**File**: `src/components/imports/ImportWorkspace.tsx`

**Intent**: Coordinate upload state, preview state, persisted review state, and completion actions in one interactive island.

**Contract**: Accept server-provided categories and optional initial batch/review data. Manage the preview-to-commit flow, explicit replacement confirmation, transaction review interactions, and final review-complete action.

**File**: `src/components/imports/ImportUploadForm.tsx`

**Intent**: Handle the Revolut CSV upload and preview lifecycle.

**Contract**: Submit multipart data with explicit bank choice, show preview errors, and surface replacement confirmation before commit.

**File**: `src/components/imports/TransactionReviewTable.tsx`

**Intent**: Show imported rows and support category correction only.

**Contract**: Render read-only date/title/recipient/amount columns plus editable category selection. Each correction may expose an opt-in control for saving a new rule from the corrected merchant/category pairing.

**File**: `src/components/imports/ReviewCompletionBar.tsx`

**Intent**: Make review status visible and completion explicit.

**Contract**: Show whether the current batch is still review-pending or already complete, and trigger the review-complete API action when the user finishes review.

### Success Criteria:

#### Automated Verification:

- The protected import route type-checks with its server-loaded data and React islands.
- Build passes: `npm run build`.
- UI-focused component tests or route-contract tests cover replacement confirmation visibility and category-only review mutations.

#### Manual Verification:

- Visiting the import route while signed out redirects to `/auth/signin`.
- A signed-in user can upload the supported Revolut CSV and reach a review table with parsed date, title, recipient, amount, and category fields.
- The review UI allows category changes but does not allow editing parsed amount/date/title/recipient values.
- The user can opt into rule creation from a correction and finish the batch review explicitly.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before tightening tests and roadmap sync.

---

## Phase 4: Test Fixtures, Regression Coverage, and Roadmap Sync

### Overview

Make the Revolut import slice repeatable, well-scoped, and ready for the next downstream slices.

### Changes Required:

#### 1. CSV Fixtures and Focused Tests

**File**: `tests/import-review.test.ts`

**Intent**: Cover the risky parser, replacement, and review contracts without adding a full browser automation stack.

**Contract**: Add focused Vitest coverage for:

- valid Revolut CSV parsing and normalized transaction output.
- invalid header or malformed row rejection.
- canonical month derivation from parsed dates.
- explicit replacement confirmation requirements.
- persisted batch review-pending state after import.
- transaction category correction and optional rule creation behavior.

If reusable fixtures help readability, place them under a change-appropriate test fixture location such as `tests/fixtures/imports/`.

#### 2. Roadmap Status Alignment

**File**: `context/foundation/roadmap.md`

**Intent**: Keep roadmap planning state aligned with the fact that S-02 now has an executable plan and its prerequisites are complete.

**Contract**: Update S-02 from `proposed` to `ready` once the plan is reviewed and accepted. Do not mark it `done` until implementation, review, and archive are complete.

#### 3. Change Brief and Execution Handoff

**File**: `context/changes/first-bank-import-review/plan-brief.md`

**Intent**: Give the implementer a compact high-level read before phase execution begins.

**Contract**: Keep the brief aligned with the final plan decisions: Revolut CSV only, explicit replacement confirmation, saved-batch review flow, opt-in rule creation, and review-complete gating for downstream summary work.

### Success Criteria:

#### Automated Verification:

- `npm test` passes with the new import-review coverage.
- `npm run lint` passes.
- `npx astro check` passes.
- `npm run build` passes.

#### Manual Verification:

- Review the plan brief and full plan for phase clarity before starting `/10x-implement first-bank-import-review phase 1`.
- Confirm S-03 remains blocked on both completed budget setup and completed import review.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before archiving or marking the roadmap item done.

## Testing Strategy

### Unit Tests:

- Validate supported-bank selection for `revolut`.
- Validate CSV header recognition and row-shape rejection.
- Validate transaction date parsing, amount parsing, and canonical statement-month derivation.
- Validate review mutation payloads and explicit rule opt-in parsing.

### Integration Tests:

- Preview route rejects invalid files without creating batches.
- Commit route creates exactly one batch per `(user_id, bank, statement_month)` and requires explicit confirmation before replacement.
- Replacement removes the previous month batch data and leaves one persisted replacement batch.
- Transaction review updates only category assignment and optionally creates one categorization rule.
- Review completion sets the batch review marker without mutating transaction details.

### Manual Testing Steps:

1. Sign out and verify `/imports` redirects to `/auth/signin`.
2. Sign in, open `/imports`, and verify the page clearly shows Revolut CSV as the supported format.
3. Upload an invalid or non-matching CSV and confirm the app shows a parse error without creating a batch.
4. Upload a valid Revolut CSV for a new month and confirm the review table appears with date, title, recipient, amount, and category.
5. Change categories for several rows and save one correction as a reusable rule.
6. Re-upload a valid Revolut CSV for the same month and confirm the app requires explicit replacement confirmation before overwriting.
7. Complete review and confirm the batch status changes from pending review to complete.

## Performance Considerations

S-02 is still small-user, after-hours MVP scope. Parsing one CSV file per request and loading one month batch plus its transaction list is acceptable; no background jobs or advanced pagination are needed yet. Keep queries keyed by user, bank, batch, and statement month, and avoid premature optimization until S-03 reveals actual summary-query pressure.

## Migration Notes

The batch-contract migration is additive, but it changes the canonical uniqueness path for imports. Land the migration before writing API logic that assumes `(user_id, bank, statement_month)` uniqueness. Because replacement is destructive at the batch level, only delete or supersede old batch rows after the new file has parsed successfully and the user has explicitly confirmed replacement.

Do not commit `.env`, `.dev.vars`, or any statement files containing real banking data. Test fixtures should be sanitized synthetic exports only.

## References

- Roadmap item: `context/foundation/roadmap.md:79`
- PRD requirements: `context/foundation/prd.md:65`
- Shape decision on one CSV bank format: `context/foundation/shape-notes.md:17`
- Finance foundation schema: `supabase/migrations/20260526103000_finance_domain_foundation.sql`
- Budget setup pattern: `context/archive/2026-05-27-budget-setup/plan.md`
- Existing budget helpers: `src/lib/budget/data.ts`
- Existing protected budget page: `src/pages/budget.astro`
- Existing budget route tests: `tests/budget-setup.test.ts`
- Accepted lessons: `context/foundation/lessons.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Import Batch Contract and Schema Support

#### Automated

- [x] 1.1 `npx supabase db reset` applies the batch-contract migration cleanly.
- [x] 1.2 Generated types expose `statement_import_batches.statement_month` and `statement_import_batches.review_completed_at`.
- [x] 1.3 `npx astro check` passes after refreshing database types.

#### Manual

- [x] 1.4 Confirm replacement is keyed by canonical bank-month rather than raw period-start and period-end equality.
- [x] 1.5 Confirm the review-state field is additive and does not weaken per-user ownership or RLS assumptions.

### Phase 2: Revolut CSV Parsing and Import API Flow

#### Automated

- [ ] 2.1 Parser tests pass for the supported Revolut CSV header, row normalization, month derivation, and fail-fast parse errors.
- [ ] 2.2 API and data-helper tests pass for preview, explicit replacement confirmation, batch creation, category-only review updates, and rule opt-in behavior.
- [ ] 2.3 `npm run lint` passes.
- [ ] 2.4 `npx astro check` passes.

#### Manual

- [ ] 2.5 Uploading an invalid or mismatched file returns a clear error and does not create or replace any batch.
- [ ] 2.6 Uploading a same-month Revolut CSV warns before replacement and only replaces after explicit confirmation.
- [ ] 2.7 A newly committed batch starts as review-pending rather than review-complete.

### Phase 3: Protected Import Review UI

#### Automated

- [ ] 3.1 The protected import route type-checks with its server-loaded data and React islands.
- [ ] 3.2 `npm run build` passes.
- [ ] 3.3 UI-focused tests or route-contract tests cover replacement confirmation visibility and category-only review mutations.

#### Manual

- [ ] 3.4 Visiting `/imports` while signed out redirects to `/auth/signin`.
- [ ] 3.5 A signed-in user can upload the supported Revolut CSV and reach a review table with parsed date, title, recipient, amount, and category.
- [ ] 3.6 The review UI allows category changes but does not allow editing parsed amount, date, title, or recipient values.
- [ ] 3.7 The user can opt into rule creation from a correction and explicitly complete review.

### Phase 4: Test Fixtures, Regression Coverage, and Roadmap Sync

#### Automated

- [ ] 4.1 `npm test` passes with the new import-review coverage.
- [ ] 4.2 `npm run lint` passes.
- [ ] 4.3 `npx astro check` passes.
- [ ] 4.4 `npm run build` passes.

#### Manual

- [ ] 4.5 Review the plan brief and full plan for phase clarity before starting `/10x-implement first-bank-import-review phase 1`.
- [ ] 4.6 Confirm S-03 remains blocked until the import review slice is implemented and reviewed.
