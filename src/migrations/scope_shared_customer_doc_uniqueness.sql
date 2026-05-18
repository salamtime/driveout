begin;

update public.app_4c3a7a6153_customers customers
set organization_id = derived.organization_id
from (
  select
    id,
    (regexp_match(id_scan_url, 'tenant/([0-9a-fA-F-]{36})/'))[1]::uuid as organization_id
  from public.app_4c3a7a6153_customers
  where organization_id is null
    and id_scan_url ~* 'tenant/[0-9a-f-]{36}/'
) as derived
where customers.id = derived.id
  and derived.organization_id is not null
  and customers.organization_id is null;

update public.app_4c3a7a6153_customers customers
set organization_id = rental_scope.organization_id
from (
  select
    rentals.customer_id,
    min(rentals.organization_id::text)::uuid as organization_id
  from public.app_4c3a7a6153_rentals rentals
  where rentals.customer_id is not null
    and rentals.organization_id is not null
  group by rentals.customer_id
  having count(distinct rentals.organization_id) = 1
) as rental_scope
where customers.id = rental_scope.customer_id
  and customers.organization_id is null;

drop index if exists public.ux_customers_person_key;

create unique index if not exists ux_customers_person_key
on public.app_4c3a7a6153_customers (
  organization_id,
  (
    coalesce(
      nullif(trim(both from id_number), ''),
      nullif(trim(both from licence_number), '')
    )
  )
)
where organization_id is not null
  and coalesce(
    nullif(trim(both from id_number), ''),
    nullif(trim(both from licence_number), '')
  ) is not null;

notify pgrst, 'reload schema';

commit;
