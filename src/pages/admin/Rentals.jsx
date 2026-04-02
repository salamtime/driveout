import React, { useState, useEffect, useMemo, useDeferredValue, useRef, useCallback, memo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import EnhancedStepperRentalForm from '../../components/admin/EnhancedStepperRentalForm';
import VideoContractModal from '../../components/VideoContractModal';
import ViewCustomerDetailsDrawer from '../../components/admin/ViewCustomerDetailsDrawer';
import VehicleReportService from '../../services/VehicleReportService';
import FuelTransactionService from '../../services/FuelTransactionService';
import EnhancedTransactionalRentalService from '../../services/EnhancedTransactionalRentalService';
import PricingRulesService from '../../services/PricingRulesService';
import appWarmupService from '../../services/AppWarmupService';
import rentalSummaryService from '../../services/RentalSummaryService';
import { deriveEffectiveRentalStatus, normalizeRentalLifecycle } from '../../utils/rentalLifecycle';
import { getPaymentStatusStyle } from '../../config/statusColors';
import { roundTo } from '../../utils/fuelMath';
import { Plus, Clock, ClipboardList, List, Grid, LayoutGrid, CheckCircle, XCircle, Calendar, MessageCircle, RectangleHorizontal } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import AdminModuleHero from '../../components/admin/AdminModuleHero';
import i18n from '../../i18n';
import { canEditRentalContract } from '../../utils/permissionHelpers';

const scheduleBackgroundTask = (callback) => {
  if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
    return window.requestIdleCallback(callback, { timeout: 800 });
  }

  return window.setTimeout(callback, 0);
};

const isFrenchLocale = () => i18n.resolvedLanguage === 'fr';
const tr = (en, fr) => (isFrenchLocale() ? fr : en);

const buildVehicleReminderLabel = (rental) => {
  const vehicleName = rental?.vehicle?.name || '';
  const vehicleModel = rental?.vehicle?.model || '';
  const plateNumber = rental?.vehicle?.plate_number || '';

  return [vehicleName, vehicleModel].filter(Boolean).join(' - ') || plateNumber || tr('your vehicle', 'votre véhicule');
};

const recalculateAutoRentalPrice = async (rental) => {
  let autoCalculatedPrice = parseFloat(rental?.total_amount) || 0;

  if (rental?.vehicle?.id && rental?.rental_start_date && rental?.rental_end_date) {
    try {
      const priceResult = await PricingRulesService.calculatePrice(
        rental.vehicle.id,
        rental.rental_start_date,
        rental.rental_end_date,
        rental.rental_type || 'daily'
      );

      if (priceResult?.price > 0) {
        autoCalculatedPrice = priceResult.price;
      }
    } catch (calcError) {
      console.warn('⚠️ Could not recalculate rental price while declining override:', calcError);
    }
  }

  return autoCalculatedPrice;
};


// Helper function to get rental type badge
const getRentalTypeBadge = (rentalType) => {
  if (rentalType === 'daily') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-bold rounded-full bg-blue-100 text-blue-800 border border-blue-200">
        📅 {tr('DAILY', 'JOURNALIER')}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-bold rounded-full bg-purple-100 text-purple-800 border border-purple-200">
      ⏰ {tr('HOURLY', 'HORAIRE')}
    </span>
  );
};

const WEBSITE_BOOKING_SOURCE_FIELDS = [
  'booking_source',
  'rental_source',
  'source',
  'channel',
  'origin',
  'created_via',
];

const WEBSITE_BOOKING_SOURCE_KEYWORDS = [
  'website',
  'web',
  'online',
  'customer',
  'self',
  'public',
];

const isWebsiteCustomerBooking = (rental = {}) =>
  WEBSITE_BOOKING_SOURCE_FIELDS.some((field) => {
    const value = rental?.[field];
    if (value === null || value === undefined) return false;
    const normalizedValue = String(value).trim().toLowerCase();
    return WEBSITE_BOOKING_SOURCE_KEYWORDS.some((keyword) => normalizedValue.includes(keyword));
  });

const getBookingSourceBadge = (rental) => {
  const source = String(rental?.booking_source || rental?.inventory_source || '').toLowerCase();

  if (isWebsiteCustomerBooking(rental) || source === 'website') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-bold rounded-full bg-fuchsia-100 text-fuchsia-800 border border-fuchsia-200">
        🌐 {tr('WEBSITE RESERVATION', 'RESERVATION SITE WEB')}
      </span>
    );
  }

  if (source === 'marketplace') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-bold rounded-full bg-amber-100 text-amber-800 border border-amber-200">
        🛍️ {tr('MARKETPLACE', 'MARKETPLACE')}
      </span>
    );
  }

  return null;
};

const getRentalFinancialSnapshot = (rental) => {
  const hasReturnFuel =
    rental?.end_fuel_level !== null &&
    rental?.end_fuel_level !== undefined;
  const quantity = rental?.rental_type === 'hourly'
    ? (Number(rental?.quantity_hours) || Number(rental?.quantity_days) || 1)
    : (Number(rental?.quantity_days) || 1);
  const baseTotal = (Number(rental?.unit_price) || 0) * quantity;
  const storedTotal = parseFloat(rental?.total_amount) || 0;
  const fuelCharge = parseFloat(rental?.fuel_charge || 0) || 0;
  const grandTotal = hasReturnFuel || String(rental?.rental_status || '').toLowerCase() === 'completed'
    ? storedTotal
    : Math.max(0, storedTotal - fuelCharge) || baseTotal;
  const amountPaid = Math.max(0, parseFloat(rental?.deposit_amount) || 0);
  const balanceDue = Math.max(0, grandTotal - amountPaid);

  let status = 'UNPAID';
  let className = 'rounded-full bg-rose-50 px-2 py-1 text-xs font-semibold text-rose-700 border border-rose-100';

  if (balanceDue <= 0 && grandTotal > 0) {
    status = 'PAID';
    className = 'rounded-full bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700 border border-emerald-100';
  } else if (amountPaid > 0) {
    status = 'PARTIAL';
    className = 'rounded-full bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-700 border border-amber-100';
  }

  return {
    grandTotal,
    balanceDue,
    amountPaid,
    status,
    className,
  };
};

const getApprovedExtensionHours = (rental) =>
  (rental?.extensions || [])
    .filter((ext) => ext.status === 'approved')
    .reduce((sum, ext) => sum + (parseFloat(ext.extension_hours) || 0), 0);

const getEffectiveRentalWindow = (rental) => {
  const startDate = new Date(rental?.started_at || rental?.rental_start_date);
  const scheduledEndDate = rental?.rental_end_date ? new Date(rental.rental_end_date) : null;
  const actualEndDate = rental?.actual_end_date ? new Date(rental.actual_end_date) : null;

  let endDate =
    actualEndDate && scheduledEndDate && actualEndDate > scheduledEndDate
      ? actualEndDate
      : (actualEndDate || scheduledEndDate);

  if ((!endDate || Number.isNaN(endDate.getTime())) && rental?.rental_end_date) {
    endDate = new Date(rental.rental_end_date);
  }

  if (
    endDate &&
    !Number.isNaN(endDate.getTime()) &&
    !rental?.actual_end_date &&
    rental?.extensions?.length
  ) {
    endDate = new Date(endDate.getTime() + (getApprovedExtensionHours(rental) * 60 * 60 * 1000));
  }

  return { startDate, endDate };
};

// ✅ FIXED: Calculate time remaining to match RentalDetails.jsx exactly
const calculateSmartTimeRemaining = (rental, nowTimestamp = Date.now()) => {
  if (rental.rental_status !== 'active') {
    return { text: null, color: null, bgColor: null, isBadge: false };
  }
  
  const now = new Date(nowTimestamp);

  // Use the real stored effective end datetime just like Rental Details.
  const rentalEndDate = rental?.rental_end_date ? new Date(rental.rental_end_date) : null;
  const actualEndDate = rental?.actual_end_date ? new Date(rental.actual_end_date) : null;
  const endDate =
    actualEndDate && rentalEndDate
      ? (actualEndDate > rentalEndDate ? actualEndDate : rentalEndDate)
      : (actualEndDate || rentalEndDate);
  const isHourly = rental.rental_type === 'hourly';

  if (!(endDate instanceof Date) || Number.isNaN(endDate.getTime())) {
    return { text: null, color: null, bgColor: null, isBadge: false };
  }

  // Fallback for older hourly rentals that still rely on a separate end-time field.
  if (isHourly && rental.rental_end_time && !String(rental.rental_end_date || '').includes('T')) {
    const [hours, minutes] = rental.rental_end_time.split(':');
    endDate.setHours(parseInt(hours), parseInt(minutes), 0, 0);
  }

  // Older rentals may not have actual_end_date updated yet, so keep this extension fallback only then.
  if (!rental?.actual_end_date && rental.extensions && rental.extensions.length > 0) {
    const approvedExtensions = rental.extensions.filter(ext => ext.status === "approved");
    const totalExtensionHours = approvedExtensions.reduce((sum, ext) => sum + (parseFloat(ext.extension_hours) || 0), 0);
    endDate.setHours(endDate.getHours() + totalExtensionHours);
  }
  
  const diffMs = endDate - now;
  
  // EXPIRED/OVERDUE STATES
  if (diffMs <= 0) {
    return {
      text: isHourly ? '00:00:00' : 'Overdue',
      color: 'text-red-600',
      bgColor: 'bg-red-50',
      icon: '⚠️',
      isDigital: isHourly
    };
  }
  
  // HOURLY RENTAL STATES (fallback for when started_at is missing)
  if (isHourly) {
    const totalSeconds = Math.floor(diffMs / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    
    const timeStr = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    
    return {
      text: timeStr,
      color: hours === 0 && minutes <= 30 ? 'text-red-600' : hours <= 2 ? 'text-orange-600' : 'text-green-600',
      bgColor: hours === 0 && minutes <= 30 ? 'bg-red-50' : hours <= 2 ? 'bg-orange-50' : 'bg-green-50',
      icon: hours === 0 && minutes <= 30 ? '🔴' : '⏰',
      isDigital: true
    };
  }
  
  // DAILY RENTAL STATES
  const totalSeconds = Math.floor(diffMs / 1000);
  const diffDays = Math.floor(totalSeconds / (24 * 60 * 60));
  const remainingAfterDays = totalSeconds % (24 * 60 * 60);
  const diffHours = Math.floor(remainingAfterDays / 3600);
  const diffMinutes = Math.floor((remainingAfterDays % 3600) / 60);
  const diffSeconds = remainingAfterDays % 60;
  
  if (diffDays > 0) {
    const text = diffDays === 1 ? tr('1 day', '1 jour') : tr(`${diffDays} days`, `${diffDays} jours`);
    const fullText = diffHours > 0 ? `${text} ${diffHours}h` : text;
    return { 
      text: fullText, 
      color: diffDays <= 1 ? 'text-orange-600' : 'text-green-600',
      bgColor: diffDays <= 1 ? 'bg-orange-50' : 'bg-green-50',
      icon: diffDays <= 1 ? '⏰' : '✅',
      isDigital: false
    };
  }

  if (diffHours > 0) {
    return { 
      text: tr(`${diffHours}h ${diffMinutes}m left`, `${diffHours}h ${diffMinutes}m restantes`), 
      color: diffHours <= 3 ? 'text-red-600' : 'text-orange-600',
      bgColor: diffHours <= 3 ? 'bg-red-50' : 'bg-orange-50',
      icon: diffHours <= 3 ? '🔴' : '⏰',
      isDigital: false
    };
  }

  return {
    text: tr(`${diffMinutes}m ${diffSeconds}s left`, `${diffMinutes}m ${diffSeconds}s restantes`),
    color: 'text-red-600',
    bgColor: 'bg-red-50',
    icon: '🔴',
    isDigital: true,
  };
};

const RentalTimeIndicator = memo(({ rental, compact = false, attention = null }) => {
  const [nowTimestamp, setNowTimestamp] = useState(Date.now());

  useEffect(() => {
    if (rental?.rental_status !== 'active') {
      return undefined;
    }

    const tickMs = rental?.rental_type === 'hourly' ? 1000 : 30000;
    const timer = window.setInterval(() => {
      setNowTimestamp(Date.now());
    }, tickMs);

    return () => window.clearInterval(timer);
  }, [rental?.rental_status, rental?.rental_type, rental?.id]);

  if (attention) {
    return (
      <div className={`mt-1 inline-flex items-center px-2 py-1 rounded text-xs font-medium ${attention.className}`}>
        {attention.text}
      </div>
    );
  }

  const timeRemaining = calculateSmartTimeRemaining(rental, nowTimestamp);
  if (!timeRemaining?.text) return null;

  if (compact) {
    return (
      <div className={`mt-1 inline-flex items-center gap-2 rounded-lg border border-white/70 px-3 py-2 ${timeRemaining.bgColor}`}>
        <Clock className={`h-3.5 w-3.5 ${timeRemaining.color}`} />
        <span className={`text-sm font-extrabold ${timeRemaining.color} tracking-tight`}>
          {timeRemaining.text}
        </span>
      </div>
    );
  }

  return (
    <div className={`mt-1 inline-block px-2.5 py-1.5 rounded text-sm font-semibold ${timeRemaining.bgColor} ${timeRemaining.color}`}>
      {timeRemaining.text}
    </div>
  );
});

// Smart date formatter that adapts to view mode
const formatSmartDate = (rental, isMobile = false) => {
  if (!rental.rental_start_date || !rental.rental_end_date) return 'N/A';
  
  const startDate = new Date(rental.rental_start_date);
  const endDate = new Date(rental.rental_end_date);
  const locale = isFrenchLocale() ? 'fr-FR' : 'en-US';
  const startLabel = startDate.toLocaleDateString(locale, { month: 'short', day: 'numeric' });
  const endLabel = endDate.toLocaleDateString(locale, { month: 'short', day: 'numeric' });
  const startTime = startDate.toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit', hour12: true });
  const endTime = endDate.toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit', hour12: true });
  const sameDay = startDate.toDateString() === endDate.toDateString();

  if (sameDay) {
    return isMobile
      ? `${startLabel}, ${startTime} - ${endTime}`
      : `${startLabel}, ${startTime} - ${endTime}`;
  }

  return isMobile
    ? `${startLabel}, ${startTime} - ${endLabel}, ${endTime}`
    : `${startLabel}, ${startTime} - ${endLabel}, ${endTime}`;
};

// Calculate duration badge
const getDurationBadge = (rental) => {
  if (!rental.rental_start_date || !rental.rental_end_date) return null;
  
  const startDate = new Date(rental.rental_start_date);
  const endDate = new Date(rental.rental_end_date);
  
  if (rental.rental_type === 'hourly' && rental.rental_start_time && rental.rental_end_time) {
    const [startHours, startMinutes] = rental.rental_start_time.split(':').map(Number);
    const [endHours, endMinutes] = rental.rental_end_time.split(':').map(Number);
    startDate.setHours(startHours, startMinutes);
    endDate.setHours(endHours, endMinutes);
    
    const diffHours = Math.round((endDate - startDate) / (1000 * 60 * 60));
    return (
      <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded bg-purple-50 text-purple-700 border border-purple-200">
        {diffHours}h
      </span>
    );
  }
  
  const diffDays = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24));
  return (
    <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded bg-blue-50 text-blue-700 border border-blue-200">
      {diffDays}d
    </span>
  );
};

const Rentals = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const isFrench = isFrenchLocale();
  const warmRentalsSnapshot = useMemo(() => appWarmupService.getWarmRentalsSnapshot(), []);
  const hasWarmRentalsHint = useMemo(
    () => Boolean(warmRentalsSnapshot) || appWarmupService.isWarmupLikelyActive(),
    [warmRentalsSnapshot]
  );
  
  // Helper function to normalize phone numbers for better searching
  const normalizePhone = (phone) => {
    if (!phone) return '';
    return phone.replace(/[\s\-\(\)\.\+]/g, '');
  };

  // Helper function to format phone for display
  const formatPhoneForDisplay = (phone) => {
    if (!phone) return 'N/A';
    if (phone.includes('-') || phone.includes(' ') || phone.includes('(')) {
      return phone;
    }
    const cleaned = phone.replace(/\D/g, '');
    if (cleaned.length === 10) {
      return `(${cleaned.slice(0,3)}) ${cleaned.slice(3,6)}-${cleaned.slice(6)}`;
    }
    return phone;
  };

  const getEffectiveRentalStatus = useCallback((rental) => deriveEffectiveRentalStatus(rental), []);

  const handleSendReminder = (rental, event) => {
    event?.stopPropagation?.();

    const cleanPhone = String(rental?.customer_phone || '').replace(/\D/g, '');
    if (!cleanPhone) {
      alert(tr('Customer phone number is missing for this rental.', 'Le numéro de téléphone du client est manquant pour cette location.'));
      return;
    }

    const startDate = rental?.rental_start_date ? new Date(rental.rental_start_date) : null;
    const formattedStart = startDate && !Number.isNaN(startDate.getTime())
      ? startDate.toLocaleString(isFrench ? 'fr-FR' : 'en-US', {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
        })
      : tr('your scheduled time', 'votre horaire prévu');
    const vehicleLabel = buildVehicleReminderLabel(rental);
    const message = `Bonjour ${rental?.customer_name || ''}, rappel amical : vous avez une location à venir pour ${vehicleLabel} le ${formattedStart}. Merci de nous contacter sur WhatsApp si vous avez besoin d'aide ou d'un ajustement.`;

    window.open(`https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer');
  };

const [rentals, setRentals] = useState(() => warmRentalsSnapshot?.rentals || []);
  const [rentalReportMap, setRentalReportMap] = useState(() => warmRentalsSnapshot?.rentalReportMap || {});

    const [searchTerm, setSearchTerm] = useState('');

  const [vehicles, setVehicles] = useState(() => warmRentalsSnapshot?.vehicles || []);
  const [loading, setLoading] = useState(() => !hasWarmRentalsHint);
  const [refreshing, setRefreshing] = useState(false);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(() => hasWarmRentalsHint);
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [showStepperForm, setShowStepperForm] = useState(false);
  const [editingRental, setEditingRental] = useState(null);
  const [wizardInitialStep, setWizardInitialStep] = useState(1);
  const [wizardCustomerScanNote, setWizardCustomerScanNote] = useState('');
  const [wizardRequiresCustomerVerification, setWizardRequiresCustomerVerification] = useState(false);
  
  const [statusFilter, setStatusFilter] = useState('all');
  const [paymentStatusFilter, setPaymentStatusFilter] = useState('all');
  const [availabilityQuickFilter, setAvailabilityQuickFilter] = useState('all');
  const [dateFocusFilter, setDateFocusFilter] = useState('all');
  const [dateFocusCounts, setDateFocusCounts] = useState(() => warmRentalsSnapshot?.dateFocusCounts || { day: 0, week: 0 });
  const [isMobileViewport, setIsMobileViewport] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth < 640 : false
  );
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(() => warmRentalsSnapshot?.currentPage || 1);
  const [itemsPerPage, setItemsPerPage] = useState(() => warmRentalsSnapshot?.itemsPerPage || 10);
  const [totalCount, setTotalCount] = useState(() => warmRentalsSnapshot?.totalCount || 0);
  const [totalPages, setTotalPages] = useState(() => warmRentalsSnapshot?.totalPages || 0);
  const [vehicleFuelStateMap, setVehicleFuelStateMap] = useState(() => warmRentalsSnapshot?.vehicleFuelStateMap || {});
  const [rentalOverviewSnapshot, setRentalOverviewSnapshot] = useState(() => warmRentalsSnapshot?.rentalOverviewSnapshot || {
    activeVehicleIds: [],
    scheduledVehicleIds: [],
  });
  const [viewMode, setViewMode] = useState('grid'); // 'list', 'table', or 'grid'
  const [showFilters, setShowFilters] = useState(false); // Mobile filter collapse
  const deferredSearchTerm = useDeferredValue(searchTerm);
  const rentalRefreshTimeoutRef = useRef(null);
  const isFetchingRentalsRef = useRef(false);
  const activeRentalsFetchRef = useRef(null);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const updateViewport = () => {
      setIsMobileViewport(window.innerWidth < 640);
    };

    updateViewport();
    window.addEventListener('resize', updateViewport);
    return () => window.removeEventListener('resize', updateViewport);
  }, []);

  const vehicleAvailabilitySummary = useMemo(() => {
    const safeVehicles = Array.isArray(vehicles) ? vehicles : [];
    const activeVehicleIds = new Set((rentalOverviewSnapshot.activeVehicleIds || []).map(String));
    const scheduledVehicleIds = new Set((rentalOverviewSnapshot.scheduledVehicleIds || []).map(String));

    const summary = {
      total: 0,
      available: 0,
      rented: 0,
      scheduled: 0,
      maintenance: 0,
      out_of_service: 0,
    };

    summary.total = safeVehicles.length;
    summary.rented = activeVehicleIds.size;
    summary.scheduled = scheduledVehicleIds.size;

    const blockedVehicleIds = new Set([
      ...activeVehicleIds,
      ...scheduledVehicleIds,
    ]);

    safeVehicles.forEach((vehicle) => {
      const vehicleId = String(vehicle?.id || '');
      const status = String(vehicle?.status || '').toLowerCase();

      if (status === 'maintenance') {
        summary.maintenance += 1;
        if (vehicleId) blockedVehicleIds.add(vehicleId);
      } else if (status === 'out_of_service') {
        summary.out_of_service += 1;
        if (vehicleId) blockedVehicleIds.add(vehicleId);
      }
    });    

    summary.available = Math.max(summary.total - blockedVehicleIds.size, 0);

    return summary;
  }, [vehicles, rentalOverviewSnapshot]);
  
  const [videoContractModal, setVideoContractModal] = useState({
    isOpen: false,
    rental: null,
    type: null // 'start' or 'close'
  });

  const [customerDetailsDrawer, setCustomerDetailsDrawer] = useState({
    isOpen: false,
    customerId: null,
    rental: null
  });

  const applyRentalSummarySnapshot = useCallback((snapshot) => {
    if (!snapshot) return;
    setRentals((snapshot.rentals || []).map(normalizeRentalLifecycle));
    setRentalReportMap(snapshot.rentalReportMap || {});
    setTotalCount(snapshot.totalCount || 0);
    setTotalPages(snapshot.totalPages || 0);
    setCurrentPage(snapshot.currentPage || 1);
    setItemsPerPage(snapshot.itemsPerPage || 10);
    setDateFocusCounts(snapshot.dateFocusCounts || { day: 0, week: 0 });
    setVehicles(snapshot.vehicles || []);
    setVehicleFuelStateMap(snapshot.vehicleFuelStateMap || {});
    setRentalOverviewSnapshot(snapshot.rentalOverviewSnapshot || {
      activeVehicleIds: [],
      scheduledVehicleIds: [],
    });
  }, []);

  const fetchRentals = async (currentStatusFilter, currentPaymentStatusFilter, page = currentPage, limit = itemsPerPage) => {
    if (isFetchingRentalsRef.current) {
      return activeRentalsFetchRef.current;
    }

    activeRentalsFetchRef.current = (async () => {
      try {
        isFetchingRentalsRef.current = true;
        const normalizedStatusFilter = String(currentStatusFilter || '').toLowerCase();
        const isImpoundedStatusFilter = normalizedStatusFilter === 'impounded';

        // Calculate range for pagination
        const from = (page - 1) * limit;
        const to = from + limit - 1;
        const shouldFilterClientSide = normalizedStatusFilter && normalizedStatusFilter !== 'all';

        // Now fetch paginated data
        let query = supabase
          .from('app_4c3a7a6153_rentals')
          .select(`
            id,
            rental_id,
            customer_id,
            customer_name,
            customer_email,
            customer_phone,
            rental_type,
            rental_status,
            rental_start_date,
            rental_end_date,
            rental_start_time,
            rental_end_time,
            actual_end_date,
            started_at,
            completed_at,
            created_at,
            vehicle_id,
            status,
            payment_status,
            approval_status,
            pending_total_request,
            total_amount,
            deposit_amount,
            fuel_charge,
            end_fuel_level,
            unit_price,
            quantity_days,
            quantity_hours,
            signature_url,
            contract_signed,
            opening_video_url,
            start_odometer,
            start_fuel_level,
            damage_deposit,
            deposit_returned_at,
            is_impounded,
            impounded_at,
            released_from_impound_at,
            vehicle:saharax_0u4w4d_vehicles!app_4c3a7a6153_rentals_vehicle_id_fkey(
              id,
              name,
              model,
              plate_number,
              status,
              vehicle_type
            ),
            extensions:rental_extensions!rental_extensions_rental_id_fkey(
              id,
              extension_hours,
              extension_price,
              status,
              created_at
            )
          `, { count: 'planned' });

        if (!shouldFilterClientSide) {
          query = query.range(from, to);
        }

        if (currentPaymentStatusFilter && currentPaymentStatusFilter !== 'all') {
          query = query.eq('payment_status', currentPaymentStatusFilter);
        }
        
        query = query.order('created_at', { ascending: false });

        let { data, error, count } = await query;

        if (error) {
          console.error('❌ Supabase Error', { message: error.message, details: error.details, hint: error.hint, code: error.code });
          throw error;
        }

        let nextRentals = (data || []).map(normalizeRentalLifecycle);
        let nextTotalCount = count || 0;

        if (shouldFilterClientSide) {
          const filteredRentals = nextRentals.filter((rental) => getEffectiveRentalStatus(rental) === normalizedStatusFilter);
          nextTotalCount = filteredRentals.length;
          nextRentals = filteredRentals.slice(from, to + 1);
        }

        setTotalCount(nextTotalCount);
        setTotalPages(Math.ceil(nextTotalCount / limit));
        setRentals(nextRentals);
        const rentalIds = nextRentals.map((rental) => rental.id).filter(Boolean);
        void VehicleReportService.getLatestReportsForRentals(rentalIds)
          .then((latestReports) => {
            setRentalReportMap(latestReports);
          })
          .catch((reportError) => {
            console.error('❌ Error fetching rental reports:', reportError);
          });

      } catch (err) {
        console.error('❌ Supabase Error', { message: err.message, details: err.details, hint: err.hint, code: err.code });
        setError(err.message);
      } finally {
        isFetchingRentalsRef.current = false;
        activeRentalsFetchRef.current = null;
      }
    })();

    return activeRentalsFetchRef.current;
  };



  // Add this function to check if rental can be started from list view
  const canStartFromList = (rental) => {
    // Check payment
    const isPaid = getRentalFinancialSnapshot(rental).status === 'PAID';
    // Check if contract is signed (has signature URL)
    const isContractSigned = !!rental.signature_url || rental.contract_signed;
    // Check opening video exists
    const hasOpeningVideo = !!rental.opening_video_url;
    // Check odometer
    const hasOdometer = !!rental.start_odometer;
    // For daily rentals, also check fuel level
    const isDaily = rental.rental_type === 'daily';
    const hasFuelLevel = !isDaily || rental.start_fuel_level !== null;
    
    return isPaid && isContractSigned && hasOpeningVideo && hasOdometer && hasFuelLevel;
  };


  const handleStartRentalFromList = async (rental) => {
    if (!confirm(`Start rental ${rental.rental_id}? This will activate the rental timer.`)) {
      return;
    }

    try {
      const actorName =
        user?.user_metadata?.full_name ||
        user?.email ||
        null;

      // Calculate actual times
      const now = new Date();
      const actualStartTime = now.toISOString();
      const scheduledStart = new Date(rental.rental_start_date);
      const scheduledEnd = new Date(rental.rental_end_date);
      const originalDuration = scheduledEnd - scheduledStart;
      const actualEndTime = new Date(now.getTime() + originalDuration).toISOString();

      // Update rental status to active
      const { error: updateError } = await supabase
        .from('app_4c3a7a6153_rentals')
        .update({ 
          rental_status: 'active', 
          started_at: actualStartTime,
          actual_end_date: actualEndTime,
          started_by: user?.id || null,
          started_by_name: actorName,
        })
        .eq('id', rental.id);

      if (updateError) throw updateError;

      // Update vehicle status
      if (rental.vehicle_id) {
        await supabase
          .from('saharax_0u4w4d_vehicles')
          .update({ status: 'rented' })
          .eq('id', rental.vehicle_id);
      }

      // Show success message
      alert(`✅ Rental ${rental.rental_id} started successfully! Timer is now active.`);
      
      // Refresh the list
      appWarmupService.invalidateModule('rentals');
      fetchRentals(statusFilter, paymentStatusFilter);
      void fetchRentalOverviewSnapshot();
      appWarmupService.invalidateModule('finance');
      
    } catch (err) {
      console.error('❌ Error starting rental from list:', err);
      alert(`Failed to start rental: ${err.message}`);
    }
  };

  const fetchVehicles = async () => {
    try {
      const { data, error } = await supabase
        .from('saharax_0u4w4d_vehicles')
        .select('id,status')
        .order('id', { ascending: true });

      if (error) {
        console.error('❌ Supabase Error', { message: error.message, details: error.details, hint: error.hint, code: error.code });
        throw error;
      }
      setVehicles(data || []);
    } catch (err) {
      console.error('❌ Supabase Error', { message: err.message, details: err.details, hint: err.hint, code: err.code });
      setError(err.message);
    }
  };

  const fetchVehicleFuelStates = async () => {
    try {
      const states = await FuelTransactionService.getVehicleFuelStates();
      const nextMap = {};
      (states || []).forEach((state) => {
        const stateKey = String(state?.vehicle_id || state?.id || '');
        if (stateKey) {
          nextMap[stateKey] = state;
        }
      });
      setVehicleFuelStateMap(nextMap);
    } catch (err) {
      console.error('❌ Error fetching vehicle fuel states:', err);
    }
  };

  const fetchRentalOverviewSnapshot = async () => {
    try {
      const { data, error } = await supabase
        .from('app_4c3a7a6153_rentals')
        .select('vehicle_id, rental_status')
        .in('rental_status', ['active', 'scheduled', 'confirmed']);

      if (error) {
        throw error;
      }

      const activeVehicleIds = new Set();
      const scheduledVehicleIds = new Set();

      (data || []).forEach((row) => {
        const vehicleId = row?.vehicle_id ? String(row.vehicle_id) : '';
        const status = String(row?.rental_status || '').toLowerCase();
        if (!vehicleId) return;

        if (status === 'active') {
          activeVehicleIds.add(vehicleId);
          return;
        }

        if (status === 'scheduled' || status === 'confirmed') {
          scheduledVehicleIds.add(vehicleId);
        }
      });

      setRentalOverviewSnapshot({
        activeVehicleIds: [...activeVehicleIds],
        scheduledVehicleIds: [...scheduledVehicleIds].filter((vehicleId) => !activeVehicleIds.has(vehicleId)),
      });
    } catch (err) {
      console.error('❌ Error fetching rental overview snapshot:', err);
    }
  };

  const fetchDateFocusCounts = useCallback(async (currentStatusFilter = statusFilter, currentPaymentStatusFilter = paymentStatusFilter) => {
    try {
      const now = new Date();
      const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const endOfToday = new Date(startOfToday);
      endOfToday.setDate(endOfToday.getDate() + 1);

      const dayOfWeek = startOfToday.getDay();
      const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
      const startOfWeek = new Date(startOfToday);
      startOfWeek.setDate(startOfWeek.getDate() + mondayOffset);
      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(endOfWeek.getDate() + 7);

      const buildCountQuery = (fromDate, toDate) => {
        const normalizedStatusFilter = String(currentStatusFilter || '').toLowerCase();
        const isImpoundedStatusFilter = normalizedStatusFilter === 'impounded';

        let query = supabase
          .from('app_4c3a7a6153_rentals')
          .select(`
            id,
            rental_status,
            status,
            started_at,
            completed_at,
            is_impounded,
            impounded_at,
            released_from_impound_at,
            vehicle:saharax_0u4w4d_vehicles!app_4c3a7a6153_rentals_vehicle_id_fkey(
              status
            )
          `, { count: 'exact', head: !normalizedStatusFilter || normalizedStatusFilter === 'all' })
          .gte('rental_start_date', fromDate.toISOString())
          .lt('rental_start_date', toDate.toISOString());

        if (currentPaymentStatusFilter && currentPaymentStatusFilter !== 'all') {
          query = query.eq('payment_status', currentPaymentStatusFilter);
        }

        return query;
      };

      const [
        { count: dayCount, data: dayData, error: dayError },
        { count: weekCount, data: weekData, error: weekError },
      ] = await Promise.all([
        buildCountQuery(startOfToday, endOfToday),
        buildCountQuery(startOfWeek, endOfWeek),
      ]);

      if (dayError) throw dayError;
      if (weekError) throw weekError;

      const normalizedStatusFilter = String(currentStatusFilter || '').toLowerCase();
      const resolveCount = (rawCount, rawRows) => {
        if (!normalizedStatusFilter || normalizedStatusFilter === 'all') {
          return rawCount || 0;
        }

        return (rawRows || [])
          .map(normalizeRentalLifecycle)
          .filter((rental) => getEffectiveRentalStatus(rental) === normalizedStatusFilter)
          .length;
      };

      const resolvedDayCount = resolveCount(dayCount, dayData);
      const resolvedWeekCount = resolveCount(weekCount, weekData);

      setDateFocusCounts({
        day: resolvedDayCount,
        week: resolvedWeekCount,
      });
    } catch (err) {
      console.error('❌ Error fetching day/week rental counts:', err);
    }
  }, [getEffectiveRentalStatus, paymentStatusFilter, statusFilter]);

  const refreshSecondaryRentalData = () => {
    void fetchVehicles();
    void fetchVehicleFuelStates();
    void fetchRentalOverviewSnapshot();
  };

  const doesRentalMatchFilters = useCallback((rental, status = statusFilter, payment = paymentStatusFilter) => {
    if (!rental) return false;

    const rentalStatus = getEffectiveRentalStatus(rental);
    const rentalPaymentStatus = String(rental?.payment_status || '').toLowerCase();

    const matchesStatus = !status || status === 'all' || rentalStatus === String(status).toLowerCase();
    const matchesPayment = !payment || payment === 'all' || rentalPaymentStatus === String(payment).toLowerCase();

    return matchesStatus && matchesPayment;
  }, [getEffectiveRentalStatus, paymentStatusFilter, statusFilter]);

  const scheduleRentalRefresh = useCallback(() => {
    if (rentalRefreshTimeoutRef.current) {
      window.clearTimeout(rentalRefreshTimeoutRef.current);
    }

    rentalRefreshTimeoutRef.current = window.setTimeout(() => {
      fetchRentals(statusFilter, paymentStatusFilter, currentPage, itemsPerPage);
      rentalRefreshTimeoutRef.current = null;
    }, 180);
  }, [statusFilter, paymentStatusFilter, currentPage, itemsPerPage]);

  const checkClosingVideo = async (rentalId) => {
    try {
      const { data: mediaRecords, error } = await supabase
        .from('app_2f7bf469b0_rental_media')
        .select('*')
        .eq('rental_id', rentalId)
        .eq('phase', 'in') // 'in' = closing
        .ilike('file_type', 'video%');

      if (error) {
        console.error('❌ Supabase Error', { message: error.message, details: error.details, hint: error.hint, code: error.code });
        return false;
      }

      return mediaRecords && mediaRecords.length > 0;
    } catch (err) {
      console.error('❌ Supabase Error', { message: err.message, details: err.details, hint: err.hint, code: err.code });
      return false;
    }
  };

  const isPaymentSufficientForStart = (rental) => {
    return getRentalFinancialSnapshot(rental).status === 'PAID';
  };

  // Check if current user can delete rentals
  const canDelete = () => {
    if (!user?.id) return false;
    
    
    return user.role === 'owner';
  };

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const statusFromUrl = params.get('status') || 'all';
    const paymentStatusFromUrl = params.get('paymentStatus') || 'all';
    setStatusFilter(statusFromUrl);
    setPaymentStatusFilter(paymentStatusFromUrl);
  }, [location.search]);

  useEffect(() => {
    const loadRentals = async () => {
      if (!hasLoadedOnce) {
        setLoading(true);
      } else {
        setRefreshing(true);
      }

      const shouldUseSummarySource =
        currentPage === 1 &&
        itemsPerPage === 10 &&
        String(statusFilter || '').toLowerCase() !== 'impounded';

      if (shouldUseSummarySource) {
        try {
          const summarySnapshot = await rentalSummaryService.getListSummary({
            statusFilter,
            paymentStatusFilter,
            page: currentPage,
            limit: itemsPerPage,
          });
          applyRentalSummarySnapshot(summarySnapshot);
        } catch (summaryError) {
          console.error('❌ Error fetching rental summary:', summaryError);
          await fetchRentals(statusFilter, paymentStatusFilter, currentPage, itemsPerPage);
          await fetchDateFocusCounts(statusFilter, paymentStatusFilter);
        }
      } else {
        await fetchRentals(statusFilter, paymentStatusFilter, currentPage, itemsPerPage);
        await fetchDateFocusCounts(statusFilter, paymentStatusFilter);
      }

      setLoading(false);
      setRefreshing(false);
      setHasLoadedOnce(true);
    };
    loadRentals();
  }, [statusFilter, paymentStatusFilter, currentPage, itemsPerPage, fetchDateFocusCounts, applyRentalSummarySnapshot]);

  useEffect(() => {
    if (
      statusFilter !== 'all' ||
      paymentStatusFilter !== 'all' ||
      currentPage !== 1 ||
      itemsPerPage !== 10
    ) {
      return;
    }

    appWarmupService.setWarmRentalsSnapshot({
      rentals,
      rentalReportMap,
      totalCount,
      totalPages,
      currentPage,
      itemsPerPage,
      statusFilter,
      paymentStatusFilter,
      dateFocusCounts,
      vehicles,
      vehicleFuelStateMap,
      rentalOverviewSnapshot,
    });
  }, [
    currentPage,
    dateFocusCounts,
    itemsPerPage,
    paymentStatusFilter,
    rentalOverviewSnapshot,
    rentalReportMap,
    rentals,
    statusFilter,
    totalCount,
    totalPages,
    vehicleFuelStateMap,
    vehicles,
  ]);

  // Refresh list when tab becomes visible again (e.g. returning from RentalDetails)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        scheduleRentalRefresh();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [scheduleRentalRefresh]);

  useEffect(() => {
    const scheduledId = scheduleBackgroundTask(() => {
      refreshSecondaryRentalData();
    });

    const rentalSubscription = supabase
      .channel('rental_changes')
      .on('postgres_changes', 
        { 
          event: '*', 
          schema: 'public', 
          table: 'app_4c3a7a6153_rentals' 
        }, 
        (payload) => {
          const changedRental =
            payload.eventType === 'DELETE'
              ? payload.old
              : payload.new;

          if (changedRental?.id) {
            setRentals((prev) => {
              const existingIndex = prev.findIndex((item) => item.id === changedRental.id);

              if (payload.eventType === 'DELETE') {
                return existingIndex === -1
                  ? prev
                  : prev.filter((item) => item.id !== changedRental.id);
              }

              if (existingIndex === -1) {
                return prev;
              }

              const mergedRental = {
                ...prev[existingIndex],
                ...changedRental,
              };
              const normalizedMergedRental = normalizeRentalLifecycle(mergedRental);

              if (!doesRentalMatchFilters(normalizedMergedRental)) {
                return prev.filter((item) => item.id !== changedRental.id);
              }

              const next = [...prev];
              next[existingIndex] = normalizedMergedRental;
              return next;
            });
          }

          const insertedRental = payload.eventType === 'INSERT';
          const statusChanged = payload.eventType === 'UPDATE' && payload.new?.rental_status !== payload.old?.rental_status;
          const lifecycleChanged =
            statusChanged ||
            (payload.eventType === 'UPDATE' && payload.new?.started_at !== payload.old?.started_at) ||
            (payload.eventType === 'UPDATE' && payload.new?.completed_at !== payload.old?.completed_at);

          if (insertedRental || lifecycleChanged) {
            fetchRentals(statusFilter, paymentStatusFilter, currentPage, itemsPerPage);
            fetchDateFocusCounts(statusFilter, paymentStatusFilter);
          } else {
            scheduleRentalRefresh();
          }
          scheduleBackgroundTask(() => {
            void fetchVehicleFuelStates();
            void fetchRentalOverviewSnapshot();
            if (!insertedRental) {
              void fetchDateFocusCounts(statusFilter, paymentStatusFilter);
            }
          });
        }
      )
      .on(
        'broadcast',
        { event: 'status_updated' },
        ({ payload }) => {
          const rentalId = payload?.rental_id;
          if (!rentalId) return;

          setRentals((prev) => {
            const existingIndex = prev.findIndex((item) => item.id === rentalId);
            if (existingIndex === -1) return prev;

            const mergedRental = {
              ...prev[existingIndex],
              rental_status: payload?.rental_status || prev[existingIndex].rental_status,
              status: payload?.status || prev[existingIndex].status,
              started_at: payload?.started_at ?? prev[existingIndex].started_at,
              completed_at: payload?.completed_at ?? prev[existingIndex].completed_at,
              updated_at: payload?.updated_at ?? prev[existingIndex].updated_at,
            };
            const normalizedMergedRental = normalizeRentalLifecycle(mergedRental);

            if (!doesRentalMatchFilters(normalizedMergedRental)) {
              return prev.filter((item) => item.id !== rentalId);
            }

            const next = [...prev];
            next[existingIndex] = normalizedMergedRental;
            return next;
          });

          fetchRentals(statusFilter, paymentStatusFilter, currentPage, itemsPerPage);
          scheduleBackgroundTask(() => {
            void fetchVehicleFuelStates();
            void fetchRentalOverviewSnapshot();
            void fetchDateFocusCounts(statusFilter, paymentStatusFilter);
          });
        }
      )
      .on(
        'broadcast',
        { event: 'rental_created' },
        ({ payload }) => {
          const rentalId = payload?.rental_id;
          if (!rentalId) return;

          fetchRentals(statusFilter, paymentStatusFilter, currentPage, itemsPerPage);
          scheduleBackgroundTask(() => {
            void fetchVehicleFuelStates();
            void fetchRentalOverviewSnapshot();
            void fetchDateFocusCounts(statusFilter, paymentStatusFilter);
          });
        }
      )
      .subscribe();

    const vehicleSubscription = supabase
      .channel('vehicle_changes')
      .on('postgres_changes', 
        { 
          event: '*', 
          schema: 'public', 
          table: 'saharax_0u4w4d_vehicles' 
        }, 
        () => {
          scheduleBackgroundTask(() => {
            refreshSecondaryRentalData();
          });
        }
      )
      .subscribe();

    return () => {
      if (typeof window !== 'undefined' && typeof window.cancelIdleCallback === 'function' && typeof scheduledId === 'number') {
        window.cancelIdleCallback(scheduledId);
      } else {
        clearTimeout(scheduledId);
      }
      supabase.removeChannel(rentalSubscription);
      supabase.removeChannel(vehicleSubscription);
    };
  }, [doesRentalMatchFilters, fetchDateFocusCounts, statusFilter, paymentStatusFilter, scheduleRentalRefresh]);

  useEffect(() => {
    return () => {
      if (rentalRefreshTimeoutRef.current) {
        window.clearTimeout(rentalRefreshTimeoutRef.current);
      }
    };
  }, []);

  // Check for openForm state from navigation
  useEffect(() => {
    if (location.state?.openForm) {
      if (location.state?.editingRental) {
        setEditingRental(location.state.editingRental);
      }
      setWizardInitialStep(Number(location.state?.forceStep) || 1);
      setWizardCustomerScanNote(location.state?.customerScanNote || '');
      setWizardRequiresCustomerVerification(Boolean(location.state?.requireCustomerVerification));
      setShowStepperForm(true);
      // Clear the state to prevent reopening on refresh
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);

  const handleRentalSuccess = async (rentalData) => {
    setShowForm(false);
    setShowStepperForm(false);
    setEditingRental(null);
    setWizardInitialStep(1);
    setWizardCustomerScanNote('');
    setWizardRequiresCustomerVerification(false);
    appWarmupService.invalidateModule('rentals');
    appWarmupService.invalidateModule('finance');
    fetchRentals(statusFilter, paymentStatusFilter);
    refreshSecondaryRentalData();

    if (rentalData?.id) {
      try {
        await supabase
          .channel('rental-updates')
          .send({
            type: 'broadcast',
            event: 'rental_created',
            payload: {
              rental_id: rentalData.id,
              rental_status: rentalData.rental_status || 'scheduled',
              created_at: rentalData.created_at || new Date().toISOString(),
            },
          });
      } catch (broadcastErr) {
        console.warn('Rental created broadcast failed (non-critical):', broadcastErr);
      }
    }
  };

  const handleDeleteRental = async (rentalId) => {
    // Check owner permission first
    if (user?.role !== 'owner') {
      alert('⚠️ Only owners can delete rentals.');
      return;
    }

    if (!window.confirm('Are you sure you want to delete this rental?')) {
      return;
    }

    try {
      const result = await EnhancedTransactionalRentalService.deleteRental(rentalId);

      if (!result?.success) {
        throw new Error(result?.error || 'Failed to delete rental');
      }

      appWarmupService.invalidateModule('rentals');
      appWarmupService.invalidateModule('finance');
      appWarmupService.invalidateModule('maintenance');
      fetchRentals(statusFilter, paymentStatusFilter);
      void fetchRentalOverviewSnapshot();
      if (result?.warning) {
        setError(result.warning);
      }
    } catch (err) {
      console.error('❌ Supabase Error', { message: err.message, details: err.details, hint: err.hint, code: err.code });
      setError(err.message);
    }
  };

  const handleViewRental = (rental) => {
    navigate(`/admin/rentals/${rental.id}`);
  };

  const handleViewCustomerDetails = (rental) => {
    const customerId = rental.customer_id || rental.id;
    
    setCustomerDetailsDrawer({
      isOpen: true,
      customerId: customerId,
      rental: rental
    });
  };

  const handleStartContract = (rental) => {
    if (!isPaymentSufficientForStart(rental)) {
      alert('⚠️ Payment must be "Paid" before starting the vehicle condition check.');
      return;
    }

    setVideoContractModal({
      isOpen: true,
      rental: rental,
      type: 'start'
    });
  };

  const handleCloseContract = async (rental) => {
    const paymentStatus = String(rental?.payment_status || '').toLowerCase();
    const remainingAmount = Math.max(0, Number(rental?.remaining_amount || 0) || 0);
    const isFullyPaid = paymentStatus === 'paid' || remainingAmount <= 0;

    if (!isFullyPaid) {
      alert('⚠️ Rental must be fully paid before completion.');
      return;
    }

    const hasClosingVideo = await checkClosingVideo(rental.id);
    
    if (!hasClosingVideo) {
      setVideoContractModal({
        isOpen: true,
        rental: rental,
        type: 'close'
      });
      return;
    }

    if (!window.confirm('Are you sure you want to complete this rental?')) {
      return;
    }

    try {
      let { data, error } = await supabase
        .from('app_4c3a7a6153_rentals')
        .update({ 
          rental_status: 'completed',
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', rental.id)
        .select()
        .single();

      if (error) {
        console.error('❌ Supabase Error', { message: error.message, details: error.details, hint: error.hint, code: error.code });
        throw error;
      }

      alert('✅ Rental completed successfully!');
      
      appWarmupService.invalidateModule('rentals');
      appWarmupService.invalidateModule('finance');
      fetchRentals(statusFilter, paymentStatusFilter);
      refreshSecondaryRentalData();
    } catch (err) {
      console.error('❌ Supabase Error', { message: err.message, details: err.details, hint: err.hint, code: err.code });
      alert('❌ Failed to complete rental: ' + err.message);
    }
  };

  const handleVideoContractSuccess = (updatedRental) => {
    setVideoContractModal({
      isOpen: false,
      rental: null,
      type: null
    });
    
    const action = videoContractModal.type === 'start' ? 'started' : 'completed';
    alert(`✅ Contract ${action} successfully!`);
    
    fetchRentals(statusFilter, paymentStatusFilter);
    refreshSecondaryRentalData();
  };

  const getStatusBadge = (status) => {
    const configs = {
      'scheduled': { text: 'Scheduled', className: 'bg-blue-100 text-blue-800' },
      'active': { text: 'Active', className: 'bg-green-100 text-green-800' },
      'impounded': { text: 'Impounded', className: 'bg-amber-100 text-amber-800' },
      'completed': { text: 'Completed', className: 'bg-gray-100 text-gray-800' },
      'cancelled': { text: 'Cancelled', className: 'bg-red-100 text-red-800' },
      'expired': { text: 'Expired', className: 'bg-yellow-100 text-yellow-800' },
      'void': { text: 'Void', className: 'bg-red-100 text-red-800' }
    };
    
    const config = configs[status] || configs['scheduled'];
    const translatedText = {
      Scheduled: tr('Scheduled', 'Planifiée'),
      Active: tr('Active', 'Active'),
      Impounded: tr('Impounded', 'Mis en fourrière'),
      Completed: tr('Completed', 'Terminée'),
      Cancelled: tr('Cancelled', 'Annulée'),
      Expired: tr('Expired', 'Expirée'),
      Void: tr('Void', 'Nulle'),
    }[config.text] || config.text;

    return (
      <span className={`px-2 py-1 text-xs font-medium rounded-full ${config.className}`}>
        {translatedText}
      </span>
    );
  };

  const getPaymentStatusBadge = (paymentStatus) => {
    const { label, background, text } = getPaymentStatusStyle(paymentStatus);
    const colorClass = `${background} ${text}`;

    return (
      <span className={`px-2 py-1 text-xs font-medium rounded-full ${colorClass}`}>
        {label}
      </span>
    );
  };

  const getRentalAttentionState = (rental) => {
    const report = rentalReportMap[rental.id];
    if (!report) return null;

    if (
      rental.rental_status === 'completed' &&
      report.status === 'maintenance_completed'
    ) {
      return {
        text: tr('Maintenance Closed', 'Maintenance clôturée'),
        className: 'bg-slate-100 text-slate-800 border border-slate-300',
        detailText: tr('This rental had a linked maintenance issue that was resolved after return', 'Cette location avait un problème de maintenance lié qui a été résolu après le retour'),
      };
    }

    if (
      report.maintenance_id ||
      rental.vehicle?.status === 'maintenance' ||
      ['maintenance_created', 'maintenance_in_progress', 'maintenance_completed'].includes(report.status)
    ) {
      return {
        text: tr('Under Maintenance', 'En maintenance'),
        className: 'bg-orange-100 text-orange-800 border border-orange-200',
        detailText: tr('Vehicle report linked to Quad Maintenance', 'Rapport véhicule lié à la maintenance du quad'),
      };
    }

    const labels = {
      damage: tr('Damage Report Saved', 'Rapport de dommage enregistré'),
      accident: tr('Accident Report Saved', "Rapport d'accident enregistré"),
      mechanical_issue: tr('Mechanical Report Saved', 'Rapport mécanique enregistré'),
    };

    return {
      text: labels[report.report_type] || tr('Vehicle Report', 'Rapport véhicule'),
      className: 'bg-red-100 text-red-800 border border-red-200',
      detailText: tr('Vehicle inspection report saved on this rental', "Rapport d'inspection véhicule enregistré sur cette location"),
    };
  };

  const formatRentalId = (rental) => {
    if (rental.rental_id) {
      return rental.rental_id;
    }
    
    const date = new Date(rental.created_at || Date.now());
    const year = date.getFullYear();
    const idPart = String(rental.id).slice(-3).padStart(3, '0');
    return `RNT-${year}-${idPart}`;
  };

  const filteredRentals = useMemo(() => {
    const normalizedSearch = deferredSearchTerm.trim().toLowerCase();
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfToday = new Date(startOfToday);
    endOfToday.setDate(endOfToday.getDate() + 1);

    const dayOfWeek = startOfToday.getDay();
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const startOfWeek = new Date(startOfToday);
    startOfWeek.setDate(startOfWeek.getDate() + mondayOffset);
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(endOfWeek.getDate() + 7);

    return rentals.filter((rental) => {
      const rentalStartDate = rental?.rental_start_date ? new Date(rental.rental_start_date) : null;
      const matchesDateFocus =
        dateFocusFilter === 'day'
          ? rentalStartDate && rentalStartDate >= startOfToday && rentalStartDate < endOfToday
          : dateFocusFilter === 'week'
            ? rentalStartDate && rentalStartDate >= startOfWeek && rentalStartDate < endOfWeek
            : true;

      if (!matchesDateFocus) {
        return false;
      }

      if (!normalizedSearch) {
        return true;
      }

      const rentalContractId = formatRentalId(rental).toLowerCase();
      const rentalContractSuffix = rentalContractId.split('-').pop() || '';

      return (
        rental.customer_name?.toLowerCase().includes(normalizedSearch) ||
        rental.customer_email?.toLowerCase().includes(normalizedSearch) ||
        rental.vehicle?.name?.toLowerCase().includes(normalizedSearch) ||
        rental.vehicle?.plate_number?.toLowerCase().includes(normalizedSearch) ||
        rental.id?.toString().toLowerCase().includes(normalizedSearch) ||
        rentalContractId.includes(normalizedSearch) ||
        rentalContractSuffix.includes(normalizedSearch)
      );
    });
  }, [rentals, deferredSearchTerm, dateFocusFilter]);

  const formatDate = (dateString) => {
    if (!dateString) return tr('N/A', 'N/D');
    return new Date(dateString).toLocaleDateString();
  };

  const formatVehicleName = (vehicle) => {
    if (!vehicle) return tr('Unknown Vehicle', 'Véhicule inconnu');
    
    const parts = [];
    if (vehicle.name) parts.push(vehicle.name);
    if (vehicle.model) parts.push(vehicle.model);
    
    return parts.length > 0 ? parts.join(' ') : tr('Unknown Vehicle', 'Véhicule inconnu');
  };

  const formatPlateNumber = (plateNumber) => {
    if (!plateNumber) return tr('N/A', 'N/D');
    return plateNumber.toUpperCase();
  };

  const renderFuelProgressBar = (rental, compact = false) => {
    const vehicleKey = String(rental?.vehicle_id || rental?.vehicle?.id || '');
    const fuelState = vehicleFuelStateMap[vehicleKey];
    const tankCapacity = Number(fuelState?.tank_capacity_liters || 0);
    const startFuelLines = Number(rental?.start_fuel_level ?? 0);
    const endFuelLines = Number(rental?.end_fuel_level ?? 0);
    const hasCompletedFuelComparison =
      rental?.rental_status === 'completed' &&
      rental?.start_fuel_level !== null &&
      rental?.start_fuel_level !== undefined &&
      rental?.end_fuel_level !== null &&
      rental?.end_fuel_level !== undefined;

    if (!fuelState && !hasCompletedFuelComparison) return null;

    if (hasCompletedFuelComparison) {
      const safeStartLines = Math.max(0, Math.min(8, startFuelLines));
      const safeEndLines = Math.max(0, Math.min(8, endFuelLines));
      const consumedLines = Math.max(0, safeStartLines - safeEndLines);
      const extraLines = Math.max(0, safeEndLines - safeStartLines);
      const startPercent = Math.max(0, Math.min(100, (safeStartLines / 8) * 100));
      const remainingPercent = Math.max(0, Math.min(100, (safeEndLines / 8) * 100));
      const consumedPercent = Math.max(0, startPercent - remainingPercent);
      const extraPercent = Math.max(0, remainingPercent - startPercent);
      const consumedLiters = tankCapacity > 0 ? roundTo((consumedLines / 8) * tankCapacity, 1) : null;
      const extraLiters = tankCapacity > 0 ? roundTo((extraLines / 8) * tankCapacity, 1) : null;
      const hasExtraFuel = extraLines > 0;
      const hasFuelUsed = consumedLines > 0;

      return (
        <div className={`rounded-lg border border-emerald-100 bg-emerald-50/70 ${compact ? 'px-2.5 py-2' : 'px-3 py-2.5'}`}>
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <span className={`font-semibold uppercase tracking-[0.18em] text-emerald-700 ${compact ? 'text-[9px]' : 'text-[10px]'}`}>
              {tr('Fuel Return', 'Retour carburant')}
            </span>
            <span className={`font-semibold text-slate-800 ${compact ? 'text-[10px]' : 'text-xs'}`}>
              {safeStartLines}/8 → {safeEndLines}/8
              {hasFuelUsed && consumedLiters !== null ? ` · ${consumedLiters}L ${tr('used', 'utilisés')}` : ''}
              {hasExtraFuel && extraLiters !== null ? ` · ${extraLiters}L ${tr('extra', 'en plus')}` : ''}
              {!hasFuelUsed && !hasExtraFuel ? ` · ${tr('same level', 'même niveau')}` : ''}
            </span>
          </div>
          <div className="relative h-2 overflow-hidden rounded-full bg-slate-100">
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-emerald-500 transition-all"
              style={{ width: `${startPercent}%` }}
            />
            {hasFuelUsed ? (
              <div
                className="absolute inset-y-0 rounded-full bg-rose-500/90 transition-all"
                style={{ left: `${remainingPercent}%`, width: `${consumedPercent}%` }}
              />
            ) : null}
            {hasExtraFuel ? (
              <div
                className="absolute inset-y-0 rounded-full bg-sky-500/90 transition-all"
                style={{ left: `${startPercent}%`, width: `${extraPercent}%` }}
              />
            ) : null}
          </div>
        </div>
      );
    }

    const lines = Number(fuelState.current_fuel_lines || 0);
    const liters = Number(fuelState.current_fuel_liters || 0);
    const percentage = Math.max(0, Math.min(100, (lines / 8) * 100));

    return (
      <div className={`rounded-lg border border-emerald-100 bg-emerald-50/70 ${compact ? 'px-2.5 py-2' : 'px-3 py-2.5'}`}>
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <span className={`font-semibold uppercase tracking-[0.18em] text-emerald-700 ${compact ? 'text-[9px]' : 'text-[10px]'}`}>
            {tr('Fuel', 'Carburant')}
          </span>
          <span className={`font-semibold text-emerald-800 ${compact ? 'text-[10px]' : 'text-xs'}`}>
            {lines}/8
            {tankCapacity > 0 ? ` · ${liters.toFixed(1)}/${tankCapacity.toFixed(tankCapacity % 1 === 0 ? 0 : 1)}L` : ` · ${liters.toFixed(1)}L`}
          </span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-emerald-100">
          <div
            className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-lime-400 transition-all"
            style={{ width: `${percentage}%` }}
          />
        </div>
      </div>
    );
  };
  

  
  // === ENHANCED HELPER FUNCTIONS ===

  // 1. Rental Type Badge
  const getRentalTypeBadge = (rentalType) => {
    const isHourly = rentalType === 'hourly';
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-bold ${
        isHourly 
          ? 'bg-purple-100 text-purple-800 border border-purple-300' 
          : 'bg-blue-100 text-blue-800 border border-blue-300'
      }`}>
        {isHourly ? '⏰' : '📅'}
        <span>{isHourly ? 'HOURLY' : 'DAILY'}</span>
      </span>
    );
  };

  // 2. Smart Time Remaining Calculator (already fixed above - this is a duplicate that will be overridden)
  // 4. Duration Badge
  const getDurationBadge = (rental) => {
    const { startDate, endDate } = getEffectiveRentalWindow(rental);

    if (!startDate || Number.isNaN(startDate.getTime()) || !endDate || Number.isNaN(endDate.getTime())) {
      return null;
    }
    
    if (rental.rental_type === 'hourly') {
      const diffMs = Math.max(0, endDate - startDate);
      const diffHours = Math.max(1, Math.round(diffMs / (1000 * 60 * 60)));
      return (
        <span className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 text-gray-800 text-xs font-medium rounded-full border border-gray-300">
          <span className="font-bold">{diffHours}h</span>
          <span>{tr('duration', 'durée')}</span>
        </span>
      );
    }
    
    const diffMs = Math.max(0, endDate - startDate);
    const diffDays = Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
    return (
      <span className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 text-gray-800 text-xs font-medium rounded-full border border-gray-300">
        <span className="font-bold">{diffDays}d</span>
        <span>{tr('rental', 'location')}</span>
      </span>
    );
  };

  const getExtensionBadge = (rental) => {
    const approvedExtensionHours = getApprovedExtensionHours(rental);

    if (approvedExtensionHours <= 0) return null;

    return (
      <span className="inline-flex items-center gap-1 px-2 py-1 bg-violet-50 text-violet-700 text-xs font-medium rounded-full border border-violet-200">
        <span>+</span>
        <span>{approvedExtensionHours}h</span>
      </span>
    );
  };

  const handleFilterChange = (setter, filterName, value) => {
    setter(value);
    if (filterName === 'status') {
      setAvailabilityQuickFilter('all');
    }
    setCurrentPage(1); // Reset to first page when changing filters
    const newParams = new URLSearchParams(location.search);
    if (value === 'all') {
      newParams.delete(filterName);
    } else {
      newParams.set(filterName, value);
    }
    navigate(`${location.pathname}?${newParams.toString()}`, { replace: true });
  };

  const handleAvailabilityCardClick = (key) => {
    const nextQuickFilter = availabilityQuickFilter === key ? 'all' : key;
    setAvailabilityQuickFilter(nextQuickFilter);
    setCurrentPage(1);

    const mappedStatus =
      nextQuickFilter === 'rented'
        ? 'active'
        : nextQuickFilter === 'scheduled'
          ? 'scheduled'
          : 'all';

    setStatusFilter(mappedStatus);

    const newParams = new URLSearchParams(location.search);
    if (mappedStatus === 'all') {
      newParams.delete('status');
    } else {
      newParams.set('status', mappedStatus);
    }
    navigate(`${location.pathname}?${newParams.toString()}`, { replace: true });
  };

  const handleDateFocusToggle = (nextFilter) => {
    setCurrentPage(1);
    setDateFocusFilter((prev) => (prev === nextFilter ? 'all' : nextFilter));
  };

  // Pagination handlers
  const handlePageChange = (newPage) => {
    if (newPage >= 1 && newPage <= totalPages) {
      setCurrentPage(newPage);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleItemsPerPageChange = (e) => {
    const newLimit = Number(e.target.value);
    setItemsPerPage(newLimit);
    setCurrentPage(1);
  };

  // Calculate page numbers to display
  const getPageNumbers = () => {
    const delta = 2;
    const range = [];
    const rangeWithDots = [];
    let l;

    for (let i = 1; i <= totalPages; i++) {
      if (i === 1 || i === totalPages || (i >= currentPage - delta && i <= currentPage + delta)) {
        range.push(i);
      }
    }

    range.forEach((i) => {
      if (l) {
        if (i - l === 2) {
          rangeWithDots.push(l + 1);
        } else if (i - l !== 1) {
          rangeWithDots.push('...');
        }
      }
      rangeWithDots.push(i);
      l = i;
    });

    return rangeWithDots;
  };


  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <AdminModuleHero
          className="w-full"
          icon={<ClipboardList className="h-8 w-8 text-white" />}
          eyebrow={isFrench ? 'Gestion des locations' : 'Rental Management'}
          title={isFrench ? 'Gestion des locations' : 'Rental Management'}
          description={isFrench ? 'Créez, suivez et gérez les locations actives, planifiées et terminées depuis un seul espace.' : 'Create, track, and manage active, scheduled, and completed rentals from one workspace.'}
          actions={
            <button
              onClick={() => setShowStepperForm(true)}
              className="hidden sm:flex items-center gap-2 rounded-lg border border-white/20 bg-white/10 px-4 py-2 text-white backdrop-blur-sm transition-all duration-200 hover:border-white/30 hover:bg-white/20"
            >
              <Plus className="w-5 h-5" />
              <span>{isFrench ? 'Créer une location' : 'Create New Rental'}</span>
            </button>
          }
        />
        <div className="max-w-7xl mx-auto p-6">
          <div className="rounded-2xl border border-violet-100 bg-white p-8 shadow-[0_18px_45px_rgba(76,29,149,0.08)]">
            <div className="flex flex-col items-center justify-center text-center">
              <div className="mb-4 text-4xl animate-spin">⏳</div>
              <p className="text-base font-medium text-slate-700">{isFrench ? 'Chargement des locations...' : 'Loading rentals...'}</p>
              {totalCount > 0 ? (
                <p className="mt-2 text-sm text-slate-500">
                  {isFrench ? `Résultat : ${totalCount} locations • Page ${currentPage} sur ${totalPages}` : `Found ${totalCount} rentals • Page ${currentPage} of ${totalPages}`}
                </p>
              ) : (
                <p className="mt-2 text-sm text-slate-500">{isFrench ? 'Préparation de la vue locations...' : 'Preparing the rentals workspace...'}</p>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="text-4xl mb-4">❌</div>
          <p className="text-red-600 mb-4">{isFrench ? `Erreur : ${error}` : `Error: ${error}`}</p>
          <button 
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            {isFrench ? 'Réessayer' : 'Retry'}
          </button>
        </div>
      </div>
    );
  }

  if (showForm) {
    return (
      <div className="min-h-screen bg-gray-50 py-8">
        <EnhancedStepperRentalForm
          onSuccess={handleRentalSuccess}
          onCancel={() => {
            setShowForm(false);
            setEditingRental(null);
            setWizardInitialStep(1);
            setWizardCustomerScanNote('');
            setWizardRequiresCustomerVerification(false);
          }}
          initialData={editingRental}
          mode={editingRental ? 'edit' : 'create'}
          initialStep={wizardInitialStep}
          initialCustomerScanNote={wizardCustomerScanNote}
          requiresCustomerVerification={wizardRequiresCustomerVerification}
        />
      </div>
    );
  }

  if (showStepperForm) {
    return (
      <div className="min-h-screen bg-gray-50 py-8">
        <EnhancedStepperRentalForm
          mode={editingRental ? "edit" : "create"}
          onSuccess={handleRentalSuccess}
          onCancel={() => {
            setShowStepperForm(false);
            setEditingRental(null);
            setWizardInitialStep(1);
            setWizardCustomerScanNote('');
            setWizardRequiresCustomerVerification(false);
          }}
          initialData={editingRental}
          isLoading={loading}
          initialStep={wizardInitialStep}
          initialCustomerScanNote={wizardCustomerScanNote}
          requiresCustomerVerification={wizardRequiresCustomerVerification}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <AdminModuleHero
        className="w-full"
        icon={<ClipboardList className="h-8 w-8 text-white" />}
        eyebrow={isFrench ? 'Gestion des locations' : 'Rental Management'}
        title={isFrench ? 'Gestion des locations' : 'Rental Management'}
        description={isFrench ? 'Créez, suivez et gérez les locations actives, planifiées et terminées depuis un seul espace.' : 'Create, track, and manage active, scheduled, and completed rentals from one workspace.'}
        actions={
          <button
            onClick={() => setShowStepperForm(true)}
            className="hidden sm:flex items-center gap-2 rounded-lg border border-white/20 bg-white/10 px-4 py-2 text-white backdrop-blur-sm transition-all duration-200 hover:border-white/30 hover:bg-white/20"
          >
            <Plus className="w-5 h-5" />
            <span>{isFrench ? 'Créer une location' : 'Create New Rental'}</span>
          </button>
        }
      />

      <div className="max-w-7xl mx-auto p-6">

        {/* Mobile Floating Action Button */}
        <button
          onClick={() => setShowStepperForm(true)}
          className="sm:hidden fixed bottom-6 right-6 z-50 inline-flex items-center gap-2 rounded-[1.6rem] border border-violet-500/80 bg-gradient-to-r from-violet-600 via-violet-600 to-indigo-700 px-5 py-4 text-white shadow-[0_18px_36px_rgba(79,70,229,0.28)] transition-all duration-200 hover:scale-[1.01] hover:from-violet-700 hover:to-indigo-800 active:scale-[0.99]"
          aria-label={isFrench ? 'Créer une location' : 'Create New Rental'}
        >
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-2xl bg-white/16 ring-1 ring-white/20">
            <Plus className="h-5 w-5" />
          </span>
          <span className="text-sm font-semibold tracking-tight">{isFrench ? 'Créer une location' : 'Create New Rental'}</span>
        </button>

        {vehicleAvailabilitySummary.total > 0 && (
          <div className="mb-6 mt-6">
            <div className="mb-4">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-violet-500">{isFrench ? 'Vue d’ensemble des locations' : 'Rental Overview'}</p>
              <h2 className="mt-2 text-2xl font-bold text-slate-900">{isFrench ? 'Disponibilité des véhicules' : 'Vehicle Availability'}</h2>
            </div>
            <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
              {[
                {
                  key: 'available',
                  label: isFrench ? 'Disponibles à la location' : 'Available for Rent',
                  icon: <CheckCircle className="h-5 w-5 text-emerald-700" />,
                  iconTone: 'bg-emerald-50',
                  badgeTone: 'bg-emerald-50 text-emerald-600',
                  tooltip: 'Vehicles ready for immediate rental'
                },
                {
                  key: 'rented',
                  label: isFrench ? 'Actuellement loués' : 'Currently Rented',
                  icon: <Clock className="h-5 w-5 text-blue-700" />,
                  iconTone: 'bg-blue-50',
                  badgeTone: 'bg-blue-50 text-blue-600',
                  tooltip: 'Vehicles currently on active rentals'
                },
                {
                  key: 'scheduled',
                  label: isFrench ? 'Planifiés' : 'Scheduled',
                  icon: <Calendar className="h-5 w-5 text-amber-700" />,
                  iconTone: 'bg-amber-50',
                  badgeTone: 'bg-amber-50 text-amber-700',
                  tooltip: 'Vehicles with upcoming/scheduled rentals'
                },
                {
                  key: 'maintenance',
                  label: isFrench ? 'En maintenance' : 'Under Maintenance',
                  icon: <XCircle className="h-5 w-5 text-slate-700" />,
                  iconTone: 'bg-slate-100',
                  badgeTone: 'bg-slate-100 text-slate-600',
                  tooltip: 'Vehicles undergoing service/repairs'
                }
              ].map(({ key, label, icon, iconTone, badgeTone, tooltip }) => {
                const count = vehicleAvailabilitySummary[key] || 0;
                const total = Math.max(
                  (vehicleAvailabilitySummary.total || 0) - (vehicleAvailabilitySummary.out_of_service || 0),
                  0
                );
                const percentage = total > 0 ? Math.round((count / total) * 100) : 0;
                const isActive = availabilityQuickFilter === key;

                return (
                  <button
                    type="button"
                    key={key} 
                    onClick={() => handleAvailabilityCardClick(key)}
                    aria-pressed={isActive}
                    className={`group w-full rounded-xl border bg-white p-4 text-left shadow-[0_18px_45px_rgba(76,29,149,0.08)] transition-all hover:-translate-y-0.5 hover:shadow-[0_20px_50px_rgba(76,29,149,0.12)] ${
                      isActive
                        ? 'border-violet-300 ring-2 ring-violet-200/80'
                        : 'border-violet-100 hover:border-violet-200'
                    }`}
                    title={tooltip}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className={`rounded-2xl p-3 ${iconTone}`}>
                        {icon}
                      </div>
                      <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] ${badgeTone}`}>
                        {percentage}%
                      </span>
                    </div>
                    <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">{label}</p>
                    <div className="mt-2 flex items-end justify-between gap-3">
                      <p className="text-3xl font-bold text-slate-900">{count}</p>
                      <p className="text-sm font-medium text-slate-500">{isFrench ? 'véhicules' : 'vehicles'}</p>
                    </div>
                    <div className="mt-3 h-2 rounded-full bg-slate-100 overflow-hidden">
                      <div 
                        className={`h-full transition-all duration-300 ${
                          key === 'available'
                            ? 'bg-emerald-500'
                            : key === 'rented'
                              ? 'bg-blue-500'
                              : key === 'scheduled'
                                ? 'bg-amber-500'
                                : 'bg-slate-500'
                        }`}
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="mb-6 p-1">
          {/* Mobile Search Bar - Always Visible */}
          <div className="flex flex-col gap-4">
            <div className="flex-1">
              <div className="relative">
            <input
              type="text"
              placeholder={isFrench ? 'Rechercher par ID, nom, téléphone, email, plaque...' : 'Search by ID, name, phone, email, plate...'}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full rounded-xl border border-violet-100 bg-white px-4 py-3 text-base text-slate-900 shadow-sm transition-colors placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-xl text-slate-400 hover:text-slate-600"
                title={isFrench ? 'Effacer la recherche' : 'Clear search'}
              >
                ✕
              </button>
            )}
          </div>
            </div>
            
            {/* Mobile Filter Toggle Button */}
            <div className="flex items-center justify-between gap-2">
              <button
                onClick={() => setShowFilters(!showFilters)}
                className="sm:hidden flex items-center gap-2 rounded-xl border border-violet-100 bg-white px-4 py-3 font-medium text-slate-700 shadow-sm transition-colors hover:bg-violet-50"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                </svg>
                <span>{isFrench ? 'Filtres' : 'Filters'}</span>
                <svg className={`w-4 h-4 transition-transform ${showFilters ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              
              {/* View Mode Toggles - Always Visible */}
              <div className="flex items-center gap-1 rounded-2xl border border-violet-100/80 bg-gradient-to-r from-white via-slate-50 to-violet-50/70 p-1 shadow-[0_12px_28px_rgba(76,29,149,0.08)]">
                {isMobileViewport ? (
                  <>
                    <button
                      onClick={() => setViewMode('cards')}
                      className={`inline-flex items-center justify-center rounded-xl px-3 py-2.5 transition-all ${
                        viewMode !== 'grid'
                          ? 'bg-gradient-to-r from-violet-600 to-indigo-700 text-white shadow-[0_12px_26px_rgba(79,70,229,0.24)]'
                          : 'bg-transparent text-slate-600 hover:bg-white hover:text-slate-900'
                      }`}
                      title={isFrench ? 'Grande carte' : 'Large Card View'}
                    >
                      <RectangleHorizontal className="w-5 h-5" />
                    </button>
                    <button
                      onClick={() => setViewMode('grid')}
                      className={`inline-flex items-center justify-center rounded-xl px-3 py-2.5 transition-all ${
                        viewMode === 'grid'
                          ? 'bg-gradient-to-r from-violet-600 to-indigo-700 text-white shadow-[0_12px_26px_rgba(79,70,229,0.24)]'
                          : 'bg-transparent text-slate-600 hover:bg-white hover:text-slate-900'
                      }`}
                      title={isFrench ? 'Vue compacte' : 'Compact Card View'}
                    >
                      <LayoutGrid className="w-5 h-5" />
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => setViewMode('list')}
                      className={`inline-flex items-center justify-center rounded-xl px-3 py-2.5 transition-all ${
                        viewMode === 'list' 
                          ? 'bg-gradient-to-r from-violet-600 to-indigo-700 text-white shadow-[0_12px_26px_rgba(79,70,229,0.24)]' 
                          : 'bg-transparent text-slate-600 hover:bg-white hover:text-slate-900'
                      }`}
                      title={isFrench ? 'Vue liste' : 'List View'}
                    >
                      <List className="w-5 h-5" />
                    </button>
                    <button
                      onClick={() => setViewMode('grid')}
                      className={`inline-flex items-center justify-center rounded-xl px-3 py-2.5 transition-all ${
                        viewMode === 'grid' 
                          ? 'bg-gradient-to-r from-violet-600 to-indigo-700 text-white shadow-[0_12px_26px_rgba(79,70,229,0.24)]' 
                          : 'bg-transparent text-slate-600 hover:bg-white hover:text-slate-900'
                      }`}
                      title={isFrench ? 'Vue grille compacte' : 'Compact Grid View'}
                    >
                      <LayoutGrid className="w-5 h-5" />
                    </button>
                  </>
                )}
              </div>
            </div>
            
            <div className="hidden items-center gap-2 overflow-x-auto pb-1 sm:flex">
              {[
              { key: 'day', label: isFrench ? 'Jour' : 'Day', count: dateFocusCounts.day },
                { key: 'week', label: isFrench ? 'Semaine' : 'Week', count: dateFocusCounts.week },
              ].map(({ key, label, count }) => {
                const active = dateFocusFilter === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => handleDateFocusToggle(key)}
                    className={`shrink-0 inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-all ${
                      active
                        ? 'border-violet-500 bg-violet-600 text-white shadow-[0_10px_20px_rgba(79,70,229,0.18)]'
                        : 'border-violet-100 bg-white text-slate-600 hover:border-violet-200 hover:text-slate-900'
                    }`}
                  >
                    <span>{label}</span>
                    <span className={`inline-flex min-w-[18px] items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none ${
                      active
                        ? 'bg-white/20 text-white'
                        : 'bg-violet-50 text-violet-600'
                    }`}>
                      {count}
                    </span>
                  </button>
                );
              })}
              {dateFocusFilter !== 'all' && (
                <button
                  type="button"
                  onClick={() => setDateFocusFilter('all')}
                  className="shrink-0 px-1 text-xs font-medium text-slate-500 hover:text-slate-700"
                >
                  {isFrench ? 'Effacer' : 'Clear'}
                </button>
              )}
            </div>

            {/* Collapsible Filters Section */}
            <div className={`${showFilters ? 'flex' : 'hidden'} sm:flex flex-col sm:flex-row gap-3 sm:gap-4`}>
              <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:hidden">
                {[
                  { key: 'day', label: isFrench ? 'Jour' : 'Day', count: dateFocusCounts.day },
                  { key: 'week', label: isFrench ? 'Semaine' : 'Week', count: dateFocusCounts.week },
                ].map(({ key, label, count }) => {
                  const active = dateFocusFilter === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => handleDateFocusToggle(key)}
                      className={`shrink-0 inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-all ${
                        active
                          ? 'border-violet-500 bg-violet-600 text-white shadow-[0_10px_20px_rgba(79,70,229,0.18)]'
                          : 'border-violet-100 bg-white text-slate-600 hover:border-violet-200 hover:text-slate-900'
                      }`}
                    >
                      <span>{label}</span>
                      <span className={`inline-flex min-w-[18px] items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none ${
                        active
                          ? 'bg-white/20 text-white'
                          : 'bg-violet-50 text-violet-600'
                      }`}>
                        {count}
                      </span>
                    </button>
                  );
                })}
                {dateFocusFilter !== 'all' && (
                  <button
                    type="button"
                    onClick={() => setDateFocusFilter('all')}
                    className="shrink-0 px-1 text-xs font-medium text-slate-500 hover:text-slate-700"
                  >
                    {isFrench ? 'Effacer' : 'Clear'}
                  </button>
                )}
              </div>
              <div className="flex-1">
                <select
                  value={statusFilter}
                  onChange={(e) => handleFilterChange(setStatusFilter, 'status', e.target.value)}
                  className="w-full rounded-xl border border-violet-100 bg-white px-4 py-3 text-base text-slate-900 shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-violet-500"
                >
	                <option value="all">{isFrench ? 'Tous les statuts' : 'All Status'}</option>
	                <option value="scheduled">{isFrench ? 'Planifié' : 'Scheduled'}</option>
	                <option value="active">{isFrench ? 'Actif' : 'Active'}</option>
	                <option value="impounded">{isFrench ? 'Mis en fourrière' : 'Impounded'}</option>
	                <option value="completed">{isFrench ? 'Terminé' : 'Completed'}</option>
	                <option value="cancelled">{isFrench ? 'Annulé' : 'Cancelled'}</option>
	                <option value="expired">{isFrench ? 'Expiré' : 'Expired'}</option>
              </select>
              </div>
              <div className="flex-1">
                <select
                  value={paymentStatusFilter}
                  onChange={(e) => handleFilterChange(setPaymentStatusFilter, 'paymentStatus', e.target.value)}
                  className="w-full rounded-xl border border-violet-100 bg-white px-4 py-3 text-base text-slate-900 shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-violet-500"
                >
                <option value="all">{isFrench ? 'Tous les paiements' : 'All Payment Statuses'}</option>
                <option value="unpaid">{isFrench ? 'Impayé' : 'Unpaid'}</option>
                <option value="partial">{isFrench ? 'Partiel' : 'Partial'}</option>
                <option value="paid">{isFrench ? 'Payé' : 'Paid'}</option>
                <option value="overdue">{isFrench ? 'En retard' : 'Overdue'}</option>
                </select>
              </div>
          </div>
        </div>

        {!isMobileViewport && viewMode === 'list' ? (
          // LIST VIEW (Original Table)
          <div className="overflow-hidden rounded-xl border border-violet-100 bg-white shadow-[0_18px_45px_rgba(76,29,149,0.08)]">
            {filteredRentals.length === 0 ? (
              <div className="text-center py-12">
                <div className="text-4xl mb-4">📝</div>
                <p className="text-gray-600 mb-2">
                  {rentals.length === 0
                    ? (isFrench ? 'Aucune location trouvée' : 'No rentals found')
                    : (isFrench ? 'Aucune location ne correspond à vos filtres' : 'No rentals match your filters')}
                </p>
                {(searchTerm || statusFilter !== 'all' || paymentStatusFilter !== 'all' || dateFocusFilter !== 'all') && (
                  <button
                    onClick={() => {
                      setSearchTerm('');
                      setStatusFilter('all');
                      setPaymentStatusFilter('all');
                      setDateFocusFilter('all');
                      setCurrentPage(1);
                      navigate('/admin/rentals', { replace: true });
                    }}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 mb-2"
                  >
                    {isFrench ? 'Effacer les filtres' : 'Clear Filters'}
                  </button>
                )}
                {rentals.length === 0 && !searchTerm && statusFilter === 'all' && paymentStatusFilter === 'all' && dateFocusFilter === 'all' && (
                  <button
                    onClick={() => setShowStepperForm(true)}
                    className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                  >
                    {isFrench ? 'Créer la première location' : 'Create First Rental'}
                  </button>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        {isFrench ? 'ID location' : 'Rental ID'}
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        {isFrench ? 'Client' : 'Customer'}
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        {isFrench ? 'Véhicule' : 'Vehicle'}
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        {isFrench ? 'Plaque' : 'Plate Number'}
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        {isFrench ? 'Période de location' : 'Rental Period'}
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        {isFrench ? 'Statut' : 'Status'}
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        {isFrench ? 'Statut de paiement' : 'Payment Status'}
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        {isFrench ? 'Montant' : 'Amount'}
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        {isFrench ? 'Actions' : 'Actions'}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {filteredRentals.map((rental) => {
                      const effectiveRentalStatus = getEffectiveRentalStatus(rental);
                      const canStartContract = isPaymentSufficientForStart(rental);
                      const isImmutable = effectiveRentalStatus === 'active' || effectiveRentalStatus === 'completed';
                      const rentalAttention = getRentalAttentionState(rental);
                      
                      return (
                        <tr 
                          key={rental.id} 
                          className={`cursor-pointer transition-colors ${
                          effectiveRentalStatus === 'active' ? 'bg-green-50 hover:bg-green-100' :
                          effectiveRentalStatus === 'impounded' ? 'bg-amber-50 hover:bg-amber-100' :
                          effectiveRentalStatus === 'scheduled' ? 'bg-blue-50 hover:bg-blue-100' :
                          effectiveRentalStatus === 'completed' ? 'bg-gray-50 hover:bg-gray-100' :
                          effectiveRentalStatus === 'cancelled' ? 'bg-red-50 hover:bg-red-100' :
                          effectiveRentalStatus === 'expired' ? 'bg-yellow-50 hover:bg-yellow-100' :
                          'bg-yellow-50 hover:bg-yellow-100'
                        }`}
                          onClick={() => handleViewRental(rental)}
                        >
                          <td className="px-6 py-4 whitespace-nowrap">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleViewRental(rental);
                              }}
                              className="text-blue-600 hover:text-blue-900 hover:underline font-mono font-medium"
                              title={isFrench ? 'Ouvrir les détails de la location' : 'Click to view rental details'}
                            >
                              {formatRentalId(rental)}
                            </button>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div>
                              <div className="text-sm font-medium text-gray-900">
                                {rental.customer_name}
                              </div>
                              <div className="text-sm text-gray-500">
                                {rental.customer_email}
                              </div>
                              {getBookingSourceBadge(rental) && (
                                <div className="mt-2">
                                  {getBookingSourceBadge(rental)}
                                </div>
                              )}
                              <div className="mt-1">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleViewCustomerDetails(rental);
                                  }}
                                  className="text-xs text-blue-600 hover:text-blue-900 hover:underline font-medium"
                                  title={tr('View customer details', 'Voir les détails du client')}
                                >
                                  {tr('View Customer Details', 'Voir les détails du client')}
                                </button>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="inline-flex items-center rounded-lg border border-slate-300 bg-white px-2.5 py-1 shadow-sm">
                              <span className="font-mono text-sm font-extrabold tracking-wide text-slate-900">
                                {formatPlateNumber(rental.vehicle?.plate_number)}
                              </span>
                            </div>
                            <div className="mt-2 text-sm font-medium text-gray-900">
                              {formatVehicleName(rental.vehicle)}
                            </div>
                            <div className="text-xs uppercase tracking-wide text-gray-500">
                              {rental.vehicle?.vehicle_type || 'Vehicle'}
                            </div>
                            <div className="flex items-center gap-2 mt-1">
                              {getRentalTypeBadge(rental.rental_type)}
                              {getDurationBadge(rental)}
                              {getExtensionBadge(rental)}
                            </div>
                            <div className="text-sm text-gray-500">
                              ID: {rental.vehicle_id}
                            </div>
                            <div className="mt-2 max-w-[240px]">
                              {renderFuelProgressBar(rental)}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm font-mono font-bold tracking-wide text-slate-900 bg-slate-100 border border-slate-200 px-2.5 py-1.5 rounded-lg inline-block">
                              {formatPlateNumber(rental.vehicle?.plate_number)}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="text-sm text-gray-900">
                              {formatSmartDate(rental, false)}
                            </div>
                            <RentalTimeIndicator rental={rental} attention={rentalAttention} />
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex flex-col gap-1">
                              {getStatusBadge(effectiveRentalStatus)}
                              {rental?.is_impounded && effectiveRentalStatus !== 'impounded' && (
                                <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap bg-amber-100 text-amber-800">
                                  🚨 Impounded
                                </span>
                              )}
                              {rentalAttention && (
                                <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${rentalAttention.className}`}>
                                  {rentalAttention.text}
                                </span>
                              )}
                              {rental.rental_status === 'completed' && rental.damage_deposit > 0 && !rental.deposit_returned_at && (
                                <span className="inline-flex items-center gap-1 text-xs bg-orange-100 text-orange-700 border border-orange-200 px-2 py-0.5 rounded-full font-medium whitespace-nowrap">
                                  🔒 Deposit Pending
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            {(() => {
                              const paymentSnapshot = getRentalFinancialSnapshot(rental);
                              return (
                                <span className={paymentSnapshot.className}>
                                  {paymentSnapshot.status}
                                </span>
                              );
                            })()}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
  <div className="flex items-center gap-2">
    {(() => {
      const paymentSnapshot = getRentalFinancialSnapshot(rental);
      return rental.pending_total_request ? (
        <>
          <span className="text-yellow-600 font-semibold">{rental.pending_total_request} MAD</span>
          <span className="text-xs text-gray-400 line-through">{paymentSnapshot.grandTotal.toFixed(0)} MAD</span>
        </>
      ) : (
        <span>{paymentSnapshot.grandTotal.toFixed(0)} MAD</span>
      );
    })()}
    
    {/* Only show pending badge, remove approved/declined badges from here */}
    {rental.approval_status === 'pending' && rental.pending_total_request && (
      <span 
        className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full bg-yellow-50 text-yellow-700 border border-yellow-300"
        title={`Pending approval for ${rental.pending_total_request} MAD`}
      >
        <Clock className="w-3 h-3" />
        Pending
      </span>
    )}
  </div>
</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                            <div className="flex space-x-2">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleViewRental(rental);
                                }}
                                className="text-indigo-600 hover:text-indigo-900"
                                title="View rental details"
                              >
                                View
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEditingRental(rental);
                                  setShowStepperForm(true);
                                }}
                                className={`text-blue-600 hover:text-blue-900 ${isImmutable || !canEditRentalContract(user) ? 'text-gray-400 cursor-not-allowed opacity-50' : ''}`}
                                title={
                                  !canEditRentalContract(user)
                                    ? "No permission to edit contract"
                                    : isImmutable
                                      ? "Cannot edit active or completed rentals"
                                      : "Edit rental"
                                }
                                disabled={isImmutable || !canEditRentalContract(user)}
                              >
                                Edit
                              </button>
                              
                              {/* Admin Approval Button for Pending Price Overrides */}
{rental.rental_status === 'scheduled' && rental.approval_status === 'pending' && rental.pending_total_request && user?.role === 'owner' && (
  <div className="flex gap-1">
    <button
      onClick={async (e) => {
        e.stopPropagation();
        if (confirm(`Approve manual price of ${rental.pending_total_request} MAD for this rental?`)) {
          try {
            const newPrice = parseFloat(rental.pending_total_request);
            
            const { error: updateError } = await supabase
              .from('app_4c3a7a6153_rentals')
              .update({
                total_amount: newPrice,
                remaining_amount: Math.max(0, newPrice - (parseFloat(rental.deposit_amount) || 0)),
                approval_status: 'approved',
                pending_total_request: null,
                updated_at: new Date().toISOString()
              })
              .eq('id', rental.id);

            if (updateError) throw updateError;
            
            alert(`✅ Price override approved! New total: ${newPrice} MAD`);
            fetchRentals(statusFilter, paymentStatusFilter);
            
          } catch (err) {
            console.error('❌ Error approving price:', err);
            alert(`Failed to approve price: ${err.message}`);
          }
        }
      }}
      className="px-2 py-1 text-xs font-medium border rounded-md transition-colors text-green-600 hover:text-white hover:bg-green-600 border-green-600 bg-green-50"
      title="Approve pending price override"
    >
      ✓ {rental.pending_total_request} MAD
    </button>
    <button
      onClick={async (e) => {
        e.stopPropagation();
        if (confirm(`Decline price override of ${rental.pending_total_request} MAD?`)) {
          try {
            const autoCalculatedPrice = await recalculateAutoRentalPrice(rental);

            const { error: updateError } = await supabase
              .from('app_4c3a7a6153_rentals')
              .update({
                total_amount: autoCalculatedPrice,
                remaining_amount: Math.max(0, autoCalculatedPrice - (parseFloat(rental.deposit_amount) || 0)),
                approval_status: 'declined',
                pending_total_request: null,
                updated_at: new Date().toISOString()
              })
              .eq('id', rental.id);

            if (updateError) throw updateError;
            
            alert(`❌ Price override declined.`);
            fetchRentals(statusFilter, paymentStatusFilter);
            
          } catch (err) {
            console.error('❌ Error declining price:', err);
            alert(`Failed to decline price: ${err.message}`);
          }
        }
      }}
      className="px-2 py-1 text-xs font-medium border rounded-md transition-colors text-red-600 hover:text-white hover:bg-red-600 border-red-600 bg-red-50"
      title="Decline pending price override"
    >
      ✗ Decline
    </button>
  </div>
)}

{/* Regular Start Button for non-pending rentals */}
{effectiveRentalStatus === 'scheduled' && !rental.pending_total_request && canStartFromList(rental) && (
  <button
    onClick={(e) => {
      e.stopPropagation();
      handleStartRentalFromList(rental);
    }}
    className="text-green-600 hover:text-green-900 cursor-pointer"
    title="Click to start rental and activate timer"
  >
    Start
  </button>
)}
{effectiveRentalStatus === 'scheduled' && (
  <button
    onClick={(e) => handleSendReminder(rental, e)}
    className="inline-flex items-center gap-1 text-emerald-600 hover:text-emerald-900"
    title={tr('Send WhatsApp reminder', 'Envoyer un rappel WhatsApp')}
  >
    <MessageCircle className="h-4 w-4" />
    <span>{tr('Reminder', 'Rappel')}</span>
  </button>
)}
{effectiveRentalStatus === 'scheduled' && !rental.pending_total_request && !canStartFromList(rental) && (
  <button
    onClick={(e) => {
      e.stopPropagation();
      navigate(`/admin/rentals/${rental.id}`);
    }}
    className="text-gray-400 cursor-not-allowed opacity-50"
    title={`Complete requirements: ${[
      rental.payment_status !== 'paid' ? 'Payment' : '',
      (!rental.signature_url && !rental.contract_signed) ? 'Contract signature' : '',
      !rental.opening_video_url ? 'Opening video' : '',
      !rental.start_odometer ? 'Odometer reading' : '',
      (rental.rental_type === 'daily' && rental.start_fuel_level === null) ? 'Fuel level' : ''
    ].filter(Boolean).join(', ')}`}
    disabled
  >
    Start
  </button>
)}
                              
                              {effectiveRentalStatus === 'active' && (
                    <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  navigate(`/admin/rentals/${rental.id}`);
                                }}
                                className="px-3 py-1.5 text-xs font-medium text-orange-600 hover:text-white hover:bg-orange-600 border border-orange-600 rounded-md transition-colors"
                                title="Go to rental details to close"
                              >
                                Close
                              </button>
                  )}
                              
                              {canDelete() && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeleteRental(rental.id);
                                  }}
                                  className={`text-red-600 hover:text-red-900 ${isImmutable ? 'text-gray-400 cursor-not-allowed opacity-50' : ''}`}
                                  title={isImmutable ? "Cannot delete active or completed rentals" : "Delete rental"}
                                  disabled={isImmutable}
                                >
                                  Delete
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : (
          // COMPACT GRID VIEW - New professional mobile-optimized view
          <div className="overflow-hidden">
            {filteredRentals.length === 0 ? (
              <div className="text-center py-12">
                <div className="text-4xl mb-4">📝</div>
                <p className="text-gray-600 mb-2">
                  {rentals.length === 0 ? 'No rentals found' : 'No rentals match your filters'}
                </p>
                {(searchTerm || statusFilter !== 'all' || paymentStatusFilter !== 'all' || dateFocusFilter !== 'all') && (
                  <button
                    onClick={() => {
                      setSearchTerm('');
                      setStatusFilter('all');
                      setPaymentStatusFilter('all');
                      setDateFocusFilter('all');
                      setCurrentPage(1);
                      navigate('/admin/rentals', { replace: true });
                    }}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 mb-2"
                  >
                    {tr('Clear Filters', 'Effacer les filtres')}
                  </button>
                )}
                {rentals.length === 0 && !searchTerm && statusFilter === 'all' && paymentStatusFilter === 'all' && dateFocusFilter === 'all' && (
                  <button
                    onClick={() => setShowStepperForm(true)}
                    className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                  >
                    {tr('Create First Rental', 'Créer la première location')}
                  </button>
                )}
              </div>
            ) : (
              <div className={`grid gap-4 p-4 ${
                isMobileViewport && viewMode === 'grid'
                  ? 'grid-cols-2'
                  : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'
              }`}>
                {filteredRentals.map((rental) => {
                  const effectiveRentalStatus = getEffectiveRentalStatus(rental);
                  const canStartContract = isPaymentSufficientForStart(rental);
                  const isImmutable = effectiveRentalStatus === 'active' || effectiveRentalStatus === 'completed';
                  const rentalAttention = getRentalAttentionState(rental);
                  const isCompactMobileCard = isMobileViewport && viewMode === 'grid';
                  const paymentSnapshot = getRentalFinancialSnapshot(rental);
                  const paymentLabel = {
                    PAID: tr('PAID', 'PAYÉE'),
                    PARTIAL: tr('PARTIAL', 'PARTIEL'),
                    UNPAID: tr('UNPAID', 'IMPAYÉE'),
                  }[paymentSnapshot.status] || paymentSnapshot.status;
                  
                  return (
                    <div 
                      key={rental.id} 
                      className="cursor-pointer"
                      onClick={() => handleViewRental(rental)}
                    >
                      <div className={`${isCompactMobileCard ? 'min-h-[238px] rounded-[1.35rem] p-3' : 'min-h-[250px] rounded-xl p-3.5'} flex flex-col border bg-white transition-all hover:-translate-y-0.5 ${
                          effectiveRentalStatus === 'active'
                            ? 'border-emerald-200 shadow-[0_18px_45px_rgba(16,185,129,0.12)] hover:border-emerald-300 hover:shadow-[0_20px_50px_rgba(16,185,129,0.16)]'
                            : effectiveRentalStatus === 'impounded'
                              ? 'border-amber-200 shadow-[0_18px_45px_rgba(245,158,11,0.12)] hover:border-amber-300 hover:shadow-[0_20px_50px_rgba(245,158,11,0.16)]'
                            : effectiveRentalStatus === 'scheduled'
                              ? 'border-blue-200 shadow-[0_18px_45px_rgba(59,130,246,0.12)] hover:border-blue-300 hover:shadow-[0_20px_50px_rgba(59,130,246,0.16)]'
                              : effectiveRentalStatus === 'completed'
                                ? 'border-slate-200 shadow-[0_18px_45px_rgba(100,116,139,0.10)] hover:border-slate-300 hover:shadow-[0_20px_50px_rgba(100,116,139,0.14)]'
                                : effectiveRentalStatus === 'cancelled'
                                  ? 'border-rose-200 shadow-[0_18px_45px_rgba(244,63,94,0.10)] hover:border-rose-300 hover:shadow-[0_20px_50px_rgba(244,63,94,0.14)]'
                                  : effectiveRentalStatus === 'expired'
                                    ? 'border-amber-200 shadow-[0_18px_45px_rgba(245,158,11,0.10)] hover:border-amber-300 hover:shadow-[0_20px_50px_rgba(245,158,11,0.14)]'
                                  : 'border-amber-200 shadow-[0_18px_45px_rgba(245,158,11,0.10)] hover:border-amber-300 hover:shadow-[0_20px_50px_rgba(245,158,11,0.14)]'
                        }`}>
                        {/* Compact Header */}
                        <div className={`mb-${isCompactMobileCard ? '2' : '2.5'} flex items-start justify-between gap-2 border-b pb-${isCompactMobileCard ? '2' : '2.5'} ${
                          effectiveRentalStatus === 'active' ? 'border-emerald-100' :
                          effectiveRentalStatus === 'impounded' ? 'border-amber-100' :
                          effectiveRentalStatus === 'scheduled' ? 'border-blue-100' :
                          effectiveRentalStatus === 'completed' ? 'border-slate-100' :
                          effectiveRentalStatus === 'cancelled' ? 'border-rose-100' :
                          effectiveRentalStatus === 'expired' ? 'border-amber-100' :
                          'border-amber-100'
                        }`}>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleViewRental(rental);
                            }}
                            className={`min-w-0 flex-1 text-left font-mono font-bold text-violet-600 transition-colors hover:text-violet-800 ${isCompactMobileCard ? 'text-[11px] leading-tight' : 'text-xs break-all'}`}
                            title={formatRentalId(rental)}
                          >
                            {formatRentalId(rental)}
                          </button>
                          <div className="ml-auto flex shrink-0 flex-col items-end gap-1">
                            {getStatusBadge(effectiveRentalStatus)}
                            {rental?.is_impounded && effectiveRentalStatus !== 'impounded' && (
                              <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium bg-amber-100 text-amber-800">
                                🚨 {tr('Impounded', 'Mis en fourrière')}
                              </span>
                            )}
                            {rentalAttention && (
                              <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${rentalAttention.className}`}>
                                {rentalAttention.text}
                              </span>
                            )}
                            {rental.rental_status === 'completed' && rental.damage_deposit > 0 && !rental.deposit_returned_at && (
                              <span className="inline-flex items-center gap-1 text-xs bg-orange-100 text-orange-700 border border-orange-200 px-2 py-0.5 rounded-full font-medium">
                                🔒 {tr('Deposit Pending', 'Caution en attente')}
                              </span>
                            )}
                          </div>
                        </div>
                        
                        {/* Rental Type and Duration Badges */}
                        <div className={`mb-${isCompactMobileCard ? '2' : '2.5'} flex flex-wrap items-center gap-1.5`}>
                          {getRentalTypeBadge(rental.rental_type)}
                          {getDurationBadge(rental)}
                          {getExtensionBadge(rental)}
                          {getBookingSourceBadge(rental)}
                        </div>

                        {/* Compact Info Grid */}
                        <div className={`${isCompactMobileCard ? 'space-y-1.5' : 'space-y-2'} text-xs`}>
                          {/* Customer */}
                          <div className="flex items-start gap-2">
                            <span className={`text-gray-500 font-semibold ${isCompactMobileCard ? 'min-w-[14px] text-[11px]' : 'min-w-[50px]'}`}>👤</span>
                            <div className="flex-1 min-w-0">
                              <div className={`${isCompactMobileCard ? 'line-clamp-2 text-[12px] leading-4' : 'truncate text-sm'} font-semibold text-slate-900`}>{rental.customer_name}</div>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleViewCustomerDetails(rental);
                                }}
                                className={`${isCompactMobileCard ? 'text-[9px]' : 'text-[10px]'} font-medium text-violet-600 underline hover:text-violet-800`}
                              >
                                {tr('Details', 'Détails')}
                              </button>
                            </div>
                          </div>

                          {/* Vehicle & Plate */}
                          <div className="flex items-start gap-2">
                            <span className={`text-gray-500 font-semibold ${isCompactMobileCard ? 'min-w-[14px] text-[11px]' : 'min-w-[50px]'}`}>🚗</span>
                            <div className="flex-1 min-w-0">
                              <div className={`inline-flex items-center rounded-lg border border-slate-200 bg-slate-50 shadow-sm ${isCompactMobileCard ? 'px-2 py-0.5' : 'px-2.5 py-1'}`}>
                                <span className={`font-mono font-extrabold tracking-wide text-slate-900 ${isCompactMobileCard ? 'text-[12px]' : 'text-sm'}`}>
                                  {formatPlateNumber(rental.vehicle?.plate_number)}
                                </span>
                              </div>
                              <div className={`mt-1 ${isCompactMobileCard ? 'line-clamp-2 text-[12px] leading-4' : 'truncate text-sm'} font-semibold text-slate-900`}>{formatVehicleName(rental.vehicle)}</div>
                              <div className="mt-1 flex flex-wrap items-center gap-2">
                                <span className={`inline-flex items-center rounded-full bg-slate-100 font-semibold uppercase tracking-[0.14em] text-slate-700 ${isCompactMobileCard ? 'px-1.5 py-0.5 text-[9px]' : 'px-2 py-0.5 text-[10px]'}`}>
                                  {rental.vehicle?.model || tr('N/A', 'N/D')}
                                </span>
                                <span className={`${isCompactMobileCard ? 'text-[9px]' : 'text-[10px]'} uppercase tracking-[0.18em] text-slate-500`}>
                                  {rental.vehicle?.vehicle_type || tr('Vehicle', 'Véhicule')}
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* Dates */}
                          <div className="flex items-start gap-2">
                            <span className={`text-gray-500 font-semibold ${isCompactMobileCard ? 'min-w-[14px] text-[11px]' : 'min-w-[50px]'}`}>📅</span>
                            <div className="flex-1 min-w-0">
                              <div className={`${isCompactMobileCard ? 'text-[11px] leading-4' : 'text-xs'} font-medium text-slate-900`}>
                                {formatSmartDate(rental, true)}
                              </div>
                              <RentalTimeIndicator rental={rental} compact attention={rentalAttention} />
                            </div>
                          </div>

                          {renderFuelProgressBar(rental, true)}

                          {/* Payment Info */}
<div className={`flex items-center justify-between gap-2 ${isCompactMobileCard ? 'pt-2' : 'pt-2.5'}`}>
  <div className="flex items-center gap-1">
    <span className={`${paymentSnapshot.className} ${isCompactMobileCard ? 'text-[10px]' : ''}`}>
      {paymentLabel}
    </span>
  </div>
  <div className={`${isCompactMobileCard ? 'text-[11px]' : 'text-xs'} font-bold text-slate-900 whitespace-nowrap`}>
    {rental.pending_total_request ? (
        <div className="flex items-center gap-1">
          <span className="text-yellow-600">{rental.pending_total_request} MAD</span>
          <span className="text-[8px] text-gray-400 line-through">{paymentSnapshot.grandTotal.toFixed(0)} MAD</span>
        </div>
      ) : (
        <span>{paymentSnapshot.grandTotal.toFixed(0)} MAD</span>
      )}
  </div>
</div>

{/* Only show pending badge here, remove approved/declined badges */}
{rental.approval_status === 'pending' && rental.pending_total_request && (
  <div className="flex items-center gap-1 rounded-md border border-amber-100 bg-amber-50 px-2 py-1 text-[10px] text-amber-700">
    <Clock className="w-3 h-3" />
    <span>{tr('Pending approval for', 'En attente de validation pour')} {rental.pending_total_request} MAD</span>
  </div>
)}

{/* Approved and declined badges removed from here - they are now shown in actions */}
                        </div>

                        {/* Compact Actions */}
                        {!isCompactMobileCard && (
                        <div className="flex flex-wrap gap-2 mt-auto pt-2.5">
                          
                          {/* Admin Approval Button for Pending Price Overrides */}
{effectiveRentalStatus === 'scheduled' && rental.approval_status === 'pending' && rental.pending_total_request && user?.role === 'owner' && (
  <div className="flex gap-1 w-full">
    <button
      onClick={async (e) => {
        e.stopPropagation();
        if (confirm(`${tr('Approve manual price of', 'Approuver le prix manuel de')} ${rental.pending_total_request} MAD ${tr('for this rental?', 'pour cette location ?')}`)) {
          try {
            const newPrice = parseFloat(rental.pending_total_request);
            
            const { error: updateError } = await supabase
              .from('app_4c3a7a6153_rentals')
              .update({
                total_amount: newPrice,
                remaining_amount: Math.max(0, newPrice - (parseFloat(rental.deposit_amount) || 0)),
                approval_status: 'approved',
                pending_total_request: null,
                updated_at: new Date().toISOString()
              })
              .eq('id', rental.id);

            if (updateError) throw updateError;
            
            alert(`✅ ${tr('Price override approved! New total:', 'Modification de prix approuvée ! Nouveau total :')} ${newPrice} MAD`);
            fetchRentals(statusFilter, paymentStatusFilter);
            
          } catch (err) {
            console.error('❌ Error approving price:', err);
            alert(`${tr('Failed to approve price:', "Échec de l'approbation du prix :")} ${err.message}`);
          }
        }
      }}
      className="flex-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-[10px] font-semibold text-emerald-700 transition-colors hover:bg-emerald-100"
      title={tr('Approve pending price override', 'Approuver la modification de prix en attente')}
    >
      ✓ {rental.pending_total_request} MAD
    </button>
    <button
      onClick={async (e) => {
        e.stopPropagation();
        if (confirm(`${tr('Decline price override of', 'Refuser la modification de prix de')} ${rental.pending_total_request} MAD ?`)) {
          try {
            const autoCalculatedPrice = await recalculateAutoRentalPrice(rental);

            const { error: updateError } = await supabase
              .from('app_4c3a7a6153_rentals')
              .update({
                total_amount: autoCalculatedPrice,
                remaining_amount: Math.max(0, autoCalculatedPrice - (parseFloat(rental.deposit_amount) || 0)),
                approval_status: 'declined',
                pending_total_request: null,
                updated_at: new Date().toISOString()
              })
              .eq('id', rental.id);

            if (updateError) throw updateError;
            
            alert(`❌ ${tr('Price override declined.', 'Modification de prix refusée.')}`);
            fetchRentals(statusFilter, paymentStatusFilter);
            
          } catch (err) {
            console.error('❌ Error declining price:', err);
            alert(`${tr('Failed to decline price:', 'Échec du refus du prix :')} ${err.message}`);
          }
        }
      }}
      className="flex-1 rounded-md border border-rose-200 bg-rose-50 px-2 py-1 text-[10px] font-semibold text-rose-700 transition-colors hover:bg-rose-100"
      title={tr('Decline pending price override', 'Refuser la modification de prix en attente')}
    >
      ✗ {tr('Decline', 'Refuser')}
    </button>
  </div>
)}

{/* Show approved/declined badges for non-pending rentals */}
{effectiveRentalStatus === 'scheduled' && rental.approval_status === 'approved' && (
  <div className="flex w-full items-center justify-center gap-1 rounded-md border border-emerald-100 bg-emerald-50 px-2 py-1 text-[10px] text-emerald-700">
    <CheckCircle className="w-3 h-3" />
    <span>{tr('Approved', 'Approuvée')}</span>
  </div>
)}

{effectiveRentalStatus === 'scheduled' && rental.approval_status === 'declined' && (
  <div className="flex w-full items-center justify-center gap-1 rounded-md border border-rose-100 bg-rose-50 px-2 py-1 text-[10px] text-rose-700">
    <XCircle className="w-3 h-3" />
    <span>{tr('Declined', 'Refusée')}</span>
  </div>
)}

{/* Regular Start Button for non-pending rentals */}
{effectiveRentalStatus === 'scheduled' && !rental.pending_total_request && !rental.approval_status && (
  <button
    onClick={(e) => {
      e.stopPropagation();
      if (canStartFromList(rental)) {
        handleStartRentalFromList(rental);
      } else {
        navigate(`/admin/rentals/${rental.id}`);
      }
    }}
    className={`px-3 py-1.5 text-xs font-medium border rounded-md transition-colors ${
      canStartFromList(rental)
        ? 'text-green-600 hover:text-white hover:bg-green-600 border-green-600'
        : 'text-gray-400 border-gray-300 cursor-not-allowed'
    }`}
    title={
      canStartFromList(rental)
        ? tr('Click to start rental', 'Cliquer pour démarrer la location')
        : tr('Complete all requirements first', "Complétez d'abord toutes les exigences")
    }
  >
    {tr('Start', 'Démarrer')}
  </button>
)}
{effectiveRentalStatus === 'scheduled' && (
  <button
    onClick={(e) => handleSendReminder(rental, e)}
    className="inline-flex items-center justify-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 transition-colors hover:bg-emerald-100"
    title={tr('Send WhatsApp reminder', 'Envoyer un rappel WhatsApp')}
  >
    <MessageCircle className="w-3.5 h-3.5" />
    <span>{tr('WhatsApp Reminder', 'Rappel WhatsApp')}</span>
  </button>
)}
                          
                          {effectiveRentalStatus === 'active' && (
                    <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  navigate(`/admin/rentals/${rental.id}`);
                                }}
                                className="px-3 py-1.5 text-xs font-medium text-orange-600 hover:text-white hover:bg-orange-600 border border-orange-600 rounded-md transition-colors"
                                title={tr('Go to rental details to close', 'Aller aux détails de la location pour clôturer')}
                              >
                                {tr('Close', 'Clôturer')}
                              </button>
                  )}
                          
                          {canDelete() && !isImmutable && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteRental(rental.id);
                              }}
                              className="flex-1 px-2 py-1 text-[10px] font-medium border rounded transition-colors text-red-600 hover:text-white hover:bg-red-600 border-red-600"
                            >
                              {tr('Delete', 'Supprimer')}
                            </button>
                          )}
                        </div>
                        )}

                        {isCompactMobileCard && (
                          <div className="mt-auto pt-2.5">
                            <div className="flex items-center justify-between gap-2 rounded-xl border border-slate-100 bg-slate-50/80 px-2.5 py-2">
                              <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                                {effectiveRentalStatus === 'active'
                                  ? tr('Action', 'Action')
                                  : tr('Open', 'Ouvrir')}
                              </span>
                              <span className={`text-[11px] font-semibold ${
                                effectiveRentalStatus === 'active'
                                  ? 'text-orange-600'
                                  : effectiveRentalStatus === 'scheduled'
                                    ? 'text-blue-600'
                                    : 'text-violet-600'
                              }`}>
                                {effectiveRentalStatus === 'active'
                                  ? tr('Close', 'Clôturer')
                                  : effectiveRentalStatus === 'scheduled'
                                    ? tr('View / Start', 'Voir / Démarrer')
                                    : tr('View Details', 'Voir détails')}
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Pagination Controls */}
        {totalCount > 0 && (
          <div className="mt-8 rounded-[1.75rem] border border-violet-100/80 bg-white p-4 shadow-[0_18px_40px_rgba(76,29,149,0.08)] sm:p-5">
            {/* Results info */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-sm text-slate-600">
                {isFrench ? 'Affichage de ' : 'Showing '}<span className="font-semibold text-slate-900">{((currentPage - 1) * itemsPerPage) + 1}</span>{isFrench ? ' à ' : ' to '}{' '}
                <span className="font-semibold text-slate-900">
                  {Math.min(currentPage * itemsPerPage, totalCount)}
                </span>{' '}
                {isFrench ? 'sur ' : 'of '}<span className="font-semibold text-slate-900">{totalCount}</span>{isFrench ? ' résultats' : ' results'}
              </div>

              {/* Page navigation */}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={currentPage === 1}
                  className={`inline-flex items-center rounded-2xl px-4 py-2 text-sm font-semibold transition-all ${
                    currentPage === 1
                      ? 'cursor-not-allowed border border-slate-200 bg-slate-100 text-slate-400'
                      : 'border border-slate-200 bg-white text-slate-700 shadow-sm hover:bg-slate-50'
                  }`}
                >
                  {isFrench ? 'Précédent' : 'Previous'}
                </button>

                <div className="flex items-center gap-1 rounded-2xl border border-violet-100 bg-violet-50/70 p-1">
                  {getPageNumbers().map((pageNum, index) => (
                    pageNum === '...' ? (
                      <span key={`dots-${index}`} className="px-2 text-sm font-semibold text-slate-400">...</span>
                    ) : (
                      <button
                        key={pageNum}
                        onClick={() => handlePageChange(pageNum)}
                        className={`h-10 w-10 rounded-xl text-sm font-semibold transition-all ${
                          pageNum === currentPage
                            ? 'bg-violet-600 text-white shadow-sm'
                            : 'bg-white text-slate-700 hover:bg-violet-50'
                        }`}
                      >
                        {pageNum}
                      </button>
                    )
                  ))}
                </div>

                <button
                  onClick={() => handlePageChange(currentPage + 1)}
                  disabled={currentPage === totalPages}
                  className={`inline-flex items-center rounded-2xl px-4 py-2 text-sm font-semibold transition-all ${
                    currentPage === totalPages
                      ? 'cursor-not-allowed border border-slate-200 bg-slate-100 text-slate-400'
                      : 'border border-slate-200 bg-white text-slate-700 shadow-sm hover:bg-slate-50'
                  }`}
                >
                  {isFrench ? 'Suivant' : 'Next'}
                </button>

                <select
                  value={itemsPerPage}
                  onChange={handleItemsPerPageChange}
                  className="rounded-2xl border border-violet-100 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm outline-none transition focus:border-violet-300 focus:ring-2 focus:ring-violet-100"
                >
                  <option value={10}>{isFrench ? '10 par page' : '10 per page'}</option>
                  <option value={25}>{isFrench ? '25 par page' : '25 per page'}</option>
                  <option value={50}>{isFrench ? '50 par page' : '50 per page'}</option>
                  <option value={100}>{isFrench ? '100 par page' : '100 per page'}</option>
                </select>
              </div>
            </div>
          </div>
        )}

        <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 sm:gap-6 xl:grid-cols-6">
          <div className="rounded-[1.5rem] border border-violet-100/80 bg-white p-4 text-center shadow-[0_16px_36px_rgba(76,29,149,0.07)] transition-all hover:-translate-y-0.5 hover:shadow-[0_20px_42px_rgba(76,29,149,0.11)] sm:p-6">
            <div className="text-2xl font-bold text-violet-600 sm:text-3xl">{totalCount || rentals.length}</div>
            <div className="mt-1 text-xs text-slate-500 sm:text-sm">{isFrench ? 'Total locations' : 'Total Rentals'}</div>
          </div>
          <div className="rounded-[1.5rem] border border-violet-100/80 bg-white p-4 text-center shadow-[0_16px_36px_rgba(76,29,149,0.07)] transition-all hover:-translate-y-0.5 hover:shadow-[0_20px_42px_rgba(76,29,149,0.11)] sm:p-6">
            <div className="text-2xl font-bold text-emerald-600 sm:text-3xl">
              {rentals.filter(r => getEffectiveRentalStatus(r) === 'active').length}
            </div>
            <div className="mt-1 text-xs text-slate-500 sm:text-sm">{isFrench ? 'Locations actives' : 'Active Rentals'}</div>
          </div>
          <div className="rounded-[1.5rem] border border-violet-100/80 bg-white p-4 text-center shadow-[0_16px_36px_rgba(76,29,149,0.07)] transition-all hover:-translate-y-0.5 hover:shadow-[0_20px_42px_rgba(76,29,149,0.11)] sm:p-6">
            <div className="text-2xl font-bold text-amber-600 sm:text-3xl">
              {rentals.filter(r => getEffectiveRentalStatus(r) === 'scheduled').length}
            </div>
            <div className="mt-1 text-xs text-slate-500 sm:text-sm">{isFrench ? 'Locations planifiées' : 'Scheduled Rentals'}</div>
          </div>
          <div className="rounded-[1.5rem] border border-violet-100/80 bg-white p-4 text-center shadow-[0_16px_36px_rgba(76,29,149,0.07)] transition-all hover:-translate-y-0.5 hover:shadow-[0_20px_42px_rgba(76,29,149,0.11)] sm:p-6">
            <div className="text-2xl font-bold text-violet-600 sm:text-3xl">
              {rentals.filter(r => getEffectiveRentalStatus(r) === 'completed').length}
            </div>
            <div className="mt-1 text-xs text-slate-500 sm:text-sm">{isFrench ? 'Locations terminées' : 'Completed Rentals'}</div>
          </div>
          <div className="rounded-[1.5rem] border border-violet-100/80 bg-white p-4 text-center shadow-[0_16px_36px_rgba(76,29,149,0.07)] transition-all hover:-translate-y-0.5 hover:shadow-[0_20px_42px_rgba(76,29,149,0.11)] sm:p-6">
            <div className="text-2xl font-bold text-orange-500 sm:text-3xl">
              {rentals.filter(r => getEffectiveRentalStatus(r) === 'expired').length}
            </div>
            <div className="mt-1 text-xs text-slate-500 sm:text-sm">{isFrench ? 'Locations expirées' : 'Expired Rentals'}</div>
          </div>
          <div className="rounded-[1.5rem] border border-violet-100/80 bg-white p-4 text-center shadow-[0_16px_36px_rgba(76,29,149,0.07)] transition-all hover:-translate-y-0.5 hover:shadow-[0_20px_42px_rgba(76,29,149,0.11)] sm:p-6">
            <div className="text-2xl font-bold text-indigo-600 sm:text-3xl">
              {rentals.filter(r => getEffectiveRentalStatus(r) === 'completed').reduce((sum, r) => sum + (parseFloat(r.total_amount) || 0), 0).toFixed(2)}
            </div>
            <div className="mt-1 text-xs text-slate-500 sm:text-sm">{isFrench ? 'Revenu total (MAD)' : 'Total Revenue (MAD)'}</div>
          </div>
        </div>
      </div>


      {videoContractModal.isOpen && (
        <VideoContractModal
          rental={videoContractModal.rental}
          type={videoContractModal.type}
          onClose={() => setVideoContractModal({ isOpen: false, rental: null, type: null })}
          onSuccess={handleVideoContractSuccess}
        />
      )}

      <ViewCustomerDetailsDrawer
        isOpen={customerDetailsDrawer.isOpen}
        onClose={() => setCustomerDetailsDrawer({ isOpen: false, customerId: null, rental: null })}
        customerId={customerDetailsDrawer.customerId}
        rental={customerDetailsDrawer.rental}
      />
    </div>
    </div>
  );
};

export default Rentals;
