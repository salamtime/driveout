import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Building2, CheckCircle2, ChevronLeft, Clock3, ExternalLink, RefreshCw, Search, ShieldAlert, ShieldCheck, UserRound } from 'lucide-react';
import { toast } from 'sonner';
import AdminModuleHero from '../../components/admin/AdminModuleHero';
import AdminMobileStatsRow from '../../components/admin/AdminMobileStatsRow';
import { useAuth } from '../../contexts/AuthContext';
import { PLATFORM_OWNER_EMAILS } from '../../utils/accountType';
import { buildHostUrl, getHostContext } from '../../utils/hostContext';
import {
  applyTenantSchemaUpgrade,
  completeTenantProvisioning,
  createTenantAuditEvent,
  failTenantProvisioning,
  getTenantSchemaDrift,
  listTenants,
  listTenantAuditLog,
  planTenantSchemaUpgrade,
  reactivateTenant,
  startTenantProvisioning,
  suspendTenant,
  updateTenantControls,
  verifyTenantSchemaRelease,
  verifyTenantRuntimeIntegrity,
} from '../../services/TenantProvisioningService';
import i18n from '../../i18n';
import {
  TENANT_FEATURE_KEYS,
  TENANT_PLAN_ORDER,
  buildEffectiveTenantFeatureAccess,
  getTenantPlanLimits,
  normalizeTenantPlanType,
} from '../../config/tenantPlans';
import { isTenantModuleEnabled } from '../../utils/tenantFeatureAccess';

const statusTone = {
  pending: 'border-amber-200 bg-amber-50 text-amber-700',
  provisioning: 'border-violet-200 bg-violet-50 text-violet-700',
  active: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  failed: 'border-rose-200 bg-rose-50 text-rose-700',
  suspended: 'border-slate-300 bg-slate-100 text-slate-700',
  archived: 'border-slate-300 bg-slate-100 text-slate-700',
};

const WORKSPACE_DETAIL_TAB_IDS = ['overview', 'owner_identity', 'audit', 'feature_access', 'upgrades'];
const TENANCY_MODE_OPTIONS = ['shared', 'dedicated'];

const formatDate = (value) => {
  if (!value) return '—';
  return new Date(value).toLocaleDateString();
};

const formatDateTime = (value) => {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '—';
  return parsed.toLocaleString();
};

const normalizeUrl = (value) => {
  const trimmed = String(value || '').trim();
  if (!trimmed) return '';
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
};

const formatTenancyModeLabel = (mode, tr) => {
  const normalized = String(mode || '').trim().toLowerCase();
  if (normalized === 'dedicated') {
    return tr('Dedicated', 'Dédié');
  }
  return tr('Shared', 'Partagé');
};

const getProjectRefFromSupabaseUrl = (value) => {
  const normalizedUrl = normalizeUrl(value);
  if (!normalizedUrl) return '';

  try {
    const hostname = new URL(normalizedUrl).hostname.toLowerCase();
    return hostname.endsWith('.supabase.co') ? (hostname.split('.')[0] || '') : '';
  } catch {
    return '';
  }
};

const LOCAL_FIRST_PARTY_SUPABASE_URL = normalizeUrl(import.meta.env.VITE_SUPABASE_URL || '');
const LOCAL_FIRST_PARTY_SUPABASE_ANON_KEY = String(import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();
const LOCAL_FIRST_PARTY_PROJECT_REF = getProjectRefFromSupabaseUrl(LOCAL_FIRST_PARTY_SUPABASE_URL);

const buildWorkspaceAccessUrls = (tenant = {}) => {
  const storefrontUrl = normalizeUrl(tenant?.tenant_app_url || '');
  const workspaceUrl = storefrontUrl ? `${storefrontUrl.replace(/\/$/, '')}/admin` : '';

  return {
    storefrontUrl,
    workspaceUrl,
  };
};

const DEFAULT_PLAN_LIMITS = {
  vehicles: 0,
  staff: 0,
  listings: 0,
  storage_gb: 0,
};

const TENANT_WORKSPACE_NAVIGATION_ITEMS = Object.freeze([
  { id: 'dashboard', permission: 'Dashboard' },
  { id: 'calendar', permission: 'Calendar' },
  { id: 'tours', permission: 'Tours & Bookings' },
  { id: 'live-map', permission: 'Live Map' },
  { id: 'rentals', permission: 'Rental Management' },
  { id: 'customers', permission: 'Customer Management' },
  { id: 'fleet', permission: 'Fleet Management' },
  { id: 'pricing', permission: 'Pricing Management' },
  { id: 'maintenance', permission: 'Quad Maintenance' },
  { id: 'fuel', permission: 'Fuel Logs' },
  { id: 'inventory', permission: 'Inventory' },
  { id: 'finance', permission: 'Finance Management' },
  { id: 'alerts', permission: 'Alerts' },
  { id: 'users', permission: 'User & Role Management' },
  { id: 'verification', permission: 'Verification Center' },
  { id: 'messages', permission: 'Messages' },
  { id: 'marketplace', permission: 'Marketplace Review' },
  { id: 'settings', permission: 'System Settings' },
  { id: 'website', permission: 'System Settings', featureKey: 'website_editor' },
  { id: 'export', permission: 'Project Export' },
]);

const buildTenantWorkspaceModuleAccessSummary = ({ planType = 'starter', featureAccess = {} }) => {
  const normalizedPlanType = normalizeTenantPlanType(planType);
  const effectiveFeatureAccess = buildEffectiveTenantFeatureAccess(normalizedPlanType, featureAccess);
  const eligibleItems = TENANT_WORKSPACE_NAVIGATION_ITEMS.filter((item) => {
    if (item.featureKey && effectiveFeatureAccess[item.featureKey] !== true) {
      return false;
    }
    return true;
  });
  const enabledItems = eligibleItems.filter((item) => (
    isTenantModuleEnabled(item.permission, effectiveFeatureAccess, normalizedPlanType)
  ));

  return {
    enabledCount: enabledItems.length,
    eligibleCount: eligibleItems.length,
    featureCount: Object.values(effectiveFeatureAccess).filter(Boolean).length,
  };
};

const FEATURE_ACCESS_KEYS = TENANT_FEATURE_KEYS;

const FEATURE_UPGRADE_RULES = {
  dashboard_basic: { category: 'core', minPlan: 'free' },
  calendar_module: { category: 'starter', minPlan: 'starter' },
  rentals_basic: { category: 'core', minPlan: 'free' },
  fleet_basic: { category: 'core', minPlan: 'free' },
  customers_basic: { category: 'core', minPlan: 'free' },
  documents_basic: { category: 'core', minPlan: 'free' },
  tours_module: { category: 'growth', minPlan: 'growth' },
  tasks_module: { category: 'growth', minPlan: 'growth' },
  live_map_module: { category: 'growth', minPlan: 'growth' },
  inventory_module: { category: 'growth', minPlan: 'growth' },
  alerts_module: { category: 'starter', minPlan: 'starter' },
  verification_module: { category: 'starter', minPlan: 'starter' },
  workspace_settings_module: { category: 'starter', minPlan: 'starter' },
  pricing_module: { category: 'core', minPlan: 'free' },
  fuel_module: { category: 'growth', minPlan: 'growth' },
  maintenance_module: { category: 'growth', minPlan: 'growth' },
  messages_module: { category: 'starter', minPlan: 'starter' },
  website_editor: { category: 'pro', minPlan: 'pro' },
  advanced_roles_permissions: { category: 'pro', minPlan: 'pro' },
  public_storefront: { category: 'core', minPlan: 'starter' },
  online_booking: { category: 'starter', minPlan: 'starter' },
  finance_module: { category: 'growth', minPlan: 'growth' },
  marketplace_module: { category: 'growth', minPlan: 'growth' },
  pricing_km_packages: { category: 'growth', minPlan: 'growth' },
  pricing_tier_rules: { category: 'growth', minPlan: 'growth' },
  pricing_fuel_rules: { category: 'growth', minPlan: 'growth' },
  ocr_id_scan: { category: 'addon', minPlan: 'growth' },
  whatsapp_tools: { category: 'addon', minPlan: 'growth' },
  advanced_reporting: { category: 'pro', minPlan: 'pro' },
  multilingual_storefront: { category: 'pro', minPlan: 'pro' },
};

const normalizeEmail = (value) => String(value || '').trim().toLowerCase();

const resolveWorkspaceRelationship = (entry = {}, currentUser = null, activeTenantSession = null) => {
  const businessAccount = entry?.business_account || {};
  const tenant = entry?.tenant || {};
  const currentUserId = String(currentUser?.id || '').trim();
  const currentUserEmail = normalizeEmail(currentUser?.email);
  const ownerUserId = String(tenant?.owner_user_id || businessAccount?.auth_user_id || '').trim();
  const ownerEmail = normalizeEmail(businessAccount?.email);
  const activeTenantId = String(activeTenantSession?.tenant?.id || activeTenantSession?.tenantId || '').trim();
  const activeTenantSlug = String(activeTenantSession?.tenant?.tenant_slug || activeTenantSession?.tenantSlug || '').trim().toLowerCase();
  const rowTenantId = String(tenant?.id || '').trim();
  const rowTenantSlug = String(tenant?.tenant_slug || '').trim().toLowerCase();
  const isTenantOwner = Boolean(
    (currentUserId && ownerUserId && currentUserId === ownerUserId) ||
    (currentUserEmail && ownerEmail && currentUserEmail === ownerEmail)
  );
  const isCurrentTenant = Boolean(
    (activeTenantId && rowTenantId && activeTenantId === rowTenantId) ||
    (activeTenantSlug && rowTenantSlug && activeTenantSlug === rowTenantSlug)
  );

  return {
    isTenantOwner,
    isCurrentTenant,
    label: isTenantOwner
      ? (isCurrentTenant ? 'signed_in_owner' : 'tenant_owner')
      : 'platform_admin',
  };
};

const buildWorkspaceRows = (businessOwners = [], currentUser = null, activeTenantSession = null) => businessOwners.map((entry) => {
  const businessAccount = entry?.business_account || {};
  const tenant = entry?.tenant || {};
  const provisioningJob = entry?.provisioning_job || {};
  const latestSchemaJob = entry?.latest_schema_job || null;
  const status = String(tenant?.tenant_status || (tenant?.id ? 'provisioning' : 'pending')).toLowerCase();
  const relationship = resolveWorkspaceRelationship(entry, currentUser, activeTenantSession);

  return {
    id: tenant?.id || businessAccount?.id,
    businessAccount,
    tenant,
    subscription: entry?.subscription || {},
    provisioningJob,
    latestSchemaJob,
    ownerName: businessAccount?.full_name || businessAccount?.email || 'Business owner',
    ownerEmail: businessAccount?.email || '',
    name: tenant?.tenant_name || businessAccount?.company_name || businessAccount?.full_name || businessAccount?.email || 'Tenant',
    slug: tenant?.tenant_slug || '',
    status,
    createdAt: tenant?.created_at || businessAccount?.created_at,
    relationship,
  };
}).filter((row) => row.id);

const appendFirstPartyTenantFallback = ({ rows = [], currentUser = null, activeTenantSession = null, hostContext = {}, userProfile = null }) => {
  const normalizedEmail = normalizeEmail(currentUser?.email);
  const shouldInjectFallback = (
    hostContext?.isLocal
    && PLATFORM_OWNER_EMAILS.has(normalizedEmail)
    && !rows.some((row) => String(row?.slug || '').trim().toLowerCase() === 'saharax')
  );

  if (!shouldInjectFallback) return rows;

  const fallbackEntry = {
    business_account: {
      id: 'first-party-saharax-account',
      auth_user_id: currentUser?.id || '',
      full_name: userProfile?.full_name || userProfile?.name || currentUser?.email || 'SaharaX Owner',
      email: currentUser?.email || '',
      company_name: 'SaharaX',
      account_type: 'business_owner',
      application_status: 'approved',
      approval_status: 'approved',
      approved_at: new Date().toISOString(),
      metadata: {
        source: 'first_party_local_fallback',
      },
    },
    subscription: {
      id: 'first-party-saharax-subscription',
      business_account_id: 'first-party-saharax-account',
      plan_type: 'pro',
      subscription_status: 'active',
      billing_status: 'active',
      plan_limits: getTenantPlanLimits('pro'),
      metadata: {
        source: 'first_party_local_fallback',
      },
    },
    tenant: {
      id: 'first-party-saharax',
      business_account_id: 'first-party-saharax-account',
      owner_user_id: currentUser?.id || '',
      tenant_key: 'tenant_first_party_saharax',
      tenant_name: 'SaharaX',
      tenant_slug: 'saharax',
      tenant_status: 'active',
      db_provider: 'supabase',
      tenant_project_ref: LOCAL_FIRST_PARTY_PROJECT_REF,
      tenant_api_url: LOCAL_FIRST_PARTY_SUPABASE_URL,
      tenant_anon_key: LOCAL_FIRST_PARTY_SUPABASE_ANON_KEY,
      schema_version: 'saharax_0u4w4d',
      tenant_app_url: 'https://saharax.driveout.io',
      provisioned_at: new Date().toISOString(),
      metadata: {
        source: 'first_party_local_fallback',
        first_party: true,
      },
    },
    provisioning_job: {
      id: 'first-party-saharax-job',
      business_account_id: 'first-party-saharax-account',
      tenant_id: 'first-party-saharax',
      job_type: 'create_tenant',
      job_status: 'completed',
      payload: {
        source: 'first_party_local_fallback',
      },
      result: {
        tenant_id: 'first-party-saharax',
      },
    },
    latest_schema_job: null,
  };

  return [
    buildWorkspaceRows([fallbackEntry], currentUser, activeTenantSession)[0],
    ...rows,
  ].filter(Boolean);
};

const WorkspaceStatusBadge = ({ status }) => (
  <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] ${statusTone[status] || statusTone.pending}`}>
    {status || 'pending'}
  </span>
);

const workspacePlanToneMap = {
  free: {
    badge: 'border-slate-200 bg-slate-50 text-slate-700',
    button: 'bg-slate-700 text-white hover:bg-slate-800',
    outlineButton: 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100',
  },
  starter: {
    badge: 'border-blue-200 bg-blue-50 text-blue-700',
    button: 'bg-blue-600 text-white hover:bg-blue-700',
    outlineButton: 'border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100',
  },
  growth: {
    badge: 'border-violet-200 bg-violet-50 text-violet-700',
    button: 'bg-violet-600 text-white hover:bg-violet-700',
    outlineButton: 'border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100',
  },
  pro: {
    badge: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    button: 'bg-emerald-600 text-white hover:bg-emerald-700',
    outlineButton: 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100',
  },
};

const getWorkspacePlanTone = (planType = 'starter') => {
  const normalizedPlan = normalizeTenantPlanType(planType);
  return workspacePlanToneMap[normalizedPlan] || workspacePlanToneMap.starter;
};

const getWorkspacePlanButtonClass = (planType = 'starter', variant = 'solid') => {
  const tone = getWorkspacePlanTone(planType);
  const shared = 'inline-flex items-center justify-center rounded-2xl px-5 py-3 text-sm font-semibold transition disabled:opacity-60';
  if (variant === 'outline') {
    return `${shared} border ${tone.outlineButton}`;
  }
  return `${shared} ${tone.button}`;
};

const WorkspacePlanBadge = ({ planType = 'starter' }) => {
  const normalizedPlan = normalizeTenantPlanType(planType);
  const tone = getWorkspacePlanTone(normalizedPlan);

  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] ${tone.badge}`}>
      {normalizedPlan}
    </span>
  );
};

const getSchemaVerificationTone = (ok = null) => {
  if (ok === true) return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (ok === false) return 'border-amber-200 bg-amber-50 text-amber-700';
  return 'border-slate-200 bg-slate-50 text-slate-700';
};

const getSchemaVerificationLabel = (ok, tr) => {
  if (ok === true) return tr('Verified', 'Vérifié');
  if (ok === false) return tr('Needs review', 'À vérifier');
  return tr('Not verified', 'Non vérifié');
};

const getRuntimeVerificationTone = (ok = null) => {
  if (ok === true) return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (ok === false) return 'border-amber-200 bg-amber-50 text-amber-700';
  return 'border-slate-200 bg-slate-50 text-slate-700';
};

const getRuntimeVerificationLabel = (ok, tr) => {
  if (ok === true) return tr('Runtime healthy', 'Runtime sain');
  if (ok === false) return tr('Runtime needs review', 'Runtime à vérifier');
  return tr('Runtime not verified', 'Runtime non vérifié');
};

const formatSchemaReleaseLabel = (value = '') => {
  const normalized = String(value || '').trim();
  if (!normalized) return '';
  if (normalized.length <= 28) return normalized;
  return `${normalized.slice(0, 18)}...${normalized.slice(-6)}`;
};

const buildSchemaStatusSummary = (schemaState = {}, tr) => {
  if (schemaState.verificationOk === true) {
    return {
      label: tr('Up to date', 'À jour'),
      tone: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    };
  }

  const drift = schemaState.drift?.drift || schemaState.drift || {};
  const blockingIssueCount = Array.isArray(schemaState.verification?.blockingIssues)
    ? schemaState.verification.blockingIssues.length
    : 0;
  const driftSignals = [
    Number(drift.missingTableCount || 0),
    Number(drift.missingColumnCount || 0),
    Number(drift.mismatchedColumnCount || 0),
    Number(drift.missingForeignKeyCount || 0),
  ].reduce((sum, value) => sum + value, 0);

  if (blockingIssueCount > 0 || driftSignals > 0 || schemaState.verificationOk === false) {
    return {
      label: tr('Drift detected', 'Drift détecté'),
      tone: 'border-amber-200 bg-amber-50 text-amber-700',
    };
  }

  return {
    label: tr('Needs verify', 'À vérifier'),
    tone: 'border-slate-200 bg-slate-50 text-slate-700',
  };
};

const buildRuntimeStatusSummary = (schemaState = {}, tr) => {
  if (schemaState.runtimeVerificationOk === true) {
    return {
      label: tr('Runtime ready', 'Runtime prêt'),
      tone: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    };
  }

  if (schemaState.runtimeVerificationOk === false) {
    return {
      label: tr('Runtime issue', 'Problème runtime'),
      tone: 'border-amber-200 bg-amber-50 text-amber-700',
    };
  }

  return {
    label: tr('Runtime unverified', 'Runtime non vérifié'),
    tone: 'border-slate-200 bg-slate-50 text-slate-700',
  };
};

const getSchemaFilterKeyForRow = (row, tr) => {
  const schemaStatus = buildSchemaStatusSummary(buildSchemaWorkspaceState(row), tr);
  if (schemaStatus.label === tr('Up to date', 'À jour')) return 'up_to_date';
  if (schemaStatus.label === tr('Drift detected', 'Drift détecté')) return 'drift_detected';
  return 'needs_verify';
};

const buildSchemaWorkspaceState = (workspace = {}) => {
  const tenant = workspace?.tenant || {};
  const latestSchemaJob = workspace?.latestSchemaJob && typeof workspace.latestSchemaJob === 'object'
    ? workspace.latestSchemaJob
    : null;
  const metadata = tenant?.metadata && typeof tenant.metadata === 'object' ? tenant.metadata : {};
  const verification = metadata.schema_last_verification && typeof metadata.schema_last_verification === 'object'
    ? metadata.schema_last_verification
    : null;
  const drift = metadata.schema_last_drift && typeof metadata.schema_last_drift === 'object'
    ? metadata.schema_last_drift
    : verification;

  return {
    schemaVersion: String(tenant?.schema_version || '').trim() || 'v1',
    releaseId: String(metadata.schema_release_id || '').trim(),
    contractVersion: String(metadata.schema_contract_version || '').trim(),
    lastVerifiedAt: String(metadata.schema_last_verified_at || '').trim(),
    verificationOk: typeof metadata.schema_verification_ok === 'boolean' ? metadata.schema_verification_ok : null,
    verification,
    drift,
    latestJob: latestSchemaJob,
    runtimeLastVerifiedAt: String(metadata.runtime_last_verified_at || '').trim(),
    runtimeVerificationOk: typeof metadata.runtime_verification_ok === 'boolean' ? metadata.runtime_verification_ok : null,
    runtimeVerification: metadata.runtime_last_verification && typeof metadata.runtime_last_verification === 'object'
      ? metadata.runtime_last_verification
      : null,
  };
};

const getSchemaJobTypeLabel = (jobType = '', tr) => {
  switch (String(jobType || '').trim().toLowerCase()) {
    case 'schema_plan':
      return tr('Upgrade plan', 'Plan d’upgrade');
    case 'schema_upgrade':
      return tr('Upgrade apply', 'Application upgrade');
    case 'schema_verify':
      return tr('Release verify', 'Vérification release');
    case 'schema_drift':
      return tr('Drift review', 'Revue du drift');
    case 'schema_runtime':
      return tr('Runtime verify', 'Vérification runtime');
    default:
      return tr('Schema job', 'Job schéma');
  }
};

const getSchemaJobStatusTone = (status = '') => {
  const normalized = String(status || '').trim().toLowerCase();
  if (normalized === 'completed') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (normalized === 'failed') return 'border-rose-200 bg-rose-50 text-rose-700';
  if (normalized === 'running') return 'border-blue-200 bg-blue-50 text-blue-700';
  return 'border-slate-200 bg-slate-50 text-slate-700';
};

const getHealthSeverityTone = (severity = 'warning') => {
  if (severity === 'healthy') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (severity === 'critical') return 'border-rose-200 bg-rose-50 text-rose-700';
  return 'border-amber-200 bg-amber-50 text-amber-700';
};

const resolveSharedTenantOrganizationIdentity = (tenant = {}) => {
  const metadata = tenant?.metadata && typeof tenant.metadata === 'object' ? tenant.metadata : {};
  const sharedRuntime = metadata?.shared_runtime && typeof metadata.shared_runtime === 'object'
    ? metadata.shared_runtime
    : {};

  return {
    organizationId: String(
      tenant?.organization_id ||
      metadata.organization_id ||
      metadata.shared_organization_id ||
      sharedRuntime.organization_id ||
      ''
    ).trim(),
    organizationSlug: String(
      tenant?.organization_slug ||
      metadata.organization_slug ||
      metadata.shared_organization_slug ||
      sharedRuntime.organization_slug ||
      ''
    ).trim(),
  };
};

const buildTenantHealthReport = ({ workspace, controlsDraft, connectionDraft, storefrontUrl, workspaceUrl, tr, showOwnerLinkage = true, tenancyMode = 'shared' }) => {
  const tenant = workspace?.tenant || {};
  const job = workspace?.provisioningJob || {};
  const relationship = workspace?.relationship || {};
  const status = String(workspace?.status || 'pending').trim().toLowerCase();
  const normalizedTenancyMode = String(tenancyMode || 'shared').trim().toLowerCase() || 'shared';
  const isDedicated = normalizedTenancyMode === 'dedicated';
  const projectRef = String(connectionDraft?.tenant_project_ref || tenant?.tenant_project_ref || '').trim();
  const apiUrl = normalizeUrl(connectionDraft?.tenant_api_url || tenant?.tenant_api_url || '');
  const anonKey = String(connectionDraft?.tenant_anon_key || tenant?.tenant_anon_key || '').trim();
  const appUrl = normalizeUrl(connectionDraft?.tenant_app_url || tenant?.tenant_app_url || '');
  const schemaVersion = String(connectionDraft?.schema_version || tenant?.schema_version || '').trim();
  const { organizationId, organizationSlug } = resolveSharedTenantOrganizationIdentity(tenant);
  const provisioningError = String(tenant?.provisioning_error || job?.error_message || '').trim();
  const dispatch = tenant?.metadata?.provisioning_dispatch || {};
  const dispatchAttempted = Boolean(dispatch?.dispatched);
  const dispatchFailedAt = String(tenant?.metadata?.provisioning_dispatch_failed_at || '').trim();
  const startedAt = tenant?.provisioning_started_at || job?.started_at || '';
  const startedTs = startedAt ? new Date(startedAt).getTime() : NaN;
  const nowTs = Date.now();
  const provisioningAgeHours = Number.isFinite(startedTs) ? ((nowTs - startedTs) / (1000 * 60 * 60)) : null;
  const isStalledProvisioning = status === 'provisioning' && Number.isFinite(provisioningAgeHours) && provisioningAgeHours > 1;
  const blockedSubscription = ['expired', 'cancelled', 'suspended'].includes(String(controlsDraft?.subscription_status || '').trim().toLowerCase())
    || String(controlsDraft?.billing_status || '').trim().toLowerCase() === 'failed';

  const checks = [
    ...(isDedicated ? [{
      key: 'workspace_config',
      label: tr('Dedicated infrastructure', 'Infrastructure dédiée'),
      state: projectRef && apiUrl && anonKey && appUrl ? 'healthy' : (status === 'active' ? 'critical' : 'warning'),
      detail: projectRef && apiUrl && anonKey && appUrl
        ? tr('Project ref, API URL, anon key, and app URL are all present.', 'La référence projet, l’URL API, la clé anon et l’URL app sont toutes présentes.')
        : tr('One or more required dedicated workspace connection fields are missing.', 'Un ou plusieurs champs de connexion workspace dédiés sont manquants.'),
    }] : [{
      key: 'shared_runtime',
      label: tr('Shared runtime mapping', 'Mapping runtime partagé'),
      state: organizationId && organizationSlug ? 'healthy' : (status === 'active' ? 'critical' : 'warning'),
      detail: organizationId && organizationSlug
        ? tr('Organization identity is linked for this shared tenant runtime.', 'L’identité organisation est liée pour ce runtime tenant partagé.')
        : tr('Organization identity is still missing for this shared tenant runtime.', 'L’identité organisation manque encore pour ce runtime tenant partagé.'),
    }]),
    {
      key: 'dispatch',
      label: tr('Provisioning dispatch', 'Déclenchement provisionnement'),
      state: dispatchAttempted
        ? (dispatchFailedAt ? 'critical' : 'healthy')
        : (status === 'pending' ? 'warning' : 'healthy'),
      detail: dispatchAttempted
        ? (dispatchFailedAt
          ? tr('The automation dispatch failed and needs a retry.', 'Le déclenchement automatique a échoué et doit être relancé.')
          : tr('The provisioning worker was dispatched successfully.', 'Le worker de provisionnement a été déclenché avec succès.'))
        : tr('No provisioning dispatch has been recorded yet.', 'Aucun déclenchement de provisionnement n’a encore été enregistré.'),
    },
    {
      key: 'runtime_access',
      label: tr('Runtime access', 'Accès runtime'),
      state: appUrl && storefrontUrl && workspaceUrl ? 'healthy' : (status === 'active' ? 'critical' : 'warning'),
      detail: appUrl && storefrontUrl && workspaceUrl
        ? tr('Storefront and workspace URLs are available for this tenant.', 'Les URLs vitrine et workspace sont disponibles pour ce tenant.')
        : tr('Storefront or workspace URL is still missing.', 'L’URL vitrine ou workspace est encore manquante.'),
    },
    {
      key: 'schema_version',
      label: isDedicated ? tr('Schema version', 'Version schéma') : tr('Runtime version', 'Version runtime'),
      state: schemaVersion ? 'healthy' : 'warning',
      detail: schemaVersion
        ? tr(`Schema version recorded: ${schemaVersion}.`, `Version de schéma enregistrée : ${schemaVersion}.`)
        : tr('No schema version is saved yet.', 'Aucune version de schéma n’est encore enregistrée.'),
    },
    {
      key: 'commercial_state',
      label: tr('Commercial state', 'État commercial'),
      state: blockedSubscription ? 'critical' : 'healthy',
      detail: blockedSubscription
        ? tr('Subscription or billing status is blocking this tenant.', 'Le statut d’abonnement ou de facturation bloque ce tenant.')
        : tr('Subscription and billing state allow normal tenant access.', 'Le statut d’abonnement et de facturation autorise l’accès normal du tenant.'),
    },
  ];

  if (showOwnerLinkage) {
    checks.splice(4, 0, {
      key: 'owner_link',
      label: tr('Owner linkage', 'Lien propriétaire'),
      state: relationship?.isTenantOwner ? 'healthy' : 'warning',
      detail: relationship?.isTenantOwner
        ? tr('The signed-in platform owner is linked to this tenant.', 'Le propriétaire plateforme connecté est lié à ce tenant.')
        : tr('This tenant is managed from platform admin but is not linked to the signed-in owner.', 'Ce tenant est géré depuis l’admin plateforme mais n’est pas lié au propriétaire connecté.'),
    });
  }

  const criticalCount = checks.filter((item) => item.state === 'critical').length;
  const warningCount = checks.filter((item) => item.state === 'warning').length;
  const severity = criticalCount ? 'critical' : warningCount ? 'warning' : 'healthy';

  const recommendations = [];
  if (status === 'pending') {
    recommendations.push(
      isDedicated
        ? tr('Start automatic provisioning to create the isolated tenant workspace.', 'Démarrez le provisionnement automatique pour créer le workspace tenant isolé.')
        : tr('Start automatic provisioning to prepare the shared tenant runtime and owner organization.', 'Démarrez le provisionnement automatique pour préparer le runtime partagé et l’organisation propriétaire.')
    );
  }
  if (dispatchFailedAt) {
    recommendations.push(tr('Retry the automatic provisioning dispatch and confirm the worker webhook is configured.', 'Relancez le déclenchement automatique et confirmez que le webhook worker est configuré.'));
  }
  if (isStalledProvisioning) {
    recommendations.push(tr('Provisioning has been running for more than one hour. Review the latest job logs and either retry or fail the job explicitly.', 'Le provisionnement tourne depuis plus d’une heure. Vérifiez les derniers logs du job puis relancez-le ou marquez-le en échec.'));
  }
  if (isDedicated && status === 'active' && (!projectRef || !apiUrl || !anonKey || !appUrl)) {
    recommendations.push(tr('Complete the missing workspace connection fields before treating this tenant as fully live.', 'Complétez les champs de connexion workspace manquants avant de considérer ce tenant comme totalement en ligne.'));
  }
  if (!isDedicated && status === 'active' && (!organizationId || !organizationSlug)) {
    recommendations.push(tr('Resolve the missing organization mapping before treating this shared tenant as fully live.', 'Résolvez le mapping organisation manquant avant de considérer ce tenant partagé comme totalement en ligne.'));
  }
  if (provisioningError) {
    recommendations.push(tr(`Latest provisioning error: ${provisioningError}`, `Dernière erreur de provisionnement : ${provisioningError}`));
  }
  if (blockedSubscription) {
    recommendations.push(tr('Resolve the billing/subscription block before reopening tenant access.', 'Résolvez le blocage de facturation/abonnement avant de rouvrir l’accès tenant.'));
  }
  if (status === 'suspended') {
    recommendations.push(tr('Review why this tenant is suspended before reactivating it.', 'Vérifiez pourquoi ce tenant est suspendu avant de le réactiver.'));
  }

  if (!recommendations.length) {
    recommendations.push(tr('No blocking issues detected. This tenant looks operational from the registry side.', 'Aucun blocage détecté. Ce tenant semble opérationnel côté registre.'));
  }

  return {
    severity,
    checks,
    recommendations,
    summary: severity === 'healthy'
      ? tr('Healthy tenant workspace', 'Workspace tenant sain')
      : severity === 'critical'
        ? tr('Critical tenant issues detected', 'Problèmes critiques détectés')
        : tr('Tenant requires review', 'Tenant à vérifier'),
  };
};

const WorkspaceRelationshipBadge = ({ relationship }) => {
  const isFrench = i18n.resolvedLanguage === 'fr';
  const tr = (en, fr) => (isFrench ? fr : en);
  const key = relationship?.label || 'platform_admin';

  const labelMap = {
    signed_in_owner: tr('Signed in owner', 'Propriétaire connecté'),
    tenant_owner: tr('Tenant owner', 'Propriétaire du tenant'),
    platform_admin: tr('Platform admin only', 'Admin plateforme seulement'),
  };

  const toneMap = {
    signed_in_owner: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    tenant_owner: 'border-violet-200 bg-violet-50 text-violet-700',
    platform_admin: 'border-slate-200 bg-slate-100 text-slate-700',
  };

  const Icon = key === 'platform_admin' ? ShieldCheck : UserRound;

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] ${toneMap[key] || toneMap.platform_admin}`}>
      <Icon className="h-3.5 w-3.5" />
      {labelMap[key] || labelMap.platform_admin}
    </span>
  );
};

const resolveWorkspaceAccessMode = (relationship, isFrench) => {
  const tr = (en, fr) => (isFrench ? fr : en);

  if (relationship?.isTenantOwner && relationship?.isCurrentTenant) {
    return {
      label: tr('Owner workspace access', 'Accès espace propriétaire'),
      note: tr(
        'You are opening your own tenant workspace with the same signed-in owner identity.',
        'Vous ouvrez votre propre espace tenant avec la même identité propriétaire connectée.'
      ),
      buttonLabel: tr('Open your workspace', 'Ouvrir votre espace'),
      tone: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    };
  }

  if (relationship?.isTenantOwner) {
    return {
      label: tr('Linked owner access', 'Accès propriétaire lié'),
      note: tr(
        'This tenant is linked to your owner account, but it is not the active tenant session right now.',
        'Ce tenant est lié à votre compte propriétaire, mais ce n’est pas la session tenant active en ce moment.'
      ),
      buttonLabel: tr('Open linked workspace', 'Ouvrir l’espace lié'),
      tone: 'border-violet-200 bg-violet-50 text-violet-700',
    };
  }

  return {
    label: tr('Platform admin access only', 'Accès admin plateforme seulement'),
    note: tr(
      'Opening this workspace keeps your current platform-admin identity while loading that tenant context.',
      "L’ouverture de cet espace conserve votre identité admin plateforme actuelle tout en chargeant le contexte de ce tenant."
    ),
    buttonLabel: tr('Open as platform admin', 'Ouvrir comme admin plateforme'),
    tone: 'border-slate-200 bg-slate-100 text-slate-700',
  };
};

const getPlanRank = (planType = 'starter') => {
  const index = TENANT_PLAN_ORDER.indexOf(String(planType || '').trim().toLowerCase());
  return index >= 0 ? index : 0;
};

const getNextPlan = (planType = 'starter') => {
  const rank = getPlanRank(planType);
  return TENANT_PLAN_ORDER[Math.min(rank + 1, TENANT_PLAN_ORDER.length - 1)];
};

const buildUpgradeRecommendations = ({ controlsDraft, tr, featureDefinitions }) => {
  const currentPlan = String(controlsDraft?.plan_type || 'starter').trim().toLowerCase() || 'starter';
  const currentRank = getPlanRank(currentPlan);
  const nextPlan = getNextPlan(currentPlan);
  const nextPlanDifferent = nextPlan !== currentPlan;
  const currentBaseLimits = getTenantPlanLimits(currentPlan);
  const nextBaseLimits = getTenantPlanLimits(nextPlan);

  const limitAlerts = Object.entries(controlsDraft?.plan_limits || {}).flatMap(([key, value]) => {
    const numericValue = Number(value);
    const includedValue = Number(currentBaseLimits[key] || 0);
    if (!Number.isFinite(numericValue) || numericValue <= includedValue) return [];
    return [{
      kind: 'limit',
      key,
      title: tr('Higher limit than current plan', 'Limite supérieure au plan actuel'),
      body: tr(
        `This tenant is set to ${numericValue} ${key.replace('_', ' ')}, which is above the default ${currentPlan} allowance of ${includedValue}.`,
        `Ce tenant est réglé à ${numericValue} ${key.replace('_', ' ')}, au-dessus de l’allocation ${currentPlan} par défaut de ${includedValue}.`
      ),
      suggestedPlan: nextPlanDifferent ? nextPlan : currentPlan,
    }];
  });

  const featureUpsells = featureDefinitions.flatMap(([key, label]) => {
    if (controlsDraft?.feature_access?.[key]) return [];
    const rule = FEATURE_UPGRADE_RULES[key] || { minPlan: 'starter', category: 'addon' };
    const requiredRank = getPlanRank(rule.minPlan);
    const requiresPlanUpgrade = currentRank < requiredRank;
    const featureSource = String(controlsDraft?.commercial_settings?.feature_sources?.[key] || '').trim().toLowerCase();
    const addonSelected = Array.isArray(controlsDraft?.commercial_settings?.enabled_addons)
      ? controlsDraft.commercial_settings.enabled_addons.includes(key)
      : false;

    return [{
      kind: 'feature',
      key,
      title: label,
      body: requiresPlanUpgrade
        ? tr(
            `Best unlocked on the ${rule.minPlan} plan or above.`,
            `Déverrouillage conseillé avec le plan ${rule.minPlan} ou supérieur.`
          )
        : tr(
            'Can be sold as an add-on and enabled for this tenant immediately.',
            'Peut être vendu comme add-on et activé immédiatement pour ce tenant.'
          ),
      suggestedPlan: requiresPlanUpgrade ? rule.minPlan : currentPlan,
      requiresPlanUpgrade,
      category: rule.category,
      featureSource,
      addonSelected,
    }];
  });

  return {
    nextPlan,
    nextBaseLimits,
    limitAlerts,
    featureUpsells,
  };
};

const areWorkspaceDrawerDraftsEqual = (left, right) => {
  if (left === right) return true;
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object') return false;

  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) return false;

  return leftKeys.every((key) => {
    const leftValue = left[key];
    const rightValue = right[key];

    if (Array.isArray(leftValue) || Array.isArray(rightValue)) {
      if (!Array.isArray(leftValue) || !Array.isArray(rightValue) || leftValue.length !== rightValue.length) {
        return false;
      }
      return leftValue.every((item, index) => item === rightValue[index]);
    }

    if (leftValue && rightValue && typeof leftValue === 'object' && typeof rightValue === 'object') {
      return areWorkspaceDrawerDraftsEqual(leftValue, rightValue);
    }

    return leftValue === rightValue;
  });
};

const buildControlsDraft = (workspace = {}) => {
  const subscription = workspace?.subscription || {};
  const tenant = workspace?.tenant || {};
  const planType = normalizeTenantPlanType(subscription?.plan_type || 'starter');
  const defaultPlanLimits = getTenantPlanLimits(planType);
  const planLimits = subscription?.plan_limits && typeof subscription.plan_limits === 'object'
    ? subscription.plan_limits
    : {};
  const featureAccessOverrides = tenant?.metadata?.feature_access && typeof tenant.metadata.feature_access === 'object'
    ? tenant.metadata.feature_access
    : {};
  const billingEngine = subscription?.metadata?.billing_engine && typeof subscription.metadata.billing_engine === 'object'
    ? subscription.metadata.billing_engine
    : {};
  const commercialSettings = tenant?.metadata?.commercial_settings && typeof tenant.metadata.commercial_settings === 'object'
    ? tenant.metadata.commercial_settings
    : {};

  return {
    tenancy_mode: String(tenant?.tenancy_mode || tenant?.metadata?.tenancy_mode || 'shared').trim().toLowerCase() || 'shared',
    plan_type: planType,
    subscription_status: String(subscription?.subscription_status || 'trial').trim().toLowerCase() || 'trial',
    billing_status: String(subscription?.billing_status || 'none').trim().toLowerCase() || 'none',
    plan_limits: {
      vehicles: Number(planLimits.vehicles ?? defaultPlanLimits.vehicles ?? DEFAULT_PLAN_LIMITS.vehicles) || 0,
      staff: Number(planLimits.staff ?? planLimits.staff_users ?? defaultPlanLimits.staff ?? DEFAULT_PLAN_LIMITS.staff) || 0,
      listings: Number(planLimits.listings ?? defaultPlanLimits.listings ?? DEFAULT_PLAN_LIMITS.listings) || 0,
      storage_gb: Number(planLimits.storage_gb ?? defaultPlanLimits.storage_gb ?? DEFAULT_PLAN_LIMITS.storage_gb) || 0,
    },
    feature_access: buildEffectiveTenantFeatureAccess(planType, featureAccessOverrides),
    billing_engine: {
      billing_cycle: ['monthly', 'quarterly', 'yearly', 'custom'].includes(String(billingEngine.billing_cycle || '').trim().toLowerCase())
        ? String(billingEngine.billing_cycle).trim().toLowerCase()
        : 'monthly',
      invoicing_mode: ['automatic', 'manual', 'invoice_only'].includes(String(billingEngine.invoicing_mode || '').trim().toLowerCase())
        ? String(billingEngine.invoicing_mode).trim().toLowerCase()
        : 'manual',
      trial_ends_at: String(billingEngine.trial_ends_at || '').trim(),
      renews_at: String(billingEngine.renews_at || '').trim(),
      admin_note: String(billingEngine.admin_note || '').trim(),
    },
    commercial_settings: {
      enabled_addons: Array.isArray(commercialSettings.enabled_addons)
        ? commercialSettings.enabled_addons.map((item) => String(item || '').trim()).filter(Boolean)
        : [],
      feature_sources: FEATURE_ACCESS_KEYS.reduce((acc, key) => {
        const nextValue = String(commercialSettings?.feature_sources?.[key] || '').trim().toLowerCase();
        acc[key] = ['included', 'add_on', 'plan_upgrade', 'custom'].includes(nextValue) ? nextValue : '';
        return acc;
      }, {}),
      admin_note: String(commercialSettings.admin_note || '').trim(),
    },
  };
};

const buildSettingsDraft = (workspace = {}) => {
  const tenantSettings = workspace?.tenant?.metadata?.tenant_settings
    && typeof workspace.tenant.metadata.tenant_settings === 'object'
    ? workspace.tenant.metadata.tenant_settings
    : {};

  return {
    brand_name: String(tenantSettings.brand_name || workspace?.name || '').trim(),
    public_display_name: String(tenantSettings.public_display_name || workspace?.name || '').trim(),
    legal_business_name: String(tenantSettings.legal_business_name || workspace?.businessAccount?.company_name || '').trim(),
    support_email: String(tenantSettings.support_email || workspace?.ownerEmail || '').trim(),
    custom_domain: String(tenantSettings.custom_domain || '').trim(),
    default_language: ['en', 'fr', 'ar'].includes(String(tenantSettings.default_language || '').trim().toLowerCase())
      ? String(tenantSettings.default_language).trim().toLowerCase()
      : 'en',
    currency: String(tenantSettings.currency || 'MAD').trim().toUpperCase(),
    timezone: String(tenantSettings.timezone || 'Africa/Casablanca').trim(),
    country: String(tenantSettings.country || 'Morocco').trim(),
  };
};

const WorkspaceContextCard = ({ hostContext, tenantSession, currentUser, platformAccess }) => {
  const isFrench = i18n.resolvedLanguage === 'fr';
  const tr = (en, fr) => (isFrench ? fr : en);
  const lightEyebrowClass = 'text-xs font-semibold uppercase tracking-[0.18em] text-slate-500';
  const lightSectionTitleClass = 'mt-1 text-lg font-semibold text-slate-900';
  const lightBodyClass = 'mt-1 text-sm text-slate-500';
  const lightCardEyebrowClass = 'text-xs font-semibold uppercase tracking-[0.18em] text-slate-500';
  const lightCardTitleClass = 'mt-2 text-2xl font-semibold leading-tight text-slate-900';
  const tenant = tenantSession?.tenant || null;
  const workspaceState = String(tenantSession?.workspaceState || tenantSession?.workspace_state || '').trim().toLowerCase();
  const currentEmail = String(currentUser?.email || '').trim();
  const isPlatformOwner = platformAccess?.is_platform_owner === true;
  const isPlatformAdmin = platformAccess?.is_platform_admin === true;

  const platformContextLabel = isPlatformOwner
    ? tr('Platform owner', 'Propriétaire plateforme')
    : isPlatformAdmin
      ? tr('Platform admin', 'Admin plateforme')
      : hostContext.kind === 'admin'
        ? tr('Platform admin', 'Admin plateforme')
    : hostContext.kind === 'tenant'
      ? tr('Tenant host', 'Hôte tenant')
      : hostContext.kind === 'local'
        ? tr('Local simulation', 'Simulation locale')
        : tr('Public host', 'Hôte public');

  const tenantContextLabel = tenant?.tenant_name || tenantSession?.tenantName || tenant?.tenant_slug || tenantSession?.tenantSlug || tr('No active tenant session', 'Aucune session tenant active');
  const tenantRoleLabel = tenant
    ? tr('Tenant context linked to your signed-in account', 'Contexte tenant lié à votre compte connecté')
    : tr('No tenant workspace linked in the current session', 'Aucun espace tenant lié dans la session actuelle');
  const platformAbilityLabel = isPlatformOwner
    ? tr(
        'You can manage workspace provisioning, controls, and access delegation from this session.',
        'Vous pouvez gérer le provisionnement workspace, les contrôles et la délégation d’accès depuis cette session.'
      )
    : isPlatformAdmin
      ? tr(
          'You are acting with delegated platform-admin access. Workspace actions are tracked under your platform identity.',
          'Vous agissez avec un accès admin plateforme délégué. Les actions workspace sont tracées sous votre identité plateforme.'
        )
      : tr(
          'This page uses your current session context to determine which platform actions are available.',
          'Cette page utilise le contexte de votre session actuelle pour déterminer quelles actions plateforme sont disponibles.'
        );

  return (
    <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_20px_60px_rgba(15,23,42,0.08)] sm:p-6">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-2xl">
          <p className={lightEyebrowClass}>{tr('Current context', 'Contexte actuel')}</p>
          <h3 className={lightSectionTitleClass}>{tr('Platform and tenant visibility', 'Visibilité plateforme et tenant')}</h3>
          <p className={lightBodyClass}>{tr('Platform and tenant visibility in one place.', 'Visibilité plateforme et tenant au même endroit.')}</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:min-w-[420px]">
          <div className="rounded-3xl border border-slate-200 bg-slate-50/70 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">{tr('Platform view', 'Vue plateforme')}</p>
            <p className={lightCardTitleClass}>{platformContextLabel}</p>
            <p className="mt-2 text-sm text-slate-500">{hostContext.hostname || tr('Current domain', 'Domaine actuel')}</p>
          </div>
          <div className="rounded-3xl border border-slate-200 bg-slate-50/70 p-4">
            <p className={lightCardEyebrowClass}>{tr('Tenant view', 'Vue tenant')}</p>
            <p className={lightCardTitleClass}>{tenantContextLabel}</p>
            <p className="mt-2 text-sm text-slate-500">
              {tenant?.tenant_app_url || tenantSession?.tenantAppUrl || workspaceState || tr('Not active yet', 'Pas encore actif')}
            </p>
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.14em] text-slate-700">
          <ShieldCheck className="h-3.5 w-3.5" />
          {platformContextLabel}
        </span>
        {tenant ? (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-700">
            <UserRound className="h-3.5 w-3.5" />
            {tr('Signed in as tenant owner', 'Connecté comme propriétaire tenant')}
          </span>
        ) : null}
        {currentEmail ? (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.14em] text-emerald-700">
            <Building2 className="h-3.5 w-3.5" />
            {currentEmail}
          </span>
        ) : null}
      </div>

      <p className="mt-4 text-sm leading-6 text-slate-500">{tenantRoleLabel}</p>
      <p className="mt-2 text-sm leading-6 text-slate-500">{platformAbilityLabel}</p>
    </section>
  );
};

const WorkspaceDetailPage = ({ workspace, onBack, onUpdated, platformAccess }) => {
  const isFrench = i18n.resolvedLanguage === 'fr';
  const tr = (en, fr) => (isFrench ? fr : en);
  const hostContext = useMemo(() => getHostContext(), []);
  const [searchParams, setSearchParams] = useSearchParams();
  const tenant = workspace?.tenant || {};
  const job = workspace?.provisioningJob || {};
  const status = workspace?.status || 'pending';
  const isPlatformOwner = platformAccess?.is_platform_owner === true;
  const isPlatformAdmin = platformAccess?.is_platform_admin === true;
  const [draft, setDraft] = useState({
    tenant_project_ref: tenant?.tenant_project_ref || '',
    tenant_api_url: tenant?.tenant_api_url || '',
    tenant_anon_key: tenant?.tenant_anon_key || '',
    tenant_app_url: tenant?.tenant_app_url || '',
    tenant_database_name: tenant?.tenant_database_name || '',
    schema_version: tenant?.schema_version || 'v1',
    error_message: tenant?.provisioning_error || job?.error_message || '',
  });
  const [busy, setBusy] = useState('');
  const [controlsSaveNotice, setControlsSaveNotice] = useState('');
  const [showManualConfig, setShowManualConfig] = useState(false);
  const [controlsDraft, setControlsDraft] = useState(() => buildControlsDraft(workspace));
  const [settingsDraft, setSettingsDraft] = useState(() => buildSettingsDraft(workspace));
  const [auditRows, setAuditRows] = useState([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [schemaActionResult, setSchemaActionResult] = useState(null);
  const [confirmSchemaApply, setConfirmSchemaApply] = useState(false);
  const tenancyMode = String(controlsDraft?.tenancy_mode || tenant?.tenancy_mode || tenant?.metadata?.tenancy_mode || 'shared').trim().toLowerCase() || 'shared';
  const isDedicatedTenant = tenancyMode === 'dedicated';
  const isSharedTenant = !isDedicatedTenant;

  useEffect(() => {
    const nextDraft = {
      tenant_project_ref: tenant?.tenant_project_ref || '',
      tenant_api_url: tenant?.tenant_api_url || '',
      tenant_anon_key: tenant?.tenant_anon_key || '',
      tenant_app_url: tenant?.tenant_app_url || '',
      tenant_database_name: tenant?.tenant_database_name || '',
      schema_version: tenant?.schema_version || 'v1',
      error_message: tenant?.provisioning_error || job?.error_message || '',
    };
    setDraft((prev) => (areWorkspaceDrawerDraftsEqual(prev, nextDraft) ? prev : nextDraft));
  }, [job?.error_message, tenant]);

  useEffect(() => {
    const nextDraft = buildControlsDraft(workspace);
    setControlsDraft((prev) => (areWorkspaceDrawerDraftsEqual(prev, nextDraft) ? prev : nextDraft));
  }, [workspace]);

  useEffect(() => {
    const nextDraft = buildSettingsDraft(workspace);
    setSettingsDraft((prev) => (areWorkspaceDrawerDraftsEqual(prev, nextDraft) ? prev : nextDraft));
  }, [workspace]);

  const applySavedControlsSnapshot = useCallback((response) => {
    if (!response || (!response.subscription && !response.tenant_metadata && !response.tenant)) return;

    const nextWorkspace = {
      ...workspace,
      subscription: {
        ...(workspace?.subscription || {}),
        ...(response.subscription || {}),
      },
      tenant: {
        ...(workspace?.tenant || {}),
        ...(response.tenant || {}),
        metadata: {
          ...(((workspace?.tenant?.metadata) && typeof workspace.tenant.metadata === 'object')
            ? workspace.tenant.metadata
            : {}),
          ...((response.tenant_metadata && typeof response.tenant_metadata === 'object')
            ? response.tenant_metadata
            : {}),
        },
      },
    };

    setControlsDraft(buildControlsDraft(nextWorkspace));
    setSettingsDraft(buildSettingsDraft(nextWorkspace));
  }, [workspace]);

  const loadAuditRows = useCallback(async () => {
    if (!workspace?.tenant?.id || !workspace?.businessAccount?.id) {
      setAuditRows([]);
      return;
    }

    try {
      setAuditLoading(true);
      const items = await listTenantAuditLog({
        tenantId: workspace.tenant.id,
        businessAccountId: workspace.businessAccount.id,
        limit: 12,
      });
      setAuditRows(Array.isArray(items) ? items : []);
    } catch (error) {
      console.warn('Unable to load tenant audit log:', error?.message || error);
    } finally {
      setAuditLoading(false);
    }
  }, [workspace?.businessAccount?.id, workspace?.tenant?.id]);

  useEffect(() => {
    loadAuditRows();
  }, [loadAuditRows]);

  const effectiveConnectionConfig = useMemo(() => ({
    ...(workspace?.tenant || {}),
    tenant_project_ref: draft.tenant_project_ref,
    tenant_api_url: draft.tenant_api_url,
    tenant_anon_key: draft.tenant_anon_key,
    tenant_app_url: draft.tenant_app_url,
    schema_version: draft.schema_version,
  }), [draft, workspace?.tenant]);

  const { storefrontUrl, workspaceUrl } = useMemo(
    () => buildWorkspaceAccessUrls(effectiveConnectionConfig),
    [effectiveConnectionConfig]
  );

  const healthReport = useMemo(
    () => buildTenantHealthReport({
      workspace,
      controlsDraft,
      connectionDraft: draft,
      storefrontUrl,
      workspaceUrl,
      tr,
      tenancyMode,
      showOwnerLinkage: hostContext.kind === 'admin' || hostContext.isLocal,
    }),
    [controlsDraft, draft, hostContext.isLocal, hostContext.kind, storefrontUrl, tenancyMode, workspace, workspaceUrl, tr]
  );
  const schemaState = useMemo(() => buildSchemaWorkspaceState(workspace), [workspace]);
  const isSchemaBusy = busy.startsWith('schema-');
  const latestSchemaOutcome = schemaActionResult?.result || null;
  const latestSchemaOk =
    latestSchemaOutcome?.verification?.ok
    ?? latestSchemaOutcome?.ok
    ?? null;
  const latestRuntimeOk =
    latestSchemaOutcome?.runtimeVerification?.ok
    ?? latestSchemaOutcome?.ok
    ?? null;
  const shouldShowSchemaSuccessBanner = Boolean(
    !isSchemaBusy
    && !schemaActionResult?.error
    && schemaActionResult?.action
    && (
      schemaActionResult.action === 'plan'
      || latestSchemaOk !== null
      || latestRuntimeOk !== null
    )
  );

  if (!workspace) return null;

  const lightSectionClass = 'rounded-[28px] border border-slate-200 bg-white shadow-[0_20px_60px_rgba(15,23,42,0.08)]';
  const lightInsetCardClass = 'rounded-3xl border border-slate-200 bg-slate-50/70';
  const lightInsetSoftClass = 'rounded-2xl border border-slate-200 bg-white';
  const lightInputClass = 'mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 outline-none focus:border-slate-300 focus:ring-4 focus:ring-slate-100';
  const lightPrimaryButtonClass = 'inline-flex items-center justify-center rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60';
  const lightSecondaryButtonClass = 'inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60';
  const lightDangerButtonClass = 'inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-rose-50 hover:text-rose-700 disabled:opacity-60';
  const lightEyebrowClass = 'text-xs font-semibold uppercase tracking-[0.18em] text-slate-500';
  const lightLabelClass = 'text-xs font-semibold uppercase tracking-wide text-slate-500';
  const lightSectionHeadingClass = 'mt-1 text-lg font-semibold text-slate-900';
  const lightCardValueClass = 'mt-2 text-base font-semibold text-slate-900';
  const lightSupportingTextClass = 'mt-1 text-sm text-slate-500';

  const detailTabs = useMemo(() => ([
    {
      id: 'overview',
      label: tr('Overview', 'Aperçu'),
      description: tr('Provisioning, health, schema, and workspace actions.', 'Provisionnement, santé, schéma et actions workspace.'),
    },
    {
      id: 'owner_identity',
      label: tr('Owner identity', 'Identité propriétaire'),
      description: tr('Owner linkage, runtime links, and tenant identity settings.', 'Lien propriétaire, liens runtime et paramètres d’identité tenant.'),
    },
    {
      id: 'audit',
      label: tr('Audit', 'Audit'),
      description: tr('Recent admin and access events for this tenant.', 'Événements admin et accès récents pour ce tenant.'),
    },
    {
      id: 'feature_access',
      label: tr('Feature access', 'Accès fonctionnalités'),
      description: tr('Plan, billing, and workspace feature access controls.', 'Contrôles du plan, de la facturation et de l’accès aux fonctionnalités du workspace.'),
    },
    {
      id: 'upgrades',
      label: tr('Upgrades', 'Montées en gamme'),
      description: tr('Monetization path, billing controls, and upsells.', 'Parcours de monétisation, contrôles de facturation et upsells.'),
    },
  ]), [tr]);

  const rawDetailTab = String(searchParams.get('tab') || '').trim().toLowerCase();
  const detailTab = WORKSPACE_DETAIL_TAB_IDS.includes(rawDetailTab) ? rawDetailTab : 'overview';
  const setDetailTab = (nextTab) => {
    const normalizedTab = WORKSPACE_DETAIL_TAB_IDS.includes(nextTab) ? nextTab : 'overview';
    const nextParams = new URLSearchParams(searchParams);
    if (normalizedTab === 'overview') {
      nextParams.delete('tab');
    } else {
      nextParams.set('tab', normalizedTab);
    }
    setSearchParams(nextParams, { replace: true });
  };

  const runAction = async (action) => {
    if (!job?.id && !(action === 'start' && workspace?.businessAccount?.id)) {
      alert(tr('No provisioning job is linked to this tenant yet.', 'Aucun job de provisionnement n’est lié à ce tenant.'));
      return;
    }

    try {
      setBusy(action);
      if (action === 'start') {
        await startTenantProvisioning(job?.id || '', workspace?.businessAccount?.id);
      } else if (action === 'complete') {
        if (!isDedicatedTenant) {
          alert(tr('Manual dedicated activation is only available for dedicated tenants.', 'L’activation manuelle dédiée est disponible seulement pour les tenants dédiés.'));
          return;
        }
        const payload = {
          ...draft,
          tenant_api_url: normalizeUrl(draft.tenant_api_url),
          tenant_app_url: normalizeUrl(draft.tenant_app_url),
        };
        const missing = ['tenant_project_ref', 'tenant_api_url', 'tenant_anon_key', 'tenant_app_url']
          .filter((key) => !String(payload[key] || '').trim());
        if (missing.length) {
          alert(tr('Project ref, API URL, anon key, and app URL are required.', 'Référence projet, URL API, clé anon et URL app sont requis.'));
          return;
        }
        await completeTenantProvisioning(job.id, payload);
      } else if (action === 'fail') {
        await failTenantProvisioning(job.id, draft.error_message || 'Provisioning failed');
      } else if (action === 'suspend') {
        await suspendTenant(job.id, draft.error_message || 'Workspace suspended by admin');
      } else if (action === 'reactivate') {
        await reactivateTenant(job.id);
      }
      await onUpdated?.();
    } catch (error) {
          alert(error?.message || tr('Unable to update tenant.', 'Impossible de mettre à jour le tenant.'));
    } finally {
      setBusy('');
    }
  };

  const provisioningDispatch = tenant?.metadata?.provisioning_dispatch || {};
  const automationWasDispatched = Boolean(provisioningDispatch?.dispatched);
  const lastProvisioningUpdate =
    tenant?.metadata?.provisioning_dispatch_at ||
    tenant?.metadata?.provisioning_dispatch_failed_at ||
    tenant?.updated_at ||
    job?.updated_at ||
    job?.started_at ||
    tenant?.provisioning_started_at;
  const accessMode = resolveWorkspaceAccessMode(workspace.relationship, isFrench);
  const enabledFeatureCount = Object.values(controlsDraft.feature_access || {}).filter(Boolean).length;
  const sharedTenantOrganizationIdentity = resolveSharedTenantOrganizationIdentity(tenant);
  const moduleFeatureDefinitions = [
    ['dashboard_basic', tr('Dashboard', 'Tableau de bord')],
    ['calendar_module', tr('Calendar', 'Calendrier')],
    ['rentals_basic', tr('Rental workspace', 'Espace locations')],
    ['fleet_basic', tr('Fleet workspace', 'Espace flotte')],
    ['customers_basic', tr('Customer workspace', 'Espace clients')],
    ['documents_basic', tr('Basic documents', 'Documents de base')],
    ['tours_module', tr('Tours & bookings', 'Tours & réservations')],
    ['tasks_module', tr('Team tasks', 'Tâches équipe')],
    ['live_map_module', tr('Live map', 'Carte live')],
    ['inventory_module', tr('Inventory module', 'Module inventaire')],
    ['alerts_module', tr('Alerts module', 'Module alertes')],
    ['verification_module', tr('Verification center', 'Centre de vérification')],
    ['workspace_settings_module', tr('System settings', 'Paramètres système')],
    ['messages_module', tr('Messaging center', 'Centre messages')],
    ['pricing_module', tr('Pricing module', 'Module tarification')],
    ['finance_module', tr('Finance module', 'Module finance')],
    ['fuel_module', tr('Fuel module', 'Module carburant')],
    ['maintenance_module', tr('Maintenance module', 'Module maintenance')],
    ['marketplace_module', tr('Marketplace module', 'Module marketplace')],
  ];
  const advancedFeatureDefinitions = [
    ['pricing_km_packages', tr('KM packages', 'Forfaits KM')],
    ['pricing_tier_rules', tr('Tier pricing', 'Tarification par paliers')],
    ['pricing_fuel_rules', tr('Fuel pricing rules', 'Règles prix carburant')],
    ['website_editor', tr('Website editor', 'Éditeur site web')],
    ['advanced_roles_permissions', tr('Advanced staff roles', 'Rôles équipe avancés')],
    ['project_export', tr('Project export', 'Export projet')],
    ['ocr_id_scan', tr('OCR / ID scan', 'OCR / scan ID')],
    ['whatsapp_tools', tr('WhatsApp tools', 'Outils WhatsApp')],
    ['public_storefront', tr('Public storefront', 'Vitrine publique')],
    ['online_booking', tr('Online booking', 'Réservation en ligne')],
    ['advanced_reporting', tr('Advanced reporting', 'Rapports avancés')],
    ['multilingual_storefront', tr('Multilingual storefront', 'Vitrine multilingue')],
  ];
  const featureDefinitions = [...moduleFeatureDefinitions, ...advancedFeatureDefinitions];
  const upgradeRecommendations = buildUpgradeRecommendations({ controlsDraft, tr, featureDefinitions });
  const tenantWorkspaceModuleAccessSummary = useMemo(
    () => buildTenantWorkspaceModuleAccessSummary({
      planType: controlsDraft.plan_type,
      featureAccess: controlsDraft.feature_access,
    }),
    [controlsDraft.feature_access, controlsDraft.plan_type]
  );

  const saveControls = async () => {
    try {
      setBusy('controls');
      setControlsSaveNotice('');
      const response = await updateTenantControls({
        businessAccountId: workspace?.businessAccount?.id,
        tenantId: tenant?.id,
        subscriptionPatch: controlsDraft,
        tenantPatch: {
          tenancy_mode: controlsDraft.tenancy_mode,
          feature_access: controlsDraft.feature_access,
          settings: settingsDraft,
          commercial_settings: controlsDraft.commercial_settings,
        },
      });
      applySavedControlsSnapshot(response);
      await loadAuditRows();
      await onUpdated?.();
      setControlsSaveNotice(tr('Tenant controls saved successfully.', 'Contrôles tenant enregistrés avec succès.'));
      toast.success(tr('Tenant controls saved successfully.', 'Contrôles tenant enregistrés avec succès.'));
    } catch (error) {
      setControlsSaveNotice('');
      alert(error?.message || tr('Unable to save tenant controls.', 'Impossible d’enregistrer les contrôles tenant.'));
    } finally {
      setBusy('');
    }
  };

  const applySuggestedPlan = (planType) => {
    const normalizedPlan = normalizeTenantPlanType(planType);
    setControlsDraft((prev) => ({
      ...prev,
      plan_type: normalizedPlan,
      plan_limits: getTenantPlanLimits(normalizedPlan),
      feature_access: buildEffectiveTenantFeatureAccess(normalizedPlan, {}),
    }));
  };

  const enableFeatureDraft = (key) => {
    setControlsDraft((prev) => ({
      ...prev,
      feature_access: {
        ...prev.feature_access,
        [key]: true,
      },
      commercial_settings: {
        ...prev.commercial_settings,
        enabled_addons: Array.isArray(prev.commercial_settings?.enabled_addons)
          ? [...new Set([...prev.commercial_settings.enabled_addons, key])]
          : [key],
        feature_sources: {
          ...(prev.commercial_settings?.feature_sources || {}),
          [key]: 'add_on',
        },
      },
    }));
  };

  const setFeatureCommercialSource = (key, source) => {
    setControlsDraft((prev) => {
      const existingAddons = Array.isArray(prev.commercial_settings?.enabled_addons)
        ? prev.commercial_settings.enabled_addons
        : [];
      const nextAddons = source === 'add_on'
        ? [...new Set([...existingAddons, key])]
        : existingAddons.filter((item) => item !== key);

      return {
        ...prev,
        commercial_settings: {
          ...prev.commercial_settings,
          enabled_addons: nextAddons,
          feature_sources: {
            ...(prev.commercial_settings?.feature_sources || {}),
            [key]: source,
          },
        },
      };
    });
  };

  const formatAuditAction = (action = '') => {
      const labels = {
        tenant_controls_updated: tr('Tenant controls updated', 'Contrôles tenant mis à jour'),
        schema_plan: tr('Schema upgrade planned', 'Upgrade schéma planifié'),
        schema_apply: tr('Schema upgrade applied', 'Upgrade schéma appliqué'),
        schema_verify: tr('Schema release verified', 'Release schéma vérifiée'),
        schema_drift: tr('Schema drift inspected', 'Drift schéma inspecté'),
        schema_runtime: tr('Tenant runtime verified', 'Runtime tenant vérifié'),
        tenant_storefront_opened: tr('Storefront opened', 'Vitrine ouverte'),
      tenant_workspace_opened: tr('Workspace opened', 'Espace admin ouvert'),
      start_tenant_provisioning: tr('Automatic provisioning started', 'Provisionnement automatique démarré'),
      complete_tenant_provisioning: tr('Tenant provisioning completed', 'Provisionnement tenant terminé'),
      fail_tenant_provisioning: tr('Tenant provisioning failed', 'Provisionnement tenant échoué'),
      tenant_provisioning_failed: tr('Provisioning worker failed', 'Échec du worker de provisionnement'),
      tenant_provisioning_timeout: tr('Provisioning timeout', 'Timeout du provisionnement'),
      tenant_provisioning_dispatch_failed: tr('Provisioning dispatch failed', 'Échec du déclenchement de provisionnement'),
      complete_tenant_provisioning_callback: tr('Provisioning callback completed', 'Callback de provisionnement terminé'),
      tenant_provisioning_completion_rejected: tr('Provisioning callback rejected', 'Callback de provisionnement rejeté'),
    };
    return labels[action] || action || tr('Unknown action', 'Action inconnue');
  };

  const formatAuditDetails = (item) => {
    if (!item) return [];
    const metadata = item.metadata && typeof item.metadata === 'object' ? item.metadata : {};
    const details = [];

    if (String(item.action || '').startsWith('schema_')) {
      if (metadata.release_id) {
        details.push(`${tr('Release', 'Release')}: ${formatSchemaReleaseLabel(metadata.release_id)}`);
      }
      if (typeof metadata.verification_ok === 'boolean') {
        details.push(
          metadata.verification_ok
            ? tr('Verification passed', 'Vérification réussie')
            : tr('Verification needs review', 'Vérification à revoir')
        );
      }
      if (typeof metadata.runtime_ok === 'boolean') {
        details.push(
          metadata.runtime_ok
            ? tr('Runtime verification passed', 'Vérification runtime réussie')
            : tr('Runtime verification needs review', 'Vérification runtime à revoir')
        );
      }
      if (typeof metadata.applied_statement_count === 'number') {
        details.push(`${tr('Applied statements', 'Instructions appliquées')}: ${metadata.applied_statement_count}`);
      }
      if (Array.isArray(metadata.explicit_migration_ids) && metadata.explicit_migration_ids.length) {
        details.push(`${tr('Explicit migrations', 'Migrations explicites')}: ${metadata.explicit_migration_ids.join(', ')}`);
      }
      if (metadata.safe_plan && typeof metadata.safe_plan === 'object') {
        details.push(
          tr(
            `Plan: ${metadata.safe_plan.statementCount || 0} statements, ${metadata.safe_plan.missingTableCount || 0} missing tables, ${metadata.safe_plan.missingColumnCount || 0} missing columns.`,
            `Plan : ${metadata.safe_plan.statementCount || 0} instructions, ${metadata.safe_plan.missingTableCount || 0} tables manquantes, ${metadata.safe_plan.missingColumnCount || 0} colonnes manquantes.`
          )
        );
      }
      if (Array.isArray(metadata.blocking_issues) && metadata.blocking_issues.length) {
        details.push(`${tr('Blocking issues', 'Problèmes bloquants')}: ${metadata.blocking_issues.join(', ')}`);
      }
      if (metadata.drift && typeof metadata.drift === 'object') {
        details.push(
          tr(
            `Drift: ${metadata.drift.missingTableCount || 0} missing tables, ${metadata.drift.missingColumnCount || 0} missing columns, ${metadata.drift.mismatchedColumnCount || 0} mismatched columns.`,
            `Drift : ${metadata.drift.missingTableCount || 0} tables manquantes, ${metadata.drift.missingColumnCount || 0} colonnes manquantes, ${metadata.drift.mismatchedColumnCount || 0} colonnes divergentes.`
          )
        );
      }
      if (metadata.runtime_blocking_issues && Array.isArray(metadata.runtime_blocking_issues) && metadata.runtime_blocking_issues.length) {
        details.push(`${tr('Runtime issues', 'Problèmes runtime')}: ${metadata.runtime_blocking_issues.join(', ')}`);
      }
      return details;
    }

    if (metadata.target) {
      details.push(`${tr('Target', 'Cible')}: ${metadata.target}`);
    }

    if (metadata.changed_fields) {
      const changed = [
        ...(metadata.changed_fields.core_controls || []),
        ...(metadata.changed_fields.plan_limits || []),
        ...(metadata.changed_fields.billing_engine || []),
        ...(metadata.changed_fields.feature_access || []),
        ...(metadata.changed_fields.tenant_settings || []),
        ...(metadata.changed_fields.commercial_settings || []),
      ];
      if (changed.length) {
        details.push(`${tr('Updated', 'Mis à jour')}: ${changed.join(', ')}`);
      }
    }

    return details;
  };

  const runSchemaAction = async (action) => {
    if (!isDedicatedTenant && action !== 'runtime') {
      alert(tr('Schema release actions are only available for dedicated tenants. Shared tenants use the shared runtime readiness flow instead.', 'Les actions de release schéma sont disponibles seulement pour les tenants dédiés. Les tenants partagés utilisent le flux de readiness runtime partagé.'));
      return;
    }

    try {
      setBusy(`schema-${action}`);
      setSchemaActionResult(null);

      const payload = {
        tenantId: tenant?.id,
        businessAccountId: workspace?.businessAccount?.id,
        tenantSlug: workspace?.slug || tenant?.tenant_slug || '',
        targetProjectRef: tenant?.tenant_project_ref || '',
      };

      let result = null;
      if (action === 'plan') {
        result = await planTenantSchemaUpgrade(payload);
      } else if (action === 'apply') {
        result = await applyTenantSchemaUpgrade(payload);
      } else if (action === 'verify') {
        result = await verifyTenantSchemaRelease(payload);
      } else if (action === 'runtime') {
        result = await verifyTenantRuntimeIntegrity(payload);
      } else if (action === 'drift') {
        result = await getTenantSchemaDrift(payload);
      } else {
        return;
      }

      setSchemaActionResult({ action, result, error: '' });
      if (action === 'apply') {
        setConfirmSchemaApply(false);
      }
      await loadAuditRows();
      await onUpdated?.();
    } catch (error) {
      setSchemaActionResult({
        action,
        result: null,
        error: error?.message || tr('Schema action failed.', 'Action schéma échouée.'),
      });
    } finally {
      setBusy('');
    }
  };

  const openTrackedLink = async ({ url, action, target }) => {
    if (!url) return;

    try {
      await createTenantAuditEvent({
        businessAccountId: workspace?.businessAccount?.id,
        tenantId: tenant?.id,
        action,
        metadata: {
          target,
          access_mode: accessMode.label,
          relationship: workspace?.relationship?.label || 'platform_admin',
          tenant_slug: workspace?.slug || '',
        },
      });
      await loadAuditRows();
    } catch (error) {
      console.warn('Unable to log tenant access event:', error?.message || error);
    } finally {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <div className="min-h-screen bg-slate-50/80">
      <main className="mx-auto max-w-7xl space-y-5 px-4 py-6 sm:px-6 lg:px-8">
        <AdminModuleHero
          flush
          icon={<Building2 className="h-7 w-7" />}
          eyebrow={tr('Tenant workspace', 'Workspace tenant')}
          title={workspace.name}
          description={tr(
            'Review provisioning, access, branding, and commercial controls for this tenant from one admin page.',
            'Vérifiez le provisionnement, l’accès, le branding et les contrôles commerciaux de ce tenant depuis une seule page admin.'
          )}
          actions={(
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={onBack}
                className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
              >
                <ChevronLeft className="h-4 w-4" />
                {tr('Back to workspaces', 'Retour aux workspaces')}
              </button>
              <WorkspacePlanBadge planType={controlsDraft.plan_type} />
              <WorkspaceRelationshipBadge relationship={workspace.relationship} />
              <WorkspaceStatusBadge status={status} />
            </div>
          )}
        />

        <section className={`${lightSectionClass} p-3`}>
          <div className="flex flex-wrap items-stretch gap-2">
            {detailTabs.map((item) => {
              const active = item.id === detailTab;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setDetailTab(item.id)}
                  className={`inline-flex min-h-[46px] items-center justify-center rounded-2xl border px-4 py-2 text-sm font-semibold transition ${
                    active
                      ? 'border-slate-900 bg-slate-900 text-white shadow-sm'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
        </section>

        <div className="space-y-4">
          {detailTab === 'overview' && isDedicatedTenant ? (
          <section className={`${lightSectionClass} p-5`}>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-3xl border border-slate-200 bg-slate-50/70 p-4">
                <p className={lightLabelClass}>{tr('Owner', 'Propriétaire')}</p>
                <p className={lightCardValueClass}>{workspace.ownerName || '—'}</p>
                <p className="mt-1 text-sm text-slate-500">{workspace.ownerEmail || '—'}</p>
              </div>
              <div className="rounded-3xl border border-slate-200 bg-slate-50/70 p-4">
                <p className={lightLabelClass}>{tr('Access', 'Accès')}</p>
                <p className={lightCardValueClass}>{accessMode.label}</p>
                <p className="mt-1 text-sm text-slate-500">{tr('Current role and workspace context', 'Rôle actuel et contexte workspace')}</p>
              </div>
            </div>
          </section>
          ) : null}

          {detailTab === 'overview' && isSharedTenant ? (
          <section className={`${lightSectionClass} p-5`}>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className={lightEyebrowClass}>{tr('Shared runtime', 'Runtime partagé')}</p>
                <h3 className={lightSectionHeadingClass}>{tr('Shared tenant readiness', 'Readiness du tenant partagé')}</h3>
                <p className="mt-1 text-sm text-slate-500">
                  {tr(
                    'This tenant uses the shared runtime, so the admin view tracks organization mapping and runtime readiness instead of dedicated infrastructure controls.',
                    'Ce tenant utilise le runtime partagé, donc la vue admin suit le mapping organisation et la readiness runtime plutôt que les contrôles d’infrastructure dédiée.'
                  )}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] ${getRuntimeVerificationTone(schemaState.runtimeVerificationOk)}`}>
                  {schemaState.runtimeVerificationOk === true
                    ? <CheckCircle2 className="h-3.5 w-3.5" />
                    : schemaState.runtimeVerificationOk === false
                      ? <ShieldAlert className="h-3.5 w-3.5" />
                      : <Clock3 className="h-3.5 w-3.5" />}
                  {getRuntimeVerificationLabel(schemaState.runtimeVerificationOk, tr)}
                </span>
                <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-700">
                  {formatTenancyModeLabel(tenancyMode, tr)}
                </span>
              </div>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {[
                [tr('Organization id', 'Identifiant organisation'), sharedTenantOrganizationIdentity.organizationId || '—'],
                [tr('Organization slug', 'Slug organisation'), sharedTenantOrganizationIdentity.organizationSlug || '—'],
                [tr('Runtime verified', 'Runtime vérifié'), schemaState.runtimeLastVerifiedAt ? formatDateTime(schemaState.runtimeLastVerifiedAt) : tr('Never verified', 'Jamais vérifié')],
                [tr('Schema version', 'Version schéma'), schemaState.schemaVersion || 'v1'],
              ].map(([label, value]) => (
                <div key={label} className="rounded-3xl border border-slate-200 bg-slate-50/70 p-4">
                  <p className={lightLabelClass}>{label}</p>
                  <p className="mt-2 break-words text-sm font-semibold text-slate-900">{value}</p>
                </div>
              ))}
            </div>

            <div className="mt-5 flex justify-end">
              <button
                type="button"
                disabled={isSchemaBusy}
                onClick={() => runSchemaAction('runtime')}
                className={lightPrimaryButtonClass}
              >
                {busy === 'schema-runtime' ? tr('Checking runtime...', 'Vérification runtime...') : tr('Verify shared runtime', 'Vérifier le runtime partagé')}
              </button>
            </div>
          </section>
          ) : null}

          {detailTab === 'overview' ? (
          <section className={`${lightSectionClass} p-5`}>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">{tr('Access mode', 'Mode d’accès')}</p>
                <h3 className={lightSectionHeadingClass}>{tr('Platform execution context', 'Contexte d’exécution plateforme')}</h3>
                <p className="mt-2 text-sm font-medium leading-6 text-slate-500">
                  {isPlatformOwner
                    ? tr(
                        'Changes from this page use platform-owner authority.',
                        'Les changements depuis ce panneau utilisent l’autorité du propriétaire plateforme.'
                      )
                    : isPlatformAdmin
                      ? tr(
                          'Changes from this page use your delegated platform-admin access.',
                          'Les changements depuis ce panneau utilisent votre accès admin plateforme délégué.'
                        )
                      : tr(
                          'Changes from this page follow the permissions attached to the current session.',
                          'Les changements depuis ce panneau suivent les permissions attachées à la session actuelle.'
                        )}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] ${
                  isPlatformOwner
                    ? 'border border-violet-200 bg-violet-50 text-violet-700'
                    : isPlatformAdmin
                      ? 'border border-emerald-200 bg-emerald-50 text-emerald-700'
                      : 'border border-slate-200 bg-slate-50 text-slate-700'
                }`}>
                  {isPlatformOwner
                    ? tr('Platform owner', 'Propriétaire plateforme')
                    : isPlatformAdmin
                      ? tr('Platform admin', 'Admin plateforme')
                      : tr('Session user', 'Utilisateur session')}
                </span>
                <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-700">
                  {workspace?.relationship?.isTenantOwner
                    ? tr('Linked tenant owner', 'Propriétaire tenant lié')
                    : tr('Platform-managed workspace', 'Workspace géré plateforme')}
                </span>
              </div>
            </div>
          </section>
          ) : null}

          {detailTab === 'overview' ? (
          <section className={`${lightSectionClass} p-5`}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{tr('Overview', 'Aperçu')}</p>
                <p className="mt-2 text-lg font-semibold text-slate-900">{workspace.name}</p>
                <p className="mt-1 text-sm text-slate-500">{tr('Tenant workspace summary', 'Résumé de l’espace tenant')}</p>
              </div>
              <WorkspaceStatusBadge status={status} />
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-white bg-slate-50/70 px-4 py-3">
                <p className={lightLabelClass}>{tr('Tenant name', 'Nom du tenant')}</p>
                <p className="mt-2 text-base font-semibold text-slate-900">{workspace.name}</p>
              </div>
              <div className="rounded-2xl border border-white bg-slate-50/70 px-4 py-3">
                <p className={lightLabelClass}>{tr('Tenant slug', 'Slug du tenant')}</p>
                <p className="mt-2 text-base font-semibold text-slate-900">{workspace.slug || tr('Slug not assigned yet', 'Slug pas encore assigné')}</p>
              </div>
              <div className="rounded-2xl border border-white bg-slate-50/70 px-4 py-3">
                <p className={lightLabelClass}>{tr('Owner name', 'Nom du propriétaire')}</p>
                <p className="mt-2 text-base font-semibold text-slate-900">{workspace.ownerName || '—'}</p>
              </div>
              <div className="rounded-2xl border border-white bg-slate-50/70 px-4 py-3">
                <p className={lightLabelClass}>{tr('Owner email', 'Email du propriétaire')}</p>
                <p className="mt-2 break-all text-base font-semibold text-slate-900">{workspace.ownerEmail || '—'}</p>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">{tr('Your role', 'Votre rôle')}</span>
              <WorkspacePlanBadge planType={controlsDraft.plan_type} />
              <WorkspaceRelationshipBadge relationship={workspace.relationship} />
              {workspace.relationship?.isCurrentTenant ? (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-[11px] font-black uppercase tracking-[0.14em] text-violet-700">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  {tr('Current tenant context', 'Contexte tenant actif')}
                </span>
              ) : null}
            </div>
          </section>
          ) : null}

          {detailTab === 'owner_identity' ? (
          <section className={`${lightSectionClass} p-5`}>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className={lightEyebrowClass}>{tr('Owner identity', 'Identité propriétaire')}</p>
                <h3 className={lightSectionHeadingClass}>{tr('Access and runtime context', 'Accès et contexte runtime')}</h3>
                <p className="mt-1 text-sm leading-6 text-slate-500">
                  {tr(
                    'This section shows how the tenant is being managed from the platform side and which runtime links are currently available.',
                    'Cette section montre comment le tenant est géré côté plateforme et quels liens runtime sont actuellement disponibles.'
                  )}
                </p>
              </div>
              <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-700">
                {workspace.relationship?.isTenantOwner ? tr('Linked owner', 'Propriétaire lié') : tr('Platform managed', 'Géré plateforme')}
              </span>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-3xl border border-slate-200 bg-slate-50/70 p-4">
                <p className={lightLabelClass}>{tr('Owner identity', 'Identité propriétaire')}</p>
                <p className="mt-2 text-base font-semibold text-slate-900">
                  {workspace.relationship?.isTenantOwner ? tr('Linked to your signed-in account', 'Lié à votre compte connecté') : tr('Managed from platform admin', 'Géré depuis admin plateforme')}
                </p>
              </div>
              <div className="rounded-3xl border border-slate-200 bg-slate-50/70 p-4">
                <p className={lightLabelClass}>{tr('Access mode', 'Mode d’accès')}</p>
                <div className="mt-2">
                  <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] ${accessMode.tone}`}>
                    {accessMode.label}
                  </span>
                </div>
              </div>
              {[
                [tr('Started', 'Démarré'), formatDate(tenant?.provisioning_started_at || job?.started_at)],
                [tr('Completed', 'Terminé'), formatDate(tenant?.provisioning_completed_at || tenant?.provisioned_at || job?.finished_at)],
                [tr('Storefront URL', 'URL vitrine'), storefrontUrl || '—'],
                [tr('Workspace URL', 'URL espace admin'), workspaceUrl || '—'],
                [tr('Last update', 'Dernière mise à jour'), formatDateTime(lastProvisioningUpdate)],
              ].map(([label, value]) => (
                <div key={label} className="rounded-3xl border border-slate-200 bg-slate-50/70 p-4">
                  <p className={lightLabelClass}>{label}</p>
                  <p className="mt-2 break-all text-sm font-semibold text-slate-900">{value}</p>
                </div>
              ))}
            </div>
            <div className={`${lightInsetSoftClass} px-3 py-3 text-sm font-semibold leading-6 text-slate-600`}>
              {accessMode.note}
            </div>
          {(tenant?.provisioning_error || job?.error_message) ? (
              <div className="rounded-2xl border border-rose-100 bg-rose-50 px-3 py-3 text-sm font-semibold text-rose-700">
                {tenant?.provisioning_error || job?.error_message}
              </div>
            ) : null}
          </section>
          ) : null}

          {detailTab === 'overview' ? (
          <section className={`${lightSectionClass} p-5`}>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className={lightEyebrowClass}>{tr('Tenant health', 'Santé du tenant')}</p>
                <h3 className={lightSectionHeadingClass}>{healthReport.summary}</h3>
                <p className="mt-1 text-sm text-slate-500">{tr('Registry health summary.', 'Résumé de santé du registre.')}</p>
              </div>
              <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] ${getHealthSeverityTone(healthReport.severity)}`}>
                {healthReport.severity === 'healthy' ? <CheckCircle2 className="h-3.5 w-3.5" /> : healthReport.severity === 'critical' ? <ShieldAlert className="h-3.5 w-3.5" /> : <Clock3 className="h-3.5 w-3.5" />}
                {healthReport.severity === 'healthy'
                  ? tr('Healthy', 'Sain')
                  : healthReport.severity === 'critical'
                    ? tr('Critical', 'Critique')
                    : tr('Needs review', 'À vérifier')}
              </span>
            </div>

            <div className="mt-4 grid gap-3">
              {healthReport.checks.map((item) => (
                <div key={item.key} className={`${lightInsetSoftClass} px-4 py-3`}>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{item.label}</p>
                      <p className="mt-1 text-sm leading-6 text-slate-600">{item.detail}</p>
                    </div>
                    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${getHealthSeverityTone(item.state)}`}>
                      {item.state === 'healthy' ? <CheckCircle2 className="h-3.5 w-3.5" /> : item.state === 'critical' ? <ShieldAlert className="h-3.5 w-3.5" /> : <Clock3 className="h-3.5 w-3.5" />}
                      {item.state === 'healthy'
                        ? tr('Healthy', 'Sain')
                        : item.state === 'critical'
                          ? tr('Critical', 'Critique')
                          : tr('Warning', 'Alerte')}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            <div className={`mt-5 ${lightInsetSoftClass} px-4 py-4`}>
              <p className={lightEyebrowClass}>{tr('Recovery guidance', 'Guide de reprise')}</p>
              <div className="mt-3 space-y-2">
                {healthReport.recommendations.map((item, index) => (
                  <p key={`${index}-${item}`} className="text-sm leading-6 text-slate-700">
                    {index + 1}. {item}
                  </p>
                ))}
              </div>
            </div>
          </section>
          ) : null}

          {detailTab === 'overview' ? (
          <section className={`${lightSectionClass} p-5`}>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className={lightEyebrowClass}>{tr('Schema release', 'Release schéma')}</p>
                <h3 className={lightSectionHeadingClass}>{tr('Canonical tenant upgrade state', 'État d’upgrade canonique du tenant')}</h3>
                <p className="mt-1 text-sm text-slate-500">{tr('Schema and runtime release controls.', 'Contrôles de release schéma et runtime.')}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] ${getSchemaVerificationTone(schemaState.verificationOk)}`}>
                  {schemaState.verificationOk === true
                    ? <CheckCircle2 className="h-3.5 w-3.5" />
                    : schemaState.verificationOk === false
                      ? <ShieldAlert className="h-3.5 w-3.5" />
                      : <Clock3 className="h-3.5 w-3.5" />}
                  {getSchemaVerificationLabel(schemaState.verificationOk, tr)}
                </span>
                <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] ${getRuntimeVerificationTone(schemaState.runtimeVerificationOk)}`}>
                  {schemaState.runtimeVerificationOk === true
                    ? <CheckCircle2 className="h-3.5 w-3.5" />
                    : schemaState.runtimeVerificationOk === false
                      ? <ShieldAlert className="h-3.5 w-3.5" />
                      : <Clock3 className="h-3.5 w-3.5" />}
                  {getRuntimeVerificationLabel(schemaState.runtimeVerificationOk, tr)}
                </span>
                {schemaState.releaseId ? (
                  <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-700">
                    {formatSchemaReleaseLabel(schemaState.releaseId)}
                  </span>
                ) : null}
              </div>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {[
                [tr('Schema version', 'Version schéma'), schemaState.schemaVersion || 'v1'],
                [tr('Recorded release', 'Release enregistrée'), schemaState.releaseId ? formatSchemaReleaseLabel(schemaState.releaseId) : tr('Not set yet', 'Pas encore définie')],
                [tr('Contract version', 'Version contrat'), schemaState.contractVersion || tr('Not set yet', 'Pas encore définie')],
                [tr('Last verified', 'Dernière vérification'), schemaState.lastVerifiedAt ? formatDateTime(schemaState.lastVerifiedAt) : tr('Never verified', 'Jamais vérifié')],
                [tr('Runtime verified', 'Runtime vérifié'), schemaState.runtimeLastVerifiedAt ? formatDateTime(schemaState.runtimeLastVerifiedAt) : tr('Never verified', 'Jamais vérifié')],
                [
                  tr('Module access', 'Accès modules'),
                  (() => {
                    const runtimeVerification = schemaActionResult?.result?.runtimeVerification || schemaState.runtimeVerification || {};
                    const enabledCount = Number(runtimeVerification.enabledModuleCount || runtimeVerification.moduleAccessCount || 0);
                    const expectedCount = Number(runtimeVerification.expectedModuleCount || enabledCount || 0);
                    return expectedCount ? `${enabledCount}/${expectedCount}` : tr('Not recorded yet', 'Pas encore enregistré');
                  })(),
                ],
              ].map(([label, value]) => (
                <div key={label} className="rounded-3xl border border-slate-200 bg-slate-50/70 p-4">
                  <p className={lightLabelClass}>{label}</p>
                  <p className="mt-2 text-sm font-semibold break-words text-slate-900">{value}</p>
                </div>
              ))}
            </div>

            {schemaState.latestJob ? (
              <div className="mt-4 rounded-3xl border border-slate-200 bg-slate-50/70 p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <p className={lightLabelClass}>{tr('Latest schema job', 'Dernier job schéma')}</p>
                    <p className="mt-2 text-sm font-semibold text-slate-900">
                      {getSchemaJobTypeLabel(schemaState.latestJob.job_type, tr)}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${getSchemaJobStatusTone(schemaState.latestJob.job_status)}`}>
                      {String(schemaState.latestJob.job_status || 'queued').trim().toLowerCase()}
                    </span>
                    <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-600">
                      {formatDateTime(schemaState.latestJob.finished_at || schemaState.latestJob.started_at || schemaState.latestJob.created_at)}
                    </span>
                  </div>
                </div>
              </div>
            ) : null}

            <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <button
                type="button"
                disabled={isSchemaBusy}
                onClick={() => runSchemaAction('plan')}
                className={lightSecondaryButtonClass}
              >
                {busy === 'schema-plan' ? tr('Planning...', 'Planification...') : tr('Plan upgrade', 'Planifier l’upgrade')}
              </button>
              <button
                type="button"
                disabled={isSchemaBusy}
                onClick={() => setConfirmSchemaApply(true)}
                className={lightPrimaryButtonClass}
              >
                {busy === 'schema-apply' ? tr('Applying...', 'Application...') : tr('Apply upgrade', 'Appliquer l’upgrade')}
              </button>
              <button
                type="button"
                disabled={isSchemaBusy}
                onClick={() => runSchemaAction('verify')}
                className={lightSecondaryButtonClass}
              >
                {busy === 'schema-verify' ? tr('Verifying...', 'Vérification...') : tr('Verify release', 'Vérifier la release')}
              </button>
              <button
                type="button"
                disabled={isSchemaBusy}
                onClick={() => runSchemaAction('runtime')}
                className={lightSecondaryButtonClass}
              >
                {busy === 'schema-runtime' ? tr('Checking runtime...', 'Vérification runtime...') : tr('Verify runtime', 'Vérifier le runtime')}
              </button>
              <button
                type="button"
                disabled={isSchemaBusy}
                onClick={() => runSchemaAction('drift')}
                className={lightSecondaryButtonClass}
              >
                {busy === 'schema-drift' ? tr('Loading drift...', 'Chargement drift...') : tr('View drift', 'Voir le drift')}
              </button>
            </div>

            {isSchemaBusy ? (
              <div className="mt-4 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-800">
                {busy === 'schema-plan'
                  ? tr('Planning the canonical schema release for this tenant...', 'Planification de la release schéma canonique pour ce tenant...')
                  : busy === 'schema-apply'
                    ? tr('Applying the guarded canonical upgrade and verifying the tenant afterward...', 'Application de l’upgrade canonique protégé puis vérification du tenant...')
                    : busy === 'schema-verify'
                      ? tr('Verifying this tenant against the approved canonical release...', 'Vérification de ce tenant par rapport à la release canonique approuvée...')
                      : busy === 'schema-runtime'
                        ? tr('Verifying runtime integrity, owner access, and module access readiness...', 'Vérification de l’intégrité runtime, des accès propriétaire et des modules...')
                      : tr('Loading the latest schema drift snapshot...', 'Chargement du dernier instantané de drift schéma...')}
              </div>
            ) : null}

            {!isSchemaBusy && schemaActionResult?.error ? (
              <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
                {schemaActionResult.error}
              </div>
            ) : null}

            {shouldShowSchemaSuccessBanner ? (
              <div className={`mt-4 rounded-2xl border px-4 py-3 text-sm font-semibold ${
                schemaActionResult.action === 'plan' || latestSchemaOk
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                  : 'border-amber-200 bg-amber-50 text-amber-800'
              }`}>
                {(schemaActionResult.action === 'plan' || latestSchemaOk)
                  ? (
                    schemaActionResult.action === 'apply'
                      ? tr('Canonical upgrade applied and verification passed for this tenant.', 'Upgrade canonique appliqué et vérification réussie pour ce tenant.')
                      : schemaActionResult.action === 'verify'
                        ? tr('This tenant matches the approved canonical release.', 'Ce tenant correspond à la release canonique approuvée.')
                        : schemaActionResult.action === 'runtime'
                          ? tr('Runtime integrity checks passed for this tenant.', 'Les contrôles d’intégrité runtime ont réussi pour ce tenant.')
                        : schemaActionResult.action === 'plan'
                          ? tr('Upgrade plan generated successfully for this tenant.', 'Plan d’upgrade généré avec succès pour ce tenant.')
                          : tr('Schema drift loaded successfully for this tenant.', 'Le drift schéma a été chargé avec succès pour ce tenant.')
                  )
                  : (
                    schemaActionResult.action === 'drift'
                      ? tr('Schema drift was loaded. Review the blocking issues and drift summary below.', 'Le drift schéma a été chargé. Vérifiez les problèmes bloquants et le résumé ci-dessous.')
                      : schemaActionResult.action === 'runtime'
                        ? tr('Runtime verification completed, but this tenant still needs review.', 'La vérification runtime est terminée, mais ce tenant nécessite encore une revue.')
                      : tr('The schema action completed, but this tenant still needs review.', 'L’action schéma est terminée, mais ce tenant nécessite encore une vérification.')
                  )}
              </div>
            ) : null}

            {confirmSchemaApply ? (
              <div className="mt-5 rounded-3xl border border-slate-200 bg-slate-50/80 p-4">
                <p className={lightEyebrowClass}>{tr('Confirm apply', 'Confirmer l’application')}</p>
                <p className="mt-2 text-base font-semibold text-slate-900">{tr('Apply the approved canonical schema release to this tenant?', 'Appliquer la release schéma canonique approuvée à ce tenant ?')}</p>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  {tr(
                    'This runs the guarded tenant upgrade flow against the selected tenant project, then verifies the release state immediately after apply.',
                    'Cela exécute le flux protégé d’upgrade tenant contre le projet sélectionné, puis vérifie immédiatement l’état de la release après application.'
                  )}
                </p>
                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                    <p className={lightLabelClass}>{tr('Tenant', 'Tenant')}</p>
                    <p className="mt-2 text-sm font-semibold text-slate-900">{workspace.name}</p>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                    <p className={lightLabelClass}>{tr('Project ref', 'Référence projet')}</p>
                    <p className="mt-2 text-sm font-semibold text-slate-900">{tenant?.tenant_project_ref || '—'}</p>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                    <p className={lightLabelClass}>{tr('Release id', 'Release id')}</p>
                    <p className="mt-2 break-words text-sm font-semibold text-slate-900">
                      {schemaState.releaseId ? formatSchemaReleaseLabel(schemaState.releaseId) : tr('Current approved release', 'Release approuvée actuelle')}
                    </p>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setConfirmSchemaApply(false)}
                    className={lightSecondaryButtonClass}
                  >
                    {tr('Cancel', 'Annuler')}
                  </button>
                  <button
                    type="button"
                    disabled={isSchemaBusy}
                    onClick={() => runSchemaAction('apply')}
                    className={lightPrimaryButtonClass}
                  >
                    {busy === 'schema-apply' ? tr('Applying...', 'Application...') : tr('Confirm apply upgrade', 'Confirmer l’upgrade')}
                  </button>
                </div>
              </div>
            ) : null}

            {(schemaActionResult?.result || schemaActionResult?.error || schemaState.verification || schemaState.runtimeVerification) ? (
              <div className={`mt-5 ${lightInsetSoftClass} px-4 py-4`}>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className={lightEyebrowClass}>{tr('Latest schema result', 'Dernier résultat schéma')}</p>
                    <p className="mt-1 text-sm font-semibold text-slate-900">
                      {schemaActionResult?.action
                        ? tr(`Action: ${schemaActionResult.action}`, `Action : ${schemaActionResult.action}`)
                        : tr('Stored verification snapshot', 'Instantané de vérification enregistré')}
                    </p>
                  </div>
                  {(schemaActionResult?.result?.verification?.ok ?? schemaActionResult?.result?.runtimeVerification?.ok ?? schemaActionResult?.result?.ok ?? schemaState.verificationOk ?? schemaState.runtimeVerificationOk) !== null ? (
                    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${getSchemaVerificationTone(
                      schemaActionResult?.result?.verification?.ok ?? schemaActionResult?.result?.runtimeVerification?.ok ?? schemaActionResult?.result?.ok ?? schemaState.verificationOk ?? schemaState.runtimeVerificationOk
                    )}`}>
                      {getSchemaVerificationLabel(
                        schemaActionResult?.result?.verification?.ok ?? schemaActionResult?.result?.runtimeVerification?.ok ?? schemaActionResult?.result?.ok ?? schemaState.verificationOk ?? schemaState.runtimeVerificationOk,
                        tr
                      )}
                    </span>
                  ) : null}
                </div>

                {schemaActionResult?.error ? (
                  <div className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
                    {schemaActionResult.error}
                  </div>
                ) : null}

                {(() => {
                  const latestVerification =
                    schemaActionResult?.result?.verification
                    || schemaActionResult?.result
                    || schemaState.verification;
                  const latestRuntimeVerification =
                    schemaActionResult?.result?.runtimeVerification
                    || schemaState.runtimeVerification
                    || null;
                  const latestPlan = schemaActionResult?.result?.plan || null;
                  const latestApply = schemaActionResult?.result?.apply || null;
                  const safePlan = latestPlan?.safePlan || null;
                  const drift = latestVerification?.drift || schemaState.drift?.drift || schemaState.drift || null;
                  const blockingIssues = latestVerification?.blockingIssues || [];
                  const schemaStatusSummary = buildSchemaStatusSummary(schemaState, tr);
                  const runtimeStatusSummary = buildRuntimeStatusSummary({
                    runtimeVerificationOk: latestRuntimeVerification?.ok ?? schemaState.runtimeVerificationOk,
                  }, tr);
                  const runtimeBlockingIssues = latestRuntimeVerification?.blockingIssues || [];
                  const runtimeCards = [
                    [tr('Owner runtime', 'Runtime propriétaire'), latestRuntimeVerification?.ownerRuntimeReady],
                    [tr('Organization membership', 'Appartenance organisation'), latestRuntimeVerification?.ownerMembershipReady],
                    [tr('Module access', 'Accès modules'), latestRuntimeVerification?.ownerModuleAccessReady],
                    [tr('Tenant settings row', 'Ligne paramètres tenant'), latestRuntimeVerification?.tenantSettingsRowReady],
                    [tr('Workspace config', 'Config workspace'), latestRuntimeVerification?.workspaceConfigReady],
                    [tr('Dashboard shell', 'Shell dashboard'), latestRuntimeVerification?.dashboardShellReady],
                  ];

                  return (
                    <div className="mt-4 space-y-4">
                      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                        <div className="rounded-3xl border border-slate-200 bg-slate-50/70 p-4">
                          <p className={lightLabelClass}>{tr('Schema state', 'État du schéma')}</p>
                          <div className="mt-3">
                            <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${schemaStatusSummary.tone}`}>
                              {schemaStatusSummary.label}
                            </span>
                          </div>
                        </div>
                        <div className="rounded-3xl border border-slate-200 bg-slate-50/70 p-4">
                          <p className={lightLabelClass}>{tr('Runtime state', 'État runtime')}</p>
                          <div className="mt-3">
                            <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${runtimeStatusSummary.tone}`}>
                              {runtimeStatusSummary.label}
                            </span>
                          </div>
                        </div>
                        <div className="rounded-3xl border border-slate-200 bg-slate-50/70 p-4">
                          <p className={lightLabelClass}>{tr('Missing tables', 'Tables manquantes')}</p>
                          <p className="mt-3 text-2xl font-semibold tabular-nums text-slate-900">{Number(drift?.missingTableCount || 0)}</p>
                        </div>
                        <div className="rounded-3xl border border-slate-200 bg-slate-50/70 p-4">
                          <p className={lightLabelClass}>{tr('Missing columns', 'Colonnes manquantes')}</p>
                          <p className="mt-3 text-2xl font-semibold tabular-nums text-slate-900">{Number(drift?.missingColumnCount || 0)}</p>
                        </div>
                        <div className="rounded-3xl border border-slate-200 bg-slate-50/70 p-4">
                          <p className={lightLabelClass}>{tr('Blocking issues', 'Problèmes bloquants')}</p>
                          <p className="mt-3 text-2xl font-semibold tabular-nums text-slate-900">{blockingIssues.length}</p>
                        </div>
                      </div>

                      <div className="grid gap-3 lg:grid-cols-2">
                      {safePlan ? (
                        <div className="rounded-3xl border border-slate-200 bg-slate-50/70 p-4">
                          <p className={lightLabelClass}>{tr('Upgrade plan summary', 'Résumé du plan d’upgrade')}</p>
                          <div className="mt-3 space-y-2 text-sm text-slate-700">
                            <p><span className="font-semibold text-slate-900">{tr('Explicit migrations', 'Migrations explicites')}:</span> {safePlan.explicitMigrationCount || 0}</p>
                            <p><span className="font-semibold text-slate-900">{tr('Missing tables', 'Tables manquantes')}:</span> {safePlan.missingTableCount || 0}</p>
                            <p><span className="font-semibold text-slate-900">{tr('Missing columns', 'Colonnes manquantes')}:</span> {safePlan.missingColumnCount || 0}</p>
                            <p><span className="font-semibold text-slate-900">{tr('Statements to apply', 'Instructions à appliquer')}:</span> {safePlan.statementCount || 0}</p>
                          </div>
                        </div>
                      ) : null}

                      {drift ? (
                        <div className="rounded-3xl border border-slate-200 bg-slate-50/70 p-4">
                          <p className={lightLabelClass}>{tr('Drift summary', 'Résumé du drift')}</p>
                          <div className="mt-3 grid gap-3 sm:grid-cols-2">
                            {[
                              [tr('Missing tables', 'Tables manquantes'), drift.missingTableCount || 0],
                              [tr('Missing columns', 'Colonnes manquantes'), drift.missingColumnCount || 0],
                              [tr('Mismatched columns', 'Colonnes divergentes'), drift.mismatchedColumnCount || 0],
                              [tr('Missing foreign keys', 'Clés étrangères manquantes'), drift.missingForeignKeyCount || 0],
                            ].map(([label, value]) => (
                              <div key={label} className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                                <p className={lightLabelClass}>{label}</p>
                                <p className="mt-2 text-xl font-semibold tabular-nums text-slate-900">{value}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}

                      {latestApply ? (
                        <div className="rounded-3xl border border-slate-200 bg-slate-50/70 p-4">
                          <p className={lightLabelClass}>{tr('Latest apply summary', 'Résumé de la dernière application')}</p>
                          <div className="mt-3 space-y-2 text-sm text-slate-700">
                            <p><span className="font-semibold text-slate-900">{tr('Release id', 'Release id')}:</span> {formatSchemaReleaseLabel(latestApply.releaseId || schemaState.releaseId || '—')}</p>
                            <p><span className="font-semibold text-slate-900">{tr('Applied statements', 'Instructions appliquées')}:</span> {latestApply.appliedStatementCount || 0}</p>
                            <p><span className="font-semibold text-slate-900">{tr('Explicit migrations', 'Migrations explicites')}:</span> {(latestApply.explicitMigrationIds || []).join(', ') || '—'}</p>
                          </div>
                        </div>
                      ) : null}

                      {blockingIssues.length ? (
                        <div className="rounded-3xl border border-amber-200 bg-amber-50 p-4">
                          <p className={lightLabelClass}>{tr('Blocking issues', 'Problèmes bloquants')}</p>
                          <div className="mt-3 grid gap-2">
                            {blockingIssues.map((item) => (
                              <div key={item} className="rounded-2xl border border-amber-200 bg-white/70 px-3 py-2 text-sm font-semibold text-amber-900">
                                {item}
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}

                      {latestRuntimeVerification ? (
                        <div className="rounded-3xl border border-slate-200 bg-slate-50/70 p-4 lg:col-span-2">
                          <p className={lightLabelClass}>{tr('Runtime checks', 'Contrôles runtime')}</p>
                          <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                            {runtimeCards.map(([label, ok]) => (
                              <div key={label} className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                                <p className={lightLabelClass}>{label}</p>
                                <div className="mt-2">
                                  <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${getRuntimeVerificationTone(typeof ok === 'boolean' ? ok : null)}`}>
                                    {typeof ok === 'boolean' ? getRuntimeVerificationLabel(ok, tr) : tr('Not checked', 'Non vérifié')}
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                          {(latestRuntimeVerification.enabledModuleCount || latestRuntimeVerification.expectedModuleCount || latestRuntimeVerification.moduleAccessCount) ? (
                            <div className="mt-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
                              <span className="font-semibold text-slate-900">{tr('Module access coverage', 'Couverture accès modules')}:</span>{' '}
                              {Number(latestRuntimeVerification.enabledModuleCount || latestRuntimeVerification.moduleAccessCount || 0)}
                              /
                              {Number(latestRuntimeVerification.expectedModuleCount || latestRuntimeVerification.enabledModuleCount || latestRuntimeVerification.moduleAccessCount || 0)}
                            </div>
                          ) : null}
                        </div>
                      ) : null}

                      {runtimeBlockingIssues.length ? (
                        <div className="rounded-3xl border border-amber-200 bg-amber-50 p-4 lg:col-span-2">
                          <p className={lightLabelClass}>{tr('Runtime issues', 'Problèmes runtime')}</p>
                          <div className="mt-3 grid gap-2">
                            {runtimeBlockingIssues.map((item) => (
                              <div key={item} className="rounded-2xl border border-amber-200 bg-white/70 px-3 py-2 text-sm font-semibold text-amber-900">
                                {item}
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}
                      </div>
                    </div>
                  );
                })()}
              </div>
            ) : null}
          </section>
          ) : null}

          {detailTab === 'audit' ? (
          <section className={`${lightSectionClass} p-5`}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className={lightEyebrowClass}>{tr('Audit log', 'Journal d’audit')}</p>
                <h3 className={lightSectionHeadingClass}>{tr('Recent tenant activity', 'Activité tenant récente')}</h3>
                <p className="mt-1 text-sm text-slate-500">{tr('Recent admin and access events.', 'Événements admin et accès récents.')}</p>
              </div>
              <button
                type="button"
                onClick={loadAuditRows}
                className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
              >
                <RefreshCw className={`mr-2 h-3.5 w-3.5 ${auditLoading ? 'animate-spin' : ''}`} />
                {tr('Refresh', 'Rafraîchir')}
              </button>
            </div>

            <div className="mt-4 max-h-[30rem] space-y-3 overflow-y-auto pr-1">
              {auditRows.length ? auditRows.map((item) => (
                <div key={item.id} className={`${lightInsetSoftClass} px-4 py-3`}>
                  {(() => {
                    const auditDetails = formatAuditDetails(item);
                    return (
                      <>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{formatAuditAction(item.action)}</p>
                      <p className="mt-1 text-xs font-semibold text-slate-500">
                        {item?.metadata?.performed_by_email || tr('System', 'Système')}
                      </p>
                    </div>
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
                      {formatDateTime(item.created_at)}
                    </p>
                  </div>
                  {auditDetails.length ? (
                    <div className="mt-2 text-xs font-semibold leading-5 text-slate-600">
                      {auditDetails.map((detail) => (
                        <p key={detail}>{detail}</p>
                      ))}
                    </div>
                  ) : null}
                      </>
                    );
                  })()}
                </div>
              )) : (
                <div className="rounded-[22px] border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm font-semibold text-slate-500">
                  {auditLoading ? tr('Loading audit log...', 'Chargement du journal d’audit...') : tr('No audit events yet.', 'Aucun événement d’audit pour le moment.')}
                </div>
              )}
            </div>
          </section>
          ) : null}

          {detailTab === 'owner_identity' ? (
          <section className={`${lightSectionClass} p-5`}>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className={lightEyebrowClass}>{tr('Tenant settings', 'Paramètres tenant')}</p>
                <h3 className={lightSectionHeadingClass}>{tr('Branding, language, and business identity', 'Branding, langue et identité business')}</h3>
                <p className="mt-3 text-sm text-slate-500">{tr('Workspace identity settings.', 'Paramètres d’identité du workspace.')}</p>
              </div>
              <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-700">
                {tr('Saved in tenant metadata', 'Enregistré dans les métadonnées tenant')}
              </span>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className={lightLabelClass}>{tr('Brand name', 'Nom de marque')}</span>
                <input
                  value={settingsDraft.brand_name}
                  onChange={(event) => setSettingsDraft((prev) => ({ ...prev, brand_name: event.target.value }))}
                  className={lightInputClass}
                />
              </label>
              <label className="block">
                <span className={lightLabelClass}>{tr('Public display name', 'Nom public affiché')}</span>
                <input
                  value={settingsDraft.public_display_name}
                  onChange={(event) => setSettingsDraft((prev) => ({ ...prev, public_display_name: event.target.value }))}
                  className={lightInputClass}
                />
              </label>
              <label className="block sm:col-span-2">
                <span className={lightLabelClass}>{tr('Legal business name', 'Nom légal de l’entreprise')}</span>
                <input
                  value={settingsDraft.legal_business_name}
                  onChange={(event) => setSettingsDraft((prev) => ({ ...prev, legal_business_name: event.target.value }))}
                  className={lightInputClass}
                />
              </label>
              <label className="block">
                <span className={lightLabelClass}>{tr('Support email', 'Email support')}</span>
                <input
                  type="email"
                  value={settingsDraft.support_email}
                  onChange={(event) => setSettingsDraft((prev) => ({ ...prev, support_email: event.target.value }))}
                  className={lightInputClass}
                />
              </label>
              <label className="block">
                <span className={lightLabelClass}>{tr('Custom domain', 'Domaine personnalisé')}</span>
                <input
                  value={settingsDraft.custom_domain}
                  onChange={(event) => setSettingsDraft((prev) => ({ ...prev, custom_domain: event.target.value }))}
                  placeholder={tr('Optional custom domain', 'Domaine personnalisé optionnel')}
                  className={lightInputClass}
                />
              </label>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <label className="block">
                <span className={lightLabelClass}>{tr('Default language', 'Langue par défaut')}</span>
                <select
                  value={settingsDraft.default_language}
                  onChange={(event) => setSettingsDraft((prev) => ({ ...prev, default_language: event.target.value }))}
                  className={lightInputClass}
                >
                  {[
                    ['en', 'English'],
                    ['fr', 'Français'],
                    ['ar', 'العربية'],
                  ].map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className={lightLabelClass}>{tr('Currency', 'Devise')}</span>
                <input
                  value={settingsDraft.currency}
                  onChange={(event) => setSettingsDraft((prev) => ({ ...prev, currency: event.target.value.toUpperCase() }))}
                  className={lightInputClass}
                />
              </label>
              <label className="block">
                <span className={lightLabelClass}>{tr('Timezone', 'Fuseau horaire')}</span>
                <input
                  value={settingsDraft.timezone}
                  onChange={(event) => setSettingsDraft((prev) => ({ ...prev, timezone: event.target.value }))}
                  className={lightInputClass}
                />
              </label>
              <label className="block">
                <span className={lightLabelClass}>{tr('Country', 'Pays')}</span>
                <input
                  value={settingsDraft.country}
                  onChange={(event) => setSettingsDraft((prev) => ({ ...prev, country: event.target.value }))}
                  className={lightInputClass}
                />
              </label>
            </div>

            <div className="mt-5 flex justify-end">
              <button
                type="button"
                disabled={busy === 'controls'}
                onClick={saveControls}
                className={lightPrimaryButtonClass}
              >
                {busy === 'controls' ? tr('Saving identity...', 'Enregistrement identité...') : tr('Save tenant identity', 'Enregistrer l’identité tenant')}
              </button>
            </div>
          </section>
          ) : null}

          {detailTab === 'feature_access' ? (
          <section className={`${lightSectionClass} p-5`}>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className={lightEyebrowClass}>{tr('Feature access', 'Accès fonctionnalités')}</p>
                <h3 className={lightSectionHeadingClass}>{tr('Plan, billing, and workspace features', 'Plan, facturation et fonctionnalités du workspace')}</h3>
              </div>
              <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-700">
                {enabledFeatureCount} {tr('enabled', 'actifs')}
              </span>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-3">
              <label className="block">
                <span className={lightLabelClass}>{tr('Tenancy mode', 'Mode de tenancy')}</span>
                <select
                  value={controlsDraft.tenancy_mode}
                  onChange={(event) => setControlsDraft((prev) => ({ ...prev, tenancy_mode: event.target.value }))}
                  className={lightInputClass}
                >
                  {TENANCY_MODE_OPTIONS.map((item) => (
                    <option key={item} value={item}>{formatTenancyModeLabel(item, tr)}</option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className={lightLabelClass}>{tr('Plan', 'Plan')}</span>
                <select
                  value={controlsDraft.plan_type}
                  onChange={(event) => applySuggestedPlan(event.target.value)}
                  className={lightInputClass}
                >
                  {TENANT_PLAN_ORDER.map((item) => (
                    <option key={item} value={item}>{item}</option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className={lightLabelClass}>{tr('Subscription', 'Abonnement')}</span>
                <select
                  value={controlsDraft.subscription_status}
                  onChange={(event) => setControlsDraft((prev) => ({ ...prev, subscription_status: event.target.value }))}
                  className={lightInputClass}
                >
                  {['trial', 'active', 'expired', 'cancelled', 'suspended'].map((item) => (
                    <option key={item} value={item}>{item}</option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className={lightLabelClass}>{tr('Billing', 'Facturation')}</span>
                <select
                  value={controlsDraft.billing_status}
                  onChange={(event) => setControlsDraft((prev) => ({ ...prev, billing_status: event.target.value }))}
                  className={lightInputClass}
                >
                  {['none', 'active', 'failed'].map((item) => (
                    <option key={item} value={item}>{item}</option>
                  ))}
                </select>
              </label>
            </div>

            <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm leading-6 text-slate-600">
              {controlsDraft.tenancy_mode === 'dedicated'
                ? tr(
                    'Dedicated mode preserves the legacy project-per-tenant infrastructure path for isolated or premium workspaces.',
                    'Le mode dédié préserve le chemin legacy projet-par-tenant pour les workspaces isolés ou premium.'
                  )
                : tr(
                    'Shared mode keeps this tenant on the default shared runtime with organization-level isolation and the standard subdomain experience.',
                    'Le mode partagé maintient ce tenant sur le runtime partagé par défaut avec isolation au niveau organisation et expérience sous-domaine standard.'
                  )}
            </div>

            <div className={`mt-5 ${lightInsetCardClass} p-4`}>
              <p className={lightEyebrowClass}>{tr('Module access', 'Accès modules')}</p>
              <p className="mt-2 text-sm text-slate-500">
                {tr(
                  'These switches control the core workspace modules that appear across the tenant admin.',
                  'Ces bascules contrôlent les modules principaux du workspace visibles dans l’admin du tenant.'
                )}
              </p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {moduleFeatureDefinitions.map(([key, label]) => (
                  <label
                    key={key}
                    className="flex items-start gap-3 rounded-3xl border border-slate-200 bg-slate-50/70 px-4 py-4"
                  >
                    <input
                      type="checkbox"
                      checked={Boolean(controlsDraft.feature_access[key])}
                      onChange={(event) => setControlsDraft((prev) => ({
                        ...prev,
                        feature_access: {
                          ...prev.feature_access,
                          [key]: event.target.checked,
                        },
                      }))}
                      className="mt-1 h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-400"
                    />
                    <span>
                      <span className="block text-sm font-semibold text-slate-800">{label}</span>
                      <span className="block text-xs text-slate-500">
                        {controlsDraft.feature_access[key]
                          ? tr('Enabled for this tenant', 'Activé pour ce tenant')
                          : tr('Disabled for this tenant', 'Désactivé pour ce tenant')}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            </div>

            <div className={`mt-5 ${lightInsetCardClass} p-4`}>
              <p className={lightEyebrowClass}>{tr('Advanced and add-on access', 'Accès avancé et add-ons')}</p>
              <p className="mt-2 text-sm text-slate-500">
                {tr(
                  'Use these switches for premium capabilities, public booking surfaces, and upsell-ready add-ons.',
                  'Utilisez ces bascules pour les capacités premium, les surfaces de réservation publiques et les add-ons monétisables.'
                )}
              </p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {advancedFeatureDefinitions.map(([key, label]) => (
                  <label
                    key={key}
                    className="flex items-start gap-3 rounded-3xl border border-slate-200 bg-slate-50/70 px-4 py-4"
                  >
                    <input
                      type="checkbox"
                      checked={Boolean(controlsDraft.feature_access[key])}
                      onChange={(event) => setControlsDraft((prev) => ({
                        ...prev,
                        feature_access: {
                          ...prev.feature_access,
                          [key]: event.target.checked,
                        },
                      }))}
                      className="mt-1 h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-400"
                    />
                    <span>
                      <span className="block text-sm font-semibold text-slate-800">{label}</span>
                      <span className="block text-xs text-slate-500">
                        {controlsDraft.feature_access[key]
                          ? tr('Enabled for this tenant', 'Activé pour ce tenant')
                          : tr('Disabled for this tenant', 'Désactivé pour ce tenant')}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            </div>

            <div className="mt-5 flex justify-end">
              <button
                type="button"
                disabled={busy === 'controls'}
                onClick={saveControls}
                className={lightPrimaryButtonClass}
              >
                {busy === 'controls' ? tr('Saving access controls...', 'Enregistrement accès...') : tr('Save access controls', 'Enregistrer les contrôles d’accès')}
              </button>
            </div>
            {controlsSaveNotice ? (
              <div className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
                {controlsSaveNotice}
              </div>
            ) : null}
          </section>
          ) : null}

          {detailTab === 'upgrades' ? (
          <section className={`${lightSectionClass} p-5`}>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className={lightEyebrowClass}>{tr('Upgrades', 'Montées en gamme')}</p>
                <h3 className={lightSectionHeadingClass}>{tr('Monetization and add-ons', 'Monétisation et add-ons')}</h3>
                <p className="mt-3 text-sm text-slate-500">{tr('Upgrade recommendations and billing controls.', 'Recommandations d’upgrade et contrôles de facturation.')}</p>
              </div>
              <span className={`inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] ${getWorkspacePlanTone(controlsDraft.plan_type).badge}`}>
                {tr('Current plan', 'Plan actuel')}: {controlsDraft.plan_type}
              </span>
            </div>

            <div className="mt-5 rounded-3xl border border-slate-200 bg-slate-50/70 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className={lightLabelClass}>{tr('Suggested next plan', 'Plan suivant conseillé')}</p>
                  <p className="mt-1 text-xl font-semibold text-slate-900">{upgradeRecommendations.nextPlan}</p>
                  <p className="mt-1 text-sm text-slate-500">
                    {tr(
                      `Includes up to ${upgradeRecommendations.nextBaseLimits.vehicles} vehicles, ${upgradeRecommendations.nextBaseLimits.staff} staff, ${upgradeRecommendations.nextBaseLimits.listings} listings, and ${upgradeRecommendations.nextBaseLimits.storage_gb} GB storage by default.`,
                      `Inclut jusqu’à ${upgradeRecommendations.nextBaseLimits.vehicles} véhicules, ${upgradeRecommendations.nextBaseLimits.staff} comptes équipe, ${upgradeRecommendations.nextBaseLimits.listings} annonces et ${upgradeRecommendations.nextBaseLimits.storage_gb} Go de stockage par défaut.`
                    )}
                  </p>
                </div>
                {upgradeRecommendations.nextPlan !== controlsDraft.plan_type ? (
                  <button
                    type="button"
                    onClick={() => applySuggestedPlan(upgradeRecommendations.nextPlan)}
                    className={getWorkspacePlanButtonClass(upgradeRecommendations.nextPlan)}
                  >
                    {tr('Apply suggested plan', 'Appliquer le plan conseillé')}
                  </button>
                ) : null}
              </div>
            </div>

            <div className={`mt-5 ${lightInsetCardClass} p-4`}>
              <p className={lightEyebrowClass}>{tr('Billing engine', 'Moteur de facturation')}</p>
              <p className="mt-3 text-sm text-slate-500">
                {tr(
                  'Store the commercial rules that make this upgrade path operational for the tenant.',
                  'Enregistrez les règles commerciales qui rendent ce parcours d’upgrade opérationnel pour le tenant.'
                )}
              </p>

              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <label className="block">
                  <span className={lightLabelClass}>{tr('Billing cycle', 'Cycle de facturation')}</span>
                  <select
                    value={controlsDraft.billing_engine.billing_cycle}
                    onChange={(event) => setControlsDraft((prev) => ({
                      ...prev,
                      billing_engine: {
                        ...prev.billing_engine,
                        billing_cycle: event.target.value,
                      },
                    }))}
                    className={lightInputClass}
                  >
                    <option value="monthly">{tr('Monthly', 'Mensuel')}</option>
                    <option value="quarterly">{tr('Quarterly', 'Trimestriel')}</option>
                    <option value="yearly">{tr('Yearly', 'Annuel')}</option>
                    <option value="custom">{tr('Custom', 'Personnalisé')}</option>
                  </select>
                </label>

                <label className="block">
                  <span className={lightLabelClass}>{tr('Invoicing mode', 'Mode de facturation')}</span>
                  <select
                    value={controlsDraft.billing_engine.invoicing_mode}
                    onChange={(event) => setControlsDraft((prev) => ({
                      ...prev,
                      billing_engine: {
                        ...prev.billing_engine,
                        invoicing_mode: event.target.value,
                      },
                    }))}
                    className={lightInputClass}
                  >
                    <option value="automatic">{tr('Automatic charge', 'Prélèvement automatique')}</option>
                    <option value="manual">{tr('Manual billing', 'Facturation manuelle')}</option>
                    <option value="invoice_only">{tr('Invoice only', 'Facture seulement')}</option>
                  </select>
                </label>

                <label className="block">
                  <span className={lightLabelClass}>{tr('Trial ends on', 'Fin d’essai')}</span>
                  <input
                    type="date"
                    value={controlsDraft.billing_engine.trial_ends_at}
                    onChange={(event) => setControlsDraft((prev) => ({
                      ...prev,
                      billing_engine: {
                        ...prev.billing_engine,
                        trial_ends_at: event.target.value,
                      },
                    }))}
                    className={lightInputClass}
                  />
                </label>

                <label className="block">
                  <span className={lightLabelClass}>{tr('Next renewal', 'Prochain renouvellement')}</span>
                  <input
                    type="date"
                    value={controlsDraft.billing_engine.renews_at}
                    onChange={(event) => setControlsDraft((prev) => ({
                      ...prev,
                      billing_engine: {
                        ...prev.billing_engine,
                        renews_at: event.target.value,
                      },
                    }))}
                    className={lightInputClass}
                  />
                </label>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <label className="block">
                  <span className={lightLabelClass}>{tr('Billing note', 'Note de facturation')}</span>
                  <textarea
                    value={controlsDraft.billing_engine.admin_note}
                    onChange={(event) => setControlsDraft((prev) => ({
                      ...prev,
                      billing_engine: {
                        ...prev.billing_engine,
                        admin_note: event.target.value,
                      },
                    }))}
                    rows={4}
                    placeholder={tr('Example: annual commitment with manual invoice.', 'Exemple : engagement annuel avec facture manuelle.')}
                    className={lightInputClass}
                  />
                </label>

                <label className="block">
                  <span className={lightLabelClass}>{tr('Commercial note', 'Note commerciale')}</span>
                  <textarea
                    value={controlsDraft.commercial_settings.admin_note}
                    onChange={(event) => setControlsDraft((prev) => ({
                      ...prev,
                      commercial_settings: {
                        ...prev.commercial_settings,
                        admin_note: event.target.value,
                      },
                    }))}
                    rows={4}
                    placeholder={tr('Example: OCR bundled as launch add-on for 3 months.', 'Exemple : OCR offert comme add-on de lancement pendant 3 mois.')}
                    className={lightInputClass}
                  />
                </label>
              </div>
            </div>

            {upgradeRecommendations.limitAlerts.length ? (
              <div className="mt-5">
                <p className={lightEyebrowClass}>{tr('Limit warnings', 'Alertes limites')}</p>
                <div className="mt-3 grid gap-3">
                  {upgradeRecommendations.limitAlerts.map((item) => (
                    <div key={item.key} className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4">
                      <p className="text-base font-semibold text-amber-900">{item.title}</p>
                      <p className="mt-2 text-sm leading-6 text-amber-800">{item.body}</p>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="mt-5">
              <p className={lightEyebrowClass}>{tr('Feature upsells', 'Upsells fonctionnalités')}</p>
              <div className="mt-3 grid gap-3">
                {upgradeRecommendations.featureUpsells.map((item) => (
                  <div key={item.key} className="rounded-3xl border border-slate-200 bg-slate-50/70 p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-base font-semibold text-slate-900">{item.title}</p>
                          <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${
                            item.requiresPlanUpgrade
                              ? 'border-slate-200 bg-slate-100 text-slate-700'
                              : 'border-emerald-200 bg-emerald-50 text-emerald-700'
                          }`}>
                            {item.requiresPlanUpgrade ? tr('Plan upgrade', 'Plan supérieur') : tr('Add-on ready', 'Add-on prêt')}
                          </span>
                          {item.featureSource ? (
                            <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-600">
                              {item.featureSource === 'add_on'
                                ? tr('Marked as add-on', 'Marqué add-on')
                                : item.featureSource === 'plan_upgrade'
                                  ? tr('Upgrade gated', 'Bloqué par upgrade')
                                  : item.featureSource === 'custom'
                                    ? tr('Custom access', 'Accès personnalisé')
                                    : tr('Included', 'Inclus')}
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-2 text-sm text-slate-500">{item.body}</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {item.requiresPlanUpgrade && item.suggestedPlan !== controlsDraft.plan_type ? (
                          <button
                            type="button"
                            onClick={() => applySuggestedPlan(item.suggestedPlan)}
                            className={getWorkspacePlanButtonClass(item.suggestedPlan, 'outline')}
                          >
                            {tr('Switch to', 'Passer à')} {item.suggestedPlan}
                          </button>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => setFeatureCommercialSource(item.key, 'plan_upgrade')}
                          className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
                        >
                          {tr('Mark upgrade-only', 'Marquer upgrade')}
                        </button>
                        <button
                          type="button"
                          onClick={() => setFeatureCommercialSource(item.key, 'add_on')}
                          className="inline-flex items-center justify-center rounded-2xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
                        >
                          {item.addonSelected ? tr('Add-on selected', 'Add-on sélectionné') : tr('Sell as add-on', 'Vendre en add-on')}
                        </button>
                        <button
                          type="button"
                          onClick={() => enableFeatureDraft(item.key)}
                          className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
                        >
                          {tr('Enable in draft', 'Activer en brouillon')}
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
                {!upgradeRecommendations.featureUpsells.length ? (
                  <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm font-semibold leading-6 text-emerald-800">
                    {tr('All tracked premium features are already enabled for this tenant.', 'Toutes les fonctionnalités premium suivies sont déjà activées pour ce tenant.')}
                  </div>
                ) : null}
              </div>
            </div>

            <div className="mt-5 flex justify-end">
              <button
                type="button"
                disabled={busy === 'controls'}
                onClick={saveControls}
                className={lightPrimaryButtonClass}
              >
                {busy === 'controls' ? tr('Saving upgrades...', 'Enregistrement upgrades...') : tr('Save upgrade settings', 'Enregistrer les paramètres d’upgrade')}
              </button>
            </div>
          </section>
          ) : null}

          {detailTab === 'overview' && status !== 'active' && status !== 'suspended' ? (
            <section className={`${lightSectionClass} p-5`}>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">{tr('Provisioning pipeline', 'Pipeline de provisionnement')}</p>
              <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">
                {status === 'pending'
                  ? (
                    isDedicatedTenant
                      ? tr('Start the automatic provisioning job. The backend worker will create and connect the private tenant.', 'Démarrez le job automatique. Le worker backend créera et connectera le tenant privé.')
                      : tr('Start the automatic provisioning job. The backend worker will prepare the shared tenant runtime, owner organization, and subdomain routing.', 'Démarrez le job automatique. Le worker backend préparera le runtime partagé, l’organisation propriétaire et le routage sous-domaine.')
                  )
                  : automationWasDispatched
                    ? tr('The worker has been notified. This page refreshes automatically; when it finishes, status changes to Active and Open Tenant appears.', 'Le worker a été notifié. Cette page se rafraîchit automatiquement; quand il termine, le statut passe à Actif et Ouvrir le tenant apparaît.')
                    : (
                      isDedicatedTenant
                        ? tr('The tenant is queued. Configure TENANT_PROVISIONING_WEBHOOK_URL on the backend to run this automatically.', 'Le tenant est en file. Configurez TENANT_PROVISIONING_WEBHOOK_URL côté backend pour l’exécuter automatiquement.')
                        : tr('The shared tenant is queued. Configure TENANT_PROVISIONING_WEBHOOK_URL on the backend to run this automatically.', 'Le tenant partagé est en file. Configurez TENANT_PROVISIONING_WEBHOOK_URL côté backend pour l’exécuter automatiquement.')
                    )}
              </p>

              {isDedicatedTenant ? (
                <button
                  type="button"
                  onClick={() => setShowManualConfig((value) => !value)}
                  className="mt-4 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500 underline-offset-4 hover:text-slate-700 hover:underline"
                >
                  {showManualConfig ? tr('Hide emergency activation', 'Masquer l’activation d’urgence') : tr('Emergency manual activation', 'Activation manuelle d’urgence')}
                </button>
              ) : (
                <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-3 text-sm leading-6 text-slate-600">
                  {tr(
                    'Shared tenants do not use manual project/app/API activation fields. Provisioning should complete through tenant, organization, and runtime readiness only.',
                    'Les tenants partagés n’utilisent pas les champs manuels projet/app/API. Le provisionnement doit se terminer uniquement via la readiness tenant, organisation et runtime.'
                  )}
                </div>
              )}

              {isDedicatedTenant && showManualConfig ? (
                <div className="mt-4 grid gap-3 rounded-[22px] border border-amber-200 bg-amber-50/70 p-4">
                  <p className="text-xs font-bold leading-5 text-amber-800">
                    {tr('Use this only while bootstrapping automation. Normal tenant activation should come from the provisioning worker.', 'À utiliser seulement pendant le bootstrap de l’automatisation. L’activation normale doit venir du worker de provisionnement.')}
                  </p>
                  {[
                    ['tenant_project_ref', tr('Project ref', 'Référence projet')],
                    ['tenant_api_url', tr('API URL', 'URL API')],
                    ['tenant_anon_key', tr('Anon key', 'Clé anon')],
                    ['tenant_app_url', tr('App URL', 'URL app')],
                    ['tenant_database_name', tr('Database name', 'Nom base de données')],
                    ['schema_version', tr('Schema version', 'Version schéma')],
                  ].map(([key, label]) => (
                    <label key={key} className="block">
                      <span className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">{label}</span>
                      <input
                        value={draft[key]}
                        onChange={(event) => setDraft((prev) => ({ ...prev, [key]: event.target.value }))}
                        className={lightInputClass}
                      />
                    </label>
                  ))}
                </div>
              ) : null}
            </section>
          ) : null}

          {detailTab === 'overview' && (status === 'failed' || status === 'active') ? (
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">{tr('Admin note', 'Note admin')}</span>
              <textarea
                value={draft.error_message}
                onChange={(event) => setDraft((prev) => ({ ...prev, error_message: event.target.value }))}
                rows={3}
                className={lightInputClass}
              />
            </label>
          ) : null}

          {detailTab === 'overview' ? (
          <div className={`${lightSectionClass} p-4`}>
            {status === 'pending' || status === 'failed' ? (
              <button type="button" disabled={!!busy} onClick={() => runAction('start')} className={`w-full ${lightPrimaryButtonClass}`}>
                <Clock3 className="mr-2 h-4 w-4" />
                {busy ? tr('Starting...', 'Démarrage...') : status === 'failed' ? tr('Retry automatic provisioning', 'Relancer le provisionnement automatique') : tr('Start automatic provisioning', 'Démarrer le provisionnement automatique')}
              </button>
            ) : null}
            {status === 'provisioning' ? (
              <div className="inline-flex w-full items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 px-5 py-3 text-sm font-semibold text-slate-700">
                <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                {tr('Provisioning in progress', 'Provisionnement en cours')}
              </div>
            ) : null}
            {(status === 'provisioning' || status === 'failed') && isDedicatedTenant && showManualConfig ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <button type="button" disabled={!!busy} onClick={() => runAction('complete')} className={lightPrimaryButtonClass}>
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                  {tr('Manual activate', 'Activer manuellement')}
                </button>
                <button type="button" disabled={!!busy} onClick={() => runAction('fail')} className={lightDangerButtonClass}>
                  <ShieldAlert className="mr-2 h-4 w-4" />
                  {tr('Mark as failed', 'Marquer échoué')}
                </button>
              </div>
            ) : null}
            {status === 'active' ? (
              <div className="grid gap-3 sm:grid-cols-3">
                <button type="button" onClick={() => openTrackedLink({ url: storefrontUrl, action: 'tenant_storefront_opened', target: storefrontUrl })} className={lightSecondaryButtonClass}>
                  <ExternalLink className="mr-2 h-4 w-4" />
                  {tr('Open Storefront', 'Ouvrir la vitrine')}
                </button>
                <button type="button" onClick={() => openTrackedLink({ url: workspaceUrl, action: 'tenant_workspace_opened', target: workspaceUrl })} className={lightPrimaryButtonClass}>
                  <ExternalLink className="mr-2 h-4 w-4" />
                  {accessMode.buttonLabel}
                </button>
                <button type="button" disabled={!!busy} onClick={() => runAction('suspend')} className={lightDangerButtonClass}>
                  {tr('Suspend', 'Suspendre')}
                </button>
              </div>
            ) : null}
            {status === 'suspended' ? (
              <button type="button" disabled={!!busy} onClick={() => runAction('reactivate')} className={`w-full ${lightPrimaryButtonClass}`}>
                {tr('Reactivate', 'Réactiver')}
              </button>
            ) : null}
          </div>
          ) : null}
        </div>
      </main>
    </div>
  );
};

const Workspaces = () => {
  const isFrench = i18n.resolvedLanguage === 'fr';
  const tr = (en, fr) => (isFrench ? fr : en);
  const { session, userProfile, tenantSession, platformAccess } = useAuth();
  const navigate = useNavigate();
  const { workspaceId } = useParams();
  const hostContext = useMemo(() => getHostContext(), []);
  const [rows, setRows] = useState([]);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [schemaFilter, setSchemaFilter] = useState('all');
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const platformWorkspaceUrl = useMemo(
    () => buildHostUrl({ kind: 'admin', pathname: '/admin/workspaces' }),
    []
  );

  const load = useCallback(async () => {
    if (hostContext.kind === 'tenant' && !hostContext.isLocal) {
      setRows([]);
      setLoadError('');
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setLoadError('');
      const result = await listTenants();
      const currentUser = {
        id: session?.user?.id || userProfile?.id || '',
        email: session?.user?.email || userProfile?.email || '',
      };
      const nextRows = buildWorkspaceRows(result.businessOwners, currentUser, tenantSession);
      setRows(appendFirstPartyTenantFallback({
        rows: nextRows,
        currentUser,
        activeTenantSession: tenantSession,
        hostContext,
        userProfile,
      }));
    } catch (error) {
      console.warn('Unable to load workspaces:', error);
      setLoadError(error?.message || tr('Unable to load workspaces right now.', 'Impossible de charger les espaces pour le moment.'));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [hostContext, session?.user?.email, session?.user?.id, tenantSession, userProfile]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (workspaceId) return undefined;
    if (!rows.some((row) => row.status === 'provisioning')) return undefined;

    const intervalId = window.setInterval(() => {
      load();
    }, 10000);

    return () => window.clearInterval(intervalId);
  }, [load, rows, workspaceId]);

  const filteredRows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (status !== 'all' && row.status !== status) return false;
      if (schemaFilter !== 'all' && getSchemaFilterKeyForRow(row, tr) !== schemaFilter) return false;
      if (!needle) return true;
      return [row.name, row.ownerName, row.ownerEmail, row.slug, row.status].filter(Boolean).join(' ').toLowerCase().includes(needle);
    });
  }, [rows, schemaFilter, search, status, tr]);

  const kpis = useMemo(() => rows.reduce((acc, row) => {
    acc[row.status] = (acc[row.status] || 0) + 1;
    return acc;
  }, {}), [rows]);

  const tenantHostRegistryMessage = hostContext.kind === 'tenant' && !hostContext.isLocal;
  const activeWorkspace = useMemo(
    () => (workspaceId ? rows.find((row) => row.id === workspaceId) || null : null),
    [rows, workspaceId]
  );

  if (workspaceId) {
    if (loading && !activeWorkspace) {
      return (
        <div className="min-h-screen bg-slate-50/80">
          <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
            <section className="rounded-[28px] border border-slate-200 bg-white p-8 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
              <div className="animate-pulse space-y-4">
                <div className="h-10 w-48 rounded-2xl bg-slate-100" />
                <div className="h-8 w-72 rounded-2xl bg-slate-100" />
                <div className="h-5 w-full max-w-2xl rounded-2xl bg-slate-100" />
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="h-24 rounded-[24px] bg-slate-100" />
                  <div className="h-24 rounded-[24px] bg-slate-100" />
                </div>
              </div>
            </section>
          </main>
        </div>
      );
    }

    if (!activeWorkspace) {
      return (
        <div className="min-h-screen bg-slate-50/80">
          <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
            <section className="rounded-[28px] border border-slate-200 bg-white p-8 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
              <button
                type="button"
                onClick={() => navigate('/admin/workspaces')}
                className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
              >
                <ChevronLeft className="h-4 w-4" />
                {tr('Back to workspaces', 'Retour aux workspaces')}
              </button>
              <p className="mt-6 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{tr('Workspace detail', 'Détail workspace')}</p>
              <h1 className="mt-2 text-2xl font-semibold text-slate-900">{tr('Workspace not found', 'Workspace introuvable')}</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
                {tenantHostRegistryMessage
                  ? tr(
                      'This tenant detail needs to be opened from the platform workspaces registry, not from inside an isolated tenant host.',
                      'Ce détail tenant doit être ouvert depuis le registre des workspaces plateforme, pas depuis un hôte tenant isolé.'
                    )
                  : tr(
                      'This workspace could not be found in the current registry snapshot. Refresh the registry list and try again.',
                      'Ce workspace est introuvable dans l’instantané actuel du registre. Rafraîchissez la liste puis réessayez.'
                    )}
              </p>
            </section>
          </main>
        </div>
      );
    }

    return (
      <WorkspaceDetailPage
        workspace={activeWorkspace}
        platformAccess={platformAccess}
        onBack={() => navigate('/admin/workspaces')}
        onUpdated={load}
      />
    );
  }

  return (
    <div className="min-h-screen bg-slate-50/80">
      <main className="mx-auto max-w-7xl space-y-5 px-4 py-6 sm:px-6 lg:px-8">
        <AdminModuleHero
          flush
          icon={<Building2 className="h-7 w-7" />}
          eyebrow={tr('Platform operations', 'Opérations plateforme')}
          title={tr('Tenant Workspaces', 'Workspaces tenants')}
          description={tr(
            'Provision and manage isolated tenant workspaces.',
            'Provisionnez et gérez les workspaces tenants isolés.'
          )}
          actions={(
            <button
              type="button"
              onClick={() => void load()}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:opacity-60"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              {tr('Refresh registry', 'Actualiser le registre')}
            </button>
          )}
        />

        <WorkspaceContextCard
          hostContext={hostContext}
          tenantSession={tenantSession}
          platformAccess={platformAccess}
          currentUser={{
            id: session?.user?.id || userProfile?.id || '',
            email: session?.user?.email || userProfile?.email || '',
          }}
        />

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            ['pending', tr('Pending', 'En attente')],
            ['provisioning', tr('Provisioning', 'Provisionnement')],
            ['active', tr('Active', 'Actifs')],
            ['failed', tr('Failed', 'Échoués')],
          ].map(([key, label]) => (
              <div key={key} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
                <p className="mt-3 text-3xl font-semibold text-slate-900 tabular-nums">{kpis[key] || 0}</p>
                <p className="mt-2 text-sm text-slate-500">{tr('Tenant workspaces', 'Espaces tenant')}</p>
              </div>
            ))}
        </div>

        <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{tr('Provisioning control', 'Contrôle du provisionnement')}</p>
              <h2 className="text-lg font-semibold text-slate-900">{tr('Tenant workspace registry', 'Registre des workspaces tenants')}</h2>
              <p className="mt-1 max-w-3xl text-sm text-slate-500">{tr('Open any tenant to manage it directly.', 'Ouvrez un tenant pour le gérer directement.')}</p>
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              <label className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={tr('Search workspaces...', 'Rechercher...')} className="w-full rounded-2xl border border-slate-200 bg-white py-3 pl-9 pr-4 text-sm font-semibold text-slate-700 outline-none focus:border-slate-300 focus:ring-4 focus:ring-slate-100" />
              </label>
              <select value={status} onChange={(event) => setStatus(event.target.value)} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 outline-none focus:border-slate-300 focus:ring-4 focus:ring-slate-100">
                {['all', 'pending', 'provisioning', 'active', 'failed', 'suspended'].map((item) => (
                  <option key={item} value={item}>{item === 'all' ? tr('All statuses', 'Tous les statuts') : item}</option>
                ))}
              </select>
              <select value={schemaFilter} onChange={(event) => setSchemaFilter(event.target.value)} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 outline-none focus:border-slate-300 focus:ring-4 focus:ring-slate-100">
                {[
                  ['all', tr('All schema states', 'Tous les états schéma')],
                  ['up_to_date', tr('Up to date', 'À jour')],
                  ['drift_detected', tr('Drift detected', 'Drift détecté')],
                  ['needs_verify', tr('Needs verify', 'À vérifier')],
                ].map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="mt-5">
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1.2fr)_repeat(3,minmax(0,0.6fr))]">
            <div className="rounded-3xl border border-slate-200 bg-slate-50/70 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{tr('Registry overview', 'Vue du registre')}</p>
              <p className="mt-2 text-base font-semibold text-slate-900">{tr('Platform-managed tenant inventory', 'Inventaire des tenants gérés')}</p>
              <p className="mt-2 text-sm text-slate-500">{tr('Search, filter, and open tenant workspaces.', 'Recherchez, filtrez et ouvrez les workspaces tenants.')}</p>
            </div>
            <div className="rounded-3xl border border-slate-200 bg-slate-50/70 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{tr('Visible now', 'Visibles')}</p>
              <p className="mt-2 text-2xl font-semibold text-slate-900 tabular-nums">{filteredRows.length}</p>
              <p className="mt-1 text-sm text-slate-500">{tr('Matching workspaces', 'Workspaces correspondants')}</p>
            </div>
            <div className="rounded-3xl border border-slate-200 bg-slate-50/70 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{tr('Live tenants', 'Tenants actifs')}</p>
              <p className="mt-2 text-2xl font-semibold text-slate-900 tabular-nums">{kpis.active || 0}</p>
              <p className="mt-1 text-sm text-slate-500">{tr('Ready now', 'Prêts maintenant')}</p>
            </div>
            <div className="rounded-3xl border border-slate-200 bg-slate-50/70 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{tr('Needs attention', 'À surveiller')}</p>
              <p className="mt-2 text-2xl font-semibold text-slate-900 tabular-nums">{(kpis.provisioning || 0) + (kpis.failed || 0) + (kpis.suspended || 0)}</p>
              <p className="mt-1 text-sm text-slate-500">{tr('Provisioning or blocked', 'Provisionnement ou bloqué')}</p>
            </div>
          </div>

          {tenantHostRegistryMessage ? (
            <div className="mt-5 rounded-[28px] border border-amber-200 bg-amber-50/80 p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">{tr('Platform registry', 'Registre plateforme')}</p>
              <h3 className="mt-2 text-lg font-semibold text-slate-900">{tr('Open this from the platform workspace', 'Ouvrez ceci depuis le workspace plateforme')}</h3>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
                {tr(
                  'The tenant registry is managed from the platform admin host, not from inside an isolated tenant workspace. That is why this page looked empty here even though SaharaX and owner1 exist in the registry.',
                  'Le registre des tenants est géré depuis l’hôte admin plateforme, pas depuis un workspace tenant isolé. C’est pourquoi cette page semblait vide ici alors que SaharaX et owner1 existent bien dans le registre.'
                )}
              </p>
              <div className="mt-4">
                <a
                  href={platformWorkspaceUrl}
                  className="inline-flex items-center rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
                >
                  <ExternalLink className="mr-2 h-4 w-4" />
                  {tr('Open Platform Workspaces', 'Ouvrir les workspaces plateforme')}
                </a>
              </div>
            </div>
          ) : null}

          {loadError ? (
            <div className="mt-5 rounded-[28px] border border-rose-200 bg-rose-50/80 p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-rose-600">{tr('Load error', 'Erreur de chargement')}</p>
              <p className="mt-3 text-sm leading-6 text-rose-700">{loadError}</p>
            </div>
          ) : null}

          <div className="mt-5 overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
            <table className="min-w-full divide-y divide-slate-200 text-left">
              <thead className="bg-slate-50/80">
                <tr>
                  {[tr('Workspace', 'Espace'), tr('Owner', 'Propriétaire'), tr('Your role', 'Votre rôle'), tr('Created', 'Créé'), tr('Status', 'Statut')].map((heading) => (
                    <th key={heading} className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">{heading}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {loading ? Array.from({ length: 4 }).map((_, index) => (
                  <tr key={index} className="animate-pulse">
                    <td className="px-4 py-4"><div className="h-4 w-36 rounded bg-slate-100" /></td>
                    <td className="px-4 py-4"><div className="h-4 w-44 rounded bg-slate-100" /></td>
                    <td className="px-4 py-4"><div className="h-5 w-28 rounded-full bg-slate-100" /></td>
                    <td className="px-4 py-4"><div className="h-4 w-20 rounded bg-slate-100" /></td>
                    <td className="px-4 py-4"><div className="h-5 w-24 rounded-full bg-slate-100" /></td>
                  </tr>
                )) : null}
                {!loading && filteredRows.map((row) => (
                  <tr key={row.id} tabIndex={0} role="button" onClick={() => navigate(`/admin/workspaces/${row.id}`)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') navigate(`/admin/workspaces/${row.id}`); }} className="cursor-pointer transition hover:bg-slate-50 focus:bg-slate-50 focus:outline-none">
                    <td className="px-4 py-4">
                      {(() => {
                        const rowSchemaState = buildSchemaWorkspaceState(row);
                        const rowSchemaStatus = buildSchemaStatusSummary(rowSchemaState, tr);
                        const rowRuntimeStatus = buildRuntimeStatusSummary(rowSchemaState, tr);
                        return (
                          <>
                      <p className="text-base font-semibold text-slate-900">{row.name}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <p className="text-sm text-slate-500">{row.slug || '—'}</p>
                        <WorkspacePlanBadge planType={row.subscription?.plan_type} />
                        <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-600">
                          {rowSchemaState.schemaVersion}
                        </span>
                        {rowSchemaState.releaseId ? (
                          <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-600">
                            {formatSchemaReleaseLabel(rowSchemaState.releaseId)}
                          </span>
                        ) : null}
                        <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${rowSchemaStatus.tone}`}>
                          {rowSchemaStatus.label}
                        </span>
                        <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${rowRuntimeStatus.tone}`}>
                          {rowRuntimeStatus.label}
                        </span>
                        {row.latestSchemaJob ? (
                          <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${getSchemaJobStatusTone(row.latestSchemaJob.job_status)}`}>
                            {getSchemaJobTypeLabel(row.latestSchemaJob.job_type, tr)}
                          </span>
                        ) : null}
                      </div>
                          </>
                        );
                      })()}
                    </td>
                    <td className="px-4 py-4">
                      <p className="text-base font-semibold text-slate-900">{row.ownerName}</p>
                      <p className="mt-2 text-sm text-slate-500">{row.ownerEmail}</p>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <WorkspaceRelationshipBadge relationship={row.relationship} />
                        {row.relationship?.isCurrentTenant ? (
                          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                            {tr('Current', 'Actuel')}
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-4 py-4 text-sm text-slate-500">{formatDate(row.createdAt)}</td>
                    <td className="px-4 py-4">
                      {(() => {
                        const rowSchemaState = buildSchemaWorkspaceState(row);
                        const rowSchemaStatus = buildSchemaStatusSummary(rowSchemaState, tr);
                        const rowRuntimeStatus = buildRuntimeStatusSummary(rowSchemaState, tr);
                        return (
                          <div className="flex flex-wrap items-center gap-2">
                            <WorkspaceStatusBadge status={row.status} />
                            <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                              {String(row.subscription?.subscription_status || 'trial').trim().toLowerCase()}
                            </span>
                            <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${rowSchemaStatus.tone}`}>
                              {rowSchemaStatus.label}
                            </span>
                            <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${rowRuntimeStatus.tone}`}>
                              {rowRuntimeStatus.label}
                            </span>
                          </div>
                        );
                      })()}
                    </td>
                  </tr>
                ))}
                {!loading && !filteredRows.length && !loadError && !tenantHostRegistryMessage ? (
                  <tr>
                    <td colSpan="5" className="px-4 py-16 text-center">
                      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-[22px] bg-slate-100 text-slate-500">
                        <Building2 className="h-6 w-6" />
                      </div>
                      <p className="mt-4 text-lg font-semibold text-slate-900">{tr('No workspaces yet.', 'Aucun espace pour le moment.')}</p>
                      <p className="mt-3 text-sm leading-6 text-slate-500">{tr('Approved business owners will appear here once a tenant record exists.', 'Les propriétaires business approuvés apparaîtront ici après création du tenant.')}</p>
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          </div>
        </section>
      </main>

    </div>
  );
};

export default Workspaces;
