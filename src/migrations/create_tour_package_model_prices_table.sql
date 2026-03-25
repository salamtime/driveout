CREATE TABLE IF NOT EXISTS public.app_687f658e98_tour_package_model_prices (
  id text PRIMARY KEY,
  package_id text NOT NULL,
  vehicle_model_id uuid NOT NULL,
  duration_hours numeric(4,1) NOT NULL,
  price_mad numeric(10,2) NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tour_package_model_prices_unique UNIQUE (package_id, vehicle_model_id, duration_hours)
);

CREATE INDEX IF NOT EXISTS idx_tour_package_model_prices_package
  ON public.app_687f658e98_tour_package_model_prices (package_id, is_active);

CREATE INDEX IF NOT EXISTS idx_tour_package_model_prices_model
  ON public.app_687f658e98_tour_package_model_prices (vehicle_model_id, is_active);

ALTER TABLE public.app_687f658e98_tour_package_model_prices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tour package model prices authenticated read" ON public.app_687f658e98_tour_package_model_prices;
CREATE POLICY "tour package model prices authenticated read"
  ON public.app_687f658e98_tour_package_model_prices
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "tour package model prices authenticated insert" ON public.app_687f658e98_tour_package_model_prices;
CREATE POLICY "tour package model prices authenticated insert"
  ON public.app_687f658e98_tour_package_model_prices
  FOR INSERT TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "tour package model prices authenticated update" ON public.app_687f658e98_tour_package_model_prices;
CREATE POLICY "tour package model prices authenticated update"
  ON public.app_687f658e98_tour_package_model_prices
  FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "tour package model prices authenticated delete" ON public.app_687f658e98_tour_package_model_prices;
CREATE POLICY "tour package model prices authenticated delete"
  ON public.app_687f658e98_tour_package_model_prices
  FOR DELETE TO authenticated
  USING (true);

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE
ON TABLE public.app_687f658e98_tour_package_model_prices
TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.update_tour_package_model_prices_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_tour_package_model_prices_updated_at ON public.app_687f658e98_tour_package_model_prices;
CREATE TRIGGER trg_update_tour_package_model_prices_updated_at
BEFORE UPDATE ON public.app_687f658e98_tour_package_model_prices
FOR EACH ROW
EXECUTE FUNCTION public.update_tour_package_model_prices_updated_at();
