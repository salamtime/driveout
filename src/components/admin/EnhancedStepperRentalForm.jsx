import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { 
  User, Car, CreditCard, Check, ChevronRight, ChevronLeft,
  Scan, UserSearch, AlertCircle, Loader, Loader2, Clock, DollarSign,
  Calculator, Info, Phone, Mail, Calendar, MapPin, FileText,
  Upload, Shield, CheckCircle, XCircle, CalendarDays, Car as CarIcon,
  Users, UserPlus, BadgeCheck, FileImage, DownloadCloud, Plus, Minus,
  ChevronDown, ChevronUp, Eye, Edit2, Trash2, Save, X, MoreHorizontal, RotateCcw,
  Package, Gauge
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import DynamicPricingService from '../../services/DynamicPricingService';
import { useNavigate } from 'react-router-dom';
import EnhancedUnifiedIDScanModal from '../customers/EnhancedUnifiedIDScanModal';
import SecondDriverIDScanModal from './SecondDriverIDScanModal';
import TransactionalRentalService from '../../services/TransactionalRentalService';
import RentalService from '../../services/RentalService';
import VehicleService from '../../services/VehicleService';
import VehicleModelService from '../../services/VehicleModelService';
import AppSettingsService from '../../services/AppSettingsService';
import enhancedUnifiedCustomerService, { updateCustomerById } from '../../services/EnhancedUnifiedCustomerService';
import { applyOrganizationMatch, getCurrentOrganizationId } from '../../services/OrganizationService';
import { useAuth } from '../../contexts/AuthContext';
import { canEditRentalPrice } from '../../utils/permissionHelpers';
import { 
  getMoroccoTodayString, 
  getMoroccoDateOffset, 
  getMoroccoCurrentTime,
  getMoroccoHourlyTimes,
  isAfter, 
  parseDateAsLocal, 
  formatDateToYYYYMMDD 
} from '../../utils/moroccoTime';
import { toast } from 'sonner';
import { uploadFile } from '../../utils/storageUpload';
import ViewCustomerDetailsDrawer from './ViewCustomerDetailsDrawer';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../ui/dialog';
import i18n from '../../i18n';
import { fetchSystemSettings } from '../../services/systemSettingsApi';
import { getUsers } from '../../services/UserService';
import {
  mergeUniqueCustomersById,
  normalizeCustomerIdentityFields,
  pickBestExistingCustomerMatch,
  pickExactIdentityCustomerMatch,
  pickMostCompleteCustomerProfile,
} from '../../utils/customerIdentity';
import { PHONE_COUNTRY_CODES } from '../../constants/phoneCountryCodes';

const tr = (en, fr) => (i18n.resolvedLanguage === 'fr' ? fr : en);
const DEFAULT_BOOKING_GRACE_MINUTES = 120;
const MAX_BOOKING_GRACE_MINUTES = 120;
const normalizeBookingGraceMinutes = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_BOOKING_GRACE_MINUTES;
  return Math.max(0, Math.min(MAX_BOOKING_GRACE_MINUTES, parsed));
};
const PAYMENT_RESET_FIELDS_ON_EDIT = new Set([
  'vehicle_id',
  'rental_type',
  'rental_start_date',
  'rental_end_date',
  'rental_start_time',
  'rental_end_time',
  'quantity_days',
  'quantity_hours',
  'unit_price',
  'transport_fee',
  'selected_package_id',
  'use_package_pricing',
  'pickup_transport',
  'dropoff_transport',
  'pickup_location',
  'dropoff_location',
]);
const EDIT_WORKFLOW_RESET_FIELDS = PAYMENT_RESET_FIELDS_ON_EDIT;
const EDIT_WORKFLOW_NUMERIC_FIELDS = new Set([
  'vehicle_id',
  'quantity_days',
  'quantity_hours',
  'unit_price',
  'transport_fee',
]);
const EDIT_WORKFLOW_BOOLEAN_FIELDS = new Set([
  'pickup_transport',
  'dropoff_transport',
  'use_package_pricing',
]);
const getEditWorkflowResetFields = (submissionData = {}, initialData = {}) => ({
  payment_status: 'unpaid',
  deposit_amount: '',
  remaining_amount: Number(submissionData.total_amount) || 0,
  rental_status: initialData?.rental_status === 'completed' ? 'completed' : 'scheduled',
  contract_signed: false,
  signature_url: null,
  contract_signed_by: null,
  contract_signed_by_name: null,
  contract_signed_at: null,
  opening_video_url: null,
  start_odometer: null,
  start_fuel_level: null,
  fuel_charge: 0,
});
const isScheduledConflictExpired = (conflict, graceMinutes = DEFAULT_BOOKING_GRACE_MINUTES) => {
  if (String(conflict?.rental_status || '').toLowerCase() !== 'scheduled' || !conflict?.rental_start_date) {
    return false;
  }

  const scheduledStart = new Date(conflict.rental_start_date);
  if (Number.isNaN(scheduledStart.getTime())) return false;
  return Date.now() > scheduledStart.getTime() + normalizeBookingGraceMinutes(graceMinutes) * 60 * 1000;
};

const normalizeMoneyInput = (value) => {
  if (value === null || value === undefined) return '';

  const normalized = String(value).replace(',', '.').replace(/[^\d.]/g, '');
  if (!normalized) return '';

  const [integerPartRaw = '', ...decimalParts] = normalized.split('.');
  const decimalPart = decimalParts.join('');

  let integerPart = integerPartRaw.replace(/^0+(?=\d)/, '');
  if (integerPart === '') integerPart = '0';

  if (normalized.startsWith('.')) {
    return `0.${decimalPart}`;
  }

  return decimalPart ? `${integerPart}.${decimalPart}` : integerPart;
};

const buildCustomerProfileHref = ({ customerId, email, rentalId }) => {
  const params = new URLSearchParams();
  if (customerId) params.set('customerId', String(customerId).trim());
  if (email) params.set('email', String(email).trim());
  if (rentalId) params.set('rentalId', String(rentalId).trim());
  const query = params.toString();
  return query ? `/admin/customers/profile?${query}` : '/admin/customers/profile';
};

const getPackageBillingMultiplier = (durationUnits, packageDurationUnits = 1) => {
  const safeDurationUnits = Number(durationUnits || 0) || 0;
  const safePackageDurationUnits = Number(packageDurationUnits || 0) || 0;
  if (safeDurationUnits <= 0) return 0;
  if (safePackageDurationUnits <= 0) return safeDurationUnits;
  return Math.max(safeDurationUnits / safePackageDurationUnits, 1);
};

const calculatePackageTotalIncludedKm = (includedKmPerUnit, durationUnits, packageDurationUnits = 1) => {
  const safeIncludedKmPerUnit = Number(includedKmPerUnit || 0) || 0;
  const billingMultiplier = getPackageBillingMultiplier(durationUnits, packageDurationUnits);
  if (safeIncludedKmPerUnit <= 0 || billingMultiplier <= 0) return null;
  return safeIncludedKmPerUnit * billingMultiplier;
};

const formatWholeMad = (value) => {
  const amount = Number(value || 0);
  return new Intl.NumberFormat('en-MA', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(amount);
};

const formatDynamicMad = (value) => {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount)) return '0';
  return String(Math.trunc(amount));
};

const getFixedPackageAmount = (data = {}) => {
  const ratePerUnit =
    Number(data.selected_package_fixed_amount)
    || Number(data.selected_package_rate_per_unit)
    || Number(data.unit_price)
    || 0;

  const durationUnits = Number(
    data.rental_type === 'hourly'
      ? (data.quantity_hours ?? data.quantity_days)
      : data.quantity_days
  ) || 0;
  const packageDurationUnits = Number(
    data.selected_package_duration_units
    ?? data.package_duration_units
    ?? 1
  ) || 1;

  if (ratePerUnit <= 0 || durationUnits <= 0) return 0;
  return ratePerUnit * getPackageBillingMultiplier(durationUnits, packageDurationUnits);
};

const formatRentalDurationLabel = (rentalType, durationUnits, tr) => {
  const safeDurationUnits = Number(durationUnits || 0) || 0;
  if (safeDurationUnits <= 0) {
    return rentalType === 'hourly'
      ? tr('Hourly package', 'Forfait horaire')
      : tr('Daily package', 'Forfait journalier');
  }

  if (rentalType === 'hourly') {
    if (safeDurationUnits === 0.5) return tr('30 min', '30 min');
    if (safeDurationUnits === 1) return tr('1 Hour', '1 heure');
    return tr(`${safeDurationUnits} Hours`, `${safeDurationUnits} heures`);
  }

  if (safeDurationUnits === 1) return tr('1 day', '1 jour');
  return tr(`${safeDurationUnits} days`, `${safeDurationUnits} jours`);
};

const getSelectedPackageDisplayLabel = (data = {}, tr) => {
  if (!data.use_package_pricing || !data.selected_package_name) {
    return tr('Standard pricing', 'Tarification standard');
  }

  const durationUnits = Number(
    data.rental_type === 'hourly'
      ? (data.quantity_hours ?? data.quantity_days)
      : data.quantity_days
  ) || 0;

  const durationLabel = formatRentalDurationLabel(data.rental_type, durationUnits, tr);
  return [data.selected_package_name, durationLabel].filter(Boolean).join(' • ');
};

const isPackagePricingEnabledForRentalDraft = (data = {}) => {
  const value = data?.use_package_pricing;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1;

  const normalized = String(value ?? '').trim().toLowerCase();
  return normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'on';
};

const getPackageDurationUnits = (pkg = {}) => {
  const durationUnits = Number(
    pkg.duration_units ??
    pkg.durationUnits ??
    pkg.package_duration_units ??
    pkg.packageDurationUnits
  );

  if (Number.isFinite(durationUnits) && durationUnits > 0) {
    return durationUnits;
  }

  const rawLabel = String(
    pkg.name ??
    pkg.package_name ??
    pkg.title ??
    pkg.label ??
    ''
  ).toLowerCase();

  if (!rawLabel) return null;
  if (rawLabel.includes('30 min')) return 0.5;
  if (rawLabel.includes('1.5 hour') || rawLabel.includes('1,5 hour')) return 1.5;
  if (rawLabel.includes('4 hour')) return 4;
  if (rawLabel.includes('1 hour') || rawLabel.includes('per hour')) return 1;
  if (rawLabel.includes('1 day') || rawLabel.includes('per day')) return 1;

  const hourMatch = rawLabel.match(/(\d+(?:[.,]\d+)?)\s*hour/);
  if (hourMatch) {
    return Number(String(hourMatch[1]).replace(',', '.')) || null;
  }

  const dayMatch = rawLabel.match(/(\d+(?:[.,]\d+)?)\s*day/);
  if (dayMatch) {
    return Number(String(dayMatch[1]).replace(',', '.')) || null;
  }

  return null;
};

const findMatchingDurationPackage = (packages = [], rentalType, durationUnits) => {
  const safeDurationUnits = Number(durationUnits || 0) || 0;
  if (!Array.isArray(packages) || packages.length === 0 || !rentalType || safeDurationUnits <= 0) {
    return null;
  }

  const matchingPackages = packages.filter((pkg) => {
    const pkgRateType = String(pkg?.rate_types?.name || '').toLowerCase();
    if (pkgRateType && pkgRateType !== rentalType) return false;
    const packageDurationUnits = Number(getPackageDurationUnits(pkg) || 0) || 0;
    return packageDurationUnits === safeDurationUnits;
  });

  if (matchingPackages.length > 0) {
    return [...matchingPackages].sort((a, b) => {
      const aPrice = Number(a.fixed_amount ?? a.package_rate ?? a.rate ?? a.price ?? 0) || 0;
      const bPrice = Number(b.fixed_amount ?? b.package_rate ?? b.rate ?? b.price ?? 0) || 0;
      return aPrice - bPrice;
    })[0];
  }

  return null;
};

const normalizeEditWorkflowFieldValue = (field, value) => {
  if (field === 'rental_start_time' || field === 'rental_end_time') {
    const raw = String(value ?? '').trim();
    return raw ? raw.slice(0, 5) : '';
  }

  if (field === 'rental_start_date' || field === 'rental_end_date') {
    return normalizeDateFieldValue(value);
  }

  return String(value ?? '');
};

const normalizeDateFieldValue = (value) => {
  if (!value) return '';

  const raw = String(value).trim();
  if (!raw) return '';

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return raw;
  }

  if (raw.includes('T')) {
    return raw.split('T')[0];
  }

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? raw : formatDateToYYYYMMDD(parsed);
};

const formatTimeToHHMM = (date) => {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
};

const getEffectiveCreateStartDate = (candidateDate) => {
  const today = getMoroccoTodayString();
  const normalizedCandidate = normalizeDateFieldValue(candidateDate);

  if (!normalizedCandidate || normalizedCandidate < today) {
    return today;
  }

  return normalizedCandidate;
};

const getEffectiveCreateStartTime = (candidateTime) => {
  const raw = String(candidateTime ?? '').trim();
  return raw ? raw.slice(0, 5) : getMoroccoCurrentTime();
};

const getDateDifferenceInDays = (fromDateString, toDateString) => {
  const fromDate = parseDateAsLocal(fromDateString);
  const toDate = parseDateAsLocal(toDateString);
  if (!fromDate || !toDate) return 0;
  fromDate.setHours(0, 0, 0, 0);
  toDate.setHours(0, 0, 0, 0);
  return Math.round((toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24));
};

const hasEditWorkflowChanges = (nextData = {}, initialData = {}) => {
  for (const field of EDIT_WORKFLOW_RESET_FIELDS) {
    const nextValue = nextData[field];
    const initialValue = initialData[field];

    if (EDIT_WORKFLOW_NUMERIC_FIELDS.has(field)) {
      if ((Number(nextValue) || 0) !== (Number(initialValue) || 0)) return true;
      continue;
    }

    if (EDIT_WORKFLOW_BOOLEAN_FIELDS.has(field)) {
      if (Boolean(nextValue) !== Boolean(initialValue)) return true;
      continue;
    }

    if (normalizeEditWorkflowFieldValue(field, nextValue) !== normalizeEditWorkflowFieldValue(field, initialValue)) return true;
  }

  return false;
};

const isValidCustomerRecordId = (value) => {
  if (!value || typeof value !== 'string') return false;
  return value.startsWith('cust_');
};

const resolveCustomerSuggestionId = (customer = {}) => {
  const directCustomerId = String(customer.customer_id || '').trim();
  if (isValidCustomerRecordId(directCustomerId)) {
    return directCustomerId;
  }

  const recordId = String(customer.id || '').trim();
  if (isValidCustomerRecordId(recordId)) {
    return recordId;
  }

  return directCustomerId || recordId || null;
};

const normalizeCustomerSuggestion = (customer = {}, source = 'database') => ({
  id: resolveCustomerSuggestionId(customer),
  name: customer.full_name || customer.customer_name || customer.name || '',
  email: customer.email || customer.customer_email || '',
  phone: customer.phone || customer.customer_phone || '',
  secondary_phone: customer.secondary_phone || customer.customer_secondary_phone || '',
  licence_number: customer.licence_number || customer.customer_licence_number || '',
  id_number: customer.id_number || customer.customer_id_number || '',
  date_of_birth: customer.date_of_birth || customer.customer_dob || '',
  nationality: customer.nationality || customer.customer_nationality || '',
  place_of_birth: customer.place_of_birth || customer.customer_place_of_birth || '',
  extra_images: customer.extra_images || [],
  source,
});

const getCustomerSuggestionKey = (suggestion = {}) => {
  if (suggestion.id) return `id:${suggestion.id}`;
  return [
    'customer',
    String(suggestion.name || '').trim().toLowerCase(),
    String(suggestion.phone || '').trim(),
    String(suggestion.licence_number || '').trim().toLowerCase(),
  ].join(':');
};

const mergeCustomerSuggestions = (...groups) => {
  const suggestionMap = new Map();
  const getSourcePriority = (source) => {
    if (source === 'database-live') return 3;
    if (source === 'database') return 2;
    return 1;
  };

  groups.flat().filter(Boolean).forEach((suggestion) => {
    const normalized = normalizeCustomerSuggestion(suggestion, suggestion.source || 'database');
    if (!normalized.name.trim()) return;

    const key = getCustomerSuggestionKey(normalized);
    const existing = suggestionMap.get(key);
    if (!existing) {
      suggestionMap.set(key, normalized);
      return;
    }

    const shouldUseNext =
      getSourcePriority(normalized.source) >= getSourcePriority(existing.source);
    suggestionMap.set(
      key,
      shouldUseNext ? { ...existing, ...normalized } : { ...normalized, ...existing }
    );
  });

  return Array.from(suggestionMap.values());
};

// ==================== CUSTOM HOOK - ALL BUSINESS LOGIC ====================
const useRentalWizard = (initialData = null, mode = 'create', navigate, options = {}) => {
  const { userProfile, hasFeature } = useAuth();
  const requiresCustomerVerification = Boolean(options.requiresCustomerVerification);
  const isLightVariant = options.variant === 'light';
  
  // Core form state
  const [formData, setFormData] = useState({
    // Customer Info
    customer_name: '',
    customer_email: '',
    customer_phone: '',
    secondary_phone: '',
    customer_id: null,
    customer_licence_number: '',
    customer_id_number: '',
    customer_dob: '',
    customer_place_of_birth: '',
    customer_nationality: '',
    customer_issue_date: '',
    customer_id_image: null,
    customer_uploaded_images: [], // Multiple manually uploaded images
    customer_id_scan_history: [],
    
    // Vehicle & Dates
    vehicle_id: '',
    rental_type: '',
    rental_start_date: '',
    rental_end_date: '',
    rental_start_time: '',
    rental_end_time: '',
    pickup_location: 'Office',
    dropoff_location: 'Office',
    pickup_transport: false,
    dropoff_transport: false,
    
    // Second Driver
    second_driver_name: '',
    second_driver_license: '',
    second_driver_id_number: '',
    second_driver_dob: '',
    second_driver_nationality: '',
    second_driver_uploaded_images: [],
    second_driver_customer_id: null,
    second_driver_id_image: null,
    
    // Financial
    quantity_days: 0,
    quantity_hours: null,
    unit_price: 0,
    transport_fee: 0,
    total_amount: 0,
    deposit_amount: '',
    damage_deposit: 0,
    damage_deposit_source: '', // NEW: track preset source
    damage_deposit_document_url: null,
    damage_deposit_document_name: '',
    remaining_amount: 0,
    payment_status: 'unpaid',
    
    // Options
    rental_status: 'scheduled',
    insurance_included: true,
    helmet_included: true,
    gear_included: false,
    contract_signed: false,
    accessories: '',
    signature_url: null,
    
    // KM Packages - Updated fields
    selected_package_id: null,
    selected_package_name: '',
    selected_package_fixed_amount: 0,
    selected_package_rate_per_unit: 0,
    selected_package_included_km: null,
    selected_package_included_km_per_unit: null,
    selected_package_total_included_km: null,
    selected_package_extra_rate: 0,
    selected_package_fuel_charge_enabled: false,
    selected_package_description: '',
    use_package_pricing: false,
    package_overrides_tier: false,

    // Approval
    approval_status: 'auto',
    pending_total_request: null
  });

  // UI & Loading States
  const [loading, setLoading] = useState(false);
  const [isLoadingVehicles, setIsLoadingVehicles] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successfullySubmitted, setSuccessfullySubmitted] = useState(false);
  const [successRedirectUrl, setSuccessRedirectUrl] = useState('');
  const [errors, setErrors] = useState({});
  const [success, setSuccess] = useState(null);
  const [dateError, setDateError] = useState(null);
  const [selectedQuickDuration, setSelectedQuickDuration] = useState(null);
  
  // Data States
  const [vehicleModels, setVehicleModels] = useState([]);
  const [availableVehicles, setAvailableVehicles] = useState([]);
  const [allVehiclesBeforeFilter, setAllVehiclesBeforeFilter] = useState([]);
  const [transportFees, setTransportFees] = useState({ pickup_fee: 0, dropoff_fee: 0 });
  const [availabilityStatus, setAvailabilityStatus] = useState('unknown');
  const [availablePackages, setAvailablePackages] = useState([]);
  const [isLoadingPackages, setIsLoadingPackages] = useState(false);
  const [selectedPackageDraft, setSelectedPackageDraft] = useState(null);
  
  // ==================== FUEL CHARGE TOGGLE ====================
  const [fuelChargeEnabled, setFuelChargeEnabled] = useState(false);
  const [fuelChargeAmount, setFuelChargeAmount] = useState(0);
  const [bookingGraceMinutes, setBookingGraceMinutes] = useState(DEFAULT_BOOKING_GRACE_MINUTES);

  const [isCheckingAvailability, setIsCheckingAvailability] = useState(false);
  const [vehicleConflict, setVehicleConflict] = useState({
    hasConflict: false,
    conflictingVehicle: null,
    conflicts: [],
    availableAlternatives: [],
    dates: null
  });
  const [autoCalculatedPrice, setAutoCalculatedPrice] = useState(0);
  const [pricingComputationMode, setPricingComputationMode] = useState('per_unit');
  const [pricingComputationLabel, setPricingComputationLabel] = useState('');
  const isCustomerVerificationOnlyMode = Boolean(options.requiresCustomerVerification) && mode === 'edit';
  
  // NEW: Damage Deposit States
  const [damageDepositConfig, setDamageDepositConfig] = useState({
    vehicleModelPresets: {},
    allowCustomDeposit: true
  });
  const [selectedDepositTab, setSelectedDepositTab] = useState(null);
  const [customDepositAmount, setCustomDepositAmount] = useState('');
  const [depositDocumentUploading, setDepositDocumentUploading] = useState(false);
  
  // Customer Data
  const [customers, setCustomers] = useState([]);
  const [rentals, setRentals] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [isPhoneDirty, setIsPhoneDirty] = useState(false);
  const [isEmailDirty, setIsEmailDirty] = useState(false);
  const [customerAlert, setCustomerAlert] = useState(null);
  const [showCustomerAlertModal, setShowCustomerAlertModal] = useState(false);
  const alertedCustomerIdsRef = useRef(new Set());
  const manuallyClearedVehicleRef = useRef(false);
  
  // ==================== SECOND DRIVERS MANAGEMENT ====================
  const [secondDrivers, setSecondDrivers] = useState([]);
  
  // Function to add second driver from ID scan
  const addSecondDriverFromScan = (scannedData, imageFile) => {
    const driverId = `scan_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    
    const newDriver = {
      id: driverId,
      full_name: scannedData.full_name || scannedData.name || scannedData.raw_name || '',
      phone: scannedData.phone || '',
      email: scannedData.email || '',
      licence_number: scannedData.document_number || scannedData.licence_number || scannedData.license_number || '',
      licence_issue_date: null,
      licence_expiry_date: null,
      id_number: scannedData.id_number || scannedData.document_number || '',
      document_number: scannedData.document_number || '',
      document_type: scannedData.document_type || 'Driving License',
      date_of_birth: scannedData.date_of_birth || scannedData.dob || '',
      nationality: scannedData.nationality || '',
      place_of_birth: scannedData.place_of_birth || '',
      gender: scannedData.gender || '',
      id_scan_url: scannedData.id_scan_url || scannedData.publicUrl || null,
      customer_id_image: imageFile ? URL.createObjectURL(imageFile) : null,
      uploaded_images: [],
      extra_images: [],
      scan_confidence: scannedData.confidence_estimate || 0.95,
      document_type_scanned: scannedData.document_type || '',
      country_scanned: scannedData.country || '',
      raw_name_scanned: scannedData.raw_name || '',
      given_name_scanned: scannedData.given_name || scannedData.first_name || '',
      family_name_scanned: scannedData.family_name || scannedData.last_name || '',
      initial_scan_complete: true,
      last_scan_at: new Date().toISOString(),
      scan_metadata: scannedData ? JSON.stringify(scannedData) : {},
      is_active: true,
      created_at: new Date().toISOString(),
      rental_id: null
    };
    
    console.log('✅ Added second driver to array:', {
      name: newDriver.full_name,
      license: newDriver.licence_number,
      id_number: newDriver.id_number,
      hasIdentification: !!(newDriver.licence_number || newDriver.id_number || newDriver.document_number),
      meetsConstraint: !!(newDriver.licence_number || newDriver.id_number || newDriver.document_number),
      driverId: driverId
    });
    
    setSecondDrivers(prev => [...prev, newDriver]);
    return driverId;
  };
  
  // Function to remove second driver
  const removeSecondDriver = (driverId) => {
    setSecondDrivers(prev => prev.filter(driver => driver.id !== driverId));
    console.log('🗑️ Removed second driver:', driverId);
  };
  
  // Function to update second driver
  const updateSecondDriver = (driverId, updates) => {
    setSecondDrivers(prev => 
      prev.map(driver => 
        driver.id === driverId ? { ...driver, ...updates } : driver
      )
    );
    console.log('📝 Updated second driver:', driverId, updates);
  };
  // ==================== END SECOND DRIVERS MANAGEMENT ====================
  
  // Refs
  const isManualStatusChange = useRef(false);
  const isProgrammaticChange = useRef(false);
  const customerSearchRef = useRef(null);
  const customerSuggestionSearchTokenRef = useRef(0);
  const isProcessing = useRef(false);
  const vehicleLoadTimeout = useRef(null);
  const preserveEditFinancialTermsRef = useRef(mode === 'edit');
  const preserveCreateFinancialOverrideRef = useRef(false);

  // ==================== NEW: LOAD DAMAGE DEPOSIT CONFIG ====================
  const loadDamageDepositConfig = async () => {
    try {
      console.log('📡 Loading damage deposit configuration...');
      
      const { data, error } = await supabase
        .from('app_settings')
        .select('damage_deposit_presets, allow_custom_deposit')
        .eq('id', 1)
        .limit(1);

      if (error) throw error;

      const row = Array.isArray(data) ? data[0] : null;

      if (row) {
        const config = {
          vehicleModelPresets: row.damage_deposit_presets || {},
          allowCustomDeposit: row.allow_custom_deposit ?? true
        };
        
        setDamageDepositConfig(config);
        console.log('✅ Loaded damage deposit config:', config);
      }
    } catch (error) {
      console.error('❌ Error loading damage deposit config:', error);
      setDamageDepositConfig({
        vehicleModelPresets: {},
        allowCustomDeposit: true
      });
    }
  };
  
  // ==================== LOAD FUEL CHARGE SETTINGS ====================
const loadFuelChargeSettings = async (vehicleModelId = null, rentalType = null, usePackagePricing = null) => {
  try {
    const modelId = vehicleModelId || formData.vehicle?.vehicle_model_id;
    const type = rentalType || formData.rental_type || 'daily';
    const packagePricing = usePackagePricing ?? formData.use_package_pricing;

    if (!modelId) {
      setFuelChargeAmount(0);
      setFuelChargeEnabled(false);
      return;
    }

    // Load price per line from fuel_pricing table for this model + rental type
    const { data, error } = await supabase
      .from('fuel_pricing')
      .select('price_per_line, hourly_price_per_line, daily_price_per_line')
      .eq('model_id', modelId)
      .single();

    if (error && error.code !== 'PGRST116') {
      // PGRST116 = no rows found (not an error, just means not configured)
      console.error('Error loading fuel pricing:', error);
    }

    let pricePerLine = 0;
    if (data) {
      if (type === 'hourly') {
        pricePerLine = parseFloat(data.hourly_price_per_line ?? data.price_per_line) || 0;
      } else {
        pricePerLine = parseFloat(data.daily_price_per_line ?? data.price_per_line) || 0;
      }
    }

    setFuelChargeAmount(pricePerLine);
    // Default: enabled when price > 0, disabled when 0
    setFuelChargeEnabled(!packagePricing && (rentalType || formData.rental_type) === 'daily' && pricePerLine > 0);

  } catch (error) {
    console.error('Error loading fuel charge settings:', error);
    setFuelChargeAmount(0);
    setFuelChargeEnabled(false);
  }
};

  // ==================== NEW: GET ENABLED PRESETS FOR VEHICLE ====================
  const getEnabledPresetsForVehicle = (vehicleId) => {
    if (!vehicleId) return [];
    
    const vehicle = availableVehicles.find(v => v.id == vehicleId);
    if (!vehicle || !vehicle.vehicle_model_id) return [];
    
    const presets = damageDepositConfig.vehicleModelPresets[vehicle.vehicle_model_id] || [];
    return Array.isArray(presets) ? presets.filter(p => p.enabled) : [];
  };

  const getDefaultPresetForVehicle = (vehicleId) => {
    const enabledPresets = getEnabledPresetsForVehicle(vehicleId);
    if (!enabledPresets.length) return null;
    return enabledPresets.find((preset) => preset.isDefault) || enabledPresets[0];
  };

  // ==================== INITIALIZATION ====================
  useEffect(() => {
    const init = async () => {
      await Promise.all([
        loadCustomers(),
        loadRentals(),
        loadVehicleModels(),
        loadTransportFees(),
        loadDamageDepositConfig()
      ]);
      
      const today = getMoroccoTodayString();
      setFormData(prev => ({
        ...prev,
        rental_start_date: getEffectiveCreateStartDate(prev.rental_start_date || today),
        rental_end_date: getEffectiveCreateStartDate(prev.rental_end_date || today),
      }));
      
      if (initialData && mode === 'edit') {
        initializeEditData(initialData);
      }
    };
    
    init();
  }, []);

  useEffect(() => {
    loadRentalTimingSettings();
  }, []);

  useEffect(() => {
    if (mode === 'edit' || isCustomerVerificationOnlyMode) {
      return;
    }

    const today = getMoroccoTodayString();
    const normalizedStartDate = normalizeDateFieldValue(formData.rental_start_date);
    if (!normalizedStartDate || normalizedStartDate >= today) {
      return;
    }

    const daysBehind = getDateDifferenceInDays(normalizedStartDate, today);
    if (daysBehind <= 0) {
      return;
    }

    setFormData((prev) => {
      const prevStartDate = normalizeDateFieldValue(prev.rental_start_date);
      if (!prevStartDate || prevStartDate >= today) {
        return prev;
      }

      const shiftedEndDateBase = normalizeDateFieldValue(prev.rental_end_date) || prevStartDate;
      const nextStartDate = today;
      let nextEndDate = shiftedEndDateBase;

      const shiftedEndDate = parseDateAsLocal(shiftedEndDateBase);
      if (shiftedEndDate) {
        shiftedEndDate.setDate(shiftedEndDate.getDate() + daysBehind);
        nextEndDate = formatDateToYYYYMMDD(shiftedEndDate);
      }

      if (nextEndDate < nextStartDate) {
        nextEndDate =
          prev.rental_type === 'daily'
            ? getMoroccoDateOffset(1, nextStartDate)
            : nextStartDate;
      }

      return {
        ...prev,
        rental_start_date: nextStartDate,
        rental_end_date: nextEndDate,
      };
    });
  }, [formData.rental_end_date, formData.rental_start_date, formData.rental_type, isCustomerVerificationOnlyMode, mode]);

  // ==================== NEW: AUTO-SELECT DEFAULT PRESET ====================
  useEffect(() => {
    if (isCustomerVerificationOnlyMode) {
      return;
    }

    if (mode === 'edit' || isLightVariant) {
      return;
    }

    if (formData.vehicle_id) {
      const defaultPreset = getDefaultPresetForVehicle(formData.vehicle_id);

      if (defaultPreset) {
        setSelectedDepositTab(defaultPreset.label);
        setFormData(prev => ({
          ...prev,
          damage_deposit: defaultPreset.amount,
          damage_deposit_source: defaultPreset.label
        }));
        console.log(`✅ Auto-selected deposit: ${defaultPreset.label} (${defaultPreset.amount} MAD)`);
      } else if (damageDepositConfig.allowCustomDeposit) {
        setSelectedDepositTab('custom');
        setFormData(prev => ({
          ...prev,
          damage_deposit_source: 'custom'
        }));
      }
    }
  }, [formData.vehicle_id, damageDepositConfig, isCustomerVerificationOnlyMode, isLightVariant]);

  // ==================== DATA LOADING ====================
  const loadCustomers = async () => {
    try {
      const data = await enhancedUnifiedCustomerService.getAllCustomers();
      if (data) setCustomers(data);
    } catch (err) {
      console.error('Failed to load customers:', err);
    }
  };

  const loadRentals = async () => {
    try {
      const data = await RentalService.getAllRentalsDetailed();
      if (data) setRentals(data);
    } catch (err) {
      console.error('Failed to load rentals:', err);
    }
  };

  // ==================== FILTER VEHICLES BY DATE AVAILABILITY ====================
  const filterAvailableVehiclesByDates = async (vehicles, startDate, endDate, startTime = '00:00', endTime = '23:59') => {
    if (!startDate || !endDate || !vehicles || vehicles.length === 0) {
      console.log('📋 No date filtering applied - returning all vehicles');
      return vehicles;
    }
    
    try {
      const start = composeDateTime(startDate, startTime);
      const end = composeDateTime(endDate, endTime);
      
      if (!start || !end) {
        console.log('⚠️ Invalid dates for filtering - returning all vehicles');
        return vehicles;
      }
      
      console.log('🔍 Filtering vehicles for availability from', start.toISOString(), 'to', end.toISOString());
      
      const allConflicts = await RentalService.getSchedulingConflictsForRange({
        startDate: start.toISOString(),
        endDate: end.toISOString(),
      }).catch((error) => {
        console.error('❌ Error fetching conflicts:', error);
        return null;
      });
      
      if (!allConflicts) {
        return vehicles;
      }
      
      const blockingConflicts = (allConflicts || []).filter((conflict) => !isScheduledConflictExpired(conflict, bookingGraceMinutes));

      const conflictingVehicleIds = new Set();
      if (blockingConflicts.length > 0) {
        blockingConflicts.forEach(conflict => {
          if (initialData?.id && conflict.id === initialData.id) {
            return;
          }
          conflictingVehicleIds.add(conflict.vehicle_id);
        });
      }

      console.log('🔍 CONFLICT QUERY RESULTS:', {
        totalConflicts: blockingConflicts.length,
        conflictingVehicleIds: Array.from(conflictingVehicleIds),
        conflictDetails: blockingConflicts.map(c => ({
          vehicle_id: c.vehicle_id,
          start: c.rental_start_date,
          end: c.rental_end_date,
          status: c.rental_status
        }))
      });
      
      const trulyAvailableVehicles = vehicles.filter(vehicle => 
        !conflictingVehicleIds.has(vehicle.id)
      );
      
      console.log(`✅ After filtering: ${trulyAvailableVehicles.length} truly available vehicles out of ${vehicles.length}`);
      
      return trulyAvailableVehicles;
      
    } catch (error) {
      console.error('❌ Error in filterAvailableVehiclesByDates:', error);
      return vehicles;
    }
  };

  const loadVehicleModels = async () => {
    if (isLoadingVehicles) {
      console.log('⏳ Already loading vehicles, skipping...');
      return;
    }
    setIsLoadingVehicles(true);
    try {
      console.log('🚀 Loading vehicle models and available vehicles only...');
      
      const models = await VehicleModelService.getAllVehicleModels();
      setVehicleModels(models || []);
      
      const vehicles = await VehicleService.getAllVehicles();
      
      if (!Array.isArray(vehicles)) {
        setAvailableVehicles([]);
      } else {
        const eligibleVehicles = (vehicles || []).filter(vehicle => {
          if (vehicle.status === 'available' || vehicle.status === 'scheduled') {
            return true;
          }

          if (mode === 'edit' && initialData?.vehicle_id && vehicle.id == initialData.vehicle_id) {
            return true;
          }

          return false;
        });

        console.log('🚗 VEHICLES FROM DB (eligible for form):', {
          count: eligibleVehicles.length,
          vehicles: eligibleVehicles.map(v => ({ id: v.id, name: v.name, status: v.status }))
        });

        if (formData.rental_start_date && formData.rental_end_date) {
          const filteredVehicles = await filterAvailableVehiclesByDates(
            eligibleVehicles,
            formData.rental_start_date, 
            formData.rental_end_date,
            formData.rental_start_time || '00:00',
            formData.rental_end_time || '23:59'
          );

          console.log('🚗 VEHICLES AFTER DATE FILTERING:', {
            count: filteredVehicles?.length || 0,
            vehicles: filteredVehicles?.map(v => ({ id: v.id, name: v.name }))
          });

          setAvailableVehicles(filteredVehicles);
        } else {
          setAvailableVehicles(eligibleVehicles);
        }
      }
    } catch (error) {
      console.error('❌ Error loading vehicle data:', error);
    } finally {
      setIsLoadingVehicles(false);
    }
  };

  const loadTransportFees = async () => {
    try {
      const fees = await AppSettingsService.getTransportFees();
      const normalizedFees = {
        pickup_fee: fees?.pickup_fee || fees?.pickup_transport_fee || 0,
        dropoff_fee: fees?.dropoff_fee || fees?.dropoff_transport_fee || 0
      };
      setTransportFees(normalizedFees);
    } catch (err) {
      console.error('Error loading transport fees:', err);
    }
  };

  const loadRentalTimingSettings = async () => {
    try {
      const settings = await fetchSystemSettings();
      setBookingGraceMinutes(
        normalizeBookingGraceMinutes(
          settings?.rentalGracePeriodMinutes ??
          settings?.rental_grace_period_minutes
        )
      );
    } catch (err) {
      console.error('Error loading rental timing settings:', err);
      setBookingGraceMinutes(DEFAULT_BOOKING_GRACE_MINUTES);
    }
  };

  const checkVehicleAvailability = async (vehicleId, startDate, endDate, startTime = null, endTime = null) => {
    if (!vehicleId || !startDate || !endDate) {
      return { available: true };
    }
    
    setIsCheckingAvailability(true);
    
    try {
      const start = composeDateTime(startDate, startTime || formData.rental_start_time || '00:00');
      const end = composeDateTime(endDate, endTime || formData.rental_end_time || '23:59');
      
      if (!start || !end) {
        setIsCheckingAvailability(false);
        return { available: true };
      }
      
      const result = await RentalService.checkRentalConflicts({
        vehicleId,
        startDate: start.toISOString(),
        endDate: end.toISOString(),
        excludeBookingId: initialData?.id || null,
      }).catch((error) => {
        console.error('❌ Availability check error:', error);
        return null;
      });
      
      if (!result) {
        setIsCheckingAvailability(false);
        return { available: true };
      }
      
      const blockingConflicts = (result.conflicts || []).filter((conflict) => !isScheduledConflictExpired(conflict, bookingGraceMinutes));

      if (blockingConflicts.length > 0) {
        console.log(`❌ Found ${blockingConflicts.length} conflict(s) for vehicle ${vehicleId}`);
        
        setVehicleConflict({
          hasConflict: true,
          conflictingVehicle: availableVehicles.find(v => v.id == vehicleId),
          conflicts: blockingConflicts,
          availableAlternatives: [],
          dates: {
            start: startDate,
            end: endDate,
            startTime: startTime || formData.rental_start_time,
            endTime: endTime || formData.rental_end_time
          }
        });
        
        setIsCheckingAvailability(false);
        return {
          available: false,
          conflicts: blockingConflicts,
          conflictCount: blockingConflicts.length
        };
      }
      
      console.log('✅ Vehicle is available');
      setVehicleConflict({
        hasConflict: false,
        conflictingVehicle: null,
        conflicts: [],
        availableAlternatives: [],
        dates: null
      });
      
      setIsCheckingAvailability(false);
      return { available: true };
      
    } catch (error) {
      console.error('❌ Availability check exception:', error);
      setIsCheckingAvailability(false);
      return { available: true };
    }
  };

  // ==================== SAVE CUSTOMER FROM SCAN ====================
  const resolveExistingCustomerFromScan = async (incomingData = {}) => {
    try {
      const normalizedIdentity = normalizeCustomerIdentityFields({
        licenceNumber:
          incomingData.customer_licence_number ||
          incomingData.licence_number ||
          incomingData.license_number ||
          incomingData.idNumber ||
          incomingData.id_number ||
          incomingData.document_number ||
          '',
        idNumber:
          incomingData.customer_id_number ||
          incomingData.id_number ||
          incomingData.idNumber ||
          incomingData.document_number ||
          '',
      });

      const fullName = String(
        incomingData.customer_name ||
          incomingData.full_name ||
          incomingData.fullName ||
          incomingData.name ||
          incomingData.raw_name ||
          ''
      ).trim();
      const phone = String(incomingData.customer_phone || incomingData.phone || '').trim();
      const email = String(incomingData.customer_email || incomingData.email || '').trim();
      const lookupCandidate = {
        full_name: fullName,
        phone,
        email,
        licence_number: normalizedIdentity.licenceNumber || '',
        id_number: normalizedIdentity.idNumber || '',
      };
      const exactMatches = await enhancedUnifiedCustomerService.findMatchingCustomers(lookupCandidate);
      const exactMatch =
        pickExactIdentityCustomerMatch({
          incomingCustomer: lookupCandidate,
          candidates: exactMatches,
        }) ||
        pickMostCompleteCustomerProfile(exactMatches);

      if (exactMatch) return exactMatch;

      const bestMatch = pickBestExistingCustomerMatch({
        incomingCustomer: lookupCandidate,
        candidates: exactMatches || [],
      });

      if (bestMatch?.id) {
        return bestMatch;
      }

      return null;
    } catch (error) {
      console.error('❌ Failed to resolve existing customer from scanned identity:', error);
      return null;
    }
  };

  const saveCustomerFromScan = async (scannedData, imageFile = null) => {
    try {
      const customerId = generateCustomerId();
      const normalizedIdentity = normalizeCustomerIdentityFields({
        licenceNumber:
          scannedData.idNumber ||
          scannedData.document_number ||
          scannedData.licence_number ||
          scannedData.license_number ||
          '',
        idNumber:
          scannedData.id_number ||
          scannedData.document_number ||
          scannedData.idNumber ||
          '',
      });
      
      const customerData = {
        id: customerId,
        full_name: scannedData.fullName || scannedData.full_name || scannedData.name || scannedData.raw_name || '',
        phone: scannedData.phone || '',
        email: scannedData.email || '',
        licence_number: normalizedIdentity.licenceNumber || '',
        id_number: normalizedIdentity.idNumber || '',
        date_of_birth: scannedData.dateOfBirth || scannedData.date_of_birth || scannedData.dob || null,
        nationality: scannedData.nationality || 'Moroccan',
        place_of_birth: scannedData.placeOfBirth || scannedData.place_of_birth || '',
        id_scan_url: scannedData.imageUrl || scannedData.id_scan_url || scannedData.publicUrl || null,
        data_source: 'ocr_scan',
        initial_scan_complete: true,
        scan_confidence: scannedData.confidence_estimate || 0.95,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        customer_type: 'primary'
      };

      const existingCustomer = await resolveExistingCustomerFromScan(customerData);
      if (existingCustomer?.id) {
        return existingCustomer;
      }
      
      const { data: savedCustomer, error } = await supabase
        .from('app_4c3a7a6153_customers')
        .insert([customerData])
        .select()
        .single();
      
      if (error) {
        if (error.code === '23505') {
          const existingCustomer = await resolveExistingCustomerFromScan(customerData);
          
          if (existingCustomer) {
            return existingCustomer;
          }
        }
        throw error;
      }
      
      setCustomers(prev => [...prev, savedCustomer]);
      return savedCustomer;
      
    } catch (error) {
      console.error('❌ INSTANT SAVE: Failed to save customer:', error);
      throw error;
    }
  };

  // ==================== EDIT MODE INITIALIZATION ====================
  const initializeEditData = (data) => {
    let startTime = '';
    let endTime = '';

    if (data.rental_start_date) {
      const startDate = new Date(data.rental_start_date);
      if (!isNaN(startDate.getTime())) {
        startTime = formatTimeToHHMM(startDate);
      }
    }

    if (data.rental_end_date) {
      const endDate = new Date(data.rental_end_date);
      if (!isNaN(endDate.getTime())) {
        endTime = formatTimeToHHMM(endDate);
      }
    }

    const cleanStartDate = data.rental_start_date ? data.rental_start_date.split('T')[0] : '';
    const cleanEndDate = data.rental_end_date ? data.rental_end_date.split('T')[0] : '';
    const linkedPackage = data.package || null;
    const resolvedPackageId = data.selected_package_id || data.package_id || linkedPackage?.id || null;
    const resolvedPackageName = data.selected_package_name || data.package_name || linkedPackage?.package_name || linkedPackage?.name || '';
    const resolvedPackageRate =
      Number(data.selected_package_rate_per_unit) ||
      Number(data.package_rate_per_unit) ||
      Number(linkedPackage?.rate_per_unit) ||
      Number(linkedPackage?.fixed_amount) ||
      0;
    const resolvedIncludedKmPerUnit =
      Number(data.selected_package_included_km_per_unit) ||
      Number(data.package_included_km_per_unit) ||
      Number(linkedPackage?.included_kilometers) ||
      null;
    const resolvedExtraRate =
      Number(data.selected_package_extra_rate) ||
      Number(data.package_extra_rate) ||
      Number(linkedPackage?.extra_km_rate) ||
      0;
    const resolvedUsePackagePricing = isPackagePricingEnabledForRentalDraft(data);
    const resolvedMinimumDuration = data.rental_type === 'hourly' ? 0.5 : 1;
    const resolvedDuration = Math.max(
      resolvedMinimumDuration,
      Number(
        data.rental_type === 'hourly'
          ? (data.quantity_hours ?? data.quantity_days)
          : data.quantity_days
      ) || resolvedMinimumDuration
    );
    const resolvedTransportFee = Number(data.transport_fee) || 0;
    const resolvedStoredTotal = Number(data.total_amount) || 0;
    const resolvedSavedBaseRate =
      resolvedUsePackagePricing
        ? resolvedPackageRate
        : Math.max(
            0,
            Number(data.unit_price) ||
              ((resolvedStoredTotal > 0 ? Math.max(0, resolvedStoredTotal - resolvedTransportFee) : 0) / resolvedDuration)
          );
    const resolvedDepositAmount =
      data.deposit_amount === null || data.deposit_amount === undefined || data.deposit_amount === ''
        ? ''
        : String(data.deposit_amount);
    const resolvedDamageDeposit =
      data.damage_deposit === null || data.damage_deposit === undefined || data.damage_deposit === ''
        ? 0
        : Number(data.damage_deposit) || 0;
    const resolvedTotalIncludedKm =
      Number(data.selected_package_total_included_km) ||
      Number(data.package_total_included_km) ||
      calculatePackageTotalIncludedKm(resolvedIncludedKmPerUnit, resolvedDuration);

    const hydratedEditData = {
      ...data,
      secondary_phone: data.secondary_phone || data.customer_secondary_phone || '',
      deposit_amount: resolvedDepositAmount,
      damage_deposit: resolvedDamageDeposit,
      quantity_days: resolvedDuration,
      quantity_hours: data.rental_type === 'hourly' ? resolvedDuration : null,
      rental_start_date: cleanStartDate,
      rental_end_date: cleanEndDate,
      rental_start_time: startTime,
      rental_end_time: endTime,
      unit_price: resolvedSavedBaseRate,
      transport_fee: resolvedTransportFee,
      total_amount: resolvedStoredTotal,
      remaining_amount:
        data.remaining_amount === null || data.remaining_amount === undefined || data.remaining_amount === ''
          ? Math.max(0, resolvedStoredTotal - (Number(resolvedDepositAmount) || 0))
          : Number(data.remaining_amount) || 0,
      selected_package_id: resolvedUsePackagePricing ? resolvedPackageId : null,
      selected_package_name: resolvedUsePackagePricing ? resolvedPackageName : '',
      selected_package_fixed_amount: resolvedUsePackagePricing ? (Number(data.selected_package_fixed_amount) || resolvedPackageRate) : 0,
      selected_package_rate_per_unit: resolvedUsePackagePricing ? resolvedPackageRate : 0,
      selected_package_included_km: resolvedUsePackagePricing ? (Number(data.selected_package_included_km) || resolvedIncludedKmPerUnit) : null,
      selected_package_included_km_per_unit: resolvedUsePackagePricing ? resolvedIncludedKmPerUnit : null,
      selected_package_total_included_km: resolvedUsePackagePricing ? resolvedTotalIncludedKm : null,
      selected_package_extra_rate: resolvedUsePackagePricing ? resolvedExtraRate : 0,
      selected_package_fuel_charge_enabled: resolvedUsePackagePricing
        ? Boolean(
            data.selected_package_fuel_charge_enabled ??
            data.package_fuel_charge_enabled ??
            linkedPackage?.fuel_charge_enabled
          )
        : false,
      selected_package_description: resolvedUsePackagePricing ? (data.selected_package_description || data.package_description || linkedPackage?.description || '') : '',
      use_package_pricing: resolvedUsePackagePricing,
    };

    setFormData((prev) => ({
      ...prev,
      ...hydratedEditData,
    }));

    if (data.fuel_charge_enabled !== undefined) {
      setFuelChargeEnabled(data.fuel_charge_enabled);
    }
    if (data.fuel_charge !== undefined) {
      setFuelChargeAmount(data.fuel_charge || 0);
    }

    setAutoCalculatedPrice(resolvedSavedBaseRate);

    const resolvedVehicleModelId =
      data.vehicle?.vehicle_model_id ||
      data.vehicle_model_id ||
      availableVehicles.find((vehicle) => String(vehicle.id) === String(data.vehicle_id))?.vehicle_model_id ||
      null;
    const inferredPresetLabel =
      resolvedVehicleModelId
        ? (damageDepositConfig.vehicleModelPresets[resolvedVehicleModelId] || []).find((preset) => preset.enabled && Number(preset.amount) === resolvedDamageDeposit)?.label
        : null;
    const normalizedDepositSource =
      data.damage_deposit_source === 'document'
        ? null
        : data.damage_deposit_source;
    const inferredDepositTab =
      normalizedDepositSource ||
      inferredPresetLabel ||
      (resolvedDamageDeposit > 0 ? 'custom' : null);

    if (inferredDepositTab) {
      setSelectedDepositTab(inferredDepositTab);
    }
    if (inferredDepositTab === 'custom') {
      setCustomDepositAmount(resolvedDamageDeposit ? String(resolvedDamageDeposit) : '');
    }

    preserveEditFinancialTermsRef.current = true;
    isProgrammaticChange.current = true;
  };

  // ==================== CORE FUNCTIONS ====================
  const composeDateTime = (date, time) => {
    if (!date) return null;
    const localDate = parseDateAsLocal(date);
    if (!localDate || isNaN(localDate.getTime())) return null;

    const timeToUse = time || '00:00';
    const [hours, minutes] = timeToUse.split(':').map(Number);
    
    if (isNaN(hours) || isNaN(minutes)) {
      localDate.setHours(0, 0, 0, 0);
      return localDate;
    }

    localDate.setHours(hours, minutes, 0, 0);
    return isNaN(localDate.getTime()) ? null : localDate;
  };

  const shouldPreserveFinancialTerms = () =>
    (mode === 'edit' && preserveEditFinancialTermsRef.current) || preserveCreateFinancialOverrideRef.current;

  // ==================== UPDATED: GET DIRECT PRICING FROM DATABASE WITH TIER CHECK ====================
  const getDirectPricing = async (vehicleId, rentalType, quantity = 1) => {
    const vehicle = availableVehicles.find(v => v.id == vehicleId);
    if (!vehicle) {
      return rentalType === 'hourly' ? 400 : 1500;
    }
    
    const modelId = vehicle.vehicle_model_id;
    const normalizedQuantity = Number(quantity) || 1;
    let activeBasePrice = 0;
    
    if (modelId && (rentalType === 'hourly' || rentalType === 'daily')) {
      const { data: basePriceData, error } = await supabase
        .from('app_4c3a7a6153_base_prices')
        .select(rentalType === 'hourly' ? 'hourly_price' : 'daily_price')
        .eq('vehicle_model_id', modelId)
        .eq('is_active', true)
        .single();
      
      if (!error && basePriceData) {
        const priceField = rentalType === 'hourly' ? 'hourly_price' : 'daily_price';
        activeBasePrice = parseFloat(basePriceData[priceField]) || 0;
      }
    }

    if ((rentalType === 'hourly' && normalizedQuantity === 1) || (rentalType === 'daily' && normalizedQuantity === 1)) {
      if (activeBasePrice > 0) {
        return activeBasePrice;
      }
    }

    if (!modelId) {
      return rentalType === 'hourly' ? 400 : 1500;
    }
    
    try {
      const { data: pricingTiers, error: tiersError } = await supabase
        .from('pricing_tiers')
        .select('*')
        .eq('vehicle_model_id', modelId)
        .eq('is_active', true);
      
      if (tiersError) {
        throw tiersError;
      }
      
      if (!pricingTiers || pricingTiers.length === 0) {
        if (activeBasePrice > 0) {
          return activeBasePrice;
        }
        throw new Error('No pricing tiers found');
      }
      
      if (rentalType === 'hourly' && normalizedQuantity > 0) {
        if (normalizedQuantity === 1) {
          throw new Error('Single unit should use base price');
        }

        for (const tier of pricingTiers) {
          if (tier.min_hours !== null && tier.max_hours !== null && tier.price_amount) {
            const min = parseFloat(tier.min_hours);
            const max = parseFloat(tier.max_hours);
            
            if (normalizedQuantity >= min && normalizedQuantity <= max) {
              return parseFloat(tier.price_amount);
            }
          }
        }

        if (activeBasePrice > 0) {
          return activeBasePrice;
        }
      }
      
      if (rentalType === 'daily') {
        const days = Math.max(1, Number(quantity) || 1);
        
        for (const tier of pricingTiers) {
          if (tier.daily_price_amount) {
            const min = tier.min_days ? parseInt(tier.min_days) : 1;
            const max = tier.max_days ? parseInt(tier.max_days) : Infinity;
            
            if (days >= min && days <= max) {
              return parseFloat(tier.daily_price_amount);
            }
          }
        }

        if (activeBasePrice > 0) {
          return activeBasePrice;
        }
      }
      
      if (rentalType === 'weekly') {
        const dailyPrice = await getDirectPricing(vehicleId, 'daily', 1);
        return dailyPrice * 7;
      }
      
      throw new Error('No price found');
      
    } catch (error) {
      try {
        if (activeBasePrice > 0 && (rentalType === 'hourly' || rentalType === 'daily')) {
          return activeBasePrice;
        }

        const { data: modelData, error: modelError } = await supabase
          .from('saharax_0u4w4d_vehicle_models')
          .select('hourly_price, daily_price')
          .eq('id', modelId)
          .single();
        
        if (!modelError && modelData) {
          if (rentalType === 'hourly') {
            return modelData.hourly_price || 400;
          } else if (rentalType === 'daily') {
            return modelData.daily_price || 1500;
          } else if (rentalType === 'weekly') {
            return (modelData.daily_price * 7) || 5000;
          }
        }
        
        const { data: basePrices, error: baseError } = await supabase
          .from('app_4c3a7a6153_base_prices')
          .select('hourly_price, daily_price')
          .eq('vehicle_model_id', modelId)
          .single();
        
        if (!baseError && basePrices) {
          if (rentalType === 'hourly') {
            return basePrices.hourly_price || 400;
          } else if (rentalType === 'daily') {
            return basePrices.daily_price || 1500;
          } else if (rentalType === 'weekly') {
            return (basePrices.daily_price * 7) || 5000;
          }
        }
        
      } catch (dbError) {
      }
      
      const { data: modelInfo } = await supabase
        .from('saharax_0u4w4d_vehicle_models')
        .select('model')
        .eq('id', modelId)
        .single();
      
      const modelType = modelInfo?.model || '';
      
      if (modelType === 'AT5') {
        return rentalType === 'hourly' ? 400 : 
               rentalType === 'daily' ? 1500 : 
               rentalType === 'weekly' ? 5000 : 1500;
      } else if (modelType === 'AT6') {
        return rentalType === 'hourly' ? 600 : 
               rentalType === 'daily' ? 1800 : 
               rentalType === 'weekly' ? 10000 : 1800;
      } else if (modelType === 'AT10') {
        return rentalType === 'hourly' ? 1000 : 
               rentalType === 'daily' ? 3800 : 
               rentalType === 'weekly' ? 15000 : 3800;
      }
      
      return rentalType === 'hourly' ? 400 : 
             rentalType === 'daily' ? 1500 : 
             rentalType === 'weekly' ? 5000 : 1500;
    }
  };

  const getPricingComputationMeta = async (vehicleId, rentalType, quantity = 1) => {
    const defaultMeta = {
      mode: 'per_unit',
      label: ''
    };

    if (rentalType !== 'hourly' || Number(quantity) !== 1.5) {
      return defaultMeta;
    }

    const vehicle = availableVehicles.find(v => v.id == vehicleId);
    const modelId = vehicle?.vehicle_model_id;

    if (!modelId) {
      return defaultMeta;
    }

    try {
      const { data: pricingTiers, error } = await supabase
        .from('pricing_tiers')
        .select('min_hours, max_hours, price_amount, calculation_method, is_active')
        .eq('vehicle_model_id', modelId)
        .eq('duration_type', 'hours')
        .eq('is_active', true)
        .order('min_hours', { ascending: true });

      if (error || !pricingTiers?.length) {
        return defaultMeta;
      }

      const matchingTier = pricingTiers.find((tier) => {
        if (!tier?.price_amount || tier.min_hours === null || tier.max_hours === null) {
          return false;
        }
        const min = parseFloat(tier.min_hours);
        const max = parseFloat(tier.max_hours);
        return quantity >= min && quantity <= max;
      });

      if (!matchingTier) {
        return defaultMeta;
      }

      if (matchingTier.calculation_method === 'fixed') {
        const min = parseFloat(matchingTier.min_hours);
        const max = parseFloat(matchingTier.max_hours);
        const rangeLabel = min === max ? `${min}` : `${min}-${max}`;

        return {
          mode: 'flat_total',
          label: `${rangeLabel}-hour fixed tier`
        };
      }

      return defaultMeta;
    } catch (error) {
      return defaultMeta;
    }
  };

  const autoPopulateUnitPrice = async () => {
    try {
      // 🚨 IMPORTANT: Skip auto-population if package pricing is active
      if (formData.use_package_pricing) {
        console.log('📦 Package pricing active, skipping auto-populate');
        return;
      }

      if (!formData.vehicle_id) {
        return;
      }
      
      if (!formData.rental_type) {
        return;
      }

      const quantity = formData.quantity_days || 1;
      const isSingleUnit = quantity === 1;
      const pricingMeta = await getPricingComputationMeta(formData.vehicle_id, formData.rental_type, quantity);
      
      let unitPrice = 0;

      if (isSingleUnit) {
        const vehicle = availableVehicles.find(v => v.id == formData.vehicle_id);
        if (vehicle?.vehicle_model_id) {
          const { data: basePriceData, error } = await supabase
            .from('app_4c3a7a6153_base_prices')
            .select('hourly_price, daily_price')
            .eq('vehicle_model_id', vehicle.vehicle_model_id)
            .eq('is_active', true)
            .single();
          
          if (!error && basePriceData) {
            if (formData.rental_type === 'hourly') {
              unitPrice = parseFloat(basePriceData.hourly_price) || 0;
            } else {
              unitPrice = parseFloat(basePriceData.daily_price) || 0;
            }
          } else {
            unitPrice = await getDirectPricing(formData.vehicle_id, formData.rental_type, 1);
          }
        } else {
          unitPrice = await getDirectPricing(formData.vehicle_id, formData.rental_type, 1);
        }
      } else {
        unitPrice = await getDirectPricing(formData.vehicle_id, formData.rental_type, quantity);
      }

      setAutoCalculatedPrice(unitPrice);
      setPricingComputationMode(pricingMeta.mode);
      setPricingComputationLabel(pricingMeta.label);

      if (shouldPreserveFinancialTerms()) {
        return;
      }

      // 🚨 Only update unit_price if package pricing is NOT active
      if (!formData.use_package_pricing) {
        setFormData(prev => ({
          ...prev,
          unit_price: unitPrice
        }));
      } else {
        console.log('📦 Package pricing active, keeping package rate:', formData.unit_price);
      }

    } catch (err) {
      try {
        const fallbackPrice = await getDirectPricing(
          formData.vehicle_id,
          formData.rental_type,
          formData.quantity_days || 1
        );
        
        setAutoCalculatedPrice(fallbackPrice);
        setPricingComputationMode('per_unit');
        setPricingComputationLabel('');

        if (shouldPreserveFinancialTerms()) {
          return;
        }

        // 🚨 Only update unit_price if package pricing is NOT active
        if (!formData.use_package_pricing) {
          setFormData(prev => ({
            ...prev,
            unit_price: fallbackPrice
          }));
        }
      } catch (fallbackError) {
        setFormData(prev => ({
          ...prev,
          unit_price: 0
        }));
        setAutoCalculatedPrice(0);
        setPricingComputationMode('per_unit');
        setPricingComputationLabel('');
      }
    }
  };

  const calculateTransportFee = () => {
    if (isCustomerVerificationOnlyMode) return;
    let totalTransportFee = 0;
    if (formData.pickup_transport) totalTransportFee += transportFees.pickup_fee || 0;
    if (formData.dropoff_transport) totalTransportFee += transportFees.dropoff_fee || 0;
    
    setFormData(prev => ({ ...prev, transport_fee: totalTransportFee }));
  };

const calculateFinancials = () => {
  if (isCustomerVerificationOnlyMode) return;
  const isFlatTierTotal = !formData.use_package_pricing && pricingComputationMode === 'flat_total';
  const durationUnits = Number(formData.quantity_days || 0) || 0;
  const subtotal = formData.use_package_pricing
    ? getFixedPackageAmount(formData)
    : isFlatTierTotal
    ? (formData.unit_price || 0)
    : durationUnits * (formData.unit_price || 0);
  const total = subtotal + (formData.transport_fee || 0);
  const remaining = total - (formData.deposit_amount || 0);

  setFormData(prev => ({
    ...prev,
    total_amount: total,
    remaining_amount: Math.max(remaining, 0)
  }));
};

  const calculateQuantityAndPricing = async () => {
    if (isCustomerVerificationOnlyMode) return;
    const { rental_type, rental_start_date, rental_end_date, rental_start_time, rental_end_time, vehicle_id, quantity_days } = formData;

    if (!rental_start_date || !rental_end_date) {
      return;
    }

    let startDatetime = composeDateTime(rental_start_date, rental_start_time);
    let endDatetime = composeDateTime(rental_end_date, rental_end_time);

    if (!startDatetime || !endDatetime) return;

    let quantity = 0;
    let updatedEndDate = rental_end_date;
    let updatedEndTime = rental_end_time;

    if (rental_type === 'hourly') {
      if (startDatetime >= endDatetime) {
        endDatetime = new Date(endDatetime);
        endDatetime.setDate(endDatetime.getDate() + 1);
        updatedEndDate = formatDateToYYYYMMDD(endDatetime);
        updatedEndTime = formatTimeToHHMM(endDatetime);
      }
      
      const diffHours = (endDatetime - startDatetime) / (1000 * 60 * 60);
      quantity = Math.max(Math.round(Math.max(diffHours, 0.5) * 2) / 2, 0.5);
    } else {
      const startDateOnly = parseDateAsLocal(rental_start_date);
      const endDateOnly = parseDateAsLocal(rental_end_date);
      if (!startDateOnly || !endDateOnly) return;

      startDateOnly.setHours(0, 0, 0, 0);
      endDateOnly.setHours(0, 0, 0, 0);
      
      const diffTime = endDateOnly - startDateOnly;
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      
      if (selectedQuickDuration && selectedQuickDuration > 0) {
        quantity = selectedQuickDuration;
      } else {
        quantity = diffDays;
      }
    }
    
    if (formData.quantity_days !== quantity) {
      setFormData(prev => ({
        ...prev,
        quantity_days: quantity,
        rental_end_date: updatedEndDate,
        rental_end_time: updatedEndTime,
      }));
    }
    
    if (vehicle_id && quantity > 0) {
      setTimeout(async () => {
        const unitPrice = await getDirectPricing(
          vehicle_id, 
          rental_type,
          quantity
        );
        const pricingMeta = await getPricingComputationMeta(vehicle_id, rental_type, quantity);
        setAutoCalculatedPrice(unitPrice);
        setPricingComputationMode(pricingMeta.mode);
        setPricingComputationLabel(pricingMeta.label);
        if (!shouldPreserveFinancialTerms()) {
          setFormData(prev => ({ 
            ...prev, 
            unit_price: unitPrice 
          }));
        }
      }, 100);
    }
  };

  const getCurrentRentalDurationUnits = () => {
    const startDatetime = composeDateTime(formData.rental_start_date, formData.rental_start_time);
    const endDatetime = composeDateTime(formData.rental_end_date, formData.rental_end_time);

    if (formData.rental_type === 'hourly') {
      if (startDatetime && endDatetime) {
        let adjustedEndDatetime = endDatetime;
        if (startDatetime >= adjustedEndDatetime) {
          adjustedEndDatetime = new Date(adjustedEndDatetime);
          adjustedEndDatetime.setDate(adjustedEndDatetime.getDate() + 1);
        }
        const diffHours = (adjustedEndDatetime - startDatetime) / (1000 * 60 * 60);
        return Math.max(Math.round(Math.max(diffHours, 0.5) * 2) / 2, 0.5);
      }
      return Math.max(Number(formData.quantity_days) || 0.5, 0.5);
    }

    if (startDatetime && endDatetime) {
      const diffMs = endDatetime - startDatetime;
      return Math.max(Math.round(diffMs / (1000 * 60 * 60 * 24)), 1);
    }

    return Math.max(Number(formData.quantity_days) || 1, 1);
  };

  const syncEndDateTimeFromStart = (draftFormData, durationUnits = null) => {
    if (!draftFormData.rental_start_date || !draftFormData.rental_start_time) {
      return draftFormData;
    }

    const startDatetime = composeDateTime(draftFormData.rental_start_date, draftFormData.rental_start_time);
    if (!startDatetime) {
      return draftFormData;
    }

    const minimumUnits = draftFormData.rental_type === 'hourly' ? 0.5 : 1;
    const unitsToUse = Math.max(Number(durationUnits || getCurrentRentalDurationUnits()) || minimumUnits, minimumUnits);
    const millisecondsToAdd =
      draftFormData.rental_type === 'hourly'
        ? unitsToUse * 60 * 60 * 1000
        : unitsToUse * 24 * 60 * 60 * 1000;

    const endDatetime = new Date(startDatetime.getTime() + millisecondsToAdd);

    draftFormData.rental_end_date = formatDateToYYYYMMDD(endDatetime);
    draftFormData.rental_end_time = formatTimeToHHMM(endDatetime);
    draftFormData.quantity_days = unitsToUse;
    draftFormData.quantity_hours = draftFormData.rental_type === 'hourly' ? unitsToUse : null;

    return draftFormData;
  };

  const getAggregatedCustomerData = useCallback(() => {
    const customerMap = new Map();
    
    customers.forEach(c => {
      if (c.full_name) {
        const key = c.full_name.trim().toLowerCase();
        if (!customerMap.has(key)) {
          customerMap.set(key, normalizeCustomerSuggestion(c, 'database'));
        }
      }
    });
    
    rentals.forEach(r => {
      if (r.customer_name) {
        const key = r.customer_name.trim().toLowerCase();
        const existing = customerMap.get(key);
        if (!existing) {
          customerMap.set(key, normalizeCustomerSuggestion(r, 'rental'));
        }
      }
    });
    
    return Array.from(customerMap.values());
  }, [customers, rentals]);

  // ==================== URL SHORTENING HELPER ====================
  const shortenUrl = async (longUrl) => {
    try {
      const apiUrl = `https://is.gd/create.php?format=simple&url=${encodeURIComponent(longUrl)}`;
      
      const response = await fetch(apiUrl);
      
      if (!response.ok) {
        throw new Error(`is.gd API error: ${response.status}`);
      }
      
      const shortUrl = await response.text();
      
      if (shortUrl.startsWith('Error:')) {
        throw new Error(shortUrl);
      }
      
      return shortUrl;
    } catch (error) {
      return longUrl;
    }
  };

  const sendWhatsAppNotifications = async (pendingTotalRequest, rentalId) => {
    try {
      const allUsers = await getUsers();
      const admins = (allUsers || []).filter(
        (user) =>
          ['owner', 'admin'].includes(String(user.role || '')) &&
          user.whatsapp_notifications &&
          user.phone_number
      );

      if (!admins || admins.length === 0) {
        return 0;
      }

      let notificationCount = 0;
      
      for (const admin of admins) {
        try {
          let cleanPhone = admin.phone_number.replace(/[^\d+]/g, '');
          
          if (!cleanPhone.startsWith('+')) {
            cleanPhone = '+212' + cleanPhone.replace(/^0+/, '');
          }

          const longUrl = `${window.location.origin}/admin/rentals/${rentalId}`;
          const shortUrl = await shortenUrl(longUrl);
          
          const messageText = 
            `SAHARAX - Rental Approval Required\n\n` +
            `Price Override Request: ${pendingTotalRequest} MAD\n` +
            `Rental ID: ${rentalId.substring(0, 8)}...\n\n` +
            `Approval Link: ${shortUrl}\n\n` +
            `Thank you!`;
          
          const message = encodeURIComponent(messageText);

          const whatsappUrl = `https://wa.me/${cleanPhone}?text=${message}`;

          window.open(whatsappUrl, '_blank');
          
          notificationCount++;

          if (notificationCount < admins.length) {
            await new Promise(resolve => setTimeout(resolve, 500));
          }
        } catch (err) {
        }
      }

      return notificationCount;

    } catch (err) {
      return 0;
    }
  };

  const generateCustomerId = () => {
    const timestamp = Date.now();
    const randomString = Math.random().toString(36).substring(2, 11);
    return `cust_${timestamp}_${randomString}`;
  };

  // ==================== QUICK HOUR SELECT HANDLER ====================
  const handleQuickHourSelect = (hours) => {
    const startDate = getEffectiveCreateStartDate(formData.rental_start_date);
    const startTime = getEffectiveCreateStartTime(formData.rental_start_time);
    const startDateTime = composeDateTime(startDate, startTime);
    if (!startDateTime) {
      toast.error(tr('Invalid start date/time', 'Date/heure de début invalide'));
      return;
    }
    
    const endDateTime = new Date(startDateTime.getTime() + (hours * 60 * 60 * 1000));
    const activeSelectedPackage = availablePackages.find(
      (pkg) => String(pkg.id || '') === String(formData.selected_package_id || '')
    );
    const activeSelectedPackageDurationUnits = getPackageDurationUnits(activeSelectedPackage);
    const shouldClearSelectedPackage =
      Boolean(formData.selected_package_id) &&
      (
        (hours === 0.5 && activeSelectedPackageDurationUnits !== 0.5) ||
        (hours === 4 && activeSelectedPackageDurationUnits !== 4) ||
        (hours !== 0.5 && hours !== 4 && activeSelectedPackageDurationUnits !== 1)
      );
    setSelectedQuickDuration(hours);
    
    setFormData(prev => ({
      ...prev,
      rental_type: 'hourly',
      rental_start_date: startDate,
      rental_start_time: startTime,
      rental_end_date: formatDateToYYYYMMDD(endDateTime),
        rental_end_time: formatTimeToHHMM(endDateTime),
        quantity_days: hours,
        quantity_hours: hours,
        ...(shouldClearSelectedPackage ? {
          selected_package_id: null,
          selected_package_name: '',
          selected_package_fixed_amount: 0,
          selected_package_rate_per_unit: 0,
          selected_package_included_km: null,
          selected_package_included_km_per_unit: null,
          selected_package_total_included_km: null,
          selected_package_extra_rate: 0,
          selected_package_fuel_charge_enabled: false,
          selected_package_description: '',
          use_package_pricing: false,
          package_overrides_tier: false,
        } : {}),
      }));
    if (shouldClearSelectedPackage) {
      setSelectedPackageDraft(null);
    }
    
    const hourLabel = Number(hours) === 1 ? tr('hour', 'heure') : tr('hours', 'heures');
    toast.success(`✅ ${tr('Rental period set to', 'Période de location définie à')} ${hours} ${hourLabel}`);
  };

  const handleQuickDaySelect = (days) => {
    const startDate = getEffectiveCreateStartDate(formData.rental_start_date);
    const startTime = getEffectiveCreateStartTime(formData.rental_start_time);
    const startDateTime = composeDateTime(startDate, startTime);

    if (startDateTime) {
      const endDateTime = new Date(startDateTime.getTime() + (days * 24 * 60 * 60 * 1000));
      const activeSelectedPackage = availablePackages.find(
        (pkg) => String(pkg.id || '') === String(formData.selected_package_id || '')
      );
      const selectedPackageRateType = String(activeSelectedPackage?.rate_types?.name || '').toLowerCase();
      const shouldClearSelectedPackage =
        Boolean(formData.selected_package_id) &&
        selectedPackageRateType !== 'daily';
      setFormData(prev => ({
        ...prev,
        rental_type: 'daily',
        rental_start_date: startDate,
        rental_start_time: startTime,
        rental_end_date: formatDateToYYYYMMDD(endDateTime),
        rental_end_time: formatTimeToHHMM(endDateTime),
        quantity_days: days,
        quantity_hours: null,
        ...(shouldClearSelectedPackage ? {
          selected_package_id: null,
          selected_package_name: '',
          selected_package_fixed_amount: 0,
          selected_package_rate_per_unit: 0,
          selected_package_included_km: null,
          selected_package_included_km_per_unit: null,
          selected_package_total_included_km: null,
          selected_package_extra_rate: 0,
          selected_package_fuel_charge_enabled: false,
          selected_package_description: '',
          use_package_pricing: false,
          package_overrides_tier: false,
        } : {}),
      }));
      
      setSelectedQuickDuration(days);
      if (shouldClearSelectedPackage) {
        setSelectedPackageDraft(null);
      }
      
      if (formData.vehicle_id) {
        setTimeout(() => {
          getDirectPricing(formData.vehicle_id, 'daily', days).then(price => {
            setAutoCalculatedPrice(price);
            if (!shouldPreserveFinancialTerms()) {
              setFormData(prev => ({ ...prev, unit_price: price }));
            }
          });
        }, 100);
      }
      
      toast.success(`✅ ${tr('Rental period set to', 'Période de location définie à')} ${days} ${days > 1 ? tr('days', 'jours') : tr('day', 'jour')}`);
    } else {
      toast.error(tr('Invalid start date/time', 'Date/heure de début invalide'));
    }
  };

  // ==================== PAYMENT STATUS TAB HANDLER ====================
  const handlePaymentStatusTabClick = (status) => {
    isManualStatusChange.current = true;
    
    const total = parseFloat(formData.total_amount) || 0;
    let newDepositAmount = formData.deposit_amount;
    
    if (status === 'paid') {
      newDepositAmount = total;
    } else if (status === 'unpaid') {
      newDepositAmount = 0;
    }
    
    setFormData(prev => ({
      ...prev,
      payment_status: status,
      deposit_amount: newDepositAmount
    }));
  };

  // ==================== NEW: DAMAGE DEPOSIT TAB HANDLER ====================
  const handleDepositTabClick = (tabId, amount) => {
    setSelectedDepositTab(tabId);

    if (tabId === 'custom') {
      setFormData(prev => ({
        ...prev,
        damage_deposit: amount || parseFloat(customDepositAmount) || 0,
        damage_deposit_source: 'custom',
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        damage_deposit: amount,
        damage_deposit_source: tabId,
      }));
    }
  };

  const handleDepositDocumentUpload = async (file) => {
    if (!file) return;

    setDepositDocumentUploading(true);
    try {
      const result = await uploadFile(file, {
        bucket: 'id_scans',
        pathPrefix: `damage-deposits/${formData.customer_id || 'temp'}`,
      });

      if (!result.success) {
        throw new Error(result.error || tr('Failed to upload document', 'Impossible de téléverser le document'));
      }

      setFormData((prev) => ({
        ...prev,
        damage_deposit_document_url: result.url,
        damage_deposit_document_name: file.name || tr('Security document', 'Document de garantie'),
      }));

      toast.success(tr('Security document uploaded', 'Document de garantie téléversé'));
    } catch (error) {
      toast.error(error.message || tr('Failed to upload security document', 'Impossible de téléverser le document de garantie'));
    } finally {
      setDepositDocumentUploading(false);
    }
  };

  const handleDepositDocumentTypeSelect = (documentType) => {
    setFormData((prev) => ({
      ...prev,
      damage_deposit_document_url: null,
      damage_deposit_document_name: documentType,
    }));
    toast.success(tr('Security document marked as held', 'Document de garantie marqué comme retenu'));
  };

  const handleDepositDocumentClear = () => {
    setFormData((prev) => ({
      ...prev,
      damage_deposit_document_url: null,
      damage_deposit_document_name: '',
    }));
  };

  // ==================== ENHANCED: PHONE NUMBER FORMATTING ====================
  const formatPhoneNumber = (phone, countryCode = '+212') => {
    if (!phone) return '';
    
    let cleaned = phone.replace(/[^\d+]/g, '');
    
    if (cleaned.startsWith('0') && countryCode === '+212') {
      cleaned = '+212' + cleaned.substring(1);
    }
    
    if (!cleaned.startsWith('+') && !cleaned.startsWith('00')) {
      cleaned = countryCode + cleaned;
    }
    
    if (cleaned.startsWith('+212') && cleaned.length > 4) {
      const numbers = cleaned.substring(4).replace(/\D/g, '');
      const groups = numbers.match(/(\d{3})(\d{3})(\d{3})/);
      if (groups) {
        return `+212 ${groups[1]} ${groups[2]} ${groups[3]}`;
      } else if (numbers.length <= 3) {
        return `+212 ${numbers}`;
      } else if (numbers.length <= 6) {
        return `+212 ${numbers.substring(0, 3)} ${numbers.substring(3)}`;
      } else {
        return `+212 ${numbers.substring(0, 3)} ${numbers.substring(3, 6)} ${numbers.substring(6, 9)}`;
      }
    }
    
    return cleaned;
  };

  // ==================== EVENT HANDLERS ====================
  const loadBasePrices = async () => {
    try {
      const { data, error } = await supabase
        .from('app_4c3a7a6153_base_prices')
        .select('*')
        .eq('is_active', true);
      
      if (error) {
      }
    } catch (error) {
    }
  };

  React.useEffect(() => {
    loadBasePrices();
  }, []);

  const handleInputChange = async (field, value) => {
    if (field === 'payment_status') {
      isManualStatusChange.current = true;
    }

    if (field === 'customer_phone') setIsPhoneDirty(true);
    if (field === 'customer_email') setIsEmailDirty(true);

    const shouldResetPaidEditState =
      mode === 'edit' &&
      formData.payment_status === 'paid' &&
      PAYMENT_RESET_FIELDS_ON_EDIT.has(field) &&
      formData[field] !== value;

    if (field === 'rental_start_time' || field === 'rental_end_time' || 
        field === 'rental_start_date' || field === 'rental_end_date') {
      setSelectedQuickDuration(null);
    }

    const newFormData = { ...formData, [field]: value };

    if (field === 'unit_price' && !newFormData.use_package_pricing) {
      preserveCreateFinancialOverrideRef.current = true;
    }

    if (shouldResetPaidEditState) {
      isManualStatusChange.current = true;
      newFormData.payment_status = 'unpaid';
      newFormData.deposit_amount = '';
    }

    if (field === 'vehicle_id') {
      preserveCreateFinancialOverrideRef.current = false;
      manuallyClearedVehicleRef.current = !value;
      newFormData.vehicle_id = value;
      if (isLightVariant) {
        newFormData.damage_deposit = 0;
        newFormData.damage_deposit_source = '';
        newFormData.damage_deposit_document_url = null;
        newFormData.damage_deposit_document_name = '';
      }

      if (!value) {
        setSelectedPackageDraft(null);
        newFormData.selected_package_id = null;
        newFormData.selected_package_name = '';
        newFormData.selected_package_fixed_amount = 0;
        newFormData.selected_package_rate_per_unit = 0;
        newFormData.selected_package_included_km = null;
        newFormData.selected_package_included_km_per_unit = null;
        newFormData.selected_package_total_included_km = null;
        newFormData.selected_package_extra_rate = 0;
        newFormData.selected_package_fuel_charge_enabled = false;
        newFormData.selected_package_description = '';
        newFormData.use_package_pricing = false;
        newFormData.package_overrides_tier = false;
      }
      
      if (value && formData.rental_type && !formData.use_package_pricing && !shouldPreserveFinancialTerms()) {
        setTimeout(() => {
          autoPopulateUnitPrice();
        }, 100);
      }
    }

    if (field === 'selected_package_id') {
      if (!value) {
        setSelectedPackageDraft(null);
        newFormData.selected_package_id = null;
        newFormData.selected_package_name = '';
        newFormData.selected_package_fixed_amount = 0;
        newFormData.selected_package_rate_per_unit = 0;
        newFormData.selected_package_included_km = null;
        newFormData.selected_package_included_km_per_unit = null;
        newFormData.selected_package_total_included_km = null;
        newFormData.selected_package_extra_rate = 0;
        newFormData.selected_package_fuel_charge_enabled = false;
        newFormData.selected_package_description = '';
        newFormData.use_package_pricing = false;
        newFormData.package_overrides_tier = false;
      } else {
        const matchedPackage = availablePackages.find(
          (pkg) => String(pkg.id) === String(value)
        );

        if (matchedPackage) {
          const packageDurationUnits = getPackageDurationUnits(matchedPackage) || 1;
          const packageRatePerUnit = Number(matchedPackage.fixed_amount) || 0;
          const activeDurationUnits = Math.max(
            Number(
              newFormData.rental_type === 'hourly'
                ? (newFormData.quantity_hours ?? newFormData.quantity_days)
                : newFormData.quantity_days
            ) || 0,
            newFormData.rental_type === 'hourly' ? 0.5 : 1
          );

          newFormData.selected_package_id = matchedPackage.id;
          newFormData.selected_package_name = matchedPackage.name || '';
          newFormData.selected_package_fixed_amount = packageRatePerUnit;
          newFormData.selected_package_rate_per_unit = packageRatePerUnit;
          newFormData.selected_package_included_km = matchedPackage.included_kilometers || null;
          newFormData.selected_package_included_km_per_unit = matchedPackage.included_kilometers || null;
          newFormData.selected_package_total_included_km = calculatePackageTotalIncludedKm(
            matchedPackage.included_kilometers,
            activeDurationUnits
          );
          newFormData.selected_package_extra_rate = Number(matchedPackage.extra_km_rate) || 0;
          newFormData.selected_package_fuel_charge_enabled = Boolean(matchedPackage.fuel_charge_enabled);
          newFormData.selected_package_description = matchedPackage.description || '';
          newFormData.use_package_pricing = true;
          newFormData.package_overrides_tier = true;
          newFormData.unit_price = packageRatePerUnit;

          setSelectedPackageDraft({
            package_id: matchedPackage.id,
            package_name: matchedPackage.name || '',
            package_rate_per_unit: packageRatePerUnit,
            package_included_km_per_unit: matchedPackage.included_kilometers || null,
            package_total_included_km: calculatePackageTotalIncludedKm(
              matchedPackage.included_kilometers,
              activeDurationUnits
            ),
            package_extra_rate: Number(matchedPackage.extra_km_rate) || 0,
            package_fuel_charge_enabled: Boolean(matchedPackage.fuel_charge_enabled),
            package_description: matchedPackage.description || '',
            package_duration_units: packageDurationUnits,
            use_package_pricing: true,
            package_overrides_tier: true,
          });
        }
      }
    }

    if (field === 'rental_start_time' || field === 'rental_start_date') {
      syncEndDateTimeFromStart(newFormData);
    }

    if (field === 'rental_type') {
      preserveCreateFinancialOverrideRef.current = false;
      setSelectedQuickDuration(null);
      
      const currentTime = getEffectiveCreateStartTime(newFormData.rental_start_time);
      
      let startDateToUse = getEffectiveCreateStartDate(newFormData.rental_start_date);

      if (value === 'hourly') {
        const currentHour = parseInt(currentTime.split(':')[0]);
        
        if (currentHour >= 23) {
          newFormData.rental_start_date = startDateToUse;
          newFormData.rental_end_date = startDateToUse;
          newFormData.rental_start_time = currentTime;
          newFormData.rental_end_time = '23:59';
        } else {
          newFormData.rental_start_date = startDateToUse;
          newFormData.rental_end_date = startDateToUse;
          newFormData.rental_start_time = currentTime;
          const endTime = new Date();
          endTime.setHours(endTime.getHours() + 1);
          newFormData.rental_end_time = formatTimeToHHMM(endTime);
        }
      } else if (value === 'daily') {
        const tomorrowStr = getMoroccoDateOffset(1, startDateToUse);
        newFormData.rental_start_date = startDateToUse;
        newFormData.rental_end_date = tomorrowStr;
        newFormData.rental_start_time = currentTime;
        
        const startDateTime = composeDateTime(startDateToUse, currentTime);
        if (startDateTime) {
          const endDateTime = new Date(startDateTime.getTime() + (24 * 60 * 60 * 1000));
          newFormData.rental_end_time = formatTimeToHHMM(endDateTime);
        } else {
          newFormData.rental_end_time = currentTime;
        }
      }
    }

    if (field === 'rental_start_date') {
      let dateValue = value;
      if (dateValue && dateValue.includes('T')) {
        dateValue = dateValue.split('T')[0];
      }
      if (newFormData.rental_type === 'daily') {
        syncEndDateTimeFromStart(newFormData);
      } else if (newFormData.rental_type === 'hourly') {
        newFormData.rental_end_date = dateValue;
      }
      newFormData.rental_start_date = dateValue;
    }

    if (field === 'rental_end_date' && newFormData.rental_type === 'hourly') {
      newFormData.rental_end_date = newFormData.rental_start_date;
    }

    if (field === 'customer_name') {
      isProgrammaticChange.current = false;
      setFormData(newFormData);

      const trimmedName = String(value || '').trim().toLowerCase();
      const searchToken = customerSuggestionSearchTokenRef.current + 1;
      customerSuggestionSearchTokenRef.current = searchToken;

      if (trimmedName.length >= 2) {
        const customerData = getAggregatedCustomerData();
        const filteredSuggestions = customerData.filter(suggestion => 
          String(suggestion.name || '').trim().toLowerCase().includes(trimmedName)
        );
        setSuggestions(filteredSuggestions);

        try {
          const liveCustomers = await enhancedUnifiedCustomerService.searchCustomers(trimmedName);
          if (customerSuggestionSearchTokenRef.current !== searchToken) return;

          const liveSuggestions = (liveCustomers || []).map(customer =>
            normalizeCustomerSuggestion(customer, 'database-live')
          );
          setSuggestions(mergeCustomerSuggestions(liveSuggestions, filteredSuggestions).slice(0, 12));
        } catch (error) {
          console.warn('Customer live search unavailable; using cached suggestions only:', error);
        }
      } else {
        setSuggestions([]);
      }
      return;
    }

    setFormData(newFormData);
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
    
    if (field === 'vehicle_id' || field === 'rental_type') {
      if (newFormData.vehicle_id && newFormData.rental_type && !shouldPreserveFinancialTerms()) {
        await autoPopulateUnitPrice();
      }
    }
  };

  const handleResetAutoPrice = () => {
    preserveCreateFinancialOverrideRef.current = false;
  };

  const handleSuggestionClick = async (suggestion) => {
    isProgrammaticChange.current = true;
    
    try {
      const { data: customerData, error } = await supabase
        .from('app_4c3a7a6153_customers')
        .select('*')
        .eq('id', suggestion.id)
        .single();
      
      if (error) throw error;
      
      setFormData(prev => ({
        ...prev,
        customer_name: customerData.full_name || suggestion.name,
        customer_email: customerData.email || suggestion.email || '',
        customer_phone: customerData.phone || suggestion.phone || '',
        secondary_phone: customerData.secondary_phone || suggestion.secondary_phone || '',
        customer_licence_number: customerData.licence_number || suggestion.licence_number || '',
        customer_id: customerData.id || suggestion.id,
        customer_id_number: customerData.id_number || '',
        customer_dob: customerData.date_of_birth || '',
        customer_place_of_birth: customerData.place_of_birth || '',
        customer_nationality: customerData.nationality || '',
        customer_issue_date: customerData.issue_date || customerData.licence_issue_date || '',
        customer_id_image: customerData.id_scan_url || customerData.customer_id_image || null,
        customer_id_scan_history: Array.isArray(customerData.scan_metadata?.id_scan_history)
          ? customerData.scan_metadata.id_scan_history
          : [],
        customer_uploaded_images: customerData.extra_images ? 
          customerData.extra_images.map((url, index) => ({
            id: `existing_${index}`,
            url: url,
            name: `Existing Document ${index + 1}`,
            uploadedAt: customerData.updated_at || customerData.created_at
          })) : []
      }));
      
      setIsEmailDirty(false);
      setIsPhoneDirty(false);
      
      toast.success(`✅ ${tr('Customer', 'Client')} "${customerData.full_name}" ${tr('data loaded from database', 'chargé depuis la base de données')}`);
      
    } catch (error) {
      setFormData(prev => ({
        ...prev,
        customer_name: suggestion.name,
        customer_email: !isEmailDirty ? suggestion.email || '' : prev.customer_email,
        customer_phone: !isPhoneDirty ? suggestion.phone || '' : prev.customer_phone,
        secondary_phone: prev.secondary_phone || suggestion.secondary_phone || '',
        customer_licence_number: suggestion.licence_number || '',
        customer_id: suggestion.id || null,
      }));
      toast.info(tr('⚠️ Using cached customer data', '⚠️ Utilisation des données client en cache'));
    }
    
    setSuggestions([]);
  };

  useEffect(() => {
    const loadCustomerAlert = async () => {
      const customerId = formData.customer_id;
      if (!customerId) {
        setCustomerAlert(null);
        setShowCustomerAlertModal(false);
        return;
      }

      if (alertedCustomerIdsRef.current.has(customerId)) {
        return;
      }

      try {
        const { data, error } = await supabase
          .from('app_4c3a7a6153_customers')
          .select('id, full_name, scan_metadata')
          .eq('id', customerId)
          .maybeSingle();

        if (error) throw error;
        if (!data) {
          setCustomerAlert(null);
          setShowCustomerAlertModal(false);
          return;
        }

        const scanMetadata = data?.scan_metadata || {};
        if (scanMetadata.is_banned) {
          setCustomerAlert({
            type: 'banned',
            customerId: data.id,
            customerName: data.full_name || formData.customer_name,
            note: scanMetadata.ban_note || '',
            historyCount: Array.isArray(scanMetadata.staff_notes_history) ? scanMetadata.staff_notes_history.length : 0,
            isBanned: true,
          });
          setShowCustomerAlertModal(true);
        } else if (scanMetadata.show_admin_note_alert && scanMetadata.admin_note) {
          setCustomerAlert({
            type: 'internal_note',
            customerId: data.id,
            customerName: data.full_name || formData.customer_name,
            note: scanMetadata.admin_note,
            historyCount: Array.isArray(scanMetadata.staff_notes_history) ? scanMetadata.staff_notes_history.length : 0,
            isBanned: false,
          });
          setShowCustomerAlertModal(true);
        } else {
          setCustomerAlert(null);
          setShowCustomerAlertModal(false);
        }

        alertedCustomerIdsRef.current.add(customerId);
      } catch (error) {
        console.error('Failed to load customer alert note:', error);
      }
    };

    loadCustomerAlert();
  }, [formData.customer_id, formData.customer_name]);

  const isBannedCustomerBlocked = customerAlert?.type === 'banned' && Boolean(formData.customer_id);

  const handleFileUpload = async (field, fileOrUrl) => {
    if (!fileOrUrl) return;
    
    if (typeof fileOrUrl === 'string') {
      setFormData(prev => ({ ...prev, [field]: fileOrUrl }));
      toast.success(tr("ID image URL set!", "URL de l'image de la pièce définie !"));
      return;
    }
    
    const file = fileOrUrl;
    setLoading(true);
    try {
      const filePath = `${mode === 'edit' ? initialData?.id : 'new'}-${field}-${Date.now()}`;
      
      const { data, error: uploadError } = await supabase.storage
        .from('customer-documents')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false,
        });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage.from('customer-documents').getPublicUrl(data.path);

      setFormData(prev => ({ ...prev, [field]: publicUrl }));
      toast.success(tr('File uploaded successfully!', 'Fichier téléversé avec succès !'));
    } catch (err) {
      toast.error(tr('Failed to upload file', 'Impossible de téléverser le fichier'));
    } finally {
      setLoading(false);
    }
  };

  // ==================== ID SCAN HANDLERS ====================
  const handleCustomerSaved = async (savedCustomer, image = null) => {
    try {
      let customerData = savedCustomer;
      const customerId = savedCustomer.id || savedCustomer.customer_id;
      
      if (customerId) {
        const fetchResult = await enhancedUnifiedCustomerService.getCustomerById(customerId);
        
        if (fetchResult.success && fetchResult.data) {
          customerData = fetchResult.data;
        }
      }
      
      isProgrammaticChange.current = true;
      
      setFormData(prev => ({
        ...prev,
        customer_name: customerData.full_name || customerData.customer_name || customerData.raw_name || prev.customer_name,
        customer_email: customerData.email || customerData.customer_email || prev.customer_email,
        customer_phone: customerData.phone || customerData.customer_phone || prev.customer_phone,
        secondary_phone: customerData.secondary_phone || customerData.customer_secondary_phone || prev.secondary_phone,
        customer_id: customerData.id || customerData.customer_id,
        customer_licence_number: customerData.licence_number || customerData.document_number || prev.customer_licence_number,
        customer_id_number: customerData.id_number || customerData.document_number || prev.customer_id_number,
        customer_dob: customerData.date_of_birth || prev.customer_dob,
        customer_place_of_birth: customerData.place_of_birth || prev.customer_place_of_birth,
        customer_nationality: customerData.nationality || prev.customer_nationality,
        customer_issue_date: customerData.issue_date || customerData.licence_issue_date || prev.customer_issue_date,
        customer_id_image: customerData.customer_id_image || customerData.id_scan_url || image || prev.customer_id_image,
        customer_id_scan_history: Array.isArray(customerData.scan_metadata?.id_scan_history)
          ? customerData.scan_metadata.id_scan_history
          : prev.customer_id_scan_history
      }));
      
      setIsEmailDirty(false);
      setIsPhoneDirty(false);
      setCustomerScanNote('');
      
      const populatedFields = [];
      if (customerData.full_name) populatedFields.push(tr('Name', 'Nom'));
      if (customerData.date_of_birth) populatedFields.push(tr('Date of Birth', 'Date de naissance'));
      if (customerData.nationality) populatedFields.push(tr('Nationality', 'Nationalité'));
      if (customerData.place_of_birth) populatedFields.push(tr('Place of Birth', 'Lieu de naissance'));
      
      toast.success(`✅ ${tr('ID scan completed! Populated:', 'Scan de la pièce terminé ! Champs remplis :')} ${populatedFields.join(', ')}`);
      setSuccess(tr('✅ Customer information updated from ID scan!', "✅ Informations client mises à jour depuis le scan d'identité !"));
      
    } catch (error) {
      toast.error(tr('Failed to populate customer data from scan', "Impossible de remplir les données client à partir du scan"));
    }
  };

  const handleIDScanComplete = async (scannedData, imageFile) => {
    try {
      const isOcrSkipped = Boolean(scannedData?.ocrSkipped);
      const isOcrUnavailable = Boolean(scannedData?.ocrUnavailable);
      const captureMethod = scannedData?.ocrSkipped
        ? (scannedData?.uploadMethod === 'gallery' ? 'imported' : 'saved')
        : 'scanned';

      let savedCustomer = null;
      if (!isOcrSkipped) {
        try {
        savedCustomer = await saveCustomerFromScan(scannedData, imageFile);
        } catch (saveError) {
        }
      }

      setIsEmailDirty(false);
      setIsPhoneDirty(false);
      isProgrammaticChange.current = true;
      const resolvedCustomer = savedCustomer || await resolveExistingCustomerFromScan(scannedData);
      
      setFormData(prev => {
        const newState = {
          ...prev,
          customer_name:
            resolvedCustomer?.full_name ||
            resolvedCustomer?.customer_name ||
            scannedData.fullName ||
            scannedData.full_name ||
            scannedData.name ||
            scannedData.customer_name ||
            scannedData.raw_name ||
            prev.customer_name,
          customer_email:
            resolvedCustomer?.email ||
            resolvedCustomer?.customer_email ||
            scannedData.email ||
            scannedData.customer_email ||
            prev.customer_email,
          customer_phone:
            resolvedCustomer?.phone ||
            resolvedCustomer?.customer_phone ||
            scannedData.phone ||
            scannedData.customer_phone ||
            prev.customer_phone,
          secondary_phone:
            resolvedCustomer?.secondary_phone ||
            resolvedCustomer?.customer_secondary_phone ||
            scannedData.secondary_phone ||
            scannedData.customer_secondary_phone ||
            prev.secondary_phone,
          customer_licence_number:
            resolvedCustomer?.licence_number ||
            resolvedCustomer?.document_number ||
            scannedData.idNumber ||
            scannedData.document_number ||
            scannedData.licence_number ||
            scannedData.license_number ||
            scannedData.customer_licence_number ||
            prev.customer_licence_number,
          customer_id_number:
            resolvedCustomer?.id_number ||
            resolvedCustomer?.document_number ||
            scannedData.idNumber ||
            scannedData.id_number ||
            scannedData.customer_id_number ||
            scannedData.document_number ||
            prev.customer_id_number,
          customer_dob:
            resolvedCustomer?.date_of_birth ||
            scannedData.dateOfBirth ||
            scannedData.date_of_birth ||
            scannedData.dob ||
            scannedData.customer_dob ||
            prev.customer_dob,
          customer_place_of_birth:
            resolvedCustomer?.place_of_birth ||
            scannedData.placeOfBirth ||
            scannedData.place_of_birth ||
            scannedData.customer_place_of_birth ||
            prev.customer_place_of_birth,
          customer_nationality:
            resolvedCustomer?.nationality ||
            scannedData.nationality ||
            scannedData.customer_nationality ||
            prev.customer_nationality,
          customer_issue_date:
            resolvedCustomer?.issue_date ||
            resolvedCustomer?.licence_issue_date ||
            scannedData.issueDate ||
            scannedData.issue_date ||
            scannedData.customer_issue_date ||
            prev.customer_issue_date,
          customer_id_image:
            resolvedCustomer?.customer_id_image ||
            resolvedCustomer?.id_scan_url ||
            scannedData.imageUrl ||
            scannedData.id_scan_url ||
            scannedData.publicUrl ||
            imageFile ||
            scannedData.customer_id_image ||
            prev.customer_id_image,
          customer_id_capture_method: captureMethod,
          customer_id: resolvedCustomer?.id || scannedData.customer_id || prev.customer_id,
          customer_id_scan_history: Array.isArray(resolvedCustomer?.scan_metadata?.id_scan_history)
            ? resolvedCustomer.scan_metadata.id_scan_history
            : prev.customer_id_scan_history,
        };
        
        return newState;
      });

      setCustomerIdFileName(getCapturedIdFileName(scannedData, imageFile));
      setCustomerIdCaptureMethod(captureMethod);

      if (isOcrSkipped) {
        if (isLightVariant) {
          setLightCustomerEditOpen(true);
          setLightCustomerAdditionalOpen(false);
        }
        setCustomerScanNoteTone('success');
        setCustomerScanNote(tr('ID image saved. Enter the customer details manually.', "Image de la pièce enregistrée. Saisissez manuellement les détails du client."));
        toast.success(tr('ID image saved. Enter the customer details manually.', "Image de la pièce enregistrée. Saisissez manuellement les détails du client."));
        return;
      }

      if (isOcrUnavailable) {
        if (isLightVariant) {
          setLightCustomerEditOpen(true);
          setLightCustomerAdditionalOpen(false);
        }
        setCustomerScanNoteTone('warning');
        setCustomerScanNote(tr('OCR is unavailable right now. Please enter the customer name and license manually.', "L'OCR est indisponible pour le moment. Veuillez saisir manuellement le nom du client et le permis."));
        toast(tr('ID image captured. OCR is unavailable, so please enter the customer details manually.', "L'image de la pièce a été capturée. L'OCR est indisponible, veuillez donc saisir manuellement les détails du client."), {
          icon: '⚠️',
        });
        return;
      }

      setCustomerScanNoteTone('neutral');
      setCustomerScanNote('');
      const customerName = scannedData.full_name || scannedData.name || scannedData.customer_name || tr('Customer', 'Client');
      toast.success(`✅ ${tr('Primary customer', 'Client principal')} "${customerName}" ${tr('data updated from scan', 'mis à jour depuis le scan')}`);
      
    } catch (error) {
      toast.error(`${tr('Failed to process ID scan:', "Impossible de traiter le scan d'identité :")} ${error.message}`);
    }
  };

  const validateStep = async (step) => {
    const newErrors = {};
    
    if (step === 1) {
      if (!formData.customer_name.trim()) newErrors.customer_name = tr('Customer name is required', 'Le nom du client est requis');
      
      const phoneValue = formData.customer_phone || '';
      if (!phoneValue.trim()) {
        newErrors.customer_phone = tr('Phone number is required', 'Le numéro de téléphone est requis');
      } else {
        const cleanedPhone = phoneValue.replace(/[^\d+]/g, '');
        if (!cleanedPhone.startsWith('+')) {
          newErrors.customer_phone = tr('Phone number must include country code (e.g., +212)', 'Le numéro de téléphone doit inclure l’indicatif pays (ex. : +212)');
        } else if (cleanedPhone.length < 8) {
          newErrors.customer_phone = tr('Please enter a valid phone number', 'Veuillez saisir un numéro de téléphone valide');
        }
      }
      
      if (formData.customer_email && formData.customer_email.trim()) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(formData.customer_email.trim())) {
          newErrors.customer_email = tr('Please enter a valid email address', 'Veuillez saisir une adresse e-mail valide');
        }
      }
      
      if (requiresCustomerVerification && !formData.customer_licence_number?.trim()) {
        newErrors.customer_licence_number = tr("Driver's license number is required", 'Le numéro du permis de conduire est requis');
      }
      if (requiresCustomerVerification && !formData.customer_id_image) {
        newErrors.customer_id_image = tr('Please scan or import the customer ID before saving verification', "Veuillez scanner ou importer l'identité du client avant d'enregistrer la vérification");
      }
    } else if (step === 2) {
      if (!formData.vehicle_id) {
        newErrors.vehicle_id = tr('Vehicle selection is required', 'La sélection d’un véhicule est requise');
      } else {
        const vehicleIdStr = formData.vehicle_id;
        if (!vehicleIdStr) {
          newErrors.vehicle_id = tr('Please select a valid vehicle', 'Veuillez sélectionner un véhicule valide');
        }
      }
      
      if (!formData.rental_start_date) newErrors.rental_start_date = tr('Start date is required', 'La date de début est requise');
      if (!formData.rental_end_date) newErrors.rental_end_date = tr('End date is required', 'La date de fin est requise');
      
      if (formData.rental_start_date && formData.rental_end_date) {
        const start = composeDateTime(formData.rental_start_date, formData.rental_start_time);
        const end = composeDateTime(formData.rental_end_date, formData.rental_end_time);
        if (start && end && start >= end) {
          newErrors.rental_end_date = tr('End date must be after start date', 'La date de fin doit être postérieure à la date de début');
        }
      }

      if (formData.second_driver_name && !formData.second_driver_id_image) {
        newErrors.second_driver_id_image = tr('ID scan required for second driver', "Le scan de la pièce d'identité est requis pour le second conducteur");
        toast.error(tr('Please scan or upload ID for second driver', "Veuillez scanner ou téléverser la pièce d'identité du second conducteur"));
      }
      
      if (formData.second_driver_name && formData.customer_name) {
        const primaryName = formData.customer_name.toLowerCase().trim();
        const secondName = formData.second_driver_name.toLowerCase().trim();
        
        if (primaryName === secondName) {
          newErrors.second_driver_name = tr('Second driver cannot be the same as primary driver', 'Le second conducteur ne peut pas être identique au conducteur principal');
        }
        
        if (formData.customer_licence_number && formData.second_driver_license && 
            formData.customer_licence_number.trim() === formData.second_driver_license.trim()) {
          newErrors.second_driver_license = tr('License number cannot be same as primary driver', 'Le numéro du permis ne peut pas être identique à celui du conducteur principal');
        }
        
        if (formData.customer_id_number && formData.second_driver_id_number && 
            formData.customer_id_number.trim() === formData.second_driver_id_number.trim()) {
          newErrors.second_driver_id_number = tr('ID number cannot be same as primary driver', "Le numéro d'identité ne peut pas être identique à celui du conducteur principal");
        }
      }
    } else if (step === 3) {
      if (!formData.unit_price || formData.unit_price <= 0) newErrors.unit_price = tr('Unit price is required', "Le prix unitaire est requis");
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (successfullySubmitted) {
      return;
    }
    
    if (isSubmitting) {
      return;
    }

    if (isBannedCustomerBlocked) {
      setShowCustomerAlertModal(true);
      toast.error(tr('This customer is banned. An admin or owner must remove the ban before you can continue.', "Ce client est banni. Un administrateur ou le propriétaire doit lever le bannissement avant de continuer."));
      throw new Error(tr('Banned customer cannot be booked', 'Un client banni ne peut pas être réservé'));
    }
    
    setIsSubmitting(true);
    setSubmitting(true);
    setErrors({});
    
    try {
      const submissionReadyFormData = { ...formData };

      if (!submissionReadyFormData.rental_start_date || !submissionReadyFormData.rental_end_date) {
        throw new Error(tr('Please set both start and end dates in Step 2', "Veuillez définir les dates de début et de fin à l'étape 2"));
      }

      if (!submissionReadyFormData.rental_end_date && submissionReadyFormData.rental_start_date) {
        submissionReadyFormData.rental_end_date = submissionReadyFormData.rental_start_date;
      }

      const currentTime = getMoroccoCurrentTime();
      
      if (!submissionReadyFormData.rental_start_time) {
        submissionReadyFormData.rental_start_time = currentTime;
      }
      if (!submissionReadyFormData.rental_end_time) {
        submissionReadyFormData.rental_end_time = currentTime;
      }

      if (!submissionReadyFormData.customer_name || !submissionReadyFormData.customer_phone || 
          !submissionReadyFormData.vehicle_id || !submissionReadyFormData.rental_start_date || 
          !submissionReadyFormData.rental_end_date) {
        throw new Error(tr('Please fill in all required fields', 'Veuillez remplir tous les champs obligatoires'));
      }

      const vehicleIdStr = submissionReadyFormData.vehicle_id;
      if (!vehicleIdStr) {
        throw new Error(tr('Please select a valid vehicle', 'Veuillez sélectionner un véhicule valide'));
      }

      const trimmedEmail = (submissionReadyFormData.customer_email || '').trim();
      const emailToSubmit = trimmedEmail.length > 0 ? trimmedEmail : null;

      if (trimmedEmail.length > 0) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(trimmedEmail)) {
          throw new Error(tr('Please enter a valid email address or leave the email field empty.', 'Veuillez saisir une adresse e-mail valide ou laisser le champ e-mail vide.'));
        }
      }

      let finalCustomerId = String(submissionReadyFormData.customer_id || '').trim() || null;
      if (finalCustomerId && !isValidCustomerRecordId(finalCustomerId)) {
        console.warn('Invalid customer_id detected in rental submission; clearing stale value before customer resolution:', finalCustomerId);
        finalCustomerId = null;
      }
      const normalizedSubmissionIdentity = normalizeCustomerIdentityFields({
        licenceNumber: submissionReadyFormData.customer_licence_number,
        idNumber: submissionReadyFormData.customer_id_number,
      });
      const submissionLicenceNumber = normalizedSubmissionIdentity.licenceNumber?.trim();
      const submissionIdNumber = normalizedSubmissionIdentity.idNumber?.trim();
      const submissionPhoneNumber = submissionReadyFormData.customer_phone?.trim();
      const submissionEmailAddress = emailToSubmit?.trim();
      const submissionCustomerName = submissionReadyFormData.customer_name?.trim();
      const submissionCustomerDob = submissionReadyFormData.customer_dob?.trim();
      const organizationId = await getCurrentOrganizationId();

      const findExistingCustomerCandidatesForSubmission = async () => {
        const exactMatches = await enhancedUnifiedCustomerService.findMatchingCustomers({
          full_name: submissionCustomerName,
          phone: submissionPhoneNumber,
          email: submissionEmailAddress,
          licence_number: submissionLicenceNumber,
          id_number: submissionIdNumber,
        });
        return exactMatches || [];
      };

      const findExistingCustomerForSubmission = async () => {
        const exactMatches = await findExistingCustomerCandidatesForSubmission();
        const exactMatch =
          pickExactIdentityCustomerMatch({
            incomingCustomer: {
              full_name: submissionCustomerName,
              phone: submissionPhoneNumber,
              email: submissionEmailAddress,
              licence_number: submissionLicenceNumber,
              id_number: submissionIdNumber,
            },
            candidates: exactMatches,
          }) ||
          pickMostCompleteCustomerProfile(exactMatches);
        if (exactMatch?.id) return exactMatch;

        if (submissionCustomerName) {
          const bestMatch = pickBestExistingCustomerMatch({
            incomingCustomer: {
              full_name: submissionCustomerName,
              phone: submissionPhoneNumber,
              date_of_birth: submissionCustomerDob,
              licence_number: submissionLicenceNumber,
              id_number: submissionIdNumber,
              nationality: submissionReadyFormData.customer_nationality,
              email: emailToSubmit,
            },
            candidates: exactMatches || [],
          });
          if (bestMatch?.id) return bestMatch;
        }

        return null;
      };

      const findExistingCustomerForVerificationUpdate = async (currentCustomerId) => {
        const currentId = String(currentCustomerId || '').trim();
        const exactMatches = await findExistingCustomerCandidatesForSubmission();
        const alternateMatches = (exactMatches || []).filter(
          (customer) => String(customer?.id || '').trim() !== currentId
        );

        const alternateExactMatch =
          pickExactIdentityCustomerMatch({
            incomingCustomer: {
              full_name: submissionCustomerName,
              phone: submissionPhoneNumber,
              email: emailToSubmit,
              licence_number: submissionLicenceNumber,
              id_number: submissionIdNumber,
            },
            candidates: alternateMatches,
          }) ||
          pickMostCompleteCustomerProfile(alternateMatches);
        if (alternateExactMatch?.id) return alternateExactMatch;

        const alternateBestMatch = submissionCustomerName
          ? pickBestExistingCustomerMatch({
              incomingCustomer: {
                full_name: submissionCustomerName,
                phone: submissionPhoneNumber,
                date_of_birth: submissionCustomerDob,
                licence_number: submissionLicenceNumber,
                id_number: submissionIdNumber,
                nationality: submissionReadyFormData.customer_nationality,
                email: emailToSubmit,
              },
              candidates: alternateMatches,
            })
          : null;

        if (alternateBestMatch?.id) return alternateBestMatch;
        return null;
      };

      const normalizeDocumentImageUrl = (value) => {
        if (!value) return '';
        if (typeof value === 'string') return value.trim();
        if (typeof value === 'object') {
          return String(value.url || value.public_url || value.publicUrl || value.path || '').trim();
        }
        return '';
      };

      const secondIdImageUrls = [
        submissionReadyFormData.second_driver_id_image,
        ...(Array.isArray(submissionReadyFormData.second_driver_uploaded_images)
          ? submissionReadyFormData.second_driver_uploaded_images
          : []),
        ...secondDrivers.flatMap((driver) => [
          driver?.id_scan_url,
          driver?.customer_id_image,
          driver?.id_image,
          ...(Array.isArray(driver?.uploaded_images) ? driver.uploaded_images : []),
          ...(Array.isArray(driver?.extra_images) ? driver.extra_images : []),
        ]),
      ]
        .map(normalizeDocumentImageUrl)
        .filter(Boolean);
      const uniqueSecondIdImageUrls = [...new Set(secondIdImageUrls)];
      
      if (!finalCustomerId) {
        const preMatchedCustomer = await findExistingCustomerForSubmission();
        if (preMatchedCustomer?.id) {
          finalCustomerId = preMatchedCustomer.id;
        }

        const customerScanHistory = Array.isArray(formData.customer_id_scan_history)
          ? [...new Set(formData.customer_id_scan_history.map((url) => String(url || '').trim()).filter(Boolean))]
          : [];
        const normalizedIdentity = normalizeCustomerIdentityFields({
          licenceNumber: submissionReadyFormData.customer_licence_number,
          idNumber: submissionReadyFormData.customer_id_number,
        });
        if (!finalCustomerId) {
          const newCustomerId = generateCustomerId();
          const newCustomerData = {
            id: newCustomerId,
            full_name: submissionReadyFormData.customer_name,
            customer_name: submissionReadyFormData.customer_name,
            phone: submissionReadyFormData.customer_phone,
            customer_phone: submissionReadyFormData.customer_phone,
            secondary_phone: submissionReadyFormData.secondary_phone || null,
            email: emailToSubmit,
            customer_email: emailToSubmit,
            licence_number: normalizedIdentity.licenceNumber,
            customer_licence_number: normalizedIdentity.licenceNumber,
            id_number: normalizedIdentity.idNumber,
            customer_id_number: normalizedIdentity.idNumber,
            date_of_birth: submissionReadyFormData.customer_dob || null,
            customer_dob: submissionReadyFormData.customer_dob || null,
            nationality: submissionReadyFormData.customer_nationality || null,
            customer_nationality: submissionReadyFormData.customer_nationality || null,
            place_of_birth: submissionReadyFormData.customer_place_of_birth || null,
            customer_place_of_birth: submissionReadyFormData.customer_place_of_birth || null,
            id_scan_url: submissionReadyFormData.customer_id_image || null,
            scan_metadata: customerScanHistory.length > 0
              ? { id_scan_history: customerScanHistory }
              : {},
            extra_images: (formData.customer_uploaded_images || [])
              .map(img => img.url)
              .filter(url => url && url.trim() !== ''),
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          };
          
          const { data: insertedCustomer, error: insertError } = await supabase
            .from('app_4c3a7a6153_customers')
            .insert([applyOrganizationMatch(newCustomerData, organizationId)])
            .select()
            .single();
          
          if (insertError) {
            const existingCustomer = await findExistingCustomerForSubmission();
            
            if (existingCustomer?.id) {
              finalCustomerId = existingCustomer.id;
            } else {
              const recoveredCustomerResult = await enhancedUnifiedCustomerService.saveCustomer(newCustomerData);
              if (recoveredCustomerResult?.success && recoveredCustomerResult?.data?.id) {
                finalCustomerId = recoveredCustomerResult.data.id;
              } else {
                throw new Error(`${tr('Failed to create new customer:', 'Impossible de créer un nouveau client :')} ${insertError.message}`);
              }
            }
          } else {
            finalCustomerId = insertedCustomer.id;
          }
        }
      } else {
        const { data: existingCustomer, error: checkError } = await supabase
          .from('app_4c3a7a6153_customers')
          .select('id, id_scan_url, scan_metadata')
          .eq('id', finalCustomerId)
          .maybeSingle();

        if (checkError || !existingCustomer) {
          const normalizedIdentity = normalizeCustomerIdentityFields({
            licenceNumber: submissionReadyFormData.customer_licence_number,
            idNumber: submissionReadyFormData.customer_id_number,
          });
          // Customer ID was pre-generated (e.g. from ID scan) but not yet saved — create it now
          const { data: createdCustomer, error: createError } = await supabase
            .from('app_4c3a7a6153_customers')
            .insert([applyOrganizationMatch({
              id: finalCustomerId,
              full_name: submissionReadyFormData.customer_name,
              phone: submissionReadyFormData.customer_phone,
              secondary_phone: submissionReadyFormData.secondary_phone || null,
              email: emailToSubmit,
              licence_number: normalizedIdentity.licenceNumber,
              id_number: normalizedIdentity.idNumber,
              date_of_birth: submissionReadyFormData.customer_dob || null,
              nationality: submissionReadyFormData.customer_nationality || null,
              place_of_birth: submissionReadyFormData.customer_place_of_birth || null,
              id_scan_url: submissionReadyFormData.customer_id_image || null,
              scan_metadata: Array.isArray(formData.customer_id_scan_history) && formData.customer_id_scan_history.length > 0
                ? {
                    id_scan_history: [...new Set(formData.customer_id_scan_history.map((url) => String(url || '').trim()).filter(Boolean))]
              }
                : {},
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            }, organizationId)])
            .select()
            .single();

          if (createError || !createdCustomer) {
            const existingCustomer = await findExistingCustomerForSubmission();
            if (existingCustomer?.id) {
              finalCustomerId = existingCustomer.id;
            } else {
              throw new Error(`${tr('Failed to create customer:', 'Impossible de créer le client :')} ${createError?.message || tr('Unknown error', 'Erreur inconnue')}`);
            }
          } else {
            finalCustomerId = createdCustomer.id;
          }
        }

        const localScanHistory = Array.isArray(formData.customer_id_scan_history)
          ? formData.customer_id_scan_history.map((url) => String(url || '').trim()).filter(Boolean)
          : [];
        const existingScanHistory = Array.isArray(existingCustomer?.scan_metadata?.id_scan_history)
          ? existingCustomer.scan_metadata.id_scan_history.map((url) => String(url || '').trim()).filter(Boolean)
          : [];
        const mergedScanHistory = [
          ...new Set(
            [
              ...existingScanHistory,
              ...localScanHistory,
            ].filter((url) => url && url !== (existingCustomer?.id_scan_url || submissionReadyFormData.customer_id_image || '').trim())
          ),
        ];

        if (mergedScanHistory.length > 0) {
          const { error: scanHistoryUpdateError } = await supabase
            .from('app_4c3a7a6153_customers')
            .update({
              secondary_phone: submissionReadyFormData.secondary_phone || null,
              scan_metadata: {
                ...(existingCustomer?.scan_metadata || {}),
                id_scan_history: mergedScanHistory,
              },
              updated_at: new Date().toISOString(),
            })
            .eq('id', finalCustomerId);

          if (scanHistoryUpdateError) {
            console.warn('Failed to persist customer ID scan history during rental submit:', scanHistoryUpdateError);
          }
        } else {
          const { error: secondaryPhoneUpdateError } = await supabase
            .from('app_4c3a7a6153_customers')
            .update({
              secondary_phone: submissionReadyFormData.secondary_phone || null,
              updated_at: new Date().toISOString(),
            })
            .eq('id', finalCustomerId);

          if (secondaryPhoneUpdateError) {
            console.warn('Failed to persist customer secondary phone during rental submit:', secondaryPhoneUpdateError);
          }
        }
      }
      
      if (formData.customer_uploaded_images && formData.customer_uploaded_images.length > 0 && finalCustomerId) {
        const extraImageUrls = formData.customer_uploaded_images
          .map(img => img.url)
          .filter(url => url && url.trim() !== '');
        
        if (extraImageUrls.length > 0) {
          const { data: customerData } = await supabase
            .from('app_4c3a7a6153_customers')
            .select('extra_images')
            .eq('id', finalCustomerId)
            .single();
          
          const existingImages = customerData?.extra_images || [];
          const allImages = [...new Set([...existingImages, ...extraImageUrls])];
          
          const { error: updateError } = await supabase
            .from('app_4c3a7a6153_customers')
            .update({ 
              extra_images: allImages,
              updated_at: new Date().toISOString()
            })
            .eq('id', finalCustomerId);
          
          if (updateError) {
          }
        }
      }

      if (isLightVariant && uniqueSecondIdImageUrls.length > 0 && finalCustomerId) {
        const { data: existingCustomerMedia, error: existingCustomerMediaError } = await supabase
          .from('app_4c3a7a6153_customers')
          .select('extra_images, scan_metadata, id_scan_url, customer_id_image')
          .eq('id', finalCustomerId)
          .maybeSingle();

        if (existingCustomerMediaError) {
          console.warn('Failed to load customer media before saving second ID images:', existingCustomerMediaError);
        } else {
          const existingExtraImageUrls = Array.isArray(existingCustomerMedia?.extra_images)
            ? existingCustomerMedia.extra_images.map(normalizeDocumentImageUrl).filter(Boolean)
            : [];
          const existingSecondaryIdHistory = Array.isArray(existingCustomerMedia?.scan_metadata?.second_driver_id_history)
            ? existingCustomerMedia.scan_metadata.second_driver_id_history.map(normalizeDocumentImageUrl).filter(Boolean)
            : [];
          const primaryIdUrls = new Set(
            [
              existingCustomerMedia?.id_scan_url,
              existingCustomerMedia?.customer_id_image,
              submissionReadyFormData.customer_id_image,
            ]
              .map(normalizeDocumentImageUrl)
              .filter(Boolean)
          );
          const secondIdHistoryUrls = uniqueSecondIdImageUrls.filter((url) => !primaryIdUrls.has(url));

          const { error: secondIdMediaUpdateError } = await supabase
            .from('app_4c3a7a6153_customers')
            .update({
              extra_images: [...new Set([...existingExtraImageUrls, ...uniqueSecondIdImageUrls])],
              scan_metadata: {
                ...(existingCustomerMedia?.scan_metadata || {}),
                second_driver_id_history: [...new Set([...existingSecondaryIdHistory, ...secondIdHistoryUrls])],
              },
              updated_at: new Date().toISOString(),
            })
            .eq('id', finalCustomerId);

          if (secondIdMediaUpdateError) {
            console.warn('Failed to persist second ID images to customer profile:', secondIdMediaUpdateError);
          }
        }
      }

      if (isCustomerVerificationOnlyMode && initialData?.id) {
        const conflictingExistingCustomer = await findExistingCustomerForVerificationUpdate(finalCustomerId);
        if (conflictingExistingCustomer?.id) {
          finalCustomerId = conflictingExistingCustomer.id;
        }

        const verificationCustomerPayload = {
          full_name: submissionReadyFormData.customer_name,
          phone: submissionReadyFormData.customer_phone,
          secondary_phone: submissionReadyFormData.secondary_phone || null,
          email: emailToSubmit,
          licence_number: submissionReadyFormData.customer_licence_number || null,
          id_number: submissionReadyFormData.customer_id_number || null,
          date_of_birth: submissionReadyFormData.customer_dob || null,
          nationality: submissionReadyFormData.customer_nationality || null,
          place_of_birth: submissionReadyFormData.customer_place_of_birth || null,
          id_scan_url: submissionReadyFormData.customer_id_image || null,
          scan_metadata: Array.isArray(formData.customer_id_scan_history) && formData.customer_id_scan_history.length > 0
            ? {
                id_scan_history: [...new Set(formData.customer_id_scan_history.map((url) => String(url || '').trim()).filter(Boolean))]
              }
            : undefined,
          updated_at: new Date().toISOString(),
        };

        const isDuplicateCustomerIdentityError = (error) =>
          error?.code === '23505' ||
          String(error?.message || '').includes('ux_customers_person_key');

        const upsertVerificationCustomerIntoResolvedProfile = async (targetCustomerId) => {
          const sanitizedPayload = Object.fromEntries(
            Object.entries(verificationCustomerPayload).filter(([, value]) => value !== undefined)
          );
          return updateCustomerById(targetCustomerId, sanitizedPayload, '*');
        };

        const { error: verificationCustomerError } = await supabase
          .from('app_4c3a7a6153_customers')
          .update(verificationCustomerPayload)
          .eq('id', finalCustomerId);

        if (verificationCustomerError) {
          if (isDuplicateCustomerIdentityError(verificationCustomerError)) {
            const conflictingRetryCustomer = await findExistingCustomerForVerificationUpdate(finalCustomerId);
            if (conflictingRetryCustomer?.id) {
              finalCustomerId = conflictingRetryCustomer.id;

              let retryVerificationCustomerError = null;
              try {
                await upsertVerificationCustomerIntoResolvedProfile(finalCustomerId);
              } catch (retryError) {
                retryVerificationCustomerError = retryError;
              }

              if (!retryVerificationCustomerError) {
                const verificationRentalPayload = {
                  customer_id: finalCustomerId,
                  customer_name: submissionReadyFormData.customer_name,
                  customer_email: emailToSubmit,
                  customer_phone: submissionReadyFormData.customer_phone,
                  customer_licence_number: submissionReadyFormData.customer_licence_number || null,
                  customer_id_number: submissionReadyFormData.customer_id_number || null,
                  customer_dob: submissionReadyFormData.customer_dob || null,
                  customer_place_of_birth: submissionReadyFormData.customer_place_of_birth || null,
                  customer_nationality: submissionReadyFormData.customer_nationality || null,
                  customer_issue_date: submissionReadyFormData.customer_issue_date || null,
                  customer_id_image: submissionReadyFormData.customer_id_image || null,
                };

                const { data: verifiedRental, error: verificationRentalError } = await supabase
                  .from('app_4c3a7a6153_rentals')
                  .update(verificationRentalPayload)
                  .eq('id', initialData.id)
                  .select('*')
                  .single();

                if (verificationRentalError) {
                  throw new Error(`${tr('Failed to save customer verification to the rental:', 'Impossible d’enregistrer la vérification du client sur la location :')} ${verificationRentalError.message}`);
                }

                setSuccessfullySubmitted(true);
                setErrors({});
                toast.success(tr('Customer verification saved successfully.', 'Vérification du client enregistrée avec succès.'));

                return { result: verifiedRental, rentalId: verifiedRental.id };
              }
            }
          }

          throw new Error(`${tr('Failed to update customer verification data:', 'Impossible de mettre à jour les données de vérification du client :')} ${verificationCustomerError.message}`);
        }

        const verificationRentalPayload = {
          customer_id: finalCustomerId,
          customer_name: submissionReadyFormData.customer_name,
          customer_email: emailToSubmit,
          customer_phone: submissionReadyFormData.customer_phone,
          customer_licence_number: submissionReadyFormData.customer_licence_number || null,
          customer_id_number: submissionReadyFormData.customer_id_number || null,
          customer_dob: submissionReadyFormData.customer_dob || null,
          customer_place_of_birth: submissionReadyFormData.customer_place_of_birth || null,
          customer_nationality: submissionReadyFormData.customer_nationality || null,
          customer_issue_date: submissionReadyFormData.customer_issue_date || null,
          customer_id_image: submissionReadyFormData.customer_id_image || null,
        };

        const { data: verifiedRental, error: verificationRentalError } = await supabase
          .from('app_4c3a7a6153_rentals')
          .update(verificationRentalPayload)
          .eq('id', initialData.id)
          .select('*')
          .single();

        if (verificationRentalError) {
          throw new Error(`${tr('Failed to save customer verification to the rental:', 'Impossible d’enregistrer la vérification du client sur la location :')} ${verificationRentalError.message}`);
        }

        setSuccessfullySubmitted(true);
        setErrors({});
        toast.success(tr('Customer verification saved successfully.', 'Vérification du client enregistrée avec succès.'));

        return { result: verifiedRental, rentalId: verifiedRental.id };
      }
      
      const snapshotVehicle =
        availableVehicles.find((vehicle) => String(vehicle.id) === String(submissionReadyFormData.vehicle_id)) ||
        null;

      const submissionData = {
        customer_name: submissionReadyFormData.customer_name,
        customer_email: emailToSubmit,
        customer_phone: submissionReadyFormData.customer_phone,
        customer_id: finalCustomerId,
        created_by:
          mode === 'edit'
            ? (initialData?.created_by ?? null)
            : (userProfile?.id || null),
        created_by_name:
          mode === 'edit'
            ? (initialData?.created_by_name ?? null)
            : (userProfile?.fullName || userProfile?.email || null),
        customer_licence_number: submissionReadyFormData.customer_licence_number || null,
        vehicle_id: submissionReadyFormData.vehicle_id || null,
        vehicle_plate_number:
          mode === 'edit'
            ? (initialData?.vehicle_plate_number ?? snapshotVehicle?.plate_number ?? null)
            : (snapshotVehicle?.plate_number || null),
        selected_vehicle_id_snapshot:
          mode === 'edit'
            ? (initialData?.selected_vehicle_id_snapshot ?? initialData?.vehicle_id ?? null)
            : (snapshotVehicle?.id ?? submissionReadyFormData.vehicle_id ?? null),
        selected_vehicle_plate_snapshot:
          mode === 'edit'
            ? (initialData?.selected_vehicle_plate_snapshot ?? initialData?.vehicle_plate_number ?? null)
            : (snapshotVehicle?.plate_number || null),
        selected_vehicle_model_snapshot:
          mode === 'edit'
            ? (initialData?.selected_vehicle_model_snapshot ?? null)
            : (snapshotVehicle?.model || snapshotVehicle?.name || null),
        selected_vehicle_selected_by:
          mode === 'edit'
            ? (initialData?.selected_vehicle_selected_by ?? initialData?.created_by ?? null)
            : (userProfile?.id || null),
        selected_vehicle_selected_at:
          mode === 'edit'
            ? (initialData?.selected_vehicle_selected_at ?? initialData?.created_at ?? null)
            : new Date().toISOString(),
        rental_type: submissionReadyFormData.rental_type,
        rental_start_date: composeDateTime(formData.rental_start_date, formData.rental_start_time)?.toISOString(),
        rental_end_date: composeDateTime(formData.rental_end_date, formData.rental_end_time)?.toISOString(),
        rental_start_time: formData.rental_start_time || submissionReadyFormData.rental_start_time || '00:00',
        rental_end_time: formData.rental_end_time || submissionReadyFormData.rental_end_time || '23:59',
        pickup_location: submissionReadyFormData.pickup_location || 'Office',
        dropoff_location: submissionReadyFormData.dropoff_location || 'Office',
        pickup_transport: submissionReadyFormData.pickup_transport || false,
        dropoff_transport: submissionReadyFormData.dropoff_transport || false,
        quantity_days: Number(submissionReadyFormData.quantity_days) || 0,
        quantity_hours:
          submissionReadyFormData.rental_type === 'hourly'
            ? (Number(submissionReadyFormData.quantity_hours ?? submissionReadyFormData.quantity_days) || 0)
            : null,
        unit_price: Number(submissionReadyFormData.unit_price) || 0,
        transport_fee: Number(submissionReadyFormData.transport_fee) || 0,
        total_amount: Number(submissionReadyFormData.total_amount) || 0,
        deposit_amount: Number(submissionReadyFormData.deposit_amount) || 0,
        damage_deposit: Number(submissionReadyFormData.damage_deposit) || 0,
        damage_deposit_source: submissionReadyFormData.damage_deposit_source || null,
        damage_deposit_document_url: submissionReadyFormData.damage_deposit_document_url || null,
        damage_deposit_document_name: submissionReadyFormData.damage_deposit_document_name || null,
        remaining_amount: Number(submissionReadyFormData.remaining_amount) || 0,
        payment_status: submissionReadyFormData.payment_status || 'unpaid',
        rental_status: submissionReadyFormData.rental_status || 'scheduled',
        insurance_included: submissionReadyFormData.insurance_included !== false,
        helmet_included: submissionReadyFormData.helmet_included !== false,
        gear_included: submissionReadyFormData.gear_included || false,
        contract_signed: submissionReadyFormData.contract_signed || false,
        accessories: submissionReadyFormData.accessories || null,
        signature_url: submissionReadyFormData.signature_url || null,
        approval_status: submissionReadyFormData.approval_status || 'auto',
        pending_total_request: submissionReadyFormData.pending_total_request || null,
        customer_id_number: submissionReadyFormData.customer_id_number || null,
        customer_dob: submissionReadyFormData.customer_dob || null,
        customer_place_of_birth: submissionReadyFormData.customer_place_of_birth || null,
        customer_nationality: submissionReadyFormData.customer_nationality || null,
        customer_issue_date: submissionReadyFormData.customer_issue_date || null,
        customer_id_image: submissionReadyFormData.customer_id_image || null,
        fuel_charge_enabled: fuelChargeEnabled,
        fuel_charge: 0,
        // ✅ CRITICAL FIX: Add package_id to the submission data
        package_id: submissionReadyFormData.selected_package_id || null,
        package_name: submissionReadyFormData.selected_package_name || null,
        package_rate_per_unit: submissionReadyFormData.selected_package_rate_per_unit || 0,
        package_included_km_per_unit: submissionReadyFormData.selected_package_included_km_per_unit || null,
        package_total_included_km:
          submissionReadyFormData.selected_package_total_included_km ||
          calculatePackageTotalIncludedKm(
            submissionReadyFormData.selected_package_included_km_per_unit,
            submissionReadyFormData.rental_type === 'hourly'
              ? (submissionReadyFormData.quantity_hours ?? submissionReadyFormData.quantity_days)
              : submissionReadyFormData.quantity_days,
            submissionReadyFormData.selected_package_duration_units ?? submissionReadyFormData.package_duration_units ?? 1
          ),
        package_extra_rate: submissionReadyFormData.selected_package_extra_rate || 0,
        use_package_pricing: submissionReadyFormData.use_package_pricing || false,
      };

      if (submissionData.use_package_pricing) {
        const packageRatePerUnit =
          Number(submissionReadyFormData.selected_package_rate_per_unit) ||
          Number(submissionReadyFormData.selected_package_fixed_amount) ||
          Number(submissionData.package_rate_per_unit) ||
          Number(submissionData.unit_price) ||
          0;
        const packageDurationUnits = Number(
          submissionData.rental_type === 'hourly'
            ? (submissionData.quantity_hours ?? submissionData.quantity_days)
            : submissionData.quantity_days
        ) || 0;
        const selectedPackageDurationUnits = Number(
          submissionReadyFormData.selected_package_duration_units
          ?? submissionReadyFormData.package_duration_units
          ?? 1
        ) || 1;
        const packageSubtotal =
          packageRatePerUnit > 0 && packageDurationUnits > 0
            ? packageRatePerUnit * getPackageBillingMultiplier(packageDurationUnits, selectedPackageDurationUnits)
            : Number(submissionData.total_amount) || 0;
        const transportTotal = Number(submissionData.transport_fee) || 0;
        const totalAmount = packageSubtotal + transportTotal;
        const depositAmount = Number(submissionData.deposit_amount) || 0;

        submissionData.unit_price = packageRatePerUnit;
        submissionData.package_rate_per_unit = packageRatePerUnit;
        submissionData.total_amount = totalAmount;
        submissionData.remaining_amount = Math.max(0, totalAmount - depositAmount);
      }

      if (isCustomerVerificationOnlyMode && initialData) {
        const preservedFields = [
          'vehicle_id',
          'vehicle_plate_number',
          'selected_vehicle_id_snapshot',
          'selected_vehicle_plate_snapshot',
          'selected_vehicle_model_snapshot',
          'selected_vehicle_selected_by',
          'selected_vehicle_selected_at',
          'rental_type',
          'rental_start_date',
          'rental_end_date',
          'rental_start_time',
          'rental_end_time',
          'pickup_location',
          'dropoff_location',
          'pickup_transport',
          'dropoff_transport',
          'quantity_days',
          'quantity_hours',
          'unit_price',
          'transport_fee',
          'total_amount',
          'deposit_amount',
          'damage_deposit',
          'damage_deposit_source',
          'damage_deposit_document_url',
          'damage_deposit_document_name',
          'remaining_amount',
          'payment_status',
          'rental_status',
          'insurance_included',
          'helmet_included',
          'gear_included',
          'contract_signed',
          'accessories',
          'signature_url',
          'approval_status',
          'pending_total_request',
          'fuel_charge_enabled',
          'fuel_charge',
          'package_id',
          'package_name',
          'package_rate_per_unit',
          'package_included_km_per_unit',
          'package_total_included_km',
          'package_extra_rate',
          'use_package_pricing',
        ];

        preservedFields.forEach((field) => {
          if (Object.prototype.hasOwnProperty.call(initialData, field)) {
            submissionData[field] = initialData[field];
          }
        });
      }

      if (mode === 'edit' && initialData?.id && !isCustomerVerificationOnlyMode && hasEditWorkflowChanges(submissionData, initialData)) {
        Object.assign(submissionData, getEditWorkflowResetFields(submissionData, initialData));
      }
      
      console.log('📦 Submitting rental with package:', {
        package_id: submissionData.package_id,
        selected_package_id: submissionReadyFormData.selected_package_id,
        package_name: submissionReadyFormData.selected_package_name,
        unit_price: submissionData.unit_price,
        quantity_days: submissionData.quantity_days
      });
      
      if (!isCustomerVerificationOnlyMode) {
        const manualPrice = parseFloat(submissionData.unit_price) || 0;
        const autoPrice = parseFloat(autoCalculatedPrice) || 0;
        const isPriceOverride = manualPrice !== autoPrice;
        const canAutoApprovePrice = canEditRentalPrice(userProfile);

        if (isPriceOverride) {
          if (!canAutoApprovePrice) {
            const originalSubtotal = pricingComputationMode === 'flat_total'
              ? autoPrice
              : (submissionData.quantity_days || 0) * autoPrice;
            const originalTotal = originalSubtotal + (submissionData.transport_fee || 0);
            
            submissionData.approval_status = 'pending';
            submissionData.pending_total_request = submissionData.total_amount;
            submissionData.total_amount = originalTotal;
            submissionData.remaining_amount = originalTotal - (submissionData.deposit_amount || 0);
          } else {
            submissionData.approval_status = 'approved';
            submissionData.pending_total_request = null;
          }
        } else {
          submissionData.approval_status = 'auto';
          submissionData.pending_total_request = null;
        }
      }

      const normalizedTotalAmount = Math.max(0, Number(submissionData.total_amount) || 0);
      const normalizedDepositAmount = Math.max(0, Number(submissionData.deposit_amount) || 0);
      const normalizedPaymentStatus = String(submissionData.payment_status || '').toLowerCase();

      if (normalizedPaymentStatus === 'paid') {
        submissionData.deposit_amount = normalizedTotalAmount;
        submissionData.remaining_amount = 0;
      } else if (normalizedPaymentStatus === 'unpaid') {
        submissionData.deposit_amount = 0;
        submissionData.remaining_amount = normalizedTotalAmount;
      } else {
        const boundedDepositAmount = Math.min(normalizedDepositAmount, normalizedTotalAmount);
        submissionData.deposit_amount = boundedDepositAmount;
        submissionData.remaining_amount = Math.max(0, normalizedTotalAmount - boundedDepositAmount);
      }

      const cleanRentalData = { ...submissionData };
      const secondDriverFieldPatterns = ['second_driver', 'secondDriver', 'secondary_driver'];
      
      Object.keys(cleanRentalData).forEach(key => {
        secondDriverFieldPatterns.forEach(pattern => {
          if (key.toLowerCase().includes(pattern.toLowerCase())) {
            delete cleanRentalData[key];
          }
        });
      });

      let result;
      if (mode === 'edit' && initialData?.id) {
        result = await TransactionalRentalService.updateRental({
          ...cleanRentalData,
          id: initialData.id
        });
      } else {
        result = await TransactionalRentalService.createRentalWithTransactionalCustomerCreation(cleanRentalData);
      }
      
      if (result && result.success) {
        const rentalId = result.data.id;
        const redirectUrl = isLightVariant
          ? `/admin/rentals/${rentalId}?view=light#ready-to-start`
          : `/admin/rentals/${rentalId}`;
        const successPayload = {
          ...result.data,
          __uiVariant: options.variant || 'default',
          __redirectUrl: redirectUrl,
        };

        setSuccessRedirectUrl(redirectUrl);
        setSuccessfullySubmitted(true);
        setErrors({});

        if (mode === 'edit' && initialData?.id && !isCustomerVerificationOnlyMode && rentalId) {
          try {
            await supabase
              .from('app_2f7bf469b0_rental_media')
              .delete()
              .eq('rental_id', rentalId)
              .eq('phase', 'out');
          } catch (openingMediaResetError) {
            console.error('❌ Failed to reset opening media after rental edit:', openingMediaResetError);
          }
        }
        
        const invalidDrivers = secondDrivers.filter(driver => {
          const licenceNum = driver.licence_number || driver.license;
          const idNum = driver.id_number;
          const docNum = driver.document_number;
          return !licenceNum && !idNum && !docNum;
        });

        const validSecondDrivers = secondDrivers.filter(driver => {
          const licenceNum = (driver.licence_number || driver.license || '').toString().trim();
          const idNum = (driver.id_number || '').toString().trim();
          const docNum = (driver.document_number || '').toString().trim();
          const hasValidId = licenceNum || idNum || docNum;
          const hasName = (driver.full_name || driver.name || '').toString().trim();
          return hasValidId && hasName;
        });

        if (validSecondDrivers.length > 0) {
          const secondDriverPromises = validSecondDrivers.map(async (driver) => {
            const secondDriverData = {
              rental_id: rentalId,
              full_name: driver.full_name || driver.name,
              phone: driver.phone || null,
              email: driver.email || null,
              licence_number: (driver.licence_number || driver.license || '').toString().trim() || null,
              id_number: (driver.id_number || '').toString().trim() || null,
              document_number: (driver.document_number || '').toString().trim() || null,
              document_type: driver.document_type || 'Driving License',
              date_of_birth: driver.date_of_birth || null,
              nationality: driver.nationality || null,
              place_of_birth: driver.place_of_birth || null,
              gender: driver.gender || null,
              id_scan_url: driver.id_scan_url || null,
              customer_id_image: driver.customer_id_image || driver.id_image || null,
              uploaded_images: driver.uploaded_images || [],
              extra_images: driver.extra_images || [],
              scan_confidence: driver.scan_confidence || 0.95,
              document_type_scanned: driver.document_type_scanned || null,
              country_scanned: driver.country_scanned || null,
              raw_name_scanned: driver.raw_name_scanned || null,
              given_name_scanned: driver.given_name_scanned || null,
              family_name_scanned: driver.family_name_scanned || null,
              initial_scan_complete: driver.initial_scan_complete || false,
              last_scan_at: driver.last_scan_at || null,
              scan_metadata: typeof driver.scan_metadata === 'string' ? driver.scan_metadata : JSON.stringify(driver.scan_metadata || {}),
              is_active: driver.is_active !== false,
              created_by: userProfile?.id || null,
              created_at: new Date().toISOString()
            };
            
            const { data, error } = await supabase
              .from('app_4c3a7a6153_rental_second_drivers')
              .insert([secondDriverData])
              .select()
              .single();
            
            if (error) {
              return { success: false, error, driverName: driver.full_name };
            }
            
            return { success: true, data, driverName: driver.full_name };
          });
          
          const results = await Promise.allSettled(secondDriverPromises);
          
          const successful = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
          const failed = results.filter(r => r.status === 'rejected' || (r.status === 'fulfilled' && !r.value.success)).length;
          
          if (failed === 0) {
            toast.success(`✅ ${successful} ${tr('second driver(s) saved', 'second conducteur(s) enregistré(s)')}`);
          } else if (successful > 0) {
            toast.warning(`⚠️ ${successful} ${tr('second driver(s) saved,', 'second conducteur(s) enregistré(s),')} ${failed} ${tr('failed', 'échoué(s)')}`);
          } else {
            toast.error(`❌ ${tr('Failed to save second drivers', "Impossible d'enregistrer les seconds conducteurs")}`);
          }
        }
        
        if (submissionReadyFormData.second_driver_name && secondDrivers.length === 0) {
          let secondDriverCustomerId = null;
          
          if (submissionReadyFormData.second_driver_license) {
            const { data: existingDriver } = await supabase
              .from('app_4c3a7a6153_customers')
              .select('id')
              .eq('licence_number', submissionReadyFormData.second_driver_license)
              .single();
            
            if (existingDriver) {
              secondDriverCustomerId = existingDriver.id;
            }
          }
          
          if (!secondDriverCustomerId) {
            const newSecondDriverCustomerId = generateCustomerId();
            const secondDriverCustomerData = {
              id: newSecondDriverCustomerId,
              full_name: submissionReadyFormData.second_driver_name,
              licence_number: submissionReadyFormData.second_driver_license || null,
              id_number: submissionReadyFormData.second_driver_id_number || null,
              date_of_birth: submissionReadyFormData.second_driver_dob || null,
              nationality: submissionReadyFormData.second_driver_nationality || null,
              phone: submissionReadyFormData.customer_phone || null,
              email: null,
              place_of_birth: null,
              id_scan_url: submissionReadyFormData.second_driver_id_image || null,
              extra_images: uniqueSecondIdImageUrls,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              customer_type: 'secondary'
            };
            
            const { error: secondDriverError } = await supabase
              .from('app_4c3a7a6153_customers')
              .insert([secondDriverCustomerData]);
            
            if (!secondDriverError) {
              secondDriverCustomerId = newSecondDriverCustomerId;
            }
          }
          
          if (secondDriverCustomerId && rentalId) {
            const secondDriverRecord = {
              rental_id: rentalId,
              full_name: submissionReadyFormData.second_driver_name,
              licence_number: submissionReadyFormData.second_driver_license || null,
              id_number: submissionReadyFormData.second_driver_id_number || null,
              date_of_birth: submissionReadyFormData.second_driver_dob || null,
              nationality: submissionReadyFormData.second_driver_nationality || null,
              id_scan_url: submissionReadyFormData.second_driver_id_image || null,
              uploaded_images: submissionReadyFormData.second_driver_uploaded_images || [],
              is_active: true,
              created_at: new Date().toISOString()
            };
            
            const { error: secondDriverRecordError } = await supabase
              .from('app_4c3a7a6153_rental_second_drivers')
              .insert([secondDriverRecord]);
            
            if (secondDriverRecordError) {
            }
          }
        }
        
        let successMsg = `✅ Rental successfully ${mode === 'edit' ? 'updated' : 'created'}!`;
        
        if (submissionData.approval_status === 'pending') {
          successMsg += ' ⏳ Price override submitted for admin approval.';
          
          try {
            const notificationCount = await sendWhatsAppNotifications(
              submissionData.pending_total_request, 
              result.data.id
            );
            
            if (notificationCount > 0) {
              toast.success(`📱 ${tr('WhatsApp notifications sent to', 'Notifications WhatsApp envoyées à')} ${notificationCount} ${tr('admin(s)', 'administrateur(s)')}`);
            } else {
              toast.info(tr('⚠️ No admins with WhatsApp enabled found. Approval request saved.', "⚠️ Aucun administrateur avec WhatsApp activé n'a été trouvé. La demande d'approbation a été enregistrée."));
            }
          } catch (whatsappError) {
            toast.warning(tr('⚠️ Approval request saved, but WhatsApp notifications failed', "⚠️ La demande d'approbation a été enregistrée, mais les notifications WhatsApp ont échoué"));
          }
        }
        
        toast.success(successMsg);

        if (onSuccess) {
          onSuccess(successPayload);
        } else {
          navigate(redirectUrl);
        }

        window.setTimeout(() => {
          const currentPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;
          const stillOnRentalWizard =
            currentPath === '/admin/rentals' ||
            currentPath === '/admin/rentals/' ||
            currentPath.includes('/admin/rentals?') ||
            currentPath.includes('/admin/rentals#');

          if (stillOnRentalWizard) {
            window.location.assign(redirectUrl);
          }
        }, 1200);
        
        return { result: result.data, rentalId: result.data.id, redirectUrl };
      } else {
        throw new Error(result?.error || tr('Unknown rental service error.', 'Erreur inconnue du service de location.'));
      }
      
    } catch (err) {
      const errorMessage = err.message || tr('An unexpected error occurred', "Une erreur inattendue s'est produite");
      
      setErrors({ general: errorMessage });
      toast.error(errorMessage);
      throw err;
    } finally {
      setSubmitting(false);
      setIsSubmitting(false);
    }
  };

  const handleReset = () => {
    setFormData({
      customer_name: '',
      customer_email: '',
      customer_phone: '',
      secondary_phone: '',
      customer_id: null,
      vehicle_id: '',
      rental_start_date: getMoroccoTodayString(),
      rental_end_date: getMoroccoTodayString(),
      rental_start_time: '',
      rental_end_time: '',
      rental_type: '',
      rental_status: 'scheduled',
      payment_status: 'unpaid',
      total_amount: 0,
      pickup_location: 'Office',
      dropoff_location: 'Office',
      quantity_days: 0,
      unit_price: 0,
      transport_fee: 0,
      pickup_transport: false,
      dropoff_transport: false,
      deposit_amount: '',
      damage_deposit: 0,
      damage_deposit_source: '',
      damage_deposit_document_url: null,
      damage_deposit_document_name: '',
      remaining_amount: 0,
      customer_licence_number: '',
      customer_id_number: '',
      customer_dob: '',
      customer_place_of_birth: '',
      customer_nationality: '',
      customer_issue_date: '',
      contract_signed: false,
      insurance_included: true,
      helmet_included: true,
      gear_included: false,
      accessories: '',
      signature_url: null,
      second_driver_name: '',
      second_driver_license: '',
      second_driver_id_number: '',
      second_driver_dob: '',
      second_driver_nationality: '',
      second_driver_uploaded_images: [],
      second_driver_customer_id: null,
      second_driver_id_image: null,
      customer_id_image: null,
      approval_status: 'auto',
      pending_total_request: null
    });
    setErrors({});
    setSuccess(null);
    setDateError(null);
    setAvailabilityStatus('unknown');
    setSelectedQuickDuration(null);
    setSuccessfullySubmitted(false);
    setSuccessRedirectUrl('');
    setSelectedDepositTab(null);
    setCustomDepositAmount('');
  };

  // ==================== AUTOMATION HOOKS ====================
  useEffect(() => {
    // Debounced vehicle availability update - prevents 429 rate limiting
    if (!formData.rental_start_date || !formData.rental_end_date) {
      return;
    }

    if (vehicleLoadTimeout.current) {
      clearTimeout(vehicleLoadTimeout.current);
    }

    vehicleLoadTimeout.current = setTimeout(async () => {
      try {
        console.log('🔄 Debounced vehicle availability update triggered');
        const { data: vehicles, error } = await supabase
          .from('saharax_0u4w4d_vehicles')
          .select('*')
          .order('id');
        
        if (error) {
          console.error('❌ Error fetching vehicles:', error);
          return;
        }
        
        const eligibleVehicles = (vehicles || []).filter(vehicle => {
          if (vehicle.status === 'available') {
            return true;
          }

          if (mode === 'edit' && initialData?.vehicle_id && vehicle.id == initialData.vehicle_id) {
            return true;
          }

          return false;
        });

        const filteredVehicles = await filterAvailableVehiclesByDates(
          eligibleVehicles,
          formData.rental_start_date,
          formData.rental_end_date,
          formData.rental_start_time || '00:00',
          formData.rental_end_time || '23:59'
        );
        
        setAvailableVehicles(filteredVehicles);
        
        if (formData.vehicle_id) {
          const isStillAvailable = filteredVehicles.some(v => v.id == formData.vehicle_id);
          if (!isStillAvailable) {
            setFormData(prev => ({
              ...prev,
              vehicle_id: '',
            }));
          }
        }
      } catch (error) {
        console.error('❌ Error in debounced vehicle update:', error);
      }
    }, 500); // Wait 500ms after last change before loading

    return () => {
      if (vehicleLoadTimeout.current) {
        clearTimeout(vehicleLoadTimeout.current);
      }
    };
  }, [formData.rental_start_date, formData.rental_end_date, formData.rental_start_time, formData.rental_end_time]);

  useEffect(() => {
    if (isCustomerVerificationOnlyMode) {
      return;
    }

    if (isProcessing.current) {
      return;
    }
    
    isProcessing.current = true;
    
    try {
      if (formData.rental_start_date && formData.rental_end_date && formData.rental_start_time && formData.rental_end_time) {
        const startDatetime = composeDateTime(formData.rental_start_date, formData.rental_start_time);
        const endDatetime = composeDateTime(formData.rental_end_date, formData.rental_end_time);

        if (startDatetime && endDatetime) {
          if (formData.rental_type === 'hourly') {
            if (startDatetime >= endDatetime) {
              const adjustedEndDatetime = new Date(endDatetime);
              adjustedEndDatetime.setDate(adjustedEndDatetime.getDate() + 1);
              
              const adjustedEndDate = formatDateToYYYYMMDD(adjustedEndDatetime);
              const adjustedEndTime = formatTimeToHHMM(adjustedEndDatetime);
              
              setFormData(prev => ({
                ...prev,
                rental_end_date: adjustedEndDate,
                rental_end_time: adjustedEndTime,
              }));
              return;
            }
          } else {
            if (startDatetime >= endDatetime) {
              const minimumDays = Math.max(Number(formData.quantity_days) || 1, 1);
              const adjustedEndDatetime = new Date(startDatetime);
              adjustedEndDatetime.setDate(adjustedEndDatetime.getDate() + minimumDays);

              const adjustedEndDate = formatDateToYYYYMMDD(adjustedEndDatetime);
              const adjustedEndTime = formatTimeToHHMM(adjustedEndDatetime);

              if (formData.rental_end_date !== adjustedEndDate || formData.rental_end_time !== adjustedEndTime) {
                setFormData(prev => ({
                  ...prev,
                  rental_end_date: adjustedEndDate,
                  rental_end_time: adjustedEndTime,
                }));
                setDateError(tr('End time was automatically adjusted to be after the start time.', "L'heure de fin a été automatiquement ajustée pour être postérieure à l'heure de début."));
                return;
              }
            } else {
              setDateError(null);
            }
          }
        }
      }

      calculateQuantityAndPricing();
      
    } finally {
      setTimeout(() => {
        isProcessing.current = false;
      }, 100);
    }
  }, [
    formData.rental_start_date, 
    formData.rental_end_date,
    formData.rental_start_time,
    formData.rental_end_time,
    formData.rental_type,
    formData.vehicle_id,
    isCustomerVerificationOnlyMode
  ]);

  useEffect(() => {
    if (isCustomerVerificationOnlyMode) return;
    calculateTransportFee();
  }, [formData.pickup_transport, formData.dropoff_transport, transportFees, isCustomerVerificationOnlyMode]);

  useEffect(() => {
    if (isCustomerVerificationOnlyMode) return;
    calculateFinancials();
  }, [formData.quantity_days, formData.unit_price, formData.transport_fee, formData.deposit_amount, formData.use_package_pricing, pricingComputationMode, isCustomerVerificationOnlyMode]);

  useEffect(() => {
    if (isManualStatusChange.current) {
      isManualStatusChange.current = false;
      return;
    }
    
    const deposit = parseFloat(formData.deposit_amount) || 0;
    const total = parseFloat(formData.total_amount) || 0;
    const currentStatus = formData.payment_status;

    if (currentStatus === 'overdue') return;
    
    let newPaymentStatus;
    if (total > 0) {
      if (deposit <= 0) {
        newPaymentStatus = 'unpaid';
      } else if (deposit >= total) {
        newPaymentStatus = 'paid';
      } else {
        newPaymentStatus = 'partial';
      }
    } else {
      newPaymentStatus = 'unpaid';
    }

    if (newPaymentStatus !== currentStatus) {
      setFormData(prev => ({ ...prev, payment_status: newPaymentStatus }));
    }
  }, [formData.deposit_amount, formData.total_amount]);

  useEffect(() => {
    if (isCustomerVerificationOnlyMode) {
      return;
    }

    // 🚨 Don't auto-populate if package pricing is active
    if (formData.use_package_pricing) {
      console.log('📦 Package pricing active, skipping auto-populate effect');
      return;
    }

    if (formData.vehicle_id && formData.rental_type && formData.quantity_days > 0) {
      if (shouldPreserveFinancialTerms()) {
        return;
      }
      setTimeout(() => {
        autoPopulateUnitPrice();
      }, 50);
    } else {
      if (!formData.vehicle_id) {
        setFormData(prev => ({ ...prev, unit_price: 0 }));
        setAutoCalculatedPrice(0);
        setPricingComputationMode('per_unit');
        setPricingComputationLabel('');
      }
    }
  }, [formData.vehicle_id, formData.rental_type, formData.quantity_days, formData.use_package_pricing, isCustomerVerificationOnlyMode]);

  useEffect(() => {
    if (isProgrammaticChange.current && formData.customer_name) {
      const customerData = getAggregatedCustomerData();
      const searchName = formData.customer_name.trim().toLowerCase();
      const match = customerData.find(c => c.name.trim().toLowerCase() === searchName);

      if (match) {
        setFormData(prev => ({
          ...prev,
          customer_email: prev.customer_email || match.email || '',
          customer_phone: prev.customer_phone || match.phone || '',
          customer_id: prev.customer_id || match.id || null,
        }));
      }
      isProgrammaticChange.current = false;
    }
  }, [formData.customer_name, getAggregatedCustomerData]);

  // ==================== FUEL CHARGE EFFECTS ====================
useEffect(() => {
  loadFuelChargeSettings();
}, []);

// Update fuel charge when rental type changes
useEffect(() => {
  if (mode === 'edit' && initialData?.fuel_charge_enabled !== undefined) {
    return;
  }

  if (formData.use_package_pricing) {
    setFuelChargeEnabled(Boolean(formData.selected_package_fuel_charge_enabled));
    return;
  }

  setFuelChargeEnabled(formData.rental_type === 'daily' && fuelChargeAmount > 0);
}, [formData.rental_type, formData.use_package_pricing, formData.selected_package_fuel_charge_enabled, fuelChargeAmount]);

  // ==================== RETURN VALUES ====================
  // Fetch KM packages when vehicle changes
  const fetchKMPackages = async (vehicleModelId, rentalType = null) => {
    if (!vehicleModelId) return [];
    try {
      console.log(`📦 Fetching packages for model ID: ${vehicleModelId}, rental type: ${rentalType}`);
      
      let query = supabase
        .from('app_4c3a7a6153_rental_km_packages')
        .select('*, rate_types(name)')
        .eq('vehicle_model_id', vehicleModelId)
        .eq('is_active', true);
      
      // Map rental type to rate_type_id
      if (rentalType === 'hourly') {
        query = query.or('rate_type_id.eq.1,rate_type_id.is.null');
      } else if (rentalType === 'daily') {
        query = query.or('rate_type_id.eq.2,rate_type_id.is.null');
      }
      
      const { data, error } = await query.order('fixed_amount', { ascending: true });
      
      if (error) {
        console.error('❌ Error fetching packages:', error);
        return [];
      }
      
      console.log(`📦 Found ${data?.length || 0} packages for model ${vehicleModelId}:`, 
        data?.map(p => ({ id: p.id, name: p.name, model_id: p.vehicle_model_id }))
      );
      
      return data || [];
    } catch (error) {
      console.error('❌ Error fetching packages:', error);
      return [];
    }
  };

  // Load packages ONLY for the selected vehicle's model
  useEffect(() => {
    const loadPackagesForSelectedVehicle = async () => {
      setIsLoadingPackages(true);

      if (formData.vehicle_id && formData.rental_type) {
        const vehicle =
          availableVehicles.find(v => v.id == formData.vehicle_id) ||
          allVehiclesBeforeFilter.find(v => v.id == formData.vehicle_id);
        if (vehicle?.vehicle_model_id) {
          console.log(`🔍 Vehicle selected: ${vehicle.id}, model ID: ${vehicle.vehicle_model_id}`);
          
          // Fetch packages for this specific model
          const packages = await fetchKMPackages(vehicle.vehicle_model_id, formData.rental_type);
          // Reload fuel pricing for new vehicle model
          await loadFuelChargeSettings(vehicle.vehicle_model_id, formData.rental_type, formData.use_package_pricing);
          
          // Set packages for this specific vehicle model only
          setAvailablePackages(packages);
          
          console.log(`📦 Setting available packages for model ${vehicle.vehicle_model_id}:`, 
            packages.map(p => ({ id: p.id, name: p.name }))
          );
          
          // If the currently selected package doesn't belong to this vehicle, clear it
          if (formData.selected_package_id) {
            const selectedPackageStillValid = packages.some(
              (p) => String(p.id) === String(formData.selected_package_id)
            );
            if (!selectedPackageStillValid && !shouldPreserveFinancialTerms()) {
              console.log(`⚠️ Previously selected package ${formData.selected_package_id} not valid for this vehicle, clearing...`);
              setFormData(prev => ({
                ...prev,
                selected_package_id: null,
                selected_package_name: '',
                selected_package_rate_per_unit: 0,
                selected_package_included_km: null,
                selected_package_included_km_per_unit: null,
                selected_package_total_included_km: null,
                selected_package_extra_rate: 0,
                selected_package_fuel_charge_enabled: false,
                selected_package_description: '',
                use_package_pricing: false,
                package_overrides_tier: false
              }));
              loadFuelChargeSettings(vehicle.vehicle_model_id, formData.rental_type, false);
            }
          }
        } else {
          console.log('⚠️ No vehicle_model_id found for selected vehicle');
          setAvailablePackages([]);
        }
      } else {
        setAvailablePackages([]);
      }

      setIsLoadingPackages(false);
    };
    
    if (formData.vehicle_id && formData.rental_type) {
      loadPackagesForSelectedVehicle();
    } else {
      setIsLoadingPackages(false);
      setAvailablePackages([]);
    }
  }, [formData.vehicle_id, formData.rental_type, availableVehicles, allVehiclesBeforeFilter]);

  const calculatePackagePrice = (pkg, dur) => {
    if (!pkg || !dur) return null;
    const fixedAmount = parseFloat(pkg.fixed_amount) || 0;
    const perUnitRate = fixedAmount / dur;
    return {
      total: fixedAmount,
      perUnit: perUnitRate,
      includedKm: pkg.included_kilometers,
      extraRate: parseFloat(pkg.extra_km_rate) || 0
    };
  };

  return {
    userProfile,
    formData,
    setFormData,
    loading,
    submitting,
    isSubmitting,
    successfullySubmitted,
    successRedirectUrl,
    errors,
    success,
    setSuccess,
    dateError,
    vehicleModels,
    availableVehicles,
    availablePackages,
    isLoadingPackages,
    selectedPackageDraft,
    setSelectedPackageDraft,
    setAvailablePackages,
    calculatePackagePrice,
    transportFees,
    availabilityStatus,
    autoCalculatedPrice,
    pricingComputationMode,
    pricingComputationLabel,
    customers,
    rentals,
    suggestions,
    customerAlert,
    isBannedCustomerBlocked,
    showCustomerAlertModal,
    setShowCustomerAlertModal,
    mode,
    selectedQuickDuration,
    setSelectedQuickDuration,
    damageDepositConfig,
    selectedDepositTab,
    setSelectedDepositTab,
    customDepositAmount,
    setCustomDepositAmount,
    secondDrivers,
    setSecondDrivers,
    addSecondDriverFromScan,
    removeSecondDriver,
    updateSecondDriver,
    handleInputChange,
    handleSuggestionClick,
    handleFileUpload,
    handleCustomerSaved,
    handleIDScanComplete,
    handleQuickHourSelect,
    handleQuickDaySelect,
    syncEndDateTimeFromStart,
    composeDateTime,
    handlePaymentStatusTabClick,
    handleDepositTabClick,
    handleDepositDocumentUpload,
    handleDepositDocumentTypeSelect,
    handleDepositDocumentClear,
    depositDocumentUploading,
    validateStep,
    handleSubmit,
    handleReset,
    getEnabledPresetsForVehicle,
    calculateQuantityAndPricing,
    calculateFinancials,
    getDirectPricing,
    customerSearchRef,
    getAggregatedCustomerData,
    fuelChargeEnabled,
    setFuelChargeEnabled,
    fuelChargeAmount,
    loadFuelChargeSettings,
    manuallyClearedVehicleRef,
  };
};

// ==================== SIMPLIFIED UI COMPONENTS ====================

const ProgressStepper = ({ currentStep, steps }) => (
  <div className="mb-6 rounded-2xl border border-violet-100 bg-white px-3 py-4 shadow-[0_12px_30px_-22px_rgba(15,23,42,0.35)] [overflow-anchor:none] sm:mb-8 sm:px-5">
    <div className="flex items-center justify-between gap-2">
      {steps.map((step, index) => (
        <React.Fragment key={step.number}>
          <div className="flex flex-col items-center flex-1 relative">
            <div className={`z-10 flex h-11 w-11 items-center justify-center rounded-full text-sm font-bold transition-all active:scale-95 sm:h-10 sm:w-10 sm:text-sm ${
              currentStep > step.number
                ? 'bg-emerald-500 text-white shadow-sm'
                : currentStep === step.number
                ? 'border border-violet-200 bg-violet-50 text-violet-700 ring-4 ring-violet-100 shadow-sm'
                : 'border border-slate-200 bg-slate-50 text-slate-400'
            }`}>
              {currentStep > step.number ? (
                <Check className="w-5 h-5 sm:w-4 sm:h-4" />
              ) : (
                step.number
              )}
            </div>
            <span className={`mt-2 max-w-[88px] truncate text-center text-xs font-semibold uppercase tracking-[0.14em] sm:max-w-none ${
              currentStep >= step.number ? 'text-slate-700' : 'text-slate-400'
            }`}>
              {step.title}
            </span>
          </div>
          {index < steps.length - 1 && (
            <div className={`mx-1 h-1 flex-1 rounded-full transition-all sm:mx-3 ${
              currentStep > step.number ? 'bg-emerald-500' : 'bg-slate-200'
            }`} />
          )}
        </React.Fragment>
      ))}
    </div>
  </div>
);

// ==================== MOBILE-FRIENDLY MODEL FILTER TABS ====================
const ModelFilterTabs = ({ 
  models, 
  activeModelId, 
  onModelSelect,
  availableVehicles,
  disabled = false 
}) => {
  const getVehicleCountByModel = (modelId) => {
    if (!availableVehicles || availableVehicles.length === 0) return 0;
    return availableVehicles.filter(vehicle => vehicle.vehicle_model_id === modelId).length;
  };

  if (!models || models.length === 0) {
    return null;
  }

  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <div className="mb-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Car className="w-4 h-4 text-gray-500" />
          <label className="block text-sm font-medium text-gray-700">
            Filter by Model
          </label>
        </div>
        <span className="text-xs text-gray-500">
          {availableVehicles.length} total
        </span>
      </div>
      
      <div className="relative">
        <div className={`flex gap-2 pb-2 overflow-x-auto scrollbar-hide snap-x snap-mandatory ${isMobile ? 'px-1 -mx-1' : 'flex-wrap'}`}>
          <button
            type="button"
            onClick={() => onModelSelect(null)}
            disabled={disabled}
            className={`flex-shrink-0 px-3 py-2.5 rounded-lg border-2 font-medium transition-all text-sm flex items-center gap-2 min-w-[110px] snap-start ${
              activeModelId === null
                ? 'border-blue-500 bg-gradient-to-r from-blue-50 to-blue-100 text-blue-700 ring-2 ring-blue-200 shadow-sm'
                : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50 active:bg-gray-100'
            } ${disabled ? 'opacity-50 cursor-not-allowed' : 'touch-manipulation active:scale-[0.98]'}`}
          >
            <Car className={`w-4 h-4 ${activeModelId === null ? 'text-blue-600' : 'text-gray-400'}`} />
            <span className="font-semibold">All</span>
            <span className={`text-xs px-1.5 py-0.5 rounded-full ${
              activeModelId === null 
                ? 'bg-blue-100 text-blue-700' 
                : 'bg-gray-100 text-gray-600'
            }`}>
              {availableVehicles.length}
            </span>
          </button>

          {models.map((model) => {
            const vehicleCount = getVehicleCountByModel(model.id);
            if (vehicleCount === 0) return null;
            
            return (
              <button
                key={model.id}
                type="button"
                onClick={() => onModelSelect(model.id)}
                disabled={disabled}
                className={`flex-shrink-0 px-3 py-2.5 rounded-lg border-2 font-medium transition-all text-sm flex items-center gap-2 min-w-[110px] snap-start ${
                  activeModelId === model.id
                    ? 'border-blue-500 bg-gradient-to-r from-blue-50 to-blue-100 text-blue-700 ring-2 ring-blue-200 shadow-sm'
                    : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50 active:bg-gray-100'
                } ${disabled ? 'opacity-50 cursor-not-allowed' : 'touch-manipulation active:scale-[0.98]'}`}
              >
                <span className="font-bold text-gray-900">{model.model || model.name?.split(' ').pop() || 'Model'}</span>
                <span className={`text-xs px-1.5 py-0.5 rounded-full ml-auto ${
                  activeModelId === model.id 
                    ? 'bg-blue-100 text-blue-700' 
                    : 'bg-gray-100 text-gray-600'
                }`}>
                  {vehicleCount}
                </span>
              </button>
            );
          })}
        </div>
        
        {isMobile && models.length > 2 && (
          <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-l from-white to-transparent pointer-events-none flex items-center justify-center">
            <ChevronRight className="w-4 h-4 text-gray-400" />
          </div>
        )}
      </div>
      
      {activeModelId && (
        <div className="mt-2 flex items-center gap-2 text-sm text-blue-600">
          <div className="w-2 h-2 rounded-full bg-blue-500"></div>
          <span>
            Filtered by {models.find(m => m.id === activeModelId)?.model || 'Model'} • 
            <button
              type="button"
              onClick={() => onModelSelect(null)}
              className="ml-1 underline hover:text-blue-800"
            >
              Clear filter
            </button>
          </span>
        </div>
      )}
    </div>
  );
};

const CollapsibleSection = ({ title, children, defaultOpen = false }) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  
  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden mb-4">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-4 py-4 sm:py-3 bg-gray-50 flex items-center justify-between hover:bg-gray-100 active:bg-gray-200 transition-colors touch-manipulation"
      >
        <span className="font-medium text-gray-900 text-base sm:text-sm">{title}</span>
        {isOpen ? <ChevronUp className="w-6 h-6 sm:w-5 sm:h-5 text-gray-500" /> : <ChevronDown className="w-6 h-6 sm:w-5 sm:h-5 text-gray-500" />}
      </button>
      {isOpen && (
        <div className="p-4 sm:p-4 bg-white">
          {children}
        </div>
      )}
    </div>
  );
};

// ==================== NEW: COLLAPSIBLE DATES & TIMES COMPONENT ====================
const CollapsibleDatesTimes = ({ 
  formData, 
  errors, 
  rentalType, 
  successfullySubmitted, 
  handleInputChange,
  handleQuickHourSelect,
  handleQuickDaySelect,
  selectedQuickDuration,
  showQuickDurationShortcuts = true
}) => {
  const [isDatesCollapsed, setIsDatesCollapsed] = useState(true);
  const hasDateRange = formData.rental_start_date && formData.rental_end_date;
  const summaryText = hasDateRange
    ? `${formData.rental_start_date} ${formData.rental_start_time || ''} → ${formData.rental_end_date} ${formData.rental_end_time || ''}`
    : tr('Set rental period', 'Définir la période de location');
  
  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden mb-4">
      <button
        type="button"
        onClick={() => setIsDatesCollapsed(!isDatesCollapsed)}
        className="w-full px-4 py-4 sm:py-3 bg-gradient-to-r from-slate-50 via-white to-blue-50/70 flex items-center justify-between hover:from-slate-100 hover:to-blue-100/80 active:bg-gray-200 transition-colors touch-manipulation"
      >
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100 text-blue-700 shadow-sm">
            <CalendarDays className="w-5 h-5" />
          </div>
          <div className="text-left">
            <span className="font-medium text-gray-900 text-base sm:text-sm block">
              Dates & Times
            </span>
            <span className={`mt-1 inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold shadow-sm ${
              hasDateRange
                ? 'bg-blue-100 text-blue-800 ring-1 ring-blue-200'
                : 'bg-slate-100 text-slate-600 ring-1 ring-slate-200'
            }`}>
              {summaryText}
            </span>
          </div>
        </div>
        {isDatesCollapsed ? 
          <ChevronDown className="w-5 h-5 text-gray-500" /> : 
          <ChevronUp className="w-5 h-5 text-gray-500" />
        }
      </button>
      
      {!isDatesCollapsed && (
        <div className="p-4 sm:p-4 bg-white">
          <div className="mb-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-900">Manual Dates & Times</h3>
              {showQuickDurationShortcuts && (
                <div className="flex gap-2 rounded-xl border border-slate-200 bg-slate-50 p-1">
                  <button
                    type="button"
                    onClick={() => handleQuickHourSelect(1)}
                    className={`text-xs px-3 py-1.5 rounded-lg transition-colors font-semibold ${
                      rentalType === 'hourly'
                        ? 'bg-blue-600 text-white shadow-sm hover:bg-blue-700'
                        : 'bg-blue-50 text-blue-700 hover:bg-blue-100'
                    }`}
                  >
                    1h
                  </button>
                  <button
                    type="button"
                    onClick={() => handleQuickHourSelect(1.5)}
                    className={`text-xs px-3 py-1.5 rounded-lg transition-colors font-semibold ${
                      rentalType === 'hourly'
                        ? 'bg-blue-600 text-white shadow-sm hover:bg-blue-700'
                        : 'bg-blue-50 text-blue-700 hover:bg-blue-100'
                    }`}
                  >
                    1.5h
                  </button>
                  <button
                    type="button"
                    onClick={() => handleQuickDaySelect(1)}
                    className={`text-xs px-3 py-1.5 rounded-lg transition-colors font-semibold ${
                      rentalType === 'daily'
                        ? 'bg-emerald-600 text-white shadow-sm hover:bg-emerald-700'
                        : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                    }`}
                  >
                    1d
                  </button>
                </div>
              )}
            </div>
            
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="block text-xs font-medium text-gray-500">Start Date *</label>
                <input
                  type="date"
                  value={formData.rental_start_date}
                  onChange={(e) => handleInputChange('rental_start_date', e.target.value)}
                  disabled={successfullySubmitted}
                  className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 text-sm ${
                    errors.rental_start_date ? 'border-red-500' : 'border-gray-300'
                  } ${successfullySubmitted ? 'opacity-50 cursor-not-allowed' : ''}`}
                />
              </div>
              
              <div className="space-y-1">
                <label className="block text-xs font-medium text-gray-500">{tr('Start Time', 'Heure de début')}</label>
                <input
                  type="time"
                  value={formData.rental_start_time}
                  onChange={(e) => handleInputChange('rental_start_time', e.target.value)}
                  disabled={successfullySubmitted}
                  className={`w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 text-sm ${successfullySubmitted ? 'opacity-50 cursor-not-allowed' : ''}`}
                />
              </div>
              
              <div className="space-y-1">
                <label className="block text-xs font-medium text-gray-500">{tr('End Date', 'Date de fin')} *</label>
                <input
                  type="date"
                  value={formData.rental_end_date}
                  onChange={(e) => handleInputChange('rental_end_date', e.target.value)}
                  disabled={successfullySubmitted}
                  className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 text-sm ${
                    errors.rental_end_date ? 'border-red-500' : 'border-gray-300'
                  } ${successfullySubmitted ? 'opacity-50 cursor-not-allowed' : ''}`}
                />
              </div>
              
              <div className="space-y-1">
                <label className="block text-xs font-medium text-gray-500">{tr('End Time', 'Heure de fin')}</label>
                <input
                  type="time"
                  value={formData.rental_end_time}
                  onChange={(e) => handleInputChange('rental_end_time', e.target.value)}
                  disabled={successfullySubmitted}
                  className={`w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 text-sm ${successfullySubmitted ? 'opacity-50 cursor-not-allowed' : ''}`}
                />
              </div>
            </div>
            
            <div className="mt-2 space-y-1">
              {errors.rental_start_date && (
                <p className="text-red-500 text-xs">{errors.rental_start_date}</p>
              )}
              {errors.rental_end_date && (
                <p className="text-red-500 text-xs">{errors.rental_end_date}</p>
              )}
            </div>
            
            {formData.quantity_days > 0 && (
              <div className="mt-3 flex items-center justify-between">
                <span className="text-xs text-gray-500">{tr('Duration:', 'Durée :')}</span>
                <span className="text-xs font-semibold text-blue-700">
                  {formData.quantity_days} {formData.rental_type === 'hourly' ? tr('hour(s)', 'heure(s)') : tr('day(s)', 'jour(s)')}
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

const TabbedInterface = ({ tabs, activeTab, onTabChange }) => (
  <div className="mb-6">
    <div className="flex border-b border-gray-200 -mx-2 px-2 overflow-x-auto scrollbar-hide scroll-smooth snap-x snap-mandatory">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onTabChange(tab.id)}
          className={`flex-1 min-w-[80px] px-3 sm:px-4 py-3 sm:py-2 text-sm font-medium transition-colors whitespace-nowrap touch-manipulation active:bg-gray-50 ${
            activeTab === tab.id
              ? 'border-b-2 border-blue-600 text-blue-600 bg-blue-50/50'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
    <div className="mt-4">
      {tabs.find(tab => tab.id === activeTab)?.content}
    </div>
  </div>
);

// ==================== SECOND DRIVERS MANAGER COMPONENT ====================
const SecondDriversManager = ({ secondDrivers, onRemove, onUpdate, disabled }) => {
  const [expandedDriver, setExpandedDriver] = useState(null);

  if (!secondDrivers || secondDrivers.length === 0) {
    return null;
  }

  return (
    <div className="mt-4 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
          <Users className="w-4 h-4" />
          Added Second Drivers ({secondDrivers.length})
        </h4>
      </div>
      
      <div className="space-y-3">
        {secondDrivers.map((driver, index) => (
          <div 
            key={driver.id || index}
            className="p-4 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg"
          >
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0">
                {driver.id_scan_url || driver.customer_id_image || driver.id_image ? (
                  <div 
                    className="w-16 h-16 rounded-lg overflow-hidden border-2 border-blue-200 cursor-pointer hover:opacity-90 transition-opacity"
                    onClick={() => window.open(driver.id_scan_url || driver.customer_id_image || driver.id_image, '_blank')}
                  >
                    <img
                      src={driver.id_scan_url || driver.customer_id_image || driver.id_image}
                      alt={driver.full_name}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        e.target.onerror = null;
                        e.target.src = 'https://via.placeholder.com/64?text=ID';
                      }}
                    />
                  </div>
                ) : (
                  <div className="w-16 h-16 rounded-lg bg-gray-200 flex items-center justify-center border-2 border-gray-300">
                    <User className="w-8 h-8 text-gray-500" />
                  </div>
                )}
              </div>
              
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-gray-900">
                        {driver.full_name || driver.name || 'Unknown Name'}
                      </span>
                      <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full whitespace-nowrap">
                        #{index + 1}
                      </span>
                    </div>
                    
                    <div className="mt-1 flex flex-wrap gap-2 text-xs">
                      {driver.licence_number && (
                        <span className="text-gray-600">
                          License: {driver.licence_number}
                        </span>
                      )}
                      {driver.id_number && (
                        <span className="text-gray-600">
                          ID: {driver.id_number}
                        </span>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setExpandedDriver(expandedDriver === driver.id ? null : driver.id)}
                      className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                      title={expandedDriver === driver.id ? "Show less" : "Show more"}
                    >
                      {expandedDriver === driver.id ? (
                        <ChevronUp className="w-4 h-4" />
                      ) : (
                        <ChevronDown className="w-4 h-4" />
                      )}
                    </button>
                    {!disabled && (
                      <button
                        type="button"
                        onClick={() => onRemove(driver.id || index)}
                        className="p-2 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors"
                        title="Remove driver"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {expandedDriver === driver.id && (
              <div className="mt-4 pt-4 border-t border-blue-200">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                  {driver.phone && (
                    <div className="flex items-center gap-2 text-sm">
                      <Phone className="w-4 h-4 text-gray-500" />
                      <span className="text-gray-700">{driver.phone}</span>
                    </div>
                  )}
                  {driver.email && (
                    <div className="flex items-center gap-2 text-sm">
                      <Mail className="w-4 h-4 text-gray-500" />
                      <span className="text-gray-700 truncate">{driver.email}</span>
                    </div>
                  )}
                  {driver.date_of_birth && (
                    <div className="flex items-center gap-2 text-sm">
                      <Calendar className="w-4 h-4 text-gray-500" />
                      <span className="text-gray-700">
                        {new Date(driver.date_of_birth).toLocaleDateString()}
                      </span>
                    </div>
                  )}
                  {driver.nationality && (
                    <div className="flex items-center gap-2 text-sm">
                      <MapPin className="w-4 h-4 text-gray-500" />
                      <span className="text-gray-700">{driver.nationality}</span>
                    </div>
                  )}
                  {driver.place_of_birth && (
                    <div className="flex items-center gap-2 text-sm">
                      <MapPin className="w-4 h-4 text-gray-500" />
                      <span className="text-gray-700">Born: {driver.place_of_birth}</span>
                    </div>
                  )}
                  {driver.gender && (
                    <div className="flex items-center gap-2 text-sm">
                      <User className="w-4 h-4 text-gray-500" />
                      <span className="text-gray-700">{driver.gender}</span>
                    </div>
                  )}
                </div>

                {driver.uploaded_images && driver.uploaded_images.length > 0 && (
                  <div className="mt-3">
                    <p className="text-xs font-medium text-gray-500 mb-2">
                      Additional Documents ({driver.uploaded_images.length})
                    </p>
                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                      {driver.uploaded_images.map((img, imgIndex) => (
                        <div
                          key={imgIndex}
                          className="aspect-square rounded-lg border border-gray-200 overflow-hidden cursor-pointer hover:opacity-90 transition-opacity"
                          onClick={() => window.open(img.url, '_blank')}
                        >
                          <img
                            src={img.url}
                            alt={`Document ${imgIndex + 1}`}
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              e.target.onerror = null;
                              e.target.style.display = 'none';
                              e.target.parentElement.innerHTML = '<div class="w-full h-full flex items-center justify-center bg-gray-100"><FileText class="w-6 h-6 text-gray-400" /></div>';
                            }}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

// Update the VehicleCardGrid component with better web layout

const VehicleCardGrid = ({ vehicles, selectedId, onSelect, disabled, rentalType, duration, showSearchBar = true, availablePackages = [], selectedPackageId = null, usePackagePricing = false }) => {
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [searchQuery, setSearchQuery] = useState('');
  
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  
  const normalizedVehicles = [...vehicles].sort((a, b) => {
    const aOdometer = Number(a?.current_odometer);
    const bOdometer = Number(b?.current_odometer);
    const aValid = Number.isFinite(aOdometer);
    const bValid = Number.isFinite(bOdometer);

    if (aValid && bValid && aOdometer !== bOdometer) {
      return aOdometer - bOdometer;
    }

    if (aValid && !bValid) return -1;
    if (!aValid && bValid) return 1;

    return String(a?.plate_number || a?.name || '').localeCompare(String(b?.plate_number || b?.name || ''));
  });

  const filteredVehicles = normalizedVehicles.filter(vehicle => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    return (
      (vehicle.plate_number && vehicle.plate_number.toLowerCase().includes(query)) ||
      (vehicle.name && vehicle.name.toLowerCase().includes(query)) ||
      (vehicle.model && vehicle.model.toLowerCase().includes(query))
    );
  });

  const selectedVehicle =
    filteredVehicles.find((vehicle) => String(vehicle.id) === String(selectedId)) ||
    normalizedVehicles.find((vehicle) => String(vehicle.id) === String(selectedId)) ||
    null;
  const displayedVehicles = selectedVehicle
    ? [selectedVehicle]
    : (isMobile ? filteredVehicles.slice(0, 6) : filteredVehicles);
  const recommendedVehicleId = filteredVehicles[0]?.id || normalizedVehicles[0]?.id || null;

  const getMileagePriority = (vehicle) => {
    const source = filteredVehicles.length > 0 ? filteredVehicles : normalizedVehicles;
    const ranked = source.filter((item) => Number.isFinite(Number(item?.current_odometer)));
    if (!ranked.length) {
      return {
        label: 'Mileage unknown',
        className: 'bg-slate-100 text-slate-600',
      };
    }

    const index = ranked.findIndex((item) => String(item.id) === String(vehicle.id));
    if (index === -1) {
      return {
        label: 'Mileage unknown',
        className: 'bg-slate-100 text-slate-600',
      };
    }

    const lowCutoff = Math.ceil(ranked.length / 3);
    const highCutoff = Math.ceil((ranked.length * 2) / 3);

    if (index < lowCutoff) {
      return {
        label: 'Low mileage',
        className: 'bg-emerald-100 text-emerald-700',
      };
    }

    if (index < highCutoff) {
      return {
        label: 'Balanced',
        className: 'bg-blue-100 text-blue-700',
      };
    }

    return {
      label: 'High mileage',
      className: 'bg-amber-100 text-amber-700',
    };
  };
  
  return (
    <div className="w-full">
      {showSearchBar && vehicles.length > 0 && (
        <div className="mb-4">
          <div className="relative">
            <UserSearch className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder={tr('Search by plate number...', 'Rechercher par numéro de plaque...')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-10 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-200 focus:border-blue-400 transition-all"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          <div className="flex items-center justify-between mt-2">
            <span className="text-xs text-gray-500">
              {filteredVehicles.length} {tr('of', 'sur')} {vehicles.length} {tr('vehicles', 'véhicules')}
              {searchQuery && ` ${tr('matching', 'correspondant à')} "${searchQuery}"`}
            </span>
          </div>
        </div>
      )}
      
      <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
        {displayedVehicles.map((vehicle) => {
          const isSelected = selectedId === vehicle.id || selectedId == vehicle.id;
          const isRecommended = String(recommendedVehicleId) === String(vehicle.id);
          const mileagePriority = getMileagePriority(vehicle);
          
          return (
            <div
              key={vehicle.id}
              onClick={() => onSelect(isSelected ? null : vehicle.id)}
              className={`relative cursor-pointer rounded-xl border-2 p-4 transform-gpu transition-[transform,border-color,box-shadow,background-color,opacity] duration-200 ease-out ${
                isSelected
                  ? 'border-green-500 bg-green-50 ring-2 ring-green-200 shadow-md scale-[1.01]'
                  : isRecommended
                    ? 'border-blue-300 bg-blue-50/50 shadow-sm hover:border-blue-400 hover:-translate-y-0.5 hover:shadow-md'
                    : 'border-gray-200 bg-white hover:border-gray-300 hover:-translate-y-0.5 hover:shadow-sm'
              } ${disabled ? 'opacity-50 cursor-not-allowed' : 'active:scale-[0.99]'}`}
            >
              {/* Header with Plate and Status */}
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${isSelected ? 'bg-green-100' : 'bg-gray-100'}`}>
                    <CarIcon className={`w-5 h-5 ${isSelected ? 'text-green-600' : 'text-gray-600'}`} />
                  </div>
                  <div>
                    <div className="text-xs text-gray-500">{tr('Plate', 'Plaque')}</div>
                    <div className="text-lg font-bold text-gray-900">
                      {vehicle.plate_number || 'N/A'}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {isRecommended && !isSelected && (
                    <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-1 text-[11px] font-semibold text-blue-700">
                      {tr('Lowest mileage', 'Kilométrage le plus bas')}
                    </span>
                  )}
                  <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                    vehicle.status === 'available'
                      ? 'bg-green-100 text-green-800'
                      : 'bg-red-100 text-red-800'
                  }`}>
                    {vehicle.status === 'available' ? tr('✓ Available', '✓ Disponible') : tr('✗ Unavailable', '✗ Indisponible')}
                  </span>
                  {isSelected && (
                    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-green-500 shadow-sm transition-all duration-200 ease-out">
                      <Check className="w-4 h-4 text-white" />
                    </div>
                  )}
                </div>
              </div>

              {/* Model Info */}
              <div className="mb-3">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-medium text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full">
                    {tr('MODEL', 'MODÈLE')}
                  </span>
                  <span className="text-xs text-gray-500">{duration} {duration > 1 ? (rentalType === 'hourly' ? tr('hrs', 'h') : tr('days', 'jours')) : (rentalType === 'hourly' ? tr('hr', 'h') : tr('day', 'jour'))}</span>
                </div>
                <h4 className="font-semibold text-gray-900">{vehicle.name}</h4>
                <p className="text-sm text-gray-600">{vehicle.model}</p>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <p className="text-[11px] font-medium text-gray-500">
                    {vehicle.current_odometer !== null && vehicle.current_odometer !== undefined && vehicle.current_odometer !== ''
                      ? `${vehicle.current_odometer} km`
                      : tr('Odometer not set', 'Compteur non défini')}
                  </p>
                  <span className={`inline-flex items-center rounded-full px-2 py-1 text-[11px] font-semibold ${mileagePriority.className}`}>
                    {mileagePriority.label}
                  </span>
                </div>
              </div>

              {/* Price Preview */}
              {rentalType && duration > 0 && (
                <div className="mt-2 pt-2 border-t border-gray-100">
                  <VehiclePricePreview 
                    vehicle={vehicle}
                    rentalType={rentalType}
                    duration={duration}
                    availablePackages={availablePackages}
                    selectedPackageId={selectedPackageId}
                    usePackagePricing={usePackagePricing}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
      
      {!isMobile && vehicles.length > 6 && (
        <button className="w-full mt-4 px-4 py-3 border-2 border-dashed border-gray-300 rounded-xl text-gray-600 hover:border-gray-400 hover:text-gray-800 active:bg-gray-50 transition-colors">
          <div className="flex items-center justify-center gap-2">
            <Plus className="w-5 h-5" />
            <span className="text-base font-medium">{tr('Load more vehicles', 'Charger plus de véhicules')}</span>
          </div>
        </button>
      )}
    </div>
  );
};

const FileUpload = ({ label, value, onChange, accept = "image/*" }) => {
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef(null);

  const handleFileSelect = (file) => {
    if (file) {
      onChange(file);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    handleFileSelect(file);
  };

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-gray-700">{label}</label>
      <div
        className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors cursor-pointer ${
          dragOver ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400'
        }`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept={accept}
          className="hidden"
          onChange={(e) => handleFileSelect(e.target.files[0])}
        />
        <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
        <p className="text-sm text-gray-600">
          Drag & drop or click to upload
        </p>
        <p className="text-xs text-gray-500 mt-1">
          PNG, JPG, GIF up to 10MB
        </p>
        {value && (
          <p className="text-sm text-green-600 mt-2">
            ✓ File selected: {value.name || 'Uploaded'}
          </p>
        )}
      </div>
    </div>
  );
};

// ==================== ENHANCED MULTIPLE IMAGE UPLOAD WITH THUMBNAILS ====================
const MultipleImageUpload = ({ 
  label, 
  images = [], 
  onImagesChange, 
  accept = "image/*",
  maxImages = 5,
  disabled = false,
  storagePath = 'customer-documents',
  debugMode = true
}) => {
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

  const handleFileSelect = async (files) => {
    const newFiles = Array.from(files).slice(0, maxImages - images.length);
    
    if (newFiles.length > 0) {
      setUploading(true);
      
      try {
        const uploadedImages = [];
        
        for (const file of newFiles) {
          const timestamp = Date.now();
          const randomString = Math.random().toString(36).substring(2, 8);
          const fileExtension = file.name.split('.').pop() || 'jpg';
          const fileName = `${storagePath}_${timestamp}_${randomString}.${fileExtension}`;
          
          const { data, error } = await supabase.storage
            .from('customer-documents')
            .upload(fileName, file, {
              cacheControl: '3600',
              upsert: false,
            });
          
          if (error) {
            throw error;
          }
          
          const { data: { publicUrl } } = supabase.storage
            .from('customer-documents')
            .getPublicUrl(data.path);
          
          uploadedImages.push({
            id: `${timestamp}_${randomString}`,
            url: publicUrl,
            name: file.name,
            path: data.path,
            uploadedAt: new Date().toISOString(),
            type: file.type,
            size: file.size,
            storage_path: `customer-documents/${fileName}`
          });
        }
        
        const allImages = [...images, ...uploadedImages];
        onImagesChange(allImages);
        
        toast.success(`✅ ${uploadedImages.length} ${tr('image(s) uploaded successfully!', 'image(s) téléversée(s) avec succès !')}`);
        
      } catch (error) {
        toast.error(`${tr('Failed to upload files:', 'Impossible de téléverser les fichiers :')} ${error.message}`);
      } finally {
        setUploading(false);
      }
    }
  };

  const handleRemoveImage = async (index) => {
    const imageToRemove = images[index];
    
    try {
      if (imageToRemove.path) {
        const { error } = await supabase.storage
          .from('customer-documents')
          .remove([imageToRemove.path]);
        
        if (error) {
          toast.error(tr('Failed to remove file from storage', 'Impossible de supprimer le fichier du stockage'));
          return;
        }
      }
      
      const newImages = [...images];
      newImages.splice(index, 1);
      onImagesChange(newImages);
      
      toast.success(tr('Image removed successfully', 'Image supprimée avec succès'));
      
    } catch (error) {
      toast.error(tr('Failed to remove image', "Impossible de supprimer l'image"));
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const files = e.dataTransfer.files;
    handleFileSelect(files);
  };

  const getThumbnailUrl = (image) => {
    if (image.url) return image.url;
    return null;
  };

  return (
    <div className="space-y-3">
      {label && <label className="block text-sm font-medium text-gray-700">{label}</label>}
      
      {images.length > 0 && (
        <div className="mb-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {images.map((image, index) => (
              <div key={image.id || index} className="relative group">
                <div className="aspect-square rounded-lg border border-gray-200 overflow-hidden bg-gray-50">
                  {getThumbnailUrl(image) ? (
                    <img 
                      src={getThumbnailUrl(image)} 
                      alt={`ID Image ${index + 1}`}
                      className="w-full h-full object-cover hover:scale-105 transition-transform duration-200"
                      onError={(e) => {
                        e.target.style.display = 'none';
                        e.target.parentElement.innerHTML = '<div class="w-full h-full flex flex-col items-center justify-center p-2"><svg class="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg></div>';
                      }}
                    />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center p-2">
                      <FileImage className="w-8 h-8 text-gray-400 mb-2" />
                      <span className="text-xs text-gray-500 text-center truncate">{image.name || 'Image'}</span>
                    </div>
                  )}
                </div>
                
                <button
                  type="button"
                  onClick={() => handleRemoveImage(index)}
                  disabled={disabled || uploading}
                  className="absolute -top-2 -right-2 w-7 h-7 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600 disabled:opacity-30 disabled:cursor-not-allowed shadow-md"
                  title="Remove image"
                >
                  <XCircle className="w-4 h-4" />
                </button>
                
                <div className="mt-1">
                  <div className="text-xs text-gray-500 truncate">
                    {image.name || `Image ${index + 1}`}
                  </div>
                </div>
              </div>
            ))}
          </div>
          
          <div className="text-xs text-gray-500 mt-2">
            {images.length} image{images.length !== 1 ? 's' : ''} uploaded
          </div>
        </div>
      )}

      {images.length < maxImages && (
        <div
          className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
            dragOver ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400'
          } ${disabled || uploading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
          onDragOver={(e) => {
            e.preventDefault();
            !disabled && !uploading && setDragOver(true);
          }}
          onDragLeave={() => !disabled && !uploading && setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => !disabled && !uploading && fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept={accept}
            className="hidden"
            multiple
            onChange={(e) => handleFileSelect(e.target.files)}
            disabled={disabled || uploading}
          />
          
          {uploading ? (
            <div className="flex flex-col items-center">
              <Loader className="w-8 h-8 text-blue-400 animate-spin mb-2" />
              <p className="text-sm text-gray-600">Uploading images...</p>
            </div>
          ) : (
            <>
              <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
              <p className="text-sm text-gray-600">
                Drag & drop or click to upload multiple images
              </p>
              <p className="text-xs text-gray-500 mt-1">
                PNG, JPG, GIF up to 10MB each ({images.length}/{maxImages} uploaded)
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
};

// ==================== ENHANCED PRICE CALCULATOR WITH EDIT FUNCTIONALITY ====================

const PriceCalculator = ({ formData, onPriceChange, onResetToAuto, autoCalculatedPrice, userProfile, disabled, fuelChargeEnabled, fuelChargeAmount, pricingComputationMode = 'per_unit', pricingComputationLabel = '' }) => {
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [isEditingTotal, setIsEditingTotal] = useState(false);
  const [tempTotalPrice, setTempTotalPrice] = useState(formData.total_amount || 0);

  const userRole = userProfile?.role || 'unknown';
  const isStaff = userRole === 'employee' || userRole === 'guide';
  const isAdminOrOwner = userRole === 'admin' || userRole === 'owner';
  const hasDirectPriceOverridePermission = canEditRentalPrice(userProfile);
  const canEditPrice = isAdminOrOwner || isStaff;
  const requiresApproval = canEditPrice && !hasDirectPriceOverridePermission;

  const manualPrice = parseFloat(formData.unit_price) || 0;
  const autoPrice = parseFloat(autoCalculatedPrice) || 0;
  const isPriceOverride = !formData.use_package_pricing && manualPrice !== autoPrice && autoPrice > 0;
  const isFlatTierTotal = !formData.use_package_pricing && pricingComputationMode === 'flat_total';

  const calculateBreakdown = () => {
    const durationUnits = Number(formData.quantity_days || 0) || 0;
    const rentalCost = formData.use_package_pricing
      ? getFixedPackageAmount(formData)
      : isFlatTierTotal
      ? (formData.unit_price || 0)
      : durationUnits * (formData.unit_price || 0);
    const transportCost = formData.transport_fee || 0;
    // Fuel charge is a return-time adjustment rule, not an upfront booking charge.
    const fuelCharge = 0;
    const total = rentalCost + transportCost + fuelCharge;
    const deposit = formData.deposit_amount || 0;
    const remaining = total - deposit;

    return {
      rentalCost,
      transportCost,
      fuelCharge,
      total,
      deposit,
      remaining
    };
  };

  const breakdown = calculateBreakdown();
  const autoRentalCost = formData.use_package_pricing
    ? getFixedPackageAmount({ ...formData, unit_price: autoPrice })
    : isFlatTierTotal
    ? autoPrice
    : (formData.quantity_days || 0) * autoPrice;
  const autoTotal = autoRentalCost + breakdown.transportCost + breakdown.fuelCharge;

  const handleEditTotalClick = () => {
    setTempTotalPrice(String(Math.round(Number(breakdown.total || 0))));
    setIsEditingTotal(true);
  };

  const handleSaveTotal = () => {
    const newTotal = parseFloat(tempTotalPrice);
    const includedExtras = breakdown.transportCost + breakdown.fuelCharge;
    const durationUnits = Number(formData.quantity_days) || 0;

    if (Number.isNaN(newTotal) || newTotal <= 0) {
      toast.error(tr('Please enter a valid total', 'Veuillez saisir un total valide'));
      return;
    }

    if (durationUnits <= 0) {
      toast.error(tr('Please set the rental duration first', 'Veuillez d’abord définir la durée de location'));
      return;
    }

    if (newTotal < includedExtras) {
      toast.error(
        tr(
          'Total must cover transport and fuel charges',
          'Le total doit couvrir les frais de transport et de carburant'
        )
      );
      return;
    }

    const newUnitPrice = isFlatTierTotal
      ? (newTotal - includedExtras)
      : (newTotal - includedExtras) / durationUnits;

    if (!Number.isFinite(newUnitPrice) || newUnitPrice <= 0) {
      toast.error(tr('Please enter a valid total', 'Veuillez saisir un total valide'));
      return;
    }

    onPriceChange('unit_price', Number(newUnitPrice.toFixed(2)));
    setIsEditingTotal(false);

    if (!formData.use_package_pricing && newUnitPrice !== autoPrice) {
      if (requiresApproval) {
        toast.info(tr('⏳ Total override will require admin approval', "⏳ Le remplacement du total nécessitera l'approbation d'un administrateur"));
      } else {
        toast.success(tr('✅ Total updated (auto-approved)', '✅ Total mis à jour (approbation automatique)'));
      }
    }
  };

  const handleCancelEdit = () => {
    setTempTotalPrice(String(Math.round(Number(breakdown.total || 0))));
    setIsEditingTotal(false);
  };

  const handleResetToAuto = () => {
    onResetToAuto?.();
    onPriceChange('unit_price', autoPrice);
    setTempTotalPrice(String(Math.round(Number(autoTotal || 0))));
    setIsEditingTotal(false);
    toast.success(tr('✅ Price reset to system rate', '✅ Prix réinitialisé au tarif système'));
  };

  return (
    <div className={`rounded-xl p-4 sm:p-5 border-2 ${
      !formData.use_package_pricing && canEditPrice && !disabled
        ? 'bg-gradient-to-br from-white via-slate-50 to-violet-50/70 border-violet-100 shadow-[0_14px_35px_rgba(76,29,149,0.06)]'
        : 'bg-white border-slate-200 shadow-sm'
    }`}>
      <div className="flex items-center justify-between mb-4 gap-2">
        <h3 className="font-semibold text-gray-900 text-base sm:text-lg">{tr('Price Summary', 'Résumé du prix')}</h3>
        <button
          type="button"
          onClick={() => setShowBreakdown(!showBreakdown)}
          className="rounded-full border border-violet-100 bg-white px-3 py-2 text-sm font-medium text-violet-700 transition-colors hover:bg-violet-50 hover:text-violet-800 active:text-violet-900"
        >
          {showBreakdown ? tr('Hide Details', 'Masquer les détails') : tr('Show Details', 'Afficher les détails')}
        </button>
      </div>

      <div className="space-y-3">
        <div className={`rounded-lg p-3 border ${
          !formData.use_package_pricing && canEditPrice && !disabled
            ? 'bg-white border-violet-100 shadow-sm'
            : 'bg-white border-gray-200'
        }`}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-700">
              {formData.use_package_pricing
                ? 'Package Rate'
                : isFlatTierTotal
                  ? 'Tier Price'
                  : `Unit Price (${formData.rental_type || 'N/A'}):`}
            </span>
          </div>

          {!formData.use_package_pricing && !canEditPrice && !disabled && (
            <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              You do not have permission to change the rental price. Ask an admin or owner to enable it in User Management.
            </div>
          )}
          
          <div>
              <div className={`rounded-lg px-3 py-3 ${
                !formData.use_package_pricing && canEditPrice && !disabled
                  ? 'bg-blue-50 border border-blue-100'
                  : ''
              }`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <span className="text-lg font-bold text-gray-900">
                      {formData.unit_price.toFixed(2)} MAD
                      {(formData.use_package_pricing || isFlatTierTotal) && (
                        <span className="ml-2 text-xs font-normal text-purple-600">
	                          {isFlatTierTotal
	                            ? tr('flat total', 'total fixe')
	                            : tr('package price', 'prix du forfait')}
                        </span>
                      )}
                    </span>
                  </div>
                  <div className="ml-3 flex shrink-0 flex-col items-end gap-2">
                  {formData.use_package_pricing && (
                    <span className="flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-purple-100 text-purple-700">
                      <Package className="w-3 h-3" />
                      {tr('Package', 'Forfait')}
                    </span>
                  )}
                  {!formData.use_package_pricing && isPriceOverride && (
                    <span className="flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-orange-100 text-orange-700">
                      <AlertCircle className="w-3 h-3" />
                      {tr('Override', 'Remplacement')}
                    </span>
                  )}
                  </div>
                </div>
              </div>
              
              {formData.use_package_pricing && (
                <div className="mt-2 p-2 bg-purple-50 rounded border border-purple-200">
                  <div className="flex items-start gap-2">
                    <Package className="w-4 h-4 text-purple-600 mt-0.5 flex-shrink-0" />
                    <div className="text-xs text-purple-800">
                      <p className="font-medium">{formData.selected_package_name}</p>
                      <p className="mt-1">
                        {tr('Package total:', 'Total du forfait :')} {getFixedPackageAmount(formData).toFixed(2)} MAD
                      </p>
                      <p className="mt-1">
                        {tr('Duration:', 'Durée :')} {formatRentalDurationLabel(formData.rental_type, formData.quantity_days, tr)}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {isFlatTierTotal && (
                <div className="mt-2 p-2 bg-purple-50 rounded border border-purple-200">
                  <div className="flex items-start gap-2">
                    <Info className="w-4 h-4 text-purple-600 mt-0.5 flex-shrink-0" />
                    <div className="text-xs text-purple-800">
                      <p className="font-medium">{pricingComputationLabel || tr('1.5-hour fixed tier', 'Palier fixe de 1,5 heure')}</p>
                      <p className="mt-1">{tr('This amount is a flat tier total for the selected duration.', 'Ce montant est un total fixe pour la durée sélectionnée.')}</p>
                    </div>
                  </div>
                </div>
              )}
              
              {!formData.use_package_pricing && isPriceOverride && (
                <div className="mt-2 p-2 bg-orange-50 rounded border border-orange-200">
                  <div className="flex items-start gap-2">
                    <Info className="w-4 h-4 text-orange-600 mt-0.5 flex-shrink-0" />
                    <div className="text-xs text-orange-800">
                      <p className="font-medium">{tr('Price Override Detected', 'Remplacement de prix détecté')}</p>
                      <p className="mt-1">{tr('System rate:', 'Tarif système :')} {autoPrice.toFixed(2)} MAD</p>
                      <p className="mt-1">
                        {requiresApproval ? tr('⏳ Requires admin approval', "⏳ Nécessite l'approbation d'un administrateur") : tr('✅ Override allowed', '✅ Remplacement autorisé')}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:justify-between gap-1 sm:gap-0 py-2 border-b border-gray-200">
          <span className="text-gray-600 text-sm">{tr('Rental Cost:', 'Coût de location :')}</span>
          <div className="text-right sm:text-right">
            <span className="font-medium text-gray-900">
              {breakdown.rentalCost.toFixed(2)} MAD
            </span>
            <div className="text-xs text-gray-500">
              {formData.use_package_pricing
                ? tr('Fixed package price applied', 'Prix du forfait fixe appliqué')
                : isFlatTierTotal
                ? (pricingComputationLabel || tr('Flat tier total applied', 'Total fixe appliqué'))
                : `${formData.quantity_days} × ${formData.unit_price.toFixed(2)}`}
            </div>
          </div>
        </div>
        
        <div className="flex justify-between items-center py-2 border-b border-gray-200">
          <span className="text-gray-600 text-sm">{tr('Transport:', 'Transport :')}</span>
          <span className="font-medium text-gray-900">{breakdown.transportCost.toFixed(2)} MAD</span>
        </div>
        {/* Fuel Charge */}
<div className="flex justify-between items-center py-2 border-b border-gray-200">
  <span className="text-gray-600 text-sm">{tr('Fuel Charge:', 'Frais de carburant :')}</span>
  <span className="font-medium text-gray-900">{breakdown.fuelCharge.toFixed(2)} MAD</span>
</div>
        
        <div className="pt-3 mt-1">
          <div className="flex justify-between items-center rounded-xl border border-violet-100 bg-white px-4 py-3 shadow-[0_10px_28px_rgba(15,23,42,0.06)]">
            <div>
              <span className="text-base sm:text-lg font-bold text-gray-900">{tr('Total:', 'Total :')}</span>
              {!formData.use_package_pricing && canEditPrice && !disabled && (
                <p className="mt-0.5 text-xs text-gray-500">
                  {tr('You can edit the unit price or the final total', 'Vous pouvez modifier le prix unitaire ou le total final')}
                </p>
              )}
            </div>
            <div className="flex items-center gap-3">
              {isEditingTotal ? (
                <div className="flex flex-col items-end gap-2">
                  <input
                    type="text"
                    value={tempTotalPrice}
                    onChange={(e) => setTempTotalPrice(normalizeMoneyInput(e.target.value))}
                    className="w-40 rounded-lg border border-violet-200 px-3 py-2 text-right text-base font-semibold text-violet-700 focus:outline-none focus:ring-2 focus:ring-violet-500"
                    inputMode="numeric"
                    placeholder="0"
                    autoFocus
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={handleSaveTotal}
                      className="inline-flex items-center gap-1 rounded-md bg-green-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-green-700"
                    >
                      <Save className="h-3.5 w-3.5" />
                      {tr('Save', 'Enregistrer')}
                    </button>
                    <button
                      type="button"
                      onClick={handleCancelEdit}
                      className="inline-flex items-center gap-1 rounded-md bg-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-700 transition-colors hover:bg-gray-300"
                    >
                      {tr('Cancel', 'Annuler')}
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <span className="text-xl sm:text-2xl font-bold text-violet-700 text-right">{formatWholeMad(breakdown.total)} MAD</span>
                  {!formData.use_package_pricing && canEditPrice && !disabled && (
                    <button
                      type="button"
                      onClick={handleEditTotalClick}
                      className="inline-flex items-center gap-1.5 rounded-md border border-violet-200 bg-white px-3 py-1.5 text-sm font-semibold text-violet-700 transition-colors hover:bg-violet-50"
                    >
                      <Edit2 className="h-3.5 w-3.5" />
                      {tr('Edit Total', 'Modifier le total')}
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
        
        {showBreakdown && (
          <div className="mt-4 rounded-xl border border-slate-200 bg-white/90 px-4 py-3 shadow-sm">
            <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-gray-600">{tr('Paid Amount:', 'Montant payé :')}</span>
              <span className="font-medium">{breakdown.deposit.toFixed(2)} MAD</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">{tr('Remaining:', 'Reste :')}</span>
              <span className={`font-medium ${
                breakdown.remaining === 0 ? 'text-green-600' : 'text-red-600'
              }`}>
                {breakdown.remaining.toFixed(2)} MAD
              </span>
            </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// ==================== NEW: DAMAGE DEPOSIT TABS COMPONENT ====================
const DamageDepositTabs = ({ 
  formData, 
  enabledPresets, 
  allowCustomDeposit, 
  includeNoneOption = false,
  variant = 'default',
  selectedTab, 
  customAmount,
  onTabClick,
  onCustomAmountChange,
  onDocumentUpload,
  onDocumentTypeSelect,
  onDocumentClear,
  documentUploading,
  disabled 
}) => {
  const cameraInputRef = useRef(null);
  const hasDocumentSelection = Boolean(formData.damage_deposit_document_url || formData.damage_deposit_document_name);
  const [showDocumentSection, setShowDocumentSection] = useState(hasDocumentSelection);
  const isLightVariant = variant === 'light';

  useEffect(() => {
    if (hasDocumentSelection) {
      setShowDocumentSection(true);
    }
  }, [hasDocumentSelection]);

  const tabs = [
    ...(includeNoneOption ? [{
      id: 'none',
      label: tr('None', 'Aucune'),
      amount: 0
    }] : []),
    ...enabledPresets.map(preset => ({
      id: preset.label,
      label: preset.label,
      amount: preset.amount
    })),
    ...(allowCustomDeposit ? [{
      id: 'custom',
      label: tr('Custom', 'Personnalisé'),
      amount: null
    }] : [])
  ];

  if (tabs.length === 0) {
    return (
      <div>
        <label className={`block mb-1 ${isLightVariant ? 'text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-500' : 'text-sm font-medium text-gray-700'}`}>
          {tr('Damage Deposit (MAD)', 'Dépôt de garantie (MAD)')}
        </label>
        <input
          type="number"
          value={formData.damage_deposit || ''}
          onChange={(e) => onCustomAmountChange(e.target.value)}
          disabled={disabled}
          className={`w-full ${
            isLightVariant
              ? 'rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-xl font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-violet-500'
              : 'px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500'
          } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
          min="0"
          step="1"
          placeholder={tr('Enter amount', 'Saisir un montant')}
        />
      </div>
    );
  }

  return (
    <div>
      <label className={`block mb-2 ${isLightVariant ? 'text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-500' : 'text-sm font-medium text-gray-700'}`}>
        {tr('Damage Deposit Selection', 'Sélection du dépôt de garantie')}
      </label>
      
      <div className="flex gap-2 flex-wrap mb-3">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => onTabClick(tab.id, tab.amount)}
            disabled={disabled}
            className={`font-medium transition-all text-sm ${
              isLightVariant
                ? `rounded-2xl border px-4 py-3 ${
                    selectedTab === tab.id
                      ? 'border-violet-500 bg-violet-600 text-white shadow-[0_16px_32px_rgba(124,58,237,0.22)]'
                      : 'border-slate-200 bg-white text-slate-800 hover:border-violet-300 hover:bg-violet-50/40'
                  }`
                : `px-4 py-2 rounded-lg border-2 ${
                    selectedTab === tab.id
                      ? 'border-blue-500 bg-blue-50 text-blue-700 ring-2 ring-blue-200'
                      : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50'
                  }`
              }
              ${
                disabled ? 'opacity-50 cursor-not-allowed' : ''
              } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            <div className="flex flex-col items-center">
              <span className="flex items-center gap-2 font-semibold">
                {tab.icon ? <tab.icon className="h-4 w-4" /> : null}
                {tab.label}
              </span>
              {tab.amount !== null && (
                <span className="text-xs mt-0.5">{tab.amount.toLocaleString()} MAD</span>
              )}
            </div>
          </button>
        ))}
        <button
          type="button"
          onClick={() => {
            if (showDocumentSection || hasDocumentSelection) {
              setShowDocumentSection(false);
              onDocumentClear?.();
              return;
            }
            setShowDocumentSection(true);
          }}
          disabled={disabled}
          className={`font-medium transition-all text-sm ${
            isLightVariant
              ? `rounded-2xl border px-4 py-3 ${
                  showDocumentSection || hasDocumentSelection
                    ? 'border-emerald-400 bg-emerald-50 text-emerald-700 shadow-[0_12px_28px_rgba(16,185,129,0.14)]'
                    : 'border-slate-200 bg-white text-slate-800 hover:border-emerald-300 hover:bg-emerald-50/40'
                }`
              : `px-4 py-2 rounded-lg border-2 ${
                  showDocumentSection || hasDocumentSelection
                    ? 'border-emerald-500 bg-emerald-50 text-emerald-700 ring-2 ring-emerald-200'
                    : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50'
                }`
            }
            ${
              disabled ? 'opacity-50 cursor-not-allowed' : ''
            } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          <span className="flex items-center gap-2 font-semibold">
            <FileText className="h-4 w-4" />
            {tr('Document', 'Document')}
          </span>
        </button>
      </div>

      {selectedTab === 'custom' && (
        <div className="mt-3">
          <input
            type="number"
            value={customAmount}
            onChange={(e) => {
              const value = e.target.value;
              onCustomAmountChange(value);
              const parsedValue = parseFloat(value) || 0;
              onTabClick('custom', parsedValue);
            }}
            disabled={disabled}
            className={`w-full ${
              isLightVariant
                ? 'rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-xl font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-violet-500'
                : 'px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500'
            } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
            min="0"
            step="100"
            placeholder={tr('Enter custom amount (e.g., 8500)', 'Saisir un montant personnalisé (ex. : 8500)')}
          />
        </div>
      )}

      {selectedTab && selectedTab !== 'custom' && selectedTab !== 'none' && (
        <div className={`mt-2 ${isLightVariant ? 'text-sm font-medium text-slate-600' : 'text-sm text-gray-600'}`}>
          Selected: <span className="font-medium text-gray-900">{formData.damage_deposit} MAD</span>
        </div>
      )}

      {showDocumentSection && (
      <div className={`mt-4 rounded-2xl p-4 ${isLightVariant ? 'border border-slate-200 bg-[linear-gradient(180deg,rgba(236,253,245,0.92),rgba(255,255,255,0.98))] shadow-[0_14px_30px_rgba(16,185,129,0.10)]' : 'border border-emerald-200 bg-emerald-50/70'}`}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className={`text-sm font-semibold ${isLightVariant ? 'text-slate-900' : 'text-emerald-900'}`}>
              {tr('Security Document (optional)', 'Document de garantie (optionnel)')}
            </p>
            <p className={`mt-1 text-xs ${isLightVariant ? 'text-slate-600' : 'text-emerald-800'}`}>
              {tr(
                'Hold a document in addition to the monetary damage deposit if needed.',
                'Conservez un document en plus du dépôt de garantie monétaire si nécessaire.'
              )}
            </p>
          </div>
          {hasDocumentSelection ? (
            <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
              {tr('Document added', 'Document ajouté')}
            </span>
          ) : null}
        </div>

        <div className="mt-3 flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={() => cameraInputRef.current?.click()}
            disabled={disabled || documentUploading}
            className={`flex-1 rounded-xl px-4 py-3 text-sm font-semibold transition ${isLightVariant ? 'border border-emerald-200 bg-white text-emerald-700 hover:border-emerald-300 hover:bg-emerald-50 shadow-sm' : 'border border-emerald-200 bg-white text-emerald-700 hover:border-emerald-300 hover:bg-emerald-50'} ${disabled || documentUploading ? 'cursor-not-allowed opacity-50' : ''}`}
          >
            <span className="flex items-center justify-center gap-2">
              <FileImage className="h-4 w-4" />
              {documentUploading ? tr('Uploading...', 'Téléversement...') : tr('Take Photo', 'Prendre une photo')}
            </span>
          </button>
          <button
            type="button"
            onClick={() => onDocumentTypeSelect?.('National ID')}
            disabled={disabled}
            className={`flex-1 rounded-xl px-4 py-3 text-sm font-semibold transition ${isLightVariant ? 'border border-slate-200 bg-white text-slate-700 hover:border-violet-300 hover:bg-violet-50/40 shadow-sm' : 'border border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50'} ${disabled || documentUploading ? 'cursor-not-allowed opacity-50' : ''}`}
          >
            <span className="flex items-center justify-center gap-2">
              <FileText className="h-4 w-4" />
              {tr('National ID', 'Carte d’identité')}
            </span>
          </button>
          <button
            type="button"
            onClick={() => onDocumentTypeSelect?.('Passport')}
            disabled={disabled}
            className={`flex-1 rounded-xl px-4 py-3 text-sm font-semibold transition ${isLightVariant ? 'border border-slate-200 bg-white text-slate-700 hover:border-violet-300 hover:bg-violet-50/40 shadow-sm' : 'border border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50'} ${disabled ? 'cursor-not-allowed opacity-50' : ''}`}
          >
            <span className="flex items-center justify-center gap-2">
              <FileText className="h-4 w-4" />
              {tr('Passport', 'Passeport')}
            </span>
          </button>
        </div>

        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => onDocumentUpload?.(e.target.files?.[0] || null)}
        />

        {hasDocumentSelection ? (
          <div className={`mt-3 rounded-xl bg-white px-4 py-3 text-sm text-gray-700 ${isLightVariant ? 'border border-slate-200 shadow-sm' : 'border border-emerald-200'}`}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="font-medium text-gray-900">
                  {formData.damage_deposit_document_name || tr('Security document added', 'Document de garantie ajouté')}
                </div>
                {formData.damage_deposit_document_url ? (
                  <a
                    href={formData.damage_deposit_document_url}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 inline-flex text-xs font-medium text-emerald-700 hover:text-emerald-800"
                  >
                    {tr('View captured photo', 'Voir la photo prise')}
                  </a>
                ) : (
                  <p className="mt-1 text-xs text-gray-600">
                    {tr('Physical document is being held without a photo.', 'Le document physique est retenu sans photo.')}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => onDocumentClear?.()}
                disabled={disabled}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-red-200 bg-white text-red-500 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                aria-label={tr('Remove document', 'Supprimer le document')}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        ) : (
          <p className="mt-3 text-xs text-gray-600">
            {tr(
              'Choose one of the options if you want to hold an ID or passport as extra security.',
              'Choisissez une des options si vous souhaitez retenir une pièce d’identité ou un passeport comme garantie supplémentaire.'
            )}
          </p>
        )}
      </div>
      )}
    </div>
  );
};

// ==================== ENHANCED PHONE INPUT WITH REAL-TIME VALIDATION ====================
const PhoneInputWithCountryCode = ({ 
  value, 
  onChange, 
  error, 
  disabled, 
  countryCode: externalCountryCode,
  onCountryCodeChange 
}) => {
  const countryCodes = PHONE_COUNTRY_CODES;

  const [countryCode, setCountryCode] = useState('+212');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [validationError, setValidationError] = useState('');
  const [whatsAppLink, setWhatsAppLink] = useState('');
  const [isWhatsAppAvailable, setIsWhatsAppAvailable] = useState(false);
  const dropdownRef = useRef(null);

  const getCountryConfig = (code) => {
    return countryCodes.find(c => c.code === code) || countryCodes[0];
  };

  const validatePhoneNumber = (fullNumber, countryConfig) => {
    if (!fullNumber) {
      setValidationError('');
      setWhatsAppLink('');
      setIsWhatsAppAvailable(false);
      return false;
    }

    const digitsOnly = fullNumber.replace(/\D/g, '');
    const expectedDigits = countryConfig.digits;
    
    if (!fullNumber.startsWith('+')) {
      setValidationError(`Phone number must start with country code (e.g., ${countryConfig.code})`);
      setWhatsAppLink('');
      setIsWhatsAppAvailable(false);
      return false;
    }

    if (!fullNumber.startsWith(countryConfig.code)) {
      setValidationError(`Number must start with ${countryConfig.code} for ${countryConfig.name}`);
      setWhatsAppLink('');
      setIsWhatsAppAvailable(false);
      return false;
    }

    const numberWithoutCountryCode = digitsOnly.replace(countryConfig.code.replace('+', ''), '');
    
    if (numberWithoutCountryCode.length < expectedDigits) {
      setValidationError(`${countryConfig.name} numbers need ${expectedDigits} digits (currently ${numberWithoutCountryCode.length})`);
      setWhatsAppLink('');
      setIsWhatsAppAvailable(false);
      return false;
    }

    if (numberWithoutCountryCode.length > expectedDigits) {
      setValidationError(`${countryConfig.name} numbers should have exactly ${expectedDigits} digits (currently ${numberWithoutCountryCode.length})`);
      setWhatsAppLink('');
      setIsWhatsAppAvailable(false);
      return false;
    }

    if (!countryConfig.pattern.test(fullNumber.replace(/\s/g, ''))) {
      setValidationError(`Invalid ${countryConfig.name} number format. Example: ${countryConfig.example}`);
      setWhatsAppLink('');
      setIsWhatsAppAvailable(false);
      return false;
    }

    const cleanNumber = fullNumber.replace(/\s/g, '').replace('+', '');
    
    if (countryConfig.code === '+212') {
      const moroccanMobilePrefix = numberWithoutCountryCode.substring(0, 1);
      const isMoroccanMobile = ['6', '7'].includes(moroccanMobilePrefix);
      
      if (isMoroccanMobile) {
        const whatsappUrl = `https://wa.me/${cleanNumber}`;
        setWhatsAppLink(whatsappUrl);
        setIsWhatsAppAvailable(true);
      } else {
        setIsWhatsAppAvailable(false);
        setWhatsAppLink('');
      }
    } else {
      const whatsappUrl = `https://wa.me/${cleanNumber}`;
      setWhatsAppLink(whatsappUrl);
      setIsWhatsAppAvailable(true);
    }

    setValidationError('');
    return true;
  };

  useEffect(() => {
    if (externalCountryCode) {
      setCountryCode(externalCountryCode);
    }
    
    if (value) {
      const matchedCode = countryCodes.find(code => value.startsWith(code.code));
      if (matchedCode) {
        setCountryCode(matchedCode.code);
        const numberPart = value.replace(matchedCode.code, '').trim();
        setPhoneNumber(numberPart);
        validatePhoneNumber(value, matchedCode);
      } else if (value.startsWith('+')) {
        const plusIndex = value.indexOf('+');
        const spaceIndex = value.indexOf(' ', plusIndex);
        if (spaceIndex > -1) {
          const possibleCode = value.substring(plusIndex, spaceIndex);
          const countryConfig = getCountryConfig(possibleCode);
          setCountryCode(possibleCode);
          setPhoneNumber(value.substring(spaceIndex).trim());
          validatePhoneNumber(value, countryConfig);
        } else {
          setPhoneNumber(value);
          validatePhoneNumber(value, getCountryConfig(countryCode));
        }
      } else {
        setPhoneNumber(value);
        validatePhoneNumber(value, getCountryConfig(countryCode));
      }
    }
  }, [value]);

  useEffect(() => {
    if (phoneNumber) {
      const fullNumber = `${countryCode} ${phoneNumber}`;
      const countryConfig = getCountryConfig(countryCode);
      validatePhoneNumber(fullNumber, countryConfig);
    }
  }, [countryCode]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsDropdownOpen(false);
        setSearchTerm('');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const formatPhoneNumber = (input) => {
    const digits = input.replace(/\D/g, '');
    
    if (digits.startsWith('0') && countryCode === '+212') {
      const moroccanNumber = digits.substring(1);
      const formatted = `+212 ${moroccanNumber}`;
      const countryConfig = getCountryConfig('+212');
      validatePhoneNumber(formatted, countryConfig);
      return formatted;
    }
    
    if (!input.startsWith('+') && digits.length > 0) {
      const formatted = `${countryCode} ${digits}`;
      const countryConfig = getCountryConfig(countryCode);
      validatePhoneNumber(formatted, countryConfig);
      return formatted;
    }
    
    const countryConfig = getCountryConfig(countryCode);
    validatePhoneNumber(input, countryConfig);
    return input;
  };

  const handlePhoneChange = (e) => {
    let input = e.target.value;
    
    if (input.startsWith('0') && countryCode === '+212') {
      const moroccanNumber = input.substring(1);
      const formatted = `+212 ${moroccanNumber}`;
      setPhoneNumber(moroccanNumber);
      onChange(formatted);
      return;
    }
    
    if (input.startsWith('+')) {
      setPhoneNumber(input);
      onChange(input);
      return;
    }
    
    const formatted = formatPhoneNumber(input);
    const digits = input.replace(/\D/g, '');
    setPhoneNumber(digits);
    onChange(formatted);
  };

  const handleCountryCodeChange = (newCode) => {
    setCountryCode(newCode);
    if (onCountryCodeChange) {
      onCountryCodeChange(newCode);
    }
    
    if (phoneNumber) {
      const countryConfig = getCountryConfig(newCode);
      const formatted = `${newCode} ${phoneNumber}`;
      validatePhoneNumber(formatted, countryConfig);
      onChange(formatted);
    }
    setIsDropdownOpen(false);
    setSearchTerm('');
  };

  const filteredCountries = countryCodes.filter(country =>
    country.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    country.code.includes(searchTerm)
  );

  const selectedCountry = getCountryConfig(countryCode);
  const displayError = validationError || error;

  return (
    <div>
      <label className="block text-sm font-semibold text-slate-700 mb-2">
        Phone *
      </label>
      <div className="relative flex items-stretch overflow-visible rounded-2xl border border-slate-200 bg-white transition focus-within:border-violet-400 focus-within:ring-4 focus-within:ring-violet-100">
        <div className="relative" ref={dropdownRef}>
          <button
            type="button"
            onClick={() => !disabled && setIsDropdownOpen(!isDropdownOpen)}
            disabled={disabled}
            className={`flex h-full min-h-[56px] items-center gap-3 rounded-l-2xl border-r border-slate-200 bg-slate-50 px-5 text-slate-900 transition-colors hover:bg-slate-100 ${
              disabled ? 'opacity-50 cursor-not-allowed' : ''
            } ${displayError ? 'border-red-400' : ''}`}
          >
            <span className="text-lg">{selectedCountry.flag}</span>
            <span className="text-base font-semibold">{selectedCountry.code}</span>
            <ChevronDown className={`h-4 w-4 text-slate-700 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`} />
          </button>

          {isDropdownOpen && !disabled && (
            <div className="absolute left-0 top-full z-20 mt-2 max-h-80 min-w-[18rem] w-[min(22rem,calc(100vw-2rem))] max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_20px_50px_rgba(15,23,42,0.18)] sm:z-50">
              <div className="border-b border-slate-100 p-3">
                <div className="relative">
                  <UserSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Search country..."
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 pl-9 text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-violet-500"
                    autoFocus
                  />
                </div>
              </div>

              <div className="overflow-y-auto max-h-64">
                {filteredCountries.length > 0 ? (
                  filteredCountries.map((country) => (
                    <button
                      key={country.code}
                      type="button"
                      onClick={() => handleCountryCodeChange(country.code)}
                      className="flex w-full items-center gap-3 border-b border-slate-100 px-4 py-3 text-left hover:bg-violet-50 last:border-b-0"
                    >
                      <span className="text-xl">{country.flag}</span>
                      <div className="flex-1 text-left">
                        <div className="font-semibold text-slate-900">{country.name}</div>
                        <div className="text-sm text-slate-500">{country.code} ({country.digits} digits)</div>
                      </div>
                      {countryCode === country.code && (
                        <Check className="h-4 w-4 text-emerald-500" />
                      )}
                    </button>
                  ))
                ) : (
                  <div className="px-4 py-6 text-center text-sm font-medium text-slate-500">
                    No countries found. Try typing the country name or code.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="relative min-w-0 flex-1">
          <Phone className="absolute left-5 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
          <input
            type="tel"
            value={phoneNumber}
            onChange={handlePhoneChange}
            onFocus={(e) => {
              if (!phoneNumber && countryCode === '+212') {
                e.target.placeholder = "6XX XXX XXX";
              }
            }}
            placeholder={selectedCountry.code === '+212' ? "6XX XXX XXX" : "Phone number"}
            disabled={disabled}
            className={`min-h-[56px] w-full rounded-r-2xl bg-white px-5 py-4 pl-14 text-base font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-violet-500 ${
              displayError ? 'text-red-600 placeholder:text-red-300' : 'placeholder:text-slate-400'
            } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
          />
        </div>
      </div>
      
      <div className="mt-2 space-y-1">
        {displayError && (
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-500" />
            <p className="text-xs font-medium text-red-500">{displayError}</p>
          </div>
        )}
        
        {isWhatsAppAvailable && !displayError && value && (
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-500"></div>
            <p className="text-green-600 text-xs">
              ✓ Valid {selectedCountry.name} number
              {whatsAppLink && (
                <>
                  {' • '}
                  <a
                    href={whatsAppLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:underline font-medium"
                  >
                    WhatsApp available
                  </a>
                </>
              )}
            </p>
          </div>
        )}
        
        {!displayError && (
          <p className="text-xs font-medium text-slate-500">
            {selectedCountry.code === '+212' 
              ? "Moroccan format: +212 6XX XXX XXX (9 digits)"
              : `Format: ${selectedCountry.example} (${selectedCountry.digits} digits)`}
          </p>
        )}
      </div>
    </div>
  );
};

// ==================== VEHICLE PRICE PREVIEW COMPONENT ====================
const VehiclePricePreview = ({ vehicle, rentalType, duration, vehicleModels = [], isMobile = false, availablePackages = [], selectedPackageId = null, usePackagePricing = false }) => {
  const [priceInfo, setPriceInfo] = useState({ 
    basePrice: 0, 
    tierPrice: 0, 
    total: 0, 
    loading: true,
    tierName: '',
    modelType: '',
    packagePrice: null,
    packageName: null,
    isPackagePricing: false,
    isFlatTierTotal: false,
    fixedPackageAmount: 0,
    packageIncludedKm: null,
    packageExtraRate: 0
  });
  const [showBreakdown, setShowBreakdown] = useState(false);

  useEffect(() => {
    const calculatePricing = async () => {
      if (!vehicle || !rentalType || !duration || duration <= 0) {
        setPriceInfo({ basePrice: 0, tierPrice: 0, total: 0, loading: false });
        return;
      }

      try {
        const modelId = vehicle.vehicle_model_id;
        if (!modelId) {
          setPriceInfo({ basePrice: 0, tierPrice: 0, total: 0, loading: false });
          return;
        }

        const { data: basePriceData } = await supabase
          .from('app_4c3a7a6153_base_prices')
          .select('hourly_price, daily_price')
          .eq('vehicle_model_id', modelId)
          .eq('is_active', true)
          .single();

        let basePrice = 0;
        let modelType = vehicle.model || '';
        
        if (basePriceData) {
          if (rentalType === 'hourly') {
            basePrice = basePriceData.hourly_price || 0;
          } else {
            basePrice = basePriceData.daily_price || 0;
          }
        } else {
          const { data: modelData } = await supabase
            .from('saharax_0u4w4d_vehicle_models')
            .select('daily_price, hourly_price, model')
            .eq('id', modelId)
            .single();

          if (modelData) {
            if (rentalType === 'hourly') {
              basePrice = modelData.hourly_price || 0;
            } else {
              basePrice = modelData.daily_price || 0;
            }
            modelType = modelData.model || '';
          }
        }

        if (basePrice === 0) {
          const vehicleModelUpper = (vehicle.model || '').toUpperCase();
          
          if (vehicleModelUpper.includes('AT6')) {
            basePrice = rentalType === 'hourly' ? 599 : 1999;
          } else if (vehicleModelUpper.includes('AT10')) {
            basePrice = rentalType === 'hourly' ? 999 : 3499;
          } else if (vehicleModelUpper.includes('AT5')) {
            basePrice = rentalType === 'hourly' ? 399 : 1499;
          } else {
            basePrice = rentalType === 'hourly' ? 400 : 1500;
          }
        }

        // Check if a package is selected
        let packagePricePerUnit = null;
        let packageName = null;
        let fixedPackageAmount = 0;
        let packageIncludedKm = null;
        let packageExtraRate = 0;

        if (usePackagePricing && selectedPackageId && availablePackages.length > 0) {
          const selectedPkg = availablePackages.find(p => p.id === selectedPackageId);
          if (selectedPkg) {
            // Rental KM packages are priced per selected rental unit (hour/day).
            fixedPackageAmount = parseFloat(selectedPkg.fixed_amount) || 0;
            packageIncludedKm = selectedPkg.included_kilometers;
            packageExtraRate = parseFloat(selectedPkg.extra_km_rate) || 0;
            packageName = selectedPkg.name;
            packagePricePerUnit = fixedPackageAmount;
          }
        }

        // If package pricing is active, use it instead of tier pricing
        if (packagePricePerUnit !== null) {
          const totalAmount = packagePricePerUnit * duration;

          setPriceInfo({
            basePrice,
            tierPrice: packagePricePerUnit,
            total: totalAmount,
            loading: false,
            tierName: `Package: ${packageName}`,
            modelType: modelType || vehicle.model || '',
            packagePrice: packagePricePerUnit,
            packageName,
            isPackagePricing: true,
            isFlatTierTotal: false,
            fixedPackageAmount: packagePricePerUnit,
            packageIncludedKm,
            packageExtraRate
          });

          console.log(`📦 Package selected: ${packageName}, fixed package price: ${packagePricePerUnit} MAD`);
          return;
        }

        // Otherwise calculate tier pricing
        let tierPrice = basePrice;
        let tierName = 'Base rate';
        let isFlatTierTotal = false;
        
        if (rentalType === 'daily' && duration > 1) {
          const { data: pricingTiers, error } = await supabase
            .from('pricing_tiers')
            .select('*')
            .eq('vehicle_model_id', modelId)
            .eq('is_active', true)
            .eq('duration_type', 'days');
          
          if (!error && pricingTiers && pricingTiers.length > 0) {
            let matchingTier = null;
            for (const tier of pricingTiers) {
              const hasDailyPrice = tier.daily_price_amount && tier.daily_price_amount > 0;
              const hasDayRange = (tier.min_days !== null && tier.max_days !== null);
              
              if (hasDailyPrice && hasDayRange) {
                const minDays = tier.min_days || 1;
                const maxDays = tier.max_days || 999;
                
                if (duration >= minDays && duration <= maxDays) {
                  matchingTier = tier;
                  break;
                }
              }
            }
            
            if (matchingTier) {
              tierPrice = parseFloat(matchingTier.daily_price_amount);
              const minDays = matchingTier.min_days || 1;
              const maxDays = matchingTier.max_days || '∞';
              
              if (tierPrice < basePrice) {
                const discountPercent = Math.round(((basePrice - tierPrice) / basePrice) * 100);
                tierName = `${minDays}-${maxDays} day tier (${discountPercent}% off)`;
              } else {
                tierName = `${minDays}-${maxDays} day tier`;
              }
            }
          }
        }

        if (rentalType === 'hourly' && duration > 1) {
          const { data: pricingTiers, error } = await supabase
            .from('pricing_tiers')
            .select('*')
            .eq('vehicle_model_id', modelId)
            .eq('is_active', true)
            .eq('duration_type', 'hours');
          
          if (!error && pricingTiers && pricingTiers.length > 0) {
            let matchingTier = null;
            for (const tier of pricingTiers) {
              const hasHourlyPrice = tier.price_amount && tier.price_amount > 0;
              const hasHourRange = (tier.min_hours !== null && tier.max_hours !== null);
              
              if (hasHourlyPrice && hasHourRange) {
                const minHours = tier.min_hours || 1;
                const maxHours = tier.max_hours || 999;
                
                if (duration >= minHours && duration <= maxHours) {
                  matchingTier = tier;
                  break;
                }
              }
            }
            
            if (matchingTier) {
              tierPrice = parseFloat(matchingTier.price_amount);
              const minHours = matchingTier.min_hours || 1;
              const maxHours = matchingTier.max_hours || '∞';
              isFlatTierTotal = matchingTier.calculation_method === 'fixed' && Number(duration) === 1.5;
              
              if (tierPrice < basePrice) {
                const discountPercent = Math.round(((basePrice - tierPrice) / basePrice) * 100);
                tierName = `${minHours}-${maxHours} hour tier (${discountPercent}% off)`;
              } else {
                tierName = `${minHours}-${maxHours} hour tier`;
              }
            }
          }
        }

        const total = isFlatTierTotal ? tierPrice : tierPrice * duration;
        
        setPriceInfo({
          basePrice,
          tierPrice,
          total,
          loading: false,
          tierName,
          modelType: modelType || vehicle.model || '',
          isPackagePricing: false,
          isFlatTierTotal
        });

      } catch (error) {
        let fallbackPrice = 1500;
        const vehicleModel = vehicle.model || '';
        
        if (vehicleModel.includes('AT6')) {
          fallbackPrice = rentalType === 'hourly' ? 580 : 2000;
        } else if (vehicleModel.includes('AT10')) {
          fallbackPrice = rentalType === 'hourly' ? 1000 : 3500;
        } else if (vehicleModel.includes('AT5')) {
          fallbackPrice = rentalType === 'hourly' ? 380 : 1500;
        }
        
        setPriceInfo({ 
          basePrice: fallbackPrice, 
          tierPrice: fallbackPrice, 
          total: fallbackPrice * duration, 
          loading: false,
          tierName: 'Base rate',
          modelType: vehicleModel,
          isFlatTierTotal: false
        });
      }
    };

    calculatePricing();
  }, [vehicle, rentalType, duration, selectedPackageId, usePackagePricing, availablePackages]);

  if (!vehicle || !rentalType || duration <= 0) return null;

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-MA', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount || 0);
  };

  const isPackagePricing = priceInfo.isPackagePricing;
  const isFlatTierTotal = priceInfo.isFlatTierTotal;
  const isTierPricing = !isPackagePricing && duration > 1 && priceInfo.tierPrice !== priceInfo.basePrice;

  if (isMobile) {
    return (
      <div className="text-xs">
        <div className="flex items-center justify-between mb-1">
          <span className="text-gray-500">Rate:</span>
          <div className="flex items-center gap-1">
            {isPackagePricing && (
              <span className="text-xs bg-purple-100 text-purple-700 px-1 rounded mr-1">PKG</span>
            )}
            {!isPackagePricing && isTierPricing && priceInfo.basePrice > priceInfo.tierPrice && (
              <span className="text-gray-400 line-through">{formatCurrency(priceInfo.basePrice)}</span>
            )}
            <span className={`font-bold ${isPackagePricing ? 'text-purple-600' : (isTierPricing ? 'text-green-600' : 'text-blue-600')}`}>
              {formatCurrency(priceInfo.tierPrice)} MAD
            </span>
          </div>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-gray-500">Total:</span>
          <span className="font-bold text-gray-900">{formatCurrency(priceInfo.total)} MAD</span>
        </div>
        {isPackagePricing && (
          <div className="mt-1 text-purple-600 text-xs">
            <span>Package: {priceInfo.packageName} &bull; fixed {formatCurrency(priceInfo.tierPrice)} MAD</span>
          </div>
        )}
        {isFlatTierTotal && (
          <div className="mt-1 text-blue-600 text-xs">
            <span>Fixed 1.5-hour tier total</span>
          </div>
        )}
        {!isPackagePricing && isTierPricing && (
          <div className="mt-1 text-green-600 text-xs">
            <span>Save {formatCurrency(isFlatTierTotal ? ((priceInfo.basePrice * duration) - priceInfo.tierPrice) : ((priceInfo.basePrice - priceInfo.tierPrice) * duration))}</span>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="mt-2">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          {isPackagePricing && (
            <span className="text-xs px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-700">
              PACKAGE
            </span>
          )}
          <span className="text-sm font-medium text-gray-700 truncate">
            {priceInfo.modelType || vehicle.model}
          </span>
          <span className="text-xs px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 whitespace-nowrap flex-shrink-0">
            {duration} {rentalType === 'hourly' ? 'hrs' : 'days'}
          </span>
        </div>
        <button
          type="button"
          onClick={() => setShowBreakdown(!showBreakdown)}
          className="text-xs text-blue-600 hover:text-blue-800 active:text-blue-900 flex items-center gap-1 py-1 touch-manipulation self-end sm:self-auto"
        >
          {showBreakdown ? 'Hide' : 'Show'} details
          {showBreakdown ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </button>
      </div>

      {priceInfo.loading ? (
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Loader className="w-3 h-3 animate-spin" />
          Calculating...
        </div>
      ) : (
        <>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 sm:gap-2 mb-2">
            <span className="text-sm text-gray-600">
              {isPackagePricing ? 'Package rate:' : isFlatTierTotal ? 'Tier total:' : (rentalType === 'hourly' ? 'Hourly rate:' : 'Daily rate:')}
            </span>
            <div className="flex flex-wrap items-center gap-2 justify-end">
              {isPackagePricing && (
                <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">
                  Fixed rate package
                </span>
              )}
              {isFlatTierTotal && (
                <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                  Fixed 1.5h tier
                </span>
              )}
              {!isPackagePricing && isTierPricing && priceInfo.basePrice > priceInfo.tierPrice && (
                <span className="text-xs text-gray-400 line-through">
                  {formatCurrency(priceInfo.basePrice)}
                </span>
              )}
              <span className={`text-lg sm:text-xl font-bold ${
                isPackagePricing ? 'text-purple-600' :
                (isTierPricing && priceInfo.tierPrice < priceInfo.basePrice ? 'text-green-600' : 'text-blue-600')
              }`}>
                {formatCurrency(priceInfo.tierPrice)} MAD
              </span>
            </div>
          </div>
          
          {isPackagePricing && (
            <div className="space-y-2">
              {/* Package Total - More compact and cleaner */}
              <div className="flex items-center justify-between bg-purple-50 px-3 py-2 rounded-lg">
                <span className="text-sm font-medium text-purple-700">{tr('Package Total:', 'Total du forfait :')}</span>
                <span className="text-lg font-bold text-purple-700">{formatCurrency(priceInfo.total)} MAD</span>
              </div>
              
              {/* Package Calculation - Single line, more compact */}
              <div className="flex items-center justify-between text-xs text-gray-600 bg-white px-3 py-2 rounded-lg border border-purple-100">
                <span>
                  Fixed package price
                </span>
                <span className="font-medium text-purple-600">= {formatCurrency(priceInfo.total)} MAD</span>
              </div>
              
              {/* Package Features - Side by side, showing TOTAL included km */}
              <div className="flex gap-2 mt-1">
                {priceInfo.packageIncludedKm && (
                  <div className="flex-1 bg-green-50 px-2 py-1.5 rounded-lg border border-green-100">
                    <div className="flex flex-col">
                      <span className="text-xs text-green-700 font-medium">
                        ✓ {priceInfo.packageIncludedKm} km included
                      </span>
                    </div>
                  </div>
                )}
                {priceInfo.packageExtraRate > 0 && (
                  <div className="flex-1 bg-orange-50 px-2 py-1.5 rounded-lg border border-orange-100">
                    <span className="text-xs text-orange-600 font-medium">+{formatCurrency(priceInfo.packageExtraRate)} MAD/km extra</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {!isPackagePricing && isTierPricing && priceInfo.tierPrice < priceInfo.basePrice && (
            <div className="flex justify-end mb-2">
              <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full">
                Save {formatCurrency(isFlatTierTotal ? ((priceInfo.basePrice * duration) - priceInfo.tierPrice) : ((priceInfo.basePrice - priceInfo.tierPrice) * duration))}
              </span>
            </div>
          )}

          {/* Standard Tier Display - More compact */}
          {!isPackagePricing && (
            <div className="flex items-center justify-between bg-gray-50 px-3 py-2 rounded-lg">
              <span className="text-sm font-medium text-gray-700">Total:</span>
              <span className="text-lg font-bold text-gray-900">{formatCurrency(priceInfo.total)} MAD</span>
            </div>
          )}

          {/* Detailed Breakdown - More compact */}
          {showBreakdown && !isPackagePricing && (
            <div className="mt-2 pt-2 border-t border-gray-100 space-y-1.5 text-xs">
              {isTierPricing && priceInfo.basePrice !== priceInfo.tierPrice && (
                <div className="flex justify-between text-gray-600">
                  <span>Regular rate:</span>
                  <span className="line-through">{formatCurrency(priceInfo.basePrice)} MAD</span>
                </div>
              )}
              
              <div className="flex justify-between text-gray-600">
                <span>Calculation:</span>
                <span>{isFlatTierTotal ? 'Fixed 1.5-hour tier total' : `${formatCurrency(priceInfo.tierPrice)} × ${duration}`}</span>
              </div>
              
              {isTierPricing && priceInfo.tierPrice < priceInfo.basePrice && (
                <div className="bg-green-50 px-2 py-1.5 rounded border border-green-100">
                  <div className="flex justify-between text-green-700">
                    <span className="font-medium">Savings:</span>
                    <span className="font-bold">{formatCurrency(isFlatTierTotal ? ((priceInfo.basePrice * duration) - priceInfo.tierPrice) : ((priceInfo.basePrice - priceInfo.tierPrice) * duration))} MAD</span>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
};

const LightVehiclePriceLabel = ({ vehicle, rentalType, duration }) => {
  const [displayPrice, setDisplayPrice] = useState(0);

  useEffect(() => {
    let cancelled = false;

    const calculateDisplayPrice = async () => {
      if (!vehicle || !rentalType || !duration || duration <= 0) {
        if (!cancelled) setDisplayPrice(0);
        return;
      }

      const normalizedDuration = Number(duration) || 1;

      try {
        const modelId = vehicle.vehicle_model_id;
        if (!modelId) {
          if (!cancelled) setDisplayPrice(0);
          return;
        }

        if (rentalType === 'hourly' && normalizedDuration === 0.5) {
          const { data: packageRows, error: packageError } = await supabase
            .from('app_4c3a7a6153_rental_km_packages')
            .select('*, rate_types(name)')
            .eq('vehicle_model_id', modelId)
            .eq('is_active', true)
            .or('rate_type_id.eq.1,rate_type_id.is.null')
            .order('fixed_amount', { ascending: true });

          if (!packageError) {
            const matchingPackage = findMatchingDurationPackage(packageRows || [], 'hourly', 0.5);
            const packagePrice = Number(
              matchingPackage?.fixed_amount
              ?? matchingPackage?.package_rate
              ?? matchingPackage?.rate
              ?? matchingPackage?.price
              ?? 0
            ) || 0;

            if (packagePrice > 0) {
              if (!cancelled) setDisplayPrice(packagePrice);
              return;
            }
          }
        }

        let basePrice = 0;

        const { data: basePriceData } = await supabase
          .from('app_4c3a7a6153_base_prices')
          .select('hourly_price, daily_price')
          .eq('vehicle_model_id', modelId)
          .eq('is_active', true)
          .single();

        if (basePriceData) {
          basePrice = rentalType === 'hourly'
            ? Number(basePriceData.hourly_price) || 0
            : Number(basePriceData.daily_price) || 0;
        }

        let resolvedPrice = basePrice;

        if (rentalType === 'hourly' && normalizedDuration > 1) {
          const { data: pricingTiers } = await supabase
            .from('pricing_tiers')
            .select('*')
            .eq('vehicle_model_id', modelId)
            .eq('is_active', true)
            .eq('duration_type', 'hours');

          const matchingTier = (pricingTiers || []).find((tier) => {
            const minHours = Number(tier.min_hours ?? 0);
            const maxHours = Number(tier.max_hours ?? 0);
            const tierPrice = Number(tier.price_amount ?? 0);
            return tierPrice > 0 && normalizedDuration >= minHours && normalizedDuration <= maxHours;
          });

          if (matchingTier) {
            const tierPrice = Number(matchingTier.price_amount) || resolvedPrice;
            const isFlatTierTotal =
              matchingTier.calculation_method === 'fixed' && normalizedDuration === 1.5;
            resolvedPrice = isFlatTierTotal ? tierPrice : tierPrice * normalizedDuration;
          } else if (basePrice > 0) {
            resolvedPrice = basePrice * normalizedDuration;
          }
        }

        if (rentalType === 'daily' && normalizedDuration > 1) {
          const { data: pricingTiers } = await supabase
            .from('pricing_tiers')
            .select('*')
            .eq('vehicle_model_id', modelId)
            .eq('is_active', true)
            .eq('duration_type', 'days');

          const matchingTier = (pricingTiers || []).find((tier) => {
            const minDays = Number(tier.min_days ?? 1);
            const maxDays = Number(tier.max_days ?? Number.MAX_SAFE_INTEGER);
            const tierPrice = Number(tier.daily_price_amount ?? 0);
            return tierPrice > 0 && normalizedDuration >= minDays && normalizedDuration <= maxDays;
          });

          if (matchingTier) {
            const tierPrice = Number(matchingTier.daily_price_amount) || resolvedPrice;
            resolvedPrice = tierPrice * normalizedDuration;
          } else if (basePrice > 0) {
            resolvedPrice = basePrice * normalizedDuration;
          }
        }

        if (!resolvedPrice) {
          const vehicleModelUpper = String(vehicle.model || '').toUpperCase();
          if (vehicleModelUpper.includes('AT6')) {
            resolvedPrice = rentalType === 'hourly' ? 599 : 1999;
          } else if (vehicleModelUpper.includes('AT10')) {
            resolvedPrice = rentalType === 'hourly' ? 999 : 3499;
          } else if (vehicleModelUpper.includes('AT5')) {
            resolvedPrice = rentalType === 'hourly' ? 399 : 1499;
          } else {
            resolvedPrice = rentalType === 'hourly' ? 400 : 1500;
          }
        }

        if (!cancelled) {
          setDisplayPrice(resolvedPrice);
        }
      } catch (error) {
        const vehicleModelUpper = String(vehicle?.model || '').toUpperCase();
        let fallbackPrice = rentalType === 'hourly' ? 400 : 1500;

        if (vehicleModelUpper.includes('AT6')) {
          fallbackPrice = rentalType === 'hourly' ? 599 : 1999;
        } else if (vehicleModelUpper.includes('AT10')) {
          fallbackPrice = rentalType === 'hourly' ? 999 : 3499;
        } else if (vehicleModelUpper.includes('AT5')) {
          fallbackPrice = rentalType === 'hourly' ? 399 : 1499;
        }

        if (!cancelled) {
          const fallbackTotal = normalizedDuration > 1
            ? fallbackPrice * normalizedDuration
            : fallbackPrice;
          setDisplayPrice(fallbackTotal);
        }
      }
    };

    calculateDisplayPrice();

    return () => {
      cancelled = true;
    };
  }, [duration, rentalType, vehicle]);

  return <>{formatDynamicMad(displayPrice)} MAD</>;
};

// ==================== ENHANCED TIER PRICING BREAKDOWN ====================
const TierPricingBreakdown = ({ 
  vehicleName, 
  vehicleModelId,
  duration, 
  unitPrice, 
  rentalType,
  availableVehicles = [],
  pricingComputationMode = 'per_unit'
}) => {
  const [baseRate, setBaseRate] = useState(0);
  const [loading, setLoading] = useState(true);
  const [priceSource, setPriceSource] = useState('unknown');
  const [tierName, setTierName] = useState('');
  const [matchedTierPrice, setMatchedTierPrice] = useState(0);
  const [hasMatchedTier, setHasMatchedTier] = useState(false);

  if (rentalType === 'daily' && duration <= 1) {
    return null;
  }

  useEffect(() => {
    const fetchBaseRate = async () => {
      if (!vehicleModelId || !rentalType || !duration || duration <= 0 || !unitPrice) {
        setLoading(false);
        return;
      }

      try {
        let baseRate = 0;
        let priceSource = '';

        let matchedTierPrice = 0;
        let hasTierMatch = false;

        if (rentalType === 'hourly') {
          const { data: basePrices, error: baseError } = await supabase
            .from('app_4c3a7a6153_base_prices')
            .select('hourly_price')
            .eq('vehicle_model_id', vehicleModelId)
            .eq('is_active', true)
            .single();

          if (!baseError && basePrices?.hourly_price) {
            baseRate = parseFloat(basePrices.hourly_price);
            priceSource = 'base_prices';
          }

          const { data: pricingTiers } = await supabase
            .from('pricing_tiers')
            .select('*')
            .eq('vehicle_model_id', vehicleModelId)
            .eq('is_active', true)
            .eq('duration_type', 'hours')
            .order('min_hours', { ascending: true });

          const matchingTier = (pricingTiers || []).find((tier) => {
            if (tier.min_hours === null || tier.max_hours === null || !tier.price_amount) return false;
            const min = parseFloat(tier.min_hours);
            const max = parseFloat(tier.max_hours);
            return duration >= min && duration <= max;
          });

          if (matchingTier) {
            matchedTierPrice = parseFloat(matchingTier.price_amount) || 0;
            hasTierMatch = true;
            const minHours = parseFloat(matchingTier.min_hours);
            const maxHours = parseFloat(matchingTier.max_hours);
            const durationRange = minHours === maxHours ? `${minHours}` : `${minHours}-${maxHours}`;
            if (duration === 1.5) {
              setTierName('1.5-hour special rate');
            } else if (matchedTierPrice < baseRate) {
              const discountPercent = baseRate > 0 ? Math.round(((baseRate - matchedTierPrice) / baseRate) * 100) : 0;
              setTierName(`${durationRange}-hour tier (${discountPercent}% off)`);
            } else {
              setTierName(`${durationRange}-hour tier`);
            }
          }
        } else if (rentalType === 'daily') {
          const { data: basePrices, error: baseError } = await supabase
            .from('app_4c3a7a6153_base_prices')
            .select('daily_price')
            .eq('vehicle_model_id', vehicleModelId)
            .eq('is_active', true)
            .single();

          if (!baseError && basePrices?.daily_price) {
            baseRate = parseFloat(basePrices.daily_price);
            priceSource = 'base_prices';
          }

          const { data: pricingTiers } = await supabase
            .from('pricing_tiers')
            .select('*')
            .eq('vehicle_model_id', vehicleModelId)
            .eq('is_active', true)
            .eq('duration_type', 'days')
            .order('min_days', { ascending: true });

          const matchingTier = (pricingTiers || []).find((tier) => {
            if (!tier.daily_price_amount) return false;
            const min = tier.min_days ? parseInt(tier.min_days, 10) : 1;
            const max = tier.max_days ? parseInt(tier.max_days, 10) : Number.POSITIVE_INFINITY;
            return duration >= min && duration <= max;
          });

          if (matchingTier) {
            matchedTierPrice = parseFloat(matchingTier.daily_price_amount) || 0;
            hasTierMatch = true;
            const minDays = matchingTier.min_days || 1;
            const maxDays = matchingTier.max_days || minDays;
            const durationRange = minDays === maxDays ? `${minDays}` : `${minDays}-${maxDays}`;
            if (matchedTierPrice < baseRate) {
              const discountPercent = baseRate > 0 ? Math.round(((baseRate - matchedTierPrice) / baseRate) * 100) : 0;
              setTierName(`${durationRange}-day tier (${discountPercent}% off)`);
            } else {
              setTierName(`${durationRange}-day tier`);
            }
          }
        }

        if (!baseRate || baseRate <= 0) {
          const { data: modelData, error: modelError } = await supabase
            .from('saharax_0u4w4d_vehicle_models')
            .select(rentalType === 'hourly' ? 'hourly_price' : 'daily_price')
            .eq('id', vehicleModelId)
            .single();

          if (!modelError && modelData) {
            baseRate = parseFloat(rentalType === 'hourly' ? modelData.hourly_price : modelData.daily_price) || 0;
            priceSource = 'vehicle_models';
          }
        }

        if (!baseRate || baseRate <= 0) {
          if (vehicleModelId === '9f6cca16-9269-4a0e-9d99-d775d4c67b5b') {
            baseRate = rentalType === 'hourly' ? 399 : 1499;
            priceSource = 'fallback_at5';
          } else if (vehicleModelId === 'cec1ed26-b093-4482-9f0d-70eab752ee56') {
            baseRate = rentalType === 'hourly' ? 599 : 1999;
            priceSource = 'fallback_at6';
          } else if (vehicleModelId === 'dc2fcf54-1135-4149-a876-43d73e7fd87e') {
            baseRate = rentalType === 'hourly' ? 999 : 3499;
            priceSource = 'fallback_at10';
          } else {
            baseRate = rentalType === 'hourly' ? 400 : 1500;
            priceSource = 'fallback_generic';
          }
        }

        setBaseRate(baseRate);
        setMatchedTierPrice(matchedTierPrice);
        setHasMatchedTier(hasTierMatch);
        setPriceSource(hasTierMatch ? 'pricing_tiers' : priceSource);
        
        if (!hasTierMatch && rentalType === 'daily') {
          if (duration === 2) setTierName("2-day package deal");
          else if (duration === 3) setTierName("3-day special offer");
          else if (duration >= 4 && duration < 7) setTierName(`${duration}-day extended package`);
          else if (duration >= 7) setTierName("Weekly+ package (7+ days)");
          else setTierName(`${duration}-day package`);
        } else if (!hasTierMatch) {
          if (duration === 2) setTierName("2-hour special rate");
          else if (duration === 1.5) setTierName("1.5-hour special rate");
          else if (duration === 3) setTierName("3-hour package deal");
          else if (duration >= 4 && duration < 24) setTierName(`${duration}-hour bundle`);
          else if (duration >= 24) setTierName("Daily package (24h)");
          else setTierName(`${duration}-hour package`);
        }
        
      } catch (error) {
        if (vehicleModelId === '9f6cca16-9269-4a0e-9d99-d775d4c67b5b') {
          setBaseRate(rentalType === 'hourly' ? 399 : 1499);
        } else if (vehicleModelId === 'cec1ed26-b093-4482-9f0d-70eab752ee56') {
          setBaseRate(rentalType === 'hourly' ? 599 : 1999);
        } else if (vehicleModelId === 'dc2fcf54-1135-4149-a876-43d73e7fd87e') {
          setBaseRate(rentalType === 'hourly' ? 999 : 3499);
        } else {
          setBaseRate(rentalType === 'hourly' ? 400 : 1500);
        }
        setPriceSource('error_fallback');
        setMatchedTierPrice(0);
        setHasMatchedTier(false);
        setTierName(`${duration}-${rentalType === 'daily' ? 'day' : 'hour'} package`);
      } finally {
        setLoading(false);
      }
    };

    fetchBaseRate();
  }, [vehicleModelId, rentalType, duration, unitPrice]);

  if (loading || duration <= 1 || !unitPrice || !vehicleName || !rentalType) {
    return null;
  }

  if (baseRate <= 0) {
    return null;
  }

  const isFlatTierTotal = pricingComputationMode === 'flat_total';
  const appliedTierPrice = Number(unitPrice || 0) || 0;
  const standardComparisonPrice = hasMatchedTier ? matchedTierPrice : baseRate;
  const baseTotal = isFlatTierTotal ? standardComparisonPrice : duration * standardComparisonPrice;
  const tierTotal = isFlatTierTotal ? appliedTierPrice : duration * appliedTierPrice;
  const savings = Math.max(0, baseTotal - tierTotal);
  const savingsPercentage = baseTotal > 0 ? (savings / baseTotal * 100).toFixed(1) : 0;
  const isDiscounted = savings > 0 && standardComparisonPrice > 0;

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-MA', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  };

  const getPriceSourceBadge = () => {
    switch (priceSource) {
      case 'base_prices':
        return (
          <div className="flex items-center gap-1 text-xs text-green-600">
            <CheckCircle className="w-3 h-3" />
            <span>Base price from database</span>
          </div>
        );
      case 'vehicle_models':
        return (
          <div className="flex items-center gap-1 text-xs text-blue-600">
            <CheckCircle className="w-3 h-3" />
            <span>Base price from vehicle models</span>
          </div>
        );
      case 'pricing_tiers':
        return (
          <div className="flex items-center gap-1 text-xs text-violet-600">
            <CheckCircle className="w-3 h-3" />
            <span>Matched pricing tier</span>
          </div>
        );
      case 'fallback_at5':
      case 'fallback_at6':
      case 'fallback_at10':
        return (
          <div className="flex items-center gap-1 text-xs text-amber-600">
            <AlertCircle className="w-3 h-3" />
            <span>Base price from model type</span>
          </div>
        );
      default:
        return (
          <div className="flex items-center gap-1 text-xs text-blue-600">
            <Calculator className="w-3 h-3" />
            <span>System calculated base rate</span>
          </div>
        );
    }
  };

  const getPeriodLabelPlural = () => {
    return rentalType === 'daily' ? 'days' : 'hours';
  };

  return (
    <div className="mt-4 p-4 sm:p-5 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl border border-blue-200 shadow-sm">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <div className="flex items-start sm:items-center gap-3">
          <div className="w-12 h-12 sm:w-10 sm:h-10 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
            <Calculator className="w-6 h-6 sm:w-5 sm:h-5 text-blue-600" />
          </div>
          <div className="min-w-0">
            <h4 className="font-bold text-blue-900 text-base sm:text-lg">Tier Pricing Breakdown</h4>
            <p className="text-blue-600 text-sm truncate">{tierName}</p>
            {getPriceSourceBadge()}
          </div>
        </div>
      </div>
      
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
          <div className="bg-white p-3 sm:p-4 rounded-lg border border-blue-100">
            <div className="text-blue-700 text-xs font-medium mb-1">VEHICLE</div>
            <div className="text-sm sm:text-base font-semibold text-gray-900 truncate">{vehicleName}</div>
          </div>
          
          <div className="bg-white p-3 sm:p-4 rounded-lg border border-blue-100">
            <div className="text-blue-700 text-xs font-medium mb-1">DURATION</div>
            <div className="text-sm sm:text-base font-semibold text-gray-900">
              {duration === 1.5 ? '1.5 hours' : `${duration} ${duration > 1 ? getPeriodLabelPlural() : (rentalType === 'daily' ? 'day' : 'hour')}`}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
          <div className="bg-white p-4 rounded-lg border border-green-200 shadow-sm">
            <div className="text-green-700 text-xs font-medium mb-1">YOUR TIER RATE</div>
            <div className="text-2xl sm:text-3xl font-bold text-green-600">{formatCurrency(appliedTierPrice)}</div>
            <div className="text-green-600 text-sm">
              {isFlatTierTotal ? `MAD total for ${duration === 1.5 ? '1.5 hours' : 'this tier'}` : `MAD per ${rentalType === 'daily' ? 'day' : 'hour'}`}
            </div>
            <div className="text-xs text-green-500 mt-2 truncate">{tierName}</div>
          </div>
          
          <div className="bg-white p-4 rounded-lg border border-gray-100 shadow-sm">
            <div className="text-gray-500 text-xs font-medium mb-1">STANDARD RATE</div>
            <div className="text-xl sm:text-2xl text-gray-400 line-through">{formatCurrency(standardComparisonPrice)}</div>
            <div className="text-gray-500 text-sm">
              {isFlatTierTotal ? `MAD total for ${duration === 1.5 ? '1.5 hours' : 'this tier'}` : `MAD per ${rentalType === 'daily' ? 'day' : 'hour'}`}
            </div>
            <div className="text-xs text-gray-400 mt-2">{hasMatchedTier ? 'Matched tier from pricing management' : `Base ${rentalType} price`}</div>
          </div>
        </div>

        {isDiscounted && (
          <div className="bg-gradient-to-r from-green-50 to-emerald-50 p-4 rounded-lg border border-green-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                  <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div>
                  <div className="text-green-800 font-bold text-sm">{tr('Total Savings', 'Économies totales')}</div>
                  <div className="text-green-600 text-xs">{tr("You're paying less!", 'Vous payez moins !')}</div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-2xl font-bold text-green-700">{formatCurrency(savings)} MAD</div>
                <div className="text-green-600 text-sm">{savingsPercentage}% off</div>
              </div>
            </div>
            
            <div className="mt-3 text-xs text-green-700">
              <div className="flex justify-between mb-1">
                <span>Standard total:</span>
                <span className="line-through">{formatCurrency(baseTotal)} MAD</span>
              </div>
              <div className="flex justify-between">
                <span>Tier total:</span>
                <span className="font-bold">{formatCurrency(tierTotal)} MAD</span>
              </div>
            </div>
          </div>
        )}

        {!isDiscounted && hasMatchedTier && baseRate > 0 && (
          <div className="bg-gradient-to-r from-blue-50 to-cyan-50 p-4 rounded-lg border border-blue-200">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                <Info className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <div className="text-blue-800 font-bold text-sm">Tier Price Applied</div>
                <div className="text-blue-600 text-sm">{tierName || `${duration}-${rentalType === 'daily' ? 'day' : 'hour'} tier`} matched successfully</div>
              </div>
            </div>
            <div className="mt-2 text-xs text-blue-700">
              <div className="flex justify-between">
                <span>Calculated total:</span>
                <span className="font-bold">{formatCurrency(tierTotal)} MAD</span>
              </div>
            </div>
          </div>
        )}

        {!hasMatchedTier && baseRate > 0 && (
          <div className="bg-gradient-to-r from-slate-50 to-slate-100 p-4 rounded-lg border border-slate-200">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center">
                <Info className="w-5 h-5 text-slate-600" />
              </div>
              <div>
                <div className="text-slate-800 font-bold text-sm">Standard Base Rate Applied</div>
                <div className="text-slate-600 text-sm">No matching pricing tier was found for this duration</div>
              </div>
            </div>
          </div>
        )}

        <div className="text-xs text-gray-500 pt-3 border-t border-blue-100">
          <div className="flex items-start gap-2">
            <Info className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
            <div>
              <span className="font-medium text-gray-700">How tier pricing works:</span> 
              {rentalType === 'daily' ? (
                duration === 2 ? " Special discounted rate for 2-day rentals" :
                duration === 3 ? " Best value for 3-day rentals" :
                duration >= 4 && duration < 7 ? " Extended stay discount for 4-6 days" :
                duration >= 7 ? " Weekly+ package includes significant savings" :
                " Multi-day package discount"
              ) : (
                duration === 2 ? " Special discounted rate for 2-hour rentals" :
                duration === 3 ? " Best value for 3-hour rentals" :
                duration >= 4 && duration < 24 ? " Bundle discount for longer rentals" :
                " Daily rate includes significant savings over hourly pricing"
              )}
              <div className="mt-1 text-gray-600">
                {duration === 1 
                  ? "Single hour/day rentals use standard pricing" 
                  : "Multi-hour/day rentals qualify for tier discounts"
                }
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// Update the KMPackagesTab component with collapsible calculator

const KMPackagesTab = ({ 
  packages = [],
  selectedPackageId,
  onPackageSelect,
  onPackageCalculations,
  rentalType,
  duration,
  disabled,
  onPriceOverride,
  formData,
  setFormData
}) => {
  const [expandedPackage, setExpandedPackage] = useState(null);
  const [estimatedKms, setEstimatedKms] = useState(150);
  const [showCalculator, setShowCalculator] = useState(false);
  const [selectedPackage, setSelectedPackage] = useState(null);
  const [hasOverridden, setHasOverridden] = useState(false);
  const activeDurationLabel = formatRentalDurationLabel(rentalType, duration, tr);

  useEffect(() => {
    if (!selectedPackageId) {
      setSelectedPackage(null);
      setExpandedPackage(null);
      setShowCalculator(false);
      return;
    }

    const matchedPackage = packages.find((pkg) => String(pkg.id) === String(selectedPackageId));
    if (matchedPackage) {
      setSelectedPackage(matchedPackage);
      setExpandedPackage((prev) => (prev?.id === matchedPackage.id ? matchedPackage : prev));
    } else {
      setSelectedPackage(null);
      setExpandedPackage(null);
      setShowCalculator(false);
    }
  }, [selectedPackageId, packages]);

  // Calculate total included kilometers for the entire duration
  const getTotalIncludedKm = (pkg) => {
    if (!pkg || !pkg.included_kilometers) return null;
    return pkg.included_kilometers;
  };

  // Calculate total cost based on estimated kilometers
  const calculateTotalCost = (pkg, kms) => {
    if (!pkg) return 0;
    
    const ratePerUnit = parseFloat(pkg.fixed_amount) || 0;
    const baseRentalCost = ratePerUnit;
    
    if (!pkg.included_kilometers) return baseRentalCost;
    
    const extraRate = parseFloat(pkg.extra_km_rate) || 0;
    const totalIncludedKm = pkg.included_kilometers;
    
    if (kms <= totalIncludedKm) {
      return baseRentalCost;
    }
    
    const extraKms = kms - totalIncludedKm;
    const extraCost = extraKms * extraRate;
    return baseRentalCost + extraCost;
  };

  // Calculate extra cost for display
  const calculateExtraCost = (pkg, kms) => {
    if (!pkg || !pkg.included_kilometers) return 0;
    const totalIncludedKm = pkg.included_kilometers;
    if (kms <= totalIncludedKm) return 0;
    const extraKms = kms - totalIncludedKm;
    const extraRate = parseFloat(pkg.extra_km_rate) || 0;
    return extraKms * extraRate;
  };

  // Handle package selection
  const handlePackageSelect = (pkg) => {
    const scrollTopBeforeSelection = typeof window !== 'undefined' ? window.scrollY : 0;
    if (typeof document !== 'undefined' && document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }

    if ((selectedPackageId && String(selectedPackageId) === String(pkg.id)) || (selectedPackage?.id && String(selectedPackage.id) === String(pkg.id))) {
      handleClearPackage();
      return;
    }

    const ratePerUnit = parseFloat(pkg.fixed_amount) || 0;
    const packageDurationUnits = getPackageDurationUnits(pkg);

    if (!packageDurationUnits) {
      toast.error(tr(
        'Package duration is missing. Please set the package duration in Pricing before using it.',
        'La durée du forfait est manquante. Veuillez définir la durée du forfait dans la tarification avant de l’utiliser.'
      ));
      return;
    }

    setSelectedPackage(pkg);
    setExpandedPackage(pkg);
    setShowCalculator(false);
    setHasOverridden(true);
    const activeDurationUnits = Math.max(
      Number(duration || 0) || 0,
      rentalType === 'hourly' ? 0.5 : 1
    );
    // Prepare ALL package data in one object
    const packageData = {
      package_id: pkg.id,
      package_name: pkg.name,
      package_rate_per_unit: ratePerUnit,
      package_included_km_per_unit: pkg.included_kilometers,
      package_total_included_km: calculatePackageTotalIncludedKm(
        pkg.included_kilometers,
        activeDurationUnits,
        packageDurationUnits
      ),
      package_extra_rate: parseFloat(pkg.extra_km_rate) || 0,
      package_fuel_charge_enabled: Boolean(pkg.fuel_charge_enabled),
      package_description: pkg.description,
      package_duration_units: packageDurationUnits,
      use_package_pricing: true,
      package_overrides_tier: true
    };
    
    // Pass to parent - let the parent handle ALL state updates
    if (onPackageCalculations) {
      onPackageCalculations(packageData);
    }

    if (setFormData) {
      setFormData((prev) => {
        const currentDurationUnits = Math.max(
          Number(
            prev.rental_type === 'hourly'
              ? (prev.quantity_hours ?? prev.quantity_days)
              : prev.quantity_days
          ) || 0,
          prev.rental_type === 'hourly' ? 0.5 : 1
        );
        const nextDurationUnits = currentDurationUnits > 0
          ? currentDurationUnits
          : (Number.isFinite(packageDurationUnits) && packageDurationUnits > 0
              ? packageDurationUnits
              : (prev.rental_type === 'hourly' ? 0.5 : 1));
        const nextTotalIncludedKm = calculatePackageTotalIncludedKm(
          pkg.included_kilometers,
          nextDurationUnits
        );

        return {
          ...prev,
          quantity_days: nextDurationUnits,
          quantity_hours: prev.rental_type === 'hourly' ? nextDurationUnits : null,
          selected_package_id: pkg.id,
          selected_package_name: pkg.name || '',
          selected_package_fixed_amount: ratePerUnit,
          selected_package_rate_per_unit: ratePerUnit,
          selected_package_included_km: pkg.included_kilometers || null,
          selected_package_included_km_per_unit: pkg.included_kilometers || null,
          selected_package_total_included_km: nextTotalIncludedKm,
          selected_package_extra_rate: parseFloat(pkg.extra_km_rate) || 0,
          selected_package_fuel_charge_enabled: Boolean(pkg.fuel_charge_enabled),
          selected_package_description: pkg.description || '',
          use_package_pricing: true,
          package_overrides_tier: true,
          unit_price: ratePerUnit,
        };
      });
    }
    
    // Don't update formData directly here - let the parent handle it
    // Don't call onPriceOverride separately

    if (typeof window !== 'undefined') {
      requestAnimationFrame(() => {
        window.scrollTo({ top: scrollTopBeforeSelection });
      });
    }
    
    toast.success(`Package "${pkg.name}" selected - ${ratePerUnit.toFixed(2)} MAD`);
  };

  // Handle clear package selection
  const handleClearPackage = () => {
    setSelectedPackage(null);
    setExpandedPackage(null);
    setShowCalculator(false);
    setHasOverridden(false);
    
    if (onPackageCalculations) {
      onPackageCalculations({
        package_name: '',
        package_rate_per_unit: 0,
        package_included_km_per_unit: null,
        package_extra_rate: 0,
        package_fuel_charge_enabled: false,
        package_description: '',
        use_package_pricing: false,
        package_overrides_tier: false,
        package_id: null
      });
    }
    
    if (setFormData) {
      setFormData((prev) => ({
        ...prev,
        selected_package_id: null,
        selected_package_name: '',
        selected_package_rate_per_unit: 0,
        selected_package_included_km: null,
        selected_package_included_km_per_unit: null,
        selected_package_total_included_km: null,
        selected_package_extra_rate: 0,
        selected_package_description: '',
        use_package_pricing: false,
        package_overrides_tier: false
      }));
    }

    if (onPackageSelect) {
      onPackageSelect(null);
    }
    
    toast.info('Package selection cleared - using standard pricing');
  };

  const handleClosePackageFocus = () => {
    const scrollTopBeforeClose = typeof window !== 'undefined' ? window.scrollY : 0;
    setExpandedPackage(null);
    setShowCalculator(false);
    if (typeof window !== 'undefined') {
      requestAnimationFrame(() => {
        window.scrollTo({ top: scrollTopBeforeClose });
      });
    }
  };

  if (packages.length === 0) {
    return (
      <div className="p-4 bg-gray-50 rounded-lg text-center text-gray-500">
        <Package className="w-5 h-5 mx-auto mb-2" />
        <p className="text-sm">No {rentalType} packages available for this vehicle</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {!expandedPackage && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {packages.map((pkg) => {
          const isSelected = selectedPackageId === pkg.id || selectedPackage?.id === pkg.id;
          const ratePerUnit = parseFloat(pkg.fixed_amount) || 0;
          const totalIncludedKm = calculatePackageTotalIncludedKm(pkg.included_kilometers, duration);
          const packageDurationUnits = getPackageDurationUnits(pkg);
          const packageDisplayTotal = packageDurationUnits
            ? ratePerUnit * Math.max((Number(duration || 0) || 0) / packageDurationUnits, 1)
            : ratePerUnit;
          const packageDurationLabel = (() => {
            if (!packageDurationUnits) return rentalType === 'hourly'
              ? tr('Hourly package', 'Forfait horaire')
              : tr('Daily package', 'Forfait journalier');

            if (rentalType === 'daily' && Number(duration || 0) > 1) {
              return formatRentalDurationLabel(rentalType, duration, tr);
            }

            if (rentalType === 'hourly' && packageDurationUnits === 1 && Number(duration || 0) > 1) {
              return formatRentalDurationLabel(rentalType, duration, tr);
            }

            if (rentalType === 'hourly') {
              if (packageDurationUnits === 0.5) return tr('30 min', '30 min');
              if (packageDurationUnits === 1) return tr('1 Hour', '1 heure');
              return tr(`${packageDurationUnits} Hours`, `${packageDurationUnits} heures`);
            }

            if (packageDurationUnits === 1) return tr('1 day', '1 jour');
            return tr(`${packageDurationUnits} days`, `${packageDurationUnits} jours`);
          })();
          
          return (
            <button
              key={pkg.id}
              type="button"
              onClick={() => handlePackageSelect(pkg)}
              disabled={disabled}
              className={`relative rounded-xl border-2 p-4 text-left transform-gpu transition-[transform,border-color,box-shadow,background-color,opacity] duration-200 ease-out ${
                isSelected
                  ? 'border-purple-500 bg-gradient-to-r from-purple-50 to-indigo-50 ring-2 ring-purple-200 shadow-md scale-[1.01]'
                  : 'border-gray-200 bg-white hover:border-purple-300 hover:bg-purple-50/30 hover:-translate-y-0.5 hover:shadow-sm'
              } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer active:scale-[0.99]'}`}
            >
              <div className="flex flex-col h-full">
                <div className="flex items-start justify-between mb-3">
                  <div className="inline-flex items-center gap-2">
                    <Gauge className={`w-5 h-5 ${isSelected ? 'text-purple-600' : 'text-gray-400'}`} />
                    <span className={`text-[11px] font-semibold uppercase tracking-[0.16em] ${isSelected ? 'text-purple-600' : 'text-gray-500'}`}>
                      {isSelected ? tr('Selected', 'Sélectionné') : tr('Compare', 'Comparer')}
                    </span>
                  </div>
                  {isSelected && (
                    <div className="flex h-5 w-5 items-center justify-center rounded-full bg-purple-500 shadow-sm transition-all duration-200 ease-out">
                      <Check className="w-3 h-3 text-white" />
                    </div>
                  )}
                </div>
                
                <h4 className="font-bold text-gray-900 text-base mb-3">{pkg.name}</h4>

                <div className="rounded-lg border border-gray-100 bg-gray-50/80 p-3">
                  <div className="flex items-end justify-between gap-3">
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">
                        {tr('Duration', 'Durée')}
                      </div>
                      <div className="mt-1 text-lg font-bold text-slate-900">
                        {packageDurationLabel}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">
                        {tr('Price', 'Prix')}
                      </div>
                      <div className="mt-1 text-lg font-bold text-purple-700">
                        {packageDisplayTotal.toFixed(2)} MAD
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 flex items-center justify-between gap-3 border-t border-dashed border-gray-200 pt-3">
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">
                        {tr('Included km', 'KM inclus')}
                      </div>
                      <div className="mt-1 text-sm font-bold text-emerald-700">
                        {totalIncludedKm ? `${totalIncludedKm} km` : tr('Unlimited', 'Illimité')}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">
                        {tr('Extra/km', 'Suppl./km')}
                      </div>
                      <div className="mt-1 text-sm font-semibold text-orange-600">
                        {pkg.extra_km_rate
                          ? `${parseFloat(pkg.extra_km_rate).toFixed(2)} MAD`
                          : tr('Not applied', 'Non appliqué')}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-3 text-xs font-medium text-gray-500">
                  {isSelected
                    ? tr('Included in this rental', 'Inclus dans cette location')
                    : tr('Tap for details', 'Appuyez pour voir')}
                </div>
              </div>
            </button>
          );
          })}
        </div>
      )}

      {expandedPackage && (
        <div className="rounded-xl border-2 border-purple-500 bg-gradient-to-r from-purple-50 to-indigo-50 p-4 ring-2 ring-purple-200 shadow-md">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-purple-600">
                {tr('Selected package', 'Forfait sélectionné')}
              </p>
              <h4 className="mt-1 text-lg font-bold text-slate-900">{expandedPackage.name}</h4>
              <div className="mt-3 flex flex-wrap gap-2">
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                  {activeDurationLabel}
                </span>
                <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                  {calculatePackageTotalIncludedKm(expandedPackage.included_kilometers, duration)
                    ? `${calculatePackageTotalIncludedKm(expandedPackage.included_kilometers, duration)} km ${tr('included', 'inclus')}`
                    : tr('Unlimited km', 'KM illimités')}
                </span>
                <span className="rounded-full bg-purple-50 px-3 py-1 text-xs font-semibold text-purple-700">
                  {((
                    (parseFloat(expandedPackage.fixed_amount) || 0)
                    * (Number(duration || 0) || 0)
                  ) || 0).toFixed(2)} MAD
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={handleClosePackageFocus}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-purple-200 bg-white px-3 py-2 text-xs font-semibold text-purple-700 hover:bg-purple-50"
            >
              <X className="h-4 w-4" />
              {tr('Back to packages', 'Retour aux forfaits')}
            </button>
          </div>
        </div>
      )}

      {/* Package Details & Calculator - Collapsible section */}
      {selectedPackage && (
        <div className="mt-4 border-2 border-purple-200 rounded-xl overflow-hidden">
          {/* Collapsible Header */}
          <button
            type="button"
            onClick={() => setShowCalculator(!showCalculator)}
            className="w-full px-5 py-4 bg-gradient-to-r from-purple-50 to-indigo-50 flex items-center justify-between hover:from-purple-100 hover:to-indigo-100 transition-colors"
          >
            <div className="flex items-center gap-2">
              <Calculator className="w-5 h-5 text-purple-600" />
              <h4 className="font-semibold text-purple-900">{tr('Package details', 'Détails du forfait')}</h4>
              <span className="text-xs bg-purple-200 text-purple-700 px-2 py-0.5 rounded-full">
                {selectedPackage.name}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm text-purple-600">
                {showCalculator ? tr('Hide breakdown', 'Masquer le détail') : tr('Show breakdown', 'Afficher le détail')}
              </span>
              {showCalculator ? (
                <ChevronUp className="w-5 h-5 text-purple-600" />
              ) : (
                <ChevronDown className="w-5 h-5 text-purple-600" />
              )}
            </div>
          </button>

          {/* Collapsible Content */}
          {showCalculator && (
            <div className="p-5 bg-white">
              {(() => {
                const ratePerUnit = parseFloat(selectedPackage.fixed_amount) || 0;
                const baseRentalCost = ratePerUnit * (Number(duration || 0) || 0);
                const includedKmsPerUnit = selectedPackage.included_kilometers;
                const totalIncludedKm = calculatePackageTotalIncludedKm(includedKmsPerUnit, duration);
                const extraRate = parseFloat(selectedPackage.extra_km_rate) || 0;
                
                // Calculate potential extra charges based on estimate (INFORMATIONAL ONLY)
                let potentialExtraKms = 0;
                let potentialExtraCost = 0;
                
                if (totalIncludedKm && estimatedKms > totalIncludedKm) {
                  potentialExtraKms = estimatedKms - totalIncludedKm;
                  potentialExtraCost = potentialExtraKms * extraRate;
                }

                return (
                  <div className="space-y-4">
                    {/* Package Summary - Fixed Price */}
                    <div className="bg-purple-50 p-4 rounded-lg border-2 border-purple-200">
                      <div className="flex items-center gap-2 mb-3">
                        <Package className="w-5 h-5 text-purple-600" />
                        <h4 className="font-semibold text-purple-900">Package Summary</h4>
                      </div>
                      
                      <div className="space-y-2">
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-gray-600">{tr('Package:', 'Forfait :')}</span>
                          <span className="text-sm font-bold text-purple-700">{selectedPackage.name}</span>
                        </div>
                        
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-gray-600">{tr('Package price:', 'Prix du forfait :')}</span>
                          <span className="text-sm font-bold text-gray-900">{baseRentalCost.toFixed(2)} MAD</span>
                        </div>
                        
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-gray-600">{tr('Duration:', 'Durée :')}</span>
                          <span className="text-sm font-bold text-gray-900">
                            {activeDurationLabel}
                          </span>
                        </div>
                        
                        <div className="flex justify-between items-center pt-2 border-t border-purple-100">
                          <span className="text-sm text-gray-600">{tr('Included:', 'Inclus :')}</span>
                          <span className="text-sm font-medium text-gray-700">
                            {includedKmsPerUnit ? `${includedKmsPerUnit} km` : tr('Unlimited', 'Illimité')}
                          </span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-gray-600">{tr('Included limit:', 'Limite incluse :')}</span>
                          <span className="text-sm font-bold text-green-600">
                            {totalIncludedKm ? `${totalIncludedKm} km` : tr('Unlimited', 'Illimité')}
                          </span>
                        </div>
                        
                        {/* FIXED Package Total - Does NOT include extra km */}
                        <div className="flex justify-between items-center pt-3 border-t border-purple-200 mt-2">
                          <span className="text-base font-semibold text-purple-900">{tr('Package Total (Fixed):', 'Total du forfait (fixe) :')}</span>
                          <span className="text-xl font-bold text-purple-700">
                            {baseRentalCost.toFixed(2)} MAD
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Kilometer Estimator - INFORMATIONAL ONLY */}
                    <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                      <div className="flex items-center gap-2 mb-3">
                        <Gauge className="w-5 h-5 text-blue-600" />
                        <h4 className="font-semibold text-blue-900">Kilometer Estimator</h4>
                        <span className="text-xs bg-blue-200 text-blue-700 px-2 py-0.5 rounded-full ml-auto">
                          Estimate Only
                        </span>
                      </div>
                      
                      <div className="space-y-3">
                        {/* Slider */}
                        <div>
                          <label className="block text-sm font-medium text-blue-700 mb-2">
                            Estimated Kilometers: {estimatedKms} km
                          </label>
                          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-3">
                            <input
                              type="range"
                              min="0"
                              max="300"
                              step="10"
                              value={estimatedKms}
                              onChange={(e) => setEstimatedKms(parseInt(e.target.value))}
                              className="w-full sm:flex-1 h-2 bg-blue-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                              disabled={disabled}
                            />
                            <div className="flex items-center whitespace-nowrap bg-white px-3 py-1.5 rounded-lg border border-blue-200">
                              <span className="text-base font-bold text-blue-700">{estimatedKms}</span>
                              <span className="text-xs text-blue-600 ml-1">km</span>
                            </div>
                          </div>
                        </div>

                        {/* Included KM Display */}
                        {totalIncludedKm && (
                          <div className="bg-white p-3 rounded-lg border border-blue-200">
                            <div className="flex justify-between items-center">
                              <span className="text-sm text-gray-600">Package includes:</span>
                              <span className="font-bold text-green-600">{totalIncludedKm} km</span>
                            </div>
                          </div>
                        )}

                        {/* Potential Extra KM - Only shown if estimate exceeds included */}
                        {potentialExtraKms > 0 && (
                          <div className="bg-orange-50 p-3 rounded-lg border border-orange-200">
                            <div className="space-y-2">
                              <div className="flex justify-between items-center">
                                <span className="text-sm text-orange-700">Potential extra km:</span>
                                <span className="font-bold text-orange-700">{potentialExtraKms} km</span>
                              </div>
                              <div className="flex justify-between items-center">
                                <span className="text-sm text-orange-700">Potential extra cost:</span>
                                <span className="font-bold text-orange-700">+{potentialExtraCost.toFixed(2)} MAD</span>
                              </div>
                              <div className="text-xs text-orange-600">
                                {potentialExtraKms} km × {extraRate.toFixed(2)} MAD/km
                              </div>
                            </div>
                          </div>
                        )}

                        {/* If estimate is within included */}
                        {potentialExtraKms === 0 && totalIncludedKm && (
                          <div className="bg-green-50 p-3 rounded-lg border border-green-200">
                            <div className="flex items-center gap-2">
                              <CheckCircle className="w-4 h-4 text-green-600" />
                              <span className="text-sm text-green-700">
                                Your estimate ({estimatedKms} km) is within the {totalIncludedKm} km package limit
                              </span>
                            </div>
                          </div>
                        )}

                        {/* Informational Note */}
                        <div className="text-xs text-gray-500 bg-white p-2 rounded border border-blue-100">
                          <div className="flex items-start gap-2">
                            <Info className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
                            <div>
                              <span className="font-medium">Note:</span> This is just an estimate. The actual extra kilometers and charges will be calculated based on the odometer readings at the end of the rental.
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Total Extension Fee - FIXED, doesn't change with slider */}
                    <div className="bg-gradient-to-r from-purple-600 to-indigo-600 p-4 rounded-lg">
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-white">
                        <div>
                          <span className="text-sm font-medium block">Total Extension Fee</span>
                          <span className="text-xs text-purple-100">
                            {duration} {duration > 1 ? (rentalType === 'hourly' ? 'hours' : 'days') : (rentalType === 'hourly' ? 'hour' : 'day')} • Fixed package rate
                          </span>
                        </div>
                        <span className="text-2xl font-bold">{baseRentalCost.toFixed(2)} MAD</span>
                      </div>
                      <div className="text-xs text-purple-100 mt-2 border-t border-purple-400 pt-2">
                        {tr('Fixed package price', 'Prix du forfait fixe')}: {baseRentalCost.toFixed(2)} MAD
                        {totalIncludedKm && ` • Includes ${totalIncludedKm} km`}
                      </div>
                    </div>

                    {/* Potential Total with Extra (Informational) */}
                    {potentialExtraCost > 0 && (
                      <div className="bg-amber-50 p-3 rounded-lg border border-amber-200">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Info className="w-4 h-4 text-amber-600" />
                            <span className="text-sm text-amber-800">Estimated total if you exceed limit:</span>
                          </div>
                          <span className="text-lg font-bold text-amber-700">
                            {(baseRentalCost + potentialExtraCost).toFixed(2)} MAD
                          </span>
                        </div>
                        <div className="text-xs text-amber-600 mt-1 text-right">
                          Package: {baseRentalCost.toFixed(2)} MAD + Extra: {potentialExtraCost.toFixed(2)} MAD
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ==================== FUEL CHARGE TOGGLE COMPONENT ====================
const FuelChargeToggle = ({
  enabled,
  onToggle,
  amount,       // price per line (MAD)
  rentalType,
  disabled = false
}) => {
  const pricePerLine = parseFloat(amount) || 0;

  return (
    <div className={`rounded-lg border transition-all ${
      enabled ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'
    }`}>
      {/* Full-width tap target — mobile friendly */}
      <button
        type="button"
        onClick={() => !disabled && onToggle(!enabled)}
        disabled={disabled}
        className={`w-full flex items-center justify-between px-3 py-3 rounded-lg text-left ${
          disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer active:bg-black/5'
        }`}
      >
        <div className="flex items-center gap-2 min-w-0">
          <svg
            className={`w-4 h-4 flex-shrink-0 ${enabled ? 'text-green-600' : 'text-gray-400'}`}
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          <div className="min-w-0">
            <span className="text-sm font-medium text-gray-900">Fuel Charge</span>
            {pricePerLine > 0 ? (
              <span className="text-xs text-gray-500 ml-1 whitespace-nowrap">
                · {pricePerLine} MAD/line ({rentalType})
              </span>
            ) : (
              <span className="text-xs text-amber-500 ml-1">
                · No price set in Pricing Management
              </span>
            )}
          </div>
        </div>
        {/* Toggle pill */}
        <div className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors ml-3 ${
          enabled ? 'bg-green-500' : 'bg-gray-300'
        }`}>
          <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
            enabled ? 'translate-x-6' : 'translate-x-1'
          }`} />
        </div>
      </button>

      {/* Sub-text */}
      {enabled && pricePerLine > 0 && (
        <p className="text-xs text-green-700 px-3 pb-2.5 leading-tight">
          ⛽ {pricePerLine} MAD × missing lines will be charged at return
        </p>
      )}
      {enabled && pricePerLine === 0 && (
        <p className="text-xs text-amber-600 px-3 pb-2.5 leading-tight">
          ⚠️ Price is 0 — set {rentalType === 'hourly' ? 'hourly' : 'daily'} rate in Pricing → Fuel Pricing
        </p>
      )}
      {!enabled && (
        <p className="text-xs text-gray-400 px-3 pb-2.5 leading-tight">
          No fuel charge will be applied to this rental
        </p>
      )}
      
    </div>
  );
};

// ==================== MAIN COMPONENT ====================

const SimplifiedRentalWizard = ({ 
  initialData = null, 
  mode = 'create',
  onSuccess,
  onCancel,
  isLoading = false,
  initialStep = 1,
  initialCustomerScanNote = '',
  requiresCustomerVerification = false,
  customerVerificationCaptureOnly = false,
  uiVariant = 'default',
}) => {
  const navigate = useNavigate();
  const { hasFeature } = useAuth();
  const [currentStep, setCurrentStep] = useState(1);
  const [basePrices, setBasePrices] = React.useState([]);
  const [showIDScanModal, setShowIDScanModal] = useState(false);
  const [showSecondDriverScanModal, setShowSecondDriverScanModal] = useState(false);
  const [secondDriverScanEntryMode, setSecondDriverScanEntryMode] = useState('scan');
  const canUseOcrIdScan = hasFeature('ocr_id_scan');
  const [activeTab, setActiveTab] = useState('basic');
  const [customerScanNote, setCustomerScanNote] = useState(initialCustomerScanNote);
  const [customerScanNoteTone, setCustomerScanNoteTone] = useState(initialCustomerScanNote ? 'warning' : 'neutral');
  const [customerIdFileName, setCustomerIdFileName] = useState('');
  const [customerIdCaptureMethod, setCustomerIdCaptureMethod] = useState('');
  const [countryCode, setCountryCode] = useState('+212');
  const [showCustomerDrawer, setShowCustomerDrawer] = useState(false);
  const [selectedRentalForDrawer, setSelectedRentalForDrawer] = useState(null);
  const explicitSubmitRef = useRef(false);

  const [activeModelFilter, setActiveModelFilter] = useState(null);
  const [filteredVehicles, setFilteredVehicles] = useState([]);
  const [activeModels, setActiveModels] = useState([]);

  const getCapturedIdFileName = useCallback((scannedData, imageFile) => {
    const explicitName =
      scannedData?.fileName ||
      scannedData?.idFileName ||
      imageFile?.name ||
      '';

    if (explicitName) {
      return String(explicitName);
    }

    const imageUrl =
      scannedData?.imageUrl ||
      scannedData?.id_scan_url ||
      scannedData?.publicUrl ||
      '';

    if (!imageUrl) {
      return '';
    }

    try {
      const cleanPath = String(imageUrl).split('?')[0];
      return decodeURIComponent(cleanPath.split('/').pop() || '');
    } catch {
      return '';
    }
  }, []);

  const {
    userProfile,
    formData,
    setFormData,
    loading,
    submitting,
    isSubmitting,
    successfullySubmitted,
    successRedirectUrl,
    errors,
    success,
    setSuccess,
    dateError,
    vehicleModels,
    availableVehicles,
    transportFees,
    availabilityStatus,
    autoCalculatedPrice,
    pricingComputationMode,
    pricingComputationLabel,
    suggestions,
    customerAlert,
    isBannedCustomerBlocked,
    showCustomerAlertModal,
    setShowCustomerAlertModal,
    selectedQuickDuration,
    setSelectedQuickDuration,
    damageDepositConfig,
    selectedDepositTab,
    setSelectedDepositTab,
    customDepositAmount,
    setCustomDepositAmount,
    secondDrivers,
    setSecondDrivers,
    addSecondDriverFromScan,
    removeSecondDriver,
    updateSecondDriver,
    handleInputChange,
    handleSuggestionClick,
    handleFileUpload,
    handleCustomerSaved,
    handleIDScanComplete,
    handleQuickHourSelect,
    handleQuickDaySelect,
    syncEndDateTimeFromStart,
    composeDateTime,
    handlePaymentStatusTabClick,
    handleDepositTabClick,
    handleDepositDocumentUpload,
    handleDepositDocumentTypeSelect,
    handleDepositDocumentClear,
    depositDocumentUploading,
    validateStep,
    handleSubmit,
    handleReset,
    handleResetAutoPrice,
    getEnabledPresetsForVehicle,
    getDirectPricing,
    customerSearchRef,
    availablePackages,
    isLoadingPackages,
    calculatePackagePrice,
    selectedPackageDraft,
    setSelectedPackageDraft,
    fuelChargeEnabled,
    setFuelChargeEnabled,
    fuelChargeAmount,
    loadFuelChargeSettings,
    manuallyClearedVehicleRef,
  } = useRentalWizard(initialData, mode, navigate, {
    requiresCustomerVerification,
    variant: uiVariant,
  });

  const appendSecondaryCustomerIdImage = useCallback(async (savedData, imageFile = null) => {
    const extraImageUrl = savedData?.imageUrl || savedData?.id_scan_url || savedData?.publicUrl || null;
    if (!extraImageUrl) {
      return;
    }

    const normalizeUrl = (value) => {
      const trimmed = String(value || '').trim();
      return trimmed || null;
    };

    const nextLocalHistory = (prevHistory = [], primaryImage = null) => {
      const seen = new Set();
      const normalizedPrimary = normalizeUrl(primaryImage);
      const values = [
        ...((Array.isArray(prevHistory) ? prevHistory : []).map(normalizeUrl).filter(Boolean)),
        normalizeUrl(extraImageUrl),
      ].filter(Boolean).filter((value) => {
        if (value === normalizedPrimary || seen.has(value)) return false;
        seen.add(value);
        return true;
      });

      return values;
    };

    let persistedCustomer = null;
    let resolvedCustomerId = String(formData.customer_id || '').trim();

    if (!resolvedCustomerId) {
      const licenceNumber = String(formData.customer_licence_number || '').trim();
      const idNumber = String(formData.customer_id_number || '').trim();
      const phoneNumber = String(formData.customer_phone || '').trim();
      const customerName = String(formData.customer_name || '').trim();
      const exactMatches = await enhancedUnifiedCustomerService.findMatchingCustomers({
        full_name: customerName,
        phone: phoneNumber,
        licence_number: licenceNumber,
        id_number: idNumber,
      });
      persistedCustomer =
        pickExactIdentityCustomerMatch({
          incomingCustomer: {
            full_name: customerName,
            phone: phoneNumber,
            licence_number: licenceNumber,
            id_number: idNumber,
          },
          candidates: exactMatches,
        }) ||
        pickMostCompleteCustomerProfile(exactMatches) ||
        null;

      if (persistedCustomer?.id) {
        resolvedCustomerId = String(persistedCustomer.id).trim();
      }
    }

    if (resolvedCustomerId) {
      const existingCustomer = persistedCustomer || (() => null)();
      const fetchedCustomer = existingCustomer || await (async () => {
        const fetchResult = await enhancedUnifiedCustomerService.getCustomerById(resolvedCustomerId);
        if (!fetchResult?.success) {
          throw new Error(fetchResult?.error || 'Failed to fetch customer');
        }
        return fetchResult.data;
      })();

      if (fetchedCustomer) {
        const existingHistory = Array.isArray(fetchedCustomer.scan_metadata?.id_scan_history)
          ? fetchedCustomer.scan_metadata.id_scan_history
          : [];

        const updatedHistory = nextLocalHistory(existingHistory, fetchedCustomer.id_scan_url);
        const nextScanMetadata = {
          ...(fetchedCustomer.scan_metadata || {}),
          id_scan_history: updatedHistory,
        };

        persistedCustomer = await updateCustomerById(resolvedCustomerId, {
          scan_metadata: nextScanMetadata,
          updated_at: new Date().toISOString(),
        }, '*');
      }
    }

    setFormData((prev) => ({
      ...prev,
      customer_id: resolvedCustomerId || prev.customer_id,
      customer_id_scan_history: nextLocalHistory(
        persistedCustomer?.scan_metadata?.id_scan_history || prev.customer_id_scan_history || [],
        prev.customer_id_image
      ),
    }));

    setCustomerIdFileName(getCapturedIdFileName(savedData, imageFile));
    setCustomerScanNoteTone('success');
    setCustomerScanNote(
      tr(
        'Secondary ID image saved successfully.',
        "L'image d'identité secondaire a bien été enregistrée."
      )
    );
    toast.success(
      tr(
        'Secondary ID saved to customer documents.',
        'La pièce d’identité secondaire a été ajoutée aux documents du client.'
      )
    );
  }, [formData.customer_id, getCapturedIdFileName, setFormData]);

  const effectiveFuelChargeToggleEnabled = formData.use_package_pricing
    ? Boolean(formData.selected_package_fuel_charge_enabled)
    : fuelChargeEnabled;

  const handleFuelChargeToggleChange = useCallback((enabled) => {
    setFuelChargeEnabled(enabled);
    if (formData.use_package_pricing) {
      setFormData((prev) => ({
        ...prev,
        selected_package_fuel_charge_enabled: enabled,
      }));
    }
  }, [formData.use_package_pricing, setFormData, setFuelChargeEnabled]);

  useEffect(() => {
    setCurrentStep(Math.min(Math.max(Number(initialStep) || 1, 1), 3));
  }, [initialStep]);

  useEffect(() => {
    setCustomerScanNote(initialCustomerScanNote || '');
  }, [initialCustomerScanNote]);

  const isPackageDurationLocked = false;

  useEffect(() => {
    if (!formData.use_package_pricing) return;

    const includedKmPerUnit = Number(formData.selected_package_included_km_per_unit || 0) || 0;
    const packageDurationUnits = Number(formData.selected_package_duration_units || 0) || 1;
    const durationUnits = Math.max(
      Number(
        formData.rental_type === 'hourly'
          ? (formData.quantity_hours ?? formData.quantity_days)
          : formData.quantity_days
      ) || 0,
      formData.rental_type === 'hourly' ? 0.5 : 1
    );
    const nextTotalIncludedKm = calculatePackageTotalIncludedKm(
      includedKmPerUnit,
      durationUnits,
      packageDurationUnits
    );

    if (formData.selected_package_total_included_km !== nextTotalIncludedKm) {
      setFormData((prev) => ({
        ...prev,
        selected_package_total_included_km: nextTotalIncludedKm,
      }));
    }
  }, [
    formData.use_package_pricing,
    formData.rental_type,
    formData.quantity_days,
    formData.quantity_hours,
    formData.selected_package_duration_units,
    formData.selected_package_included_km_per_unit,
    formData.selected_package_total_included_km,
  ]);

  useEffect(() => {
    if (!availableVehicles || availableVehicles.length === 0) {
      setFilteredVehicles([]);
      setActiveModels([]);
      return;
    }
    
    const filtered = activeModelFilter 
      ? availableVehicles.filter(vehicle => 
          vehicle.vehicle_model_id && 
          String(vehicle.vehicle_model_id) === String(activeModelFilter)
        )
      : availableVehicles;
    
    setFilteredVehicles(filtered);
    
    const modelIds = [...new Set(availableVehicles
      .map(v => v.vehicle_model_id)
      .filter(id => id !== null && id !== undefined && id !== ''))];
    
    if (vehicleModels && vehicleModels.length > 0) {
      const models = vehicleModels.filter(model => 
        modelIds.some(vehicleModelId => String(vehicleModelId) === String(model.id))
      );
      setActiveModels(models);
    } else {
      setActiveModels([]);
    }
    
  }, [availableVehicles, vehicleModels, activeModelFilter]);

  useEffect(() => {
    if (activeModelFilter && formData.vehicle_id && availableVehicles) {
      const selectedVehicle = availableVehicles.find(v => v.id == formData.vehicle_id);
      if (selectedVehicle && String(selectedVehicle.vehicle_model_id) !== String(activeModelFilter)) {
        handleInputChange('vehicle_id', '');
      }
    }
  }, [activeModelFilter]);

  useEffect(() => {
    const validateTiers = async () => {
      // Pricing tiers validation
    };

    validateTiers();
  }, []);

  const isCustomerVerificationOnlyMode = requiresCustomerVerification && mode === 'edit';
  const isStrictCustomerVerificationCaptureMode = isCustomerVerificationOnlyMode && customerVerificationCaptureOnly;
  const isLightVariant = uiVariant === 'light';
  const wizardTopRef = useRef(null);
  const lightProgressStepperRef = useRef(null);
  const vehicleStepRef = useRef(null);
  const lightVehicleBodyRef = useRef(null);
  const lightPackageStepRef = useRef(null);
  const lightDepositStepRef = useRef(null);
  const lightCustomerNameInputRef = useRef(null);
  const previousVehicleIdRef = useRef(formData.vehicle_id || '');
  const previousLightHasDurationSelectionRef = useRef(false);
  const lightSectionTransitionTimeoutRef = useRef(null);
  const lightFlowTransitionTimeoutRef = useRef(null);
  const frozenLightSummaryRef = useRef(null);
  const [lightExpandedSection, setLightExpandedSection] = useState('setup');
  const [lightFlowTransition, setLightFlowTransition] = useState('idle');
  const [lightShowScheduleEditor, setLightShowScheduleEditor] = useState(false);
  const [lightDurationConfirmed, setLightDurationConfirmed] = useState(false);
  const [lightRentalTypeDraft, setLightRentalTypeDraft] = useState('');
  const [showLightActionsMenu, setShowLightActionsMenu] = useState(false);
  const [lightVehiclePriceMap, setLightVehiclePriceMap] = useState({});
  const [lightVehicleCollapseHeight, setLightVehicleCollapseHeight] = useState(null);
  const [lightCustomerEditOpen, setLightCustomerEditOpen] = useState(false);
  const [lightCustomerAdditionalOpen, setLightCustomerAdditionalOpen] = useState(false);
  const [lightPaymentDetailsOpen, setLightPaymentDetailsOpen] = useState(false);
  const [lightPaymentSummaryOpen, setLightPaymentSummaryOpen] = useState(false);
  const [lightDepositConfirmed, setLightDepositConfirmed] = useState(mode === 'edit');
  const [lightConfirmStage, setLightConfirmStage] = useState('idle');
  const [lightPackageDecisionMode, setLightPackageDecisionMode] = useState(
    formData.use_package_pricing ? 'package' : (formData.vehicle_id ? 'standard' : 'undecided')
  );

  const steps = [
    { number: 1, title: tr('Customer', 'Client'), icon: User },
    { number: 2, title: tr('Vehicle & Dates', 'Véhicule et dates'), icon: Car },
    { number: 3, title: tr('Payment', 'Paiement'), icon: CreditCard }
  ];
  const displayedSteps = isCustomerVerificationOnlyMode
    ? [{ number: 1, title: tr('Customer Verification', 'Vérification client'), icon: User }]
    : steps;

  const getSelectedVehicle = () => {
    return availableVehicles.find(v => v.id == formData.vehicle_id) || 
           vehicleModels.find(v => v.id == formData.vehicle_id);
  };

  const formatPeriodDisplay = () => {
    return (
      <div className="flex flex-col sm:flex-row sm:items-center gap-1">
        <span className="font-medium text-sm sm:text-base">
          {formData.rental_start_date} {formData.rental_start_time || '00:00'}
        </span>
        <span className="text-gray-400 text-xs sm:text-sm hidden sm:inline">{tr('to', 'au')}</span>
        <span className="text-gray-400 text-xs sm:hidden">↓</span>
        <span className="font-medium text-sm sm:text-base">
          {formData.rental_end_date} {formData.rental_end_time || '00:00'}
        </span>
      </div>
    );
  };

  const selectedVehicle = getSelectedVehicle();
  const lastLightVehicleTouchSelectRef = useRef({ vehicleId: null, selectedAt: 0 });
  const lightVehicleScrollerRef = useRef(null);
  const lightVehicleScrollerStateRef = useRef({ scrollLeft: 0, lastScrolledAt: 0 });
  const lightVehiclePointerRef = useRef({ vehicleId: null, startX: 0, startY: 0, startScrollLeft: 0, startedAt: 0, moved: false });
  const suppressNextLightVehicleClickRef = useRef({ vehicleId: null, until: 0 });

  const scrollLightSectionIntoView = useCallback((targetRef) => {
    if (!targetRef?.current || typeof window === 'undefined') return;

    const isMobile = window.matchMedia?.('(max-width: 639px)').matches ?? window.innerWidth < 640;
    const topOffset = isMobile ? 140 : 24;
    const targetTop = targetRef.current.getBoundingClientRect().top + window.scrollY - topOffset;

    window.scrollTo({
      top: Math.max(0, targetTop),
      behavior: 'smooth',
    });
  }, []);

  const animateLightSectionTransition = useCallback((nextSection, targetRef = null) => {
    if (lightSectionTransitionTimeoutRef.current) {
      window.clearTimeout(lightSectionTransitionTimeoutRef.current);
    }

    setLightExpandedSection(null);
    setLightShowScheduleEditor(false);

    lightSectionTransitionTimeoutRef.current = window.setTimeout(() => {
      setLightExpandedSection(nextSection);
      lightSectionTransitionTimeoutRef.current = null;

      if (targetRef?.current) {
        requestAnimationFrame(() => {
          scrollLightSectionIntoView(targetRef);
        });
      }
    }, 180);
  }, [scrollLightSectionIntoView]);

  const setLightFlowTransitionFor = useCallback((nextTransition, durationMs = 0) => {
    if (lightFlowTransitionTimeoutRef.current) {
      window.clearTimeout(lightFlowTransitionTimeoutRef.current);
      lightFlowTransitionTimeoutRef.current = null;
    }

    setLightFlowTransition(nextTransition);
    if (nextTransition === 'idle') {
      frozenLightSummaryRef.current = null;
    }

    if (nextTransition !== 'idle' && durationMs > 0) {
      lightFlowTransitionTimeoutRef.current = window.setTimeout(() => {
        frozenLightSummaryRef.current = null;
        setLightFlowTransition('idle');
        lightFlowTransitionTimeoutRef.current = null;
      }, durationMs);
    }
  }, []);

  useEffect(() => () => {
    if (lightSectionTransitionTimeoutRef.current) {
      window.clearTimeout(lightSectionTransitionTimeoutRef.current);
    }
    if (lightFlowTransitionTimeoutRef.current) {
      window.clearTimeout(lightFlowTransitionTimeoutRef.current);
    }
  }, []);
  const selectedDurationLabel = (() => {
    const durationUnits = Number(
      formData.rental_type === 'hourly'
        ? (formData.quantity_hours ?? formData.quantity_days)
        : formData.quantity_days
    ) || 0;

    if (!durationUnits) return tr('Not set', 'Non défini');

    if (formData.rental_type === 'hourly') {
      if (durationUnits === 0.5) return tr('30 min', '30 min');
      if (durationUnits === 1) return tr('1 Hour', '1 heure');
      return tr(`${durationUnits} Hours`, `${durationUnits} heures`);
    }

    if (durationUnits === 1) return tr('1 day', '1 jour');
    return tr(`${durationUnits} days`, `${durationUnits} jours`);
  })();

  const selectedVehicleLabel = selectedVehicle
    ? [
        selectedVehicle.plate_number || null,
        selectedVehicle.model || selectedVehicle.vehicle_model_name || selectedVehicle.name || tr('Vehicle', 'Véhicule')
      ].filter(Boolean).join(' · ')
    : tr('Not selected', 'Non sélectionné');

  const currentDurationUnits = Number(
    formData.rental_type === 'hourly'
      ? (formData.quantity_hours ?? formData.quantity_days)
      : formData.quantity_days
  ) || 0;
  const selectedStandardPackage = availablePackages.find(
    (pkg) => String(pkg.id || '') === String(formData.selected_package_id || '')
  );
  const formSelectedPackageSource = formData.use_package_pricing && formData.selected_package_id
    ? {
        package_id: formData.selected_package_id,
        package_name: formData.selected_package_name,
        package_rate_per_unit: formData.selected_package_rate_per_unit || formData.selected_package_fixed_amount,
        package_included_km_per_unit: formData.selected_package_included_km_per_unit || formData.selected_package_included_km,
        package_total_included_km: formData.selected_package_total_included_km,
        package_extra_rate: formData.selected_package_extra_rate,
        package_fuel_charge_enabled: formData.selected_package_fuel_charge_enabled,
        package_description: formData.selected_package_description,
        package_duration_units: getPackageDurationUnits({
          duration_units: formData.rental_type === 'hourly' ? 1 : 1,
          fixed_amount: formData.selected_package_rate_per_unit || formData.selected_package_fixed_amount,
        }),
        use_package_pricing: true,
        package_overrides_tier: true,
      }
    : null;
  const activeStandardPackageSource = selectedPackageDraft?.package_id
    ? selectedPackageDraft
    : (selectedStandardPackage || formSelectedPackageSource);
  const selectedStandardPackageTotal = (() => {
    if (!activeStandardPackageSource) return getFixedPackageAmount(formData);
    const packageRate = Number(
      activeStandardPackageSource.fixed_amount
      ?? activeStandardPackageSource.package_rate
      ?? activeStandardPackageSource.package_rate_per_unit
      ?? activeStandardPackageSource.rate
      ?? activeStandardPackageSource.price
      ?? 0
    ) || 0;
    const packageDurationUnits = Number(
      activeStandardPackageSource.package_duration_units
      ?? activeStandardPackageSource.duration_units
      ?? getPackageDurationUnits(activeStandardPackageSource)
      ?? 1
    ) || 1;
    if (packageRate <= 0) return getFixedPackageAmount(formData);
    if (currentDurationUnits <= 0) return packageRate;
    return packageRate * Math.max(currentDurationUnits / packageDurationUnits, 1);
  })();
  const standardPackageSummaryLabel = activeStandardPackageSource
    ? [
        activeStandardPackageSource.name
        || activeStandardPackageSource.package_name
        || formData.selected_package_name,
        selectedDurationLabel
      ].filter(Boolean).join(' • ')
    : getSelectedPackageDisplayLabel(formData, tr);
  const hasResolvedStandardPackage = Boolean(
    activeStandardPackageSource || (formData.use_package_pricing && formData.selected_package_name)
  );

  const visibleVehicles = filteredVehicles.length > 0
    ? filteredVehicles
    : (availableVehicles.length > 0 ? availableVehicles : vehicleModels);
  const resolveLightVehicleModelId = useCallback((vehicle) => {
    const directModelId =
      vehicle?.vehicle_model_id
      ?? vehicle?.model_id
      ?? vehicle?.vehicle_model?.id
      ?? vehicle?.vehicleModelId
      ?? null;

    if (directModelId) {
      return directModelId;
    }

    const vehicleModelName = String(
      vehicle?.model
      ?? vehicle?.vehicle_model_name
      ?? vehicle?.vehicle_model?.model
      ?? vehicle?.vehicle_model?.name
      ?? ''
    ).trim().toLowerCase();

    if (vehicleModelName) {
      const matchedModel = activeModels.find((model) => {
        const candidateNames = [model?.model, model?.name]
          .filter(Boolean)
          .map((value) => String(value).trim().toLowerCase());

        return candidateNames.some((candidate) =>
          candidate === vehicleModelName
          || candidate.endsWith(vehicleModelName)
          || vehicleModelName.endsWith(candidate)
        );
      });

      if (matchedModel?.id) {
        return matchedModel.id;
      }
    }

    return activeModelFilter || null;
  }, [activeModelFilter, activeModels]);
  const lightQuickHourOptions = [0.5, 1, 1.5, 2, 3, 4];
  const lightQuickDayOptions = [1, 2, 3, 4];
  const currentLightDurationUnits = Number(
    formData.rental_type === 'hourly'
      ? (formData.quantity_hours ?? formData.quantity_days)
      : formData.quantity_days
  ) || 0;
  const selectLightVehicle = useCallback((vehicle, mappedLightPrice = null) => {
    const vehicleId = vehicle?.id || '';
    if (!vehicleId) return;

    if (lightSectionTransitionTimeoutRef.current) {
      window.clearTimeout(lightSectionTransitionTimeoutRef.current);
      lightSectionTransitionTimeoutRef.current = null;
    }
    const durationUnits = currentLightDurationUnits || 1;
    const mappedVehicleTotal = Number(mappedLightPrice ?? 0) || 0;
    const nextUnitPrice = mappedVehicleTotal > 0
      ? (durationUnits > 1 ? mappedVehicleTotal / durationUnits : mappedVehicleTotal)
      : null;

    const nextVehicleName = vehicle?.model || vehicle?.name || tr('Vehicle', 'Véhicule');
    const nextVehiclePriceLabel = mappedVehicleTotal > 0 ? `${formatDynamicMad(mappedVehicleTotal)} MAD` : null;
    const snapshotDurationLabel = (() => {
      if (!durationUnits) return null;
      if (formData.rental_type === 'hourly') {
        if (durationUnits === 0.5) return tr('30 min', '30 min');
        if (durationUnits === 1) return tr('1 Hour', '1 Heure');
        if (durationUnits === 1.5) return tr('1.5 Hours', '1,5 Heures');
        return tr(`${durationUnits} Hours`, `${durationUnits} Heures`);
      }
      if (durationUnits === 1) return tr('1 Day', '1 Jour');
      return tr(`${durationUnits} Days`, `${durationUnits} Jours`);
    })();
    const snapshotSetupSummaryLabel = formData.rental_type
      ? snapshotDurationLabel
        ? `${formData.rental_type === 'hourly' ? tr('Hourly', 'Horaire') : tr('Daily', 'Journalier')} • ${snapshotDurationLabel}`
        : `${formData.rental_type === 'hourly' ? tr('Hourly', 'Horaire') : tr('Daily', 'Journalier')}`
      : tr('Rental setup', 'Configuration');
    const shouldRequireExplicitPackageDecision =
      formData.rental_type === 'hourly' && durationUnits === 0.5;
    const nextPackageSummaryLabel = shouldRequireExplicitPackageDecision
      ? tr('Choose package', 'Choisir le forfait')
      : tr('Standard pricing', 'Tarification standard');
    const nextVehicleSummaryLabel = [
      vehicle?.plate_number || null,
      nextVehicleName,
      nextVehiclePriceLabel,
    ].filter(Boolean).join(' • ');
    const nextStickySummaryLabel = [
      vehicle?.plate_number || null,
      nextVehicleName,
      snapshotDurationLabel,
      nextVehiclePriceLabel,
    ].filter(Boolean).join(' • ');

    frozenLightSummaryRef.current = {
      stickySummaryLabel: nextStickySummaryLabel,
      setupSummaryLabel: snapshotSetupSummaryLabel,
      vehicleSummaryLabel: nextVehicleSummaryLabel,
      packageSummaryLabel: nextPackageSummaryLabel,
      packageSummaryAccent: null,
      packageSummaryRestLabel: nextPackageSummaryLabel,
    };
    const currentVehicleBodyHeight = lightVehicleBodyRef.current?.scrollHeight || 0;
    setLightVehicleCollapseHeight(currentVehicleBodyHeight || null);
    setLightExpandedSection('vehicle');
    setSelectedDepositTab(null);
    setCustomDepositAmount('');
    setLightDepositConfirmed(false);
    setSelectedPackageDraft(null);
    if (manuallyClearedVehicleRef?.current !== undefined) {
      manuallyClearedVehicleRef.current = false;
    }
    setFormData((prev) => ({
      ...prev,
      vehicle_id: vehicleId,
      ...(nextUnitPrice !== null ? { unit_price: nextUnitPrice } : {}),
      selected_package_id: null,
      selected_package_name: '',
      selected_package_fixed_amount: 0,
      selected_package_rate_per_unit: 0,
      selected_package_included_km: null,
      selected_package_included_km_per_unit: null,
      selected_package_total_included_km: null,
      selected_package_extra_rate: 0,
      selected_package_fuel_charge_enabled: false,
      selected_package_description: '',
      use_package_pricing: false,
      package_overrides_tier: false,
      damage_deposit: 0,
      damage_deposit_source: '',
      damage_deposit_document_url: null,
      damage_deposit_document_name: '',
    }));
    setLightPackageDecisionMode(shouldRequireExplicitPackageDecision ? 'undecided' : 'standard');

    if (lightSectionTransitionTimeoutRef.current) {
      window.clearTimeout(lightSectionTransitionTimeoutRef.current);
      lightSectionTransitionTimeoutRef.current = null;
    }

    requestAnimationFrame(() => {
      setLightExpandedSection('package');
      lightSectionTransitionTimeoutRef.current = window.setTimeout(() => {
        setLightVehicleCollapseHeight(null);
        lightSectionTransitionTimeoutRef.current = null;
      }, 320);
    });
  }, [
    currentLightDurationUnits,
    formData.rental_type,
    manuallyClearedVehicleRef,
    setCustomDepositAmount,
    setFormData,
    setSelectedDepositTab,
    setSelectedPackageDraft,
    tr,
  ]);
  const getLightDurationButtonLabel = (value, rentalType = formData.rental_type) => {
    if (rentalType === 'hourly') {
      if (value === 0.5) return tr('30 min', '30 min');
      if (value === 1) return tr('1 Hour', '1 Heure');
      if (value === 1.5) return tr('1.5 Hours', '1,5 Heures');
      return tr(`${value} Hours`, `${value} Heures`);
    }

    if (value === 1) return tr('1 Day', '1 Jour');
    return tr(`${value} Days`, `${value} Jours`);
  };
  const selectedLightPackage = availablePackages.find(
    (pkg) => String(pkg.id || '') === String(formData.selected_package_id || '')
  );
  const getLightPackagePreviewTotal = (pkg) => {
    if (!pkg) return 0;
    const packageRate = Number(pkg.fixed_amount ?? pkg.package_rate ?? pkg.rate ?? pkg.price ?? 0) || 0;
    const packageDurationUnits = getPackageDurationUnits(pkg) || 1;
    if (packageRate <= 0) return 0;
    if (currentLightDurationUnits <= 0) return packageRate;
    return packageRate * Math.max(currentLightDurationUnits / packageDurationUnits, 1);
  };
  const filteredPackageOptions = availablePackages.filter((pkg) => {
    if (!formData.rental_type) return true;
    const pkgRateType = pkg.rate_types?.name?.toLowerCase();
    if (!pkgRateType) return true;
    if (formData.rental_type === 'hourly') {
      if (pkgRateType !== 'hourly') return false;
      const packageDurationUnits = getPackageDurationUnits(pkg);
      if (!packageDurationUnits) return true;
      if (currentLightDurationUnits === 0.5) return packageDurationUnits === 0.5;
      if (currentLightDurationUnits === 4) return packageDurationUnits === 4;
      return packageDurationUnits === 1;
    }
    if (formData.rental_type === 'daily') return pkgRateType === 'daily';
    return true;
  });
  const standardFallbackPackage = filteredPackageOptions.find((pkg) => {
    const pkgName = String(pkg?.name || pkg?.package_name || '').toLowerCase();
    const includedKm = Number(pkg?.included_kilometers ?? pkg?.included_km ?? pkg?.km_limit ?? 0) || 0;
    const extraRate = Number(pkg?.extra_km_rate ?? pkg?.extra_rate ?? 0) || 0;
    return (
      pkgName.includes('unlimited')
      || pkgName.includes('free')
      || (includedKm <= 0 && extraRate <= 0)
    );
  }) || null;
  const standardFallbackLabel = (() => {
    if (!standardFallbackPackage) return tr('Standard', 'Standard');
    const includedKm = Number(
      standardFallbackPackage?.included_kilometers
      ?? standardFallbackPackage?.included_km
      ?? standardFallbackPackage?.km_limit
      ?? 0
    ) || 0;
    return includedKm > 0 ? `${includedKm} KM` : tr('Unlimited km', 'KM illimités');
  })();
  const hasDurationSelection = Boolean(Number(
    formData.rental_type === 'hourly'
      ? (formData.quantity_hours ?? formData.quantity_days)
      : formData.quantity_days
  ) || 0);
  const lightHasQuickDurationSelection =
    selectedQuickDuration !== null &&
    selectedQuickDuration !== undefined &&
    Number(selectedQuickDuration) > 0;
  const isLightStepTwo = isLightVariant && currentStep === 2;
  const effectiveLightRentalType = isLightStepTwo
    ? (formData.rental_type || lightRentalTypeDraft || '')
    : (formData.rental_type || '');
  const lightHasSetupSelection = isLightStepTwo
    ? Boolean(effectiveLightRentalType)
    : hasDurationSelection;
  const lightHasDurationSelection = isLightStepTwo
    ? (hasDurationSelection && (lightDurationConfirmed || lightHasQuickDurationSelection))
    : hasDurationSelection;
  const hasPackageDecision = formData.use_package_pricing
    ? Boolean(formData.selected_package_id)
    : lightPackageDecisionMode === 'standard';
  const getLightKmPackagePriceForVehicleModel = (vehicleModelId) => {
    if (!vehicleModelId) return 0;
    if (!(formData.rental_type === 'hourly' && currentLightDurationUnits === 0.5)) {
      return 0;
    }

    const matchingPackage = availablePackages.find((pkg) => {
      const sameDuration = Number(getPackageDurationUnits(pkg) || 0) === currentLightDurationUnits;
      const packageModelId = String(
        pkg.vehicle_model_id
        ?? pkg.vehicleModelId
        ?? selectedVehicle?.vehicle_model_id
        ?? ''
      );
      return sameDuration && packageModelId === String(vehicleModelId);
    });

    return Number(
      matchingPackage?.fixed_amount
      ?? matchingPackage?.package_rate
      ?? matchingPackage?.rate
      ?? matchingPackage?.price
      ?? 0
    ) || 0;
  };
  const getLightVehicleDisplayPrice = (vehicle) => {
    if (formData.use_package_pricing && selectedLightPackage) {
      const selectedPackagePrice = getLightPackagePreviewTotal(selectedLightPackage);
      if (selectedPackagePrice > 0) {
        const selectedPackageModelId = String(
          selectedLightPackage?.vehicle_model_id
          ?? selectedLightPackage?.vehicleModelId
          ?? ''
        );
        const vehicleModelId = String(vehicle?.vehicle_model_id ?? '');
        if (!selectedPackageModelId || !vehicleModelId || selectedPackageModelId === vehicleModelId) {
          return selectedPackagePrice;
        }
      }
    }

    const kmPackagePrice = getLightKmPackagePriceForVehicleModel(vehicle?.vehicle_model_id);
    if (kmPackagePrice > 0) {
      return kmPackagePrice;
    }

    if (
      formData.rental_type === 'hourly'
      && currentLightDurationUnits === 0.5
      && selectedLightPackage
      && Number(getPackageDurationUnits(selectedLightPackage) || 0) === currentLightDurationUnits
    ) {
      const selectedPackagePrice = Number(
        selectedLightPackage.fixed_amount
        ?? selectedLightPackage.package_rate
        ?? selectedLightPackage.rate
        ?? selectedLightPackage.price
        ?? 0
      ) || 0;
      if (selectedPackagePrice > 0) {
        return selectedPackagePrice;
      }
    }

    const mappedPrice = Number(lightVehiclePriceMap[String(vehicle?.id)] || 0);
    if (mappedPrice > 0) return mappedPrice;

    const baseUnitPrice = Number(formData.unit_price) || 0;
    if (baseUnitPrice <= 0) return 0;
    if (formData.rental_type === 'hourly' && currentLightDurationUnits > 1) {
      return baseUnitPrice * currentLightDurationUnits;
    }
    if (formData.rental_type === 'daily' && currentLightDurationUnits > 1) {
      return baseUnitPrice * currentLightDurationUnits;
    }
    return baseUnitPrice;
  };
  const standardLightPreviewTotal = (() => {
    const selectedVehiclePrice = selectedVehicle ? getLightVehicleDisplayPrice(selectedVehicle) : 0;
    if (selectedVehiclePrice > 0) return selectedVehiclePrice;
    const baseUnitPrice = Number(formData.unit_price) || 0;
    if (baseUnitPrice <= 0) return 0;
    if (formData.rental_type === 'hourly' && currentLightDurationUnits > 1) {
      return baseUnitPrice * currentLightDurationUnits;
    }
    if (formData.rental_type === 'daily' && currentLightDurationUnits > 1) {
      return baseUnitPrice * currentLightDurationUnits;
    }
    return baseUnitPrice;
  })();
  const standardFallbackPreviewTotal = standardFallbackPackage
    ? getLightPackagePreviewTotal(standardFallbackPackage)
    : standardLightPreviewTotal;
  const liveTotalAmount = formData.use_package_pricing
    ? (selectedLightPackage ? getLightPackagePreviewTotal(selectedLightPackage) : getFixedPackageAmount(formData))
    : standardLightPreviewTotal;
  const lightIncludedKmSummary = (() => {
    const totalKm = Number(formData.selected_package_total_included_km || 0) || 0;
    if (totalKm > 0) return `${formatDynamicMad(totalKm)} KM`;
    const perUnitKm = Number(formData.selected_package_included_km_per_unit || 0) || 0;
    if (perUnitKm > 0) return `${formatDynamicMad(perUnitKm)} KM`;
    return null;
  })();
  const stickySummaryLabel = [
    selectedVehicle?.plate_number || null,
    selectedVehicle?.model || selectedVehicle?.name || null,
    lightHasDurationSelection ? selectedDurationLabel : null,
    lightIncludedKmSummary,
    liveTotalAmount > 0 ? `${formatDynamicMad(liveTotalAmount)} MAD` : null,
  ].filter(Boolean).join(' • ');
  const setupSummaryLabel = effectiveLightRentalType
    ? lightHasDurationSelection
      ? `${effectiveLightRentalType === 'hourly' ? tr('Hourly', 'Horaire') : tr('Daily', 'Journalier')} • ${selectedDurationLabel}`
      : `${effectiveLightRentalType === 'hourly' ? tr('Hourly', 'Horaire') : tr('Daily', 'Journalier')}`
    : tr('Rental setup', 'Configuration');
  const vehicleSummaryLabel = selectedVehicle
    ? [
        selectedVehicle.plate_number || null,
        selectedVehicle.model || selectedVehicle.name || tr('Vehicle', 'Véhicule'),
        liveTotalAmount > 0 ? `${formatDynamicMad(liveTotalAmount)} MAD` : null,
      ].filter(Boolean).join(' • ')
    : tr('Choose vehicle', 'Choisir le véhicule');
  const packageSummaryLabel = formData.use_package_pricing && formData.selected_package_name
    ? `${formData.selected_package_name} • ${formatDynamicMad(liveTotalAmount)} MAD`
    : hasPackageDecision
      ? tr('Standard pricing', 'Tarification standard')
      : tr('Choose package', 'Choisir le forfait');
  const selectedLightPackageDurationLabel = (() => {
    if (!selectedLightPackage) return null;
    const packageDurationUnits = getPackageDurationUnits(selectedLightPackage) || 1;
    if (formData.rental_type === 'daily' && currentLightDurationUnits > 1) {
      return getLightDurationButtonLabel(currentLightDurationUnits, 'daily');
    }
    if (formData.rental_type === 'hourly' && packageDurationUnits === 1 && currentLightDurationUnits > 1) {
      return getLightDurationButtonLabel(currentLightDurationUnits, 'hourly');
    }
    if (packageDurationUnits === 0.5) return tr('30 min', '30 min');
    return `${packageDurationUnits} ${formData.rental_type === 'hourly' ? tr('Hour', 'heure') : tr('day', 'jour')}`;
  })();
  const packageSummaryAccent = (() => {
    const totalKm = Number(formData.selected_package_total_included_km || 0) || 0;
    if (totalKm > 0) return `${formatDynamicMad(totalKm)} KM`;
    const perUnitKm = Number(formData.selected_package_included_km_per_unit || 0) || 0;
    if (perUnitKm > 0) return `${formatDynamicMad(perUnitKm)} KM`;
    if (!(formData.use_package_pricing && formData.selected_package_name)) return null;
    const kmMatch = String(formData.selected_package_name).match(/(\d+\s*km)/i);
    return kmMatch ? kmMatch[1].toUpperCase().replace(/\s+/g, ' ') : null;
  })();
  const packageSummaryRestLabel = (() => {
    if (!formData.use_package_pricing) return packageSummaryLabel;
    const durationLabel = selectedLightPackageDurationLabel || formData.selected_package_name;
    if (!durationLabel) return packageSummaryLabel;
    return `${durationLabel} • ${formatDynamicMad(liveTotalAmount)} MAD`;
  })();
  const isLightFlowTransitioning = lightFlowTransition !== 'idle';
  const frozenLightSummary = isLightFlowTransitioning ? frozenLightSummaryRef.current : null;
  const displayStickySummaryLabel = frozenLightSummary?.stickySummaryLabel ?? stickySummaryLabel;
  const displaySetupSummaryLabel = frozenLightSummary?.setupSummaryLabel ?? setupSummaryLabel;
  const displayVehicleSummaryLabel = frozenLightSummary?.vehicleSummaryLabel ?? vehicleSummaryLabel;
  const displayPackageSummaryLabel = frozenLightSummary?.packageSummaryLabel ?? packageSummaryLabel;
  const displayPackageSummaryAccent = frozenLightSummary?.packageSummaryAccent ?? packageSummaryAccent;
  const displayPackageSummaryRestLabel = frozenLightSummary?.packageSummaryRestLabel ?? packageSummaryRestLabel;
  const shouldShowLightStickySummary = Boolean(displayStickySummaryLabel) && !isLightFlowTransitioning;
  const lightCustomerReady = Boolean(
    formData.customer_name?.trim() ||
    formData.customer_licence_number?.trim() ||
    formData.customer_phone?.trim()
  );
  const lightCustomerCanContinue = !(
    submitting ||
    isSubmitting ||
    successfullySubmitted ||
    isBannedCustomerBlocked ||
    (requiresCustomerVerification && (!formData.customer_licence_number?.trim() || !formData.customer_id_image))
  );
  const lightPrimaryPaymentAmount = (() => {
    if (formData.payment_status === 'paid') {
      return Number(formData.total_amount || getFixedPackageAmount(formData) || formData.unit_price || 0);
    }
    if (formData.payment_status === 'partial') {
      return Number(formData.deposit_amount || 0);
    }
    return 0;
  })();
  const lightStepThreePackageKmLabel = (() => {
    const totalKm = Number(formData.selected_package_total_included_km || 0) || 0;
    if (totalKm > 0) return `${formatDynamicMad(totalKm)} km`;
    const perUnitKm = Number(formData.selected_package_included_km_per_unit || 0) || 0;
    if (perUnitKm > 0) return `${formatDynamicMad(perUnitKm)} km`;
    return null;
  })();
  const lightPaymentSummaryLabel = [
    selectedVehicle?.model || selectedVehicle?.name || null,
    selectedDurationLabel || null,
    getSelectedPackageDisplayLabel(formData, tr),
  ].filter(Boolean).join(' • ');
  const lightDepositHasExistingSelection = mode === 'edit' && Boolean(
    selectedDepositTab ||
    Number(formData.damage_deposit || 0) > 0 ||
    formData.damage_deposit_document_url ||
    formData.damage_deposit_document_name
  );
  const lightDepositReadyToConfirm = !isLightVariant || lightDepositConfirmed || lightDepositHasExistingSelection;
  const lightConfirmInProgress = lightConfirmStage === 'confirming' || submitting || isSubmitting;
  const lightSelectedDepositTab = lightDepositReadyToConfirm ? (selectedDepositTab || (
    Number(formData.damage_deposit || 0) === 0 &&
    !formData.damage_deposit_document_url &&
    !formData.damage_deposit_document_name
      ? 'none'
      : null
  )) : null;

  const handlePhoneChange = (value) => {
    handleInputChange('customer_phone', value);
  };

  useEffect(() => {
    if (!isLightVariant || currentStep !== 2) return;
    if (currentLightDurationUnits === 0.5 && lightPackageDecisionMode === 'standard' && !formData.use_package_pricing) {
      setLightPackageDecisionMode('undecided');
    }
  }, [
    currentLightDurationUnits,
    currentStep,
    formData.use_package_pricing,
    isLightVariant,
    lightPackageDecisionMode,
  ]);

  useEffect(() => {
    if (!formData.vehicle_id) {
      setLightPackageDecisionMode('undecided');
      return;
    }

    if (formData.use_package_pricing && formData.selected_package_id) {
      setLightPackageDecisionMode('package');
    }
  }, [formData.selected_package_id, formData.use_package_pricing, formData.vehicle_id]);

  useEffect(() => {
    if (!formData.selected_package_id || !formData.rental_type) {
      return;
    }

    const selectedPackage = availablePackages.find(
      (pkg) => String(pkg.id || '') === String(formData.selected_package_id || '')
    );

    if (!selectedPackage) {
      return;
    }

    const currentDurationUnits = Math.max(
      Number(
        formData.rental_type === 'hourly'
          ? (formData.quantity_hours ?? formData.quantity_days)
          : formData.quantity_days
      ) || 0,
      formData.rental_type === 'hourly' ? 0.5 : 1
    );

    const packageDurationUnits = Number(getPackageDurationUnits(selectedPackage) || 0) || 0;

    const isDurationCompatible = formData.rental_type === 'hourly'
      ? (
          (currentDurationUnits === 0.5 && packageDurationUnits === 0.5) ||
          (currentDurationUnits === 4 && packageDurationUnits === 4) ||
          (currentDurationUnits !== 0.5 && currentDurationUnits !== 4 && packageDurationUnits === 1)
        )
      : packageDurationUnits === 1;

    if (isDurationCompatible) {
      return;
    }

    setSelectedPackageDraft(null);
    setFormData((prev) => ({
      ...prev,
      selected_package_id: null,
      selected_package_name: '',
      selected_package_fixed_amount: 0,
      selected_package_rate_per_unit: 0,
      selected_package_included_km: null,
      selected_package_included_km_per_unit: null,
      selected_package_total_included_km: null,
      selected_package_duration_units: null,
      selected_package_extra_rate: 0,
      selected_package_fuel_charge_enabled: false,
      selected_package_description: '',
      use_package_pricing: false,
      package_overrides_tier: false,
    }));
  }, [
    availablePackages,
    formData.quantity_days,
    formData.quantity_hours,
    formData.rental_type,
    formData.selected_package_id,
  ]);

  useEffect(() => {
    if (!selectedPackageDraft?.package_id) return;

    const activeDurationUnits = Math.max(
      Number(
        formData.rental_type === 'hourly'
          ? (formData.quantity_hours ?? formData.quantity_days)
          : formData.quantity_days
      ) || 0,
      formData.rental_type === 'hourly' ? 0.5 : 1
    );

    const reconciledTotalIncludedKm = calculatePackageTotalIncludedKm(
      selectedPackageDraft.package_included_km_per_unit,
      activeDurationUnits,
      selectedPackageDraft.package_duration_units
    );

    const needsReconcile =
      String(formData.selected_package_id || '') !== String(selectedPackageDraft.package_id || '') ||
      !formData.use_package_pricing ||
      String(formData.selected_package_name || '') !== String(selectedPackageDraft.package_name || '') ||
      Number(formData.selected_package_rate_per_unit || 0) !== Number(selectedPackageDraft.package_rate_per_unit || 0) ||
      Number(formData.selected_package_total_included_km || 0) !== Number(reconciledTotalIncludedKm || 0);

    if (!needsReconcile) return;

    setFormData((prev) => ({
      ...prev,
      selected_package_id: selectedPackageDraft.package_id,
      selected_package_name: selectedPackageDraft.package_name,
      selected_package_fixed_amount: selectedPackageDraft.package_rate_per_unit,
      selected_package_rate_per_unit: selectedPackageDraft.package_rate_per_unit,
      selected_package_included_km: selectedPackageDraft.package_included_km_per_unit,
      selected_package_included_km_per_unit: selectedPackageDraft.package_included_km_per_unit,
      selected_package_total_included_km: reconciledTotalIncludedKm,
      selected_package_duration_units: selectedPackageDraft.package_duration_units,
      selected_package_extra_rate: selectedPackageDraft.package_extra_rate,
      selected_package_fuel_charge_enabled: Boolean(selectedPackageDraft.package_fuel_charge_enabled),
      selected_package_description: selectedPackageDraft.package_description || '',
      use_package_pricing: true,
      package_overrides_tier: true,
      unit_price: selectedPackageDraft.package_rate_per_unit,
    }));
  }, [
    selectedPackageDraft,
    formData.selected_package_id,
    formData.selected_package_name,
    formData.selected_package_rate_per_unit,
    formData.selected_package_total_included_km,
    formData.use_package_pricing,
    formData.rental_type,
    formData.quantity_days,
    formData.quantity_hours,
  ]);

  const clearSelectedPackage = useCallback(() => {
    setSelectedPackageDraft(null);
    setFormData((prev) => ({
      ...prev,
      selected_package_id: null,
      selected_package_name: '',
      selected_package_fixed_amount: 0,
      selected_package_rate_per_unit: 0,
      selected_package_included_km: null,
      selected_package_included_km_per_unit: null,
      selected_package_total_included_km: null,
      selected_package_extra_rate: 0,
      selected_package_fuel_charge_enabled: false,
      selected_package_description: '',
      use_package_pricing: false,
      package_overrides_tier: false,
    }));
    setLightPackageDecisionMode('undecided');
    loadFuelChargeSettings(null, null, false);
  }, [loadFuelChargeSettings, setFormData]);

  const applyLightPackageSelection = useCallback((pkg) => {
    if (!pkg) {
      clearSelectedPackage();
      return;
    }

    const packageRate = Number(pkg.fixed_amount ?? pkg.package_rate ?? pkg.rate ?? pkg.price ?? 0) || 0;
    const includedKmPerUnit = Number(
      pkg.included_kilometers ?? pkg.included_km ?? pkg.km_limit ?? pkg.kmIncluded ?? 0
    ) || 0;
    const extraRate = Number(pkg.extra_km_rate ?? pkg.extra_rate ?? 0) || 0;
    const fuelChargeEnabledForPackage = Boolean(pkg.fuel_charge_enabled);
    const packageDurationUnits = getPackageDurationUnits(pkg);

    setFormData((prev) => {
      const currentDurationUnits = Math.max(
        Number(
          prev.rental_type === 'hourly'
            ? (prev.quantity_hours ?? prev.quantity_days)
            : prev.quantity_days
        ) || 0,
        prev.rental_type === 'hourly' ? 0.5 : 1
      );
      const nextDurationUnits = currentDurationUnits > 0
        ? currentDurationUnits
        : (Number.isFinite(packageDurationUnits) && packageDurationUnits > 0
            ? packageDurationUnits
            : (prev.rental_type === 'hourly' ? 0.5 : 1));
      const nextTotalIncludedKm = calculatePackageTotalIncludedKm(
        includedKmPerUnit,
        nextDurationUnits,
        packageDurationUnits
      );
      const nextFormData = {
        ...prev,
        quantity_days: nextDurationUnits,
        quantity_hours: prev.rental_type === 'hourly' ? nextDurationUnits : null,
        selected_package_id: pkg.id,
        selected_package_name: pkg.package_name || pkg.name || '',
        selected_package_fixed_amount: packageRate,
        selected_package_rate_per_unit: packageRate,
        selected_package_included_km: includedKmPerUnit || null,
        selected_package_included_km_per_unit: includedKmPerUnit || null,
        selected_package_total_included_km: nextTotalIncludedKm,
        selected_package_duration_units: packageDurationUnits,
        selected_package_extra_rate: extraRate,
        selected_package_fuel_charge_enabled: fuelChargeEnabledForPackage,
        selected_package_description: pkg.description || '',
        use_package_pricing: true,
        package_overrides_tier: true,
        unit_price: packageRate,
      };
      syncEndDateTimeFromStart(nextFormData, nextDurationUnits);
      return nextFormData;
    });

    setFuelChargeEnabled(fuelChargeEnabledForPackage);
    setLightPackageDecisionMode('package');
    if (isLightVariant && currentStep === 2) {
      setLightExpandedSection('package');
    }
  }, [clearSelectedPackage, currentStep, isLightVariant, setFormData, setFuelChargeEnabled, syncEndDateTimeFromStart]);

  const chooseStandardPricing = useCallback(() => {
    clearSelectedPackage();
    setLightPackageDecisionMode('standard');
  }, [clearSelectedPackage]);

  const clearLightDurationSelection = useCallback(() => {
    setSelectedQuickDuration(null);
    setLightDurationConfirmed(false);
    setFormData((prev) => ({
      ...prev,
      quantity_days: 0,
      quantity_hours: null,
      rental_end_date: prev.rental_start_date || prev.rental_end_date,
      rental_end_time: prev.rental_start_time || '',
      vehicle_id: '',
      selected_package_id: null,
      selected_package_name: '',
      selected_package_fixed_amount: 0,
      selected_package_rate_per_unit: 0,
      selected_package_included_km: null,
      selected_package_included_km_per_unit: null,
      selected_package_total_included_km: null,
      selected_package_extra_rate: 0,
      selected_package_fuel_charge_enabled: false,
      selected_package_description: '',
      use_package_pricing: false,
      package_overrides_tier: false,
    }));
    setLightPackageDecisionMode('undecided');
  }, [setFormData]);

  const handleLightBack = useCallback(() => {
    setShowLightActionsMenu(false);

    if (hasPackageDecision) {
      clearSelectedPackage();
      setLightExpandedSection('package');
      setLightPackageDecisionMode('undecided');
      return;
    }

    if (formData.vehicle_id) {
      setSelectedDepositTab(null);
      setCustomDepositAmount('');
      setLightDepositConfirmed(false);
      handleInputChange('vehicle_id', '');
      setLightExpandedSection('vehicle');
      setLightPackageDecisionMode('undecided');
      return;
    }

    if (hasDurationSelection) {
      clearLightDurationSelection();
      setLightExpandedSection('setup');
      setLightShowScheduleEditor(false);
      return;
    }

    if (effectiveLightRentalType) {
      handleInputChange('rental_type', '');
      setSelectedQuickDuration(null);
      setLightDurationConfirmed(false);
      setLightRentalTypeDraft('');
      setLightExpandedSection('setup');
      setLightPackageDecisionMode('undecided');
      return;
    }

    if (currentStep > 1) {
      handleBack();
    }
  }, [
    clearLightDurationSelection,
    clearSelectedPackage,
    currentStep,
    effectiveLightRentalType,
    formData.vehicle_id,
    handleInputChange,
    hasDurationSelection,
    hasPackageDecision,
  ]);

  const handleLightStartOver = useCallback(() => {
    setShowLightActionsMenu(false);
    setLightFlowTransitionFor('idle');
    setLightExpandedSection('setup');
    setLightShowScheduleEditor(false);
    setLightDurationConfirmed(false);
    setLightRentalTypeDraft('');
    setLightPackageDecisionMode('undecided');
    setSelectedDepositTab(null);
    setCustomDepositAmount('');
    setLightDepositConfirmed(false);
    handleReset();
  }, [handleReset, setLightFlowTransitionFor]);

  const handleLightRentalTypeSelect = useCallback((type) => {
    const startDate = getEffectiveCreateStartDate(formData.rental_start_date);
    const startTime = getEffectiveCreateStartTime(formData.rental_start_time);

    if (lightSectionTransitionTimeoutRef.current) {
      window.clearTimeout(lightSectionTransitionTimeoutRef.current);
      lightSectionTransitionTimeoutRef.current = null;
    }
    setLightFlowTransitionFor('idle');
    previousLightHasDurationSelectionRef.current = false;
    setLightExpandedSection('setup');
    setLightShowScheduleEditor(false);
    setLightDurationConfirmed(false);
    setLightRentalTypeDraft(type);
    setLightPackageDecisionMode('undecided');
    setActiveModelFilter(null);
    setSelectedQuickDuration(null);
    setSelectedPackageDraft(null);

    setFormData((prev) => ({
      ...prev,
      rental_type: type,
      rental_start_date: startDate,
      rental_start_time: startTime,
      rental_end_date: startDate,
      rental_end_time: startTime,
      quantity_days: 0,
      quantity_hours: null,
      vehicle_id: '',
      selected_package_id: null,
      selected_package_name: '',
      selected_package_fixed_amount: 0,
      selected_package_rate_per_unit: 0,
      selected_package_included_km: null,
      selected_package_included_km_per_unit: null,
      selected_package_total_included_km: null,
      selected_package_extra_rate: 0,
      selected_package_fuel_charge_enabled: false,
      selected_package_description: '',
      use_package_pricing: false,
      package_overrides_tier: false,
    }));

    if (errors.rental_type) {
      setErrors((prev) => ({ ...prev, rental_type: '' }));
    }

    requestAnimationFrame(() => {
      wizardTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }, [errors.rental_type, formData.rental_start_date, formData.rental_start_time, setFormData]);

  const handleLightClose = useCallback(() => {
    setShowLightActionsMenu(false);
    onCancel?.();
  }, [onCancel]);

  const handleLightStepBack = useCallback(() => {
    setShowLightActionsMenu(false);
    if (currentStep <= 1) {
      onCancel?.();
      return;
    }
    setCurrentStep((prev) => Math.max(prev - 1, 1));
  }, [currentStep, onCancel]);

  const customerSectionButtonClass =
    'inline-flex items-center justify-center gap-2 rounded-lg px-5 py-3 text-sm font-bold transition-all shadow-sm active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed';
  const customerPrimaryButtonClass = `${customerSectionButtonClass} bg-violet-700 text-white hover:bg-violet-800`;
  const customerSecondaryButtonClass = `${customerSectionButtonClass} border border-slate-200 bg-white text-slate-700 hover:bg-slate-50`;
  const customerTabButtonClass =
    'inline-flex items-center justify-center rounded-xl border px-4 py-3 text-sm font-semibold whitespace-nowrap transition-all';

  const customerTabs = [
    {
      id: 'basic',
      label: tr('Basic Info', 'Infos de base'),
      content: (
        <div className="space-y-4">
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4">
            <div className="flex items-start gap-3">
              <User className="mt-1 h-5 w-5 text-slate-700" />
              <div className="flex-1">
                <h4 className="text-lg font-semibold text-slate-900">{tr('Primary customer details', 'Détails principaux du client')}</h4>
                <p className="mt-1 text-xs text-slate-500">
                  {tr('Keep the same styling and spacing as Additional Info so the form feels consistent.', "Gardez le même style et le même espacement qu'Informations supplémentaires pour conserver une mise en page cohérente.")}
                </p>
              </div>
            </div>

            <div className="mt-4 space-y-4">
              <div className="rounded-lg bg-white p-4">
                <div className="relative" ref={customerSearchRef}>
                  <label className="text-sm font-semibold text-slate-700">{tr('Customer Name', 'Nom du client')} *</label>
                  <input
                    type="text"
                    value={formData.customer_name}
                    onChange={(e) => handleInputChange('customer_name', e.target.value)}
                    placeholder={tr('Enter customer name', 'Entrez le nom du client')}
                    disabled={successfullySubmitted}
                    className={`mt-2 w-full rounded-lg border bg-white px-4 py-4 text-base font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-violet-500 ${
                      errors.customer_name ? 'border-red-400' : 'border-slate-200'
                    } ${successfullySubmitted ? 'opacity-50 cursor-not-allowed' : ''}`}
                  />
                  {errors.customer_name && (
                    <p className="mt-2 text-xs font-medium text-red-500">{errors.customer_name}</p>
                  )}
                  {suggestions.length > 0 && !successfullySubmitted && (
                    <div className="absolute z-10 mt-2 max-h-60 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
                      {suggestions.map((suggestion, index) => (
                        <button
                          key={index}
                          type="button"
                          onClick={() => handleSuggestionClick(suggestion)}
                          className="flex w-full items-center gap-3 border-b border-slate-100 px-4 py-3 text-left hover:bg-violet-50 last:border-b-0"
                        >
                          <UserSearch className="h-4 w-4 flex-shrink-0 text-slate-500" />
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-semibold text-slate-800">{suggestion.name}</p>
                            <p className="truncate text-sm text-slate-500">{suggestion.phone}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="rounded-lg bg-white p-4">
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  {tr('License Number', 'Numéro de permis')} {requiresCustomerVerification ? '*' : ''}
                </label>
                <input
                  type="text"
                  value={formData.customer_licence_number}
                  onChange={(e) => handleInputChange('customer_licence_number', e.target.value)}
                  placeholder={tr('Enter license number', 'Entrez le numéro du permis')}
                  disabled={successfullySubmitted}
                  className={`w-full rounded-lg border bg-white px-4 py-4 text-base font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-violet-500 ${
                    errors.customer_licence_number ? 'border-red-400' : !formData.customer_licence_number?.trim() ? 'border-slate-200 bg-slate-50' : 'border-slate-200'
                  } ${successfullySubmitted ? 'opacity-50 cursor-not-allowed' : ''}`}
                />
                {errors.customer_licence_number && (
                  <p className="mt-2 text-xs font-medium text-red-500">{errors.customer_licence_number}</p>
                )}
                {!formData.customer_licence_number?.trim() && !errors.customer_licence_number && !successfullySubmitted && (
                  <p className="mt-2 text-xs font-medium text-slate-500">
                    {requiresCustomerVerification
                      ? tr('Required before starting this rental.', 'Obligatoire avant de démarrer cette location.')
                      : tr('Optional for scheduling. Required before the rental can start.', 'Optionnel pour planifier. Obligatoire avant le démarrage de la location.')}
                  </p>
                )}
                {errors.customer_id_image && (
                  <p className="mt-2 text-xs font-medium text-red-500">{errors.customer_id_image}</p>
                )}
              </div>

              <div className="rounded-lg bg-white p-4">
                <PhoneInputWithCountryCode
                  value={formData.customer_phone}
                  onChange={handlePhoneChange}
                  error={errors.customer_phone}
                  disabled={successfullySubmitted}
                  countryCode={countryCode}
                  onCountryCodeChange={setCountryCode}
                  mobileOptimized={true}
                />
              </div>

              <div className="rounded-lg bg-white p-4">
                <label className="text-sm font-semibold text-slate-700">{tr('Email (Optional)', 'E-mail (optionnel)')}</label>
                <div className="relative mt-2">
                  <Mail className="absolute left-4 top-4 h-4 w-4 text-slate-400" />
                  <input
                    type="email"
                    value={formData.customer_email}
                    onChange={(e) => handleInputChange('customer_email', e.target.value)}
                    placeholder="customer@example.com"
                    disabled={successfullySubmitted}
                    className={`w-full rounded-lg border bg-white py-4 pl-11 pr-4 text-base font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-violet-500 ${
                      errors.customer_email ? 'border-red-400' : 'border-slate-200'
                    } ${successfullySubmitted ? 'opacity-50 cursor-not-allowed' : ''}`}
                  />
                </div>
                {errors.customer_email && (
                  <p className="mt-2 text-xs font-medium text-red-500">{errors.customer_email}</p>
                )}
              </div>

              <div className="rounded-lg bg-white p-4">
                <label className="text-sm font-semibold text-slate-700">{tr('Secondary Phone (Optional)', 'Téléphone secondaire (optionnel)')}</label>
                <input
                  type="tel"
                  value={formData.secondary_phone || ''}
                  onChange={(e) => handleInputChange('secondary_phone', e.target.value)}
                  placeholder={tr('Optional alternate phone number', 'Numéro secondaire optionnel')}
                  disabled={successfullySubmitted}
                  className={`mt-2 w-full rounded-lg border border-slate-200 bg-white px-4 py-4 text-base font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-violet-500 ${
                    successfullySubmitted ? 'opacity-50 cursor-not-allowed' : ''
                  }`}
                />
              </div>

            </div>
          </div>
        </div>
      )
    },
    {
      id: 'additional',
      label: tr('Additional Info', 'Informations supplémentaires'),
      content: (
        <div className="space-y-4">
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-slate-900">{tr('Optional second driver', 'Second conducteur optionnel')}</p>
                <p className="mt-1 text-xs text-slate-500">
                  {tr('Match the Tours flow: scan or upload the ID, then review the visible fields here.', "Suivez le même flux que pour les tours : scannez ou téléversez l'identité, puis vérifiez ici les champs visibles.")}
                </p>
              </div>
              {(formData.second_driver_name || formData.second_driver_license || formData.second_driver_id_image) && (
                <button
                  type="button"
                  onClick={() => {
                    setFormData((prev) => ({
                      ...prev,
                      second_driver_name: '',
                      second_driver_license: '',
                      second_driver_id_image: null,
                    }));
                    setSecondDrivers([]);
                      toast.info(tr('Second driver cleared', 'Second conducteur supprimé'));
                  }}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-red-200 bg-white text-red-600 hover:bg-red-50"
                  aria-label={tr('Clear second driver', 'Effacer le second conducteur')}
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div className="rounded-lg bg-white p-4">
                <label className="text-sm font-semibold text-slate-700">{tr('Second Driver Name', 'Nom du second conducteur')}</label>
                <input
                  type="text"
                  value={formData.second_driver_name || ''}
                  onChange={(event) => handleInputChange('second_driver_name', event.target.value)}
                  className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-4 py-4 text-base font-semibold text-slate-900"
                  placeholder={tr('Optional', 'Optionnel')}
                  disabled={successfullySubmitted}
                />
              </div>
              <div className="rounded-lg bg-white p-4">
                <label className="text-sm font-semibold text-slate-700">{tr('Second Driver License', 'Permis du second conducteur')}</label>
                <input
                  type="text"
                  value={formData.second_driver_license || ''}
                  onChange={(event) => handleInputChange('second_driver_license', event.target.value)}
                  className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-4 py-4 text-base font-semibold text-slate-900"
                  placeholder={tr('Optional', 'Optionnel')}
                  disabled={successfullySubmitted}
                />
              </div>
            </div>

            <div className="mt-4 rounded-lg bg-white p-4">
              <div>
                <p className="text-sm font-semibold text-slate-700">{tr('Second Driver Scan', 'Scan du second conducteur')}</p>
              </div>
              {formData.second_driver_id_image && (
                <div className="mt-3 flex items-center justify-between gap-3 rounded-lg bg-violet-50 px-4 py-3 text-sm font-semibold text-violet-700">
                  <div className="min-w-0">
                    <p className="truncate">
                      {tr('ID captured', 'Pièce capturée')} {formData.second_driver_name ? `${tr('for', 'pour')} ${formData.second_driver_name}` : ''}
                    </p>
                    <a
                      href={formData.second_driver_id_image}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1 inline-flex text-xs font-semibold text-violet-600 hover:underline"
                    >
                      {tr('View uploaded ID', "Voir l'identité téléversée")}
                    </a>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setFormData((prev) => ({ ...prev, second_driver_id_image: null }));
                      setSecondDrivers([]);
                      toast.info(tr('Second driver ID removed', "Pièce d'identité du second conducteur supprimée"));
                    }}
                    className="inline-flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-white text-violet-600 hover:bg-violet-100"
                    aria-label={tr('Remove second driver ID', "Supprimer l'identité du second conducteur")}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              )}
              {!successfullySubmitted && (
                <div className="pt-3">
                  <button
                    type="button"
                    onClick={() => {
                      setSecondDriverScanEntryMode('upload');
                      setShowSecondDriverScanModal(true);
                    }}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-violet-200 bg-violet-50 px-5 py-3 text-sm font-bold text-violet-700 hover:bg-violet-100"
                  >
                    <Upload className="h-4 w-4" />
                    {tr('Upload Photo', 'Téléverser une photo')}
                  </button>
                  <p className="text-xs text-gray-500 text-center">
                    {tr('Use the top button to scan the second driver ID, or upload a photo here.', "Utilisez le bouton du haut pour scanner l'identité du second conducteur, ou téléversez une photo ici.")}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )
    }
  ];

  useEffect(() => {
    if (!customerTabs.some((tab) => tab.id === activeTab)) {
      setActiveTab('basic');
    }
  }, [activeTab]);

  useEffect(() => {
    if (!isLightVariant || currentStep !== 1) return;
    if (!lightCustomerEditOpen && !lightCustomerReady) return;

    const timeoutId = window.setTimeout(() => {
      lightCustomerNameInputRef.current?.focus?.();
    }, 120);

    return () => window.clearTimeout(timeoutId);
  }, [currentStep, isLightVariant, lightCustomerEditOpen, lightCustomerReady]);

  const previewRentalForDrawer = useMemo(() => ({
    customer_id: formData.customer_id,
    customer_name: formData.customer_name,
    customer_email: formData.customer_email,
    customer_phone: formData.customer_phone,
    customer_licence_number: formData.customer_licence_number,
    customer_id_number: formData.customer_id_number,
    customer_dob: formData.customer_dob,
    customer_place_of_birth: formData.customer_place_of_birth,
    customer_nationality: formData.customer_nationality,
    customer_issue_date: formData.customer_issue_date,
    customer_id_image: formData.customer_id_image,
    customer_id_scan_history: formData.customer_id_scan_history,
    id: selectedRentalForDrawer?.id || 'preview-rental-id',
  }), [
    formData.customer_id,
    formData.customer_name,
    formData.customer_email,
    formData.customer_phone,
    formData.customer_licence_number,
    formData.customer_id_number,
    formData.customer_dob,
    formData.customer_place_of_birth,
    formData.customer_nationality,
    formData.customer_issue_date,
    formData.customer_id_image,
    formData.customer_id_scan_history,
    selectedRentalForDrawer?.id,
  ]);

  const effectiveDrawerRental = selectedRentalForDrawer || previewRentalForDrawer;
  const activeSecondDriver = secondDrivers[0] || null;
  const secondDriverImageCount = Array.isArray(activeSecondDriver?.uploaded_images) && activeSecondDriver.uploaded_images.length > 0
    ? activeSecondDriver.uploaded_images.length
    : Array.isArray(formData.second_driver_uploaded_images) && formData.second_driver_uploaded_images.length > 0
      ? formData.second_driver_uploaded_images.length
      : (formData.second_driver_id_image ? 1 : 0);
  const hasSavedSecondDriverId = Boolean(formData.second_driver_id_image || secondDriverImageCount > 0);
  const openSecondDriverScanModal = useCallback((entryMode = 'scan') => {
    setSecondDriverScanEntryMode(entryMode);
    setShowSecondDriverScanModal(true);
  }, []);
  const clearSecondDriverIdMedia = useCallback(() => {
    setSecondDrivers((prev) =>
      prev.map((driver) => ({
        ...driver,
        id_scan_url: null,
        customer_id_image: null,
        uploaded_images: [],
        extra_images: [],
      }))
    );
    setFormData((prev) => ({
      ...prev,
      second_driver_uploaded_images: [],
      second_driver_id_image: null,
    }));
  }, []);

  const submitVerificationOnlyFlow = async () => {
    const submissionResult = await handleSubmit();
    if (submissionResult?.rentalId) {
      navigate(submissionResult.redirectUrl || `/admin/rentals/${submissionResult.rentalId}`);
      return;
    }
    if (onSuccess && submissionResult) {
      setTimeout(() => onSuccess(submissionResult.result), 1000);
    }
  };

  useEffect(() => {
    if (!successfullySubmitted || !successRedirectUrl) return undefined;

    const navigateTimer = window.setTimeout(() => {
      navigate(successRedirectUrl);
    }, 80);

    const hardRedirectTimer = window.setTimeout(() => {
      const target = new URL(successRedirectUrl, window.location.origin);
      const currentPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      const targetPath = `${target.pathname}${target.search}${target.hash}`;

      if (currentPath !== targetPath) {
        window.location.assign(successRedirectUrl);
      }
    }, 1400);

    return () => {
      window.clearTimeout(navigateTimer);
      window.clearTimeout(hardRedirectTimer);
    };
  }, [navigate, successRedirectUrl, successfullySubmitted]);

  const handleNext = async () => {
    if (isBannedCustomerBlocked) {
      setShowCustomerAlertModal(true);
      toast.error('This customer is banned. An admin or owner must remove the ban before you can continue.');
      return;
    }

    const isValid = await validateStep(currentStep);
    if (!isValid) {
      return;
    }

    if (isCustomerVerificationOnlyMode && currentStep === 1) {
      await submitVerificationOnlyFlow();
      return;
    }

    setCurrentStep(prev => Math.min(prev + 1, 3));
  };

  const handleBack = () => {
    setCurrentStep(prev => Math.max(prev - 1, 1));
  };

  useEffect(() => {
    if (!isLightVariant || mode === 'edit' || currentStep !== 3) return;
    setLightDepositConfirmed(false);
  }, [currentStep, isLightVariant, mode]);

  useEffect(() => {
    if (!isLightVariant || currentStep === 3) return;
    setLightConfirmStage('idle');
  }, [currentStep, isLightVariant]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const scrollToTop = () => {
      wizardTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const timeoutId = window.setTimeout(scrollToTop, 50);
    return () => window.clearTimeout(timeoutId);
  }, [currentStep]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (currentStep !== 2) return;

    const previousVehicleId = previousVehicleIdRef.current;
    const nextVehicleId = formData.vehicle_id || '';
    previousVehicleIdRef.current = nextVehicleId;

    if (isLightVariant) return;

    if (!nextVehicleId || String(previousVehicleId) === String(nextVehicleId)) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      vehicleStepRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);

    return () => window.clearTimeout(timeoutId);
  }, [currentStep, formData.vehicle_id, isLightVariant, lightFlowTransition]);

  useEffect(() => {
    if (!isLightVariant || currentStep !== 2) {
      previousLightHasDurationSelectionRef.current = lightHasDurationSelection;
      return;
    }

    const previousLightHasDurationSelection = previousLightHasDurationSelectionRef.current;
    previousLightHasDurationSelectionRef.current = lightHasDurationSelection;

    if (!lightHasDurationSelection || previousLightHasDurationSelection || formData.vehicle_id) {
      return;
    }

    setLightDurationConfirmed(true);
    animateLightSectionTransition('vehicle', vehicleStepRef);
  }, [animateLightSectionTransition, currentStep, formData.vehicle_id, isLightVariant, lightHasDurationSelection]);

  const handleFormSubmit = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (!explicitSubmitRef.current) {
      return;
    }
    
    explicitSubmitRef.current = false;
    
    if (currentStep !== 3) {
      return;
    }

    if (isLightVariant && mode !== 'edit' && !lightDepositReadyToConfirm) {
      scrollLightSectionIntoView(lightDepositStepRef);
      return;
    }

    if (isLightVariant) {
      setLightConfirmStage('confirming');
    }
    
    try {
      await submitVerificationOnlyFlow();
    } catch (error) {
      setLightConfirmStage('idle');
    } finally {
      if (!successfullySubmitted) {
        setLightConfirmStage('idle');
      }
    }
  };

  useEffect(() => {
    if (!isLightVariant || currentStep !== 2 || !lightHasDurationSelection) {
      return;
    }

    if (activeModels.length > 0 && (activeModelFilter === null || activeModelFilter === undefined || activeModelFilter === '')) {
      setActiveModelFilter(activeModels[0].id);
    }
  }, [activeModelFilter, activeModels, currentStep, isLightVariant, lightHasDurationSelection, setActiveModelFilter]);

  useEffect(() => {
    if (!isLightVariant || currentStep !== 2 || !formData.rental_type || !lightHasDurationSelection || visibleVehicles.length === 0) {
      setLightVehiclePriceMap({});
      return;
    }

    let cancelled = false;
    const durationUnits = Number(
      formData.rental_type === 'hourly'
        ? (formData.quantity_hours ?? formData.quantity_days)
        : formData.quantity_days
    ) || 1;

    const loadLightVehiclePrices = async () => {
      const packageCache = new Map();
      const selectedPackagePrice = formData.use_package_pricing && selectedLightPackage
        ? getLightPackagePreviewTotal(selectedLightPackage)
        : 0;
      const selectedPackageModelId = String(
        selectedLightPackage?.vehicle_model_id
        ?? selectedLightPackage?.vehicleModelId
        ?? ''
      );
      const entries = await Promise.all(
        visibleVehicles.map(async (vehicle) => {
          const resolvedModelId = resolveLightVehicleModelId(vehicle);
          const vehicleModelId = String(resolvedModelId ?? '');

          if (
            selectedPackagePrice > 0
            && (!selectedPackageModelId || !vehicleModelId || selectedPackageModelId === vehicleModelId)
          ) {
            return [String(vehicle.id), selectedPackagePrice];
          }

          if (formData.rental_type === 'hourly' && durationUnits === 0.5 && resolvedModelId) {
            const modelId = String(resolvedModelId);
            if (!packageCache.has(modelId)) {
              packageCache.set(modelId, fetchKMPackages(resolvedModelId, 'hourly'));
            }
            const modelPackages = await packageCache.get(modelId);
            const matchingPackage = findMatchingDurationPackage(modelPackages || [], 'hourly', durationUnits);
            if (matchingPackage) {
              const packagePrice = Number(
                matchingPackage.fixed_amount ??
                matchingPackage.package_rate ??
                matchingPackage.rate ??
                matchingPackage.price ??
                0
              ) || 0;
              return [String(vehicle.id), packagePrice];
            }
          }

          const price = await getDirectPricing(vehicle.id, formData.rental_type, durationUnits);
          const numericPrice = Number(price) || 0;
          const totalPrice = (
            formData.rental_type === 'hourly' || formData.rental_type === 'daily'
          ) && durationUnits > 1
            ? numericPrice * durationUnits
            : numericPrice;
          return [String(vehicle.id), totalPrice];
        })
      );

      if (!cancelled) {
        setLightVehiclePriceMap(Object.fromEntries(entries));
      }
    };

    loadLightVehiclePrices();

    return () => {
      cancelled = true;
    };
  }, [
    currentStep,
    formData.quantity_days,
    formData.quantity_hours,
    formData.rental_type,
    formData.use_package_pricing,
    lightHasDurationSelection,
    isLightVariant,
    resolveLightVehicleModelId,
    selectedLightPackage,
    visibleVehicles,
  ]);

  useEffect(() => {
    if (!isLightVariant || currentStep !== 2) return;
    if (formData.rental_type !== 'hourly' || currentLightDurationUnits !== 0.5) return;
    if (!formData.vehicle_id || availablePackages.length === 0) return;

    const matchingPackage = findMatchingDurationPackage(availablePackages, 'hourly', 0.5);
    if (!matchingPackage) return;

    const selectedPackageId = String(formData.selected_package_id || '');
    if (selectedPackageId === String(matchingPackage.id || '')) return;

    applyLightPackageSelection(matchingPackage);
  }, [
    applyLightPackageSelection,
    availablePackages,
    currentLightDurationUnits,
    currentStep,
    formData.rental_type,
    formData.selected_package_id,
    formData.vehicle_id,
    isLightVariant,
  ]);

  const renderLightStepTwo = () => (
    <div className="px-4 pb-60 pt-4 [overflow-anchor:none] sm:px-6 sm:pb-36">
      <div className="space-y-4">
        {shouldShowLightStickySummary && (
          <button
            type="button"
            onClick={() => {
              if (!effectiveLightRentalType || !lightHasDurationSelection) setLightExpandedSection('setup');
              else if (!formData.vehicle_id) setLightExpandedSection('vehicle');
              else if (!hasPackageDecision) setLightExpandedSection('package');
            }}
            className="sticky top-3 z-10 hidden w-full items-center justify-between rounded-2xl border border-violet-500 bg-violet-50/95 px-4 py-3 text-left shadow-[0_16px_30px_rgba(79,70,229,0.18)] backdrop-blur sm:flex"
          >
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-500">
                {tr('Current selection', 'Sélection actuelle')}
              </p>
              <p className="mt-1 truncate text-sm font-bold text-slate-900">{displayStickySummaryLabel}</p>
            </div>
            <span className="rounded-full bg-white/90 px-3 py-1 text-xs font-semibold text-violet-700 shadow-sm">
              {liveTotalAmount > 0 ? `${formatDynamicMad(liveTotalAmount)} MAD` : tr('In progress', 'En cours')}
            </span>
          </button>
        )}

        <div
          className={`overflow-hidden rounded-[22px] border bg-white/95 backdrop-blur transition-all duration-200 ease-out ${
            effectiveLightRentalType && lightExpandedSection === 'setup'
              ? 'border-violet-300 ring-1 ring-violet-200 shadow-[0_18px_40px_rgba(76,29,149,0.14)]'
              : 'border-slate-200 shadow-sm'
          }`}
        >
          {!effectiveLightRentalType ? (
            <div className="flex w-full items-center justify-between gap-3 px-4 py-4 text-left">
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-500">
                  {tr('Rental setup', 'Configuration')}
                </p>
                <div className="mt-1 flex items-center gap-3">
                  <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-violet-50 text-violet-600 shadow-sm">
                    <Clock className="h-5 w-5" />
                  </span>
                  <h3 className="truncate text-lg font-bold text-slate-900">{tr('Rental setup', 'Configuration')}</h3>
                </div>
              </div>
              <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600">
                {tr('Choose below', 'Choisir ci-dessous')}
                <ChevronDown className="h-3.5 w-3.5" />
              </span>
            </div>
          ) : (
            <>
              <button
                type="button"
                onClick={() => {
                  setLightExpandedSection((prev) => (prev === 'setup' ? null : 'setup'));
                }}
                className="flex w-full items-center justify-between gap-3 px-4 py-4 text-left"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-500">
                    {tr('Rental setup', 'Configuration')}
                  </p>
                  <div className="mt-1 flex items-center justify-between gap-3">
                    <div className="min-w-0 flex items-center gap-3">
                      <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-violet-50 text-violet-600 shadow-sm">
                        <Clock className="h-5 w-5" />
                      </span>
                      <h3 className="truncate text-lg font-bold text-slate-900">{displaySetupSummaryLabel}</h3>
                    </div>
                    <span className="inline-flex items-center gap-2">
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                        {tr('Change', 'Modifier')}
                        {lightHasDurationSelection && <CheckCircle className="h-3.5 w-3.5" />}
                      </span>
                      <span className={`inline-flex h-7 w-7 items-center justify-center rounded-full transition-colors ${
                        lightExpandedSection === 'setup'
                          ? 'bg-violet-100 text-violet-700'
                          : 'bg-slate-100 text-slate-500'
                      }`}>
                        {lightExpandedSection === 'setup' ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                      </span>
                    </span>
                  </div>
                </div>
              </button>

              {lightExpandedSection === 'setup' && (
                <div className="space-y-4 border-t border-slate-100 bg-white/70 px-4 pb-4 pt-3 backdrop-blur-[2px]">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50/90 px-4 py-3 shadow-sm backdrop-blur-[3px]">
                    <div className="mb-4 grid grid-cols-2 gap-2">
                      {['hourly', 'daily'].map((type) => (
                        <button
                          key={type}
                          type="button"
                          onClick={() => {
                            handleLightRentalTypeSelect(type);
                          }}
                          disabled={successfullySubmitted}
                          className={`rounded-2xl px-4 py-3 text-center text-sm font-bold transition-all ${
                            effectiveLightRentalType === type
                              ? 'bg-violet-600 text-white'
                              : 'border border-slate-200 bg-white text-slate-800'
                          } ${successfullySubmitted ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                          <span className="inline-flex items-center justify-center gap-2">
                            {type === 'hourly' ? (
                              <Clock className="h-4 w-4 shrink-0" />
                            ) : (
                              <Calendar className="h-4 w-4 shrink-0" />
                            )}
                            <span>{type === 'hourly' ? tr('Hourly', 'Horaire') : tr('Daily', 'Journalier')}</span>
                          </span>
                        </button>
                      ))}
                    </div>
                    <div className="mb-4">
                      <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                        {tr('Quick duration', 'Durée rapide')}
                      </p>
                      <div className={`grid gap-2 ${effectiveLightRentalType === 'hourly' ? 'grid-cols-3' : 'grid-cols-4'}`}>
                        {(effectiveLightRentalType === 'hourly' ? lightQuickHourOptions : lightQuickDayOptions).map((value) => {
                          const isSelected = selectedQuickDuration === value;
                          return (
                            <button
                              key={`${effectiveLightRentalType}-${value}`}
                              type="button"
                              onClick={() => {
                                if (effectiveLightRentalType === 'hourly') handleQuickHourSelect(value);
                                else handleQuickDaySelect(value);
                                setLightDurationConfirmed(true);
                                animateLightSectionTransition('vehicle', vehicleStepRef);
                              }}
                              className={`rounded-2xl px-2 py-3 text-center text-sm font-bold transition-all ${
                                isSelected
                                  ? 'bg-violet-600 text-white'
                                  : 'border border-slate-200 bg-white text-slate-800 hover:border-violet-300'
                              }`}
                            >
                              <span className="block leading-tight">{getLightDurationButtonLabel(value, effectiveLightRentalType)}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                          {tr('Schedule', 'Planning')}
                        </p>
                        <p className="mt-1 text-sm font-semibold text-slate-900">{formatPeriodDisplay()}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setLightShowScheduleEditor((prev) => !prev)}
                        className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                      >
                        {lightShowScheduleEditor ? tr('Hide', 'Masquer') : tr('Edit', 'Modifier')}
                      </button>
                    </div>
                    {lightShowScheduleEditor && (
                      <div className="mt-4">
                        <CollapsibleDatesTimes
                          formData={formData}
                          errors={errors}
                          rentalType={effectiveLightRentalType}
                          successfullySubmitted={successfullySubmitted}
                          handleInputChange={handleInputChange}
                          handleQuickHourSelect={handleQuickHourSelect}
                          handleQuickDaySelect={handleQuickDaySelect}
                          selectedQuickDuration={selectedQuickDuration}
                          showQuickDurationShortcuts={false}
                        />
                      </div>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {lightHasDurationSelection && (
        <div
          ref={vehicleStepRef}
          className={`overflow-hidden rounded-[22px] border bg-white/95 backdrop-blur transition-all duration-200 ease-out ${
            lightExpandedSection === 'vehicle'
              ? 'border-violet-300 ring-1 ring-violet-200 shadow-[0_18px_40px_rgba(76,29,149,0.14)]'
              : 'border-slate-200 shadow-sm'
          }`}
        >
          <button
            type="button"
            onClick={() => setLightExpandedSection((prev) => (prev === 'vehicle' ? null : 'vehicle'))}
            className="flex w-full items-center justify-between gap-3 px-4 py-4 text-left"
          >
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-500">
                {tr('Vehicle', 'Véhicule')}
              </p>
              <div className="mt-1 flex items-center justify-between gap-3">
                <div className="min-w-0 flex items-center gap-3">
                  <span className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl shadow-sm transition-colors ${
                    lightExpandedSection === 'vehicle'
                      ? 'bg-violet-50 text-violet-600'
                      : 'bg-emerald-50 text-emerald-600'
                  }`}>
                    <CarIcon className="h-5 w-5" />
                  </span>
                  <h3 className="truncate text-lg font-bold text-slate-900">{displayVehicleSummaryLabel}</h3>
                </div>
                {formData.vehicle_id && (
                  <span className="inline-flex items-center gap-2">
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                      {tr('Change', 'Modifier')}
                      <CheckCircle className="h-3.5 w-3.5" />
                    </span>
                    <span className={`inline-flex h-7 w-7 items-center justify-center rounded-full transition-colors ${
                      lightExpandedSection === 'vehicle'
                        ? 'bg-violet-100 text-violet-700'
                        : 'bg-slate-100 text-slate-500'
                    }`}>
                      {lightExpandedSection === 'vehicle' ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                    </span>
                  </span>
                )}
              </div>
            </div>
            {!formData.vehicle_id && (
              <div className="rounded-full bg-slate-100 p-2 text-slate-500">
                <ChevronDown className="h-4 w-4" />
              </div>
            )}
          </button>

            {(lightExpandedSection === 'vehicle' || lightVehicleCollapseHeight !== null) && (
              <div
                ref={lightVehicleBodyRef}
                style={lightVehicleCollapseHeight !== null ? {
                  maxHeight: lightExpandedSection === 'vehicle' ? `${lightVehicleCollapseHeight}px` : '0px',
                } : undefined}
                className={`overflow-hidden rounded-b-[22px] border-t border-slate-100 bg-white/70 backdrop-blur-[2px] transition-[max-height,opacity] duration-300 ease-out [overflow-anchor:none] ${
                  lightExpandedSection === 'vehicle' ? 'opacity-100' : 'opacity-0'
                }`}
              >
              <div className="space-y-4 px-4 pb-4 pt-3">
                {activeModels.length > 0 && (
                  <div className="-mx-4 overflow-x-auto px-4 pb-1">
                    <div className="flex min-w-max gap-2">
                      {activeModels.map((model) => (
                        <button
                          key={model.id}
                          type="button"
                          onClick={() => setActiveModelFilter(model.id)}
                          className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-all ${
                            String(activeModelFilter ?? activeModels[0]?.id) === String(model.id)
                              ? 'bg-violet-600 text-white'
                              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                          }`}
                        >
                          {model.model || model.name?.split(' ').pop() || tr('Model', 'Modèle')}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div
                  ref={lightVehicleScrollerRef}
                  onScroll={(event) => {
                    const nextScrollLeft = event.currentTarget.scrollLeft;
                    const previousScrollLeft = Number(lightVehicleScrollerStateRef.current.scrollLeft || 0);
                    if (Math.abs(nextScrollLeft - previousScrollLeft) > 1) {
                      lightVehicleScrollerStateRef.current = {
                        scrollLeft: nextScrollLeft,
                        lastScrolledAt: Date.now(),
                      };
                    }
                  }}
                  className="-mx-4 overflow-x-auto overflow-y-hidden px-4 py-3 [-webkit-overflow-scrolling:touch]"
                >
                  <div className="flex snap-x snap-mandatory items-stretch gap-3">
                    {visibleVehicles.map((vehicle) => {
                      const isSelected = String(formData.vehicle_id || '') === String(vehicle.id || '');
                      const isConfirmingSelection = isSelected && lightFlowTransition === 'selecting_vehicle';
                      const isAvailable = String(vehicle.status || '').toLowerCase() === 'available' || !vehicle.status;
                      const mappedLightPrice = lightVehiclePriceMap[String(vehicle.id)];
                      return (
                        <button
                          key={vehicle.id}
                          type="button"
                          tabIndex={-1}
                          onMouseDown={(event) => {
                            event.preventDefault();
                          }}
                          onPointerDown={(event) => {
                            if (event.pointerType === 'mouse') return;
                            lightVehicleScrollerStateRef.current = {
                              scrollLeft: lightVehicleScrollerRef.current?.scrollLeft || 0,
                              lastScrolledAt: lightVehicleScrollerStateRef.current.lastScrolledAt || 0,
                            };
                            lightVehiclePointerRef.current = {
                              vehicleId: vehicle.id || '',
                              startX: event.clientX,
                              startY: event.clientY,
                              startScrollLeft: lightVehicleScrollerRef.current?.scrollLeft || 0,
                              startedAt: Date.now(),
                              moved: false,
                            };
                          }}
                          onPointerMove={(event) => {
                            if (event.pointerType === 'mouse') return;
                            const gesture = lightVehiclePointerRef.current;
                            if (String(gesture.vehicleId || '') !== String(vehicle.id || '')) return;
                            const deltaX = Math.abs(event.clientX - Number(gesture.startX || 0));
                            const deltaY = Math.abs(event.clientY - Number(gesture.startY || 0));
                            const deltaScroll = Math.abs((lightVehicleScrollerRef.current?.scrollLeft || 0) - Number(gesture.startScrollLeft || 0));
                            if (deltaX > 10 || deltaY > 10 || deltaScroll > 2) {
                              lightVehiclePointerRef.current = { ...gesture, moved: true };
                            }
                          }}
                          onPointerCancel={() => {
                            lightVehiclePointerRef.current = { vehicleId: null, startX: 0, startY: 0, startScrollLeft: 0, startedAt: 0, moved: false };
                            suppressNextLightVehicleClickRef.current = {
                              vehicleId: vehicle.id || '',
                              until: Date.now() + 650,
                            };
                          }}
                          onClick={() => {
                            const lastTouch = lastLightVehicleTouchSelectRef.current;
                            const suppressedClick = suppressNextLightVehicleClickRef.current;
                            const recentlyScrolled = Date.now() - Number(lightVehicleScrollerStateRef.current.lastScrolledAt || 0) < 220;
                            if (
                              String(suppressedClick.vehicleId || '') === String(vehicle.id || '') &&
                              Date.now() < Number(suppressedClick.until || 0)
                            ) {
                              return;
                            }
                            if (recentlyScrolled) {
                              return;
                            }
                            if (
                              String(lastTouch.vehicleId || '') === String(vehicle.id || '') &&
                              Date.now() - Number(lastTouch.selectedAt || 0) < 700
                            ) {
                              return;
                            }
                            document.activeElement?.blur?.();
                            selectLightVehicle(vehicle, mappedLightPrice);
                          }}
                          onPointerUp={(event) => {
                            if (event.pointerType === 'mouse') return;
                            const gesture = lightVehiclePointerRef.current;
                            lightVehiclePointerRef.current = { vehicleId: null, startX: 0, startY: 0, startScrollLeft: 0, startedAt: 0, moved: false };
                            const deltaX = Math.abs(event.clientX - Number(gesture.startX || 0));
                            const deltaY = Math.abs(event.clientY - Number(gesture.startY || 0));
                            const deltaScroll = Math.abs((lightVehicleScrollerRef.current?.scrollLeft || 0) - Number(gesture.startScrollLeft || 0));
                            const recentlyScrolled = Date.now() - Number(lightVehicleScrollerStateRef.current.lastScrolledAt || 0) < 160;
                            const wasSwipe = Boolean(gesture.moved)
                              || deltaX > 10
                              || deltaY > 10
                              || deltaScroll > 2
                              || recentlyScrolled
                              || Date.now() - Number(gesture.startedAt || 0) > 900;
                            if (String(gesture.vehicleId || '') !== String(vehicle.id || '') || wasSwipe) {
                              suppressNextLightVehicleClickRef.current = {
                                vehicleId: vehicle.id || '',
                                until: Date.now() + 650,
                              };
                              return;
                            }
                            document.activeElement?.blur?.();
                            lastLightVehicleTouchSelectRef.current = {
                              vehicleId: vehicle.id || '',
                              selectedAt: Date.now(),
                            };
                            event.preventDefault();
                            event.stopPropagation();
                            selectLightVehicle(vehicle, mappedLightPrice);
                          }}
                          disabled={successfullySubmitted}
                          className={`min-w-[250px] snap-center touch-manipulation rounded-[22px] border p-4 text-left transition-all active:scale-[0.99] ${
                            isSelected
                              ? `scale-[1.02] border-violet-500 bg-violet-50/92 shadow-[0_22px_48px_rgba(79,70,229,0.22)] backdrop-blur-[3px] ${isConfirmingSelection ? 'ring-4 ring-violet-200' : ''}`
                              : 'border-slate-200 bg-white hover:-translate-y-0.5 hover:border-violet-300 hover:shadow-sm'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                                {vehicle.model || vehicle.vehicle_model_name || vehicle.name || tr('Vehicle', 'Véhicule')}
                              </p>
                              <p className="mt-1 text-2xl font-bold text-slate-900">
                                {vehicle.plate_number || tr('N/A', 'N/D')}
                              </p>
                            </div>
                            <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ${isSelected ? 'bg-violet-100 text-violet-700' : isAvailable ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                              {isSelected && <CheckCircle className="h-3 w-3" />}
                              {isSelected ? tr('Selected', 'Sélectionné') : isAvailable ? tr('Available', 'Disponible') : tr('Busy', 'Occupé')}
                            </span>
                          </div>
                          <div className="mt-4 text-2xl font-bold text-slate-900">
                            {mappedLightPrice !== undefined ? (
                              `${formatDynamicMad(mappedLightPrice)} MAD`
                            ) : (
                              <LightVehiclePriceLabel
                                vehicle={vehicle}
                                rentalType={formData.rental_type}
                                duration={currentLightDurationUnits || 1}
                              />
                            )}
                          </div>
                          <p className="mt-1 text-xs font-medium text-slate-500">{selectedDurationLabel}</p>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
              </div>
            )}
          </div>
        )}

        {formData.vehicle_id && (
        <div
          ref={lightPackageStepRef}
          className={`scroll-mt-3 rounded-[22px] border bg-white/95 backdrop-blur transition-all duration-300 ease-out ${
            lightExpandedSection === 'package'
              ? 'border-violet-300 ring-1 ring-violet-200 shadow-[0_18px_40px_rgba(76,29,149,0.14)]'
              : 'border-slate-200 shadow-sm'
          } ${
            lightFlowTransition === 'opening_package' ? 'translate-y-1 ring-4 ring-violet-100' : 'translate-y-0'
          }`}
        >
          <button
            type="button"
            onClick={() => setLightExpandedSection((prev) => (prev === 'package' ? null : 'package'))}
            className="flex w-full items-center justify-between gap-3 px-4 py-4 text-left"
          >
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-purple-500">
                {tr('Package', 'Forfait')}
              </p>
              <div className="mt-1 flex items-center justify-between gap-3">
                <div className="min-w-0 flex flex-wrap items-center gap-3">
                  <span className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl shadow-sm transition-colors ${
                    lightExpandedSection === 'package'
                      ? 'bg-violet-50 text-violet-600'
                      : 'bg-purple-50 text-purple-600'
                  }`}>
                    <DollarSign className="h-5 w-5" />
                  </span>
                  {displayPackageSummaryAccent && (
                    <span className="inline-flex shrink-0 items-center rounded-full bg-violet-100 px-3 py-1.5 text-[13px] font-extrabold uppercase tracking-[0.1em] text-violet-700 shadow-sm">
                      {displayPackageSummaryAccent}
                    </span>
                  )}
                  <h3 className="min-w-0 truncate text-lg font-bold text-slate-900">
                    {displayPackageSummaryAccent ? displayPackageSummaryRestLabel : displayPackageSummaryLabel}
                  </h3>
                </div>
                <span className="inline-flex items-center gap-2">
                  <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold ${
                    hasPackageDecision
                      ? 'bg-emerald-50 text-emerald-700'
                      : 'bg-purple-50 text-purple-700'
                  }`}>
                    {tr('Change', 'Modifier')}
                    {hasPackageDecision && <CheckCircle className="h-3.5 w-3.5" />}
                  </span>
                  {hasPackageDecision && (
                    <span className={`inline-flex h-7 w-7 items-center justify-center rounded-full transition-colors ${
                      lightExpandedSection === 'package'
                        ? 'bg-violet-100 text-violet-700'
                        : 'bg-slate-100 text-slate-500'
                    }`}>
                      {lightExpandedSection === 'package' ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                    </span>
                  )}
                </span>
              </div>
            </div>
            {!hasPackageDecision && (
              <div className={`rounded-full p-2 transition-colors ${
                lightExpandedSection === 'package'
                  ? 'bg-violet-100 text-violet-700'
                  : 'bg-slate-100 text-slate-500'
              }`}>
                <ChevronDown className="h-4 w-4" />
              </div>
            )}
          </button>

            {lightExpandedSection === 'package' && (
              <div className="space-y-4 rounded-b-[22px] border-t border-slate-100 bg-white/70 px-4 pb-6 pt-3 backdrop-blur-[2px]">
                {isLoadingPackages ? (
                  <div className="rounded-2xl border border-purple-100 bg-purple-50 px-4 py-4 text-sm font-medium text-purple-700">
                    {tr('Loading packages...', 'Chargement des forfaits...')}
                  </div>
                ) : (
                  <div className="-mx-4 overflow-x-auto overflow-y-hidden px-4 pb-8 pt-3 [-webkit-overflow-scrolling:touch]">
                    <div className="flex snap-x snap-mandatory items-stretch gap-3 pr-4">
                      {currentLightDurationUnits !== 0.5 && (
                        <button
                          type="button"
                          onClick={chooseStandardPricing}
                          className={`min-w-[220px] shrink-0 snap-center rounded-[22px] border p-4 text-left transition-all ${
                            !formData.use_package_pricing && lightPackageDecisionMode === 'standard'
                              ? 'scale-[1.02] border-violet-500 bg-violet-50/92 shadow-[0_22px_48px_rgba(79,70,229,0.22)] backdrop-blur-[3px]'
                              : 'border-slate-200 bg-white hover:border-violet-300 hover:shadow-sm'
                          }`}
                        >
                          <p className="text-lg font-bold text-slate-900">{standardFallbackLabel}</p>
                          <p className="mt-2 text-sm text-slate-500">{selectedDurationLabel}</p>
                          <p className="mt-3 text-2xl font-bold text-slate-900">
                            {formatDynamicMad(standardFallbackPreviewTotal)} MAD
                          </p>
                        </button>
                      )}

                      {filteredPackageOptions.map((pkg) => {
                        const isSelected = String(formData.selected_package_id || '') === String(pkg.id || '');
                        const packageDurationUnits = getPackageDurationUnits(pkg) || 1;
                        const pkgDurationLabel = (() => {
                          if (formData.rental_type === 'daily' && currentLightDurationUnits > 1) {
                            return getLightDurationButtonLabel(currentLightDurationUnits, 'daily');
                          }
                          if (formData.rental_type === 'hourly' && packageDurationUnits === 1 && currentLightDurationUnits > 1) {
                            return getLightDurationButtonLabel(currentLightDurationUnits, 'hourly');
                          }
                          if (packageDurationUnits === 0.5) return tr('30 min', '30 min');
                          return `${packageDurationUnits} ${formData.rental_type === 'hourly' ? tr('Hour', 'heure') : tr('day', 'jour')}`;
                        })();
                        const pkgIncludedKm = Number(pkg.included_kilometers ?? pkg.included_km ?? pkg.km_limit ?? 0) || 0;
                        const pkgRate = Number(pkg.fixed_amount ?? pkg.package_rate ?? pkg.rate ?? pkg.price ?? 0) || 0;
                        const pkgPreviewTotal = currentLightDurationUnits > 0
                          ? getLightPackagePreviewTotal(pkg)
                          : pkgRate;
                        return (
                          <button
                            key={pkg.id}
                            type="button"
                            onClick={() => applyLightPackageSelection(pkg)}
                            className={`min-w-[220px] shrink-0 snap-center rounded-[22px] border p-4 text-left transition-all ${
                              isSelected
                                ? 'scale-[1.02] border-violet-500 bg-violet-50/92 shadow-[0_22px_48px_rgba(79,70,229,0.22)] backdrop-blur-[3px]'
                                : 'border-slate-200 bg-white hover:border-violet-300 hover:shadow-sm'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <span className="inline-flex rounded-full bg-violet-50 px-4 py-1.5 text-base font-black uppercase tracking-[0.06em] text-violet-700 shadow-sm">
                                {pkgIncludedKm} km
                              </span>
                            </div>
                            <p className="mt-4 text-[15px] font-semibold text-slate-500">{pkgDurationLabel}</p>
                            <p className="mt-3 text-2xl font-bold text-slate-900">{formatDynamicMad(pkgPreviewTotal)} MAD</p>
                            {currentLightDurationUnits > 1 && (
                              <p className="mt-1 text-xs font-medium text-slate-500">
                                {formData.rental_type === 'daily'
                                  ? tr('Daily base rate', 'Tarif journalier')
                                  : tr('Base rate', 'Tarif de base')}: {formatDynamicMad(pkgRate)} MAD
                              </p>
                            )}
                            {isSelected && (
                              <div className="mt-3 rounded-xl border border-violet-200 bg-white/80 px-3 py-2 text-xs text-slate-600">
                                <p>{tr('Extra km', 'Km extra')}: {formatDynamicMad(Number(pkg.extra_km_rate || 0))} MAD/km</p>
                                {Boolean(pkg.fuel_charge_enabled) ? (
                                  <p className="mt-1">{tr('Fuel charged separately', 'Carburant facturé séparément')}</p>
                                ) : null}
                              </div>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="fixed bottom-[calc(1rem+env(safe-area-inset-bottom,0px))] left-4 right-4 z-40 w-auto max-w-none rounded-[26px] border border-violet-200 bg-white/95 p-3 shadow-[0_18px_44px_rgba(76,29,149,0.14)] backdrop-blur sm:z-30 sm:sticky sm:bottom-0 sm:left-auto sm:right-auto sm:mt-6 sm:w-full sm:max-w-full sm:pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))]">
        <div className="mb-3 flex items-center justify-between gap-3">
          {displayStickySummaryLabel ? (
            <div className="min-w-0 flex-1 rounded-2xl bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-800">
              <p className="truncate">{displayStickySummaryLabel}</p>
            </div>
          ) : (
            <div />
          )}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowLightActionsMenu((prev) => !prev)}
              className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700"
            >
              <MoreHorizontal className="h-4 w-4" />
              {tr('More', 'Plus')}
            </button>
            {showLightActionsMenu && (
              <div className="absolute right-0 top-full mt-2 w-44 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_18px_36px_rgba(15,23,42,0.14)]">
                <button
                  type="button"
                  onClick={handleLightStartOver}
                  className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-semibold text-amber-700 hover:bg-amber-50"
                >
                  <span>{tr('Start over', 'Recommencer')}</span>
                  <RotateCcw className="h-4 w-4" />
                </button>
                {onCancel && (
                  <button
                    type="button"
                    onClick={handleLightClose}
                    className="flex w-full items-center justify-between border-t border-slate-100 px-4 py-3 text-left text-sm font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    <span>{tr('Close wizard', 'Fermer')}</span>
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {!effectiveLightRentalType ? (
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={handleLightStepBack}
              className="flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-4 text-base font-bold text-slate-800"
            >
              <ChevronLeft className="h-5 w-5" />
              {tr('Back', 'Retour')}
            </button>
            <button
              type="button"
              onClick={() => handleLightRentalTypeSelect('hourly')}
              className="flex items-center justify-center gap-2 rounded-2xl bg-violet-600 px-4 py-4 text-base font-bold text-white"
            >
              {tr('Hourly', 'Horaire')}
            </button>
            <button
              type="button"
              onClick={() => handleLightRentalTypeSelect('daily')}
              className="flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-4 text-base font-bold text-slate-800"
            >
              {tr('Daily', 'Journalier')}
            </button>
          </div>
        ) : !formData.vehicle_id ? (
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={handleLightStepBack}
              className="flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-4 text-base font-bold text-slate-800"
            >
              <ChevronLeft className="h-5 w-5" />
              {tr('Back', 'Retour')}
            </button>
            <button
              type="button"
              onClick={() => {
                animateLightSectionTransition('vehicle', vehicleStepRef);
              }}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-violet-600 px-4 py-4 text-base font-bold text-white"
            >
              {tr('Select vehicle', 'Choisir le véhicule')}
              <ChevronDown className="h-5 w-5" />
            </button>
          </div>
        ) : !hasPackageDecision ? (
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={handleLightStepBack}
              className="flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-4 text-base font-bold text-slate-800"
            >
              <ChevronLeft className="h-5 w-5" />
              {tr('Back', 'Retour')}
            </button>
            <button
              type="button"
              onClick={() => {
                animateLightSectionTransition('package', lightPackageStepRef);
              }}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-violet-600 px-4 py-4 text-base font-bold text-white"
            >
              {tr('Choose package', 'Choisir le forfait')}
              <ChevronDown className="h-5 w-5" />
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={handleLightBack}
              className="flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-4 text-base font-bold text-slate-800"
            >
              <ChevronLeft className="h-5 w-5" />
              {tr('Back', 'Retour')}
            </button>
            <button
              type="button"
              onClick={handleNext}
              className="flex items-center justify-center gap-2 rounded-2xl bg-violet-600 px-4 py-4 text-base font-bold text-white"
            >
              {tr('Confirm', 'Confirmer')}
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>
        )}
      </div>
    </div>
  );

  const renderLightStepOne = () => (
    <div className="overflow-x-hidden px-4 pb-44 pt-4 sm:px-6 sm:pb-8">
      <div className="space-y-4">
        {!lightCustomerReady && !lightCustomerEditOpen ? (
          <div className="flex min-h-[calc(100vh-17rem)] flex-col supports-[height:100dvh]:min-h-[calc(100dvh-17rem)]">
            <div className="rounded-[22px] border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
              <div className="mb-2 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-500">
                    {tr('Customer', 'Client')}
                  </p>
                  <h3 className="mt-1 text-xl font-bold leading-tight text-slate-900">
                    {tr('Start with ID or manual entry', "Commencez par l'identité ou la saisie manuelle")}
                  </h3>
                </div>
              </div>
              <div className="rounded-[22px] border border-dashed border-violet-200 bg-violet-50/70 px-4 py-6 text-center">
                <p className="text-sm font-semibold text-slate-700">
                  {tr('Choose how you want to add the customer.', 'Choisissez comment ajouter le client.')}
                </p>
              </div>
            </div>
            <div className="fixed bottom-[calc(1rem+env(safe-area-inset-bottom,0px))] left-4 right-4 z-40 w-auto max-w-none rounded-[22px] border border-violet-100 bg-violet-50/95 p-3 shadow-[0_18px_44px_rgba(76,29,149,0.14)] backdrop-blur sm:z-30 sm:static sm:mt-4 sm:w-full sm:max-w-full sm:bg-violet-50/45 sm:shadow-none sm:backdrop-blur-0">
              <div className="space-y-2 sm:space-y-0 sm:flex sm:items-stretch sm:justify-end sm:gap-2">
                <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-1 sm:justify-end">
                  <button
                    type="button"
                    onClick={() => setShowIDScanModal(true)}
                    className="flex min-h-[68px] items-center justify-center gap-3 rounded-2xl bg-violet-700 px-4 py-4 text-base font-bold text-white shadow-[0_16px_36px_rgba(109,40,217,0.28)] sm:min-w-[220px]"
                    disabled={loading || submitting || successfullySubmitted}
                  >
                    <FileImage className="h-5 w-5" />
                    {tr('Scan ID', "Scanner l'identité")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setLightCustomerEditOpen(true)}
                    className="flex min-h-[68px] items-center justify-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-4 text-base font-bold text-slate-800 sm:min-w-[220px]"
                    disabled={successfullySubmitted}
                  >
                    <Edit2 className="h-5 w-5" />
                    {tr('Manual entry', 'Saisie manuelle')}
                  </button>
                </div>
                {onCancel && (
                  <button
                    type="button"
                    onClick={handleLightClose}
                    className="flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-4 text-base font-bold text-slate-700 sm:w-auto sm:min-w-[180px]"
                    disabled={loading || submitting || successfullySubmitted}
                  >
                    <ChevronLeft className="h-5 w-5" />
                    {tr('Back', 'Retour')}
                  </button>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="overflow-visible rounded-[22px] border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-500">
                    {tr('Primary info', 'Infos principales')}
                  </p>
                  <h3 className="mt-1 text-lg font-bold text-slate-900">{tr('Customer', 'Client')}</h3>
                </div>
                <div className="hidden flex-wrap items-center gap-2 sm:flex sm:justify-end">
                  {!lightCustomerReady && onCancel && (
                    <button
                      type="button"
                      onClick={() => {
                        setLightCustomerEditOpen(false);
                        setLightCustomerAdditionalOpen(false);
                      }}
                      className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700"
                    >
                      <ChevronLeft className="h-4 w-4" />
                      {tr('Back', 'Retour')}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setShowIDScanModal(true)}
                    className="inline-flex items-center gap-2 rounded-full bg-violet-50 px-3 py-2 text-xs font-semibold text-violet-700"
                  >
                    <FileImage className="h-4 w-4" />
                    {formData.customer_id_image ? tr('Rescan ID', "Rescanner l'identité") : tr('Scan ID', "Scanner l'identité")}
                  </button>
                  {formData.customer_id_image && (
                    <button
                      type="button"
                      onClick={() => openSecondDriverScanModal('scan')}
                      className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700"
                    >
                      <FileImage className="h-4 w-4" />
                      {hasSavedSecondDriverId ? tr('Rescan second ID', "Scanner à nouveau la deuxième pièce") : tr('Scan second ID', "Scanner la deuxième pièce")}
                    </button>
                  )}
                </div>
              </div>

              {formData.customer_id_image && (
                <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
                  {(formData.customer_id_capture_method || customerIdCaptureMethod) === 'imported'
                    ? tr('ID imported', 'Pièce importée')
                    : (formData.customer_id_capture_method || customerIdCaptureMethod) === 'saved'
                      ? tr('ID saved', 'Pièce enregistrée')
                      : tr('ID scanned', 'Pièce scannée')}
                </div>
              )}

              {hasSavedSecondDriverId && (
                <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm font-semibold text-violet-700">
                  <span>
                    {secondDriverImageCount > 1
                      ? tr(`Second ID saved · ${secondDriverImageCount} photos`, `Deuxième pièce enregistrée · ${secondDriverImageCount} photos`)
                      : tr('Second ID saved · 1 photo', 'Deuxième pièce enregistrée · 1 photo')}
                  </span>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      clearSecondDriverIdMedia();
                    }}
                    className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-violet-200 bg-white text-violet-600 shadow-sm transition hover:border-red-200 hover:bg-red-50 hover:text-red-600"
                    aria-label={tr('Remove second ID photos', 'Supprimer les photos de la deuxième pièce')}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              )}

              <div className="mt-4 space-y-3">
                <div className="relative" ref={customerSearchRef}>
                  <label className="text-sm font-semibold text-slate-700">{tr('Customer Name', 'Nom du client')} *</label>
                  <input
                    ref={lightCustomerNameInputRef}
                    type="text"
                    value={formData.customer_name}
                    onChange={(e) => handleInputChange('customer_name', e.target.value)}
                    placeholder={tr('Enter customer name', 'Entrez le nom du client')}
                    disabled={successfullySubmitted}
                    className={`mt-2 w-full rounded-xl border bg-white px-4 py-4 text-base font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-violet-500 ${
                      errors.customer_name ? 'border-red-400' : 'border-slate-200'
                    }`}
                  />
                  {errors.customer_name && (
                    <p className="mt-2 text-xs font-medium text-red-500">{errors.customer_name}</p>
                  )}
                  {suggestions.length > 0 && !successfullySubmitted && (
                    <div className="absolute z-20 mt-2 max-h-60 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg">
                      {suggestions.map((suggestion, index) => (
                        <button
                          key={index}
                          type="button"
                          onClick={() => handleSuggestionClick(suggestion)}
                          className="flex w-full items-center gap-3 border-b border-slate-100 px-4 py-3 text-left hover:bg-violet-50 last:border-b-0"
                        >
                          <UserSearch className="h-4 w-4 flex-shrink-0 text-slate-500" />
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-semibold text-slate-800">{suggestion.name}</p>
                            <p className="truncate text-sm text-slate-500">{suggestion.phone}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div>
                  <label className="text-sm font-semibold text-slate-700">{tr('License Number', 'Numéro de permis')} {requiresCustomerVerification ? '*' : ''}</label>
                  <input
                    type="text"
                    value={formData.customer_licence_number}
                    onChange={(e) => handleInputChange('customer_licence_number', e.target.value)}
                    placeholder={tr('Enter license number', 'Entrez le numéro du permis')}
                    disabled={successfullySubmitted}
                    className={`mt-2 w-full rounded-xl border bg-white px-4 py-4 text-base font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-violet-500 ${
                      errors.customer_licence_number ? 'border-red-400' : 'border-slate-200'
                    }`}
                  />
                </div>
                <div>
                  <PhoneInputWithCountryCode
                    value={formData.customer_phone}
                    onChange={handlePhoneChange}
                    error={errors.customer_phone}
                    disabled={successfullySubmitted}
                    countryCode={countryCode}
                    onCountryCodeChange={setCountryCode}
                    mobileOptimized={true}
                  />
                </div>
              </div>
            </div>

            <div className="overflow-visible rounded-[22px] border border-slate-200 bg-white shadow-sm">
              <button
                type="button"
                onClick={() => setLightCustomerAdditionalOpen((prev) => !prev)}
                className="flex w-full items-center justify-between gap-3 px-4 py-4 text-left"
              >
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                    {tr('Additional details', 'Détails supplémentaires')}
                  </p>
                  <h3 className="mt-1 text-lg font-bold text-slate-900">{tr('Optional fields', 'Champs optionnels')}</h3>
                </div>
                <div className="rounded-full bg-slate-100 p-2 text-slate-500">
                  {lightCustomerAdditionalOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </div>
              </button>

              {lightCustomerAdditionalOpen && (
                <div className="space-y-3 border-t border-slate-100 px-4 pb-4 pt-3">
                  <div>
                    <label className="text-sm font-semibold text-slate-700">{tr('Email', 'E-mail')}</label>
                    <input
                      type="email"
                      value={formData.customer_email}
                      onChange={(e) => handleInputChange('customer_email', e.target.value)}
                      placeholder="customer@example.com"
                      disabled={successfullySubmitted}
                      className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-4 text-base font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-violet-500"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-semibold text-slate-700">{tr('Secondary Phone', 'Téléphone secondaire')}</label>
                    <input
                      type="tel"
                      value={formData.secondary_phone || ''}
                      onChange={(e) => handleInputChange('secondary_phone', e.target.value)}
                      placeholder={tr('Optional alternate phone number', 'Numéro secondaire optionnel')}
                      disabled={successfullySubmitted}
                      className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-4 text-base font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-violet-500"
                    />
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className="text-sm font-semibold text-slate-700">{tr('Second Driver Name', 'Nom du second conducteur')}</label>
                      <input
                        type="text"
                        value={formData.second_driver_name || ''}
                        onChange={(event) => handleInputChange('second_driver_name', event.target.value)}
                        className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-4 text-base font-semibold text-slate-900"
                        placeholder={tr('Optional', 'Optionnel')}
                        disabled={successfullySubmitted}
                      />
                    </div>
                    <div>
                      <label className="text-sm font-semibold text-slate-700">{tr('Second Driver License', 'Permis du second conducteur')}</label>
                      <input
                        type="text"
                        value={formData.second_driver_license || ''}
                        onChange={(event) => handleInputChange('second_driver_license', event.target.value)}
                        className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-4 text-base font-semibold text-slate-900"
                        placeholder={tr('Optional', 'Optionnel')}
                        disabled={successfullySubmitted}
                      />
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedRentalForDrawer({
                        id: 'preview-rental-id',
                        customer_id: formData.customer_id,
                        customer_name: formData.customer_name,
                        customer_email: formData.customer_email,
                        customer_phone: formData.customer_phone,
                        customer_licence_number: formData.customer_licence_number,
                        customer_id_image: formData.customer_id_image
                      });
                      setShowCustomerDrawer(true);
                    }}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-4 text-sm font-bold text-slate-700"
                  >
                    <Eye className="h-4 w-4" />
                    {tr('View details', 'Voir les détails')}
                  </button>
                </div>
              )}
            </div>

            <div className="fixed bottom-[calc(1rem+env(safe-area-inset-bottom,0px))] left-4 right-4 z-40 w-auto max-w-none rounded-[26px] border border-violet-200 bg-white/95 p-3 shadow-[0_18px_44px_rgba(76,29,149,0.14)] backdrop-blur sm:z-30 sm:sticky sm:bottom-0 sm:left-auto sm:right-auto sm:mt-6 sm:w-full sm:max-w-full sm:pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))]">
              <div className={`grid gap-2 sm:mx-auto sm:w-full sm:px-1 ${onCancel ? 'grid-cols-3 sm:max-w-[820px] sm:grid-cols-[minmax(0,0.95fr)_minmax(0,1.1fr)_minmax(0,1.35fr)]' : 'grid-cols-2 sm:max-w-[640px] sm:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]'}`}>
                {onCancel && (
                  <button
                    type="button"
                    onClick={handleLightClose}
                    className="flex min-w-0 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-4 text-center text-sm font-bold text-slate-700 sm:px-4 sm:text-base"
                    disabled={loading || submitting || successfullySubmitted}
                  >
                    <ChevronLeft className="h-5 w-5" />
                    {tr('Back', 'Retour')}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => (formData.customer_id_image ? openSecondDriverScanModal('scan') : setShowIDScanModal(true))}
                  className="flex min-w-0 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-4 text-center text-sm font-bold text-slate-800 sm:px-4 sm:text-base"
                >
                  <FileImage className="hidden h-5 w-5 sm:block" />
                  <span className="sm:hidden">
                    {formData.customer_id_image
                      ? (hasSavedSecondDriverId ? tr('Re-scan 2nd', 'Re-scan 2e') : tr('2nd ID', '2e pièce'))
                      : tr('Scan ID', 'Scanner')}
                  </span>
                  <span className="hidden sm:inline">
                    {formData.customer_id_image
                      ? (hasSavedSecondDriverId ? tr('Rescan second ID', "Scanner à nouveau la deuxième pièce") : tr('Scan second ID', "Scanner la deuxième pièce"))
                      : tr('Scan ID', "Scanner l'identité")}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={handleNext}
                  disabled={!lightCustomerCanContinue}
                  className="flex min-w-0 items-center justify-center gap-2 rounded-2xl bg-violet-700 px-3 py-4 text-center text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50 sm:px-4 sm:text-base"
                >
                  {tr('Continue', 'Continuer')}
                  <ChevronRight className="h-5 w-5" />
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );

  const renderStrictVerificationCaptureStep = () => (
    <div className="p-4 sm:p-6">
      <div className="rounded-[22px] border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-500">
              {tr('Customer Verification', 'Vérification client')}
            </p>
            <h2 className="mt-1 text-xl font-bold text-slate-900">
              {tr('Capture customer ID', "Capturer l'identité du client")}
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              {tr(
                'Only scan or import the customer ID to unlock the rental start checklist.',
                "Scannez ou importez uniquement l'identité du client pour déverrouiller la checklist de démarrage."
              )}
            </p>
          </div>
          {!successfullySubmitted && (
            <button
              type="button"
              onClick={() => setShowIDScanModal(true)}
              className={`inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-bold sm:min-w-[220px] ${customerPrimaryButtonClass} ${!formData.customer_id_image ? 'animate-[pulse_0.9s_ease-in-out_infinite] shadow-[0_0_0_4px_rgba(124,58,237,0.12)]' : ''}`}
              disabled={loading || submitting || successfullySubmitted}
            >
              <FileImage className="h-4 w-4" />
              {formData.customer_id_image ? tr('Rescan ID', "Scanner à nouveau l'identité") : tr('Scan or import ID', "Scanner ou importer l'identité")}
            </button>
          )}
        </div>

        <div className="mt-4 space-y-3">
          {formData.customer_id_image ? (
            <div className="flex items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
              <span className="min-w-0 truncate">
                {tr(
                  `ID captured: ${customerIdFileName || 'Saved image'}`,
                  `Pièce capturée : ${customerIdFileName || 'Image enregistrée'}`
                )}
              </span>
              <button
                type="button"
                onClick={() => {
                  setFormData((prev) => ({
                    ...prev,
                    customer_id_image: null,
                  }));
                  setCustomerIdFileName('');
                  setCustomerScanNote('');
                  setCustomerScanNoteTone('neutral');
                }}
                className="inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-white text-emerald-700 transition hover:bg-emerald-100"
                aria-label={tr('Remove captured ID image', "Supprimer l'image d'identité capturée")}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
              {tr(
                'Step 1 stays incomplete until the customer ID is scanned or imported.',
                "L'étape 1 reste incomplète tant que l'identité du client n'est pas scannée ou importée."
              )}
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                {tr('Customer', 'Client')}
              </p>
              <p className="mt-2 text-sm font-bold text-slate-900">
                {formData.customer_name || initialData?.customer_name || tr('Not set', 'Non défini')}
              </p>
            </div>
            <div className={`rounded-xl border px-4 py-3 ${formData.customer_licence_number?.trim() ? 'border-slate-200 bg-slate-50' : 'border-amber-200 bg-amber-50'}`}>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                {tr('License Number', 'Numéro de permis')}
              </p>
              <p className={`mt-2 text-sm font-bold ${formData.customer_licence_number?.trim() ? 'text-slate-900' : 'text-amber-800'}`}>
                {formData.customer_licence_number || tr('Missing', 'Manquant')}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                {tr('Phone', 'Téléphone')}
              </p>
              <p className="mt-2 text-sm font-bold text-slate-900">
                {formData.customer_phone || initialData?.customer_phone || tr('Not set', 'Non défini')}
              </p>
            </div>
          </div>

          {!formData.customer_licence_number?.trim() && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
              {tr(
                'A license number is still required before verification can be saved.',
                "Un numéro de permis est encore requis avant d'enregistrer la vérification."
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  const renderLightStrictVerificationCaptureStep = () => (
    <div className="overflow-x-hidden px-4 pb-44 pt-4 sm:px-6 sm:pb-8">
      <div className="space-y-4">
        <div className="rounded-[22px] border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-500">
                {tr('Customer Verification', 'Vérification client')}
              </p>
              <h2 className="mt-1 text-2xl font-bold text-slate-900">
                {tr('Capture customer ID', "Capturer l'identité du client")}
              </h2>
              <p className="mt-2 text-sm font-medium text-slate-600">
                {tr(
                  'Scan or import the ID only to complete step 1.',
                  "Scannez ou importez uniquement l'identité pour terminer l'étape 1."
                )}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowIDScanModal(true)}
              className={`inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-bold sm:min-w-[220px] ${customerPrimaryButtonClass} ${!formData.customer_id_image ? 'animate-[pulse_0.9s_ease-in-out_infinite] shadow-[0_0_0_4px_rgba(124,58,237,0.12)]' : ''}`}
              disabled={loading || submitting || successfullySubmitted}
            >
              <FileImage className="h-4 w-4" />
              {formData.customer_id_image ? tr('Rescan ID', "Scanner à nouveau l'identité") : tr('Scan ID', "Scanner l'identité")}
            </button>
          </div>

          <div className="mt-4 space-y-3">
            {formData.customer_id_image ? (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm font-semibold text-emerald-800">
                <div className="flex items-center justify-between gap-3">
                  <span className="min-w-0 truncate">
                    {tr(
                      `ID captured: ${customerIdFileName || 'Saved image'}`,
                      `Pièce capturée : ${customerIdFileName || 'Image enregistrée'}`
                    )}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setFormData((prev) => ({
                        ...prev,
                        customer_id_image: null,
                      }));
                      setCustomerIdFileName('');
                      setCustomerScanNote('');
                      setCustomerScanNoteTone('neutral');
                    }}
                    className="inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-white text-emerald-700 transition hover:bg-emerald-100"
                    aria-label={tr('Remove captured ID image', "Supprimer l'image d'identité capturée")}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm font-medium text-amber-800">
                {tr(
                  'Customer verification stays incomplete until the ID is scanned or imported.',
                  "La vérification client reste incomplète tant que l'identité n'est pas scannée ou importée."
                )}
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                  {tr('Customer', 'Client')}
                </p>
                <p className="mt-2 text-sm font-bold text-slate-900">
                  {formData.customer_name || initialData?.customer_name || tr('Not set', 'Non défini')}
                </p>
              </div>
              <div className={`rounded-2xl border px-4 py-4 ${formData.customer_licence_number?.trim() ? 'border-slate-200 bg-slate-50' : 'border-amber-200 bg-amber-50'}`}>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                  {tr('License Number', 'Numéro de permis')}
                </p>
                <p className={`mt-2 text-sm font-bold ${formData.customer_licence_number?.trim() ? 'text-slate-900' : 'text-amber-800'}`}>
                  {formData.customer_licence_number || tr('Missing', 'Manquant')}
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                  {tr('Phone', 'Téléphone')}
                </p>
                <p className="mt-2 text-sm font-bold text-slate-900">
                  {formData.customer_phone || initialData?.customer_phone || tr('Not set', 'Non défini')}
                </p>
              </div>
            </div>

            {formData.customer_id_image && (
              <button
                type="button"
                onClick={() => openSecondDriverScanModal('scan')}
                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700"
                disabled={loading || submitting || successfullySubmitted}
              >
                <FileImage className="h-4 w-4" />
                {hasSavedSecondDriverId ? tr('Rescan second ID', "Scanner à nouveau la deuxième pièce") : tr('Scan second ID', "Scanner la deuxième pièce")}
              </button>
            )}
          </div>
        </div>

        <div className="fixed bottom-[calc(1rem+env(safe-area-inset-bottom,0px))] left-4 right-4 z-40 w-auto max-w-none rounded-[26px] border border-violet-200 bg-white/95 p-3 shadow-[0_18px_44px_rgba(76,29,149,0.14)] backdrop-blur sm:z-30 sm:sticky sm:bottom-0 sm:left-auto sm:right-auto sm:mt-6 sm:w-full sm:max-w-full sm:pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))]">
          <div className="grid grid-cols-2 gap-2 sm:mx-auto sm:w-full sm:max-w-[640px] sm:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] sm:px-1">
            <button
              type="button"
              onClick={() => (formData.customer_id_image ? openSecondDriverScanModal('scan') : setShowIDScanModal(true))}
              className={`flex items-center justify-center gap-2 rounded-2xl border px-4 py-4 text-base font-bold sm:min-w-[220px] sm:flex-none ${
                !formData.customer_id_image
                  ? 'border-violet-200 bg-violet-50 text-violet-700 animate-[pulse_0.9s_ease-in-out_infinite] shadow-[0_0_0_4px_rgba(124,58,237,0.12)]'
                  : 'border-slate-200 bg-white text-slate-800'
              }`}
              disabled={loading || submitting || successfullySubmitted}
            >
              <FileImage className="hidden h-5 w-5 sm:block" />
              {formData.customer_id_image
                ? (hasSavedSecondDriverId ? tr('Re-scan 2nd', 'Re-scan 2e') : tr('2nd ID', '2e pièce'))
                : tr('Scan ID', "Scanner l'identité")}
            </button>
            <button
              type="button"
              onClick={handleNext}
              disabled={!lightCustomerCanContinue || submitting || isSubmitting || successfullySubmitted}
              className="flex items-center justify-center gap-2 rounded-2xl bg-violet-700 px-4 py-4 text-base font-bold text-white disabled:cursor-not-allowed disabled:opacity-50 sm:min-w-[300px] sm:flex-1"
            >
              {tr('Save verification', 'Enregistrer la vérification')}
              <CheckCircle className="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  const renderLightStepThree = () => (
    <div className="px-4 pb-44 pt-4 sm:px-6 sm:pb-36">
      <div className={`space-y-4 ${lightConfirmInProgress ? 'pointer-events-none' : ''}`}>
        <div className="rounded-[22px] border border-slate-200 bg-white shadow-sm">
          <button
            type="button"
            onClick={() => setLightPaymentSummaryOpen((prev) => !prev)}
            disabled={lightConfirmInProgress}
            className="flex w-full items-center justify-between gap-3 px-4 py-4 text-left"
          >
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-500">
                {tr('Current selection', 'Sélection actuelle')}
              </p>
              <p className="mt-1 truncate text-sm font-bold text-slate-900">{lightPaymentSummaryLabel}</p>
              <p className="mt-2 text-xl font-bold text-slate-900">
                {tr('Total', 'Total')}: {(Number(formData.total_amount) || getFixedPackageAmount(formData) || Number(formData.unit_price) || 0).toFixed(0)} MAD
              </p>
            </div>
            <div className="rounded-full bg-slate-100 p-2 text-slate-500">
              {lightPaymentSummaryOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </div>
          </button>

          {lightPaymentSummaryOpen && (
            <div className="space-y-2 border-t border-slate-100 px-4 pb-4 pt-3 text-sm font-medium text-slate-700">
              <div className="flex justify-between gap-3">
                <span>{tr('Customer', 'Client')}</span>
                <span className="text-right">{formData.customer_name || tr('Not set', 'Non défini')}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span>{tr('Vehicle', 'Véhicule')}</span>
                <span className="text-right">{selectedVehicleLabel}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span>{tr('Period', 'Période')}</span>
                <span className="text-right">{selectedDurationLabel}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span>{tr('Package', 'Forfait')}</span>
                <span className="text-right">
                  {[
                    getSelectedPackageDisplayLabel(formData, tr),
                    lightStepThreePackageKmLabel,
                  ].filter(Boolean).join(' • ')}
                </span>
              </div>
            </div>
          )}
        </div>

        <div className="rounded-[22px] border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-500">
            {tr('Payment method', 'Mode de paiement')}
          </p>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {[
              ['paid', tr('Paid', 'Payé')],
              ['partial', tr('Partial', 'Partiel')],
              ['unpaid', tr('Pending', 'En attente')],
            ].map(([status, label]) => (
              <button
                key={status}
                type="button"
                onClick={() => handlePaymentStatusTabClick(status)}
                disabled={lightConfirmInProgress}
                className={`rounded-2xl px-4 py-4 text-center text-sm font-bold transition-all ${
                  formData.payment_status === status
                    ? 'bg-violet-600 text-white'
                    : 'border border-slate-200 bg-white text-slate-800'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-[22px] border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-500">
            {tr('Amount', 'Montant')}
          </p>
          <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
            <input
              type="text"
              inputMode="decimal"
              value={formData.deposit_amount}
              onFocus={(e) => {
                if (String(formData.deposit_amount || '') === '0') {
                  e.target.select();
                }
              }}
              onChange={(e) => handleInputChange('deposit_amount', normalizeMoneyInput(e.target.value))}
              disabled={successfullySubmitted || lightConfirmInProgress}
              className="w-full bg-transparent text-3xl font-bold text-slate-900 outline-none"
              placeholder="0"
            />
            {formData.payment_status === 'partial' && (
              <p className="mt-2 text-sm font-semibold text-amber-700">
                {tr('Remaining', 'Restant')}: {Math.max((Number(formData.total_amount) || getFixedPackageAmount(formData) || 0) - Number(formData.deposit_amount || 0), 0).toFixed(0)} MAD
              </p>
            )}
          </div>
        </div>

        <div ref={lightDepositStepRef} className="rounded-[22px] border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-violet-500">
            {tr('Deposit', 'Caution')}
          </p>
          {!lightDepositReadyToConfirm && (
            <p className="mt-1 text-sm font-semibold text-amber-700">
              {tr('Choose a deposit option before confirming the rental.', 'Choisissez une caution avant de confirmer la location.')}
            </p>
          )}
          <div className="mt-3">
            <DamageDepositTabs
              formData={formData}
              enabledPresets={getEnabledPresetsForVehicle(formData.vehicle_id)}
              allowCustomDeposit={damageDepositConfig.allowCustomDeposit}
              includeNoneOption
              variant="light"
              selectedTab={lightSelectedDepositTab}
              customAmount={customDepositAmount}
              onTabClick={(tabId, amount) => {
                setLightDepositConfirmed(true);
                handleDepositTabClick(tabId, amount);
              }}
              onCustomAmountChange={setCustomDepositAmount}
              onDocumentUpload={async (file) => {
                setLightDepositConfirmed(true);
                await handleDepositDocumentUpload(file);
              }}
              onDocumentTypeSelect={(documentType) => {
                setLightDepositConfirmed(true);
                handleDepositDocumentTypeSelect(documentType);
              }}
              onDocumentClear={() => {
                handleDepositDocumentClear();
                if (!selectedDepositTab) {
                  setLightDepositConfirmed(false);
                }
              }}
              documentUploading={depositDocumentUploading}
              disabled={successfullySubmitted || lightConfirmInProgress}
            />
          </div>
        </div>

        <div className="rounded-[22px] border border-slate-200 bg-white shadow-sm">
          <button
            type="button"
            onClick={() => setLightPaymentDetailsOpen((prev) => !prev)}
            disabled={lightConfirmInProgress}
            className="flex w-full items-center justify-between gap-3 px-4 py-4 text-left"
          >
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                {tr('More details', 'Plus de détails')}
              </p>
            </div>
            <div className="rounded-full bg-slate-100 p-2 text-slate-500">
              {lightPaymentDetailsOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </div>
          </button>
          {lightPaymentDetailsOpen && (
            <div className="space-y-4 border-t border-slate-100 px-4 pb-4 pt-3">
              <FuelChargeToggle
                enabled={effectiveFuelChargeToggleEnabled}
                onToggle={handleFuelChargeToggleChange}
                amount={fuelChargeAmount}
                rentalType={formData.rental_type}
                disabled={successfullySubmitted || lightConfirmInProgress}
              />
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {tr('Accessories / Notes', 'Accessoires / notes')}
                </label>
                <textarea
                  value={formData.accessories}
                  onChange={(e) => handleInputChange('accessories', e.target.value)}
                  disabled={successfullySubmitted || lightConfirmInProgress}
                  className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-violet-500"
                  rows="3"
                  placeholder={tr('Any additional accessories or notes...', 'Tout accessoire ou note supplémentaire...')}
                />
              </div>
            </div>
          )}
        </div>

        <div className="fixed bottom-[calc(1rem+env(safe-area-inset-bottom,0px))] left-4 right-4 z-40 w-auto max-w-none rounded-[26px] border border-violet-200 bg-white/95 p-3 shadow-[0_18px_44px_rgba(76,29,149,0.14)] backdrop-blur sm:z-30 sm:sticky sm:bottom-0 sm:left-auto sm:right-auto sm:mt-6 sm:w-full sm:max-w-full">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={handleBack}
              disabled={lightConfirmInProgress}
              className={`flex min-h-[68px] items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-4 text-base font-bold text-slate-800 ${
                lightConfirmInProgress ? 'cursor-not-allowed opacity-45' : ''
              }`}
            >
              <ChevronLeft className="h-5 w-5" />
              {tr('Back', 'Retour')}
            </button>
            <button
              type={lightDepositReadyToConfirm ? 'submit' : 'button'}
              onClick={() => {
                if (!lightDepositReadyToConfirm) {
                  scrollLightSectionIntoView(lightDepositStepRef);
                  return;
                }
                explicitSubmitRef.current = true;
              }}
              className={`flex min-h-[68px] items-center justify-center gap-2 rounded-2xl px-4 py-4 text-base font-bold text-white shadow-[0_14px_30px_rgba(109,40,217,0.24)] transition-colors duration-150 ${
                lightConfirmInProgress
                  ? 'bg-violet-600'
                  : 'bg-violet-700 hover:bg-violet-800'
              }`}
              disabled={lightConfirmInProgress || successfullySubmitted}
            >
              {lightConfirmInProgress ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  {tr('Confirming...', 'Confirmation...')}
                </>
              ) : (
                <>
                  {lightDepositReadyToConfirm ? tr('Confirm', 'Confirmer') : tr('Choose deposit', 'Choisir la caution')}
                  {lightDepositReadyToConfirm ? <ChevronRight className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  if (successfullySubmitted) {
    return (
      <div className="max-w-4xl mx-auto p-4">
        <div className="flex flex-col items-center justify-center py-20">
          <Loader className="w-12 h-12 text-blue-600 animate-spin mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            {tr('✅ Rental Successfully Created!', '✅ Location créée avec succès !')}
          </h2>
          <p className="text-gray-600">{tr('Redirecting to rental details...', 'Redirection vers les détails de la location...')}</p>
          {successRedirectUrl && (
            <button
              type="button"
              onClick={() => window.location.assign(successRedirectUrl)}
              className="mt-6 rounded-2xl bg-violet-700 px-6 py-3 text-base font-bold text-white shadow-[0_14px_32px_rgba(76,29,149,0.22)] hover:bg-violet-800"
            >
              {tr('Open rental details', 'Ouvrir les détails de la location')}
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div ref={wizardTopRef} className="max-w-4xl mx-auto p-4">
      <div ref={isLightVariant ? lightProgressStepperRef : null} className={isLightVariant ? '[overflow-anchor:none]' : ''}>
        <ProgressStepper currentStep={isCustomerVerificationOnlyMode ? 1 : currentStep} steps={displayedSteps} />
      </div>

      {errors.general && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-red-500" />
            <div>
              <p className="text-red-800 font-medium">{tr('Error', 'Erreur')}</p>
              <p className="text-red-700 text-sm mt-1">{errors.general}</p>
            </div>
          </div>
        </div>
      )}

      {dateError && (
        <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-yellow-500" />
            <p className="text-yellow-800">{dateError}</p>
          </div>
        </div>
      )}

      <form onSubmit={handleFormSubmit} className="overflow-visible rounded-xl border border-gray-200 bg-white shadow-sm">
        {currentStep === 1 && (
          isStrictCustomerVerificationCaptureMode
            ? (isLightVariant ? renderLightStrictVerificationCaptureStep() : renderStrictVerificationCaptureStep())
            : isLightVariant ? renderLightStepOne() : (
          <div className="p-4 sm:p-6">
            {/* Simplified Header - Removed subtitle text */}
            <div className="flex flex-col gap-3 mb-4">
              <h2 className="text-lg font-bold text-gray-900">{tr('Customer Information', 'Informations client')}</h2>
              
              {/* Action buttons stacked vertically on mobile */}
              <div className="flex flex-col gap-2 w-full">
                {!successfullySubmitted && (
                  <button
                    type="button"
                    onClick={() => {
                      if (activeTab === 'additional') {
                        setSecondDriverScanEntryMode('scan');
                        setShowSecondDriverScanModal(true);
                        return;
                      }
                      setShowIDScanModal(true);
                    }}
                    className={`${customerPrimaryButtonClass} w-full ${requiresCustomerVerification && !formData.customer_id_image ? 'animate-[pulse_0.9s_ease-in-out_infinite] shadow-[0_0_0_4px_rgba(124,58,237,0.12)]' : ''}`}
                    disabled={loading || submitting || successfullySubmitted}
                  >
                    <FileImage className="w-4 h-4" />
                    <span>
                      {activeTab === 'additional'
                        ? (formData.second_driver_id_image ? tr('Rescan Second Driver ID', "Scanner à nouveau l'identité du second conducteur") : tr('Scan Second Driver ID', "Scanner l'identité du second conducteur"))
                        : (formData.customer_id_image ? tr('Rescan ID', "Scanner à nouveau l'identité") : tr('Scan ID', "Scanner l'identité"))}
                    </span>
                  </button>
                )}
                {activeTab !== 'additional' && formData.customer_id_image && (
                  <div className="flex items-center justify-between gap-3 rounded-lg bg-violet-50 px-4 py-3 text-sm font-semibold text-violet-700">
                    <p className="min-w-0 truncate">
                      {tr(
                        `ID captured: ${customerIdFileName || 'Saved image'}`,
                        `Pièce capturée : ${customerIdFileName || 'Image enregistrée'}`
                      )}
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setFormData((prev) => ({
                          ...prev,
                          customer_id_image: null,
                        }));
                        setCustomerIdFileName('');
                        setCustomerScanNote('');
                        setCustomerScanNoteTone('neutral');
                      }}
                      className="inline-flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-white text-violet-600 hover:bg-violet-100"
                      aria-label={tr('Remove captured ID image', "Supprimer l'image d'identité capturée")}
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                )}
                {activeTab !== 'additional' && customerScanNote && !requiresCustomerVerification && (
                  <div className={`rounded-lg px-4 py-3 text-sm font-medium ${
                    customerScanNoteTone === 'success'
                      ? 'border border-emerald-200 bg-emerald-50 text-emerald-800'
                      : customerScanNoteTone === 'info'
                        ? 'border border-blue-200 bg-blue-50 text-blue-800'
                        : 'border border-amber-200 bg-amber-50 text-amber-800'
                  }`}>
                    {customerScanNote}
                  </div>
                )}
                {activeTab !== 'additional' && requiresCustomerVerification && !formData.customer_id_image && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
                    {tr('Add a customer ID scan or import an image to finish verification.', "Ajoutez un scan de pièce d'identité ou importez une image pour terminer la vérification.")}
                  </div>
                )}

                {formData.customer_name && (
                  <button
                    type="button"
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      setSelectedRentalForDrawer({
                        id: 'preview-rental-id',
                        customer_id: formData.customer_id,
                        customer_name: formData.customer_name,
                        customer_email: formData.customer_email,
                        customer_phone: formData.customer_phone,
                        customer_licence_number: formData.customer_licence_number,
                        customer_id_number: formData.customer_id_number,
                        customer_dob: formData.customer_dob,
                        customer_place_of_birth: formData.customer_place_of_birth,
                        customer_nationality: formData.customer_nationality,
                        customer_issue_date: formData.customer_issue_date,
                        customer_id_image: formData.customer_id_image,
                        customer_id_scan_history: formData.customer_id_scan_history,
                      });
                      setShowCustomerDrawer(true);
                    }}
                    className={`${customerSecondaryButtonClass} w-full`}
                  >
                    <Eye className="w-4 h-4" />
                    <span>{tr('View Details', 'Voir les détails')} {secondDrivers.length > 0 && `(${secondDrivers.length})`}</span>
                  </button>
                )}
              </div>
            </div>

            {/* Mobile-friendly tabs with horizontal scroll - Moved below buttons */}
            <div className="mb-4 -mx-4 px-4 overflow-x-auto scrollbar-hide">
              <div className="flex gap-2 min-w-max pb-1">
                {customerTabs.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`${customerTabButtonClass} ${
                      activeTab === tab.id
                        ? 'border-violet-200 bg-violet-50 text-violet-700 shadow-sm'
                        : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Tab Content */}
            <div className="space-y-4">
              {customerTabs.find(tab => tab.id === activeTab)?.content}
            </div>

            {/* Additional Customer Details */}
            <CollapsibleSection title={tr('Additional Customer Details', 'Détails client supplémentaires')} defaultOpen={false}>
              <div className="grid grid-cols-1 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    {tr('ID Number', "Numéro d'identité")}
                  </label>
                  <input
                    type="text"
                    value={formData.customer_id_number}
                    onChange={(e) => handleInputChange('customer_id_number', e.target.value)}
                    disabled={successfullySubmitted}
                    className={`w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-base ${successfullySubmitted ? 'opacity-50 cursor-not-allowed' : ''}`}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    {tr('Date of Birth', 'Date de naissance')}
                  </label>
                  <input
                    type="date"
                    value={formData.customer_dob}
                    onChange={(e) => handleInputChange('customer_dob', e.target.value)}
                    disabled={successfullySubmitted}
                    className={`w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-base ${successfullySubmitted ? 'opacity-50 cursor-not-allowed' : ''}`}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    {tr('Place of Birth', 'Lieu de naissance')}
                  </label>
                  <input
                    type="text"
                    value={formData.customer_place_of_birth}
                    onChange={(e) => handleInputChange('customer_place_of_birth', e.target.value)}
                    disabled={successfullySubmitted}
                    className={`w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-base ${successfullySubmitted ? 'opacity-50 cursor-not-allowed' : ''}`}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    {tr('Nationality', 'Nationalité')}
                  </label>
                  <input
                    type="text"
                    value={formData.customer_nationality}
                    onChange={(e) => handleInputChange('customer_nationality', e.target.value)}
                    disabled={successfullySubmitted}
                    className={`w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-base ${successfullySubmitted ? 'opacity-50 cursor-not-allowed' : ''}`}
                  />
                </div>
              </div>
            </CollapsibleSection>
          </div>
          )
        )}

        {currentStep === 2 && (
          isLightVariant ? renderLightStepTwo() : (
          <div className="p-4 sm:p-6">
          <h2 className="text-xl font-bold text-gray-900">{tr('Vehicle & Rental Period', 'Véhicule et période de location')}</h2>
          <p className="mt-2 mb-6 text-sm text-gray-600">
            {tr(
              'Set the rental shape first, then choose the vehicle and package.',
              'Définissez d’abord la location, puis choisissez le véhicule et le forfait.'
            )}
          </p>
            
            <div className="space-y-6">
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="mb-4 flex items-center gap-2">
                  <span className="rounded-full bg-blue-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-blue-700">
                    {tr('Step 1', 'Étape 1')}
                  </span>
                  <span className="text-sm font-semibold text-slate-700">
                    {tr('Rental setup', 'Configuration')}
                  </span>
                </div>
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  {tr('Rental type', 'Type de location')}
                </label>
                <div className="flex gap-2">
                  {['hourly', 'daily'].map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => handleInputChange('rental_type', type)}
                      disabled={successfullySubmitted}
                      className={`flex-1 px-4 py-3 rounded-lg border-2 font-medium transition-all ${
                        formData.rental_type === type
                          ? 'border-blue-500 bg-blue-50 text-blue-700 ring-2 ring-blue-200'
                          : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50'
                      } ${successfullySubmitted ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      <div className="flex flex-col items-center">
                        <span className="text-lg font-semibold">
                          {type.charAt(0).toUpperCase() + type.slice(1)}
                        </span>
                        <span className="text-xs text-gray-500 mt-1">
                          {type === 'hourly'
                            ? tr('Flexible timing', 'Horaire flexible')
                            : tr('24-hour periods', 'Périodes de 24 h')}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {formData.rental_type && !isPackageDurationLocked && (
                <div className="bg-gradient-to-r from-blue-50 to-indigo-50 p-4 rounded-xl border border-blue-200 transition-all duration-300">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
                    <div className="flex items-center gap-2">
                      <Clock className="w-5 h-5 text-blue-600" />
                      <h3 className="font-semibold text-blue-800 text-sm sm:text-base">
                        {tr('Quick duration', 'Durée rapide')}
                      </h3>
                    </div>
                  </div>
                  
                  {formData.rental_type === 'hourly' && (
                    <div>
                      <div className="grid grid-cols-3 gap-2 mb-2">
                        {[0.5, 1, 1.5, 2, 3, 4].map((hours) => (
                          <button
                            key={hours}
                            type="button"
                            onClick={() => handleQuickHourSelect(hours)}
                            disabled={successfullySubmitted}
                            className={`px-2 py-2.5 rounded-lg transition-all text-sm font-medium flex flex-col items-center justify-center min-h-[60px] ${
                              selectedQuickDuration === hours
                                ? 'bg-blue-500 text-white border-2 border-blue-600 shadow-md'
                                : 'bg-white hover:bg-blue-50 text-gray-700 border-2 border-blue-100 hover:border-blue-300'
                            } ${successfullySubmitted ? 'opacity-50 cursor-not-allowed' : ''}`}
                          >
                            <span className="text-lg font-bold">{hours === 0.5 ? '30' : hours}</span>
                            <span className="text-xs mt-0.5">
                              {hours === 0.5 ? 'min' : hours === 1 ? 'Hour' : 'Hours'}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {formData.rental_type === 'daily' && (
                    <div>
                      <div className="grid grid-cols-4 gap-2 mb-2">
                        {[1, 2, 3, 4].map((days) => (
                          <button
                            key={days}
                            type="button"
                            onClick={() => handleQuickDaySelect(days)}
                            disabled={successfullySubmitted}
                            className={`px-2 py-2.5 rounded-lg transition-all text-sm font-medium flex flex-col items-center justify-center min-h-[60px] ${
                              selectedQuickDuration === days
                                ? 'bg-blue-500 text-white border-2 border-blue-600 shadow-md'
                                : 'bg-white hover:bg-blue-50 text-gray-700 border-2 border-blue-100 hover:border-blue-300'
                            } ${successfullySubmitted ? 'opacity-50 cursor-not-allowed' : ''}`}
                          >
                            <span className="text-lg font-bold">{days}</span>
                            <span className="text-xs mt-0.5">{days === 1 ? 'Day' : 'Days'}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              <CollapsibleDatesTimes
                formData={formData}
                errors={errors}
                rentalType={formData.rental_type}
                successfullySubmitted={successfullySubmitted}
                handleInputChange={handleInputChange}
                handleQuickHourSelect={handleQuickHourSelect}
                handleQuickDaySelect={handleQuickDaySelect}
                selectedQuickDuration={selectedQuickDuration}
                showQuickDurationShortcuts={!isPackageDurationLocked}
              />

              {activeModels.length > 0 && (
                <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm mb-4">
                  <ModelFilterTabs
                    models={activeModels}
                    activeModelId={activeModelFilter}
                    onModelSelect={setActiveModelFilter}
                    availableVehicles={availableVehicles || []}
                    disabled={successfullySubmitted}
                  />
                </div>
              )}

              <div ref={vehicleStepRef}>
                <div className="mb-3 flex items-center gap-2">
                  <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-700">
                    {tr('Step 2', 'Étape 2')}
                  </span>
                  <span className="text-sm font-semibold text-slate-700">
                    {tr('Choose vehicle', 'Choisir le véhicule')}
                  </span>
                </div>
                <div className="flex items-center justify-between mb-3">
                  <label className="block text-sm font-medium text-gray-700">
                    {tr('Available vehicles', 'Véhicules disponibles')} * ({filteredVehicles.length > 0 ? filteredVehicles.length : availableVehicles.length} {tr('available', 'disponibles')})
                  </label>
                  {formData.rental_type && formData.quantity_days > 0 && (
                    <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full">
                      {formData.quantity_days} {formData.quantity_days > 1 ? (formData.rental_type === 'hourly' ? tr('hours selected', 'heures sélectionnées') : tr('days selected', 'jours sélectionnés')) : (formData.rental_type === 'hourly' ? tr('hour selected', 'heure sélectionnée') : tr('day selected', 'jour sélectionné'))}
                    </span>
                  )}
                </div>
                {!selectedVehicle ? (
                  <VehicleCardGrid
                    vehicles={filteredVehicles.length > 0 ? filteredVehicles : (availableVehicles.length > 0 ? availableVehicles : vehicleModels)}
                    selectedId={formData.vehicle_id}
                    showSearchBar={activeModelFilter === null}
                    onSelect={(vehicleId) => {
                      handleInputChange('vehicle_id', vehicleId || '');
                    }}
                    disabled={loading || successfullySubmitted}
                    rentalType={formData.rental_type}
                    duration={formData.quantity_days}
                    availablePackages={availablePackages}
                    selectedPackageId={formData.selected_package_id}
                    usePackagePricing={formData.use_package_pricing}
                  />
                ) : (
                  <div className="rounded-xl border-2 border-emerald-500 bg-gradient-to-r from-emerald-50 to-teal-50 p-4 ring-2 ring-emerald-200 shadow-md">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-700">
                          {tr('Selected vehicle', 'Véhicule sélectionné')}
                        </p>
                        <h4 className="mt-1 text-lg font-bold text-slate-900">
                          {selectedVehicle.plate_number || tr('No plate', 'Sans plaque')}
                        </h4>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                            {selectedVehicle.model || selectedVehicle.name || tr('Vehicle', 'Véhicule')}
                          </span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleInputChange('vehicle_id', '')}
                        className="inline-flex items-center justify-center gap-2 rounded-lg border border-emerald-200 bg-white px-3 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-50"
                      >
                        <X className="h-4 w-4" />
                        {tr('Back to vehicles', 'Retour aux véhicules')}
                      </button>
                    </div>
                  </div>
                )}
                {errors.vehicle_id && (
                  <p className="text-red-500 text-xs mt-1">{errors.vehicle_id}</p>
                )}
                {formData.rental_type && formData.quantity_days > 0 && !formData.vehicle_id && (
                  <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                    <div className="flex items-center gap-2 text-blue-700">
                      <Info className="w-4 h-4" />
                      <span className="text-sm">{tr('Choose a vehicle to unlock live pricing', 'Choisissez un véhicule pour afficher le prix en direct')}</span>
                    </div>
                  </div>
                )}
              </div>

              {/* KM Packages Section - shown after vehicle selection to keep the flow decision-first */}
              {formData.rental_type && (
                <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm mb-4 min-h-[150px]">
                  <div className="mb-3 flex items-center gap-2">
                    <span className="rounded-full bg-purple-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-purple-700">
                      {tr('Step 3', 'Étape 3')}
                    </span>
                    <span className="text-sm font-semibold text-slate-700">
                      {tr('Choose package', 'Choisir le forfait')}
                    </span>
                  </div>
                  <div className="mb-4">
                    <div className="flex items-center gap-2">
                      <Package className="w-5 h-5 text-purple-600" />
                      <h3 className="font-semibold text-gray-900">{tr('Packages', 'Forfaits')}</h3>
                    </div>
                  </div>

                  {!formData.vehicle_id && (
                    <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
                      <div className="flex items-center gap-2 text-gray-600">
                        <Package className="w-5 h-5" />
                        <span className="text-sm">
                          {tr('Pick a vehicle first to load matching packages.', 'Choisissez d’abord un véhicule pour charger les forfaits correspondants.')}
                        </span>
                      </div>
                    </div>
                  )}

                  {formData.vehicle_id && !isLoadingPackages && availablePackages.length === 0 && (
                    <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
                      <div className="flex items-center gap-2 text-gray-600">
                        <Package className="w-5 h-5" />
                        <span className="text-sm">{tr('No package options are available for this vehicle yet.', 'Aucun forfait n’est encore disponible pour ce véhicule.')}</span>
                      </div>
                    </div>
                  )}

                  {formData.vehicle_id && isLoadingPackages && (
                    <div className="min-h-[150px] rounded-xl border border-purple-100 bg-gradient-to-r from-purple-50/70 to-indigo-50/60 p-4">
                      <div className="flex items-center gap-2 text-sm font-medium text-purple-700">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>{tr('Loading packages...', 'Chargement des forfaits...')}</span>
                      </div>
                    </div>
                  )}

                  {formData.vehicle_id && formData.rental_type && availablePackages.length > 0 && (
                    <div className="transition-all duration-200 ease-out opacity-100 translate-y-0">
                      <KMPackagesTab
                        packages={availablePackages.filter((pkg) => {
                          if (!formData.rental_type) return true;
                          const pkgRateType = pkg.rate_types?.name?.toLowerCase();
                          if (!pkgRateType) return true;

                          if (formData.rental_type === 'hourly') {
                            if (pkgRateType !== 'hourly') return false;
                            const durationUnits = Number((formData.quantity_hours ?? formData.quantity_days) || 0) || 0;
                            const packageDurationUnits = getPackageDurationUnits(pkg);
                            if (!packageDurationUnits) return true;
                            if (durationUnits === 0.5) return packageDurationUnits === 0.5;
                            if (durationUnits === 4) return packageDurationUnits === 4;
                            return packageDurationUnits === 1;
                          }

                          if (formData.rental_type === 'daily') return pkgRateType === 'daily';
                          return true;
                        })}
                        selectedPackageId={formData.selected_package_id}
                        onPackageSelect={(packageId) => {
                          handleInputChange('selected_package_id', packageId);
                        }}
                        onPackageCalculations={(packageData) => {
                          console.log('📦 Package calculations received:', packageData);

                          if (!packageData?.use_package_pricing && !packageData?.package_id) {
                            setSelectedPackageDraft(null);
                            setFormData(prev => ({
                              ...prev,
                              selected_package_id: null,
                              selected_package_name: '',
                              selected_package_fixed_amount: 0,
                              selected_package_rate_per_unit: 0,
                              selected_package_included_km: null,
                              selected_package_included_km_per_unit: null,
                              selected_package_total_included_km: null,
                              selected_package_extra_rate: 0,
                              selected_package_fuel_charge_enabled: false,
                              selected_package_description: '',
                              use_package_pricing: false,
                              package_overrides_tier: false
                            }));
                            loadFuelChargeSettings(null, null, false);
                            return;
                          }
                          
                          const packageDurationUnits = Number(packageData.package_duration_units);
                          setSelectedPackageDraft({
                            package_id: packageData.package_id,
                            package_name: packageData.package_name,
                            package_rate_per_unit: packageData.package_rate_per_unit,
                            package_included_km_per_unit: packageData.package_included_km_per_unit,
                            package_total_included_km: packageData.package_total_included_km,
                            package_extra_rate: packageData.package_extra_rate,
                            package_fuel_charge_enabled: Boolean(packageData.package_fuel_charge_enabled),
                            package_description: packageData.package_description,
                            package_duration_units: packageDurationUnits,
                            use_package_pricing: true,
                            package_overrides_tier: true,
                          });
                          
                          setFormData(prev => {
                            const currentDurationUnits = Math.max(
                              Number(
                                prev.rental_type === 'hourly'
                                  ? (prev.quantity_hours ?? prev.quantity_days)
                                  : prev.quantity_days
                              ) || 0,
                              prev.rental_type === 'hourly' ? 0.5 : 1
                            );
                            const nextDurationUnits = currentDurationUnits > 0
                              ? currentDurationUnits
                              : (Number.isFinite(packageDurationUnits) && packageDurationUnits > 0
                                  ? packageDurationUnits
                                  : (prev.rental_type === 'hourly' ? 0.5 : 1));
                            const nextTotalIncludedKm = calculatePackageTotalIncludedKm(
                              packageData.package_included_km_per_unit,
                              nextDurationUnits,
                              packageDurationUnits
                            );
                            console.log('📦 Updating from price:', prev.unit_price, 'to:', packageData.package_rate_per_unit);
                            
                            const newFormData = {
                              ...prev,
                              quantity_days: nextDurationUnits,
                              quantity_hours: prev.rental_type === 'hourly' ? nextDurationUnits : null,
                              selected_package_id: packageData.package_id,
                              selected_package_name: packageData.package_name,
                              selected_package_fixed_amount: packageData.package_rate_per_unit,
                              selected_package_rate_per_unit: packageData.package_rate_per_unit,
                              selected_package_included_km: packageData.package_included_km_per_unit,
                              selected_package_included_km_per_unit: packageData.package_included_km_per_unit,
                              selected_package_total_included_km: nextTotalIncludedKm,
                              selected_package_duration_units: packageDurationUnits,
                              selected_package_extra_rate: packageData.package_extra_rate,
                              selected_package_fuel_charge_enabled: Boolean(packageData.package_fuel_charge_enabled),
                              selected_package_description: packageData.package_description,
                              use_package_pricing: true,
                              package_overrides_tier: true,
                              unit_price: packageData.package_rate_per_unit
                            };
                            syncEndDateTimeFromStart(newFormData, nextDurationUnits);
                            
                            console.log('📦 Final form data update:', {
                              old_price: prev.unit_price,
                              new_price: newFormData.unit_price,
                              package_duration_units: packageDurationUnits,
                              active_duration_units: nextDurationUnits,
                              use_package_pricing: newFormData.use_package_pricing,
                              package_rate: packageData.package_rate_per_unit
                            });
                            
                            return newFormData;
                          });
                          setFuelChargeEnabled(Boolean(packageData.package_fuel_charge_enabled));
                        }}
                        onPriceOverride={(newUnitPrice) => {
                          console.log('💰 Price override called with:', newUnitPrice);
                          handleInputChange('unit_price', newUnitPrice);
                        }}
                        rentalType={formData.rental_type}
                        duration={formData.quantity_days}
                        disabled={successfullySubmitted}
                        formData={formData}
                        setFormData={setFormData}
                      />
                    </div>
                  )}
                </div>
              )}

              <div className="rounded-2xl border border-slate-200 bg-gradient-to-r from-slate-50 to-white p-4 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                      {tr('Rental summary', 'Résumé de location')}
                    </p>
                    <h3 className="mt-1 text-base font-bold text-slate-900">
                      {tr('Current selection', 'Sélection actuelle')}
                    </h3>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
                  <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                      {tr('Type', 'Type')}
                    </p>
                    <p className="mt-1 text-sm font-bold text-slate-900">
                      {formData.rental_type
                        ? (formData.rental_type === 'hourly' ? tr('Hourly', 'Horaire') : tr('Daily', 'Journalier'))
                        : tr('Not set', 'Non défini')}
                    </p>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                      {tr('Duration', 'Durée')}
                    </p>
                    <p className="mt-1 text-sm font-bold text-slate-900">
                      {selectedDurationLabel}
                    </p>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                      {tr('Vehicle', 'Véhicule')}
                    </p>
                    <p className="mt-1 text-sm font-bold text-slate-900">
                      {selectedVehicleLabel}
                    </p>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                      {tr('Package', 'Forfait')}
                    </p>
                    <p className="mt-1 text-sm font-bold text-slate-900">
                      {standardPackageSummaryLabel}
                    </p>
                  </div>

                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-700">
                      {tr('Live total', 'Total en direct')}
                    </p>
                    {(() => {
                      const durationUnits = Number(formData.quantity_days || 0) || 0;
                      const packageTotal = hasResolvedStandardPackage
                        ? selectedStandardPackageTotal
                        : getFixedPackageAmount(formData);
                      const rateAmount = hasResolvedStandardPackage
                        ? packageTotal
                        : (Number(formData.unit_price) || 0);
                      const shouldShowFormula = durationUnits > 0 && rateAmount > 0;
                      const unitLabel = formData.rental_type === 'hourly'
                        ? tr('hr', 'h')
                        : tr('day', 'jour');

                      if (hasResolvedStandardPackage && packageTotal > 0) {
                        return (
                          <p className="mt-1 text-[11px] font-medium text-emerald-700/80">
                            {tr('Fixed package total', 'Total fixe du forfait')}
                          </p>
                        );
                      }

                      return shouldShowFormula ? (
                        <p className="mt-1 text-[11px] font-medium text-emerald-700/80">
                          {`${rateAmount.toFixed(2)} × ${durationUnits} ${unitLabel}`}
                        </p>
                      ) : null;
                    })()}
                    <p className="mt-1 text-sm font-bold text-emerald-800">
                      {(hasResolvedStandardPackage
                        ? selectedStandardPackageTotal
                        : (Number(formData.total_amount) || Number(formData.unit_price) || 0)
                      ).toFixed(2)} MAD
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
          )
        )}

    

{currentStep === 3 && (
  isLightVariant ? renderLightStepThree() : (
  <div className="p-4 sm:p-6">
    <h2 className="text-xl font-bold text-gray-900">{tr('Review & Payment', 'Vérification et paiement')}</h2>
    <p className="mt-2 mb-6 text-sm text-gray-600">
      {tr(
        'Review the booking once, then capture payment and deposit details.',
        'Vérifiez la réservation une fois, puis saisissez le paiement et le dépôt.'
      )}
    </p>
    
    <div className="space-y-6">
      {/* Rental Summary with Package Info */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="font-semibold text-gray-900 mb-3">{tr('Rental Summary', 'Résumé de la location')}</h3>
        <div className="space-y-2">
          <div className="flex justify-between">
            <span className="text-gray-600">{tr('Customer:', 'Client :')}</span>
            <span className="font-medium">{formData.customer_name}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">{tr('Vehicle:', 'Véhicule :')}</span>
            <span className="font-medium">
              {(() => {
                const vehicle = getSelectedVehicle();
                if (!vehicle) return tr('Not selected', 'Non sélectionné');
                return `${vehicle.plate_number || tr('N/A', 'N/D')} - ${vehicle.model || vehicle.name}`;
              })()}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">{tr('Period:', 'Période :')}</span>
            <span className="font-medium">
              {formatPeriodDisplay()}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">{tr('Duration:', 'Durée :')}</span>
            <span className="font-medium">
              {formData.quantity_days} {formData.quantity_days > 1 ? (formData.rental_type === 'hourly' ? tr('hours', 'heures') : tr('days', 'jours')) : (formData.rental_type === 'hourly' ? tr('hour', 'heure') : tr('day', 'jour'))}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">{tr('Type:', 'Type :')}</span>
            <span className="font-medium capitalize">{formData.rental_type}</span>
          </div>
        </div>
      </div>

      {/* Price Calculator with Package Info */}
      {!formData.use_package_pricing && (
        <PriceCalculator 
          formData={formData} 
          onPriceChange={handleInputChange} 
          onResetToAuto={handleResetAutoPrice}
          autoCalculatedPrice={autoCalculatedPrice} 
          userProfile={userProfile} 
          disabled={successfullySubmitted} 
          fuelChargeEnabled={fuelChargeEnabled}
          fuelChargeAmount={fuelChargeAmount}
          pricingComputationMode={pricingComputationMode}
          pricingComputationLabel={pricingComputationLabel}
        />
      )}

      {/* Package Summary if selected */}
      {formData.use_package_pricing && formData.selected_package_name && (
        <div className="rounded-xl border border-purple-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <Package className="w-5 h-5 text-purple-600" />
            <h3 className="font-semibold text-purple-900">{tr('Package Summary', 'Résumé du forfait')}</h3>
          </div>
          
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">{tr('Package:', 'Forfait :')}</span>
              <span className="text-sm font-bold text-purple-700">{getSelectedPackageDisplayLabel(formData, tr)}</span>
            </div>
            
	            <div className="flex justify-between items-center">
	              <span className="text-sm text-gray-600">{tr('Package total:', 'Total du forfait :')}</span>
	              <span className="text-sm font-bold text-gray-900">{getFixedPackageAmount(formData).toFixed(2)} MAD</span>
	            </div>
            
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">{tr('Duration:', 'Durée :')}</span>
	              <span className="text-sm font-bold text-gray-900">
	                {formatRentalDurationLabel(formData.rental_type, formData.quantity_days, tr)}
	              </span>
	            </div>
            
	            {/* Show package included km */}
	            {formData.selected_package_included_km_per_unit && (
	              <>
	                <div className="flex justify-between items-center pt-2 border-t border-purple-100">
	                  <span className="text-sm text-gray-600">{tr('Included km:', 'Km inclus :')}</span>
	                  <span className="text-sm font-medium text-gray-700">
	                    {formData.selected_package_included_km_per_unit} km
	                  </span>
	                </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">{tr('Total included km:', 'Total km inclus :')}</span>
                    <span className="text-sm font-medium text-gray-700">
                      {formData.selected_package_total_included_km || 0} km
                    </span>
                  </div>
	              </>
	            )}
            
            {formData.selected_package_extra_rate > 0 && (
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">{tr('Extra km rate:', 'Tarif km supplémentaire :')}</span>
                <span className="text-sm font-medium text-orange-600">
                  {formData.selected_package_extra_rate.toFixed(2)} MAD/km
                </span>
              </div>
            )}

            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">{tr('Fuel policy:', 'Politique carburant :')}</span>
              <span className={`text-sm font-medium ${formData.selected_package_fuel_charge_enabled ? 'text-amber-600' : 'text-emerald-700'}`}>
                {formData.selected_package_fuel_charge_enabled
                  ? tr('Fuel charged separately', 'Carburant facturé séparément')
                  : tr('Fuel included', 'Carburant inclus')}
              </span>
            </div>

            {formData.selected_package_fuel_charge_enabled && fuelChargeAmount > 0 && (
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">{tr('Fuel line charge:', 'Frais par ligne carburant :')}</span>
                <span className="text-sm font-medium text-amber-600">
                  {fuelChargeAmount.toFixed(2)} MAD/{tr('line', 'ligne')}
                </span>
              </div>
            )}
            
            <div className="flex justify-between items-center pt-3 border-t border-purple-200">
              <span className="text-base font-semibold text-purple-900">{tr('Package Total:', 'Total du forfait :')}</span>
	              <span className="text-xl font-bold text-purple-700">
	                {getFixedPackageAmount(formData).toFixed(2)} MAD
	              </span>
            </div>
            
            {formData.selected_package_extra_rate > 0 && (
              <div className="rounded-lg border border-purple-100 bg-purple-50 px-3 py-2 text-xs text-purple-700">
                {tr('Extra km will be billed at', 'Le km supplémentaire sera facturé à')} {formData.selected_package_extra_rate.toFixed(2)} MAD/km
              </div>
            )}
            {formData.selected_package_fuel_charge_enabled && fuelChargeAmount > 0 && (
              <div className="rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                {tr('Fuel is not included. Missing fuel lines will be charged at', "Le carburant n'est pas inclus. Les lignes manquantes seront facturées à")} {fuelChargeAmount.toFixed(2)} MAD/{tr('line', 'ligne')}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tier Pricing Breakdown (only if no package selected) */}
      {!formData.use_package_pricing && formData.quantity_days > 1 && (
        <TierPricingBreakdown 
          vehicleName={(() => {
            const vehicle = availableVehicles.find(v => v.id == formData.vehicle_id) || 
                           vehicleModels.find(v => v.id == formData.vehicle_id);
            return vehicle?.name || vehicle?.model || '';
          })()}
          vehicleModelId={(() => {
            const vehicle = availableVehicles.find(v => v.id == formData.vehicle_id);
            return vehicle?.vehicle_model_id || '';
          })()}
          duration={formData.quantity_days}
          unitPrice={formData.unit_price}
          rentalType={formData.rental_type}
          availableVehicles={availableVehicles}
          pricingComputationMode={pricingComputationMode}
        />
      )}

      {/* Payment Details */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-4">
        <h3 className="font-semibold text-gray-900">{tr('Payment Details', 'Détails du paiement')}</h3>
        
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            {tr('Payment Status', 'Statut du paiement')}
          </label>
          <div className="flex gap-2">
            {['paid', 'unpaid', 'partial'].map((status) => (
              <button
                key={status}
                type="button"
                onClick={() => handlePaymentStatusTabClick(status)}
                disabled={successfullySubmitted}
                className={`flex-1 px-4 py-2 rounded-lg border-2 font-medium transition-all capitalize ${
                  formData.payment_status === status
                    ? 'border-blue-500 bg-blue-50 text-blue-700 ring-2 ring-blue-200'
                    : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50'
                } ${successfullySubmitted ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                {status}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            {tr('Paid Amount (MAD)', 'Montant payé (MAD)')}
          </label>
          <input
            type="text"
            inputMode="decimal"
            value={formData.deposit_amount}
            onFocus={(e) => {
              if (String(formData.deposit_amount || '') === '0') {
                e.target.select();
              }
            }}
            onChange={(e) => handleInputChange('deposit_amount', normalizeMoneyInput(e.target.value))}
            disabled={successfullySubmitted}
            className={`w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${successfullySubmitted ? 'opacity-50 cursor-not-allowed' : ''}`}
            placeholder="0"
          />
        </div>

        <DamageDepositTabs
          formData={formData}
          enabledPresets={getEnabledPresetsForVehicle(formData.vehicle_id)}
          allowCustomDeposit={damageDepositConfig.allowCustomDeposit}
          selectedTab={selectedDepositTab}
          customAmount={customDepositAmount}
          onTabClick={handleDepositTabClick}
          onCustomAmountChange={setCustomDepositAmount}
          onDocumentUpload={handleDepositDocumentUpload}
          onDocumentTypeSelect={handleDepositDocumentTypeSelect}
          onDocumentClear={handleDepositDocumentClear}
          documentUploading={depositDocumentUploading}
          disabled={successfullySubmitted}
        />
      </div>

      {/* Fuel Charge Toggle */}
<div className="mt-4">
  <FuelChargeToggle
    enabled={effectiveFuelChargeToggleEnabled}
    onToggle={handleFuelChargeToggleChange}
    amount={fuelChargeAmount}
    rentalType={formData.rental_type}
    disabled={successfullySubmitted}
  />
</div>

      {/* Additional Options */}
      <CollapsibleSection title={tr('Additional Options', 'Options supplémentaires')} defaultOpen={false}>
        <div className="space-y-3">
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={formData.insurance_included}
              onChange={(e) => handleInputChange('insurance_included', e.target.checked)}
              disabled={successfullySubmitted}
              className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
            />
            <span className="text-gray-700">{tr('Insurance Included', 'Assurance incluse')}</span>
          </label>
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={formData.helmet_included}
              onChange={(e) => handleInputChange('helmet_included', e.target.checked)}
              disabled={successfullySubmitted}
              className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
            />
            <span className="text-gray-700">{tr('Helmet Included', 'Casque inclus')}</span>
          </label>
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={formData.gear_included}
              onChange={(e) => handleInputChange('gear_included', e.target.checked)}
              disabled={successfullySubmitted}
              className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
            />
            <span className="text-gray-700">{tr('Gear Included', 'Équipement inclus')}</span>
          </label>
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={formData.contract_signed}
              onChange={(e) => handleInputChange('contract_signed', e.target.checked)}
              disabled={successfullySubmitted}
              className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
            />
            <span className="text-gray-700">{tr('Contract Signed', 'Contrat signé')}</span>
          </label>
        </div>
      </CollapsibleSection>

      {/* Accessories / Notes */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          {tr('Accessories / Notes', 'Accessoires / notes')}
        </label>
        <textarea
          value={formData.accessories}
          onChange={(e) => handleInputChange('accessories', e.target.value)}
          disabled={successfullySubmitted}
          className={`w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${successfullySubmitted ? 'opacity-50 cursor-not-allowed' : ''}`}
          rows="3"
          placeholder={tr('Any additional accessories or notes...', 'Tout accessoire ou note supplémentaire...')}
        />
      </div>
    </div>
  </div>
  )
)}

        {!isLightVariant && (
        <div className="rounded-b-xl border-t border-slate-200 bg-slate-50 p-4 sm:p-6">
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="flex-1 flex gap-3">
              {currentStep > 1 && (
                <button
                  type="button"
                  onClick={handleBack}
                  className="px-4 py-3 sm:py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 active:bg-gray-200 transition-colors flex-1 sm:flex-none touch-manipulation"
                  disabled={submitting || isSubmitting || successfullySubmitted}
                >
                  <ChevronLeft className="w-5 h-5 sm:w-4 sm:h-4 inline mr-1" />
                  {tr('Back', 'Retour')}
                </button>
              )}
              
              <button
                type="button"
                onClick={handleReset}
                className="px-4 py-3 sm:py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 active:bg-gray-200 transition-colors flex-1 sm:flex-none touch-manipulation"
                disabled={submitting || isSubmitting || successfullySubmitted}
              >
                {tr('Reset Form', 'Réinitialiser le formulaire')}
              </button>
              
              {onCancel && (
                <button
                  type="button"
                  onClick={onCancel}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 transition-colors flex-1 sm:flex-none"
                  disabled={submitting || isSubmitting || successfullySubmitted}
                >
                  {tr('Cancel', 'Annuler')}
                </button>
              )}
            </div>
            
            <div className="flex-1 flex gap-3 justify-end">
              {currentStep < 3 ? (
              <button
                type="button"
                onClick={handleNext}
                disabled={
                  submitting ||
                  isSubmitting ||
                  successfullySubmitted ||
                  isBannedCustomerBlocked ||
                  (currentStep === 1 && requiresCustomerVerification && (!formData.customer_licence_number?.trim() || !formData.customer_id_image))
                }
                className="flex flex-1 items-center justify-center rounded-lg bg-violet-700 px-6 py-3 font-semibold text-white transition-colors hover:bg-violet-800 sm:flex-none disabled:cursor-not-allowed disabled:opacity-50"
                title={
                  isBannedCustomerBlocked
                    ? tr('This customer is banned until an admin or owner removes the ban.', "Ce client est banni jusqu'à ce qu'un administrateur ou le propriétaire lève le bannissement.")
                    : currentStep === 1 && requiresCustomerVerification && !formData.customer_licence_number?.trim()
                      ? tr("Please enter driver's license first", "Veuillez d'abord saisir le permis de conduire")
                      : currentStep === 1 && requiresCustomerVerification && !formData.customer_id_image
                        ? tr('Please scan or import the customer ID first', "Veuillez d'abord scanner ou importer l'identité du client")
                        : ""
                }
              >
                  {submitting || isSubmitting ? (
                    <>
                      <Loader className="w-4 h-4 mr-2 animate-spin" />
                      {tr('Loading...', 'Chargement...')}
                    </>
                  ) : isBannedCustomerBlocked ? (
                    <>
                      <AlertCircle className="w-4 h-4 mr-2" />
                      {tr('Banned Customer', 'Client banni')}
                    </>
                  ) : currentStep === 1 && requiresCustomerVerification && !formData.customer_licence_number?.trim() ? (
                    <>
                      <AlertCircle className="w-4 h-4 mr-2" />
                      {tr('Enter License', 'Saisir le permis')}
                    </>
                  ) : currentStep === 1 && requiresCustomerVerification && !formData.customer_id_image ? (
                    <>
                      <AlertCircle className="w-4 h-4 mr-2" />
                      {tr('Scan ID First', "Scanner l'identité")}
                    </>
                  ) : isCustomerVerificationOnlyMode && currentStep === 1 ? (
                    <>
                      {tr('Save Verification', 'Enregistrer la vérification')}
                      <CheckCircle className="w-4 h-4 ml-2" />
                    </>
                  ) : (
                    <>
                      {tr('Next', 'Suivant')}
                      <ChevronRight className="w-4 h-4 ml-1" />
                    </>
                  )}
                </button>
              ) : (
                <button
                  type="submit"
                  onClick={() => {
                    explicitSubmitRef.current = true;
                  }}
                  disabled={submitting || isSubmitting || isLoading || successfullySubmitted || isBannedCustomerBlocked}
                  className="flex flex-1 items-center justify-center rounded-lg bg-violet-700 px-6 py-3 font-semibold text-white transition-colors hover:bg-violet-800 sm:flex-none disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {submitting || isSubmitting || isLoading ? (
                    <>
                      <Loader className="w-4 h-4 mr-2 animate-spin" />
                      {mode === 'edit' ? tr('Updating...', 'Mise à jour...') : tr('Creating...', 'Création...')}
                    </>
                  ) : (
                    isBannedCustomerBlocked ? tr('Blocked Until Unbanned', "Bloqué jusqu'au déblocage") : mode === 'edit' ? tr('Update Rental', 'Mettre à jour la location') : tr('Create Rental', 'Créer la location')
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
        )}
      </form>

      {showIDScanModal && (
        <EnhancedUnifiedIDScanModal
          saveWithoutOcrOnly={!canUseOcrIdScan}
          isOpen={showIDScanModal}
          onClose={() => {
            setShowIDScanModal(false);
          }}
          onScanComplete={(scannedData, imageFile) => {
            if (isLightVariant) {
              setLightCustomerEditOpen(true);
              setLightCustomerAdditionalOpen(false);
              setCustomerIdCaptureMethod('scanned');
              setFormData(prev => ({
                ...prev,
                customer_id_capture_method: 'scanned',
              }));
            }
            handleIDScanComplete(scannedData, imageFile);
            setShowIDScanModal(false);
          }}
          onCustomerSaved={(savedCustomer, image) => {
            handleCustomerSaved(savedCustomer, image);
            setShowIDScanModal(false);
          }}
          onImageSaved={(savedData, imageFile) => {
            if (isLightVariant) {
              setLightCustomerEditOpen(true);
              setLightCustomerAdditionalOpen(false);
              const captureMethod = savedData?.uploadMethod === 'gallery' ? 'imported' : 'saved';
              setCustomerIdCaptureMethod(captureMethod);
              setFormData(prev => ({
                ...prev,
                customer_id_capture_method: captureMethod,
              }));
            }
            handleIDScanComplete(savedData, imageFile);
            setShowIDScanModal(false);
          }}
          onImageSaveStateChange={(state) => {
            if (state === 'saving') {
              setCustomerScanNoteTone('info');
              setCustomerScanNote(tr('Saving ID image...', "Enregistrement de l'image d'identité..."));
            } else if (state === 'saved') {
              setCustomerScanNoteTone('success');
              setCustomerScanNote(tr('ID image saved successfully. Continue by entering the customer details manually.', "L'image d'identité a bien été enregistrée. Continuez en saisissant manuellement les détails du client."));
            } else if (state === 'error') {
              setCustomerScanNoteTone('warning');
              setCustomerScanNote(tr('Unable to save the ID image. Please try again.', "Impossible d'enregistrer l'image d'identité. Veuillez réessayer."));
            }
          }}
          customerId={formData.customer_id}
          autoProcessOnSelect={false}
          allowSaveWithoutOcr
          ocrEnabled={canUseOcrIdScan}
          saveWithoutOcrLabel={
            canUseOcrIdScan
              ? null
              : tr('Save image and continue', "Enregistrer l'image et continuer")
          }
        />
      )}

      {showSecondDriverScanModal && (
        <SecondDriverIDScanModal
          isOpen={showSecondDriverScanModal}
          title={
            secondDriverScanEntryMode === 'upload'
              ? tr('Upload second driver ID', "Téléverser l'identité du second conducteur")
              : tr('Scan second driver ID', "Scanner l'identité du second conducteur")
          }
          autoLaunchPicker={secondDriverScanEntryMode === 'upload'}
          scanOnlyMode
          ocrEnabled={false}
          initialDriverData={activeSecondDriver || {
            id: 'light_second_driver',
            full_name: formData.second_driver_name || '',
            licence_number: formData.second_driver_license || '',
            id_number: formData.second_driver_id_number || '',
            date_of_birth: formData.second_driver_dob || '',
            nationality: formData.second_driver_nationality || 'Moroccan',
            id_scan_url: formData.second_driver_id_image || null,
            customer_id_image: formData.second_driver_id_image || null,
            uploaded_images: formData.second_driver_uploaded_images || [],
            extra_images: (formData.second_driver_uploaded_images || []).map((image) => image?.url).filter(Boolean),
          }}
          onClose={() => {
            setShowSecondDriverScanModal(false);
            setSecondDriverScanEntryMode('scan');
          }}
          onDriverCleared={clearSecondDriverIdMedia}
          onDriverAdded={(driverData) => {
            const enhancedDriverData = {
              ...driverData,
              id: driverData.id || `driver_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
              id_scan_url: driverData.id_scan_url || driverData.customer_id_image || null,
              customer_id_image: driverData.customer_id_image || driverData.id_scan_url || null,
              uploaded_images: driverData.uploaded_images || 
                (driverData.id_scan_url ? [{
                  id: `img_${Date.now()}`,
                  url: driverData.id_scan_url,
                  name: 'ID Document',
                  uploadedAt: new Date().toISOString()
                }] : []),
              extra_images: driverData.extra_images || 
                (driverData.id_scan_url ? [driverData.id_scan_url] : []),
              phone: driverData.phone || '',
              email: driverData.email || '',
              licence_number: driverData.licence_number || driverData.license || '',
              id_number: driverData.id_number || '',
              document_number: driverData.document_number || driverData.id_number || '',
              date_of_birth: driverData.date_of_birth || null,
              nationality: driverData.nationality || 'Moroccan',
              place_of_birth: driverData.place_of_birth || '',
              gender: driverData.gender || '',
              is_active: true,
              created_at: new Date().toISOString()
            };
            
            setSecondDrivers([enhancedDriverData]);
            setFormData((prev) => {
              return {
                ...prev,
                second_driver_name: enhancedDriverData.full_name || prev.second_driver_name,
                second_driver_license: enhancedDriverData.licence_number || prev.second_driver_license,
                second_driver_id_number: enhancedDriverData.id_number || prev.second_driver_id_number,
                second_driver_dob: enhancedDriverData.date_of_birth || prev.second_driver_dob,
                second_driver_nationality: enhancedDriverData.nationality || prev.second_driver_nationality,
                second_driver_uploaded_images: enhancedDriverData.uploaded_images || prev.second_driver_uploaded_images || [],
                second_driver_id_image:
                  enhancedDriverData.id_scan_url ||
                  enhancedDriverData.customer_id_image ||
                  prev.second_driver_id_image,
              };
            });
            toast.success(`✅ ${tr('Second driver', 'Second conducteur')} "${enhancedDriverData.full_name}" ${enhancedDriverData.id_scan_url ? tr('added with ID image', "ajouté avec une image d'identité") : tr('added without image', 'ajouté sans image')}`);
            setSecondDriverScanEntryMode('scan');
            setShowSecondDriverScanModal(false);
          }}
        />
      )}

      {showCustomerDrawer && (
        <ViewCustomerDetailsDrawer
          isOpen={showCustomerDrawer}
          onClose={() => {
            setShowCustomerDrawer(false);
            setSelectedRentalForDrawer(null);
          }}
          rental={effectiveDrawerRental}
          customerId={effectiveDrawerRental?.customer_id || formData.customer_id || null}
          secondDrivers={secondDrivers}
        />
      )}

      <Dialog
        open={showCustomerAlertModal}
        onOpenChange={(open) => {
          if (customerAlert?.type === 'banned' && !open) {
            setShowCustomerAlertModal(false);
            return;
          }
          setShowCustomerAlertModal(open);
        }}
      >
        <DialogContent className="max-w-md rounded-[28px] border border-slate-200 bg-white p-0 shadow-[0_24px_70px_rgba(15,23,42,0.14)]">
          <DialogHeader className={`border-b px-6 py-5 ${
            customerAlert?.type === 'banned'
              ? 'border-rose-100 bg-gradient-to-r from-white via-rose-50 to-white'
              : 'border-violet-100 bg-gradient-to-r from-white via-violet-50 to-white'
          }`}>
            <DialogTitle className="flex items-center gap-2 text-lg font-semibold text-slate-900">
              <AlertCircle className={`h-5 w-5 ${customerAlert?.type === 'banned' ? 'text-rose-600' : 'text-violet-600'}`} />
              {customerAlert?.type === 'banned' ? tr('Banned Customer', 'Client banni') : tr('Customer Alert', 'Alerte client')}
            </DialogTitle>
            <DialogDescription className="pt-1 text-sm text-slate-600">
              {customerAlert?.type === 'banned'
                ? `${customerAlert?.customerName || formData.customer_name || tr('This customer', 'Ce client')} ${tr('is currently banned.', 'est actuellement banni.')}`
                : `${tr('Internal staff note for', "Note interne de l'équipe pour")} ${customerAlert?.customerName || formData.customer_name || tr('this customer', 'ce client')}.`}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 px-6 py-5">
            <div className={`rounded-3xl border p-4 ${
              customerAlert?.type === 'banned'
                ? 'border-rose-200 bg-rose-50/90'
                : 'border-violet-200 bg-violet-50/80'
            }`}>
              <p className={`whitespace-pre-wrap text-sm font-medium leading-6 ${
                customerAlert?.type === 'banned' ? 'text-rose-900' : 'text-slate-800'
              }`}>
                {customerAlert?.note || (customerAlert?.type === 'banned'
                  ? tr('No ban reason has been saved yet. Open the customer profile to review this customer before continuing.', "Aucune raison de bannissement n'a encore été enregistrée. Ouvrez le profil client pour examiner ce client avant de continuer.")
                  : tr('No alert note available.', "Aucune note d'alerte disponible."))}
              </p>
            </div>

            {customerAlert?.type === 'banned' ? (
              <p className="text-xs font-medium text-slate-500">
                {tr('This reservation is blocked. Open the customer details drawer to review the ban note. Only an admin or owner can remove the ban.', "Cette réservation est bloquée. Ouvrez le panneau des détails client pour consulter la note de bannissement. Seul un administrateur ou le propriétaire peut lever le bannissement.")}
              </p>
            ) : !!customerAlert?.historyCount && (
              <p className="text-xs font-medium text-slate-500">
                {customerAlert.historyCount} {tr('saved staff note', 'note interne enregistrée')}{customerAlert.historyCount > 1 ? 's' : ''} {tr('available in the customer profile.', 'disponible dans le profil client.')}
              </p>
            )}

            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setShowCustomerAlertModal(false)}
                className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
              >
                {customerAlert?.type === 'banned' ? tr('Close', 'Fermer') : tr('Continue', 'Continuer')}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowCustomerAlertModal(false);
                  navigate(buildCustomerProfileHref({
                    customerId: customerAlert?.customerId || formData.customer_id,
                    email: formData.customer_email,
                    rentalId: initialData?.id || null,
                  }));
                }}
                className={`rounded-2xl px-4 py-2 text-sm font-semibold text-white transition ${
                  customerAlert?.type === 'banned'
                    ? 'bg-rose-600 hover:bg-rose-700'
                    : 'bg-violet-600 hover:bg-violet-700'
                }`}
              >
                {customerAlert?.type === 'banned' ? tr('Open Customer Profile', 'Ouvrir le profil client') : tr('Review Customer Profile', 'Voir le profil client')}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      </div>
  );
};

export default SimplifiedRentalWizard;
