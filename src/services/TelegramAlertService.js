import { supabase } from './supabaseClient';

const inFlightTelegramAlerts = new Map();

const buildTelegramAlertRequestKey = (eventType, rental = {}) => {
  const normalizedEventType = String(eventType || '').trim().toLowerCase();
  const normalizedId = String(rental?.id || '').trim();
  const normalizedScope = String(rental?.testScope || '').trim().toLowerCase();
  const normalizedTenantId = String(rental?.tenant_id || '').trim();
  const normalizedBusinessAccountId = String(rental?.business_account_id || '').trim();

  return [
    normalizedEventType,
    normalizedId,
    normalizedScope,
    normalizedTenantId,
    normalizedBusinessAccountId,
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
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
      throw new Error('No active session for Telegram alert request');
    }

    const response = await fetch('/api/telegram-alerts', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      keepalive: true,
      body: JSON.stringify({
        rental: {
          eventType,
          hostname: typeof window !== 'undefined' ? window.location.hostname : '',
          ...rental,
        },
      }),
    });

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
  return notifyRentalTelegramEvent('telegram_test', {
    id: `telegram-test-${scope}`,
    tenantName,
    customer: actorName,
    testScope: scope,
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
