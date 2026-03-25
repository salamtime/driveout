-- =====================================================
-- RENTAL EXTENSION SYSTEM WITH TIERED PRICING
-- Migration Script for Complete Extension Functionality
-- =====================================================

BEGIN;

-- =====================================================
-- 1. CREATE rental_extensions TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS rental_extensions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    rental_id UUID NOT NULL REFERENCES app_4c3a7a6153_rentals(id) ON DELETE CASCADE,
    extension_hours INTEGER NOT NULL CHECK (extension_hours > 0),
    extension_price DECIMAL(10, 2) NOT NULL CHECK (extension_price >= 0),
    calculation_method VARCHAR(20) NOT NULL DEFAULT 'auto' CHECK (calculation_method IN ('auto', 'manual')),
    price_source VARCHAR(20) NOT NULL DEFAULT 'tiered' CHECK (price_source IN ('tiered', 'manual', 'negotiated')),
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'active', 'completed')),
    requested_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    approved_at TIMESTAMP WITH TIME ZONE,
    approved_by_id UUID REFERENCES app_4c3a7a6153_users(id),
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    notes TEXT,
    tier_breakdown JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_rental_extensions_rental_id ON rental_extensions(rental_id);
CREATE INDEX IF NOT EXISTS idx_rental_extensions_status ON rental_extensions(status);
CREATE INDEX IF NOT EXISTS idx_rental_extensions_requested_at ON rental_extensions(requested_at DESC);

-- =====================================================
-- 2. ADD EXTENSION COLUMNS TO app_4c3a7a6153_rentals
-- =====================================================
ALTER TABLE app_4c3a7a6153_rentals 
ADD COLUMN IF NOT EXISTS current_extension_id UUID REFERENCES rental_extensions(id),
ADD COLUMN IF NOT EXISTS total_extended_hours INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_extension_price DECIMAL(10, 2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS next_payment_due TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS original_end_date TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS extension_count INTEGER DEFAULT 0;

-- Create index for extension lookup
CREATE INDEX IF NOT EXISTS idx_rentals_current_extension ON app_4c3a7a6153_rentals(current_extension_id);

-- =====================================================
-- 3. CREATE FUNCTION: Calculate Extension Price with Tiered Pricing
-- =====================================================
CREATE OR REPLACE FUNCTION calculate_extension_price(
    p_rental_id UUID,
    p_extension_hours INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
    v_rental RECORD;
    v_base_price RECORD;
    v_current_hours INTEGER;
    v_new_total_hours INTEGER;
    v_extension_price DECIMAL(10, 2) := 0;
    v_tier_breakdown JSONB := '[]'::JSONB;
    v_tier RECORD;
    v_hours_in_tier INTEGER;
    v_tier_price DECIMAL(10, 2);
    v_remaining_hours INTEGER;
    v_start_hour INTEGER;
BEGIN
    -- Get rental details
    SELECT r.*, 
           EXTRACT(EPOCH FROM (r.rental_end_date - r.rental_start_date)) / 3600 AS current_duration_hours
    INTO v_rental
    FROM app_4c3a7a6153_rentals r
    WHERE r.id = p_rental_id;
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Rental not found: %', p_rental_id;
    END IF;
    
    -- Get base price for the vehicle
    SELECT bp.*, vm.name as vehicle_name
    INTO v_base_price
    FROM app_4c3a7a6153_base_prices bp
    JOIN saharax_0u4w4d_vehicle_models vm ON vm.id = bp.vehicle_model_id
    WHERE bp.vehicle_model_id = v_rental.vehicle_model_id
      AND bp.is_active = true
    LIMIT 1;
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'No active base price found for vehicle model';
    END IF;
    
    -- Calculate current and new total hours
    v_current_hours := CEIL(v_rental.current_duration_hours);
    v_new_total_hours := v_current_hours + p_extension_hours;
    
    -- Check if dynamic pricing is enabled
    IF v_base_price.dynamic_pricing_enabled THEN
        -- Calculate using tiered pricing
        v_remaining_hours := p_extension_hours;
        v_start_hour := v_current_hours + 1;
        
        -- Loop through pricing tiers for the extension hours
        FOR v_tier IN 
            SELECT * FROM pricing_tiers
            WHERE vehicle_model_id = v_rental.vehicle_model_id
              AND is_active = true
            ORDER BY min_hours ASC
        LOOP
            -- Check if this tier applies to any of the extension hours
            IF v_start_hour <= v_tier.max_hours AND v_remaining_hours > 0 THEN
                -- Calculate how many hours fall in this tier
                v_hours_in_tier := LEAST(
                    v_remaining_hours,
                    v_tier.max_hours - v_start_hour + 1
                );
                
                -- Calculate price for this tier segment
                IF v_tier.calculation_method = 'percentage' THEN
                    v_tier_price := v_base_price.hourly_price * v_hours_in_tier * (1 - v_tier.discount_percentage / 100.0);
                ELSIF v_tier.calculation_method = 'fixed' THEN
                    v_tier_price := v_tier.price_amount * v_hours_in_tier;
                ELSE
                    v_tier_price := v_base_price.hourly_price * v_hours_in_tier;
                END IF;
                
                -- Add to total extension price
                v_extension_price := v_extension_price + v_tier_price;
                
                -- Add tier breakdown
                v_tier_breakdown := v_tier_breakdown || jsonb_build_object(
                    'tier_id', v_tier.id,
                    'min_hours', v_tier.min_hours,
                    'max_hours', v_tier.max_hours,
                    'hours_in_tier', v_hours_in_tier,
                    'rate_per_hour', CASE 
                        WHEN v_tier.calculation_method = 'percentage' 
                        THEN v_base_price.hourly_price * (1 - v_tier.discount_percentage / 100.0)
                        ELSE v_tier.price_amount
                    END,
                    'tier_total', v_tier_price,
                    'discount_percentage', v_tier.discount_percentage
                );
                
                -- Update counters
                v_remaining_hours := v_remaining_hours - v_hours_in_tier;
                v_start_hour := v_start_hour + v_hours_in_tier;
            END IF;
            
            EXIT WHEN v_remaining_hours <= 0;
        END LOOP;
        
        -- If there are still remaining hours (beyond all tiers), use base hourly rate
        IF v_remaining_hours > 0 THEN
            v_tier_price := v_base_price.hourly_price * v_remaining_hours;
            v_extension_price := v_extension_price + v_tier_price;
            
            v_tier_breakdown := v_tier_breakdown || jsonb_build_object(
                'tier_id', NULL,
                'min_hours', v_start_hour,
                'max_hours', v_new_total_hours,
                'hours_in_tier', v_remaining_hours,
                'rate_per_hour', v_base_price.hourly_price,
                'tier_total', v_tier_price,
                'discount_percentage', 0
            );
        END IF;
    ELSE
        -- Simple calculation: hourly_price * extension_hours
        v_extension_price := v_base_price.hourly_price * p_extension_hours;
        v_tier_breakdown := jsonb_build_array(
            jsonb_build_object(
                'tier_id', NULL,
                'hours_in_tier', p_extension_hours,
                'rate_per_hour', v_base_price.hourly_price,
                'tier_total', v_extension_price,
                'discount_percentage', 0
            )
        );
    END IF;
    
    -- Return result
    RETURN jsonb_build_object(
        'extension_price', v_extension_price,
        'tier_breakdown', v_tier_breakdown,
        'current_hours', v_current_hours,
        'extension_hours', p_extension_hours,
        'new_total_hours', v_new_total_hours,
        'base_hourly_rate', v_base_price.hourly_price,
        'dynamic_pricing_enabled', v_base_price.dynamic_pricing_enabled
    );
END;
$$;

-- =====================================================
-- 4. CREATE FUNCTION: Auto-update rental timestamps
-- =====================================================
CREATE OR REPLACE FUNCTION update_rental_extension_timestamps()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = TIMEZONE('utc'::text, NOW());
    RETURN NEW;
END;
$$;

-- Create trigger for rental_extensions
DROP TRIGGER IF EXISTS trg_update_rental_extensions_timestamp ON rental_extensions;
CREATE TRIGGER trg_update_rental_extensions_timestamp
    BEFORE UPDATE ON rental_extensions
    FOR EACH ROW
    EXECUTE FUNCTION update_rental_extension_timestamps();

-- =====================================================
-- 5. SETUP ROW LEVEL SECURITY (RLS)
-- =====================================================
ALTER TABLE rental_extensions ENABLE ROW LEVEL SECURITY;

-- Policy: Allow authenticated users to read all extensions
CREATE POLICY "allow_read_all_extensions" ON rental_extensions
    FOR SELECT
    TO authenticated
    USING (true);

-- Policy: Allow authenticated users to insert extensions
CREATE POLICY "allow_insert_extensions" ON rental_extensions
    FOR INSERT
    TO authenticated
    WITH CHECK (true);

-- Policy: Allow users to update their own extensions or admins to update any
CREATE POLICY "allow_update_extensions" ON rental_extensions
    FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM app_4c3a7a6153_users u
            WHERE u.id = auth.uid()
            AND (u.role IN ('admin', 'owner') OR rental_extensions.requested_at IS NOT NULL)
        )
    );

-- =====================================================
-- 6. CREATE HELPER VIEWS
-- =====================================================

-- View: Active extensions with rental details
CREATE OR REPLACE VIEW v_active_extensions AS
SELECT 
    re.*,
    r.customer_name,
    r.customer_phone,
    r.rental_status,
    r.rental_start_date,
    r.rental_end_date,
    v.name as vehicle_name,
    v.model as vehicle_model,
    v.plate_number
FROM rental_extensions re
JOIN app_4c3a7a6153_rentals r ON r.id = re.rental_id
JOIN saharax_0u4w4d_vehicles v ON v.id = r.vehicle_id
WHERE re.status IN ('pending', 'approved', 'active');

-- View: Extension history with calculations
CREATE OR REPLACE VIEW v_extension_history AS
SELECT 
    re.*,
    r.customer_name,
    r.rental_start_date,
    r.rental_end_date,
    r.total_amount as original_rental_amount,
    (r.total_amount + COALESCE(r.total_extension_price, 0)) as total_with_extensions,
    v.name as vehicle_name
FROM rental_extensions re
JOIN app_4c3a7a6153_rentals r ON r.id = re.rental_id
JOIN saharax_0u4w4d_vehicles v ON v.id = r.vehicle_id
ORDER BY re.requested_at DESC;

COMMIT;

-- =====================================================
-- VERIFICATION QUERIES (Run these to verify installation)
-- =====================================================
-- SELECT COUNT(*) FROM rental_extensions;
-- SELECT * FROM v_active_extensions LIMIT 5;
-- SELECT calculate_extension_price('your-rental-id-here'::UUID, 2);