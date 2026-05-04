begin;

alter table public.app_4c3a7a6153_receive_funds_entries enable row level security;

drop policy if exists "authenticated delete receive funds" on public.app_4c3a7a6153_receive_funds_entries;
create policy "authenticated delete receive funds"
on public.app_4c3a7a6153_receive_funds_entries
for delete
to authenticated
using (true);

grant delete on public.app_4c3a7a6153_receive_funds_entries to authenticated;
grant delete on public.app_4c3a7a6153_receive_funds_entries to service_role;

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

commit;
