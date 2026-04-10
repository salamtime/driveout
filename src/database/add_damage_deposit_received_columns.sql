alter table public.app_4c3a7a6153_rentals
add column if not exists damage_deposit_received_amount numeric(10,2) default 0,
add column if not exists damage_deposit_received_at timestamp with time zone;

comment on column public.app_4c3a7a6153_rentals.damage_deposit_received_amount is 'Cash amount actually received and held as damage deposit security, separate from rental payment';
comment on column public.app_4c3a7a6153_rentals.damage_deposit_received_at is 'Timestamp when a cash damage deposit was first recorded as received';
