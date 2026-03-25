import React, { useState, useRef, useEffect } from 'react';
import { Play, Pause, Volume2, VolumeX, Maximize, Loader2, AlertCircle } from 'lucide-react';

const MobileVideoPlayer = ({ videoUrl, className = '' }) => {
  const videoRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showControls, setShowControls] = useState(true);
  const controlsTimeoutRef = useRef(null);

  // Auto-hide controls after 3 seconds of inactivity
  const resetControlsTimeout = () => {
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }
    setShowControls(true);
    if (isPlaying) {
      controlsTimeoutRef.current = setTimeout(() => {
        setShowControls(false);
      }, 3000);
    }
  };

  useEffect(() => {
    return () => {
      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (isPlaying) {
      resetControlsTimeout();
    } else {
      setShowControls(true);
    }
  }, [isPlaying]);

  const handlePlayPause = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play().catch(err => {
          console.error('Play error:', err);
          setError('Failed to play video. Please try again.');
        });
      }
      setIsPlaying(!isPlaying);
    }
  };

  const handleMuteToggle = () => {
    if (videoRef.current) {
      videoRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
    }
  };

  const handleFullscreen = () => {
    if (videoRef.current) {
      if (videoRef.current.requestFullscreen) {
        videoRef.current.requestFullscreen();
      } else if (videoRef.current.webkitRequestFullscreen) {
        videoRef.current.webkitRequestFullscreen();
      } else if (videoRef.current.mozRequestFullScreen) {
        videoRef.current.mozRequestFullScreen();
      } else if (videoRef.current.msRequestFullscreen) {
        videoRef.current.msRequestFullscreen();
      }
    }
  };

  const handleTimeUpdate = () => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration);
      setIsLoading(false);
      setError(null);
    }
  };

  const handleSeek = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const pos = (e.clientX - rect.left) / rect.width;
    if (videoRef.current) {
      videoRef.current.currentTime = pos * duration;
    }
  };

  const handleVideoClick = () => {
    handlePlayPause();
    resetControlsTimeout();
  };

  const handleError = (e) => {
    console.error('Video error:', e);
    setIsLoading(false);
    setError('Failed to load video. Please check the video URL or try again later.');
  };

  const handleCanPlay = () => {
    setIsLoading(false);
    setError(null);
  };

  const handleWaiting = () => {
    setIsLoading(true);
  };

  const handlePlaying = () => {
    setIsLoading(false);
  };

  const formatTime = (time) => {
    if (isNaN(time)) return '0:00';
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  if (!videoUrl) {
    return (
      <div className="flex items-center justify-center w-full h-full bg-gray-900">
        <div className="text-center p-4">
          <AlertCircle className="w-12 h-12 sm:w-16 sm:h-16 text-gray-500 mx-auto mb-3" />
          <p className="text-gray-400 text-sm sm:text-base">No video URL provided</p>
        </div>
      </div>
    );
  }

  return (
    <div 
      className={`relative w-full h-full bg-black ${className}`}
      onMouseMove={resetControlsTimeout}
      onTouchStart={resetControlsTimeout}
    >
      {/* Video Element */}
      <video
        ref={videoRef}
        className="w-full h-full object-contain"
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onError={handleError}
        onCanPlay={handleCanPlay}
        onWaiting={handleWaiting}
        onPlaying={handlePlaying}
        onClick={handleVideoClick}
        playsInline
        preload="metadata"
        crossOrigin="anonymous"
      >
        <source src={videoUrl} type="video/mp4" />
        <source src={videoUrl} type="video/webm" />
        <source src={videoUrl} type="video/ogg" />
        <source src={videoUrl} type="video/quicktime" />
        Your browser does not support the video tag.
      </video>

      {/* Loading Spinner */}
      {isLoading && !error && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50">
          <Loader2 className="w-12 h-12 sm:w-16 sm:h-16 text-white animate-spin" />
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80 p-4">
          <div className="text-center max-w-md">
            <AlertCircle className="w-12 h-12 sm:w-16 sm:h-16 text-red-500 mx-auto mb-3" />
            <p className="text-white text-sm sm:text-base mb-4">{error}</p>
            <button
              onClick={() => {
                setError(null);
                setIsLoading(true);
                if (videoRef.current) {
                  videoRef.current.load();
                }
              }}
              className="px-4 py-2 sm:px-6 sm:py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm sm:text-base font-medium transition-colors touch-manipulation"
            >
              Retry
            </button>
          </div>
        </div>
      )}

      {/* Controls Overlay */}
      {!error && (
        <div 
          className={`absolute inset-0 transition-opacity duration-300 ${
            showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'
          }`}
        >
          {/* Top Gradient */}
          <div className="absolute top-0 left-0 right-0 h-20 bg-gradient-to-b from-black/70 to-transparent" />
          
          {/* Bottom Controls */}
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/70 to-transparent p-3 sm:p-4">
            {/* Progress Bar */}
            <div 
              className="w-full h-2 sm:h-1.5 bg-gray-600 rounded-full mb-3 sm:mb-4 cursor-pointer touch-manipulation"
              onClick={handleSeek}
            >
              <div 
                className="h-full bg-blue-600 rounded-full transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>

            {/* Control Buttons */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 sm:gap-3">
                {/* Play/Pause Button */}
                <button
                  onClick={handlePlayPause}
                  className="flex items-center justify-center w-11 h-11 sm:w-10 sm:h-10 rounded-full bg-white/20 hover:bg-white/30 text-white transition-colors touch-manipulation"
                  aria-label={isPlaying ? 'Pause' : 'Play'}
                >
                  {isPlaying ? (
                    <Pause className="w-5 h-5 sm:w-4 sm:h-4" fill="currentColor" />
                  ) : (
                    <Play className="w-5 h-5 sm:w-4 sm:h-4 ml-0.5" fill="currentColor" />
                  )}
                </button>

                {/* Mute Button */}
                <button
                  onClick={handleMuteToggle}
                  className="flex items-center justify-center w-11 h-11 sm:w-10 sm:h-10 rounded-full bg-white/20 hover:bg-white/30 text-white transition-colors touch-manipulation"
                  aria-label={isMuted ? 'Unmute' : 'Mute'}
                >
                  {isMuted ? (
                    <VolumeX className="w-5 h-5 sm:w-4 sm:h-4" />
                  ) : (
                    <Volume2 className="w-5 h-5 sm:w-4 sm:h-4" />
                  )}
                </button>

                {/* Time Display */}
                <span className="text-white text-xs sm:text-sm font-medium whitespace-nowrap">
                  {formatTime(currentTime)} / {formatTime(duration)}
                </span>
              </div>

              {/* Fullscreen Button */}
              <button
                onClick={handleFullscreen}
                className="flex items-center justify-center w-11 h-11 sm:w-10 sm:h-10 rounded-full bg-white/20 hover:bg-white/30 text-white transition-colors touch-manipulation"
                aria-label="Fullscreen"
              >
                <Maximize className="w-5 h-5 sm:w-4 sm:h-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MobileVideoPlayer;