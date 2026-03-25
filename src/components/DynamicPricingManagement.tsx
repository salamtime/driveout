import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Plus, Edit, Trash2, Search, Filter, DollarSign, CheckCircle, AlertCircle, RefreshCw, X, Save, Loader, Truck, Settings, TrendingUp, Clock, Calculator, Package, Info, Shield, Lock, Fuel, Route } from 'lucide-react';
import { calculateTieredPrice, getPricingOptions, formatPriceSource } from '../utils/pricingCalculations';
import KilometerPricingTab from './KilometerPricingTab';
import FuelPricingTab from './FuelPricingTab'; // NEW: Import Fuel Pricing Tab
import TourPackagesWorkspace from './admin/pricing/TourPackagesWorkspace';

interface BasePrice {
  id: string;
  vehicle_model_id: string;
  hourly_price: number;
  daily_price: number;
  weekly_price?: number;
  monthly_price?: number;
  is_active: boolean;
  price_source?: string;
  dynamic_pricing_enabled?: boolean;
  requires_manual_extension?: boolean;
  created_at: string;
  updated_at: string;
  vehicle_model?: {
    name: string;
    model: string;
    vehicle_type?: string;
  };
}

interface PricingTier {
  id: string;
  vehicle_model_id: string;
  min_hours: number;
  max_hours: number;
  price_amount: number;
  calculation_method: 'percentage' | 'fixed' | 'custom';
  discount_percentage?: number;
  is_active: boolean;
  duration_type?: string;
  min_days?: number;
  max_days?: number;
  daily_price_amount?: number;
  daily_calculation_method?: string;
  daily_discount_percentage?: number;
}

interface ExtensionRule {
  id: string;
  base_price_id: string;
  grace_period_minutes: number;
  extension_price_multiplier: number;
  auto_adjust_enabled: boolean;
  requires_manual_extension: boolean;
}

interface TransportFees {
  pickup_fee: number;
  dropoff_fee: number;
}

interface VehicleModel {
  id: string;
  name: string;
  model: string;
  vehicle_type?: string;
}

// NEW: Damage Deposit Interfaces
interface DamageDepositPreset {
  label: string;
  amount: number;
  enabled: boolean;
}

interface VehicleModelDepositSettings {
  [vehicleModelId: string]: DamageDepositPreset[];
}

interface DamageDepositSettings {
  vehicleModelPresets: VehicleModelDepositSettings;
  allowCustomDeposit: boolean;
}

// NEW: Tier Enforcement Interface
interface TierEnforcement {
  enabled: boolean;
  requireTierForExtensions: boolean;
  fallbackToHourly: boolean;
}

const PRICING_TAB_ITEMS = [
  { id: 'base', label: 'Base Prices', icon: DollarSign },
  { id: 'tiers', label: 'Pricing Tiers', icon: TrendingUp },
  { id: 'extensions', label: 'Extension Rules', icon: Clock },
  { id: 'transport', label: 'Transport Fees', icon: Truck },
  { id: 'tour-pricing', label: 'Tours & Booking', icon: Route },
  { id: 'packages', label: 'Kilometer Pricing', icon: Package },
  { id: 'deposits', label: 'Damage Deposits', icon: Shield },
  { id: 'fuel', label: 'Fuel Pricing', icon: Fuel },
] as const;

const DynamicPricingManagement: React.FC = () => {
  console.log('PRICING_MANAGEMENT: Loading with TIERED PRICING and FUEL PRICING support');

  // Tab state - UPDATED to include 'deposits' and 'fuel'
  const [activeTab, setActiveTab] = useState<'base' | 'tiers' | 'extensions' | 'transport' | 'packages' | 'tour-pricing' | 'deposits' | 'fuel'>('base');

  // State for Base Prices
  const [basePrices, setBasePrices] = useState<BasePrice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedVehicleForBasePrices, setSelectedVehicleForBasePrices] = useState<string>('');
  const [showBasePriceForm, setShowBasePriceForm] = useState(false);
  const [editingPrice, setEditingPrice] = useState<BasePrice | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // State for Pricing Tiers
  const [pricingTiers, setPricingTiers] = useState<PricingTier[]>([]);
  const [showTierForm, setShowTierForm] = useState(false);
  const [editingTier, setEditingTier] = useState<PricingTier | null>(null);
  const [selectedVehicleForTiers, setSelectedVehicleForTiers] = useState<string>('');
  const [tierDurationFilter, setTierDurationFilter] = useState<'hours' | 'days'>('hours');

  // State for Extension Rules
  const [extensionRules, setExtensionRules] = useState<ExtensionRule[]>([]);
  const [showExtensionForm, setShowExtensionForm] = useState(false);
  const [editingExtension, setEditingExtension] = useState<ExtensionRule | null>(null);

  // State for Transport Fees
  const [transportFees, setTransportFees] = useState<TransportFees>({
    pickup_fee: 0,
    dropoff_fee: 0
  });
  const [savingTransportFees, setSavingTransportFees] = useState(false);
  const [transportFeeError, setTransportFeeError] = useState<string | null>(null);
  const [transportFeeSuccess, setTransportFeeSuccess] = useState<string | null>(null);

  // NEW: State for Damage Deposit Configuration
  const [depositSettings, setDepositSettings] = useState<DamageDepositSettings>({
    vehicleModelPresets: {},
    allowCustomDeposit: true
  });
  const [selectedVehicleForDeposits, setSelectedVehicleForDeposits] = useState<string>('');
  const [savingDepositSettings, setSavingDepositSettings] = useState(false);
  const [depositSettingsError, setDepositSettingsError] = useState<string | null>(null);
  const [depositSettingsSuccess, setDepositSettingsSuccess] = useState<string | null>(null);

  // NEW: State for Tier Enforcement
  const [tierEnforcement, setTierEnforcement] = useState<TierEnforcement>({
    enabled: true,
    requireTierForExtensions: true,
    fallbackToHourly: false
  });
  const [savingTierEnforcement, setSavingTierEnforcement] = useState(false);
  const [tierEnforcementError, setTierEnforcementError] = useState<string | null>(null);
  const [tierEnforcementSuccess, setTierEnforcementSuccess] = useState<string | null>(null);

  // State for Price Calculator Preview
  const [previewVehicleId, setPreviewVehicleId] = useState<string>('');
  const [previewBaseRate, setPreviewBaseRate] = useState<number>(100);
  const [previewOptions, setPreviewOptions] = useState<any[]>([]);
  const [loadingPreview, setLoadingPreview] = useState(false);

  // State for Vehicle Models
  const [vehicleModels, setVehicleModels] = useState<VehicleModel[]>([]);

  // Base Price Form data
  const [basePriceFormData, setBasePriceFormData] = useState({
    vehicle_model_id: '',
    hourly_price: 0,
    daily_price: 0,
    weekly_price: 0,
    monthly_price: 0,
    is_active: true,
    price_source: 'auto' as 'auto' | 'manual' | 'negotiated',
    dynamic_pricing_enabled: true
  });

  // Tier Form data
  const [tierFormData, setTierFormData] = useState<any>({
    vehicle_model_id: '',
    duration_mode: 'single',
    min_hours: 1,
    max_hours: 1,
    price_amount: 0,
    calculation_method: 'fixed' as 'percentage' | 'fixed' | 'custom',
    discount_percentage: 0,
    is_active: true,
    duration_type: 'hours',
    min_days: 1,
    max_days: 1,
    daily_price_amount: 0,
    daily_calculation_method: 'fixed',
    daily_discount_percentage: 0
  });

  // Extension Form data
  const [extensionFormData, setExtensionFormData] = useState({
    base_price_id: '',
    grace_period_minutes: 15,
    extension_price_multiplier: 1.0,
    auto_adjust_enabled: true,
    requires_manual_extension: false
  });

  // Transport Fee Form data
  const [transportFeeFormData, setTransportFeeFormData] = useState({
    pickup_fee: 0,
    dropoff_fee: 0
  });


  // Fetch vehicle models - FIXED to use correct column names
  const fetchVehicleModels = async () => {
    try {
      console.log('🔄 Fetching vehicle models from database...');
      const { data, error } = await supabase
        .from('saharax_0u4w4d_vehicle_models')
        .select('id, name, model, vehicle_type')
        .eq('is_active', true)
        .order('name', { ascending: true });
      
      if (error) {
        console.error('❌ Supabase error fetching vehicle models:', error);
        throw error;
      }
      
      if (!data || data.length === 0) {
        console.warn('⚠️ No vehicle models found in database');
        setVehicleModels([]);
        return;
      }
      
      console.log(`✅ Loaded ${data.length} vehicle models:`, data);
      setVehicleModels(data);
    } catch (error: any) {
      console.error('❌ Error fetching vehicle models:', error);
      setError(`Failed to load vehicle models: ${error.message}`);
    }
  };

  // NEW: Fetch tier enforcement settings
  const fetchTierEnforcementSettings = async () => {
    try {
      console.log('📡 Loading tier enforcement settings...');
      
      const { data, error } = await supabase
        .from('app_settings')
        .select('tier_pricing_enabled, require_tier_for_extensions, fallback_to_hourly')
        .eq('id', 1)
        .single();

      if (error) throw error;

      if (data) {
        setTierEnforcement({
          enabled: data.tier_pricing_enabled ?? true,
          requireTierForExtensions: data.require_tier_for_extensions ?? true,
          fallbackToHourly: data.fallback_to_hourly ?? false
        });
        console.log('✅ Loaded tier enforcement settings:', data);
      }
    } catch (error: any) {
      console.log('🔄 Using default tier enforcement settings:', error.message);
      // Keep default values if database fetch fails
    }
  };

  // NEW: Fetch deposit settings from database
  const fetchDepositSettings = async () => {
    try {
      console.log('📡 Loading deposit settings from app_settings...');
      
      const { data, error } = await supabase
        .from('app_settings')
        .select('damage_deposit_presets, allow_custom_deposit')
        .eq('id', 1)
        .single();

      if (error) throw error;

      if (data && data.damage_deposit_presets) {
        const presets = data.damage_deposit_presets;
        
        // If it's an object with vehicle model IDs as keys, use it directly
        if (typeof presets === 'object' && !Array.isArray(presets)) {
          setDepositSettings({
            vehicleModelPresets: presets,
            allowCustomDeposit: data.allow_custom_deposit ?? true
          });
          console.log('✅ Loaded vehicle model-based deposit settings:', presets);
        } else {
          // Legacy format: initialize empty vehicle model structure
          console.log('⚠️ Legacy deposit format detected, initializing vehicle model-based structure');
          setDepositSettings({
            vehicleModelPresets: {},
            allowCustomDeposit: data.allow_custom_deposit ?? true
          });
        }
      }
    } catch (error: any) {
      console.log('🔄 Using default deposit settings:', error.message);
      // Keep default values if database fetch fails
    }
  };

  // Fetch ALL data from database
  const fetchData = async () => {
    console.log('🔄 Fetching ALL pricing data from database...');
    setLoading(true);
    setError(null);
    
    try {
      // Fetch Vehicle Models first
      await fetchVehicleModels();

      // Fetch Base Prices
      const { data: pricesData, error: pricesError } = await supabase
        .from('app_4c3a7a6153_base_prices')
        .select(`
          *,
          vehicle_model:saharax_0u4w4d_vehicle_models (
            name,
            model,
            vehicle_type
          )
        `)
        .order('created_at', { ascending: false });

      if (pricesError) {
        console.error('❌ Base prices error details:', pricesError);
        throw new Error(`Base prices error: ${pricesError.message}`);
      }

      console.log(`✅ Loaded ${pricesData?.length || 0} base prices`);
      setBasePrices(pricesData || []);

      // Fetch Pricing Tiers
      const { data: tiersData, error: tiersError } = await supabase
        .from('pricing_tiers')
        .select('*')
        .order('min_hours', { ascending: true });

      if (tiersError) {
        console.error('❌ Pricing tiers error:', tiersError);
      } else {
        console.log(`✅ Loaded ${tiersData?.length || 0} pricing tiers`);
        setPricingTiers(tiersData || []);
      }

      // Fetch Extension Rules
      const { data: rulesData, error: rulesError } = await supabase
        .from('rental_extension_rules')
        .select('*');

      if (rulesError) {
        console.error('❌ Extension rules error:', rulesError);
      } else {
        console.log(`✅ Loaded ${rulesData?.length || 0} extension rules`);
        setExtensionRules(rulesData || []);
      }

      // Load Transport Fees
      console.log('📡 Loading transport fees from app_settings table...');
      
      try {
        const { data: dbData, error: dbError } = await supabase
          .from('app_settings')
          .select('transport_pickup_fee, transport_dropoff_fee')
          .eq('id', 1)
          .single();

        if (dbError) throw dbError;

        const fees = {
          pickup_fee: Number(dbData.transport_pickup_fee) || 0,
          dropoff_fee: Number(dbData.transport_dropoff_fee) || 0
        };
        
        console.log('✅ Loaded transport fees from database:', fees);
        setTransportFees(fees);
        setTransportFeeFormData(fees);
        
      } catch (dbError) {
        console.log('🔄 Database failed, trying localStorage...');
        const stored = localStorage.getItem('mgx_transport_fees_settings');
        if (stored) {
          const parsed = JSON.parse(stored);
          const fees = {
            pickup_fee: Number(parsed.pickup_fee) || 0,
            dropoff_fee: Number(parsed.dropoff_fee) || 0
          };
          setTransportFees(fees);
          setTransportFeeFormData(fees);
        }
      }

      // NEW: Fetch Tier Enforcement Settings
      await fetchTierEnforcementSettings();

      // NEW: Fetch Deposit Settings
      await fetchDepositSettings();

    } catch (error: any) {
      console.error('❌ Error fetching data:', error);
      setError(`Failed to load data: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [refreshTrigger]);

  // Helper function to get vehicle model display name
  const getVehicleModelName = (vehicleModelId: string): string => {
    const model = vehicleModels.find(v => v.id === vehicleModelId);
    if (model) {
      return model.name; // Use the full name (e.g., "SEGWAY AT5")
    }
    return vehicleModelId;
  };

  // NEW: Helper to get current vehicle's presets
  const getCurrentVehiclePresets = (): DamageDepositPreset[] => {
    if (!selectedVehicleForDeposits) return [];
    return depositSettings.vehicleModelPresets[selectedVehicleForDeposits] || [];
  };


  // ==================== TIER ENFORCEMENT FUNCTIONS ====================
  const saveTierEnforcementSettings = async () => {
    setSavingTierEnforcement(true);
    setTierEnforcementError(null);
    setTierEnforcementSuccess(null);

    try {
      const { error } = await supabase
        .from('app_settings')
        .upsert({
          id: 1,
          tier_pricing_enabled: tierEnforcement.enabled,
          require_tier_for_extensions: tierEnforcement.requireTierForExtensions,
          fallback_to_hourly: tierEnforcement.fallbackToHourly,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'id'
        });

      if (error) throw error;

      setTierEnforcementSuccess('✅ Tier enforcement settings saved!');
      setTimeout(() => setTierEnforcementSuccess(null), 3000);

    } catch (error: any) {
      console.error('❌ Error saving tier enforcement:', error);
      setTierEnforcementError(`Failed: ${error.message}`);
    } finally {
      setSavingTierEnforcement(false);
    }
  };

  const validateTierConfiguration = async (tierData: any) => {
  if (!tierData.vehicle_model_id || 
      (tierData.duration_type === 'hours' && !tierData.price_amount) ||
      (tierData.duration_type === 'days' && !tierData.daily_price_amount)) {
    alert('Please fill in vehicle model and price first');
    return;
  }

  try {
    const minField = tierData.duration_type === 'hours' ? 'min_hours' : 'min_days';
    const maxField = tierData.duration_type === 'days' ? 'max_days' : 'max_hours';
    const minValue = tierData[minField];
    const maxValue = tierData[maxField];

    // Check for overlapping tiers
    const { data: overlappingTiers } = await supabase
      .from('pricing_tiers')
      .select('*')
      .eq('vehicle_model_id', tierData.vehicle_model_id)
      .eq('duration_type', tierData.duration_type)
      .eq('is_active', true)
      .neq('id', editingTier?.id || '')
      .or(`and(${minField}.lte.${maxValue},${maxField}.gte.${minValue})`);

    if (overlappingTiers && overlappingTiers.length > 0) {
      const firstOverlap = overlappingTiers[0];
      const overlapRange = tierData.duration_type === 'hours' 
        ? `${firstOverlap.min_hours}-${firstOverlap.max_hours}h`
        : `${firstOverlap.min_days}-${firstOverlap.max_days} days`;
      
      alert(`⚠️ Overlapping tier found!\n\nExisting ${tierData.duration_type} tier: ${overlapRange}\nPrice: ${formatCurrency(firstOverlap.price_amount || firstOverlap.daily_price_amount)} MAD\n\nConsider adjusting your min/max values.`);
      return;
    }

    // Check if this creates any gaps
    const { data: allTiers } = await supabase
      .from('pricing_tiers')
      .select('*')
      .eq('vehicle_model_id', tierData.vehicle_model_id)
      .eq('duration_type', tierData.duration_type)
      .eq('is_active', true)
      .neq('id', editingTier?.id || '')
      .order(minField, { ascending: true });

    // Analyze coverage
    const tiers = allTiers || [];
    tiers.push({
      [minField]: minValue,
      [maxField]: maxValue
    });
    tiers.sort((a: any, b: any) => a[minField] - b[minField]);

    let gaps = [];
    for (let i = 0; i < tiers.length - 1; i++) {
      if (tiers[i][maxField] + 1 < tiers[i + 1][minField]) {
        gaps.push(`${tiers[i][maxField] + 1}-${tiers[i + 1][minField] - 1} ${tierData.duration_type}`);
      }
    }

    if (gaps.length > 0) {
      alert(`⚠️ Gap detected!\n\nMissing coverage for: ${gaps.join(', ')}\n\nCustomers won't be able to request extensions in these ranges.`);
    } else {
      alert(`✅ ${tierData.duration_type === 'hours' ? 'Hourly' : 'Daily'} tier configuration is valid!`);
    }
  } catch (error) {
    console.error('Validation error:', error);
    alert('Failed to validate tier configuration');
  }
};

  // ==================== BASE PRICES FUNCTIONS ====================
  const resetBasePriceForm = () => {
    setBasePriceFormData({
      vehicle_model_id: '',
      hourly_price: 0,
      daily_price: 0,
      weekly_price: 0,
      monthly_price: 0,
      is_active: true,
      price_source: 'auto',
      dynamic_pricing_enabled: true
    });
    setShowBasePriceForm(false);
    setEditingPrice(null);
  };

  const handleEditBasePrice = (price: BasePrice) => {
    setBasePriceFormData({
      vehicle_model_id: price.vehicle_model_id,
      hourly_price: price.hourly_price,
      daily_price: price.daily_price,
      weekly_price: price.weekly_price || 0,
      monthly_price: price.monthly_price || 0,
      is_active: price.is_active,
      price_source: (price.price_source as any) || 'auto',
      dynamic_pricing_enabled: price.dynamic_pricing_enabled ?? true
    });
    setEditingPrice(price);
    setShowBasePriceForm(true);
  };

  const handleDeleteBasePrice = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this price?')) return;

    try {
      const { error } = await supabase
        .from('app_4c3a7a6153_base_prices')
        .delete()
        .eq('id', id);

      if (error) throw error;

      setBasePrices(prev => prev.filter(price => price.id !== id));
      console.log('✅ Price deleted successfully');
    } catch (error: any) {
      console.error('❌ Error deleting price:', error);
      alert('Failed to delete price');
    }
  };

  const handleSubmitBasePrice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    
    setSubmitting(true);
    setError(null);

    try {
      if (!basePriceFormData.vehicle_model_id) {
        throw new Error('Vehicle model is required');
      }

      if (basePriceFormData.hourly_price <= 0 && basePriceFormData.daily_price <= 0) {
        throw new Error('At least one price (Hourly or Daily) must be greater than 0');
      }

      const priceData = {
        vehicle_model_id: basePriceFormData.vehicle_model_id,
        hourly_price: parseFloat(basePriceFormData.hourly_price.toString()),
        daily_price: parseFloat(basePriceFormData.daily_price.toString()),
        weekly_price: basePriceFormData.weekly_price ? parseFloat(basePriceFormData.weekly_price.toString()) : null,
        monthly_price: basePriceFormData.monthly_price ? parseFloat(basePriceFormData.monthly_price.toString()) : null,
        is_active: basePriceFormData.is_active,
        price_source: basePriceFormData.price_source,
        dynamic_pricing_enabled: basePriceFormData.dynamic_pricing_enabled,
        updated_at: new Date().toISOString()
      };

      let result;
      
      if (editingPrice) {
        const { data, error } = await supabase
          .from('app_4c3a7a6153_base_prices')
          .update(priceData)
          .eq('id', editingPrice.id)
          .select()
          .single();

        if (error) throw error;
        result = data;
        
        setBasePrices(prev => prev.map(price => 
          price.id === editingPrice.id ? { ...price, ...result } : price
        ));
        
        console.log('✅ Price updated:', result);
      } else {
        const { data, error } = await supabase
          .from('app_4c3a7a6153_base_prices')
          .insert([{
            ...priceData,
            created_at: new Date().toISOString()
          }])
          .select()
          .single();

        if (error) throw error;
        result = data;
        
        setBasePrices(prev => [result, ...prev]);
        
        console.log('✅ Price created:', result);
      }

      resetBasePriceForm();
      setRefreshTrigger(prev => prev + 1);

    } catch (error: any) {
      console.error('❌ Error saving price:', error);
      setError(error.message || 'Failed to save price');
    } finally {
      setSubmitting(false);
    }
  };

  // ==================== PRICING TIERS FUNCTIONS ====================
  const resetTierForm = () => {
    setTierFormData({
      vehicle_model_id: '',
      duration_mode: 'single',
      min_hours: 1,
      max_hours: 1,
      price_amount: 0,
      calculation_method: 'fixed',
      discount_percentage: 0,
      is_active: true,
      duration_type: 'hours',
      min_days: 1,
      max_days: 1,
      daily_price_amount: 0,
      daily_calculation_method: 'fixed',
      daily_discount_percentage: 0
    });
    setShowTierForm(false);
    setEditingTier(null);
  };

  const handleEditTier = (tier: PricingTier) => {
  setTierFormData({
    vehicle_model_id: tier.vehicle_model_id,
    duration_mode: (tier.duration_type === 'days'
      ? (tier.min_days || 1) === (tier.max_days || 1)
      : (tier.min_hours || 1) === (tier.max_hours || 1)) ? 'single' : 'range',
    min_hours: tier.min_hours || 1,
    max_hours: tier.max_hours || 2,
    price_amount: tier.price_amount || 0,
    calculation_method: tier.calculation_method || 'fixed',
    discount_percentage: tier.discount_percentage || 0,
    is_active: tier.is_active,
    // NEW: Add daily price fields
    duration_type: tier.duration_type || 'hours',
    min_days: tier.min_days || 1,
    max_days: tier.max_days || 2,
    daily_price_amount: tier.daily_price_amount || 0,
    daily_calculation_method: tier.daily_calculation_method || 'fixed',
    daily_discount_percentage: tier.daily_discount_percentage || 0
  });
  setEditingTier(tier);
  setShowTierForm(true);
};

  const handleDeleteTier = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this tier?')) return;

    try {
      const { error } = await supabase
        .from('pricing_tiers')
        .delete()
        .eq('id', id);

      if (error) throw error;

      setPricingTiers(prev => prev.filter(tier => tier.id !== id));
      console.log('✅ Tier deleted successfully');
    } catch (error: any) {
      console.error('❌ Error deleting tier:', error);
      alert('Failed to delete tier');
    }
  };

  const handleSubmitTier = async (e: React.FormEvent) => {
  e.preventDefault();
  if (submitting) return;
  
  setSubmitting(true);

  try {
    const tierData = {
      vehicle_model_id: tierFormData.vehicle_model_id,
      min_hours: tierFormData.duration_type === 'hours' ? parseInt(tierFormData.min_hours.toString()) : null,
      max_hours: tierFormData.duration_type === 'hours' ? parseInt(tierFormData.max_hours.toString()) : null,
      price_amount: tierFormData.duration_type === 'hours' ? parseFloat(tierFormData.price_amount.toString()) : null,
      calculation_method: tierFormData.duration_type === 'hours' ? tierFormData.calculation_method : null,
      discount_percentage: tierFormData.duration_type === 'hours' && tierFormData.calculation_method === 'percentage' 
        ? parseFloat(tierFormData.discount_percentage.toString()) 
        : null,
      // NEW: Daily price fields
      min_days: tierFormData.duration_type === 'days' ? parseInt(tierFormData.min_days.toString()) : null,
      max_days: tierFormData.duration_type === 'days' ? parseInt(tierFormData.max_days.toString()) : null,
      daily_price_amount: tierFormData.duration_type === 'days' ? parseFloat(tierFormData.daily_price_amount.toString()) : null,
      daily_calculation_method: tierFormData.duration_type === 'days' ? tierFormData.daily_calculation_method : null,
      daily_discount_percentage: tierFormData.duration_type === 'days' && tierFormData.daily_calculation_method === 'percentage'
        ? parseFloat(tierFormData.daily_discount_percentage.toString())
        : null,
      duration_type: tierFormData.duration_type,
      is_active: tierFormData.is_active,
      updated_at: new Date().toISOString()
    };

    if (editingTier) {
      const { data, error } = await supabase
        .from('pricing_tiers')
        .update(tierData)
        .eq('id', editingTier.id)
        .select()
        .single();

      if (error) throw error;
      
      setPricingTiers(prev => prev.map(tier => 
        tier.id === editingTier.id ? data : tier
      ));
    } else {
      const { data, error } = await supabase
        .from('pricing_tiers')
        .insert([{
          ...tierData,
          created_at: new Date().toISOString()
        }])
        .select()
        .single();

      if (error) throw error;
      
      setPricingTiers(prev => [...prev, data]);
    }

    resetTierForm();
    setRefreshTrigger(prev => prev + 1);

  } catch (error: any) {
    console.error('❌ Error saving tier:', error);
    alert(error.message || 'Failed to save tier');
  } finally {
    setSubmitting(false);
  }
};

  // ==================== EXTENSION RULES FUNCTIONS ====================
  const resetExtensionForm = () => {
    setExtensionFormData({
      base_price_id: '',
      grace_period_minutes: 15,
      extension_price_multiplier: 1.0,
      auto_adjust_enabled: true,
      requires_manual_extension: false
    });
    setShowExtensionForm(false);
    setEditingExtension(null);
  };

  const handleEditExtension = (rule: ExtensionRule) => {
    setExtensionFormData({
      base_price_id: rule.base_price_id,
      grace_period_minutes: rule.grace_period_minutes,
      extension_price_multiplier: rule.extension_price_multiplier,
      auto_adjust_enabled: rule.auto_adjust_enabled,
      requires_manual_extension: rule.requires_manual_extension
    });
    setEditingExtension(rule);
    setShowExtensionForm(true);
  };

  const handleDeleteExtension = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this extension rule?')) return;

    try {
      const { error } = await supabase
        .from('rental_extension_rules')
        .delete()
        .eq('id', id);

      if (error) throw error;

      setExtensionRules(prev => prev.filter(rule => rule.id !== id));
      console.log('✅ Extension rule deleted successfully');
    } catch (error: any) {
      console.error('❌ Error deleting extension rule:', error);
      alert('Failed to delete extension rule');
    }
  };

  const handleSubmitExtension = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    
    setSubmitting(true);

    try {
      const ruleData = {
        base_price_id: extensionFormData.base_price_id,
        grace_period_minutes: parseInt(extensionFormData.grace_period_minutes.toString()),
        extension_price_multiplier: parseFloat(extensionFormData.extension_price_multiplier.toString()),
        auto_adjust_enabled: extensionFormData.auto_adjust_enabled,
        requires_manual_extension: extensionFormData.requires_manual_extension,
        updated_at: new Date().toISOString()
      };

      if (editingExtension) {
        const { data, error } = await supabase
          .from('rental_extension_rules')
          .update(ruleData)
          .eq('id', editingExtension.id)
          .select()
          .single();

        if (error) throw error;
        
        setExtensionRules(prev => prev.map(rule => 
          rule.id === editingExtension.id ? data : rule
        ));
      } else {
        const { data, error } = await supabase
          .from('rental_extension_rules')
          .insert([{
            ...ruleData,
            created_at: new Date().toISOString()
          }])
          .select()
          .single();

        if (error) throw error;
        
        setExtensionRules(prev => [...prev, data]);
      }

      resetExtensionForm();
      setRefreshTrigger(prev => prev + 1);

    } catch (error: any) {
      console.error('❌ Error saving extension rule:', error);
      alert(error.message || 'Failed to save extension rule');
    } finally {
      setSubmitting(false);
    }
  };

  // ==================== PRICE CALCULATOR PREVIEW ====================
  const loadPricingPreview = async () => {
    if (!previewVehicleId || previewBaseRate <= 0) return;

    setLoadingPreview(true);
    try {
      const options = await getPricingOptions(previewVehicleId, previewBaseRate, 24);
      setPreviewOptions(options);
    } catch (error) {
      console.error('Error loading pricing preview:', error);
    } finally {
      setLoadingPreview(false);
    }
  };

  useEffect(() => {
    if (previewVehicleId && previewBaseRate > 0) {
      loadPricingPreview();
    }
  }, [previewVehicleId, previewBaseRate]);

  // ==================== TRANSPORT FEES FUNCTIONS ====================
  const handleTransportFeeChange = (field: keyof TransportFees, value: string) => {
    const numValue = parseFloat(value) || 0;
    setTransportFeeFormData(prev => ({
      ...prev,
      [field]: numValue
    }));
  };

  const handleSaveTransportFees = async (e: React.FormEvent) => {
    e.preventDefault();
    if (savingTransportFees) return;
    
    setSavingTransportFees(true);
    setTransportFeeError(null);
    setTransportFeeSuccess(null);

    try {
      if (transportFeeFormData.pickup_fee < 0 || transportFeeFormData.dropoff_fee < 0) {
        throw new Error('Fees cannot be negative');
      }

      const { data: dbData, error: dbError } = await supabase
        .from('app_settings')
        .upsert({
          id: 1,
          transport_pickup_fee: transportFeeFormData.pickup_fee,
          transport_dropoff_fee: transportFeeFormData.dropoff_fee,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'id'
        })
        .select()
        .single();

      if (dbError) throw new Error(`Database error: ${dbError.message}`);

      localStorage.setItem('mgx_transport_fees_settings', JSON.stringify({
        pickup_fee: transportFeeFormData.pickup_fee,
        dropoff_fee: transportFeeFormData.dropoff_fee,
        updated_at: new Date().toISOString(),
        source: 'database'
      }));
      
      setTransportFees(transportFeeFormData);
      setTransportFeeSuccess('✅ Transport fees saved successfully!');
      
      setTimeout(() => setTransportFeeSuccess(null), 3000);

    } catch (error: any) {
      console.error('❌ Error saving transport fees:', error);
      setTransportFeeError(`Failed: ${error.message}`);
    } finally {
      setSavingTransportFees(false);
    }
  };

  const resetTransportFees = () => {
    setTransportFeeFormData(transportFees);
    setTransportFeeError(null);
    setTransportFeeSuccess(null);
  };

  // ==================== DAMAGE DEPOSIT FUNCTIONS ====================
  const handleAddPresetForVehicle = () => {
    if (!selectedVehicleForDeposits) {
      setDepositSettingsError('Please select a vehicle model first');
      setTimeout(() => setDepositSettingsError(null), 3000);
      return;
    }

    const currentPresets = getCurrentVehiclePresets();
    if (currentPresets.length >= 3) {
      setDepositSettingsError('Maximum 3 presets allowed per vehicle model');
      setTimeout(() => setDepositSettingsError(null), 3000);
      return;
    }

    const newPreset: DamageDepositPreset = {
      label: `Preset ${currentPresets.length + 1}`,
      amount: 0,
      enabled: true
    };

    setDepositSettings(prev => ({
      ...prev,
      vehicleModelPresets: {
        ...prev.vehicleModelPresets,
        [selectedVehicleForDeposits]: [...currentPresets, newPreset]
      }
    }));
  };

  const handleUpdatePresetForVehicle = (index: number, field: keyof DamageDepositPreset, value: any) => {
    if (!selectedVehicleForDeposits) return;

    const currentPresets = getCurrentVehiclePresets();
    const updatedPresets = currentPresets.map((preset, i) => 
      i === index ? { ...preset, [field]: value } : preset
    );

    setDepositSettings(prev => ({
      ...prev,
      vehicleModelPresets: {
        ...prev.vehicleModelPresets,
        [selectedVehicleForDeposits]: updatedPresets
      }
    }));
  };

  const handleDeletePresetForVehicle = (index: number) => {
    if (!selectedVehicleForDeposits) return;

    const currentPresets = getCurrentVehiclePresets();
    const updatedPresets = currentPresets.filter((_, i) => i !== index);

    setDepositSettings(prev => ({
      ...prev,
      vehicleModelPresets: {
        ...prev.vehicleModelPresets,
        [selectedVehicleForDeposits]: updatedPresets
      }
    }));
  };

  const handleSaveDepositSettings = async () => {
    setSavingDepositSettings(true);
    setDepositSettingsError(null);
    setDepositSettingsSuccess(null);

    try {
      // Validation for all vehicle models
      Object.entries(depositSettings.vehicleModelPresets).forEach(([vehicleId, presets]) => {
        presets.forEach((preset, index) => {
          if (preset.amount < 0) {
            const vehicleName = getVehicleModelName(vehicleId);
            throw new Error(`Deposit amounts must be positive for ${vehicleName}`);
          }
          if (!preset.label.trim()) {
            const vehicleName = getVehicleModelName(vehicleId);
            throw new Error(`All presets must have a label for ${vehicleName}`);
          }
        });
      });

      const { error } = await supabase
        .from('app_settings')
        .upsert({
          id: 1,
          damage_deposit_presets: depositSettings.vehicleModelPresets,
          allow_custom_deposit: depositSettings.allowCustomDeposit,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'id'
        });

      if (error) throw error;

      setDepositSettingsSuccess('✅ Deposit settings saved successfully!');
      setTimeout(() => setDepositSettingsSuccess(null), 3000);

    } catch (error: any) {
      console.error('❌ Error saving deposit settings:', error);
      setDepositSettingsError(`Failed: ${error.message}`);
    } finally {
      setSavingDepositSettings(false);
    }
  };

  // ==================== UI HELPERS ====================
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'MAD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  };

  const getStatusColor = (isActive: boolean) => {
    return isActive 
      ? 'bg-green-100 text-green-800 border-green-200' 
      : 'bg-red-100 text-red-800 border-red-200';
  };

  const filteredPrices = basePrices.filter(price => {
    const matchesSearch = searchTerm === '' || 
      price.vehicle_model?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      price.vehicle_model?.model?.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesVehicle = selectedVehicleForBasePrices === '' ||
      price.vehicle_model_id === selectedVehicleForBasePrices;
    
    const matchesStatus = statusFilter === 'all' || 
      (statusFilter === 'active' && price.is_active) ||
      (statusFilter === 'inactive' && !price.is_active);
    
    return matchesSearch && matchesStatus && matchesVehicle;
  });

  const groupedBasePrices = vehicleModels
    .map((model) => ({
      model,
      prices: filteredPrices.filter((price) => price.vehicle_model_id === model.id),
    }))
    .filter((entry) => entry.prices.length > 0);

  const selectedBaseModel = vehicleModels.find((model) => model.id === basePriceFormData.vehicle_model_id);

  const filteredTiers = selectedVehicleForTiers 
    ? pricingTiers.filter(tier => tier.vehicle_model_id === selectedVehicleForTiers)
    : pricingTiers;

  const visibleTiers = filteredTiers
    .filter((tier) => (tier.duration_type || 'hours') === tierDurationFilter)
    .sort((a, b) => {
      const aMin = tierDurationFilter === 'days' ? (a.min_days || 0) : (a.min_hours || 0);
      const bMin = tierDurationFilter === 'days' ? (b.min_days || 0) : (b.min_hours || 0);
      return aMin - bMin;
    });

  const formatTierDuration = (tier: PricingTier) => {
    const type = tier.duration_type === 'days' ? 'day' : 'hour';
    const min = tier.duration_type === 'days' ? (tier.min_days || 0) : (tier.min_hours || 0);
    const max = tier.duration_type === 'days' ? (tier.max_days || 0) : (tier.max_hours || 0);

    if (min === max) {
      return `${min} ${type}${min === 1 ? '' : 's'}`;
    }

    return `${min}-${max} ${type}${max === 1 ? '' : 's'}`;
  };

  const getTierAmount = (tier: PricingTier) => (
    tier.duration_type === 'days'
      ? Number(tier.daily_price_amount || 0)
      : Number(tier.price_amount || 0)
  );

  const getTierMethodLabel = (tier: PricingTier) => {
    const method = tier.duration_type === 'days'
      ? tier.daily_calculation_method
      : tier.calculation_method;

    switch (method) {
      case 'fixed':
        return 'Fixed Price';
      case 'percentage':
        return 'Discount %';
      case 'custom':
        return 'Custom Formula';
      default:
        return 'Not set';
    }
  };

  const getTierDiscountValue = (tier: PricingTier) => (
    tier.duration_type === 'days'
      ? tier.daily_discount_percentage
      : tier.discount_percentage
  );

  const groupedVisibleTiers = vehicleModels
    .map((model) => ({
      model,
      tiers: visibleTiers.filter((tier) => tier.vehicle_model_id === model.id),
    }))
    .filter((entry) => entry.tiers.length > 0);

  const selectedTierModel = vehicleModels.find((model) => model.id === tierFormData.vehicle_model_id);
  const tierPreviewMin = tierFormData.duration_type === 'days' ? Number(tierFormData.min_days || 1) : Number(tierFormData.min_hours || 1);
  const tierPreviewMax = tierFormData.duration_type === 'days' ? Number(tierFormData.max_days || 1) : Number(tierFormData.max_hours || 1);
  const tierPreviewUnit = tierFormData.duration_type === 'days' ? 'day' : 'hour';
  const tierPreviewPrice = tierFormData.duration_type === 'days'
    ? Number(tierFormData.daily_price_amount || 0)
    : Number(tierFormData.price_amount || 0);
  const selectedDepositModel = vehicleModels.find((model) => model.id === selectedVehicleForDeposits);
  const depositOverview = vehicleModels.map((model) => {
    const presets = depositSettings.vehicleModelPresets[model.id] || [];
    const enabledPresets = presets.filter((preset) => preset.enabled);

    return {
      model,
      presets,
      enabledPresets,
      enabledCount: enabledPresets.length,
      totalAmount: enabledPresets.reduce((sum, preset) => sum + Number(preset.amount || 0), 0),
    };
  });
  const visibleDepositOverview = selectedVehicleForDeposits
    ? depositOverview.filter((entry) => entry.model.id === selectedVehicleForDeposits)
    : depositOverview;
  const configuredDepositModels = depositOverview.filter((entry) => entry.presets.length > 0);
  const totalEnabledDepositPresets = depositOverview.reduce((sum, entry) => sum + entry.enabledCount, 0);
  const groupedExtensionRules = vehicleModels
    .map((model) => ({
      model,
      rules: extensionRules.filter((rule) => {
        const basePrice = basePrices.find((price) => price.id === rule.base_price_id);
        return basePrice?.vehicle_model_id === model.id;
      }),
    }))
    .filter((entry) => entry.rules.length > 0);
  const selectedExtensionBasePrice = basePrices.find((price) => price.id === extensionFormData.base_price_id);
  const selectedExtensionVehicle = vehicleModels.find((model) => model.id === selectedExtensionBasePrice?.vehicle_model_id);
  const pricingWorkspaceStats = {
    vehicleModels: vehicleModels.length,
    activeBasePrices: basePrices.filter((price) => price.is_active).length,
    activeTiers: pricingTiers.filter((tier) => tier.is_active).length,
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-64"></div>
          <div className="h-4 bg-gray-200 rounded w-96"></div>
          <div className="h-12 bg-gray-200 rounded"></div>
          <div className="h-64 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="min-h-screen bg-gradient-to-br from-violet-50 via-white to-slate-50 overflow-hidden border border-slate-200">
        <div className="bg-gradient-to-r from-violet-700 via-violet-800 to-indigo-900 shadow-xl">
          <div className="px-4 sm:px-6 lg:px-8">
            <div className="border-b border-violet-500/20 py-6">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-white/10 p-2 backdrop-blur-sm">
                    <DollarSign className="h-8 w-8 text-white" />
                  </div>
                  <div>
                    <h1 className="text-2xl font-bold text-white sm:text-3xl">Pricing Management</h1>
                    <p className="mt-1 text-sm text-violet-200">
                      Manage rates, tiers, extensions, deposits, fuel, and tour pricing from one pricing workspace.
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <button
                    onClick={() => setRefreshTrigger(prev => prev + 1)}
                    className="inline-flex items-center rounded-lg border border-white/20 bg-white/10 px-4 py-2 text-white backdrop-blur-sm transition-all duration-200 hover:border-white/30 hover:bg-white/20"
                  >
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Refresh Pricing
                  </button>

                  <div className="inline-flex items-center rounded-lg border border-white/20 bg-white/10 px-4 py-2 text-white backdrop-blur-sm">
                    <CheckCircle className="mr-2 h-4 w-4" />
                    Pricing workspace active
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="border-b border-gray-200 bg-white shadow-sm">
          <div className="px-4 sm:px-6 lg:px-8">
            <nav className="flex flex-wrap gap-2 py-4" aria-label="Pricing tabs">
              {PRICING_TAB_ITEMS.map((item) => {
                const Icon = item.icon;
                const active = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setActiveTab(item.id)}
                    className={`group relative flex items-center whitespace-nowrap rounded-xl px-4 py-3 text-sm font-medium transition-all duration-200 ${
                      active
                        ? 'bg-gradient-to-r from-violet-600 to-indigo-700 text-white shadow-lg'
                        : 'text-slate-600 hover:bg-violet-50 hover:text-violet-700'
                    }`}
                  >
                    <Icon className={`mr-2 h-5 w-5 transition-transform duration-200 ${active ? 'scale-110' : 'group-hover:scale-105'}`} />
                    <span className="font-semibold">{item.label}</span>
                  </button>
                );
              })}
            </nav>
          </div>
        </div>

        <div className="px-4 py-6 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-7xl space-y-6">
            {/* Error Message */}
            {error && (
              <div className="rounded-2xl border border-red-200 bg-red-50 p-4">
                <div className="flex items-center gap-3">
                  <AlertCircle className="w-5 h-5 text-red-500" />
                  <div>
                    <p className="font-medium text-red-800">Error</p>
                    <p className="mt-1 text-sm text-red-700">{error}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Debug Info - Show vehicle models count */}
            {vehicleModels.length === 0 && (
              <div className="rounded-2xl border border-yellow-200 bg-yellow-50 p-4">
                <div className="flex items-center gap-3">
                  <AlertCircle className="w-5 h-5 text-yellow-500" />
                  <div>
                    <p className="font-medium text-yellow-800">No Vehicle Models Found</p>
                    <p className="mt-1 text-sm text-yellow-700">
                      Please add vehicle models first before creating pricing tiers. Check the browser console for more details.
                    </p>
                  </div>
                </div>
              </div>
            )}

            <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400">Pricing Workspace</p>
                  <h1 className="mt-2 text-3xl font-bold text-slate-900">
                    {PRICING_TAB_ITEMS.find((item) => item.id === activeTab)?.label}
                  </h1>
                  <p className="mt-2 max-w-3xl text-sm text-slate-600">
                    {activeTab === 'base' && 'Set core rental prices by model. This is the base layer other pricing rules build on top of.'}
                    {activeTab === 'tiers' && 'Shape longer rentals with duration tiers, discounts, and tier enforcement logic.'}
                    {activeTab === 'extensions' && 'Control overtime, grace windows, and how extended rentals are priced.'}
                    {activeTab === 'transport' && 'Manage pickup and drop-off charges without burying them inside system settings.'}
                    {activeTab === 'tour-pricing' && 'Price each tour package by quad model and flexible timing like 1h, 1.5h, 2h, and 2.5h.'}
                    {activeTab === 'packages' && 'Create kilometer-based packages with included distance and overage logic.'}
                    {activeTab === 'deposits' && 'Keep deposit presets consistent by model and by rental workflow.'}
                    {activeTab === 'fuel' && 'Set hourly and daily fuel line charges in the same workspace as the rest of pricing.'}
                  </p>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="rounded-lg bg-gradient-to-br from-slate-100 to-white px-4 py-3 text-center ring-1 ring-slate-200/80">
                    <p className="whitespace-nowrap text-[11px] font-medium uppercase tracking-wide text-slate-500">Models</p>
                    <p className="mt-1 text-2xl font-semibold text-slate-900">{pricingWorkspaceStats.vehicleModels}</p>
                  </div>
                  <div className="rounded-lg bg-violet-50 px-4 py-3 text-center ring-1 ring-violet-200/80">
                    <p className="whitespace-nowrap text-[11px] font-medium uppercase tracking-wide text-violet-600">Base Prices</p>
                    <p className="mt-1 text-2xl font-semibold text-violet-900">{pricingWorkspaceStats.activeBasePrices}</p>
                  </div>
                  <div className="rounded-lg bg-indigo-50 px-4 py-3 text-center ring-1 ring-indigo-200/80">
                    <p className="whitespace-nowrap text-[11px] font-medium uppercase tracking-wide text-indigo-600">Active Tiers</p>
                    <p className="mt-1 text-2xl font-semibold text-indigo-900">{pricingWorkspaceStats.activeTiers}</p>
                  </div>
                </div>
              </div>
            </section>

          </div>
        </div>

      {/* BASE PRICES TAB */}
      {activeTab === 'base' && (
        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-200 p-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Base Prices</h2>
                <p className="mt-1 text-sm text-gray-600">Set the standard hourly, daily, weekly, and monthly prices by vehicle model.</p>
              </div>
              <button
                onClick={() => setShowBasePriceForm(true)}
                className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700"
              >
                <Plus className="w-4 h-4" />
                Add Base Price
              </button>
            </div>

            <div className="mt-5 grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px_220px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search by vehicle model..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full rounded-xl border border-gray-300 py-2.5 pl-10 pr-4 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                />
              </div>

              <select
                value={selectedVehicleForBasePrices}
                onChange={(e) => setSelectedVehicleForBasePrices(e.target.value)}
                className="rounded-xl border border-gray-300 px-4 py-2.5 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              >
                <option value="">All Vehicle Models</option>
                {vehicleModels.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.name}
                  </option>
                ))}
              </select>

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="rounded-xl border border-gray-300 px-4 py-2.5 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              >
                <option value="all">All Status</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
          </div>

          <div className="p-6">
            {groupedBasePrices.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center">
                <p className="text-sm font-semibold text-slate-900">No base prices found</p>
                <p className="mt-1 text-sm text-slate-500">Add a base price or change the current filters.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {groupedBasePrices.map(({ model, prices }) => (
                  <div key={model.id} className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                    <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <h3 className="text-base font-semibold text-slate-900">{model.name}</h3>
                        <p className="mt-1 text-sm text-slate-500">{prices.length} base price record{prices.length === 1 ? '' : 's'}</p>
                      </div>
                      <span className="inline-flex self-start rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-600 border border-slate-200">
                        {model.vehicle_type || 'quad'}
                      </span>
                    </div>

                    <div className="mt-4 grid gap-3 xl:grid-cols-2">
                      {prices.map((price) => (
                        <div key={price.id} className="rounded-2xl border border-white bg-white p-4 shadow-sm">
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <div>
                              <div className="flex flex-wrap items-center gap-2">
                                <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${getStatusColor(price.is_active)}`}>
                                  {price.is_active ? 'Active' : 'Inactive'}
                                </span>
                                <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-600">
                                  {price.price_source || 'auto'}
                                </span>
                              </div>
                              <p className="mt-3 text-sm font-medium text-slate-500">Default rates</p>
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => handleEditBasePrice(price)}
                                className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-blue-600 transition hover:bg-blue-50"
                                title="Edit base price"
                              >
                                <Edit className="h-4 w-4" />
                              </button>
                              <button
                                onClick={() => handleDeleteBasePrice(price.id)}
                                className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-red-200 text-red-600 transition hover:bg-red-50"
                                title="Delete base price"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          </div>

                          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                            <div className="rounded-xl bg-slate-50 px-3 py-3">
                              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Hourly</p>
                              <p className="mt-2 text-base font-bold text-slate-900">{formatCurrency(price.hourly_price)}</p>
                            </div>
                            <div className="rounded-xl bg-slate-50 px-3 py-3">
                              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Daily</p>
                              <p className="mt-2 text-base font-bold text-slate-900">{formatCurrency(price.daily_price)}</p>
                            </div>
                            <div className="rounded-xl bg-slate-50 px-3 py-3">
                              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Weekly</p>
                              <p className="mt-2 text-base font-bold text-slate-900">{price.weekly_price ? formatCurrency(price.weekly_price) : '—'}</p>
                            </div>
                            <div className="rounded-xl bg-slate-50 px-3 py-3">
                              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Monthly</p>
                              <p className="mt-2 text-base font-bold text-slate-900">{price.monthly_price ? formatCurrency(price.monthly_price) : '—'}</p>
                            </div>
                          </div>

                          <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                            <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">
                              Dynamic pricing {price.dynamic_pricing_enabled ? 'enabled' : 'off'}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Base Price Form Modal */}
      {showBasePriceForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl shadow-xl max-w-2xl w-full">
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">
                {editingPrice ? 'Edit Base Price' : 'Add Base Price'}
              </h3>
              <button
                onClick={resetBasePriceForm}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitBasePrice} className="p-6 space-y-6">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Guided Base Price Setup</p>
                <p className="mt-2 text-sm text-slate-600">
                  Set the default rates that everything else builds on top of. Start with hourly and daily, then add weekly or monthly only if you use them.
                </p>
              </div>

              <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
                <div className="space-y-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Vehicle Model
                    </label>
                    <select
                      value={basePriceFormData.vehicle_model_id}
                      onChange={(e) => setBasePriceFormData({ ...basePriceFormData, vehicle_model_id: e.target.value })}
                      className="w-full rounded-xl border border-gray-300 px-3 py-2.5 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                      required
                    >
                      <option value="">Select a vehicle model</option>
                      {vehicleModels.map((model) => (
                        <option key={model.id} value={model.id}>
                          {model.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Hourly Price (MAD)
                      </label>
                      <input
                        type="number"
                        value={basePriceFormData.hourly_price}
                        onChange={(e) => setBasePriceFormData({ ...basePriceFormData, hourly_price: parseFloat(e.target.value) || 0 })}
                        className="w-full rounded-xl border border-gray-300 px-3 py-2.5 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                        min="0"
                        step="0.01"
                        placeholder="0.00"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Daily Price (MAD)
                      </label>
                      <input
                        type="number"
                        value={basePriceFormData.daily_price}
                        onChange={(e) => setBasePriceFormData({ ...basePriceFormData, daily_price: parseFloat(e.target.value) || 0 })}
                        className="w-full rounded-xl border border-gray-300 px-3 py-2.5 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                        min="0"
                        step="0.01"
                        placeholder="0.00"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Weekly Price (MAD)
                      </label>
                      <input
                        type="number"
                        value={basePriceFormData.weekly_price}
                        onChange={(e) => setBasePriceFormData({ ...basePriceFormData, weekly_price: parseFloat(e.target.value) || 0 })}
                        className="w-full rounded-xl border border-gray-300 px-3 py-2.5 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                        min="0"
                        step="0.01"
                        placeholder="Optional"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Monthly Price (MAD)
                      </label>
                      <input
                        type="number"
                        value={basePriceFormData.monthly_price}
                        onChange={(e) => setBasePriceFormData({ ...basePriceFormData, monthly_price: parseFloat(e.target.value) || 0 })}
                        className="w-full rounded-xl border border-gray-300 px-3 py-2.5 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                        min="0"
                        step="0.01"
                        placeholder="Optional"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Price Source
                    </label>
                    <select
                      value={basePriceFormData.price_source}
                      onChange={(e) => setBasePriceFormData({ ...basePriceFormData, price_source: e.target.value as any })}
                      className="w-full rounded-xl border border-gray-300 px-3 py-2.5 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                    >
                      <option value="auto">Auto</option>
                      <option value="manual">Manual</option>
                      <option value="negotiated">Negotiated</option>
                    </select>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                      <input
                        type="checkbox"
                        checked={basePriceFormData.is_active}
                        onChange={(e) => setBasePriceFormData({ ...basePriceFormData, is_active: e.target.checked })}
                        className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-sm font-medium text-gray-700">Active</span>
                    </label>

                    <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                      <input
                        type="checkbox"
                        checked={basePriceFormData.dynamic_pricing_enabled}
                        onChange={(e) => setBasePriceFormData({ ...basePriceFormData, dynamic_pricing_enabled: e.target.checked })}
                        className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-sm font-medium text-gray-700">Dynamic pricing enabled</span>
                    </label>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-600">Preview</p>
                    <p className="mt-3 text-base font-semibold text-slate-900">{selectedBaseModel?.name || 'Choose a vehicle model'}</p>
                    <div className="mt-4 space-y-3 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500">Hourly</span>
                        <span className="font-semibold text-slate-900">{formatCurrency(basePriceFormData.hourly_price || 0)}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500">Daily</span>
                        <span className="font-semibold text-slate-900">{formatCurrency(basePriceFormData.daily_price || 0)}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500">Weekly</span>
                        <span className="font-semibold text-slate-900">{basePriceFormData.weekly_price ? formatCurrency(basePriceFormData.weekly_price) : '—'}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500">Monthly</span>
                        <span className="font-semibold text-slate-900">{basePriceFormData.monthly_price ? formatCurrency(basePriceFormData.monthly_price) : '—'}</span>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <p className="text-sm font-semibold text-slate-900">Quick guidance</p>
                    <ul className="mt-3 space-y-2 text-sm text-slate-600">
                      <li>Always set hourly and daily first.</li>
                      <li>Use weekly and monthly only when you actively sell those durations.</li>
                      <li>Keep this page simple because tiers and extensions build on top of it.</li>
                    </ul>
                  </div>
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={resetBasePriceForm}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {submitting ? (
                    <Loader className="w-4 h-4 animate-spin mx-auto" />
                  ) : (
                    editingPrice ? 'Update' : 'Create'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* PRICING TIERS TAB */}
      {activeTab === 'tiers' && (
        <div className="space-y-6">
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 p-6">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">Pricing Tiers</h2>
                  <p className="mt-1 text-sm text-gray-600">
                    Create clearer hourly and daily rules without forcing the team to decode `1-1` style ranges.
                  </p>
                </div>
                <button
                  onClick={() => setShowTierForm(true)}
                  className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700"
                >
                  <Plus className="h-4 w-4" />
                  Add Pricing Tier
                </button>
              </div>

              <div className="mt-5 grid gap-3 lg:grid-cols-[auto_minmax(0,1fr)]">
                <div className="inline-flex rounded-2xl bg-slate-100 p-1">
                  {(['hours', 'days'] as const).map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setTierDurationFilter(type)}
                      className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
                        tierDurationFilter === type
                          ? 'bg-white text-blue-700 shadow-sm'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {type === 'hours' ? 'Hourly Tiers' : 'Daily Tiers'}
                    </button>
                  ))}
                </div>

                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
                  <select
                    value={selectedVehicleForTiers}
                    onChange={(e) => setSelectedVehicleForTiers(e.target.value)}
                    className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  >
                    <option value="">All Vehicle Models</option>
                    {vehicleModels.map((model) => (
                      <option key={model.id} value={model.id}>
                        {model.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <div className="p-6">
              <div className="rounded-2xl border border-blue-200 bg-blue-50 p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <h4 className="flex items-center gap-2 text-sm font-semibold text-blue-900">
                      <Lock className="h-4 w-4" />
                      Extension Pricing Rules
                    </h4>
                    <p className="mt-1 text-sm text-blue-800">
                      Keep extension pricing predictable by deciding when tiers are required and when fallback pricing is allowed.
                    </p>
                  </div>
                  <button
                    onClick={saveTierEnforcementSettings}
                    disabled={savingTierEnforcement}
                    className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {savingTierEnforcement ? <Loader className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    {savingTierEnforcement ? 'Saving...' : 'Save Settings'}
                  </button>
                </div>

                {(tierEnforcementSuccess || tierEnforcementError) && (
                  <div className={`mt-4 rounded-xl border px-4 py-3 text-sm ${
                    tierEnforcementSuccess
                      ? 'border-green-200 bg-green-50 text-green-700'
                      : 'border-red-200 bg-red-50 text-red-700'
                  }`}>
                    {tierEnforcementSuccess || tierEnforcementError}
                  </div>
                )}

                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  <label className="flex gap-3 rounded-xl border border-blue-100 bg-white px-4 py-4">
                    <input
                      type="checkbox"
                      checked={tierEnforcement.enabled}
                      onChange={(e) => setTierEnforcement(prev => ({ ...prev, enabled: e.target.checked }))}
                      className="mt-1 h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <div>
                      <span className="text-sm font-semibold text-slate-900">Enable tiered pricing</span>
                      <p className="mt-1 text-xs text-slate-500">Apply tier prices when extensions are requested.</p>
                    </div>
                  </label>

                  <label className="flex gap-3 rounded-xl border border-blue-100 bg-white px-4 py-4">
                    <input
                      type="checkbox"
                      checked={tierEnforcement.requireTierForExtensions}
                      onChange={(e) => setTierEnforcement(prev => ({ ...prev, requireTierForExtensions: e.target.checked }))}
                      disabled={!tierEnforcement.enabled}
                      className="mt-1 h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 disabled:opacity-50"
                    />
                    <div>
                      <span className="text-sm font-semibold text-slate-900">Only allow matching tiers</span>
                      <p className="mt-1 text-xs text-slate-500">Block extensions when no valid tier covers the requested duration.</p>
                    </div>
                  </label>

                  <label className="flex gap-3 rounded-xl border border-blue-100 bg-white px-4 py-4">
                    <input
                      type="checkbox"
                      checked={tierEnforcement.fallbackToHourly}
                      onChange={(e) => setTierEnforcement(prev => ({ ...prev, fallbackToHourly: e.target.checked }))}
                      disabled={!tierEnforcement.enabled}
                      className="mt-1 h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500 disabled:opacity-50"
                    />
                    <div>
                      <span className="text-sm font-semibold text-slate-900">Fallback to hourly pricing</span>
                      <p className="mt-1 text-xs text-slate-500">If no tier matches, calculate from the hourly rate instead.</p>
                    </div>
                  </label>
                </div>
              </div>

              <div className="mt-6 space-y-4">
                {groupedVisibleTiers.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center">
                    <p className="text-sm font-semibold text-slate-900">No {tierDurationFilter} tiers found</p>
                    <p className="mt-1 text-sm text-slate-500">
                      Add a {tierDurationFilter === 'hours' ? 'hourly' : 'daily'} tier or change the vehicle filter.
                    </p>
                  </div>
                ) : (
                  groupedVisibleTiers.map(({ model, tiers }) => (
                    <div key={model.id} className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                      <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <h3 className="text-base font-semibold text-slate-900">{model.name}</h3>
                          <p className="mt-1 text-sm text-slate-500">
                            {tiers.length} {tierDurationFilter === 'hours' ? 'hourly' : 'daily'} tier{tiers.length === 1 ? '' : 's'}
                          </p>
                        </div>
                        <span className="inline-flex self-start rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-600 border border-slate-200">
                          {tierDurationFilter === 'hours' ? 'Hourly pricing' : 'Daily pricing'}
                        </span>
                      </div>

                      <div className="mt-4 grid gap-3 xl:grid-cols-2">
                        {tiers.map((tier) => (
                          <div key={tier.id} className="rounded-2xl border border-white bg-white p-4 shadow-sm">
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                              <div>
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="inline-flex rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700 border border-blue-100">
                                    {formatTierDuration(tier)}
                                  </span>
                                  <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${getStatusColor(tier.is_active)}`}>
                                    {tier.is_active ? 'Active' : 'Inactive'}
                                  </span>
                                </div>
                                <p className="mt-3 text-2xl font-bold text-slate-900">{formatCurrency(getTierAmount(tier))}</p>
                                <p className="mt-1 text-sm text-slate-500">{getTierMethodLabel(tier)}</p>
                              </div>
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => handleEditTier(tier)}
                                  className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-blue-600 transition hover:bg-blue-50"
                                  title="Edit tier"
                                >
                                  <Edit className="h-4 w-4" />
                                </button>
                                <button
                                  onClick={() => {
                                    handleEditTier(tier);
                                    setEditingTier(null);
                                  }}
                                  className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-500 transition hover:bg-slate-100"
                                  title="Duplicate tier"
                                >
                                  <Plus className="h-4 w-4" />
                                </button>
                                <button
                                  onClick={() => handleDeleteTier(tier.id)}
                                  className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-red-200 text-red-600 transition hover:bg-red-50"
                                  title="Delete tier"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </div>
                            </div>

                            <div className="mt-4 grid gap-3 sm:grid-cols-3">
                              <div className="rounded-xl bg-slate-50 px-3 py-3">
                                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Applies to</p>
                                <p className="mt-2 text-sm font-semibold text-slate-900">{formatTierDuration(tier)}</p>
                              </div>
                              <div className="rounded-xl bg-slate-50 px-3 py-3">
                                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Price Type</p>
                                <p className="mt-2 text-sm font-semibold text-slate-900">{getTierMethodLabel(tier)}</p>
                              </div>
                              <div className="rounded-xl bg-slate-50 px-3 py-3">
                                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Discount</p>
                                <p className="mt-2 text-sm font-semibold text-slate-900">
                                  {getTierDiscountValue(tier) ? `${getTierDiscountValue(tier)}%` : '—'}
                                </p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

{/* Tier Form Modal */}
{showTierForm && (
  <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
    <div className="bg-white rounded-3xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
      <div className="flex items-center justify-between p-6 border-b border-gray-200">
        <h3 className="text-lg font-semibold text-gray-900">
          {editingTier ? 'Edit Pricing Tier' : 'Add Pricing Tier'}
        </h3>
        <button
          onClick={resetTierForm}
          className="text-gray-400 hover:text-gray-600"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <form onSubmit={handleSubmitTier} className="p-6 space-y-6">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Guided Tier Setup</p>
          <p className="mt-2 text-sm text-slate-600">
            Choose the model, choose hourly or daily, then decide if this tier covers one exact duration or a range.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Vehicle Model
              </label>
              <select
                value={tierFormData.vehicle_model_id}
                onChange={(e) => setTierFormData({ ...tierFormData, vehicle_model_id: e.target.value })}
                className="w-full rounded-xl border border-gray-300 px-3 py-2.5 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                required
              >
                <option value="">Select a vehicle model</option>
                {vehicleModels.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Pricing Type
              </label>
              <div className="inline-flex rounded-2xl bg-slate-100 p-1">
                {(['hours', 'days'] as const).map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setTierFormData({
                      ...tierFormData,
                      duration_type: type,
                      duration_mode: 'single',
                      min_hours: 1,
                      max_hours: 1,
                      min_days: 1,
                      max_days: 1,
                    })}
                    className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
                      tierFormData.duration_type === type
                        ? 'bg-white text-blue-700 shadow-sm'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {type === 'hours' ? 'Hourly Tier' : 'Daily Tier'}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Applies To
              </label>
              <div className="inline-flex rounded-2xl bg-slate-100 p-1">
                {(['single', 'range'] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setTierFormData((prev: any) => {
                      const next = { ...prev, duration_mode: mode };
                      if (mode === 'single') {
                        if (prev.duration_type === 'hours') next.max_hours = next.min_hours;
                        if (prev.duration_type === 'days') next.max_days = next.min_days;
                      }
                      return next;
                    })}
                    className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
                      tierFormData.duration_mode === mode
                        ? 'bg-white text-blue-700 shadow-sm'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {mode === 'single' ? 'Single duration' : 'Duration range'}
                  </button>
                ))}
              </div>
            </div>

            {tierFormData.duration_type === 'hours' ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {tierFormData.duration_mode === 'single' ? 'Hour' : 'From Hour'}
                  </label>
                  <input
                    type="number"
                    value={tierFormData.min_hours}
                    onChange={(e) => {
                      const value = parseInt(e.target.value || '1', 10) || 1;
                      setTierFormData((prev: any) => ({
                        ...prev,
                        min_hours: value,
                        max_hours: prev.duration_mode === 'single' ? value : prev.max_hours,
                      }));
                    }}
                    className="w-full rounded-xl border border-gray-300 px-3 py-2.5 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                    required
                    min="1"
                  />
                </div>

                {tierFormData.duration_mode === 'range' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      To Hour
                    </label>
                    <input
                      type="number"
                      value={tierFormData.max_hours}
                      onChange={(e) => setTierFormData({ ...tierFormData, max_hours: parseInt(e.target.value || '1', 10) || 1 })}
                      className="w-full rounded-xl border border-gray-300 px-3 py-2.5 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                      required
                      min={tierFormData.min_hours || 1}
                    />
                  </div>
                )}
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {tierFormData.duration_mode === 'single' ? 'Day' : 'From Day'}
                  </label>
                  <input
                    type="number"
                    value={tierFormData.min_days}
                    onChange={(e) => {
                      const value = parseInt(e.target.value || '1', 10) || 1;
                      setTierFormData((prev: any) => ({
                        ...prev,
                        min_days: value,
                        max_days: prev.duration_mode === 'single' ? value : prev.max_days,
                      }));
                    }}
                    className="w-full rounded-xl border border-gray-300 px-3 py-2.5 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                    required
                    min="1"
                  />
                </div>

                {tierFormData.duration_mode === 'range' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      To Day
                    </label>
                    <input
                      type="number"
                      value={tierFormData.max_days}
                      onChange={(e) => setTierFormData({ ...tierFormData, max_days: parseInt(e.target.value || '1', 10) || 1 })}
                      className="w-full rounded-xl border border-gray-300 px-3 py-2.5 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                      required
                      min={tierFormData.min_days || 1}
                    />
                  </div>
                )}
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Price Type
                </label>
                <select
                  value={tierFormData.duration_type === 'days' ? tierFormData.daily_calculation_method : tierFormData.calculation_method}
                  onChange={(e) => {
                    const value = e.target.value as any;
                    setTierFormData((prev: any) => prev.duration_type === 'days'
                      ? { ...prev, daily_calculation_method: value }
                      : { ...prev, calculation_method: value }
                    );
                  }}
                  className="w-full rounded-xl border border-gray-300 px-3 py-2.5 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                >
                  <option value="fixed">Fixed Price</option>
                  <option value="percentage">Discount %</option>
                  <option value="custom">Custom Formula</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {tierFormData.duration_type === 'days' ? 'Daily Price (MAD)' : 'Price Amount (MAD)'}
                </label>
                <input
                  type="number"
                  value={tierFormData.duration_type === 'days' ? tierFormData.daily_price_amount : tierFormData.price_amount}
                  onChange={(e) => {
                    const value = parseFloat(e.target.value || '0') || 0;
                    setTierFormData((prev: any) => prev.duration_type === 'days'
                      ? { ...prev, daily_price_amount: value }
                      : { ...prev, price_amount: value }
                    );
                  }}
                  className="w-full rounded-xl border border-gray-300 px-3 py-2.5 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  required
                  min="0"
                  step="0.01"
                />
              </div>
            </div>

            {((tierFormData.duration_type === 'days' && tierFormData.daily_calculation_method === 'percentage') ||
              (tierFormData.duration_type === 'hours' && tierFormData.calculation_method === 'percentage')) && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Discount Percentage
                </label>
                <input
                  type="number"
                  value={tierFormData.duration_type === 'days' ? tierFormData.daily_discount_percentage : tierFormData.discount_percentage}
                  onChange={(e) => {
                    const value = parseFloat(e.target.value || '0') || 0;
                    setTierFormData((prev: any) => prev.duration_type === 'days'
                      ? { ...prev, daily_discount_percentage: value }
                      : { ...prev, discount_percentage: value }
                    );
                  }}
                  className="w-full rounded-xl border border-gray-300 px-3 py-2.5 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  min="0"
                  max="100"
                  step="0.01"
                />
              </div>
            )}

            <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
              <input
                type="checkbox"
                checked={tierFormData.is_active}
                onChange={(e) => setTierFormData({ ...tierFormData, is_active: e.target.checked })}
                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm font-medium text-gray-700">Active</span>
            </label>

            <div className="pt-2">
              <button
                type="button"
                onClick={() => validateTierConfiguration(tierFormData)}
                className="inline-flex items-center gap-2 rounded-xl bg-purple-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-purple-700"
              >
                <Calculator className="h-4 w-4" />
                Validate Tier
              </button>
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-600">Preview</p>
              <p className="mt-3 text-base font-semibold text-slate-900">{selectedTierModel?.name || 'Choose a vehicle model'}</p>
              <p className="mt-2 text-sm text-slate-600">
                Applies to{' '}
                <span className="font-semibold text-slate-900">
                  {tierPreviewMin === tierPreviewMax
                    ? `${tierPreviewMin} ${tierPreviewUnit}${tierPreviewMin === 1 ? '' : 's'}`
                    : `${tierPreviewMin}-${tierPreviewMax} ${tierPreviewUnit}${tierPreviewMax === 1 ? '' : 's'}`}
                </span>
              </p>
              <p className="mt-2 text-2xl font-bold text-blue-700">{formatCurrency(tierPreviewPrice)}</p>
              <p className="mt-2 text-sm text-slate-500">
                {tierFormData.duration_type === 'days'
                  ? (tierFormData.daily_calculation_method === 'fixed' ? 'Fixed Price' : tierFormData.daily_calculation_method === 'percentage' ? 'Discount %' : 'Custom Formula')
                  : (tierFormData.calculation_method === 'fixed' ? 'Fixed Price' : tierFormData.calculation_method === 'percentage' ? 'Discount %' : 'Custom Formula')}
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm font-semibold text-slate-900">Quick guidance</p>
              <ul className="mt-3 space-y-2 text-sm text-slate-600">
                <li>Use <span className="font-semibold text-slate-900">Single duration</span> for exact rules like 1 hour or 2 days.</li>
                <li>Use <span className="font-semibold text-slate-900">Duration range</span> only when one price should cover multiple durations.</li>
                <li>Choose <span className="font-semibold text-slate-900">Fixed Price</span> for most setups to keep pricing simple.</li>
              </ul>
            </div>
          </div>
        </div>

        <div className="flex gap-3 pt-4">
          <button
            type="button"
            onClick={resetTierForm}
            className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? (
              <Loader className="w-4 h-4 animate-spin mx-auto" />
            ) : (
              editingTier ? 'Update' : 'Create'
            )}
          </button>
        </div>
      </form>
    </div>
  </div>
)}

      {/* EXTENSION RULES TAB */}
      {activeTab === 'extensions' && (
        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-200 p-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Extension Rules</h2>
                <p className="mt-1 text-sm text-gray-600">
                  Control the grace period, uplift, and approval path for each vehicle model’s extension pricing.
                </p>
              </div>
              <button
                onClick={() => setShowExtensionForm(true)}
                className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700"
              >
                <Plus className="h-4 w-4" />
                Add Extension Rule
              </button>
            </div>
          </div>

          <div className="p-6">
            {groupedExtensionRules.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center">
                <p className="text-sm font-semibold text-slate-900">No extension rules found</p>
                <p className="mt-1 text-sm text-slate-500">Add an extension rule to control grace periods and extension pricing behavior.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {groupedExtensionRules.map(({ model, rules }) => (
                  <div key={model.id} className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                    <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <h3 className="text-base font-semibold text-slate-900">{model.name}</h3>
                        <p className="mt-1 text-sm text-slate-500">
                          {rules.length} extension rule{rules.length === 1 ? '' : 's'} for this model
                        </p>
                      </div>
                      <span className="inline-flex self-start rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-600">
                        {model.vehicle_type || 'quad'}
                      </span>
                    </div>

                    <div className="mt-4 grid gap-3 xl:grid-cols-2">
                      {rules.map((rule) => {
                        const basePrice = basePrices.find((price) => price.id === rule.base_price_id);
                        return (
                          <div key={rule.id} className="rounded-2xl border border-white bg-white p-4 shadow-sm">
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                              <div>
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${
                                    rule.auto_adjust_enabled
                                      ? 'border-green-200 bg-green-50 text-green-700'
                                      : 'border-amber-200 bg-amber-50 text-amber-700'
                                  }`}>
                                    {rule.auto_adjust_enabled ? 'Auto adjust' : 'Manual pricing'}
                                  </span>
                                  <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-600">
                                    Grace {rule.grace_period_minutes} min
                                  </span>
                                </div>
                                <p className="mt-3 text-sm font-medium text-slate-500">Base rate</p>
                                <p className="mt-1 text-base font-semibold text-slate-900">{basePrice?.vehicle_model?.name || 'Unknown base price'}</p>
                              </div>
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => handleEditExtension(rule)}
                                  className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-blue-600 transition hover:bg-blue-50"
                                  title="Edit extension rule"
                                >
                                  <Edit className="h-4 w-4" />
                                </button>
                                <button
                                  onClick={() => handleDeleteExtension(rule.id)}
                                  className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-red-200 text-red-600 transition hover:bg-red-50"
                                  title="Delete extension rule"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </div>
                            </div>

                            <div className="mt-4 grid gap-3 sm:grid-cols-3">
                              <div className="rounded-xl bg-slate-50 px-3 py-3">
                                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Grace period</p>
                                <p className="mt-2 text-base font-bold text-slate-900">{rule.grace_period_minutes} min</p>
                              </div>
                              <div className="rounded-xl bg-slate-50 px-3 py-3">
                                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Multiplier</p>
                                <p className="mt-2 text-base font-bold text-slate-900">{rule.extension_price_multiplier}x</p>
                              </div>
                              <div className="rounded-xl bg-slate-50 px-3 py-3">
                                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Approval path</p>
                                <p className="mt-2 text-base font-bold text-slate-900">
                                  {rule.requires_manual_extension ? 'Manual review' : 'Automatic'}
                                </p>
                              </div>
                            </div>

                            <div className="mt-4 flex flex-wrap gap-2 text-xs">
                              <span className={`inline-flex rounded-full border px-2.5 py-1 font-semibold ${
                                rule.auto_adjust_enabled
                                  ? 'border-green-200 bg-green-50 text-green-700'
                                  : 'border-slate-200 bg-slate-50 text-slate-600'
                              }`}>
                                {rule.auto_adjust_enabled ? 'Price adjusts automatically' : 'Price stays manual'}
                              </span>
                              <span className={`inline-flex rounded-full border px-2.5 py-1 font-semibold ${
                                rule.requires_manual_extension
                                  ? 'border-amber-200 bg-amber-50 text-amber-700'
                                  : 'border-blue-200 bg-blue-50 text-blue-700'
                              }`}>
                                {rule.requires_manual_extension ? 'Requires staff approval' : 'Customer can continue directly'}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Extension Form Modal */}
      {showExtensionForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="w-full max-w-2xl rounded-3xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-gray-200 p-6">
              <h3 className="text-lg font-semibold text-gray-900">
                {editingExtension ? 'Edit Extension Rule' : 'Add Extension Rule'}
              </h3>
              <button
                onClick={resetExtensionForm}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitExtension} className="space-y-6 p-6">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Guided Extension Rule Setup</p>
                <p className="mt-2 text-sm text-slate-600">
                  Choose the base vehicle price, define how much grace to allow, then decide whether the extension should price itself or wait for staff approval.
                </p>
              </div>

              <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
                <div className="space-y-6">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">
                      Base Price
                    </label>
                    <select
                      value={extensionFormData.base_price_id}
                      onChange={(e) => setExtensionFormData({ ...extensionFormData, base_price_id: e.target.value })}
                      className="w-full rounded-xl border border-gray-300 px-3 py-2.5 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                      required
                    >
                      <option value="">Select a base price</option>
                      {basePrices.map((price) => (
                        <option key={price.id} value={price.id}>
                          {price.vehicle_model?.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">
                        Grace Period (minutes)
                      </label>
                      <input
                        type="number"
                        value={extensionFormData.grace_period_minutes}
                        onChange={(e) => setExtensionFormData({ ...extensionFormData, grace_period_minutes: parseInt(e.target.value) || 0 })}
                        className="w-full rounded-xl border border-gray-300 px-3 py-2.5 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                        required
                        min="0"
                      />
                    </div>

                    <div>
                      <label className="mb-1 block text-sm font-medium text-gray-700">
                        Price Multiplier
                      </label>
                      <input
                        type="number"
                        value={extensionFormData.extension_price_multiplier}
                        onChange={(e) => setExtensionFormData({ ...extensionFormData, extension_price_multiplier: parseFloat(e.target.value) || 0 })}
                        className="w-full rounded-xl border border-gray-300 px-3 py-2.5 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                        required
                        min="0"
                        step="0.1"
                      />
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                      <input
                        type="checkbox"
                        checked={extensionFormData.auto_adjust_enabled}
                        onChange={(e) => setExtensionFormData({ ...extensionFormData, auto_adjust_enabled: e.target.checked })}
                        className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-sm font-medium text-gray-700">Auto adjust pricing</span>
                    </label>

                    <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                      <input
                        type="checkbox"
                        checked={extensionFormData.requires_manual_extension}
                        onChange={(e) => setExtensionFormData({ ...extensionFormData, requires_manual_extension: e.target.checked })}
                        className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-sm font-medium text-gray-700">Requires staff approval</span>
                    </label>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-600">Preview</p>
                    <p className="mt-3 text-base font-semibold text-slate-900">{selectedExtensionVehicle?.name || 'Choose a vehicle model'}</p>
                    <div className="mt-4 space-y-3 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500">Grace period</span>
                        <span className="font-semibold text-slate-900">{extensionFormData.grace_period_minutes || 0} min</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500">Multiplier</span>
                        <span className="font-semibold text-slate-900">{extensionFormData.extension_price_multiplier || 0}x</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500">Pricing</span>
                        <span className="font-semibold text-slate-900">
                          {extensionFormData.auto_adjust_enabled ? 'Automatic' : 'Manual'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500">Approval</span>
                        <span className="font-semibold text-slate-900">
                          {extensionFormData.requires_manual_extension ? 'Staff approval' : 'Direct'}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <p className="text-sm font-semibold text-slate-900">Quick guidance</p>
                    <ul className="mt-3 space-y-2 text-sm text-slate-600">
                      <li>Use a short grace period to avoid charging customers for a few extra minutes.</li>
                      <li>A multiplier above <span className="font-semibold text-slate-900">1.0x</span> increases the extension price.</li>
                      <li>Turn on staff approval only when you want extensions reviewed before the rental can continue.</li>
                    </ul>
                  </div>
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={resetExtensionForm}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {submitting ? (
                    <Loader className="w-4 h-4 animate-spin mx-auto" />
                  ) : (
                    editingExtension ? 'Update' : 'Create'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* TRANSPORT FEES TAB */}
      {activeTab === 'transport' && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          <div className="p-6 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">Transport Fees</h2>
            <p className="mt-1 text-sm text-gray-600">Set optional pickup and dropoff charges that are added to the rental total.</p>
          </div>

          <form onSubmit={handleSaveTransportFees} className="p-6 space-y-6">
            {/* Success Message */}
            {transportFeeSuccess && (
              <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                <div className="flex items-center gap-3">
                  <CheckCircle className="w-5 h-5 text-green-500" />
                  <p className="text-green-800 font-medium">{transportFeeSuccess}</p>
                </div>
              </div>
            )}

            {/* Error Message */}
            {transportFeeError && (
              <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                <div className="flex items-center gap-3">
                  <AlertCircle className="w-5 h-5 text-red-500" />
                  <p className="text-red-800 font-medium">{transportFeeError}</p>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Pickup Fee (MAD)
                </label>
                <input
                  type="number"
                  value={transportFeeFormData.pickup_fee}
                  onChange={(e) => handleTransportFeeChange('pickup_fee', e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  min="0"
                  step="0.01"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Dropoff Fee (MAD)
                </label>
                <input
                  type="number"
                  value={transportFeeFormData.dropoff_fee}
                  onChange={(e) => handleTransportFeeChange('dropoff_fee', e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  min="0"
                  step="0.01"
                />
              </div>
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={resetTransportFees}
                className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Reset
              </button>
              <button
                type="submit"
                disabled={savingTransportFees}
                className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {savingTransportFees ? (
                  <>
                    <Loader className="w-4 h-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    Save Changes
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      )}

      {activeTab === 'tour-pricing' && (
        <TourPackagesWorkspace />
      )}

      {/* KILOMETER PRICING TAB - WITH INFO TOOLTIP */}
      {activeTab === 'packages' && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="p-6">
            <KilometerPricingTab />
          </div>
        </div>
      )}

      {/* DAMAGE DEPOSITS TAB */}
      {activeTab === 'deposits' && (
        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-200 p-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Damage Deposits</h2>
                <p className="mt-1 text-sm text-gray-600">
                  Keep deposit presets clear by vehicle model, with up to three quick choices for the rental team.
                </p>
              </div>
              <button
                onClick={handleSaveDepositSettings}
                disabled={savingDepositSettings}
                className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {savingDepositSettings ? (
                  <>
                    <Loader className="h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4" />
                    Save Deposit Settings
                  </>
                )}
              </button>
            </div>

            <div className="mt-5 grid gap-3 lg:grid-cols-[minmax(0,1fr)_320px]">
              <select
                value={selectedVehicleForDeposits}
                onChange={(e) => setSelectedVehicleForDeposits(e.target.value)}
                className="rounded-xl border border-gray-300 px-4 py-2.5 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              >
                <option value="">All Vehicle Models</option>
                {vehicleModels.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.name}
                  </option>
                ))}
              </select>

              <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <input
                  type="checkbox"
                  checked={depositSettings.allowCustomDeposit}
                  onChange={(e) => setDepositSettings(prev => ({ ...prev, allowCustomDeposit: e.target.checked }))}
                  className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <div>
                  <span className="text-sm font-medium text-slate-900">Allow custom deposit entry</span>
                  <p className="mt-0.5 text-xs text-slate-500">Lets staff type a manual deposit when none of the presets fit.</p>
                </div>
              </label>
            </div>
          </div>

          <div className="space-y-6 p-6">
            {depositSettingsSuccess && (
              <div className="rounded-2xl border border-green-200 bg-green-50 p-4">
                <div className="flex items-center gap-3">
                  <CheckCircle className="h-5 w-5 text-green-500" />
                  <p className="font-medium text-green-800">{depositSettingsSuccess}</p>
                </div>
              </div>
            )}

            {depositSettingsError && (
              <div className="rounded-2xl border border-red-200 bg-red-50 p-4">
                <div className="flex items-center gap-3">
                  <AlertCircle className="h-5 w-5 text-red-500" />
                  <p className="font-medium text-red-800">{depositSettingsError}</p>
                </div>
              </div>
            )}

            {selectedVehicleForDeposits ? (
              <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                <div className="flex flex-col gap-4 border-b border-slate-200 pb-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <h3 className="text-base font-semibold text-slate-900">{selectedDepositModel?.name || getVehicleModelName(selectedVehicleForDeposits)}</h3>
                    <p className="mt-1 text-sm text-slate-500">
                      Configure up to three clear deposit choices for this model. Keep the labels short so the rental team can choose quickly.
                    </p>
                  </div>
                  <button
                    onClick={handleAddPresetForVehicle}
                    disabled={getCurrentVehiclePresets().length >= 3}
                    className="inline-flex items-center gap-2 self-start rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Plus className="h-4 w-4" />
                    Add Preset
                  </button>
                </div>

                {getCurrentVehiclePresets().length === 0 ? (
                  <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-10 text-center">
                    <p className="text-sm font-semibold text-slate-900">No deposit presets for this model yet</p>
                    <p className="mt-1 text-sm text-slate-500">Add your first preset to give the rental team a quick deposit choice.</p>
                  </div>
                ) : (
                  <div className="mt-4 grid gap-4 xl:grid-cols-3">
                    {getCurrentVehiclePresets().map((preset, index) => (
                      <div key={index} className="rounded-2xl border border-white bg-white p-4 shadow-sm">
                        <div className="flex items-center justify-between gap-3">
                          <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-600">
                            Preset {index + 1}
                          </span>
                          <button
                            onClick={() => handleDeletePresetForVehicle(index)}
                            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-red-200 text-red-600 transition hover:bg-red-50"
                            title="Delete preset"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>

                        <div className="mt-4 space-y-4">
                          <div>
                            <label className="mb-1 block text-sm font-medium text-slate-700">Label</label>
                            <input
                              type="text"
                              value={preset.label}
                              onChange={(e) => handleUpdatePresetForVehicle(index, 'label', e.target.value)}
                              className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                              placeholder="e.g. Standard"
                            />
                          </div>

                          <div>
                            <label className="mb-1 block text-sm font-medium text-slate-700">Amount (MAD)</label>
                            <input
                              type="number"
                              value={preset.amount}
                              onChange={(e) => handleUpdatePresetForVehicle(index, 'amount', parseFloat(e.target.value) || 0)}
                              className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                              min="0"
                              step="1"
                            />
                          </div>

                          <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
                            <input
                              type="checkbox"
                              checked={preset.enabled}
                              onChange={(e) => handleUpdatePresetForVehicle(index, 'enabled', e.target.checked)}
                              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                            />
                            <span className="text-sm font-medium text-slate-700">Preset enabled</span>
                          </label>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : null}

            <div>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="text-base font-semibold text-slate-900">Deposit Overview</h3>
                  <p className="mt-1 text-sm text-slate-500">Review every model at a glance and jump back into the editor when something needs changing.</p>
                </div>
              </div>

              <div className="mt-4 grid gap-4 xl:grid-cols-2">
                {visibleDepositOverview.map(({ model, presets, enabledPresets, enabledCount, totalAmount }) => (
                  <div key={model.id} className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                    <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h4 className="text-base font-semibold text-slate-900">{model.name}</h4>
                          <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${enabledCount > 0 ? 'border-green-200 bg-green-50 text-green-700' : 'border-slate-200 bg-white text-slate-600'}`}>
                            {enabledCount > 0 ? 'Ready for rentals' : 'No active presets'}
                          </span>
                        </div>
                        <p className="mt-1 text-sm text-slate-500">
                          {presets.length} preset{presets.length === 1 ? '' : 's'} configured
                        </p>
                      </div>
                      <button
                        onClick={() => setSelectedVehicleForDeposits(model.id)}
                        className="inline-flex self-start rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-blue-600 transition hover:bg-blue-50"
                      >
                        Configure
                      </button>
                    </div>

                    <div className="mt-4 grid gap-3 sm:grid-cols-3">
                      <div className="rounded-xl bg-white px-3 py-3">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Enabled presets</p>
                        <p className="mt-2 text-base font-bold text-slate-900">{enabledCount}</p>
                      </div>
                      <div className="rounded-xl bg-white px-3 py-3">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Preset total</p>
                        <p className="mt-2 text-base font-bold text-slate-900">{formatCurrency(totalAmount)}</p>
                      </div>
                      <div className="rounded-xl bg-white px-3 py-3">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Custom entry</p>
                        <p className="mt-2 text-base font-bold text-slate-900">{depositSettings.allowCustomDeposit ? 'Allowed' : 'Locked'}</p>
                      </div>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                      {presets.length === 0 ? (
                        <span className="inline-flex rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-500">
                          No presets yet
                        </span>
                      ) : (
                        presets.map((preset, index) => (
                          <span
                            key={`${model.id}-${index}`}
                            className={`inline-flex rounded-full border px-3 py-1.5 text-xs font-semibold ${
                              preset.enabled
                                ? 'border-blue-200 bg-blue-50 text-blue-700'
                                : 'border-slate-200 bg-white text-slate-500'
                            }`}
                          >
                            {preset.label}: {formatCurrency(preset.amount || 0)}
                          </span>
                        ))
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* NEW: FUEL PRICING TAB */}
      {activeTab === 'fuel' && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          <div className="p-6">
            <FuelPricingTab 
              vehicleModels={vehicleModels}
              onRefresh={() => setRefreshTrigger(prev => prev + 1)}
            />
          </div>
        </div>
      )}
      </div>
    </div>
  );
};

export default DynamicPricingManagement;
