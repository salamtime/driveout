-- Enhanced Pricing Management Database Schema
-- This script creates tables for advanced dynamic pricing features

BEGIN;

-- Seasonal Pricing Rules Table
CREATE TABLE IF NOT EXISTS seasonal_pricing_rules (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    vehicle_model_id UUID REFERENCES saharax_0u4w4d_vehicle_models(id) ON DELETE CASCADE,
    season_name VARCHAR(100) NOT NULL,
    multiplier DECIMAL(4,2) NOT NULL DEFAULT 1.0,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    description TEXT,
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    
    CONSTRAINT valid_multiplier CHECK (multiplier > 0 AND multiplier <= 10),
    CONSTRAINT valid_date_range CHECK (end_date > start_date)
);

-- Discount Rules Table
CREATE TABLE IF NOT EXISTS discount_rules (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    vehicle_model_id UUID REFERENCES saharax_0u4w4d_vehicle_models(id) ON DELETE CASCADE,
    discount_type VARCHAR(50) NOT NULL, -- 'early_bird', 'last_minute', 'loyalty', 'group_booking', 'multi_day', 'corporate'
    discount_value DECIMAL(10,2) NOT NULL,
    discount_unit VARCHAR(20) NOT NULL DEFAULT 'percentage', -- 'percentage' or 'fixed'
    min_days INTEGER,
    max_days INTEGER,
    min_advance_booking INTEGER, -- minimum days in advance
    max_advance_booking INTEGER, -- maximum days in advance
    valid_from DATE,
    valid_to DATE,
    description TEXT,
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    
    CONSTRAINT valid_discount_value CHECK (discount_value >= 0),
    CONSTRAINT valid_discount_unit CHECK (discount_unit IN ('percentage', 'fixed')),
    CONSTRAINT valid_day_range CHECK (max_days IS NULL OR min_days IS NULL OR max_days >= min_days),
    CONSTRAINT valid_advance_booking CHECK (max_advance_booking IS NULL OR min_advance_booking IS NULL OR max_advance_booking >= min_advance_booking),
    CONSTRAINT valid_validity_period CHECK (valid_to IS NULL OR valid_from IS NULL OR valid_to >= valid_from)
);

-- Pricing Analytics Table (for storing daily metrics)
CREATE TABLE IF NOT EXISTS pricing_analytics (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    date DATE NOT NULL,
    vehicle_model_id UUID REFERENCES saharax_0u4w4d_vehicle_models(id) ON DELETE CASCADE,
    total_revenue DECIMAL(12,2) DEFAULT 0,
    total_bookings INTEGER DEFAULT 0,
    avg_price DECIMAL(10,2) DEFAULT 0,
    occupancy_rate DECIMAL(5,2) DEFAULT 0,
    seasonal_multiplier DECIMAL(4,2) DEFAULT 1.0,
    discount_applied DECIMAL(10,2) DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    
    UNIQUE(date, vehicle_model_id)
);

-- Revenue Metrics Table (aggregated data)
CREATE TABLE IF NOT EXISTS revenue_metrics (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    date DATE NOT NULL,
    total_revenue DECIMAL(12,2) DEFAULT 0,
    total_bookings INTEGER DEFAULT 0,
    avg_booking_value DECIMAL(10,2) DEFAULT 0,
    occupancy_rate DECIMAL(5,2) DEFAULT 0,
    customer_retention_rate DECIMAL(5,2) DEFAULT 0,
    seasonal_impact DECIMAL(10,2) DEFAULT 0,
    discount_impact DECIMAL(10,2) DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    
    UNIQUE(date)
);

-- Discount Usage Tracking Table
CREATE TABLE IF NOT EXISTS discount_usage (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    discount_rule_id UUID REFERENCES discount_rules(id) ON DELETE CASCADE,
    booking_id UUID, -- Reference to booking when implemented
    customer_id UUID, -- Reference to customer when implemented
    discount_amount DECIMAL(10,2) NOT NULL,
    original_price DECIMAL(10,2) NOT NULL,
    final_price DECIMAL(10,2) NOT NULL,
    usage_date TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_seasonal_pricing_dates ON seasonal_pricing_rules(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_seasonal_pricing_vehicle ON seasonal_pricing_rules(vehicle_model_id);
CREATE INDEX IF NOT EXISTS idx_seasonal_pricing_active ON seasonal_pricing_rules(active);

CREATE INDEX IF NOT EXISTS idx_discount_rules_type ON discount_rules(discount_type);
CREATE INDEX IF NOT EXISTS idx_discount_rules_vehicle ON discount_rules(vehicle_model_id);
CREATE INDEX IF NOT EXISTS idx_discount_rules_active ON discount_rules(active);
CREATE INDEX IF NOT EXISTS idx_discount_rules_validity ON discount_rules(valid_from, valid_to);

CREATE INDEX IF NOT EXISTS idx_pricing_analytics_date ON pricing_analytics(date);
CREATE INDEX IF NOT EXISTS idx_pricing_analytics_vehicle ON pricing_analytics(vehicle_model_id);

CREATE INDEX IF NOT EXISTS idx_revenue_metrics_date ON revenue_metrics(date);

CREATE INDEX IF NOT EXISTS idx_discount_usage_rule ON discount_usage(discount_rule_id);
CREATE INDEX IF NOT EXISTS idx_discount_usage_date ON discount_usage(usage_date);

-- Create updated_at trigger function if not exists
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = TIMEZONE('utc'::text, NOW());
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Add updated_at triggers
DROP TRIGGER IF EXISTS update_seasonal_pricing_rules_updated_at ON seasonal_pricing_rules;
CREATE TRIGGER update_seasonal_pricing_rules_updated_at
    BEFORE UPDATE ON seasonal_pricing_rules
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_discount_rules_updated_at ON discount_rules;
CREATE TRIGGER update_discount_rules_updated_at
    BEFORE UPDATE ON discount_rules
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Insert sample seasonal pricing rules
INSERT INTO seasonal_pricing_rules (vehicle_model_id, season_name, multiplier, start_date, end_date, description) VALUES
    (NULL, 'Peak Summer Season', 1.5, '2024-06-15', '2024-08-31', 'High demand summer period with premium pricing'),
    (NULL, 'Holiday Premium', 2.0, '2024-12-20', '2024-01-05', 'Christmas and New Year premium rates'),
    (NULL, 'Spring High Season', 1.25, '2024-03-15', '2024-05-31', 'Spring travel season with moderate premium'),
    (NULL, 'Winter Low Season', 0.8, '2024-01-15', '2024-03-14', 'Off-season rates to encourage bookings'),
    (NULL, 'Fall Normal Season', 1.0, '2024-09-01', '2024-11-30', 'Standard fall pricing')
ON CONFLICT DO NOTHING;

-- Insert sample discount rules
INSERT INTO discount_rules (vehicle_model_id, discount_type, discount_value, discount_unit, min_advance_booking, description) VALUES
    (NULL, 'early_bird', 15, 'percentage', 30, 'Early bird discount for bookings 30+ days in advance'),
    (NULL, 'early_bird', 10, 'percentage', 14, 'Early bird discount for bookings 14+ days in advance'),
    (NULL, 'last_minute', 20, 'percentage', NULL, 'Last minute deals for same-day bookings'),
    (NULL, 'multi_day', 10, 'percentage', NULL, 'Multi-day rental discount for 3+ days'),
    (NULL, 'multi_day', 15, 'percentage', NULL, 'Extended rental discount for 7+ days'),
    (NULL, 'loyalty', 12, 'percentage', NULL, 'Loyalty customer discount'),
    (NULL, 'group_booking', 18, 'percentage', NULL, 'Group booking discount for multiple vehicles'),
    (NULL, 'corporate', 15, 'percentage', NULL, 'Corporate customer discount')
ON CONFLICT DO NOTHING;

-- Update discount rules with proper conditions
UPDATE discount_rules SET min_days = 3 WHERE discount_type = 'multi_day' AND discount_value = 10;
UPDATE discount_rules SET min_days = 7 WHERE discount_type = 'multi_day' AND discount_value = 15;
UPDATE discount_rules SET max_advance_booking = 1 WHERE discount_type = 'last_minute';

-- Insert sample analytics data (last 30 days)
INSERT INTO revenue_metrics (date, total_revenue, total_bookings, avg_booking_value, occupancy_rate, customer_retention_rate)
SELECT 
    date_series.date,
    (RANDOM() * 20000 + 10000)::DECIMAL(12,2) as total_revenue,
    (RANDOM() * 40 + 20)::INTEGER as total_bookings,
    (RANDOM() * 200 + 400)::DECIMAL(10,2) as avg_booking_value,
    (RANDOM() * 30 + 60)::DECIMAL(5,2) as occupancy_rate,
    (RANDOM() * 20 + 50)::DECIMAL(5,2) as customer_retention_rate
FROM generate_series(
    CURRENT_DATE - INTERVAL '30 days',
    CURRENT_DATE - INTERVAL '1 day',
    INTERVAL '1 day'
) AS date_series(date)
ON CONFLICT (date) DO NOTHING;

-- Setup Row Level Security (RLS)
ALTER TABLE seasonal_pricing_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE discount_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE pricing_analytics ENABLE ROW LEVEL SECURITY;
ALTER TABLE revenue_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE discount_usage ENABLE ROW LEVEL SECURITY;

-- Create RLS policies (allow all for authenticated users, restrict for public)
CREATE POLICY "allow_authenticated_seasonal_pricing" ON seasonal_pricing_rules FOR ALL TO authenticated USING (true);
CREATE POLICY "allow_authenticated_discount_rules" ON discount_rules FOR ALL TO authenticated USING (true);
CREATE POLICY "allow_authenticated_pricing_analytics" ON pricing_analytics FOR ALL TO authenticated USING (true);
CREATE POLICY "allow_authenticated_revenue_metrics" ON revenue_metrics FOR ALL TO authenticated USING (true);
CREATE POLICY "allow_authenticated_discount_usage" ON discount_usage FOR ALL TO authenticated USING (true);

-- Allow read access for public (for pricing calculations)
CREATE POLICY "allow_public_read_seasonal_pricing" ON seasonal_pricing_rules FOR SELECT TO public USING (active = true);
CREATE POLICY "allow_public_read_discount_rules" ON discount_rules FOR SELECT TO public USING (active = true);

COMMIT;