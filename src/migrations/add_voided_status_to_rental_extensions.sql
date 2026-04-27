alter table public.rental_extensions
add column if not exists voided_at timestamptz,
add column if not exists voided_by uuid,
add column if not exists void_reason text;

do $$
declare
  constraint_name text;
begin
  select conname
  into constraint_name
  from pg_constraint
  where conrelid = 'public.rental_extensions'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) ilike '%status%';

  if constraint_name is not null then
    execute format('alter table public.rental_extensions drop constraint %I', constraint_name);
  end if;

  alter table public.rental_extensions
  add constraint rental_extensions_status_check
  check (status in ('pending', 'approved', 'rejected', 'active', 'completed', 'voided'));
end $$;
