# Quality Gates and Cookbook Wiring Implementation Plan

## Overview

Implement Phase 4 of the test rollout by converting the repo's documented quality gates into consistent, repo-owned defaults. This phase standardizes canonical validation commands, enforces the required gates in CI, and backfills the rollout cookbook with concise guidance about how local checks, CI checks, and optional local agent hooks relate.

## Current State Analysis

The repo already has the building blocks for quality enforcement, but they do not line up cleanly. `package.json` defines lint, build, and test scripts, Husky runs `lint-staged` on pre-commit, and GitHub Actions installs dependencies, syncs Astro, lints, and builds on pushes and pull requests. At the same time, the rollout artifact and `AGENTS.md` describe a stronger contract than CI currently enforces.

The biggest gap is between documented and actual gate ownership. `context/foundation/test-plan.md` says lint, typecheck, build, unit or integration, and ownership checks are required, but `.github/workflows/ci.yml` does not run `npm test` or `npx astro check`, and `package.json` has no canonical `typecheck` script. The local `PostToolUse` hook exists only in `C:\Users\justy\.codex\hooks.json`, so it is useful but not repo-owned.

### Key Discoveries:

- The repo already exposes the main validation surfaces, but only as a partial set of scripts: `package.json:6`, `package.json:14`
- CI currently installs dependencies, runs `npx astro sync`, lints, and builds, but it does not run tests or Astro diagnostics before build: `.github/workflows/ci.yml:1`
- Pre-commit is intentionally narrow today and only runs staged-file checks through `lint-staged`: `.husky/pre-commit:1`, `package.json:66`
- The documented required gates are stronger than the current wiring and explicitly include lint, typecheck, build, and integration coverage: `context/foundation/test-plan.md:80`
- `AGENTS.md` already tells contributors to run `npm run lint`, `npx astro check`, and `npm run build`, so this phase should align repo scripts and CI with that contributor guidance instead of inventing a second contract: `AGENTS.md:28`
- The existing `PostToolUse` hook is a user-local accelerator, not a repo-controlled guarantee, and it currently runs `npx eslint --fix . --quiet` plus `npx tsc --noEmit`: `C:\Users\justy\.codex\hooks.json`

## Desired End State

After this change:

- `package.json` exposes canonical repo-owned commands for lint, typecheck, Astro diagnostics, and tests
- GitHub Actions enforces the documented required gates in fail-fast order: lint, repo-wide tests, Astro check, then the existing secret-backed build
- `context/foundation/test-plan.md` documents reusable gate patterns instead of relying on old rollout plans for operational knowledge
- local pre-commit remains intentionally narrow, while the optional local `PostToolUse` hook is documented as a convenience pattern rather than a required setup step

Verification is complete when the repo scripts, CI workflow, and rollout cookbook all describe the same gate contract and the updated commands pass under the repo's normal validation flow.

## What We're NOT Doing

- No broad redesign of the ESLint or Astro configuration beyond what is needed to standardize gate commands
- No requirement that contributors install or share a user-home `~/.codex/hooks.json`
- No expansion of Husky pre-commit into full test or build execution
- No refactor to remove the current build-time `SUPABASE_*` secret dependency from CI
- No new browser or Playwright enforcement in CI for this phase
- No reopening of completed rollout phases under `testing-auth-and-ownership-boundaries`
- No changes under `context/archive/`

## Implementation Approach

Treat the repo as the source of truth for quality gates. First, normalize command ownership in `package.json` so CI, contributors, and future plans can all reference a small set of canonical scripts. Then update CI to use those commands in the same order the rollout artifact describes. Finally, tighten `context/foundation/test-plan.md` so it explains the stable pattern: narrow pre-commit, required CI gates, repo-wide `npm test` as the enforcement command, targeted suite commands for local phase work, and optional local hooks as accelerators rather than mandatory setup.

## Critical Implementation Details

### Timing and lifecycle

CI should fail fast on the cheapest reliable signals before reaching the secret-backed build. That means lint, repo-wide tests, and Astro diagnostics must run before `npm run build`, preserving the existing `SUPABASE_*` env injection only for the final step.

### Debug and observability

This phase is only successful if the repo's written contract and executable contract match. The plan should therefore keep the oracle at three places: `package.json` scripts, `.github/workflows/ci.yml`, and `context/foundation/test-plan.md`. Avoid drifting into aspirational prose that no command actually enforces.

## Phase 1: Canonical Gate Commands

### Overview

Standardize the repo-owned commands so every later surface can rely on the same lint, typecheck, Astro check, and test entrypoints.

### Changes Required:

#### 1. Package script normalization

**File**: `package.json`

**Intent**: Make the documented gates executable through stable repo scripts rather than ad hoc `npx` calls and implicit knowledge.

**Contract**: Add canonical scripts for `typecheck` and `check`, keep `lint`, `test`, and `build` as first-class commands, and make sure the manifest exposes one obvious command per required gate. The resulting script surface must support local contributors, CI, and future cookbook guidance without needing raw shell command explanations.

#### 2. Gate contract alignment audit

**Files**:
- `package.json`
- `AGENTS.md`

**Intent**: Keep contributor guidance aligned with the normalized script surface.

**Contract**: Adjust any repo-owned references that would otherwise point contributors at outdated raw commands once canonical scripts exist. This should preserve the current meaning of the guidance while reducing command drift.

### Success Criteria:

#### Automated Verification:

- `package.json` exposes canonical scripts for lint, typecheck, Astro diagnostics, tests, and build.
- `npm run typecheck` passes.
- `npm run check` passes.

#### Manual Verification:

- Read the script block in `package.json` and confirm each required gate has one obvious repo-owned command.
- Confirm the repo-owned contributor guidance does not contradict the new script names.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Required CI Gate Enforcement

### Overview

Make GitHub Actions enforce the documented required gates in the same order the rollout artifact describes.

### Changes Required:

#### 1. CI job gate expansion

**File**: `.github/workflows/ci.yml`

**Intent**: Close the gap between the test plan's required gates and what pull requests actually run today.

**Contract**: Update the CI job so it runs the canonical lint, repo-wide test, and Astro check commands before the existing build step. The workflow must preserve the current build environment handling for `SUPABASE_URL` and `SUPABASE_KEY`, and it must not weaken build enforcement into a warning-only step.

#### 2. Fail-fast command ordering

**File**: `.github/workflows/ci.yml`

**Intent**: Ensure the cheapest trustworthy gates fail first, so CI catches common regressions before paying for the env-sensitive build.

**Contract**: Order the steps as dependency install, Astro sync if still needed, lint, tests, Astro diagnostics, then build. The resulting workflow should make the gate contract readable from top to bottom without relying on comments in the rollout doc.

### Success Criteria:

#### Automated Verification:

- `.github/workflows/ci.yml` runs lint, repo-wide tests, Astro diagnostics, and build in fail-fast order.
- `npm test` passes locally as the same repo-wide test command CI will enforce.
- `npx astro check` passes locally after the workflow alignment.

#### Manual Verification:

- Read the CI workflow and confirm it now enforces the same required gates listed in Section 5 of `context/foundation/test-plan.md`.
- Confirm the build step still uses the existing `SUPABASE_*` secret injection rather than silently weakening the build contract.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Cookbook and Local Workflow Wiring

### Overview

Backfill the rollout artifact with concise, reusable guidance about canonical commands, gate ownership, and the relationship between CI, pre-commit, and optional local hooks.

### Changes Required:

#### 1. Quality gate cookbook guidance

**File**: `context/foundation/test-plan.md`

**Intent**: Turn Phase 4 from a phase label into operational guidance a contributor can actually follow.

**Contract**: Update the quality-gate sections and cookbook notes so they reference the repo-owned canonical commands, explain that CI enforces repo-wide `npm test` while phase work may still use targeted suite commands locally, and preserve the narrow role of Husky pre-commit.

#### 2. Optional local hook guidance

**File**: `context/foundation/test-plan.md`

**Intent**: Preserve the useful local `PostToolUse` pattern without pretending the repo can enforce user-home configuration.

**Contract**: Document the existing Codex hook shape as an optional local accelerator for edit-time feedback, not as a mandatory team setup step. The wording must clearly separate repo-owned guarantees from user-local convenience.

#### 3. Rollout status alignment

**File**: `context/foundation/test-plan.md`

**Intent**: Keep the rollout table truthful once Phase 4 is implemented.

**Contract**: Update the Phase 4 row, quality-gate notes, and any related per-phase guidance so contributors can see that the project now has concrete gate wiring rather than a not-started placeholder.

### Success Criteria:

#### Automated Verification:

- `context/foundation/test-plan.md` documents canonical gate commands, CI ownership, narrow pre-commit scope, hybrid test-command guidance, and the optional local hook pattern.
- The rollout table reflects Phase 4 as implemented with the new change folder.
- `npm run lint` passes.
- `npm run build` passes.

#### Manual Verification:

- Read the updated cookbook guidance and confirm a contributor could tell which gates are repo-owned, which are CI-enforced, and which are optional local accelerators.
- Confirm the cookbook stays pattern-oriented and concise instead of expanding into a long operations manual.
- Confirm the guidance keeps pre-commit intentionally narrow and does not quietly escalate local enforcement beyond the chosen scope.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 4: Change Closeout

### Overview

Finalize the rollout artifact and change metadata so the new gate wiring is durable and easy to audit.

### Changes Required:

#### 1. Change status alignment

**Files**:
- `context/changes/testing-quality-gates-and-cookbook-wiring/change.md`
- `context/changes/testing-quality-gates-and-cookbook-wiring/plan.md`

**Intent**: Keep the change folder truthful about planning and implementation progress.

**Contract**: Update `change.md` to `planned` during plan creation, maintain the `## Progress` section as the only execution state source, and ensure the final rollout metadata can be marked implemented cleanly once work lands.

### Success Criteria:

#### Automated Verification:

- `context/changes/testing-quality-gates-and-cookbook-wiring/plan.md` and `plan-brief.md` both exist.
- `change.md` is updated to `planned` with the current date.

#### Manual Verification:

- Read the plan and confirm the phase structure separates command normalization, CI wiring, and cookbook wiring instead of blurring them together.
- Confirm the progress section gives a future implementer a clear phase-by-phase checklist with both automated and manual gates.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

## Testing Strategy

### Unit Tests:

- No new unit-test surface is required unless script or config helpers are factored into code, which this plan does not assume.

### Integration Tests:

- Repo-wide `npm test` becomes the CI enforcement command for the current Vitest suite set.
- Existing quality gates must still pass after script and workflow normalization.
- CI wiring should be validated through workflow structure and local command parity rather than mocked GitHub Actions tests.

### Manual Testing Steps:

1. Read `package.json` and confirm the canonical gate commands are easy to identify and match the documented rollout contract.
2. Read `.github/workflows/ci.yml` and confirm lint, repo-wide tests, Astro diagnostics, and build run in the intended fail-fast order.
3. Read the updated `context/foundation/test-plan.md` guidance and confirm it clearly distinguishes repo-owned gates, CI-enforced gates, narrow pre-commit behavior, and optional local hooks.
4. Confirm the optional `PostToolUse` guidance is clearly labeled as user-local convenience rather than required project setup.

## Performance Considerations

This phase should optimize for trust and maintainability rather than raw CI speed. Running repo-wide tests and Astro diagnostics in CI will increase runtime, but the cost is justified because the rollout artifact already treats these as required gates. Pre-commit should remain narrow so local iteration does not inherit that full CI cost.

## Migration Notes

No data migration is expected. The only compatibility concern is command-name drift: if repo-owned docs or automation currently reference raw `npx astro check` or `npx tsc --noEmit`, they must be realigned once canonical scripts are introduced. CI should continue using the existing secret-backed build model rather than broadening this phase into environment decoupling work.

## References

- Rollout source: `context/foundation/test-plan.md`
- Current script surface and lint-staged config: `package.json:6`, `package.json:66`
- Current CI workflow: `.github/workflows/ci.yml:1`
- Current pre-commit hook: `.husky/pre-commit:1`
- Current contributor validation guidance: `AGENTS.md:28`
- Existing optional local PostToolUse hook: `C:\Users\justy\.codex\hooks.json`
- Prior rollout pattern for cookbook alignment: `context/changes/testing-review-persistence-and-rule-application/plan.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Canonical Gate Commands

#### Automated

- [x] 1.1 `package.json` exposes canonical scripts for lint, typecheck, Astro diagnostics, tests, and build. — cfd7979
- [x] 1.2 `npm run typecheck` passes. — cfd7979
- [x] 1.3 `npm run check` passes. — cfd7979

#### Manual

- [x] 1.4 Read the script block in `package.json` and confirm each required gate has one obvious repo-owned command. — cfd7979
- [x] 1.5 Confirm the repo-owned contributor guidance does not contradict the new script names. — cfd7979

### Phase 2: Required CI Gate Enforcement

#### Automated

- [x] 2.1 `.github/workflows/ci.yml` runs lint, repo-wide tests, Astro diagnostics, and build in fail-fast order. — cfd7979
- [x] 2.2 `npm test` passes locally as the same repo-wide test command CI will enforce. — cfd7979
- [x] 2.3 `npx astro check` passes locally after the workflow alignment. — cfd7979

#### Manual

- [x] 2.4 Read the CI workflow and confirm it now enforces the same required gates listed in Section 5 of `context/foundation/test-plan.md`. — cfd7979
- [x] 2.5 Confirm the build step still uses the existing `SUPABASE_*` secret injection rather than silently weakening the build contract. — cfd7979

### Phase 3: Cookbook and Local Workflow Wiring

#### Automated

- [x] 3.1 `context/foundation/test-plan.md` documents canonical gate commands, CI ownership, narrow pre-commit scope, hybrid test-command guidance, and the optional local hook pattern. — cfd7979
- [x] 3.2 The rollout table reflects Phase 4 as implemented with the new change folder. — cfd7979
- [x] 3.3 `npm run lint` passes. — cfd7979
- [x] 3.4 `npm run build` passes. — cfd7979

#### Manual

- [x] 3.5 Read the updated cookbook guidance and confirm a contributor could tell which gates are repo-owned, which are CI-enforced, and which are optional local accelerators. — cfd7979
- [x] 3.6 Confirm the cookbook stays pattern-oriented and concise instead of expanding into a long operations manual. — cfd7979
- [x] 3.7 Confirm the guidance keeps pre-commit intentionally narrow and does not quietly escalate local enforcement beyond the chosen scope. — cfd7979

### Phase 4: Change Closeout

#### Automated

- [x] 4.1 `context/changes/testing-quality-gates-and-cookbook-wiring/plan.md` and `plan-brief.md` both exist. — cfd7979
- [x] 4.2 `change.md` is updated to `planned` with the current date. — cfd7979

#### Manual

- [x] 4.3 Read the plan and confirm the phase structure separates command normalization, CI wiring, and cookbook wiring instead of blurring them together. — cfd7979
- [x] 4.4 Confirm the progress section gives a future implementer a clear phase-by-phase checklist with both automated and manual gates. — cfd7979
