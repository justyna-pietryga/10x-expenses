# Review Persistence and Rule Application — Plan Brief

> Full plan: `context/changes/testing-review-persistence-and-rule-application/plan.md`

## What & Why

This change implements Phase 2 of the test rollout by protecting two finance risks: bulk review saves that look successful but do not persist truthfully, and rules that appear correct in the dashboard but mutate the wrong future transactions. The plan adds focused integration coverage for partial-save truthfulness, review completion boundaries, and the full dashboard-to-import rule lifecycle.

## Starting Point

The product already has the right seams, but they are fragmented. Bulk review persistence currently returns mixed `updated` and `failed` rows from the helper and route, the import UI reconciles local state from that payload, and rules are managed in the dashboard but applied later during import categorization. There is already one narrow Playwright smoke for dirty-state UX, so this phase should stay below the browser layer.

## Desired End State

When this plan is done, the repo has one dedicated Phase 2 integration suite that proves persisted state, route payloads, and local reconciliation all agree about what saved and what did not. Dashboard rule create, update, and delete flows are covered through to future import-time effects, including precise `recipient`, `title`, and `both` match-field scope.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Bulk-save contract | Preserve partial-success | The current helper and UI already implement mixed outcomes, so Phase 2 should lock truthful behavior rather than redefine it. | Plan |
| Rule scope | Full dashboard-to-import lifecycle | The core risk is downstream wrong-row mutation, which requires covering rule CRUD plus later import effects. | Plan |
| Persistence oracle | Persisted rows plus returned payload | Route-shape-only checks are too weak for a risk about saved truth. | Plan |
| Match semantics | Explicit `recipient`, `title`, and `both` assertions | `ruleMatchesTransaction` derives different candidates per field, so scope drift must be tested directly. | Research / Plan |
| Test placement | Dedicated Phase 2 root suite | You chose a clean rollout boundary over extending the existing root finance suites. | Plan |
| Production changes | Minimal fixes only if a test exposes a real gap | This keeps the rollout pragmatic and aligned with the Phase 1 precedent. | Plan |

## Scope

**In scope:**
- dedicated Phase 2 integration suite
- bulk review persistence truthfulness
- review completion boundary truthfulness
- dashboard rule CRUD plus downstream import effects
- Phase 2 cookbook backfill in `context/foundation/test-plan.md`

**Out of scope:**
- new Playwright coverage
- all-or-nothing bulk-save redesign unless a real bug is exposed
- auth or ownership checks from Phase 3
- Phase 1 import or summary integrity work

## Architecture / Approach

The plan stays on the existing cheapest useful layer: helper-level integration, direct Astro route invocation, and hand-built Supabase stubs. The new work is grouped into a dedicated root suite, `tests/review-persistence-and-rule-application.test.ts`, so Phase 2 has a stable home for future additions without diluting the Phase 1 files.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Dedicated Phase 2 Test Harness | New root integration suite and shared Phase 2 fixture builders | The suite could drift into duplicating existing Phase 1 coverage |
| 2. Review Persistence Truthfulness | Mixed-save, full-save, and full-failure persistence checks | Tests could assert payload shape without proving persisted truth |
| 3. Review Completion Boundary Truthfulness | Cheaper saved-vs-unsaved completion checks | Scope could duplicate the existing browser smoke |
| 4. Dashboard Rule Lifecycle and Downstream Mutation Scope | Rule CRUD and future-import effect coverage across all match fields | Easy to miss untouched non-matching rows |
| 5. Cookbook and Rollout Alignment | Concrete Phase 2 patterns in the rollout artifact | Cookbook can become a changelog instead of reusable guidance |

**Prerequisites:** current helper-and-route finance test patterns remain available; existing Playwright smoke continues to own the browser-level slice of risk `#3`.
**Estimated effort:** ~2-3 focused implementation sessions across 5 phases, with the most effort in the dedicated suite and downstream rule-effect coverage.

## Open Risks & Assumptions

- The current partial-success contract is assumed to be intentional and user-acceptable as long as the system is truthful about it.
- The dedicated suite approach assumes the extra file boundary is worth the added fixture setup overhead.
- Rule lifecycle tests may expose a production truthfulness gap if dashboard-managed rules do not propagate downstream as cleanly as the current contracts suggest.

## Success Criteria (Summary)

- Bulk review saves are covered with assertions on both persisted row state and returned route payload truth.
- Review completion coverage proves the system distinguishes unsaved drafts from persisted categories without requiring browser automation.
- Rule lifecycle tests prove dashboard-managed rules affect only the intended future imported transactions, and the Phase 2 cookbook tells future contributors where to add similar coverage.
