import React, { useState, useEffect } from 'react';
import { useRealtimeConnection } from '../../hooks/useRealtimeConnection';
import DashboardService from '../../services/DashboardService';

const RealtimeTestWidget = () => {
  const [testResults, setTestResults] = useState([]);
  const [isCreatingTestData, setIsCreatingTestData] = useState(false);
  const { subscribe, connectionStatus, getConnectionHealth } = useRealtimeConnection();

  // Subscribe to realtime updates
  useEffect(() => {
    const unsubscribe = subscribe(
      'app_b30c02e74da644baad4668e3587d86b1_alerts',
      (payload) => {
        console.log('🧪 Test widget received realtime update:', payload);
        const timestamp = new Date().toLocaleTimeString();
        setTestResults(prev => [
          { 
            type: 'realtime', 
            data: payload, 
            timestamp,
            id: Date.now()
          },
          ...prev.slice(0, 4) // Keep only last 5 results
        ]);
      },
      { immediate: true }
    );

    return unsubscribe;
  }, [subscribe]);

  const createTestAlert = async () => {
    setIsCreatingTestData(true);
    try {
      console.log('🧪 Creating test alert...');
      const testAlert = await DashboardService.createAlert({
        type: 'test',
        priority: 'low',
        title: 'Real-time Test',
        message: `Test alert created at ${new Date().toLocaleTimeString()}`,
        status: 'active'
      });
      
      const timestamp = new Date().toLocaleTimeString();
      setTestResults(prev => [
        { 
          type: 'created', 
          data: testAlert, 
          timestamp,
          id: Date.now()
        },
        ...prev.slice(0, 4)
      ]);
      
      console.log('✅ Test alert created:', testAlert);
    } catch (error) {
      console.error('❌ Error creating test alert:', error);
      const timestamp = new Date().toLocaleTimeString();
      setTestResults(prev => [
        { 
          type: 'error', 
          data: { error: error.message }, 
          timestamp,
          id: Date.now()
        },
        ...prev.slice(0, 4)
      ]);
    } finally {
      setIsCreatingTestData(false);
    }
  };

  const connectionHealth = getConnectionHealth();

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold">Real-time Test Widget</h3>
        <button
          onClick={createTestAlert}
          disabled={isCreatingTestData}
          className="bg-blue-600 text-white px-3 py-1 rounded text-sm hover:bg-blue-700 disabled:opacity-50"
        >
          {isCreatingTestData ? 'Creating...' : 'Test Real-time'}
        </button>
      </div>

      {/* Connection Status */}
      <div className="mb-4 p-3 bg-gray-50 rounded">
        <div className="text-sm">
          <div className="flex justify-between items-center mb-1">
            <span className="font-medium">Connection Status:</span>
            <span className={`px-2 py-1 rounded text-xs ${
              connectionStatus === 'connected' ? 'bg-green-100 text-green-800' :
              connectionStatus === 'connecting' ? 'bg-yellow-100 text-yellow-800' :
              'bg-red-100 text-red-800'
            }`}>
              {connectionStatus.toUpperCase()}
            </span>
          </div>
          <div className="text-xs text-gray-600">
            Active Subscriptions: {connectionHealth.activeSubscriptions}
          </div>
        </div>
      </div>

      {/* Test Results */}
      <div className="space-y-2 max-h-60 overflow-y-auto">
        {testResults.length === 0 ? (
          <div className="text-center py-4 text-gray-500 text-sm">
            Click "Test Real-time" to create test data and verify real-time updates
          </div>
        ) : (
          testResults.map((result) => (
            <div 
              key={result.id}
              className={`p-2 rounded text-xs border-l-4 ${
                result.type === 'realtime' ? 'border-green-500 bg-green-50' :
                result.type === 'created' ? 'border-blue-500 bg-blue-50' :
                'border-red-500 bg-red-50'
              }`}
            >
              <div className="flex justify-between items-start mb-1">
                <span className="font-medium">
                  {result.type === 'realtime' ? '📡 Real-time Update' :
                   result.type === 'created' ? '✅ Data Created' :
                   '❌ Error'}
                </span>
                <span className="text-gray-500">{result.timestamp}</span>
              </div>
              <div className="text-gray-700">
                {result.type === 'realtime' && (
                  <span>Event: {result.data.eventType} | Table: {result.data.table || 'alerts'}</span>
                )}
                {result.type === 'created' && (
                  <span>Alert: {result.data.title}</span>
                )}
                {result.type === 'error' && (
                  <span>Error: {result.data.error}</span>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Instructions */}
      <div className="mt-4 p-3 bg-blue-50 rounded text-sm">
        <div className="font-medium text-blue-800 mb-1">Test Instructions:</div>
        <div className="text-blue-700 text-xs">
          1. Click "Test Real-time" to create test data<br/>
          2. Watch for the green "📡 Real-time Update" event<br/>
          3. If you see it, real-time is working perfectly!
        </div>
      </div>
    </div>
  );
};

export default RealtimeTestWidget;