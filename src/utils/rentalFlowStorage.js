import { buildTenantScopedStoragePath, sanitizeStorageSegment } from './storageUpload';

export const RENTAL_FLOW_STORAGE_NAMESPACE = 'driveout:rental-flow';

const LEGACY_RENTAL_FLOW_DRAFT_KEY_PREFIX = {
  start: 'rental_start_workflow_',
  finish: 'rental_finish_workflow_',
};

const LEGACY_RENTAL_FLOW_SESSION_SNAPSHOT_KEYS = {
  'return-context': 'rentals_return_snapshot',
};

const normalizeFlowSegment = (value, fallback) =>
  sanitizeStorageSegment(String(value || '').trim().toLowerCase(), fallback);

export const buildRentalFlowDraftStorageKey = ({ flow = 'start', rentalId } = {}) => {
  const safeRentalId = sanitizeStorageSegment(rentalId, '');
  if (!safeRentalId) return null;
  const safeFlow = normalizeFlowSegment(flow, 'start');
  return `${RENTAL_FLOW_STORAGE_NAMESPACE}:draft:${safeFlow}:${safeRentalId}`;
};

export const getRentalFlowDraftStorageKeys = ({ flow = 'start', rentalId } = {}) => {
  const safeFlow = normalizeFlowSegment(flow, 'start');
  const safeRentalId = String(rentalId || '').trim();
  if (!safeRentalId) return [];

  const primaryKey = buildRentalFlowDraftStorageKey({ flow: safeFlow, rentalId: safeRentalId });
  const legacyPrefix = LEGACY_RENTAL_FLOW_DRAFT_KEY_PREFIX[safeFlow] || LEGACY_RENTAL_FLOW_DRAFT_KEY_PREFIX.start;
  const legacyKey = `${legacyPrefix}${safeRentalId}`;

  return [...new Set([primaryKey, legacyKey].filter(Boolean))];
};

export const buildRentalFlowSessionSnapshotKey = ({ scope = 'return-context' } = {}) =>
  `${RENTAL_FLOW_STORAGE_NAMESPACE}:session:${normalizeFlowSegment(scope, 'snapshot')}`;

export const getRentalFlowSessionSnapshotKeys = ({ scope = 'return-context' } = {}) => {
  const safeScope = normalizeFlowSegment(scope, 'snapshot');
  const primaryKey = buildRentalFlowSessionSnapshotKey({ scope: safeScope });
  const legacyKey = LEGACY_RENTAL_FLOW_SESSION_SNAPSHOT_KEYS[safeScope] || null;

  return [...new Set([primaryKey, legacyKey].filter(Boolean))];
};

export const readFirstAvailableStorageValue = (storage, keys = []) => {
  if (!storage) return null;

  for (const key of Array.isArray(keys) ? keys : [keys]) {
    const safeKey = String(key || '').trim();
    if (!safeKey) continue;
    const value = storage.getItem(safeKey);
    if (value !== null && value !== undefined && value !== '') {
      return value;
    }
  }

  return null;
};

export const removeStorageValues = (storage, keys = []) => {
  if (!storage) return;

  (Array.isArray(keys) ? keys : [keys]).forEach((key) => {
    const safeKey = String(key || '').trim();
    if (!safeKey) return;
    try {
      storage.removeItem(safeKey);
    } catch {
      // Ignore storage cleanup failures.
    }
  });
};

export const buildRentalFlowMediaPathPrefix = ({
  rentalId,
  flow = 'start',
  phase = 'inspection',
  actor = 'owner',
  surface = 'account',
} = {}) => {
  const safeRentalId = sanitizeStorageSegment(rentalId, '');
  if (!safeRentalId) return '';

  const safeFlow = normalizeFlowSegment(flow, 'start');
  const safePhase = normalizeFlowSegment(phase, 'inspection');
  const safeActor = normalizeFlowSegment(actor, 'owner');
  const safeSurface = normalizeFlowSegment(surface, 'account');

  return `rentals/${safeRentalId}/${safeSurface}-${safeActor}-flow/${safeFlow}/${safePhase}`;
};

export const buildRentalFlowMediaUploadPath = ({
  organizationId,
  rentalId,
  flow = 'start',
  phase = 'inspection',
  actor = 'owner',
  surface = 'account',
  fileName = '',
} = {}) => {
  const pathPrefix = buildRentalFlowMediaPathPrefix({
    rentalId,
    flow,
    phase,
    actor,
    surface,
  });

  if (!pathPrefix) return '';

  return buildTenantScopedStoragePath({
    organizationId,
    pathPrefix,
    fileName: sanitizeStorageSegment(fileName, 'upload.bin'),
  });
};
