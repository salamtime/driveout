import { supabase } from '../lib/supabase';
import VehicleModelService from '../services/VehicleModelService';

/**
 * Database migration and cleanup utility for vehicle models
 * This handles the one-time setup and data cleanup as requested
 */
class VehicleModelMigration {
  
  /**
   * Apply database constraints for uniqueness
   * This should be run once to set up the proper constraints
   */
  static async applyDatabaseConstraints() {
    try {
      console.log('🔧 Applying database constraints for vehicle models...');
      
      // Note: Since we can't directly execute DDL through the client,
      // we'll implement the uniqueness check in the service layer
      // The database admin should run this SQL manually:
      
      const sqlCommands = `
        -- Add case-insensitive unique constraint on model names
        -- This should be run by a database administrator
        
        -- Option 1: Using a functional unique index (recommended)
        CREATE UNIQUE INDEX IF NOT EXISTS idx_vehicle_models_name_unique 
        ON saharax_0u4w4d_vehicle_models (lower(trim(name))) 
        WHERE is_active = true;
        
        -- Option 2: If using PostgreSQL with citext extension
        -- ALTER TABLE saharax_0u4w4d_vehicle_models 
        -- ALTER COLUMN name TYPE citext;
        
        -- Add RLS policies for delete operations
        CREATE POLICY IF NOT EXISTS "Allow delete for authenticated users" 
        ON saharax_0u4w4d_vehicle_models 
        FOR DELETE 
        TO authenticated 
        USING (true);
      `;
      
      console.log('📋 SQL commands to be executed by database administrator:');
      console.log(sqlCommands);
      
      return {
        success: true,
        message: 'Database constraints defined. Please execute the SQL commands manually.',
        sqlCommands
      };
      
    } catch (error) {
      console.error('❌ Failed to apply database constraints:', error);
      throw error;
    }
  }
  
  /**
   * Perform one-time data cleanup
   * Remove duplicates and ensure only Segway AT6 and Segway AT5 remain
   */
  static async performDataCleanup() {
    try {
      console.log('🧹 Starting vehicle model data cleanup...');
      
      // Step 1: Get all current models
      const { data: allModels, error: fetchError } = await supabase
        .from('saharax_0u4w4d_vehicle_models')
        .select('*')
        .order('created_at');
      
      if (fetchError) {
        throw fetchError;
      }
      
      console.log(`Found ${allModels.length} total models in database`);
      
      // Step 2: Define target models (canonical versions)
      const targetModels = [
        { name: 'Segway AT6', model: 'AT6' },
        { name: 'Segway AT5', model: 'AT5' }
      ];
      
      // Step 3: Find or create canonical models
      const canonicalModels = [];
      
      for (const target of targetModels) {
        // Look for existing model with this name (case-insensitive)
        let existingModel = allModels.find(m => 
          m.name.toLowerCase().trim() === target.name.toLowerCase().trim()
        );
        
        if (!existingModel) {
          // Create the canonical model if it doesn't exist
          console.log(`Creating canonical model: ${target.name}`);
          try {
            const { data: newModel, error: createError } = await supabase
              .from('saharax_0u4w4d_vehicle_models')
              .insert([{
                name: target.name,
                model: target.model,
                vehicle_type: 'quad',
                power_cc_min: 0,
                power_cc_max: 1000,
                capacity_min: 1,
                capacity_max: 2,
                description: `${target.name} - High-performance all-terrain vehicle`,
                features: ['All-terrain', 'Electric', 'GPS tracking'],
                is_active: true
              }])
              .select()
              .single();
            
            if (createError) {
              console.error(`Failed to create ${target.name}:`, createError);
              continue;
            }
            
            existingModel = newModel;
          } catch (createErr) {
            console.error(`Error creating ${target.name}:`, createErr);
            continue;
          }
        }
        
        canonicalModels.push(existingModel);
        console.log(`✅ Canonical model confirmed: ${existingModel.name} (ID: ${existingModel.id})`);
      }
      
      // Step 4: Process all models and handle duplicates/extras
      const cleanupResults = [];
      
      for (const model of allModels) {
        // Check if this model should be kept as canonical
        const isCanonical = canonicalModels.some(canonical => canonical.id === model.id);
        
        if (isCanonical) {
          console.log(`✅ Keeping canonical model: ${model.name}`);
          continue;
        }
        
        // Check if this is a duplicate of a canonical model
        const canonicalMatch = canonicalModels.find(canonical => 
          canonical.name.toLowerCase().trim() === model.name.toLowerCase().trim()
        );
        
        if (canonicalMatch) {
          // This is a duplicate - reassign any vehicles and delete
          console.log(`🔄 Processing duplicate: ${model.name} -> ${canonicalMatch.name}`);
          
          try {
            // Check for vehicle references
            const { data: referencingVehicles, error: vehicleError } = await supabase
              .from('saharax_0u4w4d_vehicles')
              .select('id, name')
              .eq('vehicle_model_id', model.id);
            
            if (vehicleError) {
              console.warn(`⚠️ Could not check vehicles for model ${model.id}:`, vehicleError);
            } else if (referencingVehicles && referencingVehicles.length > 0) {
              console.log(`Reassigning ${referencingVehicles.length} vehicles to canonical model`);
              
              // Reassign vehicles to canonical model
              const { error: reassignError } = await supabase
                .from('saharax_0u4w4d_vehicles')
                .update({ vehicle_model_id: canonicalMatch.id })
                .eq('vehicle_model_id', model.id);
              
              if (reassignError) {
                console.error(`❌ Failed to reassign vehicles:`, reassignError);
                cleanupResults.push({
                  action: 'failed_reassign',
                  model: model.name,
                  error: reassignError.message
                });
                continue;
              }
            }
            
            // Delete the duplicate model
            await VehicleModelService.deleteVehicleModel(model.id);
            cleanupResults.push({
              action: 'deleted_duplicate',
              model: model.name,
              reassignedTo: canonicalMatch.name
            });
            
          } catch (deleteError) {
            console.error(`❌ Failed to delete duplicate ${model.name}:`, deleteError);
            cleanupResults.push({
              action: 'failed_delete',
              model: model.name,
              error: deleteError.message
            });
          }
        } else {
          // This is an extra model not in our target list - remove it
          console.log(`🗑️ Removing extra model: ${model.name}`);
          
          try {
            await VehicleModelService.deleteVehicleModel(model.id);
            cleanupResults.push({
              action: 'deleted_extra',
              model: model.name
            });
          } catch (deleteError) {
            console.error(`❌ Failed to delete extra model ${model.name}:`, deleteError);
            cleanupResults.push({
              action: 'failed_delete_extra',
              model: model.name,
              error: deleteError.message
            });
          }
        }
      }
      
      // Step 5: Verify final state
      const { data: finalModels, error: finalError } = await supabase
        .from('saharax_0u4w4d_vehicle_models')
        .select('*')
        .eq('is_active', true)
        .order('name');
      
      if (finalError) {
        throw finalError;
      }
      
      console.log('✅ Cleanup completed. Final models:');
      finalModels.forEach(model => {
        console.log(`  - ${model.name} (${model.model})`);
      });
      
      return {
        success: true,
        message: `Cleanup completed. ${finalModels.length} models remain.`,
        finalModels,
        cleanupResults
      };
      
    } catch (error) {
      console.error('❌ Data cleanup failed:', error);
      throw error;
    }
  }
  
  /**
   * Run the complete migration process
   */
  static async runMigration() {
    try {
      console.log('🚀 Starting vehicle model migration...');
      
      // Step 1: Apply database constraints (informational)
      const constraintResult = await this.applyDatabaseConstraints();
      console.log('📋 Database constraints:', constraintResult.message);
      
      // Step 2: Perform data cleanup
      const cleanupResult = await this.performDataCleanup();
      console.log('🧹 Data cleanup:', cleanupResult.message);
      
      return {
        success: true,
        message: 'Migration completed successfully',
        constraintResult,
        cleanupResult
      };
      
    } catch (error) {
      console.error('❌ Migration failed:', error);
      return {
        success: false,
        message: 'Migration failed',
        error: error.message
      };
    }
  }
}

export default VehicleModelMigration;