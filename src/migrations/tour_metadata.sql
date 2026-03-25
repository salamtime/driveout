-- Create tour_metadata table
BEGIN;

-- Create the tour_metadata table if it doesn't exist
CREATE TABLE IF NOT EXISTS tour_metadata (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  location TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS tour_metadata_name_idx ON tour_metadata(name);
CREATE INDEX IF NOT EXISTS tour_metadata_location_idx ON tour_metadata(location);

-- Add RLS policies
ALTER TABLE tour_metadata ENABLE ROW LEVEL SECURITY;

-- Allow admins to read all tour metadata
CREATE POLICY "tour_metadata_read_policy" 
ON tour_metadata FOR SELECT 
USING (true);

-- Allow admins to insert tour metadata
CREATE POLICY "tour_metadata_insert_policy" 
ON tour_metadata FOR INSERT 
WITH CHECK (true);

-- Allow admins to update their tour metadata
CREATE POLICY "tour_metadata_update_policy" 
ON tour_metadata FOR UPDATE 
USING (true);

-- Allow admins to delete tour metadata
CREATE POLICY "tour_metadata_delete_policy" 
ON tour_metadata FOR DELETE 
USING (true);

COMMIT;