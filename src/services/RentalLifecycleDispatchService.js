import RentalEventService from './RentalEventService.js';
import { notifyRentalTelegramEvent } from './TelegramAlertService.js';

const normalizeEventType = (value) => String(value || '').trim().toLowerCase();
const safeText = (value) => String(value || '').trim();
const inFlightLifecycleDispatches = new Map();

export const buildRentalLifecycleDispatchKey = (eventType, rental = {}) => {
  const normalizedEventType = normalizeEventType(eventType);
  const rentalId = safeText(rental?.id);
  if (!normalizedEventType || !rentalId) return '';

  const parts = [normalizedEventType, rentalId];

  switch (normalizedEventType) {
    case 'rental_created':
    case 'rental_started':
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
