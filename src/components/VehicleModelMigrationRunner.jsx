import React, { useState } from 'react';
import { supabase } from '../lib/supabase';

const VehicleModelMigrationRunner = ({ onComplete }) => {
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState(null);

  const runMigration = async () => {
    setRunning(true);
    setResults(null);

    try {
      console.log('🔄 Starting vehicle model migration...');
      
      // Check if models already exist
      const { data: existingModels } = await supabase
        .from('saharax_0u4w4d_vehicle_models')
        .select('*');

      if (existingModels && existingModels.length >= 2) {
        setResults({
          success: true,
          message: 'Migration skipped - models already exist',
          modelsCreated: 0
        });
        return;
      }

      // Create default vehicle models
      const defaultModels = [
        {
          name: 'Segway AT6',
          model: 'AT6',
          vehicle_type: 'quad',
          description: 'High-performance all-terrain vehicle',
          power_cc_min: 600,
          power_cc_max: 800,
          capacity_min: 1,
          capacity_max: 2,
          features: ['All-terrain', 'Electric', 'GPS'],
          is_active: true
        },
        {
          name: 'Segway AT5',
          model: 'AT5',
          vehicle_type: 'ATV',
          description: 'Versatile all-terrain vehicle',
          power_cc_min: 500,
          power_cc_max: 700,
          capacity_min: 1,
          capacity_max: 2,
          features: ['All-terrain', 'Electric', 'Bluetooth'],
          is_active: true
        }
      ];

      const { data, error } = await supabase
        .from('saharax_0u4w4d_vehicle_models')
        .insert(defaultModels)
        .select();

      if (error) {
        throw error;
      }

      setResults({
        success: true,
        message: 'Migration completed successfully',
        modelsCreated: data?.length || 0
      });

      console.log('✅ Vehicle model migration completed:', data);

    } catch (error) {
      console.error('❌ Migration failed:', error);
      setResults({
        success: false,
        message: `Migration failed: ${error.message}`,
        modelsCreated: 0
      });
    } finally {
      setRunning(false);
      if (onComplete) {
        setTimeout(onComplete, 1000);
      }
    }
  };

  return (
    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-yellow-800">🔄 Vehicle Model Migration</h3>
          <p className="text-sm text-yellow-700">Initialize default vehicle models for the system</p>
        </div>
        <button
          onClick={runMigration}
          disabled={running}
          className={`px-4 py-2 rounded-lg font-medium ${
            running
              ? 'bg-gray-400 cursor-not-allowed text-white'
              : 'bg-yellow-600 hover:bg-yellow-700 text-white'
          }`}
        >
          {running ? 'Running...' : 'Run Migration'}
        </button>
      </div>

      {results && (
        <div className={`mt-4 p-3 rounded-lg ${
          results.success ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
        }`}>
          <p className="font-medium">{results.message}</p>
          {results.modelsCreated > 0 && (
            <p className="text-sm mt-1">Created {results.modelsCreated} vehicle models</p>
          )}
        </div>
      )}
    </div>
  );
};

export default VehicleModelMigrationRunner;