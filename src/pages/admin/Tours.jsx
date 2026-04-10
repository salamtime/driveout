import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import {
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  Clock,
  ChevronRight,
  ChevronUp,
  ClipboardList,
  Compass,
  FileText,
  FileImage,
  Fuel,
  Gauge,
  History,
  MapPinned,
  Minus,
  MoreHorizontal,
  PanelRightOpen,
  Package2,
  Plus,
  Printer,
  Route,
  Share2,
  ShieldCheck,
  TimerReset,
  UserSquare2,
  Users,
  Wrench,
  X,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { supabase } from '../../lib/supabase';
import i18n from '../../i18n';
import { useAuth } from '../../contexts/AuthContext';
import { TABLE_NAMES } from '../../config/tableNames';
import EnhancedUnifiedIDScanModal from '../../components/customers/EnhancedUnifiedIDScanModal';
import PhoneInputWithCountryCode from '../../components/forms/PhoneInputWithCountryCode';
import { canChooseTourGuide, canManageTourPackages as canManageTourPackagesPermission } from '../../utils/permissionHelpers';
import { fetchVehicles } from '../../store/slices/vehiclesSlice';
import FuelTransactionService from '../../services/FuelTransactionService';
import { searchCustomers as searchCustomerRecords } from '../../services/EnhancedUnifiedCustomerService';
import {
  assignTourVehicles,
  createTourBookings,
  fetchTourBookings,
  reconcileTourVehicleStatuses,
  updateTourBookingRows,
  updateTourBookingStatus,
} from '../../services/tourBookingService';
import {
  buildTourTrackingUrl,
  fetchRecentTrackedTours,
} from '../../services/tourTrackingService';
import { shortenUrl } from '../../services/UrlShortenerService';
import { getUsers } from '../../services/UserService';
import { fetchTourPackages } from '../../services/tourPackageService';
import {
  fetchTourPackageModelPrices,
  getTourPriceForModelAndDuration,
  getTourPackageStartingPrice,
  GLOBAL_TOUR_PRICING_KEY,
} from '../../services/tourPackagePricingService';
import VehicleModelPricingService from '../../services/VehicleModelPricingService';

const TOUR_PACKAGE_RULES_MARKER = '[tour_package_rules]';
const TOUR_BOOKING_MARKER = '[tour_booking]';
const isFrenchLocale = () => i18n.resolvedLanguage === 'fr';
const tr = (en, fr) => (isFrenchLocale() ? fr : en);

// Returns today's date as YYYY-MM-DD in the device's local timezone (not UTC)
const localToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const getLocalDateKey = (value) => {
  const date = new Date(value || '');
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

const defaultPackageRules = {
  routeType: 'mountain',
  requiresLicense: false,
  maxQuads: 5,
  bufferBeforeMinutes: 15,
  bufferAfterMinutes: 30,
  websiteVisible: false,
};

const createInitialBookingForm = () => ({
  packageId: '',
  date: localToday(),
  time: '',
  quadCount: 1,
  guideId: '',
  ridersCount: 1,
  shareContract: false,
  notes: '',
  selectedModelCounts: {},
  primaryDrivers: [
    {
      fullName: '',
      whatsapp: '',
      idNumber: '',
      licenseNumber: '',
      idFile: null,
      idFileName: '',
    },
  ],
  secondaryDrivers: [
    {
      fullName: '',
      whatsapp: '',
      idNumber: '',
      licenseNumber: '',
      idFile: null,
      idFileName: '',
    },
  ],
});

const createInitialReturnEntry = (vehicle, departureEntry = null) => ({
  vehicleId: vehicle.id,
  vehicleName: departureEntry?.vehicleName || `${vehicle.plate_number || 'No plate'} • ${vehicle.name || 'SEGWAY'} ${vehicle.model || ''}`.trim(),
  startOdometer: departureEntry?.startOdometer ?? Number(vehicle.current_odometer || 0),
  startFuelLevel: departureEntry?.startFuelLevel ?? null,
  sourceFuelLevel: departureEntry?.sourceFuelLevel ?? null,
  endOdometer: vehicle.current_odometer !== null && vehicle.current_odometer !== undefined && vehicle.current_odometer !== ''
    ? String(vehicle.current_odometer)
    : '',
  fuelLevel: '',
});

const createInitialDepartureEntry = (vehicle, fuelState = null) => {
  const sourceFuelLevel = Number.isFinite(Number(fuelState?.current_fuel_lines))
    ? Number(fuelState.current_fuel_lines)
    : null;

  return {
    vehicleId: vehicle.id,
    vehicleName: `${vehicle.plate_number || 'No plate'} • ${vehicle.name || 'SEGWAY'} ${vehicle.model || ''}`.trim(),
    startOdometer: vehicle.current_odometer !== null && vehicle.current_odometer !== undefined && vehicle.current_odometer !== ''
      ? String(vehicle.current_odometer)
      : '',
    sourceFuelLevel,
    startFuelLevel: sourceFuelLevel ?? '',
  };
};

const TOUR_FUEL_TANK_LINES = 8;
const TOUR_FUEL_TANK_LITERS = 23;

const tourFuelLinesToLiters = (fuelLevel) => (
  Math.round(((Number(fuelLevel || 0) / TOUR_FUEL_TANK_LINES) * TOUR_FUEL_TANK_LITERS) * 1000) / 1000
);

const tabs = [
  { id: 'schedule', label: tr('Schedule', 'Planning'), icon: CalendarDays },
  { id: 'bookings', label: tr('Book Tour', 'Réserver un tour'), icon: Compass },
];

const tabDescriptions = {
  schedule: {
    title: tr('Operational board', 'Tableau opérationnel'),
    description: tr('Track active tours, scheduled departures, and completed tour history in one place.', 'Suivez les tours en cours, les départs programmés et l’historique des tours terminés au même endroit.'),
  },
  bookings: {
    title: tr('Tour booking flow', 'Flux de réservation des tours'),
    description: tr('Create fast staff tour bookings with package rules, driver details, and vehicle assignment.', 'Créez rapidement des réservations internes avec règles de forfait, détails conducteur et attribution des véhicules.'),
  },
};

const timeSlots = ['08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00'];

const formatTimeInputValue = (date) => {
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
};

const formatDurationLabel = (value) => {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric) || numeric <= 0) return '0h';
  if (numeric % 1 === 0) {
    return `${numeric.toFixed(0)} hour${numeric === 1 ? '' : 's'}`;
  }
  return `${numeric.toFixed(1)} hours`;
};

const normalizeFlexibleDuration = (value) => {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  return Number(numeric.toFixed(1));
};

const safeJsonParse = (value) => {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

const extractMarkedJson = (value, marker) => {
  const text = typeof value === 'string' ? value : '';
  const markerIndex = text.indexOf(marker);
  if (markerIndex === -1) return null;
  return safeJsonParse(text.slice(markerIndex + marker.length).trim());
};

const stripMarkedJson = (value, marker) => {
  const text = typeof value === 'string' ? value : '';
  const markerIndex = text.indexOf(marker);
  if (markerIndex === -1) return text.trim();
  return text.slice(0, markerIndex).trim();
};

const appendMarkedJson = (text, marker, payload) => {
  const cleanedText = stripMarkedJson(text, marker);
  const serialized = `${marker}${JSON.stringify(payload)}`;
  return cleanedText ? `${cleanedText}\n\n${serialized}` : serialized;
};

const normalizePackage = (pkg) => {
  const rules = {
    ...defaultPackageRules,
    ...(extractMarkedJson(pkg.description, TOUR_PACKAGE_RULES_MARKER) || {}),
  };
  const cleanDescription = stripMarkedJson(pkg.description, TOUR_PACKAGE_RULES_MARKER);

  return {
    ...pkg,
    description: cleanDescription,
    routeType: String(pkg.routeType || pkg.route_type || rules.routeType),
    requiresLicense: Boolean(pkg.requiresLicense ?? pkg.requires_license ?? rules.requiresLicense),
    maxQuads: Number(pkg.maxQuads || pkg.max_quads || rules.maxQuads) || 5,
    bufferBeforeMinutes: Number(pkg.bufferBeforeMinutes || pkg.buffer_before_minutes || rules.bufferBeforeMinutes) || 15,
    bufferAfterMinutes: Number(pkg.bufferAfterMinutes || pkg.buffer_after_minutes || rules.bufferAfterMinutes) || 30,
    websiteVisible: Boolean(pkg.websiteVisible ?? pkg.website_visible ?? rules.websiteVisible),
  };
};

const getPackagePrice = (pkg) => {
  if (!pkg) return 0;
  return Number(pkg.duration) === 2 ? Number(pkg.default_rate_2h || 0) : Number(pkg.default_rate_1h || 0);
};

const getVehicleModelId = (vehicle) =>
  String(vehicle?.vehicle_model_id || vehicle?.model_id || vehicle?.vehicle_model?.id || '');

const getVehicleModelName = (vehicle, vehicleModelsById) => {
  const modelId = getVehicleModelId(vehicle);
  const linkedModel = modelId ? vehicleModelsById.get(String(modelId)) : null;

  if (linkedModel) {
    const name = String(linkedModel.name || '').trim();
    const model = String(linkedModel.model || '').trim();
    if (name && model && name.toLowerCase().includes(model.toLowerCase())) {
      return name;
    }
    return [name, model].filter(Boolean).join(' ').trim() || `Model ${linkedModel.id}`;
  }

  return [vehicle?.name, vehicle?.model].filter(Boolean).join(' ').trim() || 'Unknown model';
};

const getVehicleModelCatalogName = (model) => {
  if (!model) return 'Unknown model';
  const name = String(model.name || '').trim();
  const variant = String(model.model || '').trim();
  if (name && variant && name.toLowerCase().includes(variant.toLowerCase())) {
    return name;
  }
  return [name, variant].filter(Boolean).join(' ').trim() || `Model ${model.id}`;
};

const normalizeSelectedModelCounts = (currentCounts = {}, modelGroups = [], quadCount = 1) => {
  const safeQuadCount = Math.max(1, Number(quadCount || 1));
  const nextCounts = {};
  let assigned = 0;

  modelGroups.forEach((group) => {
    const modelId = String(group.modelId);
    const remainingCapacity = Math.max(0, safeQuadCount - assigned);
    const desired = Math.max(
      0,
      Math.min(
        Number(currentCounts?.[modelId] || 0),
        Number(group.availableCount || 0),
        remainingCapacity
      )
    );
    nextCounts[modelId] = desired;
    assigned += desired;
  });

  return nextCounts;
};

const countSelectedModels = (counts = {}) =>
  Object.values(counts).reduce((sum, value) => sum + Number(value || 0), 0);

const buildVehiclesForModelMix = (vehicles = [], selectedModelMix = []) => {
  const grouped = new Map();

  vehicles.forEach((vehicle) => {
    const modelId = getVehicleModelId(vehicle);
    if (!modelId) return;
    if (!grouped.has(modelId)) grouped.set(modelId, []);
    grouped.get(modelId).push(vehicle);
  });

  const selectedVehicles = [];
  const missingModels = [];

  selectedModelMix.forEach((item) => {
    const pool = grouped.get(String(item.modelId)) || [];
    const needed = Number(item.count || 0);
    if (pool.length < needed) {
      missingModels.push({
        modelId: item.modelId,
        label: item.label,
        missing: needed - pool.length,
      });
    }
    selectedVehicles.push(...pool.slice(0, needed));
  });

  return {
    selectedVehicles,
    missingModels,
  };
};

const getLegacyPackagePricingBadge = (pkg) => {
  const fallbackPrice = getPackagePrice(pkg);
  if (fallbackPrice > 0) {
    return tr(`From ${fallbackPrice} MAD`, `À partir de ${fallbackPrice} MAD`);
  }
  return 'Model pricing';
};

const formatDateTime = (value) => {
  if (!value) return 'Not scheduled';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Invalid date';
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const formatGuestSummary = (tour) => {
  const leadName = String(tour?.customerName || '').trim();
  const ridersCount = Number(tour?.ridersCount || 0);

  if (ridersCount > 1 && leadName) {
    return `${leadName} + ${ridersCount - 1} more`;
  }

  if (ridersCount > 1) {
    return `${ridersCount} riders`;
  }

  return leadName || 'Riders';
};

const formatDuration = (milliseconds) => {
  const safeMs = Math.max(0, Number(milliseconds || 0));
  const totalSeconds = Math.floor(safeMs / 1000);
  const days = Math.floor(totalSeconds / (24 * 60 * 60));
  const hours = Math.floor((totalSeconds % (24 * 60 * 60)) / (60 * 60));
  const minutes = Math.floor((totalSeconds % (60 * 60)) / 60);
  const seconds = totalSeconds % 60;

  if (days > 0) {
    return `${days}d ${hours}h ${minutes}m`;
  }

  if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds}s`;
  }

  return `${minutes}m ${seconds}s`;
};

const getTourElapsedTone = ({ startedAt, durationHours, currentTime = Date.now() }) => {
  const startedAtTime = new Date(startedAt || '').getTime();
  const durationMs = Number(durationHours || 1) * 60 * 60 * 1000;

  if (!Number.isFinite(startedAtTime) || !Number.isFinite(durationMs) || durationMs <= 0) {
    return {
      elapsedCardClass: 'border-slate-200 bg-slate-50',
      elapsedTextClass: 'text-slate-600',
      labelClass: 'text-slate-500',
      expired: false,
    };
  }

  const elapsedMs = Math.max(0, currentTime - startedAtTime);
  const progress = elapsedMs / durationMs;

  if (progress >= 1) {
    return {
      elapsedCardClass: 'border-red-200 bg-red-50',
      elapsedTextClass: 'text-red-600',
      labelClass: 'text-red-500',
      expired: true,
    };
  }

  if (progress >= 0.75) {
    return {
      elapsedCardClass: 'border-red-200 bg-red-50',
      elapsedTextClass: 'text-red-600',
      labelClass: 'text-red-500',
      expired: false,
    };
  }

  if (progress >= 0.45) {
    return {
      elapsedCardClass: 'border-amber-200 bg-amber-50',
      elapsedTextClass: 'text-amber-600',
      labelClass: 'text-amber-500',
      expired: false,
    };
  }

  return {
    elapsedCardClass: 'border-emerald-200 bg-emerald-50',
    elapsedTextClass: 'text-emerald-600',
    labelClass: 'text-emerald-500',
    expired: false,
  };
};

const getTourTimingSummary = (tour, referenceTime = Date.now()) => {
  const startedAtTime = new Date(tour?.startedAt || '').getTime();
  if (!Number.isFinite(startedAtTime)) {
    return {
      actualDurationLabel: tr('Not started', 'Pas démarré'),
      overrunLabel: tr('On time', 'Dans les temps'),
      isOverrun: false,
    };
  }

  const scheduledDurationMs = Number(tour?.durationHours || 1) * 60 * 60 * 1000;
  const finishedAtTime = new Date(tour?.completedAt || referenceTime).getTime();
  const actualDurationMs = Math.max(0, finishedAtTime - startedAtTime);
  const overrunMs = Math.max(0, actualDurationMs - scheduledDurationMs);

  return {
    actualDurationLabel: formatDuration(actualDurationMs),
    overrunLabel: overrunMs > 0 ? `+${formatDuration(overrunMs)}` : tr('On time', 'Dans les temps'),
    isOverrun: overrunMs > 0,
  };
};

const formatCurrencyMAD = (value) =>
  new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(Number(value || 0));

const formatWhatsAppPhoneNumber = (input, countryCode = '+212') => {
  const rawValue = String(input || '').trim();
  if (!rawValue) return '';

  if (rawValue.startsWith('+')) {
    return rawValue;
  }

  const digits = rawValue.replace(/\D/g, '');
  if (!digits) return '';

  if (countryCode === '+212' && digits.startsWith('0')) {
    return `+212 ${digits.slice(1)}`;
  }

  return `${countryCode} ${digits}`;
};

const WHATSAPP_COUNTRY_RULES = [
  { code: '+971', name: 'UAE', digits: [9] },
  { code: '+966', name: 'Saudi Arabia', digits: [9] },
  { code: '+212', name: 'Morocco', digits: [9] },
  { code: '+216', name: 'Tunisia', digits: [8] },
  { code: '+20', name: 'Egypt', digits: [10] },
  { code: '+49', name: 'Germany', digits: [10, 11] },
  { code: '+44', name: 'UK', digits: [10] },
  { code: '+34', name: 'Spain', digits: [9] },
  { code: '+39', name: 'Italy', digits: [9, 10] },
  { code: '+33', name: 'France', digits: [9] },
  { code: '+90', name: 'Turkey', digits: [10] },
  { code: '+1', name: 'USA/Canada', digits: [10] },
];

const detectWhatsAppCountryRule = (formatted, fallbackCountryCode = '+212') => {
  const compact = String(formatted || '').replace(/\s/g, '');
  const detectedRule = WHATSAPP_COUNTRY_RULES
    .slice()
    .sort((a, b) => b.code.length - a.code.length)
    .find((rule) => compact.startsWith(rule.code));

  return detectedRule || WHATSAPP_COUNTRY_RULES.find((rule) => rule.code === fallbackCountryCode) || WHATSAPP_COUNTRY_RULES[0];
};

const getWhatsAppAvailability = (input, countryCode = '+212') => {
  const formatted = formatWhatsAppPhoneNumber(input, countryCode);
  if (!formatted) {
    return { isValid: false, link: '', helper: tr('Saved in WhatsApp format for quick contact.', 'Enregistré au format WhatsApp pour un contact rapide.') };
  }

  const compactValue = formatted.replace(/\s/g, '');
  const digitsOnly = compactValue.replace(/\D/g, '');

  if (!compactValue.startsWith('+')) {
    return { isValid: false, link: '', helper: tr('Saved in WhatsApp format for quick contact.', 'Enregistré au format WhatsApp pour un contact rapide.') };
  }

  const detectedRule = detectWhatsAppCountryRule(compactValue, countryCode);
  const localDigits = digitsOnly.replace(new RegExp(`^${detectedRule.code.replace('+', '')}`), '');

  if (detectedRule.code === '+212') {
    const moroccoDigits = localDigits;
    const isValidMoroccoMobile = moroccoDigits.length === 9 && ['6', '7'].includes(moroccoDigits.charAt(0));

    if (!isValidMoroccoMobile) {
      return {
        isValid: false,
        link: '',
        helper: 'Use a valid Moroccan WhatsApp number like +212 6XX XXX XXX.',
      };
    }

    return {
      isValid: true,
      link: `https://wa.me/${digitsOnly}`,
      helper: 'WhatsApp available',
    };
  }

  if (!detectedRule.digits.includes(localDigits.length)) {
    return {
      isValid: false,
      link: '',
      helper: `Use a valid ${detectedRule.name} WhatsApp number with country code.`,
    };
  }

  return {
    isValid: true,
    link: `https://wa.me/${digitsOnly}`,
    helper: 'WhatsApp available',
  };
};

const formatLogTimestamp = (value) => {
  if (!value) return 'Unknown time';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown time';
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
};

const createEmptyDriver = () => ({
  customerId: '',
  fullName: '',
  whatsapp: '',
  email: '',
  idNumber: '',
  licenseNumber: '',
  dateOfBirth: '',
  nationality: '',
  placeOfBirth: '',
  issueDate: '',
  idFile: null,
  idFileName: '',
  idFileUrl: '',
});

const syncDriverSlots = (drivers = [], quadCount = 1) => {
  const count = Math.max(1, Number(quadCount || 1));
  return Array.from({ length: count }, (_, index) => ({
    ...createEmptyDriver(),
    ...(drivers[index] || {}),
  }));
};

const hasAnyDriverValue = (driver) =>
  Boolean(
    String(driver?.fullName || '').trim() ||
    String(driver?.whatsapp || '').trim() ||
    String(driver?.email || '').trim() ||
    String(driver?.idNumber || '').trim() ||
    String(driver?.licenseNumber || '').trim() ||
    String(driver?.idFileName || '').trim()
  );

const hasValidEmail = (value) => /\S+@\S+\.\S+/.test(String(value || '').trim());

const hasDriverContactMethod = (driver) =>
  Boolean(String(driver?.whatsapp || '').trim() || String(driver?.email || '').trim());

const overlapsWindow = (rowStartValue, rowEndValue, rangeStart, rangeEnd) => {
  const rowStart = new Date(rowStartValue);
  const rowEnd = new Date(rowEndValue);
  if (Number.isNaN(rowStart.getTime()) || Number.isNaN(rowEnd.getTime())) return false;
  return rangeStart < rowEnd && rangeEnd > rowStart;
};

const startsWithinOneHour = (value) => {
  const start = new Date(value);
  if (Number.isNaN(start.getTime())) return false;
  return start.getTime() - Date.now() <= 60 * 60 * 1000;
};

const CLOSED_TOUR_STATUSES = ['completed', 'cancelled', 'no_show', 'expired'];
const TOUR_REVIEW_GRACE_MS = 60 * 60 * 1000;

const getTourStatusLabel = (status) => {
  switch (String(status || '').toLowerCase()) {
    case 'scheduled':
      return tr('Scheduled', 'Planifié');
    case 'active':
      return tr('Active', 'Actif');
    case 'completed':
      return tr('Completed', 'Terminé');
    case 'cancelled':
      return tr('Cancelled', 'Annulé');
    case 'no_show':
      return tr('No-show', 'No-show');
    case 'expired':
      return tr('Expired', 'Expiré');
    default:
      return status || tr('Scheduled', 'Planifié');
  }
};

const isTourPastReviewWindow = (tour) => {
  if (String(tour?.status || '').toLowerCase() !== 'scheduled') return false;
  const start = new Date(tour?.scheduledStartAt || '');
  if (Number.isNaN(start.getTime())) return false;
  const created = new Date(tour?.createdAt || '');
  if (!Number.isNaN(created.getTime()) && Date.now() - created.getTime() < 10 * 60 * 1000) return false;
  return Date.now() - start.getTime() > TOUR_REVIEW_GRACE_MS;
};

const toStatusTone = (status) => {
  switch (String(status || '').toLowerCase()) {
    case 'active':
    case 'in_progress':
      return 'bg-emerald-100 text-emerald-700';
    case 'completed':
      return 'bg-slate-200 text-slate-700';
    case 'cancelled':
      return 'bg-rose-100 text-rose-700';
    case 'no_show':
      return 'bg-orange-100 text-orange-700';
    case 'expired':
      return 'bg-amber-100 text-amber-700';
    default:
      return 'bg-blue-100 text-blue-700';
  }
};

const getTourWorkflowState = (tour) => {
  if (CLOSED_TOUR_STATUSES.includes(String(tour?.status || '').toLowerCase())) return 'completed';
  if (tour?.status === 'active' || tour?.startedAt) return 'started';
  if (tour?.trackingLinkSentAt) return 'link_sent';
  return 'idle';
};

const getTourWorkflowHint = (tour, trackingActive = false) => {
  const workflowState = getTourWorkflowState(tour);
  if (workflowState === 'started' && trackingActive) return tr('Tracking active', 'Suivi actif');
  if (workflowState === 'started') return tr('Tour started', 'Tour démarré');
  if (workflowState === 'link_sent') return tr('Ready to start', 'Prêt à démarrer');
  if (workflowState === 'completed') return tr('Completed', 'Terminé');
  return tr('Not started', 'Pas démarré');
};

const getScheduleCardClasses = (status) => {
  switch (String(status || '').toLowerCase()) {
    case 'active':
    case 'in_progress':
      return 'border-2 border-violet-400 bg-white shadow-sm';
    case 'completed':
      return 'border-2 border-violet-200 bg-white shadow-sm';
    case 'cancelled':
      return 'border-2 border-rose-200 bg-white shadow-sm';
    case 'no_show':
      return 'border-2 border-orange-200 bg-white shadow-sm';
    case 'expired':
      return 'border-2 border-amber-200 bg-white shadow-sm';
    default:
      return 'border-2 border-violet-300 bg-white shadow-sm';
  }
};

const getTourEndTimestamp = (tour) => {
  const base = new Date(tour?.startedAt || tour?.scheduledStartAt || '');
  if (Number.isNaN(base.getTime())) return Number.NaN;
  return base.getTime() + Number(tour?.durationHours || 1) * 60 * 60 * 1000;
};

const isTourExpired = (tour) => {
  if (String(tour?.status || '').toLowerCase() !== 'active') return false;
  const endTimestamp = getTourEndTimestamp(tour);
  if (Number.isNaN(endTimestamp)) return false;
  return Date.now() > endTimestamp;
};

const TourLiveTimer = ({ startedAt, durationHours }) => {
  const [currentTime, setCurrentTime] = useState(Date.now());

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setCurrentTime(Date.now());
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, []);

  if (!startedAt) return null;

  const startedAtTime = new Date(startedAt).getTime();
  if (Number.isNaN(startedAtTime)) return null;

  const endTime = startedAtTime + Number(durationHours || 1) * 60 * 60 * 1000;
  const elapsedMs = currentTime - startedAtTime;
  const remainingMs = endTime - currentTime;
  const isLate = remainingMs < 0;
  const tone = getTourElapsedTone({ startedAt, durationHours, currentTime });

  return (
    <div className="w-full rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3 mb-3">
        <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-violet-500">{tr('Tour Timer', 'Minuteur du tour')}</p>
        <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
          {tr('Active', 'Actif')}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className={`rounded-xl border px-3 py-3 text-center shadow-sm ${tone.elapsedCardClass}`}>
          <p className="text-xs sm:text-sm text-gray-600 font-medium">{tr('Time Elapsed', 'Temps écoulé')}</p>
          <p className={`mt-1 text-2xl sm:text-3xl font-bold break-all ${tone.elapsedTextClass}`}>
            {formatDuration(elapsedMs)}
          </p>
          {tone.expired && (
            <p className={`mt-1 text-[10px] font-semibold uppercase tracking-[0.16em] ${tone.labelClass}`}>
              {tr('Expired', 'Expiré')}
            </p>
          )}
        </div>
        <div className={`rounded-xl border px-3 py-3 text-center shadow-sm ${isLate ? 'border-red-200 bg-red-50' : 'border-blue-200 bg-blue-50'}`}>
          {isLate && (
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-red-500">{tr('Expired', 'Expiré')}</p>
          )}
          <p className="text-xs sm:text-sm text-gray-600 font-medium">{tr('Time Remaining', 'Temps restant')}</p>
          <p className={`mt-1 font-bold break-all ${isLate ? 'text-lg sm:text-2xl text-red-600' : 'text-2xl sm:text-3xl text-blue-600'}`}>
            {isLate ? `+${formatDuration(Math.abs(remainingMs))}` : formatDuration(remainingMs)}
          </p>
        </div>
      </div>
    </div>
  );
};

const ToursPage = () => {
  const location = useLocation();
  const dispatch = useDispatch();
  const { userProfile } = useAuth();
  const isFrench = isFrenchLocale();
  const vehicles = useSelector((state) => state.vehicles?.vehicles || []);
  const canSelectTourGuide = canChooseTourGuide(userProfile);
  const canManageTourPackages = canManageTourPackagesPermission(userProfile);
  const currentUserDisplayName =
    userProfile?.full_name ||
    userProfile?.fullName ||
    userProfile?.name ||
    userProfile?.email ||
    'Team Member';

  const [activeTab, setActiveTab] = useState('schedule');
  const [refreshKey, setRefreshKey] = useState(0);
  const [bookings, setBookings] = useState([]);
  const [bookingsLoading, setBookingsLoading] = useState(true);
  const [packages, setPackages] = useState([]);
  const [packagesLoading, setPackagesLoading] = useState(true);
  const [vehicleModels, setVehicleModels] = useState([]);
  const [guides, setGuides] = useState([]);
  const [guidesLoading, setGuidesLoading] = useState(true);
  const [bookingStep, setBookingStep] = useState(1);
  const [bookingForm, setBookingForm] = useState(createInitialBookingForm);
  const [bookingSaving, setBookingSaving] = useState(false);
  const [guestIDScanOpen, setGuestIDScanOpen] = useState(false);
  const [driverIDScanTarget, setDriverIDScanTarget] = useState(null);
  const [activeDriverQuadIndex, setActiveDriverQuadIndex] = useState(0);
  const [secondDriverOpenByQuad, setSecondDriverOpenByQuad] = useState({});
  const [tourReturnModalOpen, setTourReturnModalOpen] = useState(false);
  const [tourToComplete, setTourToComplete] = useState(null);
  const [tourReturnEntries, setTourReturnEntries] = useState([]);
  const [tourReturnSaving, setTourReturnSaving] = useState(false);
  const [tourStartModalOpen, setTourStartModalOpen] = useState(false);
  const [tourToStart, setTourToStart] = useState(null);
  const [tourDepartureEntries, setTourDepartureEntries] = useState([]);
  const [tourDepartureSaving, setTourDepartureSaving] = useState(false);
  const [tourPricingRows, setTourPricingRows] = useState([]);
  const [schedulePage, setSchedulePage] = useState(1);
  const [completedPage, setCompletedPage] = useState(1);
  const [completedPageSize, setCompletedPageSize] = useState(10);
  const [historyCollapsed, setHistoryCollapsed] = useState(true);
  const [tourDetailsOpen, setTourDetailsOpen] = useState(false);
  const [selectedTourDetails, setSelectedTourDetails] = useState(null);
  const [tourActivityLogs, setTourActivityLogs] = useState([]);
  const [tourActivityLoading, setTourActivityLoading] = useState(false);
  const [customerSuggestions, setCustomerSuggestions] = useState([]);
  const [customerSuggestionsLoading, setCustomerSuggestionsLoading] = useState(false);
  const [trackedTours, setTrackedTours] = useState([]);
  const [isMobileDevice, setIsMobileDevice] = useState(false);
  const [openTourActionGroupId, setOpenTourActionGroupId] = useState('');
  const realtimeReloadTimerRef = useRef(null);
  const currentTimeSlot = formatTimeInputValue(new Date());

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const requestedTab = params.get('tab');
    if (requestedTab && tabs.some((tab) => tab.id === requestedTab)) {
      setActiveTab(requestedTab);
    }
  }, [location.search]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const userAgent = window.navigator.userAgent || '';
    setIsMobileDevice(/Android|iPhone|iPad|iPod|Mobile/i.test(userAgent));
  }, []);

  useEffect(() => {
    if (!openTourActionGroupId) return undefined;

    const handleOutsideClick = (event) => {
      if (!event.target?.closest?.('[data-tour-action-menu]')) {
        setOpenTourActionGroupId('');
      }
    };

    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [openTourActionGroupId]);

  useEffect(() => {
    dispatch(fetchVehicles());
  }, [dispatch, refreshKey]);

  const reloadTourBookings = useCallback(async ({ silent = false } = {}) => {
    if (!silent) {
      setBookingsLoading(true);
    }

    try {
      const data = await fetchTourBookings();
      setBookings(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Failed to load tour bookings:', error);
      if (!silent) {
        toast.error('Could not load tour bookings');
      }
      setBookings([]);
    } finally {
      setBookingsLoading(false);
    }
  }, []);

  const reloadTrackedTours = useCallback(async () => {
    try {
      const data = await fetchRecentTrackedTours();
      setTrackedTours(Array.isArray(data) ? data : []);
    } catch (error) {
      console.warn('Failed to load tracked tours:', error);
      setTrackedTours([]);
    }
  }, []);

  useEffect(() => {
    const loadPackages = async () => {
      setPackagesLoading(true);
      try {
        const [{ data, error }, pricingData] = await Promise.all([
          fetchTourPackages(),
          fetchTourPackageModelPrices().catch((pricingError) => {
            console.warn('Tour pricing matrix unavailable while loading packages:', pricingError);
            return [];
          }),
        ]);

        setTourPricingRows(Array.isArray(pricingData) ? pricingData : []);

        if (error) {
          console.error('Failed to load tour packages:', error);
          toast.error('Could not load tour packages');
          setPackages([]);
        } else {
          setPackages((data || []).map(normalizePackage));
        }
      } catch (loadError) {
        console.error('Failed to load package board:', loadError);
        toast.error('Could not load package board');
        setPackages([]);
        setTourPricingRows([]);
      }
      setPackagesLoading(false);
    };

    const loadGuides = async () => {
      setGuidesLoading(true);
      try {
        const data = await getUsers();
        const normalized = (data || [])
          .filter((user) => user?.access_enabled !== false)
          .filter((user) => ['guide', 'employee', 'admin', 'owner'].includes(String(user.role || '').toLowerCase()))
          .map((user) => ({
            id: user.id,
            name: user.full_name || user.name || user.email || 'Team Member',
            role: user.role || 'employee',
            phone: user.phone_number || '',
          }));

        if (normalized.length > 0) {
          setGuides(normalized);
        } else if (userProfile?.id) {
          setGuides([{
            id: String(userProfile.id),
            name: currentUserDisplayName,
            role: userRole || 'owner',
            phone: userProfile?.phone_number || '',
          }]);
        } else {
          setGuides([]);
        }
      } catch (error) {
        console.error('Failed to load guides:', error);
        if (userProfile?.id) {
          setGuides([{
            id: String(userProfile.id),
            name: currentUserDisplayName,
            role: userRole || 'owner',
            phone: userProfile?.phone_number || '',
          }]);
        } else {
          setGuides([]);
        }
      }
      setGuidesLoading(false);
    };

    const loadVehicleModels = async () => {
      try {
        const data = await VehicleModelPricingService.getActiveVehicleModels();
        setVehicleModels(Array.isArray(data) ? data : []);
      } catch (error) {
        console.warn('Failed to load vehicle models for tour pricing:', error);
        setVehicleModels([]);
      }
    };

    reloadTourBookings();
    reloadTrackedTours();
    loadPackages();
    loadGuides();
    loadVehicleModels();
  }, [refreshKey, reloadTourBookings, reloadTrackedTours]);

  useEffect(() => {
    const queueReload = () => {
      if (realtimeReloadTimerRef.current) {
        clearTimeout(realtimeReloadTimerRef.current);
      }

      realtimeReloadTimerRef.current = setTimeout(() => {
        reloadTourBookings({ silent: true });
      }, 250);
    };

    const bookingsChannel = supabase
      .channel('tours-bookings-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: TABLE_NAMES.TOUR_BOOKINGS,
        },
        queueReload
      )
      .subscribe();

    return () => {
      if (realtimeReloadTimerRef.current) {
        clearTimeout(realtimeReloadTimerRef.current);
      }
      supabase.removeChannel(bookingsChannel);
    };
  }, [reloadTourBookings]);

  useEffect(() => {
    const queueTrackedToursReload = () => {
      if (realtimeReloadTimerRef.current) {
        clearTimeout(realtimeReloadTimerRef.current);
      }

      realtimeReloadTimerRef.current = setTimeout(() => {
        reloadTrackedTours();
      }, 250);
    };

    const trackingChannel = supabase
      .channel('tours-tracking-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'app_687f658e98_activity_log',
          filter: 'resource_type=eq.tour_tracking',
        },
        queueTrackedToursReload
      )
      .subscribe();

    return () => {
      if (realtimeReloadTimerRef.current) {
        clearTimeout(realtimeReloadTimerRef.current);
      }
      supabase.removeChannel(trackingChannel);
    };
  }, [reloadTrackedTours]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      reloadTrackedTours();
    }, 4000);

    return () => window.clearInterval(interval);
  }, [reloadTrackedTours]);

  useEffect(() => {
    if (activeTab !== 'bookings') return;

    const refreshTourPricingRows = async () => {
      try {
        const pricingData = await fetchTourPackageModelPrices();
        setTourPricingRows(Array.isArray(pricingData) ? pricingData : []);
      } catch (error) {
        console.warn('Could not refresh tour pricing rows:', error);
      }
    };

    refreshTourPricingRows();
  }, [activeTab]);

  const vehicleModelsById = useMemo(
    () => new Map((vehicleModels || []).map((model) => [String(model.id), model])),
    [vehicleModels]
  );

  const currentPackage = useMemo(
    () => packages.find((pkg) => String(pkg.id) === String(bookingForm.packageId)) || null,
    [packages, bookingForm.packageId]
  );

  const getPackagePricingBadge = (pkg) => {
    const startingPrice = getTourPackageStartingPrice({
      rows: tourPricingRows,
      packageId: pkg?.id,
      durationHours: pkg?.duration,
    });

    if (startingPrice > 0) {
      return tr(`From ${startingPrice} MAD`, `À partir de ${startingPrice} MAD`);
    }

    return getLegacyPackagePricingBadge(pkg);
  };

  const getPackageModelPriceHighlights = useCallback((pkg) => {
    if (!pkg) return [];

    const pricedModels = (vehicleModels || [])
      .map((model) => {
        const price = getTourPriceForModelAndDuration({
          rows: tourPricingRows,
          packageId: pkg?.id,
          vehicleModelId: model.id,
          durationHours: pkg?.duration,
        });

        if (!(price > 0)) return null;

        return {
          modelId: String(model.id),
          label: getVehicleModelCatalogName(model),
          price,
        };
      })
      .filter(Boolean)
      .sort((left, right) => left.price - right.price || left.label.localeCompare(right.label));

    return pricedModels;
  }, [tourPricingRows, vehicleModels]);
  useEffect(() => {
    if (!bookingForm.packageId && packages.length > 0) {
      setBookingForm((prev) => ({ ...prev, packageId: packages[0].id }));
    }
  }, [packages, bookingForm.packageId]);

  useEffect(() => {
    if (!canSelectTourGuide) {
      if (bookingForm.guideId !== String(userProfile?.id || '')) {
        setBookingForm((prev) => ({ ...prev, guideId: String(userProfile?.id || '') }));
      }
      return;
    }

    if (!bookingForm.guideId && guides.length > 0) {
      setBookingForm((prev) => ({ ...prev, guideId: guides[0].id }));
    }
  }, [canSelectTourGuide, guides, bookingForm.guideId, userProfile?.id]);

  const allTourRows = useMemo(() => {
    return (Array.isArray(bookings) ? bookings : [])
      .map((row) => {
        const metadata = extractMarkedJson(row.notes, TOUR_BOOKING_MARKER);
        if (!metadata?.groupId) return null;
        return { ...row, tourMeta: metadata, plainNotes: stripMarkedJson(row.notes, TOUR_BOOKING_MARKER) };
      })
      .filter(Boolean);
  }, [bookings]);

  useEffect(() => {
    let cancelled = false;

    const reconcileStatuses = async () => {
      try {
        const result = await reconcileTourVehicleStatuses(allTourRows);
        if (cancelled) return;
        if ((result.released || 0) > 0 || (result.reserved || 0) > 0) {
          dispatch(fetchVehicles());
        }
      } catch (error) {
        if (!cancelled) {
          console.warn('Unable to reconcile live tour vehicle statuses:', error);
        }
      }
    };

    reconcileStatuses();

    return () => {
      cancelled = true;
    };
  }, [allTourRows, dispatch]);

  const groupedTours = useMemo(() => {
    const groups = new Map();

    allTourRows.forEach((row) => {
      const groupId = row.tourMeta.groupId;
      if (!groups.has(groupId)) {
        groups.set(groupId, []);
      }
      groups.get(groupId).push(row);
    });

    return Array.from(groups.entries())
      .map(([groupId, rows]) => {
        const sortedRows = [...rows].sort(
          (a, b) => new Date(a.rental_start_date || a.created_at).getTime() - new Date(b.rental_start_date || b.created_at).getTime()
        );
        const first = sortedRows[0];
        const meta = first.tourMeta || {};
        const statuses = sortedRows.map((row) => String(row.rental_status || row.status || 'scheduled').toLowerCase());
        const status = statuses.includes('active')
          ? 'active'
          : statuses.every((value) => value === 'completed')
            ? 'completed'
            : statuses.every((value) => value === 'cancelled')
              ? 'cancelled'
              : statuses.every((value) => value === 'no_show')
                ? 'no_show'
                : statuses.every((value) => value === 'expired')
                  ? 'expired'
                  : 'scheduled';

        const assignedVehicles = sortedRows.map((row) => row.vehicle).filter(Boolean);

        return {
          groupId,
          rowIds: sortedRows.map((row) => row.id),
          status,
          packageName: meta.packageName || 'Tour package',
          durationHours: Number(meta.durationHours || 1),
          routeType: meta.routeType || 'mountain',
          customerName: first.customer_name || meta.customerName || tr('Guest', 'Client'),
          customerPhone: first.phone || meta.customerPhone || '',
          customerEmail: first.customer_email || meta.customerEmail || '',
          guideName: meta.guideName || 'Unassigned',
          guideId: meta.guideId || '',
          quadCount: Number(meta.quadCount || sortedRows.length || 1),
          ridersCount: Number(meta.ridersCount || first.participants?.adults || sortedRows.length || 1),
          requiresLicense: Boolean(meta.requiresLicense),
          idCaptured: Boolean(meta.idCaptured),
          idNumber: meta.idNumber || '',
          licenseCaptured: Boolean(meta.licenseCaptured),
          licenseNumber: meta.licenseNumber || '',
          shareContract: Boolean(meta.shareContract),
          receiptIssued: Boolean(meta.receiptIssued),
          receiptIssuedAt: meta.receiptIssuedAt || '',
          startedAt: meta.startedAt || '',
          completedAt: meta.completedAt || '',
          trackingLinkSentAt: meta.trackingLinkSentAt || '',
          trackingLinkSentByName: meta.trackingLinkSentByName || '',
          trackingUrl: buildTourTrackingUrl(groupId),
          totalAmount: sortedRows.reduce((sum, row) => sum + Number(row.total_amount || 0), 0),
          scheduledStartAt: meta.scheduledStartAt || first.rental_start_date,
          scheduledEndAt: meta.scheduledEndAt || sortedRows[sortedRows.length - 1]?.rental_end_date,
          blockingStartAt: first.rental_start_date,
          blockingEndAt: sortedRows[sortedRows.length - 1]?.rental_end_date,
          bookedByName: meta.bookedByName || 'Staff',
          notes: first.plainNotes || '',
          assignedVehicles,
          assignmentMode: meta.assignmentMode || (assignedVehicles.length > 0 ? 'assigned_now' : 'assign_on_arrival'),
          assignedVehicleIds: meta.assignedVehicleIds || assignedVehicles.map((vehicle) => vehicle.id),
          selectedModelMix: Array.isArray(meta.selectedModelMix) ? meta.selectedModelMix : [],
          primaryDrivers: Array.isArray(meta.primaryDrivers) ? meta.primaryDrivers : [],
          secondaryDrivers: Array.isArray(meta.secondaryDrivers) ? meta.secondaryDrivers : [],
          departureEntries: Array.isArray(meta.departureEntries) ? meta.departureEntries : [],
          returnEntries: Array.isArray(meta.returnEntries) ? meta.returnEntries : [],
          createdAt: meta.createdAt || first.created_at || '',
          completedByName: meta.completedByName || '',
          startedByName: meta.startedByName || '',
          cancelledAt: meta.cancelledAt || '',
          cancelledByName: meta.cancelledByName || '',
          noShowAt: meta.noShowAt || '',
          noShowByName: meta.noShowByName || '',
          expiredAt: meta.expiredAt || '',
          expiredByName: meta.expiredByName || '',
          bookingStartWithinHour: startsWithinOneHour(meta.scheduledStartAt || first.rental_start_date),
        };
      })
      .sort((a, b) => new Date(a.scheduledStartAt).getTime() - new Date(b.scheduledStartAt).getTime());
  }, [allTourRows]);

  const activeBlockingRows = useMemo(() => {
    return (Array.isArray(bookings) ? bookings : []).filter((row) => {
      const status = String(row.rental_status || row.status || '').toLowerCase();
      return !CLOSED_TOUR_STATUSES.includes(status);
    });
  }, [bookings]);

  const availabilitySnapshot = useMemo(() => {
    if (!currentPackage) {
      return {
        availableVehicles: [],
        availableCapacity: 0,
        capacityReservations: 0,
      };
    }

    const start = new Date(`${bookingForm.date}T${bookingForm.time}:00`);
    if (Number.isNaN(start.getTime())) {
      return {
        availableVehicles: [],
        availableCapacity: 0,
        capacityReservations: 0,
      };
    }
    const blockingStart = new Date(start.getTime() - currentPackage.bufferBeforeMinutes * 60 * 1000);
    const scheduledEnd = new Date(start.getTime() + Number(currentPackage.duration || 1) * 60 * 60 * 1000);
    const blockingEnd = new Date(scheduledEnd.getTime() + currentPackage.bufferAfterMinutes * 60 * 1000);

    const eligibleVehicles = (Array.isArray(vehicles) ? vehicles : [])
      .filter((vehicle) => vehicle?.is_active !== false)
      .filter((vehicle) => !['maintenance', 'in_maintenance', 'out_of_service', 'sold'].includes(String(vehicle.status || '').toLowerCase()))
      .sort((a, b) => String(a.plate_number || '').localeCompare(String(b.plate_number || '')));

    const overlappingRows = activeBlockingRows.filter((row) =>
      overlapsWindow(row.rental_start_date || row.created_at, row.rental_end_date || row.updated_at || row.created_at, blockingStart, blockingEnd)
    );

    const specificallyBlockedVehicleIds = new Set(
      overlappingRows.map((row) => row.vehicle_id).filter(Boolean).map(String)
    );

    const capacityReservations = overlappingRows.filter((row) => !row.vehicle_id).length;
    const availableVehicles = eligibleVehicles.filter((vehicle) => !specificallyBlockedVehicleIds.has(String(vehicle.id)));
    const availableCapacity = Math.max(0, availableVehicles.length - capacityReservations);

    return {
      availableVehicles,
      availableCapacity,
      capacityReservations,
    };
  }, [vehicles, activeBlockingRows, currentPackage, bookingForm.date, bookingForm.time]);

  const availableVehicles = availabilitySnapshot.availableVehicles;
  const pricedModelIdsForCurrentPackage = useMemo(() => {
    const durationKey = Number(currentPackage?.duration || 0);
    if (!durationKey) return new Set();

    return new Set(
      (tourPricingRows || [])
        .filter((row) => {
          const rowDuration = Number(row.duration_hours || 0);
          if (rowDuration !== durationKey) return false;
          const rowPackageId = String(row.package_id || '');
          return rowPackageId === String(currentPackage?.id || '') || rowPackageId === GLOBAL_TOUR_PRICING_KEY;
        })
        .map((row) => String(row.vehicle_model_id || ''))
        .filter(Boolean)
    );
  }, [tourPricingRows, currentPackage]);

  const availableModelGroups = useMemo(() => {
    const grouped = new Map();

    availableVehicles.forEach((vehicle) => {
      const modelId = getVehicleModelId(vehicle);
      if (!modelId) return;
      if (pricedModelIdsForCurrentPackage.size > 0 && !pricedModelIdsForCurrentPackage.has(String(modelId))) return;
      if (!grouped.has(modelId)) {
        grouped.set(modelId, {
          modelId,
          label: getVehicleModelName(vehicle, vehicleModelsById),
          availableCount: 0,
          vehicles: [],
        });
      }
      const current = grouped.get(modelId);
      current.availableCount += 1;
      current.vehicles.push(vehicle);
    });

    return Array.from(grouped.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [availableVehicles, vehicleModelsById, pricedModelIdsForCurrentPackage]);

  const displayModelGroups = useMemo(() => {
    const hasDepartureSelection = Boolean(bookingForm.date && bookingForm.time);
    if (hasDepartureSelection) {
      return availableModelGroups;
    }

    const grouped = new Map();

    (vehicleModels || []).forEach((model) => {
      const modelId = String(model.id || '');
      if (!modelId) return;
      if (pricedModelIdsForCurrentPackage.size > 0 && !pricedModelIdsForCurrentPackage.has(modelId)) return;
      grouped.set(modelId, {
        modelId,
        label: getVehicleModelCatalogName(model),
        availableCount: 0,
        vehicles: [],
      });
    });

    availableModelGroups.forEach((group) => {
      grouped.set(String(group.modelId), {
        ...group,
      });
    });

    return Array.from(grouped.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [vehicleModels, availableModelGroups, pricedModelIdsForCurrentPackage, bookingForm.date, bookingForm.time]);

  useEffect(() => {
    setBookingForm((prev) => {
      const normalized = normalizeSelectedModelCounts(prev.selectedModelCounts, displayModelGroups, prev.quadCount);
      const currentSerialized = JSON.stringify(prev.selectedModelCounts || {});
      const nextSerialized = JSON.stringify(normalized);
      if (currentSerialized === nextSerialized) return prev;
      return {
        ...prev,
        selectedModelCounts: normalized,
      };
    });
  }, [displayModelGroups, bookingForm.quadCount]);

  const selectedModelMix = useMemo(
    () =>
      displayModelGroups
        .map((group) => ({
          modelId: group.modelId,
          label: group.label,
          count: Number(bookingForm.selectedModelCounts?.[group.modelId] || 0),
          availableCount: group.availableCount,
        }))
        .filter((group) => group.count > 0),
    [displayModelGroups, bookingForm.selectedModelCounts]
  );

  const selectedModelCount = useMemo(
    () => countSelectedModels(bookingForm.selectedModelCounts),
    [bookingForm.selectedModelCounts]
  );

  const bookingPricingLines = useMemo(
    () =>
      selectedModelMix.map((item) => {
        const unitPrice = getTourPriceForModelAndDuration({
          rows: tourPricingRows,
          packageId: currentPackage?.id,
          vehicleModelId: item.modelId,
          durationHours: currentPackage?.duration,
        });

        return {
          ...item,
          unitPrice,
          lineTotal: unitPrice * Number(item.count || 0),
        };
      }),
    [selectedModelMix, tourPricingRows, currentPackage]
  );

  const missingModelPricing = useMemo(
    () => bookingPricingLines.filter((line) => line.unitPrice <= 0),
    [bookingPricingLines]
  );

  const calculatedTourTotal = useMemo(
    () => bookingPricingLines.reduce((sum, line) => sum + Number(line.lineTotal || 0), 0),
    [bookingPricingLines]
  );
  const shouldAssignVehiclesNow = useMemo(() => startsWithinOneHour(`${bookingForm.date}T${bookingForm.time}:00`), [bookingForm.date, bookingForm.time]);

  const assignedVehiclesPreview = useMemo(() => {
    if (!shouldAssignVehiclesNow) return [];
    return buildVehiclesForModelMix(availableVehicles, selectedModelMix).selectedVehicles;
  }, [availableVehicles, selectedModelMix, shouldAssignVehiclesNow]);
  const primaryDrivers = useMemo(
    () => syncDriverSlots(bookingForm.primaryDrivers, bookingForm.quadCount),
    [bookingForm.primaryDrivers, bookingForm.quadCount]
  );
  const secondaryDrivers = useMemo(
    () => syncDriverSlots(bookingForm.secondaryDrivers, bookingForm.quadCount),
    [bookingForm.secondaryDrivers, bookingForm.quadCount]
  );
  const activePrimaryDriver = primaryDrivers[activeDriverQuadIndex] || createEmptyDriver();
  const activeSecondaryDriver = secondaryDrivers[activeDriverQuadIndex] || createEmptyDriver();
  const activePrimaryDriverSearchTerm = String(activePrimaryDriver.fullName || '').trim();

  useEffect(() => {
    if (bookingStep !== 2) {
      setCustomerSuggestions([]);
      setCustomerSuggestionsLoading(false);
      return undefined;
    }

    if (activePrimaryDriverSearchTerm.length < 3) {
      setCustomerSuggestions([]);
      setCustomerSuggestionsLoading(false);
      return undefined;
    }

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        setCustomerSuggestionsLoading(true);
        const matches = await searchCustomerRecords(activePrimaryDriverSearchTerm);
        if (!cancelled) {
          setCustomerSuggestions(Array.isArray(matches) ? matches.slice(0, 6) : []);
        }
      } catch (error) {
        if (!cancelled) {
          console.warn('Customer search failed for tour booking:', error);
          setCustomerSuggestions([]);
        }
      } finally {
        if (!cancelled) {
          setCustomerSuggestionsLoading(false);
        }
      }
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [bookingStep, activeDriverQuadIndex, activePrimaryDriverSearchTerm]);
  const secondDriverOpen =
    secondDriverOpenByQuad[activeDriverQuadIndex] ?? hasAnyDriverValue(activeSecondaryDriver);

  useEffect(() => {
    if (activeDriverQuadIndex > Math.max(0, Number(bookingForm.quadCount || 1) - 1)) {
      setActiveDriverQuadIndex(0);
    }
  }, [activeDriverQuadIndex, bookingForm.quadCount]);

  const activeTours = useMemo(
    () => groupedTours
      .filter((tour) => tour.status === 'active')
      .sort((a, b) => new Date(a.startedAt || a.scheduledStartAt).getTime() - new Date(b.startedAt || b.scheduledStartAt).getTime()),
    [groupedTours]
  );
  const hasTrackedTours = useMemo(() => {
    const activeTourIds = new Set(activeTours.map((tour) => String(tour.groupId)));
    return trackedTours.some((tour) => activeTourIds.has(String(tour.groupId)));
  }, [activeTours, trackedTours]);
  const trackedTourIds = useMemo(
    () => new Set(trackedTours.map((tour) => String(tour.groupId))),
    [trackedTours]
  );
  const fleetStats = useMemo(() => {
    const activeVehicleIds = new Set(
      activeTours.flatMap((t) => t.assignedVehicles.map((v) => String(v.id)))
    );
    const reserved = activeVehicleIds.size;
    const freeNow = vehicles.filter((v) => !activeVehicleIds.has(String(v.id))).length;
    return { total: vehicles.length, freeNow, reserved };
  }, [vehicles, activeTours]);

  const scheduledTours = useMemo(
    () => groupedTours
      .filter((tour) => tour.status === 'scheduled')
      .sort((a, b) => new Date(a.scheduledStartAt).getTime() - new Date(b.scheduledStartAt).getTime()),
    [groupedTours]
  );
  const today = localToday();
  const upcomingTours = useMemo(
    () => scheduledTours.filter((tour) => {
      const startTimestamp = new Date(tour.scheduledStartAt || '').getTime();
      return Number.isFinite(startTimestamp) && startTimestamp >= Date.now();
    }),
    [scheduledTours]
  );
  const todayTours = useMemo(() => {
    const activeToday = activeTours.filter((tour) => getLocalDateKey(tour.startedAt || tour.scheduledStartAt) === today);
    const scheduledToday = scheduledTours.filter((tour) => getLocalDateKey(tour.scheduledStartAt) === today);
    return [...activeToday, ...scheduledToday];
  }, [activeTours, scheduledTours, today]);
  const completedTours = useMemo(
    () => groupedTours
      .filter((tour) => tour.status === 'completed')
      .sort((a, b) => new Date(b.completedAt || b.scheduledEndAt || b.scheduledStartAt).getTime() - new Date(a.completedAt || a.scheduledEndAt || a.scheduledStartAt).getTime()),
    [groupedTours]
  );
  const cancelledTours = useMemo(
    () => groupedTours
      .filter((tour) => tour.status === 'cancelled')
      .sort((a, b) => new Date(b.scheduledStartAt).getTime() - new Date(a.scheduledStartAt).getTime()),
    [groupedTours]
  );
  const noShowTours = useMemo(
    () => groupedTours
      .filter((tour) => tour.status === 'no_show')
      .sort((a, b) => new Date(b.noShowAt || b.scheduledStartAt).getTime() - new Date(a.noShowAt || a.scheduledStartAt).getTime()),
    [groupedTours]
  );
  const expiredTours = useMemo(
    () => groupedTours
      .filter((tour) => tour.status === 'expired')
      .sort((a, b) => new Date(b.expiredAt || b.scheduledStartAt).getTime() - new Date(a.expiredAt || a.scheduledStartAt).getTime()),
    [groupedTours]
  );
  const operationalTours = useMemo(() => [...activeTours, ...scheduledTours], [activeTours, scheduledTours]);
  const operationalPageSize = 4;
  const operationalPageCount = Math.max(1, Math.ceil(operationalTours.length / operationalPageSize));
  const completedHistoryTours = useMemo(
    () => [...completedTours, ...cancelledTours, ...noShowTours, ...expiredTours],
    [completedTours, cancelledTours, noShowTours, expiredTours]
  );
  const completedPageCount = Math.max(1, Math.ceil(completedHistoryTours.length / completedPageSize));
  const paginatedOperationalTours = useMemo(
    () => operationalTours.slice((schedulePage - 1) * operationalPageSize, schedulePage * operationalPageSize),
    [operationalTours, schedulePage]
  );
  const paginatedCompletedTours = useMemo(
    () => completedHistoryTours.slice((completedPage - 1) * completedPageSize, completedPage * completedPageSize),
    [completedHistoryTours, completedPage]
  );

  useEffect(() => {
    if (schedulePage > operationalPageCount) {
      setSchedulePage(operationalPageCount);
    }
  }, [schedulePage, operationalPageCount]);

  useEffect(() => {
    if (completedPage > completedPageCount) {
      setCompletedPage(completedPageCount);
    }
  }, [completedPage, completedPageCount]);

  useEffect(() => {
    setCompletedPage(1);
  }, [completedPageSize]);

  const overviewStats = useMemo(() => {
    return {
      packages: packages.length,
      upcoming: upcomingTours.length,
      today: todayTours.length,
      blockedQuads: todayTours.reduce((sum, tour) => sum + Number(tour.quadCount || 0), 0),
    };
  }, [packages.length, upcomingTours.length, todayTours]);

  const updateBookingForm = (field, value) => {
    setBookingForm((prev) => {
      const next = {
        ...prev,
        [field]: value,
      };

      if (field === 'quadCount') {
        const maxRiders = Math.max(1, Number(value || 1) * 2);
        next.ridersCount = Math.min(Number(prev.ridersCount || 1), maxRiders);
        next.primaryDrivers = syncDriverSlots(prev.primaryDrivers, value);
        next.secondaryDrivers = syncDriverSlots(prev.secondaryDrivers, value);
      }

      if (field === 'date' && prev.time) {
        const selectedDT = new Date(`${value}T${prev.time}:00`);
        if (selectedDT < new Date()) {
          next.time = '';
        }
      }

      return next;
    });
  };

  const updatePrimaryDriver = (index, field, value) => {
    setBookingForm((prev) => ({
      ...prev,
      primaryDrivers: syncDriverSlots(prev.primaryDrivers, prev.quadCount).map((driver, driverIndex) =>
        driverIndex === index
          ? {
              ...driver,
              ...(field === 'fullName' ? { customerId: '' } : {}),
              [field]: field === 'whatsapp' ? formatWhatsAppPhoneNumber(value) : value,
            }
          : driver
      ),
    }));
  };

  const updateSecondaryDriver = (index, field, value) => {
    setBookingForm((prev) => ({
      ...prev,
      secondaryDrivers: syncDriverSlots(prev.secondaryDrivers, prev.quadCount).map((driver, driverIndex) =>
        driverIndex === index
          ? { ...driver, [field]: field === 'whatsapp' ? formatWhatsAppPhoneNumber(value) : value }
          : driver
      ),
    }));
  };

  const applyCustomerToPrimaryDriver = (index, customer) => {
    const resolvedName =
      customer?.full_name ||
      customer?.customer_name ||
      customer?.name ||
      '';
    const resolvedWhatsApp =
      customer?.phone ||
      customer?.customer_phone ||
      customer?.phone_number ||
      '';
    const resolvedEmail =
      customer?.email ||
      customer?.customer_email ||
      '';
    const resolvedLicense =
      customer?.licence_number ||
      customer?.license_number ||
      customer?.customer_licence_number ||
      '';
    const resolvedIdNumber =
      customer?.id_number ||
      customer?.customer_id_number ||
      customer?.document_number ||
      '';

    setBookingForm((prev) => ({
      ...prev,
      primaryDrivers: syncDriverSlots(prev.primaryDrivers, prev.quadCount).map((driver, driverIndex) =>
        driverIndex === index
          ? {
              ...driver,
              customerId: String(customer?.id || ''),
              fullName: String(resolvedName || '').trim(),
              whatsapp: formatWhatsAppPhoneNumber(String(resolvedWhatsApp || '').trim()),
              email: String(resolvedEmail || '').trim(),
              licenseNumber: String(resolvedLicense || '').trim(),
              idNumber: String(resolvedIdNumber || '').trim(),
              nationality: customer?.nationality || driver.nationality || '',
              dateOfBirth: customer?.customer_dob || driver.dateOfBirth || '',
            }
          : driver
      ),
    }));
    setCustomerSuggestions([]);
  };

  const clearPrimaryDriverScan = (index) => {
    setBookingForm((prev) => ({
      ...prev,
      primaryDrivers: syncDriverSlots(prev.primaryDrivers, prev.quadCount).map((driver, driverIndex) =>
        driverIndex === index
          ? { ...driver, idFile: null, idFileName: '', idFileUrl: '' }
          : driver
      ),
    }));
  };

  const clearSecondaryDriverScan = (index) => {
    setBookingForm((prev) => ({
      ...prev,
      secondaryDrivers: syncDriverSlots(prev.secondaryDrivers, prev.quadCount).map((driver, driverIndex) =>
        driverIndex === index
          ? { ...driver, idFile: null, idFileName: '', idFileUrl: '' }
          : driver
      ),
    }));
  };

  const resetBookingFlow = () => {
    setBookingStep(1);
    setGuestIDScanOpen(false);
    setDriverIDScanTarget(null);
    setActiveDriverQuadIndex(0);
    setBookingForm((prev) => ({
      ...createInitialBookingForm(),
      packageId: packages[0]?.id || '',
      guideId: guides[0]?.id || '',
      date: prev.date || localToday(),
    }));
  };

  const handleGuestIDScanComplete = (scannedData, imageFile) => {
    if (scannedData.ocrSkipped) {
      setGuestIDScanOpen(false);
      toast.success(tr("Image de la pièce enregistrée. Vous pouvez saisir les informations du client manuellement.", "Image de la pièce enregistrée. Vous pouvez saisir les informations du client manuellement."));
      return;
    }

    if (scannedData.ocrUnavailable) {
      toast(tr("Image de la pièce capturée. L'OCR est indisponible, veuillez saisir le nom et le numéro de pièce manuellement.", "Image de la pièce capturée. L'OCR est indisponible, veuillez saisir le nom et le numéro de pièce manuellement."), {
        icon: '⚠️',
      });
      return;
    }

    const savedImageUrl =
      scannedData.publicUrl ||
      scannedData.imageUrl ||
      scannedData.id_scan_url ||
      '';
    const scannedName =
      scannedData.customer_name ||
      scannedData.fullName ||
      scannedData.full_name ||
      scannedData.name ||
      scannedData.raw_name ||
      '';
    const scannedPhone =
      scannedData.customer_phone ||
      scannedData.phone ||
      '';
    const scannedEmail =
      scannedData.customer_email ||
      scannedData.email ||
      '';
    const scannedIdNumber =
      scannedData.customer_id_number ||
      scannedData.idNumber ||
      scannedData.id_number ||
      scannedData.document_number ||
      scannedData.linked_display_id ||
      '';
    const scannedLicenseNumber =
      scannedData.customer_licence_number ||
      scannedData.driver_license_number ||
      scannedData.licenseNumber ||
      scannedData.license_number ||
      scannedData.document_number ||
      scannedData.idNumber ||
      scannedData.id_number ||
      scannedData.permit_number ||
      '';

    updatePrimaryDriver(0, 'fullName', String(scannedName || '').trim());
    updatePrimaryDriver(0, 'whatsapp', String(scannedPhone || '').trim());
    updatePrimaryDriver(0, 'email', String(scannedEmail || '').trim());
    updatePrimaryDriver(0, 'licenseNumber', String(scannedLicenseNumber || '').trim());
    updatePrimaryDriver(0, 'idNumber', scannedLicenseNumber ? '' : String(scannedIdNumber || '').trim());
    updatePrimaryDriver(0, 'dateOfBirth', scannedData.date_of_birth || scannedData.dateOfBirth || '');
    updatePrimaryDriver(0, 'nationality', scannedData.nationality || '');
    updatePrimaryDriver(0, 'placeOfBirth', scannedData.place_of_birth || scannedData.placeOfBirth || '');
    updatePrimaryDriver(0, 'issueDate', scannedData.issue_date || scannedData.issueDate || '');
    updatePrimaryDriver(0, 'idFile', imageFile || null);
    updatePrimaryDriver(0, 'idFileName', imageFile?.name || '');
    updatePrimaryDriver(0, 'idFileUrl', String(savedImageUrl || '').trim());

    setGuestIDScanOpen(false);
    toast.success(tr("Pièce du client scannée. Vérifiez les champs puis continuez.", "Pièce du client scannée. Vérifiez les champs puis continuez."));
  };

  const handleDriverIDScanComplete = (scannedData, imageFile) => {
    if (!driverIDScanTarget) return;

    const updater = driverIDScanTarget.type === 'primary' ? updatePrimaryDriver : updateSecondaryDriver;
    const savedImageUrl =
      scannedData.publicUrl ||
      scannedData.imageUrl ||
      scannedData.id_scan_url ||
      '';

    updater(driverIDScanTarget.index, 'idFile', imageFile || null);
    updater(driverIDScanTarget.index, 'idFileName', imageFile?.name || '');
    updater(driverIDScanTarget.index, 'idFileUrl', String(savedImageUrl || '').trim());

    if (scannedData.ocrSkipped) {
      setDriverIDScanTarget(null);
      toast.success(tr("Image de la pièce enregistrée. Remplissez les champs manuellement si nécessaire.", "Image de la pièce enregistrée. Remplissez les champs manuellement si nécessaire."));
      return;
    }

    const scannedName =
      scannedData.customer_name ||
      scannedData.fullName ||
      scannedData.full_name ||
      scannedData.name ||
      scannedData.raw_name ||
      '';

    const scannedIdNumber =
      scannedData.customer_id_number ||
      scannedData.idNumber ||
      scannedData.id_number ||
      scannedData.document_number ||
      scannedData.linked_display_id ||
      '';
    const scannedLicenseNumber =
      scannedData.driver_license_number ||
      scannedData.licenseNumber ||
      scannedData.license_number ||
      scannedData.document_number ||
      scannedData.idNumber ||
      scannedData.id_number ||
      scannedData.permit_number ||
      '';

    updater(driverIDScanTarget.index, 'fullName', String(scannedName || '').trim());
    updater(driverIDScanTarget.index, 'whatsapp', String(scannedData.customer_phone || scannedData.phone || '').trim());
    updater(driverIDScanTarget.index, 'email', String(scannedData.customer_email || scannedData.email || '').trim());
    updater(driverIDScanTarget.index, 'licenseNumber', String(scannedLicenseNumber || '').trim());
    updater(driverIDScanTarget.index, 'idNumber', scannedLicenseNumber ? '' : String(scannedIdNumber || '').trim());
    updater(driverIDScanTarget.index, 'dateOfBirth', scannedData.date_of_birth || scannedData.dateOfBirth || '');
    updater(driverIDScanTarget.index, 'nationality', scannedData.nationality || '');
    updater(driverIDScanTarget.index, 'placeOfBirth', scannedData.place_of_birth || scannedData.placeOfBirth || '');
    updater(driverIDScanTarget.index, 'issueDate', scannedData.issue_date || scannedData.issueDate || '');

    if (scannedData.ocrUnavailable) {
      toast(tr("Image de la pièce capturée. L'OCR est indisponible, veuillez saisir le nom et le permis manuellement.", "Image de la pièce capturée. L'OCR est indisponible, veuillez saisir le nom et le permis manuellement."), {
        icon: '⚠️',
      });
      return;
    }

    setDriverIDScanTarget(null);
    toast.success(tr("Pièce du conducteur scannée. Vérifiez les champs puis continuez.", "Pièce du conducteur scannée. Vérifiez les champs puis continuez."));
  };

  const handleOpenTourReturnModal = (tour) => {
    if (!tour?.assignedVehicles?.length) {
      toast.error(tr('Assign the tour vehicles before completing the return', 'Attribuez les véhicules du tour avant de finaliser le retour'));
      return;
    }

    setTourToComplete(tour);
    const departureMap = new Map(
      (tour.departureEntries || []).map((entry) => [String(entry.vehicleId), entry])
    );
    setTourReturnEntries(
      tour.assignedVehicles.map((vehicle) => createInitialReturnEntry(vehicle, departureMap.get(String(vehicle.id))))
    );
    setTourReturnModalOpen(true);
  };

  const updateTourDepartureEntry = (vehicleId, field, value) => {
    setTourDepartureEntries((current) => current.map((entry) => (
      entry.vehicleId === vehicleId
        ? { ...entry, [field]: value }
        : entry
    )));
  };

  const resolveVehiclesForTourDeparture = (tour) => {
    const needsAssignment = (tour.assignedVehicles?.length || 0) < Number(tour.quadCount || 0);

    if (!needsAssignment) {
      return {
        needsAssignment: false,
        vehicles: tour.assignedVehicles || [],
      };
    }

    const assignableVehicles = getAssignableVehiclesForTour(tour);
    const requestedModelMix = Array.isArray(tour.selectedModelMix) ? tour.selectedModelMix : [];
    const modelBasedSelection = requestedModelMix.length > 0
      ? buildVehiclesForModelMix(assignableVehicles, requestedModelMix)
      : { selectedVehicles: assignableVehicles.slice(0, Number(tour.quadCount || 1)), missingModels: [] };

    if (modelBasedSelection.missingModels?.length > 0) {
      return {
        error: tr(`Not enough free quads for ${modelBasedSelection.missingModels[0].label}`, `Pas assez de quads libres pour ${modelBasedSelection.missingModels[0].label}`),
      };
    }

    const availableNow = modelBasedSelection.selectedVehicles;
    if (availableNow.length < Number(tour.quadCount || 1)) {
      return {
        error: tr('Not enough free quads to start this tour right now', 'Pas assez de quads libres pour démarrer ce tour maintenant'),
      };
    }

    return {
      needsAssignment: true,
      vehicles: availableNow,
    };
  };

  const handleOpenTourStartModal = async (tour) => {
    try {
      if (tour.requiresLicense && !tour.licenseCaptured) {
        toast.error(tr('Driver license scan is required before departure', 'Le scan du permis conducteur est requis avant le départ'));
        return;
      }

      const departureSetup = resolveVehiclesForTourDeparture(tour);
      if (departureSetup.error) {
        toast.error(departureSetup.error);
        return;
      }

      const departureEntries = await Promise.all(
        (departureSetup.vehicles || []).map(async (vehicle) => {
          const fuelState = await FuelTransactionService.getVehicleFuelState(vehicle.id);
          return createInitialDepartureEntry(vehicle, fuelState);
        })
      );

      setTourToStart({
        ...tour,
        departureNeedsAssignment: Boolean(departureSetup.needsAssignment),
        departureVehicles: departureSetup.vehicles || [],
      });
      setTourDepartureEntries(departureEntries);
      setTourStartModalOpen(true);
    } catch (error) {
      console.error('Failed to prepare tour departure:', error);
      toast.error(tr(`Could not prepare departure check: ${error.message}`, `Impossible de préparer le contrôle de départ : ${error.message}`));
    }
  };

  const handleConfirmTourStart = async () => {
    if (!tourToStart) return;

    for (const entry of tourDepartureEntries) {
      const startOdometerValue = Number(entry.startOdometer);
      if (!Number.isFinite(startOdometerValue) || startOdometerValue <= 0) {
        toast.error(tr(`Enter a valid departure odometer for ${entry.vehicleName}`, `Saisissez un odomètre de départ valide pour ${entry.vehicleName}`));
        return;
      }

      if (entry.startFuelLevel === '' || entry.startFuelLevel === null || Number(entry.startFuelLevel) < 0 || Number(entry.startFuelLevel) > 8) {
        toast.error(tr(`Choose the departure fuel level for ${entry.vehicleName}`, `Choisissez le niveau de carburant de départ pour ${entry.vehicleName}`));
        return;
      }
    }

    setTourDepartureSaving(true);
    try {
      const vehiclesForDeparture = tourToStart.departureVehicles || tourToStart.assignedVehicles || [];
      const startedAt = new Date().toISOString();

      if (tourToStart.departureNeedsAssignment) {
        await assignTourVehicles(tourToStart.rowIds, vehiclesForDeparture.map((vehicle) => vehicle.id), 'active');
      }

      await updateTourMetadata(tourToStart, {
        trackingUrl: buildTourTrackingUrl(tourToStart.groupId),
        assignedVehicleIds: vehiclesForDeparture.map((vehicle) => vehicle.id),
        assignedVehiclePlates: vehiclesForDeparture.map((vehicle) => vehicle.plate_number),
        assignmentMode: 'assigned_now',
        startedAt,
        startedByUserId: userProfile?.id || null,
        startedByName: userProfile?.full_name || userProfile?.fullName || userProfile?.name || userProfile?.email || 'Team Member',
        departureEntries: tourDepartureEntries.map((entry) => ({
          vehicleId: entry.vehicleId,
          vehicleName: entry.vehicleName,
          startOdometer: Number(entry.startOdometer),
          sourceFuelLevel: entry.sourceFuelLevel !== null && entry.sourceFuelLevel !== undefined && entry.sourceFuelLevel !== ''
            ? Number(entry.sourceFuelLevel)
            : null,
          startFuelLevel: Number(entry.startFuelLevel),
          startedAt,
        })),
      }, 'active');
      await upsertTourDepartureSnapshots(tourToStart, vehiclesForDeparture, tourDepartureEntries, startedAt);

      await logTourActivity(
        tourToStart,
        'tour_started',
        tourToStart.departureNeedsAssignment
          ? tr(`Tour started and ${vehiclesForDeparture.length} quad(s) were assigned.`, `Tour démarré et ${vehiclesForDeparture.length} quad(s) ont été attribués.`)
          : tr(`Tour started with ${vehiclesForDeparture.length} assigned quad(s).`, `Tour démarré avec ${vehiclesForDeparture.length} quad(s) attribués.`),
        {
          assigned_vehicle_ids: vehiclesForDeparture.map((vehicle) => vehicle.id),
          started_at: startedAt,
          departure_entries: tourDepartureEntries.map((entry) => ({
            vehicle_id: entry.vehicleId,
            start_odometer: Number(entry.startOdometer),
            source_fuel_level: entry.sourceFuelLevel !== null && entry.sourceFuelLevel !== undefined && entry.sourceFuelLevel !== ''
              ? Number(entry.sourceFuelLevel)
              : null,
            start_fuel_level: Number(entry.startFuelLevel),
          })),
        }
      );

      setTourStartModalOpen(false);
      setTourToStart(null);
      setTourDepartureEntries([]);
      toast.success(tourToStart.departureNeedsAssignment
        ? tr('Tour started and departure checks saved', 'Tour démarré et contrôles de départ enregistrés')
        : tr('Tour started with departure checks saved', 'Tour démarré avec les contrôles de départ enregistrés'));
      setRefreshKey((prev) => prev + 1);
    } catch (error) {
      console.error('Failed to start tour:', error);
      toast.error(tr(`Could not start the tour: ${error.message}`, `Impossible de démarrer le tour : ${error.message}`));
    } finally {
      setTourDepartureSaving(false);
    }
  };

  const updateTourReturnEntry = (vehicleId, field, value) => {
    setTourReturnEntries((prev) =>
      prev.map((entry) =>
        entry.vehicleId === vehicleId
          ? { ...entry, [field]: value }
          : entry
      )
    );
  };

  const getCurrentMainTankAverageUnitCost = async () => {
    const normalizeWeightedAverage = (rows = []) => {
      const totals = rows.reduce(
        (acc, row) => {
          const liters = Number(row.liters_added || row.liters_taken || row.liters || row.linked_fuel_consumed_liters || 0);
          const totalCost =
            Number(row.total_cost || row.linked_fuel_expense_total || 0) ||
            (Number(row.unit_price || row.cost_per_liter || row.price_per_liter || row.linked_fuel_average_unit_cost || 0) * liters);

          if (liters > 0 && totalCost > 0) {
            acc.liters += liters;
            acc.cost += totalCost;
          }
          return acc;
        },
        { liters: 0, cost: 0 }
      );

      return totals.liters > 0 ? Math.round((totals.cost / totals.liters) * 100) / 100 : 0;
    };

    try {
      const rentalStyleAverage = Number(await FuelTransactionService.getCurrentTankAverageUnitCost());
      if (rentalStyleAverage > 0) {
        return Math.round(rentalStyleAverage * 100) / 100;
      }

      const { data: pricedTransfers, error: transferError } = await supabase
        .from('fuel_withdrawals')
        .select('liters_taken,total_cost,unit_price')
        .or('unit_price.gt.0,total_cost.gt.0')
        .order('withdrawal_date', { ascending: false })
        .limit(200);

      if (!transferError) {
        const transferAverage = normalizeWeightedAverage(pricedTransfers || []);
        if (transferAverage > 0) return transferAverage;
      }

      const { data: rentalSnapshots, error: snapshotError } = await supabase
        .from(TABLE_NAMES.RENTALS)
        .select('linked_fuel_consumed_liters,linked_fuel_average_unit_cost,linked_fuel_expense_total')
        .gt('linked_fuel_average_unit_cost', 0)
        .gt('linked_fuel_consumed_liters', 0)
        .order('linked_fuel_synced_at', { ascending: false })
        .limit(200);

      if (!snapshotError) {
        return normalizeWeightedAverage(rentalSnapshots || []);
      }

      return 0;
    } catch (error) {
      console.warn('Unable to compute main tank average fuel cost:', error);
      return 0;
    }
  };

  const upsertTourDepartureSnapshots = async (tour, vehiclesForDeparture, entries, startedAt) => {
    try {
      const averageUnitCost = await getCurrentMainTankAverageUnitCost();
      const rows = entries.map((entry) => {
        const vehicle = vehiclesForDeparture.find((item) => String(item.id) === String(entry.vehicleId));
        const startFuelLevel = Number(entry.startFuelLevel);
        return {
          tour_group_id: tour.groupId,
          booking_row_id: tour.rowIds?.[0] || null,
          vehicle_id: entry.vehicleId,
          plate_number_snapshot: vehicle?.plate_number || '',
          model_snapshot: vehicle?.model || '',
          start_odometer: Number(entry.startOdometer),
          start_fuel_level: startFuelLevel,
          start_fuel_liters: tourFuelLinesToLiters(startFuelLevel),
          source_fuel_level: entry.sourceFuelLevel !== null && entry.sourceFuelLevel !== undefined && entry.sourceFuelLevel !== ''
            ? Number(entry.sourceFuelLevel)
            : null,
          fuel_unit_cost_snapshot: averageUnitCost,
          started_at: startedAt,
          started_by: userProfile?.id || null,
          updated_at: new Date().toISOString(),
        };
      });

      const { error } = await supabase
        .from('tour_vehicle_snapshots')
        .upsert(rows, { onConflict: 'tour_group_id,vehicle_id' });

      if (error) {
        console.warn('Unable to save tour departure snapshots:', error);
      }
    } catch (error) {
      console.warn('Unable to save tour departure snapshots:', error);
    }
  };

  const updateTourReturnSnapshots = async (tour, entries, returnedAt) => {
    try {
      const fallbackUnitCost = await getCurrentMainTankAverageUnitCost();

      await Promise.all(entries.map(async (entry) => {
        const startFuelLevel = entry.startFuelLevel !== null && entry.startFuelLevel !== undefined && entry.startFuelLevel !== ''
          ? Number(entry.startFuelLevel)
          : null;
        const endFuelLevel = Number(entry.fuelLevel);
        const startLiters = startFuelLevel !== null ? tourFuelLinesToLiters(startFuelLevel) : null;
        const endLiters = tourFuelLinesToLiters(endFuelLevel);
        const consumedLiters = startLiters !== null ? Math.max(0, startLiters - endLiters) : 0;
        const surplusLiters = startLiters !== null ? Math.max(0, endLiters - startLiters) : 0;

        const { data: existingSnapshot } = await supabase
          .from('tour_vehicle_snapshots')
          .select('fuel_unit_cost_snapshot')
          .eq('tour_group_id', tour.groupId)
          .eq('vehicle_id', entry.vehicleId)
          .maybeSingle();

        const unitCost = Number(existingSnapshot?.fuel_unit_cost_snapshot || fallbackUnitCost || 0);
        const payload = {
          tour_group_id: tour.groupId,
          booking_row_id: tour.rowIds?.[0] || null,
          vehicle_id: entry.vehicleId,
          start_odometer: Number(entry.startOdometer || 0) || null,
          start_fuel_level: startFuelLevel,
          start_fuel_liters: startLiters,
          end_odometer: Number(entry.endOdometer),
          end_fuel_level: endFuelLevel,
          end_fuel_liters: endLiters,
          fuel_consumed_liters: Math.round(consumedLiters * 1000) / 1000,
          fuel_surplus_liters: Math.round(surplusLiters * 1000) / 1000,
          fuel_unit_cost_snapshot: unitCost,
          fuel_expense_total: Math.round(consumedLiters * unitCost * 100) / 100,
          fuel_surplus_value: Math.round(surplusLiters * unitCost * 100) / 100,
          returned_at: returnedAt,
          returned_by: userProfile?.id || null,
          updated_at: new Date().toISOString(),
        };

        const { error } = await supabase
          .from('tour_vehicle_snapshots')
          .upsert(payload, { onConflict: 'tour_group_id,vehicle_id' });

        if (error) {
          console.warn('Unable to save tour return snapshot:', error);
        }
      }));
    } catch (error) {
      console.warn('Unable to update tour return snapshots:', error);
    }
  };

  const logTourReturnActivity = async (tour, entries) => {
    try {
      const actorName =
        userProfile?.full_name ||
        userProfile?.fullName ||
        userProfile?.name ||
        userProfile?.email ||
        'Team Member';

      const logs = entries.map((entry) => ({
        action: 'tour_return_recorded',
        user_email: userProfile?.email || actorName,
        details: {
          groupId: tour.groupId,
          package_name: tour.packageName,
          vehicle_id: entry.vehicleId,
          guide_name: tour.guideName,
          entered_by: actorName,
          end_odometer: Number(entry.endOdometer),
          fuel_level: Number(entry.fuelLevel),
          description: `Tour return recorded for ${entry.vehicleName}: odometer ${entry.endOdometer} km, fuel ${entry.fuelLevel}/8`,
        },
        created_at: new Date().toISOString(),
      }));

      const { error } = await supabase.from('app_687f658e98_activity_log').insert(logs);
      if (error) {
        console.warn('Unable to write tour return activity logs:', error);
      }
    } catch (error) {
      console.warn('Unable to write tour return activity logs:', error);
    }
  };

  const logTourActivity = async (tour, actionType, description, metadata = {}) => {
    try {
      const actorName =
        userProfile?.full_name ||
        userProfile?.fullName ||
        userProfile?.name ||
        userProfile?.email ||
        'Team Member';

      const { error } = await supabase.from('app_687f658e98_activity_log').insert({
        action: actionType,
        user_email: userProfile?.email || actorName,
        details: {
          groupId: tour.groupId,
          package_name: tour.packageName,
          guide_name: tour.guideName,
          description,
          ...metadata,
        },
        created_at: new Date().toISOString(),
      });

      if (error) {
        console.warn('Unable to write tour activity log:', error);
      }
    } catch (error) {
      console.warn('Unable to write tour activity log:', error);
    }
  };

  const loadTourActivityLogs = async (tour) => {
    if (!tour?.groupId) {
      setTourActivityLogs([]);
      return;
    }

    setTourActivityLoading(true);
    try {
      const { data, error } = await supabase
        .from('app_687f658e98_activity_log')
        .select('*')
        .filter('details->>groupId', 'eq', tour.groupId)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) {
        console.warn('Unable to load tour activity logs:', error);
        setTourActivityLogs([]);
      } else {
        setTourActivityLogs(Array.isArray(data) ? data : []);
      }
    } catch (error) {
      console.warn('Unable to load tour activity logs:', error);
      setTourActivityLogs([]);
    } finally {
      setTourActivityLoading(false);
    }
  };

  const openTourDetails = async (tour) => {
    setSelectedTourDetails(tour);
    setTourDetailsOpen(true);
    await loadTourActivityLogs(tour);
  };

  const closeTourDetails = () => {
    setTourDetailsOpen(false);
    setSelectedTourDetails(null);
    setTourActivityLogs([]);
    setTourActivityLoading(false);
  };

  const handleConfirmTourReturn = async () => {
    if (!tourToComplete) return;

    for (const entry of tourReturnEntries) {
      const endOdometerValue = Number(entry.endOdometer);
      if (!Number.isFinite(endOdometerValue) || endOdometerValue <= 0) {
        toast.error(`Enter a valid ending odometer for ${entry.vehicleName}`);
        return;
      }
      if (endOdometerValue < Number(entry.startOdometer || 0)) {
        toast.error(`Ending odometer cannot be less than current odometer for ${entry.vehicleName}`);
        return;
      }
      if (entry.fuelLevel === '' || entry.fuelLevel === null || Number(entry.fuelLevel) < 0 || Number(entry.fuelLevel) > 8) {
        toast.error(`Choose the return fuel level for ${entry.vehicleName}`);
        return;
      }
    }

    setTourReturnSaving(true);
    try {
      const completedAt = new Date().toISOString();
      const actor = {
        id: userProfile?.id || null,
        full_name: userProfile?.full_name || userProfile?.fullName || userProfile?.name || userProfile?.email || 'Team Member',
        email: userProfile?.email || null,
      };

      for (const entry of tourReturnEntries) {
        const endOdometerValue = Number(entry.endOdometer);
        const fuelLevelValue = Number(entry.fuelLevel);

        const { error: vehicleError } = await supabase
          .from('saharax_0u4w4d_vehicles')
          .update({
            current_odometer: endOdometerValue,
            updated_at: new Date().toISOString(),
          })
          .eq('id', entry.vehicleId);

        if (vehicleError) {
          throw vehicleError;
        }

        await FuelTransactionService.recordRentalFuelSnapshot({
          rentalId: tourToComplete.rowIds?.[0] || tourToComplete.groupId,
          vehicleId: entry.vehicleId,
          fuelLevel: fuelLevelValue,
          stage: 'rental_closing_level',
          actor,
          notes: `Tour return fuel recorded for ${tourToComplete.packageName}`,
        });
      }

      await updateTourMetadata(
        tourToComplete,
        {
          completedAt,
          completedByUserId: userProfile?.id || null,
          completedByName: userProfile?.full_name || userProfile?.fullName || userProfile?.name || userProfile?.email || 'Team Member',
          returnEntries: tourReturnEntries.map((entry) => ({
            vehicleId: entry.vehicleId,
            vehicleName: entry.vehicleName,
            startOdometer: Number(entry.startOdometer || 0),
            endOdometer: Number(entry.endOdometer),
            fuelLevel: Number(entry.fuelLevel),
          })),
          receiptIssued: false,
          receiptIssuedAt: '',
        },
        'completed'
      );
      await updateTourReturnSnapshots(tourToComplete, tourReturnEntries, completedAt);

      await logTourReturnActivity(tourToComplete, tourReturnEntries);
      await logTourActivity(
        tourToComplete,
        'tour_completed',
        tr(
          `Tour completed by ${tourToComplete.guideName || 'guide'} with ${tourReturnEntries.length} vehicle return checks recorded.`,
          `Tour terminé par ${tourToComplete.guideName || 'guide'} avec ${tourReturnEntries.length} contrôles de retour véhicule enregistrés.`
        ),
        {
          completed_by: actor.full_name,
          return_entries: tourReturnEntries.map((entry) => ({
            vehicle_id: entry.vehicleId,
            end_odometer: Number(entry.endOdometer),
            fuel_level: Number(entry.fuelLevel),
          })),
        }
      );

      setTourReturnModalOpen(false);
      setTourToComplete(null);
      setTourReturnEntries([]);
      toast.success(tr('Tour return recorded and completed successfully', 'Retour du tour enregistré et terminé avec succès'));
      setRefreshKey((prev) => prev + 1);
    } catch (error) {
      console.error('Failed to complete tour return:', error);
      toast.error(tr(`Could not complete the tour return: ${error.message}`, `Impossible de terminer le retour du tour : ${error.message}`));
    } finally {
      setTourReturnSaving(false);
    }
  };

  const handleUpdateTourStatus = async (tour, status) => {
    try {
      if (status === 'active') {
        await handleOpenTourStartModal(tour);
        return;
      }

      if (status === 'completed') {
        await updateTourMetadata(tour, {
          receiptIssued: true,
          receiptIssuedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
        }, 'completed');
        toast.success(tr('Tour completed and receipt marked as required/shared', 'Tour terminé et reçu marqué comme requis/partagé'));
        setRefreshKey((prev) => prev + 1);
        return;
      }

      if (['cancelled', 'no_show', 'expired'].includes(status)) {
        const statusConfig = {
          cancelled: {
            confirm: tr('Are you sure you want to cancel this tour?', 'Voulez-vous vraiment annuler ce tour ?'),
            success: tr('Tour marked cancelled', 'Tour marqué annulé'),
            activity: 'tour_cancelled',
            description: tr('Tour was cancelled from the schedule board.', 'Le tour a été annulé depuis le planning.'),
            meta: {
              cancelledAt: new Date().toISOString(),
              cancelledByUserId: userProfile?.id || null,
              cancelledByName: userProfile?.full_name || userProfile?.fullName || userProfile?.name || userProfile?.email || 'Team Member',
            },
          },
          no_show: {
            confirm: tr('Mark this tour as no-show?', 'Marquer ce tour comme no-show ?'),
            success: tr('Tour marked no-show', 'Tour marqué no-show'),
            activity: 'tour_no_show',
            description: tr('Tour was marked no-show from the schedule board.', 'Le tour a été marqué no-show depuis le planning.'),
            meta: {
              noShowAt: new Date().toISOString(),
              noShowByUserId: userProfile?.id || null,
              noShowByName: userProfile?.full_name || userProfile?.fullName || userProfile?.name || userProfile?.email || 'Team Member',
            },
          },
          expired: {
            confirm: tr('Mark this tour as expired?', 'Marquer ce tour comme expiré ?'),
            success: tr('Tour marked expired', 'Tour marqué expiré'),
            activity: 'tour_expired',
            description: tr('Tour was manually marked expired after the start window passed.', 'Le tour a été marqué expiré manuellement après le créneau de départ.'),
            meta: {
              expiredAt: new Date().toISOString(),
              expiredByUserId: userProfile?.id || null,
              expiredByName: userProfile?.full_name || userProfile?.fullName || userProfile?.name || userProfile?.email || 'Team Member',
            },
          },
        }[status];
        const confirmed = window.confirm(statusConfig.confirm);
        if (!confirmed) {
          return;
        }

        await updateTourMetadata(tour, statusConfig.meta, status);
        await logTourActivity(
          tour,
          statusConfig.activity,
          statusConfig.description,
          {
            status,
            marked_at: new Date().toISOString(),
          }
        );
        toast.success(statusConfig.success);
        setRefreshKey((prev) => prev + 1);
        return;
      }

      await updateTourBookingStatus(tour.rowIds, status);
    } catch (error) {
      console.error('Failed to update tour status:', error);
      toast.error('Could not update tour status');
      return;
    }

    toast.success(`Tour marked ${status}`);
    setRefreshKey((prev) => prev + 1);
  };

  const validateStep = () => {
    if (bookingStep === 1) {
      if (!currentPackage) {
        toast.error('Choose a package first');
        return false;
      }
      if (!bookingForm.time || !bookingForm.date) {
        toast.error(tr('Choose date and departure time', "Choisissez la date et l'heure de départ"));
        return false;
      }
      if (new Date(`${bookingForm.date}T${bookingForm.time}:00`) < new Date(Date.now() - 30 * 60 * 1000)) {
        toast.error(tr('Departure time cannot be in the past', "L'heure de départ ne peut pas être passée"));
        return false;
      }
      if (availabilitySnapshot.availableCapacity < Number(bookingForm.quadCount || 1)) {
        toast.error(tr('Not enough quad capacity available for this time slot', 'Capacité de quads insuffisante pour ce créneau'));
        return false;
      }
      if (selectedModelCount !== Number(bookingForm.quadCount || 1)) {
        toast.error(tr('Select the quad model mix so it matches the number of quads', 'Sélectionnez un mix de modèles correspondant au nombre de quads'));
        return false;
      }
      if (missingModelPricing.length > 0) {
        toast.error(tr(`Set tour pricing first for ${missingModelPricing[0].label}`, `Définissez d'abord le tarif du tour pour ${missingModelPricing[0].label}`));
        return false;
      }
      return true;
    }

    if (bookingStep === 2) {
      if (canSelectTourGuide && !bookingForm.guideId) {
        toast.error(tr('Choose a tour guide', 'Choisissez un guide de tour'));
        return false;
      }
      if (Number(bookingForm.ridersCount || 1) > Number(bookingForm.quadCount || 1) * 2) {
        toast.error(tr('Maximum two riders per quad', 'Maximum deux passagers par quad'));
        return false;
      }
      for (let index = 0; index < primaryDrivers.length; index += 1) {
        const driver = primaryDrivers[index];
        if (!String(driver.fullName || '').trim()) {
          toast.error(tr(`Enter the main driver name for quad ${index + 1}`, `Saisissez le nom du conducteur principal pour le quad ${index + 1}`));
          return false;
        }
        if (!hasDriverContactMethod(driver)) {
          toast.error(
            tr(
              `Enter a WhatsApp number or email for quad ${index + 1}`,
              `Saisissez un numéro WhatsApp ou un e-mail pour le quad ${index + 1}`
            )
          );
          return false;
        }
        if (String(driver.email || '').trim() && !hasValidEmail(driver.email)) {
          toast.error(
            tr(
              `Enter a valid email for quad ${index + 1}`,
              `Saisissez un e-mail valide pour le quad ${index + 1}`
            )
          );
          return false;
        }
        if (currentPackage?.requiresLicense && !String(driver.licenseNumber || '').trim()) {
          toast.error(tr(`Enter the main driver license number for quad ${index + 1}`, `Saisissez le numéro de permis du conducteur principal pour le quad ${index + 1}`));
          return false;
        }
      }
      for (let index = 0; index < secondaryDrivers.length; index += 1) {
        const driver = secondaryDrivers[index];
        if (!hasAnyDriverValue(driver)) continue;
        if (!String(driver.fullName || '').trim()) {
          toast.error(tr(`Enter the second driver name for quad ${index + 1}`, `Saisissez le nom du second conducteur pour le quad ${index + 1}`));
          return false;
        }
        if (!hasDriverContactMethod(driver)) {
          toast.error(
            tr(
              `Enter the second driver WhatsApp or email for quad ${index + 1}`,
              `Saisissez le WhatsApp ou l'e-mail du second conducteur pour le quad ${index + 1}`
            )
          );
          return false;
        }
        if (String(driver.email || '').trim() && !hasValidEmail(driver.email)) {
          toast.error(
            tr(
              `Enter a valid email for the second driver on quad ${index + 1}`,
              `Saisissez un e-mail valide pour le second conducteur du quad ${index + 1}`
            )
          );
          return false;
        }
        if (currentPackage?.requiresLicense && !String(driver.licenseNumber || '').trim()) {
          toast.error(tr(`Enter the second driver license number for quad ${index + 1}`, `Saisissez le numéro de permis du second conducteur pour le quad ${index + 1}`));
          return false;
        }
      }
      return true;
    }

    return true;
  };

  const handleNextStep = () => {
    if (!validateStep()) return;
    setBookingStep((prev) => Math.min(3, prev + 1));
  };

  const handleCreateTourBooking = async () => {
    if (!validateStep()) return;
    if (!currentPackage) return;

    const selectedGuide = canSelectTourGuide
      ? guides.find((guide) => String(guide.id) === String(bookingForm.guideId))
      : {
          id: userProfile?.id || '',
          name: currentUserDisplayName,
          role: userRole || 'employee',
        };
    const scheduledStart = new Date(`${bookingForm.date}T${bookingForm.time}:00`);
    const scheduledEnd = new Date(scheduledStart.getTime() + Number(currentPackage.duration || 1) * 60 * 60 * 1000);
    const blockingStart = new Date(scheduledStart.getTime() - Number(currentPackage.bufferBeforeMinutes || 15) * 60 * 1000);
    const blockingEnd = new Date(scheduledEnd.getTime() + Number(currentPackage.bufferAfterMinutes || 30) * 60 * 1000);
    const quadCount = Number(bookingForm.quadCount || 1);
    const assignedVehicles = shouldAssignVehiclesNow ? assignedVehiclesPreview.slice(0, quadCount) : [];
    const rowAmounts = bookingPricingLines.flatMap((line) =>
      Array.from({ length: Number(line.count || 0) }, () => Number(line.unitPrice || 0))
    );

    if (availabilitySnapshot.availableCapacity < quadCount) {
      toast.error(tr('Not enough quad capacity available', 'Capacité de quads insuffisante'));
      return;
    }

    if (shouldAssignVehiclesNow && assignedVehicles.length < quadCount) {
      toast.error(tr('Not enough free quads right now', 'Pas assez de quads libres actuellement'));
      return;
    }
    if (selectedModelCount !== quadCount) {
      toast.error(tr('Match the quad count with the selected model mix', 'Faites correspondre le nombre de quads avec le mix de modèles sélectionné'));
      return;
    }
    if (missingModelPricing.length > 0) {
      toast.error(tr(`Missing pricing for ${missingModelPricing[0].label}`, `Tarification manquante pour ${missingModelPricing[0].label}`));
      return;
    }

    const groupId = `TOUR-${Date.now().toString(36).toUpperCase()}`;
    const totalAmount = calculatedTourTotal;
    const normalizedPrimaryDrivers = primaryDrivers.map((driver, index) => ({
      quadNumber: index + 1,
      fullName: String(driver.fullName || '').trim(),
      whatsapp: String(driver.whatsapp || '').trim(),
      email: String(driver.email || '').trim(),
      idNumber: String(driver.idNumber || '').trim(),
      licenseNumber: String(driver.licenseNumber || '').trim(),
      dateOfBirth: String(driver.dateOfBirth || '').trim(),
      nationality: String(driver.nationality || '').trim(),
      placeOfBirth: String(driver.placeOfBirth || '').trim(),
      issueDate: String(driver.issueDate || '').trim(),
      idFileName: String(driver.idFileName || '').trim(),
      idFileUrl: String(driver.idFileUrl || '').trim(),
    }));
    const normalizedSecondaryDrivers = secondaryDrivers
      .map((driver, index) => ({
        quadNumber: index + 1,
        fullName: String(driver.fullName || '').trim(),
        whatsapp: String(driver.whatsapp || '').trim(),
        email: String(driver.email || '').trim(),
        idNumber: String(driver.idNumber || '').trim(),
        licenseNumber: String(driver.licenseNumber || '').trim(),
        dateOfBirth: String(driver.dateOfBirth || '').trim(),
        nationality: String(driver.nationality || '').trim(),
        placeOfBirth: String(driver.placeOfBirth || '').trim(),
        issueDate: String(driver.issueDate || '').trim(),
        idFileName: String(driver.idFileName || '').trim(),
        idFileUrl: String(driver.idFileUrl || '').trim(),
      }))
      .filter((driver) => hasAnyDriverValue(driver));
    const allPrimaryDriversHaveId = normalizedPrimaryDrivers.every((driver) => Boolean(driver.idFileName));
    const allRequiredLicensesCaptured = !currentPackage.requiresLicense
      || normalizedPrimaryDrivers.every((driver) => Boolean(driver.licenseNumber));
    const bookingContactDriver = normalizedPrimaryDrivers[0] || {};
    const customerName = bookingContactDriver.fullName || `Tour ${groupId}`;
    const customerPhone = bookingContactDriver.whatsapp || '';
    const customerEmail = bookingContactDriver.email || '';

    const metadata = {
      kind: 'tour_booking',
      groupId,
      packageId: currentPackage.id,
      packageName: currentPackage.name,
      durationHours: Number(currentPackage.duration || 1),
      routeType: currentPackage.routeType,
      requiresLicense: Boolean(currentPackage.requiresLicense),
      scheduledStartAt: scheduledStart.toISOString(),
      scheduledEndAt: scheduledEnd.toISOString(),
      blockingStartAt: blockingStart.toISOString(),
      blockingEndAt: blockingEnd.toISOString(),
      guideId: selectedGuide?.id || '',
      guideName: selectedGuide?.name || currentUserDisplayName,
      bookedByUserId: userProfile?.id || '',
      bookedByName: currentUserDisplayName,
      quadCount,
      ridersCount: Number(bookingForm.ridersCount || bookingForm.quadCount || 1),
      customerName,
      customerPhone,
      customerEmail,
      packageLocation: currentPackage.location || '',
      primaryDrivers: normalizedPrimaryDrivers,
      secondaryDrivers: normalizedSecondaryDrivers,
      idNumber: normalizedPrimaryDrivers[0]?.idNumber || '',
      idCaptured: allPrimaryDriversHaveId,
      idFileName: normalizedPrimaryDrivers[0]?.idFileName || '',
      idFileUrl: normalizedPrimaryDrivers[0]?.idFileUrl || '',
      licenseNumber: normalizedPrimaryDrivers[0]?.licenseNumber || '',
      licenseCaptured: allRequiredLicensesCaptured,
      licenseFileName: '',
      shareContract: Boolean(bookingForm.shareContract),
      receiptIssued: false,
      receiptIssuedAt: null,
      assignmentMode: shouldAssignVehiclesNow ? 'assigned_now' : 'assign_on_arrival',
      assignedVehicleIds: assignedVehicles.map((vehicle) => vehicle.id),
      assignedVehiclePlates: assignedVehicles.map((vehicle) => vehicle.plate_number),
      selectedModelMix: bookingPricingLines.map((line) => ({
        modelId: line.modelId,
        label: line.label,
        count: line.count,
        unitPrice: line.unitPrice,
        lineTotal: line.lineTotal,
      })),
      createdAt: new Date().toISOString(),
    };

    const notes = appendMarkedJson(bookingForm.notes || '', TOUR_BOOKING_MARKER, metadata);
    const rows = Array.from({ length: quadCount }, (_, index) => ({
      customer_name: customerName,
      customer_email: customerEmail,
      phone: customerPhone,
      vehicle_id: shouldAssignVehiclesNow ? assignedVehicles[index]?.id || null : null,
      rental_start_date: blockingStart.toISOString(),
      rental_end_date: blockingEnd.toISOString(),
      rental_status: 'scheduled',
      payment_status: 'unpaid',
      total_amount: Number(rowAmounts[index] || 0),
      remaining_amount: Number(rowAmounts[index] || 0),
      notes,
    }));

    setBookingSaving(true);
    try {
      await createTourBookings(rows);
    } catch (error) {
      setBookingSaving(false);
      console.error('Failed to create tour booking:', error);
      toast.error(tr('Could not book this tour', 'Impossible de réserver ce tour'));
      return;
    }
    setBookingSaving(false);

    await logTourActivity(
      {
        groupId,
        packageName: currentPackage.name,
        guideName: selectedGuide?.name || currentUserDisplayName,
      },
      'tour_booked',
      tr(`Tour booked for ${customerName} with ${quadCount} quad(s).`, `Tour réservé pour ${customerName} avec ${quadCount} quad(s).`),
      {
        customer_name: customerName,
        guide_name: selectedGuide?.name || currentUserDisplayName,
        scheduled_start_at: scheduledStart.toISOString(),
        scheduled_end_at: scheduledEnd.toISOString(),
        quad_count: quadCount,
        selected_model_mix: bookingPricingLines,
        total_amount: totalAmount,
      }
    );

    toast.success(tr('Tour booked successfully', 'Tour réservé avec succès'));
    setRefreshKey((prev) => prev + 1);
    setActiveTab('schedule');
    resetBookingFlow();
  };

  const getAssignableVehiclesForTour = (tour) => {
    const start = new Date(tour.blockingStartAt || tour.scheduledStartAt);
    const end = new Date(tour.blockingEndAt || tour.scheduledEndAt);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return [];

    const eligibleVehicles = (Array.isArray(vehicles) ? vehicles : [])
      .filter((vehicle) => vehicle?.is_active !== false)
      .filter((vehicle) => !['maintenance', 'in_maintenance', 'out_of_service', 'sold'].includes(String(vehicle.status || '').toLowerCase()))
      .sort((a, b) => String(a.plate_number || '').localeCompare(String(b.plate_number || '')));

    const overlappingRows = activeBlockingRows.filter((row) => {
      if (tour.rowIds.includes(row.id)) return false;
      return overlapsWindow(row.rental_start_date || row.created_at, row.rental_end_date || row.updated_at || row.created_at, start, end);
    });

    const blockedIds = new Set(overlappingRows.map((row) => row.vehicle_id).filter(Boolean).map(String));
    return eligibleVehicles.filter((vehicle) => !blockedIds.has(String(vehicle.id)));
  };

  const buildTourReceiptHtml = (tour) => {
    const vehicleSummary = tour.assignedVehicles.length > 0
      ? tour.assignedVehicles.map((vehicle) => `${vehicle.plate_number || tr('No plate', 'Sans plaque')} - ${vehicle.name || tr('Vehicle', 'Véhicule')} ${vehicle.model || ''}`).join(', ')
      : tr(`${tour.quadCount} quad(s) assigned at departure`, `${tour.quadCount} quad(s) attribué(s) au départ`);

    return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${tr('Tour Receipt', 'Reçu du tour')}</title>
    <style>
      body { font-family: Arial, sans-serif; padding: 32px; color: #0f172a; }
      .header { margin-bottom: 24px; }
      .title { font-size: 28px; font-weight: 800; margin: 0; }
      .subtitle { color: #64748b; margin-top: 8px; }
      .card { border: 1px solid #e2e8f0; border-radius: 16px; padding: 20px; margin-bottom: 16px; }
      .label { font-size: 12px; text-transform: uppercase; color: #64748b; margin-bottom: 6px; }
      .value { font-size: 18px; font-weight: 700; }
      .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
      .total { font-size: 24px; font-weight: 800; }
    </style>
  </head>
  <body>
    <div class="header">
      <h1 class="title">${tr('Tour Receipt', 'Reçu du tour')}</h1>
      <p class="subtitle">${tour.packageName} • ${formatDateTime(tour.completedAt || new Date().toISOString())}</p>
    </div>
    <div class="grid">
      <div class="card"><div class="label">${tr('Customer', 'Client')}</div><div class="value">${tour.customerName}</div></div>
      <div class="card"><div class="label">${tr('Phone', 'Téléphone')}</div><div class="value">${tour.customerPhone || 'N/A'}</div></div>
      <div class="card"><div class="label">${tr('Guide', 'Guide')}</div><div class="value">${tour.guideName}</div></div>
      <div class="card"><div class="label">${tr('Route', 'Itinéraire')}</div><div class="value">${tour.routeType}</div></div>
      <div class="card"><div class="label">${tr('Departure', 'Départ')}</div><div class="value">${formatDateTime(tour.startedAt || tour.scheduledStartAt)}</div></div>
      <div class="card"><div class="label">${tr('Riders', 'Passagers')}</div><div class="value">${tour.ridersCount}</div></div>
    </div>
    <div class="card">
      <div class="label">${tr('Vehicles', 'Véhicules')}</div>
      <div class="value">${vehicleSummary}</div>
    </div>
    <div class="card">
      <div class="label">${tr('Total Paid', 'Total payé')}</div>
      <div class="total">${formatCurrencyMAD(tour.totalAmount)} MAD</div>
    </div>
  </body>
</html>`;
  };

  const handlePrintTourReceipt = (tour) => {
    const printWindow = window.open('', '_blank', 'width=900,height=700');
    if (!printWindow) {
      toast.error(tr('Allow popups to print the receipt', "Autorisez les fenêtres contextuelles pour imprimer le reçu"));
      return;
    }

    printWindow.document.open();
    printWindow.document.write(buildTourReceiptHtml(tour));
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  };

  const handleShareTourReceipt = async (tour) => {
    const message = [
      tr('Tour receipt', 'Reçu du tour'),
      `${tour.packageName}`,
      tr(`Customer: ${tour.customerName}`, `Client : ${tour.customerName}`),
      tr(`Guide: ${tour.guideName}`, `Guide : ${tour.guideName}`),
      tr(`Total: ${formatCurrencyMAD(tour.totalAmount)} MAD`, `Total : ${formatCurrencyMAD(tour.totalAmount)} MAD`),
      tr(`Completed: ${formatDateTime(tour.completedAt || new Date().toISOString())}`, `Terminé : ${formatDateTime(tour.completedAt || new Date().toISOString())}`),
    ].join('\n');

    if (navigator.share) {
      try {
        await navigator.share({
          title: tr('Tour Receipt', 'Reçu du tour'),
          text: message,
        });
        return;
      } catch {}
    }

    const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(message)}`;
    window.open(whatsappUrl, '_blank', 'noopener,noreferrer');
  };

  const handleWhatsAppLocateGuide = async (tour) => {
    const assignedGuide = guides.find((guide) => String(guide.id) === String(tour.guideId));
    const cleanPhone = String(assignedGuide?.phone || '').replace(/\D/g, '');
    const callbackPhone = String(userProfile?.phone_number || '').replace(/\D/g, '');

    if (!cleanPhone) {
      toast.error(tr('No WhatsApp number is saved for this guide.', "Aucun numéro WhatsApp n'est enregistré pour ce guide."));
      return;
    }

    try {
      const trackingUrl = new URL(buildTourTrackingUrl(tour.groupId));
      if (callbackPhone) {
        trackingUrl.searchParams.set('callbackPhone', callbackPhone);
        trackingUrl.searchParams.set('callbackName', currentUserDisplayName);
        trackingUrl.searchParams.set('adminLiveMapUrl', `${trackingUrl.origin}/admin/live-map?groupId=${encodeURIComponent(tour.groupId)}`);
      }
      const shortTrackingUrl = await shortenUrl(trackingUrl.toString(), null, 'tour_tracking');
      const message = [
      tr(`Open and share location now: ${shortTrackingUrl}`, `Ouvrez et partagez votre position maintenant : ${shortTrackingUrl}`),
      ].join('\n');

      await updateTourMetadata(tour, {
        trackingUrl: buildTourTrackingUrl(tour.groupId),
        trackingLinkSentAt: new Date().toISOString(),
        trackingLinkSentByName: currentUserDisplayName,
      });
      await logTourActivity(
        tour,
        'tour_tracking_link_sent',
        tr('Tracking link sent to the driver.', 'Lien de suivi envoyé au guide.'),
        {
          tracking_link_sent_at: new Date().toISOString(),
          guide_phone: cleanPhone,
        }
      );

      window.open(`https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer');
      setRefreshKey((prev) => prev + 1);
    } catch (error) {
      console.error('Unable to open guide WhatsApp:', error);
      toast.error('Could not open WhatsApp for the guide.');
    }
  };

  const updateTourMetadata = async (tour, updates = {}, nextStatus = null) => {
    const sourceRows = bookings.filter((row) => tour.rowIds.includes(row.id));
    if (sourceRows.length === 0) return;

    const tableRows = sourceRows.map((row) => {
      const currentMeta = extractMarkedJson(row.notes, TOUR_BOOKING_MARKER) || {};
      return {
        id: row.id,
        notes: appendMarkedJson(stripMarkedJson(row.notes, TOUR_BOOKING_MARKER), TOUR_BOOKING_MARKER, {
          ...currentMeta,
          ...updates,
        }),
        ...(nextStatus ? { rental_status: nextStatus } : {}),
      };
    });

    await updateTourBookingRows(tableRows);
  };

  const buildTourSystemTimeline = (tour) => {
    const timeline = [
      {
        id: `${tour.groupId}-created`,
        title: tr('Tour booked', 'Tour réservé'),
        description: tr(`${tour.bookedByName} created this tour booking.`, `${tour.bookedByName} a créé cette réservation de tour.`),
        timestamp: tour.createdAt || tour.scheduledStartAt,
      },
      tour.startedAt
        ? {
            id: `${tour.groupId}-started`,
            title: tr('Tour started', 'Tour démarré'),
            description: tr(`${tour.startedByName || tour.guideName || 'Guide'} started the tour.`, `${tour.startedByName || tour.guideName || 'Guide'} a démarré le tour.`),
            timestamp: tour.startedAt,
          }
        : null,
      tour.completedAt
        ? {
            id: `${tour.groupId}-completed`,
            title: tr('Tour completed', 'Tour terminé'),
            description: tr(`${tour.completedByName || tour.guideName || 'Guide'} completed the tour return workflow.`, `${tour.completedByName || tour.guideName || 'Guide'} a terminé le flux de retour du tour.`),
            timestamp: tour.completedAt,
          }
        : null,
      tour.cancelledAt
        ? {
            id: `${tour.groupId}-cancelled`,
            title: tr('Tour cancelled', 'Tour annulé'),
            description: tr(`${tour.cancelledByName || 'Team Member'} cancelled this booking.`, `${tour.cancelledByName || 'Membre de l’équipe'} a annulé cette réservation.`),
            timestamp: tour.cancelledAt,
          }
        : null,
      tour.noShowAt
        ? {
            id: `${tour.groupId}-no-show`,
            title: tr('Tour no-show', 'Tour no-show'),
            description: tr(`${tour.noShowByName || 'Team Member'} marked this booking as no-show.`, `${tour.noShowByName || 'Membre de l’équipe'} a marqué cette réservation comme no-show.`),
            timestamp: tour.noShowAt,
          }
        : null,
      tour.expiredAt
        ? {
            id: `${tour.groupId}-expired`,
            title: tr('Tour expired', 'Tour expiré'),
            description: tr(`${tour.expiredByName || 'Team Member'} marked this booking as expired.`, `${tour.expiredByName || 'Membre de l’équipe'} a marqué cette réservation comme expirée.`),
            timestamp: tour.expiredAt,
          }
        : null,
      tour.receiptIssuedAt
        ? {
            id: `${tour.groupId}-receipt`,
            title: tr('Receipt issued', 'Reçu émis'),
            description: tr('Receipt was marked as issued/shared.', 'Le reçu a été marqué comme émis/partagé.'),
            timestamp: tour.receiptIssuedAt,
          }
        : null,
    ].filter(Boolean);

    return timeline.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  };

  const selectedTourTimeline = useMemo(() => {
    if (!selectedTourDetails) return [];

    const dbTimeline = tourActivityLogs.map((log) => ({
      id: log.id || `${log.created_at}-${log.action}`,
      title: String(log.action || 'activity')
        .replace(/_/g, ' ')
        .replace(/\b\w/g, (char) => char.toUpperCase()),
      description: log.description || 'Tour activity recorded.',
      timestamp: log.created_at,
      actor: log.user_name || '',
      metadata: log.details || log.metadata || null,
    }));

    const combined = [...dbTimeline, ...buildTourSystemTimeline(selectedTourDetails)];
    const seen = new Set();

    return combined
      .filter((item) => {
        const key = `${item.title}-${item.timestamp}-${item.description}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [selectedTourDetails, tourActivityLogs]);

  const selectedTourReturnRows = useMemo(() => {
    if (!selectedTourDetails) return [];

    const departureMap = new Map(
      (selectedTourDetails.departureEntries || []).map((entry) => [String(entry.vehicleId), entry])
    );
    const returnMap = new Map(
      (selectedTourDetails.returnEntries || []).map((entry) => [String(entry.vehicleId), entry])
    );
    const vehicleIds = new Set([
      ...Array.from(departureMap.keys()),
      ...Array.from(returnMap.keys()),
      ...(selectedTourDetails.assignedVehicles || []).map((vehicle) => String(vehicle.id)),
    ]);

    return Array.from(vehicleIds).map((vehicleId) => {
      const departure = departureMap.get(String(vehicleId));
      const returned = returnMap.get(String(vehicleId));
      const vehicle = (selectedTourDetails.assignedVehicles || []).find((item) => String(item.id) === String(vehicleId));

      return {
        vehicleId,
        vehicleName:
          departure?.vehicleName ||
          returned?.vehicleName ||
          `${vehicle?.plate_number || 'No plate'} • ${vehicle?.name || 'SEGWAY'} ${vehicle?.model || ''}`.trim(),
        plateNumber: vehicle?.plate_number || '',
        startOdometer: departure?.startOdometer ?? returned?.startOdometer ?? null,
        sourceFuelLevel: departure?.sourceFuelLevel ?? null,
        startFuelLevel: departure?.startFuelLevel ?? null,
        startedAt: departure?.startedAt || selectedTourDetails.startedAt || '',
        endOdometer: returned?.endOdometer ?? null,
        fuelLevel: returned?.fuelLevel ?? null,
      };
    });
  }, [selectedTourDetails]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-violet-50 via-white to-slate-50">
      <div className="bg-gradient-to-r from-violet-700 via-violet-800 to-indigo-900 shadow-xl">
        <div className="px-4 sm:px-6 lg:px-8">
          <div className="border-b border-violet-500/20 py-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-white/10 p-2 backdrop-blur-sm">
                  <Compass className="h-8 w-8 text-white" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-white sm:text-3xl">Tours & Booking</h1>
                  <p className="mt-1 text-sm text-violet-200">
                    Manage packages, bookings, departures, and tour history from one operational workspace.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                {hasTrackedTours && (
                  <Link
                    to="/admin/live-map"
                    className="inline-flex items-center rounded-lg border border-white/20 bg-white/10 px-4 py-2 text-white backdrop-blur-sm transition-all duration-200 hover:border-white/30 hover:bg-white/20"
                  >
                    <MapPinned className="mr-2 h-4 w-4" />
                    {tr('Open Live Map', 'Ouvrir la carte en direct')}
                  </Link>
                )}

                <button
                  type="button"
                  onClick={() => setRefreshKey((prev) => prev + 1)}
                  className="inline-flex items-center rounded-lg border border-white/20 bg-white/10 px-4 py-2 text-white backdrop-blur-sm transition-all duration-200 hover:border-white/30 hover:bg-white/20"
                >
                  <TimerReset className="mr-2 h-4 w-4" />
                  {tr('Refresh', 'Actualiser')}
                </button>


                {activeTab === 'packages' && canManageTourPackages && (
                  <button
                    type="button"
                    onClick={() => handleOpenPackageEditor()}
                    className="inline-flex items-center rounded-lg bg-white/10 px-4 py-2 text-white backdrop-blur-sm transition-all duration-200 hover:bg-white/20"
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    {tr('Add Package', 'Ajouter un forfait')}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="border-b border-gray-200 bg-white shadow-sm">
        <div className="px-4 sm:px-6 lg:px-8">
          <nav className="flex space-x-1 overflow-x-auto py-4" aria-label="Tours tabs">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const active = tab.id === activeTab;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`group relative flex items-center whitespace-nowrap rounded-xl px-4 py-3 text-sm font-medium transition-all duration-200 ${
                    active
                      ? 'bg-gradient-to-r from-violet-600 to-indigo-700 text-white shadow-lg'
                      : 'text-slate-600 hover:bg-violet-50 hover:text-violet-700'
                  }`}
                >
                  <Icon className={`mr-2 h-5 w-5 transition-transform duration-200 ${active ? 'scale-110' : 'group-hover:scale-105'}`} />
                  <span className="font-semibold">{tab.id === 'schedule' ? tr('Schedule', 'Planning') : tr('Book Tour', 'Réserver un tour')}</span>
                </button>
              );
            })}
          </nav>
        </div>
      </div>

      <div className="px-4 py-6 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl space-y-6 pb-32 sm:pb-16">

      {activeTab === 'bookings' && (
        <div className="space-y-6 pb-32 sm:pb-24">
          <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400">{tr('Book Tour', 'Réserver un tour')}</p>
                <h1 className="mt-2 text-3xl font-bold text-slate-900">
                  {canSelectTourGuide ? tr('Fast booking', 'Réservation rapide') : tr('Tour booking', 'Réservation de tour')}
                </h1>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-lg bg-gradient-to-br from-slate-100 to-white px-4 py-3 text-center ring-1 ring-slate-200/80">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500 whitespace-nowrap">{tr('Free Now', 'Libre maintenant')}</p>
                  <p className="mt-1 text-2xl font-semibold text-slate-900">{fleetStats.freeNow}</p>
                </div>
                <div className="rounded-lg bg-violet-50 px-4 py-3 text-center ring-1 ring-violet-200/80">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-violet-600 whitespace-nowrap">{tr('Capacity', 'Capacité')}</p>
                  <p className="mt-1 text-2xl font-semibold text-violet-900">{fleetStats.total}</p>
                </div>
                <div className="rounded-lg bg-indigo-50 px-4 py-3 text-center ring-1 ring-indigo-200/80">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-indigo-600 whitespace-nowrap">{tr('Reserved', 'Réservé')}</p>
                  <p className="mt-1 text-2xl font-semibold text-indigo-900">{fleetStats.reserved}</p>
                </div>
              </div>
            </div>

            <div className="mt-5 grid grid-cols-3 gap-2">
              {[
                { id: 1, label: tr('Package & Time', 'Forfait & heure'), icon: Route },
                { id: 2, label: tr('Guest & Guide', 'Client & guide'), icon: Users },
                { id: 3, label: tr('Review & Book', 'Vérifier & réserver'), icon: CheckCircle2 },
              ].map((step) => {
                const Icon = step.icon;
                const active = bookingStep === step.id;
                const done = bookingStep > step.id;
                return (
                  <button
                    key={step.id}
                    type="button"
                    onClick={() => {
                      if (step.id < bookingStep || validateStep()) setBookingStep(step.id);
                    }}
                    className={`rounded-lg px-4 py-3 text-left transition-colors ${
                      active
                        ? 'bg-violet-100 text-violet-900'
                        : done
                          ? 'bg-violet-50 text-violet-700 ring-1 ring-violet-200'
                          : 'bg-slate-100 text-slate-500'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Icon className="h-4 w-4" />
                      <span className="text-xs font-semibold uppercase tracking-[0.14em]">{step.id}</span>
                    </div>
                    <p className="mt-2 text-sm font-medium">{step.label}</p>
                  </button>
                );
              })}
            </div>
          </section>

          <div className="space-y-6">

            {bookingStep === 1 && (
              <section className="space-y-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400">{tr('Step 1', 'Étape 1')}</p>
                    <h3 className="mt-2 text-xl font-semibold text-slate-900">{tr('Choose package and departure', 'Choisir le forfait et le départ')}</h3>
                  </div>
                  {bookingsLoading && (
                    <div className="rounded-lg bg-slate-100 px-4 py-2 text-xs font-medium uppercase tracking-[0.14em] text-slate-500">
                      {tr('Loading schedule...', 'Chargement du planning...')}
                    </div>
                  )}
                  {canManageTourPackages && (
                    <Link
                      to="/admin/pricing?tab=tour-pricing"
                      className="inline-flex items-center gap-2 rounded-lg border border-violet-200 bg-violet-50 px-4 py-3 text-sm font-medium text-violet-700 transition hover:bg-violet-100"
                    >
                      <Package2 className="h-4 w-4" />
                      {tr('Manage Packages', 'Gérer les forfaits')}
                    </Link>
                  )}
                </div>

                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {packagesLoading ? (
                    <div className="col-span-full rounded-xl border border-slate-200 bg-slate-50 p-6 text-slate-500">{tr('Loading packages...', 'Chargement des forfaits...')}</div>
                  ) : (
                    packages.map((pkg) => {
                      const selected = String(pkg.id) === String(bookingForm.packageId);
                      const modelPriceHighlights = getPackageModelPriceHighlights(pkg);
                      return (
                        <button
                          key={pkg.id}
                          type="button"
                          onClick={() => {
                            updateBookingForm('packageId', pkg.id);
                            updateBookingForm('quadCount', Math.min(Number(bookingForm.quadCount || 1), Number(pkg.maxQuads || 5)));
                          }}
                          className={`rounded-xl border-2 p-5 text-left transition-all ${
                            selected
                              ? 'border-violet-500 bg-violet-50/60 shadow-md'
                              : 'border-slate-200 bg-white hover:border-violet-200 hover:bg-violet-50/20'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-center gap-2">
                              <div className={`rounded-full p-1.5 ${selected ? 'bg-violet-200 text-violet-700' : 'bg-slate-100 text-slate-500'}`}>
                                <Compass className="h-4 w-4" />
                              </div>
                              {selected && (
                                <div className="rounded-full bg-violet-600 p-0.5">
                                  <CheckCircle2 className="h-4 w-4 text-white" />
                                </div>
                              )}
                            </div>
                            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${selected ? 'bg-violet-100 text-violet-700' : 'bg-slate-100 text-slate-600'}`}>
                              {pkg.duration}h · {pkg.routeType}
                            </span>
                          </div>
                          <p className="mt-3 text-lg font-bold text-slate-900">{pkg.name}</p>
                          <p className="mt-0.5 text-xs text-slate-500">{pkg.location || tr('Main Base', 'Base principale')}</p>
                          <div className="mt-3 space-y-1.5 border-t border-slate-100 pt-3">
                            <div className="flex items-center justify-between text-sm">
                              <span className="text-slate-500">{tr('From', 'À partir de')}</span>
                              <span className="font-bold text-violet-700">{getPackagePricingBadge(pkg)}</span>
                            </div>
                            {modelPriceHighlights.length > 0 ? (
                              <div className="pt-1">
                                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                                  {tr('Model pricing', 'Tarifs par modele')}
                                </p>
                                <div className="mt-2 flex flex-wrap gap-2">
                                  {modelPriceHighlights.map((item) => (
                                    <span
                                      key={`${pkg.id}-${item.modelId}`}
                                      className="rounded-full bg-violet-50 px-3 py-1 text-xs font-semibold text-violet-700"
                                    >
                                      {item.label} • {item.price.toLocaleString('en-MA')} MAD
                                    </span>
                                  ))}
                                </div>
                              </div>
                            ) : null}
                            <div className="flex items-center justify-between text-sm">
                              <span className="text-slate-500">{tr('License', 'Permis')}</span>
                              <span className={`font-medium ${pkg.requiresLicense ? 'text-indigo-700' : 'text-emerald-700'}`}>
                                {pkg.requiresLicense ? tr('Required', 'Requis') : tr('Not needed', 'Non nécessaire')}
                              </span>
                            </div>
                            <div className="flex items-center justify-between text-sm">
                              <span className="text-slate-500">{tr('Max quads', 'Quads max')}</span>
                              <span className="font-medium text-slate-700">{pkg.maxQuads || 5}</span>
                            </div>
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>

                <div className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
                  <div className="rounded-xl bg-slate-50 p-5">
                    <label className="text-sm font-semibold text-slate-700">{tr('Tour Date', 'Date du tour')}</label>
                    <input
                      type="date"
                      value={bookingForm.date}
                      min={today}
                      onChange={(event) => updateBookingForm('date', event.target.value)}
                      className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-4 py-4 text-base font-semibold text-slate-900"
                    />
                  </div>

                  <div className="rounded-xl bg-slate-50 p-5">
                    <div className="flex items-center justify-between gap-3">
                      <label className="text-sm font-semibold text-slate-700">{tr('Departure Time', 'Heure de départ')}</label>
                      <span className="rounded-full bg-white px-3 py-1 text-xs font-medium uppercase tracking-[0.12em] text-slate-600">
                        {tr('Current Time', 'Heure actuelle')} {new Date().toLocaleTimeString(isFrench ? 'fr-FR' : 'en-US', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-3 md:grid-cols-5">
                      <button
                        type="button"
                        onClick={() => {
                          updateBookingForm('date', localToday());
                          updateBookingForm('time', currentTimeSlot);
                        }}
                        className={`rounded-lg px-3 py-4 text-sm font-medium transition-colors ${
                          bookingForm.time === currentTimeSlot
                            ? 'bg-gradient-to-r from-violet-600 to-indigo-700 text-white'
                            : 'bg-violet-100 text-violet-800 hover:bg-violet-200'
                        }`}
                      >
                        {tr('Now', 'Maintenant')}
                      </button>
                      {timeSlots.filter((time) => bookingForm.date !== today || time >= currentTimeSlot).map((time) => (
                        <button
                          key={time}
                          type="button"
                          onClick={() => updateBookingForm('time', time)}
                          className={`rounded-lg px-3 py-4 text-sm font-medium transition-colors ${
                            bookingForm.time === time ? 'bg-violet-700 text-white' : 'bg-white text-slate-700 hover:bg-violet-50'
                          }`}
                        >
                          {time}
                        </button>
                      ))}
                    </div>
                    {/* Custom time input */}
                    <div className="mt-3 flex items-center gap-3 rounded-lg border border-violet-200 bg-violet-50/50 px-4 py-3">
                      <label className="shrink-0 text-xs font-semibold text-violet-600 uppercase tracking-wide">{tr('Custom', 'Personnalisé')}</label>
                      <input
                        type="time"
                        value={bookingForm.time}
                        onChange={(e) => updateBookingForm('time', e.target.value)}
                        className="flex-1 rounded-lg border border-violet-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-200"
                      />
                      {bookingForm.time && !timeSlots.includes(bookingForm.time) && bookingForm.time !== currentTimeSlot && (
                        <span className="rounded-lg bg-violet-600 px-2.5 py-1 text-xs font-semibold text-white">
                          {bookingForm.time}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="rounded-xl bg-slate-50 p-5">
                  <label className="text-sm font-semibold text-slate-700">{tr('How many quads?', 'Combien de quads ?')}</label>
                  <div className="mt-3 grid grid-cols-5 gap-3">
                    {Array.from({ length: Number(currentPackage?.maxQuads || 5) }, (_, index) => index + 1).map((count) => (
                      <button
                        key={count}
                        type="button"
                        onClick={() => updateBookingForm('quadCount', count)}
                        className={`rounded-lg px-3 py-4 text-lg font-semibold transition-colors ${
                          Number(bookingForm.quadCount) === count ? 'bg-violet-700 text-white' : 'bg-white text-slate-700 hover:bg-violet-50'
                        }`}
                      >
                        {count}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 bg-slate-50 p-5">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div>
                      <label className="text-sm font-semibold text-slate-700">{tr('Choose quad models', 'Choisir les modèles de quad')}</label>
                    </div>
                    <div className="rounded-lg bg-white px-4 py-3 text-right">
                      <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-400">{tr('Selected', 'Sélectionné')}</p>
                      <p className="mt-1 text-lg font-semibold text-slate-900">{selectedModelCount} / {bookingForm.quadCount} quads</p>
                    </div>
                  </div>

                  {displayModelGroups.length === 0 ? (
                    <div className="mt-4 rounded-lg bg-white px-4 py-4 text-sm text-slate-500">
                      {bookingForm.time
                        ? tr('No quads are available for the selected departure time.', "Aucun quad n'est disponible pour l'heure de départ sélectionnée.")
                        : tr('No active quad models are available yet.', "Aucun modèle de quad actif n'est encore disponible.")}
                    </div>
                  ) : (
                    <div className="mt-4 space-y-3">
                      {displayModelGroups.map((group) => {
                        const selectedCount = Number(bookingForm.selectedModelCounts?.[group.modelId] || 0);
                        const remainingAvailableCount = Math.max(0, Number(group.availableCount || 0) - selectedCount);
                        const departureTimeSelected = Boolean(bookingForm.time);
                        const unitPrice = getTourPriceForModelAndDuration({
                          rows: tourPricingRows,
                          packageId: currentPackage?.id,
                          vehicleModelId: group.modelId,
                          durationHours: currentPackage?.duration,
                        });
                        const hasPrice = unitPrice > 0;
                        const canDecrease = selectedCount > 0;
                        const canIncrease = selectedModelCount < Number(bookingForm.quadCount || 1) && selectedCount < Number(group.availableCount || 0);

                        return (
                          <div
                            key={group.modelId}
                            className="rounded-lg border border-slate-200 bg-white p-4"
                            onClick={() => {
                              if (!departureTimeSelected) {
                                toast('Choose a departure time first.', { icon: '🕒' });
                              }
                            }}
                          >
                            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                              <div>
                                <p className="text-base font-semibold text-slate-900">{group.label}</p>
                                <div className="mt-2 flex flex-wrap items-center gap-2">
                                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                                    {remainingAvailableCount} available
                                  </span>
                                  <span className="rounded-full bg-violet-100 px-3 py-1 text-xs font-medium text-violet-700">
                                    {hasPrice
                                      ? `${unitPrice.toLocaleString('en-MA')} MAD / ${currentPackage?.duration || 0}h`
                                      : `— MAD / ${currentPackage?.duration || 0}h`}
                                  </span>
                                </div>
                              </div>

                              <div className="flex items-center gap-3">
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    if (!departureTimeSelected) {
                                      toast('Choose a departure time first.', { icon: '🕒' });
                                      return;
                                    }

                                    setBookingForm((prev) => ({
                                      ...prev,
                                      selectedModelCounts: {
                                        ...prev.selectedModelCounts,
                                        [group.modelId]: Math.max(0, Number(prev.selectedModelCounts?.[group.modelId] || 0) - 1),
                                      },
                                    }));
                                  }}
                                  disabled={departureTimeSelected ? !canDecrease : false}
                                  className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
                                  aria-label={`Decrease ${group.label}`}
                                >
                                  <Minus className="h-4 w-4" />
                                </button>
                                <div className="min-w-[72px] rounded-lg bg-gradient-to-r from-violet-700 to-indigo-800 px-4 py-3 text-center text-lg font-semibold text-white">
                                  {selectedCount}
                                </div>
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    if (!departureTimeSelected) {
                                      toast('Choose a departure time first.', { icon: '🕒' });
                                      return;
                                    }

                                    setBookingForm((prev) => ({
                                      ...prev,
                                      selectedModelCounts: {
                                        ...prev.selectedModelCounts,
                                        [group.modelId]: Math.min(
                                          Number(group.availableCount || 0),
                                          Number(prev.selectedModelCounts?.[group.modelId] || 0) + 1
                                        ),
                                      },
                                    }));
                                  }}
                                  disabled={departureTimeSelected ? !canIncrease : false}
                                  className={`inline-flex h-11 w-11 items-center justify-center rounded-lg border transition ${
                                    departureTimeSelected && canIncrease
                                      ? 'border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100'
                                      : 'border-slate-200 bg-slate-100 text-slate-400'
                                  } disabled:cursor-not-allowed`}
                                  aria-label={`Increase ${group.label}`}
                                >
                                  <Plus className="h-4 w-4" />
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  <div className="mt-4 grid gap-3 lg:grid-cols-[1.2fr_0.8fr]">
                    <div className="rounded-lg bg-white p-4">
                      {bookingPricingLines.length > 0 ? (
                        <div className="mt-3 space-y-2">
                          {bookingPricingLines.map((line) => (
                            <div key={line.modelId} className="flex items-center justify-between gap-3 text-sm">
                              <div>
                                <p className="font-medium text-slate-900">{line.label} x{line.count}</p>
                                <p className="text-slate-500">{line.unitPrice.toLocaleString('en-MA')} MAD each</p>
                              </div>
                              <p className="font-semibold text-slate-900">{line.lineTotal.toLocaleString('en-MA')} MAD</p>
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </div>
                    <div className="rounded-lg bg-gradient-to-r from-violet-700 via-violet-800 to-indigo-900 p-4 text-white shadow-sm">
                      <p className="text-xs font-medium uppercase tracking-[0.16em] text-violet-200">Estimated total</p>
                      <p className="mt-3 text-3xl font-semibold">{calculatedTourTotal.toLocaleString('en-MA')} MAD</p>
                      <p className="mt-2 text-sm text-violet-200/90">
                        Based on the current package duration and the selected quad models.
                      </p>
                      {missingModelPricing.length > 0 && (
                        <p className="mt-3 text-sm font-medium text-amber-300">
                          Missing pricing for {missingModelPricing.map((line) => line.label).join(', ')}.
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                {currentPackage && missingModelPricing.length > 0 && (
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-800">
                    Pricing is not configured yet for {missingModelPricing.map((line) => line.label).join(', ')} on the
                    {' '}
                    <span className="font-semibold">{currentPackage.name}</span>
                    {' '}
                    package. Add those prices in Pricing Management before confirming this booking.
                  </div>
                )}

                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={handleNextStep}
                    className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-5 py-4 text-sm font-semibold text-white transition hover:bg-violet-700"
                  >
                    Continue
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </section>
            )}

            {bookingStep === 2 && (
              <section className="space-y-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400">{tr('Step 2', 'Étape 2')}</p>
                  <h3 className="mt-2 text-xl font-semibold text-slate-900">{tr('Drivers and guide details', 'Détails des conducteurs et du guide')}</h3>
                </div>

                <div className="rounded-xl bg-slate-50 p-5">
                  <label className="text-sm font-semibold text-slate-700">{tr('Total Riders', 'Total passagers')}</label>
                  <div className="mt-3 grid grid-cols-5 gap-3">
                    {Array.from({ length: Math.max(Number(bookingForm.quadCount || 1) * 2, 2) }, (_, index) => index + 1).map((count) => (
                      <button
                        key={count}
                        type="button"
                        onClick={() => updateBookingForm('ridersCount', count)}
                        className={`rounded-lg px-3 py-4 text-lg font-semibold transition-colors ${
                          Number(bookingForm.ridersCount) === count ? 'bg-gradient-to-r from-violet-700 to-indigo-800 text-white' : 'bg-white text-slate-700 hover:bg-violet-50'
                        }`}
                      >
                        {count}
                      </button>
                    ))}
                  </div>
                  <p className="mt-3 text-xs text-slate-500">{tr('Maximum two riders per quad.', 'Maximum deux passagers par quad.')}</p>
                </div>

                {canSelectTourGuide ? (
                  <div className="rounded-xl bg-slate-50 p-5">
                    <label className="text-sm font-semibold text-slate-700">{tr('Choose Tour Guide', 'Choisir un guide de tour')}</label>
                    <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                      {guidesLoading ? (
                        <div className="rounded-lg bg-white p-4 text-sm text-slate-500">Loading guides...</div>
                      ) : (
                        guides.map((guide) => (
                          <button
                            key={guide.id}
                            type="button"
                            onClick={() => updateBookingForm('guideId', guide.id)}
                            className={`rounded-lg border px-4 py-4 text-left transition-colors ${
                              String(bookingForm.guideId) === String(guide.id)
                                ? 'border-violet-300 bg-violet-50'
                                : 'border-slate-200 bg-white hover:bg-violet-50/30'
                            }`}
                          >
                            <p className="font-semibold text-slate-900">{guide.name}</p>
                            <p className="mt-1 text-sm text-slate-500 capitalize">{guide.role}</p>
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="rounded-xl bg-slate-50 p-5">
                    <p className="text-sm font-semibold text-slate-700">Booking Account</p>
                    <div className="mt-3 rounded-lg border border-slate-200 bg-white px-4 py-4">
                      <p className="font-semibold text-slate-900">{currentUserDisplayName}</p>
                      <p className="mt-1 text-sm text-slate-500">
                        This booking will automatically stay connected to your account in the activity logs.
                      </p>
                    </div>
                  </div>
                )}

                <div className="rounded-xl border border-slate-200 bg-slate-50 p-5">
                  <div className="flex items-start gap-3">
                    <Users className="mt-1 h-5 w-5 text-slate-700" />
                    <div className="flex-1">
                      <h4 className="text-lg font-semibold text-slate-900">Driver roster by quad</h4>
                    </div>
                  </div>

                  <div className="mt-5 space-y-5">
                    <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
                      {primaryDrivers.map((driver, index) => {
                        const complete =
                          String(driver.fullName || '').trim()
                          && hasDriverContactMethod(driver)
                          && (!currentPackage?.requiresLicense || String(driver.licenseNumber || '').trim());

                        return (
                          <button
                            key={`driver-tab-${index}`}
                            type="button"
                            onClick={() => setActiveDriverQuadIndex(index)}
                            className={`rounded-lg border px-4 py-4 text-left transition-colors ${
                              activeDriverQuadIndex === index
                                ? 'border-violet-300 bg-violet-50 text-violet-900'
                                : 'border-slate-200 bg-white text-slate-700 hover:bg-violet-50/30'
                            }`}
                          >
                            <p className="text-sm font-semibold">Quad {index + 1}</p>
                            <p className={`mt-1 text-xs font-semibold ${complete ? 'text-violet-600' : 'text-slate-400'}`}>
                              {complete ? 'Ready' : 'Needs details'}
                            </p>
                          </button>
                        );
                      })}
                    </div>

                    <section className="rounded-xl border border-violet-100 bg-white p-5">
                      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                        <div>
                          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-violet-400">Quad {activeDriverQuadIndex + 1}</p>
                          <h5 className="mt-1 text-lg font-semibold text-slate-900">Main driver required</h5>
                        </div>
                        <span className="rounded-full bg-violet-50 px-3 py-1 text-xs font-semibold text-violet-700">
                          {currentPackage?.requiresLicense ? 'Road license needed' : 'No road license needed'}
                        </span>
                      </div>

                      <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                        <div className="rounded-lg bg-slate-50 p-4">
                          <label className="text-sm font-semibold text-slate-700">Driver Name</label>
                          <input
                            type="text"
                            value={activePrimaryDriver.fullName}
                            onChange={(event) => updatePrimaryDriver(activeDriverQuadIndex, 'fullName', event.target.value)}
                            className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-4 py-4 text-base font-semibold text-slate-900"
                            placeholder={`Main driver for quad ${activeDriverQuadIndex + 1}`}
                          />
                          {activePrimaryDriverSearchTerm.length >= 3 ? (
                            <div className="mt-2 rounded-lg border border-slate-200 bg-white">
                              {customerSuggestionsLoading ? (
                                <div className="px-4 py-3 text-xs font-medium text-slate-500">
                                  {tr('Searching customers...', 'Recherche clients...')}
                                </div>
                              ) : customerSuggestions.length > 0 ? (
                                <div className="max-h-64 overflow-y-auto py-1">
                                  {customerSuggestions.map((customer) => {
                                    const label =
                                      customer.full_name ||
                                      customer.customer_name ||
                                      customer.name ||
                                      tr('Unnamed customer', 'Client sans nom');
                                    const phone =
                                      customer.phone ||
                                      customer.customer_phone ||
                                      customer.phone_number ||
                                      '';
                                    const email =
                                      customer.email ||
                                      customer.customer_email ||
                                      '';
                                    const license =
                                      customer.licence_number ||
                                      customer.license_number ||
                                      customer.customer_licence_number ||
                                      '';

                                    return (
                                      <button
                                        key={customer.id}
                                        type="button"
                                        onClick={() => applyCustomerToPrimaryDriver(activeDriverQuadIndex, customer)}
                                        className="flex w-full items-start justify-between gap-3 px-4 py-3 text-left transition hover:bg-violet-50"
                                      >
                                        <div className="min-w-0">
                                          <p className="font-semibold text-slate-900">{label}</p>
                                          <p className="mt-1 text-xs text-slate-500 break-words">
                                            {[phone, email, license ? `${tr('License', 'Permis')}: ${license}` : ''].filter(Boolean).join(' • ')}
                                          </p>
                                        </div>
                                        <span className="shrink-0 rounded-full bg-violet-50 px-2.5 py-1 text-[11px] font-semibold text-violet-700">
                                          {tr('Use', 'Utiliser')}
                                        </span>
                                      </button>
                                    );
                                  })}
                                </div>
                              ) : (
                                <div className="px-4 py-3 text-xs font-medium text-slate-500">
                                  {tr('No saved customer matches that name yet.', 'Aucun client enregistré ne correspond encore à ce nom.')}
                                </div>
                              )}
                            </div>
                          ) : (
                            <p className="mt-2 text-xs text-slate-500">
                              {tr('Type at least 3 letters to search Customer Management.', 'Saisissez au moins 3 lettres pour rechercher dans la gestion clients.')}
                            </p>
                          )}
                        </div>
                        <div className="rounded-lg bg-slate-50 p-4">
                          <PhoneInputWithCountryCode
                            value={activePrimaryDriver.whatsapp || ''}
                            onChange={(value) => updatePrimaryDriver(activeDriverQuadIndex, 'whatsapp', value)}
                            tr={tr}
                            label={tr('WhatsApp', 'WhatsApp')}
                          />
                          {!activePrimaryDriver.whatsapp ? (
                            <p className="mt-2 text-xs text-slate-500">
                              {tr('Enter WhatsApp or email to continue.', 'Saisissez WhatsApp ou e-mail pour continuer.')}
                            </p>
                          ) : null}
                        </div>
                        <div className="rounded-lg bg-slate-50 p-4">
                          <label className="text-sm font-semibold text-slate-700">{tr('Email', 'E-mail')}</label>
                          <input
                            type="email"
                            value={activePrimaryDriver.email || ''}
                            onChange={(event) => updatePrimaryDriver(activeDriverQuadIndex, 'email', event.target.value)}
                            className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-4 py-4 text-base font-semibold text-slate-900"
                            placeholder="customer@example.com"
                          />
                          <p className="mt-2 text-xs text-slate-500">
                            {tr('Optional if WhatsApp is entered.', "Optionnel si WhatsApp est renseigné.")}
                          </p>
                        </div>
                        <div className="rounded-lg bg-slate-50 p-4">
                          <label className="text-sm font-semibold text-slate-700">{tr('Driver License', 'Permis conducteur')}</label>
                          <input
                            type="text"
                            value={activePrimaryDriver.licenseNumber}
                            onChange={(event) => updatePrimaryDriver(activeDriverQuadIndex, 'licenseNumber', event.target.value)}
                            className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-4 py-4 text-base font-semibold text-slate-900"
                            placeholder={currentPackage?.requiresLicense ? tr('Required for this route', 'Requis pour cet itinéraire') : tr('Optional', 'Optionnel')}
                          />
                        </div>
                        <div className="rounded-lg bg-slate-50 p-4">
                          <label className="text-sm font-semibold text-slate-700">{tr('ID Number', "Numéro d'identité")}</label>
                          <input
                            type="text"
                            value={activePrimaryDriver.idNumber}
                            onChange={(event) => updatePrimaryDriver(activeDriverQuadIndex, 'idNumber', event.target.value)}
                            className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-4 py-4 text-base font-semibold text-slate-900"
                            placeholder={tr('Optional', 'Optionnel')}
                          />
                        </div>
                      </div>

                      <div className="mt-4 rounded-lg bg-slate-50 p-4">
                        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                          <div>
                            <p className="text-sm font-semibold text-slate-700">{tr('Main Driver Scan', 'Scan du conducteur principal')}</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => setDriverIDScanTarget({ type: 'primary', index: activeDriverQuadIndex })}
                            className="inline-flex items-center justify-center gap-2 rounded-lg bg-violet-700 px-5 py-3 text-sm font-bold text-white hover:bg-violet-800"
                          >
                            <FileImage className="h-4 w-4" />
                            {activePrimaryDriver.idFileName ? tr('Rescan', 'Scanner à nouveau') : tr('Scan ID (Optional)', "Scanner la pièce (optionnel)")}
                          </button>
                        </div>
                        {activePrimaryDriver.idFileName && (
                          <div className="mt-3 flex items-center justify-between gap-3 rounded-lg bg-violet-50 px-4 py-3 text-sm font-semibold text-violet-700">
                            <p className="min-w-0 truncate">{tr(`ID captured: ${activePrimaryDriver.idFileName}`, `Pièce capturée : ${activePrimaryDriver.idFileName}`)}</p>
                            <button
                              type="button"
                              onClick={() => clearPrimaryDriverScan(activeDriverQuadIndex)}
                              className="inline-flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-white text-violet-600 hover:bg-violet-100"
                              aria-label={`Remove main driver ID for quad ${activeDriverQuadIndex + 1}`}
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                        )}
                      </div>

                      <div className="mt-5 rounded-lg border border-dashed border-slate-200 bg-slate-50 p-4">
                        <button
                          type="button"
                          onClick={() =>
                            setSecondDriverOpenByQuad((prev) => ({
                              ...prev,
                              [activeDriverQuadIndex]: !(prev[activeDriverQuadIndex] ?? hasAnyDriverValue(activeSecondaryDriver)),
                            }))
                          }
                          className="flex w-full items-start justify-between gap-4 text-left"
                        >
                          <div>
                            <p className="text-sm font-semibold text-slate-900">{tr('Optional second driver', 'Second conducteur optionnel')}</p>
                            {hasAnyDriverValue(activeSecondaryDriver) && (
                              <p className="mt-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                                {activeSecondaryDriver.fullName || tr('Details added', 'Détails ajoutés')}
                              </p>
                            )}
                          </div>
                          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-violet-200 bg-white px-3 py-2 text-xs font-semibold text-violet-700 shadow-sm">
                            {secondDriverOpen ? tr('Hide', 'Masquer') : tr('Add second driver', 'Ajouter un second conducteur')}
                            <ChevronRight className={`h-4 w-4 transition-transform ${secondDriverOpen ? 'rotate-90' : ''}`} />
                          </span>
                        </button>

                        {secondDriverOpen && (
                          <>
                            <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                              <div className="rounded-lg bg-white p-4">
                                <label className="text-sm font-semibold text-slate-700">{tr('Second Driver Name', 'Nom du second conducteur')}</label>
                                <input
                                  type="text"
                                  value={activeSecondaryDriver.fullName || ''}
                                  onChange={(event) => updateSecondaryDriver(activeDriverQuadIndex, 'fullName', event.target.value)}
                                  className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-4 py-4 text-base font-semibold text-slate-900"
                                  placeholder={tr('Optional', 'Optionnel')}
                                />
                              </div>
                              <div className="rounded-lg bg-white p-4">
                                <PhoneInputWithCountryCode
                                  value={activeSecondaryDriver.whatsapp || ''}
                                  onChange={(value) => updateSecondaryDriver(activeDriverQuadIndex, 'whatsapp', value)}
                                  tr={tr}
                                  label={tr('WhatsApp', 'WhatsApp')}
                                />
                                {!activeSecondaryDriver.whatsapp ? (
                                  <p className="mt-2 text-xs text-slate-500">
                                    {tr('Enter WhatsApp or email to continue.', 'Saisissez WhatsApp ou e-mail pour continuer.')}
                                  </p>
                                ) : null}
                              </div>
                              <div className="rounded-lg bg-white p-4">
                                <label className="text-sm font-semibold text-slate-700">{tr('Email', 'E-mail')}</label>
                                <input
                                  type="email"
                                  value={activeSecondaryDriver.email || ''}
                                  onChange={(event) => updateSecondaryDriver(activeDriverQuadIndex, 'email', event.target.value)}
                                  className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-4 py-4 text-base font-semibold text-slate-900"
                                  placeholder="customer@example.com"
                                />
                                <p className="mt-2 text-xs text-slate-500">
                                  {tr('Optional if WhatsApp is entered.', "Optionnel si WhatsApp est renseigné.")}
                                </p>
                              </div>
                              <div className="rounded-lg bg-white p-4">
                                <label className="text-sm font-semibold text-slate-700">{tr('Second Driver License', 'Permis du second conducteur')}</label>
                                <input
                                  type="text"
                                  value={activeSecondaryDriver.licenseNumber || ''}
                                  onChange={(event) => updateSecondaryDriver(activeDriverQuadIndex, 'licenseNumber', event.target.value)}
                                  className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-4 py-4 text-base font-semibold text-slate-900"
                                  placeholder={currentPackage?.requiresLicense ? tr('Required if second driver is added', 'Requis si un second conducteur est ajouté') : tr('Optional', 'Optionnel')}
                                />
                              </div>
                              <div className="rounded-lg bg-white p-4">
                                <label className="text-sm font-semibold text-slate-700">{tr('ID Number', "Numéro d'identité")}</label>
                                <input
                                  type="text"
                                  value={activeSecondaryDriver.idNumber || ''}
                                  onChange={(event) => updateSecondaryDriver(activeDriverQuadIndex, 'idNumber', event.target.value)}
                                  className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-4 py-4 text-base font-semibold text-slate-900"
                                  placeholder={tr('Optional', 'Optionnel')}
                                />
                              </div>
                            </div>

                            <div className="mt-4 rounded-lg bg-white p-4">
                              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                                <div>
                                  <p className="text-sm font-semibold text-slate-700">Second Driver Scan</p>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => setDriverIDScanTarget({ type: 'secondary', index: activeDriverQuadIndex })}
                                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-violet-700 px-5 py-3 text-sm font-bold text-white hover:bg-violet-800"
                                >
                                  <FileImage className="h-4 w-4" />
                                  {activeSecondaryDriver.idFileName ? 'Rescan' : 'Scan ID (Optional)'}
                                </button>
                              </div>
                              {activeSecondaryDriver.idFileName && (
                                <div className="mt-3 flex items-center justify-between gap-3 rounded-lg bg-violet-50 px-4 py-3 text-sm font-semibold text-violet-700">
                                  <p className="min-w-0 truncate">ID captured: {activeSecondaryDriver.idFileName}</p>
                                  <button
                                    type="button"
                                    onClick={() => clearSecondaryDriverScan(activeDriverQuadIndex)}
                                    className="inline-flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-white text-violet-600 hover:bg-violet-100"
                                    aria-label={`Remove second driver ID for quad ${activeDriverQuadIndex + 1}`}
                                  >
                                    <X className="h-4 w-4" />
                                  </button>
                                </div>
                              )}
                            </div>
                          </>
                        )}
                      </div>
                    </section>
                  </div>
                </div>


                <div className="rounded-xl bg-slate-50 p-5">
                  <label className="text-sm font-semibold text-slate-700">Staff Notes</label>
                  <textarea
                    value={bookingForm.notes}
                    onChange={(event) => updateBookingForm('notes', event.target.value)}
                    rows={4}
                    className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-4 py-4 text-sm text-slate-900"
                    placeholder="Any guest notes, arrival notes, or route comments"
                  />
                </div>

                <div className="rounded-xl bg-slate-50 p-5">
                  <label className="text-sm font-semibold text-slate-700">Optional Contract</label>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => updateBookingForm('shareContract', false)}
                      className={`rounded-lg px-3 py-4 text-sm font-bold ${!bookingForm.shareContract ? 'bg-violet-700 text-white' : 'bg-white text-slate-700 hover:bg-violet-50'}`}
                    >
                      No Contract
                    </button>
                    <button
                      type="button"
                      onClick={() => updateBookingForm('shareContract', true)}
                    className={`rounded-lg px-3 py-4 text-sm font-bold ${bookingForm.shareContract ? 'bg-violet-700 text-white' : 'bg-white text-slate-700 hover:bg-violet-50'}`}
                    >
                      Share Contract
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => setBookingStep(1)}
                    className="rounded-lg bg-slate-100 px-5 py-4 text-sm font-bold text-slate-700 hover:bg-slate-200"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    onClick={handleNextStep}
                    className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-5 py-4 text-sm font-bold text-white hover:bg-violet-700"
                  >
                    Review Booking
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </section>
            )}

            {bookingStep === 3 && (
              <section className="space-y-4 rounded-xl border border-violet-100 bg-white p-5 shadow-sm">
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-violet-400">Step 3</p>
                  <h3 className="mt-2 text-xl font-semibold text-slate-900">Review and book the tour</h3>
                </div>

                <div className="grid gap-3 lg:grid-cols-2">
                  <div className="rounded-xl border border-violet-100 bg-violet-50/40 p-4">
                    <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-violet-400">Package</p>
                    <p className="mt-1.5 text-base font-bold text-slate-900">{currentPackage?.name || 'No package selected'}</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <span className="rounded-lg bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 border border-slate-100">{currentPackage?.duration || 0}h</span>
                      <span className="rounded-lg bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 border border-slate-100 capitalize">{currentPackage?.routeType || 'mountain'}</span>
                      <span className="rounded-lg bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 border border-slate-100">{currentPackage?.location || tr('Main Base', 'Base principale')}</span>
                    </div>
                  </div>

                  <div className="rounded-xl border border-violet-100 bg-violet-50/40 p-4">
                    <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-violet-400">Schedule</p>
                    <p className="mt-1.5 text-base font-bold text-violet-800">{bookingForm.date} · {bookingForm.time}</p>
                    <p className="mt-1 text-sm text-slate-500">
                      Buffer: {currentPackage
                        ? `${currentPackage.bufferBeforeMinutes} min before / ${currentPackage.bufferAfterMinutes} min after`
                        : 'n/a'}
                    </p>
                  </div>
                </div>

                <div className="grid gap-3 lg:grid-cols-2">
                  <div className="rounded-xl border border-violet-100 bg-violet-50/40 p-4">
                    <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-violet-400">Model Mix</p>
                    <div className="mt-2 space-y-2">
                      {bookingPricingLines.length > 0 ? (
                        bookingPricingLines.map((line) => (
                          <div key={line.modelId} className="flex items-center justify-between gap-3 rounded-lg bg-white border border-slate-100 px-3 py-2.5">
                            <div>
                              <p className="text-sm font-semibold text-slate-900">{line.label}</p>
                              <p className="text-xs text-slate-500">{line.count} quad(s) × {line.unitPrice.toLocaleString('en-MA')} MAD</p>
                            </div>
                            <p className="text-sm font-bold text-violet-700">{line.lineTotal.toLocaleString('en-MA')} MAD</p>
                          </div>
                        ))
                      ) : (
                        <div className="rounded-lg bg-white border border-slate-100 px-3 py-3 text-sm text-slate-500">
                          No model mix selected yet.
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="rounded-xl border border-violet-100 bg-violet-50/40 p-4">
                    <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-violet-400">Pricing</p>
                    <p className="mt-1.5 text-2xl font-black text-violet-900">{calculatedTourTotal.toLocaleString('en-MA')} MAD</p>
                    <p className="mt-1 text-sm text-slate-500">Based on package duration and quad model mix.</p>
                    {missingModelPricing.length > 0 && (
                      <p className="mt-2 text-sm font-medium text-amber-700">
                        Missing pricing for {missingModelPricing.map((line) => line.label).join(', ')}.
                      </p>
                    )}
                  </div>
                </div>

                <div className="grid gap-3 lg:grid-cols-2">
                  <div className="rounded-xl border border-violet-100 bg-violet-50/40 p-4">
                    <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-violet-400">Booking Contact</p>
                    <p className="mt-1.5 text-base font-bold text-slate-900">{primaryDrivers[0]?.fullName || 'Quad 1 main driver'}</p>
                    <p className="mt-1 text-sm text-slate-500">{primaryDrivers[0]?.whatsapp || tr('No WhatsApp', 'Aucun WhatsApp')}</p>
                  </div>

                  <div className="rounded-xl border border-violet-100 bg-violet-50/40 p-4">
                    <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-violet-400">{tr('Guide & Riders', 'Guide et passagers')}</p>
                    <p className="mt-1.5 text-base font-bold text-slate-900">
                      {canSelectTourGuide
                        ? guides.find((guide) => String(guide.id) === String(bookingForm.guideId))?.name || tr('No guide', 'Aucun guide')
                        : currentUserDisplayName}
                    </p>
                    <p className="mt-1 text-sm text-slate-500">{tr(`${bookingForm.ridersCount} rider(s) · ${bookingForm.quadCount} quad(s)`, `${bookingForm.ridersCount} passager(s) · ${bookingForm.quadCount} quad(s)`)}</p>
                    <p className="mt-0.5 text-sm text-slate-500">{bookingForm.shareContract ? tr('Contract will be shared', 'Le contrat sera partagé') : tr('No contract', 'Pas de contrat')}</p>
                  </div>
                </div>

                <div className="rounded-xl border border-violet-100 bg-violet-50/40 p-4">
                  <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-violet-400">Drivers by Quad</p>
                  <div className="mt-3 grid gap-3 lg:grid-cols-2">
                    {primaryDrivers.map((driver, index) => {
                      const secondDriver = secondaryDrivers[index];
                      return (
                        <div key={`review-driver-${index}`} className="rounded-lg border border-violet-100 bg-white p-3">
                          <p className="text-sm font-bold text-violet-700">Quad {index + 1}</p>
                          <div className="mt-2 space-y-1">
                            <div className="grid grid-cols-[110px_minmax(0,1fr)] gap-3 text-sm">
                              <span className="text-slate-400">Driver</span>
                              <span className="font-medium text-slate-800 text-left break-words">{driver.fullName || '—'}</span>
                            </div>
                            <div className="grid grid-cols-[110px_minmax(0,1fr)] gap-3 text-sm">
                              <span className="text-slate-400">WhatsApp</span>
                              <span className="font-medium text-slate-800 text-left break-words">{driver.whatsapp || '—'}</span>
                            </div>
                            <div className="grid grid-cols-[110px_minmax(0,1fr)] gap-3 text-sm">
                              <span className="text-slate-400">License</span>
                              <span className="font-medium text-slate-800 text-left break-words">{driver.licenseNumber || 'Optional'}</span>
                            </div>
                            <div className="grid grid-cols-[110px_minmax(0,1fr)] gap-3 text-sm">
                              <span className="text-slate-400">ID Scan</span>
                              <span className="font-medium text-slate-800 text-left break-words">{driver.idFileName ? tr('Captured', 'Capturé') : '—'}</span>
                            </div>
                          </div>
                          {hasAnyDriverValue(secondDriver) && (
                            <div className="mt-2 border-t border-violet-100 pt-2 space-y-1">
                              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-violet-400">2nd Driver</p>
                              <div className="grid grid-cols-[110px_minmax(0,1fr)] gap-3 text-sm">
                                <span className="text-slate-400">Name</span>
                                <span className="font-medium text-slate-800 text-left break-words">{secondDriver.fullName || '—'}</span>
                              </div>
                              <div className="grid grid-cols-[110px_minmax(0,1fr)] gap-3 text-sm">
                                <span className="text-slate-400">WhatsApp</span>
                                <span className="font-medium text-slate-800 text-left break-words">{secondDriver.whatsapp || '—'}</span>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                  <div className="flex items-start gap-3">
                    <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                    <div className="flex-1">
                      <h4 className="text-sm font-bold text-emerald-900">Automatic quad assignment preview</h4>
                      <p className="mt-1 text-sm text-emerald-700">
                        {shouldAssignVehiclesNow
                          ? 'This tour starts within one hour, so the system assigns the selected model mix now.'
                          : 'This future tour reserves the selected model mix now. Real quad plates will be assigned from matching available models when the tour starts.'}
                      </p>
                    </div>
                  </div>
                  {shouldAssignVehiclesNow ? (
                    <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                      {assignedVehiclesPreview.map((vehicle) => (
                        <div key={vehicle.id} className="rounded-lg border border-emerald-100 bg-white p-3">
                          <p className="font-bold text-slate-900">{vehicle.plate_number || vehicle.name || 'Vehicle'}</p>
                          <p className="mt-0.5 text-sm text-slate-500">{vehicle.name || 'SEGWAY'} {vehicle.model || ''}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="mt-3 rounded-lg border border-emerald-100 bg-white p-3 text-sm font-medium text-slate-600">
                      Random available quads will be assigned at departure time.
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => setBookingStep(2)}
                    className="rounded-lg border border-slate-200 bg-slate-50 px-5 py-3 text-sm font-bold text-slate-700 hover:bg-slate-100"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    onClick={handleCreateTourBooking}
                    disabled={bookingSaving}
                    className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-6 py-3 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-60"
                  >
                    {bookingSaving ? 'Booking...' : 'Book Tour'}
                    <CheckCircle2 className="h-4 w-4" />
                  </button>
                </div>
              </section>
            )}
          </div>
        </div>
      )}

      {activeTab === 'schedule' && (
        <button
          type="button"
          onClick={() => setActiveTab('bookings')}
          className="fixed bottom-6 right-6 z-50 inline-flex items-center gap-2 rounded-[1.6rem] border border-violet-500/80 bg-gradient-to-r from-violet-600 via-violet-600 to-indigo-700 px-5 py-4 text-white shadow-[0_18px_36px_rgba(79,70,229,0.28)] transition-all duration-200 hover:scale-[1.01] hover:from-violet-700 hover:to-indigo-800 active:scale-[0.99] sm:bottom-8 sm:right-8 sm:px-6 sm:py-4"
          aria-label={tr('Book now', 'Réserver maintenant')}
        >
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-2xl bg-white/16 ring-1 ring-white/20">
            <Compass className="h-5 w-5" />
          </span>
          <span className="text-sm font-semibold tracking-tight">
            {tr('Book Now', 'Réserver')}
          </span>
        </button>
      )}

      {activeTab === 'schedule' && (
        <div className="space-y-6">
          <section className="rounded-3xl border border-slate-200/80 bg-white/95 p-4 shadow-[0_18px_40px_-24px_rgba(15,23,42,0.32)] backdrop-blur sm:p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-violet-500">{tr("Today's Tour Board", "Tableau des tours du jour")}</p>
                <h2 className="mt-2 text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">{tr('Schedule snapshot', 'Aperçu du planning')}</h2>
              </div>
              <div className="hidden rounded-2xl border border-violet-200 bg-violet-50 px-4 py-2 text-right sm:block">
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-violet-500">Live view</p>
                <p className="mt-1 text-sm font-semibold text-violet-900">Tours and departures</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
              <div className="rounded-2xl border border-slate-200 bg-slate-50/90 px-4 py-3 shadow-sm">
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">{tr('Tour Date', 'Date du tour')}</p>
                <p className="mt-2 text-lg font-bold tracking-tight text-slate-900">{new Date().toLocaleDateString(isFrench ? 'fr-FR' : 'en-GB', { day: '2-digit', month: 'short' })}</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50/90 px-4 py-3 shadow-sm">
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">{tr('Tours Today', "Tours aujourd'hui")}</p>
                <p className="mt-2 text-lg font-bold tracking-tight text-slate-900">{todayTours.length}</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50/90 px-4 py-3 shadow-sm">
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">{tr('Upcoming', 'À venir')}</p>
                <p className="mt-2 text-lg font-bold tracking-tight text-slate-900">{upcomingTours.length}</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50/90 px-4 py-3 shadow-sm">
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">{tr('Guides Active', 'Guides actifs')}</p>
                <p className="mt-2 text-lg font-bold tracking-tight text-slate-900">{new Set(todayTours.map((tour) => tour.guideId).filter(Boolean)).size}</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50/90 px-4 py-3 shadow-sm">
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">{tr('Quads Reserved', 'Quads réservés')}</p>
                <p className="mt-2 text-lg font-bold tracking-tight text-slate-900">{todayTours.reduce((sum, tour) => sum + tour.quadCount, 0)}</p>
              </div>
            </div>
          </section>

          <section className="rounded-3xl border border-slate-200/80 bg-white/95 p-4 shadow-[0_18px_40px_-24px_rgba(15,23,42,0.32)] backdrop-blur sm:p-5">
            <div className="flex items-center justify-between gap-2">
              <div className="grid min-w-0 flex-1 grid-cols-4 gap-2 rounded-2xl border border-slate-200 bg-slate-50/90 p-2">
                {[
                  { label: 'Act.', value: activeTours.length },
                  { label: 'Sched.', value: scheduledTours.length },
                  { label: 'Done', value: completedTours.length },
                  { label: 'Cancl.', value: cancelledTours.length },
                ].map(({ label, value }) => (
                  <div key={label} className="rounded-xl border border-slate-200 bg-white px-2 py-2 text-center shadow-sm">
                    <p className="truncate text-[9px] font-semibold uppercase tracking-[0.18em] text-slate-400">{label}</p>
                    <p className="mt-1 text-sm font-bold tracking-tight text-slate-900">{value}</p>
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setRefreshKey((prev) => prev + 1)}
                className="shrink-0 rounded-2xl border border-violet-200 bg-violet-50 px-4 py-2.5 text-sm font-semibold text-violet-700 transition-colors hover:bg-violet-100"
              >
                {tr('Refresh', 'Actualiser')}
              </button>
            </div>

            <div className="mt-6 space-y-4">
              {operationalTours.length === 0 ? (
                <div className="rounded-xl border border-dashed border-purple-200 bg-purple-50/50 p-8 text-center text-slate-500">
                  {tr('No tours booked yet. Use the booking tab to create the first one.', "Aucun tour réservé pour l'instant. Utilisez l’onglet réservation pour créer le premier.")}
                </div>
              ) : (
                <>
                  <div className={`grid gap-4 ${paginatedOperationalTours.length > 1 ? 'xl:grid-cols-2' : 'grid-cols-1'}`}>
                    {paginatedOperationalTours.map((tour) => {
                      const trackingActiveForTour = trackedTourIds.has(String(tour.groupId));
                      const workflowState = getTourWorkflowState(tour);
                      const tourStarted = workflowState === 'started';
                      const tourFinished = workflowState === 'completed';
                      const guideHasWhatsApp = Boolean(guides.find((guide) => String(guide.id) === String(tour.guideId))?.phone);
                      const needsReview = isTourPastReviewWindow(tour);
                      const actionMenuOpen = openTourActionGroupId === tour.groupId;

                      return (
                      <article
                        key={tour.groupId}
                        onClick={() => openTourDetails(tour)}
                        className={`cursor-pointer rounded-xl overflow-hidden transition-shadow hover:shadow-md ${getScheduleCardClasses(tour.status)} ${trackingActiveForTour ? 'ring-2 ring-emerald-300 ring-offset-2 ring-offset-white shadow-[0_0_0_1px_rgba(16,185,129,0.1)]' : ''}`}
                      >
                        {/* Card header — KM pricing style */}
                        <div className="px-5 pt-5 pb-4">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-lg font-bold text-slate-900">{tour.packageName}</h3>
                            <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${toStatusTone(tour.status)}`}>{getTourStatusLabel(tour.status)}</span>
                            {needsReview ? (
                              <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-700">
                                {tr('Needs review', 'À vérifier')}
                              </span>
                            ) : null}
                            <span className="rounded-full bg-violet-50 px-2.5 py-0.5 text-xs font-semibold text-violet-700 capitalize">{tour.routeType}</span>
                            {trackingActiveForTour ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
                                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                {tr('Live GPS', 'GPS en direct')}
                              </span>
                            ) : null}
                          </div>
                          <p className="mt-1 text-xs text-slate-400">{getTourWorkflowHint(tour, trackingActiveForTour)} · {tr('Booked by', 'Réservé par')} {tour.bookedByName}</p>
                          {tour.status === 'active' && (
                            <div className="mt-3">
                              <TourLiveTimer startedAt={tour.startedAt || tour.scheduledStartAt} durationHours={tour.durationHours} />
                            </div>
                          )}
                          {needsReview ? (
                            <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700">
                              {tr('Start time passed. Choose Start Tour, No-show, Cancel, or Expired from More.', 'L’heure de départ est dépassée. Choisissez Démarrer, No-show, Annuler ou Expiré depuis Plus.')}
                            </div>
                          ) : null}
                        </div>

                        {/* Data rows — KM pricing style */}
                        <div className="border-t border-slate-100 px-5 py-4 space-y-2.5">
                          <div className="grid grid-cols-[110px_minmax(0,1fr)] gap-3 text-sm">
                            <span className="text-slate-500">{tr('Guest', 'Client')}</span>
                            <span className="font-semibold text-slate-900 text-left break-words">{formatGuestSummary(tour)}</span>
                          </div>
                          <div className="grid grid-cols-[110px_minmax(0,1fr)] gap-3 text-sm">
                            <span className="text-slate-500">{tr('Phone', 'Téléphone')}</span>
                            <span className="font-medium text-slate-700 text-left break-words">{tour.customerPhone || '—'}</span>
                          </div>
                          <div className="grid grid-cols-[110px_minmax(0,1fr)] gap-3 text-sm">
                            <span className="text-slate-500">{tr('Guide', 'Guide')}</span>
                            <span className="font-medium text-slate-700 text-left break-words">{tour.guideName}</span>
                          </div>
                          <div className="grid grid-cols-[110px_minmax(0,1fr)] gap-3 border-t border-dashed border-slate-100 pt-2.5 text-sm">
                            <span className="text-slate-500">{tr('Departure', 'Départ')}</span>
                            <span className="font-bold text-violet-700 text-left break-words">{formatDateTime(tour.scheduledStartAt)}</span>
                          </div>
                          <div className="grid grid-cols-[110px_minmax(0,1fr)] gap-3 text-sm">
                            <span className="text-slate-500">{tr('Ends', 'Fin')}</span>
                            <span className="font-medium text-slate-700 text-left break-words">
                              {tour.assignmentMode === 'assign_on_arrival' && tour.status === 'scheduled'
                                ? tr('Quads assigned at departure', 'Quads attribués au départ')
                                : formatDateTime(tour.scheduledEndAt)}
                            </span>
                          </div>
                          <div className="grid grid-cols-[110px_minmax(0,1fr)] gap-3 border-t border-dashed border-slate-100 pt-2.5 text-sm">
                            <span className="text-slate-500">{tr('Quads · Riders', 'Quads · pilotes')}</span>
                            <span className="font-semibold text-slate-900 text-left break-words">{tour.quadCount} · {tour.ridersCount}</span>
                          </div>
                          <div className="grid grid-cols-[110px_minmax(0,1fr)] gap-3 text-sm">
                            <span className="text-slate-500">{tr('Vehicles', 'Véhicules')}</span>
                            <span className="font-medium text-slate-700 text-left break-words">
                              {tour.assignedVehicles.length === 0
                                ? <span className="text-slate-400 italic">{tr('Assign at departure', 'Attribuer au départ')}</span>
                                : tour.assignedVehicles.map((v) => v.plate_number || tr('No plate', 'Sans plaque')).join(', ')}
                            </span>
                          </div>
                          <div className="grid grid-cols-[110px_minmax(0,1fr)] gap-3 text-sm">
                            <span className="text-slate-500">{tr('Documents', 'Documents')}</span>
                            <span className={`font-medium text-left break-words ${tour.idCaptured ? 'text-emerald-600' : 'text-rose-500'}`}>
                              {tour.idCaptured ? tr('ID captured', 'Pièce capturée') : tr('ID optional', 'Pièce facultative')}
                            </span>
                          </div>
                        </div>

                        {/* Action buttons */}
                        {!tourFinished && (
                          <div className="border-t border-slate-100 px-5 py-4" onClick={(event) => event.stopPropagation()}>
                            {!tourStarted ? (
                              <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_auto]">
                                <button
                                  type="button"
                                  onClick={() => handleWhatsAppLocateGuide(tour)}
                                  disabled={!guideHasWhatsApp}
                                  className={`inline-flex w-full items-center justify-center gap-1.5 rounded-lg px-3 py-3 text-sm font-semibold shadow-sm transition-colors ${
                                    guideHasWhatsApp
                                      ? 'bg-gradient-to-r from-violet-600 to-indigo-700 text-white hover:from-violet-700 hover:to-indigo-800'
                                      : 'cursor-not-allowed border border-slate-200 bg-slate-100 text-slate-400'
                                  }`}
                                >
                                  <Share2 className="h-4 w-4" />
                                  {tour.trackingLinkSentAt ? tr('Share Link Again', 'Renvoyer le lien') : tr('Share Link', 'Partager le lien')}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleUpdateTourStatus(tour, 'active')}
                                  className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-3 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700"
                                >
                                  <Route className="h-4 w-4" />
                                  {tr('Start Tour', 'Démarrer le tour')}
                                </button>
                                <div className="relative" data-tour-action-menu>
                                  <button
                                    type="button"
                                    onClick={() => setOpenTourActionGroupId((current) => current === tour.groupId ? '' : tour.groupId)}
                                    className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-3 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50 sm:w-auto"
                                  >
                                    <MoreHorizontal className="h-4 w-4" />
                                    {tr('More', 'Plus')}
                                  </button>
                                  {actionMenuOpen ? (
                                    <div className="absolute right-0 top-full z-20 mt-2 w-56 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setOpenTourActionGroupId('');
                                          handleUpdateTourStatus(tour, 'no_show');
                                        }}
                                        className="block w-full px-4 py-3 text-left text-sm font-semibold text-orange-700 hover:bg-orange-50"
                                      >
                                        {tr('Mark no-show', 'Marquer no-show')}
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setOpenTourActionGroupId('');
                                          handleUpdateTourStatus(tour, 'expired');
                                        }}
                                        className="block w-full px-4 py-3 text-left text-sm font-semibold text-amber-700 hover:bg-amber-50"
                                      >
                                        {tr('Mark expired', 'Marquer expiré')}
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setOpenTourActionGroupId('');
                                          handleUpdateTourStatus(tour, 'cancelled');
                                        }}
                                        className="block w-full px-4 py-3 text-left text-sm font-semibold text-rose-700 hover:bg-rose-50"
                                      >
                                        {tr('Cancel tour', 'Annuler le tour')}
                                      </button>
                                    </div>
                                  ) : null}
                                </div>
                              </div>
                            ) : null}

                            {tourStarted ? (
                              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                {trackingActiveForTour ? (
                                  <Link
                                    to={`/admin/live-map?groupId=${encodeURIComponent(tour.groupId)}`}
                                    onClick={(event) => event.stopPropagation()}
                                    className="inline-flex w-full animate-pulse items-center justify-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm font-semibold text-emerald-700 shadow-sm transition-colors hover:bg-emerald-100"
                                  >
                                    <span className="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_0_4px_rgba(16,185,129,0.16)]" />
                                    <MapPinned className="h-4 w-4" />
                                    {tr('Live Map', 'Carte live')}
                                  </Link>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => handleWhatsAppLocateGuide(tour)}
                                    disabled={!guideHasWhatsApp}
                                    className={`inline-flex w-full items-center justify-center gap-1.5 rounded-lg px-3 py-3 text-sm font-semibold shadow-sm transition-colors ${
                                      guideHasWhatsApp
                                        ? 'bg-gradient-to-r from-violet-600 to-indigo-700 text-white hover:from-violet-700 hover:to-indigo-800'
                                        : 'cursor-not-allowed border border-slate-200 bg-slate-100 text-slate-400'
                                    }`}
                                  >
                                    <Share2 className="h-4 w-4" />
                                    {tour.trackingLinkSentAt ? tr('Share Link Again', 'Renvoyer le lien') : tr('Share Link', 'Partager le lien')}
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => handleOpenTourReturnModal(tour)}
                                  className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-gradient-to-r from-slate-700 to-slate-900 px-3 py-3 text-sm font-semibold text-white shadow-sm hover:from-slate-800 hover:to-black"
                                >
                                  <CheckCircle2 className="h-4 w-4" />
                                  {tr('End Tour', 'Terminer le tour')}
                                </button>
                              </div>
                            ) : null}
                          </div>
                        )}
                      </article>
                      );
                    })}
                  </div>
                  {operationalPageCount > 1 && (
                    <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                      <p className="text-sm font-medium text-slate-600">
                        {tr('Page', 'Page')} {schedulePage} {tr('of', 'sur')} {operationalPageCount}
                      </p>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setSchedulePage((prev) => Math.max(1, prev - 1))}
                          disabled={schedulePage === 1}
                          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {tr('Previous', 'Précédent')}
                        </button>
                        <button
                          type="button"
                          onClick={() => setSchedulePage((prev) => Math.min(operationalPageCount, prev + 1))}
                          disabled={schedulePage === operationalPageCount}
                          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {tr('Next', 'Suivant')}
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
            <button
              type="button"
              onClick={() => setHistoryCollapsed((prev) => !prev)}
              className="flex w-full items-center justify-between p-5 text-left"
            >
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-slate-100 p-2">
                  <Clock className="h-4 w-4 text-slate-500" />
                </div>
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400">{tr('Completed & Closed', 'Terminés & fermés')}</p>
                  <h2 className="mt-0.5 text-lg font-semibold text-slate-900">{tr('Tour history', 'Historique des tours')}</h2>
                </div>
                <span className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600">
                  {completedHistoryTours.length} {tr('tours', 'tours')}
                </span>
              </div>
              <ChevronDown className={`h-5 w-5 text-slate-400 transition-transform duration-200 ${historyCollapsed ? '' : 'rotate-180'}`} />
            </button>

            {!historyCollapsed && (
            <div className="border-t border-slate-100 p-5 space-y-4">
              {completedHistoryTours.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-slate-500">
                  {tr('No completed or cancelled tours yet.', "Aucun tour terminé ou annulé pour l'instant.")}
                </div>
              ) : (
                <>
                  <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-sm font-medium text-slate-600">
                      {tr('Rows per page', 'Lignes par page')}
                    </p>
                    <div className="flex items-center gap-2">
                      {[10, 25].map((size) => (
                        <button
                          key={size}
                          type="button"
                          onClick={() => setCompletedPageSize(size)}
                          className={`rounded-lg border px-3 py-2 text-sm font-semibold transition-colors ${
                            completedPageSize === size
                              ? 'border-violet-500 bg-violet-600 text-white shadow-sm'
                              : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-100'
                          }`}
                        >
                          {size}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="grid gap-4 xl:grid-cols-2">
                    {paginatedCompletedTours.map((tour) => {
                      const timing = getTourTimingSummary(tour);

                      return (
                      <article key={tour.groupId} className={`rounded-xl overflow-hidden ${getScheduleCardClasses(tour.status)}`}>
                        {/* Card header */}
                        <div className="px-5 pt-4 pb-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-base font-bold text-slate-900">{tour.packageName}</h3>
                            <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${toStatusTone(tour.status)}`}>{getTourStatusLabel(tour.status)}</span>
                          </div>
                          <p className="mt-0.5 text-xs text-slate-400">{tr(`Guide: ${tour.guideName}`, `Guide : ${tour.guideName}`)}</p>
                        </div>

                        {/* Data rows — KM pricing style */}
                        <div className="border-t border-slate-100 px-5 py-3 space-y-2">
                          <div className="grid grid-cols-[110px_minmax(0,1fr)] gap-3 text-sm">
                            <span className="text-slate-500">{tr('Guest', 'Client')}</span>
                            <span className="font-semibold text-slate-900 text-left break-words">{formatGuestSummary(tour)}</span>
                          </div>
                          <div className="grid grid-cols-[110px_minmax(0,1fr)] gap-3 text-sm">
                            <span className="text-slate-500">{tr('Phone', 'Téléphone')}</span>
                            <span className="font-medium text-slate-700 text-left break-words">{tour.customerPhone || '—'}</span>
                          </div>
                          <div className="grid grid-cols-[110px_minmax(0,1fr)] gap-3 border-t border-dashed border-slate-100 pt-2 text-sm">
                            <span className="text-slate-500">{tr('Departure', 'Départ')}</span>
                            <span className="font-bold text-violet-700 text-left break-words">{formatDateTime(tour.scheduledStartAt)}</span>
                          </div>
                          <div className="grid grid-cols-[110px_minmax(0,1fr)] gap-3 text-sm">
                            <span className="text-slate-500">{tour.status === 'completed' ? tr('Completed', 'Terminé') : tr('Status', 'Statut')}</span>
                            <span className="font-medium text-slate-700 text-left break-words">
                              {tour.status === 'completed'
                                ? formatDateTime(tour.completedAt || tour.scheduledEndAt)
                                : tour.status === 'no_show'
                                  ? tr('Booking was marked no-show', 'La réservation a été marquée no-show')
                                  : tour.status === 'expired'
                                    ? tr('Booking expired', 'La réservation a expiré')
                                    : tr('Booking was cancelled', 'La réservation a été annulée')}
                            </span>
                          </div>
                          <div className="grid grid-cols-[110px_minmax(0,1fr)] gap-3 text-sm">
                            <span className="text-slate-500">{tr('Quads · Riders', 'Quads · passagers')}</span>
                            <span className="font-semibold text-slate-900 text-left break-words">{tour.quadCount} · {tour.ridersCount}</span>
                          </div>
                          <div className="grid grid-cols-[110px_minmax(0,1fr)] gap-3 text-sm">
                            <span className="text-slate-500">{tr('Duration', 'Durée')}</span>
                            <span className="font-semibold text-slate-900 text-left break-words">{timing.actualDurationLabel}</span>
                          </div>
                          <div className="grid grid-cols-[110px_minmax(0,1fr)] gap-3 text-sm">
                            <span className="text-slate-500">Overrun</span>
                            <span className={`font-semibold text-left break-words ${timing.isOverrun ? 'text-red-600' : 'text-emerald-600'}`}>
                              {timing.overrunLabel}
                            </span>
                          </div>
                          {tour.returnEntries?.length > 0 && (
                            <div className="border-t border-dashed border-slate-100 pt-2 space-y-1.5">
                              {tour.returnEntries.map((entry) => (
                                <div key={entry.vehicleId} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 text-sm">
                                  <span className="text-slate-500 text-left break-words">{entry.vehicleName}</span>
                                  <span className="text-xs text-slate-600 shrink-0 text-left">{entry.endOdometer} km · fuel {entry.fuelLevel}/8</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Action buttons */}
                        <div className="border-t border-slate-100 px-5 py-3">
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => openTourDetails(tour)}
                              className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
                            >
                              <PanelRightOpen className="h-3.5 w-3.5" />
                              Details
                            </button>
                            {tour.status === 'completed' && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => handlePrintTourReceipt(tour)}
                                  className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-gradient-to-r from-slate-700 to-slate-900 px-3 py-2 text-xs font-semibold text-white shadow-sm hover:from-slate-800 hover:to-black"
                                >
                                  <Printer className="h-3.5 w-3.5" />
                                  Print
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleShareTourReceipt(tour)}
                                  className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800 shadow-sm hover:bg-emerald-100"
                                >
                                  <Share2 className="h-3.5 w-3.5" />
                                  Share
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      </article>
                    );
                    })}
                  </div>
                  {completedPageCount > 1 && (
                    <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                      <p className="text-sm font-medium text-slate-600">
                        {tr('Page', 'Page')} {completedPage} {tr('of', 'sur')} {completedPageCount}
                      </p>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setCompletedPage((prev) => Math.max(1, prev - 1))}
                          disabled={completedPage === 1}
                          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {tr('Previous', 'Précédent')}
                        </button>
                        <button
                          type="button"
                          onClick={() => setCompletedPage((prev) => Math.min(completedPageCount, prev + 1))}
                          disabled={completedPage === completedPageCount}
                          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {tr('Next', 'Suivant')}
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
            )}
          </section>
        </div>
      )}

      {(guestIDScanOpen || driverIDScanTarget) && (
        <EnhancedUnifiedIDScanModal
          isOpen={Boolean(guestIDScanOpen || driverIDScanTarget)}
          onClose={() => {
            setGuestIDScanOpen(false);
            setDriverIDScanTarget(null);
          }}
          onScanComplete={(scannedData, imageFile) => {
            if (driverIDScanTarget) {
              handleDriverIDScanComplete(scannedData, imageFile);
              return;
            }
            handleGuestIDScanComplete(scannedData, imageFile);
          }}
          onImageSaved={(savedData, imageFile) => {
            if (driverIDScanTarget) {
              handleDriverIDScanComplete(savedData, imageFile);
              return;
            }
            handleGuestIDScanComplete(savedData, imageFile);
          }}
          onCustomerSaved={() => {}}
          title={
            driverIDScanTarget
              ? `${driverIDScanTarget.type === 'primary' ? "Scanner l'identité du conducteur principal" : "Scanner l'identité du second conducteur"}`
              : "Scanner l'identité de l'invité"
          }
          scanningForSecondDriver={driverIDScanTarget?.type === 'secondary'}
          autoProcessOnSelect={false}
          allowSaveWithoutOcr
          saveWithoutOcrLabel="Enregistrer l’image seulement"
        />
      )}

      {tourStartModalOpen && tourToStart && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[90vh] w-full max-w-[1120px] overflow-y-auto rounded-[32px] border border-violet-200/80 bg-gradient-to-br from-violet-50 via-white to-slate-50 shadow-2xl">
            <div className="sticky top-0 flex items-center justify-between border-b border-violet-200/70 bg-white/90 px-6 py-5 backdrop-blur">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-violet-500">Tour Departure</p>
                <h2 className="mt-2 text-2xl font-black text-slate-900">{tr('Confirm departure checks', 'Confirmer les contrôles de départ')}</h2>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (!tourDepartureSaving) {
                    setTourStartModalOpen(false);
                    setTourToStart(null);
                    setTourDepartureEntries([]);
                  }
                }}
                className="rounded-2xl border border-violet-200 bg-violet-50 px-4 py-2 text-sm font-semibold text-violet-700 hover:bg-violet-100"
              >
                {tr('Close', 'Fermer')}
              </button>
            </div>

            <div className="mx-auto w-full max-w-6xl space-y-6 p-6">
              <div className="grid gap-4 lg:grid-cols-3">
                <div className="rounded-2xl border border-violet-100 bg-white p-4 shadow-sm">
                  <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-violet-400">{tr('Guests', 'Clients')}</p>
                  <p className="mt-2 text-lg font-black text-slate-900">{formatGuestSummary(tourToStart)}</p>
                </div>
                <div className="rounded-2xl border border-violet-100 bg-white p-4 shadow-sm">
                  <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-violet-400">{tr('Guide', 'Guide')}</p>
                  <p className="mt-2 text-lg font-black text-slate-900">{tourToStart.guideName}</p>
                </div>
                <div className="rounded-2xl border border-violet-100 bg-white p-4 shadow-sm">
                  <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-violet-400">{tr('Assigned Quads', 'Quads attribués')}</p>
                  <p className="mt-2 text-lg font-black text-slate-900">{tourDepartureEntries.length}</p>
                </div>
              </div>

              <div
                className={`grid gap-5 ${
                  tourDepartureEntries.length <= 1 ? 'mx-auto max-w-[760px] grid-cols-1' : '2xl:grid-cols-2'
                }`}
              >
                {tourDepartureEntries.map((entry) => (
                  <section
                    key={entry.vehicleId}
                    className="rounded-[28px] border border-violet-200/90 bg-white p-5 shadow-sm shadow-violet-100/60"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-violet-500">{tr('Quad Departure', 'Départ quad')}</p>
                        <h3 className="mt-2 text-xl font-black text-slate-900">{entry.vehicleName}</h3>
                        <p className="mt-2 text-sm text-slate-500">
                          {entry.sourceFuelLevel !== null && entry.sourceFuelLevel !== undefined
                            ? tr(`Fleet fuel source of truth: ${entry.sourceFuelLevel}/8`, `Source de vérité carburant flotte : ${entry.sourceFuelLevel}/8`)
                            : tr('No fleet fuel snapshot was found, so enter the departure fuel manually.', "Aucun relevé carburant flotte n'a été trouvé, saisissez le niveau de départ manuellement.")}
                        </p>
                      </div>
                    </div>

                    <div className="mt-5 grid gap-4 lg:grid-cols-2">
                      <div className="rounded-[24px] border border-violet-100 bg-violet-50/60 p-4">
                        <label className="text-sm font-semibold text-slate-700">{tr('Departure Odometer (km)', 'Odomètre de départ (km)')}</label>
                        <input
                          type="number"
                          min="0"
                          value={entry.startOdometer}
                          onChange={(event) => updateTourDepartureEntry(entry.vehicleId, 'startOdometer', event.target.value)}
                          className="mt-2 w-full rounded-2xl border border-violet-200 bg-white px-4 py-4 text-base font-semibold text-slate-900 focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-200"
                          placeholder={tr('Enter departure odometer', "Saisissez l'odomètre de départ")}
                        />
                      </div>

                      <div className="rounded-[24px] border border-violet-100 bg-violet-50/60 p-4">
                        <label className="text-sm font-semibold text-slate-700">{tr('Fuel Level Before Tour', 'Niveau de carburant avant le tour')}</label>
                        <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
                          {Array.from({ length: 9 }, (_, index) => index).map((level) => (
                            <button
                              key={level}
                              type="button"
                              onClick={() => updateTourDepartureEntry(entry.vehicleId, 'startFuelLevel', level)}
                              className={`rounded-2xl px-3 py-3 text-sm font-black transition-colors ${
                                Number(entry.startFuelLevel) === level
                                  ? 'bg-gradient-to-r from-violet-600 to-indigo-700 text-white shadow-sm'
                                  : 'bg-white text-slate-700 ring-1 ring-violet-100 hover:bg-violet-50'
                              }`}
                            >
                              {level}/8
                            </button>
                          ))}
                        </div>
                        <p className="mt-3 text-xs text-slate-500">
                          {tr('Staff can adjust the saved fleet fuel level if the gauge is slightly above or below.', "L'équipe peut ajuster le niveau carburant flotte si la jauge est légèrement au-dessus ou au-dessous.")}
                        </p>
                      </div>
                    </div>
                  </section>
                ))}
              </div>

              <div className="flex flex-col gap-4 border-t border-violet-200/70 pt-5 lg:flex-row lg:items-center lg:justify-between">
                <p className="max-w-2xl text-sm text-slate-500">
                  {tr('These departure values will be saved with the tour so fuel consumption can be compared against the return.', 'Ces valeurs de départ seront enregistrées avec le tour afin de comparer la consommation carburant au retour.')}
                </p>
                <div className="flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      if (!tourDepartureSaving) {
                        setTourStartModalOpen(false);
                        setTourToStart(null);
                        setTourDepartureEntries([]);
                      }
                    }}
                    className="rounded-2xl border border-violet-200 bg-white px-5 py-3 text-sm font-bold text-slate-700 hover:bg-violet-50"
                  >
                    {tr('Cancel', 'Annuler')}
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmTourStart}
                    disabled={tourDepartureSaving}
                    className="rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-700 px-5 py-3 text-sm font-bold text-white hover:from-emerald-700 hover:to-teal-800 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {tourDepartureSaving ? tr('Saving Departure...', 'Enregistrement du départ...') : tr('Save & Start Tour', 'Enregistrer et démarrer le tour')}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {tourReturnModalOpen && tourToComplete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[90vh] w-full max-w-[1120px] overflow-y-auto rounded-[32px] border border-violet-200/80 bg-gradient-to-br from-violet-50 via-white to-slate-50 shadow-2xl">
            <div className="sticky top-0 flex items-center justify-between border-b border-violet-200/70 bg-white/90 px-6 py-5 backdrop-blur">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-violet-500">Tour Return</p>
                <h2 className="mt-2 text-2xl font-black text-slate-900">Complete {tourToComplete.packageName}</h2>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (!tourReturnSaving) {
                    setTourReturnModalOpen(false);
                    setTourToComplete(null);
                    setTourReturnEntries([]);
                  }
                }}
                className="rounded-2xl border border-violet-200 bg-violet-50 px-4 py-2 text-sm font-semibold text-violet-700 hover:bg-violet-100"
              >
                {tr('Close', 'Fermer')}
              </button>
            </div>

            <div className="mx-auto w-full max-w-6xl space-y-6 p-6">
              <div className="grid gap-4 lg:grid-cols-3">
                <div className="rounded-2xl border border-violet-100 bg-white p-4 shadow-sm">
                  <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-violet-400">{tr('Guests', 'Clients')}</p>
                  <p className="mt-2 text-lg font-black text-slate-900">{formatGuestSummary(tourToComplete)}</p>
                </div>
                <div className="rounded-2xl border border-violet-100 bg-white p-4 shadow-sm">
                  <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-violet-400">{tr('Guide', 'Guide')}</p>
                  <p className="mt-2 text-lg font-black text-slate-900">{tourToComplete.guideName}</p>
                </div>
                <div className="rounded-2xl border border-violet-100 bg-white p-4 shadow-sm">
                  <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-violet-400">{tr('Assigned Quads', 'Quads attribués')}</p>
                  <p className="mt-2 text-lg font-black text-slate-900">{tourReturnEntries.length}</p>
                </div>
              </div>

              <div
                className={`grid gap-5 ${
                  tourReturnEntries.length <= 1 ? 'mx-auto max-w-[760px] grid-cols-1' : '2xl:grid-cols-2'
                }`}
              >
                {tourReturnEntries.map((entry) => (
                  <section
                    key={entry.vehicleId}
                    className="rounded-[28px] border border-violet-200/90 bg-white p-5 shadow-sm shadow-violet-100/60"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-violet-500">{tr('Quad Return', 'Retour quad')}</p>
                        <h3 className="mt-2 text-xl font-black text-slate-900">{entry.vehicleName}</h3>
                        <p className="mt-2 text-sm text-slate-500">{tr(`Starting from current vehicle odometer: ${entry.startOdometer} km`, `À partir de l’odomètre actuel du véhicule : ${entry.startOdometer} km`)}</p>
                        <p className="mt-1 text-sm font-semibold text-violet-700">
                          {entry.startFuelLevel !== null && entry.startFuelLevel !== undefined
                            ? tr(`Fuel before tour: ${entry.startFuelLevel}/8`, `Carburant avant le tour : ${entry.startFuelLevel}/8`)
                            : tr('Fuel before tour was not recorded', "Le carburant avant le tour n'a pas été enregistré")}
                        </p>
                        {entry.sourceFuelLevel !== null && entry.sourceFuelLevel !== undefined ? (
                          <p className="mt-1 text-xs text-slate-400">
                            {tr(`Fleet source at departure: ${entry.sourceFuelLevel}/8`, `Source flotte au départ : ${entry.sourceFuelLevel}/8`)}
                          </p>
                        ) : null}
                      </div>
                    </div>

                    <div className="mt-5 grid gap-4 lg:grid-cols-2">
                      <div className="rounded-[24px] border border-violet-100 bg-violet-50/60 p-4">
                        <label className="text-sm font-semibold text-slate-700">{tr('Ending Odometer (km)', 'Odomètre de retour (km)')}</label>
                        <input
                          type="number"
                          min={entry.startOdometer || 0}
                          value={entry.endOdometer}
                          onChange={(event) => updateTourReturnEntry(entry.vehicleId, 'endOdometer', event.target.value)}
                          className="mt-2 w-full rounded-2xl border border-violet-200 bg-white px-4 py-4 text-base font-semibold text-slate-900 focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-200"
                          placeholder={tr('Enter return odometer', "Saisissez l'odomètre de retour")}
                        />
                      </div>

                      <div className="rounded-[24px] border border-violet-100 bg-violet-50/60 p-4">
                        <label className="text-sm font-semibold text-slate-700">{tr('Fuel Level After Tour', 'Niveau de carburant après le tour')}</label>
                        <p className="mt-1 text-xs font-semibold text-violet-700">
                          {entry.startFuelLevel !== null && entry.startFuelLevel !== undefined
                            ? tr(`Before: ${entry.startFuelLevel}/8`, `Avant : ${entry.startFuelLevel}/8`)
                            : tr('Before: not recorded', 'Avant : non enregistré')}
                        </p>
                        <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
                          {Array.from({ length: 9 }, (_, index) => index).map((level) => (
                            <button
                              key={level}
                              type="button"
                              onClick={() => updateTourReturnEntry(entry.vehicleId, 'fuelLevel', level)}
                              className={`rounded-2xl px-3 py-3 text-sm font-black transition-colors ${
                                Number(entry.fuelLevel) === level
                                  ? 'bg-gradient-to-r from-violet-600 to-indigo-700 text-white shadow-sm'
                                  : 'bg-white text-slate-700 ring-1 ring-violet-100 hover:bg-violet-50'
                              }`}
                            >
                              {level}/8
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </section>
                ))}
              </div>

              <div className="flex flex-col gap-4 border-t border-violet-200/70 pt-5 lg:flex-row lg:items-center lg:justify-between">
                <p className="max-w-2xl text-sm text-slate-500">
                  {tr('The guide who completes this step will be recorded in the tour return activity.', 'Le guide qui termine cette étape sera enregistré dans l’activité de retour du tour.')}
                </p>
                <div className="flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      if (!tourReturnSaving) {
                        setTourReturnModalOpen(false);
                        setTourToComplete(null);
                        setTourReturnEntries([]);
                      }
                    }}
                    className="rounded-2xl border border-violet-200 bg-white px-5 py-3 text-sm font-bold text-slate-700 hover:bg-violet-50"
                  >
                    {tr('Cancel', 'Annuler')}
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmTourReturn}
                    disabled={tourReturnSaving}
                    className="rounded-2xl bg-gradient-to-r from-violet-700 to-indigo-800 px-5 py-3 text-sm font-bold text-white hover:from-violet-800 hover:to-indigo-900 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {tourReturnSaving ? tr('Saving Return...', 'Enregistrement du retour...') : tr('Complete Tour Return', 'Terminer le retour du tour')}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {tourDetailsOpen && selectedTourDetails && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/35" onClick={closeTourDetails}>
          <aside
            className="h-full w-full max-w-3xl overflow-y-auto border-l border-slate-200 bg-white shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 px-6 py-5 backdrop-blur">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-blue-600/80">Tour History Details</p>
                  <h2 className="mt-2 text-2xl font-semibold text-slate-900">{selectedTourDetails.packageName}</h2>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-3 py-1 text-xs font-semibold capitalize ${toStatusTone(selectedTourDetails.status)}`}>
                      {getTourStatusLabel(selectedTourDetails.status)}
                    </span>
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700 capitalize">
                      {selectedTourDetails.routeType}
                    </span>
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                      {selectedTourDetails.quadCount} quads
                    </span>
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                      {selectedTourDetails.ridersCount} riders
                    </span>
                  </div>
                  {selectedTourDetails.status === 'scheduled' ? (
                    <div className="mt-4 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => handleUpdateTourStatus(selectedTourDetails, 'no_show')}
                        className="rounded-xl border border-orange-200 bg-orange-50 px-3 py-2 text-xs font-semibold text-orange-700 hover:bg-orange-100"
                      >
                        {tr('Mark no-show', 'Marquer no-show')}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleUpdateTourStatus(selectedTourDetails, 'expired')}
                        className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700 hover:bg-amber-100"
                      >
                        {tr('Mark expired', 'Marquer expiré')}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleUpdateTourStatus(selectedTourDetails, 'cancelled')}
                        className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-100"
                      >
                        {tr('Cancel tour', 'Annuler le tour')}
                      </button>
                    </div>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={closeTourDetails}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-700 hover:bg-slate-200"
                  aria-label="Close tour details"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="space-y-6 px-6 py-6">
              <section className="grid gap-4 md:grid-cols-2">
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-5">
                  <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400">{tr('Guests', 'Clients')}</p>
                  <p className="mt-2 text-xl font-semibold text-slate-900">{formatGuestSummary(selectedTourDetails)}</p>
                  <div className="mt-3 space-y-2 text-sm text-slate-600">
                    <p>{selectedTourDetails.customerPhone || tr('No phone saved', 'Aucun téléphone enregistré')}</p>
                    <p>{selectedTourDetails.customerEmail || tr('No email saved', 'Aucun e-mail enregistré')}</p>
                    <p>{tr('ID Number', "Numéro d'identité")} : {selectedTourDetails.idNumber || tr('Not saved', 'Non enregistré')}</p>
                    <p>
                      {tr('License', 'Permis')} :
                      {' '}
                      {selectedTourDetails.requiresLicense
                        ? (selectedTourDetails.licenseNumber || tr('Required but not saved', 'Requis mais non enregistré'))
                        : tr('Not needed', 'Non nécessaire')}
                    </p>
                  </div>
                </div>

                <div className="rounded-lg border border-slate-200 bg-slate-50 p-5">
                  <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400">{tr('Schedule', 'Planning')}</p>
                  <div className="mt-3 overflow-hidden rounded-lg border border-slate-200 bg-white">
                    {[
                      [tr('Departure', 'Départ'), formatDateTime(selectedTourDetails.scheduledStartAt)],
                      [tr('Expected End', 'Fin prévue'), formatDateTime(selectedTourDetails.scheduledEndAt)],
                      [tr('Started', 'Démarré'), selectedTourDetails.startedAt ? formatDateTime(selectedTourDetails.startedAt) : tr('Not started yet', 'Pas encore démarré')],
                      [tr('Completed', 'Terminé'), selectedTourDetails.completedAt ? formatDateTime(selectedTourDetails.completedAt) : tr('Not completed yet', 'Pas encore terminé')],
                      [tr('Actual Duration', 'Durée réelle'), getTourTimingSummary(selectedTourDetails).actualDurationLabel],
                      [tr('Overrun', 'Dépassement'), getTourTimingSummary(selectedTourDetails).overrunLabel],
                      [tr('Guide', 'Guide'), selectedTourDetails.guideName],
                      [tr('Booked By', 'Réservé par'), selectedTourDetails.bookedByName],
                    ].map(([label, value], rowIndex) => (
                      <div
                        key={`${label}-${rowIndex}`}
                        className={`grid gap-1 px-4 py-3 text-sm md:grid-cols-[140px_1fr] md:gap-3 ${rowIndex !== 0 ? 'border-t border-slate-100' : ''}`}
                      >
                        <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-400">{label}</p>
                        <p className="font-medium text-slate-700 break-words">{value}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </section>

              <section className="rounded-xl border border-slate-200 bg-white p-5">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-slate-700" />
                  <h3 className="text-lg font-semibold text-slate-900">Driver roster</h3>
                </div>
                <p className="mt-2 text-sm text-slate-500">
                  Each quad keeps its main driver, with optional second-driver details when someone may switch and drive.
                </p>

                {selectedTourDetails.primaryDrivers?.length ? (
                  <div className="mt-4 grid gap-4 md:grid-cols-2">
                    {selectedTourDetails.primaryDrivers.map((driver, index) => {
                      const secondDriver = selectedTourDetails.secondaryDrivers?.find(
                        (entry) => Number(entry.quadNumber) === Number(driver.quadNumber)
                      );

                      return (
                        <article key={`drawer-driver-${index}`} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                          <p className="text-base font-semibold text-slate-900">{tr(`Quad ${driver.quadNumber || index + 1}`, `Quad ${driver.quadNumber || index + 1}`)}</p>
                          <div className="mt-3 overflow-hidden rounded-lg border border-slate-200 bg-white">
                            {[
                              { label: tr('Main Driver', 'Conducteur principal'), value: driver.fullName || tr('Not saved', 'Non enregistré') },
                              { label: tr('Main WhatsApp', 'WhatsApp principal'), value: driver.whatsapp || tr('Not saved', 'Non enregistré') },
                              { label: tr('Main ID', 'Pièce principale'), value: driver.idNumber || tr('Optional / empty', 'Optionnel / vide') },
                              {
                                label: tr('Main Scan', 'Scan principal'),
                                value: driver.idFileName ? tr('Captured', 'Capturé') : tr('Optional / empty', 'Optionnel / vide'),
                                href: driver.idFileUrl || '',
                              },
                              {
                                label: tr('Main License', 'Permis principal'),
                                value: selectedTourDetails.requiresLicense
                                  ? (driver.licenseNumber || tr('Required but not saved', 'Requis mais non enregistré'))
                                  : (driver.licenseNumber || tr('Optional / empty', 'Optionnel / vide')),
                              },
                            ].map(({ label, value, href }, rowIndex) => (
                              <div
                                key={`${label}-${rowIndex}`}
                                className={`grid gap-1 px-4 py-3 text-sm md:grid-cols-[140px_1fr] md:gap-3 ${rowIndex !== 0 ? 'border-t border-slate-100' : ''}`}
                              >
                                <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-400">{label}</p>
                                <div className="flex flex-wrap items-center gap-2">
                                  <p className="font-medium text-slate-700 break-words">{value}</p>
                                  {href && (
                                    <a
                                      href={href}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="text-xs font-semibold text-violet-700 hover:underline"
                                    >
                                      {tr('View scan', 'Voir le scan')}
                                    </a>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                          <div className="mt-4 border-t border-slate-200 pt-4 text-sm text-slate-600">
                            <p className="font-medium text-slate-900">{tr('Optional second driver', 'Second conducteur optionnel')}</p>
                            {secondDriver ? (
                              <div className="mt-3 overflow-hidden rounded-lg border border-slate-200 bg-white">
                                {[
                                  { label: tr('Name', 'Nom'), value: secondDriver.fullName || tr('Not saved', 'Non enregistré') },
                                  { label: tr('WhatsApp', 'WhatsApp'), value: secondDriver.whatsapp || tr('Not saved', 'Non enregistré') },
                                  { label: tr('ID', 'Pièce'), value: secondDriver.idNumber || tr('Optional / empty', 'Optionnel / vide') },
                                  {
                                    label: tr('Scan', 'Scan'),
                                    value: secondDriver.idFileName ? tr('Captured', 'Capturé') : tr('Optional / empty', 'Optionnel / vide'),
                                    href: secondDriver.idFileUrl || '',
                                  },
                                  {
                                    label: tr('License', 'Permis'),
                                    value: selectedTourDetails.requiresLicense
                                      ? (secondDriver.licenseNumber || tr('Required but not saved', 'Requis mais non enregistré'))
                                      : (secondDriver.licenseNumber || tr('Optional / empty', 'Optionnel / vide')),
                                  },
                                ].map(({ label, value, href }, rowIndex) => (
                                  <div
                                    key={`${label}-${rowIndex}`}
                                    className={`grid gap-1 px-4 py-3 text-sm md:grid-cols-[140px_1fr] md:gap-3 ${rowIndex !== 0 ? 'border-t border-slate-100' : ''}`}
                                  >
                                    <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-400">{label}</p>
                                    <div className="flex flex-wrap items-center gap-2">
                                      <p className="font-medium text-slate-700 break-words">{value}</p>
                                      {href && (
                                        <a
                                          href={href}
                                          target="_blank"
                                          rel="noreferrer"
                                          className="text-xs font-semibold text-violet-700 hover:underline"
                                        >
                                          {tr('View scan', 'Voir le scan')}
                                        </a>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div className="mt-3 rounded-lg border border-dashed border-slate-200 bg-white px-4 py-3 text-sm text-slate-500">
                                No second driver recorded for this quad.
                              </div>
                            )}
                          </div>
                        </article>
                      );
                    })}
                  </div>
                ) : (
                  <div className="mt-4 rounded-lg border border-dashed border-slate-200 bg-slate-50 p-5 text-sm text-slate-500">
                    No per-quad driver roster was saved for this tour.
                  </div>
                )}
              </section>

              <section className="grid gap-4 md:grid-cols-2">
                <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-5">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-blue-600" />
                    <p className="text-sm font-semibold text-slate-900">{tr('Documents', 'Documents')}</p>
                  </div>
                  <div className="mt-4 space-y-2 text-sm text-slate-600">
                    <p>{selectedTourDetails.idCaptured ? tr('ID captured before departure', 'Pièce capturée avant le départ') : tr('ID not captured', 'Pièce non capturée')}</p>
                    <p>
                      {selectedTourDetails.requiresLicense
                        ? (selectedTourDetails.licenseCaptured ? tr('License captured before departure', 'Permis capturé avant le départ') : tr('License missing', 'Permis manquant'))
                        : tr('License not needed for this route', "Permis non nécessaire pour cet itinéraire")}
                    </p>
                    <p>{selectedTourDetails.shareContract ? tr('Contract sharing enabled', 'Partage du contrat activé') : tr("Contract was optional and not shared", "Le contrat était optionnel et n'a pas été partagé")}</p>
                    <p>{selectedTourDetails.receiptIssued ? tr('Receipt marked issued/shared', 'Reçu marqué comme émis/partagé') : tr('Receipt still pending', 'Reçu encore en attente')}</p>
                  </div>
                </div>

                <div className="rounded-lg border border-indigo-200 bg-indigo-50/50 p-5">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-indigo-600" />
                    <p className="text-sm font-semibold text-slate-900">Financial Summary</p>
                  </div>
                  <div className="mt-4 space-y-2 text-sm text-slate-600">
                    <p>Total amount: {formatCurrencyMAD(selectedTourDetails.totalAmount)} MAD</p>
                    <p>Assignment mode: {selectedTourDetails.assignmentMode === 'assign_on_arrival' ? 'Assign on departure' : 'Assigned at booking/start'}</p>
                    <p>Created: {formatDateTime(selectedTourDetails.createdAt)}</p>
                    <p>Group ID: {selectedTourDetails.groupId}</p>
                  </div>
                </div>
              </section>

              <section className="rounded-xl border border-slate-200 bg-white p-5">
                <div className="flex items-center gap-2">
                  <Gauge className="h-4 w-4 text-slate-700" />
                  <h3 className="text-lg font-semibold text-slate-900">Vehicle exit & return record</h3>
                </div>
                <p className="mt-2 text-sm text-slate-500">
                  Odometer and fuel on exit and return, based on fleet fuel state first and adjusted by staff when needed.
                </p>

                {selectedTourReturnRows.length === 0 ? (
                  <div className="mt-4 rounded-lg border border-dashed border-slate-200 bg-slate-50 p-5 text-sm text-slate-500">
                    No vehicle return details were saved for this tour yet.
                  </div>
                ) : (
                  <div className="mt-4 grid gap-4 md:grid-cols-2">
                    {selectedTourReturnRows.map((entry) => (
                      <article key={entry.vehicleId} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                        <p className="text-base font-semibold text-slate-900">{entry.vehicleName}</p>
                        <div className="mt-4 grid gap-3 sm:grid-cols-2">
                          <div className="rounded-lg bg-white p-4">
                            <div className="flex items-center gap-2">
                              <Gauge className="h-4 w-4 text-blue-600" />
                              <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400">Exit Odometer</p>
                            </div>
                            <p className="mt-2 text-lg font-semibold text-slate-900">
                              {entry.startOdometer !== null && entry.startOdometer !== undefined ? `${entry.startOdometer} km` : 'Not recorded'}
                            </p>
                          </div>
                          <div className="rounded-lg bg-white p-4">
                            <div className="flex items-center gap-2">
                              <Gauge className="h-4 w-4 text-emerald-600" />
                              <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400">Return Odometer</p>
                            </div>
                            <p className="mt-2 text-lg font-semibold text-slate-900">
                              {entry.endOdometer !== null && entry.endOdometer !== undefined ? `${entry.endOdometer} km` : 'Pending'}
                            </p>
                          </div>
                          <div className="rounded-lg bg-white p-4">
                            <div className="flex items-center gap-2">
                              <Fuel className="h-4 w-4 text-blue-600" />
                              <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400">Fuel At Departure</p>
                            </div>
                            <p className="mt-2 text-lg font-semibold text-slate-900">
                              {entry.startFuelLevel !== null && entry.startFuelLevel !== undefined ? `${entry.startFuelLevel}/8` : 'Not recorded'}
                            </p>
                            {entry.sourceFuelLevel !== null && entry.sourceFuelLevel !== undefined ? (
                              <p className="mt-1 text-xs text-slate-400">Fleet state: {entry.sourceFuelLevel}/8</p>
                            ) : null}
                          </div>
                          <div className="rounded-lg bg-white p-4 sm:col-span-2">
                            <div className="flex items-center gap-2">
                              <Fuel className="h-4 w-4 text-amber-600" />
                              <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400">Fuel After Tour</p>
                            </div>
                            <p className="mt-2 text-lg font-semibold text-slate-900">
                              {entry.fuelLevel !== null && entry.fuelLevel !== undefined ? `${entry.fuelLevel}/8` : 'Pending'}
                            </p>
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </section>

              {!!selectedTourDetails.notes && (
                <section className="rounded-xl border border-slate-200 bg-slate-50 p-5">
                  <div className="flex items-center gap-2">
                    <ClipboardList className="h-4 w-4 text-slate-700" />
                    <h3 className="text-lg font-semibold text-slate-900">Staff Notes</h3>
                  </div>
                  <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-600">{selectedTourDetails.notes}</p>
                </section>
              )}

              <section className="rounded-xl border border-slate-200 bg-white p-5">
                <div className="flex items-center gap-2">
                  <History className="h-4 w-4 text-slate-700" />
                  <h3 className="text-lg font-semibold text-slate-900">Activity Timeline</h3>
                </div>
                <p className="mt-2 text-sm text-slate-500">
                  Booking, departure, completion, receipts, and any saved activity logs for this tour.
                </p>

                {tourActivityLoading ? (
                  <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-5 text-sm text-slate-500">
                    Loading activity logs...
                  </div>
                ) : selectedTourTimeline.length === 0 ? (
                  <div className="mt-4 rounded-lg border border-dashed border-slate-200 bg-slate-50 p-5 text-sm text-slate-500">
                    No activity logs were found for this tour yet.
                  </div>
                ) : (
                  <div className="mt-4 space-y-3">
                    {selectedTourTimeline.map((item) => (
                      <article key={item.id} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <p className="font-semibold text-slate-900">{item.title}</p>
                            <p className="mt-1 text-sm leading-6 text-slate-600">{item.description}</p>
                            {item.actor && (
                              <p className="mt-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
                                By {item.actor}
                              </p>
                            )}
                          </div>
                          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
                            {formatLogTimestamp(item.timestamp)}
                          </p>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </section>
            </div>
          </aside>
        </div>
      )}
        </div>
      </div>
    </div>
  );
};

export default ToursPage;
