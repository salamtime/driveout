import { APP_USERS_TABLE, createSupabaseClients } from './_lib/supabase.js';
import { authenticateRequest, requireOwnerOrAdmin } from './_lib/auth.js';
import {
  EMAIL_SENDERS,
  buildAnnouncementEmail,
  buildPasswordResetEmail,
  buildRentalDocumentsEmail,
  sendResendEmail,
} from './_lib/email.js';

const SETTINGS_TABLE = 'saharax_0u4w4d_settings';
const SETTINGS_ROW_ID = 1;
const APP_SETTINGS_TABLE = 'app_settings';
const OPTIONAL_SETTINGS_COLUMNS = new Set([
  'auto_send_contract_email_after_creation',
  'rental_details_default_view',
  'tenant_deletion_retention_days',
]);

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
  return typeof body === 'object' ? body : {};
};

const getAction = (req) => String(req.query?.action || parseBody(req.body)?.action || '').trim().toLowerCase();
const normalizeEmail = (value) => String(value || '').trim().toLowerCase();

const handleGeminiProxy = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    json(res, 405, { error: 'Method not allowed' });
    return;
  }

  const geminiApiKey = String(process.env.GEMINI_API_KEY || '').trim();
  if (!geminiApiKey) {
    json(res, 500, { error: 'GEMINI_API_KEY is not configured' });
    return;
  }

  try {
    const body = parseBody(req.body);
    const {
      action = 'generateContent',
      model = 'gemini-2.5-flash',
      contents,
      generationConfig,
      safetySettings,
    } = body;

    const endpoint = action === 'listModels'
      ? `https://generativelanguage.googleapis.com/v1beta/models?key=${geminiApiKey}`
      : `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiApiKey}`;

    const upstreamResponse = await fetch(endpoint, {
      method: action === 'listModels' ? 'GET' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      ...(action === 'listModels'
        ? {}
        : {
            body: JSON.stringify({
              contents,
              generationConfig,
              safetySettings,
            }),
          }),
    });

    const responseText = await upstreamResponse.text();
    res.status(upstreamResponse.status);
    res.setHeader('Content-Type', 'application/json');
    res.end(responseText);
  } catch (error) {
    json(res, 500, { error: error.message || 'Gemini proxy failed' });
  }
};

const getDefaultSettings = () => ({
  companyName: '',
  companyEmail: '',
  companyPhone: '',
  companyAddress: '',
  companyWebsite: '',
  timezone: 'Africa/Casablanca',
  language: 'en',
  currency: 'MAD',
  operatingHours: { start: '08:00', end: '18:00' },
  operatingDays: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'],
  defaultRentalDuration: 4,
  minRentalDuration: 1,
  maxRentalDuration: 24,
  maintenanceMode: false,
  onlineBooking: true,
  realTimeTracking: true,
  baseHourlyRate: 50,
  dailyRate: 300,
  weeklyRate: 1800,
  depositPercentage: 25,
  defaultRate1h: 50,
  defaultRate2h: 90,
  extraPassengerFee: 15,
  pickupTransportFee: 0,
  dropoffTransportFee: 0,
  tax_enabled: false,
  tax_percentage: 10,
  apply_to_rentals: true,
  apply_to_tours: true,
  bookingReminderHours: 24,
  returnReminderHours: 2,
  rentalGracePeriodMinutes: 60,
  rentalSoftLockMinutes: 45,
  extraHourThresholdMinutes: 25,
  whatsappEnabled: true,
  emailNotifications: true,
  smsNotifications: false,
  pushNotifications: true,
  notifyOnOverdue: true,
  notifyOnMaintenance: true,
  receiptFooter: 'Thank you for choosing our fleet.',
  invoicePrefix: 'INV',
  contractFooter: 'Drive safely and report any issue immediately.',
  brandPrimaryColor: '#2563eb',
  logoUrl: '',
  stampUrl: '',
  showCompanyWebsiteOnPrint: true,
  showCompanyPhoneOnPrint: true,
  mapProvider: 'mapbox',
  mapboxPublicToken: '',
  ocrProvider: 'gemini',
  geminiProxyPath: '/api/system-settings?action=gemini-proxy',
  whatsappDefaultCountryCode: '+212',
  storageBucket: 'rental-documents',
  requireTwoFactorForAdmins: false,
  sessionTimeoutMinutes: 60,
  allowEmployeePackageEdits: false,
  allowEmployeeSettingsView: true,
  writeAuditLogs: true,
  allowLiveTrackingRetry: true,
  autoSendContractEmailAfterCreation: false,
  tourDepartureBufferMinutes: 15,
  tourAutoReceiptRequired: true,
  tourDefaultLicensePolicy: 'route_based',
  tourGuideTrackingRequired: true,
  messagingPhotoSharingEnabled: true,
  messagingMaxPhotosPerMessage: 3,
  messagingPhotoRetentionDays: 7,
  messagingDraftRetentionHours: 24,
  messagingAllowCameraCapture: true,
  rentalDetailsDefaultView: 'standard',
  tenantDeletionRetentionDays: 90,
  updatedAt: new Date().toISOString(),
});

const normalizeSettings = (value = {}) => {
  const defaults = getDefaultSettings();
  const merged = { ...defaults, ...(value || {}) };
  merged.logoUrl = String(merged.logoUrl || '');
  merged.stampUrl = String(merged.stampUrl || '');

  merged.operatingHours = {
    start: String(merged.operatingHours?.start || defaults.operatingHours.start),
    end: String(merged.operatingHours?.end || defaults.operatingHours.end),
  };
  merged.operatingDays = Array.isArray(merged.operatingDays)
    ? merged.operatingDays.map((day) => String(day).toLowerCase())
    : defaults.operatingDays;

  [
    'defaultRentalDuration',
    'minRentalDuration',
    'maxRentalDuration',
    'baseHourlyRate',
    'dailyRate',
    'weeklyRate',
    'depositPercentage',
    'defaultRate1h',
    'defaultRate2h',
    'extraPassengerFee',
    'pickupTransportFee',
    'dropoffTransportFee',
    'tax_percentage',
    'bookingReminderHours',
    'returnReminderHours',
    'rentalGracePeriodMinutes',
    'rentalSoftLockMinutes',
    'extraHourThresholdMinutes',
    'sessionTimeoutMinutes',
    'tourDepartureBufferMinutes',
    'messagingMaxPhotosPerMessage',
    'messagingPhotoRetentionDays',
    'messagingDraftRetentionHours',
  ].forEach((key) => {
    merged[key] = Number(merged[key] ?? defaults[key]) || 0;
  });

  [
    'maintenanceMode',
    'onlineBooking',
    'realTimeTracking',
    'tax_enabled',
    'apply_to_rentals',
    'apply_to_tours',
    'whatsappEnabled',
    'emailNotifications',
    'smsNotifications',
    'pushNotifications',
    'notifyOnOverdue',
    'notifyOnMaintenance',
    'showCompanyWebsiteOnPrint',
    'showCompanyPhoneOnPrint',
    'requireTwoFactorForAdmins',
    'allowEmployeePackageEdits',
    'allowEmployeeSettingsView',
    'writeAuditLogs',
    'allowLiveTrackingRetry',
    'autoSendContractEmailAfterCreation',
    'tourAutoReceiptRequired',
    'tourGuideTrackingRequired',
    'messagingPhotoSharingEnabled',
    'messagingAllowCameraCapture',
  ].forEach((key) => {
    merged[key] = Boolean(merged[key]);
  });

  merged.messagingMaxPhotosPerMessage = Math.max(1, Math.min(10, merged.messagingMaxPhotosPerMessage || defaults.messagingMaxPhotosPerMessage));
  merged.messagingPhotoRetentionDays = Math.max(1, Math.min(30, merged.messagingPhotoRetentionDays || defaults.messagingPhotoRetentionDays));
  merged.messagingDraftRetentionHours = Math.max(1, Math.min(168, merged.messagingDraftRetentionHours || defaults.messagingDraftRetentionHours));
  merged.tenantDeletionRetentionDays = Math.max(1, Math.min(365, Number(merged.tenantDeletionRetentionDays ?? defaults.tenantDeletionRetentionDays) || defaults.tenantDeletionRetentionDays));
  merged.rentalDetailsDefaultView =
    String(merged.rentalDetailsDefaultView || '').toLowerCase() === 'light'
      ? 'light'
      : 'standard';

  merged.updatedAt = new Date().toISOString();
  return merged;
};

const isMissingTableError = (error) => {
  const message = String(error?.message || error?.details || '').toLowerCase();
  const code = String(error?.code || '').toLowerCase();
  return (
    code === '42p01' ||
    code === 'pgrst205' ||
    message.includes('relation') && message.includes('does not exist') ||
    message.includes('could not find the table') ||
    message.includes('not found')
  );
};

const toTableRow = (settings = {}) => {
  const normalized = normalizeSettings(settings);
  return {
    id: SETTINGS_ROW_ID,
    company_name: normalized.companyName,
    company_email: normalized.companyEmail,
    company_phone: normalized.companyPhone,
    company_address: normalized.companyAddress,
    company_website: normalized.companyWebsite,
    timezone: normalized.timezone,
    language: normalized.language,
    currency: normalized.currency,
    operating_hours: normalized.operatingHours,
    operating_days: normalized.operatingDays,
    default_rental_duration: normalized.defaultRentalDuration,
    min_rental_duration: normalized.minRentalDuration,
    max_rental_duration: normalized.maxRentalDuration,
    maintenance_mode: normalized.maintenanceMode,
    online_booking: normalized.onlineBooking,
    real_time_tracking: normalized.realTimeTracking,
    base_hourly_rate: normalized.baseHourlyRate,
    daily_rate: normalized.dailyRate,
    weekly_rate: normalized.weeklyRate,
    deposit_percentage: normalized.depositPercentage,
    default_rate_1h: normalized.defaultRate1h,
    default_rate_2h: normalized.defaultRate2h,
    extra_passenger_fee: normalized.extraPassengerFee,
    pickup_transport_fee: normalized.pickupTransportFee,
    dropoff_transport_fee: normalized.dropoffTransportFee,
    tax_enabled: normalized.tax_enabled,
    tax_percentage: normalized.tax_percentage,
    apply_to_rentals: normalized.apply_to_rentals,
    apply_to_tours: normalized.apply_to_tours,
    booking_reminder_hours: normalized.bookingReminderHours,
    return_reminder_hours: normalized.returnReminderHours,
    rental_grace_period_minutes: normalized.rentalGracePeriodMinutes,
    rental_soft_lock_minutes: normalized.rentalSoftLockMinutes,
    extra_hour_threshold_minutes: normalized.extraHourThresholdMinutes,
    whatsapp_enabled: normalized.whatsappEnabled,
    email_notifications: normalized.emailNotifications,
    sms_notifications: normalized.smsNotifications,
    push_notifications: normalized.pushNotifications,
    notify_on_overdue: normalized.notifyOnOverdue,
    notify_on_maintenance: normalized.notifyOnMaintenance,
    receipt_footer: normalized.receiptFooter,
    invoice_prefix: normalized.invoicePrefix,
    contract_footer: normalized.contractFooter,
    brand_primary_color: normalized.brandPrimaryColor,
    logo_url: normalized.logoUrl || null,
    stamp_url: normalized.stampUrl || null,
    show_company_website_on_print: normalized.showCompanyWebsiteOnPrint,
    show_company_phone_on_print: normalized.showCompanyPhoneOnPrint,
    map_provider: normalized.mapProvider,
    mapbox_public_token: normalized.mapboxPublicToken,
    ocr_provider: normalized.ocrProvider,
    gemini_proxy_path: normalized.geminiProxyPath,
    whatsapp_default_country_code: normalized.whatsappDefaultCountryCode,
    storage_bucket: normalized.storageBucket,
  require_two_factor_for_admins: normalized.requireTwoFactorForAdmins,
  session_timeout_minutes: normalized.sessionTimeoutMinutes,
  allow_employee_package_edits: normalized.allowEmployeePackageEdits,
  allow_employee_settings_view: normalized.allowEmployeeSettingsView,
  write_audit_logs: normalized.writeAuditLogs,
  allow_live_tracking_retry: normalized.allowLiveTrackingRetry,
  auto_send_contract_email_after_creation: normalized.autoSendContractEmailAfterCreation,
  tour_departure_buffer_minutes: normalized.tourDepartureBufferMinutes,
    tour_auto_receipt_required: normalized.tourAutoReceiptRequired,
    tour_default_license_policy: normalized.tourDefaultLicensePolicy,
    tour_guide_tracking_required: normalized.tourGuideTrackingRequired,
    messaging_photo_sharing_enabled: normalized.messagingPhotoSharingEnabled,
    messaging_max_photos_per_message: normalized.messagingMaxPhotosPerMessage,
    messaging_photo_retention_days: normalized.messagingPhotoRetentionDays,
    messaging_draft_retention_hours: normalized.messagingDraftRetentionHours,
    messaging_allow_camera_capture: normalized.messagingAllowCameraCapture,
    rental_details_default_view: normalized.rentalDetailsDefaultView,
    tenant_deletion_retention_days: normalized.tenantDeletionRetentionDays,
    updated_at: normalized.updatedAt,
  };
};

const fromTableRow = (row = {}) => normalizeSettings({
  companyName: row.company_name,
  companyEmail: row.company_email,
  companyPhone: row.company_phone,
  companyAddress: row.company_address,
  companyWebsite: row.company_website,
  timezone: row.timezone,
  language: row.language,
  currency: row.currency,
  operatingHours: row.operating_hours,
  operatingDays: row.operating_days,
  defaultRentalDuration: row.default_rental_duration,
  minRentalDuration: row.min_rental_duration,
  maxRentalDuration: row.max_rental_duration,
  maintenanceMode: row.maintenance_mode,
  onlineBooking: row.online_booking,
  realTimeTracking: row.real_time_tracking,
  baseHourlyRate: row.base_hourly_rate,
  dailyRate: row.daily_rate,
  weeklyRate: row.weekly_rate,
  depositPercentage: row.deposit_percentage,
  defaultRate1h: row.default_rate_1h,
  defaultRate2h: row.default_rate_2h,
  extraPassengerFee: row.extra_passenger_fee,
  pickupTransportFee: row.pickup_transport_fee,
  dropoffTransportFee: row.dropoff_transport_fee,
  tax_enabled: row.tax_enabled,
  tax_percentage: row.tax_percentage,
  apply_to_rentals: row.apply_to_rentals,
  apply_to_tours: row.apply_to_tours,
  bookingReminderHours: row.booking_reminder_hours,
  returnReminderHours: row.return_reminder_hours,
  rentalGracePeriodMinutes: row.rental_grace_period_minutes,
  rentalSoftLockMinutes: row.rental_soft_lock_minutes,
  extraHourThresholdMinutes: row.extra_hour_threshold_minutes,
  whatsappEnabled: row.whatsapp_enabled,
  emailNotifications: row.email_notifications,
  smsNotifications: row.sms_notifications,
  pushNotifications: row.push_notifications,
  notifyOnOverdue: row.notify_on_overdue,
  notifyOnMaintenance: row.notify_on_maintenance,
  receiptFooter: row.receipt_footer,
  invoicePrefix: row.invoice_prefix,
  contractFooter: row.contract_footer,
  brandPrimaryColor: row.brand_primary_color,
  logoUrl: row.logo_url,
  stampUrl: row.stamp_url,
  showCompanyWebsiteOnPrint: row.show_company_website_on_print,
  showCompanyPhoneOnPrint: row.show_company_phone_on_print,
  mapProvider: row.map_provider,
  mapboxPublicToken: row.mapbox_public_token,
  ocrProvider: row.ocr_provider,
  geminiProxyPath: row.gemini_proxy_path,
  whatsappDefaultCountryCode: row.whatsapp_default_country_code,
  storageBucket: row.storage_bucket,
        requireTwoFactorForAdmins: row.require_two_factor_for_admins,
        sessionTimeoutMinutes: row.session_timeout_minutes,
        allowEmployeePackageEdits: row.allow_employee_package_edits,
        allowEmployeeSettingsView: row.allow_employee_settings_view,
        writeAuditLogs: row.write_audit_logs,
        allowLiveTrackingRetry: row.allow_live_tracking_retry,
        autoSendContractEmailAfterCreation: row.auto_send_contract_email_after_creation,
        tourDepartureBufferMinutes: row.tour_departure_buffer_minutes,
  tourAutoReceiptRequired: row.tour_auto_receipt_required,
  tourDefaultLicensePolicy: row.tour_default_license_policy,
  tourGuideTrackingRequired: row.tour_guide_tracking_required,
  messagingPhotoSharingEnabled: row.messaging_photo_sharing_enabled,
  messagingMaxPhotosPerMessage: row.messaging_max_photos_per_message,
  messagingPhotoRetentionDays: row.messaging_photo_retention_days,
  messagingDraftRetentionHours: row.messaging_draft_retention_hours,
  messagingAllowCameraCapture: row.messaging_allow_camera_capture,
  rentalDetailsDefaultView: row.rental_details_default_view,
  tenantDeletionRetentionDays: row.tenant_deletion_retention_days,
  updatedAt: row.updated_at,
});

const extractMissingColumnName = (error) => {
  const message = String(error?.message || error?.details || '');
  const match = message.match(/column "([^"]+)"/i) || message.match(/'([^']+)'\s+column/i);
  return match?.[1] || null;
};

const isMissingOptionalSettingsColumnError = (error, payload = {}) => {
  const missingColumn = extractMissingColumnName(error);
  if (!missingColumn) return false;
  return OPTIONAL_SETTINGS_COLUMNS.has(missingColumn) && Object.prototype.hasOwnProperty.call(payload, missingColumn);
};

const readBrandingFromAppSettings = async (adminClient) => {
  const { data, error } = await adminClient
    .from(APP_SETTINGS_TABLE)
    .select('logo_url, stamp_url')
    .eq('id', SETTINGS_ROW_ID)
    .maybeSingle();

  if (error) throw error;
  return {
    logoUrl: data?.logo_url || '',
    stampUrl: data?.stamp_url || '',
  };
};

const writeBrandingToAppSettings = async (adminClient, settings) => {
  const payload = {
    id: SETTINGS_ROW_ID,
    logo_url: settings.logoUrl || null,
    stamp_url: settings.stampUrl || null,
  };

  const { error } = await adminClient
    .from(APP_SETTINGS_TABLE)
    .upsert(payload, { onConflict: 'id' });

  if (error) throw error;
};

const readSettingsFromTable = async (adminClient) => {
  const { data, error } = await adminClient
    .from(SETTINGS_TABLE)
    .select('*')
    .eq('id', SETTINGS_ROW_ID)
    .maybeSingle();

  if (error) throw error;
  const settings = data ? fromTableRow(data) : getDefaultSettings();
  try {
    const branding = await readBrandingFromAppSettings(adminClient);
    return normalizeSettings({ ...settings, ...branding });
  } catch {
    return settings;
  }
};

const writeSettingsToTable = async (adminClient, settings) => {
  let compatiblePayload = toTableRow(settings);
  let data = null;

  for (let attempt = 0; attempt < OPTIONAL_SETTINGS_COLUMNS.size + 1; attempt += 1) {
    const response = await adminClient
      .from(SETTINGS_TABLE)
      .upsert(compatiblePayload, { onConflict: 'id' })
      .select('*')
      .single();

    if (!response.error) {
      data = response.data;
      break;
    }

    if (isMissingOptionalSettingsColumnError(response.error, compatiblePayload)) {
      const missingColumn = extractMissingColumnName(response.error);
      const { [missingColumn]: _removed, ...nextPayload } = compatiblePayload;
      compatiblePayload = nextPayload;
      continue;
    }

    throw response.error;
  }

  if (!data) {
    throw new Error('Unable to save system settings with the current schema.');
  }

  try {
    await writeBrandingToAppSettings(adminClient, settings);
  } catch (brandingError) {
    console.error('system-settings branding write failed:', brandingError);
  }
  return normalizeSettings({
    ...fromTableRow(data),
    logoUrl: settings.logoUrl,
    stampUrl: settings.stampUrl,
  });
};

const requireAdminForWrite = async (req) => {
  const auth = await authenticateRequest(req);
  if (auth.error) return auth;

  const { user, adminClient } = auth;
  const { data: profile, error } = await adminClient
    .from(APP_USERS_TABLE)
    .select('role')
    .eq('id', user.id)
    .maybeSingle();

  if (error) {
    return { error: { status: 500, body: { error: error.message } } };
  }

  const role = String(profile?.role || user.user_metadata?.role || '').toLowerCase();
  if (!['owner', 'admin'].includes(role)) {
    return { error: { status: 403, body: { error: 'Admin or owner access required' } } };
  }

  return { user, adminClient, role };
};

const resolveBrandSettings = async () => {
  try {
    const { adminClient } = createSupabaseClients();
    const settings = await readSettingsFromTable(adminClient);
    return {
      settings,
      brand: {
        companyName: settings.companyName || 'SaharaX',
        logoUrl: settings.logoUrl || '',
        primaryColor: settings.brandPrimaryColor || '#7c3aed',
      },
    };
  } catch (error) {
    console.warn('resolveBrandSettings fallback activated:', error?.message || error);
    return {
      settings: null,
      brand: {
        companyName: 'SaharaX',
        logoUrl: '',
        primaryColor: '#7c3aed',
      },
    };
  }
};

const handlePasswordResetEmail = async (req, res) => {
  if (req.method !== 'POST') {
    return json(res, 405, { error: 'Method not allowed' });
  }

  try {
    const body = parseBody(req.body);
    const email = normalizeEmail(body.email);
    const redirectTo = String(body.redirectTo || '').trim();

    if (!email) {
      return json(res, 400, { error: 'Email is required' });
    }

    if (!redirectTo) {
      return json(res, 400, { error: 'Redirect URL is required' });
    }

    const { adminClient } = createSupabaseClients();
    const { brand } = await resolveBrandSettings();
    const { data, error } = await adminClient.auth.admin.generateLink({
      type: 'recovery',
      email,
      options: {
        redirectTo,
      },
    });

    if (error || !data?.properties?.action_link) {
      console.warn('password reset email link generation failed:', error?.message || 'Missing action link');
      return json(res, 200, { success: true });
    }

    const directResetUrl = (() => {
      try {
        const url = new URL(redirectTo);
        url.searchParams.set('token_hash', data.properties.hashed_token);
        url.searchParams.set('type', data.properties.verification_type || 'recovery');
        url.searchParams.set('email', email);
        return url.toString();
      } catch {
        return data.properties.action_link;
      }
    })();

    const emailPayload = buildPasswordResetEmail({
      resetUrl: directResetUrl,
      email,
      brand,
    });

    const result = await sendResendEmail({
      from: EMAIL_SENDERS.support,
      to: email,
      subject: emailPayload.subject,
      html: emailPayload.html,
      replyTo: 'support@send.saharax.driveout.io',
    });

    return json(res, 200, { success: true, messageId: result?.id || null });
  } catch (error) {
    console.error('password reset email failed:', error);
    return json(res, 500, { error: error.message || 'Failed to send password reset email' });
  }
};

const handleRentalDocumentsEmail = async (req, res) => {
  if (req.method !== 'POST') {
    return json(res, 405, { error: 'Method not allowed' });
  }

  const auth = await requireOwnerOrAdmin(req);
  if (auth.error) {
    return json(res, auth.error.status, auth.error.body);
  }

  try {
    const body = parseBody(req.body);
    const toEmail = normalizeEmail(body.toEmail);
    const rentalId = String(body.rentalId || '').trim();
    const customerName = String(body.customerName || '').trim();
    const documentsHubUrl = String(body.documentsHubUrl || '').trim();
    const items = Array.isArray(body.items)
      ? body.items
          .map((item) => ({
            label: String(item?.label || '').trim(),
            url: String(item?.url || '').trim(),
            description: String(item?.description || '').trim(),
            ctaLabel: String(item?.ctaLabel || '').trim() || 'Open document',
          }))
          .filter((item) => item.label && item.url)
      : [];

    if (!toEmail) {
      return json(res, 400, { error: 'Recipient email is required' });
    }

    if (!items.length) {
      return json(res, 400, { error: 'At least one shared rental item is required' });
    }

    const { brand } = await resolveBrandSettings();
    const emailPayload = buildRentalDocumentsEmail({
      customerName,
      rentalId,
      items,
      documentsHubUrl,
      brand,
    });

    const result = await sendResendEmail({
      from: EMAIL_SENDERS.bookings,
      to: toEmail,
      subject: emailPayload.subject,
      html: emailPayload.html,
      replyTo: 'bookings@send.saharax.driveout.io',
    });

    return json(res, 200, { success: true, messageId: result?.id || null });
  } catch (error) {
    console.error('rental documents email failed:', error);
    return json(res, 500, { error: error.message || 'Failed to send rental documents email' });
  }
};

const handleAnnouncementEmail = async (req, res) => {
  if (req.method !== 'POST') {
    return json(res, 405, { error: 'Method not allowed' });
  }

  const auth = await requireOwnerOrAdmin(req);
  if (auth.error) {
    return json(res, auth.error.status, auth.error.body);
  }

  try {
    const body = parseBody(req.body);
    const recipients = Array.isArray(body.to)
      ? body.to.map(normalizeEmail).filter(Boolean)
      : [normalizeEmail(body.to)].filter(Boolean);
    const subject = String(body.subject || '').trim();
    const title = String(body.title || subject || '').trim();
    const messageHtml = String(body.messageHtml || '').trim();
    const ctaLabel = String(body.ctaLabel || '').trim();
    const ctaUrl = String(body.ctaUrl || '').trim();

    if (!recipients.length) {
      return json(res, 400, { error: 'At least one recipient is required' });
    }

    if (!subject || !messageHtml) {
      return json(res, 400, { error: 'Subject and messageHtml are required' });
    }

    const { brand } = await resolveBrandSettings();
    const emailPayload = buildAnnouncementEmail({
      subject,
      title,
      messageHtml,
      ctaLabel,
      ctaUrl,
      brand,
    });

    const result = await sendResendEmail({
      from: EMAIL_SENDERS.updates,
      to: recipients,
      subject: emailPayload.subject,
      html: emailPayload.html,
      replyTo: 'updates@send.saharax.driveout.io',
    });

    return json(res, 200, { success: true, messageId: result?.id || null });
  } catch (error) {
    console.error('announcement email failed:', error);
    return json(res, 500, { error: error.message || 'Failed to send announcement email' });
  }
};

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const action = getAction(req);

  if (action === 'gemini-proxy') {
    return handleGeminiProxy(req, res);
  }

  if (action === 'send-password-reset-email') {
    return handlePasswordResetEmail(req, res);
  }

  if (action === 'send-rental-documents-email') {
    return handleRentalDocumentsEmail(req, res);
  }

  if (action === 'send-announcement-email') {
    return handleAnnouncementEmail(req, res);
  }

  if (req.method === 'GET') {
    try {
      const { adminClient } = createSupabaseClients();
      const settings = await readSettingsFromTable(adminClient);
      return json(res, 200, { success: true, settings });
    } catch (error) {
      console.error('system-settings GET failed:', error);
      return json(res, isMissingTableError(error) ? 503 : 500, {
        error: isMissingTableError(error)
          ? 'System settings table is not ready yet'
          : error.message,
      });
    }
  }

  if (req.method !== 'PATCH') {
    return json(res, 405, { error: 'Method not allowed' });
  }

  const auth = await requireAdminForWrite(req);
  if (auth.error) {
    return json(res, auth.error.status, auth.error.body);
  }

  try {
    const { adminClient, role } = auth;
    const existing = await readSettingsFromTable(adminClient);
    const body = parseBody(req.body);
    const sanitizedBody = { ...(body || {}) };

    if (role !== 'owner' && Object.prototype.hasOwnProperty.call(sanitizedBody, 'tenantDeletionRetentionDays')) {
      delete sanitizedBody.tenantDeletionRetentionDays;
    }

    const nextSettings = normalizeSettings({ ...existing, ...sanitizedBody });
    const saved = await writeSettingsToTable(adminClient, nextSettings);
    return json(res, 200, { success: true, settings: saved });
  } catch (error) {
    console.error('system-settings PATCH failed:', error);
    return json(res, isMissingTableError(error) ? 503 : 500, {
      error: isMissingTableError(error)
        ? 'System settings table is not ready yet'
        : error.message,
    });
  }
}
