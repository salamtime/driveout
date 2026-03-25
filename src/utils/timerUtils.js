// Timer persistence utilities
const TIMER_STORAGE_KEY = 'tourTimers';

export const saveTimerToStorage = (bookingId, startTime) => {
  try {
    const timers = getTimersFromStorage();
    timers[bookingId] = {
      startTime: startTime,
      bookingId: bookingId,
      savedAt: new Date().toISOString()
    };
    localStorage.setItem(TIMER_STORAGE_KEY, JSON.stringify(timers));
  } catch (error) {
    console.error('Failed to save timer to storage:', error);
  }
};

export const getTimersFromStorage = () => {
  try {
    const stored = localStorage.getItem(TIMER_STORAGE_KEY);
    return stored ? JSON.parse(stored) : {};
  } catch (error) {
    console.error('Failed to get timers from storage:', error);
    return {};
  }
};

export const removeTimerFromStorage = (bookingId) => {
  try {
    const timers = getTimersFromStorage();
    delete timers[bookingId];
    localStorage.setItem(TIMER_STORAGE_KEY, JSON.stringify(timers));
  } catch (error) {
    console.error('Failed to remove timer from storage:', error);
  }
};

export const isTimerActive = (bookingId) => {
  const timers = getTimersFromStorage();
  return timers[bookingId] !== undefined;
};

export const getTimerStartTime = (bookingId) => {
  const timers = getTimersFromStorage();
  return timers[bookingId]?.startTime || null;
};

export const calculateElapsedTime = (startTime) => {
  if (!startTime) return 0;
  const now = new Date();
  const start = new Date(startTime);
  return Math.floor((now - start) / 1000);
};

export const formatDuration = (seconds) => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  } else if (minutes > 0) {
    return `${minutes}m`;
  }
  return `${seconds}s`;
};