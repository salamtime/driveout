import React, { useState, useEffect } from 'react';
import { TrendingUp, Info, Loader, AlertCircle } from 'lucide-react';
import { getPricingOptions, formatPriceSource } from '../../utils/pricingCalculations';

/**
 * TieredPricingSelector Component
 * Displays a dropdown with pricing options based on tiered pricing configuration
 */
const TieredPricingSelector = ({ 
  vehicleModelId, 
  baseHourlyRate, 
  selectedHours,
  onHoursChange,
  onPriceChange,
  disabled = false,
  maxHours = 24
}) => {
  const [pricingOptions, setPricingOptions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const loadPricingOptions = async () => {
      if (!vehicleModelId || !baseHourlyRate || baseHourlyRate <= 0) {
        setPricingOptions([]);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const options = await getPricingOptions(vehicleModelId, baseHourlyRate, maxHours);
        setPricingOptions(options);
      } catch (err) {
        console.error('Error loading pricing options:', err);
        setError('Failed to load pricing options');
        setPricingOptions([]);
      } finally {
        setLoading(false);
      }
    };

    loadPricingOptions();
  }, [vehicleModelId, baseHourlyRate, maxHours]);

  const handleSelectionChange = (e) => {
    const hours = parseInt(e.target.value);
    if (isNaN(hours) || hours <= 0) return;

    const selectedOption = pricingOptions.find(opt => opt.hours === hours);
    if (selectedOption) {
      onHoursChange(hours);
      if (onPriceChange) {
        onPriceChange(selectedOption.price);
      }
    }
  };

  const getBestSavingsOption = () => {
    if (pricingOptions.length === 0) return null;
    return pricingOptions.reduce((best, current) => 
      current.savings > (best?.savings || 0) ? current : best
    , null);
  };

  const bestOption = getBestSavingsOption();

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-gray-500 text-sm">
        <Loader className="w-4 h-4 animate-spin" />
        <span>Loading pricing options...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 text-red-500 text-sm">
        <AlertCircle className="w-4 h-4" />
        <span>{error}</span>
      </div>
    );
  }

  if (pricingOptions.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="block text-sm font-medium text-gray-700">
          Select Rental Duration
        </label>
        {bestOption && bestOption.savings > 0 && (
          <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 text-green-800 rounded text-xs font-medium">
            <TrendingUp className="w-3 h-3" />
            Best: {bestOption.hours}h saves {bestOption.savings.toFixed(0)} MAD
          </span>
        )}
      </div>

      <select
        value={selectedHours || ''}
        onChange={handleSelectionChange}
        disabled={disabled}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <option value="">Select duration...</option>
        {pricingOptions.map((option) => (
          <option key={option.hours} value={option.hours}>
            {option.label}
          </option>
        ))}
      </select>

      {selectedHours && pricingOptions.find(opt => opt.hours === selectedHours)?.savings > 0 && (
        <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <Info className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
          <div className="text-sm text-blue-800">
            <p className="font-medium">💡 Great choice!</p>
            <p className="mt-1">
              You're saving {pricingOptions.find(opt => opt.hours === selectedHours).savings.toFixed(0)} MAD 
              compared to the standard hourly rate. Longer rentals save more!
            </p>
          </div>
        </div>
      )}

      <div className="text-xs text-gray-500">
        <p>
          ⚡ <strong>Auto-calculated pricing</strong> based on configured tiers. 
          Prices automatically adjust for longer rental periods.
        </p>
      </div>
    </div>
  );
};

export default TieredPricingSelector;