const cleanText = (value) => String(value || '').trim();

export const extractDocumentUrl = (value) => {
  if (!value) return '';
  if (typeof value === 'string') return cleanText(value);
  if (typeof value === 'object') {
    return cleanText(
      value.url ||
      value.public_url ||
      value.publicUrl ||
      value.image_url ||
      value.imageUrl ||
      value.file_url ||
      value.fileUrl ||
      value.path ||
      value.storage_path ||
      value.storagePath ||
      ''
    );
  }
  return cleanText(value);
};

export const normalizeDocumentUrl = (value) => {
  const raw = extractDocumentUrl(value);
  if (!raw || raw === 'null' || raw === 'undefined') return '';
  try {
    const baseOrigin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost';
    const parsed = new URL(raw, baseOrigin);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return raw.split('?')[0].split('#')[0].trim();
  }
};

export const collectUniqueDocumentUrls = (...groups) => {
  const merged = [];
  const seen = new Set();

  groups.flat().forEach((entry) => {
    const raw = extractDocumentUrl(entry);
    const normalized = normalizeDocumentUrl(entry);
    if (!raw || !normalized || seen.has(normalized)) return;
    seen.add(normalized);
    merged.push(raw);
  });

  return merged;
};

const mapDocuments = (urls = [], kind, labelPrefix, extra = {}) => (
  urls.map((url, index) => ({
    id: `${kind}-${index}-${normalizeDocumentUrl(url) || index}`,
    url,
    normalizedUrl: normalizeDocumentUrl(url),
    kind,
    label: index === 0 ? labelPrefix : `${labelPrefix} ${index + 1}`,
    ...extra,
  }))
);

const getDeletedDocumentUrlSet = (customer = {}, key) => new Set(
  (Array.isArray(customer?.scan_metadata?.[key]) ? customer.scan_metadata[key] : [])
    .map((entry) => normalizeDocumentUrl(entry))
    .filter(Boolean)
);

const resolvePrimaryCustomerUrlCandidates = ({ customer = {}, rental = {} } = {}) => (
  collectUniqueDocumentUrls(
    customer?.id_scan_url,
    customer?.customer_id_image,
    ...(Array.isArray(customer?.scan_metadata?.uploaded_primary_id_urls)
      ? customer.scan_metadata.uploaded_primary_id_urls
      : []),
    rental?.id_scan_url,
    rental?.customer_id_image,
    rental?.customer?.id_scan_url,
    rental?.customer?.customer_id_image
  )
);

const resolvePrimaryCustomerUrls = ({ customer = {}, rental = {} } = {}) => {
  const deletedPrimaryUrlSet = getDeletedDocumentUrlSet(customer, 'deleted_primary_id_urls');
  return resolvePrimaryCustomerUrlCandidates({ customer, rental })
    .filter((entry) => !deletedPrimaryUrlSet.has(normalizeDocumentUrl(entry)))
    .slice(0, 1);
};

const resolveSecondaryCustomerUrls = ({
  customer = {},
  rental = {},
  primaryCustomerUrls = [],
} = {}) => {
  const primaryUrlSet = new Set(primaryCustomerUrls.map((entry) => normalizeDocumentUrl(entry)).filter(Boolean));
  const deletedPrimaryUrlSet = getDeletedDocumentUrlSet(customer, 'deleted_primary_id_urls');
  const deletedSecondaryUrlSet = getDeletedDocumentUrlSet(customer, 'deleted_secondary_id_urls');
  const additionalPrimaryUrls = resolvePrimaryCustomerUrlCandidates({ customer, rental })
    .filter((entry) => !deletedPrimaryUrlSet.has(normalizeDocumentUrl(entry)))
    .slice(1);
  const secondaryUrls = collectUniqueDocumentUrls(
    ...additionalPrimaryUrls,
    ...(Array.isArray(customer?.customer_id_scan_history) ? customer.customer_id_scan_history : []),
    ...(Array.isArray(customer?.scan_metadata?.id_scan_history) ? customer.scan_metadata.id_scan_history : []),
    ...(Array.isArray(customer?.customer_uploaded_images) ? customer.customer_uploaded_images : []),
    ...(Array.isArray(rental?.customer_id_scan_history) ? rental.customer_id_scan_history : []),
    ...(Array.isArray(rental?.customer_uploaded_images) ? rental.customer_uploaded_images : []),
    ...(Array.isArray(rental?.customer?.customer_id_scan_history) ? rental.customer.customer_id_scan_history : []),
    ...(Array.isArray(rental?.customer?.customer_uploaded_images) ? rental.customer.customer_uploaded_images : [])
  );

  return secondaryUrls.filter((entry) => {
    const normalized = normalizeDocumentUrl(entry);
    return (
      normalized &&
      !primaryUrlSet.has(normalized) &&
      !deletedSecondaryUrlSet.has(normalized)
    );
  });
};

const resolveSecondDriverUrls = ({
  customer = {},
  rental = {},
  secondDrivers = [],
} = {}) => {
  const secondDriverUrls = collectUniqueDocumentUrls(
    ...(Array.isArray(customer?.scan_metadata?.second_driver_id_history)
      ? customer.scan_metadata.second_driver_id_history
      : []),
    ...(Array.isArray(customer?.extra_images) ? customer.extra_images : []),
    rental?.second_driver_id_image,
    ...(Array.isArray(rental?.second_driver_uploaded_images) ? rental.second_driver_uploaded_images : []),
    ...(Array.isArray(rental?.extra_images) ? rental.extra_images : []),
    ...(Array.isArray(rental?.customer?.extra_images) ? rental.customer.extra_images : [])
  );

  const byDriver = secondDrivers.flatMap((driver, index) => {
    const driverName = cleanText(driver?.full_name || driver?.name) || `Driver ${index + 1}`;
    return collectUniqueDocumentUrls(
      driver?.id_scan_url,
      driver?.customer_id_image,
      driver?.id_image,
      ...(Array.isArray(driver?.uploaded_images) ? driver.uploaded_images : []),
      ...(Array.isArray(driver?.extra_images) ? driver.extra_images : [])
    ).map((url) => ({ url, driverName }));
  });

  const seen = new Set(secondDriverUrls.map((entry) => normalizeDocumentUrl(entry)).filter(Boolean));
  const merged = [
    ...secondDriverUrls.map((url) => ({ url, driverName: '' })),
    ...byDriver.filter((entry) => {
      const normalized = normalizeDocumentUrl(entry?.url);
      if (!normalized || seen.has(normalized)) return false;
      seen.add(normalized);
      return true;
    }),
  ];

  return merged.map((entry, index) => ({
    id: `second-driver-${index}-${normalizeDocumentUrl(entry?.url) || index}`,
    url: entry.url,
    normalizedUrl: normalizeDocumentUrl(entry.url),
    kind: 'second_driver',
    label: entry.driverName ? `Secondary ID · ${entry.driverName}` : 'Secondary ID',
    driverName: entry.driverName || '',
  }));
};

export const resolveCustomerIdentityDocuments = ({
  customer = {},
  rental = {},
  secondDrivers = [],
} = {}) => {
  const primaryCustomerUrls = resolvePrimaryCustomerUrls({ customer, rental });
  const secondaryCustomerUrls = resolveSecondaryCustomerUrls({
    customer,
    rental,
    primaryCustomerUrls,
  });
  const primaryCustomerDocuments = mapDocuments(primaryCustomerUrls, 'primary_customer', 'Primary ID');
  const secondaryCustomerDocuments = mapDocuments(secondaryCustomerUrls, 'secondary_customer', 'Secondary ID');
  const secondDriverDocuments = resolveSecondDriverUrls({ customer, rental, secondDrivers });

  const allDocuments = [
    ...primaryCustomerDocuments,
    ...secondaryCustomerDocuments,
    ...secondDriverDocuments,
  ];

  return {
    primaryCustomerDocuments,
    secondaryCustomerDocuments,
    secondDriverDocuments,
    allDocuments,
    totalCount: allDocuments.length,
  };
};

export const countCustomerIdentityDocuments = (input = {}) =>
  resolveCustomerIdentityDocuments(input).totalCount;

const isArchivedVerificationDocument = (document = {}) => {
  const status = cleanText(document?.status).toLowerCase();
  return Boolean(document?.is_archived) || status === 'archived';
};

const normalizeVerificationDocument = (document = {}, index = 0) => {
  const url = extractDocumentUrl(document?.file_url || document?.fileUrl || document?.url || document);
  const normalizedUrl = normalizeDocumentUrl(url);
  if (!normalizedUrl || isArchivedVerificationDocument(document)) return null;

  return {
    id: cleanText(document?.id) || `verification-${index}-${normalizedUrl}`,
    url,
    normalizedUrl,
    verificationType: cleanText(document?.verification_type || document?.verificationType),
    status: cleanText(document?.status) || 'pending',
    createdAt: document?.created_at || document?.createdAt || null,
    displayLabel: cleanText(document?.display_label || document?.displayLabel),
    sourceLabel: cleanText(document?.submission_source_label || document?.submissionSourceLabel),
    raw: document,
  };
};

export const resolveVerificationIdentityDocuments = (documents = []) => {
  const seen = new Set();
  let profileIdIndex = 0;
  const normalizedDocuments = (Array.isArray(documents) ? documents : [])
    .map((document, index) => normalizeVerificationDocument(document, index))
    .filter(Boolean)
    .filter((document) => {
      if (seen.has(document.normalizedUrl)) return false;
      seen.add(document.normalizedUrl);
      return true;
    })
    .map((document) => {
      const lowerLabel = cleanText(document.displayLabel || document.sourceLabel).toLowerCase();
      const type = cleanText(document.verificationType).toLowerCase();
      const isExplicitSecondary =
        lowerLabel.startsWith('secondary id') ||
        lowerLabel.startsWith('second id') ||
        Boolean(document.raw?.isSecondaryIdDocument);

      if (type === 'profile_id' && !isExplicitSecondary) {
        profileIdIndex += 1;
      }

      const isSecondary =
        isExplicitSecondary ||
        (type === 'profile_id' && profileIdIndex > 1);

      return {
        ...document,
        kind: isSecondary ? 'secondary_customer' : 'primary_customer',
        label: isSecondary ? 'Secondary ID' : 'Primary ID',
      };
    });

  const primaryCustomerDocuments = normalizedDocuments.length > 0 ? [normalizedDocuments[0]] : [];
  const secondaryCustomerDocuments = normalizedDocuments.slice(1).map((document) => ({
    ...document,
    kind: 'secondary_customer',
    label: 'Secondary ID',
  }));

  return {
    primaryCustomerDocuments,
    secondaryCustomerDocuments,
    secondDriverDocuments: [],
    allDocuments: normalizedDocuments,
    totalCount: normalizedDocuments.length,
  };
};

const normalizeIdentityDocumentForMerge = (document = {}, fallbackKind = 'secondary_customer', index = 0) => {
  const url = extractDocumentUrl(document?.url || document?.file_url || document?.fileUrl || document);
  const normalizedUrl = normalizeDocumentUrl(url);
  if (!normalizedUrl) return null;

  return {
    ...document,
    id: cleanText(document?.id) || `${fallbackKind}-${index}-${normalizedUrl}`,
    url,
    normalizedUrl,
    kind: cleanText(document?.kind) || fallbackKind,
  };
};

export const mergeIdentityDocumentCollections = (...collections) => {
  const primaryCustomerDocuments = [];
  const secondaryCustomerDocuments = [];
  const secondDriverDocuments = [];
  const allDocuments = [];
  const seen = new Set();

  const pushDocument = (document, fallbackKind) => {
    const normalizedDocument = normalizeIdentityDocumentForMerge(document, fallbackKind, allDocuments.length);
    if (!normalizedDocument || seen.has(normalizedDocument.normalizedUrl)) return;

    seen.add(normalizedDocument.normalizedUrl);

    const requestedKind = cleanText(normalizedDocument.kind) || fallbackKind;
    const finalKind = requestedKind === 'primary_customer' && primaryCustomerDocuments.length === 0
      ? 'primary_customer'
      : requestedKind === 'second_driver'
        ? 'second_driver'
        : 'secondary_customer';
    const finalDocument = {
      ...normalizedDocument,
      kind: finalKind,
      label: finalKind === 'primary_customer' ? 'Primary ID' : 'Secondary ID',
    };

    if (finalKind === 'primary_customer') {
      primaryCustomerDocuments.push(finalDocument);
    } else if (finalKind === 'second_driver') {
      secondDriverDocuments.push(finalDocument);
    } else {
      secondaryCustomerDocuments.push(finalDocument);
    }

    allDocuments.push(finalDocument);
  };

  collections.filter(Boolean).forEach((collection) => {
    (collection.primaryCustomerDocuments || []).forEach((document) => pushDocument(document, 'primary_customer'));
    (collection.secondaryCustomerDocuments || []).forEach((document) => pushDocument(document, 'secondary_customer'));
    (collection.secondDriverDocuments || []).forEach((document) => pushDocument(document, 'second_driver'));
  });

  return {
    primaryCustomerDocuments,
    secondaryCustomerDocuments,
    secondDriverDocuments,
    allDocuments,
    totalCount: allDocuments.length,
  };
};
