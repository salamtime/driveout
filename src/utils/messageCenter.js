export const MESSAGE_FAMILIES = {
  verification: 'verification',
  bookings: 'bookings',
  tours: 'tours',
  marketplace: 'marketplace',
  accountTrust: 'account_trust',
  support: 'support',
};

export const MESSAGE_FAMILY_ORDER = [
  MESSAGE_FAMILIES.verification,
  MESSAGE_FAMILIES.bookings,
  MESSAGE_FAMILIES.tours,
  MESSAGE_FAMILIES.marketplace,
  MESSAGE_FAMILIES.accountTrust,
  MESSAGE_FAMILIES.support,
];

export const MESSAGE_THREAD_TYPES = {
  verification: 'verification',
  verificationDocument: 'verification_document',
  verificationStatus: 'verification_status',
  rentalBooking: 'rental_booking',
  tourBooking: 'tour_booking',
  marketplaceCustomerRequest: 'marketplace_customer_request',
  marketplaceOwnerRequest: 'marketplace_owner_request',
  marketplaceModeration: 'marketplace_moderation',
  accountStatus: 'account_status',
  supportCase: 'support_case',
};

export const MESSAGE_SENDER_ROLES = {
  customer: 'customer',
  owner: 'owner',
  admin: 'admin',
  support: 'support',
  system: 'system',
};

const FAMILY_META = {
  [MESSAGE_FAMILIES.verification]: {
    tone: 'violet',
    badgeClassName: 'bg-violet-50 text-violet-700',
  },
  [MESSAGE_FAMILIES.bookings]: {
    tone: 'emerald',
    badgeClassName: 'bg-emerald-50 text-emerald-700',
  },
  [MESSAGE_FAMILIES.tours]: {
    tone: 'sky',
    badgeClassName: 'bg-sky-50 text-sky-700',
  },
  [MESSAGE_FAMILIES.marketplace]: {
    tone: 'amber',
    badgeClassName: 'bg-amber-50 text-amber-700',
  },
  [MESSAGE_FAMILIES.accountTrust]: {
    tone: 'slate',
    badgeClassName: 'bg-slate-100 text-slate-700',
  },
  [MESSAGE_FAMILIES.support]: {
    tone: 'rose',
    badgeClassName: 'bg-rose-50 text-rose-700',
  },
};

export const normalizeMessageFamily = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  const aliasMap = {
    verification: MESSAGE_FAMILIES.verification,
    bookings: MESSAGE_FAMILIES.bookings,
    booking: MESSAGE_FAMILIES.bookings,
    tours: MESSAGE_FAMILIES.tours,
    tour: MESSAGE_FAMILIES.tours,
    marketplace: MESSAGE_FAMILIES.marketplace,
    account_trust: MESSAGE_FAMILIES.accountTrust,
    'account/trust': MESSAGE_FAMILIES.accountTrust,
    trust: MESSAGE_FAMILIES.accountTrust,
    support: MESSAGE_FAMILIES.support,
  };

  return aliasMap[normalized] || MESSAGE_FAMILIES.support;
};

export const normalizeSenderRole = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (Object.values(MESSAGE_SENDER_ROLES).includes(normalized)) return normalized;
  return MESSAGE_SENDER_ROLES.system;
};

export const getMessageFamilyMeta = (family) =>
  FAMILY_META[normalizeMessageFamily(family)] || FAMILY_META[MESSAGE_FAMILIES.support];

export const createMessageThread = (thread = {}) => ({
  id: String(thread.id || `${thread.family || 'support'}-${Date.now()}`),
  family: normalizeMessageFamily(thread.family),
  threadType: String(thread.threadType || MESSAGE_THREAD_TYPES.supportCase),
  senderRole: normalizeSenderRole(thread.senderRole),
  title: String(thread.title || '').trim() || 'Message thread',
  subtitle: String(thread.subtitle || '').trim(),
  summary: String(thread.summary || '').trim(),
  latestMessage: String(thread.latestMessage || '').trim(),
  statusLabel: String(thread.statusLabel || '').trim(),
  statusTone: String(thread.statusTone || '').trim(),
  href: String(thread.href || '').trim(),
  at: thread.at ? new Date(thread.at) : null,
  unread: Boolean(thread.unread),
  status: String(thread.status || '').trim(),
  thread_key: String(thread.thread_key || '').trim(),
  context_type: String(thread.context_type || '').trim(),
  context_id: thread.context_id ?? null,
  entity_type: String(thread.entity_type || '').trim(),
  entity_id: String(thread.entity_id || '').trim(),
  timeline_events: Array.isArray(thread.timeline_events) ? thread.timeline_events : [],
  messages: Array.isArray(thread.messages) ? thread.messages : [],
  metadata: thread.metadata && typeof thread.metadata === 'object' ? thread.metadata : {},
});

export const sortMessageThreads = (threads = []) =>
  [...threads].sort((a, b) => {
    const aTime = a?.at instanceof Date && !Number.isNaN(a.at.getTime()) ? a.at.getTime() : 0;
    const bTime = b?.at instanceof Date && !Number.isNaN(b.at.getTime()) ? b.at.getTime() : 0;
    return bTime - aTime;
  });

export const groupMessageThreadsByFamily = (threads = []) => {
  const normalizedThreads = sortMessageThreads(threads.map((thread) => createMessageThread(thread)));
  const grouped = new Map();

  MESSAGE_FAMILY_ORDER.forEach((family) => {
    grouped.set(family, []);
  });

  normalizedThreads.forEach((thread) => {
    const family = normalizeMessageFamily(thread.family);
    const familyThreads = grouped.get(family) || [];
    familyThreads.push(thread);
    grouped.set(family, familyThreads);
  });

  return MESSAGE_FAMILY_ORDER.map((family) => ({
    family,
    threads: grouped.get(family) || [],
    unreadCount: (grouped.get(family) || []).filter((thread) => thread.unread).length,
    latestAt: (grouped.get(family) || [])[0]?.at || null,
  }));
};

export const buildMessageWorkspaceSummary = (threads = []) => {
  const normalizedThreads = threads.map((thread) => createMessageThread(thread));
  const groupedFamilies = groupMessageThreadsByFamily(normalizedThreads);

  return {
    unreadCount: normalizedThreads.filter((thread) => thread.unread).length,
    totalThreads: normalizedThreads.length,
    families: groupedFamilies,
    familyCounts: groupedFamilies.reduce((accumulator, group) => {
      accumulator[group.family] = group.threads.length;
      return accumulator;
    }, {}),
  };
};

export const MESSAGE_THREAD_SECTIONS = {
  actions: 'actions_required',
  conversations: 'conversations',
  updates: 'updates',
};

const normalizeStatusLabel = (value) => String(value || '').trim().toLowerCase();

const labelIncludes = (value, tokens = []) => {
  const label = normalizeStatusLabel(value);
  return tokens.some((token) => label.includes(token));
};

const getMarketplaceRequestStatus = (thread) => {
  const metadata = thread?.metadata && typeof thread.metadata === 'object' ? thread.metadata : {};
  return normalizeStatusLabel(thread?.statusLabel || metadata.requestStatus || metadata.status || '');
};

const isVerificationNeedsAction = (thread) => {
  if (normalizeMessageFamily(thread?.family) !== MESSAGE_FAMILIES.verification) return false;
  if (thread?.statusTone === 'warning') return true;
  return labelIncludes(thread?.statusLabel, ['needs', 'replac', 'reject', 'suspend', 'expire']);
};

const isMarketplaceModerationNeedsAction = (thread) => {
  if (String(thread?.threadType || '') !== MESSAGE_THREAD_TYPES.marketplaceModeration) return false;
  if (thread?.statusTone === 'warning') return true;
  return labelIncludes(thread?.statusLabel, ['needs', 'change', 'replac']);
};

const isMarketplaceRequestNeedsAction = (thread) => {
  const type = String(thread?.threadType || '');
  if (![MESSAGE_THREAD_TYPES.marketplaceCustomerRequest, MESSAGE_THREAD_TYPES.marketplaceOwnerRequest].includes(type)) {
    return false;
  }
  const status = getMarketplaceRequestStatus(thread);
  return ['pending', 'countered', 'negotiated'].includes(status) || labelIncludes(thread?.statusLabel, ['pending']);
};

const isAccountTrustNeedsAction = (thread) => {
  if (normalizeMessageFamily(thread?.family) !== MESSAGE_FAMILIES.accountTrust) return false;
  return labelIncludes(thread?.statusLabel, ['needs action', 'pending', 'not started']);
};

const isConversationThread = (thread) => {
  const type = String(thread?.threadType || '');
  const metadata = thread?.metadata && typeof thread.metadata === 'object' ? thread.metadata : {};
  if (metadata.replyEnabled || metadata.conversationEnabled || metadata.postPaymentChat) return true;
  return [
    MESSAGE_THREAD_TYPES.marketplaceCustomerRequest,
    MESSAGE_THREAD_TYPES.marketplaceOwnerRequest,
    'marketplace_chat',
    'post_payment_chat',
  ].includes(type) && metadata.replyEnabled === true;
};

export const classifyThreadSection = (thread = {}) => {
  if (
    isVerificationNeedsAction(thread) ||
    isMarketplaceModerationNeedsAction(thread) ||
    isMarketplaceRequestNeedsAction(thread) ||
    isAccountTrustNeedsAction(thread)
  ) {
    return MESSAGE_THREAD_SECTIONS.actions;
  }

  if (isConversationThread(thread)) {
    return MESSAGE_THREAD_SECTIONS.conversations;
  }

  return MESSAGE_THREAD_SECTIONS.updates;
};

export const getThreadActionLabel = (thread = {}) => {
  if (isVerificationNeedsAction(thread)) return 'Upload update';
  if (isMarketplaceModerationNeedsAction(thread)) return 'Fix listing';
  if (isMarketplaceRequestNeedsAction(thread)) return 'Respond';
  if (isAccountTrustNeedsAction(thread)) return 'Review';
  return '';
};
