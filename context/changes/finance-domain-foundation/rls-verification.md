# RLS Verification

This note records how the finance-domain privacy boundary was verified for `finance-domain-foundation`.

## Scope

The verification covers:

- user-owned visibility on `budget_categories`
- user-owned visibility on `monthly_incomes`
- user-owned visibility on `statement_import_batches`
- user-owned visibility on `transactions`
- user-owned visibility on `categorization_rules`
- user-owned visibility on `monthly_summaries`

Every table in the finance foundation uses a direct `user_id` ownership column plus per-table RLS policies with:

- `using (auth.uid() = user_id)` for `select`, `update`, and `delete`
- `with check (auth.uid() = user_id)` for `insert` and `update`

## Environment

- Local Supabase stack started with `npx supabase start`
- Migration applied with `npx supabase db reset`
- Database container: `supabase_db_10x-astro-starter`

## Schema Checks Run

The following checks were run against the local database:

```sql
select tablename, rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename in (
    'budget_categories',
    'monthly_incomes',
    'statement_import_batches',
    'transactions',
    'categorization_rules',
    'monthly_summaries'
  )
order by tablename;
```

Expected result:

- all six finance tables are present
- `rowsecurity = true` for each table

```sql
select table_name, column_name
from information_schema.columns
where table_schema = 'public'
  and table_name in (
    'budget_categories',
    'monthly_incomes',
    'statement_import_batches',
    'transactions',
    'categorization_rules',
    'monthly_summaries'
  )
  and column_name = 'user_id'
order by table_name;
```

Expected result:

- all six finance tables expose a direct `user_id` column

## Repeatable RLS Checks

Use two user IDs from `auth.users`, referred to below as `<user_a>` and `<user_b>`.

### 1. Authenticated user A can access only their own rows

```sql
set local role authenticated;
set local request.jwt.claim.sub = '<user_a>';

insert into public.budget_categories (user_id, name, percentage_limit)
values ('<user_a>', 'Food', 30.00);

select user_id, name, percentage_limit
from public.budget_categories;
```

Expected result:

- the insert succeeds
- the select returns only rows whose `user_id = <user_a>`

### 2. Authenticated user B cannot read user A rows

```sql
set local role authenticated;
set local request.jwt.claim.sub = '<user_b>';

select user_id, name, percentage_limit
from public.budget_categories;
```

Expected result:

- rows created for `<user_a>` are not visible to `<user_b>`

### 3. Inserts fail when `user_id` does not match `auth.uid()`

```sql
set local role authenticated;
set local request.jwt.claim.sub = '<user_b>';

insert into public.budget_categories (user_id, name, percentage_limit)
values ('<user_a>', 'Travel', 10.00);
```

Expected result:

- insert is rejected by the `with check (auth.uid() = user_id)` policy

### 4. Unauthenticated access cannot read or mutate finance tables

```sql
set local role anon;
reset request.jwt.claim.sub;

select * from public.budget_categories;

insert into public.budget_categories (user_id, name, percentage_limit)
values ('<user_a>', 'Transport', 15.00);
```

Expected result:

- `select` returns no rows
- `insert` is rejected

## Local Verification Summary

The implementation run for this change verified:

- the migration applies cleanly with `npx supabase db reset`
- all required finance tables exist
- all required finance tables have direct `user_id` ownership columns
- RLS is enabled on all required finance tables

The repeatable SQL above is the handoff for future agents to validate cross-user isolation and unauthenticated denial explicitly.

## Handoff

- GitHub issue: `#1`
- Downstream roadmap items unblocked by this foundation:
  - `S-01` budget-setup
  - `S-02` first-bank-import-review
  - `S-03` monthly-summary-and-rules
  - `S-04` second-supported-format
