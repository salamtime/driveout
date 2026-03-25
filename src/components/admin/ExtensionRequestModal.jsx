import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { Button } from '../ui/button';
import { Alert, AlertDescription } from '../ui/alert';
import { AlertTriangle, Clock, CheckCircle, Check, Calendar, Package, Calculator, ChevronUp, ChevronDown } from 'lucide-react';
import ExtensionPricingService from '../../services/ExtensionPricingService';
import { canApprovePriceOverrides, canEditExtensionPrice } from '../../utils/permissionHelpers';
import { supabase } from '../../lib/supabase';

export default function ExtensionRequestModal({ isOpen, onClose, rental, onExtensionCreated, currentUser }) {
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

  const canApproveExtensionPrice = canApprovePriceOverrides(currentUser);
  const canOverrideExtensionPrice = canEditExtensionPrice(currentUser);
  const hourOptions = [1, 2, 3, 4];
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
      
      // Always clear selected package when fetching new packages (extension type changed)
      setSelectedPackage(null);
      setPackagePrice(null);
      setUsePackagePricing(false);
      setShowPackageSelector(false);
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

      onExtensionCreated();
      onClose();
    } catch (err) {
      console.error('❌ Error creating extension request:', err);
      setError(`Failed to create extension request: ${err.message}`);
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
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg sm:text-xl">
            <Clock className="w-5 h-5 text-purple-600" />
            Request Extension
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Extension Type Toggle */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
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
                  flex-1 py-2 px-4 rounded-lg border-2 font-medium text-sm transition-all flex items-center justify-center gap-2
                  ${extensionType === 'hours'
                    ? 'border-blue-600 bg-blue-50 text-blue-700 shadow-md'
                    : 'border-gray-200 bg-white text-gray-700 hover:border-blue-300'
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
                  flex-1 py-2 px-4 rounded-lg border-2 font-medium text-sm transition-all flex items-center justify-center gap-2
                  ${extensionType === 'days'
                    ? 'border-blue-600 bg-blue-50 text-blue-700 shadow-md'
                    : 'border-gray-200 bg-white text-gray-700 hover:border-blue-300'
                  }
                `}
              >
                <Calendar className="w-4 h-4" />
                Days
              </button>
            </div>
          </div>

          {/* Duration Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Extension Duration
            </label>
            <div className="grid grid-cols-4 gap-2">
              {extensionType === 'hours' ? (
                hourOptions.map((hours) => (
                  <button
                    key={hours}
                    onClick={() => setSelectedHours(hours)}
                    className={`
                      py-2 px-3 rounded-lg border-2 font-medium text-sm transition-all
                      ${selectedHours === hours
                        ? 'border-blue-600 bg-blue-50 text-blue-700 shadow-md'
                        : 'border-gray-200 bg-white text-gray-700 hover:border-blue-300'
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
                      py-2 px-3 rounded-lg border-2 font-medium text-sm transition-all
                      ${selectedDays === days
                        ? 'border-blue-600 bg-blue-50 text-blue-700 shadow-md'
                        : 'border-gray-200 bg-white text-gray-700 hover:border-blue-300'
                      }
                    `}
                  >
                    {days} day{days > 1 ? 's' : ''}
                  </button>
                ))
              )}
            </div>
            {extensionType === 'days' && (
              <p className="text-xs text-gray-500 mt-1">
                {selectedDays} day{selectedDays > 1 ? 's' : ''} = {selectedDays * 24} hours
              </p>
            )}
          </div>

          {/* Apply KM Package Toggle - Harmonic with layout */}
          {availablePackages.length > 0 && (
            <div className="border-t border-gray-200 pt-4 mt-4">
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
                    className="w-4 h-4 text-purple-600 rounded border-gray-300 focus:ring-purple-500"
                  />
                  <span className="text-sm font-medium text-gray-700 flex items-center gap-1.5">
                    <Package className="w-4 h-4 text-purple-600" />
                    Apply {extensionType === 'hours' ? 'Hourly' : 'Daily'} Package
                  </span>
                </label>
                {usePackagePricing && (
                  <span className="text-xs bg-purple-100 text-purple-700 px-2 py-1 rounded-full">
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
                              relative px-3 py-2.5 rounded-lg border-2 transition-all text-left
                              ${isSelected
                                ? 'border-purple-500 bg-gradient-to-r from-purple-50 to-indigo-50 ring-2 ring-purple-200 shadow-sm'
                                : 'border-gray-200 bg-white text-gray-700 hover:border-purple-300 hover:bg-purple-50/30'
                              }
                            `}
                          >
                            <div className="flex flex-col gap-1">
                              <div className="flex items-center justify-between">
                                <span className="font-semibold text-gray-900 text-sm truncate pr-1">
                                  {pkg.name}
                                </span>
                                {isSelected && (
                                  <div className="w-4 h-4 bg-purple-500 rounded-full flex items-center justify-center flex-shrink-0">
                                    <Check className="w-2.5 h-2.5 text-white" />
                                  </div>
                                )}
                              </div>
                              
                              <div className="flex items-center gap-2 text-xs">
                                <span className="font-bold text-purple-700">
                                  {ratePerUnit.toFixed(0)} MAD
                                </span>
                                <span className="text-gray-400 text-[10px]">/ {extensionType === 'hours' ? 'hr' : 'day'}</span>
                              </div>
                              
                              <div className="flex flex-wrap gap-1 mt-0.5">
                                {pkg.included_kilometers && (
                                  <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full">
                                    {pkg.included_kilometers}km incl.
                                  </span>
                                )}
                                {pkg.extra_km_rate > 0 && (
                                  <span className="text-[10px] bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded-full">
                                    +{pkg.extra_km_rate}/km
                                  </span>
                                )}
                              </div>
                              
                              <div className="mt-1 pt-1 border-t border-gray-100 text-[10px] text-gray-500">
                                <span className="font-medium text-purple-600">
                                  {(ratePerUnit * (extensionType === 'days' ? selectedDays : selectedHours)).toFixed(0)} MAD
                                </span>
                                <span className="text-gray-400 ml-1">total</span>
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

          {/* Manual Price Override */}
          {canOverrideExtensionPrice && !usePackagePricing && (
            <div className="border-t pt-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={manualPriceOverride}
                  onChange={(e) => setManualPriceOverride(e.target.checked)}
                  className="w-4 h-4 text-blue-600 rounded"
                />
                <span className="text-sm font-medium text-gray-700">Custom Extension Fee</span>
              </label>
            </div>
          )}

          {manualPriceOverride && canOverrideExtensionPrice && (
            <Alert className="bg-yellow-50 border-yellow-200">
              <AlertTriangle className="h-4 w-4 text-yellow-600" />
              <AlertDescription className="text-sm text-yellow-800">
                You are manually overriding the calculated price. The custom amount will be used instead of the automatic calculation.
              </AlertDescription>
            </Alert>
          )}

          {/* Price Display */}
          {isCalculating ? (
            <div className="flex items-center justify-center py-8">
              <div className="w-8 h-8 border-4 border-purple-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : priceCalculation && (
            <div className="bg-gray-50 rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Extension Duration:</span>
                <span className="font-semibold text-gray-900">
                  {extensionType === 'days' 
                    ? `${selectedDays} day${selectedDays > 1 ? 's' : ''} (${selectedDays * 24}h)`
                    : `${selectedHours} hour${selectedHours > 1 ? 's' : ''}`
                  }
                </span>
              </div>

              {/* Extension Fee - Always visible outside collapse */}
              <div className="bg-gradient-to-r from-purple-600 to-indigo-600 rounded-lg p-3 text-white mb-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Extension Fee</span>
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
                <div className="text-[10px] text-purple-100 mt-1">
                  {usePackagePricing && selectedPackage ? (
                    `${parseFloat(selectedPackage.fixed_amount).toFixed(0)} MAD × ${extensionType === 'days' ? selectedDays : selectedHours} ${extensionType === 'days' ? 'days' : 'hrs'}`
                  ) : (
                    priceCalculation && `${getEffectiveRate().toFixed(0)} MAD × ${extensionType === 'days' ? selectedDays : selectedHours} ${extensionType === 'days' ? 'days' : 'hrs'}`
                  )}
                </div>
              </div>

              {/* Package Details - Collapsible (only when package selected) */}
              {usePackagePricing && selectedPackage && (
                <div className="border border-purple-200 rounded-lg overflow-hidden">
                  {/* Collapsible Header */}
                  <button
                    type="button"
                    onClick={() => setShowCalculator(!showCalculator)}
                    className="w-full px-3 py-2 bg-purple-50 flex items-center justify-between hover:bg-purple-100 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <Calculator className="w-4 h-4 text-purple-600" />
                      <span className="text-sm font-medium text-purple-900">Package Details</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-purple-600">
                        {showCalculator ? 'Hide' : 'Show'}
                      </span>
                      {showCalculator ? (
                        <ChevronUp className="w-4 h-4 text-purple-600" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-purple-600" />
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
                                <div className="bg-green-50 rounded-lg p-2 text-center">
                                  <div className="text-xs text-gray-500">Included</div>
                                  <div className="font-bold text-green-600">{totalIncludedKm}km</div>
                                  <div className="text-[10px] text-gray-400">
                                    {includedKmsPerUnit}km × {duration}
                                  </div>
                                </div>
                              )}
                              {selectedPackage.extra_km_rate > 0 && (
                                <div className="bg-orange-50 rounded-lg p-2 text-center">
                                  <div className="text-xs text-gray-500">Extra rate</div>
                                  <div className="font-bold text-orange-600">{selectedPackage.extra_km_rate} MAD/km</div>
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
                    <p className="text-xs font-medium text-gray-600">Price Breakdown:</p>
                    
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-700">
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
                      <div className="flex justify-between text-xs text-gray-500 pt-1 border-t border-gray-200 mt-1">
                        <span>Base rate would be:</span>
                        <span>{formatCurrency(baseHourlyRate)} MAD/hour × {selectedHours}h = {formatCurrency(baseHourlyRate * selectedHours)} MAD</span>
                      </div>
                    )}

                    {extensionType === 'days' && priceCalculation.tier_applied && baseDailyRate && (
                      <div className="flex justify-between text-xs text-gray-500 pt-1 border-t border-gray-200 mt-1">
                        <span>Base rate would be:</span>
                        <span>{formatCurrency(baseDailyRate)} MAD/day × {selectedDays} day{selectedDays > 1 ? 's' : ''} = {formatCurrency(baseDailyRate * selectedDays)} MAD</span>
                      </div>
                    )}
                  </div>

                  {/* Savings */}
                  {calculateSavings() > 0 && (
                    <div className="flex items-center justify-between text-sm text-green-600 bg-green-50 p-2 rounded-md">
                      <span className="font-medium">You Save:</span>
                      <span className="font-semibold">{formatCurrency(calculateSavings())} MAD</span>
                    </div>
                  )}
                </>
              )}



              {/* New End Date */}
              {priceCalculation?.newEndDate && (
                <div className="text-xs text-gray-500 pt-2 border-t border-gray-200">
                  <p>New end date: {new Date(priceCalculation.newEndDate).toLocaleString()}</p>
                </div>
              )}
            </div>
          )}

          {error && (
            <Alert className="bg-red-50 border-red-200">
              <AlertTriangle className="h-4 w-4 text-red-600" />
              <AlertDescription className="text-sm text-red-800">{error}</AlertDescription>
            </Alert>
          )}

          {/* Manual price input for override */}
          {manualPriceOverride && canOverrideExtensionPrice && !usePackagePricing && (
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">
                Custom Extension Fee (MAD)
              </label>
              <input
                type="text"
                value={customPrice}
                onChange={handleCustomPriceChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Enter custom amount"
              />
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-2 pt-2">
            <Button
              variant="outline"
              onClick={onClose}
              disabled={isSubmitting}
              className="w-full sm:w-auto order-2 sm:order-1"
            >
              Cancel
            </Button>

            {canApproveExtensionPrice ? (
              <Button
                onClick={() => handleSubmit(true)}
                disabled={isSubmitting || isCalculating || !priceCalculation}
                className="w-full sm:flex-1 bg-green-600 hover:bg-green-700 text-white order-1 sm:order-2"
              >
                {isSubmitting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                    Processing...
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-4 h-4 mr-2" />
                    Approve & Extend Immediately
                  </>
                )}
              </Button>
            ) : (
              <Button
                onClick={() => handleSubmit(false)}
                disabled={isSubmitting || isCalculating || !priceCalculation}
                className="w-full sm:flex-1 bg-purple-600 hover:bg-purple-700 text-white order-1 sm:order-2"
              >
                {isSubmitting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                    Submitting...
                  </>
                ) : (
                  <>
                    <Clock className="w-4 h-4 mr-2" />
                    Submit Request
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
