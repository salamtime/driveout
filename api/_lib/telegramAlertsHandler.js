import { authenticateRequest } from './auth.js';
import { insertTenantAuditLog } from './tenantAuditLog.js';
import { APP_USERS_TABLE, PLATFORM_TENANTS_TABLE, PLATFORM_TENANT_AUDIT_LOG_TABLE } from './supabase.js';

const DRIVEOUT_BASE_DOMAIN = 'driveout.io';
const RESERVED_SUBDOMAINS = new Set(['www', 'admin', 'app']);
const FIRST_PARTY_TENANT_SLUGS = new Set(['saharax']);
const TELEGRAM_EVENT_KEYS = [
  'rental_created',
  'rental_started',
  'rental_completed',
  'payment_received',
  'rental_overdue',
  'rental_cancelled',
  'deposit_returned',
];
const TELEGRAM_RUNTIME_EVENT_KEYS = [...TELEGRAM_EVENT_KEYS, 'telegram_test'];

const json = (res, status, body) => res.status(status).json(body);

const parseBody = (body) => {
  if (!body) return {};
  if (typeof body === 'string') {
    try {
      return JSON.parse(body);
    } catch {
      return {};
    }
  }
  return body;
};

const safeText = (value) => String(value ?? '').trim();

const normalizeHostname = (value = '') => {
  const trimmed = String(value || '').trim().toLowerCase();
  if (!trimmed) return '';

  try {
    return new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`).hostname.toLowerCase();
  } catch {
    return trimmed.split('/')[0].split(':')[0].toLowerCase();
  }
};

const normalizeUrl = (value = '') => {
  const trimmed = String(value || '').trim();
  if (!trimmed) return '';
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
};

const getUrlHostname = (value = '') => {
  try {
    return new URL(normalizeUrl(value)).hostname.toLowerCase();
  } catch {
    return '';
  }
};

const isLocalHostname = (value = '') => {
  const normalized = normalizeHostname(value);
  return normalized === 'localhost' || normalized === '127.0.0.1';
};

const getTenantSlugFromHostname = (hostname = '') => {
  const normalizedHostname = normalizeHostname(hostname);
  if (normalizedHostname === 'localhost' || normalizedHostname === '127.0.0.1') {
    return 'saharax';
  }
  if (!normalizedHostname.endsWith(`.${DRIVEOUT_BASE_DOMAIN}`)) return '';

  const slug = normalizedHostname.slice(0, -(`.${DRIVEOUT_BASE_DOMAIN}`.length));
  return slug && !RESERVED_SUBDOMAINS.has(slug) ? slug : '';
};

const formatDateTime = (value) => {
  const parsed = value ? new Date(value) : null;
  if (!(parsed instanceof Date) || Number.isNaN(parsed?.getTime?.())) {
    return String(value ?? 'Unknown');
  }

  return parsed.toLocaleString('en-GB', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const formatDateOnly = (value) => {
  const parsed = value ? new Date(value) : null;
  if (!(parsed instanceof Date) || Number.isNaN(parsed?.getTime?.())) {
    return '';
  }

  return parsed.toLocaleDateString('en-GB', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  });
};

const formatTimeOnly = (value) => {
  const parsed = value ? new Date(value) : null;
  if (!(parsed instanceof Date) || Number.isNaN(parsed?.getTime?.())) {
    return '';
  }

  return parsed.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
};

const formatDuration = (startValue, endValue) => {
  const start = startValue ? new Date(startValue) : null;
  const end = endValue ? new Date(endValue) : null;

  if (!(start instanceof Date) || !(end instanceof Date)) return '';
  if (Number.isNaN(start?.getTime?.()) || Number.isNaN(end?.getTime?.())) return '';

  const diffMinutes = Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000));
  if (!Number.isFinite(diffMinutes)) return '';
  if (diffMinutes <= 0) return '';

  const days = Math.floor(diffMinutes / 1440);
  const hours = Math.floor((diffMinutes % 1440) / 60);
  const minutes = diffMinutes % 60;
  const parts = [];

  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);

  return parts.join(' ');
};

const buildWindowLines = (startValue, endValue) => {
  const startDate = formatDateOnly(startValue);
  const endDate = formatDateOnly(endValue);
  const startTime = formatTimeOnly(startValue);
  const endTime = formatTimeOnly(endValue);
  const duration = formatDuration(startValue, endValue);
  const lines = [];

  if (startDate && endDate) {
    if (startDate === endDate) {
      lines.push(`${startDate} • ${startTime || '--:--'} → ${endTime || '--:--'}`);
    } else {
      lines.push(`${startDate} ${startTime || ''} → ${endDate} ${endTime || ''}`.trim());
    }
  } else {
    const fallback = [safeText(formatDateTime(startValue)), safeText(formatDateTime(endValue))]
      .filter(Boolean)
      .join(' → ');
    if (fallback) lines.push(fallback);
  }

  if (duration) {
    lines.push(`Duration: ${duration}`);
  }

  return lines;
};

const buildClosedAtLine = (value) => {
  const formatted = formatDateTime(value);
  if (!formatted || formatted === 'Unknown') return '';
  return `Closed at: ${formatted}`;
};

const buildOverdueAge = (endValue) => {
  const end = endValue ? new Date(endValue) : null;
  if (!(end instanceof Date) || Number.isNaN(end?.getTime?.())) return '';

  const diffMinutes = Math.max(0, Math.round((Date.now() - end.getTime()) / 60000));
  if (!Number.isFinite(diffMinutes) || diffMinutes <= 0) return '';

  if (diffMinutes < 60) return `${diffMinutes}m late`;
  const hours = Math.floor(diffMinutes / 60);
  const minutes = diffMinutes % 60;
  if (hours < 24) return minutes > 0 ? `${hours}h ${minutes}m late` : `${hours}h late`;
  const days = Math.floor(hours / 24);
  const remHours = hours % 24;
  return remHours > 0 ? `${days}d ${remHours}h late` : `${days}d late`;
};

const formatMoney = (value) => {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount)) return '0';
  return amount.toFixed(0);
};

const buildTelegramMessage = (eventType, data, rentalUrl, recipientLayout = 'owner') => {
  const vehicle = safeText(data.vehicle || 'Unknown vehicle');
  const customer = safeText(data.customer || 'Unknown customer');
  const paid = safeText(formatMoney(data.amountPaid));
  const remaining = safeText(formatMoney(data.remaining));
  const paymentReceivedNow = safeText(formatMoney(data.paymentReceivedNow));
  const discountApplied = safeText(formatMoney(data.companyDiscount));
  const total = safeText(formatMoney(data.total));
  const reference = safeText(data.reference || data.rental_reference || '');
  const rentalIdentityLine = reference ? `Ref: ${reference}` : '';
  const customerLine = customer && customer !== 'Unknown customer' ? customer : '';
  const windowLines = buildWindowLines(data.start, data.end);
  const closedAtLine = buildClosedAtLine(
    data.completed_at ||
    data.completedAt ||
    data.rental_completed_at ||
    data.closed_at
  );
  const linkLine = ['👉 Open rental', rentalUrl].join('\n');
  const isStaffLayout = recipientLayout === 'staff';

  switch (String(eventType || '').trim().toLowerCase()) {
    case 'rental_completed':
      return [
        '✅ Rental Completed',
        '',
        vehicle,
        ...(customerLine ? [customerLine] : []),
        ...windowLines,
        ...(closedAtLine ? [closedAtLine] : []),
        `Paid: ${paid} MAD`,
        ...(Number(data.remaining || 0) > 0 ? [`Due: ${remaining} MAD`] : []),
        ...(rentalIdentityLine ? [rentalIdentityLine] : []),
        '',
        linkLine,
      ].join('\n');
    case 'rental_started':
      return [
        '🟢 Rental Started',
        '',
        vehicle,
        ...(customerLine ? [customerLine] : []),
        ...windowLines,
        ...(rentalIdentityLine ? [rentalIdentityLine] : []),
        '',
        linkLine,
      ].join('\n');
    case 'payment_received':
      if (isStaffLayout) {
        return [
          '💵 Payment Received',
          '',
          vehicle,
          ...(customerLine ? [customerLine] : []),
          `+${paymentReceivedNow} MAD`,
          ...(safeText(formatMoney(data.remaining)) !== '0' ? [`Due: ${remaining} MAD`] : []),
          '',
          linkLine,
        ].join('\n');
      }
      return [
        '💵 Payment Received',
        '',
        vehicle,
        ...(customerLine ? [customerLine] : []),
        ...windowLines,
        `+${paymentReceivedNow} MAD`,
        ...(Number(data.companyDiscount || 0) > 0 ? [`Discount applied: ${discountApplied} MAD`] : []),
        `Due: ${remaining} MAD`,
        ...(rentalIdentityLine ? [rentalIdentityLine] : []),
        '',
        linkLine,
      ].join('\n');
    case 'rental_overdue':
      if (isStaffLayout) {
        return [
          '⏰ Rental Overdue',
          '',
          vehicle,
          ...(customerLine ? [customerLine] : []),
          ...(buildOverdueAge(data.end) ? [buildOverdueAge(data.end)] : []),
          '',
          linkLine,
        ].join('\n');
      }
      return [
        '⏰ Rental Overdue',
        '',
        vehicle,
        ...(customerLine ? [customerLine] : []),
        ...windowLines,
        ...(buildOverdueAge(data.end) ? [buildOverdueAge(data.end)] : []),
        ...(rentalIdentityLine ? [rentalIdentityLine] : []),
        '',
        linkLine,
      ].join('\n');
    case 'rental_cancelled':
      return [
        '🛑 Rental Cancelled',
        '',
        vehicle,
        ...(customerLine ? [customerLine] : []),
        ...windowLines,
        ...(safeText(data.cancellationReason) ? [`Reason: ${safeText(data.cancellationReason)}`] : []),
        ...(rentalIdentityLine ? [rentalIdentityLine] : []),
        '',
        linkLine,
      ].join('\n');
    case 'deposit_returned':
      return [
        '💳 Deposit Returned',
        '',
        vehicle,
        ...(customerLine ? [customerLine] : []),
        ...(safeText(formatMoney(data.depositReturnedAmount)) !== '0'
          ? [`Returned: ${safeText(formatMoney(data.depositReturnedAmount))} MAD`]
          : []),
        ...(safeText(formatMoney(data.depositDeductionAmount)) !== '0'
          ? [`Deducted: ${safeText(formatMoney(data.depositDeductionAmount))} MAD`]
          : []),
        ...(safeText(formatMoney(data.remaining)) !== '0'
          ? [`Remaining due: ${remaining} MAD`]
          : []),
        ...(rentalIdentityLine ? [rentalIdentityLine] : []),
        '',
        linkLine,
      ].join('\n');
    case 'telegram_test':
      return [
        '🧪 Telegram Test',
        '',
        safeText(data.tenantName || vehicle || 'Workspace test'),
        ...(safeText(data.testScope) === 'profile'
          ? ['Profile preference test']
          : ['Workspace connection test']),
        ...(customerLine ? [customerLine] : []),
        '',
        '✅ Telegram is connected',
        '',
        linkLine,
      ].join('\n');
    case 'rental_created':
    default:
      if (isStaffLayout) {
        return [
          '🚨 New Rental',
          '',
          vehicle,
          ...(customerLine ? [customerLine] : []),
          ...windowLines,
          '',
          linkLine,
        ].join('\n');
      }
      return [
        '🚨 New Rental',
        '',
        vehicle,
        ...(customerLine ? [customerLine] : []),
        ...windowLines,
        `${total} MAD`,
        ...(rentalIdentityLine ? [rentalIdentityLine] : []),
        '',
        linkLine,
      ].join('\n');
  }
};

const normalizeTelegramEventTypes = (value, defaultValue = false) => {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return TELEGRAM_EVENT_KEYS.reduce((acc, key) => {
    acc[key] = Object.prototype.hasOwnProperty.call(source, key)
      ? source[key] === true
      : defaultValue === true;
    return acc;
  }, {});
};

const toSafeAuditMetadata = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value;
};

const writeTelegramAuditLog = async ({
  adminClient,
  tenant,
  actor,
  action,
  metadata = {},
}) => {
  if (!adminClient || !tenant?.id || String(tenant.id).startsWith('first-party-') || !action) {
    return;
  }

  await insertTenantAuditLog({
    adminClient,
    businessAccountId: tenant.business_account_id || null,
    tenantId: tenant.id,
    performedBy: actor?.id || null,
    action,
    metadata: {
      source: 'telegram_alerts_api',
      actor_email: String(actor?.email || '').trim().toLowerCase() || null,
      ...toSafeAuditMetadata(metadata),
    },
  });
};

const getTelegramSettingsFromTenant = (tenant = {}) => {
  const tenantSettings = tenant?.metadata?.tenant_settings && typeof tenant.metadata.tenant_settings === 'object'
    ? tenant.metadata.tenant_settings
    : {};
  const normalizedBaseUrl = String(
    tenantSettings.telegram_base_url ||
    tenant.tenant_app_url ||
    process.env.APP_BASE_URL ||
    ''
  ).trim().replace(/\/$/, '');
  const chatIds = Array.isArray(tenantSettings.telegram_chat_ids)
    ? tenantSettings.telegram_chat_ids.map((value) => String(value || '').trim()).filter(Boolean)
    : String(tenantSettings.telegram_chat_ids || process.env.TELEGRAM_CHAT_IDS || '')
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean);

  return {
    enabled: Boolean(tenantSettings.telegram_enabled),
    botToken: String(tenantSettings.telegram_bot_token || process.env.TELEGRAM_BOT_TOKEN || '').trim(),
    chatIds,
    baseUrl: normalizedBaseUrl,
    overdueRepeatMinutes: Math.max(0, Number(tenantSettings.telegram_overdue_repeat_minutes || 0) || 0),
    eventTypes: normalizeTelegramEventTypes(tenantSettings.telegram_event_types, true),
  };
};

const getTelegramSettingsFromOverride = (value = {}) => {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const chatIds = Array.isArray(source.telegram_chat_ids)
    ? source.telegram_chat_ids.map((item) => String(item || '').trim()).filter(Boolean)
    : String(source.telegram_chat_ids || '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);

  return {
    enabled: Boolean(source.telegram_enabled),
    botToken: String(source.telegram_bot_token || '').trim(),
    chatIds,
    baseUrl: String(source.telegram_base_url || '').trim().replace(/\/$/, ''),
    overdueRepeatMinutes: Math.max(0, Number(source.telegram_overdue_repeat_minutes || 0) || 0),
    eventTypes: normalizeTelegramEventTypes(source.telegram_event_types, true),
  };
};

const getUserTelegramPreferences = (preferences = {}) => {
  const source = preferences && typeof preferences === 'object' && !Array.isArray(preferences)
    ? preferences.telegram_alerts
    : null;

  return {
    allowed: Boolean(source?.allowed),
    allowedEventTypes: normalizeTelegramEventTypes(source?.allowed_event_types, false),
    optedIn: Boolean(source?.opt_in),
    selectedEventTypes: normalizeTelegramEventTypes(source?.selected_event_types, false),
    personalChatIds: Array.isArray(source?.personal_chat_ids)
      ? source.personal_chat_ids.map((value) => String(value || '').trim()).filter(Boolean)
      : String(source?.personal_chat_ids || '')
          .split(',')
          .map((value) => value.trim())
          .filter(Boolean),
  };
};

const isUserSubscribedToEvent = (preferences, eventType) => {
  const normalizedEventType = String(eventType || '').trim().toLowerCase();
  const userPrefs = getUserTelegramPreferences(preferences);

  if (!userPrefs.allowed || !userPrefs.optedIn) {
    return false;
  }

  return userPrefs.allowedEventTypes[normalizedEventType] === true
    && userPrefs.selectedEventTypes[normalizedEventType] === true;
};

const resolveRequestedHostname = (req, payload = {}) =>
  normalizeHostname(
    payload.hostname ||
    req.headers['x-forwarded-host'] ||
    req.headers.host ||
    ''
  );

const normalizeTelegramBaseUrlForRuntime = ({
  baseUrl = '',
  tenant = null,
  requestedHostname = '',
} = {}) => {
  const normalizedConfiguredBaseUrl = String(baseUrl || '').trim().replace(/\/$/, '');
  const configuredHostname = getUrlHostname(normalizedConfiguredBaseUrl);
  const tenantAppUrl = normalizeUrl(tenant?.tenant_app_url || '');
  const tenantAppHostname = getUrlHostname(tenantAppUrl);
  const requestedIsLocal = isLocalHostname(requestedHostname);
  const configuredIsLocal = isLocalHostname(configuredHostname);
  const tenantAppIsLocal = isLocalHostname(tenantAppHostname);

  if (!requestedIsLocal && configuredIsLocal && tenantAppUrl && !tenantAppIsLocal) {
    return tenantAppUrl.replace(/\/$/, '');
  }

  if (!normalizedConfiguredBaseUrl && tenantAppUrl) {
    return tenantAppUrl.replace(/\/$/, '');
  }

  return normalizedConfiguredBaseUrl || tenantAppUrl.replace(/\/$/, '');
};

const resolveTenantByHostname = async (adminClient, hostname) => {
  const tenantSlug = getTenantSlugFromHostname(hostname);
  if (!tenantSlug) return null;

  const { data, error } = await adminClient
    .from(PLATFORM_TENANTS_TABLE)
    .select('id, business_account_id, tenant_name, tenant_slug, tenant_status, tenant_app_url, metadata')
    .eq('tenant_slug', tenantSlug)
    .maybeSingle();

  if (error) throw error;
  if (data) return data;

  if (FIRST_PARTY_TENANT_SLUGS.has(tenantSlug)) {
    return {
      id: 'first-party-saharax',
      business_account_id: null,
      tenant_name: 'SaharaX',
      tenant_slug: 'saharax',
      tenant_status: 'active',
      tenant_app_url: hostname === 'localhost' || hostname === '127.0.0.1'
        ? 'https://saharax.driveout.io'
        : `https://${hostname}`,
      metadata: {
        tenant_settings: {
          telegram_enabled: Boolean(String(process.env.TELEGRAM_BOT_TOKEN || '').trim() && String(process.env.TELEGRAM_CHAT_IDS || '').trim()),
          telegram_bot_token: String(process.env.TELEGRAM_BOT_TOKEN || '').trim(),
          telegram_chat_ids: String(process.env.TELEGRAM_CHAT_IDS || '').trim(),
          telegram_base_url: String(process.env.APP_BASE_URL || 'https://saharax.driveout.io').trim(),
          telegram_event_types: normalizeTelegramEventTypes({}, true),
        },
      },
    };
  }

  return null;
};

const resolveTenantByPayload = async (adminClient, payload = {}) => {
  const tenantId = safeText(payload?.tenant_id);
  const businessAccountId = safeText(payload?.business_account_id);
  const tenantSlug = safeText(payload?.tenant_slug).toLowerCase();

  if (tenantId) {
    const { data, error } = await adminClient
      .from(PLATFORM_TENANTS_TABLE)
      .select('id, business_account_id, tenant_name, tenant_slug, tenant_status, tenant_app_url, metadata')
      .eq('id', tenantId)
      .maybeSingle();

    if (error) throw error;
    if (data) return data;
  }

  if (businessAccountId) {
    const { data, error } = await adminClient
      .from(PLATFORM_TENANTS_TABLE)
      .select('id, business_account_id, tenant_name, tenant_slug, tenant_status, tenant_app_url, metadata')
      .eq('business_account_id', businessAccountId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    if (data) return data;
  }

  if (tenantSlug) {
    const { data, error } = await adminClient
      .from(PLATFORM_TENANTS_TABLE)
      .select('id, business_account_id, tenant_name, tenant_slug, tenant_status, tenant_app_url, metadata')
      .eq('tenant_slug', tenantSlug)
      .maybeSingle();

    if (error) throw error;
    if (data) return data;
  }

  return null;
};

const loadActorWorkspaceContext = async (adminClient, userId) => {
  const { data, error } = await adminClient
    .from(APP_USERS_TABLE)
    .select('id, role, primary_organization_id')
    .eq('id', userId)
    .maybeSingle();

  if (error) throw error;
  return data || null;
};

const loadActorTelegramProfile = async (adminClient, userId) => {
  if (!adminClient || !userId) return null;

  const { data, error } = await adminClient
    .from(APP_USERS_TABLE)
    .select('id, email, role, preferences')
    .eq('id', userId)
    .maybeSingle();

  if (error) throw error;
  return data || null;
};

const findEligibleTelegramUsers = async (adminClient, eventType, organizationId = null) => {
  let query = adminClient
    .from(APP_USERS_TABLE)
    .select('id, email, role, access_enabled, preferences, primary_organization_id')
    .eq('access_enabled', true);

  if (organizationId) {
    query = query.eq('primary_organization_id', organizationId);
  }

  const { data, error } = await query;

  if (error) throw error;

  return (data || []).filter((user) => {
    const role = String(user?.role || '').trim().toLowerCase();
    if (!['owner', 'admin', 'employee', 'guide'].includes(role)) {
      return false;
    }

    return isUserSubscribedToEvent(user?.preferences || {}, eventType);
  });
};

const buildTelegramRecipients = (config, eligibleUsers = []) => {
  const recipients = [];
  const seenByChatId = new Map();

  const pushRecipient = (chatId, type, role = null, user = null) => {
    const normalizedChatId = String(chatId || '').trim();
    if (!normalizedChatId) return;
    const nextRecipient = {
      chatId: normalizedChatId,
      type,
      role,
      userId: user?.id || null,
      email: user?.email || null,
      layout: ['owner', 'admin'].includes(String(role || '').trim().toLowerCase()) || type === 'workspace'
        ? 'owner'
        : 'staff',
    };

    if (seenByChatId.has(normalizedChatId)) {
      const existingIndex = seenByChatId.get(normalizedChatId);
      const existingRecipient = recipients[existingIndex];
      const shouldPreferNextRecipient =
        existingRecipient?.type !== 'workspace' && nextRecipient.type === 'workspace';

      if (shouldPreferNextRecipient) {
        recipients[existingIndex] = {
          ...existingRecipient,
          ...nextRecipient,
        };
      }
      return;
    }

    seenByChatId.set(normalizedChatId, recipients.length);
    recipients.push(nextRecipient);
  };

  (Array.isArray(config?.chatIds) ? config.chatIds : []).forEach((chatId) => {
    pushRecipient(chatId, 'workspace', null, null);
  });

  eligibleUsers.forEach((user) => {
    const prefs = getUserTelegramPreferences(user?.preferences || {});
    prefs.personalChatIds.forEach((chatId) => {
      pushRecipient(chatId, 'personal', String(user?.role || '').trim().toLowerCase(), user);
    });
  });

  return recipients;
};

const buildProfileTestRecipients = (userRecord = null) => {
  if (!userRecord) return [];

  const prefs = getUserTelegramPreferences(userRecord.preferences || {});
  const role = String(userRecord?.role || '').trim().toLowerCase() || null;
  const recipients = [];
  const seen = new Set();

  prefs.personalChatIds.forEach((chatId) => {
    const normalizedChatId = String(chatId || '').trim();
    if (!normalizedChatId || seen.has(normalizedChatId)) return;
    seen.add(normalizedChatId);
    recipients.push({
      chatId: normalizedChatId,
      type: 'personal',
      role,
      userId: userRecord?.id || null,
      email: userRecord?.email || null,
      layout: ['owner', 'admin'].includes(role) ? 'owner' : 'staff',
    });
  });

  return recipients;
};

const getLatestOverdueReminder = async (adminClient, tenantId, rentalId) => {
  if (!adminClient || !tenantId || !rentalId) return null;

  const { data, error } = await adminClient
    .from(PLATFORM_TENANT_AUDIT_LOG_TABLE)
    .select('created_at, action, metadata')
    .eq('tenant_id', tenantId)
    .in('action', ['telegram_alert_sent', 'telegram_alert_partial_failure', 'telegram_alert_failed'])
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) throw error;

  return (data || []).find((item) =>
    String(item?.metadata?.event_type || '').trim().toLowerCase() === 'rental_overdue' &&
    String(item?.metadata?.rental_id || '') === String(rentalId)
  ) || null;
};

const TELEGRAM_EVENT_DEDUPLICATION_WINDOWS_MS = {
  telegram_test: 30 * 1000,
  rental_created: 2 * 60 * 1000,
  rental_started: 2 * 60 * 1000,
  rental_completed: 2 * 60 * 1000,
  rental_cancelled: 2 * 60 * 1000,
  rental_overdue: 30 * 1000,
  payment_received: 30 * 1000,
  deposit_returned: 30 * 1000,
};

const buildTelegramEventDeduplicationKey = (eventType, payload = {}) => {
  const normalizedEventType = String(eventType || '').trim().toLowerCase();
  const rentalId = safeText(payload?.id);
  if (!normalizedEventType || !rentalId) return '';

  const parts = [normalizedEventType, rentalId];

  switch (normalizedEventType) {
    case 'rental_created':
    case 'rental_started':
    case 'rental_completed':
    case 'rental_cancelled':
    case 'rental_overdue':
      parts.push(
        safeText(payload?.reference || payload?.rental_reference),
        safeText(payload?.start),
        safeText(payload?.end),
        safeText(payload?.total),
        safeText(payload?.remaining),
        safeText(payload?.amountPaid),
      );
      break;
    case 'payment_received':
      parts.push(
        safeText(payload?.paymentReceivedNow),
        safeText(payload?.remaining),
        safeText(payload?.companyDiscount),
      );
      break;
    case 'deposit_returned':
      parts.push(
        safeText(payload?.depositReturnedAmount),
        safeText(payload?.depositDeductionAmount),
        safeText(payload?.remaining),
      );
      break;
    case 'telegram_test':
      parts.push(
        safeText(payload?.testScope),
        safeText(payload?.tenant_id),
        safeText(payload?.business_account_id),
        safeText(payload?.tenant_slug),
        safeText(payload?.customer),
      );
      break;
    default:
      parts.push(JSON.stringify(payload || {}));
      break;
  }

  return parts.join('|');
};

const getLatestMatchingTelegramAlert = async ({
  adminClient,
  tenantId,
  rentalId,
  eventType,
  dedupeKey,
}) => {
  if (!adminClient || !tenantId || !rentalId || !eventType || !dedupeKey) return null;

  const windowMs = TELEGRAM_EVENT_DEDUPLICATION_WINDOWS_MS[eventType] || 0;
  if (windowMs <= 0) return null;

  const since = new Date(Date.now() - windowMs).toISOString();
  const { data, error } = await adminClient
    .from(PLATFORM_TENANT_AUDIT_LOG_TABLE)
    .select('created_at, action, metadata')
    .eq('tenant_id', tenantId)
    .in('action', ['telegram_alert_sent', 'telegram_alert_partial_failure'])
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) throw error;

  return (data || []).find((item) =>
    String(item?.metadata?.event_type || '').trim().toLowerCase() === eventType &&
    String(item?.metadata?.rental_id || '') === String(rentalId) &&
    String(item?.metadata?.event_dedupe_key || '') === String(dedupeKey)
  ) || null;
};

async function sendTelegramRentalAlert({ config, data }) {
  const token = String(config?.botToken || '').trim();
  const baseUrl = String(config?.baseUrl || process.env.APP_BASE_URL || '').trim().replace(/\/$/, '');
  const recipients = Array.isArray(data?.recipients) ? data.recipients : [];
  const activeRecipients = recipients.length > 0
    ? recipients
    : (Array.isArray(config?.chatIds) ? config.chatIds.map((chatId) => ({ chatId, type: 'workspace', layout: 'owner' })) : []);

  if (!token || token === 'YOUR_NEW_TOKEN' || activeRecipients.length === 0) {
    return { skipped: true, reason: 'Telegram tenant configuration is incomplete' };
  }
  const rentalId = encodeURIComponent(String(data.id || ''));

  const buildRentalUrlForRecipient = (recipient) => {
    const normalizedRole = String(recipient?.role || '').trim().toLowerCase();
    const shouldUseAdminRoute =
      recipient?.type === 'workspace' ||
      ['owner', 'admin', 'employee', 'guide', 'business_owner'].includes(normalizedRole) ||
      recipient?.layout === 'staff';

    const pathPrefix = shouldUseAdminRoute ? '/admin/rentals/' : '/account/rentals/';
    return `${baseUrl}${pathPrefix}${rentalId}`;
  };

  const sendToChatWithRetry = async (recipient) => {
    const chatId = String(recipient?.chatId || '').trim();
    const message = buildTelegramMessage(
      data.eventType,
      data,
      buildRentalUrlForRecipient(recipient),
      recipient?.layout || 'owner'
    );
    let lastError = null;

    for (let attempt = 1; attempt <= 2; attempt += 1) {
      const abortController = new AbortController();
      const timeoutId = setTimeout(() => abortController.abort(), 10000);
      try {
        const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          signal: abortController.signal,
          body: JSON.stringify({
            chat_id: chatId,
            text: message,
            disable_web_page_preview: true,
          }),
        });
        clearTimeout(timeoutId);

        if (!response.ok) {
          const responseText = await response.text();
          throw new Error(`Telegram ${response.status}: ${responseText}`);
        }

        return {
          chatId,
          type: recipient?.type || 'workspace',
          role: recipient?.role || null,
          email: recipient?.email || null,
          attempt,
          ok: true,
          response: await response.json(),
        };
      } catch (error) {
        clearTimeout(timeoutId);
        lastError = error?.name === 'AbortError'
          ? new Error('Telegram request timed out after 10 seconds')
          : error;
      }
    }

    throw Object.assign(new Error(lastError?.message || 'Telegram send failed'), {
      chatId,
      type: recipient?.type || 'workspace',
      attempts: 2,
    });
  };

  const results = await Promise.allSettled(
    activeRecipients.map((recipient) => sendToChatWithRetry(recipient))
  );

  const failed = results.filter((result) => result.status === 'rejected');
  const deliveries = results.map((result, index) => {
    const recipient = activeRecipients[index] || {};
    const chatId = recipient.chatId;
    if (result.status === 'fulfilled') {
      return {
        chatId,
        type: recipient.type || 'workspace',
        role: recipient.role || null,
        email: recipient.email || null,
        ok: true,
        attempts: result.value?.attempt || 1,
      };
    }

      return {
        chatId,
        type: recipient.type || 'workspace',
        role: recipient.role || null,
        email: recipient.email || null,
        ok: false,
        attempts: result.reason?.attempts || 2,
        error: result.reason?.message || 'Telegram send failed',
    };
  });

  if (failed.length === results.length) {
    const error = failed[0].reason instanceof Error
      ? failed[0].reason
      : new Error('Telegram send failed for all chat IDs');
    error.deliveries = deliveries;
    throw error;
  }

  return {
    sent: results.length - failed.length,
    failed: failed.length,
    deliveries,
  };
}

export async function processTelegramRentalAlert({
  adminClient,
  actorUser = null,
  payload = {},
  hostname = '',
  actorWorkspaceContext = null,
}) {
  let tenant = null;
  let eventType = String(payload?.eventType || 'rental_created').trim().toLowerCase();
  const startedAt = Date.now();
  const dedupeKey = buildTelegramEventDeduplicationKey(eventType, payload);

  try {
    const isTestEvent = eventType === 'telegram_test';

    if (!payload?.id && !isTestEvent) {
      return { status: 400, body: { error: 'Rental id is required' } };
    }

    if (!TELEGRAM_RUNTIME_EVENT_KEYS.includes(eventType)) {
      return { status: 400, body: { error: 'Unsupported Telegram rental event' } };
    }

    tenant = await resolveTenantByPayload(adminClient, payload);
    if (!tenant) {
      tenant = await resolveTenantByHostname(adminClient, hostname);
    }
    const workspaceContext = actorWorkspaceContext || await loadActorWorkspaceContext(adminClient, actorUser?.id);

    if (!tenant) {
      await writeTelegramAuditLog({
        adminClient,
        tenant,
        actor: actorUser,
        action: 'telegram_alert_skipped',
        metadata: {
          event_type: eventType,
          reason: 'tenant_unresolved',
          rental_id: payload.id || null,
          rental_reference: payload.reference || payload.rental_reference || null,
          hostname,
        },
      });
      return { status: 200, body: { success: true, skipped: true, reason: 'Tenant could not be resolved for Telegram delivery' } };
    }

    const telegramConfig = isTestEvent && payload?.telegram_config_override
      ? getTelegramSettingsFromOverride(payload.telegram_config_override)
      : getTelegramSettingsFromTenant(tenant);
    telegramConfig.baseUrl = normalizeTelegramBaseUrlForRuntime({
      baseUrl: telegramConfig.baseUrl,
      tenant,
      requestedHostname: hostname,
    });
    if (!telegramConfig.enabled) {
      await writeTelegramAuditLog({
        adminClient,
        tenant,
        actor: actorUser,
        action: 'telegram_alert_skipped',
        metadata: {
          event_type: eventType,
          reason: 'tenant_disabled',
          rental_id: payload.id || null,
          rental_reference: payload.reference || payload.rental_reference || null,
        },
      });
      return { status: 200, body: { success: true, skipped: true, reason: 'Tenant Telegram alerts are disabled' } };
    }

    if (!isTestEvent && telegramConfig.eventTypes[eventType] !== true) {
      await writeTelegramAuditLog({
        adminClient,
        tenant,
        actor: actorUser,
        action: 'telegram_alert_skipped',
        metadata: {
          event_type: eventType,
          reason: 'event_disabled',
          rental_id: payload.id || null,
          rental_reference: payload.reference || payload.rental_reference || null,
        },
      });
      return { status: 200, body: { success: true, skipped: true, reason: `Tenant Telegram event ${eventType} is disabled` } };
    }

    const isProfileTestEvent = isTestEvent && String(payload?.testScope || '').trim().toLowerCase() === 'profile';
    const actorTelegramProfile = isProfileTestEvent
      ? await loadActorTelegramProfile(adminClient, actorUser?.id)
      : null;

    const eligibleUsers = isProfileTestEvent
      ? []
      : await findEligibleTelegramUsers(
          adminClient,
          isTestEvent ? 'rental_created' : eventType,
          workspaceContext?.primary_organization_id || null
        );

    const recipients = isProfileTestEvent
      ? buildProfileTestRecipients(actorTelegramProfile)
      : buildTelegramRecipients(telegramConfig, eligibleUsers);
    if (recipients.length === 0) {
      await writeTelegramAuditLog({
        adminClient,
        tenant,
        actor: actorUser,
        action: 'telegram_alert_skipped',
        metadata: {
          event_type: eventType,
          reason: 'no_chat_recipients',
          rental_id: payload.id || null,
          rental_reference: payload.reference || payload.rental_reference || null,
          workspace_chat_count: isProfileTestEvent ? 0 : (Array.isArray(telegramConfig.chatIds) ? telegramConfig.chatIds.length : 0),
          eligible_user_count: eligibleUsers.length,
        },
      });
      return { status: 200, body: { success: true, skipped: true, reason: 'No Telegram chat recipients configured' } };
    }

    if (eventType === 'rental_overdue' && telegramConfig.overdueRepeatMinutes > 0) {
      const latestReminder = await getLatestOverdueReminder(adminClient, tenant.id, payload.id);
      if (latestReminder?.created_at) {
        const elapsedMinutes = Math.max(0, Math.floor((Date.now() - new Date(latestReminder.created_at).getTime()) / 60000));
        if (elapsedMinutes < telegramConfig.overdueRepeatMinutes) {
          await writeTelegramAuditLog({
            adminClient,
            tenant,
            actor: actorUser,
            action: 'telegram_alert_skipped',
            metadata: {
              event_type: eventType,
              reason: 'overdue_repeat_window_active',
              rental_id: payload.id || null,
              rental_reference: payload.reference || payload.rental_reference || null,
              repeat_minutes: telegramConfig.overdueRepeatMinutes,
              elapsed_minutes: elapsedMinutes,
            },
          });
          return { status: 200, body: { success: true, skipped: true, reason: 'Overdue reminder interval has not elapsed yet' } };
        }
      }
    }

    if (dedupeKey) {
      const latestMatchingAlert = await getLatestMatchingTelegramAlert({
        adminClient,
        tenantId: tenant.id,
        rentalId: payload.id,
        eventType,
        dedupeKey,
      });

      if (latestMatchingAlert?.created_at) {
        await writeTelegramAuditLog({
          adminClient,
          tenant,
          actor: actorUser,
          action: 'telegram_alert_skipped',
          metadata: {
            event_type: eventType,
            reason: 'duplicate_event_window_active',
            rental_id: payload.id || null,
            rental_reference: payload.reference || payload.rental_reference || null,
            event_dedupe_key: dedupeKey,
            previous_sent_at: latestMatchingAlert.created_at,
          },
        });
        return {
          status: 200,
          body: {
            success: true,
            skipped: true,
            reason: 'Duplicate Telegram alert was suppressed',
          },
        };
      }
    }

    const result = await sendTelegramRentalAlert({
      config: telegramConfig,
      data: {
        ...payload,
        eventType,
        tenantName: tenant.tenant_name || tenant.tenant_slug || 'Tenant',
        recipients,
      },
    });

    await writeTelegramAuditLog({
      adminClient,
      tenant,
      actor: actorUser,
      action: result.failed > 0 ? 'telegram_alert_partial_failure' : 'telegram_alert_sent',
      metadata: {
        event_type: eventType,
        rental_id: payload.id || null,
        rental_reference: payload.reference || payload.rental_reference || null,
        event_dedupe_key: dedupeKey || null,
        eligible_user_count: eligibleUsers.length,
        sent_count: result.sent || 0,
        failed_count: result.failed || 0,
        duration_ms: Date.now() - startedAt,
        deliveries: Array.isArray(result.deliveries) ? result.deliveries : [],
      },
    });

    return {
      status: 200,
      body: {
        success: true,
        tenant_slug: tenant.tenant_slug || null,
        eligible_user_count: eligibleUsers.length,
        ...result,
      },
    };
  } catch (error) {
    console.error('❌ Telegram rental alert failed:', error);
    await writeTelegramAuditLog({
      adminClient,
      tenant,
      actor: actorUser,
      action: 'telegram_alert_failed',
      metadata: {
        event_type: eventType,
        rental_id: payload?.id || null,
        rental_reference: payload?.reference || payload?.rental_reference || null,
        event_dedupe_key: dedupeKey || null,
        hostname,
        duration_ms: Date.now() - startedAt,
        error: error?.message || 'Failed to send Telegram rental alert',
        deliveries: Array.isArray(error?.deliveries) ? error.deliveries : [],
      },
    });
    return {
      status: 500,
      body: {
        error: error?.message || 'Failed to send Telegram rental alert',
      },
    };
  }
}

export async function handleTelegramAlertsRequest(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Allow', 'POST, OPTIONS');
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return json(res, 405, { error: 'Method not allowed' });
  }

  const auth = await authenticateRequest(req);
  if (auth.error) {
    return json(res, auth.error.status, auth.error.body);
  }

  const body = parseBody(req.body);
  const payload = body?.rental || body || {};
  const hostname = resolveRequestedHostname(req, payload);
  const actorWorkspaceContext = await loadActorWorkspaceContext(auth.adminClient, auth.user?.id);
  const result = await processTelegramRentalAlert({
    adminClient: auth.adminClient,
    actorUser: auth.user,
    payload,
    hostname,
    actorWorkspaceContext,
  });
  return json(res, result.status, result.body);
}
