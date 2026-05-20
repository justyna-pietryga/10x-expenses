---
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
---

## Why this stack

A solo developer shipping a small web app in a 3-week after-hours window needs a starter that keeps auth, data access, UI conventions, and deployment decisions close together. The Expenses PRD needs account login, statement import/review flows, reusable categorization rules, and monthly summaries, but not payments, realtime collaboration, or background jobs. The 10x Astro Starter is the recommended JavaScript/TypeScript default for this product shape, with TypeScript, Astro, React, auth/data conventions, and Cloudflare Pages as the default deploy target. Bootstrapper support is first-class, so scaffolding should be mostly smooth, with occasional manual follow-up possible.
