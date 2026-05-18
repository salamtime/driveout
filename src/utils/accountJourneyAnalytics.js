const ACCOUNT_JOURNEY_EVENT_NAME = 'saharax:account-journey';
const ACCOUNT_JOURNEY_SESSION_PREFIX = 'saharax:account-journey';

export const ACCOUNT_JOURNEY_EVENTS = Object.freeze({
  homeViewed: 'account_home_viewed',
  nextActionClicked: 'account_home_next_action_clicked',
  trustCenterOpened: 'owner_trust_center_opened',
  draftSaved: 'owner_listing_draft_saved',
  reviewSubmitted: 'owner_listing_review_submitted',
  listingWentLive: 'owner_listing_went_live',
});

const normalizePayloadValue = (value) => {
  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value.map((item) => normalizePayloadValue(item));
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, nestedValue]) => nestedValue !== undefined)
        .map(([key, nestedValue]) => [key, normalizePayloadValue(nestedValue)])
    );
  }

  return value;
};

const buildSessionStorageKey = (eventName, onceKey = '') =>
  `${ACCOUNT_JOURNEY_SESSION_PREFIX}:${String(eventName || 'event').trim()}:${String(onceKey || 'default').trim()}`;

export const trackAccountJourneyEvent = (eventName, payload = {}) => {
  if (typeof window === 'undefined' || !eventName) {
    return null;
  }

  const detail = normalizePayloadValue({
    eventName: String(eventName).trim(),
    timestamp: new Date().toISOString(),
    pathname: window.location.pathname,
    search: window.location.search,
    ...payload,
  });

  window.__saharaxAccountJourneyEvents = Array.isArray(window.__saharaxAccountJourneyEvents)
    ? [...window.__saharaxAccountJourneyEvents, detail].slice(-100)
    : [detail];

  try {
    window.dispatchEvent(new CustomEvent(ACCOUNT_JOURNEY_EVENT_NAME, { detail }));
  } catch (error) {
    console.warn('Unable to dispatch account journey event:', error);
  }

  if (Array.isArray(window.dataLayer)) {
    window.dataLayer.push({
      event: 'account_journey',
      ...detail,
    });
  }

  if (import.meta.env.DEV) {
    console.info('🧭 Account journey event', detail);
  }

  return detail;
};

export const trackAccountJourneyEventOnce = (eventName, onceKey, payload = {}) => {
  if (typeof window === 'undefined' || !eventName) {
    return null;
  }

  const storageKey = buildSessionStorageKey(eventName, onceKey);
  try {
    if (window.sessionStorage.getItem(storageKey) === '1') {
      return null;
    }
    window.sessionStorage.setItem(storageKey, '1');
  } catch {
    // Best-effort dedupe only.
  }

  return trackAccountJourneyEvent(eventName, payload);
};

export const getAccountJourneyActionKind = (action = {}) => {
  const target = String(action?.to || action?.href || '').trim().toLowerCase();

  if (target === '/account/verification') {
    return 'open_trust_center';
  }

  if (target.includes('/account/vehicles/new/profile')) {
    return 'start_listing';
  }

  if (target.includes('/account/vehicles/')) {
    return 'continue_listing';
  }

  if (target === '/account/messages') {
    return 'open_inbox';
  }

  if (target === '/account/rentals') {
    return 'open_trips';
  }

  if (target === '/account/revenue') {
    return 'open_wallet';
  }

  if (target === '/account/vehicles') {
    return 'open_listings';
  }

  return 'navigate';
};

export const getAccountJourneyEventName = () => ACCOUNT_JOURNEY_EVENT_NAME;
