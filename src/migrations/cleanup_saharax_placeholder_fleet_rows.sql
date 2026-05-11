begin;

-- Permanently remove raw placeholder/import fleet rows that should never appear in
-- operational SaharaX fleet views, while preserving any row that has historical
-- links and correcting one sold vehicle whose status was left stale.
--
-- Safe targets:
-- - placeholder rows: ids 84,85,86,87,88,89,90,91,92,93,94,97
-- - stale sold status fix: id 10 -> status='sold'
--
-- Explicitly preserved:
-- - id 83 remains because it is linked to a rental record and must remain as
--   historical data. The UI visibility rules hide it from operational fleet.

select
  id,
  name,
  model,
  plate_number,
  status,
  vehicle_model_id,
  organization_id,
  sold_date
from public.saharax_0u4w4d_vehicles
where id in (10, 84, 85, 86, 87, 88, 89, 90, 91, 92, 93, 94, 97)
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
  where vehicle_id in (84, 85, 86, 87, 88, 89, 90, 91, 92, 93, 94, 97);

  select count(*)
    into linked_vehicle_history
  from public.rental_vehicle_history
  where vehicle_id in (84, 85, 86, 87, 88, 89, 90, 91, 92, 93, 94, 97);

  select count(*)
    into linked_vehicle_reports
  from public.app_4c3a7a6153_vehicle_reports
  where vehicle_id in (84, 85, 86, 87, 88, 89, 90, 91, 92, 93, 94, 97);

  select count(*)
    into linked_tour_snapshots
  from public.tour_vehicle_snapshots
  where vehicle_id in (84, 85, 86, 87, 88, 89, 90, 91, 92, 93, 94, 97);

  select count(*)
    into linked_vehicle_taxes
  from public.saharax_0u4w4d_vehicle_annual_taxes
  where vehicle_id in (84, 85, 86, 87, 88, 89, 90, 91, 92, 93, 94, 97);

  if linked_rentals > 0
     or linked_vehicle_history > 0
     or linked_vehicle_reports > 0
     or linked_tour_snapshots > 0
     or linked_vehicle_taxes > 0 then
    raise exception using
      message = format(
        'Blocked SaharaX placeholder cleanup. Linked records found. rentals=%s, history=%s, reports=%s, tour_snapshots=%s, taxes=%s',
        linked_rentals,
        linked_vehicle_history,
        linked_vehicle_reports,
        linked_tour_snapshots,
        linked_vehicle_taxes
      );
  end if;
end $$;

update public.saharax_0u4w4d_vehicles
set
  status = 'sold',
  updated_at = now()
where id = 10
  and sold_date is not null
  and lower(coalesce(status, '')) <> 'sold';

delete from public.saharax_0u4w4d_vehicles
where id in (84, 85, 86, 87, 88, 89, 90, 91, 92, 93, 94, 97)
  and vehicle_model_id is null
  and organization_id is null
  and coalesce(plate_number, '') = ''
  and coalesce(registration_number, '') = '';

-- Special-case cleanup for the stray unknown/import row that carries no fleet
-- identity beyond a copied reference string.
delete from public.saharax_0u4w4d_vehicles
where id = 97
  and vehicle_model_id is null
  and organization_id is null
  and lower(coalesce(name, '')) like '%unknown%'
  and lower(coalesce(model, '')) like '%unknown%';

select
  id,
  name,
  model,
  plate_number,
  status,
  vehicle_model_id,
  organization_id,
  sold_date
from public.saharax_0u4w4d_vehicles
where id in (10, 84, 85, 86, 87, 88, 89, 90, 91, 92, 93, 94, 97)
order by id;

commit;
