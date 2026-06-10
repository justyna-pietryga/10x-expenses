# Quality Gates and Cookbook Wiring — Plan Brief

> Full plan: `context/changes/testing-quality-gates-and-cookbook-wiring/plan.md`

## What & Why

This change turns Phase 4 of the test rollout into enforceable repo defaults. The goal is to make the project's documented quality gates true in practice by aligning `package.json`, CI, and the rollout cookbook around the same canonical commands and responsibilities.

## Starting Point

The repo already has partial gate wiring: `package.json` exposes lint, test, and build scripts, Husky runs `lint-staged`, and CI lints and builds. The gap is that the rollout artifact claims stronger required gates than CI actually runs, and the useful `PostToolUse` hook exists only as user-local Codex config.

## Desired End State

After this plan lands, contributors and CI will use the same repo-owned command surface for lint, typecheck, Astro diagnostics, tests, and build. CI will fail fast on the required gates before reaching the env-sensitive build, and `test-plan.md` will clearly explain which checks are repo-owned, which are CI-enforced, and which local accelerators remain optional.

## Key Decisions Made

| Decision area | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Repo-owned scope | CI + scripts + cookbook | Those are portable, enforceable, and team-visible; user-home hooks are not. | Plan |
| Required CI gates | lint + tests + astro check + build | This matches the rollout contract and closes the documented-vs-actual gap. | Plan |
| Type gate shape | explicit scripts | Canonical scripts reduce drift across docs, CI, and local workflows. | Plan |
| Pre-commit scope | keep narrow | Fast staged-file checks preserve iteration speed while full validation stays later. | Plan |
| Post-edit hook role | optional local accelerator | The pattern is useful, but it is not repo-owned or portable enough to require. | Plan |
| Test command policy | hybrid | CI should enforce repo-wide `npm test`, while local phase work can still use targeted suite commands. | Plan |
| Cookbook depth | reusable gate patterns | The repo needs durable guidance, not another long narrative phase summary. | Plan |
| CI env policy | fail fast, keep current build env | This preserves pragmatism without turning Phase 4 into an env-decoupling project. | Plan |

## Scope

**In scope:**
- Canonical validation scripts in `package.json`
- CI workflow updates for required gates
- `test-plan.md` updates for gate ownership and cookbook wiring
- Optional local hook guidance as documentation

**Out of scope:**
- Mandatory user-home hook setup
- Broad Husky expansion beyond staged-file enforcement
- Removing build-time secret requirements
- New E2E enforcement in CI

## Architecture / Approach

The plan moves from repo core outward. First define the canonical commands in `package.json`. Then wire GitHub Actions to run them in fail-fast order. Finally update the rollout cookbook so written guidance matches the executable contract and clearly separates repo-owned gates from optional local accelerators.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Canonical Gate Commands | Stable repo-owned commands for lint, typecheck, Astro check, tests, and build | Command drift between scripts and contributor guidance |
| 2. Required CI Gate Enforcement | GitHub Actions runs required gates before build | CI still diverging from documented required gates |
| 3. Cookbook and Local Workflow Wiring | `test-plan.md` explains gate ownership and optional hooks | Guidance becoming bloated or unclear about ownership |
| 4. Change Closeout | Clean rollout metadata and executable checklist | Future implementation ambiguity if closeout is weak |

**Prerequisites:** Current CI, Husky, and test-plan files remain available; no new infrastructure is required.
**Estimated effort:** ~1-2 sessions across 4 phases

## Open Risks & Assumptions

- `npx astro check` remains the practical diagnostics gate even though `package.json` does not currently expose it as a script.
- The build step will continue to rely on CI secrets, so workflow ordering matters for fail-fast behavior.
- Optional local hook guidance must stay clearly labeled or contributors may misread it as required project setup.

## Success Criteria (Summary)

- The repo has one canonical command per required quality gate.
- CI enforces lint, tests, Astro diagnostics, and build in the documented order.
- `test-plan.md` clearly explains repo-owned gates, CI ownership, narrow pre-commit scope, and optional local hooks without turning into a long operations manual.
