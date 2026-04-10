import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Plus, Edit, Trash2, Search, Filter, DollarSign, CheckCircle, AlertCircle, RefreshCw, X, Save, Loader, Truck, Settings, TrendingUp, Clock, Calculator, Package, Info, Shield, Lock, Fuel, Route } from 'lucide-react';
import { calculateTieredPrice, getPricingOptions, formatPriceSource } from '../utils/pricingCalculations';
import KilometerPricingTab from './KilometerPricingTab';
import FuelPricingTab from './FuelPricingTab'; // NEW: Import Fuel Pricing Tab
import TourPackagesWorkspace from './admin/pricing/TourPackagesWorkspace';
import AdminModuleHero from './admin/AdminModuleHero';
import i18n from '../i18n';

const scheduleBackgroundTask = (callback: () => void | Promise<void>) => {
  if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
    return window.requestIdleCallback(() => {
      void callback();
    }, { timeout: 700 });
  }

  return window.setTimeout(() => {
    void callback();
  }, 0);
};
const isFrenchLocale = () => i18n.resolvedLanguage === 'fr';
const tr = (en: string, fr: string) => (isFrenchLocale() ? fr : en);

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

const parseHourTierValue = (value: string | number) => {
  const numeric = parseFloat(String(value ?? '').replace(',', '.'));
  if (!Number.isFinite(numeric)) return 0.5;
  return Math.max(0.5, Math.round(numeric * 2) / 2);
};

// NEW: Damage Deposit Interfaces
interface DamageDepositPreset {
  label: string;
  amount: number;
  enabled: boolean;
  isDefault?: boolean;
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

const normalizeDamageDepositSettings = (
  presets: unknown,
  allowCustomDeposit = true
): DamageDepositSettings => {
  if (!presets || typeof presets !== 'object' || Array.isArray(presets)) {
    return {
      vehicleModelPresets: {},
      allowCustomDeposit,
    };
  }

  const vehicleModelPresets = Object.fromEntries(
    Object.entries(presets as Record<string, unknown>).map(([vehicleModelId, rawPresets]) => {
      const normalizedPresets = Array.isArray(rawPresets)
        ? rawPresets
            .map((preset) => {
              if (!preset || typeof preset !== 'object') return null;
              const typedPreset = preset as Record<string, unknown>;
              return {
                label: String(typedPreset.label || '').trim(),
                amount: Number(typedPreset.amount || 0),
                enabled: Boolean(typedPreset.enabled),
                isDefault: Boolean(typedPreset.isDefault ?? typedPreset.is_default),
              };
            })
            .filter((preset): preset is DamageDepositPreset => Boolean(preset?.label))
        : [];

      return [String(vehicleModelId), normalizedPresets];
    })
  );

  return {
    vehicleModelPresets,
    allowCustomDeposit,
  };
};

const PRICING_TAB_ITEMS = [
  { id: 'base', labelEn: 'Base Prices', labelFr: 'Tarifs de base', icon: DollarSign },
  { id: 'tiers', labelEn: 'Pricing Tiers', labelFr: 'Paliers tarifaires', icon: TrendingUp },
  { id: 'extensions', labelEn: 'Extension Rules', labelFr: 'Règles de prolongation', icon: Clock },
  { id: 'transport', labelEn: 'Transport Fees', labelFr: 'Frais de transport', icon: Truck },
  { id: 'tour-pricing', labelEn: 'Tours & Booking', labelFr: 'Tours et réservations', icon: Route },
  { id: 'packages', labelEn: 'Kilometer Pricing', labelFr: 'Tarification kilométrique', icon: Package },
  { id: 'deposits', labelEn: 'Damage Deposits', labelFr: 'Dépôts de garantie', icon: Shield },
  { id: 'fuel', labelEn: 'Fuel Pricing', labelFr: 'Tarification carburant', icon: Fuel },
] as const;

type PricingTabId = typeof PRICING_TAB_ITEMS[number]['id'];

const isPricingTabId = (tab: string | null): tab is PricingTabId => (
  PRICING_TAB_ITEMS.some((item) => item.id === tab)
);

const DynamicPricingManagement: React.FC = () => {
  const isFrench = isFrenchLocale();
  console.log('PRICING_MANAGEMENT: Loading with TIERED PRICING and FUEL PRICING support');
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');

  // Tab state - UPDATED to include 'deposits' and 'fuel'
  const [activeTab, setActiveTab] = useState<PricingTabId>(() => (
    isPricingTabId(tabParam) ? tabParam : 'base'
  ));

  useEffect(() => {
    if (isPricingTabId(tabParam) && tabParam !== activeTab) {
      setActiveTab(tabParam);
    }
  }, [activeTab, tabParam]);

  const handleTabChange = (tab: PricingTabId) => {
    setActiveTab(tab);

    const nextParams = new URLSearchParams(searchParams);
    if (tab === 'base') {
      nextParams.delete('tab');
    } else {
      nextParams.set('tab', tab);
    }
    setSearchParams(nextParams, { replace: true });
  };

  // State for Base Prices
  const [basePrices, setBasePrices] = useState<BasePrice[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
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

      if (data) {
        const normalized = normalizeDamageDepositSettings(
          data.damage_deposit_presets,
          data.allow_custom_deposit ?? true
        );
        setDepositSettings(normalized);
        console.log('✅ Loaded vehicle model-based deposit settings:', normalized);
      }
    } catch (error: any) {
      console.log('🔄 Using default deposit settings:', error.message);
      // Keep default values if database fetch fails
    }
  };

  // Fetch ALL data from database
  const fetchData = async () => {
    console.log('🔄 Fetching ALL pricing data from database...');
    if (!hasLoadedOnce) {
      setLoading(true);
    }
    setError(null);
    
    try {
      const [vehicleModelsResult, basePricesResult, appSettingsResult] = await Promise.allSettled([
        supabase
          .from('saharax_0u4w4d_vehicle_models')
          .select('id, name, model, vehicle_type')
          .eq('is_active', true)
          .order('name', { ascending: true }),
        supabase
          .from('app_4c3a7a6153_base_prices')
          .select(`
            *,
            vehicle_model:saharax_0u4w4d_vehicle_models (
              name,
              model,
              vehicle_type
            )
          `)
          .order('created_at', { ascending: false }),
        supabase
          .from('app_settings')
          .select('transport_pickup_fee, transport_dropoff_fee, damage_deposit_presets, allow_custom_deposit, tier_pricing_enabled, require_tier_for_extensions, fallback_to_hourly')
          .eq('id', 1)
          .single(),
      ]);

      if (vehicleModelsResult.status === 'fulfilled') {
        setVehicleModels(vehicleModelsResult.value.data || []);
      } else {
        console.error('❌ Error fetching vehicle models:', vehicleModelsResult.reason);
        setVehicleModels([]);
      }

      if (basePricesResult.status === 'fulfilled') {
        const { data: pricesData, error: pricesError } = basePricesResult.value;
        if (pricesError) {
          throw new Error(`Base prices error: ${pricesError.message}`);
        }
        setBasePrices(pricesData || []);
      }

      if (appSettingsResult.status === 'fulfilled') {
        const { data: dbData, error: dbError } = appSettingsResult.value;
        if (!dbError && dbData) {
          const fees = {
            pickup_fee: Number(dbData.transport_pickup_fee) || 0,
            dropoff_fee: Number(dbData.transport_dropoff_fee) || 0
          };
          setTransportFees(fees);
          setTransportFeeFormData(fees);
          setTierEnforcement({
            enabled: dbData.tier_pricing_enabled ?? true,
            requireTierForExtensions: dbData.require_tier_for_extensions ?? true,
            fallbackToHourly: dbData.fallback_to_hourly ?? false
          });

          setDepositSettings(
            normalizeDamageDepositSettings(
              dbData.damage_deposit_presets,
              dbData.allow_custom_deposit ?? true
            )
          );
        } else {
          await fetchDepositSettings();
        }
      } else {
        console.log('🔄 App settings fetch failed, using local defaults and localStorage fallback');
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
        await fetchDepositSettings();
      }
      setHasLoadedOnce(true);

      scheduleBackgroundTask(async () => {
        const [tiersResult, rulesResult] = await Promise.allSettled([
          supabase
            .from('pricing_tiers')
            .select('*')
            .order('min_hours', { ascending: true }),
          supabase
            .from('rental_extension_rules')
            .select('*'),
        ]);

        if (tiersResult.status === 'fulfilled') {
          const { data: tiersData, error: tiersError } = tiersResult.value;
          if (!tiersError) {
            setPricingTiers(tiersData || []);
          }
        }

        if (rulesResult.status === 'fulfilled') {
          const { data: rulesData, error: rulesError } = rulesResult.value;
          if (!rulesError) {
            setExtensionRules(rulesData || []);
          }
        }
      });

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
      return [model.name, model.model].filter(Boolean).join(' ').trim() || model.name;
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

    const gapStep = tierData.duration_type === 'hours' ? 0.5 : 1;
    let gaps = [];
    for (let i = 0; i < tiers.length - 1; i++) {
      const nextExpected = Number(tiers[i][maxField]) + gapStep;
      const nextActual = Number(tiers[i + 1][minField]);
      if (nextExpected < nextActual) {
        gaps.push(`${nextExpected}-${nextActual - gapStep} ${tierData.duration_type}`);
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
    if (!window.confirm(tr('Are you sure you want to delete this tier?', 'Voulez-vous vraiment supprimer ce palier ?'))) return;

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
      alert(tr('Failed to delete tier', 'Impossible de supprimer le palier'));
    }
  };

  const handleSubmitTier = async (e: React.FormEvent) => {
  e.preventDefault();
  if (submitting) return;
  
  setSubmitting(true);

  try {
    const tierData = {
      vehicle_model_id: tierFormData.vehicle_model_id,
      min_hours: tierFormData.duration_type === 'hours' ? parseHourTierValue(tierFormData.min_hours) : null,
      max_hours: tierFormData.duration_type === 'hours' ? parseHourTierValue(tierFormData.max_hours) : null,
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
      enabled: true,
      isDefault: currentPresets.length === 0
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
    const updatedPresets = currentPresets.map((preset, i) => {
      if (field === 'isDefault') {
        return {
          ...preset,
          isDefault: i === index ? Boolean(value) : false,
        };
      }

      return i === index ? { ...preset, [field]: value } : preset;
    });

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
        return tr('Fixed Price', 'Prix fixe');
      case 'percentage':
        return tr('Discount %', 'Remise %');
      case 'custom':
        return tr('Custom Formula', 'Formule personnalisée');
      default:
        return tr('Not set', 'Non défini');
    }
  };

  const getTierDiscountValue = (tier: PricingTier) => (
    tier.duration_type === 'days'
      ? tier.daily_discount_percentage
      : tier.discount_percentage
  );

  const getBasePricesForTier = (tier: PricingTier) => {
    const matchingBasePrice = basePrices.find(
      (price) => price.vehicle_model_id === tier.vehicle_model_id && price.is_active
    ) || basePrices.find((price) => price.vehicle_model_id === tier.vehicle_model_id);

    return {
      hourly: Number(matchingBasePrice?.hourly_price || 0),
      daily: Number(matchingBasePrice?.daily_price || 0),
    };
  };

  const getTierCalculatedDiscountLabel = (tier: PricingTier) => {
    const method = tier.duration_type === 'days'
      ? tier.daily_calculation_method
      : tier.calculation_method;
    const configuredDiscount = Number(getTierDiscountValue(tier) || 0);

    if (method === 'percentage' && configuredDiscount > 0) {
      return `${Math.round(configuredDiscount)}%`;
    }

    if (method === 'custom') {
      return tr('Custom', 'Personnalisé');
    }

    const basePricesForTier = getBasePricesForTier(tier);
    const tierAmount = getTierAmount(tier);

    if (tierAmount <= 0) {
      return '—';
    }

    const minUnits = tier.duration_type === 'days'
      ? Number(tier.min_days || 0)
      : Number(tier.min_hours || 0);
    const maxUnits = tier.duration_type === 'days'
      ? Number(tier.max_days || 0)
      : Number(tier.max_hours || 0);

    if (minUnits <= 0 || maxUnits <= 0) {
      return '—';
    }

    if (tier.duration_type === 'days') {
      const baseDailyPrice = basePricesForTier.daily;

      if (baseDailyPrice <= 0) {
        return '—';
      }

      const dailySavings = Math.max(
        0,
        Math.round(((baseDailyPrice - tierAmount) / baseDailyPrice) * 100)
      );

      return dailySavings > 0 ? `${dailySavings}%` : '—';
    }

    const baseHourlyPrice = basePricesForTier.hourly;

    if (baseHourlyPrice <= 0) {
      return '—';
    }

    const standardMinTotal = baseHourlyPrice * minUnits;
    const standardMaxTotal = baseHourlyPrice * maxUnits;

    const minSavings = standardMinTotal > 0
      ? Math.max(0, Math.round(((standardMinTotal - tierAmount) / standardMinTotal) * 100))
      : 0;
    const maxSavings = standardMaxTotal > 0
      ? Math.max(0, Math.round(((standardMaxTotal - tierAmount) / standardMaxTotal) * 100))
      : 0;

    if (minSavings <= 0 && maxSavings <= 0) {
      return '—';
    }

    if (minSavings === maxSavings || minUnits === maxUnits) {
      return `${Math.max(minSavings, maxSavings)}%`;
    }

    const low = Math.min(minSavings, maxSavings);
    const high = Math.max(minSavings, maxSavings);
    return `${low}% - ${high}%`;
  };

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
    const defaultPreset = enabledPresets.find((preset) => preset.isDefault) || enabledPresets[0] || null;

    return {
      model,
      presets,
      enabledPresets,
      defaultPreset,
      enabledCount: enabledPresets.length,
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
      <div className="min-h-screen bg-gray-50">
        <AdminModuleHero
          className="w-full"
          icon={<DollarSign className="h-8 w-8 text-white" />}
          eyebrow={tr('Pricing Management', 'Gestion tarifaire')}
          title={tr('Pricing Management', 'Gestion tarifaire')}
          description={tr('Preparing the pricing workspace...', 'Préparation de l’espace tarifaire...')}
        />
        <div className="max-w-7xl mx-auto p-6">
          <div className="rounded-2xl border border-violet-100 bg-white p-8 shadow-[0_18px_45px_rgba(76,29,149,0.08)]">
            <div className="flex flex-col items-center justify-center text-center">
              <div className="mb-4 text-4xl animate-spin">⏳</div>
              <p className="text-base font-medium text-slate-700">{tr('Loading pricing...', 'Chargement des tarifs...')}</p>
              <p className="mt-2 text-sm text-slate-500">{tr('Preparing rate tables, tiers, deposits, and pricing rules.', 'Préparation des tables tarifaires, paliers, cautions et règles de prix.')}</p>
            </div>
          </div>
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
                    <h1 className="text-2xl font-bold text-white sm:text-3xl">{tr('Pricing Management', 'Gestion tarifaire')}</h1>
                    <p className="mt-1 text-sm text-violet-200">
                      {tr('Manage rates, tiers, extensions, deposits, fuel, and tour pricing from one pricing workspace.', 'Gérez les tarifs, paliers, prolongations, dépôts, carburant et prix des tours depuis un seul espace tarifaire.')}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <button
                    onClick={() => setRefreshTrigger(prev => prev + 1)}
                    className="inline-flex items-center rounded-lg border border-white/20 bg-white/10 px-4 py-2 text-white backdrop-blur-sm transition-all duration-200 hover:border-white/30 hover:bg-white/20"
                  >
                    <RefreshCw className="mr-2 h-4 w-4" />
                    {tr('Refresh Pricing', 'Actualiser les tarifs')}
                  </button>

                  <div className="inline-flex items-center rounded-lg border border-white/20 bg-white/10 px-4 py-2 text-white backdrop-blur-sm">
                    <CheckCircle className="mr-2 h-4 w-4" />
                    {tr('Pricing workspace active', 'Espace tarifaire actif')}
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
                    onClick={() => handleTabChange(item.id)}
                    className={`group relative flex items-center whitespace-nowrap rounded-xl px-4 py-3 text-sm font-medium transition-all duration-200 ${
                      active
                        ? 'bg-gradient-to-r from-violet-600 to-indigo-700 text-white shadow-lg'
                        : 'text-slate-600 hover:bg-violet-50 hover:text-violet-700'
                    }`}
                  >
                    <Icon className={`mr-2 h-5 w-5 transition-transform duration-200 ${active ? 'scale-110' : 'group-hover:scale-105'}`} />
                    <span className="font-semibold">{isFrench ? item.labelFr : item.labelEn}</span>
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
                    <p className="font-medium text-red-800">{tr('Error', 'Erreur')}</p>
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
                    <p className="font-medium text-yellow-800">{tr('No Vehicle Models Found', 'Aucun modèle de véhicule trouvé')}</p>
                    <p className="mt-1 text-sm text-yellow-700">
                      {tr('Please add vehicle models first before creating pricing tiers. Check the browser console for more details.', 'Veuillez d’abord ajouter des modèles de véhicules avant de créer des paliers tarifaires. Consultez la console du navigateur pour plus de détails.')}
                    </p>
                  </div>
                </div>
              </div>
            )}

            <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400">{tr('Pricing Workspace', 'Espace tarifaire')}</p>
                  <h1 className="mt-2 text-3xl font-bold text-slate-900">
                    {isFrench ? PRICING_TAB_ITEMS.find((item) => item.id === activeTab)?.labelFr : PRICING_TAB_ITEMS.find((item) => item.id === activeTab)?.labelEn}
                  </h1>
                  <p className="mt-2 max-w-3xl text-sm text-slate-600">
                    {activeTab === 'base' && tr('Set core rental prices by model. This is the base layer other pricing rules build on top of.', 'Définissez les tarifs de location de base par modèle. C’est la couche principale sur laquelle reposent les autres règles tarifaires.')}
                    {activeTab === 'tiers' && tr('Shape longer rentals with duration tiers, discounts, and tier enforcement logic.', 'Structurez les locations longues avec des paliers de durée, des remises et une logique de contrôle des paliers.')}
                    {activeTab === 'extensions' && tr('Control overtime, grace windows, and how extended rentals are priced.', 'Contrôlez le dépassement, les délais de grâce et la tarification des prolongations.')}
                    {activeTab === 'transport' && tr('Manage pickup and drop-off charges without burying them inside system settings.', 'Gérez les frais de départ et de retour sans les cacher dans les paramètres système.')}
                    {activeTab === 'tour-pricing' && tr('Price each tour package by quad model and flexible timing like 1h, 1.5h, 2h, and 2.5h.', 'Tarifez chaque forfait tour par modèle de quad et avec des durées flexibles comme 1h, 1,5h, 2h et 2,5h.')}
                    {activeTab === 'packages' && tr('Create kilometer-based packages with included distance and overage logic.', 'Créez des forfaits kilométriques avec distance incluse et logique de dépassement.')}
                    {activeTab === 'deposits' && tr('Keep deposit presets consistent by model and by rental workflow.', 'Gardez des presets de dépôt cohérents par modèle et par workflow de location.')}
                    {activeTab === 'fuel' && tr('Set hourly and daily fuel line charges in the same workspace as the rest of pricing.', 'Définissez les frais carburant horaires et journaliers dans le même espace que le reste des tarifs.')}
                  </p>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="rounded-lg bg-gradient-to-br from-slate-100 to-white px-4 py-3 text-center ring-1 ring-slate-200/80">
                    <p className="whitespace-nowrap text-[11px] font-medium uppercase tracking-wide text-slate-500">{tr('Models', 'Modèles')}</p>
                    <p className="mt-1 text-2xl font-semibold text-slate-900">{pricingWorkspaceStats.vehicleModels}</p>
                  </div>
                  <div className="rounded-lg bg-violet-50 px-4 py-3 text-center ring-1 ring-violet-200/80">
                    <p className="whitespace-nowrap text-[11px] font-medium uppercase tracking-wide text-violet-600">{tr('Base Prices', 'Tarifs de base')}</p>
                    <p className="mt-1 text-2xl font-semibold text-violet-900">{pricingWorkspaceStats.activeBasePrices}</p>
                  </div>
                  <div className="rounded-lg bg-indigo-50 px-4 py-3 text-center ring-1 ring-indigo-200/80">
                    <p className="whitespace-nowrap text-[11px] font-medium uppercase tracking-wide text-indigo-600">{tr('Active Tiers', 'Paliers actifs')}</p>
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
                <h2 className="text-lg font-semibold text-gray-900">{tr('Base Prices', 'Tarifs de base')}</h2>
                <p className="mt-1 text-sm text-gray-600">{tr('Set the standard hourly, daily, weekly, and monthly prices by vehicle model.', 'Définissez les tarifs horaires, journaliers, hebdomadaires et mensuels standards par modèle de véhicule.')}</p>
              </div>
              <button
                onClick={() => setShowBasePriceForm(true)}
                className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700"
              >
                <Plus className="w-4 h-4" />
                {tr('Add Base Price', 'Ajouter un tarif de base')}
              </button>
            </div>

            <div className="mt-5 grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px_220px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder={tr('Search by vehicle model...', 'Rechercher par modèle de véhicule...')}
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
                <option value="">{tr('All Vehicle Models', 'Tous les modèles')}</option>
                {vehicleModels.map((model) => (
                  <option key={model.id} value={model.id}>
                    {getVehicleModelName(model.id)}
                  </option>
                ))}
              </select>

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="rounded-xl border border-gray-300 px-4 py-2.5 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              >
                <option value="all">{tr('All Status', 'Tous les statuts')}</option>
                <option value="active">{tr('Active', 'Actif')}</option>
                <option value="inactive">{tr('Inactive', 'Inactif')}</option>
              </select>
            </div>
          </div>

          <div className="p-6">
            {groupedBasePrices.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center">
                <p className="text-sm font-semibold text-slate-900">{tr('No base prices found', 'Aucun tarif de base trouvé')}</p>
                <p className="mt-1 text-sm text-slate-500">{tr('Add a base price or change the current filters.', 'Ajoutez un tarif de base ou modifiez les filtres actuels.')}</p>
              </div>
            ) : (
              <div className="space-y-4">
                {groupedBasePrices.map(({ model, prices }) => (
                  <div key={model.id} className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                    <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <h3 className="text-base font-semibold text-slate-900">{getVehicleModelName(model.id)}</h3>
                        <p className="mt-1 text-sm text-slate-500">{prices.length} {prices.length === 1 ? tr('base price record', 'tarif de base') : tr('base price records', 'tarifs de base')}</p>
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
                                  {price.is_active ? tr('Active', 'Actif') : tr('Inactive', 'Inactif')}
                                </span>
                                <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-600">
                                  {price.price_source || tr('auto', 'auto')}
                                </span>
                              </div>
                              <p className="mt-3 text-sm font-medium text-slate-500">{tr('Default rates', 'Tarifs par défaut')}</p>
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => handleEditBasePrice(price)}
                                className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-blue-600 transition hover:bg-blue-50"
                                title={tr('Edit base price', 'Modifier le tarif de base')}
                              >
                                <Edit className="h-4 w-4" />
                              </button>
                              <button
                                onClick={() => handleDeleteBasePrice(price.id)}
                                className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-red-200 text-red-600 transition hover:bg-red-50"
                                title={tr('Delete base price', 'Supprimer le tarif de base')}
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          </div>

                          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                            <div className="rounded-xl bg-slate-50 px-3 py-3">
                              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{tr('Hourly', 'Horaire')}</p>
                              <p className="mt-2 text-base font-bold text-slate-900">{formatCurrency(price.hourly_price)}</p>
                            </div>
                            <div className="rounded-xl bg-slate-50 px-3 py-3">
                              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{tr('Daily', 'Journalier')}</p>
                              <p className="mt-2 text-base font-bold text-slate-900">{formatCurrency(price.daily_price)}</p>
                            </div>
                            <div className="rounded-xl bg-slate-50 px-3 py-3">
                              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{tr('Weekly', 'Hebdomadaire')}</p>
                              <p className="mt-2 text-base font-bold text-slate-900">{price.weekly_price ? formatCurrency(price.weekly_price) : '—'}</p>
                            </div>
                            <div className="rounded-xl bg-slate-50 px-3 py-3">
                              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{tr('Monthly', 'Mensuel')}</p>
                              <p className="mt-2 text-base font-bold text-slate-900">{price.monthly_price ? formatCurrency(price.monthly_price) : '—'}</p>
                            </div>
                          </div>

                          <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                            <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">
                              {tr('Dynamic pricing', 'Tarification dynamique')} {price.dynamic_pricing_enabled ? tr('enabled', 'activée') : tr('off', 'désactivée')}
                            </span>
                            {(price.hourly_price || 0) > 0 ? (
                              <span className="inline-flex rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 font-medium text-violet-700">
                                {tr('Hourly default: Unlimited KM', 'Horaire par défaut : KM illimités')}
                              </span>
                            ) : null}
                            {(price.daily_price || 0) > 0 ? (
                              <span className="inline-flex rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-1 font-medium text-indigo-700">
                                {tr('Daily default: Unlimited KM', 'Journalier par défaut : KM illimités')}
                              </span>
                            ) : null}
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
                {editingPrice ? tr('Edit Base Price', 'Modifier le tarif de base') : tr('Add Base Price', 'Ajouter un tarif de base')}
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
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{tr('Guided Base Price Setup', 'Configuration guidée du tarif de base')}</p>
                <p className="mt-2 text-sm text-slate-600">
                  {tr('Set the default rates that everything else builds on top of. Start with hourly and daily, then add weekly or monthly only if you use them.', 'Définissez les tarifs par défaut sur lesquels repose tout le reste. Commencez par horaire et journalier, puis ajoutez hebdomadaire ou mensuel seulement si vous les utilisez.')}
                </p>
              </div>

              <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
                <div className="space-y-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {tr('Vehicle Model', 'Modèle de véhicule')}
                    </label>
                    <select
                      value={basePriceFormData.vehicle_model_id}
                      onChange={(e) => setBasePriceFormData({ ...basePriceFormData, vehicle_model_id: e.target.value })}
                      className="w-full rounded-xl border border-gray-300 px-3 py-2.5 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                      required
                    >
                      <option value="">{tr('Select a vehicle model', 'Sélectionner un modèle de véhicule')}</option>
                      {vehicleModels.map((model) => (
                        <option key={model.id} value={model.id}>
                          {getVehicleModelName(model.id)}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        {tr('Hourly Price (MAD)', 'Prix horaire (MAD)')}
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
                        {tr('Daily Price (MAD)', 'Prix journalier (MAD)')}
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
                        {tr('Weekly Price (MAD)', 'Prix hebdomadaire (MAD)')}
                      </label>
                      <input
                        type="number"
                        value={basePriceFormData.weekly_price}
                        onChange={(e) => setBasePriceFormData({ ...basePriceFormData, weekly_price: parseFloat(e.target.value) || 0 })}
                        className="w-full rounded-xl border border-gray-300 px-3 py-2.5 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                        min="0"
                        step="0.01"
                        placeholder={tr('Optional', 'Facultatif')}
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        {tr('Monthly Price (MAD)', 'Prix mensuel (MAD)')}
                      </label>
                      <input
                        type="number"
                        value={basePriceFormData.monthly_price}
                        onChange={(e) => setBasePriceFormData({ ...basePriceFormData, monthly_price: parseFloat(e.target.value) || 0 })}
                        className="w-full rounded-xl border border-gray-300 px-3 py-2.5 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                        min="0"
                        step="0.01"
                        placeholder={tr('Optional', 'Facultatif')}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {tr('Price Source', 'Source du prix')}
                    </label>
                    <select
                      value={basePriceFormData.price_source}
                      onChange={(e) => setBasePriceFormData({ ...basePriceFormData, price_source: e.target.value as any })}
                      className="w-full rounded-xl border border-gray-300 px-3 py-2.5 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                    >
                      <option value="auto">{tr('Auto', 'Auto')}</option>
                      <option value="manual">{tr('Manual', 'Manuel')}</option>
                      <option value="negotiated">{tr('Negotiated', 'Négocié')}</option>
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
                      <span className="text-sm font-medium text-gray-700">{tr('Active', 'Actif')}</span>
                    </label>

                    <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                      <input
                        type="checkbox"
                        checked={basePriceFormData.dynamic_pricing_enabled}
                        onChange={(e) => setBasePriceFormData({ ...basePriceFormData, dynamic_pricing_enabled: e.target.checked })}
                        className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-sm font-medium text-gray-700">{tr('Tarification dynamique activée', 'Tarification dynamique activée')}</span>
                    </label>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-600">{tr('Aperçu', 'Aperçu')}</p>
                    <p className="mt-3 text-base font-semibold text-slate-900">{selectedBaseModel ? getVehicleModelName(selectedBaseModel.id) : tr('Choisissez un modèle de véhicule', 'Choisissez un modèle de véhicule')}</p>
                    <div className="mt-4 space-y-3 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500">{tr('Horaire', 'Horaire')}</span>
                        <span className="font-semibold text-slate-900">{formatCurrency(basePriceFormData.hourly_price || 0)}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500">{tr('Journalier', 'Journalier')}</span>
                        <span className="font-semibold text-slate-900">{formatCurrency(basePriceFormData.daily_price || 0)}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500">{tr('Weekly', 'Hebdomadaire')}</span>
                        <span className="font-semibold text-slate-900">{basePriceFormData.weekly_price ? formatCurrency(basePriceFormData.weekly_price) : '—'}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500">{tr('Monthly', 'Mensuel')}</span>
                        <span className="font-semibold text-slate-900">{basePriceFormData.monthly_price ? formatCurrency(basePriceFormData.monthly_price) : '—'}</span>
                      </div>
                    </div>
                    <div className="mt-4 space-y-2 text-xs">
                      {(basePriceFormData.hourly_price || 0) > 0 ? (
                        <div className="rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 font-medium text-violet-700">
                          {tr('Default hourly package label: Unlimited KM', 'Libellé horaire par défaut : KM illimités')}
                        </div>
                      ) : null}
                      {(basePriceFormData.daily_price || 0) > 0 ? (
                        <div className="rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 font-medium text-indigo-700">
                          {tr('Default daily package label: Unlimited KM', 'Libellé journalier par défaut : KM illimités')}
                        </div>
                      ) : null}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <p className="text-sm font-semibold text-slate-900">{tr('Quick guidance', 'Guide rapide')}</p>
                    <ul className="mt-3 space-y-2 text-sm text-slate-600">
                      <li>{tr('Always set hourly and daily first.', 'Définissez toujours le tarif horaire et le tarif journalier en premier.')}</li>
                      <li>{tr('Use weekly and monthly only when you actively sell those durations.', 'Utilisez les tarifs hebdomadaires et mensuels uniquement si vous vendez réellement ces durées.')}</li>
                      <li>{tr('Keep this page simple because tiers and extensions build on top of it.', 'Gardez cette page simple, car les paliers et les prolongations s’appuient dessus.')}</li>
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
                  {tr('Cancel', 'Annuler')}
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {submitting ? (
                    <Loader className="w-4 h-4 animate-spin mx-auto" />
                  ) : (
                    editingPrice ? tr('Update', 'Mettre à jour') : tr('Create', 'Créer')
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
                  <h2 className="text-lg font-semibold text-gray-900">{tr('Pricing Tiers', 'Paliers tarifaires')}</h2>
                  <p className="mt-1 text-sm text-gray-600">
                    {tr('Create clearer hourly and daily rules without forcing the team to decode `1-1` style ranges.', "Créez des règles horaires et journalières plus claires sans obliger l'équipe à décoder des plages du type `1-1`.")}
                  </p>
                </div>
                <button
                  onClick={() => setShowTierForm(true)}
                  className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700"
                >
                  <Plus className="h-4 w-4" />
                  {tr('Add Pricing Tier', 'Ajouter un palier tarifaire')}
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
                      {type === 'hours' ? tr('Hourly Tiers', 'Paliers horaires') : tr('Daily Tiers', 'Paliers journaliers')}
                    </button>
                  ))}
                </div>

                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
                  <select
                    value={selectedVehicleForTiers}
                    onChange={(e) => setSelectedVehicleForTiers(e.target.value)}
                    className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  >
                    <option value="">{tr('All Vehicle Models', 'Tous les modèles de véhicules')}</option>
                    {vehicleModels.map((model) => (
                      <option key={model.id} value={model.id}>
                        {getVehicleModelName(model.id)}
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
                      {tr('Extension Pricing Rules', 'Règles tarifaires de prolongation')}
                    </h4>
                    <p className="mt-1 text-sm text-blue-800">
                      {tr('Keep extension pricing predictable by deciding when tiers are required and when fallback pricing is allowed.', 'Gardez une tarification de prolongation prévisible en décidant quand les paliers sont obligatoires et quand un tarif de secours est autorisé.')}
                    </p>
                  </div>
                  <button
                    onClick={saveTierEnforcementSettings}
                    disabled={savingTierEnforcement}
                    className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {savingTierEnforcement ? <Loader className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    {savingTierEnforcement ? 'Enregistrement...' : 'Enregistrer les paramètres'}
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
                      <span className="text-sm font-semibold text-slate-900">{tr('Enable tiered pricing', 'Activer la tarification par palier')}</span>
                      <p className="mt-1 text-xs text-slate-500">{tr('Apply tier prices when extensions are requested.', 'Appliquer les prix par palier lors des demandes de prolongation.')}</p>
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
                      <span className="text-sm font-semibold text-slate-900">{tr('Only allow matching tiers', 'Autoriser uniquement les paliers correspondants')}</span>
                      <p className="mt-1 text-xs text-slate-500">{tr('Block extensions when no valid tier covers the requested duration.', 'Bloquer les prolongations lorsqu’aucun palier valide ne couvre la durée demandée.')}</p>
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
                      <span className="text-sm font-semibold text-slate-900">{tr('Fallback to hourly pricing', 'Basculer vers la tarification horaire')}</span>
                      <p className="mt-1 text-xs text-slate-500">{tr('If no tier matches, calculate from the hourly rate instead.', "Si aucun palier ne correspond, calculez à partir du tarif horaire.")}</p>
                    </div>
                  </label>
                </div>
              </div>

              <div className="mt-6 space-y-4">
                {groupedVisibleTiers.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center">
                    <p className="text-sm font-semibold text-slate-900">{tierDurationFilter === 'hours' ? tr('No hourly tiers found', 'Aucun palier horaire trouvé') : tr('No daily tiers found', 'Aucun palier journalier trouvé')}</p>
                    <p className="mt-1 text-sm text-slate-500">
                      {tierDurationFilter === 'hours'
                        ? tr('Add a hourly tier or change the vehicle filter.', 'Ajoutez un palier horaire ou modifiez le filtre véhicule.')
                        : tr('Add a daily tier or change the vehicle filter.', 'Ajoutez un palier journalier ou modifiez le filtre véhicule.')}
                    </p>
                  </div>
                ) : (
                  groupedVisibleTiers.map(({ model, tiers }) => (
                    <div key={model.id} className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                      <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <h3 className="text-base font-semibold text-slate-900">{getVehicleModelName(model.id)}</h3>
                          <p className="mt-1 text-sm text-slate-500">
                            {tiers.length} {tierDurationFilter === 'hours' ? tr('hourly tier', 'palier horaire') : tr('daily tier', 'palier journalier')}{tiers.length === 1 ? '' : 's'}
                          </p>
                        </div>
                        <span className="inline-flex self-start rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-600 border border-slate-200">
                          {tierDurationFilter === 'hours' ? tr('Hourly pricing', 'Tarification horaire') : tr('Daily pricing', 'Tarification journalière')}
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
                                    {tier.is_active ? tr('Active', 'Actif') : tr('Inactive', 'Inactif')}
                                  </span>
                                </div>
                                <p className="mt-3 text-2xl font-bold text-slate-900">{formatCurrency(getTierAmount(tier))}</p>
                                <p className="mt-1 text-sm text-slate-500">{getTierMethodLabel(tier)}</p>
                              </div>
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => handleEditTier(tier)}
                                  className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-blue-600 transition hover:bg-blue-50"
                                  title={tr('Edit tier', 'Modifier le palier')}
                                >
                                  <Edit className="h-4 w-4" />
                                </button>
                                <button
                                  onClick={() => {
                                    handleEditTier(tier);
                                    setEditingTier(null);
                                  }}
                                  className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-500 transition hover:bg-slate-100"
                                  title={tr('Duplicate tier', 'Dupliquer le palier')}
                                >
                                  <Plus className="h-4 w-4" />
                                </button>
                                <button
                                  onClick={() => handleDeleteTier(tier.id)}
                                  className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-red-200 text-red-600 transition hover:bg-red-50"
                                  title={tr('Delete tier', 'Supprimer le palier')}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </div>
                            </div>

                            <div className="mt-4 grid gap-3 sm:grid-cols-3">
                              <div className="rounded-xl bg-slate-50 px-3 py-3">
                                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{tr('Applies to', "S'applique à")}</p>
                                <p className="mt-2 text-sm font-semibold text-slate-900">{formatTierDuration(tier)}</p>
                              </div>
                              <div className="rounded-xl bg-slate-50 px-3 py-3">
                                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{tr('Price Type', 'Type de prix')}</p>
                                <p className="mt-2 text-sm font-semibold text-slate-900">{getTierMethodLabel(tier)}</p>
                              </div>
                              <div className="rounded-xl bg-slate-50 px-3 py-3">
                                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{tr('Discount', 'Remise')}</p>
                                <p className="mt-2 text-sm font-semibold text-slate-900">
                                  {getTierCalculatedDiscountLabel(tier)}
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
          {editingTier ? tr('Edit Pricing Tier', 'Modifier le palier tarifaire') : tr('Add Pricing Tier', 'Ajouter un palier tarifaire')}
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
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{tr('Guided Tier Setup', 'Configuration guidée du palier')}</p>
          <p className="mt-2 text-sm text-slate-600">
            {tr('Choose the model, choose hourly or daily, then decide if this tier covers one exact duration or a range.', 'Choisissez le modèle, choisissez horaire ou journalier, puis décidez si ce palier couvre une durée exacte ou une plage.')}
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {tr('Vehicle Model', 'Modèle de véhicule')}
              </label>
              <select
                value={tierFormData.vehicle_model_id}
                onChange={(e) => setTierFormData({ ...tierFormData, vehicle_model_id: e.target.value })}
                className="w-full rounded-xl border border-gray-300 px-3 py-2.5 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                required
              >
                <option value="">{tr('Select a vehicle model', 'Sélectionner un modèle de véhicule')}</option>
                {vehicleModels.map((model) => (
                  <option key={model.id} value={model.id}>
                    {getVehicleModelName(model.id)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {tr('Pricing Type', 'Type de tarification')}
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
                    {type === 'hours' ? tr('Hourly Tier', 'Palier horaire') : tr('Daily Tier', 'Palier journalier')}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {tr('Applies To', "S'applique à")}
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
                    {mode === 'single' ? tr('Single duration', 'Durée unique') : tr('Duration range', 'Plage de durée')}
                  </button>
                ))}
              </div>
            </div>

            {tierFormData.duration_type === 'hours' ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {tierFormData.duration_mode === 'single' ? tr('Hour', 'Heure') : tr('From Hour', 'À partir de l’heure')}
                  </label>
                  <input
                    type="number"
                    value={tierFormData.min_hours}
                    onChange={(e) => {
                      const value = parseHourTierValue(e.target.value || '1');
                      setTierFormData((prev: any) => ({
                        ...prev,
                        min_hours: value,
                        max_hours: prev.duration_mode === 'single' ? value : prev.max_hours,
                      }));
                    }}
                    className="w-full rounded-xl border border-gray-300 px-3 py-2.5 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                    required
                    min="0.5"
                    step="0.5"
                  />
                </div>

                {tierFormData.duration_mode === 'range' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {tr('To Hour', "Jusqu'à l'heure")}
                    </label>
                    <input
                      type="number"
                      value={tierFormData.max_hours}
                      onChange={(e) => setTierFormData({ ...tierFormData, max_hours: parseHourTierValue(e.target.value || '1') })}
                      className="w-full rounded-xl border border-gray-300 px-3 py-2.5 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                      required
                      min={tierFormData.min_hours || 1}
                      step="0.5"
                    />
                  </div>
                )}
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {tierFormData.duration_mode === 'single' ? tr('Day', 'Jour') : tr('From Day', 'À partir du jour')}
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
                      {tr('To Day', "Jusqu'au jour")}
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
                  {tr('Price Type', 'Type de prix')}
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
                  <option value="fixed">{tr('Fixed Price', 'Prix fixe')}</option>
                  <option value="percentage">{tr('Discount %', 'Remise %')}</option>
                  <option value="custom">{tr('Custom Formula', 'Formule personnalisée')}</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {tierFormData.duration_type === 'days' ? tr('Daily Price (MAD)', 'Prix journalier (MAD)') : tr('Price Amount (MAD)', 'Montant du prix (MAD)')}
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={tierFormData.duration_type === 'days' ? tierFormData.daily_price_amount : tierFormData.price_amount}
                  onChange={(e) => {
                    const sanitizedValue = String(e.target.value || '').replace(/[^\d]/g, '');
                    const value = parseInt(sanitizedValue || '0', 10) || 0;
                    setTierFormData((prev: any) => prev.duration_type === 'days'
                      ? { ...prev, daily_price_amount: value }
                      : { ...prev, price_amount: value }
                    );
                  }}
                  className="w-full rounded-xl border border-gray-300 px-3 py-2.5 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  required
                  placeholder="0"
                />
              </div>
            </div>

            {((tierFormData.duration_type === 'days' && tierFormData.daily_calculation_method === 'percentage') ||
              (tierFormData.duration_type === 'hours' && tierFormData.calculation_method === 'percentage')) && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {tr('Discount Percentage', 'Pourcentage de remise')}
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
              <span className="text-sm font-medium text-gray-700">{tr('Active', 'Actif')}</span>
            </label>

            <div className="pt-2">
              <button
                type="button"
                onClick={() => validateTierConfiguration(tierFormData)}
                className="inline-flex items-center gap-2 rounded-xl bg-purple-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-purple-700"
              >
                <Calculator className="h-4 w-4" />
                {tr('Valider le palier', 'Valider le palier')}
              </button>
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-600">{tr('Aperçu', 'Aperçu')}</p>
              <p className="mt-3 text-base font-semibold text-slate-900">{selectedTierModel ? getVehicleModelName(selectedTierModel.id) : tr('Choisissez un modèle de véhicule', 'Choisissez un modèle de véhicule')}</p>
              <p className="mt-2 text-sm text-slate-600">
                {tr('Applies to', "S'applique à")}{' '}
                <span className="font-semibold text-slate-900">
                  {tierPreviewMin === tierPreviewMax
                    ? `${tierPreviewMin} ${tierPreviewUnit}${tierPreviewMin === 1 ? '' : 's'}`
                    : `${tierPreviewMin}-${tierPreviewMax} ${tierPreviewUnit}${tierPreviewMax === 1 ? '' : 's'}`}
                </span>
              </p>
              <p className="mt-2 text-2xl font-bold text-blue-700">{formatCurrency(tierPreviewPrice)}</p>
              <p className="mt-2 text-sm text-slate-500">
                {tierFormData.duration_type === 'days'
                  ? (tierFormData.daily_calculation_method === 'fixed' ? tr('Fixed Price', 'Prix fixe') : tierFormData.daily_calculation_method === 'percentage' ? tr('Discount %', 'Remise %') : tr('Custom Formula', 'Formule personnalisée'))
                  : (tierFormData.calculation_method === 'fixed' ? tr('Fixed Price', 'Prix fixe') : tierFormData.calculation_method === 'percentage' ? tr('Discount %', 'Remise %') : tr('Custom Formula', 'Formule personnalisée'))}
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm font-semibold text-slate-900">{tr('Quick guidance', 'Guide rapide')}</p>
              <ul className="mt-3 space-y-2 text-sm text-slate-600">
                <li>{tr('Use ', 'Utilisez ')}<span className="font-semibold text-slate-900">{tr('Single duration', 'Durée unique')}</span>{tr(' for exact rules like 1 hour or 2 days.', ' pour les règles exactes comme 1 heure ou 2 jours.')}</li>
                <li>{tr('Use ', 'Utilisez ')}<span className="font-semibold text-slate-900">{tr('Duration range', 'Plage de durée')}</span>{tr(' only when one price should cover multiple durations.', " uniquement lorsqu'un seul prix doit couvrir plusieurs durées.")}</li>
                <li>{tr('Choose ', 'Choisissez ')}<span className="font-semibold text-slate-900">{tr('Fixed Price', 'Prix fixe')}</span>{tr(' for most setups to keep pricing simple.', ' dans la plupart des cas pour garder une tarification simple.')}</li>
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
            {tr('Cancel', 'Annuler')}
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? (
              <Loader className="w-4 h-4 animate-spin mx-auto" />
            ) : (
              editingTier ? tr('Update', 'Mettre à jour') : tr('Create', 'Créer')
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
                <h2 className="text-lg font-semibold text-gray-900">{tr('Extension Rules', 'Règles de prolongation')}</h2>
                <p className="mt-1 text-sm text-gray-600">
                  {tr('Control the grace period, uplift, and approval path for each vehicle model’s extension pricing.', 'Contrôlez la période de grâce, le multiplicateur et le parcours d’approbation pour la tarification de prolongation de chaque modèle de véhicule.')}
                </p>
              </div>
              <button
                onClick={() => setShowExtensionForm(true)}
                className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700"
              >
                <Plus className="h-4 w-4" />
                {tr('Add Extension Rule', 'Ajouter une règle de prolongation')}
              </button>
            </div>
          </div>

          <div className="p-6">
            {groupedExtensionRules.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center">
                <p className="text-sm font-semibold text-slate-900">{tr('No extension rules found', 'Aucune règle de prolongation trouvée')}</p>
                <p className="mt-1 text-sm text-slate-500">{tr('Add an extension rule to control grace periods and extension pricing behavior.', 'Ajoutez une règle de prolongation pour contrôler les périodes de grâce et le comportement tarifaire des prolongations.')}</p>
              </div>
            ) : (
              <div className="space-y-4">
                {groupedExtensionRules.map(({ model, rules }) => (
                  <div key={model.id} className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                    <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <h3 className="text-base font-semibold text-slate-900">{model.name}</h3>
                        <p className="mt-1 text-sm text-slate-500">
                          {rules.length} {tr('extension rule for this model', 'règle de prolongation pour ce modèle')}{rules.length === 1 ? '' : 's'}
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
                                    {rule.auto_adjust_enabled ? tr('Auto adjust', 'Ajustement automatique') : tr('Manual pricing', 'Tarification manuelle')}
                                  </span>
                                  <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-600">
                                    {tr('Grace', 'Grâce')} {rule.grace_period_minutes} min
                                  </span>
                                </div>
                                <p className="mt-3 text-sm font-medium text-slate-500">{tr('Base rate', 'Tarif de base')}</p>
                                <p className="mt-1 text-base font-semibold text-slate-900">{basePrice?.vehicle_model?.name || tr('Unknown base price', 'Tarif de base inconnu')}</p>
                              </div>
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => handleEditExtension(rule)}
                                  className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-blue-600 transition hover:bg-blue-50"
                                  title={tr('Edit extension rule', 'Modifier la règle de prolongation')}
                                >
                                  <Edit className="h-4 w-4" />
                                </button>
                                <button
                                  onClick={() => handleDeleteExtension(rule.id)}
                                  className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-red-200 text-red-600 transition hover:bg-red-50"
                                  title={tr('Delete extension rule', 'Supprimer la règle de prolongation')}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </div>
                            </div>

                            <div className="mt-4 grid gap-3 sm:grid-cols-3">
                              <div className="rounded-xl bg-slate-50 px-3 py-3">
                                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{tr('Grace period', 'Période de grâce')}</p>
                                <p className="mt-2 text-base font-bold text-slate-900">{rule.grace_period_minutes} min</p>
                              </div>
                              <div className="rounded-xl bg-slate-50 px-3 py-3">
                                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{tr('Multiplier', 'Multiplicateur')}</p>
                                <p className="mt-2 text-base font-bold text-slate-900">{rule.extension_price_multiplier}x</p>
                              </div>
                              <div className="rounded-xl bg-slate-50 px-3 py-3">
                                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{tr('Approval path', "Parcours d'approbation")}</p>
                                <p className="mt-2 text-base font-bold text-slate-900">
                                  {rule.requires_manual_extension ? tr('Manual review', 'Revue manuelle') : tr('Automatic', 'Automatique')}
                                </p>
                              </div>
                            </div>

                            <div className="mt-4 flex flex-wrap gap-2 text-xs">
                              <span className={`inline-flex rounded-full border px-2.5 py-1 font-semibold ${
                                rule.auto_adjust_enabled
                                  ? 'border-green-200 bg-green-50 text-green-700'
                                  : 'border-slate-200 bg-slate-50 text-slate-600'
                              }`}>
                                {rule.auto_adjust_enabled ? tr('Price adjusts automatically', 'Le prix se règle automatiquement') : tr('Price stays manual', 'Le prix reste manuel')}
                              </span>
                              <span className={`inline-flex rounded-full border px-2.5 py-1 font-semibold ${
                                rule.requires_manual_extension
                                  ? 'border-amber-200 bg-amber-50 text-amber-700'
                                  : 'border-blue-200 bg-blue-50 text-blue-700'
                              }`}>
                                {rule.requires_manual_extension ? tr('Requires staff approval', "Nécessite l'approbation du personnel") : tr('Customer can continue directly', 'Le client peut continuer directement')}
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
                {editingExtension ? tr('Edit Extension Rule', 'Modifier la règle de prolongation') : tr('Add Extension Rule', 'Ajouter une règle de prolongation')}
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
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{tr('Guided Extension Rule Setup', 'Configuration guidée de la règle de prolongation')}</p>
                <p className="mt-2 text-sm text-slate-600">
                  {tr('Choose the base vehicle price, define how much grace to allow, then decide whether the extension should price itself or wait for staff approval.', "Choisissez le tarif de base du véhicule, définissez la période de grâce autorisée, puis décidez si la prolongation doit se tarifer automatiquement ou attendre l'approbation du personnel.")}
                </p>
              </div>

              <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
                <div className="space-y-6">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">
                      {tr('Base Price', 'Tarif de base')}
                    </label>
                    <select
                      value={extensionFormData.base_price_id}
                      onChange={(e) => setExtensionFormData({ ...extensionFormData, base_price_id: e.target.value })}
                      className="w-full rounded-xl border border-gray-300 px-3 py-2.5 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                      required
                    >
                      <option value="">{tr('Select a base price', 'Sélectionner un tarif de base')}</option>
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
                        {tr('Grace Period (minutes)', 'Période de grâce (minutes)')}
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
                        {tr('Price Multiplier', 'Multiplicateur de prix')}
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
                      <span className="text-sm font-medium text-gray-700">{tr('Auto adjust pricing', 'Ajuster automatiquement la tarification')}</span>
                    </label>

                    <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                      <input
                        type="checkbox"
                        checked={extensionFormData.requires_manual_extension}
                        onChange={(e) => setExtensionFormData({ ...extensionFormData, requires_manual_extension: e.target.checked })}
                        className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-sm font-medium text-gray-700">{tr("Nécessite l'approbation du personnel", "Nécessite l'approbation du personnel")}</span>
                    </label>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-600">{tr('Aperçu', 'Aperçu')}</p>
                    <p className="mt-3 text-base font-semibold text-slate-900">{selectedExtensionVehicle?.name || tr('Choisissez un modèle de véhicule', 'Choisissez un modèle de véhicule')}</p>
                    <div className="mt-4 space-y-3 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500">{tr('Période de grâce', 'Période de grâce')}</span>
                        <span className="font-semibold text-slate-900">{extensionFormData.grace_period_minutes || 0} min</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500">{tr('Multiplicateur', 'Multiplicateur')}</span>
                        <span className="font-semibold text-slate-900">{extensionFormData.extension_price_multiplier || 0}x</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500">{tr('Tarification', 'Tarification')}</span>
                        <span className="font-semibold text-slate-900">
                          {extensionFormData.auto_adjust_enabled ? tr('Automatique', 'Automatique') : tr('Manuelle', 'Manuelle')}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500">{tr('Approval', 'Approbation')}</span>
                        <span className="font-semibold text-slate-900">
                          {extensionFormData.requires_manual_extension ? tr('Staff approval', "Approbation du personnel") : tr('Direct', 'Direct')}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <p className="text-sm font-semibold text-slate-900">{tr('Quick guidance', 'Guide rapide')}</p>
                    <ul className="mt-3 space-y-2 text-sm text-slate-600">
                      <li>{tr('Use a short grace period to avoid charging customers for a few extra minutes.', 'Utilisez une courte période de grâce pour éviter de facturer les clients pour quelques minutes supplémentaires.')}</li>
                      <li>{tr('A multiplier above ', 'Un multiplicateur supérieur à ')}<span className="font-semibold text-slate-900">1.0x</span>{tr(' increases the extension price.', ' augmente le prix de prolongation.')}</li>
                      <li>{tr('Turn on staff approval only when you want extensions reviewed before the rental can continue.', "Activez l'approbation du personnel uniquement si vous voulez qu'une prolongation soit revue avant que la location ne continue.")}</li>
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
            {tr('Cancel', 'Annuler')}
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {submitting ? (
                    <Loader className="w-4 h-4 animate-spin mx-auto" />
                  ) : (
              editingExtension ? tr('Update', 'Mettre à jour') : tr('Create', 'Créer')
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
            <h2 className="text-lg font-semibold text-gray-900">{tr('Transport Fees', 'Frais de transport')}</h2>
            <p className="mt-1 text-sm text-gray-600">{tr('Set optional pickup and dropoff charges that are added to the rental total.', 'Définissez des frais optionnels de prise en charge et de retour ajoutés au total de location.')}</p>
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
                  {tr('Pickup Fee (MAD)', 'Frais de prise en charge (MAD)')}
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
                  {tr('Dropoff Fee (MAD)', 'Frais de retour (MAD)')}
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
                {tr('Reset', 'Réinitialiser')}
              </button>
              <button
                type="submit"
                disabled={savingTransportFees}
                className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {savingTransportFees ? (
                  <>
                    <Loader className="w-4 h-4 animate-spin" />
                    Enregistrement...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    {tr('Save Changes', 'Enregistrer les modifications')}
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
                <h2 className="text-lg font-semibold text-gray-900">{tr('Damage Deposits', 'Dépôts de garantie')}</h2>
                <p className="mt-1 text-sm text-gray-600">
                  {tr('Keep deposit presets clear by vehicle model, with up to three quick choices for the rental team.', "Gardez des presets de dépôt clairs par modèle de véhicule, avec jusqu'à trois choix rapides pour l'équipe de location.")}
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
                    Enregistrement...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4" />
                    {tr('Save Deposit Settings', 'Enregistrer les paramètres de dépôt')}
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
                <option value="">{tr('All Vehicle Models', 'Tous les modèles de véhicules')}</option>
                {vehicleModels.map((model) => (
                  <option key={model.id} value={model.id}>
                    {[model.name, model.model].filter(Boolean).join(' ').trim() || model.name}
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
                  <span className="text-sm font-medium text-slate-900">{tr('Allow custom deposit entry', 'Autoriser la saisie manuelle du dépôt')}</span>
                  <p className="mt-0.5 text-xs text-slate-500">{tr('Lets staff type a manual deposit when none of the presets fit.', "Permet à l'équipe de saisir un dépôt manuel lorsqu'aucun preset ne convient.")}</p>
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
                    <h3 className="text-base font-semibold text-slate-900">
                      {[selectedDepositModel?.name, selectedDepositModel?.model].filter(Boolean).join(' ').trim() || getVehicleModelName(selectedVehicleForDeposits)}
                    </h3>
                    <p className="mt-1 text-sm text-slate-500">
                      {tr('Configure up to three clear deposit choices for this model. Keep the labels short so the rental team can choose quickly.', "Configurez jusqu'à trois choix de dépôt clairs pour ce modèle. Gardez des libellés courts pour que l'équipe de location choisisse rapidement.")}
                    </p>
                  </div>
                  <button
                    onClick={handleAddPresetForVehicle}
                    disabled={getCurrentVehiclePresets().length >= 3}
                    className="inline-flex items-center gap-2 self-start rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Plus className="h-4 w-4" />
                    {tr('Add Preset', 'Ajouter un preset')}
                  </button>
                </div>

                {getCurrentVehiclePresets().length === 0 ? (
                  <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-10 text-center">
                    <p className="text-sm font-semibold text-slate-900">{tr('No deposit presets for this model yet', 'Aucun preset de dépôt pour ce modèle pour le moment')}</p>
                    <p className="mt-1 text-sm text-slate-500">{tr('Add your first preset to give the rental team a quick deposit choice.', "Ajoutez votre premier preset pour offrir à l'équipe de location un choix rapide de dépôt.")}</p>
                  </div>
                ) : (
                  <div className="mt-4 grid gap-4 xl:grid-cols-3">
                    {getCurrentVehiclePresets().map((preset, index) => (
                      <div key={index} className="rounded-2xl border border-white bg-white p-4 shadow-sm">
                        <div className="flex items-center justify-between gap-3">
                          <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-600">
                            {tr('Preset', 'Preset')} {index + 1}
                          </span>
                          <button
                            onClick={() => handleDeletePresetForVehicle(index)}
                            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-red-200 text-red-600 transition hover:bg-red-50"
                            title={tr('Delete preset', 'Supprimer le preset')}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>

                        <div className="mt-4 space-y-4">
                          <div>
                            <label className="mb-1 block text-sm font-medium text-slate-700">{tr('Label', 'Libellé')}</label>
                            <input
                              type="text"
                              value={preset.label}
                              onChange={(e) => handleUpdatePresetForVehicle(index, 'label', e.target.value)}
                              className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                              placeholder={tr('e.g. Standard', 'ex. Standard')}
                            />
                          </div>

                          <div>
                            <label className="mb-1 block text-sm font-medium text-slate-700">{tr('Amount (MAD)', 'Montant (MAD)')}</label>
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
                            <span className="text-sm font-medium text-slate-700">{tr('Preset enabled', 'Preset activé')}</span>
                          </label>

                          <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
                            <input
                              type="radio"
                              name={`default-deposit-${selectedVehicleForDeposits}`}
                              checked={Boolean(preset.isDefault)}
                              onChange={(e) => handleUpdatePresetForVehicle(index, 'isDefault', e.target.checked)}
                              className="h-4 w-4 border-gray-300 text-blue-600 focus:ring-blue-500"
                            />
                            <span className="text-sm font-medium text-slate-700">{tr('Default preset', 'Preset par défaut')}</span>
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
                  <h3 className="text-base font-semibold text-slate-900">{tr('Deposit Overview', "Vue d'ensemble des dépôts")}</h3>
                  <p className="mt-1 text-sm text-slate-500">{tr('Review every model at a glance and jump back into the editor when something needs changing.', "Passez en revue chaque modèle d'un coup d'œil et revenez à l'éditeur lorsqu'une modification est nécessaire.")}</p>
                </div>
              </div>

              <div className="mt-4 grid gap-4 xl:grid-cols-2">
                {visibleDepositOverview.map(({ model, presets, enabledPresets, enabledCount, defaultPreset }) => (
                  <div key={model.id} className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                    <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h4 className="text-base font-semibold text-slate-900">
                            {[model.name, model.model].filter(Boolean).join(' ').trim() || model.name}
                          </h4>
                          <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${enabledCount > 0 ? 'border-green-200 bg-green-50 text-green-700' : 'border-slate-200 bg-white text-slate-600'}`}>
                            {enabledCount > 0 ? tr('Ready for rentals', 'Prêt pour les locations') : tr('No active presets', 'Aucun preset actif')}
                          </span>
                        </div>
                        <p className="mt-1 text-sm text-slate-500">
                          {presets.length} {tr('preset configured', 'preset configuré')}{presets.length === 1 ? '' : 's'}
                        </p>
                      </div>
                      <button
                        onClick={() => setSelectedVehicleForDeposits(model.id)}
                        className="inline-flex self-start rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-blue-600 transition hover:bg-blue-50"
                      >
                        {tr('Configure', 'Configurer')}
                      </button>
                    </div>

                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <div className="rounded-xl bg-white px-3 py-3">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{tr('Enabled presets', 'Presets activés')}</p>
                        <p className="mt-2 text-base font-bold text-slate-900">{enabledCount}</p>
                      </div>
                      <div className="rounded-xl bg-white px-3 py-3">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{tr('Custom entry', 'Saisie personnalisée')}</p>
                        <p className="mt-2 text-base font-bold text-slate-900">{depositSettings.allowCustomDeposit ? tr('Allowed', 'Autorisée') : tr('Locked', 'Verrouillée')}</p>
                      </div>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                      {presets.length === 0 ? (
                        <span className="inline-flex rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-500">
                          {tr('No presets yet', 'Aucun preset pour le moment')}
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
                            {preset.label}: {formatCurrency(preset.amount || 0)}{preset.isDefault ? ` • ${tr('Default', 'Par défaut')}` : ''}
                          </span>
                        ))
                      )}
                    </div>

                    {defaultPreset ? (
                      <div className="mt-4 rounded-xl bg-white px-3 py-3">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{tr('Default damage deposit', 'Dépôt de garantie par défaut')}</p>
                        <p className="mt-2 text-base font-bold text-slate-900">
                          {defaultPreset.label}: {formatCurrency(defaultPreset.amount || 0)}
                        </p>
                      </div>
                    ) : null}
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
