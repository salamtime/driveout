begin;

create extension if not exists pgcrypto;

create table if not exists public.short_links (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  original_url text not null,
  short_code varchar(16) not null,
  rental_id uuid null,
  document_type varchar(50) not null default 'other',
  expires_at timestamptz null,
  click_count integer not null default 0,
  last_accessed_at timestamptz null
);

create unique index if not exists idx_short_links_short_code
  on public.short_links (short_code);

create index if not exists idx_short_links_original_url
  on public.short_links (original_url);

create index if not exists idx_short_links_rental_id
  on public.short_links (rental_id);

create index if not exists idx_short_links_document_type
  on public.short_links (document_type);

create index if not exists idx_short_links_expires_at
  on public.short_links (expires_at);

alter table public.short_links
  enable row level security;

drop policy if exists "service role manages short links" on public.short_links;
create policy "service role manages short links"
on public.short_links
for all
to service_role
using (true)
with check (true);

commit;
