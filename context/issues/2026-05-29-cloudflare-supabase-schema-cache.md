# Cloudflare Production Supabase Schema Cache Incident

## Summary

The deployed Cloudflare worker was almost certainly connecting to a hosted Supabase project, not the local database.

Evidence from the repo:

- [`src/lib/supabase.ts`](C:/Users/justy/10xdevs/src/lib/supabase.ts:1) creates the server client only from `SUPABASE_URL` and `SUPABASE_KEY`.
- [`wrangler.jsonc`](C:/Users/justy/10xdevs/wrangler.jsonc:7) requires those two secrets for the deployed worker.
- `budget_categories` exists only in repo migrations under [`supabase/migrations/20260526103000_finance_domain_foundation.sql`](C:/Users/justy/10xdevs/supabase/migrations/20260526103000_finance_domain_foundation.sql:3) plus the archive follow-up migration [`20260527120000_budget_setup_category_archive.sql`](C:/Users/justy/10xdevs/supabase/migrations/20260527120000_budget_setup_category_archive.sql:1).

That means:

- Login working in production proves the worker can reach some hosted Supabase project.
- The `Could not find the table 'public.budget_categories' in the schema cache` error strongly points to one of these:
  - Cloudflare is pointed at the wrong Supabase project.
  - The correct production Supabase project never received the finance migrations.
  - The table exists, but PostgREST's schema cache is stale.

## Diagnosis Path

1. Verify Cloudflare is targeting the intended Supabase project.
   - Compare the `SUPABASE_URL` secret's project ref with the production Supabase project ref shown in Supabase Dashboard -> Settings -> API.
   - Because Cloudflare hides secret values after creation, the safest path is usually to re-set both secrets from the known-good production project values.
   - Cloudflare's docs confirm `wrangler secret put` updates the worker secret and deploys immediately.

2. Verify the production database actually has the finance tables.
   - In Supabase SQL Editor on the production project, run:

```sql
select schemaname, tablename
from pg_tables
where schemaname = 'public'
  and tablename in ('budget_categories', 'monthly_incomes');
```

3. Verify migration history on that same project.
   - Run:

```sql
select version, name
from supabase_migrations.schema_migrations
order by version;
```

Expected repo-backed migrations include:

- `20260526103000_finance_domain_foundation`
- `20260527120000_budget_setup_category_archive`

4. If the tables or migration rows are missing, push the repo migrations to production.
   - Official Supabase deployment flow:

```bash
npx supabase login
npx supabase link
npx supabase db push
```

This should apply the local `supabase/migrations` files to the linked remote project.

5. If the tables already exist but the error remains, refresh PostgREST's schema cache.
   - In Supabase SQL Editor, run:

```sql
select pg_notification_queue_usage();
```

Supabase documents this as the non-disruptive fix when new tables or columns are not recognized.

6. If `db push` reports local/remote migration drift:
   - Diagnose with:

```bash
npx supabase migration list
```

Only if the schema already exists remotely but migration history is wrong, repair the history record:

```bash
npx supabase migration repair --status applied 20260526103000
npx supabase migration repair --status applied 20260527120000
```

Use repair only to fix history, not to apply SQL.

## Affected Interfaces And Config

- Cloudflare Worker secrets:
  - `SUPABASE_URL`
  - `SUPABASE_KEY`
- Production Supabase schema:
  - `public.budget_categories`
  - `public.monthly_incomes`
- Migration source of truth:
  - `supabase/migrations/20260526103000_finance_domain_foundation.sql`
  - `supabase/migrations/20260527120000_budget_setup_category_archive.sql`

## Verification

- Production login still succeeds.
- `GET /budget` loads without the schema-cache error.
- Creating a category through `/api/budget/categories` succeeds.
- Supabase SQL query confirms `public.budget_categories` exists.
- `supabase_migrations.schema_migrations` contains both migration versions above.

## Assumptions

- Default assumption: this is not a local-vs-prod database mixup inside app code; it is a remote environment state problem.
- Most likely root cause: production Supabase auth was configured, but the production database migrations were never pushed.
- Secondary fallback: the worker points at a different hosted Supabase project than the one expected.
- Less likely fallback: stale PostgREST schema cache after schema changes.

## Sources

- Supabase database migration deployment docs: https://supabase.com/docs/guides/deployment/database-migrations
- Supabase schema-cache troubleshooting: https://supabase.com/docs/guides/troubleshooting/postgrest-not-recognizing-new-columns-or-functions-bd75f5
- Cloudflare Workers secrets docs: https://developers.cloudflare.com/workers/configuration/secrets/
