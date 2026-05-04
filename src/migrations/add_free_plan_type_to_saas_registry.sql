begin;

do $$
begin
  begin
    alter type public.driveout_plan_type add value if not exists 'free' before 'starter';
  exception
    when duplicate_object then null;
  end;
end $$;

alter table if exists public.platform_business_subscriptions
  drop constraint if exists platform_business_subscriptions_plan_type_check;

alter table if exists public.platform_business_subscriptions
  add constraint platform_business_subscriptions_plan_type_check
  check (plan_type in ('free', 'starter', 'growth', 'pro'));

notify pgrst, 'reload schema';

commit;
