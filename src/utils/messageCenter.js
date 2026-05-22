import { buildOwnerExecutionWorkspaceHref } from './ownerRentalExecutionLinks';

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

export const MESSAGE_THREAD_SURFACES = {
  conversation: 'conversation',
  workflow: 'workflow',
  internal: 'internal',
};

export const MESSAGE_WORKFLOW_KINDS = {
  identityReview: 'identity_review',
  listingReview: 'listing_review',
  accountReview: 'account_review',
};

export const MESSAGE_CONVERSATION_KINDS = {
  supportCase: 'support_case',
  rentalChat: 'rental_chat',
  marketplaceChat: 'marketplace_chat',
  teamChat: 'team_chat',
  socialReply: 'social_reply',
};

export const MESSAGE_ATTACHMENT_KINDS = {
  photo: 'photo',
  image: 'image',
  video: 'video',
  audio: 'audio',
  file: 'file',
  document: 'document',
};

export const MESSAGE_INBOX_LANES = {
  conversations: 'conversations',
  reviews: 'reviews',
  support: 'support',
  updates: 'updates',
  internal: 'internal',
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

export const getNormalizedThreadType = (thread = {}) =>
  String(thread?.threadType || thread?.thread_type || '').trim().toLowerCase();

export const isVerificationThread = (thread = {}) =>
  normalizeMessageFamily(thread?.family) === MESSAGE_FAMILIES.verification;

export const isSupportThread = (thread = {}) =>
  normalizeMessageFamily(thread?.family) === MESSAGE_FAMILIES.support;

export const isMarketplaceModerationThread = (thread = {}) =>
  getNormalizedThreadType(thread) === MESSAGE_THREAD_TYPES.marketplaceModeration;

export const isInternalOnlyThread = (thread = {}) => {
  const metadata = thread?.metadata && typeof thread.metadata === 'object' ? thread.metadata : {};
  const visibilityScope = String(thread?.visibility_scope || metadata.visibilityScope || '').trim().toLowerCase();
  return (
    visibilityScope === 'internal' ||
    metadata.internalOnly === true ||
    metadata.teamOnly === true
  );
};

export const resolveThreadSurface = (thread = {}) => {
  const family = normalizeMessageFamily(thread?.family);
  const threadType = getNormalizedThreadType(thread);

  if (isInternalOnlyThread(thread)) {
    return MESSAGE_THREAD_SURFACES.internal;
  }

  if (
    family === MESSAGE_FAMILIES.verification ||
    family === MESSAGE_FAMILIES.accountTrust ||
    threadType === MESSAGE_THREAD_TYPES.marketplaceModeration
  ) {
    return MESSAGE_THREAD_SURFACES.workflow;
  }

  if (
    family === MESSAGE_FAMILIES.support ||
    family === MESSAGE_FAMILIES.bookings ||
    family === MESSAGE_FAMILIES.tours ||
    family === MESSAGE_FAMILIES.marketplace
  ) {
    return MESSAGE_THREAD_SURFACES.conversation;
  }

  return MESSAGE_THREAD_SURFACES.conversation;
};

export const resolveThreadWorkflowKind = (thread = {}) => {
  const family = normalizeMessageFamily(thread?.family);
  const threadType = getNormalizedThreadType(thread);
  if (family === MESSAGE_FAMILIES.verification) return MESSAGE_WORKFLOW_KINDS.identityReview;
  if (threadType === MESSAGE_THREAD_TYPES.marketplaceModeration) return MESSAGE_WORKFLOW_KINDS.listingReview;
  if (family === MESSAGE_FAMILIES.accountTrust) return MESSAGE_WORKFLOW_KINDS.accountReview;
  return '';
};

export const resolveConversationKind = (thread = {}) => {
  const metadata = thread?.metadata && typeof thread.metadata === 'object' ? thread.metadata : {};
  const family = normalizeMessageFamily(thread?.family);
  const threadType = getNormalizedThreadType(thread);
  const contentType = String(metadata.contentType || metadata.content_type || metadata.type || '').trim().toLowerCase();

  if (isInternalOnlyThread(thread) || metadata.directStaffChat) {
    return MESSAGE_CONVERSATION_KINDS.teamChat;
  }

  if (contentType === 'story_reply' || contentType === 'post_reply') {
    return MESSAGE_CONVERSATION_KINDS.socialReply;
  }

  if (family === MESSAGE_FAMILIES.bookings || family === MESSAGE_FAMILIES.tours) {
    return MESSAGE_CONVERSATION_KINDS.rentalChat;
  }

  if (
    family === MESSAGE_FAMILIES.marketplace &&
    threadType !== MESSAGE_THREAD_TYPES.marketplaceModeration
  ) {
    return MESSAGE_CONVERSATION_KINDS.marketplaceChat;
  }

  return MESSAGE_CONVERSATION_KINDS.supportCase;
};

export const normalizeMessageAttachmentKind = (value = '') => {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'photo') return MESSAGE_ATTACHMENT_KINDS.photo;
  if (normalized === 'image') return MESSAGE_ATTACHMENT_KINDS.image;
  if (normalized === 'video') return MESSAGE_ATTACHMENT_KINDS.video;
  if (normalized === 'audio') return MESSAGE_ATTACHMENT_KINDS.audio;
  if (normalized === 'document' || normalized === 'doc' || normalized === 'pdf') return MESSAGE_ATTACHMENT_KINDS.document;
  if (normalized === 'file' || normalized === 'attachment') return MESSAGE_ATTACHMENT_KINDS.file;
  return normalized || MESSAGE_ATTACHMENT_KINDS.file;
};

export const normalizeMessageAttachments = (attachments = [], message = {}) =>
  (Array.isArray(attachments) ? attachments : [])
    .map((attachment, index) => ({
      id: String(attachment?.id || `${message?.id || 'message'}-attachment-${index}`).trim(),
      kind: normalizeMessageAttachmentKind(attachment?.kind || attachment?.type || ''),
      publicUrl: String(attachment?.publicUrl || attachment?.public_url || '').trim(),
      thumbnailUrl: String(
        attachment?.thumbnailUrl ||
        attachment?.thumbnail_url ||
        attachment?.previewUrl ||
        attachment?.preview_url ||
        attachment?.publicUrl ||
        attachment?.public_url ||
        ''
      ).trim(),
      originalFilename: String(attachment?.originalFilename || attachment?.original_filename || '').trim(),
      fileSize: Number(attachment?.fileSize || attachment?.file_size || 0) || 0,
      mimeType: String(attachment?.mimeType || attachment?.mime_type || '').trim().toLowerCase(),
      status: String(attachment?.status || 'active').trim().toLowerCase() || 'active',
      expiresAt: attachment?.expiresAt || attachment?.expires_at || null,
    }))
    .filter((attachment) => attachment.publicUrl || attachment.thumbnailUrl || attachment.originalFilename);

export const resolveThreadCapabilities = (thread = {}) => {
  const surface = resolveThreadSurface(thread);
  const workflowKind = resolveThreadWorkflowKind(thread);
  const conversationKind = resolveConversationKind(thread);

  return {
    supportsTextMessages: surface !== MESSAGE_THREAD_SURFACES.workflow,
    supportsPhotos: surface === MESSAGE_THREAD_SURFACES.conversation || surface === MESSAGE_THREAD_SURFACES.internal,
    supportsFiles: conversationKind === MESSAGE_CONVERSATION_KINDS.teamChat || conversationKind === MESSAGE_CONVERSATION_KINDS.socialReply,
    supportsRichReplies: surface !== MESSAGE_THREAD_SURFACES.workflow,
    supportsInternalNotes: surface !== MESSAGE_THREAD_SURFACES.workflow && conversationKind !== MESSAGE_CONVERSATION_KINDS.socialReply,
    supportsWorkflowTimeline: surface === MESSAGE_THREAD_SURFACES.workflow,
    supportsSocialContext: conversationKind === MESSAGE_CONVERSATION_KINDS.socialReply,
    workflowKind,
    conversationKind,
  };
};

export const resolveAdminInboxLane = (thread = {}) => {
  const surface = resolveThreadSurface(thread);
  if (surface === MESSAGE_THREAD_SURFACES.internal) return MESSAGE_INBOX_LANES.internal;
  if (surface === MESSAGE_THREAD_SURFACES.workflow) return MESSAGE_INBOX_LANES.reviews;
  if (isSupportThread(thread)) return MESSAGE_INBOX_LANES.support;
  return MESSAGE_INBOX_LANES.conversations;
};

export const resolveAccountInboxLane = (thread = {}) => {
  const surface = resolveThreadSurface(thread);
  if (surface === MESSAGE_THREAD_SURFACES.internal) return MESSAGE_INBOX_LANES.internal;
  if (surface === MESSAGE_THREAD_SURFACES.workflow) return MESSAGE_INBOX_LANES.updates;
  if (isSupportThread(thread)) return MESSAGE_INBOX_LANES.support;
  return MESSAGE_INBOX_LANES.conversations;
};

export const getMessageFamilyMeta = (family) =>
  FAMILY_META[normalizeMessageFamily(family)] || FAMILY_META[MESSAGE_FAMILIES.support];

const getThreadTypeValue = (thread = {}) =>
  String(thread?.threadType || thread?.thread_type || '').trim();

const getStatusLabelValue = (thread = {}) =>
  String(thread?.statusLabel || thread?.status_label || '').trim();

const getStatusToneValue = (thread = {}) =>
  String(thread?.statusTone || thread?.status_tone || '').trim();

export const createMessageThread = (thread = {}) => ({
  surface: resolveThreadSurface(thread),
  workflowKind: resolveThreadWorkflowKind(thread),
  conversationKind: resolveConversationKind(thread),
  id: String(thread.id || `${thread.family || 'support'}-${Date.now()}`),
  family: normalizeMessageFamily(thread.family),
  threadType: getThreadTypeValue(thread) || MESSAGE_THREAD_TYPES.supportCase,
  senderRole: normalizeSenderRole(thread.senderRole || thread.sender_role),
  title: String(thread.title || thread.subject || '').trim() || 'Message thread',
  subtitle: String(thread.subtitle || '').trim(),
  summary: String(thread.summary || '').trim(),
  latestMessage: String(thread.latestMessage || thread.latest_message || '').trim(),
  statusLabel: getStatusLabelValue(thread),
  statusTone: getStatusToneValue(thread),
  href: String(thread.href || thread?.metadata?.href || '').trim(),
  at: thread.at || thread.latest_message_at || thread.updated_at
    ? new Date(thread.at || thread.latest_message_at || thread.updated_at)
    : null,
  unread: Boolean(thread.unread || Number(thread.unread_count || 0) > 0),
  status: String(thread.status || '').trim(),
  thread_key: String(thread.thread_key || '').trim(),
  context_type: String(thread.context_type || '').trim(),
  context_id: thread.context_id ?? null,
  entity_type: String(thread.entity_type || '').trim(),
  entity_id: String(thread.entity_id || '').trim(),
  timeline_events: Array.isArray(thread.timeline_events) ? thread.timeline_events : [],
  messages: Array.isArray(thread.messages) ? thread.messages : [],
  metadata: {
    ...(thread.metadata && typeof thread.metadata === 'object' ? thread.metadata : {}),
    surface: resolveThreadSurface(thread),
    workflowKind: resolveThreadWorkflowKind(thread),
    conversationKind: resolveConversationKind(thread),
    capabilities: resolveThreadCapabilities(thread),
  },
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

const normalizeWorkspaceMode = (value = '') => {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'admin' || normalized === 'guide') return 'admin';
  if (normalized === 'account' || normalized === 'owner' || normalized === 'customer') return 'account';
  return 'account';
};

const getWorkspaceModeFromLocation = () => {
  if (typeof window === 'undefined') return 'account';
  const pathname = String(window.location.pathname || '').trim().toLowerCase();
  return pathname.startsWith('/admin') || pathname.startsWith('/guide') ? 'admin' : 'account';
};

const getThreadMetadata = (thread = {}) =>
  thread?.metadata && typeof thread.metadata === 'object' ? thread.metadata : {};

const normalizeThreadStatus = (thread = {}) => {
  const metadata = getThreadMetadata(thread);
  return String(
    metadata.requestStatus ||
    metadata.verificationStatus ||
    metadata.status ||
    thread?.status ||
    ''
  ).trim().toLowerCase();
};

const resolveThreadRequestId = (thread = {}) => {
  const metadata = getThreadMetadata(thread);
  const direct = String(
    metadata.requestId ||
    metadata.bookingReference ||
    thread?.entity_id ||
    ''
  ).trim();
  if (direct) return direct;

  const candidates = [
    metadata.href,
    metadata.adminHref,
    thread?.href,
    thread?.latest_message,
    thread?.subject,
  ]
    .map((value) => String(value || '').trim())
    .filter(Boolean);

  for (const value of candidates) {
    const pathMatch = value.match(/\/account\/rentals\/requests\/([^/?#\s]+)/i);
    if (pathMatch?.[1]) {
      return decodeURIComponent(pathMatch[1]);
    }
    const queryMatch = value.match(/[?&]requestId=([^&#\s]+)/i);
    if (queryMatch?.[1]) {
      return decodeURIComponent(queryMatch[1]);
    }
  }

  return '';
};

export const resolveThreadContextTarget = (
  thread = {},
  {
    workspace = 'auto',
    senderRole = 'customer',
    fallbackHref = '',
  } = {}
) => {
  const metadata = getThreadMetadata(thread);
  const workspaceMode = workspace === 'auto' ? getWorkspaceModeFromLocation() : normalizeWorkspaceMode(workspace);
  const currentSenderRole = normalizeSenderRole(senderRole);
  const family = normalizeMessageFamily(thread?.family);
  const threadType = getNormalizedThreadType(thread);
  const routePrefix = workspaceMode === 'admin' ? '/admin' : '/account';
  const metadataHref = String(metadata.href || thread?.href || '').trim();
  const metadataAdminHref = String(metadata.adminHref || '').trim();
  const preferredHref = workspaceMode === 'admin'
    ? (metadataAdminHref || metadataHref)
    : (metadataHref || metadataAdminHref);

  if (family === MESSAGE_FAMILIES.verification || family === MESSAGE_FAMILIES.accountTrust) {
    const basePath = workspaceMode === 'admin' ? '/admin/verification' : '/account/verification';
    const params = new URLSearchParams();
    if (thread?.entity_type) params.set('entityType', String(thread.entity_type));
    if (thread?.entity_id) params.set('entityId', String(thread.entity_id));
    if (metadata.documentId) params.set('documentId', String(metadata.documentId));
    if (metadata.documentType || metadata.verificationType) {
      params.set('documentType', String(metadata.documentType || metadata.verificationType));
    }
    return {
      href: params.size ? `${basePath}?${params.toString()}` : (preferredHref || basePath),
      label: 'Open verification',
      context: 'verification',
    };
  }

  if (threadType === MESSAGE_THREAD_TYPES.marketplaceModeration) {
    return {
      href: preferredHref || (workspaceMode === 'admin' ? '/admin/verification' : '/account/vehicles'),
      label: workspaceMode === 'admin' ? 'Open listing review' : 'Open listing',
      context: 'listing_review',
    };
  }

  if (family === MESSAGE_FAMILIES.marketplace) {
    const requestId = resolveThreadRequestId(thread);
    const status = normalizeThreadStatus(thread);
    const shouldOpenConfirmState = workspaceMode !== 'admin' && status === 'pre_approved';
    const isOwnerFacingView =
      workspaceMode !== 'admin' && (
        threadType === MESSAGE_THREAD_TYPES.marketplaceOwnerRequest ||
        (threadType !== MESSAGE_THREAD_TYPES.marketplaceCustomerRequest && currentSenderRole === MESSAGE_SENDER_ROLES.owner)
      );
    const ownerFacingHref = isOwnerFacingView
      ? buildOwnerExecutionWorkspaceHref({
          id: requestId,
          requestId,
          vehiclePublicProfileId:
            metadata.vehiclePublicProfileId ||
            metadata.vehicle_public_profile_id ||
            metadata.rawListing?.vehicle_public_profile_id ||
            '',
          requestStatus:
            metadata.requestStatus ||
            metadata.request_status ||
            metadata.status ||
            '',
          ownerExecution:
            metadata.ownerExecution ||
            metadata.owner_execution ||
            metadata.raw?.counter_offer?.owner_execution ||
            {},
        }, { focus: 'request' })
      : '';
    const href = requestId
      ? workspaceMode === 'admin'
        ? (preferredHref || `${routePrefix}/messages`)
        : isOwnerFacingView
          ? (preferredHref || ownerFacingHref || `${routePrefix}/rentals/requests/${encodeURIComponent(requestId)}`)
          : `${routePrefix}/rentals/requests/${encodeURIComponent(requestId)}${shouldOpenConfirmState ? '?action=confirm' : ''}`
      : preferredHref;

    return {
      href: href || fallbackHref,
      label: workspaceMode === 'admin'
        ? 'Open request'
        : isOwnerFacingView
          ? 'Open owner request'
          : shouldOpenConfirmState
            ? 'Open booking confirmation'
            : 'Open request',
      context: 'marketplace_request',
      requestId,
    };
  }

  if (family === MESSAGE_FAMILIES.bookings) {
    const entityId = String(thread?.entity_id || '').trim();
    return {
      href: preferredHref || (entityId ? `${routePrefix}/rentals/${encodeURIComponent(entityId)}` : fallbackHref),
      label: workspaceMode === 'admin' ? 'Open rental' : 'Open rental details',
      context: 'rental',
    };
  }

  if (family === MESSAGE_FAMILIES.tours) {
    const entityId = String(thread?.entity_id || '').trim();
    return {
      href: preferredHref || (entityId ? `${routePrefix}/tours/${encodeURIComponent(entityId)}` : `${routePrefix}/tours`),
      label: workspaceMode === 'admin' ? 'Open tour' : 'Open tour details',
      context: 'tour',
    };
  }

  if (family === MESSAGE_FAMILIES.support) {
    return {
      href: preferredHref || (workspaceMode === 'admin' ? '/admin/messages?section=support' : '/account/messages?section=support'),
      label: workspaceMode === 'admin' ? 'Open support case' : 'Open support',
      context: 'support',
    };
  }

  return {
    href: preferredHref || fallbackHref || `${routePrefix}/messages`,
    label: workspaceMode === 'admin' ? 'Open details' : 'Open details',
    context: 'details',
  };
};

const normalizeStatusLabel = (value) => String(value || '').trim().toLowerCase();

const labelIncludes = (value, tokens = []) => {
  const label = normalizeStatusLabel(value);
  return tokens.some((token) => label.includes(token));
};

const getMarketplaceRequestStatus = (thread) => {
  const metadata = thread?.metadata && typeof thread.metadata === 'object' ? thread.metadata : {};
  return normalizeStatusLabel(
    getStatusLabelValue(thread) ||
    metadata.requestStatus ||
    metadata.status ||
    ''
  );
};

const isVerificationNeedsAction = (thread) => {
  if (normalizeMessageFamily(thread?.family) !== MESSAGE_FAMILIES.verification) return false;
  if (getStatusToneValue(thread) === 'warning') return true;
  return labelIncludes(getStatusLabelValue(thread), ['needs', 'replac', 'reject', 'suspend', 'expire']);
};

const isMarketplaceModerationNeedsAction = (thread) => {
  if (getThreadTypeValue(thread) !== MESSAGE_THREAD_TYPES.marketplaceModeration) return false;
  if (getStatusToneValue(thread) === 'warning') return true;
  return labelIncludes(getStatusLabelValue(thread), ['needs', 'change', 'replac']);
};

const isMarketplaceRequestNeedsAction = (thread) => {
  const type = getThreadTypeValue(thread);
  if (![MESSAGE_THREAD_TYPES.marketplaceCustomerRequest, MESSAGE_THREAD_TYPES.marketplaceOwnerRequest].includes(type)) {
    return false;
  }
  const status = getMarketplaceRequestStatus(thread);
  return ['pending', 'countered', 'negotiated'].includes(status) || labelIncludes(getStatusLabelValue(thread), ['pending']);
};

const isAccountTrustNeedsAction = (thread) => {
  if (normalizeMessageFamily(thread?.family) !== MESSAGE_FAMILIES.accountTrust) return false;
  return labelIncludes(getStatusLabelValue(thread), ['needs action', 'pending', 'not started']);
};

const isConversationThread = (thread) => {
  if (resolveThreadSurface(thread) !== MESSAGE_THREAD_SURFACES.conversation) return false;
  const type = getThreadTypeValue(thread);
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

export const buildMessageSectionSummary = (threads = []) => {
  const normalizedThreads = threads.map((thread) => createMessageThread(thread));

  return normalizedThreads.reduce(
    (summary, thread) => {
      const section = classifyThreadSection(thread);
      summary.totalThreads += 1;
      if (thread.unread) {
        summary.unreadCount += 1;
      }

      if (section === MESSAGE_THREAD_SECTIONS.actions) {
        summary.actions += 1;
      } else if (section === MESSAGE_THREAD_SECTIONS.conversations) {
        summary.conversations += 1;
      } else {
        summary.updates += 1;
      }

      return summary;
    },
    {
      totalThreads: 0,
      unreadCount: 0,
      actions: 0,
      conversations: 0,
      updates: 0,
    }
  );
};
