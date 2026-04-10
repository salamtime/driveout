alter table public.app_marketplace_listings
  add column if not exists admin_feedback text,
  add column if not exists moderation_status text not null default 'not_reviewed',
  add column if not exists last_moderated_at timestamptz,
  add column if not exists last_moderated_by uuid references auth.users(id) on delete set null,
  add column if not exists changes_requested_at timestamptz,
  add column if not exists resubmitted_at timestamptz;

create table if not exists public.app_marketplace_moderation_history (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.app_marketplace_listings(id) on delete cascade,
  vehicle_public_profile_id uuid references public.app_vehicle_public_profiles(id) on delete set null,
  owner_id uuid not null references auth.users(id) on delete cascade,
  admin_id uuid references auth.users(id) on delete set null,
  action_type text not null,
  status_before text,
  status_after text,
  reason text,
  feedback text,
  suggestions jsonb not null default '[]'::jsonb,
  send_to_owner boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.app_marketplace_messages (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.app_marketplace_listings(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  sender_id uuid references auth.users(id) on delete set null,
  sender_type text not null,
  message_type text not null default 'message',
  body text not null,
  metadata jsonb not null default '{}'::jsonb,
  is_internal boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_marketplace_moderation_history_listing
  on public.app_marketplace_moderation_history(listing_id, created_at desc);

create index if not exists idx_marketplace_moderation_history_owner
  on public.app_marketplace_moderation_history(owner_id, created_at desc);

create index if not exists idx_marketplace_messages_listing
  on public.app_marketplace_messages(listing_id, created_at desc);

create index if not exists idx_marketplace_messages_owner
  on public.app_marketplace_messages(owner_id, created_at desc);

alter table public.app_marketplace_moderation_history enable row level security;
alter table public.app_marketplace_messages enable row level security;

grant select, insert on public.app_marketplace_moderation_history to authenticated, service_role;
grant select, insert on public.app_marketplace_messages to authenticated, service_role;

drop policy if exists "Owners read own marketplace moderation history" on public.app_marketplace_moderation_history;
create policy "Owners read own marketplace moderation history"
on public.app_marketplace_moderation_history
for select
using (auth.uid() = owner_id);

drop policy if exists "Owners read own marketplace messages" on public.app_marketplace_messages;
create policy "Owners read own marketplace messages"
on public.app_marketplace_messages
for select
using (auth.uid() = owner_id);

drop policy if exists "Owners create own marketplace messages" on public.app_marketplace_messages;
create policy "Owners create own marketplace messages"
on public.app_marketplace_messages
for insert
with check (
  auth.uid() = owner_id
  and auth.uid() = sender_id
  and sender_type = 'owner'
);

notify pgrst, 'reload schema';
