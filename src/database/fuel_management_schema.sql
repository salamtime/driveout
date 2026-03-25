-- =====================================================
-- Fuel Management System - Complete Database Schema
-- =====================================================
-- Copy and paste this entire file into your Supabase SQL Editor
-- This will create all necessary tables and sample data

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- 1. FUEL TANK TABLE
-- =====================================================
-- Main fuel tank configuration and status
CREATE TABLE IF NOT EXISTS fuel_tank (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    capacity DECIMAL(10,2) NOT NULL DEFAULT 1000.00,
    initial_volume DECIMAL(10,2) NOT NULL DEFAULT 500.00,
    location VARCHAR(255) DEFAULT 'Main Storage',
    installation_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =====================================================
-- 2. FUEL REFILLS TABLE
-- =====================================================
-- Records both tank refills (vehicle_id = NULL) and vehicle refills (vehicle_id set)
CREATE TABLE IF NOT EXISTS fuel_refills (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    vehicle_id UUID REFERENCES saharax_0u4w4d_vehicles(id) ON DELETE SET NULL,
    liters_added DECIMAL(10,2) NOT NULL,
    total_cost DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    unit_price DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    fuel_type VARCHAR(50) NOT NULL DEFAULT 'gasoline',
    refill_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    fuel_station VARCHAR(255),
    location VARCHAR(255),
    odometer_reading INTEGER,
    filled_by VARCHAR(255),
    notes TEXT,
    receipt_number VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =====================================================
-- 3. FUEL WITHDRAWALS TABLE
-- =====================================================
-- Records fuel withdrawals from main tank to vehicles
CREATE TABLE IF NOT EXISTS fuel_withdrawals (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    vehicle_id UUID NOT NULL REFERENCES saharax_0u4w4d_vehicles(id) ON DELETE CASCADE,
    liters_taken DECIMAL(10,2) NOT NULL,
    withdrawal_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    odometer_reading INTEGER,
    filled_by VARCHAR(255) NOT NULL,
    notes TEXT,
    purpose VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =====================================================
-- 4. CREATE INDEXES FOR PERFORMANCE
-- =====================================================
-- Fuel refills indexes
CREATE INDEX IF NOT EXISTS idx_fuel_refills_vehicle_id ON fuel_refills(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_fuel_refills_refill_date ON fuel_refills(refill_date DESC);
CREATE INDEX IF NOT EXISTS idx_fuel_refills_fuel_type ON fuel_refills(fuel_type);

-- Fuel withdrawals indexes
CREATE INDEX IF NOT EXISTS idx_fuel_withdrawals_vehicle_id ON fuel_withdrawals(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_fuel_withdrawals_withdrawal_date ON fuel_withdrawals(withdrawal_date DESC);
CREATE INDEX IF NOT EXISTS idx_fuel_withdrawals_filled_by ON fuel_withdrawals(filled_by);

-- =====================================================
-- 5. ROW LEVEL SECURITY (RLS) POLICIES
-- =====================================================
-- Enable RLS on all tables
ALTER TABLE fuel_tank ENABLE ROW LEVEL SECURITY;
ALTER TABLE fuel_refills ENABLE ROW LEVEL SECURITY;
ALTER TABLE fuel_withdrawals ENABLE ROW LEVEL SECURITY;

-- Fuel tank policies
CREATE POLICY "allow_read_fuel_tank" ON fuel_tank FOR SELECT USING (true);
CREATE POLICY "allow_insert_fuel_tank" ON fuel_tank FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "allow_update_fuel_tank" ON fuel_tank FOR UPDATE TO authenticated USING (true);

-- Fuel refills policies
CREATE POLICY "allow_read_fuel_refills" ON fuel_refills FOR SELECT USING (true);
CREATE POLICY "allow_insert_fuel_refills" ON fuel_refills FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "allow_update_fuel_refills" ON fuel_refills FOR UPDATE TO authenticated USING (true);
CREATE POLICY "allow_delete_fuel_refills" ON fuel_refills FOR DELETE TO authenticated USING (true);

-- Fuel withdrawals policies
CREATE POLICY "allow_read_fuel_withdrawals" ON fuel_withdrawals FOR SELECT USING (true);
CREATE POLICY "allow_insert_fuel_withdrawals" ON fuel_withdrawals FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "allow_update_fuel_withdrawals" ON fuel_withdrawals FOR UPDATE TO authenticated USING (true);
CREATE POLICY "allow_delete_fuel_withdrawals" ON fuel_withdrawals FOR DELETE TO authenticated USING (true);

-- =====================================================
-- 6. TRIGGER FUNCTIONS FOR AUTO-UPDATE TIMESTAMPS
-- =====================================================
-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply triggers to all tables
CREATE TRIGGER update_fuel_tank_updated_at BEFORE UPDATE ON fuel_tank FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_fuel_refills_updated_at BEFORE UPDATE ON fuel_refills FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_fuel_withdrawals_updated_at BEFORE UPDATE ON fuel_withdrawals FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- 7. SAMPLE DATA INSERTION
-- =====================================================

-- Insert main fuel tank configuration
INSERT INTO fuel_tank (capacity, initial_volume, location) 
VALUES (1000.00, 500.00, 'Main Storage Facility')
ON CONFLICT DO NOTHING;

-- Get the tank ID for reference (assuming single tank setup)
DO $$
DECLARE
    tank_uuid UUID;
    vehicle_segway_uuid UUID;
    vehicle_7_uuid UUID;
    vehicle_13_uuid UUID;
BEGIN
    -- Get or create tank ID
    SELECT id INTO tank_uuid FROM fuel_tank LIMIT 1;
    
    -- Get vehicle IDs (you may need to adjust these based on your actual vehicle data)
    -- If these vehicles don't exist, you'll need to create them first or update the UUIDs
    
    -- Try to find existing vehicles by name, or use mock IDs
    SELECT id INTO vehicle_segway_uuid FROM saharax_0u4w4d_vehicles WHERE name ILIKE '%segway%' LIMIT 1;
    SELECT id INTO vehicle_7_uuid FROM saharax_0u4w4d_vehicles WHERE name ILIKE '%vehicle 7%' OR name ILIKE '%7%' LIMIT 1;
    SELECT id INTO vehicle_13_uuid FROM saharax_0u4w4d_vehicles WHERE name ILIKE '%vehicle 13%' OR name ILIKE '%13%' LIMIT 1;
    
    -- If vehicles don't exist, create placeholder UUIDs (you should replace these with actual vehicle IDs)
    IF vehicle_segway_uuid IS NULL THEN
        vehicle_segway_uuid := uuid_generate_v4();
    END IF;
    IF vehicle_7_uuid IS NULL THEN
        vehicle_7_uuid := uuid_generate_v4();
    END IF;
    IF vehicle_13_uuid IS NULL THEN
        vehicle_13_uuid := uuid_generate_v4();
    END IF;

    -- Insert fuel refills (tank refills have vehicle_id = NULL)
    INSERT INTO fuel_refills (vehicle_id, liters_added, total_cost, unit_price, fuel_type, refill_date, fuel_station, location, filled_by, notes) VALUES
    -- Tank Refills (vehicle_id = NULL means main tank refill)
    (NULL, 25.00, 37.50, 1.50, 'gasoline', '2024-11-08 08:00:00+00', 'Main Station', 'Main Road', 'System', 'Morning tank refill'),
    (NULL, 111.00, 166.50, 1.50, 'gasoline', '2024-11-07 10:00:00+00', 'Main Station', 'Downtown', 'System', 'Large tank refill'),
    
    -- Vehicle Refills (direct station fills)
    (vehicle_segway_uuid, 10.00, 10.00, 1.00, 'gasoline', '2024-10-22 09:15:00+00', 'Direct Fill', 'City Center', 'System', 'Vehicle refill at station'),
    (vehicle_segway_uuid, 24.00, 24.00, 1.00, 'gasoline', '2024-10-22 07:30:00+00', 'Direct Fill', 'City Center', 'System', 'Pre-tour vehicle refill')
    ON CONFLICT DO NOTHING;

    -- Insert fuel withdrawals (from main tank to vehicles)
    INSERT INTO fuel_withdrawals (vehicle_id, liters_taken, withdrawal_date, odometer_reading, filled_by, notes, purpose) VALUES
    (vehicle_7_uuid, 20.00, '2024-10-25 16:00:00+00', 900, 'Oualid', 'Fuel withdrawal for tour', 'Tour preparation'),
    (vehicle_7_uuid, 33.00, '2024-10-22 11:30:00+00', 900, 'ZZZ', 'Fuel withdrawal for maintenance', 'Vehicle maintenance'),
    (vehicle_13_uuid, 35.00, '2024-10-22 13:45:00+00', 1650, 'AAA', 'Fuel withdrawal for expedition', 'Long expedition')
    ON CONFLICT DO NOTHING;

END $$;

-- =====================================================
-- 8. HELPFUL VIEWS FOR REPORTING
-- =====================================================

-- View for current tank status with calculated current volume
CREATE OR REPLACE VIEW fuel_tank_status AS
SELECT 
    ft.id,
    ft.capacity,
    ft.initial_volume,
    COALESCE(ft.initial_volume, 0) + 
    COALESCE(tank_refills.total_refills, 0) - 
    COALESCE(withdrawals.total_withdrawals, 0) as current_volume,
    ((COALESCE(ft.initial_volume, 0) + 
      COALESCE(tank_refills.total_refills, 0) - 
      COALESCE(withdrawals.total_withdrawals, 0)) / ft.capacity * 100) as fill_percentage,
    ft.location,
    ft.created_at,
    ft.updated_at
FROM fuel_tank ft
LEFT JOIN (
    SELECT SUM(liters_added) as total_refills
    FROM fuel_refills 
    WHERE vehicle_id IS NULL
) tank_refills ON true
LEFT JOIN (
    SELECT SUM(liters_taken) as total_withdrawals
    FROM fuel_withdrawals
) withdrawals ON true;

-- View for all fuel transactions in unified format
CREATE OR REPLACE VIEW fuel_transactions_unified AS
-- Tank refills
SELECT 
    'refill-' || fr.id::text as id,
    fr.refill_date as transaction_date,
    CASE WHEN fr.vehicle_id IS NULL THEN 'tank_refill' ELSE 'vehicle_refill' END as transaction_type,
    fr.fuel_type,
    fr.liters_added as amount,
    fr.total_cost as cost,
    fr.unit_price,
    fr.fuel_station,
    fr.location,
    fr.odometer_reading,
    fr.notes,
    fr.filled_by,
    fr.vehicle_id,
    v.name as vehicle_name,
    v.plate_number as vehicle_plate,
    fr.created_at,
    'fuel_refills' as source_table
FROM fuel_refills fr
LEFT JOIN saharax_0u4w4d_vehicles v ON fr.vehicle_id = v.id

UNION ALL

-- Withdrawals
SELECT 
    'withdrawal-' || fw.id::text as id,
    fw.withdrawal_date as transaction_date,
    'withdrawal' as transaction_type,
    'gasoline' as fuel_type,
    fw.liters_taken as amount,
    0 as cost,
    0 as unit_price,
    'Main Tank' as fuel_station,
    '' as location,
    fw.odometer_reading,
    fw.notes,
    fw.filled_by,
    fw.vehicle_id,
    v.name as vehicle_name,
    v.plate_number as vehicle_plate,
    fw.created_at,
    'fuel_withdrawals' as source_table
FROM fuel_withdrawals fw
LEFT JOIN saharax_0u4w4d_vehicles v ON fw.vehicle_id = v.id

ORDER BY transaction_date DESC;

-- =====================================================
-- VERIFICATION QUERIES
-- =====================================================
-- Run these queries after setup to verify everything works:

-- Check tank status
-- SELECT * FROM fuel_tank_status;

-- Check all transactions
-- SELECT * FROM fuel_transactions_unified ORDER BY transaction_date DESC;

-- Check current tank volume calculation
-- SELECT 
--     capacity,
--     initial_volume,
--     current_volume,
--     fill_percentage,
--     CASE 
--         WHEN fill_percentage <= 15 THEN 'LOW - Refill needed'
--         WHEN fill_percentage <= 30 THEN 'MEDIUM - Monitor closely'
--         ELSE 'GOOD'
--     END as status
-- FROM fuel_tank_status;

-- =====================================================
-- SETUP COMPLETE
-- =====================================================
-- Your fuel management system is now ready!
-- 
-- Next steps:
-- 1. Verify the sample data appears correctly in your application
-- 2. Update vehicle IDs in the sample data to match your actual vehicles
-- 3. Test adding new transactions through the application
-- 4. Monitor the unified transaction view for consistency
-- 
-- Note: If you have existing vehicles in saharax_0u4w4d_vehicles table,
-- you may want to update the sample data vehicle_id references to use
-- actual vehicle IDs instead of the placeholder UUIDs.