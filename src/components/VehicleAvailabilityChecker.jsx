import React, { useState, useEffect } from 'react';
import { Calendar, AlertCircle, CheckCircle, Clock } from 'lucide-react';
import { useDateRangeAvailability } from '../hooks/useVehicleAvailability';
import VehicleStatusBadge from './VehicleStatusBadge';

/**
 * VehicleAvailabilityChecker - Component for checking vehicle availability in date ranges
 * @param {Object} props
 * @param {Function} props.onVehicleSelect - Callback when vehicle is selected
 * @param {string} props.vehicleType - Optional vehicle type filter
 * @param {string} props.startDate - Start date for availability check
 * @param {string} props.endDate - End date for availability check
 */
const VehicleAvailabilityChecker = ({ 
  onVehicleSelect, 
  vehicleType = null,
  startDate = '',
  endDate = ''
}) => {
  const { availableVehicles, loading, error, checkDateRange } = useDateRangeAvailability();
  const [localStartDate, setLocalStartDate] = useState(startDate);
  const [localEndDate, setLocalEndDate] = useState(endDate);

  // Update local dates when props change
  useEffect(() => {
    setLocalStartDate(startDate);
    setLocalEndDate(endDate);
  }, [startDate, endDate]);

  // Check availability when dates change
  useEffect(() => {
    if (localStartDate && localEndDate) {
      checkDateRange(localStartDate, localEndDate, vehicleType);
    }
  }, [localStartDate, localEndDate, vehicleType, checkDateRange]);

  const handleDateChange = (field, value) => {
    if (field === 'start') {
      setLocalStartDate(value);
    } else {
      setLocalEndDate(value);
    }
  };

  const handleVehicleSelect = (vehicle) => {
    if (onVehicleSelect) {
      onVehicleSelect(vehicle);
    }
  };

  const isDateRangeValid = localStartDate && localEndDate && new Date(localStartDate) < new Date(localEndDate);

  // CRITICAL: Safe array access
  const safeAvailableVehicles = Array.isArray(availableVehicles) ? availableVehicles : [];

  return (
    <div className="space-y-6">
      {/* Date Range Selector */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <Calendar className="h-5 w-5 text-blue-600" />
          Check Vehicle Availability
        </h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Start Date *
            </label>
            <input
              type="date"
              value={localStartDate}
              onChange={(e) => handleDateChange('start', e.target.value)}
              min={new Date().toISOString().split('T')[0]}
              className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
              required
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              End Date *
            </label>
            <input
              type="date"
              value={localEndDate}
              onChange={(e) => handleDateChange('end', e.target.value)}
              min={localStartDate || new Date().toISOString().split('T')[0]}
              className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
              required
            />
          </div>
        </div>

        {/* Date Range Validation */}
        {localStartDate && localEndDate && (
          <div className="mt-4">
            {isDateRangeValid ? (
              <div className="flex items-center gap-2 text-green-600 text-sm">
                <CheckCircle className="h-4 w-4" />
                Date range is valid
              </div>
            ) : (
              <div className="flex items-center gap-2 text-red-600 text-sm">
                <AlertCircle className="h-4 w-4" />
                End date must be after start date
              </div>
            )}
          </div>
        )}
      </div>

      {/* Available Vehicles */}
      {isDateRangeValid && (
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            Available Vehicles
            {vehicleType && (
              <span className="text-sm font-normal text-gray-600 ml-2">
                ({vehicleType})
              </span>
            )}
          </h3>

          {loading && (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
              <span className="ml-3 text-gray-600">Checking availability...</span>
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-md p-4">
              <div className="flex items-center gap-2 text-red-600">
                <AlertCircle className="h-4 w-4" />
                <span className="text-sm">{error}</span>
              </div>
            </div>
          )}

          {!loading && !error && safeAvailableVehicles.length === 0 && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4">
              <div className="flex items-center gap-2 text-yellow-600">
                <Clock className="h-4 w-4" />
                <span className="text-sm">
                  No vehicles available for the selected dates. Please choose different dates or check back later.
                </span>
              </div>
            </div>
          )}

          {!loading && !error && safeAvailableVehicles.length > 0 && (
            <div className="space-y-3">
              <div className="text-sm text-gray-600 mb-4">
                Found {safeAvailableVehicles.length} available vehicle{safeAvailableVehicles.length !== 1 ? 's' : ''}
              </div>
              
              <div className="grid grid-cols-1 gap-3">
                {safeAvailableVehicles.map((vehicle) => (
                  <div
                    key={vehicle.id}
                    className="border border-gray-200 rounded-lg p-4 hover:border-blue-300 hover:bg-blue-50 cursor-pointer transition-colors"
                    onClick={() => handleVehicleSelect(vehicle)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3">
                          <h4 className="font-medium text-gray-900">
                            {vehicle.name || vehicle.model || 'Unknown Vehicle'}
                          </h4>
                          <VehicleStatusBadge status="available" size="sm" />
                        </div>
                        <div className="text-sm text-gray-600 mt-1">
                          <span className="font-medium">Plate:</span> {vehicle.plate_number || 'N/A'}
                          {vehicle.vehicle_type && (
                            <>
                              <span className="mx-2">•</span>
                              <span className="font-medium">Type:</span> {vehicle.vehicle_type}
                            </>
                          )}
                        </div>
                      </div>
                      
                      <div className="text-right">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleVehicleSelect(vehicle);
                          }}
                          className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 transition-colors"
                        >
                          Select
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default VehicleAvailabilityChecker;