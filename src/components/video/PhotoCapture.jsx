import React, { useState, useRef, useEffect } from 'react';
import { Camera, Trash2, CheckCircle, AlertCircle, X } from 'lucide-react';

/**
 * Photo Capture Component - Alternative to problematic video recording
 * Reliable photo capture that works on iOS Safari
 */
const PhotoCapture = ({ 
  sessionToken, 
  requirements, 
  onPhotosCapture, 
  onError,
  disabled = false 
}) => {
  const [stream, setStream] = useState(null);
  const [capturedPhotos, setCapturedPhotos] = useState([]);
  const [error, setError] = useState(null);
  const [isCapturing, setIsCapturing] = useState(false);

  const videoRef = useRef(null);
  const canvasRef = useRef(null);

  // Initialize camera on component mount
  useEffect(() => {
    initializeCamera();
    return cleanup;
  }, []);

  const cleanup = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
    }
  };

  const initializeCamera = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { 
          facingMode: 'environment',
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      });
      
      setStream(mediaStream);
      
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
      
    } catch (err) {
      console.error('Camera initialization failed:', err);
      setError('Camera access failed. Please allow camera permissions.');
      onError?.(err.message);
    }
  };

  const capturePhoto = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    
    if (!video || !canvas || !stream) {
      setError('Camera not ready for photo capture');
      return;
    }

    setIsCapturing(true);
    
    try {
      // Set canvas dimensions to match video
      canvas.width = video.videoWidth || 1280;
      canvas.height = video.videoHeight || 720;
      
      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      
      // Convert to blob and create file
      canvas.toBlob((blob) => {
        if (blob) {
          const timestamp = Date.now();
          const file = new File([blob], `photo_${timestamp}.jpg`, { type: 'image/jpeg' });
          
          const photoData = {
            id: timestamp,
            file,
            blob,
            url: URL.createObjectURL(blob),
            capturedAt: new Date().toISOString()
          };
          
          setCapturedPhotos(prev => [...prev, photoData]);
          setError(null);
        } else {
          setError('Failed to capture photo');
        }
        setIsCapturing(false);
      }, 'image/jpeg', 0.8);
      
    } catch (err) {
      console.error('Photo capture failed:', err);
      setError('Photo capture failed: ' + err.message);
      setIsCapturing(false);
    }
  };

  const deletePhoto = (photoId) => {
    setCapturedPhotos(prev => {
      const updated = prev.filter(photo => photo.id !== photoId);
      // Clean up URL for deleted photo
      const deletedPhoto = prev.find(photo => photo.id === photoId);
      if (deletedPhoto?.url) {
        URL.revokeObjectURL(deletedPhoto.url);
      }
      return updated;
    });
  };

  const retakeAllPhotos = () => {
    // Clean up all URLs
    capturedPhotos.forEach(photo => {
      if (photo.url) {
        URL.revokeObjectURL(photo.url);
      }
    });
    setCapturedPhotos([]);
    setError(null);
  };

  const submitPhotos = () => {
    if (capturedPhotos.length === 0) {
      setError('Please capture at least one photo');
      return;
    }

    if (!sessionToken) {
      setError('Session token missing');
      return;
    }
    
    const metadata = {
      rentalId: sessionToken.split('_')[0],
      photoCount: capturedPhotos.length,
      capturedAt: new Date().toISOString(),
      totalSize: capturedPhotos.reduce((sum, photo) => sum + photo.file.size, 0)
    };
    
    // Return array of files and metadata
    const files = capturedPhotos.map(photo => photo.file);
    onPhotosCapture?.(files, metadata);
  };

  const minPhotos = requirements?.minPhotos || 3;
  const maxPhotos = requirements?.maxPhotos || 5;
  const canSubmit = capturedPhotos.length >= minPhotos;

  return (
    <div className="w-full max-w-md mx-auto bg-white rounded-lg shadow-lg overflow-hidden">
      {/* Header */}
      <div className="bg-green-600 text-white p-4">
        <h3 className="text-lg font-semibold flex items-center">
          <Camera className="mr-2" size={20} />
          Photo Documentation
        </h3>
        <p className="text-sm opacity-90 mt-1">
          Capture {minPhotos}-{maxPhotos} photos • {capturedPhotos.length}/{maxPhotos} taken
        </p>
      </div>

      {/* Camera Preview */}
      <div className="relative bg-black" style={{ height: '280px' }}>
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="w-full h-full object-cover"
          style={{ backgroundColor: 'black' }}
        />
        
        {/* Capture Flash Effect */}
        {isCapturing && (
          <div className="absolute inset-0 bg-white opacity-70 animate-pulse"></div>
        )}
        
        {/* Camera Grid Lines */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="w-full h-full grid grid-cols-3 grid-rows-3">
            {Array.from({ length: 9 }).map((_, i) => (
              <div key={i} className="border border-white border-opacity-20"></div>
            ))}
          </div>
        </div>
      </div>

      {/* Hidden canvas for photo capture */}
      <canvas ref={canvasRef} style={{ display: 'none' }} />

      {/* Error Display */}
      {error && (
        <div className="p-4 bg-red-100 border-l-4 border-red-500">
          <div className="flex items-center">
            <AlertCircle className="text-red-500 mr-2" size={20} />
            <p className="text-red-800 text-sm">{error}</p>
          </div>
        </div>
      )}

      {/* Photo Gallery */}
      {capturedPhotos.length > 0 && (
        <div className="p-4 border-b">
          <h4 className="text-sm font-semibold text-gray-800 mb-3">Captured Photos:</h4>
          <div className="grid grid-cols-3 gap-2">
            {capturedPhotos.map((photo) => (
              <div key={photo.id} className="relative group">
                <img
                  src={photo.url}
                  alt="Captured"
                  className="w-full h-20 object-cover rounded border-2 border-gray-200"
                />
                <button
                  onClick={() => deletePhoto(photo.id)}
                  className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Controls */}
      <div className="p-4 space-y-3">
        {/* Capture Button */}
        {stream && capturedPhotos.length < maxPhotos && (
          <button
            onClick={capturePhoto}
            disabled={disabled || isCapturing}
            className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white py-3 px-4 rounded-lg flex items-center justify-center font-medium"
          >
            <Camera className="mr-2" size={20} />
            {isCapturing ? 'Capturing...' : 'Take Photo'}
          </button>
        )}

        {/* Action Buttons */}
        {capturedPhotos.length > 0 && (
          <div className="space-y-2">
            {canSubmit && (
              <button
                onClick={submitPhotos}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 px-4 rounded-lg flex items-center justify-center font-medium"
              >
                <CheckCircle className="mr-2" size={20} />
                Submit Photos ({capturedPhotos.length})
              </button>
            )}
            
            <button
              onClick={retakeAllPhotos}
              className="w-full bg-gray-600 hover:bg-gray-700 text-white py-2 px-4 rounded-lg flex items-center justify-center font-medium"
            >
              <Trash2 className="mr-2" size={16} />
              Retake All Photos
            </button>
          </div>
        )}

        {/* Loading State */}
        {!stream && !error && (
          <div className="text-center py-4">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600 mx-auto mb-2"></div>
            <p className="text-gray-600 text-sm">Initializing camera...</p>
          </div>
        )}
      </div>

      {/* Instructions */}
      <div className="px-4 pb-4">
        <div className="bg-green-50 p-3 rounded-lg border border-green-200">
          <h4 className="text-sm font-semibold text-green-800 mb-2">Photo Instructions:</h4>
          <ul className="text-xs text-green-700 space-y-1">
            <li>• Take {minPhotos}-{maxPhotos} clear photos from different angles</li>
            <li>• Ensure good lighting and focus</li>
            <li>• Capture all relevant details and conditions</li>
            <li>• Tap photos to delete if needed</li>
            <li>• Submit when you have enough photos</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default PhotoCapture;