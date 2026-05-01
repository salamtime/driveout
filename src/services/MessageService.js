import { adminApiRequest } from './adminApi';
import { supabase } from './supabaseClient';
import {
  createMessageThread,
  MESSAGE_FAMILIES,
} from '../utils/messageCenter';
import {
  getMarketplaceRequestDisplay,
  isMarketplaceChatUnlocked,
  normalizeMarketplaceRequestLifecycleStatus,
} from '../utils/marketplaceRequestState';

const THREAD_SUBTITLE_FALLBACKS = {
  [MESSAGE_FAMILIES.verification]: 'Verification and trust',
  [MESSAGE_FAMILIES.bookings]: 'Booking thread',
  [MESSAGE_FAMILIES.tours]: 'Tour thread',
  [MESSAGE_FAMILIES.marketplace]: 'Marketplace thread',
  [MESSAGE_FAMILIES.accountTrust]: 'Account and trust',
  [MESSAGE_FAMILIES.support]: 'Support thread',
};

const normalizeVerificationStatus = (value = '') => {
  const normalized = String(value || '').trim().toLowerCase();
  if (['approved', 'pending', 'rejected', 'suspended', 'expired', 'needs_info', 'needs_changes'].includes(normalized)) {
    return normalized;
  }
  return 'pending';
};

const getVerificationStatusLabel = (status = 'pending') => {
  if (status === 'approved') return 'Verified';
  if (status === 'rejected' || status === 'needs_info' || status === 'needs_changes') return 'Needs changes';
  if (status === 'suspended') return 'Suspended';
  if (status === 'expired') return 'Expired';
  return 'Pending review';
};

const getVerificationStatusTone = (status = 'pending') => {
  if (status === 'approved') return 'success';
  if (status === 'rejected' || status === 'needs_info' || status === 'needs_changes') return 'warning';
  if (status === 'suspended' || status === 'expired') return 'danger';
  return 'pending';
};

const getVerificationTypeDisplay = (verificationType = '') => {
  const normalized = String(verificationType || '').trim().toLowerCase();
  if (normalized === 'driver_license') return 'Driver license';
  if (normalized === 'profile_id') return 'ID / Passport';
  if (normalized === 'vehicle_registration') return 'Vehicle registration';
  if (normalized === 'vehicle_insurance') return 'Vehicle insurance';
  return 'Verification document';
};

const mapStatusTone = (status) => {
  const normalized = String(status || '').trim().toLowerCase();
  if (normalized === 'read') return 'neutral';
  if (normalized === 'sent') return 'pending';
  return 'neutral';
};

const buildVerificationThreadTitle = (thread = {}) => {
  const metadata = thread?.metadata && typeof thread.metadata === 'object' ? thread.metadata : {};
  return metadata.reviewTitle || 'Verification review';
};

const buildSharedThreadTitle = (thread = {}) => {
  if (thread.family === MESSAGE_FAMILIES.verification) {
    return buildVerificationThreadTitle(thread);
  }

  return thread.subject || thread.sender_email || thread.sender_name || 'Message thread';
};

const buildSharedThreadSubtitle = (thread = {}) => {
  if (thread.family === MESSAGE_FAMILIES.verification) {
    const metadata = thread?.metadata && typeof thread.metadata === 'object' ? thread.metadata : {};
    const documentTypes = Array.isArray(metadata.documentTypes) ? metadata.documentTypes.filter(Boolean) : [];
    if (documentTypes.length > 1) {
      return documentTypes
        .slice(0, 2)
        .map((type) => getVerificationTypeDisplay(type))
        .join(' + ');
    }
    return getVerificationTypeDisplay(documentTypes[0] || metadata.verificationType || metadata.documentType || '');
  }

  return (
    thread.recipient_email ||
    thread.recipient_name ||
    THREAD_SUBTITLE_FALLBACKS[thread.family] ||
    'Shared message'
  );
};

const buildSharedThreadSummary = (thread = {}) => {
  if (thread.family === MESSAGE_FAMILIES.verification) {
    return 'Verification feedback and document status stay together in this thread.';
  }

  return 'This thread is stored in the shared message layer and stays linked to its source context.';
};

const getCurrentWorkspaceRoutePrefix = () => {
  if (typeof window === 'undefined') return '/account';
  const pathname = String(window.location.pathname || '').trim().toLowerCase();
  return pathname.startsWith('/admin') || pathname.startsWith('/guide') ? '/admin' : '/account';
};

const buildThreadHref = (thread = {}) => {
  const metadata = thread?.metadata && typeof thread.metadata === 'object' ? thread.metadata : {};
  if (metadata.href) return String(metadata.href);

  const routePrefix = getCurrentWorkspaceRoutePrefix();

  if (thread.family === MESSAGE_FAMILIES.verification) return '/account/verification';
  if (thread.family === MESSAGE_FAMILIES.bookings && thread.entity_id) return `${routePrefix}/rentals/${encodeURIComponent(String(thread.entity_id))}`;
  if (thread.family === MESSAGE_FAMILIES.tours && thread.entity_id) return `/account/tours/${encodeURIComponent(String(thread.entity_id))}`;
  if (thread.family === MESSAGE_FAMILIES.marketplace && thread.entity_id) {
    return `/account/rentals/requests/${encodeURIComponent(String(thread.entity_id))}`;
  }
  if (thread.family === MESSAGE_FAMILIES.marketplace) return '/account/marketplace';
  return '/account/messages';
};

const recoverMarketplaceRequestId = (thread = {}, metadata = {}) => {
  const directRequestId = String(
    metadata.requestId ||
    metadata.bookingReference ||
    thread?.entity_id ||
    ''
  ).trim();
  if (directRequestId) return directRequestId;

  const href = String(metadata.href || '').trim();
  const hrefMatch = href.match(/\/account\/rentals\/requests\/([^/?#]+)/i);
  if (hrefMatch?.[1]) {
    return decodeURIComponent(hrefMatch[1]);
  }

  const searchPool = [
    metadata.reference,
    metadata.bookingLink,
    thread?.latest_message,
    thread?.subject,
  ]
    .map((value) => String(value || '').trim())
    .filter(Boolean);

  for (const value of searchPool) {
    const match = value.match(/\/account\/rentals\/requests\/([^/?#\s]+)/i);
    if (match?.[1]) {
      return decodeURIComponent(match[1]);
    }
  }

  return '';
};

export const normalizeSharedThread = (thread = {}) =>
  {
    const metadata = thread.metadata && typeof thread.metadata === 'object' ? { ...thread.metadata } : {};
    let statusLabel = thread.unread_count > 0 ? 'Unread' : String(thread.status || '').replace(/_/g, ' ');
    let statusTone = thread.unread_count > 0 ? 'pending' : mapStatusTone(thread.status);

    if (thread.family === MESSAGE_FAMILIES.marketplace) {
      const lifecycleStatus = normalizeMarketplaceRequestLifecycleStatus(
        metadata.requestStatus || metadata.status || thread.status
      );
      const displayState = getMarketplaceRequestDisplay(lifecycleStatus);
      const recoveredRequestId = recoverMarketplaceRequestId(thread, metadata);
      if (recoveredRequestId) {
        metadata.requestId = recoveredRequestId;
      }
      metadata.type = metadata.type || 'marketplace_request';
      metadata.integrity = recoveredRequestId ? 'linked' : 'legacy_unlinked';
      metadata.legacy_unlinked = !recoveredRequestId;
      metadata.requestStatus = lifecycleStatus;
      metadata.replyEnabled = metadata.replyEnabled === true || isMarketplaceChatUnlocked(lifecycleStatus);
      if (!metadata.replyEnabled && displayState.readOnlyReason) {
        metadata.readOnlyReason = metadata.readOnlyReason || displayState.readOnlyReason;
      }
    }
    if (thread.family === MESSAGE_FAMILIES.verification) {
      const verificationStatus = normalizeVerificationStatus(
        metadata.verificationStatus ||
        metadata.status ||
        thread.status
      );
      metadata.type = 'verification';
      metadata.verificationStatus = verificationStatus;
      metadata.reviewTitle = metadata.reviewTitle || 'Verification review';
      statusLabel = getVerificationStatusLabel(verificationStatus);
      statusTone = getVerificationStatusTone(verificationStatus);
    }

    return {
    ...createMessageThread({
    id: thread.thread_key || thread.id,
    family: thread.family,
    threadType: thread.thread_type,
    senderRole: thread.sender_role,
    title: buildSharedThreadTitle(thread),
    subtitle: buildSharedThreadSubtitle(thread),
    summary: buildSharedThreadSummary(thread),
    latestMessage: thread.latest_message || '',
    statusLabel,
    statusTone,
    href: buildThreadHref(thread),
    at: thread.latest_message_at || null,
    unread: Number(thread.unread_count || 0) > 0,
    metadata: {
      ...metadata,
      isSharedThread: true,
      threadKey: thread.thread_key || '',
      messageCount: Number(thread.message_count || 0),
    },
    }),
    type: metadata.type || (thread.family === MESSAGE_FAMILIES.verification ? 'verification' : ''),
    entity_id: thread.entity_id || null,
    entity_type: thread.entity_type || null,
    thread_key: thread.thread_key || '',
    thread_row_id: thread.thread_row_id || null,
    context_type: thread.context_type || null,
    context_id: thread.context_id || null,
    workflow_status: thread.workflow_status || null,
    visibility_scope: thread.visibility_scope || null,
    timeline_events: Array.isArray(thread.timeline_events) ? thread.timeline_events : [],
    };
  };

export const listSharedThreads = async (filters = {}) => {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      params.set(key, value);
    }
  });

  const query = params.toString();
  return adminApiRequest(`/api/messages${query ? `?${query}` : ''}`);
};

export const getThreadByContext = async ({
  contextType = '',
  contextId = '',
  threadType = '',
  threadKey = '',
  limit = 120,
} = {}) => {
  const normalizedThreadKey = String(threadKey || '').trim();
  const normalizedContextType = String(contextType || '').trim().toLowerCase();
  const normalizedContextId = String(contextId || '').trim();
  const normalizedThreadType = String(threadType || '').trim().toLowerCase();

  if (!normalizedThreadKey && (!normalizedContextType || !normalizedContextId)) {
    return { thread: null, threads: [] };
  }

  const fetchThreads = async (includeThreadType = true) => {
    const response = await listSharedThreads({
      ...(normalizedThreadKey ? { threadKey: normalizedThreadKey } : {}),
      ...(!normalizedThreadKey && normalizedContextType ? { contextType: normalizedContextType } : {}),
      ...(!normalizedThreadKey && normalizedContextId ? { contextId: normalizedContextId } : {}),
      ...(includeThreadType && normalizedThreadType ? { threadType: normalizedThreadType } : {}),
      limit,
    });

    return Array.isArray(response?.threads) ? response.threads : [];
  };

  let threads = await fetchThreads(true);
  if (!threads.length && !normalizedThreadKey && normalizedThreadType) {
    threads = await fetchThreads(false);
  }

  const preferredThread = normalizedThreadKey
    ? threads.find((thread) => String(thread?.thread_key || thread?.id || '').trim() === normalizedThreadKey) || null
    : threads.find((thread) => (
      String(thread?.context_type || '').trim().toLowerCase() === normalizedContextType
        && String(thread?.context_id || '').trim() === normalizedContextId
        && (!normalizedThreadType || String(thread?.thread_type || '').trim().toLowerCase() === normalizedThreadType)
    )) || threads.find((thread) => (
      String(thread?.context_type || '').trim().toLowerCase() === normalizedContextType
        && String(thread?.context_id || '').trim() === normalizedContextId
    )) || threads[0] || null;

  return {
    thread: preferredThread,
    threads,
  };
};

export const ensureThreadByContext = async ({
  contextType = '',
  contextId = '',
  family = '',
  threadType = '',
  senderRole = '',
  waitingOn = '',
  priority = 'normal',
} = {}) =>
  adminApiRequest('/api/messages?action=ensure-thread', {
    method: 'PATCH',
    body: JSON.stringify({
      contextType,
      contextId,
      family,
      threadType,
      senderRole,
      waitingOn,
      priority,
    }),
  });

export const sendSharedMessage = async (payload) =>
  adminApiRequest('/api/messages', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

export const markSharedThreadRead = async (threadKey) =>
  adminApiRequest('/api/messages?action=mark-read', {
    method: 'PATCH',
    body: JSON.stringify({ threadKey }),
  });

export const archiveSharedThread = async (threadKey) =>
  adminApiRequest('/api/messages?action=archive-thread', {
    method: 'PATCH',
    body: JSON.stringify({ threadKey }),
  });

export const deleteSharedThread = async (threadKey) =>
  adminApiRequest('/api/messages?action=delete-thread', {
    method: 'PATCH',
    body: JSON.stringify({ threadKey }),
  });

export const restoreSharedThread = async (threadKey) =>
  adminApiRequest('/api/messages?action=restore-thread', {
    method: 'PATCH',
    body: JSON.stringify({ threadKey }),
  });

export const updateSharedThreadState = async (threadKey, payload = {}) =>
  adminApiRequest('/api/messages?action=update-thread-state', {
    method: 'PATCH',
    body: JSON.stringify({
      threadKey,
      ...payload,
    }),
  });

export const deleteSharedMessage = async (messageId, payload = {}) =>
  adminApiRequest('/api/messages?action=delete-message', {
    method: 'PATCH',
    body: JSON.stringify({
      messageId,
      ...payload,
    }),
  });

export const subscribeSharedMessages = ({
  userId = '',
  isAdmin = false,
  onChange,
} = {}) => {
  if (typeof onChange !== 'function') {
    return () => {};
  }

  const normalizedUserId = String(userId || '').trim();
  const channelName = `shared-messages-${isAdmin ? 'admin' : normalizedUserId || 'guest'}-${Date.now()}`;

  const channel = supabase
    .channel(channelName)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'shared_messages',
      },
      (payload) => {
        const nextRow = payload?.new || {};
        const previousRow = payload?.old || {};
        const senderUserId = String(nextRow.sender_user_id || previousRow.sender_user_id || '').trim();
        const recipientUserId = String(nextRow.recipient_user_id || previousRow.recipient_user_id || '').trim();

        if (isAdmin || (normalizedUserId && [senderUserId, recipientUserId].includes(normalizedUserId))) {
          onChange(payload);
        }
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
};

export const subscribeThreadTyping = ({
  threadKey = '',
  userId = '',
  userLabel = '',
  userRole = '',
  onChange,
} = {}) => {
  const normalizedThreadKey = String(threadKey || '').trim();
  const normalizedUserId = String(userId || '').trim();
  if (!normalizedThreadKey || !normalizedUserId || typeof onChange !== 'function') {
    return {
      setTyping: async () => {},
      unsubscribe: () => {},
    };
  }

  const presenceKey = `${normalizedUserId}-${Date.now()}`;
  const channel = supabase.channel(`shared-typing-${normalizedThreadKey}`, {
    config: {
      presence: {
        key: presenceKey,
      },
    },
  });

  const emitState = () => {
    const state = channel.presenceState();
    const entries = Object.entries(state).flatMap(([entryKey, value]) =>
      (value || []).map((item) => ({
        presenceKey: entryKey,
        ...item,
      }))
    );
    const visibleUsers = entries.filter(
      (entry) => String(entry?.userId || '').trim() !== normalizedUserId
    );
    onChange(visibleUsers);
  };

  channel
    .on('presence', { event: 'sync' }, emitState)
    .subscribe(async (status) => {
      if (status !== 'SUBSCRIBED') return;
      await channel.track({
        presenceKey,
        userId: normalizedUserId,
        name: String(userLabel || '').trim() || 'User',
        role: String(userRole || '').trim() || null,
        active: true,
        typing: false,
        updatedAt: new Date().toISOString(),
      });
    });

  return {
    setTyping: async (typing = false) => {
      await channel.track({
        presenceKey,
        userId: normalizedUserId,
        name: String(userLabel || '').trim() || 'User',
        role: String(userRole || '').trim() || null,
        active: true,
        typing: Boolean(typing),
        updatedAt: new Date().toISOString(),
      });
    },
    unsubscribe: () => {
      channel.untrack();
      channel.unsubscribe();
    },
  };
};

let workspacePresenceChannel = null;
let workspacePresenceChannelPromise = null;
let workspacePresenceListeners = new Set();
let workspacePresencePublisherCount = 0;
let workspacePresenceHeartbeatTimer = null;
let workspacePresencePublisherPayloadBuilder = null;
let workspacePresenceFocusHandlerBound = false;

const emitWorkspacePresenceState = () => {
  if (!workspacePresenceChannel) return;
  const state = workspacePresenceChannel.presenceState();
  const entries = Object.entries(state).flatMap(([entryKey, value]) =>
    (value || []).map((item) => ({
      presenceKey: entryKey,
      ...item,
    }))
  );
  workspacePresenceListeners.forEach((listener) => {
    try {
      listener(entries);
    } catch {
      // Ignore listener errors so one bad subscriber does not break presence.
    }
  });
};

const bindWorkspacePresenceFocusHandlers = () => {
  if (workspacePresenceFocusHandlerBound || typeof window === 'undefined') return;
  const rebroadcast = () => {
    if (typeof workspacePresencePublisherPayloadBuilder === 'function') {
      void trackWorkspacePresence();
    }
  };
  window.addEventListener('focus', rebroadcast);
  document.addEventListener('visibilitychange', rebroadcast);
  workspacePresenceFocusHandlerBound = true;
};

const ensureWorkspacePresenceChannel = async () => {
  if (workspacePresenceChannel) return workspacePresenceChannel;
  if (workspacePresenceChannelPromise) return workspacePresenceChannelPromise;

  workspacePresenceChannelPromise = new Promise((resolve) => {
    const channel = supabase.channel('workspace-presence-global', {
      config: {
        presence: {
          key: `workspace-global-${Date.now()}`,
        },
      },
    });

    channel
      .on('presence', { event: 'sync' }, emitWorkspacePresenceState)
      .on('presence', { event: 'join' }, emitWorkspacePresenceState)
      .on('presence', { event: 'leave' }, emitWorkspacePresenceState)
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          workspacePresenceChannel = channel;
          emitWorkspacePresenceState();
          resolve(channel);
        }
      });
  });

  return workspacePresenceChannelPromise;
};

const trackWorkspacePresence = async () => {
  if (!workspacePresencePublisherPayloadBuilder) return;
  const channel = await ensureWorkspacePresenceChannel();
  try {
    await channel.track(workspacePresencePublisherPayloadBuilder());
  } catch {
    // Ignore transient realtime presence publish failures.
  }
};

export const startWorkspacePresence = ({
  userId = '',
  userLabel = '',
  userRole = '',
  pagePath = '',
} = {}) => {
  const normalizedUserId = String(userId || '').trim();
  if (!normalizedUserId) {
    return () => {};
  }

  const presenceKey = `workspace-${normalizedUserId}-${Date.now()}`;

  const buildPayload = () => ({
    presenceKey,
    userId: normalizedUserId,
    name: String(userLabel || '').trim() || 'User',
    role: String(userRole || '').trim() || null,
    // "Online" in this app means the workspace is open, even if this specific
    // tab/window is not the focused one right now.
    active: true,
    visible:
      typeof document === 'undefined'
        ? true
        : document.visibilityState !== 'hidden',
    pagePath: String(pagePath || '').trim() || null,
    updatedAt: new Date().toISOString(),
  });

  workspacePresencePublisherCount += 1;
  workspacePresencePublisherPayloadBuilder = buildPayload;
  bindWorkspacePresenceFocusHandlers();

  void ensureWorkspacePresenceChannel().then(() => {
    void trackWorkspacePresence();
  });

  if (!workspacePresenceHeartbeatTimer && typeof window !== 'undefined') {
    workspacePresenceHeartbeatTimer = window.setInterval(() => {
      void trackWorkspacePresence();
    }, 25000);
  }

  return () => {
    workspacePresencePublisherCount = Math.max(0, workspacePresencePublisherCount - 1);
    if (workspacePresencePublisherCount === 0) {
      workspacePresencePublisherPayloadBuilder = null;
      if (workspacePresenceHeartbeatTimer && typeof window !== 'undefined') {
        window.clearInterval(workspacePresenceHeartbeatTimer);
        workspacePresenceHeartbeatTimer = null;
      }
      if (workspacePresenceChannel) {
        workspacePresenceChannel.untrack();
      }
    }
  };
};

export const subscribeWorkspacePresence = ({
  currentUserId = '',
  targetUserId = '',
  onChange,
} = {}) => {
  const normalizedTargetUserId = String(targetUserId || '').trim();
  if (!normalizedTargetUserId || typeof onChange !== 'function') {
    return () => {};
  }

  const emitState = () => {
    onChange(
      (workspacePresenceChannel
        ? Object.entries(workspacePresenceChannel.presenceState()).flatMap(([entryKey, value]) =>
            (value || []).map((item) => ({
              presenceKey: entryKey,
              ...item,
            }))
          )
        : []
      ).filter((entry) => String(entry?.userId || '').trim() === normalizedTargetUserId)
    );
  };

  const listener = (entries = []) => {
    onChange(
      entries.filter((entry) => String(entry?.userId || '').trim() === normalizedTargetUserId)
    );
  };

  workspacePresenceListeners.add(listener);
  void ensureWorkspacePresenceChannel().then(() => {
    emitState();
  });

  return () => {
    workspacePresenceListeners.delete(listener);
    onChange([]);
  };
};

export const subscribeWorkspacePresenceList = ({
  targetUserIds = [],
  onChange,
} = {}) => {
  const normalizedTargetIds = [...new Set(
    (Array.isArray(targetUserIds) ? targetUserIds : [])
      .map((value) => String(value || '').trim())
      .filter(Boolean)
  )];

  if (!normalizedTargetIds.length || typeof onChange !== 'function') {
    return () => {};
  }

  const targetIdSet = new Set(normalizedTargetIds);

  const emitState = () => {
    onChange(
      (workspacePresenceChannel
        ? Object.entries(workspacePresenceChannel.presenceState()).flatMap(([entryKey, value]) =>
            (value || []).map((item) => ({
              presenceKey: entryKey,
              ...item,
            }))
          )
        : []
      ).filter((entry) => targetIdSet.has(String(entry?.userId || '').trim()))
    );
  };

  const listener = (entries = []) => {
    onChange(
      entries.filter((entry) => targetIdSet.has(String(entry?.userId || '').trim()))
    );
  };

  workspacePresenceListeners.add(listener);
  void ensureWorkspacePresenceChannel().then(() => {
    emitState();
  });

  return () => {
    workspacePresenceListeners.delete(listener);
    onChange([]);
  };
};

export default {
  listSharedThreads,
  getThreadByContext,
  ensureThreadByContext,
  sendSharedMessage,
  markSharedThreadRead,
  archiveSharedThread,
  deleteSharedThread,
  restoreSharedThread,
  updateSharedThreadState,
  deleteSharedMessage,
  subscribeSharedMessages,
  subscribeThreadTyping,
  startWorkspacePresence,
  subscribeWorkspacePresence,
  subscribeWorkspacePresenceList,
  normalizeSharedThread,
};
