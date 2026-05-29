# Why `npx supabase db push` Was Required Manually

## Summary

The deployment pipeline only ships app code to Cloudflare. It does not ship database schema changes to Supabase.

In this repo, those are two separate systems:

- Cloudflare deploy uses `wrangler` to publish the Astro worker.
- Supabase schema lives in `supabase/migrations/*.sql` and only changes when someone runs `supabase db push` against the remote project.

The production deploy path was set up that way on purpose. The repo and docs show:

- [`wrangler.jsonc`](C:/Users/justy/10xdevs/wrangler.jsonc:1) only declares worker runtime config and required secrets.
- [`package.json`](C:/Users/justy/10xdevs/package.json:5) has `build`, `lint`, and `test` scripts, but nothing that applies remote Supabase migrations.
- [`README.md`](C:/Users/justy/10xdevs/README.md:164) tells you to deploy the worker with `npx wrangler deploy`.
- The Supabase tables were introduced in migration files like [`20260526103000_finance_domain_foundation.sql`](C:/Users/justy/10xdevs/supabase/migrations/20260526103000_finance_domain_foundation.sql:3), but those files do nothing to production until `supabase db push` is run.

## What Happened

1. A new Cloudflare worker version was deployed.
2. That new code started querying `public.budget_categories`.
3. The production Supabase project still had the old schema.
4. PostgREST returned `Could not find the table 'public.budget_categories' in the schema cache`.
5. `npx supabase db push` applied the missing migrations, so the app and database became consistent.

## Why It Was Not Automatic

Applying database migrations is a higher-risk action than deploying app code.

- A failed migration can partially change production schema or data.
- Database rollout often needs stronger controls than stateless worker deployment.
- Many teams keep DB rollout as an explicit step or a separate CI job with approvals.

Cloudflare deployment does not know anything about Supabase migrations unless that step is explicitly added.

## Recommended Automation Shape

If this should be automated, the right approach is a separate production migration step, usually in CI after merge to `main`, not inside the worker deployment itself.

Typical flow:

1. Authenticate Supabase CLI in CI.
2. Link to the production Supabase project.
3. Run `supabase db push`.
4. Only then run `wrangler deploy`, or block deploy if migration fails.

## Key Principle

Cloudflare deployment and Supabase migrations are separate delivery concerns. Deploying the worker updates application code; running `supabase db push` updates the production database schema.
