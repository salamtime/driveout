import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Archive,
  AlertTriangle,
  ArrowLeft,
  Camera,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  CornerUpLeft,
  Ellipsis,
  ExternalLink,
  FileBadge,
  ImagePlus,
  PenSquare,
  MessageSquareText,
  Send,
  Trash2,
  X,
} from 'lucide-react';
import {
  getConversationStatusLabel,
  formatDateTime,
  getNeedsReplyState,
  getOtherParty,
  getParticipantLabel,
  getThreadCapabilities,
  getThreadConversationKind,
  getThreadSurface,
  getThreadWorkflowKind,
  getThreadRoleContext,
  getThreadUserProfile,
  getWaitingOnFilterLabel,
} from './threadHelpers';
import WorkflowThreadView from './WorkflowThreadView';
import { getCurrentLocationPath } from '../../utils/navigationReturn';
import { MESSAGE_ATTACHMENT_KINDS, normalizeMessageAttachments, resolveThreadContextTarget } from '../../utils/messageCenter';
import MessageService from '../../services/MessageService';
import MessageAttachmentService from '../../services/MessageAttachmentService';
import MessageMediaRetentionService from '../../services/MessageMediaRetentionService';
import VerificationService from '../../services/VerificationService';
import {
  canMarketplaceParticipantReply,
  formatMarketplaceGraceCountdown,
  formatMarketplaceHoldCountdown,
  getMarketplaceApprovalHoldState,
  getMarketplaceChatGraceState,
  normalizeRentalState,
} from '../../utils/marketplaceRequestState';
import {
  getRentalConditionSummaryLabel,
  getRentalDepositSummaryLabel,
  getRentalExtensionSummaryLabel,
  getRentalPaymentSummaryLabel,
  getRentalThreadPresentation,
  normalizeRentalThreadContext,
} from '../../utils/rentalThreadState';
import { getMarketplaceWalletGuidance, parseMarketplaceWalletAmount } from '../../utils/marketplaceUiGuidance';
import { buildOwnerExecutionWorkspaceHref, getOwnerExecutionActionConfig } from '../../utils/ownerRentalExecutionLinks';
import { buildMarketplaceListingPath, buildMarketplaceRequestPath } from '../../utils/marketplaceShareLinks';
import { getVerificationTypeLabel } from '../../utils/verificationStatus';
import CustomerExperienceService from '../../services/CustomerExperienceService';
import BusinessMarketplaceService from '../../services/BusinessMarketplaceService';
import PhotoCapture from '../video/PhotoCapture';

const MESSAGE_SEND_TIMEOUT_MS = 20000;
const MESSAGE_RECONCILE_WINDOW_MS = 45000;
const formatMoney = (amount, currencyCode = 'MAD', locale = 'en') =>
  new Intl.NumberFormat(locale === 'fr' ? 'fr-MA' : 'en-MA', {
    maximumFractionDigits: 0,
  }).format(Number(amount || 0)) + ` ${currencyCode}`;
const normalizePreviewableImageUrl = (value = '') => {
  const normalized = String(value || '').trim();
  if (
    normalized.startsWith('https://') ||
    normalized.startsWith('http://') ||
    normalized.startsWith('blob:') ||
    normalized.startsWith('data:image/')
  ) {
    return normalized;
  }
  return '';
};

const MARKETPLACE_PARTICIPANT_ROLES = new Set(['owner', 'business_owner', 'customer', 'renter']);
const MARKETPLACE_STAFF_ROLES = new Set(['admin', 'employee', 'staff', 'support', 'guide']);

const getWorkspaceRentalPathPrefix = (pathname = '') => {
  const normalizedPath = String(pathname || '').trim().toLowerCase();
  return normalizedPath.startsWith('/admin') || normalizedPath.startsWith('/guide') ? '/admin/rentals/' : '/account/rentals/';
};

const ConversationThread = ({
  threadId,
  contextType,
  contextId,
  compactMode = false,
  thread = null,
  currentUserId,
  currentUserLabel,
  currentUserAvatarUrl = '',
  currentSenderRole = 'customer',
  isFrench = false,
  tr,
  busyThreadKey = '',
  onSendReply,
  onOpenContext,
  onPerformMarketplaceAction,
  onPerformVerificationAction,
  onUpdateThreadState,
  allowInternalNotes = false,
  allowThreadStateControls = false,
  replyTarget = null,
  messageAudienceLabel = '',
  waitingOnCounterpartyLabel = '',
  emptyTitle,
  emptyDescription,
  contextTitle = '',
  contextSubtitle = '',
  contextStatus = '',
  hideDirectStaffIdentity = false,
  immersiveMode = false,
  onReadingModeChange,
  onExitReadingMode,
  floatingBackLabel = '',
  onClose,
  onDeleteThread,
  threadContextData = null,
  listingSetupProgress = null,
  forceFloatingComposer = false,
}) => {
  const location = useLocation();
  const navigate = useNavigate();
  const currentLocationPath = useMemo(() => getCurrentLocationPath(location), [location]);
  const replyActionLabel = tr('Reply', 'Répondre');
  const [composerText, setComposerText] = useState('');
  const [composerMode, setComposerMode] = useState('customer');
  const [sendError, setSendError] = useState('');
  const [sending, setSending] = useState(false);
  const [pendingMessages, setPendingMessages] = useState([]);
  const [replyingToMessage, setReplyingToMessage] = useState(null);
  const [replyModeActive, setReplyModeActive] = useState(false);
  const [presenceUsers, setPresenceUsers] = useState([]);
  const [workspacePresenceUsers, setWorkspacePresenceUsers] = useState([]);
  const [isMobileComposer, setIsMobileComposer] = useState(false);
  const [useFloatingTouchFooter, setUseFloatingTouchFooter] = useState(false);
  const [recentIncomingMessageIds, setRecentIncomingMessageIds] = useState([]);
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);
  const [showJumpToTop, setShowJumpToTop] = useState(false);
  const [readerFocused, setReaderFocused] = useState(false);
  const [messagingPolicy, setMessagingPolicy] = useState({
    messagingPhotoSharingEnabled: true,
    messagingMaxPhotosPerMessage: 3,
    messagingPhotoRetentionDays: 7,
    messagingDraftRetentionHours: 24,
    messagingAllowCameraCapture: true,
  });
  const [draftAttachments, setDraftAttachments] = useState([]);
  const [activeImagePreview, setActiveImagePreview] = useState(null);
  const [expandedTimelinePreviewIds, setExpandedTimelinePreviewIds] = useState({});
  const [unseenLatestCount, setUnseenLatestCount] = useState(0);
  const [showCameraCapture, setShowCameraCapture] = useState(false);
  const [bookingContext, setBookingContext] = useState(null);
  const [verificationRequests, setVerificationRequests] = useState([]);
  const [showVerificationDocuments, setShowVerificationDocuments] = useState(false);
  const [showHeaderDetails, setShowHeaderDetails] = useState(false);
  const [showInternalNotes, setShowInternalNotes] = useState(false);
  const [holdNow, setHoldNow] = useState(() => Date.now());
  const [ctaHighlightActive, setCtaHighlightActive] = useState(false);
  const [approvedSummaryExpanded, setApprovedSummaryExpanded] = useState(true);
  const [marketplaceActionBusy, setMarketplaceActionBusy] = useState('');
  const [marketplaceActionError, setMarketplaceActionError] = useState('');
  const [requestAgainError, setRequestAgainError] = useState('');
  const [deletingMessageId, setDeletingMessageId] = useState('');
  const [deletedMessageIds, setDeletedMessageIds] = useState({});
  const [openMessageActionId, setOpenMessageActionId] = useState('');
  const [threadHeaderMenuOpen, setThreadHeaderMenuOpen] = useState(false);
  const [threadArchiveBusy, setThreadArchiveBusy] = useState(false);
  const [threadDeleteBusy, setThreadDeleteBusy] = useState(false);
  const [threadArchivedOverride, setThreadArchivedOverride] = useState(null);
  const messageListRef = useRef(null);
  const bottomAnchorRef = useRef(null);
  const bookingActionRef = useRef(null);
  const composerTextareaRef = useRef(null);
  const messageRefs = useRef(new Map());
  const typingTimeoutRef = useRef(null);
  const typingSubscriptionRef = useRef(null);
  const incomingHighlightTimersRef = useRef(new Map());
  const bookingHighlightTimerRef = useRef(null);
  const previousMessageIdsRef = useRef(new Set());
  const albumInputRef = useRef(null);
  const previousThreadKeyRef = useRef('');
  const isNearBottomRef = useRef(true);
  const previousLatestVisibleMessageRef = useRef({
    threadKey: '',
    messageId: '',
    createdAt: '',
  });
  const initialThreadScrollKeyRef = useRef('');
  const latestScrollTimersRef = useRef([]);

  const selectedThread = thread;
  const isThreadArchived = Boolean(
    threadArchivedOverride !== null
      ? threadArchivedOverride
      : String(selectedThread?.status || '').trim().toLowerCase() === 'archived'
  );
  const selectedMessages = useMemo(
    () => [...(Array.isArray(selectedThread?.messages) ? selectedThread.messages : [])].sort(
      (a, b) => new Date(a?.created_at || 0).getTime() - new Date(b?.created_at || 0).getTime()
    ),
    [selectedThread]
  );
  const visibleMessages = useMemo(
    () => {
      const merged = [...selectedMessages, ...pendingMessages];
      const deduped = [];
      const seenIds = new Set();

      merged.forEach((message) => {
        const messageId = String(message?.id || '').trim();
        if (messageId && deletedMessageIds[messageId]) return;
        if (messageId && seenIds.has(messageId)) return;
        if (messageId) {
          seenIds.add(messageId);
        }
        deduped.push(message);
      });

      return deduped.sort(
        (a, b) => new Date(a?.created_at || 0).getTime() - new Date(b?.created_at || 0).getTime()
      );
    },
    [deletedMessageIds, selectedMessages, pendingMessages]
  );
  const conversationMessages = useMemo(
    () =>
      visibleMessages.filter((message) => {
        const messageType = String(message?.message_type || '').trim().toLowerCase();
        const metadata = message?.metadata && typeof message.metadata === 'object' ? message.metadata : {};
        if (messageType === 'internal_note') return false;
        if (metadata.isInternal) return false;
        if (
          String(selectedThread?.family || '').trim().toLowerCase() === 'marketplace' &&
          MARKETPLACE_PARTICIPANT_ROLES.has(String(currentSenderRole || '').trim().toLowerCase()) &&
          MARKETPLACE_STAFF_ROLES.has(String(message?.sender_role || '').trim().toLowerCase())
        ) {
          return false;
        }
        return true;
      }),
    [visibleMessages, selectedThread?.family, currentSenderRole]
  );
  const threadTimelineEvents = useMemo(
    () => (Array.isArray(selectedThread?.timeline_events) ? selectedThread.timeline_events : []),
    [selectedThread?.timeline_events]
  );
  const rentalContextData = useMemo(
    () => (
      threadContextData && typeof threadContextData === 'object'
        ? normalizeRentalThreadContext(threadContextData)
        : null
    ),
    [threadContextData]
  );
  const messageLookup = useMemo(
    () =>
      new Map(
        conversationMessages
          .map((message) => [String(message?.id || '').trim(), message])
          .filter(([messageId]) => Boolean(messageId))
      ),
    [conversationMessages]
  );

  const buildReplyPreview = (message) => {
    if (!message) return null;
    const sourceName = getParticipantLabel(message, currentUserId, currentUserLabel, tr);
    const body = String(message?.body || '').replace(/\s+/g, ' ').trim();
    return {
      id: String(message?.id || '').trim(),
      senderName: sourceName,
      body: body.length > 120 ? `${body.slice(0, 117)}...` : body || '—',
    };
  };

  const buildAvatarInitials = useCallback((label = '') => {
    const tokens = String(label || '').trim().split(/\s+/).filter(Boolean);
    if (!tokens.length) return 'U';
    return tokens.slice(0, 2).map((part) => part[0]).join('').toUpperCase();
  }, []);

  const threadConversationKind = useMemo(
    () => getThreadConversationKind(selectedThread),
    [selectedThread]
  );
  const threadCapabilities = useMemo(
    () => getThreadCapabilities(selectedThread),
    [selectedThread]
  );

  const isVisualAttachment = useCallback((attachment) => {
    const kind = String(attachment?.kind || '').trim().toLowerCase();
    return [
      MESSAGE_ATTACHMENT_KINDS.photo,
      MESSAGE_ATTACHMENT_KINDS.image,
      MESSAGE_ATTACHMENT_KINDS.video,
    ].includes(kind);
  }, []);

  const getMessageAttachments = (message) => {
    const metadata = message?.metadata && typeof message.metadata === 'object' ? message.metadata : {};
    return normalizeMessageAttachments(metadata.attachments, message);
  };

  const hasPendingMessageSettled = (pendingMessage, persistedMessages = []) => {
    const pendingSenderId = String(pendingMessage?.sender_user_id || '').trim();
    const pendingBody = String(pendingMessage?.body || '').trim();
    const pendingCreatedAtMs = new Date(pendingMessage?.created_at || 0).getTime();
    const pendingAttachments = getMessageAttachments(pendingMessage);

    return persistedMessages.some((message) => {
      const messageId = String(message?.id || '').trim();
      if (!messageId || messageId.startsWith('pending-')) return false;

      const senderId = String(message?.sender_user_id || '').trim();
      if (pendingSenderId && senderId !== pendingSenderId) return false;

      const messageCreatedAtMs = new Date(message?.created_at || 0).getTime();
      if (pendingCreatedAtMs && messageCreatedAtMs) {
        const delta = Math.abs(messageCreatedAtMs - pendingCreatedAtMs);
        if (delta > MESSAGE_RECONCILE_WINDOW_MS) return false;
      }

      const messageBody = String(message?.body || '').trim();
      const messageAttachments = getMessageAttachments(message);

      if (pendingAttachments.length || messageAttachments.length) {
        if (pendingAttachments.length !== messageAttachments.length) return false;
        const pendingNames = pendingAttachments.map((attachment) => String(attachment?.originalFilename || '').trim()).filter(Boolean).sort();
        const messageNames = messageAttachments.map((attachment) => String(attachment?.originalFilename || '').trim()).filter(Boolean).sort();
        if (pendingNames.length && JSON.stringify(pendingNames) !== JSON.stringify(messageNames)) return false;
      }

      return messageBody === pendingBody;
    });
  };

  const resolveReplyReference = (message) => {
    const metadata = message?.metadata && typeof message.metadata === 'object' ? message.metadata : {};
    const replyTo = metadata.replyTo && typeof metadata.replyTo === 'object' ? metadata.replyTo : null;
    const replyToMessageId =
      String(replyTo?.id || metadata.replyToMessageId || '').trim();
    if (!replyToMessageId && !replyTo?.body) return null;

    const originalMessage = replyToMessageId ? messageLookup.get(replyToMessageId) || null : null;
    if (originalMessage) {
      return buildReplyPreview(originalMessage);
    }

    return {
      id: replyToMessageId,
      senderName: String(replyTo?.senderName || tr('Message', 'Message')).trim() || tr('Message', 'Message'),
      body: String(replyTo?.body || '').trim() || '—',
    };
  };

  const markPendingMessageFailed = (pendingMessageId, errorMessage) => {
    setPendingMessages((current) =>
      current.map((message) => {
        if (message.id !== pendingMessageId) return message;
        return {
          ...message,
          metadata: {
            ...(message?.metadata && typeof message.metadata === 'object' ? message.metadata : {}),
            sendFailed: true,
            sendFailedMessage: String(errorMessage || '').trim() || null,
          },
        };
      })
    );
  };

  const otherParty = useMemo(() => {
    const resolved = getOtherParty(selectedThread, currentUserId, tr, currentSenderRole);
    if (resolved?.userId || !replyTarget) return resolved;
    return {
      ...resolved,
      name: replyTarget?.label || resolved?.name || '',
      email: replyTarget?.email || resolved?.email || '',
      userId: replyTarget?.userId || resolved?.userId || null,
      role: replyTarget?.role || resolved?.role || null,
    };
  }, [selectedThread, currentUserId, tr, currentSenderRole, replyTarget]);
  const resolvedCounterpartyUserId = String(
    otherParty?.userId ||
    replyTarget?.userId ||
    (
      String(selectedThread?.sender_user_id || '').trim() === String(currentUserId || '').trim()
        ? selectedThread?.recipient_user_id
        : selectedThread?.sender_user_id
    ) ||
    ''
  ).trim();
  const resolvedCounterpartyRole = String(
    otherParty?.role ||
    replyTarget?.role ||
    (
      String(selectedThread?.sender_user_id || '').trim() === String(currentUserId || '').trim()
        ? selectedThread?.recipient_role
        : selectedThread?.sender_role
    ) ||
    ''
  ).trim().toLowerCase();
  const otherPartyAvatarUrl = String(otherParty?.avatarUrl || '').trim();

  const resolvedThreadKey = String(selectedThread?.thread_key || threadId || '').trim();
  const threadMetadata = selectedThread?.metadata && typeof selectedThread.metadata === 'object' ? selectedThread.metadata : {};
  const normalizedThreadType = String(selectedThread?.thread_type || selectedThread?.threadType || '').trim().toLowerCase();
  const threadSurface = getThreadSurface(selectedThread);
  const workflowKind = getThreadWorkflowKind(selectedThread);
  const isRentalThread = Boolean(
    String(contextType || '').trim().toLowerCase() === 'rental' ||
    (selectedThread?.family === 'bookings' && normalizedThreadType === 'rental_booking')
  );
  const priority = String(
    threadMetadata.priority ||
    selectedThread?.priority ||
    'normal'
  )
    .trim()
    .toLowerCase();
  const isVerificationThread = selectedThread?.family === 'verification';
  const verificationType = String(
    threadMetadata.verificationType ||
    threadMetadata.documentType ||
    ''
  )
    .trim()
    .toLowerCase();
  const verificationCases = useMemo(
    () => (
      Array.isArray(threadMetadata.verificationCases)
        ? threadMetadata.verificationCases.filter((entry) => entry && typeof entry === 'object')
        : []
    ),
    [threadMetadata.verificationCases]
  );
  const isMergedVerificationThread = isVerificationThread && verificationCases.length > 0;
  const verificationStatus = String(
    threadMetadata.verificationStatus ||
    threadMetadata.status ||
    selectedThread?.status ||
    'pending'
  )
    .trim()
    .toLowerCase();
  const marketplaceLifecycleSource = useMemo(() => {
    const bookingRaw = bookingContext?.raw && typeof bookingContext.raw === 'object'
      ? bookingContext.raw
      : bookingContext?.rawRequest && typeof bookingContext.rawRequest === 'object'
        ? bookingContext.rawRequest
        : {};
    const bookingCounterOffer = bookingContext?.counterOffer && typeof bookingContext.counterOffer === 'object'
      ? bookingContext.counterOffer
      : bookingContext?.counter_offer && typeof bookingContext.counter_offer === 'object'
        ? bookingContext.counter_offer
        : {};
    const threadCounterOffer = threadMetadata.counterOffer && typeof threadMetadata.counterOffer === 'object'
      ? threadMetadata.counterOffer
      : threadMetadata.counter_offer && typeof threadMetadata.counter_offer === 'object'
        ? threadMetadata.counter_offer
        : {};

    return {
      request_status:
        bookingRaw?.request_status ||
        bookingContext?.requestStatus ||
        threadMetadata.requestStatus ||
        threadMetadata.status ||
        selectedThread?.status ||
        '',
      requestStatus:
        bookingContext?.requestStatus ||
        bookingRaw?.request_status ||
        threadMetadata.requestStatus ||
        threadMetadata.status ||
        selectedThread?.status ||
        '',
      status:
        bookingContext?.requestStatus ||
        bookingRaw?.request_status ||
        threadMetadata.requestStatus ||
        threadMetadata.status ||
        selectedThread?.status ||
        '',
      approved_at:
        bookingRaw?.approved_at ||
        bookingContext?.approvedAt ||
        bookingContext?.chatUnlockedAt ||
        threadMetadata.approved_at ||
        threadMetadata.approvedAt ||
        threadMetadata.chat_unlocked_at ||
        threadMetadata.chatUnlockedAt ||
        null,
      approvedAt:
        bookingContext?.approvedAt ||
        bookingContext?.chatUnlockedAt ||
        bookingRaw?.approved_at ||
        threadMetadata.approvedAt ||
        threadMetadata.approved_at ||
        threadMetadata.chatUnlockedAt ||
        threadMetadata.chat_unlocked_at ||
        null,
      counter_offer: Object.keys(bookingCounterOffer).length ? bookingCounterOffer : threadCounterOffer,
      counterOffer: Object.keys(bookingCounterOffer).length ? bookingCounterOffer : threadCounterOffer,
    };
  }, [bookingContext, selectedThread?.status, threadMetadata]);
  const rentalState = normalizeRentalState(
    selectedThread?.family === 'marketplace'
      ? marketplaceLifecycleSource
      : (
        bookingContext?.requestStatus ||
        threadMetadata.requestStatus ||
        threadMetadata.status ||
        selectedThread?.status ||
        ''
      )
  );
  const marketplaceReplyAllowed =
    selectedThread?.family === 'marketplace'
      ? canMarketplaceParticipantReply(rentalState, currentSenderRole)
      : null;
  const isAdminReadOnlyMarketplaceThread = Boolean(
    selectedThread?.family === 'marketplace' &&
    ['marketplace_owner_request', 'marketplace_customer_request'].includes(
      String(selectedThread?.thread_type || selectedThread?.threadType || '').trim().toLowerCase()
    ) &&
    !['owner', 'business_owner', 'customer', 'renter'].includes(String(currentSenderRole || '').trim().toLowerCase())
  );
  const canReply = Boolean(
    (resolvedThreadKey || contextId) &&
    resolvedCounterpartyUserId &&
    (marketplaceReplyAllowed === null ? threadMetadata.replyEnabled !== false : marketplaceReplyAllowed)
  );
  useEffect(() => {
    let cancelled = false;

    const loadVerificationCards = async () => {
      if (!isVerificationThread) {
        setVerificationRequests([]);
        return;
      }

      try {
        let requests = [];

        if (currentSenderRole === 'admin' && isMergedVerificationThread) {
          const caseResponses = await Promise.all(
            verificationCases.map(async (entry) => {
              const entityType = String(entry?.entityType || '').trim();
              const entityId = String(entry?.entityId || '').trim();
              if (!entityType || !entityId) return [];
              const result = await VerificationService.getVerificationRequests({
                status: 'all',
                entityType,
                entityId,
                limit: 24,
              });
              const caseTitle = String(entry?.title || '').trim();
              const caseKey = String(entry?.caseKey || `${entityType}:${entityId}`).trim();
              return (Array.isArray(result?.requests) ? result.requests : []).map((request) => ({
                ...request,
                verificationCaseTitle: caseTitle,
                verificationCaseKey: caseKey,
              }));
            })
          );
          requests = caseResponses.flat();
        } else if (currentSenderRole === 'admin' && selectedThread?.entity_type && selectedThread?.entity_id) {
          const result = await VerificationService.getVerificationRequests({
            status: 'all',
            entityType: String(selectedThread.entity_type),
            entityId: String(selectedThread.entity_id),
            limit: 24,
          });
          requests = Array.isArray(result?.requests) ? result.requests : [];
        } else {
          if (!selectedThread?.entity_type || !selectedThread?.entity_id) {
            setVerificationRequests([]);
            return;
          }
          const result = await VerificationService.getEntityVerificationSummary(
            String(selectedThread.entity_type),
            String(selectedThread.entity_id),
            { forceRefresh: true }
          );
          requests = Array.isArray(result?.requests) ? result.requests : [];
        }

        if (cancelled) return;
        setVerificationRequests(requests);
      } catch {
        if (!cancelled) {
          setVerificationRequests([]);
        }
      }
    };

    void loadVerificationCards();
    return () => {
      cancelled = true;
    };
  }, [currentSenderRole, isMergedVerificationThread, isVerificationThread, selectedThread?.entity_id, selectedThread?.entity_type, verificationCases]);
  const verificationPosts = useMemo(() => {
    if (!isVerificationThread) return [];

    const latestRequestByType = new Map();
    verificationRequests.forEach((request) => {
      const documentType = String(request?.verification_type || '').trim().toLowerCase();
      if (!documentType) return;
      const existing = latestRequestByType.get(documentType);
      const requestTimestamp = new Date(request?.created_at || 0).getTime();
      const existingTimestamp = new Date(existing?.created_at || 0).getTime();
      if (existing && existingTimestamp > requestTimestamp) return;

      latestRequestByType.set(documentType, {
        id: String(request?.id || documentType).trim(),
        created_at: request?.created_at || null,
        documentType,
        caseKey: String(request?.verificationCaseKey || '').trim(),
        caseTitle: String(request?.verificationCaseTitle || '').trim(),
        status: String(request?.status || 'pending').trim().toLowerCase() || 'pending',
        imageUrl: normalizePreviewableImageUrl(request?.file_url),
        fileName: String(request?.file_name || '').trim(),
        messageBody: String(request?.rejection_reason || '').trim(),
        fileMimeType: String(request?.file_mime_type || '').trim(),
        sourceKind: 'request',
      });
    });

    const latestPostByRequestId = new Map();
    const legacyPostByDocumentType = new Map();

    conversationMessages.forEach((message) => {
      const metadata = message?.metadata && typeof message.metadata === 'object' ? message.metadata : {};
      const messageType = String(message?.message_type || '').trim().toLowerCase();
      if (!['verification_card', 'verification_status', 'verification_post', 'submission_event', 'approval_event', 'rejection_event'].includes(messageType)) {
        return;
      }

      const requestId = String(metadata.verificationRequestId || '').trim();
      const documentType = String(
        metadata.documentType ||
        metadata.verificationType ||
        ''
      ).trim().toLowerCase();

      if (!documentType) return;

      const existing = requestId ? latestPostByRequestId.get(requestId) : legacyPostByDocumentType.get(documentType);
      const messageTimestamp = new Date(message?.created_at || 0).getTime();
      const existingTimestamp = new Date(existing?.created_at || 0).getTime();
      if (existing && existingTimestamp > messageTimestamp) return;

      const normalizedPost = {
        id: requestId,
        created_at: message?.created_at || null,
        documentType,
        caseKey: String(metadata.verificationCaseKey || '').trim(),
        caseTitle: String(metadata.verificationCaseTitle || '').trim(),
        status: String(metadata.status || metadata.verificationStatus || 'pending').trim().toLowerCase() || 'pending',
        imageUrl: normalizePreviewableImageUrl(metadata.imageUrl || metadata.fileUrl),
        fileName: String(metadata.fileName || '').trim(),
        messageBody: String(message?.body || '').trim(),
        fileMimeType: String(metadata.fileMimeType || '').trim(),
        sourceKind: 'message',
      };

      if (requestId) {
        latestPostByRequestId.set(requestId, normalizedPost);
      } else {
        legacyPostByDocumentType.set(documentType, {
          ...normalizedPost,
          id: `legacy-${documentType}`,
        });
      }
    });

    const mergedByDocumentType = new Map();

    [...latestRequestByType.values(), ...latestPostByRequestId.values(), ...legacyPostByDocumentType.values()].forEach((post) => {
      const documentType = String(post?.documentType || '').trim().toLowerCase();
      if (!documentType) return;
      const existing = mergedByDocumentType.get(documentType);
      const postTimestamp = new Date(post?.created_at || 0).getTime();
      const existingTimestamp = new Date(existing?.created_at || 0).getTime();
      if (!existing) {
        mergedByDocumentType.set(documentType, post);
        return;
      }

      const preferIncoming = postTimestamp >= existingTimestamp;
      const primary = preferIncoming ? post : existing;
      const secondary = preferIncoming ? existing : post;

      mergedByDocumentType.set(documentType, {
        ...secondary,
        ...primary,
        imageUrl:
          (primary?.sourceKind === 'request' ? normalizePreviewableImageUrl(primary?.imageUrl) : '') ||
          (secondary?.sourceKind === 'request' ? normalizePreviewableImageUrl(secondary?.imageUrl) : '') ||
          normalizePreviewableImageUrl(primary?.imageUrl) ||
          normalizePreviewableImageUrl(secondary?.imageUrl),
        fileName: String(primary?.fileName || secondary?.fileName || '').trim(),
        fileMimeType: String(primary?.fileMimeType || secondary?.fileMimeType || '').trim(),
        messageBody: String(primary?.messageBody || secondary?.messageBody || '').trim(),
        caseKey: String(primary?.caseKey || secondary?.caseKey || '').trim(),
        caseTitle: String(primary?.caseTitle || secondary?.caseTitle || '').trim(),
        status: String(primary?.status || secondary?.status || 'pending').trim().toLowerCase() || 'pending',
        created_at: primary?.created_at || secondary?.created_at || null,
        id: primary?.id || secondary?.id || `merged-${documentType}`,
      });
    });

    const metadataDocumentTypes = new Set(
      (Array.isArray(threadMetadata.documentTypes)
        ? threadMetadata.documentTypes
        : []
      )
        .map((type) => String(type || '').trim().toLowerCase())
        .filter(Boolean)
    );

    conversationMessages.forEach((message) => {
      const metadata = message?.metadata && typeof message.metadata === 'object' ? message.metadata : {};
      const documentType = String(metadata.documentType || metadata.verificationType || '').trim().toLowerCase();
      if (documentType) {
        metadataDocumentTypes.add(documentType);
      }
    });

    [...metadataDocumentTypes].forEach((documentType) => {
      if (mergedByDocumentType.has(documentType)) return;
      mergedByDocumentType.set(documentType, {
        id: `placeholder-${documentType}`,
        created_at: null,
        documentType,
        caseKey: '',
        caseTitle: '',
        status: verificationStatus || 'pending',
        imageUrl: '',
        fileName: '',
        messageBody: '',
        fileMimeType: '',
        sourceKind: 'placeholder',
      });
    });

    if (!mergedByDocumentType.size && verificationType) {
      mergedByDocumentType.set(verificationType, {
        id: `placeholder-${verificationType}`,
        created_at: null,
        documentType: verificationType,
        status: verificationStatus || 'pending',
        imageUrl: '',
        fileName: '',
        messageBody: '',
        fileMimeType: '',
        sourceKind: 'placeholder',
      });
    }

    return [...mergedByDocumentType.values()].sort(
      (a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
    );
  }, [conversationMessages, isVerificationThread, threadMetadata.documentTypes, verificationRequests, verificationStatus, verificationType]);
  const verificationDocumentTypes = useMemo(() => {
    const fromPosts = verificationPosts
      .map((post) => String(post.documentType || '').trim().toLowerCase())
      .filter(Boolean);
    const fromMessages = conversationMessages
      .map((message) => {
        const metadata = message?.metadata && typeof message.metadata === 'object' ? message.metadata : {};
        return String(metadata.documentType || metadata.verificationType || '').trim().toLowerCase();
      })
      .filter(Boolean);
    const fromMetadata = Array.isArray(threadMetadata.documentTypes)
      ? threadMetadata.documentTypes.map((type) => String(type || '').trim().toLowerCase()).filter(Boolean)
      : [];
    return [...new Set([...fromPosts, ...fromMessages, ...fromMetadata])];
  }, [conversationMessages, threadMetadata.documentTypes, verificationPosts]);
  const verificationHeaderSubtitle = useMemo(() => {
    if (!verificationDocumentTypes.length) {
      return getVerificationTypeLabel(verificationType || 'profile_id', isFrench ? 'fr' : 'en');
    }
    const labels = verificationDocumentTypes.map((type) =>
      getVerificationTypeLabel(type, isFrench ? 'fr' : 'en')
    );
    return labels.join(' + ');
  }, [verificationDocumentTypes, verificationType, isFrench]);
  const verificationPageHref = useMemo(() => {
    const fallbackHref = currentSenderRole === 'admin' ? '/admin/verification' : '/account/verification';
    if (!isVerificationThread) {
      return String(
        (currentSenderRole === 'admin' ? threadMetadata.adminHref : threadMetadata.href) ||
        threadMetadata.href ||
        fallbackHref
      ).trim() || fallbackHref;
    }

    const preferredPost = verificationPosts.find((post) => post.status === 'pending') || verificationPosts[0] || null;
    const params = new URLSearchParams();
    if (selectedThread?.entity_type) params.set('entityType', String(selectedThread.entity_type));
    if (selectedThread?.entity_id) params.set('entityId', String(selectedThread.entity_id));
    if (preferredPost?.id) params.set('documentId', String(preferredPost.id));
    if (preferredPost?.documentType) params.set('documentType', String(preferredPost.documentType));

    if ([...params.keys()].length) {
      return `${fallbackHref}?${params.toString()}`;
    }

    return String(
      (currentSenderRole === 'admin' ? threadMetadata.adminHref : threadMetadata.href) ||
      threadMetadata.href ||
      fallbackHref
    ).trim() || fallbackHref;
  }, [
    currentSenderRole,
    isVerificationThread,
    selectedThread?.entity_id,
    selectedThread?.entity_type,
    threadMetadata.adminHref,
    threadMetadata.href,
    verificationPosts,
  ]);
  const threadWorkspaceMode = currentLocationPath.startsWith('/admin') || currentLocationPath.startsWith('/guide')
    ? 'admin'
    : 'account';
  const threadContextTarget = useMemo(
    () => resolveThreadContextTarget(selectedThread, {
      workspace: threadWorkspaceMode,
      senderRole: currentSenderRole,
      fallbackHref: threadWorkspaceMode === 'admin' ? '/admin/messages' : '/account/messages',
    }),
    [currentSenderRole, selectedThread, threadWorkspaceMode]
  );
  const threadContextHref = workflowKind === 'identity_review'
    ? verificationPageHref
    : String(threadContextTarget?.href || '').trim();
  const threadContextActionLabel = useMemo(() => {
    const context = String(threadContextTarget?.context || '').trim().toLowerCase();
    if (context === 'verification') return tr('Open verification', 'Ouvrir la vérification');
    if (context === 'listing_review') return tr('Open listing review', "Ouvrir la revue de l'annonce");
    if (context === 'marketplace_request') return tr('Open request', 'Ouvrir la demande');
    if (context === 'rental') return tr('Open rental details', 'Ouvrir les détails de la location');
    if (context === 'tour') return tr('Open tour details', 'Ouvrir les détails du tour');
    if (context === 'support') return tr('Open support', 'Ouvrir le support');
    return tr('Open details', 'Ouvrir les détails');
  }, [threadContextTarget?.context, tr]);
  const buildVerificationDocumentHref = useCallback((post) => {
    const basePath = currentSenderRole === 'admin' ? '/admin/verification' : '/account/verification';
    const params = new URLSearchParams();
    if (selectedThread?.entity_type) params.set('entityType', String(selectedThread.entity_type));
    if (selectedThread?.entity_id) params.set('entityId', String(selectedThread.entity_id));
    if (post?.id && !String(post.id).startsWith('placeholder-') && !String(post.id).startsWith('legacy-')) {
      params.set('documentId', String(post.id));
    }
    if (post?.documentType) params.set('documentType', String(post.documentType));
    return `${basePath}?${params.toString()}`;
  }, [currentSenderRole, selectedThread?.entity_id, selectedThread?.entity_type]);
  const openVerificationDocument = useCallback((post) => {
    navigate(buildVerificationDocumentHref(post), {
      state: {
        from: currentLocationPath,
        fromLabel: currentSenderRole === 'admin'
          ? tr('Back to messages', 'Retour aux messages')
          : tr('Back to support', 'Retour au support'),
        threadKey: String(selectedThread?.thread_key || '').trim(),
        sourceContext: 'messages_verification_thread',
      },
    });
  }, [buildVerificationDocumentHref, currentLocationPath, currentSenderRole, navigate, selectedThread?.thread_key, tr]);
  const openVerificationPostPreview = useCallback((post) => {
    const matchingRequest = verificationRequests.find((request) => {
      const sameId =
        post?.id &&
        !String(post.id).startsWith('placeholder-') &&
        !String(post.id).startsWith('legacy-') &&
        String(request?.id || '').trim() === String(post.id).trim();
      const sameType =
        String(request?.verification_type || '').trim().toLowerCase() ===
        String(post?.documentType || '').trim().toLowerCase();
      return sameId || sameType;
    });

    const previewSrc = normalizePreviewableImageUrl(matchingRequest?.file_url)
      || normalizePreviewableImageUrl(post?.imageUrl);

    if (!previewSrc) {
      openVerificationDocument(post);
      return;
    }

    setActiveImagePreview({
      src: previewSrc,
      name:
        String(matchingRequest?.file_name || post?.fileName || '').trim() ||
        getVerificationTypeLabel(post?.documentType || 'profile_id', isFrench ? 'fr' : 'en'),
      caption: getVerificationTypeLabel(post?.documentType || 'profile_id', isFrench ? 'fr' : 'en'),
    });
  }, [isFrench, openVerificationDocument, verificationRequests]);
  const verificationChatLocked = Boolean(
    isVerificationThread && (
      (currentSenderRole !== 'admin' &&
        verificationPosts.length &&
        verificationPosts.every((post) => post.status === 'pending')) ||
      (currentSenderRole === 'admin' && isMergedVerificationThread)
    )
  );
  const isCustomerVerificationView = Boolean(isVerificationThread && currentSenderRole !== 'admin');
  const canReplyInThread = canReply && !verificationChatLocked;
  useEffect(() => {
    if (!isVerificationThread) {
      setShowVerificationDocuments(false);
      return;
    }
    setShowVerificationDocuments(false);
  }, [selectedThread?.thread_key, isVerificationThread]);
  const conversationStatusLabel = useMemo(
    () => (
      selectedThread?.family === 'marketplace'
        ? rentalState === 'pre_approved'
          ? tr('Legacy approval', 'Approbation héritée')
          : rentalState === 'approved'
            ? tr('Approved by owner', 'Approuvée par le propriétaire')
            : rentalState === 'active'
              ? tr('Rental live', 'Location active')
              : rentalState === 'completed'
                ? tr('Rental completed', 'Location terminée')
                : rentalState === 'declined'
                  ? tr('Declined', 'Refusée')
                  : rentalState === 'expired'
                    ? tr('Expired', 'Expirée')
                    : tr('Waiting for approval', 'En attente d’approbation')
        : getConversationStatusLabel(selectedThread, currentUserId, currentSenderRole, tr)
    ),
    [selectedThread, currentUserId, currentSenderRole, rentalState, tr]
  );
  const showConfirmBookingAction = Boolean(
    selectedThread?.family === 'marketplace' &&
    rentalState === 'pre_approved' &&
    selectedThread?.metadata?.href
  );
  const showBookingContextCard = Boolean(selectedThread?.family === 'marketplace' && selectedThread?.metadata?.href);
  const bookingHref = String(selectedThread?.metadata?.href || '').trim();
  const marketplaceRequestId = useMemo(() => {
    const match = bookingHref.match(/\/account\/rentals\/requests\/([^/?#]+)/i);
    if (match?.[1]) return decodeURIComponent(match[1]);
    return String(
      selectedThread?.metadata?.requestId ||
      selectedThread?.entity_id ||
      ''
    ).trim();
  }, [bookingHref, selectedThread?.entity_id, selectedThread?.metadata?.requestId]);
  const locale = isFrench ? 'fr' : 'en';
  const rentalPresentation = useMemo(
    () => (
      isRentalThread
        ? getRentalThreadPresentation(
            rentalContextData || {
              status: contextStatus || threadMetadata.status || selectedThread?.status || '',
              outstanding: threadMetadata.outstanding || 0,
              depositMode: threadMetadata.depositMode || '',
            },
            threadTimelineEvents,
            { isFrench, tr }
          )
        : null
    ),
    [contextStatus, isFrench, isRentalThread, rentalContextData, selectedThread?.status, threadMetadata.depositMode, threadMetadata.outstanding, threadMetadata.status, threadTimelineEvents, tr]
  );
  const rentalReference = String(
    rentalContextData?.rentalId ||
    rentalContextData?.reference ||
    selectedThread?.entity_id ||
    contextId ||
    ''
  ).trim();
  const rentalVehicleName = String(
    rentalContextData?.modelName ||
    rentalContextData?.vehicleName ||
    contextTitle ||
    selectedThread?.subject ||
    tr('Rental journey', 'Parcours location')
  ).trim();
  const rentalDateRange = useMemo(() => {
    const start = rentalContextData?.startDate ? formatDateTime(rentalContextData.startDate, isFrench) : '';
    const end = rentalContextData?.endDate ? formatDateTime(rentalContextData.endDate, isFrench) : '';
    return [start, end].filter(Boolean).join(' → ');
  }, [isFrench, rentalContextData?.endDate, rentalContextData?.startDate]);
  const rentalSummaryCards = useMemo(
    () => (
      isRentalThread && rentalContextData
        ? [
            {
              key: 'payment',
              label: tr('Payment', 'Paiement'),
              value: getRentalPaymentSummaryLabel(rentalContextData, { isFrench, tr, locale }),
            },
            {
              key: 'deposit',
              label: tr('Deposit', 'Caution'),
              value: getRentalDepositSummaryLabel(rentalContextData, { isFrench, tr, locale }),
            },
            {
              key: 'extension',
              label: tr('Extension', 'Extension'),
              value: getRentalExtensionSummaryLabel(rentalContextData, { isFrench, tr }),
            },
            {
              key: 'condition',
              label: tr('Condition', 'État'),
              value: getRentalConditionSummaryLabel(rentalContextData, { isFrench, tr }),
            },
          ]
        : []
    ),
    [isFrench, isRentalThread, locale, rentalContextData, tr]
  );
  const chatAction = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return String(params.get('action') || location.state?.action || '').trim().toLowerCase();
  }, [location.search, location.state]);
  const bookingHoldState = useMemo(
    () =>
      getMarketplaceApprovalHoldState({
        status: rentalState,
        holdExpiresAt: bookingContext?.holdExpiresAt || null,
        now: holdNow,
      }),
    [bookingContext?.holdExpiresAt, holdNow, rentalState]
  );
  const bookingChatGraceExpiresAt = String(
    bookingContext?.chatGraceExpiresAt ||
    selectedThread?.metadata?.chatGraceExpiresAt ||
    selectedThread?.metadata?.chat_grace_expires_at ||
    ''
  ).trim();
  const bookingChatGraceState = useMemo(
    () =>
      getMarketplaceChatGraceState({
        status: rentalState,
        chatGraceExpiresAt: bookingChatGraceExpiresAt || null,
        now: holdNow,
      }),
    [bookingChatGraceExpiresAt, holdNow, rentalState]
  );
  const bookingUiState = showBookingContextCard
    ? bookingHoldState.expired
      ? 'expired'
      : rentalState === 'declined'
        ? 'declined'
      : rentalState === 'completed'
          ? 'completed'
          : rentalState === 'active'
            ? 'active'
            : showConfirmBookingAction
              ? 'approved'
              : rentalState === 'approved'
                ? 'approved'
                : 'waiting'
    : 'default';
  const marketplaceThreadHref = String(selectedThread?.metadata?.href || '').trim();
  const marketplaceRoleContext = getThreadRoleContext(selectedThread, currentSenderRole);
  const marketplaceThreadView = useMemo(() => {
    if (selectedThread?.family !== 'marketplace') return '';
    if (marketplaceRoleContext === 'owner' || marketplaceRoleContext === 'customer') {
      return marketplaceRoleContext;
    }
    if (
      marketplaceThreadHref.includes('/account/operations/') ||
      marketplaceThreadHref.includes('/account/vehicles?requestId=') ||
      marketplaceThreadHref.includes('/account/vehicles#requests') ||
      marketplaceThreadHref.includes('/account/vehicles/')
    ) {
      return 'owner';
    }
    if (marketplaceThreadHref.includes('/account/rentals/requests/')) {
      return 'renter';
    }
    return '';
  }, [marketplaceRoleContext, marketplaceThreadHref, selectedThread?.family]);
  const isMarketplaceOwnerThread = Boolean(
    selectedThread?.family === 'marketplace' &&
    marketplaceRoleContext === 'owner' &&
    String(selectedThread?.thread_type || '').trim().toLowerCase() !== 'marketplace_moderation' &&
    String(selectedThread?.entity_type || '').trim().toLowerCase() !== 'listing'
  );
  const isMarketplaceModerationThread = Boolean(
    selectedThread?.family === 'marketplace' && (
      String(selectedThread?.thread_type || '').trim().toLowerCase() === 'marketplace_moderation' ||
      String(selectedThread?.entity_type || '').trim().toLowerCase() === 'listing'
    )
  );
  const marketplaceModerationProgress = useMemo(() => {
    if (!isMarketplaceModerationThread || currentSenderRole !== 'owner') return null;
    if (!listingSetupProgress || !Array.isArray(listingSetupProgress.steps)) return null;

    const steps = listingSetupProgress.steps;
    const ownerStep = steps.find((step) => step.key === 'owner_verification') || null;
    const documentsStep = steps.find((step) => step.key === 'vehicle_documents') || null;
    const reviewStep = steps.find((step) => step.key === 'review_publish') || null;
    const reviewState = String(listingSetupProgress.reviewPublishState || '').trim().toLowerCase() || 'blocked';
    const ownerStatus = String(ownerStep?.status || '').trim().toLowerCase();
    const documentsStatus = String(documentsStep?.status || '').trim().toLowerCase();
    const ownerDone = ownerStatus === 'done';
    const documentsDone = documentsStatus === 'done';

    const summarizePhase = (step, phase) => {
      const normalizedStatus = String(step?.status || '').trim().toLowerCase();

      if (phase === 'review') {
        if (reviewState === 'live') return tr('Published', 'Publiée');
        if (reviewState === 'approved') return tr('Approved', 'Approuvée');
        if (reviewState === 'waiting_for_admin') return tr('Waiting for admin', "En attente de l'admin");
        if (reviewState === 'changes_requested') return tr('Needs changes', 'Corrections requises');
        if (reviewState === 'ready_for_review') return tr('Ready to send', 'Prête à envoyer');
      }

      if (normalizedStatus === 'done') return tr('Approved', 'Approuvée');
      if (normalizedStatus === 'waiting') return tr('Waiting for admin', "En attente de l'admin");
      if (normalizedStatus === 'issue') return tr('Needs changes', 'Corrections requises');
      if (normalizedStatus === 'active') return tr('In progress', 'En cours');
      if (normalizedStatus === 'locked') return tr('Locked', 'Verrouillée');
      return tr('Todo', 'À faire');
    };

    const stateTone = (() => {
      if (reviewState === 'live' || reviewState === 'approved') {
        return {
          shell: 'border-emerald-200 bg-emerald-50',
          chip: 'bg-emerald-100 text-emerald-700',
          body: 'text-emerald-900',
          muted: 'text-emerald-700',
        };
      }
      if (reviewState === 'changes_requested') {
        return {
          shell: 'border-amber-200 bg-amber-50',
          chip: 'bg-amber-100 text-amber-700',
          body: 'text-amber-900',
          muted: 'text-amber-700',
        };
      }
      if (reviewState === 'waiting_for_admin') {
        return {
          shell: 'border-sky-200 bg-sky-50',
          chip: 'bg-sky-100 text-sky-700',
          body: 'text-sky-900',
          muted: 'text-sky-700',
        };
      }
      return {
        shell: 'border-violet-200 bg-violet-50',
        chip: 'bg-violet-100 text-violet-700',
        body: 'text-violet-900',
        muted: 'text-violet-700',
      };
    })();

    const headerStatusSummary = (() => {
      switch (reviewState) {
        case 'live':
          return tr('Live on marketplace', 'En ligne sur la marketplace');
        case 'approved':
          return tr('Approved for publication', 'Approuvée pour publication');
        case 'waiting_for_admin':
          return tr('Waiting for admin', "En attente de l'admin");
        case 'changes_requested':
          return tr('Needs owner updates', 'Corrections du propriétaire requises');
        case 'ready_for_review':
          return tr('Ready to send for review', 'Prête pour la revue');
        default:
          return tr('Continue listing setup', "Continuer la configuration de l'annonce");
      }
    })();

    const statusHistoryItems = [];

    if (ownerDone) {
      statusHistoryItems.push({
        key: 'owner-complete',
        state: 'complete',
        title: tr('Owner verified', 'Propriétaire vérifié'),
        body: tr('Your owner profile checks are complete.', 'Les vérifications de votre profil propriétaire sont terminées.'),
      });
    }

    if (documentsDone) {
      statusHistoryItems.push({
        key: 'documents-complete',
        state: 'complete',
        title: tr('Documents ready', 'Documents prêts'),
        body: tr('Vehicle documents are complete for listing review.', "Les documents du véhicule sont prêts pour la revue de l'annonce."),
      });
    }

    switch (reviewState) {
      case 'live':
        statusHistoryItems.push({
          key: 'review-approved',
          state: 'complete',
          title: tr('Approved for publication', 'Approuvée pour publication'),
          body: tr('Admin review finished successfully.', "La revue admin s'est terminée avec succès."),
        });
        statusHistoryItems.push({
          key: 'listing-live',
          state: 'current',
          title: tr('Published live', 'Publiée en ligne'),
          body: tr('The listing is now visible on the marketplace.', "L'annonce est maintenant visible sur la marketplace."),
        });
        break;
      case 'approved':
        statusHistoryItems.push({
          key: 'review-approved',
          state: 'current',
          title: tr('Approved for publication', 'Approuvée pour publication'),
          body: tr('Admin review is complete. The next step is publishing the listing.', "La revue admin est terminée. La prochaine étape consiste à publier l'annonce."),
        });
        break;
      case 'waiting_for_admin':
        statusHistoryItems.push({
          key: 'review-waiting',
          state: 'current',
          title: tr('Waiting for admin review', "En attente de la revue admin"),
          body: tr('The full listing package is with the review team now.', "Le dossier complet de l'annonce est maintenant chez l'équipe de revue."),
        });
        break;
      case 'changes_requested':
        statusHistoryItems.push({
          key: 'review-changes',
          state: 'current',
          title: tr('Changes requested', 'Corrections demandées'),
          body: tr('Update the listing setup, then send the review again.', "Mettez l'annonce à jour, puis renvoyez la revue."),
        });
        break;
      case 'ready_for_review':
        statusHistoryItems.push({
          key: 'review-ready',
          state: 'current',
          title: tr('Ready to send for review', 'Prête à envoyer en revue'),
          body: tr('Everything important is ready. Send the listing once to start admin review.', "Tout l'essentiel est prêt. Envoyez l'annonce une seule fois pour démarrer la revue admin."),
        });
        break;
      default:
        if (!ownerDone) {
          statusHistoryItems.push({
            key: 'owner-next',
            state: 'current',
            title: ownerStatus === 'issue'
              ? tr('Owner updates required', 'Corrections propriétaire requises')
              : tr('Finish owner verification', 'Terminer la vérification propriétaire'),
            body: ownerStatus === 'issue'
              ? tr('Fix the owner profile checks first, then continue the listing.', "Corrigez d'abord les vérifications du profil propriétaire, puis continuez l'annonce.")
              : tr('Complete the owner checks to unlock listing review.', "Terminez les vérifications propriétaire pour débloquer la revue de l'annonce."),
          });
        } else if (!documentsDone) {
          statusHistoryItems.push({
            key: 'documents-next',
            state: 'current',
            title: documentsStatus === 'issue'
              ? tr('Document updates required', 'Corrections documents requises')
              : tr('Finish vehicle documents', 'Terminer les documents du véhicule'),
            body: documentsStatus === 'issue'
              ? tr('Update the missing or rejected documents, then continue.', 'Mettez à jour les documents manquants ou refusés, puis continuez.')
              : tr('Complete the vehicle documents to unlock listing review.', "Terminez les documents du véhicule pour débloquer la revue de l'annonce."),
          });
        } else {
          statusHistoryItems.push({
            key: 'review-setup',
            state: 'current',
            title: tr('Continue listing setup', "Continuer la configuration de l'annonce"),
            body: tr('Finish the remaining setup once, then the review step will unlock.', "Terminez la configuration restante une seule fois, puis l'étape de revue se débloquera."),
          });
        }
        break;
    }

    const headerNextActionSummary = (() => {
      switch (reviewState) {
        case 'live':
          return tr('No action needed. Your listing is already live.', "Aucune action requise. Votre annonce est déjà en ligne.");
        case 'approved':
          return tr('No admin work remains. Publish the listing when you are ready.', "Aucun travail admin restant. Publiez l'annonce quand vous êtes prêt.");
        case 'waiting_for_admin':
          return tr('No action needed right now. The review team is checking the full listing package.', "Aucune action requise pour le moment. L'équipe de revue vérifie le dossier complet.");
        case 'changes_requested':
          return tr('Update the listing, then send the full review again.', "Mettez l'annonce à jour, puis renvoyez la revue complète.");
        case 'ready_for_review':
          return tr('Everything important is ready. Send the full review to start admin approval.', "Tout l'essentiel est prêt. Envoyez la revue complète pour démarrer l'approbation admin.");
        default:
          return tr('Finish the earlier steps once, then we will guide you directly into review.', "Terminez d'abord les étapes précédentes, puis nous vous guiderons directement vers la revue.");
      }
    })();

    return {
      reviewState,
      statusHistoryItems,
      stateTone,
      headerStatusSummary,
      headerNextActionSummary,
    };
  }, [currentSenderRole, isMarketplaceModerationThread, listingSetupProgress, tr]);
  const isSelfMarketplaceThread = useMemo(() => {
    if (selectedThread?.family !== 'marketplace') return false;
    const normalizedCurrentUserId = String(currentUserId || '').trim();
    const senderUserId = String(selectedThread?.sender_user_id || '').trim();
    const recipientUserId = String(selectedThread?.recipient_user_id || '').trim();
    return Boolean(
      normalizedCurrentUserId &&
      senderUserId &&
      recipientUserId &&
      senderUserId === normalizedCurrentUserId &&
      recipientUserId === normalizedCurrentUserId
    );
  }, [currentUserId, selectedThread?.family, selectedThread?.recipient_user_id, selectedThread?.sender_user_id]);
  const isMarketplaceRenterThread = Boolean(
    selectedThread?.family === 'marketplace' &&
    !isMarketplaceOwnerThread
  );
  const canOwnerModerateRequest = isMarketplaceOwnerThread && !isSelfMarketplaceThread && rentalState === 'pending';
  const isOwnerMarketplaceDecisionView = Boolean(
    showBookingContextCard &&
    isMarketplaceOwnerThread &&
    !isSelfMarketplaceThread &&
    rentalState === 'pending'
  );
  const marketplaceModerationChatLocked = Boolean(
    isMarketplaceModerationThread &&
    currentSenderRole === 'owner'
  );
  useEffect(() => {
    if (!marketplaceModerationProgress) return;

    if (['waiting_for_admin', 'approved', 'live', 'changes_requested'].includes(marketplaceModerationProgress.reviewState)) {
      setShowHeaderDetails(true);
    }
  }, [marketplaceModerationProgress]);
  const hideMarketplacePendingSummaryCard = Boolean(
    showBookingContextCard &&
    isMarketplaceRenterThread &&
    bookingUiState === 'waiting'
  );
  const marketplaceThreadIntegrity = String(selectedThread?.metadata?.integrity || '').trim().toLowerCase();
  const marketplaceThreadLegacyUnlinked = Boolean(
    selectedThread?.metadata?.legacy_unlinked === true ||
    marketplaceThreadIntegrity === 'legacy_unlinked'
  );
  const bookingReferenceMissing = !marketplaceRequestId || marketplaceThreadLegacyUnlinked;
  const canRenterConfirmInThread = Boolean(
    showConfirmBookingAction &&
    isMarketplaceRenterThread &&
    !bookingReferenceMissing
  );
  useEffect(() => {
    let cancelled = false;

    const loadBookingContext = async () => {
      if (
        !showBookingContextCard ||
        !marketplaceRequestId ||
        !currentUserId ||
        marketplaceThreadLegacyUnlinked
      ) {
        setBookingContext(null);
        return;
      }

      try {
        let detail = null;

        if (isMarketplaceRenterThread) {
          detail = await CustomerExperienceService.getCustomerMarketplaceRequestDetail(
            { id: currentUserId },
            marketplaceRequestId,
            { forceRefresh: true }
          );
        } else if (isMarketplaceOwnerThread) {
          const response = await BusinessMarketplaceService.getOwnerRequests(
            currentUserId,
            'all',
            { forceRefresh: true }
          );
          detail = (Array.isArray(response?.requests) ? response.requests : []).find(
            (request) => String(request?.id || '').trim() === String(marketplaceRequestId || '').trim()
          ) || null;
        }

        if (!cancelled) {
          setBookingContext(detail || null);
        }
      } catch {
        if (!cancelled) {
          setBookingContext(null);
        }
      }
    };

    void loadBookingContext();
    return () => {
      cancelled = true;
    };
  }, [
    showBookingContextCard,
    isMarketplaceOwnerThread,
    isMarketplaceRenterThread,
    marketplaceRequestId,
    currentUserId,
    marketplaceThreadLegacyUnlinked,
    selectedThread?.updated_at,
    selectedThread?.latest_message_at,
    conversationMessages.length,
  ]);
  useEffect(() => {
    const shouldTickLegacyHold = showBookingContextCard && bookingContext?.holdExpiresAt && rentalState === 'pre_approved';
    const shouldTickChatGrace = showBookingContextCard && bookingChatGraceExpiresAt && rentalState === 'approved';
    if (!shouldTickLegacyHold && !shouldTickChatGrace) {
      return undefined;
    }

    const timer = window.setInterval(() => {
      setHoldNow(Date.now());
    }, 1000);

    return () => window.clearInterval(timer);
  }, [bookingChatGraceExpiresAt, bookingContext?.holdExpiresAt, rentalState, showBookingContextCard]);

  useEffect(() => {
    if (bookingUiState !== 'approved' || chatAction !== 'confirm') {
      setCtaHighlightActive(false);
      if (bookingHighlightTimerRef.current) {
        window.clearTimeout(bookingHighlightTimerRef.current);
        bookingHighlightTimerRef.current = null;
      }
      return undefined;
    }

    setCtaHighlightActive(true);
    window.requestAnimationFrame(() => {
      bookingActionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });

    bookingHighlightTimerRef.current = window.setTimeout(() => {
      setCtaHighlightActive(false);
      bookingHighlightTimerRef.current = null;
    }, 2000);

    return () => {
      if (bookingHighlightTimerRef.current) {
        window.clearTimeout(bookingHighlightTimerRef.current);
        bookingHighlightTimerRef.current = null;
      }
    };
  }, [bookingUiState, chatAction]);
  useEffect(() => {
    if (!marketplaceActionError) return;

    window.requestAnimationFrame(() => {
      bookingActionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
  }, [marketplaceActionError]);
  const bookingCounterOffer = bookingContext?.counterOffer && typeof bookingContext.counterOffer === 'object'
    ? bookingContext.counterOffer
    : bookingContext?.counter_offer && typeof bookingContext.counter_offer === 'object'
      ? bookingContext.counter_offer
      : {};
  const threadCounterOffer = threadMetadata.counterOffer && typeof threadMetadata.counterOffer === 'object'
    ? threadMetadata.counterOffer
    : threadMetadata.counter_offer && typeof threadMetadata.counter_offer === 'object'
      ? threadMetadata.counter_offer
      : {};
  const bookingMoneySummary = useMemo(() => {
    const toMoneyNumber = (value) => {
      const numericValue = Number(value);
      return Number.isFinite(numericValue) ? numericValue : 0;
    };
    const rentalPrice = toMoneyNumber(
      bookingContext?.estimatedAmount ??
      bookingContext?.priceAmount ??
      bookingCounterOffer?.price_amount ??
      bookingCounterOffer?.priceAmount ??
      threadMetadata?.estimatedAmount ??
      threadMetadata?.priceAmount ??
      threadCounterOffer?.price_amount ??
      threadCounterOffer?.priceAmount ??
      bookingContext?.price_amount ??
      0
    );
    const platformFee = toMoneyNumber(
      bookingContext?.commissionAmount ??
      bookingContext?.platformFeeAmount ??
      bookingCounterOffer?.platform_fee_amount ??
      bookingCounterOffer?.platformFeeAmount ??
      threadMetadata?.commissionAmount ??
      threadMetadata?.platformFeeAmount ??
      threadCounterOffer?.platform_fee_amount ??
      threadCounterOffer?.platformFeeAmount ??
      bookingContext?.platform_fee_amount ??
      threadMetadata?.platform_fee_amount ??
      bookingContext?.amountDueNow ??
      threadMetadata?.amountDueNow ??
      0
    );
    const depositHold = toMoneyNumber(
      bookingContext?.damageDepositAmount ??
      bookingContext?.depositAmount ??
      bookingCounterOffer?.damage_deposit_amount ??
      bookingCounterOffer?.damageDepositAmount ??
      threadMetadata?.damageDepositAmount ??
      threadMetadata?.depositAmount ??
      threadCounterOffer?.damage_deposit_amount ??
      threadCounterOffer?.damageDepositAmount ??
      bookingContext?.damage_deposit_amount ??
      threadMetadata?.damage_deposit_amount ??
      bookingContext?.deposit_amount ??
      threadMetadata?.deposit_amount ??
      0
    );
    const totalNow = toMoneyNumber(
      bookingContext?.amountDueNow ??
      bookingCounterOffer?.amount_due_now ??
      bookingCounterOffer?.amountDueNow ??
      threadMetadata?.amountDueNow ??
      threadCounterOffer?.amount_due_now ??
      threadCounterOffer?.amountDueNow ??
      platformFee
    );

    return {
      rentalPrice,
      platformFee,
      depositHold,
      totalNow,
      currencyCode: String(
        bookingContext?.currencyCode ||
        bookingContext?.currency_code ||
        threadMetadata?.currencyCode ||
        threadMetadata?.currency_code ||
        'MAD'
      ).trim() || 'MAD',
    };
  }, [bookingContext, bookingCounterOffer, threadCounterOffer, threadMetadata]);
  const amountToConfirm = bookingMoneySummary.totalNow;
  const rentalPriceAmount = bookingMoneySummary.rentalPrice;
  const platformFeeAmount = bookingMoneySummary.platformFee;
  const depositHoldAmount = bookingMoneySummary.depositHold;
  const shouldShowApprovedPricingCards = isMarketplaceOwnerThread
    ? rentalPriceAmount > 0 || platformFeeAmount > 0 || depositHoldAmount > 0
    : rentalPriceAmount > 0 || platformFeeAmount > 0 || amountToConfirm > 0 || depositHoldAmount > 0;
  const ownerApprovedHelperText = tr(
    'Booking approved. Chat is open and pickup coordination can continue here.',
    'Réservation approuvée. Le chat est ouvert et la coordination du départ peut continuer ici.'
  );
  const holdCountdownLabel = bookingHoldState.active
    ? formatMarketplaceHoldCountdown(bookingHoldState.remainingMs)
    : '00:00';
  const graceCountdownLabel = bookingChatGraceState.active
    ? formatMarketplaceGraceCountdown(bookingChatGraceState.remainingMs)
    : '0m';
  const bookingVehicleName = String(
    bookingContext?.listingTitle ||
    threadMetadata.listingTitle ||
    threadMetadata.vehicleName ||
    contextTitle ||
    selectedThread?.subject ||
    tr('Booking request', 'Demande de réservation')
  ).trim();
  const marketplaceVehicleWorkspaceHref = useMemo(() => {
    const vehiclePublicProfileId = String(
      bookingContext?.vehiclePublicProfileId ||
      selectedThread?.metadata?.vehiclePublicProfileId ||
      ''
    ).trim();
    return vehiclePublicProfileId
      ? `/account/vehicles/${encodeURIComponent(vehiclePublicProfileId)}/profile?tab=listing`
      : '';
  }, [bookingContext?.vehiclePublicProfileId, selectedThread?.metadata?.vehiclePublicProfileId]);
  const marketplaceVehiclePublicHref = useMemo(() => {
    const listingId = String(
      bookingContext?.listingId ||
      selectedThread?.metadata?.listingId ||
      selectedThread?.metadata?.vehiclePublicProfileId ||
      ''
    ).trim();
    return listingId ? buildMarketplaceListingPath(listingId) : '';
  }, [
    bookingContext?.listingId,
    selectedThread?.metadata?.listingId,
    selectedThread?.metadata?.vehiclePublicProfileId,
  ]);
  const marketplaceVehicleShortcutHref = useMemo(() => (
    isMarketplaceOwnerThread
      ? marketplaceVehicleWorkspaceHref || marketplaceVehiclePublicHref
      : marketplaceVehiclePublicHref || marketplaceVehicleWorkspaceHref
  ), [isMarketplaceOwnerThread, marketplaceVehiclePublicHref, marketplaceVehicleWorkspaceHref]);
  const currentThreadReturnPath = useMemo(
    () => `${location.pathname || ''}${location.search || ''}${location.hash || ''}` || '/account/messages',
    [location.hash, location.pathname, location.search]
  );
  const marketplaceRequestReference = String(
    bookingContext?.requestReference ||
    threadMetadata.requestReference ||
    threadMetadata.reference ||
    ''
  ).trim();
  const bookingDateRange = useMemo(() => {
    const requestedStartAt =
      bookingContext?.requestedStartAt ||
      threadMetadata.requestedStartAt ||
      threadMetadata.requested_start_at ||
      '';
    const requestedEndAt =
      bookingContext?.requestedEndAt ||
      threadMetadata.requestedEndAt ||
      threadMetadata.requested_end_at ||
      '';
    const start = requestedStartAt ? formatDateTime(new Date(requestedStartAt), isFrench) : '';
    const end = requestedEndAt ? formatDateTime(new Date(requestedEndAt), isFrench) : '';
    return [start, end].filter(Boolean).join(' → ');
  }, [
    bookingContext?.requestedEndAt,
    bookingContext?.requestedStartAt,
    isFrench,
    threadMetadata.requestedEndAt,
    threadMetadata.requestedStartAt,
    threadMetadata.requested_end_at,
    threadMetadata.requested_start_at,
  ]);
  const bookingRentalLookupId = String(
    bookingContext?.rentalId ||
    bookingContext?.rental_id ||
    bookingContext?.raw?.rental_id ||
    bookingContext?.rawRequest?.rental_id ||
    threadMetadata.rentalId ||
    threadMetadata.rental_id ||
    ''
  ).trim();
  const marketplaceRentalDetailsHref = bookingRentalLookupId
    ? `${getWorkspaceRentalPathPrefix(location.pathname)}${encodeURIComponent(bookingRentalLookupId)}`
    : '';
  const normalizedBookingHref = String(bookingHref || '').trim();
  const marketplaceRequestDetailsHref = (() => {
    if (normalizedBookingHref.includes('/account/rentals/requests/')) {
      return normalizedBookingHref;
    }
    if (normalizedBookingHref.includes('/account/rentals/')) {
      return normalizedBookingHref;
    }
    return marketplaceRequestId
      ? `/account/rentals/requests/${encodeURIComponent(marketplaceRequestId)}`
      : '';
  })();
  const marketplaceOwnerDetailsHref = (() => {
    const ownerExecutionRequest = {
      id: marketplaceRequestId,
      requestStatus:
        bookingContext?.requestStatus ||
        threadMetadata.requestStatus ||
        threadMetadata.request_status ||
        '',
      ownerExecution:
        bookingContext?.ownerExecution ||
        bookingContext?.raw?.counter_offer?.owner_execution ||
        threadMetadata.ownerExecution ||
        {},
      vehiclePublicProfileId:
        bookingContext?.vehiclePublicProfileId ||
        threadMetadata.vehiclePublicProfileId ||
        threadMetadata.vehicle_public_profile_id ||
        '',
    };
    const shouldFocusExecution = Boolean(getOwnerExecutionActionConfig(ownerExecutionRequest, tr));
    const ownerExecutionHref = buildOwnerExecutionWorkspaceHref({
      ...ownerExecutionRequest,
    }, {
      focus: shouldFocusExecution ? 'execution' : 'request',
    });
    if (
      ownerExecutionHref &&
      ownerExecutionHref !== '/account/vehicles' &&
      ownerExecutionHref !== '/account/overview'
    ) {
      return ownerExecutionHref;
    }
    if (
      normalizedBookingHref.includes('/account/operations/') ||
      normalizedBookingHref.includes('/account/vehicles?requestId=') ||
      normalizedBookingHref.includes('/account/vehicles/')
    ) {
      return normalizedBookingHref;
    }
    return marketplaceRequestId
      ? `/account/rentals/requests/${encodeURIComponent(marketplaceRequestId)}`
      : '';
  })();
  const marketplaceCustomerDetailsHref = marketplaceRequestDetailsHref;
  const marketplaceThreadType = String(selectedThread?.thread_type || selectedThread?.threadType || '').trim().toLowerCase();
  const isOwnerFacingMarketplaceView =
    marketplaceThreadType === 'marketplace_owner_request'
      ? true
      : marketplaceThreadType === 'marketplace_customer_request'
        ? false
        : ['owner', 'business_owner'].includes(String(currentSenderRole || '').trim().toLowerCase());
  const marketplacePrimaryDetailsHref = isOwnerFacingMarketplaceView
    ? marketplaceOwnerDetailsHref
    : marketplaceCustomerDetailsHref;
  const marketplaceOwnerExecutionAction = useMemo(
    () => getOwnerExecutionActionConfig({
      id: marketplaceRequestId,
      requestStatus:
        bookingContext?.requestStatus ||
        threadMetadata.requestStatus ||
        threadMetadata.request_status ||
        '',
      ownerExecution:
        bookingContext?.ownerExecution ||
        bookingContext?.raw?.counter_offer?.owner_execution ||
        threadMetadata.ownerExecution ||
        {},
      vehiclePublicProfileId:
        bookingContext?.vehiclePublicProfileId ||
        threadMetadata.vehiclePublicProfileId ||
        threadMetadata.vehicle_public_profile_id ||
        '',
    }, tr),
    [
      bookingContext?.ownerExecution,
      bookingContext?.raw?.counter_offer?.owner_execution,
      bookingContext?.requestStatus,
      bookingContext?.vehiclePublicProfileId,
      marketplaceRequestId,
      threadMetadata.ownerExecution,
      threadMetadata.requestStatus,
      threadMetadata.request_status,
      threadMetadata.vehiclePublicProfileId,
      threadMetadata.vehicle_public_profile_id,
      tr,
    ]
  );
  const marketplacePrimaryDetailsLabel = isOwnerFacingMarketplaceView && marketplaceOwnerExecutionAction?.ctaLabel
    ? marketplaceOwnerExecutionAction.ctaLabel
    : tr('Open rental details', 'Ouvrir les détails de la location');
  const requestAgainHref = useMemo(() => {
    const listingId = String(
      bookingContext?.listingId ||
      selectedThread?.metadata?.listingId ||
      selectedThread?.metadata?.vehiclePublicProfileId ||
      ''
    ).trim();
    if (!listingId) return '';

    const requestedStartAt = bookingContext?.requestedStartAt ? new Date(bookingContext.requestedStartAt) : null;
    const requestedEndAt = bookingContext?.requestedEndAt ? new Date(bookingContext.requestedEndAt) : null;
    const safeStartDate =
      requestedStartAt && !Number.isNaN(requestedStartAt.getTime())
        ? requestedStartAt.toISOString().slice(0, 10)
        : '';
    const safeStartTime =
      requestedStartAt && !Number.isNaN(requestedStartAt.getTime())
        ? requestedStartAt.toISOString().slice(11, 16)
        : '';
    const safeStart =
      requestedStartAt && !Number.isNaN(requestedStartAt.getTime())
        ? requestedStartAt.toISOString()
        : '';
    const safeEnd =
      requestedEndAt && !Number.isNaN(requestedEndAt.getTime())
        ? requestedEndAt.toISOString()
        : '';

    return buildMarketplaceRequestPath(listingId, {
      start: safeStart,
      end: safeEnd,
      startDate: safeStartDate,
      startTime: safeStartTime,
      rentalType: bookingContext?.rentalType || '',
      duration: bookingContext?.duration || '',
      source: 'expired-thread',
    });
  }, [
    bookingContext?.duration,
    bookingContext?.requestedEndAt,
    bookingContext?.listingId,
    bookingContext?.rentalType,
    bookingContext?.requestedStartAt,
    selectedThread?.metadata?.listingId,
    selectedThread?.metadata?.vehiclePublicProfileId,
  ]);
  const handleRequestAgain = useCallback(() => {
    const navigateToRequestAgain = (href) => {
      setRequestAgainError('');
      navigate(href, {
        state: { from: `${location.pathname}${location.search || ''}${location.hash || ''}` },
      });
    };

    if (requestAgainHref) {
      navigateToRequestAgain(requestAgainHref);
      return;
    }

    if (!isMarketplaceRenterThread || !marketplaceRequestId || !currentUserId) {
      setRequestAgainError(
        tr(
          'This booking cannot be reloaded. Please browse vehicles.',
          'Cette réservation ne peut pas être rechargée. Veuillez parcourir les véhicules.'
        )
      );
      return;
    }

    void CustomerExperienceService.getMarketplaceRequestRecovery({ id: currentUserId }, marketplaceRequestId, {
      forceRefresh: true,
    })
      .then((recovery) => {
        const resolvedListingId = String(recovery?.listingId || recovery?.vehicleId || '').trim();
        if (!resolvedListingId) {
          throw new Error('Marketplace request not found');
        }

        const requestedStartAt = recovery?.startTime ? new Date(recovery.startTime) : null;
        const requestedEndAt = recovery?.endTime ? new Date(recovery.endTime) : null;
        const safeStartDate =
          requestedStartAt && !Number.isNaN(requestedStartAt.getTime())
            ? requestedStartAt.toISOString().slice(0, 10)
            : '';
        const safeStartTime =
          requestedStartAt && !Number.isNaN(requestedStartAt.getTime())
            ? requestedStartAt.toISOString().slice(11, 16)
            : '';
        const safeStart =
          requestedStartAt && !Number.isNaN(requestedStartAt.getTime())
            ? requestedStartAt.toISOString()
            : '';
        const safeEnd =
          requestedEndAt && !Number.isNaN(requestedEndAt.getTime())
            ? requestedEndAt.toISOString()
            : '';

        navigateToRequestAgain(
          buildMarketplaceRequestPath(resolvedListingId, {
            start: safeStart,
            end: safeEnd,
            startDate: safeStartDate,
            startTime: safeStartTime,
            rentalType: recovery?.rentalType || '',
            duration: recovery?.duration || '',
            source: 'expired-thread',
          })
        );
      })
      .catch(() => {
        setRequestAgainError(
          tr(
            'This booking cannot be reloaded. Please browse vehicles.',
            'Cette réservation ne peut pas être rechargée. Veuillez parcourir les véhicules.'
          )
        );
      });
  }, [
    currentUserId,
    isMarketplaceRenterThread,
    location.hash,
    location.pathname,
    location.search,
    marketplaceRequestId,
    navigate,
    requestAgainHref,
    tr,
  ]);
  const marketplaceThreadTitle = bookingVehicleName
    ? `${bookingVehicleName} ${tr('request', 'demande')}`
    : tr('Booking request', 'Demande de réservation');
  const headerPrimaryName = showBookingContextCard
    ? (isOwnerMarketplaceDecisionView
        ? (bookingVehicleName || tr('Booking request', 'Demande de réservation'))
        : marketplaceThreadTitle)
    : isVerificationThread
      ? (String(threadMetadata.reviewTitle || '').trim() || tr('Identity review', "Révision d'identité"))
      : (contextTitle || otherParty.name || otherParty.email || selectedThread.subject || tr('Conversation', 'Conversation'));
  const bookingHeaderDateRange = bookingDateRange || [threadMetadata.requestedStartLabel, threadMetadata.requestedEndLabel].filter(Boolean).join(' → ');
  const verificationDocumentLabels = useMemo(
    () => verificationPosts.map((post) => getVerificationTypeLabel(post.documentType || 'profile_id', isFrench ? 'fr' : 'en')),
    [verificationPosts, isFrench]
  );
  const verificationDocumentSummary = useMemo(() => {
    if (!verificationDocumentLabels.length) return '';
    if (verificationDocumentLabels.length === 1) return verificationDocumentLabels[0];
    if (verificationDocumentLabels.length === 2) return verificationDocumentLabels.join(' + ');
    return tr(
      `${verificationDocumentLabels[0]} + ${verificationDocumentLabels.length - 1} more`,
      `${verificationDocumentLabels[0]} + ${verificationDocumentLabels.length - 1} autres`
    );
  }, [verificationDocumentLabels, tr]);
  const verificationCaseSummaries = useMemo(
    () =>
      verificationCases.map((entry) => ({
        caseKey: String(entry?.caseKey || `${entry?.entityType || 'user'}:${entry?.entityId || ''}`).trim(),
        title: String(entry?.title || '').trim() || tr('Verification case', 'Dossier de vérification'),
        status: String(entry?.status || 'pending').trim().toLowerCase() || 'pending',
        entityType: String(entry?.entityType || '').trim().toLowerCase(),
        documentTypes: Array.isArray(entry?.documentTypes) ? entry.documentTypes.filter(Boolean) : [],
        latestMessageAt: entry?.latestMessageAt || null,
      })),
    [tr, verificationCases]
  );
  const headerSecondaryLabel = showBookingContextCard
    ? (isOwnerMarketplaceDecisionView
        ? bookingHeaderDateRange
        : bookingHeaderDateRange)
    : isVerificationThread
      ? verificationHeaderSubtitle
      : (contextSubtitle || otherParty.email || selectedThread.subject || '');
  const adminCounterpartyEmail = currentSenderRole === 'admin'
    ? String(otherParty?.email || '').trim()
    : '';
  const resolvedHeaderSecondaryLabel = useMemo(() => {
    if (!adminCounterpartyEmail) return headerSecondaryLabel;
    const normalizedBase = String(headerSecondaryLabel || '').trim();
    if (!normalizedBase) return adminCounterpartyEmail;
    if (normalizedBase.toLowerCase().includes(adminCounterpartyEmail.toLowerCase())) return normalizedBase;
    return `${normalizedBase} • ${adminCounterpartyEmail}`;
  }, [adminCounterpartyEmail, headerSecondaryLabel]);
  const counterpartyIdentityLabel = String(otherParty?.name || otherParty?.email || '').trim();
  const verificationNeedsChanges = ['rejected', 'needs_info', 'needs_changes', 'suspended', 'expired'].includes(verificationStatus);
  const verificationStatusLabel =
    verificationStatus === 'approved'
      ? tr('Verified', 'Vérifié')
      : verificationStatus === 'expired'
          ? tr('Expired', 'Expiré')
        : verificationNeedsChanges
          ? tr('Needs changes', 'Corrections requises')
          : tr('In review', 'En révision');
  const pendingVerificationPosts = useMemo(
    () => (
      verificationStatus === 'approved'
        ? []
        : verificationPosts.filter((post) => post.status === 'pending')
    ),
    [verificationPosts, verificationStatus]
  );
  const rejectedVerificationPosts = useMemo(
    () => verificationPosts.filter((post) => ['rejected', 'needs_info', 'needs_changes', 'suspended', 'expired'].includes(post.status)),
    [verificationPosts]
  );
  const nextVerificationPost = pendingVerificationPosts[0] || null;
  const primaryVerificationIssue = rejectedVerificationPosts[0] || verificationPosts[0] || null;
  const primaryVerificationIssueLabel = primaryVerificationIssue
    ? getVerificationTypeLabel(primaryVerificationIssue.documentType || 'profile_id', isFrench ? 'fr' : 'en')
    : '';
  const primaryVerificationIssueReason = String(primaryVerificationIssue?.messageBody || '').trim();
  const customerVerificationSummaryPosts = isCustomerVerificationView && verificationNeedsChanges
    ? rejectedVerificationPosts
    : verificationPosts;
  const verificationCaseHeadline = verificationStatus === 'approved'
    ? currentSenderRole === 'admin'
      ? tr('Identity review complete', "Révision d'identité terminée")
      : ''
    : verificationNeedsChanges
      ? currentSenderRole === 'admin'
        ? tr('Identity review needs updates', "La révision d'identité nécessite des corrections")
        : ''
      : currentSenderRole === 'admin'
        ? tr('Identity review is open', "La révision d'identité est ouverte")
        : tr('Identity review in progress', "Révision d'identité en cours");
  const verificationCaseSupportingLine = verificationDocumentSummary
    ? tr(
      `Documents in this review: ${verificationDocumentSummary}`,
      `Documents dans cette révision : ${verificationDocumentSummary}`
    )
    : '';
  const verificationCaseNextStep = verificationStatus === 'approved'
    ? ''
    : verificationNeedsChanges
      ? (isCustomerVerificationView
          ? ''
          : tr('Review the flagged identity documents and send an updated version.', "Vérifiez les documents d'identité signalés et envoyez une version mise à jour."))
      : currentSenderRole === 'admin'
        ? tr('Review the identity documents below and close the case when ready.', "Examinez les documents d'identité ci-dessous et clôturez le dossier quand vous êtes prêt.")
        : tr('We’re reviewing your identity documents now.', "Nous examinons actuellement vos documents d'identité.");
  const verificationNextStepText = isVerificationThread
    ? verificationStatus === 'approved'
      ? ''
      : verificationNeedsChanges
        ? ''
        : currentSenderRole === 'admin'
          ? tr('Review the submitted identity documents and decide.', "Examinez les documents d'identité soumis et décidez.")
          : tr('Waiting for admin review.', "En attente de la révision admin.")
    : '';
  const nextStepText = showConfirmBookingAction
    ? tr('Next step: confirm your booking to continue', 'Étape suivante : confirmez votre réservation pour continuer')
    : bookingUiState === 'expired'
      ? tr('Booking hold expired', 'Réservation expirée')
    : rentalState === 'pending' || rentalState === 'countered'
      ? tr('Next step: the owner reviews your request', "Étape suivante : le propriétaire examine votre demande")
      : rentalState === 'declined'
        ? tr('This request was declined by the owner', 'Cette demande a été refusée par le propriétaire')
        : '';
  const bookingIntegrityMessage = bookingReferenceMissing
    ? tr(
        'This booking cannot be confirmed. Please request again.',
        'Cette réservation ne peut pas être confirmée. Veuillez faire une nouvelle demande.'
      )
    : '';
  const compactWaitingText = rentalState === 'pending' || rentalState === 'countered'
    ? tr('Waiting for approval • Owner reviews your request', "En attente d’approbation • Le propriétaire examine votre demande")
    : bookingUiState === 'expired'
      ? tr('Booking hold expired', 'Réservation expirée')
      : nextStepText;
  const pendingBookingHelperText = tr(
    'The owner will review this request before you can continue.',
    'Le propriétaire examinera cette demande avant que vous puissiez continuer.'
  );
  const approvedBookingHelperText = tr(
    'Deposit is on hold and chat is now open.',
    'La caution est retenue et le chat est maintenant ouvert.'
  );
  const normalizedCurrentSenderRole = String(currentSenderRole || '').trim().toLowerCase();
  const normalizedCounterpartyRole = String(otherParty?.role || replyTarget?.role || '').trim().toLowerCase();
  const isDirectStaffThread = Boolean(
    threadMetadata.directStaffChat ||
    ['admin', 'employee', 'guide', 'owner', 'business_owner', 'staff', 'support'].includes(normalizedCounterpartyRole)
  );
  useEffect(() => {
    if (!allowInternalNotes) {
      setComposerMode('customer');
      setShowInternalNotes(false);
      return;
    }

    if (isDirectStaffThread) {
      setComposerMode('internal');
      setShowInternalNotes(true);
      return;
    }

    setComposerMode('customer');
    setShowInternalNotes(false);
  }, [allowInternalNotes, isDirectStaffThread, selectedThread?.thread_key]);
  const isOperationalRole = ['admin', 'employee', 'guide', 'support', 'owner', 'business_owner', 'staff'].includes(normalizedCurrentSenderRole);
  const formattedCurrentUserLabel = String(currentUserLabel || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
    .join(' ');
  const formattedCounterpartyLabel = String(otherParty?.name || replyTarget?.label || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
    .join(' ');
  const roleViewLabel = isOwnerMarketplaceDecisionView
    ? ''
    : isOperationalRole
    ? formattedCounterpartyLabel
      ? tr(`Customer: ${formattedCounterpartyLabel}`, `Client : ${formattedCounterpartyLabel}`)
      : tr('Customer', 'Client')
    : formattedCounterpartyLabel
      ? tr(`Owner: ${formattedCounterpartyLabel}`, `Propriétaire : ${formattedCounterpartyLabel}`)
      : tr('Owner', 'Propriétaire');
  const composerShellClass = isOperationalRole
    ? 'border-slate-200/90 bg-[linear-gradient(180deg,rgba(255,255,255,0.995),rgba(248,250,252,0.99))]'
    : 'border-violet-200/75 bg-[linear-gradient(180deg,rgba(255,255,255,0.99),rgba(248,245,255,0.98))]';
  const composerIconClass = isOperationalRole
    ? 'bg-slate-900 text-white shadow-[0_8px_16px_rgba(15,23,42,0.12)]'
    : 'bg-violet-100 text-violet-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]';
  const composerAccentClass = isOperationalRole
    ? 'bg-[linear-gradient(90deg,transparent,rgba(148,163,184,0.45),transparent)]'
    : 'bg-[linear-gradient(90deg,transparent,rgba(167,139,250,0.55),transparent)]';
  const composerActionButtonClass = isOperationalRole
    ? 'bg-slate-900 shadow-[0_12px_24px_rgba(15,23,42,0.18)] hover:-translate-y-0.5 hover:bg-slate-950'
    : 'bg-violet-600 shadow-[0_12px_24px_rgba(124,58,237,0.24)] hover:-translate-y-0.5 hover:bg-violet-700';
  const composerAttachmentButtonClass = isOperationalRole
    ? 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'
    : 'border-violet-100 bg-white/90 text-violet-700 hover:border-violet-200 hover:bg-violet-50';
  const composerAudienceSummary = allowInternalNotes
    ? composerMode === 'internal'
      ? isDirectStaffThread
        ? tr('Shared only with the internal team in this thread.', "Partagée uniquement avec l’équipe interne dans ce fil.")
        : tr('Visible only to admins and staff on this thread.', 'Visible uniquement par les admins et le staff sur ce fil.')
      : threadConversationKind === 'social_reply'
        ? tr('Visible inside this shared reply thread and ready for richer consumer chat later.', 'Visible dans ce fil de réponse partagé et prêt pour un chat grand public enrichi plus tard.')
      : tr('Visible to the customer-facing participants in this thread.', 'Visible par les participants côté client dans ce fil.')
    : '';
  const showContextualActionBar = Boolean(
    (isVerificationThread && currentSenderRole === 'admin' && nextVerificationPost) ||
    canOwnerModerateRequest ||
    canRenterConfirmInThread
  );
  const contextualActionTitle = isVerificationThread && currentSenderRole === 'admin' && nextVerificationPost
    ? tr('Review this submission', 'Examinez cette soumission')
    : canOwnerModerateRequest
      ? tr('Decide on this request', 'Décidez de cette demande')
      : canRenterConfirmInThread
        ? tr('Complete the booking', 'Finalisez la réservation')
        : '';
  const contextualActionSummary = isVerificationThread && currentSenderRole === 'admin' && nextVerificationPost
    ? tr('Approve the document to continue, or reject it if changes are still needed.', 'Approuvez le document pour continuer, ou refusez-le si des corrections sont nécessaires.')
    : canOwnerModerateRequest
      ? (isOwnerMarketplaceDecisionView
          ? ''
          : tr('Approve to move this booking forward, or reject it and close the request.', 'Approuvez pour faire avancer cette réservation, ou refusez et clôturez la demande.'))
      : canRenterConfirmInThread
        ? insufficientWalletAmount
          ? tr('Add the remaining wallet balance, then confirm to secure the booking.', 'Ajoutez le solde manquant au portefeuille, puis confirmez pour sécuriser la réservation.')
          : tr('Confirm now to lock in the booking before the hold expires.', 'Confirmez maintenant pour sécuriser la réservation avant l’expiration.')
        : '';
  const contextualActionToneClass = isVerificationThread && currentSenderRole === 'admin' && nextVerificationPost
    ? 'border-emerald-200 bg-emerald-50/80'
    : canOwnerModerateRequest
      ? 'border-sky-200 bg-sky-50/80'
      : canRenterConfirmInThread
        ? bookingHoldState.urgency === 'critical' || bookingHoldState.urgency === 'low'
          ? 'border-rose-200 bg-rose-50/85'
          : 'border-violet-200 bg-violet-50/85'
        : 'border-slate-200 bg-slate-50';
  const showThreadTools = Boolean(
    !compactMode &&
    !isDirectStaffThread &&
    !isVerificationThread &&
    allowThreadStateControls &&
    onUpdateThreadState
  );
  const headerStatusSummary = isOwnerMarketplaceDecisionView
    ? tr('Waiting for your decision', 'En attente de votre décision')
    : marketplaceModerationProgress
    ? marketplaceModerationProgress.headerStatusSummary
    : isMarketplaceModerationThread && currentSenderRole === 'owner'
    ? tr('Waiting for admin approval', "En attente de l'approbation admin")
    : isVerificationThread
    ? verificationCaseHeadline
    : showBookingContextCard
      ? bookingUiState === 'approved'
        ? tr('Booking approved', 'Réservation approuvée')
        : bookingUiState === 'waiting'
          ? tr('Waiting for approval', 'En attente d’approbation')
          : bookingUiState === 'confirmed'
            ? tr('Booking confirmed', 'Réservation confirmée')
            : bookingUiState === 'active'
              ? tr('Rental live', 'Location active')
              : bookingUiState === 'declined'
                ? tr('Booking declined', 'Réservation refusée')
                : bookingUiState === 'expired'
                  ? tr('Booking expired', 'Réservation expirée')
                  : tr('Conversation active', 'Conversation active')
      : conversationStatusLabel;
  const headerNextActionSummary = isOwnerMarketplaceDecisionView
    ? ''
    : marketplaceModerationProgress
    ? marketplaceModerationProgress.headerNextActionSummary
    : isMarketplaceModerationThread && currentSenderRole === 'owner'
    ? tr('The review team will approve this listing in messages once the full review is complete.', "L'équipe de revue approuvera cette annonce dans les messages une fois la revue complète terminée.")
    : isVerificationThread
    ? verificationNextStepText
    : showBookingContextCard
      ? bookingUiState === 'waiting'
        ? pendingBookingHelperText
        : bookingUiState === 'approved'
          ? approvedBookingHelperText
          : nextStepText
      : tr('Continue the conversation here.', 'Continuez la conversation ici.');
  const defaultConversationNextActionSummary = tr('Continue the conversation here.', 'Continuez la conversation ici.');
  const compactHeaderNextActionSummary = !showBookingContextCard &&
    !marketplaceModerationProgress &&
    !isMarketplaceModerationThread &&
    !isRentalThread &&
    !isVerificationThread &&
    headerNextActionSummary === defaultConversationNextActionSummary
      ? ''
      : headerNextActionSummary;
  const compactHeaderToneClass = isOwnerMarketplaceDecisionView
    ? 'border-sky-200 bg-sky-50'
    : marketplaceModerationProgress
    ? marketplaceModerationProgress.stateTone.shell
    : isVerificationThread
    ? verificationStatus === 'approved'
      ? 'border-emerald-200 bg-emerald-50'
      : verificationNeedsChanges
        ? 'border-amber-200 bg-amber-50'
        : 'border-slate-200 bg-slate-50'
    : showBookingContextCard
      ? bookingUiState === 'approved'
        ? 'border-violet-200 bg-violet-50'
        : bookingUiState === 'declined'
          ? 'border-rose-200 bg-rose-50'
          : bookingUiState === 'expired'
            ? 'border-slate-200 bg-slate-50'
            : 'border-sky-200 bg-sky-50'
      : 'border-slate-200 bg-slate-50';
  const hasExpandableHeaderDetails = Boolean(
    marketplaceModerationProgress ||
    (isRentalThread && rentalContextData) ||
    (showBookingContextCard && !isOwnerMarketplaceDecisionView && !hideMarketplacePendingSummaryCard)
  );
  const shouldUseMinimalBookingContextHeader = Boolean(
    compactMode &&
    showBookingContextCard &&
    !isOwnerMarketplaceDecisionView &&
    !hideMarketplacePendingSummaryCard
  );
  const shouldShowCompactStatusBlock = !isVerificationThread && Boolean(
    !shouldUseMinimalBookingContextHeader &&
    (
      showBookingContextCard ||
      marketplaceModerationProgress ||
      isRentalThread ||
      String(compactHeaderNextActionSummary || '').trim()
    )
  );
  const compactHeaderStatusIconClass = isVerificationThread
    ? verificationStatus === 'approved'
      ? 'bg-emerald-100 text-emerald-700'
      : verificationNeedsChanges
        ? 'bg-amber-100 text-amber-700'
        : 'bg-slate-200 text-slate-600'
    : marketplaceModerationProgress
      ? marketplaceModerationProgress.stateTone.chip
    : showBookingContextCard
      ? bookingUiState === 'approved'
        ? 'bg-violet-100 text-violet-700'
        : bookingUiState === 'declined'
          ? 'bg-rose-100 text-rose-700'
          : bookingUiState === 'expired'
            ? 'bg-slate-200 text-slate-600'
            : 'bg-sky-100 text-sky-700'
      : 'bg-slate-200 text-slate-600';
  const insufficientWalletAmount = useMemo(
    () => parseMarketplaceWalletAmount(marketplaceActionError),
    [marketplaceActionError]
  );
  const walletActionHref = useMemo(() => {
    const params = new URLSearchParams();
    if (marketplaceRequestId) params.set('requestId', marketplaceRequestId);
    params.set('action', 'confirm');
    return `/account/messages?${params.toString()}`;
  }, [marketplaceRequestId]);
  const marketplaceActionHelper = useMemo(
    () =>
      getMarketplaceWalletGuidance(marketplaceActionError, {
        tr,
        locale,
        returnTo: walletActionHref,
      }),
    [locale, marketplaceActionError, tr, walletActionHref]
  );
  const workflowContextLabel = workflowKind === 'identity_review'
    ? tr('Open verification', 'Ouvrir la vérification')
    : workflowKind === 'listing_review'
      ? tr('Open listing review', "Ouvrir la revue de l'annonce")
      : threadContextActionLabel;
  const openWorkflowContext = useCallback(() => {
    if (workflowKind === 'identity_review') {
      navigate(verificationPageHref, {
        state: {
          from: currentLocationPath,
          fromLabel: tr('Back to messages', 'Retour aux messages'),
          threadKey: String(selectedThread?.thread_key || '').trim(),
          sourceContext: 'messages_verification_thread',
        },
      });
      return;
    }
    if (typeof onOpenContext === 'function') {
      onOpenContext(selectedThread);
      return;
    }
    if (threadContextHref) {
      navigate(threadContextHref, {
        state: {
          from: currentLocationPath,
        },
      });
    }
  }, [currentLocationPath, navigate, onOpenContext, selectedThread, threadContextHref, verificationPageHref, workflowKind]);
  const workflowHistoryItems = useMemo(() => {
    if (threadSurface !== 'workflow') return [];

    const eventItems = threadTimelineEvents
      .map((event, index) => {
        const metadata = event?.metadata && typeof event.metadata === 'object' ? event.metadata : {};
        const state = String(event?.state || metadata.state || event?.type || '').trim().toLowerCase();
        const title = String(event?.title || event?.label || metadata.title || metadata.label || '').trim();
        const body = String(event?.description || event?.body || metadata.description || metadata.body || '').trim();
        const createdAt = event?.created_at || event?.at || metadata.createdAt || null;
        if (!title && !body) return null;
        return {
          id: String(event?.id || `timeline-${index}`).trim(),
          title: title || tr('Workflow update', 'Mise à jour workflow'),
          body,
          createdAt,
          tone: ['approved', 'verified', 'completed', 'live'].includes(state)
            ? 'success'
            : ['rejected', 'needs_changes', 'needs_info', 'suspended', 'expired'].includes(state)
              ? 'warning'
              : 'neutral',
        };
      })
      .filter(Boolean);

    const messageItems = conversationMessages
      .map((message) => {
        const messageType = String(message?.message_type || '').trim().toLowerCase();
        const metadata = message?.metadata && typeof message.metadata === 'object' ? message.metadata : {};
        const body = String(message?.body || '').trim();
        if (!body && !metadata.status && !metadata.verificationStatus) return null;
        const actor = getParticipantLabel(message, currentUserId, currentUserLabel, tr);
        const title = ['approval_event', 'verified', 'approved'].includes(messageType)
          ? tr('Approved', 'Approuvé')
          : ['rejection_event', 'changes_requested'].includes(messageType)
            ? tr('Needs changes', 'Corrections requises')
            : actor || tr('Workflow note', 'Note workflow');
        const state = String(metadata.status || metadata.verificationStatus || messageType).trim().toLowerCase();
        return {
          id: String(message?.id || '').trim(),
          title,
          body,
          createdAt: message?.created_at || null,
          tone: ['approved', 'verified'].includes(state)
            ? 'success'
            : ['rejected', 'needs_changes', 'needs_info', 'suspended', 'expired'].includes(state)
              ? 'warning'
              : 'neutral',
        };
      })
      .filter(Boolean);

    return [...eventItems, ...messageItems]
      .sort((left, right) => new Date(right.createdAt || 0).getTime() - new Date(left.createdAt || 0).getTime());
  }, [conversationMessages, currentUserId, currentUserLabel, threadSurface, threadTimelineEvents, tr]);
  const marketplaceHumanConversationCount = useMemo(() => {
    if (selectedThread?.family !== 'marketplace') return 0;
    const humanMessageTypes = new Set(['user_message', 'admin_message', 'message', 'note']);
    return conversationMessages.filter((message) => {
      const messageType = String(message?.message_type || '').trim().toLowerCase();
      const metadata = message?.metadata && typeof message.metadata === 'object' ? message.metadata : {};
      if (metadata.isInternal || messageType === 'internal_note') return false;
      if (metadata.autoWelcome || metadata.isSystemSeed) return false;
      return humanMessageTypes.has(messageType) || (messageType === '' && !metadata.event);
    }).length;
  }, [conversationMessages, selectedThread?.family]);
  const displayConversationMessages = useMemo(() => {
    const allowedEvents = new Set(['request_sent', 'approved', 'confirmed', 'started', 'completed']);
    const hasStructuredTimelineEvents = threadTimelineEvents.length > 0;
    const filteredMessages = conversationMessages.filter((message) => {
      const messageType = String(message?.message_type || '').trim().toLowerCase();
      const metadata = message?.metadata && typeof message.metadata === 'object' ? message.metadata : {};
      if (isRentalThread) {
        const rentalStructuredTypes = new Set([
          'submission_event',
          'approval_event',
          'rejection_event',
          'status_event',
          'system_event',
          'system_update',
          'notification',
        ]);
        if (rentalStructuredTypes.has(messageType)) {
          return false;
        }
      }
      if (hasStructuredTimelineEvents) {
        const looksLikeStructuredEvent =
          ['submission_event', 'approval_event', 'rejection_event', 'status_event'].includes(messageType) ||
          (messageType === 'system_event' && Boolean(metadata.event));
        if (looksLikeStructuredEvent) {
          return false;
        }
      }
      if (isVerificationThread) {
        if (['verification_card', 'verification_post', 'verification_submission', 'verification_status'].includes(messageType)) {
          return false;
        }
        if (
          messageType === 'verification_note' &&
          String(metadata.source || '').trim().toLowerCase() === 'verification_status_auto_note'
        ) {
          return false;
        }
        if (
          isCustomerVerificationView &&
          messageType === 'system_event' &&
          ['verification_review_status', 'verification_review_complete'].includes(String(metadata.source || '').trim().toLowerCase())
        ) {
          return false;
        }
      }
      if (selectedThread?.family !== 'marketplace') return true;
      const body = String(message?.body || '').trim().toLowerCase();
      const isLegacyApprovalHelper =
        body === 'your request has been pre-approved by the owner. continue here in messages to confirm the next steps.' ||
        body === 'votre demande a été préapprouvée par le propriétaire. continuez ici dans les messages pour confirmer la suite.';
      const isLegacyNotificationEcho =
        body === 'owner approved your request. confirm to continue.' ||
        body === 'votre propriétaire a approuvé votre demande. confirmez pour continuer.';
      const isLegacyApprovalChatNote = body === 'approved';
      const isStructuredEvent = messageType === 'system_event' && Boolean(metadata.event);
      const eventName = String(metadata.event || '').trim().toLowerCase();
      const hasAllowedEvent = isStructuredEvent && allowedEvents.has(eventName);
      const isHumanMessage = ['user_message', 'admin_message', 'message', 'note'].includes(messageType);
      const isDuplicateApprovedEvent =
        !isHumanMessage &&
        eventName === 'approved' &&
        ['pre_approved', 'approved'].includes(rentalState) &&
        marketplaceHumanConversationCount > 0;

      if (isLegacyApprovalHelper || isLegacyNotificationEcho || isLegacyApprovalChatNote) return false;
      if (isDuplicateApprovedEvent) return false;
      if (isStructuredEvent && !hasAllowedEvent) return false;
      if ((messageType === 'system_update' || messageType === 'notification') && !isStructuredEvent) {
        return false;
      }
      return true;
    });

    if (!isVerificationThread) {
      return filteredMessages;
    }

    if (isCustomerVerificationView) {
      return filteredMessages.filter((message) => {
        const messageType = String(message?.message_type || '').trim().toLowerCase();
        const metadata = message?.metadata && typeof message.metadata === 'object' ? message.metadata : {};
        if (metadata.isInternal || messageType === 'internal_note') return false;
        return ['user_message', 'admin_message', 'message', 'note', 'verification_note'].includes(messageType) || (messageType === '' && !metadata.event);
      });
    }

    const groupedMessages = [];
    const submissionGroupWindowMs = 10 * 60 * 1000;
    const approvalGroupWindowMs = 10 * 60 * 1000;
    let submissionBuffer = [];
    let approvalBuffer = [];

    const buildVerificationDocumentLabel = (message) => {
      const metadata = message?.metadata && typeof message.metadata === 'object' ? message.metadata : {};
      const documentType = String(metadata.documentType || metadata.verificationType || '').trim().toLowerCase();
      if (documentType) {
        return getVerificationTypeLabel(documentType, isFrench ? 'fr' : 'en');
      }
      const body = String(message?.body || '').trim();
      const subject = String(message?.subject || '').trim();
      const inferred = body || subject;
      return inferred
        .replace(/\s*approved\s*$/i, '')
        .replace(/\s*submitted\s*$/i, '')
        .trim() || tr('Verification document', 'Document de vérification');
    };

    const flushSubmissionBuffer = () => {
      if (!submissionBuffer.length) return;
      if (submissionBuffer.length === 1) {
        groupedMessages.push(submissionBuffer[0]);
      } else {
        const documentLabels = submissionBuffer.map(buildVerificationDocumentLabel).filter(Boolean);
        groupedMessages.push({
          ...submissionBuffer[submissionBuffer.length - 1],
          id: `grouped-verification-submission-${submissionBuffer.map((message) => message?.id || message?.created_at).join('-')}`,
          message_type: 'submission_event',
          subject: tr('Verification submitted', 'Vérification envoyée'),
          body: '',
          metadata: {
            ...(submissionBuffer[submissionBuffer.length - 1]?.metadata && typeof submissionBuffer[submissionBuffer.length - 1].metadata === 'object'
              ? submissionBuffer[submissionBuffer.length - 1].metadata
              : {}),
            groupedVerificationSubmissions: documentLabels,
            groupedVerificationSubmissionCount: submissionBuffer.length,
          },
          created_at: submissionBuffer[submissionBuffer.length - 1]?.created_at,
        });
      }
      submissionBuffer = [];
    };

    const flushApprovalBuffer = () => {
      if (!approvalBuffer.length) return;
      if (approvalBuffer.length === 1) {
        groupedMessages.push(approvalBuffer[0]);
      } else {
        const documentLabels = approvalBuffer
          .map(buildVerificationDocumentLabel)
          .filter(Boolean);

        groupedMessages.push({
          ...approvalBuffer[approvalBuffer.length - 1],
          id: `grouped-verification-approval-${approvalBuffer.map((message) => message?.id || message?.created_at).join('-')}`,
          message_type: 'approval_event',
          subject: tr('Verification approved', 'Vérification approuvée'),
          body: '',
          metadata: {
            ...(approvalBuffer[approvalBuffer.length - 1]?.metadata && typeof approvalBuffer[approvalBuffer.length - 1].metadata === 'object'
              ? approvalBuffer[approvalBuffer.length - 1].metadata
              : {}),
            groupedVerificationApprovals: documentLabels,
            groupedVerificationApprovalCount: approvalBuffer.length,
          },
          created_at: approvalBuffer[approvalBuffer.length - 1]?.created_at,
        });
      }
      approvalBuffer = [];
    };

    const isSubmissionCandidate = (message) => {
      const metadata = message?.metadata && typeof message.metadata === 'object' ? message.metadata : {};
      const messageType = String(message?.message_type || '').trim().toLowerCase();
      const normalizedStatus = String(metadata.status || metadata.verificationStatus || '').trim().toLowerCase();
      if (messageType === 'submission_event') return true;
      return messageType === 'verification_card' && normalizedStatus === 'pending';
    };

    const isApprovalCandidate = (message) => {
      const metadata = message?.metadata && typeof message.metadata === 'object' ? message.metadata : {};
      const messageType = String(message?.message_type || '').trim().toLowerCase();
      const normalizedStatus = String(metadata.status || metadata.verificationStatus || '').trim().toLowerCase();
      const eventType = String(metadata.type || '').trim().toLowerCase();
      const body = String(message?.body || '').trim().toLowerCase();
      const subject = String(message?.subject || '').trim().toLowerCase();

      if (messageType === 'approval_event') return true;
      if (messageType === 'verification_card' && normalizedStatus === 'approved') return true;
      if (messageType !== 'system_event') return false;

      const looksVerificationRelated = Boolean(
        metadata.verificationCaseId ||
        metadata.documentType ||
        metadata.verificationType ||
        eventType === 'verification' ||
        subject.includes('verification')
      );

      return looksVerificationRelated && (body.includes('approved') || subject.includes('approved'));
    };

    filteredMessages.forEach((message) => {
      if (isSubmissionCandidate(message)) {
        const messageCreatedAtMs = new Date(message?.created_at || 0).getTime();
        const previousCreatedAtMs = new Date(submissionBuffer[submissionBuffer.length - 1]?.created_at || 0).getTime();

        if (
          submissionBuffer.length &&
          messageCreatedAtMs &&
          previousCreatedAtMs &&
          Math.abs(messageCreatedAtMs - previousCreatedAtMs) > submissionGroupWindowMs
        ) {
          flushSubmissionBuffer();
        }

        submissionBuffer.push(message);
        return;
      }

      if (!isApprovalCandidate(message)) {
        flushSubmissionBuffer();
        flushApprovalBuffer();
        if (isCustomerVerificationView) {
          const messageType = String(message?.message_type || '').trim().toLowerCase();
          const body = String(message?.body || '').trim().toLowerCase();
          const subject = String(message?.subject || '').trim().toLowerCase();
          const senderRole = String(message?.sender_role || '').trim().toLowerCase();
          const isPlainStatusEcho = (
            messageType === 'admin_message' ||
            messageType === 'user_message' ||
            messageType === 'message' ||
            messageType === 'note'
          ) && ['admin', 'support'].includes(senderRole) && (
            /\bapproved\b/.test(body) ||
            /\bapproved\b/.test(subject) ||
            /\bsubmitted\b/.test(body) ||
            /\bsubmitted\b/.test(subject)
          );
          if (isPlainStatusEcho) return;
        }
        groupedMessages.push(message);
        return;
      }

      flushSubmissionBuffer();
      const messageCreatedAtMs = new Date(message?.created_at || 0).getTime();
      const previousCreatedAtMs = new Date(approvalBuffer[approvalBuffer.length - 1]?.created_at || 0).getTime();

      if (
        approvalBuffer.length &&
        messageCreatedAtMs &&
        previousCreatedAtMs &&
        Math.abs(messageCreatedAtMs - previousCreatedAtMs) > approvalGroupWindowMs
      ) {
        flushApprovalBuffer();
      }

      approvalBuffer.push(message);
    });

    flushSubmissionBuffer();
    flushApprovalBuffer();
    return groupedMessages;
  }, [
    conversationMessages,
    getVerificationTypeLabel,
    isFrench,
    isCustomerVerificationView,
    marketplaceHumanConversationCount,
    isRentalThread,
    isVerificationThread,
    selectedThread?.family,
    rentalState,
    threadTimelineEvents,
    tr,
  ]);
  const realConversationMessages = useMemo(() => {
    const humanMessageTypes = new Set(['user_message', 'admin_message', 'message', 'note', 'verification_note']);
    return displayConversationMessages.filter((message) => {
      const messageType = String(message?.message_type || '').trim().toLowerCase();
      const metadata = message?.metadata && typeof message.metadata === 'object' ? message.metadata : {};
      if (metadata.isInternal || messageType === 'internal_note') return false;
      if (metadata.autoWelcome || metadata.isSystemSeed) return false;
      if (humanMessageTypes.has(messageType)) return true;
      return messageType === '' && !metadata.event;
    });
  }, [displayConversationMessages]);
  const internalConversationMessages = useMemo(
    () => visibleMessages.filter((message) => {
      const messageType = String(message?.message_type || '').trim().toLowerCase();
      const metadata = message?.metadata && typeof message.metadata === 'object' ? message.metadata : {};
      if (!(metadata.isInternal || messageType === 'internal_note')) return false;
      if (metadata.autoWelcome || metadata.isSystemSeed) return false;
      return true;
    }),
    [visibleMessages]
  );
  const hasInternalConversationMessages = internalConversationMessages.length > 0;
  const hasRealConversationMessages = realConversationMessages.length > 0;
  useEffect(() => {
    if (bookingUiState !== 'approved') return;
    setApprovedSummaryExpanded(!hasRealConversationMessages);
  }, [bookingUiState, hasRealConversationMessages, selectedThread?.thread_key]);
  const showThreadComposer = canReplyInThread && !marketplaceModerationChatLocked && (!isOwnerMarketplaceDecisionView || hasRealConversationMessages);
  const displayTimelineEntries = useMemo(() => {
    const eventEntries = threadTimelineEvents.map((event) => ({
      kind: 'event',
      id: `thread-event-${event.id}`,
      created_at: event.created_at,
      payload: event,
    }));
    const messageEntries = displayConversationMessages.map((message) => ({
      kind: 'message',
      id: String(message?.id || `${message?.created_at || ''}:${message?.body || ''}`),
      created_at: message?.created_at,
      payload: message,
    }));
    const hasApprovedMarketplaceEntry = messageEntries.some((entry) => {
      const message = entry.payload;
      const metadata = message?.metadata && typeof message.metadata === 'object' ? message.metadata : {};
      const messageType = String(message?.message_type || '').trim().toLowerCase();
      return messageType === 'approval_event' || String(metadata.event || '').trim().toLowerCase() === 'approved';
    });
    const syntheticApprovedMarketplaceEntry = (
      selectedThread?.family === 'marketplace' &&
      bookingUiState === 'approved' &&
      !hasApprovedMarketplaceEntry
    )
      ? {
          kind: 'message',
          id: `marketplace-approved-${marketplaceRequestId || selectedThread?.thread_key || 'thread'}`,
          created_at:
            bookingContext?.approvedAt ||
            bookingContext?.chatUnlockedAt ||
            selectedThread?.metadata?.approvedAt ||
            selectedThread?.metadata?.chatUnlockedAt ||
            selectedThread?.latest_message_at ||
            selectedThread?.created_at ||
            null,
          payload: {
            id: `marketplace-approved-${marketplaceRequestId || selectedThread?.thread_key || 'thread'}`,
            message_type: 'system_event',
            subject: tr('Booking approved', 'Réservation approuvée'),
            body: tr('Booking approved and chat is open.', 'Réservation approuvée et chat ouvert.'),
            created_at:
              bookingContext?.approvedAt ||
              bookingContext?.chatUnlockedAt ||
              selectedThread?.metadata?.approvedAt ||
              selectedThread?.metadata?.chatUnlockedAt ||
              selectedThread?.latest_message_at ||
              selectedThread?.created_at ||
              null,
            metadata: {
              event: 'approved',
              type: 'marketplace_request',
              status: 'approved',
              requestStatus: 'approved',
              requestId: marketplaceRequestId || undefined,
            },
          },
        }
      : null;

    if (isOwnerMarketplaceDecisionView) {
      const requestSubmittedEntry = messageEntries.find((entry) => {
        const message = entry.payload;
        const metadata = message?.metadata && typeof message.metadata === 'object' ? message.metadata : {};
        const messageType = String(message?.message_type || '').trim().toLowerCase();
        const eventType = String(metadata.type || metadata.event || '').trim().toLowerCase();
        const body = String(message?.body || '').trim().toLowerCase();
        return (
          (messageType === 'submission_event' && (eventType === 'marketplace_request' || eventType === 'request_sent')) ||
          body === 'request submitted'
        );
      }) || null;
      const fallbackRequestSubmittedEntry = requestSubmittedEntry || (
        bookingVehicleName || marketplaceRequestReference || marketplaceRequestId
          ? {
              kind: 'message',
              id: `owner-request-submitted-${marketplaceRequestId || marketplaceRequestReference || selectedThread?.thread_key || 'thread'}`,
              created_at: selectedThread?.latest_message_at || selectedThread?.created_at || bookingContext?.createdAt || null,
              payload: {
                id: `owner-request-submitted-${marketplaceRequestId || marketplaceRequestReference || selectedThread?.thread_key || 'thread'}`,
                message_type: 'submission_event',
                body: 'Request submitted',
                created_at: selectedThread?.latest_message_at || selectedThread?.created_at || bookingContext?.createdAt || null,
                metadata: {
                  type: 'marketplace_request',
                  requestReference: marketplaceRequestReference,
                  listingTitle: bookingVehicleName,
                  vehicleName: bookingVehicleName,
                  imageUrl: normalizePreviewableImageUrl(
                    bookingContext?.coverImageUrl ||
                    selectedThread?.metadata?.coverImageUrl ||
                    selectedThread?.metadata?.imageUrl ||
                    ''
                  ),
                },
              },
            }
          : null
      );
      const humanEntries = realConversationMessages.map((message) => ({
        kind: 'message',
        id: String(message?.id || `${message?.created_at || ''}:${message?.body || ''}`),
        created_at: message?.created_at,
        payload: message,
      }));

      return [...(fallbackRequestSubmittedEntry ? [fallbackRequestSubmittedEntry] : []), ...humanEntries].sort(
        (a, b) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime()
      );
    }

    if (isRentalThread) {
      return [
        ...eventEntries.sort(
          (a, b) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime()
        ),
        ...messageEntries.sort(
          (a, b) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime()
        ),
      ];
    }

    if (isVerificationThread && isCustomerVerificationView) {
      const humanEntries = realConversationMessages.map((message) => ({
        kind: 'message',
        id: String(message?.id || `${message?.created_at || ''}:${message?.body || ''}`),
        created_at: message?.created_at,
        payload: message,
      }));
      return [...eventEntries, ...humanEntries].sort(
        (a, b) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime()
      );
    }

    return [...eventEntries, ...messageEntries, ...(syntheticApprovedMarketplaceEntry ? [syntheticApprovedMarketplaceEntry] : [])].sort(
      (a, b) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime()
    );
  }, [
    bookingContext?.approvedAt,
    bookingContext?.chatUnlockedAt,
    bookingUiState,
    bookingContext?.coverImageUrl,
    bookingContext?.createdAt,
    bookingVehicleName,
    displayConversationMessages,
    isCustomerVerificationView,
    isOwnerMarketplaceDecisionView,
    isRentalThread,
    isVerificationThread,
    marketplaceRequestId,
    marketplaceRequestReference,
    realConversationMessages,
    selectedThread?.created_at,
    selectedThread?.latest_message_at,
    selectedThread?.metadata?.approvedAt,
    selectedThread?.metadata?.chatUnlockedAt,
    selectedThread?.metadata?.coverImageUrl,
    selectedThread?.metadata?.imageUrl,
    selectedThread?.thread_key,
    threadTimelineEvents,
    tr,
  ]);
  const performMarketplaceAction = async (action, payload = {}) => {
    if (typeof onPerformMarketplaceAction !== 'function' || !selectedThread) return;
    setMarketplaceActionBusy(action);
    setMarketplaceActionError('');
    try {
      await onPerformMarketplaceAction(selectedThread, action, {
        ...payload,
        ...(marketplaceRequestId ? { requestId: marketplaceRequestId } : {}),
      });
      if (action === 'confirm_booking') {
        setBookingContext((current) => (
          current
            ? {
                ...current,
                requestStatus: 'approved',
                holdExpiresAt: null,
              }
            : current
        ));
      }
    } catch (actionError) {
      setMarketplaceActionError(
        actionError?.message ||
        tr('Unable to update this booking right now.', 'Impossible de mettre à jour cette réservation pour le moment.')
      );
    } finally {
      setMarketplaceActionBusy('');
    }
  };
  const canDeleteMessage = useCallback((message) => {
    const messageId = String(message?.id || '').trim();
    if (!messageId || String(messageId).startsWith('pending-')) return false;
    if (String(message?.sender_user_id || '').trim() !== String(currentUserId || '').trim()) return false;
    const messageType = String(message?.message_type || '').trim().toLowerCase();
    return ['note', 'message', 'user_message', 'admin_message', 'internal_note'].includes(messageType);
  }, [currentUserId]);
  const handleDeleteMessage = useCallback(async (message) => {
    const messageId = String(message?.id || '').trim();
    if (!messageId || !canDeleteMessage(message)) return;

    if (typeof window !== 'undefined') {
      const confirmed = window.confirm(
        tr('Delete this message for everyone in the thread?', 'Supprimer ce message pour tout le monde dans le fil ?')
      );
      if (!confirmed) return;
    }

    setDeletingMessageId(messageId);
    setSendError('');
    setDeletedMessageIds((current) => ({ ...current, [messageId]: true }));

    try {
      await MessageService.deleteSharedMessage(messageId, {
        threadKey: resolvedThreadKey,
      });
    } catch (deleteError) {
      setDeletedMessageIds((current) => {
        const next = { ...current };
        delete next[messageId];
        return next;
      });
      setSendError(
        deleteError?.message ||
        tr('Unable to delete this message right now.', 'Impossible de supprimer ce message pour le moment.')
      );
    } finally {
      setDeletingMessageId('');
    }
  }, [canDeleteMessage, resolvedThreadKey, tr]);
  const handleAddMessageToDraft = useCallback((message) => {
    const messageBody = String(message?.body || '').trim();
    if (!messageBody) {
      setSendError(
        tr('Only text messages can be added to the draft.', 'Seuls les messages texte peuvent être ajoutés au brouillon.')
      );
      return;
    }

    setComposerMode((current) => (
      Boolean(message?.metadata?.isInternal) || String(message?.message_type || '').trim().toLowerCase() === 'internal_note'
        ? 'internal'
        : current === 'internal'
          ? 'customer'
          : current
    ));
    setComposerText((current) => current.trim() ? `${current.trim()}\n${messageBody}` : messageBody);
    setSendError('');
  }, [tr]);
  useEffect(() => {
    if (!openMessageActionId && !threadHeaderMenuOpen) return undefined;

    const handleWindowClick = () => {
      setOpenMessageActionId('');
      setThreadHeaderMenuOpen(false);
    };

    window.addEventListener('click', handleWindowClick);
    return () => window.removeEventListener('click', handleWindowClick);
  }, [openMessageActionId, threadHeaderMenuOpen]);
  const getMarketplaceStateCard = useCallback((message) => {
    const messageType = String(message?.message_type || '').trim().toLowerCase();
    if (messageType !== 'system_event') return null;

    const metadata = message?.metadata && typeof message.metadata === 'object' ? message.metadata : {};
    const eventName = String(metadata.event || metadata.eventType || '').trim().toLowerCase();

    if (eventName === 'approved') {
      const isOwnerView = isMarketplaceOwnerThread || currentSenderRole === 'owner';
      return {
        tone: 'violet',
        icon: 'approved',
        title: isOwnerView
          ? tr('Booking approved', 'Réservation approuvée')
          : tr('Booking approved', 'Réservation approuvée'),
        subtitle: isOwnerView
          ? tr('Chat is open with the renter', 'Le chat est ouvert avec le client')
          : tr('Chat is open with the owner', 'Le chat est ouvert avec le propriétaire'),
        detail: isOwnerView
          ? tr('You can continue pickup coordination here.', 'Vous pouvez continuer la coordination du départ ici.')
          : tr('You can continue pickup coordination here.', 'Vous pouvez continuer la coordination du départ ici.'),
      };
    }

    if (eventName === 'confirmed') {
      return {
        tone: 'emerald',
        title: tr('Confirmed', 'Confirmée'),
        subtitle: tr('Chat is open', 'Le chat est ouvert'),
        detail: tr('The booking is confirmed and the rental can move to pickup.', 'La réservation est confirmée et peut passer au départ.'),
      };
    }

    if (eventName === 'started') {
      return {
        tone: 'emerald',
        title: tr('Rental live', 'Location active'),
        subtitle: tr('The rental is now in progress', 'La location est maintenant en cours'),
        detail: tr('Use this thread for any questions during the rental.', 'Utilisez ce fil pour toute question pendant la location.'),
      };
    }

    if (eventName === 'completed') {
      const rawDocumentActions = [
        ...(Array.isArray(metadata.documentLinks) ? metadata.documentLinks : []),
        ...(Array.isArray(metadata.document_links) ? metadata.document_links : []),
        ...(Array.isArray(metadata.documentActions) ? metadata.documentActions : []),
        ...(Array.isArray(metadata.document_actions) ? metadata.document_actions : []),
      ];
      const completionReceipt =
        metadata.completionReceipt && typeof metadata.completionReceipt === 'object'
          ? metadata.completionReceipt
          : metadata.completion_receipt && typeof metadata.completion_receipt === 'object'
            ? metadata.completion_receipt
            : null;
      const receiptAction = rawDocumentActions.find((action) => {
        const actionKey = String(action?.kind || action?.key || action?.label || action?.title || '').trim().toLowerCase();
        return actionKey.includes('receipt') || actionKey.includes('reçu') || actionKey.includes('recu');
      });
      const receiptHref = String(
        completionReceipt?.url ||
        metadata.finalReceiptUrl ||
        receiptAction?.href ||
        receiptAction?.url ||
        ''
      ).trim();
      const receiptGeneratedAt = completionReceipt?.generatedAt || metadata.finalReceiptGeneratedAt || null;
      const completedAt = completionReceipt?.completedAt || metadata.completedAt || message?.created_at || null;
      const mileageOverage =
        completionReceipt?.mileageOverage ||
        metadata.mileageOverage ||
        metadata.mileage_overage ||
        null;
      const mileageOverageAmount = Number(mileageOverage?.amount || 0) || 0;
      const mileageOverageExtraKm = Number(mileageOverage?.extraKm || mileageOverage?.extra_km || 0) || 0;
      const mileageOverageSettlement = String(mileageOverage?.settlement || '').trim().toLowerCase();
      const mileageOverageSettlementLabel = mileageOverageSettlement === 'deduct_deposit'
        ? tr('deducted from deposit', 'déduit de la caution')
        : mileageOverageSettlement === 'paid_separately'
          ? tr('paid separately', 'payé séparément')
          : mileageOverageSettlement === 'waived'
            ? tr('waived', 'annulé')
            : mileageOverageSettlement === 'unpaid'
              ? tr('unpaid', 'impayé')
              : '';
      const mileageOverageSummary = mileageOverageAmount > 0 || mileageOverageExtraKm > 0
        ? `${tr('Extra mileage', 'Kilométrage extra')}: ${formatMoney(mileageOverageAmount, mileageOverage?.currency || mileageOverage?.currencyCode || 'MAD', isFrench ? 'fr' : 'en')}${mileageOverageExtraKm > 0 ? ` · ${mileageOverageExtraKm} km` : ''}${mileageOverageSettlementLabel ? ` · ${mileageOverageSettlementLabel}` : ''}`
        : '';

      return {
        tone: 'slate',
        title: tr('Rental completed', 'Location terminée'),
        subtitle: tr('The booking is closed', 'La réservation est clôturée'),
        detail: receiptHref
          ? ''
          : tr('This rental is now complete in the shared timeline.', 'Cette location est désormais terminée dans la chronologie partagée.'),
        hideBody: true,
        documentCards: receiptHref
          ? [
              {
                key: 'final-receipt',
                title: tr('Final receipt', 'Reçu final'),
                body: [
                  receiptGeneratedAt
                    ? `${tr('Generated', 'Généré')} ${formatDateTime(receiptGeneratedAt, isFrench)}`
                    : tr('Receipt generated for this completed rental.', 'Reçu généré pour cette location terminée.'),
                  mileageOverageSummary,
                ].filter(Boolean).join(' • '),
                meta: completedAt ? `${tr('Completed', 'Terminée')} ${formatDateTime(completedAt, isFrench)}` : '',
                href: receiptHref,
                actionLabel: tr('Open receipt', 'Ouvrir le reçu'),
              },
            ]
          : [],
      };
    }

    if (eventName === 'declined') {
      return {
        tone: 'rose',
        title: tr('Declined', 'Refusée'),
        subtitle: tr('This request is closed', 'Cette demande est clôturée'),
        detail: tr('The owner declined this request.', 'Le propriétaire a refusé cette demande.'),
      };
    }

    return null;
  }, [currentSenderRole, isMarketplaceOwnerThread, tr]);
  const getTimelineEventCard = useCallback((message, attachments = []) => {
    const metadata = message?.metadata && typeof message.metadata === 'object' ? message.metadata : {};
    const messageType = String(message?.message_type || '').trim().toLowerCase();
    const groupedVerificationSubmissions = Array.isArray(metadata.groupedVerificationSubmissions)
      ? metadata.groupedVerificationSubmissions.filter(Boolean)
      : [];
    const groupedVerificationApprovals = Array.isArray(metadata.groupedVerificationApprovals)
      ? metadata.groupedVerificationApprovals.filter(Boolean)
      : [];
    const rawDocumentActions = [
      ...(Array.isArray(metadata.documentLinks) ? metadata.documentLinks : []),
      ...(Array.isArray(metadata.document_links) ? metadata.document_links : []),
      ...(Array.isArray(metadata.documentActions) ? metadata.documentActions : []),
      ...(Array.isArray(metadata.document_actions) ? metadata.document_actions : []),
      ...(Array.isArray(metadata.actions) ? metadata.actions.filter((action) => action?.href || action?.url) : []),
    ];
    const seenDocumentActionKeys = new Set();
    const documentActions = rawDocumentActions
      .map((action, index) => {
        if (!action || typeof action !== 'object') return null;
        const href = String(action.href || action.url || '').trim();
        if (!href) return null;
        const label = String(action.label || action.title || '').trim() || tr('Open document', 'Ouvrir le document');
        const uniqueKey = `${href}::${label}`;
        if (seenDocumentActionKeys.has(uniqueKey)) return null;
        seenDocumentActionKeys.add(uniqueKey);
        return {
          key: String(action.key || action.kind || action.label || `document-${index}`).trim() || `document-${index}`,
          label,
          href,
          kind: String(action.kind || action.type || action.key || '').trim(),
        };
      })
      .filter(Boolean);
    const receiptDocumentActions = documentActions.filter((action) => {
      const kind = String(action.kind || action.key || action.label || '').trim().toLowerCase();
      return kind.includes('receipt') || kind.includes('reçu') || kind.includes('recu');
    });
    const nonReceiptDocumentActions = documentActions.filter((action) => !receiptDocumentActions.includes(action));
    const completionReceipt =
      metadata.completionReceipt && typeof metadata.completionReceipt === 'object'
        ? metadata.completionReceipt
        : metadata.completion_receipt && typeof metadata.completion_receipt === 'object'
          ? metadata.completion_receipt
          : null;
    const eventName = String(metadata.event || '').trim().toLowerCase();
    const eventType = String(metadata.type || '').trim().toLowerCase();
    const normalizedStatus = String(
      metadata.status ||
      metadata.verificationStatus ||
      ''
    ).trim().toLowerCase();
    const documentType = String(
      metadata.documentType ||
      metadata.verificationType ||
      ''
    ).trim().toLowerCase();
    const verificationRequestId = String(metadata.verificationRequestId || '').trim();
    const documentLabel = documentType
      ? getVerificationTypeLabel(documentType, isFrench ? 'fr' : 'en')
      : tr('Verification document', 'Document de vérification');
    const matchingVerificationRequest = verificationRequests.find((request) => {
      const requestId = String(request?.id || '').trim();
      const requestType = String(request?.verification_type || '').trim().toLowerCase();
      if (verificationRequestId && requestId && requestId === verificationRequestId) {
        return true;
      }
      return Boolean(documentType && requestType === documentType);
    });
    const previewSrc = String(
      normalizePreviewableImageUrl(matchingVerificationRequest?.file_url) ||
      normalizePreviewableImageUrl(metadata.imageUrl) ||
      normalizePreviewableImageUrl(metadata.fileUrl) ||
      attachments[0]?.publicUrl ||
      attachments[0]?.thumbnailUrl ||
      ''
    ).trim();
    const previewName = String(
      matchingVerificationRequest?.file_name ||
      metadata.fileName ||
      metadata.listingTitle ||
      metadata.vehicleName ||
      attachments[0]?.originalFilename ||
      documentLabel
    ).trim() || documentLabel;
    const verificationPreviewHref = String(
      (currentSenderRole === 'admin' ? metadata.adminHref : metadata.href) ||
      metadata.href ||
      metadata.adminHref ||
      ''
    ).trim();
    const previewHref = messageType === 'submission_event' && eventType === 'marketplace_request'
      ? marketplaceVehicleShortcutHref
      : verificationPreviewHref;
    const previewActionLabel = messageType === 'submission_event' && eventType === 'marketplace_request'
      ? isMarketplaceOwnerThread
        ? tr('Open vehicle workspace', 'Ouvrir l’espace véhicule')
        : tr('Open vehicle', 'Ouvrir le véhicule')
      : isVerificationThread
        ? tr('View document', 'Voir le document')
        : '';

    if (groupedVerificationSubmissions.length) {
      const groupedLabel = groupedVerificationSubmissions.length === 1
        ? groupedVerificationSubmissions[0]
        : groupedVerificationSubmissions.length === 2
          ? groupedVerificationSubmissions.join(' + ')
          : tr(
            `${groupedVerificationSubmissions[0]} + ${groupedVerificationSubmissions.length - 1} more`,
            `${groupedVerificationSubmissions[0]} + ${groupedVerificationSubmissions.length - 1} autres`
          );
      return {
        tone: 'neutral',
        eyebrow: '',
        title: tr('Documents submitted', 'Documents envoyés'),
        body: groupedLabel,
        previewSrc: '',
        previewName: '',
        actions: documentActions,
      };
    }

    if (groupedVerificationApprovals.length) {
      const groupedLabel = groupedVerificationApprovals.length === 1
        ? groupedVerificationApprovals[0]
        : groupedVerificationApprovals.length === 2
          ? groupedVerificationApprovals.join(' + ')
          : tr(
            `${groupedVerificationApprovals[0]} + ${groupedVerificationApprovals.length - 1} more`,
            `${groupedVerificationApprovals[0]} + ${groupedVerificationApprovals.length - 1} autres`
          );
      return {
        tone: 'approval',
        eyebrow: '',
        title: tr('Documents approved', 'Documents approuvés'),
        body: groupedLabel,
        previewSrc: '',
        previewName: '',
        actions: documentActions,
      };
    }

    if (messageType === 'submission_event' && eventType === 'marketplace_request') {
      const requestReference = String(metadata.requestReference || '').trim();
      return {
        tone: 'neutral',
        eyebrow: '',
        title: tr('Request submitted', 'Demande envoyée'),
        body: requestReference ? `${tr('Reference', 'Référence')} ${requestReference}` : '',
        previewSrc,
        previewName,
        previewHref,
        previewActionLabel,
        actions: documentActions,
      };
    }

    if (messageType === 'submission_event' || (messageType === 'verification_card' && normalizedStatus === 'pending')) {
      return {
        tone: 'neutral',
        eyebrow: '',
        title: tr('Documents submitted', 'Documents envoyés'),
        body: documentLabel,
        previewSrc,
        previewName,
        previewHref,
        previewActionLabel,
        actions: documentActions,
      };
    }

    if (messageType === 'approval_event' || (messageType === 'verification_card' && normalizedStatus === 'approved')) {
      return {
        tone: 'approval',
        eyebrow: '',
        title: `${documentLabel} ${tr('approved', 'approuvé')}`,
        body: '',
        previewSrc,
        previewName,
        previewHref,
        previewActionLabel,
        actions: documentActions,
      };
    }

    if (messageType === 'rejection_event' || (messageType === 'verification_card' && ['rejected', 'needs_info', 'needs_changes', 'suspended', 'expired'].includes(normalizedStatus))) {
      return {
        tone: 'rejection',
        eyebrow: '',
        title: `${documentLabel} ${tr('needs replacement', 'à remplacer')}`,
        body: String(message?.body || '').trim() || tr('This document needs an update before the workflow can continue.', 'Ce document doit être mis à jour avant que le workflow puisse continuer.'),
        previewSrc,
        previewName,
        previewHref,
        previewActionLabel,
        actions: documentActions,
      };
    }

    if (messageType === 'verification_note' && metadata.verificationRequestId) {
      return null;
    }

    if (messageType === 'status_event') {
      return {
        tone: 'status',
        eyebrow: '',
        title: String(message?.subject || metadata.title || tr('Workflow updated', 'Workflow mis à jour')).trim(),
        body: String(message?.body || metadata.detail || metadata.description || '').trim(),
        previewSrc,
        previewName,
        actions: documentActions,
      };
    }

    if (messageType === 'system_event') {
      if (eventName === 'completed') {
        const receiptHref = String(
          completionReceipt?.url ||
          metadata.finalReceiptUrl ||
          receiptDocumentActions[0]?.href ||
          ''
        ).trim();
        const receiptGeneratedAt = completionReceipt?.generatedAt || metadata.finalReceiptGeneratedAt || null;
        const completedAt = completionReceipt?.completedAt || metadata.completedAt || message?.created_at || null;
        const mileageOverage =
          completionReceipt?.mileageOverage ||
          metadata.mileageOverage ||
          metadata.mileage_overage ||
          null;
        const mileageOverageAmount = Number(mileageOverage?.amount || 0) || 0;
        const mileageOverageExtraKm = Number(mileageOverage?.extraKm || mileageOverage?.extra_km || 0) || 0;
        const mileageOverageSettlement = String(mileageOverage?.settlement || '').trim().toLowerCase();
        const mileageOverageSettlementLabel = mileageOverageSettlement === 'deduct_deposit'
          ? tr('deducted from deposit', 'déduit de la caution')
          : mileageOverageSettlement === 'paid_separately'
            ? tr('paid separately', 'payé séparément')
            : mileageOverageSettlement === 'waived'
              ? tr('waived', 'annulé')
              : mileageOverageSettlement === 'unpaid'
                ? tr('unpaid', 'impayé')
                : '';
        const mileageOverageSummary = mileageOverageAmount > 0 || mileageOverageExtraKm > 0
          ? `${tr('Extra mileage', 'Kilométrage extra')}: ${formatMoney(mileageOverageAmount, mileageOverage?.currency || mileageOverage?.currencyCode || 'MAD', isFrench ? 'fr' : 'en')}${mileageOverageExtraKm > 0 ? ` · ${mileageOverageExtraKm} km` : ''}${mileageOverageSettlementLabel ? ` · ${mileageOverageSettlementLabel}` : ''}`
          : '';

        return {
          tone: 'approval',
          eyebrow: '',
          title: tr('Rental completed', 'Location terminée'),
          body: receiptHref ? '' : String(message?.body || '').trim(),
          previewSrc: '',
          previewName: '',
          actions: nonReceiptDocumentActions,
          documentCards: receiptHref
            ? [
                {
                  key: 'final-receipt',
                  title: tr('Final receipt', 'Reçu final'),
                  body: [
                    receiptGeneratedAt
                      ? `${tr('Generated', 'Généré')} ${formatDateTime(receiptGeneratedAt, isFrench)}`
                      : tr('Receipt generated for this completed rental.', 'Reçu généré pour cette location terminée.'),
                    mileageOverageSummary,
                  ].filter(Boolean).join(' • '),
                  meta: completedAt ? `${tr('Completed', 'Terminée')} ${formatDateTime(completedAt, isFrench)}` : '',
                  href: receiptHref,
                  actionLabel: tr('Open receipt', 'Ouvrir le reçu'),
                  kind: 'receipt',
                },
              ]
            : [],
        };
      }

      if (eventName === 'verification_completed') {
        return {
          tone: 'approval',
          eyebrow: '',
          title: String(message?.body || '').trim() || tr('Verification completed', 'Vérification terminée'),
          body: '',
          previewSrc: '',
          previewName: '',
          actions: documentActions,
        };
      }

      if (String(message?.body || '').trim()) {
        return {
          tone: 'system',
          eyebrow: '',
          title: String(message?.subject || tr('Update', 'Mise à jour')).trim(),
          body: String(message?.body || '').trim(),
          previewSrc,
          previewName,
          actions: documentActions,
        };
      }

      if (String(message?.subject || '').trim()) {
        return {
          tone: 'system',
          eyebrow: '',
          title: String(message?.subject || '').trim(),
          body: '',
          previewSrc,
          previewName,
          actions: documentActions,
        };
      }
    }

    return null;
  }, [isFrench, isMarketplaceOwnerThread, marketplaceVehicleShortcutHref, tr, verificationRequests]);
  const getThreadEventCard = useCallback((event) => {
    const payload = event?.payload && typeof event.payload === 'object' ? event.payload : {};
    const eventType = String(event?.event_type || '').trim().toLowerCase();
    const rentalEventType = String(
      payload.rentalEventType || payload.timelineType || ''
    ).trim().toLowerCase();
    const actorRole = String(event?.actor_role || '').trim().toLowerCase();
    const title = String(event?.title || '').trim() || tr('Timeline update', 'Mise à jour');
    const description = String(event?.description || payload.description || '').trim();

    let tone = 'system';
    if (eventType === 'submission') tone = 'neutral';
    if (eventType === 'approval') tone = 'approval';
    if (eventType === 'rejection') tone = 'rejection';
    if (eventType === 'status_update') tone = 'status';
    if (['created', 'pickup_ready', 'return_due', 'deposit_recorded'].includes(rentalEventType || eventType)) tone = 'neutral';
    if (['confirmed', 'picked_up', 'extension_approved', 'settled', 'deposit_returned'].includes(rentalEventType || eventType)) tone = 'approval';
    if (['returned', 'extension_requested'].includes(rentalEventType || eventType)) tone = 'status';
    if (['issue_reported'].includes(rentalEventType || eventType)) tone = 'rejection';

    return {
      tone,
      eyebrow:
        isVerificationThread && isCustomerVerificationView
          ? ''
          : actorRole === 'admin'
          ? tr('Driveout', 'Driveout')
          : actorRole === 'owner'
            ? tr('Owner', 'Propriétaire')
            : actorRole === 'customer'
              ? tr('Customer', 'Client')
              : '',
      title,
      body: isVerificationThread && isCustomerVerificationView ? '' : description,
      previewSrc: '',
      previewName: '',
    };
  }, [isCustomerVerificationView, isVerificationThread, tr]);
  const timelineEntries = useMemo(() => {
    const entries = [];
    const seenKeys = new Set();

    displayTimelineEntries.forEach((entry) => {
      if (entry.kind === 'event') {
        const card = getThreadEventCard(entry.payload);
        if (!card) return;
        const payload = entry.payload && typeof entry.payload === 'object' ? entry.payload : {};
        const dedupeKey = [
          'event',
          String(payload.event_type || '').trim().toLowerCase(),
          String(payload.title || '').trim().toLowerCase(),
          String(payload.created_at || '').trim(),
        ].join('|');
        if (seenKeys.has(dedupeKey)) return;
        seenKeys.add(dedupeKey);
        entries.push({
          kind: 'event',
          id: entry.id,
          created_at: entry.created_at,
          payload: entry.payload,
          card,
        });
        return;
      }

      const message = entry.payload;
      const messageAttachments = getMessageAttachments(message);
      const card = getTimelineEventCard(message, messageAttachments);
      if (!card) return;
      const metadata = message?.metadata && typeof message.metadata === 'object' ? message.metadata : {};
      const dedupeKey = [
        'message',
        String(message?.message_type || '').trim().toLowerCase(),
        String(metadata.verificationRequestId || metadata.event || metadata.documentType || metadata.verificationType || '').trim().toLowerCase(),
        String(card.title || '').trim().toLowerCase(),
        String(card.previewName || '').trim().toLowerCase(),
      ].join('|');
      if (seenKeys.has(dedupeKey)) return;
      seenKeys.add(dedupeKey);
      entries.push({
        kind: 'message',
        id: entry.id,
        created_at: entry.created_at,
        payload: message,
        card,
      });
    });

    return entries.sort((a, b) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime());
  }, [displayTimelineEntries, getThreadEventCard, getTimelineEventCard, isVerificationThread]);
  const visibleTimelineEntries = useMemo(
    () => (showHeaderDetails ? timelineEntries : timelineEntries.slice(-3)),
    [showHeaderDetails, timelineEntries]
  );
  const chatMessagesForRender = useMemo(
    () => {
      const getCompletionReceiptContextKey = (message) => {
        const metadata = message?.metadata && typeof message.metadata === 'object' ? message.metadata : {};
        const messageType = String(message?.message_type || '').trim().toLowerCase();
        const eventName = String(metadata.event || metadata.eventType || '').trim().toLowerCase();
        if (messageType !== 'system_event' || eventName !== 'completed') return '';

        const rawDocumentActions = [
          ...(Array.isArray(metadata.documentLinks) ? metadata.documentLinks : []),
          ...(Array.isArray(metadata.document_links) ? metadata.document_links : []),
          ...(Array.isArray(metadata.documentActions) ? metadata.documentActions : []),
          ...(Array.isArray(metadata.document_actions) ? metadata.document_actions : []),
        ];
        const hasCompletionReceipt = Boolean(
          metadata?.completionReceipt?.url ||
          metadata?.completion_receipt?.url ||
          metadata.finalReceiptUrl ||
          rawDocumentActions.some((action) => {
            const actionKey = String(action?.kind || action?.key || action?.label || action?.title || '').trim().toLowerCase();
            return (actionKey.includes('receipt') || actionKey.includes('reçu') || actionKey.includes('recu')) && (action?.href || action?.url);
          })
        );
        if (!hasCompletionReceipt) return '';

        return [
          String(metadata.requestId || metadata.request_id || metadata.entityId || metadata.entity_id || '').trim(),
          String(message?.thread_key || message?.threadKey || '').trim(),
          String(message?.entity_id || message?.entityId || '').trim(),
        ].find(Boolean) || 'completed-receipt';
      };

      const latestCompletedReceiptByContext = new Map();
      displayConversationMessages.forEach((message) => {
        const contextKey = getCompletionReceiptContextKey(message);
        if (!contextKey) return;
        const current = latestCompletedReceiptByContext.get(contextKey);
        const currentTime = new Date(current?.created_at || 0).getTime();
        const nextTime = new Date(message?.created_at || 0).getTime();
        if (!current || nextTime >= currentTime) {
          latestCompletedReceiptByContext.set(contextKey, message);
        }
      });

      return displayConversationMessages.filter((message) => {
        const completionReceiptContextKey = getCompletionReceiptContextKey(message);
        if (completionReceiptContextKey && latestCompletedReceiptByContext.get(completionReceiptContextKey) !== message) {
          return false;
        }

        const metadata = message?.metadata && typeof message.metadata === 'object' ? message.metadata : {};
        const messageType = String(message?.message_type || '').trim().toLowerCase();
        const eventName = String(metadata.event || metadata.eventType || '').trim().toLowerCase();
        const rawDocumentActions = [
          ...(Array.isArray(metadata.documentLinks) ? metadata.documentLinks : []),
          ...(Array.isArray(metadata.document_links) ? metadata.document_links : []),
          ...(Array.isArray(metadata.documentActions) ? metadata.documentActions : []),
          ...(Array.isArray(metadata.document_actions) ? metadata.document_actions : []),
        ];
        const hasCompletionReceipt = Boolean(
          metadata?.completionReceipt?.url ||
          metadata?.completion_receipt?.url ||
          metadata.finalReceiptUrl ||
          rawDocumentActions.some((action) => {
            const actionKey = String(action?.kind || action?.key || action?.label || action?.title || '').trim().toLowerCase();
            return (actionKey.includes('receipt') || actionKey.includes('reçu') || actionKey.includes('recu')) && (action?.href || action?.url);
          })
        );

        if (messageType === 'system_event' && eventName === 'completed' && hasCompletionReceipt) {
          return true;
        }

        if (metadata.isInternal || messageType === 'internal_note') return false;
        if (metadata.autoWelcome || metadata.isSystemSeed) return false;
        const humanMessageTypes = new Set(['user_message', 'admin_message', 'message', 'note', 'verification_note']);
        const isHumanMessage = humanMessageTypes.has(messageType) || (messageType === '' && !metadata.event);
        if (!isHumanMessage) return false;

        return !getTimelineEventCard(message, getMessageAttachments(message));
      });
    },
    [displayConversationMessages, getTimelineEventCard]
  );
  const activeUsers = useMemo(
    () => presenceUsers.filter((entry) => Boolean(entry?.active)),
    [presenceUsers]
  );
  const workspaceActiveUsers = useMemo(
    () =>
      workspacePresenceUsers.filter((entry) => {
        if (!entry?.active) return false;
        const updatedAtMs = new Date(entry?.updatedAt || 0).getTime();
        if (!updatedAtMs) return false;
        return Date.now() - updatedAtMs < 180000;
      }),
    [workspacePresenceUsers]
  );
  const typingUsers = useMemo(
    () => presenceUsers.filter((entry) => Boolean(entry?.typing)),
    [presenceUsers]
  );
  const otherPartyRoleLabel = useMemo(() => {
    if (normalizedCounterpartyRole === 'owner') return tr('Owner', 'Propriétaire');
    if (normalizedCounterpartyRole === 'admin') return tr('Admin', 'Admin');
    if (normalizedCounterpartyRole === 'support') return tr('Support', 'Support');
    return tr('Customer', 'Client');
  }, [normalizedCounterpartyRole, tr]);
  const resolvedMessageAudienceLabel = useMemo(() => {
    const explicit = String(messageAudienceLabel || '').trim();
    if (explicit) return explicit;
    const counterpartyName = String(otherParty?.name || replyTarget?.label || '').trim();
    const normalizedRole = String(otherParty?.role || replyTarget?.role || '').trim().toLowerCase();
    if (normalizedRole === 'admin' || normalizedRole === 'employee' || normalizedRole === 'guide' || normalizedRole === 'support' || normalizedRole === 'owner' || normalizedRole === 'business_owner') {
      if (counterpartyName) {
        return tr(`Message to ${counterpartyName}`, `Message à ${counterpartyName}`);
      }
      return tr('Message to staff', 'Message au personnel');
    }
    return tr('Message to customer', 'Message au client');
  }, [messageAudienceLabel, otherParty?.name, otherParty?.role, replyTarget?.label, replyTarget?.role, tr]);
  const resolvedWaitingOnCounterpartyLabel = useMemo(() => {
    const explicit = String(waitingOnCounterpartyLabel || '').trim();
    if (explicit) return explicit;
    return getWaitingOnFilterLabel(currentSenderRole, tr);
  }, [waitingOnCounterpartyLabel, currentSenderRole, tr]);
  const typingLabel = useMemo(() => {
    if (!typingUsers.length) return '';
    const primaryName = String(typingUsers[0]?.name || '').trim() || tr('Someone', 'Quelqu’un');
    if (typingUsers.length === 1) {
      return tr(`${primaryName} is typing`, `${primaryName} écrit`);
    }
    return tr('Several people are typing', 'Plusieurs personnes écrivent');
  }, [typingUsers, tr]);

  const availabilityLabel = useMemo(() => {
    if (activeUsers.length > 0) {
      return tr(`${otherPartyRoleLabel} is in this chat`, `${otherPartyRoleLabel} est dans ce chat`);
    }
    if (workspaceActiveUsers.length > 0) {
      return tr(`${otherPartyRoleLabel} is available`, `${otherPartyRoleLabel} est disponible`);
    }
    return tr(`${otherPartyRoleLabel} will reply soon`, `${otherPartyRoleLabel} répondra bientôt`);
  }, [activeUsers.length, workspaceActiveUsers.length, otherPartyRoleLabel, tr]);
  const supportThreadHeadline = typingUsers.length > 0
    ? typingLabel
    : tr('Conversation', 'Conversation');
  const supportThreadSubhead = typingUsers.length > 0
    ? tr('Reply in progress', 'Réponse en cours')
    : workspaceActiveUsers.length > 0 || activeUsers.length > 0
      ? tr('Reply when available', 'Réponse dès disponibilité')
      : tr('Reply when available', 'Réponse dès disponibilité');
  const presenceToneClass = typingUsers.length > 0
    ? 'chat-presence-live'
    : activeUsers.length > 0
      ? 'chat-presence-online'
      : workspaceActiveUsers.length > 0
        ? 'chat-presence-online'
      : 'chat-presence-away';
  const showPresenceText = typingUsers.length > 0 || activeUsers.length === 0;
  const presenceHeadline = typingUsers.length > 0
    ? typingLabel
    : availabilityLabel;
  const presenceSupportLabel = typingUsers.length > 0
    ? tr('Live reply in progress', 'Réponse en direct en cours')
    : activeUsers.length > 0
      ? tr('Reading this conversation', 'Lit cette conversation')
      : workspaceActiveUsers.length > 0
        ? tr('Available to reply', 'Disponible pour répondre')
        : tr('Will reply when available', 'Répondra dès disponibilité');
  const shouldUseFloatingFooter = showThreadComposer || forceFloatingComposer || useFloatingTouchFooter || (compactMode && isMobileComposer);
  const floatingFooterNeedsExtraSpace = Boolean(
    shouldUseFloatingFooter &&
    (showContextualActionBar || allowInternalNotes || replyModeActive || draftAttachments.length)
  );
  const canSendPhotos = Boolean(
    threadCapabilities.supportsPhotos &&
    messagingPolicy.messagingPhotoSharingEnabled !== false
  );
  const maxDraftAttachments = Math.max(1, Number(messagingPolicy.messagingMaxPhotosPerMessage || 3));
  const headerBlockSpacingClass = showBookingContextCard ? 'mt-2' : 'mt-2.5';
  const threadVerticalSpacingClass = showBookingContextCard ? 'space-y-2.5' : 'space-y-3';
  const messageListPaddingClass = shouldUseFloatingFooter
    ? compactMode
      ? floatingFooterNeedsExtraSpace
        ? 'px-4 py-4 pb-72 sm:px-5 sm:pb-76'
        : 'px-4 py-4 pb-40 sm:px-5 sm:pb-44'
      : floatingFooterNeedsExtraSpace
        ? 'px-4 py-5 pb-72 sm:px-5 sm:pb-76 lg:px-6'
        : 'px-4 py-5 pb-40 sm:px-5 sm:pb-44 lg:px-6'
    : compactMode
      ? 'px-4 py-4 pb-4 sm:px-5'
      : 'px-4 py-5 pb-5 sm:px-5 lg:px-6';
  const jumpButtonPositionClass = shouldUseFloatingFooter
    ? allowInternalNotes
      ? 'bottom-56 right-4 sm:bottom-60 sm:right-5'
      : 'bottom-44 right-4 sm:bottom-48 sm:right-5'
    : 'bottom-24 right-4 sm:bottom-28 sm:right-5';
  const composerContainerClass = shouldUseFloatingFooter
    ? `fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom,0px))] z-[80] rounded-[26px] border border-slate-200 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(250,247,255,0.995))] shadow-[0_20px_50px_rgba(15,23,42,0.18)] backdrop-blur-xl ${compactMode ? 'px-3 py-2.5' : 'px-4 py-3 sm:mx-auto sm:max-w-3xl'}`
    : `sticky bottom-0 z-20 shrink-0 border-t border-slate-200 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(250,247,255,0.995))] shadow-[0_-10px_28px_rgba(15,23,42,0.06)] backdrop-blur-xl ${compactMode ? 'px-4 py-2.5 pb-[max(0.9rem,env(safe-area-inset-bottom,0px))]' : 'px-4 py-3 sm:px-5 lg:px-6'}`;

  const focusComposer = () => {
    const textarea = composerTextareaRef.current;
    if (textarea instanceof HTMLTextAreaElement) {
      textarea.focus({ preventScroll: true });
    }
  };

  const handleShareDetails = async () => {
    if (!bookingHref) return;
    const absoluteUrl = bookingHref.startsWith('http')
      ? bookingHref
      : `${window.location.origin}${bookingHref}`;

    try {
      await navigator.clipboard.writeText(absoluteUrl);
      setSendError('');
    } catch {
      if (typeof onOpenContext === 'function') {
        onOpenContext(selectedThread);
      } else if (threadContextHref) {
        navigate(threadContextHref, {
          state: {
            from: currentLocationPath,
          },
        });
      }
    }
  };

  const handleToggleArchiveThread = useCallback(async () => {
    if (!resolvedThreadKey || threadArchiveBusy) return;

    const nextArchivedState = !isThreadArchived;
    setThreadArchiveBusy(true);
    setSendError('');

    try {
      if (nextArchivedState) {
        await MessageService.archiveSharedThread(resolvedThreadKey);
      } else {
        await MessageService.restoreSharedThread(resolvedThreadKey);
      }
      setThreadArchivedOverride(nextArchivedState);
      setThreadHeaderMenuOpen(false);
    } catch (error) {
      setSendError(
        error?.message ||
        (nextArchivedState
          ? tr('Unable to archive this thread right now.', 'Impossible d’archiver ce fil pour le moment.')
          : tr('Unable to restore this thread right now.', 'Impossible de restaurer ce fil pour le moment.'))
      );
    } finally {
      setThreadArchiveBusy(false);
    }
  }, [isThreadArchived, resolvedThreadKey, threadArchiveBusy, tr]);

  const handleDeleteThread = useCallback(async () => {
    if (!resolvedThreadKey || threadDeleteBusy) return;

    if (typeof window !== 'undefined') {
      const confirmed = window.confirm(
        tr(
          'Delete this conversation completely? This removes all messages in the thread.',
          'Supprimer complètement cette conversation ? Cela supprimera tous les messages du fil.'
        )
      );
      if (!confirmed) return;
    }

    setThreadDeleteBusy(true);
    setSendError('');

    try {
      await MessageService.deleteSharedThread(resolvedThreadKey);
      setThreadHeaderMenuOpen(false);
      onDeleteThread?.(selectedThread);
      onClose?.();
    } catch (error) {
      setSendError(
        error?.message ||
        tr(
          'Unable to delete this conversation right now.',
          'Impossible de supprimer cette conversation pour le moment.'
        )
      );
    } finally {
      setThreadDeleteBusy(false);
    }
  }, [onClose, onDeleteThread, resolvedThreadKey, selectedThread, threadDeleteBusy, tr]);

  useEffect(() => {
    const nextThreadKey = String(selectedThread?.thread_key || '').trim();
    const previousThreadKey = previousThreadKeyRef.current;

    if (previousThreadKey && nextThreadKey && previousThreadKey !== nextThreadKey) {
      setPendingMessages([]);
      setReplyingToMessage(null);
      setReplyModeActive(false);
    }

    previousThreadKeyRef.current = nextThreadKey;
  }, [selectedThread?.thread_key]);

  useEffect(() => {
    setThreadArchivedOverride(null);
    setThreadArchiveBusy(false);
    setThreadDeleteBusy(false);
  }, [selectedThread?.thread_key, selectedThread?.status]);

  useEffect(() => {
    if (!pendingMessages.length || !selectedMessages.length) return;

    setPendingMessages((current) =>
      current.filter((pendingMessage) => !hasPendingMessageSettled(pendingMessage, selectedMessages))
    );
  }, [pendingMessages.length, selectedMessages]);

  useEffect(() => {
    return () => {
      draftAttachments.forEach((attachment) => {
        MessageAttachmentService.revokeObjectPreview(attachment.previewUrl);
      });
      pendingMessages.forEach((message) => {
        getMessageAttachments(message).forEach((attachment) => {
          const previewUrl = String(attachment?.publicUrl || attachment?.thumbnailUrl || '').trim();
          if (previewUrl.startsWith('blob:')) {
            MessageAttachmentService.revokeObjectPreview(previewUrl);
          }
        });
      });
    };
  }, [draftAttachments, pendingMessages]);

  useEffect(() => {
    let mounted = true;

    const loadMessagingPolicy = async () => {
      try {
        const policy = await MessageMediaRetentionService.getPolicy();
        if (mounted && policy) {
          setMessagingPolicy(policy);
        }
      } catch {
        if (mounted) {
          setMessagingPolicy((current) => current);
        }
      }
    };

    void loadMessagingPolicy();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!activeImagePreview) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setActiveImagePreview(null);
        return;
      }
      const gallery = Array.isArray(activeImagePreview.gallery) ? activeImagePreview.gallery : [];
      if (gallery.length <= 1) return;
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault();
        setActiveImagePreview((current) => {
          const currentGallery = Array.isArray(current?.gallery) ? current.gallery : [];
          if (currentGallery.length <= 1) return current;
          const direction = event.key === 'ArrowLeft' ? -1 : 1;
          const nextIndex = ((Number(current.index || 0) + direction) + currentGallery.length) % currentGallery.length;
          return {
            ...currentGallery[nextIndex],
            gallery: currentGallery,
            index: nextIndex,
          };
        });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeImagePreview]);

  useEffect(() => {
    setRecentIncomingMessageIds([]);
    setUnseenLatestCount(0);
    initialThreadScrollKeyRef.current = '';
    latestScrollTimersRef.current.forEach((timerId) => clearTimeout(timerId));
    latestScrollTimersRef.current = [];
    previousMessageIdsRef.current = new Set(
      visibleMessages
        .map((message) => String(message?.id || '').trim())
        .filter(Boolean)
    );
    incomingHighlightTimersRef.current.forEach((timerId) => clearTimeout(timerId));
    incomingHighlightTimersRef.current.clear();
  }, [resolvedThreadKey]);

  useEffect(() => {
    const previousIds = previousMessageIdsRef.current;
    const nextIds = new Set();
    const freshIncomingIds = [];

    visibleMessages.forEach((message) => {
      const messageId = String(message?.id || '').trim();
      if (!messageId) return;
      nextIds.add(messageId);
      const isOwn = String(message?.sender_user_id || '') === String(currentUserId || '');
      const isPendingMessage = messageId.startsWith('pending-');
      if (!previousIds.has(messageId) && !isOwn && !isPendingMessage) {
        freshIncomingIds.push(messageId);
      }
    });

    previousMessageIdsRef.current = nextIds;

    if (!freshIncomingIds.length) {
      return undefined;
    }

    setRecentIncomingMessageIds((current) => [...new Set([...current, ...freshIncomingIds])]);

    freshIncomingIds.forEach((messageId) => {
      const existingTimer = incomingHighlightTimersRef.current.get(messageId);
      if (existingTimer) {
        clearTimeout(existingTimer);
      }

      const timerId = setTimeout(() => {
        setRecentIncomingMessageIds((current) => current.filter((currentId) => currentId !== messageId));
        incomingHighlightTimersRef.current.delete(messageId);
      }, 2400);

      incomingHighlightTimersRef.current.set(messageId, timerId);
    });

    if (isNearBottomRef.current) {
      requestAnimationFrame(() => {
        const container = messageListRef.current;
        if (!container) return;
        container.scrollTo({
          top: container.scrollHeight,
          behavior: shouldUseFloatingFooter ? 'auto' : 'smooth',
        });
        setShowJumpToLatest(false);
        setUnseenLatestCount(0);
      });
    } else {
      setUnseenLatestCount((current) => Math.min(99, current + freshIncomingIds.length));
    }

    return undefined;
  }, [visibleMessages, currentUserId, shouldUseFloatingFooter]);

  useEffect(() => () => {
    incomingHighlightTimersRef.current.forEach((timerId) => clearTimeout(timerId));
    incomingHighlightTimersRef.current.clear();
    latestScrollTimersRef.current.forEach((timerId) => clearTimeout(timerId));
    latestScrollTimersRef.current = [];
  }, []);

  useEffect(() => {
    if (!resolvedThreadKey) return;
    const container = messageListRef.current;
    if (!container) return;

    requestAnimationFrame(() => {
      container.scrollTop = container.scrollHeight;
      setShowJumpToLatest(false);
      setUnseenLatestCount(0);
      isNearBottomRef.current = true;
      setReaderFocused(true);
    });
  }, [resolvedThreadKey]);

  useEffect(() => {
    const latestVisibleMessage = visibleMessages[visibleMessages.length - 1] || null;
    const latestMessageId = String(latestVisibleMessage?.id || '').trim();
    const latestCreatedAt = String(latestVisibleMessage?.created_at || '').trim();
    const latestSenderUserId = String(latestVisibleMessage?.sender_user_id || '').trim();
    const normalizedThreadKey = String(resolvedThreadKey || '').trim();
    const previous = previousLatestVisibleMessageRef.current;
    const latestChanged =
      previous.threadKey !== normalizedThreadKey ||
      previous.messageId !== latestMessageId ||
      previous.createdAt !== latestCreatedAt;

    previousLatestVisibleMessageRef.current = {
      threadKey: normalizedThreadKey,
      messageId: latestMessageId,
      createdAt: latestCreatedAt,
    };

    if (!latestChanged) return;
    if (!normalizedThreadKey || !latestMessageId) return;

    const isOwnLatestMessage =
      latestSenderUserId &&
      latestSenderUserId === String(currentUserId || '').trim();

    if (isOwnLatestMessage || isNearBottomRef.current) {
      scheduleScrollToLatest('auto');
    }
  }, [currentUserId, resolvedThreadKey, visibleMessages]);

  useEffect(() => {
    const normalizedThreadKey = String(resolvedThreadKey || '').trim();
    if (!normalizedThreadKey || !visibleMessages.length) return;
    if (initialThreadScrollKeyRef.current === normalizedThreadKey) return;

    initialThreadScrollKeyRef.current = normalizedThreadKey;
    scheduleScrollToLatest('auto', { force: true });
  }, [resolvedThreadKey, visibleMessages.length]);

  useEffect(() => {
    const container = messageListRef.current;
    if (!container) return undefined;

    const updateJumpState = () => {
      const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
      isNearBottomRef.current = distanceFromBottom <= 160;
      setShowJumpToLatest(distanceFromBottom > 160);
      setShowJumpToTop(container.scrollTop > 160);
      if (distanceFromBottom <= 160) {
        setUnseenLatestCount(0);
      }
      const nextFocused = container.scrollTop > 96;
      setReaderFocused(nextFocused);
    };

    updateJumpState();
    container.addEventListener('scroll', updateJumpState, { passive: true });

    return () => {
      container.removeEventListener('scroll', updateJumpState);
    };
  }, [resolvedThreadKey, visibleMessages.length]);

  useEffect(() => {
    if (!immersiveMode) {
      setReaderFocused(false);
    }
  }, [immersiveMode]);

  const scrollToLatest = (behavior = 'smooth') => {
    const container = messageListRef.current;
    if (!container) return;
    const normalizedBehavior =
      behavior === 'auto' || behavior === 'instant' || behavior === 'smooth'
        ? behavior
        : 'smooth';
    container.scrollTo({
      top: Math.max(0, container.scrollHeight - container.clientHeight),
      behavior: normalizedBehavior,
    });
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const latestContainer = messageListRef.current;
        if (!latestContainer) return;
        latestContainer.scrollTop = Math.max(0, latestContainer.scrollHeight - latestContainer.clientHeight);
      });
    });
    setShowJumpToLatest(false);
    setUnseenLatestCount(0);
    isNearBottomRef.current = true;
  };

  const scheduleScrollToLatest = (behavior = 'auto', { force = false } = {}) => {
    latestScrollTimersRef.current.forEach((timerId) => clearTimeout(timerId));
    latestScrollTimersRef.current = [];

    const runScroll = () => {
      if (!force && !isNearBottomRef.current) return;
      scrollToLatest(behavior);
    };

    requestAnimationFrame(() => {
      requestAnimationFrame(runScroll);
    });

    [80, 220, 520].forEach((delay) => {
      const timerId = window.setTimeout(runScroll, delay);
      latestScrollTimersRef.current.push(timerId);
    });
  };

  const scrollToTop = () => {
    const container = messageListRef.current;
    if (!container) return;
    container.scrollTo({
      top: 0,
      behavior: 'smooth',
    });
    setShowJumpToTop(false);
  };

  const scrollToMessage = (messageId) => {
    const normalizedMessageId = String(messageId || '').trim();
    if (!normalizedMessageId) return;
    const node = messageRefs.current.get(normalizedMessageId);
    if (node && typeof node.scrollIntoView === 'function') {
      node.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  useEffect(() => {
    if (!resolvedThreadKey || !currentUserId) return undefined;

    const typingSubscription = MessageService.subscribeThreadTyping({
      threadKey: resolvedThreadKey,
      userId: currentUserId,
      userLabel: currentUserLabel,
      userRole: currentSenderRole,
      onChange: setPresenceUsers,
    });
    typingSubscriptionRef.current = typingSubscription;

    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      void typingSubscription.setTyping(false);
      typingSubscription.unsubscribe();
      typingSubscriptionRef.current = null;
      setPresenceUsers([]);
    };
  }, [resolvedThreadKey, currentUserId, currentUserLabel, currentSenderRole]);

  useEffect(() => {
    const targetUserId = resolvedCounterpartyUserId;
    if (!targetUserId || !currentUserId) {
      setWorkspacePresenceUsers([]);
      return undefined;
    }

    const unsubscribe = MessageService.subscribeWorkspacePresence({
      currentUserId,
      targetUserId,
      onChange: setWorkspacePresenceUsers,
    });

    return () => {
      unsubscribe?.();
      setWorkspacePresenceUsers([]);
    };
  }, [currentUserId, resolvedCounterpartyUserId]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const mediaQuery = window.matchMedia('(pointer: coarse)');
    const updateComposerMode = () => {
      const touchPoints = typeof navigator !== 'undefined' ? Number(navigator.maxTouchPoints || 0) : 0;
      setIsMobileComposer(Boolean(mediaQuery.matches || touchPoints > 0));
    };

    updateComposerMode();
    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', updateComposerMode);
      return () => mediaQuery.removeEventListener('change', updateComposerMode);
    }

    mediaQuery.addListener(updateComposerMode);
    return () => mediaQuery.removeListener(updateComposerMode);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const updateFloatingFooterMode = () => {
      const touchPoints = typeof navigator !== 'undefined' ? Number(navigator.maxTouchPoints || 0) : 0;
      const prefersTouchLayout = touchPoints > 0;
      setUseFloatingTouchFooter(Boolean(prefersTouchLayout && window.innerWidth < 1280));
    };

    updateFloatingFooterMode();
    window.addEventListener('resize', updateFloatingFooterMode);
    return () => window.removeEventListener('resize', updateFloatingFooterMode);
  }, []);

  useEffect(() => {
    const hasText = Boolean(String(composerText || '').trim());
    const typingSubscription = typingSubscriptionRef.current;
    if (!typingSubscription) return undefined;

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    if (hasText && canReplyInThread) {
      void typingSubscription.setTyping(true);
      typingTimeoutRef.current = setTimeout(() => {
        void typingSubscription.setTyping(false);
      }, 1600);
    } else {
      void typingSubscription.setTyping(false);
    }

    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    };
  }, [composerText, canReplyInThread]);

  const handleSend = () => {
    if (!canReplyInThread || (!composerText.trim() && !draftAttachments.length) || !onSendReply) return;
    const messageBody = composerText.trim();
    const replyPreview = replyModeActive ? buildReplyPreview(replyingToMessage) : null;
    const currentReplyingToMessage = replyingToMessage;
    const currentReplyModeActive = replyModeActive;
    const messageType =
      composerMode === 'internal'
        ? 'internal_note'
        : currentSenderRole === 'admin'
          ? 'admin_message'
          : 'user_message';
    setSendError('');
    setSending(true);
    const currentDraftAttachments = [...draftAttachments];
    const pendingMessage = {
      id: `pending-${Date.now()}`,
      body: messageBody || (currentDraftAttachments.length ? tr('Photo attachment', 'Photo jointe') : ''),
      created_at: new Date().toISOString(),
      sender_user_id: currentUserId,
      sender_name: currentUserLabel,
      message_type: messageType,
      metadata: {
        ...(composerMode === 'internal' ? { isInternal: true } : {}),
        ...(currentDraftAttachments.length
          ? {
              attachments: currentDraftAttachments.map((attachment) => ({
                kind: 'photo',
                publicUrl: attachment.previewUrl,
                thumbnailUrl: attachment.previewUrl,
                originalFilename: attachment.name,
                fileSize: attachment.size,
                mimeType: attachment.type,
                status: 'pending',
              })),
            }
          : {}),
        ...(replyPreview
          ? {
              replyToMessageId: replyPreview.id || null,
              replyTo: replyPreview,
            }
          : {}),
      },
    };
    setPendingMessages((current) => [...current, pendingMessage]);
    setComposerText('');
    setReplyingToMessage(null);
    setReplyModeActive(false);
    setDraftAttachments([]);
    scheduleScrollToLatest('auto');
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    if (typingSubscriptionRef.current) {
      void typingSubscriptionRef.current.setTyping(false);
    }

    let uploadedAttachments = [];

    void Promise.resolve()
      .then(async () => {
        uploadedAttachments = currentDraftAttachments.length
          ? await MessageAttachmentService.uploadDraftAttachments({
              attachments: currentDraftAttachments,
              threadKey: resolvedThreadKey,
              contextId,
              userId: currentUserId,
            })
          : [];

        const sendResult = await Promise.race([
          onSendReply({
            thread: selectedThread,
            body: messageBody || (uploadedAttachments.length ? tr('Photo attachment', 'Photo jointe') : ''),
            recipientUserId: resolvedCounterpartyUserId,
            recipientRole: resolvedCounterpartyRole || null,
            senderRole: currentSenderRole,
            messageType,
            mode: composerMode,
            attachments: uploadedAttachments,
            metadata: {
              ...(replyPreview
                ? {
                    replyToMessageId: replyPreview.id || null,
                    replyTo: replyPreview,
                  }
                : {}),
            },
          }),
          new Promise((_, reject) => {
            window.setTimeout(() => {
              reject(new Error(tr('Message sending timed out. Please try again.', 'L’envoi du message a expiré. Réessayez.')));
            }, MESSAGE_SEND_TIMEOUT_MS);
          }),
        ]);

        const persistedMessage = sendResult?.message || null;
        if (persistedMessage?.id) {
          setPendingMessages((current) =>
            current.map((message) => (message.id === pendingMessage.id ? persistedMessage : message))
          );
          scheduleScrollToLatest('auto');
        }
      })
      .catch(async (error) => {
        if (uploadedAttachments.length) {
          await MessageAttachmentService.cleanupUploadedAttachments(uploadedAttachments);
        }
        markPendingMessageFailed(
          pendingMessage.id,
          error?.message || tr('Unable to send this message right now.', 'Impossible d’envoyer ce message pour le moment.')
        );
        setComposerText(messageBody);
        setReplyingToMessage(currentReplyModeActive ? currentReplyingToMessage : null);
        setReplyModeActive(currentReplyModeActive);
        setDraftAttachments(currentDraftAttachments);
        setSendError(error?.message || tr('Unable to send this message right now.', 'Impossible d’envoyer ce message pour le moment.'));
      })
      .finally(() => {
        setSending(false);
      });
  };

  const handleAttachmentSelection = (fileList) => {
    const incomingFiles = Array.from(fileList || []).filter((file) => String(file?.type || '').startsWith('image/'));
    if (!incomingFiles.length) return;

    setSendError('');
    setDraftAttachments((current) => {
      const availableSlots = Math.max(0, maxDraftAttachments - current.length);
      const nextFiles = incomingFiles.slice(0, availableSlots).map((file) => MessageAttachmentService.prepareDraftAttachment(file));
      if (incomingFiles.length > availableSlots) {
        setSendError(
          tr(
            `You can attach up to ${maxDraftAttachments} photo(s) per message.`,
            `Vous pouvez joindre jusqu’à ${maxDraftAttachments} photo(s) par message.`
          )
        );
      }
      return [...current, ...nextFiles];
    });
  };

  const removeDraftAttachment = (attachmentId) => {
    setDraftAttachments((current) => {
      const next = current.filter((attachment) => {
        if (attachment.id !== attachmentId) return true;
        MessageAttachmentService.revokeObjectPreview(attachment.previewUrl);
        return false;
      });
      return next;
    });
  };

  const formatAttachmentSize = (size) => {
    const safeSize = Number(size || 0);
    if (!safeSize) return '';
    if (safeSize >= 1024 * 1024) return `${(safeSize / (1024 * 1024)).toFixed(1)} MB`;
    if (safeSize >= 1024) return `${Math.round(safeSize / 1024)} KB`;
    return `${safeSize} B`;
  };

  const handleComposerKeyDown = (event) => {
    if (isMobileComposer) return;
    if (event.key !== 'Enter' || event.shiftKey) return;
    event.preventDefault();
    if (!sending && composerText.trim()) {
      handleSend();
    }
  };

  const verificationStatusToneClass = (status) => {
    if (status === 'approved') return 'bg-emerald-100 text-emerald-700';
    if (['rejected', 'needs_info', 'needs_changes', 'suspended', 'expired'].includes(status)) {
      return 'bg-amber-100 text-amber-700';
    }
    return 'bg-amber-100 text-amber-700';
  };

  const conversationStatusBadgeClass = () => {
    if (isDirectStaffThread) return 'bg-slate-100 text-slate-700';
    if (isVerificationThread) return verificationStatusToneClass(verificationStatus);
    return 'bg-violet-50 text-violet-700';
  };

  const verificationStatusDisplay = (status) => {
    if (status === 'approved') return tr('Approved', 'Approuvé');
    if (['rejected', 'needs_info', 'needs_changes', 'suspended', 'expired'].includes(status)) {
      return tr('Needs changes', 'Corrections requises');
    }
    return tr('In review', 'En révision');
  };

  const verificationSurfaceClasses = (status) => {
    if (status === 'approved') {
      return {
        shell: 'border-emerald-200/80 bg-emerald-50/70 hover:border-emerald-300 hover:bg-emerald-50/90',
        heading: 'text-emerald-600',
        count: 'bg-emerald-100 text-emerald-700',
        icon: 'border-emerald-200 bg-white text-emerald-700',
        card: 'border-emerald-200 bg-white',
        preview: 'border-emerald-100 bg-slate-50',
        action: 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:border-emerald-300 hover:bg-emerald-100',
        helper: 'text-emerald-600',
        divider: 'border-emerald-100',
      };
    }
    return {
      shell: 'border-amber-200/80 bg-amber-50/80 hover:border-amber-300 hover:bg-amber-50',
      heading: 'text-amber-600',
      count: 'bg-amber-100 text-amber-700',
      icon: 'border-amber-200 bg-white text-amber-700',
      card: 'border-amber-200 bg-white',
      preview: 'border-amber-100 bg-slate-50',
      action: 'border-amber-200 bg-amber-50 text-amber-700 hover:border-amber-300 hover:bg-amber-100',
      helper: 'text-amber-700',
      divider: 'border-amber-100',
    };
  };

  const handleVerificationAction = async (action, verificationRequestId) => {
    if (typeof onPerformVerificationAction !== 'function' || !selectedThread) return;
    setMarketplaceActionBusy(action);
    setMarketplaceActionError('');
    try {
      await onPerformVerificationAction(selectedThread, action, { verificationRequestId });
    } catch (error) {
      setMarketplaceActionError(
        error?.message ||
        tr('Unable to update this verification right now.', 'Impossible de mettre à jour cette vérification pour le moment.')
      );
    } finally {
      setMarketplaceActionBusy('');
    }
  };

  const handleOpenAlbumPicker = () => {
    if (!canSendPhotos) {
      setSendError(
        tr('Photo sharing is currently disabled.', 'Le partage de photos est actuellement désactivé.')
      );
      return;
    }
    albumInputRef.current?.click();
  };

  const handleOpenCameraCapture = () => {
    if (!canSendPhotos) {
      setSendError(
        tr('Photo sharing is currently disabled.', 'Le partage de photos est actuellement désactivé.')
      );
      return;
    }
    setShowCameraCapture(true);
  };

  if (!selectedThread) {
    return (
      <div className={`flex h-full min-h-[420px] flex-col items-center justify-center px-6 text-center ${compactMode ? 'py-8' : ''}`}>
        <div className="flex h-16 w-16 items-center justify-center rounded-[24px] bg-violet-50 text-violet-700">
          <MessageSquareText className="h-7 w-7" />
        </div>
        <p className="mt-5 text-xl font-black text-slate-950">
          {emptyTitle || tr('No conversation yet', 'Aucune conversation pour le moment')}
        </p>
        <p className="mt-2 max-w-md text-sm text-slate-500">
          {emptyDescription || tr('Open a thread in context to continue the conversation here.', 'Ouvrez un fil dans le contexte pour poursuivre la conversation ici.')}
        </p>
      </div>
    );
  }

  const firstRecentIncomingMessageId = recentIncomingMessageIds[0] || '';
  const cameraSessionToken = `message-camera-${resolvedThreadKey || contextId || 'draft'}`;
  const imagePreviewModal = activeImagePreview ? (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm">
      <button
        type="button"
        className="absolute inset-0"
        onClick={() => setActiveImagePreview(null)}
        aria-label={tr('Close image preview', 'Fermer l’aperçu image')}
      />
      <div className="relative z-10 flex max-h-full w-full max-w-3xl flex-col overflow-hidden rounded-[26px] border border-white/15 bg-slate-950 shadow-[0_28px_70px_rgba(15,23,42,0.4)]">
        <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3 text-white">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">
              {activeImagePreview.name || tr('Chat photo', 'Photo du chat')}
            </p>
            <p className="mt-0.5 text-xs text-white/65">
              {[
                activeImagePreview.caption || '',
                Array.isArray(activeImagePreview.gallery) && activeImagePreview.gallery.length > 1
                  ? `${Number(activeImagePreview.index || 0) + 1}/${activeImagePreview.gallery.length}`
                  : '',
              ].filter(Boolean).join(' • ')}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setActiveImagePreview(null)}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-white/5 text-white transition hover:bg-white/10"
            aria-label={tr('Close image preview', 'Fermer l’aperçu image')}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex min-h-0 flex-1 items-center justify-center bg-slate-950 p-3">
          {Array.isArray(activeImagePreview.gallery) && activeImagePreview.gallery.length > 1 ? (
            <button
              type="button"
              onClick={() => {
                setActiveImagePreview((current) => {
                  const gallery = Array.isArray(current?.gallery) ? current.gallery : [];
                  if (gallery.length <= 1) return current;
                  const nextIndex = ((Number(current.index || 0) - 1) + gallery.length) % gallery.length;
                  return { ...gallery[nextIndex], gallery, index: nextIndex };
                });
              }}
              className="absolute left-3 top-1/2 z-20 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/15 bg-white/10 text-white shadow-lg backdrop-blur transition hover:bg-white/20"
              aria-label={tr('Previous photo', 'Photo précédente')}
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
          ) : null}
          <img
            src={activeImagePreview.src}
            alt={activeImagePreview.name || tr('Chat photo', 'Photo du chat')}
            className="max-h-[75vh] w-auto max-w-full rounded-[20px] object-contain"
          />
          {Array.isArray(activeImagePreview.gallery) && activeImagePreview.gallery.length > 1 ? (
            <button
              type="button"
              onClick={() => {
                setActiveImagePreview((current) => {
                  const gallery = Array.isArray(current?.gallery) ? current.gallery : [];
                  if (gallery.length <= 1) return current;
                  const nextIndex = (Number(current.index || 0) + 1) % gallery.length;
                  return { ...gallery[nextIndex], gallery, index: nextIndex };
                });
              }}
              className="absolute right-3 top-1/2 z-20 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/15 bg-white/10 text-white shadow-lg backdrop-blur transition hover:bg-white/20"
              aria-label={tr('Next photo', 'Photo suivante')}
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          ) : null}
        </div>
      </div>
    </div>
  ) : null;

  if (threadSurface === 'workflow') {
    return (
      <>
        <WorkflowThreadView
          compactMode={compactMode}
          currentSenderRole={currentSenderRole}
          isFrench={isFrench}
          tr={tr}
          workflowKind={workflowKind}
          selectedThread={selectedThread}
          headerPrimaryName={headerPrimaryName}
          headerSecondaryLabel={resolvedHeaderSecondaryLabel}
          workflowAudienceLabel={counterpartyIdentityLabel}
          headerStatusSummary={headerStatusSummary}
          headerNextActionSummary={headerNextActionSummary}
          openWorkflowContext={openWorkflowContext}
          workflowContextLabel={workflowContextLabel}
          canManageThread={currentSenderRole === 'admin'}
          canDeleteThread={currentSenderRole === 'admin'}
          isThreadArchived={isThreadArchived}
          threadArchiveBusy={threadArchiveBusy}
          threadDeleteBusy={threadDeleteBusy}
          onToggleArchiveThread={() => void handleToggleArchiveThread()}
          onDeleteThread={() => void handleDeleteThread()}
          verificationStatus={verificationStatus}
          verificationNeedsChanges={verificationNeedsChanges}
          workflowDocuments={customerVerificationSummaryPosts}
          primaryVerificationIssue={primaryVerificationIssue}
          primaryVerificationIssueLabel={primaryVerificationIssueLabel}
          primaryVerificationIssueReason={primaryVerificationIssueReason}
          openVerificationDocument={openVerificationDocument}
          openVerificationPostPreview={openVerificationPostPreview}
          nextVerificationPost={nextVerificationPost}
          onApproveVerification={(verificationRequestId) => void handleVerificationAction('approve_verification', verificationRequestId)}
          onRejectVerification={(verificationRequestId) => void handleVerificationAction('reject_verification', verificationRequestId)}
          verificationActionBusy={marketplaceActionBusy}
          workflowActionError={marketplaceActionError}
          marketplaceModerationProgress={marketplaceModerationProgress}
          workflowHistoryItems={workflowHistoryItems}
          onExitReadingMode={onExitReadingMode}
          floatingBackLabel={floatingBackLabel}
        />
        {imagePreviewModal}
      </>
    );
  }

  return (
    <div
      data-thread-id={threadId || ''}
      data-context-type={contextType || ''}
      data-context-id={contextId || ''}
      className="relative flex h-full min-h-0 flex-col overflow-visible rounded-[30px] bg-white sm:rounded-[32px]"
    >
      {!immersiveMode || !readerFocused || compactMode ? (
        <div className={`rounded-t-[30px] border-b border-slate-200 bg-white/98 backdrop-blur sm:rounded-t-[32px] ${compactMode ? 'sticky top-0 z-20 px-4 py-2.5' : 'px-4 py-2.5'}`}>
        <div className={`relative flex flex-wrap items-start ${hasExpandableHeaderDetails ? 'gap-3 pr-14' : 'gap-3'}`}>
          <div className="min-w-0 flex-1">
            {compactMode ? (
              <div className="mb-3 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    onExitReadingMode?.();
                    scrollToTop();
                  }}
                  className="inline-flex items-center gap-2 rounded-full border border-violet-200 bg-violet-50 px-3.5 py-2 text-sm font-bold text-violet-700 transition hover:border-violet-300 hover:bg-violet-100"
                >
                  <ArrowLeft className="h-4 w-4" />
                  {floatingBackLabel || tr('Threads', 'Fils')}
                </button>
              </div>
            ) : null}
            {!(isDirectStaffThread && hideDirectStaffIdentity) ? (
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-slate-100 text-sm font-black text-slate-700 ring-1 ring-slate-200">
                  {otherPartyAvatarUrl ? (
                    <img
                      src={otherPartyAvatarUrl}
                      alt={counterpartyIdentityLabel || headerPrimaryName}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    buildAvatarInitials(counterpartyIdentityLabel || headerPrimaryName)
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className={`font-black text-slate-950 ${compactMode ? 'text-base' : 'text-lg'}`}>
                    {headerPrimaryName}
                  </h3>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {headerSecondaryLabel}
                  </p>
                  {showBookingContextCard && counterpartyIdentityLabel && isOwnerMarketplaceDecisionView ? (
                    <p className="mt-1 text-xs font-semibold text-slate-600">
                      {[marketplaceRequestReference ? `${tr('Reference', 'Référence')} ${marketplaceRequestReference}` : '', counterpartyIdentityLabel].filter(Boolean).join(' • ')}
                    </p>
                  ) : null}
                  {shouldUseMinimalBookingContextHeader ? (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      {marketplaceRequestReference ? (
                        <span className="inline-flex rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-bold text-slate-700">
                          {tr('Reference', 'Référence')} {marketplaceRequestReference}
                        </span>
                      ) : null}
                      {hasExpandableHeaderDetails ? (
                        <button
                          type="button"
                          onClick={() => setShowHeaderDetails((current) => !current)}
                          className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-bold text-slate-700 transition hover:border-violet-200 hover:text-violet-700"
                          aria-expanded={showHeaderDetails}
                        >
                          <span>{showHeaderDetails ? tr('Hide details', 'Masquer détails') : tr('Details', 'Détails')}</span>
                          {showHeaderDetails ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}
            {!(showBookingContextCard && bookingUiState === 'approved' && !isOwnerMarketplaceDecisionView) && shouldShowCompactStatusBlock ? (
              <div className={`mt-2 rounded-[16px] border px-3 py-2 ${compactHeaderToneClass}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full ${compactHeaderStatusIconClass}`}>
                        <MessageSquareText className="h-3.5 w-3.5" />
                      </span>
                      <p className="text-sm font-black text-slate-950">
                        {headerStatusSummary}
                      </p>
                    </div>
                    {compactHeaderNextActionSummary && !showBookingContextCard ? (
                      <p className="mt-1 text-[11px] font-medium text-slate-500">
                        {compactHeaderNextActionSummary}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                    {showBookingContextCard && marketplaceRequestReference && !isOwnerMarketplaceDecisionView ? (
                      <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-bold text-slate-700 ring-1 ring-slate-200">
                        {tr('Reference', 'Référence')} {marketplaceRequestReference}
                      </span>
                    ) : null}
                    {hasExpandableHeaderDetails ? (
                      <button
                        type="button"
                        onClick={() => setShowHeaderDetails((current) => !current)}
                        className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-bold text-slate-700 transition hover:border-violet-200 hover:text-violet-700"
                      >
                        <span>
                          {showHeaderDetails
                            ? (
                                marketplaceModerationProgress
                                  ? tr('Hide history', "Masquer l'historique")
                                  : tr('Hide', 'Masquer')
                              )
                            : (
                                marketplaceModerationProgress
                                  ? tr('History', 'Historique')
                                  : tr('Details', 'Détails')
                              )}
                        </span>
                        {showHeaderDetails ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            ) : null}
            {showHeaderDetails ? (
              <>
            {marketplaceModerationProgress ? (
              <div className={`${headerBlockSpacingClass} space-y-3`}>
                <div className="rounded-[22px] border border-slate-200 bg-white px-4 py-4 shadow-[0_12px_24px_rgba(15,23,42,0.06)]">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">
                        {tr('Status history', 'Historique du statut')}
                      </p>
                    </div>
                  </div>
                  <div className="mt-4 space-y-3">
                    {marketplaceModerationProgress.statusHistoryItems.map((item, index) => (
                      <div key={item.key} className="flex items-start gap-3">
                        <div className="flex w-7 shrink-0 flex-col items-center">
                          <span className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-black ${
                            item.state === 'complete'
                              ? 'bg-emerald-100 text-emerald-700'
                              : item.state === 'current'
                                ? `${marketplaceModerationProgress.stateTone.chip}`
                                : 'bg-slate-100 text-slate-500'
                          }`}>
                            {item.state === 'complete' ? '✓' : String(index + 1)}
                          </span>
                          {index < marketplaceModerationProgress.statusHistoryItems.length - 1 ? (
                            <span className="mt-1 h-6 w-px bg-slate-200" />
                          ) : null}
                        </div>
                        <div className="min-w-0 flex-1 rounded-[18px] border border-slate-200 bg-slate-50/70 px-3 py-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-black text-slate-950">
                              {item.title}
                            </p>
                            <span className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.14em] ${
                              item.state === 'complete'
                                ? 'bg-emerald-100 text-emerald-700'
                                : `${marketplaceModerationProgress.stateTone.chip}`
                            }`}>
                              {item.state === 'complete' ? tr('Completed', 'Terminé') : tr('Current', 'Actuel')}
                            </span>
                          </div>
                          <p className="mt-1 text-sm text-slate-600">
                            {item.body}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : null}
            {isRentalThread && rentalContextData ? (
              <div className={`${headerBlockSpacingClass} space-y-3`}>
                <div className="rounded-[22px] border border-emerald-200/70 bg-[linear-gradient(180deg,rgba(236,253,245,0.85),rgba(255,255,255,0.98))] px-4 py-4 shadow-[0_12px_24px_rgba(16,185,129,0.08)]">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${rentalPresentation?.badgeClassName || 'bg-emerald-50 text-emerald-700'}`}>
                          {rentalPresentation?.label || tr('Rental', 'Location')}
                        </span>
                        {rentalReference ? (
                          <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-bold text-slate-700 ring-1 ring-slate-200">
                            {tr('Rental', 'Location')} #{rentalReference}
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-3 text-base font-black tracking-[-0.01em] text-slate-950">
                        {rentalVehicleName}
                      </p>
                      {rentalDateRange ? (
                        <p className="mt-1 text-sm font-medium text-slate-500">
                          {rentalDateRange}
                        </p>
                      ) : null}
                      {rentalPresentation?.nextAction ? (
                        <p className="mt-2 text-sm font-semibold text-slate-700">
                          {rentalPresentation.nextAction}
                        </p>
                      ) : null}
                    </div>
                  </div>
                </div>
                {rentalSummaryCards.length ? (
                  <div className="grid gap-2 sm:grid-cols-2">
                    {rentalSummaryCards.map((card) => (
                      <div
                        key={card.key}
                        className="rounded-[18px] border border-slate-200 bg-white px-3 py-3 shadow-[0_8px_16px_rgba(15,23,42,0.04)]"
                      >
                        <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">
                          {card.label}
                        </p>
                        <p className="mt-1 text-sm font-bold text-slate-950">
                          {card.value}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
            {showBookingContextCard && !isOwnerMarketplaceDecisionView && !hideMarketplacePendingSummaryCard ? (
              <div
                ref={bookingActionRef}
                className={`sticky top-0 z-10 ${headerBlockSpacingClass} rounded-[20px] backdrop-blur transition-all duration-300 ${
                  bookingUiState === 'expired'
                    ? 'border border-slate-300 bg-white/95 px-3 py-2.5'
                    : bookingUiState === 'approved' && bookingHoldState.urgency === 'critical'
                      ? 'border border-amber-300 bg-amber-50/95 px-3 py-3 shadow-[0_0_0_1px_rgba(251,146,60,0.08)]'
                      : bookingUiState === 'approved' && bookingHoldState.urgency === 'low'
                        ? 'border border-orange-200 bg-orange-50/95 px-3 py-3'
                        : bookingUiState === 'approved'
                          ? 'border border-violet-200/70 bg-violet-50/95 px-3 py-3'
                          : 'border border-violet-200/70 bg-violet-50/95 px-3 py-2.5'
                }`}
              >
                {bookingUiState === 'approved' ? (
                  <div className="flex flex-col gap-2">
                    <button
                      type="button"
                      onClick={() => setApprovedSummaryExpanded((current) => !current)}
                      className="flex w-full items-center justify-between gap-2 rounded-[16px] border border-violet-200 bg-white px-2.5 py-1.5 text-left shadow-[0_6px_18px_rgba(139,92,246,0.06)] transition hover:border-violet-300 hover:shadow-[0_8px_20px_rgba(139,92,246,0.10)] sm:px-3"
                      aria-expanded={approvedSummaryExpanded}
                    >
                      <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden">
                        <span className="inline-flex min-w-0 shrink-0 items-center justify-center rounded-full border border-violet-200 bg-violet-50 px-2.5 py-0.5 text-[10px] font-bold text-violet-700 sm:px-3">
                        {tr('Booking approved', 'Réservation approuvée')}
                        </span>
                        {bookingChatGraceState.active ? (
                          <span
                            className={`inline-flex min-w-0 flex-1 items-center justify-center truncate rounded-full border px-2.5 py-0.5 text-[10px] font-bold sm:px-3 ${
                              bookingChatGraceState.urgency === 'critical' || bookingChatGraceState.urgency === 'low'
                                ? 'border-rose-200 bg-rose-50 text-rose-700'
                                : 'border-violet-200 bg-violet-50 text-violet-700'
                            }`}
                          >
                            {tr('Pickup window', 'Fenêtre de remise')} {graceCountdownLabel}
                          </span>
                        ) : null}
                      </div>
                      <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-violet-200 bg-violet-50 text-violet-700 shadow-[0_2px_6px_rgba(139,92,246,0.10)]">
                        {approvedSummaryExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                      </span>
                    </button>
                    {approvedSummaryExpanded ? (
                      <>
                        <div>
                          <p className="text-sm font-black text-slate-950">
                            {isMarketplaceOwnerThread
                              ? tr('Booking approved and chat is open', 'Réservation approuvée et chat ouvert')
                              : tr('Pay now to confirm', 'Payer maintenant pour confirmer')}
                          </p>
                          {(bookingVehicleName || bookingHeaderDateRange) ? (
                            <p className="mt-1 text-xs font-medium text-slate-500">
                              {[bookingVehicleName, bookingHeaderDateRange].filter(Boolean).join(' • ')}
                            </p>
                          ) : null}
                          {marketplacePrimaryDetailsHref ? (
                            <div className="mt-3 flex flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={() => {
                                  navigate(marketplacePrimaryDetailsHref, {
                                    state: { from: currentThreadReturnPath },
                                  });
                                }}
                                className="inline-flex min-h-[40px] items-center justify-center rounded-full border border-violet-200 bg-white px-4 text-xs font-black text-violet-700 transition hover:border-violet-300 hover:bg-violet-50"
                              >
                                {marketplacePrimaryDetailsLabel}
                              </button>
                            </div>
                          ) : null}
                        </div>
                        {shouldShowApprovedPricingCards ? (
                          <div className="grid gap-2 sm:grid-cols-3">
                            <div className="rounded-[16px] bg-white/85 px-3 py-2 ring-1 ring-violet-100">
                              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">
                                {isMarketplaceOwnerThread ? tr('Rental', 'Location') : tr('Pay now', 'À payer maintenant')}
                              </p>
                              <p className="mt-1 text-sm font-bold text-slate-950">
                                {formatMoney(
                                  isMarketplaceOwnerThread ? rentalPriceAmount : amountToConfirm,
                                  bookingMoneySummary.currencyCode,
                                  locale
                                )}
                              </p>
                              {!isMarketplaceOwnerThread ? (
                                <p className="mt-1 text-[11px] font-medium text-slate-500">
                                  {tr('(platform fee)', '(frais plateforme)')}
                                </p>
                              ) : null}
                            </div>
                            <div className="rounded-[16px] bg-white/85 px-3 py-2 ring-1 ring-violet-100">
                              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">
                                {isMarketplaceOwnerThread ? tr('Platform fee', 'Frais plateforme') : tr('Rental', 'Location')}
                              </p>
                              <p className="mt-1 text-sm font-bold text-slate-950">
                                {formatMoney(
                                  isMarketplaceOwnerThread ? platformFeeAmount : rentalPriceAmount,
                                  bookingMoneySummary.currencyCode,
                                  locale
                                )}
                              </p>
                            </div>
                            <div className="rounded-[16px] bg-white/85 px-3 py-2 ring-1 ring-violet-100">
                              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">
                                {tr('Deposit held', 'Caution retenue')}
                              </p>
                              <p className="mt-1 text-sm font-bold text-slate-950">
                                {formatMoney(
                                  depositHoldAmount,
                                  bookingMoneySummary.currencyCode,
                                  locale
                                )}
                              </p>
                              {!isMarketplaceOwnerThread ? (
                                <p className="mt-1 text-[11px] font-medium text-slate-500">
                                  {tr('(not charged)', '(non débitée)')}
                                </p>
                              ) : null}
                            </div>
                          </div>
                        ) : null}
                        {marketplaceRequestReference ? (
                          <div className="flex justify-end">
                            <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-bold text-slate-700 ring-1 ring-violet-200">
                              {tr('Reference', 'Référence')} {marketplaceRequestReference}
                            </span>
                          </div>
                        ) : null}
                      </>
                    ) : null}
                    {insufficientWalletAmount ? (
                      <p className="text-xs font-semibold text-rose-600">
                        {tr('You need', 'Il vous faut')} {formatMoney(insufficientWalletAmount, bookingMoneySummary.currencyCode, locale)} {tr('to confirm', 'pour confirmer')}
                      </p>
                    ) : isMarketplaceOwnerThread ? (
                      <p className="text-xs font-medium text-slate-500">
                        {ownerApprovedHelperText}
                      </p>
                    ) : (
                      <p className="text-xs font-medium text-slate-500">
                        {tr('You pay ', 'Vous payez ')}
                        {formatMoney(amountToConfirm, bookingMoneySummary.currencyCode, locale)}
                        {tr(' now. Remaining is handled at pickup.', ' maintenant. Le reste est géré au départ.')}
                      </p>
                    )}
                    {bookingHoldState.urgency === 'critical' || bookingHoldState.urgency === 'low' ? (
                      <p className="text-xs font-semibold text-rose-600">
                        {tr('Only a few minutes left', 'Plus que quelques minutes')}
                      </p>
                    ) : bookingIntegrityMessage ? (
                      <p className="text-xs font-semibold text-rose-600">
                        {bookingIntegrityMessage}
                      </p>
                    ) : null}
                  </div>
                ) : bookingUiState === 'waiting' ? (
                  <div className="flex flex-col gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-bold text-violet-700 ring-1 ring-violet-200">
                        {tr('Request sent', 'Demande envoyée')}
                      </span>
                      <span className="rounded-full bg-violet-100 px-2.5 py-1 text-[11px] font-bold text-violet-700">
                        {tr('Waiting for approval', 'En attente d’approbation')}
                      </span>
                    </div>
                    <p className="text-sm font-semibold text-slate-900">
                      {tr('Owner reviews your request', 'Le propriétaire examine votre demande')}
                    </p>
                    <p className="text-xs font-medium text-slate-500">
                      {pendingBookingHelperText}
                    </p>
                  </div>
                ) : bookingUiState === 'completed' ? (
                  <div className="flex flex-col gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-700">
                        {tr('Rental completed', 'Location terminée')}
                      </span>
                    </div>
                    <p className="text-sm font-semibold text-slate-900">
                      {tr('This booking is now closed', 'Cette réservation est maintenant clôturée')}
                    </p>
                    <p className="text-xs font-medium text-slate-500">
                      {tr('The rental finished successfully in the shared timeline.', 'La location est terminée dans la chronologie partagée.')}
                    </p>
                  </div>
                ) : bookingUiState === 'declined' ? (
                  <div className="flex flex-col gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-rose-100 px-2.5 py-1 text-[11px] font-bold text-rose-700">
                        {tr('Declined', 'Refusée')}
                      </span>
                    </div>
                    <p className="text-sm font-semibold text-slate-900">
                      {tr('The owner declined this request', 'Le propriétaire a refusé cette demande')}
                    </p>
                    <p className="text-xs font-medium text-slate-500">
                      {tr('This booking thread is now closed.', 'Ce fil de réservation est maintenant clôturé.')}
                    </p>
                  </div>
                ) : bookingUiState === 'expired' ? (
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-700">
                          {tr('Booking expired', 'Réservation expirée')}
                        </span>
                      </div>
                      <p className="mt-2 text-sm font-semibold text-slate-900">
                        {isMarketplaceRenterThread
                          ? tr('This request is no longer available', "Cette demande n’est plus disponible")
                          : tr('This booking request expired', 'Cette demande de réservation a expiré')}
                      </p>
                      <p className="mt-1 text-xs font-medium text-slate-500">
                        {isMarketplaceRenterThread
                          ? tr('Start a new request for this vehicle.', 'Démarrez une nouvelle demande pour ce véhicule.')
                          : tr('The renter would need to send a new request to continue.', 'Le locataire devra envoyer une nouvelle demande pour continuer.')}
                      </p>
                    </div>
                    {isMarketplaceRenterThread ? (
                      <div className="flex flex-col items-start gap-1 sm:items-end">
                        <button
                          type="button"
                          onClick={handleRequestAgain}
                          className="inline-flex items-center justify-center rounded-full bg-violet-600 px-3.5 py-2 text-xs font-bold text-white shadow-[0_12px_24px_rgba(124,58,237,0.18)] transition hover:bg-violet-700"
                        >
                          {tr('Request again', 'Redemander')}
                        </button>
                        {requestAgainError ? (
                          <p className="max-w-[15rem] text-left text-[11px] font-medium text-rose-600 sm:text-right">
                            {requestAgainError}
                          </p>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <div className="flex min-h-[2.25rem] flex-wrap items-center gap-2">
                    <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${
                      bookingUiState === 'confirmed'
                        ? 'bg-emerald-100 text-emerald-700'
                        : bookingUiState === 'active'
                          ? 'bg-emerald-100 text-emerald-700'
                        : bookingUiState === 'approved'
                          ? 'bg-sky-100 text-sky-700'
                        : bookingUiState === 'expired'
                          ? 'bg-slate-100 text-slate-700'
                          : bookingUiState === 'declined'
                            ? 'bg-rose-100 text-rose-700'
                          : 'bg-white text-violet-700 ring-1 ring-violet-200'
                    }`}>
                      {bookingUiState === 'confirmed'
                        ? tr('Booking confirmed', 'Réservation confirmée')
                        : bookingUiState === 'active'
                          ? tr('Rental live', 'Location active')
                        : bookingUiState === 'approved'
                          ? tr('Approved by owner', 'Approuvée par le propriétaire')
                        : bookingUiState === 'expired'
                          ? tr('Booking hold expired', 'Réservation expirée')
                          : bookingUiState === 'declined'
                            ? tr('Declined', 'Refusée')
                          : tr('Waiting for approval', 'En attente d’approbation')}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm text-slate-700">
                      {bookingUiState === 'confirmed'
                        ? tr('You can now chat with the owner', 'Vous pouvez maintenant discuter avec le propriétaire')
                        : bookingUiState === 'active'
                          ? tr('The rental is now in progress', 'La location est maintenant en cours')
                        : bookingUiState === 'approved'
                          ? tr('Next step: confirm your booking to continue', 'Étape suivante : confirmez votre réservation pour continuer')
                        : bookingUiState === 'expired'
                          ? tr('Request again to continue', 'Redemandez pour continuer')
                          : bookingUiState === 'declined'
                            ? tr('This request was declined by the owner', 'Cette demande a été refusée par le propriétaire')
                          : compactWaitingText}
                    </span>
                  </div>
                )}
                {marketplaceActionError ? (
                  marketplaceActionHelper ? (
                    <div className="mt-3 rounded-[22px] border border-amber-200 bg-amber-50 px-3 py-3 text-amber-950">
                      <p className="text-sm font-bold">{marketplaceActionHelper.title}</p>
                      <p className="mt-1 text-xs font-medium leading-5 text-amber-800">
                        {marketplaceActionHelper.body}
                      </p>
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        {marketplaceActionHelper.actionHref ? (
                          <button
                            type="button"
                            onClick={() => navigate(marketplaceActionHelper.actionHref, {
                              state: marketplaceActionHelper.actionState,
                            })}
                            className="inline-flex items-center justify-center rounded-full bg-amber-700 px-3.5 py-2 text-xs font-bold text-white transition hover:bg-amber-800"
                          >
                            {marketplaceActionHelper.actionLabel}
                          </button>
                        ) : null}
                        <span className="text-[11px] font-medium text-amber-700">
                          {marketplaceActionHelper.rawMessage}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">
                      {marketplaceActionError}
                    </div>
                  )
                ) : null}
              </div>
            ) : null}
            {isVerificationThread && !showBookingContextCard && verificationPosts.length ? (
              <div className={`${headerBlockSpacingClass} space-y-3`}>
                {(() => {
                  const verificationUiTone = verificationSurfaceClasses(verificationStatus);
                  return (
                    <>
                    <button
                      type="button"
                      onClick={() => setShowVerificationDocuments((current) => !current)}
                      className={`flex w-full items-start justify-between gap-3 rounded-[18px] border px-3 py-3 text-left transition ${verificationUiTone.shell}`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${verificationUiTone.count}`}>
                            {verificationStatusLabel}
                          </span>
                          {verificationCaseHeadline ? (
                            <p className="text-sm font-black text-slate-950">
                              {verificationCaseHeadline}
                            </p>
                          ) : null}
                        </div>
                        {verificationCaseSupportingLine && !(isCustomerVerificationView && verificationNeedsChanges) ? (
                          <p className="mt-1 text-[11px] font-semibold text-slate-500">
                            {verificationCaseSupportingLine}
                          </p>
                        ) : null}
                        {verificationCaseNextStep ? (
                          <p className="mt-1 text-xs font-medium text-slate-500">
                            {verificationCaseNextStep}
                          </p>
                        ) : null}
                      </div>
                      <div className="flex shrink-0 items-center pl-2">
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-bold text-slate-600 shadow-sm">
                          <span>{tr('View details', 'Voir les détails')}</span>
                          {showVerificationDocuments ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        </span>
                      </div>
                    </button>
                    {isCustomerVerificationView && verificationNeedsChanges && primaryVerificationIssue ? (
                      <div className="rounded-[18px] border border-amber-200 bg-white px-4 py-4 shadow-[0_10px_18px_rgba(15,23,42,0.05)]">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-bold text-amber-700">
                                {tr('Needs changes', 'Corrections requises')}
                              </span>
                            </div>
                            <p className="mt-2 text-sm font-black text-slate-950">
                              {tr(
                                `${primaryVerificationIssueLabel} needs to be replaced.`,
                                `${primaryVerificationIssueLabel} doit être remplacé.`
                              )}
                            </p>
                            <p className="mt-1 text-sm font-medium text-slate-600">
                              {primaryVerificationIssueReason || tr('Please upload a valid, non-expired document.', 'Veuillez téléverser un document valide et non expiré.')}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => openVerificationDocument(primaryVerificationIssue)}
                            className="inline-flex items-center justify-center rounded-full border border-violet-200 bg-violet-50 px-4 py-2 text-sm font-bold text-violet-700 transition hover:border-violet-300 hover:bg-violet-100"
                          >
                            {tr(`Upload new ${primaryVerificationIssueLabel}`, `Téléverser un nouveau ${primaryVerificationIssueLabel}`)}
                          </button>
                        </div>
                      </div>
                    ) : null}
                    {showVerificationDocuments ? customerVerificationSummaryPosts.map((post) => (
                      (() => {
                        const effectivePostStatus = verificationStatus === 'approved' ? 'approved' : post.status;
                        const postUiTone = verificationSurfaceClasses(effectivePostStatus);
                        return (
                      <div
                        key={post.id}
                        className={`rounded-[18px] border bg-white px-3 py-2.5 shadow-[0_10px_18px_rgba(15,23,42,0.05)] ${postUiTone.card}`}
                      >
                        <div className="flex min-w-0 items-center gap-3">
                            {post.imageUrl ? (
                              <button
                                type="button"
                                onClick={() => openVerificationPostPreview(post)}
                                className={`relative h-11 w-11 shrink-0 overflow-hidden rounded-xl border ${postUiTone.preview}`}
                              >
                                <img
                                  src={post.imageUrl}
                                  alt={post.fileName || getVerificationTypeLabel(post.documentType || 'profile_id', isFrench ? 'fr' : 'en')}
                                  className="h-full w-full object-cover"
                                  loading="lazy"
                                  onError={(event) => {
                                    event.currentTarget.style.display = 'none';
                                    const fallback = event.currentTarget.parentElement?.querySelector('[data-verification-fallback-icon]');
                                    if (fallback) {
                                      fallback.classList.remove('hidden');
                                      fallback.classList.add('flex');
                                    }
                                  }}
                                />
                                <span
                                  data-verification-fallback-icon
                                  className="pointer-events-none hidden absolute inset-0 items-center justify-center bg-slate-50 text-slate-400"
                                >
                                  <FileBadge className="h-4 w-4" />
                                </span>
                              </button>
                            ) : (
                              <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border ${postUiTone.preview} text-slate-400`}>
                                <FileBadge className="h-4 w-4" />
                              </div>
                            )}
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="text-sm font-bold text-slate-950">
                                  {getVerificationTypeLabel(post.documentType || 'profile_id', isFrench ? 'fr' : 'en')}
                                </p>
                                <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${verificationStatusToneClass(effectivePostStatus)}`}>
                                  {isCustomerVerificationView ? verificationStatusDisplay(effectivePostStatus) : (effectivePostStatus === 'approved' ? '✓' : effectivePostStatus === 'pending' ? '•' : '!')}
                                </span>
                              </div>
                              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                                {currentSenderRole === 'admin' && post.caseTitle ? (
                                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-600">
                                    {post.caseTitle}
                                  </span>
                                ) : null}
                                <button
                                  type="button"
                                  onClick={() => openVerificationDocument(post)}
                                  className="text-[11px] font-bold text-violet-700 transition hover:text-violet-800"
                                >
                                  {isCustomerVerificationView ? tr('View document', 'Voir le document') : tr('Open verification', 'Ouvrir la vérification')}
                                </button>
                                {post.fileName ? (
                                  <span className="truncate text-[11px] text-slate-400">
                                    {post.fileName}
                                  </span>
                                ) : null}
                              </div>
                            </div>
                          <div className="shrink-0">
                            {currentSenderRole === 'admin' && verificationStatus !== 'approved' && effectivePostStatus === 'pending' ? (
                              <div className="flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  onClick={() => void handleVerificationAction('approve_verification', post.id)}
                                  disabled={Boolean(marketplaceActionBusy)}
                                  className="inline-flex items-center justify-center rounded-full bg-emerald-600 px-3 py-1.5 text-[11px] font-bold text-white transition hover:bg-emerald-700 disabled:opacity-60"
                                >
                                  {tr('Approve', 'Approuver')}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void handleVerificationAction('reject_verification', post.id)}
                                  disabled={Boolean(marketplaceActionBusy)}
                                  className="inline-flex items-center justify-center rounded-full border border-amber-200 bg-white px-3 py-1.5 text-[11px] font-bold text-amber-700 transition hover:border-amber-300 hover:bg-amber-50 disabled:opacity-60"
                                >
                                  {tr('Reject', 'Refuser')}
                                </button>
                              </div>
                            ) : null}
                          </div>
                        </div>
                      </div>
                        );
                      })()
                    )) : null}
                    </>
                  );
                })()}
              </div>
            ) : null}
            {isCustomerVerificationView && verificationStatus === 'approved' ? (
              <div className={headerBlockSpacingClass}>
                <button
                  type="button"
                  onClick={() => navigate('/marketplace', {
                    state: {
                      from: location.pathname + location.search + location.hash,
                    },
                  })}
                  className="inline-flex items-center justify-center rounded-full bg-emerald-600 px-4 py-2.5 text-sm font-black text-white shadow-[0_12px_24px_rgba(5,150,105,0.22)] transition hover:bg-emerald-700"
                >
                  {tr('Browse vehicles', 'Explorer les véhicules')}
                </button>
              </div>
            ) : null}
              </>
            ) : null}
          </div>

          <div className="absolute right-0 top-0 z-[90]">
            <button
              type="button"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setThreadHeaderMenuOpen((current) => !current);
              }}
              className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-sm transition hover:border-violet-200 hover:text-violet-700"
              aria-label={tr('Thread actions', 'Actions du fil')}
              title={tr('Thread actions', 'Actions du fil')}
            >
              <Ellipsis className="h-4.5 w-4.5" />
            </button>
            {threadHeaderMenuOpen ? (
              <div
                className={
                  compactMode
                    ? 'fixed right-4 top-[max(5.5rem,calc(env(safe-area-inset-top,0px)+4.5rem))] z-[9999] w-[min(calc(100vw-2rem),20rem)] max-h-[calc(100dvh-7rem)] overflow-y-auto rounded-[24px] border border-slate-200 bg-white p-2 shadow-[0_28px_70px_rgba(15,23,42,0.26)]'
                    : 'fixed right-5 top-[max(6rem,calc(env(safe-area-inset-top,0px)+5rem))] z-[9999] w-[min(calc(100vw-2rem),18rem)] max-h-[calc(100dvh-7rem)] overflow-y-auto rounded-[22px] border border-slate-200 bg-white p-1.5 shadow-[0_24px_64px_rgba(15,23,42,0.22)]'
                }
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                }}
              >
                {compactMode ? (
                  <button
                    type="button"
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      setThreadHeaderMenuOpen(false);
                      onExitReadingMode?.();
                      scrollToTop();
                    }}
                    className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    <span>{floatingBackLabel || tr('Message list', 'Liste des messages')}</span>
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    setThreadHeaderMenuOpen(false);
                    scrollToLatest();
                  }}
                  className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  <MessageSquareText className="h-4 w-4" />
                  <span>{tr('Jump to latest', 'Aller au dernier message')}</span>
                </button>
                <button
                  type="button"
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    setThreadHeaderMenuOpen(false);
                    void handleShareDetails();
                  }}
                  className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  <PenSquare className="h-4 w-4" />
                  <span>{tr('Copy / open context', 'Copier / ouvrir le contexte')}</span>
                </button>
                <button
                  type="button"
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    void handleToggleArchiveThread();
                  }}
                  disabled={!resolvedThreadKey || threadArchiveBusy}
                  className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-semibold transition disabled:opacity-60 ${
                    isThreadArchived
                      ? 'text-emerald-700 hover:bg-emerald-50'
                      : 'text-amber-700 hover:bg-amber-50'
                  }`}
                  >
                  <Archive className="h-4 w-4" />
                  <span>
                    {threadArchiveBusy
                      ? isThreadArchived
                        ? tr('Restoring…', 'Restauration…')
                        : tr('Archiving…', 'Archivage…')
                      : isThreadArchived
                        ? tr('Restore thread', 'Restaurer le fil')
                        : tr('Archive thread', 'Archiver le fil')}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    void handleDeleteThread();
                  }}
                  disabled={!resolvedThreadKey || threadDeleteBusy}
                  className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-semibold text-rose-700 transition hover:bg-rose-50 disabled:opacity-60"
                >
                  <Trash2 className="h-4 w-4" />
                  <span>
                    {threadDeleteBusy
                      ? tr('Deleting…', 'Suppression…')
                      : tr('Delete conversation', 'Supprimer la conversation')}
                  </span>
                </button>
                {threadContextHref ? (
                  <button
                    type="button"
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      setThreadHeaderMenuOpen(false);
                      if (typeof onOpenContext === 'function') {
                        onOpenContext(selectedThread);
                      } else {
                        navigate(threadContextHref, {
                          state: {
                            from: currentLocationPath,
                          },
                        });
                      }
                    }}
                    className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    <span>{threadContextActionLabel}</span>
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-2">
            {showThreadTools ? (
              <div className="w-full rounded-[20px] border border-slate-200 bg-slate-50/85 px-3 py-3">
                <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">
                      {tr('Thread tools', 'Outils du fil')}
                    </p>
                    <p className="mt-1 text-sm font-bold text-slate-900">
                      {tr('Keep the workflow organized', 'Gardez le workflow organisé')}
                    </p>
                  </div>
                  <p className="max-w-xs text-xs font-medium text-slate-500">
                    {tr('These controls are internal and help the team route, prioritize, and close the thread.', 'Ces contrôles sont internes et aident l’équipe à orienter, prioriser et clôturer le fil.')}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                {[
                  ['normal', tr('Normal', 'Normal')],
                  ['important', tr('Important', 'Important')],
                  ['urgent', tr('Urgent', 'Urgent')],
                ].map(([priorityValue, label]) => (
                  <button
                    key={priorityValue}
                    type="button"
                    onClick={() => onUpdateThreadState?.(selectedThread, { priority: priorityValue })}
                    disabled={busyThreadKey === selectedThread.thread_key}
                    className={`inline-flex items-center rounded-full px-3 py-2 text-xs font-bold transition ${
                      priority === priorityValue
                        ? priorityValue === 'urgent'
                          ? 'bg-rose-600 text-white'
                          : priorityValue === 'important'
                            ? 'bg-amber-500 text-white'
                            : 'bg-slate-900 text-white'
                        : 'border border-slate-200 bg-white text-slate-700 hover:border-violet-200 hover:text-violet-700'
                    }`}
                  >
                    {label}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => onUpdateThreadState?.(selectedThread, { waitingOn: currentSenderRole })}
                  disabled={busyThreadKey === selectedThread.thread_key}
                  className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 transition hover:border-violet-200 hover:text-violet-700 disabled:opacity-60"
                >
                  {tr('Needs reply', 'À répondre')}
                </button>
                <button
                  type="button"
                  onClick={() => onUpdateThreadState?.(selectedThread, { waitingOn: resolvedCounterpartyRole || 'customer' })}
                  disabled={busyThreadKey === selectedThread.thread_key}
                  className="inline-flex items-center rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 transition hover:border-violet-200 hover:text-violet-700 disabled:opacity-60"
                >
                  {resolvedWaitingOnCounterpartyLabel}
                </button>
                <button
                  type="button"
                  onClick={() => onUpdateThreadState?.(selectedThread, { resolved: !selectedThread?.resolved_at })}
                  disabled={busyThreadKey === selectedThread.thread_key}
                  className={`inline-flex items-center rounded-full px-3 py-2 text-xs font-bold transition ${
                    selectedThread?.resolved_at
                      ? 'border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                      : 'border border-slate-200 bg-white text-slate-700 hover:border-emerald-200 hover:text-emerald-700'
                  }`}
                >
                    {selectedThread?.resolved_at ? tr('Reopen', 'Rouvrir') : tr('Resolve', 'Résoudre')}
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
      ) : null}

      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-b-[30px] bg-white sm:rounded-b-[32px]">
      {immersiveMode && readerFocused && !compactMode ? (
        <button
          type="button"
          onClick={() => {
            onExitReadingMode?.();
            scrollToTop();
          }}
          className="pointer-events-auto absolute left-4 top-4 z-20 inline-flex items-center gap-2 rounded-full border border-violet-200/90 bg-white/96 px-4 py-2 text-sm font-bold text-violet-700 shadow-[0_18px_36px_rgba(79,70,229,0.18)] ring-1 ring-white/80 backdrop-blur-xl transition hover:-translate-y-0.5 hover:border-violet-300 hover:text-violet-800"
          aria-label={floatingBackLabel || tr('Threads', 'Fils')}
          title={floatingBackLabel || tr('Threads', 'Fils')}
        >
          <ArrowLeft className="h-4 w-4" />
          {floatingBackLabel || tr('Threads', 'Fils')}
        </button>
      ) : null}
      <div
        ref={messageListRef}
        className={`min-h-0 flex-1 overflow-y-auto ${messageListPaddingClass} ${immersiveMode && readerFocused && !compactMode ? 'pt-20' : ''} ${threadVerticalSpacingClass}`}
      >
        {visibleTimelineEntries.length ? (
          <section className="space-y-2.5">
            <div className="flex items-center gap-3">
              <div className="h-px flex-1 bg-slate-200" />
              <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-slate-600">
                {tr('Timeline', 'Chronologie')}
              </span>
              <div className="h-px flex-1 bg-slate-200" />
            </div>
            {visibleTimelineEntries.map((entry) => {
              const timelineEventCard = entry.card;
              const eventTimestamp = entry.kind === 'event' ? entry.payload?.created_at : entry.payload?.created_at;
              return (
                <div key={entry.id} className={`${bookingUiState === 'expired' ? 'opacity-50' : ''}`}>
                  <div className={`rounded-[20px] border px-3.5 py-3 ${
                    timelineEventCard.tone === 'approval'
                      ? 'border-emerald-200 bg-emerald-50/90'
                      : timelineEventCard.tone === 'rejection'
                        ? 'border-amber-200 bg-amber-50/90'
                        : timelineEventCard.tone === 'status'
                          ? 'border-sky-200 bg-sky-50/90'
                          : 'border-slate-200 bg-slate-50/90'
                  }`}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start gap-3">
                          <span className={`mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                            timelineEventCard.tone === 'approval'
                              ? 'bg-emerald-100 text-emerald-700'
                              : timelineEventCard.tone === 'rejection'
                                ? 'bg-amber-100 text-amber-700'
                                : timelineEventCard.tone === 'status'
                                  ? 'bg-sky-100 text-sky-700'
                                  : 'bg-slate-200 text-slate-600'
                          }`}>
                            {timelineEventCard.tone === 'approval' ? <MessageSquareText className="h-4 w-4" /> : timelineEventCard.tone === 'rejection' ? <AlertTriangle className="h-4 w-4" /> : <FileBadge className="h-4 w-4" />}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-black text-slate-950">{timelineEventCard.title}</p>
                            {timelineEventCard.body ? (
                              <p className="mt-1 text-sm text-slate-600">{timelineEventCard.body}</p>
                            ) : null}
                          </div>
                        </div>
                      </div>
                      <p className="shrink-0 text-[11px] font-semibold text-slate-400">
                        {formatDateTime(eventTimestamp, isFrench)}
                      </p>
                    </div>
                    {Array.isArray(timelineEventCard.documentCards) && timelineEventCard.documentCards.length ? (
                      <div className="mt-3 space-y-2">
                        {timelineEventCard.documentCards.map((documentCard) => (
                          <a
                            key={documentCard.key}
                            href={documentCard.href}
                            target="_blank"
                            rel="noreferrer"
                            className="group flex items-center justify-between gap-3 rounded-[18px] border border-violet-200 bg-white px-3.5 py-3 shadow-sm transition hover:border-violet-300 hover:bg-violet-50/60"
                          >
                            <div className="flex min-w-0 items-center gap-3">
                              <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-violet-100 text-violet-700 shadow-[0_8px_18px_rgba(124,58,237,0.12)]">
                                <FileBadge className="h-5 w-5" />
                              </span>
                              <div className="min-w-0">
                                <p className="truncate text-sm font-black text-slate-950">{documentCard.title}</p>
                                {documentCard.body ? (
                                  <p className="mt-0.5 line-clamp-2 text-xs font-semibold text-slate-500">{documentCard.body}</p>
                                ) : null}
                                {documentCard.meta ? (
                                  <p className="mt-1 text-[11px] font-bold uppercase tracking-[0.12em] text-violet-500">{documentCard.meta}</p>
                                ) : null}
                              </div>
                            </div>
                            <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-violet-200 bg-violet-50 px-3 py-1.5 text-[11px] font-black text-violet-700 transition group-hover:border-violet-300 group-hover:bg-white">
                              {documentCard.actionLabel || tr('Open document', 'Ouvrir le document')}
                              <ExternalLink className="h-3.5 w-3.5" />
                            </span>
                          </a>
                        ))}
                      </div>
                    ) : null}
                    {timelineEventCard.previewSrc ? (
                      <div className="mt-2.5 flex items-center justify-between gap-3 rounded-[16px] border border-slate-200 bg-white px-3 py-2.5">
                        <div className="flex min-w-0 items-center gap-3">
                          <button
                            type="button"
                            onClick={() => setActiveImagePreview({
                              src: timelineEventCard.previewSrc,
                              name: timelineEventCard.previewName,
                              caption: formatDateTime(eventTimestamp, isFrench),
                            })}
                            className="h-12 w-12 overflow-hidden rounded-xl border border-slate-200 bg-slate-50"
                          >
                            <img
                              src={timelineEventCard.previewSrc}
                              alt={timelineEventCard.previewName}
                              className="h-full w-full object-cover"
                              loading="lazy"
                            />
                          </button>
                          <p className="truncate text-sm font-bold text-slate-900">{timelineEventCard.previewName}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            if (timelineEventCard.previewHref) {
                              navigate(timelineEventCard.previewHref, {
                                state: { from: currentThreadReturnPath },
                              });
                              return;
                            }
                            setActiveImagePreview({
                              src: timelineEventCard.previewSrc,
                              name: timelineEventCard.previewName,
                              caption: formatDateTime(eventTimestamp, isFrench),
                            });
                          }}
                          className="inline-flex shrink-0 items-center rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-bold text-slate-700 transition hover:border-violet-200 hover:text-violet-700"
                        >
                          {timelineEventCard.previewActionLabel || tr('View document', 'Voir le document')}
                        </button>
                      </div>
                    ) : null}
                    {Array.isArray(timelineEventCard.actions) && timelineEventCard.actions.length ? (
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        {timelineEventCard.actions.map((action) => (
                          <a
                            key={action.key}
                            href={action.href}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-2 rounded-full border border-violet-200 bg-white px-3.5 py-2 text-[11px] font-black text-violet-700 shadow-sm transition hover:border-violet-300 hover:bg-violet-50"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                            {action.label}
                          </a>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </section>
        ) : null}

        {allowInternalNotes && (hasInternalConversationMessages || isDirectStaffThread) ? (
          <section className={(visibleTimelineEntries.length || chatMessagesForRender.length) ? 'mt-4 space-y-2.5' : 'space-y-2.5'}>
            <button
              type="button"
              onClick={() => setShowInternalNotes((current) => !current)}
              className="flex w-full items-center justify-between gap-3 rounded-[22px] border border-slate-200 bg-slate-50/90 px-4 py-3 text-left transition hover:border-slate-300 hover:bg-slate-100/90"
            >
              <div className="min-w-0">
                <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">
                  {tr('Team notes', "Notes d’équipe")}
                </p>
                <p className="mt-1 text-sm font-semibold text-slate-900">
                  {hasInternalConversationMessages
                    ? tr(
                        `${internalConversationMessages.length} internal note${internalConversationMessages.length === 1 ? '' : 's'} available only to staff`,
                        `${internalConversationMessages.length} note${internalConversationMessages.length === 1 ? '' : 's'} interne${internalConversationMessages.length === 1 ? '' : 's'} visible${internalConversationMessages.length === 1 ? '' : 's'} uniquement par le staff`
                      )
                    : tr('Private staff coordination for this thread', 'Coordination privée du staff pour ce fil')}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {hasInternalConversationMessages ? (
                  <span className="inline-flex min-w-8 items-center justify-center rounded-full bg-slate-900 px-2.5 py-1 text-[11px] font-black text-white">
                    {internalConversationMessages.length}
                  </span>
                ) : null}
                {showInternalNotes ? <ChevronUp className="h-4 w-4 text-slate-500" /> : <ChevronDown className="h-4 w-4 text-slate-500" />}
              </div>
            </button>
            {showInternalNotes ? (
              <div className="space-y-2.5 rounded-[24px] border border-slate-200 bg-slate-50/70 p-2.5">
                {hasInternalConversationMessages ? (
                  internalConversationMessages.map((message) => {
                    const messageId = String(message?.id || `${message?.created_at || ''}:${message?.body || ''}`);
                    const noteAttachments = getMessageAttachments(message);
                    const noteReplyPreview = resolveReplyReference(message);
                    const noteSenderLabel = getParticipantLabel(message, currentUserId, currentUserLabel, tr);
                    const isPendingMessage = String(message?.id || '').startsWith('pending-');
                    return (
                      <div key={`internal-${messageId}`} className="rounded-[20px] border border-slate-200 bg-white px-4 py-2.5">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">
                              {tr('Team note', "Note d’équipe")}
                            </p>
                            <p className="mt-1 text-sm font-bold text-slate-950">
                              {noteSenderLabel}
                            </p>
                          </div>
                          <p className="text-xs font-medium text-slate-500">
                            {isPendingMessage ? tr('Sending…', 'Envoi…') : formatDateTime(message?.created_at, isFrench)}
                          </p>
                        </div>
                        {noteReplyPreview ? (
                          <div className="mt-2.5 rounded-[16px] border border-slate-200 bg-slate-50 px-3 py-2">
                            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">
                              {tr('Reply context', 'Contexte de réponse')}
                            </p>
                            <p className="mt-1 line-clamp-2 text-sm text-slate-600">
                              {noteReplyPreview.body || '—'}
                            </p>
                          </div>
                        ) : null}
                        <p className="mt-2.5 whitespace-pre-wrap text-sm leading-6 text-slate-800">
                          {String(message?.body || '').trim() || tr('No text content', 'Aucun contenu texte')}
                        </p>
                        {noteAttachments.length ? (
                          <div className="mt-2.5 flex gap-2 overflow-x-auto pb-1">
                            {noteAttachments.map((attachment) => (
                              <button
                                key={attachment.id || attachment.publicUrl || attachment.thumbnailUrl}
                                type="button"
                                onClick={() => {
                                  if (!isVisualAttachment(attachment) || (!attachment.publicUrl && !attachment.thumbnailUrl)) return;
                                  setActiveImagePreview({
                                    src: attachment.publicUrl || attachment.thumbnailUrl,
                                    name: attachment.originalFilename || tr('Attachment', 'Pièce jointe'),
                                    caption: formatDateTime(message?.created_at, isFrench),
                                  });
                                }}
                                className="relative h-14 w-14 shrink-0 overflow-hidden rounded-2xl border border-slate-200 bg-slate-100"
                              >
                                {isVisualAttachment(attachment) && (attachment.thumbnailUrl || attachment.publicUrl) ? (
                                  <img
                                    src={attachment.thumbnailUrl || attachment.publicUrl}
                                    alt={attachment.originalFilename || tr('Attachment', 'Pièce jointe')}
                                    className="h-full w-full object-cover"
                                  />
                                ) : (
                                  <span className="flex h-full w-full items-center justify-center text-[10px] font-bold text-slate-500">
                                    {tr('File', 'Fichier')}
                                  </span>
                                )}
                              </button>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    );
                  })
                ) : (
                  <div className="rounded-[20px] border border-dashed border-slate-300 bg-white px-4 py-5 text-sm text-slate-500">
                    {tr('No internal notes yet. Use Team note when you want to leave private staff context on this thread.', "Aucune note interne pour le moment. Utilisez Note d’équipe pour laisser un contexte privé au staff sur ce fil.")}
                  </div>
                )}
              </div>
            ) : null}
          </section>
        ) : null}

        {chatMessagesForRender.length ? (
          <section className={visibleTimelineEntries.length ? 'mt-4 space-y-3' : 'space-y-3'}>
            <div className="flex items-center gap-3">
              <div className="h-px flex-1 bg-slate-200" />
              <span className="rounded-full bg-white px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-slate-600 ring-1 ring-slate-200">
                {tr('Chat', 'Chat')}
              </span>
              <div className="h-px flex-1 bg-slate-200" />
            </div>
            {chatMessagesForRender.map((message, index) => {
          const isOwn = String(message?.sender_user_id || '') === String(currentUserId || '');
          const isInternal = Boolean(message?.metadata?.isInternal) || String(message?.message_type || '').trim().toLowerCase() === 'internal_note';
          const rawMessageType = String(message?.message_type || '').trim().toLowerCase();
          const normalizedBubbleType = isInternal
            ? 'internal_note'
            : rawMessageType === 'admin_message'
              ? 'admin_message'
              : rawMessageType === 'user_message'
                ? 'user_message'
                : String(message?.sender_role || '').trim().toLowerCase() === 'admin'
                  ? 'admin_message'
                  : 'user_message';
          const isPendingMessage = String(message?.id || '').startsWith('pending-');
          const isFailedPendingMessage = Boolean(message?.metadata?.sendFailed);
          const messageId = String(message?.id || `${message.created_at}-${message.body}`);
          const replyReference = resolveReplyReference(message);
          const messageAttachments = getMessageAttachments(message);
          const visualGalleryAttachments = messageAttachments.filter(
            (attachment) => attachment?.status !== 'expired' && attachment?.publicUrl && isVisualAttachment(attachment)
          );
          const useCompactAttachmentGrid = visualGalleryAttachments.length > 1;
          const compactAttachmentIds = new Set(
            useCompactAttachmentGrid
              ? visualGalleryAttachments.map((attachment) => String(attachment.id || attachment.publicUrl || ''))
              : []
          );
          const stackedMessageAttachments = useCompactAttachmentGrid
            ? messageAttachments.filter(
                (attachment) => !compactAttachmentIds.has(String(attachment.id || attachment.publicUrl || ''))
              )
            : messageAttachments;
          const previewGallery = visualGalleryAttachments.map((attachment) => ({
            src: attachment.publicUrl,
            name: attachment.originalFilename || tr('Media attachment', 'Média joint'),
            caption: formatDateTime(message?.created_at, isFrench),
          }));
          const openAttachmentPreview = (attachment, galleryIndex = 0) => {
            const gallery = previewGallery.length ? previewGallery : [{
              src: attachment.publicUrl,
              name: attachment.originalFilename || tr('Media attachment', 'Média joint'),
              caption: formatDateTime(message?.created_at, isFrench),
            }];
            const nextIndex = Math.max(0, Math.min(galleryIndex, gallery.length - 1));
            setActiveImagePreview({
              ...gallery[nextIndex],
              gallery,
              index: nextIndex,
            });
          };
          const marketplaceStateCard = getMarketplaceStateCard(message);
          const messageMetadata = message?.metadata && typeof message.metadata === 'object' ? message.metadata : {};
          const participantLabel = getParticipantLabel(message, currentUserId, currentUserLabel, tr);
          const senderProfile = getThreadUserProfile(selectedThread, message?.sender_user_id);
          const participantAvatarUrl = String(
            isOwn
              ? senderProfile?.avatarUrl || ''
              : senderProfile?.avatarUrl || ''
          ).trim();
          const participantInitials = buildAvatarInitials(
            isInternal ? tr('Internal note', 'Note interne') : participantLabel
          );
          const isMarketplaceConversation = selectedThread?.family === 'marketplace';
          const messageBodyText = String(message?.body || '').trim();
          const photoEvidenceKind = String(messageMetadata.photoEvidenceKind || '').trim().toLowerCase();
          const photoEvidenceTitle = photoEvidenceKind === 'handoff'
            ? tr('Open media', 'Médias ouverture')
            : photoEvidenceKind === 'legal_docs'
              ? tr('Registration + insurance media', 'Médias carte grise + assurance')
              : photoEvidenceKind === 'return'
                ? tr('Closed media', 'Médias clôture')
                : String(messageMetadata.photoEvidenceLabel || '').trim();
          const photoEvidenceDescription = photoEvidenceKind === 'handoff'
            ? tr('Open media saved.', 'Médias ouverture enregistrés.')
            : photoEvidenceKind === 'legal_docs'
              ? tr('Registration + insurance media saved.', 'Médias carte grise + assurance enregistrés.')
              : photoEvidenceKind === 'return'
                ? tr('Closed media saved.', 'Médias clôture enregistrés.')
                : String(messageMetadata.photoEvidenceDescription || '').trim();
          const hasPhotoEvidenceSummary = Boolean(photoEvidenceTitle && messageAttachments.length);
          const normalizedMessageBodyText = messageBodyText.toLowerCase();
          const shouldHidePhotoEvidenceBody = hasPhotoEvidenceSummary && (
            normalizedMessageBodyText === photoEvidenceTitle.toLowerCase() ||
            normalizedMessageBodyText === 'photos uploaded' ||
            normalizedMessageBodyText === 'vehicle inspection photos uploaded' ||
            normalizedMessageBodyText === 'registration and insurance photos uploaded' ||
            normalizedMessageBodyText === 'return media uploaded' ||
            normalizedMessageBodyText === 'open media' ||
            normalizedMessageBodyText === 'registration + insurance media' ||
            normalizedMessageBodyText === 'closed media' ||
            normalizedMessageBodyText === 'photos téléversées' ||
            normalizedMessageBodyText === 'photos d’inspection véhicule téléversées' ||
            normalizedMessageBodyText === 'photos carte grise et assurance téléversées'
          );
          const isShortMarketplaceChatNote = Boolean(
            isMarketplaceConversation &&
            !marketplaceStateCard &&
            !messageAttachments.length &&
            !replyReference &&
            !isInternal &&
            messageBodyText &&
            messageBodyText.length <= 40
          );
          const isFreshIncoming = recentIncomingMessageIds.includes(messageId);
          const bubbleMotionClass = isPendingMessage
            ? 'chat-bubble-send'
            : isOwn
              ? 'chat-bubble-own'
              : 'chat-bubble-receive';
          const deliveryLabel = isPendingMessage
            ? isFailedPendingMessage
              ? tr('Failed', 'Échec')
              : tr('Sending…', 'Envoi…')
            : message?.read_at
              ? tr('Seen', 'Vu')
              : isOwn
                ? tr('Sent', 'Envoyé')
                : '';
          return (
            <React.Fragment key={messageId}>
              {isFreshIncoming && messageId === firstRecentIncomingMessageId ? (
                <div className="flex items-center gap-3 py-1 chat-new-divider">
                  <div className="h-px flex-1 bg-violet-100" />
                  <span className="rounded-full bg-violet-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-violet-600">
                    {tr('New message', 'Nouveau message')}
                  </span>
                  <div className="h-px flex-1 bg-violet-100" />
                </div>
              ) : null}
              <div className={`flex ${isOwn ? 'justify-end' : 'justify-start'} ${bookingUiState === 'expired' ? 'opacity-50' : ''}`}>
              <div
                ref={(node) => {
                  if (node) {
                    messageRefs.current.set(messageId, node);
                  } else {
                    messageRefs.current.delete(messageId);
                  }
                }}
                className={`max-w-[88%] sm:max-w-[84%] lg:max-w-[78%] xl:max-w-[72ch] rounded-[22px] px-4 py-2.5 ${bubbleMotionClass} ${
                isInternal
                  ? 'border border-amber-200 bg-amber-50 text-amber-950'
                  : isShortMarketplaceChatNote
                    ? normalizedBubbleType === 'admin_message'
                      ? 'border border-violet-200/60 bg-violet-50 text-violet-900'
                      : 'border border-slate-200 bg-white text-slate-700'
                  : normalizedBubbleType === 'admin_message'
                    ? 'bg-violet-600 text-white'
                    : 'border border-slate-200 bg-slate-50 text-slate-900'
              } ${isShortMarketplaceChatNote ? 'px-3 py-2.5 shadow-none' : ''} ${isFreshIncoming ? 'chat-bubble-incoming-fresh' : ''}`}>
                <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2">
                  {participantAvatarUrl ? (
                    <img
                      src={participantAvatarUrl}
                      alt={isInternal ? tr('Internal note', 'Note interne') : participantLabel}
                      className="h-6 w-6 shrink-0 rounded-full object-cover ring-1 ring-black/5"
                    />
                  ) : (
                    <span className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-black ring-1 ${
                      isInternal
                        ? 'bg-amber-100 text-amber-700 ring-amber-200'
                        : normalizedBubbleType === 'admin_message'
                          ? 'bg-violet-100 text-violet-700 ring-violet-200'
                          : 'bg-slate-200 text-slate-700 ring-slate-300'
                    }`}>
                      {participantInitials}
                    </span>
                  )}
                  <p className={`min-w-0 truncate text-[11px] font-bold uppercase tracking-[0.16em] ${
                    isInternal
                      ? 'text-amber-700'
                      : isShortMarketplaceChatNote
                        ? normalizedBubbleType === 'admin_message'
                          ? 'text-violet-500'
                          : 'text-slate-400'
                      : normalizedBubbleType === 'admin_message'
                        ? 'text-violet-100'
                        : 'text-slate-400'
                      }`}>
                    {isInternal
                      ? tr('Internal note', 'Note interne')
                      : participantLabel}
                  </p>
                </div>
                {!isPendingMessage ? (
                  <div className="relative flex items-center gap-1">
                    <button
                      type="button"
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        setOpenMessageActionId((current) => current === messageId ? '' : messageId);
                      }}
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-bold transition ${
                        isInternal
                          ? 'text-amber-700 hover:bg-amber-100'
                          : isShortMarketplaceChatNote
                            ? normalizedBubbleType === 'admin_message'
                              ? 'text-violet-500 hover:bg-violet-100'
                              : 'text-slate-500 hover:bg-slate-100'
                            : normalizedBubbleType === 'admin_message'
                              ? 'text-violet-100 hover:bg-white/10'
                              : 'text-slate-500 hover:bg-slate-200/80'
                      }`}
                      aria-label={tr('More actions', 'Plus d’actions')}
                      title={tr('More actions', 'Plus d’actions')}
                    >
                      <Ellipsis className="h-3.5 w-3.5" />
                      <span className="sr-only">{tr('More actions', 'Plus d’actions')}</span>
                    </button>
                    {openMessageActionId === messageId ? (
                      <div
                        className={`absolute right-0 top-9 z-[130] min-w-[10rem] rounded-2xl border bg-white p-1.5 shadow-[0_22px_54px_rgba(15,23,42,0.2)] ${
                          normalizedBubbleType === 'admin_message' ? 'border-violet-200' : 'border-slate-200'
                        }`}
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                        }}
                      >
                        <button
                          type="button"
                          onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            setOpenMessageActionId('');
                            setReplyingToMessage(message);
                            setReplyModeActive(true);
                            setComposerMode(isInternal ? 'internal' : composerMode === 'internal' ? 'customer' : composerMode);
                          }}
                          className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                        >
                          <CornerUpLeft className="h-4 w-4" />
                          <span>{replyActionLabel}</span>
                        </button>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            setOpenMessageActionId('');
                            handleAddMessageToDraft(message);
                          }}
                          className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                        >
                          <PenSquare className="h-4 w-4" />
                          <span>{tr('Add to draft', 'Ajouter au brouillon')}</span>
                        </button>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            setOpenMessageActionId('');
                            void handleDeleteMessage(message);
                          }}
                          className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-semibold transition disabled:opacity-60 ${
                            canDeleteMessage(message)
                              ? 'text-rose-600 hover:bg-rose-50'
                              : 'cursor-not-allowed text-slate-300'
                          }`}
                          disabled={!canDeleteMessage(message) || deletingMessageId === messageId}
                        >
                          <Trash2 className="h-4 w-4" />
                          <span>
                            {!canDeleteMessage(message)
                              ? tr('Delete unavailable', 'Suppression indisponible')
                              : deletingMessageId === messageId
                              ? tr('Deleting…', 'Suppression…')
                              : tr('Delete message', 'Supprimer le message')}
                          </span>
                        </button>
                      </div>
                    ) : null}
                  </div>
                ) : null}
                </div>
                {replyReference ? (
                  <button
                    type="button"
                    onClick={() => scrollToMessage(replyReference.id)}
                    className={`mt-1.5 block w-full rounded-[18px] border px-3 py-2 text-left transition ${
                      isInternal
                        ? 'border-amber-200 bg-white/70 hover:bg-white'
                        : normalizedBubbleType === 'admin_message'
                          ? 'border-white/20 bg-white/10 hover:bg-white/16'
                          : 'border-slate-200 bg-white hover:bg-slate-50'
                    }`}
                  >
                    <p className={`text-[10px] font-black uppercase tracking-[0.16em] ${
                      isInternal
                        ? 'text-amber-700'
                        : normalizedBubbleType === 'admin_message'
                          ? 'text-violet-100'
                          : 'text-violet-600'
                    }`}>
                      {replyReference.senderName}
                    </p>
                    <p className={`mt-1 line-clamp-2 text-xs leading-5 ${
                      isInternal
                        ? 'text-amber-900'
                        : normalizedBubbleType === 'admin_message'
                          ? 'text-white/88'
                          : 'text-slate-500'
                    }`}>
                      {replyReference.body}
                    </p>
                  </button>
                ) : null}
                {marketplaceStateCard ? (
                  <div
                    className={`mt-2.5 rounded-[18px] border px-3 py-2.5 ${
                      marketplaceStateCard.tone === 'emerald'
                        ? normalizedBubbleType === 'admin_message'
                          ? 'border-white/15 bg-white/10'
                          : 'border-emerald-200 bg-emerald-50'
                        : marketplaceStateCard.tone === 'amber'
                          ? normalizedBubbleType === 'admin_message'
                            ? 'border-white/15 bg-white/10'
                            : 'border-amber-200 bg-amber-50'
                          : marketplaceStateCard.tone === 'sky'
                            ? normalizedBubbleType === 'admin_message'
                              ? 'border-white/15 bg-white/10'
                              : 'border-sky-200 bg-sky-50'
                            : marketplaceStateCard.tone === 'slate'
                              ? normalizedBubbleType === 'admin_message'
                                ? 'border-white/15 bg-white/10'
                                : 'border-slate-200 bg-slate-100'
                              : normalizedBubbleType === 'admin_message'
                                ? 'border-white/15 bg-white/10'
                                : 'border-violet-200 bg-violet-50'
                    }`}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      {marketplaceStateCard.icon === 'approved' ? (
                        <span
                          className={`inline-flex h-7 w-7 items-center justify-center rounded-full ${
                            normalizedBubbleType === 'admin_message'
                              ? 'bg-emerald-400/18 text-white'
                              : 'bg-emerald-100 text-emerald-600'
                          }`}
                          aria-hidden="true"
                        >
                          <CheckCircle2 className="h-4 w-4" />
                        </span>
                      ) : null}
                      <span
                        className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.16em] ${
                          marketplaceStateCard.tone === 'emerald'
                            ? normalizedBubbleType === 'admin_message' ? 'bg-white/12 text-white' : 'bg-emerald-100 text-emerald-700'
                            : marketplaceStateCard.tone === 'amber'
                              ? normalizedBubbleType === 'admin_message' ? 'bg-white/12 text-white' : 'bg-amber-100 text-amber-700'
                              : marketplaceStateCard.tone === 'sky'
                                ? normalizedBubbleType === 'admin_message' ? 'bg-white/12 text-white' : 'bg-sky-100 text-sky-700'
                                : marketplaceStateCard.tone === 'slate'
                                  ? normalizedBubbleType === 'admin_message' ? 'bg-white/12 text-white' : 'bg-slate-200 text-slate-700'
                                  : normalizedBubbleType === 'admin_message' ? 'bg-white/12 text-white' : 'bg-violet-100 text-violet-700'
                        }`}
                      >
                        {marketplaceStateCard.title}
                      </span>
                    </div>
                    <p className={`chat-copy-title mt-2 ${normalizedBubbleType === 'admin_message' ? 'text-white' : 'text-slate-950'}`}>
                      {marketplaceStateCard.subtitle}
                    </p>
                    {marketplaceStateCard.detail ? (
                      <p className={`chat-copy-body-compact mt-1 ${normalizedBubbleType === 'admin_message' ? 'text-white/80' : 'text-slate-600'}`}>
                        {marketplaceStateCard.detail}
                      </p>
                    ) : null}
                    {Array.isArray(marketplaceStateCard.documentCards) && marketplaceStateCard.documentCards.length ? (
                      <div className="mt-3 grid gap-2">
                        {marketplaceStateCard.documentCards.map((documentCard) => (
                          <a
                            key={documentCard.key}
                            href={documentCard.href}
                            target="_blank"
                            rel="noreferrer"
                            className={`group flex items-center justify-between gap-3 rounded-[16px] border px-3 py-2.5 transition ${
                              normalizedBubbleType === 'admin_message'
                                ? 'border-white/15 bg-white/10 hover:bg-white/16'
                                : 'border-violet-200 bg-white hover:bg-violet-50/70'
                            }`}
                          >
                            <div className="flex min-w-0 items-center gap-3">
                              <span className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl ${
                                normalizedBubbleType === 'admin_message'
                                  ? 'bg-white/12 text-white'
                                  : 'bg-violet-100 text-violet-700'
                              }`}>
                                <FileBadge className="h-4 w-4" />
                              </span>
                              <div className="min-w-0">
                                <p className={`truncate text-sm font-black ${normalizedBubbleType === 'admin_message' ? 'text-white' : 'text-slate-950'}`}>
                                  {documentCard.title}
                                </p>
                                {documentCard.body ? (
                                  <p className={`mt-0.5 line-clamp-2 text-xs font-semibold ${normalizedBubbleType === 'admin_message' ? 'text-white/75' : 'text-slate-500'}`}>
                                    {documentCard.body}
                                  </p>
                                ) : null}
                              </div>
                            </div>
                            <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-black ${
                              normalizedBubbleType === 'admin_message'
                                ? 'bg-white/12 text-white'
                                : 'bg-violet-50 text-violet-700'
                            }`}>
                              {documentCard.actionLabel || tr('Open', 'Ouvrir')}
                              <ExternalLink className="h-3.5 w-3.5" />
                            </span>
                          </a>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : null}
                {hasPhotoEvidenceSummary ? (
                  <div className={`mt-2.5 rounded-[18px] border px-3 py-2.5 ${
                    normalizedBubbleType === 'admin_message'
                      ? 'border-white/15 bg-white/10'
                      : 'border-violet-200 bg-white'
                  }`}>
                    <div className="flex items-start gap-3">
                      <span className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${
                        normalizedBubbleType === 'admin_message'
                          ? 'bg-white/12 text-white'
                          : 'bg-violet-50 text-violet-700'
                      }`}>
                        <Camera className="h-4 w-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className={`text-[10px] font-black uppercase tracking-[0.16em] ${
                          normalizedBubbleType === 'admin_message' ? 'text-violet-100' : 'text-violet-600'
                        }`}>
                          {photoEvidenceTitle}
                        </p>
                        {photoEvidenceDescription ? (
                          <p className={`mt-1 text-sm font-semibold leading-5 ${
                            normalizedBubbleType === 'admin_message' ? 'text-white' : 'text-slate-950'
                          }`}>
                            {photoEvidenceDescription}
                          </p>
                        ) : null}
                        <p className={`mt-1 text-[11px] font-bold ${
                          normalizedBubbleType === 'admin_message' ? 'text-white/70' : 'text-slate-500'
                        }`}>
                          {tr(
                            `${messageAttachments.length} photo${messageAttachments.length === 1 ? '' : 's'}`,
                            `${messageAttachments.length} photo${messageAttachments.length === 1 ? '' : 's'}`
                          )}
                        </p>
                      </div>
                    </div>
                  </div>
                ) : null}
                {useCompactAttachmentGrid ? (
                  <div className="mt-2.5 overflow-hidden rounded-[18px] border border-violet-100 bg-white shadow-sm">
                    <div className="grid grid-cols-2 gap-1.5 p-1.5">
                      {visualGalleryAttachments.slice(0, 4).map((attachment, attachmentIndex) => {
                        const overflowCount = visualGalleryAttachments.length - 4;
                        const showOverflow = attachmentIndex === 3 && overflowCount > 0;
                        return (
                          <button
                            key={attachment.id || attachment.publicUrl}
                            type="button"
                            onClick={() => openAttachmentPreview(attachment, attachmentIndex)}
                            className="group relative block aspect-[4/3] overflow-hidden rounded-[14px] bg-slate-100 text-left"
                          >
                            <img
                              src={attachment.thumbnailUrl || attachment.publicUrl}
                              alt={attachment.originalFilename || tr('Chat media', 'Média du chat')}
                              className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
                              loading="lazy"
                            />
                            {showOverflow ? (
                              <span className="absolute inset-0 flex items-center justify-center bg-slate-950/55 text-2xl font-black text-white backdrop-blur-[1px]">
                                +{overflowCount}
                              </span>
                            ) : null}
                          </button>
                        );
                      })}
                    </div>
                    <div className={`flex items-center justify-between gap-3 px-3 pb-2 text-[11px] font-bold ${
                      normalizedBubbleType === 'admin_message' ? 'text-violet-100' : 'text-slate-500'
                    }`}>
                      <span>
                        {tr(
                          `${visualGalleryAttachments.length} photos`,
                          `${visualGalleryAttachments.length} photos`
                        )}
                      </span>
                      <span className="text-violet-600">{tr('Tap to view', 'Touchez pour voir')}</span>
                    </div>
                  </div>
                ) : null}
                {stackedMessageAttachments.length ? (
                  <div className="mt-2.5 grid gap-2">
                    {stackedMessageAttachments.map((attachment) => {
                      const isExpired = attachment.status === 'expired' || !attachment.publicUrl;
                      const isVisual = isVisualAttachment(attachment);
                      const previewIndex = Math.max(
                        0,
                        visualGalleryAttachments.findIndex((visualAttachment) => (
                          String(visualAttachment.id || visualAttachment.publicUrl || '') === String(attachment.id || attachment.publicUrl || '')
                        ))
                      );
                      return (
                        <div
                          key={attachment.id}
                          className={`overflow-hidden rounded-[18px] border ${
                            isExpired
                              ? normalizedBubbleType === 'admin_message'
                                ? 'border-white/15 bg-white/10'
                                : 'border-slate-200 bg-white/80'
                              : normalizedBubbleType === 'admin_message'
                                ? 'border-white/15 bg-white/8'
                                : 'border-slate-200 bg-white'
                          }`}
                        >
                          {isExpired ? (
                            <div className={`flex items-start gap-3 px-3 py-3 text-sm ${normalizedBubbleType === 'admin_message' ? 'text-white/88' : 'text-slate-600'}`}>
                              <AlertTriangle className={`mt-0.5 h-4 w-4 shrink-0 ${normalizedBubbleType === 'admin_message' ? 'text-white/75' : 'text-amber-500'}`} />
                              <div>
                                <p className="font-semibold">
                                  {isVisual
                                    ? tr('Media expired', 'Média expiré')
                                    : tr('Attachment expired', 'Pièce jointe expirée')}
                                </p>
                                <p className={`mt-1 text-xs ${normalizedBubbleType === 'admin_message' ? 'text-white/70' : 'text-slate-500'}`}>
                                  {isVisual
                                    ? tr('This shared media item was removed automatically after the retention period.', 'Ce média partagé a été supprimé automatiquement après la période de conservation.')
                                    : tr('This shared attachment was removed automatically after the retention period.', 'Cette pièce jointe partagée a été supprimée automatiquement après la période de conservation.')}
                                </p>
                              </div>
                            </div>
                          ) : isVisual ? (
                            <button
                              type="button"
                              onClick={() => openAttachmentPreview(attachment, previewIndex)}
                              className="block w-full text-left"
                            >
                              <img
                                src={attachment.thumbnailUrl || attachment.publicUrl}
                                alt={attachment.originalFilename || tr('Chat media', 'Média du chat')}
                                className="max-h-64 w-full object-cover"
                                loading="lazy"
                              />
                            </button>
                          ) : (
                            <div className={`flex items-start gap-3 px-3 py-3 text-sm ${normalizedBubbleType === 'admin_message' ? 'text-white/88' : 'text-slate-700'}`}>
                              <div className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${
                                normalizedBubbleType === 'admin_message' ? 'bg-white/12 text-white' : 'bg-slate-100 text-slate-500'
                              }`}>
                                <FileBadge className="h-4 w-4" />
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="truncate font-semibold">
                                  {attachment.originalFilename || tr('Attachment', 'Pièce jointe')}
                                </p>
                                <p className={`mt-1 text-xs ${normalizedBubbleType === 'admin_message' ? 'text-white/70' : 'text-slate-500'}`}>
                                  {attachment.mimeType || tr('File attachment', 'Fichier joint')}
                                </p>
                              </div>
                            </div>
                          )}
                          <div className={`flex items-center justify-between gap-3 px-3 py-2 text-[11px] font-semibold ${normalizedBubbleType === 'admin_message' ? 'text-violet-100' : 'text-slate-500'}`}>
                            <span className="truncate">
                              {attachment.originalFilename || (isVisual ? tr('Media attachment', 'Média joint') : tr('Attachment', 'Pièce jointe'))}
                            </span>
                            <span className="shrink-0">
                              {formatAttachmentSize(attachment.fileSize)}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : null}
                {!(marketplaceStateCard?.hideBody || shouldHidePhotoEvidenceBody || (
                  messageAttachments.length &&
                  ['photo attachment', 'media attachment', 'file attachment'].includes(String(message?.body || '').trim().toLowerCase())
                )) ? (
                  <p className={`mt-2 whitespace-pre-wrap ${isShortMarketplaceChatNote ? 'chat-copy-body-compact' : 'chat-copy-body'}`}>{message?.body || '—'}</p>
                ) : null}
                {isFailedPendingMessage ? (
                  <p className={`chat-copy-meta mt-2 ${normalizedBubbleType === 'admin_message' ? 'text-rose-100' : 'text-rose-600'}`}>
                    {String(message?.metadata?.sendFailedMessage || '').trim() || tr('Message failed to send.', 'Le message n’a pas été envoyé.')}
                  </p>
                ) : null}
                <p className={`chat-copy-meta mt-2 ${
                  isInternal
                    ? 'text-amber-700'
                    : isShortMarketplaceChatNote
                      ? normalizedBubbleType === 'admin_message'
                        ? 'text-violet-500'
                        : 'text-slate-400'
                    : normalizedBubbleType === 'admin_message'
                      ? 'text-violet-100'
                      : 'text-slate-400'
                }`}>
                  {formatDateTime(message?.created_at, isFrench)}
                  {isOwn && deliveryLabel ? ` • ${deliveryLabel}` : ''}
                </p>
              </div>
              </div>
            </React.Fragment>
          );
        })}
          </section>
        ) : (
          <div className="rounded-[22px] border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
            {isRentalThread
              ? tr(
                  'This rental timeline will keep updating here. Human coordination messages will appear once someone replies.',
                  'Cette chronologie de location continuera de se mettre à jour ici. Les messages humains apparaîtront dès qu’une personne répondra.'
                )
              : tr('Start the conversation here.', 'Commencez la conversation ici.')}
          </div>
        )}
        <div ref={bottomAnchorRef} aria-hidden="true" />
      </div>

      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-5 bg-[linear-gradient(180deg,rgba(255,255,255,0.96)_0%,rgba(255,255,255,0)_100%)]" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-6 bg-[linear-gradient(0deg,rgba(255,255,255,0.96)_0%,rgba(255,255,255,0)_100%)]" />

      {showJumpToTop || showJumpToLatest ? (
        <div className={`pointer-events-none absolute z-40 flex flex-col gap-2 ${jumpButtonPositionClass}`}>
          {showJumpToTop ? (
            <button
              type="button"
              onClick={scrollToTop}
              className="pointer-events-auto inline-flex h-11 w-11 items-center justify-center rounded-full border border-violet-200/90 bg-white/96 text-violet-700 shadow-[0_18px_36px_rgba(79,70,229,0.18)] ring-1 ring-white/80 backdrop-blur-xl transition hover:-translate-y-0.5 hover:border-violet-300 hover:text-violet-800"
              aria-label={tr('Jump to top', 'Aller en haut')}
              title={tr('Jump to top', 'Aller en haut')}
            >
              <ChevronUp className="h-4 w-4" />
            </button>
          ) : null}
          {showJumpToLatest ? (
            <button
              type="button"
              onClick={scrollToLatest}
              className="pointer-events-auto relative inline-flex h-11 items-center justify-center gap-2 rounded-full border border-violet-200/90 bg-white/96 px-4 text-violet-700 shadow-[0_18px_36px_rgba(79,70,229,0.18)] ring-1 ring-white/80 backdrop-blur-xl transition hover:-translate-y-0.5 hover:border-violet-300 hover:text-violet-800"
              aria-label={tr('Back to latest message', 'Retour au dernier message')}
              title={tr('Back to latest message', 'Retour au dernier message')}
            >
              <ChevronDown className="h-4 w-4" />
              <span className="text-[11px] font-black uppercase tracking-[0.14em]">
                {tr('Latest', 'Dernier')}
              </span>
              {unseenLatestCount > 0 ? (
                <span className="absolute -right-1 -top-1 inline-flex min-h-[1.1rem] min-w-[1.1rem] items-center justify-center rounded-full border border-white/90 bg-rose-500 px-1 text-[10px] font-black leading-none text-white shadow-[0_8px_18px_rgba(244,63,94,0.28)]">
                  {unseenLatestCount > 9 ? '9+' : unseenLatestCount}
                </span>
              ) : null}
            </button>
          ) : null}
        </div>
      ) : null}
      {bookingUiState === 'approved' && canRenterConfirmInThread ? (
        <div className="pointer-events-none fixed bottom-3 left-1/2 z-30 w-[min(calc(100vw-1rem),42rem)] -translate-x-1/2 px-1">
          <div className={`pointer-events-auto rounded-[24px] border bg-white/96 px-4 py-3 shadow-[0_24px_50px_rgba(15,23,42,0.18)] backdrop-blur-xl ${
            bookingHoldState.urgency === 'critical' || bookingHoldState.urgency === 'low'
              ? 'border-rose-200'
              : 'border-violet-200'
          }`}>
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">
                  {tr('Approved by owner', 'Approuvée par le propriétaire')}
                </p>
                <p className="mt-1 text-sm font-black text-slate-950">
                  {isMarketplaceOwnerThread
                    ? tr('Booking approved and chat is open', 'Réservation approuvée et chat ouvert')
                    : tr('Pay now to confirm', 'Payer maintenant pour confirmer')}
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-semibold text-slate-500">
                  <span>
                    {tr('Pay now', 'À payer maintenant')}: {' '}
                    {formatMoney(
                      isMarketplaceOwnerThread ? platformFeeAmount : amountToConfirm,
                      bookingMoneySummary.currencyCode,
                      locale
                    )}
                  </span>
                  <span>{tr('Rental', 'Location')}: {formatMoney(rentalPriceAmount, bookingMoneySummary.currencyCode, locale)}</span>
                  <span>{tr('Deposit held', 'Caution retenue')}: {formatMoney(depositHoldAmount, bookingMoneySummary.currencyCode, locale)}</span>
                </div>
                <p className={`mt-1 text-[11px] font-semibold ${
                  bookingChatGraceState.urgency === 'critical' || bookingChatGraceState.urgency === 'low'
                    ? 'text-rose-600'
                    : 'text-slate-500'
                }`}>
                  {!isMarketplaceOwnerThread ? (
                    <>
                      {tr('You pay now. Remaining is handled at pickup.', 'Vous payez maintenant. Le reste est géré au départ.')}
                      {' '}
                    </>
                  ) : null}
                  {tr('Pickup window ends in', 'La fenêtre de remise se termine dans')} {graceCountdownLabel}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (insufficientWalletAmount) {
                    navigate('/account/revenue', {
                      state: {
                        from: walletActionHref,
                      },
                    });
                    return;
                  }
                  void performMarketplaceAction('confirm_booking');
                }}
                disabled={marketplaceActionBusy === 'confirm_booking' || bookingReferenceMissing}
                className={`inline-flex min-h-[48px] shrink-0 items-center justify-center rounded-full px-5 text-sm font-black text-white transition ${
                  bookingReferenceMissing
                    ? 'cursor-not-allowed bg-slate-300'
                    : bookingHoldState.urgency === 'critical' || bookingHoldState.urgency === 'low' || ctaHighlightActive
                      ? 'animate-pulse bg-rose-600 hover:bg-rose-700'
                      : 'bg-violet-600 hover:bg-violet-700'
                }`}
              >
                {marketplaceActionBusy === 'confirm_booking'
                  ? tr('Confirming…', 'Confirmation…')
                  : insufficientWalletAmount
                    ? tr('Add funds', 'Ajouter des fonds')
                    : tr('Pay now', 'Payer maintenant')}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      </div>

      <div className={composerContainerClass}>
        {showContextualActionBar ? (
          <div
            ref={!showBookingContextCard || isOwnerMarketplaceDecisionView ? bookingActionRef : undefined}
            className={`mb-3 rounded-[24px] border px-4 py-3 shadow-[0_16px_36px_rgba(15,23,42,0.08)] ${contextualActionToneClass}`}
          >
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              {!isOwnerMarketplaceDecisionView ? (
                <div className="min-w-0">
                  <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">
                    {tr('Next action', 'Action suivante')}
                  </p>
                  <p className="mt-1 text-sm font-black text-slate-950">
                    {contextualActionTitle}
                  </p>
                  {contextualActionSummary ? (
                    <p className="mt-1 max-w-[42rem] text-xs font-medium leading-5 text-slate-600">
                      {contextualActionSummary}
                    </p>
                  ) : null}
                </div>
              ) : null}
              <div className="flex flex-wrap gap-2">
                {isVerificationThread && currentSenderRole === 'admin' && nextVerificationPost ? (
                  <>
                <button
                  type="button"
                  onClick={() => void handleVerificationAction('approve_verification', nextVerificationPost.id)}
                  disabled={Boolean(marketplaceActionBusy)}
                  className="inline-flex min-h-[44px] items-center justify-center rounded-full bg-emerald-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-emerald-700 disabled:opacity-60"
                >
                  {marketplaceActionBusy === 'approve_verification'
                    ? tr('Approving…', 'Approbation…')
                    : tr('Approve', 'Approuver')}
                </button>
                <button
                  type="button"
                  onClick={() => void handleVerificationAction('reject_verification', nextVerificationPost.id)}
                  disabled={Boolean(marketplaceActionBusy)}
                  className="inline-flex min-h-[44px] items-center justify-center rounded-full border border-amber-200 bg-white px-4 py-2 text-sm font-bold text-amber-700 transition hover:border-amber-300 hover:bg-amber-50 disabled:opacity-60"
                >
                  {marketplaceActionBusy === 'reject_verification'
                    ? tr('Rejecting…', 'Refus…')
                    : tr('Reject', 'Refuser')}
                </button>
                  </>
                ) : null}
                {canOwnerModerateRequest ? (
                  <>
                <button
                  type="button"
                  onClick={() => void performMarketplaceAction('approve_request')}
                  disabled={Boolean(marketplaceActionBusy)}
                  className="inline-flex min-h-[44px] items-center justify-center rounded-full bg-emerald-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-emerald-700 disabled:opacity-60"
                >
                  {marketplaceActionBusy === 'approve_request'
                    ? tr('Approving…', 'Approbation…')
                    : tr('Approve', 'Approuver')}
                </button>
                <button
                  type="button"
                  onClick={() => void performMarketplaceAction('decline_request')}
                  disabled={Boolean(marketplaceActionBusy)}
                  className="inline-flex min-h-[44px] items-center justify-center rounded-full border border-rose-200 bg-white px-4 py-2 text-sm font-bold text-rose-700 transition hover:border-rose-300 hover:bg-rose-50 disabled:opacity-60"
                >
                  {marketplaceActionBusy === 'decline_request'
                    ? tr('Rejecting…', 'Refus…')
                    : tr('Reject', 'Refuser')}
                </button>
                  </>
                ) : null}
                {canRenterConfirmInThread ? (
                  <button
                type="button"
                onClick={() => {
                  if (insufficientWalletAmount) {
                    navigate('/account/revenue', {
                      state: {
                        from: walletActionHref,
                      },
                    });
                    return;
                  }
                  void performMarketplaceAction('confirm_booking');
                }}
                disabled={marketplaceActionBusy === 'confirm_booking' || bookingReferenceMissing}
                className={`inline-flex min-h-[44px] items-center justify-center rounded-full px-4 py-2 text-sm font-bold text-white transition disabled:opacity-60 ${
                  insufficientWalletAmount
                    ? 'bg-slate-900 hover:bg-slate-950'
                    : bookingHoldState.urgency === 'critical' || bookingHoldState.urgency === 'low'
                      ? 'bg-rose-600 hover:bg-rose-700'
                      : 'bg-violet-600 hover:bg-violet-700'
                }`}
              >
                {marketplaceActionBusy === 'confirm_booking'
                  ? tr('Confirming…', 'Confirmation…')
                  : insufficientWalletAmount
                    ? tr('Add funds', 'Ajouter des fonds')
                    : tr('Confirm booking', 'Confirmer la réservation')}
              </button>
                ) : null}
              </div>
            </div>
            {marketplaceActionError && (!showBookingContextCard || isOwnerMarketplaceDecisionView) ? (
              marketplaceActionHelper ? (
                <div className="mt-3 rounded-[22px] border border-amber-200 bg-amber-50 px-3 py-3 text-amber-950">
                  <p className="text-sm font-bold">{marketplaceActionHelper.title}</p>
                  <p className="mt-1 text-xs font-medium leading-5 text-amber-800">
                    {marketplaceActionHelper.body}
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {marketplaceActionHelper.actionHref ? (
                      <button
                        type="button"
                        onClick={() => navigate(marketplaceActionHelper.actionHref, {
                          state: marketplaceActionHelper.actionState,
                        })}
                        className="inline-flex items-center justify-center rounded-full bg-amber-700 px-3.5 py-2 text-xs font-bold text-white transition hover:bg-amber-800"
                      >
                        {marketplaceActionHelper.actionLabel}
                      </button>
                    ) : null}
                    <span className="text-[11px] font-medium text-amber-700">
                      {marketplaceActionHelper.rawMessage}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">
                  {marketplaceActionError}
                </div>
              )
            ) : null}
          </div>
        ) : null}
        {showThreadComposer ? (
          <>
            {false && showContextualActionBar ? (
              <div className={`mb-3 rounded-[24px] border px-4 py-3 shadow-[0_16px_36px_rgba(15,23,42,0.08)] ${contextualActionToneClass}`}>
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0">
                    <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">
                      {tr('Next action', 'Action suivante')}
                    </p>
                    <p className="mt-1 text-sm font-black text-slate-950">
                      {contextualActionTitle}
                    </p>
                    {contextualActionSummary ? (
                      <p className="mt-1 max-w-[42rem] text-xs font-medium leading-5 text-slate-600">
                        {contextualActionSummary}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {isVerificationThread && currentSenderRole === 'admin' && nextVerificationPost ? (
                      <>
                    <button
                      type="button"
                      onClick={() => void handleVerificationAction('approve_verification', nextVerificationPost.id)}
                      disabled={Boolean(marketplaceActionBusy)}
                      className="inline-flex min-h-[44px] items-center justify-center rounded-full bg-emerald-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-emerald-700 disabled:opacity-60"
                    >
                      {marketplaceActionBusy === 'approve_verification'
                        ? tr('Approving…', 'Approbation…')
                        : tr('Approve', 'Approuver')}
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleVerificationAction('reject_verification', nextVerificationPost.id)}
                      disabled={Boolean(marketplaceActionBusy)}
                      className="inline-flex min-h-[44px] items-center justify-center rounded-full border border-amber-200 bg-white px-4 py-2 text-sm font-bold text-amber-700 transition hover:border-amber-300 hover:bg-amber-50 disabled:opacity-60"
                    >
                      {marketplaceActionBusy === 'reject_verification'
                        ? tr('Rejecting…', 'Refus…')
                        : tr('Reject', 'Refuser')}
                    </button>
                      </>
                    ) : null}
                    {canOwnerModerateRequest ? (
                      <>
                    <button
                      type="button"
                      onClick={() => void performMarketplaceAction('approve_request')}
                      disabled={Boolean(marketplaceActionBusy)}
                      className="inline-flex min-h-[44px] items-center justify-center rounded-full bg-emerald-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-emerald-700 disabled:opacity-60"
                    >
                      {marketplaceActionBusy === 'approve_request'
                        ? tr('Approving…', 'Approbation…')
                        : tr('Approve', 'Approuver')}
                    </button>
                    <button
                      type="button"
                      onClick={() => void performMarketplaceAction('decline_request')}
                      disabled={Boolean(marketplaceActionBusy)}
                      className="inline-flex min-h-[44px] items-center justify-center rounded-full border border-rose-200 bg-white px-4 py-2 text-sm font-bold text-rose-700 transition hover:border-rose-300 hover:bg-rose-50 disabled:opacity-60"
                    >
                      {marketplaceActionBusy === 'decline_request'
                        ? tr('Rejecting…', 'Refus…')
                        : tr('Reject', 'Refuser')}
                    </button>
                      </>
                    ) : null}
                    {canRenterConfirmInThread ? (
                      <button
                    type="button"
                    onClick={() => {
                      if (insufficientWalletAmount) {
                        navigate('/account/revenue', {
                          state: {
                            from: walletActionHref,
                          },
                        });
                        return;
                      }
                      void performMarketplaceAction('confirm_booking');
                    }}
                    disabled={marketplaceActionBusy === 'confirm_booking' || bookingReferenceMissing}
                    className={`inline-flex min-h-[44px] items-center justify-center rounded-full px-4 py-2 text-sm font-bold text-white transition disabled:opacity-60 ${
                      insufficientWalletAmount
                        ? 'bg-slate-900 hover:bg-slate-950'
                        : bookingHoldState.urgency === 'critical' || bookingHoldState.urgency === 'low'
                          ? 'bg-rose-600 hover:bg-rose-700'
                          : 'bg-violet-600 hover:bg-violet-700'
                    }`}
                  >
                    {marketplaceActionBusy === 'confirm_booking'
                      ? tr('Confirming…', 'Confirmation…')
                      : insufficientWalletAmount
                        ? tr('Add funds', 'Ajouter des fonds')
                        : tr('Confirm booking', 'Confirmer la réservation')}
                  </button>
                    ) : null}
                  </div>
                </div>
              </div>
            ) : null}
            {typingUsers.length > 0 ? (
              <div className="mb-2">
                <div className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-500 chat-presence-pill">
                  <span>{typingLabel}</span>
                  <span className="inline-flex items-center gap-1">
                    {[0, 1, 2].map((dot) => (
                      <span
                        key={dot}
                        className="h-1.5 w-1.5 rounded-full bg-violet-500 animate-bounce"
                        style={{ animationDelay: `${dot * 0.16}s`, animationDuration: '0.9s' }}
                      />
                    ))}
                  </span>
                </div>
              </div>
            ) : null}
            {allowInternalNotes ? (
              <div className={`mb-3 flex flex-wrap items-center gap-3 ${shouldUseFloatingFooter ? 'justify-start' : ''}`}>
                <span className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">
                  {isDirectStaffThread ? tr('Channel', 'Canal') : tr('Reply type', 'Type de réponse')}
                </span>
                {isDirectStaffThread ? (
                  <div className="inline-flex flex-wrap items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm">
                    {tr('Internal team thread', "Fil d’équipe interne")}
                  </div>
                ) : (
                  <div className="inline-flex flex-wrap items-center gap-1 rounded-full border border-slate-200 bg-white p-1 shadow-sm">
                    {[
                      ['customer', tr('Public reply', 'Réponse publique')],
                      ['internal', tr('Team note', "Note d’équipe")],
                    ].map(([mode, label]) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => setComposerMode(mode)}
                        className={`inline-flex items-center rounded-full px-3 py-1.5 text-sm font-semibold transition ${
                          composerMode === mode
                            ? mode === 'internal'
                              ? 'bg-slate-900 text-white'
                              : 'bg-violet-600 text-white'
                            : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                )}
                <p className="text-xs font-medium text-slate-500">
                  {composerAudienceSummary}
                </p>
              </div>
            ) : null}
            {isAdminReadOnlyMarketplaceThread && !showThreadComposer ? (
              <div className="mb-3 rounded-[20px] border border-amber-200 bg-amber-50/80 px-4 py-3 text-sm font-medium text-amber-800">
                {tr(
                  'This renter-owner marketplace chat is read-only in admin. Review it here, but keep the conversation between the owner and renter.',
                  'Ce chat marketplace locataire-propriétaire est en lecture seule côté admin. Consultez-le ici, mais laissez la conversation entre le propriétaire et le locataire.'
                )}
              </div>
            ) : null}
            {marketplaceModerationChatLocked && !showThreadComposer ? (
              <div className="mb-3 rounded-[20px] border border-sky-200 bg-sky-50/80 px-4 py-3 text-sm font-medium text-sky-900">
                {marketplaceModerationProgress?.reviewState === 'approved'
                  ? tr(
                      'This thread is now a status history. Admin approval is complete, so the next step is publishing the listing.',
                      "Ce fil est maintenant un historique de statut. L'approbation admin est terminée, la prochaine étape consiste à publier l'annonce."
                    )
                  : marketplaceModerationProgress?.reviewState === 'live'
                    ? tr(
                        'This thread is now a status history. The listing is already live on the marketplace.',
                        "Ce fil est maintenant un historique de statut. L'annonce est déjà en ligne sur la marketplace."
                      )
                    : marketplaceModerationProgress?.reviewState === 'changes_requested'
                      ? tr(
                          'This thread now reflects the latest review feedback. Update the listing from the setup flow, then send the review again.',
                          "Ce fil reflète maintenant le dernier retour de revue. Mettez l'annonce à jour depuis le parcours, puis renvoyez la revue."
                        )
                      : marketplaceModerationProgress?.reviewState === 'ready_for_review'
                        ? tr(
                            'This thread will start showing status history after you send the full listing review.',
                            "Ce fil commencera à afficher l'historique de statut après l'envoi de la revue complète."
                          )
                        : tr(
                            'This thread is read-only while admin review is in progress. Follow the status history here.',
                            "Ce fil est en lecture seule pendant la revue admin. Suivez ici l'historique de statut."
                          )}
              </div>
            ) : null}
            {replyModeActive && replyingToMessage ? (
              <div className="mb-3 rounded-[20px] border border-violet-200 bg-violet-50/80 px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[11px] font-black uppercase tracking-[0.16em] text-violet-600">
                      {tr('Replying to', 'Réponse à')}
                    </p>
                    <p className="mt-1 truncate text-sm font-bold text-slate-900">
                      {buildReplyPreview(replyingToMessage)?.senderName || tr('Message', 'Message')}
                    </p>
                    <p className="mt-1 line-clamp-2 text-sm text-slate-500">
                      {buildReplyPreview(replyingToMessage)?.body || '—'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setReplyingToMessage(null);
                      setReplyModeActive(false);
                    }}
                    className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-violet-200 bg-white text-slate-500 transition hover:text-violet-700"
                    aria-label={tr('Cancel reply', 'Annuler la réponse')}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ) : null}
            {draftAttachments.length ? (
              <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
                {draftAttachments.map((attachment) => (
                  <div
                    key={attachment.id}
                    className="relative h-16 w-16 shrink-0 overflow-hidden rounded-2xl border border-violet-200 bg-white"
                  >
                    {attachment.previewUrl ? (
                      <img
                        src={attachment.previewUrl}
                        alt={attachment.name || tr('Pending photo', 'Photo en attente')}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-violet-50 text-violet-500">
                        <ImagePlus className="h-5 w-5" />
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => removeDraftAttachment(attachment.id)}
                      className="absolute right-1 top-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-slate-950/70 text-white transition hover:bg-slate-950"
                      aria-label={tr('Remove photo', 'Supprimer la photo')}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
            <div className={`relative overflow-hidden rounded-[18px] border px-2.5 py-0.5 shadow-[0_10px_22px_rgba(15,23,42,0.09)] sm:rounded-[20px] sm:px-3 sm:py-1 ${composerShellClass} ${shouldUseFloatingFooter ? 'shadow-[0_16px_30px_rgba(15,23,42,0.12)] ring-1 ring-white/70' : ''}`}>
              <div className={`pointer-events-none absolute inset-x-5 top-0 h-px ${composerAccentClass}`} />
              <div className="flex items-start gap-1.5 sm:gap-2">
                <div className="flex min-w-0 flex-1 items-start gap-2 sm:gap-2.5">
                  <span className={`mt-[0.22rem] inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full sm:mt-[0.24rem] sm:h-6 sm:w-6 ${composerIconClass}`}>
                    <PenSquare className="h-3 w-3" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="mb-0 flex translate-y-[1px] flex-wrap items-center gap-1.5 sm:gap-2">
                      {roleViewLabel ? (
                        <span className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">
                          {roleViewLabel}
                        </span>
                      ) : null}
                      {!allowInternalNotes ? (
                        <span className="text-[11px] font-medium text-slate-500">
                          {composerAudienceSummary}
                        </span>
                      ) : null}
                    </div>
                    <textarea
                      ref={composerTextareaRef}
                      value={composerText}
                      onChange={(event) => setComposerText(event.target.value)}
                      onKeyDown={handleComposerKeyDown}
                      placeholder={
                        allowInternalNotes && composerMode === 'internal'
                          ? tr('Write an internal note…', 'Écrivez une note interne…')
                          : tr('Write a public message…', 'Écrivez un message public…')
                      }
                      className={`w-full resize-none bg-transparent pb-0 pt-[0.14rem] text-sm leading-[1.15rem] text-slate-900 outline-none transition placeholder:text-slate-400 ${shouldUseFloatingFooter ? 'min-h-[1.2rem] sm:min-h-[1.55rem]' : compactMode ? 'min-h-[0.82rem]' : 'min-h-[0.82rem] sm:min-h-[1.15rem]'}`}
                    />
                    <div className="-translate-y-[1px] mt-0 flex items-center justify-end gap-2.5 sm:mt-0.5 sm:gap-3">
                      <div className="flex items-center gap-2.5 sm:gap-3">
                        <input
                          ref={albumInputRef}
                          type="file"
                          accept="image/*"
                          multiple
                          className="hidden"
                          onChange={(event) => {
                            handleAttachmentSelection(event.target.files);
                            event.target.value = '';
                          }}
                        />
                        <button
                          type="button"
                          onClick={handleOpenAlbumPicker}
                          disabled={sending || draftAttachments.length >= maxDraftAttachments}
                          className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border shadow-sm transition disabled:opacity-50 sm:h-8 sm:w-8 ${
                              canSendPhotos
                                ? composerAttachmentButtonClass
                                : 'border-slate-200 bg-slate-100 text-slate-400'
                          }`}
                          aria-label={tr('Choose from photo album', 'Choisir depuis l’album photo')}
                          title={tr('Choose from photo album', 'Choisir depuis l’album photo')}
                        >
                          <ImagePlus className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                        </button>
                        {messagingPolicy.messagingAllowCameraCapture ? (
                          <button
                            type="button"
                            onClick={handleOpenCameraCapture}
                            disabled={sending || draftAttachments.length >= maxDraftAttachments}
                            className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border shadow-sm transition disabled:opacity-50 sm:h-8 sm:w-8 ${
                              canSendPhotos
                                ? composerAttachmentButtonClass
                                : 'border-slate-200 bg-slate-100 text-slate-400'
                            }`}
                            aria-label={tr('Take photo', 'Prendre une photo')}
                            title={tr('Take photo', 'Prendre une photo')}
                          >
                            <Camera className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                          </button>
                        ) : null}
                      </div>
                      <button
                        type="button"
                        onClick={handleSend}
                        disabled={sending || (!composerText.trim() && !draftAttachments.length)}
                        className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white transition disabled:opacity-60 sm:h-8 sm:w-8 ${composerActionButtonClass}`}
                        aria-label={sending ? tr('Sending…', 'Envoi…') : tr('Send message', 'Envoyer le message')}
                        title={sending ? tr('Sending…', 'Envoi…') : tr('Send message', 'Envoyer le message')}
                      >
                        <Send className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                        <span className="sr-only">
                          {sending ? tr('Sending…', 'Envoi…') : tr('Send message', 'Envoyer le message')}
                        </span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            {sendError ? (
              <div className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
                {sendError}
              </div>
            ) : null}
          </>
        ) : (
          showBookingContextCard ? null : (
            <div className="rounded-[22px] border border-dashed border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-500">
              {verificationChatLocked
                ? tr('We’ll update you in this thread.', 'Nous vous tiendrons informé dans ce fil.')
                : tr('Waiting for approval. You’ll be able to continue once approved.', 'En attente d’approbation. Vous pourrez continuer une fois approuvé.')}
            </div>
          )
        )}
      </div>

      {showCameraCapture ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/60 p-3 pt-[max(0.75rem,env(safe-area-inset-top,0px))] pb-[max(0.75rem,env(safe-area-inset-bottom,0px))] backdrop-blur-sm sm:p-4">
          <button
            type="button"
            className="absolute inset-0"
            onClick={() => setShowCameraCapture(false)}
            aria-label={tr('Close camera', 'Fermer la caméra')}
          />
          <div className="relative z-10 w-full max-w-md max-h-[calc(100dvh-max(1.5rem,env(safe-area-inset-top,0px)+env(safe-area-inset-bottom,0px)))] overflow-y-auto rounded-[28px] border border-violet-100 bg-white p-4 shadow-[0_30px_80px_rgba(15,23,42,0.28)]">
            <button
              type="button"
              onClick={() => setShowCameraCapture(false)}
              className="absolute right-4 top-4 inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition hover:text-violet-700"
              aria-label={tr('Close camera', 'Fermer la caméra')}
            >
              <X className="h-4 w-4" />
            </button>
            <PhotoCapture
              sessionToken={cameraSessionToken}
              requirements={{ minPhotos: 1, maxPhotos: 1 }}
              hideHeader
              hideInstructions
              squarePreview
              captureLabel={tr('Take Photo', 'Prendre une photo')}
              submitLabel={tr('Use this photo', 'Utiliser cette photo')}
              retakeLabel={tr('Retake photo', 'Reprendre la photo')}
              loadingLabel={tr('Initializing camera…', 'Initialisation de la caméra…')}
              onPhotosCapture={(files) => {
                handleAttachmentSelection(files);
                setShowCameraCapture(false);
              }}
              onError={(message) => {
                setSendError(message || tr('Camera access failed.', "L'accès à la caméra a échoué."));
              }}
            />
          </div>
        </div>
      ) : null}

      {imagePreviewModal}
    </div>
  );
};

export default ConversationThread;
