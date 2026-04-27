export const VERIFICATION_BUCKET = 'verification-documents';

export const VERIFICATION_STATUSES = ['pending', 'approved', 'rejected', 'suspended', 'expired', 'archived'];

export const VERIFICATION_LABELS = {
  pending: { en: 'Pending review', fr: 'En attente' },
  approved: { en: 'Verified', fr: 'Vérifié' },
  rejected: { en: 'Replacement requested', fr: 'Remplacement demandé' },
  suspended: { en: 'Suspended', fr: 'Suspendu' },
  expired: { en: 'Expired', fr: 'Expiré' },
  archived: { en: 'Archived', fr: 'Archivé' },
  missing: { en: 'Required', fr: 'Requis' },
};

export const VERIFICATION_TYPE_LABELS = {
  profile_id: { en: 'Profile ID', fr: 'Pièce d’identité' },
  driver_license: { en: 'Driver license', fr: 'Permis de conduire' },
  vehicle_registration: { en: 'Vehicle registration', fr: 'Carte grise' },
  vehicle_insurance: { en: 'Vehicle insurance', fr: 'Assurance' },
  proof_of_ownership: { en: 'Proof of ownership', fr: 'Preuve de propriété' },
};

export const PROFILE_REQUIRED_VERIFICATIONS = ['profile_id'];
export const VEHICLE_REQUIRED_VERIFICATIONS = ['vehicle_registration', 'vehicle_insurance'];

export const getVerificationLabel = (status, language = 'en') => {
  const key = VERIFICATION_LABELS[status] ? status : 'pending';
  return VERIFICATION_LABELS[key][language] || VERIFICATION_LABELS[key].en;
};

export const getVerificationTypeLabel = (type, language = 'en') => {
  const key = VERIFICATION_TYPE_LABELS[type] ? type : 'profile_id';
  return VERIFICATION_TYPE_LABELS[key][language] || VERIFICATION_TYPE_LABELS[key].en;
};

export const getVerificationBadgeClass = (status) => {
  switch (status) {
    case 'approved':
      return 'border-emerald-200 bg-emerald-50 text-emerald-700';
    case 'rejected':
      return 'border-rose-200 bg-rose-50 text-rose-700';
    case 'suspended':
      return 'border-orange-200 bg-orange-50 text-orange-700';
    case 'expired':
      return 'border-amber-200 bg-amber-50 text-amber-700';
    case 'archived':
      return 'border-slate-200 bg-slate-100 text-slate-600';
    case 'missing':
      return 'border-slate-200 bg-slate-50 text-slate-600';
    default:
      return 'border-violet-200 bg-violet-50 text-violet-700';
  }
};

export const getLatestVerificationByType = (requests = []) => requests.reduce((acc, request) => {
  if (String(request?.status || '').trim().toLowerCase() === 'archived') {
    return acc;
  }
  if (!acc[request.verification_type]) {
    acc[request.verification_type] = request;
  }
  return acc;
}, {});

export const buildEntityVerificationSummary = (requests = [], entityType = 'user') => {
  const latestByType = getLatestVerificationByType(requests);
  const requiredTypes = entityType === 'vehicle'
    ? VEHICLE_REQUIRED_VERIFICATIONS
    : PROFILE_REQUIRED_VERIFICATIONS;

  const missing = requiredTypes.filter((type) => !latestByType[type]);
  const expired = requiredTypes.filter((type) => {
    const request = latestByType[type];
    return request?.status === 'expired' ||
      (type === 'vehicle_insurance' && request?.expires_at && new Date(request.expires_at).getTime() < Date.now());
  });
  const rejected = requiredTypes.filter((type) => latestByType[type]?.status === 'rejected');
  const suspended = requiredTypes.filter((type) => latestByType[type]?.status === 'suspended');
  const approved = requiredTypes.filter((type) => latestByType[type]?.status === 'approved' && !expired.includes(type));
  const complete = approved.length === requiredTypes.length;

  let status = 'pending';
  if (suspended.length) status = 'suspended';
  else if (expired.length) status = 'expired';
  else if (rejected.length) status = 'rejected';
  else if (complete) status = 'approved';

  return { status, complete, latestByType, requiredTypes, missing, expired, rejected, suspended, approved };
};

export const isUserVerifiedForOwnerFlow = (requests = []) =>
  buildEntityVerificationSummary(requests, 'user').complete;

export const isVehicleVerifiedForListing = (requests = []) =>
  buildEntityVerificationSummary(requests, 'vehicle').complete;
