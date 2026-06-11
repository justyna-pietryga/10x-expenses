alter table public.transactions
  add column categorized_by_rule_id uuid null;

alter table public.transactions
  add constraint transactions_categorized_by_rule_fk
  foreign key (categorized_by_rule_id)
  references public.categorization_rules (id)
  on delete set null;

create index transactions_categorized_by_rule_id_idx
  on public.transactions (categorized_by_rule_id);
