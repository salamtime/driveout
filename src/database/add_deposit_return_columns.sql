-- Migration: Add Deposit Return Tracking Columns
-- Description: Adds columns to track damage deposit returns with digital signature
-- Date: 2025-12-29

-- Add deposit return tracking columns to rentals table
ALTER TABLE app_4c3a7a6153_rentals 
ADD COLUMN IF NOT EXISTS deposit_return_signature_url TEXT,
ADD COLUMN IF NOT EXISTS deposit_returned_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS deposit_return_amount DECIMAL(10,2);

-- Add comments to document the columns
COMMENT ON COLUMN app_4c3a7a6153_rentals.deposit_return_signature_url IS 'URL of customer signature confirming deposit return receipt';
COMMENT ON COLUMN app_4c3a7a6153_rentals.deposit_returned_at IS 'Timestamp when damage deposit was returned to customer';
COMMENT ON COLUMN app_4c3a7a6153_rentals.deposit_return_amount IS 'Actual amount returned to customer (after deducting unpaid balance)';

-- Create index for querying deposit returns
CREATE INDEX IF NOT EXISTS idx_rentals_deposit_returned 
ON app_4c3a7a6153_rentals(deposit_returned_at) 
WHERE deposit_returned_at IS NOT NULL;