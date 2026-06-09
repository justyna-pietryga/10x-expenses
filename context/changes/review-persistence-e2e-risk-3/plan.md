# Review Persistence E2E Risk #3 Plan

## Overview

Add a narrow Playwright E2E smoke for the browser-level slice of `context/foundation/test-plan.md` risk `#3`: the import-review UI must not imply review state is saved when category drafts are still unsaved, and it must unblock review completion after a successful bulk save.

## Desired End State

- A self-contained Playwright spec creates its own category precondition, uploads a real CSV through `/imports`, changes one row, and verifies the dirty-state and completion guard behavior.
- The spec uses the real browser, real route handlers, and real auth session from `playwright/.auth/user.json`.
- Category setup and cleanup happen through authenticated same-origin requests so the test stays isolated across re-runs.

## What We're Not Doing

- No browser coverage for mixed partial-save failures in this change.
- No production API or schema changes.
- No test-only seed route or fixture system.

## Implementation Approach

Use the existing Playwright setup in `playwright.config.ts` and add one spec under `tests/e2e/`. The spec creates a unique zero-percent category through the budget API, uploads the sample Revolut CSV through the import UI, handles either a first-save or replacement path, changes one transaction category, verifies the unsaved-state UI and disabled completion action, saves all changes, then verifies the completion action is enabled again. The created category is archived in cleanup.

## Success Criteria

### Automated Verification

- `tests/e2e/import-review-dirty-state.spec.ts` covers the dirty-state and completion-blocking flow for risk `#3`.
- `npm run test:e2e -- tests/e2e/import-review-dirty-state.spec.ts` passes.
- `npm run lint` passes.
- `npx astro check` passes.
- `npm run build` passes.

### Manual Verification

- Read the spec name and assertions and confirm they describe user-visible truthfulness rather than server internals.
- Confirm the test remains focused on the browser-level slice of risk `#3`, not the broader persistence matrix.

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append `— <commit sha>` when a step lands.

### Phase 1: Dirty-State Smoke

#### Automated

- [x] 1.1 Add a Playwright spec for import-review dirty-state and completion blocking.
- [x] 1.2 Run `npm run test:e2e -- tests/e2e/import-review-dirty-state.spec.ts`.
- [x] 1.3 Run `npm run lint`.
- [x] 1.4 Run `npx astro check`.
- [x] 1.5 Run `npm run build`.

#### Manual

- [x] 1.6 Confirm the spec asserts truthful dirty-state and completion-blocking behavior.
- [x] 1.7 Confirm the scope stays limited to the browser-level slice of risk `#3`.
