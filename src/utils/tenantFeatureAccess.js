import {
  MODULE_FEATURE_REQUIREMENTS,
  TENANT_FEATURE_KEYS,
  buildEffectiveTenantFeatureAccess,
  normalizeTenantPlanType,
} from '../config/tenantPlans';
import { resolvePermissionKey } from './permissionCatalog';

export const resolveModuleFeatureKey = (moduleName = '') => {
  const resolvedModule = resolvePermissionKey(moduleName);
  return MODULE_FEATURE_REQUIREMENTS[resolvedModule] || null;
};

export const buildTenantEffectiveFeatureAccess = (planType = 'starter', featureAccess = {}) =>
  buildEffectiveTenantFeatureAccess(planType, featureAccess);

export const isTenantFeatureEnabled = (featureKey, featureAccess = {}, planType = 'starter') => {
  if (!featureKey) return true;
  if (!TENANT_FEATURE_KEYS.includes(featureKey)) return true;

  const effective = buildTenantEffectiveFeatureAccess(normalizeTenantPlanType(planType), featureAccess);
  return effective[featureKey] === true;
};

export const isTenantModuleEnabled = (moduleName, featureAccess = {}, planType = 'starter') => {
  const featureKey = resolveModuleFeatureKey(moduleName);
  return isTenantFeatureEnabled(featureKey, featureAccess, planType);
};
