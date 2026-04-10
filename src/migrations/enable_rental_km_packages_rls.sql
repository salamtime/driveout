begin;

alter table public.app_4c3a7a6153_rental_km_packages
  enable row level security;

drop policy if exists "public read active rental km packages" on public.app_4c3a7a6153_rental_km_packages;
create policy "public read active rental km packages"
  on public.app_4c3a7a6153_rental_km_packages
  for select
  to anon
  using (is_active = true);

drop policy if exists "authenticated read rental km packages" on public.app_4c3a7a6153_rental_km_packages;
create policy "authenticated read rental km packages"
  on public.app_4c3a7a6153_rental_km_packages
  for select
  to authenticated
  using (true);

drop policy if exists "authenticated insert rental km packages" on public.app_4c3a7a6153_rental_km_packages;
create policy "authenticated insert rental km packages"
  on public.app_4c3a7a6153_rental_km_packages
  for insert
  to authenticated
  with check (true);

drop policy if exists "authenticated update rental km packages" on public.app_4c3a7a6153_rental_km_packages;
create policy "authenticated update rental km packages"
  on public.app_4c3a7a6153_rental_km_packages
  for update
  to authenticated
  using (true)
  with check (true);

drop policy if exists "authenticated delete rental km packages" on public.app_4c3a7a6153_rental_km_packages;
create policy "authenticated delete rental km packages"
  on public.app_4c3a7a6153_rental_km_packages
  for delete
  to authenticated
  using (true);

grant usage on schema public to anon, authenticated, service_role;
grant select on table public.app_4c3a7a6153_rental_km_packages to anon, authenticated, service_role;
grant insert, update, delete on table public.app_4c3a7a6153_rental_km_packages to authenticated, service_role;

commit;
