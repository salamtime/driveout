import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  CalendarClock,
  CarFront,
  MessageSquare,
  ShieldCheck,
} from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import i18n from '../../i18n';
import CustomerExperienceService from '../../services/CustomerExperienceService';
import BusinessMarketplaceService from '../../services/BusinessMarketplaceService';
import VerificationService from '../../services/VerificationService';
import MessageService from '../../services/MessageService';
import { supabase } from '../../lib/supabase';
import { resolveManagedAccountType } from '../../utils/accountType';
import {
  ACCOUNT_WORKSPACE_MODES,
  deriveAccountWorkspaceIdentity,
  getEffectiveMarketplaceJourneyState,
} from '../../utils/accountProductModel';
import {
  ACCOUNT_JOURNEY_EVENTS,
  getAccountJourneyActionKind,
  trackAccountJourneyEvent,
  trackAccountJourneyEventOnce,
} from '../../utils/accountJourneyAnalytics';
import { getMarketplaceRequestDisplay, isMarketplaceRequestOpen } from '../../utils/marketplaceRequestState';
import { getCurrentLocationPath } from '../../utils/navigationReturn';
import { buildOwnerExecutionWorkspaceHref, getOwnerExecutionActionConfig } from '../../utils/ownerRentalExecutionLinks';
import StatusChip from '../../components/account/StatusChip';
import ActionItem from '../../components/account/ActionItem';
import AccountWorkspaceSectionHeader from '../../components/account/AccountWorkspaceSectionHeader';
import OwnerListingSetupGuide from '../../components/account/OwnerListingSetupGuide';
import { shouldSuppressBlockingPageLoader } from '../../config/navigationShells';
import { buildOwnerListingSetupProgress } from '../../utils/ownerListingSetupProgress';
import {
  getMessageNotificationPreferences,
  getUnreadMessageThreadBuckets,
} from '../../utils/messageNotificationPreferences';
import { normalizeRentalExecutionDraft } from '../../utils/rentalExecutionFlow';
import { normalizeOwnerRentalHistoryRows } from '../../utils/ownerRentalHistory';

const OWNER_OPERATION_REQUEST_CACHE_PREFIX = 'driveout_owner_operation_request:';
const OWNER_EXECUTION_FLOW_KEY = 'driveout_owner_execution_flow';

const buildOwnerExecutionStorageKey = (requestId, userId = '') => {
  const normalizedRequestId = String(requestId || '').trim();
  const normalizedUserId = String(userId || '').trim();
  if (!normalizedRequestId) return '';
  const baseKey = `${OWNER_EXECUTION_FLOW_KEY}:${normalizedRequestId}`;
  return normalizedUserId ? `${baseKey}:${normalizedUserId}` : baseKey;
};

const readCachedOwnerOperationRequests = (userId = '') => {
  if (typeof window === 'undefined') return [];

  const normalizedUserId = String(userId || '').trim();
  const cachedRequests = [];

  try {
    for (let index = 0; index < window.sessionStorage.length; index += 1) {
      const storageKey = window.sessionStorage.key(index);
      if (!storageKey || !storageKey.startsWith(OWNER_OPERATION_REQUEST_CACHE_PREFIX)) continue;

      const rawValue = window.sessionStorage.getItem(storageKey);
      if (!rawValue) continue;

      const cachedRequest = JSON.parse(rawValue);
      if (!cachedRequest?.id) continue;
      if (normalizedUserId && String(cachedRequest?.ownerId || '').trim() !== normalizedUserId) continue;

      const executionStorageKey = buildOwnerExecutionStorageKey(cachedRequest.id, normalizedUserId);
      const persistedExecutionDraft = executionStorageKey
        ? window.localStorage.getItem(executionStorageKey)
        : null;
      const ownerExecution = persistedExecutionDraft
        ? normalizeRentalExecutionDraft(JSON.parse(persistedExecutionDraft))
        : cachedRequest?.ownerExecution || null;

      cachedRequests.push({
        ...cachedRequest,
        ...(ownerExecution ? { ownerExecution } : {}),
        rawRequest: {
          ...(cachedRequest?.rawRequest || {}),
          ...(ownerExecution
            ? {
                counter_offer: {
                  ...((cachedRequest?.rawRequest?.counter_offer && typeof cachedRequest.rawRequest.counter_offer === 'object')
                    ? cachedRequest.rawRequest.counter_offer
                    : {}),
                  owner_execution: ownerExecution,
                },
              }
            : {}),
        },
      });
    }
  } catch {
    return [];
  }

  return cachedRequests;
};

const preloadOwnerOperationsRoute = () => import('./AccountMarketplaceVehicleProfile');

const LAST_OWNER_VEHICLE_ID_KEY = 'driveout_last_owner_vehicle_id';
const LAST_OWNER_VEHICLE_COUNT_KEY = 'driveout_last_owner_vehicle_count';
const OWNER_VEHICLE_IDS_KEY = 'driveout_owner_vehicle_ids';
const OWNER_STORAGE_LEGACY_KEYS = Object.freeze({
  [LAST_OWNER_VEHICLE_ID_KEY]: 'saharax_last_owner_vehicle_id',
  [LAST_OWNER_VEHICLE_COUNT_KEY]: 'saharax_last_owner_vehicle_count',
  [OWNER_VEHICLE_IDS_KEY]: 'saharax_owner_vehicle_ids',
});

const buildOwnerVehicleStorageKey = (baseKey, userId = '') => {
  const normalizedUserId = String(userId || '').trim();
  return normalizedUserId ? `${baseKey}:${normalizedUserId}` : baseKey;
};

const buildOwnerVehicleStorageKeys = (baseKey, userId = '') => {
  const primaryKey = buildOwnerVehicleStorageKey(baseKey, userId);
  const legacyBaseKey = OWNER_STORAGE_LEGACY_KEYS[baseKey];
  const legacyKey = legacyBaseKey ? buildOwnerVehicleStorageKey(legacyBaseKey, userId) : null;
  return [primaryKey, legacyKey].filter(Boolean);
};

const readOwnerVehicleStorageValue = (baseKey, userId = '', fallbackValue = null) => {
  if (typeof window === 'undefined') return fallbackValue;
  const storageKeys = buildOwnerVehicleStorageKeys(baseKey, userId);
  for (const storageKey of storageKeys) {
    const nextValue = window.localStorage.getItem(storageKey);
    if (nextValue !== null) return nextValue;
  }
  return fallbackValue;
};

const getKnownOwnerVehicleCount = (userId = '') => {
  if (typeof window === 'undefined') return 0;

  try {
    const savedCount = Number.parseInt(
      readOwnerVehicleStorageValue(LAST_OWNER_VEHICLE_COUNT_KEY, userId, '0') || '0',
      10
    );
    const savedIds = JSON.parse(
      readOwnerVehicleStorageValue(OWNER_VEHICLE_IDS_KEY, userId, '[]') || '[]'
    );
    const idCount = Array.isArray(savedIds) ? savedIds.map((item) => String(item || '').trim()).filter(Boolean).length : 0;
    const hasLastVehicle = Boolean(
      String(readOwnerVehicleStorageValue(LAST_OWNER_VEHICLE_ID_KEY, userId, '') || '').trim()
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

const buildCustomerRentalHref = (booking) => {
  const rentalId = String(booking?.id || '').trim();
  return rentalId ? `/account/rentals/${encodeURIComponent(rentalId)}` : '/account/rentals';
};

const ProfileEntryCard = ({ to, state, eyebrow, value, label, ctaLabel, onClick, valueVariant = 'metric' }) => (
  <Link
    to={to}
    state={state}
    onClick={onClick}
    className="group flex min-h-[7.25rem] flex-col justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-[0_10px_24px_rgba(15,23,42,0.04)] transition hover:border-violet-200 hover:shadow-[0_14px_28px_rgba(91,33,182,0.07)]"
  >
    <div>
      <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">{eyebrow}</p>
      <div className="mt-2 flex items-end justify-between gap-3">
        <p className={
          valueVariant === 'status'
            ? 'text-xl font-bold tracking-[-0.01em] text-slate-950'
            : 'text-2xl font-black tracking-tight text-slate-950'
        }>
          {value}
        </p>
        <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-50 text-violet-600 transition group-hover:bg-violet-50 group-hover:text-violet-700">
          <ArrowRight className="h-4 w-4" />
        </span>
      </div>
    </div>
    <p className="mt-2 line-clamp-2 text-xs font-semibold leading-5 text-slate-500">{label || ctaLabel}</p>
  </Link>
);

const isMeaningfulOwnerVehicle = (vehicle) => {
  if (!vehicle) return false;
  if (vehicle?.isActive === false) return false;

  const hasIdentity = [
    vehicle?.brandName,
    vehicle?.modelName,
    vehicle?.plateNumber,
    vehicle?.cityName,
    vehicle?.title && vehicle.title !== 'Marketplace vehicle' && vehicle.title !== 'Profil véhicule' && vehicle.title !== 'Vehicle profile' ? vehicle.title : '',
    vehicle?.coverImageUrl,
    vehicle?.listingId,
  ].some((value) => String(value || '').trim());

  const hasCommercialData = [
    vehicle?.hourlyPrice,
    vehicle?.dailyPrice,
    vehicle?.weeklyPrice,
    vehicle?.depositAmount,
  ].some((value) => Number(value || 0) > 0);

  const hasWorkflowState = ['pending_review', 'approved', 'live', 'rejected', 'changes_requested'].includes(
    String(vehicle?.listingStatus || vehicle?.reviewStatus || vehicle?.moderationStatus || '').trim().toLowerCase()
  );

  return hasIdentity || hasCommercialData || hasWorkflowState;
};

const hasVehicleMedia = (vehicle) =>
  Boolean(String(vehicle?.coverImageUrl || '').trim()) ||
  (Array.isArray(vehicle?.media) && vehicle.media.some((item) => String(item?.url || '').trim()));

const hasVehiclePricing = (vehicle) =>
  [
    vehicle?.hourlyPrice,
    vehicle?.dailyPrice,
    vehicle?.halfDayPrice,
    vehicle?.weeklyPrice,
  ].some((value) => Number(value || 0) > 0);

const hasVehicleDeposit = (vehicle) =>
  !(vehicle?.depositAmount === '' || vehicle?.depositAmount === null || vehicle?.depositAmount === undefined) &&
  Number(vehicle?.depositAmount || 0) >= 0;

const getVehicleVerificationStage = (vehicle) => {
  const status = String(
    vehicle?.vehicleVerificationStatus ||
    vehicle?.verificationStatus ||
    vehicle?.rawProfile?.verification_status ||
    ''
  ).trim().toLowerCase();
  const hasExplicitCompletion = vehicle?.vehicleVerificationComplete === true;

  if (['approved', 'verified'].includes(status) && vehicle?.vehicleVerificationComplete !== false) {
    return 'approved';
  }
  if (status === 'approved' && hasExplicitCompletion) {
    return 'approved';
  }
  if (['pending', 'pending_verification', 'in_review'].includes(status)) {
    return 'pending';
  }
  if (['rejected', 'suspended', 'expired'].includes(status)) {
    return 'issue';
  }
  return 'missing';
};

const getOwnerJourneyLabel = (journeyState, tr) => {
  switch (journeyState) {
    case 'live':
      return tr('Live listing', 'Annonce en ligne');
    case 'approved':
      return tr('Approved for publication', 'Approuvé pour publication');
    case 'pending_review':
      return tr('Waiting for admin approval', "En attente de l'approbation admin");
    case 'changes_requested':
      return tr('Changes requested', 'Modifications demandées');
    case 'rejected':
      return tr('Needs owner update', 'À corriger par le propriétaire');
    case 'verification_required':
      return tr('Verification required', 'Vérification requise');
    default:
      return tr('Draft listing', 'Annonce brouillon');
  }
};

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
  userProfileApprovedAt = null,
  snapshotProfileApprovedAt = null,
  authMetadataApprovedAt = null,
  appMetadataApprovedAt = null,
} = {}) => {
  const normalizedPrimaryStatuses = [
    userProfileStatus,
    snapshotProfileStatus,
    authMetadataStatus,
    appMetadataStatus,
  ]
    .map((value) => String(value || '').trim().toLowerCase())
    .filter(Boolean);
  const normalizedRequestDrivenStatus = String(requestDrivenStatus || '').trim().toLowerCase();
  const approvedAtEvidence = [
    userProfileApprovedAt,
    snapshotProfileApprovedAt,
    authMetadataApprovedAt,
    appMetadataApprovedAt,
  ].some((value) => Boolean(value));

  if (
    normalizedPrimaryStatuses.includes('expired') ||
    normalizedRequestDrivenStatus === 'expired'
  ) {
    return 'expired';
  }

  if (
    normalizedPrimaryStatuses.includes('rejected') ||
    normalizedPrimaryStatuses.includes('suspended')
  ) {
    return 'rejected';
  }

  if (
    approvedAtEvidence ||
    normalizedPrimaryStatuses.includes('approved') ||
    normalizedPrimaryStatuses.includes('verified')
  ) {
    return 'approved';
  }

  if (normalizedRequestDrivenStatus === 'approved' || normalizedRequestDrivenStatus === 'verified') {
    return 'approved';
  }

  if (normalizedRequestDrivenStatus === 'rejected' || normalizedRequestDrivenStatus === 'suspended') {
    return 'rejected';
  }

  if (
    normalizedPrimaryStatuses.includes('pending') ||
    normalizedPrimaryStatuses.includes('in_review') ||
    ['pending', 'in_review'].includes(normalizedRequestDrivenStatus)
  ) {
    return 'pending';
  }

  return normalizedPrimaryStatuses[0] || normalizedRequestDrivenStatus || '';
};

const getBookingStatus = (status, tr) => {
  const normalized = String(status || '').toLowerCase();
  if (['completed', 'closed'].includes(normalized)) {
    return { label: tr('Completed', 'Terminée'), tone: 'neutral' };
  }
  if (['active', 'ready_to_finish'].includes(normalized)) {
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
  const tr = useCallback((en, fr) => (isFrench ? fr : en), [isFrench]);
  const { user, userProfile, loading: authLoading, initialized: authInitialized } = useAuth();
  const currentUserId = String(user?.id || '').trim();
  const latestUserRef = useRef(user);
  const overviewLoadInFlightRef = useRef(false);
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
  useEffect(() => {
    latestUserRef.current = user;
  }, [user]);

  const cachedSnapshot = useMemo(
    () => CustomerExperienceService.readCachedCustomerAccountSnapshot(user),
    [user]
  );
  const resolvedSnapshot = snapshot || cachedSnapshot;

  const knownOwnerVehicleCount = useMemo(() => getKnownOwnerVehicleCount(currentUserId), [currentUserId]);
  const effectiveOwnerVehicleCount = Math.max(knownOwnerVehicleCount, dbOwnerVehicleCount);
  const workspaceIdentity = useMemo(
    () =>
      deriveAccountWorkspaceIdentity({
        managedAccountType,
        effectiveOwnerVehicleCount,
        pathname: location.pathname,
      }),
    [effectiveOwnerVehicleCount, location.pathname, managedAccountType]
  );
  const { workspaceMode } = workspaceIdentity;
  const isOwnerWorkspace = workspaceMode !== ACCOUNT_WORKSPACE_MODES.service;
  const currentPath = useMemo(() => getCurrentLocationPath(location), [location]);
  const loadWorkspaceOverview = useCallback(async ({ silent = false } = {}) => {
    const activeUser = latestUserRef.current;

    if (!activeUser || !currentUserId) {
      setLoading(false);
      return null;
    }
    if (overviewLoadInFlightRef.current) {
      return null;
    }

    try {
      overviewLoadInFlightRef.current = true;
      if (!silent) {
        setLoading(true);
      }
      setError('');

      const verificationPromise = VerificationService.getEntityVerificationSummary('user', currentUserId).catch(() => ({ requests: [] }));
      const ownerVehiclesPromise = BusinessMarketplaceService.getOwnerVehicles(currentUserId);
      const ownerRequestsPromise = BusinessMarketplaceService.getOwnerRequests(currentUserId, 'all');

      void verificationPromise.then((verificationResult) => {
        setVerificationRequests(Array.isArray(verificationResult?.requests) ? verificationResult.requests : []);
      });
      void ownerRequestsPromise.then((ownerRequestsResult) => {
        setOwnerData((current) => ({
          ...current,
          requests: ownerRequestsResult?.requests || [],
        }));
      }).catch(() => {});
      void ownerVehiclesPromise.then((ownerVehiclesResult) => {
        const vehicles = ownerVehiclesResult?.vehicles || [];
        setDbOwnerVehicleCount(Array.isArray(vehicles) ? vehicles.length : 0);
        setOwnerData((current) => ({
          ...current,
          vehicles,
        }));
      }).catch(() => {});

      const [
        accountSnapshot,
        customerRequestsResult,
        ownerVehiclesResult,
        ownerRequestsResult,
        verificationResult,
        toursResult,
        messageThreadsResult,
      ] = await Promise.all([
        CustomerExperienceService.getCustomerAccountSnapshot(activeUser, { forceRefresh: true }),
        CustomerExperienceService.getCustomerMarketplaceRequests(activeUser),
        ownerVehiclesPromise,
        ownerRequestsPromise,
        verificationPromise,
        CustomerExperienceService.getCustomerTourHistory(user).catch(() => []),
        MessageService.listSharedThreads({ limit: 50 }).catch(() => ({ threads: [] })),
      ]);

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
      return {
        accountSnapshot,
        customerRequestsResult,
        ownerVehiclesResult,
        ownerRequestsResult,
      };
    } catch (loadError) {
      setError(loadError?.message || tr('Unable to load your workspace overview right now.', 'Impossible de charger votre vue générale pour le moment.'));
      return null;
    } finally {
      overviewLoadInFlightRef.current = false;
      if (!silent) {
        setLoading(false);
      }
    }
  }, [currentUserId, tr]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const result = await loadWorkspaceOverview();
      if (cancelled && result) {
        return;
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [loadWorkspaceOverview]);

  useEffect(() => {
    if (!user?.id) return undefined;

    let reloadTimer = null;
    const queueReload = () => {
      if (reloadTimer) {
        window.clearTimeout(reloadTimer);
      }
      reloadTimer = window.setTimeout(() => {
        void loadWorkspaceOverview({ silent: true });
      }, 500);
    };

    const bookingChannels = [
      supabase
        .channel(`account-overview-booking-customer:${user.id}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'app_booking_requests',
            filter: `customer_id=eq.${user.id}`,
          },
          queueReload
        )
        .subscribe(),
      supabase
        .channel(`account-overview-booking-owner:${user.id}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'app_booking_requests',
            filter: `owner_id=eq.${user.id}`,
          },
          queueReload
        )
        .subscribe(),
    ];

    return () => {
      if (reloadTimer) {
        window.clearTimeout(reloadTimer);
      }
      bookingChannels.forEach((channel) => {
        try {
          supabase.removeChannel(channel);
        } catch {
          // ignore cleanup errors
        }
      });
    };
  }, [loadWorkspaceOverview, user?.id]);

  const profile = resolvedSnapshot?.profile || {};
  const notificationPreferences = useMemo(
    () => getMessageNotificationPreferences({ userProfile, user }),
    [user, userProfile]
  );
  const activeBookings = resolvedSnapshot?.active || [];
  const recentBookings = Array.isArray(resolvedSnapshot?.recent) ? resolvedSnapshot.recent : [];
  const upcomingBookings = resolvedSnapshot?.upcoming || [];
  const linkedMarketplaceRequestIds = useMemo(() => {
    const requestIds = [...activeBookings, ...upcomingBookings, ...recentBookings]
      .map((booking) => String(
        booking?.marketplaceRequestId ||
        booking?.marketplace_request_id ||
        booking?.raw?.marketplace_request_id ||
        ''
      ).trim())
      .filter(Boolean);
    return new Set(requestIds);
  }, [activeBookings, upcomingBookings, recentBookings]);
  const tourRows = Array.isArray(tourBookings) ? tourBookings : [];

  const ownerVehicles = ownerData.vehicles || [];
  const ownerRequests = ownerData.requests || [];
  const cachedOwnerOperationRequests = useMemo(
    () => readCachedOwnerOperationRequests(currentUserId),
    [currentUserId]
  );
  const effectiveOwnerRequests = useMemo(() => {
    if (ownerRequests.length > 0) return ownerRequests;
    if (!loading) return ownerRequests;
    return cachedOwnerOperationRequests;
  }, [cachedOwnerOperationRequests, loading, ownerRequests]);
  const ownerRentalHistoryRows = useMemo(
    () => normalizeOwnerRentalHistoryRows(effectiveOwnerRequests),
    [effectiveOwnerRequests]
  );
  const openCustomerRequests = useMemo(
    () => customerRequests.filter((request) => {
      const requestId = String(request?.id || '').trim();
      if (request?.linkedRentalId || request?.linked_rental_id) return false;
      if (requestId && linkedMarketplaceRequestIds.has(requestId)) return false;
      return isMarketplaceRequestOpen(request?.requestStatus);
    }),
    [customerRequests, linkedMarketplaceRequestIds]
  );
  const meaningfulOwnerVehicles = useMemo(
    () => ownerVehicles.filter((vehicle) => isMeaningfulOwnerVehicle(vehicle)),
    [ownerVehicles]
  );
  const primaryOwnerVehicle = useMemo(() => {
    const source = meaningfulOwnerVehicles.length ? meaningfulOwnerVehicles : ownerVehicles;
    if (!source.length) return null;

    return [...source].sort((left, right) => {
      const leftTime = new Date(left?.updatedAt || left?.updated_at || left?.createdAt || left?.created_at || 0).getTime();
      const rightTime = new Date(right?.updatedAt || right?.updated_at || right?.createdAt || right?.created_at || 0).getTime();
      return rightTime - leftTime;
    })[0] || null;
  }, [meaningfulOwnerVehicles, ownerVehicles]);
  const latestVerificationByType = useMemo(() => getLatestVerificationByType(verificationRequests), [verificationRequests]);
  const requestDrivenVerificationStatus = useMemo(
    () => getRequestDrivenVerificationStatus(latestVerificationByType),
    [latestVerificationByType]
  );
  const pendingOwnerRequests = effectiveOwnerRequests.filter((request) => isMarketplaceRequestOpen(request?.requestStatus)).length;
  const effectiveVerificationStatus = useMemo(
    () =>
      resolveEffectiveVerificationStatus({
        requestDrivenStatus: requestDrivenVerificationStatus,
        userProfileStatus: userProfile?.verificationStatus,
        snapshotProfileStatus: profile?.verificationStatus,
        authMetadataStatus: user?.user_metadata?.verification_status,
        appMetadataStatus: user?.app_metadata?.verification_status,
        userProfileApprovedAt: userProfile?.approvedAt || userProfile?.approved_at,
        snapshotProfileApprovedAt: profile?.approvedAt || profile?.approved_at,
        authMetadataApprovedAt: user?.user_metadata?.approved_at,
        appMetadataApprovedAt: user?.app_metadata?.approved_at,
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
  const identityStatusDisplay = useMemo(() => {
    if (isVerificationHydrating) {
      return {
        label: tr('Checking verification', 'Vérification en cours'),
        tone: 'neutral',
        actionable: false,
      };
    }

    if (hasRejectedVerification) {
      return {
        label: tr('Verification needs updates', 'Vérification à corriger'),
        tone: 'danger',
        actionable: true,
      };
    }

    if (hasPendingVerificationReview) {
      return {
        label: tr('Verification in review', 'Vérification en revue'),
        tone: 'warning',
        actionable: true,
      };
    }

    if (identityStatus.tone !== 'success') {
      return {
        label: tr('Verification needed', 'Vérification requise'),
        tone: 'violet',
        actionable: true,
      };
    }

    return {
      ...identityStatus,
      actionable: false,
    };
  }, [
    hasPendingVerificationReview,
    hasRejectedVerification,
    identityStatus,
    isVerificationHydrating,
    tr,
  ]);
  const ownerVerificationReady = effectiveVerificationStatus === 'approved';
  const ownerVehicleHasDraft = Boolean(primaryOwnerVehicle && isMeaningfulOwnerVehicle(primaryOwnerVehicle));
  const ownerVehicleMediaReady = hasVehicleMedia(primaryOwnerVehicle);
  const ownerVehiclePricingReady = hasVehiclePricing(primaryOwnerVehicle);
  const vehicleVerificationStage = getVehicleVerificationStage(primaryOwnerVehicle);
  const marketplaceVerificationReady = vehicleVerificationStage === 'approved';
  const primaryOwnerListingStatus = primaryOwnerVehicle?.marketplaceVisible || primaryOwnerVehicle?.publishedAt
    ? 'live'
    : primaryOwnerVehicle?.listingStatus;
  const primaryOwnerJourneyState = useMemo(
    () =>
      getEffectiveMarketplaceJourneyState({
        marketplaceVerificationReady,
        hasStartedDraft: ownerVehicleHasDraft,
        listingStatus: primaryOwnerListingStatus,
        reviewStatus: primaryOwnerVehicle?.reviewStatus,
        moderationStatus: primaryOwnerVehicle?.moderationStatus,
      }),
    [
      marketplaceVerificationReady,
      ownerVehicleHasDraft,
      primaryOwnerVehicle?.moderationStatus,
      primaryOwnerVehicle?.reviewStatus,
      primaryOwnerListingStatus,
    ]
  );
  const listingHasPassedAdminReview = ['approved', 'live'].includes(primaryOwnerJourneyState);

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
    if (!openCustomerRequests.length) return null;
    const sorted = [...openCustomerRequests].sort((a, b) => new Date(b?.createdAt || 0).getTime() - new Date(a?.createdAt || 0).getTime());
    return sorted[0] || null;
  }, [openCustomerRequests]);
  const latestCompletedRental = useMemo(
    () =>
      recentBookings.find((booking) =>
        ['completed', 'closed'].includes(String(booking?.status || '').toLowerCase())
      ) || null,
    [recentBookings]
  );
  const isCustomerTripsHydrating = Boolean(!isOwnerWorkspace && loading && !resolvedSnapshot);
  const nextOwnerRequest = useMemo(() => {
    if (!effectiveOwnerRequests.length) return null;
    const pending = effectiveOwnerRequests.filter((request) => isMarketplaceRequestOpen(request?.requestStatus));
    const sorted = [...pending].sort((a, b) => new Date(b?.createdAt || 0).getTime() - new Date(a?.createdAt || 0).getTime());
    return sorted[0] || null;
  }, [effectiveOwnerRequests]);
  const nextOwnerExecutionRequest = useMemo(() => {
    if (!effectiveOwnerRequests.length) return null;

    const getPriority = (stage) => {
      if (stage === 'return_pending') return 0;
      if (stage === 'live') return 1;
      if (stage === 'ready_to_start') return 2;
      if (stage === 'handoff' || stage === 'approved') return 3;
      return 9;
    };

    const actionable = effectiveOwnerRequests
      .map((request) => ({
        request,
        action: getOwnerExecutionActionConfig(request, tr),
      }))
      .filter((entry) => Boolean(entry.action));

    if (!actionable.length) return null;

    return [...actionable].sort((left, right) => {
      const priorityDelta = getPriority(left.action?.stage) - getPriority(right.action?.stage);
      if (priorityDelta !== 0) return priorityDelta;
      return new Date(right.request?.updatedAt || right.request?.createdAt || 0).getTime() -
        new Date(left.request?.updatedAt || left.request?.createdAt || 0).getTime();
    })[0] || null;
  }, [effectiveOwnerRequests, tr]);
  const hasActiveOwnerExecution = Boolean(nextOwnerExecutionRequest?.action);
  const isOwnerOperationsHydrating = Boolean(
    isOwnerWorkspace &&
    loading &&
    !hasActiveOwnerExecution &&
    effectiveOwnerRequests.length === 0
  );
  const walletBalance = Number(resolvedSnapshot?.wallet?.balance || 0);
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
  const totalInboxSignalCount = supportUnreadCount + (notificationPreferences.customerMessages ? customerUnreadCount : 0);
  const primaryVehicleProfileHref = primaryOwnerVehicle?.id
    ? `/account/vehicles/${encodeURIComponent(String(primaryOwnerVehicle.id))}/profile?tab=overview`
    : '/account/vehicles/new/profile?tab=overview';
  const primaryVehicleListingHref = primaryOwnerVehicle?.id
    ? `/account/vehicles/${encodeURIComponent(String(primaryOwnerVehicle.id))}/profile?tab=listing`
    : '/account/vehicles/new/profile?tab=overview';
  const primaryVehicleLegalHref = primaryOwnerVehicle?.id
    ? `/account/vehicles/${encodeURIComponent(String(primaryOwnerVehicle.id))}/profile?tab=legal`
    : primaryVehicleProfileHref;

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
    if (nextOwnerExecutionRequest?.action) {
      return {
        type: 'hosting_execution',
        title: nextOwnerExecutionRequest.action.title,
        status: getMarketplaceStatus(nextOwnerExecutionRequest.request?.requestStatus, tr),
        detail: [
          nextOwnerExecutionRequest.request?.customerName,
          formatDateTime(
            nextOwnerExecutionRequest.request?.requestedStartAt
              ? new Date(nextOwnerExecutionRequest.request.requestedStartAt)
              : null,
            locale
          ),
        ]
          .filter(Boolean)
          .join(' • '),
        imageUrl: nextOwnerExecutionRequest.request?.coverImageUrl || '',
        href: nextOwnerExecutionRequest.action.href,
        ctaLabel: nextOwnerExecutionRequest.action.ctaLabel,
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
        href: buildOwnerExecutionWorkspaceHref(nextOwnerRequest, { focus: 'request' }),
        ctaLabel: tr('Review request', 'Voir la demande'),
      };
    }
    return null;
  }, [activeBookings, upcomingBookings, nextMarketplaceRequest, nextOwnerExecutionRequest, nextOwnerRequest, nextTour, locale, tr]);

  const nextBestAction = useMemo(() => {
    if (isOwnerWorkspace) {
      if (isOwnerOperationsHydrating) {
        return {
          title: tr('Checking rental operations', 'Vérification des opérations de location'),
          detail: tr(
            'Home is loading your ready-to-start and ready-to-finish actions now.',
            "L'accueil charge maintenant vos actions prêtes à démarrer et prêtes à terminer."
          ),
          to: '',
          state: undefined,
          ctaLabel: tr('Loading…', 'Chargement…'),
          icon: CalendarClock,
          tone: 'slate',
          disabled: true,
        };
      }

      if (nextOwnerExecutionRequest?.action) {
        return {
          title: nextOwnerExecutionRequest.action.title,
          detail: nextOwnerExecutionRequest.action.detail,
          to: nextOwnerExecutionRequest.action.href,
          state: { from: currentPath },
          ctaLabel: nextOwnerExecutionRequest.action.ctaLabel,
          icon: CalendarClock,
          tone: nextOwnerExecutionRequest.action.tone,
        };
      }

      if (pendingOwnerRequests > 0) {
        return {
          title: tr('Respond to booking requests', 'Répondez aux demandes de réservation'),
          detail: pendingOwnerRequests === 1
            ? tr('You have 1 owner request waiting in Inbox.', 'Vous avez 1 demande propriétaire en attente dans Inbox.')
            : tr(`You have ${pendingOwnerRequests} owner requests waiting in Inbox.`, `Vous avez ${pendingOwnerRequests} demandes propriétaire en attente dans Inbox.`),
          to: '/account/messages',
          state: { from: currentPath },
          ctaLabel: tr('Open Inbox', 'Ouvrir Inbox'),
          icon: MessageSquare,
          tone: 'violet',
        };
      }

      if (totalInboxSignalCount > 0) {
        return {
          title: tr('Stay on top of conversations', 'Restez à jour sur les conversations'),
          detail: totalInboxSignalCount === 1
            ? tr('You have 1 unread message waiting in Inbox.', 'Vous avez 1 message non lu en attente dans Inbox.')
            : tr(`You have ${totalInboxSignalCount} unread messages waiting in Inbox.`, `Vous avez ${totalInboxSignalCount} messages non lus en attente dans Inbox.`),
          to: '/account/messages',
          state: { from: currentPath },
          ctaLabel: tr('Open Inbox', 'Ouvrir Inbox'),
          icon: MessageSquare,
          tone: 'amber',
        };
      }

      if (effectiveOwnerVehicleCount === 0) {
        return {
          title: tr('Start your first vehicle listing', 'Commencez votre première annonce véhicule'),
          detail: tr(
            'Create the vehicle profile first. Verification is only required before review and publication.',
            "Créez d'abord le profil véhicule. La vérification n'est requise qu'avant la revue et la publication."
          ),
          to: '/account/vehicles/new/profile?tab=overview',
          state: { from: currentPath },
          ctaLabel: tr('Start vehicle listing', "Démarrer l'annonce"),
          icon: CarFront,
          tone: 'violet',
        };
      }

      if (['changes_requested', 'rejected'].includes(primaryOwnerJourneyState)) {
        return {
          title: tr('Update your listing', 'Mettez à jour votre annonce'),
          detail: tr(
            'Admin feedback is waiting on you. Open the listing and fix the requested changes.',
            "Le retour admin attend votre action. Ouvrez l'annonce et corrigez les éléments demandés."
          ),
          to: primaryVehicleListingHref,
          state: { from: currentPath, resumeEditing: true, focusSectionId: 'listing-journey' },
          ctaLabel: tr('Fix listing', "Corriger l'annonce"),
          icon: CarFront,
          tone: 'amber',
        };
      }

      if (!listingHasPassedAdminReview && !ownerVehicleMediaReady) {
        return {
          title: tr('Add photos to continue', 'Ajoutez des photos pour continuer'),
          detail: tr(
            'Your vehicle basics exist. Photos are the next step before this listing can move toward review.',
            'Les informations de base du véhicule existent. Les photos sont la prochaine étape avant la revue.'
          ),
          to: primaryVehicleProfileHref,
          state: { from: currentPath, resumeEditing: true, focusSectionId: 'primary-photo' },
          ctaLabel: tr('Continue listing', "Continuer l'annonce"),
          icon: CarFront,
          tone: 'violet',
        };
      }

      if (!listingHasPassedAdminReview && !ownerVehiclePricingReady) {
        return {
          title: tr('Set your pricing', 'Définissez votre tarification'),
          detail: tr(
            'Add pricing so renters can understand the offer before you send it for review.',
            "Ajoutez la tarification pour que les locataires comprennent l'offre avant l'envoi en revue."
          ),
          to: primaryVehicleListingHref,
          state: { from: currentPath, resumeEditing: true, focusSectionId: 'listing-details' },
          ctaLabel: tr('Open pricing', 'Ouvrir la tarification'),
          icon: CarFront,
          tone: 'violet',
        };
      }

      if (!listingHasPassedAdminReview && !ownerVerificationReady) {
        return {
          title: hasPendingVerificationReview
            ? tr('Owner verification is in review', 'La vérification propriétaire est en revue')
            : hasRejectedVerification
              ? tr('Update owner verification', 'Mettez à jour la vérification propriétaire')
              : tr('Verify owner before review', 'Vérifiez le propriétaire avant la revue'),
          detail: tr(
            'You can keep editing your listing now. Owner verification is required before the full review send.',
            "Vous pouvez continuer à modifier l'annonce maintenant. La vérification propriétaire est requise avant l'envoi complet en revue."
          ),
          to: '/account/verification',
          state: { from: currentPath },
          ctaLabel: hasPendingVerificationReview
            ? tr('Review trust status', 'Voir le statut de confiance')
            : hasRejectedVerification
              ? tr('Update owner verification', 'Mettre à jour la vérification propriétaire')
              : tr('Verify owner', 'Vérifier le propriétaire'),
          icon: ShieldCheck,
          tone: hasRejectedVerification ? 'rose' : hasPendingVerificationReview ? 'amber' : 'violet',
        };
      }

      if (!listingHasPassedAdminReview && !marketplaceVerificationReady) {
        return {
          title: tr('Review vehicle documents', 'Vérifiez les documents du véhicule'),
          detail: tr(
            'Registration and insurance still need approval before this listing can move into full review.',
            "L'immatriculation et l'assurance doivent encore être approuvées avant la revue complète."
          ),
          to: primaryVehicleLegalHref,
          state: { from: currentPath, resumeEditing: true, focusSectionId: 'legal-documents' },
          ctaLabel: tr('Review vehicle documents', 'Vérifier les documents du véhicule'),
          icon: CarFront,
          tone: vehicleVerificationStage === 'issue' ? 'rose' : vehicleVerificationStage === 'pending' ? 'amber' : 'violet',
        };
      }

      if (primaryOwnerJourneyState === 'pending_review') {
        return {
          title: tr('Track your listing review', "Suivez la revue de l'annonce"),
          detail: tr(
            'Your full package is already with admin. Keep messages and details ready in case feedback arrives.',
            "Votre dossier complet est déjà chez l'admin. Gardez messages et détails prêts en cas de retour."
          ),
          to: primaryVehicleListingHref,
          state: { from: currentPath, focusSectionId: 'listing-journey' },
          ctaLabel: tr('Open listing', "Ouvrir l'annonce"),
          icon: CarFront,
          tone: 'slate',
        };
      }

      if (primaryOwnerJourneyState === 'approved') {
        return {
          title: tr('Your listing is approved', 'Votre annonce est approuvée'),
          detail: tr(
            'Everything is ready for publication. Open your listing and decide when to go live.',
            "Tout est prêt pour la publication. Ouvrez votre annonce et décidez quand la mettre en ligne."
          ),
          to: primaryVehicleListingHref,
          state: { from: currentPath, focusSectionId: 'listing-journey' },
          ctaLabel: tr('Manage listing', "Gérer l'annonce"),
          icon: CarFront,
          tone: 'emerald',
        };
      }

      if (primaryOwnerJourneyState === 'live') {
        return {
          title: tr('Manage your live listing', 'Gérez votre annonce en ligne'),
          detail: tr(
            'Control pricing, availability, requests, and reviews from the listings workspace.',
            "Contrôlez tarifs, disponibilité, demandes et avis depuis l'espace annonces."
          ),
          to: '/account/vehicles',
          state: { from: currentPath },
          ctaLabel: tr('Open listings', 'Ouvrir les annonces'),
          icon: CarFront,
          tone: 'emerald',
        };
      }

      return {
        title: tr('Continue your listing', 'Continuez votre annonce'),
        detail: tr(
          'Finish the remaining setup steps and send the listing for review when everything is ready.',
          "Terminez les étapes restantes puis envoyez l'annonce en revue quand tout est prêt."
        ),
        to: primaryVehicleProfileHref,
        state: { from: currentPath },
        ctaLabel: tr('Continue listing', "Continuer l'annonce"),
        icon: CarFront,
        tone: 'violet',
      };
    }

    if (isCustomerTripsHydrating) {
      return {
        title: tr('Loading latest rental', 'Chargement de la dernière location'),
        detail: tr('Home is syncing your completed trips now.', 'Accueil synchronise vos trajets terminés.'),
        to: '',
        state: undefined,
        ctaLabel: tr('Loading…', 'Chargement…'),
        icon: CalendarClock,
        tone: 'slate',
        disabled: true,
      };
    }

    if (nextActivity) {
      return {
        title: nextActivity.title,
        detail: nextActivity.detail || tr('Open this activity to continue.', 'Ouvrez cette activité pour continuer.'),
        to: nextActivity.href,
        state: { from: currentPath },
        ctaLabel: nextActivity.ctaLabel || tr('Open activity', 'Ouvrir'),
        icon: nextActivity.type === 'marketplace' ? MessageSquare : CalendarClock,
        tone: 'violet',
      };
    }

    if (latestCompletedRental) {
      return {
        title: tr('Latest completed rental', 'Dernière location terminée'),
        detail: [
          latestCompletedRental?.rentalId,
          latestCompletedRental?.packageName || latestCompletedRental?.selectedPackageName,
          formatDateTime(latestCompletedRental?.endDate || latestCompletedRental?.startDate, locale),
        ]
          .filter(Boolean)
          .join(' • '),
        to: buildCustomerRentalHref(latestCompletedRental),
        state: { from: currentPath },
        ctaLabel: tr('View details', 'Voir les détails'),
        icon: CalendarClock,
        tone: 'slate',
      };
    }

    if (totalInboxSignalCount > 0) {
      return {
        title: tr('Check your inbox', 'Vérifiez votre inbox'),
        detail: totalInboxSignalCount === 1
          ? tr('You have 1 unread message waiting.', 'Vous avez 1 message non lu en attente.')
          : tr(`You have ${totalInboxSignalCount} unread messages waiting.`, `Vous avez ${totalInboxSignalCount} messages non lus en attente.`),
        to: '/account/messages',
        state: { from: currentPath },
        ctaLabel: tr('Open Inbox', 'Ouvrir Inbox'),
        icon: MessageSquare,
        tone: 'amber',
      };
    }

    return {
      title: tr('Browse vehicles', 'Explorer les véhicules'),
      detail: tr(
        'Discover available vehicles, send requests, and keep every booking conversation inside Inbox.',
        'Découvrez les véhicules disponibles, envoyez des demandes et gardez chaque conversation de réservation dans Inbox.'
      ),
      to: '/account/marketplace',
      state: { from: currentPath },
      ctaLabel: tr('Open listings', 'Ouvrir les annonces'),
      icon: CarFront,
      tone: 'violet',
    };
  }, [
    currentPath,
    effectiveOwnerVehicleCount,
    hasPendingVerificationReview,
    hasRejectedVerification,
    isOwnerWorkspace,
    isCustomerTripsHydrating,
    isOwnerOperationsHydrating,
    listingHasPassedAdminReview,
    marketplaceVerificationReady,
    nextActivity,
    nextOwnerExecutionRequest,
    ownerVehicleMediaReady,
    ownerVehiclePricingReady,
    ownerVerificationReady,
    pendingOwnerRequests,
    primaryOwnerJourneyState,
    primaryVehicleLegalHref,
    primaryVehicleListingHref,
    primaryVehicleProfileHref,
    totalInboxSignalCount,
    tr,
    latestCompletedRental,
    locale,
    vehicleVerificationStage,
  ]);

  const reviewSignals = useMemo(() => {
    const items = [];

    if (isOwnerWorkspace && (hasRejectedVerification || hasPendingVerificationReview || identityStatusDisplay.tone === 'violet')) {
      items.push({
        key: 'account_verification',
        label:
          hasRejectedVerification
            ? tr('Owner verification needs your update', 'La vérification propriétaire doit être corrigée')
            : hasPendingVerificationReview
              ? tr('Owner verification is waiting for admin review', "La vérification propriétaire attend la revue de l'admin")
              : tr('Owner verification is not complete yet', "La vérification propriétaire n'est pas encore terminée"),
        detail:
          hasRejectedVerification
            ? tr(
                'Open the trust center to replace the document and continue.',
                'Ouvrez le centre de confiance pour remplacer le document et continuer.'
              )
            : hasPendingVerificationReview
              ? tr(
                  'Your driver license and ID/passport are in the trust center and waiting for approval.',
                  "Votre permis et votre pièce/passeport sont dans le centre de confiance et attendent l'approbation."
                )
              : tr(
                  'Add your identity documents in the trust center so approvals can move forward.',
                  "Ajoutez vos documents d'identité dans le centre de confiance pour faire avancer les validations."
                ),
        to: '/account/verification',
        state: { from: currentPath },
        icon: ShieldCheck,
        tone: hasRejectedVerification ? 'rose' : hasPendingVerificationReview ? 'amber' : 'violet',
      });
    }

    if (isOwnerWorkspace && primaryOwnerJourneyState === 'pending_review') {
      items.push({
        key: 'listing_review',
        label: tr('Listing review is waiting for admin approval', "La revue de l'annonce attend l'approbation admin"),
        detail: tr(
          'Open the listing workspace to follow the approval state and next publishing step.',
          "Ouvrez l'espace annonce pour suivre l'état d'approbation et la prochaine étape de publication."
        ),
        to: primaryVehicleListingHref,
        state: { from: currentPath, focusSectionId: 'listing-journey' },
        icon: CarFront,
        tone: 'amber',
      });
    }

    return items;
  }, [
    currentPath,
    hasPendingVerificationReview,
    hasRejectedVerification,
    identityStatusDisplay.tone,
    isOwnerWorkspace,
    primaryOwnerJourneyState,
    primaryVehicleListingHref,
    tr,
  ]);

  const homeHero = useMemo(() => {
    if (isOwnerWorkspace) {
      if (hasActiveOwnerExecution) {
        return {
          eyebrow: tr('Home', 'Accueil'),
          title: tr('Owner workspace', 'Espace propriétaire'),
          description: tr('Live rentals, messages, and payouts in one place.', 'Locations actives, messages et paiements au même endroit.'),
        };
      }

      if (isOwnerOperationsHydrating) {
        return {
          eyebrow: tr('Rental operations', 'Opérations de location'),
          title: tr('Checking rental operations', 'Vérification des opérations de location'),
          description: tr('Loading your next action.', 'Chargement de votre prochaine action.'),
        };
      }

      if (effectiveOwnerVehicleCount === 0) {
        return {
          eyebrow: tr('Start listing', 'Commencer une annonce'),
          title: tr('List your first vehicle', 'Listez votre premier véhicule'),
          description: tr('Create the listing, then send it for review.', "Créez l'annonce, puis envoyez-la en revue."),
        };
      }

      if (primaryOwnerJourneyState === 'pending_review') {
        return {
          eyebrow: tr('Home', 'Accueil'),
          title: tr('Your listing is in review', "Votre annonce est en revue"),
          description: tr('Waiting for admin approval.', "En attente de l'approbation admin."),
        };
      }

      if (primaryOwnerJourneyState === 'live') {
        return {
          eyebrow: tr('Home', 'Accueil'),
          title: tr('Your listing is live', "Votre annonce est en ligne"),
          description: tr('Manage requests, trips, and payouts.', 'Gérez demandes, trajets et paiements.'),
        };
      }

      return {
        eyebrow: tr('Home', 'Accueil'),
        title: tr('Continue your listing', "Continuez votre annonce"),
        description: tr('Finish the next setup step.', "Terminez la prochaine étape de configuration."),
      };
    }

    return {
      eyebrow: tr('Home', 'Accueil'),
      title: tr('Your travel dashboard', 'Votre tableau de bord voyage'),
      description: tr('Trips, messages, and wallet activity.', 'Trajets, messages et portefeuille.'),
    };
  }, [effectiveOwnerVehicleCount, hasActiveOwnerExecution, isOwnerOperationsHydrating, isOwnerWorkspace, primaryOwnerJourneyState, tr]);

  const heroSecondaryAction = useMemo(() => {
    if (isOwnerWorkspace) {
      return {
        label: tr('Open Inbox', 'Ouvrir Inbox'),
        to: '/account/messages',
        state: { from: currentPath },
      };
    }

    return {
      label: tr('Open trips', 'Ouvrir les parcours'),
      to: '/account/rentals',
      state: { from: currentPath },
    };
  }, [currentPath, isOwnerWorkspace, tr]);

  const ownerOperationMeta = useMemo(() => {
    if (!isOwnerWorkspace || !nextOwnerExecutionRequest?.action) return null;

    return {
      title: nextOwnerExecutionRequest.action.title,
      detail: [
        nextOwnerExecutionRequest.request?.customerName,
        nextOwnerExecutionRequest.request?.listingTitle,
        formatDateTime(
          nextOwnerExecutionRequest.request?.requestedStartAt
            ? new Date(nextOwnerExecutionRequest.request.requestedStartAt)
            : null,
          locale === 'fr' ? 'fr-MA' : 'en-MA'
        ),
      ].filter(Boolean).join(' • '),
      helper: nextOwnerExecutionRequest.action.detail,
      href: nextOwnerExecutionRequest.action.href,
      ctaLabel: nextOwnerExecutionRequest.action.ctaLabel,
      request: nextOwnerExecutionRequest.request,
      action: nextOwnerExecutionRequest.action,
    };
  }, [isOwnerWorkspace, locale, nextOwnerExecutionRequest]);

  const listingsEntry = useMemo(() => {
    return {
      value: `${effectiveOwnerVehicleCount}`,
      label:
        effectiveOwnerVehicleCount > 0
          ? getOwnerJourneyLabel(primaryOwnerJourneyState, tr)
          : tr('Start your first listing', 'Commencez votre première annonce'),
      to: effectiveOwnerVehicleCount > 0 ? '/account/vehicles' : '/account/vehicles/new/profile?tab=overview',
      ctaLabel: effectiveOwnerVehicleCount > 0 ? tr('Open listings', 'Ouvrir les annonces') : tr('Start listing', 'Commencer'),
    };
  }, [effectiveOwnerVehicleCount, primaryOwnerJourneyState, tr]);

  const customerRequestsEntry = useMemo(() => {
    if (openCustomerRequests.length > 0) {
      return {
        eyebrow: tr('Vehicle requests', 'Demandes véhicule'),
        value: `${openCustomerRequests.length}`,
        label: tr('Vehicle requests in progress', 'Demandes de véhicule en cours'),
        to: openCustomerRequests.length === 1
          ? `/account/rentals/requests/${encodeURIComponent(String(openCustomerRequests[0]?.id || ''))}`
          : '/account/rentals#marketplace-requests',
        ctaLabel: openCustomerRequests.length === 1
          ? tr('Open request', 'Ouvrir la demande')
          : tr('Open requests', 'Ouvrir les demandes'),
      };
    }

    if (latestCompletedRental) {
      return {
        eyebrow: tr('Latest rental', 'Dernière location'),
        value: tr('Done', 'Terminée'),
        valueVariant: 'status',
        label: [
          latestCompletedRental?.rentalId,
          latestCompletedRental?.packageName || latestCompletedRental?.selectedPackageName,
        ]
          .filter(Boolean)
          .join(' • '),
        to: buildCustomerRentalHref(latestCompletedRental),
        ctaLabel: tr('View rental', 'Voir la location'),
      };
    }

    return {
      eyebrow: tr('Vehicle requests', 'Demandes véhicule'),
      value: '0',
      label: tr('Browse available vehicles', 'Explorer les véhicules disponibles'),
      to: '/account/marketplace',
      ctaLabel: tr('Browse vehicles', 'Explorer les véhicules'),
    };
  }, [latestCompletedRental, openCustomerRequests, tr]);

  const inboxEntry = useMemo(() => ({
    value: `${pendingOwnerRequests + totalInboxSignalCount}`,
    label:
      pendingOwnerRequests > 0
        ? tr(
            `${pendingOwnerRequests} request${pendingOwnerRequests === 1 ? '' : 's'} waiting`,
            `${pendingOwnerRequests} demande${pendingOwnerRequests === 1 ? '' : 's'} en attente`
          )
          : totalInboxSignalCount > 0
            ? tr(
                `${totalInboxSignalCount} unread conversation${totalInboxSignalCount === 1 ? '' : 's'}`,
                `${totalInboxSignalCount} conversation${totalInboxSignalCount === 1 ? '' : 's'} non lue${totalInboxSignalCount === 1 ? '' : 's'}`
              )
            : tr('No unread messages', 'Aucun message non lu'),
    to: '/account/messages',
    ctaLabel: tr('Open Inbox', 'Ouvrir Inbox'),
  }), [pendingOwnerRequests, totalInboxSignalCount, tr]);

  const tripsEntry = useMemo(() => {
    if (isOwnerWorkspace) {
      const completedHistoryCount = ownerRentalHistoryRows.filter((row) => row.status === 'completed').length;
      const activeHistoryCount = ownerRentalHistoryRows.filter((row) => row.status === 'active').length;

      return {
        value: `${ownerRentalHistoryRows.length}`,
        label:
          ownerRentalHistoryRows.length > 0
            ? tr(
                `${completedHistoryCount} completed • ${activeHistoryCount} active`,
                `${completedHistoryCount} terminée${completedHistoryCount === 1 ? '' : 's'} • ${activeHistoryCount} active${activeHistoryCount === 1 ? '' : 's'}`
              )
            : tr('No owner rental history yet', 'Aucun historique propriétaire'),
        to: '/account/rental-history',
        ctaLabel: tr('Open rental history', "Ouvrir l'historique"),
      };
    }

    const activeTourCount = tourRows.filter((tour) => !['completed', 'closed', 'cancelled', 'canceled'].includes(String(tour?.status || '').toLowerCase())).length;
    const activeTripCount = activeBookings.length + upcomingBookings.length + activeTourCount;
    const completedRentalCount = recentBookings.filter((booking) =>
      ['completed', 'closed'].includes(String(booking?.status || '').toLowerCase())
    ).length;
    const totalTripHistoryCount = completedRentalCount + tourRows.filter((tour) =>
      ['completed', 'closed', 'cancelled', 'canceled'].includes(String(tour?.status || '').toLowerCase())
    ).length;
    return {
      value: `${activeTripCount > 0 ? activeTripCount : totalTripHistoryCount}`,
      label:
        activeTripCount > 0
          ? tr('Confirmed and upcoming trips', 'Parcours confirmés et à venir')
          : totalTripHistoryCount > 0
            ? tr(
                `${completedRentalCount} completed rental${completedRentalCount === 1 ? '' : 's'} in history`,
                `${completedRentalCount} location${completedRentalCount === 1 ? '' : 's'} terminée${completedRentalCount === 1 ? '' : 's'} dans l'historique`
              )
            : tr('No trips yet', 'Aucun trajet'),
      to: '/account/rentals',
      ctaLabel: tr('Open trips', 'Ouvrir les parcours'),
    };
  }, [activeBookings.length, isOwnerWorkspace, ownerRentalHistoryRows, recentBookings, upcomingBookings.length, tourRows, tr]);

  const walletEntry = useMemo(() => ({
    value: formatMoney(walletBalance, resolvedSnapshot?.wallet?.currencyCode || 'MAD', locale),
    label: tr('Wallet balance', 'Solde portefeuille'),
    to: '/account/revenue',
    ctaLabel: tr('Open wallet', 'Ouvrir le portefeuille'),
  }), [walletBalance, resolvedSnapshot?.wallet?.currencyCode, locale, tr]);

  const snapshotEntryCards = useMemo(() => {
    const shouldShowListings = isOwnerWorkspace || effectiveOwnerVehicleCount > 0;
    const cards = [];

    if (shouldShowListings) {
      cards.push({
        key: 'listings',
        eyebrow: tr('Listings', 'Annonces'),
        entry: listingsEntry,
      });
    }

    if (!isOwnerWorkspace) {
      cards.push({
        key: openCustomerRequests.length > 0 ? 'vehicle-requests' : latestCompletedRental ? 'latest-rental' : 'vehicle-requests',
        eyebrow: customerRequestsEntry.eyebrow,
        entry: customerRequestsEntry,
      });
    }

    cards.push(
      {
        key: 'inbox',
        eyebrow: tr('Inbox', 'Inbox'),
        entry: inboxEntry,
      },
      {
        key: 'trips',
        eyebrow: isOwnerWorkspace ? tr('Rental history', 'Historique') : tr('Trips', 'Parcours'),
        entry: tripsEntry,
      },
      {
        key: 'wallet',
        eyebrow: tr('Wallet', 'Portefeuille'),
        entry: walletEntry,
      }
    );

    return cards;
  }, [
    effectiveOwnerVehicleCount,
    customerRequestsEntry,
    inboxEntry,
    isOwnerWorkspace,
    latestCompletedRental,
    listingsEntry,
    openCustomerRequests.length,
    tripsEntry,
    tr,
    walletEntry,
  ]);

  const listingProgressSummary = useMemo(() => {
    if (!isOwnerWorkspace) {
      return null;
    }

    const listingDetailsComplete = Boolean(String(primaryOwnerVehicle?.listingTitle || '').trim());
    const listingPricingComplete = Boolean(ownerVehiclePricingReady && hasVehicleDeposit(primaryOwnerVehicle));
    const pickupSetupComplete = Boolean(String(primaryOwnerVehicle?.pickupLocationName || primaryOwnerVehicle?.pickupAddress || '').trim());
    const effectiveOwnerVerificationReady = Boolean(ownerVerificationReady || listingHasPassedAdminReview);
    const effectiveVehicleHasDraft = Boolean(ownerVehicleHasDraft || listingHasPassedAdminReview);
    const effectiveVehicleMediaReady = Boolean(ownerVehicleMediaReady || listingHasPassedAdminReview);
    const effectiveVehicleDocumentsReady = Boolean(marketplaceVerificationReady || listingHasPassedAdminReview);
    const effectiveListingDetailsComplete = Boolean(listingDetailsComplete || listingHasPassedAdminReview);
    const effectiveListingPricingComplete = Boolean(listingPricingComplete || listingHasPassedAdminReview);
    const effectivePickupSetupComplete = Boolean(pickupSetupComplete || listingHasPassedAdminReview);
    const canSendFullReview = Boolean(
      listingHasPassedAdminReview ||
      (
        ownerVerificationReady &&
        ownerVehicleHasDraft &&
        ownerVehicleMediaReady &&
        marketplaceVerificationReady &&
        listingDetailsComplete &&
        listingPricingComplete &&
        pickupSetupComplete
      )
    );

    return buildOwnerListingSetupProgress({
      tr,
      vehicleId: primaryOwnerVehicle?.id || '',
      currentPath,
      ownerVerificationReady: effectiveOwnerVerificationReady,
      ownerVerificationPending: !listingHasPassedAdminReview && hasPendingVerificationReview,
      ownerVerificationIssue: !listingHasPassedAdminReview && hasRejectedVerification,
      vehicleHasDraft: effectiveVehicleHasDraft,
      vehicleBasicsComplete: effectiveVehicleHasDraft,
      vehiclePhotosComplete: effectiveVehicleMediaReady,
      vehicleDocumentsComplete: effectiveVehicleDocumentsReady,
      vehicleDocumentsPending: !listingHasPassedAdminReview && vehicleVerificationStage === 'pending',
      vehicleDocumentsIssue: !listingHasPassedAdminReview && vehicleVerificationStage === 'issue',
      listingDetailsComplete: effectiveListingDetailsComplete,
      listingPricingComplete: effectiveListingPricingComplete,
      pickupSetupComplete: effectivePickupSetupComplete,
      listingReviewSubmitted: primaryOwnerJourneyState === 'pending_review' || listingHasPassedAdminReview,
      listingApproved: primaryOwnerJourneyState === 'approved',
      listingLive: primaryOwnerJourneyState === 'live',
      listingIssue: ['changes_requested', 'rejected'].includes(primaryOwnerJourneyState),
      canSendFullReview,
    });
  }, [
    currentPath,
    hasPendingVerificationReview,
    hasRejectedVerification,
    isOwnerWorkspace,
    listingHasPassedAdminReview,
    marketplaceVerificationReady,
    ownerVehicleHasDraft,
    ownerVehicleMediaReady,
    ownerVehiclePricingReady,
    ownerVerificationReady,
    primaryOwnerJourneyState,
    primaryOwnerVehicle,
    tr,
    vehicleVerificationStage,
  ]);

  const shouldHoldOwnerOverviewHydrationShell = Boolean(
    isOwnerWorkspace &&
    loading &&
    hasActiveOwnerExecution
  );
  const suppressBlockingLoader = shouldSuppressBlockingPageLoader({
    pathname: location.pathname,
    isTransitionFlow: loading && !shouldHoldOwnerOverviewHydrationShell,
  });

  useEffect(() => {
    if (!isOwnerWorkspace) {
      return;
    }

    trackAccountJourneyEventOnce(
      ACCOUNT_JOURNEY_EVENTS.homeViewed,
      `${workspaceMode}:${primaryOwnerJourneyState}:${effectiveOwnerVehicleCount > 0 ? 'has-listing' : 'no-listing'}`,
      {
        workspaceMode,
        ownerJourneyState: primaryOwnerJourneyState,
        vehicleCount: effectiveOwnerVehicleCount,
        primaryVehicleId: primaryOwnerVehicle?.id || '',
        listingId: primaryOwnerVehicle?.listingId || '',
      }
    );
  }, [
    effectiveOwnerVehicleCount,
    isOwnerWorkspace,
    primaryOwnerJourneyState,
    primaryOwnerVehicle?.id,
    primaryOwnerVehicle?.listingId,
    workspaceMode,
  ]);

  useEffect(() => {
    if (!isOwnerWorkspace || primaryOwnerJourneyState !== 'live') {
      return;
    }

    const listingIdentity = String(primaryOwnerVehicle?.listingId || primaryOwnerVehicle?.id || 'live-listing').trim();
    trackAccountJourneyEventOnce(
      ACCOUNT_JOURNEY_EVENTS.listingWentLive,
      `listing-live:${listingIdentity}`,
      {
        source: 'account_home',
        ownerJourneyState: primaryOwnerJourneyState,
        vehicleId: primaryOwnerVehicle?.id || '',
        listingId: primaryOwnerVehicle?.listingId || '',
      }
    );
  }, [isOwnerWorkspace, primaryOwnerJourneyState, primaryOwnerVehicle?.id, primaryOwnerVehicle?.listingId]);

  useEffect(() => {
    if (!isOwnerWorkspace || !nextOwnerExecutionRequest?.action?.href) {
      return;
    }

    if (!String(nextOwnerExecutionRequest.action.href).includes('/account/operations/')) {
      return;
    }

    void preloadOwnerOperationsRoute();
  }, [isOwnerWorkspace, nextOwnerExecutionRequest?.action?.href]);

  const trackNextActionSelection = (source, action = nextBestAction) => {
    const actionKind = getAccountJourneyActionKind(action);
    trackAccountJourneyEvent(ACCOUNT_JOURNEY_EVENTS.nextActionClicked, {
      source,
      actionKind,
      target: action?.to || action?.href || '',
      ownerJourneyState: primaryOwnerJourneyState,
      workspaceMode,
      vehicleId: primaryOwnerVehicle?.id || '',
      listingId: primaryOwnerVehicle?.listingId || '',
    });

    if (actionKind === 'open_trust_center') {
      trackTrustCenterSelection(source);
    }
  };

  const nextActionKind = useMemo(() => getAccountJourneyActionKind(nextBestAction), [nextBestAction]);
  const shouldMergeOwnerNextStepIntoProgress = isOwnerWorkspace && [
    'start_listing',
    'continue_listing',
    'open_trust_center',
    'open_listings',
  ].includes(nextActionKind);
  const shouldSuppressListingProgressForOwnerExecution = isOwnerWorkspace && hasActiveOwnerExecution;
  const showHeroPrimaryAction = isOwnerWorkspace
    ? !hasActiveOwnerExecution
    : Boolean(nextActivity || (!latestCompletedRental && !nextBestAction.disabled));
  const shouldShowOwnerOperationsLoading = isOwnerOperationsHydrating && !ownerOperationMeta;
  const showNextStepSection = !hasActiveOwnerExecution && !isOwnerOperationsHydrating && !shouldMergeOwnerNextStepIntoProgress;
  const shouldShowWorkspaceHero = !ownerOperationMeta && !isOwnerOperationsHydrating;
  const showReviewStatusSection = Boolean(
    reviewSignals.length &&
    !loading &&
    !showNextStepSection &&
    !ownerOperationMeta &&
    !shouldShowOwnerOperationsLoading
  );
  const shouldShowLiveActivity = Boolean(
    nextActivity && (!ownerOperationMeta || String(nextActivity.href || '') !== String(ownerOperationMeta.href || ''))
  );

  const trackTrustCenterSelection = (source) => {
    trackAccountJourneyEvent(ACCOUNT_JOURNEY_EVENTS.trustCenterOpened, {
      source,
      ownerJourneyState: primaryOwnerJourneyState,
      workspaceMode,
      vehicleId: primaryOwnerVehicle?.id || '',
      listingId: primaryOwnerVehicle?.listingId || '',
    });
  };

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
      {shouldShowOwnerOperationsLoading ? (
        <section className="rounded-[1.35rem] border border-violet-100 bg-white px-4 py-4 shadow-[0_14px_34px_rgba(91,33,182,0.06)] sm:px-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 flex-1">
              <div className="h-3 w-36 animate-pulse rounded-full bg-violet-100" />
              <div className="mt-4 h-8 w-64 max-w-full animate-pulse rounded-full bg-slate-100" />
              <div className="mt-3 h-4 w-80 max-w-full animate-pulse rounded-full bg-slate-100" />
              <div className="mt-4 flex flex-wrap gap-2">
                <div className="h-7 w-28 animate-pulse rounded-full bg-slate-100" />
                <div className="h-7 w-32 animate-pulse rounded-full bg-slate-100" />
              </div>
            </div>
            <div className="h-12 w-full animate-pulse rounded-2xl bg-violet-100 sm:w-52" />
          </div>
        </section>
      ) : null}

      {ownerOperationMeta ? (
        <section className="rounded-[1.35rem] border border-violet-200 bg-white px-4 py-4 shadow-[0_18px_44px_rgba(91,33,182,0.08)] sm:px-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-violet-600">
                {tr('Ready now', 'Prête maintenant')}
              </p>
              <h2 className="mt-2 text-2xl font-black tracking-[-0.03em] text-slate-950 sm:text-3xl">
                {ownerOperationMeta.title}
              </h2>
              {ownerOperationMeta.detail ? (
                <p className="mt-2 truncate text-sm font-semibold text-slate-600 sm:text-base">
                  {ownerOperationMeta.detail}
                </p>
              ) : null}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {identityStatusDisplay.actionable ? (
                  <Link
                    to="/account/verification"
                    state={{ from: currentPath }}
                    onClick={() => trackTrustCenterSelection('home_primary_operation_status')}
                    className="transition hover:translate-y-[-1px]"
                  >
                    <StatusChip label={identityStatusDisplay.label} tone={identityStatusDisplay.tone} className="cursor-pointer" />
                  </Link>
                ) : (
                  <StatusChip label={identityStatusDisplay.label} tone={identityStatusDisplay.tone} />
                )}
                {effectiveOwnerVehicleCount > 0 ? (
                  <span className="inline-flex rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-xs font-bold text-violet-700">
                    {getOwnerJourneyLabel(primaryOwnerJourneyState, tr)}
                  </span>
                ) : null}
                <Link
                  to={heroSecondaryAction.to}
                  state={heroSecondaryAction.state}
                  className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-bold text-slate-700 transition hover:border-violet-200 hover:bg-violet-50 hover:text-violet-700"
                >
                  {heroSecondaryAction.label}
                </Link>
              </div>
            </div>
            <Link
              to={ownerOperationMeta.href}
              state={{
                from: currentPath,
                ownerOperationRequest: ownerOperationMeta.request,
              }}
              onClick={() => {
                try {
                  if (ownerOperationMeta.request?.id) {
                    window.sessionStorage.setItem(
                      `driveout_owner_operation_request:${String(ownerOperationMeta.request.id)}`,
                      JSON.stringify(ownerOperationMeta.request)
                    );
                  }
                } catch {
                  // Navigation still works without the warm route snapshot.
                }
                trackNextActionSelection('home_primary_operation', {
                  ...ownerOperationMeta.action,
                  to: ownerOperationMeta.href,
                });
              }}
              onMouseEnter={() => void preloadOwnerOperationsRoute()}
              onFocus={() => void preloadOwnerOperationsRoute()}
              className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-600 px-4 py-3 text-sm font-bold text-white shadow-[0_16px_32px_rgba(91,33,182,0.22)] transition hover:translate-y-[-1px] sm:w-auto sm:min-w-[210px]"
            >
              <CalendarClock className="h-4 w-4" />
              <span>{ownerOperationMeta.ctaLabel}</span>
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </section>
      ) : null}

      {shouldShowWorkspaceHero ? (
        <section className="rounded-[1.65rem] border border-violet-300 bg-white p-4 shadow-[0_18px_50px_rgba(15,23,42,0.05),0_0_0_1px_rgba(167,139,250,0.2)] backdrop-blur transition-all sm:rounded-[1.85rem] sm:p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-[0.28em] text-violet-500">
                {homeHero.eyebrow}
              </p>
              <h1 className="mt-2 text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">
                {homeHero.title}
              </h1>
              <p className="mt-2 text-sm font-medium leading-6 text-slate-500 sm:text-base">
                {homeHero.description}
              </p>
            </div>

            <div className="flex flex-col items-start gap-3 lg:items-end">
              <div className="flex flex-wrap gap-2 lg:justify-end">
                {identityStatusDisplay.actionable ? (
                  <Link
                    to="/account/verification"
                    state={{ from: currentPath }}
                    onClick={() => trackTrustCenterSelection('home_hero_status_chip')}
                    className="transition hover:translate-y-[-1px]"
                  >
                    <StatusChip label={identityStatusDisplay.label} tone={identityStatusDisplay.tone} className="cursor-pointer" />
                  </Link>
                ) : (
                  <StatusChip label={identityStatusDisplay.label} tone={identityStatusDisplay.tone} />
                )}
                {isOwnerWorkspace && effectiveOwnerVehicleCount > 0 ? (
                  <span className="inline-flex rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-xs font-semibold text-violet-700">
                    {getOwnerJourneyLabel(primaryOwnerJourneyState, tr)}
                  </span>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-2 lg:justify-end">
                {showHeroPrimaryAction && nextBestAction.disabled ? (
                  <div className="inline-flex items-center gap-2 rounded-2xl bg-slate-300 px-4 py-3 text-sm font-semibold text-white opacity-80">
                    <span>{nextBestAction.ctaLabel}</span>
                    <ArrowRight className="h-4 w-4" />
                  </div>
                ) : showHeroPrimaryAction ? (
                  <Link
                    to={nextBestAction.to}
                    state={nextBestAction.state}
                    onClick={() => trackNextActionSelection('home_hero_primary')}
                    onMouseEnter={() => {
                      if (String(nextBestAction.to || '').includes('/account/operations/')) {
                        void preloadOwnerOperationsRoute();
                      }
                    }}
                    onFocus={() => {
                      if (String(nextBestAction.to || '').includes('/account/operations/')) {
                        void preloadOwnerOperationsRoute();
                      }
                    }}
                    className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-violet-600 to-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow-[0_16px_32px_rgba(91,33,182,0.24)] transition hover:translate-y-[-1px]"
                  >
                    <span>{nextBestAction.ctaLabel}</span>
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                ) : null}
                <Link
                  to={heroSecondaryAction.to}
                  state={heroSecondaryAction.state}
                  className="inline-flex items-center gap-2 rounded-2xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm font-semibold text-violet-700 transition hover:border-violet-300 hover:bg-violet-100"
                >
                  <span>{heroSecondaryAction.label}</span>
                </Link>
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {showReviewStatusSection ? (
        <section className="rounded-[1.6rem] border border-slate-200 bg-white px-5 py-4 shadow-[0_16px_40px_rgba(15,23,42,0.05)]">
          <AccountWorkspaceSectionHeader
            title={tr('Review status', 'Statut des validations')}
            titleClassName="text-base font-bold text-slate-950"
          />
          <div className="mt-4 space-y-3">
            {reviewSignals.map((signal) => (
              <ActionItem
                key={signal.key}
                label={signal.label}
                detail={signal.detail}
                to={signal.to}
                state={signal.state}
                onClick={() => {
                  if (signal.key === 'account_verification') {
                    trackTrustCenterSelection('home_review_status');
                    return;
                  }
                  trackNextActionSelection('home_review_status', signal);
                }}
                icon={signal.icon}
                tone={signal.tone}
                emphasis={signal.key === 'account_verification'}
              />
            ))}
          </div>
        </section>
      ) : null}

      {showNextStepSection ? (
        <section className="rounded-[1.6rem] border border-slate-200 bg-white px-5 py-4 shadow-[0_16px_40px_rgba(15,23,42,0.05)]">
          <AccountWorkspaceSectionHeader
            title={tr('Next step', 'Prochaine étape')}
            titleClassName="text-base font-bold text-slate-950"
          />
          <div className="mt-4">
            <ActionItem
              label={nextBestAction.title}
              detail={nextBestAction.detail}
              to={nextBestAction.to}
              state={nextBestAction.state}
              disabled={nextBestAction.disabled}
              onClick={() => trackNextActionSelection('home_next_step_card')}
              icon={nextBestAction.icon}
              tone={nextBestAction.tone}
              emphasis
            />
          </div>
        </section>
      ) : null}

      <section className="rounded-[1.4rem] border border-slate-200 bg-white px-4 py-4 shadow-[0_12px_30px_rgba(15,23,42,0.04)]">
        <AccountWorkspaceSectionHeader
          title={tr('Snapshot', 'Aperçu')}
          titleClassName="text-base font-bold text-slate-950"
        />
        <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-5">
          {snapshotEntryCards.map((card) => (
            <ProfileEntryCard
              key={card.key}
              to={card.entry.to}
              state={{ from: currentPath }}
              eyebrow={card.eyebrow}
              value={card.entry.value}
              valueVariant={card.entry.valueVariant}
              label={card.entry.label}
              ctaLabel={card.entry.ctaLabel}
            />
          ))}
        </div>
      </section>

      {isOwnerWorkspace && listingProgressSummary && !shouldSuppressListingProgressForOwnerExecution ? (
        <OwnerListingSetupGuide
          progress={listingProgressSummary}
          tr={tr}
          onStepClick={(step) =>
            trackNextActionSelection('home_listing_progress', {
              ...step,
              to: step?.target?.to || step?.to || '',
              state: step?.target?.state || step?.state,
            })
          }
        />
      ) : null}

      {supportUnreadCount > 0 || (notificationPreferences.customerMessages && customerUnreadCount > 0) ? (
        <section className="rounded-[1.6rem] border border-slate-200 bg-white px-5 py-4 shadow-[0_16px_40px_rgba(15,23,42,0.05)]">
          <AccountWorkspaceSectionHeader
            title={tr('Inbox signals', "Signaux d'Inbox")}
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
                label={tr('Customer Inbox', 'Inbox client')}
                detail={
                  customerUnreadCount === 1
                    ? tr('You have 1 unread customer conversation.', 'Vous avez 1 conversation client non lue.')
                    : tr(`You have ${customerUnreadCount} unread customer conversations.`, `Vous avez ${customerUnreadCount} conversations clients non lues.`)
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

      {error ? (
        <section className="rounded-[1.6rem] border border-rose-200 bg-white px-5 py-4 text-sm text-rose-700 shadow-[0_16px_40px_rgba(15,23,42,0.05)]">
          {error}
        </section>
      ) : null}

      {shouldShowLiveActivity ? (
        <section className="rounded-[1.6rem] border border-violet-200 bg-[linear-gradient(135deg,#ffffff_0%,#faf5ff_100%)] px-5 py-4 shadow-[0_16px_40px_rgba(15,23,42,0.05)]">
          <AccountWorkspaceSectionHeader
            title={tr('Live activity', 'Activité en direct')}
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
