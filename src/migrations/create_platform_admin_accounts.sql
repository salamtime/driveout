create extension if not exists pgcrypto;

create or replace function public.platform_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.platform_admin_accounts (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  platform_role text not null default 'platform_admin',
  access_enabled boolean not null default true,
  permissions jsonb not null default '{}'::jsonb,
  notes text,
  granted_by uuid references auth.users(id) on delete set null,
  disabled_by uuid references auth.users(id) on delete set null,
  disabled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  constraint platform_admin_accounts_role_check
    check (platform_role in ('platform_owner', 'platform_admin'))
);

create index if not exists idx_platform_admin_accounts_role_enabled
  on public.platform_admin_accounts (platform_role, access_enabled);

create index if not exists idx_platform_admin_accounts_email
  on public.platform_admin_accounts (lower(email));

drop trigger if exists trg_platform_admin_accounts_touch_updated_at on public.platform_admin_accounts;
create trigger trg_platform_admin_accounts_touch_updated_at
before update on public.platform_admin_accounts
for each row
execute function public.platform_touch_updated_at();

grant usage on schema public to service_role;
grant select, insert, update, delete on table public.platform_admin_accounts to service_role;

notify pgrst, 'reload schema';
