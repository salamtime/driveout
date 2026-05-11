begin;

alter table public.app_4c3a7a6153_customers
  add column if not exists organization_id uuid null references public.app_organizations(id) on delete restrict;

create index if not exists idx_app_customers_organization_id
  on public.app_4c3a7a6153_customers(organization_id);

create or replace function public.app_assign_customer_organization()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  current_org_id uuid;
  current_org_is_platform boolean;
begin
  if new.organization_id is not null then
    return new;
  end if;

  current_org_id := public.app_current_organization_id();

  if current_org_id is null then
    return new;
  end if;

  select coalesce(orgs.is_platform_organization, false)
    into current_org_is_platform
  from public.app_organizations orgs
  where orgs.id = current_org_id;

  if coalesce(current_org_is_platform, false) = false then
    new.organization_id := current_org_id;
  end if;

  return new;
end;
$$;

drop trigger if exists app_assign_customer_organization_before_insert
  on public.app_4c3a7a6153_customers;

create trigger app_assign_customer_organization_before_insert
  before insert on public.app_4c3a7a6153_customers
  for each row
  execute function public.app_assign_customer_organization();

alter table public.app_4c3a7a6153_customers enable row level security;
alter table public.app_4c3a7a6153_customers force row level security;

do $$
declare
  policy_record record;
begin
  for policy_record in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'app_4c3a7a6153_customers'
  loop
    execute format(
      'drop policy if exists %I on public.app_4c3a7a6153_customers',
      policy_record.policyname
    );
  end loop;
end $$;

create policy "shared tenant select app_4c3a7a6153_customers"
on public.app_4c3a7a6153_customers
for select
to authenticated
using (public.app_has_current_organization_access(organization_id));

create policy "shared tenant insert app_4c3a7a6153_customers"
on public.app_4c3a7a6153_customers
for insert
to authenticated
with check (public.app_has_current_organization_access(organization_id));

create policy "shared tenant update app_4c3a7a6153_customers"
on public.app_4c3a7a6153_customers
for update
to authenticated
using (public.app_can_manage_current_organization(organization_id))
with check (public.app_can_manage_current_organization(organization_id));

create policy "shared tenant delete app_4c3a7a6153_customers"
on public.app_4c3a7a6153_customers
for delete
to authenticated
using (public.app_can_manage_current_organization(organization_id));

grant execute on function public.app_assign_customer_organization() to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
