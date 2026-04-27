create table if not exists public.app_4c3a7a6153_receive_funds_entries (
  id uuid primary key default gen_random_uuid(),
  organization_id text,
  workspace_id text,
  source_type text,
  source_id text,
  amount numeric(12,2) not null check (amount > 0),
  currency text not null default 'MAD',
  method text not null check (method in ('cash', 'bank_deposit', 'wire_transfer')),
  received_date date not null default current_date,
  note text,
  recorded_by_user_id uuid,
  recorded_by_display_name text not null,
  recorded_by_email text,
  received_by_admin_user_id uuid,
  received_by_admin_display_name text,
  receipt_image_url text,
  receipt_image_path text,
  status text not null default 'active' check (status in ('active', 'reversed')),
  reversed_at timestamptz,
  reversed_by_user_id uuid,
  reversal_note text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_receive_funds_org_date
  on public.app_4c3a7a6153_receive_funds_entries (organization_id, received_date desc);

create index if not exists idx_receive_funds_workspace_date
  on public.app_4c3a7a6153_receive_funds_entries (workspace_id, received_date desc);

create index if not exists idx_receive_funds_method
  on public.app_4c3a7a6153_receive_funds_entries (method);

create index if not exists idx_receive_funds_status
  on public.app_4c3a7a6153_receive_funds_entries (status);

create or replace function public.set_receive_funds_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists trg_receive_funds_updated_at on public.app_4c3a7a6153_receive_funds_entries;
create trigger trg_receive_funds_updated_at
before update on public.app_4c3a7a6153_receive_funds_entries
for each row
execute function public.set_receive_funds_updated_at();

alter table public.app_4c3a7a6153_receive_funds_entries enable row level security;

drop policy if exists "authenticated read receive funds" on public.app_4c3a7a6153_receive_funds_entries;
create policy "authenticated read receive funds"
on public.app_4c3a7a6153_receive_funds_entries
for select
to authenticated
using (true);

drop policy if exists "authenticated insert receive funds" on public.app_4c3a7a6153_receive_funds_entries;
create policy "authenticated insert receive funds"
on public.app_4c3a7a6153_receive_funds_entries
for insert
to authenticated
with check (true);

drop policy if exists "authenticated update receive funds" on public.app_4c3a7a6153_receive_funds_entries;
create policy "authenticated update receive funds"
on public.app_4c3a7a6153_receive_funds_entries
for update
to authenticated
using (true)
with check (true);

grant select, insert, update on public.app_4c3a7a6153_receive_funds_entries to authenticated;
grant select, insert, update on public.app_4c3a7a6153_receive_funds_entries to service_role;

create or replace view public.app_4c3a7a6153_receive_funds_daily_summary as
select
  organization_id,
  workspace_id,
  received_date,
  method,
  status,
  count(*) as entry_count,
  coalesce(sum(amount), 0)::numeric(12,2) as total_amount
from public.app_4c3a7a6153_receive_funds_entries
group by organization_id, workspace_id, received_date, method, status;
