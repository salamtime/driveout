-- Owner marketplace vehicles may use the shared vehicle table for documents/media
-- linkage, but they must never become operational Sahara X fleet inventory.
-- Operational fleet rows are organization-owned rows with no owner_user_id.

alter table public.saharax_0u4w4d_vehicles
  add constraint saharax_owner_vehicle_not_operational_status
  check (
    owner_user_id is null
    or lower(coalesce(status::text, '')) not in (
      'available',
      'scheduled',
      'reserved',
      'rented',
      'active',
      'maintenance',
      'out_of_service',
      'tour'
    )
  )
  not valid;

create index if not exists idx_saharax_operational_fleet_scope
  on public.saharax_0u4w4d_vehicles (organization_id, status, id)
  where owner_user_id is null and organization_id is not null;

create index if not exists idx_saharax_owner_marketplace_vehicles
  on public.saharax_0u4w4d_vehicles (owner_user_id, plate_number, id)
  where owner_user_id is not null;
