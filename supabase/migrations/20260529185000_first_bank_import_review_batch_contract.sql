alter table public.statement_import_batches
  add column statement_month date,
  add column review_completed_at timestamptz;

update public.statement_import_batches
set statement_month = date_trunc('month', period_start)::date
where statement_month is null;

alter table public.statement_import_batches
  alter column statement_month set not null;

alter table public.statement_import_batches
  add constraint statement_import_batches_month_is_month_start
    check (statement_month = date_trunc('month', statement_month)::date),
  drop constraint statement_import_batches_user_bank_period_unique,
  add constraint statement_import_batches_user_bank_month_unique unique (user_id, bank, statement_month);

drop index if exists public.statement_import_batches_user_bank_period_idx;

