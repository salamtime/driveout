export const DEFAULT_RENTAL_TIMING_SETTINGS = {
  graceMinutes: 60,
  softLockMinutes: 45,
};

const WEBSITE_BOOKING_SOURCE_FIELDS = [
  'booking_source',
  'rental_source',
  'source',
  'channel',
  'origin',
  'created_via',
];

const WEBSITE_BOOKING_SOURCE_KEYWORDS = [
  'website',
  'web',
  'online',
  'customer',
  'self',
  'public',
];

const hasStaffCreatedRentalMetadata = (rental = {}) => {
  return Boolean(
    rental?.created_by ||
    rental?.created_by_name ||
    rental?.started_by ||
    rental?.started_by_name ||
    rental?.contract_signed_by ||
    rental?.contract_signed_by_name
  );
};

export const isWebsiteCustomerBooking = (rental = {}) => {
  const explicitWebsiteSource = WEBSITE_BOOKING_SOURCE_FIELDS.some((field) => {
    const value = rental?.[field];
    if (value === null || value === undefined) return false;
    const normalizedValue = String(value).trim().toLowerCase();
    return WEBSITE_BOOKING_SOURCE_KEYWORDS.some((keyword) => normalizedValue.includes(keyword));
  });

  if (explicitWebsiteSource) return true;
  if (hasStaffCreatedRentalMetadata(rental)) return false;
  return false;
};

export const shouldAutoExpireScheduledRental = (rental = {}) => {
  const scheduledStartRaw = rental?.rental_start_date;
  const createdAtRaw = rental?.created_at;

  if (scheduledStartRaw && createdAtRaw) {
    const scheduledStart = new Date(scheduledStartRaw);
    const createdAt = new Date(createdAtRaw);

    if (
      !Number.isNaN(scheduledStart.getTime()) &&
      !Number.isNaN(createdAt.getTime()) &&
      createdAt.getTime() > scheduledStart.getTime()
    ) {
      return false;
    }
  }

  return isWebsiteCustomerBooking(rental);
};

export const getScheduledRentalTimingState = (
  scheduledStartValue,
  timingSettings = DEFAULT_RENTAL_TIMING_SETTINGS,
  nowValue = new Date()
) => {
  const scheduledStart = new Date(scheduledStartValue || '');
  if (Number.isNaN(scheduledStart.getTime())) {
    return null;
  }

  const now = nowValue instanceof Date ? nowValue : new Date(nowValue);
  const graceMinutes = Number(timingSettings?.graceMinutes ?? DEFAULT_RENTAL_TIMING_SETTINGS.graceMinutes);
  const softLockMinutes = Number(timingSettings?.softLockMinutes ?? DEFAULT_RENTAL_TIMING_SETTINGS.softLockMinutes);
  const minutesLate = Math.floor((now.getTime() - scheduledStart.getTime()) / 60000);
  const expiredAt = new Date(scheduledStart.getTime() + graceMinutes * 60000);

  return {
    now,
    scheduledStart,
    expiredAt,
    graceMinutes,
    softLockMinutes,
    minutesLate,
    isExpired: minutesLate > graceMinutes,
    isSoftLocked: minutesLate >= softLockMinutes,
    startsInMinutes: minutesLate < 0 ? Math.abs(minutesLate) : 0,
    minutesPastGrace: minutesLate > graceMinutes ? minutesLate - graceMinutes : 0,
  };
};

export const deriveEffectiveRentalStatus = (rental, timingSettings = DEFAULT_RENTAL_TIMING_SETTINGS) => {
  const rawStatus = String(rental?.rental_status || rental?.status || '').toLowerCase();
  const websiteBookingStatus = String(rental?.website_booking_status || '').toLowerCase();
  const vehicleStatus = String(rental?.vehicle?.status || '').toLowerCase();
  const statusChangeReason = String(rental?.status_change_reason || '').toLowerCase();

  const hasHistoricalImpoundStatus = Boolean(
    rawStatus === 'impounded' ||
    rental?.is_impounded ||
    rental?.impounded_at ||
    rental?.released_from_impound_at ||
    vehicleStatus === 'impounded'
  );

  if (hasHistoricalImpoundStatus) {
    return 'impounded';
  }

  if (websiteBookingStatus === 'expired') {
    return 'expired';
  }

  if (websiteBookingStatus === 'cancelled') {
    return 'cancelled';
  }

  if (['completed', 'cancelled', 'expired'].includes(rawStatus) || rental?.completed_at) {
    return rawStatus === 'cancelled' || rawStatus === 'expired' ? rawStatus : 'completed';
  }

  if (rental?.started_at || rental?.actual_start_date) {
    return 'active';
  }

  if (rawStatus === 'scheduled' || rawStatus === 'reserved' || rawStatus === 'confirmed' || !rawStatus) {
    const timingState = getScheduledRentalTimingState(rental?.rental_start_date, timingSettings, new Date());
    if (timingState?.isExpired) {
      if (statusChangeReason === 'customer_arrived') {
        return 'scheduled';
      }
      return shouldAutoExpireScheduledRental(rental) ? 'expired' : 'no_show_review';
    }
  }

  if (rawStatus === 'confirmed') {
    return 'confirmed';
  }

  return rawStatus || 'scheduled';
};

export const normalizeRentalLifecycle = (rental, timingSettings = DEFAULT_RENTAL_TIMING_SETTINGS) => {
  if (!rental) return rental;

  const effectiveStatus = deriveEffectiveRentalStatus(rental, timingSettings);

  return {
    ...rental,
    rental_status: effectiveStatus,
    status: effectiveStatus,
  };
};
