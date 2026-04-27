create table if not exists public.leaderboard_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('rewards', 'boost')),
  score integer not null default 0,
  secondary_score integer not null default 0,
  week_start timestamptz not null,
  week_end timestamptz not null,
  rank integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_leaderboard_entries_unique_week
  on public.leaderboard_entries(user_id, type, week_start);

create index if not exists idx_leaderboard_entries_type_week_rank
  on public.leaderboard_entries(type, week_start, rank);

create index if not exists idx_link_events_created_at
  on public.link_events(created_at desc);

create index if not exists idx_link_events_link_created_at
  on public.link_events(link_id, created_at desc);

create table if not exists public.leaderboard_reward_distributions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('rewards', 'boost')),
  week_start timestamptz not null,
  rank integer not null,
  reward_key text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create unique index if not exists idx_leaderboard_reward_distributions_unique
  on public.leaderboard_reward_distributions(user_id, type, week_start, reward_key);

alter table public.leaderboard_entries enable row level security;
alter table public.leaderboard_reward_distributions enable row level security;

grant select, insert, update on public.leaderboard_entries to authenticated, service_role;
grant select, insert on public.leaderboard_reward_distributions to authenticated, service_role;

drop policy if exists "Users read leaderboard entries" on public.leaderboard_entries;
create policy "Users read leaderboard entries"
on public.leaderboard_entries
for select
to authenticated
using (true);

drop policy if exists "Service inserts leaderboard entries" on public.leaderboard_entries;
create policy "Service inserts leaderboard entries"
on public.leaderboard_entries
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Users update own leaderboard entries" on public.leaderboard_entries;
create policy "Users update own leaderboard entries"
on public.leaderboard_entries
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users read leaderboard distributions" on public.leaderboard_reward_distributions;
create policy "Users read leaderboard distributions"
on public.leaderboard_reward_distributions
for select
to authenticated
using (true);

