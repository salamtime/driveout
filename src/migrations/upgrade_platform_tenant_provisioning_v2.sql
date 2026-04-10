-- Production tenant provisioning upgrade.
-- This keeps the existing platform_* registry as the source of truth while
-- exposing the tenant fields required by the dedicated workspace flow.

alter table public.platform_tenants
  add column if not exists owner_user_id uuid references auth.users(id) on delete set null,
  add column if not exists provisioning_started_at timestamptz,
  add column if not exists provisioning_completed_at timestamptz,
  add column if not exists provisioning_error text;

update public.platform_tenants pt
set owner_user_id = pba.auth_user_id
from public.platform_business_accounts pba
where pt.business_account_id = pba.id
  and pt.owner_user_id is null;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'platform_tenants_status_check'
      and conrelid = 'public.platform_tenants'::regclass
  ) then
    alter table public.platform_tenants
      drop constraint platform_tenants_status_check;
  end if;
end $$;

alter table public.platform_tenants
  add constraint platform_tenants_status_check
  check (tenant_status in ('pending', 'provisioning', 'active', 'failed', 'suspended', 'archived'));

create index if not exists idx_platform_tenants_owner_user
  on public.platform_tenants (owner_user_id);

create table if not exists public.platform_tenant_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.platform_tenants(id) on delete cascade,
  event_type text not null,
  actor_user_id uuid references auth.users(id) on delete set null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint platform_tenant_events_type_check
    check (event_type in ('created', 'provisioning_started', 'activated', 'failed', 'suspended', 'reactivated'))
);

create index if not exists idx_platform_tenant_events_tenant
  on public.platform_tenant_events (tenant_id, created_at desc);

alter table public.app_b30c02e74da644baad4668e3587d86b1_users
  add column if not exists tenant_id uuid references public.platform_tenants(id) on delete set null;

update public.app_b30c02e74da644baad4668e3587d86b1_users apu
set tenant_id = pt.id
from public.platform_tenants pt
where apu.id = pt.owner_user_id
  and apu.tenant_id is distinct from pt.id;

alter table public.platform_tenants enable row level security;
alter table public.platform_tenant_events enable row level security;

drop policy if exists "owners can read own tenant" on public.platform_tenants;
create policy "owners can read own tenant"
on public.platform_tenants
for select
to authenticated
using (owner_user_id = auth.uid());

drop policy if exists "owners can read own tenant events" on public.platform_tenant_events;
create policy "owners can read own tenant events"
on public.platform_tenant_events
for select
to authenticated
using (
  exists (
    select 1
    from public.platform_tenants pt
    where pt.id = platform_tenant_events.tenant_id
      and pt.owner_user_id = auth.uid()
  )
);

grant usage on schema public to service_role;
grant select, insert, update, delete on table public.platform_tenants to service_role;
grant select, insert, update, delete on table public.platform_tenant_events to service_role;
grant select, update on table public.app_b30c02e74da644baad4668e3587d86b1_users to service_role;

notify pgrst, 'reload schema';
