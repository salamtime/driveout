-- Migration: Create tax_settings table for configurable tax system
-- This replaces hard-coded 10% tax with configurable settings

-- Create tax_settings table
CREATE TABLE IF NOT EXISTS tax_settings (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tax_enabled BOOLEAN DEFAULT false NOT NULL,
    tax_percentage DECIMAL(5,2) DEFAULT 10.0 NOT NULL CHECK (tax_percentage >= 0 AND tax_percentage <= 100),
    apply_to_rentals BOOLEAN DEFAULT true NOT NULL,
    apply_to_tours BOOLEAN DEFAULT true NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS tax_settings_enabled_idx ON tax_settings(tax_enabled);
CREATE INDEX IF NOT EXISTS tax_settings_updated_idx ON tax_settings(updated_at);

-- Insert default tax settings
INSERT INTO tax_settings (tax_enabled, tax_percentage, apply_to_rentals, apply_to_tours)
VALUES (false, 10.0, true, true)
ON CONFLICT DO NOTHING;

-- Update tour_bookings table to include tax snapshot fields
ALTER TABLE tour_bookings 
ADD COLUMN IF NOT EXISTS subtotal_amount DECIMAL(10,2),
ADD COLUMN IF NOT EXISTS tax_enabled BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS tax_percent_applied DECIMAL(5,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS tax_amount DECIMAL(10,2) DEFAULT 0;

-- Update existing tour_bookings to have subtotal_amount if missing
UPDATE tour_bookings 
SET subtotal_amount = COALESCE(base_price, 0) + COALESCE(extra_passenger_fees, 0)
WHERE subtotal_amount IS NULL;

-- Create or update rentals table to include tax snapshot fields
DO $$
BEGIN
    -- Check if rentals table exists
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'rentals') THEN
        -- Add tax columns to rentals table
        ALTER TABLE rentals 
        ADD COLUMN IF NOT EXISTS subtotal_amount DECIMAL(10,2),
        ADD COLUMN IF NOT EXISTS tax_enabled BOOLEAN DEFAULT false,
        ADD COLUMN IF NOT EXISTS tax_percent_applied DECIMAL(5,2) DEFAULT 0,
        ADD COLUMN IF NOT EXISTS tax_amount DECIMAL(10,2) DEFAULT 0;
        
        -- Update existing rentals to have subtotal_amount if missing
        UPDATE rentals 
        SET subtotal_amount = COALESCE(total_amount, 0) - COALESCE(tax_amount, 0)
        WHERE subtotal_amount IS NULL;
    END IF;
END $$;

-- Setup Row Level Security (RLS) for tax_settings
ALTER TABLE tax_settings ENABLE ROW LEVEL SECURITY;

-- Policy: Allow authenticated users to read tax settings
CREATE POLICY "allow_read_tax_settings" ON tax_settings
    FOR SELECT TO authenticated
    USING (true);

-- Policy: Only allow owners/admins to modify tax settings
CREATE POLICY "allow_update_tax_settings" ON tax_settings
    FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM auth.users 
            WHERE auth.uid() = auth.users.id 
            AND (
                auth.users.raw_user_meta_data->>'role' = 'owner' OR 
                auth.users.raw_user_meta_data->>'role' = 'admin'
            )
        )
    );

-- Create function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_tax_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = TIMEZONE('utc'::text, NOW());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for automatic timestamp updates
DROP TRIGGER IF EXISTS tax_settings_updated_at_trigger ON tax_settings;
CREATE TRIGGER tax_settings_updated_at_trigger
    BEFORE UPDATE ON tax_settings
    FOR EACH ROW
    EXECUTE FUNCTION update_tax_settings_updated_at();

-- Add comments for documentation
COMMENT ON TABLE tax_settings IS 'Configurable tax settings for rentals and tours';
COMMENT ON COLUMN tax_settings.tax_enabled IS 'Whether tax calculation is enabled globally';
COMMENT ON COLUMN tax_settings.tax_percentage IS 'Tax percentage to apply (0-100)';
COMMENT ON COLUMN tax_settings.apply_to_rentals IS 'Whether to apply tax to rental bookings';
COMMENT ON COLUMN tax_settings.apply_to_tours IS 'Whether to apply tax to tour bookings';
COMMENT ON COLUMN tour_bookings.subtotal_amount IS 'Booking subtotal before tax (snapshot)';
COMMENT ON COLUMN tour_bookings.tax_enabled IS 'Whether tax was enabled when booking was created (snapshot)';
COMMENT ON COLUMN tour_bookings.tax_percent_applied IS 'Tax percentage applied to this booking (snapshot)';
COMMENT ON COLUMN tour_bookings.tax_amount IS 'Tax amount for this booking (snapshot)';