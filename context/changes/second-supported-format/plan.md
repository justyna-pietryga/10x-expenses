# Second Supported Format Implementation Plan

## Overview

Build S-04 from the roadmap: a signed-in user can use the existing protected import-review flow with one exact ING CSV export format in addition to the already supported Revolut CSV flow.

## Current State Analysis

The finance domain, import review flow, and monthly summary workflow already exist. S-02 established batch replacement by canonical bank-month, persisted transaction review, and parser-first preview safety. S-03 then proved that imported transactions can feed reusable rules and monthly summaries. What remains single-bank is the import contract itself: current upload validation, route dispatch, parser types, UI copy, and tests are all explicitly Revolut-only.

### Key Discoveries

- Roadmap S-04 is deliberately narrow: add a second supported statement format after the first import-review loop is already proven: `context/foundation/roadmap.md:104`.
- The current import contract is hard-coded to `bank: "revolut"` in `src/lib/imports/validation.ts`, `src/pages/api/imports/preview.ts`, and `src/components/imports/ImportUploadForm.tsx`.
- The normalized transaction draft type still lives inside `src/lib/imports/revolutCsv.ts`, which means the shared pipeline is coupled to the first parser instead of a bank-agnostic import type.
- The ING sample at `context/foundation/resources/ing-statement-example.csv` is materially different from the Revolut sample:
  - semicolon-delimited rather than comma-delimited
  - multiple metadata blocks before the real table header
  - quoted text fields
  - multiple accounts represented in one export
  - rows with missing `Data księgowania`, likely representing pending or not-yet-booked card rows
- The downstream pipeline is already reusable:
  - replacement is keyed by `(user_id, bank, statement_month)` in `src/lib/imports/data.ts`
  - review remains category-only
  - summaries and reusable rules are bank-agnostic once imported transactions are normalized
- Accepted lesson: roadmap-linked implementation commits should use the roadmap task ID in the commit scope, so S-04 work should use `feat(S-04): ...` or `chore(S-04): ...`.

## Desired End State

A signed-in user can open `/imports`, choose either Revolut or ING, upload the supported CSV for that bank, and see a preview or a clear parse error before any destructive write occurs. Same-bank same-month replacement remains explicit and safe. Once committed, ING transactions appear in the same review table, accept the same rule engine, and feed the same monthly dashboard summaries without introducing account-level or bank-specific downstream branches.

## What We're NOT Doing

- No generic ING parser or support for multiple close variants.
- No third bank or third file format.
- No PDF import support.
- No account-level batch splitting or account-specific dashboard/reporting.
- No bank-scoped reusable rules.
- No rework of the review UI into a multi-step wizard or new route structure.
- No changes to transaction editing beyond the existing category-only review model.

## Implementation Approach

First, decouple the import pipeline from the Revolut parser by introducing shared import types, bank validation, and parser dispatch. Then add one ING parser that understands the exact provided CSV shape, strips the metadata preamble, parses the semicolon-delimited transaction table, supports one multi-account file per bank-month batch, and normalizes rows into the same draft shape the rest of the import flow already expects. Finally, update the `/imports` workspace so the user explicitly chooses a bank before uploading, with focused regression tests proving that both supported banks still honor preview safety, replacement rules, review behavior, and summary compatibility.

## Critical Implementation Details

### Shared Import Draft Contract

Right now `ImportedTransactionDraft` lives in `src/lib/imports/revolutCsv.ts`, which makes the whole import stack implicitly “Revolut-shaped.” S-04 should move the shared normalized transaction draft contract into a bank-agnostic import module, then let both `revolutCsv.ts` and the new `ingCsv.ts` emit that shape. This keeps review, batch commit, rules, and summaries bank-neutral.

### Effective Date Rule for ING

The chosen ING behavior mixes two date sources:

- use `Data księgowania` when present
- otherwise fall back to `Data transakcji`

To keep replacement semantics stable, the parser should normalize one effective transaction date per imported row and require the final imported set to collapse to one canonical month. Booking date remains the preferred source of truth; fallback exists only for rows where ING does not provide a booking date.

### Multi-Account File Semantics

The provided ING export contains transactions from multiple accounts in one file. S-04 should treat that as one supported ING bank export and keep the current batch model unchanged: one `bank = "ing"` batch per canonical month, not one batch per account. The parser may preserve account information only if needed internally during parsing, but it should not expand the persisted transaction contract or replacement key in this slice.

### Preamble and Header Detection

Unlike Revolut, the ING file begins with several non-transaction sections before the actual table header. The parser should not assume the first non-empty line is the CSV header. It must scan for the supported transaction header row, then parse only the table that follows. This is the most important structural difference from S-02 and should be isolated inside `ingCsv.ts`, not scattered through routes.

### Shared Rule Reuse

S-03 already upgraded rules to `title`, `recipient`, and `both` matching. S-04 should not reopen that model. Once ING rows are normalized into the shared draft fields, existing rules should apply exactly as they already do for Revolut. That means parser choices about `title` and `recipient` have downstream summary and auto-categorization consequences, so those mappings must be stable and test-covered.

## Phase 1: Shared Multi-Bank Import Contract

### Overview

Remove the Revolut-only assumptions from shared import types, validation, and route wiring so S-04 has a clean place to plug in a second parser.

### Changes Required:

#### 1. Shared Import Types and Parser Dispatch

**Files**:
- `src/lib/imports/types.ts` (new)
- `src/lib/imports/revolutCsv.ts`
- `src/lib/imports/validation.ts`

**Intent**: Move the normalized transaction draft and parser result shape into a bank-agnostic contract before adding ING-specific logic.

**Contract**:
- Introduce shared import types for:
  - supported bank union: `revolut | ing`
  - normalized transaction draft
  - parsed import preview result
- Update Revolut parser exports to consume or return the shared types rather than defining its own draft shape locally.
- Widen validation so preview and commit payloads can carry either supported bank while still rejecting anything else.

#### 2. Shared Preview/Commit Bank Contract

**Files**:
- `src/lib/imports/http.ts`
- `src/pages/api/imports/preview.ts`
- `src/pages/api/imports/commit.ts`

**Intent**: Prepare the API surface for bank-dispatched parsing without changing the replacement or review persistence model.

**Contract**:
- Preview continues to accept multipart upload plus explicit bank choice.
- Commit continues to persist normalized transaction drafts plus `bank`, `statement_month`, `period_start`, and `period_end`.
- Route-level typing and payload validation must no longer assume `revolut` as the only literal bank.

#### 3. Focused Contract Tests

**File**: `tests/import-review.test.ts`

**Intent**: Lock the widened shared contract before ING-specific parsing is introduced.

**Contract**:
- Add or update tests so the shared validation layer accepts `revolut` and `ing`, and still rejects unsupported banks.
- Keep existing Revolut contract behavior unchanged while moving types out from the parser module.

### Success Criteria:

#### Automated Verification:

- Shared import types compile without any parser or route depending on a Revolut-local draft type.
- Validation and route-contract tests pass for the widened supported-bank union.
- `npx astro check` passes.

#### Manual Verification:

- Review the shared import contract and confirm S-04 broadens only the bank/parser boundary, not the batch persistence or review model.
- Confirm the Revolut path still behaves as the baseline format after the shared-type extraction.

**Implementation Note**: After completing this phase and automated verification, pause for manual confirmation before introducing the ING parser.

---

## Phase 2: ING Parser and API Dispatch

### Overview

Add one exact ING parser and wire preview/commit to dispatch by chosen bank while preserving the existing replacement and review semantics.

### Changes Required:

#### 1. ING CSV Parser Module

**File**: `src/lib/imports/ingCsv.ts`

**Intent**: Isolate the provided ING CSV format contract the same way `revolutCsv.ts` isolates the Revolut contract.

**Contract**:
- Parse the exact semicolon-delimited ING export shape from `context/foundation/resources/ing-statement-example.csv`.
- Skip metadata and preamble sections until the supported transaction header row is found.
- Parse quoted CSV values correctly.
- Normalize imported rows into the shared transaction draft shape:
  - effective transaction date: booking date when present, transaction date otherwise
  - title: concise transaction-type-oriented text derived from the ING export
  - recipient: counterparty text from `Dane kontrahenta`
  - amount: signed account-currency amount from `Kwota transakcji (waluta rachunku)`
- Accept a file containing multiple ING accounts and treat it as one ING monthly export.
- Require the imported rows to collapse to one canonical calendar month.
- Fail fast on unsupported headers, malformed numeric/date fields, or files with no importable rows.

#### 2. Parser Dispatch in Preview Flow

**File**: `src/pages/api/imports/preview.ts`

**Intent**: Keep preview semantics unchanged while selecting the correct parser based on explicit bank choice.

**Contract**:
- `bank = "revolut"` continues to use the existing Revolut parser.
- `bank = "ing"` uses the new ING parser.
- The preview response shape stays shared across both banks so the UI and commit route remain uniform.

#### 3. Import Persistence Reuse

**File**: `src/lib/imports/data.ts`

**Intent**: Reuse the existing batch replacement, category assignment, and review persistence helpers without bank-specific duplication.

**Contract**:
- No account-level split is introduced.
- Existing `(user_id, bank, statement_month)` replacement logic remains the authoritative uniqueness contract.
- Shared rule matching must work on ING normalized rows exactly as it does on Revolut rows.

#### 4. Parser and Route Regression Tests

**File**: `tests/import-review.test.ts`

**Intent**: Put the heaviest verification weight where S-04 is riskiest: parser correctness and import contract preservation.

**Contract**:
- Add ING parser tests covering:
  - header/preamble detection
  - semicolon parsing with quoted values
  - multi-account file acceptance
  - booking-date preference with transaction-date fallback
  - single-month enforcement
  - malformed file rejection
- Add preview-route tests proving the chosen bank dispatches to the correct parser and still reports existing same-month batches correctly.

### Success Criteria:

#### Automated Verification:

- ING parser tests pass for the exact provided sample and the key malformed/fallback cases.
- Preview and commit contract tests pass for both supported banks.
- `npx astro check` passes.
- Targeted ESLint passes for the touched import files.

#### Manual Verification:

- Uploading the provided ING sample produces a valid preview instead of a parser error.
- An invalid or mismatched ING CSV fails cleanly before any batch is created or replaced.
- Re-uploading an ING file for the same month warns before replacement and only proceeds after explicit confirmation.

**Implementation Note**: After completing this phase and automated verification, pause for manual confirmation before widening the `/imports` UI.

---

## Phase 3: Two-Bank Import Workspace UI

### Overview

Update the protected `/imports` workspace so the user explicitly chooses a supported bank and gets format-aware guidance for either Revolut or ING.

### Changes Required:

#### 1. Import Page Copy and Supported-Bank Presentation

**File**: `src/pages/imports.astro`

**Intent**: Remove the fixed “Revolut statement” framing now that the route supports two banks.

**Contract**:
- Replace Revolut-only hero copy with two-bank wording.
- Show the workspace as supporting exactly two named formats: Revolut CSV and ING CSV.
- Keep review status and saved-batch resume behavior unchanged.

#### 2. Bank Selector in Upload Form

**File**: `src/components/imports/ImportUploadForm.tsx`

**Intent**: Make supported-bank choice explicit before upload instead of inferring it implicitly from a single-bank UI.

**Contract**:
- Add a required bank selector or segmented control.
- Send the selected bank to preview.
- Update helper text and validation copy so the user knows the upload is format-specific.
- Keep replacement confirmation and preview summary in the same component flow.

#### 3. Shared Import Workspace State

**File**: `src/components/imports/ImportWorkspace.tsx`

**Intent**: Carry preview and commit state correctly now that preview can come from either bank.

**Contract**:
- Store preview payloads using the widened shared bank type.
- Keep commit, review, and review-complete behavior unchanged once the batch is persisted.
- Do not fork the review table by bank; the normalized draft contract should make the saved review experience uniform.

#### 4. Focused UI Tests

**Files**:
- `tests/import-review.test.ts`
- any co-located import component tests if needed

**Intent**: Prove the user-visible surface widened correctly without over-investing in end-to-end browser coverage.

**Contract**:
- Cover bank selector rendering and submission.
- Cover format-specific helper text or warning copy where it materially changes.
- Preserve existing replacement-warning and review-state coverage.

### Success Criteria:

#### Automated Verification:

- `/imports` type-checks with the widened two-bank upload state.
- `npm run build` passes.
- UI-focused tests cover explicit bank selection and preserve replacement warning behavior.

#### Manual Verification:

- Visiting `/imports` while signed out still redirects to `/auth/signin`.
- A signed-in user can choose Revolut or ING before uploading.
- Choosing ING and uploading the provided sample lands in the same review flow with parsed date, title, recipient, amount, and category.
- The saved review experience remains category-only and does not branch by bank.

**Implementation Note**: After completing this phase and automated verification, pause for manual confirmation before final regression and closeout.

---

## Phase 4: Regression Coverage and Handoff

### Overview

Stabilize two-format support with focused regression coverage and document the slice so implementation can close cleanly.

### Changes Required:

#### 1. Two-Format Regression Coverage

**File**: `tests/import-review.test.ts`

**Intent**: Ensure the second-bank support does not silently break the original Revolut flow or downstream assumptions.

**Contract**:
- Keep or strengthen Revolut regression coverage while adding ING support.
- Cover at least one cross-bank rule-application case to show the shared rule engine still categorizes normalized imported rows from both formats.
- Ensure same-bank same-month replacement behavior remains correct for both supported banks.

#### 2. Fixture Hygiene

**Files**:
- `context/foundation/resources/ing-statement-example.csv`
- any test fixtures introduced for sanitized parser cases

**Intent**: Keep the supported ING contract explicit and reproducible for future parser work.

**Contract**:
- Treat the provided ING sample as the canonical supported export.
- Keep any added fixtures sanitized and narrowly scoped to parser edge cases or UI tests.

#### 3. Change Brief Alignment

**File**: `context/changes/second-supported-format/plan-brief.md`

**Intent**: Keep the high-level handoff aligned with the final implementation decisions.

**Contract**:
- The brief should continue to reflect:
  - one exact ING CSV shape
  - one multi-account ING bank-month batch
  - transaction-date fallback for rows without booking dates
  - explicit bank selector in `/imports`
  - shared rule engine and shared normalized review flow

### Success Criteria:

#### Automated Verification:

- `npm test -- tests/import-review.test.ts` passes with both supported banks covered.
- `npx astro check` passes.
- `npm run build` passes.
- Targeted lint passes for the touched import files and UI files.

#### Manual Verification:

- Review the brief and full plan for phase clarity before starting `/10x-implement second-supported-format phase 1`.
- Confirm this slice stays limited to one exact ING CSV format and does not accidentally broaden into account-level import modeling or generic bank-ingestion infrastructure.

**Implementation Note**: After completing this phase and automated verification, pause for manual confirmation before impl-review or archive.

## Testing Strategy

### Unit Tests:

- Shared supported-bank validation for `revolut` and `ing`.
- ING parser header/preamble detection.
- Semicolon and quoted-value parsing.
- Booking-date preference with transaction-date fallback.
- Single-month enforcement for imported ING rows.
- Rejection of malformed ING files and unsupported variants.

### Integration Tests:

- Preview route dispatches to the correct parser based on explicit bank choice.
- Commit route persists normalized ING drafts through the same batch and transaction pipeline used by Revolut.
- Same-bank same-month replacement still requires explicit confirmation for both supported banks.
- Shared rule matching can categorize imported rows from both formats.

### Manual Testing Steps:

1. Sign out and verify `/imports` still redirects to `/auth/signin`.
2. Sign in, open `/imports`, and verify the upload surface requires choosing Revolut or ING.
3. Choose ING and upload `context/foundation/resources/ing-statement-example.csv`.
4. Confirm the preview succeeds and shows one ING bank-month batch candidate.
5. Save the ING batch and confirm the review table appears with normalized date, title, recipient, amount, and category fields.
6. Re-upload an ING file for the same month and confirm replacement still requires explicit confirmation.
7. Verify that at least one existing reusable rule applies to an ING row when its normalized text matches.

## Performance Considerations

S-04 remains MVP-scale and synchronous. Parsing one ING CSV per request is acceptable, even with preamble scanning and semicolon parsing. Keep the complexity inside the parser module and avoid introducing background jobs, account-level aggregation, or generic parser registries beyond what is needed for exactly two supported formats.

## Migration Notes

No schema migration is expected for S-04 if the import batch remains bank-level and rules remain unscoped by bank. If implementation pressure reveals a need for account-level persistence or bank-scoped rules, stop and re-plan rather than quietly expanding this slice.

Do not commit real banking exports or unsanitized statement files. The provided ING sample should remain the explicit sanitized reference contract for this slice.

## References

- Roadmap item: `context/foundation/roadmap.md:104`
- Existing import workspace: `src/pages/imports.astro`
- Existing upload UI: `src/components/imports/ImportUploadForm.tsx`
- Existing import helpers: `src/lib/imports/data.ts`
- Existing import validation: `src/lib/imports/validation.ts`
- Existing preview route: `src/pages/api/imports/preview.ts`
- Existing Revolut parser: `src/lib/imports/revolutCsv.ts`
- Existing import regression tests: `tests/import-review.test.ts`
- ING sample contract: `context/foundation/resources/ing-statement-example.csv`
- Accepted lessons: `context/foundation/lessons.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Shared Multi-Bank Import Contract

#### Automated

- [x] 1.1 Shared import types compile without any route or helper depending on a Revolut-local draft type. — ad71b47
- [x] 1.2 Supported-bank validation and import route contract tests pass for `revolut` and `ing`. — ad71b47
- [x] 1.3 `npx astro check` passes. — ad71b47

#### Manual

- [x] 1.4 Confirm the widened contract changes only the bank/parser boundary, not the batch replacement or review persistence model. — ad71b47
- [x] 1.5 Confirm the Revolut path still behaves as the baseline format after the shared-type extraction. — ad71b47

### Phase 2: ING Parser and API Dispatch

#### Automated

- [x] 2.1 ING parser tests pass for header detection, semicolon parsing, multi-account acceptance, booking-date preference, transaction-date fallback, and single-month enforcement. — e92ab7a
- [x] 2.2 Preview and commit contract tests pass for both supported banks. — e92ab7a
- [x] 2.3 `npx astro check` passes. — e92ab7a
- [x] 2.4 Targeted lint passes for the touched import files. — e92ab7a

#### Manual

- [x] 2.5 Uploading the provided ING sample produces a valid preview. — e92ab7a
- [x] 2.6 An invalid or mismatched ING CSV fails before any batch is created or replaced. — e92ab7a
- [x] 2.7 Re-uploading an ING file for the same month requires explicit replacement confirmation. — e92ab7a

### Phase 3: Two-Bank Import Workspace UI

#### Automated

- [x] 3.1 The `/imports` route type-checks with the widened two-bank upload state.
- [x] 3.2 `npm run build` passes.
- [x] 3.3 UI-focused tests cover explicit bank selection and preserve replacement warning behavior.

#### Manual

- [x] 3.4 Visiting `/imports` while signed out redirects to `/auth/signin`.
- [x] 3.5 A signed-in user can choose Revolut or ING before uploading.
- [x] 3.6 Choosing ING and uploading the provided sample lands in the same normalized review flow with date, title, recipient, amount, and category.
- [x] 3.7 The saved review experience remains category-only and does not fork by bank.

### Phase 4: Regression Coverage and Handoff

#### Automated

- [ ] 4.1 `npm test -- tests/import-review.test.ts` passes with both supported banks covered.
- [ ] 4.2 `npx astro check` passes.
- [ ] 4.3 `npm run build` passes.
- [ ] 4.4 Targeted lint passes for the touched import and UI files.

#### Manual

- [ ] 4.5 Review the brief and full plan for phase clarity before starting `/10x-implement second-supported-format phase 1`.
- [ ] 4.6 Confirm this slice stays limited to one exact ING CSV format and does not broaden into account-level import modeling or generic bank-ingestion infrastructure.
