# E2E GitHub Actions Implementation Plan

## Overview

Make the existing Playwright suite reproducible on clean GitHub-hosted runners. The workflow will run E2E after the standard CI job, provision an ephemeral local Supabase stack, generate an authenticated browser state, execute the full suite serially, retain diagnostics, and block production migrations when E2E fails.

Local `npm run test:e2e` remains supported with the existing prerequisite that local Supabase is already running.

## Current State Analysis

The repository has five browser specs and a Playwright command, but the workflow does not install Chromium or execute the suite. Playwright assumes an ignored developer-created authentication file exists, while its web server command assumes local Supabase is already available.

The suite also enables full parallelism despite sharing one authenticated user. Most newer specs use unique data, but `seed.spec.ts` writes a fixed June 2026 income value and does not restore the prior value. Supabase reset is not currently deterministic because seed loading references a missing `supabase/seed.sql`.

## Desired End State

- Pull requests, pushes to `main`, and manual workflow dispatches run the standard CI job followed by E2E.
- E2E starts an isolated local Supabase stack without production credentials, initializes the schema, exports only the local API URL and anon key, installs Chromium, and creates a fresh test user and storage state.
- The full browser suite runs with one CI worker, retries and traces are useful, and reports are uploaded even when setup or tests fail.
- Supabase cleanup runs regardless of test outcome.
- The production migration job requires both standard CI and E2E success.
- Local developers can continue to run `npx supabase start` followed by `npm run test:e2e`; CI-only serialization does not unnecessarily slow local runs.

### Key Discoveries:

- `.github/workflows/ci.yml:18` runs lint, Vitest, Astro checks, and build but no Playwright command.
- `playwright.config.ts:8` enables full parallelism, while `playwright.config.ts:13` requires the ignored `playwright/.auth/user.json`.
- `playwright.config.ts:15` starts Astro through `npm run dev`, whose `package.json:6` command assumes Supabase is already running.
- `supabase/config.toml:60` enables a missing seed file, preventing a reliable reset contract.
- `src/pages/api/auth/signup.ts:13` and `src/pages/api/auth/signin.ts:13` provide the real browser authentication flow; local confirmations are disabled at `supabase/config.toml:202`.
- `tests/e2e/seed.spec.ts:21` repeats the test value during cleanup instead of restoring the previous state.
- `.github/workflows/ci.yml:27` applies production migrations after only the standard CI job.

## What We're NOT Doing

- Making E2E a required branch-protection status check.
- Running E2E against hosted or production Supabase.
- Automatically provisioning Supabase for ordinary local `npm run test:e2e` runs.
- Reworking every spec for multi-worker isolation or enabling parallel CI execution.
- Moving production deployment from Cloudflare into GitHub Actions.
- Adding visual regression tooling or vision-based assertions.

## Implementation Approach

First make the suite self-authenticating and remove its remaining fixed-state defect. Then make Playwright environment-aware: local execution keeps its current developer workflow, while CI gets one worker, retries, and strict focused-test protection.

Add an E2E job that depends on the existing CI job. It will use the repository-pinned Node and Supabase CLI versions, start and initialize local Supabase, expose only the local application credentials, install Chromium, and run Playwright. Artifacts and Supabase shutdown will use unconditional cleanup steps. Finally, make the production migration job depend on both validation jobs and align repository documentation with the resulting workflow.

## Critical Implementation Details

### Timing & lifecycle

Supabase must be healthy and its local `SUPABASE_URL` and `SUPABASE_KEY` must be exported before Playwright starts Astro. Artifact upload and `supabase stop` must use `if: always()` so setup and test failures remain diagnosable and do not leave lifecycle cleanup conditional on success.

### State sequencing

The Playwright authentication setup project must start without inherited storage state, create a unique user, explicitly sign in, wait for the protected dashboard, and only then persist `playwright/.auth/user.json`. The Chromium project depends on that setup so both browser pages and Playwright's API request fixture receive the authenticated cookies.

## Phase 1: Deterministic E2E Foundation

### Overview

Remove fixed-state behavior from the seed smoke and add a tracked authentication setup that produces the ignored session file on every run.

### Changes Required:

#### 1. Supabase reset contract

**File**: `supabase/config.toml`

**Intent**: Remove the invalid reference to a nonexistent seed file so CI database initialization has an explicit, deterministic contract.

**Contract**: Disable database seed loading unless an intentional tracked seed file is introduced. User/session creation remains owned by Playwright rather than SQL seed data.

#### 2. E2E authentication setup

**File**: `tests/e2e/auth.setup.ts`

**Intent**: Create a unique local Supabase user through the real application auth flow and persist a reusable browser session for the product specs.

**Contract**: The setup test begins with empty storage state, signs up with a run-unique email and valid password, signs in explicitly, verifies navigation to `/dashboard`, creates the ignored auth directory when needed, and writes `playwright/.auth/user.json`.

#### 3. Seed smoke isolation

**File**: `tests/e2e/seed.spec.ts`

**Intent**: Keep the full suite in CI without allowing the fixed June 2026 smoke to depend on or leave an arbitrary value.

**Contract**: The test records the initial visible income state, performs its persistence assertion, and restores the prior state in failure-safe cleanup. Its locators and waits continue to follow the repository E2E rules.

### Success Criteria:

#### Automated Verification:

- Supabase reset completes without a missing seed-file error: `npx supabase db reset`
- Authentication setup creates `playwright/.auth/user.json` against local Supabase.
- Seed smoke passes independently and restores its initial state: `npm run test:e2e -- tests/e2e/seed.spec.ts`
- Linting passes: `npm run lint`
- Astro checks pass: `npm run check`

#### Manual Verification:

- Confirm the generated storage state remains ignored and contains no committed credential.
- Confirm a normal local run still works with `npx supabase start` followed by `npm run test:e2e`.

**Implementation Note**: After completing this phase and all automated verification passes, pause for manual confirmation before proceeding.

---

## Phase 2: CI-Safe Playwright Configuration

### Overview

Wire authentication as a project dependency and apply reliability restrictions only where CI needs them.

### Changes Required:

#### 1. Playwright project graph and CI policy

**File**: `playwright.config.ts`

**Intent**: Make authentication reproducible while retaining a convenient local developer loop and enforcing safer CI behavior.

**Contract**: Add an authentication setup project and make Chromium depend on it. Apply `forbidOnly`, a small retry count, and one worker when `CI` is set. Keep local server reuse and local parallel execution unless test isolation evidence requires a broader restriction. Preserve HTML reporting and first-retry tracing.

#### 2. Script contract review

**File**: `package.json`

**Intent**: Keep the existing local `test:e2e` entry point stable and change scripts only if a separate app-only server command is necessary to avoid duplicated database initialization in CI.

**Contract**: `npm run test:e2e` remains the canonical suite command. Any added script must separate application startup from CI infrastructure provisioning without making local E2E self-provisioning an implicit behavior.

### Success Criteria:

#### Automated Verification:

- Playwright lists the setup project before the Chromium product project: `npx playwright test --list`
- Full local suite passes against running local Supabase: `npm run test:e2e`
- CI-mode configuration uses one worker, retries, and focused-test protection.
- Linting passes: `npm run lint`
- Astro checks pass: `npm run check`

#### Manual Verification:

- Confirm local Playwright execution is not forced to one worker solely because CI is serialized.
- Confirm product specs and the authenticated API request fixture use the generated session.

**Implementation Note**: After completing this phase and all automated verification passes, pause for manual confirmation before proceeding.

---

## Phase 3: GitHub Actions E2E Integration

### Overview

Add the complete hosted-runner lifecycle and make successful E2E a prerequisite for production migrations.

### Changes Required:

#### 1. Workflow triggers and permissions

**File**: `.github/workflows/ci.yml`

**Intent**: Support remote manual reproduction and declare the workflow's minimal repository access.

**Contract**: Add `workflow_dispatch` alongside current push and pull-request triggers and declare `contents: read`.

#### 2. E2E job

**File**: `.github/workflows/ci.yml`

**Intent**: Execute the real browser, Astro, authentication, RLS, and database-write boundary on an isolated runner after standard CI succeeds.

**Contract**: Add an `e2e` job with `needs: ci`; use `.nvmrc`, `npm ci`, the npm-pinned Supabase CLI, local Supabase startup and deterministic initialization, selective export of the local API URL and anon key through `$GITHUB_ENV`, Chromium installation with Linux dependencies, and `npm run test:e2e`. Do not expose production migration secrets to this job.

#### 3. Diagnostics and cleanup

**File**: `.github/workflows/ci.yml`

**Intent**: Preserve actionable evidence from remote failures and guarantee local service cleanup.

**Contract**: Upload `playwright-report/` and `test-results/` with `if: always()`, `if-no-files-found: ignore`, and seven-day retention. Run `supabase stop` with `if: always()`.

#### 4. Production migration gate

**File**: `.github/workflows/ci.yml`

**Intent**: Prevent production schema changes when browser-level validation fails.

**Contract**: Keep migration restricted to pushes to `main`, but change its dependency to both `ci` and `e2e`. Preserve the existing production Supabase authentication and migration steps.

### Success Criteria:

#### Automated Verification:

- Workflow syntax parses and all referenced scripts and paths exist.
- Pull requests and pushes run `ci`, then `e2e`; `migrate` remains push-to-`main` only.
- Manual dispatch can execute the validation workflow.
- E2E provisions local Supabase without production credentials and completes the full suite.
- Playwright reports and test results upload even when tests fail.
- Supabase cleanup runs after success and failure.
- Production migration does not start unless both `ci` and `e2e` succeed.

#### Manual Verification:

- Trigger a manual workflow run and confirm the CI-to-E2E ordering in GitHub Actions.
- Inspect an uploaded Playwright artifact and confirm it contains useful report or trace data.
- Confirm branch protection remains unchanged and E2E is informational at merge time unless repository settings are changed later.

**Implementation Note**: After completing this phase and all automated verification passes, pause for manual confirmation before proceeding.

---

## Phase 4: Documentation and Final Verification

### Overview

Make the documented local and remote workflows match the implemented contracts, then run the complete repository validation.

### Changes Required:

#### 1. Developer workflow documentation

**File**: `README.md`

**Intent**: Document the actual `main` branch CI gates, E2E prerequisites, generated authentication, artifacts, and migration dependency.

**Contract**: Retain the local sequence `npx supabase start` then `npm run test:e2e`; explain that CI provisions its own local Supabase and that local E2E does not automatically start or stop it.

#### 2. Agent-facing repository context

**File**: `CLAUDE.md`

**Intent**: Remove stale statements that CI targets `master` and runs only lint/build.

**Contract**: Describe the current CI, E2E, and production migration job relationships without duplicating low-level workflow YAML.

### Success Criteria:

#### Automated Verification:

- Linting passes: `npm run lint`
- Tests pass: `npm test`
- Astro checks pass: `npm run check`
- Production build passes: `npm run build`
- Full E2E suite passes against local Supabase: `npm run test:e2e`

#### Manual Verification:

- Follow the README local E2E instructions from a clean ignored auth-state directory.
- Review the GitHub Actions job graph and confirm it matches the documented CI → E2E → migration policy.

**Implementation Note**: After completing this phase and all automated verification passes, pause for final manual confirmation.

---

## Testing Strategy

### Unit Tests:

- No new unit-test surface is expected; existing Vitest coverage remains part of standard CI.
- If helper logic is extracted for seed-state parsing or environment handling, cover deterministic input/output behavior with focused unit tests.

### Integration Tests:

- Run the authentication setup independently against local Supabase.
- Run `seed.spec.ts` independently twice to prove it restores initial state and is rerunnable.
- Run the complete suite in CI mode with one worker.
- Validate workflow failure paths by confirming artifacts and cleanup execute when a test intentionally fails on a temporary branch or manual run.

### Manual Testing Steps:

1. Remove the ignored `playwright/.auth/` directory, ensure local Supabase is running, and run `npm run test:e2e`.
2. Confirm Playwright creates a new user/session and all product specs execute without manual sign-in preparation.
3. Trigger the workflow manually in GitHub Actions and inspect job ordering, environment provisioning, and artifacts.
4. Confirm the migration job is skipped or blocked when E2E fails and runs only after both validation jobs pass on a `main` push.

## Performance Considerations

The E2E job intentionally runs after standard CI to avoid Docker and browser setup on commits that fail cheaper checks. CI uses one worker because the current suite shares a user and has incomplete record-level cleanup; this trades runtime for determinism. Local execution may retain parallelism. Supabase and Chromium caching should not be introduced until measured workflow duration justifies the added cache invalidation complexity.

## Migration Notes

No application data migration is required. The production `migrate` job changes only its dependency graph. Local Supabase seed configuration changes affect reset behavior, so README guidance must state that test users are generated by Playwright rather than seeded.

## References

- Related research: `context/changes/e2e-github-actions/research.md`
- E2E rollout strategy: `context/foundation/test-plan.md`
- Prior focused E2E plan: `context/changes/review-persistence-e2e-risk-3/plan.md`
- Prior schema CI research: `context/changes/supabase-schema-cicd/research.md`
- Workflow: `.github/workflows/ci.yml`
- Playwright configuration: `playwright.config.ts`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Deterministic E2E Foundation

#### Automated

- [x] 1.1 Supabase reset completes without a missing seed-file error. — bd2d4c2
- [x] 1.2 Authentication setup creates the ignored Playwright storage state. — bd2d4c2
- [x] 1.3 Seed smoke passes independently and restores its initial state. — bd2d4c2
- [x] 1.4 Linting passes. — bd2d4c2
- [x] 1.5 Astro checks pass. — bd2d4c2

#### Manual

- [x] 1.6 Confirm generated storage state remains ignored. — bd2d4c2
- [x] 1.7 Confirm the existing local E2E workflow still works. — bd2d4c2

### Phase 2: CI-Safe Playwright Configuration

#### Automated

- [x] 2.1 Playwright lists authentication setup before Chromium product tests. â€” 040448a
- [x] 2.2 The full local E2E suite passes. â€” 040448a
- [x] 2.3 CI mode enforces one worker, retries, and focused-test protection. â€” 040448a
- [x] 2.4 Linting passes. â€” 040448a
- [x] 2.5 Astro checks pass. â€” 040448a

#### Manual

- [x] 2.6 Confirm local execution is not unnecessarily serialized. â€” 040448a
- [x] 2.7 Confirm browser and API fixtures share the generated session. â€” 040448a

### Phase 3: GitHub Actions E2E Integration

#### Automated

- [x] 3.1 Workflow syntax and referenced scripts are valid.
- [x] 3.2 CI and E2E ordering matches the approved policy.
- [x] 3.3 Manual workflow dispatch is available.
- [x] 3.4 E2E provisions local Supabase and passes without production credentials.
- [x] 3.5 Playwright diagnostics upload on success and failure.
- [x] 3.6 Supabase cleanup runs on success and failure.
- [x] 3.7 Production migration requires both CI and E2E success.

#### Manual

- [ ] 3.8 Confirm CI-to-E2E ordering in a manual GitHub Actions run.
- [ ] 3.9 Inspect an uploaded Playwright artifact.
- [ ] 3.10 Confirm branch protection remains unchanged.

### Phase 4: Documentation and Final Verification

#### Automated

- [ ] 4.1 Linting passes.
- [ ] 4.2 Unit and integration tests pass.
- [ ] 4.3 Astro checks pass.
- [ ] 4.4 Production build passes.
- [ ] 4.5 Full E2E suite passes against local Supabase.

#### Manual

- [ ] 4.6 Follow the documented local E2E workflow from a clean auth-state directory.
- [ ] 4.7 Confirm the documented GitHub Actions job graph matches implementation.
