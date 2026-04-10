export const BUSINESS_ACCOUNT_TYPES = new Set(['operator', 'individual_owner']);
export const PLATFORM_OWNER_EMAILS = new Set(['salamtime2016@gmail.com']);

export const BUSINESS_OWNER_ACCOUNT_TYPES = new Set([
  'operator',
  'business_owner',
  'business',
  'rental_business',
]);

export const isBusinessAccountType = (accountType) =>
  BUSINESS_ACCOUNT_TYPES.has(String(accountType || '').trim().toLowerCase());

export const isBusinessOwnerAccountType = (accountType) =>
  BUSINESS_OWNER_ACCOUNT_TYPES.has(String(accountType || '').trim().toLowerCase());

export const hasBusinessOwnerRequest = (metadata = {}) => {
  const accountType = metadata?.account_type || metadata?.accountType || '';
  if (isBusinessOwnerAccountType(accountType)) {
    return true;
  }

  const certificationStatus = String(
    metadata?.certification_request_status ||
    metadata?.certificationRequestStatus ||
    ''
  ).trim().toLowerCase();

  return ['pending', 'pending_verification', 'approved', 'rejected', 'needs_info', 'suspended'].includes(certificationStatus);
};

export const isApprovedBusinessOwnerAccount = (metadata = {}) => {
  if (!hasBusinessOwnerRequest(metadata)) {
    return false;
  }

  const verificationStatus = String(metadata?.verification_status || '').trim().toLowerCase();
  const certificationStatus = String(metadata?.certification_request_status || '').trim().toLowerCase();

  return verificationStatus === 'approved' || certificationStatus === 'approved';
};

export const getBusinessOwnerAccessState = (metadata = {}) => {
  if (!hasBusinessOwnerRequest(metadata)) {
    return null;
  }

  const verificationStatus = String(
    metadata?.verification_status ||
    metadata?.verificationStatus ||
    'pending'
  ).trim().toLowerCase();
  const subscriptionStatus = String(
    metadata?.subscription_status ||
    metadata?.subscriptionStatus ||
    ''
  ).trim().toLowerCase();

  if (verificationStatus === 'rejected') {
    return 'rejected';
  }

  if (verificationStatus === 'needs_info') {
    return 'needs_info';
  }

  if (verificationStatus !== 'approved') {
    return 'pending';
  }

  if (subscriptionStatus === 'suspended') {
    return 'suspended';
  }

  if (subscriptionStatus === 'expired') {
    return 'expired';
  }

  return 'approved';
};

export const getBusinessOwnerFreezeRedirect = (metadata = {}) => {
  const accessState = getBusinessOwnerAccessState(metadata);

  if (!accessState) {
    return null;
  }

  if (accessState === 'expired') {
    return '/choose-plan';
  }

  return '/pending-approval';
};

export const getAccountTypeLabel = (accountType, tr = (en) => en) => {
  const normalized = String(accountType || '').trim().toLowerCase();

  if (normalized === 'operator') {
    return tr('Rental business', 'Activite de location');
  }

  if (normalized === 'individual_owner') {
    return tr('Individual owner', 'Proprietaire individuel');
  }

  return tr('Customer', 'Client');
};

export const isPlatformOwnerEmail = (email = '') =>
  PLATFORM_OWNER_EMAILS.has(String(email || '').trim().toLowerCase());
