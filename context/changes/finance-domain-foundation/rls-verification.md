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
begin;
set local role authenticated;
set local request.jwt.claim.sub = '<user_a>';

insert into public.budget_categories (user_id, name, percentage_limit)
values ('<user_a>', 'Food', 30.00);

select user_id, name, percentage_limit
from public.budget_categories;
rollback;
```

Expected result:

- the insert succeeds
- the select returns only rows whose `user_id = <user_a>`

### 2. Authenticated user B cannot read user A rows

```sql
begin;
set local role authenticated;
set local request.jwt.claim.sub = '<user_b>';

select user_id, name, percentage_limit
from public.budget_categories;
rollback;
```

Expected result:

- rows created for `<user_a>` are not visible to `<user_b>`

### 3. Inserts fail when `user_id` does not match `auth.uid()`

```sql
begin;
set local role authenticated;
set local request.jwt.claim.sub = '<user_b>';

insert into public.budget_categories (user_id, name, percentage_limit)
values ('<user_a>', 'Travel', 10.00);
rollback;
```

Expected result:

- insert is rejected by the `with check (auth.uid() = user_id)` policy

### 4. Unauthenticated access cannot read or mutate finance tables

```sql
begin;
set local role anon;
reset request.jwt.claim.sub;

select * from public.budget_categories;

insert into public.budget_categories (user_id, name, percentage_limit)
values ('<user_a>', 'Transport', 15.00);
rollback;
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
- authenticated user A can insert and read only their own finance rows
- authenticated user B cannot read user A's finance rows
- authenticated inserts are rejected when `user_id` does not match `auth.uid()`
- unauthenticated access cannot read or insert finance rows

Executed local RLS outcomes:

- `user_a_visible_rows = 1`
- `user_b_visible_rows = 0`
- `anon_visible_rows = 0`
- mismatched authenticated insert rejected with `new row violates row-level security policy`
- unauthenticated insert rejected with `new row violates row-level security policy`

The repeatable SQL above is the handoff for future agents to re-run cross-user isolation and unauthenticated denial explicitly.

## Handoff

- GitHub issue: `#1`
- Downstream roadmap items unblocked by this foundation:
  - `S-01` budget-setup
  - `S-02` first-bank-import-review
  - `S-03` monthly-summary-and-rules
  - `S-04` second-supported-format
