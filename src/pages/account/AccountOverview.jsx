import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  CalendarClock,
  CarFront,
  MessageSquare,
  ShieldCheck,
} from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import i18n from '../../i18n';
import CustomerExperienceService from '../../services/CustomerExperienceService';
import BusinessMarketplaceService from '../../services/BusinessMarketplaceService';
import VerificationService from '../../services/VerificationService';
import MessageService from '../../services/MessageService';
import { resolveManagedAccountType } from '../../utils/accountType';
import {
  getMarketplaceMoneyBreakdown,
  getMarketplaceRequestDisplay,
  isMarketplaceChatUnlocked,
  isMarketplaceRequestOpen,
} from '../../utils/marketplaceRequestState';
import { getCurrentLocationPath } from '../../utils/navigationReturn';
import StatusChip from '../../components/account/StatusChip';
import ActionItem from '../../components/account/ActionItem';
import AccountWorkspaceHero from '../../components/account/AccountWorkspaceHero';
import AccountWorkspaceSectionHeader from '../../components/account/AccountWorkspaceSectionHeader';
import { shouldSuppressBlockingPageLoader } from '../../config/navigationShells';
import {
  getMessageNotificationPreferences,
  getUnreadMessageThreadBuckets,
} from '../../utils/messageNotificationPreferences';

const LAST_OWNER_VEHICLE_ID_KEY = 'saharax_last_owner_vehicle_id';
const LAST_OWNER_VEHICLE_COUNT_KEY = 'saharax_last_owner_vehicle_count';
const OWNER_VEHICLE_IDS_KEY = 'saharax_owner_vehicle_ids';

const buildOwnerVehicleStorageKey = (baseKey, userId = '') => {
  const normalizedUserId = String(userId || '').trim();
  return normalizedUserId ? `${baseKey}:${normalizedUserId}` : baseKey;
};

const getKnownOwnerVehicleCount = (userId = '') => {
  if (typeof window === 'undefined') return 0;

  try {
    const savedCount = Number.parseInt(
      window.localStorage.getItem(buildOwnerVehicleStorageKey(LAST_OWNER_VEHICLE_COUNT_KEY, userId)) || '0',
      10
    );
    const savedIds = JSON.parse(
      window.localStorage.getItem(buildOwnerVehicleStorageKey(OWNER_VEHICLE_IDS_KEY, userId)) || '[]'
    );
    const idCount = Array.isArray(savedIds) ? savedIds.map((item) => String(item || '').trim()).filter(Boolean).length : 0;
    const hasLastVehicle = Boolean(
      String(window.localStorage.getItem(buildOwnerVehicleStorageKey(LAST_OWNER_VEHICLE_ID_KEY, userId)) || '').trim()
    );
    return Math.max(Number.isFinite(savedCount) ? savedCount : 0, idCount, hasLastVehicle ? 1 : 0);
  } catch {
    return 0;
  }
};

const formatDateTime = (value, locale) => {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) return null;
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(value);
};

const formatMoney = (amount, currencyCode = 'MAD', locale = 'en') =>
  new Intl.NumberFormat(locale === 'fr' ? 'fr-MA' : 'en-MA', {
    maximumFractionDigits: 0,
  }).format(Number(amount || 0)) + ` ${currencyCode}`;

const ProfileEntryCard = ({ to, state, eyebrow, value, label, ctaLabel }) => (
  <Link
    to={to}
    state={state}
    className="group rounded-[1.55rem] border border-slate-200 bg-white px-4 py-4 shadow-[0_14px_34px_rgba(15,23,42,0.05)] transition hover:border-violet-200 hover:shadow-[0_18px_40px_rgba(91,33,182,0.08)]"
  >
    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{eyebrow}</p>
    <p className="mt-3 text-3xl font-black tracking-tight text-slate-950">{value}</p>
    <p className="mt-2 text-sm text-slate-600">{label}</p>
    <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-violet-700 transition group-hover:border-violet-200 group-hover:bg-violet-50">
      <span>{ctaLabel}</span>
      <ArrowRight className="h-4 w-4" />
    </div>
  </Link>
);

const getLatestVerificationByType = (requests = []) =>
  requests.reduce((acc, request) => {
    if (!request?.verification_type) return acc;
    if (!acc[request.verification_type]) {
      acc[request.verification_type] = request;
    }
    return acc;
  }, {});

const getTrustProgress = (profile, verificationStatus, latestByType = {}) => {
  const normalized = String(verificationStatus || '').toLowerCase();
  if (normalized === 'approved') return 100;
  if (['pending', 'in_review'].includes(normalized)) {
    return Math.max(40, 10 + (profile?.fullName ? 10 : 0) + (profile?.email ? 10 : 0) + (profile?.phone ? 10 : 0));
  }
  if (['rejected', 'suspended', 'expired'].includes(normalized)) {
    return Math.max(40, 10 + (profile?.fullName ? 10 : 0) + (profile?.email ? 10 : 0) + (profile?.phone ? 10 : 0));
  }

  let progress = 0;
  if (profile?.fullName) progress += 10;
  if (profile?.email) progress += 10;
  if (profile?.phone) progress += 10;
  if (latestByType?.driver_license) progress += 15;
  if (latestByType?.profile_id) progress += 15;
  if (String(latestByType?.driver_license?.status || '').toLowerCase() === 'approved') progress += 20;
  if (String(latestByType?.profile_id?.status || '').toLowerCase() === 'approved') progress += 20;
  if (
    String(latestByType?.driver_license?.status || '').toLowerCase() === 'pending' ||
    String(latestByType?.profile_id?.status || '').toLowerCase() === 'pending'
  ) {
    progress += 10;
  }

  return Math.min(progress, 100);
};

const getIdentityStatus = (verificationStatus, progress, latestByType, tr) => {
  const normalized = String(verificationStatus || '').toLowerCase();
  if (
    normalized === 'approved' ||
    (
      String(latestByType?.driver_license?.status || '').toLowerCase() === 'approved' &&
      String(latestByType?.profile_id?.status || '').toLowerCase() === 'approved'
    ) ||
    progress >= 100
  ) {
    return { label: tr('Verified', 'Vérifié'), tone: 'success' };
  }
  if (
    ['rejected', 'suspended'].includes(String(latestByType?.driver_license?.status || '').toLowerCase()) ||
    ['rejected', 'suspended'].includes(String(latestByType?.profile_id?.status || '').toLowerCase())
  ) {
    return { label: tr('Needs changes', 'À corriger'), tone: 'danger' };
  }
  if (progress > 35) {
    return { label: tr('Pending', 'En attente'), tone: 'warning' };
  }
  return { label: tr('Unverified', 'Non vérifié'), tone: 'neutral' };
};

const getRequestDrivenVerificationStatus = (latestByType = {}) => {
  const driverStatus = String(latestByType?.driver_license?.status || '').trim().toLowerCase();
  const profileStatus = String(latestByType?.profile_id?.status || '').trim().toLowerCase();
  const statuses = [driverStatus, profileStatus].filter(Boolean);

  if (!statuses.length) return '';
  if (driverStatus === 'approved' && profileStatus === 'approved') return 'approved';
  if (statuses.some((status) => ['rejected', 'suspended'].includes(status))) return 'rejected';
  if (statuses.includes('expired')) return 'expired';
  if (statuses.some((status) => ['pending', 'in_review'].includes(status))) return 'pending';
  return statuses[0] || '';
};

const resolveEffectiveVerificationStatus = ({
  requestDrivenStatus = '',
  userProfileStatus = '',
  snapshotProfileStatus = '',
  authMetadataStatus = '',
  appMetadataStatus = '',
} = {}) => {
  const normalizedStatuses = [
    requestDrivenStatus,
    userProfileStatus,
    snapshotProfileStatus,
    authMetadataStatus,
    appMetadataStatus,
  ]
    .map((value) => String(value || '').trim().toLowerCase())
    .filter(Boolean);

  if (!normalizedStatuses.length) return '';
  if (normalizedStatuses.includes('approved') || normalizedStatuses.includes('verified')) return 'approved';
  if (normalizedStatuses.includes('expired')) return 'expired';
  if (normalizedStatuses.includes('rejected') || normalizedStatuses.includes('suspended')) return 'rejected';
  if (normalizedStatuses.includes('pending') || normalizedStatuses.includes('in_review')) return 'pending';
  return normalizedStatuses[0];
};

const getBookingStatus = (status, tr) => {
  const normalized = String(status || '').toLowerCase();
  if (['active', 'ready_to_finish', 'completed', 'closed'].includes(normalized)) {
    return { label: tr('Active', 'Active'), tone: 'success' };
  }
  if (['expired', 'no_show_review'].includes(normalized)) {
    return { label: tr('Expired', 'Expirée'), tone: 'neutral' };
  }
  if (['scheduled', 'confirmed', 'pending'].includes(normalized)) {
    return { label: tr('Pending', 'En attente'), tone: 'warning' };
  }
  return { label: tr('Neutral', 'Neutre'), tone: 'neutral' };
};

const getTourStatus = (status, tr) => {
  const normalized = String(status || '').toLowerCase();
  if (['active', 'started', 'running'].includes(normalized)) {
    return { label: tr('Active', 'Active'), tone: 'success' };
  }
  if (['completed', 'closed'].includes(normalized)) {
    return { label: tr('Completed', 'Terminée'), tone: 'neutral' };
  }
  if (['cancelled', 'canceled', 'no_show'].includes(normalized)) {
    return { label: tr('Cancelled', 'Annulée'), tone: 'neutral' };
  }
  return { label: tr('Scheduled', 'Programmée'), tone: 'warning' };
};

const getMarketplaceStatus = (status, tr) => {
  const normalized = String(status || '').toLowerCase();
  const displayState = getMarketplaceRequestDisplay(normalized, tr);
  return {
    label: displayState.shortLabel || displayState.label,
    tone: ['pending', 'countered', 'pre_approved'].includes(normalized) ? 'warning' : 'neutral',
  };
};

const AccountOverview = () => {
  const location = useLocation();
  const isFrench = i18n.resolvedLanguage === 'fr';
  const locale = isFrench ? 'fr' : 'en';
  const tr = (en, fr) => (isFrench ? fr : en);
  const navigate = useNavigate();
  const { user, userProfile, loading: authLoading, initialized: authInitialized } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [snapshot, setSnapshot] = useState(null);
  const [ownerData, setOwnerData] = useState({ vehicles: [], requests: [] });
  const [customerRequests, setCustomerRequests] = useState([]);
  const [verificationRequests, setVerificationRequests] = useState([]);
  const [tourBookings, setTourBookings] = useState([]);
  const [messageThreads, setMessageThreads] = useState([]);
  const [dbOwnerVehicleCount, setDbOwnerVehicleCount] = useState(0);
  const managedAccountType = resolveManagedAccountType({
    account_type:
      userProfile?.accountType ||
      user?.user_metadata?.account_type ||
      user?.app_metadata?.account_type ||
      '',
    data_source:
      userProfile?.dataSource ||
      user?.user_metadata?.account_source ||
      user?.app_metadata?.account_source ||
      '',
  });
  const knownOwnerVehicleCount = useMemo(() => getKnownOwnerVehicleCount(user?.id), [user?.id]);
  const effectiveOwnerVehicleCount = Math.max(knownOwnerVehicleCount, dbOwnerVehicleCount);
  const currentPath = useMemo(() => getCurrentLocationPath(location), [location]);
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (!user) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError('');

        const [
          accountSnapshot,
          customerRequestsResult,
          ownerVehiclesResult,
          ownerRequestsResult,
          verificationResult,
          toursResult,
          messageThreadsResult,
        ] = await Promise.all([
          CustomerExperienceService.getCustomerAccountSnapshot(user, { forceRefresh: true }),
          CustomerExperienceService.getCustomerMarketplaceRequests(user),
          managedAccountType !== 'business_owner' ? BusinessMarketplaceService.getOwnerVehicles(user.id) : Promise.resolve({ vehicles: [] }),
          managedAccountType !== 'business_owner' ? BusinessMarketplaceService.getOwnerRequests(user.id, 'all') : Promise.resolve({ requests: [] }),
          VerificationService.getEntityVerificationSummary('user', user.id).catch(() => ({ requests: [] })),
          CustomerExperienceService.getCustomerTourHistory(user).catch(() => []),
          MessageService.listSharedThreads({ limit: 50 }).catch(() => ({ threads: [] })),
        ]);

        if (cancelled) return;
        setSnapshot(accountSnapshot);
        setCustomerRequests(Array.isArray(customerRequestsResult) ? customerRequestsResult : []);
        setVerificationRequests(Array.isArray(verificationResult?.requests) ? verificationResult.requests : []);
        setTourBookings(Array.isArray(toursResult) ? toursResult : []);
        setMessageThreads(Array.isArray(messageThreadsResult?.threads) ? messageThreadsResult.threads : []);
        setDbOwnerVehicleCount(Array.isArray(ownerVehiclesResult?.vehicles) ? ownerVehiclesResult.vehicles.length : 0);
        setOwnerData({
          vehicles: ownerVehiclesResult?.vehicles || [],
          requests: ownerRequestsResult?.requests || [],
        });
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError?.message || tr('Unable to load your workspace overview right now.', 'Impossible de charger votre vue générale pour le moment.'));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [managedAccountType, user?.id, userProfile?.accountType, userProfile?.role, isFrench]);

  const profile = snapshot?.profile || {};
  const notificationPreferences = useMemo(
    () => getMessageNotificationPreferences({ userProfile, user }),
    [user, userProfile]
  );
  const activeBookings = snapshot?.active || [];
  const upcomingBookings = snapshot?.upcoming || [];
  const tourRows = Array.isArray(tourBookings) ? tourBookings : [];

  const ownerVehicles = ownerData.vehicles || [];
  const ownerRequests = ownerData.requests || [];
  const latestVerificationByType = useMemo(() => getLatestVerificationByType(verificationRequests), [verificationRequests]);
  const requestDrivenVerificationStatus = useMemo(
    () => getRequestDrivenVerificationStatus(latestVerificationByType),
    [latestVerificationByType]
  );
  const pendingOwnerRequests = ownerRequests.filter((request) => isMarketplaceRequestOpen(request?.requestStatus)).length;
  const effectiveVerificationStatus = useMemo(
    () =>
      resolveEffectiveVerificationStatus({
        requestDrivenStatus: requestDrivenVerificationStatus,
        userProfileStatus: userProfile?.verificationStatus,
        snapshotProfileStatus: profile?.verificationStatus,
        authMetadataStatus: user?.user_metadata?.verification_status,
        appMetadataStatus: user?.app_metadata?.verification_status,
      }),
    [
      requestDrivenVerificationStatus,
      profile?.verificationStatus,
      user?.app_metadata?.verification_status,
      user?.user_metadata?.verification_status,
      userProfile?.verificationStatus,
    ]
  );

  const trustProgress = useMemo(
    () => getTrustProgress(profile, effectiveVerificationStatus, latestVerificationByType),
    [effectiveVerificationStatus, latestVerificationByType, profile]
  );
  const hasPendingVerificationReview = useMemo(
    () =>
      ['pending', 'in_review'].includes(effectiveVerificationStatus) ||
      ['pending', 'in_review'].includes(String(latestVerificationByType?.driver_license?.status || '').toLowerCase()) ||
      ['pending', 'in_review'].includes(String(latestVerificationByType?.profile_id?.status || '').toLowerCase()),
    [effectiveVerificationStatus, latestVerificationByType]
  );
  const hasRejectedVerification = useMemo(
    () =>
      ['rejected', 'suspended', 'expired'].includes(effectiveVerificationStatus) ||
      ['rejected', 'suspended'].includes(String(latestVerificationByType?.driver_license?.status || '').toLowerCase()) ||
      ['rejected', 'suspended'].includes(String(latestVerificationByType?.profile_id?.status || '').toLowerCase()),
    [effectiveVerificationStatus, latestVerificationByType]
  );
  const isVerificationHydrating = useMemo(() => {
    if (authLoading || !authInitialized) return true;
    if (!loading) return false;
    return !effectiveVerificationStatus && Object.keys(latestVerificationByType || {}).length === 0;
  }, [
    effectiveVerificationStatus,
    latestVerificationByType,
    loading,
    authInitialized,
    authLoading,
  ]);
  const identityStatus = isVerificationHydrating
    ? { label: tr('Checking status', 'Vérification en cours'), tone: 'neutral' }
    : getIdentityStatus(effectiveVerificationStatus, trustProgress, latestVerificationByType, tr);

  const nextTour = useMemo(() => {
    if (!tourRows.length) return null;
    const activeTour = tourRows.find((tour) => ['active', 'started', 'running'].includes(String(tour?.status || '').toLowerCase()));
    if (activeTour) return activeTour;
    const candidates = tourRows.filter((tour) => !['completed', 'closed', 'cancelled', 'canceled'].includes(String(tour?.status || '').toLowerCase()));
    const sorted = [...candidates].sort((a, b) => {
      const aTime = (a?.scheduledFor instanceof Date ? a.scheduledFor : a?.createdAt) || 0;
      const bTime = (b?.scheduledFor instanceof Date ? b.scheduledFor : b?.createdAt) || 0;
      return new Date(aTime).getTime() - new Date(bTime).getTime();
    });
    return sorted[0] || null;
  }, [tourRows]);

  const nextMarketplaceRequest = useMemo(() => {
    if (!customerRequests.length) return null;
    const pending = customerRequests.filter((request) => isMarketplaceRequestOpen(request?.requestStatus));
    const sorted = pending.sort((a, b) => new Date(b?.createdAt || 0).getTime() - new Date(a?.createdAt || 0).getTime());
    return sorted[0] || null;
  }, [customerRequests]);
  const nextOwnerRequest = useMemo(() => {
    if (!ownerRequests.length) return null;
    const pending = ownerRequests.filter((request) => isMarketplaceRequestOpen(request?.requestStatus));
    const sorted = [...pending].sort((a, b) => new Date(b?.createdAt || 0).getTime() - new Date(a?.createdAt || 0).getTime());
    return sorted[0] || null;
  }, [ownerRequests]);
  const nextOwnerRequestMoney = useMemo(
    () => getMarketplaceMoneyBreakdown({
      estimatedAmount:
        nextOwnerRequest?.estimatedAmount ||
        nextOwnerRequest?.dailyPrice ||
        nextOwnerRequest?.halfDayPrice ||
        nextOwnerRequest?.hourlyPrice,
      commissionAmount: nextOwnerRequest?.commissionAmount,
    }),
    [
      nextOwnerRequest?.commissionAmount,
      nextOwnerRequest?.dailyPrice,
      nextOwnerRequest?.estimatedAmount,
      nextOwnerRequest?.halfDayPrice,
      nextOwnerRequest?.hourlyPrice,
    ]
  );
  const walletBalance = Number(snapshot?.wallet?.balance || 0);
  const { supportUnreadThreads, customerUnreadThreads } = useMemo(
    () => getUnreadMessageThreadBuckets(messageThreads, notificationPreferences),
    [messageThreads, notificationPreferences]
  );
  const supportUnreadCount = supportUnreadThreads.reduce((total, thread) => total + Number(thread?.unread_count || 0), 0);
  const customerUnreadCount = customerUnreadThreads.reduce((total, thread) => total + Number(thread?.unread_count || 0), 0);
  const supportMessageHref = supportUnreadThreads[0]?.thread_key
    ? `/account/messages?threadKey=${encodeURIComponent(String(supportUnreadThreads[0].thread_key))}`
    : '/account/messages';
  const customerMessageHref = customerUnreadThreads[0]?.thread_key
    ? `/account/messages?threadKey=${encodeURIComponent(String(customerUnreadThreads[0].thread_key))}`
    : '/account/messages';

  const nextActivity = useMemo(() => {
    if (activeBookings.length) {
      return {
        type: 'rental',
        title: tr('Active rental', 'Location active'),
        status: getBookingStatus(activeBookings[0]?.status, tr),
        detail: [activeBookings[0]?.rentalId, activeBookings[0]?.packageName || activeBookings[0]?.selectedPackageName, formatDateTime(activeBookings[0]?.startDate, locale)]
          .filter(Boolean)
          .join(' • '),
        amount: formatMoney(activeBookings[0]?.total, 'MAD', locale),
        imageUrl: activeBookings[0]?.vehicleImageUrl || '',
        href: `/account/rentals/${encodeURIComponent(activeBookings[0]?.id)}`,
        ctaLabel: tr('Open rental', 'Ouvrir la location'),
      };
    }
    if (upcomingBookings.length) {
      return {
        type: 'rental',
        title: tr('Upcoming rental', 'Location à venir'),
        status: getBookingStatus(upcomingBookings[0]?.status, tr),
        detail: [upcomingBookings[0]?.rentalId, upcomingBookings[0]?.packageName || upcomingBookings[0]?.selectedPackageName, formatDateTime(upcomingBookings[0]?.startDate, locale)]
          .filter(Boolean)
          .join(' • '),
        amount: formatMoney(upcomingBookings[0]?.total, 'MAD', locale),
        imageUrl: upcomingBookings[0]?.vehicleImageUrl || '',
        href: `/account/rentals/${encodeURIComponent(upcomingBookings[0]?.id)}`,
        ctaLabel: tr('Open booking', 'Ouvrir la réservation'),
      };
    }
    if (nextTour) {
      return {
        type: 'tour',
        title: tr('Upcoming tour', 'Tour à venir'),
        status: getTourStatus(nextTour?.status, tr),
        detail: [nextTour?.packageName, formatDateTime(nextTour?.scheduledFor, locale)].filter(Boolean).join(' • '),
        imageUrl: '',
        href: `/account/tours/${encodeURIComponent(nextTour?.id)}`,
        ctaLabel: tr('Open tour', 'Ouvrir le tour'),
      };
    }
    if (nextMarketplaceRequest) {
      return {
        type: 'marketplace',
        title: tr('Marketplace request', 'Demande marketplace'),
        status: getMarketplaceStatus(nextMarketplaceRequest?.requestStatus, tr),
        detail: [nextMarketplaceRequest?.listingTitle, formatDateTime(nextMarketplaceRequest?.requestedStartAt, locale)].filter(Boolean).join(' • '),
        imageUrl: nextMarketplaceRequest?.coverImageUrl || '',
        href: `/account/rentals/requests/${encodeURIComponent(String(nextMarketplaceRequest?.id || ''))}`,
        ctaLabel: tr('Open request', 'Ouvrir la demande'),
      };
    }
    if (nextOwnerRequest) {
      return {
        type: 'hosting',
        title: tr('Incoming owner request', 'Demande entrante propriétaire'),
        status: getMarketplaceStatus(nextOwnerRequest?.requestStatus, tr),
        detail: [nextOwnerRequest?.customerName, formatDateTime(nextOwnerRequest?.requestedStartAt ? new Date(nextOwnerRequest.requestedStartAt) : null, locale)]
          .filter(Boolean)
          .join(' • '),
        imageUrl: nextOwnerRequest?.coverImageUrl || '',
        href: `/account/vehicles?requestId=${encodeURIComponent(String(nextOwnerRequest.id))}#requests`,
        ctaLabel: tr('Review request', 'Voir la demande'),
      };
    }
    return null;
  }, [activeBookings, upcomingBookings, nextTour, nextMarketplaceRequest, nextOwnerRequest, locale, tr]);

  const verificationPrimaryCta = useMemo(() => {
    if (isVerificationHydrating) {
      return null;
    }
    if (hasPendingVerificationReview) {
      return {
        label: tr('Review verification', 'Voir la vérification'),
        to: '/account/verification',
        state: { from: currentPath },
      };
    }
    if (hasRejectedVerification) {
      return {
        label: tr('Fix verification', 'Corriger la vérification'),
        to: '/account/verification',
        state: { from: currentPath },
      };
    }
    if (trustProgress < 100) {
      return {
        label: tr('Complete verification', 'Compléter la vérification'),
        to: '/account/verification',
        state: { from: currentPath },
      };
    }
    return {
      label: tr('View verification', 'Voir la vérification'),
      to: '/account/verification',
      state: { from: currentPath },
    };
  }, [currentPath, hasPendingVerificationReview, hasRejectedVerification, isVerificationHydrating, trustProgress, tr]);

  const blockingAction = useMemo(() => {
    if (isVerificationHydrating) {
      return null;
    }
    if (hasPendingVerificationReview) {
      return {
        title: tr('Verification in review', 'Vérification en cours'),
        detail: tr(
          'Your documents were submitted and are waiting for approval.',
          'Vos documents ont été soumis et sont en attente d’approbation.'
        ),
        tone: 'amber',
        to: '/account/verification',
        state: { from: currentPath },
        ctaLabel: tr('View verification', 'Voir la vérification'),
      };
    }
    if (hasRejectedVerification) {
      return {
        title: tr('Update verification', 'Mettre à jour la vérification'),
        detail: tr(
          'One or more documents need changes before approval.',
          'Un ou plusieurs documents doivent être corrigés avant approbation.'
        ),
        tone: 'rose',
        to: '/account/verification',
        state: { from: currentPath },
        ctaLabel: tr('Open verification', 'Ouvrir la vérification'),
      };
    }
    if (trustProgress < 100) {
      return {
        title: tr('Verification needed', 'Vérification requise'),
        detail: tr(
          'Complete verification to continue.',
          'Complétez la vérification pour continuer.'
        ),
        tone: 'violet',
        to: '/account/verification',
        state: { from: currentPath },
        ctaLabel: tr('Complete verification', 'Compléter la vérification'),
      };
    }
    return null;
  }, [currentPath, hasPendingVerificationReview, hasRejectedVerification, isVerificationHydrating, trustProgress, tr]);

  const rentingEntry = useMemo(() => {
    const activeRentingCount = activeBookings.length + upcomingBookings.length + customerRequests.filter((request) => isMarketplaceRequestOpen(request?.requestStatus)).length;
    return {
      value: `${activeRentingCount}`,
      label:
        activeRentingCount > 0
          ? tr('In progress', 'En cours')
          : tr('No active renting', 'Aucune location active'),
      to: '/account/rentals',
      ctaLabel: tr('Open renting', 'Ouvrir location'),
    };
  }, [activeBookings.length, upcomingBookings.length, customerRequests, tr]);

  const hostingEntry = useMemo(() => {
    const hostingCount = effectiveOwnerVehicleCount;
    return {
      value: `${hostingCount}`,
      label:
        pendingOwnerRequests > 0
          ? tr(
              `${hostingCount} vehicle${hostingCount === 1 ? '' : 's'} • ${pendingOwnerRequests} waiting`,
              `${hostingCount} véhicule${hostingCount === 1 ? '' : 's'} • ${pendingOwnerRequests} en attente`
            )
          : hostingCount > 0
            ? tr('Vehicles listed', 'Véhicules listés')
            : tr('Start hosting', 'Commencer'),
      to: hostingCount > 0 ? '/account/vehicles' : '/account/vehicles/new/profile?tab=overview',
      ctaLabel: hostingCount > 0 ? tr('Open hosting', 'Ouvrir hébergement') : tr('Start hosting', 'Commencer'),
    };
  }, [effectiveOwnerVehicleCount, pendingOwnerRequests, tr]);

  const walletEntry = useMemo(() => ({
    value: formatMoney(walletBalance, snapshot?.wallet?.currencyCode || 'MAD', locale),
    label: tr('Payments, payouts, credits', 'Paiements, virements, crédits'),
    to: '/account/revenue',
    ctaLabel: tr('Open wallet', 'Ouvrir le portefeuille'),
  }), [walletBalance, snapshot?.wallet?.currencyCode, locale, tr]);

  const suppressBlockingLoader = shouldSuppressBlockingPageLoader({
    pathname: location.pathname,
    isTransitionFlow: loading,
  });

  if ((authLoading || !authInitialized || loading) && !suppressBlockingLoader) {
    return (
      <div className="space-y-4">
        <div className="h-28 animate-pulse rounded-[1.6rem] border border-slate-200 bg-white" />
        <div className="h-36 animate-pulse rounded-[1.6rem] border border-slate-200 bg-white" />
        <div className="h-32 animate-pulse rounded-[1.6rem] border border-slate-200 bg-white" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <AccountWorkspaceHero
        eyebrow={tr('Profile', 'Profil')}
        title={profile.fullName || userProfile?.fullName || user?.email || tr('Signed in user', 'Utilisateur connecté')}
        description=""
        aside={
          <div className="flex flex-col items-start gap-3 sm:items-end">
            <StatusChip label={identityStatus.label} tone={identityStatus.tone} />
            {verificationPrimaryCta ? (
              <Link
                to={verificationPrimaryCta.to}
                state={verificationPrimaryCta.state}
                className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow-[0_16px_32px_rgba(91,33,182,0.24)] transition hover:translate-y-[-1px]"
              >
                <span>{verificationPrimaryCta.label}</span>
                <ArrowRight className="h-4 w-4" />
              </Link>
            ) : null}
          </div>
        }
      />

      {supportUnreadCount > 0 || (notificationPreferences.customerMessages && customerUnreadCount > 0) ? (
        <section className="rounded-[1.6rem] border border-slate-200 bg-white px-5 py-4 shadow-[0_16px_40px_rgba(15,23,42,0.05)]">
          <AccountWorkspaceSectionHeader
            title={tr('Messages', 'Messages')}
            titleClassName="text-base font-bold text-slate-950"
          />
          <div className="mt-4 space-y-3">
            {supportUnreadCount > 0 ? (
              <ActionItem
                label={tr('Support updates', 'Mises à jour du support')}
                detail={
                  supportUnreadCount === 1
                    ? tr('You have 1 unread support message.', 'Vous avez 1 message support non lu.')
                    : tr(`You have ${supportUnreadCount} unread support messages.`, `Vous avez ${supportUnreadCount} messages support non lus.`)
                }
                to={supportMessageHref}
                state={{ from: currentPath }}
                icon={MessageSquare}
                tone="amber"
                emphasis
              />
            ) : null}
            {notificationPreferences.customerMessages && customerUnreadCount > 0 ? (
              <ActionItem
                label={tr('Customer messages', 'Messages clients')}
                detail={
                  customerUnreadCount === 1
                    ? tr('You have 1 unread customer message.', 'Vous avez 1 message client non lu.')
                    : tr(`You have ${customerUnreadCount} unread customer messages.`, `Vous avez ${customerUnreadCount} messages clients non lus.`)
                }
                to={customerMessageHref}
                state={{ from: currentPath }}
                icon={MessageSquare}
                tone="violet"
              />
            ) : null}
          </div>
        </section>
      ) : null}

      {blockingAction ? (
        <section className="rounded-[1.6rem] border border-slate-200 bg-white px-5 py-4 shadow-[0_16px_40px_rgba(15,23,42,0.05)]">
          <AccountWorkspaceSectionHeader
            title={tr('Next action', 'Prochaine action')}
            titleClassName="text-base font-bold text-slate-950"
          />
          <div className="mt-4">
            <ActionItem
              label={blockingAction.title}
              detail={blockingAction.detail}
              to={blockingAction.to}
              state={blockingAction.state}
              icon={ShieldCheck}
              tone={blockingAction.tone || 'violet'}
              emphasis
            />
          </div>
        </section>
      ) : null}

      <section className="rounded-[1.6rem] border border-slate-200 bg-white px-5 py-4 shadow-[0_16px_40px_rgba(15,23,42,0.05)]">
        <AccountWorkspaceSectionHeader
          title={tr('Your account', 'Votre compte')}
          titleClassName="text-base font-bold text-slate-950"
        />
        <div className="mt-4 grid gap-3 lg:grid-cols-3">
          <ProfileEntryCard
            to={rentingEntry.to}
            state={{ from: currentPath }}
            eyebrow={tr('Renting', 'Location')}
            value={rentingEntry.value}
            label={rentingEntry.label}
            ctaLabel={rentingEntry.ctaLabel}
          />
          <ProfileEntryCard
            to={hostingEntry.to}
            state={{ from: currentPath }}
            eyebrow={tr('Hosting', 'Hébergement')}
            value={hostingEntry.value}
            label={hostingEntry.label}
            ctaLabel={hostingEntry.ctaLabel}
          />
          <ProfileEntryCard
            to={walletEntry.to}
            state={{ from: currentPath }}
            eyebrow={tr('Wallet', 'Portefeuille')}
            value={walletEntry.value}
            label={walletEntry.label}
            ctaLabel={walletEntry.ctaLabel}
          />
        </div>
      </section>

      {error ? (
        <section className="rounded-[1.6rem] border border-rose-200 bg-white px-5 py-4 text-sm text-rose-700 shadow-[0_16px_40px_rgba(15,23,42,0.05)]">
          {error}
        </section>
      ) : null}

      {nextActivity ? (
        <section className="rounded-[1.6rem] border border-violet-200 bg-[linear-gradient(135deg,#ffffff_0%,#faf5ff_100%)] px-5 py-4 shadow-[0_16px_40px_rgba(15,23,42,0.05)]">
          <AccountWorkspaceSectionHeader
            title={tr('Next activity', 'Prochaine activité')}
            titleClassName="text-base font-bold text-slate-950"
          />
          <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
            <div className="flex min-w-0 flex-1 items-start gap-4">
              {nextActivity?.imageUrl ? (
                <div className="h-20 w-20 shrink-0 overflow-hidden rounded-[1.35rem] border border-slate-200 bg-white shadow-sm">
                  <img
                    src={nextActivity.imageUrl}
                    alt={nextActivity?.title || tr('Activity', 'Activité')}
                    className="h-full w-full object-cover"
                  />
                </div>
              ) : (
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-violet-50 text-violet-600 shadow-sm">
                  {nextActivity?.type === 'marketplace' || nextActivity?.type === 'hosting' ? (
                    <MessageSquare className="h-5 w-5" />
                  ) : (
                    <CalendarClock className="h-5 w-5" />
                  )}
                </div>
              )}
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-violet-500">
                  {tr('Next activity', 'Prochaine activité')}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <h2 className="text-lg font-bold text-slate-950">
                    {nextActivity?.title}
                  </h2>
                  {nextActivity?.status ? <StatusChip label={nextActivity.status.label} tone={nextActivity.status.tone} /> : null}
                </div>
                <p className="mt-2 text-sm text-slate-500">
                  {nextActivity?.detail || tr('Open this activity to continue.', 'Ouvrez cette activité pour continuer.')}
                </p>
              </div>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Link
              to={nextActivity?.href || '/account/rentals'}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow-[0_16px_32px_rgba(91,33,182,0.24)] transition hover:translate-y-[-1px]"
            >
              {nextActivity?.ctaLabel || tr('Open activity', 'Ouvrir')}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </section>
      ) : null}
    </div>
  );
};

export default AccountOverview;
