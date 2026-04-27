create extension if not exists pgcrypto;

create table if not exists public.owner_boost_ledger (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  mission_id text,
  reward_id text,
  entry_type text not null default 'manual_adjustment',
  amount integer not null,
  reference_id text,
  note text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_owner_boost_ledger_owner_created
  on public.owner_boost_ledger(owner_id, created_at desc);

create index if not exists idx_owner_boost_ledger_owner_mission_created
  on public.owner_boost_ledger(owner_id, mission_id, created_at desc);

create table if not exists public.owner_listing_boost_redemptions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  listing_id uuid not null references public.app_marketplace_listings(id) on delete cascade,
  reward_id text not null,
  status text not null default 'active',
  credits_spent integer not null,
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint owner_listing_boost_redemptions_status_check
    check (status in ('active', 'expired', 'cancelled', 'redeemed'))
);

create index if not exists idx_owner_listing_boost_redemptions_owner
  on public.owner_listing_boost_redemptions(owner_id, created_at desc);

create index if not exists idx_owner_listing_boost_redemptions_listing
  on public.owner_listing_boost_redemptions(listing_id, status, ends_at);

create table if not exists public.owner_boost_share_links (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  listing_id uuid not null references public.app_marketplace_listings(id) on delete cascade,
  platform text not null default 'generic',
  short_code text not null,
  short_url text not null,
  original_url text not null,
  click_count integer not null default 0,
  rewarded_click_count integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint owner_boost_share_links_platform_check
    check (platform in ('generic', 'instagram', 'facebook', 'tiktok', 'referral'))
);

create unique index if not exists idx_owner_boost_share_links_unique
  on public.owner_boost_share_links(owner_id, listing_id, platform);

create index if not exists idx_owner_boost_share_links_short_code
  on public.owner_boost_share_links(short_code);

create or replace function public.set_owner_boost_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_owner_listing_boost_redemptions_updated_at on public.owner_listing_boost_redemptions;
create trigger trg_owner_listing_boost_redemptions_updated_at
before update on public.owner_listing_boost_redemptions
for each row execute function public.set_owner_boost_updated_at();

drop trigger if exists trg_owner_boost_share_links_updated_at on public.owner_boost_share_links;
create trigger trg_owner_boost_share_links_updated_at
before update on public.owner_boost_share_links
for each row execute function public.set_owner_boost_updated_at();

alter table public.owner_boost_ledger enable row level security;
alter table public.owner_listing_boost_redemptions enable row level security;
alter table public.owner_boost_share_links enable row level security;

grant select, insert on public.owner_boost_ledger to authenticated, service_role;
grant select, insert, update on public.owner_listing_boost_redemptions to authenticated, service_role;
grant select, insert, update on public.owner_boost_share_links to authenticated, service_role;

drop policy if exists "Owners read own boost ledger" on public.owner_boost_ledger;
create policy "Owners read own boost ledger"
on public.owner_boost_ledger
for select
to authenticated
using (auth.uid() = owner_id);

drop policy if exists "Owners insert own boost ledger" on public.owner_boost_ledger;
create policy "Owners insert own boost ledger"
on public.owner_boost_ledger
for insert
to authenticated
with check (auth.uid() = owner_id);

drop policy if exists "Owners read own boost redemptions" on public.owner_listing_boost_redemptions;
create policy "Owners read own boost redemptions"
on public.owner_listing_boost_redemptions
for select
to authenticated
using (auth.uid() = owner_id);

drop policy if exists "Owners manage own boost redemptions" on public.owner_listing_boost_redemptions;
create policy "Owners manage own boost redemptions"
on public.owner_listing_boost_redemptions
for insert
to authenticated
with check (auth.uid() = owner_id);

drop policy if exists "Owners update own boost redemptions" on public.owner_listing_boost_redemptions;
create policy "Owners update own boost redemptions"
on public.owner_listing_boost_redemptions
for update
to authenticated
using (auth.uid() = owner_id)
with check (auth.uid() = owner_id);

drop policy if exists "Owners read own boost share links" on public.owner_boost_share_links;
create policy "Owners read own boost share links"
on public.owner_boost_share_links
for select
to authenticated
using (auth.uid() = owner_id);

drop policy if exists "Owners insert own boost share links" on public.owner_boost_share_links;
create policy "Owners insert own boost share links"
on public.owner_boost_share_links
for insert
to authenticated
with check (auth.uid() = owner_id);

drop policy if exists "Owners update own boost share links" on public.owner_boost_share_links;
create policy "Owners update own boost share links"
on public.owner_boost_share_links
for update
to authenticated
using (auth.uid() = owner_id)
with check (auth.uid() = owner_id);
