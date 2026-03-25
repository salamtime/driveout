import React, { useState, useEffect } from 'react';
import { DollarSign, Settings, RefreshCw, Database, HardDrive, Package2, Wifi, WifiOff } from 'lucide-react';
import { usePricing } from '../../contexts/PricingContext';
import { calculateBookingPrice, isWeekend, isHoliday } from '../../utils/pricingUtils';
import DataSourceStatus from '../common/DataSourceStatus';

/**
 * Testing tool for pricing calculation with data source visibility
 */
const PricingDebugTool = () => {
  const { 
    settings, 
    loading, 
    error,
    source,
    online,
    reloadSettings,
    pricingEnabled,
    togglePricingEnabled 
  } = usePricing();
  
  const [testParams, setTestParams] = useState({
    rentalType: 'hourly',
    duration: 1,
    passengers: 1,
    isVip: false,
    isWeekend: false,
    isHoliday: false,
    numQuads: 1,
  });
  
  const [priceDetails, setPriceDetails] = useState(null);
  
  useEffect(() => {
    if (settings && pricingEnabled) {
      const params = {
        ...testParams,
        equipmentItems: []
      };
      
      const details = calculateBookingPrice(params, settings);
      
      // Multiply by number of quads
      const totalDetails = {
        ...details,
        basePrice: details.basePrice * testParams.numQuads,
        passengerFees: details.passengerFees * testParams.numQuads,
        weekendSurcharge: details.weekendSurcharge * testParams.numQuads,
        holidaySurcharge: details.holidaySurcharge * testParams.numQuads,
        subtotal: details.subtotal * testParams.numQuads,
        deposit: details.deposit * testParams.numQuads,
        total: details.total * testParams.numQuads
      };
      
      setPriceDetails(totalDetails);
    }
  }, [settings, testParams, pricingEnabled]);
  
  const handleInputChange = (field, value) => {
    setTestParams(prev => ({
      ...prev,
      [field]: value
    }));
  };
  
  const handleReloadSettings = async () => {
    await reloadSettings();
  };
  
  if (loading) {
    return (
      <div className="p-4 border rounded-lg bg-gray-50">
        <div className="flex items-center justify-center py-8">
          <RefreshCw className="h-6 w-6 animate-spin text-gray-400" />
          <span className="ml-2 text-gray-600">Loading pricing settings...</span>
        </div>
      </div>
    );
  }
  
  return (
    <div className="p-4 border rounded-lg bg-white">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center">
          <DollarSign className="h-6 w-6 text-blue-600 mr-2" />
          <h3 className="text-lg font-medium text-gray-900">Pricing Debug Tool</h3>
        </div>
        
        <div className="flex items-center gap-4">
          <DataSourceStatus />
          
          <div className="flex items-center">
            {online ? (
              <Wifi className="h-4 w-4 text-green-600 mr-1" />
            ) : (
              <WifiOff className="h-4 w-4 text-red-600 mr-1" />
            )}
            <span className={`text-xs font-medium ${online ? 'text-green-600' : 'text-red-600'}`}>
              {online ? 'Online' : 'Offline'}
            </span>
          </div>
          
          <button
            onClick={handleReloadSettings}
            className="flex items-center text-xs px-2 py-1 text-blue-700 bg-blue-50 rounded hover:bg-blue-100"
          >
            <RefreshCw className="h-3 w-3 mr-1" />
            Reload
          </button>
        </div>
      </div>
      
      {/* Error message */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
          <div className="flex items-center gap-2">
            <span className="text-red-800">Error: {error.message}</span>
          </div>
        </div>
      )}
      
      {/* Settings source information */}
      <div className="mb-6 p-4 bg-gray-50 rounded-lg">
        <h4 className="font-medium text-gray-700 mb-2">Settings Source Information</h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="flex items-center">
            <span className="mr-2 text-sm text-gray-500">Source:</span>
            {source === 'database' && (
              <span className="text-green-600 flex items-center">
                <Database className="h-4 w-4 mr-1" /> Database
              </span>
            )}
            {source === 'cache' && (
              <span className="text-amber-600 flex items-center">
                <HardDrive className="h-4 w-4 mr-1" /> Local Cache
              </span>
            )}
            {source === 'default' && (
              <span className="text-blue-600 flex items-center">
                <Package2 className="h-4 w-4 mr-1" /> Default Values
              </span>
            )}
          </div>
          
          <div className="flex items-center">
            <span className="mr-2 text-sm text-gray-500">Connection:</span>
            {online ? (
              <span className="text-green-600">Online</span>
            ) : (
              <span className="text-red-600">Offline</span>
            )}
          </div>
          
          <div className="flex items-center">
            <span className="mr-2 text-sm text-gray-500">Pricing Enabled:</span>
            <div className="relative inline-block w-10 align-middle select-none">
              <input
                type="checkbox"
                name="toggle"
                id="toggle-pricing"
                className="sr-only peer"
                checked={pricingEnabled}
                onChange={() => togglePricingEnabled()}
              />
              <label
                htmlFor="toggle-pricing"
                className="block h-6 overflow-hidden bg-gray-200 rounded-full cursor-pointer peer-checked:bg-blue-600"
              >
                <span className="block h-6 w-6 bg-white rounded-full shadow transform peer-checked:translate-x-4 transition-transform duration-200 ease-in-out"></span>
              </label>
            </div>
          </div>
        </div>
      </div>
      
      {/* Test Parameters */}
      <div className="mb-6">
        <h4 className="font-medium text-gray-700 mb-4">Test Parameters</h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Duration (hours)
            </label>
            <select
              value={testParams.duration}
              onChange={(e) => handleInputChange('duration', parseInt(e.target.value))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
            >
              <option value={1}>1 hour</option>
              <option value={2}>2 hours</option>
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Passengers per Quad
            </label>
            <select
              value={testParams.passengers}
              onChange={(e) => handleInputChange('passengers', parseInt(e.target.value))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
            >
              <option value={1}>1 passenger</option>
              <option value={2}>2 passengers</option>
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Number of Quads
            </label>
            <input
              type="number"
              min="1"
              max="10"
              value={testParams.numQuads}
              onChange={(e) => handleInputChange('numQuads', parseInt(e.target.value) || 1)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Tour Mode
            </label>
            <div className="flex gap-2">
              <button
                onClick={() => handleInputChange('isVip', false)}
                className={`flex-1 px-4 py-2 rounded-md border ${
                  !testParams.isVip 
                    ? 'border-blue-500 bg-blue-50 text-blue-700' 
                    : 'border-gray-300 text-gray-700'
                }`}
              >
                Standard
              </button>
              <button
                onClick={() => handleInputChange('isVip', true)}
                className={`flex-1 px-4 py-2 rounded-md border ${
                  testParams.isVip 
                    ? 'border-purple-500 bg-purple-50 text-purple-700' 
                    : 'border-gray-300 text-gray-700'
                }`}
              >
                VIP
              </button>
            </div>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Weekend Booking
            </label>
            <div className="flex gap-2">
              <button
                onClick={() => handleInputChange('isWeekend', false)}
                className={`flex-1 px-4 py-2 rounded-md border ${
                  !testParams.isWeekend 
                    ? 'border-blue-500 bg-blue-50 text-blue-700' 
                    : 'border-gray-300 text-gray-700'
                }`}
              >
                Weekday
              </button>
              <button
                onClick={() => handleInputChange('isWeekend', true)}
                className={`flex-1 px-4 py-2 rounded-md border ${
                  testParams.isWeekend 
                    ? 'border-amber-500 bg-amber-50 text-amber-700' 
                    : 'border-gray-300 text-gray-700'
                }`}
              >
                Weekend
              </button>
            </div>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Holiday Booking
            </label>
            <div className="flex gap-2">
              <button
                onClick={() => handleInputChange('isHoliday', false)}
                className={`flex-1 px-4 py-2 rounded-md border ${
                  !testParams.isHoliday 
                    ? 'border-blue-500 bg-blue-50 text-blue-700' 
                    : 'border-gray-300 text-gray-700'
                }`}
              >
                Regular Day
              </button>
              <button
                onClick={() => handleInputChange('isHoliday', true)}
                className={`flex-1 px-4 py-2 rounded-md border ${
                  testParams.isHoliday 
                    ? 'border-red-500 bg-red-50 text-red-700' 
                    : 'border-gray-300 text-gray-700'
                }`}
              >
                Holiday
              </button>
            </div>
          </div>
        </div>
      </div>
      
      {/* Pricing Settings Display */}
      <div className="mb-6">
        <h4 className="font-medium text-gray-700 mb-3">Current Pricing Settings</h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm p-4 bg-gray-50 rounded-lg">
          <div>
            <span className="block text-gray-500">Standard 1h Rate:</span>
            <span className="font-medium">${settings.defaultRate1h}</span>
          </div>
          <div>
            <span className="block text-gray-500">Standard 2h Rate:</span>
            <span className="font-medium">${settings.defaultRate2h}</span>
          </div>
          <div>
            <span className="block text-gray-500">VIP 1h Rate:</span>
            <span className="font-medium">${settings.vipRate1h}</span>
          </div>
          <div>
            <span className="block text-gray-500">VIP 2h Rate:</span>
            <span className="font-medium">${settings.vipRate2h}</span>
          </div>
          <div>
            <span className="block text-gray-500">Extra Passenger Fee:</span>
            <span className="font-medium">${settings.extraPassengerFee}</span>
          </div>
          <div>
            <span className="block text-gray-500">Deposit Percentage:</span>
            <span className="font-medium">{settings.depositPercentage}%</span>
          </div>
        </div>
      </div>
      
      {/* Calculated Price */}
      {priceDetails && pricingEnabled && (
        <div className="border rounded-lg p-4 bg-blue-50">
          <h4 className="font-medium text-blue-800 mb-3">Price Calculation Results</h4>
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-gray-600">Base Price:</span>
              <span className="font-medium">${(priceDetails.basePrice / testParams.numQuads).toFixed(2)} × {testParams.numQuads} = ${priceDetails.basePrice.toFixed(2)}</span>
            </div>
            
            {priceDetails.passengerFees > 0 && (
              <div className="flex justify-between items-center">
                <span className="text-gray-600">Extra Passenger Fee:</span>
                <span className="font-medium">${(priceDetails.passengerFees / testParams.numQuads).toFixed(2)} × {testParams.numQuads} = ${priceDetails.passengerFees.toFixed(2)}</span>
              </div>
            )}
            
            {priceDetails.weekendSurcharge > 0 && (
              <div className="flex justify-between items-center">
                <span className="text-gray-600">Weekend Surcharge:</span>
                <span className="font-medium">${priceDetails.weekendSurcharge.toFixed(2)}</span>
              </div>
            )}
            
            {priceDetails.holidaySurcharge > 0 && (
              <div className="flex justify-between items-center">
                <span className="text-gray-600">Holiday Surcharge:</span>
                <span className="font-medium">${priceDetails.holidaySurcharge.toFixed(2)}</span>
              </div>
            )}
            
            <div className="flex justify-between items-center border-t pt-2">
              <span className="text-gray-700 font-medium">Total:</span>
              <span className="font-bold text-blue-700">${priceDetails.total.toFixed(2)}</span>
            </div>
            
            <div className="flex justify-between items-center text-sm">
              <span className="text-gray-600">Deposit Required:</span>
              <span className="font-medium">${priceDetails.deposit.toFixed(2)}</span>
            </div>
          </div>
        </div>
      )}
      
      {!pricingEnabled && (
        <div className="border rounded-lg p-4 bg-yellow-50 text-center">
          <p className="text-amber-800">
            Dynamic pricing is currently disabled. Toggle the switch above to enable pricing calculations.
          </p>
        </div>
      )}
    </div>
  );
};

export default PricingDebugTool;