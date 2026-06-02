alter table public.saharax_0u4w4d_settings
add column if not exists lost_vehicle_document_penalty_mad numeric(12, 2) default 4000;

update public.saharax_0u4w4d_settings
set lost_vehicle_document_penalty_mad = greatest(0, coalesce(lost_vehicle_document_penalty_mad, 4000))
where id = 1;
