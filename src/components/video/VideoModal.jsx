import React from 'react';
import { X } from 'lucide-react';
import MobileVideoPlayer from './MobileVideoPlayer';

const VideoModal = ({ isOpen, onClose, videoUrl, title = 'Video' }) => {
  if (!isOpen) return null;

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div 
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/90 backdrop-blur-sm p-2 sm:p-4"
      onClick={handleBackdropClick}
    >
      {/* Modal Container - Mobile Optimized */}
      <div className="relative w-full h-full max-w-6xl max-h-[95vh] sm:max-h-[90vh] flex flex-col bg-gray-900 rounded-none sm:rounded-lg overflow-hidden shadow-2xl">
        
        {/* Header - Touch Optimized */}
        <div className="flex items-center justify-between p-3 sm:p-4 bg-gray-800 border-b border-gray-700 shrink-0">
          <h3 className="text-base sm:text-lg font-semibold text-white truncate pr-2">
            {title}
          </h3>
          <button
            onClick={onClose}
            className="flex items-center justify-center w-11 h-11 sm:w-10 sm:h-10 rounded-full bg-gray-700 hover:bg-gray-600 text-white transition-colors shrink-0 touch-manipulation"
            aria-label="Close video"
          >
            <X className="w-6 h-6 sm:w-5 sm:h-5" />
          </button>
        </div>

        {/* Video Container - Responsive */}
        <div className="flex-1 flex items-center justify-center bg-black overflow-hidden">
          <div className="w-full h-full flex items-center justify-center">
            {videoUrl ? (
              <MobileVideoPlayer 
                videoUrl={videoUrl} 
                className="w-full h-full"
              />
            ) : (
              <div className="text-center p-4">
                <p className="text-gray-400 text-sm sm:text-base">No video available</p>
              </div>
            )}
          </div>
        </div>

        {/* Footer - Optional Info */}
        <div className="p-2 sm:p-3 bg-gray-800 border-t border-gray-700 shrink-0">
          <p className="text-xs sm:text-sm text-gray-400 text-center">
            Tap outside or press the × button to close
          </p>
        </div>
      </div>
    </div>
  );
};

export default VideoModal;