import { normalizeRentalState } from '../../utils/marketplaceRequestState';
import { getRentalThreadPresentation } from '../../utils/rentalThreadState';

export const MAILBOXES = {
  inbox: 'inbox',
  sent: 'sent',
  archive: 'archive',
};

export const THREAD_FILTERS = {
  all: 'all',
  urgent: 'urgent',
  important: 'important',
  needsReply: 'needs_reply',
  waitingOnCustomer: 'waiting_on_customer',
};

const EXPLICIT_PRIORITIES = new Set(['normal', 'important', 'urgent']);

export const formatDateTime = (value, isFrench) => {
  if (!value) return '—';
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) return '—';
  const locale = isFrench ? 'fr-MA' : 'en-MA';
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfTargetDay = new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
  const diffDays = Math.round((startOfToday.getTime() - startOfTargetDay.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return new Intl.DateTimeFormat(locale, {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(parsed);
  }

  if (diffDays === 1) {
    return isFrench ? 'Hier' : 'Yesterday';
  }

  if (diffDays > 1 && diffDays < 7) {
    return new Intl.DateTimeFormat(locale, {
      weekday: 'short',
    }).format(parsed);
  }

  return new Intl.DateTimeFormat(locale, {
    day: '2-digit',
    month: '2-digit',
  }).format(parsed);
};

export const getLatestMessage = (thread) => {
  const messages = Array.isArray(thread?.messages) ? thread.messages : [];
  return messages[0] || null;
};

export const getMailboxForThread = (thread, currentUserId) => {
  const messages = Array.isArray(thread?.messages) ? thread.messages : [];
  const latestMessage = getLatestMessage(thread);
  const latestStatus = String(latestMessage?.status || thread?.status || '').trim().toLowerCase();
  if (latestStatus === 'archived') return MAILBOXES.archive;
  const currentId = String(currentUserId || '');
  const hasIncomingMessage = messages.some(
    (message) => String(message?.sender_user_id || '') && String(message?.sender_user_id || '') !== currentId
  );
  if (hasIncomingMessage) return MAILBOXES.inbox;
  return MAILBOXES.sent;
};

export const getNeedsReplyState = (thread, currentUserId) => {
  if (thread?.resolved_at) return 'resolved';
  const explicitWaitingOn = String(thread?.waiting_on || '').trim().toLowerCase();
  const currentRole = String(thread?.current_sender_role || '').trim().toLowerCase();
  if (explicitWaitingOn && explicitWaitingOn !== 'none' && currentRole) {
    return explicitWaitingOn === currentRole ? 'needs_reply' : 'waiting_on_customer';
  }
  const latestMessage = getLatestMessage(thread);
  const latestSenderId = String(latestMessage?.sender_user_id || '');
  const currentId = String(currentUserId || '');
  const mailbox = getMailboxForThread(thread, currentUserId);

  if (mailbox === MAILBOXES.archive) return 'archived';
  if (!latestSenderId || !currentId) return mailbox === MAILBOXES.sent ? 'waiting_on_customer' : 'needs_reply';
  if (latestSenderId === currentId) return 'waiting_on_customer';
  return 'needs_reply';
};

export const getThreadPriority = (thread, currentUserId) => {
  const explicitPriority = String(thread?.priority || '').trim().toLowerCase();
  if (EXPLICIT_PRIORITIES.has(explicitPriority)) {
    return explicitPriority;
  }
  const family = String(thread?.family || '').trim().toLowerCase();
  const statusTone = String(thread?.statusTone || '').trim().toLowerCase();
  const latestMessage = getLatestMessage(thread);
  const messageType = String(latestMessage?.message_type || '').trim().toLowerCase();
  const unreadCount = Number(thread?.unread_count || 0);
  const needsReplyState = getNeedsReplyState(thread, currentUserId);

  if (
    statusTone === 'warning' ||
    messageType === 'changes_requested' ||
    ((family === 'verification' || family === 'marketplace') && needsReplyState === 'needs_reply' && unreadCount > 0)
  ) {
    return 'urgent';
  }

  if (
    needsReplyState === 'needs_reply' ||
    unreadCount > 0 ||
    family === 'marketplace' ||
    family === 'verification'
  ) {
    return 'important';
  }

  return 'normal';
};

export const getWaitingOnFilterLabel = (currentSenderRole, tr) =>
  currentSenderRole === 'admin'
    ? tr('Waiting on customer', 'En attente client')
    : tr('Waiting on admin', 'En attente admin');

export const getWaitingStateLabel = (state, currentSenderRole, tr) => {
  if (state === 'needs_reply') return tr('Needs reply', 'À répondre');
  if (state === 'waiting_on_customer') return getWaitingOnFilterLabel(currentSenderRole, tr);
  if (state === 'resolved') return tr('Resolved', 'Résolu');
  return tr('Archived', 'Archivé');
};

export const getWaitingStateTone = (state) => {
  if (state === 'needs_reply') return 'bg-violet-50 text-violet-700';
  if (state === 'waiting_on_customer') return 'bg-sky-50 text-sky-700';
  if (state === 'resolved') return 'bg-emerald-50 text-emerald-700';
  return 'bg-slate-100 text-slate-600';
};

export const getConversationStatusLabel = (thread, currentUserId, currentSenderRole, tr) => {
  const family = String(thread?.family || '').trim().toLowerCase();
  const verificationStatus = String(
    thread?.metadata?.verificationStatus ||
    thread?.metadata?.status ||
    thread?.status ||
    ''
  ).trim().toLowerCase();
  const requestStatus = normalizeRentalState(String(
    thread?.metadata?.requestStatus ||
    thread?.metadata?.status ||
    ''
  ).trim().toLowerCase());

  if (family === 'verification') {
    if (verificationStatus === 'approved') return tr('Verified', 'Vérifié');
    if (['rejected', 'needs_info', 'needs_changes'].includes(verificationStatus)) {
      return tr('Needs changes', 'Corrections requises');
    }
    if (verificationStatus === 'suspended') return tr('Suspended', 'Suspendu');
    if (verificationStatus === 'expired') return tr('Expired', 'Expiré');
    return tr('Pending review', 'En attente');
  }

  if (family === 'marketplace') {
    if (['pending', 'countered'].includes(requestStatus)) {
      return tr('Waiting for approval', 'En attente d’approbation');
    }
    if (requestStatus === 'pre_approved') {
      return tr('Legacy approval', 'Approbation héritée');
    }
    if (requestStatus === 'approved') {
      return tr('Approved by owner', 'Approuvée par le propriétaire');
    }
    if (['active', 'completed'].includes(requestStatus)) {
      return tr('Approved', 'Approuvée');
    }
  }

  if (family === 'bookings') {
    const rentalPresentation = getRentalThreadPresentation(
      {
        status: thread?.metadata?.status || thread?.status || '',
        outstanding: thread?.metadata?.outstanding,
        depositMode: thread?.metadata?.depositMode,
      },
      thread?.timeline_events || [],
      { tr }
    );
    return rentalPresentation.label;
  }

  const waitingState = getNeedsReplyState(thread, currentUserId);
  if (waitingState === 'needs_reply') {
    return tr('Reply needed', 'Réponse attendue');
  }
  if (waitingState === 'waiting_on_customer') {
    return getWaitingOnFilterLabel(currentSenderRole, tr);
  }
  if (waitingState === 'resolved') {
    return tr('Approved', 'Approuvée');
  }
  return tr('Waiting', 'En attente');
};

export const getThreadType = (thread = {}) => {
  const family = String(thread?.family || '').trim().toLowerCase();
  if (family === 'verification') return 'verification';
  if (family === 'marketplace') return 'marketplace_request';
  if (family === 'bookings' || family === 'tours') return 'rental';
  return 'support';
};

export const getThreadTypeLabel = (thread = {}, tr) => {
  const type = getThreadType(thread);
  if (type === 'verification') {
    return tr('Verification', 'Vérification');
  }
  if (type === 'marketplace_request') {
    return tr('Request', 'Demande');
  }
  if (type === 'rental') {
    return tr('Rental', 'Location');
  }
  return tr('Support case', 'Cas support');
};

export const getThreadRoleContext = (thread = {}, currentSenderRole = 'customer') => {
  const family = String(thread?.family || '').trim().toLowerCase();
  const threadType = String(thread?.threadType || thread?.thread_type || '').trim().toLowerCase();
  const metadata = thread?.metadata && typeof thread.metadata === 'object' ? thread.metadata : {};
  const href = String(metadata.href || thread?.href || '').trim();
  const explicitRoleContext = String(
    metadata.roleContext ||
    metadata.role_context ||
    ''
  ).trim().toLowerCase();
  const normalizedSenderRole = String(currentSenderRole || '').trim().toLowerCase();
  const recipientRole = String(thread?.recipient_role || metadata.recipientRole || '').trim().toLowerCase();
  const senderRole = String(thread?.sender_role || metadata.senderRole || '').trim().toLowerCase();

  if (family === 'verification') {
    return 'verification';
  }

  if (['support', 'account_trust'].includes(family)) {
    return 'support';
  }

  if (family === 'marketplace') {
    if (explicitRoleContext === 'owner' || explicitRoleContext === 'customer') {
      return explicitRoleContext;
    }
    if (normalizedSenderRole === 'customer' || normalizedSenderRole === 'renter') {
      return 'customer';
    }
    if (normalizedSenderRole === 'owner' || normalizedSenderRole === 'business_owner') {
      return 'owner';
    }
    if (
      recipientRole === 'owner' ||
      recipientRole === 'business_owner' ||
      senderRole === 'owner' ||
      senderRole === 'business_owner'
    ) {
      return 'owner';
    }
    if (
      href.includes('/account/vehicles?requestId=') ||
      href.includes('/account/vehicles/') ||
      threadType === 'marketplace_owner_request'
    ) {
      return 'owner';
    }
    if (
      href.includes('/account/rentals/requests/') ||
      threadType === 'marketplace_customer_request'
    ) {
      return 'customer';
    }
  }

  if (family === 'bookings' || family === 'tours') {
    return currentSenderRole === 'owner' ? 'owner' : 'customer';
  }

  return currentSenderRole === 'owner' ? 'owner' : 'customer';
};

export const getThreadRoleBucket = (thread = {}, currentSenderRole = 'customer') => {
  const roleContext = getThreadRoleContext(thread, currentSenderRole);
  const type = getThreadType(thread);
  const requestStatus = normalizeRentalState(String(
    thread?.metadata?.requestStatus ||
    thread?.metadata?.status ||
    ''
  ).trim().toLowerCase());

  if (roleContext === 'verification') return 'verification';
  if (roleContext === 'support') return 'support';

  if (roleContext === 'customer') {
    if (type === 'rental') return 'my_rentals';
    if (type === 'marketplace_request') return 'marketplace_requests';
    return 'support';
  }

  if (type === 'rental') return 'active_rentals';
  if (type === 'marketplace_request') {
    if (['approved', 'active', 'completed'].includes(requestStatus)) {
      return 'active_rentals';
    }
    return 'incoming_requests';
  }

  return 'support';
};

export const getPriorityTone = (priority) => {
  if (priority === 'urgent') return 'bg-rose-50 text-rose-700';
  if (priority === 'important') return 'bg-amber-50 text-amber-700';
  return 'bg-slate-100 text-slate-600';
};

export const getFamilyLabel = (thread, tr) => {
  const family = String(thread?.family || '').trim().toLowerCase();
  if (family === 'verification') return tr('Verification', 'Vérification');
  if (family === 'bookings') return tr('Bookings', 'Réservations');
  if (family === 'tours') return tr('Tours', 'Tours');
  if (family === 'marketplace') return tr('Marketplace', 'Marketplace');
  if (family === 'account_trust') return tr('Account & trust', 'Compte et confiance');
  return tr('Support case', 'Cas support');
};

export const getFamilyTone = (thread) => {
  const family = String(thread?.family || '').trim().toLowerCase();
  if (family === 'verification') return 'bg-violet-50 text-violet-700';
  if (family === 'bookings') return 'bg-emerald-50 text-emerald-700';
  if (family === 'tours') return 'bg-sky-50 text-sky-700';
  if (family === 'marketplace') return 'bg-amber-50 text-amber-700';
  if (family === 'account_trust') return 'bg-slate-100 text-slate-700';
  return 'bg-rose-50 text-rose-700';
};

const normalizeParticipantRole = (value = '') => String(value || '').trim().toLowerCase();

const buildParticipantFromSide = (side = {}) => ({
  name: String(side?.name || '').trim(),
  email: String(side?.email || '').trim(),
  userId: side?.userId || null,
  role: side?.role || null,
  avatarUrl: side?.avatarUrl || null,
});

export const getThreadUserProfile = (thread = {}, userId = '') => {
  const normalizedUserId = String(userId || '').trim();
  if (!normalizedUserId) return null;
  const profiles = thread?.user_profiles && typeof thread.user_profiles === 'object' ? thread.user_profiles : {};
  return profiles[normalizedUserId] || null;
};

const resolveMarketplaceParticipantSide = (thread = {}, side = 'sender') => {
  const metadata = thread?.metadata && typeof thread.metadata === 'object' ? thread.metadata : {};
  const messages = Array.isArray(thread?.messages) ? thread.messages : [];
  const normalizedSide = side === 'recipient' ? 'recipient' : 'sender';
  const role = normalizeParticipantRole(
    thread?.[`${normalizedSide}_role`] ||
    metadata[`${normalizedSide}Role`] ||
    ''
  );
  const metadataUserId = role === 'owner' || role === 'business_owner'
    ? metadata.ownerUserId || metadata.owner_id || ''
    : ['customer', 'user', 'renter'].includes(role)
      ? metadata.customerUserId || metadata.customer_id || ''
      : '';
  const threadUserId = String(thread?.[`${normalizedSide}_user_id`] || metadataUserId || '').trim();
  const messageSide = messages.find((message) => {
    const messageUserId = String(message?.[`${normalizedSide}_user_id`] || '').trim();
    return Boolean(threadUserId && messageUserId && messageUserId === threadUserId);
  });

  const participant = buildParticipantFromSide({
    name: thread?.[`${normalizedSide}_name`] || messageSide?.[`${normalizedSide}_name`] || getThreadUserProfile(thread, threadUserId)?.name || '',
    email: thread?.[`${normalizedSide}_email`] || messageSide?.[`${normalizedSide}_email`] || getThreadUserProfile(thread, threadUserId)?.email || '',
    userId: threadUserId || messageSide?.[`${normalizedSide}_user_id`] || null,
    role,
    avatarUrl: getThreadUserProfile(thread, threadUserId)?.avatarUrl || null,
  });

  if (role === 'owner' || role === 'business_owner') {
    return {
      ...participant,
      name: participant.name || String(metadata.ownerName || '').trim(),
      email: participant.email || String(metadata.ownerEmail || '').trim(),
    };
  }

  if (['customer', 'user', 'renter'].includes(role)) {
    return {
      ...participant,
      name: participant.name || String(metadata.customerName || '').trim(),
      email: participant.email || String(metadata.customerEmail || '').trim(),
    };
  }

  return participant;
};

const resolveMarketplaceCounterparty = (thread = {}, currentUserId, currentSenderRole, tr) => {
  const metadata = thread?.metadata && typeof thread.metadata === 'object' ? thread.metadata : {};
  const sender = resolveMarketplaceParticipantSide(thread, 'sender');
  const recipient = resolveMarketplaceParticipantSide(thread, 'recipient');
  const normalizedCurrentUserId = String(currentUserId || '').trim();
  const roleContext = getThreadRoleContext(thread, currentSenderRole);
  const normalizedCurrentRole = normalizeParticipantRole(roleContext || currentSenderRole);
  const prefersCustomer = normalizedCurrentRole === 'owner';
  const preferredRoles = prefersCustomer ? new Set(['customer', 'user', 'renter']) : new Set(['owner', 'business_owner']);

  const preferredParticipants = [sender, recipient].filter((participant) => {
    const participantUserId = String(participant?.userId || '').trim();
    if (participantUserId && participantUserId === normalizedCurrentUserId) return false;
    return preferredRoles.has(normalizeParticipantRole(participant?.role));
  });

  const nonSelfParticipants = [sender, recipient].filter((participant) => {
    const participantUserId = String(participant?.userId || '').trim();
    return !participantUserId || participantUserId !== normalizedCurrentUserId;
  });

  const chosenParticipant = preferredParticipants[0] || nonSelfParticipants[0] || sender || recipient;
  const metadataFallback = prefersCustomer
    ? {
        name: String(metadata.customerName || metadata.customer_name || '').trim(),
        email: String(metadata.customerEmail || metadata.customer_email || '').trim(),
        userId: metadata.customerUserId || metadata.customer_id || null,
        role: 'customer',
      }
    : {
        name: String(metadata.ownerName || metadata.owner_name || '').trim(),
        email: String(metadata.ownerEmail || metadata.owner_email || '').trim(),
        userId: metadata.ownerUserId || metadata.owner_id || null,
        role: 'owner',
      };
  const chosenParticipantRole = normalizeParticipantRole(chosenParticipant?.role);
  const chosenParticipantUserId = String(chosenParticipant?.userId || '').trim();
  const metadataPreferredUserId = String(metadataFallback.userId || '').trim();
  const metadataOppositeUserId = String(
    prefersCustomer
      ? metadata.ownerUserId || metadata.owner_id || ''
      : metadata.customerUserId || metadata.customer_id || ''
  ).trim();
  const shouldPreferMetadataFallback =
    Boolean(metadataFallback.name || metadataFallback.email || metadataPreferredUserId) && (
      !preferredRoles.has(chosenParticipantRole) ||
      (normalizedCurrentUserId && chosenParticipantUserId === normalizedCurrentUserId) ||
      (metadataOppositeUserId && chosenParticipantUserId && chosenParticipantUserId === metadataOppositeUserId)
    );
  const baseParticipant = shouldPreferMetadataFallback
    ? {
        ...chosenParticipant,
        name: metadataFallback.name || chosenParticipant?.name || '',
        email: metadataFallback.email || chosenParticipant?.email || '',
        userId: metadataFallback.userId || chosenParticipant?.userId || null,
        role: metadataFallback.role || chosenParticipant?.role || null,
      }
    : chosenParticipant;

  const resolved = {
    name: baseParticipant?.name || metadataFallback.name || '',
    email: baseParticipant?.email || metadataFallback.email || '',
    userId: baseParticipant?.userId || metadataFallback.userId || null,
    role: baseParticipant?.role || metadataFallback.role || null,
    avatarUrl: baseParticipant?.avatarUrl || null,
  };

  return {
    ...resolved,
    name: resolved.name || resolved.email || tr('Connected account', 'Compte lié'),
  };
};

export const getOtherParty = (thread, currentUserId, tr, currentSenderRole = '') => {
  const family = String(thread?.family || '').trim().toLowerCase();
  if (family === 'marketplace') {
    return resolveMarketplaceCounterparty(thread, currentUserId, currentSenderRole, tr);
  }

  const messages = Array.isArray(thread?.messages) ? thread.messages : [];
  const fallback = {
    name: thread?.entity_name || thread?.recipient_name || thread?.sender_name || '',
    email: thread?.entity_email || thread?.recipient_email || thread?.sender_email || '',
    userId:
      String(thread?.recipient_user_id || '') !== String(currentUserId || '')
        ? thread?.recipient_user_id || null
        : thread?.sender_user_id || null,
    role:
      String(thread?.recipient_user_id || '') !== String(currentUserId || '')
        ? thread?.recipient_role || null
        : thread?.sender_role || null,
  };

  for (const message of messages) {
    if (String(message?.sender_user_id || '') !== String(currentUserId || '')) {
      const profile = getThreadUserProfile(thread, message?.sender_user_id);
      return {
        name: profile?.name || message?.sender_name || fallback.name || '',
        email: profile?.email || message?.sender_email || fallback.email || '',
        userId: message?.sender_user_id || fallback.userId,
        role: message?.sender_role || fallback.role,
        avatarUrl: profile?.avatarUrl || null,
      };
    }
    if (String(message?.recipient_user_id || '') !== String(currentUserId || '')) {
      const profile = getThreadUserProfile(thread, message?.recipient_user_id);
      return {
        name: profile?.name || message?.recipient_name || fallback.name || '',
        email: profile?.email || message?.recipient_email || fallback.email || '',
        userId: message?.recipient_user_id || fallback.userId,
        role: message?.recipient_role || fallback.role,
        avatarUrl: profile?.avatarUrl || null,
      };
    }
  }

  return {
    ...fallback,
    avatarUrl: null,
    name: fallback.name || fallback.email || tr('Connected account', 'Compte lié'),
  };
};

export const getParticipantLabel = (message, currentUserId, currentUserLabel, tr) => {
  if (String(message?.sender_user_id || '') === String(currentUserId || '')) {
    return tr('You', 'Vous');
  }
  const senderName = String(message?.sender_name || '').trim();
  if (senderName) return senderName;

  const senderEmail = String(message?.sender_email || '').trim();
  const normalizedRole = String(message?.sender_role || '').trim().toLowerCase();

  if (normalizedRole === 'admin' || normalizedRole === 'support') {
    return tr('Driveout team', 'Équipe Driveout');
  }

  if (normalizedRole === 'owner' || normalizedRole === 'business_owner') {
    return tr('Vehicle owner', 'Propriétaire du véhicule');
  }

  if (senderEmail) return senderEmail;
  if (normalizedRole === 'customer' || normalizedRole === 'user') {
    return tr('Customer', 'Client');
  }

  return currentUserLabel || tr('Participant', 'Participant');
};

export const getParticipantSecondaryLabel = (message, currentUserId, tr) => {
  if (String(message?.sender_user_id || '') === String(currentUserId || '')) {
    return '';
  }

  const normalizedRole = String(message?.sender_role || '').trim().toLowerCase();
  const senderName = String(message?.sender_name || '').trim();

  if (normalizedRole === 'admin' || normalizedRole === 'support') {
    return senderName ? tr('Driveout support', 'Support Driveout') : tr('Support team', 'Équipe support');
  }

  if (normalizedRole === 'owner' || normalizedRole === 'business_owner') {
    return tr('Vehicle owner', 'Propriétaire du véhicule');
  }

  if (normalizedRole === 'customer' || normalizedRole === 'user') {
    return tr('Customer', 'Client');
  }

  return '';
};
