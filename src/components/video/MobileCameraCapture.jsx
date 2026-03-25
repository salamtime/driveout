import React, { useState, useRef, useEffect } from 'react';
import { Camera, Square, Play, AlertCircle, CheckCircle } from 'lucide-react';
import toast from 'react-hot-toast';

// IMMEDIATE ALERT DEBUGGING
alert('🚨 CAMERA COMPONENT FILE IS LOADING');
console.log('🚀 CAMERA COMPONENT FILE LOADED - MobileCameraCapture.jsx');

/**
 * Mobile-optimized camera capture component for rental closing videos
 */
const MobileCameraCapture = ({ 
  sessionToken, 
  requirements, 
  onVideoCapture, 
  onError,
  disabled = false 
}) => {
  // IMMEDIATE ALERT WHEN COMPONENT MOUNTS
  alert('🚨 CAMERA COMPONENT IS MOUNTING');
  console.log('🚀 CAMERA COMPONENT MOUNTED - MobileCameraCapture rendering started');

  const [isRecording, setIsRecording] = useState(false);
  const [cameraStream, setCameraStream] = useState(null);
  const [cameraError, setCameraError] = useState(null);
  const [isInitializing, setIsInitializing] = useState(false);
  const [cameraStarted, setCameraStarted] = useState(false);

  const videoRef = useRef(null);

  // Cleanup on unmount
  useEffect(() => {
    alert('🚨 CAMERA COMPONENT useEffect RUNNING');
    console.log('🔍 CAMERA COMPONENT EFFECT RUNNING - Component mounted');
    return () => {
      console.log('🔍 CAMERA COMPONENT CLEANUP - Component unmounting');
    };
  }, []);

  /**
   * Initialize camera
   */
  const initializeCamera = async () => {
    alert('🚨 INITIALIZE CAMERA FUNCTION CALLED');
    console.log('🎥 ===== CAMERA INITIALIZATION BUTTON CLICKED =====');
    
    try {
      setIsInitializing(true);
      setCameraError(null);

      alert('🚨 CHECKING getUserMedia SUPPORT');
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('getUserMedia not supported');
      }

      alert('🚨 CALLING getUserMedia');
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false
      });
      
      alert('🚨 getUserMedia SUCCESS - SETTING STREAM');
      setCameraStream(stream);
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setCameraStarted(true);
        alert('🚨 CAMERA PREVIEW SHOULD BE VISIBLE NOW');
      }
      
      toast.success('Camera started successfully');
      
    } catch (error) {
      alert(`🚨 CAMERA ERROR: ${error.message}`);
      console.error('🚨 CAMERA INITIALIZATION FAILED:', error);
      setCameraError(error.message);
      toast.error(`Camera error: ${error.message}`);
    } finally {
      setIsInitializing(false);
    }
  };

  alert('🚨 CAMERA COMPONENT ABOUT TO RENDER');
  console.log('🎨 CAMERA COMPONENT RENDERING');

  return (
    <div className="w-full max-w-md mx-auto bg-white rounded-lg shadow-lg overflow-hidden">
      {/* EMERGENCY VISIBILITY TEST */}
      <div className="p-4 bg-red-100 border-4 border-red-500">
        <div className="text-red-800 font-bold text-xl">🚨 CAMERA COMPONENT IS RENDERING</div>
        <div className="text-red-700 text-sm">
          This red box proves the camera component loaded. Session: {sessionToken || 'MISSING'}
        </div>
        <button
          onClick={() => alert('🚨 CAMERA TEST BUTTON WORKS')}
          className="mt-2 bg-red-600 text-white px-4 py-2 rounded"
        >
          Test Camera Component Button
        </button>
      </div>

      {/* Header */}
      <div className="bg-blue-600 text-white p-4">
        <h3 className="text-lg font-semibold flex items-center">
          <Camera className="mr-2" size={20} />
          Closing Vehicle Condition
        </h3>
      </div>

      {/* Instructions */}
      <div className="p-4 bg-gray-50">
        <h4 className="font-medium text-gray-900 mb-2">Closing Documentation Instructions</h4>
        <ul className="text-sm text-gray-600 space-y-1">
          <li>• Record a video showing the vehicle's return condition</li>
          <li>• Video must be at least {requirements?.minDuration || 20} seconds long</li>
          <li>• Document any new damage or changes</li>
          <li>• This video is mandatory for rental completion</li>
        </ul>
      </div>

      {/* Video Preview Area */}
      <div className="relative bg-gray-900" style={{ minHeight: '240px' }}>
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="w-full aspect-video object-cover"
          style={{ 
            backgroundColor: '#1f2937',
            minHeight: '240px',
            display: cameraStarted ? 'block' : 'none'
          }}
        />
        
        {/* Status Overlay */}
        {!cameraStarted && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-800">
            <div className="text-center text-white bg-black bg-opacity-50 p-4 rounded-lg">
              <Camera size={48} className="mx-auto mb-2 opacity-75" />
              {isInitializing ? (
                <>
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-white mx-auto mb-2"></div>
                  <p className="text-sm">Starting camera...</p>
                </>
              ) : cameraError ? (
                <p className="text-sm text-red-400">{cameraError}</p>
              ) : (
                <p className="text-sm">Camera not started</p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Error Display */}
      {cameraError && (
        <div className="p-4 bg-red-50 border-l-4 border-red-400">
          <div className="flex items-center">
            <AlertCircle className="text-red-400 mr-2" size={20} />
            <p className="text-red-700 text-sm">{cameraError}</p>
          </div>
        </div>
      )}

      {/* Controls */}
      <div className="p-4 space-y-3">
        {/* BUTTON TEST AREA */}
        <div className="p-3 bg-yellow-100 border-4 border-yellow-500 rounded">
          <div className="text-yellow-800 font-medium mb-2">🚨 BUTTON TEST</div>
          <button
            onClick={() => {
              alert('🚨 BUTTON CLICK WORKS - CALLING INITIALIZE CAMERA');
              initializeCamera();
            }}
            className="w-full bg-yellow-600 hover:bg-yellow-700 text-white py-2 px-4 rounded font-medium"
          >
            🚨 TEST - Initialize Camera
          </button>
        </div>

        {/* Start Camera Button */}
        {!cameraStarted && (
          <button
            onClick={() => {
              alert('🚨 START CAMERA BUTTON CLICKED');
              initializeCamera();
            }}
            disabled={isInitializing || disabled}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white py-3 px-4 rounded-lg flex items-center justify-center font-medium"
          >
            {isInitializing ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                Starting Camera...
              </>
            ) : (
              <>
                <Camera className="mr-2" size={20} />
                Start Camera
              </>
            )}
          </button>
        )}

        {/* Camera Controls */}
        {cameraStarted && (
          <div className="space-y-2">
            <div className="p-3 bg-green-100 border-2 border-green-500 rounded">
              <div className="text-green-800 font-bold">✅ CAMERA IS STARTED</div>
              <div className="text-green-700 text-sm">Camera preview should be visible above</div>
            </div>
            
            <button
              onClick={() => alert('🚨 START RECORDING CLICKED')}
              className="w-full bg-red-600 hover:bg-red-700 text-white py-3 px-4 rounded-lg flex items-center justify-center font-medium"
            >
              <div className="w-3 h-3 bg-white rounded-full mr-2"></div>
              Start Recording
            </button>
          </div>
        )}

        {/* Cancel Button */}
        <button
          onClick={() => {
            alert('🚨 CANCEL CLICKED');
            onError?.('User cancelled video recording');
          }}
          className="w-full bg-gray-300 hover:bg-gray-400 text-gray-700 py-2 px-4 rounded-lg"
        >
          Cancel
        </button>
      </div>
    </div>
  );
};

alert('🚨 CAMERA COMPONENT DEFINED - ABOUT TO EXPORT');
console.log('🚀 CAMERA COMPONENT EXPORT - MobileCameraCapture ready for export');

export default MobileCameraCapture;

alert('🚨 CAMERA COMPONENT EXPORTED SUCCESSFULLY');