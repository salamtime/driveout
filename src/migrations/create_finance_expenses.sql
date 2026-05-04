create table if not exists public.finance_expenses (
  id uuid primary key default gen_random_uuid(),
  organization_id text null,
  workspace_id text null,
  category text not null,
  subcategory text null,
  description text null,
  amount numeric(12, 2) not null default 0,
  expense_date date not null,
  reference_id text null,
  reference_type text null,
  vehicle_id text null,
  invoice_url text null,
  notes text null,
  created_by uuid null,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_finance_expenses_expense_date
  on public.finance_expenses (expense_date desc);

create index if not exists idx_finance_expenses_subcategory
  on public.finance_expenses (subcategory);

create index if not exists idx_finance_expenses_organization_id
  on public.finance_expenses (organization_id);

create index if not exists idx_finance_expenses_reference
  on public.finance_expenses (reference_type, reference_id);

alter table public.finance_expenses enable row level security;

drop policy if exists "authenticated read finance expenses" on public.finance_expenses;
create policy "authenticated read finance expenses"
on public.finance_expenses
for select
to authenticated
using (true);

drop policy if exists "authenticated insert finance expenses" on public.finance_expenses;
create policy "authenticated insert finance expenses"
on public.finance_expenses
for insert
to authenticated
with check (true);

drop policy if exists "authenticated update finance expenses" on public.finance_expenses;
create policy "authenticated update finance expenses"
on public.finance_expenses
for update
to authenticated
using (true)
with check (true);

drop policy if exists "authenticated delete finance expenses" on public.finance_expenses;
create policy "authenticated delete finance expenses"
on public.finance_expenses
for delete
to authenticated
using (true);

grant select, insert, update, delete on public.finance_expenses to authenticated;
grant select, insert, update, delete on public.finance_expenses to service_role;
