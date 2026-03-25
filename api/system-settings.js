import { APP_USERS_TABLE, createSupabaseClients } from './_lib/supabase.js';
import { authenticateRequest } from './_lib/auth.js';

const SETTINGS_TABLE = 'saharax_0u4w4d_settings';
const SETTINGS_ROW_ID = 1;

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

const getDefaultSettings = () => ({
  companyName: 'QuadVenture',
  companyEmail: 'info@quadventure.com',
  companyPhone: '+212 123 456 789',
  companyAddress: 'Marrakech, Morocco',
  companyWebsite: 'https://quadventure.com',
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
  showCompanyWebsiteOnPrint: true,
  showCompanyPhoneOnPrint: true,
  mapProvider: 'mapbox',
  mapboxPublicToken: '',
  ocrProvider: 'gemini',
  geminiProxyPath: '/api/gemini-proxy',
  whatsappDefaultCountryCode: '+212',
  storageBucket: 'rental-documents',
  requireTwoFactorForAdmins: false,
  sessionTimeoutMinutes: 60,
  allowEmployeePackageEdits: false,
  allowEmployeeSettingsView: true,
  writeAuditLogs: true,
  allowLiveTrackingRetry: true,
  tourDepartureBufferMinutes: 15,
  tourAutoReceiptRequired: true,
  tourDefaultLicensePolicy: 'route_based',
  tourGuideTrackingRequired: true,
  updatedAt: new Date().toISOString(),
});

const normalizeSettings = (value = {}) => {
  const defaults = getDefaultSettings();
  const merged = { ...defaults, ...(value || {}) };

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
    'sessionTimeoutMinutes',
    'tourDepartureBufferMinutes',
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
    'tourAutoReceiptRequired',
    'tourGuideTrackingRequired',
  ].forEach((key) => {
    merged[key] = Boolean(merged[key]);
  });

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
    tour_departure_buffer_minutes: normalized.tourDepartureBufferMinutes,
    tour_auto_receipt_required: normalized.tourAutoReceiptRequired,
    tour_default_license_policy: normalized.tourDefaultLicensePolicy,
    tour_guide_tracking_required: normalized.tourGuideTrackingRequired,
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
  tourDepartureBufferMinutes: row.tour_departure_buffer_minutes,
  tourAutoReceiptRequired: row.tour_auto_receipt_required,
  tourDefaultLicensePolicy: row.tour_default_license_policy,
  tourGuideTrackingRequired: row.tour_guide_tracking_required,
  updatedAt: row.updated_at,
});

const readSettingsFromTable = async (adminClient) => {
  const { data, error } = await adminClient
    .from(SETTINGS_TABLE)
    .select('*')
    .eq('id', SETTINGS_ROW_ID)
    .maybeSingle();

  if (error) throw error;
  return data ? fromTableRow(data) : getDefaultSettings();
};

const writeSettingsToTable = async (adminClient, settings) => {
  const { data, error } = await adminClient
    .from(SETTINGS_TABLE)
    .upsert(toTableRow(settings), { onConflict: 'id' })
    .select('*')
    .single();

  if (error) throw error;
  return fromTableRow(data);
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

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

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
    const { adminClient } = auth;
    const existing = await readSettingsFromTable(adminClient);
    const body = parseBody(req.body);
    const nextSettings = normalizeSettings({ ...existing, ...(body || {}) });
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
