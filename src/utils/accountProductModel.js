export const ACCOUNT_PRODUCT_PILLARS = Object.freeze({
  home: 'home',
  listings: 'listings',
  inbox: 'inbox',
  trips: 'trips',
  wallet: 'wallet',
  account: 'account',
});

export const ACCOUNT_PRODUCT_LIFECYCLE = Object.freeze([
  'listing',
  'inbox',
  'trip',
  'wallet',
  'review',
]);

export const ACCOUNT_WORKSPACE_MODES = Object.freeze({
  service: 'service',
  ownerSetup: 'owner_setup',
  owner: 'owner',
});

export const ACCOUNT_WORKSPACE_ACCOUNT_TYPES = Object.freeze({
  customer: 'customer',
  privateOwner: 'private_owner',
  businessOwner: 'business_owner',
});

export const ACCOUNT_OWNER_FLOW_PATH_PREFIXES = Object.freeze([
  '/account/vehicles',
  '/account/boost',
  '/account/verification',
]);

export const ACCOUNT_OWNER_JOURNEY_STATES = Object.freeze([
  'not_started',
  'draft',
  'verification_required',
  'pending_review',
  'approved',
  'live',
  'changes_requested',
  'rejected',
]);

export const isOwnerWorkspacePath = (pathname = '') =>
  ACCOUNT_OWNER_FLOW_PATH_PREFIXES.some((path) =>
    pathname === path || pathname.startsWith(`${path}/`)
  );

export const deriveAccountWorkspaceIdentity = ({
  managedAccountType = ACCOUNT_WORKSPACE_ACCOUNT_TYPES.customer,
  effectiveOwnerVehicleCount = 0,
  pathname = '',
} = {}) => {
  const normalizedManagedAccountType = String(managedAccountType || '').trim().toLowerCase();
  const normalizedOwnerVehicleCount = Math.max(Number(effectiveOwnerVehicleCount || 0) || 0, 0);
  const isInsideOwnerFlow = isOwnerWorkspacePath(pathname);

  let workspaceAccountType = ACCOUNT_WORKSPACE_ACCOUNT_TYPES.customer;

  if (normalizedManagedAccountType === ACCOUNT_WORKSPACE_ACCOUNT_TYPES.businessOwner) {
    workspaceAccountType = ACCOUNT_WORKSPACE_ACCOUNT_TYPES.businessOwner;
  } else if (isInsideOwnerFlow) {
    workspaceAccountType = ACCOUNT_WORKSPACE_ACCOUNT_TYPES.privateOwner;
  } else if (
    normalizedManagedAccountType === ACCOUNT_WORKSPACE_ACCOUNT_TYPES.privateOwner &&
    normalizedOwnerVehicleCount > 0
  ) {
    workspaceAccountType = ACCOUNT_WORKSPACE_ACCOUNT_TYPES.privateOwner;
  } else if (normalizedOwnerVehicleCount > 0) {
    workspaceAccountType = ACCOUNT_WORKSPACE_ACCOUNT_TYPES.privateOwner;
  }

  const workspaceMode =
    workspaceAccountType === ACCOUNT_WORKSPACE_ACCOUNT_TYPES.customer
      ? ACCOUNT_WORKSPACE_MODES.service
      : normalizedOwnerVehicleCount > 0
        ? ACCOUNT_WORKSPACE_MODES.owner
        : ACCOUNT_WORKSPACE_MODES.ownerSetup;

  return {
    isInsideOwnerFlow,
    workspaceAccountType,
    workspaceMode,
    isOwnerWorkspace: workspaceMode !== ACCOUNT_WORKSPACE_MODES.service,
    primaryProductPillar:
      workspaceMode === ACCOUNT_WORKSPACE_MODES.service
        ? ACCOUNT_PRODUCT_PILLARS.trips
        : normalizedOwnerVehicleCount > 0
          ? ACCOUNT_PRODUCT_PILLARS.listings
          : ACCOUNT_PRODUCT_PILLARS.home,
  };
};

export const getEffectiveMarketplaceJourneyState = ({
  marketplaceVerificationReady,
  hasStartedDraft,
  listingStatus,
  reviewStatus,
  moderationStatus,
}) => {
  const normalizedListing = String(listingStatus || '').trim().toLowerCase();
  const normalizedReview = String(reviewStatus || '').trim().toLowerCase();
  const normalizedModeration = String(moderationStatus || '').trim().toLowerCase();

  if (!hasStartedDraft) return 'not_started';
  if (normalizedListing === 'live') return 'live';
  if (normalizedListing === 'approved' || normalizedReview === 'approved') return 'approved';
  if (normalizedModeration === 'changes_requested') return 'changes_requested';
  if (
    normalizedListing === 'pending_review' ||
    normalizedReview === 'pending_review' ||
    normalizedModeration === 'pending_review'
  ) {
    return 'pending_review';
  }
  if (normalizedListing === 'rejected' || normalizedReview === 'rejected') return 'rejected';
  if (!marketplaceVerificationReady) return 'verification_required';
  return 'draft';
};

export const getPrimaryAccountWorkspaceSectionIds = ({
  workspaceMode = ACCOUNT_WORKSPACE_MODES.service,
  hasTripActivity = false,
  hasWalletActivity = false,
  currentSectionId = '',
} = {}) => {
  const visibleSectionIds = new Set(['overview', 'marketplace', 'messages', 'settings']);
  const normalizedCurrentSectionId = String(currentSectionId || '').trim();

  const shouldKeepTripsVisible =
    workspaceMode === ACCOUNT_WORKSPACE_MODES.owner ||
    hasTripActivity ||
    normalizedCurrentSectionId === 'rentals';

  const shouldKeepWalletVisible =
    workspaceMode === ACCOUNT_WORKSPACE_MODES.owner ||
    hasWalletActivity ||
    normalizedCurrentSectionId === 'revenue';

  if (shouldKeepTripsVisible) {
    visibleSectionIds.add('rentals');
  }

  if (shouldKeepWalletVisible) {
    visibleSectionIds.add('revenue');
  }

  return Array.from(visibleSectionIds);
};
