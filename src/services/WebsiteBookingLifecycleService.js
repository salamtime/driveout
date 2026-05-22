import { supabase } from '../lib/supabase';

export const WEBSITE_BOOKING_SOURCE = 'website';
export const STAFF_BOOKING_SOURCES = ['staff', 'admin'];
export const WEBSITE_BLOCKING_STATUSES = ['verified', 'awaiting_payment', 'payment_submitted', 'confirmed'];
export const WEBSITE_ACTIVE_DEDUPE_STATUSES = ['pending', 'verified', 'awaiting_payment', 'payment_submitted', 'confirmed'];
export const REAL_BLOCKING_RENTAL_STATUSES = ['scheduled', 'confirmed', 'active', 'in_progress', 'checked_out'];

const toDate = (value) => {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const addMinutes = (date, minutes) => new Date(date.getTime() + minutes * 60 * 1000);
const addHours = (date, hours) => new Date(date.getTime() + hours * 60 * 60 * 1000);

class WebsiteBookingLifecycleService {
  static async reconcileVehicleOperationalStatus(vehicleId, {
    excludeRentalIds = [],
    nowValue = new Date(),
  } = {}) {
    if (!vehicleId) return null;

    let query = supabase
      .from('app_4c3a7a6153_rentals')
      .select('id, rental_status, booking_source, website_booking_status, is_vehicle_locked, hold_expires_at')
      .eq('vehicle_id', vehicleId)
      .not('rental_status', 'in', '(cancelled,completed,expired,void)');

    if (excludeRentalIds.length > 0) {
      query = query.not('id', 'in', `(${excludeRentalIds.join(',')})`);
    }

    const { data: relatedRentals, error } = await query;
    if (error) throw error;

    const now = nowValue instanceof Date ? nowValue : new Date(nowValue);
    const activeRentals = (relatedRentals || []).filter((rental) => {
      const status = String(rental?.rental_status || '').toLowerCase();
      return ['active', 'in_progress', 'checked_out', 'confirmed'].includes(status);
    });

    let nextVehicleStatus = 'available';

    if (activeRentals.length > 0) {
      nextVehicleStatus = 'rented';
    } else {
      const blockingFutureRentals = (relatedRentals || []).filter((rental) =>
        this.shouldRentalBlockInventory(rental, now)
      );

      if (blockingFutureRentals.length > 0) {
        nextVehicleStatus = 'scheduled';
      }
    }

    const { error: updateError } = await supabase
      .from('saharax_0u4w4d_vehicles')
      .update({ status: nextVehicleStatus })
      .eq('id', vehicleId);

    if (updateError) throw updateError;
    return nextVehicleStatus;
  }

  static normalizePhone(value = '') {
    return String(value || '').replace(/[^\d]/g, '');
  }

  static windowsOverlap(leftStart, leftEnd, rightStart, rightEnd) {
    if (!leftStart || !leftEnd || !rightStart || !rightEnd) return false;
    return leftStart < rightEnd && leftEnd > rightStart;
  }

  static isWebsiteBooking(rental = {}) {
    return String(rental?.booking_source || '').trim().toLowerCase() === WEBSITE_BOOKING_SOURCE;
  }

  static isActiveWebsiteStatus(status) {
    return WEBSITE_ACTIVE_DEDUPE_STATUSES.includes(String(status || '').trim().toLowerCase());
  }

  static hasActiveHold(rental = {}, nowValue = new Date()) {
    const now = nowValue instanceof Date ? nowValue : new Date(nowValue);
    if (!rental?.is_vehicle_locked) return false;

    const holdExpiresAt = toDate(rental?.hold_expires_at);
    if (!holdExpiresAt) return true;

    return holdExpiresAt.getTime() > now.getTime();
  }

  static shouldWebsiteBookingBlockInventory(rental = {}, nowValue = new Date()) {
    if (!this.isWebsiteBooking(rental)) return false;

    const status = String(rental?.website_booking_status || '').trim().toLowerCase();
    if (!WEBSITE_BLOCKING_STATUSES.includes(status)) return false;

    return this.hasActiveHold(rental, nowValue);
  }

  static shouldRentalBlockInventory(rental = {}, nowValue = new Date()) {
    const rentalStatus = String(rental?.rental_status || rental?.status || '').trim().toLowerCase();

    if (this.isWebsiteBooking(rental)) {
      return this.shouldWebsiteBookingBlockInventory(rental, nowValue);
    }

    return REAL_BLOCKING_RENTAL_STATUSES.includes(rentalStatus);
  }

  static getWebsiteLockConfig({
    bookingSecurityOption,
    websiteBookingStatus,
    startIso,
    nowValue = new Date(),
  }) {
    const now = nowValue instanceof Date ? nowValue : new Date(nowValue);
    const requestedStart = toDate(startIso);
    const option = String(bookingSecurityOption || '').trim().toLowerCase();
    const normalizedStatus = String(websiteBookingStatus || '').trim().toLowerCase();

    if (option === 'scan_hold' || normalizedStatus === 'verified') {
      return {
        websiteBookingStatus: 'verified',
        isVehicleLocked: true,
        holdStrength: 'soft',
        holdExpiresAt: addMinutes(now, 30).toISOString(),
        statusChangeReason: 'Website license verification hold',
      };
    }

    if (option === 'deposit') {
      return {
        websiteBookingStatus: 'awaiting_payment',
        isVehicleLocked: true,
        holdStrength: 'strong',
        holdExpiresAt: addHours(now, 4).toISOString(),
        statusChangeReason: 'Website bank deposit hold',
      };
    }

    if (option === 'full') {
      const twelveHoursFromNow = addHours(now, 12);
      const holdUntil =
        requestedStart && requestedStart.getTime() < twelveHoursFromNow.getTime()
          ? requestedStart
          : twelveHoursFromNow;

      return {
        websiteBookingStatus: 'awaiting_payment',
        isVehicleLocked: true,
        holdStrength: 'strong',
        holdExpiresAt: holdUntil.toISOString(),
        statusChangeReason: 'Website full-payment hold',
      };
    }

    if (normalizedStatus === 'payment_submitted') {
      return {
        websiteBookingStatus: 'payment_submitted',
        isVehicleLocked: true,
        holdStrength: 'strong',
        holdExpiresAt: null,
        statusChangeReason: 'Website payment proof submitted',
      };
    }

    if (normalizedStatus === 'confirmed') {
      return {
        websiteBookingStatus: 'confirmed',
        isVehicleLocked: true,
        holdStrength: 'strong',
        holdExpiresAt: null,
        statusChangeReason: 'Website booking confirmed by staff',
      };
    }

    return {
      websiteBookingStatus: 'pending',
      isVehicleLocked: false,
      holdStrength: 'none',
      holdExpiresAt: null,
      statusChangeReason: 'Website booking created without security hold',
    };
  }

  static buildWebsiteBookingUpdate({
    bookingSecurityOption,
    websiteBookingStatus,
    startIso,
    actorName = 'website',
    nowValue = new Date(),
  }) {
    const lifecycle = this.getWebsiteLockConfig({
      bookingSecurityOption,
      websiteBookingStatus,
      startIso,
      nowValue,
    });

    return {
      website_booking_status: lifecycle.websiteBookingStatus,
      is_vehicle_locked: lifecycle.isVehicleLocked,
      hold_strength: lifecycle.holdStrength,
      hold_expires_at: lifecycle.holdExpiresAt,
      status_changed_at: new Date(nowValue).toISOString(),
      status_changed_by: actorName,
      status_change_reason: lifecycle.statusChangeReason,
    };
  }

  static async cleanupExpiredWebsiteBookingLocks(nowValue = new Date()) {
    const nowIso = new Date(nowValue).toISOString();

    const { data: expiredRows, error: fetchError } = await supabase
      .from('app_4c3a7a6153_rentals')
      .select('id, vehicle_id, rental_status, status, started_at, rental_started_at, completed_at, rental_completed_at, website_booking_status, is_vehicle_locked, hold_expires_at')
      .eq('booking_source', WEBSITE_BOOKING_SOURCE)
      .eq('is_vehicle_locked', true)
      .in('website_booking_status', ['verified', 'awaiting_payment', 'payment_submitted'])
      .not('hold_expires_at', 'is', null)
      .lt('hold_expires_at', nowIso);

    if (fetchError) throw fetchError;
    if (!expiredRows?.length) return { updated: 0 };

    const expirableRows = expiredRows.filter((row) => {
      const status = String(row.rental_status || row.status || '').toLowerCase();
      const isTerminalOrActive = ['active', 'in_progress', 'checked_out', 'completed', 'cancelled', 'expired', 'void'].includes(status);
      return (
        !isTerminalOrActive &&
        !row.started_at &&
        !row.rental_started_at &&
        !row.completed_at &&
        !row.rental_completed_at
      );
    });

    if (!expirableRows.length) return { updated: 0 };

    const ids = expirableRows.map((row) => row.id).filter(Boolean);
    const { error: updateError } = await supabase
      .from('app_4c3a7a6153_rentals')
      .update({
        rental_status: 'expired',
        website_booking_status: 'expired',
        is_vehicle_locked: false,
        hold_strength: 'none',
        status_changed_at: nowIso,
        status_changed_by: 'system',
        status_change_reason: 'Website hold expired automatically',
      })
      .in('id', ids);

    if (updateError) throw updateError;

    const vehicleIds = [...new Set(expirableRows.map((row) => row.vehicle_id).filter(Boolean))];
    await Promise.all(
      vehicleIds.map((vehicleId) =>
        this.reconcileVehicleOperationalStatus(vehicleId, {
          excludeRentalIds: ids,
          nowValue,
        }).catch((error) => {
          console.warn('⚠️ Failed to reconcile vehicle status after website expiry:', vehicleId, error);
          return null;
        })
      )
    );

    return { updated: ids.length, ids };
  }
}

export default WebsiteBookingLifecycleService;
