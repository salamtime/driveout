import React, { useState, useEffect } from 'react';
import { Calculator, Calendar, Car, Truck, Percent, DollarSign } from 'lucide-react';
import pricingService from '../../services/PricingService';
import toast from 'react-hot-toast';

const DynamicPricingCalculator = () => {
  const [vehicles, setVehicles] = useState([]);
  const [models, setModels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [calculating, setCalculating] = useState(false);
  
  const [formData, setFormData] = useState({
    start_date: new Date().toISOString().split('T')[0],
    end_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    model_id: '',
    vehicle_id: '',
    discount_code: '',
    pickup: false,
    dropoff: false
  });
  
  const [priceBreakdown, setPriceBreakdown] = useState(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [vehiclesResult, modelsResult] = await Promise.all([
        pricingService.getVehicles(),
        pricingService.getVehicleModels()
      ]);

      if (vehiclesResult.success) {
        setVehicles(vehiclesResult.data);
      }
      
      if (modelsResult.success) {
        setModels(modelsResult.data);
      }
    } catch (error) {
      console.error('Error loading data:', error);
      toast.error('Failed to load vehicle data');
    } finally {
      setLoading(false);
    }
  };

  const calculatePrice = async () => {
    if (!formData.start_date || !formData.end_date) {
      toast.error('Please select rental dates');
      return;
    }

    if (!formData.model_id && !formData.vehicle_id) {
      toast.error('Please select a vehicle or model');
      return;
    }

    setCalculating(true);
    try {
      const params = {
        date_range: {
          start: formData.start_date,
          end: formData.end_date
        },
        model_id: formData.model_id || null,
        vehicle_id: formData.vehicle_id || null,
        discount_code: formData.discount_code || null,
        transport: {
          pickup: formData.pickup,
          dropoff: formData.dropoff
        }
      };

      const result = await pricingService.pricePreview(params);
      
      if (result.success) {
        setPriceBreakdown(result.data);
      } else {
        toast.error(result.error || 'Failed to calculate price');
        setPriceBreakdown(null);
      }
    } catch (error) {
      console.error('Error calculating price:', error);
      toast.error('Failed to calculate price');
      setPriceBreakdown(null);
    } finally {
      setCalculating(false);
    }
  };

  const handleInputChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
    
    // Clear previous calculation when inputs change
    setPriceBreakdown(null);
  };

  const getDurationDays = () => {
    if (!formData.start_date || !formData.end_date) return 0;
    const start = new Date(formData.start_date);
    const end = new Date(formData.end_date);
    return Math.ceil((end - start) / (1000 * 60 * 60 * 24));
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="animate-pulse">
          <div className="h-6 bg-gray-200 rounded w-48 mb-4"></div>
          <div className="space-y-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-16 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <Calculator className="h-5 w-5 text-purple-600" />
            Dynamic Pricing Calculator
          </h3>
          <p className="text-sm text-gray-600 mt-1">
            Pricing is layered: Base → Seasonal → Tiers → Discounts → Transport
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Input Form */}
        <div className="space-y-4">
          <h4 className="font-medium text-gray-900">Rental Details</h4>
          
          {/* Date Range */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                <Calendar className="inline h-4 w-4 mr-1" />
                Start Date
              </label>
              <input
                type="date"
                value={formData.start_date}
                onChange={(e) => handleInputChange('start_date', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                <Calendar className="inline h-4 w-4 mr-1" />
                End Date
              </label>
              <input
                type="date"
                value={formData.end_date}
                onChange={(e) => handleInputChange('end_date', e.target.value)}
                min={formData.start_date}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>
          </div>

          {/* Duration Display */}
          <div className="bg-gray-50 rounded-lg p-3">
            <p className="text-sm text-gray-600">
              Duration: <span className="font-medium text-gray-900">{getDurationDays()} days</span>
            </p>
          </div>

          {/* Vehicle Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              <Car className="inline h-4 w-4 mr-1" />
              Vehicle Model
            </label>
            <select
              value={formData.model_id}
              onChange={(e) => handleInputChange('model_id', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
            >
              <option value="">Select Model</option>
              {models.map(model => (
                <option key={model.id} value={model.id}>
                  {model.name}
                </option>
              ))}
            </select>
          </div>

          {/* Specific Vehicle */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Specific Vehicle (Optional)
            </label>
            <select
              value={formData.vehicle_id}
              onChange={(e) => handleInputChange('vehicle_id', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
            >
              <option value="">Any vehicle of selected model</option>
              {vehicles
                .filter(v => !formData.model_id || `${v.brand}-${v.model}` === formData.model_id)
                .map(vehicle => (
                  <option key={vehicle.id} value={vehicle.id}>
                    {vehicle.name} ({vehicle.brand} {vehicle.model})
                  </option>
                ))}
            </select>
          </div>

          {/* Discount Code */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              <Percent className="inline h-4 w-4 mr-1" />
              Discount Code (Optional)
            </label>
            <input
              type="text"
              value={formData.discount_code}
              onChange={(e) => handleInputChange('discount_code', e.target.value.toUpperCase())}
              placeholder="Enter discount code"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>

          {/* Transport Options */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <Truck className="inline h-4 w-4 mr-1" />
              Transport Services
            </label>
            <div className="space-y-2">
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={formData.pickup}
                  onChange={(e) => handleInputChange('pickup', e.target.checked)}
                  className="rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                />
                <span className="ml-2 text-sm text-gray-700">Vehicle Pickup/Delivery</span>
              </label>
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={formData.dropoff}
                  onChange={(e) => handleInputChange('dropoff', e.target.checked)}
                  className="rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                />
                <span className="ml-2 text-sm text-gray-700">Vehicle Return/Collection</span>
              </label>
            </div>
          </div>

          {/* Calculate Button */}
          <button
            onClick={calculatePrice}
            disabled={calculating}
            className="w-full px-4 py-3 bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
          >
            {calculating ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                Calculating...
              </>
            ) : (
              <>
                <Calculator className="h-4 w-4" />
                Calculate Price
              </>
            )}
          </button>
        </div>

        {/* Price Breakdown */}
        <div className="space-y-4">
          <h4 className="font-medium text-gray-900">Price Breakdown</h4>
          
          {!priceBreakdown ? (
            <div className="bg-gray-50 rounded-lg p-8 text-center">
              <Calculator className="h-12 w-12 mx-auto mb-4 text-gray-300" />
              <p className="text-gray-500">Enter rental details and click calculate to see pricing</p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Base Price */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="flex justify-between items-center">
                  <span className="text-blue-700">Base Price (per day)</span>
                  <span className="font-medium text-blue-900">
                    {priceBreakdown.basePrice.toFixed(2)} {priceBreakdown.currency}
                  </span>
                </div>
                <div className="flex justify-between items-center mt-1">
                  <span className="text-sm text-blue-600">× {priceBreakdown.durationDays} days</span>
                  <span className="text-sm text-blue-600">
                    {(priceBreakdown.basePrice * priceBreakdown.durationDays).toFixed(2)} {priceBreakdown.currency}
                  </span>
                </div>
              </div>

              {/* Seasonal Multiplier */}
              {priceBreakdown.seasonalMultiplier !== 1 && (
                <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
                  <div className="flex justify-between items-center">
                    <span className="text-orange-700">Seasonal Adjustment</span>
                    <span className="font-medium text-orange-900">
                      ×{priceBreakdown.seasonalMultiplier}
                    </span>
                  </div>
                </div>
              )}

              {/* Daily Tier Multiplier */}
              {priceBreakdown.dailyMultiplier !== 1 && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <div className="flex justify-between items-center">
                    <span className="text-green-700">Daily Tier Discount</span>
                    <span className="font-medium text-green-900">
                      ×{priceBreakdown.dailyMultiplier}
                    </span>
                  </div>
                </div>
              )}

              {/* Subtotal */}
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                <div className="flex justify-between items-center">
                  <span className="text-gray-700">Rental Subtotal</span>
                  <span className="font-medium text-gray-900">
                    {priceBreakdown.subtotal.toFixed(2)} {priceBreakdown.currency}
                  </span>
                </div>
              </div>

              {/* Discount */}
              {priceBreakdown.discountAmount > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                  <div className="flex justify-between items-center">
                    <span className="text-red-700">Discount Applied</span>
                    <span className="font-medium text-red-900">
                      -{priceBreakdown.discountAmount.toFixed(2)} {priceBreakdown.currency}
                    </span>
                  </div>
                </div>
              )}

              {/* Rental Total */}
              <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4">
                <div className="flex justify-between items-center">
                  <span className="text-indigo-700 font-medium">Rental Total</span>
                  <span className="font-semibold text-indigo-900">
                    {priceBreakdown.rentalTotal.toFixed(2)} {priceBreakdown.currency}
                  </span>
                </div>
              </div>

              {/* Transport Fees */}
              {priceBreakdown.transportTotal > 0 && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                  <div className="flex justify-between items-center">
                    <span className="text-yellow-700">Transport Services</span>
                    <span className="font-medium text-yellow-900">
                      +{priceBreakdown.transportTotal.toFixed(2)} {priceBreakdown.currency}
                    </span>
                  </div>
                </div>
              )}

              {/* Final Total */}
              <div className="bg-purple-100 border border-purple-300 rounded-lg p-4">
                <div className="flex justify-between items-center">
                  <span className="text-purple-800 font-semibold text-lg">Final Total</span>
                  <span className="font-bold text-purple-900 text-xl">
                    {priceBreakdown.finalTotal.toFixed(2)} {priceBreakdown.currency}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default DynamicPricingCalculator;