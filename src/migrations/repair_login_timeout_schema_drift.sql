begin;

create extension if not exists pgcrypto;

do $repair$
declare
  platform_org_id uuid;
begin
  if not exists (
    select 1
    from pg_type
    where typname = 'driveout_plan_type'
  ) then
    create type public.driveout_plan_type as enum ('free', 'starter', 'growth', 'pro');
  end if;

  alter table public.app_b30c02e74da644baad4668e3587d86b1_users
    add column if not exists plan_type public.driveout_plan_type not null default 'starter';

  update public.app_b30c02e74da644baad4668e3587d86b1_users
  set plan_type = 'starter'
  where plan_type is null;

  alter table public.app_b30c02e74da644baad4668e3587d86b1_users
    alter column plan_type set default 'starter';

  alter table public.platform_tenants
    add column if not exists tenancy_mode text;

  update public.platform_tenants
  set tenancy_mode = coalesce(nullif(trim(tenancy_mode), ''), metadata->>'tenancy_mode', 'shared')
  where tenancy_mode is null
     or nullif(trim(tenancy_mode), '') is null;

  alter table public.platform_tenants
    alter column tenancy_mode set default 'shared';

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'platform_tenants'
      and column_name = 'tenancy_mode'
  ) then
    alter table public.platform_tenants
      alter column tenancy_mode set not null;
  end if;

  if to_regclass('public.app_organizations') is not null then
    select id
    into platform_org_id
    from public.app_organizations
    where coalesce(is_platform_organization, false) = true
    order by created_at asc nulls last
    limit 1;
  end if;

  if to_regclass('public.app_687f658e98_tour_bookings') is not null then
    alter table public.app_687f658e98_tour_bookings
      add column if not exists organization_id uuid;

    if to_regclass('public.app_organizations') is not null
       and not exists (
         select 1
         from pg_constraint
         where conname = 'app_687f658e98_tour_bookings_organization_id_fkey'
           and conrelid = 'public.app_687f658e98_tour_bookings'::regclass
       ) then
      alter table public.app_687f658e98_tour_bookings
        add constraint app_687f658e98_tour_bookings_organization_id_fkey
        foreign key (organization_id)
        references public.app_organizations(id)
        on delete set null;
    end if;

    create index if not exists idx_app_687f658e98_tour_bookings_organization_id
      on public.app_687f658e98_tour_bookings (organization_id);

    if platform_org_id is not null then
      update public.app_687f658e98_tour_bookings
      set organization_id = platform_org_id
      where organization_id is null;
    end if;
  end if;
end
$repair$;

do $cron$
declare
  scheduled_job record;
begin
  if to_regnamespace('cron') is null then
    return;
  end if;

  if to_regnamespace('net') is not null then
    return;
  end if;

  for scheduled_job in
    select jobid
    from cron.job
    where command ilike '%net.http_post%'
      and command ilike '%auto-expire-rentals%'
  loop
    perform cron.unschedule(scheduled_job.jobid);
  end loop;
end
$cron$;

notify pgrst, 'reload schema';

commit;
