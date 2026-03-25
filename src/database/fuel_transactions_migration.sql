-- =============================================
-- Fuel Transactions Management System
-- Complete PostgreSQL Schema Migration
-- =============================================

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================
-- 1. MAIN FUEL TRANSACTIONS TABLE
-- =============================================

CREATE TABLE IF NOT EXISTS fuel_transactions (
    id BIGSERIAL PRIMARY KEY,
    
    -- Transaction Details
    transaction_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    transaction_type VARCHAR(20) NOT NULL CHECK (transaction_type IN ('refill', 'withdrawal')),
    
    -- Vehicle Reference (assumes existing vehicles table)
    vehicle_id BIGINT NOT NULL,
    
    -- Fuel Information
    fuel_type VARCHAR(20) NOT NULL DEFAULT 'gasoline' CHECK (fuel_type IN ('gasoline', 'diesel', 'premium')),
    amount DECIMAL(10,3) NOT NULL CHECK (amount > 0), -- Liters with 3 decimal precision
    
    -- Cost Information
    cost DECIMAL(12,2) NOT NULL DEFAULT 0 CHECK (cost >= 0), -- MAD currency
    
    -- Location Information
    fuel_station VARCHAR(255),
    location VARCHAR(255),
    
    -- Vehicle State
    odometer_reading INTEGER CHECK (odometer_reading >= 0), -- km
    
    -- Documentation
    receipt_url TEXT, -- URL to uploaded receipt
    notes TEXT,
    
    -- Audit Fields
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by UUID, -- User ID from auth system
    
    -- Constraints
    CONSTRAINT fk_fuel_transactions_vehicle 
        FOREIGN KEY (vehicle_id) 
        REFERENCES vehicles(id) 
        ON DELETE CASCADE,
        
    CONSTRAINT valid_transaction_data 
        CHECK (
            (transaction_type = 'refill' AND cost >= 0) OR 
            (transaction_type = 'withdrawal' AND cost = 0)
        )
);

-- =============================================
-- 2. INDEXES FOR PERFORMANCE
-- =============================================

-- Primary query indexes
CREATE INDEX IF NOT EXISTS idx_fuel_transactions_vehicle_id ON fuel_transactions(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_fuel_transactions_date ON fuel_transactions(transaction_date DESC);
CREATE INDEX IF NOT EXISTS idx_fuel_transactions_type ON fuel_transactions(transaction_type);
CREATE INDEX IF NOT EXISTS idx_fuel_transactions_fuel_type ON fuel_transactions(fuel_type);

-- Composite indexes for common queries
CREATE INDEX IF NOT EXISTS idx_fuel_transactions_vehicle_date ON fuel_transactions(vehicle_id, transaction_date DESC);
CREATE INDEX IF NOT EXISTS idx_fuel_transactions_type_date ON fuel_transactions(transaction_type, transaction_date DESC);

-- Search indexes
CREATE INDEX IF NOT EXISTS idx_fuel_transactions_station ON fuel_transactions(fuel_station) WHERE fuel_station IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_fuel_transactions_location ON fuel_transactions(location) WHERE location IS NOT NULL;

-- Full-text search index for notes
CREATE INDEX IF NOT EXISTS idx_fuel_transactions_notes_fts ON fuel_transactions USING gin(to_tsvector('english', notes)) WHERE notes IS NOT NULL;

-- =============================================
-- 3. TRIGGERS FOR AUTOMATIC UPDATES
-- =============================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_fuel_transactions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for updated_at
DROP TRIGGER IF EXISTS trigger_fuel_transactions_updated_at ON fuel_transactions;
CREATE TRIGGER trigger_fuel_transactions_updated_at
    BEFORE UPDATE ON fuel_transactions
    FOR EACH ROW
    EXECUTE FUNCTION update_fuel_transactions_updated_at();

-- =============================================
-- 4. ROW LEVEL SECURITY (RLS)
-- =============================================

-- Enable RLS
ALTER TABLE fuel_transactions ENABLE ROW LEVEL SECURITY;

-- Policy for authenticated users to see all transactions
CREATE POLICY "Users can view all fuel transactions" ON fuel_transactions
    FOR SELECT USING (auth.role() = 'authenticated');

-- Policy for authenticated users to insert transactions
CREATE POLICY "Users can insert fuel transactions" ON fuel_transactions
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- Policy for users to update their own transactions or admins to update any
CREATE POLICY "Users can update fuel transactions" ON fuel_transactions
    FOR UPDATE USING (
        auth.role() = 'authenticated' AND 
        (created_by = auth.uid() OR auth.jwt() ->> 'role' = 'admin')
    );

-- Policy for users to delete their own transactions or admins to delete any
CREATE POLICY "Users can delete fuel transactions" ON fuel_transactions
    FOR DELETE USING (
        auth.role() = 'authenticated' AND 
        (created_by = auth.uid() OR auth.jwt() ->> 'role' = 'admin')
    );

-- =============================================
-- 5. VIEWS FOR ANALYTICS
-- =============================================

-- Monthly fuel consumption summary
CREATE OR REPLACE VIEW fuel_monthly_summary AS
SELECT 
    DATE_TRUNC('month', transaction_date) as month,
    vehicle_id,
    transaction_type,
    fuel_type,
    COUNT(*) as transaction_count,
    SUM(amount) as total_amount,
    SUM(cost) as total_cost,
    AVG(cost / NULLIF(amount, 0)) as avg_cost_per_liter
FROM fuel_transactions
GROUP BY DATE_TRUNC('month', transaction_date), vehicle_id, transaction_type, fuel_type
ORDER BY month DESC, vehicle_id;

-- Vehicle fuel efficiency view
CREATE OR REPLACE VIEW vehicle_fuel_efficiency AS
WITH vehicle_stats AS (
    SELECT 
        vehicle_id,
        SUM(CASE WHEN transaction_type = 'refill' THEN amount ELSE 0 END) as total_fuel_added,
        SUM(CASE WHEN transaction_type = 'withdrawal' THEN amount ELSE 0 END) as total_fuel_used,
        SUM(CASE WHEN transaction_type = 'refill' THEN cost ELSE 0 END) as total_cost,
        COUNT(CASE WHEN transaction_type = 'refill' THEN 1 END) as refill_count,
        COUNT(CASE WHEN transaction_type = 'withdrawal' THEN 1 END) as withdrawal_count,
        MAX(odometer_reading) - MIN(odometer_reading) as distance_traveled
    FROM fuel_transactions
    WHERE transaction_date >= NOW() - INTERVAL '12 months'
    GROUP BY vehicle_id
)
SELECT 
    vs.*,
    CASE 
        WHEN vs.total_fuel_added > 0 THEN vs.total_cost / vs.total_fuel_added 
        ELSE 0 
    END as avg_cost_per_liter,
    CASE 
        WHEN vs.distance_traveled > 0 AND vs.total_fuel_added > 0 
        THEN vs.distance_traveled / vs.total_fuel_added 
        ELSE NULL 
    END as km_per_liter
FROM vehicle_stats vs;

-- Daily fuel transactions summary
CREATE OR REPLACE VIEW daily_fuel_summary AS
SELECT 
    DATE(transaction_date) as date,
    COUNT(*) as total_transactions,
    COUNT(CASE WHEN transaction_type = 'refill' THEN 1 END) as refills,
    COUNT(CASE WHEN transaction_type = 'withdrawal' THEN 1 END) as withdrawals,
    SUM(amount) as total_amount,
    SUM(cost) as total_cost,
    COUNT(DISTINCT vehicle_id) as vehicles_involved
FROM fuel_transactions
GROUP BY DATE(transaction_date)
ORDER BY date DESC;

-- =============================================
-- 6. STORED FUNCTIONS
-- =============================================

-- Function to get vehicle fuel summary
CREATE OR REPLACE FUNCTION get_vehicle_fuel_summary(
    p_vehicle_id BIGINT,
    p_days INTEGER DEFAULT 30
)
RETURNS TABLE (
    vehicle_id BIGINT,
    period_start DATE,
    period_end DATE,
    total_refills BIGINT,
    total_withdrawals BIGINT,
    total_fuel_added DECIMAL,
    total_fuel_used DECIMAL,
    net_fuel DECIMAL,
    total_cost DECIMAL,
    avg_cost_per_liter DECIMAL,
    last_refill_date TIMESTAMPTZ,
    last_withdrawal_date TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    WITH period_data AS (
        SELECT 
            p_vehicle_id as vid,
            CURRENT_DATE - p_days as start_date,
            CURRENT_DATE as end_date
    ),
    fuel_stats AS (
        SELECT 
            ft.vehicle_id,
            COUNT(CASE WHEN ft.transaction_type = 'refill' THEN 1 END) as refills,
            COUNT(CASE WHEN ft.transaction_type = 'withdrawal' THEN 1 END) as withdrawals,
            COALESCE(SUM(CASE WHEN ft.transaction_type = 'refill' THEN ft.amount END), 0) as fuel_added,
            COALESCE(SUM(CASE WHEN ft.transaction_type = 'withdrawal' THEN ft.amount END), 0) as fuel_used,
            COALESCE(SUM(ft.cost), 0) as cost,
            MAX(CASE WHEN ft.transaction_type = 'refill' THEN ft.transaction_date END) as last_refill,
            MAX(CASE WHEN ft.transaction_type = 'withdrawal' THEN ft.transaction_date END) as last_withdrawal
        FROM fuel_transactions ft
        CROSS JOIN period_data pd
        WHERE ft.vehicle_id = p_vehicle_id
        AND ft.transaction_date >= pd.start_date
        AND ft.transaction_date <= pd.end_date
        GROUP BY ft.vehicle_id
    )
    SELECT 
        pd.vid,
        pd.start_date,
        pd.end_date,
        COALESCE(fs.refills, 0),
        COALESCE(fs.withdrawals, 0),
        COALESCE(fs.fuel_added, 0),
        COALESCE(fs.fuel_used, 0),
        COALESCE(fs.fuel_added, 0) - COALESCE(fs.fuel_used, 0),
        COALESCE(fs.cost, 0),
        CASE 
            WHEN COALESCE(fs.fuel_added, 0) > 0 
            THEN COALESCE(fs.cost, 0) / fs.fuel_added 
            ELSE 0 
        END,
        fs.last_refill,
        fs.last_withdrawal
    FROM period_data pd
    LEFT JOIN fuel_stats fs ON fs.vehicle_id = pd.vid;
END;
$$ LANGUAGE plpgsql;

-- Function to calculate fuel consumption trends
CREATE OR REPLACE FUNCTION get_fuel_consumption_trends(
    p_months INTEGER DEFAULT 12
)
RETURNS TABLE (
    month DATE,
    total_transactions BIGINT,
    total_refills BIGINT,
    total_withdrawals BIGINT,
    total_amount DECIMAL,
    total_cost DECIMAL,
    avg_cost_per_liter DECIMAL,
    active_vehicles BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        DATE_TRUNC('month', ft.transaction_date)::DATE,
        COUNT(*),
        COUNT(CASE WHEN ft.transaction_type = 'refill' THEN 1 END),
        COUNT(CASE WHEN ft.transaction_type = 'withdrawal' THEN 1 END),
        SUM(ft.amount),
        SUM(ft.cost),
        CASE 
            WHEN SUM(CASE WHEN ft.transaction_type = 'refill' THEN ft.amount END) > 0
            THEN SUM(CASE WHEN ft.transaction_type = 'refill' THEN ft.cost END) / 
                 SUM(CASE WHEN ft.transaction_type = 'refill' THEN ft.amount END)
            ELSE 0
        END,
        COUNT(DISTINCT ft.vehicle_id)
    FROM fuel_transactions ft
    WHERE ft.transaction_date >= DATE_TRUNC('month', CURRENT_DATE - INTERVAL '1 month' * p_months)
    GROUP BY DATE_TRUNC('month', ft.transaction_date)
    ORDER BY DATE_TRUNC('month', ft.transaction_date) DESC;
END;
$$ LANGUAGE plpgsql;

-- =============================================
-- 7. SAMPLE DATA (OPTIONAL - FOR TESTING)
-- =============================================

-- Insert sample fuel transactions (uncomment if needed for testing)
/*
INSERT INTO fuel_transactions (
    vehicle_id, transaction_type, fuel_type, amount, cost, 
    fuel_station, location, odometer_reading, notes
) VALUES 
    (1, 'refill', 'gasoline', 45.50, 650.00, 'Shell Station', 'Marrakech Center', 15000, 'Regular refill'),
    (1, 'withdrawal', 'gasoline', 8.20, 0, NULL, 'Desert Tour', 15250, 'Tour consumption'),
    (2, 'refill', 'diesel', 38.75, 580.00, 'Total Station', 'Agadir Port', 8500, 'Full tank'),
    (2, 'withdrawal', 'diesel', 12.30, 0, NULL, 'City Tour', 8650, 'City exploration'),
    (3, 'refill', 'premium', 42.00, 750.00, 'Afriquia', 'Casablanca Airport', 22000, 'Premium fuel for performance');
*/

-- =============================================
-- 8. GRANTS AND PERMISSIONS
-- =============================================

-- Grant permissions to authenticated users
GRANT SELECT, INSERT, UPDATE, DELETE ON fuel_transactions TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE fuel_transactions_id_seq TO authenticated;

-- Grant read access to views
GRANT SELECT ON fuel_monthly_summary TO authenticated;
GRANT SELECT ON vehicle_fuel_efficiency TO authenticated;
GRANT SELECT ON daily_fuel_summary TO authenticated;

-- Grant execute permissions on functions
GRANT EXECUTE ON FUNCTION get_vehicle_fuel_summary(BIGINT, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION get_fuel_consumption_trends(INTEGER) TO authenticated;

-- =============================================
-- 9. STORAGE BUCKET FOR RECEIPTS
-- =============================================

-- Create storage bucket for fuel receipts (Supabase specific)
INSERT INTO storage.buckets (id, name, public) 
VALUES ('fuel-receipts', 'fuel-receipts', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for fuel receipts
CREATE POLICY "Users can upload fuel receipts" ON storage.objects
    FOR INSERT WITH CHECK (
        bucket_id = 'fuel-receipts' AND 
        auth.role() = 'authenticated'
    );

CREATE POLICY "Users can view fuel receipts" ON storage.objects
    FOR SELECT USING (
        bucket_id = 'fuel-receipts' AND 
        auth.role() = 'authenticated'
    );

CREATE POLICY "Users can update their fuel receipts" ON storage.objects
    FOR UPDATE USING (
        bucket_id = 'fuel-receipts' AND 
        auth.role() = 'authenticated'
    );

CREATE POLICY "Users can delete their fuel receipts" ON storage.objects
    FOR DELETE USING (
        bucket_id = 'fuel-receipts' AND 
        auth.role() = 'authenticated'
    );

-- =============================================
-- MIGRATION COMPLETE
-- =============================================

-- Add helpful comments
COMMENT ON TABLE fuel_transactions IS 'Stores all fuel transactions (refills and withdrawals) for vehicle fleet management';
COMMENT ON COLUMN fuel_transactions.transaction_type IS 'Type of transaction: refill (adding fuel) or withdrawal (using fuel)';
COMMENT ON COLUMN fuel_transactions.amount IS 'Amount of fuel in liters (3 decimal precision)';
COMMENT ON COLUMN fuel_transactions.cost IS 'Cost in MAD currency (2 decimal precision)';
COMMENT ON COLUMN fuel_transactions.odometer_reading IS 'Vehicle odometer reading in kilometers at time of transaction';

-- Success message
DO $$
BEGIN
    RAISE NOTICE 'Fuel Transactions Management System migration completed successfully!';
    RAISE NOTICE 'Created: fuel_transactions table with indexes, triggers, RLS policies, views, and functions';
    RAISE NOTICE 'Storage bucket: fuel-receipts created for receipt uploads';
END $$;
