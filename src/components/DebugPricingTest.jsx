import React, { useState } from 'react';
import EnhancedBasePriceService from '../services/EnhancedBasePriceService';

/**
 * DebugPricingTest - Temporary component to test pricing service directly
 */
const DebugPricingTest = () => {
  const [testResults, setTestResults] = useState([]);
  const [loading, setLoading] = useState(false);

  const addResult = (test, result, error = null) => {
    setTestResults(prev => [...prev, {
      test,
      result,
      error,
      timestamp: new Date().toLocaleTimeString()
    }]);
  };

  const testDatabaseConnection = async () => {
    setLoading(true);
    addResult('Starting Database Tests', 'Testing...');

    try {
      // Test 1: Check if service can initialize
      await EnhancedBasePriceService.initializeBasePricesTable();
      addResult('✅ Base Prices Table Access', 'Table is accessible');
    } catch (err) {
      addResult('❌ Base Prices Table Access', 'Failed', err.message);
    }

    try {
      // Test 2: Get all base prices
      const allPrices = await EnhancedBasePriceService.getAllBasePricesWithModels();
      addResult('✅ Get All Base Prices', `Found ${allPrices.length} records`, JSON.stringify(allPrices, null, 2));
    } catch (err) {
      addResult('❌ Get All Base Prices', 'Failed', err.message);
    }

    try {
      // Test 3: Get all vehicle models
      const allModels = await EnhancedBasePriceService.getAllVehicleModels();
      addResult('✅ Get All Vehicle Models', `Found ${allModels.length} models`, JSON.stringify(allModels, null, 2));
    } catch (err) {
      addResult('❌ Get All Vehicle Models', 'Failed', err.message);
    }

    try {
      // Test 4: Test specific pricing lookup for AT6 (40000)
      const at6Price = await EnhancedBasePriceService.getPricingForRental('40000', 'daily');
      addResult('✅ AT6 Daily Price Lookup', `Price: ${at6Price} MAD`);
    } catch (err) {
      addResult('❌ AT6 Daily Price Lookup', 'Failed', err.message);
    }

    try {
      // Test 5: Test base price by model ID
      const basePriceData = await EnhancedBasePriceService.getBasePriceByModelId('40000');
      addResult('✅ Base Price by Model ID', 'Success', JSON.stringify(basePriceData, null, 2));
    } catch (err) {
      addResult('❌ Base Price by Model ID', 'Failed', err.message);
    }

    setLoading(false);
  };

  const clearResults = () => {
    setTestResults([]);
  };

  return (
    <div className="max-w-4xl mx-auto p-6 bg-white rounded-lg shadow-lg">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">
          🔧 Pricing System Debug Test
        </h2>
        <p className="text-gray-600">
          Direct testing of the pricing service and database connection.
        </p>
      </div>

      <div className="flex gap-4 mb-6">
        <button
          onClick={testDatabaseConnection}
          disabled={loading}
          className={`px-6 py-3 rounded-md text-white font-medium ${
            loading
              ? 'bg-gray-400 cursor-not-allowed'
              : 'bg-blue-600 hover:bg-blue-700'
          }`}
        >
          {loading ? 'Testing...' : '🧪 Run Database Tests'}
        </button>

        <button
          onClick={clearResults}
          disabled={loading}
          className="px-6 py-3 border border-gray-300 rounded-md text-gray-700 font-medium hover:bg-gray-50"
        >
          🗑️ Clear Results
        </button>
      </div>

      <div className="space-y-4">
        {testResults.map((result, index) => (
          <div
            key={index}
            className={`p-4 rounded-lg border ${
              result.error
                ? 'bg-red-50 border-red-200'
                : result.test.includes('✅')
                ? 'bg-green-50 border-green-200'
                : 'bg-blue-50 border-blue-200'
            }`}
          >
            <div className="flex justify-between items-start mb-2">
              <h3 className="font-medium text-gray-900">{result.test}</h3>
              <span className="text-xs text-gray-500">{result.timestamp}</span>
            </div>
            
            <div className="text-sm">
              <div className="font-medium mb-1">Result: {result.result}</div>
              
              {result.error && (
                <div className="text-red-700 bg-red-100 p-2 rounded mt-2">
                  <strong>Error:</strong> {result.error}
                </div>
              )}
              
              {result.result && typeof result.result === 'string' && result.result.startsWith('{') && (
                <pre className="bg-gray-100 p-2 rounded mt-2 text-xs overflow-x-auto">
                  {result.result}
                </pre>
              )}
            </div>
          </div>
        ))}
      </div>

      {testResults.length === 0 && (
        <div className="text-center py-8 text-gray-500">
          <p>Click "Run Database Tests" to start debugging the pricing system.</p>
        </div>
      )}
    </div>
  );
};

export default DebugPricingTest;