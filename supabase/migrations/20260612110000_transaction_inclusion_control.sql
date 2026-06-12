alter table public.transactions
  add column inclusion_status text not null default 'included';

update public.transactions
set inclusion_status = 'included'
where inclusion_status is null;

alter table public.transactions
  add constraint transactions_inclusion_status_check
    check (inclusion_status in ('included', 'excluded'));
