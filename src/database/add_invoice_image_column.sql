-- Add invoice_image column to vehicle_fuel_refills table
ALTER TABLE vehicle_fuel_refills 
ADD COLUMN IF NOT EXISTS invoice_image JSONB;

-- Add invoice_image column to fuel_refills table as well
ALTER TABLE fuel_refills 
ADD COLUMN IF NOT EXISTS invoice_image JSONB;

-- Add comments for documentation
COMMENT ON COLUMN vehicle_fuel_refills.invoice_image IS 'Stores invoice image metadata: {type, path, url, name, size, contentType}';
COMMENT ON COLUMN fuel_refills.invoice_image IS 'Stores invoice image metadata: {type, path, url, name, size, contentType}';

-- Create storage bucket for fuel invoices if it doesn't exist
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'fuel-invoices',
  'fuel-invoices', 
  true,
  10485760, -- 10MB limit
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'application/pdf']
) ON CONFLICT (id) DO NOTHING;

-- Set up RLS policies for fuel-invoices bucket
CREATE POLICY "Allow authenticated users to upload fuel invoices" ON storage.objects
FOR INSERT WITH CHECK (
  bucket_id = 'fuel-invoices' AND 
  auth.role() = 'authenticated'
);

CREATE POLICY "Allow authenticated users to view fuel invoices" ON storage.objects
FOR SELECT USING (
  bucket_id = 'fuel-invoices' AND 
  auth.role() = 'authenticated'
);

CREATE POLICY "Allow authenticated users to update fuel invoices" ON storage.objects
FOR UPDATE USING (
  bucket_id = 'fuel-invoices' AND 
  auth.role() = 'authenticated'
);

CREATE POLICY "Allow authenticated users to delete fuel invoices" ON storage.objects
FOR DELETE USING (
  bucket_id = 'fuel-invoices' AND 
  auth.role() = 'authenticated'
);
