begin;

alter table public.pricing_tiers
  alter column min_hours type numeric(4,1) using min_hours::numeric,
  alter column max_hours type numeric(4,1) using max_hours::numeric;

commit;
