# Import Review Rule Application Implementation Plan

## Overview

Implement roadmap item `UX-02`: let a signed-in user create explicit field-aware categorization rules from import review, understand which rows are rule-backed, and optionally apply a newly created rule to matching rows in the current batch without breaking the batch-oriented category-save model introduced in `UX-01`.

## Current State Analysis

The import review workflow already supports batch category editing, explicit dirty-state protection, and a temporary row-level rule shortcut. The summary/dashboard domain already supports field-aware rule persistence and matching semantics across `recipient`, `title`, and `both`. What is still missing is the review-specific workflow that connects those capabilities coherently: import review cannot yet choose a match field, cannot preview how many current-batch rows a new rule would affect, cannot apply that new rule to matching rows in the open batch, and cannot explain which rows were categorized by rules versus manual edits.

### Key Discoveries:

- The roadmap defines `UX-02` as the slice that owns field-aware import-review rules, visible rule-backed rows, and current-batch application semantics: `context/foundation/roadmap.md`.
- `UX-01` deliberately kept rule handling out of bulk category saves and preserved a temporary row-level shortcut boundary: `context/archive/2026-06-01-import-review-bulk-categorization/plan.md`.
- `TransactionReviewTable` already derives dirty category drafts, exposes a separate rule action area, and tells users that rule saving is row-by-row and separate from bulk save: `src/components/imports/TransactionReviewTable.tsx`.
- `ImportWorkspace` already merges bulk category updates back into local transactions and guards review completion while dirty drafts exist, giving this slice a stable state boundary to respect: `src/components/imports/ImportWorkspace.tsx`.
- The existing single-row import rule flow saves the row category and upserts a rule with hard-coded `match_field: "recipient"`, but it does not preview or apply the rule to other rows in the current batch: `src/lib/imports/data.ts`, `src/pages/api/imports/transactions/[id].ts`.
- The shared rule domain already has explicit field-aware matching and CRUD semantics that the review flow should reuse rather than duplicate: `src/lib/rules/data.ts`, `src/lib/rules/validation.ts`, `src/pages/api/rules/index.ts`, `src/pages/api/rules/[id].ts`.
- Existing test coverage already exercises import review helpers, routes, UI rendering, and rule lifecycle/application behavior, so the strongest path is to extend those suites rather than introduce new infrastructure first: `tests/import-review.test.ts`, `tests/review-persistence-and-rule-application.test.ts`.

## Desired End State

A user reviewing an import batch can open a rule action from a row, keep that row as the anchor transaction, choose the match field with `recipient` preselected, and save the row category plus the new rule in one explicit action. After the rule is created, the UI shows how many additional current-batch rows match and lets the user decide whether to apply the rule now. If they apply it, matching persisted rows update in place, any rows with unsaved manual drafts are skipped rather than overwritten, and the result clearly reports what changed and what was skipped. The review table also shows compact provenance badges on rule-backed rows so users can understand why a category is present.

## What We're NOT Doing

- No redesign of dashboard rule management.
- No changes to rule CRUD semantics outside the review integration surface.
- No background or automatic reapplication of rules after the initial user-triggered action.
- No silent auto-apply to the current batch at rule-creation time.
- No overwrite of unsaved local category drafts with rule-driven updates.
- No advanced match preview with full row listing in this slice.
- No new E2E browser suite unless implementation uncovers a browser-only risk.
- No expansion into category/rule density work owned by `UX-03`.

## Implementation Approach

Add a review-specific rule application contract on top of the existing import-review and rule-domain layers. The backend should treat the reviewed row as the anchor: persist its category, create or upsert the rule using explicit `match_field` and `match_text`, count additional matches in the current batch, and optionally apply the new rule to eligible rows in that same batch. The frontend should replace the temporary checkbox shortcut with a more explicit rule workflow that exposes field choice, match-text defaults, a count-only preview, and a distinct “apply now” decision. Existing `UX-01` dirty-state semantics remain authoritative: unsaved local drafts are never overwritten by rule application, and skipped rows are reported back to the user.

## Critical Implementation Details

### Dirty-Draft Protection

The current-batch rule application path must not overwrite unsaved local category drafts. The table already derives dirty state from local drafts versus persisted transaction categories, and that contract should remain the source of truth. Rule application should therefore operate only on persisted rows that are not locally dirty, and any matching dirty rows should be counted and reported as skipped.

### Anchor Row Semantics

Creating a rule from import review must save the current row category and create the rule in one action. This preserves the mental model that the reviewed row is the example transaction the user is turning into reusable logic, instead of forcing them through separate save and rule steps that can drift apart.

### Preview Scope

The user chose a count-only preview before current-batch application. The review flow should therefore tell the user how many additional rows match and how many will be skipped due to unsaved drafts, but it should not add a row-list preview surface in this slice.

### Provenance Contract

Rule-backed visibility must answer “why is this categorized?” in the review table itself. The table should therefore render a compact provenance badge using persisted transaction state or response metadata instead of hiding that explanation in another route or a hover-only interaction.

## Phase 1: Rule Application Contract

### Overview

Add the backend contract that turns one reviewed row into an explicit rule, returns a current-batch match count, and optionally applies the new rule to eligible rows in the same batch.

### Changes Required:

#### 1. Review Rule Request Validation

**File**: `src/lib/imports/validation.ts`

**Intent**: Validate a review-specific rule creation/apply payload before any persistence or mutation occurs.

**Contract**: Add a validator for a payload that includes the anchor `transaction_id`, nullable `category_id`, explicit `match_field`, non-blank `match_text`, and a boolean that decides whether to apply the newly created rule to matching rows in the current batch. The validator must reject malformed payloads and keep the existing bulk category update contract isolated from rule creation.

#### 2. Import Review Rule Helper

**File**: `src/lib/imports/data.ts`

**Intent**: Centralize the review-side workflow that saves the anchor row, creates or upserts the rule, and applies it to eligible current-batch rows when requested.

**Contract**: Add a helper that:
- verifies the target category belongs to the current user,
- updates the anchor transaction category,
- creates or upserts the rule using explicit `match_field` and `match_text`,
- loads the anchor batch and scans its transactions using shared rule-matching logic,
- counts matching rows for preview/reporting,
- optionally updates matching persisted rows in the same batch,
- skips rows supplied as dirty/local-conflict ids,
- returns structured results for `rule`, `anchor transaction`, `match_count`, `applied` rows, and `skipped` rows.

The helper must reuse the shared rule domain matching semantics rather than reimplementing them ad hoc.

#### 3. Review Rule API Route

**File**: `src/pages/api/imports/transactions/rule.ts`

**Intent**: Give import review one dedicated endpoint for rule creation and optional current-batch application.

**Contract**: Add an authenticated import route that reads JSON through the existing import HTTP helpers, validates the review-rule payload, calls the new helper, and returns a response shape the workspace can use directly for notices, provenance updates, and skipped-row reporting.

#### 4. Shared Rule Helper Reuse

**File**: `src/lib/rules/data.ts`

**Intent**: Keep the match logic single-sourced as the review workflow grows more complex.

**Contract**: Reuse or minimally extend the existing rule matching exports so the new import-review rule helper can evaluate matches against `recipient`, `title`, and `both` without duplicating normalization logic.

#### 5. Backend Contract Tests

**Files**:

- `tests/import-review.test.ts`
- `tests/review-persistence-and-rule-application.test.ts`

**Intent**: Prove that the new rule route/helper behaves truthfully for preview, apply-now, and skipped-draft scenarios.

**Contract**: Add tests for:
- anchor-row category save plus rule creation in one action,
- `recipient` default behavior with explicit field-aware overrides,
- count-only preview responses,
- apply-now updates to matching rows in the same batch,
- skipping dirty/local-conflict rows,
- not mutating unrelated batches or other users’ rows,
- preserving existing future-import rule behavior after creation.

### Success Criteria:

#### Automated Verification:

- `npm test -- tests/import-review.test.ts tests/review-persistence-and-rule-application.test.ts` passes with review-rule contract coverage.
- `npx astro check` passes.
- Targeted `npx eslint src/lib/imports/validation.ts src/lib/imports/data.ts src/lib/rules/data.ts src/pages/api/imports/transactions/rule.ts tests/import-review.test.ts tests/review-persistence-and-rule-application.test.ts` passes.

#### Manual Verification:

- Confirm creating a rule from review saves the current row category and persists the rule in one action.
- Confirm the preview reports only a match count plus any skipped-draft count, not a row list.
- Confirm apply-now affects only matching rows in the current batch and does not touch other batches.
- Confirm rows with unsaved drafts are skipped rather than overwritten.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before changing the review-table interaction model.

---

## Phase 2: Review Workflow UI

### Overview

Replace the temporary row-level shortcut with an explicit rule workflow that exposes field choice, current-batch preview, and the apply-now decision without blurring the existing bulk category save controls.

### Changes Required:

#### 1. Review Rule Draft UX

**File**: `src/components/imports/TransactionReviewTable.tsx`

**Intent**: Turn rule creation from a checkbox shortcut into an explicit row-level workflow.

**Contract**: Replace the current `Save as rule` toggle/button pattern with an interaction that opens rule fields for the selected row. The draft should default `match_field` to `recipient`, prefill `match_text` from the anchor transaction’s recipient, and keep the row category as the target category unless the user changes it first.

#### 2. Review Rule Action Callback

**File**: `src/components/imports/TransactionReviewTable.tsx`

**Intent**: Separate rule creation/apply from the existing category-only bulk save path.

**Contract**: Add a dedicated callback such as `onCreateRuleFromReview` that receives the anchor row payload plus the current dirty row ids so the backend can protect unsaved drafts. This callback must remain distinct from `onSaveCategoryChanges`.

#### 3. Count Preview and Apply-Now Choice

**File**: `src/components/imports/TransactionReviewTable.tsx`

**Intent**: Make the current-batch impact visible before the user chooses whether to apply the new rule now.

**Contract**: After a valid rule draft is ready, the row workflow should show count-based copy that communicates how many current-batch rows match and how many would be skipped because they have unsaved drafts. The user must be able to choose whether to save the rule only or save the rule and apply it now.

#### 4. Row-Level Success and Error Copy

**File**: `src/components/imports/TransactionReviewTable.tsx`

**Intent**: Keep the financial workflow understandable when one action may save the anchor row, create a rule, and update other rows.

**Contract**: Show clear success copy for the anchor row and global/row-level feedback for apply-now results. The copy should distinguish between rule creation, current-batch application, and skipped dirty rows instead of collapsing everything into generic “saved” language.

#### 5. Review UI Contract Tests

**File**: `tests/import-review.test.ts`

**Intent**: Lock in the visible rule workflow and preserve `UX-01` boundaries.

**Contract**: Add render/helper coverage for:
- recipient as the default rule field,
- explicit rule action controls appearing separately from bulk category save controls,
- count-only preview copy,
- apply-now choice visibility,
- no regression to row-by-row category-save buttons.

### Success Criteria:

#### Automated Verification:

- `npm test -- tests/import-review.test.ts` passes with review-rule UI coverage.
- `npx astro check` passes.
- Targeted `npx eslint src/components/imports/TransactionReviewTable.tsx tests/import-review.test.ts` passes.

#### Manual Verification:

- Confirm the review table defaults new rules to `recipient` using the anchor row recipient text.
- Confirm a user can choose between saving the rule only and saving plus applying it now.
- Confirm the preview shows counts, not a list of matching rows.
- Confirm the rule workflow remains visually separate from `Save all changes`.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before wiring workspace state and provenance updates.

---

## Phase 3: Provenance and Workspace State

### Overview

Wire review-rule responses into workspace state, merge applied-row updates into local transactions, and surface visible provenance on rule-backed rows.

### Changes Required:

#### 1. Review Rule Workspace Handler

**File**: `src/components/imports/ImportWorkspace.tsx`

**Intent**: Bridge the new review-rule route to local transaction state and notices.

**Contract**: Add a workspace handler that calls the dedicated review-rule endpoint, merges the returned anchor/apply-now transaction updates into local `transactions`, and returns structured feedback the table can use for notices, skipped-row copy, and provenance state.

#### 2. Applied-Row Merge Helper

**File**: `src/components/imports/ImportWorkspace.tsx`

**Intent**: Keep transaction-state merging deterministic when a rule action updates more than one row.

**Contract**: Reuse or extend the existing local merge helper pattern so multiple returned transaction updates can be merged into the in-memory review batch without wiping unrelated rows or unsaved local drafts.

#### 3. Rule-Backed Provenance Surface

**File**: `src/components/imports/TransactionReviewTable.tsx`

**Intent**: Make rule-driven categorization visible directly in the review table.

**Contract**: Render a compact provenance badge on rows categorized by a saved rule. The badge should survive refreshes based on persisted transaction/rule metadata, not only ephemeral local success state.

#### 4. Persisted Provenance Source

**Files**:

- `src/lib/imports/data.ts`
- `src/pages/imports.astro`

**Intent**: Ensure the review screen can know which persisted rows are rule-backed when loading or reloading a batch.

**Contract**: Extend the loaded review-batch payload or derived row view model with enough metadata to mark rule-backed rows on first render, without changing the underlying financial semantics of category assignment.

#### 5. Workspace and Provenance Tests

**Files**:

- `tests/import-review.test.ts`
- `tests/review-persistence-and-rule-application.test.ts`

**Intent**: Prove that apply-now updates merge cleanly and provenance remains visible after persisted state changes.

**Contract**: Add coverage for:
- merging multiple applied-row updates after a rule action,
- keeping dirty drafts intact when matching rows were skipped,
- rendering rule-backed badges for persisted rows,
- preserving future-import rule behavior alongside current-batch application.

### Success Criteria:

#### Automated Verification:

- `npm test -- tests/import-review.test.ts tests/review-persistence-and-rule-application.test.ts` passes with workspace/provenance coverage.
- `npx astro check` passes.
- `npm run build` passes.
- Targeted `npx eslint src/components/imports/ImportWorkspace.tsx src/components/imports/TransactionReviewTable.tsx src/lib/imports/data.ts src/pages/imports.astro tests/import-review.test.ts tests/review-persistence-and-rule-application.test.ts` passes.

#### Manual Verification:

- Confirm apply-now updates matching persisted rows in place without wiping unrelated local state.
- Confirm rows with unsaved drafts remain unchanged and are reported as skipped.
- Confirm rule-backed rows show a visible provenance badge after reload, not only immediately after creation.
- Confirm review completion still respects `UX-01` dirty-state blocking after rule application.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before final regression and handoff.

---

## Phase 4: Regression and Handoff

### Overview

Harden the new workflow with focused regression coverage and keep the scope boundaries crisp so `UX-02` finishes the review-rule workflow without absorbing unrelated management or density work.

### Changes Required:

#### 1. Import Review Regression Alignment

**Files**:

- `tests/import-review.test.ts`
- `tests/review-persistence-and-rule-application.test.ts`

**Intent**: Keep the review flow truthful across category-only bulk save, review completion, future-import rule behavior, and the new current-batch rule application path.

**Contract**: Ensure the final suite still proves:
- bulk category saves remain category-only,
- review completion blocking still keys off dirty drafts,
- new rules still affect future imports,
- current-batch rule application stays explicit and non-destructive.

#### 2. Planning and Scope Alignment

**Files**:

- `context/changes/import-review-rule-application/plan.md`
- `context/changes/import-review-rule-application/plan-brief.md`
- `context/foundation/roadmap.md`

**Intent**: Leave a precise handoff for implementation and future `UX-03`.

**Contract**: Keep the documentation explicit that `UX-02` delivers field-aware rule creation from review, count-only current-batch preview, visible rule-backed rows, and skip-on-dirty protection. Do not claim row-list previews, dashboard rule redesign, or density work.

### Success Criteria:

#### Automated Verification:

- `npm test -- tests/import-review.test.ts tests/review-persistence-and-rule-application.test.ts` passes.
- `npx astro check` passes.
- `npm run build` passes.
- Targeted lint passes for the touched import-review, rule, and test files.

#### Manual Verification:

- Review the plan brief and confirm `UX-02` is scoped to review-side rule creation, visible provenance, and explicit current-batch application only.
- Confirm `UX-03` remains the future home for denser rule-management layouts rather than this slice.
- Confirm the manual verification items are concrete enough to follow step by step during implementation.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before impl-review or archive.

## Testing Strategy

### Unit Tests:

- Review-rule payload validation.
- Field-aware match counting and current-batch application filtering.
- Skip-on-dirty conflict handling.
- Merge behavior for multiple applied-row updates.
- Provenance derivation for rule-backed rows.

### Integration Tests:

- Review rule route saves the anchor row category and persists the rule.
- Apply-now updates matching rows in the current batch only.
- Dirty rows are skipped rather than overwritten.
- Future imports still receive rule-based categorization from the persisted rule.
- Review table and workspace wiring preserve `UX-01` bulk-save and completion-block behavior.

### Manual Testing Steps:

1. Sign in and open `/imports` with an existing batch that contains repeated merchants or titles.
2. Change one row to the target category and open the rule action from that row.
3. Confirm the rule form defaults to `recipient` and prefills the anchor row’s recipient text.
4. Save the rule without applying it now and confirm the current row saves, the rule persists, and no other rows change.
5. Create another rule and choose the apply-now path.
6. Confirm the UI reports how many current-batch rows matched before applying.
7. Confirm matching persisted rows update in place after apply-now.
8. Leave at least one matching row with an unsaved local draft, apply a rule from another row, and confirm the drafted row is skipped rather than overwritten.
9. Reload the review page and confirm rule-backed rows still show provenance badges.
10. Confirm `Save all changes` and review-completion blocking still behave correctly after rule actions.

## Performance Considerations

Current-batch rule application is expected to run against one MVP-sized monthly import batch, so synchronous scan-and-update behavior is acceptable. The implementation should still keep matching scoped to the active batch and reuse existing normalized matching helpers to avoid unnecessary repeated parsing or duplicate query patterns.

## Migration Notes

No schema migration is expected if rule-backed provenance can be derived from existing persisted rule and transaction data. If implementation reveals that persisted provenance cannot be reconstructed truthfully from the current model, stop and revisit the design before inventing a hidden local-only approximation.

## References

- Roadmap slice: `context/foundation/roadmap.md`
- Prior boundary for bulk category review: `context/archive/2026-06-01-import-review-bulk-categorization/plan.md`
- Monthly summary and field-aware rules baseline: `context/archive/2026-05-30-monthly-summary-and-rules/plan.md`
- Import review table: `src/components/imports/TransactionReviewTable.tsx`
- Import workspace: `src/components/imports/ImportWorkspace.tsx`
- Review completion bar: `src/components/imports/ReviewCompletionBar.tsx`
- Single-row import transaction route: `src/pages/api/imports/transactions/[id].ts`
- Bulk category route: `src/pages/api/imports/transactions/bulk.ts`
- Import data helpers: `src/lib/imports/data.ts`
- Import validation: `src/lib/imports/validation.ts`
- Rule data helpers: `src/lib/rules/data.ts`
- Rule validation: `src/lib/rules/validation.ts`
- Rules APIs: `src/pages/api/rules/index.ts`, `src/pages/api/rules/[id].ts`
- Import review tests: `tests/import-review.test.ts`
- Rule persistence/application tests: `tests/review-persistence-and-rule-application.test.ts`
- Accepted lessons: `context/foundation/lessons.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Rule Application Contract

#### Automated

- [x] 1.1 `npm test -- tests/import-review.test.ts tests/review-persistence-and-rule-application.test.ts` passes with review-rule contract coverage. — 8a06038
- [x] 1.2 `npx astro check` passes. — 8a06038
- [x] 1.3 Targeted `npx eslint src/lib/imports/validation.ts src/lib/imports/data.ts src/lib/rules/data.ts src/pages/api/imports/transactions/rule.ts tests/import-review.test.ts tests/review-persistence-and-rule-application.test.ts` passes. — 8a06038

#### Manual

- [ ] 1.4 Confirm creating a rule from review saves the current row category and persists the rule in one action.
- [ ] 1.5 Confirm the preview reports only a match count plus any skipped-draft count, not a row list.
- [ ] 1.6 Confirm apply-now affects only matching rows in the current batch and does not touch other batches.
- [ ] 1.7 Confirm rows with unsaved drafts are skipped rather than overwritten.

### Phase 2: Review Workflow UI

#### Automated

- [x] 2.1 `npm test -- tests/import-review.test.ts` passes with review-rule UI coverage. — 8a06038
- [x] 2.2 `npx astro check` passes. — 8a06038
- [x] 2.3 Targeted `npx eslint src/components/imports/TransactionReviewTable.tsx tests/import-review.test.ts` passes. — 8a06038

#### Manual

- [ ] 2.4 Confirm the review table defaults new rules to `recipient` using the anchor row recipient text.
- [ ] 2.5 Confirm a user can choose between saving the rule only and saving plus applying it now.
- [ ] 2.6 Confirm the preview shows counts, not a list of matching rows.
- [ ] 2.7 Confirm the rule workflow remains visually separate from `Save all changes`.

### Phase 3: Provenance and Workspace State

#### Automated

- [x] 3.1 `npm test -- tests/import-review.test.ts tests/review-persistence-and-rule-application.test.ts` passes with workspace/provenance coverage. — 8a06038
- [x] 3.2 `npx astro check` passes. — 8a06038
- [x] 3.3 `npm run build` passes. — 8a06038
- [x] 3.4 Targeted `npx eslint src/components/imports/ImportWorkspace.tsx src/components/imports/TransactionReviewTable.tsx src/lib/imports/data.ts src/pages/imports.astro tests/import-review.test.ts tests/review-persistence-and-rule-application.test.ts` passes. — 8a06038

#### Manual

- [ ] 3.5 Confirm apply-now updates matching persisted rows in place without wiping unrelated local state.
- [ ] 3.6 Confirm rows with unsaved drafts remain unchanged and are reported as skipped.
- [ ] 3.7 Confirm rule-backed rows show a visible provenance badge after reload, not only immediately after creation.
- [ ] 3.8 Confirm review completion still respects `UX-01` dirty-state blocking after rule application.

### Phase 4: Regression and Handoff

#### Automated

- [x] 4.1 `npm test -- tests/import-review.test.ts tests/review-persistence-and-rule-application.test.ts` passes. — 8a06038
- [x] 4.2 `npx astro check` passes. — 8a06038
- [x] 4.3 `npm run build` passes. — 8a06038
- [x] 4.4 Targeted lint passes for the touched import-review, rule, and test files. — 8a06038

#### Manual

- [ ] 4.5 Review the plan brief and confirm `UX-02` is scoped to review-side rule creation, visible provenance, and explicit current-batch application only.
- [ ] 4.6 Confirm `UX-03` remains the future home for denser rule-management layouts rather than this slice.
- [ ] 4.7 Confirm the manual verification items are concrete enough to follow step by step during implementation.
