do $$
begin
  if not exists (select 1 from pg_type where typname = 'driveout_verification_status') then
    create type public.driveout_verification_status as enum ('pending', 'approved', 'rejected', 'needs_info');
  end if;

  if not exists (select 1 from pg_type where typname = 'driveout_subscription_plan') then
    create type public.driveout_subscription_plan as enum ('free_trial', 'saas', 'saas_web');
  end if;

  if not exists (select 1 from pg_type where typname = 'driveout_subscription_status') then
    create type public.driveout_subscription_status as enum ('trial', 'active', 'expired', 'cancelled');
  end if;
end $$;

alter table public.app_b30c02e74da644baad4668e3587d86b1_users
  add column if not exists verification_status public.driveout_verification_status not null default 'pending',
  add column if not exists approved_at timestamptz,
  add column if not exists approved_by uuid references auth.users(id) on delete set null,
  add column if not exists rejection_reason text,
  add column if not exists subscription_plan public.driveout_subscription_plan,
  add column if not exists subscription_status public.driveout_subscription_status,
  add column if not exists trial_started_at timestamptz,
  add column if not exists trial_ends_at timestamptz,
  add column if not exists subscription_started_at timestamptz;

create index if not exists idx_driveout_users_verification_status
  on public.app_b30c02e74da644baad4668e3587d86b1_users (verification_status);

create index if not exists idx_driveout_users_subscription_status
  on public.app_b30c02e74da644baad4668e3587d86b1_users (subscription_status);

create index if not exists idx_driveout_users_subscription_plan
  on public.app_b30c02e74da644baad4668e3587d86b1_users (subscription_plan);

update public.app_b30c02e74da644baad4668e3587d86b1_users
set
  verification_status = coalesce(verification_status, 'pending'::public.driveout_verification_status)
where verification_status is null;

notify pgrst, 'reload schema';
