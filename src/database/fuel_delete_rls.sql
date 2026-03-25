-- =====================================================
-- Row Level Security (RLS) Policies for Fuel Tables
-- =====================================================
-- 
-- PURPOSE: Restrict DELETE operations to record owners only
-- 
-- IMPORTANT NOTES:
-- 1. Current schema uses TEXT fields (refilled_by, filled_by) instead of UUID
-- 2. These policies assume a future migration to add created_by UUID column
-- 3. For proper security, you MUST:
--    a. Add created_by UUID column to each table
--    b. Populate created_by with auth.uid() during record creation
--    c. Backfill existing records with appropriate user IDs
--
-- MIGRATION STEPS REQUIRED:
-- 1. Add created_by column:
--    ALTER TABLE fuel_refills ADD COLUMN created_by UUID REFERENCES auth.users(id);
--    ALTER TABLE vehicle_fuel_refills ADD COLUMN created_by UUID REFERENCES auth.users(id);
--    ALTER TABLE fuel_withdrawals ADD COLUMN created_by UUID REFERENCES auth.users(id);
--
-- 2. Update application code to set created_by = auth.uid() on INSERT
--
-- 3. Backfill existing records (example):
--    UPDATE fuel_refills SET created_by = (SELECT id FROM auth.users WHERE email = 'admin@example.com');
--
-- =====================================================

-- Enable Row Level Security on fuel_refills table
ALTER TABLE public.fuel_refills ENABLE ROW LEVEL SECURITY;

-- Enable Row Level Security on vehicle_fuel_refills table
ALTER TABLE public.vehicle_fuel_refills ENABLE ROW LEVEL SECURITY;

-- Enable Row Level Security on fuel_withdrawals table
ALTER TABLE public.fuel_withdrawals ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- DELETE Policies (Owner-Only)
-- =====================================================

-- Policy for fuel_refills: Only the creator can delete their own refills
-- NOTE: This policy will work AFTER created_by UUID column is added
CREATE POLICY "owners_can_delete_fuel_refills" 
ON public.fuel_refills
FOR DELETE 
TO authenticated
USING (auth.uid() = created_by);

-- Policy for vehicle_fuel_refills: Only the creator can delete their own vehicle refills
-- NOTE: This policy will work AFTER created_by UUID column is added
CREATE POLICY "owners_can_delete_vehicle_fuel_refills" 
ON public.vehicle_fuel_refills
FOR DELETE 
TO authenticated
USING (auth.uid() = created_by);

-- Policy for fuel_withdrawals: Only the creator can delete their own withdrawals
-- NOTE: This policy will work AFTER created_by UUID column is added
CREATE POLICY "owners_can_delete_fuel_withdrawals" 
ON public.fuel_withdrawals
FOR DELETE 
TO authenticated
USING (auth.uid() = created_by);

-- =====================================================
-- SELECT Policies (Allow all authenticated users to view)
-- =====================================================

-- Allow all authenticated users to view fuel refills
CREATE POLICY "authenticated_can_view_fuel_refills" 
ON public.fuel_refills
FOR SELECT 
TO authenticated
USING (true);

-- Allow all authenticated users to view vehicle fuel refills
CREATE POLICY "authenticated_can_view_vehicle_fuel_refills" 
ON public.vehicle_fuel_refills
FOR SELECT 
TO authenticated
USING (true);

-- Allow all authenticated users to view fuel withdrawals
CREATE POLICY "authenticated_can_view_fuel_withdrawals" 
ON public.fuel_withdrawals
FOR SELECT 
TO authenticated
USING (true);

-- =====================================================
-- INSERT Policies (Allow authenticated users to create)
-- =====================================================

-- Allow authenticated users to create fuel refills
-- NOTE: Application code MUST set created_by = auth.uid()
CREATE POLICY "authenticated_can_insert_fuel_refills" 
ON public.fuel_refills
FOR INSERT 
TO authenticated
WITH CHECK (true);

-- Allow authenticated users to create vehicle fuel refills
-- NOTE: Application code MUST set created_by = auth.uid()
CREATE POLICY "authenticated_can_insert_vehicle_fuel_refills" 
ON public.vehicle_fuel_refills
FOR INSERT 
TO authenticated
WITH CHECK (true);

-- Allow authenticated users to create fuel withdrawals
-- NOTE: Application code MUST set created_by = auth.uid()
CREATE POLICY "authenticated_can_insert_fuel_withdrawals" 
ON public.fuel_withdrawals
FOR INSERT 
TO authenticated
WITH CHECK (true);

-- =====================================================
-- UPDATE Policies (Owner-Only)
-- =====================================================

-- Policy for fuel_refills: Only the creator can update their own refills
-- NOTE: This policy will work AFTER created_by UUID column is added
CREATE POLICY "owners_can_update_fuel_refills" 
ON public.fuel_refills
FOR UPDATE 
TO authenticated
USING (auth.uid() = created_by)
WITH CHECK (auth.uid() = created_by);

-- Policy for vehicle_fuel_refills: Only the creator can update their own vehicle refills
-- NOTE: This policy will work AFTER created_by UUID column is added
CREATE POLICY "owners_can_update_vehicle_fuel_refills" 
ON public.vehicle_fuel_refills
FOR UPDATE 
TO authenticated
USING (auth.uid() = created_by)
WITH CHECK (auth.uid() = created_by);

-- Policy for fuel_withdrawals: Only the creator can update their own withdrawals
-- NOTE: This policy will work AFTER created_by UUID column is added
CREATE POLICY "owners_can_update_fuel_withdrawals" 
ON public.fuel_withdrawals
FOR UPDATE 
TO authenticated
USING (auth.uid() = created_by)
WITH CHECK (auth.uid() = created_by);

-- =====================================================
-- VERIFICATION QUERIES
-- =====================================================
-- Run these queries to verify the policies are working:
--
-- 1. Check if RLS is enabled:
--    SELECT tablename, rowsecurity FROM pg_tables 
--    WHERE schemaname = 'public' 
--    AND tablename IN ('fuel_refills', 'vehicle_fuel_refills', 'fuel_withdrawals');
--
-- 2. List all policies:
--    SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual 
--    FROM pg_policies 
--    WHERE tablename IN ('fuel_refills', 'vehicle_fuel_refills', 'fuel_withdrawals');
--
-- 3. Test delete as owner (should succeed):
--    DELETE FROM fuel_refills WHERE id = 'some-id' AND created_by = auth.uid();
--
-- 4. Test delete as non-owner (should fail):
--    DELETE FROM fuel_refills WHERE id = 'some-id' AND created_by != auth.uid();
--
-- =====================================================