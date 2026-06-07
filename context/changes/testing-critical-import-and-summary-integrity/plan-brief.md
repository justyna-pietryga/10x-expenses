# Testing Critical Import and Summary Integrity — Plan Brief

> Full plan: `context/changes/testing-critical-import-and-summary-integrity/plan.md`
> Research: `context/changes/testing-critical-import-and-summary-integrity/research.md`

## What & Why

This change hardens Phase 1 of the test rollout for the finance domain. The goal is to add the smallest high-signal coverage that protects import replacement integrity, summary trust-edge behavior, and user-facing invalid request boundaries, while fixing the one uncovered production flaw that the research exposed: same-month replacement is not currently safe under failure.

## Starting Point

The repo already has two strong finance-domain Vitest suites: `tests/import-review.test.ts` for import/review flows and `tests/monthly-summary-and-rules.test.ts` for summary/rule flows. They already use the right seam for this product: direct helper coverage, Astro API route invocation, and hand-built Supabase stubs rather than browser automation.

## Desired End State

When this plan is done, the suite should catch the real Phase 1 regressions:

- same bank/month replacement cannot silently leave corrupted month state
- the dashboard's default-month and pending-review trust edges are explicitly protected
- malformed import and summary requests fail truthfully at the route boundary

The end state is not just more tests. It is a reusable cookbook pattern for future integrity tests in this repo.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Test seam | Extend existing Vitest finance suites | The current helper-and-route harness already matches the product's highest-signal failure boundaries. | Research |
| Replace integrity | Expose and fix the failure path in the same change | Research found a real non-atomic replacement flaw, so documentation-only coverage would leave the top risk live. | Research / Plan |
| Default month oracle | Keep current behavior | The dashboard should continue defaulting to the latest imported month, even if it is still pending review. | Plan |
| Invalid-input scope | User-facing route boundaries only | This gives high signal without bloating the rollout into a generic error-matrix sweep. | Plan |
| Summary expansion | Three research-backed edge cases only | The reviewed-vs-incomplete happy path is already covered; the gap is at selection and refresh edges. | Research / Plan |

## Scope

**In scope:**
- same-month import replacement integrity coverage
- minimal import helper fix needed to make replacement safe under failure
- summary default-month, pending-only month, and snapshot-refresh coverage
- route-boundary invalid request coverage for import and summary endpoints
- cookbook backfill for Phase 1 in `context/foundation/test-plan.md`

**Out of scope:**
- browser/e2e testing
- review persistence and rule-application risks from rollout Phase 2
- auth/ownership risks from rollout Phase 3
- broad negative-case expansion across every route
- testing external services like Supabase itself

## Architecture / Approach

The approach stays inside the established finance-domain testing architecture: root `tests/` suites, helper-level integration for multi-step business behavior, Astro route invocation for request-boundary contracts, and Supabase query-chain stubs for state shaping. The only planned production change is inside `src/lib/imports/data.ts`, where replacement sequencing must be made safe enough for the new integrity test to pass honestly.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Import Replacement Integrity | Coverage and fix for same-month replacement corruption under failure | Tests could expose a real defect that requires careful helper sequencing changes |
| 2. Summary Trust Edge Coverage | Coverage for default month, pending-only month, and snapshot refresh | Easy to drift into re-testing already-covered summary math |
| 3. Request-Boundary Rejection Coverage | Focused malformed-request route tests for imports and summary | Scope can bloat into generic validation noise if not kept tight |
| 4. Cookbook and Rollout Alignment | Concrete Phase 1 testing guidance in the rollout artifact | Cookbook can become low-signal changelog instead of reusable pattern guidance |

**Prerequisites:** existing `research.md` is complete; current finance-domain suites remain the source of truth for harness patterns.
**Estimated effort:** ~2-3 focused implementation sessions across 4 phases, with most effort in Phase 1.

## Open Risks & Assumptions

- The replace-integrity coverage may force a production helper change larger than initially expected if the current persistence shape cannot support safe replacement ordering cleanly.
- The plan assumes preserving current dashboard default-month behavior is intentional, not accidental.
- The route-boundary additions assume existing error-shape contracts should remain stable rather than being redesigned in this rollout.

## Success Criteria (Summary)

- Same-month replacement failures are protected by automated coverage and no longer risk destructive partial month state.
- Summary edge behavior is protected without duplicating already-covered happy-path trust math.
- A new contributor can read the updated cookbook and know exactly which suite and seam to use for future import or summary integrity tests.
