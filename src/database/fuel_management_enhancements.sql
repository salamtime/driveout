-- Fuel Management Enhancements
-- Run after src/database/fuel_management_schema.sql

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Enhance tank configuration for real-time stock tracking
ALTER TABLE public.fuel_tank
  ADD COLUMN IF NOT EXISTS name TEXT DEFAULT 'Main Tank',
  ADD COLUMN IF NOT EXISTS fuel_type TEXT DEFAULT 'gasoline',
  ADD COLUMN IF NOT EXISTS current_volume_liters DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS low_threshold_liters DECIMAL(10,2) DEFAULT 150.00;

UPDATE public.fuel_tank
SET
  name = COALESCE(name, 'Main Tank'),
  fuel_type = COALESCE(fuel_type, 'gasoline'),
  current_volume_liters = COALESCE(current_volume_liters, initial_volume, 0),
  low_threshold_liters = COALESCE(low_threshold_liters, 150.00);

-- 2. Live vehicle fuel state
CREATE TABLE IF NOT EXISTS public.vehicle_fuel_state (
  vehicle_id UUID PRIMARY KEY REFERENCES public.saharax_0u4w4d_vehicles(id) ON DELETE CASCADE,
  current_fuel_liters DECIMAL(10,3) NOT NULL DEFAULT 0,
  current_fuel_lines INTEGER NOT NULL DEFAULT 0,
  max_fuel_lines INTEGER NOT NULL DEFAULT 8,
  tank_capacity_liters DECIMAL(10,3) NOT NULL DEFAULT 23,
  last_source TEXT,
  last_transaction_id UUID,
  last_rental_id UUID,
  last_updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.vehicle_fuel_state ENABLE ROW LEVEL SECURITY;

GRANT USAGE ON SCHEMA public TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.vehicle_fuel_state TO authenticated, service_role;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'vehicle_fuel_state' AND policyname = 'authenticated_can_manage_vehicle_fuel_state'
  ) THEN
    CREATE POLICY authenticated_can_manage_vehicle_fuel_state
    ON public.vehicle_fuel_state
    FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);
  END IF;
END $$;

-- 3. Fuel operation ledger / audit history
CREATE TABLE IF NOT EXISTS public.fuel_operation_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  transaction_type TEXT NOT NULL,
  source TEXT,
  tank_id UUID REFERENCES public.fuel_tank(id) ON DELETE SET NULL,
  vehicle_id UUID REFERENCES public.saharax_0u4w4d_vehicles(id) ON DELETE SET NULL,
  rental_id UUID REFERENCES public.app_4c3a7a6153_rentals(id) ON DELETE SET NULL,
  liters DECIMAL(10,3),
  fuel_lines_before INTEGER,
  fuel_lines_after INTEGER,
  liters_before DECIMAL(10,3),
  liters_after DECIMAL(10,3),
  unit_price DECIMAL(10,2),
  total_cost DECIMAL(10,2),
  fuel_type TEXT DEFAULT 'gasoline',
  fuel_station TEXT,
  location TEXT,
  odometer_reading INTEGER,
  performed_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  performed_by_name TEXT,
  receipt_media JSONB,
  is_financial_expense BOOLEAN NOT NULL DEFAULT false,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.fuel_operation_logs ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.fuel_operation_logs TO authenticated, service_role;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'fuel_operation_logs' AND policyname = 'authenticated_can_manage_fuel_operation_logs'
  ) THEN
    CREATE POLICY authenticated_can_manage_fuel_operation_logs
    ON public.fuel_operation_logs
    FOR ALL
    TO authenticated
    USING (true)
    WITH CHECK (true);
  END IF;
END $$;

-- 4. Optional attribution / finance-ready metadata on existing tables
ALTER TABLE public.fuel_refills
  ADD COLUMN IF NOT EXISTS performed_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS performed_by_name TEXT,
  ADD COLUMN IF NOT EXISTS receipt_media JSONB,
  ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'tank_refill',
  ADD COLUMN IF NOT EXISTS is_financial_expense BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE public.vehicle_fuel_refills
  ADD COLUMN IF NOT EXISTS performed_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS performed_by_name TEXT,
  ADD COLUMN IF NOT EXISTS receipt_media JSONB,
  ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'direct_station',
  ADD COLUMN IF NOT EXISTS is_financial_expense BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE public.fuel_withdrawals
  ADD COLUMN IF NOT EXISTS performed_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS performed_by_name TEXT,
  ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'tank_transfer',
  ADD COLUMN IF NOT EXISTS is_financial_expense BOOLEAN NOT NULL DEFAULT false;

UPDATE public.fuel_refills
SET
  performed_by_name = COALESCE(performed_by_name, filled_by),
  receipt_media = COALESCE(receipt_media, invoice_image),
  source = COALESCE(source, CASE WHEN vehicle_id IS NULL THEN 'tank_refill' ELSE 'direct_station' END),
  is_financial_expense = true;

UPDATE public.vehicle_fuel_refills
SET
  performed_by_name = COALESCE(performed_by_name, refilled_by),
  receipt_media = COALESCE(receipt_media, invoice_image),
  source = COALESCE(source, 'direct_station'),
  is_financial_expense = true;

UPDATE public.fuel_withdrawals
SET
  performed_by_name = COALESCE(performed_by_name, filled_by),
  source = COALESCE(source, 'tank_transfer'),
  is_financial_expense = false;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.fuel_tank TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.fuel_refills TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.vehicle_fuel_refills TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.fuel_withdrawals TO authenticated, service_role;

-- 5. Helpful indexes
CREATE INDEX IF NOT EXISTS idx_vehicle_fuel_state_last_updated_at
  ON public.vehicle_fuel_state(last_updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_fuel_operation_logs_vehicle_id
  ON public.fuel_operation_logs(vehicle_id);

CREATE INDEX IF NOT EXISTS idx_fuel_operation_logs_rental_id
  ON public.fuel_operation_logs(rental_id);

CREATE INDEX IF NOT EXISTS idx_fuel_operation_logs_transaction_type
  ON public.fuel_operation_logs(transaction_type);

CREATE INDEX IF NOT EXISTS idx_fuel_operation_logs_finance
  ON public.fuel_operation_logs(is_financial_expense, created_at DESC);

-- 6. Finance-ready expense view
CREATE OR REPLACE VIEW public.fuel_finance_expenses AS
SELECT
  fol.id,
  fol.created_at,
  fol.transaction_type,
  fol.source,
  fol.vehicle_id,
  v.name AS vehicle_name,
  v.plate_number,
  fol.liters,
  fol.unit_price,
  fol.total_cost,
  fol.fuel_station,
  fol.location,
  fol.performed_by_user_id,
  fol.performed_by_name,
  fol.receipt_media,
  fol.notes
FROM public.fuel_operation_logs fol
LEFT JOIN public.saharax_0u4w4d_vehicles v ON v.id = fol.vehicle_id
WHERE fol.is_financial_expense = true;
