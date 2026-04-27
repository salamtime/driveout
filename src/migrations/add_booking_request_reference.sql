alter table public.app_booking_requests
  add column if not exists request_reference text;

create unique index if not exists app_booking_requests_reference_key
  on public.app_booking_requests(request_reference);
