import { supabase } from '../lib/supabase';

/**
 * Migration runner for maintenance parts table
 * Run this once to create the maintenance_parts junction table
 */
export async function runMaintenancePartsMigration() {
  console.log('🔄 Running maintenance parts migration...');

  try {
    // Create the maintenance parts table
    const { data, error } = await supabase.rpc('exec_sql', {
      sql: `
        -- Create maintenance parts junction table
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

        -- Enable RLS
        ALTER TABLE app_687f658e98_maintenance_parts ENABLE ROW LEVEL SECURITY;

        -- Create RLS policies for authenticated users
        DROP POLICY IF EXISTS "Allow authenticated read access" ON app_687f658e98_maintenance_parts;
        CREATE POLICY "Allow authenticated read access" ON app_687f658e98_maintenance_parts
          FOR SELECT TO authenticated USING (true);

        DROP POLICY IF EXISTS "Allow authenticated insert access" ON app_687f658e98_maintenance_parts;
        CREATE POLICY "Allow authenticated insert access" ON app_687f658e98_maintenance_parts
          FOR INSERT TO authenticated WITH CHECK (true);

        DROP POLICY IF EXISTS "Allow authenticated update access" ON app_687f658e98_maintenance_parts;
        CREATE POLICY "Allow authenticated update access" ON app_687f658e98_maintenance_parts
          FOR UPDATE TO authenticated USING (true);

        DROP POLICY IF EXISTS "Allow authenticated delete access" ON app_687f658e98_maintenance_parts;
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

        DROP TRIGGER IF EXISTS update_maintenance_parts_updated_at ON app_687f658e98_maintenance_parts;
        CREATE TRIGGER update_maintenance_parts_updated_at
          BEFORE UPDATE ON app_687f658e98_maintenance_parts
          FOR EACH ROW EXECUTE FUNCTION update_maintenance_parts_updated_at();
      `
    });

    if (error) {
      console.error('❌ Migration failed:', error);
      throw error;
    }

    console.log('✅ Maintenance parts migration completed successfully');
    return { success: true, message: 'Migration completed successfully' };

  } catch (error) {
    console.error('❌ Migration error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Check if migration has been run
 */
export async function checkMaintenancePartsMigration() {
  try {
    const { data, error } = await supabase
      .from('app_687f658e98_maintenance_parts')
      .select('id')
      .limit(1);

    if (error && error.code === '42P01') {
      // Table doesn't exist
      return { exists: false };
    }

    if (error) {
      throw error;
    }

    return { exists: true };
  } catch (error) {
    console.error('❌ Error checking migration:', error);
    return { exists: false, error: error.message };
  }
}