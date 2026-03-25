import React, { useState, useRef, useEffect } from 'react';
import { Camera, AlertCircle } from 'lucide-react';

/**
 * Minimal camera test component to isolate camera access issues
 */
const SimpleCameraTest = () => {
  const [stream, setStream] = useState(null);
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [videoPlaying, setVideoPlaying] = useState(false);
  const videoRef = useRef(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, [stream]);

  // Enhanced stream assignment with visibility fixes
  useEffect(() => {
    if (videoRef.current && stream) {
      console.log('📹 Assigning stream to video element');
      
      // Clear any existing srcObject first
      videoRef.current.srcObject = null;
      
      // Add a small delay to ensure proper cleanup
      setTimeout(() => {
        if (videoRef.current && stream) {
          videoRef.current.srcObject = stream;
          
          // Enhanced video element setup for maximum visibility
          videoRef.current.setAttribute('webkit-playsinline', 'true');
          videoRef.current.setAttribute('playsinline', 'true');
          videoRef.current.muted = true;
          videoRef.current.autoplay = true;
          
          // Force video dimensions and visibility
          videoRef.current.style.width = '100%';
          videoRef.current.style.height = 'auto';
          videoRef.current.style.minHeight = '200px';
          videoRef.current.style.display = 'block';
          videoRef.current.style.visibility = 'visible';
          videoRef.current.style.opacity = '1';
          videoRef.current.style.zIndex = '1';
          
          console.log('🎥 Video element configured for maximum visibility');
          
          // Multiple play attempts for iOS Safari compatibility
          const attemptPlay = async () => {
            try {
              console.log('▶️ Attempting to play video...');
              await videoRef.current.play();
              setVideoPlaying(true);
              console.log('✅ Video playback started successfully');
            } catch (playError) {
              console.error('❌ Video play failed:', playError);
              
              // Try again after a short delay
              setTimeout(async () => {
                try {
                  if (videoRef.current && stream) {
                    await videoRef.current.play();
                    setVideoPlaying(true);
                    console.log('✅ Video playback started on retry');
                  }
                } catch (retryError) {
                  console.error('❌ Video play retry failed:', retryError);
                }
              }, 100);
            }
          };
          
          attemptPlay();
        }
      }, 50);
    } else if (videoRef.current && !stream) {
      videoRef.current.srcObject = null;
      setVideoPlaying(false);
    }
  }, [stream]);

  const startCamera = async () => {
    console.log('🎥 Starting simple camera test...');
    setIsLoading(true);
    setError(null);
    setVideoPlaying(false);

    try {
      // Check if getUserMedia is available
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('getUserMedia not supported');
      }

      console.log('📱 getUserMedia is available');

      // Try with optimized constraints for visibility
      const constraints = {
        video: {
          width: { ideal: 640, max: 1280 },
          height: { ideal: 480, max: 720 },
          facingMode: 'environment'
        },
        audio: false // Start without audio to simplify
      };

      console.log('🔧 Requesting camera with constraints:', constraints);

      const mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
      
      console.log('✅ Got media stream:', {
        id: mediaStream.id,
        videoTracks: mediaStream.getVideoTracks().length,
        audioTracks: mediaStream.getAudioTracks().length,
        active: mediaStream.active
      });

      // Log video track details
      const videoTrack = mediaStream.getVideoTracks()[0];
      if (videoTrack) {
        const settings = videoTrack.getSettings();
        console.log('📊 Video track:', {
          label: videoTrack.label,
          kind: videoTrack.kind,
          enabled: videoTrack.enabled,
          readyState: videoTrack.readyState,
          settings: settings
        });
      }

      setStream(mediaStream);
      console.log('✅ Stream set in state');

    } catch (err) {
      console.error('❌ Camera error:', err);
      
      let errorMsg = 'Camera access failed';
      
      switch (err.name) {
        case 'NotAllowedError':
          errorMsg = 'Camera permission denied. Please allow camera access.';
          break;
        case 'NotFoundError':
          errorMsg = 'No camera found on this device.';
          break;
        case 'NotSupportedError':
          errorMsg = 'Camera not supported on this device.';
          break;
        case 'OverconstrainedError':
          errorMsg = 'Camera constraints not supported. Trying fallback...';
          
          // Try fallback with minimal constraints
          try {
            console.log('🔄 Trying fallback constraints...');
            const fallbackStream = await navigator.mediaDevices.getUserMedia({
              video: true,
              audio: false
            });
            setStream(fallbackStream);
            console.log('✅ Fallback camera successful');
            return;
          } catch (fallbackError) {
            console.error('❌ Fallback failed:', fallbackError);
            errorMsg = 'Camera initialization failed completely';
          }
          break;
        default:
          errorMsg = `Camera error: ${err.message}`;
      }
      
      setError(errorMsg);
    } finally {
      setIsLoading(false);
    }
  };

  const stopCamera = () => {
    console.log('🛑 Stopping camera...');
    if (stream) {
      stream.getTracks().forEach(track => {
        console.log(`Stopping track: ${track.kind}`);
        track.stop();
      });
      setStream(null);
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setVideoPlaying(false);
  };

  return (
    <div className="max-w-md mx-auto bg-white rounded-lg shadow-lg p-6">
      <h2 className="text-xl font-bold mb-4 flex items-center">
        <Camera className="mr-2" />
        Simple Camera Test
      </h2>

      {/* Enhanced Video Preview Container */}
      <div className="relative bg-gray-900 rounded-lg overflow-hidden mb-4" style={{ minHeight: '240px' }}>
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          webkit-playsinline="true"
          className="w-full aspect-video object-cover"
          style={{
            minHeight: '200px',
            display: 'block',
            visibility: 'visible',
            opacity: 1,
            backgroundColor: '#1f2937',
            zIndex: 1
          }}
          onLoadedMetadata={() => {
            console.log('📹 Video metadata loaded');
            console.log('📐 Video dimensions:', {
              videoWidth: videoRef.current?.videoWidth,
              videoHeight: videoRef.current?.videoHeight
            });
          }}
          onPlay={() => {
            console.log('▶️ Video playing');
            setVideoPlaying(true);
          }}
          onPause={() => {
            console.log('⏸️ Video paused');
            setVideoPlaying(false);
          }}
          onError={(e) => {
            console.error('❌ Video error:', e);
            console.error('Video error details:', {
              error: e.target.error,
              networkState: e.target.networkState,
              readyState: e.target.readyState
            });
          }}
          onCanPlay={() => {
            console.log('✅ Video can play');
          }}
        />
        
        {/* Enhanced placeholder */}
        {!stream && (
          <div className="absolute inset-0 flex items-center justify-center" style={{ zIndex: 2 }}>
            <div className="text-center text-white">
              <Camera size={48} className="mx-auto mb-2 opacity-50" />
              <p className="text-sm">
                {isLoading ? 'Starting camera...' : 'Camera preview will appear here'}
              </p>
            </div>
          </div>
        )}
        
        {/* Stream active but video not playing indicator */}
        {stream && !videoPlaying && (
          <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50" style={{ zIndex: 2 }}>
            <div className="text-center text-white">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white mx-auto mb-2"></div>
              <p className="text-sm">Starting video preview...</p>
            </div>
          </div>
        )}
      </div>

      {/* Error Display */}
      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
          <div className="flex items-center text-red-700">
            <AlertCircle size={16} className="mr-2" />
            <span className="text-sm">{error}</span>
          </div>
        </div>
      )}

      {/* Enhanced Debug Info */}
      <div className="mb-4 p-3 bg-gray-50 rounded-lg">
        <h3 className="text-sm font-medium mb-2">Debug Info:</h3>
        <div className="text-xs space-y-1">
          <div>Stream: {stream ? '✅ Active' : '❌ None'}</div>
          <div>Video Playing: {videoPlaying ? '✅ Yes' : '❌ No'}</div>
          <div>Loading: {isLoading ? '⏳ Yes' : '✅ No'}</div>
          <div>Error: {error ? '❌ Yes' : '✅ No'}</div>
          <div>getUserMedia: {navigator.mediaDevices?.getUserMedia ? '✅ Available' : '❌ Not Available'}</div>
          <div>Tracks: {stream?.getTracks().length || 0}</div>
          {stream && (
            <div>Stream Active: {stream.active ? '✅ Yes' : '❌ No'}</div>
          )}
          <div>User Agent: {navigator.userAgent.substring(0, 50)}...</div>
        </div>
      </div>

      {/* Controls */}
      <div className="space-y-2">
        {!stream ? (
          <button
            onClick={startCamera}
            disabled={isLoading}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white py-2 px-4 rounded-lg flex items-center justify-center"
          >
            {isLoading ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                Starting Camera...
              </>
            ) : (
              <>
                <Camera className="mr-2" size={16} />
                Start Camera
              </>
            )}
          </button>
        ) : (
          <button
            onClick={stopCamera}
            className="w-full bg-red-600 hover:bg-red-700 text-white py-2 px-4 rounded-lg"
          >
            Stop Camera
          </button>
        )}
      </div>

      {/* Instructions */}
      <div className="mt-4 p-3 bg-blue-50 rounded-lg">
        <h3 className="text-sm font-medium text-blue-800 mb-1">Test Instructions:</h3>
        <ol className="text-xs text-blue-700 space-y-1">
          <li>1. Click "Start Camera"</li>
          <li>2. Allow camera permission when prompted</li>
          <li>3. Check if video preview appears</li>
          <li>4. Check browser console for debug logs</li>
          <li>5. Report any errors or issues</li>
        </ol>
      </div>
    </div>
  );
};

export default SimpleCameraTest;