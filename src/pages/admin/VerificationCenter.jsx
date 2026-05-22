import React, { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import {
  AlertTriangle,
  Building2,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  ClipboardList,
  Clock3,
  LoaderCircle,
  RefreshCw,
  ReceiptText,
  Rocket,
  Search,
  ShieldCheck,
  SquareArrowOutUpRight,
  UserRound,
  X,
  XCircle,
} from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import MarketplaceModerationModal from '../../components/admin/MarketplaceModerationModal';
import ProofPreviewModal from '../../components/common/ProofPreviewModal';
import VerificationReviewDrawer from '../../components/verification/VerificationReviewDrawer';
import VerificationStatusBadge from '../../components/verification/VerificationStatusBadge';
import MarketplaceAdminService from '../../services/MarketplaceAdminService';
import VerificationService from '../../services/VerificationService';
import { financeApiV2 } from '../../services/financeApiV2';
import walletTopupApi from '../../services/walletTopupApi';
import { syncWalletTopupReviewMessage } from '../../services/paymentProofReviewMessages';
import {
  listBusinessOwnersFromRegistry,
} from '../../services/TenantProvisioningAdminService';
import {
  approveBusinessOwner,
  reactivateBusinessOwner,
  rejectBusinessOwner,
  requestBusinessOwnerInfo,
  suspendBusinessOwner,
} from '../../services/UserService';
import { useAuth } from '../../contexts/AuthContext';
import { buildAdminMarketplaceListingPath } from '../../utils/marketplaceAdminLinks';
import { getVerificationLabel, getVerificationTypeLabel } from '../../utils/verificationStatus';
import i18n from '../../i18n';

const WORKFLOW_TABS = [
  { id: 'all', label: { en: 'All', fr: 'Tout' } },
  { id: 'profile', label: { en: 'Identity', fr: 'Identité' } },
  { id: 'vehicle', label: { en: 'Vehicle compliance', fr: 'Conformité véhicule' } },
  { id: 'listing', label: { en: 'Marketplace listings', fr: 'Annonces marketplace' } },
  { id: 'business_owners', label: { en: 'Business onboarding', fr: 'Onboarding business' } },
  { id: 'payment_proofs', label: { en: 'Payment proofs', fr: 'Preuves de paiement' } },
];

const STATUS_STRIP = [
  { id: 'pending', label: { en: 'Pending', fr: 'En attente' } },
  { id: 'approved', label: { en: 'Verified', fr: 'Vérifié' } },
  { id: 'rejected', label: { en: 'Needs changes', fr: 'À corriger' } },
  { id: 'expired', label: { en: 'Expired', fr: 'Expiré' } },
];

const getVerificationStatusIcon = (status) => {
  switch (String(status || '').trim().toLowerCase()) {
    case 'approved':
      return CheckCircle2;
    case 'rejected':
      return XCircle;
    case 'expired':
      return AlertTriangle;
    case 'pending':
    default:
      return Clock3;
  }
};

const PROFILE_DOCUMENT_TYPES = ['all', 'profile_id', 'driver_license'];
const VEHICLE_DOCUMENT_TYPES = ['all', 'vehicle_registration', 'vehicle_insurance', 'proof_of_ownership'];
const LISTING_SUMMARY_FILTERS = ['all', 'live', 'draft', 'pending_review'];

const buildVerificationFinanceFilters = () => {
  const today = new Date();
  const start = new Date(today);
  start.setDate(start.getDate() - 30);

  return {
    startDate: start.toISOString().split('T')[0],
    endDate: today.toISOString().split('T')[0],
    vehicleIds: [],
    customerIds: [],
    orgId: '',
  };
};

const formatDate = (value) => {
  if (!value) return '—';
  return new Date(value).toLocaleDateString();
};

const formatCurrency = (value, language = 'en') =>
  `${new Intl.NumberFormat(language === 'fr' ? 'fr-MA' : 'en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Number(value || 0))} MAD`;

const isPaymentProofPending = (status) =>
  ['pending', 'submitted', 'review'].includes(String(status || '').trim().toLowerCase());

const isImageReceiptUrl = (value) =>
  Boolean(value && /\.(png|jpe?g|webp|gif|avif)(\?|#|$)/i.test(String(value)));

const buildAdminCustomerProfileHref = ({ authUserId = '', email = '' } = {}) => {
  const params = new URLSearchParams();
  const normalizedAuthUserId = String(authUserId || '').trim();
  const normalizedEmail = String(email || '').trim().toLowerCase();

  if (normalizedAuthUserId) params.set('authUserId', normalizedAuthUserId);
  if (normalizedEmail) params.set('email', normalizedEmail);

  const query = params.toString();
  return query ? `/admin/customers/profile?${query}` : '';
};

const summarizeVerificationTypes = (documents = [], language = 'en') => {
  const labels = [...new Set(
    (Array.isArray(documents) ? documents : [])
      .map((document) => String(document?.verification_type || '').trim())
      .filter(Boolean)
  )].map((type) => getVerificationTypeLabel(type, language));

  return labels.join(', ');
};

const formatMarketplaceStatus = (status, language) => {
  const normalized = String(status || '').toLowerCase();
  const labels = {
    draft: language === 'fr' ? 'Brouillon' : 'Draft',
    pending_review: language === 'fr' ? 'En attente de revue' : 'Pending review',
    pending: language === 'fr' ? 'En attente' : 'Pending',
    approved: language === 'fr' ? 'Approuvé' : 'Approved',
    live: language === 'fr' ? 'En ligne' : 'Live',
    rejected: language === 'fr' ? 'Refusé' : 'Rejected',
    unpublished: language === 'fr' ? 'Masqué' : 'Unpublished',
    needs_info: language === 'fr' ? 'Infos requises' : 'Needs info',
    suspended: language === 'fr' ? 'Suspendu' : 'Suspended',
  };
  return labels[normalized] || String(status || '').replace(/_/g, ' ');
};

const buildVerificationCaseReference = (request = {}) => {
  const rawSeed = `${String(request?.entity_type || '').trim().toLowerCase()}:${String(request?.entity_id || request?.owner_user_id || request?.id || '').trim()}`;
  let hash = 0;
  for (let index = 0; index < rawSeed.length; index += 1) {
    hash = (hash * 31 + rawSeed.charCodeAt(index)) >>> 0;
  }
  const prefix = String(request?.entity_type || '').trim().toLowerCase() === 'vehicle' ? 'VC' : 'PC';
  return `${prefix}-${hash.toString(36).toUpperCase().slice(-6).padStart(6, '0')}`;
};

const normalizeWorkflowStatus = (kind, value) => {
  const normalized = String(value || '').trim().toLowerCase();

  if (kind === 'payment_proofs') {
    if (['approved', 'completed', 'credited'].includes(normalized)) return 'approved';
    if (['rejected', 'declined', 'needs_changes', 'needs_info'].includes(normalized)) return 'rejected';
    if (normalized === 'expired') return 'expired';
    return 'pending';
  }

  if (kind === 'listing') {
    if (['pending', 'pending_review', 'draft'].includes(normalized)) return 'pending';
    if (['approved', 'live', 'unpublished'].includes(normalized)) return 'approved';
    if (['rejected', 'needs_info', 'needs_changes', 'suspended'].includes(normalized)) return 'rejected';
    if (normalized === 'expired') return 'expired';
    return 'pending';
  }

  if (kind === 'business_owners') {
    if (['pending', 'pending_verification'].includes(normalized)) return 'pending';
    if (normalized === 'approved') return 'approved';
    if (['rejected', 'needs_info', 'suspended'].includes(normalized)) return 'rejected';
    return 'pending';
  }

  if (normalized === 'approved') return 'approved';
  if (['rejected', 'suspended'].includes(normalized)) return 'rejected';
  if (normalized === 'expired') return 'expired';
  return 'pending';
};

const getWorkflowBadgeTone = (kind, status) => {
  switch (status) {
    case 'approved':
      return 'border-emerald-200 bg-emerald-50 text-emerald-700';
    case 'rejected':
      return 'border-rose-200 bg-rose-50 text-rose-700';
    case 'expired':
      return 'border-amber-200 bg-amber-50 text-amber-700';
    default:
      if (kind === 'payment_proofs') {
        return 'border-amber-200 bg-amber-50 text-amber-700';
      }
      if (kind === 'profile') {
        return 'border-amber-200 bg-amber-50 text-amber-700';
      }
      if (kind === 'vehicle') {
        return 'border-sky-200 bg-sky-50 text-sky-700';
      }
      if (kind === 'business_owners') {
        return 'border-emerald-200 bg-emerald-50 text-emerald-700';
      }
      return 'border-violet-200 bg-violet-50 text-violet-700';
  }
};

const getWorkflowKindMeta = (kind, tr) => {
  if (kind === 'payment_proofs') {
    return {
      label: tr('Payment proof', 'Preuve de paiement'),
      iconWrapClassName: 'bg-amber-100 text-amber-700',
      accentClassName: 'border-amber-200 bg-amber-50 text-amber-700',
      reviewButtonClassName: 'border-amber-200 bg-amber-50 text-amber-800 hover:border-amber-300 hover:bg-amber-100',
    };
  }

  if (kind === 'profile') {
    return {
      label: tr('Identity', 'Identité'),
      iconWrapClassName: 'bg-slate-100 text-slate-700',
      accentClassName: 'border-slate-200 bg-slate-50 text-slate-700',
      reviewButtonClassName: 'border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-300 hover:bg-slate-100',
    };
  }

  if (kind === 'vehicle') {
    return {
      label: tr('Vehicle compliance', 'Conformité véhicule'),
      iconWrapClassName: 'bg-sky-100 text-sky-700',
      accentClassName: 'border-sky-200 bg-sky-50 text-sky-700',
      reviewButtonClassName: 'border-sky-200 bg-sky-50 text-sky-700 hover:border-sky-300 hover:bg-sky-100',
    };
  }

  if (kind === 'business_owners') {
    return {
      label: tr('Business onboarding', 'Onboarding business'),
      iconWrapClassName: 'bg-emerald-100 text-emerald-700',
      accentClassName: 'border-emerald-200 bg-emerald-50 text-emerald-700',
      reviewButtonClassName: 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:border-emerald-300 hover:bg-emerald-100',
    };
  }

  return {
    label: tr('Marketplace listing', 'Annonce marketplace'),
    iconWrapClassName: 'bg-violet-100 text-violet-700',
    accentClassName: 'border-violet-200 bg-violet-50 text-violet-700',
    reviewButtonClassName: 'border-violet-200 bg-violet-50 text-violet-700 hover:border-violet-300 hover:bg-violet-100',
  };
};

const getReviewActionClassName = (kind, status, tr) => {
  const normalizedStatus = String(status || '').trim().toLowerCase();
  if (kind === 'payment_proofs') {
    return {
      label: tr('Open proof queue', 'Ouvrir la file des preuves'),
      className: 'border-amber-200 bg-amber-50 text-amber-800 hover:border-amber-300 hover:bg-amber-100',
    };
  }

  if (normalizedStatus === 'approved') {
    return {
      label: tr('View', 'Voir'),
      className: 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:border-emerald-300 hover:bg-emerald-100',
    };
  }
  if (normalizedStatus === 'rejected') {
    return {
      label: tr('Review', 'Réviser'),
      className: 'border-rose-200 bg-rose-50 text-rose-700 hover:border-rose-300 hover:bg-rose-100',
    };
  }
  if (normalizedStatus === 'expired') {
    return {
      label: tr('Review', 'Réviser'),
      className: 'border-amber-200 bg-amber-50 text-amber-700 hover:border-amber-300 hover:bg-amber-100',
    };
  }

  const workflowMeta = getWorkflowKindMeta(kind, tr);
  return {
    label: tr('Review', 'Réviser'),
    className: workflowMeta.reviewButtonClassName,
  };
};

const getBusinessOwnerStatus = (entry) =>
  String(
    entry?.business_account?.approval_status ||
      entry?.business_account?.application_status ||
      'pending'
  ).trim().toLowerCase();

const buildBusinessOwnerSubtitle = (entry, tr) => {
  const businessAccount = entry?.business_account || {};
  const companyName = String(businessAccount.company_name || '').trim();
  const email = String(businessAccount.email || '').trim();
  const accountType = String(businessAccount.account_type || '').trim();
  return [companyName, email, accountType || tr('Business owner', 'Business owner')]
    .filter(Boolean)
    .join(' • ');
};

const buildVerificationRows = (requests = [], language, tr) =>
  requests.map((request) => {
    const isVehicle = request.entity_type === 'vehicle';
    const caseReference = buildVerificationCaseReference(request);
    const documentSummary = summarizeVerificationTypes(request.documents, language);
    const ownerLabel =
      request.owner_email ||
      request.entity_email ||
      request.profile_snapshot?.email ||
      request.profile_snapshot?.full_name ||
      request.owner_user_id ||
      '—';

    return {
      id: `verification:${request.id}`,
      rawId: String(request.id || ''),
      kind: isVehicle ? 'vehicle' : 'profile',
      title: isVehicle
        ? tr('Vehicle compliance review', 'Revue conformité véhicule')
        : tr('Identity review', "Revue d'identité"),
      subtitle: isVehicle
        ? [caseReference, request.display_subtitle, documentSummary].filter(Boolean).join(' • ') || '—'
        : [caseReference, ownerLabel, documentSummary].filter(Boolean).join(' • ') || '—',
      owner: ownerLabel,
      status: normalizeWorkflowStatus('verification', request.status),
      statusLabel: getVerificationLabel(request.status, language),
      submittedAt: request.created_at || null,
      raw: request,
    };
  });

const buildListingRows = (reviewQueue = [], language, tr) =>
  reviewQueue.map((row) => ({
    id: `listing:${row.id}`,
    rawId: String(row.id || ''),
    kind: 'listing',
    title: row.title || tr('Marketplace listing', 'Annonce marketplace'),
    subtitle: [row.ownerDisplayName, row.cityName].filter(Boolean).join(' • ') || '—',
    owner: row.ownerDisplayName || '—',
    status: normalizeWorkflowStatus('listing', row.listingStatus),
    statusLabel: formatMarketplaceStatus(row.listingStatus, language),
    submittedAt: row.reviewSubmittedAt || row.created_at || row.updated_at || null,
    raw: row,
  }));

const buildBusinessOwnerRows = (entries = [], language, tr) =>
  entries.map((entry) => {
    const businessAccount = entry?.business_account || {};
    const status = getBusinessOwnerStatus(entry);
    return {
      id: `business-owner:${businessAccount.id}`,
      rawId: String(businessAccount.id || ''),
      kind: 'business_owners',
      title:
        businessAccount.full_name ||
        businessAccount.company_name ||
        businessAccount.email ||
        tr('Business owner request', 'Demande business owner'),
      subtitle: buildBusinessOwnerSubtitle(entry, tr),
      owner: businessAccount.email || businessAccount.full_name || '—',
      status: normalizeWorkflowStatus('business_owners', status),
      statusLabel: formatMarketplaceStatus(status, language),
      submittedAt: businessAccount.created_at || businessAccount.updated_at || null,
      raw: entry,
    };
  });

const buildPaymentProofRows = (entries = [], language, tr) =>
  entries.map((entry) => {
    const proofType = String(entry?.proofType || '').toLowerCase();
    const status = normalizeWorkflowStatus('payment_proofs', entry?.status);
    const bookingReference = entry?.bookingReference ? `${tr('Booking', 'Réservation')} ${entry.bookingReference}` : '';
    return {
      id: `payment-proof:${entry.id}`,
      rawId: String(entry.id || ''),
      kind: 'payment_proofs',
      title: proofType === 'wallet'
        ? tr('Wallet deposit proof', 'Preuve de dépôt portefeuille')
        : tr('Booking payment proof', 'Preuve de paiement réservation'),
      subtitle: [
        entry?.methodLabel,
        entry?.customerName,
        bookingReference,
      ].filter(Boolean).join(' • ') || '—',
      owner: entry?.customerName || '—',
      status,
      statusLabel: formatMarketplaceStatus(entry?.status || status, language),
      submittedAt: entry?.submittedAt || null,
      amount: Number(entry?.amount || 0),
      customerUserId: entry?.customerUserId || '',
      customerEmail: entry?.customerEmail || '',
      proofType,
      proofUrl: entry?.proofUrl || '',
      customerNote: entry?.customerNote || '',
      reviewNote: entry?.reviewNote || '',
      methodLabel: entry?.methodLabel || '',
      bookingReference: entry?.bookingReference || null,
      raw: entry,
    };
  });

const ReviewShell = ({ title, subtitle, onClose, children }) => (
  <div
    className="fixed inset-0 z-[110] bg-slate-950/35 backdrop-blur-[2px]"
    onMouseDown={onClose}
  >
    <div
      className="ml-auto flex h-full w-full max-w-2xl flex-col border-l border-slate-200 bg-white shadow-[0_24px_80px_rgba(15,23,42,0.18)]"
      onMouseDown={(event) => event.stopPropagation()}
    >
      <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-5">
        <div className="min-w-0">
          <h3 className="text-2xl font-black tracking-tight text-slate-950">{title}</h3>
          {subtitle ? <p className="mt-1 text-sm font-medium text-slate-500">{subtitle}</p> : null}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-2xl border border-slate-200 p-2 text-slate-500 transition hover:border-slate-300 hover:text-slate-700"
        >
          <X className="h-5 w-5" />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">{children}</div>
    </div>
  </div>
);

const VerificationCenter = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, userProfile } = useAuth();
  const isFrench = i18n.resolvedLanguage === 'fr';
  const tr = (en, fr) => (isFrench ? fr : en);
  const language = isFrench ? 'fr' : 'en';

  const [requests, setRequests] = useState([]);
  const [groupedRequests, setGroupedRequests] = useState([]);
  const [marketplaceSnapshot, setMarketplaceSnapshot] = useState(null);
  const [financeTrustData, setFinanceTrustData] = useState(null);
  const [businessOwners, setBusinessOwners] = useState([]);
  const [loading, setLoading] = useState(false);

  const [activeTab, setActiveTab] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState('pending');
  const [search, setSearch] = useState('');
  const [profileDocumentType, setProfileDocumentType] = useState('all');
  const [vehicleDocumentType, setVehicleDocumentType] = useState('all');
  const [listingSummaryFilter, setListingSummaryFilter] = useState('all');
  const [collapsedQueueSections, setCollapsedQueueSections] = useState({
    pending: false,
    approved: true,
    rejected: true,
    expired: true,
  });

  const [selectedRequest, setSelectedRequest] = useState(null);
  const [selectedDocumentId, setSelectedDocumentId] = useState('');
  const [selectedListingRow, setSelectedListingRow] = useState(null);
  const [selectedBusinessOwnerEntry, setSelectedBusinessOwnerEntry] = useState(null);
  const [selectedPaymentProofRow, setSelectedPaymentProofRow] = useState(null);
  const [proofPreview, setProofPreview] = useState(null);

  const [marketplaceActionLoading, setMarketplaceActionLoading] = useState('');
  const [marketplaceModalState, setMarketplaceModalState] = useState({ open: false, mode: null, row: null });
  const [businessOwnerActionLoading, setBusinessOwnerActionLoading] = useState('');
  const [businessOwnerNote, setBusinessOwnerNote] = useState('');
  const [paymentProofActionLoading, setPaymentProofActionLoading] = useState('');
  const [paymentProofReviewNote, setPaymentProofReviewNote] = useState('');
  const [highlightedRow, setHighlightedRow] = useState(null);

  const adminLabel = String(
    userProfile?.username ||
      userProfile?.fullName ||
      userProfile?.full_name ||
      user?.user_metadata?.username ||
      user?.user_metadata?.full_name ||
      user?.email ||
      'Admin'
  ).trim();

  const loadRequests = useCallback(async () => {
    try {
      setLoading(true);
      const [verificationResult, marketplaceResult, businessOwnerResult, financeTrustResult] = await Promise.all([
        VerificationService.getVerificationRequests({
          status: 'all',
          entityType: 'all',
          verificationType: 'all',
          limit: 160,
        }),
        MarketplaceAdminService.getSnapshot().catch(() => ({ snapshot: null })),
        listBusinessOwnersFromRegistry().catch(() => []),
        financeApiV2.getFinanceTrustData(buildVerificationFinanceFilters()).catch(() => null),
      ]);

      setRequests(verificationResult.requests || []);
      setGroupedRequests(verificationResult.groupedRequests || []);
      setMarketplaceSnapshot(marketplaceResult?.snapshot || null);
      setBusinessOwners(Array.isArray(businessOwnerResult) ? businessOwnerResult : []);
      setFinanceTrustData(financeTrustResult || null);
    } catch (error) {
      console.warn('Unable to load verification center data:', error.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRequests();
  }, [loadRequests]);

  useEffect(() => {
    const requestedStatus = location.state?.verificationStatus;
    if (requestedStatus && requestedStatus !== selectedStatus) {
      setSelectedStatus(requestedStatus);
    }
  }, [location.state, selectedStatus]);

  useEffect(() => {
    const verificationThread = location.state?.verificationThread;
    if (!verificationThread || !groupedRequests.length || selectedRequest) return;

    const matchingRequest = groupedRequests.find((request) => {
      if (
        verificationThread.verificationRequestId &&
        (request.documents || []).some(
          (document) => String(document.id) === String(verificationThread.verificationRequestId)
        )
      ) {
        return true;
      }

      const entityMatches =
        String(request.entity_type || '') === String(verificationThread.entityType || '') &&
        String(request.entity_id || '') === String(verificationThread.entityId || '');

      if (!entityMatches) return false;

      if (!verificationThread.verificationType) return true;

      return (request.documents || []).some(
        (document) =>
          String(document.verification_type || '') === String(verificationThread.verificationType || '')
      );
    });

    if (matchingRequest) {
      setActiveTab(matchingRequest.entity_type === 'vehicle' ? 'vehicle' : 'profile');
      setSelectedRequest(matchingRequest);
      setSelectedDocumentId(String(verificationThread.verificationRequestId || ''));
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [groupedRequests, location.pathname, location.state, navigate, selectedRequest]);

  useEffect(() => {
    if (!highlightedRow?.id) return undefined;

    const timerId = window.setTimeout(() => {
      setHighlightedRow(null);
    }, 3200);

    return () => window.clearTimeout(timerId);
  }, [highlightedRow]);

  useEffect(() => {
    setCollapsedQueueSections({
      pending: false,
      approved: true,
      rejected: true,
      expired: true,
    });
  }, [activeTab, listingSummaryFilter, selectedStatus]);

  const verificationRows = useMemo(
    () => buildVerificationRows(groupedRequests, language, tr),
    [groupedRequests, language]
  );
  const listingRows = useMemo(
    () => buildListingRows(marketplaceSnapshot?.reviewQueue || [], language, tr),
    [language, marketplaceSnapshot?.reviewQueue]
  );
  const businessOwnerRows = useMemo(
    () => buildBusinessOwnerRows(businessOwners, language, tr),
    [businessOwners, language]
  );
  const paymentProofRows = useMemo(
    () => buildPaymentProofRows(financeTrustData?.paymentProofQueue || [], language, tr),
    [financeTrustData?.paymentProofQueue, language]
  );

  const paymentProofStatusCounts = useMemo(() => {
    const counts = { pending: 0, approved: 0, rejected: 0, expired: 0 };
    paymentProofRows.forEach((row) => {
      if (counts[row.status] !== undefined) counts[row.status] += 1;
    });

    const pendingProofCount =
      Number(financeTrustData?.pendingBookingProofCount || 0) +
      Number(financeTrustData?.pendingWalletProofCount || 0);

    return {
      ...counts,
      pending: Math.max(counts.pending, pendingProofCount),
    };
  }, [financeTrustData?.pendingBookingProofCount, financeTrustData?.pendingWalletProofCount, paymentProofRows]);

  const allRows = useMemo(
    () => [...verificationRows, ...listingRows, ...businessOwnerRows, ...paymentProofRows],
    [verificationRows, listingRows, businessOwnerRows, paymentProofRows]
  );

  const tabRows = useMemo(() => {
    switch (activeTab) {
      case 'profile':
        return verificationRows.filter((row) => row.kind === 'profile');
      case 'vehicle':
        return verificationRows.filter((row) => row.kind === 'vehicle');
      case 'listing':
        return listingRows;
      case 'business_owners':
        return businessOwnerRows;
      case 'payment_proofs':
        return paymentProofRows;
      case 'all':
      default:
        return allRows;
    }
  }, [activeTab, allRows, businessOwnerRows, listingRows, paymentProofRows, verificationRows]);

  const filteredRows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return tabRows.filter((row) => {
      if (selectedStatus !== 'all' && row.status !== selectedStatus) return false;

      if (activeTab === 'profile' && profileDocumentType !== 'all') {
        const docs = Array.isArray(row.raw?.documents) ? row.raw.documents : [];
        const hasType = docs.some((document) => String(document?.verification_type || '') === profileDocumentType);
        if (!hasType) return false;
      }

      if (activeTab === 'vehicle' && vehicleDocumentType !== 'all') {
        const docs = Array.isArray(row.raw?.documents) ? row.raw.documents : [];
        const hasType = docs.some((document) => String(document?.verification_type || '') === vehicleDocumentType);
        if (!hasType) return false;
      }

      if (activeTab === 'listing' && listingSummaryFilter !== 'all') {
        const normalizedListingStatus = String(row.raw?.listingStatus || '').trim().toLowerCase();
        const isLive = Boolean(row.raw?.marketplaceVisible);
        const matchesListingSummaryFilter =
          (listingSummaryFilter === 'live' && isLive) ||
          (listingSummaryFilter === 'draft' && normalizedListingStatus === 'draft') ||
          (listingSummaryFilter === 'pending_review' && ['pending_review', 'pending'].includes(normalizedListingStatus));

        if (!matchesListingSummaryFilter) return false;
      }

      if (!needle) return true;

      return [row.title, row.subtitle, row.owner, row.statusLabel]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(needle);
    });
  }, [activeTab, listingSummaryFilter, profileDocumentType, search, selectedStatus, tabRows, vehicleDocumentType]);

  const statusCounts = useMemo(() => {
    if (activeTab === 'payment_proofs') {
      return paymentProofStatusCounts;
    }

    const counts = { pending: 0, approved: 0, rejected: 0, expired: 0 };
    tabRows.forEach((row) => {
      if (counts[row.status] !== undefined) counts[row.status] += 1;
    });
    return counts;
  }, [activeTab, paymentProofStatusCounts, tabRows]);

  const groupedFilteredRows = useMemo(() => {
    const groups = { pending: [], approved: [], rejected: [], expired: [] };
    filteredRows.forEach((row) => {
      if (groups[row.status]) {
        groups[row.status].push(row);
      }
    });
    return groups;
  }, [filteredRows]);

  const activeTabCounts = useMemo(() => {
    const counts = {};
    const applyTabCountFilters = (rows = []) => rows.filter((row) => {
      if (selectedStatus !== 'all' && row.status !== selectedStatus) return false;
      return true;
    });

    WORKFLOW_TABS.forEach((tab) => {
      let rows = allRows;
      if (tab.id === 'profile') rows = verificationRows.filter((row) => row.kind === 'profile');
      if (tab.id === 'vehicle') rows = verificationRows.filter((row) => row.kind === 'vehicle');
      if (tab.id === 'listing') rows = listingRows;
      if (tab.id === 'business_owners') rows = businessOwnerRows;
      if (tab.id === 'payment_proofs') {
        if (selectedStatus === 'all') {
          counts[tab.id] = paymentProofRows.length;
          return;
        }
        counts[tab.id] = paymentProofStatusCounts[selectedStatus] || 0;
        return;
      }
      counts[tab.id] = applyTabCountFilters(rows).length;
    });
    return counts;
  }, [allRows, businessOwnerRows, listingRows, paymentProofRows.length, paymentProofStatusCounts, selectedStatus, verificationRows]);

  const listingSummaryCards = useMemo(() => {
    const snapshot = marketplaceSnapshot || {};
    const cards = [
      {
        id: 'all',
        label: tr('Total listings', 'Toutes les annonces'),
        count: Number(snapshot.totalListings || 0),
        helper: tr('Everything in marketplace moderation and visibility.', 'Toutes les annonces liées à la modération et à la visibilité.'),
      },
      {
        id: 'live',
        label: tr('Live listings', 'Annonces en ligne'),
        count: Number(snapshot.activeListings || 0),
        helper: tr('Currently visible on the marketplace.', 'Actuellement visibles sur le marketplace.'),
      },
      {
        id: 'draft',
        label: tr('Draft listings', 'Brouillons'),
        count: Number(snapshot.draftListings || 0),
        helper: tr('Not yet submitted or finalized for review.', 'Pas encore soumises ou finalisées pour la revue.'),
      },
      {
        id: 'pending_review',
        label: tr('Pending reviews', 'Revues en attente'),
        count: Number(snapshot.pendingReviewListings || 0),
        helper: tr('Waiting for marketplace moderation decisions.', 'En attente de décisions de modération marketplace.'),
      },
    ];

    return cards.filter((card) => LISTING_SUMMARY_FILTERS.includes(card.id));
  }, [marketplaceSnapshot, tr]);

  const openProfile = useCallback(
    (request) => {
      if (!request?.profile_path) return;
      navigate(request.profile_path, {
        state: {
          verificationDocuments: Array.isArray(request?.documents) ? request.documents : [],
          verificationSummary: {
            status: request?.status || 'pending',
            verificationStatus: request?.status || 'pending',
            pendingCount: (Array.isArray(request?.documents) ? request.documents : []).filter((document) => String(document?.status || 'pending').toLowerCase() === 'pending').length,
            approvedCount: (Array.isArray(request?.documents) ? request.documents : []).filter((document) => String(document?.status || '').toLowerCase() === 'approved').length,
          },
          verificationContext: {
            entityType: request?.entity_type || '',
            entityId: request?.entity_id || '',
          },
        },
      });
    },
    [navigate]
  );

  const runMarketplaceAction = useCallback(async (row, action, payload = {}) => {
    const actionKey = `${row.id}:${action}`;
    setMarketplaceActionLoading(actionKey);
    try {
      const result = await MarketplaceAdminService.updateListingStatus({
        listingId: row.id,
        action,
        ...payload,
      });
      setMarketplaceSnapshot(result.snapshot || null);
      return true;
    } catch (error) {
      console.warn('Unable to update marketplace listing from verification center:', error.message);
      return false;
    } finally {
      setMarketplaceActionLoading('');
    }
  }, []);

  const closeMarketplaceModal = () => setMarketplaceModalState({ open: false, mode: null, row: null });

  const runBusinessOwnerAction = useCallback(async (entry, action) => {
    const authUserId = String(entry?.business_account?.auth_user_id || '').trim();
    if (!authUserId) return;

    const actionKey = `${action}:${entry?.business_account?.id || authUserId}`;
    setBusinessOwnerActionLoading(actionKey);
    try {
      if (action === 'approve') {
        await approveBusinessOwner(authUserId);
      } else if (action === 'needs_info') {
        await requestBusinessOwnerInfo(authUserId);
      } else if (action === 'reject') {
        await rejectBusinessOwner(authUserId, businessOwnerNote.trim());
      } else if (action === 'suspend') {
        await suspendBusinessOwner(authUserId, businessOwnerNote.trim());
      } else if (action === 'reactivate') {
        await reactivateBusinessOwner(authUserId);
      }
      await loadRequests();
      setHighlightedRow({
        id: `business-owner:${entry?.business_account?.id || authUserId}`,
        tone: ['approve', 'reactivate'].includes(action) ? 'success' : 'warning',
      });
      if (action !== 'approve' && action !== 'reactivate') {
        setBusinessOwnerNote('');
      }
    } catch (error) {
      console.warn('Unable to update business owner from verification center:', error.message);
    } finally {
      setBusinessOwnerActionLoading('');
    }
  }, [businessOwnerNote, loadRequests]);

  const runPaymentProofAction = useCallback(async (row, nextStatus) => {
    if (!row || row.proofType !== 'wallet') return;

    const reviewNote = paymentProofReviewNote.trim();
    if (nextStatus === 'rejected' && !reviewNote) {
      toast.error(tr('Add a short rejection note first.', 'Ajoutez d’abord une courte note de rejet.'));
      return;
    }

    const actionKey = `${nextStatus}:${row.rawId}`;
    setPaymentProofActionLoading(actionKey);
    try {
      const reviewResponse = await walletTopupApi.reviewTopup(row.rawId, {
        status: nextStatus,
        reviewNote,
      });
      const topup = reviewResponse?.topup || {};
      const messageSync = await syncWalletTopupReviewMessage({
        row,
        topup,
        nextStatus,
        reviewNote,
        language,
      });

      const nextNormalizedStatus = normalizeWorkflowStatus('payment_proofs', nextStatus);
      const updatedRow = {
        ...row,
        status: nextNormalizedStatus,
        statusLabel: formatMarketplaceStatus(nextStatus, language),
        reviewNote: reviewNote || row.reviewNote,
        reviewedBy: topup.reviewedBy || row.reviewedBy || '',
        reviewedAt: topup.reviewedAt || row.reviewedAt || null,
        customerUpdateStatus: messageSync.status,
        customerUpdateThreadKey: messageSync.threadKey || '',
        customerUpdateError: messageSync.error || '',
      };

      setSelectedPaymentProofRow(updatedRow);
      setFinanceTrustData((current) => {
        if (!current?.paymentProofQueue) return current;
        return {
          ...current,
          paymentProofQueue: current.paymentProofQueue.map((item) =>
            String(item.id) === String(row.rawId)
              ? { ...item, status: nextStatus, reviewNote: reviewNote || item.reviewNote }
              : item
          ),
        };
      });
      setHighlightedRow({
        id: `payment-proof:${row.rawId}`,
        tone: nextNormalizedStatus === 'approved' ? 'success' : 'warning',
      });
      setPaymentProofReviewNote('');
      toast.success(
        nextStatus === 'approved'
          ? tr('Wallet deposit approved and credited.', 'Dépôt portefeuille approuvé et crédité.')
          : tr('Wallet deposit rejected.', 'Dépôt portefeuille rejeté.')
      );
      if (messageSync.status === 'failed') {
        toast.error(tr('Deposit reviewed, but the inbox update could not be sent.', "Dépôt révisé, mais la mise à jour inbox n'a pas pu être envoyée."));
      }
      await loadRequests();
    } catch (error) {
      toast.error(error?.message || tr('Unable to review this payment proof.', 'Impossible de réviser cette preuve de paiement.'));
    } finally {
      setPaymentProofActionLoading('');
    }
  }, [language, loadRequests, paymentProofReviewNote, tr]);

  const renderStatusStrip = () => (
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {STATUS_STRIP.map((item) => {
        const active = selectedStatus === item.id;
        const tone = getWorkflowBadgeTone('all', item.id);
        const StatusIcon = getVerificationStatusIcon(item.id);
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => setSelectedStatus((current) => (current === item.id ? 'all' : item.id))}
            className={`rounded-[1.35rem] border px-4 py-3.5 text-left transition ${
              active
                ? `${tone} shadow-[0_18px_42px_rgba(15,23,42,0.08)]`
                : 'border-slate-200 bg-white text-slate-700 hover:border-violet-200 hover:bg-violet-50/40'
            }`}
          >
            <p className="inline-flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em]">
              <StatusIcon className="h-3 w-3" />
              <span>{item.label[language]}</span>
            </p>
            <p className="mt-2.5 text-[2rem] font-black tracking-tight">
              {statusCounts[item.id] || 0}
            </p>
          </button>
        );
      })}
    </section>
  );

  const renderTabBar = () => (
    <section className="rounded-[1.45rem] border border-violet-100 bg-white p-3.5 shadow-[0_18px_50px_rgba(15,23,42,0.05)] sm:p-4">
      <div className="flex flex-wrap gap-2">
        {WORKFLOW_TABS.map((tab) => {
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`inline-flex items-center gap-2 rounded-[1.1rem] px-3.5 py-2 text-sm font-bold transition ${
                active
                  ? 'bg-slate-950 text-white shadow-[0_14px_30px_rgba(15,23,42,0.18)]'
                  : 'border border-slate-200 bg-white text-slate-700 hover:border-violet-200 hover:text-violet-700'
              }`}
            >
              <span>{tab.label[language]}</span>
              <span className={`rounded-full px-2 py-0.5 text-xs ${active ? 'bg-white/15 text-white' : 'bg-slate-100 text-slate-600'}`}>
                {activeTabCounts[tab.id] || 0}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );

  const renderFilterBar = () => (
    <section className="rounded-[1.45rem] border border-violet-100 bg-white p-4 shadow-[0_18px_50px_rgba(15,23,42,0.05)] sm:p-5">
      <div className="flex flex-col gap-3.5 xl:flex-row xl:items-end xl:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-violet-500">
            {tr('Verification Center', 'Centre de vérification')}
          </p>
          <h1 className="mt-1.5 text-[2rem] font-bold tracking-tight text-slate-950 sm:text-[2.1rem]">
            {WORKFLOW_TABS.find((tab) => tab.id === activeTab)?.label[language] || tr('All', 'Tout')}
          </h1>
          <p className="mt-1.5 max-w-3xl text-sm leading-6 text-slate-500">
            {activeTab === 'all' && tr('Scan every queue from one place, then open the right drawer to decide.', 'Scannez toutes les files depuis un seul endroit, puis ouvrez le bon tiroir pour décider.')}
            {activeTab === 'profile' && tr('Identity checks only. Keep driver license and passport review separate from vehicle and marketplace work.', "Uniquement les contrôles d'identité. Gardez le permis et le passeport séparés du véhicule et du marketplace.")}
            {activeTab === 'vehicle' && tr('Vehicle compliance only. Registration, insurance, and ownership stay in one vehicle-focused queue.', 'Uniquement la conformité véhicule. Carte grise, assurance et propriété restent dans une seule file véhicule.')}
            {activeTab === 'listing' && tr('Marketplace moderation only. Scan listing titles quickly, then open the review drawer for decisions.', 'Uniquement la modération marketplace. Scannez rapidement les annonces, puis ouvrez le tiroir pour décider.')}
            {activeTab === 'business_owners' && tr('Business onboarding only. Review activation and approval separately from customer verification.', "Uniquement l'onboarding business. Séparez l'activation et l'approbation de la vérification client.")}
            {activeTab === 'payment_proofs' && tr('Payment receipts only. Keep money proof approval separate from accounting history so admins know exactly what needs review.', "Uniquement les reçus de paiement. Séparez l'approbation des preuves de l'historique comptable pour savoir exactement quoi réviser.")}
          </p>
        </div>

        <div className="grid w-full gap-2 sm:grid-cols-2 xl:max-w-3xl xl:flex-1">
          <label className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={tr('Search queue...', 'Rechercher...')}
              className="w-full rounded-[1.1rem] border border-slate-200 bg-white py-2.5 pl-9 pr-4 text-sm font-semibold outline-none transition focus:border-violet-300 focus:ring-4 focus:ring-violet-100"
            />
          </label>

          {(activeTab === 'profile' || activeTab === 'vehicle') ? (
            <select
              value={activeTab === 'profile' ? profileDocumentType : vehicleDocumentType}
              onChange={(event) => {
                if (activeTab === 'profile') setProfileDocumentType(event.target.value);
                if (activeTab === 'vehicle') setVehicleDocumentType(event.target.value);
              }}
              className="rounded-[1.1rem] border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 outline-none focus:border-violet-300 focus:ring-4 focus:ring-violet-100"
            >
              {(activeTab === 'profile' ? PROFILE_DOCUMENT_TYPES : VEHICLE_DOCUMENT_TYPES).map((type) => (
                <option key={type} value={type}>
                  {type === 'all' ? tr('All document types', 'Tous les documents') : getVerificationTypeLabel(type, language)}
                </option>
              ))}
            </select>
          ) : (
            <button
              type="button"
              onClick={loadRequests}
              disabled={loading}
              className="inline-flex items-center justify-center gap-2 rounded-[1.1rem] border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-violet-200 hover:text-violet-700 disabled:opacity-60"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              {tr('Refresh', 'Actualiser')}
            </button>
          )}
        </div>
      </div>
    </section>
  );

  const renderListingSummaryStrip = () => {
    if (activeTab !== 'listing') return null;

    return (
      <section className="rounded-[1.45rem] border border-violet-100 bg-white p-4 shadow-[0_18px_50px_rgba(15,23,42,0.05)] sm:p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-violet-500">
              {tr('Marketplace moderation', 'Modération marketplace')}
            </p>
            <h2 className="mt-1.5 text-xl font-bold tracking-tight text-slate-950 sm:text-[1.65rem]">
              {tr('Visibility and review filters', 'Filtres de visibilité et de revue')}
            </h2>
            <p className="mt-1.5 max-w-3xl text-sm leading-6 text-slate-500">
              {tr('Tap a summary to focus the queue below. Tap the active one again to clear it.', 'Touchez un résumé pour filtrer la file ci-dessous. Touchez à nouveau le filtre actif pour l’effacer.')}
            </p>
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {listingSummaryCards.map((card) => {
            const active = listingSummaryFilter === card.id;
            return (
              <button
                key={card.id}
                type="button"
                onClick={() => {
                  setListingSummaryFilter((current) => (current === card.id ? 'all' : card.id));
                  setSelectedStatus('all');
                }}
                className={`rounded-[1.2rem] border px-4 py-3.5 text-left transition ${
                  active
                    ? 'border-violet-200 bg-violet-50 text-violet-900 shadow-[0_18px_42px_rgba(15,23,42,0.08)]'
                    : 'border-slate-200 bg-white text-slate-700 hover:border-violet-200 hover:bg-violet-50/40'
                }`}
              >
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                  {card.label}
                </p>
                <p className="mt-2.5 text-[2rem] font-black tracking-tight text-slate-950">
                  {card.count}
                </p>
                <p className={`mt-1.5 text-sm leading-5 ${active ? 'text-violet-700' : 'text-slate-500'}`}>
                  {card.helper}
                </p>
              </button>
            );
          })}
        </div>
      </section>
    );
  };

  const renderQueueSections = () => {
    if (!filteredRows.length) return null;

    if (selectedStatus !== 'all') {
      return filteredRows.map((row) => renderQueueCard(row));
    }

    return STATUS_STRIP.map((section) => {
      const rows = groupedFilteredRows[section.id] || [];
      if (!rows.length) return null;

      const collapsed = Boolean(collapsedQueueSections[section.id]);
      const StatusIcon = getVerificationStatusIcon(section.id);

      return (
        <section
          key={section.id}
          className="overflow-hidden rounded-[1.45rem] border border-slate-200 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.05)]"
        >
          <button
            type="button"
            onClick={() =>
              setCollapsedQueueSections((current) => ({
                ...current,
                [section.id]: !current[section.id],
              }))
            }
            className="flex w-full items-center justify-between gap-4 px-4 py-3.5 text-left transition hover:bg-slate-50 sm:px-5"
          >
            <div className="min-w-0">
              <p className="inline-flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                <StatusIcon className="h-3 w-3" />
                <span>{section.label[language]}</span>
              </p>
              <p className="mt-1.5 text-sm font-medium text-slate-500">
                {tr('Tap to open or collapse this review group.', 'Touchez pour ouvrir ou réduire ce groupe de revue.')}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-3">
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">
                {rows.length}
              </span>
              {collapsed ? (
                <ChevronDown className="h-4 w-4 text-slate-500" />
              ) : (
                <ChevronUp className="h-4 w-4 text-slate-500" />
              )}
            </div>
          </button>

          {!collapsed ? (
            <div className="space-y-3 border-t border-slate-100 bg-slate-50/35 px-3.5 py-3.5 sm:px-4">
              {rows.map((row) => renderQueueCard(row))}
            </div>
          ) : null}
        </section>
      );
    });
  };

  const renderPaymentProofCard = (row) => {
    const proofTypeLabel = row.proofType === 'wallet'
      ? tr('Wallet deposit', 'Dépôt portefeuille')
      : tr('Booking payment', 'Paiement réservation');
    const proofTargetLabel = row.bookingReference
      ? `${tr('Reference', 'Référence')} ${row.bookingReference}`
      : row.methodLabel || tr('Bank transfer', 'Virement bancaire');
    const isImageProof = isImageReceiptUrl(row.proofUrl);
    const statusTone = getWorkflowBadgeTone('payment_proofs', row.status);
    const actionLabel = isPaymentProofPending(row.status)
      ? tr('Review proof', 'Réviser la preuve')
      : tr('Open proof record', 'Ouvrir le dossier');

    return (
      <article
        key={row.id}
        className="overflow-hidden rounded-[1.45rem] border border-amber-200 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.05)] transition hover:border-amber-300"
      >
        <div className="grid gap-0 lg:grid-cols-[180px_minmax(0,1fr)_220px]">
          <div className="border-b border-amber-100 bg-amber-50/70 p-4 lg:border-b-0 lg:border-r">
            <div className="flex h-full min-h-[132px] items-center justify-center overflow-hidden rounded-[1.1rem] border border-amber-100 bg-white">
              {isImageProof ? (
                <img
                  src={row.proofUrl}
                  alt={tr('Payment proof receipt', 'Reçu de paiement')}
                  className="h-full max-h-[150px] w-full object-cover"
                  loading="lazy"
                />
              ) : (
                <div className="flex flex-col items-center gap-2 px-4 text-center text-amber-700">
                  <ReceiptText className="h-8 w-8" />
                  <span className="text-xs font-bold uppercase tracking-[0.16em]">
                    {tr('Receipt', 'Reçu')}
                  </span>
                </div>
              )}
            </div>
          </div>

          <div className="min-w-0 p-4 sm:p-5">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-bold ${statusTone}`}>
                {row.statusLabel}
              </span>
              <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800">
                {proofTypeLabel}
              </span>
            </div>

            <div className="mt-3.5 flex items-start gap-3">
              <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[1.05rem] bg-amber-100 text-amber-700">
                <ReceiptText className="h-4.5 w-4.5" />
              </span>
              <div className="min-w-0">
                <p className="truncate text-lg font-bold tracking-tight text-slate-950">{row.title}</p>
                <p className="mt-1 text-sm leading-6 text-slate-500">{row.owner} • {proofTargetLabel}</p>
              </div>
            </div>

            <div className="mt-4 grid gap-3 border-t border-slate-100 pt-3.5 sm:grid-cols-3">
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                  {tr('Customer', 'Client')}
                </p>
                <p className="mt-1.5 truncate text-sm font-semibold text-slate-800">{row.owner}</p>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                  {tr('Submitted', 'Soumis')}
                </p>
                <p className="mt-1.5 text-sm font-semibold text-slate-800">{formatDate(row.submittedAt)}</p>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                  {tr('Amount', 'Montant')}
                </p>
                <p className="mt-1.5 text-sm font-bold text-slate-950">{formatCurrency(row.amount, language)}</p>
              </div>
            </div>

            {row.customerNote ? (
              <div className="mt-4 rounded-[1.05rem] border border-sky-100 bg-sky-50/60 px-4 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-sky-700">
                  {tr('Customer message', 'Message client')}
                </p>
                <p className="mt-1.5 text-sm leading-6 text-slate-700">{row.customerNote}</p>
              </div>
            ) : null}

            {row.reviewNote ? (
              <div className="mt-4 rounded-[1.05rem] border border-slate-200 bg-slate-50 px-4 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                  {tr('Admin review note', 'Note de revue admin')}
                </p>
                <p className="mt-1.5 text-sm leading-6 text-slate-600">{row.reviewNote}</p>
              </div>
            ) : null}
          </div>

          <div className="flex flex-col gap-2 border-t border-slate-100 bg-slate-50/70 p-4 lg:border-l lg:border-t-0">
            <div className="rounded-[1.05rem] border border-slate-200 bg-white px-4 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                {tr('Amount', 'Montant')}
              </p>
              <p className="mt-1.5 text-xl font-black tracking-tight text-slate-950">
                {formatCurrency(row.amount, language)}
              </p>
            </div>

            {row.proofUrl ? (
              <button
                type="button"
                onClick={() => setProofPreview({
                  url: row.proofUrl,
                  title: row.title,
                  subtitle: row.subtitle,
                })}
                className="inline-flex items-center justify-center gap-2 rounded-[1.05rem] border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 transition hover:border-amber-300 hover:text-amber-800"
              >
                <ReceiptText className="h-4 w-4" />
                {row.proofType === 'wallet' ? tr('Open receipt', 'Ouvrir le reçu') : tr('Open proof', 'Ouvrir la preuve')}
              </button>
            ) : null}

            <button
              type="button"
              onClick={() => {
                setSelectedPaymentProofRow(row);
                setPaymentProofReviewNote(row.reviewNote || '');
              }}
              className="inline-flex items-center justify-center gap-2 rounded-[1.05rem] border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm font-bold text-amber-800 transition hover:border-amber-300 hover:bg-amber-100"
            >
              <ClipboardList className="h-4 w-4" />
              {actionLabel}
            </button>
          </div>
        </div>
      </article>
    );
  };

  const renderQueueCard = (row) => {
    if (row.kind === 'payment_proofs') {
      return renderPaymentProofCard(row);
    }

    const workflowMeta = getWorkflowKindMeta(row.kind, tr);
    const reviewAction = getReviewActionClassName(row.kind, row.status, tr);
    const isHighlighted = highlightedRow?.id === row.id;
    const highlightClass = highlightedRow?.tone === 'success'
      ? 'border-emerald-300 bg-emerald-50/60 shadow-[0_0_0_4px_rgba(16,185,129,0.12),0_18px_50px_rgba(15,23,42,0.05)]'
      : highlightedRow?.tone === 'warning'
        ? 'border-amber-300 bg-amber-50/70 shadow-[0_0_0_4px_rgba(245,158,11,0.12),0_18px_50px_rgba(15,23,42,0.05)]'
        : 'border-sky-300 bg-sky-50/60 shadow-[0_0_0_4px_rgba(14,165,233,0.12),0_18px_50px_rgba(15,23,42,0.05)]';
    const icon =
      row.kind === 'listing' ? <ClipboardList className="h-5 w-5" /> :
      row.kind === 'business_owners' ? <Building2 className="h-5 w-5" /> :
      row.kind === 'payment_proofs' ? <ReceiptText className="h-5 w-5" /> :
      <UserRound className="h-5 w-5" />;

    return (
      <article
        key={row.id}
        className={`rounded-[1.4rem] border bg-white p-4 transition hover:border-slate-300 ${isHighlighted ? highlightClass : 'border-slate-200 shadow-[0_18px_50px_rgba(15,23,42,0.05)]'}`}
      >
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              {(row.kind === 'profile' || row.kind === 'vehicle') ? (
                <VerificationStatusBadge status={row.status} className="px-3 py-1 text-xs" />
              ) : (
                <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-bold ${getWorkflowBadgeTone(row.kind, row.status)}`}>
                  {row.statusLabel}
                </span>
              )}
              <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${workflowMeta.accentClassName}`}>
                {workflowMeta.label}
              </span>
            </div>

            <div className="mt-3.5 flex items-start gap-3">
              <span className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[1.05rem] ${workflowMeta.iconWrapClassName}`}>
                {React.cloneElement(icon, { className: 'h-4.5 w-4.5' })}
              </span>
              <div className="min-w-0">
                <p className="truncate text-lg font-bold tracking-tight text-slate-950">{row.title}</p>
                <p className="mt-1 text-sm leading-6 text-slate-500">{row.subtitle}</p>
              </div>
            </div>

            <div className="mt-4 grid gap-3 border-t border-slate-100 pt-3.5 sm:grid-cols-3">
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                  {tr('Owner / user', 'Propriétaire / utilisateur')}
                </p>
                <p className="mt-1.5 truncate text-sm font-semibold text-slate-800">{row.owner}</p>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                  {tr('Submitted', 'Soumis')}
                </p>
                <p className="mt-1.5 text-sm font-semibold text-slate-800">{formatDate(row.submittedAt)}</p>
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                  {tr('Status', 'Statut')}
                </p>
                <p className="mt-1.5 text-sm font-semibold text-slate-800">{row.statusLabel}</p>
              </div>
            </div>
          </div>

          <div className="lg:w-[200px] lg:shrink-0">
            <button
              type="button"
              onClick={() => {
                if (row.kind === 'listing') setSelectedListingRow(row.raw);
                else if (row.kind === 'business_owners') setSelectedBusinessOwnerEntry(row.raw);
                else if (row.kind === 'payment_proofs') navigate('/admin/finance?tab=alerts', { state: { paymentProofId: row.rawId } });
                else setSelectedRequest(row.raw);
              }}
              className={`inline-flex w-full items-center justify-center gap-2 rounded-[1.05rem] border px-4 py-2.5 text-sm font-bold transition ${reviewAction.className}`}
            >
              <ClipboardList className="h-4 w-4" />
              {reviewAction.label}
            </button>
          </div>
        </div>
      </article>
    );
  };

  const selectedBusinessOwnerStatus = getBusinessOwnerStatus(selectedBusinessOwnerEntry);
  const businessOwnerActionKey = (action) =>
    `${action}:${selectedBusinessOwnerEntry?.business_account?.id || selectedBusinessOwnerEntry?.business_account?.auth_user_id || ''}`;
  const selectedPaymentProofPending = isPaymentProofPending(selectedPaymentProofRow?.status);
  const selectedPaymentProofCanReview = selectedPaymentProofRow?.proofType === 'wallet' && selectedPaymentProofPending;
  const selectedPaymentProofIsImage = isImageReceiptUrl(selectedPaymentProofRow?.proofUrl);
  const selectedPaymentProofHasPreview = Boolean(String(selectedPaymentProofRow?.proofUrl || '').trim());
  const selectedPaymentProofCustomerProfileHref = buildAdminCustomerProfileHref({
    authUserId: selectedPaymentProofRow?.customerUserId,
    email: selectedPaymentProofRow?.customerEmail,
  });

  return (
    <div className="min-h-screen bg-slate-50/80">
      <main className="mx-auto max-w-7xl space-y-5 px-4 py-5 sm:px-6 lg:px-8">
        {renderStatusStrip()}
        {renderTabBar()}
        {renderFilterBar()}
        {renderListingSummaryStrip()}

        <section className="space-y-3.5">
          {loading && Array.from({ length: 3 }).map((_, index) => (
            <div key={`verification-loading-${index}`} className="h-40 animate-pulse rounded-[1.4rem] border border-slate-200 bg-white" />
          ))}

          {!loading && renderQueueSections()}

          {!loading && !filteredRows.length && (
            <div className="rounded-[1.4rem] border border-dashed border-slate-200 bg-white/80 p-7 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-[18px] bg-white text-violet-700 shadow-sm">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <p className="mt-3 text-base font-black text-slate-900">{tr('Queue is clear.', 'La file est vide.')}</p>
              <p className="mt-1 text-sm font-medium text-slate-500">
                {tr('New review items will appear here.', 'Les nouveaux éléments à réviser apparaîtront ici.')}
              </p>
            </div>
          )}
        </section>
      </main>

      <VerificationReviewDrawer
        request={selectedRequest}
        initialDocumentId={selectedDocumentId}
        onClose={() => {
          setSelectedRequest(null);
          setSelectedDocumentId('');
        }}
        onUpdated={(result) => {
          const updatedRequest = result?.request || null;
          const updatedStatus = String(updatedRequest?.status || result?.summary?.status || selectedRequest?.status || '').toLowerCase();
          setHighlightedRow({
            id: `verification:${selectedRequest?.id || updatedRequest?.id || ''}`,
            tone: updatedStatus === 'approved' ? 'success' : ['rejected', 'suspended', 'expired'].includes(updatedStatus) ? 'warning' : 'info',
          });
          if (updatedRequest) {
            setSelectedRequest((current) => {
              if (!current) return current;
              if (Array.isArray(updatedRequest?.documents)) {
                return {
                  ...current,
                  ...updatedRequest,
                  documents: updatedRequest.documents,
                };
              }
              const currentDocuments = Array.isArray(current.documents) ? current.documents : [];
              const nextDocuments = currentDocuments.map((document) =>
                String(document.id) === String(updatedRequest.id)
                  ? { ...document, ...updatedRequest }
                  : document
              );
              return {
                ...current,
                ...(result?.summary && typeof result.summary === 'object' ? result.summary : {}),
                documents: nextDocuments,
              };
            });
          }
          setSelectedDocumentId('');
          loadRequests();
        }}
      />

      {selectedPaymentProofRow ? (
        <ReviewShell
          title={selectedPaymentProofRow.title || tr('Payment proof review', 'Revue preuve de paiement')}
          subtitle={[
            selectedPaymentProofRow.owner,
            selectedPaymentProofRow.proofType === 'wallet' ? tr('Wallet deposit', 'Dépôt portefeuille') : tr('Booking payment', 'Paiement réservation'),
          ].filter(Boolean).join(' • ')}
          onClose={() => {
            setSelectedPaymentProofRow(null);
            setPaymentProofReviewNote('');
            setPaymentProofActionLoading('');
          }}
        >
          <div className="space-y-5">
            <div className="overflow-hidden rounded-[1.7rem] border border-amber-200 bg-amber-50/60">
              <div className="border-b border-amber-100 px-4 py-3 sm:px-5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-bold ${getWorkflowBadgeTone('payment_proofs', selectedPaymentProofRow.status)}`}>
                    {selectedPaymentProofRow.statusLabel}
                  </span>
                  <span className="rounded-full border border-amber-200 bg-white px-3 py-1 text-xs font-semibold text-amber-800">
                    {selectedPaymentProofRow.proofType === 'wallet' ? tr('Wallet deposit', 'Dépôt portefeuille') : tr('Booking payment', 'Paiement réservation')}
                  </span>
                </div>
              </div>

              <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_220px]">
                <div className="bg-white p-4 sm:p-5">
                  {selectedPaymentProofHasPreview ? (
                    <button
                      type="button"
                      onClick={() => setProofPreview({
                        url: selectedPaymentProofRow.proofUrl,
                        title: selectedPaymentProofRow.title,
                        subtitle: selectedPaymentProofRow.subtitle,
                      })}
                      className="group flex min-h-[260px] w-full flex-col overflow-hidden rounded-[1.2rem] border border-slate-200 bg-slate-50 text-left transition hover:border-amber-300 hover:bg-amber-50/40"
                    >
                      <div className="relative flex min-h-[220px] flex-1 items-center justify-center overflow-hidden bg-white">
                        {selectedPaymentProofIsImage ? (
                          <>
                            <img
                              src={selectedPaymentProofRow.proofUrl}
                              alt={tr('Payment proof receipt preview', 'Aperçu du reçu de paiement')}
                              className="max-h-[520px] w-full object-contain transition duration-200 group-hover:scale-[1.01]"
                            />
                            <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-950/55 to-transparent px-4 py-4">
                              <span className="inline-flex rounded-full bg-white/90 px-3 py-1 text-[11px] font-bold text-slate-900 shadow-sm">
                                {tr('Tap to open full preview', 'Touchez pour ouvrir le grand aperçu')}
                              </span>
                            </div>
                          </>
                        ) : (
                          <div className="flex w-full max-w-sm flex-col items-center gap-4 px-6 py-8 text-center">
                            <div className="flex h-20 w-20 items-center justify-center rounded-[1.6rem] bg-amber-100 text-amber-700 shadow-sm">
                              <ReceiptText className="h-10 w-10" />
                            </div>
                            <div>
                              <p className="text-sm font-black uppercase tracking-[0.18em] text-amber-700">
                                {tr('Receipt file ready', 'Fichier reçu prêt')}
                              </p>
                              <p className="mt-2 text-sm leading-6 text-slate-500">
                                {tr('Open the attached receipt in a larger preview to inspect the proof.', 'Ouvrez le reçu joint dans un aperçu plus grand pour inspecter la preuve.')}
                              </p>
                            </div>
                            <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-[11px] font-bold text-amber-800">
                              {tr('Open full preview', 'Ouvrir le grand aperçu')}
                            </span>
                          </div>
                        )}
                      </div>
                      <div className="flex items-center justify-between gap-3 border-t border-slate-200 bg-white px-4 py-3">
                        <div className="min-w-0">
                          <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">
                            {tr('Receipt preview', 'Aperçu du reçu')}
                          </p>
                          <p className="mt-1 truncate text-sm font-semibold text-slate-700">
                            {selectedPaymentProofRow.title || tr('Payment proof', 'Preuve de paiement')}
                          </p>
                        </div>
                        <span className="shrink-0 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-bold text-slate-700 transition group-hover:border-amber-200 group-hover:bg-amber-50 group-hover:text-amber-800">
                          {selectedPaymentProofRow.proofType === 'wallet' ? tr('Open receipt', 'Ouvrir le reçu') : tr('Open proof', 'Ouvrir la preuve')}
                        </span>
                      </div>
                    </button>
                  ) : (
                    <div className="flex min-h-[260px] items-center justify-center overflow-hidden rounded-[1.2rem] border border-slate-200 bg-slate-50">
                      <div className="flex flex-col items-center gap-3 px-6 text-center text-amber-700">
                        <ReceiptText className="h-12 w-12" />
                        <div>
                          <p className="text-sm font-black uppercase tracking-[0.18em]">{tr('Receipt preview', 'Aperçu du reçu')}</p>
                          <p className="mt-1 text-sm text-slate-500">
                            {tr('No receipt file is attached to this proof.', 'Aucun fichier reçu n’est attaché à cette preuve.')}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="space-y-3 border-t border-amber-100 bg-amber-50/50 p-4 lg:border-l lg:border-t-0">
                  <div className="rounded-[1.05rem] border border-amber-100 bg-white px-4 py-3">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">{tr('Amount', 'Montant')}</p>
                    <p className="mt-1.5 text-2xl font-black tracking-tight text-slate-950">
                      {formatCurrency(selectedPaymentProofRow.amount, language)}
                    </p>
                  </div>
                  <div className="rounded-[1.05rem] border border-slate-200 bg-white px-4 py-3">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">{tr('Customer', 'Client')}</p>
                    <p className="mt-1.5 break-words text-sm font-bold text-slate-800">{selectedPaymentProofRow.owner}</p>
                  </div>
                  <div className="rounded-[1.05rem] border border-slate-200 bg-white px-4 py-3">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">{tr('Submitted', 'Soumis')}</p>
                    <p className="mt-1.5 text-sm font-bold text-slate-800">{formatDate(selectedPaymentProofRow.submittedAt)}</p>
                  </div>
                  {selectedPaymentProofRow.proofUrl ? (
                    <button
                      type="button"
                      onClick={() => setProofPreview({
                        url: selectedPaymentProofRow.proofUrl,
                        title: selectedPaymentProofRow.title,
                        subtitle: selectedPaymentProofRow.subtitle,
                      })}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-[1.05rem] border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 transition hover:border-amber-300 hover:text-amber-800"
                    >
                      <ReceiptText className="h-4 w-4" />
                      {selectedPaymentProofRow.proofType === 'wallet' ? tr('Open receipt', 'Ouvrir le reçu') : tr('Open proof', 'Ouvrir la preuve')}
                    </button>
                  ) : null}
                </div>
              </div>
            </div>

            {selectedPaymentProofRow.customerNote ? (
              <div className="rounded-[1.2rem] border border-sky-100 bg-sky-50/70 px-4 py-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-sky-700">
                  {tr('Customer message', 'Message client')}
                </p>
                <p className="mt-2 text-sm leading-6 text-slate-700">{selectedPaymentProofRow.customerNote}</p>
              </div>
            ) : null}

            {selectedPaymentProofRow.customerUpdateStatus ? (
              <div className={`rounded-[1.2rem] border px-4 py-4 ${
                selectedPaymentProofRow.customerUpdateStatus === 'sent'
                  ? 'border-emerald-100 bg-emerald-50/70'
                  : 'border-amber-100 bg-amber-50/70'
              }`}>
                <p className={`text-[11px] font-semibold uppercase tracking-[0.16em] ${
                  selectedPaymentProofRow.customerUpdateStatus === 'sent' ? 'text-emerald-700' : 'text-amber-700'
                }`}>
                  {tr('Sync complete', 'Synchronisation terminée')}
                </p>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <div className="rounded-[1rem] border border-white/70 bg-white px-3 py-2.5">
                    <p className="flex items-center gap-2 text-sm font-bold text-slate-800">
                      <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                      {tr('Finance audit updated', 'Audit finance mis à jour')}
                    </p>
                  </div>
                  <div className="rounded-[1rem] border border-white/70 bg-white px-3 py-2.5">
                    <p className="flex items-center gap-2 text-sm font-bold text-slate-800">
                      {selectedPaymentProofRow.customerUpdateStatus === 'sent'
                        ? <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                        : <AlertTriangle className="h-4 w-4 text-amber-600" />}
                      {selectedPaymentProofRow.customerUpdateStatus === 'sent'
                        ? tr('Customer inbox updated', 'Inbox client mise à jour')
                        : tr('Customer inbox not updated', 'Inbox client non mise à jour')}
                    </p>
                    {selectedPaymentProofRow.customerUpdateError ? (
                      <p className="mt-1 text-xs font-medium text-amber-700">{selectedPaymentProofRow.customerUpdateError}</p>
                    ) : null}
                  </div>
                </div>
                {selectedPaymentProofRow.customerUpdateThreadKey ? (
                  <button
                    type="button"
                    onClick={() => navigate(`/admin/messages?threadKey=${encodeURIComponent(selectedPaymentProofRow.customerUpdateThreadKey)}&section=customer&lane=reviews`)}
                    className="mt-3 inline-flex items-center gap-2 rounded-[1rem] border border-emerald-200 bg-white px-4 py-2.5 text-sm font-bold text-emerald-700 transition hover:border-emerald-300 hover:bg-emerald-50"
                  >
                    <SquareArrowOutUpRight className="h-4 w-4" />
                    {tr('Open customer update', 'Ouvrir la mise à jour client')}
                  </button>
                ) : null}
              </div>
            ) : null}

            {selectedPaymentProofCanReview ? (
              <div className="rounded-[1.2rem] border border-slate-200 bg-white px-4 py-4">
                <label className="block">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                    {tr('Review note', 'Note de revue')}
                  </span>
                  <textarea
                    value={paymentProofReviewNote}
                    onChange={(event) => setPaymentProofReviewNote(event.target.value)}
                    rows={3}
                    placeholder={tr('Required only when rejecting this receipt.', 'Obligatoire uniquement si vous rejetez ce reçu.')}
                    className="mt-2 w-full rounded-[1.05rem] border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-amber-300 focus:ring-4 focus:ring-amber-100"
                  />
                </label>

                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    disabled={Boolean(paymentProofActionLoading)}
                    onClick={() => void runPaymentProofAction(selectedPaymentProofRow, 'approved')}
                    className="inline-flex items-center justify-center gap-2 rounded-[1.05rem] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700 transition hover:border-emerald-300 hover:bg-emerald-100 disabled:opacity-60"
                  >
                    {paymentProofActionLoading === `approved:${selectedPaymentProofRow.rawId}` ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                    {tr('Approve deposit', 'Approuver le dépôt')}
                  </button>
                  <button
                    type="button"
                    disabled={Boolean(paymentProofActionLoading) || !paymentProofReviewNote.trim()}
                    onClick={() => void runPaymentProofAction(selectedPaymentProofRow, 'rejected')}
                    className="inline-flex items-center justify-center gap-2 rounded-[1.05rem] border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700 transition hover:border-rose-300 hover:bg-rose-100 disabled:opacity-60"
                  >
                    {paymentProofActionLoading === `rejected:${selectedPaymentProofRow.rawId}` ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
                    {tr('Reject deposit', 'Rejeter le dépôt')}
                  </button>
                </div>
              </div>
            ) : (
              <div className="rounded-[1.2rem] border border-slate-200 bg-slate-50 px-4 py-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                  {tr('Review status', 'Statut de revue')}
                </p>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  {selectedPaymentProofRow.proofType === 'wallet'
                    ? tr('This wallet deposit already has a decision. Finance keeps the audit history.', 'Ce dépôt portefeuille a déjà une décision. La finance conserve l’historique d’audit.')
                    : tr('This booking payment proof is linked to its booking record. Open the related record to continue the decision.', 'Cette preuve de paiement réservation est liée à son dossier. Ouvrez le dossier associé pour continuer la décision.')}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {selectedPaymentProofRow.proofType !== 'wallet' && selectedPaymentProofRow.raw?.href ? (
                    <button
                      type="button"
                      onClick={() => navigate(selectedPaymentProofRow.raw.href)}
                      className="inline-flex items-center gap-2 rounded-[1.05rem] border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 transition hover:border-amber-300 hover:text-amber-800"
                    >
                      <SquareArrowOutUpRight className="h-4 w-4" />
                      {tr('Open related record', 'Ouvrir le dossier lié')}
                    </button>
                  ) : null}
                  {selectedPaymentProofRow.proofType === 'wallet' && selectedPaymentProofCustomerProfileHref ? (
                    <button
                      type="button"
                      onClick={() => navigate(selectedPaymentProofCustomerProfileHref)}
                      className="inline-flex items-center gap-2 rounded-[1.05rem] border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 transition hover:border-amber-300 hover:text-amber-800"
                    >
                      <UserRound className="h-4 w-4" />
                      {tr('Open customer profile', 'Ouvrir le profil client')}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => navigate('/admin/finance?tab=alerts', { state: { paymentProofId: selectedPaymentProofRow.rawId } })}
                    className="inline-flex items-center gap-2 rounded-[1.05rem] border border-amber-200 bg-white px-4 py-2.5 text-sm font-bold text-amber-800 transition hover:border-amber-300 hover:bg-amber-50"
                  >
                    <ClipboardList className="h-4 w-4" />
                    {tr('Open finance audit', 'Ouvrir l’audit finance')}
                  </button>
                </div>
              </div>
            )}
          </div>
        </ReviewShell>
      ) : null}

      {selectedListingRow ? (
        <ReviewShell
          title={selectedListingRow.title || tr('Marketplace listing', 'Annonce marketplace')}
          subtitle={[selectedListingRow.ownerDisplayName, selectedListingRow.cityName].filter(Boolean).join(' • ') || tr('Listing review', "Revue de l'annonce")}
          onClose={() => setSelectedListingRow(null)}
        >
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full px-3 py-1 text-xs font-bold ${getWorkflowBadgeTone('listing', normalizeWorkflowStatus('listing', selectedListingRow.listingStatus))}`}>
                {formatMarketplaceStatus(selectedListingRow.listingStatus, language)}
              </span>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">
                {selectedListingRow.bookingMode || tr('Request', 'Demande')}
              </span>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{tr('Owner', 'Propriétaire')}</p>
                <p className="mt-2 text-sm font-semibold text-slate-800">{selectedListingRow.ownerDisplayName || '—'}</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{tr('Submitted', 'Soumis')}</p>
                <p className="mt-2 text-sm font-semibold text-slate-800">{formatDate(selectedListingRow.reviewSubmittedAt || selectedListingRow.created_at || selectedListingRow.updated_at)}</p>
              </div>
            </div>

            {selectedListingRow.shortDescription ? (
              <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{tr('Listing summary', "Résumé de l'annonce")}</p>
                <p className="mt-2 text-sm leading-6 text-slate-600">{selectedListingRow.shortDescription}</p>
              </div>
            ) : null}

            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{tr('Review actions', 'Actions de revue')}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {['pending_review', 'pending', 'draft', 'rejected'].includes(String(selectedListingRow.listingStatus || '').toLowerCase()) ? (
                  <button
                    type="button"
                    onClick={() => void runMarketplaceAction(selectedListingRow, 'approve')}
                    disabled={Boolean(marketplaceActionLoading)}
                    className="inline-flex items-center gap-2 rounded-2xl bg-sky-100 px-4 py-2.5 text-sm font-bold text-sky-700 transition hover:bg-sky-200 disabled:opacity-60"
                  >
                    {marketplaceActionLoading === `${selectedListingRow.id}:approve` ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                    {tr('Approve', 'Approuver')}
                  </button>
                ) : null}

                {!['live', 'unpublished'].includes(String(selectedListingRow.listingStatus || '').toLowerCase()) ? (
                  <button
                    type="button"
                    onClick={() => setMarketplaceModalState({ open: true, mode: 'request_changes', row: selectedListingRow })}
                    className="inline-flex items-center gap-2 rounded-2xl bg-amber-100 px-4 py-2.5 text-sm font-bold text-amber-800 transition hover:bg-amber-200"
                  >
                    <ClipboardList className="h-4 w-4" />
                    {tr('Request changes', 'Demander des modifications')}
                  </button>
                ) : null}

                {!['live', 'rejected'].includes(String(selectedListingRow.listingStatus || '').toLowerCase()) ? (
                  <button
                    type="button"
                    onClick={() => setMarketplaceModalState({ open: true, mode: 'reject', row: selectedListingRow })}
                    className="inline-flex items-center gap-2 rounded-2xl bg-rose-100 px-4 py-2.5 text-sm font-bold text-rose-700 transition hover:bg-rose-200"
                  >
                    <XCircle className="h-4 w-4" />
                    {tr('Reject', 'Refuser')}
                  </button>
                ) : null}

                {String(selectedListingRow.listingStatus || '').toLowerCase() === 'approved' ? (
                  <button
                    type="button"
                    onClick={() => void runMarketplaceAction(selectedListingRow, 'publish')}
                    disabled={Boolean(marketplaceActionLoading)}
                    className="inline-flex items-center gap-2 rounded-2xl bg-emerald-100 px-4 py-2.5 text-sm font-bold text-emerald-700 transition hover:bg-emerald-200 disabled:opacity-60"
                  >
                    {marketplaceActionLoading === `${selectedListingRow.id}:publish` ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}
                    {tr('Publish', 'Publier')}
                  </button>
                ) : null}
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => navigate(buildAdminMarketplaceListingPath(selectedListingRow.id))}
                className="inline-flex items-center gap-2 rounded-2xl border border-violet-200 bg-violet-50 px-4 py-2.5 text-sm font-bold text-violet-700 transition hover:border-violet-300 hover:bg-violet-100"
              >
                <SquareArrowOutUpRight className="h-4 w-4" />
                {tr('Open vehicle', 'Ouvrir le véhicule')}
              </button>
            </div>
          </div>
        </ReviewShell>
      ) : null}

      {selectedBusinessOwnerEntry ? (
        <ReviewShell
          title={selectedBusinessOwnerEntry?.business_account?.full_name || selectedBusinessOwnerEntry?.business_account?.company_name || tr('Business owner review', 'Revue business owner')}
          subtitle={buildBusinessOwnerSubtitle(selectedBusinessOwnerEntry, tr)}
          onClose={() => {
            setSelectedBusinessOwnerEntry(null);
            setBusinessOwnerNote('');
          }}
        >
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full border px-3 py-1 text-xs font-bold ${getWorkflowBadgeTone('business_owners', normalizeWorkflowStatus('business_owners', selectedBusinessOwnerStatus))}`}>
                {formatMarketplaceStatus(selectedBusinessOwnerStatus, language)}
              </span>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{tr('Email', 'Email')}</p>
                <p className="mt-2 text-sm font-semibold text-slate-800">{selectedBusinessOwnerEntry?.business_account?.email || '—'}</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{tr('Submitted', 'Soumis')}</p>
                <p className="mt-2 text-sm font-semibold text-slate-800">{formatDate(selectedBusinessOwnerEntry?.business_account?.created_at || selectedBusinessOwnerEntry?.business_account?.updated_at)}</p>
              </div>
            </div>

            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-slate-700">
                {tr('Review note', 'Note de revue')}
              </span>
              <textarea
                value={businessOwnerNote}
                onChange={(event) => setBusinessOwnerNote(event.target.value)}
                rows={4}
                placeholder={tr('Use this when you need to request info, reject, or suspend.', 'Utilisez ceci lorsque vous devez demander des infos, refuser ou suspendre.')}
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-violet-400 focus:ring-4 focus:ring-violet-100"
              />
            </label>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{tr('Review actions', 'Actions de revue')}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {['pending', 'pending_verification', 'needs_info', 'rejected'].includes(selectedBusinessOwnerStatus) ? (
                  <button
                    type="button"
                    onClick={() => void runBusinessOwnerAction(selectedBusinessOwnerEntry, 'approve')}
                    disabled={businessOwnerActionLoading === businessOwnerActionKey('approve')}
                    className="inline-flex items-center gap-2 rounded-2xl bg-emerald-100 px-4 py-2.5 text-sm font-bold text-emerald-700 transition hover:bg-emerald-200 disabled:opacity-60"
                  >
                    {businessOwnerActionLoading === businessOwnerActionKey('approve') ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                    {tr('Approve', 'Approuver')}
                  </button>
                ) : null}

                {selectedBusinessOwnerStatus !== 'approved' ? (
                  <button
                    type="button"
                    onClick={() => void runBusinessOwnerAction(selectedBusinessOwnerEntry, 'needs_info')}
                    disabled={businessOwnerActionLoading === businessOwnerActionKey('needs_info')}
                    className="inline-flex items-center gap-2 rounded-2xl bg-amber-100 px-4 py-2.5 text-sm font-bold text-amber-800 transition hover:bg-amber-200 disabled:opacity-60"
                  >
                    {businessOwnerActionLoading === businessOwnerActionKey('needs_info') ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ClipboardList className="h-4 w-4" />}
                    {tr('Request changes', 'Demander des modifications')}
                  </button>
                ) : null}

                {selectedBusinessOwnerStatus !== 'approved' ? (
                  <button
                    type="button"
                    onClick={() => void runBusinessOwnerAction(selectedBusinessOwnerEntry, 'reject')}
                    disabled={!businessOwnerNote.trim() || businessOwnerActionLoading === businessOwnerActionKey('reject')}
                    className="inline-flex items-center gap-2 rounded-2xl bg-rose-100 px-4 py-2.5 text-sm font-bold text-rose-700 transition hover:bg-rose-200 disabled:opacity-60"
                  >
                    {businessOwnerActionLoading === businessOwnerActionKey('reject') ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
                    {tr('Reject', 'Refuser')}
                  </button>
                ) : null}

                {selectedBusinessOwnerStatus === 'approved' ? (
                  <button
                    type="button"
                    onClick={() => void runBusinessOwnerAction(selectedBusinessOwnerEntry, 'suspend')}
                    disabled={!businessOwnerNote.trim() || businessOwnerActionLoading === businessOwnerActionKey('suspend')}
                    className="inline-flex items-center gap-2 rounded-2xl bg-slate-100 px-4 py-2.5 text-sm font-bold text-slate-700 transition hover:bg-slate-200 disabled:opacity-60"
                  >
                    {businessOwnerActionLoading === businessOwnerActionKey('suspend') ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                    {tr('Suspend', 'Suspendre')}
                  </button>
                ) : null}

                {selectedBusinessOwnerStatus === 'suspended' ? (
                  <button
                    type="button"
                    onClick={() => void runBusinessOwnerAction(selectedBusinessOwnerEntry, 'reactivate')}
                    disabled={businessOwnerActionLoading === businessOwnerActionKey('reactivate')}
                    className="inline-flex items-center gap-2 rounded-2xl bg-sky-100 px-4 py-2.5 text-sm font-bold text-sky-700 transition hover:bg-sky-200 disabled:opacity-60"
                  >
                    {businessOwnerActionLoading === businessOwnerActionKey('reactivate') ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}
                    {tr('Reactivate', 'Réactiver')}
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        </ReviewShell>
      ) : null}

      <MarketplaceModerationModal
        open={marketplaceModalState.open}
        mode={marketplaceModalState.mode}
        loading={Boolean(marketplaceActionLoading)}
        onClose={closeMarketplaceModal}
        onSubmit={async (payload) => {
          const row = marketplaceModalState.row;
          const mode = marketplaceModalState.mode;
          if (!row || !mode) return;
          const success = await runMarketplaceAction(row, mode, payload);
          if (success) {
            closeMarketplaceModal();
            setSelectedListingRow((current) => (current && String(current.id) === String(row.id) ? current : current));
          }
        }}
      />
      <ProofPreviewModal
        open={Boolean(proofPreview?.url)}
        url={proofPreview?.url || ''}
        title={proofPreview?.title || tr('Payment proof', 'Preuve de paiement')}
        subtitle={proofPreview?.subtitle || ''}
        onClose={() => setProofPreview(null)}
        tr={tr}
      />
    </div>
  );
};

export default VerificationCenter;
