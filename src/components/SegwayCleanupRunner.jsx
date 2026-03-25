import React, { useState } from 'react';
import { supabase } from '../lib/supabase';

const SegwayCleanupRunner = ({ onComplete }) => {
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState(null);

  const runCleanup = async () => {
    setRunning(true);
    setResults(null);

    try {
      console.log('🔄 Starting Segway model cleanup...');
      
      // Find all Segway models that are not AT5 or AT6
      const { data: segwayModels } = await supabase
        .from('saharax_0u4w4d_vehicle_models')
        .select('*')
        .ilike('name', '%segway%');

      const modelsToCleanup = segwayModels?.filter(model => 
        !['segway at6', 'segway at5'].includes(model.name.toLowerCase())
      ) || [];

      if (modelsToCleanup.length === 0) {
        setResults({
          success: true,
          message: 'No cleanup needed - no duplicate Segway models found',
          modelsRemoved: 0
        });
        return;
      }

      // Remove duplicate/incorrect Segway models
      const idsToRemove = modelsToCleanup.map(model => model.id);
      
      const { error } = await supabase
        .from('saharax_0u4w4d_vehicle_models')
        .delete()
        .in('id', idsToRemove);

      if (error) {
        throw error;
      }

      setResults({
        success: true,
        message: 'Cleanup completed successfully',
        modelsRemoved: modelsToCleanup.length
      });

      console.log('✅ Segway cleanup completed, removed:', modelsToCleanup.length, 'models');

    } catch (error) {
      console.error('❌ Cleanup failed:', error);
      setResults({
        success: false,
        message: `Cleanup failed: ${error.message}`,
        modelsRemoved: 0
      });
    } finally {
      setRunning(false);
      if (onComplete) {
        setTimeout(onComplete, 1000);
      }
    }
  };

  return (
    <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 mb-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-orange-800">🧹 Segway Model Cleanup</h3>
          <p className="text-sm text-orange-700">Remove duplicate or incorrect Segway models</p>
        </div>
        <button
          onClick={runCleanup}
          disabled={running}
          className={`px-4 py-2 rounded-lg font-medium ${
            running
              ? 'bg-gray-400 cursor-not-allowed text-white'
              : 'bg-orange-600 hover:bg-orange-700 text-white'
          }`}
        >
          {running ? 'Cleaning...' : 'Run Cleanup'}
        </button>
      </div>

      {results && (
        <div className={`mt-4 p-3 rounded-lg ${
          results.success ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
        }`}>
          <p className="font-medium">{results.message}</p>
          {results.modelsRemoved > 0 && (
            <p className="text-sm mt-1">Removed {results.modelsRemoved} duplicate models</p>
          )}
        </div>
      )}
    </div>
  );
};

export default SegwayCleanupRunner;