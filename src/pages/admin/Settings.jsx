import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import {
  Bell,
  Briefcase,
  CalendarDays,
  Image as ImageIcon,
  KeyRound,
  MessageSquareMore,
  RefreshCw,
  Save,
  Settings2,
  Shield,
  Store,
  Upload,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguageContext } from '../../contexts/LanguageContext';
import { adminApiRequest } from '../../services/adminApi';
import { defaultSystemSettings, fetchSystemSettings, saveSystemSettings } from '../../services/systemSettingsApi';
import { getTenantSession } from '../../services/TenantRegistryService';
import { listBusinessOwnersFromRegistry } from '../../services/TenantProvisioningAdminService';
import { sendTelegramTestAlert } from '../../services/TelegramAlertService';
import { shouldScopeSharedTenantData } from '../../services/OrganizationService';
import { updateTenantControls } from '../../services/TenantProvisioningService';
import { buildTenantWorkspaceBootstrap } from '../../services/TenantWorkspaceService';
import AdminModuleHero from '../../components/admin/AdminModuleHero';
import AdminWorkspaceLoadingShell from '../../components/admin/AdminWorkspaceLoadingShell';
import i18n from '../../i18n';
import { supabase } from '../../lib/supabase';
import { shouldSuppressBlockingPageLoader } from '../../config/navigationShells';
import { getHostContext, isSaharaXBrandingHost } from '../../utils/hostContext';
import {
  TELEGRAM_ALERT_EVENT_KEYS,
  normalizeTelegramDeliveryRoutes,
} from '../../utils/telegramAlertPreferences';

const SAHARAX_DEFAULT_LOGO_URL = '/assets/logo.jpg';
const SAHARAX_DEFAULT_STAMP_URL = '/assets/stamp.png';

const buildTenantIdentityDraft = (tenantSession = null, fallbackSettings = {}) => {
  const tenantSettings =
    tenantSession?.tenantSettings && typeof tenantSession.tenantSettings === 'object'
      ? tenantSession.tenantSettings
      : {};
  const businessAccount =
    tenantSession?.businessAccount && typeof tenantSession.businessAccount === 'object'
      ? tenantSession.businessAccount
      : {};
  const tenantRecord =
    tenantSession?.tenant && typeof tenantSession.tenant === 'object'
      ? tenantSession.tenant
      : {};
  const tenantLabel = String(
    tenantSettings.public_display_name ||
    tenantSettings.brand_name ||
    tenantRecord.tenant_name ||
    tenantSession?.tenantName ||
    tenantRecord.tenant_slug ||
    tenantSession?.tenantSlug ||
    businessAccount.company_name ||
    ''
  ).trim();

  return {
    brand_name: String(tenantSettings.brand_name || tenantLabel || '').trim(),
    public_display_name: String(tenantSettings.public_display_name || tenantLabel || '').trim(),
    legal_business_name: String(tenantSettings.legal_business_name || businessAccount.company_name || tenantLabel || '').trim(),
    support_email: String(tenantSettings.support_email || businessAccount.email || '').trim(),
    custom_domain: String(tenantSettings.custom_domain || '').trim(),
    default_language: ['en', 'fr', 'ar'].includes(String(tenantSettings.default_language || fallbackSettings.language || '').trim().toLowerCase())
      ? String(tenantSettings.default_language || fallbackSettings.language).trim().toLowerCase()
      : 'en',
    currency: String(tenantSettings.currency || fallbackSettings.currency || 'MAD').trim().toUpperCase(),
    timezone: String(tenantSettings.timezone || fallbackSettings.timezone || 'Africa/Casablanca').trim(),
    country: String(tenantSettings.country || '').trim(),
  };
};

const buildTenantBusinessProfileDraft = (tenantSession = null, fallbackSettings = {}) => {
  const tenantSettings =
    tenantSession?.tenantSettings && typeof tenantSession.tenantSettings === 'object'
      ? tenantSession.tenantSettings
      : {};
  const businessAccount =
    tenantSession?.businessAccount && typeof tenantSession.businessAccount === 'object'
      ? tenantSession.businessAccount
      : {};
  const tenantRecord =
    tenantSession?.tenant && typeof tenantSession.tenant === 'object'
      ? tenantSession.tenant
      : {};
  const tenantLabel = String(
    tenantSettings.public_display_name ||
    tenantSettings.brand_name ||
    tenantRecord.tenant_name ||
    tenantSession?.tenantName ||
    tenantRecord.tenant_slug ||
    tenantSession?.tenantSlug ||
    businessAccount.company_name ||
    ''
  ).trim();

  return {
    companyName: tenantLabel,
    companyEmail: String(tenantSettings.support_email || businessAccount.email || '').trim(),
    companyPhone: String(tenantSettings.company_phone || '').trim(),
    companyAddress: String(tenantSettings.company_address || '').trim(),
    companyWebsite: String(tenantSettings.company_website || '').trim(),
    logoUrl: String(tenantSettings.logo_url || '').trim(),
    stampUrl: String(tenantSettings.stamp_url || '').trim(),
    timezone: String(tenantSettings.timezone || fallbackSettings.timezone || 'Africa/Casablanca').trim(),
    language: ['en', 'fr', 'ar'].includes(String(tenantSettings.default_language || fallbackSettings.language || '').trim().toLowerCase())
      ? String(tenantSettings.default_language || fallbackSettings.language).trim().toLowerCase()
      : 'en',
    currency: String(tenantSettings.currency || fallbackSettings.currency || 'MAD').trim().toUpperCase(),
  };
};

const buildTenantTelegramDraft = (tenantSession = null) => {
  const tenantSettings =
    tenantSession?.tenantSettings && typeof tenantSession.tenantSettings === 'object'
      ? tenantSession.tenantSettings
      : {};
  const eventTypes =
    tenantSettings.telegram_event_types && typeof tenantSettings.telegram_event_types === 'object'
      ? tenantSettings.telegram_event_types
      : {};

  const fallbackBaseUrl = (() => {
    if (tenantSettings.telegram_base_url) return String(tenantSettings.telegram_base_url).trim();
    if (tenantSettings.custom_domain) return `https://${String(tenantSettings.custom_domain).trim().replace(/^https?:\/\//, '')}`;
    if (typeof window !== 'undefined') return window.location.origin;
    return '';
  })();

  return {
    telegram_enabled: Boolean(tenantSettings.telegram_enabled),
    telegram_bot_token: String(tenantSettings.telegram_bot_token || '').trim(),
    telegram_chat_ids: Array.isArray(tenantSettings.telegram_chat_ids)
      ? tenantSettings.telegram_chat_ids.join(', ')
      : String(tenantSettings.telegram_chat_ids || '').trim(),
    telegram_website_reservation_chat_ids: Array.isArray(tenantSettings.telegram_website_reservation_chat_ids)
      ? tenantSettings.telegram_website_reservation_chat_ids.join(', ')
      : String(tenantSettings.telegram_website_reservation_chat_ids || '').trim(),
    telegram_base_url: fallbackBaseUrl,
    telegram_overdue_repeat_minutes: Number(tenantSettings.telegram_overdue_repeat_minutes) >= 0
      ? Number(tenantSettings.telegram_overdue_repeat_minutes)
      : 60,
    telegram_event_types: {
      rental_created: eventTypes.rental_created !== false,
      website_reservation_created: eventTypes.website_reservation_created !== false,
      rental_started: eventTypes.rental_started !== false,
      rental_vehicle_assigned: eventTypes.rental_vehicle_assigned !== false,
      rental_vehicle_replaced: eventTypes.rental_vehicle_replaced !== false,
      rental_completed: eventTypes.rental_completed !== false,
      payment_received: eventTypes.payment_received !== false,
      rental_overdue: eventTypes.rental_overdue !== false,
      rental_cancelled: eventTypes.rental_cancelled !== false,
      deposit_returned: eventTypes.deposit_returned !== false,
      rental_extension_requested: eventTypes.rental_extension_requested !== false,
      rental_price_change_requested: eventTypes.rental_price_change_requested !== false,
    },
    telegram_delivery_routes: normalizeTelegramDeliveryRoutes(tenantSettings.telegram_delivery_routes),
  };
};

const getBrandingContext = () => {
  if (typeof window === 'undefined') {
    return { isSaharaXTenant: false, isLocal: false };
  }

  const hostname = String(window.location.hostname || '').toLowerCase();
  const isLocal = hostname === 'localhost' || hostname === '127.0.0.1';
  const isSaharaXTenant = isSaharaXBrandingHost();

  return { isSaharaXTenant, isLocal };
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

const shouldResolveTenantWorkspaceFromApi = ({
  userProfile = null,
  hostContext = null,
} = {}) => {
  const normalizedAccountType = String(
    userProfile?.accountType ||
    userProfile?.account_type ||
    ''
  ).trim().toLowerCase();
  const normalizedRole = String(
    userProfile?.role ||
    userProfile?.user_role ||
    ''
  ).trim().toLowerCase();

  if (hostContext?.kind === 'tenant') {
    return true;
  }

  return (
    ['operator', 'business_owner', 'business', 'rental_business'].includes(normalizedAccountType) ||
    ['business_owner', 'owner', 'admin', 'employee'].includes(normalizedRole)
  );
};

const hasUsableTenantWorkspaceSession = (session = null) =>
  Boolean(
    session &&
    typeof session === 'object' &&
    String(session?.tenantId || session?.tenant?.id || '').trim() &&
    String(session?.businessAccountId || session?.business_account?.id || session?.businessAccount?.id || '').trim()
  );

const countTenantSettingsKeys = (session = null) => {
  const tenantSettings =
    session?.tenantSettings && typeof session.tenantSettings === 'object'
      ? session.tenantSettings
      : {};
  return Object.keys(tenantSettings).filter((key) => tenantSettings[key] !== undefined && tenantSettings[key] !== null && tenantSettings[key] !== '').length;
};

const pickRicherTenantSession = (...candidates) => {
  const sessions = candidates.filter(Boolean);
  if (sessions.length <= 1) {
    return sessions[0] || null;
  }

  return sessions.reduce((best, current) => {
    if (!best) return current;

    const bestScore = countTenantSettingsKeys(best);
    const currentScore = countTenantSettingsKeys(current);

    if (currentScore > bestScore) return current;
    if (currentScore < bestScore) return best;

    const bestHasIdentity = hasUsableTenantWorkspaceSession(best);
    const currentHasIdentity = hasUsableTenantWorkspaceSession(current);
    if (currentHasIdentity && !bestHasIdentity) return current;

    return best;
  }, null);
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
    featureAccess:
      entry?.tenant?.metadata?.feature_access && typeof entry.tenant.metadata.feature_access === 'object'
        ? entry.tenant.metadata.feature_access
        : {},
    commercialSettings:
      entry?.tenant?.metadata?.commercial_settings && typeof entry.tenant.metadata.commercial_settings === 'object'
        ? entry.tenant.metadata.commercial_settings
        : {},
  };
};

const buildTenantTelegramStorageKey = (session = null) => {
  const tenantId = String(session?.tenantId || session?.tenant?.id || '').trim();
  const tenantSlug = String(session?.tenantSlug || session?.tenant?.tenant_slug || '').trim().toLowerCase();
  const keyPart = tenantId || tenantSlug;
  return keyPart ? `tenant-telegram-settings:${keyPart}` : '';
};

const readTenantTelegramDraftCache = (session = null) => {
  if (typeof window === 'undefined') return null;
  const storageKey = buildTenantTelegramStorageKey(session);
  if (!storageKey) return null;

  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
};

const writeTenantTelegramDraftCache = (session = null, draft = null) => {
  if (typeof window === 'undefined') return;
  const storageKey = buildTenantTelegramStorageKey(session);
  if (!storageKey || !draft || typeof draft !== 'object') return;

  try {
    window.localStorage.setItem(storageKey, JSON.stringify({
      ...draft,
      cached_at: new Date().toISOString(),
    }));
  } catch {
    // Ignore local cache failures.
  }
};

const parseTimestampMs = (value) => {
  const normalized = String(value || '').trim();
  if (!normalized) return 0;
  const parsed = Date.parse(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
};

const isTelegramDraftCacheNewerThanSession = (session = null, cachedDraft = null) => {
  const cacheTimestamp = parseTimestampMs(cachedDraft?.cached_at);
  if (!cacheTimestamp) return false;

  const sessionTimestamp = Math.max(
    parseTimestampMs(session?.tenant?.metadata?.controls_updated_at),
    parseTimestampMs(session?.tenant?.updated_at),
  );

  if (!sessionTimestamp) return true;
  return cacheTimestamp > sessionTimestamp;
};

const mergeTenantTelegramDraft = (session = null, cachedDraft = null) => {
  const baseDraft = buildTenantTelegramDraft(session);
  if (!cachedDraft || typeof cachedDraft !== 'object') {
    return baseDraft;
  }

  const cachedEventTypes =
    cachedDraft.telegram_event_types && typeof cachedDraft.telegram_event_types === 'object'
      ? cachedDraft.telegram_event_types
      : {};

  const shouldCacheOverrideSession =
    countTenantSettingsKeys(session) === 0 ||
    isTelegramDraftCacheNewerThanSession(session, cachedDraft);

  return {
    ...baseDraft,
    telegram_enabled:
      shouldCacheOverrideSession && typeof cachedDraft.telegram_enabled === 'boolean'
        ? cachedDraft.telegram_enabled
        : baseDraft.telegram_enabled,
    telegram_bot_token: String(
      shouldCacheOverrideSession
        ? (cachedDraft.telegram_bot_token || baseDraft.telegram_bot_token || '')
        : (baseDraft.telegram_bot_token || cachedDraft.telegram_bot_token || '')
    ).trim(),
    telegram_chat_ids: String(
      shouldCacheOverrideSession
        ? (cachedDraft.telegram_chat_ids || baseDraft.telegram_chat_ids || '')
        : (baseDraft.telegram_chat_ids || cachedDraft.telegram_chat_ids || '')
    ).trim(),
    telegram_website_reservation_chat_ids: String(
      shouldCacheOverrideSession
        ? (cachedDraft.telegram_website_reservation_chat_ids || baseDraft.telegram_website_reservation_chat_ids || '')
        : (baseDraft.telegram_website_reservation_chat_ids || cachedDraft.telegram_website_reservation_chat_ids || '')
    ).trim(),
    telegram_base_url: String(
      shouldCacheOverrideSession
        ? (cachedDraft.telegram_base_url || baseDraft.telegram_base_url || '')
        : (baseDraft.telegram_base_url || cachedDraft.telegram_base_url || '')
    ).trim(),
    telegram_overdue_repeat_minutes:
      shouldCacheOverrideSession && Number(cachedDraft.telegram_overdue_repeat_minutes) >= 0
        ? Number(cachedDraft.telegram_overdue_repeat_minutes)
        : baseDraft.telegram_overdue_repeat_minutes,
    telegram_event_types: {
      ...baseDraft.telegram_event_types,
      ...(shouldCacheOverrideSession ? cachedEventTypes : {}),
    },
    telegram_delivery_routes: normalizeTelegramDeliveryRoutes(
      shouldCacheOverrideSession
        ? (cachedDraft.telegram_delivery_routes || baseDraft.telegram_delivery_routes || {})
        : (baseDraft.telegram_delivery_routes || cachedDraft.telegram_delivery_routes || {})
    ),
  };
};

const getTabItems = (isFrench) => [
  { id: 'overview', label: isFrench ? 'Vue d’ensemble' : 'Overview', icon: Settings2 },
  { id: 'business', label: isFrench ? 'Profil entreprise' : 'Business Profile', icon: Store },
  { id: 'operations', label: isFrench ? 'Opérations' : 'Operations', icon: Briefcase },
  { id: 'rentalRules', label: isFrench ? 'Règles de location' : 'Rental Rules', icon: CalendarDays },
  { id: 'finance', label: isFrench ? 'Finance & taxes' : 'Finance & Tax', icon: Shield },
  { id: 'notifications', label: isFrench ? 'Notifications' : 'Notifications', icon: Bell },
  { id: 'messaging', label: isFrench ? 'Messagerie' : 'Messaging', icon: MessageSquareMore },
  { id: 'security', label: isFrench ? 'Sécurité & accès' : 'Security & Access', icon: KeyRound },
];

const FIELD_CLASS =
  'w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-violet-400 focus:ring-4 focus:ring-violet-100 disabled:cursor-not-allowed disabled:bg-slate-50';

const PRIMARY_BUTTON_CLASS =
  'inline-flex items-center gap-2 rounded-2xl border border-violet-200 bg-gradient-to-r from-violet-600 to-indigo-700 px-4 py-2.5 text-sm font-semibold text-white shadow-[0_14px_28px_rgba(79,70,229,0.18)] transition-all duration-200 hover:-translate-y-0.5 hover:from-violet-700 hover:to-indigo-800 hover:shadow-[0_18px_34px_rgba(79,70,229,0.24)] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0';

const SECONDARY_BUTTON_CLASS =
  'inline-flex items-center gap-2 rounded-2xl border border-violet-200 bg-gradient-to-r from-violet-50 to-indigo-50 px-4 py-2.5 text-sm font-semibold text-violet-700 shadow-sm transition-all duration-200 hover:border-violet-300 hover:from-violet-100 hover:to-indigo-100 disabled:cursor-not-allowed disabled:opacity-60';

const ToggleCard = ({ title, description, checked, onChange, disabled }) => (
  <div
    className={`flex items-center justify-between rounded-[1.75rem] border px-4 py-4 shadow-sm transition-all ${
      checked
        ? 'border-violet-200 bg-gradient-to-r from-violet-50/90 to-indigo-50/80 shadow-[0_16px_34px_rgba(124,58,237,0.10)]'
        : 'border-slate-200 bg-white'
    }`}
  >
    <div className="pr-4">
      <p className="text-sm font-semibold text-slate-900">{title}</p>
      <p className="mt-1 text-sm text-slate-500">{description}</p>
    </div>
    <button
      type="button"
      onClick={() => !disabled && onChange(!checked)}
      disabled={disabled}
      className={`relative inline-flex h-8 w-14 shrink-0 items-center rounded-full border transition duration-200 ${
        checked
          ? 'border-violet-500 bg-gradient-to-r from-violet-600 to-indigo-700'
          : 'border-slate-200 bg-slate-200'
      } ${disabled ? 'cursor-not-allowed opacity-60' : 'hover:shadow-sm'}`}
      aria-pressed={checked}
    >
      <span
        className={`absolute left-1 h-6 w-6 rounded-full bg-white shadow-md transition-transform duration-200 ${
          checked ? 'translate-x-6' : 'translate-x-0'
        }`}
      />
    </button>
  </div>
);

const getTelegramEventLabel = (key, isFrench = false) => {
  const labels = {
    rental_created: isFrench ? 'Location créée' : 'Rental created',
    website_reservation_created: isFrench ? 'Réservation site web' : 'Website reservation',
    rental_started: isFrench ? 'Location démarrée' : 'Rental started',
    rental_vehicle_assigned: isFrench ? 'Véhicule assigné' : 'Vehicle assigned',
    rental_vehicle_replaced: isFrench ? 'Véhicule remplacé' : 'Vehicle replaced',
    rental_completed: isFrench ? 'Location terminée' : 'Rental completed',
    payment_received: isFrench ? 'Paiement reçu' : 'Payment received',
    rental_overdue: isFrench ? 'Location en retard' : 'Rental overdue',
    rental_cancelled: isFrench ? 'Location annulée' : 'Rental cancelled',
    deposit_returned: isFrench ? 'Caution retournée' : 'Deposit returned',
    rental_extension_requested: isFrench ? 'Demande extension' : 'Extension request',
    rental_price_change_requested: isFrench ? 'Demande prix ou solde' : 'Price or balance request',
  };
  return labels[key] || key.replace(/_/g, ' ');
};

const getTelegramEventDescription = (key, isFrench = false) => {
  const descriptions = {
    rental_created: isFrench ? "Lorsqu'un nouveau contrat est créé." : 'When a new rental contract is created.',
    website_reservation_created: isFrench ? 'Lorsqu’une réservation arrive depuis le site web.' : 'When a reservation arrives from the public website.',
    rental_started: isFrench ? 'Lorsque la location devient active.' : 'When a rental becomes active.',
    rental_vehicle_assigned: isFrench ? 'Lorsqu’un véhicule est assigné à une réservation web.' : 'When a vehicle is assigned to a website reservation.',
    rental_vehicle_replaced: isFrench ? 'Lorsqu’un véhicule est remplacé pendant une location.' : 'When a rental vehicle is replaced.',
    rental_completed: isFrench ? 'Lorsque la location est terminée.' : 'When a rental is completed.',
    payment_received: isFrench ? 'Lorsqu’un paiement est enregistré.' : 'When a payment is recorded.',
    rental_overdue: isFrench ? 'Lorsque la location dépasse son horaire de retour.' : 'When a rental passes its expected return time.',
    rental_cancelled: isFrench ? 'Lorsqu’une location est annulée.' : 'When a rental is cancelled.',
    deposit_returned: isFrench ? 'Lorsque la caution est retournée.' : 'When a deposit is returned.',
    rental_extension_requested: isFrench ? 'Lorsqu’une extension attend une approbation.' : 'When an extension needs approval.',
    rental_price_change_requested: isFrench ? 'Lorsqu’un changement de prix ou de solde attend une approbation.' : 'When a price or balance change needs approval.',
  };
  return descriptions[key] || '';
};

const TelegramRoutePill = ({ label, active, disabled, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
      active
        ? 'border-violet-300 bg-violet-600 text-white shadow-sm'
        : 'border-slate-200 bg-white text-slate-500 hover:border-violet-200 hover:text-violet-700'
    } ${disabled ? 'cursor-not-allowed opacity-60' : ''}`}
  >
    {label}
  </button>
);

const formatTelegramAuditTime = (value) => {
  const parsed = value ? new Date(value) : null;
  if (!(parsed instanceof Date) || Number.isNaN(parsed?.getTime?.())) return 'Unknown';
  return parsed.toLocaleString('en-GB', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const SectionCard = ({ title, description, action, children }) => (
  <section className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-[0_20px_55px_rgba(15,23,42,0.06)]">
    <div className="flex flex-col gap-4 border-b border-violet-100 bg-gradient-to-r from-violet-50/80 via-white to-indigo-50/70 px-6 py-5 lg:flex-row lg:items-center lg:justify-between">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-violet-500">Workspace</p>
        <h2 className="mt-2 text-lg font-semibold text-slate-950">{title}</h2>
        {description ? <p className="mt-1 max-w-3xl text-sm text-slate-500">{description}</p> : null}
      </div>
      {action}
    </div>
    <div className="px-6 py-6">{children}</div>
  </section>
);

const AssetPreview = ({ label, url, emptyLabel, bucketLabel }) => (
  <div className="rounded-[1.75rem] border border-violet-200/70 bg-gradient-to-r from-violet-50/90 to-indigo-50/80 p-4">
    <div className="flex items-center justify-between gap-3">
      <div>
        <p className="text-sm font-semibold text-slate-900">{label}</p>
        <p className="mt-1 text-xs text-slate-500 break-all">{url || emptyLabel}</p>
      </div>
      <div className="rounded-xl bg-white p-2 text-slate-400 shadow-sm">
        <ImageIcon className="h-5 w-5" />
      </div>
    </div>
    <div className="mt-4 flex h-36 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-white">
      {url ? (
        <img src={url} alt={label} className="max-h-full max-w-full object-contain" />
      ) : (
        <div className="px-4 text-center text-sm text-slate-400">{emptyLabel}</div>
      )}
    </div>
    <p className="mt-3 text-xs text-slate-500">{bucketLabel}</p>
  </div>
);

const SettingsPage = () => {
  const location = useLocation();
  const { userProfile, hasPermission, tenantSession } = useAuth();
  const { setLanguage } = useLanguageContext();
  const isFrench = i18n.resolvedLanguage === 'fr';
  const tabs = getTabItems(isFrench);
  const [activeTab, setActiveTab] = useState('overview');
  const [loading, setLoading] = useState(true);
  const [savingSection, setSavingSection] = useState(null);
  const [settings, setSettings] = useState(defaultSystemSettings);
  const [assetUploads, setAssetUploads] = useState({
    logo: false,
    stamp: false,
  });
  const [tenantWorkspaceSession, setTenantWorkspaceSession] = useState(null);
  const [tenantIdentityForm, setTenantIdentityForm] = useState(() => buildTenantIdentityDraft(null, {}));
  const [tenantTelegramForm, setTenantTelegramForm] = useState(() => buildTenantTelegramDraft(null));
  const [telegramAuditItems, setTelegramAuditItems] = useState([]);
  const [telegramAuditLoading, setTelegramAuditLoading] = useState(false);
  const [telegramTesting, setTelegramTesting] = useState(false);
  const brandingContext = useMemo(() => getBrandingContext(), []);
  const hostContext = useMemo(() => getHostContext(), []);
  const suppressBlockingLoader = shouldSuppressBlockingPageLoader({
    pathname: location.pathname,
    isTransitionFlow: loading,
  });

  const [businessForm, setBusinessForm] = useState({
    companyName: '',
    companyEmail: '',
    companyPhone: '',
    companyAddress: '',
    companyWebsite: '',
    logoUrl: '',
    stampUrl: '',
    timezone: 'Africa/Casablanca',
    language: 'en',
    currency: 'MAD',
  });

  const [operationsForm, setOperationsForm] = useState({
    operatingStart: '08:00',
    operatingEnd: '18:00',
    operatingDays: [],
    defaultRentalDuration: 4,
    minRentalDuration: 1,
    maxRentalDuration: 24,
    dailyReturnFixedTime: '14:00',
    dailyLateReturnHourlyPenaltyMad: 200,
    dailyLateReturnFullDayThresholdHours: 4,
    maintenanceMode: false,
    onlineBooking: true,
    realTimeTracking: true,
    emailNotifications: true,
    smsNotifications: false,
    pushNotifications: true,
    rentalDetailsDefaultView: 'standard',
  });

  const [notificationsForm, setNotificationsForm] = useState({
    bookingReminderHours: 24,
    returnReminderHours: 2,
    rentalGracePeriodMinutes: 60,
    rentalSoftLockMinutes: 45,
    extraHourThresholdMinutes: 25,
    whatsappEnabled: true,
    emailNotifications: true,
    smsNotifications: false,
    pushNotifications: true,
    notifyOnOverdue: true,
    notifyOnMaintenance: true,
  });

  const [securityForm, setSecurityForm] = useState({
    requireTwoFactorForAdmins: false,
    sessionTimeoutMinutes: 60,
    allowEmployeePackageEdits: false,
    allowEmployeeSettingsView: true,
    writeAuditLogs: true,
    allowLiveTrackingRetry: true,
    autoSendContractEmailAfterCreation: false,
    tenantDeletionRetentionDays: 90,
  });
  const [messagingForm, setMessagingForm] = useState({
    messagingPhotoSharingEnabled: true,
    messagingMaxPhotosPerMessage: 3,
    messagingPhotoRetentionDays: 7,
    messagingDraftRetentionHours: 24,
    messagingAllowCameraCapture: true,
  });

  const canEdit = hasPermission('System Settings');
  const normalizedRole = String(userProfile?.role || userProfile?.user_role || '').trim().toLowerCase();
  const canEditTenantLifecycle = canEdit && normalizedRole === 'owner';
  const brandingBucket = settings.storageBucket || defaultSystemSettings.storageBucket || 'rental-documents';
  const isIsolatedTenantWorkspace = shouldScopeSharedTenantData(hostContext);

  const overviewCards = useMemo(
    () => [
      {
        label: 'Primary Currency',
        value: businessForm.currency || 'MAD',
        hint: 'Used across rentals, tours, and finance.',
      },
      {
        label: 'Operating Window',
        value: `${operationsForm.operatingStart} - ${operationsForm.operatingEnd}`,
        hint: `${operationsForm.operatingDays.length || 0} open day(s) configured`,
      },
      {
        label: 'Tracking & Booking',
        value: `${operationsForm.onlineBooking ? 'Online booking on' : 'Online booking off'}`,
        hint: operationsForm.realTimeTracking ? 'Live tour tracking enabled' : 'Live tour tracking disabled',
      },
      {
        label: 'Transport Fees',
        value: `${settings.pickupTransportFee || 0} / ${settings.dropoffTransportFee || 0} MAD`,
        hint: 'Pickup and drop-off defaults saved in system settings.',
      },
      {
        label: 'Messaging Policy',
        value: settings.messagingPhotoSharingEnabled ? 'Photo sharing on' : 'Photo sharing off',
        hint: `${settings.messagingPhotoRetentionDays || 7} day media retention, ${settings.messagingMaxPhotosPerMessage || 3} photo max`,
      },
    ],
    [businessForm.currency, operationsForm, settings.pickupTransportFee, settings.dropoffTransportFee, settings.messagingPhotoSharingEnabled, settings.messagingPhotoRetentionDays, settings.messagingMaxPhotosPerMessage]
  );

  const tenantIdentityReady = Boolean(tenantWorkspaceSession?.tenantId && tenantWorkspaceSession?.businessAccountId);
  const tenantCommercialSummary = useMemo(() => ({
    planType: String(tenantWorkspaceSession?.planType || tenantWorkspaceSession?.subscription?.plan_type || userProfile?.planType || 'starter').trim().toLowerCase(),
    subscriptionStatus: String(tenantWorkspaceSession?.subscriptionStatus || tenantWorkspaceSession?.subscription?.subscription_status || userProfile?.subscriptionStatus || 'trial').trim().toLowerCase(),
    billingStatus: String(tenantWorkspaceSession?.billingStatus || tenantWorkspaceSession?.subscription?.billing_status || userProfile?.billingStatus || 'none').trim().toLowerCase(),
    featureCount: Object.values(tenantWorkspaceSession?.featureAccess || {}).filter(Boolean).length,
  }), [tenantWorkspaceSession, userProfile?.billingStatus, userProfile?.planType, userProfile?.subscriptionStatus]);
  const telegramAuditSummary = useMemo(() => {
    return telegramAuditItems.reduce((acc, item) => {
      const action = String(item?.action || '').trim().toLowerCase();
      if (action === 'telegram_alert_sent') acc.sent += 1;
      else if (action === 'telegram_alert_partial_failure') acc.partial += 1;
      else if (action === 'telegram_alert_failed') acc.failed += 1;
      else if (action === 'telegram_alert_skipped') acc.skipped += 1;
      return acc;
    }, { sent: 0, partial: 0, failed: 0, skipped: 0 });
  }, [telegramAuditItems]);
  const latestTelegramSuccess = useMemo(
    () => telegramAuditItems.find((item) => ['telegram_alert_sent', 'telegram_alert_partial_failure'].includes(String(item?.action || '').trim().toLowerCase())) || null,
    [telegramAuditItems]
  );
  const latestTelegramFailure = useMemo(
    () => telegramAuditItems.find((item) => String(item?.action || '').trim().toLowerCase() === 'telegram_alert_failed') || null,
    [telegramAuditItems]
  );
  const tenantTelegramConnected = Boolean(
    tenantTelegramForm.telegram_enabled &&
    String(tenantTelegramForm.telegram_bot_token || '').trim() &&
    String(tenantTelegramForm.telegram_chat_ids || '').trim() &&
    String(tenantTelegramForm.telegram_base_url || '').trim()
  );
  const enabledTelegramEventsCount = useMemo(
    () => Object.values(tenantTelegramForm.telegram_event_types || {}).filter(Boolean).length,
    [tenantTelegramForm.telegram_event_types]
  );
  const telegramDeliverySummary = useMemo(() => {
    const routes = normalizeTelegramDeliveryRoutes(tenantTelegramForm.telegram_delivery_routes);
    return TELEGRAM_ALERT_EVENT_KEYS.reduce((summary, eventKey) => {
      if (tenantTelegramForm.telegram_event_types?.[eventKey] !== true) {
        return summary;
      }
      const route = routes[eventKey] || {};
      if (route.workspace === true || route.website === true) summary.teamGroup += 1;
      if (route.personal === true) summary.directStaff += 1;
      return summary;
    }, { teamGroup: 0, directStaff: 0 });
  }, [tenantTelegramForm.telegram_delivery_routes, tenantTelegramForm.telegram_event_types]);

  const getTelegramSetupValidationMessage = useCallback((options = {}) => {
    const hasTenantSession = options.hasTenantSession ?? tenantIdentityReady;
    if (!canEdit) {
      return isFrench ? 'Acces refuse' : 'Access denied';
    }

    if (!hasTenantSession) {
      return isFrench
        ? 'Aucune session tenant active pour enregistrer Telegram'
        : 'No active tenant session is available to save Telegram settings';
    }

    if (!tenantTelegramForm.telegram_enabled) {
      return isFrench ? 'Activez les alertes Telegram d’abord' : 'Enable Telegram alerts first';
    }

    if (!String(tenantTelegramForm.telegram_bot_token || '').trim()) {
      return isFrench ? 'Ajoutez le token du bot Telegram' : 'Add the Telegram bot token';
    }

    if (!String(tenantTelegramForm.telegram_chat_ids || '').trim()) {
      return isFrench ? 'Ajoutez au moins un Chat ID Telegram' : 'Add at least one Telegram chat ID';
    }

    if (!String(tenantTelegramForm.telegram_base_url || '').trim()) {
      return isFrench ? "Ajoutez l'URL publique de l'application" : 'Add the public app URL';
    }

    return '';
  }, [canEdit, isFrench, tenantIdentityReady, tenantTelegramForm]);

  const ensureTenantWorkspaceSession = useCallback(async () => {
    if (tenantWorkspaceSession?.tenantId && tenantWorkspaceSession?.businessAccountId) {
      return tenantWorkspaceSession;
    }

    const brandingContext = getBrandingContext();
    const hostContext = getHostContext();

    let resolvedWorkspace = null;

    if (shouldResolveTenantWorkspaceFromApi({ userProfile, hostContext })) {
      resolvedWorkspace = await getTenantSession().catch(() => null);
    }

    if (!resolvedWorkspace && brandingContext.isLocal && canEdit) {
      const registryBusinessOwners = await listBusinessOwnersFromRegistry().catch(() => []);
      const registryEntry = pickLocalRegistryWorkspaceEntry(registryBusinessOwners, userProfile);
      resolvedWorkspace = buildRegistryTenantSession(registryEntry);
    }

      if (resolvedWorkspace?.tenantId && resolvedWorkspace?.businessAccountId) {
        setTenantWorkspaceSession(resolvedWorkspace);
        if (isIsolatedTenantWorkspace) {
          setBusinessForm((current) => ({
            ...current,
            ...buildTenantBusinessProfileDraft(resolvedWorkspace, {
              timezone: current.timezone || 'Africa/Casablanca',
              language: current.language || 'en',
              currency: current.currency || 'MAD',
            }),
          }));
        }
        setTenantIdentityForm((current) => ({
          ...buildTenantIdentityDraft(resolvedWorkspace, {
            companyName: current.public_display_name || businessForm.companyName || '',
            companyEmail: current.support_email || businessForm.companyEmail || '',
            timezone: current.timezone || businessForm.timezone || 'Africa/Casablanca',
          language: current.default_language || businessForm.language || 'en',
          currency: current.currency || businessForm.currency || 'MAD',
        }),
      }));
      setTenantTelegramForm((current) => ({
        ...buildTenantTelegramDraft(resolvedWorkspace),
        telegram_bot_token: current.telegram_bot_token,
        telegram_chat_ids: current.telegram_chat_ids,
        telegram_website_reservation_chat_ids: current.telegram_website_reservation_chat_ids,
        telegram_base_url: current.telegram_base_url || buildTenantTelegramDraft(resolvedWorkspace).telegram_base_url,
        telegram_overdue_repeat_minutes: current.telegram_overdue_repeat_minutes,
        telegram_enabled: current.telegram_enabled,
        telegram_event_types: current.telegram_event_types,
      }));
      return resolvedWorkspace;
    }

    return null;
  }, [tenantWorkspaceSession, userProfile, canEdit, businessForm.companyEmail, businessForm.companyName, businessForm.currency, businessForm.language, businessForm.timezone, isIsolatedTenantWorkspace]);

  useEffect(() => {
    let cancelled = false;

    const loadTelegramAudit = async () => {
      if (!tenantIdentityReady) {
        if (!cancelled) {
          setTelegramAuditItems([]);
          setTelegramAuditLoading(false);
        }
        return;
      }

      setTelegramAuditLoading(true);
      try {
        const response = await adminApiRequest(
          `/api/tenant-audit?tenant_id=${encodeURIComponent(tenantWorkspaceSession.tenantId)}&business_account_id=${encodeURIComponent(tenantWorkspaceSession.businessAccountId)}&action_prefix=telegram_alert_&limit=12`
        );
        if (!cancelled) {
          setTelegramAuditItems(Array.isArray(response?.items) ? response.items : []);
        }
      } catch (error) {
        console.warn('Unable to load Telegram audit log:', error?.message || error);
        if (!cancelled) {
          setTelegramAuditItems([]);
        }
      } finally {
        if (!cancelled) {
          setTelegramAuditLoading(false);
        }
      }
    };

    loadTelegramAudit();
    return () => {
      cancelled = true;
    };
  }, [tenantIdentityReady, tenantWorkspaceSession?.businessAccountId, tenantWorkspaceSession?.tenantId]);

  const refreshTelegramAudit = async () => {
    if (!tenantIdentityReady) return;
    setTelegramAuditLoading(true);
    try {
      const response = await adminApiRequest(
        `/api/tenant-audit?tenant_id=${encodeURIComponent(tenantWorkspaceSession.tenantId)}&business_account_id=${encodeURIComponent(tenantWorkspaceSession.businessAccountId)}&action_prefix=telegram_alert_&limit=12`
      );
      setTelegramAuditItems(Array.isArray(response?.items) ? response.items : []);
    } catch (error) {
      console.warn('Unable to refresh Telegram audit log:', error?.message || error);
      toast.error(isFrench ? 'Impossible de recharger le journal Telegram' : 'Unable to refresh Telegram log');
    } finally {
      setTelegramAuditLoading(false);
    }
  };

  const handleTelegramTest = async () => {
    if (telegramTesting) return;

    const resolvedWorkspace = tenantIdentityReady ? tenantWorkspaceSession : await ensureTenantWorkspaceSession();
    const validationMessage = getTelegramSetupValidationMessage({
      hasTenantSession: Boolean(resolvedWorkspace?.tenantId && resolvedWorkspace?.businessAccountId),
    });
    if (validationMessage) {
      toast.error(validationMessage);
      return;
    }

    setTelegramTesting(true);
    try {
      const teamGroupChatIds = String(tenantTelegramForm.telegram_chat_ids || '')
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean);
      await sendTelegramTestAlert({
        scope: 'workspace_group',
        tenantName: resolvedWorkspace?.tenantName || resolvedWorkspace?.tenantSlug || 'Tenant',
        actorName: userProfile?.full_name || userProfile?.name || userProfile?.email || '',
        tenantId: resolvedWorkspace?.tenantId || '',
        businessAccountId: resolvedWorkspace?.businessAccountId || '',
        tenantSlug: resolvedWorkspace?.tenantSlug || '',
        tenantBaseUrl: tenantTelegramForm?.telegram_base_url || resolvedWorkspace?.tenantAppUrl || '',
        telegramConfigOverride: {
          telegram_enabled: Boolean(tenantTelegramForm.telegram_enabled),
          telegram_bot_token: String(tenantTelegramForm.telegram_bot_token || '').trim(),
          telegram_chat_ids: teamGroupChatIds,
          telegram_website_reservation_chat_ids: teamGroupChatIds,
          telegram_base_url: String(tenantTelegramForm.telegram_base_url || '').trim(),
          telegram_overdue_repeat_minutes: Math.max(0, Number(tenantTelegramForm.telegram_overdue_repeat_minutes || 0) || 0),
          telegram_event_types: {
            ...(tenantTelegramForm.telegram_event_types || {}),
          },
          telegram_delivery_routes: normalizeTelegramDeliveryRoutes(tenantTelegramForm.telegram_delivery_routes),
        },
      });
      toast.success(isFrench ? 'Message test Telegram envoyé' : 'Telegram test message sent');
      await refreshTelegramAudit();
    } catch (error) {
      console.warn('Unable to send Telegram test message:', error?.message || error);
      toast.error(error?.message || (isFrench ? "Impossible d'envoyer le test Telegram" : 'Unable to send Telegram test'));
    } finally {
      setTelegramTesting(false);
    }
  };

  const loadSettingsHub = async () => {
    setLoading(true);
    try {
      const brandingContext = getBrandingContext();
      const hostContext = getHostContext();
      const canResolveTenantSessionFromApi = shouldResolveTenantWorkspaceFromApi({
        userProfile,
        hostContext,
      });
      const effectiveAuthTenantSession = hasUsableTenantWorkspaceSession(tenantSession) ? tenantSession : null;
      const canResolveLocalTenantWorkspace =
        !effectiveAuthTenantSession &&
        brandingContext.isLocal &&
        canEdit;

      const [mergedSettings, tenantWorkspace, registryBusinessOwners] = await Promise.all([
        fetchSystemSettings(),
        canResolveTenantSessionFromApi
          ? getTenantSession().catch(() => null)
          : Promise.resolve(null),
        canResolveLocalTenantWorkspace
          ? listBusinessOwnersFromRegistry().catch(() => [])
          : Promise.resolve([]),
      ]);

      const localRegistryEntries = Array.isArray(registryBusinessOwners) ? registryBusinessOwners : [];
      const localWorkspaceRegistryEntry = canResolveLocalTenantWorkspace
        ? pickLocalRegistryWorkspaceEntry(localRegistryEntries, userProfile)
        : null;
      const localRegistryTenantWorkspace = buildRegistryTenantSession(localWorkspaceRegistryEntry);
      const effectiveTenantWorkspace = pickRicherTenantSession(
        tenantWorkspace,
        effectiveAuthTenantSession,
        localRegistryTenantWorkspace
      );
      const shouldUseTenantScopedBusinessProfile = Boolean(
        isIsolatedTenantWorkspace &&
        effectiveTenantWorkspace?.tenantId &&
        effectiveTenantWorkspace?.businessAccountId
      );

      setSettings(mergedSettings);
      setTenantWorkspaceSession(effectiveTenantWorkspace);
      setBusinessForm(
        shouldUseTenantScopedBusinessProfile
          ? buildTenantBusinessProfileDraft(effectiveTenantWorkspace, {
              timezone: mergedSettings.timezone || 'Africa/Casablanca',
              language: mergedSettings.language || 'en',
              currency: mergedSettings.currency || 'MAD',
            })
          : {
              companyName: mergedSettings.companyName || '',
              companyEmail: mergedSettings.companyEmail || '',
              companyPhone: mergedSettings.companyPhone || '',
              companyAddress: mergedSettings.companyAddress || '',
              companyWebsite: mergedSettings.companyWebsite || '',
              logoUrl: mergedSettings.logoUrl || '',
              stampUrl: mergedSettings.stampUrl || '',
              timezone: mergedSettings.timezone || 'Africa/Casablanca',
              language: mergedSettings.language || 'en',
              currency: mergedSettings.currency || 'MAD',
            }
      );
      setOperationsForm({
        operatingStart: mergedSettings.operatingHours?.start || '08:00',
        operatingEnd: mergedSettings.operatingHours?.end || '18:00',
        operatingDays: Array.isArray(mergedSettings.operatingDays) ? mergedSettings.operatingDays : [],
        defaultRentalDuration: Number(mergedSettings.defaultRentalDuration) || 4,
        minRentalDuration: Number(mergedSettings.minRentalDuration) || 1,
        maxRentalDuration: Number(mergedSettings.maxRentalDuration) || 24,
        dailyReturnFixedTime:
          /^\d{2}:\d{2}$/.test(String(mergedSettings.dailyReturnFixedTime || ''))
            ? String(mergedSettings.dailyReturnFixedTime)
            : '14:00',
        dailyLateReturnHourlyPenaltyMad: Math.max(0, Number(mergedSettings.dailyLateReturnHourlyPenaltyMad) || 200),
        dailyLateReturnFullDayThresholdHours: Math.max(1, Number(mergedSettings.dailyLateReturnFullDayThresholdHours) || 4),
        maintenanceMode: Boolean(mergedSettings.maintenanceMode),
        onlineBooking: mergedSettings.onlineBooking !== false,
        realTimeTracking: mergedSettings.realTimeTracking !== false,
        emailNotifications: mergedSettings.emailNotifications !== false,
        smsNotifications: Boolean(mergedSettings.smsNotifications),
        pushNotifications: mergedSettings.pushNotifications !== false,
        rentalDetailsDefaultView:
          String(mergedSettings.rentalDetailsDefaultView || '').toLowerCase() === 'light'
            ? 'light'
            : 'standard',
      });
      setNotificationsForm({
        bookingReminderHours: Number(mergedSettings.bookingReminderHours) || 24,
        returnReminderHours: Number(mergedSettings.returnReminderHours) || 2,
        rentalGracePeriodMinutes: Number(mergedSettings.rentalGracePeriodMinutes ?? mergedSettings.rental_grace_period_minutes) || 120,
        rentalSoftLockMinutes: Number(mergedSettings.rentalSoftLockMinutes ?? mergedSettings.rental_soft_lock_minutes) || 90,
        extraHourThresholdMinutes: Number(mergedSettings.extraHourThresholdMinutes ?? mergedSettings.extra_hour_threshold_minutes) || 25,
        whatsappEnabled: mergedSettings.whatsappEnabled !== false,
        emailNotifications: mergedSettings.emailNotifications !== false,
        smsNotifications: Boolean(mergedSettings.smsNotifications),
        pushNotifications: mergedSettings.pushNotifications !== false,
        notifyOnOverdue: mergedSettings.notifyOnOverdue !== false,
        notifyOnMaintenance: mergedSettings.notifyOnMaintenance !== false,
      });
      setSecurityForm({
        requireTwoFactorForAdmins: Boolean(mergedSettings.requireTwoFactorForAdmins),
        sessionTimeoutMinutes: Number(mergedSettings.sessionTimeoutMinutes) || 60,
        allowEmployeePackageEdits: Boolean(mergedSettings.allowEmployeePackageEdits),
        allowEmployeeSettingsView: mergedSettings.allowEmployeeSettingsView !== false,
        writeAuditLogs: mergedSettings.writeAuditLogs !== false,
        allowLiveTrackingRetry: mergedSettings.allowLiveTrackingRetry !== false,
        autoSendContractEmailAfterCreation: Boolean(mergedSettings.autoSendContractEmailAfterCreation),
        tenantDeletionRetentionDays: Math.max(1, Number(mergedSettings.tenantDeletionRetentionDays) || 90),
      });
      setMessagingForm({
        messagingPhotoSharingEnabled: Boolean(mergedSettings.messagingPhotoSharingEnabled),
        messagingMaxPhotosPerMessage: Math.max(1, Number(mergedSettings.messagingMaxPhotosPerMessage) || 3),
        messagingPhotoRetentionDays: Math.max(1, Number(mergedSettings.messagingPhotoRetentionDays) || 7),
        messagingDraftRetentionHours: Math.max(1, Number(mergedSettings.messagingDraftRetentionHours) || 24),
        messagingAllowCameraCapture: mergedSettings.messagingAllowCameraCapture !== false,
      });
      setTenantIdentityForm(
        buildTenantIdentityDraft(effectiveTenantWorkspace, {
          companyName: mergedSettings.companyName || '',
          companyEmail: mergedSettings.companyEmail || '',
          timezone: mergedSettings.timezone || 'Africa/Casablanca',
          language: mergedSettings.language || 'en',
          currency: mergedSettings.currency || 'MAD',
        })
      );
      setTenantTelegramForm(
        mergeTenantTelegramDraft(
          effectiveTenantWorkspace,
          readTenantTelegramDraftCache(effectiveTenantWorkspace)
        )
      );
    } catch (error) {
      console.error('Failed to load settings hub:', error);
      toast.error('Failed to load system settings');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSettingsHub();
  }, [tenantSession, userProfile?.accountType, userProfile?.account_type, isIsolatedTenantWorkspace]);

  useEffect(() => {
    if (!hasUsableTenantWorkspaceSession(tenantSession)) return;

    const preferredSession = pickRicherTenantSession(tenantWorkspaceSession, tenantSession);
    setTenantWorkspaceSession((current) => pickRicherTenantSession(current, tenantSession));
    if (isIsolatedTenantWorkspace) {
      setBusinessForm((current) => ({
        ...current,
        ...buildTenantBusinessProfileDraft(preferredSession, {
          timezone: current.timezone || 'Africa/Casablanca',
          language: current.language || 'en',
          currency: current.currency || 'MAD',
        }),
      }));
    }
    setTenantIdentityForm((current) => buildTenantIdentityDraft(preferredSession, {
      companyName: current.public_display_name || businessForm.companyName || '',
      companyEmail: current.support_email || businessForm.companyEmail || '',
      timezone: current.timezone || businessForm.timezone || 'Africa/Casablanca',
      language: current.default_language || businessForm.language || 'en',
      currency: current.currency || businessForm.currency || 'MAD',
    }));
    setTenantTelegramForm((current) => {
      const preferredSession = pickRicherTenantSession(tenantWorkspaceSession, tenantSession);
      const nextDraft = mergeTenantTelegramDraft(
        preferredSession,
        readTenantTelegramDraftCache(preferredSession)
      );
      if (countTenantSettingsKeys(preferredSession) < countTenantSettingsKeys(tenantWorkspaceSession)) {
        return current;
      }
      return nextDraft;
    });
    // Sync only when the resolved tenant session changes, not while the form is being edited.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantSession, tenantWorkspaceSession, businessForm.companyEmail, businessForm.companyName, businessForm.currency, businessForm.language, businessForm.timezone, isIsolatedTenantWorkspace]);

  const persistSettings = async (sectionName, patch, afterSave) => {
    if (!canEdit) {
      toast.error('Only owner and admin users can change system settings');
      return;
    }

    setSavingSection(sectionName);
    try {
      const nextSettings = {
        ...settings,
        ...patch,
      };
      const saved = await saveSystemSettings(nextSettings);
      const merged = { ...defaultSystemSettings, ...saved };
      setSettings(merged);
      if (afterSave) {
        await afterSave();
      }
      toast.success(`${sectionName} saved`);
    } catch (error) {
      console.error(`Failed to save ${sectionName}:`, error);
      toast.error(`Failed to save ${sectionName.toLowerCase()}`);
    } finally {
      setSavingSection(null);
    }
  };

  const uploadBrandAsset = async (assetType, file) => {
    if (!file) return;
    if (!canEdit) {
      toast.error(isFrench ? 'Acces refuse' : 'Access denied');
      return;
    }
    if (!file.type.startsWith('image/')) {
      toast.error(isFrench ? 'Veuillez choisir une image valide' : 'Please choose a valid image');
      return;
    }

    const extension = (file.name.split('.').pop() || 'png').toLowerCase();
    const storagePath = `branding/${assetType}-${Date.now()}.${extension}`;

    setAssetUploads((current) => ({ ...current, [assetType]: true }));
    try {
      const { error: uploadError } = await supabase.storage
        .from(brandingBucket)
        .upload(storagePath, file, {
          cacheControl: '3600',
          upsert: true,
        });

      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from(brandingBucket).getPublicUrl(storagePath);
      const publicUrl = data?.publicUrl || '';
      if (!publicUrl) {
        throw new Error(isFrench ? "Impossible d'obtenir l'URL publique" : 'Unable to get public URL');
      }

      setBusinessForm((current) => ({
        ...current,
        [assetType === 'logo' ? 'logoUrl' : 'stampUrl']: publicUrl,
      }));

      if (isIsolatedTenantWorkspace && tenantWorkspaceSession?.tenantId && tenantWorkspaceSession?.businessAccountId) {
        const tenantSettingsPatch = {
          [assetType === 'logo' ? 'logo_url' : 'stamp_url']: publicUrl,
        };
        await updateTenantControls({
          businessAccountId: tenantWorkspaceSession.businessAccountId,
          tenantId: tenantWorkspaceSession.tenantId,
          tenantPatch: {
            settings: tenantSettingsPatch,
          },
        });

        setTenantWorkspaceSession((current) => current
          ? {
              ...current,
              tenantSettings: {
                ...(current.tenantSettings || {}),
                ...tenantSettingsPatch,
              },
              tenant: current.tenant
                ? {
                    ...current.tenant,
                    metadata: {
                      ...(current.tenant.metadata || {}),
                      tenant_settings: {
                        ...((current.tenant.metadata && current.tenant.metadata.tenant_settings) || {}),
                        ...tenantSettingsPatch,
                      },
                    },
                  }
                : current.tenant,
            }
          : current);
      } else {
        const savedSettings = await saveSystemSettings({
          [assetType === 'logo' ? 'logoUrl' : 'stampUrl']: publicUrl,
        });

        setSettings({ ...defaultSystemSettings, ...savedSettings });
        setBusinessForm((current) => ({
          ...current,
          logoUrl: savedSettings.logoUrl || current.logoUrl,
          stampUrl: savedSettings.stampUrl || current.stampUrl,
        }));
      }

      toast.success(
        assetType === 'logo'
          ? (isFrench ? 'Logo importe' : 'Logo imported')
          : (isFrench ? 'Cachet importe' : 'Stamp imported')
      );
    } catch (error) {
      console.error(`Failed to upload ${assetType}:`, error);
      toast.error(error.message || (isFrench ? 'Import impossible' : 'Upload failed'));
    } finally {
      setAssetUploads((current) => ({ ...current, [assetType]: false }));
    }
  };

  const handleBusinessSave = async () => {
    if (isIsolatedTenantWorkspace && tenantWorkspaceSession?.tenantId && tenantWorkspaceSession?.businessAccountId) {
      if (!canEdit) {
        toast.error('Only owner and admin users can change system settings');
        return;
      }

      setSavingSection('Business profile');
      try {
        const tenantBusinessSettings = {
          brand_name: businessForm.companyName || '',
          public_display_name: businessForm.companyName || '',
          support_email: businessForm.companyEmail || '',
          company_phone: businessForm.companyPhone || '',
          company_address: businessForm.companyAddress || '',
          company_website: businessForm.companyWebsite || '',
          logo_url: businessForm.logoUrl || '',
          stamp_url: businessForm.stampUrl || '',
          timezone: businessForm.timezone || 'Africa/Casablanca',
          default_language: businessForm.language || 'en',
          currency: businessForm.currency || 'MAD',
        };

        await updateTenantControls({
          businessAccountId: tenantWorkspaceSession.businessAccountId,
          tenantId: tenantWorkspaceSession.tenantId,
          tenantPatch: {
            settings: tenantBusinessSettings,
          },
        });

        setTenantWorkspaceSession((current) => current
          ? {
              ...current,
              tenantSettings: {
                ...(current.tenantSettings || {}),
                ...tenantBusinessSettings,
              },
              tenant: current.tenant
                ? {
                    ...current.tenant,
                    metadata: {
                      ...(current.tenant.metadata || {}),
                      tenant_settings: {
                        ...((current.tenant.metadata && current.tenant.metadata.tenant_settings) || {}),
                        ...tenantBusinessSettings,
                      },
                    },
                  }
                : current.tenant,
            }
          : current);

        setTenantIdentityForm((current) => ({
          ...current,
          brand_name: tenantBusinessSettings.brand_name,
          public_display_name: tenantBusinessSettings.public_display_name,
          support_email: tenantBusinessSettings.support_email,
          timezone: tenantBusinessSettings.timezone,
          default_language: tenantBusinessSettings.default_language,
          currency: tenantBusinessSettings.currency,
        }));

        setLanguage(businessForm.language || 'en');
        toast.success('Business profile saved');
      } catch (error) {
        console.error('Failed to save business profile:', error);
        toast.error('Failed to save business profile');
      } finally {
        setSavingSection(null);
      }
      return;
    }

    await persistSettings('Business profile', {
      ...businessForm,
    }, async () => {
      setLanguage(businessForm.language || 'en');
    });
  };

  const handleTenantIdentitySave = async () => {
    const resolvedWorkspace = tenantIdentityReady ? tenantWorkspaceSession : await ensureTenantWorkspaceSession();
    if (!resolvedWorkspace?.tenantId || !resolvedWorkspace?.businessAccountId) {
      toast.error(isFrench ? 'Aucune session tenant active pour enregistrer ces informations' : 'No active tenant session is available to save these tenant details');
      return;
    }

    if (!canEdit) {
      toast.error(isFrench ? 'Acces refuse' : 'Access denied');
      return;
    }

    setSavingSection('Tenant identity');
    try {
      await updateTenantControls({
        businessAccountId: resolvedWorkspace.businessAccountId,
        tenantId: resolvedWorkspace.tenantId,
        tenantPatch: {
          settings: tenantIdentityForm,
        },
      });

      setTenantWorkspaceSession((current) => current
        ? {
            ...current,
            tenantSettings: {
              ...(current.tenantSettings || {}),
              ...tenantIdentityForm,
            },
            tenant: current.tenant
              ? {
                  ...current.tenant,
                  metadata: {
                    ...(current.tenant.metadata || {}),
                    tenant_settings: {
                      ...((current.tenant.metadata && current.tenant.metadata.tenant_settings) || {}),
                      ...tenantIdentityForm,
                    },
                  },
                }
              : current.tenant,
          }
        : current);

      toast.success(isFrench ? 'Identite tenant enregistree' : 'Tenant identity saved');
    } catch (error) {
      console.error('Failed to save tenant identity:', error);
      toast.error(error?.message || (isFrench ? "Impossible d'enregistrer l'identite tenant" : 'Failed to save tenant identity'));
    } finally {
      setSavingSection(null);
    }
  };

  const handleTenantTelegramSave = async () => {
    if (!canEdit) {
      toast.error(isFrench ? 'Acces refuse' : 'Access denied');
      return;
    }

    const resolvedWorkspace = tenantIdentityReady ? tenantWorkspaceSession : await ensureTenantWorkspaceSession();
    if (!resolvedWorkspace?.tenantId || !resolvedWorkspace?.businessAccountId) {
      toast.error(isFrench ? 'Aucune session tenant active pour enregistrer Telegram' : 'No active tenant session is available to save Telegram settings');
      return;
    }

    const normalizedChatIds = String(tenantTelegramForm.telegram_chat_ids || '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean)
      .join(', ');
    const normalizedWebsiteReservationChatIds = normalizedChatIds;

    const nextTelegramSettings = {
      telegram_enabled: Boolean(tenantTelegramForm.telegram_enabled),
      telegram_bot_token: String(tenantTelegramForm.telegram_bot_token || '').trim(),
      telegram_chat_ids: normalizedChatIds,
      telegram_website_reservation_chat_ids: normalizedWebsiteReservationChatIds,
      telegram_base_url: String(tenantTelegramForm.telegram_base_url || '').trim(),
      telegram_overdue_repeat_minutes: Math.max(0, Number(tenantTelegramForm.telegram_overdue_repeat_minutes || 0) || 0),
      telegram_event_types: {
        rental_created: Boolean(tenantTelegramForm.telegram_event_types?.rental_created),
        website_reservation_created: Boolean(tenantTelegramForm.telegram_event_types?.website_reservation_created),
        rental_started: Boolean(tenantTelegramForm.telegram_event_types?.rental_started),
        rental_vehicle_assigned: Boolean(tenantTelegramForm.telegram_event_types?.rental_vehicle_assigned),
        rental_vehicle_replaced: Boolean(tenantTelegramForm.telegram_event_types?.rental_vehicle_replaced),
        rental_completed: Boolean(tenantTelegramForm.telegram_event_types?.rental_completed),
        payment_received: Boolean(tenantTelegramForm.telegram_event_types?.payment_received),
        rental_overdue: Boolean(tenantTelegramForm.telegram_event_types?.rental_overdue),
        rental_cancelled: Boolean(tenantTelegramForm.telegram_event_types?.rental_cancelled),
        deposit_returned: Boolean(tenantTelegramForm.telegram_event_types?.deposit_returned),
        rental_extension_requested: Boolean(tenantTelegramForm.telegram_event_types?.rental_extension_requested),
        rental_price_change_requested: Boolean(tenantTelegramForm.telegram_event_types?.rental_price_change_requested),
      },
      telegram_delivery_routes: normalizeTelegramDeliveryRoutes(tenantTelegramForm.telegram_delivery_routes),
    };

    setSavingSection('Tenant telegram');
    try {
      const controlsResponse = await updateTenantControls({
        businessAccountId: resolvedWorkspace.businessAccountId,
        tenantId: resolvedWorkspace.tenantId,
        tenantPatch: {
          settings: nextTelegramSettings,
        },
      });

      writeTenantTelegramDraftCache(resolvedWorkspace, nextTelegramSettings);

      const persistedTenantSettings =
        controlsResponse?.tenant_metadata?.tenant_settings &&
        typeof controlsResponse.tenant_metadata.tenant_settings === 'object'
          ? controlsResponse.tenant_metadata.tenant_settings
          : nextTelegramSettings;
      const confirmedWorkspaceBase = resolvedWorkspace;
      const confirmedWorkspace = confirmedWorkspaceBase
        ? {
            ...confirmedWorkspaceBase,
            tenantSettings: {
              ...(confirmedWorkspaceBase.tenantSettings || {}),
              ...persistedTenantSettings,
            },
            tenant: confirmedWorkspaceBase.tenant
              ? {
                  ...confirmedWorkspaceBase.tenant,
                  metadata: {
                    ...(confirmedWorkspaceBase.tenant.metadata || {}),
                    tenant_settings: {
                      ...((confirmedWorkspaceBase.tenant.metadata && confirmedWorkspaceBase.tenant.metadata.tenant_settings) || {}),
                      ...persistedTenantSettings,
                    },
                  },
                }
              : confirmedWorkspaceBase.tenant,
          }
        : null;
      if (confirmedWorkspace?.tenantId && confirmedWorkspace?.businessAccountId) {
        setTenantWorkspaceSession(confirmedWorkspace);
        writeTenantTelegramDraftCache(confirmedWorkspace, nextTelegramSettings);
      }

      setTenantTelegramForm((current) => ({
        ...current,
        telegram_chat_ids: normalizedChatIds,
        telegram_website_reservation_chat_ids: normalizedWebsiteReservationChatIds,
        telegram_bot_token: nextTelegramSettings.telegram_bot_token,
        telegram_base_url: nextTelegramSettings.telegram_base_url,
        telegram_enabled: nextTelegramSettings.telegram_enabled,
        telegram_overdue_repeat_minutes: nextTelegramSettings.telegram_overdue_repeat_minutes,
        telegram_event_types: nextTelegramSettings.telegram_event_types,
        telegram_delivery_routes: nextTelegramSettings.telegram_delivery_routes,
      }));

      setTenantWorkspaceSession((current) => {
        if (confirmedWorkspace?.tenantId && confirmedWorkspace?.businessAccountId) {
          return confirmedWorkspace;
        }
        return current
          ? {
              ...current,
              tenantSettings: {
                ...(current.tenantSettings || {}),
                ...nextTelegramSettings,
              },
              tenant: current.tenant
                ? {
                    ...current.tenant,
                    metadata: {
                      ...(current.tenant.metadata || {}),
                      tenant_settings: {
                        ...((current.tenant.metadata && current.tenant.metadata.tenant_settings) || {}),
                        ...nextTelegramSettings,
                      },
                    },
                  }
                : current.tenant,
            }
          : current;
      });

      toast.success(isFrench ? 'Parametres Telegram enregistres' : 'Telegram settings saved');
    } catch (error) {
      console.error('Failed to save tenant Telegram settings:', error);
      toast.error(error?.message || (isFrench ? "Impossible d'enregistrer les paramètres Telegram" : 'Failed to save Telegram settings'));
    } finally {
      setSavingSection(null);
    }
  };

  const effectiveLogoUrl = businessForm.logoUrl || (brandingContext.isSaharaXTenant ? SAHARAX_DEFAULT_LOGO_URL : '');
  const effectiveStampUrl = businessForm.stampUrl || (brandingContext.isSaharaXTenant ? SAHARAX_DEFAULT_STAMP_URL : '');

  const handleOperationsSave = async () => {
    await persistSettings('Operations', {
      defaultRentalDuration: Number(operationsForm.defaultRentalDuration) || 0,
      minRentalDuration: Number(operationsForm.minRentalDuration) || 0,
      maxRentalDuration: Number(operationsForm.maxRentalDuration) || 0,
      dailyReturnFixedTime:
        /^\d{2}:\d{2}$/.test(String(operationsForm.dailyReturnFixedTime || ''))
          ? String(operationsForm.dailyReturnFixedTime)
          : '14:00',
      dailyLateReturnHourlyPenaltyMad: Math.max(0, Number(operationsForm.dailyLateReturnHourlyPenaltyMad) || 0),
      dailyLateReturnFullDayThresholdHours: Math.max(1, Number(operationsForm.dailyLateReturnFullDayThresholdHours) || 1),
      maintenanceMode: operationsForm.maintenanceMode,
      onlineBooking: operationsForm.onlineBooking,
      realTimeTracking: operationsForm.realTimeTracking,
      emailNotifications: operationsForm.emailNotifications,
      smsNotifications: operationsForm.smsNotifications,
      pushNotifications: operationsForm.pushNotifications,
      rentalDetailsDefaultView:
        String(operationsForm.rentalDetailsDefaultView || '').toLowerCase() === 'light'
          ? 'light'
          : 'standard',
      operatingHours: {
        start: operationsForm.operatingStart,
        end: operationsForm.operatingEnd,
      },
      operatingDays: operationsForm.operatingDays,
    });
  };

  const handleFinanceSave = async () => {
    await persistSettings('Finance & tax', {
      tax_enabled: Boolean(settings.tax_enabled),
      tax_percentage: Number(settings.tax_percentage) || 0,
      apply_to_rentals: Boolean(settings.apply_to_rentals),
      apply_to_tours: Boolean(settings.apply_to_tours),
      invoicePrefix: settings.invoicePrefix || 'INV',
    });
  };

  const handleOperatingDayToggle = (day) => {
    setOperationsForm((current) => ({
      ...current,
      operatingDays: current.operatingDays.includes(day)
        ? current.operatingDays.filter((item) => item !== day)
        : [...current.operatingDays, day],
    }));
  };

  const handleNotificationsSave = async () => {
    const normalizedGraceMinutes = Math.max(0, Math.min(120, Number(notificationsForm.rentalGracePeriodMinutes) || 0));
    const normalizedSoftLockMinutes = Math.max(0, Math.min(normalizedGraceMinutes || 120, Number(notificationsForm.rentalSoftLockMinutes) || 0));

    await persistSettings('Notifications', {
      bookingReminderHours: Number(notificationsForm.bookingReminderHours) || 0,
      returnReminderHours: Number(notificationsForm.returnReminderHours) || 0,
      rentalGracePeriodMinutes: normalizedGraceMinutes,
      rentalSoftLockMinutes: normalizedSoftLockMinutes,
      rental_grace_period_minutes: normalizedGraceMinutes,
      rental_soft_lock_minutes: normalizedSoftLockMinutes,
      whatsappEnabled: notificationsForm.whatsappEnabled,
      emailNotifications: notificationsForm.emailNotifications,
      smsNotifications: notificationsForm.smsNotifications,
      pushNotifications: notificationsForm.pushNotifications,
      notifyOnOverdue: notificationsForm.notifyOnOverdue,
      notifyOnMaintenance: notificationsForm.notifyOnMaintenance,
    });
  };

  const handleRentalRulesSave = async () => {
    const normalizedGraceMinutes = Math.max(0, Math.min(120, Number(notificationsForm.rentalGracePeriodMinutes) || 0));
    const normalizedSoftLockMinutes = Math.max(0, Math.min(normalizedGraceMinutes || 120, Number(notificationsForm.rentalSoftLockMinutes) || 0));
    const normalizedExtraHourMinutes = Math.max(0, Math.min(120, Number(notificationsForm.extraHourThresholdMinutes) || 0));

    await persistSettings('Rental rules', {
      rentalGracePeriodMinutes: normalizedGraceMinutes,
      rentalSoftLockMinutes: normalizedSoftLockMinutes,
      extraHourThresholdMinutes: normalizedExtraHourMinutes,
      rental_grace_period_minutes: normalizedGraceMinutes,
      rental_soft_lock_minutes: normalizedSoftLockMinutes,
      extra_hour_threshold_minutes: normalizedExtraHourMinutes,
    });
  };

  const handleSecuritySave = async () => {
    await persistSettings('Security & access', {
      requireTwoFactorForAdmins: securityForm.requireTwoFactorForAdmins,
      sessionTimeoutMinutes: Number(securityForm.sessionTimeoutMinutes) || 60,
      allowEmployeePackageEdits: securityForm.allowEmployeePackageEdits,
      allowEmployeeSettingsView: securityForm.allowEmployeeSettingsView,
      writeAuditLogs: securityForm.writeAuditLogs,
      allowLiveTrackingRetry: securityForm.allowLiveTrackingRetry,
      autoSendContractEmailAfterCreation: securityForm.autoSendContractEmailAfterCreation,
      tenantDeletionRetentionDays: Math.max(1, Math.min(365, Number(securityForm.tenantDeletionRetentionDays) || 90)),
    });
  };

  const handleMessagingSave = async () => {
    await persistSettings('Messaging', {
      messagingPhotoSharingEnabled: Boolean(messagingForm.messagingPhotoSharingEnabled),
      messagingMaxPhotosPerMessage: Math.max(1, Math.min(10, Number(messagingForm.messagingMaxPhotosPerMessage) || 3)),
      messagingPhotoRetentionDays: Math.max(1, Math.min(30, Number(messagingForm.messagingPhotoRetentionDays) || 7)),
      messagingDraftRetentionHours: Math.max(1, Math.min(168, Number(messagingForm.messagingDraftRetentionHours) || 24)),
      messagingAllowCameraCapture: Boolean(messagingForm.messagingAllowCameraCapture),
    });
  };

  const renderOverview = () => (
    <div className="space-y-6">
      <SectionCard
        title={isFrench ? 'Centre des paramètres système' : 'System Settings Hub'}
        description={isFrench ? 'Une seule source de vérité pour l’entreprise, les opérations, la finance, les notifications et les accès.' : 'One source of truth for business, operations, finance, notifications, and access.'}
      >
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {overviewCards.map((card) => (
            <div key={card.label} className="rounded-[1.75rem] border border-violet-200/70 bg-gradient-to-r from-violet-50/90 to-indigo-50/80 px-5 py-4 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-400">{card.label}</p>
              <p className="mt-3 text-2xl font-semibold text-slate-950">{card.value}</p>
              <p className="mt-2 text-sm text-slate-500">{card.hint}</p>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard title={isFrench ? 'Ce qui est déjà connecté' : 'What Is Wired Now'} description={isFrench ? 'Ces zones sont déjà reliées à de vrais services de paramètres.' : 'These areas are already connected to real settings services.'}>
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <p className="text-sm font-semibold text-slate-900">{isFrench ? 'Profil entreprise' : 'Business Profile'}</p>
            <p className="mt-2 text-sm text-slate-500">
              {isFrench ? "L'identité de l'entreprise, les coordonnées, le fuseau horaire, la langue et la devise sont enregistrés via le service principal de paramètres." : 'Company identity, contact details, timezone, language, and currency are saved through the main settings service.'}
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <p className="text-sm font-semibold text-slate-900">{isFrench ? 'Opérations' : 'Operations'}</p>
            <p className="mt-2 text-sm text-slate-500">
              {isFrench ? 'Les valeurs par défaut des locations, les indicateurs de suivi, les jours ouvrés et le comportement du transport sont reliés aux services en direct.' : 'Rental defaults, tracking flags, operating days, and transport behavior are wired to live services.'}
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <p className="text-sm font-semibold text-slate-900">{isFrench ? 'Finance et notifications' : 'Finance & Notifications'}</p>
            <p className="mt-2 text-sm text-slate-500">
              {isFrench ? "Les paramètres financiers, les règles fiscales et les rappels opérationnels sont maintenant enregistrés via le même flux de paramètres stable relié à l'API." : 'Finance defaults, tax rules, and operational reminders now save through the same stable API-backed settings flow.'}
            </p>
          </div>
        </div>
      </SectionCard>

      <SectionCard
        title={isFrench ? 'Qui gère quoi' : 'Who Manages What'}
        description={
          isFrench
            ? "Cette page sert aux réglages du tenant actif. Les contrôles commerciaux, le plan et la facturation restent gérés côté plateforme."
            : 'This page is for settings inside the active tenant workspace. Commercial controls, plan access, and billing stay managed from the platform side.'
        }
      >
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-[1.75rem] border border-emerald-200 bg-emerald-50/70 p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-700">
              {isFrench ? 'Géré ici dans le tenant' : 'Managed Here In Tenant'}
            </p>
            <ul className="mt-3 space-y-2 text-sm text-emerald-900">
              <li>{isFrench ? 'Branding, identité publique et infos support' : 'Branding, public identity, and support contact info'}</li>
              <li>{isFrench ? 'Langue, devise et fuseau horaire du tenant' : 'Tenant language, currency, and timezone'}</li>
              <li>{isFrench ? 'Réglages opérationnels, notifications, finance et sécurité' : 'Operational, notification, finance, and security settings'}</li>
            </ul>
          </div>

          <div className="rounded-[1.75rem] border border-violet-200 bg-violet-50/70 p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-violet-700">
              {isFrench ? 'Géré depuis Platform Workspaces' : 'Managed From Platform Workspaces'}
            </p>
            <ul className="mt-3 space-y-2 text-sm text-violet-900">
              <li>{isFrench ? 'Plan du tenant, abonnement et statut de facturation' : 'Tenant plan, subscription, and billing status'}</li>
              <li>{isFrench ? 'Limites: véhicules, staff, listings, stockage' : 'Limits: vehicles, staff, listings, and storage'}</li>
              <li>{isFrench ? "Accès aux fonctionnalités et upgrades/add-ons" : 'Feature access and upgrade/add-on controls'}</li>
            </ul>
          </div>
        </div>
      </SectionCard>
    </div>
  );

  const renderBusiness = () => (
    <div className="space-y-6">
      <SectionCard
        title={isFrench ? 'Identité et branding du tenant' : 'Tenant Identity & Branding'}
        description={
          isFrench
            ? "Cette zone relie les métadonnées tenant visibles depuis Platform Workspaces aux champs que l'équipe tenant doit pouvoir éditer depuis son propre espace."
            : 'This section bridges tenant metadata from Platform Workspaces into fields the tenant team can manage from inside their own workspace.'
        }
        action={
          <button
            type="button"
            onClick={handleTenantIdentitySave}
            disabled={!canEdit || !tenantIdentityReady || savingSection === 'Tenant identity'}
            className={PRIMARY_BUTTON_CLASS}
          >
            {savingSection === 'Tenant identity' ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {isFrench ? "Enregistrer l'identité tenant" : 'Save Tenant Identity'}
          </button>
        }
      >
        <div className="space-y-5">
          <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
                {isFrench ? 'Réglages modifiables ici' : 'Editable Here'}
              </p>
              <p className="mt-3 text-sm text-slate-700">
                {isFrench
                  ? "Le tenant owner peut gérer ici l'identité publique, la langue, la devise, le fuseau horaire et l'email support du tenant actif."
                  : 'The tenant owner can manage the active tenant’s public identity, language, currency, timezone, and support email here.'}
              </p>
            </div>

            <div className="rounded-[1.75rem] border border-violet-200 bg-gradient-to-r from-violet-50/90 to-indigo-50/80 p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-violet-600">
                {isFrench ? 'Contrôles commerciaux plateforme' : 'Platform Commercial Controls'}
              </p>
              <div className="mt-3 grid gap-2 text-sm text-slate-700">
                <p><span className="font-semibold">{isFrench ? 'Plan' : 'Plan'}:</span> {tenantCommercialSummary.planType || 'starter'}</p>
                <p><span className="font-semibold">{isFrench ? 'Abonnement' : 'Subscription'}:</span> {tenantCommercialSummary.subscriptionStatus || 'trial'}</p>
                <p><span className="font-semibold">{isFrench ? 'Facturation' : 'Billing'}:</span> {tenantCommercialSummary.billingStatus || 'none'}</p>
                <p><span className="font-semibold">{isFrench ? 'Fonctionnalités actives' : 'Enabled features'}:</span> {tenantCommercialSummary.featureCount}</p>
              </div>
              <p className="mt-3 text-xs text-slate-500">
                {isFrench
                  ? 'Ces contrôles restent gérés depuis Platform Workspaces pour éviter de mélanger le paramétrage opérationnel et la logique commerciale.'
                  : 'These controls stay managed in Platform Workspaces so operational settings do not get mixed with commercial plan logic.'}
              </p>
            </div>
          </div>

          <div className={`rounded-[1.75rem] border px-5 py-4 shadow-sm ${
            tenantIdentityReady
              ? 'border-emerald-200 bg-emerald-50/70 text-emerald-900'
              : 'border-amber-200 bg-amber-50/80 text-amber-900'
          }`}>
            <p className="text-sm font-semibold">
              {tenantIdentityReady
                ? (isFrench ? 'Connecté au tenant actif' : 'Connected to the active tenant')
                : (isFrench ? 'Aucune session tenant active' : 'No active tenant session')}
            </p>
            <p className="mt-1 text-sm opacity-80">
              {tenantIdentityReady
                ? `${tenantWorkspaceSession?.tenantName || tenantWorkspaceSession?.tenantSlug || ''} • ${tenantWorkspaceSession?.tenantSlug || ''}`
                : (isFrench
                    ? "Ouvrez ce module depuis un vrai contexte tenant pour modifier les métadonnées tenant ici. Les réglages système ci-dessous restent disponibles."
                    : 'Open this page from a real tenant context to edit tenant metadata here. The system settings below remain available.')}
            </p>
          </div>

          <div className="grid gap-5 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">{isFrench ? 'Nom de marque' : 'Brand Name'}</label>
              <input
                className={FIELD_CLASS}
                value={tenantIdentityForm.brand_name}
                disabled={!canEdit || !tenantIdentityReady}
                onChange={(e) => setTenantIdentityForm((current) => ({ ...current, brand_name: e.target.value }))}
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">{isFrench ? 'Nom public affiché' : 'Public Display Name'}</label>
              <input
                className={FIELD_CLASS}
                value={tenantIdentityForm.public_display_name}
                disabled={!canEdit || !tenantIdentityReady}
                onChange={(e) => setTenantIdentityForm((current) => ({ ...current, public_display_name: e.target.value }))}
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">{isFrench ? 'Raison sociale' : 'Legal Business Name'}</label>
              <input
                className={FIELD_CLASS}
                value={tenantIdentityForm.legal_business_name}
                disabled={!canEdit || !tenantIdentityReady}
                onChange={(e) => setTenantIdentityForm((current) => ({ ...current, legal_business_name: e.target.value }))}
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">{isFrench ? 'E-mail support' : 'Support Email'}</label>
              <input
                type="email"
                className={FIELD_CLASS}
                value={tenantIdentityForm.support_email}
                disabled={!canEdit || !tenantIdentityReady}
                onChange={(e) => setTenantIdentityForm((current) => ({ ...current, support_email: e.target.value }))}
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">{isFrench ? 'Domaine personnalisé' : 'Custom Domain'}</label>
              <input
                className={FIELD_CLASS}
                placeholder="rent.example.com"
                value={tenantIdentityForm.custom_domain}
                disabled={!canEdit || !tenantIdentityReady}
                onChange={(e) => setTenantIdentityForm((current) => ({ ...current, custom_domain: e.target.value }))}
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">{isFrench ? 'Pays' : 'Country'}</label>
              <input
                className={FIELD_CLASS}
                value={tenantIdentityForm.country}
                disabled={!canEdit || !tenantIdentityReady}
                onChange={(e) => setTenantIdentityForm((current) => ({ ...current, country: e.target.value }))}
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">{isFrench ? 'Langue tenant' : 'Tenant Language'}</label>
              <select
                className={FIELD_CLASS}
                value={tenantIdentityForm.default_language}
                disabled={!canEdit || !tenantIdentityReady}
                onChange={(e) => setTenantIdentityForm((current) => ({ ...current, default_language: e.target.value }))}
              >
                <option value="en">{isFrench ? 'Anglais' : 'English'}</option>
                <option value="fr">{isFrench ? 'Français' : 'French'}</option>
                <option value="ar">{isFrench ? 'Arabe' : 'Arabic'}</option>
              </select>
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">{isFrench ? 'Devise tenant' : 'Tenant Currency'}</label>
              <select
                className={FIELD_CLASS}
                value={tenantIdentityForm.currency}
                disabled={!canEdit || !tenantIdentityReady}
                onChange={(e) => setTenantIdentityForm((current) => ({ ...current, currency: e.target.value }))}
              >
                <option value="MAD">MAD</option>
                <option value="EUR">EUR</option>
                <option value="USD">USD</option>
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="mb-2 block text-sm font-medium text-slate-700">{isFrench ? 'Fuseau horaire tenant' : 'Tenant Timezone'}</label>
              <select
                className={FIELD_CLASS}
                value={tenantIdentityForm.timezone}
                disabled={!canEdit || !tenantIdentityReady}
                onChange={(e) => setTenantIdentityForm((current) => ({ ...current, timezone: e.target.value }))}
              >
                <option value="Africa/Casablanca">Africa/Casablanca</option>
                <option value="Europe/Paris">Europe/Paris</option>
                <option value="UTC">UTC</option>
              </select>
            </div>
          </div>
        </div>
      </SectionCard>

      <SectionCard
        title={isFrench ? 'Profil entreprise' : 'Business Profile'}
        description={isFrench ? "Identité centrale de l'entreprise utilisée dans les pages admin, les documents imprimés et les communications côté client." : 'Central company identity used across admin pages, printed documents, and customer-facing communications.'}
        action={
          <button
            type="button"
            onClick={handleBusinessSave}
            disabled={!canEdit || savingSection === 'Business profile'}
            className={PRIMARY_BUTTON_CLASS}
          >
            {savingSection === 'Business profile' ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {isFrench ? 'Enregistrer le profil entreprise' : 'Save Business Profile'}
          </button>
        }
      >
      <div className="grid gap-5 md:grid-cols-2">
        <div>
          <label className="mb-2 block text-sm font-medium text-slate-700">{isFrench ? 'Nom de l’entreprise' : 'Company Name'}</label>
          <input
            className={FIELD_CLASS}
            value={businessForm.companyName}
            disabled={!canEdit}
            onChange={(e) => setBusinessForm((current) => ({ ...current, companyName: e.target.value }))}
          />
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium text-slate-700">{isFrench ? "E-mail de l'entreprise" : 'Company Email'}</label>
          <input
            type="email"
            className={FIELD_CLASS}
            value={businessForm.companyEmail}
            disabled={!canEdit}
            onChange={(e) => setBusinessForm((current) => ({ ...current, companyEmail: e.target.value }))}
          />
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium text-slate-700">{isFrench ? "Téléphone de l'entreprise" : 'Company Phone'}</label>
          <input
            className={FIELD_CLASS}
            value={businessForm.companyPhone}
            disabled={!canEdit}
            onChange={(e) => setBusinessForm((current) => ({ ...current, companyPhone: e.target.value }))}
          />
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium text-slate-700">{isFrench ? 'Site web' : 'Website'}</label>
          <input
            className={FIELD_CLASS}
            value={businessForm.companyWebsite}
            disabled={!canEdit}
            onChange={(e) => setBusinessForm((current) => ({ ...current, companyWebsite: e.target.value }))}
          />
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium text-slate-700">{isFrench ? 'URL du logo' : 'Logo URL'}</label>
          <input
            className={FIELD_CLASS}
            placeholder={isFrench ? 'https://.../logo.png' : 'https://.../logo.png'}
            value={businessForm.logoUrl}
            disabled={!canEdit}
            onChange={(e) => setBusinessForm((current) => ({ ...current, logoUrl: e.target.value }))}
          />
          <p className="mt-2 text-xs text-slate-500">
            {isFrench ? 'Utilise partout dans le tenant, y compris les partages, documents et pages publiques.' : 'Used across the tenant, including shares, documents, and public pages.'}
          </p>
          <div className="mt-3">
            <label className={`${SECONDARY_BUTTON_CLASS} cursor-pointer`}>
              {assetUploads.logo ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {isFrench ? 'Importer le logo' : 'Import Logo'}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                disabled={!canEdit || assetUploads.logo}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    uploadBrandAsset('logo', file);
                  }
                  e.target.value = '';
                }}
              />
            </label>
          </div>
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium text-slate-700">{isFrench ? 'URL du cachet' : 'Stamp URL'}</label>
          <input
            className={FIELD_CLASS}
            placeholder={isFrench ? 'https://.../stamp.png' : 'https://.../stamp.png'}
            value={businessForm.stampUrl}
            disabled={!canEdit}
            onChange={(e) => setBusinessForm((current) => ({ ...current, stampUrl: e.target.value }))}
          />
          <div className="mt-3">
            <label className={`${SECONDARY_BUTTON_CLASS} cursor-pointer`}>
              {assetUploads.stamp ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {isFrench ? 'Importer le cachet' : 'Import Stamp'}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                disabled={!canEdit || assetUploads.stamp}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    uploadBrandAsset('stamp', file);
                  }
                  e.target.value = '';
                }}
              />
            </label>
          </div>
        </div>
        <div className="md:col-span-2 grid gap-5 md:grid-cols-2">
          <AssetPreview
            label={isFrench ? 'Apercu du logo' : 'Logo Preview'}
            url={effectiveLogoUrl}
            emptyLabel={isFrench ? 'Aucun logo importe pour le moment.' : 'No logo imported yet.'}
            bucketLabel={
              businessForm.logoUrl
                ? (isFrench
                    ? `Stocke dans le bucket ${brandingBucket} et reutilise partout dans le tenant.`
                    : `Stored in the ${brandingBucket} bucket and reused across the tenant.`)
                : brandingContext.isSaharaXTenant
                  ? (isFrench
                      ? 'Apercu de l’actif SaharaX herite. Enregistrez ou importez pour le stocker pour ce tenant.'
                      : 'Previewing the inherited SaharaX asset. Save or import it to store it for this tenant.')
                  : (isFrench
                      ? `Ce tenant doit importer son propre logo dans le bucket ${brandingBucket}.`
                      : `This tenant should import its own logo into the ${brandingBucket} bucket.`)
            }
          />
          <AssetPreview
            label={isFrench ? 'Apercu du cachet' : 'Stamp Preview'}
            url={effectiveStampUrl}
            emptyLabel={isFrench ? 'Aucun cachet importe pour le moment.' : 'No stamp imported yet.'}
            bucketLabel={
              businessForm.stampUrl
                ? (isFrench
                    ? `Stocke dans le bucket ${brandingBucket} et reutilise pour les documents et impressions.`
                    : `Stored in the ${brandingBucket} bucket and reused for documents and print flows.`)
                : brandingContext.isSaharaXTenant
                  ? (isFrench
                      ? 'Apercu du cachet SaharaX herite. Enregistrez ou importez pour le stocker pour ce tenant.'
                      : 'Previewing the inherited SaharaX stamp. Save or import it to store it for this tenant.')
                  : (isFrench
                      ? `Ce tenant doit importer son propre cachet dans le bucket ${brandingBucket}.`
                      : `This tenant should import its own stamp into the ${brandingBucket} bucket.`)
            }
          />
        </div>
        <div className="md:col-span-2">
          <label className="mb-2 block text-sm font-medium text-slate-700">{isFrench ? 'Adresse' : 'Address'}</label>
          <textarea
            rows={3}
            className={FIELD_CLASS}
            value={businessForm.companyAddress}
            disabled={!canEdit}
            onChange={(e) => setBusinessForm((current) => ({ ...current, companyAddress: e.target.value }))}
          />
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium text-slate-700">{isFrench ? 'Fuseau horaire' : 'Timezone'}</label>
          <select
            className={FIELD_CLASS}
            value={businessForm.timezone}
            disabled={!canEdit}
            onChange={(e) => setBusinessForm((current) => ({ ...current, timezone: e.target.value }))}
          >
            <option value="Africa/Casablanca">Africa/Casablanca</option>
            <option value="Europe/Paris">Europe/Paris</option>
            <option value="UTC">UTC</option>
          </select>
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium text-slate-700">{isFrench ? 'Langue par défaut' : 'Default Language'}</label>
          <select
            className={FIELD_CLASS}
            value={businessForm.language}
            disabled={!canEdit}
            onChange={(e) => setBusinessForm((current) => ({ ...current, language: e.target.value }))}
          >
            <option value="en">{isFrench ? 'Anglais' : 'English'}</option>
            <option value="fr">{isFrench ? 'Français' : 'French'}</option>
            <option value="ar">{isFrench ? 'Arabe' : 'Arabic'}</option>
          </select>
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium text-slate-700">{isFrench ? 'Devise' : 'Currency'}</label>
          <select
            className={FIELD_CLASS}
            value={businessForm.currency}
            disabled={!canEdit}
            onChange={(e) => setBusinessForm((current) => ({ ...current, currency: e.target.value }))}
          >
            <option value="MAD">MAD</option>
            <option value="EUR">EUR</option>
            <option value="USD">USD</option>
          </select>
        </div>
      </div>
    </SectionCard>
    </div>
  );

  const renderOperations = () => (
    <SectionCard
      title={isFrench ? 'Opérations' : 'Operations'}
      description={isFrench ? 'Règles opérationnelles pour les réservations, fenêtres de location, notifications et comportement du suivi en direct.' : 'Operational rules for bookings, rental windows, notifications, and live tracking behavior.'}
      action={
        <button
          type="button"
          onClick={handleOperationsSave}
          disabled={!canEdit || savingSection === 'Operations'}
          className={PRIMARY_BUTTON_CLASS}
        >
          {savingSection === 'Operations' ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {isFrench ? 'Enregistrer les opérations' : 'Save Operations'}
        </button>
      }
    >
      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-5">
          <div className="grid gap-5 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">{isFrench ? "Heure d'ouverture" : 'Opening Time'}</label>
              <input
                type="time"
                className={FIELD_CLASS}
                value={operationsForm.operatingStart}
                disabled={!canEdit}
                onChange={(e) => setOperationsForm((current) => ({ ...current, operatingStart: e.target.value }))}
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">{isFrench ? 'Heure de fermeture' : 'Closing Time'}</label>
              <input
                type="time"
                className={FIELD_CLASS}
                value={operationsForm.operatingEnd}
                disabled={!canEdit}
                onChange={(e) => setOperationsForm((current) => ({ ...current, operatingEnd: e.target.value }))}
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">{isFrench ? 'Durée de location par défaut' : 'Default Rental Duration'}</label>
              <input
                type="number"
                min="1"
                className={FIELD_CLASS}
                value={operationsForm.defaultRentalDuration}
                disabled={!canEdit}
                onChange={(e) => setOperationsForm((current) => ({ ...current, defaultRentalDuration: e.target.value }))}
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">{isFrench ? 'Durée minimale de location' : 'Minimum Rental Duration'}</label>
              <input
                type="number"
                min="1"
                className={FIELD_CLASS}
                value={operationsForm.minRentalDuration}
                disabled={!canEdit}
                onChange={(e) => setOperationsForm((current) => ({ ...current, minRentalDuration: e.target.value }))}
              />
            </div>
            <div className="md:col-span-2">
              <label className="mb-2 block text-sm font-medium text-slate-700">{isFrench ? 'Durée maximale de location' : 'Maximum Rental Duration'}</label>
              <input
                type="number"
                min="1"
                className={FIELD_CLASS}
                value={operationsForm.maxRentalDuration}
                disabled={!canEdit}
                onChange={(e) => setOperationsForm((current) => ({ ...current, maxRentalDuration: e.target.value }))}
              />
            </div>
            <div className="md:col-span-2 rounded-3xl border border-violet-100 bg-violet-50/70 p-4">
              <div className="mb-3">
                <h4 className="text-sm font-semibold uppercase tracking-[0.24em] text-violet-700">
                  {isFrench ? 'Règle de retour journalier' : 'Daily Return Rule'}
                </h4>
                <p className="mt-2 text-sm text-slate-600">
                  {isFrench
                    ? 'Définissez l’heure fixe de retour pour les forfaits journaliers et la règle de retard utilisée ensuite dans les reçus et les flux de location.'
                    : 'Set the fixed return time for daily packages and the late-return rule that rentals, receipts, and pricing will reuse next.'}
                </p>
              </div>
              <div className="grid gap-4 md:grid-cols-3">
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">{isFrench ? 'Retour journalier à' : 'Daily Return Time'}</label>
                  <input
                    type="time"
                    className={FIELD_CLASS}
                    value={operationsForm.dailyReturnFixedTime}
                    disabled={!canEdit}
                    onChange={(e) => setOperationsForm((current) => ({ ...current, dailyReturnFixedTime: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">{isFrench ? 'Pénalité par heure (MAD)' : 'Hourly Late Fee (MAD)'}</label>
                  <input
                    type="number"
                    min="0"
                    className={FIELD_CLASS}
                    value={operationsForm.dailyLateReturnHourlyPenaltyMad}
                    disabled={!canEdit}
                    onChange={(e) => setOperationsForm((current) => ({ ...current, dailyLateReturnHourlyPenaltyMad: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">{isFrench ? 'Après combien d’heures = jour complet' : 'Full Extra Day After (Hours)'}</label>
                  <input
                    type="number"
                    min="1"
                    className={FIELD_CLASS}
                    value={operationsForm.dailyLateReturnFullDayThresholdHours}
                    disabled={!canEdit}
                    onChange={(e) => setOperationsForm((current) => ({ ...current, dailyLateReturnFullDayThresholdHours: e.target.value }))}
                  />
                </div>
              </div>
              <div className="mt-3 rounded-2xl border border-white/70 bg-white/80 px-4 py-3 text-sm text-slate-600 shadow-sm">
                {isFrench
                  ? `Aperçu : retour avant ${operationsForm.dailyReturnFixedTime || '14:00'} ; ${operationsForm.dailyLateReturnHourlyPenaltyMad || 0} MAD par heure supplémentaire ; après ${operationsForm.dailyLateReturnFullDayThresholdHours || 1} heure(s), une journée complète supplémentaire s’applique.`
                  : `Preview: return before ${operationsForm.dailyReturnFixedTime || '14:00'}; ${operationsForm.dailyLateReturnHourlyPenaltyMad || 0} MAD per extra hour; after ${operationsForm.dailyLateReturnFullDayThresholdHours || 1} hour(s), charge a full extra day.`}
              </div>
            </div>
            <div className="md:col-span-2">
              <label className="mb-2 block text-sm font-medium text-slate-700">{isFrench ? 'Mode par défaut des détails de location' : 'Default Rental Details Mode'}</label>
              <select
                className={FIELD_CLASS}
                value={operationsForm.rentalDetailsDefaultView}
                disabled={!canEdit}
                onChange={(e) => setOperationsForm((current) => ({ ...current, rentalDetailsDefaultView: e.target.value }))}
              >
                <option value="standard">{isFrench ? 'Standard' : 'Standard'}</option>
                <option value="light">{isFrench ? 'Light' : 'Light'}</option>
              </select>
              <p className="mt-2 text-xs text-slate-500">
                {isFrench
                  ? 'Définit la vue qui s’ouvre par défaut pour l’équipe dans les détails de location. La vue avancée reste toujours disponible dans la page.'
                  : 'Sets which rental-details view opens by default for staff. The advanced view stays available inside the page at all times.'}
              </p>
            </div>
          </div>

          <div>
            <p className="mb-3 text-sm font-medium text-slate-700">{isFrench ? "Jours d'ouverture" : 'Operating Days'}</p>
            <div className="flex flex-wrap gap-2">
              {['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].map((day) => {
                const active = operationsForm.operatingDays.includes(day);
                return (
                  <button
                    key={day}
                    type="button"
                    disabled={!canEdit}
                    onClick={() => handleOperatingDayToggle(day)}
                    className={`rounded-2xl border px-4 py-2 text-sm font-medium capitalize transition ${
                      active
                        ? 'border-blue-200 bg-blue-50 text-blue-700'
                        : 'border-slate-200 bg-white text-slate-600'
                    } ${!canEdit ? 'cursor-not-allowed opacity-60' : ''}`}
                  >
                    {day}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <ToggleCard
            title={isFrench ? 'Mode maintenance' : 'Maintenance Mode'}
            description={isFrench ? 'À utiliser lorsque le système doit être en lecture seule pour les changements opérationnels.' : 'Use this when the system should be read-only for operational changes.'}
            checked={operationsForm.maintenanceMode}
            disabled={!canEdit}
            onChange={(value) => setOperationsForm((current) => ({ ...current, maintenanceMode: value }))}
          />
          <ToggleCard
            title={isFrench ? 'Réservation en ligne' : 'Online Booking'}
            description={isFrench ? "Contrôle si les flux de réservation en ligne restent disponibles pour l'équipe." : 'Controls whether online booking flows stay available to the team.'}
            checked={operationsForm.onlineBooking}
            disabled={!canEdit}
            onChange={(value) => setOperationsForm((current) => ({ ...current, onlineBooking: value }))}
          />
          <ToggleCard
            title={isFrench ? 'Suivi en temps réel' : 'Real-Time Tracking'}
            description={isFrench ? 'Indicateur par défaut pour la carte en direct et le suivi des tours.' : 'Default flag for the live map and tour tracking workflow.'}
            checked={operationsForm.realTimeTracking}
            disabled={!canEdit}
            onChange={(value) => setOperationsForm((current) => ({ ...current, realTimeTracking: value }))}
          />
          <ToggleCard
            title={isFrench ? 'Notifications e-mail' : 'Email Notifications'}
            description={isFrench ? "Active les notifications opérationnelles par e-mail dans les flux de réservation et d'administration." : 'Enable operational email notifications across booking and admin flows.'}
            checked={operationsForm.emailNotifications}
            disabled={!canEdit}
            onChange={(value) => setOperationsForm((current) => ({ ...current, emailNotifications: value }))}
          />
          <ToggleCard
            title={isFrench ? 'Notifications SMS' : 'SMS Notifications'}
            description={isFrench ? "Active les rappels SMS pour les clients et les flux de l'équipe." : 'Enable SMS reminders for customers and staff workflows.'}
            checked={operationsForm.smsNotifications}
            disabled={!canEdit}
            onChange={(value) => setOperationsForm((current) => ({ ...current, smsNotifications: value }))}
          />
          <ToggleCard
            title={isFrench ? 'Notifications push' : 'Push Notifications'}
            description={isFrench ? 'Contrôle les notifications push pour les expériences utilisateur prises en charge.' : 'Controls push-style notifications for supported user experiences.'}
            checked={operationsForm.pushNotifications}
            disabled={!canEdit}
            onChange={(value) => setOperationsForm((current) => ({ ...current, pushNotifications: value }))}
          />
        </div>
      </div>
    </SectionCard>
  );

  const renderFinance = () => (
    <SectionCard
      title={isFrench ? 'Finance et taxes' : 'Finance & Tax'}
      description={isFrench ? 'Comportement fiscal et paramètres financiers utilisés par les reçus, factures, locations et tours.' : 'Tax behavior and finance defaults used by receipts, invoices, rentals, and tours.'}
      action={
        <button
          type="button"
          onClick={handleFinanceSave}
          disabled={!canEdit || savingSection === 'Finance & tax'}
          className={PRIMARY_BUTTON_CLASS}
        >
          {savingSection === 'Finance & tax' ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {isFrench ? 'Enregistrer finance et taxes' : 'Save Finance & Tax'}
        </button>
      }
    >
      <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <div className="space-y-5 rounded-[1.75rem] border border-violet-200/70 bg-gradient-to-r from-violet-50/90 to-indigo-50/80 p-5">
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">{isFrench ? 'Pourcentage de taxe' : 'Tax Percentage'}</label>
            <input
              type="number"
              min="0"
              max="100"
              className={FIELD_CLASS}
              value={settings.tax_percentage}
              disabled={!canEdit}
              onChange={(e) => setSettings((current) => ({ ...current, tax_percentage: Number(e.target.value) || 0 }))}
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">{isFrench ? 'Préfixe de facture' : 'Invoice Prefix'}</label>
            <input
              className={FIELD_CLASS}
              value={settings.invoicePrefix || 'INV'}
              disabled={!canEdit}
              onChange={(e) => setSettings((current) => ({ ...current, invoicePrefix: e.target.value }))}
            />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <ToggleCard
              title={isFrench ? 'Appliquer la taxe aux locations' : 'Apply Tax To Rentals'}
              description={isFrench ? 'Inclure la taxe sur les reçus de location et les calculs financiers.' : 'Include tax on rental receipts and finance calculations.'}
              checked={Boolean(settings.apply_to_rentals)}
              disabled={!canEdit}
              onChange={(value) => setSettings((current) => ({ ...current, apply_to_rentals: value }))}
            />
            <ToggleCard
              title={isFrench ? 'Appliquer la taxe aux tours' : 'Apply Tax To Tours'}
              description={isFrench ? 'Inclure la taxe sur les réservations de tours et les rapports financiers des tours.' : 'Include tax on tour bookings and tour finance reporting.'}
              checked={Boolean(settings.apply_to_tours)}
              disabled={!canEdit}
              onChange={(value) => setSettings((current) => ({ ...current, apply_to_tours: value }))}
            />
          </div>
        </div>
        <div className="space-y-4">
          <ToggleCard
            title={isFrench ? 'Activer la taxe' : 'Enable Tax'}
            description={isFrench ? 'Contrôle principal de la visibilité des taxes et des calculs automatiques.' : 'Master control for tax visibility and automatic tax calculations.'}
            checked={Boolean(settings.tax_enabled)}
            disabled={!canEdit}
            onChange={(value) => setSettings((current) => ({ ...current, tax_enabled: value }))}
          />
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-semibold text-slate-900">{isFrench ? 'Paramètres financiers par défaut' : 'Finance Defaults'}</p>
            <p className="mt-2 text-sm text-slate-500">
              {isFrench ? "Cette section est maintenant enregistrée dans le même document partagé de paramètres système, elle ne dépend donc plus de la table SQL manquante `tax_settings`." : 'This section is now stored with the same shared system settings document, so it no longer depends on the missing `tax_settings` SQL table.'}
            </p>
            <button
              type="button"
              onClick={handleFinanceSave}
              disabled={!canEdit || savingSection === 'Finance & tax'}
              className={`mt-4 ${PRIMARY_BUTTON_CLASS}`}
            >
              {savingSection === 'Finance & tax' ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {isFrench ? 'Enregistrer finance et taxes' : 'Save Finance & Tax'}
            </button>
          </div>
        </div>
      </div>
    </SectionCard>
  );

  const renderRentalRules = () => (
    <SectionCard
      title={isFrench ? 'Règles de location' : 'Rental Rules'}
      description={
        isFrench
          ? 'Configurez la période de grâce, l’alerte de retard et la logique de libération automatique pour les réservations planifiées.'
          : 'Configure the grace window, late warning, and auto-release behavior for scheduled rentals.'
      }
      action={
        <button
          type="button"
          onClick={handleRentalRulesSave}
          disabled={!canEdit || savingSection === 'Rental rules'}
          className={PRIMARY_BUTTON_CLASS}
        >
          {savingSection === 'Rental rules' ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {isFrench ? 'Enregistrer les règles de location' : 'Save Rental Rules'}
        </button>
      }
    >
      <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <div className="space-y-5">
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">
              {isFrench ? 'Période de grâce réservation (minutes)' : 'Booking Grace Period (minutes)'}
            </label>
            <input
              type="number"
              min="0"
              max="120"
              className={FIELD_CLASS}
              value={notificationsForm.rentalGracePeriodMinutes}
              disabled={!canEdit}
              onChange={(e) => setNotificationsForm((current) => ({ ...current, rentalGracePeriodMinutes: e.target.value }))}
            />
            <p className="mt-2 text-xs text-slate-500">
              {isFrench
                ? 'Maximum 120 minutes. Cette règle s’applique aux locations journalières et horaires planifiées.'
                : 'Maximum 120 minutes. This rule applies to both scheduled daily and hourly rentals.'}
            </p>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">
              {isFrench ? 'Alerte retard réservation (minutes)' : 'Late Booking Warning (minutes)'}
            </label>
            <input
              type="number"
              min="0"
              max="120"
              className={FIELD_CLASS}
              value={notificationsForm.rentalSoftLockMinutes}
              disabled={!canEdit}
              onChange={(e) => setNotificationsForm((current) => ({ ...current, rentalSoftLockMinutes: e.target.value }))}
            />
            <p className="mt-2 text-xs text-slate-500">
              {isFrench
                ? 'Définit quand la réservation doit commencer à être signalée comme en retard avant la libération automatique.'
                : 'Defines when the booking should start being flagged as late before auto-release.'}
            </p>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">
              {isFrench ? "Seuil d’heure supplémentaire (minutes)" : 'Extra Hour Threshold (minutes)'}
            </label>
            <input
              type="number"
              min="0"
              max="120"
              className={FIELD_CLASS}
              value={notificationsForm.extraHourThresholdMinutes}
              disabled={!canEdit}
              onChange={(e) => setNotificationsForm((current) => ({ ...current, extraHourThresholdMinutes: e.target.value }))}
            />
            <p className="mt-2 text-xs text-slate-500">
              {isFrench
                ? "Après ce délai, l’heure suivante est facturée."
                : 'After this time, the next hour is charged.'}
            </p>
          </div>
        </div>

        <div className="rounded-[1.75rem] border border-violet-200/70 bg-gradient-to-r from-violet-50/90 to-indigo-50/80 p-5">
          <p className="text-sm font-semibold text-slate-900">
            {isFrench ? 'Comment cela fonctionne' : 'How It Works'}
          </p>
          <div className="mt-3 space-y-3 text-sm text-slate-600">
            <p>
              {isFrench
                ? 'Les réservations planifiées restent bloquées pendant la période de grâce après l’heure prévue de départ.'
                : 'Scheduled rentals stay blocked during the grace window after the planned start time.'}
            </p>
            <p>
              {isFrench
                ? 'Une fois la période dépassée, la réservation peut expirer automatiquement et le véhicule redevient disponible.'
                : 'Once that window passes, the booking can auto-expire and the vehicle becomes available again.'}
            </p>
            <p>
              {isFrench
                ? "Le seuil d’heure supplémentaire est la règle de retour tardif : au-delà de ce délai, la clôture ajoute automatiquement l’heure suivante."
                : 'The extra-hour threshold is the late-return rule: once a return passes this window, closing the rental automatically adds the next billable hour.'}
            </p>
            <p>
              {isFrench
                ? "La période de grâce de réservation reste séparée : elle contrôle les départs planifiés en retard et l’expiration automatique des réservations."
                : 'The booking grace period stays separate: it controls late scheduled starts and automatic booking expiry.'}
            </p>
          </div>
        </div>
      </div>
    </SectionCard>
  );

  const renderNotifications = () => (
    <SectionCard
      title={isFrench ? 'Notifications' : 'Notifications'}
      description={isFrench ? "Paramètres de communication opérationnelle pour les rappels, alertes, WhatsApp et le suivi de l'équipe." : 'Operational communication defaults for reminders, alerts, WhatsApp, and staff follow-up.'}
      action={
        <button
          type="button"
          onClick={handleNotificationsSave}
          disabled={!canEdit || savingSection === 'Notifications'}
          className={PRIMARY_BUTTON_CLASS}
        >
          {savingSection === 'Notifications' ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {isFrench ? 'Enregistrer les notifications' : 'Save Notifications'}
        </button>
      }
    >
      <div className="space-y-6">
        <div className="rounded-[1.75rem] border border-violet-200 bg-gradient-to-r from-violet-50/90 to-indigo-50/80 p-5 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-3xl">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-violet-600">
                {isFrench ? 'Telegram de l’espace' : 'Workspace Telegram'}
              </p>
              <h3 className="mt-2 text-lg font-semibold text-slate-950">
                {isFrench ? 'Bot, livraison partagée et événements par défaut' : 'Bot, shared delivery, and default events'}
              </h3>
              <p className="mt-2 text-sm text-slate-600">
                {isFrench
                  ? "Configurez ici le bot Telegram de l’espace et les chats partagés ou groupe qui doivent recevoir les alertes de l’entreprise."
                  : 'Set up the workspace Telegram bot here, plus the shared or group chats that should receive business alerts.'}
              </p>
            </div>
            <button
              type="button"
              onClick={handleTenantTelegramSave}
              disabled={savingSection === 'Tenant telegram'}
              className={PRIMARY_BUTTON_CLASS}
            >
              {savingSection === 'Tenant telegram' ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {isFrench ? 'Enregistrer Telegram' : 'Save Telegram'}
            </button>
          </div>

          <div className={`mt-5 rounded-[1.5rem] border px-4 py-4 ${
            tenantIdentityReady
              ? 'border-emerald-200 bg-white/80 text-emerald-900'
              : 'border-amber-200 bg-amber-50/80 text-amber-900'
          }`}>
            <p className="text-sm font-semibold">
              {tenantIdentityReady
                ? (isFrench ? 'Configuration liée au tenant actif' : 'Settings linked to the active tenant')
                : (isFrench ? 'Session tenant requise' : 'Tenant session required')}
            </p>
            <p className="mt-1 text-sm opacity-80">
              {tenantIdentityReady
                ? `${tenantWorkspaceSession?.tenantName || tenantWorkspaceSession?.tenantSlug || ''} • ${tenantWorkspaceSession?.tenantSlug || ''}`
                : (isFrench
                    ? "Ouvrez ce module depuis un vrai contexte tenant pour enregistrer le bot Telegram de ce tenant."
                    : 'Open this module from a real tenant context to save that tenant’s Telegram bot.')}
            </p>
          </div>

          <div className="mt-5 grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
            <div className={`rounded-[1.75rem] border p-5 shadow-sm ${
              tenantTelegramConnected
                ? 'border-emerald-200 bg-emerald-50/70'
                : 'border-amber-200 bg-amber-50/70'
            }`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
                    {isFrench ? 'État de connexion' : 'Connection status'}
                  </p>
                  <p className="mt-2 text-lg font-semibold text-slate-950">
                    {tenantTelegramConnected
                      ? (isFrench ? 'Prêt à envoyer' : 'Ready to send')
                      : (isFrench ? 'Configuration incomplète' : 'Setup incomplete')}
                  </p>
                </div>
                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${
                  tenantTelegramConnected
                    ? 'bg-emerald-100 text-emerald-700'
                    : 'bg-amber-100 text-amber-700'
                }`}>
                  {tenantTelegramConnected ? (isFrench ? 'Connecté' : 'Connected') : (isFrench ? 'À compléter' : 'Needs setup')}
                </span>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-white/80 bg-white/80 px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-500">{isFrench ? 'Chats' : 'Chats'}</p>
                  <p className="mt-2 text-lg font-semibold text-slate-950">
                    {String(tenantTelegramForm.telegram_chat_ids || '').split(',').map((value) => value.trim()).filter(Boolean).length}
                  </p>
                </div>
                <div className="rounded-2xl border border-white/80 bg-white/80 px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-500">{isFrench ? 'Événements actifs' : 'Enabled events'}</p>
                  <p className="mt-2 text-lg font-semibold text-slate-950">{enabledTelegramEventsCount}</p>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={handleTelegramTest}
                  disabled={telegramTesting}
                  className={SECONDARY_BUTTON_CLASS}
                >
                  {telegramTesting ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Bell className="h-4 w-4" />}
                  {isFrench ? 'Envoyer un test' : 'Send test'}
                </button>
                <p className="text-xs text-slate-500 self-center">
                  {isFrench
                    ? 'Envoie un message test court vers les chats Telegram de ce tenant.'
                    : 'Sends a short test message to this tenant’s Telegram chats.'}
                </p>
              </div>
            </div>

            <div className="rounded-[1.75rem] border border-white/70 bg-white/75 p-5 shadow-sm">
              <p className="text-sm font-semibold text-slate-900">
                {isFrench ? 'Fonctionnement' : 'How this works'}
              </p>
              <div className="mt-3 space-y-3 text-sm text-slate-600">
                <p>{isFrench ? '1. Les chats ici reçoivent les alertes partagées de l’espace.' : '1. The chat IDs here receive shared workspace alerts.'}</p>
                <p>{isFrench ? '2. L’admin autorise ensuite les membres du staff concernés.' : '2. Admin then allows the relevant staff members.'}</p>
                <p>{isFrench ? '3. Chaque membre peut ajouter ses propres chats dans son profil pour recevoir des alertes directes.' : '3. Each staff member can add their own chats in Profile to receive direct alerts.'}</p>
                <p>{isFrench ? '4. Les chats partagés et les chats personnels peuvent fonctionner ensemble.' : '4. Shared chats and personal chats can work together.'}</p>
              </div>
            </div>
          </div>

          <div className="mt-5 grid gap-5 xl:grid-cols-[1.05fr_0.95fr]">
            <div className="grid gap-5 md:grid-cols-2">
              <div className="md:col-span-2">
                <ToggleCard
                  title={isFrench ? 'Activer les alertes Telegram' : 'Enable Telegram alerts'}
                  description={isFrench ? "Active la couche Telegram du tenant. Les alertes staff suivront ensuite les permissions admin et les préférences personnelles." : 'Turns on the tenant Telegram layer. Staff alerts will then follow admin permissions and personal preferences.'}
                  checked={tenantTelegramForm.telegram_enabled}
                  disabled={!canEdit}
                  onChange={(value) => setTenantTelegramForm((current) => ({ ...current, telegram_enabled: value }))}
                />
              </div>
              <div className="md:col-span-2">
                <label className="mb-2 block text-sm font-medium text-slate-700">{isFrench ? 'Token du bot Telegram' : 'Telegram Bot Token'}</label>
                <input
                  type="password"
                  className={FIELD_CLASS}
                  placeholder="1234567890:AA..."
                  value={tenantTelegramForm.telegram_bot_token}
                  disabled={!canEdit}
                  onChange={(e) => setTenantTelegramForm((current) => ({ ...current, telegram_bot_token: e.target.value }))}
                />
              </div>
              <div className="md:col-span-2">
                <label className="mb-2 block text-sm font-medium text-slate-700">{isFrench ? "Chat ID(s) du groupe d'equipe" : 'Team group Chat ID(s)'}</label>
                <input
                  className={FIELD_CLASS}
                  placeholder="-5110682571"
                  value={tenantTelegramForm.telegram_chat_ids}
                  disabled={!canEdit}
                  onChange={(e) => setTenantTelegramForm((current) => ({
                    ...current,
                    telegram_chat_ids: e.target.value,
                    telegram_website_reservation_chat_ids: e.target.value,
                  }))}
                />
                <p className="mt-2 text-xs text-slate-500">
                  {isFrench
                    ? "Un seul groupe simple pour les reservations web et les alertes operations. Separez plusieurs chats par des virgules si necessaire."
                    : 'One simple group for website reservations and operations alerts. Separate multiple chat IDs with commas if needed.'}
                </p>
              </div>
              <div className="md:col-span-2">
                <label className="mb-2 block text-sm font-medium text-slate-700">{isFrench ? "URL publique de l'application" : 'Public App URL'}</label>
                <input
                  className={FIELD_CLASS}
                  placeholder="https://tenant.driveout.io"
                  value={tenantTelegramForm.telegram_base_url}
                  disabled={!canEdit}
                  onChange={(e) => setTenantTelegramForm((current) => ({ ...current, telegram_base_url: e.target.value }))}
                />
              </div>
              <div className="md:col-span-2">
                <label className="mb-2 block text-sm font-medium text-slate-700">
                  {isFrench ? 'Rappel retard récurrent (minutes)' : 'Recurring overdue reminder (minutes)'}
                </label>
                <input
                  type="number"
                  min="0"
                  className={FIELD_CLASS}
                  placeholder="60"
                  value={tenantTelegramForm.telegram_overdue_repeat_minutes}
                  disabled={!canEdit}
                  onChange={(e) => setTenantTelegramForm((current) => ({ ...current, telegram_overdue_repeat_minutes: e.target.value }))}
                />
                <p className="mt-2 text-xs text-slate-500">
                  {isFrench
                    ? '0 désactive les rappels répétés. 60 enverra à nouveau une alerte chaque heure tant que la location reste en retard.'
                    : '0 disables repeated reminders. 60 will send another alert every hour while the rental is still overdue.'}
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="rounded-[1.75rem] border border-white/70 bg-white/75 p-5 shadow-sm">
                <p className="text-sm font-semibold text-slate-900">
                  {isFrench ? 'Événements et destinations Telegram' : 'Telegram Events and Delivery'}
                </p>
                <p className="mt-2 text-sm text-slate-500">
                  {isFrench
                    ? "L'admin choisit quels événements sont actifs, puis s'ils vont au groupe d'equipe ou aux chats directs staff."
                    : 'Admin chooses which events are active, then whether they go to the team group or direct staff chats.'}
                </p>
              </div>

              <div className="rounded-[1.75rem] border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-violet-600">
                      {isFrench ? 'Matrice de livraison' : 'Delivery matrix'}
                    </p>
                    <p className="mt-2 text-sm text-slate-500">
                      {isFrench
                        ? "Le profil utilisateur contrôle seulement les alertes directes personnelles. Le groupe d'equipe est contrôlé ici."
                        : 'User profile preferences control direct personal alerts only. The team group is controlled here.'}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                      {enabledTelegramEventsCount} / {TELEGRAM_ALERT_EVENT_KEYS.length} {isFrench ? 'actifs' : 'active'}
                    </span>
                    <span className="rounded-full bg-violet-100 px-3 py-1 text-xs font-semibold text-violet-700">
                      {isFrench ? "Groupe d'equipe" : 'Team group'}: {telegramDeliverySummary.teamGroup}
                    </span>
                    <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
                      {isFrench ? 'Staff direct' : 'Direct staff'}: {telegramDeliverySummary.directStaff}
                    </span>
                  </div>
                </div>

                <div className="mt-4 space-y-3">
                  {TELEGRAM_ALERT_EVENT_KEYS.map((eventKey) => {
                    const eventEnabled = tenantTelegramForm.telegram_event_types?.[eventKey] === true;
                    const currentRoute = normalizeTelegramDeliveryRoutes(tenantTelegramForm.telegram_delivery_routes)[eventKey] || {};
                    const teamGroupActive = currentRoute.workspace === true || currentRoute.website === true;
                    const enabledLaneCount = (teamGroupActive ? 1 : 0) + (currentRoute.personal === true ? 1 : 0);
                    const setEventEnabled = (nextValue) => {
                      setTenantTelegramForm((current) => ({
                        ...current,
                        telegram_event_types: {
                          ...current.telegram_event_types,
                          [eventKey]: nextValue,
                        },
                      }));
                    };
                    const setRouteLane = (lane, nextValue) => {
                      setTenantTelegramForm((current) => {
                        const normalizedRoutes = normalizeTelegramDeliveryRoutes(current.telegram_delivery_routes);
                        return {
                          ...current,
                          telegram_delivery_routes: {
                            ...normalizedRoutes,
                            [eventKey]: {
                              ...normalizedRoutes[eventKey],
                              [lane]: nextValue,
                            },
                          },
                        };
                      });
                    };
                    const setTeamGroupRoute = (nextValue) => {
                      setTenantTelegramForm((current) => {
                        const normalizedRoutes = normalizeTelegramDeliveryRoutes(current.telegram_delivery_routes);
                        return {
                          ...current,
                          telegram_delivery_routes: {
                            ...normalizedRoutes,
                            [eventKey]: {
                              ...normalizedRoutes[eventKey],
                              workspace: nextValue,
                              website: nextValue,
                            },
                          },
                        };
                      });
                    };

                    return (
                      <div
                        key={eventKey}
                        className={`rounded-2xl border p-3 transition ${
                          eventEnabled
                            ? 'border-violet-100 bg-violet-50/40'
                            : 'border-slate-200 bg-slate-50 opacity-75'
                        }`}
                      >
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-sm font-semibold text-slate-900">
                                {getTelegramEventLabel(eventKey, isFrench)}
                              </p>
                              <button
                                type="button"
                                disabled={!canEdit}
                                onClick={() => setEventEnabled(!eventEnabled)}
                                className={`rounded-full px-2 py-0.5 text-[11px] font-bold transition ${
                                eventEnabled ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-500'
                                } ${canEdit ? 'hover:ring-2 hover:ring-violet-100' : 'cursor-not-allowed opacity-70'}`}
                              >
                                {eventEnabled ? (isFrench ? 'Actif' : 'Enabled') : (isFrench ? 'Désactivé' : 'Off')}
                              </button>
                              {eventEnabled && enabledLaneCount === 0 && (
                                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-700">
                                  {isFrench ? 'Aucune destination' : 'No destination'}
                                </span>
                              )}
                            </div>
                            <p className="mt-1 text-xs text-slate-500">
                              {getTelegramEventDescription(eventKey, isFrench)}
                            </p>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <TelegramRoutePill
                              label={isFrench ? "Groupe d'equipe" : 'Team group'}
                              active={teamGroupActive}
                              disabled={!canEdit || !eventEnabled}
                              onClick={() => setTeamGroupRoute(!teamGroupActive)}
                            />
                            <TelegramRoutePill
                              label={isFrench ? 'Chats staff directs' : 'Direct staff'}
                              active={currentRoute.personal === true}
                              disabled={!canEdit || !eventEnabled}
                              onClick={() => setRouteLane('personal', currentRoute.personal !== true)}
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          <div className="mt-5 rounded-[1.75rem] border border-slate-200 bg-white/80 p-5 shadow-sm">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="text-sm font-semibold text-slate-900">
                  {isFrench ? 'Santé et journal Telegram' : 'Telegram health and audit log'}
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  {isFrench
                    ? "Suivez ici les envois récents, les échecs, les alertes ignorées et le dernier signal de réussite."
                    : 'Track recent deliveries, failures, skipped alerts, and the latest successful send here.'}
                </p>
              </div>
              <button
                type="button"
                onClick={refreshTelegramAudit}
                disabled={!tenantIdentityReady || telegramAuditLoading}
                className={SECONDARY_BUTTON_CLASS}
              >
                {telegramAuditLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                {isFrench ? 'Actualiser le journal' : 'Refresh log'}
              </button>
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-4">
              {[
                { label: isFrench ? 'Envoyées' : 'Sent', value: telegramAuditSummary.sent, tone: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
                { label: isFrench ? 'Partielles' : 'Partial', value: telegramAuditSummary.partial, tone: 'text-amber-700 bg-amber-50 border-amber-200' },
                { label: isFrench ? 'Échecs' : 'Failed', value: telegramAuditSummary.failed, tone: 'text-rose-700 bg-rose-50 border-rose-200' },
                { label: isFrench ? 'Ignorées' : 'Skipped', value: telegramAuditSummary.skipped, tone: 'text-slate-700 bg-slate-50 border-slate-200' },
              ].map((item) => (
                <div key={item.label} className={`rounded-[1.5rem] border px-4 py-4 ${item.tone}`}>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em]">{item.label}</p>
                  <p className="mt-3 text-3xl font-semibold">{item.value}</p>
                </div>
              ))}
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <div className="rounded-[1.5rem] border border-emerald-200 bg-emerald-50/70 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">
                  {isFrench ? 'Dernier succès' : 'Latest success'}
                </p>
                <p className="mt-2 text-sm font-semibold text-slate-900">
                  {latestTelegramSuccess
                    ? `${String(latestTelegramSuccess?.metadata?.event_type || '').replace(/_/g, ' ')}`
                    : (isFrench ? 'Aucun envoi réussi encore' : 'No successful delivery yet')}
                </p>
                <p className="mt-1 text-sm text-slate-600">
                  {latestTelegramSuccess
                    ? formatTelegramAuditTime(latestTelegramSuccess.created_at)
                    : (isFrench ? 'Le premier envoi réussi apparaîtra ici.' : 'The first successful delivery will appear here.')}
                </p>
              </div>
              <div className="rounded-[1.5rem] border border-rose-200 bg-rose-50/70 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-rose-700">
                  {isFrench ? 'Dernier échec' : 'Latest failure'}
                </p>
                <p className="mt-2 text-sm font-semibold text-slate-900">
                  {latestTelegramFailure
                    ? `${String(latestTelegramFailure?.metadata?.event_type || '').replace(/_/g, ' ')}`
                    : (isFrench ? 'Aucun échec récent' : 'No recent failure')}
                </p>
                <p className="mt-1 text-sm text-slate-600">
                  {latestTelegramFailure
                    ? (latestTelegramFailure?.metadata?.error || formatTelegramAuditTime(latestTelegramFailure.created_at))
                    : (isFrench ? 'Les erreurs Telegram récentes apparaîtront ici.' : 'Recent Telegram errors will appear here.')}
                </p>
              </div>
            </div>

            <div className="mt-4 max-h-[30rem] space-y-3 overflow-y-auto pr-1">
              {telegramAuditLoading ? (
                <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-500">
                  {isFrench ? 'Chargement du journal Telegram...' : 'Loading Telegram log...'}
                </div>
              ) : telegramAuditItems.length === 0 ? (
                <div className="rounded-[1.5rem] border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-500">
                  {isFrench ? 'Aucun événement Telegram récent pour ce tenant.' : 'No recent Telegram events for this tenant yet.'}
                </div>
              ) : telegramAuditItems.map((item) => {
                const action = String(item?.action || '').trim().toLowerCase();
                const tone =
                  action === 'telegram_alert_sent'
                    ? 'border-emerald-200 bg-emerald-50/60'
                    : action === 'telegram_alert_partial_failure'
                      ? 'border-amber-200 bg-amber-50/70'
                      : action === 'telegram_alert_failed'
                        ? 'border-rose-200 bg-rose-50/70'
                        : 'border-slate-200 bg-slate-50/80';

                return (
                  <div key={item.id} className={`rounded-[1.5rem] border px-4 py-4 ${tone}`}>
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">
                          {String(item?.metadata?.event_type || 'telegram').replace(/_/g, ' ')}
                        </p>
                        <p className="mt-1 text-xs font-medium uppercase tracking-[0.18em] text-slate-500">
                          {action.replace(/_/g, ' ')}
                        </p>
                        <p className="mt-2 text-sm text-slate-600">
                          {item?.metadata?.rental_reference
                            ? `${isFrench ? 'Location' : 'Rental'}: ${item.metadata.rental_reference}`
                            : (isFrench ? 'Référence location indisponible' : 'Rental reference unavailable')}
                        </p>
                        {item?.metadata?.error ? (
                          <p className="mt-1 text-sm text-rose-700">{item.metadata.error}</p>
                        ) : null}
                      </div>
                      <div className="text-sm text-slate-500">
                        {formatTelegramAuditTime(item.created_at)}
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-600">
                      {typeof item?.metadata?.sent_count === 'number' ? (
                        <span className="rounded-full bg-white px-3 py-1 shadow-sm">{isFrench ? 'Envoyés' : 'Sent'}: {item.metadata.sent_count}</span>
                      ) : null}
                      {typeof item?.metadata?.failed_count === 'number' ? (
                        <span className="rounded-full bg-white px-3 py-1 shadow-sm">{isFrench ? 'Échecs' : 'Failed'}: {item.metadata.failed_count}</span>
                      ) : null}
                      {typeof item?.metadata?.eligible_user_count === 'number' ? (
                        <span className="rounded-full bg-white px-3 py-1 shadow-sm">{isFrench ? 'Staff éligible' : 'Eligible staff'}: {item.metadata.eligible_user_count}</span>
                      ) : null}
                      {item?.metadata?.reason ? (
                        <span className="rounded-full bg-white px-3 py-1 shadow-sm">{isFrench ? 'Raison' : 'Reason'}: {item.metadata.reason}</span>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
          <div className="grid gap-5 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">{isFrench ? 'Rappel de réservation (heures avant)' : 'Booking Reminder (hours before)'}</label>
              <input
                type="number"
                min="0"
                className={FIELD_CLASS}
                value={notificationsForm.bookingReminderHours}
                disabled={!canEdit}
                onChange={(e) => setNotificationsForm((current) => ({ ...current, bookingReminderHours: e.target.value }))}
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">{isFrench ? 'Rappel de retour (heures avant)' : 'Return Reminder (hours before)'}</label>
              <input
                type="number"
                min="0"
                className={FIELD_CLASS}
                value={notificationsForm.returnReminderHours}
                disabled={!canEdit}
                onChange={(e) => setNotificationsForm((current) => ({ ...current, returnReminderHours: e.target.value }))}
              />
            </div>
            <div className="md:col-span-2 rounded-[1.75rem] border border-violet-200/70 bg-gradient-to-r from-violet-50/90 to-indigo-50/80 p-5">
              <p className="text-sm font-semibold text-slate-900">{isFrench ? 'Canaux de diffusion' : 'Delivery Channels'}</p>
              <p className="mt-2 text-sm text-slate-500">
                {isFrench ? "Définissez les canaux par défaut que l'équipe opérationnelle utilisera pour les rappels et alertes." : 'Set the default channels the operations team expects to use for reminders and alerts.'}
              </p>
            </div>
          </div>
          <div className="space-y-4">
            <ToggleCard
              title={isFrench ? 'Flux de contact WhatsApp' : 'WhatsApp Contact Flow'}
              description={isFrench ? 'Fait de WhatsApp le canal de communication préféré dans les flux admin.' : 'Makes WhatsApp the preferred communication channel in admin workflows.'}
              checked={notificationsForm.whatsappEnabled}
              disabled={!canEdit}
              onChange={(value) => setNotificationsForm((current) => ({ ...current, whatsappEnabled: value }))}
            />
            <ToggleCard
              title={isFrench ? 'Alertes de retard' : 'Overdue Alerts'}
              description={isFrench ? "Notifier l'équipe lorsqu'une location ou un tour dépasse son heure de retour prévue." : 'Notify the team when a rental or tour passes its planned return time.'}
              checked={notificationsForm.notifyOnOverdue}
              disabled={!canEdit}
              onChange={(value) => setNotificationsForm((current) => ({ ...current, notifyOnOverdue: value }))}
            />
            <ToggleCard
              title={isFrench ? 'Alertes maintenance' : 'Maintenance Alerts'}
              description={isFrench ? "Notifier l'équipe lorsque les seuils d'inspection ou de maintenance sont atteints." : 'Notify staff when inspection or maintenance thresholds are triggered.'}
              checked={notificationsForm.notifyOnMaintenance}
              disabled={!canEdit}
              onChange={(value) => setNotificationsForm((current) => ({ ...current, notifyOnMaintenance: value }))}
            />
          </div>
        </div>
      </div>
    </SectionCard>
  );

  const renderSecurity = () => (
    <SectionCard
      title={isFrench ? 'Sécurité et accès' : 'Security & Access'}
      description={isFrench ? "Politiques d'accès administrateur, durée des sessions, audit et protections des flux sensibles." : 'Administrative access policies, session timing, audit behavior, and sensitive workflow protections.'}
      action={
        <button
          type="button"
          onClick={handleSecuritySave}
          disabled={!canEdit || savingSection === 'Security & access'}
          className={PRIMARY_BUTTON_CLASS}
        >
          {savingSection === 'Security & access' ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {isFrench ? 'Enregistrer la sécurité' : 'Save Security'}
        </button>
      }
    >
      <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <div>
          <label className="mb-2 block text-sm font-medium text-slate-700">{isFrench ? 'Expiration de session (minutes)' : 'Session Timeout (minutes)'}</label>
          <input
            type="number"
            min="5"
            className={FIELD_CLASS}
            value={securityForm.sessionTimeoutMinutes}
            disabled={!canEdit}
            onChange={(e) => setSecurityForm((current) => ({ ...current, sessionTimeoutMinutes: e.target.value }))}
          />
          <div className="mt-4 rounded-[1.75rem] border border-violet-200/70 bg-gradient-to-r from-violet-50/90 to-indigo-50/80 p-5">
            <p className="text-sm font-semibold text-slate-900">{isFrench ? "Notes sur la politique d'accès" : 'Access Policy Notes'}</p>
            <p className="mt-2 text-sm text-slate-500">
              {isFrench ? "Ces contrôles définissent la politique administrative par défaut. Le reste de l'application peut les adopter progressivement comme source de vérité centrale." : 'These controls establish the administrative default policy. The rest of the app can gradually adopt them as the central source of truth.'}
            </p>
          </div>
          <div className="mt-4">
            <label className="mb-2 block text-sm font-medium text-slate-700">{isFrench ? 'Suppression tenant après suspension (jours)' : 'Tenant Deletion After Suspension (days)'}</label>
            <input
              type="number"
              min="1"
              max="365"
              className={FIELD_CLASS}
              value={securityForm.tenantDeletionRetentionDays}
              disabled={!canEditTenantLifecycle}
              onChange={(e) => setSecurityForm((current) => ({ ...current, tenantDeletionRetentionDays: e.target.value }))}
            />
            <p className="mt-2 text-sm text-slate-500">
              {isFrench
                ? "Définit combien de jours DriveOut conserve un tenant suspendu après expiration/annulation avant de programmer son archivage définitif. Visible aux admins, modifiable seulement par le owner."
                : 'Defines how many days DriveOut keeps a suspended tenant after expiry/cancellation before scheduling final archival. Visible to admins, editable only by the owner.'}
            </p>
          </div>
        </div>
        <div className="space-y-4">
          <ToggleCard
            title={isFrench ? 'Exiger la 2FA pour les admins' : 'Require 2FA For Admins'}
            description={isFrench ? 'Politique cible pour les connexions owner/admin et les changements sensibles.' : 'Target policy for owner/admin logins and sensitive settings changes.'}
            checked={securityForm.requireTwoFactorForAdmins}
            disabled={!canEdit}
            onChange={(value) => setSecurityForm((current) => ({ ...current, requireTwoFactorForAdmins: value }))}
          />
          <ToggleCard
            title={isFrench ? 'Autoriser la modification des packages par les employés' : 'Allow Employee Package Edits'}
            description={isFrench ? 'Si désactivé, les employés restent en lecture seule pour la gestion des packages et les changements liés aux paramètres.' : 'If disabled, employees stay read-only for package management and settings-adjacent package changes.'}
            checked={securityForm.allowEmployeePackageEdits}
            disabled={!canEdit}
            onChange={(value) => setSecurityForm((current) => ({ ...current, allowEmployeePackageEdits: value }))}
          />
          <ToggleCard
            title={isFrench ? 'Autoriser la consultation des paramètres par les employés' : 'Allow Employee Settings View'}
            description={isFrench ? 'Permet aux employés d’ouvrir les paramètres système en lecture seule pour référence opérationnelle.' : 'Lets employees open system settings in read-only mode for operational reference.'}
            checked={securityForm.allowEmployeeSettingsView}
            disabled={!canEdit}
            onChange={(value) => setSecurityForm((current) => ({ ...current, allowEmployeeSettingsView: value }))}
          />
          <ToggleCard
            title={isFrench ? "Écrire les journaux d'audit" : 'Write Audit Logs'}
            description={isFrench ? "Conserver les changements admin et les modifications sensibles dans la piste d'audit." : 'Keep admin changes and sensitive workflow changes attached to the audit trail.'}
            checked={securityForm.writeAuditLogs}
            disabled={!canEdit}
            onChange={(value) => setSecurityForm((current) => ({ ...current, writeAuditLogs: value }))}
          />
          <ToggleCard
            title={isFrench ? 'Autoriser la relance du suivi en direct' : 'Allow Live Tracking Retry'}
            description={isFrench ? "Contrôle si les guides peuvent redemander l'autorisation de localisation après l'avoir refusée une fois." : 'Controls whether guides can re-trigger location permission after dismissing it once.'}
            checked={securityForm.allowLiveTrackingRetry}
            disabled={!canEdit}
            onChange={(value) => setSecurityForm((current) => ({ ...current, allowLiveTrackingRetry: value }))}
          />
          <ToggleCard
            title={isFrench ? "Auto-envoyer le contrat par e-mail après création" : 'Auto-send contract email after creation'}
            description={isFrench ? "Désactivé par défaut. Si activé, l'e-mail du contrat part dès que la signature du contrat est finalisée. L'envoi manuel reste toujours disponible." : 'Off by default. If enabled, the contract email sends as soon as contract signing is completed. Manual send always stays available.'}
            checked={securityForm.autoSendContractEmailAfterCreation}
            disabled={!canEdit}
            onChange={(value) => setSecurityForm((current) => ({ ...current, autoSendContractEmailAfterCreation: value }))}
          />
        </div>
      </div>
    </SectionCard>
  );

  const renderMessaging = () => (
    <SectionCard
      title={isFrench ? 'Messagerie' : 'Messaging'}
      description={isFrench ? "Règles système pour la messagerie rapide entre staff, admins, owners et clients. Définissez ici les garde-fous avant d'activer le partage photo." : 'System rules for fast messaging between staff, admins, owners, and customers. Define the guardrails here before enabling photo sharing.'}
      action={
        <button
          type="button"
          onClick={handleMessagingSave}
          disabled={!canEdit || savingSection === 'Messaging'}
          className={PRIMARY_BUTTON_CLASS}
        >
          {savingSection === 'Messaging' ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {isFrench ? 'Enregistrer la messagerie' : 'Save Messaging'}
        </button>
      }
    >
      <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <div className="space-y-5">
          <div className="grid gap-5 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">{isFrench ? 'Photos max par message' : 'Max Photos Per Message'}</label>
              <input
                type="number"
                min="1"
                max="10"
                className={FIELD_CLASS}
                value={messagingForm.messagingMaxPhotosPerMessage}
                disabled={!canEdit}
                onChange={(e) => setMessagingForm((current) => ({ ...current, messagingMaxPhotosPerMessage: e.target.value }))}
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">{isFrench ? 'Conservation photo (jours)' : 'Photo Retention (days)'}</label>
              <input
                type="number"
                min="1"
                max="30"
                className={FIELD_CLASS}
                value={messagingForm.messagingPhotoRetentionDays}
                disabled={!canEdit}
                onChange={(e) => setMessagingForm((current) => ({ ...current, messagingPhotoRetentionDays: e.target.value }))}
              />
            </div>
            <div className="md:col-span-2">
              <label className="mb-2 block text-sm font-medium text-slate-700">{isFrench ? 'Expiration des brouillons (heures)' : 'Draft Expiry (hours)'}</label>
              <input
                type="number"
                min="1"
                max="168"
                className={FIELD_CLASS}
                value={messagingForm.messagingDraftRetentionHours}
                disabled={!canEdit}
                onChange={(e) => setMessagingForm((current) => ({ ...current, messagingDraftRetentionHours: e.target.value }))}
              />
            </div>
          </div>

          <div className="rounded-[1.75rem] border border-violet-200/70 bg-gradient-to-r from-violet-50/90 to-indigo-50/80 p-5">
            <p className="text-sm font-semibold text-slate-900">{isFrench ? 'Politique recommandée' : 'Recommended Policy'}</p>
            <div className="mt-3 space-y-2 text-sm text-slate-600">
              <p>{isFrench ? 'Utilisez les photos seulement pour partager rapidement une information opérationnelle.' : 'Use photos only for quick operational information sharing.'}</p>
              <p>{isFrench ? 'Conservez les textes plus longtemps, mais laissez les médias expirer rapidement pour limiter le coût de stockage.' : 'Keep text longer, but let media expire quickly to keep storage costs low.'}</p>
              <p>{isFrench ? 'Commencez avec 1 à 3 photos max par message pour rester simple et léger.' : 'Start with 1 to 3 photos max per message to keep the experience simple and light.'}</p>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <ToggleCard
            title={isFrench ? 'Activer le partage photo' : 'Enable Photo Sharing'}
            description={isFrench ? "Permet aux utilisateurs d'envoyer des photos depuis l'album ou la caméra dans les threads pris en charge." : 'Lets users send photos from album or camera in supported threads.'}
            checked={messagingForm.messagingPhotoSharingEnabled}
            disabled={!canEdit}
            onChange={(value) => setMessagingForm((current) => ({ ...current, messagingPhotoSharingEnabled: value }))}
          />
          <ToggleCard
            title={isFrench ? 'Autoriser la caméra' : 'Allow Camera Capture'}
            description={isFrench ? "Laisse l'utilisateur prendre une photo directement depuis le chat, en plus de l'album." : 'Lets the user take a photo directly from chat in addition to choosing from the album.'}
            checked={messagingForm.messagingAllowCameraCapture}
            disabled={!canEdit}
            onChange={(value) => setMessagingForm((current) => ({ ...current, messagingAllowCameraCapture: value }))}
          />
          <div className="rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-semibold text-slate-900">{isFrench ? 'Ce que ce réglage couvre maintenant' : 'What This Covers Right Now'}</p>
            <div className="mt-3 space-y-2 text-sm text-slate-500">
              <p>{isFrench ? 'Activation et limites du futur partage photo dans Messenger.' : 'Enablement and limits for upcoming photo sharing inside Messenger.'}</p>
              <p>{isFrench ? 'Fenêtre de suppression automatique des médias de chat.' : 'Auto-delete window for chat media.'}</p>
              <p>{isFrench ? 'Durée de vie des brouillons avant nettoyage.' : 'Draft lifetime before cleanup.'}</p>
            </div>
          </div>
        </div>
      </div>
    </SectionCard>
  );

  const renderContent = () => {
    switch (activeTab) {
      case 'business':
        return renderBusiness();
      case 'operations':
        return renderOperations();
      case 'rentalRules':
        return renderRentalRules();
      case 'finance':
        return renderFinance();
      case 'notifications':
        return renderNotifications();
      case 'messaging':
        return renderMessaging();
      case 'security':
        return renderSecurity();
      case 'overview':
      default:
        return renderOverview();
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <AdminModuleHero
        icon={<Settings2 className="h-8 w-8 text-white" />}
        eyebrow={null}
        title={isFrench ? 'Paramètres système' : 'System Settings'}
        description={isFrench ? "Pilotez tout le système admin depuis un seul endroit." : 'Control the whole admin system from one place.'}
        className="w-full"
        actions={
          <button
            type="button"
            onClick={loadSettingsHub}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition-all duration-200 hover:border-violet-200 hover:text-violet-700 disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            {isFrench ? 'Actualiser les paramètres' : 'Refresh Settings'}
          </button>
        }
      />

      <div className="space-y-6 p-4 lg:p-6">
      <div className="rounded-[2rem] border border-slate-200 bg-white shadow-[0_24px_60px_rgba(15,23,42,0.06)]">
        <div className="border-b border-violet-100 bg-gradient-to-r from-violet-50/80 via-white to-indigo-50/70 px-4 py-4 sm:px-6">
          <div className="flex flex-wrap gap-3">
            {tabs.map((item) => {
              const Icon = item.icon;
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  className={`inline-flex items-center gap-2 rounded-2xl border px-4 py-2.5 text-sm font-semibold transition-all duration-200 ${
                    active
                      ? 'border-violet-200 bg-gradient-to-r from-violet-600 to-indigo-700 text-white shadow-[0_14px_28px_rgba(79,70,229,0.18)]'
                      : 'border-slate-200 bg-white text-slate-600 hover:border-violet-200 hover:bg-violet-50 hover:text-violet-700'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="px-4 py-6 sm:px-6">
          {loading && !suppressBlockingLoader ? (
            <AdminWorkspaceLoadingShell eyebrow={isFrench ? 'Paramètres système' : 'System Settings'} title={isFrench ? 'Paramètres système' : 'System Settings'} description={isFrench ? 'Préparation de l’espace paramètres système...' : 'Preparing the system settings workspace...'} cardRows={1} />
          ) : (
            renderContent()
          )}
        </div>
      </div>
      </div>
    </div>
  );
};

export default SettingsPage;
