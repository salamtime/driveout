import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, MessageSquareMore, Minus, RefreshCw, X } from 'lucide-react';
import toast from 'react-hot-toast';
import ConversationThread from './ConversationThread';
import MessageService from '../../services/MessageService';
import { getOtherParty, getThreadRoleContext } from './threadHelpers';

const buildToastPreview = (value, fallback) => {
  const normalized = String(value || '').replace(/\s+/g, ' ').trim();
  if (!normalized) return fallback;
  return normalized.length > 96 ? `${normalized.slice(0, 93)}...` : normalized;
};

const normalizeStaffRole = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (['org_owner', 'organization_owner', 'operator', 'business', 'rental_business'].includes(normalized)) return 'business_owner';
  if (normalized.includes('guide')) return 'guide';
  if (normalized.includes('employee')) return 'employee';
  if (normalized.includes('staff')) return 'staff';
  if (normalized.includes('admin')) return 'admin';
  if (normalized.includes('owner')) return 'owner';
  if (normalized.includes('support')) return 'support';
  return normalized;
};

const getRoleLabel = (role, tr) => {
  const normalized = normalizeStaffRole(role);
  if (normalized === 'owner' || normalized === 'business_owner') return tr('Owner', 'Propriétaire');
  if (normalized === 'admin') return tr('Admin', 'Admin');
  if (normalized === 'employee' || normalized === 'staff') return tr('Employee', 'Employé');
  if (normalized === 'guide') return tr('Guide', 'Guide');
  if (normalized === 'support') return tr('Support', 'Support');
  return String(role || '').trim() || tr('Staff', 'Personnel');
};

const claimIncomingToast = (toastKey) => {
  if (typeof window === 'undefined') return true;
  const normalizedKey = String(toastKey || '').trim();
  if (!normalizedKey) return false;

  const registry = window.__sxIncomingMessageToasts || new Map();
  window.__sxIncomingMessageToasts = registry;
  const now = Date.now();

  for (const [key, timestamp] of registry.entries()) {
    if (now - Number(timestamp || 0) > 8000) {
      registry.delete(key);
    }
  }

  if (registry.has(normalizedKey)) {
    return false;
  }

  registry.set(normalizedKey, now);
  return true;
};

const createDraftThread = ({
  threadId,
  family,
  threadType,
  contextType,
  contextId,
  contextTitle,
  href,
  adminHref,
  metadata,
}) => ({
  id: threadId || [family, threadType, contextType, contextId].filter(Boolean).join(':'),
  thread_key: threadId || '',
  family: family || 'support',
  thread_type: threadType || 'support_case',
  entity_type: contextType || 'conversation',
  entity_id: contextId || '',
  subject: contextTitle || 'Context conversation',
  latest_message: '',
  latest_message_at: null,
  unread_count: 0,
  resolved_at: null,
  metadata: {
    href: href || '',
    adminHref: adminHref || '',
    ...(metadata && typeof metadata === 'object' ? metadata : {}),
  },
  messages: [],
});

const pickContextThread = ({ threads, threadId, threadType, currentSenderRole }) => {
  const safeThreads = Array.isArray(threads) ? threads : [];
  if (threadId) {
    return safeThreads.find((thread) => String(thread?.thread_key || thread?.id || '') === String(threadId)) || null;
  }
  if (threadType) {
    const exactTypeMatch = safeThreads.find((thread) => String(thread?.thread_type || '').trim().toLowerCase() === String(threadType).trim().toLowerCase());
    if (exactTypeMatch) return exactTypeMatch;
  }
  if (currentSenderRole) {
    const preferredRoleContext = String(currentSenderRole || '').trim().toLowerCase() === 'owner' ? 'owner' : 'customer';
    const roleContextMatch = safeThreads.find((thread) => getThreadRoleContext(thread, currentSenderRole) === preferredRoleContext);
    if (roleContextMatch) return roleContextMatch;
  }
  return safeThreads[0] || null;
};

const fillMissingThreadMetadata = (baseMetadata = {}, fallbackMetadata = {}) => {
  const nextMetadata = {
    ...(fallbackMetadata && typeof fallbackMetadata === 'object' ? fallbackMetadata : {}),
    ...(baseMetadata && typeof baseMetadata === 'object' ? baseMetadata : {}),
  };

  Object.entries(fallbackMetadata && typeof fallbackMetadata === 'object' ? fallbackMetadata : {}).forEach(([key, value]) => {
    const currentValue = nextMetadata[key];
    const missingCurrentValue = (
      currentValue === undefined ||
      currentValue === null ||
      (typeof currentValue === 'string' && !String(currentValue).trim())
    );

    if (missingCurrentValue) {
      nextMetadata[key] = value;
    }
  });

  return nextMetadata;
};

const hydrateThreadFromSeed = (candidateThread, seedThread) => {
  if (!candidateThread) return candidateThread;
  if (!seedThread || typeof seedThread !== 'object') return candidateThread;

  const candidateMetadata = candidateThread?.metadata && typeof candidateThread.metadata === 'object'
    ? candidateThread.metadata
    : {};
  const seedMetadata = seedThread?.metadata && typeof seedThread.metadata === 'object'
    ? seedThread.metadata
    : {};

  return {
    ...candidateThread,
    family: candidateThread?.family || seedThread?.family || '',
    thread_type: candidateThread?.thread_type || seedThread?.thread_type || '',
    entity_type: candidateThread?.entity_type || seedThread?.entity_type || '',
    entity_id: candidateThread?.entity_id || seedThread?.entity_id || '',
    subject: candidateThread?.subject || seedThread?.subject || '',
    metadata: fillMissingThreadMetadata(candidateMetadata, seedMetadata),
  };
};

const isPayloadRelevantToWidget = ({
  payload,
  threadId,
  activeThreadKey,
  contextType,
  contextId,
  threadType,
}) => {
  const row = payload?.new || payload?.old || {};
  const payloadThreadKey = String(row?.thread_key || '').trim();
  const payloadEntityType = String(row?.entity_type || '').trim().toLowerCase();
  const payloadEntityId = String(row?.entity_id || '').trim();
  const payloadThreadType = String(row?.thread_type || '').trim().toLowerCase();

  const candidateThreadKeys = [threadId, activeThreadKey]
    .map((value) => String(value || '').trim())
    .filter(Boolean);

  if (payloadThreadKey && candidateThreadKeys.includes(payloadThreadKey)) {
    return true;
  }

  if (
    contextType &&
    contextId &&
    payloadEntityType === String(contextType || '').trim().toLowerCase() &&
    payloadEntityId === String(contextId || '').trim()
  ) {
    if (!threadType) return true;
    return payloadThreadType === String(threadType || '').trim().toLowerCase();
  }

  return false;
};

const MessageWidget = ({
  threadId = '',
  contextType = '',
  contextId = '',
  contextLabel = '',
  contextTitle = '',
  contextSubtitle = '',
  contextStatus = '',
  family = 'support',
  threadType = 'support_case',
  currentUserId = '',
  currentUserLabel = '',
  currentSenderRole = 'customer',
  isFrench = false,
  tr,
  isAdmin = false,
  fallbackTimelineEvents = [],
  allowInternalNotes = false,
  allowThreadStateControls = false,
  seedThread = null,
  threadContextData = null,
  replyTarget = null,
  listingSetupProgress = null,
  onPerformMarketplaceAction = null,
  openRequestSignal = 0,
  forceLauncherVisible = false,
  onDismissLauncher = null,
  onOpenStateChange = null,
  unreadBadgeCount = null,
  showLauncherWhenUnread = true,
  compactLauncher = false,
  reserveFloatingCorner = true,
  className = '',
  drawerWidthClassName = 'xl:w-[min(100vw-1.5rem,26rem)] xl:max-w-[27rem]',
}) => {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [thread, setThread] = useState(null);
  const [resolvedThreadKeyOverride, setResolvedThreadKeyOverride] = useState('');
  const [busyThreadKey, setBusyThreadKey] = useState('');
  const [initialized, setInitialized] = useState(false);
  const [presenceEntries, setPresenceEntries] = useState([]);
  const reloadTimerRef = useRef(null);
  const openRefreshIntervalRef = useRef(null);
  const lastToastMessageRef = useRef('');
  const bodyScrollRestoreRef = useRef(null);
  const isRentalWidget = family === 'bookings' && (threadType === 'rental_booking' || contextType === 'rental');
  const isListingModerationWidget = family === 'marketplace' && (
    String(threadType || '').trim().toLowerCase() === 'marketplace_moderation' ||
    String(contextType || '').trim().toLowerCase() === 'listing'
  );
  const normalizedFallbackTimelineEvents = useMemo(
    () => (Array.isArray(fallbackTimelineEvents) ? fallbackTimelineEvents : []),
    [fallbackTimelineEvents]
  );

  const applyFallbackTimelineEvents = useMemo(
    () => (candidateThread) => {
      if (!candidateThread) return candidateThread;
      const hydratedThread = hydrateThreadFromSeed(candidateThread, seedThread);
      const existingEvents = Array.isArray(hydratedThread?.timeline_events) ? hydratedThread.timeline_events : [];
      if (existingEvents.length || !normalizedFallbackTimelineEvents.length) {
        return hydratedThread;
      }
      return {
        ...hydratedThread,
        timeline_events: normalizedFallbackTimelineEvents,
      };
    },
    [normalizedFallbackTimelineEvents, seedThread]
  );

  const resolvedDraftThread = useMemo(() => (
    seedThread || (
      isRentalWidget
        ? null
        : createDraftThread({
            threadId,
            family,
            threadType,
            contextType,
            contextId,
            contextTitle,
          })
    )
  ), [seedThread, isRentalWidget, threadId, family, threadType, contextType, contextId, contextTitle]);

  useEffect(() => {
    if (typeof onOpenStateChange === 'function') {
      onOpenStateChange(open);
    }
  }, [open, onOpenStateChange]);

  const resolvedThread = thread || resolvedDraftThread;
  const widgetOtherParty = useMemo(() => {
    const fromThread = getOtherParty(resolvedThread, currentUserId, tr, currentSenderRole);
    if (fromThread?.userId || fromThread?.name) return fromThread;
    return {
      name: String(replyTarget?.label || '').trim(),
      email: String(replyTarget?.email || '').trim(),
      userId: String(replyTarget?.userId || '').trim() || null,
      role: String(replyTarget?.role || '').trim() || null,
    };
  }, [resolvedThread, currentUserId, tr, currentSenderRole, replyTarget]);
  const widgetOtherPartyRole = normalizeStaffRole(widgetOtherParty?.role || replyTarget?.role);
  const isDirectStaffWidget = Boolean(
    (resolvedThread?.metadata && typeof resolvedThread.metadata === 'object' && resolvedThread.metadata.directStaffChat) ||
    ['admin', 'employee', 'guide', 'owner', 'business_owner', 'staff', 'support'].includes(widgetOtherPartyRole)
  );
  const resolvedThreadKey = String(
    resolvedThreadKeyOverride ||
    threadId ||
    resolvedDraftThread?.thread_key ||
    thread?.thread_key ||
    ''
  ).trim();
  const unreadCount = Number(thread?.unread_count || 0);
  const effectiveUnreadBadgeCount = Number.isFinite(Number(unreadBadgeCount))
    ? Number(unreadBadgeCount)
    : unreadCount;
  const unreadBadgeLabel = effectiveUnreadBadgeCount > 3 ? '3+' : effectiveUnreadBadgeCount > 0 ? String(effectiveUnreadBadgeCount) : '';
  const floatingWidgetVisible = open || forceLauncherVisible || (showLauncherWhenUnread && unreadCount > 0);
  const floatingWidgetPresenceRef = useRef(false);
  const widgetParticipantId = String(widgetOtherParty?.userId || replyTarget?.userId || '').trim();
  const widgetPresenceOnline = useMemo(() => {
    const match = presenceEntries.find((entry) => String(entry?.userId || '').trim() === widgetParticipantId);
    if (!match?.active) return false;
    const updatedAtMs = new Date(match?.updatedAt || 0).getTime();
    if (!updatedAtMs) return false;
    return Date.now() - updatedAtMs < 180000;
  }, [presenceEntries, widgetParticipantId]);

  useEffect(() => {
    if (!widgetParticipantId || !isDirectStaffWidget) {
      setPresenceEntries([]);
      return undefined;
    }

    return MessageService.subscribeWorkspacePresenceList({
      targetUserIds: [widgetParticipantId],
      onChange: setPresenceEntries,
    });
  }, [widgetParticipantId, isDirectStaffWidget]);

  const loadThread = async ({ silent = false } = {}) => {
    if ((!resolvedThreadKey && (!contextType || !contextId)) || !currentUserId) {
      setThread(applyFallbackTimelineEvents(seedThread || null));
      setInitialized(true);
      return;
    }

    try {
      if (!silent) setLoading(true);
      setError('');
      const response = await MessageService.getThreadByContext({
        threadKey: resolvedThreadKey,
        contextType,
        contextId,
        threadType,
        limit: 120,
      });
      const nextThread = pickContextThread({
        threads: response?.threads,
        threadId: resolvedThreadKey,
        threadType,
        currentSenderRole,
      }) || response?.thread;

      if (nextThread) {
        const nextThreadKey = String(nextThread?.thread_key || nextThread?.id || '').trim();
        if (nextThreadKey) {
          setResolvedThreadKeyOverride(nextThreadKey);
        }
        setThread(applyFallbackTimelineEvents(nextThread));
        setError('');
      } else {
        const fallbackThread = seedThread
          ? {
              ...seedThread,
              metadata: {
                ...(seedThread?.metadata && typeof seedThread.metadata === 'object' ? seedThread.metadata : {}),
                canonicalThreadMissing: true,
              },
            }
          : null;
        setThread(applyFallbackTimelineEvents(fallbackThread));
        setError('');
      }
      setInitialized(true);
    } catch (loadError) {
      setError(
        loadError?.message || (
          isRentalWidget
            ? tr(
                'The rental journey is available, but the live conversation could not be refreshed right now.',
                'Le parcours de location est disponible, mais la conversation en direct n’a pas pu être actualisée pour le moment.'
              )
            : tr('Unable to load this conversation right now.', 'Impossible de charger cette conversation pour le moment.')
        )
      );
      setThread(applyFallbackTimelineEvents(seedThread || null));
      setInitialized(true);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    if (!currentUserId) return;
    void loadThread({ silent: true });
  }, [resolvedThreadKey, contextType, contextId, threadType, currentSenderRole, currentUserId]);

  useEffect(() => {
    setThread(null);
    setError('');
    setInitialized(false);
    setResolvedThreadKeyOverride('');
  }, [threadId, contextType, contextId, threadType, seedThread?.id]);

  useEffect(() => {
    if (!open) return;
    void loadThread();
  }, [open, resolvedThreadKey, contextType, contextId, threadType, currentSenderRole, currentUserId]);

  useEffect(() => {
    if (openRefreshIntervalRef.current) {
      clearInterval(openRefreshIntervalRef.current);
      openRefreshIntervalRef.current = null;
    }

    if (!open || !currentUserId || !resolvedThreadKey) {
      return undefined;
    }

    openRefreshIntervalRef.current = setInterval(() => {
      void loadThread({ silent: true });
    }, 1500);

    return () => {
      if (openRefreshIntervalRef.current) {
        clearInterval(openRefreshIntervalRef.current);
        openRefreshIntervalRef.current = null;
      }
    };
  }, [open, currentUserId, resolvedThreadKey]);

  useEffect(() => {
    if (!openRequestSignal) return;
    setOpen(true);
  }, [openRequestSignal]);

  useLayoutEffect(() => {
    if (typeof document === 'undefined' || typeof window === 'undefined') return undefined;
    if (!open) {
      if (typeof bodyScrollRestoreRef.current === 'function') {
        bodyScrollRestoreRef.current();
        bodyScrollRestoreRef.current = null;
      }
      return undefined;
    }

    const scrollY = window.scrollY;
    const previousPosition = document.body.style.position;
    const previousTop = document.body.style.top;
    const previousLeft = document.body.style.left;
    const previousRight = document.body.style.right;
    const previousWidth = document.body.style.width;
    const previousOverflow = document.body.style.overflow;

    document.body.style.position = 'fixed';
    document.body.style.top = `-${scrollY}px`;
    document.body.style.left = '0';
    document.body.style.right = '0';
    document.body.style.width = '100%';
    document.body.style.overflow = 'hidden';

    bodyScrollRestoreRef.current = () => {
      document.body.style.position = previousPosition;
      document.body.style.top = previousTop;
      document.body.style.left = previousLeft;
      document.body.style.right = previousRight;
      document.body.style.width = previousWidth;
      document.body.style.overflow = previousOverflow;
      window.scrollTo(0, scrollY);
    };

    return () => {
      if (typeof bodyScrollRestoreRef.current === 'function') {
        bodyScrollRestoreRef.current();
        bodyScrollRestoreRef.current = null;
      }
    };
  }, [open]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    if (!reserveFloatingCorner) {
      if (floatingWidgetPresenceRef.current) {
        const currentCount = Number(window.__sxFloatingWidgetCount || 0);
        const nextCount = Math.max(0, currentCount - 1);
        window.__sxFloatingWidgetCount = nextCount;
        if (nextCount > 0) {
          document.body.dataset.sxFloatingWidgetActive = 'true';
        } else {
          delete document.body.dataset.sxFloatingWidgetActive;
        }
        floatingWidgetPresenceRef.current = false;
      }
      return undefined;
    }

    const root = document.body;
    const syncPresence = (active) => {
      const currentCount = Number(window.__sxFloatingWidgetCount || 0);
      const nextCount = active ? currentCount + 1 : Math.max(0, currentCount - 1);
      window.__sxFloatingWidgetCount = nextCount;
      if (nextCount > 0) {
        root.dataset.sxFloatingWidgetActive = 'true';
      } else {
        delete root.dataset.sxFloatingWidgetActive;
      }
    };

    if (floatingWidgetVisible && !floatingWidgetPresenceRef.current) {
      floatingWidgetPresenceRef.current = true;
      syncPresence(true);
    } else if (!floatingWidgetVisible && floatingWidgetPresenceRef.current) {
      floatingWidgetPresenceRef.current = false;
      syncPresence(false);
    }

    return () => {
      if (floatingWidgetPresenceRef.current) {
        floatingWidgetPresenceRef.current = false;
        syncPresence(false);
      }
    };
  }, [floatingWidgetVisible, reserveFloatingCorner]);

  useEffect(() => {
    if (!open) return;
    const activeThreadKey = String((thread || resolvedDraftThread)?.thread_key || '').trim();
    const activeUnreadCount = Number((thread || resolvedDraftThread)?.unread_count || 0);
    if (!activeThreadKey || activeUnreadCount <= 0) return;

    void MessageService.markSharedThreadRead(activeThreadKey)
      .then(() => {
        setThread((current) =>
          current && String(current.thread_key || '').trim() === activeThreadKey
            ? { ...current, unread_count: 0 }
            : current
        );
      })
      .catch(() => {});
  }, [open, thread?.thread_key, thread?.unread_count, resolvedDraftThread]);

  useEffect(() => {
    if (!currentUserId) return undefined;

    const queueReload = (payload) => {
      if (!isPayloadRelevantToWidget({
        payload,
        threadId: resolvedThreadKey,
        activeThreadKey: resolvedThread?.thread_key,
        contextType,
        contextId,
        threadType,
      })) {
        return;
      }

      const row = payload?.new || {};
      const isIncomingInsert =
        String(payload?.eventType || '').toUpperCase() === 'INSERT' &&
        String(row?.sender_user_id || '').trim() &&
        String(row?.sender_user_id || '').trim() !== String(currentUserId || '').trim();

      if (isIncomingInsert && !open) {
        const toastKey = String(row?.id || `${row?.thread_key || ''}:${row?.created_at || ''}`).trim();
        if (toastKey && toastKey !== lastToastMessageRef.current && claimIncomingToast(toastKey)) {
          lastToastMessageRef.current = toastKey;
          const senderLabel = String(row?.sender_role || '').trim().toLowerCase() === 'admin'
            ? tr('Admin', 'Admin')
            : String(row?.sender_role || '').trim().toLowerCase() === 'owner'
              ? tr('Owner', 'Propriétaire')
              : tr('New message', 'Nouveau message');
          const toastTitle = contextTitle || resolvedThread?.subject || tr('Open conversation', 'Ouvrir la conversation');
          const toastPreview = buildToastPreview(row?.body, tr('Open the conversation to read the full message.', 'Ouvrez la conversation pour lire le message complet.'));

          toast.custom((toastInstance) => (
            <button
              type="button"
              onClick={() => {
                toast.dismiss(toastInstance.id);
                setOpen(true);
              }}
              className="chat-message-toast w-full max-w-[28rem] rounded-[1.65rem] border border-violet-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(247,244,255,0.98))] px-4 py-3 text-left backdrop-blur-xl"
            >
              <div className="flex items-start gap-3 rounded-[1.35rem] border border-violet-200/70 bg-white/92 px-3.5 py-3 shadow-[0_20px_44px_rgba(124,58,237,0.12)]">
                <span className="mt-0.5 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[1.1rem] bg-gradient-to-br from-violet-600 via-violet-500 to-indigo-500 text-sm font-black uppercase tracking-[0.12em] text-white shadow-[0_16px_28px_rgba(124,58,237,0.28)]">
                  {senderLabel.slice(0, 1)}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-3">
                    <p className="truncate text-sm font-black tracking-[-0.02em] text-slate-950">{senderLabel}</p>
                    <span className="rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-violet-600">
                      {contextLabel || tr('Messages', 'Messages')}
                    </span>
                  </div>
                  <p className="mt-1 truncate text-sm font-bold tracking-[-0.01em] text-slate-700">{toastTitle}</p>
                  <p className="mt-2 line-clamp-2 text-sm leading-5 text-slate-500">{toastPreview}</p>
                </div>
              </div>
            </button>
          ), {
            duration: 5000,
            position: 'top-center',
          });
        }
      }

      if (reloadTimerRef.current) clearTimeout(reloadTimerRef.current);
      reloadTimerRef.current = setTimeout(() => {
        void loadThread({ silent: true });
      }, 180);
    };

    const unsubscribe = MessageService.subscribeSharedMessages({
      userId: currentUserId,
      isAdmin,
      onChange: queueReload,
    });

    return () => {
      if (reloadTimerRef.current) clearTimeout(reloadTimerRef.current);
      unsubscribe();
    };
  }, [open, currentUserId, isAdmin, resolvedThreadKey, contextType, contextId, threadType, contextLabel, contextTitle, resolvedThread?.subject, resolvedThread?.thread_key, tr]);

  const handleSendReply = async ({ thread: activeThread, body, recipientUserId, recipientRole, senderRole, messageType, mode, metadata = {}, attachments = [] }) => {
    const isInternal = mode === 'internal';
    const workingThread = activeThread || resolvedDraftThread;
    const threadMetadata = workingThread?.metadata && typeof workingThread.metadata === 'object' ? { ...workingThread.metadata } : {};
    delete threadMetadata.replyTo;
    delete threadMetadata.replyToMessageId;
    delete threadMetadata.attachments;

    const response = await MessageService.sendSharedMessage({
      family: workingThread?.family || family,
      threadType: workingThread?.thread_type || threadType,
      ...(workingThread?.thread_key ? { threadKey: workingThread.thread_key } : {}),
      entityType: workingThread?.entity_type || contextType || 'conversation',
      entityId: workingThread?.entity_id || contextId || threadId || 'context',
      recipientUserId: isInternal ? currentUserId : recipientUserId,
      recipientRole: isInternal ? 'admin' : recipientRole,
      senderRole,
      messageType: isInternal ? 'internal_note' : (messageType || 'note'),
      subject: workingThread?.subject || contextTitle || contextLabel || '',
      body,
      attachments,
      metadata: {
        ...threadMetadata,
        ...(metadata && typeof metadata === 'object' ? metadata : {}),
        isInternal,
      },
    });
    if (response?.thread) {
      const nextThreadKey = String(response.thread?.thread_key || response.thread?.id || '').trim();
      if (nextThreadKey) {
        setResolvedThreadKeyOverride(nextThreadKey);
      }
      setThread(applyFallbackTimelineEvents(response.thread));
      setError('');
      setInitialized(true);
      return response;
    }
    void loadThread({ silent: true });
    return response;
  };

  const modalContent = open ? (
    <div className="fixed inset-0 z-[120] overflow-hidden">
      <button
        type="button"
        className="absolute inset-0 bg-slate-950/20 backdrop-blur-[2px]"
        onClick={() => setOpen(false)}
        aria-label={tr('Close messages', 'Fermer les messages')}
      />
      <aside className={`absolute bottom-5 right-5 top-5 overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-[0_30px_80px_rgba(15,23,42,0.18)] chat-drawer-enter max-xl:left-3 max-xl:right-3 max-xl:bottom-[max(0.75rem,env(safe-area-inset-bottom,0px))] max-xl:top-[calc(var(--workspace-mobile-header-offset,0px)+0.75rem)] max-xl:h-[calc(100dvh-var(--workspace-mobile-header-offset,0px)-0.75rem-max(0.75rem,env(safe-area-inset-bottom,0px)))] max-xl:max-h-[calc(100dvh-var(--workspace-mobile-header-offset,0px)-0.75rem-max(0.75rem,env(safe-area-inset-bottom,0px)))] max-xl:w-auto max-xl:max-w-none max-xl:rounded-[1.9rem] sm:max-xl:left-4 sm:max-xl:right-4 sm:max-xl:bottom-[max(1rem,env(safe-area-inset-bottom,0px))] sm:max-xl:top-[calc(var(--workspace-mobile-header-offset,0px)+1rem)] sm:max-xl:h-[calc(100dvh-var(--workspace-mobile-header-offset,0px)-1rem-max(1rem,env(safe-area-inset-bottom,0px)))] sm:max-xl:max-h-[calc(100dvh-var(--workspace-mobile-header-offset,0px)-1rem-max(1rem,env(safe-area-inset-bottom,0px)))] ${drawerWidthClassName}`}>
        <div className="flex h-full flex-col bg-[linear-gradient(180deg,#ffffff_0%,#faf7ff_100%)]">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
            <div className="min-w-0 flex-1">
              {isDirectStaffWidget ? (
                <div className="rounded-[22px] border border-violet-200 bg-[linear-gradient(180deg,#faf5ff_0%,#ffffff_100%)] px-4 py-3 shadow-[0_14px_28px_rgba(124,58,237,0.10)]">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-base font-black text-slate-950">
                        {widgetOtherParty?.name || widgetOtherParty?.email || tr('Team member', "Membre de l'équipe")}
                      </p>
                      <p className="mt-1 truncate text-sm text-slate-500">
                        {getRoleLabel(widgetOtherParty?.role || replyTarget?.role, tr)}
                      </p>
                    </div>
                    <span className={`inline-flex items-center gap-2 rounded-full px-3 py-2 text-[11px] font-black uppercase tracking-[0.14em] ${
                      widgetPresenceOnline ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'
                    }`}>
                      <span className={`h-2 w-2 rounded-full ${widgetPresenceOnline ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                      {widgetPresenceOnline ? tr('Online', 'En ligne') : tr('Away', 'Absent')}
                    </span>
                  </div>
                </div>
              ) : (
                <div>
                  <p className="text-[11px] font-black uppercase tracking-[0.18em] text-violet-500">
                    {contextLabel || tr('Context messages', 'Messages du contexte')}
                  </p>
                  <p className="mt-1 text-sm font-semibold text-slate-500">
                    {contextSubtitle || tr('Live conversation inside this page', 'Conversation en direct dans cette page')}
                  </p>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void loadThread()}
                disabled={loading}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition hover:border-violet-200 hover:text-violet-700 disabled:opacity-60"
                aria-label={tr('Refresh conversation', 'Actualiser la conversation')}
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition hover:border-violet-200 hover:text-violet-700"
                aria-label={tr('Minimize messages', 'Réduire les messages')}
              >
                <Minus className="h-4 w-4" />
              </button>
            </div>
          </div>

          {error ? (
            <div className="mx-4 mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
              {error}
            </div>
          ) : null}

          <div className="min-h-0 flex-1">
            {loading && !initialized ? (
              <div className="flex h-full items-center justify-center text-sm font-semibold text-slate-500">
                <span className="inline-flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {tr('Loading conversation…', 'Chargement de la conversation…')}
                </span>
              </div>
            ) : (
              <ConversationThread
                threadId={threadId}
                contextType={contextType}
                contextId={contextId}
                compactMode
                thread={resolvedThread}
                currentUserId={currentUserId}
                currentUserLabel={currentUserLabel}
                currentSenderRole={currentSenderRole}
                isFrench={isFrench}
                tr={tr}
                busyThreadKey={busyThreadKey}
                onSendReply={handleSendReply}
                onUpdateArchiveState={async (activeThread, action) => {
                  const activeThreadKey = String(activeThread?.thread_key || '').trim();
                  if (!activeThreadKey) return;
                  try {
                    setBusyThreadKey(activeThreadKey);
                    if (action === 'archive') {
                      await MessageService.archiveSharedThread(activeThreadKey);
                    } else {
                      await MessageService.restoreSharedThread(activeThreadKey);
                    }
                    await loadThread({ silent: true });
                  } finally {
                    setBusyThreadKey('');
                  }
                }}
                onUpdateThreadState={async (activeThread, payload) => {
                  const activeThreadKey = String(activeThread?.thread_key || '').trim();
                  if (!activeThreadKey) return;
                  try {
                    setBusyThreadKey(activeThreadKey);
                    await MessageService.updateSharedThreadState(activeThreadKey, payload);
                    await loadThread({ silent: true });
                  } finally {
                    setBusyThreadKey('');
                  }
                }}
                allowInternalNotes={allowInternalNotes}
                allowThreadStateControls={isDirectStaffWidget ? false : allowThreadStateControls}
                onPerformMarketplaceAction={onPerformMarketplaceAction}
                replyTarget={replyTarget}
                contextTitle={isDirectStaffWidget ? (widgetOtherParty?.name || contextTitle) : contextTitle}
                contextSubtitle={isDirectStaffWidget ? (widgetOtherParty?.email || contextSubtitle) : contextSubtitle}
                contextStatus={isDirectStaffWidget ? getRoleLabel(widgetOtherParty?.role || replyTarget?.role, tr) : contextStatus}
                threadContextData={threadContextData}
                listingSetupProgress={listingSetupProgress}
                hideDirectStaffIdentity={isDirectStaffWidget}
                onExitReadingMode={() => setOpen(false)}
                onClose={() => setOpen(false)}
                onDeleteThread={async () => {
                  setOpen(false);
                  await loadThread({ silent: true });
                }}
                emptyTitle={
                  isRentalWidget
                    ? tr('Rental timeline is ready', 'La chronologie de location est prête')
                    : tr('No messages yet', 'Aucun message pour le moment')
                }
                emptyDescription={
                  isRentalWidget
                    ? (
                        resolvedThread?.metadata?.canonicalThreadMissing
                          ? tr(
                              'This rental already has its journey context. The live chat will appear here once the canonical thread finishes linking.',
                              'Cette location a déjà son contexte de parcours. Le chat en direct apparaîtra ici dès que le fil canonique sera entièrement lié.'
                            )
                          : tr(
                              'This rental journey will keep updating here. Human coordination messages will appear once someone replies.',
                              'Ce parcours de location continuera de se mettre à jour ici. Les messages humains apparaîtront dès qu’une personne répondra.'
                            )
                      )
                    : isListingModerationWidget && resolvedThread?.metadata?.canonicalThreadMissing
                      ? tr(
                          'The approval conversation is preparing. Review updates and admin replies will appear here once the canonical thread finishes linking.',
                          "La conversation d'approbation se prépare. Les mises à jour de revue et les réponses admin apparaîtront ici dès que le fil canonique sera entièrement lié."
                        )
                    : tr('This context is ready for messaging once a thread exists or the first message is sent.', 'Ce contexte est prêt pour la messagerie dès qu’un fil existe ou qu’un premier message est envoyé.')
                }
              />
            )}
          </div>
        </div>
      </aside>
    </div>
  ) : null;

  const launcherContent = !open && (forceLauncherVisible || (showLauncherWhenUnread && unreadCount > 0)) ? (
    <div className={`fixed ${compactLauncher ? 'bottom-[calc(env(safe-area-inset-bottom,0px)+5.75rem)] right-6 sm:bottom-[calc(env(safe-area-inset-bottom,0px)+6.25rem)] sm:right-8' : 'bottom-5 right-5'} z-[70] ${className}`}>
      {typeof onDismissLauncher === 'function' ? (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onDismissLauncher();
          }}
          className="absolute -right-1 -top-1 z-10 inline-flex h-7 w-7 items-center justify-center rounded-full border border-white/80 bg-white text-slate-500 shadow-[0_10px_22px_rgba(15,23,42,0.16)] transition hover:scale-105 hover:text-rose-600"
          aria-label={tr('Dismiss message button', 'Fermer le bouton message')}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      ) : null}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`group chat-widget-pulse relative border border-violet-200/90 bg-white/96 ring-1 ring-white/80 backdrop-blur-xl transition duration-200 hover:-translate-y-1 hover:border-violet-300 hover:shadow-[0_30px_70px_rgba(79,70,229,0.28),0_14px_32px_rgba(15,23,42,0.16)] ${compactLauncher ? 'flex h-14 w-14 items-center justify-center rounded-full shadow-[0_24px_60px_rgba(79,70,229,0.24),0_10px_24px_rgba(15,23,42,0.14)]' : 'flex items-center gap-3 rounded-full px-4 py-3 shadow-[0_24px_60px_rgba(79,70,229,0.24),0_10px_24px_rgba(15,23,42,0.14)]'}`}
      >
        <span className="pointer-events-none absolute inset-0 rounded-full bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.92),rgba(255,255,255,0)_58%)]" />
        <span className={`relative inline-flex items-center justify-center rounded-full bg-violet-600 text-white ${compactLauncher ? 'h-12 w-12' : 'h-11 w-11'}`}>
          <MessageSquareMore className="h-5 w-5" />
          {unreadBadgeLabel ? (
            <span className="absolute -right-1 -top-1 inline-flex min-h-[1.2rem] min-w-[1.2rem] items-center justify-center rounded-full border border-white/90 bg-rose-500 px-1.5 text-[10px] font-black leading-none text-white shadow-[0_8px_18px_rgba(244,63,94,0.28)]">
              {unreadBadgeLabel}
            </span>
          ) : null}
        </span>
        {!compactLauncher ? (
          <>
            <span className="min-w-0 text-left">
              <span className="block text-[11px] font-black uppercase tracking-[0.18em] text-violet-500">
                {contextLabel || tr('Messages', 'Messages')}
              </span>
              <span className="block max-w-[10rem] truncate text-sm font-bold text-slate-900">
                {contextTitle || tr('Open conversation', 'Ouvrir la conversation')}
              </span>
            </span>
            {unreadBadgeLabel ? (
              <span className="rounded-full border border-rose-100 bg-rose-50 px-2 py-1 text-[11px] font-black tracking-[-0.01em] text-rose-600">
                {unreadBadgeLabel}
              </span>
            ) : null}
          </>
        ) : null}
      </button>
    </div>
  ) : null;

  return (
    <>
      {typeof document !== 'undefined' && launcherContent ? createPortal(launcherContent, document.body) : null}
      {typeof document !== 'undefined' ? createPortal(modalContent, document.body) : null}
    </>
  );
};

export default MessageWidget;
