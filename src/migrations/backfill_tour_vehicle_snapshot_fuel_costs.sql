begin;

-- Keep this migration safe to run after create_tour_vehicle_snapshots.sql.
alter table public.tour_vehicle_snapshots
  add column if not exists fuel_unit_cost_snapshot numeric(10,2) not null default 0,
  add column if not exists fuel_expense_total numeric(10,2) not null default 0,
  add column if not exists fuel_surplus_value numeric(10,2) not null default 0;

-- Price older tour rows that already have fuel liters but were saved before
-- we froze the per-liter source cost. This intentionally avoids fuel_operation_logs,
-- because that table is too heavy for Finance reads in production.
with priced_withdrawals as (
  select
    sum(
      coalesce(total_cost, 0)
      + case
          when coalesce(total_cost, 0) > 0 then 0
          else coalesce(liters_taken, 0) * coalesce(unit_price, 0)
        end
    ) / nullif(sum(coalesce(liters_taken, 0)), 0) as unit_cost
  from public.fuel_withdrawals
  where coalesce(liters_taken, 0) > 0
    and (coalesce(total_cost, 0) > 0 or coalesce(unit_price, 0) > 0)
),
rental_fuel_snapshots as (
  select
    sum(
      coalesce(linked_fuel_expense_total, 0)
      + case
          when coalesce(linked_fuel_expense_total, 0) > 0 then 0
          else coalesce(linked_fuel_consumed_liters, 0) * coalesce(linked_fuel_average_unit_cost, 0)
        end
    ) / nullif(sum(coalesce(linked_fuel_consumed_liters, 0)), 0) as unit_cost
  from public.app_4c3a7a6153_rentals
  where coalesce(linked_fuel_consumed_liters, 0) > 0
    and (
      coalesce(linked_fuel_expense_total, 0) > 0
      or coalesce(linked_fuel_average_unit_cost, 0) > 0
    )
),
unit_cost as (
  select coalesce(
    (select unit_cost from priced_withdrawals where unit_cost > 0),
    (select unit_cost from rental_fuel_snapshots where unit_cost > 0),
    0
  ) as value
)
update public.tour_vehicle_snapshots s
set
  fuel_unit_cost_snapshot = round(unit_cost.value::numeric, 2),
  fuel_expense_total = round((coalesce(s.fuel_consumed_liters, 0) * unit_cost.value)::numeric, 2),
  fuel_surplus_value = round((coalesce(s.fuel_surplus_liters, 0) * unit_cost.value)::numeric, 2),
  updated_at = now()
from unit_cost
where unit_cost.value > 0
  and coalesce(s.fuel_unit_cost_snapshot, 0) = 0
  and (
    coalesce(s.fuel_consumed_liters, 0) > 0
    or coalesce(s.fuel_surplus_liters, 0) > 0
  );

commit;
