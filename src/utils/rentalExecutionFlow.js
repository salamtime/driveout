import { normalizeMarketplaceRequestLifecycleStatus } from './marketplaceRequestState.js';

export const RENTAL_EXECUTION_RECORDS_TABLE = 'app_4c3a7a6153_rental_execution_records';

export const RENTAL_EXECUTION_FLOW_MIN_PHOTOS = Object.freeze({
  handoff: 3,
  legalDocs: 2,
  return: 3,
});

export const RENTAL_EXECUTION_STAGES = Object.freeze([
  'approved',
  'handoff',
  'ready_to_start',
  'live',
  'return_pending',
  'completed',
]);

export const createRentalExecutionDraft = () => ({
  handoffChecked: false,
  handoffConditionReviewed: false,
  handoffConditionNote: '',
  handoffMediaReady: false,
  handoffPhotos: [],
  startOdometer: '',
  startFuelLevel: '',
  legalDocsMediaReady: false,
  legalDocsPhotos: [],
  legalDocsChecked: false,
  depositConfirmed: false,
  contractSigned: false,
  contractSignatureUrl: '',
  contractSignedAt: null,
  contractDocumentUrl: '',
  contractDocumentGeneratedAt: null,
  startReadyAt: null,
  startedAt: null,
  returnPendingAt: null,
  returnMediaReady: false,
  returnPhotos: [],
  returnOdometer: '',
  returnFuelLevel: '',
  issueReviewed: false,
  issueReported: false,
  issueNote: '',
  depositReviewed: false,
  depositOutcome: '',
  depositRefundSignatureUrl: '',
  depositRefundSignedAt: null,
  depositRefundAmount: 0,
  depositRefundCurrency: '',
  depositRefundSignedBy: '',
  depositRefundRecordedBy: '',
  mileageOverageReviewed: false,
  mileageOverageSettlement: '',
  mileageOverageAmount: 0,
  mileageOverageCurrency: '',
  mileageOverageExtraKm: 0,
  mileageOverageTotalKm: 0,
  mileageOverageIncludedKm: 0,
  mileageOverageRate: 0,
  mileageOverageReviewedAt: null,
  mileageOverageSignatureUrl: '',
  mileageOverageSignedAt: null,
  mileageOverageSignedBy: '',
  mileageOverageRecordedBy: '',
  finalReceiptUrl: '',
  finalReceiptGeneratedAt: null,
  completionReceipt: null,
  returnSavedAt: null,
});

export const normalizeRentalExecutionPhotos = (photos) =>
  (Array.isArray(photos) ? photos : [])
    .map((photo, index) => ({
      id: String(photo?.id || `rental-execution-photo-${index}`).trim(),
      kind: String(photo?.kind || 'photo').trim().toLowerCase() || 'photo',
      bucket: String(photo?.bucket || '').trim(),
      storagePath: String(photo?.storagePath || photo?.storage_path || '').trim(),
      publicUrl: String(photo?.publicUrl || photo?.public_url || '').trim(),
      thumbnailUrl: String(
        photo?.thumbnailUrl ||
        photo?.thumbnail_url ||
        photo?.publicUrl ||
        photo?.public_url ||
        ''
      ).trim(),
      mimeType: String(photo?.mimeType || photo?.mime_type || '').trim().toLowerCase(),
      originalFilename: String(photo?.originalFilename || photo?.original_filename || '').trim(),
      fileSize: Number(photo?.fileSize || photo?.file_size || 0) || 0,
      uploadedAt: photo?.uploadedAt || photo?.uploaded_at || null,
    }))
    .filter((photo) => photo.publicUrl || photo.thumbnailUrl);

const normalizeRentalExecutionCompletionReceipt = (receipt, fallback = {}) => {
  const raw = receipt && typeof receipt === 'object' ? receipt : {};
  const url = String(raw.url || raw.href || fallback.finalReceiptUrl || '').trim();
  if (!url) return null;
  const rawMileageOverage = raw.mileageOverage || raw.mileage_overage || {};
  const fallbackMileageAmount = Math.max(0, Number(fallback.mileageOverageAmount || 0) || 0);
  const mileageOverage = {
    settlement: String(rawMileageOverage.settlement || fallback.mileageOverageSettlement || '').trim().toLowerCase(),
    amount: Math.max(0, Number(rawMileageOverage.amount ?? fallbackMileageAmount) || 0),
    currency: String(rawMileageOverage.currency || rawMileageOverage.currencyCode || fallback.mileageOverageCurrency || '').trim(),
    extraKm: Math.max(0, Number(rawMileageOverage.extraKm ?? fallback.mileageOverageExtraKm ?? 0) || 0),
    totalKm: Math.max(0, Number(rawMileageOverage.totalKm ?? fallback.mileageOverageTotalKm ?? 0) || 0),
    includedKm: Math.max(0, Number(rawMileageOverage.includedKm ?? fallback.mileageOverageIncludedKm ?? 0) || 0),
    rate: Math.max(0, Number(rawMileageOverage.rate ?? fallback.mileageOverageRate ?? 0) || 0),
    signatureUrl: String(rawMileageOverage.signatureUrl || fallback.mileageOverageSignatureUrl || '').trim(),
    signedAt: rawMileageOverage.signedAt || fallback.mileageOverageSignedAt || null,
  };

  return {
    url,
    generatedAt: raw.generatedAt || raw.generated_at || fallback.finalReceiptGeneratedAt || null,
    completedAt: raw.completedAt || raw.completed_at || fallback.returnSavedAt || null,
    label: String(raw.label || 'Final receipt').trim() || 'Final receipt',
    kind: String(raw.kind || 'receipt').trim().toLowerCase() || 'receipt',
    depositOutcome: String(raw.depositOutcome || raw.deposit_outcome || fallback.depositOutcome || '').trim().toLowerCase(),
    refundAmount: Math.max(0, Number(raw.refundAmount || raw.refund_amount || fallback.depositRefundAmount || 0) || 0),
    refundCurrency: String(raw.refundCurrency || raw.refund_currency || fallback.depositRefundCurrency || '').trim(),
    refundSignatureUrl: String(
      raw.refundSignatureUrl ||
      raw.refund_signature_url ||
      fallback.depositRefundSignatureUrl ||
      ''
    ).trim(),
    refundSignedAt: raw.refundSignedAt || raw.refund_signed_at || fallback.depositRefundSignedAt || null,
    mileageOverage: mileageOverage.amount > 0 || mileageOverage.extraKm > 0 ? mileageOverage : null,
  };
};

export const normalizeRentalExecutionDraft = (value) => {
  const raw = value && typeof value === 'object' ? value : {};
  const handoffPhotos = normalizeRentalExecutionPhotos(raw.handoffPhotos);
  const legalDocsPhotos = normalizeRentalExecutionPhotos(raw.legalDocsPhotos || raw.legal_docs_photos);
  const returnPhotos = normalizeRentalExecutionPhotos(raw.returnPhotos);

  const normalizedDraft = {
    handoffChecked: Boolean(raw.handoffChecked),
    handoffConditionReviewed: Boolean(raw.handoffConditionReviewed),
    handoffConditionNote: String(raw.handoffConditionNote || '').trim(),
    handoffMediaReady:
      Boolean(raw.handoffMediaReady) ||
      handoffPhotos.length >= RENTAL_EXECUTION_FLOW_MIN_PHOTOS.handoff,
    handoffPhotos,
    startOdometer:
      raw.startOdometer === null || raw.startOdometer === undefined || raw.startOdometer === ''
        ? ''
        : String(raw.startOdometer),
    startFuelLevel:
      raw.startFuelLevel === null || raw.startFuelLevel === undefined || raw.startFuelLevel === ''
        ? ''
        : String(raw.startFuelLevel),
    legalDocsMediaReady:
      Boolean(raw.legalDocsMediaReady) ||
      legalDocsPhotos.length >= RENTAL_EXECUTION_FLOW_MIN_PHOTOS.legalDocs,
    legalDocsPhotos,
    legalDocsChecked:
      Boolean(raw.legalDocsChecked) ||
      Boolean(raw.legalDocsMediaReady) ||
      legalDocsPhotos.length >= RENTAL_EXECUTION_FLOW_MIN_PHOTOS.legalDocs,
    depositConfirmed: Boolean(raw.depositConfirmed),
    contractSigned: Boolean(raw.contractSigned),
    contractSignatureUrl: String(raw.contractSignatureUrl || raw.contract_signature_url || '').trim(),
    contractSignedAt: raw.contractSignedAt || raw.contract_signed_at || null,
    contractDocumentUrl: String(raw.contractDocumentUrl || raw.contract_document_url || raw.contractUrl || '').trim(),
    contractDocumentGeneratedAt:
      raw.contractDocumentGeneratedAt || raw.contract_document_generated_at || raw.contractGeneratedAt || null,
    startReadyAt: raw.startReadyAt || null,
    startedAt: raw.startedAt || null,
    returnPendingAt: raw.returnPendingAt || null,
    returnMediaReady:
      Boolean(raw.returnMediaReady) ||
      returnPhotos.length >= RENTAL_EXECUTION_FLOW_MIN_PHOTOS.return,
    returnPhotos,
    returnOdometer:
      raw.returnOdometer === null || raw.returnOdometer === undefined || raw.returnOdometer === ''
        ? ''
        : String(raw.returnOdometer),
    returnFuelLevel:
      raw.returnFuelLevel === null || raw.returnFuelLevel === undefined || raw.returnFuelLevel === ''
        ? ''
        : String(raw.returnFuelLevel),
    issueReviewed: Boolean(raw.issueReviewed),
    issueReported: Boolean(raw.issueReported),
    issueNote: String(raw.issueNote || '').trim(),
    depositReviewed: Boolean(raw.depositReviewed),
    depositOutcome: String(raw.depositOutcome || '').trim().toLowerCase(),
    depositRefundSignatureUrl: String(raw.depositRefundSignatureUrl || raw.deposit_refund_signature_url || '').trim(),
    depositRefundSignedAt: raw.depositRefundSignedAt || raw.deposit_refund_signed_at || null,
    depositRefundAmount: Math.max(0, Number(raw.depositRefundAmount || raw.deposit_refund_amount || 0) || 0),
    depositRefundCurrency: String(raw.depositRefundCurrency || raw.deposit_refund_currency || '').trim(),
    depositRefundSignedBy: String(raw.depositRefundSignedBy || raw.deposit_refund_signed_by || '').trim(),
    depositRefundRecordedBy: String(raw.depositRefundRecordedBy || raw.deposit_refund_recorded_by || '').trim(),
    mileageOverageReviewed: Boolean(raw.mileageOverageReviewed || raw.mileage_overage_reviewed),
    mileageOverageSettlement: String(raw.mileageOverageSettlement || raw.mileage_overage_settlement || '').trim().toLowerCase(),
    mileageOverageAmount: Math.max(0, Number(raw.mileageOverageAmount || raw.mileage_overage_amount || 0) || 0),
    mileageOverageCurrency: String(raw.mileageOverageCurrency || raw.mileage_overage_currency || '').trim(),
    mileageOverageExtraKm: Math.max(0, Number(raw.mileageOverageExtraKm || raw.mileage_overage_extra_km || 0) || 0),
    mileageOverageTotalKm: Math.max(0, Number(raw.mileageOverageTotalKm || raw.mileage_overage_total_km || 0) || 0),
    mileageOverageIncludedKm: Math.max(0, Number(raw.mileageOverageIncludedKm || raw.mileage_overage_included_km || 0) || 0),
    mileageOverageRate: Math.max(0, Number(raw.mileageOverageRate || raw.mileage_overage_rate || 0) || 0),
    mileageOverageReviewedAt: raw.mileageOverageReviewedAt || raw.mileage_overage_reviewed_at || null,
    mileageOverageSignatureUrl: String(raw.mileageOverageSignatureUrl || raw.mileage_overage_signature_url || '').trim(),
    mileageOverageSignedAt: raw.mileageOverageSignedAt || raw.mileage_overage_signed_at || null,
    mileageOverageSignedBy: String(raw.mileageOverageSignedBy || raw.mileage_overage_signed_by || '').trim(),
    mileageOverageRecordedBy: String(raw.mileageOverageRecordedBy || raw.mileage_overage_recorded_by || '').trim(),
    finalReceiptUrl: String(raw.finalReceiptUrl || raw.final_receipt_url || raw.receiptUrl || '').trim(),
    finalReceiptGeneratedAt:
      raw.finalReceiptGeneratedAt || raw.final_receipt_generated_at || raw.receiptGeneratedAt || null,
    completionReceipt: null,
    returnSavedAt: raw.returnSavedAt || null,
  };

  normalizedDraft.completionReceipt = normalizeRentalExecutionCompletionReceipt(
    raw.completionReceipt || raw.completion_receipt,
    normalizedDraft
  );

  return normalizedDraft;
};

export const isRentalExecutionHandoffLocked = (draft = {}, requestStatus = '') => {
  const normalizedStatus = normalizeMarketplaceRequestLifecycleStatus(requestStatus);
  return Boolean(
    draft?.startedAt ||
    draft?.returnPendingAt ||
    draft?.returnSavedAt ||
    ['active', 'completed'].includes(normalizedStatus)
  );
};

export const isRentalExecutionReturnLocked = (draft = {}, requestStatus = '') => {
  const normalizedStatus = normalizeMarketplaceRequestLifecycleStatus(requestStatus);
  return Boolean(draft?.returnSavedAt || normalizedStatus === 'completed');
};

export const deriveRentalExecutionStage = (draft = {}, requestStatus = '') => {
  const normalizedDraft = normalizeRentalExecutionDraft(draft);
  const normalizedStatus = normalizeMarketplaceRequestLifecycleStatus(requestStatus);

  if (normalizedStatus === 'completed' || normalizedDraft.returnSavedAt) return 'completed';
  if ((normalizedStatus === 'active' || normalizedDraft.startedAt) && normalizedDraft.returnPendingAt) {
    return 'return_pending';
  }
  if (normalizedStatus === 'active' || normalizedDraft.startedAt) return 'live';
  if (normalizedStatus === 'approved' || normalizedDraft.startReadyAt) {
    return normalizedDraft.startReadyAt ? 'ready_to_start' : 'handoff';
  }
  return normalizedStatus === 'approved' ? 'approved' : 'approved';
};

export const buildRentalExecutionEvidenceCounts = (draft = {}) => {
  const normalizedDraft = normalizeRentalExecutionDraft(draft);
  return {
    handoffPhotos: normalizedDraft.handoffPhotos.length,
    legalDocsPhotos: normalizedDraft.legalDocsPhotos.length,
    returnPhotos: normalizedDraft.returnPhotos.length,
  };
};

export const buildRentalExecutionSnapshots = (draft = {}) => {
  const normalizedDraft = normalizeRentalExecutionDraft(draft);
  return {
    handoff: {
      handoffChecked: normalizedDraft.handoffChecked,
      handoffConditionReviewed: normalizedDraft.handoffConditionReviewed,
      handoffConditionNote: normalizedDraft.handoffConditionNote,
      handoffMediaReady: normalizedDraft.handoffMediaReady,
      handoffPhotos: normalizedDraft.handoffPhotos,
      startOdometer: normalizedDraft.startOdometer,
      startFuelLevel: normalizedDraft.startFuelLevel,
      legalDocsMediaReady: normalizedDraft.legalDocsMediaReady,
      legalDocsPhotos: normalizedDraft.legalDocsPhotos,
      legalDocsChecked: normalizedDraft.legalDocsChecked,
      depositConfirmed: normalizedDraft.depositConfirmed,
      contractSigned: normalizedDraft.contractSigned,
      contractSignatureUrl: normalizedDraft.contractSignatureUrl,
      contractSignedAt: normalizedDraft.contractSignedAt,
      contractDocumentUrl: normalizedDraft.contractDocumentUrl,
      contractDocumentGeneratedAt: normalizedDraft.contractDocumentGeneratedAt,
      startReadyAt: normalizedDraft.startReadyAt,
      startedAt: normalizedDraft.startedAt,
    },
    return: {
      returnPendingAt: normalizedDraft.returnPendingAt,
      returnMediaReady: normalizedDraft.returnMediaReady,
      returnPhotos: normalizedDraft.returnPhotos,
      returnOdometer: normalizedDraft.returnOdometer,
      returnFuelLevel: normalizedDraft.returnFuelLevel,
      issueReviewed: normalizedDraft.issueReviewed,
      issueReported: normalizedDraft.issueReported,
      issueNote: normalizedDraft.issueNote,
      depositReviewed: normalizedDraft.depositReviewed,
      depositOutcome: normalizedDraft.depositOutcome,
      depositRefundSignatureUrl: normalizedDraft.depositRefundSignatureUrl,
      depositRefundSignedAt: normalizedDraft.depositRefundSignedAt,
      depositRefundAmount: normalizedDraft.depositRefundAmount,
      depositRefundCurrency: normalizedDraft.depositRefundCurrency,
      depositRefundSignedBy: normalizedDraft.depositRefundSignedBy,
      depositRefundRecordedBy: normalizedDraft.depositRefundRecordedBy,
      mileageOverageReviewed: normalizedDraft.mileageOverageReviewed,
      mileageOverageSettlement: normalizedDraft.mileageOverageSettlement,
      mileageOverageAmount: normalizedDraft.mileageOverageAmount,
      mileageOverageCurrency: normalizedDraft.mileageOverageCurrency,
      mileageOverageExtraKm: normalizedDraft.mileageOverageExtraKm,
      mileageOverageTotalKm: normalizedDraft.mileageOverageTotalKm,
      mileageOverageIncludedKm: normalizedDraft.mileageOverageIncludedKm,
      mileageOverageRate: normalizedDraft.mileageOverageRate,
      mileageOverageReviewedAt: normalizedDraft.mileageOverageReviewedAt,
      mileageOverageSignatureUrl: normalizedDraft.mileageOverageSignatureUrl,
      mileageOverageSignedAt: normalizedDraft.mileageOverageSignedAt,
      mileageOverageSignedBy: normalizedDraft.mileageOverageSignedBy,
      mileageOverageRecordedBy: normalizedDraft.mileageOverageRecordedBy,
      finalReceiptUrl: normalizedDraft.finalReceiptUrl,
      finalReceiptGeneratedAt: normalizedDraft.finalReceiptGeneratedAt,
      completionReceipt: normalizedDraft.completionReceipt,
      returnSavedAt: normalizedDraft.returnSavedAt,
    },
  };
};

export const buildRentalExecutionRecordPayload = ({
  organizationId = null,
  requestId,
  rentalId = null,
  ownerUserId = null,
  customerUserId = null,
  vehicleId = null,
  requestStatus = '',
  executionDraft = {},
}) => {
  const normalizedDraft = normalizeRentalExecutionDraft(executionDraft);
  const snapshots = buildRentalExecutionSnapshots(normalizedDraft);

  return {
    organization_id: organizationId || null,
    marketplace_request_id: String(requestId || '').trim() || null,
    rental_id: rentalId || null,
    owner_user_id: ownerUserId || null,
    customer_user_id: customerUserId || null,
    vehicle_id: vehicleId || null,
    execution_stage: deriveRentalExecutionStage(normalizedDraft, requestStatus),
    latest_snapshot: normalizedDraft,
    handoff_snapshot: snapshots.handoff,
    return_snapshot: snapshots.return,
    evidence_counts: buildRentalExecutionEvidenceCounts(normalizedDraft),
    ready_to_start_at: normalizedDraft.startReadyAt || null,
    started_at: normalizedDraft.startedAt || null,
    return_pending_at: normalizedDraft.returnPendingAt || null,
    completed_at: normalizedDraft.returnSavedAt || null,
    updated_at: new Date().toISOString(),
  };
};

export const normalizeRentalExecutionRecord = (row = {}) => {
  const latestSnapshot = normalizeRentalExecutionDraft(
    row?.latest_snapshot && typeof row.latest_snapshot === 'object' ? row.latest_snapshot : {}
  );
  const snapshots = buildRentalExecutionSnapshots(latestSnapshot);

  return {
    id: String(row?.id || '').trim(),
    organizationId: String(row?.organization_id || '').trim() || null,
    requestId: String(row?.marketplace_request_id || '').trim() || null,
    rentalId: String(row?.rental_id || '').trim() || null,
    ownerUserId: String(row?.owner_user_id || '').trim() || null,
    customerUserId: String(row?.customer_user_id || '').trim() || null,
    vehicleId: row?.vehicle_id ?? null,
    executionStage: String(row?.execution_stage || deriveRentalExecutionStage(latestSnapshot, '')).trim().toLowerCase(),
    latestSnapshot,
    handoffSnapshot:
      row?.handoff_snapshot && typeof row.handoff_snapshot === 'object'
        ? row.handoff_snapshot
        : snapshots.handoff,
    returnSnapshot:
      row?.return_snapshot && typeof row.return_snapshot === 'object'
        ? row.return_snapshot
        : snapshots.return,
    evidenceCounts:
      row?.evidence_counts && typeof row.evidence_counts === 'object'
        ? row.evidence_counts
        : buildRentalExecutionEvidenceCounts(latestSnapshot),
    readyToStartAt: row?.ready_to_start_at || latestSnapshot.startReadyAt || null,
    startedAt: row?.started_at || latestSnapshot.startedAt || null,
    returnPendingAt: row?.return_pending_at || latestSnapshot.returnPendingAt || null,
    completedAt: row?.completed_at || latestSnapshot.returnSavedAt || null,
    createdAt: row?.created_at || null,
    updatedAt: row?.updated_at || null,
  };
};
