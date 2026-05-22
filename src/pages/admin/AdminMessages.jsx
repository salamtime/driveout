import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import SharedInboxWorkspace from '../../components/messages/SharedInboxWorkspace';
import { getMessageExperience } from '../../components/messages/messageExperience';
import MessageService from '../../services/MessageService';
import VerificationService from '../../services/VerificationService';
import { adminApiRequest } from '../../services/adminApi';
import i18n from '../../i18n';
import { resolveThreadContextTarget } from '../../utils/messageCenter';

const MESSAGE_CENTER_SECTIONS = {
  support: 'support',
  customer: 'customer',
};

const ADMIN_MESSAGES_CONTEXT_KEY = 'admin-messages:last-context';

const INTERNAL_STAFF_ROLES = new Set(['admin', 'employee', 'guide', 'staff']);
const STAFF_ROLES = new Set(['owner', 'admin', 'employee', 'guide', 'business_owner', 'staff']);
const MARKETPLACE_ESCALATION_FLAGS = [
  'adminVisible',
  'supportEscalated',
  'escalatedToSupport',
  'needsAdminReview',
  'flagged',
  'riskFlag',
  'fraudFlag',
  'paymentIssue',
  'disputeOpen',
  'requiresSupport',
];

const normalizeRole = (value) => String(value || '').trim().toLowerCase();
const VERIFICATION_ENTITY_LABELS = {
  user: 'Profile verification',
  vehicle: 'Vehicle verification',
  listing: 'Listing verification',
  business_owner: 'Business owner verification',
};
const normalizeStaffChatRole = (value) => {
  const normalized = normalizeRole(value);
  if (['org_owner', 'organization_owner', 'operator', 'business', 'rental_business'].includes(normalized)) return 'business_owner';
  if (normalized.includes('guide')) return 'guide';
  if (normalized.includes('employee')) return 'employee';
  if (normalized.includes('staff')) return 'staff';
  if (normalized.includes('admin')) return 'admin';
  if (normalized.includes('owner')) return 'owner';
  return normalized || 'staff';
};

const normalizeAdminMessageSection = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'staff') return MESSAGE_CENTER_SECTIONS.support;
  if (normalized === MESSAGE_CENTER_SECTIONS.support) return MESSAGE_CENTER_SECTIONS.support;
  return MESSAGE_CENTER_SECTIONS.customer;
};

const normalizeInboxLaneParam = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (['conversations', 'reviews', 'support', 'updates', 'internal'].includes(normalized)) {
    return normalized;
  }
  return '';
};

const getUserDisplayName = (user = {}) =>
  String(
    user?.full_name ||
    user?.name ||
    `${String(user?.first_name || '').trim()} ${String(user?.last_name || '').trim()}`.trim() ||
    user?.username ||
    user?.email ||
    'Team member'
  ).trim();

const getParticipantIdFromThread = (thread = {}, currentUserId = '') => {
  const currentId = String(currentUserId || '').trim();
  const messages = Array.isArray(thread?.messages) ? thread.messages : [];

  for (const message of messages) {
    const senderId = String(message?.sender_user_id || '').trim();
    const recipientId = String(message?.recipient_user_id || '').trim();
    if (senderId && senderId !== currentId) return senderId;
    if (recipientId && recipientId !== currentId) return recipientId;
  }

  const senderId = String(thread?.sender_user_id || '').trim();
  const recipientId = String(thread?.recipient_user_id || '').trim();
  if (senderId && senderId !== currentId) return senderId;
  if (recipientId && recipientId !== currentId) return recipientId;
  return '';
};

const getParticipantRoleFromThread = (thread = {}, currentUserId = '') => {
  const currentId = String(currentUserId || '').trim();
  const messages = Array.isArray(thread?.messages) ? thread.messages : [];

  for (const message of messages) {
    const senderId = String(message?.sender_user_id || '').trim();
    const recipientId = String(message?.recipient_user_id || '').trim();
    if (senderId && senderId !== currentId) {
      return normalizeRole(message?.sender_role);
    }
    if (recipientId && recipientId !== currentId) {
      return normalizeRole(message?.recipient_role);
    }
  }

  const senderId = String(thread?.sender_user_id || '').trim();
  const recipientId = String(thread?.recipient_user_id || '').trim();
  if (senderId && senderId !== currentId) return normalizeRole(thread?.sender_role);
  if (recipientId && recipientId !== currentId) return normalizeRole(thread?.recipient_role);
  return '';
};

const getMarketplaceRequestReference = (thread = {}) => {
  const metadata = thread?.metadata && typeof thread.metadata === 'object' ? thread.metadata : {};
  return String(
    metadata.requestReference ||
    metadata.reference ||
    thread?.request_reference ||
    ''
  ).trim().toUpperCase();
};

const getVerificationStatusRank = (status = '') => {
  const normalized = String(status || '').trim().toLowerCase();
  if (['rejected', 'needs_info', 'needs_changes', 'suspended', 'expired'].includes(normalized)) return 4;
  if (['pending', 'submitted', 'review'].includes(normalized)) return 3;
  if (normalized === 'approved') return 2;
  return 1;
};

const mergeUserProfiles = (threads = []) =>
  (threads || []).reduce((accumulator, thread) => {
    const profiles = thread?.user_profiles && typeof thread.user_profiles === 'object' ? thread.user_profiles : {};
    return {
      ...accumulator,
      ...profiles,
    };
  }, {});

const getVerificationCaseTitle = (thread = {}) => {
  const metadata = thread?.metadata && typeof thread.metadata === 'object' ? thread.metadata : {};
  const entityType = String(thread?.entity_type || metadata.entityType || '').trim().toLowerCase();
  return metadata.caseTitle || metadata.reviewTitle || VERIFICATION_ENTITY_LABELS[entityType] || 'Verification case';
};

const getLatestThreadActivityAt = (thread = {}) => {
  const explicit = thread?.latest_message_at || thread?.at || thread?.updated_at || null;
  if (explicit) {
    const parsed = new Date(explicit).getTime();
    if (!Number.isNaN(parsed) && parsed > 0) return parsed;
  }

  const messages = Array.isArray(thread?.messages) ? thread.messages : [];
  const latestMessageAt = messages.reduce((latest, message) => {
    const createdAt = new Date(message?.created_at || message?.at || 0).getTime();
    return Number.isNaN(createdAt) ? latest : Math.max(latest, createdAt);
  }, 0);

  return latestMessageAt || 0;
};

const buildMergedVerificationThreads = (threads = [], currentUserId = '') => {
  const passthrough = [];
  const grouped = new Map();

  (threads || []).forEach((thread) => {
    if (String(thread?.family || '').trim().toLowerCase() !== 'verification') {
      passthrough.push(thread);
      return;
    }

    const participantId = getParticipantIdFromThread(thread, currentUserId);
    const fallbackKey = String(
      participantId ||
      thread?.recipient_user_id ||
      thread?.sender_user_id ||
      thread?.entity_id ||
      thread?.thread_key ||
      thread?.id ||
      ''
    ).trim();

    if (!fallbackKey) {
      passthrough.push(thread);
      return;
    }

    if (!grouped.has(fallbackKey)) grouped.set(fallbackKey, []);
    grouped.get(fallbackKey).push(thread);
  });

  const merged = Array.from(grouped.entries()).map(([participantKey, userThreads]) => {
    const sortedThreads = [...userThreads].sort(
      (left, right) => getLatestThreadActivityAt(right) - getLatestThreadActivityAt(left)
    );
    const primaryThread = sortedThreads[0] || {};
    const allMessages = sortedThreads
      .flatMap((thread) => {
        const caseTitle = getVerificationCaseTitle(thread);
        const caseKey = `${String(thread?.entity_type || '').trim().toLowerCase() || 'user'}:${String(thread?.entity_id || '').trim() || String(thread?.thread_key || thread?.id || '').trim()}`;
        const safeMessages = Array.isArray(thread?.messages) ? thread.messages : [];
        return safeMessages.map((message) => ({
          ...message,
          metadata: {
            ...(message?.metadata && typeof message.metadata === 'object' ? message.metadata : {}),
            verificationCaseKey: caseKey,
            verificationCaseTitle: caseTitle,
            verificationThreadKey: String(thread?.thread_key || '').trim(),
          },
        }));
      })
      .sort((left, right) => new Date(left?.created_at || 0).getTime() - new Date(right?.created_at || 0).getTime());
    const latestMergedMessage = [...allMessages].sort(
      (left, right) => new Date(right?.created_at || right?.at || 0).getTime() - new Date(left?.created_at || left?.at || 0).getTime()
    )[0] || null;
    const cases = sortedThreads.map((thread) => {
      const metadata = thread?.metadata && typeof thread.metadata === 'object' ? thread.metadata : {};
      const entityType = String(thread?.entity_type || metadata.entityType || '').trim().toLowerCase() || 'user';
      const entityId = String(thread?.entity_id || metadata.entityId || '').trim() || String(thread?.thread_key || thread?.id || '').trim();
      const documentTypes = Array.isArray(metadata.documentTypes) ? metadata.documentTypes.filter(Boolean) : [];
      return {
        caseKey: `${entityType}:${entityId}`,
        title: getVerificationCaseTitle(thread),
        entityType,
        entityId,
        threadKey: String(thread?.thread_key || '').trim(),
        status: String(metadata.verificationStatus || metadata.status || thread?.status || 'pending').trim().toLowerCase() || 'pending',
        latestMessageAt: thread?.latest_message_at || null,
        latestMessage: thread?.latest_message || '',
        documentTypes,
      };
    });
    const aggregateStatus = [...cases]
      .sort((left, right) => getVerificationStatusRank(right.status) - getVerificationStatusRank(left.status))[0]?.status || 'pending';
    const combinedDocumentTypes = [...new Set(cases.flatMap((entry) => entry.documentTypes || []))];

    return {
      ...primaryThread,
      id: `verification-user-${participantKey}`,
      thread_key: `verification-user:${participantKey}`,
      entity_type: 'user',
      entity_id: participantKey,
      entity_name: primaryThread?.entity_name || primaryThread?.recipient_name || primaryThread?.sender_name || '',
      entity_email: primaryThread?.entity_email || primaryThread?.recipient_email || primaryThread?.sender_email || '',
      latest_message: String(latestMergedMessage?.body || primaryThread?.latest_message || '').trim(),
      latest_message_at: latestMergedMessage?.created_at || primaryThread?.latest_message_at || null,
      message_count: allMessages.length,
      unread_count: sortedThreads.reduce((total, thread) => total + Number(thread?.unread_count || 0), 0),
      status: aggregateStatus,
      user_profiles: mergeUserProfiles(sortedThreads),
      messages: allMessages,
      timeline_events: sortedThreads.flatMap((thread) => (Array.isArray(thread?.timeline_events) ? thread.timeline_events : [])),
      metadata: {
        ...(primaryThread?.metadata && typeof primaryThread.metadata === 'object' ? primaryThread.metadata : {}),
        isMergedVerificationThread: true,
        replyEnabled: false,
        reviewTitle: 'Verification review',
        verificationStatus: aggregateStatus,
        documentTypes: combinedDocumentTypes,
        verificationCases: cases,
        sourceThreadKeys: sortedThreads
          .map((thread) => String(thread?.thread_key || '').trim())
          .filter(Boolean),
      },
    };
  });

  return [...passthrough, ...merged].sort(
    (left, right) =>
      new Date(right?.latest_message_at || right?.at || 0).getTime() -
      new Date(left?.latest_message_at || left?.at || 0).getTime()
  );
};

const isMarketplaceThreadEscalatedForAdmin = (thread = {}) => {
  if (String(thread?.family || '').trim().toLowerCase() !== 'marketplace') return true;

  const threadType = String(thread?.thread_type || '').trim().toLowerCase();
  if (threadType === 'marketplace_moderation') return true;

  const metadata = thread?.metadata && typeof thread.metadata === 'object' ? thread.metadata : {};
  return MARKETPLACE_ESCALATION_FLAGS.some((flag) => metadata?.[flag] === true);
};

const AdminMessages = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, userProfile } = useAuth();
  const isFrench = i18n.resolvedLanguage === 'fr';
  const tr = (en, fr) => (isFrench ? fr : en);
  const [threads, setThreads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [verificationCount, setVerificationCount] = useState(0);
  const [busyThreadKey, setBusyThreadKey] = useState('');
  const [staffUsers, setStaffUsers] = useState([]);
  const [staffLoading, setStaffLoading] = useState(true);
  const [staffError, setStaffError] = useState('');
  const [selectedSection, setSelectedSection] = useState(() => {
    const params = new URLSearchParams(location.search);
    return params.get('threadKey')
      ? MESSAGE_CENTER_SECTIONS.customer
      : normalizeAdminMessageSection(
          typeof window !== 'undefined'
            ? window.localStorage.getItem(ADMIN_MESSAGES_CONTEXT_KEY)
            : MESSAGE_CENTER_SECTIONS.customer
        );
  });
  const [referenceLookup, setReferenceLookup] = useState(() => {
    const params = new URLSearchParams(location.search);
    return String(params.get('requestRef') || '').trim().toUpperCase();
  });
  const [referenceLookupError, setReferenceLookupError] = useState('');
  const [mobileConversationOpen, setMobileConversationOpen] = useState(false);
  const realtimeReloadTimerRef = useRef(null);
  const heartbeatReloadTimerRef = useRef(null);
  const messageExperience = getMessageExperience({ canUsePrivilegedFeatures: true });
  const initialSelectedThreadKey = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return String(params.get('threadKey') || '').trim();
  }, [location.search]);
  const initialSelectedRequestId = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return String(params.get('requestId') || '').trim();
  }, [location.search]);
  const initialInboxLane = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return normalizeInboxLaneParam(params.get('lane'));
  }, [location.search]);
  const requestedReference = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return String(params.get('requestRef') || '').trim().toUpperCase();
  }, [location.search]);

  const adminLabel = String(
    userProfile?.username ||
    userProfile?.fullName ||
    userProfile?.full_name ||
    userProfile?.email ||
    user?.user_metadata?.username ||
    user?.user_metadata?.full_name ||
    user?.email ||
    'Admin'
  ).trim();
  const adminAvatarUrl = String(
    userProfile?.profile_picture_url ||
    userProfile?.avatar_url ||
    user?.user_metadata?.profile_picture_url ||
    user?.user_metadata?.avatar_url ||
    ''
  ).trim();
  const currentStaffSenderRole = normalizeStaffChatRole(userProfile?.role || user?.user_metadata?.role || 'admin');

  const loadThreads = async ({ silent = false } = {}) => {
    try {
      if (!silent) {
        setLoading(true);
      }
      setError('');
      const response = await MessageService.listSharedThreads();
      setThreads(Array.isArray(response?.threads) ? response.threads : []);
    } catch (loadError) {
      setError(loadError?.message || tr('Unable to load shared messages right now.', 'Impossible de charger les messages partagés pour le moment.'));
      setThreads([]);
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    let cancelled = false;

    const loadVerificationCount = async () => {
      try {
        const response = await VerificationService.getVerificationRequests({
          status: 'pending',
          entityType: 'user',
          limit: 200,
        });
        const requests = Array.isArray(response?.requests) ? response.requests : [];
        if (!cancelled) {
          setVerificationCount(requests.length);
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
  }, []);

  useEffect(() => {
    void loadThreads();
  }, []);

  const loadStaffUsers = async () => {
    try {
      setStaffLoading(true);
      setStaffError('');
      const response = await adminApiRequest('/api/admin-users?scope=staff-directory');
      const safeUsers = Array.isArray(response?.users) ? response.users : [];
      const filteredUsers = safeUsers
        .filter((candidate) => {
          const role = normalizeStaffChatRole(candidate?.role);
        if (!INTERNAL_STAFF_ROLES.has(role)) return false;
          if (String(candidate?.id || '') === String(user?.id || '')) return false;
          return candidate?.access_enabled !== false;
        })
        .sort((a, b) => getUserDisplayName(a).localeCompare(getUserDisplayName(b), undefined, { sensitivity: 'base' }));
      setStaffUsers(filteredUsers);
    } catch (loadStaffError) {
      setStaffError(loadStaffError?.message || tr('Unable to load staff members right now.', 'Impossible de charger les membres du personnel pour le moment.'));
      setStaffUsers([]);
    } finally {
      setStaffLoading(false);
    }
  };

  useEffect(() => {
    void loadStaffUsers();
  }, [user?.id]);

  useEffect(() => {
    const queueRealtimeReload = () => {
      if (realtimeReloadTimerRef.current) {
        clearTimeout(realtimeReloadTimerRef.current);
      }

      realtimeReloadTimerRef.current = setTimeout(() => {
        void loadThreads({ silent: true });
      }, 180);
    };

    const unsubscribe = MessageService.subscribeSharedMessages({
      userId: user?.id,
      isAdmin: true,
      onChange: queueRealtimeReload,
    });

    return () => {
      if (realtimeReloadTimerRef.current) {
        clearTimeout(realtimeReloadTimerRef.current);
      }
      unsubscribe();
    };
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id || typeof window === 'undefined') return undefined;

    const runSilentReload = () => {
      if (document.visibilityState === 'hidden') return;
      void loadThreads({ silent: true });
    };

    heartbeatReloadTimerRef.current = window.setInterval(runSilentReload, 5000);
    window.addEventListener('focus', runSilentReload);
    document.addEventListener('visibilitychange', runSilentReload);

    return () => {
      if (heartbeatReloadTimerRef.current) {
        window.clearInterval(heartbeatReloadTimerRef.current);
        heartbeatReloadTimerRef.current = null;
      }
      window.removeEventListener('focus', runSilentReload);
      document.removeEventListener('visibilitychange', runSilentReload);
    };
  }, [user?.id]);

  const summary = useMemo(() => {
    const staffThreadCount = threads.filter((thread) => {
      const participantId = getParticipantIdFromThread(thread, user?.id);
      return participantId && staffUsers.some((staffUser) => String(staffUser?.id || '') === participantId);
    }).length;
    const customerThreadCount = threads.length - staffThreadCount;
    return {
      staffThreadCount,
      customerThreadCount,
    };
  }, [threads, staffUsers, user?.id]);

  const staffThreadsByUserId = useMemo(() => {
    const nextMap = new Map();
    threads.forEach((thread) => {
      const participantId = getParticipantIdFromThread(thread, user?.id);
      if (!participantId) return;
      const normalizedParticipantRole = normalizeStaffChatRole(
        thread?.recipient_user_id === user?.id ? thread?.sender_role : thread?.recipient_role
      );
      if (!INTERNAL_STAFF_ROLES.has(normalizedParticipantRole)) return;
      if (!nextMap.has(participantId)) {
        nextMap.set(participantId, thread);
      }
    });
    return nextMap;
  }, [threads, user?.id]);

  const staffWorkspaceThreads = useMemo(
    () =>
      staffUsers.map((staffUser) => {
        const existingThread = staffThreadsByUserId.get(String(staffUser?.id || ''));
        if (existingThread) return existingThread;

        return {
          id: `staff-direct-${staffUser.id}`,
          thread_key: `staff-direct-${staffUser.id}`,
          family: 'support',
          thread_type: 'support_case',
          entity_type: 'user',
          entity_id: String(staffUser.id),
          entity_name: getUserDisplayName(staffUser),
          entity_email: staffUser.email || '',
          subject: tr('Direct staff chat', 'Discussion directe du personnel'),
          latest_message: '',
          latest_message_at: null,
          status: 'draft',
          message_count: 0,
          unread_count: 0,
          sender_user_id: user?.id || null,
          sender_role: 'admin',
          sender_email: user?.email || '',
          sender_name: adminLabel,
          recipient_user_id: staffUser.id,
          recipient_role: normalizeStaffChatRole(staffUser?.role) || 'employee',
          recipient_email: staffUser.email || '',
          recipient_name: getUserDisplayName(staffUser),
          metadata: {
            directStaffChat: true,
            conversationEnabled: true,
            adminHref: '/admin/messages?section=support',
          },
          priority: 'normal',
          waiting_on: null,
          resolved_at: null,
          messages: [],
        };
      }),
    [staffUsers, staffThreadsByUserId, tr, user?.id, user?.email, adminLabel]
  );

  const staffEmptyState = !staffLoading && !staffUsers.length;

  const customerInboxThreads = useMemo(
    () =>
      buildMergedVerificationThreads(
        threads.filter((thread) => {
        const family = String(thread?.family || '').trim().toLowerCase();
        if (family === 'verification') return true;

        const participantRole = getParticipantRoleFromThread(thread, user?.id);
        if (INTERNAL_STAFF_ROLES.has(participantRole)) return false;

        if (family !== 'marketplace') {
          return true;
        }

        const threadKey = String(thread?.thread_key || '').trim();
        const requestReference = getMarketplaceRequestReference(thread);
        const requestedMatch = requestedReference && requestReference === requestedReference;
        const explicitlySelected = initialSelectedThreadKey && threadKey === initialSelectedThreadKey;

        return Boolean(
          requestedMatch ||
          explicitlySelected ||
          isMarketplaceThreadEscalatedForAdmin(thread)
        );
        }),
        user?.id
      ),
    [threads, user?.id, requestedReference, initialSelectedThreadKey]
  );

  const resolvedCustomerThreadKey = useMemo(() => {
    const requestedThreadKey = String(initialSelectedThreadKey || '').trim();
    if (!requestedThreadKey) return '';

    const exactMatch = customerInboxThreads.find(
      (thread) => String(thread?.thread_key || '').trim() === requestedThreadKey
    );
    if (exactMatch) {
      return requestedThreadKey;
    }

    const mergedMatch = customerInboxThreads.find((thread) => {
      const metadata = thread?.metadata && typeof thread.metadata === 'object' ? thread.metadata : {};
      const sourceThreadKeys = Array.isArray(metadata.sourceThreadKeys) ? metadata.sourceThreadKeys : [];
      if (sourceThreadKeys.some((key) => String(key || '').trim() === requestedThreadKey)) {
        return true;
      }

      const verificationCases = Array.isArray(metadata.verificationCases) ? metadata.verificationCases : [];
      return verificationCases.some(
        (entry) => String(entry?.threadKey || '').trim() === requestedThreadKey
      );
    });

    return String(mergedMatch?.thread_key || '').trim();
  }, [customerInboxThreads, initialSelectedThreadKey]);

  const customerInboxDescription = tr(
    'Open a thread and continue the conversation.',
    'Ouvrez un fil et poursuivez la conversation.'
  );

  const activeSectionMeta = useMemo(() => {
    if (selectedSection === MESSAGE_CENTER_SECTIONS.support) {
      return {
        label: tr('Team inbox', "Boîte d’équipe"),
        description: tr(
          'Internal team conversations and staff-side coordination.',
          "Conversations internes de l’équipe et coordination côté personnel."
        ),
      };
    }
    return {
      label: tr('Customer inbox', 'Boîte client'),
      description: tr(
        'Customer-facing conversations, workflow reviews, and support cases in one admin workspace.',
        'Conversations côté client, revues workflow et cas support dans un seul espace admin.'
      ),
    };
  }, [selectedSection, tr]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(ADMIN_MESSAGES_CONTEXT_KEY, selectedSection);
  }, [selectedSection]);

  useEffect(() => {
    setReferenceLookup(requestedReference);
  }, [requestedReference]);

  const handleOpenMarketplaceReference = (event) => {
    event.preventDefault();
    const normalizedReference = String(referenceLookup || '').trim().toUpperCase();
    if (!normalizedReference) {
      setReferenceLookupError('');
      const params = new URLSearchParams(location.search);
      params.delete('requestRef');
      params.delete('threadKey');
      navigate({
        pathname: location.pathname,
        search: params.toString() ? `?${params.toString()}` : '',
      });
      return;
    }

    const matchingThread = threads.find((thread) => getMarketplaceRequestReference(thread) === normalizedReference);
    if (!matchingThread) {
      setReferenceLookupError(tr('No marketplace conversation found for that reference.', 'Aucune conversation marketplace trouvée pour cette référence.'));
      return;
    }

    setReferenceLookupError('');
    setSelectedSection(MESSAGE_CENTER_SECTIONS.customer);
    const params = new URLSearchParams(location.search);
    params.set('requestRef', normalizedReference);
    params.set('threadKey', String(matchingThread?.thread_key || '').trim());
    navigate({
      pathname: location.pathname,
      search: `?${params.toString()}`,
    });
  };

  return (
    <div className="min-h-full bg-[linear-gradient(180deg,#f5f3ff_0%,#eef2ff_45%,#ffffff_100%)]">
      <main className={`mx-auto max-w-7xl px-3 py-6 sm:px-6 lg:px-8 ${mobileConversationOpen ? 'space-y-3' : 'space-y-6'}`}>
        <section className={mobileConversationOpen ? 'space-y-3' : 'space-y-6'}>
          <header className="px-1">
            <h1 className="text-2xl font-black tracking-[-0.02em] text-slate-950 sm:text-[2rem]">
              {tr('Messages', 'Messages')}
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-600">
              {tr('One messaging system, split into customer inbox and internal team inbox.', 'Un seul système de messagerie, séparé entre la boîte client et la boîte interne de l’équipe.')}
            </p>
          </header>

          <div className="rounded-[28px] border border-slate-200 bg-white/90 p-3 shadow-[0_16px_40px_rgba(15,23,42,0.06)] backdrop-blur">
            <div className="flex flex-wrap gap-2">
              {[
                [MESSAGE_CENTER_SECTIONS.customer, tr('Customer inbox', 'Boîte client'), summary.customerThreadCount],
                [MESSAGE_CENTER_SECTIONS.support, tr('Team inbox', "Boîte d’équipe"), summary.staffThreadCount],
              ].map(([sectionKey, label, count]) => (
                <button
                  key={sectionKey}
                  type="button"
                  onClick={() => setSelectedSection(sectionKey)}
                  className={`inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-bold transition ${
                    selectedSection === sectionKey
                      ? 'bg-slate-950 text-white shadow-[0_14px_28px_rgba(15,23,42,0.18)]'
                      : 'border border-slate-200 bg-slate-50 text-slate-700 hover:border-violet-200 hover:bg-white hover:text-violet-700'
                  }`}
                >
                  <span>{label}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-black ${
                    selectedSection === sectionKey ? 'bg-white/15 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200'
                  }`}>
                    {count || 0}
                  </span>
                </button>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-3 px-1">
              <span className="rounded-full bg-violet-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-violet-700">
                {activeSectionMeta.label}
              </span>
              <p className="text-sm text-slate-500">
                {activeSectionMeta.description}
              </p>
            </div>
          </div>

          <section className="rounded-[28px] border border-slate-200 bg-white/90 p-4 shadow-[0_16px_40px_rgba(15,23,42,0.06)] backdrop-blur">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-2xl">
                <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">
                  {tr('Marketplace access', 'Accès marketplace')}
                </p>
                <h2 className="mt-2 text-lg font-black text-slate-950">
                  {tr('Open by reference only', 'Ouverture par référence uniquement')}
                </h2>
                <p className="mt-1 text-sm text-slate-600">
                  {tr(
                    'Regular renter-owner marketplace chats stay hidden from the admin inbox unless they are escalated. Use a request reference like RQ-33516E83 when you need to inspect a specific case.',
                    'Les discussions marketplace normales entre locataire et propriétaire restent masquées dans la boîte admin sauf en cas d’escalade. Utilisez une référence comme RQ-33516E83 pour consulter un dossier précis.'
                  )}
                </p>
              </div>
              <form onSubmit={handleOpenMarketplaceReference} className="flex w-full max-w-xl flex-col gap-2 sm:flex-row">
                <input
                  type="text"
                  value={referenceLookup}
                  onChange={(event) => {
                    setReferenceLookup(event.target.value.toUpperCase());
                    if (referenceLookupError) setReferenceLookupError('');
                  }}
                  placeholder="RQ-33516E83"
                  className="min-w-0 flex-1 rounded-full border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-violet-300 focus:ring-2 focus:ring-violet-100"
                />
                <button
                  type="submit"
                  className="inline-flex items-center justify-center rounded-full bg-slate-950 px-5 py-3 text-sm font-bold text-white transition hover:bg-slate-900"
                >
                  {tr('Open case', 'Ouvrir le dossier')}
                </button>
              </form>
            </div>
            {referenceLookupError ? (
              <p className="mt-3 text-sm font-semibold text-rose-600">{referenceLookupError}</p>
            ) : requestedReference ? (
              <p className="mt-3 text-sm font-semibold text-violet-700">
                {tr(`Showing admin access for ${requestedReference}`, `Affichage de l’accès admin pour ${requestedReference}`)}
              </p>
            ) : null}
          </section>

        {selectedSection === MESSAGE_CENTER_SECTIONS.support ? (
          <div className="space-y-5">
            {staffError ? (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
                {staffError}
              </div>
            ) : null}

            <SharedInboxWorkspace
              {...messageExperience}
              threads={staffWorkspaceThreads}
              loading={staffLoading}
              error={staffError}
              showContextTabs={false}
              laneModel="team"
              workspaceContext="support"
              busyThreadKey={busyThreadKey}
              currentUserId={user?.id}
              currentUserLabel={adminLabel}
              currentUserAvatarUrl={adminAvatarUrl}
              currentSenderRole={currentStaffSenderRole}
              isFrench={isFrench}
              tr={tr}
              onMobileConversationStateChange={setMobileConversationOpen}
              onRefresh={loadStaffUsers}
              onOpenContext={() => {}}
              onMarkThreadRead={async (thread) => {
                const threadKey = String(thread?.thread_key || '').trim();
                if (!threadKey || threadKey.startsWith('staff-direct-')) return;
                await MessageService.markSharedThreadRead(threadKey);
                await loadThreads({ silent: true });
              }}
              onUpdateArchiveState={async (thread, action) => {
                const threadKey = String(thread?.thread_key || '').trim();
                if (!threadKey || threadKey.startsWith('staff-direct-')) return;
                try {
                  setBusyThreadKey(threadKey);
                  if (action === 'archive') {
                    await MessageService.archiveSharedThread(threadKey);
                  } else {
                    await MessageService.restoreSharedThread(threadKey);
                  }
                  await loadThreads({ silent: true });
                } finally {
                  setBusyThreadKey('');
                }
              }}
              onUpdateThreadState={async (thread, payload) => {
                const threadKey = String(thread?.thread_key || '').trim();
                if (!threadKey || threadKey.startsWith('staff-direct-')) return;
                try {
                  setBusyThreadKey(threadKey);
                  await MessageService.updateSharedThreadState(threadKey, payload);
                  await loadThreads({ silent: true });
                } finally {
                  setBusyThreadKey('');
                }
              }}
              onSendReply={async ({ thread, body, recipientUserId, recipientRole, senderRole, messageType, mode, metadata = {}, attachments = [] }) => {
                const isInternal = mode === 'internal';
                const threadMetadata = thread?.metadata && typeof thread.metadata === 'object' ? { ...thread.metadata } : {};
                delete threadMetadata.replyTo;
                delete threadMetadata.replyToMessageId;
                delete threadMetadata.attachments;
                const response = await MessageService.sendSharedMessage({
                  family: thread.family,
                  threadType: thread.thread_type,
                  threadKey: String(thread.thread_key || '').startsWith('staff-direct-') ? '' : thread.thread_key,
                  entityType: thread.entity_type || 'user',
                  entityId: thread.entity_id || recipientUserId,
                  recipientUserId: isInternal ? user?.id : recipientUserId,
                  recipientRole: isInternal ? 'admin' : recipientRole,
                  senderRole,
                  messageType: isInternal ? 'internal_note' : (messageType || 'note'),
                  subject: thread.subject || tr('Direct staff chat', 'Discussion directe du personnel'),
                  body,
                  attachments,
                  metadata: {
                    ...threadMetadata,
                    ...(metadata && typeof metadata === 'object' ? metadata : {}),
                    isInternal,
                    directStaffChat: true,
                    adminHref: '/admin/messages?section=support',
                  },
                });
                void loadThreads({ silent: true });
                return response;
              }}
              emptyTitle={tr('No staff conversations yet', 'Aucune conversation du personnel pour le moment')}
              emptyDescription={staffEmptyState
                ? tr('As your team grows, direct staff chats will appear here.', 'À mesure que votre équipe grandit, les discussions directes du personnel apparaîtront ici.')
                : tr('Open a thread and continue the conversation.', 'Ouvrez un fil et poursuivez la conversation.')}
            />
          </div>
        ) : (
          <div className="space-y-5">
            <SharedInboxWorkspace
              {...messageExperience}
              threads={customerInboxThreads}
              loading={loading}
              error={error}
              busyThreadKey={busyThreadKey}
              initialSelectedThreadKey={resolvedCustomerThreadKey}
              initialSelectedRequestId={initialSelectedRequestId}
              initialInboxLane={initialInboxLane}
              currentUserId={user?.id}
              currentUserLabel={adminLabel}
              currentUserAvatarUrl={adminAvatarUrl}
              currentSenderRole="admin"
              isFrench={isFrench}
              tr={tr}
              contextCounts={{ verification: verificationCount }}
              showContextTabs={false}
              laneModel="admin"
              workspaceContext="customer"
              onMobileConversationStateChange={setMobileConversationOpen}
              onRefresh={loadThreads}
              onOpenContext={(thread) => {
                const target = resolveThreadContextTarget(thread, {
                  workspace: 'admin',
                  senderRole: 'admin',
                  fallbackHref: '/admin/messages',
                });
                if (target?.href) navigate(target.href);
              }}
              onMarkThreadRead={async (thread) => {
                const threadKey = String(thread?.thread_key || '').trim();
                if (!threadKey) return;
                await MessageService.markSharedThreadRead(threadKey);
                await loadThreads({ silent: true });
              }}
              onUpdateArchiveState={async (thread, action) => {
                const threadKey = String(thread?.thread_key || '').trim();
                if (!threadKey) return;
                try {
                  setBusyThreadKey(threadKey);
                  if (action === 'archive') {
                    await MessageService.archiveSharedThread(threadKey);
                  } else {
                    await MessageService.restoreSharedThread(threadKey);
                  }
                  await loadThreads({ silent: true });
                } finally {
                  setBusyThreadKey('');
                }
              }}
              onUpdateThreadState={async (thread, payload) => {
                const threadKey = String(thread?.thread_key || '').trim();
                if (!threadKey) return;
                try {
                  setBusyThreadKey(threadKey);
                  await MessageService.updateSharedThreadState(threadKey, payload);
                  await loadThreads({ silent: true });
                } finally {
                  setBusyThreadKey('');
                }
              }}
              onSendReply={async ({ thread, body, recipientUserId, recipientRole, senderRole, messageType, mode, metadata = {}, attachments = [] }) => {
                const isInternal = mode === 'internal';
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
                  recipientUserId: isInternal ? user?.id : recipientUserId,
                  recipientRole: isInternal ? 'admin' : recipientRole,
                  senderRole,
                  messageType: isInternal ? 'internal_note' : (messageType || 'note'),
                  subject: thread.subject || '',
                  body,
                  attachments,
                  metadata: {
                    ...threadMetadata,
                    ...(metadata && typeof metadata === 'object' ? metadata : {}),
                    isInternal,
                    adminHref: thread?.metadata?.adminHref || thread?.metadata?.href || '/admin/messages',
                  },
                });
                void loadThreads({ silent: true });
                return response;
              }}
              onPerformVerificationAction={async (thread, action, payload = {}) => {
                const verificationRequestId = String(payload?.verificationRequestId || '').trim();
                if (!verificationRequestId) return;
                const nextStatus =
                  action === 'approve_verification'
                    ? 'approved'
                    : action === 'reject_verification'
                      ? 'rejected'
                      : '';
                if (!nextStatus) return;

                await VerificationService.updateVerificationStatus({
                  id: verificationRequestId,
                  status: nextStatus,
                  rejectionReason:
                    nextStatus === 'rejected'
                      ? tr('Please upload a clearer replacement document.', 'Veuillez téléverser un document de remplacement plus clair.')
                      : '',
                });
                void loadThreads({ silent: true });
              }}
              emptyTitle={tr('No customer threads in this group yet', 'Aucun fil client dans ce groupe pour le moment')}
              emptyDescription={customerInboxDescription}
            />
          </div>
        )}
        </section>
      </main>
    </div>
  );
};

export default AdminMessages;
