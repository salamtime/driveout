-- Allow consumables like oil to be saved as decimal quantities (for example 1.8 liters).
-- This keeps existing whole-number parts valid while making liter-based maintenance work.

alter table public.app_687f658e98_maintenance_parts
  alter column quantity type numeric(10,3)
  using quantity::numeric(10,3);

