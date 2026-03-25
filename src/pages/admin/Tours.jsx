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
import { useAuth } from '../../contexts/AuthContext';
import { TABLE_NAMES } from '../../config/tableNames';
import EnhancedUnifiedIDScanModal from '../../components/customers/EnhancedUnifiedIDScanModal';
import { canChooseTourGuide } from '../../utils/permissionHelpers';
import { fetchVehicles } from '../../store/slices/vehiclesSlice';
import FuelTransactionService from '../../services/FuelTransactionService';
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

// Returns today's date as YYYY-MM-DD in the device's local timezone (not UTC)
const localToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
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

const createInitialReturnEntry = (vehicle) => ({
  vehicleId: vehicle.id,
  vehicleName: `${vehicle.plate_number || 'No plate'} • ${vehicle.name || 'SEGWAY'} ${vehicle.model || ''}`.trim(),
  startOdometer: Number(vehicle.current_odometer || 0),
  endOdometer: vehicle.current_odometer !== null && vehicle.current_odometer !== undefined && vehicle.current_odometer !== ''
    ? String(vehicle.current_odometer)
    : '',
  fuelLevel: '',
});

const tabs = [
  { id: 'schedule', label: 'Schedule', icon: CalendarDays },
  { id: 'bookings', label: 'Book Tour', icon: Compass },
];

const tabDescriptions = {
  schedule: {
    title: 'Operational board',
    description: 'Track active tours, scheduled departures, and completed tour history in one place.',
  },
  bookings: {
    title: 'Tour booking flow',
    description: 'Create fast staff tour bookings with package rules, driver details, and vehicle assignment.',
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
    return `From ${fallbackPrice} MAD`;
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
    return { isValid: false, link: '', helper: 'Saved in WhatsApp format for quick contact.' };
  }

  const compactValue = formatted.replace(/\s/g, '');
  const digitsOnly = compactValue.replace(/\D/g, '');

  if (!compactValue.startsWith('+')) {
    return { isValid: false, link: '', helper: 'Saved in WhatsApp format for quick contact.' };
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
  fullName: '',
  whatsapp: '',
  idNumber: '',
  licenseNumber: '',
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
    String(driver?.idNumber || '').trim() ||
    String(driver?.licenseNumber || '').trim() ||
    String(driver?.idFileName || '').trim()
  );

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

const toStatusTone = (status) => {
  switch (String(status || '').toLowerCase()) {
    case 'active':
    case 'in_progress':
      return 'bg-emerald-100 text-emerald-700';
    case 'completed':
      return 'bg-slate-200 text-slate-700';
    case 'cancelled':
      return 'bg-rose-100 text-rose-700';
    default:
      return 'bg-blue-100 text-blue-700';
  }
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

  return (
    <div className="w-full rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3 mb-3">
        <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-violet-500">Tour Timer</p>
        <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
          Active
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-3 text-center shadow-sm">
          <p className="text-xs sm:text-sm text-gray-600 font-medium">Time Elapsed</p>
          <p className="mt-1 text-2xl sm:text-3xl font-bold break-all text-emerald-600">
            {formatDuration(elapsedMs)}
          </p>
        </div>
        <div className={`rounded-xl border px-3 py-3 text-center shadow-sm ${isLate ? 'border-red-200 bg-red-50' : 'border-blue-200 bg-blue-50'}`}>
          {isLate && (
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-red-500">Expired</p>
          )}
          <p className="text-xs sm:text-sm text-gray-600 font-medium">Time Remaining</p>
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
  const vehicles = useSelector((state) => state.vehicles?.vehicles || []);
  const userRole = String(userProfile?.role || '').toLowerCase();
  const canSelectTourGuide = canChooseTourGuide(userProfile);
  const canManageTourPackages = ['owner', 'admin'].includes(String(userProfile?.role || '').toLowerCase());
  const canManagePackages = ['admin', 'owner'].includes(userRole);
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
  const [tourPricingRows, setTourPricingRows] = useState([]);
  const [schedulePage, setSchedulePage] = useState(1);
  const [completedPage, setCompletedPage] = useState(1);
  const [historyCollapsed, setHistoryCollapsed] = useState(true);
  const [tourDetailsOpen, setTourDetailsOpen] = useState(false);
  const [selectedTourDetails, setSelectedTourDetails] = useState(null);
  const [tourActivityLogs, setTourActivityLogs] = useState([]);
  const [tourActivityLoading, setTourActivityLoading] = useState(false);
  const [trackedTours, setTrackedTours] = useState([]);
  const [isMobileDevice, setIsMobileDevice] = useState(false);
  const autoClosedGroupsRef = useRef(new Set());
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
      const { data, error } = await supabase
        .from(TABLE_NAMES.USERS)
        .select('id, full_name, email, role, access_enabled, phone_number')
        .neq('access_enabled', false)
        .order('full_name', { ascending: true });

      if (error) {
        console.error('Failed to load guides:', error);
        setGuides([]);
      } else {
        const normalized = (data || [])
          .filter((user) => ['guide', 'employee', 'admin', 'owner'].includes(String(user.role || '').toLowerCase()))
          .map((user) => ({
            id: user.id,
            name: user.full_name || user.email || 'Team Member',
            role: user.role || 'employee',
            phone: user.phone_number || '',
          }));
        setGuides(normalized);
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
      return `From ${startingPrice} MAD`;
    }

    return getLegacyPackagePricingBadge(pkg);
  };
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
              : 'scheduled';

        const assignedVehicles = sortedRows.map((row) => row.vehicle).filter(Boolean);

        return {
          groupId,
          rowIds: sortedRows.map((row) => row.id),
          status,
          packageName: meta.packageName || 'Tour package',
          durationHours: Number(meta.durationHours || 1),
          routeType: meta.routeType || 'mountain',
          customerName: first.customer_name || meta.customerName || 'Guest',
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
          trackingUrl: meta.trackingUrl || buildTourTrackingUrl(groupId),
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
          bookingStartWithinHour: startsWithinOneHour(meta.scheduledStartAt || first.rental_start_date),
        };
      })
      .sort((a, b) => new Date(a.scheduledStartAt).getTime() - new Date(b.scheduledStartAt).getTime());
  }, [allTourRows]);

  useEffect(() => {
    const staleTours = groupedTours.filter((tour) => {
      if (tour.status !== 'scheduled') return false;
      if (autoClosedGroupsRef.current.has(tour.groupId)) return false;
      const start = new Date(tour.scheduledStartAt);
      if (Number.isNaN(start.getTime())) return false;
      if (Date.now() - start.getTime() <= 60 * 60 * 1000) return false;
      // Don't auto-cancel tours created within the last 10 minutes
      const created = new Date(tour.createdAt);
      if (!Number.isNaN(created.getTime()) && Date.now() - created.getTime() < 10 * 60 * 1000) return false;
      return true;
    });

    if (staleTours.length === 0) return;

    const autoClose = async () => {
      for (const tour of staleTours) {
        autoClosedGroupsRef.current.add(tour.groupId);
        try {
          await updateTourBookingStatus(tour.rowIds, 'cancelled');
        } catch (error) {
          console.error('Failed to auto-close stale tour:', error);
        }
      }

      if (staleTours.length > 0) {
        toast('Late scheduled tours were auto-closed after 60 minutes.', { icon: '⏱️' });
        setRefreshKey((prev) => prev + 1);
      }
    };

    autoClose();
  }, [groupedTours]);

  const activeBlockingRows = useMemo(() => {
    return (Array.isArray(bookings) ? bookings : []).filter((row) => {
      const status = String(row.rental_status || row.status || '').toLowerCase();
      return !['completed', 'cancelled'].includes(status);
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
  }, [vehicleModels, availableModelGroups, pricedModelIdsForCurrentPackage]);

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
  const activePrimaryDriverWhatsApp = getWhatsAppAvailability(activePrimaryDriver.whatsapp);
  const activeSecondaryDriverWhatsApp = getWhatsAppAvailability(activeSecondaryDriver.whatsapp);
  const secondDriverOpen =
    secondDriverOpenByQuad[activeDriverQuadIndex] ?? hasAnyDriverValue(activeSecondaryDriver);

  useEffect(() => {
    if (activeDriverQuadIndex > Math.max(0, Number(bookingForm.quadCount || 1) - 1)) {
      setActiveDriverQuadIndex(0);
    }
  }, [activeDriverQuadIndex, bookingForm.quadCount]);

  const today = localToday();
  const upcomingTours = groupedTours.filter((tour) => new Date(tour.scheduledStartAt).getTime() >= Date.now());
  const todayTours = groupedTours.filter((tour) => String(tour.scheduledStartAt || '').startsWith(today));
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
  const operationalTours = useMemo(() => [...activeTours, ...scheduledTours], [activeTours, scheduledTours]);
  const operationalPageSize = 4;
  const completedPageSize = 4;
  const operationalPageCount = Math.max(1, Math.ceil(operationalTours.length / operationalPageSize));
  const completedHistoryTours = useMemo(() => [...completedTours, ...cancelledTours], [completedTours, cancelledTours]);
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
          ? { ...driver, [field]: field === 'whatsapp' ? formatWhatsAppPhoneNumber(value) : value }
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
      toast.success('ID image saved. You can enter the guest details manually.');
      return;
    }

    if (scannedData.ocrUnavailable) {
      toast('ID image captured. OCR is unavailable, so please enter the name and ID number manually.', {
        icon: '⚠️',
      });
      return;
    }

    setGuestIDScanOpen(false);
    toast.success('Guest ID scanned. Review the fields and continue.');
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
      toast.success('ID image saved. Fill the fields manually if needed.');
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
    updater(driverIDScanTarget.index, 'licenseNumber', String(scannedLicenseNumber || '').trim());
    updater(driverIDScanTarget.index, 'idNumber', scannedLicenseNumber ? '' : String(scannedIdNumber || '').trim());

    if (scannedData.ocrUnavailable) {
      toast('ID image captured. OCR is unavailable, so please enter the name and license manually.', {
        icon: '⚠️',
      });
      return;
    }

    setDriverIDScanTarget(null);
    toast.success('Driver ID scanned. Review the fields and continue.');
  };

  const handleOpenTourReturnModal = (tour) => {
    if (!tour?.assignedVehicles?.length) {
      toast.error('Assign the tour vehicles before completing the return');
      return;
    }

    setTourToComplete(tour);
    setTourReturnEntries(
      tour.assignedVehicles.map((vehicle) => createInitialReturnEntry(vehicle))
    );
    setTourReturnModalOpen(true);
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
          completedAt: new Date().toISOString(),
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

      await logTourReturnActivity(tourToComplete, tourReturnEntries);
      await logTourActivity(
        tourToComplete,
        'tour_completed',
        `Tour completed by ${tourToComplete.guideName || 'guide'} with ${tourReturnEntries.length} vehicle return checks recorded.`,
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
      toast.success('Tour return recorded and completed successfully');
      setRefreshKey((prev) => prev + 1);
    } catch (error) {
      console.error('Failed to complete tour return:', error);
      toast.error(`Could not complete the tour return: ${error.message}`);
    } finally {
      setTourReturnSaving(false);
    }
  };

  const handleUpdateTourStatus = async (tour, status) => {
    try {
      if (status === 'active') {
        if (tour.requiresLicense && !tour.licenseCaptured) {
          toast.error('Driver license scan is required before departure');
          return;
        }
        const needsAssignment = (tour.assignedVehicles?.length || 0) < Number(tour.quadCount || 0);
        if (needsAssignment) {
          const assignableVehicles = getAssignableVehiclesForTour(tour);
          const requestedModelMix = Array.isArray(tour.selectedModelMix) ? tour.selectedModelMix : [];
          const modelBasedSelection = requestedModelMix.length > 0
            ? buildVehiclesForModelMix(assignableVehicles, requestedModelMix)
            : { selectedVehicles: assignableVehicles.slice(0, Number(tour.quadCount || 1)), missingModels: [] };
          const availableNow = modelBasedSelection.selectedVehicles;

          if (modelBasedSelection.missingModels?.length > 0) {
            toast.error(`Not enough free quads for ${modelBasedSelection.missingModels[0].label}`);
            return;
          }
          if (availableNow.length < Number(tour.quadCount || 1)) {
            toast.error('Not enough free quads to start this tour right now');
            return;
          }
          const startedAt = new Date().toISOString();
          await assignTourVehicles(tour.rowIds, availableNow.map((vehicle) => vehicle.id), 'active');
          await updateTourMetadata(tour, {
            trackingUrl: buildTourTrackingUrl(tour.groupId),
            assignedVehicleIds: availableNow.map((vehicle) => vehicle.id),
            assignedVehiclePlates: availableNow.map((vehicle) => vehicle.plate_number),
            assignmentMode: 'assigned_now',
            startedAt,
            startedByUserId: userProfile?.id || null,
            startedByName: userProfile?.full_name || userProfile?.fullName || userProfile?.name || userProfile?.email || 'Team Member',
            departureEntries: availableNow.map((vehicle) => ({
              vehicleId: vehicle.id,
              vehicleName: `${vehicle.plate_number || 'No plate'} • ${vehicle.name || 'SEGWAY'} ${vehicle.model || ''}`.trim(),
              startOdometer: Number(vehicle.current_odometer || 0),
              startedAt,
            })),
          });
          await logTourActivity(
            tour,
            'tour_started',
            `Tour started and ${availableNow.length} quad(s) were assigned.`,
            {
              assigned_vehicle_ids: availableNow.map((vehicle) => vehicle.id),
              started_at: startedAt,
            }
          );
          toast.success('Tour started and quads assigned');
          setRefreshKey((prev) => prev + 1);
          return;
        }
        const startedAt = new Date().toISOString();
        await updateTourMetadata(tour, {
          trackingUrl: buildTourTrackingUrl(tour.groupId),
          startedAt,
          startedByUserId: userProfile?.id || null,
          startedByName: userProfile?.full_name || userProfile?.fullName || userProfile?.name || userProfile?.email || 'Team Member',
          departureEntries: tour.assignedVehicles.map((vehicle) => ({
            vehicleId: vehicle.id,
            vehicleName: `${vehicle.plate_number || 'No plate'} • ${vehicle.name || 'SEGWAY'} ${vehicle.model || ''}`.trim(),
            startOdometer: Number(vehicle.current_odometer || 0),
            startedAt,
          })),
        }, 'active');
        await logTourActivity(
          tour,
          'tour_started',
          `Tour started with ${tour.assignedVehicles.length} assigned quad(s).`,
          {
            assigned_vehicle_ids: tour.assignedVehicles.map((vehicle) => vehicle.id),
            started_at: startedAt,
          }
        );
        toast.success('Tour started');
        setRefreshKey((prev) => prev + 1);
        return;
      }

      if (status === 'completed') {
        await updateTourMetadata(tour, {
          receiptIssued: true,
          receiptIssuedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
        }, 'completed');
        toast.success('Tour completed and receipt marked as required/shared');
        setRefreshKey((prev) => prev + 1);
        return;
      }

      if (status === 'cancelled') {
        const confirmed = window.confirm('Are you sure you want to cancel this tour?');
        if (!confirmed) {
          return;
        }

        await updateTourMetadata(tour, {
          cancelledAt: new Date().toISOString(),
          cancelledByUserId: userProfile?.id || null,
          cancelledByName: userProfile?.full_name || userProfile?.fullName || userProfile?.name || userProfile?.email || 'Team Member',
        }, 'cancelled');
        await logTourActivity(
          tour,
          'tour_cancelled',
          'Tour was cancelled from the schedule board.',
          {
            cancelled_at: new Date().toISOString(),
          }
        );
        toast.success('Tour marked cancelled');
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
        toast.error('Choose date and departure time');
        return false;
      }
      if (new Date(`${bookingForm.date}T${bookingForm.time}:00`) < new Date(Date.now() - 30 * 60 * 1000)) {
        toast.error('Departure time cannot be in the past');
        return false;
      }
      if (availabilitySnapshot.availableCapacity < Number(bookingForm.quadCount || 1)) {
        toast.error('Not enough quad capacity available for this time slot');
        return false;
      }
      if (selectedModelCount !== Number(bookingForm.quadCount || 1)) {
        toast.error('Select the quad model mix so it matches the number of quads');
        return false;
      }
      if (missingModelPricing.length > 0) {
        toast.error(`Set tour pricing first for ${missingModelPricing[0].label}`);
        return false;
      }
      return true;
    }

    if (bookingStep === 2) {
      if (canSelectTourGuide && !bookingForm.guideId) {
        toast.error('Choose a tour guide');
        return false;
      }
      if (Number(bookingForm.ridersCount || 1) > Number(bookingForm.quadCount || 1) * 2) {
        toast.error('Maximum two riders per quad');
        return false;
      }
      for (let index = 0; index < primaryDrivers.length; index += 1) {
        const driver = primaryDrivers[index];
        if (!String(driver.fullName || '').trim()) {
          toast.error(`Enter the main driver name for quad ${index + 1}`);
          return false;
        }
        if (!String(driver.whatsapp || '').trim()) {
          toast.error(`Enter the WhatsApp number for quad ${index + 1}`);
          return false;
        }
        if (currentPackage?.requiresLicense && !String(driver.licenseNumber || '').trim()) {
          toast.error(`Enter the main driver license number for quad ${index + 1}`);
          return false;
        }
      }
      for (let index = 0; index < secondaryDrivers.length; index += 1) {
        const driver = secondaryDrivers[index];
        if (!hasAnyDriverValue(driver)) continue;
        if (!String(driver.fullName || '').trim()) {
          toast.error(`Enter the second driver name for quad ${index + 1}`);
          return false;
        }
        if (!String(driver.whatsapp || '').trim()) {
          toast.error(`Enter the second driver WhatsApp for quad ${index + 1}`);
          return false;
        }
        if (currentPackage?.requiresLicense && !String(driver.licenseNumber || '').trim()) {
          toast.error(`Enter the second driver license number for quad ${index + 1}`);
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
      toast.error('Not enough quad capacity available');
      return;
    }

    if (shouldAssignVehiclesNow && assignedVehicles.length < quadCount) {
      toast.error('Not enough free quads right now');
      return;
    }
    if (selectedModelCount !== quadCount) {
      toast.error('Match the quad count with the selected model mix');
      return;
    }
    if (missingModelPricing.length > 0) {
      toast.error(`Missing pricing for ${missingModelPricing[0].label}`);
      return;
    }

    const groupId = `TOUR-${Date.now().toString(36).toUpperCase()}`;
    const totalAmount = calculatedTourTotal;
    const normalizedPrimaryDrivers = primaryDrivers.map((driver, index) => ({
      quadNumber: index + 1,
      fullName: String(driver.fullName || '').trim(),
      whatsapp: String(driver.whatsapp || '').trim(),
      idNumber: String(driver.idNumber || '').trim(),
      licenseNumber: String(driver.licenseNumber || '').trim(),
      idFileName: String(driver.idFileName || '').trim(),
      idFileUrl: String(driver.idFileUrl || '').trim(),
    }));
    const normalizedSecondaryDrivers = secondaryDrivers
      .map((driver, index) => ({
        quadNumber: index + 1,
        fullName: String(driver.fullName || '').trim(),
        whatsapp: String(driver.whatsapp || '').trim(),
        idNumber: String(driver.idNumber || '').trim(),
        licenseNumber: String(driver.licenseNumber || '').trim(),
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
      customerEmail: '',
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
      customer_email: '',
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
      toast.error('Could not book this tour');
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
      `Tour booked for ${customerName} with ${quadCount} quad(s).`,
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

    toast.success('Tour booked successfully');
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
      ? tour.assignedVehicles.map((vehicle) => `${vehicle.plate_number || 'No plate'} - ${vehicle.name || 'Vehicle'} ${vehicle.model || ''}`).join(', ')
      : `${tour.quadCount} quad(s) assigned at departure`;

    return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Tour Receipt</title>
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
      <h1 class="title">Tour Receipt</h1>
      <p class="subtitle">${tour.packageName} • ${formatDateTime(tour.completedAt || new Date().toISOString())}</p>
    </div>
    <div class="grid">
      <div class="card"><div class="label">Customer</div><div class="value">${tour.customerName}</div></div>
      <div class="card"><div class="label">Phone</div><div class="value">${tour.customerPhone || 'N/A'}</div></div>
      <div class="card"><div class="label">Guide</div><div class="value">${tour.guideName}</div></div>
      <div class="card"><div class="label">Route</div><div class="value">${tour.routeType}</div></div>
      <div class="card"><div class="label">Departure</div><div class="value">${formatDateTime(tour.startedAt || tour.scheduledStartAt)}</div></div>
      <div class="card"><div class="label">Riders</div><div class="value">${tour.ridersCount}</div></div>
    </div>
    <div class="card">
      <div class="label">Vehicles</div>
      <div class="value">${vehicleSummary}</div>
    </div>
    <div class="card">
      <div class="label">Total Paid</div>
      <div class="total">${formatCurrencyMAD(tour.totalAmount)} MAD</div>
    </div>
  </body>
</html>`;
  };

  const handlePrintTourReceipt = (tour) => {
    const printWindow = window.open('', '_blank', 'width=900,height=700');
    if (!printWindow) {
      toast.error('Allow popups to print the receipt');
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
      `Tour receipt`,
      `${tour.packageName}`,
      `Customer: ${tour.customerName}`,
      `Guide: ${tour.guideName}`,
      `Total: ${formatCurrencyMAD(tour.totalAmount)} MAD`,
      `Completed: ${formatDateTime(tour.completedAt || new Date().toISOString())}`,
    ].join('\n');

    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Tour Receipt',
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

    if (!cleanPhone) {
      toast.error('No WhatsApp number is saved for this guide.');
      return;
    }

    try {
      const trackingUrl = tour.trackingUrl || buildTourTrackingUrl(tour.groupId);
      const shortTrackingUrl = await shortenUrl(trackingUrl, null, 'tour_tracking');
      const message = [
        `Open and share location now: ${shortTrackingUrl}`,
      ].join('\n');

      window.open(`https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer');
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
        title: 'Tour booked',
        description: `${tour.bookedByName} created this tour booking.`,
        timestamp: tour.createdAt || tour.scheduledStartAt,
      },
      tour.startedAt
        ? {
            id: `${tour.groupId}-started`,
            title: 'Tour started',
            description: `${tour.startedByName || tour.guideName || 'Guide'} started the tour.`,
            timestamp: tour.startedAt,
          }
        : null,
      tour.completedAt
        ? {
            id: `${tour.groupId}-completed`,
            title: 'Tour completed',
            description: `${tour.completedByName || tour.guideName || 'Guide'} completed the tour return workflow.`,
            timestamp: tour.completedAt,
          }
        : null,
      tour.cancelledAt
        ? {
            id: `${tour.groupId}-cancelled`,
            title: 'Tour cancelled',
            description: `${tour.cancelledByName || 'Team Member'} cancelled this booking.`,
            timestamp: tour.cancelledAt,
          }
        : null,
      tour.receiptIssuedAt
        ? {
            id: `${tour.groupId}-receipt`,
            title: 'Receipt issued',
            description: 'Receipt was marked as issued/shared.',
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
                    Open Live Map
                  </Link>
                )}

                <button
                  type="button"
                  onClick={() => setRefreshKey((prev) => prev + 1)}
                  className="inline-flex items-center rounded-lg border border-white/20 bg-white/10 px-4 py-2 text-white backdrop-blur-sm transition-all duration-200 hover:border-white/30 hover:bg-white/20"
                >
                  <TimerReset className="mr-2 h-4 w-4" />
                  Refresh
                </button>


                {activeTab === 'packages' && canManagePackages && (
                  <button
                    type="button"
                    onClick={() => handleOpenPackageEditor()}
                    className="inline-flex items-center rounded-lg bg-white/10 px-4 py-2 text-white backdrop-blur-sm transition-all duration-200 hover:bg-white/20"
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    Add Package
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
                  <span className="font-semibold">{tab.label}</span>
                </button>
              );
            })}
          </nav>
        </div>
      </div>

      <div className="px-4 py-6 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl space-y-6">

      {activeTab === 'bookings' && (
        <div className="space-y-6 pb-24">
          <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400">Book Tour</p>
                <h1 className="mt-2 text-3xl font-bold text-slate-900">
                  {canSelectTourGuide ? 'Fast booking' : 'Tour booking'}
                </h1>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-lg bg-gradient-to-br from-slate-100 to-white px-4 py-3 text-center ring-1 ring-slate-200/80">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500 whitespace-nowrap">Free Now</p>
                  <p className="mt-1 text-2xl font-semibold text-slate-900">{fleetStats.freeNow}</p>
                </div>
                <div className="rounded-lg bg-violet-50 px-4 py-3 text-center ring-1 ring-violet-200/80">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-violet-600 whitespace-nowrap">Capacity</p>
                  <p className="mt-1 text-2xl font-semibold text-violet-900">{fleetStats.total}</p>
                </div>
                <div className="rounded-lg bg-indigo-50 px-4 py-3 text-center ring-1 ring-indigo-200/80">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-indigo-600 whitespace-nowrap">Reserved</p>
                  <p className="mt-1 text-2xl font-semibold text-indigo-900">{fleetStats.reserved}</p>
                </div>
              </div>
            </div>

            <div className="mt-5 grid grid-cols-3 gap-2">
              {[
                { id: 1, label: 'Package & Time', icon: Route },
                { id: 2, label: 'Guest & Guide', icon: Users },
                { id: 3, label: 'Review & Book', icon: CheckCircle2 },
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
                    <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400">Step 1</p>
                    <h3 className="mt-2 text-xl font-semibold text-slate-900">Choose package and departure</h3>
                  </div>
                  {bookingsLoading && (
                    <div className="rounded-lg bg-slate-100 px-4 py-2 text-xs font-medium uppercase tracking-[0.14em] text-slate-500">
                      Loading schedule...
                    </div>
                  )}
                  {canManageTourPackages && (
                    <Link
                      to="/admin/pricing"
                      className="inline-flex items-center gap-2 rounded-lg border border-violet-200 bg-violet-50 px-4 py-3 text-sm font-medium text-violet-700 transition hover:bg-violet-100"
                    >
                      <Package2 className="h-4 w-4" />
                      Manage Packages
                    </Link>
                  )}
                </div>

                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {packagesLoading ? (
                    <div className="col-span-full rounded-xl border border-slate-200 bg-slate-50 p-6 text-slate-500">Loading packages...</div>
                  ) : (
                    packages.map((pkg) => {
                      const selected = String(pkg.id) === String(bookingForm.packageId);
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
                          <p className="mt-0.5 text-xs text-slate-500">{pkg.location || 'Main Base'}</p>
                          <div className="mt-3 space-y-1.5 border-t border-slate-100 pt-3">
                            <div className="flex items-center justify-between text-sm">
                              <span className="text-slate-500">From</span>
                              <span className="font-bold text-violet-700">{getPackagePricingBadge(pkg).toLocaleString('en-MA')} MAD</span>
                            </div>
                            <div className="flex items-center justify-between text-sm">
                              <span className="text-slate-500">License</span>
                              <span className={`font-medium ${pkg.requiresLicense ? 'text-indigo-700' : 'text-emerald-700'}`}>
                                {pkg.requiresLicense ? 'Required' : 'Not needed'}
                              </span>
                            </div>
                            <div className="flex items-center justify-between text-sm">
                              <span className="text-slate-500">Max quads</span>
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
                    <label className="text-sm font-semibold text-slate-700">Tour Date</label>
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
                      <label className="text-sm font-semibold text-slate-700">Departure Time</label>
                      <span className="rounded-full bg-white px-3 py-1 text-xs font-medium uppercase tracking-[0.12em] text-slate-600">
                        Current Time {new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
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
                        Now
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
                      <label className="shrink-0 text-xs font-semibold text-violet-600 uppercase tracking-wide">Custom</label>
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
                  <label className="text-sm font-semibold text-slate-700">How many quads?</label>
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
                      <label className="text-sm font-semibold text-slate-700">Choose quad models</label>
                    </div>
                    <div className="rounded-lg bg-white px-4 py-3 text-right">
                      <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-slate-400">Selected</p>
                      <p className="mt-1 text-lg font-semibold text-slate-900">{selectedModelCount} / {bookingForm.quadCount} quads</p>
                    </div>
                  </div>

                  {displayModelGroups.length === 0 ? (
                    <div className="mt-4 rounded-lg bg-white px-4 py-4 text-sm text-slate-500">
                      No active quad models are available yet.
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
                  <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400">Step 2</p>
                  <h3 className="mt-2 text-xl font-semibold text-slate-900">Drivers and guide details</h3>
                </div>

                <div className="rounded-xl bg-slate-50 p-5">
                  <label className="text-sm font-semibold text-slate-700">Total Riders</label>
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
                  <p className="mt-3 text-xs text-slate-500">Maximum two riders per quad.</p>
                </div>

                {canSelectTourGuide ? (
                  <div className="rounded-xl bg-slate-50 p-5">
                    <label className="text-sm font-semibold text-slate-700">Choose Tour Guide</label>
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
                          && String(driver.whatsapp || '').trim()
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

                      <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                        <div className="rounded-lg bg-slate-50 p-4">
                          <label className="text-sm font-semibold text-slate-700">Driver Name</label>
                          <input
                            type="text"
                            value={activePrimaryDriver.fullName}
                            onChange={(event) => updatePrimaryDriver(activeDriverQuadIndex, 'fullName', event.target.value)}
                            className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-4 py-4 text-base font-semibold text-slate-900"
                            placeholder={`Main driver for quad ${activeDriverQuadIndex + 1}`}
                          />
                        </div>
                        <div className="rounded-lg bg-slate-50 p-4">
                          <label className="text-sm font-semibold text-slate-700">WhatsApp</label>
                          <input
                            type="tel"
                            value={activePrimaryDriver.whatsapp || ''}
                            onChange={(event) => updatePrimaryDriver(activeDriverQuadIndex, 'whatsapp', event.target.value)}
                            className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-4 py-4 text-base font-semibold text-slate-900"
                            placeholder="+212 6XXXXXXXX"
                          />
                          {activePrimaryDriver.whatsapp ? (
                            activePrimaryDriverWhatsApp.isValid ? (
                              <div className="mt-2 flex items-center gap-2 text-xs">
                                <span className="h-2 w-2 rounded-full bg-green-500" />
                                <span className="font-semibold text-green-600">{activePrimaryDriverWhatsApp.helper}</span>
                                {activePrimaryDriverWhatsApp.link && (
                                  <>
                                    <span className="text-slate-300">•</span>
                                    <a
                                      href={activePrimaryDriverWhatsApp.link}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="font-semibold text-blue-600 hover:underline"
                                    >
                                      Open chat
                                    </a>
                                  </>
                                )}
                              </div>
                            ) : (
                              <p className="mt-2 text-xs font-medium text-amber-600">{activePrimaryDriverWhatsApp.helper}</p>
                            )
                          ) : (
                            <p className="mt-2 text-xs text-slate-500">Saved in WhatsApp format for quick contact.</p>
                          )}
                        </div>
                        <div className="rounded-lg bg-slate-50 p-4">
                          <label className="text-sm font-semibold text-slate-700">Driver License</label>
                          <input
                            type="text"
                            value={activePrimaryDriver.licenseNumber}
                            onChange={(event) => updatePrimaryDriver(activeDriverQuadIndex, 'licenseNumber', event.target.value)}
                            className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-4 py-4 text-base font-semibold text-slate-900"
                            placeholder={currentPackage?.requiresLicense ? 'Required for this route' : 'Optional'}
                          />
                        </div>
                        <div className="rounded-lg bg-slate-50 p-4">
                          <label className="text-sm font-semibold text-slate-700">ID Number</label>
                          <input
                            type="text"
                            value={activePrimaryDriver.idNumber}
                            onChange={(event) => updatePrimaryDriver(activeDriverQuadIndex, 'idNumber', event.target.value)}
                            className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-4 py-4 text-base font-semibold text-slate-900"
                            placeholder="Optional"
                          />
                        </div>
                      </div>

                      <div className="mt-4 rounded-lg bg-slate-50 p-4">
                        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                          <div>
                            <p className="text-sm font-semibold text-slate-700">Main Driver Scan</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => setDriverIDScanTarget({ type: 'primary', index: activeDriverQuadIndex })}
                            className="inline-flex items-center justify-center gap-2 rounded-lg bg-violet-700 px-5 py-3 text-sm font-bold text-white hover:bg-violet-800"
                          >
                            <FileImage className="h-4 w-4" />
                            {activePrimaryDriver.idFileName ? 'Rescan' : 'Scan ID (Optional)'}
                          </button>
                        </div>
                        {activePrimaryDriver.idFileName && (
                          <div className="mt-3 flex items-center justify-between gap-3 rounded-lg bg-violet-50 px-4 py-3 text-sm font-semibold text-violet-700">
                            <p className="min-w-0 truncate">ID captured: {activePrimaryDriver.idFileName}</p>
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
                            <p className="text-sm font-semibold text-slate-900">Optional second driver</p>
                            {hasAnyDriverValue(activeSecondaryDriver) && (
                              <p className="mt-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                                {activeSecondaryDriver.fullName || 'Details added'}
                              </p>
                            )}
                          </div>
                          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-violet-200 bg-white px-3 py-2 text-xs font-semibold text-violet-700 shadow-sm">
                            {secondDriverOpen ? 'Hide' : 'Add second driver'}
                            <ChevronRight className={`h-4 w-4 transition-transform ${secondDriverOpen ? 'rotate-90' : ''}`} />
                          </span>
                        </button>

                        {secondDriverOpen && (
                          <>
                            <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                              <div className="rounded-lg bg-white p-4">
                                <label className="text-sm font-semibold text-slate-700">Second Driver Name</label>
                                <input
                                  type="text"
                                  value={activeSecondaryDriver.fullName || ''}
                                  onChange={(event) => updateSecondaryDriver(activeDriverQuadIndex, 'fullName', event.target.value)}
                                  className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-4 py-4 text-base font-semibold text-slate-900"
                                  placeholder="Optional"
                                />
                              </div>
                              <div className="rounded-lg bg-white p-4">
                                <label className="text-sm font-semibold text-slate-700">WhatsApp</label>
                                <input
                                  type="tel"
                                  value={activeSecondaryDriver.whatsapp || ''}
                                  onChange={(event) => updateSecondaryDriver(activeDriverQuadIndex, 'whatsapp', event.target.value)}
                                  className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-4 py-4 text-base font-semibold text-slate-900"
                                  placeholder="+212 6XXXXXXXX"
                                />
                                {activeSecondaryDriver.whatsapp ? (
                                  activeSecondaryDriverWhatsApp.isValid ? (
                                    <div className="mt-2 flex items-center gap-2 text-xs">
                                      <span className="h-2 w-2 rounded-full bg-green-500" />
                                      <span className="font-semibold text-green-600">{activeSecondaryDriverWhatsApp.helper}</span>
                                      {activeSecondaryDriverWhatsApp.link && (
                                        <>
                                          <span className="text-slate-300">•</span>
                                          <a
                                            href={activeSecondaryDriverWhatsApp.link}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="font-semibold text-blue-600 hover:underline"
                                          >
                                            Open chat
                                          </a>
                                        </>
                                      )}
                                    </div>
                                  ) : (
                                    <p className="mt-2 text-xs font-medium text-amber-600">{activeSecondaryDriverWhatsApp.helper}</p>
                                  )
                                ) : (
                                  <p className="mt-2 text-xs text-slate-500">Saved in WhatsApp format for quick contact.</p>
                                )}
                              </div>
                              <div className="rounded-lg bg-white p-4">
                                <label className="text-sm font-semibold text-slate-700">Second Driver License</label>
                                <input
                                  type="text"
                                  value={activeSecondaryDriver.licenseNumber || ''}
                                  onChange={(event) => updateSecondaryDriver(activeDriverQuadIndex, 'licenseNumber', event.target.value)}
                                  className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-4 py-4 text-base font-semibold text-slate-900"
                                  placeholder={currentPackage?.requiresLicense ? 'Required if second driver is added' : 'Optional'}
                                />
                              </div>
                              <div className="rounded-lg bg-white p-4">
                                <label className="text-sm font-semibold text-slate-700">ID Number</label>
                                <input
                                  type="text"
                                  value={activeSecondaryDriver.idNumber || ''}
                                  onChange={(event) => updateSecondaryDriver(activeDriverQuadIndex, 'idNumber', event.target.value)}
                                  className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-4 py-4 text-base font-semibold text-slate-900"
                                  placeholder="Optional"
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
                      <span className="rounded-lg bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 border border-slate-100">{currentPackage?.location || 'Main Base'}</span>
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
                    <p className="mt-1 text-sm text-slate-500">{primaryDrivers[0]?.whatsapp || 'No WhatsApp'}</p>
                  </div>

                  <div className="rounded-xl border border-violet-100 bg-violet-50/40 p-4">
                    <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-violet-400">Guide & Riders</p>
                    <p className="mt-1.5 text-base font-bold text-slate-900">
                      {canSelectTourGuide
                        ? guides.find((guide) => String(guide.id) === String(bookingForm.guideId))?.name || 'No guide'
                        : currentUserDisplayName}
                    </p>
                    <p className="mt-1 text-sm text-slate-500">{bookingForm.ridersCount} rider(s) · {bookingForm.quadCount} quad(s)</p>
                    <p className="mt-0.5 text-sm text-slate-500">{bookingForm.shareContract ? 'Contract will be shared' : 'No contract'}</p>
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
                              <span className="font-medium text-slate-800 text-left break-words">{driver.idFileName ? 'Captured' : '—'}</span>
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
        <div className="space-y-6">
          <section className="rounded-xl bg-violet-50 p-3">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
              <div className="rounded-lg bg-white px-3 py-2.5 shadow-sm">
                <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-violet-500">Tour Date</p>
                <p className="mt-0.5 text-sm font-bold text-violet-900">{new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}</p>
              </div>
              <div className="rounded-lg bg-white px-3 py-2.5 shadow-sm">
                <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-violet-500">Tours Today</p>
                <p className="mt-0.5 text-sm font-bold text-violet-900">{todayTours.length}</p>
              </div>
              <div className="rounded-lg bg-white px-3 py-2.5 shadow-sm">
                <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-violet-500">Upcoming</p>
                <p className="mt-0.5 text-sm font-bold text-violet-900">{upcomingTours.length}</p>
              </div>
              <div className="rounded-lg bg-white px-3 py-2.5 shadow-sm">
                <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-violet-500">Guides Active</p>
                <p className="mt-0.5 text-sm font-bold text-violet-900">{new Set(todayTours.map((tour) => tour.guideId).filter(Boolean)).size}</p>
              </div>
              <div className="rounded-lg bg-white px-3 py-2.5 shadow-sm">
                <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-violet-500">Quads Reserved</p>
                <p className="mt-0.5 text-sm font-bold text-violet-900">{todayTours.reduce((sum, tour) => sum + tour.quadCount, 0)}</p>
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-violet-100 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <div className="grid grid-cols-4 gap-1 rounded-xl bg-violet-50 p-1.5 flex-1 min-w-0">
                {[
                  { label: 'Act.', value: activeTours.length },
                  { label: 'Sched.', value: scheduledTours.length },
                  { label: 'Done', value: completedTours.length },
                  { label: 'Cancl.', value: cancelledTours.length },
                ].map(({ label, value }) => (
                  <div key={label} className="rounded-lg bg-white px-1.5 py-1.5 shadow-sm text-center">
                    <p className="text-[8px] font-semibold uppercase tracking-tight text-violet-400 truncate">{label}</p>
                    <p className="text-sm font-bold text-violet-900">{value}</p>
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setRefreshKey((prev) => prev + 1)}
                className="shrink-0 rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-sm font-medium text-violet-700 hover:bg-violet-100"
              >
                Refresh
              </button>
            </div>

            <div className="mt-6 space-y-4">
              {operationalTours.length === 0 ? (
                <div className="rounded-xl border border-dashed border-purple-200 bg-purple-50/50 p-8 text-center text-slate-500">
                  No tours booked yet. Use the booking tab to create the first one.
                </div>
              ) : (
                <>
                  <div className={`grid gap-4 ${paginatedOperationalTours.length > 1 ? 'xl:grid-cols-2' : 'grid-cols-1'}`}>
                    {paginatedOperationalTours.map((tour) => {
                      const trackingActiveForTour = trackedTourIds.has(String(tour.groupId));
                      const showShareLocation = tour.status === 'active' && isMobileDevice && !trackingActiveForTour;
                      const showLiveMapLink = trackingActiveForTour;
                      const expiredTour = isTourExpired(tour);
                      const guideHasWhatsApp = Boolean(guides.find((guide) => String(guide.id) === String(tour.guideId))?.phone);

                      return (
                      <article key={tour.groupId} className={`rounded-xl overflow-hidden ${getScheduleCardClasses(tour.status)}`}>
                        {/* Card header — KM pricing style */}
                        <div className="px-5 pt-5 pb-4">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-lg font-bold text-slate-900">{tour.packageName}</h3>
                            <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${toStatusTone(tour.status)}`}>{tour.status}</span>
                            <span className="rounded-full bg-violet-50 px-2.5 py-0.5 text-xs font-semibold text-violet-700 capitalize">{tour.routeType}</span>
                          </div>
                          <p className="mt-1 text-xs text-slate-400">Booked by {tour.bookedByName}</p>
                          {tour.status === 'active' && (
                            <div className="mt-3">
                              <TourLiveTimer startedAt={tour.startedAt || tour.scheduledStartAt} durationHours={tour.durationHours} />
                            </div>
                          )}
                        </div>

                        {/* Data rows — KM pricing style */}
                        <div className="border-t border-slate-100 px-5 py-4 space-y-2.5">
                          <div className="grid grid-cols-[110px_minmax(0,1fr)] gap-3 text-sm">
                            <span className="text-slate-500">Guest</span>
                            <span className="font-semibold text-slate-900 text-left break-words">{formatGuestSummary(tour)}</span>
                          </div>
                          <div className="grid grid-cols-[110px_minmax(0,1fr)] gap-3 text-sm">
                            <span className="text-slate-500">Phone</span>
                            <span className="font-medium text-slate-700 text-left break-words">{tour.customerPhone || '—'}</span>
                          </div>
                          <div className="grid grid-cols-[110px_minmax(0,1fr)] gap-3 text-sm">
                            <span className="text-slate-500">Guide</span>
                            <span className="font-medium text-slate-700 text-left break-words">{tour.guideName}</span>
                          </div>
                          <div className="grid grid-cols-[110px_minmax(0,1fr)] gap-3 border-t border-dashed border-slate-100 pt-2.5 text-sm">
                            <span className="text-slate-500">Departure</span>
                            <span className="font-bold text-violet-700 text-left break-words">{formatDateTime(tour.scheduledStartAt)}</span>
                          </div>
                          <div className="grid grid-cols-[110px_minmax(0,1fr)] gap-3 text-sm">
                            <span className="text-slate-500">Ends</span>
                            <span className="font-medium text-slate-700 text-left break-words">
                              {tour.assignmentMode === 'assign_on_arrival' && tour.status === 'scheduled'
                                ? 'Quads assigned at departure'
                                : formatDateTime(tour.scheduledEndAt)}
                            </span>
                          </div>
                          <div className="grid grid-cols-[110px_minmax(0,1fr)] gap-3 border-t border-dashed border-slate-100 pt-2.5 text-sm">
                            <span className="text-slate-500">Quads · Riders</span>
                            <span className="font-semibold text-slate-900 text-left break-words">{tour.quadCount} · {tour.ridersCount}</span>
                          </div>
                          <div className="grid grid-cols-[110px_minmax(0,1fr)] gap-3 text-sm">
                            <span className="text-slate-500">Vehicles</span>
                            <span className="font-medium text-slate-700 text-left break-words">
                              {tour.assignedVehicles.length === 0
                                ? <span className="text-slate-400 italic">Assign at departure</span>
                                : tour.assignedVehicles.map((v) => v.plate_number || 'No plate').join(', ')}
                            </span>
                          </div>
                          <div className="grid grid-cols-[110px_minmax(0,1fr)] gap-3 text-sm">
                            <span className="text-slate-500">Documents</span>
                            <span className={`font-medium text-left break-words ${tour.idCaptured ? 'text-emerald-600' : 'text-rose-500'}`}>
                              {tour.idCaptured ? 'ID captured' : 'ID optional'}
                            </span>
                          </div>
                        </div>

                        {/* Action buttons */}
                        {tour.status !== 'completed' && (
                          <div className="border-t border-slate-100 px-5 py-4">
                            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                              <button
                                type="button"
                                onClick={() => openTourDetails(tour)}
                                className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
                              >
                                <PanelRightOpen className="h-3.5 w-3.5" />
                                Details
                              </button>
                              {showShareLocation ? (
                                <button
                                  type="button"
                                  onClick={() => window.open(tour.trackingUrl || buildTourTrackingUrl(tour.groupId), '_blank', 'noopener,noreferrer')}
                                  className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-gradient-to-r from-violet-600 to-indigo-700 px-3 py-2.5 text-xs font-semibold text-white shadow-sm hover:from-violet-700 hover:to-indigo-800"
                                >
                                  <MapPinned className="h-3.5 w-3.5" />
                                  Share Location
                                </button>
                              ) : showLiveMapLink ? (
                                <Link
                                  to="/admin/live-map"
                                  className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2.5 text-xs font-semibold text-blue-700 shadow-sm hover:bg-blue-100"
                                >
                                  <MapPinned className="h-3.5 w-3.5" />
                                  Live Map
                                </Link>
                              ) : (
                                <div />
                              )}
                              {tour.status === 'scheduled' ? (
                                <button
                                  type="button"
                                  onClick={() => handleUpdateTourStatus(tour, 'active')}
                                  className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700"
                                >
                                  <Route className="h-3.5 w-3.5" />
                                  {tour.assignedVehicles.length === 0 ? 'Start + Assign' : 'Start'}
                                </button>
                              ) : null}
                              {guideHasWhatsApp ? (
                                <button
                                  type="button"
                                  onClick={() => handleWhatsAppLocateGuide(tour)}
                                  className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-xs font-semibold text-emerald-700 shadow-sm hover:bg-emerald-100"
                                >
                                  <Share2 className="h-3.5 w-3.5" />
                                  Locate Me
                                </button>
                              ) : null}
                              <button
                                type="button"
                                onClick={() => handleOpenTourReturnModal(tour)}
                                className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-gradient-to-r from-slate-700 to-slate-900 px-3 py-2.5 text-xs font-semibold text-white shadow-sm hover:from-slate-800 hover:to-black"
                              >
                                <CheckCircle2 className="h-3.5 w-3.5" />
                                Complete
                              </button>
                              <button
                                type="button"
                                onClick={() => handleUpdateTourStatus(tour, 'cancelled')}
                                className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs font-semibold text-rose-700 shadow-sm hover:bg-rose-100"
                              >
                                <X className="h-3.5 w-3.5" />
                                Cancel
                              </button>
                              {tour.status === 'active' && showShareLocation && (
                                <button
                                  type="button"
                                  onClick={() => window.open(tour.trackingUrl || buildTourTrackingUrl(tour.groupId), '_blank', 'noopener,noreferrer')}
                                  className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs font-semibold text-slate-600 shadow-sm hover:bg-slate-100"
                                >
                                  <TimerReset className="h-3.5 w-3.5" />
                                  Share Again
                                </button>
                              )}
                            </div>
                          </div>
                        )}
                      </article>
                      );
                    })}
                  </div>
                  {operationalPageCount > 1 && (
                    <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                      <p className="text-sm font-medium text-slate-600">
                        Page {schedulePage} of {operationalPageCount}
                      </p>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setSchedulePage((prev) => Math.max(1, prev - 1))}
                          disabled={schedulePage === 1}
                          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Previous
                        </button>
                        <button
                          type="button"
                          onClick={() => setSchedulePage((prev) => Math.min(operationalPageCount, prev + 1))}
                          disabled={schedulePage === operationalPageCount}
                          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Next
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
                  <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400">Completed & Closed</p>
                  <h2 className="mt-0.5 text-lg font-semibold text-slate-900">Tour history</h2>
                </div>
                <span className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600">
                  {completedHistoryTours.length} tours
                </span>
              </div>
              <ChevronDown className={`h-5 w-5 text-slate-400 transition-transform duration-200 ${historyCollapsed ? '' : 'rotate-180'}`} />
            </button>

            {!historyCollapsed && (
            <div className="border-t border-slate-100 p-5 space-y-4">
              {completedHistoryTours.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-slate-500">
                  No completed or cancelled tours yet.
                </div>
              ) : (
                <>
                  <div className="grid gap-4 xl:grid-cols-2">
                    {paginatedCompletedTours.map((tour) => (
                      <article key={tour.groupId} className={`rounded-xl overflow-hidden ${getScheduleCardClasses(tour.status)}`}>
                        {/* Card header */}
                        <div className="px-5 pt-4 pb-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-base font-bold text-slate-900">{tour.packageName}</h3>
                            <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${toStatusTone(tour.status)}`}>{tour.status}</span>
                          </div>
                          <p className="mt-0.5 text-xs text-slate-400">Guide: {tour.guideName}</p>
                        </div>

                        {/* Data rows — KM pricing style */}
                        <div className="border-t border-slate-100 px-5 py-3 space-y-2">
                          <div className="grid grid-cols-[110px_minmax(0,1fr)] gap-3 text-sm">
                            <span className="text-slate-500">Guest</span>
                            <span className="font-semibold text-slate-900 text-left break-words">{formatGuestSummary(tour)}</span>
                          </div>
                          <div className="grid grid-cols-[110px_minmax(0,1fr)] gap-3 text-sm">
                            <span className="text-slate-500">Phone</span>
                            <span className="font-medium text-slate-700 text-left break-words">{tour.customerPhone || '—'}</span>
                          </div>
                          <div className="grid grid-cols-[110px_minmax(0,1fr)] gap-3 border-t border-dashed border-slate-100 pt-2 text-sm">
                            <span className="text-slate-500">Departure</span>
                            <span className="font-bold text-violet-700 text-left break-words">{formatDateTime(tour.scheduledStartAt)}</span>
                          </div>
                          <div className="grid grid-cols-[110px_minmax(0,1fr)] gap-3 text-sm">
                            <span className="text-slate-500">{tour.status === 'completed' ? 'Completed' : 'Status'}</span>
                            <span className="font-medium text-slate-700 text-left break-words">
                              {tour.status === 'completed'
                                ? formatDateTime(tour.completedAt || tour.scheduledEndAt)
                                : 'Booking was cancelled'}
                            </span>
                          </div>
                          <div className="grid grid-cols-[110px_minmax(0,1fr)] gap-3 text-sm">
                            <span className="text-slate-500">Quads · Riders</span>
                            <span className="font-semibold text-slate-900 text-left break-words">{tour.quadCount} · {tour.ridersCount}</span>
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
                    ))}
                  </div>
                  {completedPageCount > 1 && (
                    <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                      <p className="text-sm font-medium text-slate-600">
                        Page {completedPage} of {completedPageCount}
                      </p>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setCompletedPage((prev) => Math.max(1, prev - 1))}
                          disabled={completedPage === 1}
                          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Previous
                        </button>
                        <button
                          type="button"
                          onClick={() => setCompletedPage((prev) => Math.min(completedPageCount, prev + 1))}
                          disabled={completedPage === completedPageCount}
                          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Next
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
              ? `${driverIDScanTarget.type === 'primary' ? 'Scan Main Driver ID' : 'Scan Second Driver ID'}`
              : 'Scan Guest ID'
          }
          scanningForSecondDriver={driverIDScanTarget?.type === 'secondary'}
          autoProcessOnSelect={false}
          allowSaveWithoutOcr
          saveWithoutOcrLabel="Save image only"
        />
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
                Close
              </button>
            </div>

            <div className="mx-auto w-full max-w-6xl space-y-6 p-6">
              <div className="grid gap-4 lg:grid-cols-3">
                <div className="rounded-2xl border border-violet-100 bg-white p-4 shadow-sm">
                  <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-violet-400">Guests</p>
                  <p className="mt-2 text-lg font-black text-slate-900">{formatGuestSummary(tourToComplete)}</p>
                </div>
                <div className="rounded-2xl border border-violet-100 bg-white p-4 shadow-sm">
                  <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-violet-400">Guide</p>
                  <p className="mt-2 text-lg font-black text-slate-900">{tourToComplete.guideName}</p>
                </div>
                <div className="rounded-2xl border border-violet-100 bg-white p-4 shadow-sm">
                  <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-violet-400">Assigned Quads</p>
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
                        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-violet-500">Quad Return</p>
                        <h3 className="mt-2 text-xl font-black text-slate-900">{entry.vehicleName}</h3>
                        <p className="mt-2 text-sm text-slate-500">Starting from current vehicle odometer: {entry.startOdometer} km</p>
                      </div>
                    </div>

                    <div className="mt-5 grid gap-4 lg:grid-cols-2">
                      <div className="rounded-[24px] border border-violet-100 bg-violet-50/60 p-4">
                        <label className="text-sm font-semibold text-slate-700">Ending Odometer (km)</label>
                        <input
                          type="number"
                          min={entry.startOdometer || 0}
                          value={entry.endOdometer}
                          onChange={(event) => updateTourReturnEntry(entry.vehicleId, 'endOdometer', event.target.value)}
                          className="mt-2 w-full rounded-2xl border border-violet-200 bg-white px-4 py-4 text-base font-semibold text-slate-900 focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-200"
                          placeholder="Enter return odometer"
                        />
                      </div>

                      <div className="rounded-[24px] border border-violet-100 bg-violet-50/60 p-4">
                        <label className="text-sm font-semibold text-slate-700">Fuel Level After Tour</label>
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
                  The guide who completes this step will be recorded in the tour return activity.
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
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmTourReturn}
                    disabled={tourReturnSaving}
                    className="rounded-2xl bg-gradient-to-r from-violet-700 to-indigo-800 px-5 py-3 text-sm font-bold text-white hover:from-violet-800 hover:to-indigo-900 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {tourReturnSaving ? 'Saving Return...' : 'Complete Tour Return'}
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
                      {selectedTourDetails.status}
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
                  <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400">Guests</p>
                  <p className="mt-2 text-xl font-semibold text-slate-900">{formatGuestSummary(selectedTourDetails)}</p>
                  <div className="mt-3 space-y-2 text-sm text-slate-600">
                    <p>{selectedTourDetails.customerPhone || 'No phone saved'}</p>
                    <p>{selectedTourDetails.customerEmail || 'No email saved'}</p>
                    <p>ID Number: {selectedTourDetails.idNumber || 'Not saved'}</p>
                    <p>
                      License:
                      {' '}
                      {selectedTourDetails.requiresLicense
                        ? (selectedTourDetails.licenseNumber || 'Required but not saved')
                        : 'Not needed'}
                    </p>
                  </div>
                </div>

                <div className="rounded-lg border border-slate-200 bg-slate-50 p-5">
                  <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400">Schedule</p>
                  <div className="mt-3 overflow-hidden rounded-lg border border-slate-200 bg-white">
                    {[
                      ['Departure', formatDateTime(selectedTourDetails.scheduledStartAt)],
                      ['Expected End', formatDateTime(selectedTourDetails.scheduledEndAt)],
                      ['Started', selectedTourDetails.startedAt ? formatDateTime(selectedTourDetails.startedAt) : 'Not started yet'],
                      ['Completed', selectedTourDetails.completedAt ? formatDateTime(selectedTourDetails.completedAt) : 'Not completed yet'],
                      ['Guide', selectedTourDetails.guideName],
                      ['Booked By', selectedTourDetails.bookedByName],
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
                          <p className="text-base font-semibold text-slate-900">Quad {driver.quadNumber || index + 1}</p>
                          <div className="mt-3 overflow-hidden rounded-lg border border-slate-200 bg-white">
                            {[
                              { label: 'Main Driver', value: driver.fullName || 'Not saved' },
                              { label: 'Main WhatsApp', value: driver.whatsapp || 'Not saved' },
                              { label: 'Main ID', value: driver.idNumber || 'Optional / empty' },
                              {
                                label: 'Main Scan',
                                value: driver.idFileName ? 'Captured' : 'Optional / empty',
                                href: driver.idFileUrl || '',
                              },
                              {
                                label: 'Main License',
                                value: selectedTourDetails.requiresLicense
                                  ? (driver.licenseNumber || 'Required but not saved')
                                  : (driver.licenseNumber || 'Optional / empty'),
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
                                      View scan
                                    </a>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                          <div className="mt-4 border-t border-slate-200 pt-4 text-sm text-slate-600">
                            <p className="font-medium text-slate-900">Optional second driver</p>
                            {secondDriver ? (
                              <div className="mt-3 overflow-hidden rounded-lg border border-slate-200 bg-white">
                                {[
                                  { label: 'Name', value: secondDriver.fullName || 'Not saved' },
                                  { label: 'WhatsApp', value: secondDriver.whatsapp || 'Not saved' },
                                  { label: 'ID', value: secondDriver.idNumber || 'Optional / empty' },
                                  {
                                    label: 'Scan',
                                    value: secondDriver.idFileName ? 'Captured' : 'Optional / empty',
                                    href: secondDriver.idFileUrl || '',
                                  },
                                  {
                                    label: 'License',
                                    value: selectedTourDetails.requiresLicense
                                      ? (secondDriver.licenseNumber || 'Required but not saved')
                                      : (secondDriver.licenseNumber || 'Optional / empty'),
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
                                          View scan
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
                    <p className="text-sm font-semibold text-slate-900">Documents</p>
                  </div>
                  <div className="mt-4 space-y-2 text-sm text-slate-600">
                    <p>{selectedTourDetails.idCaptured ? 'ID captured before departure' : 'ID not captured'}</p>
                    <p>
                      {selectedTourDetails.requiresLicense
                        ? (selectedTourDetails.licenseCaptured ? 'License captured before departure' : 'License missing')
                        : 'License not needed for this route'}
                    </p>
                    <p>{selectedTourDetails.shareContract ? 'Contract sharing enabled' : 'Contract was optional and not shared'}</p>
                    <p>{selectedTourDetails.receiptIssued ? 'Receipt marked issued/shared' : 'Receipt still pending'}</p>
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
                  Odometer on exit and return, plus the fuel level entered when the guide completed the tour.
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
