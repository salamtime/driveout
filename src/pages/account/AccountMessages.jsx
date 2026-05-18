import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, ArrowLeft, CheckCircle2, MessageSquareText } from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import i18n from '../../i18n';
import SharedInboxWorkspace from '../../components/messages/SharedInboxWorkspace';
import { getMessageExperience } from '../../components/messages/messageExperience';
import MessageService from '../../services/MessageService';
import CustomerExperienceService from '../../services/CustomerExperienceService';
import BusinessMarketplaceService from '../../services/BusinessMarketplaceService';
import VerificationService from '../../services/VerificationService';
import { resolveReturnPath } from '../../utils/navigationReturn';
import { buildMessageSectionSummary } from '../../utils/messageCenter';
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
  if (href.includes('/account/vehicles?requestId=') || href.includes('/account/vehicles/')) return true;
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
  return matches.find((thread) => getThreadRoleContext(thread, currentSenderRole) === preferredRoleContext) || matches[0] || null;
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
  const realtimeReloadTimerRef = useRef(null);
  const repairedOwnerRequestIdsRef = useRef(new Set());
  const messageExperience = getMessageExperience();
  const effectiveSenderRole = profileSenderRole === 'owner' || ownerAccessDetected ? 'owner' : 'customer';
  const requestedThreadKey = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return String(params.get('threadKey') || '').trim();
  }, [location.search]);
  const requestedBookingId = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return String(params.get('requestId') || '').trim();
  }, [location.search]);
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
      const response = await MessageService.listSharedThreads();
      const nextThreads = Array.isArray(response?.threads) ? response.threads : [];
      setThreads(nextThreads);
      return nextThreads;
    } catch (loadError) {
      setError(loadError?.message || tr('Unable to load your Inbox right now.', 'Impossible de charger votre Inbox pour le moment.'));
      setThreads([]);
      return [];
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, [tr, user?.id]);

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

    return () => {
      if (realtimeReloadTimerRef.current) {
        clearTimeout(realtimeReloadTimerRef.current);
      }
      unsubscribe();
    };
  }, [loadThreads, user?.id]);

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
  const inboxOverviewCards = useMemo(
    () => [
      {
        key: 'actions',
        label: tr('Actions required', 'Actions requises'),
        value: inboxSectionSummary.actions,
        helper: tr(
          'Requests waiting, listing fixes, or verification follow-ups.',
          'Demandes en attente, corrections d’annonce ou suivis de vérification.'
        ),
        icon: AlertCircle,
        toneClassName: 'bg-amber-50 text-amber-700 ring-amber-100',
      },
      {
        key: 'conversations',
        label: tr('Live conversations', 'Conversations en direct'),
        value: inboxSectionSummary.conversations,
        helper: tr(
          'Active renter conversations, approvals, and trip coordination.',
          'Conversations actives avec les locataires, approbations et coordination des trajets.'
        ),
        icon: MessageSquareText,
        toneClassName: 'bg-violet-50 text-violet-700 ring-violet-100',
      },
      {
        key: 'updates',
        label: tr('Updates', 'Mises à jour'),
        value: inboxSectionSummary.updates,
        helper: tr(
          `${inboxSectionSummary.unreadCount} unread threads to review.`,
          `${inboxSectionSummary.unreadCount} fils non lus à consulter.`
        ),
        icon: CheckCircle2,
        toneClassName: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
      },
    ],
    [inboxSectionSummary.actions, inboxSectionSummary.conversations, inboxSectionSummary.unreadCount, inboxSectionSummary.updates, tr]
  );
  const inboxHero = useMemo(() => {
    if (effectiveSenderRole === 'owner') {
      return {
        eyebrow: tr('Inbox', 'Boîte de réception'),
        title: tr('Run your vehicle business from here', 'Pilotez votre activité véhicule depuis ici'),
        description: tr(
          'Handle booking requests, renter conversations, verification follow-ups, and listing decisions in one place. Pricing, availability, and unlisting still live in Listings.',
          'Gérez les demandes de réservation, les conversations locataires, les suivis de vérification et les décisions d’annonce au même endroit. Les prix, disponibilités et dépublications restent dans Annonces.'
        ),
      };
    }

    return {
      eyebrow: tr('Inbox', 'Boîte de réception'),
      title: tr('Keep every trip conversation in one place', 'Gardez chaque conversation de trajet au même endroit'),
      description: tr(
        'Booking updates, support replies, and verification follow-ups all land here so you always know what to answer next.',
        'Les mises à jour de réservation, réponses support et suivis de vérification arrivent ici pour que vous sachiez toujours quoi traiter ensuite.'
      ),
    };
  }, [effectiveSenderRole, tr]);
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
      href: `/account/vehicles?requestId=${encodeURIComponent(requestId)}#requests`,
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
      <main className={`mx-auto max-w-7xl px-3 py-6 sm:px-6 lg:px-8 ${mobileConversationOpen ? 'space-y-3' : 'space-y-6'}`}>
        <section className={mobileConversationOpen ? 'space-y-3' : 'space-y-6'}>
          <header className="space-y-5 px-1">
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
            <div className="rounded-[32px] border border-violet-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(245,243,255,0.96))] px-5 py-6 shadow-[0_18px_40px_rgba(76,29,149,0.08)] sm:px-7">
              <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
                <div className="max-w-3xl">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-[11px] font-black uppercase tracking-[0.22em] text-violet-600">
                      {inboxHero.eyebrow}
                    </p>
                    <span className="inline-flex items-center rounded-full bg-white/90 px-3 py-1 text-[11px] font-black text-slate-600 ring-1 ring-slate-200">
                      {tr(
                        `${inboxSectionSummary.unreadCount} unread`,
                        `${inboxSectionSummary.unreadCount} non lus`
                      )}
                    </span>
                  </div>
                  <h1 className="mt-3 text-2xl font-black tracking-[-0.03em] text-slate-950 sm:text-[2.2rem]">
                    {inboxHero.title}
                  </h1>
                  <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-600 sm:text-[15px]">
                    {inboxHero.description}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {inboxActionLinks.map((action) => (
                    <Link
                      key={action.key}
                      to={action.to}
                      className="inline-flex items-center justify-center rounded-full border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-violet-200 hover:text-violet-700"
                    >
                      {action.label}
                    </Link>
                  ))}
                </div>
              </div>

              <div className="mt-5 grid gap-3 md:grid-cols-3">
                {inboxOverviewCards.map((card) => {
                  const Icon = card.icon;
                  return (
                    <div
                      key={card.key}
                      className="rounded-[24px] border border-white/80 bg-white/90 px-4 py-4 shadow-[0_10px_24px_rgba(15,23,42,0.05)]"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">
                            {card.label}
                          </p>
                          <p className="mt-2 text-3xl font-black tracking-[-0.03em] text-slate-950">
                            {card.value}
                          </p>
                        </div>
                        <span className={`inline-flex h-11 w-11 items-center justify-center rounded-2xl ring-1 ${card.toneClassName}`}>
                          <Icon className="h-5 w-5" />
                        </span>
                      </div>
                      <p className="mt-3 text-sm leading-6 text-slate-500">
                        {card.helper}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          </header>

          <div>
            <SharedInboxWorkspace
              {...messageExperience}
              threads={threads}
              loading={loading}
              error={error}
              busyThreadKey={busyThreadKey}
              initialSelectedThreadKey={initialSelectedThreadKey}
              initialSelectedRequestId={requestedBookingId}
              currentUserId={user?.id}
              currentUserLabel={currentUserLabel}
              currentUserAvatarUrl={currentUserAvatarUrl}
              currentSenderRole={effectiveSenderRole}
              activeMode={effectiveSenderRole === 'owner' ? 'owner' : 'customer'}
              contextCounts={{ verification: verificationCount }}
              isFrench={isFrench}
              tr={tr}
              showContextTabs={false}
              showSearch
              showListFilters
              groupThreads
              threadGroupingMode="transaction_hub"
              workspaceContext={effectiveSenderRole === 'owner' ? 'owner' : 'customer'}
              onMobileConversationStateChange={setMobileConversationOpen}
              onRefresh={() => loadThreads()}
              onOpenContext={(thread) => {
                const requestId = String(thread?.metadata?.requestId || thread?.entity_id || '').trim();
                const status = String(thread?.metadata?.requestStatus || thread?.metadata?.status || '').trim().toLowerCase();
                const shouldOpenConfirmState = status === 'pre_approved';
                const threadType = String(thread?.thread_type || thread?.threadType || '').trim().toLowerCase();
                const isOwnerFacingView =
                  threadType === 'marketplace_owner_request'
                    ? true
                    : threadType === 'marketplace_customer_request'
                      ? false
                      : effectiveSenderRole === 'owner';
                const href = requestId
                  ? isOwnerFacingView
                    ? `/account/vehicles?requestId=${encodeURIComponent(requestId)}#requests`
                    : `/account/rentals/requests/${encodeURIComponent(requestId)}${shouldOpenConfirmState ? '?action=confirm' : ''}`
                  : thread?.metadata?.href || '';
                if (href) {
                  const threadKey = String(thread?.thread_key || thread?.id || '').trim();
                  const returnParams = new URLSearchParams(location.search);
                  if (threadKey) {
                    returnParams.set('threadKey', threadKey);
                  }
                  if (requestId) {
                    returnParams.set('requestId', requestId);
                  }
                  if (shouldOpenConfirmState) {
                    returnParams.set('action', 'confirm');
                  }
                  const returnSearch = returnParams.toString();
                  const returnPath = `${location.pathname}${returnSearch ? `?${returnSearch}` : ''}${location.hash}`;
                  navigate(href, {
                    state: {
                      from: returnPath,
                    },
                  });
                }
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
