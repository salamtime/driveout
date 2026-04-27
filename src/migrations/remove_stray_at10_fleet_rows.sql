begin;

-- Remove the two stray raw AT10 fleet vehicles that are showing up on the public
-- rental website without coming from the managed vehicle model table.
--
-- Why this is safe:
-- - It only targets vehicle ids 95 and 96
-- - It only deletes rows that still look like the raw AT10 fallback records
-- - It stops immediately if either row is already linked to rentals, reports,
--   tour snapshots, or vehicle tax records
--
-- Expected target rows:
-- - public.saharax_0u4w4d_vehicles.id = 95
-- - public.saharax_0u4w4d_vehicles.id = 96

-- Preview what will be removed.
select
  id,
  name,
  model,
  plate_number,
  status,
  vehicle_model_id,
  created_at
from public.saharax_0u4w4d_vehicles
where id in (95, 96)
order by id;

do $$
declare
  linked_rentals integer := 0;
  linked_vehicle_history integer := 0;
  linked_vehicle_reports integer := 0;
  linked_tour_snapshots integer := 0;
  linked_vehicle_taxes integer := 0;
begin
  select count(*)
    into linked_rentals
  from public.app_4c3a7a6153_rentals
  where vehicle_id in (95, 96);

  select count(*)
    into linked_vehicle_history
  from public.rental_vehicle_history
  where vehicle_id in (95, 96);

  select count(*)
    into linked_vehicle_reports
  from public.app_4c3a7a6153_vehicle_reports
  where vehicle_id in (95, 96);

  select count(*)
    into linked_tour_snapshots
  from public.tour_vehicle_snapshots
  where vehicle_id in (95, 96);

  select count(*)
    into linked_vehicle_taxes
  from public.saharax_0u4w4d_vehicle_annual_taxes
  where vehicle_id in (95, 96);

  if linked_rentals > 0
     or linked_vehicle_history > 0
     or linked_vehicle_reports > 0
     or linked_tour_snapshots > 0
     or linked_vehicle_taxes > 0 then
    raise exception using
      message = format(
        'Blocked AT10 cleanup. Linked records found. rentals=%s, history=%s, reports=%s, tour_snapshots=%s, taxes=%s',
        linked_rentals,
        linked_vehicle_history,
        linked_vehicle_reports,
        linked_tour_snapshots,
        linked_vehicle_taxes
      );
  end if;
end $$;

delete from public.saharax_0u4w4d_vehicles
where id in (95, 96)
  and vehicle_model_id is null
  and upper(coalesce(model, '')) = 'AT10'
  and upper(coalesce(name, '')) like '%AT10%';

-- Confirm removal.
select
  id,
  name,
  model,
  plate_number,
  status,
  vehicle_model_id,
  created_at
from public.saharax_0u4w4d_vehicles
where id in (95, 96)
order by id;

commit;
