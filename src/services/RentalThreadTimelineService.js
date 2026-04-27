const normalizeText = (value) => String(value || '').trim();

const toDate = (value) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const toIso = (value) => {
  const date = toDate(value);
  return date ? date.toISOString() : null;
};

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const buildEventDescription = (parts = []) =>
  parts
    .map((part) => normalizeText(part))
    .filter(Boolean)
    .join(' • ');

const buildEventRow = ({
  id,
  rentalEventType,
  title,
  description = '',
  actorRole = 'system',
  createdAt = null,
  source = 'derived_rental_state',
  payload = {},
}) => ({
  id,
  event_type: rentalEventType,
  title: normalizeText(title) || 'Rental update',
  description: normalizeText(description),
  actor_role: normalizeText(actorRole).toLowerCase() || 'system',
  created_at: toIso(createdAt),
  payload: {
    rentalEventType,
    timelineType: rentalEventType,
    source,
    ...payload,
  },
});

const dedupeEvents = (events = []) => {
  const seen = new Set();
  return events.filter((event) => {
    const key = [
      normalizeText(event?.payload?.rentalEventType || event?.event_type),
      normalizeText(event?.created_at),
      normalizeText(event?.title),
    ].join('::');
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const sortEvents = (events = []) =>
  [...events].sort(
    (a, b) => new Date(a?.created_at || 0).getTime() - new Date(b?.created_at || 0).getTime()
  );

class RentalThreadTimelineService {
  static buildDerivedEvents(rental = {}) {
    if (!rental || typeof rental !== 'object') return [];

    const rentalId = normalizeText(rental.id || rental.rentalId || '');
    const status = normalizeText(rental.status).toLowerCase();
    const createdAt = rental.createdAt || rental.raw?.created_at || null;
    const startDate = rental.startDate || rental.raw?.rental_start_date || null;
    const startedAt = rental.startedAt || rental.raw?.started_at || null;
    const scheduledEndDate =
      rental.scheduledEndDate ||
      rental.rental_end_date ||
      rental.raw?.rental_end_date ||
      rental.endDate ||
      null;
    const actualReturnAt =
      rental.actualReturnAt ||
      rental.completedAt ||
      rental.completed_at ||
      rental.actual_end_date ||
      rental.raw?.actual_end_date ||
      null;
    const confirmedAt =
      rental.confirmedAt ||
      rental.raw?.confirmed_at ||
      rental.raw?.approved_at ||
      startDate ||
      null;
    const depositReturnedAt = rental.depositReturnedAt || rental.raw?.deposit_returned_at || null;
    const depositAmount = toNumber(rental.depositAmount);
    const paymentStatus = normalizeText(rental.paymentStatus).toLowerCase();
    const outstanding = toNumber(rental.outstanding);
    const approvedExtensions = Array.isArray(rental.approvedExtensions) ? rental.approvedExtensions : [];
    const allExtensions = Array.isArray(rental.extensions) ? rental.extensions : [];
    const pendingExtensions = allExtensions.filter((extension) =>
      ['pending', 'requested'].includes(normalizeText(extension?.status).toLowerCase())
    );
    const maintenanceCharge = toNumber(rental.maintenanceCustomerChargeTotal);
    const fuelCharge = toNumber(rental.fuelCharge);
    const hasConditionIssue = maintenanceCharge > 0 || fuelCharge > 0;
    const ownerExecution =
      rental.ownerExecution && typeof rental.ownerExecution === 'object'
        ? rental.ownerExecution
        : rental.owner_execution && typeof rental.owner_execution === 'object'
          ? rental.owner_execution
          : {};
    const handoffPhotos = Array.isArray(ownerExecution?.handoffPhotos) ? ownerExecution.handoffPhotos : [];
    const returnPhotos = Array.isArray(ownerExecution?.returnPhotos) ? ownerExecution.returnPhotos : [];

    const events = [];

    if (createdAt) {
      events.push(buildEventRow({
        id: `rental-created-${rentalId || 'unknown'}`,
        rentalEventType: 'created',
        title: 'Booking created',
        description: 'This rental was created and is now tracked in one journey thread.',
        actorRole: 'system',
        createdAt,
        payload: { rentalId },
      }));
    }

    if (['cancelled', 'canceled'].includes(status)) {
      events.push(buildEventRow({
        id: `rental-cancelled-${rentalId || 'unknown'}`,
        rentalEventType: 'cancelled',
        title: 'Rental canceled',
        description: 'This rental was canceled before the journey completed.',
        actorRole: 'system',
        createdAt: actualReturnAt || confirmedAt || createdAt,
        payload: { rentalId, status },
      }));
    }

    if (['confirmed', 'active', 'ready_to_finish', 'completed', 'closed'].includes(status)) {
      events.push(buildEventRow({
        id: `rental-confirmed-${rentalId || 'unknown'}`,
        rentalEventType: 'confirmed',
        title: 'Booking confirmed',
        description: buildEventDescription([
          'The rental is confirmed and ready to move through the lifecycle.',
          rental.startDate ? 'Pickup timing is now fixed.' : '',
        ]),
        actorRole: 'owner',
        createdAt: confirmedAt || createdAt,
        payload: { rentalId, status },
      }));
    }

    if (status === 'confirmed' && startDate) {
      events.push(buildEventRow({
        id: `rental-pickup-ready-${rentalId || 'unknown'}`,
        rentalEventType: 'pickup_ready',
        title: 'Pickup ready',
        description: 'The booking is confirmed and waiting for vehicle handoff.',
        actorRole: 'owner',
        createdAt: startDate,
        payload: { rentalId, pickupAt: toIso(startDate) },
      }));
    }

    if (depositAmount > 0 && ['platform', 'held'].includes(normalizeText(rental.depositMode).toLowerCase())) {
      events.push(buildEventRow({
        id: `rental-deposit-recorded-${rentalId || 'unknown'}`,
        rentalEventType: 'deposit_recorded',
        title: 'Deposit recorded',
        description: `A security deposit of ${depositAmount} MAD is recorded for this rental.`,
        actorRole: 'system',
        createdAt: confirmedAt || createdAt,
        payload: {
          rentalId,
          depositAmount,
          depositMode: rental.depositMode || 'platform',
        },
      }));
    }

    if (startedAt || ['active', 'ready_to_finish', 'completed', 'closed'].includes(status)) {
      events.push(buildEventRow({
        id: `rental-picked-up-${rentalId || 'unknown'}`,
        rentalEventType: 'picked_up',
        title: 'Vehicle picked up',
        description: buildEventDescription([
          'The rental has started and the vehicle is currently or was previously on rent.',
          handoffPhotos.length ? `${handoffPhotos.length} pickup photo${handoffPhotos.length > 1 ? 's were' : ' was'} recorded.` : '',
        ]),
        actorRole: 'customer',
        createdAt: startedAt || startDate || createdAt,
        payload: { rentalId, status },
      }));
    }

    pendingExtensions.forEach((extension, index) => {
      events.push(buildEventRow({
        id: `rental-extension-requested-${rentalId || 'unknown'}-${extension?.id || index}`,
        rentalEventType: 'extension_requested',
        title: 'Extension requested',
        description: buildEventDescription([
          'An extension request is waiting for review.',
          extension?.extension_value || extension?.extension_hours
            ? `Requested ${extension?.extension_value || extension?.extension_hours} more ${extension?.extension_type || 'hours'}.`
            : '',
        ]),
        actorRole: 'customer',
        createdAt: extension?.requested_at || extension?.created_at || extension?.updated_at || createdAt,
        payload: {
          rentalId,
          extensionId: extension?.id || null,
          extensionValue: extension?.extension_value || extension?.extension_hours || null,
        },
      }));
    });

    approvedExtensions.forEach((extension, index) => {
      events.push(buildEventRow({
        id: `rental-extension-approved-${rentalId || 'unknown'}-${extension?.id || index}`,
        rentalEventType: 'extension_approved',
        title: 'Extension approved',
        description: buildEventDescription([
          'Additional time was approved for this rental.',
          extension?.extension_price ? `Added ${toNumber(extension.extension_price)} MAD to the booking.` : '',
        ]),
        actorRole: 'owner',
        createdAt: extension?.approved_at || extension?.updated_at || createdAt,
        payload: {
          rentalId,
          extensionId: extension?.id || null,
          extensionValue: extension?.extension_value || extension?.extension_hours || null,
          extensionPrice: extension?.extension_price || null,
        },
      }));
    });

    if (['active', 'ready_to_finish'].includes(status) && scheduledEndDate && !actualReturnAt) {
      events.push(buildEventRow({
        id: `rental-return-due-${rentalId || 'unknown'}`,
        rentalEventType: 'return_due',
        title: 'Return due',
        description: 'The rental is active and approaching return/inspection.',
        actorRole: 'system',
        createdAt: scheduledEndDate,
        payload: { rentalId, dueAt: toIso(scheduledEndDate) },
      }));
    }

    if (['completed', 'closed'].includes(status) || actualReturnAt) {
      events.push(buildEventRow({
        id: `rental-returned-${rentalId || 'unknown'}`,
        rentalEventType: 'returned',
        title: 'Vehicle returned',
        description: hasConditionIssue
          ? buildEventDescription([
              'The vehicle was returned and follow-up charges or adjustments were recorded.',
              returnPhotos.length ? `${returnPhotos.length} return photo${returnPhotos.length > 1 ? 's were' : ' was'} saved.` : '',
            ])
          : buildEventDescription([
              'The vehicle was returned and the rental reached its return stage.',
              returnPhotos.length ? `${returnPhotos.length} return photo${returnPhotos.length > 1 ? 's were' : ' was'} saved.` : '',
            ]),
        actorRole: 'owner',
        createdAt: actualReturnAt,
        payload: { rentalId, hasConditionIssue },
      }));
    }

    if (hasConditionIssue) {
      events.push(buildEventRow({
        id: `rental-issue-reported-${rentalId || 'unknown'}`,
        rentalEventType: 'issue_reported',
        title: 'Issue recorded',
        description: buildEventDescription([
          maintenanceCharge > 0 ? `Maintenance charges reached ${maintenanceCharge} MAD.` : '',
          fuelCharge > 0 ? `Fuel adjustment reached ${fuelCharge} MAD.` : '',
        ]),
        actorRole: 'owner',
        createdAt: actualReturnAt || depositReturnedAt || createdAt,
        payload: {
          rentalId,
          maintenanceCharge,
          fuelCharge,
        },
      }));
    }

    if (depositReturnedAt) {
      events.push(buildEventRow({
        id: `rental-deposit-returned-${rentalId || 'unknown'}`,
        rentalEventType: 'deposit_returned',
        title: 'Deposit returned',
        description: buildEventDescription([
          rental.depositReturnAmount ? `Returned ${toNumber(rental.depositReturnAmount)} MAD to the renter.` : 'The rental deposit was returned.',
        ]),
        actorRole: 'system',
        createdAt: depositReturnedAt,
        payload: {
          rentalId,
          depositReturnAmount: toNumber(rental.depositReturnAmount),
        },
      }));
    }

    if (
      ['completed', 'closed'].includes(status) ||
      ((outstanding <= 0 || ['paid', 'completed', 'succeeded'].includes(paymentStatus)) &&
        (status === 'ready_to_finish' || status === 'active' || actualReturnAt))
    ) {
      events.push(buildEventRow({
        id: `rental-settled-${rentalId || 'unknown'}`,
        rentalEventType: 'settled',
        title: 'Rental settled',
        description:
          outstanding > 0
            ? 'The rental reached a closeout stage, but some balance remains.'
            : 'Final charges and closeout state are settled for this rental.',
        actorRole: 'system',
        createdAt: depositReturnedAt || actualReturnAt || createdAt,
        payload: {
          rentalId,
          outstanding,
          depositReturnedAt: toIso(depositReturnedAt),
        },
      }));
    }

    return sortEvents(dedupeEvents(events.filter((event) => event.created_at)));
  }

  static buildTimeline(rental = {}, threadEvents = []) {
    return this.mergeWithThreadEvents(threadEvents, rental);
  }

  static mergeWithThreadEvents(threadEvents = [], rental = {}) {
    const canonicalEvents = Array.isArray(threadEvents) ? threadEvents : [];
    const derivedEvents = this.buildDerivedEvents(rental);
    if (!derivedEvents.length) return canonicalEvents;
    if (!canonicalEvents.length) return derivedEvents;

    const derivedByType = new Map(
      derivedEvents.map((event) => [
        normalizeText(event?.payload?.rentalEventType || event?.event_type).toLowerCase(),
        event,
      ])
    );

    canonicalEvents.forEach((event) => {
      const payload = event?.payload && typeof event.payload === 'object' ? event.payload : {};
      const canonicalType = normalizeText(
        payload.rentalEventType || payload.timelineType || event?.event_type
      ).toLowerCase();
      if (!canonicalType) return;
      derivedByType.delete(canonicalType);
    });

    return sortEvents([...canonicalEvents, ...derivedByType.values()]);
  }
}

export default RentalThreadTimelineService;
