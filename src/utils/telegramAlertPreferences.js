export const TELEGRAM_ALERT_EVENT_KEYS = [
  'rental_created',
  'rental_started',
  'rental_vehicle_replaced',
  'rental_completed',
  'payment_received',
  'rental_overdue',
  'rental_cancelled',
  'deposit_returned',
];

export const buildDefaultTelegramEventTypes = (defaultValue = false) =>
  TELEGRAM_ALERT_EVENT_KEYS.reduce((acc, key) => {
    acc[key] = defaultValue === true;
    return acc;
  }, {});

export const normalizeTelegramEventTypes = (value, defaultValue = false) => {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const normalized = buildDefaultTelegramEventTypes(defaultValue);

  TELEGRAM_ALERT_EVENT_KEYS.forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(source, key)) {
      normalized[key] = source[key] === true;
    }
  });

  return normalized;
};

export const getTelegramAlertSettingsFromPreferences = (preferences) => {
  const source = preferences && typeof preferences === 'object' && !Array.isArray(preferences)
    ? preferences.telegram_alerts
    : null;

  const personalChatIds = Array.isArray(source?.personal_chat_ids)
    ? source.personal_chat_ids.map((value) => String(value || '').trim()).filter(Boolean)
    : String(source?.personal_chat_ids || '')
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean);

  return {
    allowed: Boolean(source?.allowed),
    allowed_event_types: normalizeTelegramEventTypes(source?.allowed_event_types, false),
    opt_in: Boolean(source?.opt_in),
    selected_event_types: normalizeTelegramEventTypes(source?.selected_event_types, false),
    personal_chat_ids: personalChatIds,
  };
};

export const applyTelegramAdminSettingsToPreferences = (preferences, settings) => {
  const basePreferences = preferences && typeof preferences === 'object' && !Array.isArray(preferences)
    ? preferences
    : {};
  const existing = getTelegramAlertSettingsFromPreferences(basePreferences);
  const allowed = Boolean(settings?.allowed);
  const allowedEventTypes = normalizeTelegramEventTypes(settings?.allowed_event_types, false);
  const selectedEventTypes = {};

  TELEGRAM_ALERT_EVENT_KEYS.forEach((key) => {
    selectedEventTypes[key] = allowedEventTypes[key] ? existing.selected_event_types[key] === true : false;
  });

  return {
    ...basePreferences,
    telegram_alerts: {
      ...((basePreferences.telegram_alerts && typeof basePreferences.telegram_alerts === 'object' && !Array.isArray(basePreferences.telegram_alerts))
        ? basePreferences.telegram_alerts
        : {}),
      allowed,
      allowed_event_types: allowedEventTypes,
      opt_in: allowed ? existing.opt_in : false,
      selected_event_types: selectedEventTypes,
      personal_chat_ids: existing.personal_chat_ids,
    },
  };
};

export const countEnabledTelegramAlertEvents = (eventTypes) =>
  TELEGRAM_ALERT_EVENT_KEYS.reduce((count, key) => count + (eventTypes?.[key] === true ? 1 : 0), 0);
