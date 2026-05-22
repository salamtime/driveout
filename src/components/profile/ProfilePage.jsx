import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronUp, Shield } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../contexts/AuthContext';
import { getTenantSession } from '../../services/TenantRegistryService';
import { sendTelegramTestAlert } from '../../services/TelegramAlertService';
import { listBusinessOwnersFromRegistry } from '../../services/TenantProvisioningAdminService';
import { buildTenantWorkspaceBootstrap } from '../../services/TenantWorkspaceService';
import { shouldScopeSharedTenantData } from '../../services/OrganizationService';
import UserProfileService from '../../services/UserProfileService';
import { fetchSystemSettings, SYSTEM_SETTINGS_UPDATED_EVENT } from '../../services/systemSettingsApi';
import { isBusinessOwnerAccountType } from '../../utils/accountType';
import {
  TELEGRAM_ALERT_EVENT_KEYS,
  buildDefaultTelegramEventTypes,
  countEnabledTelegramAlertEvents,
  getTelegramAlertSettingsFromPreferences,
  normalizeTelegramEventTypes,
} from '../../utils/telegramAlertPreferences';
import ChangePasswordModal from './ChangePasswordModal';
import ProfilePictureUpload from './ProfilePictureUpload';
import ProfileSettings from './ProfileSettings';
import PlanSelectionPanel from './PlanSelectionPanel';
import ProfileVerificationCard from '../verification/ProfileVerificationCard';
import LoadingSpinner from '../common/LoadingSpinner';
import { shouldSuppressBlockingPageLoader } from '../../config/navigationShells';
import { APP_VERSION_LABEL } from '../../config/appVersion';
import AdminModuleHero from '../admin/AdminModuleHero';
import { getHostContext, isSaharaXBrandingHost } from '../../utils/hostContext';

const roleClassName = {
  owner: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  admin: 'border-blue-200 bg-blue-50 text-blue-700',
  employee: 'border-amber-200 bg-amber-50 text-amber-700',
  guide: 'border-violet-200 bg-violet-50 text-violet-700',
  customer: 'border-slate-200 bg-slate-50 text-slate-700',
};

const TELEGRAM_ALERT_EVENT_LABELS = {
  rental_created: 'Rental created',
  website_reservation_created: 'Website reservation',
  rental_started: 'Rental started',
  rental_vehicle_assigned: 'Vehicle assigned',
  rental_vehicle_replaced: 'Vehicle replaced',
  rental_completed: 'Rental completed',
  payment_received: 'Payment received',
  rental_overdue: 'Rental overdue',
  rental_cancelled: 'Rental cancelled',
  deposit_returned: 'Deposit returned',
  rental_extension_requested: 'Extension approval request',
  rental_price_change_requested: 'Price change approval request',
};

const SAHARAX_DEFAULT_LOGO_URL = '/assets/logo.jpg';

const getTenantLogoFallback = () => {
  if (typeof window === 'undefined') return '';
  return isSaharaXBrandingHost() ? SAHARAX_DEFAULT_LOGO_URL : '';
};

const isLocalHost = () => {
  if (typeof window === 'undefined') return false;
  const hostname = String(window.location.hostname || '').toLowerCase();
  return hostname === 'localhost' || hostname === '127.0.0.1';
};

const hasUsableTenantWorkspaceSession = (session = null) =>
  Boolean(
    session &&
    typeof session === 'object' &&
    String(session?.tenantId || session?.tenant?.id || '').trim() &&
    String(session?.businessAccountId || session?.businessAccount?.id || session?.business_account?.id || '').trim()
  );

const isTenantHost = () => {
  if (typeof window === 'undefined') return false;
  const hostname = String(window.location.hostname || '').toLowerCase();
  if (!hostname || hostname === 'localhost' || hostname === '127.0.0.1') return false;
  if (hostname === 'admin.driveout.io' || hostname === 'www.driveout.io' || hostname === 'driveout.io') return false;
  return hostname.endsWith('.driveout.io') || hostname.endsWith('.saharax.co');
};

const pickLocalRegistryWorkspaceEntry = (entries = [], userProfile = null) => {
  const localRegistryEntries = Array.isArray(entries) ? entries : [];
  return (
    localRegistryEntries.find((entry) => {
      const companyName = String(entry?.business_account?.company_name || entry?.tenant?.tenant_name || '').trim().toLowerCase();
      const tenantSlug = String(entry?.tenant?.tenant_slug || '').trim().toLowerCase();
      const ownerEmail = String(entry?.business_account?.email || '').trim().toLowerCase();
      return (
        ownerEmail === String(userProfile?.email || '').trim().toLowerCase() ||
        tenantSlug === 'saharax' ||
        companyName === 'saharax'
      );
    }) ||
    localRegistryEntries.find((entry) => String(entry?.tenant?.tenant_status || '').trim().toLowerCase() === 'active') ||
    localRegistryEntries[0] ||
    null
  );
};

const buildRegistryTenantSession = (entry = null) => {
  if (!entry?.tenant || !entry?.business_account) return null;

  const bootstrap = buildTenantWorkspaceBootstrap({
    tenant: entry.tenant,
    subscription: entry.subscription,
    businessAccount: entry.business_account,
  });

  return {
    ...bootstrap,
    workspaceState: entry?.tenant?.tenant_status || 'pending',
    tenant: entry.tenant || null,
    subscription: entry.subscription || null,
    businessAccount: entry.business_account || null,
    tenantSettings:
      entry?.tenant?.metadata?.tenant_settings && typeof entry.tenant.metadata.tenant_settings === 'object'
        ? entry.tenant.metadata.tenant_settings
        : {},
  };
};

const getWorkspaceTenantSettings = (session = null) => {
  if (!session || typeof session !== 'object') return {};

  if (session.tenantSettings && typeof session.tenantSettings === 'object') {
    return session.tenantSettings;
  }

  if (
    session?.tenant?.metadata?.tenant_settings &&
    typeof session.tenant.metadata.tenant_settings === 'object'
  ) {
    return session.tenant.metadata.tenant_settings;
  }

  return {};
};

const normalizeStaffIdDocuments = (documents) => {
  if (!documents) return [];
  if (Array.isArray(documents)) return documents.filter(Boolean);
  if (typeof documents === 'string') {
    try {
      const parsed = JSON.parse(documents);
      return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
    } catch {
      return [];
    }
  }
  return [];
};

const getTrialDaysRemaining = (trialEndsAt) => {
  if (!trialEndsAt) return 0;
  const endDate = new Date(trialEndsAt);
  const now = new Date();
  const diffMs = endDate.getTime() - now.getTime();
  if (Number.isNaN(diffMs)) return 0;
  return Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
};

const getSubscriptionPlanMeta = (subscriptionPlan, planType, tr) => {
  const normalizedPlanType = String(planType || '').toLowerCase();
  const normalizedPlan = String(subscriptionPlan || '').toLowerCase();

  if (normalizedPlanType === 'pro') {
    return {
      label: tr('profile.subscription.plans.pro', 'Pro'),
      badgeClass: 'border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700',
      summary: tr('profile.subscription.planSummary.pro', 'Advanced operations workspace with higher limits and premium controls.'),
    };
  }

  if (normalizedPlanType === 'growth') {
    return {
      label: tr('profile.subscription.plans.growth', 'Growth'),
      badgeClass: 'border-violet-200 bg-violet-50 text-violet-700',
      summary: tr('profile.subscription.planSummary.growth', 'Expanded operations workspace for growing teams and public distribution readiness.'),
    };
  }

  if (normalizedPlanType === 'starter') {
    return {
      label: tr('profile.subscription.plans.starter', 'Starter'),
      badgeClass: 'border-slate-200 bg-slate-50 text-slate-700',
      summary: tr('profile.subscription.planSummary.starter', 'Core operations workspace for running your business day to day.'),
    };
  }

  if (normalizedPlan === 'saas_web') {
    return {
      label: tr('profile.subscription.plans.saasWeb', 'SaaS + Marketplace'),
      badgeClass: 'border-violet-200 bg-violet-50 text-violet-700',
      summary: tr('profile.subscription.planSummary.saasWeb', 'Full operations workspace with DriveOut marketplace distribution.'),
    };
  }

  if (normalizedPlan === 'saas') {
    return {
      label: tr('profile.subscription.plans.saas', 'SaaS Only'),
      badgeClass: 'border-slate-200 bg-slate-50 text-slate-700',
      summary: tr('profile.subscription.planSummary.saas', 'Private operations workspace without marketplace distribution.'),
    };
  }

  return {
    label: tr('profile.subscription.plans.freeTrial', 'Free Trial'),
    badgeClass: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    summary: tr('profile.subscription.planSummary.freeTrial', 'You are still in the activation trial period.'),
  };
};

const getSubscriptionStatusMeta = (status, verificationStatus, tr) => {
  const normalizedStatus = String(status || '').toLowerCase();
  const normalizedVerificationStatus = String(verificationStatus || '').toLowerCase();

  if (normalizedVerificationStatus === 'rejected') {
    return {
      label: tr('profile.subscription.status.rejected', 'Rejected'),
      badgeClass: 'border-rose-200 bg-rose-50 text-rose-700',
    };
  }

  if (normalizedVerificationStatus === 'needs_info') {
    return {
      label: tr('profile.subscription.status.needsInfo', 'Needs Info'),
      badgeClass: 'border-sky-200 bg-sky-50 text-sky-700',
    };
  }

  if (normalizedStatus === 'suspended') {
    return {
      label: tr('profile.subscription.status.suspended', 'Suspended'),
      badgeClass: 'border-slate-300 bg-slate-100 text-slate-800',
    };
  }

  if (normalizedStatus === 'active') {
    return {
      label: tr('profile.subscription.status.active', 'Active'),
      badgeClass: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    };
  }

  if (normalizedStatus === 'expired') {
    return {
      label: tr('profile.subscription.status.expired', 'Expired'),
      badgeClass: 'border-amber-200 bg-amber-50 text-amber-700',
    };
  }

  if (normalizedStatus === 'cancelled') {
    return {
      label: tr('profile.subscription.status.cancelled', 'Cancelled'),
      badgeClass: 'border-slate-200 bg-slate-50 text-slate-700',
    };
  }

  return {
    label: tr('profile.subscription.status.trial', 'Trial'),
    badgeClass: 'border-indigo-200 bg-indigo-50 text-indigo-700',
  };
};

const BusinessOwnerSubscriptionCard = ({
  isBusinessOwner,
  verificationStatus,
  subscriptionPlan,
  planType,
  subscriptionStatus,
  billingStatus,
  trialEndsAt,
  subscriptionStartedAt,
  suspensionReason,
  tr,
}) => {
  const [planPickerOpen, setPlanPickerOpen] = useState(false);

  if (!isBusinessOwner) {
    return null;
  }

  const planMeta = getSubscriptionPlanMeta(subscriptionPlan, planType, tr);
  const statusMeta = getSubscriptionStatusMeta(subscriptionStatus, verificationStatus, tr);
  const trialDaysRemaining = getTrialDaysRemaining(trialEndsAt);
  const isTrial = String(subscriptionStatus || '').toLowerCase() === 'trial';
  const isSuspended = String(subscriptionStatus || '').toLowerCase() === 'suspended';
  const planActionLabel = isTrial
    ? tr('profile.subscription.actions.choose', 'Choose a Plan')
    : tr('profile.subscription.actions.change', 'Change Plan');

  return (
    <div className="mb-5 rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-violet-500">
            {tr('profile.subscription.title', 'Subscription')}
          </p>
          <h2 className="mt-2 text-lg font-semibold text-slate-900">
            {tr('profile.subscription.heading', 'Business Owner Activation')}
          </h2>
          <p className="mt-2 text-sm text-slate-500">
            {planMeta.summary}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full border px-3 py-1 text-xs font-bold ${statusMeta.badgeClass}`}>
            {statusMeta.label}
          </span>
          <span className={`rounded-full border px-3 py-1 text-xs font-bold ${planMeta.badgeClass}`}>
            {planMeta.label}
          </span>
        </div>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white/90 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
            {tr('profile.subscription.currentPlan', 'Current plan')}
          </p>
          <p className="mt-1 text-sm font-semibold text-slate-900">{planMeta.label}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white/90 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
            {tr('profile.subscription.currentStatus', 'Status')}
          </p>
          <p className="mt-1 text-sm font-semibold text-slate-900">{statusMeta.label}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white/90 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
            {isTrial
              ? tr('profile.subscription.trialRemaining', 'Trial remaining')
              : tr('profile.subscription.startedAt', 'Started')}
          </p>
          <p className="mt-1 text-sm font-semibold text-slate-900">
            {isTrial
              ? tr('profile.subscription.daysRemaining', '{{count}} days remaining').replace('{{count}}', String(trialDaysRemaining))
              : (subscriptionStartedAt ? new Date(subscriptionStartedAt).toLocaleDateString() : tr('profile.subscription.notStarted', 'Not started yet'))}
          </p>
        </div>
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white/90 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
            {tr('profile.subscription.billing', 'Billing')}
          </p>
          <p className="mt-1 text-sm font-semibold capitalize text-slate-900">
            {String(billingStatus || 'none').replace('_', ' ')}
          </p>
        </div>
        {isSuspended && suspensionReason ? (
          <div className="rounded-2xl border border-slate-200 bg-white/90 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
              {tr('profile.subscription.suspensionReason', 'Suspension reason')}
            </p>
            <p className="mt-1 text-sm font-semibold text-slate-900">{suspensionReason}</p>
          </div>
        ) : null}
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => setPlanPickerOpen((current) => !current)}
          className="inline-flex items-center justify-center gap-2 rounded-2xl bg-violet-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-violet-700"
        >
          <span>{planActionLabel}</span>
          {planPickerOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
        {isTrial ? (
          <p className="text-sm font-medium text-slate-500">
            {tr('profile.subscription.trialNote', 'Select the right package before your trial expires.')}
          </p>
        ) : null}
      </div>

      {planPickerOpen ? (
        <div className="mt-5">
          <PlanSelectionPanel embedded onPlanSaved={() => setPlanPickerOpen(false)} />
        </div>
      ) : null}
    </div>
  );
};

const ProfilePage = () => {
  const location = useLocation();
  const { t } = useTranslation();
  const tr = (key, fallback) => t(key, { defaultValue: fallback });
  const { user, userProfile, tenantSession, getUserRole, updateCurrentUserProfile } = useAuth();
  const userRole = getUserRole();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState(null);
  const [activeTab, setActiveTab] = useState('profile');
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [telegramPreferencesSaving, setTelegramPreferencesSaving] = useState(false);
  const [telegramTestSending, setTelegramTestSending] = useState(false);
  const [telegramPreferencesSavedAt, setTelegramPreferencesSavedAt] = useState(null);
  const [effectiveTenantWorkspaceSession, setEffectiveTenantWorkspaceSession] = useState(() =>
    hasUsableTenantWorkspaceSession(tenantSession) ? tenantSession : null
  );
  const [telegramPreferenceDraft, setTelegramPreferenceDraft] = useState(() => ({
    opt_in: false,
    selected_event_types: buildDefaultTelegramEventTypes(false),
    personal_chat_ids: '',
  }));
  const [activityLog, setActivityLog] = useState([]);
  const [tenantLogoUrl, setTenantLogoUrl] = useState('');
  const inheritedTenantLogoUrl = getTenantLogoFallback();
  const hostContext = useMemo(() => getHostContext(), []);
  const isIsolatedTenantWorkspace = shouldScopeSharedTenantData(hostContext);
  const suppressBlockingLoader = shouldSuppressBlockingPageLoader({
    pathname: location.pathname,
    isTransitionFlow: loading && !profile,
  });

  const splitName = useCallback((name = '') => UserProfileService.splitFullName(name), []);

  const buildFallbackProfile = useCallback(() => {
    const metadata = user?.user_metadata || {};
    const fallbackFirstName = userProfile?.first_name || metadata.first_name || '';
    const fallbackLastName = userProfile?.last_name || metadata.last_name || '';
    const fallbackFullName =
      userProfile?.fullName ||
      userProfile?.full_name ||
      [fallbackFirstName, fallbackLastName].filter(Boolean).join(' ').trim() ||
      metadata.full_name ||
      user?.app_metadata?.full_name ||
      user?.email ||
      '';
    const derivedName = splitName(fallbackFullName);

    return {
      username: userProfile?.username || metadata.username || '',
      full_name: fallbackFullName,
      first_name: fallbackFirstName || derivedName.first_name || '',
      last_name: fallbackLastName || derivedName.last_name || '',
      profile_picture_url:
        userProfile?.profile_picture_url ||
        userProfile?.avatar_url ||
        metadata.profile_picture_url ||
        metadata.avatar_url ||
        user?.app_metadata?.profile_picture_url ||
        user?.app_metadata?.avatar_url ||
        null,
      avatar_url:
        userProfile?.avatar_url ||
        userProfile?.profile_picture_url ||
        metadata.avatar_url ||
        metadata.profile_picture_url ||
        user?.app_metadata?.avatar_url ||
        user?.app_metadata?.profile_picture_url ||
        null,
      phone: userProfile?.phone || userProfile?.phone_number || metadata.phone || '',
      address: userProfile?.address || metadata.address || '',
      date_of_birth: userProfile?.date_of_birth || metadata.date_of_birth || '',
      emergency_contact: userProfile?.emergency_contact || metadata.emergency_contact || '',
      emergency_phone: userProfile?.emergency_phone || metadata.emergency_phone || '',
      staff_id_documents: normalizeStaffIdDocuments(userProfile?.staff_id_documents || metadata.staff_id_documents),
      preferences: userProfile?.preferences || metadata.preferences || {},
      updated_at: userProfile?.updated_at || metadata.updated_at || null,
    };
  }, [
    splitName,
    user?.app_metadata?.full_name,
    user?.email,
    user?.user_metadata,
    userProfile?.address,
    userProfile?.date_of_birth,
    userProfile?.emergency_contact,
    userProfile?.emergency_phone,
    userProfile?.first_name,
    userProfile?.fullName,
    userProfile?.full_name,
    userProfile?.last_name,
    userProfile?.phone,
    userProfile?.phone_number,
    userProfile?.preferences,
    userProfile?.staff_id_documents,
    userProfile?.updated_at,
    userProfile?.username,
  ]);

  const fallbackProfile = useMemo(
    () => buildFallbackProfile(),
    [buildFallbackProfile]
  );

  const displayProfile = useMemo(
    () => profile || fallbackProfile,
    [fallbackProfile, profile]
  );
  const resolvedProfilePictureUrl = String(
    displayProfile?.profile_picture_url ||
    displayProfile?.avatar_url ||
    userProfile?.profile_picture_url ||
    userProfile?.avatar_url ||
    user?.user_metadata?.profile_picture_url ||
    user?.user_metadata?.avatar_url ||
    user?.app_metadata?.profile_picture_url ||
    user?.app_metadata?.avatar_url ||
    ''
  ).trim();
  const loadFailedMessage = tr(
    'profile.errors.loadFailed',
    'Unable to load profile. Showing your account information instead.'
  );
  const displayName =
    [displayProfile?.first_name, displayProfile?.last_name].filter(Boolean).join(' ').trim() ||
    displayProfile?.full_name ||
    user?.email ||
    tr('profile.title', 'My Profile');
  const workspaceDisplayName =
    String(effectiveTenantWorkspaceSession?.tenant?.tenant_name || '').trim() ||
    String(userProfile?.companyName || '').trim() ||
    displayName;
  const roleLabel = String(userRole || 'user').toUpperCase();
  const staffIdDocumentCount = normalizeStaffIdDocuments(displayProfile?.staff_id_documents || user?.user_metadata?.staff_id_documents).length;
  const normalizedAccountType = String(
    userProfile?.accountType ||
    user?.user_metadata?.account_type ||
    user?.app_metadata?.account_type ||
    ''
  ).toLowerCase();
  const isBusinessOwner = userRole === 'business_owner' || isBusinessOwnerAccountType(normalizedAccountType);
  useEffect(() => {
    let cancelled = false;

    const resolveEffectiveTenantWorkspaceSession = async () => {
      if (hasUsableTenantWorkspaceSession(tenantSession)) {
        setEffectiveTenantWorkspaceSession(tenantSession);
        return;
      }

      try {
        const directSession = await getTenantSession().catch(() => null);
        if (hasUsableTenantWorkspaceSession(directSession)) {
          if (!cancelled) {
            setEffectiveTenantWorkspaceSession(directSession);
          }
          return;
        }

        if (!isLocalHost()) {
          if (!cancelled) {
            setEffectiveTenantWorkspaceSession(null);
          }
          return;
        }

        const registryEntries = await listBusinessOwnersFromRegistry().catch(() => []);
        const registryEntry = pickLocalRegistryWorkspaceEntry(registryEntries, userProfile);
        const registrySession = buildRegistryTenantSession(registryEntry);
        if (!cancelled) {
          setEffectiveTenantWorkspaceSession(
            hasUsableTenantWorkspaceSession(registrySession) ? registrySession : null
          );
        }
      } catch {
        if (!cancelled) {
          setEffectiveTenantWorkspaceSession(null);
        }
      }
    };

    resolveEffectiveTenantWorkspaceSession();
    return () => {
      cancelled = true;
    };
  }, [tenantSession, userProfile]);
  const storedTelegramAdminSettings = useMemo(
    () => getTelegramAlertSettingsFromPreferences(displayProfile?.preferences || {}),
    [displayProfile?.preferences]
  );
  const workspaceTelegramAdminSettings = useMemo(() => {
    const tenantSettings = getWorkspaceTenantSettings(effectiveTenantWorkspaceSession);
    const workspaceEventTypes =
      tenantSettings.telegram_event_types && typeof tenantSettings.telegram_event_types === 'object'
        ? normalizeTelegramEventTypes(tenantSettings.telegram_event_types, true)
        : buildDefaultTelegramEventTypes(true);
    const workspaceEnabled = tenantSettings.telegram_enabled === true;
    const internalWorkspaceUser =
      isBusinessOwner ||
      userRole === 'owner' ||
      userRole === 'admin' ||
      userRole === 'employee' ||
      userRole === 'guide' ||
      (isTenantHost() && userRole !== 'customer');

    if (!internalWorkspaceUser) {
      return storedTelegramAdminSettings;
    }

    return {
      ...storedTelegramAdminSettings,
      allowed: workspaceEnabled,
      allowed_event_types: workspaceEnabled
        ? workspaceEventTypes
        : buildDefaultTelegramEventTypes(false),
    };
  }, [effectiveTenantWorkspaceSession?.tenant?.metadata?.tenant_settings, isBusinessOwner, storedTelegramAdminSettings, userRole]);
  const telegramAdminSettings = workspaceTelegramAdminSettings;
  const telegramAllowedCount = useMemo(
    () => countEnabledTelegramAlertEvents(telegramAdminSettings.allowed_event_types),
    [telegramAdminSettings.allowed_event_types]
  );
  const telegramSelectedCount = useMemo(
    () => countEnabledTelegramAlertEvents(telegramPreferenceDraft.selected_event_types),
    [telegramPreferenceDraft.selected_event_types]
  );
  const telegramPersonalChatIds = useMemo(
    () => String(telegramPreferenceDraft.personal_chat_ids || '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
    [telegramPreferenceDraft.personal_chat_ids]
  );
  const telegramProfileActive = telegramAdminSettings.allowed && telegramPreferenceDraft.opt_in && telegramSelectedCount > 0;
  const telegramSavedLabel = useMemo(() => {
    if (!telegramPreferencesSavedAt) return '';
    try {
      return new Date(telegramPreferencesSavedAt).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return '';
    }
  }, [telegramPreferencesSavedAt]);

  const tabs = useMemo(() => {
    const items = [
      { id: 'profile', label: tr('profile.tabs.profile', 'Profile'), icon: '👤' },
      { id: 'security', label: tr('profile.tabs.security', 'Security'), icon: '🔒' },
      { id: 'preferences', label: tr('profile.tabs.preferences', 'Preferences'), icon: '⚙️' },
    ];
    if (userRole === 'owner' || userRole === 'admin') {
      items.push({ id: 'activity', label: tr('profile.tabs.activity', 'Activity'), icon: '📊' });
    }
    return items;
  }, [t, userRole]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (!user?.id) {
        setProfile(null);
        setLoading(false);
        return;
      }

      setLoading(true);
      setNotice(null);
      setProfile((prev) => prev || fallbackProfile);

      try {
        const { data, error } = await UserProfileService.getUserProfile(user.id);

        if (cancelled) return;

        if (error) {
          setNotice({
            tone: 'warning',
            message: loadFailedMessage,
          });
          setProfile(fallbackProfile);
          return;
        }

        setProfile({ ...fallbackProfile, ...(data || {}) });
      } catch (error) {
        if (cancelled) return;
        console.error('Profile loading error:', error);
        setProfile(fallbackProfile);
        setNotice({
          tone: 'warning',
          message: loadFailedMessage,
        });
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [fallbackProfile, loadFailedMessage, user?.id]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (!user?.id || !['owner', 'admin'].includes(userRole)) {
        setActivityLog([]);
        return;
      }

      try {
        const { data } = await UserProfileService.getUserActivityLog(user.id, {
          limit: 20,
          userName: displayName,
          userEmail: user.email,
        });

        if (!cancelled) {
          setActivityLog(data || []);
        }
      } catch (error) {
        if (!cancelled) {
          console.warn('Activity log loading error:', error);
          setActivityLog([]);
        }
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [displayName, user?.email, user?.id, userRole]);

  useEffect(() => {
    setTelegramPreferenceDraft({
      opt_in: telegramAdminSettings.allowed ? telegramAdminSettings.opt_in : false,
      selected_event_types: normalizeTelegramEventTypes(
        telegramAdminSettings.selected_event_types,
        false
      ),
      personal_chat_ids: Array.isArray(telegramAdminSettings.personal_chat_ids)
        ? telegramAdminSettings.personal_chat_ids.join(', ')
        : '',
    });
  }, [
    telegramAdminSettings.allowed,
    telegramAdminSettings.opt_in,
    telegramAdminSettings.personal_chat_ids,
    telegramAdminSettings.selected_event_types,
  ]);

  useEffect(() => {
    let cancelled = false;

    const loadTenantBranding = async () => {
      if (isIsolatedTenantWorkspace) {
        const tenantSettings =
          effectiveTenantWorkspaceSession?.tenantSettings && typeof effectiveTenantWorkspaceSession.tenantSettings === 'object'
            ? effectiveTenantWorkspaceSession.tenantSettings
            : {};
        if (!cancelled) {
          setTenantLogoUrl(String(tenantSettings.logo_url || '').trim());
        }
        return;
      }

      try {
        const tenantSettings = await fetchSystemSettings();
        if (!cancelled) {
          setTenantLogoUrl(String(tenantSettings?.logoUrl || '').trim());
        }
      } catch (error) {
        if (!cancelled) {
          console.warn('Profile branding unavailable:', error);
          setTenantLogoUrl('');
        }
      }
    };

    loadTenantBranding();

    const handleBrandingUpdate = (event) => {
      const nextLogoUrl = String(event?.detail?.logoUrl || '').trim();
      setTenantLogoUrl(nextLogoUrl);
    };

    window.addEventListener(SYSTEM_SETTINGS_UPDATED_EVENT, handleBrandingUpdate);
    return () => {
      cancelled = true;
      window.removeEventListener(SYSTEM_SETTINGS_UPDATED_EVENT, handleBrandingUpdate);
    };
  }, [effectiveTenantWorkspaceSession, isIsolatedTenantWorkspace]);

  const handleProfileUpdate = async (updatedData) => {
    try {
      const { data, error } = await UserProfileService.updateUserProfile(user.id, updatedData);
      if (error) {
        setNotice({ tone: 'warning', message: error.message });
        return false;
      }

      const nextFirstName = String(updatedData?.first_name || data?.first_name || '').trim();
      const nextLastName = String(updatedData?.last_name || data?.last_name || '').trim();
      const nextFullName =
        String(
          [nextFirstName, nextLastName].filter(Boolean).join(' ').trim() ||
          updatedData?.full_name ||
          data?.full_name ||
          ''
        ).trim();
      const nextProfile = {
        ...(profile || fallbackProfile),
        ...(data || {}),
        ...updatedData,
        username: String(updatedData?.username ?? data?.username ?? profile?.username ?? fallbackProfile?.username ?? '').trim().toLowerCase(),
        first_name: nextFirstName,
        last_name: nextLastName,
        full_name: nextFullName,
      };

      setProfile(nextProfile);
      updateCurrentUserProfile(nextProfile);
      setNotice(null);
      return true;
    } catch (error) {
      console.error('Profile update error:', error);
      setNotice({
        tone: 'warning',
        message: tr('profile.errors.updateFailed', 'Unable to update profile'),
      });
      return false;
    }
  };

  const handlePasswordChange = async (newPassword) => {
    const { error } = await UserProfileService.changePassword(newPassword);
    if (error) {
      toast.error(tr('profile.password.updateFailed', 'Failed to update password'), {
        description: error.message || tr('common.tryAgain', 'Please try again.'),
      });
      throw error;
    }

    toast.success(tr('profile.changePassword', 'Change Password'), {
      description: tr('profile.password.updatedDescription', 'Password updated successfully.'),
    });
    setShowPasswordModal(false);
    return true;
  };

  const handleProfilePictureUpdate = (newPictureUrl) => {
    const normalizedUrl = String(newPictureUrl || '').trim() || null;
    const nextProfilePicturePatch = {
      profile_picture_url: normalizedUrl,
      avatar_url: normalizedUrl,
    };

    setProfile((prev) => ({
      ...(prev || fallbackProfile),
      ...nextProfilePicturePatch,
    }));
    updateCurrentUserProfile?.(nextProfilePicturePatch);
  };

  const handleTelegramPreferencesSave = async () => {
    if (!user?.id || telegramPreferencesSaving) return;
    setNotice(null);

    const nextSelectedEventTypes = {};
    TELEGRAM_ALERT_EVENT_KEYS.forEach((key) => {
      nextSelectedEventTypes[key] =
        telegramAdminSettings.allowed &&
        telegramAdminSettings.allowed_event_types?.[key] === true &&
        telegramPreferenceDraft.selected_event_types?.[key] === true;
    });

    const nextPreferences = {
      ...(displayProfile?.preferences && typeof displayProfile.preferences === 'object' ? displayProfile.preferences : {}),
      telegram_alerts: {
        ...((displayProfile?.preferences?.telegram_alerts && typeof displayProfile.preferences.telegram_alerts === 'object')
          ? displayProfile.preferences.telegram_alerts
          : {}),
        allowed: telegramAdminSettings.allowed,
        allowed_event_types: telegramAdminSettings.allowed_event_types,
        opt_in: telegramAdminSettings.allowed ? telegramPreferenceDraft.opt_in === true : false,
        selected_event_types: nextSelectedEventTypes,
        personal_chat_ids: String(telegramPreferenceDraft.personal_chat_ids || '')
          .split(',')
          .map((value) => value.trim())
          .filter(Boolean),
      },
    };

    setTelegramPreferencesSaving(true);
    const saved = await handleProfileUpdate({
      preferences: nextPreferences,
    });

    if (saved) {
      const savedAt = new Date().toISOString();
      setTelegramPreferencesSavedAt(savedAt);
      setNotice({
        tone: 'success',
        message: telegramAdminSettings.allowed
          ? tr('profile.telegram.saved', 'Telegram preferences saved successfully.')
          : 'Telegram chat IDs saved. They will be used once your admin enables Telegram for your profile.',
      });
      toast.success(tr('profile.preferences.notifications', 'Notifications'), {
        description: telegramAdminSettings.allowed
          ? tr('profile.telegram.saved', 'Telegram preferences saved successfully.')
          : tr('Telegram chat IDs saved. Alerts will start once your admin enables Telegram for your account.', "Les identifiants Telegram ont été enregistrés. Les alertes commenceront une fois que l'admin aura activé Telegram pour votre compte."),
      });
    } else {
      setTelegramPreferencesSavedAt(null);
      toast.error(tr('profile.preferences.notifications', 'Notifications'), {
        description: tr('profile.telegram.failed', 'Unable to save Telegram preferences.'),
      });
    }
    setTelegramPreferencesSaving(false);
  };

  const handleTelegramTest = async () => {
    if (telegramTestSending) return;
    if (!telegramAdminSettings.allowed) {
      setNotice({
        tone: 'warning',
        message: 'Your admin has not enabled Telegram alerts for your account yet.',
      });
      toast.error(tr('profile.preferences.notifications', 'Notifications'), {
        description: tr('Your admin has not enabled Telegram alerts for your account yet.', "Votre admin n'a pas encore activé les alertes Telegram pour votre compte."),
      });
      return;
    }
    if (!telegramPreferenceDraft.opt_in) {
      setNotice({
        tone: 'warning',
        message: 'Turn on Receive Telegram alerts for your profile first.',
      });
      toast.error(tr('profile.preferences.notifications', 'Notifications'), {
        description: tr('Turn on Telegram alerts for your profile first.', "Activez d'abord les alertes Telegram pour votre profil."),
      });
      return;
    }
    if (telegramSelectedCount <= 0) {
      setNotice({
        tone: 'warning',
        message: 'Select at least one Telegram event type first.',
      });
      toast.error(tr('profile.preferences.notifications', 'Notifications'), {
        description: tr('Select at least one Telegram event type first.', "Sélectionnez d'abord au moins un type d'événement Telegram."),
      });
      return;
    }
    if (telegramPersonalChatIds.length <= 0) {
      setNotice({
        tone: 'warning',
        message: 'Add your Telegram chat ID before sending a personal test.',
      });
      toast.error(tr('profile.preferences.notifications', 'Notifications'), {
        description: tr('Add your Telegram chat ID before sending a personal test.', "Ajoutez votre identifiant Telegram avant d'envoyer un test personnel."),
      });
      return;
    }
    setNotice(null);
    setTelegramTestSending(true);
    try {
      await sendTelegramTestAlert({
        scope: 'profile',
        actorName: displayName,
      });
      toast.success(tr('profile.telegram.testSent', 'Telegram test sent to your Telegram chat.'));
    } catch (error) {
      console.warn('Unable to send Telegram profile test:', error?.message || error);
      toast.error(error?.message || tr('profile.telegram.testFailed', 'Unable to send Telegram test right now.'));
    } finally {
      setTelegramTestSending(false);
    }
  };

  const handleTelegramOptInToggle = (checked) => {
    if (!telegramAdminSettings.allowed) {
      setNotice({
        tone: 'warning',
        message: 'Your admin must enable Telegram alerts for your account before you can turn this on.',
      });
      toast.error(tr('profile.preferences.notifications', 'Notifications'), {
        description: 'Your admin must enable Telegram alerts for your account before you can turn this on.',
      });
      return;
    }

    setNotice(null);
    setTelegramPreferencesSavedAt(null);

    setTelegramPreferenceDraft((current) => ({
      ...current,
      opt_in: checked,
      selected_event_types: checked
        ? current.selected_event_types
        : buildDefaultTelegramEventTypes(false),
    }));
  };

  const handleTelegramOptInAttempt = () => {
    handleTelegramOptInToggle(!telegramPreferenceDraft.opt_in);
  };

  if (loading && !profile && !suppressBlockingLoader) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <LoadingSpinner size="large" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <div className="max-w-md rounded-[32px] border border-slate-200 bg-white p-8 text-center shadow-xl">
          <h2 className="text-2xl font-bold text-slate-950">
            {tr('profile.notAuthenticated', 'You are not signed in')}
          </h2>
          <p className="mt-2 text-sm font-medium text-slate-500">
            {tr('profile.pleaseLogin', 'Please log in to view your profile.')}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="pb-10">
      <AdminModuleHero
        icon={<Shield className="h-7 w-7" />}
        eyebrow={tr('profile.title', 'My Profile')}
        title={workspaceDisplayName}
        description={tr('profile.roleBasedAccess', 'Role-based access')}
        titleClassName="text-[1.85rem] sm:text-[2.15rem] lg:text-[2.5rem]"
        descriptionClassName="max-w-2xl text-base sm:text-lg"
        actions={(
          <div className="flex flex-wrap items-center justify-end gap-2">
            <span className="inline-flex items-center rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-[11px] font-black tracking-[0.2em] text-violet-700">
              {APP_VERSION_LABEL}
            </span>
            <button
              type="button"
              onClick={() => setShowPasswordModal(true)}
              className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
            >
              🔒 {tr('profile.changePassword', 'Change Password')}
            </button>
          </div>
        )}
      />

      <div className="mt-6 space-y-6 px-4 sm:px-6 lg:px-8">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
          <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
              <ProfilePictureUpload
                userId={user.id}
                fallbackLabel={displayName || user.email}
                currentPictureUrl={resolvedProfilePictureUrl}
                fallbackImageUrl={tenantLogoUrl || inheritedTenantLogoUrl}
                onPictureUpdate={handleProfilePictureUpdate}
                size="large"
                showInstructions={false}
              />
              <div className="min-w-0 flex-1">
                <h2 className="break-all text-lg font-semibold tracking-[-0.02em] text-slate-900 sm:text-xl lg:text-[1.65rem] lg:leading-[1.12]">
                  {displayName}
                </h2>
                <p className="mt-1 text-base text-slate-500 sm:text-lg lg:text-[1.1rem] lg:leading-[1.35]">
                  {workspaceDisplayName} workspace
                </p>
                <div className="mt-4 flex flex-wrap items-center gap-2.5">
                  <span className={`rounded-full border px-3.5 py-1.5 text-xs font-black tracking-[0.14em] shadow-sm ${roleClassName[userRole] || roleClassName.customer}`}>
                    {roleLabel}
                  </span>
                  {userRole !== 'customer' && (
                    <span className="rounded-full border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-700 shadow-sm">
                        {staffIdDocumentCount} {staffIdDocumentCount === 1 ? tr('profile.idFile', 'ID file') : tr('profile.idFiles', 'ID files')}
                    </span>
                  )}
                  <span className="max-w-full break-all rounded-full border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-700 shadow-sm">
                    {user.email}
                  </span>
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-3xl border border-slate-200 bg-slate-50/70 p-4">
                <p className="text-sm font-semibold text-slate-800">{tr('profile.title', 'Profile')}</p>
                <p className="mt-4 text-[1.9rem] font-bold tracking-tight text-slate-950 sm:text-[2.05rem] lg:text-[1.95rem] lg:leading-none">{roleLabel}</p>
                <p className="mt-2 text-sm text-slate-500 lg:text-[0.95rem]">{tr('profile.roleBasedAccess', 'Role-based access')}</p>
              </div>
              <div className="rounded-3xl border border-slate-200 bg-slate-50/70 p-4">
                <p className="text-sm font-semibold text-slate-800">{tr('profile.subscription.currentPlan', 'Current plan')}</p>
                <p className="mt-4 text-[1.9rem] font-bold tracking-tight text-slate-950 capitalize sm:text-[2.05rem] lg:text-[1.95rem] lg:leading-none">
                  {String(userProfile?.planType || userProfile?.subscriptionPlan || 'trial').replace(/_/g, ' ')}
                </p>
                <p className="mt-2 text-sm text-slate-500 capitalize lg:text-[0.95rem]">
                  {String(userProfile?.subscriptionStatus || 'trial')}
                </p>
              </div>
            </div>
          </section>
        </div>

        <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
          <div className="flex gap-2 overflow-x-auto rounded-2xl border border-slate-200 bg-slate-50 p-1.5">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`inline-flex min-w-fit items-center justify-center gap-2 rounded-xl px-3 py-2 text-xs font-bold transition sm:px-4 sm:py-2.5 sm:text-sm ${
                  activeTab === tab.id
                    ? 'bg-white text-violet-700 shadow-sm'
                    : 'text-slate-500 hover:bg-white hover:text-slate-900'
                }`}
              >
                <span>{tab.icon}</span>
                {tab.label}
              </button>
            ))}
          </div>
        </section>

        {notice && (
          <div className={`rounded-[24px] border px-4 py-3 text-sm font-semibold shadow-sm ${
            notice.tone === 'success'
              ? 'border-emerald-200 bg-emerald-50/90 text-emerald-800'
              : 'border-amber-200 bg-amber-50/90 text-amber-800'
          }`}>
            {notice.message}
          </div>
        )}

        <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
          {activeTab === 'profile' && (
            <>
              <BusinessOwnerSubscriptionCard
                isBusinessOwner={isBusinessOwner}
                verificationStatus={userProfile?.verificationStatus}
                subscriptionPlan={userProfile?.subscriptionPlan}
                planType={userProfile?.planType}
                subscriptionStatus={userProfile?.subscriptionStatus}
                billingStatus={userProfile?.billingStatus}
                trialEndsAt={userProfile?.trialEndsAt}
                subscriptionStartedAt={userProfile?.subscriptionStartedAt}
                suspensionReason={userProfile?.suspensionReason}
                tr={tr}
              />
              <ProfileSettings
                profile={displayProfile}
                userRole={userRole}
                onProfileUpdate={handleProfileUpdate}
              />
              <ProfileVerificationCard profile={displayProfile} />
            </>
          )}

          {activeTab === 'security' && (
            <div className="space-y-4">
              <div className="rounded-[28px] border border-slate-200 bg-slate-50/90 p-5 shadow-sm">
                <p className="text-xs font-bold uppercase tracking-[0.22em] text-slate-500">
                  {tr('profile.tabs.security', 'Security')}
                </p>
                <h2 className="mt-1 text-xl font-bold text-slate-950">
                  {tr('profile.security.password', 'Password')}
                </h2>
                <p className="mt-2 text-sm font-medium text-slate-500">
                  {tr('profile.security.passwordDescription', 'Update your account password.')}
                </p>
                <button
                  type="button"
                  onClick={() => setShowPasswordModal(true)}
                  className="mt-5 rounded-2xl bg-slate-950 px-5 py-3 text-sm font-bold text-white transition hover:-translate-y-0.5 hover:bg-violet-800"
                >
                  {tr('profile.changePassword', 'Change Password')}
                </button>
              </div>
              <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h3 className="text-base font-bold text-slate-950">
                      {tr('profile.security.twoFactor', 'Two-factor authentication')}
                    </h3>
                    <p className="mt-1 text-sm font-medium text-slate-500">
                      {tr('profile.security.twoFactorDescription', 'Add an extra layer of protection to your account.')}
                    </p>
                  </div>
                  <span className="w-fit rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-700">
                    {tr('common.comingSoon', 'Coming soon')}
                  </span>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'preferences' && (
            <div className="space-y-4">
              <div className="rounded-[28px] border border-slate-200 bg-slate-50/90 p-5 shadow-sm">
                <p className="text-xs font-bold uppercase tracking-[0.22em] text-slate-500">
                  {tr('profile.tabs.preferences', 'Preferences')}
                </p>
                <h2 className="mt-1 text-xl font-bold text-slate-950">
                  {tr('profile.preferences.notifications', 'Notifications')}
                </h2>
                <p className="mt-2 text-sm font-medium text-slate-500">
                  {tr('profile.preferences.notificationsDescription', 'Choose how you want to receive account updates.')}
                </p>
              </div>

              <div className="rounded-[28px] border border-sky-100 bg-white p-5 shadow-sm">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.22em] text-sky-500">Telegram</p>
                    <h3 className="mt-1 text-xl font-bold text-slate-950">
                      {tr('profile.telegram.title', 'Telegram Notifications')}
                    </h3>
                    <p className="mt-2 max-w-2xl text-sm font-medium text-slate-500">
                      {tr('profile.telegram.description', 'Choose which Telegram alerts you want to receive from the rental workspace.')}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-3 py-1 text-xs font-bold ${
                      telegramAdminSettings.allowed
                        ? 'border border-emerald-200 bg-emerald-50 text-emerald-700'
                        : 'border border-slate-200 bg-slate-100 text-slate-500'
                    }`}>
                      {telegramAdminSettings.allowed
                        ? tr('profile.telegram.allowedByAdmin', 'Allowed by admin')
                        : tr('profile.telegram.disabledByAdmin', 'Disabled by admin')}
                    </span>
                    <span className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-bold text-sky-700">
                      {telegramAllowedCount} {tr('profile.telegram.allowedEvents', 'events allowed')}
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleTelegramOptInAttempt}
                  className="mt-5 block w-full rounded-3xl border border-slate-200 bg-slate-50/80 p-4 text-left transition hover:border-violet-200 hover:bg-violet-50/40"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-bold text-slate-900">
                        {tr('profile.telegram.receiveToggle', 'Receive Telegram alerts')}
                      </p>
                    <p className="mt-1 text-sm text-slate-500">
                      {telegramAdminSettings.allowed
                          ? tr('profile.telegram.receiveHint', 'Workspace Telegram is already connected by your owner/admin. Turn this on to receive the alert types enabled for you.')
                          : tr('profile.telegram.disabledHint', 'Your admin has not enabled Telegram alerts for your account yet.')}
                      </p>
                    </div>
                    <span
                      onClick={(event) => {
                        event.stopPropagation();
                        handleTelegramOptInAttempt();
                      }}
                      aria-pressed={telegramPreferenceDraft.opt_in}
                      className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition ${
                      telegramPreferenceDraft.opt_in && telegramAdminSettings.allowed ? 'bg-violet-600' : 'bg-slate-300'
                    } ${telegramAdminSettings.allowed ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'}`}>
                      <input
                        type="checkbox"
                        className="sr-only"
                        checked={telegramPreferenceDraft.opt_in}
                        readOnly
                      />
                      <span
                        className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${
                          telegramPreferenceDraft.opt_in && telegramAdminSettings.allowed ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </span>
                  </div>
                </button>
                {!telegramAdminSettings.allowed ? (
                  <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
                    Your admin must enable Telegram alerts for your account before you can turn this on.
                  </div>
                ) : null}

                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  <div className="rounded-3xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">
                      {tr('profile.telegram.statusLabel', 'Status')}
                    </p>
                    <p className="mt-2 text-sm font-bold text-slate-900">
                      {telegramProfileActive
                        ? tr('profile.telegram.statusOn', 'Active for your profile')
                        : tr('profile.telegram.statusOff', 'Not fully active yet')}
                    </p>
                  </div>
                  <div className="rounded-3xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">
                      {tr('profile.telegram.allowedLabel', 'Allowed by admin')}
                    </p>
                    <p className="mt-2 text-sm font-bold text-slate-900">
                      {telegramAllowedCount} {tr('profile.telegram.allowedEvents', 'events allowed')}
                    </p>
                  </div>
                  <div className="rounded-3xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">
                      {tr('profile.telegram.selectedLabel', 'Selected by you')}
                    </p>
                    <p className="mt-2 text-sm font-bold text-slate-900">
                      {telegramSelectedCount} {tr('profile.telegram.selectedEvents', 'event types selected')}
                    </p>
                  </div>
                </div>

                <div className="mt-4 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
                  <label className="block text-sm font-bold text-slate-900">
                    {tr('profile.telegram.personalChatIds', 'My Direct Alert Chat ID(s)')}
                  </label>
                  <p className="mt-1 text-sm text-slate-500">
                    {telegramAdminSettings.allowed
                      ? tr('profile.telegram.personalChatIdsWorkspaceHint', 'Workspace Telegram is already connected. Add your own chat IDs here if you also want direct alerts sent to you, separated by commas.')
                      : tr('profile.telegram.personalChatIdsHint', 'Add your own chat IDs here if you want direct alerts sent to you, separated by commas.')}
                  </p>
                  {!telegramAdminSettings.allowed ? (
                    <p className="mt-2 text-xs font-semibold text-amber-600">
                      You can save your direct chat IDs now, and they will be used once admin enables Telegram for your profile.
                    </p>
                  ) : null}
                  <input
                    type="text"
                    className="mt-3 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-violet-400 focus:ring-4 focus:ring-violet-100"
                    value={telegramPreferenceDraft.personal_chat_ids}
                    placeholder="232312491, 998877665"
                    onChange={(event) => {
                      setTelegramPreferencesSavedAt(null);
                      setTelegramPreferenceDraft((current) => ({
                        ...current,
                        personal_chat_ids: event.target.value,
                      }));
                    }}
                  />
                </div>

                <div className={`mt-4 grid gap-3 rounded-3xl border p-4 ${
                  telegramAdminSettings.allowed
                    ? 'border-violet-100 bg-[linear-gradient(135deg,rgba(245,243,255,0.55)_0%,rgba(255,255,255,0.95)_100%)]'
                    : 'border-slate-200 bg-slate-50 opacity-70'
                }`}>
                  {TELEGRAM_ALERT_EVENT_KEYS.map((eventKey) => {
                    const adminAllowed = telegramAdminSettings.allowed_event_types?.[eventKey] === true;
                    const checked = telegramPreferenceDraft.selected_event_types?.[eventKey] === true;

                    return (
                      <label
                        key={eventKey}
                        className={`flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 ${
                          adminAllowed
                            ? 'border-white bg-white/90 shadow-sm'
                            : 'border-slate-200 bg-slate-100 text-slate-400'
                        }`}
                      >
                        <div>
                          <p className="text-sm font-bold text-slate-900">
                            {tr(`profile.telegram.events.${eventKey}`, TELEGRAM_ALERT_EVENT_LABELS[eventKey])}
                          </p>
                          <p className="mt-1 text-xs font-medium text-slate-500">
                            {adminAllowed
                              ? tr('profile.telegram.eventEnabledByAdmin', 'Available for your account')
                              : tr('profile.telegram.eventDisabledByAdmin', 'Disabled by admin')}
                          </p>
                        </div>
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-slate-300 text-violet-600 focus:ring-violet-500"
                          disabled={!telegramAdminSettings.allowed || !telegramPreferenceDraft.opt_in || !adminAllowed}
                          checked={checked}
                          onChange={(event) => {
                            setTelegramPreferencesSavedAt(null);
                            setTelegramPreferenceDraft((current) => ({
                              ...current,
                              selected_event_types: {
                                ...current.selected_event_types,
                                [eventKey]: event.target.checked,
                              },
                            }));
                          }}
                        />
                      </label>
                    );
                  })}
                </div>

                <div className="mt-4 flex flex-col gap-3 rounded-3xl border border-slate-200 bg-slate-50/80 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-bold text-slate-900">
                      {tr('profile.telegram.selectionSummary', 'Current selection')}
                    </p>
                    <p className="mt-1 text-sm text-slate-500">
                      {telegramPreferenceDraft.opt_in
                        ? `${telegramSelectedCount} ${tr('profile.telegram.selectedEvents', 'event types selected')}`
                        : tr('profile.telegram.offSummary', 'Telegram alerts are currently turned off for your profile.')}
                    </p>
                    {telegramPreferencesSavedAt ? (
                      <div className="mt-3 inline-flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-800">
                        <span aria-hidden="true">✓</span>
                        <span>
                          {tr('profile.telegram.savedInline', 'Telegram preferences saved')}
                          {telegramSavedLabel ? ` • ${telegramSavedLabel}` : ''}
                        </span>
                      </div>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={handleTelegramTest}
                      disabled={telegramTestSending}
                      className={`inline-flex items-center justify-center rounded-2xl px-5 py-3 text-sm font-bold transition ${
                        telegramTestSending
                          ? 'cursor-not-allowed bg-slate-200 text-slate-500'
                          : 'bg-sky-100 text-sky-800 hover:-translate-y-0.5 hover:bg-sky-200'
                      }`}
                    >
                      {telegramTestSending
                        ? tr('profile.telegram.testing', 'Sending test...')
                        : tr('profile.telegram.test', 'Send test')}
                    </button>
                    <button
                      type="button"
                      onClick={handleTelegramPreferencesSave}
                      disabled={telegramPreferencesSaving}
                      className={`inline-flex items-center justify-center rounded-2xl px-5 py-3 text-sm font-bold transition ${
                        telegramPreferencesSaving
                          ? 'cursor-not-allowed bg-slate-300 text-slate-600'
                          : 'bg-slate-950 text-white hover:-translate-y-0.5 hover:bg-violet-800'
                      }`}
                    >
                      {telegramPreferencesSaving
                        ? tr('profile.telegram.saving', 'Saving...')
                        : tr('profile.telegram.save', 'Save Telegram Preferences')}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'activity' && ['owner', 'admin'].includes(userRole) && (
            <div className="space-y-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.22em] text-violet-500">
                  {tr('profile.tabs.activity', 'Activity')}
                </p>
                <h2 className="mt-1 text-xl font-bold text-slate-950">
                  {tr('profile.activity.title', 'Activity')}
                </h2>
              </div>
              {activityLog.length > 0 ? (
                activityLog.map((activity, index) => (
                  <div key={`${activity.id || activity.action}-${index}`} className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 shadow-sm">
                    <p className="text-sm font-bold text-slate-900">{activity.action}</p>
                    <p className="mt-1 text-sm text-slate-500">{activity.description || activity.details}</p>
                    <p className="mt-2 text-xs font-semibold text-slate-400">
                      {activity.created_at ? new Date(activity.created_at).toLocaleString() : ''}
                    </p>
                  </div>
                ))
              ) : (
                <div className="rounded-[28px] border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-sm font-semibold text-slate-500">
                  {tr('profile.activity.noActivity', 'No activity recorded yet.')}
                </div>
              )}
            </div>
          )}
        </section>
      </div>

      {showPasswordModal && (
        <ChangePasswordModal
          isOpen={showPasswordModal}
          onClose={() => setShowPasswordModal(false)}
          onPasswordChange={handlePasswordChange}
        />
      )}
    </div>
  );
};

export default ProfilePage;
