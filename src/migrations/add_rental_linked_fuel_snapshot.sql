begin;

alter table public.app_4c3a7a6153_rentals
  add column if not exists linked_fuel_start_liters numeric(10,3),
  add column if not exists linked_fuel_end_liters numeric(10,3),
  add column if not exists linked_fuel_consumed_liters numeric(10,3) not null default 0,
  add column if not exists linked_fuel_average_unit_cost numeric(10,2) not null default 0,
  add column if not exists linked_fuel_expense_total numeric(10,2) not null default 0,
  add column if not exists linked_fuel_synced_at timestamptz;

with tank_avg as (
  select coalesce(
    round(
      sum(coalesce(total_cost, 0)) / nullif(sum(coalesce(liters_added, 0)), 0),
      2
    ),
    0
  ) as avg_unit_cost
  from public.fuel_refills
  where vehicle_id is null
)
update public.app_4c3a7a6153_rentals r
set
  linked_fuel_start_liters = round(((coalesce(r.start_fuel_level, 0)::numeric / 8.0) * 23.0), 3),
  linked_fuel_end_liters = round(((coalesce(r.end_fuel_level, 0)::numeric / 8.0) * 23.0), 3),
  linked_fuel_consumed_liters = round(greatest(0, ((coalesce(r.start_fuel_level, 0)::numeric - coalesce(r.end_fuel_level, 0)::numeric) / 8.0) * 23.0), 3),
  linked_fuel_average_unit_cost = tank_avg.avg_unit_cost,
  linked_fuel_expense_total = round(greatest(0, ((coalesce(r.start_fuel_level, 0)::numeric - coalesce(r.end_fuel_level, 0)::numeric) / 8.0) * 23.0) * tank_avg.avg_unit_cost, 2),
  linked_fuel_synced_at = now()
from tank_avg
where r.start_fuel_level is not null
  and r.end_fuel_level is not null;

commit;
