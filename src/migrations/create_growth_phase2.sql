create table if not exists public.share_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('rewards', 'boost')),
  destination_url text not null,
  short_code text not null unique,
  created_at timestamptz not null default now()
);

create unique index if not exists idx_share_links_user_type_destination
  on public.share_links(user_id, type, destination_url);

create index if not exists idx_share_links_short_code
  on public.share_links(short_code);

create table if not exists public.link_events (
  id uuid primary key default gen_random_uuid(),
  link_id uuid not null references public.share_links(id) on delete cascade,
  event_type text not null check (event_type in ('click', 'signup', 'booking')),
  visitor_hash text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_link_events_link_created
  on public.link_events(link_id, created_at desc);

create index if not exists idx_link_events_link_event_hash
  on public.link_events(link_id, event_type, visitor_hash);

create table if not exists public.mission_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('rewards', 'boost')),
  total_clicks integer not null default 0,
  total_signups integer not null default 0,
  total_bookings integer not null default 0,
  milestones_completed jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, type)
);

create table if not exists public.customer_rewards_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  entry_type text not null,
  amount integer not null,
  reference_id text not null,
  note text default '',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create unique index if not exists idx_customer_rewards_ledger_reference
  on public.customer_rewards_ledger(user_id, reference_id);

create index if not exists idx_customer_rewards_ledger_user_created
  on public.customer_rewards_ledger(user_id, created_at desc);

alter table public.share_links enable row level security;
alter table public.link_events enable row level security;
alter table public.mission_progress enable row level security;
alter table public.customer_rewards_ledger enable row level security;

grant select, insert, update on public.share_links to authenticated, service_role;
grant select on public.link_events to authenticated, service_role;
grant select, insert, update on public.mission_progress to authenticated, service_role;
grant select, insert on public.customer_rewards_ledger to authenticated, service_role;

drop policy if exists "Users read own share links" on public.share_links;
create policy "Users read own share links"
on public.share_links
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users insert own share links" on public.share_links;
create policy "Users insert own share links"
on public.share_links
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Users update own share links" on public.share_links;
create policy "Users update own share links"
on public.share_links
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users read own mission progress" on public.mission_progress;
create policy "Users read own mission progress"
on public.mission_progress
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users insert own mission progress" on public.mission_progress;
create policy "Users insert own mission progress"
on public.mission_progress
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Users update own mission progress" on public.mission_progress;
create policy "Users update own mission progress"
on public.mission_progress
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users read own customer rewards ledger" on public.customer_rewards_ledger;
create policy "Users read own customer rewards ledger"
on public.customer_rewards_ledger
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users insert own customer rewards ledger" on public.customer_rewards_ledger;
create policy "Users insert own customer rewards ledger"
on public.customer_rewards_ledger
for insert
to authenticated
with check (auth.uid() = user_id);

