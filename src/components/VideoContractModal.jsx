import React, { useState, useRef } from 'react';
import { X, Upload, Play, Download, AlertCircle, CheckCircle, FileVideo, Smartphone, Monitor } from 'lucide-react';

const VideoContractModal = ({ 
  isOpen, 
  onClose, 
  onVideoSave, 
  rentalId, 
  phase = 'opening_inspection',
  customerName = 'Customer' 
}) => {
  // Core state
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [uploading, setUploading] = useState(false);

  // Refs
  const fileInputRef = useRef(null);
  const videoPreviewRef = useRef(null);

  // Device detection for UI optimization
  const [deviceInfo] = useState(() => {
    const userAgent = navigator.userAgent;
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent);
    const isIOS = /iPad|iPhone|iPod/.test(userAgent);
    const isAndroid = /Android/.test(userAgent);
    
    let browser = 'Unknown';
    if (userAgent.includes('Chrome')) browser = 'Chrome';
    else if (userAgent.includes('Safari') && !userAgent.includes('Chrome')) browser = 'Safari';
    else if (userAgent.includes('Firefox')) browser = 'Firefox';
    else if (userAgent.includes('Edge')) browser = 'Edge';

    return { isMobile, isIOS, isAndroid, browser };
  });

  // Handle file selection from gallery
  const handleFileSelect = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    setError('');
    setSuccess('');

    // Validate file type
    if (!file.type.startsWith('video/')) {
      setError('Please select a valid video file.');
      return;
    }

    // Validate file size (max 100MB)
    const maxSize = 100 * 1024 * 1024; // 100MB
    if (file.size > maxSize) {
      setError('File size must be less than 100MB.');
      return;
    }

    console.log('📹 File selected:', {
      name: file.name,
      type: file.type,
      size: file.size,
      lastModified: new Date(file.lastModified)
    });

    setSelectedFile(file);

    // Create preview URL
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);

    setSuccess(`Video selected: ${file.name} (${formatFileSize(file.size)})`);
  };

  // Open file picker
  const openFilePicker = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  // Save uploaded video
  const saveVideo = async () => {
    if (!selectedFile) return;

    try {
      setUploading(true);
      setError('');
      
      const timestamp = Date.now();
      const filename = `${phase}_${timestamp}_${selectedFile.name}`;
      
      console.log('💾 Saving uploaded video:', { 
        filename, 
        size: selectedFile.size, 
        type: selectedFile.type 
      });

      // Get video duration if possible
      let duration = 0;
      if (videoPreviewRef.current) {
        duration = Math.floor(videoPreviewRef.current.duration || 0);
      }

      await onVideoSave({
        file: selectedFile,
        filename,
        phase,
        rentalId,
        duration,
        size: selectedFile.size
      });

      setSuccess('Video uploaded successfully!');
      
      // Reset state and close modal
      setTimeout(() => {
        resetState();
        onClose();
      }, 1500);

    } catch (err) {
      console.error('❌ Save video failed:', err);
      setError(`Failed to save video: ${err.message}`);
    } finally {
      setUploading(false);
    }
  };

  // Download video locally
  const downloadVideo = () => {
    if (!selectedFile) return;

    const url = URL.createObjectURL(selectedFile);
    const a = document.createElement('a');
    a.href = url;
    a.download = selectedFile.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Reset state
  const resetState = () => {
    setSelectedFile(null);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
    setError('');
    setSuccess('');
    setUploading(false);
    
    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Handle modal close
  const handleClose = () => {
    resetState();
    onClose();
  };

  // Format file size helper
  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // Format duration helper
  const formatDuration = (seconds) => {
    if (!seconds || seconds === 0) return 'Unknown';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-4xl w-full max-h-[95vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">
              Upload Video - {phase.replace('_', ' ').toUpperCase()}
            </h2>
            <p className="text-sm text-gray-600">
              Customer: {customerName} | Rental ID: {rentalId}
            </p>
          </div>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-600 p-2"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        {/* Device Info Panel */}
        <div className="p-4 bg-blue-50 border-b">
          <div className="flex items-center gap-2 mb-2">
            {deviceInfo.isMobile ? <Smartphone className="h-4 w-4" /> : <Monitor className="h-4 w-4" />}
            <span className="font-medium text-sm">
              Device: {deviceInfo.isMobile ? 'Mobile' : 'Desktop'} | 
              {deviceInfo.browser} | 
              {deviceInfo.isIOS ? 'iOS' : deviceInfo.isAndroid ? 'Android' : 'Other'}
            </span>
          </div>
          
          <div className="text-xs text-gray-600">
            <span className="font-medium">Upload Method:</span>
            <span className="text-blue-600"> Gallery/File Picker</span>
          </div>
        </div>

        {/* Main Content */}
        <div className="p-6">
          {/* Error/Success Messages */}
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md flex items-center">
              <AlertCircle className="h-4 w-4 text-red-500 mr-2" />
              <span className="text-sm text-red-600">{error}</span>
            </div>
          )}

          {success && (
            <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-md flex items-center">
              <CheckCircle className="h-4 w-4 text-green-500 mr-2" />
              <span className="text-sm text-green-600">{success}</span>
            </div>
          )}

          {/* File Input (Hidden) */}
          <input
            ref={fileInputRef}
            type="file"
            accept="video/*"
            onChange={handleFileSelect}
            className="hidden"
          />

          {/* Video Preview or Upload Area */}
          <div className="mb-6">
            {previewUrl ? (
              <div className="relative bg-black rounded-lg overflow-hidden" style={{ aspectRatio: '16/9' }}>
                <video
                  ref={videoPreviewRef}
                  src={previewUrl}
                  className="w-full h-full object-cover"
                  controls
                  playsInline
                  onLoadedMetadata={() => {
                    if (videoPreviewRef.current) {
                      console.log('📹 Video metadata loaded:', {
                        duration: videoPreviewRef.current.duration,
                        videoWidth: videoPreviewRef.current.videoWidth,
                        videoHeight: videoPreviewRef.current.videoHeight
                      });
                    }
                  }}
                />
              </div>
            ) : (
              <div 
                className="relative bg-gray-100 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-gray-400 transition-colors"
                style={{ aspectRatio: '16/9' }}
                onClick={openFilePicker}
              >
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="text-center">
                    <FileVideo className="h-12 w-12 mx-auto mb-4 text-gray-400" />
                    <p className="text-lg font-medium text-gray-600 mb-2">
                      Select Video from Gallery
                    </p>
                    <p className="text-sm text-gray-500 mb-4">
                      Click to browse and select a video file
                    </p>
                    <div className="inline-flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors">
                      <Upload className="h-4 w-4" />
                      Upload from Gallery
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Upload Controls */}
          <div className="flex flex-wrap gap-3 justify-center">
            {!selectedFile ? (
              <button
                onClick={openFilePicker}
                className="flex items-center gap-2 bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors font-medium"
                style={{ minHeight: '48px', minWidth: '160px' }}
              >
                <Upload className="h-5 w-5" />
                Upload from Gallery
              </button>
            ) : (
              <>
                <button
                  onClick={saveVideo}
                  disabled={uploading}
                  className="flex items-center gap-2 bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{ minHeight: '48px', minWidth: '120px' }}
                >
                  {uploading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      Uploading...
                    </>
                  ) : (
                    <>
                      <CheckCircle className="h-5 w-5" />
                      Save Video
                    </>
                  )}
                </button>

                <button
                  onClick={downloadVideo}
                  className="flex items-center gap-2 bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors font-medium"
                  style={{ minHeight: '48px', minWidth: '120px' }}
                >
                  <Download className="h-5 w-5" />
                  Download
                </button>

                <button
                  onClick={openFilePicker}
                  className="flex items-center gap-2 bg-gray-600 text-white px-6 py-3 rounded-lg hover:bg-gray-700 transition-colors font-medium"
                  style={{ minHeight: '48px', minWidth: '140px' }}
                >
                  <Upload className="h-5 w-5" />
                  Choose Different
                </button>

                <button
                  onClick={resetState}
                  className="flex items-center gap-2 bg-red-600 text-white px-6 py-3 rounded-lg hover:bg-red-700 transition-colors font-medium"
                  style={{ minHeight: '48px', minWidth: '120px' }}
                >
                  <X className="h-5 w-5" />
                  Clear
                </button>
              </>
            )}
          </div>

          {/* Selected File Info */}
          {selectedFile && (
            <div className="mt-6 p-4 bg-gray-50 rounded-lg">
              <h3 className="text-lg font-medium text-gray-900 mb-3">Selected Video</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="font-medium text-gray-700">Filename:</span>
                  <p className="text-gray-600 break-all">{selectedFile.name}</p>
                </div>
                <div>
                  <span className="font-medium text-gray-700">File Size:</span>
                  <p className="text-gray-600">{formatFileSize(selectedFile.size)}</p>
                </div>
                <div>
                  <span className="font-medium text-gray-700">Type:</span>
                  <p className="text-gray-600">{selectedFile.type}</p>
                </div>
                <div>
                  <span className="font-medium text-gray-700">Duration:</span>
                  <p className="text-gray-600">
                    {videoPreviewRef.current?.duration 
                      ? formatDuration(videoPreviewRef.current.duration)
                      : 'Loading...'
                    }
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Mobile Instructions */}
          {deviceInfo.isMobile && (
            <div className="mt-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
              <h4 className="font-medium text-yellow-800 mb-2">📱 Mobile Upload Tips</h4>
              <ul className="text-sm text-yellow-700 space-y-1">
                <li>• You can select videos from your gallery or camera roll</li>
                <li>• Ensure stable internet connection for uploading</li>
                <li>• Keep the app open during upload process</li>
                <li>• Supported formats: MP4, MOV, AVI, WebM</li>
                <li>• Maximum file size: 100MB</li>
                {deviceInfo.isIOS && (
                  <li>• iOS: Videos will be automatically converted if needed</li>
                )}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default VideoContractModal;