# Cloudflare Deployment Plan for `expenses`

## Summary

Deploy the existing Astro SSR app to Cloudflare Workers using the current `@astrojs/cloudflare` adapter and Wrangler setup. The rollout is: one manual first production release to `workers.dev`, then Cloudflare Git auto-deploys from `main`. GitHub Actions remains checks-only. Supabase is the only external runtime integration and must be treated as production-critical configuration.

**Current live URL:** `https://expenses.justyna-pietryga.workers.dev`

## Prerequisites

### Cloudflare / Wrangler CLI

- [ ] Install Node.js `22.x` locally, matching `.nvmrc`.
- [ ] Install project dependencies with `npm install`.
- [x] Confirm Wrangler is available through the local dependency with `npx wrangler --version`.
- [x] Authenticate Wrangler with `npx wrangler login` using the Cloudflare account that owns the Worker.
- [x] Ensure the authenticated Cloudflare account has permission to create and deploy Workers, manage Worker secrets, and enable Git integration for the target repository.
- [x] Verify the Worker project name used in Cloudflare is `expenses`, matching `wrangler.jsonc`.

### Supabase

- [x] Create a hosted **production** Supabase project dedicated to the deployed app.
- [x] Copy the project URL and `anon` public key from **Settings -> API**; these are `SUPABASE_URL` and `SUPABASE_KEY`.
- [x] Configure Supabase Auth for the deployed app:
  - [x] Set the site/app URL to `https://expenses.justyna-pietryga.workers.dev`
  - [x] Add required redirect URLs for sign-in, sign-up, and email confirmation flows using the deployed hostname.
  - [ ] If email confirmation remains enabled, verify that confirmation links resolve back to the deployed app correctly.
- [ ] Keep local development credentials separate from hosted production credentials; do not reuse local `127.0.0.1` values in Cloudflare secrets.
- [ ] Reserve a separate hosted staging Supabase project for future non-prod deployment work, but do not wire it into v1.

### Local Verification Prerequisites

- [ ] Create `.dev.vars` for local Cloudflare-style secret loading using the same variable names as production:
  - `SUPABASE_URL`
  - `SUPABASE_KEY`
- [ ] Use a local `.env` only for local Node/Supabase workflows; keep `.dev.vars` aligned with the deployed secret names to reduce environment drift.
- [ ] Confirm local auth flows work before the first production deploy: sign-up, sign-in, sign-out, and protected-route redirect behavior.

## Phase Checklist

- [ ] **Phase 1 - Normalize repo and Cloudflare identifiers**
  - [x] Rename the default branch from `master` to `main`.
  - [x] Update GitHub workflow triggers from `master` to `main`.
  - [x] Rename the Worker in `wrangler.jsonc` from starter-default naming to `expenses`.
  - [x] Keep the current Astro Cloudflare SSR entrypoint; do not convert this to static Pages hosting.

- [ ] **Phase 2 - Harden runtime config for Cloudflare**
  - [x] Add `secrets.required` in `wrangler.jsonc` for `SUPABASE_URL` and `SUPABASE_KEY`.
  - [x] Keep `compatibility_date` pinned; future bumps are explicit release work.
  - [x] Keep production-only Worker config in v1; do not add Wrangler environments yet.
  - [x] Keep observability enabled and use `wrangler tail` plus Workers Logs for runtime debugging.

- [ ] **Phase 3 - Wire external integrations safely**
  - [x] Provision a hosted production Supabase project, separate from local development.
  - [ ] Reserve a separate staging Supabase project for future non-prod deployment work, but do not wire it in v1.
  - [x] Set Cloudflare production secrets for `SUPABASE_URL` and `SUPABASE_KEY`.
  - [x] Configure Supabase Auth URL settings to the production `workers.dev` origin: `https://expenses.justyna-pietryga.workers.dev`
  - [x] Confirm no additional Cloudflare bindings are needed beyond static assets.

- [ ] **Phase 4 - Deployment automation shape**
  - [x] Keep GitHub Actions for `npm ci`, `npx astro sync`, `npm run lint`, and `npm run build`.
  - [x] Do not deploy from GitHub Actions.
  - [x] GitHub repository exists and is already configured.
  - [x] After the first successful manual release, connect the repo to Cloudflare Workers Git integration.
  - [x] Set Cloudflare production auto-deploy branch to `main`.
  - [x] Do not include PR previews in v1.

- [ ] **Phase 5 - First release and verification**
  - [x] Perform the first production deployment manually with Wrangler after secrets are present.
  - [x] Verify the generated `workers.dev` URL: `https://expenses.justyna-pietryga.workers.dev`
  - [x] Run smoke tests for home page, sign-up, sign-in, sign-out, and `/dashboard` redirect protection.
  - [x] Confirm logs are visible in `wrangler tail` / Workers Logs.
  - [x] Record the rollback command/path and require human approval for rollback, secret rotation, and destructive data operations.

## Important Changes

- **`wrangler.jsonc`**
  - Change Worker name to `expenses`.
  - Add required secret declarations for `SUPABASE_URL` and `SUPABASE_KEY`.
  - Keep the current Astro Cloudflare SSR entrypoint, `nodejs_compat`, assets binding, and observability.

- **`.github/workflows/ci.yml`**
  - Retarget to `main`.
  - Keep checks-only behavior.

- **External configuration**
  - Cloudflare production secrets: `SUPABASE_URL`, `SUPABASE_KEY`.
  - Supabase Auth config includes the deployed `workers.dev` origin as the site/app URL for auth flows: `https://expenses.justyna-pietryga.workers.dev`.

## Test Plan

- **Build and static checks**
  - `npm run lint`
  - `npx astro check`
  - `npm run build`

- **Production verification on `workers.dev`**
  - Anonymous user visiting `/dashboard` is redirected to `/auth/signin`.
  - Sign-up works with the deployed Supabase project and does not fail due to missing auth URL/callback config.
  - Sign-in creates a valid session and allows `/dashboard`.
  - Sign-out clears the session and returns the user to a public route.

- **Operational validation**
  - Deployment fails early if required secrets are missing.
  - Runtime logs are visible through `npx wrangler tail`.
  - Rollback path is documented before enabling auto-deploys.

## Rollback Playbook

- List recent deployments and version IDs:
  - `npx wrangler deployments list`
- Fast rollback to the immediately previous version:
  - `npx wrangler rollback`
- Roll back to a specific known-good version:
  - `npx wrangler rollback <VERSION_ID>`
- Add an audit message when rolling back:
  - `npx wrangler rollback <VERSION_ID> --message "Rollback after auth/deploy regression"`
- Human approval remains required before rollback, secret rotation, or destructive data operations.
- After rollback:
  - verify the home page
  - verify `/dashboard` redirects correctly when logged out
  - verify sign-in/sign-out still work
  - inspect runtime logs with `npx wrangler tail`

Rollback note:
- Cloudflare rollbacks switch traffic back to a previously deployed Worker version, but they do **not** revert external systems automatically. Supabase config changes, data changes, and any future bindings/resource migrations must be reviewed separately.

## Edge Cases and Support Steps

- **Missing Cloudflare secrets**
  - Expected behavior: deploy fails early due to `secrets.required`.
  - Support step: set secrets before any production deploy attempt.

- **Supabase auth links point to the wrong host**
  - Support step: update Supabase Auth URL settings to the current production `workers.dev` origin; repeat when a custom domain is added later.

- **Branch mismatch after rename**
  - Support step: update GitHub default branch, branch protection, workflow triggers, and Cloudflare Git integration branch target in one coordinated rollout.

- **Cloudflare Git integration deploys before the first manual release is validated**
  - Support step: connect Git integration only after the manual production deploy and smoke test pass.

- **Need for staging or previews later**
  - Support step: add Wrangler staging config and wire the separate staging Supabase project only when preview/staging becomes a real workflow need.

- **Heavier import processing exceeds worker-first ergonomics**
  - Support step: reopen the platform decision before adding Queues, Cron Triggers, or other Cloudflare products.

## Assumptions

- Production branch is `main`, not `master`.
- First public launch uses `workers.dev`; custom domain setup is deferred.
- No PR preview deployments are required in v1.
- GitHub Actions stays the validation pipeline; Cloudflare owns production deploys after the first manual release.
- Supabase is the only external runtime dependency for the first deploy.
- Intended storage path for this plan: `context/changes/deployment/deployment-plan.md`.
