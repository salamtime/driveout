import React, { useState, useRef, useEffect } from 'react';
import { Camera, Video, X, Check, Upload, AlertCircle } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { getCompressedVideoRecorderOptions } from '../../utils/videoRecording';
import i18n from '../../i18n';

const MediaCapture = ({ 
  phase = 'opening', 
  onComplete,
  existingMedia = [],
  allowVideo = true,
  maxFiles = null,
  title = '',
  instructions = [],
  completeLabel = '',
  uploadLabel = '',
  useDefaultInstructions = true,
}) => {
  const isFrench = i18n.resolvedLanguage === 'fr';
  const tr = (en, fr) => (isFrench ? fr : en);
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
  const maxAllowedFiles = Number.isFinite(Number(maxFiles)) && Number(maxFiles) > 0 ? Number(maxFiles) : null;
  const isSingleFileMode = maxAllowedFiles === 1;

  const appendCapturedItems = (nextItems) => {
    setCapturedFiles((prev) => {
      const safeItems = Array.isArray(nextItems) ? nextItems.filter(Boolean) : [];
      if (!safeItems.length) return prev;

      if (isSingleFileMode) {
        prev.forEach((item) => {
          if (item?.url) {
            URL.revokeObjectURL(item.url);
          }
        });
        return [safeItems[safeItems.length - 1]];
      }

      const merged = [...prev, ...safeItems];
      if (!maxAllowedFiles) return merged;

      const trimmed = merged.slice(0, maxAllowedFiles);
      merged.slice(maxAllowedFiles).forEach((item) => {
        if (item?.url) {
          URL.revokeObjectURL(item.url);
        }
      });
      return trimmed;
    });
  };

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
      let mediaStream;
      try {
        mediaStream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'environment',
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
          audio: type === 'video'
        });
      } catch (primaryError) {
        mediaStream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: type === 'video'
        });
      }
      
      setStream(mediaStream);
      setRecordingType(type);
      
      if (videoRef.current) {
        const videoElement = videoRef.current;
        videoElement.srcObject = mediaStream;
        videoElement.muted = true;
        videoElement.playsInline = true;
        videoElement.autoplay = true;

        await new Promise((resolve) => {
          const handleReady = async () => {
            try {
              await videoElement.play();
            } catch (playError) {
              console.error('Error playing camera preview:', playError);
            }
            resolve();
          };

          if (videoElement.readyState >= 1) {
            void handleReady();
            return;
          }

          videoElement.onloadedmetadata = () => {
            videoElement.onloadedmetadata = null;
            void handleReady();
          };
        });
      }
    } catch (error) {
      console.error('Error accessing camera:', error);
      toast.error(tr('Failed to access camera. Please check permissions.', "Impossible d'accéder à la caméra. Vérifiez les autorisations."));
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
      
      appendCapturedItems([{
        file,
        url,
        type: 'photo',
        timestamp: new Date().toISOString()
      }]);
      
      toast.success(tr('Photo captured successfully', 'Photo capturée avec succès'));
      stopCamera();
    }, 'image/jpeg', 0.95);
  };

  const startRecording = () => {
    if (!stream) return;

    chunksRef.current = [];
    const recorder = new MediaRecorder(stream, getCompressedVideoRecorderOptions());

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
      
      appendCapturedItems([{
        file,
        url,
        type: 'video',
        duration,
        timestamp: new Date().toISOString()
      }]);
      
      toast.success(tr(`Video recorded successfully (${duration}s)`, `Vidéo enregistrée avec succès (${duration}s)`));
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
    toast.success(tr('File removed', 'Fichier supprimé'));
  };

  const handleFileUpload = (event) => {
    const files = Array.from(event.target.files);
    
    const acceptedFiles = maxAllowedFiles
      ? files.slice(0, isSingleFileMode ? 1 : Math.max(0, maxAllowedFiles - capturedFiles.length))
      : files;

    acceptedFiles.forEach(file => {
      const url = URL.createObjectURL(file);
      const type = file.type.startsWith('image/') ? 'photo' : 'video';
      
      // For videos, we'll estimate duration when possible
      if (type === 'video') {
        const video = document.createElement('video');
        video.preload = 'metadata';
        video.onloadedmetadata = () => {
          appendCapturedItems([{
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
        appendCapturedItems([{
          file,
          url,
          type,
          timestamp: new Date().toISOString()
        }]);
      }
    });
    
    if (files.length > acceptedFiles.length) {
      toast.success(
        isSingleFileMode
          ? tr('Photo updated', 'Photo mise à jour')
          : tr(`${acceptedFiles.length} file(s) uploaded`, `${acceptedFiles.length} fichier(s) téléversé(s)`)
      );
    } else {
      toast.success(tr(`${acceptedFiles.length} file(s) uploaded`, `${acceptedFiles.length} fichier(s) téléversé(s)`));
    }
  };

  const handleComplete = () => {
    // Validation for closing phase
    if (phase === 'closing') {
      const hasVideo = capturedFiles.some(f => f.type === 'video');
      if (!hasVideo) {
        toast.error(tr('At least one video is required for closing documentation', 'Au moins une vidéo est requise pour la documentation de clôture'));
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

  const instructionTitle = title || (phase === 'opening'
    ? tr('Opening Documentation', "Documentation d'ouverture")
    : tr('Closing Documentation', 'Documentation de clôture'));
  const instructionItems = instructions.length
    ? instructions
    : useDefaultInstructions && phase === 'opening'
      ? [
          tr("Capture photos and videos of the vehicle's current condition", "Capturez des photos et vidéos de l'état actuel du véhicule"),
          tr('Document any existing damage, scratches, or issues', 'Documentez tout dommage, rayure ou problème existant'),
          tr('Include interior and exterior views', "Incluez des vues intérieures et extérieures"),
          tr('Record odometer reading', 'Enregistrez le kilométrage'),
        ]
      : useDefaultInstructions
        ? [
          tr('At least one video is required for closing documentation', 'Au moins une vidéo est requise pour la documentation de clôture'),
          tr("Document the vehicle's condition upon return", "Documentez l'état du véhicule au retour"),
          tr('Capture any new damage or issues', 'Capturez tout nouveau dommage ou problème'),
          tr('Record final odometer reading', 'Enregistrez le kilométrage final'),
          tr('Include fuel level documentation', 'Incluez la documentation du niveau de carburant'),
        ]
        : [];
  const resolvedCompleteLabel = completeLabel || (isFrench
    ? `Terminer la documentation ${phase === 'opening' ? "d'ouverture" : 'de clôture'}`
    : `Complete ${phase === 'opening' ? 'Opening' : 'Closing'} Documentation`);
  const resolvedUploadLabel = uploadLabel || tr('Upload Files', 'Téléverser des fichiers');
  const shouldShowInstructions = Boolean(String(title || '').trim()) || instructionItems.length > 0;

  return (
    <div className="space-y-6">
      {/* Instructions */}
      {shouldShowInstructions ? (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-start">
            <AlertCircle className="w-5 h-5 text-blue-600 mt-0.5 mr-3 flex-shrink-0" />
            <div className="text-sm text-blue-900">
              {String(title || '').trim() ? (
                <p className="font-semibold mb-2">
                  {instructionTitle}
                </p>
              ) : null}
              {instructionItems.length ? (
                <ul className="list-disc list-inside space-y-1">
                  {instructionItems.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {/* Camera View */}
      {stream && (
        <div className="relative mx-auto w-full max-w-[320px] overflow-hidden rounded-[28px] bg-black aspect-square">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="h-full w-full object-cover"
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
            
            {allowVideo && recordingType === 'video' && !isRecording && (
              <button
                onClick={startRecording}
                className="bg-red-600 text-white p-4 rounded-full hover:bg-red-700 transition-colors"
              >
                <Video className="w-6 h-6" />
              </button>
            )}
            
            {allowVideo && recordingType === 'video' && isRecording && (
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
        <div className={`grid grid-cols-1 gap-4 ${allowVideo ? 'md:grid-cols-3' : 'md:grid-cols-2'}`}>
          <button
            onClick={() => startCamera('photo')}
            className="flex items-center justify-center space-x-2 bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Camera className="w-5 h-5" />
            <span>{tr('Take Photo', 'Prendre une photo')}</span>
          </button>
          
          {allowVideo ? (
            <button
              onClick={() => startCamera('video')}
              className="flex items-center justify-center space-x-2 bg-red-600 text-white px-6 py-3 rounded-lg hover:bg-red-700 transition-colors"
            >
              <Video className="w-5 h-5" />
              <span>{tr('Record Video', 'Enregistrer une vidéo')}</span>
            </button>
          ) : null}
          
          <label className="flex items-center justify-center space-x-2 bg-gray-600 text-white px-6 py-3 rounded-lg hover:bg-gray-700 transition-colors cursor-pointer">
            <Upload className="w-5 h-5" />
            <span>{resolvedUploadLabel}</span>
            <input
              type="file"
              multiple={!isSingleFileMode}
              accept={allowVideo ? 'image/*,video/*' : 'image/*'}
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
            {tr('Captured Media', 'Médias capturés')} ({capturedFiles.length})
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
          <span>{resolvedCompleteLabel}</span>
        </button>
      </div>
    </div>
  );
};

export default MediaCapture;
