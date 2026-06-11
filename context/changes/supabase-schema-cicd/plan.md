# Supabase Schema CI/CD Implementation Plan

## Overview

Move production release ownership into GitHub Actions so hosted Supabase schema migrations and Cloudflare Worker deploys happen in one serialized pipeline on pushes to `main`. This removes the manual local `supabase db push` step, keeps `supabase/migrations/` as the production schema source of truth, and makes the repo's operational docs match the new release path.

## Current State Analysis

The repo already has committed SQL migrations, local migration validation, and stable CI quality gates, but production rollout is split across systems. GitHub Actions currently runs validation only, while Cloudflare Git integration owns app deploy timing, and neither path applies hosted Supabase migrations automatically. That split already caused a production schema drift incident and leaves the repo with a race between app code and database state.

## Desired End State

After this change:

- A push to `main` triggers one GitHub Actions-owned production release path.
- That path runs the existing validation gates, applies pending hosted Supabase migrations, and deploys the Worker only after migration success.
- Production schema changes are no longer applied manually from a developer machine.
- Release-facing docs describe GitHub Actions as the canonical production release path and document the forward-fix recovery model for database changes.

### Key Discoveries:

- Current CI runs on `main` push and PR, but it only executes validation steps and never performs migration or deploy work: `.github/workflows/ci.yml:3`
- The existing deployment plan intentionally kept GitHub Actions checks-only and handed production deploys to Cloudflare Git integration, which conflicts with the desired schema-before-deploy ordering: `context/changes/deployment/deployment-plan.md:5`
- The repo already has canonical validation commands and the required CLIs in the toolchain, so the release workflow can reuse those commands instead of inventing a second gate contract: `package.json:5`
- The current docs are operationally stale for this area: `README.md` still says no database migrations are required and `CLAUDE.md` still describes CI as lint/build on `master`: `README.md:133`, `CLAUDE.md:54`

## What We're NOT Doing

- No staging environment or Supabase Branching rollout in this change
- No PR preview deployment workflow
- No down-migration or automatic database rollback system
- No changes to application code, runtime bindings, or database schema design itself
- No attempt to preserve Cloudflare Git auto-deploy as a parallel production release path

## Implementation Approach

Make GitHub Actions the single production release authority. Keep the existing validation workflow contract, then add a production release workflow that runs on pushes to `main`, authenticates Supabase CLI non-interactively using GitHub secrets, links to the hosted production project, applies pending migrations, and deploys the Worker with Wrangler only after migration success. Disable or clearly retire the prior assumption that Cloudflare Git integration owns production deploy timing, so app rollout ordering is no longer ambiguous.

## Critical Implementation Details

### Timing & lifecycle

The release workflow must keep one strict order: validation gates first, then `supabase db push`, then `wrangler deploy`. Any design that lets Cloudflare auto-deploy independently of migration success reintroduces the exact schema drift risk this change is meant to remove.

### Debug & observability

The release workflow should expose the migration and deploy steps clearly in GitHub Actions logs, and the docs should point operators at GitHub Actions logs for release failures and `wrangler tail` for post-deploy runtime diagnosis. This change is operational, so verification needs to be log-oriented, not only code-oriented.

## Phase 1: Production Release Workflow

### Overview

Create the canonical production workflow that validates the repo, applies hosted Supabase migrations, and deploys the Worker in one serialized GitHub Actions path.

### Changes Required:

#### 1. Release workflow definition

**File**: `.github/workflows/<production-release-workflow>.yml`

**Intent**: Add a dedicated production workflow owned by GitHub Actions so merges to `main` become the single release trigger for both hosted Supabase schema updates and Cloudflare deploys.

**Contract**: The workflow triggers on push to `main`, enforces workflow-level concurrency so only one production release runs at a time, checks out the repo, installs dependencies, runs the canonical validation gates already used by the repo, authenticates Supabase CLI with a GitHub secret-backed access token, links to the hosted production project using project ref and database password secrets, applies pending migrations with `supabase db push`, and runs `wrangler deploy` only if the migration step succeeds.

#### 2. Existing CI workflow boundary

**File**: `.github/workflows/ci.yml`

**Intent**: Preserve the fast validation workflow as the repo-wide checks contract without leaving ambiguity about whether this file still owns production deployment.

**Contract**: `ci.yml` remains the validation workflow for push and PR quality gates. If needed for clarity, its naming or comments should distinguish it from the new production release workflow without weakening the existing `lint`, `test`, `check`, and `build` contract.

### Success Criteria:

#### Automated Verification:

- The repo contains a production GitHub Actions workflow that triggers on pushes to `main`.
- The production workflow defines concurrency so only one production release runs at a time.
- The production workflow runs `npm run lint`, `npm test`, `npm run check`, and `npm run build` before `supabase db push`.
- The production workflow contains a Supabase migration step that uses GitHub secrets for non-interactive auth and linking.
- The production workflow deploys with Wrangler only after the migration step succeeds.

#### Manual Verification:

- Read the production workflow top to bottom and confirm the only release order is validate → migrate → deploy.
- Confirm the workflow uses GitHub-hosted secrets for `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF`, and `SUPABASE_DB_PASSWORD` rather than requiring local operator state.
- Confirm there is no remaining repo-owned instruction that Cloudflare Git integration is still the canonical production deployment trigger.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 2: Deployment Ownership Shift

### Overview

Align the repository's deployment assumptions with the new GitHub-owned release model so production deployment authority is no longer split between GitHub Actions and Cloudflare Git integration.

### Changes Required:

#### 1. Deployment plan alignment

**File**: `context/changes/deployment/deployment-plan.md`

**Intent**: Update the prior deployment decision record so it no longer describes GitHub Actions as checks-only or Cloudflare Git integration as the canonical production release owner.

**Contract**: The deployment plan should state that GitHub Actions owns the serialized production release path, that app deploy happens after successful hosted Supabase migration, and that Cloudflare Git auto-deploy is either disabled or no longer treated as the production source of truth.

#### 2. Operational recovery model

**Files**:
- `context/changes/deployment/deployment-plan.md`
- `.github/workflows/<production-release-workflow>.yml`

**Intent**: Make the rollback and failure contract explicit so release operators know what happens when migration or deploy fails.

**Contract**: The release workflow and deployment plan should reflect a forward-fix database model: failed migrations block deploy, failed deploys can roll back app code separately, and schema changes are recovered through corrective migrations rather than down-migrations. The docs should also state where to inspect release failures and what human follow-up is required.

### Success Criteria:

#### Automated Verification:

- The deployment plan no longer states that GitHub Actions is checks-only for production rollout.
- The deployment plan no longer treats Cloudflare Git integration as the canonical production release owner.
- The production workflow structure reflects the same release ordering and failure contract described in the deployment plan.

#### Manual Verification:

- Read the updated deployment plan and confirm a maintainer would understand that production release authority moved from Cloudflare Git integration to GitHub Actions.
- Confirm the rollback section clearly distinguishes app rollback from database forward-fix recovery.
- Confirm the plan does not promise full database rollback or down-migration support.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Phase 3: Documentation and Release Verification

### Overview

Update release-facing documentation and verification guidance so the repo's written operational contract matches the new workflow and future maintainers do not fall back to the old manual or split-deploy model.

### Changes Required:

#### 1. README release path update

**File**: `README.md`

**Intent**: Replace the outdated deployment and Supabase guidance with a truthful summary of the production release path after this change.

**Contract**: `README.md` should stop claiming the project needs no database tables or migrations, describe `supabase/migrations/` as the schema source of truth, explain that production migrations and deploys are handled by GitHub Actions on pushes to `main`, and list the required GitHub secrets at a release-facing level.

#### 2. Agent/developer guidance update

**File**: `CLAUDE.md`

**Intent**: Keep the repository AI/developer rules aligned with the new release model and branch naming.

**Contract**: `CLAUDE.md` should describe the current CI/release behavior accurately, including `main` as the branch target, the existence of a production workflow, and the fact that `wrangler deploy` is no longer the canonical production release path for routine deploys even if it remains a local operator tool.

#### 3. Verification guidance for production release setup

**Files**:
- `README.md`
- `context/changes/deployment/deployment-plan.md`

**Intent**: Give maintainers concrete setup and verification steps for the new operational model instead of only high-level descriptions.

**Contract**: The updated docs should name the GitHub secrets required for release, explain how to verify the workflow ordering, and include concise post-release checks such as confirming the migration job succeeded, the deploy job completed, and the application still loads correctly against the hosted Supabase project.

### Success Criteria:

#### Automated Verification:

- `README.md` documents committed Supabase migrations and the GitHub Actions-owned production release path.
- `CLAUDE.md` no longer describes CI as lint/build on `master`.
- The release-facing docs name the required GitHub secrets for hosted Supabase migration automation.

#### Manual Verification:

- Read `README.md` and confirm a new maintainer would not be told to run production migrations manually from a local machine.
- Read `CLAUDE.md` and confirm the workflow and branch guidance match the actual repo behavior.
- Follow the updated verification steps and confirm they clearly tell a human how to validate the first GitHub Actions-owned production release.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase. Phase blocks use plain bullets — the corresponding `- [ ]` checkboxes for these items live in the `## Progress` section at the bottom of the plan.

---

## Testing Strategy

### Unit Tests:

- No application unit-test expansion is required; this change is workflow and docs oriented.
- If workflow structure is factored into reusable scripts later, verify those scripts in isolation, but the plan does not assume that refactor.

### Integration Tests:

- Validate that the production release workflow reuses the canonical repo gates: `npm run lint`, `npm test`, `npm run check`, `npm run build`
- Validate that the workflow contains the ordered release path: Supabase auth/link, migration apply, then `wrangler deploy`
- Validate that repo docs and deployment notes all describe the same release owner and rollback contract

### Manual Testing Steps:

1. Open the new production workflow file and confirm it triggers on pushes to `main` and includes workflow concurrency.
2. Read the steps in order and confirm validation gates run before the migration step, and the migration step runs before `wrangler deploy`.
3. Review the required GitHub secrets named in the docs and confirm they are sufficient to run the workflow without local CLI state.
4. Read the updated deployment plan and verify it no longer treats Cloudflare Git integration as the canonical production release path.
5. Read the updated `README.md` and `CLAUDE.md` and confirm both now describe committed migrations, `main`, and GitHub Actions-owned production release behavior accurately.

## Performance Considerations

This change increases production release workflow time because it adds migration and deploy steps after the existing quality gates. That cost is intentional: the repo is trading a slightly slower release for deterministic schema-before-deploy ordering and removal of manual production drift fixes.

## Migration Notes

This change does not add database schema migrations itself; it changes how existing and future migrations are applied to the hosted project. The compatibility constraint is operational: once GitHub Actions becomes the single production release path, Cloudflare Git auto-deploy should not remain an independent production trigger, or the repo reintroduces the same race this plan is trying to eliminate.

## References

- Related research: `context/changes/supabase-schema-cicd/research.md`
- Current CI workflow: `.github/workflows/ci.yml:1`
- Existing deployment decision record: `context/changes/deployment/deployment-plan.md:1`
- Current release-facing docs: `README.md:92`
- Current agent guidance: `CLAUDE.md:44`
- Existing release gate scripts: `package.json:5`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Production Release Workflow

#### Automated

- [ ] 1.1 The repo contains a production GitHub Actions workflow that triggers on pushes to `main`.
- [ ] 1.2 The production workflow defines concurrency so only one production release runs at a time.
- [ ] 1.3 The production workflow runs `npm run lint`, `npm test`, `npm run check`, and `npm run build` before `supabase db push`.
- [ ] 1.4 The production workflow contains a Supabase migration step that uses GitHub secrets for non-interactive auth and linking.
- [ ] 1.5 The production workflow deploys with Wrangler only after the migration step succeeds.

#### Manual

- [ ] 1.6 Read the production workflow top to bottom and confirm the only release order is validate → migrate → deploy.
- [ ] 1.7 Confirm the workflow uses GitHub-hosted secrets for `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF`, and `SUPABASE_DB_PASSWORD` rather than requiring local operator state.
- [ ] 1.8 Confirm there is no remaining repo-owned instruction that Cloudflare Git integration is still the canonical production deployment trigger.

### Phase 2: Deployment Ownership Shift

#### Automated

- [ ] 2.1 The deployment plan no longer states that GitHub Actions is checks-only for production rollout.
- [ ] 2.2 The deployment plan no longer treats Cloudflare Git integration as the canonical production release owner.
- [ ] 2.3 The production workflow structure reflects the same release ordering and failure contract described in the deployment plan.

#### Manual

- [ ] 2.4 Read the updated deployment plan and confirm a maintainer would understand that production release authority moved from Cloudflare Git integration to GitHub Actions.
- [ ] 2.5 Confirm the rollback section clearly distinguishes app rollback from database forward-fix recovery.
- [ ] 2.6 Confirm the plan does not promise full database rollback or down-migration support.

### Phase 3: Documentation and Release Verification

#### Automated

- [ ] 3.1 `README.md` documents committed Supabase migrations and the GitHub Actions-owned production release path.
- [ ] 3.2 `CLAUDE.md` no longer describes CI as lint/build on `master`.
- [ ] 3.3 The release-facing docs name the required GitHub secrets for hosted Supabase migration automation.

#### Manual

- [ ] 3.4 Read `README.md` and confirm a new maintainer would not be told to run production migrations manually from a local machine.
- [ ] 3.5 Read `CLAUDE.md` and confirm the workflow and branch guidance match the actual repo behavior.
- [ ] 3.6 Follow the updated verification steps and confirm they clearly tell a human how to validate the first GitHub Actions-owned production release.
