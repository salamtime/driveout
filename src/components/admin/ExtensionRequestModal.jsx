import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog';
import { Button } from '../ui/button';
import { Alert, AlertDescription } from '../ui/alert';
import { AlertTriangle, Clock, CheckCircle, Check, Calendar, Package, Calculator, ChevronUp, ChevronDown } from 'lucide-react';
import ExtensionPricingService from '../../services/ExtensionPricingService';
import { canApproveRentalExtensions, canEditExtensionPrice, requiresExtensionApproval } from '../../utils/permissionHelpers';
import { supabase } from '../../lib/supabase';

const normalizeInitialExtensionHours = (value) => {
  const parsed = Math.ceil(Number(value || 1));
  if (!Number.isFinite(parsed) || parsed <= 0) return 1;
  return Math.min(24, parsed);
};

export default function ExtensionRequestModal({ isOpen, onClose, rental, onExtensionCreated, currentUser, editingExtension = null, initialExtensionHours = 1, initialQuickExtensionConfig = null }) {
  const [extensionType, setExtensionType] = useState('hours');
  const [selectedHours, setSelectedHours] = useState(1);
  const [selectedDays, setSelectedDays] = useState(1);
  const [priceCalculation, setPriceCalculation] = useState(null);
  const [isCalculating, setIsCalculating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [manualPriceOverride, setManualPriceOverride] = useState(false);
  const [customPrice, setCustomPrice] = useState('');
  const [baseHourlyRate, setBaseHourlyRate] = useState(null);
  const [baseDailyRate, setBaseDailyRate] = useState(null);
  
  // NEW: KM Package state
  const [availablePackages, setAvailablePackages] = useState([]);
  const [selectedPackage, setSelectedPackage] = useState(null);
  const [usePackagePricing, setUsePackagePricing] = useState(false);
  const [estimatedKms, setEstimatedKms] = useState(150);
  const [packagePrice, setPackagePrice] = useState(null);
  const [showPackageSelector, setShowPackageSelector] = useState(false);
  const [showCalculator, setShowCalculator] = useState(false);
  const isEditing = Boolean(editingExtension?.id);

  const canApproveExtensionPrice = canApproveRentalExtensions(currentUser);
  const canOverrideExtensionPrice = canEditExtensionPrice(currentUser);
  const extensionApprovalRequired = requiresExtensionApproval(currentUser);
  const canAutoApproveExtension = canApproveExtensionPrice || !extensionApprovalRequired;
  const normalizedInitialExtensionHours = normalizeInitialExtensionHours(initialExtensionHours);
  const hourOptions = [...new Set([1, 2, 3, 4, normalizedInitialExtensionHours, selectedHours])]
    .filter((hours) => Number.isFinite(hours) && hours > 0)
    .sort((a, b) => a - b);
  const dayOptions = [1, 2, 3, 4];

  useEffect(() => {
    if (isOpen && rental?.id) {
      const value = extensionType === 'days' ? selectedDays : selectedHours;
      if (value > 0) {
        calculatePrice();
      }
    }
  }, [isOpen, rental?.id, selectedHours, selectedDays, extensionType, usePackagePricing, selectedPackage]);

  useEffect(() => {
    // Fetch base rates when rental loads
    if (rental?.vehicle?.vehicle_model?.id) {
      fetchBaseRates();
    }
  }, [rental]);

  // NEW: Fetch KM packages when vehicle model is available
  useEffect(() => {
    if (rental?.vehicle?.vehicle_model?.id && extensionType) {
      fetchKMPackages();
    }
  }, [rental?.vehicle?.vehicle_model?.id, extensionType]);

  useEffect(() => {
    if (!isOpen) return;

    if (editingExtension) {
      const nextType = editingExtension.extension_type === 'days' ? 'days' : 'hours';
      const nextValue = Number(editingExtension.extension_value) || (nextType === 'days'
        ? Math.max(1, Math.round((Number(editingExtension.extension_hours) || 24) / 24))
        : Math.max(1, Number(editingExtension.extension_hours) || 1));
      const isManual = Boolean(editingExtension.is_custom_price) || editingExtension.price_source === 'manual';
      const isPackage = Boolean(editingExtension.use_package_pricing || editingExtension.package_id);

      setExtensionType(nextType);
      setSelectedHours(nextType === 'hours' ? nextValue : 1);
      setSelectedDays(nextType === 'days' ? nextValue : 1);
      setManualPriceOverride(isManual);
      setCustomPrice(String(editingExtension.extension_price || ''));
      setUsePackagePricing(isPackage);
      setShowPackageSelector(isPackage);
      setShowCalculator(isPackage);
      setError(null);
    } else {
      const presetType = initialQuickExtensionConfig?.extensionType === 'days' ? 'days' : 'hours';
      const presetDays = Math.max(1, Math.ceil(Number(initialQuickExtensionConfig?.initialDays || 1)) || 1);
      const presetUsePackage = Boolean(initialQuickExtensionConfig?.usePackagePricing && initialQuickExtensionConfig?.packageId);

      setExtensionType(presetType);
      setSelectedHours(presetType === 'hours' ? normalizedInitialExtensionHours : 1);
      setSelectedDays(presetType === 'days' ? presetDays : 1);
      setManualPriceOverride(false);
      setCustomPrice('');
      setUsePackagePricing(presetUsePackage);
      setSelectedPackage(null);
      setPackagePrice(null);
      setEstimatedKms(Math.max(1, Math.ceil(Number(initialQuickExtensionConfig?.estimatedKms || 150)) || 150));
      setShowPackageSelector(presetUsePackage);
      setShowCalculator(presetUsePackage);
      setError(null);
    }
  }, [editingExtension, initialQuickExtensionConfig, isOpen, normalizedInitialExtensionHours]);

  useEffect(() => {
    if (!isOpen || !editingExtension || !availablePackages.length) return;
    if (!(editingExtension.use_package_pricing || editingExtension.package_id)) return;

    const matchingPackage = availablePackages.find((pkg) => pkg.id === editingExtension.package_id);
    if (matchingPackage) {
      setSelectedPackage(matchingPackage);
    }
  }, [availablePackages, editingExtension, isOpen]);

  useEffect(() => {
    if (!isOpen || editingExtension || !initialQuickExtensionConfig?.packageId || !availablePackages.length) return;

    const matchingPackage = availablePackages.find((pkg) => String(pkg.id) === String(initialQuickExtensionConfig.packageId));
    if (matchingPackage) {
      setSelectedPackage(matchingPackage);
      setUsePackagePricing(true);
      setShowPackageSelector(true);
      setShowCalculator(true);
    }
  }, [availablePackages, editingExtension, initialQuickExtensionConfig, isOpen]);

  const fetchBaseRates = async () => {
    try {
      const hourlyRate = await ExtensionPricingService.getBaseHourlyPrice(rental.vehicle.vehicle_model.id);
      const dailyRate = await ExtensionPricingService.getBaseDailyPrice(rental.vehicle.vehicle_model.id);
      setBaseHourlyRate(hourlyRate);
      setBaseDailyRate(dailyRate);
    } catch (err) {
      console.error('Error fetching base rates:', err);
    }
  };

  // NEW: Fetch KM packages for this vehicle model
  const fetchKMPackages = async () => {
    try {
      const vehicleModelId = rental.vehicle.vehicle_model.id;
      const rateTypeId = extensionType === 'hours' ? 1 : 2; // 1 = hourly, 2 = daily
      
      const { data, error } = await supabase
        .from('app_4c3a7a6153_rental_km_packages')
        .select('*')
        .eq('vehicle_model_id', vehicleModelId)
        .eq('rate_type_id', rateTypeId)
        .eq('is_active', true)
        .order('fixed_amount', { ascending: true });
      
      if (error) {
        console.error('Error fetching packages:', error);
        return;
      }
      
      console.log('Found ' + (data?.length || 0) + ' packages for ' + extensionType + ' (rate_type_id: ' + rateTypeId + '):', data);
      setAvailablePackages(data || []);
      
      // Reset package selection for the current rate type.
      setSelectedPackage(null);
      setPackagePrice(null);
    } catch (err) {
      console.error('Error fetching packages:', err);
    }
  };

  // NEW: Calculate package price with kilometer estimate
  const calculatePackagePriceWithKm = (pkg, hours, kms) => {
    const duration = extensionType === 'hours' ? hours : (hours / 24);
    const ratePerUnit = parseFloat(pkg.fixed_amount) || 0;
    const baseRentalCost = ratePerUnit * duration;
    
    if (!pkg.included_kilometers) {
      return { total: baseRentalCost, ratePerUnit, baseCost: baseRentalCost, extraCost: 0 };
    }
    
    const extraRate = parseFloat(pkg.extra_km_rate) || 0;
    const totalIncludedKm = pkg.included_kilometers * duration;
    
    if (kms <= totalIncludedKm) {
      return { 
        total: baseRentalCost, 
        ratePerUnit, 
        baseCost: baseRentalCost, 
        extraCost: 0,
        includedKm: totalIncludedKm,
        perUnitKm: pkg.included_kilometers
      };
    }
    
    const extraKms = kms - totalIncludedKm;
    const extraCost = extraKms * extraRate;
    
    return { 
      total: baseRentalCost, // FIXED - total is always base cost only
      ratePerUnit, 
      baseCost: baseRentalCost, 
      extraCost, // informational only
      extraKms, // informational only
      potentialTotal: baseRentalCost + extraCost, // informational estimate
      includedKm: totalIncludedKm,
      perUnitKm: pkg.included_kilometers
    };
  };

  const calculatePrice = async () => {
    const extensionValue = extensionType === 'days' ? selectedDays : selectedHours;
    if (!rental?.id || extensionValue <= 0) return;

    setIsCalculating(true);
    setError(null);

    try {
      // If using package pricing and a package is selected
      if (usePackagePricing && selectedPackage) {
        const extensionHours = extensionType === 'days' ? extensionValue * 24 : extensionValue;
        const ratePerUnit = parseFloat(selectedPackage.fixed_amount) || 0;
        const totalPrice = ratePerUnit * extensionValue; // For days, multiply by days, not hours
        
        // Create a price calculation object
        const packagePriceResult = {
          extension_hours: extensionHours,
          extension_price: totalPrice,
          extension_type: extensionType,
          extension_value: extensionValue,
          tier_applied: false,
          isPackage: true,
          package_name: selectedPackage.name,
          package_rate_per_unit: ratePerUnit,
          package_included_km: selectedPackage.included_kilometers,
          newEndDate: new Date(new Date(rental.rental_end_date).getTime() + extensionHours * 60 * 60 * 1000).toISOString()
        };
        
        setPriceCalculation(packagePriceResult);
        
        // CRITICAL FIX: Also set packagePrice so submit handler and getEffectiveRate use the correct rate
        setPackagePrice({
          total: totalPrice,
          ratePerUnit: ratePerUnit,
          baseCost: totalPrice,
          extraCost: 0,
          extraKms: 0,
          includedKm: (selectedPackage.included_kilometers || 0) * extensionValue,
          perUnitKm: selectedPackage.included_kilometers || 0
        });
        
        console.log('📦 Package price set:', {
          package: selectedPackage.name,
          ratePerUnit,
          extensionValue,
          extensionType,
          totalPrice,
          calculation: ratePerUnit + ' MAD × ' + extensionValue + ' ' + extensionType + ' = ' + totalPrice + ' MAD'
        });
        
        setIsCalculating(false);
        return;
      }
      
      // Otherwise use regular pricing service
      const result = await ExtensionPricingService.calculateExtensionPrice(rental.id, extensionValue, extensionType);
      setPriceCalculation(result);
      setCustomPrice(result.extension_price?.toString() || result.totalPrice?.toString() || '0');
    } catch (err) {
      console.error('❌ Error calculating price:', err);
      setError(`Failed to calculate price: ${err.message}`);
    } finally {
      setIsCalculating(false);
    }
  };

  const handleSubmit = async (autoApprove = false) => {
    if (!rental?.id) {
      setError('Missing rental data');
      return;
    }

    let finalPrice;
    
    if (usePackagePricing && selectedPackage && packagePrice) {
      finalPrice = packagePrice.total;
    } else if (manualPriceOverride) {
      finalPrice = parseFloat(customPrice);
    } else {
      finalPrice = priceCalculation?.extension_price || priceCalculation?.totalPrice || 0;
    }

    if (isNaN(finalPrice) || finalPrice <= 0) {
      setError('Invalid price amount');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const extensionValue = extensionType === 'days' ? selectedDays : selectedHours;
      const extensionHours = extensionType === 'days' ? extensionValue * 24 : extensionValue;
      
      // Build extension data with package info if applicable
      const extensionData = {
        rental_id: rental.id,
        extension_hours: extensionHours,
        extension_type: extensionType,
        extension_value: extensionValue,
        extension_price: finalPrice,
        requested_by: currentUser?.id,
        status: autoApprove ? 'approved' : 'pending',
        approved_by: autoApprove ? currentUser?.id : null,
        approved_at: autoApprove ? new Date().toISOString() : null,
        price_source: usePackagePricing ? 'package' : 
                      (manualPriceOverride ? 'manual' : 
                        (priceCalculation?.tier_applied ? 
                          (extensionType === 'days' ? 'daily_tier' : 'hourly_tier') : 
                          (extensionType === 'days' ? 'daily_base' : 'hourly_base'))),
        calculation_method: usePackagePricing ? 'package' : (manualPriceOverride ? 'manual' : 'auto'),
        tier_applied: priceCalculation?.tier_applied || false,
        tier_id: priceCalculation?.tier_id || null,
        notes: null
      };

      // Add package fields if using package pricing
      if (usePackagePricing && selectedPackage && packagePrice) {
        extensionData.package_id = selectedPackage.id;
        extensionData.package_name = selectedPackage.name;
        extensionData.package_rate_per_unit = packagePrice.ratePerUnit;
        extensionData.package_included_km_per_unit = selectedPackage.included_kilometers;
        extensionData.package_total_included_km = packagePrice.includedKm;
        extensionData.package_extra_rate = selectedPackage.extra_km_rate || 0;
        extensionData.package_extra_cost = packagePrice.extraCost || 0;
        extensionData.package_extra_kms = packagePrice.extraKms || 0;
        extensionData.estimated_kms = estimatedKms;
        extensionData.use_package_pricing = true;
      }

      const overrideData = (usePackagePricing || manualPriceOverride)
        ? { ...extensionData, bypassValidation: true }
        : null;

      if (isEditing) {
        const oldHours = parseFloat(editingExtension.extension_hours) || 0;
        const oldPrice = parseFloat(editingExtension.extension_price) || 0;
        const deltaHours = extensionHours - oldHours;
        const deltaPrice = finalPrice - oldPrice;
        const isApprovedExtension = editingExtension.status === 'approved';

        const updatePayload = {
          extension_hours: extensionHours,
          extension_type: extensionType,
          extension_value: extensionValue,
          extension_price: finalPrice,
          price_source: extensionData.price_source,
          calculation_method: extensionData.calculation_method,
          tier_applied: extensionData.tier_applied,
          tier_id: extensionData.tier_id,
          package_id: extensionData.package_id || null,
          package_name: extensionData.package_name || null,
          package_rate_per_unit: extensionData.package_rate_per_unit || 0,
          package_included_km_per_unit: extensionData.package_included_km_per_unit || null,
          package_total_included_km: extensionData.package_total_included_km || null,
          package_extra_rate: extensionData.package_extra_rate || 0,
          package_extra_cost: extensionData.package_extra_cost || 0,
          package_extra_kms: extensionData.package_extra_kms || 0,
          estimated_kms: extensionData.estimated_kms || null,
          use_package_pricing: Boolean(extensionData.use_package_pricing),
          is_custom_price: manualPriceOverride,
          updated_at: new Date().toISOString(),
        };

        const { data: updatedExtension, error: updateError } = await supabase
          .from('rental_extensions')
          .update(updatePayload)
          .eq('id', editingExtension.id)
          .select('*')
          .single();

        if (updateError) throw updateError;

        let newEndDate = rental?.actual_end_date || rental?.rental_end_date || null;

        if (isApprovedExtension) {
          const currentEnd = new Date(rental?.actual_end_date || rental?.rental_end_date || new Date().toISOString());
          const adjustedEnd = new Date(currentEnd.getTime() + (deltaHours * 60 * 60 * 1000));
          newEndDate = adjustedEnd.toISOString();

          const isHourlyRental = rental?.rental_type === 'hourly';
          const currentQuantityHours = parseFloat(rental?.quantity_hours) || 0;
          const currentQuantityDays = parseFloat(rental?.quantity_days) || 0;
          const nextTotalAmount = (parseFloat(rental?.total_amount) || 0) + deltaPrice;
          const nextDepositAmount = parseFloat(rental?.deposit_amount) || 0;

          const rentalUpdatePayload = {
            rental_end_date: newEndDate,
            actual_end_date: newEndDate,
            total_amount: nextTotalAmount,
            remaining_amount: Math.max(0, nextTotalAmount - nextDepositAmount),
            quantity_hours: isHourlyRental
              ? currentQuantityHours + deltaHours
              : currentQuantityHours,
            quantity_days: isHourlyRental
              ? currentQuantityDays
              : currentQuantityDays + (deltaHours / 24),
            updated_at: new Date().toISOString(),
          };

          const { error: rentalUpdateError } = await supabase
            .from('app_4c3a7a6153_rentals')
            .update(rentalUpdatePayload)
            .eq('id', rental.id);

          if (rentalUpdateError) throw rentalUpdateError;
        }

        alert('✅ Extension updated successfully!');

        await Promise.resolve(onExtensionCreated?.({
          extension: updatedExtension,
          autoApprove: isApprovedExtension,
          extensionHours,
          extensionType,
          extensionValue,
          extensionPrice: finalPrice,
          newEndDate,
        }));
      } else {
        const { extension } = await ExtensionPricingService.validateAndCalculateExtensionPrice(
          rental.id, 
          extensionHours, 
          currentUser?.id, 
          autoApprove,
          overrideData
        );

        alert(autoApprove 
          ? '✅ Extension approved and rental updated!' 
          : '✅ Extension request submitted for approval!'
        );

        await Promise.resolve(onExtensionCreated?.({
          extension,
          autoApprove,
          extensionHours,
          extensionType,
          extensionValue,
          extensionPrice: finalPrice,
          newEndDate:
            priceCalculation?.newEndDate ||
            new Date(new Date(rental.rental_end_date).getTime() + extensionHours * 60 * 60 * 1000).toISOString(),
        }));
      }

      onClose();
    } catch (err) {
      console.error('❌ Error creating extension request:', err);
      setError(`Failed to ${isEditing ? 'update' : 'create'} extension request: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'decimal',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount || 0);
  };

  const handleCustomPriceChange = (e) => {
    const value = e.target.value;
    if (value === '' || /^\d*\.?\d*$/.test(value)) {
      setCustomPrice(value);
    }
  };

  // Calculate savings correctly based on base price
  const calculateSavings = () => {
    if (!priceCalculation) return 0;
    
    if (usePackagePricing && selectedPackage && packagePrice) {
      // For packages, savings would be compared to standard tier pricing
      return 0; // Could implement if needed
    }
    
    if (extensionType === 'hours' && priceCalculation.tier_applied && baseHourlyRate) {
      const hours = priceCalculation.extension_hours || selectedHours;
      const basePrice = baseHourlyRate * hours;
      const actualPrice = priceCalculation.extension_price || 0;
      return Math.max(0, basePrice - actualPrice);
    }
    
    if (extensionType === 'days' && priceCalculation.tier_applied && baseDailyRate) {
      const days = priceCalculation.extension_value || selectedDays;
      const basePrice = baseDailyRate * days;
      const actualPrice = priceCalculation.extension_price || 0;
      return Math.max(0, basePrice - actualPrice);
    }
    
    return priceCalculation.totalSavings || 0;
  };

  // Get the effective rate
  const getEffectiveRate = () => {
    if (!priceCalculation) return 0;
    
    if (usePackagePricing && selectedPackage && packagePrice) {
      return packagePrice.ratePerUnit;
    }
    
    if (extensionType === 'hours') {
      const hours = priceCalculation.extension_hours || selectedHours;
      const totalPrice = priceCalculation.extension_price || 0;
      return hours > 0 ? totalPrice / hours : 0;
    } else {
      const days = priceCalculation.extension_value || selectedDays;
      const totalPrice = priceCalculation.extension_price || 0;
      return days > 0 ? totalPrice / days : 0;
    }
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose?.();
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-0 shadow-xl sm:max-w-2xl">
        <DialogHeader className="border-b border-slate-200 bg-gradient-to-r from-white via-slate-50 to-violet-50/60 px-5 py-5 sm:px-6">
          <DialogTitle className="flex items-center gap-2 text-lg font-semibold text-slate-900 sm:text-xl">
            <Clock className="h-5 w-5 text-violet-600" />
            {isEditing ? 'Edit Extension' : 'Request Extension'}
          </DialogTitle>
          <DialogDescription className="mt-1 text-sm font-medium text-slate-500">
            {isEditing ? 'Adjust the saved extension without leaving rental details.' : 'Keep the extension flow quick and easy for the team.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 px-5 py-5 sm:px-6">
          {/* Extension Type Toggle */}
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4">
            <label className="mb-3 block text-sm font-semibold text-slate-700">
              Extension Type
            </label>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setExtensionType('hours');
                  // Clear package selection when switching extension type
                  setSelectedPackage(null);
                  setPackagePrice(null);
                  setUsePackagePricing(false);
                  setShowPackageSelector(false);
                }}
                className={`
                  flex-1 rounded-xl border px-4 py-3 text-sm font-semibold transition-all flex items-center justify-center gap-2
                  ${extensionType === 'hours'
                    ? 'border-violet-200 bg-violet-50 text-violet-700 shadow-sm ring-2 ring-violet-100'
                    : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'
                  }
                `}
              >
                <Clock className="w-4 h-4" />
                Hours
              </button>
              <button
                onClick={() => {
                  setExtensionType('days');
                  // Clear package selection when switching extension type
                  setSelectedPackage(null);
                  setPackagePrice(null);
                  setUsePackagePricing(false);
                  setShowPackageSelector(false);
                }}
                className={`
                  flex-1 rounded-xl border px-4 py-3 text-sm font-semibold transition-all flex items-center justify-center gap-2
                  ${extensionType === 'days'
                    ? 'border-violet-200 bg-violet-50 text-violet-700 shadow-sm ring-2 ring-violet-100'
                    : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'
                  }
                `}
              >
                <Calendar className="w-4 h-4" />
                Days
              </button>
            </div>
          </div>

          {/* Duration Selection */}
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4">
            <label className="mb-3 block text-sm font-semibold text-slate-700">
              Extension Duration
            </label>
            <div className="grid grid-cols-4 gap-2">
              {extensionType === 'hours' ? (
                hourOptions.map((hours) => (
                  <button
                    key={hours}
                    onClick={() => setSelectedHours(hours)}
                    className={`
                      rounded-xl border px-3 py-3 font-semibold text-sm transition-all
                      ${selectedHours === hours
                        ? 'border-violet-200 bg-violet-50 text-violet-700 shadow-sm ring-2 ring-violet-100'
                        : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'
                      }
                    `}
                  >
                    {hours}h
                  </button>
                ))
              ) : (
                dayOptions.map((days) => (
                  <button
                    key={days}
                    onClick={() => setSelectedDays(days)}
                    className={`
                      rounded-xl border px-3 py-3 font-semibold text-sm transition-all
                      ${selectedDays === days
                        ? 'border-violet-200 bg-violet-50 text-violet-700 shadow-sm ring-2 ring-violet-100'
                        : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'
                      }
                    `}
                  >
                    {days} day{days > 1 ? 's' : ''}
                  </button>
                ))
              )}
            </div>
            {extensionType === 'days' && (
              <p className="mt-2 text-xs font-medium text-slate-500">
                {selectedDays} day{selectedDays > 1 ? 's' : ''} = {selectedDays * 24} hours
              </p>
            )}
          </div>

          {canOverrideExtensionPrice && !usePackagePricing && (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={manualPriceOverride}
                  onChange={(e) => setManualPriceOverride(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-violet-600 focus:ring-violet-500"
                />
                <span className="text-sm font-semibold text-slate-700">Override Price</span>
              </label>

              {manualPriceOverride && (
                <div className="mt-3 space-y-2">
                  <label className="block text-sm font-semibold text-slate-700">
                    Custom Extension Fee (MAD)
                  </label>
                  <input
                    type="text"
                    value={customPrice}
                    onChange={handleCustomPriceChange}
                    className="w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-base font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-violet-500"
                    placeholder="Enter custom amount"
                  />
                </div>
              )}
            </div>
          )}

          {/* Apply KM Package Toggle - Harmonic with layout */}
          {availablePackages.length > 0 && (
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center justify-between mb-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={usePackagePricing}
                    onChange={(e) => {
                      const newValue = e.target.checked;
                      setUsePackagePricing(newValue);
                      setShowPackageSelector(newValue);
                      setManualPriceOverride(false);
                      if (!newValue) setTimeout(calculatePrice, 100);
                    }}
                    className="w-4 h-4 text-violet-600 rounded border-slate-300 focus:ring-violet-500"
                  />
                  <span className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
                    <Package className="w-4 h-4 text-violet-600" />
                    Apply {extensionType === 'hours' ? 'Hourly' : 'Daily'} Package
                  </span>
                </label>
                {usePackagePricing && (
                  <span className="rounded-full bg-violet-100 px-2 py-1 text-xs font-semibold text-violet-700">
                    {availablePackages.length} available
                  </span>
                )}
              </div>

              {usePackagePricing && (
                <div className="space-y-3 mt-2">
                  {/* Package Selection - Matching the duration button style */}
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-2">
                      Select {extensionType === 'hours' ? 'Hourly' : 'Daily'} Package
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      {availablePackages.map((pkg) => {
                        const isSelected = selectedPackage?.id === pkg.id;
                        const ratePerUnit = parseFloat(pkg.fixed_amount) || 0;
                        
                        return (
                      <button
                            key={pkg.id}
                            type="button"
                            onClick={() => {
                              setSelectedPackage(pkg);
                              setTimeout(calculatePrice, 100);
                            }}
                            className={`
                              relative rounded-xl border px-3 py-3 transition-all text-left
                              ${isSelected
                                ? 'border-violet-200 bg-violet-50 ring-2 ring-violet-100 shadow-sm'
                                : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'
                              }
                            `}
                          >
                            <div className="flex flex-col gap-1">
                              <div className="flex items-center justify-between">
                                <span className="font-semibold text-slate-900 text-sm truncate pr-1">
                                  {pkg.name}
                                </span>
                                {isSelected && (
                                  <div className="w-4 h-4 bg-violet-600 rounded-full flex items-center justify-center flex-shrink-0">
                                    <Check className="w-2.5 h-2.5 text-white" />
                                  </div>
                                )}
                              </div>
                              
                              <div className="flex items-center gap-2 text-xs">
                                <span className="font-bold text-violet-700">
                                  {ratePerUnit.toFixed(0)} MAD
                                </span>
                                <span className="text-slate-400 text-[10px]">/ {extensionType === 'hours' ? 'hr' : 'day'}</span>
                              </div>
                              
                              <div className="flex flex-wrap gap-1 mt-0.5">
                                {pkg.included_kilometers && (
                                  <span className="text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full">
                                    {pkg.included_kilometers}km incl.
                                  </span>
                                )}
                                {pkg.extra_km_rate > 0 && (
                                  <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">
                                    +{pkg.extra_km_rate}/km
                                  </span>
                                )}
                              </div>
                              
                              <div className="mt-1 pt-1 border-t border-slate-100 text-[10px] text-slate-500">
                                <span className="font-medium text-violet-600">
                                  {(ratePerUnit * (extensionType === 'days' ? selectedDays : selectedHours)).toFixed(0)} MAD
                                </span>
                                <span className="text-slate-400 ml-1">total</span>
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Price Display */}
          {isCalculating ? (
            <div className="flex items-center justify-center rounded-xl border border-slate-200 bg-slate-50 py-10">
              <div className="h-8 w-8 rounded-full border-4 border-violet-600 border-t-transparent animate-spin" />
            </div>
          ) : priceCalculation && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 sm:p-5 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-slate-600">Extension Duration</span>
                <span className="font-semibold text-slate-900">
                  {extensionType === 'days' 
                    ? `${selectedDays} day${selectedDays > 1 ? 's' : ''} (${selectedDays * 24}h)`
                    : `${selectedHours} hour${selectedHours > 1 ? 's' : ''}`
                  }
                </span>
              </div>

              {/* Extension Fee - Always visible outside collapse */}
              <div className="mb-3 rounded-xl bg-violet-700 p-4 text-white shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold">Extension Fee</span>
                  <span className="text-xl font-bold">
                    {(() => {
                      // Calculate based on selected package or standard pricing
                      if (usePackagePricing && selectedPackage) {
                        const ratePerUnit = parseFloat(selectedPackage.fixed_amount) || 0;
                        const extensionValue = extensionType === 'days' ? selectedDays : selectedHours;
                        return (ratePerUnit * extensionValue).toFixed(0);
                      }
                      
                      // Use price calculation from service
                      if (priceCalculation) {
                        return priceCalculation.extension_price?.toFixed(0) || '0';
                      }
                      
                      return '0';
                    })()} MAD
                  </span>
                </div>
                <div className="mt-1 text-[10px] font-medium text-violet-100">
                  {usePackagePricing && selectedPackage ? (
                    `${parseFloat(selectedPackage.fixed_amount).toFixed(0)} MAD × ${extensionType === 'days' ? selectedDays : selectedHours} ${extensionType === 'days' ? 'days' : 'hrs'}`
                  ) : (
                    priceCalculation && `${getEffectiveRate().toFixed(0)} MAD × ${extensionType === 'days' ? selectedDays : selectedHours} ${extensionType === 'days' ? 'days' : 'hrs'}`
                  )}
                </div>
              </div>

              {/* Package Details - Collapsible (only when package selected) */}
              {usePackagePricing && selectedPackage && (
                <div className="overflow-hidden rounded-xl border border-violet-200 bg-white">
                  {/* Collapsible Header */}
                  <button
                    type="button"
                    onClick={() => setShowCalculator(!showCalculator)}
                    className="w-full px-4 py-3 bg-violet-50 flex items-center justify-between hover:bg-violet-100 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <Calculator className="w-4 h-4 text-violet-600" />
                      <span className="text-sm font-semibold text-violet-900">Package Details</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-violet-600">
                        {showCalculator ? 'Hide' : 'Show'}
                      </span>
                      {showCalculator ? (
                        <ChevronUp className="w-4 h-4 text-violet-600" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-violet-600" />
                      )}
                    </div>
                  </button>

                  {/* Collapsible Content */}
                  {showCalculator && (
                    <div className="p-3 bg-white">
                      {(() => {
                        const duration = extensionType === 'hours' ? selectedHours : selectedDays;
                        const ratePerUnit = parseFloat(selectedPackage.fixed_amount) || 0;
                        const includedKmsPerUnit = selectedPackage.included_kilometers;
                        const totalIncludedKm = includedKmsPerUnit ? includedKmsPerUnit * duration : null;

                        return (
                          <div className="space-y-2">
                            {/* Stats Grid */}
                            <div className="grid grid-cols-2 gap-2">
                              {totalIncludedKm && (
                                <div className="bg-emerald-50 rounded-lg p-2 text-center">
                                  <div className="text-xs text-slate-500">Included</div>
                                  <div className="font-bold text-emerald-600">{totalIncludedKm}km</div>
                                  <div className="text-[10px] text-slate-400">
                                    {includedKmsPerUnit}km × {duration}
                                  </div>
                                </div>
                              )}
                              {selectedPackage.extra_km_rate > 0 && (
                                <div className="bg-amber-50 rounded-lg p-2 text-center">
                                  <div className="text-xs text-slate-500">Extra rate</div>
                                  <div className="font-bold text-amber-600">{selectedPackage.extra_km_rate} MAD/km</div>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  )}
                </div>
              )}

              {!usePackagePricing && (
                <>
                  {/* Standard pricing display (existing code) */}
                  <div className="space-y-2 pt-2 border-t">
                    <p className="text-xs font-semibold text-slate-600">Price Breakdown</p>
                    
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-700">
                        {extensionType === 'hours' 
                          ? `${selectedHours} hour${selectedHours > 1 ? 's' : ''} @ ${formatCurrency(getEffectiveRate())} MAD/hour`
                          : `${selectedDays} day${selectedDays > 1 ? 's' : ''} @ ${formatCurrency(getEffectiveRate())} MAD/day`
                        }
                        {priceCalculation.tier_applied ? ' (tier rate)' : ' (base rate)'}
                      </span>
                      <span className="font-medium">{formatCurrency(priceCalculation.extension_price)} MAD</span>
                    </div>

                    {/* Show base rate comparison when using tier pricing */}
                    {extensionType === 'hours' && priceCalculation.tier_applied && baseHourlyRate && (
                      <div className="mt-1 flex justify-between border-t border-slate-200 pt-1 text-xs text-slate-500">
                        <span>Base rate would be:</span>
                        <span>{formatCurrency(baseHourlyRate)} MAD/hour × {selectedHours}h = {formatCurrency(baseHourlyRate * selectedHours)} MAD</span>
                      </div>
                    )}

                    {extensionType === 'days' && priceCalculation.tier_applied && baseDailyRate && (
                      <div className="mt-1 flex justify-between border-t border-slate-200 pt-1 text-xs text-slate-500">
                        <span>Base rate would be:</span>
                        <span>{formatCurrency(baseDailyRate)} MAD/day × {selectedDays} day{selectedDays > 1 ? 's' : ''} = {formatCurrency(baseDailyRate * selectedDays)} MAD</span>
                      </div>
                    )}
                  </div>

                  {/* Savings */}
                  {calculateSavings() > 0 && (
                    <div className="flex items-center justify-between rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">
                      <span className="font-semibold">You Save</span>
                      <span className="font-semibold">{formatCurrency(calculateSavings())} MAD</span>
                    </div>
                  )}
                </>
              )}



              {/* New End Date */}
              {priceCalculation?.newEndDate && (
                <div className="border-t border-slate-200 pt-2 text-xs font-medium text-slate-500">
                  <p>New end date: {new Date(priceCalculation.newEndDate).toLocaleString()}</p>
                </div>
              )}
            </div>
          )}

          {error && (
            <Alert className="border-red-200 bg-red-50">
              <AlertTriangle className="h-4 w-4 text-red-600" />
              <AlertDescription className="text-sm text-red-800">{error}</AlertDescription>
            </Alert>
          )}

          {/* Action Buttons */}
          <div className="sticky bottom-0 flex flex-col gap-2 border-t border-slate-200 bg-slate-50 pt-4 sm:flex-row">
            <Button
              variant="outline"
              onClick={onClose}
              disabled={isSubmitting}
              className="order-2 w-full rounded-lg border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 sm:order-1 sm:w-auto"
            >
              Cancel
            </Button>

            {canAutoApproveExtension ? (
              <Button
                onClick={() => handleSubmit(true)}
                disabled={isSubmitting || isCalculating || !priceCalculation}
                className="order-1 w-full rounded-lg bg-violet-700 px-5 py-3 text-sm font-semibold text-white hover:bg-violet-800 sm:order-2 sm:flex-1"
              >
                {isSubmitting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                    Processing...
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-4 h-4 mr-2" />
                    {isEditing ? 'Save Extension Changes' : canApproveExtensionPrice ? 'Approve & Extend Immediately' : 'Create Extension'}
                  </>
                )}
              </Button>
            ) : (
              <Button
                onClick={() => handleSubmit(false)}
                disabled={isSubmitting || isCalculating || !priceCalculation}
                className="order-1 w-full rounded-lg bg-violet-700 px-5 py-3 text-sm font-semibold text-white hover:bg-violet-800 sm:order-2 sm:flex-1"
              >
                {isSubmitting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                    Submitting...
                  </>
                ) : (
                  <>
                    <Clock className="w-4 h-4 mr-2" />
                    {isEditing ? 'Save Extension Changes' : 'Submit Request'}
                  </>
                )}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
