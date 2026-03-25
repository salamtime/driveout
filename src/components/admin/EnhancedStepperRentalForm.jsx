import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  User, Car, CreditCard, Check, ChevronRight, ChevronLeft,
  Scan, UserSearch, AlertCircle, Loader, Clock, DollarSign,
  Calculator, Info, Phone, Mail, Calendar, MapPin, FileText,
  Upload, Shield, CheckCircle, XCircle, CalendarDays, Car as CarIcon,
  Users, UserPlus, BadgeCheck, FileImage, DownloadCloud, Plus, Minus,
  ChevronDown, ChevronUp, Eye, Edit2, Trash2, Save, X,
  Package, Gauge
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import DynamicPricingService from '../../services/DynamicPricingService';
import { useNavigate } from 'react-router-dom';
import EnhancedUnifiedIDScanModal from '../customers/EnhancedUnifiedIDScanModal';
import SecondDriverIDScanModal from './SecondDriverIDScanModal';
import TransactionalRentalService from '../../services/TransactionalRentalService';
import VehicleModelService from '../../services/VehicleModelService';
import AppSettingsService from '../../services/AppSettingsService';
import enhancedUnifiedCustomerService from '../../services/EnhancedUnifiedCustomerService';
import { useAuth } from '../../contexts/AuthContext';
import { canEditRentalPrice } from '../../utils/permissionHelpers';
import { 
  getMoroccoTodayString, 
  getMoroccoDateOffset, 
  getMoroccoHourlyTimes,
  isAfter, 
  parseDateAsLocal, 
  formatDateToYYYYMMDD 
} from '../../utils/moroccoTime';
import { toast } from 'sonner';
import { uploadCustomerDocument } from '../../utils/storageUpload';
import ViewCustomerDetailsDrawer from './ViewCustomerDetailsDrawer';

// ==================== CUSTOM HOOK - ALL BUSINESS LOGIC ====================
const useRentalWizard = (initialData = null, mode = 'create', navigate) => {
  const { userProfile } = useAuth();
  
  // Core form state
  const [formData, setFormData] = useState({
    // Customer Info
    customer_name: '',
    customer_email: '',
    customer_phone: '',
    customer_id: null,
    customer_licence_number: '',
    customer_id_number: '',
    customer_dob: '',
    customer_place_of_birth: '',
    customer_nationality: '',
    customer_issue_date: '',
    customer_id_image: null,
    customer_uploaded_images: [], // Multiple manually uploaded images
    
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
    unit_price: 0,
    transport_fee: 0,
    total_amount: 0,
    deposit_amount: '',
    damage_deposit: 0,
    damage_deposit_source: '', // NEW: track preset source
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
  
  // ==================== FUEL CHARGE TOGGLE ====================
  const [fuelChargeEnabled, setFuelChargeEnabled] = useState(false);
  const [fuelChargeAmount, setFuelChargeAmount] = useState(0);

  const [isCheckingAvailability, setIsCheckingAvailability] = useState(false);
  const [vehicleConflict, setVehicleConflict] = useState({
    hasConflict: false,
    conflictingVehicle: null,
    conflicts: [],
    availableAlternatives: [],
    dates: null
  });
  const [autoCalculatedPrice, setAutoCalculatedPrice] = useState(0);
  
  // NEW: Damage Deposit States
  const [damageDepositConfig, setDamageDepositConfig] = useState({
    vehicleModelPresets: {},
    allowCustomDeposit: true
  });
  const [selectedDepositTab, setSelectedDepositTab] = useState(null);
  const [customDepositAmount, setCustomDepositAmount] = useState('');
  
  // Customer Data
  const [customers, setCustomers] = useState([]);
  const [rentals, setRentals] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [isPhoneDirty, setIsPhoneDirty] = useState(false);
  const [isEmailDirty, setIsEmailDirty] = useState(false);
  
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
  const isProcessing = useRef(false);
  const vehicleLoadTimeout = useRef(null);

  // ==================== NEW: LOAD DAMAGE DEPOSIT CONFIG ====================
  const loadDamageDepositConfig = async () => {
    try {
      console.log('📡 Loading damage deposit configuration...');
      
      const { data, error } = await supabase
        .from('app_settings')
        .select('damage_deposit_presets, allow_custom_deposit')
        .eq('id', 1)
        .single();

      if (error) throw error;

      if (data) {
        const config = {
          vehicleModelPresets: data.damage_deposit_presets || {},
          allowCustomDeposit: data.allow_custom_deposit ?? true
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
const loadFuelChargeSettings = async (vehicleModelId = null, rentalType = null) => {
  try {
    const modelId = vehicleModelId || formData.vehicle?.vehicle_model_id;
    const type = rentalType || formData.rental_type || 'daily';

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
    setFuelChargeEnabled((rentalType || formData.rental_type) === 'daily' && pricePerLine > 0);

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
        rental_start_date: prev.rental_start_date || today,
        rental_end_date: prev.rental_end_date || today,
      }));
      
      if (initialData && mode === 'edit') {
        initializeEditData(initialData);
      }
    };
    
    init();
  }, []);

  // ==================== NEW: AUTO-SELECT FIRST PRESET ====================
  useEffect(() => {
    if (formData.vehicle_id) {
      const enabledPresets = getEnabledPresetsForVehicle(formData.vehicle_id);
      
      if (enabledPresets.length > 0) {
        const firstPreset = enabledPresets[0];
        setSelectedDepositTab(firstPreset.label);
        setFormData(prev => ({
          ...prev,
          damage_deposit: firstPreset.amount,
          damage_deposit_source: firstPreset.label
        }));
        console.log(`✅ Auto-selected deposit: ${firstPreset.label} (${firstPreset.amount} MAD)`);
      } else if (damageDepositConfig.allowCustomDeposit) {
        setSelectedDepositTab('custom');
        setFormData(prev => ({
          ...prev,
          damage_deposit_source: 'custom'
        }));
      }
    }
  }, [formData.vehicle_id, damageDepositConfig]);

  // ==================== DATA LOADING ====================
  const loadCustomers = async () => {
    try {
      const { data } = await supabase.from('app_4c3a7a6153_customers').select('*');
      if (data) setCustomers(data);
    } catch (err) {
      console.error('Failed to load customers:', err);
    }
  };

  const loadRentals = async () => {
    try {
      const { data } = await supabase.from('app_4c3a7a6153_rentals').select('*').order('created_at', { ascending: false });
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
      
      const { data: allConflicts, error } = await supabase
        .from('app_4c3a7a6153_rentals')
        .select('id, vehicle_id, rental_start_date, rental_end_date, rental_status')
        .in('rental_status', ['confirmed', 'scheduled', 'active'])
        .or(`and(rental_start_date.lte.${end.toISOString()},rental_end_date.gte.${start.toISOString()})`);
      
      if (error) {
        console.error('❌ Error fetching conflicts:', error);
        return vehicles;
      }
      
      const conflictingVehicleIds = new Set();
      if (allConflicts && allConflicts.length > 0) {
        allConflicts.forEach(conflict => {
          if (initialData?.id && conflict.id === initialData.id) {
            return;
          }
          conflictingVehicleIds.add(conflict.vehicle_id);
        });
      }

      console.log('🔍 CONFLICT QUERY RESULTS:', {
        totalConflicts: allConflicts?.length || 0,
        conflictingVehicleIds: Array.from(conflictingVehicleIds),
        conflictDetails: allConflicts?.map(c => ({
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
      
      const { data: vehicles, error } = await supabase
        .from('saharax_0u4w4d_vehicles')
        .select('*')
        .order('id');
      
      if (error) {
        console.error('❌ Error loading vehicles:', error);
        setAvailableVehicles([]);
      } else {
        const eligibleVehicles = (vehicles || []).filter(vehicle => {
          if (vehicle.status === 'available') {
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
      
      const { data: conflicts, error } = await supabase
        .from('app_4c3a7a6153_rentals')
        .select('id, rental_start_date, rental_end_date, customer_name, vehicle_id, rental_status')
        .eq('vehicle_id', vehicleId)
        .in('rental_status', ['confirmed', 'scheduled', 'active'])
        .or(`and(rental_start_date.lte.${end.toISOString()},rental_end_date.gte.${start.toISOString()})`)
        .neq('id', initialData?.id || '');
      
      if (error) {
        console.error('❌ Availability check error:', error);
        setIsCheckingAvailability(false);
        return { available: true };
      }
      
      if (conflicts && conflicts.length > 0) {
        console.log(`❌ Found ${conflicts.length} conflict(s) for vehicle ${vehicleId}`);
        
        setVehicleConflict({
          hasConflict: true,
          conflictingVehicle: availableVehicles.find(v => v.id == vehicleId),
          conflicts,
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
          conflicts,
          conflictCount: conflicts.length
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
  const saveCustomerFromScan = async (scannedData, imageFile = null) => {
    try {
      const customerId = generateCustomerId();
      
      const customerData = {
        id: customerId,
        full_name: scannedData.fullName || scannedData.full_name || scannedData.name || scannedData.raw_name || '',
        phone: scannedData.phone || '',
        email: scannedData.email || '',
        licence_number: scannedData.idNumber || scannedData.document_number || scannedData.licence_number || scannedData.license_number || '',
        id_number: scannedData.idNumber || scannedData.id_number || scannedData.document_number || '',
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
      
      const { data: savedCustomer, error } = await supabase
        .from('app_4c3a7a6153_customers')
        .insert([customerData])
        .select()
        .single();
      
      if (error) {
        if (error.code === '23505') {
          const { data: existingCustomer } = await supabase
            .from('app_4c3a7a6153_customers')
            .select('*')
            .or(`phone.eq.${customerData.phone},licence_number.eq.${customerData.licence_number}`)
            .maybeSingle();
          
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
      startTime = startDate.toTimeString().slice(0, 5);
    }
  }
  
  if (data.rental_end_date) {
    const endDate = new Date(data.rental_end_date);
    if (!isNaN(endDate.getTime())) {
      endTime = endDate.toTimeString().slice(0, 5);
    }
  }

  const cleanStartDate = data.rental_start_date ? data.rental_start_date.split('T')[0] : '';
  const cleanEndDate = data.rental_end_date ? data.rental_end_date.split('T')[0] : '';
  
  setFormData({
    ...formData,
    ...data,
    rental_start_date: cleanStartDate,
    rental_end_date: cleanEndDate,
    rental_start_time: startTime,
    rental_end_time: endTime,
  });
  
  // ✅ Load fuel charge settings from the rental data
  if (data.fuel_charge_enabled !== undefined) {
    setFuelChargeEnabled(data.fuel_charge_enabled);
  }
  if (data.fuel_charge !== undefined) {
    setFuelChargeAmount(data.fuel_charge || 0);
  }
  // Reload fuel pricing when rental type changes
  if (data.rental_type && formData.vehicle?.vehicle_model_id) {
    loadFuelChargeSettings(formData.vehicle.vehicle_model_id, data.rental_type);
  }
  
  if (data.damage_deposit_source) {
    setSelectedDepositTab(data.damage_deposit_source);
  }
  
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

  // ==================== UPDATED: GET DIRECT PRICING FROM DATABASE WITH TIER CHECK ====================
  const getDirectPricing = async (vehicleId, rentalType, hours) => {
    const vehicle = availableVehicles.find(v => v.id == vehicleId);
    if (!vehicle) {
      return rentalType === 'hourly' ? 400 : 1500;
    }
    
    const modelId = vehicle.vehicle_model_id;
    
    if ((rentalType === 'hourly' && hours === 1) || (rentalType === 'daily' && hours === 1)) {
      const { data: basePriceData, error } = await supabase
        .from('app_4c3a7a6153_base_prices')
        .select(rentalType === 'hourly' ? 'hourly_price' : 'daily_price')
        .eq('vehicle_model_id', modelId)
        .eq('is_active', true)
        .single();
      
      if (!error && basePriceData) {
        const priceField = rentalType === 'hourly' ? 'hourly_price' : 'daily_price';
        const basePrice = parseFloat(basePriceData[priceField]) || 0;
        return basePrice;
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
        throw new Error('No pricing tiers found');
      }
      
      if (rentalType === 'hourly' && hours && hours > 0) {
        if (hours === 1) {
          throw new Error('Single unit should use base price');
        }

        for (const tier of pricingTiers) {
          if (tier.min_hours !== null && tier.max_hours !== null && tier.price_amount) {
            const min = parseInt(tier.min_hours);
            const max = parseInt(tier.max_hours);
            
            if (hours >= min && hours <= max) {
              return parseFloat(tier.price_amount);
            }
          }
        }
        
        const anyHourly = pricingTiers.find(t => t.price_amount);
        if (anyHourly) {
          return parseFloat(anyHourly.price_amount);
        }
      }
      
      if (rentalType === 'daily') {
        const days = hours ? Math.ceil(hours / 24) : 1;
        
        for (const tier of pricingTiers) {
          if (tier.daily_price_amount) {
            const min = tier.min_days ? parseInt(tier.min_days) : 1;
            const max = tier.max_days ? parseInt(tier.max_days) : Infinity;
            
            if (days >= min && days <= max) {
              return parseFloat(tier.daily_price_amount);
            }
          }
        }
        
        const anyDaily = pricingTiers.find(t => t.daily_price_amount);
        if (anyDaily) {
          return parseFloat(anyDaily.daily_price_amount);
        }
        
        const anyHourly = pricingTiers.find(t => t.price_amount);
        if (anyHourly) {
          const calculatedDaily = parseFloat(anyHourly.price_amount) * 24;
          return calculatedDaily;
        }
      }
      
      if (rentalType === 'weekly') {
        const weeks = hours ? Math.ceil(hours / (24 * 7)) : 1;
        const dailyPrice = await getDirectPricing(vehicleId, 'daily', 24);
        return dailyPrice * 7;
      }
      
      throw new Error('No price found');
      
    } catch (error) {
      try {
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
      }
    }
  };

  const calculateTransportFee = () => {
    let totalTransportFee = 0;
    if (formData.pickup_transport) totalTransportFee += transportFees.pickup_fee || 0;
    if (formData.dropoff_transport) totalTransportFee += transportFees.dropoff_fee || 0;
    
    setFormData(prev => ({ ...prev, transport_fee: totalTransportFee }));
  };

  const calculateFinancials = () => {
  const subtotal = (formData.quantity_days || 0) * (formData.unit_price || 0);
  const fuelCharge = fuelChargeEnabled ? fuelChargeAmount : 0;
  const total = subtotal + (formData.transport_fee || 0) + fuelCharge;
  const remaining = total - (formData.deposit_amount || 0);

  setFormData(prev => ({
    ...prev,
    total_amount: total,
    remaining_amount: Math.max(remaining, 0)
  }));
};

  const calculateQuantityAndPricing = async () => {
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
        updatedEndTime = endDatetime.toTimeString().slice(0, 5);
      }
      
      const diffHours = (endDatetime - startDatetime) / (1000 * 60 * 60);
      quantity = Math.ceil(Math.max(diffHours, 1));
    } else {
      const startDateOnly = new Date(rental_start_date);
      startDateOnly.setHours(0, 0, 0, 0);
      
      const endDateOnly = new Date(rental_end_date);
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
        setAutoCalculatedPrice(unitPrice);
        setFormData(prev => ({ 
          ...prev, 
          unit_price: unitPrice 
        }));
      }, 100);
    }
  };

  const getAggregatedCustomerData = useCallback(() => {
    const customerMap = new Map();
    
    customers.forEach(c => {
      if (c.full_name) {
        const key = c.full_name.trim().toLowerCase();
        if (!customerMap.has(key)) {
          customerMap.set(key, {
            id: c.id,
            name: c.full_name,
            email: c.email,
            phone: c.phone,
            licence_number: c.licence_number,
            id_number: c.id_number,
            date_of_birth: c.date_of_birth,
            nationality: c.nationality,
            place_of_birth: c.place_of_birth,
            extra_images: c.extra_images || [],
            source: 'database'
          });
        }
      }
    });
    
    rentals.forEach(r => {
      if (r.customer_name) {
        const key = r.customer_name.trim().toLowerCase();
        const existing = customerMap.get(key);
        if (!existing) {
          customerMap.set(key, {
            id: r.customer_id,
            name: r.customer_name,
            email: r.customer_email,
            phone: r.customer_phone,
            licence_number: r.customer_licence_number,
            source: 'rental'
          });
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
      const { data: admins, error } = await supabase
        .from('app_b30c02e74da644baad4668e3587d86b1_users')
        .select('id, full_name, phone_number, whatsapp_notifications, role')
        .in('role', ['owner', 'admin'])
        .eq('whatsapp_notifications', true)
        .not('phone_number', 'is', null);

      if (error) {
        return 0;
      }

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
    if (!formData.rental_start_date || !formData.rental_start_time) {
      toast.error('Please set start date and time first');
      return;
    }
    
    const startDateTime = composeDateTime(formData.rental_start_date, formData.rental_start_time);
    if (!startDateTime) {
      toast.error('Invalid start date/time');
      return;
    }
    
    const endDateTime = new Date(startDateTime.getTime() + (hours * 60 * 60 * 1000));
    
    setSelectedQuickDuration(hours);
    
    setFormData(prev => ({
      ...prev,
      rental_end_date: formatDateToYYYYMMDD(endDateTime),
      rental_end_time: endDateTime.toTimeString().slice(0, 5)
    }));
    
    toast.success(`✅ Set ${hours}-hour rental period`);
  };

  const handleQuickDaySelect = (days) => {
    if (formData.rental_start_date) {
      const startDate = new Date(formData.rental_start_date);
      const endDate = new Date(startDate);
      endDate.setDate(startDate.getDate() + days);
      
      const newEndDate = endDate.toISOString().split('T')[0];
      const endTime = formData.rental_start_time || new Date().toTimeString().slice(0, 5);
      
      setFormData(prev => ({
        ...prev,
        rental_end_date: newEndDate,
        rental_end_time: endTime,
        quantity_days: days,
      }));
      
      setSelectedQuickDuration(days);
      
      if (formData.vehicle_id) {
        setTimeout(() => {
          getDirectPricing(formData.vehicle_id, 'daily', days).then(price => {
            setAutoCalculatedPrice(price);
            setFormData(prev => ({ ...prev, unit_price: price }));
          });
        }, 100);
      }
    } else {
      toast.error('Please set a start date first.');
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
        damage_deposit_source: 'custom'
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        damage_deposit: amount,
        damage_deposit_source: tabId
      }));
    }
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

    if (field === 'rental_start_time' || field === 'rental_end_time' || 
        field === 'rental_start_date' || field === 'rental_end_date') {
      setSelectedQuickDuration(null);
    }

    const newFormData = { ...formData, [field]: value };

    if (field === 'vehicle_id') {
      newFormData.vehicle_id = value;
      
      if (value && formData.rental_type && !formData.use_package_pricing) {
        setTimeout(() => {
          autoPopulateUnitPrice();
        }, 100);
      }
    }

    if (field === 'rental_type') {
      setSelectedQuickDuration(null);
      
      const today = getMoroccoTodayString();
      const currentTime = new Date().toTimeString().slice(0, 5);
      
      let startDateToUse = newFormData.rental_start_date || today;
      if (startDateToUse && startDateToUse.includes('T')) {
        startDateToUse = startDateToUse.split('T')[0];
      }

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
          newFormData.rental_end_time = endTime.toTimeString().slice(0, 5);
        }
      } else if (value === 'daily') {
        const tomorrowStr = getMoroccoDateOffset(1, startDateToUse);
        newFormData.rental_start_date = startDateToUse;
        newFormData.rental_end_date = tomorrowStr;
        newFormData.rental_start_time = currentTime;
        
        const startDateTime = composeDateTime(startDateToUse, currentTime);
        if (startDateTime) {
          const endDateTime = new Date(startDateTime.getTime() + (24 * 60 * 60 * 1000));
          newFormData.rental_end_time = endDateTime.toTimeString().slice(0, 5);
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
        const nextDay = getMoroccoDateOffset(1, dateValue);
        newFormData.rental_end_date = nextDay;
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

      if (value.length >= 2) {
        const customerData = getAggregatedCustomerData();
        const trimmedName = value.trim().toLowerCase();
        const filteredSuggestions = customerData.filter(suggestion => 
          suggestion.name.trim().toLowerCase().includes(trimmedName)
        );
        setSuggestions(filteredSuggestions);
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
      if (newFormData.vehicle_id && newFormData.rental_type) {
        await autoPopulateUnitPrice();
      }
    }
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
        customer_licence_number: customerData.licence_number || suggestion.licence_number || '',
        customer_id: customerData.id || suggestion.id,
        customer_id_number: customerData.id_number || '',
        customer_dob: customerData.date_of_birth || '',
        customer_place_of_birth: customerData.place_of_birth || '',
        customer_nationality: customerData.nationality || '',
        customer_issue_date: customerData.issue_date || customerData.licence_issue_date || '',
        customer_id_image: customerData.id_scan_url || customerData.customer_id_image || null,
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
      
      toast.success(`✅ Customer "${customerData.full_name}" data loaded from database`);
      
    } catch (error) {
      setFormData(prev => ({
        ...prev,
        customer_name: suggestion.name,
        customer_email: !isEmailDirty ? suggestion.email || '' : prev.customer_email,
        customer_phone: !isPhoneDirty ? suggestion.phone || '' : prev.customer_phone,
        customer_licence_number: suggestion.licence_number || '',
        customer_id: suggestion.id || null,
      }));
      toast.info('⚠️ Using cached customer data');
    }
    
    setSuggestions([]);
  };

  const handleFileUpload = async (field, fileOrUrl) => {
    if (!fileOrUrl) return;
    
    if (typeof fileOrUrl === 'string') {
      setFormData(prev => ({ ...prev, [field]: fileOrUrl }));
      toast.success('ID image URL set!');
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
      toast.success('File uploaded successfully!');
    } catch (err) {
      toast.error('Failed to upload file');
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
        customer_id: customerData.id || customerData.customer_id,
        customer_licence_number: customerData.licence_number || customerData.document_number || prev.customer_licence_number,
        customer_id_number: customerData.id_number || customerData.document_number || prev.customer_id_number,
        customer_dob: customerData.date_of_birth || prev.customer_dob,
        customer_place_of_birth: customerData.place_of_birth || prev.customer_place_of_birth,
        customer_nationality: customerData.nationality || prev.customer_nationality,
        customer_issue_date: customerData.issue_date || customerData.licence_issue_date || prev.customer_issue_date,
        customer_id_image: customerData.customer_id_image || customerData.id_scan_url || image || prev.customer_id_image
      }));
      
      setIsEmailDirty(false);
      setIsPhoneDirty(false);
      
      const populatedFields = [];
      if (customerData.full_name) populatedFields.push('Name');
      if (customerData.date_of_birth) populatedFields.push('Date of Birth');
      if (customerData.nationality) populatedFields.push('Nationality');
      if (customerData.place_of_birth) populatedFields.push('Place of Birth');
      
      toast.success(`✅ ID scan completed! Populated: ${populatedFields.join(', ')}`);
      setSuccess('✅ Customer information updated from ID scan!');
      
    } catch (error) {
      toast.error('Failed to populate customer data from scan');
    }
  };

  const handleIDScanComplete = async (scannedData, imageFile) => {
    try {
      let savedCustomer = null;
      try {
        savedCustomer = await saveCustomerFromScan(scannedData, imageFile);
      } catch (saveError) {
      }

      setIsEmailDirty(false);
      setIsPhoneDirty(false);
      isProgrammaticChange.current = true;
      
      setFormData(prev => {
        const newState = {
          ...prev,
          customer_name: scannedData.fullName || scannedData.full_name || scannedData.name || scannedData.customer_name || scannedData.raw_name || prev.customer_name,
          customer_email: scannedData.email || scannedData.customer_email || prev.customer_email,
          customer_phone: scannedData.phone || scannedData.customer_phone || prev.customer_phone,
          customer_licence_number: scannedData.idNumber || scannedData.document_number || scannedData.licence_number || scannedData.license_number || scannedData.customer_licence_number || prev.customer_licence_number,
          customer_id_number: scannedData.idNumber || scannedData.id_number || scannedData.customer_id_number || scannedData.document_number || prev.customer_id_number,
          customer_dob: scannedData.dateOfBirth || scannedData.date_of_birth || scannedData.dob || scannedData.customer_dob || prev.customer_dob,
          customer_place_of_birth: scannedData.placeOfBirth || scannedData.place_of_birth || scannedData.customer_place_of_birth || prev.customer_place_of_birth,
          customer_nationality: scannedData.nationality || scannedData.customer_nationality || prev.customer_nationality,
          customer_issue_date: scannedData.issueDate || scannedData.issue_date || scannedData.customer_issue_date || prev.customer_issue_date,
          customer_id_image: scannedData.imageUrl || scannedData.id_scan_url || scannedData.publicUrl || imageFile || scannedData.customer_id_image || prev.customer_id_image,
          customer_id: scannedData.customer_id || prev.customer_id,
        };
        
        return newState;
      });
      
      const customerName = scannedData.full_name || scannedData.name || scannedData.customer_name || 'Customer';
      toast.success(`✅ Primary customer "${customerName}" data updated from scan`);
      
    } catch (error) {
      toast.error(`Failed to process ID scan: ${error.message}`);
    }
  };

  const validateStep = async (step) => {
    const newErrors = {};
    
    if (step === 1) {
      if (!formData.customer_name.trim()) newErrors.customer_name = 'Customer name is required';
      
      const phoneValue = formData.customer_phone || '';
      if (!phoneValue.trim()) {
        newErrors.customer_phone = 'Phone number is required';
      } else {
        const cleanedPhone = phoneValue.replace(/[^\d+]/g, '');
        if (!cleanedPhone.startsWith('+')) {
          newErrors.customer_phone = 'Phone number must include country code (e.g., +212)';
        } else if (cleanedPhone.length < 8) {
          newErrors.customer_phone = 'Please enter a valid phone number';
        }
      }
      
      if (formData.customer_email && formData.customer_email.trim()) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(formData.customer_email.trim())) {
          newErrors.customer_email = 'Please enter a valid email address';
        }
      }
      
      if (!formData.customer_licence_number?.trim()) {
        newErrors.customer_licence_number = 'Driver\'s license number is required';
      }
    } else if (step === 2) {
      if (!formData.vehicle_id) {
        newErrors.vehicle_id = 'Vehicle selection is required';
      } else {
        const vehicleIdStr = formData.vehicle_id;
        if (!vehicleIdStr) {
          newErrors.vehicle_id = 'Please select a valid vehicle';
        }
      }
      
      if (!formData.rental_start_date) newErrors.rental_start_date = 'Start date is required';
      if (!formData.rental_end_date) newErrors.rental_end_date = 'End date is required';
      
      if (formData.rental_start_date && formData.rental_end_date) {
        const start = composeDateTime(formData.rental_start_date, formData.rental_start_time);
        const end = composeDateTime(formData.rental_end_date, formData.rental_end_time);
        if (start && end && start >= end) {
          newErrors.rental_end_date = 'End date must be after start date';
        }
      }

      if (formData.second_driver_name && !formData.second_driver_id_image) {
        newErrors.second_driver_id_image = 'ID scan required for second driver';
        toast.error('Please scan or upload ID for second driver');
      }
      
      if (formData.second_driver_name && formData.customer_name) {
        const primaryName = formData.customer_name.toLowerCase().trim();
        const secondName = formData.second_driver_name.toLowerCase().trim();
        
        if (primaryName === secondName) {
          newErrors.second_driver_name = 'Second driver cannot be the same as primary driver';
        }
        
        if (formData.customer_licence_number && formData.second_driver_license && 
            formData.customer_licence_number.trim() === formData.second_driver_license.trim()) {
          newErrors.second_driver_license = 'License number cannot be same as primary driver';
        }
        
        if (formData.customer_id_number && formData.second_driver_id_number && 
            formData.customer_id_number.trim() === formData.second_driver_id_number.trim()) {
          newErrors.second_driver_id_number = 'ID number cannot be same as primary driver';
        }
      }
    } else if (step === 3) {
      if (!formData.unit_price || formData.unit_price <= 0) newErrors.unit_price = 'Unit price is required';
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
    
    setIsSubmitting(true);
    setSubmitting(true);
    setErrors({});
    
    try {
      const submissionReadyFormData = { ...formData };

      if (!submissionReadyFormData.rental_start_date || !submissionReadyFormData.rental_end_date) {
        throw new Error('Please set both start and end dates in Step 2');
      }

      if (!submissionReadyFormData.rental_end_date && submissionReadyFormData.rental_start_date) {
        submissionReadyFormData.rental_end_date = submissionReadyFormData.rental_start_date;
      }

      const currentTime = new Date().toTimeString().slice(0, 5);
      
      if (!submissionReadyFormData.rental_start_time) {
        submissionReadyFormData.rental_start_time = currentTime;
      }
      if (!submissionReadyFormData.rental_end_time) {
        submissionReadyFormData.rental_end_time = currentTime;
      }

      if (!submissionReadyFormData.customer_name || !submissionReadyFormData.customer_phone || 
          !submissionReadyFormData.vehicle_id || !submissionReadyFormData.rental_start_date || 
          !submissionReadyFormData.rental_end_date) {
        throw new Error('Please fill in all required fields');
      }

      const vehicleIdStr = submissionReadyFormData.vehicle_id;
      if (!vehicleIdStr) {
        throw new Error('Please select a valid vehicle');
      }

      const trimmedEmail = (submissionReadyFormData.customer_email || '').trim();
      const emailToSubmit = trimmedEmail.length > 0 ? trimmedEmail : null;

      if (trimmedEmail.length > 0) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(trimmedEmail)) {
          throw new Error('Please enter a valid email address or leave the email field empty.');
        }
      }

      let finalCustomerId = submissionReadyFormData.customer_id;
      const findExistingCustomerForSubmission = async () => {
        const customerTable = supabase.from('app_4c3a7a6153_customers');
        const licenceNumber = submissionReadyFormData.customer_licence_number?.trim();
        const idNumber = submissionReadyFormData.customer_id_number?.trim();
        const phoneNumber = submissionReadyFormData.customer_phone?.trim();
        const customerName = submissionReadyFormData.customer_name?.trim();

        if (licenceNumber) {
          const { data } = await customerTable
            .select('id')
            .eq('licence_number', licenceNumber)
            .limit(1);
          if (data?.[0]?.id) return data[0];
        }

        if (idNumber) {
          const { data } = await customerTable
            .select('id')
            .eq('id_number', idNumber)
            .limit(1);
          if (data?.[0]?.id) return data[0];
        }

        if (phoneNumber) {
          const { data } = await customerTable
            .select('id')
            .eq('phone', phoneNumber)
            .limit(1);
          if (data?.[0]?.id) return data[0];
        }

        if (customerName) {
          const { data } = await customerTable
            .select('id')
            .ilike('full_name', customerName)
            .limit(1);
          if (data?.[0]?.id) return data[0];
        }

        return null;
      };
      
      if (!finalCustomerId) {
        const newCustomerId = generateCustomerId();
        const newCustomerData = {
          id: newCustomerId,
          full_name: submissionReadyFormData.customer_name,
          phone: submissionReadyFormData.customer_phone,
          email: emailToSubmit,
          licence_number: submissionReadyFormData.customer_licence_number || null,
          id_number: submissionReadyFormData.customer_id_number || null,
          date_of_birth: submissionReadyFormData.customer_dob || null,
          nationality: submissionReadyFormData.customer_nationality || null,
          place_of_birth: submissionReadyFormData.customer_place_of_birth || null,
          id_scan_url: submissionReadyFormData.customer_id_image || null,
          extra_images: (formData.customer_uploaded_images || [])
            .map(img => img.url)
            .filter(url => url && url.trim() !== ''),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };
        
        const { data: insertedCustomer, error: insertError } = await supabase
          .from('app_4c3a7a6153_customers')
          .insert([newCustomerData])
          .select()
          .single();
        
        if (insertError) {
          const existingCustomer = await findExistingCustomerForSubmission();
          
          if (existingCustomer?.id) {
            finalCustomerId = existingCustomer.id;
          } else {
            throw new Error(`Failed to create new customer: ${insertError.message}`);
          }
        } else {
          finalCustomerId = insertedCustomer.id;
        }
      } else {
        const { data: existingCustomer, error: checkError } = await supabase
          .from('app_4c3a7a6153_customers')
          .select('id')
          .eq('id', finalCustomerId)
          .single();

        if (checkError || !existingCustomer) {
          // Customer ID was pre-generated (e.g. from ID scan) but not yet saved — create it now
          const { data: createdCustomer, error: createError } = await supabase
            .from('app_4c3a7a6153_customers')
            .insert([{
              id: finalCustomerId,
              full_name: submissionReadyFormData.customer_name,
              phone: submissionReadyFormData.customer_phone,
              email: emailToSubmit,
              licence_number: submissionReadyFormData.customer_licence_number || null,
              id_number: submissionReadyFormData.customer_id_number || null,
              date_of_birth: submissionReadyFormData.customer_dob || null,
              nationality: submissionReadyFormData.customer_nationality || null,
              place_of_birth: submissionReadyFormData.customer_place_of_birth || null,
              id_scan_url: submissionReadyFormData.customer_id_image || null,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            }])
            .select()
            .single();

          if (createError || !createdCustomer) {
            const existingCustomer = await findExistingCustomerForSubmission();
            if (existingCustomer?.id) {
              finalCustomerId = existingCustomer.id;
            } else {
              throw new Error(`Failed to create customer: ${createError?.message || 'Unknown error'}`);
            }
          } else {
            finalCustomerId = createdCustomer.id;
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
      
      const submissionData = {
        customer_name: submissionReadyFormData.customer_name,
        customer_email: emailToSubmit,
        customer_phone: submissionReadyFormData.customer_phone,
        customer_id: finalCustomerId,
        customer_licence_number: submissionReadyFormData.customer_licence_number || null,
        vehicle_id: submissionReadyFormData.vehicle_id || null,
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
        unit_price: Number(submissionReadyFormData.unit_price) || 0,
        transport_fee: Number(submissionReadyFormData.transport_fee) || 0,
        total_amount: Number(submissionReadyFormData.total_amount) || 0,
        deposit_amount: Number(submissionReadyFormData.deposit_amount) || 0,
        damage_deposit: Number(submissionReadyFormData.damage_deposit) || 0,
        damage_deposit_source: submissionReadyFormData.damage_deposit_source || null,
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
        fuel_charge: fuelChargeAmount,
        // ✅ CRITICAL FIX: Add package_id to the submission data
        package_id: submissionReadyFormData.selected_package_id || null,
        package_name: submissionReadyFormData.selected_package_name || null,
        package_rate_per_unit: submissionReadyFormData.selected_package_rate_per_unit || 0,
        package_included_km_per_unit: submissionReadyFormData.selected_package_included_km_per_unit || null,
        package_total_included_km: submissionReadyFormData.selected_package_total_included_km || null,
        package_extra_rate: submissionReadyFormData.selected_package_extra_rate || 0,
        use_package_pricing: submissionReadyFormData.use_package_pricing || false,
      };
      
      console.log('📦 Submitting rental with package:', {
        package_id: submissionData.package_id,
        selected_package_id: submissionReadyFormData.selected_package_id,
        package_name: submissionReadyFormData.selected_package_name,
        unit_price: submissionData.unit_price,
        quantity_days: submissionData.quantity_days
      });
      
      const manualPrice = parseFloat(submissionData.unit_price) || 0;
      const autoPrice = parseFloat(autoCalculatedPrice) || 0;
      const isPriceOverride = manualPrice !== autoPrice;
      const canAutoApprovePrice = canEditRentalPrice(userProfile);

      if (isPriceOverride) {
        if (!canAutoApprovePrice) {
          const originalSubtotal = (submissionData.quantity_days || 0) * autoPrice;
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
        result = await TransactionalRentalService.createRentalWithTransaction(cleanRentalData);
      }
      
      if (result && result.success) {
        setSuccessfullySubmitted(true);
        setErrors({});
        
        const rentalId = result.data.id;
        
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
            toast.success(`✅ Saved ${successful} second driver(s)`);
          } else if (successful > 0) {
            toast.warning(`⚠️ Saved ${successful} second driver(s), ${failed} failed`);
          } else {
            toast.error(`❌ Failed to save second drivers`);
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
              extra_images: submissionReadyFormData.second_driver_uploaded_images || [],
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
              toast.success(`📱 WhatsApp notifications sent to ${notificationCount} admin(s)`);
            } else {
              toast.info('⚠️ No admins with WhatsApp enabled found. Approval request saved.');
            }
          } catch (whatsappError) {
            toast.warning('⚠️ Approval request saved, but WhatsApp notifications failed');
          }
        }
        
        toast.success(successMsg);
        
        return { result: result.data, rentalId: result.data.id };
      } else {
        throw new Error(result?.error || 'Unknown rental service error.');
      }
      
    } catch (err) {
      const errorMessage = err.message || 'An unexpected error occurred';
      
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
              const adjustedEndTime = adjustedEndDatetime.toTimeString().slice(0, 5);
              
              setFormData(prev => ({
                ...prev,
                rental_end_date: adjustedEndDate,
                rental_end_time: adjustedEndTime,
              }));
              return;
            }
          } else {
            if (startDatetime >= endDatetime) {
              let newStartDatetime = new Date(endDatetime);
              
              if (formData.rental_type === 'hourly') {
                newStartDatetime.setHours(newStartDatetime.getHours() - 1);
              } else {
                newStartDatetime.setDate(newStartDatetime.getDate() - 1);
              }

              const newStartDate = formatDateToYYYYMMDD(newStartDatetime);
              const newStartTime = newStartDatetime.toTimeString().slice(0, 5);

              if (formData.rental_start_date !== newStartDate || formData.rental_start_time !== newStartTime) {
                setFormData(prev => ({
                  ...prev,
                  rental_start_date: newStartDate,
                  rental_start_time: newStartTime,
                }));
                setDateError("Start time was automatically adjusted to be before the end time.");
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
    formData.vehicle_id
  ]);

  useEffect(() => {
    calculateTransportFee();
  }, [formData.pickup_transport, formData.dropoff_transport, transportFees]);

  useEffect(() => {
    calculateFinancials();
  }, [formData.quantity_days, formData.unit_price, formData.transport_fee, formData.deposit_amount]);

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
    // 🚨 Don't auto-populate if package pricing is active
    if (formData.use_package_pricing) {
      console.log('📦 Package pricing active, skipping auto-populate effect');
      return;
    }

    if (formData.vehicle_id && formData.rental_type && formData.quantity_days > 0) {
      setTimeout(() => {
        autoPopulateUnitPrice();
      }, 50);
    } else {
      if (!formData.vehicle_id) {
        setFormData(prev => ({ ...prev, unit_price: 0 }));
        setAutoCalculatedPrice(0);
      }
    }
  }, [formData.vehicle_id, formData.rental_type, formData.quantity_days, formData.use_package_pricing]);

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

  setFuelChargeEnabled(formData.rental_type === 'daily');
}, [formData.rental_type]);

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
        query = query.eq('rate_type_id', 1); // Hourly = id 1
      } else if (rentalType === 'daily') {
        query = query.eq('rate_type_id', 2); // Daily = id 2
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
      if (formData.vehicle_id && formData.rental_type) {
        const vehicle = availableVehicles.find(v => v.id == formData.vehicle_id);
        if (vehicle?.vehicle_model_id) {
          console.log(`🔍 Vehicle selected: ${vehicle.id}, model ID: ${vehicle.vehicle_model_id}`);
          
          // Fetch packages for this specific model
          const packages = await fetchKMPackages(vehicle.vehicle_model_id, formData.rental_type);
          // Reload fuel pricing for new vehicle model
          await loadFuelChargeSettings(vehicle.vehicle_model_id, formData.rental_type);
          
          // Set packages for this specific vehicle model only
          setAvailablePackages(packages);
          
          console.log(`📦 Setting available packages for model ${vehicle.vehicle_model_id}:`, 
            packages.map(p => ({ id: p.id, name: p.name }))
          );
          
          // If the currently selected package doesn't belong to this vehicle, clear it
          if (formData.selected_package_id) {
            const selectedPackageStillValid = packages.some(p => p.id === formData.selected_package_id);
            if (!selectedPackageStillValid) {
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
                selected_package_description: '',
                use_package_pricing: false,
                package_overrides_tier: false
              }));
            }
          }
        } else {
          console.log('⚠️ No vehicle_model_id found for selected vehicle');
          setAvailablePackages([]);
        }
      } else {
        setAvailablePackages([]);
      }
    };
    
    if (formData.vehicle_id && formData.rental_type) {
      loadPackagesForSelectedVehicle();
    } else {
      setAvailablePackages([]);
    }
  }, [formData.vehicle_id, formData.rental_type]);

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
    errors,
    success,
    setSuccess,
    dateError,
    vehicleModels,
    availableVehicles,
    availablePackages,
    setAvailablePackages,
    calculatePackagePrice,
    transportFees,
    availabilityStatus,
    autoCalculatedPrice,
    customers,
    rentals,
    suggestions,
    mode,
    selectedQuickDuration,
    damageDepositConfig,
    selectedDepositTab,
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
    handlePaymentStatusTabClick,
    handleDepositTabClick,
    validateStep,
    handleSubmit,
    handleReset,
    getEnabledPresetsForVehicle,
    composeDateTime,
    calculateQuantityAndPricing,
    calculateFinancials,
    customerSearchRef,
    getAggregatedCustomerData,
    fuelChargeEnabled,
    setFuelChargeEnabled,
    fuelChargeAmount,
    loadFuelChargeSettings,
  };
};

// ==================== SIMPLIFIED UI COMPONENTS ====================

const ProgressStepper = ({ currentStep, steps }) => (
  <div className="mb-6 sm:mb-8 px-2 sm:px-0">
    <div className="flex items-center justify-between">
      {steps.map((step, index) => (
        <React.Fragment key={step.number}>
          <div className="flex flex-col items-center flex-1 relative">
            <div className={`w-11 h-11 sm:w-8 sm:h-8 rounded-full flex items-center justify-center text-sm sm:text-xs font-semibold z-10 transition-all active:scale-95 ${
              currentStep > step.number
                ? 'bg-green-500 text-white shadow-md'
                : currentStep === step.number
                ? 'bg-blue-600 text-white ring-2 ring-blue-300 shadow-lg'
                : 'bg-gray-200 text-gray-500'
            }`}>
              {currentStep > step.number ? (
                <Check className="w-5 h-5 sm:w-4 sm:h-4" />
              ) : (
                step.number
              )}
            </div>
            <span className={`text-xs mt-2 sm:mt-1 text-center font-medium truncate max-w-[70px] sm:max-w-none ${
              currentStep >= step.number ? 'text-gray-900' : 'text-gray-400'
            }`}>
              {step.title}
            </span>
          </div>
          {index < steps.length - 1 && (
            <div className={`flex-1 h-1 sm:h-0.5 mx-1 sm:mx-2 transition-all rounded-full ${
              currentStep > step.number ? 'bg-green-500' : 'bg-gray-200'
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
  selectedQuickDuration 
}) => {
  const [isDatesCollapsed, setIsDatesCollapsed] = useState(true);
  
  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden mb-4">
      <button
        type="button"
        onClick={() => setIsDatesCollapsed(!isDatesCollapsed)}
        className="w-full px-4 py-4 sm:py-3 bg-gray-50 flex items-center justify-between hover:bg-gray-100 active:bg-gray-200 transition-colors touch-manipulation"
      >
        <div className="flex items-center gap-3">
          <CalendarDays className="w-5 h-5 text-gray-600" />
          <div className="text-left">
            <span className="font-medium text-gray-900 text-base sm:text-sm block">
              Dates & Times
            </span>
            <span className="text-xs text-gray-500 mt-0.5 block">
              {formData.rental_start_date && formData.rental_end_date 
                ? `${formData.rental_start_date} ${formData.rental_start_time || ''} → ${formData.rental_end_date} ${formData.rental_end_time || ''}`
                : 'Set rental period'
              }
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
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => handleQuickHourSelect(1)}
                  className="text-xs px-2 py-1 bg-blue-50 text-blue-700 rounded hover:bg-blue-100 transition-colors"
                >
                  1h
                </button>
                <button
                  type="button"
                  onClick={() => handleQuickDaySelect(1)}
                  className="text-xs px-2 py-1 bg-green-50 text-green-700 rounded hover:bg-green-100 transition-colors"
                >
                  1d
                </button>
              </div>
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
                <label className="block text-xs font-medium text-gray-500">Start Time</label>
                <input
                  type="time"
                  value={formData.rental_start_time}
                  onChange={(e) => handleInputChange('rental_start_time', e.target.value)}
                  disabled={successfullySubmitted}
                  className={`w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 text-sm ${successfullySubmitted ? 'opacity-50 cursor-not-allowed' : ''}`}
                />
              </div>
              
              <div className="space-y-1">
                <label className="block text-xs font-medium text-gray-500">End Date *</label>
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
                <label className="block text-xs font-medium text-gray-500">End Time</label>
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
                <span className="text-xs text-gray-500">Duration:</span>
                <span className="text-xs font-semibold text-blue-700">
                  {formData.quantity_days} {formData.rental_type === 'hourly' ? 'hour(s)' : 'day(s)'}
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
  
  const filteredVehicles = vehicles.filter(vehicle => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    return (
      (vehicle.plate_number && vehicle.plate_number.toLowerCase().includes(query)) ||
      (vehicle.name && vehicle.name.toLowerCase().includes(query)) ||
      (vehicle.model && vehicle.model.toLowerCase().includes(query))
    );
  });
  
  const displayedVehicles = isMobile ? filteredVehicles.slice(0, 6) : filteredVehicles;
  
  return (
    <div className="w-full">
      {showSearchBar && vehicles.length > 0 && (
        <div className="mb-4">
          <div className="relative">
            <UserSearch className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search by plate number..."
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
              {filteredVehicles.length} of {vehicles.length} vehicles
              {searchQuery && ` matching "${searchQuery}"`}
            </span>
          </div>
        </div>
      )}
      
      <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
        {displayedVehicles.map((vehicle) => {
          const isSelected = selectedId === vehicle.id || selectedId == vehicle.id;
          
          return (
            <div
              key={vehicle.id}
              onClick={() => onSelect(vehicle.id)}
              className={`relative cursor-pointer transition-all rounded-xl border-2 p-4 ${
                isSelected
                  ? 'border-green-500 bg-green-50 ring-2 ring-green-200 shadow-md'
                  : 'border-gray-200 hover:border-gray-300 bg-white hover:shadow-sm'
              } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              {/* Header with Plate and Status */}
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${isSelected ? 'bg-green-100' : 'bg-gray-100'}`}>
                    <CarIcon className={`w-5 h-5 ${isSelected ? 'text-green-600' : 'text-gray-600'}`} />
                  </div>
                  <div>
                    <div className="text-xs text-gray-500">Plate</div>
                    <div className="text-lg font-bold text-gray-900">
                      {vehicle.plate_number || 'N/A'}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                    vehicle.status === 'available'
                      ? 'bg-green-100 text-green-800'
                      : 'bg-red-100 text-red-800'
                  }`}>
                    {vehicle.status === 'available' ? '✓ Available' : '✗ Unavailable'}
                  </span>
                  {isSelected && (
                    <div className="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center">
                      <Check className="w-4 h-4 text-white" />
                    </div>
                  )}
                </div>
              </div>

              {/* Model Info */}
              <div className="mb-3">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-medium text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full">
                    MODEL
                  </span>
                  <span className="text-xs text-gray-500">{duration} {duration > 1 ? (rentalType === 'hourly' ? 'hrs' : 'days') : (rentalType === 'hourly' ? 'hr' : 'day')}</span>
                </div>
                <h4 className="font-semibold text-gray-900">{vehicle.name}</h4>
                <p className="text-sm text-gray-600">{vehicle.model}</p>
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
            <span className="text-base font-medium">Load more vehicles</span>
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
        
        toast.success(`✅ ${uploadedImages.length} image(s) uploaded successfully!`);
        
      } catch (error) {
        toast.error(`Failed to upload files: ${error.message}`);
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
          toast.error('Failed to remove file from storage');
          return;
        }
      }
      
      const newImages = [...images];
      newImages.splice(index, 1);
      onImagesChange(newImages);
      
      toast.success('Image removed successfully');
      
    } catch (error) {
      toast.error('Failed to remove image');
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

const PriceCalculator = ({ formData, onPriceChange, autoCalculatedPrice, userProfile, disabled,fuelChargeEnabled,fuelChargeAmount}) => {
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [isEditingPrice, setIsEditingPrice] = useState(false);
  const [tempUnitPrice, setTempUnitPrice] = useState(formData.unit_price);

  const userRole = userProfile?.role || 'unknown';
  const isStaff = userRole === 'employee' || userRole === 'guide';
  const isAdminOrOwner = userRole === 'admin' || userRole === 'owner';
  const hasDirectPriceOverridePermission = canEditRentalPrice(userProfile);
  const canEditPrice = isAdminOrOwner || isStaff;
  const requiresApproval = canEditPrice && !hasDirectPriceOverridePermission;

  const manualPrice = parseFloat(formData.unit_price) || 0;
  const autoPrice = parseFloat(autoCalculatedPrice) || 0;
  const isPriceOverride = !formData.use_package_pricing && manualPrice !== autoPrice && autoPrice > 0;

  const calculateBreakdown = () => {
    const rentalCost = (formData.quantity_days || 0) * (formData.unit_price || 0);
    const transportCost = formData.transport_fee || 0;
    const fuelCharge = fuelChargeEnabled ? fuelChargeAmount : 0;
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

  const handleEditClick = () => {
    setTempUnitPrice(formData.unit_price);
    setIsEditingPrice(true);
  };

  const handleSavePrice = () => {
    const newPrice = parseFloat(tempUnitPrice);
    if (!isNaN(newPrice) && newPrice > 0) {
      onPriceChange('unit_price', newPrice);
      setIsEditingPrice(false);
      
      if (!formData.use_package_pricing && newPrice !== autoPrice) {
        if (requiresApproval) {
          toast.info('⏳ Price override will require admin approval');
        } else {
          toast.success('✅ Price updated (auto-approved)');
        }
      }
    } else {
      toast.error('Please enter a valid price');
    }
  };

  const handleCancelEdit = () => {
    setTempUnitPrice(formData.unit_price);
    setIsEditingPrice(false);
  };

  const handleResetToAuto = () => {
    onPriceChange('unit_price', autoPrice);
    setTempUnitPrice(autoPrice);
    setIsEditingPrice(false);
    toast.success('✅ Price reset to system rate');
  };

  return (
    <div className="bg-gray-50 rounded-xl p-4 sm:p-5 border-2 border-gray-200">
      <div className="flex items-center justify-between mb-4 gap-2">
        <h3 className="font-semibold text-gray-900 text-base sm:text-lg">Price Summary</h3>
        <button
          type="button"
          onClick={() => setShowBreakdown(!showBreakdown)}
          className="text-sm text-blue-600 hover:text-blue-800 active:text-blue-900 px-3 py-2 -mr-2 touch-manipulation"
        >
          {showBreakdown ? 'Hide Details' : 'Show Details'}
        </button>
      </div>
      
      <div className="space-y-3">
        <div className="bg-white rounded-lg p-3 border border-gray-200">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-700">
              {formData.use_package_pricing ? 'Package Rate' : `Unit Price (${formData.rental_type || 'N/A'}):`}
            </span>
            {!formData.use_package_pricing && canEditPrice && !disabled && !isEditingPrice && (
              <button
                type="button"
                onClick={handleEditClick}
                className="flex items-center gap-1 px-2 py-1 text-xs bg-blue-50 text-blue-600 rounded hover:bg-blue-100 transition-colors"
              >
                <Edit2 className="w-3 h-3" />
                Edit
              </button>
            )}
          </div>

          {!formData.use_package_pricing && !canEditPrice && !disabled && (
            <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              You do not have permission to change the rental price. Ask an admin or owner to enable it in User Management.
            </div>
          )}
          
          {isEditingPrice ? (
            <div className="space-y-2">
              <input
                type="number"
                value={tempUnitPrice}
                onChange={(e) => setTempUnitPrice(e.target.value)}
                className="w-full px-3 py-2 border border-blue-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                min="0"
                step="0.01"
                autoFocus
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleSavePrice}
                  className="flex-1 px-3 py-1.5 bg-green-600 text-white text-sm rounded hover:bg-green-700 transition-colors flex items-center justify-center gap-1"
                >
                  <Save className="w-3 h-3" />
                  Save
                </button>
                <button
                  type="button"
                  onClick={handleCancelEdit}
                  className="flex-1 px-3 py-1.5 bg-gray-200 text-gray-700 text-sm rounded hover:bg-gray-300 transition-colors"
                >
                  Cancel
                </button>
              </div>
              {isPriceOverride && (
                <button
                  type="button"
                  onClick={handleResetToAuto}
                  className="w-full px-3 py-1.5 bg-orange-50 text-orange-600 text-xs rounded hover:bg-orange-100 transition-colors flex items-center justify-center gap-1"
                >
                  <Calculator className="w-3 h-3" />
                  Reset to System Rate ({autoPrice.toFixed(2)} MAD)
                </button>
              )}
            </div>
          ) : (
            <div>
              <div className="flex items-center justify-between">
                <span className="text-lg font-bold text-gray-900">
                  {formData.unit_price.toFixed(2)} MAD
                  {formData.use_package_pricing && (
                    <span className="ml-2 text-xs font-normal text-purple-600">
                      per {formData.rental_type === 'hourly' ? 'hour' : 'day'}
                    </span>
                  )}
                </span>
                {formData.use_package_pricing && (
                  <span className="flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-purple-100 text-purple-700">
                    <Package className="w-3 h-3" />
                    Package
                  </span>
                )}
                {!formData.use_package_pricing && isPriceOverride && (
                  <span className="flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-orange-100 text-orange-700">
                    <AlertCircle className="w-3 h-3" />
                    Override
                  </span>
                )}
              </div>
              
              {formData.use_package_pricing && (
                <div className="mt-2 p-2 bg-purple-50 rounded border border-purple-200">
                  <div className="flex items-start gap-2">
                    <Package className="w-4 h-4 text-purple-600 mt-0.5 flex-shrink-0" />
                    <div className="text-xs text-purple-800">
                      <p className="font-medium">{formData.selected_package_name}</p>
                      <p className="mt-1">
                        Rate: {formData.unit_price?.toFixed(2)} MAD per {formData.rental_type === 'hourly' ? 'hour' : 'day'}
                      </p>
                      <p className="mt-1">
                        Total: {(formData.unit_price * formData.quantity_days).toFixed(2)} MAD for {formData.quantity_days} {formData.quantity_days > 1 ? (formData.rental_type === 'hourly' ? 'hours' : 'days') : (formData.rental_type === 'hourly' ? 'hour' : 'day')}
                      </p>
                    </div>
                  </div>
                </div>
              )}
              
              {!formData.use_package_pricing && isPriceOverride && (
                <div className="mt-2 p-2 bg-orange-50 rounded border border-orange-200">
                  <div className="flex items-start gap-2">
                    <Info className="w-4 h-4 text-orange-600 mt-0.5 flex-shrink-0" />
                    <div className="text-xs text-orange-800">
                      <p className="font-medium">Price Override Detected</p>
                      <p className="mt-1">System rate: {autoPrice.toFixed(2)} MAD</p>
                      <p className="mt-1">
                        {requiresApproval ? '⏳ Requires admin approval' : '✅ Override allowed'}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-col sm:flex-row sm:justify-between gap-1 sm:gap-0 py-2 border-b border-gray-200">
          <span className="text-gray-600 text-sm">Rental Cost:</span>
          <div className="text-right sm:text-right">
            <span className="font-medium text-gray-900">
              {breakdown.rentalCost.toFixed(2)} MAD
            </span>
            <div className="text-xs text-gray-500">
              {formData.quantity_days} × {formData.unit_price.toFixed(2)}
            </div>
          </div>
        </div>
        
        <div className="flex justify-between items-center py-2 border-b border-gray-200">
          <span className="text-gray-600 text-sm">Transport:</span>
          <span className="font-medium text-gray-900">{breakdown.transportCost.toFixed(2)} MAD</span>
        </div>
        {/* Fuel Charge */}
<div className="flex justify-between items-center py-2 border-b border-gray-200">
  <span className="text-gray-600 text-sm">Fuel Charge:</span>
  <span className="font-medium text-gray-900">{breakdown.fuelCharge.toFixed(2)} MAD</span>
</div>
        
        <div className="pt-3 mt-1">
          <div className="flex justify-between items-center">
            <span className="text-base sm:text-lg font-bold text-gray-900">Total:</span>
            <span className="text-xl sm:text-2xl font-bold text-blue-600">{breakdown.total.toFixed(2)} MAD</span>
          </div>
        </div>
        
        {showBreakdown && (
          <div className="mt-4 pt-4 border-t space-y-2">
            <div className="flex justify-between">
              <span className="text-gray-600">Deposit Paid:</span>
              <span className="font-medium">{breakdown.deposit.toFixed(2)} MAD</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Remaining:</span>
              <span className={`font-medium ${
                breakdown.remaining === 0 ? 'text-green-600' : 'text-red-600'
              }`}>
                {breakdown.remaining.toFixed(2)} MAD
              </span>
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
  selectedTab, 
  customAmount,
  onTabClick,
  onCustomAmountChange,
  disabled 
}) => {
  const tabs = [
    ...enabledPresets.map(preset => ({
      id: preset.label,
      label: preset.label,
      amount: preset.amount
    })),
    ...(allowCustomDeposit ? [{
      id: 'custom',
      label: 'Custom',
      amount: null
    }] : [])
  ];

  if (tabs.length === 0) {
    return (
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Damage Deposit (MAD)
        </label>
        <input
          type="number"
          value={formData.damage_deposit || ''}
          onChange={(e) => onCustomAmountChange(e.target.value)}
          disabled={disabled}
          className={`w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
          min="0"
          step="1"
          placeholder="Enter amount"
        />
      </div>
    );
  }

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-2">
        Damage Deposit Selection
      </label>
      
      <div className="flex gap-2 flex-wrap mb-3">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => onTabClick(tab.id, tab.amount)}
            disabled={disabled}
            className={`px-4 py-2 rounded-lg border-2 font-medium transition-all text-sm ${
              selectedTab === tab.id
                ? 'border-blue-500 bg-blue-50 text-blue-700 ring-2 ring-blue-200'
                : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50'
            } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            <div className="flex flex-col items-center">
              <span className="font-semibold">{tab.label}</span>
              {tab.amount !== null && (
                <span className="text-xs mt-0.5">{tab.amount.toLocaleString()} MAD</span>
              )}
            </div>
          </button>
        ))}
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
            className={`w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
            min="0"
            step="100"
            placeholder="Enter custom amount (e.g., 8500)"
          />
        </div>
      )}

      {selectedTab && selectedTab !== 'custom' && (
        <div className="mt-2 text-sm text-gray-600">
          Selected: <span className="font-medium text-gray-900">{formData.damage_deposit} MAD</span>
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
  const countryCodes = [
    { code: '+212', flag: '🇲🇦', name: 'Morocco', pattern: /^\+212\s?\d{9}$/, example: '+212 6XX XXX XXX', digits: 9 },
    { code: '+33', flag: '🇫🇷', name: 'France', pattern: /^\+33\s?\d{9}$/, example: '+33 1 XX XX XX XX', digits: 9 },
    { code: '+1', flag: '🇺🇸', name: 'USA/Canada', pattern: /^\+1\s?\d{10}$/, example: '+1 XXX XXX XXXX', digits: 10 },
    { code: '+44', flag: '🇬🇧', name: 'UK', pattern: /^\+44\s?\d{10}$/, example: '+44 7XXX XXX XXX', digits: 10 },
    { code: '+49', flag: '🇩🇪', name: 'Germany', pattern: /^\+49\s?\d{10,11}$/, example: '+49 1XX XXX XXXX', digits: 10 },
    { code: '+34', flag: '🇪🇸', name: 'Spain', pattern: /^\+34\s?\d{9}$/, example: '+34 6XX XXX XXX', digits: 9 },
    { code: '+39', flag: '🇮🇹', name: 'Italy', pattern: /^\+39\s?\d{9,10}$/, example: '+39 3XX XXX XXXX', digits: 9 },
    { code: '+90', flag: '🇹🇷', name: 'Turkey', pattern: /^\+90\s?\d{10}$/, example: '+90 5XX XXX XXXX', digits: 10 },
    { code: '+971', flag: '🇦🇪', name: 'UAE', pattern: /^\+971\s?\d{9}$/, example: '+971 5X XXX XXXX', digits: 9 },
    { code: '+966', flag: '🇸🇦', name: 'Saudi Arabia', pattern: /^\+966\s?\d{9}$/, example: '+966 5X XXX XXXX', digits: 9 },
    { code: '+216', flag: '🇹🇳', name: 'Tunisia', pattern: /^\+216\s?\d{8}$/, example: '+216 XX XXX XXX', digits: 8 },
    { code: '+20', flag: '🇪🇬', name: 'Egypt', pattern: /^\+20\s?\d{10}$/, example: '+20 1XX XXX XXXX', digits: 10 },
  ];

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
      <label className="block text-sm font-medium text-gray-700 mb-1">
        Phone *
      </label>
      <div className="flex">
        <div className="relative" ref={dropdownRef}>
          <button
            type="button"
            onClick={() => !disabled && setIsDropdownOpen(!isDropdownOpen)}
            disabled={disabled}
            className={`flex items-center gap-2 px-3 py-2 border border-r-0 border-gray-300 rounded-l-lg bg-gray-50 hover:bg-gray-100 transition-colors ${
              disabled ? 'opacity-50 cursor-not-allowed' : ''
            } ${displayError ? 'border-red-500' : ''}`}
          >
            <span className="text-lg">{selectedCountry.flag}</span>
            <span className="text-sm font-medium">{selectedCountry.code}</span>
            <ChevronDown className={`w-4 h-4 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`} />
          </button>

          {isDropdownOpen && !disabled && (
            <div className="absolute z-10 mt-1 w-64 bg-white border border-gray-300 rounded-lg shadow-lg max-h-80 overflow-hidden">
              <div className="p-2 border-b">
                <div className="relative">
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Search country..."
                    className="w-full px-3 py-2 pl-9 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                    autoFocus
                  />
                  <UserSearch className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
                </div>
              </div>

              <div className="overflow-y-auto max-h-64">
                {filteredCountries.map((country) => (
                  <button
                    key={country.code}
                    type="button"
                    onClick={() => handleCountryCodeChange(country.code)}
                    className="w-full px-4 py-3 text-left hover:bg-blue-50 flex items-center gap-3 border-b border-gray-100 last:border-b-0"
                  >
                    <span className="text-xl">{country.flag}</span>
                    <div className="flex-1 text-left">
                      <div className="font-medium text-gray-900">{country.name}</div>
                      <div className="text-sm text-gray-500">{country.code} ({country.digits} digits)</div>
                    </div>
                    {countryCode === country.code && (
                      <Check className="w-4 h-4 text-green-500" />
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex-1 relative">
          <Phone className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
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
            className={`w-full px-3 py-2 pl-10 border rounded-r-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
              displayError ? 'border-red-500' : 'border-gray-300 border-l-0'
            } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
          />
        </div>
      </div>
      
      <div className="mt-2 space-y-1">
        {displayError && (
          <div className="flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
            <p className="text-red-500 text-xs">{displayError}</p>
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
          <p className="text-gray-500 text-xs">
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
            basePrice = rentalType === 'hourly' ? 580 : 2000;
          } else if (vehicleModelUpper.includes('AT10')) {
            basePrice = rentalType === 'hourly' ? 1000 : 3500;
          } else if (vehicleModelUpper.includes('AT5')) {
            basePrice = rentalType === 'hourly' ? 380 : 1500;
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
            // The fixed_amount is the rate PER UNIT (per hour or per day)
            // Total = fixed_amount * duration
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
            fixedPackageAmount: packagePricePerUnit,
            packageIncludedKm,
            packageExtraRate
          });

          console.log(`📦 Package selected: ${packageName}, rate per ${rentalType === 'hourly' ? 'hour' : 'day'}: ${packagePricePerUnit} MAD, total for ${duration} ${rentalType === 'hourly' ? 'hours' : 'days'}: ${totalAmount} MAD`);
          return;
        }

        // Otherwise calculate tier pricing
        let tierPrice = basePrice;
        let tierName = 'Base rate';
        
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
              
              if (tierPrice < basePrice) {
                const discountPercent = Math.round(((basePrice - tierPrice) / basePrice) * 100);
                tierName = `${minHours}-${maxHours} hour tier (${discountPercent}% off)`;
              } else {
                tierName = `${minHours}-${maxHours} hour tier`;
              }
            }
          }
        }

        const total = tierPrice * duration;
        
        setPriceInfo({
          basePrice,
          tierPrice,
          total,
          loading: false,
          tierName,
          modelType: modelType || vehicle.model || '',
          isPackagePricing: false
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
          modelType: vehicleModel
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
            <span>Package: {priceInfo.packageName} &bull; {formatCurrency(priceInfo.tierPrice)} MAD &times; {duration} {duration > 1 ? (rentalType === 'hourly' ? 'hours' : 'days') : (rentalType === 'hourly' ? 'hour' : 'day')}</span>
          </div>
        )}
        {!isPackagePricing && isTierPricing && (
          <div className="mt-1 text-green-600 text-xs">
            <span>Save {formatCurrency((priceInfo.basePrice - priceInfo.tierPrice) * duration)}</span>
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
              {isPackagePricing ? 'Package rate:' : (rentalType === 'hourly' ? 'Hourly rate:' : 'Daily rate:')}
            </span>
            <div className="flex flex-wrap items-center gap-2 justify-end">
              {isPackagePricing && (
                <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">
                  Fixed rate package
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
                <span className="text-sm font-medium text-purple-700">Package Total:</span>
                <span className="text-lg font-bold text-purple-700">{formatCurrency(priceInfo.total)} MAD</span>
              </div>
              
              {/* Package Calculation - Single line, more compact */}
              <div className="flex items-center justify-between text-xs text-gray-600 bg-white px-3 py-2 rounded-lg border border-purple-100">
                <span>
                  {formatCurrency(priceInfo.tierPrice)} MAD × {duration} {duration > 1 ? (rentalType === 'hourly' ? 'hours' : 'days') : (rentalType === 'hourly' ? 'hour' : 'day')}
                </span>
                <span className="font-medium text-purple-600">= {formatCurrency(priceInfo.total)} MAD</span>
              </div>
              
              {/* Package Features - Side by side, showing TOTAL included km */}
              <div className="flex gap-2 mt-1">
                {priceInfo.packageIncludedKm && (
                  <div className="flex-1 bg-green-50 px-2 py-1.5 rounded-lg border border-green-100">
                    <div className="flex flex-col">
                      <span className="text-xs text-green-700 font-medium">
                        ✓ {priceInfo.packageIncludedKm} km per {rentalType === 'hourly' ? 'hour' : 'day'}
                      </span>
                      <span className="text-xs text-gray-600 mt-0.5">
                        Total: {priceInfo.packageIncludedKm * duration} km
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
                Save {formatCurrency(priceInfo.basePrice - priceInfo.tierPrice)}/{rentalType === 'hourly' ? 'hour' : 'day'}
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
                <span>{formatCurrency(priceInfo.tierPrice)} × {duration}</span>
              </div>
              
              {isTierPricing && priceInfo.tierPrice < priceInfo.basePrice && (
                <div className="bg-green-50 px-2 py-1.5 rounded border border-green-100">
                  <div className="flex justify-between text-green-700">
                    <span className="font-medium">Savings:</span>
                    <span className="font-bold">{formatCurrency((priceInfo.basePrice - priceInfo.tierPrice) * duration)} MAD</span>
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

// ==================== ENHANCED TIER PRICING BREAKDOWN ====================
const TierPricingBreakdown = ({ 
  vehicleName, 
  vehicleModelId,
  duration, 
  unitPrice, 
  rentalType,
  availableVehicles = []
}) => {
  const [baseRate, setBaseRate] = useState(0);
  const [loading, setLoading] = useState(true);
  const [priceSource, setPriceSource] = useState('unknown');
  const [tierName, setTierName] = useState('');

  if (duration <= 1) {
    return null;
  }

  useEffect(() => {
    const fetchBaseRate = async () => {
      if (!vehicleModelId || !rentalType || duration <= 1 || !unitPrice) {
        setLoading(false);
        return;
      }

      try {
        let baseRate = 0;
        let priceSource = '';

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
        setPriceSource(priceSource);
        
        if (rentalType === 'daily') {
          if (duration === 2) setTierName("2-day package deal");
          else if (duration === 3) setTierName("3-day special offer");
          else if (duration >= 4 && duration < 7) setTierName(`${duration}-day extended package`);
          else if (duration >= 7) setTierName("Weekly+ package (7+ days)");
          else setTierName(`${duration}-day package`);
        } else {
          if (duration === 2) setTierName("2-hour special rate");
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

  const baseTotal = duration * baseRate;
  const tierTotal = duration * unitPrice;
  const savings = baseTotal - tierTotal;
  const savingsPercentage = baseTotal > 0 ? (savings / baseTotal * 100).toFixed(1) : 0;
  const isDiscounted = savings > 0;

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
              {duration} {duration > 1 ? getPeriodLabelPlural() : ''}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
          <div className="bg-white p-4 rounded-lg border border-green-200 shadow-sm">
            <div className="text-green-700 text-xs font-medium mb-1">YOUR TIER RATE</div>
            <div className="text-2xl sm:text-3xl font-bold text-green-600">{formatCurrency(unitPrice)}</div>
            <div className="text-green-600 text-sm">MAD per {rentalType === 'daily' ? 'day' : 'hour'}</div>
            <div className="text-xs text-green-500 mt-2 truncate">{tierName}</div>
          </div>
          
          <div className="bg-white p-4 rounded-lg border border-gray-100 shadow-sm">
            <div className="text-gray-500 text-xs font-medium mb-1">STANDARD RATE</div>
            <div className="text-xl sm:text-2xl text-gray-400 line-through">{formatCurrency(baseRate)}</div>
            <div className="text-gray-500 text-sm">MAD per {rentalType === 'daily' ? 'day' : 'hour'}</div>
            <div className="text-xs text-gray-400 mt-2">Base {rentalType} price</div>
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
                  <div className="text-green-800 font-bold text-sm">Total Savings</div>
                  <div className="text-green-600 text-xs">You're paying less!</div>
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

        {!isDiscounted && baseRate > 0 && (
          <div className="bg-gradient-to-r from-blue-50 to-cyan-50 p-4 rounded-lg border border-blue-200">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                <Info className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <div className="text-blue-800 font-bold text-sm">Fixed Package Price</div>
                <div className="text-blue-600 text-sm">{duration}-{rentalType === 'daily' ? 'day' : 'hour'} flat rate applied</div>
              </div>
            </div>
            <div className="mt-2 text-xs text-blue-700">
              <div className="flex justify-between">
                <span>Total amount:</span>
                <span className="font-bold">{formatCurrency(tierTotal)} MAD</span>
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

  // Calculate total included kilometers for the entire duration
  const getTotalIncludedKm = (pkg) => {
    if (!pkg || !pkg.included_kilometers) return null;
    return pkg.included_kilometers * duration;
  };

  // Calculate total cost based on estimated kilometers
  const calculateTotalCost = (pkg, kms) => {
    if (!pkg) return 0;
    
    const ratePerUnit = parseFloat(pkg.fixed_amount) || 0;
    const baseRentalCost = ratePerUnit * duration;
    
    if (!pkg.included_kilometers) return baseRentalCost;
    
    const extraRate = parseFloat(pkg.extra_km_rate) || 0;
    const totalIncludedKm = pkg.included_kilometers * duration;
    
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
    const totalIncludedKm = pkg.included_kilometers * duration;
    if (kms <= totalIncludedKm) return 0;
    const extraKms = kms - totalIncludedKm;
    const extraRate = parseFloat(pkg.extra_km_rate) || 0;
    return extraKms * extraRate;
  };

  // Handle package selection
  const handlePackageSelect = (pkg) => {
    setSelectedPackage(pkg);
    setHasOverridden(true);
    onPackageSelect(pkg.id);
    
    const ratePerUnit = parseFloat(pkg.fixed_amount) || 0;
    
    // Prepare ALL package data in one object
    const packageData = {
      package_id: pkg.id,
      package_name: pkg.name,
      package_rate_per_unit: ratePerUnit,
      package_included_km_per_unit: pkg.included_kilometers,
      package_extra_rate: parseFloat(pkg.extra_km_rate) || 0,
      package_description: pkg.description,
      use_package_pricing: true,
      package_overrides_tier: true
    };
    
    // Pass to parent - let the parent handle ALL state updates
    if (onPackageCalculations) {
      onPackageCalculations(packageData);
    }
    
    // Don't update formData directly here - let the parent handle it
    // Don't call onPriceOverride separately
    
    toast.success(`Package "${pkg.name}" selected - ${ratePerUnit.toFixed(2)} MAD per ${rentalType === 'hourly' ? 'hour' : 'day'}`);
  };

  // Handle clear package selection
  const handleClearPackage = () => {
    setSelectedPackage(null);
    setHasOverridden(false);
    onPackageSelect(null);
    
    if (onPackageCalculations) {
      onPackageCalculations({
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
    
    toast.info('Package selection cleared - using standard pricing');
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
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Package className="w-5 h-5 text-purple-600" />
          <h4 className="font-semibold text-gray-900">
            {rentalType === 'hourly' ? 'Hourly' : 'Daily'} Packages
          </h4>
          <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">
            {packages.length} available
          </span>
        </div>
        {selectedPackage && (
          <button
            type="button"
            onClick={handleClearPackage}
            className="text-xs text-red-600 hover:text-red-800 px-2 py-1 hover:bg-red-50 rounded"
          >
            Clear Package
          </button>
        )}
      </div>

      {/* Package Selection Tabs - Max 3 tabs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {packages.map((pkg) => {
          const isSelected = selectedPackageId === pkg.id || selectedPackage?.id === pkg.id;
          const ratePerUnit = parseFloat(pkg.fixed_amount) || 0;
          const totalForDuration = ratePerUnit * duration;
          const totalIncludedKm = pkg.included_kilometers ? pkg.included_kilometers * duration : null;
          
          return (
            <button
              key={pkg.id}
              type="button"
              onClick={() => handlePackageSelect(pkg)}
              disabled={disabled}
              className={`relative p-4 rounded-xl border-2 transition-all text-left ${
                isSelected
                  ? 'border-purple-500 bg-gradient-to-r from-purple-50 to-indigo-50 ring-2 ring-purple-200 shadow-md'
                  : 'border-gray-200 bg-white hover:border-purple-300 hover:bg-purple-50/30'
              } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:shadow-sm'}`}
            >
              <div className="flex flex-col h-full">
                <div className="flex items-start justify-between mb-2">
                  <Gauge className={`w-5 h-5 ${isSelected ? 'text-purple-600' : 'text-gray-400'}`} />
                  {isSelected && (
                    <div className="w-5 h-5 bg-purple-500 rounded-full flex items-center justify-center">
                      <Check className="w-3 h-3 text-white" />
                    </div>
                  )}
                </div>
                
                <h4 className="font-bold text-gray-900 text-base mb-1">{pkg.name}</h4>
                
                <div className="mt-2 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-500">Rate per {rentalType === 'hourly' ? 'hour' : 'day'}:</span>
                    <span className="text-sm font-bold text-purple-700">
                      {ratePerUnit.toFixed(2)} MAD
                    </span>
                  </div>
                  
                  {pkg.included_kilometers && (
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-gray-500">Included per unit:</span>
                      <span className="text-xs font-medium text-gray-700">
                        {pkg.included_kilometers} km
                      </span>
                    </div>
                  )}
                  
                  {totalIncludedKm && (
                    <div className="flex items-center justify-between pt-1 border-t border-dashed border-gray-200">
                      <span className="text-xs font-medium text-green-600">Total included:</span>
                      <span className="text-xs font-bold text-green-700">
                        {totalIncludedKm} km
                      </span>
                    </div>
                  )}
                  
                  {pkg.extra_km_rate && (
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-gray-500">Extra/km:</span>
                      <span className="text-xs font-medium text-orange-600">
                        {parseFloat(pkg.extra_km_rate).toFixed(2)} MAD
                      </span>
                    </div>
                  )}
                </div>

                <div className="mt-3 pt-2 border-t border-gray-100">
                  <div className="text-xs text-gray-500">
                    Total for {duration} {duration > 1 ? (rentalType === 'hourly' ? 'hours' : 'days') : (rentalType === 'hourly' ? 'hour' : 'day')}:
                  </div>
                  <div className="text-base font-bold text-purple-700">
                    {totalForDuration.toFixed(2)} MAD
                  </div>
                </div>

                {pkg.description && (
                  <p className="text-xs text-gray-500 mt-2 line-clamp-2">
                    {pkg.description}
                  </p>
                )}
              </div>
            </button>
          );
        })}
      </div>

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
              <h4 className="font-semibold text-purple-900">Package Calculator</h4>
              <span className="text-xs bg-purple-200 text-purple-700 px-2 py-0.5 rounded-full">
                {selectedPackage.name}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm text-purple-600">
                {showCalculator ? 'Hide' : 'Show'} details
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
                const baseRentalCost = ratePerUnit * duration; // FIXED package total
                const includedKmsPerUnit = selectedPackage.included_kilometers;
                const totalIncludedKm = includedKmsPerUnit ? includedKmsPerUnit * duration : null;
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
                          <span className="text-sm text-gray-600">Package:</span>
                          <span className="text-sm font-bold text-purple-700">{selectedPackage.name}</span>
                        </div>
                        
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-gray-600">Rate per {rentalType === 'hourly' ? 'hour' : 'day'}:</span>
                          <span className="text-sm font-bold text-gray-900">{ratePerUnit.toFixed(2)} MAD</span>
                        </div>
                        
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-gray-600">Duration:</span>
                          <span className="text-sm font-bold text-gray-900">
                            {duration} {duration > 1 ? (rentalType === 'hourly' ? 'hours' : 'days') : (rentalType === 'hourly' ? 'hour' : 'day')}
                          </span>
                        </div>
                        
                        {includedKmsPerUnit && (
                          <>
                            <div className="flex justify-between items-center pt-2 border-t border-purple-100">
                              <span className="text-sm text-gray-600">Included per unit:</span>
                              <span className="text-sm font-medium text-gray-700">
                                {includedKmsPerUnit} km
                              </span>
                            </div>
                            <div className="flex justify-between items-center">
                              <span className="text-sm text-gray-600">Total included:</span>
                              <span className="text-sm font-bold text-green-600">
                                {totalIncludedKm} km
                              </span>
                            </div>
                            <div className="text-xs text-gray-500 -mt-1 text-right">
                              {includedKmsPerUnit} km × {duration} = {totalIncludedKm} km
                            </div>
                          </>
                        )}
                        
                        {/* FIXED Package Total - Does NOT include extra km */}
                        <div className="flex justify-between items-center pt-3 border-t border-purple-200 mt-2">
                          <span className="text-base font-semibold text-purple-900">Package Total (Fixed):</span>
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
                        {ratePerUnit.toFixed(2)} MAD × {duration} = {baseRentalCost.toFixed(2)} MAD
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
  isLoading = false 
}) => {
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(1);
  const [basePrices, setBasePrices] = React.useState([]);
  const [showIDScanModal, setShowIDScanModal] = useState(false);
  const [showSecondDriverScanModal, setShowSecondDriverScanModal] = useState(false);
  const [activeTab, setActiveTab] = useState('basic');
  const [countryCode, setCountryCode] = useState('+212');
  const [showCustomerDrawer, setShowCustomerDrawer] = useState(false);
  const [selectedRentalForDrawer, setSelectedRentalForDrawer] = useState(null);
  const explicitSubmitRef = useRef(false);

  const [activeModelFilter, setActiveModelFilter] = useState(null);
  const [filteredVehicles, setFilteredVehicles] = useState([]);
  const [activeModels, setActiveModels] = useState([]);

  const {
    userProfile,
    formData,
    setFormData,
    loading,
    submitting,
    isSubmitting,
    successfullySubmitted,
    errors,
    success,
    setSuccess,
    dateError,
    vehicleModels,
    availableVehicles,
    transportFees,
    availabilityStatus,
    autoCalculatedPrice,
    suggestions,
    selectedQuickDuration,
    damageDepositConfig,
    selectedDepositTab,
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
    handlePaymentStatusTabClick,
    handleDepositTabClick,
    validateStep,
    handleSubmit,
    handleReset,
    getEnabledPresetsForVehicle,
    customerSearchRef,
    availablePackages,
    calculatePackagePrice,
    fuelChargeEnabled,
    setFuelChargeEnabled,
    fuelChargeAmount,
  } = useRentalWizard(initialData, mode, navigate);

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

  const steps = [
    { number: 1, title: 'Customer', icon: User },
    { number: 2, title: 'Vehicle & Dates', icon: Car },
    { number: 3, title: 'Payment', icon: CreditCard }
  ];

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
        <span className="text-gray-400 text-xs sm:text-sm hidden sm:inline">to</span>
        <span className="text-gray-400 text-xs sm:hidden">↓</span>
        <span className="font-medium text-sm sm:text-base">
          {formData.rental_end_date} {formData.rental_end_time || '00:00'}
        </span>
      </div>
    );
  };

  const handlePhoneChange = (value) => {
    handleInputChange('customer_phone', value);
  };

  const customerTabs = [
    {
      id: 'basic',
      label: 'Basic Info',
      content: (
        <div className="space-y-4">
          {/* Customer Name */}
          <div className="relative" ref={customerSearchRef}>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Customer Name *
            </label>
            <input
              type="text"
              value={formData.customer_name}
              onChange={(e) => handleInputChange('customer_name', e.target.value)}
              placeholder="Enter customer name"
              disabled={successfullySubmitted}
              className={`w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-base ${
                errors.customer_name ? 'border-red-500' : 'border-gray-300'
              } ${successfullySubmitted ? 'opacity-50 cursor-not-allowed' : ''}`}
            />
            {errors.customer_name && (
              <p className="text-red-500 text-xs mt-1">{errors.customer_name}</p>
            )}
            {suggestions.length > 0 && !successfullySubmitted && (
              <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                {suggestions.map((suggestion, index) => (
                  <button
                    key={index}
                    type="button"
                    onClick={() => handleSuggestionClick(suggestion)}
                    className="w-full px-4 py-3 text-left hover:bg-blue-50 flex items-center gap-3 border-b border-gray-100 last:border-b-0"
                  >
                    <UserSearch className="w-4 h-4 text-gray-500 flex-shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-gray-800 truncate">{suggestion.name}</p>
                      <p className="text-sm text-gray-500 truncate">{suggestion.phone}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Phone */}
          <PhoneInputWithCountryCode
            value={formData.customer_phone}
            onChange={handlePhoneChange}
            error={errors.customer_phone}
            disabled={successfullySubmitted}
            countryCode={countryCode}
            onCountryCodeChange={setCountryCode}
            mobileOptimized={true}
          />

          {/* Email */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Email
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-3.5 w-4 h-4 text-gray-400" />
              <input
                type="email"
                value={formData.customer_email}
                onChange={(e) => handleInputChange('customer_email', e.target.value)}
                placeholder="customer@example.com"
                disabled={successfullySubmitted}
                className={`w-full px-4 py-3 pl-10 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-base ${
                  errors.customer_email ? 'border-red-500' : 'border-gray-300'
                } ${successfullySubmitted ? 'opacity-50 cursor-not-allowed' : ''}`}
              />
            </div>
            {errors.customer_email && (
              <p className="text-red-500 text-xs mt-1">{errors.customer_email}</p>
            )}
          </div>
        </div>
      )
    },
    {
      id: 'license',
      label: 'License & ID',
      content: (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5 flex items-center gap-2">
              License Number *
            </label>
            <div className="relative">
              <input
                type="text"
                value={formData.customer_licence_number}
                onChange={(e) => handleInputChange('customer_licence_number', e.target.value)}
                placeholder="Enter license number"
                disabled={successfullySubmitted}
                className={`w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-base ${
                  errors.customer_licence_number ? 'border-red-500' : !formData.customer_licence_number?.trim() ? 'border-gray-300 bg-gray-50' : 'border-gray-300'
                } ${successfullySubmitted ? 'opacity-50 cursor-not-allowed' : ''}`}
              />
            </div>
            {errors.customer_licence_number && (
              <p className="text-red-500 text-xs mt-1">{errors.customer_licence_number}</p>
            )}
            {!formData.customer_licence_number?.trim() && !errors.customer_licence_number && !successfullySubmitted && (
              <p className="text-gray-500 text-xs mt-1 flex items-center gap-1">
                <Info className="w-3 h-3" />
                Required before moving to the next step
              </p>
            )}
          </div>

          {/* ID Scan Status */}
          {(formData.customer_name || formData.customer_licence_number || formData.customer_id_image) ? (
            <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
              <div className="flex flex-col gap-3">
                <div className="flex items-start gap-3">
                  <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <span className="text-sm font-medium text-green-800 block">
                      ✓ ID Scan Complete
                    </span>
                    <div className="text-xs text-green-600 mt-1 space-y-1">
                      {formData.customer_name && (
                        <p className="truncate">Name: {formData.customer_name}</p>
                      )}
                      {formData.customer_licence_number && (
                        <p className="truncate">License: {formData.customer_licence_number}</p>
                      )}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setFormData(prev => ({ ...prev, customer_id_image: null }));
                    toast.info('ID scan image removed');
                  }}
                  className="text-xs text-red-600 hover:text-red-800 px-3 py-2 hover:bg-red-50 rounded-lg w-full text-center"
                >
                  Remove
                </button>
              </div>
            </div>
          ) : (
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="flex items-start gap-3">
                <Info className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                <span className="text-sm text-blue-800">
                  Scan ID to auto-fill license and personal details
                </span>
              </div>
            </div>
          )}

          {/* Multiple Image Upload */}
          <div className="pt-2">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Additional ID Images
            </label>
            <MultipleImageUpload
              images={formData.customer_uploaded_images || []}
              onImagesChange={(newImages) => {
                handleInputChange('customer_uploaded_images', newImages);
              }}
              accept="image/*,.pdf"
              maxImages={5}
              disabled={successfullySubmitted}
              mobileOptimized={true}
            />
            <p className="text-xs text-gray-500 mt-2">
              Upload additional ID copies or documents (max 5)
            </p>
          </div>
        </div>
      )
    },
    {
      id: 'additional',
      label: 'Additional Info',
      content: (
        <div className="space-y-4">
          {secondDrivers.length > 0 && (
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
              className="w-full px-4 py-4 bg-blue-50 border border-blue-200 text-blue-700 rounded-lg hover:bg-blue-100 transition-colors flex items-center justify-center gap-2 text-sm"
            >
              <Eye className="w-4 h-4" />
              <span>View All Drivers ({secondDrivers.length} second driver{secondDrivers.length !== 1 ? 's' : ''})</span>
            </button>
          )}

          <SecondDriversManager
            secondDrivers={secondDrivers}
            onRemove={removeSecondDriver}
            onUpdate={updateSecondDriver}
            disabled={successfullySubmitted}
          />

          {!successfullySubmitted && (
            <div className="pt-2">
              <button
                type="button"
                onClick={() => setShowSecondDriverScanModal(true)}
                className="w-full px-4 py-4 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-lg hover:from-blue-700 hover:to-blue-800 transition-all shadow-sm active:scale-95 flex items-center justify-center gap-2 text-sm"
              >
                <Users className="w-4 h-4" />
                <span>Add Second Driver</span>
              </button>
              <p className="mt-2 text-xs text-gray-500 text-center">
                Scan an ID or enter the driver details manually in one place.
              </p>
            </div>
          )}
        </div>
      )
    }
  ];

  const handleNext = async () => {
    const isValid = await validateStep(currentStep);
    if (isValid) {
      setCurrentStep(prev => Math.min(prev + 1, 3));
    }
  };

  const handleBack = () => {
    setCurrentStep(prev => Math.max(prev - 1, 1));
  };

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
    
    try {
      const submissionResult = await handleSubmit();
      if (submissionResult && submissionResult.rentalId) {
        navigate(`/admin/rentals/${submissionResult.rentalId}`);
      } else if (onSuccess && submissionResult) {
        setTimeout(() => onSuccess(submissionResult.result), 1000);
      }
    } catch (error) {
    }
  };

  if (successfullySubmitted) {
    return (
      <div className="max-w-4xl mx-auto p-4">
        <div className="flex flex-col items-center justify-center py-20">
          <Loader className="w-12 h-12 text-blue-600 animate-spin mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            ✅ Rental Successfully Created!
          </h2>
          <p className="text-gray-600">Redirecting to rental details...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-4">
      <ProgressStepper currentStep={currentStep} steps={steps} />

      {errors.general && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-red-500" />
            <div>
              <p className="text-red-800 font-medium">Error</p>
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

      <form onSubmit={handleFormSubmit} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        {currentStep === 1 && (
          <div className="p-4 sm:p-6">
            {/* Simplified Header - Removed subtitle text */}
            <div className="flex flex-col gap-3 mb-4">
              <h2 className="text-lg font-bold text-gray-900">Customer Information</h2>
              
              {/* Action buttons stacked vertically on mobile */}
              <div className="flex flex-col gap-2 w-full">
                {formData.customer_name && (
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
                    className="flex items-center justify-center gap-2 px-4 py-3 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-all shadow-sm active:scale-95 text-sm w-full"
                  >
                    <Eye className="w-4 h-4" />
                    <span>View Details {secondDrivers.length > 0 && `(${secondDrivers.length})`}</span>
                  </button>
                )}
                
                {activeTab !== 'additional' && (
                  <button
                    type="button"
                    onClick={() => setShowIDScanModal(true)}
                    className="flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-lg hover:from-purple-700 hover:to-blue-700 transition-all shadow-sm active:scale-95 text-sm w-full"
                    disabled={loading || submitting || successfullySubmitted}
                  >
                    <Scan className="w-4 h-4" />
                    <span>Scan Customer ID</span>
                  </button>
                )}
              </div>
            </div>

            {/* Mobile-friendly tabs with horizontal scroll - Moved below buttons */}
            <div className="mb-4 -mx-4 px-4 overflow-x-auto scrollbar-hide">
              <div className="flex gap-1 min-w-max pb-1">
                {customerTabs.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`px-4 py-2.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
                      activeTab === tab.id
                        ? 'bg-blue-600 text-white shadow-md'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
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
            <CollapsibleSection title="Additional Customer Details" defaultOpen={false}>
              <div className="grid grid-cols-1 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    ID Number
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
                    Date of Birth
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
                    Place of Birth
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
                    Nationality
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
        )}

        {currentStep === 2 && (
          <div className="p-4 sm:p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-6">Vehicle & Rental Period</h2>
            
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  Rental Type
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
                          {type === 'hourly' ? 'Flexible timing' : '24-hour periods'}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {formData.rental_type && (
                <div className="bg-gradient-to-r from-blue-50 to-indigo-50 p-4 rounded-xl border border-blue-200 transition-all duration-300">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
                    <div className="flex items-center gap-2">
                      <Clock className="w-5 h-5 text-blue-600" />
                      <h3 className="font-semibold text-blue-800 text-sm sm:text-base">
                        Quick Select Duration
                      </h3>
                    </div>
                  </div>
                  
                  {formData.rental_type === 'hourly' && (
                    <div>
                      <div className="grid grid-cols-4 gap-2 mb-2">
                        {[1, 2, 3, 4].map((hours) => (
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
                            <span className="text-lg font-bold">{hours}</span>
                            <span className="text-xs mt-0.5">{hours === 1 ? 'Hour' : 'Hours'}</span>
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

              {/* KM Packages Section - Appears when rental type is selected, positioned under filter by model */}
              {formData.rental_type && (
                <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm mb-4">
                  <div className="flex items-center gap-2 mb-4">
                    <Package className="w-5 h-5 text-purple-600" />
                    <h3 className="font-semibold text-gray-900">KM Packages</h3>
                    <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">
                      {formData.rental_type === 'hourly' ? 'Hourly packages' : 'Daily packages'}
                    </span>
                  </div>

                  {!formData.vehicle_id && (
                    <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                      <div className="flex items-center gap-2 text-blue-700">
                        <Info className="w-5 h-5" />
                        <span className="text-sm">Select a vehicle to see available {formData.rental_type} packages</span>
                      </div>
                    </div>
                  )}

                  {formData.vehicle_id && availablePackages.length === 0 && (
                    <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
                      <div className="flex items-center gap-2 text-gray-600">
                        <Package className="w-5 h-5" />
                        <span className="text-sm">No {formData.rental_type} packages available for this vehicle</span>
                      </div>
                    </div>
                  )}

                  {formData.vehicle_id && formData.rental_type && availablePackages.length > 0 && (
                    <KMPackagesTab
                      packages={availablePackages.filter(pkg => {
                        // Filter packages by rental type: hourly packages for hourly, daily for daily
                        if (!formData.rental_type) return true;
                        const pkgRateType = pkg.rate_types?.name?.toLowerCase();
                        if (!pkgRateType) return true; // Show packages without a rate type
                        if (formData.rental_type === 'hourly') return pkgRateType === 'hourly';
                        if (formData.rental_type === 'daily') return pkgRateType === 'daily';
                        return true;
                      })}
                      selectedPackageId={formData.selected_package_id}
                      onPackageSelect={(packageId) => {
                        handleInputChange('selected_package_id', packageId);
                      }}
                      onPackageCalculations={(packageData) => {
                        console.log('📦 Package calculations received:', packageData);
                        
                        // Calculate total included km
                        const totalIncludedKm = packageData.package_included_km_per_unit * (formData.quantity_days || 1);
                        
                        // Update form data with package info in a SINGLE state update
                        setFormData(prev => {
                          console.log('📦 Updating from price:', prev.unit_price, 'to:', packageData.package_rate_per_unit);
                          
                          const newFormData = {
                            ...prev,
                            // Package identification
                            selected_package_id: packageData.package_id,
                            selected_package_name: packageData.package_name,
                            
                            // Package rates
                            selected_package_fixed_amount: packageData.package_rate_per_unit,
                            selected_package_rate_per_unit: packageData.package_rate_per_unit,
                            
                            // Kilometer limits
                            selected_package_included_km: packageData.package_included_km_per_unit,
                            selected_package_included_km_per_unit: packageData.package_included_km_per_unit,
                            selected_package_total_included_km: totalIncludedKm,
                            
                            // Extra rates
                            selected_package_extra_rate: packageData.package_extra_rate,
                            selected_package_description: packageData.package_description,
                            
                            // CRITICAL: Set package pricing flags FIRST
                            use_package_pricing: true,
                            package_overrides_tier: true,
                            
                            // CRITICAL: Override the unit price with package rate
                            unit_price: packageData.package_rate_per_unit
                          };
                          
                          console.log('📦 Final form data update:', {
                            old_price: prev.unit_price,
                            new_price: newFormData.unit_price,
                            use_package_pricing: newFormData.use_package_pricing,
                            package_rate: packageData.package_rate_per_unit
                          });
                          
                          return newFormData;
                        });
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
                  )}
                </div>
              )}

              <div>
                <div className="flex items-center justify-between mb-3">
                  <label className="block text-sm font-medium text-gray-700">
                    Select Vehicle * ({filteredVehicles.length > 0 ? filteredVehicles.length : availableVehicles.length} available)
                  </label>
                  {formData.rental_type && formData.quantity_days > 0 && (
                    <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full">
                      {formData.quantity_days} {formData.rental_type === 'hourly' ? 'hour' : 'day'}{formData.quantity_days > 1 ? 's' : ''} selected
                    </span>
                  )}
                </div>
                <VehicleCardGrid
                  vehicles={filteredVehicles.length > 0 ? filteredVehicles : (availableVehicles.length > 0 ? availableVehicles : vehicleModels)}
                  selectedId={formData.vehicle_id}
                  showSearchBar={activeModelFilter === null}
                  onSelect={(vehicleId) => {
                    if (vehicleId) {
                      handleInputChange('vehicle_id', vehicleId);
                    }
                  }}
                  disabled={loading || successfullySubmitted}
                  rentalType={formData.rental_type}
                  duration={formData.quantity_days}
                  availablePackages={availablePackages}
                  selectedPackageId={formData.selected_package_id}
                  usePackagePricing={formData.use_package_pricing}
                />
                {errors.vehicle_id && (
                  <p className="text-red-500 text-xs mt-1">{errors.vehicle_id}</p>
                )}
                {formData.rental_type && formData.quantity_days > 0 && !formData.vehicle_id && (
                  <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                    <div className="flex items-center gap-2 text-blue-700">
                      <Info className="w-4 h-4" />
                      <span className="text-sm">Select a vehicle to see real-time pricing</span>
                    </div>
                  </div>
                )}
              </div>

              <CollapsibleSection title="Transport Options" defaultOpen={false}>
                <div className="space-y-3">
                  <label className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={formData.pickup_transport}
                      onChange={(e) => handleInputChange('pickup_transport', e.target.checked)}
                      disabled={successfullySubmitted}
                      className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                    />
                    <span className="text-gray-700">
                      Pick-up Transport (+{transportFees.pickup_fee.toFixed(2)} MAD)
                    </span>
                  </label>
                  <label className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={formData.dropoff_transport}
                      onChange={(e) => handleInputChange('dropoff_transport', e.target.checked)}
                      disabled={successfullySubmitted}
                      className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                    />
                    <span className="text-gray-700">
                      Drop-off Transport (+{transportFees.dropoff_fee.toFixed(2)} MAD)
                    </span>
                  </label>
                </div>
              </CollapsibleSection>

              <CollapsibleSection title="Pickup & Drop-off Locations" defaultOpen={false}>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Pickup Location
                    </label>
                    <select
                      value={formData.pickup_location}
                      onChange={(e) => handleInputChange('pickup_location', e.target.value)}
                      disabled={successfullySubmitted}
                      className={`w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${successfullySubmitted ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      <option value="Office">Office</option>
                      <option value="Hotel">Hotel</option>
                      <option value="Airport">Airport</option>
                      <option value="Custom">Custom Location</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Drop-off Location
                    </label>
                    <select
                      value={formData.dropoff_location}
                      onChange={(e) => handleInputChange('dropoff_location', e.target.value)}
                      disabled={successfullySubmitted}
                      className={`w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${successfullySubmitted ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      <option value="Office">Office</option>
                      <option value="Hotel">Hotel</option>
                      <option value="Airport">Airport</option>
                      <option value="Custom">Custom Location</option>
                    </select>
                  </div>
                </div>
              </CollapsibleSection>
            </div>
          </div>
        )}

    

{currentStep === 3 && (
  <div className="p-4 sm:p-6">
    <h2 className="text-xl font-bold text-gray-900 mb-6">Review & Payment</h2>
    
    <div className="space-y-6">
      {/* Rental Summary with Package Info */}
      <div className="bg-gray-50 rounded-lg p-4">
        <h3 className="font-semibold text-gray-900 mb-3">Rental Summary</h3>
        <div className="space-y-2">
          <div className="flex justify-between">
            <span className="text-gray-600">Customer:</span>
            <span className="font-medium">{formData.customer_name}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Vehicle:</span>
            <span className="font-medium">
              {(() => {
                const vehicle = getSelectedVehicle();
                if (!vehicle) return 'Not selected';
                return `${vehicle.plate_number || 'N/A'} - ${vehicle.model || vehicle.name}`;
              })()}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Period:</span>
            <span className="font-medium">
              {formatPeriodDisplay()}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Duration:</span>
            <span className="font-medium">
              {formData.quantity_days} {formData.quantity_days > 1 ? (formData.rental_type === 'hourly' ? 'hours' : 'days') : (formData.rental_type === 'hourly' ? 'hour' : 'day')}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Type:</span>
            <span className="font-medium capitalize">{formData.rental_type}</span>
          </div>
          
          {/* Package Information */}
          {formData.use_package_pricing && formData.selected_package_name && (
            <div className="mt-3 pt-3 border-t border-gray-200">
              <div className="flex items-center gap-2 mb-2">
                <Package className="w-4 h-4 text-purple-600" />
                <span className="text-sm font-semibold text-purple-700">Selected Package</span>
              </div>
              <div className="bg-purple-50 rounded-lg p-3">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm text-purple-700">Package:</span>
                  <span className="text-sm font-bold text-purple-700">{formData.selected_package_name}</span>
                </div>
                <div className="flex justify-between items-center mb-1">
                  <span className="text-xs text-gray-600">Rate per {formData.rental_type === 'hourly' ? 'hour' : 'day'}:</span>
                  <span className="text-xs font-semibold">{formData.selected_package_rate_per_unit?.toFixed(2)} MAD</span>
                </div>
                {formData.selected_package_included_km && (
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-xs text-gray-600">Included KM:</span>
                    <span className="text-xs font-semibold">{formData.selected_package_included_km} km</span>
                  </div>
                )}
                {formData.selected_package_extra_rate > 0 && (
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-gray-600">Extra KM rate:</span>
                    <span className="text-xs font-semibold text-orange-600">{formData.selected_package_extra_rate.toFixed(2)} MAD/km</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Price Calculator with Package Info */}
      <PriceCalculator 
        formData={formData} 
        onPriceChange={handleInputChange} 
        autoCalculatedPrice={autoCalculatedPrice} 
        userProfile={userProfile} 
        disabled={successfullySubmitted} 
      />

      {/* Package Summary if selected */}
      {formData.use_package_pricing && formData.selected_package_name && (
        <div className="bg-purple-50 rounded-xl p-4 border-2 border-purple-200">
          <div className="flex items-center gap-2 mb-3">
            <Package className="w-5 h-5 text-purple-600" />
            <h3 className="font-semibold text-purple-900">Package Summary</h3>
            <span className="text-xs bg-purple-200 text-purple-700 px-2 py-0.5 rounded-full">
              Active
            </span>
          </div>
          
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Package:</span>
              <span className="text-sm font-bold text-purple-700">{formData.selected_package_name}</span>
            </div>
            
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Rate per {formData.rental_type === 'hourly' ? 'hour' : 'day'}:</span>
              <span className="text-sm font-bold text-gray-900">{formData.selected_package_rate_per_unit?.toFixed(2)} MAD</span>
            </div>
            
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-600">Duration:</span>
              <span className="text-sm font-bold text-gray-900">
                {formData.quantity_days} {formData.quantity_days > 1 ? (formData.rental_type === 'hourly' ? 'hours' : 'days') : (formData.rental_type === 'hourly' ? 'hour' : 'day')}
              </span>
            </div>
            
            {/* Show per-unit included km and total included km */}
            {formData.selected_package_included_km_per_unit && (
              <>
                <div className="flex justify-between items-center pt-2 border-t border-purple-100">
                  <span className="text-sm text-gray-600">Included km per unit:</span>
                  <span className="text-sm font-medium text-gray-700">
                    {formData.selected_package_included_km_per_unit} km
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">Total included km:</span>
                  <span className="text-sm font-bold text-green-600">
                    {formData.selected_package_included_km_per_unit * formData.quantity_days} km
                  </span>
                </div>
                <div className="text-xs text-gray-500 -mt-1">
                  {formData.selected_package_included_km_per_unit} km × {formData.quantity_days} {formData.quantity_days > 1 ? (formData.rental_type === 'hourly' ? 'hours' : 'days') : (formData.rental_type === 'hourly' ? 'hour' : 'day')}
                </div>
              </>
            )}
            
            {formData.selected_package_extra_rate > 0 && (
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Extra km rate:</span>
                <span className="text-sm font-medium text-orange-600">
                  {formData.selected_package_extra_rate.toFixed(2)} MAD/km
                </span>
              </div>
            )}
            
            <div className="flex justify-between items-center pt-3 border-t border-purple-200">
              <span className="text-base font-semibold text-purple-900">Package Total:</span>
              <span className="text-xl font-bold text-purple-700">
                {(formData.selected_package_rate_per_unit * formData.quantity_days).toFixed(2)} MAD
              </span>
            </div>
            
            <div className="text-xs text-purple-600 mt-2 bg-white p-2 rounded">
              <div className="flex items-start gap-2">
                <Info className="w-4 h-4 text-purple-500 mt-0.5 flex-shrink-0" />
                <div>
                  {formData.selected_package_included_km_per_unit && (
                    <span>Total included: {formData.selected_package_included_km_per_unit * formData.quantity_days} km. </span>
                  )}
                  {formData.selected_package_extra_rate > 0 && (
                    <span>Extra km: {formData.selected_package_extra_rate.toFixed(2)} MAD/km.</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tier Pricing Breakdown (only if no package selected) */}
      {!formData.use_package_pricing && formData.quantity_days > 1 ? (
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
        />
      ) : !formData.use_package_pricing && (
        <div className="mt-4 p-4 bg-blue-50 rounded-xl border border-blue-200">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
              <Info className="w-5 h-5 text-blue-600" />
            </div>
            <div className="min-w-0">
              <h4 className="font-bold text-blue-900 text-base sm:text-lg">Standard Rate Applied</h4>
              <p className="text-blue-600 text-sm mt-1">
                {formData.quantity_days || 0} {formData.rental_type === 'hourly' ? 'hour' : 'day'} 
                rental at {formData.unit_price?.toFixed(2) || '0.00'} MAD
                {formData.rental_type === 'hourly' ? '/hour' : '/day'}
              </p>
              <p className="text-xs text-blue-500 mt-2">
                Tier pricing applies for 2+ {formData.rental_type === 'hourly' ? 'hours' : 'days'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Payment Details */}
      <div className="space-y-4">
        <h3 className="font-semibold text-gray-900">Payment Details</h3>
        
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Payment Status
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
            Deposit Amount (MAD)
          </label>
          <input
            type="number"
            value={formData.deposit_amount}
            onChange={(e) => handleInputChange('deposit_amount', parseFloat(e.target.value) || 0)}
            disabled={successfullySubmitted}
            className={`w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${successfullySubmitted ? 'opacity-50 cursor-not-allowed' : ''}`}
            min="0"
            step="0.01"
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
          disabled={successfullySubmitted}
        />
      </div>

      {/* Fuel Charge Toggle */}
<div className="mt-4">
  <FuelChargeToggle
    enabled={fuelChargeEnabled}
    onToggle={setFuelChargeEnabled}
    amount={fuelChargeAmount}
    rentalType={formData.rental_type}
    disabled={successfullySubmitted}
  />
</div>

      {/* Additional Options */}
      <CollapsibleSection title="Additional Options" defaultOpen={false}>
        <div className="space-y-3">
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={formData.insurance_included}
              onChange={(e) => handleInputChange('insurance_included', e.target.checked)}
              disabled={successfullySubmitted}
              className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
            />
            <span className="text-gray-700">Insurance Included</span>
          </label>
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={formData.helmet_included}
              onChange={(e) => handleInputChange('helmet_included', e.target.checked)}
              disabled={successfullySubmitted}
              className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
            />
            <span className="text-gray-700">Helmet Included</span>
          </label>
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={formData.gear_included}
              onChange={(e) => handleInputChange('gear_included', e.target.checked)}
              disabled={successfullySubmitted}
              className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
            />
            <span className="text-gray-700">Gear Included</span>
          </label>
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={formData.contract_signed}
              onChange={(e) => handleInputChange('contract_signed', e.target.checked)}
              disabled={successfullySubmitted}
              className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
            />
            <span className="text-gray-700">Contract Signed</span>
          </label>
        </div>
      </CollapsibleSection>

      {/* Accessories / Notes */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Accessories / Notes
        </label>
        <textarea
          value={formData.accessories}
          onChange={(e) => handleInputChange('accessories', e.target.value)}
          disabled={successfullySubmitted}
          className={`w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${successfullySubmitted ? 'opacity-50 cursor-not-allowed' : ''}`}
          rows="3"
          placeholder="Any additional accessories or notes..."
        />
      </div>
    </div>
  </div>
)}

        <div className="p-4 sm:p-6 border-t border-gray-200 bg-gray-50 rounded-b-xl">
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
                  Back
                </button>
              )}
              
              <button
                type="button"
                onClick={handleReset}
                className="px-4 py-3 sm:py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 active:bg-gray-200 transition-colors flex-1 sm:flex-none touch-manipulation"
                disabled={submitting || isSubmitting || successfullySubmitted}
              >
                Reset Form
              </button>
              
              {onCancel && (
                <button
                  type="button"
                  onClick={onCancel}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-100 transition-colors flex-1 sm:flex-none"
                  disabled={submitting || isSubmitting || successfullySubmitted}
                >
                  Cancel
                </button>
              )}
            </div>
            
            <div className="flex-1 flex gap-3 justify-end">
              {currentStep < 3 ? (
                <button
                  type="button"
                  onClick={handleNext}
                  disabled={submitting || isSubmitting || successfullySubmitted || (currentStep === 1 && !formData.customer_licence_number?.trim())}
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium flex items-center justify-center flex-1 sm:flex-none disabled:opacity-50 disabled:cursor-not-allowed"
                  title={currentStep === 1 && !formData.customer_licence_number?.trim() ? "Please enter driver's license first" : ""}
                >
                  {submitting || isSubmitting ? (
                    <>
                      <Loader className="w-4 h-4 mr-2 animate-spin" />
                      Loading...
                    </>
                  ) : currentStep === 1 && !formData.customer_licence_number?.trim() ? (
                    <>
                      <AlertCircle className="w-4 h-4 mr-2" />
                      Enter License
                    </>
                  ) : (
                    <>
                      Next
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
                  disabled={submitting || isSubmitting || isLoading || successfullySubmitted}
                  className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium flex items-center justify-center flex-1 sm:flex-none disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {submitting || isSubmitting || isLoading ? (
                    <>
                      <Loader className="w-4 h-4 mr-2 animate-spin" />
                      {mode === 'edit' ? 'Updating...' : 'Creating...'}
                    </>
                  ) : (
                    mode === 'edit' ? 'Update Rental' : 'Create Rental'
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      </form>

      {showIDScanModal && (
        <EnhancedUnifiedIDScanModal
          isOpen={showIDScanModal}
          onClose={() => {
            setShowIDScanModal(false);
          }}
          onScanComplete={(scannedData, imageFile) => {
            handleIDScanComplete(scannedData, imageFile);
            setShowIDScanModal(false);
          }}
          onCustomerSaved={(savedCustomer, image) => {
            handleCustomerSaved(savedCustomer, image);
            setShowIDScanModal(false);
          }}
          customerId={formData.customer_id}
          title="Scan ID Document"
        />
      )}

      {showSecondDriverScanModal && (
        <SecondDriverIDScanModal
          isOpen={showSecondDriverScanModal}
          onClose={() => setShowSecondDriverScanModal(false)}
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
            
            setSecondDrivers(prev => [...prev, enhancedDriverData]);
            toast.success(`✅ Second driver "${enhancedDriverData.full_name}" added with ${enhancedDriverData.id_scan_url ? 'ID image' : 'no image'}`);
            setActiveTab('additional');
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
          rental={{
            customer_id: formData.customer_id,
            customer_name: formData.customer_name,
            customer_email: formData.customer_email,
            customer_phone: formData.customer_phone,
            customer_licence_number: formData.customer_licence_number,
            customer_id_image: formData.customer_id_image,
            id: selectedRentalForDrawer?.id || 'preview-rental-id'
          }}
          secondDrivers={secondDrivers}
        />
      )}
      </div>
  );
};

export default SimplifiedRentalWizard;
