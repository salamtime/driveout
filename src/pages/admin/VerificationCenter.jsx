import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Building2,
  CheckCircle2,
  ClipboardList,
  LoaderCircle,
  RefreshCw,
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
import VerificationReviewDrawer from '../../components/verification/VerificationReviewDrawer';
import VerificationStatusBadge from '../../components/verification/VerificationStatusBadge';
import MarketplaceAdminService from '../../services/MarketplaceAdminService';
import VerificationService from '../../services/VerificationService';
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
  { id: 'profile', label: { en: 'Profile', fr: 'Profil' } },
  { id: 'vehicle', label: { en: 'Vehicle', fr: 'Véhicule' } },
  { id: 'listing', label: { en: 'Listing', fr: 'Annonce' } },
  { id: 'business_owners', label: { en: 'Business owners', fr: 'Business owners' } },
];

const STATUS_STRIP = [
  { id: 'pending', label: { en: 'Pending', fr: 'En attente' } },
  { id: 'approved', label: { en: 'Verified', fr: 'Vérifié' } },
  { id: 'rejected', label: { en: 'Needs changes', fr: 'À corriger' } },
  { id: 'expired', label: { en: 'Expired', fr: 'Expiré' } },
];

const PROFILE_DOCUMENT_TYPES = ['all', 'profile_id', 'driver_license'];
const VEHICLE_DOCUMENT_TYPES = ['all', 'vehicle_registration', 'vehicle_insurance', 'proof_of_ownership'];

const formatDate = (value) => {
  if (!value) return '—';
  return new Date(value).toLocaleDateString();
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

const getWorkflowBadgeTone = (status) => {
  switch (status) {
    case 'approved':
      return 'border-emerald-200 bg-emerald-50 text-emerald-700';
    case 'rejected':
      return 'border-rose-200 bg-rose-50 text-rose-700';
    case 'expired':
      return 'border-amber-200 bg-amber-50 text-amber-700';
    default:
      return 'border-violet-200 bg-violet-50 text-violet-700';
  }
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
  requests.map((request) => ({
    id: `verification:${request.id}`,
    rawId: String(request.id || ''),
    kind: request.entity_type === 'vehicle' ? 'vehicle' : 'profile',
    title:
      request.entity_type === 'vehicle'
        ? (
            request.owner_email ||
            request.entity_email ||
            request.profile_snapshot?.email ||
            request.profile_snapshot?.full_name ||
            request.display_name ||
            tr('Vehicle verification', 'Vérification véhicule')
          )
        : (
            request.display_name ||
            request.entity_email ||
            request.profile_snapshot?.email ||
            request.profile_snapshot?.full_name ||
            tr('Profile verification', 'Vérification profil')
          ),
    subtitle:
      request.entity_type === 'vehicle'
        ? (
            [buildVerificationCaseReference(request), request.display_subtitle]
              .filter(Boolean)
              .join(' • ') ||
            (request.entity_id ? `${tr('Vehicle', 'Véhicule')} ${request.entity_id}` : '') ||
            '—'
          )
        : (
            [buildVerificationCaseReference(request), request.display_subtitle || request.entity_email || request.entity_username]
              .filter(Boolean)
              .join(' • ') || '—'
          ),
    owner:
      request.owner_email ||
      request.entity_email ||
      request.profile_snapshot?.email ||
      request.profile_snapshot?.full_name ||
      request.owner_user_id ||
      '—',
    status: normalizeWorkflowStatus('verification', request.status),
    statusLabel: getVerificationLabel(request.status, language),
    submittedAt: request.created_at || null,
    raw: request,
  }));

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

const ReviewShell = ({ title, subtitle, onClose, children }) => (
  <div className="fixed inset-0 z-[110] bg-slate-950/35 backdrop-blur-[2px]">
    <div className="ml-auto flex h-full w-full max-w-2xl flex-col border-l border-slate-200 bg-white shadow-[0_24px_80px_rgba(15,23,42,0.18)]">
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
  const [businessOwners, setBusinessOwners] = useState([]);
  const [loading, setLoading] = useState(false);

  const [activeTab, setActiveTab] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState('pending');
  const [search, setSearch] = useState('');
  const [profileDocumentType, setProfileDocumentType] = useState('all');
  const [vehicleDocumentType, setVehicleDocumentType] = useState('all');

  const [selectedRequest, setSelectedRequest] = useState(null);
  const [selectedDocumentId, setSelectedDocumentId] = useState('');
  const [selectedListingRow, setSelectedListingRow] = useState(null);
  const [selectedBusinessOwnerEntry, setSelectedBusinessOwnerEntry] = useState(null);

  const [marketplaceActionLoading, setMarketplaceActionLoading] = useState('');
  const [marketplaceModalState, setMarketplaceModalState] = useState({ open: false, mode: null, row: null });
  const [businessOwnerActionLoading, setBusinessOwnerActionLoading] = useState('');
  const [businessOwnerNote, setBusinessOwnerNote] = useState('');

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
      const [verificationResult, marketplaceResult, businessOwnerResult] = await Promise.all([
        VerificationService.getVerificationRequests({
          status: 'all',
          entityType: 'all',
          verificationType: 'all',
          limit: 160,
        }),
        MarketplaceAdminService.getSnapshot().catch(() => ({ snapshot: null })),
        listBusinessOwnersFromRegistry().catch(() => []),
      ]);

      setRequests(verificationResult.requests || []);
      setGroupedRequests(verificationResult.groupedRequests || []);
      setMarketplaceSnapshot(marketplaceResult?.snapshot || null);
      setBusinessOwners(Array.isArray(businessOwnerResult) ? businessOwnerResult : []);
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

  const allRows = useMemo(
    () => [...verificationRows, ...listingRows, ...businessOwnerRows],
    [verificationRows, listingRows, businessOwnerRows]
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
      case 'all':
      default:
        return allRows;
    }
  }, [activeTab, allRows, businessOwnerRows, listingRows, verificationRows]);

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

      if (!needle) return true;

      return [row.title, row.subtitle, row.owner, row.statusLabel]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(needle);
    });
  }, [activeTab, profileDocumentType, search, selectedStatus, tabRows, vehicleDocumentType]);

  const statusCounts = useMemo(() => {
    const counts = { pending: 0, approved: 0, rejected: 0, expired: 0 };
    tabRows.forEach((row) => {
      if (counts[row.status] !== undefined) counts[row.status] += 1;
    });
    return counts;
  }, [tabRows]);

  const activeTabCounts = useMemo(() => {
    const counts = {};
    WORKFLOW_TABS.forEach((tab) => {
      let rows = allRows;
      if (tab.id === 'profile') rows = verificationRows.filter((row) => row.kind === 'profile');
      if (tab.id === 'vehicle') rows = verificationRows.filter((row) => row.kind === 'vehicle');
      if (tab.id === 'listing') rows = listingRows;
      if (tab.id === 'business_owners') rows = businessOwnerRows;
      counts[tab.id] = rows.length;
    });
    return counts;
  }, [allRows, businessOwnerRows, listingRows, verificationRows]);

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
      if (action !== 'approve' && action !== 'reactivate') {
        setBusinessOwnerNote('');
      }
    } catch (error) {
      console.warn('Unable to update business owner from verification center:', error.message);
    } finally {
      setBusinessOwnerActionLoading('');
    }
  }, [businessOwnerNote, loadRequests]);

  const renderStatusStrip = () => (
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {STATUS_STRIP.map((item) => {
        const active = selectedStatus === item.id;
        const tone = getWorkflowBadgeTone(item.id);
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => setSelectedStatus((current) => (current === item.id ? 'all' : item.id))}
            className={`rounded-[1.6rem] border px-5 py-4 text-left transition ${
              active
                ? `${tone} shadow-[0_18px_42px_rgba(15,23,42,0.08)]`
                : 'border-slate-200 bg-white text-slate-700 hover:border-violet-200 hover:bg-violet-50/40'
            }`}
          >
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em]">
              {item.label[language]}
            </p>
            <p className="mt-3 text-3xl font-black tracking-tight">
              {statusCounts[item.id] || 0}
            </p>
          </button>
        );
      })}
    </section>
  );

  const renderTabBar = () => (
    <section className="rounded-[1.75rem] border border-violet-100 bg-white p-4 shadow-[0_18px_50px_rgba(15,23,42,0.05)] sm:p-5">
      <div className="flex flex-wrap gap-2">
        {WORKFLOW_TABS.map((tab) => {
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-bold transition ${
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
    <section className="rounded-[1.75rem] border border-violet-100 bg-white p-5 shadow-[0_18px_50px_rgba(15,23,42,0.05)] sm:p-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-violet-500">
            {tr('Verification Center', 'Centre de vérification')}
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950 sm:text-[2.15rem]">
            {WORKFLOW_TABS.find((tab) => tab.id === activeTab)?.label[language] || tr('All', 'Tout')}
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            {activeTab === 'all' && tr('Scan every queue from one place, then open the right drawer to decide.', 'Scannez toutes les files depuis un seul endroit, puis ouvrez le bon tiroir pour décider.')}
            {activeTab === 'profile' && tr('Identity files only. Keep profile review separate from vehicle and listing work.', 'Uniquement les pièces d’identité. Gardez la revue profil séparée du véhicule et des annonces.')}
            {activeTab === 'vehicle' && tr('Compliance documents only. Registration, insurance, and ownership stay in one vehicle-focused queue.', 'Uniquement les documents de conformité. Carte grise, assurance et propriété restent dans une seule file véhicule.')}
            {activeTab === 'listing' && tr('Listing moderation only. Scan titles quickly, then open the review drawer for decisions.', 'Uniquement la modération d’annonce. Scannez rapidement les annonces, puis ouvrez le tiroir pour décider.')}
            {activeTab === 'business_owners' && tr('Business owner activation only. Review onboarding and approval separately from customer verification.', 'Uniquement l’activation business owner. Séparez l’onboarding et l’approbation de la vérification client.')}
          </p>
        </div>

        <div className="grid w-full gap-2 sm:grid-cols-2 xl:max-w-3xl xl:flex-1">
          <label className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={tr('Search queue...', 'Rechercher...')}
              className="w-full rounded-2xl border border-slate-200 bg-white py-2.5 pl-9 pr-4 text-sm font-semibold outline-none transition focus:border-violet-300 focus:ring-4 focus:ring-violet-100"
            />
          </label>

          {(activeTab === 'profile' || activeTab === 'vehicle') ? (
            <select
              value={activeTab === 'profile' ? profileDocumentType : vehicleDocumentType}
              onChange={(event) => {
                if (activeTab === 'profile') setProfileDocumentType(event.target.value);
                if (activeTab === 'vehicle') setVehicleDocumentType(event.target.value);
              }}
              className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 outline-none focus:border-violet-300 focus:ring-4 focus:ring-violet-100"
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
              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-violet-200 hover:text-violet-700 disabled:opacity-60"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              {tr('Refresh', 'Actualiser')}
            </button>
          )}
        </div>
      </div>
    </section>
  );

  const renderQueueCard = (row) => {
    const icon =
      row.kind === 'listing' ? <ClipboardList className="h-5 w-5" /> :
      row.kind === 'business_owners' ? <Building2 className="h-5 w-5" /> :
      <UserRound className="h-5 w-5" />;

    return (
      <article
        key={row.id}
        className="rounded-[1.85rem] border border-violet-200 bg-white p-5 shadow-[0_18px_50px_rgba(15,23,42,0.05)]"
      >
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full border px-3 py-1 text-xs font-bold ${getWorkflowBadgeTone(row.status)}`}>
                {row.statusLabel}
              </span>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-600">
                {row.kind === 'listing'
                  ? tr('Listing', 'Annonce')
                  : row.kind === 'business_owners'
                    ? tr('Business owner', 'Business owner')
                    : row.kind === 'vehicle'
                      ? tr('Vehicle', 'Véhicule')
                      : tr('Profile', 'Profil')}
              </span>
            </div>

            <div className="mt-4 flex items-start gap-3">
              <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-slate-600">
                {icon}
              </span>
              <div className="min-w-0">
                <p className="truncate text-xl font-bold text-slate-950">{row.title}</p>
                <p className="mt-1 text-sm text-slate-500">{row.subtitle}</p>
              </div>
            </div>
          </div>

          <div className="rounded-[1.4rem] border border-slate-200 bg-slate-50 px-4 py-4 lg:min-w-[280px]">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                  {tr('Owner / user', 'Propriétaire / utilisateur')}
                </p>
                <p className="mt-2 text-sm font-semibold text-slate-800">{row.owner}</p>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                  {tr('Submitted', 'Soumis')}
                </p>
                <p className="mt-2 text-sm font-semibold text-slate-800">{formatDate(row.submittedAt)}</p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                if (row.kind === 'listing') setSelectedListingRow(row.raw);
                else if (row.kind === 'business_owners') setSelectedBusinessOwnerEntry(row.raw);
                else setSelectedRequest(row.raw);
              }}
              className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm font-bold text-violet-700 transition hover:border-violet-300 hover:bg-violet-100"
            >
              <ClipboardList className="h-4 w-4" />
              {tr('Review', 'Réviser')}
            </button>
          </div>
        </div>
      </article>
    );
  };

  const selectedBusinessOwnerStatus = getBusinessOwnerStatus(selectedBusinessOwnerEntry);
  const businessOwnerActionKey = (action) =>
    `${action}:${selectedBusinessOwnerEntry?.business_account?.id || selectedBusinessOwnerEntry?.business_account?.auth_user_id || ''}`;

  return (
    <div className="min-h-screen bg-slate-50/80">
      <main className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        {renderStatusStrip()}
        {renderTabBar()}
        {renderFilterBar()}

        <section className="space-y-4">
          {loading && Array.from({ length: 3 }).map((_, index) => (
            <div key={`verification-loading-${index}`} className="h-48 animate-pulse rounded-[1.85rem] border border-slate-200 bg-white" />
          ))}

          {!loading && filteredRows.map((row) => renderQueueCard(row))}

          {!loading && !filteredRows.length && (
            <div className="rounded-[1.6rem] border border-dashed border-slate-200 bg-white/80 p-8 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-[22px] bg-white text-violet-700 shadow-sm">
                <ShieldCheck className="h-6 w-6" />
              </div>
              <p className="mt-4 text-base font-black text-slate-900">{tr('Queue is clear.', 'La file est vide.')}</p>
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

      {selectedListingRow ? (
        <ReviewShell
          title={selectedListingRow.title || tr('Marketplace listing', 'Annonce marketplace')}
          subtitle={[selectedListingRow.ownerDisplayName, selectedListingRow.cityName].filter(Boolean).join(' • ') || tr('Listing review', "Revue de l'annonce")}
          onClose={() => setSelectedListingRow(null)}
        >
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full px-3 py-1 text-xs font-bold ${getWorkflowBadgeTone(normalizeWorkflowStatus('listing', selectedListingRow.listingStatus))}`}>
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
              <span className={`rounded-full border px-3 py-1 text-xs font-bold ${getWorkflowBadgeTone(normalizeWorkflowStatus('business_owners', selectedBusinessOwnerStatus))}`}>
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
    </div>
  );
};

export default VerificationCenter;
