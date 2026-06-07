---
date: 2026-06-02T14:58:45.6906606+02:00
researcher: Codex
git_commit: a13f822987bb880ddd705cb104f211e5cb22b63b
branch: main
repository: 10x-expenses
topic: "Research the area pointed out in context\\foundation\\test-plan.md and find needed info for planning the implementation of tests"
tags: [research, codebase, imports, summary, testing]
status: complete
last_updated: 2026-06-02
last_updated_by: Codex
---

# Research: Research the area pointed out in context\foundation\test-plan.md and find needed info for planning the implementation of tests

**Date**: 2026-06-02T14:58:45.6906606+02:00
**Researcher**: Codex
**Git Commit**: a13f822987bb880ddd705cb104f211e5cb22b63b
**Branch**: main
**Repository**: 10x-expenses

## Research Question

Research the Phase 1 area from `context/foundation/test-plan.md` and gather the concrete code and coverage details needed to plan the implementation of tests for:

- Risk #1: summary trust and incomplete-review separation
- Risk #2: same bank/month replacement integrity
- Risk #6: invalid import or rule input rejection

## Summary

Phase 1 should stay at the current helper-and-route integration layer. The repo already has a working Vitest pattern that exercises Astro API routes and domain helpers against hand-built Supabase stubs rather than browser automation, and both import and summary areas already use it extensively. The planning work should therefore avoid inventing a new harness and instead extend the existing `tests/import-review.test.ts` and `tests/monthly-summary-and-rules.test.ts` suites.

The most important uncovered risk is not the happy-path replacement confirmation. It is the non-atomic replace flow in `commitImportBatch`: when an existing batch exists, the code deletes old transactions, updates the batch metadata, and only then inserts the new transactions. There is no transaction boundary around that sequence, so a failure during the final insert can leave the month in a corrupted intermediate state rather than "exactly one correct batch." Existing tests cover confirmation and happy-path creation, but they do not simulate that destructive partial-replace failure.

The summary trust boundary is implemented clearly in live code: pending batches contribute to `incomplete_review_spend`, reviewed categorized rows drive category totals, reviewed uncategorized rows stay separate, and only reviewed historical batches feed carry-over. Existing tests already verify the main happy path for that separation, so the plan should focus on edge cases that still matter to Risk #1: default month resolution, months with only pending imports, and snapshot refresh behavior on repeated loads.

For Risk #6, validation is centralized and already tested at the parser and payload-validator layer. The missing planning question is not whether invalid headers or empty updates are rejected; that is already covered. The useful additions are route-level failures at the real boundaries that the user can hit: wrong content type, malformed JSON shape, and replacement/commit failures that must surface a truthful error without silently mutating persisted state.

## Detailed Findings

### Import replacement flow and its real failure path

- `commitImportBatch` uses `(user_id, bank, statement_month)` as the replacement key via `findExistingImportBatch`, which aligns with the archived S-02 contract and the current test plan's Risk #2 ([`src/lib/imports/data.ts:51-68`](https://github.com/justyna-pietryga/10x-expenses/blob/a13f822987bb880ddd705cb104f211e5cb22b63b/src/lib/imports/data.ts#L51-L68)).
- On replace, the helper deletes existing transactions first, then updates the existing batch, and only after that inserts the new transactions ([`src/lib/imports/data.ts:112-179`](https://github.com/justyna-pietryga/10x-expenses/blob/a13f822987bb880ddd705cb104f211e5cb22b63b/src/lib/imports/data.ts#L112-L179)).
- That sequence is not wrapped in a database transaction in application code. From the caller's point of view, the intended contract is atomic replacement, but the implementation can fail after old rows are deleted and before new rows finish inserting. This is the strongest concrete code risk for Phase 1.
- The commit route is thin and preserves that helper contract directly, so route tests alone will not catch deeper integrity gaps unless the stub simulates mid-flight persistence failure ([`src/pages/api/imports/commit.ts:6-22`](https://github.com/justyna-pietryga/10x-expenses/blob/a13f822987bb880ddd705cb104f211e5cb22b63b/src/pages/api/imports/commit.ts#L6-L22)).
- Current coverage proves explicit confirmation is required and that a happy-path batch starts with `review_completed_at: null`, but it does not assert replace-path rollback or post-failure truthfulness ([`tests/import-review.test.ts:562-616`](https://github.com/justyna-pietryga/10x-expenses/blob/a13f822987bb880ddd705cb104f211e5cb22b63b/tests/import-review.test.ts#L562-L616), [`tests/import-review.test.ts:918-965`](https://github.com/justyna-pietryga/10x-expenses/blob/a13f822987bb880ddd705cb104f211e5cb22b63b/tests/import-review.test.ts#L918-L965)).

Planning implication:
- Add a helper-level integration test that simulates `transactions.insert` failing after the existing batch delete/update path has started. The test should assert the exposed failure and document the current non-atomic behavior. If the desired behavior is stricter, this test will fail first and justify an implementation change.
- Keep the oracle at the business level: "same bank/month replace leaves one truthful month state," not "specific method X was called."

### Summary trust boundary and review gating

- Summary month discovery is driven from import batches plus incomes, and the default selected month prefers the latest month with completed or pending imports before falling back to any known month or the current month ([`src/lib/summary/data.ts:121-183`](https://github.com/justyna-pietryga/10x-expenses/blob/a13f822987bb880ddd705cb104f211e5cb22b63b/src/lib/summary/data.ts#L121-L183)).
- `loadDashboardSummary` loads selected-month batches, historical reviewed batches, and current transactions, then splits spend into three buckets:
  - pending batch spend -> `incomplete_review_spend`
  - reviewed categorized spend -> category totals
  - reviewed uncategorized spend -> separate reviewed-uncategorized total
  ([`src/lib/summary/data.ts:185-289`](https://github.com/justyna-pietryga/10x-expenses/blob/a13f822987bb880ddd705cb104f211e5cb22b63b/src/lib/summary/data.ts#L185-L289)).
- Only reviewed historical transactions contribute to carry-over inputs, which means pending or uncategorized history does not pollute carry-over math ([`src/lib/summary/data.ts:273-306`](https://github.com/justyna-pietryga/10x-expenses/blob/a13f822987bb880ddd705cb104f211e5cb22b63b/src/lib/summary/data.ts#L273-L306)).
- Warning batches are built from selected-month batches that still have `review_completed_at = null`, and the result is also upserted into `monthly_summaries` as a cache, not used as the source of truth ([`src/lib/summary/data.ts:330-385`](https://github.com/justyna-pietryga/10x-expenses/blob/a13f822987bb880ddd705cb104f211e5cb22b63b/src/lib/summary/data.ts#L330-L385)).
- Current summary tests already prove the main trust split: 200 reviewed categorized, 50 reviewed uncategorized, 30 incomplete-review spend, and one warning batch ([`tests/monthly-summary-and-rules.test.ts:342-365`](https://github.com/justyna-pietryga/10x-expenses/blob/a13f822987bb880ddd705cb104f211e5cb22b63b/tests/monthly-summary-and-rules.test.ts#L342-L365)).
- The summary API route is also already covered for the selected-month happy path ([`tests/monthly-summary-and-rules.test.ts:411-436`](https://github.com/justyna-pietryga/10x-expenses/blob/a13f822987bb880ddd705cb104f211e5cb22b63b/tests/monthly-summary-and-rules.test.ts#L411-L436)).

Planning implication:
- Do not spend Phase 1 budget re-testing the already-covered reviewed-versus-incomplete happy path.
- Add targeted tests for:
  - default month selection when no explicit `month` query is provided
  - a month with only pending batches, where category totals should stay zero while `incomplete_review_spend` and `warning_batches` stay populated
  - repeated summary refresh/upsert behavior when a previous snapshot already exists
- The cheapest layer remains summary-helper integration, not UI or e2e.

### Input validation and server-side rejection boundaries

- Import validation is centralized in `src/lib/imports/validation.ts`, including supported banks, CSV upload shape, import commit payload shape, and the bulk category payload contract ([`src/lib/imports/validation.ts:47-186`](https://github.com/justyna-pietryga/10x-expenses/blob/a13f822987bb880ddd705cb104f211e5cb22b63b/src/lib/imports/validation.ts#L47-L186)).
- Import HTTP helpers enforce `application/json` for JSON routes and separate multipart parsing for previews ([`src/lib/imports/http.ts:28-45`](https://github.com/justyna-pietryga/10x-expenses/blob/a13f822987bb880ddd705cb104f211e5cb22b63b/src/lib/imports/http.ts#L28-L45)).
- Summary HTTP helpers likewise validate auth and selected month parsing ([`src/lib/summary/http.ts:13-50`](https://github.com/justyna-pietryga/10x-expenses/blob/a13f822987bb880ddd705cb104f211e5cb22b63b/src/lib/summary/http.ts#L13-L50)).
- Existing coverage already protects parser boundaries, empty bulk updates, and the ban on `save_rule` in bulk payloads ([`tests/import-review.test.ts:428-520`](https://github.com/justyna-pietryga/10x-expenses/blob/a13f822987bb880ddd705cb104f211e5cb22b63b/tests/import-review.test.ts#L428-L520)).
- The bulk category route and helper already cover mixed success, clearing categories, and ownership filtering, which is useful context but belongs more to rollout Phase 2 than Phase 1 ([`src/pages/api/imports/transactions/bulk.ts:6-21`](https://github.com/justyna-pietryga/10x-expenses/blob/a13f822987bb880ddd705cb104f211e5cb22b63b/src/pages/api/imports/transactions/bulk.ts#L6-L21), [`tests/import-review.test.ts:694-823`](https://github.com/justyna-pietryga/10x-expenses/blob/a13f822987bb880ddd705cb104f211e5cb22b63b/tests/import-review.test.ts#L694-L823), [`tests/import-review.test.ts:1007-1114`](https://github.com/justyna-pietryga/10x-expenses/blob/a13f822987bb880ddd705cb104f211e5cb22b63b/tests/import-review.test.ts#L1007-L1114)).

Planning implication:
- For Risk #6, favor route-contract tests that hit the true request boundary:
  - commit route with wrong content type
  - commit route with malformed or missing required fields
  - summary route with invalid `month`
  - preview route with invalid file type or empty upload
- Avoid thin unit tests that only repeat field validation logic already directly covered.

### Current test harness and cheapest useful layer

- The dominant pattern in this repo is a single Vitest file per slice with:
  - hand-built Supabase stubs
  - direct helper calls for domain logic
  - direct Astro route invocation for API contracts
  - static React markup assertions for visible trust-copy/UI rules
  ([`tests/import-review.test.ts:88-365`](https://github.com/justyna-pietryga/10x-expenses/blob/a13f822987bb880ddd705cb104f211e5cb22b63b/tests/import-review.test.ts#L88-L365), [`tests/monthly-summary-and-rules.test.ts:15-340`](https://github.com/justyna-pietryga/10x-expenses/blob/a13f822987bb880ddd705cb104f211e5cb22b63b/tests/monthly-summary-and-rules.test.ts#L15-L340)).
- The test plan's "likely cheapest layer = integration" is correct for this codebase. The APIs are intentionally thin wrappers over helper functions, and the highest-signal failures live in helper sequencing and request/response truthfulness, not in browser rendering.
- The archive history reinforces that pattern: S-02 explicitly chose focused Vitest coverage over browser automation for parser/replacement/review contracts, and S-03 did the same for summary trust math and route contracts ([`context/archive/2026-05-29-first-bank-import-review/plan.md:308-375`](https://github.com/justyna-pietryga/10x-expenses/blob/a13f822987bb880ddd705cb104f211e5cb22b63b/context/archive/2026-05-29-first-bank-import-review/plan.md#L308-L375), [`context/archive/2026-05-30-monthly-summary-and-rules/plan.md:467-553`](https://github.com/justyna-pietryga/10x-expenses/blob/a13f822987bb880ddd705cb104f211e5cb22b63b/context/archive/2026-05-30-monthly-summary-and-rules/plan.md#L467-L553)).
- The later UX-01 change confirms the same harness scales to import-review persistence and completion-guard behavior without adding e2e ([`context/archive/2026-06-01-import-review-bulk-categorization/plan.md:250-302`](https://github.com/justyna-pietryga/10x-expenses/blob/a13f822987bb880ddd705cb104f211e5cb22b63b/context/archive/2026-06-01-import-review-bulk-categorization/plan.md#L250-L302)).

Planning implication:
- Keep this rollout in root `tests/` beside existing finance-domain suites.
- Prefer extending the two existing files over introducing new tooling.
- Reserve `/10x-e2e` for later only if a risk genuinely depends on full browser navigation, which Phase 1 does not.

## Code References

- [`src/lib/imports/data.ts#L99-L185`](https://github.com/justyna-pietryga/10x-expenses/blob/a13f822987bb880ddd705cb104f211e5cb22b63b/src/lib/imports/data.ts#L99-L185) - Import commit and replace flow, including the non-atomic delete/update/insert sequence.
- [`src/lib/imports/data.ts#L294-L354`](https://github.com/justyna-pietryga/10x-expenses/blob/a13f822987bb880ddd705cb104f211e5cb22b63b/src/lib/imports/data.ts#L294-L354) - Bulk category updates and batch review completion helpers.
- [`src/lib/imports/validation.ts#L82-L186`](https://github.com/justyna-pietryga/10x-expenses/blob/a13f822987bb880ddd705cb104f211e5cb22b63b/src/lib/imports/validation.ts#L82-L186) - Import commit and bulk payload validation boundaries.
- [`src/lib/imports/http.ts#L28-L74`](https://github.com/justyna-pietryga/10x-expenses/blob/a13f822987bb880ddd705cb104f211e5cb22b63b/src/lib/imports/http.ts#L28-L74) - JSON/multipart request parsing and import error response contract.
- [`src/pages/api/imports/commit.ts#L6-L22`](https://github.com/justyna-pietryga/10x-expenses/blob/a13f822987bb880ddd705cb104f211e5cb22b63b/src/pages/api/imports/commit.ts#L6-L22) - Commit route passes validated payload directly to `commitImportBatch`.
- [`src/pages/api/imports/preview.ts#L17-L40`](https://github.com/justyna-pietryga/10x-expenses/blob/a13f822987bb880ddd705cb104f211e5cb22b63b/src/pages/api/imports/preview.ts#L17-L40) - Preview route parses upload and reports existing batch before writes.
- [`src/pages/api/imports/batches/[id]/complete.ts#L6-L15`](https://github.com/justyna-pietryga/10x-expenses/blob/a13f822987bb880ddd705cb104f211e5cb22b63b/src/pages/api/imports/batches/%5Bid%5D/complete.ts#L6-L15) - Review-complete route flips the batch marker that summary logic trusts.
- [`src/lib/summary/data.ts#L121-L183`](https://github.com/justyna-pietryga/10x-expenses/blob/a13f822987bb880ddd705cb104f211e5cb22b63b/src/lib/summary/data.ts#L121-L183) - Available-month discovery and default selected-month resolution.
- [`src/lib/summary/data.ts#L185-L385`](https://github.com/justyna-pietryga/10x-expenses/blob/a13f822987bb880ddd705cb104f211e5cb22b63b/src/lib/summary/data.ts#L185-L385) - Summary computation, incomplete-review split, carry-over inputs, warning batches, and snapshot upsert.
- [`src/lib/summary/http.ts#L13-L89`](https://github.com/justyna-pietryga/10x-expenses/blob/a13f822987bb880ddd705cb104f211e5cb22b63b/src/lib/summary/http.ts#L13-L89) - Summary auth, month parsing, and error response contract.
- [`tests/import-review.test.ts#L562-L823`](https://github.com/justyna-pietryga/10x-expenses/blob/a13f822987bb880ddd705cb104f211e5cb22b63b/tests/import-review.test.ts#L562-L823) - Existing helper coverage for replace confirmation, review-pending batch creation, bulk update ownership, and review completion.
- [`tests/import-review.test.ts#L918-L1114`](https://github.com/justyna-pietryga/10x-expenses/blob/a13f822987bb880ddd705cb104f211e5cb22b63b/tests/import-review.test.ts#L918-L1114) - Existing route coverage for commit confirmation and bulk transaction review responses.
- [`tests/monthly-summary-and-rules.test.ts#L342-L436`](https://github.com/justyna-pietryga/10x-expenses/blob/a13f822987bb880ddd705cb104f211e5cb22b63b/tests/monthly-summary-and-rules.test.ts#L342-L436) - Existing summary helper and summary route coverage for reviewed, uncategorized, incomplete, and warning-batch behavior.

## Architecture Insights

- Import and summary domains already separate validation, HTTP concerns, and data logic cleanly. Tests should preserve that seam instead of collapsing everything into UI assertions.
- The product trust boundary depends on one shared persisted flag: `statement_import_batches.review_completed_at`. Import review completion sets it; summary logic excludes pending batches from trusted category totals and includes them only in incomplete-review reporting.
- The repo's stable testing pattern is "integration with mocked Supabase query chains," not isolated pure-function testing alone and not browser automation. That pattern is already proven across three archived finance slices.
- Snapshot storage in `monthly_summaries` is a cache side effect of `loadDashboardSummary`, not the source of truth. Any Phase 1 plan that asserts only the stored snapshot without grounding the live computation would be weaker than the current architecture.

## Historical Context (from prior changes)

- S-02 intentionally defined bank-month replacement and review-pending semantics as core product contracts, with focused Vitest coverage rather than e2e ([`context/archive/2026-05-29-first-bank-import-review/plan.md:42-60`](https://github.com/justyna-pietryga/10x-expenses/blob/a13f822987bb880ddd705cb104f211e5cb22b63b/context/archive/2026-05-29-first-bank-import-review/plan.md#L42-L60), [`context/archive/2026-05-29-first-bank-import-review/plan.md:314-374`](https://github.com/justyna-pietryga/10x-expenses/blob/a13f822987bb880ddd705cb104f211e5cb22b63b/context/archive/2026-05-29-first-bank-import-review/plan.md#L314-L374)).
- S-03 explicitly built the summary trust model around three buckets: reviewed categorized, reviewed uncategorized, and incomplete review spend. The current implementation matches that archived plan closely ([`context/archive/2026-05-30-monthly-summary-and-rules/plan.md:68-96`](https://github.com/justyna-pietryga/10x-expenses/blob/a13f822987bb880ddd705cb104f211e5cb22b63b/context/archive/2026-05-30-monthly-summary-and-rules/plan.md#L68-L96), [`context/archive/2026-05-30-monthly-summary-and-rules/plan.md:467-553`](https://github.com/justyna-pietryga/10x-expenses/blob/a13f822987bb880ddd705cb104f211e5cb22b63b/context/archive/2026-05-30-monthly-summary-and-rules/plan.md#L467-L553)).
- UX-01 later hardened the review workflow so unsaved category drafts block review completion. That means summary trust now depends not just on `review_completed_at`, but on the workspace never letting the user complete review with local dirty changes still pending ([`context/archive/2026-06-01-import-review-bulk-categorization/plan.md:181-236`](https://github.com/justyna-pietryga/10x-expenses/blob/a13f822987bb880ddd705cb104f211e5cb22b63b/context/archive/2026-06-01-import-review-bulk-categorization/plan.md#L181-L236)).

## Related Research

- No prior `research.md` artifacts were needed for this question.
- The most relevant historical planning artifacts were:
  - [`context/archive/2026-05-29-first-bank-import-review/plan.md`](https://github.com/justyna-pietryga/10x-expenses/blob/a13f822987bb880ddd705cb104f211e5cb22b63b/context/archive/2026-05-29-first-bank-import-review/plan.md)
  - [`context/archive/2026-05-30-monthly-summary-and-rules/plan.md`](https://github.com/justyna-pietryga/10x-expenses/blob/a13f822987bb880ddd705cb104f211e5cb22b63b/context/archive/2026-05-30-monthly-summary-and-rules/plan.md)
  - [`context/archive/2026-06-01-import-review-bulk-categorization/plan.md`](https://github.com/justyna-pietryga/10x-expenses/blob/a13f822987bb880ddd705cb104f211e5cb22b63b/context/archive/2026-06-01-import-review-bulk-categorization/plan.md)

## Open Questions

- Should Phase 1 planning treat the non-atomic replace path as a bug to expose with a failing test first, or as an accepted current limitation that only needs documentation? The current code does not guarantee rollback if insert fails after delete/update.
- Do we want explicit route-contract coverage for invalid content types and malformed JSON now, or should Phase 1 stay strictly on the finance-domain risks and leave generic HTTP contract tests for the quality-gates phase?
- For summary default-month behavior, is the desired oracle "latest imported month even if review is incomplete," or should completed-review months take precedence when both exist? Current code treats pending and completed months equally for default selection.
