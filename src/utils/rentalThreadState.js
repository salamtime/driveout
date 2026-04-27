const normalizeText = (value) => String(value || '').trim();

const toDate = (value) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const coalesceFirst = (...values) => {
  for (const value of values) {
    if (value === null || value === undefined) continue;
    if (typeof value === 'string' && !value.trim()) continue;
    return value;
  }
  return null;
};

const getTranslator = (isFrench = false, tr) =>
  typeof tr === 'function' ? tr : (en, fr) => (isFrench ? fr : en);

const getRentalEventType = (event = {}) =>
  normalizeText(
    event?.payload?.rentalEventType ||
      event?.payload?.timelineType ||
      event?.event_type
  ).toLowerCase();

const STAGE_META = {
  created: {
    badgeClassName: 'bg-sky-50 text-sky-700',
    statusTone: 'pending',
    label: { en: 'Upcoming', fr: 'À venir' },
    nextAction: {
      en: 'Pickup details and confirmation will keep updating here.',
      fr: 'Les détails de départ et la confirmation continueront à se mettre à jour ici.',
    },
    summary: {
      en: 'This rental was created and is waiting to move into confirmation and pickup.',
      fr: 'Cette location a été créée et attend de passer à la confirmation puis au départ.',
    },
  },
  confirmed: {
    badgeClassName: 'bg-violet-50 text-violet-700',
    statusTone: 'neutral',
    label: { en: 'Confirmed', fr: 'Confirmée' },
    nextAction: {
      en: 'The next step is coordinating pickup and handoff.',
      fr: 'La prochaine étape consiste à coordonner le départ et la remise.',
    },
    summary: {
      en: 'The rental is confirmed and ready for its pickup phase.',
      fr: 'La location est confirmée et prête pour sa phase de départ.',
    },
  },
  pickup_ready: {
    badgeClassName: 'bg-amber-50 text-amber-700',
    statusTone: 'neutral',
    label: { en: 'Ready for pickup', fr: 'Prête au départ' },
    nextAction: {
      en: 'The vehicle is ready for pickup and handoff coordination.',
      fr: 'Le véhicule est prêt pour le départ et la coordination de remise.',
    },
    summary: {
      en: 'Pickup can happen as soon as renter and owner align on the handoff.',
      fr: 'Le départ peut avoir lieu dès que le locataire et le propriétaire s’accordent sur la remise.',
    },
  },
  active: {
    badgeClassName: 'bg-emerald-50 text-emerald-700',
    statusTone: 'success',
    label: { en: 'Active', fr: 'Active' },
    nextAction: {
      en: 'The rental is live. Track return timing and any issues from this thread.',
      fr: 'La location est en cours. Suivez ici le retour et les éventuels incidents.',
    },
    summary: {
      en: 'The vehicle is currently on rent or was already handed off.',
      fr: 'Le véhicule est actuellement en location ou a déjà été remis.',
    },
  },
  return_due: {
    badgeClassName: 'bg-amber-50 text-amber-700',
    statusTone: 'warning',
    label: { en: 'Ready to return', fr: 'Prête au retour' },
    nextAction: {
      en: 'Return inspection and final closeout are the next important steps.',
      fr: 'L’inspection de retour et la clôture finale sont les prochaines étapes importantes.',
    },
    summary: {
      en: 'The rental is approaching return and inspection.',
      fr: 'La location approche de son retour et de son inspection.',
    },
  },
  returned: {
    badgeClassName: 'bg-slate-100 text-slate-700',
    statusTone: 'neutral',
    label: { en: 'Returned', fr: 'Retournée' },
    nextAction: {
      en: 'Closeout, adjustments, and settlement details should be reviewed next.',
      fr: 'Les ajustements et la clôture doivent maintenant être revus.',
    },
    summary: {
      en: 'The vehicle was returned and the rental is in closeout.',
      fr: 'Le véhicule a été restitué et la location est en clôture.',
    },
  },
  settled: {
    badgeClassName: 'bg-slate-100 text-slate-700',
    statusTone: 'success',
    label: { en: 'Completed', fr: 'Terminée' },
    nextAction: {
      en: 'This rental is fully settled and no further action is usually needed.',
      fr: 'Cette location est entièrement réglée et ne demande généralement plus d’action.',
    },
    summary: {
      en: 'Final charges and closeout are settled for this rental.',
      fr: 'Les frais finaux et la clôture sont réglés pour cette location.',
    },
  },
  cancelled: {
    badgeClassName: 'bg-rose-50 text-rose-700',
    statusTone: 'warning',
    label: { en: 'Canceled', fr: 'Annulée' },
    nextAction: {
      en: 'This rental was canceled, so no operational follow-up is expected.',
      fr: 'Cette location a été annulée, donc aucun suivi opérationnel n’est attendu.',
    },
    summary: {
      en: 'The rental was canceled before completion.',
      fr: 'La location a été annulée avant son achèvement.',
    },
  },
};

const FALLBACK_STAGE = 'created';

const getStageMeta = (stage) => STAGE_META[stage] || STAGE_META[FALLBACK_STAGE];

const mapEventTypeToStage = (eventType) => {
  if (eventType === 'created') return 'created';
  if (eventType === 'confirmed') return 'confirmed';
  if (eventType === 'pickup_ready') return 'pickup_ready';
  if (eventType === 'picked_up') return 'active';
  if (eventType === 'return_due') return 'return_due';
  if (eventType === 'returned') return 'returned';
  if (eventType === 'settled') return 'settled';
  if (['cancelled', 'canceled'].includes(eventType)) return 'cancelled';
  return '';
};

const getLatestRentalStageFromEvents = (timelineEvents = []) => {
  const events = Array.isArray(timelineEvents) ? timelineEvents : [];
  const sortedEvents = [...events].sort(
    (a, b) => new Date(b?.created_at || 0).getTime() - new Date(a?.created_at || 0).getTime()
  );

  for (const event of sortedEvents) {
    const stage = mapEventTypeToStage(getRentalEventType(event));
    if (stage) return stage;
  }

  return '';
};

const getFallbackStageFromRental = (rental = {}) => {
  const status = normalizeText(rental?.status).toLowerCase();
  const outstanding = toNumber(rental?.outstanding);
  const depositReturnedAt = rental?.depositReturnedAt || rental?.raw?.deposit_returned_at || null;

  if (['cancelled', 'canceled'].includes(status)) return 'cancelled';
  if (['closed', 'completed'].includes(status)) {
    return outstanding <= 0 || depositReturnedAt ? 'settled' : 'returned';
  }
  if (status === 'ready_to_finish') return 'return_due';
  if (status === 'active') return 'active';
  if (status === 'confirmed') return 'confirmed';
  if (status === 'scheduled') return 'created';

  if (rental?.startedAt || rental?.raw?.started_at) return 'active';
  return FALLBACK_STAGE;
};

export const getCanonicalRentalStage = (rental = {}, timelineEvents = []) =>
  getLatestRentalStageFromEvents(timelineEvents) || getFallbackStageFromRental(rental);

export const getRentalBucket = (rental = {}, timelineEvents = [], now = new Date()) => {
  const stage = getCanonicalRentalStage(rental, timelineEvents);
  const startTime = toDate(rental?.startDate)?.getTime() || null;
  const nowTime = now instanceof Date ? now.getTime() : new Date(now).getTime();

  if (stage === 'cancelled') return 'canceled';
  if (['returned', 'settled'].includes(stage)) return 'past';
  if (['active', 'return_due'].includes(stage)) return 'active';
  if (stage === 'created' && startTime && startTime < nowTime) return 'past';
  if (['created', 'confirmed', 'pickup_ready'].includes(stage)) return 'upcoming';
  return 'past';
};

export const getRentalPaymentSummaryLabel = (
  rental = {},
  { isFrench = false, tr, locale = isFrench ? 'fr' : 'en' } = {}
) => {
  const translate = getTranslator(isFrench, tr);
  const outstanding = toNumber(rental?.outstanding);
  const paid = toNumber(rental?.paid);
  const paymentStatus = normalizeText(rental?.paymentStatus).toLowerCase();

  if (outstanding > 0) {
    return translate(
      `Remaining • ${new Intl.NumberFormat(locale === 'fr' ? 'fr-MA' : 'en-MA', { maximumFractionDigits: 0 }).format(outstanding)} MAD`,
      `Restant • ${new Intl.NumberFormat(locale === 'fr' ? 'fr-MA' : 'en-MA', { maximumFractionDigits: 0 }).format(outstanding)} MAD`
    );
  }
  if (['paid', 'completed', 'succeeded'].includes(paymentStatus)) {
    return translate('Paid', 'Payé');
  }
  if (['partial', 'partially_paid'].includes(paymentStatus)) {
    return translate('Partial', 'Partiel');
  }
  if (paid > 0) {
    return translate(
      `Paid • ${new Intl.NumberFormat(locale === 'fr' ? 'fr-MA' : 'en-MA', { maximumFractionDigits: 0 }).format(paid)} MAD`,
      `Payé • ${new Intl.NumberFormat(locale === 'fr' ? 'fr-MA' : 'en-MA', { maximumFractionDigits: 0 }).format(paid)} MAD`
    );
  }
  return translate('Payment pending', 'Paiement en attente');
};

export const getRentalDepositSummaryLabel = (
  rental = {},
  { isFrench = false, tr, locale = isFrench ? 'fr' : 'en' } = {}
) => {
  const translate = getTranslator(isFrench, tr);
  const depositAmount = toNumber(rental?.depositAmount);
  const formatter = new Intl.NumberFormat(locale === 'fr' ? 'fr-MA' : 'en-MA', {
    maximumFractionDigits: 0,
  });

  if (rental?.depositReturnedAt) {
    return translate('Deposit returned', 'Caution restituée');
  }
  if (normalizeText(rental?.depositMode).toLowerCase() === 'external') {
    return translate(
      'Deposit handled directly between renter and owner at pickup',
      'Caution gérée directement entre locataire et propriétaire au départ'
    );
  }
  if (depositAmount > 0 && ['active', 'ready_to_finish', 'completed', 'closed'].includes(normalizeText(rental?.status).toLowerCase())) {
    return translate(
      `Deposit held • ${formatter.format(depositAmount)} MAD`,
      `Caution retenue • ${formatter.format(depositAmount)} MAD`
    );
  }
  if (depositAmount > 0) {
    return translate(
      `Deposit due at pickup • ${formatter.format(depositAmount)} MAD`,
      `Caution à prévoir au départ • ${formatter.format(depositAmount)} MAD`
    );
  }
  return translate('No deposit recorded', 'Aucune caution enregistrée');
};

export const getRentalExtensionSummaryLabel = (
  rental = {},
  { isFrench = false, tr } = {}
) => {
  const translate = getTranslator(isFrench, tr);
  const approvedExtensions = Array.isArray(rental?.approvedExtensions) ? rental.approvedExtensions : [];
  const allExtensions = Array.isArray(rental?.extensions) ? rental.extensions : [];
  const pendingExtensions = allExtensions.filter((extension) =>
    ['pending', 'requested'].includes(String(extension?.status || '').trim().toLowerCase())
  );

  if (pendingExtensions.length > 0) return translate('Requested', 'Demandée');
  if (approvedExtensions.length > 0) return translate('Approved', 'Approuvée');
  return translate('None', 'Aucune');
};

export const getRentalConditionSummaryLabel = (
  rental = {},
  { isFrench = false, tr } = {}
) => {
  const translate = getTranslator(isFrench, tr);
  const maintenanceCharge = toNumber(
    coalesceFirst(
      rental?.maintenanceCustomerChargeTotal,
      rental?.vehicleReport?.customer_charge_amount,
      rental?.vehicle_report?.customer_charge_amount
    )
  );
  const fuelCharge = toNumber(rental?.fuelCharge);

  if (maintenanceCharge > 0 || fuelCharge > 0) {
    return translate('Adjustment recorded', 'Ajustement enregistré');
  }
  return translate('No issues', 'Aucun incident');
};

export const normalizeRentalThreadContext = (rental = {}, extras = {}) => {
  if (!rental || typeof rental !== 'object') return {};

  const vehicle = rental?.vehicle && typeof rental.vehicle === 'object'
    ? rental.vehicle
    : rental?.vehicleDetails && typeof rental.vehicleDetails === 'object'
      ? rental.vehicleDetails
      : {};

  const normalized = {
    ...rental,
    id: coalesceFirst(rental.id, rental.rentalId, rental.rental_id),
    rentalId: coalesceFirst(rental.rentalId, rental.rental_id, rental.reference, rental.id),
    reference: coalesceFirst(rental.reference, rental.rentalId, rental.rental_id, rental.id),
    modelName: coalesceFirst(
      rental.modelName,
      rental.vehicleName,
      rental.vehicle_name,
      [vehicle?.name, vehicle?.model].filter(Boolean).join(' ').trim(),
      vehicle?.name,
      rental.title
    ),
    vehicleName: coalesceFirst(
      rental.vehicleName,
      rental.vehicle_name,
      rental.modelName,
      [vehicle?.name, vehicle?.model].filter(Boolean).join(' ').trim(),
      vehicle?.name,
      rental.title
    ),
    startDate: coalesceFirst(
      rental.startDate,
      rental.rental_start_date,
      rental.rentalStartDate,
      rental.startedAt,
      rental.started_at
    ),
    endDate: coalesceFirst(
      rental.endDate,
      rental.actual_end_date,
      rental.actualEndDate,
      rental.rental_end_date,
      rental.rentalEndDate,
      rental.completedAt,
      rental.completed_at
    ),
    scheduledEndDate: coalesceFirst(
      rental.scheduledEndDate,
      rental.rental_end_date,
      rental.rentalEndDate,
      rental.endDate
    ),
    actualReturnAt: coalesceFirst(
      rental.actualReturnAt,
      rental.actual_end_date,
      rental.actualEndDate,
      rental.completedAt,
      rental.completed_at
    ),
    status: coalesceFirst(rental.status, rental.rental_status, rental.lifecycleStatus, rental.displayStatus, ''),
    paymentStatus: coalesceFirst(rental.paymentStatus, rental.payment_status, ''),
    outstanding: toNumber(coalesceFirst(rental.outstanding, rental.remaining_amount, extras.outstanding)),
    paid: toNumber(coalesceFirst(rental.paid, rental.deposit_amount, extras.paid)),
    depositMode: coalesceFirst(rental.depositMode, rental.deposit_mode, extras.depositMode, ''),
    depositAmount: toNumber(
      coalesceFirst(
        rental.depositAmount,
        rental.damage_deposit,
        rental.deposit_amount,
        extras.depositAmount
      )
    ),
    depositReturnedAt: coalesceFirst(rental.depositReturnedAt, rental.deposit_returned_at, extras.depositReturnedAt),
    createdAt: coalesceFirst(rental.createdAt, rental.created_at),
    confirmedAt: coalesceFirst(rental.confirmedAt, rental.confirmed_at, rental.approved_at),
    startedAt: coalesceFirst(rental.startedAt, rental.started_at),
    completedAt: coalesceFirst(rental.completedAt, rental.completed_at, rental.actual_end_date),
    approvedExtensions: Array.isArray(extras.approvedExtensions)
      ? extras.approvedExtensions
      : Array.isArray(rental.approvedExtensions)
        ? rental.approvedExtensions
        : [],
    extensions: Array.isArray(extras.extensions)
      ? extras.extensions
      : Array.isArray(rental.extensions)
        ? rental.extensions
        : [],
    maintenanceCustomerChargeTotal: toNumber(
      coalesceFirst(
        extras.maintenanceCustomerChargeTotal,
        rental.maintenanceCustomerChargeTotal,
        rental.vehicleReport?.customer_charge_amount,
        rental.vehicle_report?.customer_charge_amount
      )
    ),
    fuelCharge: toNumber(coalesceFirst(extras.fuelCharge, rental.fuelCharge)),
    raw: rental?.raw && typeof rental.raw === 'object' ? rental.raw : rental,
  };

  return normalized;
};

export const getRentalThreadPresentation = (
  rental = {},
  timelineEvents = [],
  { isFrench = false, tr } = {}
) => {
  const translate = getTranslator(isFrench, tr);
  const stage = getCanonicalRentalStage(rental, timelineEvents);
  const meta = getStageMeta(stage);
  const outstanding = toNumber(rental?.outstanding);
  const extensions = Array.isArray(rental?.extensions) ? rental.extensions : [];
  const hasPendingExtension = extensions.some((extension) =>
    ['pending', 'requested'].includes(normalizeText(extension?.status).toLowerCase())
  );
  const needsAttention = outstanding > 0 || hasPendingExtension || stage === 'return_due';

  return {
    stage,
    label: translate(meta.label.en, meta.label.fr),
    badgeClassName: meta.badgeClassName,
    statusTone: needsAttention && meta.statusTone !== 'warning' ? 'pending' : meta.statusTone,
    nextAction: translate(meta.nextAction.en, meta.nextAction.fr),
    summary: translate(meta.summary.en, meta.summary.fr),
    latestMessage:
      outstanding > 0
        ? translate(
            `${outstanding} MAD still needs to be settled for this rental.`,
            `${outstanding} MAD restent à régler pour cette location.`
          )
        : hasPendingExtension
          ? translate(
              'An extension request is waiting for review in this rental journey.',
              'Une demande d’extension attend une révision dans ce parcours de location.'
            )
          : translate(meta.summary.en, meta.summary.fr),
    unread: needsAttention,
    needsAttention,
    isCompleted: ['settled', 'cancelled'].includes(stage),
  };
};

export default {
  getCanonicalRentalStage,
  getRentalBucket,
  getRentalDepositSummaryLabel,
  getRentalPaymentSummaryLabel,
  getRentalThreadPresentation,
};
