begin;

create table if not exists public.app_4c3a7a6153_rental_completion_snapshots (
  id uuid primary key default gen_random_uuid(),
  rental_id uuid not null references public.app_4c3a7a6153_rentals(id) on delete cascade,
  organization_id uuid,
  vehicle_id bigint,
  snapshot_reason text not null default 'before_completion',
  rental_status_before text,
  vehicle_status_before text,
  rental_snapshot jsonb not null default '{}'::jsonb,
  vehicle_snapshot jsonb not null default '{}'::jsonb,
  completion_payload jsonb not null default '{}'::jsonb,
  created_by_user_id uuid,
  created_by_name text,
  created_at timestamptz not null default now(),
  reinstated_at timestamptz,
  reinstated_by_user_id uuid,
  reinstated_by_name text,
  reinstatement_note text
);

create index if not exists rental_completion_snapshots_rental_idx
  on public.app_4c3a7a6153_rental_completion_snapshots (rental_id, created_at desc);

create index if not exists rental_completion_snapshots_org_idx
  on public.app_4c3a7a6153_rental_completion_snapshots (organization_id);

create index if not exists rental_completion_snapshots_vehicle_idx
  on public.app_4c3a7a6153_rental_completion_snapshots (vehicle_id);

alter table public.app_4c3a7a6153_rental_completion_snapshots enable row level security;

grant select, insert, update, delete on public.app_4c3a7a6153_rental_completion_snapshots to authenticated;
grant all on public.app_4c3a7a6153_rental_completion_snapshots to service_role;

drop policy if exists "rental completion snapshots select" on public.app_4c3a7a6153_rental_completion_snapshots;
drop policy if exists "rental completion snapshots insert" on public.app_4c3a7a6153_rental_completion_snapshots;
drop policy if exists "rental completion snapshots update" on public.app_4c3a7a6153_rental_completion_snapshots;
drop policy if exists "rental completion snapshots delete" on public.app_4c3a7a6153_rental_completion_snapshots;

create policy "rental completion snapshots select"
on public.app_4c3a7a6153_rental_completion_snapshots
for select
to authenticated
using (
  public.app_is_platform_admin()
  or public.app_has_current_organization_access(organization_id)
);

create policy "rental completion snapshots insert"
on public.app_4c3a7a6153_rental_completion_snapshots
for insert
to authenticated
with check (
  public.app_is_platform_admin()
  or public.app_can_manage_current_organization(organization_id)
);

create policy "rental completion snapshots update"
on public.app_4c3a7a6153_rental_completion_snapshots
for update
to authenticated
using (
  public.app_is_platform_admin()
  or public.app_can_manage_current_organization(organization_id)
)
with check (
  public.app_is_platform_admin()
  or public.app_can_manage_current_organization(organization_id)
);

create policy "rental completion snapshots delete"
on public.app_4c3a7a6153_rental_completion_snapshots
for delete
to authenticated
using (
  public.app_is_platform_admin()
  or public.app_can_manage_current_organization(organization_id)
);

commit;
