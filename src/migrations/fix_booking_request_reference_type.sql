-- Ensure request_reference can store human-readable values like RQ-XXXX
alter table if exists public.app_booking_requests
  alter column request_reference drop default;

alter table if exists public.app_booking_requests
  alter column request_reference type text
  using request_reference::text;
