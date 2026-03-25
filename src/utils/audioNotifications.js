// Audio Notifications System for Tour Milestones
class AudioNotificationSystem {
  constructor() {
    this.isEnabled = localStorage.getItem('audioNotificationsEnabled') !== 'false';
    this.volume = parseFloat(localStorage.getItem('audioNotificationVolume') || '0.7');
    this.playedNotifications = new Set();
    this.audioContext = null;
    this.initializeAudioContext();
  }

  initializeAudioContext() {
    if (typeof window !== 'undefined' && window.AudioContext) {
      try {
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      } catch (error) {
        console.warn('AudioContext not supported:', error);
      }
    }
  }

  // Generate different beep sounds for different milestones
  generateBeepSound(frequency = 800, duration = 0.3, type = 'sine') {
    if (!this.audioContext) return null;

    const oscillator = this.audioContext.createOscillator();
    const gainNode = this.audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(this.audioContext.destination);

    oscillator.frequency.value = frequency;
    oscillator.type = type;

    gainNode.gain.setValueAtTime(0, this.audioContext.currentTime);
    gainNode.gain.linearRampToValueAtTime(this.volume, this.audioContext.currentTime + 0.01);
    gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + duration);

    oscillator.start(this.audioContext.currentTime);
    oscillator.stop(this.audioContext.currentTime + duration);

    return oscillator;
  }

  // Play milestone-specific sounds
  playMilestoneSound(minutes) {
    if (!this.isEnabled || !this.audioContext) return;

    // Resume audio context if suspended (required by some browsers)
    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume();
    }

    let frequency, beepCount, beepType;

    switch (minutes) {
      case 15:
        frequency = 600;
        beepCount = 1;
        beepType = 'sine';
        break;
      case 30:
        frequency = 800;
        beepCount = 2;
        beepType = 'sine';
        break;
      case 45:
        frequency = 700;
        beepCount = 1;
        beepType = 'triangle';
        break;
      case 60:
        frequency = 1000;
        beepCount = 3;
        beepType = 'sine';
        break;
      case 90:
        frequency = 900;
        beepCount = 2;
        beepType = 'triangle';
        break;
      case 120:
        frequency = 1200;
        beepCount = 4;
        beepType = 'square';
        break;
      default:
        frequency = 800;
        beepCount = 1;
        beepType = 'sine';
    }

    // Play multiple beeps for certain milestones
    for (let i = 0; i < beepCount; i++) {
      setTimeout(() => {
        this.generateBeepSound(frequency, 0.2, beepType);
      }, i * 300);
    }
  }

  // Check if notification should be played for a timer
  checkAndPlayNotification(bookingId, elapsedMinutes) {
    const milestones = [15, 30, 45, 60, 90, 120];
    const notificationKey = `${bookingId}_${elapsedMinutes}`;

    // Check if we've already played this notification
    if (this.playedNotifications.has(notificationKey)) {
      return;
    }

    // Check if elapsed time matches a milestone
    if (milestones.includes(elapsedMinutes)) {
      this.playMilestoneSound(elapsedMinutes);
      this.playedNotifications.add(notificationKey);
      
      // Show visual notification as well
      this.showVisualNotification(elapsedMinutes);
      
      console.log(`🔔 Tour milestone reached: ${elapsedMinutes} minutes`);
    }
  }

  // Show visual notification
  showVisualNotification(minutes) {
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification('Tour Milestone Reached!', {
        body: `Tour has been running for ${minutes} minutes`,
        icon: '/favicon.ico',
        badge: '/favicon.ico'
      });
    }

    // Create toast notification
    this.createToastNotification(minutes);
  }

  // Create toast notification
  createToastNotification(minutes) {
    const toast = document.createElement('div');
    toast.className = 'milestone-toast';
    toast.innerHTML = `
      <div class="milestone-toast-content">
        <div class="milestone-icon">🔔</div>
        <div class="milestone-text">
          <strong>Tour Milestone!</strong><br>
          ${minutes} minutes elapsed
        </div>
      </div>
    `;

    // Add styles
    Object.assign(toast.style, {
      position: 'fixed',
      top: '20px',
      right: '20px',
      backgroundColor: '#4CAF50',
      color: 'white',
      padding: '16px 20px',
      borderRadius: '8px',
      boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
      zIndex: '9999',
      animation: 'slideInRight 0.3s ease-out',
      fontSize: '14px',
      maxWidth: '300px'
    });

    document.body.appendChild(toast);

    // Remove toast after 4 seconds
    setTimeout(() => {
      toast.style.animation = 'slideOutRight 0.3s ease-in';
      setTimeout(() => {
        if (toast.parentNode) {
          toast.parentNode.removeChild(toast);
        }
      }, 300);
    }, 4000);
  }

  // Reset notifications for a booking (when tour ends)
  resetNotifications(bookingId) {
    const keysToRemove = Array.from(this.playedNotifications).filter(key => 
      key.startsWith(`${bookingId}_`)
    );
    keysToRemove.forEach(key => this.playedNotifications.delete(key));
  }

  // Settings methods
  setEnabled(enabled) {
    this.isEnabled = enabled;
    localStorage.setItem('audioNotificationsEnabled', enabled.toString());
  }

  setVolume(volume) {
    this.volume = Math.max(0, Math.min(1, volume));
    localStorage.setItem('audioNotificationVolume', this.volume.toString());
  }

  isNotificationEnabled() {
    return this.isEnabled;
  }

  getVolume() {
    return this.volume;
  }

  // Request notification permission
  async requestNotificationPermission() {
    if ('Notification' in window && Notification.permission === 'default') {
      try {
        const permission = await Notification.requestPermission();
        return permission === 'granted';
      } catch (error) {
        console.warn('Could not request notification permission:', error);
        return false;
      }
    }
    return Notification.permission === 'granted';
  }

  // Test sound
  testSound() {
    this.playMilestoneSound(30); // Play 30-minute milestone sound as test
  }
}

// Create singleton instance
const audioNotificationSystem = new AudioNotificationSystem();

// Add CSS animations
const style = document.createElement('style');
style.textContent = `
  @keyframes slideInRight {
    from {
      transform: translateX(100%);
      opacity: 0;
    }
    to {
      transform: translateX(0);
      opacity: 1;
    }
  }

  @keyframes slideOutRight {
    from {
      transform: translateX(0);
      opacity: 1;
    }
    to {
      transform: translateX(100%);
      opacity: 0;
    }
  }

  .milestone-toast-content {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .milestone-icon {
    font-size: 24px;
  }

  .milestone-text {
    flex: 1;
    line-height: 1.4;
  }
`;
document.head.appendChild(style);

export default audioNotificationSystem;