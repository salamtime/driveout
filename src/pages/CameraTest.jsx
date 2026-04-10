import React from 'react';
import SimpleCameraTest from '../components/video/SimpleCameraTest';
import i18n from '../i18n';

/**
 * Standalone camera test page for debugging camera issues
 */
const CameraTest = () => {
  const isFrench = i18n.resolvedLanguage === 'fr';
  const tr = (en, fr) => (isFrench ? fr : en);
  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-2xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">{tr('Camera Test Page', 'Page de test camera')}</h1>
          <p className="text-gray-600">
            {tr('Isolated camera test to debug camera access issues', "Test camera isole pour diagnostiquer les problemes d'acces camera")}
          </p>
        </div>
        
        <SimpleCameraTest />
        
        <div className="mt-8 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
          <h3 className="text-lg font-medium text-yellow-800 mb-2">{tr('How to Access This Test:', "Comment acceder a ce test :")}</h3>
          <ol className="text-sm text-yellow-700 space-y-1">
            <li>1. {tr('Navigate to:', 'Accedez a :')} <code className="bg-yellow-100 px-1 rounded">/camera-test</code></li>
            <li>2. {tr('Or add this route to your router configuration', 'Ou ajoutez cette route a votre configuration de routeur')}</li>
            <li>3. {tr('Test camera functionality in isolation', 'Testez la camera de facon isolee')}</li>
            <li>4. {tr('Check browser console for detailed debug logs', 'Consultez la console du navigateur pour les journaux detailles')}</li>
          </ol>
        </div>
      </div>
    </div>
  );
};

export default CameraTest;
