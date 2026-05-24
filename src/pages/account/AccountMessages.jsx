import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ChevronDown } from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import i18n from '../../i18n';
import SharedInboxWorkspace from '../../components/messages/SharedInboxWorkspace';
import { getMessageExperience } from '../../components/messages/messageExperience';
import MessageService from '../../services/MessageService';
import CustomerExperienceService from '../../services/CustomerExperienceService';
import BusinessMarketplaceService from '../../services/BusinessMarketplaceService';
import VerificationService from '../../services/VerificationService';
import { supabase } from '../../lib/supabase';
import { resolveReturnPath } from '../../utils/navigationReturn';
import { buildMessageSectionSummary, MESSAGE_FAMILIES, MESSAGE_THREAD_TYPES, resolveThreadContextTarget } from '../../utils/messageCenter';
import {
  getMarketplaceRequestDisplay,
  normalizeMarketplaceRequestLifecycleStatus,
} from '../../utils/marketplaceRequestState';
import {
  buildOwnerExecutionWorkspaceHref,
  getOwnerExecutionActionConfig,
} from '../../utils/ownerRentalExecutionLinks';
import { getOtherParty, getThreadRoleContext } from '../../components/messages/threadHelpers';

const getSenderRole = (userProfile, user) => {
  const role = String(userProfile?.role || '').trim().toLowerCase();
  const accountType = String(
    userProfile?.accountType ||
    user?.user_metadata?.account_type ||
    user?.app_metadata?.account_type ||
    ''
  ).trim().toLowerCase();

  if (
    role === 'business_owner' ||
    accountType === 'owner' ||
    accountType === 'individual_owner' ||
    accountType === 'operator' ||
    accountType === 'business'
  ) {
    return 'owner';
  }

  return 'customer';
};

const threadIndicatesOwnerAccess = (thread = {}, currentUserId = '') => {
  const normalizedUserId = String(currentUserId || '').trim();
  if (!normalizedUserId) return false;

  const metadata = thread?.metadata && typeof thread.metadata === 'object' ? thread.metadata : {};
  const family = String(thread?.family || '').trim().toLowerCase();
  const threadType = String(thread?.thread_type || thread?.threadType || '').trim().toLowerCase();
  const href = String(metadata.href || thread?.href || '').trim();
  const recipientUserId = String(thread?.recipient_user_id || '').trim();
  const senderUserId = String(thread?.sender_user_id || '').trim();

  if (family !== 'marketplace') return false;
  if (threadType === 'marketplace_owner_request' || threadType === 'marketplace_moderation') return true;
  if (
    href.includes('/account/operations/') ||
    href.includes('/account/vehicles?requestId=') ||
    href.includes('/account/vehicles/')
  ) return true;
  if (recipientUserId && recipientUserId === normalizedUserId && senderUserId !== normalizedUserId) return true;
  return false;
};

const resolveMarketplaceRequestId = (thread = {}, payload = {}) => {
  const payloadRequestId = String(payload?.requestId || '').trim();
  if (payloadRequestId) {
    return payloadRequestId;
  }

  const metadata = thread?.metadata && typeof thread.metadata === 'object' ? thread.metadata : {};
  const href = String(metadata.href || '').trim();
  const hrefMatch = href.match(/\/account\/rentals\/requests\/([^/?#]+)/i);
  if (hrefMatch?.[1]) {
    return decodeURIComponent(hrefMatch[1]);
  }

  return String(
    metadata.requestId ||
    thread?.entity_id ||
    ''
  ).trim();
};

const findPreferredRequestThread = (threads = [], requestId = '', currentSenderRole = 'customer') => {
  const normalizedRequestId = String(requestId || '').trim();
  if (!normalizedRequestId) return null;

  const matches = threads.filter((thread) => {
    const href = String(thread?.metadata?.href || '').trim();
    const entityId = String(thread?.entity_id || '').trim();
    const metadataRequestId = String(thread?.metadata?.requestId || '').trim();
    const contextId = String(thread?.context_id || '').trim();

    return href.includes(`/account/rentals/requests/${encodeURIComponent(normalizedRequestId)}`) ||
      href.includes(`/account/rentals/requests/${normalizedRequestId}`) ||
      href.includes(`requestId=${encodeURIComponent(normalizedRequestId)}`) ||
      href.includes(`requestId=${normalizedRequestId}`) ||
      entityId === normalizedRequestId ||
      metadataRequestId === normalizedRequestId ||
      contextId === normalizedRequestId;
  });

  if (!matches.length) return null;

  const preferredRoleContext = currentSenderRole === 'owner' ? 'owner' : 'customer';
  const preferredThreadType = currentSenderRole === 'owner' ? 'marketplace_owner_request' : 'marketplace_customer_request';
  const scoreThread = (thread) => {
    const metadata = thread?.metadata && typeof thread.metadata === 'object' ? thread.metadata : {};
    const threadType = String(thread?.thread_type || thread?.threadType || '').trim().toLowerCase();
    const roleContext = String(getThreadRoleContext(thread, currentSenderRole) || '').trim().toLowerCase();
    const requestStatus = normalizeMarketplaceRequestLifecycleStatus({
      request_status:
        metadata.requestStatus ||
        metadata.status ||
        thread?.status ||
        '',
      approved_at:
        metadata.approvedAt ||
        metadata.approved_at ||
        metadata.chatUnlockedAt ||
        metadata.chat_unlocked_at ||
        null,
      counter_offer:
        metadata.counterOffer && typeof metadata.counterOffer === 'object'
          ? metadata.counterOffer
          : metadata.counter_offer && typeof metadata.counter_offer === 'object'
            ? metadata.counter_offer
            : {},
    });

    let score = 0;
    if (threadType === preferredThreadType) score += 50;
    if (roleContext === preferredRoleContext) score += 35;
    if (['approved', 'active', 'completed'].includes(requestStatus)) score += 15;
    if (requestStatus === 'expired') score -= 12;
    score += new Date(thread?.latest_message_at || thread?.at || thread?.updated_at || 0).getTime() / 1e13;
    return score;
  };

  return [...matches].sort((left, right) => scoreThread(right) - scoreThread(left))[0] || null;
};

const buildVerificationThreadKey = ({ entityType, entityId }) =>
  ['verification', 'verification', String(entityType || '').trim().toLowerCase(), String(entityId || '').trim()].join(':');

const buildVerificationInboxSummaryThread = ({ userId = '', verificationResponse = null }) => {
  const normalizedUserId = String(userId || '').trim();
  if (!normalizedUserId) return null;

  const requests = (Array.isArray(verificationResponse?.requests) ? verificationResponse.requests : [])
    .filter((request) => String(request?.status || '').trim().toLowerCase() !== 'archived');

  if (!requests.length) return null;

  const documentTypes = [...new Set(
    requests
      .map((request) => String(request?.verification_type || '').trim().toLowerCase())
      .filter(Boolean)
  )];

  const pendingCount = requests.filter((request) => String(request?.status || '').trim().toLowerCase() === 'pending').length;
  const rejectedCount = requests.filter((request) => ['rejected', 'suspended', 'expired'].includes(String(request?.status || '').trim().toLowerCase())).length;
  const approvedCount = requests.filter((request) => String(request?.status || '').trim().toLowerCase() === 'approved').length;

  const verificationStatus =
    rejectedCount > 0
      ? 'needs_changes'
      : pendingCount > 0
        ? 'pending'
        : approvedCount > 0
          ? 'approved'
          : 'pending';

  const latestMessage =
    rejectedCount > 0
      ? 'Identity documents need updates.'
      : pendingCount > 0
        ? 'Identity documents are waiting for admin review.'
        : approvedCount > 0
          ? 'Identity documents have been approved.'
          : 'Identity documents are ready in your trust center.';

  const latestAt = requests.reduce((latest, request) => {
    const nextTimestamp = new Date(request?.reviewed_at || request?.created_at || 0).getTime();
    return nextTimestamp > latest ? nextTimestamp : latest;
  }, 0);

  return MessageService.normalizeSharedThread({
    id: `verification-summary-${normalizedUserId}`,
    thread_key: buildVerificationThreadKey({ entityType: 'user', entityId: normalizedUserId }),
    family: 'verification',
    thread_type: 'verification',
    entity_type: 'user',
    entity_id: normalizedUserId,
    subject: 'Identity review',
    latest_message: latestMessage,
    latest_message_at: latestAt ? new Date(latestAt).toISOString() : new Date().toISOString(),
    unread_count: verificationStatus === 'approved' ? 0 : Math.max(pendingCount, rejectedCount, 0),
    status: verificationStatus,
    metadata: {
      type: 'verification',
      reviewTitle: 'Identity review',
      workflowLabel: 'Identity',
      verificationStatus,
      status: verificationStatus,
      verificationType: documentTypes[0] || '',
      documentTypes,
      href: '/account/verification',
    },
  });
};

const mergeVerificationInboxThread = ({ sharedThreads = [], verificationThread = null }) => {
  if (!verificationThread) {
    return sharedThreads;
  }

  const verificationThreadKey = String(verificationThread?.thread_key || verificationThread?.id || '').trim();
  const existingIndex = sharedThreads.findIndex((thread) => {
    const threadKey = String(thread?.thread_key || thread?.id || '').trim();
    const family = String(thread?.family || '').trim().toLowerCase();
    return (verificationThreadKey && threadKey === verificationThreadKey) || family === 'verification';
  });

  if (existingIndex === -1) {
    return [verificationThread, ...sharedThreads];
  }

  const existingThread = sharedThreads[existingIndex];
  const mergedMetadata = {
    ...(existingThread?.metadata && typeof existingThread.metadata === 'object' ? existingThread.metadata : {}),
    ...(verificationThread?.metadata && typeof verificationThread.metadata === 'object' ? verificationThread.metadata : {}),
  };

  const mergedThread = {
    ...existingThread,
    ...verificationThread,
    latestMessage: existingThread?.latestMessage || verificationThread?.latestMessage,
    latest_message: existingThread?.latest_message || verificationThread?.latest_message,
    unread: existingThread?.unread ?? verificationThread?.unread,
    unread_count: Math.max(
      Number(existingThread?.unread_count || existingThread?.unread ? 1 : 0),
      Number(verificationThread?.unread_count || verificationThread?.unread ? 1 : 0)
    ),
    metadata: mergedMetadata,
  };

  const nextThreads = [...sharedThreads];
  nextThreads.splice(existingIndex, 1, mergedThread);
  return nextThreads;
};

const buildMarketplaceOwnerRequestThreadKey = ({ requestId = '', ownerId = '', customerUserId = '' } = {}) =>
  [
    MESSAGE_FAMILIES.marketplace,
    MESSAGE_THREAD_TYPES.marketplaceOwnerRequest,
    'marketplace_request',
    String(requestId || '').trim() || 'request',
    String(customerUserId || '').trim() || 'customer',
    String(ownerId || '').trim() || 'owner',
  ].join(':');

const shouldSurfaceOwnerRequestInInbox = (request = {}) => {
  const status = normalizeMarketplaceRequestLifecycleStatus(request);
  return status === 'pending' || status === 'countered';
};

const buildOwnerRequestInboxThread = ({ request = {}, ownerId = '', ownerName = '', ownerEmail = '', tr }) => {
  const requestId = String(request?.id || '').trim();
  const normalizedOwnerId = String(ownerId || '').trim();
  if (!requestId || !normalizedOwnerId) return null;

  const customerUserId = String(request?.customerId || request?.customerUserId || '').trim();
  const customerEmail = String(request?.customerEmail || '').trim();
  const customerName = String(request?.customerName || '').trim() || customerEmail || (typeof tr === 'function' ? tr('Customer', 'Client') : 'Customer');
  const lifecycleStatus = normalizeMarketplaceRequestLifecycleStatus(request);
  const displayState = getMarketplaceRequestDisplay(lifecycleStatus, tr);
  const listingTitle = String(request?.listingTitle || request?.vehicleName || '').trim() || (typeof tr === 'function' ? tr('Marketplace request', 'Demande marketplace') : 'Marketplace request');
  const latestAt = request?.updatedAt || request?.createdAt || new Date().toISOString();
  const latestMessage = String(request?.customerMessage || '').trim() || (typeof tr === 'function'
    ? tr('Rental request is waiting for your reply.', 'La demande de location attend votre réponse.')
    : 'Rental request is waiting for your reply.');
  const threadKey = buildMarketplaceOwnerRequestThreadKey({
    requestId,
    ownerId: normalizedOwnerId,
    customerUserId,
  });
  const href = buildOwnerExecutionWorkspaceHref(
    request,
    {
      focus:
        lifecycleStatus === 'approved' || lifecycleStatus === 'active' || lifecycleStatus === 'completed'
          ? 'execution'
          : 'request',
    }
  );
  const baseMetadata = {
    type: 'marketplace_request',
    requestId,
    requestReference: String(request?.requestReference || '').trim() || undefined,
    requestStatus: lifecycleStatus,
    status: lifecycleStatus,
    roleContext: 'owner',
    href,
    listingId: String(request?.listingId || '').trim() || undefined,
    vehiclePublicProfileId: String(request?.vehiclePublicProfileId || '').trim() || undefined,
    listingTitle,
    vehicleName: listingTitle,
    customerName,
    customerEmail: customerEmail || undefined,
    customerUserId: customerUserId || undefined,
    ownerUserId: normalizedOwnerId,
    ownerName: String(ownerName || '').trim() || undefined,
    ownerEmail: String(ownerEmail || '').trim() || undefined,
    requestedStartAt: request?.requestedStartAt || null,
    requestedEndAt: request?.requestedEndAt || null,
    rentalType: request?.rentalType || '',
    duration: request?.duration || '',
    priceAmount: Number(request?.estimatedAmount || 0) || 0,
    estimatedAmount: Number(request?.estimatedAmount || 0) || 0,
    currencyCode: String(request?.currencyCode || 'MAD').trim() || 'MAD',
    replyEnabled: true,
    readOnlyReason: displayState.readOnlyReason || '',
    syntheticOwnerInboxThread: true,
  };

  return {
    id: threadKey,
    thread_key: threadKey,
    family: MESSAGE_FAMILIES.marketplace,
    thread_type: MESSAGE_THREAD_TYPES.marketplaceOwnerRequest,
    threadType: MESSAGE_THREAD_TYPES.marketplaceOwnerRequest,
    entity_type: 'marketplace_request',
    entity_id: requestId,
    context_type: 'request',
    context_id: requestId,
    subject: listingTitle,
    title: customerName,
    subtitle: listingTitle,
    summary: displayState.readOnlyReason || '',
    latest_message: latestMessage,
    latestMessage,
    latest_message_at: latestAt,
    at: latestAt,
    unread_count: 0,
    unread: false,
    message_count: 1,
    status: lifecycleStatus,
    statusLabel: displayState.label,
    statusTone: lifecycleStatus === 'pending' ? 'pending' : 'neutral',
    sender_user_id: customerUserId || null,
    recipient_user_id: normalizedOwnerId,
    sender_role: 'customer',
    recipient_role: 'owner',
    sender_name: customerName,
    sender_email: customerEmail,
    recipient_name: String(ownerName || '').trim(),
    recipient_email: String(ownerEmail || '').trim(),
    priority: 'important',
    waiting_on: 'owner',
    workflow_status: 'active',
    visibility_scope: 'public',
    href,
    metadata: baseMetadata,
    messages: [
      {
        id: `owner-request-submitted-${requestId}`,
        thread_key: threadKey,
        family: MESSAGE_FAMILIES.marketplace,
        thread_type: MESSAGE_THREAD_TYPES.marketplaceOwnerRequest,
        entity_type: 'marketplace_request',
        entity_id: requestId,
        message_type: 'submission_event',
        subject: listingTitle,
        body: latestMessage,
        created_at: latestAt,
        sender_user_id: customerUserId || null,
        sender_role: 'customer',
        sender_name: customerName,
        sender_email: customerEmail,
        recipient_user_id: normalizedOwnerId,
        recipient_role: 'owner',
        recipient_name: String(ownerName || '').trim(),
        recipient_email: String(ownerEmail || '').trim(),
        metadata: {
          ...baseMetadata,
          event: 'request_sent',
        },
        status: 'sent',
      },
    ],
  };
};

const getOwnerRequestStatusTone = (status = '') => {
  const normalizedStatus = String(status || '').trim().toLowerCase();
  if (['approved', 'active', 'completed'].includes(normalizedStatus)) return 'success';
  if (normalizedStatus === 'countered') return 'warning';
  if (normalizedStatus === 'pending' || normalizedStatus === 'pre_approved') return 'pending';
  return 'neutral';
};

const enrichOwnerRequestInboxThread = ({ thread = {}, request = {}, tr }) => {
  const lifecycleStatus = normalizeMarketplaceRequestLifecycleStatus(request);
  const displayState = getMarketplaceRequestDisplay(lifecycleStatus, tr);
  const executionAction = getOwnerExecutionActionConfig(request, tr);
  const fallbackHref = buildOwnerExecutionWorkspaceHref(
    request,
    { focus: executionAction ? 'execution' : 'request' }
  );
  const existingMetadata = thread?.metadata && typeof thread.metadata === 'object' ? thread.metadata : {};
  const listingTitle = String(
    request?.listingTitle ||
    request?.vehicleName ||
    existingMetadata.listingTitle ||
    existingMetadata.vehicleName ||
    thread?.subject ||
    ''
  ).trim();
  const customerName = String(
    request?.customerName ||
    existingMetadata.customerName ||
    thread?.sender_name ||
    thread?.title ||
    ''
  ).trim();
  const customerEmail = String(
    request?.customerEmail ||
    existingMetadata.customerEmail ||
    thread?.sender_email ||
    ''
  ).trim();
  const nextMetadata = {
    ...existingMetadata,
    type: 'marketplace_request',
    requestId: String(request?.id || existingMetadata.requestId || thread?.entity_id || '').trim() || undefined,
    requestReference: String(request?.requestReference || existingMetadata.requestReference || '').trim() || undefined,
    requestStatus: lifecycleStatus,
    status: lifecycleStatus,
    roleContext: 'owner',
    href: executionAction?.href || fallbackHref || existingMetadata.href || thread?.href || '',
    listingId: String(request?.listingId || existingMetadata.listingId || '').trim() || undefined,
    vehiclePublicProfileId: String(request?.vehiclePublicProfileId || existingMetadata.vehiclePublicProfileId || '').trim() || undefined,
    listingTitle: listingTitle || undefined,
    vehicleName: listingTitle || undefined,
    customerName: customerName || undefined,
    customerEmail: customerEmail || undefined,
    customerUserId: String(request?.customerId || request?.customerUserId || existingMetadata.customerUserId || '').trim() || undefined,
    ownerUserId: String(request?.ownerId || request?.ownerUserId || existingMetadata.ownerUserId || thread?.recipient_user_id || '').trim() || undefined,
    requestedStartAt: request?.requestedStartAt || existingMetadata.requestedStartAt || null,
    requestedEndAt: request?.requestedEndAt || existingMetadata.requestedEndAt || null,
    rentalType: request?.rentalType || existingMetadata.rentalType || '',
    duration: request?.duration || existingMetadata.duration || '',
    priceAmount: Number(request?.estimatedAmount ?? existingMetadata.priceAmount ?? existingMetadata.estimatedAmount ?? 0) || 0,
    estimatedAmount: Number(request?.estimatedAmount ?? existingMetadata.estimatedAmount ?? 0) || 0,
    currencyCode: String(request?.currencyCode || existingMetadata.currencyCode || 'MAD').trim() || 'MAD',
    replyEnabled: lifecycleStatus !== 'expired',
    readOnlyReason: displayState.readOnlyReason || '',
    ownerExecution: request?.ownerExecution && typeof request.ownerExecution === 'object'
      ? request.ownerExecution
      : existingMetadata.ownerExecution,
    approvedAt: request?.approvedAt || existingMetadata.approvedAt || null,
    startedAt: request?.startedAt || existingMetadata.startedAt || null,
    completedAt: request?.completedAt || existingMetadata.completedAt || null,
    chatUnlockedAt: request?.chatUnlockedAt || existingMetadata.chatUnlockedAt || null,
    chatUnlocked: request?.chatUnlocked ?? existingMetadata.chatUnlocked ?? null,
    executionStage: executionAction?.key || existingMetadata.executionStage || undefined,
  };

  return {
    ...thread,
    status: lifecycleStatus,
    statusLabel: displayState.label || thread?.statusLabel || thread?.status_label || '',
    statusTone: getOwnerRequestStatusTone(lifecycleStatus),
    href: executionAction?.href || fallbackHref || thread?.href || existingMetadata.href || '',
    title: thread?.title || customerName || customerEmail || thread?.subject || '',
    subtitle: thread?.subtitle || listingTitle || thread?.subtitle || '',
    summary: displayState.readOnlyReason || thread?.summary || '',
    metadata: nextMetadata,
  };
};

const mergeOwnerRequestInboxThreads = ({
  sharedThreads = [],
  ownerRequests = [],
  ownerId = '',
  ownerName = '',
  ownerEmail = '',
  tr,
}) => {
  const ownerRequestMap = new Map(
    ownerRequests.map((request) => [String(request?.id || '').trim(), request]).filter(([requestId]) => requestId)
  );
  const enrichedThreads = sharedThreads.map((thread) => {
    const threadType = String(thread?.thread_type || thread?.threadType || '').trim().toLowerCase();
    if (threadType !== MESSAGE_THREAD_TYPES.marketplaceOwnerRequest) {
      return thread;
    }

    const requestId = resolveMarketplaceRequestId(thread);
    const matchingRequest = ownerRequestMap.get(requestId);
    if (!matchingRequest) {
      return thread;
    }

    return enrichOwnerRequestInboxThread({
      thread,
      request: matchingRequest,
      tr,
    });
  });

  const existingOwnerRequestIds = new Set(
    enrichedThreads
      .filter((thread) => String(thread?.thread_type || thread?.threadType || '').trim().toLowerCase() === MESSAGE_THREAD_TYPES.marketplaceOwnerRequest)
      .map((thread) => resolveMarketplaceRequestId(thread))
      .filter(Boolean)
  );

  const syntheticThreads = ownerRequests
    .filter(shouldSurfaceOwnerRequestInInbox)
    .filter((request) => {
      const requestId = String(request?.id || '').trim();
      return requestId && !existingOwnerRequestIds.has(requestId);
    })
    .map((request) => buildOwnerRequestInboxThread({
      request,
      ownerId,
      ownerName,
      ownerEmail,
      tr,
    }))
    .filter(Boolean);

  if (!syntheticThreads.length) {
    return enrichedThreads;
  }

  return [...syntheticThreads, ...enrichedThreads].sort((left, right) => {
    const leftTime = new Date(left?.latest_message_at || left?.at || 0).getTime();
    const rightTime = new Date(right?.latest_message_at || right?.at || 0).getTime();
    return rightTime - leftTime;
  });
};

const AccountMessages = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const isFrench = i18n.resolvedLanguage === 'fr';
  const tr = useCallback((en, fr) => (isFrench ? fr : en), [isFrench]);
  const { user, userProfile } = useAuth();
  const profileSenderRole = getSenderRole(userProfile, user);
  const [threads, setThreads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [verificationCount, setVerificationCount] = useState(0);
  const [ownerAccessDetected, setOwnerAccessDetected] = useState(profileSenderRole === 'owner');
  const busyThreadKey = '';
  const [mobileConversationOpen, setMobileConversationOpen] = useState(false);
  const [mobileHeaderMenuOpen, setMobileHeaderMenuOpen] = useState(false);
  const realtimeReloadTimerRef = useRef(null);
  const repairedOwnerRequestIdsRef = useRef(new Set());
  const messageExperience = getMessageExperience();
  const effectiveSenderRole = profileSenderRole === 'owner' || ownerAccessDetected ? 'owner' : 'customer';
  const currentUserLabel = String(
    userProfile?.fullName ||
    userProfile?.full_name ||
    userProfile?.username ||
    user?.user_metadata?.full_name ||
    user?.email ||
    'You'
  ).trim();
  const currentUserAvatarUrl = String(
    userProfile?.profile_picture_url ||
    userProfile?.avatar_url ||
    user?.user_metadata?.profile_picture_url ||
    user?.user_metadata?.avatar_url ||
    ''
  ).trim();
  const requestedThreadKey = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return String(params.get('threadKey') || '').trim();
  }, [location.search]);
  const requestedBookingId = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return String(params.get('requestId') || '').trim();
  }, [location.search]);
  const requestedInboxLane = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return String(params.get('lane') || '').trim().toLowerCase();
  }, [location.search]);
  const preferredReturnInboxLane = useMemo(
    () => String(location.state?.preferredInboxLane || '').trim().toLowerCase(),
    [location.state]
  );
  const directConversationMode = Boolean(requestedThreadKey || requestedBookingId);
  const initialSelectedThreadKey = useMemo(() => {
    const requestedThread = requestedThreadKey
      ? threads.find((thread) => String(thread?.thread_key || thread?.id || '').trim() === requestedThreadKey)
      : null;
    const requestedThreadType = String(
      requestedThread?.thread_type || requestedThread?.threadType || ''
    ).trim().toLowerCase();
    const requestedThreadRoleCompatible = requestedThread
      ? effectiveSenderRole === 'owner'
        ? requestedThreadType !== 'marketplace_customer_request'
        : requestedThreadType !== 'marketplace_owner_request'
      : false;

    if (requestedThreadKey && requestedThreadRoleCompatible) {
      return requestedThreadKey;
    }
    if (!requestedBookingId) return '';

    const matchingThread = findPreferredRequestThread(threads, requestedBookingId, effectiveSenderRole);

    return String(matchingThread?.thread_key || matchingThread?.id || '').trim();
  }, [effectiveSenderRole, requestedBookingId, requestedThreadKey, threads]);
  const initialInboxLane = directConversationMode ? '' : (requestedInboxLane || preferredReturnInboxLane);
  const workspaceRenderKey = useMemo(
    () => [
      directConversationMode ? 'direct' : 'list',
      requestedThreadKey,
      requestedBookingId,
      initialSelectedThreadKey,
      initialInboxLane,
    ].join(':'),
    [directConversationMode, initialInboxLane, initialSelectedThreadKey, requestedBookingId, requestedThreadKey]
  );
  const backLink = useMemo(
    () => resolveReturnPath(location, '/account/overview'),
    [location]
  );

  const loadThreads = useCallback(async ({ silent = false } = {}) => {
    if (!user?.id) {
      setThreads([]);
      setLoading(false);
      return [];
    }

    try {
      if (!silent) {
        setLoading(true);
      }
      setError('');
      const shouldLoadOwnerRequestBridge = profileSenderRole === 'owner' || ownerAccessDetected;
      const [response, verificationResponse, ownerRequestsResponse] = await Promise.all([
        MessageService.listSharedThreads(),
        VerificationService.getEntityVerificationSummary('user', user.id, { forceRefresh: true }).catch(() => null),
        shouldLoadOwnerRequestBridge
          ? BusinessMarketplaceService.getOwnerRequests(user.id, 'all', { forceRefresh: true }).catch(() => null)
          : Promise.resolve(null),
      ]);
      const nextThreads = Array.isArray(response?.threads) ? response.threads : [];
      const verificationSummaryThread = buildVerificationInboxSummaryThread({
        userId: user.id,
        verificationResponse,
      });
      const withVerificationThreads = mergeVerificationInboxThread({
        sharedThreads: nextThreads,
        verificationThread: verificationSummaryThread,
      });
      const ownerRequests = Array.isArray(ownerRequestsResponse?.requests) ? ownerRequestsResponse.requests : [];
      const mergedThreads = mergeOwnerRequestInboxThreads({
        sharedThreads: withVerificationThreads,
        ownerRequests,
        ownerId: user.id,
        ownerName: currentUserLabel,
        ownerEmail: user?.email || userProfile?.email || '',
        tr,
      });
      const pendingCount = Array.isArray(verificationResponse?.requests)
        ? verificationResponse.requests.filter((request) => String(request?.status || '').trim().toLowerCase() === 'pending').length
        : 0;
      setVerificationCount(pendingCount);
      setThreads(mergedThreads);
      return mergedThreads;
    } catch (loadError) {
      setError(loadError?.message || tr('Unable to load your Inbox right now.', 'Impossible de charger votre Inbox pour le moment.'));
      setThreads([]);
      return [];
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, [currentUserLabel, ownerAccessDetected, profileSenderRole, tr, user?.email, user?.id, userProfile?.email]);

  useEffect(() => {
    if (!user?.id) {
      setVerificationCount(0);
      return;
    }

    let cancelled = false;
    const loadVerificationCount = async () => {
      try {
        const response = await VerificationService.getEntityVerificationSummary('user', user.id, { forceRefresh: true });
        const requests = Array.isArray(response?.requests) ? response.requests : [];
        const pendingCount = requests.filter((request) => String(request?.status || '').trim().toLowerCase() === 'pending').length;
        if (!cancelled) {
          setVerificationCount(pendingCount);
        }
      } catch {
        if (!cancelled) {
          setVerificationCount(0);
        }
      }
    };

    void loadVerificationCount();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  useEffect(() => {
    void loadThreads();
  }, [loadThreads]);

  useEffect(() => {
    if (!user?.id) return undefined;

    const queueRealtimeReload = () => {
      if (realtimeReloadTimerRef.current) {
        clearTimeout(realtimeReloadTimerRef.current);
      }

      realtimeReloadTimerRef.current = setTimeout(() => {
        void loadThreads({ silent: true });
      }, 600);
    };

    const unsubscribe = MessageService.subscribeSharedMessages({
      userId: user.id,
      onChange: queueRealtimeReload,
    });
    const bookingRealtimeChannels = [
      supabase
        .channel(`account-messages-booking-customer:${user.id}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'app_booking_requests',
            filter: `customer_id=eq.${user.id}`,
          },
          queueRealtimeReload
        )
        .subscribe(),
      supabase
        .channel(`account-messages-booking-owner:${user.id}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'app_booking_requests',
            filter: `owner_id=eq.${user.id}`,
          },
          queueRealtimeReload
        )
        .subscribe(),
    ];

    return () => {
      if (realtimeReloadTimerRef.current) {
        clearTimeout(realtimeReloadTimerRef.current);
      }
      bookingRealtimeChannels.forEach((channel) => {
        try {
          supabase.removeChannel(channel);
        } catch {
          // ignore cleanup errors
        }
      });
      unsubscribe();
    };
  }, [loadThreads, user?.id]);

  useEffect(() => {
    if (profileSenderRole === 'owner') {
      setOwnerAccessDetected(true);
      return;
    }

    const inferredOwnerAccess = threads.some((thread) => threadIndicatesOwnerAccess(thread, user?.id));
    setOwnerAccessDetected(inferredOwnerAccess);
  }, [profileSenderRole, threads, user?.id]);

  const transactionHubThreads = useMemo(
    () =>
      threads.filter((thread) => String(thread?.family || '').trim().toLowerCase() !== 'support'),
    [threads]
  );
  const inboxSectionSummary = useMemo(
    () => buildMessageSectionSummary(transactionHubThreads),
    [transactionHubThreads]
  );
  const inboxHeader = useMemo(
    () => ({
      eyebrow: tr('Inbox', 'Boîte de réception'),
      title: effectiveSenderRole === 'owner'
        ? tr('Operations inbox', 'Boîte de réception des opérations')
        : tr('Trip inbox', 'Boîte de réception des trajets'),
      description: effectiveSenderRole === 'owner'
        ? tr(
            'Open the thread you need and reply right away.',
            'Ouvrez le fil nécessaire et répondez tout de suite.'
          )
        : tr(
            'See the latest trip updates and reply from one place.',
            'Consultez les dernières mises à jour et répondez depuis un seul endroit.'
          ),
    }),
    [effectiveSenderRole, tr]
  );
  const inboxActionLinks = useMemo(() => {
    if (effectiveSenderRole === 'owner') {
      return [
        {
          key: 'listings',
          label: tr('Manage listings', 'Gérer les annonces'),
          to: '/account/vehicles',
        },
        {
          key: 'verification',
          label: verificationCount > 0
            ? tr('Open trust center', 'Ouvrir le centre de confiance')
            : tr('Open account', 'Ouvrir le compte'),
          to: verificationCount > 0 ? '/account/verification' : '/account/settings',
        },
      ];
    }

    return [
      {
        key: 'browse',
        label: tr('Browse vehicles', 'Explorer les véhicules'),
        to: '/marketplace',
      },
      {
        key: 'rentals',
        label: tr('Trips', 'Parcours'),
        to: '/account/rentals',
      },
    ];
  }, [effectiveSenderRole, tr, verificationCount]);
  const emptyStateConfig = useMemo(() => {
    if (effectiveSenderRole === 'owner') {
      return {
        title: tr('No inbox activity yet', 'Aucune activité dans la boîte de réception'),
        description: tr(
          'When a renter requests one of your vehicles, needs approval, or verification needs your attention, it will show up here.',
          'Lorsqu’un locataire demandera un de vos véhicules, aura besoin d’une approbation ou qu’une vérification nécessitera votre attention, cela apparaîtra ici.'
        ),
        actionLabel: tr('Open listings', 'Ouvrir les annonces'),
        actionTo: '/account/vehicles',
      };
    }

    return {
      title: tr('No inbox activity yet', 'Aucune activité dans la boîte de réception'),
      description: tr(
        'When you request a vehicle, receive trip updates, or need help, every conversation will appear here.',
        'Lorsque vous demandez un véhicule, recevez des mises à jour de trajet ou avez besoin d’aide, chaque conversation apparaîtra ici.'
      ),
      actionLabel: tr('Browse vehicles', 'Explorer les véhicules'),
      actionTo: '/marketplace',
    };
  }, [effectiveSenderRole, tr]);
  const handleOpenSupportThread = useCallback(async () => {
    if (!user?.id) return '';

    const normalizedUserId = String(user.id || '').trim();
    const existingSupportThread = threads
      .filter((thread) => {
        const family = String(thread?.family || '').trim().toLowerCase();
        const entityType = String(thread?.entity_type || '').trim().toLowerCase();
        const entityId = String(thread?.entity_id || '').trim();
        return family === 'support' && entityType === 'user' && entityId === normalizedUserId;
      })
      .sort((left, right) => {
        const leftResolvedScore = left?.resolved_at ? 1 : 0;
        const rightResolvedScore = right?.resolved_at ? 1 : 0;
        if (leftResolvedScore !== rightResolvedScore) return leftResolvedScore - rightResolvedScore;

        const leftUnread = Number(left?.unread_count || 0);
        const rightUnread = Number(right?.unread_count || 0);
        if (leftUnread !== rightUnread) return rightUnread - leftUnread;

        return new Date(right?.latest_message_at || 0).getTime() - new Date(left?.latest_message_at || 0).getTime();
      })[0];

    const existingSupportThreadKey = String(
      existingSupportThread?.thread_key || existingSupportThread?.id || ''
    ).trim();

    if (existingSupportThreadKey) {
      return existingSupportThreadKey;
    }

    const ensureResponse = await MessageService.ensureThreadByContext({
      contextType: 'user',
      contextId: normalizedUserId,
      family: 'support',
      threadType: 'support_case',
      senderRole: effectiveSenderRole,
      waitingOn: 'support',
    });

    const ensuredThreadKey = String(ensureResponse?.threadState?.thread_key || '').trim();
    const refreshedThreads = await loadThreads({ silent: true });

    if (ensuredThreadKey) {
      return ensuredThreadKey;
    }

    const fallbackSupportThread = (Array.isArray(refreshedThreads) ? refreshedThreads : []).find((thread) => {
      const family = String(thread?.family || '').trim().toLowerCase();
      const entityType = String(thread?.entity_type || '').trim().toLowerCase();
      const entityId = String(thread?.entity_id || '').trim();
      return family === 'support' && entityType === 'user' && entityId === normalizedUserId;
    });

    return String(fallbackSupportThread?.thread_key || fallbackSupportThread?.id || '').trim();
  }, [effectiveSenderRole, loadThreads, user?.id]);
  const seedOwnerApprovedThreadForRequest = useCallback(async (request) => {
    const requestId = String(request?.id || '').trim();
    const customerUserId = String(request?.customerId || '').trim();
    if (!requestId || !customerUserId || !user?.id) return false;

    const metadata = {
      type: 'marketplace_request',
      event: 'approved',
      status: 'approved',
      requestStatus: 'approved',
      roleContext: 'owner',
      requestId,
      requestReference: String(request?.requestReference || '').trim(),
      listingId: String(request?.listingId || '').trim() || undefined,
      vehiclePublicProfileId: String(request?.vehiclePublicProfileId || '').trim() || undefined,
      listingTitle: String(request?.listingTitle || '').trim(),
      vehicleName: String(request?.listingTitle || '').trim(),
      customerName: String(request?.customerName || '').trim(),
      customerEmail: String(request?.customerEmail || '').trim() || undefined,
      customerUserId,
      ownerUserId: String(user.id || '').trim(),
      ownerName: currentUserLabel,
      priceAmount: Number(request?.estimatedAmount || 0) || 0,
      estimatedAmount: Number(request?.estimatedAmount || 0) || 0,
      platformFeeAmount: Number(request?.commissionAmount || 0) || 0,
      damageDepositAmount: Number(request?.depositAmount || 0) || 0,
      currencyCode: String(request?.currencyCode || 'MAD').trim() || 'MAD',
      chatUnlockedAt: request?.chatUnlockedAt || null,
      chatGraceExpiresAt: request?.chatGraceExpiresAt || null,
      replyEnabled: true,
      readOnlyReason: '',
      href: buildOwnerExecutionWorkspaceHref(request, { focus: 'execution' }),
    };

    await MessageService.sendSharedMessage({
      family: 'marketplace',
      threadType: 'marketplace_owner_request',
      entityType: 'marketplace_request',
      entityId: requestId,
      recipientUserId: customerUserId,
      recipientRole: 'customer',
      senderRole: 'owner',
      messageType: 'system_event',
      subject: metadata.listingTitle || tr('Marketplace request', 'Demande marketplace'),
      body: 'Owner approved the booking',
      metadata,
    });

    await MessageService.sendSharedMessage({
      family: 'marketplace',
      threadType: 'marketplace_owner_request',
      entityType: 'marketplace_request',
      entityId: requestId,
      recipientUserId: customerUserId,
      recipientRole: 'customer',
      senderRole: 'owner',
      messageType: 'note',
      subject: metadata.listingTitle || tr('Marketplace request', 'Demande marketplace'),
      body: 'Welcome. If you need anything before pickup, message me here.',
      metadata: {
        ...metadata,
        autoWelcome: true,
      },
    });

    repairedOwnerRequestIdsRef.current.add(requestId);
    return true;
  }, [currentUserLabel, tr, user?.id]);
  useEffect(() => {
    if (effectiveSenderRole !== 'owner' || !user?.id) return undefined;

    let cancelled = false;
    const repairMissingOwnerApprovedThreads = async () => {
      try {
        const response = await BusinessMarketplaceService.getOwnerRequests(user.id, 'all', { forceRefresh: true });
        const ownerRequests = Array.isArray(response?.requests) ? response.requests : [];
        const existingOwnerThreadRequestIds = new Set(
          threads
            .filter((thread) => String(thread?.thread_type || '').trim().toLowerCase() === 'marketplace_owner_request')
            .map((thread) => String(thread?.entity_id || thread?.metadata?.requestId || '').trim())
            .filter(Boolean)
        );

        const repairableRequests = ownerRequests.filter((request) => {
          const requestId = String(request?.id || '').trim();
          if (!requestId) return false;
          if (existingOwnerThreadRequestIds.has(requestId)) return false;
          if (repairedOwnerRequestIdsRef.current.has(requestId)) return false;
          return Boolean(
            request?.chatUnlockedAt ||
            String(request?.platformFeeStatus || '').trim().toLowerCase() === 'reserved' ||
            String(request?.damageDepositStatus || '').trim().toLowerCase() === 'held'
          );
        });

        for (const request of repairableRequests) {
          const requestId = String(request?.id || '').trim();
          repairedOwnerRequestIdsRef.current.add(requestId);
          await seedOwnerApprovedThreadForRequest(request);
        }

        if (!cancelled && repairableRequests.length) {
          await loadThreads({ silent: true });
        }
      } catch {
        // Best-effort repair only; inbox should keep working even if this backfill cannot run.
      }
    };

    void repairMissingOwnerApprovedThreads();
    return () => {
      cancelled = true;
    };
  }, [effectiveSenderRole, loadThreads, seedOwnerApprovedThreadForRequest, threads, user?.id]);
  const sendMarketplaceTimelineMessage = async ({
    thread,
    recipientUserId,
    recipientRole,
    senderRole,
    body,
    event,
    requestStatus,
    extraMetadata = {},
  }) => {
    const threadMetadata = thread?.metadata && typeof thread.metadata === 'object' ? { ...thread.metadata } : {};
    delete threadMetadata.replyTo;
    delete threadMetadata.replyToMessageId;
    delete threadMetadata.attachments;

    await MessageService.sendSharedMessage({
      family: thread?.family || 'marketplace',
      threadType: thread?.thread_type || thread?.threadType || 'marketplace_owner_request',
      ...(thread?.thread_key ? { threadKey: thread.thread_key } : {}),
      entityType: thread?.entity_type || 'marketplace_request',
      entityId: thread?.entity_id || threadMetadata.requestId || '',
      recipientUserId,
      recipientRole,
      senderRole,
      messageType: 'system_event',
      subject: thread?.subject || thread?.entity_name || tr('Marketplace request', 'Demande marketplace'),
      body,
      metadata: {
        ...threadMetadata,
        event,
        requestId: String(threadMetadata.requestId || thread?.entity_id || '').trim(),
        requestStatus,
        status: requestStatus,
        replyEnabled: ['approved', 'active', 'completed'].includes(String(requestStatus || '').toLowerCase()),
        ...(extraMetadata && typeof extraMetadata === 'object' ? extraMetadata : {}),
      },
    });
  };
  const handlePerformMarketplaceAction = async (thread, action, payload = {}) => {
    const requestId = resolveMarketplaceRequestId(thread, payload);
    if (!requestId || !user?.id) {
      throw new Error(tr('Booking thread is missing its request link.', 'Le fil de réservation n’a pas de lien de demande.'));
    }

    const otherParty = getOtherParty(thread, user?.id, tr);
    const recipientUserId = String(otherParty?.userId || '').trim();
    const recipientRole = String(otherParty?.role || (effectiveSenderRole === 'owner' ? 'customer' : 'owner')).trim() || (effectiveSenderRole === 'owner' ? 'customer' : 'owner');

    if (action === 'approve_request') {
      await BusinessMarketplaceService.acceptRequest(user.id, requestId, tr('Approved by owner.', 'Approuvée par le propriétaire.'));
      let nextThreads = await loadThreads({ silent: true });
      let approvedOwnerThread = findPreferredRequestThread(nextThreads, requestId, 'owner');

      if (!approvedOwnerThread || String(approvedOwnerThread?.thread_type || '').trim().toLowerCase() !== 'marketplace_owner_request') {
        const ownerResponse = await BusinessMarketplaceService.getOwnerRequests(user.id, 'all', { forceRefresh: true });
        const ownerRequest = (Array.isArray(ownerResponse?.requests) ? ownerResponse.requests : []).find(
          (request) => String(request?.id || '').trim() === requestId
        );

        if (ownerRequest) {
          await seedOwnerApprovedThreadForRequest(ownerRequest);
          nextThreads = await loadThreads({ silent: true });
          approvedOwnerThread = findPreferredRequestThread(nextThreads, requestId, 'owner');
        }
      }

      if (approvedOwnerThread?.thread_key) {
        const params = new URLSearchParams(location.search);
        params.set('requestId', requestId);
        params.set('threadKey', String(approvedOwnerThread.thread_key));
        navigate(`${location.pathname}?${params.toString()}`, { replace: true });
      }
      return;
    }

    if (action === 'decline_request') {
      const declineReason = String(payload?.message || '').trim();
      await BusinessMarketplaceService.declineRequest(user.id, requestId, declineReason);
      await loadThreads({ silent: true });
      return;
    }

    if (action === 'confirm_booking') {
      await CustomerExperienceService.confirmMarketplaceRequest(requestId);
      if (recipientUserId) {
        await sendMarketplaceTimelineMessage({
          thread,
          recipientUserId,
          recipientRole,
          senderRole: 'customer',
          body: tr('Booking confirmed', 'Réservation confirmée'),
          event: 'confirmed',
          requestStatus: 'approved',
          extraMetadata: {
            readOnlyReason: '',
          },
        });
      }
      await loadThreads({ silent: true });
      return;
    }

    throw new Error(tr('This booking action is not available in the thread.', "Cette action n’est pas disponible dans le fil."));
  };

  return (
    <div className="min-h-full bg-[linear-gradient(180deg,#f5f3ff_0%,#eef2ff_45%,#ffffff_100%)]">
      <main className={`mx-auto ${directConversationMode ? 'max-w-5xl px-0 py-0 sm:px-4 sm:py-4 lg:px-6' : 'max-w-7xl px-2.5 py-3 sm:px-6 sm:py-6 lg:px-8'} ${mobileConversationOpen ? 'space-y-3' : directConversationMode ? 'space-y-0' : 'space-y-4 sm:space-y-6'}`}>
        <section className={mobileConversationOpen ? 'space-y-3' : directConversationMode ? 'space-y-0' : 'space-y-4 sm:space-y-6'}>
          {!directConversationMode ? (
          <header className="space-y-3 px-0.5 sm:space-y-4 sm:px-1">
            {location.state?.from ? (
              <button
                type="button"
                onClick={() => navigate(backLink)}
                className="mb-3 inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-violet-200 hover:text-violet-700"
              >
                <ArrowLeft className="h-4 w-4" />
                {tr('Back', 'Retour')}
              </button>
            ) : null}
            <div className="relative z-[90] rounded-[22px] border border-violet-100/90 bg-white/92 px-3.5 py-3 shadow-[0_10px_24px_rgba(15,23,42,0.05)] sm:hidden">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-violet-500">
                      {inboxHeader.eyebrow}
                    </p>
                    <span className="inline-flex items-center rounded-full bg-violet-50 px-2.5 py-1 text-[10px] font-semibold text-violet-700 ring-1 ring-violet-100">
                      {tr(
                        `${inboxSectionSummary.unreadCount} unread`,
                        `${inboxSectionSummary.unreadCount} non lus`
                      )}
                    </span>
                  </div>
                  <h1 className="mt-2 truncate text-xl font-bold text-slate-950">
                    {inboxHeader.title}
                  </h1>
                </div>
                <div className="relative shrink-0">
                  <button
                    type="button"
                    onClick={() => setMobileHeaderMenuOpen((current) => !current)}
                    className="inline-flex h-10 items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 shadow-sm"
                    aria-expanded={mobileHeaderMenuOpen}
                  >
                    {tr('More', 'Plus')}
                    <ChevronDown className={`h-3.5 w-3.5 transition ${mobileHeaderMenuOpen ? 'rotate-180' : ''}`} />
                  </button>
                  {mobileHeaderMenuOpen ? (
                    <div className="absolute right-0 z-[140] mt-2 w-44 overflow-hidden rounded-2xl border border-slate-200 bg-white p-1.5 shadow-[0_22px_54px_rgba(15,23,42,0.22)]">
                      {inboxActionLinks.map((action) => (
                        <Link
                          key={action.key}
                          to={action.to}
                          onClick={() => setMobileHeaderMenuOpen(false)}
                          className="block rounded-xl px-3 py-2.5 text-sm font-bold text-slate-700 hover:bg-violet-50 hover:text-violet-700"
                        >
                          {action.label}
                        </Link>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="hidden rounded-[28px] border border-violet-100/90 bg-white/92 px-6 py-5 shadow-[0_12px_28px_rgba(15,23,42,0.05)] sm:block">
              <div className="flex flex-col gap-3 sm:gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-violet-500">
                      {inboxHeader.eyebrow}
                    </p>
                    <span className="inline-flex items-center rounded-full bg-violet-50 px-3 py-1 text-[11px] font-semibold text-violet-700 ring-1 ring-violet-100">
                      {tr(
                        `${inboxSectionSummary.unreadCount} unread`,
                        `${inboxSectionSummary.unreadCount} non lus`
                      )}
                    </span>
                  </div>
                  <h1 className="mt-2 text-xl font-bold text-slate-950">
                    {inboxHeader.title}
                  </h1>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    {inboxHeader.description}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 lg:justify-end">
                  {inboxActionLinks.map((action) => (
                    <Link
                      key={action.key}
                      to={action.to}
                      className="inline-flex items-center justify-center rounded-full border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-violet-200 hover:text-violet-700"
                    >
                      {action.label}
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          </header>
          ) : null}

          <div>
            <SharedInboxWorkspace
              key={workspaceRenderKey}
              {...messageExperience}
              threads={threads}
              loading={loading}
              error={error}
              busyThreadKey={busyThreadKey}
              initialSelectedThreadKey={initialSelectedThreadKey}
              initialSelectedRequestId={requestedBookingId}
              initialInboxLane={initialInboxLane}
              currentUserId={user?.id}
              currentUserLabel={currentUserLabel}
              currentUserAvatarUrl={currentUserAvatarUrl}
              currentSenderRole={effectiveSenderRole}
              activeMode={effectiveSenderRole === 'owner' ? 'owner' : 'customer'}
              contextCounts={{ verification: verificationCount }}
              isFrench={isFrench}
              tr={tr}
              showContextTabs={false}
              showSearch={!directConversationMode}
              showListFilters={!directConversationMode}
              groupThreads={!directConversationMode}
              threadGroupingMode="transaction_hub"
              laneModel="account"
              directThreadMode={directConversationMode}
              workspaceContext={effectiveSenderRole === 'owner' ? 'owner' : 'customer'}
              onMobileConversationStateChange={setMobileConversationOpen}
              onExitDirectThreadMode={({ thread, preferredInboxLane } = {}) => {
                const preferredLane = String(preferredInboxLane || '').trim().toLowerCase();
                const returnOrigin = String(location.state?.from || '').trim() || `${location.pathname}${location.search}${location.hash}`;
                const nextSearch = preferredLane ? `?lane=${encodeURIComponent(preferredLane)}` : '';
                navigate({
                  pathname: '/account/messages',
                  search: nextSearch,
                }, {
                  replace: false,
                  state: {
                    from: returnOrigin,
                  },
                });
              }}
              onRefresh={() => loadThreads()}
              onSupportAction={handleOpenSupportThread}
              onOpenContext={(thread) => {
                const threadKey = String(thread?.thread_key || thread?.id || '').trim();
                const returnParams = new URLSearchParams(location.search);
                if (threadKey) {
                  returnParams.set('threadKey', threadKey);
                }
                const target = resolveThreadContextTarget(thread, {
                  workspace: 'account',
                  senderRole: effectiveSenderRole,
                  fallbackHref: '/account/messages',
                });
                if (!target?.href) return;

                if (target.requestId) {
                  returnParams.set('requestId', target.requestId);
                }
                if (target.context === 'marketplace_request' && String(target.href).includes('action=confirm')) {
                  returnParams.set('action', 'confirm');
                }

                const returnSearch = returnParams.toString();
                const returnPath = `${location.pathname}${returnSearch ? `?${returnSearch}` : ''}${location.hash}`;
                navigate(target.href, {
                  state: {
                    from: returnPath,
                  },
                });
              }}
              onMarkThreadRead={async (thread) => {
                const threadKey = String(thread?.thread_key || '').trim();
                if (!threadKey) return;
                await MessageService.markSharedThreadRead(threadKey);
                await loadThreads({ silent: true });
              }}
              onSendReply={async ({ thread, body, recipientUserId, recipientRole, senderRole, messageType, metadata = {}, attachments = [] }) => {
                const threadMetadata = thread?.metadata && typeof thread.metadata === 'object' ? { ...thread.metadata } : {};
                delete threadMetadata.replyTo;
                delete threadMetadata.replyToMessageId;
                delete threadMetadata.attachments;
                const response = await MessageService.sendSharedMessage({
                  family: thread.family,
                  threadType: thread.thread_type,
                  threadKey: thread.thread_key,
                  entityType: thread.entity_type || 'conversation',
                  entityId: thread.entity_id || thread.thread_key,
                  recipientUserId,
                  recipientRole,
                  senderRole,
                  messageType: messageType || 'note',
                  subject: thread.subject || '',
                  body,
                  attachments,
                  metadata: {
                    ...threadMetadata,
                    ...(metadata && typeof metadata === 'object' ? metadata : {}),
                  },
                });
                void loadThreads({ silent: true });
                return response;
              }}
              onPerformMarketplaceAction={handlePerformMarketplaceAction}
              emptyTitle={emptyStateConfig.title}
              emptyDescription={emptyStateConfig.description}
              emptyActionLabel={emptyStateConfig.actionLabel}
              emptyActionTo={emptyStateConfig.actionTo}
              emptyActionState={{ from: location.pathname + location.search + location.hash }}
            />
          </div>
        </section>
      </main>
    </div>
  );
};

export default AccountMessages;
