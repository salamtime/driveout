import React, { createContext, useContext } from 'react';

const DEFAULT_PUBLIC_FEATURES = Object.freeze({
  public_storefront: true,
  online_booking: true,
  multilingual_storefront: true,
});

const TenantWorkspaceContext = createContext({
  ready: true,
  tenant: null,
  tenantSettings: {},
  publicFeatures: DEFAULT_PUBLIC_FEATURES,
  featureAccess: {},
  effectiveFeatureAccess: {},
  tenancyMode: 'shared',
  organizationId: null,
  organizationSlug: null,
  planType: 'starter',
});

export const getDefaultTenantPublicFeatures = () => ({ ...DEFAULT_PUBLIC_FEATURES });

export const useTenantWorkspaceContext = () => useContext(TenantWorkspaceContext);

export default TenantWorkspaceContext;
