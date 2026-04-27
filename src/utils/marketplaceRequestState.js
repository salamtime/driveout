export const normalizeRentalState = (statusOrRequest) => {
  const source = statusOrRequest && typeof statusOrRequest === 'object' ? statusOrRequest : null;
  const rawStatus = source
    ? (
        source?.request_status ??
        source?.requestStatus ??
        source?.status ??
        'pending'
      )
    : statusOrRequest;
  const normalized = String(rawStatus || 'pending')
    .trim()
    .toLowerCase()
    .replace(/[^\w\s]+/g, '')
    .replace(/\s+/g, '_');

  const aliases = {
    negotiated: 'countered',
    accepted: 'pre_approved',
    approved_by_owner: 'approved',
    approved_by_the_owner: 'approved',
    confirmed: 'approved',
    rejected: 'declined',
    cancelled: 'declined',
    canceled: 'declined',
  };

  const aliased = aliases[normalized] || normalized;
  const counterOffer = source?.counter_offer && typeof source.counter_offer === 'object'
    ? source.counter_offer
    : source?.counterOffer && typeof source.counterOffer === 'object'
      ? source.counterOffer
      : {};
  const platformFeeStatus = String(counterOffer?.platform_fee_status || counterOffer?.platformFeeStatus || '').trim().toLowerCase();
  const depositStatus = String(counterOffer?.damage_deposit_status || counterOffer?.damageDepositStatus || '').trim().toLowerCase();
  const hasFinalApproval =
    Boolean(
      source?.approved_at ||
      source?.approvedAt ||
      counterOffer?.chat_unlocked_at ||
      counterOffer?.chatUnlockedAt ||
      counterOffer?.owner_fee_reserved_at ||
      counterOffer?.ownerFeeReservedAt ||
      counterOffer?.customer_deposit_held_at ||
      counterOffer?.customerDepositHeldAt
    ) ||
    platformFeeStatus === 'reserved' ||
    ['held', 'not_required', 'released', 'seized'].includes(depositStatus);

  if (source && aliased === 'expired' && hasFinalApproval) {
    return 'approved';
  }

  if (source && aliased === 'pre_approved') {
    if (hasFinalApproval) {
      return 'approved';
    }
  }

  if (source && aliased === 'approved') {
    if (counterOffer?.chat_grace_expired_at || counterOffer?.chatGraceExpiredAt) {
      return 'expired';
    }
  }

  return aliased;
};

export const normalizeMarketplaceRequestLifecycleStatus = normalizeRentalState;

export const MARKETPLACE_COMMISSION_RATE = 0.15;
export const MARKETPLACE_APPROVAL_HOLD_MINUTES = 15;
export const MARKETPLACE_CHAT_GRACE_MINUTES = 12 * 60;

const normalizeMarketplaceAmount = (amount = 0) => Math.max(0, Number(amount || 0));

export const calculateMarketplaceCommission = (estimatedAmount = 0) => {
  const normalizedAmount = normalizeMarketplaceAmount(estimatedAmount);
  return Math.max(0, Math.round(normalizedAmount * MARKETPLACE_COMMISSION_RATE));
};

export const calculateMarketplaceOwnerPayout = (estimatedAmount = 0, commissionAmount = null) => {
  const normalizedAmount = normalizeMarketplaceAmount(estimatedAmount);
  const resolvedCommission = commissionAmount === null
    ? calculateMarketplaceCommission(normalizedAmount)
    : normalizeMarketplaceAmount(commissionAmount);
  return Math.max(0, normalizedAmount - resolvedCommission);
};

export const getMarketplaceMoneyBreakdown = ({ estimatedAmount = 0, commissionAmount = null } = {}) => {
  const normalizedEstimatedAmount = normalizeMarketplaceAmount(estimatedAmount);
  const resolvedCommission = commissionAmount === null
    ? calculateMarketplaceCommission(normalizedEstimatedAmount)
    : normalizeMarketplaceAmount(commissionAmount);

  return {
    estimatedAmount: normalizedEstimatedAmount,
    commissionAmount: resolvedCommission,
    ownerPayoutAmount: calculateMarketplaceOwnerPayout(normalizedEstimatedAmount, resolvedCommission),
  };
};

export const isMarketplaceChatUnlocked = (status) => {
  const normalized = normalizeMarketplaceRequestLifecycleStatus(status);
  return ['approved', 'completed', 'active'].includes(normalized);
};

export const canMarketplaceParticipantReply = (status, senderRole = 'customer') => {
  const normalizedStatus = normalizeMarketplaceRequestLifecycleStatus(status);
  const normalizedRole = String(senderRole || 'customer').trim().toLowerCase();

  if (['owner', 'business_owner'].includes(normalizedRole)) {
    return ['pending', 'countered', 'pre_approved', 'approved', 'active', 'completed'].includes(normalizedStatus);
  }

  if (['customer', 'renter'].includes(normalizedRole)) {
    return isMarketplaceChatUnlocked(normalizedStatus);
  }

  return false;
};

export const isMarketplaceRequestReadOnly = (status) => !isMarketplaceChatUnlocked(status);

export const isMarketplaceRequestOpen = (status) => {
  const normalized = normalizeMarketplaceRequestLifecycleStatus(status);
  return ['pending', 'countered', 'pre_approved', 'approved'].includes(normalized);
};

export const canOwnerPreApproveMarketplaceRequest = (status) => {
  const normalized = normalizeMarketplaceRequestLifecycleStatus(status);
  return ['pending', 'countered'].includes(normalized);
};

export const canCustomerConfirmMarketplaceRequest = (status) => {
  const normalized = normalizeMarketplaceRequestLifecycleStatus(status);
  return normalized === 'pre_approved';
};

export const getMarketplaceApprovalHoldExpiry = (counterOffer = {}, fallbackAcceptedAt = null) => {
  const safeCounterOffer = counterOffer && typeof counterOffer === 'object' ? counterOffer : {};
  const explicitExpiry = safeCounterOffer.hold_expires_at || safeCounterOffer.approval_hold_expires_at || null;
  if (explicitExpiry) return explicitExpiry;

  const startedAt = safeCounterOffer.hold_started_at || fallbackAcceptedAt || null;
  if (!startedAt) return null;

  const startedAtMs = new Date(startedAt).getTime();
  if (!startedAtMs) return null;

  return new Date(startedAtMs + MARKETPLACE_APPROVAL_HOLD_MINUTES * 60 * 1000).toISOString();
};

export const getMarketplaceChatGraceExpiry = (counterOffer = {}, fallbackApprovedAt = null) => {
  const safeCounterOffer = counterOffer && typeof counterOffer === 'object' ? counterOffer : {};
  const explicitExpiry = safeCounterOffer.chat_grace_expires_at || safeCounterOffer.chatGraceExpiresAt || null;
  if (explicitExpiry) return explicitExpiry;

  const startedAt = safeCounterOffer.chat_grace_started_at || safeCounterOffer.chatUnlockedAt || fallbackApprovedAt || null;
  if (!startedAt) return null;

  const startedAtMs = new Date(startedAt).getTime();
  if (!startedAtMs) return null;

  return new Date(startedAtMs + MARKETPLACE_CHAT_GRACE_MINUTES * 60 * 1000).toISOString();
};

export const getMarketplaceApprovalHoldState = ({
  status,
  holdExpiresAt = null,
  now = Date.now(),
} = {}) => {
  const normalizedStatus = normalizeMarketplaceRequestLifecycleStatus(status);
  if (normalizedStatus !== 'pre_approved') {
    return {
      active: false,
      expired: normalizedStatus === 'expired',
      urgency: 'idle',
      remainingMs: 0,
      expiresAt: holdExpiresAt,
    };
  }

  const expiresAtMs = holdExpiresAt ? new Date(holdExpiresAt).getTime() : 0;
  if (!expiresAtMs) {
    return {
      active: false,
      expired: false,
      urgency: 'idle',
      remainingMs: 0,
      expiresAt: holdExpiresAt,
    };
  }

  const remainingMs = Math.max(0, expiresAtMs - Number(now || Date.now()));
  const expired = remainingMs <= 0;

  let urgency = 'normal';
  if (expired) {
    urgency = 'expired';
  } else if (remainingMs <= 2 * 60 * 1000) {
    urgency = 'critical';
  } else if (remainingMs <= 5 * 60 * 1000) {
    urgency = 'low';
  }

  return {
    active: !expired,
    expired,
    urgency,
    remainingMs,
    expiresAt: holdExpiresAt,
  };
};

export const getMarketplaceChatGraceState = ({
  status,
  chatGraceExpiresAt = null,
  now = Date.now(),
} = {}) => {
  const normalizedStatus = normalizeMarketplaceRequestLifecycleStatus(status);
  if (!['approved'].includes(normalizedStatus)) {
    return {
      active: false,
      expired: normalizedStatus === 'expired',
      urgency: 'idle',
      remainingMs: 0,
      expiresAt: chatGraceExpiresAt,
    };
  }

  const expiresAtMs = chatGraceExpiresAt ? new Date(chatGraceExpiresAt).getTime() : 0;
  if (!expiresAtMs) {
    return {
      active: false,
      expired: false,
      urgency: 'idle',
      remainingMs: 0,
      expiresAt: chatGraceExpiresAt,
    };
  }

  const remainingMs = Math.max(0, expiresAtMs - Number(now || Date.now()));
  const expired = remainingMs <= 0;

  let urgency = 'normal';
  if (expired) {
    urgency = 'expired';
  } else if (remainingMs <= 60 * 60 * 1000) {
    urgency = 'critical';
  } else if (remainingMs <= 3 * 60 * 60 * 1000) {
    urgency = 'low';
  }

  return {
    active: !expired,
    expired,
    urgency,
    remainingMs,
    expiresAt: chatGraceExpiresAt,
  };
};

export const formatMarketplaceHoldCountdown = (remainingMs = 0) => {
  const safeRemainingMs = Math.max(0, Number(remainingMs || 0));
  const totalSeconds = Math.ceil(safeRemainingMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};

export const formatMarketplaceGraceCountdown = (remainingMs = 0) => {
  const safeRemainingMs = Math.max(0, Number(remainingMs || 0));
  const totalMinutes = Math.ceil(safeRemainingMs / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours <= 0) {
    return `${minutes}m`;
  }

  return `${hours}h ${String(minutes).padStart(2, '0')}m`;
};

export const canSendMarketplaceRequestReminder = (status, reminderSentAt = null) => {
  const normalized = normalizeMarketplaceRequestLifecycleStatus(status);
  return normalized === 'pending' && !reminderSentAt;
};

export const getMarketplaceRequestDisplay = (status, tr = null) => {
  const normalized = normalizeMarketplaceRequestLifecycleStatus(status);
  const translate = typeof tr === 'function' ? tr : (en) => en;

  const map = {
    pending: {
      label: translate('Request sent', 'Demande envoyée'),
      tone: 'bg-amber-50 text-amber-700',
      shortLabel: translate('Request sent', 'Demande envoyée'),
      readOnlyReason: translate(
        'Waiting for owner review.',
        'En attente de la revue du propriétaire.'
      ),
    },
    countered: {
      label: translate('Counter-offer', 'Contre-offre'),
      tone: 'bg-violet-50 text-violet-700',
      shortLabel: translate('Counter', 'Contre-offre'),
      readOnlyReason: translate(
        'A counter-offer is waiting for your answer.',
        'Une contre-offre attend votre réponse.'
      ),
    },
    pre_approved: {
      label: translate('Approved by owner', 'Approuvée par le propriétaire'),
      tone: 'bg-sky-50 text-sky-700',
      shortLabel: translate('Approved by owner', 'Approuvée par le propriétaire'),
      readOnlyReason: translate(
        'Legacy approval state. Open the request details to finish the old flow.',
        'État d’approbation hérité. Ouvrez le détail pour terminer l’ancien parcours.'
      ),
    },
    approved: {
      label: translate('Booking confirmed', 'Réservation confirmée'),
      tone: 'bg-emerald-50 text-emerald-700',
      shortLabel: translate('Confirmed', 'Confirmée'),
      readOnlyReason: translate(
        'Approved by owner. Deposit is on hold, chat is open, and pickup should move forward within the grace window.',
        'Approuvée par le propriétaire. La caution est retenue, le chat est ouvert et la remise doit avancer pendant la fenêtre de grâce.'
      ),
    },
    completed: {
      label: translate('Completed', 'Terminée'),
      tone: 'bg-slate-100 text-slate-700',
      shortLabel: translate('Completed', 'Terminée'),
      readOnlyReason: '',
    },
    declined: {
      label: translate('Declined', 'Refusée'),
      tone: 'bg-rose-50 text-rose-700',
      shortLabel: translate('Declined', 'Refusée'),
      readOnlyReason: translate(
        'This request is closed here.',
        'Cette demande est clôturée ici.'
      ),
    },
    expired: {
      label: translate('Booking expired', 'Réservation expirée'),
      tone: 'bg-slate-100 text-slate-700',
      shortLabel: translate('Expired', 'Expirée'),
      readOnlyReason: translate(
        'This approval window expired. Request again to continue.',
        'Cette fenêtre d’approbation a expiré. Redemandez pour continuer.'
      ),
    },
  };

  return map[normalized] || {
    label: normalized.replace(/_/g, ' '),
    tone: 'bg-slate-100 text-slate-700',
    shortLabel: normalized.replace(/_/g, ' '),
    readOnlyReason: '',
  };
};

export const getMarketplaceFundsPolicy = (tr = null) => {
  const translate = typeof tr === 'function' ? tr : (en) => en;

  return [
    {
      key: 'fee',
      label: translate('DriveOut fee', 'Frais DriveOut'),
      detail: translate(
        '15% is reserved from the owner wallet when the owner approves.',
        '15 % sont réservés depuis le portefeuille du propriétaire quand il approuve.'
      ),
    },
    {
      key: 'payout',
      label: translate('Owner payout', 'Versement propriétaire'),
      detail: translate(
        'It releases only after the rental is started.',
        'Il se libère seulement après le démarrage de la location.'
      ),
    },
    {
      key: 'deposit',
      label: translate('Damage deposit', 'Caution'),
      detail: translate(
        'It is held from the customer wallet when the owner approves.',
        'Elle est retenue depuis le portefeuille du client quand le propriétaire approuve.'
      ),
    },
    {
      key: 'fallback',
      label: translate('If handoff fails', 'Si la remise échoue'),
      detail: translate(
        'No rental start means no owner payout release.',
        'Sans démarrage de location, aucun versement propriétaire ne se libère.'
      ),
    },
  ];
};
