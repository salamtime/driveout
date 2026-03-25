import { adminApiRequest } from './adminApi';

export const defaultSystemSettings = {
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
};

export const fetchSystemSettings = async () => {
  const response = await adminApiRequest('/api/system-settings');
  return {
    ...defaultSystemSettings,
    ...(response?.settings || {}),
  };
};

export const saveSystemSettings = async (settingsPatch) => {
  const response = await adminApiRequest('/api/system-settings', {
    method: 'PATCH',
    body: JSON.stringify(settingsPatch),
  });

  return {
    ...defaultSystemSettings,
    ...(response?.settings || {}),
  };
};
