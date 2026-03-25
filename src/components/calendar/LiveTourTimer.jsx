import React, { useState, useEffect } from 'react';
import { Clock, Play, Square, Volume2, VolumeX } from 'lucide-react';
import audioNotificationSystem from '../../utils/audioNotifications';

const LiveTourTimer = ({ booking, isActive, startTime, onTimerUpdate }) => {
  const [elapsed, setElapsed] = useState(0);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [lastNotifiedMinute, setLastNotifiedMinute] = useState(0);
  const [isAudioEnabled, setIsAudioEnabled] = useState(audioNotificationSystem.isNotificationEnabled());

  useEffect(() => {
    let interval = null;
    
    if (isActive && startTime) {
      interval = setInterval(() => {
        const now = new Date();
        const start = new Date(startTime);
        const elapsedMs = now - start;
        const elapsedSeconds = Math.floor(elapsedMs / 1000);
        const elapsedMinutes = Math.floor(elapsedSeconds / 60);
        
        setElapsed(elapsedSeconds);
        setCurrentTime(now);
        
        // Check for milestone notifications
        if (elapsedMinutes > lastNotifiedMinute) {
          audioNotificationSystem.checkAndPlayNotification(booking.id, elapsedMinutes);
          setLastNotifiedMinute(elapsedMinutes);
        }
        
        // Update parent component with current duration
        if (onTimerUpdate) {
          onTimerUpdate(elapsedSeconds);
        }
      }, 1000);
    } else {
      setElapsed(0);
      setLastNotifiedMinute(0);
      // Reset notifications when timer stops
      if (booking?.id) {
        audioNotificationSystem.resetNotifications(booking.id);
      }
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isActive, startTime, onTimerUpdate, booking.id, lastNotifiedMinute]);

  // Update audio enabled state when system settings change
  useEffect(() => {
    const checkAudioEnabled = () => {
      setIsAudioEnabled(audioNotificationSystem.isNotificationEnabled());
    };
    
    // Check periodically for settings changes
    const settingsInterval = setInterval(checkAudioEnabled, 1000);
    
    return () => clearInterval(settingsInterval);
  }, []);

  const formatTime = (seconds) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const formatDuration = (seconds) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  };

  const getNextMilestone = (currentMinutes) => {
    const milestones = [15, 30, 45, 60, 90, 120];
    return milestones.find(milestone => milestone > currentMinutes) || null;
  };

  const getMilestoneProgress = (currentMinutes) => {
    const nextMilestone = getNextMilestone(currentMinutes);
    if (!nextMilestone) return null;
    
    const prevMilestone = currentMinutes < 15 ? 0 : 
      [15, 30, 45, 60, 90].reverse().find(m => m <= currentMinutes) || 0;
    
    const progress = ((currentMinutes - prevMilestone) / (nextMilestone - prevMilestone)) * 100;
    const minutesLeft = nextMilestone - currentMinutes;
    
    return { nextMilestone, progress, minutesLeft };
  };

  if (!isActive) {
    return null;
  }

  const currentMinutes = Math.floor(elapsed / 60);
  const milestoneInfo = getMilestoneProgress(currentMinutes);

  return (
    <div className="bg-gradient-to-r from-green-500 to-green-600 text-white rounded-2xl p-6 mb-4 shadow-lg border-2 border-green-400">
      {/* Timer Header */}
      <div className="flex items-center justify-center mb-4">
        <div className="bg-white bg-opacity-20 rounded-full p-3 mr-4">
          <Play className="h-8 w-8 text-white" />
        </div>
        <div className="text-center flex-1">
          <h3 className="text-2xl font-black mb-1">
            🚀 TOUR IN PROGRESS
          </h3>
          <p className="text-lg font-bold opacity-90">
            {booking.tourName}
          </p>
        </div>
        {/* Audio Status Indicator */}
        <div className="bg-white bg-opacity-20 rounded-full p-2 ml-4">
          {isAudioEnabled ? (
            <Volume2 className="h-6 w-6 text-white" title="Audio notifications enabled" />
          ) : (
            <VolumeX className="h-6 w-6 text-white opacity-50" title="Audio notifications disabled" />
          )}
        </div>
      </div>

      {/* Giant Timer Display */}
      <div className="bg-white bg-opacity-10 rounded-3xl p-8 text-center mb-4">
        <div className="flex items-center justify-center mb-2">
          <Clock className="h-10 w-10 mr-3" />
          <span className="text-lg font-bold opacity-90">LIVE TIMER</span>
        </div>
        <div className="text-6xl font-black font-mono tracking-wider mb-2">
          {formatTime(elapsed)}
        </div>
        <div className="text-xl font-bold opacity-90">
          Duration: {formatDuration(elapsed)}
        </div>

        {/* Milestone Progress */}
        {milestoneInfo && (
          <div className="mt-4 bg-white bg-opacity-10 rounded-xl p-4">
            <div className="text-sm font-bold opacity-80 mb-2">
              NEXT MILESTONE: {milestoneInfo.nextMilestone} MIN
            </div>
            <div className="w-full bg-white bg-opacity-20 rounded-full h-3 mb-2">
              <div 
                className="bg-yellow-300 h-3 rounded-full transition-all duration-1000"
                style={{ width: `${Math.min(milestoneInfo.progress, 100)}%` }}
              ></div>
            </div>
            <div className="text-sm font-bold">
              {milestoneInfo.minutesLeft} minute{milestoneInfo.minutesLeft !== 1 ? 's' : ''} to next alert
            </div>
          </div>
        )}
      </div>

      {/* Tour Info */}
      <div className="grid grid-cols-2 gap-4 text-center mb-4">
        <div className="bg-white bg-opacity-10 rounded-xl p-3">
          <div className="text-sm font-bold opacity-80 mb-1">CUSTOMER</div>
          <div className="text-lg font-black">
            {booking.participants?.[0]?.name || 'Guest'}
          </div>
        </div>
        <div className="bg-white bg-opacity-10 rounded-xl p-3">
          <div className="text-sm font-bold opacity-80 mb-1">STARTED</div>
          <div className="text-lg font-black">
            {new Date(startTime).toLocaleTimeString('en-US', { 
              hour: '2-digit', 
              minute: '2-digit' 
            })}
          </div>
        </div>
      </div>

      {/* Milestone Alerts Info */}
      {isAudioEnabled && (
        <div className="bg-white bg-opacity-10 rounded-xl p-4 mb-4">
          <div className="text-center">
            <div className="text-sm font-bold opacity-80 mb-2">🔔 AUDIO ALERTS ACTIVE</div>
            <div className="text-xs opacity-70 leading-relaxed">
              Sound notifications at: 15min • 30min • 45min • 60min • 90min • 120min
            </div>
          </div>
        </div>
      )}

      {/* Pulsing Status Indicator */}
      <div className="flex items-center justify-center">
        <div className="flex items-center bg-white bg-opacity-20 rounded-full px-4 py-2">
          <div className="w-3 h-3 bg-red-400 rounded-full mr-2 animate-pulse"></div>
          <span className="text-sm font-bold">LIVE • RECORDING TIME</span>
          {isAudioEnabled && (
            <>
              <div className="w-1 h-1 bg-white rounded-full mx-2"></div>
              <div className="flex items-center">
                <Volume2 className="h-3 w-3 mr-1" />
                <span className="text-xs">ALERTS ON</span>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default LiveTourTimer;