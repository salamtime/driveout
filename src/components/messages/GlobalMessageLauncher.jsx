import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import MessageWidget from './MessageWidget';
import { getMessageExperience } from './messageExperience';
import MessageService from '../../services/MessageService';
import { buildMarketplaceBookingConfirmWhatsappHref } from '../../utils/marketplaceBookingLinks';
import {
  getMessageNotificationPreferences,
  getUnreadMessageThreadBuckets,
  shouldSurfaceMessageThreadNotification,
} from '../../utils/messageNotificationPreferences';

const buildToastPreview = (value, fallback) => {
  const normalized = String(value || '').replace(/\s+/g, ' ').trim();
  if (!normalized) return fallback;
  return normalized.length > 96 ? `${normalized.slice(0, 93)}...` : normalized;
};

const ACCOUNT_CONTEXTUAL_PATHS = [
  /^\/account\/rentals\/[^/]+/i,
];

const ADMIN_CONTEXTUAL_PATHS = [
  /^\/admin\/verification/i,
  /^\/admin\/marketplace\/[^/]+/i,
  /^\/admin\/customers\/[^/]+/i,
];

const getCurrentSenderRole = ({ userProfile, user, isAdmin }) => {
  if (isAdmin) return 'admin';

  const role = String(userProfile?.role || '').trim().toLowerCase();
  const accountType = String(
    userProfile?.accountType ||
      user?.user_metadata?.account_type ||
      user?.app_metadata?.account_type ||
      ''
  )
    .trim()
    .toLowerCase();

  if (
    role === 'business_owner' ||
    accountType === 'owner' ||
    accountType === 'operator' ||
    accountType === 'business'
  ) {
    return 'owner';
  }

  return 'customer';
};

const getCurrentUserLabel = ({ userProfile, user, fallback }) =>
  String(
    userProfile?.fullName ||
      userProfile?.full_name ||
      userProfile?.name ||
      userProfile?.username ||
      user?.user_metadata?.full_name ||
      user?.email ||
      fallback
  ).trim();

const shouldHideForPath = ({ pathname, isAdmin }) => {
  const patterns = isAdmin ? ADMIN_CONTEXTUAL_PATHS : ACCOUNT_CONTEXTUAL_PATHS;
  return patterns.some((pattern) => pattern.test(pathname));
};

const buildSurfacedThreadSeed = (row = {}, fallbackTitle = 'Open conversation') => ({
  thread_key: String(row?.thread_key || '').trim(),
  entity_type: String(row?.entity_type || '').trim(),
  entity_id: String(row?.entity_id || '').trim(),
  subject: String(row?.subject || fallbackTitle).trim() || fallbackTitle,
  family: String(row?.family || 'support').trim() || 'support',
  thread_type: String(row?.thread_type || 'support_case').trim() || 'support_case',
  unread_count: 1,
  metadata:
    row?.metadata && typeof row.metadata === 'object'
      ? row.metadata
      : (() => {
          if (typeof row?.metadata !== 'string') return {};
          try {
            const parsed = JSON.parse(row.metadata);
            return parsed && typeof parsed === 'object' ? parsed : {};
          } catch {
            return {};
          }
        })(),
});

const getLauncherThreadIdentity = (thread = {}) =>
  String(
    thread?.thread_key ||
      thread?.id ||
      [
        thread?.family,
        thread?.thread_type,
        thread?.entity_type,
        thread?.entity_id,
        thread?.subject,
      ]
        .filter(Boolean)
        .join(':')
  )
    .trim();

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

const GlobalMessageLauncher = ({
  user,
  userProfile,
  isAdmin = false,
  isFrench = false,
}) => {
  const location = useLocation();
  const navigate = useNavigate();
  const [threads, setThreads] = useState([]);
  const [loading, setLoading] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [openRequestSignal, setOpenRequestSignal] = useState(0);
  const [launcherOpen, setLauncherOpen] = useState(false);
  const [surfacedThreadKey, setSurfacedThreadKey] = useState('');
  const [surfacedThreadSeed, setSurfacedThreadSeed] = useState(null);
  const [dismissedThreadKeys, setDismissedThreadKeys] = useState([]);
  const reloadTimerRef = useRef(null);
  const lastToastKeyRef = useRef('');
  const messageExperience = getMessageExperience({ canUsePrivilegedFeatures: isAdmin });

  const tr = (en, fr) => (isFrench ? fr : en);
  const currentUserId = String(user?.id || '').trim();

  const hiddenOnCurrentPage = useMemo(() => {
    if (
      location.pathname === '/account/messages' ||
      location.pathname === '/admin/messages'
    ) {
      return true;
    }
    return shouldHideForPath({ pathname: location.pathname, isAdmin });
  }, [location.pathname, isAdmin]);

  const currentUserLabel = useMemo(
    () =>
      getCurrentUserLabel({
        userProfile,
        user,
        fallback: isAdmin ? 'Admin' : 'You',
      }),
    [userProfile, user, isAdmin]
  );

  const currentSenderRole = useMemo(
    () => getCurrentSenderRole({ userProfile, user, isAdmin }),
    [userProfile, user, isAdmin]
  );
  const notificationPreferences = useMemo(
    () => getMessageNotificationPreferences({ userProfile, user }),
    [user, userProfile]
  );
  const openLauncherThread = (threadSeed, threadKey) => {
    if (threadKey) {
      setSurfacedThreadKey(threadKey);
      setSurfacedThreadSeed(threadSeed);
      setDismissedThreadKeys([]);
    }
    setOpenRequestSignal((current) => current + 1);
  };

  const buildThreadDestination = (threadSeed = {}, threadKey = '') => {
    const metadata = threadSeed?.metadata && typeof threadSeed.metadata === 'object' ? threadSeed.metadata : {};
    const requestId = String(metadata?.requestId || threadSeed?.entity_id || '').trim();
    const requestStatus = String(metadata?.requestStatus || metadata?.status || '').trim().toLowerCase();
    const searchParams = new URLSearchParams();

    if (threadKey) {
      searchParams.set('threadKey', threadKey);
    }
    if (requestId) {
      searchParams.set('requestId', requestId);
    }
    if (requestStatus === 'pre_approved') {
      searchParams.set('action', 'confirm');
    }

    const search = searchParams.toString();
    return `/account/messages${search ? `?${search}` : ''}`;
  };

  const showBrowserNotification = ({ title, body, threadSeed, threadKey }) => {
    if (typeof window === 'undefined' || typeof Notification === 'undefined') return;
    if (Notification.permission !== 'granted') return;

    const notification = new Notification(title, {
      body,
      icon: '/assets/logo.png',
      tag: `saharax-booking-${threadKey || Date.now()}`,
    });

    notification.onclick = () => {
      window.focus();
      notification.close();
      navigate(buildThreadDestination(threadSeed, threadKey));
    };
  };

  const { primaryUnreadThread, supportUnreadThreads, customerUnreadThreads } = useMemo(
    () => getUnreadMessageThreadBuckets(threads, notificationPreferences),
    [notificationPreferences, threads]
  );
  const supportUnreadCount = useMemo(
    () => supportUnreadThreads.reduce((total, thread) => total + Number(thread?.unread_count || 0), 0),
    [supportUnreadThreads]
  );
  const customerUnreadCount = useMemo(
    () => customerUnreadThreads.reduce((total, thread) => total + Number(thread?.unread_count || 0), 0),
    [customerUnreadThreads]
  );
  const launcherUnreadBadgeCount = supportUnreadCount > 0
    ? supportUnreadCount
    : notificationPreferences.customerMessages
      ? customerUnreadCount
      : 0;

  const activeLauncherThread = useMemo(() => {
    const safeThreads = Array.isArray(threads) ? threads : [];
    const surfaced = safeThreads.find(
      (thread) =>
        getLauncherThreadIdentity(thread) === String(surfacedThreadKey || '').trim()
    );
    if (surfaced) {
      return surfaced;
    }
    if (
      surfacedThreadSeed &&
      String(surfacedThreadSeed?.thread_key || '').trim() ===
        String(surfacedThreadKey || '').trim()
    ) {
      return surfacedThreadSeed;
    }
    return primaryUnreadThread;
  }, [threads, surfacedThreadKey, primaryUnreadThread, surfacedThreadSeed]);

  const launcherShouldBeVisible = useMemo(() => {
    const threadKey = getLauncherThreadIdentity(activeLauncherThread);
    if (!threadKey) return false;
    if (dismissedThreadKeys.includes(threadKey)) return false;
    if (threadKey && String(surfacedThreadKey || '').trim() === threadKey) return true;
    return false;
  }, [activeLauncherThread, dismissedThreadKeys, surfacedThreadKey]);

  const loadThreads = async ({ silent = false } = {}) => {
    if (!currentUserId) {
      setThreads([]);
      setInitialized(true);
      return;
    }

    try {
      if (!silent) setLoading(true);
      const response = await MessageService.listSharedThreads({ limit: 50 });
      setThreads(Array.isArray(response?.threads) ? response.threads : []);
      setInitialized(true);
    } catch (error) {
      console.error('Failed to load global message launcher threads:', error);
      if (!silent) {
        setThreads([]);
      }
      setInitialized(true);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    void loadThreads({ silent: true });
  }, [currentUserId]);

  useEffect(() => {
    const normalizedSurfacedThreadKey = String(surfacedThreadKey || '').trim();
    if (normalizedSurfacedThreadKey) return;

    const primaryThreadKey = getLauncherThreadIdentity(primaryUnreadThread);
    if (!primaryThreadKey) return;
    if (dismissedThreadKeys.includes(primaryThreadKey)) return;

    setSurfacedThreadKey(primaryThreadKey);
    setSurfacedThreadSeed(primaryUnreadThread);
  }, [dismissedThreadKeys, primaryUnreadThread, surfacedThreadKey]);

  useEffect(() => {
    if (!hiddenOnCurrentPage) return;
    setLauncherOpen(false);
  }, [hiddenOnCurrentPage]);

  useEffect(() => {
    setSurfacedThreadKey('');
    setSurfacedThreadSeed(null);
    setDismissedThreadKeys([]);
    setOpenRequestSignal(0);
    setLauncherOpen(false);
  }, [currentUserId, isAdmin]);

  useEffect(() => {
    if (!currentUserId) return undefined;

    const handleRealtimeChange = (payload) => {
      const row = payload?.new || {};
      const senderUserId = String(row?.sender_user_id || '').trim();
      const isIncomingInsert =
        String(payload?.eventType || '').toUpperCase() === 'INSERT' &&
        senderUserId &&
        senderUserId !== currentUserId;

      if (isIncomingInsert && !hiddenOnCurrentPage) {
        const surfacedSeed = buildSurfacedThreadSeed(
          row,
          tr('Open conversation', 'Ouvrir la conversation')
        );
        if (!shouldSurfaceMessageThreadNotification(surfacedSeed, notificationPreferences)) {
          if (reloadTimerRef.current) clearTimeout(reloadTimerRef.current);
          reloadTimerRef.current = setTimeout(() => {
            void loadThreads({ silent: true });
          }, 180);
          return;
        }
        const threadKey = getLauncherThreadIdentity(surfacedSeed);
        const metadata = surfacedSeed?.metadata && typeof surfacedSeed.metadata === 'object' ? surfacedSeed.metadata : {};
        const requestStatus = String(metadata?.requestStatus || metadata?.status || '').trim().toLowerCase();
        const isApprovedBookingNotification =
          String(row?.family || '').trim().toLowerCase() === 'marketplace' &&
          ['approved', 'approved_by_owner', 'pre_approved'].includes(requestStatus);
        if (threadKey) {
          setSurfacedThreadKey(threadKey);
          setSurfacedThreadSeed(surfacedSeed);
          setDismissedThreadKeys([]);
          setInitialized(true);
        }
        const toastKey = String(
          row?.id || `${row?.thread_key || ''}:${row?.created_at || ''}`
        ).trim();
        if (!launcherOpen && toastKey && toastKey !== lastToastKeyRef.current && claimIncomingToast(toastKey)) {
          lastToastKeyRef.current = toastKey;
          const senderLabel = isApprovedBookingNotification
            ? tr('Booking approved', 'Réservation approuvée')
            : String(row?.sender_role || '').trim().toLowerCase() === 'admin'
              ? tr('Admin', 'Admin')
              : String(row?.sender_role || '').trim().toLowerCase() === 'owner'
                ? tr('Owner', 'Propriétaire')
                : tr('New message', 'Nouveau message');
          const toastTitle = isApprovedBookingNotification
            ? tr('Your booking is approved', 'Votre réservation est approuvée')
            : String(row?.subject || primaryUnreadThread?.subject || tr('Open conversation', 'Ouvrir la conversation')).trim();
          const toastPreview = isApprovedBookingNotification
            ? requestStatus === 'pre_approved'
              ? tr('Open the request to finish the legacy booking flow.', "Ouvrez la demande pour terminer l’ancien parcours.")
              : tr('Deposit is on hold and chat is now open.', 'La caution est retenue et le chat est maintenant ouvert.')
            : buildToastPreview(
                row?.body,
                tr('Open the conversation to read the full message.', 'Ouvrez la conversation pour lire le message complet.')
              );

          const approvalWhatsappHref = isApprovedBookingNotification
            ? buildMarketplaceBookingConfirmWhatsappHref({
                requestId: metadata?.requestId || surfacedSeed?.entity_id || '',
                listingTitle: row?.subject || '',
                tr,
              })
            : '';

          if (isApprovedBookingNotification) {
            showBrowserNotification({
              title: requestStatus === 'pre_approved'
                ? tr('Legacy approval ready', 'Approbation héritée prête')
                : tr('Your booking is approved ✅ Chat is open', 'Votre réservation est approuvée ✅ Le chat est ouvert'),
              body: toastPreview,
              threadSeed: surfacedSeed,
              threadKey,
            });
          }

          toast.custom(
            (toastInstance) => (
              <button
                type="button"
                onClick={() => {
                  toast.dismiss(toastInstance.id);
                  openLauncherThread(surfacedSeed, threadKey);
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
                        {isApprovedBookingNotification
                          ? requestStatus === 'pre_approved'
                            ? tr('Legacy flow', 'Parcours hérité')
                            : tr('Chat open', 'Chat ouvert')
                          : tr('Messages', 'Messages')}
                        </span>
                    </div>
                    <p className="mt-1 truncate text-sm font-bold tracking-[-0.01em] text-slate-700">{toastTitle}</p>
                    <p className="mt-2 line-clamp-2 text-sm leading-5 text-slate-500">{toastPreview}</p>
                    {isApprovedBookingNotification && approvalWhatsappHref && requestStatus === 'pre_approved' ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        <span className="inline-flex items-center rounded-full bg-violet-50 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-violet-700">
                          {tr('Confirm now', 'Confirmer')}
                        </span>
                        <a
                          href={approvalWhatsappHref}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(event) => event.stopPropagation()}
                          className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-bold text-slate-700 transition hover:border-violet-200 hover:text-violet-700"
                        >
                          WhatsApp
                        </a>
                      </div>
                    ) : null}
                  </div>
                </div>
              </button>
            ),
            {
              duration: 5000,
              position: 'top-center',
            }
          );
        }
      }

      if (reloadTimerRef.current) clearTimeout(reloadTimerRef.current);
      reloadTimerRef.current = setTimeout(() => {
        void loadThreads({ silent: true });
      }, 180);
    };

    const unsubscribe = MessageService.subscribeSharedMessages({
      userId: currentUserId,
      isAdmin,
      onChange: handleRealtimeChange,
    });

    return () => {
      if (reloadTimerRef.current) clearTimeout(reloadTimerRef.current);
      unsubscribe();
    };
  }, [currentUserId, hiddenOnCurrentPage, isAdmin, launcherOpen, notificationPreferences, primaryUnreadThread]);

  if (!currentUserId || hiddenOnCurrentPage || !initialized) {
    return null;
  }

  if (!activeLauncherThread && !loading) {
    return null;
  }

  return (
    <MessageWidget
      {...messageExperience}
      key={getLauncherThreadIdentity(activeLauncherThread) || 'global-message-launcher'}
      threadId={String(activeLauncherThread?.thread_key || '').trim()}
      contextType={activeLauncherThread?.entity_type || ''}
      contextId={activeLauncherThread?.entity_id || ''}
      contextLabel={tr('Messages', 'Messages')}
      contextTitle={activeLauncherThread?.subject || tr('Unread conversation', 'Conversation non lue')}
      contextSubtitle={tr('Unread conversation waiting for you', 'Conversation non lue en attente')}
      family={activeLauncherThread?.family || 'support'}
      threadType={activeLauncherThread?.thread_type || 'support_case'}
      currentUserId={currentUserId}
      currentUserLabel={currentUserLabel}
      currentSenderRole={currentSenderRole}
      isFrench={isFrench}
      tr={tr}
      isAdmin={isAdmin}
      seedThread={activeLauncherThread}
      openRequestSignal={openRequestSignal}
      forceLauncherVisible={launcherShouldBeVisible}
      unreadBadgeCount={launcherUnreadBadgeCount}
      showLauncherWhenUnread={false}
      compactLauncher
      reserveFloatingCorner={false}
      onDismissLauncher={() => {
        const threadKey = getLauncherThreadIdentity(activeLauncherThread);
        if (!threadKey) return;
        setDismissedThreadKeys((current) =>
          current.includes(threadKey) ? current : [...current, threadKey]
        );
      }}
      onOpenStateChange={setLauncherOpen}
    />
  );
};

export default GlobalMessageLauncher;
