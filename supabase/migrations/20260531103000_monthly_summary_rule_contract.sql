alter table public.budget_categories
  add column carryover_enabled boolean not null default false;

alter table public.categorization_rules
  add column match_field text,
  add column match_text text;

update public.categorization_rules
set
  match_field = 'both',
  match_text = merchant_pattern
where match_field is null
   or match_text is null;

alter table public.categorization_rules
  alter column match_field set not null,
  alter column match_text set not null;

alter table public.categorization_rules
  add constraint categorization_rules_match_field_check
    check (match_field in ('title', 'recipient', 'both')),
  add constraint categorization_rules_match_text_not_blank
    check (btrim(match_text) <> '');

alter table public.categorization_rules
  drop constraint categorization_rules_user_pattern_unique;

drop index if exists public.categorization_rules_merchant_pattern_idx;

alter table public.categorization_rules
  drop constraint categorization_rules_merchant_pattern_not_blank;

alter table public.categorization_rules
  drop column merchant_pattern;

alter table public.categorization_rules
  add constraint categorization_rules_user_match_unique unique (user_id, match_field, match_text);

create index categorization_rules_match_field_text_idx
  on public.categorization_rules (user_id, match_field, match_text);
