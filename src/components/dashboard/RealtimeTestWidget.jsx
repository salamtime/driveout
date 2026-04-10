import React, { useState, useEffect } from 'react';
import { useRealtimeConnection } from '../../hooks/useRealtimeConnection';
import DashboardService from '../../services/DashboardService';
import i18n from '../../i18n';

const RealtimeTestWidget = () => {
  const isFrench = i18n.resolvedLanguage === 'fr';
  const tr = (en, fr) => (isFrench ? fr : en);
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
        <h3 className="text-lg font-semibold">{tr('Real-time Test Widget', 'Widget de test temps réel')}</h3>
        <button
          onClick={createTestAlert}
          disabled={isCreatingTestData}
          className="bg-blue-600 text-white px-3 py-1 rounded text-sm hover:bg-blue-700 disabled:opacity-50"
        >
          {isCreatingTestData ? tr('Creating...', 'Création...') : tr('Test Real-time', 'Tester le temps réel')}
        </button>
      </div>

      {/* Connection Status */}
      <div className="mb-4 p-3 bg-gray-50 rounded">
        <div className="text-sm">
          <div className="flex justify-between items-center mb-1">
            <span className="font-medium">{tr('Connection Status:', 'Statut de connexion :')}</span>
            <span className={`px-2 py-1 rounded text-xs ${
              connectionStatus === 'connected' ? 'bg-green-100 text-green-800' :
              connectionStatus === 'connecting' ? 'bg-yellow-100 text-yellow-800' :
              'bg-red-100 text-red-800'
            }`}>
              {connectionStatus.toUpperCase()}
            </span>
          </div>
          <div className="text-xs text-gray-600">
            {tr('Active Subscriptions:', 'Abonnements actifs :')} {connectionHealth.activeSubscriptions}
          </div>
        </div>
      </div>

      {/* Test Results */}
      <div className="space-y-2 max-h-60 overflow-y-auto">
        {testResults.length === 0 ? (
          <div className="text-center py-4 text-gray-500 text-sm">
            {tr('Click "Test Real-time" to create test data and verify real-time updates', 'Cliquez sur "Tester le temps réel" pour créer des données de test et vérifier les mises à jour en temps réel')}
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
                  {result.type === 'realtime' ? tr('📡 Real-time Update', '📡 Mise à jour en temps réel') :
                   result.type === 'created' ? tr('✅ Data Created', '✅ Données créées') :
                   tr('❌ Error', '❌ Erreur')}
                </span>
                <span className="text-gray-500">{result.timestamp}</span>
              </div>
              <div className="text-gray-700">
                {result.type === 'realtime' && (
                  <span>{tr('Event', 'Événement')}: {result.data.eventType} | {tr('Table', 'Table')}: {result.data.table || 'alerts'}</span>
                )}
                {result.type === 'created' && (
                  <span>{tr('Alert', 'Alerte')}: {result.data.title}</span>
                )}
                {result.type === 'error' && (
                  <span>{tr('Error', 'Erreur')}: {result.data.error}</span>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Instructions */}
      <div className="mt-4 p-3 bg-blue-50 rounded text-sm">
        <div className="font-medium text-blue-800 mb-1">{tr('Test Instructions:', 'Instructions de test :')}</div>
        <div className="text-blue-700 text-xs">
          1. {tr('Click "Test Real-time" to create test data', 'Cliquez sur "Tester le temps réel" pour créer des données de test')}<br/>
          2. {tr('Watch for the green "📡 Real-time Update" event', 'Surveillez l’événement vert "📡 Mise à jour en temps réel"')}<br/>
          3. {tr('If you see it, real-time is working perfectly!', 'Si vous le voyez, le temps réel fonctionne parfaitement !')}
        </div>
      </div>
    </div>
  );
};

export default RealtimeTestWidget;
