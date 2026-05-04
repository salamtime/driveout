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

create table if not exists public.platform_business_accounts (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique references auth.users(id) on delete cascade,
  full_name text,
  email text not null,
  company_name text,
  phone text,
  account_type text not null default 'business_owner',
  application_status text not null default 'pending',
  approval_status text not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  approved_at timestamptz,
  approved_by uuid references auth.users(id) on delete set null,
  rejection_reason text,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  constraint platform_business_accounts_account_type_check
    check (account_type in ('business_owner', 'operator', 'business', 'rental_business')),
  constraint platform_business_accounts_application_status_check
    check (application_status in ('pending', 'approved', 'rejected', 'needs_info', 'suspended')),
  constraint platform_business_accounts_approval_status_check
    check (approval_status in ('pending', 'approved', 'rejected', 'needs_info', 'suspended'))
);

create index if not exists idx_platform_business_accounts_status
  on public.platform_business_accounts (application_status, approval_status);

create index if not exists idx_platform_business_accounts_email
  on public.platform_business_accounts (lower(email));

create table if not exists public.platform_tenants (
  id uuid primary key default gen_random_uuid(),
  business_account_id uuid not null unique references public.platform_business_accounts(id) on delete cascade,
  tenant_key text not null unique,
  tenant_name text not null,
  tenant_slug text not null unique,
  tenant_status text not null default 'provisioning',
  db_provider text not null default 'supabase',
  tenant_project_ref text,
  tenant_app_url text,
  tenant_api_url text,
  tenant_anon_key text,
  tenant_service_role_secret_ref text,
  tenant_database_name text,
  schema_version text,
  provisioned_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  constraint platform_tenants_status_check
    check (tenant_status in ('provisioning', 'active', 'suspended', 'archived', 'failed')),
  constraint platform_tenants_db_provider_check
    check (db_provider in ('supabase', 'postgres'))
);

create index if not exists idx_platform_tenants_status
  on public.platform_tenants (tenant_status);

create table if not exists public.platform_business_subscriptions (
  id uuid primary key default gen_random_uuid(),
  business_account_id uuid not null unique references public.platform_business_accounts(id) on delete cascade,
  plan_type text not null default 'starter',
  subscription_status text not null default 'trial',
  billing_status text not null default 'none',
  trial_started_at timestamptz,
  trial_ends_at timestamptz,
  subscription_started_at timestamptz,
  subscription_ends_at timestamptz,
  suspended_at timestamptz,
  plan_limits jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  constraint platform_business_subscriptions_plan_type_check
    check (plan_type in ('free', 'starter', 'growth', 'pro')),
  constraint platform_business_subscriptions_subscription_status_check
    check (subscription_status in ('trial', 'active', 'expired', 'cancelled', 'suspended')),
  constraint platform_business_subscriptions_billing_status_check
    check (billing_status in ('none', 'active', 'failed'))
);

create index if not exists idx_platform_business_subscriptions_status
  on public.platform_business_subscriptions (subscription_status, billing_status);

create table if not exists public.platform_tenant_provisioning_jobs (
  id uuid primary key default gen_random_uuid(),
  business_account_id uuid not null references public.platform_business_accounts(id) on delete cascade,
  tenant_id uuid references public.platform_tenants(id) on delete set null,
  job_type text not null,
  job_status text not null default 'queued',
  payload jsonb not null default '{}'::jsonb,
  result jsonb not null default '{}'::jsonb,
  error_message text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint platform_tenant_provisioning_jobs_type_check
    check (job_type in (
      'create_tenant',
      'seed_schema',
      'retry_seed',
      'suspend_tenant',
      'archive_tenant',
      'schema_plan',
      'schema_upgrade',
      'schema_verify',
      'schema_drift'
    )),
  constraint platform_tenant_provisioning_jobs_status_check
    check (job_status in ('queued', 'running', 'completed', 'failed'))
);

create index if not exists idx_platform_tenant_provisioning_jobs_lookup
  on public.platform_tenant_provisioning_jobs (business_account_id, job_status, job_type);

create table if not exists public.platform_tenant_audit_log (
  id uuid primary key default gen_random_uuid(),
  business_account_id uuid references public.platform_business_accounts(id) on delete set null,
  tenant_id uuid references public.platform_tenants(id) on delete set null,
  performed_by uuid references auth.users(id) on delete set null,
  action text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_platform_tenant_audit_log_business_account
  on public.platform_tenant_audit_log (business_account_id, created_at desc);

create index if not exists idx_platform_tenant_audit_log_tenant
  on public.platform_tenant_audit_log (tenant_id, created_at desc);

drop trigger if exists trg_platform_business_accounts_touch_updated_at on public.platform_business_accounts;
create trigger trg_platform_business_accounts_touch_updated_at
before update on public.platform_business_accounts
for each row
execute function public.platform_touch_updated_at();

drop trigger if exists trg_platform_tenants_touch_updated_at on public.platform_tenants;
create trigger trg_platform_tenants_touch_updated_at
before update on public.platform_tenants
for each row
execute function public.platform_touch_updated_at();

drop trigger if exists trg_platform_business_subscriptions_touch_updated_at on public.platform_business_subscriptions;
create trigger trg_platform_business_subscriptions_touch_updated_at
before update on public.platform_business_subscriptions
for each row
execute function public.platform_touch_updated_at();

drop trigger if exists trg_platform_tenant_provisioning_jobs_touch_updated_at on public.platform_tenant_provisioning_jobs;
create trigger trg_platform_tenant_provisioning_jobs_touch_updated_at
before update on public.platform_tenant_provisioning_jobs
for each row
execute function public.platform_touch_updated_at();

insert into public.platform_business_accounts (
  auth_user_id,
  full_name,
  email,
  company_name,
  phone,
  account_type,
  application_status,
  approval_status,
  approved_at,
  approved_by,
  rejection_reason,
  metadata
)
select
  au.id,
  apu.full_name,
  au.email,
  coalesce(au.raw_user_meta_data->>'company_name', au.raw_user_meta_data->>'business_name', apu.full_name, au.email),
  apu.phone_number,
  lower(coalesce(au.raw_user_meta_data->>'account_type', au.raw_app_meta_data->>'account_type', 'business_owner')) as account_type,
  case
    when lower(coalesce(au.raw_user_meta_data->>'verification_status', au.raw_app_meta_data->>'verification_status', 'pending')) in ('approved', 'rejected', 'needs_info', 'suspended')
      then lower(coalesce(au.raw_user_meta_data->>'verification_status', au.raw_app_meta_data->>'verification_status', 'pending'))
    else 'pending'
  end as application_status,
  case
    when lower(coalesce(au.raw_user_meta_data->>'verification_status', au.raw_app_meta_data->>'verification_status', 'pending')) in ('approved', 'rejected', 'needs_info', 'suspended')
      then lower(coalesce(au.raw_user_meta_data->>'verification_status', au.raw_app_meta_data->>'verification_status', 'pending'))
    else 'pending'
  end as approval_status,
  apu.approved_at,
  apu.approved_by,
  apu.rejection_reason,
  jsonb_strip_nulls(
    jsonb_build_object(
      'source', 'auth_backfill',
      'user_metadata', coalesce(au.raw_user_meta_data, '{}'::jsonb),
      'app_metadata', coalesce(au.raw_app_meta_data, '{}'::jsonb)
    )
  )
from auth.users au
left join public.app_b30c02e74da644baad4668e3587d86b1_users apu
  on apu.id = au.id
where lower(coalesce(au.raw_user_meta_data->>'account_type', au.raw_app_meta_data->>'account_type', '')) in (
  'business_owner',
  'operator',
  'business',
  'rental_business'
)
on conflict (auth_user_id) do update
set
  full_name = coalesce(excluded.full_name, public.platform_business_accounts.full_name),
  email = excluded.email,
  company_name = coalesce(excluded.company_name, public.platform_business_accounts.company_name),
  phone = coalesce(excluded.phone, public.platform_business_accounts.phone),
  account_type = excluded.account_type,
  application_status = excluded.application_status,
  approval_status = excluded.approval_status,
  approved_at = coalesce(excluded.approved_at, public.platform_business_accounts.approved_at),
  approved_by = coalesce(excluded.approved_by, public.platform_business_accounts.approved_by),
  rejection_reason = coalesce(excluded.rejection_reason, public.platform_business_accounts.rejection_reason),
  metadata = public.platform_business_accounts.metadata || excluded.metadata;

insert into public.platform_business_subscriptions (
  business_account_id,
  plan_type,
  subscription_status,
  billing_status,
  trial_started_at,
  trial_ends_at,
  subscription_started_at,
  suspended_at,
  plan_limits,
  metadata
)
select
  pba.id,
  case
    when lower(coalesce(au.raw_user_meta_data->>'plan_type', au.raw_app_meta_data->>'plan_type', 'starter')) in ('free', 'starter', 'growth', 'pro')
      then lower(coalesce(au.raw_user_meta_data->>'plan_type', au.raw_app_meta_data->>'plan_type', 'starter'))
    else 'starter'
  end as plan_type,
  case
    when lower(coalesce(au.raw_user_meta_data->>'subscription_status', au.raw_app_meta_data->>'subscription_status', 'trial')) in ('trial', 'active', 'expired', 'cancelled', 'suspended')
      then lower(coalesce(au.raw_user_meta_data->>'subscription_status', au.raw_app_meta_data->>'subscription_status', 'trial'))
    else 'trial'
  end as subscription_status,
  case
    when lower(coalesce(au.raw_user_meta_data->>'billing_status', au.raw_app_meta_data->>'billing_status', 'none')) in ('none', 'active', 'failed')
      then lower(coalesce(au.raw_user_meta_data->>'billing_status', au.raw_app_meta_data->>'billing_status', 'none'))
    else 'none'
  end as billing_status,
  apu.trial_started_at,
  apu.trial_ends_at,
  apu.subscription_started_at,
  apu.suspended_at,
  jsonb_strip_nulls(
    jsonb_build_object(
      'vehicles', case when lower(coalesce(au.raw_user_meta_data->>'plan_type', au.raw_app_meta_data->>'plan_type', 'starter')) = 'pro' then 100 when lower(coalesce(au.raw_user_meta_data->>'plan_type', au.raw_app_meta_data->>'plan_type', 'starter')) = 'growth' then 30 when lower(coalesce(au.raw_user_meta_data->>'plan_type', au.raw_app_meta_data->>'plan_type', 'starter')) = 'free' then 5 else 10 end,
      'staff', case when lower(coalesce(au.raw_user_meta_data->>'plan_type', au.raw_app_meta_data->>'plan_type', 'starter')) = 'pro' then 30 when lower(coalesce(au.raw_user_meta_data->>'plan_type', au.raw_app_meta_data->>'plan_type', 'starter')) = 'growth' then 10 when lower(coalesce(au.raw_user_meta_data->>'plan_type', au.raw_app_meta_data->>'plan_type', 'starter')) = 'free' then 1 else 3 end,
      'listings', case when lower(coalesce(au.raw_user_meta_data->>'plan_type', au.raw_app_meta_data->>'plan_type', 'starter')) = 'pro' then 100 when lower(coalesce(au.raw_user_meta_data->>'plan_type', au.raw_app_meta_data->>'plan_type', 'starter')) = 'growth' then 20 when lower(coalesce(au.raw_user_meta_data->>'plan_type', au.raw_app_meta_data->>'plan_type', 'starter')) = 'free' then 0 else 5 end,
      'storage_gb', case when lower(coalesce(au.raw_user_meta_data->>'plan_type', au.raw_app_meta_data->>'plan_type', 'starter')) = 'pro' then 250 when lower(coalesce(au.raw_user_meta_data->>'plan_type', au.raw_app_meta_data->>'plan_type', 'starter')) = 'growth' then 50 when lower(coalesce(au.raw_user_meta_data->>'plan_type', au.raw_app_meta_data->>'plan_type', 'starter')) = 'free' then 2 else 10 end
    )
  ),
  jsonb_build_object('source', 'auth_backfill')
from public.platform_business_accounts pba
join auth.users au
  on au.id = pba.auth_user_id
left join public.app_b30c02e74da644baad4668e3587d86b1_users apu
  on apu.id = au.id
on conflict (business_account_id) do update
set
  plan_type = excluded.plan_type,
  subscription_status = excluded.subscription_status,
  billing_status = excluded.billing_status,
  trial_started_at = coalesce(excluded.trial_started_at, public.platform_business_subscriptions.trial_started_at),
  trial_ends_at = coalesce(excluded.trial_ends_at, public.platform_business_subscriptions.trial_ends_at),
  subscription_started_at = coalesce(excluded.subscription_started_at, public.platform_business_subscriptions.subscription_started_at),
  suspended_at = coalesce(excluded.suspended_at, public.platform_business_subscriptions.suspended_at),
  plan_limits = case
    when public.platform_business_subscriptions.plan_limits = '{}'::jsonb then excluded.plan_limits
    else public.platform_business_subscriptions.plan_limits
  end,
  metadata = public.platform_business_subscriptions.metadata || excluded.metadata;

insert into public.platform_tenants (
  business_account_id,
  tenant_key,
  tenant_name,
  tenant_slug,
  tenant_status,
  db_provider,
  schema_version,
  provisioned_at,
  metadata
)
select
  pba.id,
  'tenant_' || replace(o.id::text, '-', ''),
  o.name,
  o.slug,
  case
    when o.organization_status = 'active' then 'active'
    when o.organization_status = 'suspended' then 'suspended'
    else 'provisioning'
  end as tenant_status,
  'supabase',
  'v1',
  o.created_at,
  jsonb_build_object(
    'source', 'organization_backfill',
    'organization_id', o.id
  )
from public.platform_business_accounts pba
join public.app_organizations o
  on o.owner_user_id = pba.auth_user_id
 where o.is_platform_organization = false
on conflict (business_account_id) do update
set
  tenant_name = excluded.tenant_name,
  tenant_slug = excluded.tenant_slug,
  tenant_status = excluded.tenant_status,
  metadata = public.platform_tenants.metadata || excluded.metadata;

insert into public.platform_tenant_provisioning_jobs (
  business_account_id,
  tenant_id,
  job_type,
  job_status,
  payload,
  result,
  started_at,
  finished_at
)
select
  pba.id,
  pt.id,
  'create_tenant',
  case
    when pt.id is not null then 'completed'
    else 'queued'
  end,
  jsonb_build_object('source', 'migration_backfill'),
  case
    when pt.id is not null then jsonb_build_object('tenant_id', pt.id)
    else '{}'::jsonb
  end,
  case when pt.id is not null then coalesce(pt.provisioned_at, pt.created_at) else null end,
  case when pt.id is not null then coalesce(pt.provisioned_at, pt.updated_at) else null end
from public.platform_business_accounts pba
left join public.platform_tenants pt
  on pt.business_account_id = pba.id
where not exists (
  select 1
  from public.platform_tenant_provisioning_jobs job
  where job.business_account_id = pba.id
    and job.job_type = 'create_tenant'
);

notify pgrst, 'reload schema';
