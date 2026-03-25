import React, { useState, useRef, useEffect } from 'react';
import { Camera, Video, X, Check, Upload, AlertCircle } from 'lucide-react';
import { toast } from 'react-hot-toast';

const MediaCapture = ({ 
  phase = 'opening', 
  onComplete,
  existingMedia = []
}) => {
  const [capturedFiles, setCapturedFiles] = useState(existingMedia || []);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingType, setRecordingType] = useState(null);
  const [stream, setStream] = useState(null);
  const [mediaRecorder, setMediaRecorder] = useState(null);
  const [recordingStartTime, setRecordingStartTime] = useState(null);
  const [recordingDuration, setRecordingDuration] = useState(0);
  
  const videoRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);

  useEffect(() => {
    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [stream]);

  const startCamera = async (type) => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: type === 'video'
      });
      
      setStream(mediaStream);
      setRecordingType(type);
      
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
    } catch (error) {
      console.error('Error accessing camera:', error);
      toast.error('Failed to access camera. Please check permissions.');
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setRecordingType(null);
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const capturePhoto = () => {
    if (!videoRef.current) return;

    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    
    const ctx = canvas.getContext('2d');
    ctx.drawImage(videoRef.current, 0, 0);
    
    canvas.toBlob((blob) => {
      const file = new File([blob], `photo_${Date.now()}.jpg`, { type: 'image/jpeg' });
      const url = URL.createObjectURL(blob);
      
      setCapturedFiles(prev => [...prev, {
        file,
        url,
        type: 'photo',
        timestamp: new Date().toISOString()
      }]);
      
      toast.success('Photo captured successfully');
      stopCamera();
    }, 'image/jpeg', 0.95);
  };

  const startRecording = () => {
    if (!stream) return;

    chunksRef.current = [];
    const recorder = new MediaRecorder(stream, {
      mimeType: 'video/webm;codecs=vp9'
    });

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        chunksRef.current.push(event.data);
      }
    };

    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: 'video/webm' });
      const file = new File([blob], `video_${Date.now()}.webm`, { type: 'video/webm' });
      const url = URL.createObjectURL(blob);
      
      // Calculate duration
      const duration = Math.floor((Date.now() - recordingStartTime) / 1000);
      
      setCapturedFiles(prev => [...prev, {
        file,
        url,
        type: 'video',
        duration,
        timestamp: new Date().toISOString()
      }]);
      
      toast.success(`Video recorded successfully (${duration}s)`);
      stopCamera();
      setRecordingDuration(0);
    };

    recorder.start(1000); // Collect data every second
    setMediaRecorder(recorder);
    setIsRecording(true);
    setRecordingStartTime(Date.now());
    
    // Start timer
    timerRef.current = setInterval(() => {
      setRecordingDuration(prev => prev + 1);
    }, 1000);
  };

  const stopRecording = () => {
    if (mediaRecorder && isRecording) {
      mediaRecorder.stop();
      setIsRecording(false);
      setMediaRecorder(null);
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
  };

  const removeFile = (index) => {
    setCapturedFiles(prev => {
      const newFiles = [...prev];
      URL.revokeObjectURL(newFiles[index].url);
      newFiles.splice(index, 1);
      return newFiles;
    });
    toast.success('File removed');
  };

  const handleFileUpload = (event) => {
    const files = Array.from(event.target.files);
    
    files.forEach(file => {
      const url = URL.createObjectURL(file);
      const type = file.type.startsWith('image/') ? 'photo' : 'video';
      
      // For videos, we'll estimate duration when possible
      if (type === 'video') {
        const video = document.createElement('video');
        video.preload = 'metadata';
        video.onloadedmetadata = () => {
          setCapturedFiles(prev => [...prev, {
            file,
            url,
            type,
            duration: Math.floor(video.duration),
            timestamp: new Date().toISOString()
          }]);
          URL.revokeObjectURL(video.src);
        };
        video.src = url;
      } else {
        setCapturedFiles(prev => [...prev, {
          file,
          url,
          type,
          timestamp: new Date().toISOString()
        }]);
      }
    });
    
    toast.success(`${files.length} file(s) uploaded`);
  };

  const handleComplete = () => {
    // Validation for closing phase
    if (phase === 'closing') {
      const hasVideo = capturedFiles.some(f => f.type === 'video');
      if (!hasVideo) {
        toast.error('At least one video is required for closing documentation');
        return;
      }
    }

    onComplete(capturedFiles);
  };

  const formatDuration = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="space-y-6">
      {/* Instructions */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-start">
          <AlertCircle className="w-5 h-5 text-blue-600 mt-0.5 mr-3 flex-shrink-0" />
          <div className="text-sm text-blue-900">
            <p className="font-semibold mb-2">
              {phase === 'opening' ? 'Opening Documentation' : 'Closing Documentation'}
            </p>
            <ul className="list-disc list-inside space-y-1">
              {phase === 'opening' ? (
                <>
                  <li>Capture photos and videos of the vehicle's current condition</li>
                  <li>Document any existing damage, scratches, or issues</li>
                  <li>Include interior and exterior views</li>
                  <li>Record odometer reading</li>
                </>
              ) : (
                <>
                  <li>At least one video is required for closing documentation</li>
                  <li>Document the vehicle's condition upon return</li>
                  <li>Capture any new damage or issues</li>
                  <li>Record final odometer reading</li>
                  <li>Include fuel level documentation</li>
                </>
              )}
            </ul>
          </div>
        </div>
      </div>

      {/* Camera View */}
      {stream && (
        <div className="relative bg-black rounded-lg overflow-hidden">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-auto"
          />
          
          {isRecording && (
            <div className="absolute top-4 left-4 bg-red-600 text-white px-3 py-1 rounded-full flex items-center space-x-2">
              <div className="w-3 h-3 bg-white rounded-full animate-pulse" />
              <span className="font-mono">{formatDuration(recordingDuration)}</span>
            </div>
          )}

          <div className="absolute bottom-4 left-0 right-0 flex justify-center space-x-4">
            {recordingType === 'photo' && (
              <button
                onClick={capturePhoto}
                className="bg-white text-gray-900 p-4 rounded-full hover:bg-gray-100 transition-colors"
              >
                <Camera className="w-6 h-6" />
              </button>
            )}
            
            {recordingType === 'video' && !isRecording && (
              <button
                onClick={startRecording}
                className="bg-red-600 text-white p-4 rounded-full hover:bg-red-700 transition-colors"
              >
                <Video className="w-6 h-6" />
              </button>
            )}
            
            {recordingType === 'video' && isRecording && (
              <button
                onClick={stopRecording}
                className="bg-white text-gray-900 p-4 rounded-full hover:bg-gray-100 transition-colors"
              >
                <div className="w-6 h-6 bg-red-600 rounded-sm" />
              </button>
            )}
            
            <button
              onClick={stopCamera}
              className="bg-gray-800 text-white p-4 rounded-full hover:bg-gray-700 transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>
      )}

      {/* Capture Controls */}
      {!stream && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <button
            onClick={() => startCamera('photo')}
            className="flex items-center justify-center space-x-2 bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Camera className="w-5 h-5" />
            <span>Take Photo</span>
          </button>
          
          <button
            onClick={() => startCamera('video')}
            className="flex items-center justify-center space-x-2 bg-red-600 text-white px-6 py-3 rounded-lg hover:bg-red-700 transition-colors"
          >
            <Video className="w-5 h-5" />
            <span>Record Video</span>
          </button>
          
          <label className="flex items-center justify-center space-x-2 bg-gray-600 text-white px-6 py-3 rounded-lg hover:bg-gray-700 transition-colors cursor-pointer">
            <Upload className="w-5 h-5" />
            <span>Upload Files</span>
            <input
              type="file"
              multiple
              accept="image/*,video/*"
              onChange={handleFileUpload}
              className="hidden"
            />
          </label>
        </div>
      )}

      {/* Captured Files Grid */}
      {capturedFiles.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold mb-3">
            Captured Media ({capturedFiles.length})
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {capturedFiles.map((item, index) => (
              <div key={index} className="relative group">
                <div className="aspect-video bg-gray-100 rounded-lg overflow-hidden">
                  {item.type === 'photo' ? (
                    <img
                      src={item.url}
                      alt={`Captured ${index + 1}`}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="relative w-full h-full">
                      <video
                        src={item.url}
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-30">
                        <Video className="w-8 h-8 text-white" />
                      </div>
                      {item.duration && (
                        <div className="absolute bottom-2 right-2 bg-black bg-opacity-75 text-white text-xs px-2 py-1 rounded">
                          {formatDuration(item.duration)}
                        </div>
                      )}
                    </div>
                  )}
                </div>
                
                <button
                  onClick={() => removeFile(index)}
                  className="absolute top-2 right-2 bg-red-600 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Complete Button */}
      <div className="flex justify-end">
        <button
          onClick={handleComplete}
          disabled={capturedFiles.length === 0}
          className="flex items-center space-x-2 bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
        >
          <Check className="w-5 h-5" />
          <span>Complete {phase === 'opening' ? 'Opening' : 'Closing'} Documentation</span>
        </button>
      </div>
    </div>
  );
};

export default MediaCapture;