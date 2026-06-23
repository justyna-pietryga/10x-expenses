# Additional Bank Support Implementation Plan

## Overview

Extend the existing bank-statement import workflow with one exact PKO BP CSV export format. PKO rows will be normalized into the shared import contract and then use the existing preview, same-bank-month replacement, categorization-rule, review-history, and completion flows without bank-specific downstream branches.

## Current State Analysis

The application supports Revolut and ING through explicit bank selection and bank-specific parsers. Both parsers emit the same normalized transaction shape, after which persistence and review are bank-neutral. The supplied PKO samples use a comma-delimited, quoted, 11-column layout: seven named columns followed by four unnamed detail columns whose labels and meanings vary by transaction.

PKO support therefore belongs at the existing parser and bank-registration seam. No database migration, new review workflow, or persistence model is needed.

## Desired End State

A signed-in user can choose PKO BP CSV on `/imports`, upload a supported single-month PLN export, preview normalized transactions, and save or replace the PKO batch through the existing review flow. BLIK payments expose the merchant/address as recipient; phone transfers expose the sender or receiver as recipient and the transfer title as title; fee-like rows remain useful through stable fallbacks.

### Key Discoveries:

- The shared bank union currently contains only `revolut | ing`: `src/lib/imports/types.ts:1`.
- Runtime bank validation and its error copy are limited to Revolut and ING: `src/lib/imports/validation.ts:85`.
- Preview dispatch currently treats every non-Revolut bank as ING, so adding a third bank requires explicit exhaustive dispatch: `src/pages/api/imports/preview.ts:9`.
- The normalized parser output is already bank-neutral: `src/lib/imports/types.ts:8`.
- Replacement identity already includes bank and statement month, so PKO batches can coexist with other banks without schema changes: `src/lib/imports/data.ts:200`.
- The PKO samples contain seven named columns and four unnamed detail columns. Useful recipient and title data must be discovered by labels across the detail cells rather than fixed unnamed-column meanings: `context/foundation/resources/pko-statement-example.csv` and `context/foundation/resources/pko-statement-example2.csv`.
- Existing rule matching operates on normalized `recipient` and `title`, making PKO text extraction a load-bearing categorization contract: `src/lib/imports/data.ts:93`.
- Roadmap-linked commits for this change should use the `S-07` Conventional Commit scope, per `context/foundation/lessons.md`.

## What We're NOT Doing

- No Santander parser, UI option, fixture, or tests in this change.
- No generic PKO parser or support for unverified PKO export variants.
- No PDF, XLS/XLSX, automatic bank detection, or direct bank connection.
- No multi-month file splitting; a supported file must contain exactly one operation month.
- No non-PLN PKO imports because transactions do not persist currency.
- No database schema, replacement, review, rule-engine, history, or summary redesign.
- No parsing of balance as transaction amount.
- No attempt to preserve phone numbers, account numbers, operation IDs, or reference numbers as dedicated fields.

## Implementation Approach

Register `pko` as a third supported bank and add a strict `pkoCsv.ts` parser for the supplied 11-column export. The parser will use `Data operacji`, signed `Kwota`, and PLN validation, then scan all description/detail cells for normalized labels rather than assigning fixed meanings to the unnamed columns.

Normalization will prefer semantic values in this order:

- BLIK/web mobile payments: recipient from `Lokalizacja: Adres:`; title from `Typ transakcji`.
- Phone transfers: recipient from `Nazwa nadawcy:` or `Nazwa odbiorcy:`; title from `Tytuł:`.
- Other rows such as card fees: recipient from `Typ transakcji`; title from the cleaned primary description, falling back to transaction type.

All rows must normalize to non-empty recipient and title values. The parser will reject unsupported headers, malformed rows, invalid dates or amounts, non-PLN rows, empty imports, and imports spanning multiple operation months. Once normalized, PKO follows the existing preview and commit pipeline unchanged.

## Critical Implementation Details

### Label-Aware Detail Extraction

The four unnamed columns are continuation fields, not stable schema fields. Scan the primary description and every continuation cell for case- and diacritic-normalized labels such as `Lokalizacja: Adres:`, `Nazwa nadawcy:`, `Nazwa odbiorcy:`, and `Tytuł:`. Preserve the extracted value's readable text while using normalized text only for label recognition.

### PKO Text Fallbacks

Do not use numeric BLIK `Tytuł` values as the primary title when a web/mobile payment already has a meaningful transaction type. Conversely, transfer rows need their labeled `Tytuł` value because it carries user-authored context. Identifier-heavy fields such as phone, account, operation, and reference numbers are not recipient fallbacks.

## Phase 1: PKO Parser Contract

### Overview

Add PKO to the shared bank contract, implement strict parsing and validation for the supplied export, and make parser dispatch exhaustive.

### Changes Required:

#### 1. Supported Bank Contract

**File**: `src/lib/imports/types.ts`

**Intent**: Register PKO as a supported bank while preserving the shared normalized transaction contract.

**Contract**: Extend `SupportedBank` with the lowercase identifier `pko`. Do not change `ImportedTransactionDraft` or `ParsedImportCsv`.

**File**: `src/lib/imports/validation.ts`

**Intent**: Accept PKO in preview and commit payloads and keep unsupported-bank errors accurate.

**Contract**: `validateSupportedBank` accepts `revolut`, `ing`, and `pko`; all other values remain rejected with copy naming the three supported CSV formats.

#### 2. PKO CSV Parser

**File**: `src/lib/imports/pkoCsv.ts`

**Intent**: Parse the exact quoted, comma-delimited PKO export represented by the two sanitized samples.

**Contract**: Export `parsePkoCsv(text): ParsedImportCsv` with these invariants:

- Recognize the exact ordered 11-column header: seven named PKO columns followed by four blank continuation headers.
- Parse quoted fields correctly, including commas inside fee descriptions.
- Require each transaction row to retain 11 columns, including empty trailing detail cells.
- Use `Data operacji` as `transaction_date`; validate it as a real `YYYY-MM-DD` date.
- Parse `Kwota` as a signed dot-decimal number and infer cashflow type from its sign.
- Require `Waluta` to equal `PLN` after trimming and case normalization.
- Never use `Saldo po transakcji` as the imported amount.
- Produce at least one normalized row and enforce exactly one operation month.
- Derive period start/end from operation dates and statement month as the first day of that month.

#### 3. Exhaustive Preview Dispatch

**File**: `src/pages/api/imports/preview.ts`

**Intent**: Dispatch PKO uploads to their parser without allowing future bank additions to fall through to an unrelated parser.

**Contract**: Replace the current two-way fallback with an explicit exhaustive switch or typed parser map for Revolut, ING, and PKO. Preserve the preview response and existing-batch lookup contracts.

### Success Criteria:

#### Automated Verification:

- PKO parser tests pass for exact header recognition, quoted commas, 11-column preservation, operation-date parsing, signed amounts, PLN validation, empty-import rejection, and single-month enforcement.
- Supported-bank validation accepts `pko` and continues to reject unknown banks.
- Preview dispatch tests prove PKO uses `parsePkoCsv` and detects an existing PKO bank-month batch.
- `npm run check` passes.
- Targeted lint passes for the Phase 1 files.

#### Manual Verification:

- Review the parser contract against both sanitized PKO samples and confirm no unnamed continuation column is treated as a fixed semantic field.
- Confirm non-PLN and multi-month files fail before any batch is created or replaced.

**Implementation Note**: After completing this phase and all automated verification passes, pause for manual confirmation before finalizing normalization behavior.

---

## Phase 2: Label-Aware PKO Normalization

### Overview

Normalize PKO description fragments into stable title and recipient values that support human review and reusable categorization rules.

### Changes Required:

#### 1. Detail Label Recognition

**File**: `src/lib/imports/pkoCsv.ts`

**Intent**: Extract semantic values from labels that can occur in any of the five description/detail cells.

**Contract**: Recognize labels with case- and diacritic-tolerant matching while returning cleaned original values:

- `Lokalizacja: Adres:`
- `Nazwa nadawcy:`
- `Nazwa odbiorcy:`
- `Tytuł:`

Ignore label-only noise as dedicated output, including account, phone, operation, and reference identifiers.

#### 2. Transaction-Aware Mapping and Fallbacks

**File**: `src/lib/imports/pkoCsv.ts`

**Intent**: Make normalized fields useful for both review display and existing rule matching.

**Contract**:

- For `Płatność web - kod mobilny`, use the location/address value as recipient and transaction type as title.
- For transfer rows, use sender name when present, otherwise receiver name, as recipient; use the labeled transfer title as title.
- For fee and other rows without semantic labels, use transaction type as recipient and cleaned primary description as title.
- If a preferred value is absent, fall back through meaningful description text and transaction type until both normalized fields are non-empty.
- Avoid promoting raw account, phone, operation, reference, balance, or opaque numeric-title values into the recipient field.

#### 3. Normalization Regression Tests

**File**: `tests/import-review.test.ts`

**Intent**: Lock the mappings that affect future categorization rules.

**Contract**: Cover at least:

- BLIK recipient extraction for `fabrykabodziakow.pl` and `www.pixbook.pl`.
- Incoming phone-transfer sender and user-authored title extraction.
- Outgoing phone-transfer receiver and user-authored title extraction.
- Card-fee fallback behavior.
- Missing preferred-label fallback behavior.
- Positive transfer inference as income and negative transfer inference as expense.
- Diacritic/encoding-tolerant label recognition where consistent with existing parser normalization.

### Success Criteria:

#### Automated Verification:

- Focused PKO normalization tests pass for BLIK, incoming transfer, outgoing transfer, fee, and fallback rows.
- Rule-oriented assertions prove normalized recipients and titles contain the expected stable values and exclude identifier-only fields.
- `npm test -- tests/import-review.test.ts` passes.
- `npm run check` passes.
- Targeted lint passes for the touched parser and test files.

#### Manual Verification:

- Inspect preview-equivalent normalized output for both PKO samples and confirm merchants, sender/receiver names, and transfer titles are understandable.
- Confirm the normalized recipient values are stable enough to create reusable rules without matching account or reference numbers.

**Implementation Note**: After completing this phase and all automated verification passes, pause for manual confirmation before exposing PKO in the upload UI.

---

## Phase 3: PKO Upload UI and Regression Coverage

### Overview

Expose PKO BP in the existing import workspace and verify that the full shared preview, replacement, and review contracts remain intact.

### Changes Required:

#### 1. PKO Bank Selection and Guidance

**File**: `src/components/imports/ImportUploadForm.tsx`

**Intent**: Let users explicitly select PKO BP and understand the supported format boundaries.

**Contract**: Add `pko` to the bank selector and `BANK_COPY` with the label `PKO BP CSV`. Guidance should state that the supported export is CSV, PLN-only, single-month, and previewed before saving. Preserve existing Revolut and ING behavior.

**File**: `src/pages/imports.astro`

**Intent**: Keep page-level supported-bank copy accurate.

**Contract**: Name Revolut CSV, ING CSV, and PKO BP CSV as the three supported formats without suggesting universal PKO or Santander support.

#### 2. Shared History Label

**File**: `src/components/imports/ImportHistory.tsx`

**Intent**: Display PKO batches with a human-readable label in import history.

**Contract**: Format `pko` as `PKO BP`, preserving current labels for ING and Revolut. Prefer an exhaustive bank-label mapping so future supported banks cannot silently render as Revolut.

#### 3. End-to-End Contract Regression Tests

**File**: `tests/import-review.test.ts`

**Intent**: Prove PKO plugs into the shared workflow without downstream bank-specific behavior.

**Contract**: Add focused coverage for:

- rendering PKO BP in the selector and format copy.
- previewing the canonical PKO sample.
- detecting and explicitly confirming same-PKO same-month replacement.
- committing a normalized PKO payload through the existing bank-neutral persistence helper.
- rendering PKO BP in import history.
- retaining Revolut and ING selector, parser, and preview regressions.

### Success Criteria:

#### Automated Verification:

- PKO UI and shared-flow tests pass in `tests/import-review.test.ts`.
- Full unit suite passes: `npm test`.
- Lint passes: `npm run lint`.
- Astro and TypeScript checks pass: `npm run check`.
- Production build passes: `npm run build`.

#### Manual Verification:

- A signed-in user can select PKO BP CSV, upload a valid June sample, and see meaningful preview rows.
- A PKO file with an unsupported header, non-PLN row, or multiple operation months shows a clear error and creates no batch.
- Re-uploading PKO for the same month requires explicit replacement confirmation.
- A committed PKO batch appears as `PKO BP` in history and uses the unchanged review, rule, exclusion, and completion controls.
- Revolut and ING imports remain available and unchanged.

**Implementation Note**: After completing this phase and all automated verification passes, pause for final human verification before implementation review or archive.

## Testing Strategy

### Unit Tests:

- Strict PKO header and row-width validation.
- Quote-aware parsing with embedded commas.
- Operation-date, signed amount, PLN-only, one-month, and non-empty contracts.
- Label recognition across all description/detail positions.
- BLIK, sender, receiver, transfer-title, fee, and fallback normalization.
- Supported-bank validation and exhaustive parser dispatch.

### Integration Tests:

- PKO preview returns the shared preview payload and existing bank-month summary.
- PKO commit uses the existing replacement confirmation and persistence path.
- Existing categorization rules receive the normalized PKO recipient/title values.
- Import history renders PKO alongside Revolut and ING without changing review behavior.

### Manual Testing Steps:

1. Sign in and open `/imports`.
2. Select `PKO BP CSV` and upload `context/foundation/resources/pko-statement-example2.csv`.
3. Confirm BLIK rows show website recipients, transfer rows show sender/receiver names and transfer titles, and fee rows remain understandable.
4. Save the June batch and verify it opens in the normal review table and appears as PKO BP in history.
5. Re-upload a June PKO file and confirm replacement requires explicit approval.
6. Change a PKO sample to another month or currency and verify preview rejects it without changing saved data.
7. Smoke-test one Revolut and one ING preview to confirm no regression.

## Performance Considerations

PKO parsing remains synchronous and linear in file size, matching the existing MVP parsers. Scanning five description/detail cells per row is bounded work and does not justify background jobs, caching, or a generalized parsing framework.

## Migration Notes

No database migration is expected. The database stores bank as nonblank text, replacement already keys by bank and statement month, and all downstream transaction fields are shared.

The two PKO files under `context/foundation/resources/` are sanitized reference exports. Do not add real statements or secrets. Santander should be planned separately after a representative sanitized export is available.

## References

- Roadmap item S-07: `context/foundation/roadmap.md:261`
- Shared import types: `src/lib/imports/types.ts`
- Bank validation: `src/lib/imports/validation.ts`
- Preview dispatch: `src/pages/api/imports/preview.ts`
- Shared persistence and replacement: `src/lib/imports/data.ts`
- Upload UI: `src/components/imports/ImportUploadForm.tsx`
- Import history: `src/components/imports/ImportHistory.tsx`
- Existing parser tests: `tests/import-review.test.ts`
- PKO reference samples: `context/foundation/resources/pko-statement-example.csv`, `context/foundation/resources/pko-statement-example2.csv`
- Prior multi-bank plan: `context/archive/2026-05-31-second-supported-format/plan.md`
- Accepted lessons: `context/foundation/lessons.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: PKO Parser Contract

#### Automated

- [ ] 1.1 PKO parser tests pass for format, date, amount, currency, empty-import, and single-month contracts.
- [ ] 1.2 Supported-bank validation and PKO preview-dispatch tests pass.
- [ ] 1.3 `npm run check` passes.
- [ ] 1.4 Targeted lint passes for the Phase 1 files.

#### Manual

- [ ] 1.5 Confirm unnamed continuation columns are treated as variable detail cells.
- [ ] 1.6 Confirm non-PLN and multi-month files fail before persistence.

### Phase 2: Label-Aware PKO Normalization

#### Automated

- [ ] 2.1 PKO normalization tests pass for BLIK, incoming transfer, outgoing transfer, fee, and fallback rows.
- [ ] 2.2 Rule-oriented assertions prove stable recipient/title values without identifier-only recipients.
- [ ] 2.3 `npm test -- tests/import-review.test.ts` passes.
- [ ] 2.4 `npm run check` passes.
- [ ] 2.5 Targeted lint passes for the Phase 2 files.

#### Manual

- [ ] 2.6 Confirm preview-equivalent output from both PKO samples is understandable.
- [ ] 2.7 Confirm recipient values are suitable for reusable categorization rules.

### Phase 3: PKO Upload UI and Regression Coverage

#### Automated

- [ ] 3.1 PKO UI, history, preview, replacement, and persistence regression tests pass.
- [ ] 3.2 `npm test` passes.
- [ ] 3.3 `npm run lint` passes.
- [ ] 3.4 `npm run check` passes.
- [ ] 3.5 `npm run build` passes.

#### Manual

- [ ] 3.6 A signed-in user can import and review the supported PKO BP CSV.
- [ ] 3.7 Invalid PKO format, currency, and month inputs fail without persistence.
- [ ] 3.8 Same-month PKO replacement requires explicit confirmation.
- [ ] 3.9 PKO history and review use the existing shared workflow.
- [ ] 3.10 Revolut and ING imports remain unchanged.
