import React from 'react';
import { ArrowLeft, Info } from 'lucide-react';
import { Link } from 'react-router-dom';
import PricingDebugTool from '../components/test/PricingDebugTool';

const PricingTest = () => {
  return (
    <div className="max-w-5xl mx-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center">
          <Link to="/admin/dashboard" className="mr-4 p-2 rounded-lg hover:bg-gray-100">
            <ArrowLeft className="h-5 w-5 text-gray-600" />
          </Link>
          <h1 className="text-2xl font-semibold text-gray-900">Pricing Test Page</h1>
        </div>
      </div>
      
      <div className="bg-blue-50 border-l-4 border-blue-400 p-4 mb-6">
        <div className="flex">
          <div className="flex-shrink-0">
            <Info className="h-5 w-5 text-blue-500" aria-hidden="true" />
          </div>
          <div className="ml-3">
            <p className="text-sm text-blue-700">
              This page is designed to help test the pricing system and its resilience to database connectivity issues.
              You can adjust parameters, toggle online/offline mode, and see how the pricing calculator behaves.
            </p>
          </div>
        </div>
      </div>
      
      <div className="mb-6">
        <h2 className="text-lg font-medium text-gray-800 mb-4">
          Pricing Calculation Test
        </h2>
        <PricingDebugTool />
      </div>
      
      <div className="mt-8 border-t pt-6">
        <h2 className="text-lg font-medium text-gray-800 mb-4">Testing Instructions</h2>
        <div className="prose prose-sm max-w-none text-gray-600">
          <ol className="list-decimal pl-4 space-y-2">
            <li>
              <strong>Check Database Connection:</strong> The indicator at the top right shows where your settings are coming from. 
              Green indicates database, Amber indicates local cache, and Blue indicates default values.
            </li>
            <li>
              <strong>Test Offline Mode:</strong> You can simulate going offline by stopping the database connection 
              and clicking the "Reload" button. When offline, the system should fall back to cached settings.
            </li>
            <li>
              <strong>Modify Parameters:</strong> Change duration, passengers, and other parameters to see how prices update.
            </li>
            <li>
              <strong>Toggle Pricing:</strong> Use the switch to enable/disable the dynamic pricing system.
            </li>
            <li>
              <strong>Verify Calculations:</strong> Check that the final price matches what you'd expect based on the displayed settings.
            </li>
          </ol>
          
          <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-md">
            <p className="text-yellow-800 font-medium">Important Note</p>
            <p className="text-yellow-700 mt-1">
              After testing offline functionality, remember to restore database connectivity before using the production system.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PricingTest;