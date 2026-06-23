---
date: 2026-06-23T22:21:20+02:00
researcher: Codex
git_commit: c3c1dd6ab98c87c100537967f80d6900d04f31d7
branch: main
repository: 10x-expenses
topic: "Why the local E2E setup cannot run reliably in GitHub Actions and what must change"
tags: [research, codebase, e2e, playwright, github-actions, supabase]
status: complete
last_updated: 2026-06-23
last_updated_by: Codex
---

# Research: E2E execution in GitHub Actions

**Date**: 2026-06-23T22:21:20+02:00
**Researcher**: Codex
**Git Commit**: c3c1dd6ab98c87c100537967f80d6900d04f31d7
**Branch**: main
**Repository**: 10x-expenses

## Research Question

There is a current E2E setup for local running. What makes it impossible to run
properly in a GitHub Actions pipeline, and what should be changed?

## Summary

The existing Playwright suite is a developer-machine setup, not a reproducible
CI setup. The GitHub Actions workflow does not invoke Playwright, install a
browser, start Supabase, or provide the application with local Supabase
configuration. Even if an E2E command were added, all tests depend on an ignored
`playwright/.auth/user.json` file that exists only on a configured developer
machine.

The recommended design is a separate E2E job that provisions an ephemeral local
Supabase stack, resets the schema, exports its URL and anon key, installs
Chromium, creates a unique test user in a tracked Playwright setup project, and
runs the suite against the Astro dev server. The first CI version should use one
worker because the suite shares one user and some tests use fixed statement
months. Reports and traces should be uploaded on failure.

A dedicated hosted Supabase test project is possible but is inferior for pull
requests: it requires secrets, cannot run normally for forked PRs, and introduces
shared-state cleanup and concurrency problems. Running the suite against
production is unsafe because tests replace and persist real finance data.

## Detailed Findings

### 1. GitHub Actions does not execute the E2E suite

The current workflow installs dependencies and runs sync, lint, Vitest, Astro
checks, and the production build. It never invokes the existing `test:e2e`
script:

- [`.github/workflows/ci.yml:18`](https://github.com/justyna-pietryga/10x-expenses/blob/c3c1dd6ab98c87c100537967f80d6900d04f31d7/.github/workflows/ci.yml#L18)
- [`package.json:13`](https://github.com/justyna-pietryga/10x-expenses/blob/c3c1dd6ab98c87c100537967f80d6900d04f31d7/package.json#L13)

The workflow also has no Playwright browser installation. Installing
`@playwright/test` through `npm ci` does not install the Chromium binary and
Linux system dependencies required by the configured browser project:

- [`playwright.config.ts:21`](https://github.com/justyna-pietryga/10x-expenses/blob/c3c1dd6ab98c87c100537967f80d6900d04f31d7/playwright.config.ts#L21)
- [`package.json:15`](https://github.com/justyna-pietryga/10x-expenses/blob/c3c1dd6ab98c87c100537967f80d6900d04f31d7/package.json#L15)

This is the first hard blocker, but adding only `npm run test:e2e` would still
fail on a clean runner because the application dependencies described below are
not provisioned.

### 2. The web server assumes Supabase is already running

Playwright starts the application by running `npm run dev`:

- [`playwright.config.ts:15`](https://github.com/justyna-pietryga/10x-expenses/blob/c3c1dd6ab98c87c100537967f80d6900d04f31d7/playwright.config.ts#L15)

That script executes `supabase db push --local` before `astro dev`, but it does
not execute `supabase start`:

- [`package.json:6`](https://github.com/justyna-pietryga/10x-expenses/blob/c3c1dd6ab98c87c100537967f80d6900d04f31d7/package.json#L6)

This works locally only when Docker and the local Supabase stack have already
been started. A fresh GitHub-hosted runner has no Supabase API or database
listening on the configured local ports:

- [`supabase/config.toml:7`](https://github.com/justyna-pietryga/10x-expenses/blob/c3c1dd6ab98c87c100537967f80d6900d04f31d7/supabase/config.toml#L7)
- [`supabase/config.toml:27`](https://github.com/justyna-pietryga/10x-expenses/blob/c3c1dd6ab98c87c100537967f80d6900d04f31d7/supabase/config.toml#L27)

CI must explicitly start Supabase before Playwright starts the web server. A
deterministic run should then reset the database rather than rely on incremental
state left by an earlier process.

### 3. Authentication state is local, ignored, and not reproducible

Every Playwright test project loads the same saved browser state:

- [`playwright.config.ts:13`](https://github.com/justyna-pietryga/10x-expenses/blob/c3c1dd6ab98c87c100537967f80d6900d04f31d7/playwright.config.ts#L13)

The `playwright/` directory is ignored, so the state file is unavailable after
checkout:

- [`.gitignore:13`](https://github.com/justyna-pietryga/10x-expenses/blob/c3c1dd6ab98c87c100537967f80d6900d04f31d7/.gitignore#L13)

There is no global setup or setup project that creates a user, signs in, and
writes a new state file. The application validates the session through
Supabase and redirects unauthenticated users away from protected routes:

- [`src/lib/supabase.ts:3`](https://github.com/justyna-pietryga/10x-expenses/blob/c3c1dd6ab98c87c100537967f80d6900d04f31d7/src/lib/supabase.ts#L3)
- [`src/middleware.ts:7`](https://github.com/justyna-pietryga/10x-expenses/blob/c3c1dd6ab98c87c100537967f80d6900d04f31d7/src/middleware.ts#L7)
- [`src/middleware.ts:18`](https://github.com/justyna-pietryga/10x-expenses/blob/c3c1dd6ab98c87c100537967f80d6900d04f31d7/src/middleware.ts#L18)

The local Supabase configuration permits signup and disables email
confirmation, so CI can create a user without privileged production
credentials:

- [`supabase/config.toml:168`](https://github.com/justyna-pietryga/10x-expenses/blob/c3c1dd6ab98c87c100537967f80d6900d04f31d7/supabase/config.toml#L168)
- [`supabase/config.toml:202`](https://github.com/justyna-pietryga/10x-expenses/blob/c3c1dd6ab98c87c100537967f80d6900d04f31d7/supabase/config.toml#L202)

The saved state must remain ignored because it contains an active user
credential. The fix is to generate it during each CI run, not commit it or store
it as a long-lived repository secret.

### 4. The E2E server does not receive CI-compatible Supabase configuration

The server client depends on `SUPABASE_URL` and `SUPABASE_KEY`:

- [`src/lib/supabase.ts:3`](https://github.com/justyna-pietryga/10x-expenses/blob/c3c1dd6ab98c87c100537967f80d6900d04f31d7/src/lib/supabase.ts#L3)

The current workflow supplies hosted Supabase values only to the build step:

- [`.github/workflows/ci.yml:23`](https://github.com/justyna-pietryga/10x-expenses/blob/c3c1dd6ab98c87c100537967f80d6900d04f31d7/.github/workflows/ci.yml#L23)

An E2E job using local Supabase must obtain the local API URL and anon key after
startup and expose them to the Astro process. These local values are ephemeral
service configuration, not privileged deployment secrets.

`SUPABASE_ACCESS_TOKEN` and `SUPABASE_DB_PASSWORD` are different: they are
privileged credentials used by the production migration job and should not be
required by PR E2E runs:

- [`.github/workflows/ci.yml:36`](https://github.com/justyna-pietryga/10x-expenses/blob/c3c1dd6ab98c87c100537967f80d6900d04f31d7/.github/workflows/ci.yml#L36)

### 5. Database initialization is not fully deterministic

Supabase seed loading is enabled and references `./seed.sql`, but
`supabase/seed.sql` does not exist:

- [`supabase/config.toml:60`](https://github.com/justyna-pietryga/10x-expenses/blob/c3c1dd6ab98c87c100537967f80d6900d04f31d7/supabase/config.toml#L60)

This should be resolved before making `supabase db reset` the CI initialization
contract. Either add a valid, minimal seed file or disable the configured seed.
The E2E user is better created by the Playwright authentication setup because
that setup must also establish browser cookies.

Application rows are owned through `auth.users` and protected by RLS, so tests
cannot bypass the missing user/session by inserting anonymous data:

- [`supabase/migrations/20260526103000_finance_domain_foundation.sql:3`](https://github.com/justyna-pietryga/10x-expenses/blob/c3c1dd6ab98c87c100537967f80d6900d04f31d7/supabase/migrations/20260526103000_finance_domain_foundation.sql#L3)
- [`supabase/migrations/20260526103000_finance_domain_foundation.sql:107`](https://github.com/justyna-pietryga/10x-expenses/blob/c3c1dd6ab98c87c100537967f80d6900d04f31d7/supabase/migrations/20260526103000_finance_domain_foundation.sql#L107)

### 6. Parallel execution is unsafe with the current data model and fixtures

Playwright currently enables full parallelism while every test shares the same
authenticated user:

- [`playwright.config.ts:8`](https://github.com/justyna-pietryga/10x-expenses/blob/c3c1dd6ab98c87c100537967f80d6900d04f31d7/playwright.config.ts#L8)

Several tests create unique category names, which reduces collisions, but other
state remains shared:

- Import batches are unique by user, bank, and statement month:
  [`supabase/migrations/20260529185000_first_bank_import_review_batch_contract.sql:15`](https://github.com/justyna-pietryga/10x-expenses/blob/c3c1dd6ab98c87c100537967f80d6900d04f31d7/supabase/migrations/20260529185000_first_bank_import_review_batch_contract.sql#L15).
- The dirty-state test uses a fixed sample statement month and may replace an
  existing batch:
  [`tests/e2e/import-review-dirty-state.spec.ts:70`](https://github.com/justyna-pietryga/10x-expenses/blob/c3c1dd6ab98c87c100537967f80d6900d04f31d7/tests/e2e/import-review-dirty-state.spec.ts#L70).
- The seed smoke modifies a fixed June 2026 value and its cleanup writes the
  same value again instead of restoring prior state:
  [`tests/e2e/seed.spec.ts:11`](https://github.com/justyna-pietryga/10x-expenses/blob/c3c1dd6ab98c87c100537967f80d6900d04f31d7/tests/e2e/seed.spec.ts#L11),
  [`tests/e2e/seed.spec.ts:21`](https://github.com/justyna-pietryga/10x-expenses/blob/c3c1dd6ab98c87c100537967f80d6900d04f31d7/tests/e2e/seed.spec.ts#L21).

Categories are archived during cleanup, but import batches, transactions, and
monthly income records generally persist for the lifetime of the database.
This is acceptable for an ephemeral database that is discarded after the job,
but it makes shared hosted test environments and parallel runs unreliable.

The minimum reliable CI configuration should use one worker. Parallelism can be
reintroduced after tests use worker-specific users or fully isolated data
namespaces and clean up all persistent records.

### 7. CI diagnostics and guardrails are missing

The Playwright configuration uses an HTML reporter and records a trace on the
first retry:

- [`playwright.config.ts:9`](https://github.com/justyna-pietryga/10x-expenses/blob/c3c1dd6ab98c87c100537967f80d6900d04f31d7/playwright.config.ts#L9)
- [`playwright.config.ts:12`](https://github.com/justyna-pietryga/10x-expenses/blob/c3c1dd6ab98c87c100537967f80d6900d04f31d7/playwright.config.ts#L12)

No CI retries are configured, so `on-first-retry` does not currently produce a
trace. The workflow does not upload `playwright-report/` or `test-results/`,
which makes remote failures difficult to diagnose.

CI-specific Playwright settings should include:

- `forbidOnly: Boolean(process.env.CI)`
- a small retry count in CI
- `workers: 1` initially
- report and trace artifact upload with `if: always()`

### 8. Runtime and workflow behavior should be made explicit

The workflow requests generic Node 22 while `.nvmrc` pins Node 22.14.0:

- [`.github/workflows/ci.yml:16`](https://github.com/justyna-pietryga/10x-expenses/blob/c3c1dd6ab98c87c100537967f80d6900d04f31d7/.github/workflows/ci.yml#L16)
- [`.nvmrc:1`](https://github.com/justyna-pietryga/10x-expenses/blob/c3c1dd6ab98c87c100537967f80d6900d04f31d7/.nvmrc#L1)

The E2E job should use `.nvmrc` to avoid a second runtime contract. The workflow
should also declare `contents: read` explicitly and add `workflow_dispatch` if
manual remote reproduction is required.

The production migration job currently depends only on the existing validation
job:

- [`.github/workflows/ci.yml:27`](https://github.com/justyna-pietryga/10x-expenses/blob/c3c1dd6ab98c87c100537967f80d6900d04f31d7/.github/workflows/ci.yml#L27)

If E2E is intended as a deployment gate, migration should depend on both
validation and E2E. This dependency is a product/release decision rather than a
technical prerequisite for first making E2E runnable.

## Recommended Change Set

### Minimum reliable CI version

1. Add a separate `e2e` job to `.github/workflows/ci.yml`.
2. Use the Node version from `.nvmrc` and run `npm ci`.
3. Install Chromium and Linux dependencies with
   `npx playwright install --with-deps chromium`.
4. Start local Supabase and reset the database from migrations.
5. Fix the missing `supabase/seed.sql` contract by adding the file or disabling
   seed loading.
6. Export the local Supabase URL and anon key to the E2E job environment.
7. Add a tracked Playwright authentication setup that creates a unique user,
   signs in, and writes the ignored storage state file.
8. Configure CI to use one worker, forbid focused tests, and retry failed tests.
9. Run `npm run test:e2e`.
10. Upload Playwright reports and test results even when the test step fails.
11. Stop Supabase in an `always()` cleanup step.

### Reliability improvements after the first CI version

1. Replace fixed statement months and fixed monthly-income periods with
   run-specific data where the product contract allows it.
2. Add explicit cleanup helpers for import batches, transactions, and monthly
   income records.
3. Move from one shared user to a user per worker or per test group.
4. Re-enable multiple Playwright workers only after isolation is demonstrated.
5. Decide whether E2E must gate the production migration job.
6. Update README and CLAUDE CI documentation to match the actual `main` branch
   workflow and quality gates.

## Architecture Insights

The E2E suite is correctly exercising the real application boundary: browser,
Astro routes, Supabase authentication, RLS, and database writes. The CI solution
should preserve that boundary rather than mock Supabase.

The missing abstraction is environment provisioning. Local development
currently relies on manual preconditions: Docker running, Supabase already
started, matching environment variables, and a previously authenticated browser
state. CI needs those preconditions represented as executable setup.

An ephemeral database makes incomplete record cleanup less dangerous because
the entire stack is discarded after the job. Test-level cleanup is still
valuable for independence and future parallelism, but it does not have to block
the first serial CI implementation.

## Historical Context

The first focused E2E plan explicitly chose the existing local saved session and
kept fixture infrastructure out of scope:

- [`context/changes/review-persistence-e2e-risk-3/plan.md:9`](https://github.com/justyna-pietryga/10x-expenses/blob/c3c1dd6ab98c87c100537967f80d6900d04f31d7/context/changes/review-persistence-e2e-risk-3/plan.md#L9)
- [`context/changes/review-persistence-e2e-risk-3/plan.md:15`](https://github.com/justyna-pietryga/10x-expenses/blob/c3c1dd6ab98c87c100537967f80d6900d04f31d7/context/changes/review-persistence-e2e-risk-3/plan.md#L15)

That was a reasonable narrow choice for proving a local browser risk, but it is
the central reason the suite cannot bootstrap on a clean runner.

Prior Supabase CI research separates production migration credentials from
application runtime configuration and treats CI as the schema writer:

- [`context/changes/supabase-schema-cicd/research.md:30`](https://github.com/justyna-pietryga/10x-expenses/blob/c3c1dd6ab98c87c100537967f80d6900d04f31d7/context/changes/supabase-schema-cicd/research.md#L30)

The E2E job should preserve this separation. Pull-request E2E should not need
the production access token or database password.

## CI Environment Options

### Recommended: ephemeral local Supabase

- Isolated per job and safe for pull requests.
- Requires no hosted database secrets.
- Runs the actual migrations and RLS policies.
- Supports forked PRs because setup uses repository code and generated local
  credentials.
- Adds Docker startup time, but removes shared-state and production-data risk.

### Possible later: dedicated hosted E2E Supabase project

- Avoids local Docker startup.
- Requires repository secrets and migration access.
- Forked PRs cannot access the required secrets under normal GitHub security
  rules.
- Concurrent runs share state unless users and data are carefully namespaced.
- Requires complete cleanup and workflow concurrency controls.

### Rejected: production Supabase

- Tests perform real writes and batch replacement.
- Cleanup is incomplete.
- A failed or concurrent test could alter production finance data.

## Code References

- `.github/workflows/ci.yml:18` - Current validation steps; no E2E execution.
- `package.json:6` - Dev command assumes local Supabase already exists.
- `package.json:13` - Existing Playwright test command.
- `playwright.config.ts:8` - Full parallelism with shared state.
- `playwright.config.ts:13` - Ignored local authentication state dependency.
- `playwright.config.ts:15` - Playwright-managed Astro server startup.
- `supabase/config.toml:60` - Missing seed file contract.
- `src/middleware.ts:18` - Unauthenticated protected-route redirect.
- `tests/e2e/import-review-dirty-state.spec.ts:70` - Fixed batch replacement risk.
- `tests/e2e/seed.spec.ts:21` - Non-restoring cleanup behavior.

## Related Research

- [`context/changes/supabase-schema-cicd/research.md`](../supabase-schema-cicd/research.md)
- [`context/changes/testing-critical-import-and-summary-integrity/research.md`](../testing-critical-import-and-summary-integrity/research.md)

## Open Questions

1. Should E2E block the production migration job on every push to `main`, or run
   as a required but independent status check?
2. Should the initial CI implementation run the entire suite serially, or split
   out `seed.spec.ts` until its fixed-period cleanup is corrected?
3. Is manual `workflow_dispatch` execution required in the first version?
4. Should local `npm run dev` retain its implicit "Supabase already running"
   contract, or should separate scripts make application startup and database
   provisioning explicit?
