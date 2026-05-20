---
bootstrapped_at: 2026-05-20T09:20:46.4917707+02:00
starter_id: 10x-astro-starter
starter_name: 10x Astro Starter (Astro + Supabase + Cloudflare)
project_name: expenses
language_family: js
package_manager: npm
cwd_strategy: git-clone
bootstrapper_confidence: first-class
phase_3_status: ok
audit_command: npm audit --json
---

## Hand-off

```yaml
starter_id: 10x-astro-starter
package_manager: npm
project_name: expenses
hints:
  language_family: js
  team_size: solo
  deployment_target: cloudflare-pages
  ci_provider: github-actions
  ci_default_flow: auto-deploy-on-merge
  bootstrapper_confidence: first-class
  path_taken: standard
  quality_override: false
  self_check_answers: null
  has_auth: true
  has_payments: false
  has_realtime: false
  has_ai: false
  has_background_jobs: false
```

## Why this stack

A solo developer shipping a small web app in a 3-week after-hours window needs a starter that keeps auth, data access, UI conventions, and deployment decisions close together. The Expenses PRD needs account login, statement import/review flows, reusable categorization rules, and monthly summaries, but not payments, realtime collaboration, or background jobs. The 10x Astro Starter is the recommended JavaScript/TypeScript default for this product shape, with TypeScript, Astro, React, auth/data conventions, and Cloudflare Pages as the default deploy target. Bootstrapper support is first-class, so scaffolding should be mostly smooth, with occasional manual follow-up possible.

## Pre-scaffold verification

| Signal | Value | Severity | Notes |
| --- | --- | --- | --- |
| npm package | not run | n/a | starter uses `git clone`, so no `create-*` CLI package applies |
| GitHub repo | `przeprogramowani/10x-astro-starter` last pushed 2026-05-17T10:33:39Z | fresh | fetched from GitHub API using `card.docs_url` |

## Scaffold log

**Resolved invocation**: `git clone https://github.com/przeprogramowani/10x-astro-starter .bootstrap-scaffold && cd .bootstrap-scaffold && npm install`
**Strategy**: `git-clone`
**Exit code**: `0`
**Files moved**: `31536`
**Conflicts (.scaffold siblings)**: `none`
**.gitignore handling**: `moved silently`
**.bootstrap-scaffold cleanup**: `deleted`

## Post-scaffold audit

**Tool**: `npm audit --json`
**Summary**: `0 CRITICAL, 1 HIGH, 10 MODERATE, 0 LOW`
**Direct vs transitive**: `0/0/3/0` direct of total `0/1/10/0`

#### HIGH findings

- `devalue` `5.6.3 - 5.8.0` — `GHSA-77vg-94rm-hx3p`, DoS via sparse array deserialization. Fix available.

#### MODERATE findings

- `@astrojs/check` — direct dependency, vulnerable via `@astrojs/language-server`. Fix available via version change.
- `@astrojs/cloudflare` — direct dependency, vulnerable via `@cloudflare/vite-plugin` and `wrangler`. Fix available via version change.
- `@astrojs/language-server` — transitive dependency, vulnerable via `volar-service-yaml`.
- `@cloudflare/vite-plugin` — transitive dependency, vulnerable via `miniflare`, `wrangler`, and `ws`.
- `miniflare` — transitive dependency, vulnerable via `ws`.
- `volar-service-yaml` — transitive dependency, vulnerable via `yaml-language-server`.
- `wrangler` — direct dependency, vulnerable via `miniflare`. Fix available via version change.
- `ws` — transitive dependency, `GHSA-58qx-3vcg-4xpx`, uninitialized memory disclosure.
- `yaml` — transitive dependency, `GHSA-48c2-rrv3-qjmp`, stack overflow via deeply nested YAML collections.
- `yaml-language-server` — transitive dependency, vulnerable via `yaml`.

## Hints recorded but not acted on

| Hint | Value |
| --- | --- |
| bootstrapper_confidence | `first-class` |
| quality_override | `false` |
| path_taken | `standard` |
| self_check_answers | `null` |
| team_size | `solo` |
| deployment_target | `cloudflare-pages` |
| ci_provider | `github-actions` |
| ci_default_flow | `auto-deploy-on-merge` |
| has_auth | `true` |
| has_payments | `false` |
| has_realtime | `false` |
| has_ai | `false` |
| has_background_jobs | `false` |

## Next steps

Next: a future skill will set up agent context (`CLAUDE.md`, `AGENTS.md`). For now, your project is scaffolded and verified.

Useful manual steps in the meantime:
- `git init` if you have not already.
- Review the fresh scaffold files and wire in project-specific env vars from `.env.example`.
- Address audit findings per your risk tolerance; the high-severity item is transitive and the full breakdown is above.
