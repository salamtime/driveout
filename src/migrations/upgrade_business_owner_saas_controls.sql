do $$
begin
  if not exists (select 1 from pg_type where typname = 'driveout_plan_type') then
    create type public.driveout_plan_type as enum ('starter', 'growth', 'pro');
  end if;

  if not exists (select 1 from pg_type where typname = 'driveout_billing_status') then
    create type public.driveout_billing_status as enum ('none', 'active', 'failed');
  end if;
end $$;

do $$
begin
  begin
    alter type public.driveout_subscription_status add value if not exists 'suspended';
  exception
    when duplicate_object then null;
  end;
end $$;

alter table public.app_b30c02e74da644baad4668e3587d86b1_users
  add column if not exists plan_type public.driveout_plan_type not null default 'starter',
  add column if not exists billing_status public.driveout_billing_status not null default 'none',
  add column if not exists suspended_at timestamptz,
  add column if not exists suspension_reason text,
  add column if not exists plan_changed_at timestamptz;

create index if not exists idx_driveout_users_plan_type
  on public.app_b30c02e74da644baad4668e3587d86b1_users (plan_type);

create index if not exists idx_driveout_users_billing_status
  on public.app_b30c02e74da644baad4668e3587d86b1_users (billing_status);

create index if not exists idx_driveout_users_suspended_at
  on public.app_b30c02e74da644baad4668e3587d86b1_users (suspended_at);

notify pgrst, 'reload schema';
