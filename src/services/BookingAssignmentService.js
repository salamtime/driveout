import { supabase } from '../lib/supabase';
import WebsiteBookingLifecycleService from './WebsiteBookingLifecycleService';

const DEFAULT_BUFFER_MINUTES = 60;
const DEFAULT_SCHEDULED_GRACE_MINUTES = 120;
const toDate = (value, fallbackTime = '00:00') => {
  if (!value) return null;
  const source = String(value);
  if (source.includes('T')) {
    const parsed = new Date(source);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  const parsed = new Date(`${source}T${fallbackTime}:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const normalizeMinutes = (value, fallback) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.round(parsed));
};

const isExpiredScheduledConflict = (
  rentalLike,
  graceMinutes = DEFAULT_SCHEDULED_GRACE_MINUTES
) => {
  if (String(rentalLike?.rental_status || '').toLowerCase() !== 'scheduled' || !rentalLike?.rental_start_date) {
    return false;
  }

  const scheduledStart = new Date(rentalLike.rental_start_date);
  if (Number.isNaN(scheduledStart.getTime())) return false;
  return Date.now() > scheduledStart.getTime() + normalizeMinutes(graceMinutes, DEFAULT_SCHEDULED_GRACE_MINUTES) * 60 * 1000;
};

const applyBufferWindow = (start, end, bufferMinutes) => ({
  start: new Date(start.getTime() - bufferMinutes * 60 * 1000),
  end: new Date(end.getTime() + bufferMinutes * 60 * 1000),
});

const windowsOverlap = (leftStart, leftEnd, rightStart, rightEnd) =>
  leftStart < rightEnd && leftEnd > rightStart;

class BookingAssignmentService {
  static async getFleetCandidates(anchorListing) {
    const anchorVehicle = anchorListing?.raw || {};
    const anchorModelId = String(
      anchorVehicle?.vehicle_model_id || anchorVehicle?.vehicle_model?.id || ''
    );
    const anchorCategory = String(anchorListing?.category || anchorVehicle?.vehicle_type || '').toLowerCase();
    const anchorModel = String(anchorListing?.model || anchorVehicle?.model || '').toLowerCase();

    const { data, error } = await supabase
      .from('saharax_0u4w4d_vehicles')
      .select(`
        id,
        name,
        model,
        vehicle_type,
        status,
        current_odometer,
        vehicle_model_id
      `)
      .in('status', ['available', 'scheduled'])
      .order('current_odometer', { ascending: true, nullsFirst: true });

    if (error) {
      throw error;
    }

    const vehicles = data || [];
    const sameModelCandidates = vehicles.filter((vehicle) => {
      const vehicleModelId = String(vehicle?.vehicle_model_id || '');
      if (anchorModelId && vehicleModelId) {
        return vehicleModelId === anchorModelId;
      }

      const vehicleCategory = String(vehicle?.vehicle_type || '').toLowerCase();
      const vehicleModel = String(vehicle?.model || '').toLowerCase();
      return vehicleCategory === anchorCategory && vehicleModel === anchorModel;
    });

    return sameModelCandidates.length > 0 ? sameModelCandidates : vehicles.filter((vehicle) => {
      const vehicleCategory = String(vehicle?.vehicle_type || '').toLowerCase();
      return !anchorCategory || vehicleCategory === anchorCategory;
    });
  }

  static async getBlockingRentals(vehicleIds, excludeRentalId = null) {
    if (!vehicleIds.length) return [];

    await WebsiteBookingLifecycleService.cleanupExpiredWebsiteBookingLocks().catch(() => {});

    let query = supabase
      .from('app_4c3a7a6153_rentals')
      .select('id, vehicle_id, rental_start_date, rental_end_date, rental_status, customer_name, booking_source, website_booking_status, is_vehicle_locked, hold_expires_at')
      .in('vehicle_id', vehicleIds)
      .not('rental_status', 'in', '(cancelled,completed,expired,void)');

    if (excludeRentalId) {
      query = query.neq('id', excludeRentalId);
    }

    const { data, error } = await query;
    if (error) {
      throw error;
    }

    return (data || []).filter((conflict) => {
      if (String(conflict?.booking_source || '').toLowerCase() === 'website') {
        return WebsiteBookingLifecycleService.shouldRentalBlockInventory(conflict, new Date());
      }

      return !isExpiredScheduledConflict(conflict, DEFAULT_SCHEDULED_GRACE_MINUTES) &&
        WebsiteBookingLifecycleService.shouldRentalBlockInventory(conflict, new Date());
    });
  }

  static async chooseBestVehicle({
    anchorListing,
    requestedStart,
    requestedEnd,
    excludeRentalId = null,
    bufferMinutes = DEFAULT_BUFFER_MINUTES,
  }) {
    const requestStart = toDate(requestedStart);
    const requestEnd = toDate(requestedEnd);

    if (!requestStart || !requestEnd) {
      throw new Error('Invalid booking window for assignment.');
    }

    const normalizedBuffer = normalizeMinutes(bufferMinutes, DEFAULT_BUFFER_MINUTES);
    const candidates = await this.getFleetCandidates(anchorListing);
    if (candidates.length === 0) {
      return {
        assignedVehicle: null,
        alternatives: [],
        conflicts: [],
        reason: 'No eligible vehicles available.',
      };
    }

    const blockingRentals = await this.getBlockingRentals(
      candidates.map((vehicle) => vehicle.id),
      excludeRentalId
    );

    const eligible = [];
    const rejected = [];

    candidates.forEach((candidate) => {
      const candidateConflicts = blockingRentals.filter(
        (rental) => String(rental.vehicle_id) === String(candidate.id)
      );

      const isBlocked = candidateConflicts.some((conflict) => {
        const conflictStart = toDate(conflict.rental_start_date);
        const conflictEnd = toDate(conflict.rental_end_date, '23:59');
        if (!conflictStart || !conflictEnd) return false;

        const bufferedConflict = applyBufferWindow(conflictStart, conflictEnd, normalizedBuffer);
        return windowsOverlap(requestStart, requestEnd, bufferedConflict.start, bufferedConflict.end);
      });

      if (isBlocked) {
        rejected.push({
          vehicle: candidate,
          conflicts: candidateConflicts,
        });
        return;
      }

      eligible.push(candidate);
    });

    eligible.sort((left, right) => {
      const leftOdometer = Number(left.current_odometer || 0);
      const rightOdometer = Number(right.current_odometer || 0);
      if (leftOdometer !== rightOdometer) return leftOdometer - rightOdometer;
      return Number(left.id || 0) - Number(right.id || 0);
    });

    return {
      assignedVehicle: eligible[0] || null,
      alternatives: eligible.slice(1),
      conflicts: rejected,
      reason: eligible[0] ? null : 'All matching vehicles are protected by other bookings.',
      bufferMinutes: normalizedBuffer,
    };
  }

  static async canExtendRental({
    vehicleId,
    currentRentalId,
    proposedEndDate,
    bufferMinutes = DEFAULT_BUFFER_MINUTES,
  }) {
    const proposedEnd = toDate(proposedEndDate, '23:59');
    if (!vehicleId || !currentRentalId || !proposedEnd) {
      return { canExtend: false, reason: 'Missing extension context.' };
    }

    const conflicts = await this.getBlockingRentals([vehicleId], currentRentalId);
    const normalizedBuffer = normalizeMinutes(bufferMinutes, DEFAULT_BUFFER_MINUTES);

    const futureConflict = conflicts.find((conflict) => {
      const conflictStart = toDate(conflict.rental_start_date);
      if (!conflictStart) return false;
      return proposedEnd.getTime() + normalizedBuffer * 60 * 1000 > conflictStart.getTime();
    });

    return {
      canExtend: !futureConflict,
      nextConflict: futureConflict || null,
      reason: futureConflict ? 'Vehicle already reserved after this booking.' : null,
    };
  }
}

export default BookingAssignmentService;
