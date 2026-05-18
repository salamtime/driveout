import { supabase } from './supabaseClient';
import { getTenantSession } from './TenantRegistryService';
import { getHostContext } from '../utils/hostContext';

const inFlightTelegramAlerts = new Map();
let tenantSessionPromise = null;
const TELEGRAM_ALERT_TIMEOUT_MS = 5000;

const buildTelegramAlertRequestKey = (eventType, rental = {}) => {
  const normalizedEventType = String(eventType || '').trim().toLowerCase();
  const normalizedId = String(rental?.id || '').trim();
  const normalizedScope = String(rental?.testScope || '').trim().toLowerCase();
  const normalizedTenantId = String(rental?.tenant_id || '').trim();
  const normalizedBusinessAccountId = String(rental?.business_account_id || '').trim();
  const normalizedApprovalRequestId = String(rental?.approvalRequestId || rental?.requestId || rental?.request_id || '').trim();
  const normalizedApprovalType = String(rental?.approvalType || rental?.requestType || rental?.type || '').trim().toLowerCase();
  const normalizedApprovalView = String(rental?.approvalView || rental?.view || '').trim().toLowerCase();

  return [
    normalizedEventType,
    normalizedId,
    normalizedScope,
    normalizedTenantId,
    normalizedBusinessAccountId,
    normalizedApprovalRequestId,
    normalizedApprovalType,
    normalizedApprovalView,
  ].join('|');
};

export async function notifyRentalTelegramEvent(eventType, rental, options = {}) {
  if (!rental?.id || !eventType) return;

  const { throwOnError = false } = options || {};
  const requestKey = buildTelegramAlertRequestKey(eventType, rental);

  if (inFlightTelegramAlerts.has(requestKey)) {
    return inFlightTelegramAlerts.get(requestKey);
  }

  const requestPromise = (async () => {
    try {
    let tenantAwareRental = { ...(rental || {}) };
    const hasTenantIdentity =
      Boolean(String(tenantAwareRental?.tenant_id || '').trim()) ||
      Boolean(String(tenantAwareRental?.business_account_id || '').trim()) ||
      Boolean(String(tenantAwareRental?.tenant_slug || '').trim());

    if (!hasTenantIdentity) {
      const hostContext = getHostContext();
      const shouldLoadTenantSession =
        hostContext.kind !== 'tenant' ||
        !String(hostContext.tenantSlug || '').trim();

      if (shouldLoadTenantSession) {
        tenantSessionPromise = tenantSessionPromise || getTenantSession()
          .catch(() => null)
          .finally(() => {
            tenantSessionPromise = null;
          });

        const tenantSession = await tenantSessionPromise;
        if (tenantSession) {
          tenantAwareRental = {
            ...tenantAwareRental,
            tenant_id: tenantAwareRental.tenant_id || tenantSession.tenantId || tenantSession.tenant?.id || '',
            business_account_id:
              tenantAwareRental.business_account_id
              || tenantSession.businessAccountId
              || tenantSession.businessAccount?.id
              || '',
            tenant_slug:
              tenantAwareRental.tenant_slug
              || tenantSession.tenantSlug
              || tenantSession.tenant?.tenant_slug
              || '',
          };
        }
      } else if (hostContext.tenantSlug) {
        tenantAwareRental = {
          ...tenantAwareRental,
          tenant_slug: tenantAwareRental.tenant_slug || hostContext.tenantSlug,
        };
      }
    }

    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
      throw new Error('No active session for Telegram alert request');
    }

    const abortController = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timeoutId = abortController
      ? window.setTimeout(() => abortController.abort(new Error('Telegram alert request timed out')), TELEGRAM_ALERT_TIMEOUT_MS)
      : null;

    let response;
    try {
      response = await fetch('/api/telegram-alerts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        keepalive: true,
        signal: abortController?.signal,
        body: JSON.stringify({
          rental: {
            eventType,
            hostname: typeof window !== 'undefined' ? window.location.hostname : '',
            ...tenantAwareRental,
          },
        }),
      });
    } finally {
      if (timeoutId) {
        window.clearTimeout(timeoutId);
      }
    }

    if (!response.ok) {
      const responseText = await response.text();
      throw new Error(`Telegram alert request failed (${response.status}): ${responseText}`);
    }

    const payload = await response.json().catch(() => ({}));
    if (payload?.skipped) {
      throw new Error(String(payload?.reason || 'Telegram alert was skipped'));
    }
    if (payload?.success !== true) {
      throw new Error(String(payload?.error || 'Telegram alert did not complete successfully'));
    }

    return payload;
  } catch (error) {
    console.warn('Telegram rental alert failed (non-critical):', error);
    if (throwOnError) {
      throw error;
    }
    return false;
  } finally {
    inFlightTelegramAlerts.delete(requestKey);
  }
  })();

  inFlightTelegramAlerts.set(requestKey, requestPromise);
  return requestPromise;
}

export async function notifyNewRentalTelegramAlert(rental) {
  return notifyRentalTelegramEvent('rental_created', rental);
}

export async function sendTelegramTestAlert({
  scope = 'workspace',
  tenantName = '',
  actorName = '',
  tenantId = '',
  businessAccountId = '',
  tenantSlug = '',
  tenantBaseUrl = '',
  telegramConfigOverride = null,
} = {}) {
  const testNonce = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return notifyRentalTelegramEvent('telegram_test', {
    id: `telegram-test-${scope}`,
    tenantName,
    customer: actorName,
    testScope: scope,
    testNonce,
    tenant_id: tenantId,
    business_account_id: businessAccountId,
    tenant_slug: tenantSlug,
    tenant_base_url: tenantBaseUrl,
    telegram_config_override: telegramConfigOverride,
  }, { throwOnError: true });
}

export default {
  notifyRentalTelegramEvent,
  notifyNewRentalTelegramAlert,
  sendTelegramTestAlert,
};
