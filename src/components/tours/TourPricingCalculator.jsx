import React, { useState, useEffect } from 'react';
import { Clock, DollarSign, Users, Database, HardDrive, Package2 } from 'lucide-react';
import { usePricing } from '../../contexts/PricingContext';
import { calculateBookingPrice, isWeekend, isHoliday, formatPrice } from '../../utils/pricingUtils';
import { getDefaultSettings } from '../../services/settingsService';
import { getEmergencyPrices } from '../common/EmergencyPriceProvider';

/**
 * Tour Pricing Calculator
 * Calculates and displays dynamic pricing for tours based on settings
 */
const TourPricingCalculator = ({
  duration = 1, // in hours
  participants = 1,
  isVip = false,
  numQuads = 1,
  selectedDate = new Date(),
  className = '',
  onChange = () => {}
}) => {
  const { settings, loading, pricingEnabled, source, online } = usePricing();
  
  // Initialize with non-zero values for immediate display
  const [priceDetails, setPriceDetails] = useState({
    basePrice: 50,
    passengerFees: 0,
    weekendSurcharge: 0,
    holidaySurcharge: 0,
    subtotal: 50,
    deposit: 12.5,
    total: 50
  });
  
  // EMERGENCY FIX: Always use settings with fallbacks at multiple levels
  // 1. Use context settings if available
  // 2. Use default settings as first fallback
  // 3. Use emergency prices as second fallback
  // 4. Use hardcoded values as final failsafe
  const fallbackSettings = getDefaultSettings();
  const emergencyPrices = getEmergencyPrices();
  const hardcodedSettings = {
    defaultRate1h: 50,
    defaultRate2h: 90,
    vipRate1h: 75,
    vipRate2h: 140,
    extraPassengerFee: 15,
    depositPercentage: 25
  };
  
  // Quadruple-layer fallback to guarantee we always have valid settings
  let pricingSettings = settings || fallbackSettings || emergencyPrices || hardcodedSettings;
  
  // Final safety check - ensure no value is zero or negative
  pricingSettings = {
    ...pricingSettings,
    defaultRate1h: Math.max(1, pricingSettings.defaultRate1h || emergencyPrices.defaultRate1h),
    defaultRate2h: Math.max(1, pricingSettings.defaultRate2h || emergencyPrices.defaultRate2h),
    vipRate1h: Math.max(1, pricingSettings.vipRate1h || emergencyPrices.vipRate1h),
    vipRate2h: Math.max(1, pricingSettings.vipRate2h || emergencyPrices.vipRate2h),
    extraPassengerFee: Math.max(1, pricingSettings.extraPassengerFee || emergencyPrices.extraPassengerFee),
    depositPercentage: Math.max(1, pricingSettings.depositPercentage || emergencyPrices.depositPercentage)
  };

  // Calculate pricing whenever inputs change
  useEffect(() => {
    if (!pricingEnabled) return;

    const calculatedIsWeekend = isWeekend(selectedDate);
    const calculatedIsHoliday = isHoliday(selectedDate);
    
    // Fixed: 1 passenger per quad, no extra passengers
    const validParticipants = parseInt(participants) || 1;
    const validNumQuads = parseInt(numQuads) || 1;
    const extraPassengersPerQuad = 0; // No extra passengers since 1 rider per quad
    
    const pricingParams = {
      rentalType: 'hourly',
      duration: parseInt(duration) || 1,
      passengers: extraPassengersPerQuad + 1,
      isVip,
      isWeekend: calculatedIsWeekend,
      isHoliday: calculatedIsHoliday,
      equipmentItems: []
    };

    // Always use settings or fallback to defaults
    const details = calculateBookingPrice(pricingParams, pricingSettings);
    
    // Ensure valid number of quads
    const safeNumQuads = parseInt(numQuads) || 1;
    
    // Ensure all price values are valid numbers before multiplying
    const safeDetails = {
      basePrice: parseFloat(details.basePrice) || 0,
      passengerFees: parseFloat(details.passengerFees) || 0,
      weekendSurcharge: parseFloat(details.weekendSurcharge) || 0,
      holidaySurcharge: parseFloat(details.holidaySurcharge) || 0,
      subtotal: parseFloat(details.subtotal) || 0,
      deposit: parseFloat(details.deposit) || 0,
      total: parseFloat(details.total) || 0
    };
    
    // Multiply by number of quads
    const totalDetails = {
      ...details,
      basePrice: safeDetails.basePrice * safeNumQuads,
      passengerFees: safeDetails.passengerFees * safeNumQuads,
      weekendSurcharge: safeDetails.weekendSurcharge * safeNumQuads,
      holidaySurcharge: safeDetails.holidaySurcharge * safeNumQuads,
      subtotal: safeDetails.subtotal * safeNumQuads,
      deposit: safeDetails.deposit * safeNumQuads,
      total: safeDetails.total * safeNumQuads
    };
    
    setPriceDetails(totalDetails);
    onChange(totalDetails);
  }, [duration, participants, isVip, numQuads, selectedDate, pricingSettings, pricingEnabled, onChange]);

  // If pricing is disabled, return null
  if (!pricingEnabled) return null;

  return (
    <div className={`pricing-summary ${className}`}>
      <h3 className="text-sm font-medium text-gray-700 mb-2">Payment Information</h3>
      
      {loading ? (
        <div className="p-2 bg-gray-50 rounded text-gray-500 text-sm">
          Loading pricing settings...
        </div>
      ) : (
        <div className="space-y-2 text-sm">
          <div className="flex justify-between items-center">
            <div className="flex items-center">
              <DollarSign size={14} className="mr-1 text-gray-500" />
              <span>Base Price per Quad:</span>
            </div>
            <span className="font-medium">${Math.max(1, parseFloat((priceDetails.basePrice || 0) / (parseInt(numQuads) || 1))).toFixed(2)}</span>
          </div>
          
          {(priceDetails.passengerFees || 0) > 0 && (
            <div className="flex justify-between items-center">
              <div className="flex items-center">
                <Users size={14} className="mr-1 text-gray-500" />
                <span>Extra Passenger Fee:</span>
              </div>
              <span className="font-medium">${parseFloat((priceDetails.passengerFees || 0) / (parseInt(numQuads) || 1)).toFixed(2)} per quad</span>
            </div>
          )}
          
          {((priceDetails.weekendSurcharge || 0) > 0 || (priceDetails.holidaySurcharge || 0) > 0) && (
            <div className="flex justify-between items-center">
              <div className="flex items-center">
                <Clock size={14} className="mr-1 text-gray-500" />
                <span>{(priceDetails.holidaySurcharge || 0) > 0 ? 'Holiday' : 'Weekend'} Surcharge:</span>
              </div>
              <span className="font-medium">
                ${parseFloat(((priceDetails.weekendSurcharge || 0) + (priceDetails.holidaySurcharge || 0)) / (parseInt(numQuads) || 1)).toFixed(2)} per quad
              </span>
            </div>
          )}
          
          <div className="flex justify-between items-center pt-1 border-t">
            <div className="flex items-center">
              <span>Number of Quads:</span>
            </div>
            <span className="font-medium">× {parseInt(numQuads) || 1}</span>
          </div>
          
          <div className="flex justify-between items-center pt-1 border-t">
            <div className="flex items-center font-medium">
              <span>Total:</span>
            </div>
            <span className="font-bold text-blue-600">${Math.max(1, parseFloat(priceDetails.total || 0)).toFixed(2)}</span>
          </div>
          
          <div className="flex justify-between items-center text-xs text-gray-500">
            <div className="flex items-center">
              <span>Deposit ({parseInt(pricingSettings.depositPercentage) || 25}%):</span>
            </div>
            <span>${Math.max(0.25, parseFloat(priceDetails.deposit || 0)).toFixed(2)}</span>
          </div>
          
          {/* Data source indicator */}
          <div className="mt-2 pt-2 border-t border-gray-100 flex items-center justify-end">
            <div className="text-xs text-gray-400 flex items-center">
              {source === 'database' && <Database size={10} className="mr-1 text-green-500" />}
              {source === 'cache' && <HardDrive size={10} className="mr-1 text-amber-500" />}
              {source === 'default' && <Package2 size={10} className="mr-1 text-blue-500" />}
              {source || 'default'}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TourPricingCalculator;