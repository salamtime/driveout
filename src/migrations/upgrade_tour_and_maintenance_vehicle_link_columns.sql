begin;

do $$
declare
  current_vehicle_id_type text;
begin
  select c.udt_name
  into current_vehicle_id_type
  from information_schema.columns c
  where c.table_schema = 'public'
    and c.table_name = 'app_687f658e98_tour_bookings'
    and c.column_name = 'vehicle_id'
  limit 1;

  if current_vehicle_id_type is not null and current_vehicle_id_type <> 'int4' then
    execute 'alter table public.app_687f658e98_tour_bookings drop column vehicle_id cascade';
  end if;
end $$;

alter table public.app_687f658e98_tour_bookings
  add column if not exists vehicle_id integer references public.saharax_0u4w4d_vehicles(id) on delete set null;

create index if not exists idx_tour_bookings_vehicle_id
  on public.app_687f658e98_tour_bookings (vehicle_id);

alter table public.app_687f658e98_maintenance
  add column if not exists vehicle_name text;

update public.app_687f658e98_maintenance m
set vehicle_name = coalesce(v.plate_number, v.name, v.model, 'Vehicle ' || v.id::text)
from public.saharax_0u4w4d_vehicles v
where m.vehicle_id = v.id
  and (m.vehicle_name is null or btrim(m.vehicle_name) = '');

update public.app_687f658e98_tour_bookings t
set vehicle_id = matched.vehicle_id
from (
  select
    tb.id as booking_id,
    min(v.id) as vehicle_id
  from public.app_687f658e98_tour_bookings tb
  join public.saharax_0u4w4d_vehicles v
    on (
      coalesce(tb.booking_payload::text, '') ilike '%' || v.id::text || '%'
      or (
        coalesce(v.plate_number, '') <> ''
        and (
          coalesce(tb.notes, '') ilike '%' || v.plate_number || '%'
          or coalesce(tb.booking_payload::text, '') ilike '%' || v.plate_number || '%'
        )
      )
      or (
        coalesce(v.name, '') <> ''
        and (
          coalesce(tb.notes, '') ilike '%' || v.name || '%'
          or coalesce(tb.booking_payload::text, '') ilike '%' || v.name || '%'
        )
      )
    )
  where tb.vehicle_id is null
  group by tb.id
  having count(*) = 1
) matched
where t.id = matched.booking_id
  and t.vehicle_id is null;

commit;
