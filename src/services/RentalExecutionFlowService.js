import { supabase } from '../lib/supabase';
import { getCurrentOrganizationId } from './OrganizationService';
import {
  buildRentalExecutionRecordPayload,
  normalizeRentalExecutionDraft,
  normalizeRentalExecutionRecord,
  RENTAL_EXECUTION_RECORDS_TABLE,
} from '../utils/rentalExecutionFlow';

let rentalExecutionRecordsUnavailable = false;
let rentalExecutionRecordsWritesUnavailable = false;

const isMissingTableError = (error) => {
  const code = String(error?.code || '').trim().toUpperCase();
  const status = Number(error?.status || 0);
  const message = String(error?.message || error?.details || '').trim().toLowerCase();
  return (
    code === '42P01' ||
    status === 404 ||
    (message.includes('relation') && message.includes('does not exist')) ||
    message.includes('not found')
  );
};

const isPermissionDeniedError = (error) => {
  const code = String(error?.code || '').trim().toUpperCase();
  const status = Number(error?.status || 0);
  const message = String(error?.message || error?.details || '').trim().toLowerCase();
  return (
    code === '42501' ||
    status === 401 ||
    status === 403 ||
    message.includes('permission denied') ||
    message.includes('row-level security') ||
    message.includes('rls')
  );
};

class RentalExecutionFlowService {
  static async getMarketplaceOwnerExecutionRecord(requestId) {
    if (rentalExecutionRecordsUnavailable) return null;

    const normalizedRequestId = String(requestId || '').trim();
    if (!normalizedRequestId) return null;

    const { data, error } = await supabase
      .from(RENTAL_EXECUTION_RECORDS_TABLE)
      .select('*')
      .eq('marketplace_request_id', normalizedRequestId)
      .maybeSingle();

    if (error) {
      if (isMissingTableError(error)) {
        rentalExecutionRecordsUnavailable = true;
        return null;
      }
      console.warn('Failed to load rental execution record:', error);
      return null;
    }

    return data ? normalizeRentalExecutionRecord(data) : null;
  }

  static async upsertMarketplaceOwnerExecutionRecord({
    requestId,
    rentalId = null,
    ownerUserId = null,
    customerUserId = null,
    vehicleId = null,
    requestStatus = '',
    executionDraft = {},
  }) {
    if (rentalExecutionRecordsUnavailable || rentalExecutionRecordsWritesUnavailable) {
      return null;
    }

    const normalizedRequestId = String(requestId || '').trim();
    if (!normalizedRequestId) return null;

    const organizationId = await getCurrentOrganizationId().catch(() => null);
    if (!organizationId) return null;

    const payload = buildRentalExecutionRecordPayload({
      organizationId,
      requestId: normalizedRequestId,
      rentalId,
      ownerUserId,
      customerUserId,
      vehicleId,
      requestStatus,
      executionDraft: normalizeRentalExecutionDraft(executionDraft),
    });

    const { data, error } = await supabase
      .from(RENTAL_EXECUTION_RECORDS_TABLE)
      .upsert([payload], { onConflict: 'marketplace_request_id' })
      .select('*')
      .maybeSingle();

    if (error) {
      if (isMissingTableError(error)) {
        rentalExecutionRecordsUnavailable = true;
        return null;
      }
      if (isPermissionDeniedError(error)) {
        rentalExecutionRecordsWritesUnavailable = true;
        return null;
      }
      console.warn('Failed to upsert rental execution record:', error);
      return null;
    }

    return normalizeRentalExecutionRecord(data || payload);
  }
}

export default RentalExecutionFlowService;
