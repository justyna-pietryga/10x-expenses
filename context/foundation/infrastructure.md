---
project: expenses
researched_at: 2026-05-23T00:00:00+02:00
recommended_platform: Cloudflare Workers + Pages
runner_up: Railway
context_type: mvp
tech_stack:
  language: js
  framework: Astro + React
  runtime: Cloudflare Workers via @astrojs/cloudflare
---

## Recommendation

**Deploy on Cloudflare Workers + Pages.**

This project is already scaffolded around `@astrojs/cloudflare`, Wrangler, and a Cloudflare-oriented SSR entrypoint, so Cloudflare wins on compatibility, lowest migration cost, and MVP cost control. The strongest decision drivers were: request/response-only workload, cost sensitivity, small expected traffic, and the fact that the current stack already targets Cloudflare without adapter changes.

## Platform Comparison

| Platform | CLI-first | Managed/Serverless | Agent-readable docs | Stable deploy API | MCP / Integration | Total |
|---|---|---|---|---|---|---|
| Cloudflare Workers + Pages | Pass | Pass | Pass | Pass | Pass | 5 / 5 |
| Railway | Pass | Partial | Pass | Pass | Pass | 4.5 / 5 |
| Vercel | Pass | Pass | Pass | Pass | Partial | 4.5 / 5 |
| Render | Pass | Partial | Partial | Pass | Partial | 3.5 / 5 |
| Netlify | Pass | Pass | Partial | Pass | Pass | 4 / 5 |
| Fly.io | Pass | Partial | Partial | Pass | Partial | 3.5 / 5 |

Cloudflare scored highest because it matches the existing adapter and deployment shape exactly. Railway and Vercel are both viable, but both would require a platform-specific adapter/runtime change, which is unnecessary cost for a 3-week MVP. Netlify is also workable for Astro, but the current project is more Cloudflare-shaped than Netlify-shaped. Render and Fly.io are stronger when you need container control or persistent processes, which this app does not currently require.

### Shortlisted Platforms

#### 1. Cloudflare Workers + Pages (Recommended)

The current app already uses `output: "server"`, `@astrojs/cloudflare`, and `wrangler.jsonc`, so Cloudflare is the only shortlisted option that does not require reshaping the deployment layer before the first release. It is also a strong fit for low-traffic MVP economics and agent-operated workflows through Wrangler and Cloudflare MCP support.

#### 2. Railway

Railway is the best fallback if the app later wants a more traditional app-platform model, easier co-located services, or fewer edge-runtime constraints. It lost mainly because the current starter is not Railway-native, so moving there would add deployment work immediately.

#### 3. Vercel

Vercel remains a good Astro host with strong CLI and docs. It placed third because this project is not Next.js-native, cost minimization mattered more than premium DX, and switching from the current Cloudflare adapter to a Vercel adapter would add avoidable migration work.

## Anti-Bias Cross-Check: Cloudflare Workers + Pages

### Devil's Advocate — Weaknesses

1. The app becomes more coupled to Cloudflare-specific bindings, Wrangler config, and worker runtime assumptions than it would on a generic Node/container host.
2. Financial-data import and parsing may eventually want heavier or longer-running workflows than a simple worker-centric deployment model handles elegantly.
3. Single-region usage reduces the business value of global-edge deployment, so some platform complexity arrives before its main upside matters.
4. Debugging environment drift across local dev, bindings, and deployed worker config can be subtler than on a plain VM or container platform.
5. Cloudflare’s adjacent products can tempt premature platform sprawl: KV, R2, Queues, Durable Objects, and Access can accumulate before the MVP proves it needs them.

### Pre-Mortem — How This Could Fail

The team shipped quickly on Cloudflare because the starter already worked there, but they silently converted “good deployment fit today” into “best long-term operating model.” As statement import logic grew more complex, the app needed better visibility into retries, parsing failures, and heavier background-style workflows. Instead of keeping the MVP simple, the team added more Cloudflare-specific pieces around the core app. Local development and deployed behavior drifted just enough that auth, bindings, and import issues took too long to reproduce. Because users were mostly in one region, the edge advantage never became a strong product differentiator, while the runtime-specific constraints kept shaping design decisions. The mistake was not choosing Cloudflare; the mistake was failing to set a boundary: use Cloudflare for the MVP path that already exists, but re-evaluate the platform if imports, jobs, or debugging needs outgrow the current worker-first model.

### Unknown Unknowns

- This app is not deploying as a generic static Astro site; it is deploying as Astro SSR on the Cloudflare adapter, so `wrangler deploy` is the real production path.
- `wrangler.jsonc` already declares a worker entrypoint and asset binding, which means platform configuration lives partly outside application code.
- Session and image-related runtime behavior depend on Cloudflare bindings and adapter expectations, not only on Astro code.
- If import processing later needs scheduled or queue-backed workflows, the platform story expands beyond “deploy one app” into multiple Cloudflare products.
- Supabase is external from day one, so the project already accepts a multi-vendor operational model even if Cloudflare is the host.

## Operational Story

How the chosen platform operates day to day for this exact stack:

- **Preview deploys**: local preview is `npm run preview`; this starter does not ship PR preview URLs by default, so cloud previews should use a separate Wrangler environment or a dedicated staging worker before production publish.
- **Secrets**: `SUPABASE_URL` and `SUPABASE_KEY` should live in Cloudflare secrets/config for deployed environments and local `.dev.vars` for development; production secrets should be writable only by trusted maintainers.
- **Rollback**: use Wrangler/Cloudflare deployment versions to revert the worker to the prior deployed version; app-code rollback is fast, but database/schema changes in external systems do not roll back automatically.
- **Approval**: an agent may build, validate, and deploy code; a human should approve production publish, secret rotation, and any destructive data operation.
- **Logs**: runtime logs should be read via `npx wrangler tail`; build and deployment logs should be read from the Wrangler CLI or CI output, not only from the dashboard.

## Risk Register

| Risk | Source | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| Worker/runtime lock-in makes later platform migration harder | Devil's advocate | M | M | Keep platform-specific logic thin; isolate deployment assumptions to config and infra docs. |
| Import workflows outgrow simple request/response execution | Pre-mortem | M | H | Re-evaluate queues/background processing before adding heavier import automation. |
| Local and deployed bindings drift | Unknown unknowns | M | M | Keep `.dev.vars`, Wrangler config, and deployed secret names aligned; verify auth/import flows after each env change. |
| Edge-first complexity arrives before global-latency value | Devil's advocate | M | M | Treat Cloudflare as an MVP delivery path, not a permanent architecture decision; review again after real usage data. |
| Platform sprawl across Cloudflare products | Research finding | M | M | Add new Cloudflare services only against a concrete product need; document why each service exists. |

## Getting Started

1. Build the Astro app for the worker target: `npm run build`
2. Authenticate Wrangler if needed: `npx wrangler login`
3. Set deployment secrets in Cloudflare for the target environment, starting with `SUPABASE_URL` and `SUPABASE_KEY`
4. Deploy the current SSR worker build with `npx wrangler deploy`
5. Verify the deployed auth flow and protected-route redirect behavior, then tail logs with `npx wrangler tail`

## Out of Scope

The following were not evaluated in this research:
- Docker image configuration
- CI/CD pipeline setup
- Production-scale architecture (multi-region, HA, DR)
