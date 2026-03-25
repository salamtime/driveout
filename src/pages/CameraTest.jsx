import React from 'react';
import SimpleCameraTest from '../components/video/SimpleCameraTest';

/**
 * Standalone camera test page for debugging camera issues
 */
const CameraTest = () => {
  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-2xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Camera Test Page</h1>
          <p className="text-gray-600">
            Isolated camera test to debug camera access issues
          </p>
        </div>
        
        <SimpleCameraTest />
        
        <div className="mt-8 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
          <h3 className="text-lg font-medium text-yellow-800 mb-2">How to Access This Test:</h3>
          <ol className="text-sm text-yellow-700 space-y-1">
            <li>1. Navigate to: <code className="bg-yellow-100 px-1 rounded">/camera-test</code></li>
            <li>2. Or add this route to your router configuration</li>
            <li>3. Test camera functionality in isolation</li>
            <li>4. Check browser console for detailed debug logs</li>
          </ol>
        </div>
      </div>
    </div>
  );
};

export default CameraTest;