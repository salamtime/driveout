import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Building2, CheckCircle2, Clock3, ExternalLink, RefreshCw, Search, ShieldAlert, ShieldCheck, UserRound, X } from 'lucide-react';
import AdminModuleHero from '../../components/admin/AdminModuleHero';
import AdminMobileStatsRow from '../../components/admin/AdminMobileStatsRow';
import { useAuth } from '../../contexts/AuthContext';
import { PLATFORM_OWNER_EMAILS } from '../../utils/accountType';
import { buildHostUrl, getHostContext } from '../../utils/hostContext';
import {
  completeTenantProvisioning,
  createTenantAuditEvent,
  failTenantProvisioning,
  listTenants,
  listTenantAuditLog,
  reactivateTenant,
  startTenantProvisioning,
  suspendTenant,
  updateTenantControls,
} from '../../services/TenantProvisioningService';
import i18n from '../../i18n';

const statusTone = {
  pending: 'border-amber-200 bg-amber-50 text-amber-700',
  provisioning: 'border-violet-200 bg-violet-50 text-violet-700',
  active: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  failed: 'border-rose-200 bg-rose-50 text-rose-700',
  suspended: 'border-slate-300 bg-slate-100 text-slate-700',
  archived: 'border-slate-300 bg-slate-100 text-slate-700',
};

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

const FEATURE_ACCESS_KEYS = [
  'public_storefront',
  'online_booking',
  'finance_module',
  'marketplace_module',
  'ocr_id_scan',
  'whatsapp_tools',
  'advanced_reporting',
  'multilingual_storefront',
];

const PLAN_ORDER = ['starter', 'growth', 'pro'];

const PLAN_BASE_LIMITS = {
  starter: { vehicles: 10, staff: 3, listings: 5, storage_gb: 10 },
  growth: { vehicles: 30, staff: 10, listings: 20, storage_gb: 50 },
  pro: { vehicles: 100, staff: 30, listings: 100, storage_gb: 250 },
};

const FEATURE_UPGRADE_RULES = {
  public_storefront: { category: 'core', minPlan: 'starter' },
  online_booking: { category: 'growth', minPlan: 'growth' },
  finance_module: { category: 'growth', minPlan: 'growth' },
  marketplace_module: { category: 'growth', minPlan: 'growth' },
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
  const status = String(tenant?.tenant_status || (tenant?.id ? 'provisioning' : 'pending')).toLowerCase();
  const relationship = resolveWorkspaceRelationship(entry, currentUser, activeTenantSession);

  return {
    id: tenant?.id || businessAccount?.id,
    businessAccount,
    tenant,
    provisioningJob,
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
      plan_limits: PLAN_BASE_LIMITS.pro,
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
  };

  return [
    buildWorkspaceRows([fallbackEntry], currentUser, activeTenantSession)[0],
    ...rows,
  ].filter(Boolean);
};

const WorkspaceStatusBadge = ({ status }) => (
  <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-black uppercase tracking-[0.14em] ${statusTone[status] || statusTone.pending}`}>
    {status || 'pending'}
  </span>
);

const getHealthSeverityTone = (severity = 'warning') => {
  if (severity === 'healthy') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (severity === 'critical') return 'border-rose-200 bg-rose-50 text-rose-700';
  return 'border-amber-200 bg-amber-50 text-amber-700';
};

const buildTenantHealthReport = ({ workspace, controlsDraft, connectionDraft, storefrontUrl, workspaceUrl, tr, showOwnerLinkage = true }) => {
  const tenant = workspace?.tenant || {};
  const job = workspace?.provisioningJob || {};
  const relationship = workspace?.relationship || {};
  const status = String(workspace?.status || 'pending').trim().toLowerCase();
  const projectRef = String(connectionDraft?.tenant_project_ref || tenant?.tenant_project_ref || '').trim();
  const apiUrl = normalizeUrl(connectionDraft?.tenant_api_url || tenant?.tenant_api_url || '');
  const anonKey = String(connectionDraft?.tenant_anon_key || tenant?.tenant_anon_key || '').trim();
  const appUrl = normalizeUrl(connectionDraft?.tenant_app_url || tenant?.tenant_app_url || '');
  const schemaVersion = String(connectionDraft?.schema_version || tenant?.schema_version || '').trim();
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
    {
      key: 'workspace_config',
      label: tr('Workspace configuration', 'Configuration workspace'),
      state: projectRef && apiUrl && anonKey && appUrl ? 'healthy' : (status === 'active' ? 'critical' : 'warning'),
      detail: projectRef && apiUrl && anonKey && appUrl
        ? tr('Project ref, API URL, anon key, and app URL are all present.', 'La référence projet, l’URL API, la clé anon et l’URL app sont toutes présentes.')
        : tr('One or more required workspace connection fields are missing.', 'Un ou plusieurs champs de connexion workspace sont manquants.'),
    },
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
      state: storefrontUrl && workspaceUrl ? 'healthy' : (status === 'active' ? 'critical' : 'warning'),
      detail: storefrontUrl && workspaceUrl
        ? tr('Storefront and workspace URLs are available.', 'Les URLs vitrine et workspace sont disponibles.')
        : tr('Storefront or workspace URL is still missing.', 'L’URL vitrine ou workspace est encore manquante.'),
    },
    {
      key: 'schema_version',
      label: tr('Schema version', 'Version schéma'),
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
    recommendations.push(tr('Start automatic provisioning to create the isolated tenant workspace.', 'Démarrez le provisionnement automatique pour créer le workspace tenant isolé.'));
  }
  if (dispatchFailedAt) {
    recommendations.push(tr('Retry the automatic provisioning dispatch and confirm the worker webhook is configured.', 'Relancez le déclenchement automatique et confirmez que le webhook worker est configuré.'));
  }
  if (isStalledProvisioning) {
    recommendations.push(tr('Provisioning has been running for more than one hour. Review the latest job logs and either retry or fail the job explicitly.', 'Le provisionnement tourne depuis plus d’une heure. Vérifiez les derniers logs du job puis relancez-le ou marquez-le en échec.'));
  }
  if (status === 'active' && (!projectRef || !apiUrl || !anonKey || !appUrl)) {
    recommendations.push(tr('Complete the missing workspace connection fields before treating this tenant as fully live.', 'Complétez les champs de connexion workspace manquants avant de considérer ce tenant comme totalement en ligne.'));
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
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-black uppercase tracking-[0.14em] ${toneMap[key] || toneMap.platform_admin}`}>
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
      'Opening this workspace keeps your platform-admin identity. It does not sign you in as that tenant owner.',
      'L’ouverture de cet espace conserve votre identité admin plateforme. Cela ne vous connecte pas comme propriétaire de ce tenant.'
    ),
    buttonLabel: tr('Open as platform admin', 'Ouvrir comme admin plateforme'),
    tone: 'border-slate-200 bg-slate-100 text-slate-700',
  };
};

const getPlanRank = (planType = 'starter') => {
  const index = PLAN_ORDER.indexOf(String(planType || '').trim().toLowerCase());
  return index >= 0 ? index : 0;
};

const getNextPlan = (planType = 'starter') => {
  const rank = getPlanRank(planType);
  return PLAN_ORDER[Math.min(rank + 1, PLAN_ORDER.length - 1)];
};

const buildUpgradeRecommendations = ({ controlsDraft, tr, featureDefinitions }) => {
  const currentPlan = String(controlsDraft?.plan_type || 'starter').trim().toLowerCase() || 'starter';
  const currentRank = getPlanRank(currentPlan);
  const nextPlan = getNextPlan(currentPlan);
  const nextPlanDifferent = nextPlan !== currentPlan;
  const currentBaseLimits = PLAN_BASE_LIMITS[currentPlan] || PLAN_BASE_LIMITS.starter;
  const nextBaseLimits = PLAN_BASE_LIMITS[nextPlan] || currentBaseLimits;

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
  const planLimits = subscription?.plan_limits && typeof subscription.plan_limits === 'object'
    ? subscription.plan_limits
    : {};
  const featureAccess = tenant?.metadata?.feature_access && typeof tenant.metadata.feature_access === 'object'
    ? tenant.metadata.feature_access
    : {};
  const billingEngine = subscription?.metadata?.billing_engine && typeof subscription.metadata.billing_engine === 'object'
    ? subscription.metadata.billing_engine
    : {};
  const commercialSettings = tenant?.metadata?.commercial_settings && typeof tenant.metadata.commercial_settings === 'object'
    ? tenant.metadata.commercial_settings
    : {};

  return {
    plan_type: String(subscription?.plan_type || 'starter').trim().toLowerCase() || 'starter',
    subscription_status: String(subscription?.subscription_status || 'trial').trim().toLowerCase() || 'trial',
    billing_status: String(subscription?.billing_status || 'none').trim().toLowerCase() || 'none',
    plan_limits: {
      vehicles: Number(planLimits.vehicles ?? DEFAULT_PLAN_LIMITS.vehicles) || 0,
      staff: Number(planLimits.staff ?? DEFAULT_PLAN_LIMITS.staff) || 0,
      listings: Number(planLimits.listings ?? DEFAULT_PLAN_LIMITS.listings) || 0,
      storage_gb: Number(planLimits.storage_gb ?? DEFAULT_PLAN_LIMITS.storage_gb) || 0,
    },
    feature_access: FEATURE_ACCESS_KEYS.reduce((acc, key) => {
      acc[key] = Boolean(featureAccess[key]);
      return acc;
    }, {}),
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
    <section className="rounded-[30px] border border-violet-100 bg-white p-5 shadow-[0_18px_50px_rgba(15,23,42,0.05)]">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-2xl">
          <p className="text-xs font-black uppercase tracking-[0.22em] text-violet-500">{tr('Current context', 'Contexte actuel')}</p>
          <h3 className="mt-2 text-2xl font-black text-slate-950">{tr('Platform and tenant visibility', 'Visibilité plateforme et tenant')}</h3>
          <p className="mt-2 text-sm font-medium leading-6 text-slate-500">
            {tr(
              'This view separates your platform authority from your tenant membership so your own tenant can appear as linked while other companies remain platform-managed only.',
              'Cette vue sépare votre autorité plateforme de votre appartenance tenant afin que votre propre tenant apparaisse comme lié tandis que les autres sociétés restent gérées seulement depuis la plateforme.'
            )}
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:min-w-[420px]">
          <div className="rounded-[24px] border border-slate-200 bg-slate-50/80 p-4">
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-400">{tr('Platform view', 'Vue plateforme')}</p>
            <p className="mt-2 text-lg font-black text-slate-950">{platformContextLabel}</p>
            <p className="mt-1 text-xs font-semibold text-slate-500">{hostContext.hostname || tr('Current domain', 'Domaine actuel')}</p>
          </div>
          <div className="rounded-[24px] border border-violet-100 bg-violet-50/70 p-4">
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-violet-500">{tr('Tenant view', 'Vue tenant')}</p>
            <p className="mt-2 text-lg font-black text-slate-950">{tenantContextLabel}</p>
            <p className="mt-1 text-xs font-semibold text-slate-500">
              {tenant?.tenant_app_url || tenantSession?.tenantAppUrl || workspaceState || tr('Not active yet', 'Pas encore actif')}
            </p>
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-100 px-2.5 py-1 text-[11px] font-black uppercase tracking-[0.14em] text-slate-700">
          <ShieldCheck className="h-3.5 w-3.5" />
          {platformContextLabel}
        </span>
        {tenant ? (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-[11px] font-black uppercase tracking-[0.14em] text-violet-700">
            <UserRound className="h-3.5 w-3.5" />
            {tr('Signed in as tenant owner', 'Connecté comme propriétaire tenant')}
          </span>
        ) : null}
        {currentEmail ? (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-black uppercase tracking-[0.14em] text-emerald-700">
            <Building2 className="h-3.5 w-3.5" />
            {currentEmail}
          </span>
        ) : null}
      </div>

      <p className="mt-3 text-xs font-semibold text-slate-500">{tenantRoleLabel}</p>
      <p className="mt-2 text-xs font-semibold text-slate-500">{platformAbilityLabel}</p>
    </section>
  );
};

const WorkspaceDrawer = ({ workspace, onClose, onUpdated, platformAccess }) => {
  const isFrench = i18n.resolvedLanguage === 'fr';
  const tr = (en, fr) => (isFrench ? fr : en);
  const hostContext = useMemo(() => getHostContext(), []);
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
  const [showManualConfig, setShowManualConfig] = useState(false);
  const [controlsDraft, setControlsDraft] = useState(() => buildControlsDraft(workspace));
  const [settingsDraft, setSettingsDraft] = useState(() => buildSettingsDraft(workspace));
  const [auditRows, setAuditRows] = useState([]);
  const [auditLoading, setAuditLoading] = useState(false);

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

  useEffect(() => {
    if (!workspace || typeof window === 'undefined' || typeof document === 'undefined') return undefined;

    const openEvent = new CustomEvent('admin:modal-open');
    window.dispatchEvent(openEvent);

    const previousOverflow = document.body.style.overflow;
    const previousWorkspaceDrawerFlag = document.body.dataset.workspaceDrawerOpen;
    document.body.style.overflow = 'hidden';
    document.body.dataset.workspaceDrawerOpen = 'true';

    return () => {
      document.body.style.overflow = previousOverflow;
      if (previousWorkspaceDrawerFlag) {
        document.body.dataset.workspaceDrawerOpen = previousWorkspaceDrawerFlag;
      } else {
        delete document.body.dataset.workspaceDrawerOpen;
      }
      const closeEvent = new CustomEvent('admin:modal-close');
      window.dispatchEvent(closeEvent);
    };
  }, [workspace]);

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
      showOwnerLinkage: hostContext.kind === 'admin' || hostContext.isLocal,
    }),
    [controlsDraft, draft, hostContext.isLocal, hostContext.kind, storefrontUrl, workspace, workspaceUrl, tr]
  );

  if (!workspace) return null;

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
  const featureDefinitions = [
    ['public_storefront', tr('Public storefront', 'Vitrine publique')],
    ['online_booking', tr('Online booking', 'Réservation en ligne')],
    ['finance_module', tr('Finance module', 'Module finance')],
    ['marketplace_module', tr('Marketplace module', 'Module marketplace')],
    ['ocr_id_scan', tr('OCR / ID scan', 'OCR / scan ID')],
    ['whatsapp_tools', tr('WhatsApp tools', 'Outils WhatsApp')],
    ['advanced_reporting', tr('Advanced reporting', 'Rapports avancés')],
    ['multilingual_storefront', tr('Multilingual storefront', 'Vitrine multilingue')],
  ];
  const upgradeRecommendations = buildUpgradeRecommendations({ controlsDraft, tr, featureDefinitions });

  const saveControls = async () => {
    try {
      setBusy('controls');
      await updateTenantControls({
        businessAccountId: workspace?.businessAccount?.id,
        tenantId: tenant?.id,
        subscriptionPatch: controlsDraft,
        tenantPatch: {
          feature_access: controlsDraft.feature_access,
          settings: settingsDraft,
          commercial_settings: controlsDraft.commercial_settings,
        },
      });
      await loadAuditRows();
      await onUpdated?.();
    } catch (error) {
      alert(error?.message || tr('Unable to save tenant controls.', 'Impossible d’enregistrer les contrôles tenant.'));
    } finally {
      setBusy('');
    }
  };

  const applySuggestedPlan = (planType) => {
    setControlsDraft((prev) => ({ ...prev, plan_type: planType }));
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

  if (typeof document === 'undefined') return null;

  return createPortal((
    <div
      className="fixed inset-0 isolate"
      style={{ zIndex: 2147483647 }}
      data-admin-modal-open="true"
    >
      <div
        className="absolute inset-0 bg-slate-950/35 backdrop-blur-sm"
        style={{ zIndex: 2147483646 }}
        onClick={onClose}
      />
      <aside
        className="absolute inset-y-0 right-0 h-screen w-full max-w-xl overflow-y-auto bg-slate-50 shadow-[0_30px_90px_rgba(15,23,42,0.28)]"
        style={{ zIndex: 2147483647 }}
        role="dialog"
        aria-modal="true"
        aria-label={tr('Tenant workspace details', 'Détails de l’espace tenant')}
      >
        <div className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 px-6 py-5 backdrop-blur">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.22em] text-violet-500">{tr('Tenant', 'Tenant')}</p>
              <h2 className="mt-1 text-2xl font-black text-slate-950">{workspace.name}</h2>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.14em] text-violet-700">
                  {tr('Slug', 'Slug')}: {workspace.slug || tr('Not assigned', 'Non attribué')}
                </span>
                <WorkspaceRelationshipBadge relationship={workspace.relationship} />
              </div>
            </div>
            <button type="button" onClick={onClose} className="rounded-2xl border border-slate-200 p-2 text-slate-500 hover:text-slate-950">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="space-y-4 p-4 sm:p-6">
          <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">{tr('Access mode', 'Mode d’accès')}</p>
                <h3 className="mt-1 text-lg font-black text-slate-950">{tr('Platform execution context', 'Contexte d’exécution plateforme')}</h3>
                <p className="mt-1 text-sm font-medium text-slate-500">
                  {isPlatformOwner
                    ? tr(
                        'Changes from this drawer use platform-owner authority.',
                        'Les changements depuis ce panneau utilisent l’autorité du propriétaire plateforme.'
                      )
                    : isPlatformAdmin
                      ? tr(
                          'Changes from this drawer use your delegated platform-admin access.',
                          'Les changements depuis ce panneau utilisent votre accès admin plateforme délégué.'
                        )
                      : tr(
                          'Changes from this drawer follow the permissions attached to the current session.',
                          'Les changements depuis ce panneau suivent les permissions attachées à la session actuelle.'
                        )}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className={`inline-flex items-center rounded-full px-3 py-1 text-[11px] font-black uppercase tracking-[0.14em] ${
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
                <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.14em] text-slate-700">
                  {workspace?.relationship?.isTenantOwner
                    ? tr('Linked tenant owner', 'Propriétaire tenant lié')
                    : tr('Platform-managed workspace', 'Workspace géré plateforme')}
                </span>
              </div>
            </div>
          </section>

          <section className="rounded-[28px] border border-violet-100 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">{tr('Overview', 'Aperçu')}</p>
                <p className="mt-2 text-xl font-black text-slate-950">{workspace.name}</p>
                <p className="mt-1 text-sm font-semibold text-slate-500">{tr('Tenant workspace summary', 'Résumé de l’espace tenant')}</p>
              </div>
              <WorkspaceStatusBadge status={status} />
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3">
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">{tr('Tenant name', 'Nom du tenant')}</p>
                <p className="mt-1 text-sm font-black text-slate-950">{workspace.name}</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3">
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">{tr('Tenant slug', 'Slug du tenant')}</p>
                <p className="mt-1 text-sm font-black text-slate-950">{workspace.slug || tr('Slug not assigned yet', 'Slug pas encore assigné')}</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3">
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">{tr('Owner name', 'Nom du propriétaire')}</p>
                <p className="mt-1 text-sm font-black text-slate-950">{workspace.ownerName || '—'}</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3">
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">{tr('Owner email', 'Email du propriétaire')}</p>
                <p className="mt-1 break-all text-sm font-black text-slate-950">{workspace.ownerEmail || '—'}</p>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">{tr('Your role', 'Votre rôle')}</span>
              <WorkspaceRelationshipBadge relationship={workspace.relationship} />
              {workspace.relationship?.isCurrentTenant ? (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-[11px] font-black uppercase tracking-[0.14em] text-violet-700">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  {tr('Current tenant context', 'Contexte tenant actif')}
                </span>
              ) : null}
            </div>
          </section>

          <section className="grid gap-3 rounded-[28px] border border-slate-200 bg-white p-5 text-sm shadow-sm">
            <div className="flex justify-between gap-3">
              <span className="font-bold text-slate-500">{tr('Owner identity', 'Identité propriétaire')}</span>
              <span className="font-semibold text-slate-950">
                {workspace.relationship?.isTenantOwner ? tr('Linked to your signed-in account', 'Lié à votre compte connecté') : tr('Managed from platform admin', 'Géré depuis admin plateforme')}
              </span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="font-bold text-slate-500">{tr('Access mode', 'Mode d’accès')}</span>
              <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-black uppercase tracking-[0.14em] ${accessMode.tone}`}>
                {accessMode.label}
              </span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="font-bold text-slate-500">{tr('Started', 'Démarré')}</span>
              <span className="font-semibold text-slate-950">{formatDate(tenant?.provisioning_started_at || job?.started_at)}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="font-bold text-slate-500">{tr('Completed', 'Terminé')}</span>
              <span className="font-semibold text-slate-950">{formatDate(tenant?.provisioning_completed_at || tenant?.provisioned_at || job?.finished_at)}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="font-bold text-slate-500">{tr('Storefront URL', 'URL vitrine')}</span>
              <span className="truncate text-right font-semibold text-slate-950">{storefrontUrl || '—'}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="font-bold text-slate-500">{tr('Workspace URL', 'URL espace admin')}</span>
              <span className="truncate text-right font-semibold text-slate-950">{workspaceUrl || '—'}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="font-bold text-slate-500">{tr('Last update', 'Dernière mise à jour')}</span>
              <span className="font-semibold text-slate-950">{formatDateTime(lastProvisioningUpdate)}</span>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-semibold leading-6 text-slate-600">
              {accessMode.note}
            </div>
          {(tenant?.provisioning_error || job?.error_message) ? (
              <div className="rounded-2xl border border-rose-100 bg-rose-50 px-3 py-3 text-sm font-semibold text-rose-700">
                {tenant?.provisioning_error || job?.error_message}
              </div>
            ) : null}
          </section>

          <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">{tr('Tenant health', 'Santé du tenant')}</p>
                <h3 className="mt-1 text-lg font-black text-slate-950">{healthReport.summary}</h3>
                <p className="mt-1 text-sm font-medium text-slate-500">
                  {tr(
                    'A registry-side diagnostic based on provisioning status, runtime configuration, owner linkage, and commercial access state.',
                    'Un diagnostic côté registre basé sur le statut de provisionnement, la configuration runtime, le lien propriétaire et l’état d’accès commercial.'
                  )}
                </p>
              </div>
              <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-black uppercase tracking-[0.14em] ${getHealthSeverityTone(healthReport.severity)}`}>
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
                <div key={item.key} className="rounded-[22px] border border-slate-200 bg-slate-50/70 px-4 py-3">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-black text-slate-950">{item.label}</p>
                      <p className="mt-1 text-sm font-semibold leading-6 text-slate-600">{item.detail}</p>
                    </div>
                    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] ${getHealthSeverityTone(item.state)}`}>
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

            <div className="mt-5 rounded-[22px] border border-violet-100 bg-violet-50/60 px-4 py-4">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-violet-500">{tr('Recovery guidance', 'Guide de reprise')}</p>
              <div className="mt-3 space-y-2">
                {healthReport.recommendations.map((item, index) => (
                  <p key={`${index}-${item}`} className="text-sm font-semibold leading-6 text-slate-700">
                    {index + 1}. {item}
                  </p>
                ))}
              </div>
            </div>
          </section>

          <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">{tr('Audit log', 'Journal d’audit')}</p>
                <h3 className="mt-1 text-lg font-black text-slate-950">{tr('Recent tenant activity', 'Activité tenant récente')}</h3>
                <p className="mt-1 text-sm font-medium text-slate-500">
                  {tr(
                    'Tracks access events and admin control changes for this tenant.',
                    'Suit les accès et les changements de contrôles admin pour ce tenant.'
                  )}
                </p>
              </div>
              <button
                type="button"
                onClick={loadAuditRows}
                className="inline-flex items-center rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-black uppercase tracking-[0.14em] text-slate-600 hover:border-violet-200 hover:text-violet-700"
              >
                <RefreshCw className={`mr-2 h-3.5 w-3.5 ${auditLoading ? 'animate-spin' : ''}`} />
                {tr('Refresh', 'Rafraîchir')}
              </button>
            </div>

            <div className="mt-4 max-h-[30rem] space-y-3 overflow-y-auto pr-1">
              {auditRows.length ? auditRows.map((item) => (
                <div key={item.id} className="rounded-[22px] border border-slate-200 bg-slate-50/70 px-4 py-3">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-black text-slate-950">{formatAuditAction(item.action)}</p>
                      <p className="mt-1 text-xs font-semibold text-slate-500">
                        {item?.metadata?.performed_by_email || tr('System', 'Système')}
                      </p>
                    </div>
                    <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">
                      {formatDateTime(item.created_at)}
                    </p>
                  </div>
                  {(item?.metadata?.target || item?.metadata?.changed_fields) ? (
                    <div className="mt-2 text-xs font-semibold leading-5 text-slate-600">
                      {item?.metadata?.target ? (
                        <p>{tr('Target', 'Cible')}: {item.metadata.target}</p>
                      ) : null}
                      {item?.metadata?.changed_fields ? (
                        <p>
                          {tr('Updated', 'Mis à jour')}: {[
                            ...(item.metadata.changed_fields.core_controls || []),
                            ...(item.metadata.changed_fields.plan_limits || []),
                            ...(item.metadata.changed_fields.billing_engine || []),
                            ...(item.metadata.changed_fields.feature_access || []),
                            ...(item.metadata.changed_fields.tenant_settings || []),
                            ...(item.metadata.changed_fields.commercial_settings || []),
                          ].join(', ') || tr('No field summary', 'Aucun résumé de champ')}
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              )) : (
                <div className="rounded-[22px] border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm font-semibold text-slate-500">
                  {auditLoading ? tr('Loading audit log...', 'Chargement du journal d’audit...') : tr('No audit events yet.', 'Aucun événement d’audit pour le moment.')}
                </div>
              )}
            </div>
          </section>

          <section className="rounded-[28px] border border-violet-100 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-violet-500">{tr('Tenant settings', 'Paramètres tenant')}</p>
                <h3 className="mt-1 text-lg font-black text-slate-950">{tr('Branding, language, and business identity', 'Branding, langue et identité business')}</h3>
                <p className="mt-1 text-sm font-medium text-slate-500">
                  {tr(
                    'These settings define how this tenant should present itself across its storefront and workspace.',
                    'Ces paramètres définissent comment ce tenant doit se présenter sur sa vitrine et dans son espace.'
                  )}
                </p>
              </div>
              <span className="inline-flex items-center rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.14em] text-violet-700">
                {tr('Saved in tenant metadata', 'Enregistré dans les métadonnées tenant')}
              </span>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">{tr('Brand name', 'Nom de marque')}</span>
                <input
                  value={settingsDraft.brand_name}
                  onChange={(event) => setSettingsDraft((prev) => ({ ...prev, brand_name: event.target.value }))}
                  className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold outline-none focus:border-violet-300 focus:ring-4 focus:ring-violet-100"
                />
              </label>
              <label className="block">
                <span className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">{tr('Public display name', 'Nom public affiché')}</span>
                <input
                  value={settingsDraft.public_display_name}
                  onChange={(event) => setSettingsDraft((prev) => ({ ...prev, public_display_name: event.target.value }))}
                  className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold outline-none focus:border-violet-300 focus:ring-4 focus:ring-violet-100"
                />
              </label>
              <label className="block sm:col-span-2">
                <span className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">{tr('Legal business name', 'Nom légal de l’entreprise')}</span>
                <input
                  value={settingsDraft.legal_business_name}
                  onChange={(event) => setSettingsDraft((prev) => ({ ...prev, legal_business_name: event.target.value }))}
                  className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold outline-none focus:border-violet-300 focus:ring-4 focus:ring-violet-100"
                />
              </label>
              <label className="block">
                <span className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">{tr('Support email', 'Email support')}</span>
                <input
                  type="email"
                  value={settingsDraft.support_email}
                  onChange={(event) => setSettingsDraft((prev) => ({ ...prev, support_email: event.target.value }))}
                  className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold outline-none focus:border-violet-300 focus:ring-4 focus:ring-violet-100"
                />
              </label>
              <label className="block">
                <span className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">{tr('Custom domain', 'Domaine personnalisé')}</span>
                <input
                  value={settingsDraft.custom_domain}
                  onChange={(event) => setSettingsDraft((prev) => ({ ...prev, custom_domain: event.target.value }))}
                  placeholder={tr('Optional custom domain', 'Domaine personnalisé optionnel')}
                  className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold outline-none focus:border-violet-300 focus:ring-4 focus:ring-violet-100"
                />
              </label>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <label className="block">
                <span className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">{tr('Default language', 'Langue par défaut')}</span>
                <select
                  value={settingsDraft.default_language}
                  onChange={(event) => setSettingsDraft((prev) => ({ ...prev, default_language: event.target.value }))}
                  className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold outline-none focus:border-violet-300 focus:ring-4 focus:ring-violet-100"
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
                <span className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">{tr('Currency', 'Devise')}</span>
                <input
                  value={settingsDraft.currency}
                  onChange={(event) => setSettingsDraft((prev) => ({ ...prev, currency: event.target.value.toUpperCase() }))}
                  className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold outline-none focus:border-violet-300 focus:ring-4 focus:ring-violet-100"
                />
              </label>
              <label className="block">
                <span className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">{tr('Timezone', 'Fuseau horaire')}</span>
                <input
                  value={settingsDraft.timezone}
                  onChange={(event) => setSettingsDraft((prev) => ({ ...prev, timezone: event.target.value }))}
                  className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold outline-none focus:border-violet-300 focus:ring-4 focus:ring-violet-100"
                />
              </label>
              <label className="block">
                <span className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">{tr('Country', 'Pays')}</span>
                <input
                  value={settingsDraft.country}
                  onChange={(event) => setSettingsDraft((prev) => ({ ...prev, country: event.target.value }))}
                  className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold outline-none focus:border-violet-300 focus:ring-4 focus:ring-violet-100"
                />
              </label>
            </div>
          </section>

          <section className="rounded-[28px] border border-violet-100 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-violet-500">{tr('Tenant controls', 'Contrôles tenant')}</p>
                <h3 className="mt-1 text-lg font-black text-slate-950">{tr('Plan, limits, and feature access', 'Plan, limites et accès fonctionnalités')}</h3>
                <p className="mt-1 text-sm font-medium text-slate-500">
                  {tr(
                    'Use this panel to decide what this tenant can access and how large the workspace can grow.',
                    'Utilisez ce panneau pour décider à quoi ce tenant peut accéder et jusqu’où l’espace peut grandir.'
                  )}
                </p>
              </div>
              <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.14em] text-emerald-700">
                {enabledFeatureCount} {tr('features enabled', 'fonctionnalités actives')}
              </span>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-3">
              <label className="block">
                <span className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">{tr('Plan', 'Plan')}</span>
                <select
                  value={controlsDraft.plan_type}
                  onChange={(event) => setControlsDraft((prev) => ({ ...prev, plan_type: event.target.value }))}
                  className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold outline-none focus:border-violet-300 focus:ring-4 focus:ring-violet-100"
                >
                  {['starter', 'growth', 'pro'].map((item) => (
                    <option key={item} value={item}>{item}</option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">{tr('Subscription', 'Abonnement')}</span>
                <select
                  value={controlsDraft.subscription_status}
                  onChange={(event) => setControlsDraft((prev) => ({ ...prev, subscription_status: event.target.value }))}
                  className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold outline-none focus:border-violet-300 focus:ring-4 focus:ring-violet-100"
                >
                  {['trial', 'active', 'expired', 'cancelled', 'suspended'].map((item) => (
                    <option key={item} value={item}>{item}</option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">{tr('Billing', 'Facturation')}</span>
                <select
                  value={controlsDraft.billing_status}
                  onChange={(event) => setControlsDraft((prev) => ({ ...prev, billing_status: event.target.value }))}
                  className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold outline-none focus:border-violet-300 focus:ring-4 focus:ring-violet-100"
                >
                  {['none', 'active', 'failed'].map((item) => (
                    <option key={item} value={item}>{item}</option>
                  ))}
                </select>
              </label>
            </div>

            <div className="mt-5">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">{tr('Plan limits', 'Limites du plan')}</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {[
                  ['vehicles', tr('Vehicles', 'Véhicules')],
                  ['staff', tr('Staff accounts', 'Comptes équipe')],
                  ['listings', tr('Listings', 'Annonces')],
                  ['storage_gb', tr('Storage (GB)', 'Stockage (Go)')],
                ].map(([key, label]) => (
                  <label key={key} className="block">
                    <span className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">{label}</span>
                    <input
                      type="number"
                      min="0"
                      value={controlsDraft.plan_limits[key]}
                      onChange={(event) => setControlsDraft((prev) => ({
                        ...prev,
                        plan_limits: {
                          ...prev.plan_limits,
                          [key]: Math.max(0, Number(event.target.value || 0)),
                        },
                      }))}
                      className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold outline-none focus:border-violet-300 focus:ring-4 focus:ring-violet-100"
                    />
                  </label>
                ))}
              </div>
            </div>

            <div className="mt-5">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">{tr('Feature access', 'Accès fonctionnalités')}</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {featureDefinitions.map(([key, label]) => (
                  <label key={key} className="flex items-center justify-between gap-3 rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-3">
                    <span className="text-sm font-bold text-slate-800">{label}</span>
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
                      className="h-5 w-5 rounded border-slate-300 text-violet-600 focus:ring-violet-500"
                    />
                  </label>
                ))}
              </div>
            </div>

            <div className="mt-5 flex justify-end">
              <button
                type="button"
                disabled={busy === 'controls'}
                onClick={saveControls}
                className="inline-flex items-center justify-center rounded-2xl bg-slate-950 px-5 py-3 text-sm font-black text-white hover:bg-violet-800 disabled:opacity-60"
              >
                {busy === 'controls' ? tr('Saving controls...', 'Enregistrement...') : tr('Save tenant controls', 'Enregistrer les contrôles')}
              </button>
            </div>
          </section>

          <section className="rounded-[28px] border border-emerald-100 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-600">{tr('Upgrades', 'Montées en gamme')}</p>
                <h3 className="mt-1 text-lg font-black text-slate-950">{tr('Monetization and add-ons', 'Monétisation et add-ons')}</h3>
                <p className="mt-1 text-sm font-medium text-slate-500">
                  {tr(
                    'Use these suggestions to decide what should stay included, what should become a higher plan, and what can be sold as an add-on.',
                    'Utilisez ces suggestions pour décider ce qui reste inclus, ce qui doit passer sur un plan supérieur et ce qui peut être vendu en add-on.'
                  )}
                </p>
              </div>
              <span className="inline-flex items-center rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.14em] text-violet-700">
                {tr('Current plan', 'Plan actuel')}: {controlsDraft.plan_type}
              </span>
            </div>

            <div className="mt-5 rounded-[24px] border border-slate-200 bg-slate-50 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">{tr('Suggested next plan', 'Plan suivant conseillé')}</p>
                  <p className="mt-1 text-xl font-black text-slate-950">{upgradeRecommendations.nextPlan}</p>
                  <p className="mt-1 text-sm font-medium text-slate-500">
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
                    className="inline-flex items-center justify-center rounded-2xl border border-emerald-200 bg-white px-4 py-2.5 text-sm font-black text-emerald-700 hover:bg-emerald-50"
                  >
                    {tr('Apply suggested plan', 'Appliquer le plan conseillé')}
                  </button>
                ) : null}
              </div>
            </div>

            <div className="mt-5 rounded-[24px] border border-slate-200 bg-white p-4">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">{tr('Billing engine', 'Moteur de facturation')}</p>
              <p className="mt-1 text-sm font-medium text-slate-500">
                {tr(
                  'Store the commercial rules that make this upgrade path operational for the tenant.',
                  'Enregistrez les règles commerciales qui rendent ce parcours d’upgrade opérationnel pour le tenant.'
                )}
              </p>

              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <label className="block">
                  <span className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">{tr('Billing cycle', 'Cycle de facturation')}</span>
                  <select
                    value={controlsDraft.billing_engine.billing_cycle}
                    onChange={(event) => setControlsDraft((prev) => ({
                      ...prev,
                      billing_engine: {
                        ...prev.billing_engine,
                        billing_cycle: event.target.value,
                      },
                    }))}
                    className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold outline-none focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100"
                  >
                    <option value="monthly">{tr('Monthly', 'Mensuel')}</option>
                    <option value="quarterly">{tr('Quarterly', 'Trimestriel')}</option>
                    <option value="yearly">{tr('Yearly', 'Annuel')}</option>
                    <option value="custom">{tr('Custom', 'Personnalisé')}</option>
                  </select>
                </label>

                <label className="block">
                  <span className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">{tr('Invoicing mode', 'Mode de facturation')}</span>
                  <select
                    value={controlsDraft.billing_engine.invoicing_mode}
                    onChange={(event) => setControlsDraft((prev) => ({
                      ...prev,
                      billing_engine: {
                        ...prev.billing_engine,
                        invoicing_mode: event.target.value,
                      },
                    }))}
                    className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold outline-none focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100"
                  >
                    <option value="automatic">{tr('Automatic charge', 'Prélèvement automatique')}</option>
                    <option value="manual">{tr('Manual billing', 'Facturation manuelle')}</option>
                    <option value="invoice_only">{tr('Invoice only', 'Facture seulement')}</option>
                  </select>
                </label>

                <label className="block">
                  <span className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">{tr('Trial ends on', 'Fin d’essai')}</span>
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
                    className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold outline-none focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100"
                  />
                </label>

                <label className="block">
                  <span className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">{tr('Next renewal', 'Prochain renouvellement')}</span>
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
                    className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold outline-none focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100"
                  />
                </label>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <label className="block">
                  <span className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">{tr('Billing note', 'Note de facturation')}</span>
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
                    className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold outline-none focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100"
                  />
                </label>

                <label className="block">
                  <span className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">{tr('Commercial note', 'Note commerciale')}</span>
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
                    className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold outline-none focus:border-emerald-300 focus:ring-4 focus:ring-emerald-100"
                  />
                </label>
              </div>
            </div>

            {upgradeRecommendations.limitAlerts.length ? (
              <div className="mt-5">
                <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">{tr('Limit warnings', 'Alertes limites')}</p>
                <div className="mt-3 grid gap-3">
                  {upgradeRecommendations.limitAlerts.map((item) => (
                    <div key={item.key} className="rounded-[22px] border border-amber-200 bg-amber-50 px-4 py-4">
                      <p className="text-sm font-black text-amber-900">{item.title}</p>
                      <p className="mt-1 text-sm font-semibold leading-6 text-amber-800">{item.body}</p>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="mt-5">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">{tr('Feature upsells', 'Upsells fonctionnalités')}</p>
              <div className="mt-3 grid gap-3">
                {upgradeRecommendations.featureUpsells.map((item) => (
                  <div key={item.key} className="rounded-[22px] border border-slate-200 bg-white px-4 py-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-black text-slate-950">{item.title}</p>
                          <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] ${
                            item.requiresPlanUpgrade
                              ? 'border-violet-200 bg-violet-50 text-violet-700'
                              : 'border-emerald-200 bg-emerald-50 text-emerald-700'
                          }`}>
                            {item.requiresPlanUpgrade ? tr('Plan upgrade', 'Plan supérieur') : tr('Add-on ready', 'Add-on prêt')}
                          </span>
                          {item.featureSource ? (
                            <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-slate-600">
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
                        <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">{item.body}</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {item.requiresPlanUpgrade && item.suggestedPlan !== controlsDraft.plan_type ? (
                          <button
                            type="button"
                            onClick={() => applySuggestedPlan(item.suggestedPlan)}
                            className="inline-flex items-center justify-center rounded-2xl border border-violet-200 bg-violet-50 px-4 py-2.5 text-sm font-black text-violet-700 hover:bg-violet-100"
                          >
                            {tr('Switch to', 'Passer à')} {item.suggestedPlan}
                          </button>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => setFeatureCommercialSource(item.key, 'plan_upgrade')}
                          className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-black text-slate-700 hover:bg-slate-50"
                        >
                          {tr('Mark upgrade-only', 'Marquer upgrade')}
                        </button>
                        <button
                          type="button"
                          onClick={() => setFeatureCommercialSource(item.key, 'add_on')}
                          className="inline-flex items-center justify-center rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-black text-emerald-700 hover:bg-emerald-100"
                        >
                          {item.addonSelected ? tr('Add-on selected', 'Add-on sélectionné') : tr('Sell as add-on', 'Vendre en add-on')}
                        </button>
                        <button
                          type="button"
                          onClick={() => enableFeatureDraft(item.key)}
                          className="inline-flex items-center justify-center rounded-2xl border border-emerald-200 bg-white px-4 py-2.5 text-sm font-black text-emerald-700 hover:bg-emerald-50"
                        >
                          {tr('Enable in draft', 'Activer en brouillon')}
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
                {!upgradeRecommendations.featureUpsells.length ? (
                  <div className="rounded-[22px] border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm font-semibold text-emerald-800">
                    {tr('All tracked premium features are already enabled for this tenant.', 'Toutes les fonctionnalités premium suivies sont déjà activées pour ce tenant.')}
                  </div>
                ) : null}
              </div>
            </div>
          </section>

          {status !== 'active' && status !== 'suspended' ? (
            <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-400">{tr('Provisioning pipeline', 'Pipeline de provisionnement')}</p>
              <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">
                {status === 'pending'
                  ? tr('Start the automatic provisioning job. The backend worker will create and connect the private tenant.', 'Démarrez le job automatique. Le worker backend créera et connectera le tenant privé.')
                  : automationWasDispatched
                    ? tr('The worker has been notified. This drawer refreshes automatically; when it finishes, status changes to Active and Open Tenant appears.', 'Le worker a été notifié. Ce panneau se rafraîchit automatiquement; quand il termine, le statut passe à Actif et Ouvrir le tenant apparaît.')
                    : tr('The tenant is queued. Configure TENANT_PROVISIONING_WEBHOOK_URL on the backend to run this automatically.', 'Le tenant est en file. Configurez TENANT_PROVISIONING_WEBHOOK_URL côté backend pour l’exécuter automatiquement.')}
              </p>

              <button
                type="button"
                onClick={() => setShowManualConfig((value) => !value)}
                className="mt-4 text-xs font-black uppercase tracking-[0.16em] text-slate-400 underline-offset-4 hover:text-slate-700 hover:underline"
              >
                {showManualConfig ? tr('Hide emergency activation', 'Masquer l’activation d’urgence') : tr('Emergency manual activation', 'Activation manuelle d’urgence')}
              </button>

              {showManualConfig ? (
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
                        className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold outline-none focus:border-violet-300 focus:ring-4 focus:ring-violet-100"
                      />
                    </label>
                  ))}
                </div>
              ) : null}
            </section>
          ) : null}

          {(status === 'failed' || status === 'active') ? (
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">{tr('Admin note', 'Note admin')}</span>
              <textarea
                value={draft.error_message}
                onChange={(event) => setDraft((prev) => ({ ...prev, error_message: event.target.value }))}
                rows={3}
                className="mt-2 w-full rounded-[22px] border border-slate-200 px-4 py-3 text-sm font-semibold outline-none focus:border-violet-300 focus:ring-4 focus:ring-violet-100"
              />
            </label>
          ) : null}

          <div className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm">
            {status === 'pending' || status === 'failed' ? (
              <button type="button" disabled={!!busy} onClick={() => runAction('start')} className="inline-flex w-full items-center justify-center rounded-2xl bg-slate-950 px-5 py-3 text-sm font-black text-white hover:bg-violet-800 disabled:opacity-60">
                <Clock3 className="mr-2 h-4 w-4" />
                {busy ? tr('Starting...', 'Démarrage...') : status === 'failed' ? tr('Retry automatic provisioning', 'Relancer le provisionnement automatique') : tr('Start automatic provisioning', 'Démarrer le provisionnement automatique')}
              </button>
            ) : null}
            {status === 'provisioning' ? (
              <div className="inline-flex w-full items-center justify-center rounded-2xl border border-violet-100 bg-violet-50 px-5 py-3 text-sm font-black text-violet-700">
                <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                {tr('Provisioning in progress', 'Provisionnement en cours')}
              </div>
            ) : null}
            {(status === 'provisioning' || status === 'failed') && showManualConfig ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <button type="button" disabled={!!busy} onClick={() => runAction('complete')} className="inline-flex items-center justify-center rounded-2xl bg-slate-950 px-5 py-3 text-sm font-black text-white hover:bg-violet-800 disabled:opacity-60">
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                  {tr('Manual activate', 'Activer manuellement')}
                </button>
                <button type="button" disabled={!!busy} onClick={() => runAction('fail')} className="inline-flex items-center justify-center rounded-2xl border border-rose-200 bg-white px-5 py-3 text-sm font-black text-rose-700 hover:bg-rose-50 disabled:opacity-60">
                  <ShieldAlert className="mr-2 h-4 w-4" />
                  {tr('Mark as failed', 'Marquer échoué')}
                </button>
              </div>
            ) : null}
            {status === 'active' ? (
              <div className="grid gap-3 sm:grid-cols-3">
                <button type="button" onClick={() => openTrackedLink({ url: storefrontUrl, action: 'tenant_storefront_opened', target: storefrontUrl })} className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-black text-slate-700 hover:border-violet-200 hover:text-violet-700">
                  <ExternalLink className="mr-2 h-4 w-4" />
                  {tr('Open Storefront', 'Ouvrir la vitrine')}
                </button>
                <button type="button" onClick={() => openTrackedLink({ url: workspaceUrl, action: 'tenant_workspace_opened', target: workspaceUrl })} className="inline-flex items-center justify-center rounded-2xl bg-slate-950 px-5 py-3 text-sm font-black text-white hover:bg-violet-800">
                  <ExternalLink className="mr-2 h-4 w-4" />
                  {accessMode.buttonLabel}
                </button>
                <button type="button" disabled={!!busy} onClick={() => runAction('suspend')} className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-black text-slate-700 hover:border-rose-200 hover:text-rose-700 disabled:opacity-60">
                  {tr('Suspend', 'Suspendre')}
                </button>
              </div>
            ) : null}
            {status === 'suspended' ? (
              <button type="button" disabled={!!busy} onClick={() => runAction('reactivate')} className="inline-flex w-full items-center justify-center rounded-2xl bg-slate-950 px-5 py-3 text-sm font-black text-white hover:bg-violet-800 disabled:opacity-60">
                {tr('Reactivate', 'Réactiver')}
              </button>
            ) : null}
          </div>
        </div>
      </aside>
    </div>
  ), document.body);
};

const Workspaces = () => {
  const isFrench = i18n.resolvedLanguage === 'fr';
  const tr = (en, fr) => (isFrench ? fr : en);
  const { session, userProfile, tenantSession, platformAccess } = useAuth();
  const hostContext = useMemo(() => getHostContext(), []);
  const [rows, setRows] = useState([]);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [selectedWorkspace, setSelectedWorkspace] = useState(null);
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
    if (!rows.some((row) => row.status === 'provisioning')) return undefined;

    const intervalId = window.setInterval(() => {
      load();
    }, 10000);

    return () => window.clearInterval(intervalId);
  }, [load, rows]);

  useEffect(() => {
    if (!selectedWorkspace) return;
    const nextSelectedWorkspace = rows.find((row) => row.id === selectedWorkspace.id);
    if (nextSelectedWorkspace && nextSelectedWorkspace !== selectedWorkspace) {
      setSelectedWorkspace(nextSelectedWorkspace);
    }
  }, [rows, selectedWorkspace]);

  const filteredRows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (status !== 'all' && row.status !== status) return false;
      if (!needle) return true;
      return [row.name, row.ownerName, row.ownerEmail, row.slug, row.status].filter(Boolean).join(' ').toLowerCase().includes(needle);
    });
  }, [rows, search, status]);

  const kpis = useMemo(() => rows.reduce((acc, row) => {
    acc[row.status] = (acc[row.status] || 0) + 1;
    return acc;
  }, {}), [rows]);

  const tenantHostRegistryMessage = hostContext.kind === 'tenant' && !hostContext.isLocal;

  return (
    <div className="min-h-screen bg-slate-50/80">
      <AdminModuleHero
        icon={<Building2 className="h-6 w-6 text-white" />}
        eyebrow={tr('Platform operations', 'Opérations plateforme')}
        title={tr('Tenant', 'Tenant')}
        description={tr('Provision and monitor isolated business tenant workspaces.', 'Provisionnez et surveillez les espaces tenant business isolés.')}
        actions={(
          <button type="button" onClick={load} disabled={loading} className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 shadow-sm transition hover:border-violet-200 hover:text-violet-700 disabled:opacity-60">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            {tr('Refresh', 'Actualiser')}
          </button>
        )}
      />

      <main className="mx-auto max-w-7xl space-y-5 px-4 py-6 sm:px-6 lg:px-8">
        <WorkspaceContextCard
          hostContext={hostContext}
          tenantSession={tenantSession}
          platformAccess={platformAccess}
          currentUser={{
            id: session?.user?.id || userProfile?.id || '',
            email: session?.user?.email || userProfile?.email || '',
          }}
        />

        <AdminMobileStatsRow>
          {[
            ['pending', tr('Pending', 'En attente')],
            ['provisioning', tr('Provisioning', 'Provisionnement')],
            ['active', tr('Active', 'Actifs')],
            ['failed', tr('Failed', 'Échoués')],
          ].map(([key, label]) => (
            <div key={key} className="rounded-[28px] border border-violet-100/80 bg-white p-5 shadow-[0_18px_50px_rgba(15,23,42,0.05)]">
              <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">{label}</p>
              <p className="mt-3 text-3xl font-black text-slate-950">{kpis[key] || 0}</p>
              <p className="mt-1 text-xs font-semibold text-slate-500">{tr('Tenant workspaces', 'Espaces tenant')}</p>
            </div>
          ))}
        </AdminMobileStatsRow>

        <section className="rounded-[34px] border border-violet-100 bg-white p-4 shadow-[0_20px_60px_rgba(15,23,42,0.06)] sm:p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.22em] text-violet-500">{tr('Provisioning control', 'Contrôle provisionnement')}</p>
              <h2 className="mt-1 text-2xl font-black text-slate-950">{tr('Tenant workspaces', 'Espaces tenant')}</h2>
              <p className="mt-1 text-sm font-medium text-slate-500">{tr('Click a row to manage its isolated workspace.', 'Cliquez une ligne pour gérer son espace isolé.')}</p>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={tr('Search workspaces...', 'Rechercher...')} className="w-full rounded-2xl border border-slate-200 py-2.5 pl-9 pr-4 text-sm font-semibold outline-none focus:border-violet-300 focus:ring-4 focus:ring-violet-100" />
              </label>
              <select value={status} onChange={(event) => setStatus(event.target.value)} className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 outline-none focus:border-violet-300 focus:ring-4 focus:ring-violet-100">
                {['all', 'pending', 'provisioning', 'active', 'failed', 'suspended'].map((item) => (
                  <option key={item} value={item}>{item === 'all' ? tr('All statuses', 'Tous les statuts') : item}</option>
                ))}
              </select>
            </div>
          </div>

          {tenantHostRegistryMessage ? (
            <div className="mt-5 rounded-[28px] border border-amber-200 bg-amber-50/80 p-5">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-amber-700">{tr('Platform registry', 'Registre plateforme')}</p>
              <h3 className="mt-2 text-xl font-black text-slate-950">{tr('Open this from the platform workspace', 'Ouvrez ceci depuis le workspace plateforme')}</h3>
              <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-slate-600">
                {tr(
                  'The tenant registry is managed from the platform admin host, not from inside an isolated tenant workspace. That is why this page looked empty here even though SaharaX and owner1 exist in the registry.',
                  'Le registre des tenants est géré depuis l’hôte admin plateforme, pas depuis un workspace tenant isolé. C’est pourquoi cette page semblait vide ici alors que SaharaX et owner1 existent bien dans le registre.'
                )}
              </p>
              <div className="mt-4">
                <a
                  href={platformWorkspaceUrl}
                  className="inline-flex items-center rounded-2xl bg-slate-950 px-4 py-2.5 text-sm font-black text-white hover:bg-violet-800"
                >
                  <ExternalLink className="mr-2 h-4 w-4" />
                  {tr('Open Platform Workspaces', 'Ouvrir les workspaces plateforme')}
                </a>
              </div>
            </div>
          ) : null}

          {loadError ? (
            <div className="mt-5 rounded-[28px] border border-rose-200 bg-rose-50/80 p-5">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-rose-600">{tr('Load error', 'Erreur de chargement')}</p>
              <p className="mt-2 text-sm font-semibold leading-6 text-rose-700">{loadError}</p>
            </div>
          ) : null}

          <div className="mt-5 overflow-hidden rounded-[28px] border border-slate-200">
            <table className="min-w-full divide-y divide-slate-200 text-left">
              <thead className="bg-slate-50">
                <tr>
                  {[tr('Workspace', 'Espace'), tr('Owner', 'Propriétaire'), tr('Your role', 'Votre rôle'), tr('Created', 'Créé'), tr('Status', 'Statut')].map((heading) => (
                    <th key={heading} className="px-4 py-3 text-xs font-black uppercase tracking-[0.18em] text-slate-400">{heading}</th>
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
                  <tr key={row.id} tabIndex={0} role="button" onClick={() => setSelectedWorkspace(row)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') setSelectedWorkspace(row); }} className="cursor-pointer transition hover:bg-violet-50/60 focus:bg-violet-50/70 focus:outline-none">
                    <td className="px-4 py-4">
                      <p className="text-sm font-black text-slate-950">{row.name}</p>
                      <p className="mt-1 text-xs font-semibold text-slate-500">{row.slug || '—'}</p>
                    </td>
                    <td className="px-4 py-4">
                      <p className="text-sm font-bold text-slate-800">{row.ownerName}</p>
                      <p className="mt-1 text-xs font-semibold text-slate-500">{row.ownerEmail}</p>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <WorkspaceRelationshipBadge relationship={row.relationship} />
                        {row.relationship?.isCurrentTenant ? (
                          <span className="text-[11px] font-black uppercase tracking-[0.14em] text-violet-600">
                            {tr('Current', 'Actuel')}
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-4 py-4 text-sm font-semibold text-slate-600">{formatDate(row.createdAt)}</td>
                    <td className="px-4 py-4"><WorkspaceStatusBadge status={row.status} /></td>
                  </tr>
                ))}
                {!loading && !filteredRows.length && !loadError && !tenantHostRegistryMessage ? (
                  <tr>
                    <td colSpan="5" className="px-4 py-16 text-center">
                      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-[22px] bg-violet-50 text-violet-700">
                        <Building2 className="h-6 w-6" />
                      </div>
                      <p className="mt-4 text-base font-black text-slate-900">{tr('No workspaces yet.', 'Aucun espace pour le moment.')}</p>
                      <p className="mt-1 text-sm font-medium text-slate-500">{tr('Approved business owners will appear here once a tenant record exists.', 'Les propriétaires business approuvés apparaîtront ici après création du tenant.')}</p>
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      </main>

      <WorkspaceDrawer
        workspace={selectedWorkspace}
        platformAccess={platformAccess}
        onClose={() => setSelectedWorkspace(null)}
        onUpdated={async () => {
          setSelectedWorkspace(null);
          await load();
        }}
      />
    </div>
  );
};

export default Workspaces;
