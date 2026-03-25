import React, { useState, useEffect } from 'react';
import audioNotificationSystem from '../../utils/audioNotifications';

const AudioNotificationSettings = ({ isOpen, onClose }) => {
  const [isEnabled, setIsEnabled] = useState(audioNotificationSystem.isNotificationEnabled());
  const [volume, setVolume] = useState(audioNotificationSystem.getVolume());
  const [notificationPermission, setNotificationPermission] = useState(
    typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'default'
  );

  useEffect(() => {
    // Update notification permission status
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setNotificationPermission(Notification.permission);
    }
  }, []);

  const handleToggleEnabled = () => {
    const newEnabled = !isEnabled;
    setIsEnabled(newEnabled);
    audioNotificationSystem.setEnabled(newEnabled);
  };

  const handleVolumeChange = (e) => {
    const newVolume = parseFloat(e.target.value);
    setVolume(newVolume);
    audioNotificationSystem.setVolume(newVolume);
  };

  const handleTestSound = () => {
    audioNotificationSystem.testSound();
  };

  const handleRequestPermission = async () => {
    const granted = await audioNotificationSystem.requestNotificationPermission();
    setNotificationPermission(granted ? 'granted' : 'denied');
  };

  if (!isOpen) return null;

  return (
    <div className="audio-settings-overlay">
      <div className="audio-settings-modal">
        <div className="audio-settings-header">
          <h2>🔔 Audio Notification Settings</h2>
          <button 
            className="audio-settings-close"
            onClick={onClose}
            aria-label="Close settings"
          >
            ✕
          </button>
        </div>

        <div className="audio-settings-content">
          {/* Enable/Disable Toggle */}
          <div className="audio-setting-item">
            <div className="audio-setting-label">
              <span>🔊 Enable Audio Alerts</span>
              <p className="audio-setting-description">
                Play sound notifications at tour milestones (15, 30, 45, 60, 90, 120 minutes)
              </p>
            </div>
            <label className="audio-toggle-switch">
              <input
                type="checkbox"
                checked={isEnabled}
                onChange={handleToggleEnabled}
              />
              <span className="audio-toggle-slider"></span>
            </label>
          </div>

          {/* Volume Control */}
          <div className="audio-setting-item">
            <div className="audio-setting-label">
              <span>🎚️ Volume Level</span>
              <p className="audio-setting-description">
                Adjust the volume of milestone notifications
              </p>
            </div>
            <div className="audio-volume-control">
              <input
                type="range"
                min="0"
                max="1"
                step="0.1"
                value={volume}
                onChange={handleVolumeChange}
                disabled={!isEnabled}
                className="audio-volume-slider"
              />
              <span className="audio-volume-display">
                {Math.round(volume * 100)}%
              </span>
            </div>
          </div>

          {/* Test Sound */}
          <div className="audio-setting-item">
            <div className="audio-setting-label">
              <span>🎵 Test Sound</span>
              <p className="audio-setting-description">
                Play a sample notification sound
              </p>
            </div>
            <button
              className="audio-test-button"
              onClick={handleTestSound}
              disabled={!isEnabled}
            >
              Play Test Sound
            </button>
          </div>

          {/* Browser Notifications */}
          <div className="audio-setting-item">
            <div className="audio-setting-label">
              <span>🔔 Browser Notifications</span>
              <p className="audio-setting-description">
                Show visual notifications alongside audio alerts
              </p>
            </div>
            <div className="audio-notification-status">
              {notificationPermission === 'granted' && (
                <span className="audio-permission-granted">✅ Enabled</span>
              )}
              {notificationPermission === 'denied' && (
                <span className="audio-permission-denied">❌ Denied</span>
              )}
              {notificationPermission === 'default' && (
                <button
                  className="audio-permission-request"
                  onClick={handleRequestPermission}
                >
                  Enable Notifications
                </button>
              )}
            </div>
          </div>

          {/* Milestone Information */}
          <div className="audio-milestone-info">
            <h3>📊 Notification Milestones</h3>
            <div className="audio-milestone-list">
              <div className="audio-milestone-item">
                <span className="milestone-time">15 min</span>
                <span className="milestone-sound">🔔 Single beep</span>
              </div>
              <div className="audio-milestone-item">
                <span className="milestone-time">30 min</span>
                <span className="milestone-sound">🔔🔔 Double beep</span>
              </div>
              <div className="audio-milestone-item">
                <span className="milestone-time">45 min</span>
                <span className="milestone-sound">🎵 Triangle wave</span>
              </div>
              <div className="audio-milestone-item">
                <span className="milestone-time">60 min</span>
                <span className="milestone-sound">🔔🔔🔔 Triple beep</span>
              </div>
              <div className="audio-milestone-item">
                <span className="milestone-time">90 min</span>
                <span className="milestone-sound">🎵🎵 Double triangle</span>
              </div>
              <div className="audio-milestone-item">
                <span className="milestone-time">120 min</span>
                <span className="milestone-sound">🔊🔊🔊🔊 Quad beep</span>
              </div>
            </div>
          </div>
        </div>

        <div className="audio-settings-footer">
          <button className="audio-settings-save" onClick={onClose}>
            Save Settings
          </button>
        </div>
      </div>

      <style jsx>{`
        .audio-settings-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.7);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 10000;
          padding: 20px;
        }

        .audio-settings-modal {
          background: white;
          border-radius: 16px;
          box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
          max-width: 600px;
          width: 100%;
          max-height: 90vh;
          overflow-y: auto;
        }

        .audio-settings-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 24px 28px;
          border-bottom: 1px solid #e0e0e0;
        }

        .audio-settings-header h2 {
          margin: 0;
          font-size: 24px;
          font-weight: 600;
          color: #333;
        }

        .audio-settings-close {
          background: none;
          border: none;
          font-size: 24px;
          cursor: pointer;
          color: #666;
          padding: 4px 8px;
          border-radius: 4px;
        }

        .audio-settings-close:hover {
          background: #f0f0f0;
        }

        .audio-settings-content {
          padding: 28px;
          space-y: 24px;
        }

        .audio-setting-item {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 32px;
          gap: 20px;
        }

        .audio-setting-label {
          flex: 1;
        }

        .audio-setting-label span {
          font-size: 18px;
          font-weight: 500;
          color: #333;
          display: block;
          margin-bottom: 4px;
        }

        .audio-setting-description {
          font-size: 14px;
          color: #666;
          margin: 0;
          line-height: 1.4;
        }

        .audio-toggle-switch {
          position: relative;
          display: inline-block;
          width: 60px;
          height: 34px;
        }

        .audio-toggle-switch input {
          opacity: 0;
          width: 0;
          height: 0;
        }

        .audio-toggle-slider {
          position: absolute;
          cursor: pointer;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background-color: #ccc;
          transition: .4s;
          border-radius: 34px;
        }

        .audio-toggle-slider:before {
          position: absolute;
          content: "";
          height: 26px;
          width: 26px;
          left: 4px;
          bottom: 4px;
          background-color: white;
          transition: .4s;
          border-radius: 50%;
        }

        input:checked + .audio-toggle-slider {
          background-color: #4CAF50;
        }

        input:checked + .audio-toggle-slider:before {
          transform: translateX(26px);
        }

        .audio-volume-control {
          display: flex;
          align-items: center;
          gap: 12px;
          min-width: 150px;
        }

        .audio-volume-slider {
          flex: 1;
          height: 6px;
          border-radius: 3px;
          background: #ddd;
          outline: none;
          cursor: pointer;
        }

        .audio-volume-slider::-webkit-slider-thumb {
          appearance: none;
          width: 20px;
          height: 20px;
          border-radius: 50%;
          background: #4CAF50;
          cursor: pointer;
        }

        .audio-volume-slider:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .audio-volume-display {
          font-weight: 500;
          color: #333;
          min-width: 40px;
        }

        .audio-test-button {
          background: #2196F3;
          color: white;
          border: none;
          padding: 10px 20px;
          border-radius: 8px;
          font-size: 16px;
          cursor: pointer;
          font-weight: 500;
        }

        .audio-test-button:disabled {
          background: #ccc;
          cursor: not-allowed;
        }

        .audio-test-button:hover:not(:disabled) {
          background: #1976D2;
        }

        .audio-notification-status {
          display: flex;
          align-items: center;
        }

        .audio-permission-granted {
          color: #4CAF50;
          font-weight: 500;
        }

        .audio-permission-denied {
          color: #f44336;
          font-weight: 500;
        }

        .audio-permission-request {
          background: #FF9800;
          color: white;
          border: none;
          padding: 8px 16px;
          border-radius: 6px;
          cursor: pointer;
          font-weight: 500;
        }

        .audio-permission-request:hover {
          background: #F57C00;
        }

        .audio-milestone-info {
          margin-top: 32px;
          padding-top: 24px;
          border-top: 1px solid #e0e0e0;
        }

        .audio-milestone-info h3 {
          margin: 0 0 16px 0;
          font-size: 20px;
          color: #333;
        }

        .audio-milestone-list {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
          gap: 12px;
        }

        .audio-milestone-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 12px 16px;
          background: #f8f9fa;
          border-radius: 8px;
          border-left: 4px solid #4CAF50;
        }

        .milestone-time {
          font-weight: 600;
          color: #333;
        }

        .milestone-sound {
          font-size: 14px;
          color: #666;
        }

        .audio-settings-footer {
          padding: 20px 28px;
          border-top: 1px solid #e0e0e0;
          display: flex;
          justify-content: flex-end;
        }

        .audio-settings-save {
          background: #4CAF50;
          color: white;
          border: none;
          padding: 12px 24px;
          border-radius: 8px;
          font-size: 16px;
          font-weight: 500;
          cursor: pointer;
        }

        .audio-settings-save:hover {
          background: #45a049;
        }

        @media (max-width: 768px) {
          .audio-settings-modal {
            margin: 10px;
            max-height: 95vh;
          }
          
          .audio-setting-item {
            flex-direction: column;
            align-items: flex-start;
            gap: 12px;
          }
          
          .audio-milestone-list {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
};

export default AudioNotificationSettings;