CREATE TABLE IF NOT EXISTS public.app_687f658e98_tour_packages (
  id text PRIMARY KEY,
  name text NOT NULL,
  description text DEFAULT '',
  location text DEFAULT 'Main Base',
  duration numeric(4,1) NOT NULL DEFAULT 1,
  default_rate_1h numeric(10,2) NOT NULL DEFAULT 0,
  default_rate_2h numeric(10,2) NOT NULL DEFAULT 0,
  vip_rate_1h numeric(10,2) NOT NULL DEFAULT 0,
  vip_rate_2h numeric(10,2) NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  route_type text NOT NULL DEFAULT 'mountain',
  requires_license boolean NOT NULL DEFAULT false,
  max_quads integer NOT NULL DEFAULT 5,
  buffer_before_minutes integer NOT NULL DEFAULT 15,
  buffer_after_minutes integer NOT NULL DEFAULT 30,
  website_visible boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tour_packages_active
  ON public.app_687f658e98_tour_packages (is_active, name);

ALTER TABLE public.app_687f658e98_tour_packages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tour packages authenticated read" ON public.app_687f658e98_tour_packages;
CREATE POLICY "tour packages authenticated read"
  ON public.app_687f658e98_tour_packages
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "tour packages authenticated insert" ON public.app_687f658e98_tour_packages;
CREATE POLICY "tour packages authenticated insert"
  ON public.app_687f658e98_tour_packages
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "tour packages authenticated update" ON public.app_687f658e98_tour_packages;
CREATE POLICY "tour packages authenticated update"
  ON public.app_687f658e98_tour_packages
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "tour packages authenticated delete" ON public.app_687f658e98_tour_packages;
CREATE POLICY "tour packages authenticated delete"
  ON public.app_687f658e98_tour_packages
  FOR DELETE
  TO authenticated
  USING (true);

CREATE OR REPLACE FUNCTION public.update_tour_packages_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_tour_packages_updated_at ON public.app_687f658e98_tour_packages;
CREATE TRIGGER trg_update_tour_packages_updated_at
BEFORE UPDATE ON public.app_687f658e98_tour_packages
FOR EACH ROW
EXECUTE FUNCTION public.update_tour_packages_updated_at();

CREATE TABLE IF NOT EXISTS public.app_687f658e98_tour_bookings (
  id text PRIMARY KEY,
  booking_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  booking_status text DEFAULT 'scheduled',
  scheduled_for timestamptz,
  vehicle_id integer references public.saharax_0u4w4d_vehicles(id) on delete set null,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tour_bookings_status
  ON public.app_687f658e98_tour_bookings (booking_status, scheduled_for);

CREATE INDEX IF NOT EXISTS idx_tour_bookings_vehicle_id
  ON public.app_687f658e98_tour_bookings (vehicle_id);

ALTER TABLE public.app_687f658e98_tour_bookings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tour bookings authenticated read" ON public.app_687f658e98_tour_bookings;
CREATE POLICY "tour bookings authenticated read"
  ON public.app_687f658e98_tour_bookings
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "tour bookings authenticated insert" ON public.app_687f658e98_tour_bookings;
CREATE POLICY "tour bookings authenticated insert"
  ON public.app_687f658e98_tour_bookings
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "tour bookings authenticated update" ON public.app_687f658e98_tour_bookings;
CREATE POLICY "tour bookings authenticated update"
  ON public.app_687f658e98_tour_bookings
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "tour bookings authenticated delete" ON public.app_687f658e98_tour_bookings;
CREATE POLICY "tour bookings authenticated delete"
  ON public.app_687f658e98_tour_bookings
  FOR DELETE
  TO authenticated
  USING (true);

CREATE OR REPLACE FUNCTION public.update_tour_bookings_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_tour_bookings_updated_at ON public.app_687f658e98_tour_bookings;
CREATE TRIGGER trg_update_tour_bookings_updated_at
BEFORE UPDATE ON public.app_687f658e98_tour_bookings
FOR EACH ROW
EXECUTE FUNCTION public.update_tour_bookings_updated_at();
