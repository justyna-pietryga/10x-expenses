# Supabase Schema CI/CD — Plan Brief

> Full plan: `context/changes/supabase-schema-cicd/plan.md`
> Research: `context/changes/supabase-schema-cicd/research.md`

## What & Why

This plan moves production release ownership into GitHub Actions so hosted Supabase schema migrations and Cloudflare deploys happen in one serialized path on pushes to `main`. The goal is to eliminate manual local `supabase db push` for production and remove the schema drift risk caused by the current split between Cloudflare deploy timing and database rollout.

## Starting Point

Today the repo already has committed Supabase migrations and stable CI quality gates, but production rollout is split: GitHub Actions validates, Cloudflare Git integration deploys app code, and nobody in CI applies hosted Supabase migrations. That leaves production vulnerable to app-before-schema mismatches and has already caused one drift incident.

## Desired End State

When this plan is complete, a push to `main` triggers one GitHub Actions-owned production release path that validates the repo, applies pending hosted Supabase migrations, and deploys the Worker only after migration success. The repo docs also describe that operational truth clearly, including a forward-fix database recovery model rather than manual laptop-driven migration application.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Production release owner | GitHub Actions owns migrations and deploy | This is the only choice that guarantees schema-before-deploy ordering in this repo. | Plan |
| Release trigger | Automatic on push to `main` | It removes the manual DB step completely and keeps one canonical production path. | Plan |
| Validation gate | Reuse existing CI gates before release | The repo already has canonical `lint`, `test`, `check`, and `build` commands. | Research |
| Secret storage | GitHub Actions secrets only | The workflow runner needs non-interactive Supabase auth and project linkage. | Plan |
| DB recovery model | Forward-fix only for schema changes | It matches real migration practice and the repo's current deployment constraints. | Plan |
| Docs scope | Update release-facing docs touched by this change | The repo currently contains stale operational guidance that would become actively misleading. | Plan |

## Scope

**In scope:**
- Add a production GitHub Actions workflow for validate → migrate → deploy
- Serialize releases with workflow concurrency
- Shift deployment ownership from Cloudflare Git integration assumptions to GitHub Actions
- Update `README.md`, `CLAUDE.md`, and the deployment plan to match the new release model
- Document required GitHub secrets and release verification steps

**Out of scope:**
- Staging or preview environments
- Supabase Branching adoption
- Down-migration support
- Application feature or schema logic changes
- Broad infrastructure redesign beyond production release ownership

## Architecture / Approach

GitHub Actions becomes the single production release controller. A new production workflow on `main` reuses the repo's existing validation commands, then authenticates Supabase CLI with GitHub secrets, links to the hosted production project, runs `supabase db push`, and finally deploys the Worker with Wrangler. Cloudflare Git auto-deploy stops being the canonical production trigger so release ordering is no longer ambiguous.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Production Release Workflow | New GitHub Actions production release path with serialized migrate-then-deploy ordering | Workflow ordering or secret wiring is incomplete and reintroduces drift risk |
| 2. Deployment Ownership Shift | Updated deployment contract and rollback model | Old Cloudflare-owned deployment assumptions remain in repo history or operator habits |
| 3. Documentation and Release Verification | Release-facing docs aligned with the new production path | Docs stay partially stale and operators fall back to manual or split workflows |

**Prerequisites:** GitHub repository admin access, Cloudflare deploy permissions, hosted Supabase project ref, production database password, and a Supabase personal access token suitable for GitHub Actions
**Estimated effort:** ~2-3 sessions across 3 phases

## Open Risks & Assumptions

- The plan assumes Cloudflare Git auto-deploy can be disabled or retired as the canonical production release trigger without introducing another hidden deploy path.
- Production database rollout authority will expand into GitHub secrets; that is accepted for this change.
- The first production release after the switch will need careful human verification because this is an operational path change, not only a code change.

## Success Criteria (Summary)

- A push to `main` has one clear GitHub Actions production release path that validates, migrates, and deploys in order.
- The repo no longer tells maintainers to apply production Supabase migrations manually from a local machine.
- Release documentation and deployment notes all describe the same production owner, secret setup, and forward-fix recovery model.
