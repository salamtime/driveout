begin;

alter table public.fuel_withdrawals
  add column if not exists unit_price decimal(10,2),
  add column if not exists total_cost decimal(10,2);

create index if not exists fuel_withdrawals_withdrawal_date_idx
  on public.fuel_withdrawals (withdrawal_date desc);

update public.fuel_withdrawals fw
set
  unit_price = coalesce(fw.unit_price, fol.unit_price),
  total_cost = coalesce(fw.total_cost, fol.total_cost)
from public.fuel_operation_logs fol
where fol.transaction_type = 'withdrawal'
  and fol.vehicle_id is not distinct from fw.vehicle_id
  and fol.created_at = fw.withdrawal_date
  and (fw.unit_price is null or fw.total_cost is null);

commit;
