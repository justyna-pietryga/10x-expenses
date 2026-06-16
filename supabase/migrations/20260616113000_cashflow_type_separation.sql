alter table public.transactions
  add column cashflow_type text not null default 'expense',
  add constraint transactions_cashflow_type_check
    check (cashflow_type in ('expense', 'income'));

update public.transactions
set cashflow_type = case
  when amount < 0 then 'expense'
  else 'income'
end;
