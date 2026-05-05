import RentalEventService from './RentalEventService.js';
import { notifyRentalTelegramEvent } from './TelegramAlertService.js';

const normalizeEventType = (value) => String(value || '').trim().toLowerCase();
const safeText = (value) => String(value || '').trim();
const inFlightLifecycleDispatches = new Map();

const resolveDistanceValue = (rental = {}) => {
  const directDistance =
    rental?.total_kilometers_driven ??
    rental?.total_distance ??
    rental?.totalDistance ??
    rental?.distance_km;
  const numericDirectDistance = Number(directDistance);
  if (Number.isFinite(numericDirectDistance) && numericDirectDistance > 0) {
    return numericDirectDistance;
  }

  const startOdometer = Number(rental?.start_odometer ?? rental?.startOdometer ?? rental?.odometer_start);
  const endOdometer = Number(rental?.ending_odometer ?? rental?.end_odometer ?? rental?.endOdometer ?? rental?.odometer_end);
  if (Number.isFinite(startOdometer) && Number.isFinite(endOdometer) && endOdometer >= startOdometer) {
    return endOdometer - startOdometer;
  }

  return 0;
};

export const buildRentalLifecycleDispatchKey = (eventType, rental = {}) => {
  const normalizedEventType = normalizeEventType(eventType);
  const rentalId = safeText(rental?.id);
  if (!normalizedEventType || !rentalId) return '';

  const parts = [normalizedEventType, rentalId];

  switch (normalizedEventType) {
    case 'rental_created':
    case 'rental_started':
    case 'rental_vehicle_replaced':
    case 'rental_completed':
    case 'rental_cancelled':
    case 'rental_overdue':
      parts.push(
        safeText(rental?.reference || rental?.rental_reference),
        safeText(rental?.start),
        safeText(rental?.end),
        safeText(rental?.total),
        safeText(rental?.amountPaid),
        safeText(rental?.remaining),
        safeText(rental?.old_vehicle_id || rental?.oldVehicle || rental?.old_vehicle_name),
        safeText(rental?.new_vehicle_id || rental?.newVehicle || rental?.new_vehicle_name),
        safeText(rental?.replacementReason || rental?.replacement_reason || rental?.replacement_reason_label),
        safeText(resolveDistanceValue(rental)),
      );
      break;
    case 'payment_received':
      parts.push(
        safeText(rental?.paymentReceivedNow),
        safeText(rental?.remaining),
        safeText(rental?.companyDiscount),
      );
      break;
    case 'deposit_returned':
      parts.push(
        safeText(rental?.depositReturnedAmount),
        safeText(rental?.depositDeductionAmount),
        safeText(rental?.remaining),
      );
      break;
    default:
      parts.push(JSON.stringify(rental || {}));
      break;
  }

  return parts.join('|');
};

export async function dispatchRentalLifecycleTelegramEvent({
  eventType,
  rental,
  actor = 'admin',
  eventMetadata = {},
  createdAt = null,
  throwOnError = false,
} = {}) {
  const normalizedEventType = normalizeEventType(eventType);
  const rentalId = safeText(rental?.id);
  if (!normalizedEventType || !rentalId) return null;

  const dispatchKey = buildRentalLifecycleDispatchKey(normalizedEventType, rental);
  if (dispatchKey && inFlightLifecycleDispatches.has(dispatchKey)) {
    return inFlightLifecycleDispatches.get(dispatchKey);
  }

  const dispatchPromise = (async () => {
  const eventRecord = await RentalEventService.recordEvent({
    rentalId,
    eventType: normalizedEventType,
    actor,
    metadata: {
      ...eventMetadata,
      channels: ['telegram'],
    },
    createdAt,
    dispatchKey,
  });

  if (eventRecord?.duplicate) {
    return {
      skipped: true,
      reason: 'duplicate_dispatch',
      dispatchKey,
      event: eventRecord,
    };
  }

  return notifyRentalTelegramEvent(normalizedEventType, rental, { throwOnError });
  })();

  if (dispatchKey) {
    inFlightLifecycleDispatches.set(dispatchKey, dispatchPromise);
  }

  try {
    return await dispatchPromise;
  } finally {
    if (dispatchKey) {
      inFlightLifecycleDispatches.delete(dispatchKey);
    }
  }
}

export default {
  buildRentalLifecycleDispatchKey,
  dispatchRentalLifecycleTelegramEvent,
};
