import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import EnhancedStepperRentalForm from '../../components/admin/EnhancedStepperRentalForm';
import VideoContractModal from '../../components/VideoContractModal';
import VehicleAvailabilityService from '../../services/VehicleAvailabilityService';
import ViewCustomerDetailsDrawer from '../../components/admin/ViewCustomerDetailsDrawer';
import VehicleReportService from '../../services/VehicleReportService';
import FuelTransactionService from '../../services/FuelTransactionService';
import { getPaymentStatusStyle } from '../../config/statusColors';
import { roundTo } from '../../utils/fuelMath';
import { Plus, Clock, List, Grid, LayoutGrid, CheckCircle, XCircle, Calendar } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import AdminModuleHero from '../../components/admin/AdminModuleHero';


// Helper function to get rental type badge
const getRentalTypeBadge = (rentalType) => {
  if (rentalType === 'daily') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-bold rounded-full bg-blue-100 text-blue-800 border border-blue-200">
        📅 DAILY
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-bold rounded-full bg-purple-100 text-purple-800 border border-purple-200">
      ⏰ HOURLY
    </span>
  );
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

// ✅ FIXED: Calculate time remaining to match RentalDetails.jsx exactly
const calculateSmartTimeRemaining = (rental) => {
  if (rental.rental_status !== 'active') {
    return { text: null, color: null, bgColor: null, isBadge: false };
  }
  
  const now = new Date();
  
  // For hourly rentals, calculate based on started_at + duration + extensions (matches RentalDetails)
  if (rental.rental_type === 'hourly' && rental.started_at) {
    const startTime = new Date(rental.started_at);
    
    // Get original duration from quantity_hours
    const originalHours = rental.quantity_hours ?? rental.quantity_days ?? 1;
    
    // Add extension hours from the extensions array
    const extensionHours = rental.extensions
      ?.filter(ext => ext.status === 'approved')
      .reduce((sum, ext) => sum + (parseFloat(ext.extension_hours) || 0), 0) || 0;
    
    const totalHours = originalHours + extensionHours;
    
    // Calculate end time based on start time + total hours
    const endTime = new Date(startTime.getTime() + (totalHours * 60 * 60 * 1000));
    
    const diffMs = endTime - now;
    
    // EXPIRED
    if (diffMs <= 0) {
      return {
        text: '00:00:00',
        color: 'text-red-600',
        bgColor: 'bg-red-50',
        icon: '🔴',
        isDigital: true
      };
    }
    
    // Show digital countdown HH:MM:SS
    const totalSeconds = Math.floor(diffMs / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    
    const timeStr = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    
    // Add warning indicators based on time left
    let displayText = timeStr;
    let color = 'text-green-600';
    let bgColor = 'bg-green-50';
    let icon = '✅';
    
    if (hours === 0 && minutes <= 30) {
      displayText = `🔴 ${timeStr}`;
      color = 'text-red-600';
      bgColor = 'bg-red-50';
      icon = '🔴';
    } else if (hours < 2) {
      displayText = `⚠️ ${timeStr}`;
      color = 'text-orange-600';
      bgColor = 'bg-orange-50';
      icon = '⚠️';
    }
    
    return {
      text: displayText,
      color: color,
      bgColor: bgColor,
      icon: icon,
      isDigital: true
    };
  }
  
  // For non-hourly or rentals without started_at, use the original logic with end date
  const endDate = new Date(rental.rental_end_date);
  const isHourly = rental.rental_type === 'hourly';
  
  // Set end time for hourly rentals
  if (isHourly && rental.rental_end_time) {
    const [hours, minutes] = rental.rental_end_time.split(':');
    endDate.setHours(parseInt(hours), parseInt(minutes), 0, 0);
  } else {
    endDate.setHours(23, 59, 59, 999);
  }
  
  // Add approved extensions
  if (rental.extensions && rental.extensions.length > 0) {
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
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffHours / 24);
  const remainingHours = diffHours % 24;
  
  if (diffDays > 0) {
    const text = diffDays === 1 ? '1 day' : `${diffDays} days`;
    const fullText = remainingHours > 0 ? `${text} ${remainingHours}h` : text;
    return { 
      text: fullText, 
      color: diffDays <= 1 ? 'text-orange-600' : 'text-green-600',
      bgColor: diffDays <= 1 ? 'bg-orange-50' : 'bg-green-50',
      icon: diffDays <= 1 ? '⏰' : '✅',
      isDigital: false
    };
  } else {
    return { 
      text: `${diffHours}h left`, 
      color: diffHours <= 3 ? 'text-red-600' : 'text-orange-600',
      bgColor: diffHours <= 3 ? 'bg-red-50' : 'bg-orange-50',
      icon: diffHours <= 3 ? '🔴' : '⏰',
      isDigital: false
    };
  }
};

// Smart date formatter that adapts to view mode
const formatSmartDate = (rental, isMobile = false) => {
  if (!rental.rental_start_date || !rental.rental_end_date) return 'N/A';
  
  const startDate = new Date(rental.rental_start_date);
  const endDate = new Date(rental.rental_end_date);
  const now = new Date();
  
  const isToday = (date) => date.toDateString() === now.toDateString();
  const isTomorrow = (date) => {
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return date.toDateString() === tomorrow.toDateString();
  };
  
  const isHourly = rental.rental_type === 'hourly';
  
  if (isMobile) {
    // Compact format for mobile
    const startDay = isToday(startDate) ? 'Today' : isTomorrow(startDate) ? 'Tomorrow' : startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const endDay = isToday(endDate) ? 'Today' : isTomorrow(endDate) ? 'Tomorrow' : endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    
    if (isHourly) {
      const startTime = rental.rental_start_time ? rental.rental_start_time.substring(0, 5) : '';
      const endTime = rental.rental_end_time ? rental.rental_end_time.substring(0, 5) : '';
      return `${startDay} ${startTime} → ${endTime}`;
    }
    
    return `${startDay} → ${endDay}`;
  }
  
  // Full format for desktop
  const startStr = startDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  const endStr = endDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  
  if (isHourly && rental.rental_start_time && rental.rental_end_time) {
    return `${startStr} ${rental.rental_start_time.substring(0, 5)} → ${endStr} ${rental.rental_end_time.substring(0, 5)}`;
  }
  
  return `${startStr} → ${endStr}`;
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

const [rentals, setRentals] = useState([]);
  const [rentalReportMap, setRentalReportMap] = useState({});

    const [searchTerm, setSearchTerm] = useState('');

// Debug: Search functionality
  useEffect(() => {
    if (rentals.length > 0) {
      console.log('🔍 Search Debug Info:');
      console.log('  Total rentals:', rentals.length);
      console.log('  Search term:', searchTerm);
      console.log('  Sample rental:', rentals[0]);
      console.log('  Customer name:', rentals[0].customer_name);
      console.log('  Customer phone:', rentals[0].customer_phone);
      console.log('  Vehicle:', rentals[0].vehicle);
    }
  }, [rentals, searchTerm]);
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [showStepperForm, setShowStepperForm] = useState(false);
  const [editingRental, setEditingRental] = useState(null);
  
  const [statusFilter, setStatusFilter] = useState('all');
  const [paymentStatusFilter, setPaymentStatusFilter] = useState('all');
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(25);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [availabilityData, setAvailabilityData] = useState([]);
  const [vehicleFuelStateMap, setVehicleFuelStateMap] = useState({});
  const [rentalOverviewSnapshot, setRentalOverviewSnapshot] = useState({
    activeVehicleIds: [],
    scheduledVehicleIds: [],
  });
  const [viewMode, setViewMode] = useState('grid'); // 'list', 'table', or 'grid'
  const [showFilters, setShowFilters] = useState(false); // Mobile filter collapse

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

  // Inline timer implementation instead of useTimer hook
  const [currentTime, setCurrentTime] = useState(Date.now());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Force component re-render when timer updates
  const [, forceUpdate] = useState(0);
  
  useEffect(() => {
    forceUpdate(prev => prev + 1);
  }, [currentTime]);
  
  // Calculate time remaining for active rentals (keeping original for backward compatibility)
  const calculateTimeRemaining = (rental) => {
    if (rental.rental_status !== 'active') {
      return null;
    }
    
    const now = currentTime;
    const endDate = new Date(rental.rental_end_date);
    
    // For hourly rentals, include time
    const isHourly = rental.rental_type === 'hourly';
    if (isHourly && rental.rental_end_time) {
      const [hours, minutes] = rental.rental_end_time.split(':');
      endDate.setHours(parseInt(hours), parseInt(minutes), 0, 0);
    } else {
      // For daily rentals, set to end of day
      endDate.setHours(23, 59, 59, 999);
    }
    
    const diffMs = endDate - now;
    
    if (diffMs <= 0) {
      return { 
        text: isHourly ? '00:00:00' : 'Overdue', 
        color: 'text-red-600', 
        bgColor: 'bg-red-50', 
        icon: '⚠️',
        isDigital: isHourly
      };
    }
    
    // For hourly rentals, show digital countdown HH:MM:SS
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
    
    // For daily rentals, show days/hours format
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);
    const remainingHours = diffHours % 24;
    
    if (diffDays > 0) {
      const text = diffDays === 1 ? '1 day' : `${diffDays} days`;
      const fullText = remainingHours > 0 ? `${text} ${remainingHours}h` : text;
      return { 
        text: fullText, 
        color: diffDays <= 1 ? 'text-orange-600' : 'text-green-600',
        bgColor: diffDays <= 1 ? 'bg-orange-50' : 'bg-green-50',
        icon: diffDays <= 1 ? '⏰' : '✅',
        isDigital: false
      };
    } else {
      return { 
        text: `${diffHours}h left`, 
        color: diffHours <= 3 ? 'text-red-600' : 'text-orange-600',
        bgColor: diffHours <= 3 ? 'bg-red-50' : 'bg-orange-50',
        icon: diffHours <= 3 ? '🔴' : '⏰',
        isDigital: false
      };
    }
  };

  const fetchRentals = async (currentStatusFilter, currentPaymentStatusFilter, page = currentPage, limit = itemsPerPage) => {
    try {
      console.log('Fetching rentals with filters:', { 
        status: currentStatusFilter, 
        payment: currentPaymentStatusFilter,
        page,
        limit 
      });
      
      // Calculate range for pagination
      const from = (page - 1) * limit;
      const to = from + limit - 1;
      
      // First, get total count for pagination
      let countQuery = supabase
        .from('app_4c3a7a6153_rentals')
        .select('*', { count: 'exact', head: true });

      if (currentStatusFilter && currentStatusFilter !== 'all') {
        countQuery = countQuery.eq('rental_status', currentStatusFilter);
      }
      if (currentPaymentStatusFilter && currentPaymentStatusFilter !== 'all') {
        countQuery = countQuery.eq('payment_status', currentPaymentStatusFilter);
      }

      const { count, error: countError } = await countQuery;

      if (countError) {
        console.error('❌ Error getting count:', countError);
        throw countError;
      }

      setTotalCount(count || 0);
      setTotalPages(Math.ceil((count || 0) / limit));

      // Now fetch paginated data
      let query = supabase
        .from('app_4c3a7a6153_rentals')
        .select(`
          *,
          payment_status,
          approval_status,
          pending_total_request,
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
        `)
        .range(from, to);

      if (currentStatusFilter && currentStatusFilter !== 'all') {
        query = query.eq('rental_status', currentStatusFilter);
      }
      if (currentPaymentStatusFilter && currentPaymentStatusFilter !== 'all') {
        query = query.eq('payment_status', currentPaymentStatusFilter);
      }
      
      query = query.order('created_at', { ascending: false });

      let { data, error } = await query;

      if (error) {
        console.error('❌ Supabase Error', { message: error.message, details: error.details, hint: error.hint, code: error.code });
        throw error;
      }

      console.log(`Rentals fetched successfully: ${data?.length || 0} records (page ${page} of ${Math.ceil((count || 0) / limit)})`);
      console.log('Sample rental with extensions:', data?.[0]);
      
      setRentals(data || []);
      const rentalIds = (data || []).map((rental) => rental.id).filter(Boolean);
      const latestReports = await VehicleReportService.getLatestReportsForRentals(rentalIds);
      setRentalReportMap(latestReports);

    } catch (err) {
      console.error('❌ Supabase Error', { message: err.message, details: err.details, hint: err.hint, code: err.code });
      setError(err.message);
    }
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
          actual_end_date: actualEndTime
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
      fetchRentals(statusFilter, paymentStatusFilter);
      
    } catch (err) {
      console.error('❌ Error starting rental from list:', err);
      alert(`Failed to start rental: ${err.message}`);
    }
  };

  const fetchVehicles = async () => {
    try {
      console.log('Fetching vehicles...');
      
      const { data, error } = await supabase
        .from('saharax_0u4w4d_vehicles')
        .select('*')
        .order('name', { ascending: true });

      if (error) {
        console.error('❌ Supabase Error', { message: error.message, details: error.details, hint: error.hint, code: error.code });
        throw error;
      }

      console.log('Vehicles fetched successfully:', data?.length || 0);
      setVehicles(data || []);
    } catch (err) {
      console.error('❌ Supabase Error', { message: err.message, details: err.details, hint: err.hint, code: err.code });
      setError(err.message);
    }
  };

  const fetchAvailabilityData = async () => {
    try {
      console.log('Fetching vehicle availability...');
      
      const availability = await VehicleAvailabilityService.getAllVehicleAvailability();
      console.log('Availability data fetched:', availability?.length || 0);
      setAvailabilityData(availability || []);
    } catch (err) {
      console.error('❌ Supabase Error', { message: err.message, details: err.details, hint: err.hint, code: err.code });
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
      setLoading(true);
      await fetchRentals(statusFilter, paymentStatusFilter, currentPage, itemsPerPage);
      setLoading(false);
    };
    loadRentals();
  }, [statusFilter, paymentStatusFilter, currentPage, itemsPerPage]);

  // Refresh list when tab becomes visible again (e.g. returning from RentalDetails)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fetchRentals(statusFilter, paymentStatusFilter, currentPage, itemsPerPage);
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [statusFilter, paymentStatusFilter, currentPage, itemsPerPage]);

  useEffect(() => {
    fetchVehicles();
    fetchAvailabilityData();
    fetchVehicleFuelStates();
    fetchRentalOverviewSnapshot();

    console.log('Setting up real-time subscriptions...');

    const rentalSubscription = supabase
      .channel('rental_changes')
      .on('postgres_changes', 
        { 
          event: '*', 
          schema: 'public', 
          table: 'app_4c3a7a6153_rentals' 
        }, 
        (payload) => {
          console.log('Rental change detected:', payload);
          
          // Check if approval_status changed for real-time badge updates
          if (payload.eventType === 'UPDATE' && payload.new?.approval_status !== payload.old?.approval_status) {
            console.log('🔄 Approval status updated, refreshing rentals...', {
              old: payload.old?.approval_status,
              new: payload.new?.approval_status,
              rentalId: payload.new?.id
            });
          }
          
          // Refresh the current page
          fetchRentals(statusFilter, paymentStatusFilter, currentPage, itemsPerPage);
          fetchAvailabilityData();
          fetchVehicleFuelStates();
          fetchRentalOverviewSnapshot();
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
        (payload) => {
          console.log('Vehicle change detected:', payload);
          fetchVehicles();
          fetchAvailabilityData();
          fetchVehicleFuelStates();
          fetchRentalOverviewSnapshot();
        }
      )
      .subscribe();

    return () => {
      console.log('Cleaning up subscriptions...');
      supabase.removeChannel(rentalSubscription);
      supabase.removeChannel(vehicleSubscription);
    };
  }, [statusFilter, paymentStatusFilter]);

  // Check for openForm state from navigation
  useEffect(() => {
    if (location.state?.openForm) {
      console.log('🔵 Opening form from navigation state');
      if (location.state?.editingRental) {
        setEditingRental(location.state.editingRental);
      }
      setShowStepperForm(true);
      // Clear the state to prevent reopening on refresh
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);

  const handleRentalSuccess = (rentalData) => {
    console.log('Rental operation successful:', rentalData);
    setShowForm(false);
    setShowStepperForm(false);
    setEditingRental(null);
    fetchRentals(statusFilter, paymentStatusFilter);
    fetchAvailabilityData();
    fetchVehicleFuelStates();
    fetchRentalOverviewSnapshot();
  };

  const handleDeleteRental = async (rentalId) => {
    // Check owner permission first
    if (user?.role !== 'owner') {
      console.log('🚫 Delete blocked: User is not an owner', {
        userId: user?.id,
        userRole: user?.role
      });
      alert('⚠️ Only owners can delete rentals.');
      return;
    }

    if (!window.confirm('Are you sure you want to delete this rental?')) {
      return;
    }

    try {
      console.log('Deleting rental:', rentalId);
      
      let { error } = await supabase
        .from('app_4c3a7a6153_rentals')
        .delete()
        .eq('id', rentalId);

      if (error) {
        console.error('❌ Supabase Error', { message: error.message, details: error.details, hint: error.hint, code: error.code });
        throw error;
      }

      console.log('Rental deleted successfully');
      fetchRentals(statusFilter, paymentStatusFilter);
      fetchAvailabilityData();
    } catch (err) {
      console.error('❌ Supabase Error', { message: err.message, details: err.details, hint: err.hint, code: err.code });
      setError(err.message);
    }
  };

  const handleViewRental = (rental) => {
    console.log('Navigating to rental details page:', rental.id);
    navigate(`/admin/rentals/${rental.id}`);
  };

  const handleViewCustomerDetails = (rental) => {
    console.log('Opening customer details drawer for rental:', rental.id);
    console.log('Rental data being passed:', rental);
    
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

    console.log('Starting contract for rental:', rental.id);
    setVideoContractModal({
      isOpen: true,
      rental: rental,
      type: 'start'
    });
  };

  const handleCloseContract = async (rental) => {
    console.log('Closing contract for rental:', rental.id);
    
    const hasClosingVideo = await checkClosingVideo(rental.id);
    
    if (!hasClosingVideo) {
      console.log('No closing video found, opening video contract modal');
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

      console.log('Rental completed successfully:', data);
      
      alert('✅ Rental completed successfully!');
      
      fetchRentals(statusFilter, paymentStatusFilter);
      fetchAvailabilityData();
    } catch (err) {
      console.error('❌ Supabase Error', { message: err.message, details: err.details, hint: err.hint, code: err.code });
      alert('❌ Failed to complete rental: ' + err.message);
    }
  };

  const handleVideoContractSuccess = (updatedRental) => {
    console.log('Video contract completed:', updatedRental);
    
    setVideoContractModal({
      isOpen: false,
      rental: null,
      type: null
    });
    
    const action = videoContractModal.type === 'start' ? 'started' : 'completed';
    alert(`✅ Contract ${action} successfully!`);
    
    fetchRentals(statusFilter, paymentStatusFilter);
    fetchAvailabilityData();
  };

  const getStatusBadge = (status) => {
    const configs = {
      'scheduled': { text: 'Scheduled', className: 'bg-blue-100 text-blue-800' },
      'active': { text: 'Active', className: 'bg-green-100 text-green-800' },
      'completed': { text: 'Completed', className: 'bg-gray-100 text-gray-800' },
      'cancelled': { text: 'Cancelled', className: 'bg-red-100 text-red-800' },
      'expired': { text: 'Expired', className: 'bg-yellow-100 text-yellow-800' },
      'void': { text: 'Void', className: 'bg-red-100 text-red-800' }
    };
    
    const config = configs[status] || configs['scheduled'];
    return (
      <span className={`px-2 py-1 text-xs font-medium rounded-full ${config.className}`}>
        {config.text}
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
      ['maintenance_completed', 'maintenance_in_progress', 'maintenance_created'].includes(report.status)
    ) {
      return {
        text: 'Maintenance Closed',
        className: 'bg-slate-100 text-slate-800 border border-slate-300',
        detailText: 'This rental had a linked maintenance issue that was resolved after return',
      };
    }

    if (
      report.maintenance_id ||
      rental.vehicle?.status === 'maintenance' ||
      ['maintenance_created', 'maintenance_in_progress', 'maintenance_completed'].includes(report.status)
    ) {
      return {
        text: 'Under Maintenance',
        className: 'bg-orange-100 text-orange-800 border border-orange-200',
        detailText: 'Vehicle report linked to Quad Maintenance',
      };
    }

    const labels = {
      damage: 'Damage Report',
      accident: 'Accident Report',
      mechanical_issue: 'Mechanical Report',
    };

    return {
      text: labels[report.report_type] || 'Vehicle Report',
      className: 'bg-red-100 text-red-800 border border-red-200',
      detailText: 'Vehicle inspection report saved on this rental',
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

  const filteredRentals = rentals.filter((rental) => {
    if (!searchTerm) return true;

    const normalizedSearch = searchTerm.trim().toLowerCase();
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

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString();
  };

  const formatVehicleName = (vehicle) => {
    if (!vehicle) return 'Unknown Vehicle';
    
    const parts = [];
    if (vehicle.name) parts.push(vehicle.name);
    if (vehicle.model) parts.push(vehicle.model);
    
    return parts.length > 0 ? parts.join(' ') : 'Unknown Vehicle';
  };

  const formatPlateNumber = (plateNumber) => {
    if (!plateNumber) return 'N/A';
    return plateNumber.toUpperCase();
  };

  const renderFuelProgressBar = (rental, compact = false) => {
    const vehicleKey = String(rental?.vehicle_id || rental?.vehicle?.id || '');
    const fuelState = vehicleFuelStateMap[vehicleKey];
    const tankCapacity = Number(fuelState?.tank_capacity_liters || 0);
    const startFuelLines = Number(rental?.start_fuel_level ?? 0);
    const endFuelLines = Number(rental?.end_fuel_level ?? 0);
    const isCompletedHourlyConsumption =
      rental?.rental_status === 'completed' &&
      rental?.rental_type === 'hourly' &&
      startFuelLines > 0 &&
      endFuelLines >= 0;

    if (!fuelState && !isCompletedHourlyConsumption) return null;

    if (isCompletedHourlyConsumption) {
      const safeStartLines = Math.max(0, Math.min(8, startFuelLines));
      const safeEndLines = Math.max(0, Math.min(safeStartLines, endFuelLines));
      const consumedLines = Math.max(0, safeStartLines - safeEndLines);
      const startPercent = Math.max(0, Math.min(100, (safeStartLines / 8) * 100));
      const remainingPercent = Math.max(0, Math.min(100, (safeEndLines / 8) * 100));
      const consumedPercent = Math.max(0, startPercent - remainingPercent);
      const consumedLiters = tankCapacity > 0 ? roundTo((consumedLines / 8) * tankCapacity, 1) : null;

      return (
        <div className={`rounded-lg border border-emerald-100 bg-emerald-50/70 ${compact ? 'px-2.5 py-2' : 'px-3 py-2.5'}`}>
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <span className={`font-semibold uppercase tracking-[0.18em] text-emerald-700 ${compact ? 'text-[9px]' : 'text-[10px]'}`}>
              Fuel Used
            </span>
            <span className={`font-semibold text-slate-800 ${compact ? 'text-[10px]' : 'text-xs'}`}>
              {safeStartLines}/8 → {safeEndLines}/8
              {consumedLiters !== null ? ` · ${consumedLiters}L used` : ''}
            </span>
          </div>
          <div className="relative h-2 overflow-hidden rounded-full bg-slate-100">
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-emerald-500 transition-all"
              style={{ width: `${startPercent}%` }}
            />
            <div
              className="absolute inset-y-0 rounded-full bg-rose-500/90 transition-all"
              style={{ left: `${remainingPercent}%`, width: `${consumedPercent}%` }}
            />
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
            Fuel
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
  // The duplicate function below will be ignored because the one above is already defined

  // 3. Smart Date Formatter aligned with Rental Details
  const formatSmartDate = (rental, isMobile = false) => {
    const startDate = new Date(rental.started_at || rental.rental_start_date);
    const scheduledEndDate = rental.rental_end_date ? new Date(rental.rental_end_date) : null;
    const actualEndDate = rental.actual_end_date ? new Date(rental.actual_end_date) : null;
    const endDate = actualEndDate && scheduledEndDate && actualEndDate > scheduledEndDate
      ? actualEndDate
      : (actualEndDate || scheduledEndDate);

    if (!startDate || Number.isNaN(startDate.getTime()) || !endDate || Number.isNaN(endDate.getTime())) {
      return 'N/A';
    }
    
    // Mobile format
    if (isMobile) {
      const today = new Date();
      const isToday = startDate.toDateString() === today.toDateString();
      const startDay = isToday
        ? 'Today'
        : startDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
      const endDay = startDate.toDateString() === endDate.toDateString()
        ? ''
        : endDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

      const startTime = startDate.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
      const endTime = endDate.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });

      return endDay
        ? `${startDay} ${startTime} → ${endDay} ${endTime}`
        : `${startDay} ${startTime} → ${endTime}`;
    }
    
    const startLabel = startDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    const endLabel = endDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    const startTime = startDate.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
    const endTime = endDate.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });

    return startLabel === endLabel
      ? `${startLabel} ${startTime} → ${endTime}`
      : `${startLabel} ${startTime} → ${endLabel} ${endTime}`;
  };

  // 4. Duration Badge
  const getDurationBadge = (rental) => {
    const startDate = new Date(rental.started_at || rental.rental_start_date);
    const scheduledEndDate = rental.rental_end_date ? new Date(rental.rental_end_date) : null;
    const actualEndDate = rental.actual_end_date ? new Date(rental.actual_end_date) : null;
    const endDate = actualEndDate && scheduledEndDate && actualEndDate > scheduledEndDate
      ? actualEndDate
      : (actualEndDate || scheduledEndDate);

    if (!startDate || Number.isNaN(startDate.getTime()) || !endDate || Number.isNaN(endDate.getTime())) {
      return null;
    }
    
    if (rental.rental_type === 'hourly') {
      const diffMs = Math.max(0, endDate - startDate);
      const diffHours = Math.max(1, Math.round(diffMs / (1000 * 60 * 60)));
      return (
        <span className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 text-gray-800 text-xs font-medium rounded-full border border-gray-300">
          <span className="font-bold">{diffHours}h</span>
          <span>duration</span>
        </span>
      );
    }
    
    const diffMs = Math.max(0, endDate - startDate);
    const diffDays = Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
    return (
      <span className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 text-gray-800 text-xs font-medium rounded-full border border-gray-300">
        <span className="font-bold">{diffDays}d</span>
        <span>rental</span>
      </span>
    );
  };

  const handleFilterChange = (setter, filterName, value) => {
    setter(value);
    setCurrentPage(1); // Reset to first page when changing filters
    const newParams = new URLSearchParams(location.search);
    if (value === 'all') {
      newParams.delete(filterName);
    } else {
      newParams.set(filterName, value);
    }
    navigate(`${location.pathname}?${newParams.toString()}`, { replace: true });
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
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin text-4xl mb-4">⏳</div>
          <p className="text-gray-600">Loading rentals...</p>
          {totalCount > 0 ? (
            <p className="text-sm text-gray-500 mt-1">
              Found {totalCount} rentals • Page {currentPage} of {totalPages}
            </p>
          ) : (
            <p className="text-sm text-gray-500 mt-1">Applying filters...</p>
          )}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="text-4xl mb-4">❌</div>
          <p className="text-red-600 mb-4">Error: {error}</p>
          <button 
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Retry
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
          }}
          initialData={editingRental}
          mode={editingRental ? 'edit' : 'create'}
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
          }}
          initialData={editingRental}
          isLoading={loading}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        <AdminModuleHero
          icon={<List className="h-8 w-8 text-white" />}
          eyebrow="Rental Management"
          title="Rental Management"
          description="Create, track, and manage active, scheduled, and completed rentals from one workspace."
          actions={
            <button
              onClick={() => setShowStepperForm(true)}
              className="hidden sm:flex items-center gap-2 rounded-lg border border-white/20 bg-white/10 px-4 py-2 text-white backdrop-blur-sm transition-all duration-200 hover:border-white/30 hover:bg-white/20"
            >
              <Plus className="w-5 h-5" />
              <span>Create New Rental</span>
            </button>
          }
        />

        {/* Mobile Floating Action Button */}
        <button
          onClick={() => setShowStepperForm(true)}
          className="sm:hidden fixed bottom-6 right-6 z-50 flex items-center gap-2 px-5 py-4 bg-blue-600 text-white rounded-full hover:bg-blue-700 active:bg-blue-800 transition-all shadow-lg hover:shadow-xl font-medium"
          aria-label="Create New Rental"
        >
          <Plus className="w-6 h-6" />
          <span className="text-sm font-semibold">Create New Rental</span>
        </button>

        {vehicleAvailabilitySummary.total > 0 && (
          <div className="mb-6 mt-6">
            <div className="mb-4">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-violet-500">Rental Overview</p>
              <h2 className="mt-2 text-2xl font-bold text-slate-900">Vehicle Availability</h2>
            </div>
            <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
              {[
                {
                  key: 'available',
                  label: 'Available for Rent',
                  icon: <CheckCircle className="h-5 w-5 text-emerald-700" />,
                  iconTone: 'bg-emerald-50',
                  badgeTone: 'bg-emerald-50 text-emerald-600',
                  tooltip: 'Vehicles ready for immediate rental'
                },
                {
                  key: 'rented',
                  label: 'Currently Rented',
                  icon: <Clock className="h-5 w-5 text-blue-700" />,
                  iconTone: 'bg-blue-50',
                  badgeTone: 'bg-blue-50 text-blue-600',
                  tooltip: 'Vehicles currently on active rentals'
                },
                {
                  key: 'scheduled',
                  label: 'Scheduled',
                  icon: <Calendar className="h-5 w-5 text-amber-700" />,
                  iconTone: 'bg-amber-50',
                  badgeTone: 'bg-amber-50 text-amber-700',
                  tooltip: 'Vehicles with upcoming/scheduled rentals'
                },
                {
                  key: 'maintenance',
                  label: 'Under Maintenance',
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

                return (
                  <div 
                    key={key} 
                    className="group rounded-xl border border-violet-100 bg-white p-4 shadow-[0_18px_45px_rgba(76,29,149,0.08)] transition-all hover:-translate-y-0.5 hover:border-violet-200 hover:shadow-[0_20px_50px_rgba(76,29,149,0.12)]"
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
                      <p className="text-sm font-medium text-slate-500">vehicles</p>
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
                  </div>
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
              placeholder="Search by ID, name, phone, email, plate..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full rounded-xl border border-violet-100 bg-white px-4 py-3 text-base text-slate-900 shadow-sm transition-colors placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-xl text-slate-400 hover:text-slate-600"
                title="Clear search"
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
                <span>Filters</span>
                <svg className={`w-4 h-4 transition-transform ${showFilters ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              
              {/* View Mode Toggles - Always Visible */}
              <div className="flex gap-2">
                <button
                  onClick={() => setViewMode('list')}
                  className={`rounded-xl border p-3 shadow-sm transition-colors ${
                    viewMode === 'list' 
                      ? 'border-violet-600 bg-gradient-to-r from-violet-600 to-indigo-700 text-white' 
                      : 'border-violet-100 bg-white text-slate-600 hover:bg-violet-50'
                  }`}
                  title="List View"
                >
                  <List className="w-5 h-5" />
                </button>
                <button
                  onClick={() => setViewMode('grid')}
                  className={`rounded-xl border p-3 shadow-sm transition-colors ${
                    viewMode === 'grid' 
                      ? 'border-violet-600 bg-gradient-to-r from-violet-600 to-indigo-700 text-white' 
                      : 'border-violet-100 bg-white text-slate-600 hover:bg-violet-50'
                  }`}
                  title="Compact Grid View"
                >
                  <LayoutGrid className="w-5 h-5" />
                </button>
              </div>
            </div>
            
            {/* Collapsible Filters Section */}
            <div className={`${showFilters ? 'flex' : 'hidden'} sm:flex flex-col sm:flex-row gap-3 sm:gap-4`}>
              <div className="flex-1">
                <select
                  value={statusFilter}
                  onChange={(e) => handleFilterChange(setStatusFilter, 'status', e.target.value)}
                  className="w-full rounded-xl border border-violet-100 bg-white px-4 py-3 text-base text-slate-900 shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-violet-500"
                >
                <option value="all">All Status</option>
                <option value="scheduled">Scheduled</option>
                <option value="active">Active</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
                <option value="expired">Expired</option>
              </select>
              </div>
              <div className="flex-1">
                <select
                  value={paymentStatusFilter}
                  onChange={(e) => handleFilterChange(setPaymentStatusFilter, 'paymentStatus', e.target.value)}
                  className="w-full rounded-xl border border-violet-100 bg-white px-4 py-3 text-base text-slate-900 shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-violet-500"
                >
                <option value="all">All Payment Statuses</option>
                <option value="unpaid">Unpaid</option>
                <option value="partial">Partial</option>
                <option value="paid">Paid</option>
                <option value="overdue">Overdue</option>
                </select>
              </div>
          </div>
        </div>

        {viewMode === 'list' ? (
          // LIST VIEW (Original Table)
          <div className="overflow-hidden rounded-xl border border-violet-100 bg-white shadow-[0_18px_45px_rgba(76,29,149,0.08)]">
            {filteredRentals.length === 0 ? (
              <div className="text-center py-12">
                <div className="text-4xl mb-4">📝</div>
                <p className="text-gray-600 mb-2">
                  {rentals.length === 0 ? 'No rentals found' : 'No rentals match your filters'}
                </p>
                {(searchTerm || statusFilter !== 'all' || paymentStatusFilter !== 'all') && (
                  <button
                    onClick={() => {
                      setSearchTerm('');
                      setStatusFilter('all');
                      setPaymentStatusFilter('all');
                      setCurrentPage(1);
                      navigate('/admin/rentals', { replace: true });
                    }}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 mb-2"
                  >
                    Clear Filters
                  </button>
                )}
                {rentals.length === 0 && !searchTerm && statusFilter === 'all' && paymentStatusFilter === 'all' && (
                  <button
                    onClick={() => setShowStepperForm(true)}
                    className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                  >
                    Create First Rental
                  </button>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Rental ID
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Customer
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Vehicle
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Plate Number
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Rental Period
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Status
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Payment Status
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Amount
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {filteredRentals.map((rental) => {
                      const canStartContract = isPaymentSufficientForStart(rental);
                      const isImmutable = rental.rental_status === 'active' || rental.rental_status === 'completed';
                      const rentalAttention = getRentalAttentionState(rental);
                      
                      return (
                        <tr 
                          key={rental.id} 
                          className={`cursor-pointer transition-colors ${
                          rental.rental_status === 'active' ? 'bg-green-50 hover:bg-green-100' :
                          rental.rental_status === 'scheduled' ? 'bg-blue-50 hover:bg-blue-100' :
                          rental.rental_status === 'completed' ? 'bg-gray-50 hover:bg-gray-100' :
                          rental.rental_status === 'cancelled' ? 'bg-red-50 hover:bg-red-100' :
                          rental.rental_status === 'expired' ? 'bg-yellow-50 hover:bg-yellow-100' :
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
                              title="Click to view rental details"
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
                              <div className="mt-1">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleViewCustomerDetails(rental);
                                  }}
                                  className="text-xs text-blue-600 hover:text-blue-900 hover:underline font-medium"
                                  title="View customer details"
                                >
                                  View Customer Details
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
                            {rentalAttention ? (
                              <div className={`mt-1 inline-flex items-center px-2 py-1 rounded text-xs font-medium ${rentalAttention.className}`}>
                                {rentalAttention.text}
                              </div>
                            ) : (() => {
                              const timeRemaining = calculateSmartTimeRemaining(rental);
                              if (timeRemaining.text) {
                                return (
                                  <div className={`mt-1 inline-block px-2.5 py-1.5 rounded text-sm font-semibold ${timeRemaining.bgColor} ${timeRemaining.color}`}>
                                    {timeRemaining.text}
                                  </div>
                                );
                              }
                              return null;
                            })()}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex flex-col gap-1">
                              {getStatusBadge(rental.rental_status)}
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
                                className={`text-blue-600 hover:text-blue-900 ${isImmutable ? 'text-gray-400 cursor-not-allowed opacity-50' : ''}`}
                                title={isImmutable ? "Cannot edit active or completed rentals" : "Edit rental"}
                                disabled={isImmutable}
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
            const { error: updateError } = await supabase
              .from('app_4c3a7a6153_rentals')
              .update({
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
{rental.rental_status === 'scheduled' && !rental.pending_total_request && canStartFromList(rental) && (
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
{rental.rental_status === 'scheduled' && !rental.pending_total_request && !canStartFromList(rental) && (
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
                              
                              {rental.rental_status === 'active' && (
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
                {(searchTerm || statusFilter !== 'all' || paymentStatusFilter !== 'all') && (
                  <button
                    onClick={() => {
                      setSearchTerm('');
                      setStatusFilter('all');
                      setPaymentStatusFilter('all');
                      setCurrentPage(1);
                      navigate('/admin/rentals', { replace: true });
                    }}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 mb-2"
                  >
                    Clear Filters
                  </button>
                )}
                {rentals.length === 0 && !searchTerm && statusFilter === 'all' && paymentStatusFilter === 'all' && (
                  <button
                    onClick={() => setShowStepperForm(true)}
                    className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                  >
                    Create First Rental
                  </button>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
                {filteredRentals.map((rental) => {
                  const canStartContract = isPaymentSufficientForStart(rental);
                  const isImmutable = rental.rental_status === 'active' || rental.rental_status === 'completed';
                  const rentalAttention = getRentalAttentionState(rental);
                  
                  return (
                    <div 
                      key={rental.id} 
                      className="cursor-pointer"
                      onClick={() => handleViewRental(rental)}
                    >
                      <div className={`min-h-[250px] flex flex-col rounded-xl border bg-white p-3.5 transition-all hover:-translate-y-0.5 ${
                          rental.rental_status === 'active'
                            ? 'border-emerald-200 shadow-[0_18px_45px_rgba(16,185,129,0.12)] hover:border-emerald-300 hover:shadow-[0_20px_50px_rgba(16,185,129,0.16)]'
                            : rental.rental_status === 'scheduled'
                              ? 'border-blue-200 shadow-[0_18px_45px_rgba(59,130,246,0.12)] hover:border-blue-300 hover:shadow-[0_20px_50px_rgba(59,130,246,0.16)]'
                              : rental.rental_status === 'completed'
                                ? 'border-slate-200 shadow-[0_18px_45px_rgba(100,116,139,0.10)] hover:border-slate-300 hover:shadow-[0_20px_50px_rgba(100,116,139,0.14)]'
                                : rental.rental_status === 'cancelled'
                                  ? 'border-rose-200 shadow-[0_18px_45px_rgba(244,63,94,0.10)] hover:border-rose-300 hover:shadow-[0_20px_50px_rgba(244,63,94,0.14)]'
                                  : rental.rental_status === 'expired'
                                    ? 'border-amber-200 shadow-[0_18px_45px_rgba(245,158,11,0.10)] hover:border-amber-300 hover:shadow-[0_20px_50px_rgba(245,158,11,0.14)]'
                                  : 'border-amber-200 shadow-[0_18px_45px_rgba(245,158,11,0.10)] hover:border-amber-300 hover:shadow-[0_20px_50px_rgba(245,158,11,0.14)]'
                        }`}>
                        {/* Compact Header */}
                        <div className={`mb-2.5 flex items-start justify-between gap-3 border-b pb-2.5 ${
                          rental.rental_status === 'active' ? 'border-emerald-100' :
                          rental.rental_status === 'scheduled' ? 'border-blue-100' :
                          rental.rental_status === 'completed' ? 'border-slate-100' :
                          rental.rental_status === 'cancelled' ? 'border-rose-100' :
                          rental.rental_status === 'expired' ? 'border-amber-100' :
                          'border-amber-100'
                        }`}>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleViewRental(rental);
                            }}
                            className="min-w-0 flex-1 text-left font-mono text-xs font-bold text-violet-600 transition-colors hover:text-violet-800 break-all"
                            title={formatRentalId(rental)}
                          >
                            {formatRentalId(rental)}
                          </button>
                          <div className="ml-auto flex shrink-0 flex-col items-end gap-1">
                            {getStatusBadge(rental.rental_status)}
                            {rentalAttention && (
                              <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${rentalAttention.className}`}>
                                {rentalAttention.text}
                              </span>
                            )}
                            {rental.rental_status === 'completed' && rental.damage_deposit > 0 && !rental.deposit_returned_at && (
                              <span className="inline-flex items-center gap-1 text-xs bg-orange-100 text-orange-700 border border-orange-200 px-2 py-0.5 rounded-full font-medium">
                                🔒 Deposit Pending
                              </span>
                            )}
                          </div>
                        </div>
                        
                        {/* Rental Type and Duration Badges */}
                        <div className="mb-2.5 flex items-center gap-1.5 sm:gap-2">
                          {getRentalTypeBadge(rental.rental_type)}
                          {getDurationBadge(rental)}
                        </div>

                        {/* Compact Info Grid */}
                        <div className="space-y-2 text-xs">
                          {/* Customer */}
                          <div className="flex items-start gap-2">
                            <span className="text-gray-500 font-semibold min-w-[50px]">👤</span>
                            <div className="flex-1 min-w-0">
                              <div className="truncate text-sm font-semibold text-slate-900">{rental.customer_name}</div>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleViewCustomerDetails(rental);
                                }}
                                className="text-[10px] font-medium text-violet-600 underline hover:text-violet-800"
                              >
                                Details
                              </button>
                            </div>
                          </div>

                          {/* Vehicle & Plate */}
                          <div className="flex items-start gap-2">
                            <span className="text-gray-500 font-semibold min-w-[50px]">🚗</span>
                            <div className="flex-1 min-w-0">
                              <div className="inline-flex items-center rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 shadow-sm">
                                <span className="font-mono text-sm font-extrabold tracking-wide text-slate-900">
                                  {formatPlateNumber(rental.vehicle?.plate_number)}
                                </span>
                              </div>
                              <div className="mt-1 truncate text-sm font-semibold text-slate-900">{formatVehicleName(rental.vehicle)}</div>
                              <div className="mt-1 flex flex-wrap items-center gap-2">
                                <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-700">
                                  {rental.vehicle?.model || 'N/A'}
                                </span>
                                <span className="text-[10px] uppercase tracking-[0.18em] text-slate-500">
                                  {rental.vehicle?.vehicle_type || 'Vehicle'}
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* Dates */}
                          <div className="flex items-start gap-2">
                            <span className="text-gray-500 font-semibold min-w-[50px]">📅</span>
                            <div className="flex-1 min-w-0">
                              <div className="text-xs font-medium text-slate-900">
                                {formatSmartDate(rental, true)}
                              </div>
                              {rentalAttention ? (
                                <div className={`mt-1 inline-flex items-center px-2 py-1 rounded text-[10px] font-medium ${rentalAttention.className}`}>
                                  {rentalAttention.text}
                                </div>
                              ) : (() => {
                                const timeRemaining = calculateSmartTimeRemaining(rental);
                                if (timeRemaining.text) {
                                  return (
                                    <div className={`mt-1 inline-flex items-center gap-1.5 rounded-lg border border-white/70 px-2.5 py-1.5 ${timeRemaining.bgColor}`}>
                                      <Clock className={`h-3.5 w-3.5 ${timeRemaining.color}`} />
                                      <span className={`text-xs font-extrabold ${timeRemaining.color} tracking-tight`}>
                                        {timeRemaining.text}
                                      </span>
                                    </div>
                                  );
                                }
                                return null;
                              })()}
                            </div>
                          </div>

                          {renderFuelProgressBar(rental, true)}

                          {/* Payment Info */}
<div className="flex items-center justify-between gap-2 border-t border-slate-100 pt-2.5">
  <div className="flex items-center gap-1">
    {(() => {
      const paymentSnapshot = getRentalFinancialSnapshot(rental);
      return (
        <span className={paymentSnapshot.className}>
          {paymentSnapshot.status}
        </span>
      );
    })()}
  </div>
  <div className="text-xs font-bold text-slate-900 whitespace-nowrap">
    {(() => {
      const paymentSnapshot = getRentalFinancialSnapshot(rental);
      return rental.pending_total_request ? (
        <div className="flex items-center gap-1">
          <span className="text-yellow-600">{rental.pending_total_request} MAD</span>
          <span className="text-[8px] text-gray-400 line-through">{paymentSnapshot.grandTotal.toFixed(0)} MAD</span>
        </div>
      ) : (
        <span>{paymentSnapshot.grandTotal.toFixed(0)} MAD</span>
      );
    })()}
  </div>
</div>

{/* Only show pending badge here, remove approved/declined badges */}
{rental.approval_status === 'pending' && rental.pending_total_request && (
  <div className="flex items-center gap-1 rounded-md border border-amber-100 bg-amber-50 px-2 py-1 text-[10px] text-amber-700">
    <Clock className="w-3 h-3" />
    <span>Pending approval for {rental.pending_total_request} MAD</span>
  </div>
)}

{/* Approved and declined badges removed from here - they are now shown in actions */}
                        </div>

                        {/* Compact Actions */}
                        <div className="flex flex-wrap gap-2 mt-auto pt-2.5 border-t border-gray-100">
                          
                          {/* Admin Approval Button for Pending Price Overrides */}
{rental.rental_status === 'scheduled' && rental.approval_status === 'pending' && rental.pending_total_request && user?.role === 'owner' && (
  <div className="flex gap-1 w-full">
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
      className="flex-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-[10px] font-semibold text-emerald-700 transition-colors hover:bg-emerald-100"
      title="Approve pending price override"
    >
      ✓ {rental.pending_total_request} MAD
    </button>
    <button
      onClick={async (e) => {
        e.stopPropagation();
        if (confirm(`Decline price override of ${rental.pending_total_request} MAD?`)) {
          try {
            const { error: updateError } = await supabase
              .from('app_4c3a7a6153_rentals')
              .update({
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
      className="flex-1 rounded-md border border-rose-200 bg-rose-50 px-2 py-1 text-[10px] font-semibold text-rose-700 transition-colors hover:bg-rose-100"
      title="Decline pending price override"
    >
      ✗ Decline
    </button>
  </div>
)}

{/* Show approved/declined badges for non-pending rentals */}
{rental.rental_status === 'scheduled' && rental.approval_status === 'approved' && (
  <div className="flex w-full items-center justify-center gap-1 rounded-md border border-emerald-100 bg-emerald-50 px-2 py-1 text-[10px] text-emerald-700">
    <CheckCircle className="w-3 h-3" />
    <span>Approved</span>
  </div>
)}

{rental.rental_status === 'scheduled' && rental.approval_status === 'declined' && (
  <div className="flex w-full items-center justify-center gap-1 rounded-md border border-rose-100 bg-rose-50 px-2 py-1 text-[10px] text-rose-700">
    <XCircle className="w-3 h-3" />
    <span>Declined</span>
  </div>
)}

{/* Regular Start Button for non-pending rentals */}
{rental.rental_status === 'scheduled' && !rental.pending_total_request && !rental.approval_status && (
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
        ? 'Click to start rental'
        : 'Complete all requirements first'
    }
  >
    Start
  </button>
)}
                          
                          {rental.rental_status === 'active' && (
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
                          
                          {canDelete() && !isImmutable && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteRental(rental.id);
                              }}
                              className="flex-1 px-2 py-1 text-[10px] font-medium border rounded transition-colors text-red-600 hover:text-white hover:bg-red-600 border-red-600"
                            >
                              Delete
                            </button>
                          )}
                        </div>
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
          <div className="mt-8 flex flex-col sm:flex-row sm:items-center sm:justify-between bg-white p-4 rounded-lg shadow-sm border">
            {/* Results info */}
            <div className="text-sm text-gray-700 mb-4 sm:mb-0">
              Showing <span className="font-medium">{((currentPage - 1) * itemsPerPage) + 1}</span> to{' '}
              <span className="font-medium">
                {Math.min(currentPage * itemsPerPage, totalCount)}
              </span>{' '}
              of <span className="font-medium">{totalCount}</span> results
            </div>

            {/* Page navigation */}
            <div className="flex items-center gap-2 flex-wrap">
              {/* Previous button */}
              <button
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage === 1}
                className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                  currentPage === 1
                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-300'
                }`}
              >
                Previous
              </button>

              {/* Page numbers */}
              <div className="flex items-center gap-1">
                {getPageNumbers().map((pageNum, index) => (
                  pageNum === '...' ? (
                    <span key={`dots-${index}`} className="px-2 text-gray-500">...</span>
                  ) : (
                    <button
                      key={pageNum}
                      onClick={() => handlePageChange(pageNum)}
                      className={`w-10 h-10 text-sm font-medium rounded-md transition-colors ${
                        pageNum === currentPage
                          ? 'bg-blue-600 text-white'
                          : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-300'
                      }`}
                    >
                      {pageNum}
                    </button>
                  )
                ))}
              </div>

              {/* Next button */}
              <button
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage === totalPages}
                className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                  currentPage === totalPages
                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-300'
                }`}
              >
                Next
              </button>

              {/* Items per page selector */}
              <select
                value={itemsPerPage}
                onChange={handleItemsPerPageChange}
                className="ml-4 px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                <option value={10}>10 per page</option>
                <option value={25}>25 per page</option>
                <option value={50}>50 per page</option>
                <option value={100}>100 per page</option>
              </select>
            </div>
          </div>
        )}

        <div className="mt-8 grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-4 sm:gap-6">
          <div className="bg-white p-4 sm:p-6 rounded-lg shadow-sm border text-center hover:shadow-md transition-shadow">
            <div className="text-2xl sm:text-3xl font-bold text-blue-600">{totalCount || rentals.length}</div>
            <div className="text-xs sm:text-sm text-gray-600 mt-1">Total Rentals</div>
          </div>
          <div className="bg-white p-4 sm:p-6 rounded-lg shadow-sm border text-center hover:shadow-md transition-shadow">
            <div className="text-2xl sm:text-3xl font-bold text-green-600">
              {rentals.filter(r => r.rental_status === 'active').length}
            </div>
            <div className="text-xs sm:text-sm text-gray-600 mt-1">Active Rentals</div>
          </div>
          <div className="bg-white p-4 sm:p-6 rounded-lg shadow-sm border text-center hover:shadow-md transition-shadow">
            <div className="text-2xl sm:text-3xl font-bold text-yellow-600">
              {rentals.filter(r => r.rental_status === 'scheduled').length}
            </div>
            <div className="text-xs sm:text-sm text-gray-600 mt-1">Scheduled Rentals</div>
          </div>
          <div className="bg-white p-4 sm:p-6 rounded-lg shadow-sm border text-center hover:shadow-md transition-shadow">
            <div className="text-2xl sm:text-3xl font-bold text-purple-600">
              {rentals.filter(r => r.rental_status === 'completed').length}
            </div>
            <div className="text-xs sm:text-sm text-gray-600 mt-1">Completed Rentals</div>
          </div>
          <div className="bg-white p-4 sm:p-6 rounded-lg shadow-sm border text-center hover:shadow-md transition-shadow">
            <div className="text-2xl sm:text-3xl font-bold text-yellow-600">
              {rentals.filter(r => r.rental_status === 'expired').length}
            </div>
            <div className="text-xs sm:text-sm text-gray-600 mt-1">Expired Rentals</div>
          </div>
          <div className="bg-white p-4 sm:p-6 rounded-lg shadow-sm border text-center hover:shadow-md transition-shadow">
            <div className="text-2xl sm:text-3xl font-bold text-indigo-600">
              {rentals.filter(r => r.rental_status === 'completed').reduce((sum, r) => sum + (parseFloat(r.total_amount) || 0), 0).toFixed(2)}
            </div>
            <div className="text-xs sm:text-sm text-gray-600 mt-1">Total Revenue (MAD)</div>
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
