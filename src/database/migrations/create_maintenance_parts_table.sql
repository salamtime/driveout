-- Migration: Create maintenance parts junction table
-- This table tracks individual parts used in maintenance records

CREATE TABLE IF NOT EXISTS app_687f658e98_maintenance_parts (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  maintenance_id uuid REFERENCES app_687f658e98_maintenance(id) ON DELETE CASCADE,
  item_id integer REFERENCES saharax_0u4w4d_inventory_items(id),
  quantity numeric NOT NULL CHECK (quantity > 0),
  unit_cost_mad numeric NOT NULL CHECK (unit_cost_mad >= 0),
  total_cost_mad numeric GENERATED ALWAYS AS (quantity * unit_cost_mad) STORED,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_maintenance_parts_maintenance_id ON app_687f658e98_maintenance_parts(maintenance_id);
CREATE INDEX IF NOT EXISTS idx_maintenance_parts_item_id ON app_687f658e98_maintenance_parts(item_id);

-- Enable RLS if needed
ALTER TABLE app_687f658e98_maintenance_parts ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for authenticated users
CREATE POLICY "Allow authenticated read access" ON app_687f658e98_maintenance_parts
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow authenticated insert access" ON app_687f658e98_maintenance_parts
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Allow authenticated update access" ON app_687f658e98_maintenance_parts
  FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Allow authenticated delete access" ON app_687f658e98_maintenance_parts
  FOR DELETE TO authenticated USING (true);

-- Add trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_maintenance_parts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_maintenance_parts_updated_at
  BEFORE UPDATE ON app_687f658e98_maintenance_parts
  FOR EACH ROW EXECUTE FUNCTION update_maintenance_parts_updated_at();

-- Comments for documentation
COMMENT ON TABLE app_687f658e98_maintenance_parts IS 'Junction table tracking individual parts used in maintenance records';
COMMENT ON COLUMN app_687f658e98_maintenance_parts.maintenance_id IS 'Reference to maintenance record';
COMMENT ON COLUMN app_687f658e98_maintenance_parts.item_id IS 'Reference to inventory item';
COMMENT ON COLUMN app_687f658e98_maintenance_parts.quantity IS 'Quantity of item used';
COMMENT ON COLUMN app_687f658e98_maintenance_parts.unit_cost_mad IS 'Unit cost snapshot at time of maintenance';
COMMENT ON COLUMN app_687f658e98_maintenance_parts.total_cost_mad IS 'Calculated total cost (quantity × unit_cost_mad)';