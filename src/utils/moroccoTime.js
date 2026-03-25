/**
 * Morocco Timezone Utility
 * 
 * Provides centralized Morocco timezone handling for all date operations.
 * Uses "Africa/Casablanca" timezone.
 */

const MOROCCO_TIMEZONE = 'Africa/Casablanca';

/**
 * Helper to format a Date object into a 'YYYY-MM-DD' string.
 * This function respects the local date components and does not perform timezone conversion.
 * @param {Date} date - The date object to format.
 * @returns {string} The formatted date string.
 */
const formatDateToYYYYMMDD = (date) => {
  if (!date || !(date instanceof Date)) return '';
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  return `${year}-${month}-${day}`;
};

/**
 * Get today's date string in YYYY-MM-DD format (Morocco timezone)
 * @returns {string} Today's date in YYYY-MM-DD format
 */
export const getMoroccoTodayString = () => {
  const today = new Date();
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: MOROCCO_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  // This correctly returns 'YYYY-MM-DD' for the specified timezone.
  return formatter.format(today);
};

/**
 * Parses a 'YYYY-MM-DD' string into a Date object representing midnight
 * in the user's local timezone. This is crucial for avoiding off-by-one errors
 * with UI components like <input type="date">.
 * @param {string} dateString - Date string in YYYY-MM-DD format.
 * @returns {Date | null} A Date object or null if the string is invalid.
 */
export const parseDateAsLocal = (dateString) => {
  if (!dateString || !/^\d{4}-\d{2}-\d{2}$/.test(dateString)) return null;
  const [year, month, day] = dateString.split('-').map(Number);
  // Creates a Date object for midnight in the browser's local timezone.
  return new Date(year, month - 1, day);
};

// Alias for internal consistency.
const parseMoroccoDate = parseDateAsLocal;

/**
 * Get current date in Morocco timezone as a local Date object.
 * @returns {Date} Current date in Morocco timezone
 */
export const getMoroccoToday = () => {
  const dateString = getMoroccoTodayString();
  return parseMoroccoDate(dateString);
};

/**
 * Get tomorrow's date string in YYYY-MM-DD format (Morocco timezone)
 * @returns {string} Tomorrow's date in YYYY-MM-DD format
 */
export const getMoroccoTomorrowString = () => {
  const moroccoToday = getMoroccoToday();
  const tomorrow = new Date(moroccoToday);
  tomorrow.setDate(moroccoToday.getDate() + 1);
  return formatDateToYYYYMMDD(tomorrow);
};

/**
 * Get a date N days from a given date in Morocco timezone
 * @param {number} daysOffset - Number of days to add (can be negative)
 * @param {string} [baseDateStr] - The base date string in YYYY-MM-DD format. Defaults to today.
 * @returns {string} Date string in YYYY-MM-DD format
 */
export const getMoroccoDateOffset = (daysOffset, baseDateStr = null) => {
    const baseDate = baseDateStr ? parseMoroccoDate(baseDateStr) : getMoroccoToday();
    if (!baseDate) return '';
    const targetDate = new Date(baseDate);
    targetDate.setDate(targetDate.getDate() + daysOffset);
    return formatDateToYYYYMMDD(targetDate);
};

/**
 * Get an array of date strings for the next N days from today (Morocco timezone)
 * @param {number} days - Number of days to include
 * @returns {string[]} Array of date strings in YYYY-MM-DD format
 */
export const getMoroccoNextDays = (days = 7) => {
  const dates = [];
  for (let i = 0; i < days; i++) {
    dates.push(getMoroccoDateOffset(i));
  }
  return dates;
};

/**
 * Check if a date string represents today in Morocco timezone
 * @param {string} dateString - Date string in YYYY-MM-DD format
 * @returns {boolean} True if the date is today in Morocco
 */
export const isMoroccoToday = (dateString) => {
  return dateString === getMoroccoTodayString();
};

/**
 * Get the current week range in Morocco timezone
 * @returns {object} Object with start and end date strings
 */
export const getMoroccoWeekRange = () => {
  const today = getMoroccoToday();
  if (!today) return { start: '', end: '' };
  const startOfWeek = new Date(today);
  // Adjust to the beginning of the week (e.g., Sunday)
  startOfWeek.setDate(today.getDate() - today.getDay()); 
  
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 6); // End of the week (e.g., Saturday)
  
  return {
    start: formatDateToYYYYMMDD(startOfWeek),
    end: formatDateToYYYYMMDD(endOfWeek)
  };
};

/**
 * Get current Morocco time and calculate auto-populated times for hourly rentals
 * @returns {object} Object with startTime and endTime in HH:MM format
 */
export const getMoroccoHourlyTimes = () => {
  const now = new Date();
  
  const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: MOROCCO_TIMEZONE,
      hour: 'numeric', minute: 'numeric', hour12: false
  }).formatToParts(now);
  
  let hour = parseInt(parts.find(p => p.type === 'hour').value, 10);
  const minutes = parseInt(parts.find(p => p.type === 'minute').value, 10);

  const startTime = new Date();
  startTime.setHours(hour);
  startTime.setMinutes(minutes);

  const roundedMinutes = minutes < 30 ? 30 : 0;
  const hourOffset = minutes < 30 ? 0 : 1;
  
  startTime.setHours(startTime.getHours() + hourOffset);
  startTime.setMinutes(roundedMinutes);
  startTime.setSeconds(0);
  startTime.setMilliseconds(0);
  
  const endTime = new Date(startTime);
  endTime.setHours(startTime.getHours() + 1);
  
  const formatTime = (date) => date.toTimeString().slice(0, 5);
  
  return {
    startTime: formatTime(startTime),
    endTime: formatTime(endTime)
  };
};

/**
 * Get current Morocco time in HH:MM format
 * @returns {string} Current time in Morocco in HH:MM format
 */
export const getMoroccoCurrentTime = () => {
    const now = new Date();
    return new Intl.DateTimeFormat('en-GB', {
        timeZone: MOROCCO_TIMEZONE,
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    }).format(now);
};

/**
 * Checks if the first date is after the second date.
 * @param {Date} date1 - The first date.
 * @param {Date} date2 - The second date.
 * @returns {boolean} - True if date1 is after date2.
 */
export const isAfter = (date1, date2) => {
  if (!date1 || !date2) {
    return false;
  }
  return date1.getTime() > date2.getTime();
};

export { formatDateToYYYYMMDD };