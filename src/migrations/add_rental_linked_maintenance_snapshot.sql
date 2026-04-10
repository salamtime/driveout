begin;

alter table public.app_4c3a7a6153_rentals
  add column if not exists linked_maintenance_id uuid null references public.app_687f658e98_maintenance(id) on delete set null,
  add column if not exists linked_maintenance_status text,
  add column if not exists linked_maintenance_cost_total numeric(10,2) not null default 0,
  add column if not exists linked_maintenance_customer_charge_total numeric(10,2) not null default 0,
  add column if not exists linked_maintenance_daily_enabled boolean not null default true,
  add column if not exists linked_maintenance_daily_days integer not null default 0,
  add column if not exists linked_maintenance_daily_rate numeric(10,2) not null default 0,
  add column if not exists linked_maintenance_daily_discount numeric(10,2) not null default 0,
  add column if not exists linked_maintenance_daily_total numeric(10,2) not null default 0,
  add column if not exists linked_maintenance_synced_at timestamptz;

create index if not exists rentals_linked_maintenance_id_idx
  on public.app_4c3a7a6153_rentals (linked_maintenance_id);

update public.app_4c3a7a6153_rentals r
set
  linked_maintenance_id = vr.maintenance_id,
  linked_maintenance_status = vr.status,
  linked_maintenance_cost_total = coalesce(vr.maintenance_cost_total, 0),
  linked_maintenance_customer_charge_total = case
    when vr.customer_chargeable then coalesce(vr.customer_charge_amount, coalesce(vr.maintenance_cost_total, 0) + coalesce(vr.maintenance_daily_total, 0))
    else 0
  end,
  linked_maintenance_daily_enabled = coalesce(vr.maintenance_daily_enabled, true),
  linked_maintenance_daily_days = coalesce(vr.maintenance_daily_days, 0),
  linked_maintenance_daily_rate = coalesce(vr.maintenance_daily_rate, 0),
  linked_maintenance_daily_discount = coalesce(vr.maintenance_daily_discount, 0),
  linked_maintenance_daily_total = coalesce(vr.maintenance_daily_total, 0),
  linked_maintenance_synced_at = now()
from public.app_4c3a7a6153_vehicle_reports vr
where vr.rental_id = r.id;

commit;
