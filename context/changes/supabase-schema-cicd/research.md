---
date: 2026-06-11T23:08:02.0317263+02:00
researcher: Codex
git_commit: e446609fdd02e65539a1b1ec01e4212f40b583f7
branch: dev
repository: 10xdevs
topic: "How to handle Supabase schema upgrades during CI/CD without manual local CLI pushes"
tags: [research, supabase, migrations, ci-cd, cloudflare]
status: complete
last_updated: 2026-06-11
last_updated_by: Codex
---

# Research: How to handle Supabase schema upgrades during CI/CD without manual local CLI pushes

**Date**: 2026-06-11T23:08:02.0317263+02:00
**Researcher**: Codex
**Git Commit**: e446609fdd02e65539a1b1ec01e4212f40b583f7
**Branch**: dev
**Repository**: 10xdevs

## Research Question

How should this project update the hosted Supabase schema automatically during CI/CD when production deployment is triggered from Cloudflare after `main` is updated, so manual `npx supabase db push` from a local machine is no longer required?

## Summary

This repo already has the right source of truth for schema changes: SQL migrations in `supabase/migrations/`. What is missing is a single automated writer for the production Supabase project. Today, GitHub Actions validates the app on `main`, while Cloudflare Git integration deploys app code separately. Nothing in either path applies database migrations, which is why manual `supabase db push` has been required ([.github/workflows/ci.yml:3](../../../.github/workflows/ci.yml), [README.md:170](../../../README.md), [context/issues/2026-05-29-why-supabase-db-push-was-manual.md:5](../../../context/issues/2026-05-29-why-supabase-db-push-was-manual.md)).

The recommended shape is:

1. Keep `supabase/migrations/` as the only production schema source of truth.
2. Add a dedicated GitHub Actions job on pushes to `main` that authenticates the Supabase CLI non-interactively, links to the production project, and runs `supabase db push`.
3. Serialize that job so CI is the only actor applying production migrations.
4. Treat Cloudflare Git deploy as app-code rollout only. If you need strict ordering, move production deploy out of Cloudflare Git auto-deploy and into a GitHub Actions deploy job that runs only after migrations succeed.

Because Cloudflare Git integration and Supabase migrations are separate systems, the current setup cannot guarantee "schema first, deploy second" ordering. If that ordering matters, the production deploy should also move under GitHub Actions control instead of remaining fully automatic in Cloudflare.

## Detailed Findings

### Current CI/CD shape in this repo

- GitHub Actions runs on push and pull request to `main`, but it is checks-only: install, sync, lint, test, check, build ([.github/workflows/ci.yml:3](../../../.github/workflows/ci.yml), [.github/workflows/ci.yml:18](../../../.github/workflows/ci.yml)).
- The workflow has no deploy step and no Supabase migration step ([.github/workflows/ci.yml:18](../../../.github/workflows/ci.yml)).
- The current deployment plan explicitly says GitHub Actions stays checks-only and Cloudflare owns production deploys after the first manual Wrangler release ([context/changes/deployment/deployment-plan.md:5](../../../context/changes/deployment/deployment-plan.md), [context/changes/deployment/deployment-plan.md:60](../../../context/changes/deployment/deployment-plan.md), [context/changes/deployment/deployment-plan.md:155](../../../context/changes/deployment/deployment-plan.md)).
- `wrangler.jsonc` only defines Worker runtime config and required secrets; it does not know anything about database rollout ([wrangler.jsonc:3](../../../wrangler.jsonc), [wrangler.jsonc:7](../../../wrangler.jsonc)).

### Current schema-management shape

- The repo already uses additive SQL migrations under `supabase/migrations/`, including the most recent `20260611143000_transaction_rule_provenance.sql` ([supabase/migrations/20260611143000_transaction_rule_provenance.sql:1](../../../supabase/migrations/20260611143000_transaction_rule_provenance.sql)).
- Local verification consistently uses `npx supabase db reset`, and `supabase/config.toml` has migrations enabled for `db push` and `db reset` ([supabase/config.toml:53](../../../supabase/config.toml), [supabase/config.toml:60](../../../supabase/config.toml)).
- The repo's incident notes already describe the production issue accurately: Cloudflare deploys code, but the hosted Supabase schema changes only when someone runs `supabase db push` against the remote project ([context/issues/2026-05-29-why-supabase-db-push-was-manual.md:5](../../../context/issues/2026-05-29-why-supabase-db-push-was-manual.md)).

### Why manual `db push` was required

- The app deploy path and DB deploy path are currently decoupled by design.
- The app can reach hosted Supabase using `SUPABASE_URL` and `SUPABASE_KEY`, but production schema changes are not applied by either Cloudflare Git integration or GitHub Actions ([wrangler.jsonc:7](../../../wrangler.jsonc), [README.md:180](../../../README.md)).
- That mismatch already caused a production incident where app code expected a table the hosted project did not have until `npx supabase db push` was run manually ([context/issues/2026-05-29-why-supabase-db-push-was-manual.md:21](../../../context/issues/2026-05-29-why-supabase-db-push-was-manual.md)).

### Official Supabase guidance relevant to this setup

- Supabase's deployment docs describe the remote rollout flow as: `supabase login`, `supabase link`, then `supabase db push`, and explicitly suggest a CI/CD pipeline that runs `supabase db push` on merge to `main`: <https://supabase.com/docs/guides/deployment/database-migrations>
- The same guide warns that once you use migrations, remote schema changes should not be made directly in the dashboard because they bypass migration history and cause `db push` sync errors: <https://supabase.com/docs/guides/deployment/database-migrations>
- Supabase CLI supports non-interactive auth and linking suitable for CI:
  - `supabase login --token ...`
  - `supabase link --project-ref ... --password ...`
  - `supabase db push --linked`
  - verified locally from CLI help in this repo on 2026-06-11.

### Operational implication for Cloudflare Git auto-deploy

- Cloudflare Git integration can deploy the worker after `main` changes, but it does not coordinate with Supabase migration success.
- That means the current platform shape can automate both actions, but not guarantee safe ordering between them.
- There are two viable operating models:

#### Model A: Minimal change, keep Cloudflare Git auto-deploy

- Add a GitHub Actions workflow that runs `supabase db push` on push to `main`.
- Accept that Cloudflare may deploy very close to the same time.
- This reduces manual work substantially, but there is still a small race window where new app code could reach production before the migration finishes.

#### Model B: Safer release ordering, move production deploy under GitHub Actions

- Run CI checks.
- Run production Supabase migration in GitHub Actions.
- Only after migration succeeds, run `wrangler deploy` from GitHub Actions.
- Disable or stop relying on Cloudflare Git auto-deploy for production.
- This is the only setup in this repo that can reliably enforce "schema first, code second."

For this app, Model B is the defensible choice if new releases frequently depend on new columns, tables, constraints, or RLS policies.

## Code References

- [.github/workflows/ci.yml:3](../../../.github/workflows/ci.yml) - CI triggers only on `main` push and PR.
- [.github/workflows/ci.yml:18](../../../.github/workflows/ci.yml) - Current CI steps; no migration or deploy step exists.
- [wrangler.jsonc:3](../../../wrangler.jsonc) - Worker runtime configuration.
- [wrangler.jsonc:7](../../../wrangler.jsonc) - Required Supabase secrets for the deployed worker.
- [README.md:170](../../../README.md) - Deployment docs still describe Wrangler deploy separately from CI.
- [supabase/config.toml:53](../../../supabase/config.toml) - Migrations enabled.
- [supabase/config.toml:60](../../../supabase/config.toml) - Seed behavior for local reset.
- [context/issues/2026-05-29-why-supabase-db-push-was-manual.md:37](../../../context/issues/2026-05-29-why-supabase-db-push-was-manual.md) - Existing repo guidance already points toward a separate CI migration step.
- [context/changes/deployment/deployment-plan.md:60](../../../context/changes/deployment/deployment-plan.md) - Current repo deployment decision keeps GitHub Actions checks-only.

## Architecture Insights

- This codebase already follows a healthy migration discipline locally: migration files are committed, additive, and validated with reset-based local checks.
- The real missing contract is not "how to write migrations" but "who is allowed to apply them to production."
- Production schema rollout should have exactly one writer. In this repo, that should be CI, not individual developer laptops.
- If production code rollout stays in Cloudflare Git integration, then schema rollout and app rollout remain loosely coupled. That is acceptable only if the app can tolerate temporary schema lag.

## Historical Context (from prior changes)

- The finance foundation established Supabase migrations as a committed artifact and local reset as the verification path ([context/archive/2026-05-25-finance-domain-foundation/plan.md:38](../../../context/archive/2026-05-25-finance-domain-foundation/plan.md)).
- The deployment plan later chose Cloudflare Workers with Git integration and explicitly kept GitHub Actions as checks-only ([context/changes/deployment/deployment-plan.md:5](../../../context/changes/deployment/deployment-plan.md)).
- The quality-gates change strengthened CI validation but intentionally did not broaden CI into deployment orchestration ([context/changes/testing-quality-gates-and-cookbook-wiring/plan.md:38](../../../context/changes/testing-quality-gates-and-cookbook-wiring/plan.md)).
- The production incident notes already captured the core lesson: app deploy and schema deploy are separate delivery concerns and must be wired explicitly ([context/issues/2026-05-29-why-supabase-db-push-was-manual.md:48](../../../context/issues/2026-05-29-why-supabase-db-push-was-manual.md)).

## Related Research

- [context/issues/2026-05-29-why-supabase-db-push-was-manual.md](../../../context/issues/2026-05-29-why-supabase-db-push-was-manual.md)
- [context/issues/2026-05-29-cloudflare-supabase-schema-cache.md](../../../context/issues/2026-05-29-cloudflare-supabase-schema-cache.md)

## Recommended Next Implementation Shape

1. Create a new GitHub Actions workflow dedicated to production schema rollout on push to `main`.
2. Store these GitHub secrets:
   - `SUPABASE_ACCESS_TOKEN`
   - `SUPABASE_PROJECT_REF`
   - `SUPABASE_DB_PASSWORD`
3. In that workflow:
   - `actions/checkout`
   - `actions/setup-node`
   - `npm ci`
   - `npx supabase login --token "$SUPABASE_ACCESS_TOKEN"`
   - `npx supabase link --project-ref "$SUPABASE_PROJECT_REF" --password "$SUPABASE_DB_PASSWORD"`
   - optionally `npx supabase migration list`
   - `npx supabase db push --linked --include-all --yes`
4. Add a GitHub Actions `concurrency` group so only one production migration job runs at a time.
5. Decide release model:
   - If minimal-change: keep Cloudflare Git auto-deploy and accept the race window.
   - If safe-ordering: disable production Git auto-deploy and deploy with `wrangler deploy` from GitHub Actions only after migrations succeed.
6. Update docs so `README.md` stops implying this repo has no DB migrations and explains the production migration path.

## Open Questions

- Do you want minimal manual effort only, or do you also want strict release ordering with no app-before-schema race?
- Is the hosted Supabase project using the direct database password in a way acceptable for GitHub Actions secrets, or do you want a different rollout mechanism such as Supabase Branching later?
- Should production deploy remain in Cloudflare Git integration, or should this repo move to GitHub Actions-owned production deploy so migrations and deploy are one serialized pipeline?
