# E2E GitHub Actions — Plan Brief

> Full plan: `context/changes/e2e-github-actions/plan.md`
> Research: `context/changes/e2e-github-actions/research.md`

## What & Why

The existing Playwright suite works only on a prepared developer machine because it assumes Supabase is already running and an ignored authenticated browser state already exists. This plan makes the suite reproducible in GitHub Actions and uses its result to protect production database migrations.

## Starting Point

GitHub Actions currently runs lint, Vitest, Astro checks, build, and production migrations, but no browser tests. Five E2E specs exist; they share one local authentication state, and one fixed-period smoke test does not restore its prior data.

## Desired End State

Every pull request, `main` push, and manual workflow run executes standard CI followed by a full serial Playwright suite against an ephemeral local Supabase stack. Authentication is generated per run, diagnostics survive failures, cleanup is unconditional, and production migrations run only after CI and E2E pass. Local developers retain the existing `npx supabase start` plus `npm run test:e2e` workflow.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| E2E environment | Ephemeral local Supabase | It preserves real auth, RLS, and writes without hosted secrets or shared state. | Research |
| Migration policy | E2E blocks production migration | Browser-level regressions must not precede a production schema change. | Plan |
| Suite scope | Fix `seed.spec.ts` and run the full suite | CI should cover every tracked browser test without retaining the known fixed-state defect. | Plan |
| Job ordering | E2E runs after standard CI | Cheap validation failures should avoid unnecessary Docker and browser provisioning. | Plan |
| Manual execution | Add `workflow_dispatch` | Remote CI and infrastructure failures need a direct reproduction path. | Plan |
| PR policy | Workflow only; no required status check | Branch protection remains outside this implementation. | Plan |
| CI concurrency | One Playwright worker | Shared authentication and incomplete row cleanup make parallel CI unsafe today. | Research |
| Local behavior | Keep existing manual Supabase prerequisite | CI provisioning should not silently change the local development lifecycle. | Plan |

## Scope

**In scope:**

- Generated Playwright authentication setup.
- Deterministic seed/reset behavior.
- CI-aware Playwright retries, traces, focused-test protection, and serialization.
- E2E GitHub Actions job with local Supabase and Chromium.
- Reports, traces, unconditional cleanup, and manual dispatch.
- E2E gating of production migrations.
- README and agent-context updates.

**Out of scope:**

- GitHub branch-protection changes.
- Hosted or production Supabase E2E.
- Automatic local Supabase provisioning.
- Multi-worker CI isolation.
- Visual regression tooling.
- Moving Cloudflare deployment into GitHub Actions.

## Architecture / Approach

```text
push / PR / manual
        |
       CI
        |
       E2E
  local Supabase
  auth setup -> saved session
  Chromium -> full serial suite
  reports + cleanup
        |
 migrate (main push only)
```

Playwright owns user/session creation, while GitHub Actions owns infrastructure lifecycle. The E2E job exports only the local Supabase URL and anon key to Astro and never receives production migration credentials.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Deterministic foundation | Generated auth and rerunnable seed smoke | Correctly restoring pre-test state |
| 2. Playwright configuration | Setup dependency and CI-only reliability policy | Accidentally degrading local execution |
| 3. Actions integration | Full hosted-runner lifecycle and migration gate | Supabase startup/runtime duration |
| 4. Documentation and verification | Accurate runbooks and complete validation | Docs drifting from workflow behavior |

**Prerequisites:** GitHub-hosted Ubuntu runners with Docker support; existing production Supabase migration secrets remain configured.

**Estimated effort:** Approximately 2–3 implementation sessions across four gated phases.

## Open Risks & Assumptions

- One-worker CI is assumed acceptable until the suite has worker-specific users and complete cleanup.
- Supabase startup plus Chromium installation will materially increase workflow duration.
- The generated signup/sign-in flow assumes local email confirmation remains disabled.
- Branch protection will not require E2E, so repository settings can still permit merging after an E2E failure.

## Success Criteria (Summary)

- A clean GitHub runner can execute the full Playwright suite without developer-created files or production credentials.
- Local E2E continues to work with an already-running local Supabase stack.
- Failures produce actionable artifacts and always stop the local stack.
- Production migrations wait for both standard CI and E2E success.
