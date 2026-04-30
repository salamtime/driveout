import { supabase } from '../lib/supabase';
import { adminApiRequest } from './adminApi';

const PLAN_BASE_LIMITS = Object.freeze({
  starter: { vehicles: 10, staff: 3, listings: 5, storage_gb: 10 },
  growth: { vehicles: 30, staff: 10, listings: 20, storage_gb: 50 },
  pro: { vehicles: 100, staff: 30, listings: 100, storage_gb: 250 },
});

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
  return {
    public_storefront: Boolean(source.public_storefront),
    online_booking: Boolean(source.online_booking),
    finance_module: Boolean(source.finance_module),
    marketplace_module: Boolean(source.marketplace_module),
    ocr_id_scan: Boolean(source.ocr_id_scan),
    whatsapp_tools: Boolean(source.whatsapp_tools),
    advanced_reporting: Boolean(source.advanced_reporting),
    multilingual_storefront: Boolean(source.multilingual_storefront),
  };
};

const buildControlsSnapshot = ({
  planType = 'starter',
  planLimits = {},
  featureAccess = {},
} = {}) => {
  const normalizedPlanType = String(planType || 'starter').trim().toLowerCase();
  const baseLimits = PLAN_BASE_LIMITS[normalizedPlanType] || PLAN_BASE_LIMITS.starter;
  const sourceLimits = planLimits && typeof planLimits === 'object' ? planLimits : {};

  return {
    planType: normalizedPlanType,
    planLimits: {
      vehicles: Number(sourceLimits.vehicles ?? baseLimits.vehicles) || 0,
      staff: Number(sourceLimits.staff ?? baseLimits.staff) || 0,
      listings: Number(sourceLimits.listings ?? baseLimits.listings) || 0,
      storage_gb: Number(sourceLimits.storage_gb ?? baseLimits.storage_gb) || 0,
    },
    featureAccess: normalizeFeatureAccess(featureAccess),
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
        planLimits: PLAN_BASE_LIMITS.pro,
        featureAccess: {
          public_storefront: true,
          online_booking: true,
          finance_module: true,
          marketplace_module: true,
          ocr_id_scan: true,
          whatsapp_tools: true,
          advanced_reporting: true,
          multilingual_storefront: true,
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
    return writeCachedControls(
      buildControlsSnapshot({
        planType: authUser.user_metadata?.plan_type || authUser.app_metadata?.plan_type || 'starter',
        planLimits: {},
        featureAccess: {},
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
  const { count, error } = await supabase
    .from('users')
    .select('id', { count: 'exact', head: true })
    .in('role', STAFF_ROLES);

  if (error) throw error;
  return Number(count || 0);
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
