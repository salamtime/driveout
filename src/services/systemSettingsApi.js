import { adminApiRequest } from './adminApi';
import { supabase } from './supabaseClient';
import { TABLE_NAMES } from '../config/tableNames';

const SETTINGS_TABLE = 'saharax_0u4w4d_settings';
const SETTINGS_ROW_ID = 1;
export const SYSTEM_SETTINGS_UPDATED_EVENT = 'system-settings-updated';
const OPTIONAL_SETTINGS_COLUMNS = new Set([
  'auto_send_contract_email_after_creation',
  'rental_details_default_view',
  'tenant_deletion_retention_days',
]);

export const defaultSystemSettings = {
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
  vipRate1h: 75,
  vipRate2h: 140,
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
  };

const normalizeSettings = (value = {}) => {
  const merged = { ...defaultSystemSettings, ...(value || {}) };
  merged.logoUrl = String(merged.logoUrl || '');
  merged.stampUrl = String(merged.stampUrl || '');

  merged.operatingHours = {
    start: String(merged.operatingHours?.start || defaultSystemSettings.operatingHours.start),
    end: String(merged.operatingHours?.end || defaultSystemSettings.operatingHours.end),
  };
  merged.operatingDays = Array.isArray(merged.operatingDays)
    ? merged.operatingDays.map((day) => String(day).toLowerCase())
    : defaultSystemSettings.operatingDays;

  merged.messagingMaxPhotosPerMessage = Math.max(1, Math.min(10, Number(merged.messagingMaxPhotosPerMessage ?? defaultSystemSettings.messagingMaxPhotosPerMessage) || defaultSystemSettings.messagingMaxPhotosPerMessage));
  merged.messagingPhotoRetentionDays = Math.max(1, Math.min(30, Number(merged.messagingPhotoRetentionDays ?? defaultSystemSettings.messagingPhotoRetentionDays) || defaultSystemSettings.messagingPhotoRetentionDays));
  merged.messagingDraftRetentionHours = Math.max(1, Math.min(168, Number(merged.messagingDraftRetentionHours ?? defaultSystemSettings.messagingDraftRetentionHours) || defaultSystemSettings.messagingDraftRetentionHours));
  merged.extraHourThresholdMinutes = Math.max(0, Math.min(120, Number(merged.extraHourThresholdMinutes ?? defaultSystemSettings.extraHourThresholdMinutes) || defaultSystemSettings.extraHourThresholdMinutes));
  merged.tenantDeletionRetentionDays = Math.max(1, Math.min(365, Number(merged.tenantDeletionRetentionDays ?? defaultSystemSettings.tenantDeletionRetentionDays) || defaultSystemSettings.tenantDeletionRetentionDays));
  merged.messagingPhotoSharingEnabled = Boolean(merged.messagingPhotoSharingEnabled);
  merged.messagingAllowCameraCapture = Boolean(merged.messagingAllowCameraCapture);
  merged.autoSendContractEmailAfterCreation = Boolean(merged.autoSendContractEmailAfterCreation);
  merged.rentalDetailsDefaultView =
    String(merged.rentalDetailsDefaultView || '').toLowerCase() === 'light'
      ? 'light'
      : 'standard';

  return merged;
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
  vipRate1h: row.vip_rate_1h,
  vipRate2h: row.vip_rate_2h,
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
});

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
    vip_rate_1h: normalized.vipRate1h,
    vip_rate_2h: normalized.vipRate2h,
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
  };
};

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

const requireAdminRoleForFallback = async () => {
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user?.id) {
    throw new Error('No active session');
  }

  const { data: profile, error } = await supabase
    .from(TABLE_NAMES.USERS)
    .select('role')
    .eq('id', user.id)
    .maybeSingle();

  if (error) throw error;

  const role = String(profile?.role || user.user_metadata?.role || '').toLowerCase();
  if (!['owner', 'admin'].includes(role)) {
    throw new Error('Admin or owner access required');
  }
};

const fetchSystemSettingsFallback = async () => {
  const { data, error } = await supabase
    .from(SETTINGS_TABLE)
    .select('*')
    .eq('id', SETTINGS_ROW_ID)
    .maybeSingle();

  if (error) throw error;
  return normalizeSettings(data ? fromTableRow(data) : defaultSystemSettings);
};

const saveSystemSettingsFallback = async (settingsPatch) => {
  await requireAdminRoleForFallback();
  const existing = await fetchSystemSettingsFallback();
  const nextSettings = normalizeSettings({ ...existing, ...(settingsPatch || {}) });
  let compatiblePayload = toTableRow(nextSettings);

  for (let attempt = 0; attempt < OPTIONAL_SETTINGS_COLUMNS.size + 1; attempt += 1) {
    const { data, error } = await supabase
      .from(SETTINGS_TABLE)
      .upsert(compatiblePayload, { onConflict: 'id' })
      .select('*')
      .single();

    if (!error) {
      return normalizeSettings(data ? fromTableRow(data) : nextSettings);
    }

    if (isMissingOptionalSettingsColumnError(error, compatiblePayload)) {
      const missingColumn = extractMissingColumnName(error);
      const { [missingColumn]: _removed, ...nextPayload } = compatiblePayload;
      compatiblePayload = nextPayload;
      continue;
    }

    throw error;
  }

  throw new Error('Unable to save system settings with the current schema.');
};

export const fetchSystemSettings = async () => {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) {
      return await fetchSystemSettingsFallback();
    }
  } catch {
    // Fall through to the API/public route below.
  }

  try {
    const response = await fetch('/api/system-settings', {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(payload?.error || 'Failed to load system settings');
    }

    return normalizeSettings(payload?.settings || {});
  } catch (apiError) {
    try {
      return await fetchSystemSettingsFallback();
    } catch (fallbackError) {
      throw apiError || fallbackError;
    }
  }
};

export const saveSystemSettings = async (settingsPatch) => {
  try {
    const response = await adminApiRequest('/api/system-settings', {
      method: 'PATCH',
      body: JSON.stringify(settingsPatch),
    });

    const normalized = normalizeSettings(response?.settings || {});
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(SYSTEM_SETTINGS_UPDATED_EVENT, { detail: normalized }));
    }
    return normalized;
  } catch (fallbackError) {
    try {
      const normalized = await saveSystemSettingsFallback(settingsPatch);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent(SYSTEM_SETTINGS_UPDATED_EVENT, { detail: normalized }));
      }
      return normalized;
    } catch (apiError) {
      throw apiError || fallbackError;
    }
  }
};
