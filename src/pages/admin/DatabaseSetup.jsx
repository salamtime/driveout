import React, { useState } from 'react';
import { Database, Play, CheckCircle, XCircle, Loader } from 'lucide-react';
import { setupDatabase, seedSampleData, testDataConnections } from '../../utils/setupDatabase';
import toast from 'react-hot-toast';

const DatabaseSetup = () => {
  const [isRunning, setIsRunning] = useState(false);
  const [results, setResults] = useState({});
  const [testResults, setTestResults] = useState({});

  const runDatabaseSetup = async () => {
    setIsRunning(true);
    const newResults = {};

    try {
      // Step 1: Setup database
      toast.loading('Setting up database...', { id: 'setup' });
      const setupResult = await setupDatabase();
      newResults.setup = setupResult;
      
      if (setupResult.success) {
        toast.success('Database setup completed!', { id: 'setup' });
      } else {
        toast.error('Database setup failed!', { id: 'setup' });
      }

      // Step 2: Seed sample data
      toast.loading('Seeding sample data...', { id: 'seed' });
      const seedResult = await seedSampleData();
      newResults.seed = seedResult;
      
      if (seedResult.success) {
        toast.success('Sample data seeded!', { id: 'seed' });
      } else {
        toast.error('Sample data seeding failed!', { id: 'seed' });
      }

      // Step 3: Test connections
      toast.loading('Testing data connections...', { id: 'test' });
      const testResult = await testDataConnections();
      newResults.test = testResult;
      setTestResults(testResult);
      toast.success('Connection tests completed!', { id: 'test' });

    } catch (error) {
      console.error('Database setup error:', error);
      toast.error('Database setup encountered an error!');
    } finally {
      setResults(newResults);
      setIsRunning(false);
    }
  };

  const getStatusIcon = (success) => {
    if (success === undefined) return <Loader className="h-5 w-5 text-gray-400" />;
    return success ? 
      <CheckCircle className="h-5 w-5 text-green-500" /> : 
      <XCircle className="h-5 w-5 text-red-500" />;
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center space-x-3">
        <Database className="h-8 w-8 text-blue-600" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Database Setup & Testing</h1>
          <p className="text-gray-600">Initialize database schema and seed test data</p>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-gray-900">Setup Process</h2>
          <button
            onClick={runDatabaseSetup}
            disabled={isRunning}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors flex items-center space-x-2 disabled:opacity-50"
          >
            <Play className="h-4 w-4" />
            <span>{isRunning ? 'Running...' : 'Run Setup'}</span>
          </button>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
            <div>
              <h3 className="font-medium text-gray-900">Database Connection</h3>
              <p className="text-sm text-gray-600">Verify Supabase connection and basic setup</p>
            </div>
            {getStatusIcon(results.setup?.success)}
          </div>

          <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
            <div>
              <h3 className="font-medium text-gray-900">Sample Data Seeding</h3>
              <p className="text-sm text-gray-600">Add test vehicles, bookings, and inventory</p>
            </div>
            {getStatusIcon(results.seed?.success)}
          </div>

          <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
            <div>
              <h3 className="font-medium text-gray-900">Connection Testing</h3>
              <p className="text-sm text-gray-600">Test all data endpoints and queries</p>
            </div>
            {getStatusIcon(results.test && Object.keys(results.test).length > 0)}
          </div>
        </div>
      </div>

      {/* Test Results */}
      {Object.keys(testResults).length > 0 && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Connection Test Results</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {Object.entries(testResults).map(([name, result]) => (
              <div key={name} className="p-4 border rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-medium text-gray-900">{name}</h3>
                  {getStatusIcon(result.success)}
                </div>
                {result.success ? (
                  <p className="text-sm text-green-600">
                    ✅ Connected - {result.count} records found
                  </p>
                ) : (
                  <p className="text-sm text-red-600">
                    ❌ Error: {result.error}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Error Details */}
      {results.setup && !results.setup.success && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <h3 className="font-medium text-red-900 mb-2">Setup Error Details</h3>
          <p className="text-sm text-red-700">{results.setup.error}</p>
        </div>
      )}

      {results.seed && !results.seed.success && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <h3 className="font-medium text-red-900 mb-2">Seeding Error Details</h3>
          <p className="text-sm text-red-700">{results.seed.error}</p>
        </div>
      )}
    </div>
  );
};

export default DatabaseSetup;