import { normalizeMarketplaceRequestLifecycleStatus } from './marketplaceRequestState';
import { buildOwnerExecutionWorkspaceHref, getOwnerExecutionRequestStage } from './ownerRentalExecutionLinks';
import { normalizeRentalExecutionDraft } from './rentalExecutionFlow';

const CANCELLED_STATUSES = new Set(['declined', 'rejected', 'cancelled', 'canceled', 'expired', 'no_show']);

const safeNumber = (value = 0) => Math.max(0, Number(value || 0) || 0);

const getMileageOverageSummary = (draft = {}) => {
  const amount = safeNumber(draft.mileageOverageAmount);
  const extraKm = safeNumber(draft.mileageOverageExtraKm);
  const settlement = String(draft.mileageOverageSettlement || '').trim().toLowerCase();
  if (amount <= 0 && extraKm <= 0) return null;

  return {
    settlement,
    amount,
    currencyCode: String(draft.mileageOverageCurrency || 'MAD').trim() || 'MAD',
    extraKm,
    totalKm: safeNumber(draft.mileageOverageTotalKm),
    includedKm: safeNumber(draft.mileageOverageIncludedKm),
    rate: safeNumber(draft.mileageOverageRate),
    signatureUrl: String(draft.mileageOverageSignatureUrl || '').trim(),
    signedAt: draft.mileageOverageSignedAt || null,
  };
};

const getHistoryStatus = (request = {}, stage = '') => {
  const status = normalizeMarketplaceRequestLifecycleStatus(request?.requestStatus || request);
  if (stage === 'completed' || status === 'completed' || request?.closedAt || request?.closed_at) return 'completed';
  if (stage === 'return_pending' || stage === 'live' || status === 'active') return 'active';
  if (CANCELLED_STATUSES.has(status)) return 'cancelled';
  if (['approved', 'pre_approved', 'pending', 'countered'].includes(status) || ['handoff', 'ready_to_start', 'approved'].includes(stage)) {
    return 'upcoming';
  }
  return status || 'upcoming';
};

const getPrimaryDate = (request = {}, draft = {}, status = '') => {
  if (status === 'completed') {
    return draft.returnSavedAt || draft.completionReceipt?.completedAt || request.closedAt || request.closed_at || request.updatedAt || request.createdAt || null;
  }
  if (status === 'active') {
    return draft.startedAt || request.updatedAt || request.requestedStartAt || request.createdAt || null;
  }
  return request.requestedStartAt || request.createdAt || request.updatedAt || null;
};

export const normalizeOwnerRentalHistoryRow = (request = {}) => {
  const draft = normalizeRentalExecutionDraft(
    request?.ownerExecution ||
      request?.owner_execution ||
      request?.rawRequest?.counter_offer?.owner_execution ||
      request?.counterOffer?.owner_execution ||
      {}
  );
  const stage = getOwnerExecutionRequestStage({
    ...request,
    ownerExecution: draft,
    rawRequest: {
      ...(request?.rawRequest || {}),
      counter_offer: {
        ...((request?.rawRequest?.counter_offer && typeof request.rawRequest.counter_offer === 'object') ? request.rawRequest.counter_offer : {}),
        owner_execution: draft,
      },
    },
  });
  const status = getHistoryStatus(request, stage);
  const primaryDate = getPrimaryDate(request, draft, status);
  const requestId = String(request?.id || request?.requestId || '').trim();
  const receiptUrl = String(draft.completionReceipt?.url || draft.finalReceiptUrl || '').trim();
  const contractUrl = String(draft.contractDocumentUrl || '').trim();
  const mediaCounts = {
    open: draft.handoffPhotos.length,
    documents: draft.legalDocsPhotos.length,
    closed: draft.returnPhotos.length,
  };
  const mileageOverage = getMileageOverageSummary(draft);

  return {
    id: requestId,
    reference: String(request?.requestReference || request?.reference || '').trim(),
    status,
    stage,
    requestStatus: normalizeMarketplaceRequestLifecycleStatus(request?.requestStatus || request),
    customerName: String(request?.customerName || 'Customer').trim(),
    customerEmail: String(request?.customerEmail || '').trim(),
    vehicleName: String(request?.listingTitle || [request?.brandName, request?.modelName].filter(Boolean).join(' ') || 'Vehicle').trim(),
    vehicleId: String(request?.vehiclePublicProfileId || request?.rawListing?.vehicle_public_profile_id || request?.rawProfile?.id || '').trim(),
    coverImageUrl: String(request?.coverImageUrl || '').trim(),
    cityName: String(request?.cityName || '').trim(),
    requestedStartAt: request?.requestedStartAt || null,
    requestedEndAt: request?.requestedEndAt || null,
    startedAt: draft.startedAt || null,
    completedAt: draft.returnSavedAt || draft.completionReceipt?.completedAt || request?.closedAt || request?.closed_at || null,
    primaryDate,
    currencyCode: String(request?.currencyCode || draft.depositRefundCurrency || 'MAD').trim() || 'MAD',
    estimatedAmount: safeNumber(request?.estimatedAmount),
    ownerPayoutAmount: safeNumber(request?.ownerPayoutAmount),
    depositAmount: safeNumber(request?.depositAmount),
    depositOutcome: String(draft.depositOutcome || '').trim().toLowerCase(),
    mileageOverage,
    mediaCounts,
    totalMediaCount: mediaCounts.open + mediaCounts.documents + mediaCounts.closed,
    receiptUrl,
    contractUrl,
    chatHref: requestId ? `/account/messages?requestId=${encodeURIComponent(requestId)}` : '/account/messages',
    detailsHref: buildOwnerExecutionWorkspaceHref(request, { focus: status === 'completed' ? 'execution' : 'request' }),
    rawRequest: request,
    ownerExecution: draft,
    sortTime: new Date(primaryDate || request?.updatedAt || request?.createdAt || 0).getTime() || 0,
  };
};

export const normalizeOwnerRentalHistoryRows = (requests = []) =>
  (Array.isArray(requests) ? requests : [])
    .map(normalizeOwnerRentalHistoryRow)
    .filter((row) => row.id)
    .sort((left, right) => right.sortTime - left.sortTime);
