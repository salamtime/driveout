import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Archive,
  CheckCircle2,
  Clock3,
  Inbox,
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
}) => {
  const [search, setSearch] = useState('');
  const [selectedThreadKey, setSelectedThreadKey] = useState('');
  const [deletedThreadKeys, setDeletedThreadKeys] = useState([]);
  const [activeContextTab, setActiveContextTab] = useState('');
  const [activeListFilter, setActiveListFilter] = useState('all');
  const [activeInboxLane, setActiveInboxLane] = useState(
    workspaceContext === 'support' || workspaceContext === 'staff' ? 'support' : 'customer'
  );
  const [immersiveMode, setImmersiveMode] = useState(false);
  const [hasExplicitThreadSelection, setHasExplicitThreadSelection] = useState(false);
  const [shouldHonorInitialSelection, setShouldHonorInitialSelection] = useState(true);
  const [isCompactViewport, setIsCompactViewport] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth < 1024 : false
  );
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
        const threadType = String(thread?.thread_type || thread?.threadType || '').trim().toLowerCase();
        if (activeMode === 'owner') {
          if (threadType === 'marketplace_customer_request') return false;
          return thread.roleContext === 'owner' || thread.roleContext === 'verification' || thread.roleContext === 'support';
        }
        if (threadType === 'marketplace_owner_request') return false;
        return thread.roleContext === 'customer' || thread.roleContext === 'verification' || thread.roleContext === 'support';
      })),
    [activeMode, dedupeMarketplaceThreads, threadsWithMailbox]
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

  const customerLaneThreads = useMemo(
    () => dedupedModeThreads.filter((thread) => !['support', 'verification'].includes(thread.roleBucket)),
    [dedupedModeThreads]
  );
  const supportLaneThreads = useMemo(
    () => dedupedModeThreads.filter((thread) => ['support', 'verification'].includes(thread.roleBucket)),
    [dedupedModeThreads]
  );
  const laneEligibleThreads = activeInboxLane === 'support' ? supportLaneThreads : customerLaneThreads;

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
    () => customerLaneThreads.filter((thread) => thread.roleBucket === 'verification'),
    [customerLaneThreads]
  );
  const marketplaceThreads = useMemo(
    () => laneEligibleThreads.filter((thread) => ['my_rentals', 'marketplace_requests', 'incoming_requests', 'active_rentals'].includes(thread.roleBucket)),
    [laneEligibleThreads]
  );
  const supportThreads = useMemo(
    () => supportLaneThreads,
    [supportLaneThreads]
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
        title: tr('Verification', 'Vérification'),
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

    const candidateThreads = laneEligibleThreads.length ? laneEligibleThreads : threadsWithMailbox;
    const preferredThreadType = activeMode === 'owner' ? 'marketplace_owner_request' : 'marketplace_customer_request';
    const matchingThreads = candidateThreads.filter((thread) => {
      const metadata = thread?.metadata && typeof thread.metadata === 'object' ? thread.metadata : {};
      const href = String(metadata.href || '').trim();
      const metadataRequestId = String(metadata.requestId || '').trim();
      const entityId = String(thread?.entity_id || '').trim();
      const contextId = String(thread?.context_id || '').trim();

      return (
        metadataRequestId === normalizedRequestId ||
        entityId === normalizedRequestId ||
        contextId === normalizedRequestId ||
        href.includes(`/account/rentals/requests/${encodeURIComponent(normalizedRequestId)}`) ||
        href.includes(`/account/rentals/requests/${normalizedRequestId}`) ||
        href.includes(`requestId=${encodeURIComponent(normalizedRequestId)}`) ||
        href.includes(`requestId=${normalizedRequestId}`)
      );
    });

    const matchingThread =
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
    const entityId = String(thread?.entity_id || '').trim();
    const contextId = String(thread?.context_id || '').trim();

    return (
      metadataRequestId === normalizedRequestId ||
      entityId === normalizedRequestId ||
      contextId === normalizedRequestId ||
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

  const shouldShowCustomerContextTabs = showContextTabs && activeInboxLane === 'customer';

  const visibleThreads = activeInboxLane === 'support'
    ? supportLaneThreads.filter(getThreadMatchesSearch)
    : shouldShowCustomerContextTabs
      ? (activeTabConfig?.threads || [])
      : customerLaneThreads.filter(getThreadMatchesSearch);

  const filteredVisibleThreads = useMemo(
    () =>
      visibleThreads.filter((thread) => {
        const mailbox = thread?.mailbox || getMailboxForThread(thread, currentUserId);
        const needsReplyState = getNeedsReplyState(thread, currentUserId);
        if (activeListFilter === 'archived') return mailbox === MAILBOXES.archive;
        if (mailbox === MAILBOXES.archive) return false;
        if (activeListFilter === 'unread') return Number(thread?.unread_count || 0) > 0;
        if (activeListFilter === 'needs_reply') return needsReplyState === 'needs_reply';
        return true;
      }),
    [activeListFilter, currentUserId, visibleThreads]
  );

  const listSurfaceClass = workspaceContext === 'support'
    ? 'bg-slate-50'
    : 'bg-white';
  const listFiltersWrapClass = workspaceContext === 'support'
    ? 'rounded-[18px] border border-slate-200 bg-slate-100/80 p-1.5'
    : '';
  const workspaceIdentity = formatWorkspaceIdentity(currentUserLabel);
  const workspaceEyebrow = activeInboxLane === 'support'
    ? tr('Support view', 'Vue support')
    : currentSenderRole === 'owner'
      ? tr(`Owner: ${workspaceIdentity || 'Owner'}`, `Propriétaire : ${workspaceIdentity || 'Propriétaire'}`)
      : workspaceIdentity
        ? tr(`Customer: ${workspaceIdentity}`, `Client : ${workspaceIdentity}`)
        : tr('Customer view', 'Vue client');
  const workspaceLead = activeInboxLane === 'support'
    ? tr('Support cases, escalations, and issue resolution work.', 'Cas support, escalades et travail de résolution.')
    : tr('Keep booking conversations separate from support cases.', 'Gardez les conversations de réservation séparées des cas support.');
  const getThreadTypeBadgeLabel = (thread) => {
    const family = String(thread?.family || '').trim().toLowerCase();
    if (family === 'marketplace') return tr('Marketplace request', 'Demande marketplace');
    if (family === 'verification') return tr('Verification', 'Vérification');
    if (family === 'bookings') return tr('Rental', 'Location');
    if (family === 'tours') return tr('Tour', 'Tour');
    if (family === 'support') return tr('Support', 'Support');
    return tr('Thread', 'Fil');
  };
  const getThreadTypeBadgeClassName = (thread, selected = false) => {
    const family = String(thread?.family || '').trim().toLowerCase();
    if (selected) {
      if (family === 'marketplace') return 'bg-violet-100 text-violet-700';
      if (family === 'verification') return 'bg-emerald-100 text-emerald-700';
      if (family === 'bookings') return 'bg-sky-100 text-sky-700';
      if (family === 'tours') return 'bg-amber-100 text-amber-700';
      if (family === 'support') return 'bg-rose-100 text-rose-700';
      return 'bg-slate-100 text-slate-700';
    }

    if (family === 'marketplace') return 'bg-violet-50 text-violet-700 ring-1 ring-violet-100';
    if (family === 'verification') return 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100';
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

    const groups = {
      needs_reply: [],
      active: [],
      archived: [],
    };

    filteredVisibleThreads.forEach((thread) => {
      const waitingState = getNeedsReplyState(thread, currentUserId);
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

    return [
      { key: 'needs_reply', title: tr('Needs reply', 'À répondre'), threads: groups.needs_reply },
      { key: 'active', title: tr('Active', 'Actifs'), threads: groups.active },
      { key: 'archived', title: tr('Archived', 'Archivés'), threads: groups.archived },
    ].filter((group) => group.threads.length > 0);
  }, [activeListFilter, currentUserId, filteredVisibleThreads, groupThreads, threadGroupingMode, tr, workspaceContext]);

  const listFilterOptions = useMemo(
    () => [
      { key: 'all', label: tr('All', 'Tous'), count: visibleThreads.filter((thread) => (thread?.mailbox || getMailboxForThread(thread, currentUserId)) !== MAILBOXES.archive).length },
      { key: 'unread', label: tr('Unread', 'Non lus'), count: visibleThreads.filter((thread) => (thread?.mailbox || getMailboxForThread(thread, currentUserId)) !== MAILBOXES.archive && Number(thread?.unread_count || 0) > 0).length },
      { key: 'needs_reply', label: tr('Needs reply', 'À répondre'), count: visibleThreads.filter((thread) => (thread?.mailbox || getMailboxForThread(thread, currentUserId)) !== MAILBOXES.archive && getNeedsReplyState(thread, currentUserId) === 'needs_reply').length },
      { key: 'archived', label: tr('Archived', 'Archivés'), count: visibleThreads.filter((thread) => (thread?.mailbox || getMailboxForThread(thread, currentUserId)) === MAILBOXES.archive).length },
    ],
    [currentUserId, tr, visibleThreads]
  );

  const getThreadIdentityLabel = (thread, counterparty) => {
    const family = String(thread?.family || '').trim().toLowerCase();
    const counterpartyName = String(counterparty?.name || counterparty?.email || '').trim();

    if (family === 'support' && currentSenderRole !== 'admin') {
      return tr('Driveout Support', 'Support Driveout');
    }

    if (family === 'verification' && currentSenderRole !== 'admin') {
      return tr('Driveout Verification', 'Vérification Driveout');
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
      normalizedIdentity.includes('verification driveout') ||
      normalizedIdentity.includes('driveout') ||
      family === 'verification'
    ) {
      return pickVariant({
        default: 'bg-emerald-50/90 text-emerald-700 ring-emerald-100',
        unread: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
        selected: 'bg-emerald-100 text-emerald-800 ring-emerald-300 shadow-[0_8px_18px_rgba(16,185,129,0.14)]',
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
        title: tr('Pending', 'En attente'),
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
    const resolvedRequestedThreadKey = requestedThreadKey || findThreadKeyByRequestId(requestedRequestId);
    if (!resolvedRequestedThreadKey) return;
    if (!shouldHonorInitialSelection) return;
    if (hasExplicitThreadSelection) return;
    const matchingThread = threadsWithMailbox.find(
      (thread) => String(thread.thread_key || thread.id) === resolvedRequestedThreadKey
    );
    if (!matchingThread) return;

    if (shouldShowCustomerContextTabs) {
      setActiveContextTab(getContextTabForThread(matchingThread));
    }
    if (matchingThread.roleBucket === 'verification' || matchingThread.roleBucket === 'support') {
      setActiveInboxLane('support');
    } else {
      setActiveInboxLane('customer');
    }
    setSelectedThreadKey(resolvedRequestedThreadKey);
    setHasExplicitThreadSelection(true);
  }, [activeMode, hasExplicitThreadSelection, initialSelectedRequestId, initialSelectedThreadKey, laneEligibleThreads, shouldHonorInitialSelection, shouldShowCustomerContextTabs, threadsWithMailbox]);

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
    setSelectedThreadKey(threadKey);
    setHasExplicitThreadSelection(true);
  };

  const inboxLaneButtons = useMemo(
    () => [
      {
        key: 'customer',
        label: tr('Customer', 'Client'),
        count: customerLaneThreads.length,
      },
      {
        key: 'support',
        label: tr('Support', 'Support'),
        count: supportLaneThreads.length,
      },
    ],
    [customerLaneThreads.length, supportLaneThreads.length, tr]
  );

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

  return (
    <section className="space-y-4">
      {!immersiveMode ? (
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 transition hover:border-violet-200 hover:text-violet-700 disabled:opacity-60"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          {tr('Refresh', 'Actualiser')}
        </button>
      </div>
      ) : null}

      {error ? (
        <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
          {error}
        </div>
      ) : null}

      <div className={`${immersiveMode ? 'mt-0' : 'mt-1'} grid gap-3 ${immersiveMode ? 'h-[calc(100dvh-7.5rem)] min-h-[40rem]' : 'lg:h-[min(84vh,68rem)] lg:grid-cols-[380px_minmax(0,1fr)] lg:items-stretch lg:[grid-auto-rows:minmax(0,1fr)] xl:grid-cols-[420px_minmax(0,1fr)]'}`}>
        <div className={`${immersiveMode ? 'hidden' : `rounded-[28px] border border-slate-200 ${listSurfaceClass} p-4 shadow-[0_12px_30px_rgba(15,23,42,0.05)] lg:flex lg:min-h-0 lg:flex-col`}`}>
          <div className="mb-3 rounded-[22px] border border-slate-200 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,250,252,0.96))] px-5 py-4 shadow-[0_10px_24px_rgba(15,23,42,0.04)]">
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">
              {workspaceEyebrow}
            </p>
            <div className="mt-4 grid grid-cols-2 gap-3">
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
                    className={`flex w-full min-w-0 items-center justify-between gap-3 rounded-[18px] border px-4 py-3.5 text-left transition ${
                      activeInboxLane === lane.key
                        ? 'border-violet-200 bg-violet-50/60 text-slate-950 shadow-[0_10px_22px_rgba(139,92,246,0.08)]'
                        : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900'
                    }`}
                  >
                    <span className={`whitespace-nowrap text-[15px] font-black tracking-[-0.01em] ${activeInboxLane === lane.key ? 'text-slate-950' : 'text-slate-600'}`}>
                      {lane.label}
                    </span>
                    <span className={`ml-auto inline-flex h-8 min-w-8 shrink-0 items-center justify-center rounded-full px-2.5 text-[11px] font-black ${
                      activeInboxLane === lane.key
                        ? 'bg-violet-50 text-violet-700 ring-1 ring-violet-100'
                        : 'bg-white text-slate-500 ring-1 ring-slate-200'
                    }`}>
                      {lane.count}
                    </span>
                  </button>
                ))}
            </div>
            <p className="mt-4 max-w-[28rem] text-sm leading-7 text-slate-500">
              {workspaceLead}
            </p>
          </div>
          {showSearch ? (
            <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3">
              <Search className="h-4 w-4 text-slate-400" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={tr('Search messages', 'Rechercher dans les messages')}
                className="w-full border-0 bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400"
              />
            </label>
          ) : null}

          {shouldShowCustomerContextTabs ? (
            <div className={`${showSearch ? 'mt-4' : 'mt-0'} rounded-[24px] border border-slate-200 bg-slate-50/70 p-2`}>
              {contextTabs.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveContextTab(tab.key)}
                  className={`flex w-full items-center justify-between gap-3 rounded-[18px] px-3 py-3 text-left transition ${
                    activeContextTab === tab.key
                      ? 'bg-white text-slate-950 shadow-[0_10px_24px_rgba(15,23,42,0.08)] ring-1 ring-violet-200'
                      : 'text-slate-500 hover:bg-white/80 hover:text-slate-900'
                  }`}
                >
                  <span className={`text-sm font-black ${
                    activeContextTab === tab.key ? 'text-slate-950' : 'text-slate-600'
                  }`}>
                    {tab.title}
                  </span>
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${
                    activeContextTab === tab.key
                      ? 'bg-violet-50 text-violet-700'
                      : 'bg-white text-slate-500 ring-1 ring-slate-200'
                  }`}>
                    {tab.count}
                  </span>
                </button>
              ))}
            </div>
          ) : null}

          {showListFilters ? (
            <div className={`mt-4 ${listFiltersWrapClass}`}>
              <div className="flex flex-wrap gap-2">
                {listFilterOptions.map((filter) => (
                  <button
                    key={filter.key}
                    type="button"
                    onClick={() => setActiveListFilter(filter.key)}
                    className={`inline-flex items-center gap-2 rounded-full px-3 py-2 text-xs font-bold transition ${
                      activeListFilter === filter.key
                        ? 'bg-slate-950 text-white'
                        : 'border border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900'
                    }`}
                  >
                    {filter.key === 'archived' ? <Archive className="h-3.5 w-3.5" /> : null}
                    <span>{filter.label}</span>
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

          <div className="mt-4 space-y-4 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:pr-1">
            {loading ? (
              Array.from({ length: 5 }).map((_, index) => (
                <div key={`thread-loading-${index}`} className="h-14 animate-pulse rounded-2xl bg-slate-100" />
              ))
            ) : null}

            {!loading ? (
              <div className="space-y-3">
                {groupedVisibleThreads.map((group) => (
                  <div key={group.key} className="space-y-1.5">
                    {group.title ? (
                      <div className="flex items-center justify-between px-1">
                        <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">
                          {group.title}
                        </p>
                        <span className="text-xs font-semibold text-slate-400">{group.threads.length}</span>
                      </div>
                    ) : null}
                    <div className="space-y-0.5">
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
                        const avatarUrl = getThreadAvatarUrl(thread, counterparty);
                        return (
                          <button
                            key={threadKey}
                            type="button"
                            onClick={() => handleSelectThread(threadKey)}
                            className={`group relative w-full overflow-hidden rounded-2xl border px-3 py-2.5 text-left transition-all duration-150 ${
                              selectedThreadKey === threadKey
                                ? 'border-violet-200 bg-violet-50/90 shadow-[0_10px_24px_rgba(139,92,246,0.10)]'
                                : hasUnread
                                  ? 'border-slate-200 bg-slate-50/95 hover:border-slate-300 hover:bg-slate-100'
                                  : 'border-slate-200 bg-slate-50/72 hover:border-slate-300 hover:bg-slate-100/90'
                            }`}
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
                            <div className="flex items-start gap-3">
                              <div className={`relative flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-[11px] font-black ring-1 transition-all duration-150 ${
                                getThreadAvatarClassName(thread, selectedThreadKey === threadKey, hasUnread)
                              }`}>
                                {avatarUrl ? (
                                  <img
                                    src={avatarUrl}
                                    alt={getThreadIdentityLabel(thread, counterparty)}
                                    className="h-full w-full rounded-2xl object-cover"
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
                                    <p className={`chat-copy-title truncate ${
                                        hasUnread ? 'text-slate-950' : 'text-slate-900'
                                      }`}>
                                        {getThreadIdentityLabel(thread, counterparty)}
                                    </p>
                                  </div>
                                  <div className="ml-2 flex shrink-0 items-center gap-2">
                                    <span className={`text-xs font-semibold ${
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
                                <div className="mt-1 flex min-w-0 items-center gap-2">
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
                                  {contextLabel ? (
                                    <p className="chat-copy-body-compact min-w-0 truncate text-slate-500">
                                      {contextLabel}
                                    </p>
                                  ) : null}
                                </div>
                                <div className="mt-1.5 flex items-center gap-2">
                                  <p className={`chat-copy-body min-w-0 flex-1 truncate ${
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
                <p className="mt-4 text-base font-black text-slate-900">{emptyTitle}</p>
                <p className="mt-1 text-sm text-slate-500">{emptyDescription}</p>
                {emptyActionLabel && emptyActionTo ? (
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

        <div className={`overflow-hidden rounded-[32px] border border-violet-200/70 bg-white shadow-[0_16px_36px_rgba(15,23,42,0.06)] ${
          immersiveMode
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
          ) : (
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
          )}
        </div>
      </div>

    </section>
  );
};

export default SharedInboxWorkspace;
