import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import i18n from '../../i18n';
import SharedInboxWorkspace from '../../components/messages/SharedInboxWorkspace';
import { getMessageExperience } from '../../components/messages/messageExperience';
import MessageService from '../../services/MessageService';
import CustomerExperienceService from '../../services/CustomerExperienceService';
import BusinessMarketplaceService from '../../services/BusinessMarketplaceService';
import VerificationService from '../../services/VerificationService';
import { resolveReturnPath } from '../../utils/navigationReturn';
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
      setError(loadError?.message || tr('Unable to load your messages right now.', 'Impossible de charger vos messages pour le moment.'));
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
    setOwnerAccessDetected(profileSenderRole === 'owner');
  }, [profileSenderRole]);

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
          <header className="px-1">
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
            <h1 className="text-2xl font-black tracking-[-0.02em] text-slate-950 sm:text-[2rem]">
              {tr('Messages', 'Messages')}
            </h1>
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
              showSearch={false}
              showListFilters={false}
              groupThreads={false}
              workspaceContext="customer"
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
              emptyTitle={tr('No messages yet', 'Aucun message pour le moment')}
              emptyDescription={tr(
                'When you request a vehicle or need help, your conversations will appear here.',
                'Lorsque vous demandez un véhicule ou avez besoin d’aide, vos conversations apparaîtront ici.'
              )}
              emptyActionLabel={tr('Browse vehicles', 'Explorer les véhicules')}
              emptyActionTo="/marketplace"
              emptyActionState={{ from: location.pathname + location.search + location.hash }}
            />
          </div>
        </section>
      </main>
    </div>
  );
};

export default AccountMessages;
