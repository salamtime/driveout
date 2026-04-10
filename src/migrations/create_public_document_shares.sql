begin;

create extension if not exists pgcrypto;

create table if not exists public.public_document_shares (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  share_token varchar(32) not null unique,
  share_type varchar(32) not null,
  rental_id uuid null,
  payload jsonb not null default '{}'::jsonb,
  created_by uuid null,
  expires_at timestamptz null,
  access_count integer not null default 0,
  last_accessed_at timestamptz null
);

create index if not exists idx_public_document_shares_token
  on public.public_document_shares (share_token);

create index if not exists idx_public_document_shares_rental_id
  on public.public_document_shares (rental_id);

create index if not exists idx_public_document_shares_share_type
  on public.public_document_shares (share_type);

create index if not exists idx_public_document_shares_expires_at
  on public.public_document_shares (expires_at);

alter table public.public_document_shares
  enable row level security;

drop policy if exists "service role manages public document shares" on public.public_document_shares;
create policy "service role manages public document shares"
on public.public_document_shares
for all
to service_role
using (true)
with check (true);

commit;
