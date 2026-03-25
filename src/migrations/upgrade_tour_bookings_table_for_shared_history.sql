ALTER TABLE public.app_687f658e98_tour_bookings
  ADD COLUMN IF NOT EXISTS rental_status text,
  ADD COLUMN IF NOT EXISTS assignment_mode text DEFAULT 'assign_on_arrival',
  ADD COLUMN IF NOT EXISTS package_id text,
  ADD COLUMN IF NOT EXISTS package_name text,
  ADD COLUMN IF NOT EXISTS route_type text,
  ADD COLUMN IF NOT EXISTS location text,
  ADD COLUMN IF NOT EXISTS guide_id text,
  ADD COLUMN IF NOT EXISTS guide_name text,
  ADD COLUMN IF NOT EXISTS booked_by_user_id text,
  ADD COLUMN IF NOT EXISTS booked_by_name text,
  ADD COLUMN IF NOT EXISTS scheduled_date date,
  ADD COLUMN IF NOT EXISTS scheduled_time text,
  ADD COLUMN IF NOT EXISTS scheduled_end_at timestamptz,
  ADD COLUMN IF NOT EXISTS started_at timestamptz,
  ADD COLUMN IF NOT EXISTS completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS quad_count integer DEFAULT 1,
  ADD COLUMN IF NOT EXISTS riders_count integer DEFAULT 1,
  ADD COLUMN IF NOT EXISTS total_amount_mad numeric(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS requires_license boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS share_contract boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS receipt_issued boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS receipt_issued_at timestamptz,
  ADD COLUMN IF NOT EXISTS customer_name text,
  ADD COLUMN IF NOT EXISTS customer_phone text,
  ADD COLUMN IF NOT EXISTS customer_email text,
  ADD COLUMN IF NOT EXISTS id_number text,
  ADD COLUMN IF NOT EXISTS license_number text,
  ADD COLUMN IF NOT EXISTS notes text;

UPDATE public.app_687f658e98_tour_bookings
SET rental_status = COALESCE(rental_status, booking_status, 'scheduled')
WHERE rental_status IS NULL;

ALTER TABLE public.app_687f658e98_tour_bookings
  ALTER COLUMN rental_status SET DEFAULT 'scheduled',
  ALTER COLUMN quad_count SET DEFAULT 1,
  ALTER COLUMN riders_count SET DEFAULT 1,
  ALTER COLUMN total_amount_mad SET DEFAULT 0,
  ALTER COLUMN requires_license SET DEFAULT false,
  ALTER COLUMN share_contract SET DEFAULT false,
  ALTER COLUMN receipt_issued SET DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_tour_bookings_rental_status
  ON public.app_687f658e98_tour_bookings (rental_status);

CREATE INDEX IF NOT EXISTS idx_tour_bookings_scheduled_for
  ON public.app_687f658e98_tour_bookings (scheduled_for DESC);

CREATE INDEX IF NOT EXISTS idx_tour_bookings_scheduled_date
  ON public.app_687f658e98_tour_bookings (scheduled_date DESC);

CREATE INDEX IF NOT EXISTS idx_tour_bookings_package_id
  ON public.app_687f658e98_tour_bookings (package_id);

CREATE INDEX IF NOT EXISTS idx_tour_bookings_guide_id
  ON public.app_687f658e98_tour_bookings (guide_id);
