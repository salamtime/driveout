-- Fake rental seed data for local/staging testing.
-- Safe to re-run: it deletes only rows created by this seed.
-- Do not use this as a production migration.

begin;

delete from public.app_4c3a7a6153_rentals
where rental_id in ('TEST-RNT-001', 'TEST-RNT-002', 'TEST-RNT-003')
   or customer_email like '%@test.local';

with ordered_vehicles as (
  select
    id,
    name,
    model,
    plate_number
  from public.saharax_0u4w4d_vehicles
  where status in ('available', 'rented', 'out_of_service')
  order by case status when 'available' then 0 when 'rented' then 1 else 2 end, id
  limit 3
),
available_vehicles as (
  select
    id,
    name,
    model,
    plate_number,
    row_number() over (order by id) as rn
  from ordered_vehicles
),
seed_rows as (
  select
    'TEST-RNT-001'::text as rental_id,
    'Test Active Customer'::text as customer_name,
    'test-active@test.local'::text as customer_email,
    '+212600000101'::text as customer_phone,
    'hourly'::text as rental_type,
    'active'::text as rental_status,
    'active'::text as status,
    now() - interval '20 minutes' as rental_start_date,
    now() + interval '40 minutes' as rental_end_date,
    now() - interval '20 minutes' as started_at,
    1::numeric as quantity,
    1::numeric as quantity_hours,
    299::numeric as unit_price_mad,
    299::numeric as unit_price,
    299::numeric as subtotal_mad,
    299::numeric as total_amount,
    299::numeric as remaining_amount,
    'paid'::text as payment_status,
    'TEST SEED: active rental visible in active/timer flows.'::text as notes,
    1 as vehicle_rank
  union all
  select
    'TEST-RNT-002',
    'Test Scheduled Customer',
    'test-scheduled@test.local',
    '+212600000102',
    'hourly',
    'scheduled',
    'scheduled',
    now() + interval '2 hours',
    now() + interval '3 hours',
    null,
    1,
    1,
    399,
    399,
    399,
    399,
    399,
    'unpaid',
    'TEST SEED: scheduled rental for calendar/booking tests.',
    2
  union all
  select
    'TEST-RNT-003',
    'Test Completed Customer',
    'test-completed@test.local',
    '+212600000103',
    'hourly',
    'completed',
    'completed',
    now() - interval '3 hours',
    now() - interval '2 hours',
    now() - interval '3 hours',
    1,
    1,
    599,
    599,
    599,
    599,
    0,
    'paid',
    'TEST SEED: completed rental for history/revenue tests.',
    3
),
prepared_rows as (
  select
    sr.*,
    av.id as vehicle_id,
    av.plate_number as vehicle_plate_number,
    concat_ws(' ', av.name, av.model) as vehicle_type
  from seed_rows sr
  left join available_vehicles av on av.rn = sr.vehicle_rank
)
insert into public.app_4c3a7a6153_rentals (
  rental_id,
  customer_name,
  customer_email,
  customer_phone,
  rental_type,
  rental_status,
  status,
  rental_start_date,
  rental_end_date,
  started_at,
  vehicle_id,
  vehicle_type,
  vehicle_plate_number,
  pickup_location,
  dropoff_location,
  quantity,
  quantity_hours,
  unit_price_mad,
  unit_price,
  subtotal_mad,
  total_amount,
  remaining_amount,
  damage_deposit,
  payment_status,
  contract_signed,
  insurance_included,
  helmet_included,
  gear_included,
  booking_source,
  booking_mode,
  notes,
  created_at,
  updated_at
)
select
  rental_id,
  customer_name,
  customer_email,
  customer_phone,
  rental_type,
  rental_status,
  status,
  rental_start_date,
  rental_end_date,
  started_at,
  vehicle_id,
  coalesce(vehicle_type, 'Test Vehicle'),
  vehicle_plate_number,
  'Office',
  'Office',
  quantity,
  quantity_hours,
  unit_price_mad,
  unit_price,
  subtotal_mad,
  total_amount,
  remaining_amount,
  1000,
  payment_status,
  true,
  true,
  true,
  true,
  'website',
  'instant',
  notes,
  now(),
  now()
from prepared_rows;

commit;

select
  rental_id,
  customer_name,
  rental_status,
  rental_start_date,
  rental_end_date,
  vehicle_id,
  vehicle_plate_number,
  total_amount,
  payment_status
from public.app_4c3a7a6153_rentals
where rental_id in ('TEST-RNT-001', 'TEST-RNT-002', 'TEST-RNT-003')
order by rental_id;
