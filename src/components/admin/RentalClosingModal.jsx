import React, { useState, useEffect } from 'react';
import { X, AlertTriangle, CheckCircle, Clock, Video, Shield, Key } from 'lucide-react';
import { useSelector } from 'react-redux';
import toast from 'react-hot-toast';

import MobileCameraCapture from '../video/MobileCameraCapture';
import videoCaptureService from '../../services/videoCaptureService';
import rentalClosingService from '../../services/rentalClosingService';

// IMMEDIATE ALERT DEBUGGING
alert('🚨 RENTAL CLOSING MODAL FILE IS LOADING');
console.log('🚀 RENTAL CLOSING MODAL FILE LOADED');

/**
 * Modal for rental closing with mandatory video capture
 */
const RentalClosingModal = ({ 
  rental, 
  isOpen, 
  onClose, 
  onSuccess 
}) => {
  // IMMEDIATE ALERT WHEN COMPONENT RENDERS
  alert('🚨 RENTAL CLOSING MODAL COMPONENT IS RENDERING');
  console.log('🚀 RENTAL CLOSING MODAL RENDERING', {
    hasRental: !!rental,
    isOpen,
    rentalId: rental?.id
  });

  const [currentStep, setCurrentStep] = useState('permission-check');
  const [permissions, setPermissions] = useState(null);
  const [requirements, setRequirements] = useState(null);
  const [captureSession, setCaptureSession] = useState(null);
  const [capturedVideo, setCapturedVideo] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showOverride, setShowOverride] = useState(false);
  const [overrideData, setOverrideData] = useState({ reason: '', pin: '' });
  const [error, setError] = useState(null);

  console.log('🔍 MODAL STATE:', {
    currentStep,
    hasPermissions: !!permissions,
    hasRequirements: !!requirements,
    hasCaptureSession: !!captureSession,
    hasCapturedVideo: !!capturedVideo,
    isProcessing,
    error
  });

  // Reset state when modal opens/closes
  useEffect(() => {
    alert(`🚨 MODAL EFFECT TRIGGERED - isOpen: ${isOpen}, hasRental: ${!!rental}`);
    console.log('🔍 MODAL EFFECT TRIGGERED', { isOpen, hasRental: !!rental });
    if (isOpen && rental) {
      alert('🚨 INITIALIZING CLOSING PROCESS');
      console.log('🔄 INITIALIZING CLOSING PROCESS');
      initializeClosingProcess();
    } else {
      console.log('🔄 RESETTING MODAL STATE');
      resetState();
    }
  }, [isOpen, rental]);

  const resetState = () => {
    console.log('🧹 RESETTING MODAL STATE');
    setCurrentStep('permission-check');
    setPermissions(null);
    setRequirements(null);
    setCaptureSession(null);
    setCapturedVideo(null);
    setIsProcessing(false);
    setShowOverride(false);
    setOverrideData({ reason: '', pin: '' });
    setError(null);
  };

  const initializeClosingProcess = async () => {
    alert('🚨 INITIALIZE CLOSING PROCESS STARTED');
    console.log('🔄 INITIALIZING CLOSING PROCESS STARTED');
    try {
      setIsProcessing(true);
      setError(null);

      // FORCE VIDEO CAPTURE STEP FOR TESTING
      alert('🚨 FORCING VIDEO CAPTURE STEP');
      console.log('🚨 FORCING VIDEO CAPTURE STEP FOR TESTING');
      setCurrentStep('video-capture');
      setCaptureSession({
        sessionToken: 'test_session_123',
        requirements: { minDuration: 20 }
      });
      setIsProcessing(false);
      alert('🚨 VIDEO CAPTURE STEP SET - CHECK FOR CAMERA COMPONENT');
      return;

    } catch (error) {
      alert(`🚨 ERROR: ${error.message}`);
      console.error('❌ ERROR INITIALIZING CLOSING PROCESS:', error);
      setError(error.message);
      toast.error(error.message);
    } finally {
      setIsProcessing(false);
      console.log('🏁 CLOSING PROCESS INITIALIZATION COMPLETED');
    }
  };

  const handleVideoCapture = async (videoFile, metadata) => {
    alert('🚨 VIDEO CAPTURE HANDLER CALLED');
    console.log('📹 HANDLING VIDEO CAPTURE', { hasFile: !!videoFile, metadata });
    // Video handling logic here
  };

  if (!isOpen || !rental) {
    console.log('🚫 MODAL NOT RENDERING - isOpen:', isOpen, 'hasRental:', !!rental);
    return null;
  }

  alert(`🚨 MODAL RENDERING WITH STEP: ${currentStep}`);
  console.log('🎨 MODAL RENDERING WITH STEP:', currentStep);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* EMERGENCY VISIBILITY TEST */}
        <div className="p-4 bg-red-100 border-4 border-red-500">
          <div className="text-red-800 font-bold text-xl">🚨 MODAL IS RENDERING</div>
          <div className="text-red-700">
            If you see this red box, the modal is working. Current step: {currentStep}
          </div>
          <button
            onClick={() => alert('🚨 MODAL TEST BUTTON WORKS')}
            className="mt-2 bg-red-600 text-white px-4 py-2 rounded"
          >
            Test Modal Button
          </button>
        </div>

        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">
              Close Rental Contract
            </h2>
            <p className="text-sm text-gray-600 mt-1">
              {rental.customer_name} - {rental.vehicle_plate_number}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X size={24} />
          </button>
        </div>

        {/* DEBUG PANEL */}
        <div className="p-4 bg-yellow-100 border-4 border-yellow-500">
          <div className="text-yellow-800 font-bold text-lg">🚨 DEBUG STATUS</div>
          <div className="text-yellow-700">
            Current Step: {currentStep} | Has Session: {!!captureSession ? 'YES' : 'NO'}
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          {/* Video Capture Step */}
          {currentStep === 'video-capture' && (
            <div>
              {/* STEP CONFIRMATION */}
              <div className="p-4 bg-green-100 border-4 border-green-500 mb-4">
                <div className="text-green-800 font-bold text-lg">✅ VIDEO CAPTURE STEP REACHED</div>
                <div className="text-green-700">
                  The modal has reached the video-capture step. Camera component should load below.
                </div>
              </div>

              <div className="mb-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  Record Closing Video
                </h3>
                
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
                  <div className="flex items-start">
                    <Video className="text-yellow-600 mr-2 mt-0.5" size={20} />
                    <div>
                      <p className="text-yellow-800 font-medium">Video Required for Closing</p>
                      <p className="text-yellow-700 text-sm mt-1">
                        You must record a live video to close this contract. Gallery uploads are not allowed.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {captureSession ? (
                <div>
                  <div className="p-4 bg-blue-100 border-4 border-blue-500 mb-4">
                    <div className="text-blue-800 font-bold text-lg">📹 ABOUT TO RENDER CAMERA COMPONENT</div>
                    <div className="text-blue-700">
                      Session Token: {captureSession.sessionToken}
                    </div>
                    <button
                      onClick={() => alert('🚨 PRE-CAMERA BUTTON TEST WORKS')}
                      className="mt-2 bg-blue-600 text-white px-4 py-2 rounded"
                    >
                      Test Before Camera
                    </button>
                  </div>
                  
                  <MobileCameraCapture
                    sessionToken={captureSession.sessionToken}
                    requirements={captureSession.requirements}
                    onVideoCapture={handleVideoCapture}
                    onError={setError}
                    disabled={isProcessing}
                  />

                  <div className="p-4 bg-purple-100 border-4 border-purple-500 mt-4">
                    <div className="text-purple-800 font-bold text-lg">📹 CAMERA COMPONENT RENDERED ABOVE</div>
                    <div className="text-purple-700">
                      If you don't see the camera component above, there's an import or rendering issue.
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-4 bg-red-100 border-4 border-red-500">
                  <div className="text-red-800 font-bold text-lg">❌ NO CAPTURE SESSION</div>
                  <div className="text-red-700">
                    Camera component cannot render without session
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Other steps would go here */}
          {currentStep !== 'video-capture' && (
            <div className="p-4 bg-gray-100 border-4 border-gray-500">
              <div className="text-gray-800 font-bold text-lg">ℹ️ NOT ON VIDEO CAPTURE STEP</div>
              <div className="text-gray-700">
                Current step is: {currentStep}. Video capture step not reached.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

alert('🚨 RENTAL CLOSING MODAL COMPONENT DEFINED');
console.log('🚀 RENTAL CLOSING MODAL EXPORT READY');

export default RentalClosingModal;