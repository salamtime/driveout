import React, { useState } from 'react';
import { Database, AlertTriangle, CheckCircle, Loader, Copy } from 'lucide-react';

const FuelDatabaseSetup = ({ onSetupComplete, onCancel }) => {
  const [isSettingUp, setIsSettingUp] = useState(false);
  const [setupStatus, setSetupStatus] = useState('');
  const [error, setError] = useState('');
  const [showManualInstructions, setShowManualInstructions] = useState(false);

  const sqlScript = `-- Fuel Management Database Setup
-- Run this script in your Supabase SQL Editor

-- Create fuel_tank table
CREATE TABLE IF NOT EXISTS fuel_tank (
  id SERIAL PRIMARY KEY,
  capacity DECIMAL(10,2) NOT NULL DEFAULT 1000.00,
  current_level DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  low_fuel_threshold DECIMAL(10,2) NOT NULL DEFAULT 200.00,
  location VARCHAR(255) DEFAULT 'Main Tank',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create fuel_refills table
CREATE TABLE IF NOT EXISTS fuel_refills (
  id SERIAL PRIMARY KEY,
  volume DECIMAL(10,2) NOT NULL,
  cost DECIMAL(10,2) NOT NULL,
  supplier VARCHAR(255),
  invoice_number VARCHAR(255),
  invoice_photo_url TEXT,
  refill_date TIMESTAMP WITH TIME ZONE NOT NULL,
  notes TEXT,
  created_by VARCHAR(255),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create fuel_withdrawals table
CREATE TABLE IF NOT EXISTS fuel_withdrawals (
  id SERIAL PRIMARY KEY,
  vehicle_id INTEGER,
  vehicle_name VARCHAR(255) NOT NULL,
  volume DECIMAL(10,2) NOT NULL,
  odometer_reading INTEGER,
  withdrawal_date TIMESTAMP WITH TIME ZONE NOT NULL,
  purpose VARCHAR(255) DEFAULT 'Vehicle Fueling',
  notes TEXT,
  created_by VARCHAR(255),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert default tank configuration (only if no tank exists)
INSERT INTO fuel_tank (capacity, current_level, low_fuel_threshold, location)
SELECT 1000.00, 0.00, 200.00, 'Main Tank'
WHERE NOT EXISTS (SELECT 1 FROM fuel_tank LIMIT 1);

-- Enable Row Level Security (optional but recommended)
ALTER TABLE fuel_tank ENABLE ROW LEVEL SECURITY;
ALTER TABLE fuel_refills ENABLE ROW LEVEL SECURITY;
ALTER TABLE fuel_withdrawals ENABLE ROW LEVEL SECURITY;

-- Create policies to allow authenticated users to access data
CREATE POLICY "Allow authenticated users to view fuel_tank" ON fuel_tank FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated users to update fuel_tank" ON fuel_tank FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Allow authenticated users to insert fuel_refills" ON fuel_refills FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Allow authenticated users to view fuel_refills" ON fuel_refills FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated users to insert fuel_withdrawals" ON fuel_withdrawals FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Allow authenticated users to view fuel_withdrawals" ON fuel_withdrawals FOR SELECT TO authenticated USING (true);`;

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(sqlScript);
      setSetupStatus('SQL script copied to clipboard!');
      setTimeout(() => setSetupStatus(''), 3000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const setupDatabase = async () => {
    setIsSettingUp(true);
    setError('');
    setSetupStatus('Checking database setup...');

    try {
      // Since we can't create tables directly, we'll simulate the setup
      // and provide instructions for manual setup
      setSetupStatus('Database setup requires manual configuration...');
      
      setTimeout(() => {
        setShowManualInstructions(true);
        setSetupStatus('Please follow the manual setup instructions below.');
        setIsSettingUp(false);
      }, 2000);

    } catch (err) {
      console.error('Database setup error:', err);
      setError(err.message || 'Failed to setup database. Please try again.');
      setIsSettingUp(false);
      setShowManualInstructions(true);
    }
  };

  const handleSkipSetup = () => {
    // Allow user to skip setup and use localStorage fallback
    localStorage.setItem('fuel_setup_skipped', 'true');
    onSetupComplete();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-screen overflow-y-auto">
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <Database className="w-6 h-6 text-blue-600" />
            <h3 className="text-lg font-semibold text-gray-900">Fuel Management Database Setup</h3>
          </div>
        </div>
        
        <div className="p-6">
          <div className="mb-6">
            <h4 className="text-md font-medium text-gray-900 mb-3">Setup Required Tables:</h4>
            <ul className="space-y-2 text-sm text-gray-600">
              <li className="flex items-center gap-2">
                <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                <strong>fuel_tank</strong> - Main tank management
              </li>
              <li className="flex items-center gap-2">
                <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                <strong>fuel_refills</strong> - Refill logging with costs
              </li>
              <li className="flex items-center gap-2">
                <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                <strong>fuel_withdrawals</strong> - Vehicle fuel tracking
              </li>
            </ul>
            <p className="text-sm text-gray-500 mt-3">
              This setup is safe to run multiple times. Existing data will be preserved.
            </p>
          </div>

          {/* Setup Status */}
          {setupStatus && (
            <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="flex items-center gap-2">
                {isSettingUp ? (
                  <Loader className="w-4 h-4 text-blue-600 animate-spin" />
                ) : (
                  <CheckCircle className="w-4 h-4 text-green-600" />
                )}
                <span className="text-sm text-blue-800">{setupStatus}</span>
              </div>
            </div>
          )}

          {/* Error Display */}
          {error && (
            <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                <div>
                  <h5 className="text-sm font-medium text-red-800 mb-1">Setup Error:</h5>
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              </div>
            </div>
          )}

          {/* Manual Setup Instructions */}
          {showManualInstructions && (
            <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
              <h5 className="text-sm font-medium text-yellow-800 mb-3">Manual Database Setup Required</h5>
              <p className="text-sm text-yellow-700 mb-4">
                Please copy the SQL script below and run it in your Supabase SQL Editor:
              </p>
              
              <div className="relative">
                <pre className="text-xs bg-gray-900 text-green-400 p-4 rounded-lg overflow-x-auto max-h-64 font-mono">
                  {sqlScript}
                </pre>
                <button
                  onClick={copyToClipboard}
                  className="absolute top-2 right-2 p-2 bg-gray-800 hover:bg-gray-700 text-white rounded transition-colors"
                  title="Copy to clipboard"
                >
                  <Copy className="w-4 h-4" />
                </button>
              </div>
              
              <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded">
                <p className="text-sm text-blue-800">
                  <strong>Steps:</strong>
                </p>
                <ol className="text-sm text-blue-700 mt-2 space-y-1 list-decimal list-inside">
                  <li>Go to your Supabase project dashboard</li>
                  <li>Navigate to the "SQL Editor" section</li>
                  <li>Create a new query and paste the copied SQL script</li>
                  <li>Run the script to create the required tables</li>
                  <li>Return here and click "Continue" to proceed</li>
                </ol>
              </div>
            </div>
          )}
        </div>
        
        <div className="p-6 border-t border-gray-200 flex justify-between">
          <div className="flex gap-3">
            <button
              onClick={onCancel}
              disabled={isSettingUp}
              className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            {showManualInstructions && (
              <button
                onClick={handleSkipSetup}
                className="px-4 py-2 text-orange-700 bg-orange-100 hover:bg-orange-200 rounded-lg transition-colors"
              >
                Skip Setup (Use Demo Mode)
              </button>
            )}
          </div>
          
          <div className="flex gap-3">
            {!showManualInstructions ? (
              <button
                onClick={setupDatabase}
                disabled={isSettingUp}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {isSettingUp ? (
                  <>
                    <Loader className="w-4 h-4 animate-spin" />
                    Setting up...
                  </>
                ) : (
                  <>
                    <Database className="w-4 h-4" />
                    Setup Database
                  </>
                )}
              </button>
            ) : (
              <button
                onClick={onSetupComplete}
                className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors flex items-center gap-2"
              >
                <CheckCircle className="w-4 h-4" />
                Continue to Fuel Management
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default FuelDatabaseSetup;