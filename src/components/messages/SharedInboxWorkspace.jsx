import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Archive,
  CheckCircle2,
  Clock3,
  Inbox,
  Loader2,
  MessageSquareText,
  RefreshCw,
  Search,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import ConversationThread from './ConversationThread';
import { normalizeRentalThreadContext } from '../../utils/rentalThreadState';
import {
  classifyThreadSection,
  getThreadActionLabel,
  MESSAGE_THREAD_SECTIONS,
} from '../../utils/messageCenter';
import {
  MAILBOXES,
  formatDateTime,
  getLatestMessage,
  getMailboxForThread,
  getNeedsReplyState,
  getOtherParty,
  getThreadInboxLane,
  getThreadRoleBucket,
  getThreadRoleContext,
  getThreadUserProfile,
} from './threadHelpers';

const AVATAR_COLOR_VARIANTS = [
  {
    default: 'bg-rose-50/90 text-rose-700 ring-rose-100',
    unread: 'bg-rose-50 text-rose-700 ring-rose-200',
    selected: 'bg-rose-100 text-rose-800 ring-rose-300 shadow-[0_8px_18px_rgba(244,63,94,0.14)]',
  },
  {
    default: 'bg-orange-50/90 text-orange-700 ring-orange-100',
    unread: 'bg-orange-50 text-orange-700 ring-orange-200',
    selected: 'bg-orange-100 text-orange-800 ring-orange-300 shadow-[0_8px_18px_rgba(249,115,22,0.14)]',
  },
  {
    default: 'bg-amber-50/90 text-amber-700 ring-amber-100',
    unread: 'bg-amber-50 text-amber-700 ring-amber-200',
    selected: 'bg-amber-100 text-amber-800 ring-amber-300 shadow-[0_8px_18px_rgba(245,158,11,0.16)]',
  },
  {
    default: 'bg-teal-50/90 text-teal-700 ring-teal-100',
    unread: 'bg-teal-50 text-teal-700 ring-teal-200',
    selected: 'bg-teal-100 text-teal-800 ring-teal-300 shadow-[0_8px_18px_rgba(13,148,136,0.14)]',
  },
  {
    default: 'bg-cyan-50/90 text-cyan-700 ring-cyan-100',
    unread: 'bg-cyan-50 text-cyan-700 ring-cyan-200',
    selected: 'bg-cyan-100 text-cyan-800 ring-cyan-300 shadow-[0_8px_18px_rgba(8,145,178,0.14)]',
  },
  {
    default: 'bg-sky-50/90 text-sky-700 ring-sky-100',
    unread: 'bg-sky-50 text-sky-700 ring-sky-200',
    selected: 'bg-sky-100 text-sky-800 ring-sky-300 shadow-[0_8px_18px_rgba(14,165,233,0.14)]',
  },
  {
    default: 'bg-indigo-50/90 text-indigo-700 ring-indigo-100',
    unread: 'bg-indigo-50 text-indigo-700 ring-indigo-200',
    selected: 'bg-indigo-100 text-indigo-800 ring-indigo-300 shadow-[0_8px_18px_rgba(99,102,241,0.16)]',
  },
  {
    default: 'bg-violet-50/90 text-violet-700 ring-violet-100',
    unread: 'bg-violet-50 text-violet-700 ring-violet-200',
    selected: 'bg-violet-100 text-violet-800 ring-violet-300 shadow-[0_8px_18px_rgba(139,92,246,0.16)]',
  },
  {
    default: 'bg-fuchsia-50/90 text-fuchsia-700 ring-fuchsia-100',
    unread: 'bg-fuchsia-50 text-fuchsia-700 ring-fuchsia-200',
    selected: 'bg-fuchsia-100 text-fuchsia-800 ring-fuchsia-300 shadow-[0_8px_18px_rgba(217,70,239,0.14)]',
  },
  {
    default: 'bg-pink-50/90 text-pink-700 ring-pink-100',
    unread: 'bg-pink-50 text-pink-700 ring-pink-200',
    selected: 'bg-pink-100 text-pink-800 ring-pink-300 shadow-[0_8px_18px_rgba(236,72,153,0.14)]',
  },
];

const isCompletedWorkflowThread = (thread = {}) => {
  const metadata = thread?.metadata && typeof thread.metadata === 'object' ? thread.metadata : {};
  const family = String(thread?.family || '').trim().toLowerCase();
  const threadType = String(thread?.thread_type || thread?.threadType || '').trim().toLowerCase();
  const reviewState = String(
    metadata.reviewState ||
    metadata.review_state ||
    metadata.verificationStatus ||
    metadata.status ||
    thread?.status ||
    ''
  ).trim().toLowerCase();

  if (family === 'verification' || family === 'account_trust') {
    return ['approved', 'verified', 'completed', 'resolved'].includes(reviewState);
  }

  if (threadType === 'marketplace_moderation') {
    return ['approved', 'live', 'published', 'completed', 'resolved'].includes(reviewState);
  }

  return false;
};

const capitalizeFirstLetter = (value = '') => {
  const normalized = String(value || '').trim();
  if (!normalized) return '';
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
};

const formatWorkspaceIdentity = (value = '') => {
  return String(value || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
    .join(' ');
};

const PARTICIPANT_MARKETPLACE_ROLES = new Set(['owner', 'business_owner', 'customer', 'renter']);

const filterMarketplaceParticipantMessages = (thread, currentSenderRole) => {
  const family = String(thread?.family || '').trim().toLowerCase();
  if (family !== 'marketplace') return thread;

  const viewerRole = String(currentSenderRole || '').trim().toLowerCase();
  if (!PARTICIPANT_MARKETPLACE_ROLES.has(viewerRole)) return thread;

  const safeMessages = Array.isArray(thread?.messages) ? thread.messages : [];
  const filteredMessages = safeMessages.filter((message) => {
    const senderRole = String(message?.sender_role || '').trim().toLowerCase();
    const metadata = message?.metadata && typeof message.metadata === 'object' ? message.metadata : {};
    if (metadata.isInternal) return false;
    return !['admin', 'employee', 'staff', 'support', 'guide'].includes(senderRole);
  });

  return {
    ...thread,
    messages: filteredMessages,
  };
};

const SharedInboxWorkspace = ({
  threads = [],
  loading = false,
  error = '',
  busyThreadKey = '',
  initialSelectedThreadKey = '',
  initialSelectedRequestId = '',
  initialInboxLane = '',
  currentUserId,
  currentUserLabel,
  currentUserAvatarUrl = '',
  currentSenderRole = 'customer',
  isFrench = false,
  tr,
  onRefresh,
  onSendReply,
  onPerformMarketplaceAction,
  onPerformVerificationAction,
  onOpenContext,
  onMarkThreadRead,
  onUpdateArchiveState,
  onUpdateThreadState,
  onSupportAction,
  allowInternalNotes = false,
  allowThreadStateControls = false,
  emptyTitle,
  emptyDescription,
  emptyActionLabel,
  emptyActionTo,
  emptyActionState,
  onMobileConversationStateChange,
  activeMode = 'customer',
  contextCounts = {},
  showContextTabs = true,
  workspaceContext = 'customer',
  showSearch = true,
  showListFilters = true,
  groupThreads = true,
  threadGroupingMode = 'default',
  laneModel: laneModelProp = '',
}) => {
  const laneModel = laneModelProp || (
    workspaceContext === 'support' || workspaceContext === 'staff'
      ? 'team'
      : currentSenderRole === 'admin'
        ? 'admin'
        : 'account'
  );
  const defaultInboxLane = laneModel === 'team' ? 'support' : 'conversations';
  const [search, setSearch] = useState('');
  const [selectedThreadKey, setSelectedThreadKey] = useState('');
  const [deletedThreadKeys, setDeletedThreadKeys] = useState([]);
  const [activeContextTab, setActiveContextTab] = useState('');
  const [activeListFilter, setActiveListFilter] = useState('all');
  const [activeInboxLane, setActiveInboxLane] = useState(defaultInboxLane);
  const [immersiveMode, setImmersiveMode] = useState(false);
  const [hasExplicitThreadSelection, setHasExplicitThreadSelection] = useState(false);
  const [shouldHonorInitialSelection, setShouldHonorInitialSelection] = useState(true);
  const [isCompactViewport, setIsCompactViewport] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth < 1024 : false
  );
  const [supportActionBusy, setSupportActionBusy] = useState(false);
  const isSelfMarketplaceThread = (thread) => {
    if (String(thread?.family || '').trim().toLowerCase() !== 'marketplace') return false;
    const senderUserId = String(thread?.sender_user_id || '').trim();
    const recipientUserId = String(thread?.recipient_user_id || '').trim();
    const normalizedCurrentUserId = String(currentUserId || '').trim();
    if (!normalizedCurrentUserId) return false;
    return Boolean(
      senderUserId &&
      recipientUserId &&
      senderUserId === normalizedCurrentUserId &&
      recipientUserId === normalizedCurrentUserId
    );
  };
  const threadsWithMailbox = useMemo(
    () =>
      (threads || [])
        .filter((thread) => !deletedThreadKeys.includes(String(thread?.thread_key || thread?.id || '').trim()))
        .filter((thread) => !isSelfMarketplaceThread(thread))
        .map((thread) => {
          const sanitizedThread = filterMarketplaceParticipantMessages(thread, currentSenderRole);
          return {
          ...sanitizedThread,
          current_sender_role: currentSenderRole,
          mailbox: getMailboxForThread(sanitizedThread, currentUserId),
          roleContext: getThreadRoleContext(sanitizedThread, currentSenderRole),
          roleBucket: getThreadRoleBucket(sanitizedThread, currentSenderRole),
          inboxLane: getThreadInboxLane(sanitizedThread, currentSenderRole),
        };
        }),
    [threads, currentUserId, currentSenderRole, deletedThreadKeys]
  );

  const dedupeMarketplaceThreads = useCallback((items = []) => {
    const preferredThreadType = activeMode === 'owner' ? 'marketplace_owner_request' : 'marketplace_customer_request';
    const preferredRoleContext = activeMode === 'owner' ? 'owner' : 'customer';
    const ranked = new Map();

    const getMarketplaceRequestId = (thread) => {
      const metadata = thread?.metadata && typeof thread.metadata === 'object' ? thread.metadata : {};
      const href = String(metadata.href || '').trim();
      const hrefMatch = href.match(/\/account\/rentals\/requests\/([^/?#]+)/i);
      return String(
        metadata.requestId ||
        thread?.entity_id ||
        thread?.context_id ||
        (hrefMatch?.[1] ? decodeURIComponent(hrefMatch[1]) : '') ||
        ''
      ).trim();
    };

    const scoreThread = (thread) => {
      const metadata = thread?.metadata && typeof thread.metadata === 'object' ? thread.metadata : {};
      const threadType = String(thread?.thread_type || '').trim().toLowerCase();
      const roleContext = String(thread?.roleContext || thread?.role_context || thread?.roleContext || thread?.roleBucket || '').trim().toLowerCase();
      const requestStatus = String(metadata.requestStatus || metadata.status || '').trim().toLowerCase();
      let score = 0;
      if (threadType === preferredThreadType) score += 50;
      if (String(thread?.roleContext || '').trim().toLowerCase() === preferredRoleContext) score += 35;
      if (String(metadata.roleContext || metadata.role_context || '').trim().toLowerCase() === preferredRoleContext) score += 30;
      if (['approved', 'active', 'completed'].includes(requestStatus)) score += 12;
      if (requestStatus === 'expired') score -= 12;
      score += new Date(thread?.latest_message_at || thread?.at || thread?.updated_at || 0).getTime() / 1e13;
      return score;
    };

    items.forEach((thread) => {
      if (String(thread?.family || '').trim().toLowerCase() !== 'marketplace') {
        ranked.set(`thread:${String(thread?.thread_key || thread?.id || Math.random())}`, thread);
        return;
      }

      const requestId = getMarketplaceRequestId(thread);
      if (!requestId) {
        ranked.set(`thread:${String(thread?.thread_key || thread?.id || Math.random())}`, thread);
        return;
      }

      const key = `marketplace:${requestId}`;
      const existing = ranked.get(key);
      if (!existing || scoreThread(thread) > scoreThread(existing)) {
        ranked.set(key, thread);
      }
    });

    return Array.from(ranked.values());
  }, [activeMode]);

  const modeEligibleThreads = useMemo(
    () =>
      dedupeMarketplaceThreads(threadsWithMailbox.filter((thread) => {
        if (thread.mailbox === MAILBOXES.archive) return false;
        if (laneModel === 'team' || laneModel === 'admin') {
          return true;
        }
        const threadType = String(thread?.thread_type || thread?.threadType || '').trim().toLowerCase();
        if (activeMode === 'owner') {
          if (threadType === 'marketplace_customer_request') return false;
          return thread.roleContext === 'owner' || thread.roleContext === 'verification' || thread.roleContext === 'support';
        }
        if (threadType === 'marketplace_owner_request') return false;
        return thread.roleContext === 'customer' || thread.roleContext === 'verification' || thread.roleContext === 'support';
      })),
    [activeMode, dedupeMarketplaceThreads, laneModel, threadsWithMailbox]
  );

  const dedupedModeThreads = useMemo(() => {
    const seenVerificationKeys = new Set();
    return modeEligibleThreads.filter((thread) => {
      if (thread.roleBucket !== 'verification') return true;
      const metadata = thread?.metadata && typeof thread.metadata === 'object' ? thread.metadata : {};
      const verificationKey = String(
        thread?.entity_id ||
        metadata.entityId ||
        metadata.userId ||
        metadata.reviewTargetId ||
        thread?.recipient_user_id ||
        thread?.sender_user_id ||
        thread?.thread_key ||
        thread?.id ||
        ''
      ).trim();
      if (!verificationKey) return true;
      if (seenVerificationKeys.has(verificationKey)) return false;
      seenVerificationKeys.add(verificationKey);
      return true;
    });
  }, [modeEligibleThreads]);

  const conversationLaneThreads = useMemo(
    () => dedupedModeThreads.filter((thread) => thread.inboxLane === 'conversations'),
    [dedupedModeThreads]
  );
  const supportLaneThreads = useMemo(
    () => dedupedModeThreads.filter((thread) => thread.inboxLane === 'support'),
    [dedupedModeThreads]
  );
  const updatesLaneThreads = useMemo(
    () => dedupedModeThreads.filter((thread) => thread.inboxLane === 'updates'),
    [dedupedModeThreads]
  );
  const reviewsLaneThreads = useMemo(
    () => dedupedModeThreads.filter((thread) => thread.inboxLane === 'reviews'),
    [dedupedModeThreads]
  );
  const internalLaneThreads = useMemo(
    () => dedupedModeThreads.filter((thread) => thread.inboxLane === 'internal'),
    [dedupedModeThreads]
  );
  const laneThreadMap = useMemo(
    () => ({
      conversations: conversationLaneThreads,
      support: supportLaneThreads,
      updates: updatesLaneThreads,
      reviews: reviewsLaneThreads,
      internal: internalLaneThreads,
    }),
    [conversationLaneThreads, internalLaneThreads, reviewsLaneThreads, supportLaneThreads, updatesLaneThreads]
  );
  const laneEligibleThreads = laneThreadMap[activeInboxLane] || [];
  const activeWorkflowReviewThreads = useMemo(
    () => reviewsLaneThreads.filter((thread) => !isCompletedWorkflowThread(thread)),
    [reviewsLaneThreads]
  );
  const archivedWorkflowReviewThreads = useMemo(
    () => reviewsLaneThreads.filter((thread) => isCompletedWorkflowThread(thread)),
    [reviewsLaneThreads]
  );

  const getThreadMatchesSearch = (thread) => {
    const needle = String(search || '').trim().toLowerCase();
    if (!needle) return true;
    return [
      thread?.subject,
      thread?.latest_message,
      thread?.entity_name,
      thread?.entity_email,
      thread?.sender_name,
      thread?.sender_email,
      thread?.recipient_name,
      thread?.recipient_email,
      thread?.subtitle,
      thread?.summary,
    ].filter(Boolean).join(' ').toLowerCase().includes(needle);
  };

  const verificationThreads = useMemo(
    () => [...updatesLaneThreads, ...reviewsLaneThreads].filter((thread) => thread.roleBucket === 'verification'),
    [reviewsLaneThreads, updatesLaneThreads]
  );
  const marketplaceThreads = useMemo(
    () => laneEligibleThreads.filter((thread) => ['my_rentals', 'marketplace_requests', 'incoming_requests', 'active_rentals'].includes(thread.roleBucket)),
    [laneEligibleThreads]
  );
  const verificationPendingCount = useMemo(
    () =>
      verificationThreads.reduce((total, thread) => {
        const metadata = thread?.metadata && typeof thread.metadata === 'object' ? thread.metadata : {};
        const status = String(
          metadata.verificationStatus ||
          metadata.status ||
          thread?.status ||
          ''
        ).trim().toLowerCase();
        if (status !== 'pending') return total;
        const documentTypes = Array.isArray(metadata.documentTypes)
          ? metadata.documentTypes.filter(Boolean)
          : [];
        return total + Math.max(documentTypes.length, 1);
      }, 0),
    [verificationThreads]
  );
  const effectiveVerificationCount = Number.isFinite(Number(contextCounts?.verification))
    ? Number(contextCounts.verification)
    : verificationPendingCount;

  const contextTabs = useMemo(() => {
    const tabs = [
      {
        key: 'marketplace',
        title: tr('Marketplace', 'Marketplace'),
        count: marketplaceThreads.length,
        threads: marketplaceThreads.filter(getThreadMatchesSearch),
      },
    ];

    if (effectiveVerificationCount > 0 && verificationThreads.length > 0) {
      tabs.unshift({
        key: 'verification',
        title: tr('Identity', 'Identité'),
        count: effectiveVerificationCount,
        threads: verificationThreads.filter(getThreadMatchesSearch),
      });
    }

    return tabs;
  }, [effectiveVerificationCount, marketplaceThreads, search, tr, verificationThreads]);

  const getContextTabForThread = (thread) => {
    if (!thread) return 'marketplace';
    if (thread.roleBucket === 'verification') return 'verification';
    return 'marketplace';
  };

  const findThreadKeyByRequestId = (requestId) => {
    const normalizedRequestId = String(requestId || '').trim();
    if (!normalizedRequestId) return '';

    const candidateThreads = threadsWithMailbox;
    const preferredThreadType = activeMode === 'owner' ? 'marketplace_owner_request' : 'marketplace_customer_request';
    const matchingThreads = candidateThreads.filter((thread) => {
      const metadata = thread?.metadata && typeof thread.metadata === 'object' ? thread.metadata : {};
      const href = String(metadata.href || '').trim();
      const metadataRequestId = String(metadata.requestId || '').trim();
      const family = String(thread?.family || '').trim().toLowerCase();
      const entityId = String(thread?.entity_id || '').trim();
      const contextId = String(thread?.context_id || '').trim();
      const hasVerificationMessageMatch = family === 'verification' && (Array.isArray(thread?.messages) ? thread.messages : []).some((message) => {
        const messageMetadata = message?.metadata && typeof message.metadata === 'object' ? message.metadata : {};
        return String(
          messageMetadata.verificationRequestId ||
          messageMetadata.requestId ||
          messageMetadata.documentId ||
          ''
        ).trim() === normalizedRequestId;
      });

      return (
        metadataRequestId === normalizedRequestId ||
        entityId === normalizedRequestId ||
        contextId === normalizedRequestId ||
        hasVerificationMessageMatch ||
        href.includes(`/account/rentals/requests/${encodeURIComponent(normalizedRequestId)}`) ||
        href.includes(`/account/rentals/requests/${normalizedRequestId}`) ||
        href.includes(`requestId=${encodeURIComponent(normalizedRequestId)}`) ||
        href.includes(`requestId=${normalizedRequestId}`)
      );
    });

    const matchingThread =
      matchingThreads.find((thread) => String(thread?.family || '').trim().toLowerCase() === 'verification') ||
      matchingThreads.find(
        (thread) => String(thread?.thread_type || thread?.threadType || '').trim().toLowerCase() === preferredThreadType
      ) ||
      matchingThreads[0] ||
      null;

    return String(matchingThread?.thread_key || matchingThread?.id || '').trim();
  };

  const threadMatchesRequestId = (thread, requestId) => {
    const normalizedRequestId = String(requestId || '').trim();
    if (!normalizedRequestId || !thread) return false;
    const metadata = thread?.metadata && typeof thread.metadata === 'object' ? thread.metadata : {};
    const href = String(metadata.href || '').trim();
    const metadataRequestId = String(metadata.requestId || '').trim();
    const family = String(thread?.family || '').trim().toLowerCase();
    const entityId = String(thread?.entity_id || '').trim();
    const contextId = String(thread?.context_id || '').trim();
    const hasVerificationMessageMatch = family === 'verification' && (Array.isArray(thread?.messages) ? thread.messages : []).some((message) => {
      const messageMetadata = message?.metadata && typeof message.metadata === 'object' ? message.metadata : {};
      return String(
        messageMetadata.verificationRequestId ||
        messageMetadata.requestId ||
        messageMetadata.documentId ||
        ''
      ).trim() === normalizedRequestId;
    });

    return (
      metadataRequestId === normalizedRequestId ||
      entityId === normalizedRequestId ||
      contextId === normalizedRequestId ||
      hasVerificationMessageMatch ||
      href.includes(`/account/rentals/requests/${encodeURIComponent(normalizedRequestId)}`) ||
      href.includes(`/account/rentals/requests/${normalizedRequestId}`) ||
      href.includes(`requestId=${encodeURIComponent(normalizedRequestId)}`) ||
      href.includes(`requestId=${normalizedRequestId}`)
    );
  };

  const activeTabConfig = useMemo(
    () => contextTabs.find((tab) => tab.key === activeContextTab) || null,
    [activeContextTab, contextTabs]
  );

  const shouldShowCustomerContextTabs = showContextTabs && laneModel === 'account' && activeInboxLane === 'conversations';

  const visibleThreads = activeInboxLane === 'conversations' && shouldShowCustomerContextTabs
    ? (activeTabConfig?.threads || [])
    : laneEligibleThreads.filter(getThreadMatchesSearch);

  const filteredVisibleThreads = useMemo(
    () =>
      visibleThreads.filter((thread) => {
        const mailbox = thread?.mailbox || getMailboxForThread(thread, currentUserId);
        const needsReplyState = getNeedsReplyState(thread, currentUserId);
        if (activeInboxLane === 'reviews') {
          const isCompletedWorkflow = isCompletedWorkflowThread(thread);
          if (activeListFilter === 'history') {
            return mailbox === MAILBOXES.archive || needsReplyState === 'resolved' || thread?.resolved_at || isCompletedWorkflow;
          }
          if (isCompletedWorkflow) return false;
        }
        if (activeListFilter === 'archived') return mailbox === MAILBOXES.archive;
        if (mailbox === MAILBOXES.archive) return false;
        if (activeListFilter === 'unread') return Number(thread?.unread_count || 0) > 0;
        if (activeListFilter === 'needs_reply') return needsReplyState === 'needs_reply';
        return true;
      }),
    [activeInboxLane, activeListFilter, currentUserId, visibleThreads]
  );

  const listSurfaceClass = workspaceContext === 'support'
    ? 'bg-slate-50'
    : 'bg-white';
  const listFiltersWrapClass = workspaceContext === 'support'
    ? 'rounded-[18px] border border-slate-200 bg-slate-100/80 p-1.5'
    : '';
  const workspaceIdentity = formatWorkspaceIdentity(currentUserLabel);
  const laneMetaMap = useMemo(() => {
    if (laneModel === 'team') {
      return {
        support: {
          label: tr('Team inbox', "Boîte d’équipe"),
          lead: tr('Internal staff conversations and team coordination.', "Conversations internes du personnel et coordination d’équipe."),
          showSupportCta: false,
        },
      };
    }

    if (laneModel === 'admin') {
      return {
        conversations: {
          label: tr('Customer conversations', 'Conversations client'),
          lead: tr('Live renter, owner, and customer-facing conversations.', 'Conversations en direct entre locataires, propriétaires et clients.'),
          showSupportCta: false,
        },
        reviews: {
          label: tr('Workflow reviews', 'Revues workflow'),
          lead: tr('Verification, listing review, and other workflow-driven threads.', 'Vérification, revue des annonces et autres fils pilotés par workflow.'),
          showSupportCta: false,
        },
        support: {
          label: tr('Support cases', 'Cas support'),
          lead: tr('Customer support requests, escalations, and resolution work.', 'Demandes support client, escalades et travail de résolution.'),
          showSupportCta: false,
        },
      };
    }

    return {
      conversations: {
        label: currentSenderRole === 'owner'
          ? tr(`Owner conversations${workspaceIdentity ? `: ${workspaceIdentity}` : ''}`, `Conversations propriétaire${workspaceIdentity ? ` : ${workspaceIdentity}` : ''}`)
          : workspaceIdentity
            ? tr(`Conversations: ${workspaceIdentity}`, `Conversations : ${workspaceIdentity}`)
            : tr('Conversations', 'Conversations'),
        lead: tr('Booking and marketplace conversations that need normal follow-up.', 'Conversations réservation et marketplace qui demandent un suivi normal.'),
        showSupportCta: false,
      },
      support: {
        label: tr('Support', 'Support'),
        lead: tr('Get help from the team without mixing support into your normal conversations.', "Obtenez de l’aide de l’équipe sans mélanger le support avec vos conversations normales."),
        showSupportCta: true,
      },
      updates: {
        label: tr('Updates', 'Mises à jour'),
        lead: tr('Workflow updates like identity review and other admin-driven status changes.', 'Mises à jour workflow comme la revue d’identité et les autres changements de statut pilotés par l’admin.'),
        showSupportCta: false,
      },
    };
  }, [currentSenderRole, laneModel, tr, workspaceIdentity]);
  const activeLaneMeta = laneMetaMap[activeInboxLane] || laneMetaMap[defaultInboxLane] || {
    label: tr('Inbox', 'Boîte de réception'),
    lead: tr('Stay on top of important conversations and workflow updates.', 'Gardez le contrôle sur les conversations importantes et les mises à jour workflow.'),
    showSupportCta: false,
  };
  const isReviewHistoryFilter = activeInboxLane === 'reviews' && activeListFilter === 'history';
  const workspaceEyebrow = isReviewHistoryFilter
    ? tr('Workflow review history', 'Historique des revues workflow')
    : activeLaneMeta.label;
  const workspaceLead = isReviewHistoryFilter
    ? tr(
        'Completed verification and listing reviews live here, so the active queue stays focused on open work.',
        'Les revues de vérification et d’annonces terminées vivent ici afin que la file active reste concentrée sur le travail en cours.'
      )
    : activeLaneMeta.lead;
  const compactLaneHeader = laneModel === 'account' && activeInboxLane === 'updates';
  const getThreadTypeBadgeLabel = (thread) => {
    const family = String(thread?.family || '').trim().toLowerCase();
    if (family === 'marketplace') return tr('Marketplace request', 'Demande marketplace');
    if (family === 'verification') return tr('Identity', 'Identité');
    if (family === 'bookings') return tr('Rental', 'Location');
    if (family === 'tours') return tr('Tour', 'Tour');
    if (family === 'support') return tr('Support', 'Support');
    return tr('Thread', 'Fil');
  };
  const getThreadTypeBadgeClassName = (thread, selected = false) => {
    const family = String(thread?.family || '').trim().toLowerCase();
    if (selected) {
      if (family === 'marketplace') return 'bg-violet-100 text-violet-700';
      if (family === 'verification') return 'bg-amber-100 text-amber-700';
      if (family === 'bookings') return 'bg-sky-100 text-sky-700';
      if (family === 'tours') return 'bg-amber-100 text-amber-700';
      if (family === 'support') return 'bg-rose-100 text-rose-700';
      return 'bg-slate-100 text-slate-700';
    }

    if (family === 'marketplace') return 'bg-violet-50 text-violet-700 ring-1 ring-violet-100';
    if (family === 'verification') return 'bg-amber-50 text-amber-700 ring-1 ring-amber-100';
    if (family === 'bookings') return 'bg-sky-50 text-sky-700 ring-1 ring-sky-100';
    if (family === 'tours') return 'bg-amber-50 text-amber-700 ring-1 ring-amber-100';
    if (family === 'support') return 'bg-rose-50 text-rose-700 ring-1 ring-rose-100';
    return 'bg-slate-100 text-slate-600 ring-1 ring-slate-200';
  };

  const groupedVisibleThreads = useMemo(() => {
    if (!groupThreads) {
      return [
        {
          key: 'all_threads',
          title: '',
          threads: filteredVisibleThreads,
        },
      ];
    }

    if (workspaceContext === 'support' || workspaceContext === 'staff') {
      const groups = {
        needs_reply: [],
        open: [],
        resolved: [],
      };

      filteredVisibleThreads.forEach((thread) => {
        const waitingState = getNeedsReplyState(thread, currentUserId);
        if (waitingState === 'needs_reply') {
          groups.needs_reply.push(thread);
          return;
        }
        if (waitingState === 'resolved' || thread?.resolved_at) {
          groups.resolved.push(thread);
          return;
        }
        groups.open.push(thread);
      });

      return [
        { key: 'needs_reply', title: tr('Needs reply', 'À répondre'), threads: groups.needs_reply },
        { key: 'open', title: tr('Open', 'Ouverts'), threads: groups.open },
        { key: 'resolved', title: tr('Resolved', 'Résolus'), threads: groups.resolved },
      ];
    }

    if (activeInboxLane === 'reviews' && activeListFilter === 'history') {
      return [
        {
          key: 'completed_reviews',
          title: tr('Completed reviews', 'Revues terminées'),
          threads: filteredVisibleThreads,
        },
      ];
    }

    if (activeListFilter === 'archived') {
      return [
        {
          key: 'archived',
          title: tr('Archived', 'Archivés'),
          threads: filteredVisibleThreads,
        },
      ];
    }

    if (threadGroupingMode === 'transaction_hub') {
      const groups = {
        [MESSAGE_THREAD_SECTIONS.actions]: [],
        [MESSAGE_THREAD_SECTIONS.conversations]: [],
        [MESSAGE_THREAD_SECTIONS.updates]: [],
      };

      filteredVisibleThreads.forEach((thread) => {
        const section = classifyThreadSection(thread);
        groups[section] = [...(groups[section] || []), thread];
      });

      return [
        {
          key: MESSAGE_THREAD_SECTIONS.actions,
          title: tr('Actions required', 'Actions requises'),
          threads: groups[MESSAGE_THREAD_SECTIONS.actions] || [],
        },
        {
          key: MESSAGE_THREAD_SECTIONS.conversations,
          title: tr('Live conversations', 'Conversations en direct'),
          threads: groups[MESSAGE_THREAD_SECTIONS.conversations] || [],
        },
        {
          key: MESSAGE_THREAD_SECTIONS.updates,
          title: tr('Updates', 'Mises à jour'),
          threads: groups[MESSAGE_THREAD_SECTIONS.updates] || [],
        },
      ].filter((group) => group.threads.length > 0);
    }

    const groups = activeInboxLane === 'reviews'
      ? {
          needs_action: [],
          open_reviews: [],
        }
      : {
          needs_reply: [],
          active: [],
          archived: [],
        };

    filteredVisibleThreads.forEach((thread) => {
      const waitingState = getNeedsReplyState(thread, currentUserId);
      if (activeInboxLane === 'reviews') {
        if (waitingState === 'needs_reply') {
          groups.needs_action.push(thread);
          return;
        }
        groups.open_reviews.push(thread);
        return;
      }
      if (waitingState === 'needs_reply') {
        groups.needs_reply.push(thread);
        return;
      }
      if (waitingState === 'resolved' || thread?.resolved_at) {
        groups.archived.push(thread);
        return;
      }
      groups.active.push(thread);
    });

    if (activeInboxLane === 'reviews') {
      return [
        { key: 'needs_action', title: tr('Needs action', 'Action requise'), threads: groups.needs_action },
        { key: 'open_reviews', title: tr('Open reviews', 'Revues ouvertes'), threads: groups.open_reviews },
      ].filter((group) => group.threads.length > 0);
    }

    return [
      { key: 'needs_reply', title: tr('Needs reply', 'À répondre'), threads: groups.needs_reply },
      { key: 'active', title: tr('Active', 'Actifs'), threads: groups.active },
      { key: 'archived', title: tr('Archived', 'Archivés'), threads: groups.archived },
    ].filter((group) => group.threads.length > 0);
  }, [activeInboxLane, activeListFilter, currentUserId, filteredVisibleThreads, groupThreads, threadGroupingMode, tr, workspaceContext]);

  const listFilterOptions = useMemo(() => {
    if (activeInboxLane === 'reviews') {
      return [
        {
          key: 'all',
          label: tr('Active queue', 'File active'),
          count: visibleThreads.filter((thread) => {
            const mailbox = thread?.mailbox || getMailboxForThread(thread, currentUserId);
            if (mailbox === MAILBOXES.archive) return false;
            return !isCompletedWorkflowThread(thread);
          }).length,
        },
        {
          key: 'unread',
          label: tr('Unread', 'Non lus'),
          count: visibleThreads.filter((thread) => {
            const mailbox = thread?.mailbox || getMailboxForThread(thread, currentUserId);
            if (mailbox === MAILBOXES.archive) return false;
            if (isCompletedWorkflowThread(thread)) return false;
            return Number(thread?.unread_count || 0) > 0;
          }).length,
        },
        {
          key: 'needs_reply',
          label: tr('Needs action', 'Action requise'),
          count: visibleThreads.filter((thread) => {
            const mailbox = thread?.mailbox || getMailboxForThread(thread, currentUserId);
            if (mailbox === MAILBOXES.archive) return false;
            if (isCompletedWorkflowThread(thread)) return false;
            return getNeedsReplyState(thread, currentUserId) === 'needs_reply';
          }).length,
        },
        {
          key: 'history',
          label: tr('Completed', 'Terminées'),
          count: visibleThreads.filter((thread) => {
            const mailbox = thread?.mailbox || getMailboxForThread(thread, currentUserId);
            return mailbox === MAILBOXES.archive || isCompletedWorkflowThread(thread);
          }).length,
        },
      ];
    }

    return [
      {
        key: 'all',
        label: tr('All', 'Tous'),
        count: visibleThreads.filter((thread) => {
          const mailbox = thread?.mailbox || getMailboxForThread(thread, currentUserId);
          if (mailbox === MAILBOXES.archive) return false;
          return true;
        }).length,
      },
      {
        key: 'unread',
        label: tr('Unread', 'Non lus'),
        count: visibleThreads.filter((thread) => {
          const mailbox = thread?.mailbox || getMailboxForThread(thread, currentUserId);
          if (mailbox === MAILBOXES.archive) return false;
          return Number(thread?.unread_count || 0) > 0;
        }).length,
      },
      {
        key: 'needs_reply',
        label: tr('Needs reply', 'À répondre'),
        count: visibleThreads.filter((thread) => {
          const mailbox = thread?.mailbox || getMailboxForThread(thread, currentUserId);
          if (mailbox === MAILBOXES.archive) return false;
          return getNeedsReplyState(thread, currentUserId) === 'needs_reply';
        }).length,
      },
      {
        key: 'archived',
        label: tr('Archived', 'Archivés'),
        count: visibleThreads.filter((thread) => {
          const mailbox = thread?.mailbox || getMailboxForThread(thread, currentUserId);
          return mailbox === MAILBOXES.archive;
        }).length,
      },
    ];
  }, [activeInboxLane, currentUserId, tr, visibleThreads]);

  const getThreadIdentityLabel = (thread, counterparty) => {
    const family = String(thread?.family || '').trim().toLowerCase();
    const counterpartyName = String(counterparty?.name || counterparty?.email || '').trim();

    if (family === 'support' && currentSenderRole !== 'admin') {
      return tr('Driveout Support', 'Support Driveout');
    }

    if (family === 'verification' && currentSenderRole !== 'admin') {
      return tr('Driveout Identity Review', 'Révision identité Driveout');
    }

    if (family === 'marketplace') {
      return capitalizeFirstLetter(counterpartyName || thread.subject || tr('Marketplace request', 'Demande marketplace'));
    }

    return capitalizeFirstLetter(counterpartyName || thread.subject || tr('Message thread', 'Fil de messages'));
  };

  const getThreadContextLabel = (thread) => {
    const family = String(thread?.family || '').trim().toLowerCase();
    const metadata = thread?.metadata && typeof thread.metadata === 'object' ? thread.metadata : {};
    const identityLabel = getThreadIdentityLabel(thread, getOtherParty(thread, currentUserId, tr, currentSenderRole));

    if (family === 'verification') {
      const detail = String(thread?.subtitle || '').trim();
      return detail && detail !== identityLabel ? detail : '';
    }
    if (family === 'support') {
      const detail = String(thread?.subtitle || '').trim();
      return detail && detail !== identityLabel ? detail : '';
    }
    if (family === 'marketplace') {
      const detail = String(
        thread?.subject ||
        thread?.entity_name ||
        thread?.subtitle ||
        metadata.listingTitle ||
        metadata.vehicleName ||
        ''
      ).trim();
      return detail && detail !== identityLabel ? detail : '';
    }
    const detail = String(thread?.subject || thread?.entity_name || thread?.subtitle || '').trim();
    return detail && detail !== identityLabel ? detail : '';
  };

  const getThreadAdminEmailLabel = (thread, counterparty) => {
    if (currentSenderRole !== 'admin') return '';
    const email = String(counterparty?.email || '').trim();
    if (!email) return '';
    const name = String(counterparty?.name || '').trim().toLowerCase();
    if (name && name === email.toLowerCase()) return '';
    return email;
  };

  const getThreadAvatarLabel = (thread, counterparty) => {
    const identity = getThreadIdentityLabel(thread, counterparty);
    const tokens = String(identity).trim().split(/\s+/).filter(Boolean);
    const initials = tokens.slice(0, 2).map((part) => part[0]).join('').toUpperCase();
    return initials || 'DM';
  };

  const getThreadAvatarUrl = (thread, counterparty) => {
    const normalizedCounterpartyId = String(counterparty?.userId || '').trim();
    if (!normalizedCounterpartyId) {
      return '';
    }

    const profile = getThreadUserProfile(thread, normalizedCounterpartyId);
    const candidateUrl = String(profile?.avatarUrl || '').trim();
    if (!candidateUrl) return '';
    if (
      candidateUrl.startsWith('https://') ||
      candidateUrl.startsWith('http://') ||
      candidateUrl.startsWith('blob:') ||
      candidateUrl.startsWith('data:image/')
    ) {
      return candidateUrl;
    }
    return '';
  };

  const getThreadAvatarClassName = (thread, selected = false, hasUnread = false) => {
    const family = String(thread?.family || '').trim().toLowerCase();
    const counterparty = getOtherParty(thread, currentUserId, tr, currentSenderRole);
    const identity = String(getThreadIdentityLabel(thread, counterparty) || '').trim();
    const normalizedIdentity = identity.toLowerCase();

    const pickVariant = (variant) => (
      selected
        ? variant.selected
        : hasUnread
          ? variant.unread
          : variant.default
    );

    if (normalizedIdentity.includes('driveout support') || family === 'support') {
      return pickVariant({
        default: 'bg-rose-50/90 text-rose-700 ring-rose-100',
        unread: 'bg-rose-50 text-rose-700 ring-rose-200',
        selected: 'bg-rose-100 text-rose-800 ring-rose-300 shadow-[0_8px_18px_rgba(244,63,94,0.14)]',
      });
    }

    if (
      normalizedIdentity.includes('driveout verification') ||
      normalizedIdentity.includes('driveout identity review') ||
      normalizedIdentity.includes('identity review driveout') ||
      normalizedIdentity.includes('verification driveout') ||
      normalizedIdentity.includes('driveout') ||
      family === 'verification'
    ) {
      return pickVariant({
        default: 'bg-amber-50/90 text-amber-700 ring-amber-100',
        unread: 'bg-amber-50 text-amber-700 ring-amber-200',
        selected: 'bg-amber-100 text-amber-800 ring-amber-300 shadow-[0_8px_18px_rgba(245,158,11,0.16)]',
      });
    }

    const hashSource = normalizedIdentity || String(thread?.thread_key || thread?.id || family || 'thread');
    let hash = 0;
    for (let index = 0; index < hashSource.length; index += 1) {
      hash = (hash * 31 + hashSource.charCodeAt(index)) % 2147483647;
    }
    const variant = AVATAR_COLOR_VARIANTS[Math.abs(hash) % AVATAR_COLOR_VARIANTS.length];
    return pickVariant(variant);
  };

  const getThreadStatusIconMeta = (thread) => {
    const family = String(thread?.family || '').trim().toLowerCase();
    const waitingState = getNeedsReplyState(thread, currentUserId);
    const verificationStatus = String(
      thread?.metadata?.verificationStatus ||
      thread?.metadata?.status ||
      thread?.status ||
      ''
    ).trim().toLowerCase();
    const requestStatus = String(
      thread?.metadata?.requestStatus ||
      thread?.metadata?.status ||
      ''
    ).trim().toLowerCase();

    if (waitingState === 'needs_reply') {
      return {
        icon: AlertCircle,
        className: 'text-rose-600',
        title: tr('Needs reply', 'À répondre'),
      };
    }

    if (family === 'verification' && verificationStatus === 'approved') {
      return {
        icon: CheckCircle2,
        className: 'text-emerald-600',
        title: tr('Verified', 'Vérifié'),
      };
    }

    if (family === 'verification' && ['pending', 'submitted', 'review'].includes(verificationStatus)) {
      return {
        icon: Clock3,
        className: 'text-amber-500',
        title: tr('In review', 'En révision'),
      };
    }

    if (family === 'marketplace' && ['pending', 'countered', 'pre_approved'].includes(requestStatus)) {
      return {
        icon: Clock3,
        className: 'text-amber-500',
        title: tr('Pending', 'En attente'),
      };
    }

    return {
      icon: CheckCircle2,
      className: 'text-emerald-600',
      title: tr('Updated', 'Mis à jour'),
    };
  };

  const getThreadRowToneClass = (thread, selected = false, hasUnread = false) => {
    const family = String(thread?.family || '').trim().toLowerCase();
    const metadata = thread?.metadata && typeof thread.metadata === 'object' ? thread.metadata : {};
    const verificationStatus = String(
      metadata.verificationStatus ||
      metadata.status ||
      thread?.status ||
      ''
    ).trim().toLowerCase();

    if (selected) {
      return 'border-violet-200 bg-violet-50/90 shadow-[0_10px_24px_rgba(139,92,246,0.10)]';
    }

    if (family === 'verification') {
      if (['rejected', 'needs_info', 'needs_changes', 'suspended', 'expired'].includes(verificationStatus)) {
        return 'border-amber-200 bg-amber-50/60 hover:border-amber-300 hover:bg-amber-50/80';
      }
      if (verificationStatus === 'approved') {
        return 'border-emerald-200 bg-emerald-50/50 hover:border-emerald-300 hover:bg-emerald-50/70';
      }
    }

    if (hasUnread) {
      return 'border-slate-200 bg-slate-50/95 hover:border-slate-300 hover:bg-slate-100';
    }

    return 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50';
  };

  useEffect(() => {
    const normalizedInitialLane = String(initialInboxLane || '').trim().toLowerCase();
    if (!normalizedInitialLane) return;
    if (!laneMetaMap[normalizedInitialLane]) return;
    setActiveInboxLane(normalizedInitialLane);
  }, [initialInboxLane, laneMetaMap]);

  useEffect(() => {
    if (!laneMetaMap[activeInboxLane]) {
      setActiveInboxLane(defaultInboxLane);
    }
  }, [activeInboxLane, defaultInboxLane, laneMetaMap]);

  useEffect(() => {
    if (activeInboxLane !== 'reviews') return;
    if (activeListFilter === 'archived') {
      setActiveListFilter('history');
    }
  }, [activeInboxLane, activeListFilter]);

  useEffect(() => {
    if (activeInboxLane === 'reviews') return;
    if (activeListFilter === 'history') {
      setActiveListFilter('all');
    }
  }, [activeInboxLane, activeListFilter]);

  useEffect(() => {
    if (!shouldShowCustomerContextTabs) return;
    const preferredTab = effectiveVerificationCount > 0
      ? 'verification'
      : contextTabs.find((tab) => tab.count > 0)?.key || 'marketplace';
    const hasPendingVerification = effectiveVerificationCount > 0;

    if (!activeContextTab || !contextTabs.some((tab) => tab.key === activeContextTab)) {
      setActiveContextTab(hasPendingVerification ? 'verification' : preferredTab);
    }
  }, [activeContextTab, contextTabs, effectiveVerificationCount, shouldShowCustomerContextTabs]);

  useEffect(() => {
    setShouldHonorInitialSelection(true);
  }, [initialSelectedRequestId, initialSelectedThreadKey]);

  useEffect(() => {
    const requestedThreadKey = String(initialSelectedThreadKey || '').trim();
    const requestedRequestId = String(initialSelectedRequestId || '').trim();
    const requestMatchedThread = requestedRequestId
      ? (
          threadsWithMailbox.find((thread) => String(thread?.family || '').trim().toLowerCase() === 'verification' && threadMatchesRequestId(thread, requestedRequestId)) ||
          threadsWithMailbox.find((thread) => threadMatchesRequestId(thread, requestedRequestId)) ||
          null
        )
      : null;
    const requestedThreadExists = requestedThreadKey
      ? threadsWithMailbox.some((thread) => String(thread.thread_key || thread.id) === requestedThreadKey)
      : false;
    const resolvedRequestedThreadKey = requestMatchedThread
      ? String(requestMatchedThread.thread_key || requestMatchedThread.id || '').trim()
      : requestedThreadExists
        ? requestedThreadKey
        : findThreadKeyByRequestId(requestedRequestId) || requestedThreadKey;
    if (!resolvedRequestedThreadKey) return;
    if (!shouldHonorInitialSelection) return;
    if (hasExplicitThreadSelection) return;
    const matchingThread =
      requestMatchedThread ||
      threadsWithMailbox.find(
        (thread) => String(thread.thread_key || thread.id) === resolvedRequestedThreadKey
      );
    if (!matchingThread) return;

    if (shouldShowCustomerContextTabs) {
      setActiveContextTab(getContextTabForThread(matchingThread));
    }
    setActiveListFilter(activeInboxLane === 'reviews' || String(matchingThread?.inboxLane || '').trim().toLowerCase() === 'reviews' ? 'all' : 'all');
    setActiveInboxLane(String(matchingThread.inboxLane || defaultInboxLane));
    setSelectedThreadKey(resolvedRequestedThreadKey);
    setHasExplicitThreadSelection(true);
  }, [activeInboxLane, activeMode, defaultInboxLane, hasExplicitThreadSelection, initialSelectedRequestId, initialSelectedThreadKey, laneEligibleThreads, shouldHonorInitialSelection, shouldShowCustomerContextTabs, threadsWithMailbox]);

  useEffect(() => {
    if (!filteredVisibleThreads.length) {
      setSelectedThreadKey('');
      setImmersiveMode(false);
      setHasExplicitThreadSelection(false);
      return;
    }
    if (!selectedThreadKey || !filteredVisibleThreads.some((thread) => String(thread.thread_key || thread.id) === String(selectedThreadKey))) {
      setSelectedThreadKey(String(filteredVisibleThreads[0].thread_key || filteredVisibleThreads[0].id));
    }
  }, [filteredVisibleThreads, selectedThreadKey]);

  useEffect(() => {
    if (isCompactViewport && selectedThreadKey && hasExplicitThreadSelection) {
      setImmersiveMode(true);
      return;
    }
    setImmersiveMode(false);
  }, [selectedThreadKey, isCompactViewport, hasExplicitThreadSelection]);

  useEffect(() => {
    if (typeof onMobileConversationStateChange !== 'function') return;
    onMobileConversationStateChange(Boolean(isCompactViewport && immersiveMode));
  }, [immersiveMode, isCompactViewport, onMobileConversationStateChange]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const handleResize = () => {
      setIsCompactViewport(window.innerWidth < 1024);
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleSelectThread = (threadKey) => {
    const matchedThread = dedupedModeThreads.find(
      (thread) => String(thread.thread_key || thread.id) === String(threadKey)
    );
    if (matchedThread && shouldShowCustomerContextTabs) {
      setActiveContextTab(getContextTabForThread(matchedThread));
    }
    if (matchedThread?.inboxLane && matchedThread.inboxLane !== activeInboxLane) {
      setActiveInboxLane(matchedThread.inboxLane);
    }
    setSelectedThreadKey(threadKey);
    setHasExplicitThreadSelection(true);
  };

  const handleSupportAction = async () => {
    if (typeof onSupportAction !== 'function' || supportActionBusy) return;

    try {
      setSupportActionBusy(true);
      setSearch('');
      setActiveListFilter('all');
      setShouldHonorInitialSelection(false);
      const nextThreadKey = await onSupportAction();
      const normalizedThreadKey = String(nextThreadKey || '').trim();
      if (normalizedThreadKey) {
        setSelectedThreadKey(normalizedThreadKey);
        setHasExplicitThreadSelection(true);
      }
    } finally {
      setSupportActionBusy(false);
    }
  };

  const inboxLaneButtons = useMemo(() => {
    if (laneModel === 'team') {
      return [
        {
          key: 'support',
          label: tr('Team inbox', "Boîte d’équipe"),
          count: supportLaneThreads.length,
        },
      ];
    }

    if (laneModel === 'admin') {
      return [
        {
          key: 'conversations',
          label: tr('Customer conversations', 'Conversations client'),
          count: conversationLaneThreads.length,
        },
        {
          key: 'reviews',
          label: tr('Workflow reviews', 'Revues workflow'),
          count: activeWorkflowReviewThreads.length,
        },
        {
          key: 'support',
          label: tr('Support cases', 'Cas support'),
          count: supportLaneThreads.length,
        },
      ];
    }

    return [
      {
        key: 'conversations',
        label: tr('Conversations', 'Conversations'),
        count: conversationLaneThreads.length,
      },
      {
        key: 'support',
        label: tr('Support', 'Support'),
        count: supportLaneThreads.length,
      },
      {
        key: 'updates',
        label: tr('Updates', 'Mises à jour'),
        count: updatesLaneThreads.length,
      },
    ];
  }, [
    activeWorkflowReviewThreads.length,
    conversationLaneThreads.length,
    laneModel,
    supportLaneThreads.length,
    tr,
    updatesLaneThreads.length,
  ]);

  const selectedThread = useMemo(
    () => filteredVisibleThreads.find((thread) => String(thread.thread_key || thread.id) === String(selectedThreadKey)) || null,
    [filteredVisibleThreads, selectedThreadKey]
  );
  const fallbackVisibleThread = useMemo(
    () => filteredVisibleThreads[0] || null,
    [filteredVisibleThreads]
  );
  const resolvedRenderedThread = useMemo(() => {
    const baseThread = selectedThread || fallbackVisibleThread;
    if (isCompactViewport && !hasExplicitThreadSelection) {
      return null;
    }
    return baseThread;
  }, [fallbackVisibleThread, hasExplicitThreadSelection, isCompactViewport, selectedThread]);
  const renderedThreadWithContext = useMemo(() => {
    if (!resolvedRenderedThread) return null;
    const metadata = resolvedRenderedThread?.metadata && typeof resolvedRenderedThread.metadata === 'object' ? resolvedRenderedThread.metadata : {};
    const fallbackTimelineEvents = Array.isArray(metadata.timelineEvents) ? metadata.timelineEvents : [];

    return {
      ...resolvedRenderedThread,
      timeline_events: Array.isArray(resolvedRenderedThread?.timeline_events) && resolvedRenderedThread.timeline_events.length > 0
        ? resolvedRenderedThread.timeline_events
        : fallbackTimelineEvents,
    };
  }, [resolvedRenderedThread]);
  const renderedThreadContextData = useMemo(() => {
    if (!renderedThreadWithContext) return null;

    const metadata =
      renderedThreadWithContext?.metadata && typeof renderedThreadWithContext.metadata === 'object'
        ? renderedThreadWithContext.metadata
        : {};
    const family = String(renderedThreadWithContext?.family || '').trim().toLowerCase();
    const threadType = String(renderedThreadWithContext?.threadType || renderedThreadWithContext?.thread_type || '').trim().toLowerCase();

    if (!(family === 'bookings' || threadType === 'rental_booking' || metadata.rentalId || renderedThreadWithContext?.context_type === 'rental')) {
      return null;
    }

    return normalizeRentalThreadContext({
      id: renderedThreadWithContext?.context_id || renderedThreadWithContext?.entity_id || metadata.rentalId || renderedThreadWithContext?.id,
      rentalId: metadata.rentalId || metadata.reference || renderedThreadWithContext?.entity_id || renderedThreadWithContext?.context_id,
      reference: metadata.reference || metadata.rentalId || renderedThreadWithContext?.entity_id || renderedThreadWithContext?.context_id,
      vehicleName: metadata.vehicleName || renderedThreadWithContext?.subject || renderedThreadWithContext?.title || renderedThreadWithContext?.entity_name,
      modelName: metadata.vehicleName || renderedThreadWithContext?.subject || renderedThreadWithContext?.title || renderedThreadWithContext?.entity_name,
      startDate: metadata.startDate || null,
      endDate: metadata.endDate || null,
      status: metadata.status || renderedThreadWithContext?.status || '',
      paymentStatus: metadata.paymentStatus || '',
      outstanding: metadata.outstanding || 0,
      paid: metadata.paid || 0,
      depositMode: metadata.depositMode || '',
      depositAmount: metadata.depositAmount || 0,
      depositReturnedAt: metadata.depositReturnedAt || null,
      approvedExtensions: Array.isArray(metadata.approvedExtensions) ? metadata.approvedExtensions : [],
      extensions: Array.isArray(metadata.extensions) ? metadata.extensions : [],
      maintenanceCustomerChargeTotal: metadata.maintenanceCustomerChargeTotal || 0,
      fuelCharge: metadata.fuelCharge || 0,
      raw: metadata.raw || null,
    });
  }, [renderedThreadWithContext]);

  useEffect(() => {
    const threadKey = String(resolvedRenderedThread?.thread_key || '').trim();
    if (!threadKey || !resolvedRenderedThread?.unread_count || typeof onMarkThreadRead !== 'function') return;
    void onMarkThreadRead(resolvedRenderedThread);
  }, [onMarkThreadRead, resolvedRenderedThread]);

  const isMobileThreadOpen = Boolean(isCompactViewport && immersiveMode && hasExplicitThreadSelection && renderedThreadWithContext);
  const shouldShowMobileList = !isCompactViewport || !isMobileThreadOpen;
  const shouldShowMobileThread = !isCompactViewport || isMobileThreadOpen;
  const mobileVisibleThreadCount = filteredVisibleThreads.length;

  return (
    <section className="space-y-3">
      {error ? (
        <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
          {error}
        </div>
      ) : null}

      <div className={`${immersiveMode ? 'mt-0' : 'mt-1'} grid gap-2 ${immersiveMode ? 'h-[calc(100dvh-7.5rem)] min-h-[40rem]' : 'lg:h-[min(84vh,68rem)] lg:grid-cols-[328px_minmax(0,1fr)] lg:items-stretch lg:[grid-auto-rows:minmax(0,1fr)] xl:grid-cols-[356px_minmax(0,1fr)] 2xl:grid-cols-[372px_minmax(0,1fr)]'}`}>
        <div className={`${!shouldShowMobileList ? 'hidden' : ''} ${immersiveMode ? 'hidden' : `rounded-[28px] border border-slate-200 ${listSurfaceClass} p-3.5 shadow-[0_12px_30px_rgba(15,23,42,0.05)] lg:flex lg:min-h-0 lg:flex-col`}`}>
          {isCompactViewport ? (
            <div className="mb-2 rounded-[22px] border border-slate-200 bg-white px-4 py-3 shadow-[0_8px_18px_rgba(15,23,42,0.04)]">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">
                    {workspaceEyebrow}
                  </p>
                  <p className="mt-1 text-base font-black text-slate-950">
                    {activeLaneMeta.label}
                  </p>
                </div>
                <span className="inline-flex h-8 min-w-8 items-center justify-center rounded-full bg-violet-50 px-2.5 text-xs font-black text-violet-700">
                  {mobileVisibleThreadCount}
                </span>
              </div>
            </div>
          ) : null}
          <div className={`mb-2.5 rounded-[22px] border border-slate-200 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.96))] shadow-[0_10px_24px_rgba(15,23,42,0.04)] ${compactLaneHeader ? 'px-4 py-2.5' : 'px-4 py-3'}`}>
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">
                  {workspaceEyebrow}
                </p>
                <p className={`mt-1 text-sm font-semibold text-slate-500 ${compactLaneHeader ? 'line-clamp-1' : 'line-clamp-2'}`}>
                  {workspaceLead}
                </p>
              </div>
              {!immersiveMode ? (
                <button
                  type="button"
                  onClick={onRefresh}
                  disabled={loading}
                  className="inline-flex h-11 shrink-0 items-center gap-2 rounded-full border border-slate-200 bg-white px-3.5 text-sm font-bold text-slate-700 transition hover:border-violet-200 hover:text-violet-700 disabled:opacity-60"
                >
                  <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                  <span className="hidden sm:inline">{tr('Refresh', 'Actualiser')}</span>
                </button>
              ) : null}
            </div>

            <div className={`mt-3 flex gap-2 pb-1 ${compactLaneHeader ? 'flex-wrap overflow-visible' : 'overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'}`}>
              {inboxLaneButtons.map((lane) => (
                <button
                  key={lane.key}
                  type="button"
                  onClick={() => {
                    setActiveInboxLane(lane.key);
                    setActiveListFilter('all');
                    setHasExplicitThreadSelection(false);
                    setShouldHonorInitialSelection(false);
                  }}
                  className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-2.5 text-sm font-black tracking-[-0.01em] transition ${compactLaneHeader ? 'shrink' : 'shrink-0'} ${
                    activeInboxLane === lane.key
                      ? 'border-violet-200 bg-violet-50 text-slate-950 shadow-[0_8px_18px_rgba(139,92,246,0.08)]'
                      : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900'
                  }`}
                >
                  <span className="whitespace-nowrap">{lane.label}</span>
                  <span className={`inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1.5 text-[10px] font-black ${
                    activeInboxLane === lane.key
                      ? 'bg-violet-100 text-violet-700'
                      : 'bg-slate-100 text-slate-500'
                  }`}>
                    {lane.count}
                  </span>
                </button>
              ))}
            </div>

            {activeLaneMeta.showSupportCta ? (
              <div className="mt-3">
                <button
                  type="button"
                  onClick={() => void handleSupportAction()}
                  disabled={supportActionBusy}
                  className="inline-flex items-center justify-center gap-2 rounded-full border border-violet-200 bg-violet-50 px-4 py-2.5 text-sm font-bold text-violet-700 shadow-sm transition hover:border-violet-300 hover:bg-violet-100 disabled:opacity-60"
                >
                  {supportActionBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageSquareText className="h-4 w-4" />}
                  {tr('Contact support', 'Contacter le support')}
                </button>
              </div>
            ) : null}
          </div>
          {(showSearch || shouldShowCustomerContextTabs || showListFilters) ? (
            <div className="mb-2.5 space-y-2">
              {showSearch ? (
                <label className="flex h-11 items-center gap-2.5 rounded-2xl border border-slate-200 bg-white px-3">
                  <Search className="h-4 w-4 shrink-0 text-slate-400" />
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder={tr('Search messages', 'Rechercher dans les messages')}
                    className="w-full border-0 bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400"
                  />
                </label>
              ) : null}

              {shouldShowCustomerContextTabs ? (
                <div className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  {contextTabs.map((tab) => (
                    <button
                      key={tab.key}
                      type="button"
                      onClick={() => setActiveContextTab(tab.key)}
                      className={`inline-flex shrink-0 items-center gap-2 rounded-full border px-3 py-2 text-xs font-black transition ${
                        activeContextTab === tab.key
                          ? 'border-violet-200 bg-violet-50 text-slate-950 shadow-[0_8px_18px_rgba(139,92,246,0.08)]'
                          : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900'
                      }`}
                    >
                      <span>{tab.title}</span>
                      <span className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-black ${
                        activeContextTab === tab.key
                          ? 'bg-violet-100 text-violet-700'
                          : 'bg-slate-100 text-slate-500'
                      }`}>
                        {tab.count}
                      </span>
                    </button>
                  ))}
                </div>
              ) : null}

              {showListFilters ? (
                <div className={listFiltersWrapClass}>
                  <div className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                    {listFilterOptions.map((filter) => (
                      <button
                        key={filter.key}
                        type="button"
                        onClick={() => setActiveListFilter(filter.key)}
                        className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-2 text-[11px] font-black transition ${
                          activeListFilter === filter.key
                            ? 'bg-slate-950 text-white'
                            : 'border border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900'
                        }`}
                      >
                        {filter.key === 'archived' || filter.key === 'history' ? <Archive className="h-3.5 w-3.5" /> : null}
                        <span className="whitespace-nowrap">{filter.label}</span>
                        <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-black ${
                          activeListFilter === filter.key ? 'bg-white/15 text-white' : 'bg-slate-100 text-slate-600'
                        }`}>
                          {filter.count}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="space-y-2.5 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:pr-1">
            {loading ? (
              Array.from({ length: 5 }).map((_, index) => (
                <div key={`thread-loading-${index}`} className="h-14 animate-pulse rounded-2xl bg-slate-100" />
              ))
            ) : null}

            {!loading ? (
              <div className="space-y-2">
                {groupedVisibleThreads.map((group) => (
                  <div key={group.key} className="space-y-1">
                    {group.title ? (
                      <div className="flex items-center justify-between px-1">
                        <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">
                          {group.title}
                        </p>
                        <span className="text-xs font-semibold text-slate-400">{group.threads.length}</span>
                      </div>
                    ) : null}
                    <div className="space-y-1">
                      {group.threads.map((thread) => {
                        const threadKey = String(thread.thread_key || thread.id);
                        const latestMessage = getLatestMessage(thread);
                        const counterparty = getOtherParty(thread, currentUserId, tr, currentSenderRole);
                        const statusMeta = getThreadStatusIconMeta(thread);
                        const StatusIcon = statusMeta.icon;
                        const waitingState = getNeedsReplyState(thread, currentUserId);
                        const latestPreview = String(
                          (thread?.metadata?.isMergedVerificationThread ? thread?.latest_message : '') ||
                          latestMessage?.body ||
                          thread.latest_message ||
                          '—'
                        ).trim();
                        const threadActionLabel = threadGroupingMode === 'transaction_hub'
                          ? getThreadActionLabel(thread)
                          : '';
                        const hasUnread = Number(thread?.unread_count || 0) > 0;
                        const contextLabel = getThreadContextLabel(thread);
                        const adminEmailLabel = getThreadAdminEmailLabel(thread, counterparty);
                        const isReviewLaneRow = activeInboxLane === 'reviews';
                        const displayMetaLine = adminEmailLabel || contextLabel || '';
                        const showContextLabel = Boolean(
                          contextLabel &&
                          !threadActionLabel &&
                          contextLabel !== latestPreview
                        );
                        const avatarUrl = getThreadAvatarUrl(thread, counterparty);
                        return (
                          <button
                            key={threadKey}
                            type="button"
                            onClick={() => handleSelectThread(threadKey)}
                            className={`group relative w-full overflow-hidden rounded-[18px] border px-3 py-2.5 text-left transition-all duration-150 ${getThreadRowToneClass(thread, selectedThreadKey === threadKey, hasUnread)}`}
                          >
                            <span
                              aria-hidden="true"
                              className={`absolute inset-y-2.5 left-0 w-0.5 rounded-full transition-colors duration-150 ${
                                selectedThreadKey === threadKey
                                  ? 'bg-violet-500'
                                  : hasUnread
                                    ? 'bg-slate-300 group-hover:bg-slate-400'
                                    : 'bg-transparent group-hover:bg-slate-300'
                              }`}
                            />
                            <div className="flex items-start gap-2.5">
                              <div className={`relative flex h-9 w-9 shrink-0 items-center justify-center rounded-[18px] text-[11px] font-black ring-1 transition-all duration-150 ${
                                getThreadAvatarClassName(thread, selectedThreadKey === threadKey, hasUnread)
                              }`}>
                                {avatarUrl ? (
                                  <img
                                    src={avatarUrl}
                                    alt={getThreadIdentityLabel(thread, counterparty)}
                                    className="h-full w-full rounded-[18px] object-cover"
                                  />
                                ) : (
                                  getThreadAvatarLabel(thread, counterparty)
                                )}
                                {hasUnread ? (
                                  <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-sky-500" />
                                ) : null}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0 flex-1">
                                    <p className={`truncate text-[15px] font-black leading-5 ${
                                        hasUnread ? 'text-slate-950' : 'text-slate-900'
                                      }`}>
                                        {getThreadIdentityLabel(thread, counterparty)}
                                    </p>
                                  </div>
                                  <div className="ml-2 flex shrink-0 items-center gap-2">
                                    <span className={`text-[11px] font-semibold ${
                                      selectedThreadKey === threadKey
                                        ? 'text-violet-500'
                                        : hasUnread
                                          ? 'text-slate-500'
                                          : 'text-slate-400'
                                    }`}>
                                      {formatDateTime(thread.latest_message_at, isFrench)}
                                    </span>
                                    <StatusIcon
                                      className={`h-3 w-3 shrink-0 ${
                                        selectedThreadKey === threadKey ? 'text-violet-500' : statusMeta.className
                                      }`}
                                      aria-label={statusMeta.title}
                                    />
                                  </div>
                                </div>
                                <div className="mt-1 flex min-w-0 flex-wrap items-center gap-1.5">
                                  <span className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-bold ${getThreadTypeBadgeClassName(thread, selectedThreadKey === threadKey)}`}>
                                    {getThreadTypeBadgeLabel(thread)}
                                  </span>
                                  {threadActionLabel ? (
                                    <span className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-black ${
                                      selectedThreadKey === threadKey
                                        ? 'bg-violet-100 text-violet-700'
                                        : 'bg-amber-50 text-amber-700 ring-1 ring-amber-100'
                                    }`}>
                                      {threadActionLabel}
                                    </span>
                                  ) : null}
                                  {isReviewLaneRow && displayMetaLine ? (
                                    <p className="min-w-0 truncate text-[11px] font-medium text-slate-500">
                                      {displayMetaLine}
                                    </p>
                                  ) : showContextLabel ? (
                                    <p className="min-w-0 truncate text-[11px] font-medium text-slate-500">
                                      {contextLabel}
                                    </p>
                                  ) : null}
                                </div>
                                {adminEmailLabel && !isReviewLaneRow ? (
                                  <p className="mt-1 truncate text-[11px] font-medium text-slate-400">
                                    {adminEmailLabel}
                                  </p>
                                ) : null}
                                <div className="mt-1.5 flex items-start gap-2">
                                  <p className={`min-w-0 flex-1 truncate text-[13px] leading-5 ${
                                    hasUnread ? 'text-slate-700' : 'text-slate-500'
                                  }`}>
                                    {latestPreview}
                                  </p>
                                  {waitingState === 'needs_reply' ? (
                                    <span className="h-2 w-2 shrink-0 rounded-full bg-sky-500" aria-label={tr('Needs reply', 'À répondre')} />
                                  ) : null}
                                </div>
                              </div>
                              <div className="shrink-0 self-center">
                                {hasUnread ? (
                                  <span className={`h-2 w-2 rounded-full ${
                                    selectedThreadKey === threadKey ? 'bg-violet-500' : 'bg-slate-900'
                                  }`} aria-label={tr('Unread', 'Non lu')} />
                                ) : (
                                  <span className="block h-2 w-2" aria-hidden="true" />
                                )}
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            ) : null}

            {!loading && !filteredVisibleThreads.length ? (
              <div className="rounded-[22px] border border-dashed border-violet-200 bg-white px-5 py-8 text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-[18px] bg-violet-50 text-violet-700">
                  <Inbox className="h-5 w-5" />
                </div>
                <p className="mt-4 text-base font-black text-slate-900">
                  {isReviewHistoryFilter
                    ? tr('No completed reviews yet', 'Aucune revue terminée pour le moment')
                    : activeLaneMeta.showSupportCta
                    ? tr('No support conversations yet', 'Aucune conversation support pour le moment')
                    : emptyTitle}
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  {isReviewHistoryFilter
                    ? tr(
                        'Finished verification and listing reviews will appear here once they are approved or resolved.',
                        'Les revues de vérification et d’annonces terminées apparaîtront ici une fois approuvées ou résolues.'
                      )
                    : activeLaneMeta.showSupportCta
                    ? tr(
                        'Start a support conversation here whenever you need help from the team.',
                        "Démarrez ici une conversation support dès que vous avez besoin d'aide de l'équipe."
                      )
                    : emptyDescription}
                </p>
                {activeLaneMeta.showSupportCta ? (
                  <button
                    type="button"
                    onClick={() => void handleSupportAction()}
                    disabled={supportActionBusy}
                    className="mt-4 inline-flex items-center gap-2 rounded-full border border-violet-200 bg-violet-50 px-4 py-2 text-sm font-semibold text-violet-700 shadow-sm transition hover:border-violet-300 hover:bg-violet-100 disabled:opacity-60"
                  >
                    {supportActionBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageSquareText className="h-4 w-4" />}
                    {tr('Contact support', 'Contacter le support')}
                  </button>
                ) : emptyActionLabel && emptyActionTo ? (
                  <Link
                    to={emptyActionTo}
                    state={emptyActionState}
                    className="mt-4 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-violet-200 hover:text-violet-700"
                  >
                    {emptyActionLabel}
                  </Link>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>

        <div className={`${!shouldShowMobileThread ? 'hidden' : ''} overflow-hidden rounded-[32px] border border-violet-200/70 bg-white shadow-[0_16px_36px_rgba(15,23,42,0.06)] ${
          isCompactViewport
            ? 'min-h-[calc(100dvh-9rem)]'
            : immersiveMode
              ? 'h-[min(84vh,72rem)]'
              : 'h-[min(76vh,52rem)] lg:min-h-0 lg:h-full'
        }`}>
          {renderedThreadWithContext ? (
            <ConversationThread
              thread={renderedThreadWithContext}
              compactMode={isCompactViewport}
              currentUserId={currentUserId}
              currentUserLabel={currentUserLabel}
              currentUserAvatarUrl={currentUserAvatarUrl}
              currentSenderRole={currentSenderRole}
              isFrench={isFrench}
              tr={tr}
              threadContextData={renderedThreadContextData}
              busyThreadKey={busyThreadKey}
              onSendReply={onSendReply}
              onPerformMarketplaceAction={onPerformMarketplaceAction}
              onPerformVerificationAction={onPerformVerificationAction}
              onOpenContext={onOpenContext}
              onUpdateArchiveState={onUpdateArchiveState}
              onUpdateThreadState={onUpdateThreadState}
              allowInternalNotes={allowInternalNotes}
              allowThreadStateControls={allowThreadStateControls}
              immersiveMode={immersiveMode}
              onExitReadingMode={() => {
                setImmersiveMode(false);
                setHasExplicitThreadSelection(false);
                setShouldHonorInitialSelection(false);
              }}
              onDeleteThread={(deletedThread) => {
                const deletedThreadKey = String(deletedThread?.thread_key || deletedThread?.id || '').trim();
                if (!deletedThreadKey) return;
                setDeletedThreadKeys((current) => (
                  current.includes(deletedThreadKey) ? current : [...current, deletedThreadKey]
                ));
                if (selectedThreadKey === deletedThreadKey) {
                  setSelectedThreadKey('');
                  setHasExplicitThreadSelection(false);
                  setShouldHonorInitialSelection(false);
                }
                if (typeof onRefresh === 'function') {
                  void onRefresh({ silent: true });
                }
              }}
              floatingBackLabel={tr('Message list', 'Liste des messages')}
            />
          ) : !isCompactViewport ? (
            <div className="flex h-full min-h-[520px] flex-col items-center justify-center px-6 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-[24px] bg-violet-50 text-violet-700">
                <MessageSquareText className="h-7 w-7" />
              </div>
              <p className="mt-5 text-xl font-black text-slate-950">
                {tr('Select a conversation', 'Sélectionnez une conversation')}
              </p>
              <p className="mt-2 max-w-md text-sm text-slate-500">
                {tr('Open any thread from the left to read the full history and continue the conversation.', 'Ouvrez un fil à gauche pour lire tout l’historique et poursuivre la conversation.')}
              </p>
            </div>
          ) : null}
        </div>
      </div>

    </section>
  );
};

export default SharedInboxWorkspace;
