begin;

alter table public.app_4c3a7a6153_rentals
  add column if not exists website_booking_status text,
  add column if not exists is_vehicle_locked boolean not null default false,
  add column if not exists hold_expires_at timestamptz,
  add column if not exists hold_strength text,
  add column if not exists booking_session_key text,
  add column if not exists confirmed_at timestamptz,
  add column if not exists confirmed_by text,
  add column if not exists status_changed_at timestamptz,
  add column if not exists status_changed_by text,
  add column if not exists status_change_reason text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'rentals_website_booking_status_check'
  ) then
    alter table public.app_4c3a7a6153_rentals
      add constraint rentals_website_booking_status_check
      check (
        website_booking_status is null or website_booking_status in (
          'pending',
          'verified',
          'awaiting_payment',
          'payment_submitted',
          'confirmed',
          'expired',
          'cancelled'
        )
      );
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'rentals_hold_strength_check'
  ) then
    alter table public.app_4c3a7a6153_rentals
      add constraint rentals_hold_strength_check
      check (
        hold_strength is null or hold_strength in (
          'none',
          'soft',
          'strong'
        )
      );
  end if;
end $$;

create index if not exists idx_rentals_website_booking_status
  on public.app_4c3a7a6153_rentals (website_booking_status);

create index if not exists idx_rentals_vehicle_lock_expiry
  on public.app_4c3a7a6153_rentals (is_vehicle_locked, hold_expires_at);

create index if not exists idx_rentals_booking_session_key
  on public.app_4c3a7a6153_rentals (booking_session_key);

create index if not exists idx_rentals_booking_source_status
  on public.app_4c3a7a6153_rentals (booking_source, rental_status, website_booking_status);

commit;
