import CustomerExperienceService from './CustomerExperienceService';
import BusinessMarketplaceService from './BusinessMarketplaceService';
import VerificationService from './VerificationService';
import MessageService from './MessageService';
import RentalThreadTimelineService from './RentalThreadTimelineService';
import {
  getMarketplaceRequestDisplay,
  isMarketplaceChatUnlocked,
  normalizeMarketplaceRequestLifecycleStatus,
} from '../utils/marketplaceRequestState';
import { getRentalThreadPresentation } from '../utils/rentalThreadState';
import {
  buildMessageWorkspaceSummary,
  classifyThreadSection,
  getThreadActionLabel,
  createMessageThread,
  MESSAGE_FAMILIES,
  MESSAGE_SENDER_ROLES,
  MESSAGE_THREAD_TYPES,
} from '../utils/messageCenter';
import { isBusinessAccountType, isBusinessOwnerAccountType } from '../utils/accountType';

const normalizeReviewStatus = (status) => String(status || 'pending').trim().toLowerCase();

const toDate = (value) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const getVerificationStatusCopy = (status, reason = '') => {
  const normalized = normalizeReviewStatus(status);

  if (normalized === 'approved') {
    return {
      statusLabel: 'Approved',
      statusTone: 'success',
      latestMessage: 'This document has already been approved by admin.',
      unread: false,
    };
  }

  if (normalized === 'rejected') {
    return {
      statusLabel: 'Needs changes',
      statusTone: 'warning',
      latestMessage: reason || 'Admin requested a clearer replacement document.',
      unread: true,
    };
  }

  if (normalized === 'suspended') {
    return {
      statusLabel: 'Suspended',
      statusTone: 'warning',
      latestMessage: reason || 'This verification was suspended and needs attention.',
      unread: true,
    };
  }

  if (normalized === 'expired') {
    return {
      statusLabel: 'Expired',
      statusTone: 'warning',
      latestMessage: 'This verification expired and should be replaced.',
      unread: true,
    };
  }

  return {
    statusLabel: 'Pending review',
    statusTone: 'pending',
    latestMessage: 'Your document is waiting in the admin verification center.',
    unread: true,
  };
};

const getVerificationDocumentLabel = (verificationType) => {
  const normalized = String(verificationType || '').trim().toLowerCase();
  if (normalized === 'driver_license') return 'Driver license verification';
  if (normalized === 'profile_id') return 'Identity document verification';
  return 'Verification document';
};

const getBookingMessageCopy = (rental) =>
  getRentalThreadPresentation(
    rental,
    rental?.timelineEvents || rental?.timeline_events || RentalThreadTimelineService.buildTimeline(rental),
    { isFrench: false }
  );

const getTourMessageCopy = (tour) => {
  if (tour.remainingAmount > 0) {
    return {
      statusLabel: 'Payment pending',
      statusTone: 'pending',
      latestMessage: `${tour.remainingAmount} MAD still due before the tour starts.`,
      unread: true,
    };
  }

  if (tour.trackingUrl) {
    return {
      statusLabel: 'Tracking ready',
      statusTone: 'neutral',
      latestMessage: 'Live tour tracking is available for this booking.',
      unread: false,
    };
  }

  return {
    statusLabel: tour.statusLabel || 'Scheduled',
    statusTone: 'neutral',
    latestMessage: 'Your meeting details and operator context are ready in this booking.',
    unread: false,
  };
};

const buildVerificationThreads = (verificationResponse) => {
  const requests = Array.isArray(verificationResponse?.requests) ? verificationResponse.requests : [];

    return requests.map((request) => {
      const statusCopy = getVerificationStatusCopy(request?.status, request?.rejection_reason);
      return createMessageThread({
      id: `verification-${request.entity_type || 'user'}-${request.entity_id || request.owner_user_id || request.id}`,
      family: MESSAGE_FAMILIES.verification,
      threadType: MESSAGE_THREAD_TYPES.verification,
      senderRole: MESSAGE_SENDER_ROLES.admin,
      title: 'Verification review',
      subtitle: getVerificationDocumentLabel(request?.verification_type),
      summary: 'Identity documents, admin review, and trust progress stay together in this thread.',
      latestMessage: statusCopy.latestMessage,
      statusLabel: statusCopy.statusLabel,
      statusTone: statusCopy.statusTone,
      href: '/account/verification',
      at: request?.reviewed_at || request?.created_at || null,
      unread: statusCopy.unread,
      metadata: {
        verificationType: request?.verification_type || '',
        requestId: request?.id || '',
        threadKey: `verification:verification:${String(request?.entity_type || 'user').trim().toLowerCase()}:${String(request?.entity_id || request?.owner_user_id || request?.id || '').trim()}`,
      },
    });
  });
};

const buildVerificationSummaryThread = (verificationResponse) => {
  const summary = verificationResponse?.summary || null;
  if (!summary) return null;

  const approvedCount = Number(summary?.approved_count || 0);
  const pendingCount = Number(summary?.pending_count || 0);
  const rejectedCount = Number(summary?.rejected_count || 0);

  const latestMessage =
    rejectedCount > 0
      ? `${rejectedCount} verification item${rejectedCount > 1 ? 's need' : ' needs'} replacement.`
      : pendingCount > 0
        ? `${pendingCount} verification item${pendingCount > 1 ? 's are' : ' is'} waiting for admin review.`
        : approvedCount > 0
          ? 'Your verification file is building trust on the account.'
          : 'Start your identity verification to improve account trust.';

  return createMessageThread({
    id: 'account-trust-status',
    family: MESSAGE_FAMILIES.accountTrust,
    threadType: MESSAGE_THREAD_TYPES.accountStatus,
    senderRole: MESSAGE_SENDER_ROLES.system,
    title: 'Profile trust status',
    subtitle: 'Verification progress and identity credibility',
    summary: 'This thread keeps the overall trust state of the account visible from the same inbox.',
    latestMessage,
    statusLabel:
      rejectedCount > 0 ? 'Needs action' : pendingCount > 0 ? 'Pending review' : approvedCount > 0 ? 'Growing trust' : 'Not started',
    statusTone: rejectedCount > 0 ? 'warning' : pendingCount > 0 ? 'pending' : 'neutral',
    href: '/account/verification',
    at: new Date(),
    unread: rejectedCount > 0 || pendingCount > 0,
  });
};

const dedupeThreads = ({ sharedThreads = [], verificationThreads = [], summaryThread = null }) => {
  const verificationSharedTypes = new Set(
    sharedThreads
      .filter((thread) => thread.family === MESSAGE_FAMILIES.verification)
      .map((thread) => String(thread?.metadata?.verificationType || '').trim().toLowerCase())
      .filter(Boolean)
  );

  const filteredVerificationThreads = verificationThreads.filter((thread) => {
    const verificationType = String(thread?.metadata?.verificationType || '').trim().toLowerCase();
    if (!verificationType) return true;
    return !verificationSharedTypes.has(verificationType);
  });

  return [
    ...sharedThreads,
    ...filteredVerificationThreads,
    summaryThread,
  ].filter(Boolean);
};

const buildRentalThreads = (rentals = []) =>
  rentals.map((rental) => {
    const messageCopy = getBookingMessageCopy(rental);
    const timelineEvents =
      rental?.timelineEvents ||
      rental?.timeline_events ||
      RentalThreadTimelineService.buildTimeline(rental);

    return createMessageThread({
      id: `rental-${rental.id}`,
      family: MESSAGE_FAMILIES.bookings,
      threadType: MESSAGE_THREAD_TYPES.rentalBooking,
      senderRole: MESSAGE_SENDER_ROLES.system,
      title: rental.modelName || rental.rentalId || 'Rental booking',
      subtitle: rental.rentalId || 'Certified rental',
      summary: 'Rental schedule, payment, deposit, and document updates stay connected here.',
      latestMessage: messageCopy.latestMessage,
      statusLabel: messageCopy.statusLabel,
      statusTone: messageCopy.statusTone,
      href: `/account/rentals/${encodeURIComponent(String(rental.id))}`,
      at: rental.startDate || rental.createdAt || null,
      unread: messageCopy.unread,
      thread_key: `rental:${String(rental.id)}`,
      context_type: 'rental',
      context_id: String(rental.id),
      entity_type: 'rental',
      entity_id: String(rental.id),
      timeline_events: timelineEvents,
      metadata: {
        rentalId: rental?.rentalId || rental?.id || '',
        reference: rental?.rentalId || rental?.id || '',
        vehicleName: rental?.modelName || rental?.vehicleName || '',
        startDate: rental?.startDate || null,
        endDate: rental?.endDate || null,
        status: rental?.status || '',
        paymentStatus: rental?.paymentStatus || '',
        outstanding: rental?.outstanding || 0,
        paid: rental?.paid || 0,
        depositMode: rental?.depositMode || '',
        depositAmount: rental?.depositAmount || 0,
        depositReturnedAt: rental?.depositReturnedAt || null,
        approvedExtensions: Array.isArray(rental?.approvedExtensions) ? rental.approvedExtensions : [],
        extensions: Array.isArray(rental?.extensions) ? rental.extensions : [],
        maintenanceCustomerChargeTotal: rental?.maintenanceCustomerChargeTotal || 0,
        fuelCharge: rental?.fuelCharge || 0,
        timelineEvents,
      },
    });
  });

const buildTourThreads = (tours = []) =>
  tours.map((tour) => {
    const messageCopy = getTourMessageCopy(tour);
    return createMessageThread({
      id: `tour-${tour.id}`,
      family: MESSAGE_FAMILIES.tours,
      threadType: MESSAGE_THREAD_TYPES.tourBooking,
      senderRole: MESSAGE_SENDER_ROLES.system,
      title: tour.packageName || tour.groupId || 'Tour booking',
      subtitle: tour.operatorName || 'Tour operator',
      summary: 'Tour schedule, operator details, meeting information, and payments stay together here.',
      latestMessage: messageCopy.latestMessage,
      statusLabel: messageCopy.statusLabel,
      statusTone: messageCopy.statusTone,
      href: `/account/tours/${encodeURIComponent(String(tour.id))}`,
      at: tour.scheduledFor || tour.createdAt || null,
      unread: messageCopy.unread,
    });
  });

const buildMarketplaceCustomerThreads = (requests = []) =>
  requests.map((request) =>
    {
      const lifecycleStatus = normalizeMarketplaceRequestLifecycleStatus(request || 'pending');
      const requestDisplay = getMarketplaceRequestDisplay(lifecycleStatus);
      const chatUnlocked = isMarketplaceChatUnlocked(lifecycleStatus);

      return createMessageThread({
      id: `marketplace-customer-${request.id}`,
      family: MESSAGE_FAMILIES.marketplace,
      threadType: MESSAGE_THREAD_TYPES.marketplaceCustomerRequest,
      senderRole: request?.ownerResponse ? MESSAGE_SENDER_ROLES.owner : MESSAGE_SENDER_ROLES.customer,
      title: request?.listingTitle || 'Marketplace request',
      subtitle: 'Customer and owner request thread',
      summary: chatUnlocked
        ? 'This request is approved and the live conversation is now open here.'
        : 'Request updates and counter-offers stay together here while you wait for the owner decision.',
      latestMessage:
        request?.ownerResponse ||
        request?.counterOffer?.message ||
        request?.customerMessage ||
        'Waiting for the owner to reply to this request.',
      statusLabel: requestDisplay.label,
      statusTone: lifecycleStatus === 'pending' ? 'pending' : 'neutral',
      href: `/account/rentals/requests/${encodeURIComponent(String(request.id))}`,
      at: request?.updatedAt || request?.createdAt || null,
      unread: !request?.ownerResponse && !request?.counterOffer?.message,
      metadata: {
        requestStatus: lifecycleStatus,
        replyEnabled: chatUnlocked,
        readOnlyReason: requestDisplay.readOnlyReason,
        postPaymentChat: chatUnlocked,
      },
      });
    }
  );

const buildMarketplaceOwnerModerationThreads = (vehicles = []) =>
  vehicles
    .filter((vehicle) => vehicle?.adminFeedback || vehicle?.latestOwnerMessage)
    .map((vehicle) =>
      createMessageThread({
        id: `marketplace-moderation-${vehicle.id}`,
        family: MESSAGE_FAMILIES.marketplace,
        threadType: MESSAGE_THREAD_TYPES.marketplaceModeration,
        senderRole:
          vehicle?.latestOwnerMessageSenderType === 'admin' || vehicle?.adminFeedback
            ? MESSAGE_SENDER_ROLES.admin
            : MESSAGE_SENDER_ROLES.system,
        title: vehicle?.title || 'Marketplace listing',
        subtitle: 'Owner listing review and moderation',
        summary: 'Admin review and owner-facing listing updates stay visible in the same thread.',
        latestMessage: vehicle?.latestOwnerMessage || vehicle?.adminFeedback || 'Listing activity is available here.',
        statusLabel:
          String(vehicle?.moderationStatus || '').toLowerCase() === 'changes_requested'
            ? 'Needs changes'
            : 'Listing activity',
        statusTone: String(vehicle?.moderationStatus || '').toLowerCase() === 'changes_requested' ? 'warning' : 'neutral',
        href: vehicle?.id ? `/account/marketplace/vehicles/${encodeURIComponent(String(vehicle.id))}` : '/account/marketplace',
        at: vehicle?.latestOwnerMessageAt || vehicle?.updatedAt || null,
        unread: String(vehicle?.moderationStatus || '').toLowerCase() === 'changes_requested',
      })
    );

const buildMarketplaceOwnerRequestThreads = (requests = []) =>
  requests
    .filter((request) => request?.customerMessage || request?.ownerResponse)
    .map((request) => {
      const lifecycleStatus = normalizeMarketplaceRequestLifecycleStatus(request || 'pending');
      const requestDisplay = getMarketplaceRequestDisplay(lifecycleStatus);
      const chatUnlocked = isMarketplaceChatUnlocked(lifecycleStatus);

      return createMessageThread({
        id: `marketplace-owner-${request.id}`,
        family: MESSAGE_FAMILIES.marketplace,
        threadType: MESSAGE_THREAD_TYPES.marketplaceOwnerRequest,
        senderRole: request?.customerMessage ? MESSAGE_SENDER_ROLES.customer : MESSAGE_SENDER_ROLES.owner,
        title: request?.listingTitle || 'Incoming marketplace request',
        subtitle: request?.customerName || 'Incoming request',
        summary: chatUnlocked
          ? 'This request is approved and the live customer chat is now open here.'
          : 'Customer requests and quick replies stay grouped here until approval unlocks chat.',
        latestMessage: request?.ownerResponse || request?.customerMessage || 'No reply yet.',
        statusLabel: requestDisplay.label,
        statusTone: lifecycleStatus === 'pending' ? 'pending' : 'neutral',
        href: request?.id
          ? `/account/vehicles?requestId=${encodeURIComponent(String(request.id))}#requests`
          : '/account/vehicles',
        at: request?.updatedAt || request?.createdAt || null,
        unread: lifecycleStatus === 'pending',
        metadata: {
          requestStatus: lifecycleStatus,
          replyEnabled: chatUnlocked,
          readOnlyReason: requestDisplay.readOnlyReason,
          postPaymentChat: chatUnlocked,
        },
      });
    });

class MessageCenterService {
  static async getWorkspace(user, userProfile) {
    if (!user?.id) {
      return {
        threads: [],
        summary: buildMessageWorkspaceSummary([]),
      };
    }

    const [
      sharedMessagesResult,
      verificationResult,
      rentalsResult,
      toursResult,
      customerMarketplaceResult,
      ownerVehiclesResult,
      ownerRequestsResult,
    ] = await Promise.allSettled([
      MessageService.listSharedThreads(),
      VerificationService.getEntityVerificationSummary('user', user.id),
      CustomerExperienceService.getCustomerRentalHistory(user),
      CustomerExperienceService.getCustomerTourHistory(user),
      CustomerExperienceService.getCustomerMarketplaceRequests(user),
      BusinessMarketplaceService.getOwnerVehicles(user.id),
      BusinessMarketplaceService.getOwnerRequests(user.id, 'all'),
    ]);

    const sharedThreads =
      sharedMessagesResult.status === 'fulfilled' && Array.isArray(sharedMessagesResult.value?.threads)
        ? sharedMessagesResult.value.threads.map((thread) => MessageService.normalizeSharedThread(thread))
        : [];
    const verificationResponse = verificationResult.status === 'fulfilled' ? verificationResult.value : null;
    const rentals = rentalsResult.status === 'fulfilled' && Array.isArray(rentalsResult.value) ? rentalsResult.value : [];
    const tours = toursResult.status === 'fulfilled' && Array.isArray(toursResult.value) ? toursResult.value : [];
    const customerRequests =
      customerMarketplaceResult.status === 'fulfilled' && Array.isArray(customerMarketplaceResult.value)
        ? customerMarketplaceResult.value
        : [];
    const ownerVehicles =
      ownerVehiclesResult.status === 'fulfilled' && Array.isArray(ownerVehiclesResult.value?.vehicles)
        ? ownerVehiclesResult.value.vehicles
        : [];
    const ownerRequests =
      ownerRequestsResult.status === 'fulfilled' && Array.isArray(ownerRequestsResult.value?.requests)
        ? ownerRequestsResult.value.requests
        : [];

    const threads = [
      ...dedupeThreads({
        sharedThreads,
        verificationThreads: buildVerificationThreads(verificationResponse),
        summaryThread: buildVerificationSummaryThread(verificationResponse),
      }),
      ...buildRentalThreads(rentals),
      ...buildTourThreads(tours),
      ...buildMarketplaceCustomerThreads(customerRequests),
      ...buildMarketplaceOwnerModerationThreads(ownerVehicles),
      ...buildMarketplaceOwnerRequestThreads(ownerRequests),
    ]
      .filter(Boolean)
      .map((thread) => ({
        ...thread,
        section: classifyThreadSection(thread),
        actionLabel: getThreadActionLabel(thread),
      }));

    return {
      threads,
      summary: buildMessageWorkspaceSummary(threads),
      errors: {
        sharedMessages:
          sharedMessagesResult.status === 'rejected'
            ? sharedMessagesResult.reason?.message || 'Unable to load shared messages'
            : '',
        verification: verificationResult.status === 'rejected' ? verificationResult.reason?.message || 'Unable to load verification messages' : '',
        bookings: rentalsResult.status === 'rejected' ? rentalsResult.reason?.message || 'Unable to load booking messages' : '',
        tours: toursResult.status === 'rejected' ? toursResult.reason?.message || 'Unable to load tour messages' : '',
        marketplace:
          customerMarketplaceResult.status === 'rejected' ||
          ownerVehiclesResult.status === 'rejected' ||
          ownerRequestsResult.status === 'rejected'
            ? 'Some marketplace threads could not be loaded right now.'
            : '',
      },
    };
  }
}

export default MessageCenterService;
