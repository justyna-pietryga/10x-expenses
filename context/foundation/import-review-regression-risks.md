# Import Review Regression Risks

> Working notes captured from manual verification of the `import-history-and-parallel-review` slice.
> Purpose: preserve concrete regressions and convert them into durable test candidates before updating `context/foundation/test-plan.md`.
>
> Created: 2026-06-14

## Why this exists

Recent manual verification exposed review-flow regressions that were not fully protected by the current automated suite. The main pattern was the same across multiple failures: the UI looked like it accepted a review action, but the visible table state drifted away from the persisted state or got stuck between two states.

These notes are intentionally narrower than the main test plan. They describe concrete failures, likely regression classes, and the cheapest test layers that should cover them next.

## Regression Inventory

### 1. Batch switch can get stuck on `Loading...`

- Observed symptom:
  Clicking another batch in import history showed `Loading...`, but the selected batch never opened.
- User impact:
  The history-first review workflow becomes unreliable, and users cannot safely reopen older imports.
- Regression class:
  Client-side state transition race between selected batch state, fetched batch detail state, and child review-table reset behavior.
- Why it matters:
  This breaks the core promise of `UX-06`: parallel review across multiple bank-month batches.
- Cheapest useful test:
  React/component integration around `ImportWorkspace` state transitions.
- Candidate assertions:
  Loading a non-cached batch clears the loading indicator after fetch resolution.
  The fetched batch becomes the active review.
  Switching to a cached batch reopens it immediately without getting stuck in a pending state.
  Refreshing with `?batch=<id>` and then switching again preserves reopen behavior.

### 2. Rule creation says it applied, but the row falls back to `Uncategorized`

- Observed symptom:
  Creating a rule displayed success messaging, but the reviewed row immediately reverted to `Uncategorized` and the selected category was not actually reflected in the table.
- User impact:
  The UI claims success while showing stale review data, which makes the rule workflow untrustworthy.
- Regression class:
  Parent-child reconciliation bug where row-level local draft state outlives or overwrites the just-persisted server response.
- Why it matters:
  This is a direct example of risk `#3` and `#4` from `context/foundation/test-plan.md`: visible success without truthful persistence.
- Cheapest useful test:
  Component integration for `ImportWorkspace` plus `TransactionReviewTable`, or a narrowly scoped browser test if the component seam cannot express the timing reliably.
- Candidate assertions:
  After successful rule creation, the anchor row shows the persisted category.
  The anchor row no longer renders as `Uncategorized`.
  The returned anchor transaction replaces stale local row state.
  Success messaging and visible row state stay consistent with each other.

### 3. `Exclude from budget` can make the row disappear before save

- Observed symptom:
  Clicking `Exclude from budget` on an included row made the row disappear from the main table immediately, before the user saved changes.
- User impact:
  The user loses visual continuity and may think the row was deleted rather than drafted for exclusion.
- Regression class:
  Draft state is incorrectly used as the source of truth for section partitioning instead of only for unsaved intent.
- Why it matters:
  This makes the bulk-save model confusing and can hide pending changes in collapsed excluded sections.
- Cheapest useful test:
  Component rendering test at `TransactionReviewTable`.
- Candidate assertions:
  An included row with an unsaved exclusion draft remains visible in the included section until save.
  Bulk-save controls remain visible while that draft exists.
  The row moves to the excluded section only after persisted data changes.

### 4. Rows can disappear entirely when persisted `inclusion_status` is missing or unnormalized

- Observed symptom:
  After the first exclusion fix, no rows were displayed at all.
- User impact:
  The review table appears empty even though imported transactions exist.
- Regression class:
  Section partitioning relied on raw persisted `inclusion_status` values while other table logic treated missing values as implicitly `included`.
- Why it matters:
  This is a normalization contract bug: one part of the UI defaulted missing values, another part did not.
- Cheapest useful test:
  Component rendering test at `TransactionReviewTable`.
- Candidate assertions:
  Rows without `inclusion_status` still render in the default included table.
  The included-row count treats missing persisted state as `included`.
  Missing status does not send rows into neither-section limbo.

## Cross-cutting Pattern

The regressions above are different user-visible failures, but they share one test gap:

- local draft state,
- persisted transaction state,
- and parent-level batch switching state

were not always tested together at the seam where they reconcile.

The current automated coverage is strongest at helper and API truthfulness. The weaker area is state reconciliation inside the interactive review UI after a successful mutation or batch switch.

## Recommended additions to the test plan

When `context/foundation/test-plan.md` is refreshed, these regressions should likely become an explicit sub-section under Section `6.2 Adding an integration test for review persistence`, or a new cookbook note focused on interactive review-state reconciliation.

Suggested additions:

- Add a rule that review UI tests must prove visible table state stays aligned with the persisted mutation result after save.
- Add a rule that draft state may influence controls and messages, but must not silently replace persisted section membership until save succeeds.
- Add a rule that batch-switching coverage must include both cached and non-cached history entries.
- Add a normalization rule for `inclusion_status`: missing persisted values are treated as `included` consistently across the whole review UI.

## Candidate suite ownership

- `tests/import-review.test.ts`
  Good home for rendering and workspace-level regression coverage tied to import review UI behavior.
- `tests/review-persistence-and-rule-application.test.ts`
  Good home for persistence-truthfulness cases where the route/helper contract is correct but UI reconciliation can still drift.
- Optional future `/10x-e2e` slice
  Only if a timing-sensitive browser path remains hard to express reliably at the component seam.

## Open follow-up questions

- Should batch-switch behavior stay component-level only, or is there enough user-risk to justify one browser test for switching history entries end-to-end?
- Should the review-table state model make persisted state and draft state more explicit in naming, to reduce future partitioning mistakes?
- Should success notices be treated as assertions in tests whenever a mutation also updates visible table state?

## Proposed next step

Use this document as source material for a targeted `test-plan.md` update that adds an explicit cookbook pattern for interactive review-state reconciliation, rather than only helper and route persistence checks.
