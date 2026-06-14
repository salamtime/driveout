import { supabase } from '../lib/supabase';
import { adminApiRequest } from './adminApi';
import {
  buildEffectiveTenantFeatureAccess,
  getTenantPlanLimits,
  normalizeTenantPlanType,
} from '../config/tenantPlans';

const STAFF_ROLES = ['owner', 'admin', 'guide', 'employee', 'manager', 'mechanic', 'staff'];
const CACHE_TTL_MS = 45 * 1000;

const controlsCache = {
  value: null,
  loadedAt: 0,
};

const isPlatformOwnerEmail = (email = '') =>
  String(email || '').trim().toLowerCase() === 'salamtime2016@gmail.com';

const normalizeFeatureAccess = (featureAccess = {}) => {
  const source = featureAccess && typeof featureAccess === 'object' ? featureAccess : {};
  return { ...source };
};

const buildControlsSnapshot = ({
  planType = 'starter',
  planLimits = {},
  featureAccess = {},
  runtimeLoadFailed = false,
} = {}) => {
  const normalizedPlanType = String(planType || 'starter').trim().toLowerCase();
  const effectivePlanType = normalizeTenantPlanType(normalizedPlanType);
  const baseLimits = getTenantPlanLimits(effectivePlanType);
  const sourceLimits = planLimits && typeof planLimits === 'object' ? planLimits : {};

  return {
    planType: effectivePlanType,
    planLimits: {
      vehicles: Number(sourceLimits.vehicles ?? baseLimits.vehicles) || 0,
      staff: Number(sourceLimits.staff ?? sourceLimits.staff_users ?? baseLimits.staff) || 0,
      listings: Number(sourceLimits.listings ?? baseLimits.listings) || 0,
      storage_gb: Number(sourceLimits.storage_gb ?? baseLimits.storage_gb) || 0,
    },
    featureAccess: buildEffectiveTenantFeatureAccess(effectivePlanType, normalizeFeatureAccess(featureAccess)),
    runtimeLoadFailed,
  };
};

const readCachedControls = () => {
  if (!controlsCache.value) return null;
  if (Date.now() - controlsCache.loadedAt > CACHE_TTL_MS) return null;
  return controlsCache.value;
};

const writeCachedControls = (value) => {
  controlsCache.value = value;
  controlsCache.loadedAt = Date.now();
  return value;
};

const loadCurrentUser = async () => {
  const { data: { user } } = await supabase.auth.getUser();
  return user || null;
};

export const clearTenantRuntimeControlsCache = () => {
  controlsCache.value = null;
  controlsCache.loadedAt = 0;
};

export const getTenantRuntimeControls = async ({ forceRefresh = false } = {}) => {
  if (!forceRefresh) {
    const cached = readCachedControls();
    if (cached) return cached;
  }

  const authUser = await loadCurrentUser();
  if (!authUser?.id) {
    return writeCachedControls(buildControlsSnapshot());
  }

  if (isPlatformOwnerEmail(authUser.email)) {
    return writeCachedControls(
      buildControlsSnapshot({
        planType: 'pro',
        planLimits: getTenantPlanLimits('pro'),
        featureAccess: {
          dashboard_basic: true,
          calendar_module: true,
          rentals_basic: true,
          fleet_basic: true,
          customers_basic: true,
          documents_basic: true,
          tours_module: true,
          tasks_module: true,
          live_map_module: true,
          inventory_module: true,
          alerts_module: true,
          verification_module: true,
          workspace_settings_module: true,
          pricing_module: true,
          finance_module: true,
          fuel_module: true,
          maintenance_module: true,
          messages_module: true,
          website_editor: true,
          marketplace_module: true,
          advanced_roles_permissions: true,
          project_export: true,
          pricing_km_packages: true,
          pricing_tier_rules: true,
          pricing_fuel_rules: true,
          ocr_id_scan: true,
          whatsapp_tools: true,
          advanced_reporting: true,
          multilingual_storefront: true,
          online_booking: true,
          public_storefront: true,
        },
      })
    );
  }

  try {
    const response = await adminApiRequest('/api/tenants?resource=session');
    const tenantSession = response?.session || {};
    return writeCachedControls(
      buildControlsSnapshot({
        planType: tenantSession?.subscription?.plan_type || authUser.user_metadata?.plan_type || 'starter',
        planLimits: tenantSession?.subscription?.plan_limits || {},
        featureAccess: tenantSession?.tenant?.metadata?.feature_access || {},
      })
    );
  } catch (error) {
    console.warn('Tenant runtime controls unavailable; using session metadata fallback.', error);
    return writeCachedControls(
      buildControlsSnapshot({
        planType: authUser.user_metadata?.plan_type || authUser.app_metadata?.plan_type || 'starter',
        planLimits: {},
        featureAccess:
          authUser.user_metadata?.feature_access ||
          authUser.app_metadata?.feature_access ||
          {},
        runtimeLoadFailed: true,
      })
    );
  }
};

const getVehicleCount = async () => {
  const { count, error } = await supabase
    .from('saharax_0u4w4d_vehicles')
    .select('id', { count: 'exact', head: true });

  if (error) throw error;
  return Number(count || 0);
};

const getStaffCount = async () => {
  const data = await adminApiRequest('/api/admin/users');
  const users = Array.isArray(data?.users) ? data.users : [];

  return users.filter((user) =>
    STAFF_ROLES.includes(String(user?.role || '').trim().toLowerCase())
  ).length;
};

const getListingCount = async () => {
  const { count, error } = await supabase
    .from('app_marketplace_listings')
    .select('id', { count: 'exact', head: true });

  if (error) throw error;
  return Number(count || 0);
};

const assertWithinLimit = async ({ key, entityLabel, getCount }) => {
  const controls = await getTenantRuntimeControls();
  const limit = Number(controls?.planLimits?.[key] ?? 0);

  if (!Number.isFinite(limit) || limit <= 0) {
    throw new Error(`Your tenant plan does not allow creating ${entityLabel} right now. Increase the ${entityLabel} limit first.`);
  }

  const currentCount = await getCount();
  if (currentCount >= limit) {
    throw new Error(`Your tenant has reached its ${entityLabel} limit (${currentCount}/${limit}). Upgrade the plan or raise the tenant limit first.`);
  }

  return { currentCount, limit, controls };
};

export const assertCanCreateVehicle = async () =>
  assertWithinLimit({ key: 'vehicles', entityLabel: 'vehicles', getCount: getVehicleCount });

export const assertCanCreateStaffUser = async () =>
  assertWithinLimit({ key: 'staff', entityLabel: 'staff accounts', getCount: getStaffCount });

export const assertCanCreateListing = async () =>
  assertWithinLimit({ key: 'listings', entityLabel: 'listings', getCount: getListingCount });

export const hasTenantFeatureAccess = async (featureKey) => {
  const controls = await getTenantRuntimeControls();
  if (controls?.runtimeLoadFailed) {
    console.warn(`Tenant feature check for "${featureKey}" used metadata fallback after runtime controls failed.`);
    return true;
  }
  return controls?.featureAccess?.[featureKey] === true;
};

const normalizeFeatureMessage = (messageOrOptions = '') => {
  if (typeof messageOrOptions === 'string') return messageOrOptions;
  if (messageOrOptions && typeof messageOrOptions === 'object') {
    return messageOrOptions.message || messageOrOptions.error || '';
  }
  return '';
};

export const assertTenantFeatureEnabled = async (featureKey, message = '') => {
  const hasAccess = await hasTenantFeatureAccess(featureKey);
  if (!hasAccess) {
    throw new Error(normalizeFeatureMessage(message) || 'Your tenant plan does not include this feature.');
  }
  return true;
};
