begin;

alter table public.saharax_0u4w4d_activity_log
  enable row level security;

drop policy if exists "authenticated read activity log" on public.saharax_0u4w4d_activity_log;
create policy "authenticated read activity log"
on public.saharax_0u4w4d_activity_log
for select
to authenticated
using (true);

drop policy if exists "authenticated insert activity log" on public.saharax_0u4w4d_activity_log;
create policy "authenticated insert activity log"
on public.saharax_0u4w4d_activity_log
for insert
to authenticated
with check (true);

drop policy if exists "authenticated update activity log" on public.saharax_0u4w4d_activity_log;
create policy "authenticated update activity log"
on public.saharax_0u4w4d_activity_log
for update
to authenticated
using (true)
with check (true);

drop policy if exists "authenticated delete activity log" on public.saharax_0u4w4d_activity_log;
create policy "authenticated delete activity log"
on public.saharax_0u4w4d_activity_log
for delete
to authenticated
using (true);

commit;
