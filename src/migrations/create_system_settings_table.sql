CREATE TABLE IF NOT EXISTS public.saharax_0u4w4d_settings (
  id integer PRIMARY KEY DEFAULT 1,
  company_name text DEFAULT 'QuadVenture',
  company_email text DEFAULT 'info@quadventure.com',
  company_phone text DEFAULT '+212 123 456 789',
  company_address text DEFAULT 'Marrakech, Morocco',
  company_website text DEFAULT 'https://quadventure.com',
  timezone text DEFAULT 'Africa/Casablanca',
  language text DEFAULT 'en',
  currency text DEFAULT 'MAD',
  operating_hours jsonb NOT NULL DEFAULT '{"start":"08:00","end":"18:00"}'::jsonb,
  operating_days jsonb NOT NULL DEFAULT '["monday","tuesday","wednesday","thursday","friday","saturday","sunday"]'::jsonb,
  default_rental_duration numeric(10,2) DEFAULT 4,
  min_rental_duration numeric(10,2) DEFAULT 1,
  max_rental_duration numeric(10,2) DEFAULT 24,
  maintenance_mode boolean DEFAULT false,
  online_booking boolean DEFAULT true,
  real_time_tracking boolean DEFAULT true,
  base_hourly_rate numeric(10,2) DEFAULT 50,
  daily_rate numeric(10,2) DEFAULT 300,
  weekly_rate numeric(10,2) DEFAULT 1800,
  deposit_percentage numeric(10,2) DEFAULT 25,
  default_rate_1h numeric(10,2) DEFAULT 50,
  default_rate_2h numeric(10,2) DEFAULT 90,
  extra_passenger_fee numeric(10,2) DEFAULT 15,
  pickup_transport_fee numeric(10,2) DEFAULT 0,
  dropoff_transport_fee numeric(10,2) DEFAULT 0,
  tax_enabled boolean DEFAULT false,
  tax_percentage numeric(10,2) DEFAULT 10,
  apply_to_rentals boolean DEFAULT true,
  apply_to_tours boolean DEFAULT true,
  booking_reminder_hours numeric(10,2) DEFAULT 24,
  return_reminder_hours numeric(10,2) DEFAULT 2,
  whatsapp_enabled boolean DEFAULT true,
  email_notifications boolean DEFAULT true,
  sms_notifications boolean DEFAULT false,
  push_notifications boolean DEFAULT true,
  notify_on_overdue boolean DEFAULT true,
  notify_on_maintenance boolean DEFAULT true,
  receipt_footer text DEFAULT 'Thank you for choosing our fleet.',
  invoice_prefix text DEFAULT 'INV',
  contract_footer text DEFAULT 'Drive safely and report any issue immediately.',
  brand_primary_color text DEFAULT '#2563eb',
  show_company_website_on_print boolean DEFAULT true,
  show_company_phone_on_print boolean DEFAULT true,
  map_provider text DEFAULT 'mapbox',
  mapbox_public_token text DEFAULT '',
  ocr_provider text DEFAULT 'gemini',
  gemini_proxy_path text DEFAULT '/api/gemini-proxy',
  whatsapp_default_country_code text DEFAULT '+212',
  storage_bucket text DEFAULT 'rental-documents',
  require_two_factor_for_admins boolean DEFAULT false,
  session_timeout_minutes numeric(10,2) DEFAULT 60,
  allow_employee_package_edits boolean DEFAULT false,
  allow_employee_settings_view boolean DEFAULT true,
  write_audit_logs boolean DEFAULT true,
  allow_live_tracking_retry boolean DEFAULT true,
  tour_departure_buffer_minutes numeric(10,2) DEFAULT 15,
  tour_auto_receipt_required boolean DEFAULT true,
  tour_default_license_policy text DEFAULT 'route_based',
  tour_guide_tracking_required boolean DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.saharax_0u4w4d_settings (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.saharax_0u4w4d_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "system settings authenticated read" ON public.saharax_0u4w4d_settings;
CREATE POLICY "system settings authenticated read"
  ON public.saharax_0u4w4d_settings
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "system settings authenticated write" ON public.saharax_0u4w4d_settings;
CREATE POLICY "system settings authenticated write"
  ON public.saharax_0u4w4d_settings
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE
ON TABLE public.saharax_0u4w4d_settings
TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.update_system_settings_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_system_settings_updated_at ON public.saharax_0u4w4d_settings;
CREATE TRIGGER trg_update_system_settings_updated_at
BEFORE UPDATE ON public.saharax_0u4w4d_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_system_settings_updated_at();
