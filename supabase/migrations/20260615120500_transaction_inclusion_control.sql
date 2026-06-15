alter table public.transactions
  add column is_included boolean not null default true;
