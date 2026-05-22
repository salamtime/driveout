export const DEFAULT_DAILY_RETURN_POLICY = {
  dailyReturnFixedTime: '14:00',
  dailyLateReturnHourlyPenaltyMad: 200,
  dailyLateReturnFullDayThresholdHours: 4,
};

const DEFAULT_HOURLY_MIN_DURATION = 0.5;
const DEFAULT_DAILY_MIN_DURATION = 1;

const isValidTimeValue = (value = '') => /^\d{2}:\d{2}$/.test(String(value || '').trim());

const parseTimeValue = (value = DEFAULT_DAILY_RETURN_POLICY.dailyReturnFixedTime) => {
  const safeValue = isValidTimeValue(value) ? String(value) : DEFAULT_DAILY_RETURN_POLICY.dailyReturnFixedTime;
  const [hours, minutes] = safeValue.split(':').map(Number);
  return {
    hours: Number.isFinite(hours) ? hours : 14,
    minutes: Number.isFinite(minutes) ? minutes : 0,
  };
};

const normalizeDurationUnits = (durationUnits, rentalType) => {
  if (rentalType === 'hourly') {
    return Math.max(DEFAULT_HOURLY_MIN_DURATION, Number(durationUnits || DEFAULT_HOURLY_MIN_DURATION) || DEFAULT_HOURLY_MIN_DURATION);
  }

  if (rentalType === 'weekly') {
    return Math.max(DEFAULT_DAILY_MIN_DURATION, Math.round(Number(durationUnits || DEFAULT_DAILY_MIN_DURATION) || DEFAULT_DAILY_MIN_DURATION));
  }

  return Math.max(DEFAULT_DAILY_MIN_DURATION, Math.round(Number(durationUnits || DEFAULT_DAILY_MIN_DURATION) || DEFAULT_DAILY_MIN_DURATION));
};

export const normalizeDailyReturnPolicy = (settings = {}) => {
  const merged = { ...DEFAULT_DAILY_RETURN_POLICY, ...(settings || {}) };
  return {
    dailyReturnFixedTime: isValidTimeValue(merged.dailyReturnFixedTime)
      ? String(merged.dailyReturnFixedTime)
      : DEFAULT_DAILY_RETURN_POLICY.dailyReturnFixedTime,
    dailyLateReturnHourlyPenaltyMad: Math.max(
      0,
      Number(merged.dailyLateReturnHourlyPenaltyMad ?? DEFAULT_DAILY_RETURN_POLICY.dailyLateReturnHourlyPenaltyMad)
        || DEFAULT_DAILY_RETURN_POLICY.dailyLateReturnHourlyPenaltyMad
    ),
    dailyLateReturnFullDayThresholdHours: Math.max(
      1,
      Math.round(
        Number(
          merged.dailyLateReturnFullDayThresholdHours
            ?? DEFAULT_DAILY_RETURN_POLICY.dailyLateReturnFullDayThresholdHours
        ) || DEFAULT_DAILY_RETURN_POLICY.dailyLateReturnFullDayThresholdHours
      )
    ),
  };
};

export const applyDailyReturnTime = (date, settings = {}) => {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
  const policy = normalizeDailyReturnPolicy(settings);
  const { hours, minutes } = parseTimeValue(policy.dailyReturnFixedTime);
  const next = new Date(date);
  next.setHours(hours, minutes, 0, 0);
  return next;
};

export const isDailyRentalType = (value = '') =>
  String(value || '').trim().toLowerCase() === 'daily';

export const formatDailyReturnPolicyTime = (settings = {}, locale = 'en-US') => {
  const policy = normalizeDailyReturnPolicy(settings);
  const { hours, minutes } = parseTimeValue(policy.dailyReturnFixedTime);
  const previewDate = new Date(2000, 0, 1, hours, minutes, 0, 0);
  return new Intl.DateTimeFormat(locale, {
    hour: 'numeric',
    minute: '2-digit',
  }).format(previewDate);
};

export const addConfiguredRentalDuration = (startDate, durationUnits, rentalType, settings = {}) => {
  if (!(startDate instanceof Date) || Number.isNaN(startDate.getTime())) return null;
  const normalizedRentalType = String(rentalType || 'hourly').trim().toLowerCase();
  const safeDuration = normalizeDurationUnits(durationUnits, normalizedRentalType);
  const endDate = new Date(startDate);

  if (normalizedRentalType === 'hourly') {
    endDate.setMinutes(endDate.getMinutes() + safeDuration * 60);
    return endDate;
  }

  if (normalizedRentalType === 'daily') {
    endDate.setDate(endDate.getDate() + safeDuration);
    return applyDailyReturnTime(endDate, settings);
  }

  if (normalizedRentalType === 'weekly') {
    endDate.setDate(endDate.getDate() + safeDuration * 7);
    return endDate;
  }

  endDate.setDate(endDate.getDate() + safeDuration);
  return endDate;
};
