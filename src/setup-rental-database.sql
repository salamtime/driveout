-- Setup script for rental return alerts
-- This creates the necessary tables and data for testing

BEGIN;

-- Create rentals table if it doesn't exist
CREATE TABLE IF NOT EXISTS app_4c3a7a6153_rentals (
  id SERIAL PRIMARY KEY,
  customer_name VARCHAR(255) NOT NULL,
  customer_email VARCHAR(255),
  customer_phone VARCHAR(50),
  rental_start_date TIMESTAMP WITH TIME ZONE NOT NULL,
  rental_end_date TIMESTAMP WITH TIME ZONE NOT NULL,
  rental_status VARCHAR(50) DEFAULT 'active',
  total_amount DECIMAL(10,2) DEFAULT 0,
  expected_total DECIMAL(10,2) DEFAULT 0,
  paid_amount DECIMAL(10,2) DEFAULT 0,
  vehicle_id INTEGER,
  returned_at TIMESTAMP WITH TIME ZONE NULL,
  pickup_location VARCHAR(255),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create vehicles table if it doesn't exist
CREATE TABLE IF NOT EXISTS saharax_0u4w4d_vehicles (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255),
  model VARCHAR(255),
  plate_number VARCHAR(50),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS on both tables
ALTER TABLE app_4c3a7a6153_rentals ENABLE ROW LEVEL SECURITY;
ALTER TABLE saharax_0u4w4d_vehicles ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "allow_read_rentals" ON app_4c3a7a6153_rentals;
DROP POLICY IF EXISTS "allow_insert_rentals" ON app_4c3a7a6153_rentals;
DROP POLICY IF EXISTS "allow_update_rentals" ON app_4c3a7a6153_rentals;
DROP POLICY IF EXISTS "allow_read_vehicles" ON saharax_0u4w4d_vehicles;
DROP POLICY IF EXISTS "allow_insert_vehicles" ON saharax_0u4w4d_vehicles;

-- Create policies to allow access
CREATE POLICY "allow_read_rentals" ON app_4c3a7a6153_rentals FOR SELECT USING (true);
CREATE POLICY "allow_insert_rentals" ON app_4c3a7a6153_rentals FOR INSERT WITH CHECK (true);
CREATE POLICY "allow_update_rentals" ON app_4c3a7a6153_rentals FOR UPDATE USING (true);
CREATE POLICY "allow_delete_rentals" ON app_4c3a7a6153_rentals FOR DELETE USING (true);

CREATE POLICY "allow_read_vehicles" ON saharax_0u4w4d_vehicles FOR SELECT USING (true);
CREATE POLICY "allow_insert_vehicles" ON saharax_0u4w4d_vehicles FOR INSERT WITH CHECK (true);

-- Insert test vehicles (with conflict handling)
INSERT INTO saharax_0u4w4d_vehicles (id, name, model, plate_number) VALUES
(1, 'SEGWAY AT5', 'SEGWAY', 'AT5-41888'),
(2, 'SEGWAY AT6', 'SEGWAY', 'AT6-41111'),
(3, 'SEGWAY AT7', 'SEGWAY', 'AT7-45555')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  model = EXCLUDED.model,
  plate_number = EXCLUDED.plate_number;

-- Clear any existing test rentals
DELETE FROM app_4c3a7a6153_rentals WHERE customer_email IN ('ahmed@example.com', 'fatima@example.com');

-- Insert test rentals with specific timing
-- Rental 1: Due in ~86.7 hours (AT5-41888)
-- Rental 2: Due in ~135 hours (AT6-41111)
INSERT INTO app_4c3a7a6153_rentals (
  customer_name,
  customer_email,
  customer_phone,
  rental_start_date,
  rental_end_date,
  rental_status,
  total_amount,
  expected_total,
  paid_amount,
  vehicle_id,
  returned_at,
  pickup_location
) VALUES
(
  'Ahmed Hassan',
  'ahmed@example.com',
  '+212600000001',
  NOW() - INTERVAL '1 day',
  NOW() + INTERVAL '86.7 hours',
  'active',
  450.00,
  450.00,
  200.00,
  1,
  NULL,
  'Casablanca Airport'
),
(
  'Fatima Benali',
  'fatima@example.com',
  '+212600000002',
  NOW() - INTERVAL '12 hours',
  NOW() + INTERVAL '135 hours',
  'active',
  680.00,
  680.00,
  680.00,
  2,
  NULL,
  'Rabat Center'
);

COMMIT;

-- Verify the data
SELECT 
  r.id,
  r.customer_name,
  r.rental_end_date,
  r.rental_status,
  r.total_amount,
  r.expected_total,
  r.paid_amount,
  r.returned_at,
  v.plate_number,
  v.model,
  EXTRACT(EPOCH FROM (r.rental_end_date - NOW())) / 3600 as hours_until_due
FROM app_4c3a7a6153_rentals r
LEFT JOIN saharax_0u4w4d_vehicles v ON r.vehicle_id = v.id
WHERE r.returned_at IS NULL AND r.rental_status != 'cancelled'
ORDER BY r.rental_end_date;