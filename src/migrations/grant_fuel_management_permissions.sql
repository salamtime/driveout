grant usage on schema public to authenticated, service_role;

grant select, insert, update, delete on table public.fuel_tank to authenticated, service_role;
grant select, insert, update, delete on table public.fuel_refills to authenticated, service_role;
grant select, insert, update, delete on table public.vehicle_fuel_refills to authenticated, service_role;
grant select, insert, update, delete on table public.fuel_withdrawals to authenticated, service_role;
grant select, insert, update, delete on table public.vehicle_fuel_state to authenticated, service_role;
grant select, insert, update, delete on table public.fuel_operation_logs to authenticated, service_role;
