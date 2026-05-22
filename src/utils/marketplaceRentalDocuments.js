import { normalizeMarketplaceRequestLifecycleStatus } from './marketplaceRequestState';
import { normalizeRentalExecutionDraft, normalizeRentalExecutionPhotos } from './rentalExecutionFlow';

export const DRIVEOUT_MARKETPLACE_DOCUMENT_VERSION = 1;

export const DRIVEOUT_MARKETPLACE_DOCUMENT_BRAND = Object.freeze({
  key: 'driveout',
  productName: 'DriveOut',
  companyName: 'DriveOut',
  legalName: 'DriveOut Marketplace',
  websiteUrl: 'https://www.driveout.io',
});

const cleanText = (value, fallback = '') => {
  const nextValue = String(value ?? '').trim();
  return nextValue || fallback;
};

const safeNumber = (value, fallback = 0) => {
  const nextValue = Number(value);
  return Number.isFinite(nextValue) ? nextValue : fallback;
};

const firstText = (...values) => {
  for (const value of values) {
    const nextValue = cleanText(value);
    if (nextValue) return nextValue;
  }
  return '';
};

const getNested = (source, paths = []) => {
  for (const path of paths) {
    const value = path.split('.').reduce((current, key) => {
      if (!current || typeof current !== 'object') return undefined;
      return current[key];
    }, source);
    const text = cleanText(value);
    if (text) return text;
  }
  return '';
};

const normalizeDocumentPhotos = (photos) => normalizeRentalExecutionPhotos(photos);

const buildDocumentId = (prefix, requestId, fallback = '') => {
  const normalizedRequestId = cleanText(requestId, fallback || 'request');
  return `${prefix}-${normalizedRequestId}`;
};

const getRequestDurationUnits = (request = {}) => {
  const duration = Math.max(0, safeNumber(request.duration));
  if (!duration) return 0;
  return Math.max(1, Math.ceil(duration));
};

const buildMissingFields = (entries = []) =>
  entries
    .filter((entry) => !entry.value)
    .map((entry) => entry.label);

const buildCustomerSnapshot = (request = {}) => {
  const rawRequest = request.rawRequest && typeof request.rawRequest === 'object' ? request.rawRequest : {};
  const counterOffer = request.counterOffer || request.counter_offer || request.counterOfferSnapshot || {};
  const rawCounterOffer = rawRequest.counter_offer && typeof rawRequest.counter_offer === 'object' ? rawRequest.counter_offer : {};
  const requestCustomer =
    request.customer && typeof request.customer === 'object'
      ? request.customer
      : request.customerProfile && typeof request.customerProfile === 'object'
        ? request.customerProfile
        : {};
  const rawCustomer =
    rawRequest.customer && typeof rawRequest.customer === 'object'
      ? rawRequest.customer
      : rawRequest.customer_profile && typeof rawRequest.customer_profile === 'object'
        ? rawRequest.customer_profile
        : {};
  const customerSnapshot =
    rawRequest.customer_snapshot ||
    rawRequest.customerSnapshot ||
    rawRequest.customer_identity ||
    request.customerSnapshot ||
    request.customer_identity ||
    {};

  return {
    id: firstText(request.customerId, request.customer_id, rawRequest.customer_id, requestCustomer.id, rawCustomer.id, customerSnapshot.id),
    name: firstText(
      request.customerName,
      request.customer_name,
      rawRequest.customer_name,
      requestCustomer.full_name,
      requestCustomer.fullName,
      requestCustomer.name,
      rawCustomer.full_name,
      rawCustomer.fullName,
      rawCustomer.name,
      customerSnapshot.full_name,
      customerSnapshot.fullName,
      customerSnapshot.name,
      'Customer'
    ),
    email: firstText(request.customerEmail, request.customer_email, rawRequest.customer_email, requestCustomer.email, rawCustomer.email, customerSnapshot.email),
    phone: firstText(request.customerPhone, request.customer_phone, rawRequest.customer_phone, requestCustomer.phone, rawCustomer.phone, customerSnapshot.phone),
    licenseNumber: firstText(
      request.customerLicenseNumber,
      request.customerLicenceNumber,
      request.customer_license_number,
      request.customer_licence_number,
      request.licenseNumber,
      request.licenceNumber,
      request.licence_number,
      request.license_number,
      rawRequest.customer_license_number,
      rawRequest.customer_licence_number,
      rawRequest.license_number,
      rawRequest.licence_number,
      counterOffer.customer_license_number,
      counterOffer.customer_licence_number,
      rawCounterOffer.customer_license_number,
      rawCounterOffer.customer_licence_number,
      requestCustomer.customer_license_number,
      requestCustomer.customer_licence_number,
      requestCustomer.license_number,
      requestCustomer.licence_number,
      requestCustomer.licenseNumber,
      requestCustomer.licenceNumber,
      rawCustomer.customer_license_number,
      rawCustomer.customer_licence_number,
      rawCustomer.license_number,
      rawCustomer.licence_number,
      rawCustomer.licenseNumber,
      rawCustomer.licenceNumber,
      customerSnapshot.license_number,
      customerSnapshot.licence_number,
      customerSnapshot.licenseNumber,
      customerSnapshot.licenceNumber,
      getNested(customerSnapshot, [
        'scan_metadata.licenseNumber',
        'scan_metadata.licenceNumber',
        'scan_metadata.licence_number',
        'scan_metadata.license_number',
        'scan_metadata.document_number',
        'scanMetadata.licenseNumber',
        'scanMetadata.licenceNumber',
        'scanMetadata.documentNumber',
      ])
    ),
    idNumber: firstText(
      request.customerIdNumber,
      request.customer_id_number,
      rawRequest.customer_id_number,
      rawRequest.id_number,
      requestCustomer.id_number,
      requestCustomer.document_number,
      requestCustomer.documentNumber,
      rawCustomer.id_number,
      rawCustomer.document_number,
      rawCustomer.documentNumber,
      customerSnapshot.id_number,
      customerSnapshot.document_number,
      customerSnapshot.documentNumber
    ),
  };
};

const buildVehicleSnapshot = ({ request = {}, formData = {} }) => {
  const rawProfile = request.rawProfile && typeof request.rawProfile === 'object' ? request.rawProfile : {};
  const rawListing = request.rawListing && typeof request.rawListing === 'object' ? request.rawListing : {};
  const requestVehicle =
    request.vehicle && typeof request.vehicle === 'object'
      ? request.vehicle
      : request.vehicleProfile && typeof request.vehicleProfile === 'object'
        ? request.vehicleProfile
        : {};
  const listingVehicle =
    rawListing.vehicle && typeof rawListing.vehicle === 'object'
      ? rawListing.vehicle
      : rawListing.profile && typeof rawListing.profile === 'object'
        ? rawListing.profile
        : {};
  const title = firstText(
    request.listingTitle,
    request.title,
    request.vehicleName,
    request.vehicle_name,
    rawListing.title,
    rawListing.vehicle_name,
    rawListing.vehicleName,
    requestVehicle.title,
    requestVehicle.name,
    listingVehicle.title,
    listingVehicle.name,
    formData.listingTitle,
    [formData.brandName, formData.modelName].filter(Boolean).join(' '),
    [rawProfile.brand_name, rawProfile.model_name].filter(Boolean).join(' '),
    [requestVehicle.brand_name || requestVehicle.brandName, requestVehicle.model_name || requestVehicle.modelName].filter(Boolean).join(' '),
    [listingVehicle.brand_name || listingVehicle.brandName, listingVehicle.model_name || listingVehicle.modelName].filter(Boolean).join(' '),
    'Vehicle'
  );

  return {
    id: firstText(request.vehiclePublicProfileId, request.vehicle_public_profile_id, rawProfile.id, requestVehicle.id, listingVehicle.id, formData.id),
    listingId: firstText(request.listingId, request.listing_id, rawListing.id),
    name: title,
    model: firstText(formData.modelName, rawProfile.model_name, rawProfile.modelName, requestVehicle.model_name, requestVehicle.modelName, listingVehicle.model_name, listingVehicle.modelName, title),
    brand: firstText(formData.brandName, rawProfile.brand_name, rawProfile.brandName, requestVehicle.brand_name, requestVehicle.brandName, listingVehicle.brand_name, listingVehicle.brandName),
    category: firstText(formData.categoryCode, rawProfile.category_code, rawProfile.categoryCode, requestVehicle.category_code, requestVehicle.categoryCode, listingVehicle.category_code, listingVehicle.categoryCode),
    plateNumber: firstText(
      formData.plateNumber,
      formData.plate_number,
      rawProfile.plate_number,
      rawProfile.plateNumber,
      request.vehiclePlateNumber,
      request.vehicle_plate_number,
      request.plateNumber,
      request.plate_number,
      rawListing.vehicle_plate_number,
      rawListing.plate_number,
      requestVehicle.plate_number,
      requestVehicle.plateNumber,
      listingVehicle.plate_number,
      listingVehicle.plateNumber
    ),
    city: firstText(formData.cityName, formData.city_name, request.cityName, request.city_name, rawProfile.city_name, rawProfile.cityName, requestVehicle.city_name, requestVehicle.cityName, listingVehicle.city_name, listingVehicle.cityName, 'Tangier'),
    area: firstText(formData.areaName, formData.area_name, request.areaName, request.area_name, rawProfile.area_name, rawProfile.areaName, requestVehicle.area_name, requestVehicle.areaName, listingVehicle.area_name, listingVehicle.areaName),
    imageUrl: firstText(request.coverImageUrl, request.cover_image_url, rawProfile.cover_image_url, rawProfile.coverImageUrl, requestVehicle.cover_image_url, requestVehicle.coverImageUrl, listingVehicle.cover_image_url, listingVehicle.coverImageUrl),
  };
};

export const buildDriveOutMarketplaceRentalDocumentPayload = ({
  operationalRequest = null,
  ownerExecutionDraft = {},
  formData = {},
  vehicleDocuments = [],
  vehicleFuelState = null,
  ownerUserId = '',
  language = 'en',
} = {}) => {
  const request = operationalRequest && typeof operationalRequest === 'object' ? operationalRequest : {};
  const hasExplicitDraft =
    ownerExecutionDraft &&
    typeof ownerExecutionDraft === 'object' &&
    Object.keys(ownerExecutionDraft).length > 0;
  const draft = normalizeRentalExecutionDraft(
    hasExplicitDraft ? ownerExecutionDraft : request.ownerExecution || request.owner_execution || {}
  );
  const rawRequest = request.rawRequest && typeof request.rawRequest === 'object' ? request.rawRequest : {};
  const customer = buildCustomerSnapshot(request);
  const vehicle = buildVehicleSnapshot({ request, formData });
  const requestId = firstText(request.id, rawRequest.id);
  const requestReference = firstText(
    request.requestReference,
    rawRequest.request_reference,
    rawRequest.reference,
    requestId ? `RQ-${String(requestId).slice(0, 8).toUpperCase()}` : ''
  );
  const currencyCode = firstText(request.currencyCode, rawRequest.currency_code, 'MAD');
  const rentalType = cleanText(request.rentalType || rawRequest.rental_type || 'hourly').toLowerCase();
  const durationUnits = getRequestDurationUnits(request);
  const estimatedAmount = Math.max(0, safeNumber(request.estimatedAmount || rawRequest.estimated_amount));
  const depositAmount = Math.max(0, safeNumber(request.depositAmount || rawRequest.damage_deposit || rawRequest.deposit_amount));
  const actualStartedAt = firstText(draft.startedAt, rawRequest.started_at, request.startedAt);
  const startedAt = firstText(actualStartedAt, request.requestedStartAt);
  const expectedReturnAt = firstText(request.requestedEndAt, rawRequest.requested_end_at);
  const finalReturnAt = firstText(draft.returnSavedAt, rawRequest.actual_end_date, rawRequest.completed_at, expectedReturnAt);
  const status = normalizeMarketplaceRequestLifecycleStatus(request.requestStatus || rawRequest.request_status || 'pending');
  const depositOutcome = cleanText(draft.depositOutcome).toLowerCase();
  const depositRefundAmount = Math.max(0, safeNumber(draft.depositRefundAmount || depositAmount));
  const documentArtifacts = {
    contractUrl: cleanText(draft.contractDocumentUrl),
    contractGeneratedAt: draft.contractDocumentGeneratedAt || null,
    finalReceiptUrl: cleanText(draft.finalReceiptUrl),
    finalReceiptGeneratedAt: draft.finalReceiptGeneratedAt || null,
    contractSignatureUrl: cleanText(draft.contractSignatureUrl),
    contractSignedAt: draft.contractSignedAt || null,
    refundSignatureUrl: cleanText(draft.depositRefundSignatureUrl),
    refundSignedAt: draft.depositRefundSignedAt || null,
  };
  const evidence = {
    handoffPhotos: normalizeDocumentPhotos(draft.handoffPhotos),
    legalDocsPhotos: normalizeDocumentPhotos(draft.legalDocsPhotos),
    returnPhotos: normalizeDocumentPhotos(draft.returnPhotos),
    vehicleDocuments: Array.isArray(vehicleDocuments) ? vehicleDocuments : [],
  };
  const rentalLike = {
    id: buildDocumentId('marketplace', requestId, requestReference),
    rental_id: requestReference || buildDocumentId('marketplace', requestId),
    source_type: 'driveout_marketplace',
    source_context: 'driveout_marketplace_request',
    document_brand: DRIVEOUT_MARKETPLACE_DOCUMENT_BRAND.key,
    company_name: DRIVEOUT_MARKETPLACE_DOCUMENT_BRAND.companyName,
    company_legal_name: DRIVEOUT_MARKETPLACE_DOCUMENT_BRAND.legalName,
    marketplace_request_id: requestId || null,
    marketplace_request_reference: requestReference || null,
    request_status: status,
    rental_status: draft.returnSavedAt ? 'completed' : draft.startedAt ? 'active' : status,
    customer_id: customer.id || null,
    customer_name: customer.name,
    customer_email: customer.email,
    customer_phone: customer.phone,
    customer_license_number: customer.licenseNumber,
    customer_id_number: customer.idNumber,
    vehicle_public_profile_id: vehicle.id || null,
    listing_id: vehicle.listingId || null,
    vehicle_name_snapshot: vehicle.name,
    vehicle_model_snapshot: vehicle.model,
    vehicle_plate_number: vehicle.plateNumber,
    pickup_city: vehicle.city,
    pickup_area: vehicle.area,
    rental_start_date: startedAt || request.requestedStartAt || null,
    rental_end_date: expectedReturnAt || null,
    started_at: startedAt || null,
    actual_end_date: draft.returnSavedAt || null,
    rental_type: rentalType,
    duration: durationUnits,
    unit_price: durationUnits > 0 ? Number((estimatedAmount / durationUnits).toFixed(2)) : estimatedAmount,
    total_amount: estimatedAmount,
    deposit_amount: depositAmount,
    damage_deposit: depositAmount,
    currency_code: currencyCode,
    payment_status: estimatedAmount > 0 ? 'pending' : 'unpaid',
    contract_signed: Boolean(draft.contractSigned || documentArtifacts.contractSignatureUrl),
    signature_url: documentArtifacts.contractSignatureUrl || null,
    contract_signed_at: draft.contractSignedAt || null,
    start_odometer: draft.startOdometer || null,
    ending_odometer: draft.returnOdometer || null,
    start_fuel_level: draft.startFuelLevel || null,
    end_fuel_level: draft.returnFuelLevel || null,
    current_fuel_level: vehicleFuelState?.current_fuel_lines ?? null,
    deposit_reviewed: Boolean(draft.depositReviewed),
    deposit_outcome: depositOutcome,
    deposit_return_amount: depositOutcome === 'refund_full' ? depositRefundAmount : 0,
    deposit_returned_at: depositOutcome === 'refund_full' ? draft.depositRefundSignedAt || draft.returnSavedAt || null : null,
    deposit_return_signature_url: documentArtifacts.refundSignatureUrl || null,
    deposit_refund_recorded_by: draft.depositRefundRecordedBy || ownerUserId || null,
    owner_user_id: ownerUserId || request.ownerId || null,
    hide_contract_pricing: true,
    is_driveout_marketplace_document: true,
    evidence,
    owner_execution: draft,
    raw_marketplace_request: rawRequest,
    vehicle: {
      id: vehicle.id || null,
      name: vehicle.name,
      model: vehicle.model,
      plate_number: vehicle.plateNumber,
      category: vehicle.category,
      image_url: vehicle.imageUrl,
    },
  };
  const contractMissingFields = buildMissingFields([
    { label: 'customer name', value: customer.name && customer.name !== 'Customer' },
    { label: 'vehicle', value: vehicle.name },
    { label: 'start time', value: startedAt || request.requestedStartAt },
    { label: 'expected return time', value: expectedReturnAt },
    { label: 'start signature', value: documentArtifacts.contractSignatureUrl },
  ]);
  const receiptMissingFields = buildMissingFields([
    { label: 'rental started', value: actualStartedAt },
    {
      label: 'refund signature',
      value: !draft.returnSavedAt || depositOutcome !== 'refund_full' || documentArtifacts.refundSignatureUrl,
    },
  ]);

  return {
    version: DRIVEOUT_MARKETPLACE_DOCUMENT_VERSION,
    language,
    brand: DRIVEOUT_MARKETPLACE_DOCUMENT_BRAND,
    request: {
      id: requestId || null,
      reference: requestReference || null,
      status,
      rentalType,
      duration: durationUnits,
      currencyCode,
      estimatedAmount,
      depositAmount,
    },
    customer,
    vehicle,
    execution: draft,
    artifacts: documentArtifacts,
    evidence,
    rental: rentalLike,
    contract: {
      kind: 'driveout_marketplace_contract',
      documentId: buildDocumentId('contract', requestReference || requestId),
      url: documentArtifacts.contractUrl,
      generatedAt: documentArtifacts.contractGeneratedAt,
      canGenerate: contractMissingFields.length === 0,
      missingFields: contractMissingFields,
      hidePricing: true,
      rental: {
        ...rentalLike,
        total_amount: 0,
        unit_price: 0,
        payment_status: '',
        contract_document_mode: 'driveout_marketplace_no_pricing',
      },
    },
    finalReceipt: {
      kind: 'driveout_marketplace_receipt',
      documentId: buildDocumentId('receipt', requestReference || requestId),
      url: documentArtifacts.finalReceiptUrl,
      generatedAt: documentArtifacts.finalReceiptGeneratedAt,
      canGenerate: receiptMissingFields.length === 0,
      missingFields: receiptMissingFields,
      refund: {
        outcome: depositOutcome,
        amount: depositOutcome === 'refund_full' ? depositRefundAmount : 0,
        currencyCode,
        signatureUrl: documentArtifacts.refundSignatureUrl,
        signedAt: draft.depositRefundSignedAt || null,
        signedBy: draft.depositRefundSignedBy || customer.id || customer.email || customer.name || '',
        recordedBy: draft.depositRefundRecordedBy || ownerUserId || '',
      },
      rental: rentalLike,
    },
  };
};
