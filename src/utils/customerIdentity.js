const normalizeText = (value) => String(value || '').trim();

export const isLikelyLicenceNumber = (value) => /^\d{2}\/\d{6}$/i.test(normalizeText(value));
export const isLikelyNationalIdNumber = (value) => /^[A-Z]{1,3}\d{5,8}$/i.test(normalizeText(value));

export const normalizeCustomerIdentityFields = ({
  licenceNumber,
  idNumber,
}) => {
  let normalizedLicence = normalizeText(licenceNumber);
  let normalizedId = normalizeText(idNumber).toUpperCase();

  if (normalizedLicence) {
    normalizedLicence = normalizedLicence.toUpperCase();
  }

  if (normalizedLicence && normalizedId && normalizedLicence === normalizedId) {
    if (isLikelyLicenceNumber(normalizedLicence)) {
      normalizedId = '';
    } else if (isLikelyNationalIdNumber(normalizedId)) {
      normalizedLicence = '';
    }
  }

  if (!normalizedLicence && normalizedId && isLikelyLicenceNumber(normalizedId)) {
    normalizedLicence = normalizedId;
    normalizedId = '';
  }

  if (!normalizedId && normalizedLicence && isLikelyNationalIdNumber(normalizedLicence)) {
    normalizedId = normalizedLicence;
    normalizedLicence = '';
  }

  return {
    licenceNumber: normalizedLicence || null,
    idNumber: normalizedId || null,
  };
};

const buildComparableCustomer = (customer = {}) => {
  const normalizedIdentity = normalizeCustomerIdentityFields({
    licenceNumber:
      customer.licence_number ||
      customer.customer_licence_number ||
      customer.license_number,
    idNumber:
      customer.id_number ||
      customer.customer_id_number ||
      customer.document_number,
  });

  return {
    id: normalizeText(customer.id),
    fullName: normalizeText(customer.full_name || customer.customer_name).toLowerCase(),
    phone: normalizeText(customer.phone || customer.customer_phone),
    email: normalizeText(customer.email || customer.customer_email).toLowerCase(),
    dateOfBirth: normalizeText(customer.date_of_birth || customer.customer_dob),
    nationality: normalizeText(customer.nationality || customer.customer_nationality).toLowerCase(),
    licenceNumber: normalizedIdentity.licenceNumber || '',
    idNumber: normalizedIdentity.idNumber || '',
  };
};

const calculateCustomerProfileCompleteness = (customer = {}) => {
  const comparable = buildComparableCustomer(customer);
  let score = 0;

  if (comparable.phone) score += 40;
  if (comparable.email) score += 30;
  if (comparable.dateOfBirth) score += 18;
  if (comparable.nationality) score += 10;
  if (comparable.fullName) score += 8;
  if (comparable.licenceNumber) score += 12;
  if (comparable.idNumber) score += 12;
  if (normalizeText(customer.place_of_birth || customer.customer_place_of_birth)) score += 6;
  if (normalizeText(customer.issue_date || customer.customer_issue_date || customer.licence_issue_date)) score += 6;
  if (normalizeText(customer.id_scan_url || customer.customer_id_image)) score += 6;

  return score;
};

export const pickMostCompleteCustomerProfile = (candidates = []) => {
  const pool = Array.isArray(candidates) ? candidates : [];
  let best = null;
  let bestScore = -Infinity;

  pool.forEach((candidate) => {
    if (!normalizeText(candidate?.id)) return;
    const completeness = calculateCustomerProfileCompleteness(candidate);
    const updatedAt = Date.parse(candidate?.updated_at || candidate?.created_at || 0) || 0;
    const totalScore = completeness * 10000000000000 + updatedAt;

    if (totalScore > bestScore) {
      bestScore = totalScore;
      best = candidate;
    }
  });

  return best;
};

export const pickExactIdentityCustomerMatch = ({
  incomingCustomer,
  candidates,
}) => {
  const incoming = buildComparableCustomer(incomingCustomer);
  const pool = Array.isArray(candidates) ? candidates : [];

  const exactIdentityMatches = pool.filter((candidateRaw) => {
    const candidate = buildComparableCustomer(candidateRaw);
    if (!candidate.id) return false;

    const hasLicenceMatch =
      Boolean(incoming.licenceNumber) &&
      Boolean(candidate.licenceNumber) &&
      incoming.licenceNumber === candidate.licenceNumber;

    const hasIdMatch =
      Boolean(incoming.idNumber) &&
      Boolean(candidate.idNumber) &&
      incoming.idNumber === candidate.idNumber;

    return hasLicenceMatch || hasIdMatch;
  });

  if (exactIdentityMatches.length === 0) return null;
  return pickMostCompleteCustomerProfile(exactIdentityMatches);
};

export const mergeUniqueCustomersById = (...groups) => {
  const seen = new Set();
  const merged = [];

  groups.flat().forEach((candidate) => {
    const id = normalizeText(candidate?.id);
    if (!id || seen.has(id)) return;
    seen.add(id);
    merged.push(candidate);
  });

  return merged;
};

export const pickBestExistingCustomerMatch = ({
  incomingCustomer,
  candidates,
}) => {
  const incoming = buildComparableCustomer(incomingCustomer);
  const pool = Array.isArray(candidates) ? candidates : [];

  let bestMatch = null;
  let bestScore = -Infinity;

  pool.forEach((candidateRaw) => {
    const candidate = buildComparableCustomer(candidateRaw);
    let score = 0;

    if (!candidate.id) return;

    if (incoming.licenceNumber && candidate.licenceNumber) {
      if (incoming.licenceNumber === candidate.licenceNumber) score += 120;
      else score -= 100;
    }

    if (incoming.idNumber && candidate.idNumber) {
      if (incoming.idNumber === candidate.idNumber) score += 120;
      else score -= 100;
    }

    if (incoming.phone && candidate.phone) {
      if (incoming.phone === candidate.phone) score += 70;
      else score -= 20;
    }

    if (incoming.email && candidate.email) {
      if (incoming.email === candidate.email) score += 60;
      else score -= 20;
    }

    if (incoming.fullName && candidate.fullName && incoming.fullName === candidate.fullName) {
      score += 25;
    }

    if (incoming.dateOfBirth && candidate.dateOfBirth && incoming.dateOfBirth === candidate.dateOfBirth) {
      score += 45;
    }

    if (incoming.nationality && candidate.nationality && incoming.nationality === candidate.nationality) {
      score += 15;
    }

    if (incoming.licenceNumber && !candidate.licenceNumber) score += 18;
    if (incoming.idNumber && !candidate.idNumber) score += 18;
    if (incoming.phone && !candidate.phone) score += 10;
    if (incoming.email && !candidate.email) score += 8;

    if (score > bestScore) {
      bestScore = score;
      bestMatch = candidateRaw;
    } else if (score === bestScore && bestMatch) {
      const candidateCompleteness = calculateCustomerProfileCompleteness(candidateRaw);
      const currentCompleteness = calculateCustomerProfileCompleteness(bestMatch);
      if (candidateCompleteness > currentCompleteness) {
        bestMatch = candidateRaw;
      }
    }
  });

  return bestScore >= 70 ? bestMatch : null;
};

export const mergeCustomerScanHistory = (...groups) => {
  const seen = new Set();
  const merged = [];

  groups.flat().forEach((value) => {
    const raw = normalizeText(value);
    if (!raw) return;

    const baseName = raw.split('/').pop() || raw;
    const normalizedBaseName = (() => {
      const knownTail =
        baseName.match(/(IMG_[^/]+)$/i)?.[1] ||
        baseName.match(/(Screenshot_[^/]+)$/i)?.[1] ||
        baseName.match(/(WhatsApp Image[^/]+)$/i)?.[1];

      if (knownTail) return knownTail;
      return baseName.replace(/^(sd|cust)_[^_]+_[^_]+_(?:\d+_)?/i, '');
    })();
    const key = normalizedBaseName.toLowerCase();

    if (seen.has(key)) return;
    seen.add(key);
    merged.push(raw);
  });

  return merged;
};
