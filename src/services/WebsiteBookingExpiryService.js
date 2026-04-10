import WebsiteBookingLifecycleService from './WebsiteBookingLifecycleService';

const LAST_AUTOMATIC_WEBSITE_BOOKING_EXPIRY_KEY = 'saharax:website-bookings:last-auto-expiry-at';
const DEFAULT_INTERVAL_MS = 5 * 60 * 1000;

class WebsiteBookingExpiryService {
  static shouldRun(intervalMs = DEFAULT_INTERVAL_MS) {
    if (typeof window === 'undefined') return true;

    const lastRun = Number(window.localStorage.getItem(LAST_AUTOMATIC_WEBSITE_BOOKING_EXPIRY_KEY) || 0);
    return !lastRun || Date.now() - lastRun >= intervalMs;
  }

  static markRun(now = Date.now()) {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(LAST_AUTOMATIC_WEBSITE_BOOKING_EXPIRY_KEY, String(now));
  }

  static async maybeRunAutomaticCleanup(role) {
    if (!['owner', 'admin', 'employee'].includes(String(role || '').toLowerCase())) {
      return { ran: false, reason: 'role_not_allowed' };
    }

    if (!this.shouldRun()) {
      return { ran: false, reason: 'cooldown' };
    }

    const result = await WebsiteBookingLifecycleService.cleanupExpiredWebsiteBookingLocks();
    this.markRun();
    return {
      ran: true,
      updated: result?.updated || 0,
      ids: result?.ids || [],
    };
  }
}

export default WebsiteBookingExpiryService;
