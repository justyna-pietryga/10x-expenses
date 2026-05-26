create extension if not exists "pgcrypto";

create table public.budget_categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  percentage_limit numeric(5, 2) not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint budget_categories_name_not_blank check (btrim(name) <> ''),
  constraint budget_categories_percentage_limit_range check (percentage_limit >= 0 and percentage_limit <= 100),
  constraint budget_categories_user_name_unique unique (user_id, name),
  constraint budget_categories_id_user_unique unique (id, user_id)
);

create table public.monthly_incomes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  month date not null,
  amount numeric(14, 2) not null,
  is_estimated boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint monthly_incomes_month_is_month_start check (month = date_trunc('month', month)::date),
  constraint monthly_incomes_user_month_unique unique (user_id, month),
  constraint monthly_incomes_id_user_unique unique (id, user_id)
);

create table public.statement_import_batches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  bank text not null,
  period_start date not null,
  period_end date not null,
  source_filename text,
  imported_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint statement_import_batches_bank_not_blank check (btrim(bank) <> ''),
  constraint statement_import_batches_period_order check (period_end >= period_start),
  constraint statement_import_batches_user_bank_period_unique unique (user_id, bank, period_start, period_end),
  constraint statement_import_batches_id_user_unique unique (id, user_id)
);

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  import_batch_id uuid not null,
  category_id uuid,
  transaction_date date not null,
  title text not null,
  recipient text not null,
  amount numeric(14, 2) not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint transactions_title_not_blank check (btrim(title) <> ''),
  constraint transactions_recipient_not_blank check (btrim(recipient) <> ''),
  constraint transactions_import_batch_fk foreign key (import_batch_id, user_id)
    references public.statement_import_batches (id, user_id) on delete cascade,
  constraint transactions_category_fk foreign key (category_id, user_id)
    references public.budget_categories (id, user_id) on delete set null
);

create table public.categorization_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  target_category_id uuid not null,
  merchant_pattern text not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint categorization_rules_merchant_pattern_not_blank check (btrim(merchant_pattern) <> ''),
  constraint categorization_rules_user_pattern_unique unique (user_id, merchant_pattern),
  constraint categorization_rules_target_category_fk foreign key (target_category_id, user_id)
    references public.budget_categories (id, user_id) on delete cascade
);

create table public.monthly_summaries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  month date not null,
  total_income numeric(14, 2) not null default 0,
  total_spent numeric(14, 2) not null default 0,
  summary_snapshot jsonb not null default '{}'::jsonb,
  generated_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint monthly_summaries_month_is_month_start check (month = date_trunc('month', month)::date),
  constraint monthly_summaries_user_month_unique unique (user_id, month),
  constraint monthly_summaries_id_user_unique unique (id, user_id)
);

create index budget_categories_user_id_idx on public.budget_categories (user_id);
create index monthly_incomes_user_id_idx on public.monthly_incomes (user_id);
create index monthly_incomes_user_month_idx on public.monthly_incomes (user_id, month);
create index statement_import_batches_user_id_idx on public.statement_import_batches (user_id);
create index statement_import_batches_user_bank_period_idx on public.statement_import_batches (user_id, bank, period_start, period_end);
create index transactions_user_id_idx on public.transactions (user_id);
create index transactions_import_batch_id_idx on public.transactions (import_batch_id);
create index transactions_category_id_idx on public.transactions (category_id);
create index transactions_transaction_date_idx on public.transactions (transaction_date);
create index categorization_rules_user_id_idx on public.categorization_rules (user_id);
create index categorization_rules_target_category_id_idx on public.categorization_rules (target_category_id);
create index categorization_rules_merchant_pattern_idx on public.categorization_rules (merchant_pattern);
create index monthly_summaries_user_id_idx on public.monthly_summaries (user_id);
create index monthly_summaries_user_month_idx on public.monthly_summaries (user_id, month);

alter table public.budget_categories enable row level security;
alter table public.monthly_incomes enable row level security;
alter table public.statement_import_batches enable row level security;
alter table public.transactions enable row level security;
alter table public.categorization_rules enable row level security;
alter table public.monthly_summaries enable row level security;

create policy "budget_categories_select_own"
  on public.budget_categories
  for select
  using (auth.uid() = user_id);

create policy "budget_categories_insert_own"
  on public.budget_categories
  for insert
  with check (auth.uid() = user_id);

create policy "budget_categories_update_own"
  on public.budget_categories
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "budget_categories_delete_own"
  on public.budget_categories
  for delete
  using (auth.uid() = user_id);

create policy "monthly_incomes_select_own"
  on public.monthly_incomes
  for select
  using (auth.uid() = user_id);

create policy "monthly_incomes_insert_own"
  on public.monthly_incomes
  for insert
  with check (auth.uid() = user_id);

create policy "monthly_incomes_update_own"
  on public.monthly_incomes
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "monthly_incomes_delete_own"
  on public.monthly_incomes
  for delete
  using (auth.uid() = user_id);

create policy "statement_import_batches_select_own"
  on public.statement_import_batches
  for select
  using (auth.uid() = user_id);

create policy "statement_import_batches_insert_own"
  on public.statement_import_batches
  for insert
  with check (auth.uid() = user_id);

create policy "statement_import_batches_update_own"
  on public.statement_import_batches
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "statement_import_batches_delete_own"
  on public.statement_import_batches
  for delete
  using (auth.uid() = user_id);

create policy "transactions_select_own"
  on public.transactions
  for select
  using (auth.uid() = user_id);

create policy "transactions_insert_own"
  on public.transactions
  for insert
  with check (auth.uid() = user_id);

create policy "transactions_update_own"
  on public.transactions
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "transactions_delete_own"
  on public.transactions
  for delete
  using (auth.uid() = user_id);

create policy "categorization_rules_select_own"
  on public.categorization_rules
  for select
  using (auth.uid() = user_id);

create policy "categorization_rules_insert_own"
  on public.categorization_rules
  for insert
  with check (auth.uid() = user_id);

create policy "categorization_rules_update_own"
  on public.categorization_rules
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "categorization_rules_delete_own"
  on public.categorization_rules
  for delete
  using (auth.uid() = user_id);

create policy "monthly_summaries_select_own"
  on public.monthly_summaries
  for select
  using (auth.uid() = user_id);

create policy "monthly_summaries_insert_own"
  on public.monthly_summaries
  for insert
  with check (auth.uid() = user_id);

create policy "monthly_summaries_update_own"
  on public.monthly_summaries
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "monthly_summaries_delete_own"
  on public.monthly_summaries
  for delete
  using (auth.uid() = user_id);
