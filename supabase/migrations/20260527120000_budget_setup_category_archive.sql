alter table public.budget_categories
  add column archived_at timestamptz;

create index budget_categories_user_archived_at_idx
  on public.budget_categories (user_id, archived_at);
