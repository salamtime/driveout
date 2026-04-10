-- Backfill business-owner requests that were created before the platform tenant
-- registry existed. This keeps legacy applicants visible in the new admin flow.

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
  coalesce(apu.full_name, au.raw_user_meta_data->>'full_name', au.email),
  au.email,
  coalesce(au.raw_user_meta_data->>'company_name', au.raw_user_meta_data->>'business_name', apu.full_name, au.email),
  coalesce(apu.phone_number, au.raw_user_meta_data->>'phone'),
  case
    when lower(coalesce(au.raw_user_meta_data->>'account_type', au.raw_app_meta_data->>'account_type', '')) in ('business_owner', 'operator', 'business', 'rental_business')
      then lower(coalesce(au.raw_user_meta_data->>'account_type', au.raw_app_meta_data->>'account_type', ''))
    else 'business_owner'
  end,
  case
    when lower(coalesce(
      au.raw_user_meta_data->>'verification_status',
      au.raw_app_meta_data->>'verification_status',
      au.raw_user_meta_data->>'certification_request_status',
      au.raw_app_meta_data->>'certification_request_status',
      'pending'
    )) in ('approved', 'rejected', 'needs_info', 'suspended')
      then lower(coalesce(
        au.raw_user_meta_data->>'verification_status',
        au.raw_app_meta_data->>'verification_status',
        au.raw_user_meta_data->>'certification_request_status',
        au.raw_app_meta_data->>'certification_request_status',
        'pending'
      ))
    else 'pending'
  end,
  case
    when lower(coalesce(
      au.raw_user_meta_data->>'verification_status',
      au.raw_app_meta_data->>'verification_status',
      au.raw_user_meta_data->>'certification_request_status',
      au.raw_app_meta_data->>'certification_request_status',
      'pending'
    )) in ('approved', 'rejected', 'needs_info', 'suspended')
      then lower(coalesce(
        au.raw_user_meta_data->>'verification_status',
        au.raw_app_meta_data->>'verification_status',
        au.raw_user_meta_data->>'certification_request_status',
        au.raw_app_meta_data->>'certification_request_status',
        'pending'
      ))
    else 'pending'
  end,
  apu.approved_at,
  apu.approved_by,
  apu.rejection_reason,
  jsonb_strip_nulls(
    jsonb_build_object(
      'source', 'legacy_business_owner_backfill',
      'user_metadata', coalesce(au.raw_user_meta_data, '{}'::jsonb),
      'app_metadata', coalesce(au.raw_app_meta_data, '{}'::jsonb)
    )
  )
from auth.users au
left join public.app_b30c02e74da644baad4668e3587d86b1_users apu
  on apu.id = au.id
where
  lower(coalesce(au.raw_user_meta_data->>'account_type', au.raw_app_meta_data->>'account_type', '')) in ('business_owner', 'operator', 'business', 'rental_business')
  or lower(coalesce(au.raw_user_meta_data->>'certification_request_status', au.raw_app_meta_data->>'certification_request_status', '')) in ('pending', 'pending_verification', 'approved', 'rejected', 'needs_info', 'suspended')
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
    when lower(coalesce(au.raw_user_meta_data->>'plan_type', au.raw_app_meta_data->>'plan_type', 'starter')) in ('starter', 'growth', 'pro')
      then lower(coalesce(au.raw_user_meta_data->>'plan_type', au.raw_app_meta_data->>'plan_type', 'starter'))
    else 'starter'
  end,
  case
    when lower(coalesce(au.raw_user_meta_data->>'subscription_status', au.raw_app_meta_data->>'subscription_status', 'trial')) in ('trial', 'active', 'expired', 'cancelled', 'suspended')
      then lower(coalesce(au.raw_user_meta_data->>'subscription_status', au.raw_app_meta_data->>'subscription_status', 'trial'))
    else 'trial'
  end,
  case
    when lower(coalesce(au.raw_user_meta_data->>'billing_status', au.raw_app_meta_data->>'billing_status', 'none')) in ('none', 'active', 'failed')
      then lower(coalesce(au.raw_user_meta_data->>'billing_status', au.raw_app_meta_data->>'billing_status', 'none'))
    else 'none'
  end,
  nullif(coalesce(au.raw_user_meta_data->>'trial_started_at', au.raw_app_meta_data->>'trial_started_at', ''), '')::timestamptz,
  nullif(coalesce(au.raw_user_meta_data->>'trial_ends_at', au.raw_app_meta_data->>'trial_ends_at', ''), '')::timestamptz,
  nullif(coalesce(au.raw_user_meta_data->>'subscription_started_at', au.raw_app_meta_data->>'subscription_started_at', ''), '')::timestamptz,
  nullif(coalesce(au.raw_user_meta_data->>'suspended_at', au.raw_app_meta_data->>'suspended_at', ''), '')::timestamptz,
  jsonb_strip_nulls(
    jsonb_build_object(
      'vehicles', case when lower(coalesce(au.raw_user_meta_data->>'plan_type', au.raw_app_meta_data->>'plan_type', 'starter')) = 'pro' then 9999 when lower(coalesce(au.raw_user_meta_data->>'plan_type', au.raw_app_meta_data->>'plan_type', 'starter')) = 'growth' then 30 else 10 end,
      'staff_users', case when lower(coalesce(au.raw_user_meta_data->>'plan_type', au.raw_app_meta_data->>'plan_type', 'starter')) = 'pro' then 25 when lower(coalesce(au.raw_user_meta_data->>'plan_type', au.raw_app_meta_data->>'plan_type', 'starter')) = 'growth' then 8 else 3 end,
      'marketplace_distribution', lower(coalesce(au.raw_user_meta_data->>'plan_type', au.raw_app_meta_data->>'plan_type', 'starter')) in ('growth', 'pro')
    )
  ),
  jsonb_build_object('source', 'legacy_business_owner_backfill')
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

notify pgrst, 'reload schema';
