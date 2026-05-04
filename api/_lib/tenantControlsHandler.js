import { requirePlatformOwnerOrAdmin } from './auth.js';
import {
  PLATFORM_BUSINESS_SUBSCRIPTIONS_TABLE,
  PLATFORM_TENANTS_TABLE,
} from './supabase.js';
import { insertTenantAuditLog } from './tenantAuditLog.js';
import { TENANT_FEATURE_KEYS, TENANT_PLAN_ORDER } from '../../src/config/tenantPlans.js';

const json = (res, status, body) => res.status(status).json(body);

const sanitizePlanLimits = (limits = {}) => {
  const source = limits && typeof limits === 'object' ? limits : {};
  const numericKeys = ['vehicles', 'staff', 'listings', 'storage_gb'];
  return numericKeys.reduce((acc, key) => {
    const value = Number(source[key]);
    if (Number.isFinite(value) && value >= 0) acc[key] = value;
    return acc;
  }, {});
};

const sanitizeFeatureAccess = (features = {}) => {
  const source = features && typeof features === 'object' ? features : {};
  return TENANT_FEATURE_KEYS.reduce((acc, key) => {
    if (typeof source[key] === 'boolean') acc[key] = source[key];
    return acc;
  }, {});
};

const sanitizeTenantSettings = (settings = {}) => {
  const source = settings && typeof settings === 'object' ? settings : {};
  const normalized = {};

  const stringFields = [
    'brand_name',
    'public_display_name',
    'legal_business_name',
    'support_email',
    'custom_domain',
    'company_phone',
    'company_address',
    'company_website',
    'logo_url',
    'stamp_url',
    'currency',
    'timezone',
    'country',
  ];

  stringFields.forEach((key) => {
    if (source[key] == null) return;
    normalized[key] = String(source[key]).trim();
  });

  const nextLanguage = String(source.default_language || '').trim().toLowerCase();
  if (['en', 'fr', 'ar'].includes(nextLanguage)) {
    normalized.default_language = nextLanguage;
  }

  if (typeof source.telegram_enabled === 'boolean') {
    normalized.telegram_enabled = source.telegram_enabled;
  }

  ['telegram_bot_token', 'telegram_chat_ids', 'telegram_base_url'].forEach((key) => {
    if (source[key] == null) return;
    normalized[key] = String(source[key]).trim();
  });

  const overdueRepeatMinutes = Number(source.telegram_overdue_repeat_minutes);
  if (Number.isFinite(overdueRepeatMinutes) && overdueRepeatMinutes >= 0) {
    normalized.telegram_overdue_repeat_minutes = overdueRepeatMinutes;
  }

  if (source.telegram_event_types && typeof source.telegram_event_types === 'object') {
    const allowedTelegramEvents = [
      'rental_created',
      'rental_started',
      'rental_completed',
      'payment_received',
      'rental_overdue',
      'rental_cancelled',
      'deposit_returned',
    ];

    normalized.telegram_event_types = allowedTelegramEvents.reduce((acc, key) => {
      if (typeof source.telegram_event_types[key] === 'boolean') {
        acc[key] = source.telegram_event_types[key];
      }
      return acc;
    }, {});
  }

  return normalized;
};

const sanitizeBillingEngine = (billingEngine = {}) => {
  const source = billingEngine && typeof billingEngine === 'object' ? billingEngine : {};
  const normalized = {};

  const billingCycle = String(source.billing_cycle || '').trim().toLowerCase();
  if (['monthly', 'quarterly', 'yearly', 'custom'].includes(billingCycle)) {
    normalized.billing_cycle = billingCycle;
  }

  const invoicingMode = String(source.invoicing_mode || '').trim().toLowerCase();
  if (['automatic', 'manual', 'invoice_only'].includes(invoicingMode)) {
    normalized.invoicing_mode = invoicingMode;
  }

  ['trial_ends_at', 'renews_at'].forEach((key) => {
    const value = String(source[key] || '').trim();
    if (value) normalized[key] = value;
  });

  if (source.admin_note != null) {
    normalized.admin_note = String(source.admin_note).trim();
  }

  return normalized;
};

const sanitizeCommercialSettings = (settings = {}) => {
  const source = settings && typeof settings === 'object' ? settings : {};
  const normalized = {};
  const allowedFeatureKeys = TENANT_FEATURE_KEYS;
  const allowedSources = ['included', 'add_on', 'plan_upgrade', 'custom'];

  if (Array.isArray(source.enabled_addons)) {
    normalized.enabled_addons = source.enabled_addons
      .map((item) => String(item || '').trim())
      .filter((item) => allowedFeatureKeys.includes(item));
  }

  if (source.feature_sources && typeof source.feature_sources === 'object') {
    normalized.feature_sources = Object.entries(source.feature_sources).reduce((acc, [key, value]) => {
      const normalizedKey = String(key || '').trim();
      const normalizedValue = String(value || '').trim().toLowerCase();
      if (allowedFeatureKeys.includes(normalizedKey) && allowedSources.includes(normalizedValue)) {
        acc[normalizedKey] = normalizedValue;
      }
      return acc;
    }, {});
  }

  if (source.admin_note != null) {
    normalized.admin_note = String(source.admin_note).trim();
  }

  return normalized;
};

const diffRecordKeys = (previous = {}, next = {}) => {
  const previousSource = previous && typeof previous === 'object' ? previous : {};
  const nextSource = next && typeof next === 'object' ? next : {};
  const keys = new Set([...Object.keys(previousSource), ...Object.keys(nextSource)]);

  return [...keys].filter((key) => JSON.stringify(previousSource[key]) !== JSON.stringify(nextSource[key]));
};

export default async function tenantControlsHandler(req, res) {
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return json(res, 405, { error: 'Method not allowed' });
  }

  const auth = await requirePlatformOwnerOrAdmin(req, 'Workspaces');
  if (auth.error) {
    return json(res, auth.error.status, auth.error.body);
  }

  const { adminClient, user } = auth;
  const businessAccountId = String(req.body?.business_account_id || '').trim();
  const tenantId = String(req.body?.tenant_id || '').trim();

  if (!businessAccountId || !tenantId) {
    return json(res, 400, { error: 'business_account_id and tenant_id are required' });
  }

  const subscriptionPatch = req.body?.subscription_patch && typeof req.body.subscription_patch === 'object'
    ? req.body.subscription_patch
    : {};
  const tenantPatch = req.body?.tenant_patch && typeof req.body.tenant_patch === 'object'
    ? req.body.tenant_patch
    : {};

  const nextPlanType = String(subscriptionPatch.plan_type || '').trim().toLowerCase();
  const nextSubscriptionStatus = String(subscriptionPatch.subscription_status || '').trim().toLowerCase();
  const nextBillingStatus = String(subscriptionPatch.billing_status || '').trim().toLowerCase();
  const planLimits = sanitizePlanLimits(subscriptionPatch.plan_limits);
  const billingEngine = sanitizeBillingEngine(subscriptionPatch.billing_engine);
  const featureAccess = sanitizeFeatureAccess(tenantPatch.feature_access);
  const tenantSettings = sanitizeTenantSettings(tenantPatch.settings);
  const commercialSettings = sanitizeCommercialSettings(tenantPatch.commercial_settings);

  try {
    const { data: existingSubscription, error: subscriptionLookupError } = await adminClient
      .from(PLATFORM_BUSINESS_SUBSCRIPTIONS_TABLE)
      .select('*')
      .eq('business_account_id', businessAccountId)
      .maybeSingle();

    if (subscriptionLookupError) throw subscriptionLookupError;

    const { data: existingTenant, error: tenantLookupError } = await adminClient
      .from(PLATFORM_TENANTS_TABLE)
      .select('*')
      .eq('id', tenantId)
      .eq('business_account_id', businessAccountId)
      .maybeSingle();

    if (tenantLookupError) throw tenantLookupError;
    if (!existingTenant) {
      return json(res, 404, { error: 'Tenant not found' });
    }

    const subscriptionPayload = {
      business_account_id: businessAccountId,
      plan_type: TENANT_PLAN_ORDER.includes(nextPlanType)
        ? nextPlanType
        : (existingSubscription?.plan_type || 'starter'),
      subscription_status: ['trial', 'active', 'expired', 'cancelled', 'suspended'].includes(nextSubscriptionStatus)
        ? nextSubscriptionStatus
        : (existingSubscription?.subscription_status || 'trial'),
      billing_status: ['none', 'active', 'failed'].includes(nextBillingStatus)
        ? nextBillingStatus
        : (existingSubscription?.billing_status || 'none'),
      plan_limits: {
        ...((existingSubscription?.plan_limits && typeof existingSubscription.plan_limits === 'object')
          ? existingSubscription.plan_limits
          : {}),
        ...planLimits,
      },
      metadata: {
        ...((existingSubscription?.metadata && typeof existingSubscription.metadata === 'object')
          ? existingSubscription.metadata
          : {}),
        billing_engine: {
          ...(((existingSubscription?.metadata?.billing_engine) && typeof existingSubscription.metadata.billing_engine === 'object')
            ? existingSubscription.metadata.billing_engine
            : {}),
          ...billingEngine,
        },
        controls_updated_at: new Date().toISOString(),
      },
    };

    const tenantPayload = {
      metadata: {
        ...((existingTenant?.metadata && typeof existingTenant.metadata === 'object')
          ? existingTenant.metadata
          : {}),
        feature_access: {
          ...(((existingTenant?.metadata?.feature_access) && typeof existingTenant.metadata.feature_access === 'object')
            ? existingTenant.metadata.feature_access
            : {}),
          ...featureAccess,
        },
        tenant_settings: {
          ...(((existingTenant?.metadata?.tenant_settings) && typeof existingTenant.metadata.tenant_settings === 'object')
            ? existingTenant.metadata.tenant_settings
            : {}),
          ...tenantSettings,
        },
        commercial_settings: {
          ...(((existingTenant?.metadata?.commercial_settings) && typeof existingTenant.metadata.commercial_settings === 'object')
            ? existingTenant.metadata.commercial_settings
            : {}),
          ...commercialSettings,
        },
        controls_updated_at: new Date().toISOString(),
      },
    };

    const [{ error: subscriptionSaveError }, { error: tenantSaveError }] = await Promise.all([
      adminClient
        .from(PLATFORM_BUSINESS_SUBSCRIPTIONS_TABLE)
        .upsert(subscriptionPayload, { onConflict: 'business_account_id' }),
      adminClient
        .from(PLATFORM_TENANTS_TABLE)
        .update(tenantPayload)
        .eq('id', tenantId),
    ]);

    if (subscriptionSaveError) throw subscriptionSaveError;
    if (tenantSaveError) throw tenantSaveError;

    const changedPlanLimits = diffRecordKeys(existingSubscription?.plan_limits || {}, subscriptionPayload.plan_limits || {});
    const changedBillingEngine = diffRecordKeys(existingSubscription?.metadata?.billing_engine || {}, subscriptionPayload.metadata?.billing_engine || {});
    const changedFeatureAccess = diffRecordKeys(existingTenant?.metadata?.feature_access || {}, tenantPayload.metadata?.feature_access || {});
    const changedSettings = diffRecordKeys(existingTenant?.metadata?.tenant_settings || {}, tenantPayload.metadata?.tenant_settings || {});
    const changedCommercialSettings = diffRecordKeys(existingTenant?.metadata?.commercial_settings || {}, tenantPayload.metadata?.commercial_settings || {});
    const changedCoreControls = [];

    if ((existingSubscription?.plan_type || 'starter') !== subscriptionPayload.plan_type) changedCoreControls.push('plan_type');
    if ((existingSubscription?.subscription_status || 'trial') !== subscriptionPayload.subscription_status) changedCoreControls.push('subscription_status');
    if ((existingSubscription?.billing_status || 'none') !== subscriptionPayload.billing_status) changedCoreControls.push('billing_status');

    await insertTenantAuditLog({
      adminClient,
      businessAccountId,
      tenantId,
      performedBy: user?.id || null,
      action: 'tenant_controls_updated',
      metadata: {
        source: 'tenant_controls',
        performed_by_email: String(user?.email || '').trim().toLowerCase() || null,
        changed_fields: {
          core_controls: changedCoreControls,
          plan_limits: changedPlanLimits,
          billing_engine: changedBillingEngine,
          feature_access: changedFeatureAccess,
          tenant_settings: changedSettings,
          commercial_settings: changedCommercialSettings,
        },
        next_state: {
          plan_type: subscriptionPayload.plan_type,
          subscription_status: subscriptionPayload.subscription_status,
          billing_status: subscriptionPayload.billing_status,
          plan_limits: subscriptionPayload.plan_limits,
          billing_engine: subscriptionPayload.metadata?.billing_engine || {},
          feature_access: tenantPayload.metadata?.feature_access || {},
          tenant_settings: tenantPayload.metadata?.tenant_settings || {},
          commercial_settings: tenantPayload.metadata?.commercial_settings || {},
        },
      },
    });

    return json(res, 200, {
      ok: true,
      subscription: subscriptionPayload,
      tenant_metadata: tenantPayload.metadata,
    });
  } catch (error) {
    return json(res, 500, { error: error.message || 'Unable to update tenant controls' });
  }
}
