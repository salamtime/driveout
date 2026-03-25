import React, { useState, useEffect } from 'react';
import { Calendar, AlertTriangle, CheckCircle, Clock, RefreshCw } from 'lucide-react';
import VehicleService from '../services/VehicleService';
import { getMoroccoTodayString, getMoroccoNextDays, isMoroccoToday, parseDateAsLocal, formatDateToYYYYMMDD } from '../utils/moroccoTime';

/**
 * SmartDatePicker - Intelligent date selection with conflict detection
 * 
 * Features:
 * - Real-time availability checking for selected vehicle
 * - Conflict detection and visual warnings
 * - Alternative date suggestions
 * - 7-day availability preview
 * - Rental type-aware validation
 */
const SmartDatePicker = ({
  selectedVehicleId,
  startDate,
  endDate,
  onDateChange,
  rentalType = 'daily',
  disabled = false,
  excludeRentalId = null
}) => {
  const [availabilityData, setAvailabilityData] = useState({});
  const [loading, setLoading] = useState(false);
  const [conflicts, setConflicts] = useState([]);
  const [suggestions, setSuggestions] = useState([]);

  // Load availability data when vehicle or dates change
  useEffect(() => {
    if (selectedVehicleId) {
      loadAvailabilityData();
    } else {
      // Clear data when no vehicle selected
      setAvailabilityData({});
      setConflicts([]);
      setSuggestions([]);
    }
  }, [selectedVehicleId, excludeRentalId]);

  // Check for conflicts when dates change
  useEffect(() => {
    if (selectedVehicleId && startDate && endDate) {
      checkDateConflicts();
    } else {
      setConflicts([]);
      setSuggestions([]);
    }
  }, [selectedVehicleId, startDate, endDate, availabilityData]);

  const loadAvailabilityData = async () => {
    if (!selectedVehicleId) return;

    setLoading(true);
    try {
      console.log('🔍 Loading availability data for vehicle:', selectedVehicleId);
      
      // Get next 7 days using Morocco timezone
      const next7Days = getMoroccoNextDays(7);
      const startDateStr = next7Days[0];
      const endDateStr = next7Days[6];
      
      console.log('📅 Checking availability from', startDateStr, 'to', endDateStr, '(Morocco timezone)');
      
      const availability = await VehicleService.getVehicleAvailabilityStatus(
        selectedVehicleId,
        startDateStr,
        endDateStr,
        excludeRentalId
      );
      
      console.log('✅ Availability data loaded:', availability);
      setAvailabilityData(availability);
      
    } catch (error) {
      console.error('❌ Error loading availability data:', error);
      setAvailabilityData({});
    } finally {
      setLoading(false);
    }
  };

  const checkDateConflicts = () => {
    if (!selectedVehicleId || !startDate || !endDate || !availabilityData.conflicts) {
      setConflicts([]);
      setSuggestions([]);
      return;
    }

    console.log('🔍 Checking date conflicts for:', { startDate, endDate, rentalType });

    // Find conflicts that overlap with selected date range
    const dateConflicts = availabilityData.conflicts.filter(conflict => {
      const conflictStart = conflict.rental_start_date;
      const conflictEnd = conflict.rental_end_date;
      
      // Check if there's any overlap
      const hasOverlap = startDate <= conflictEnd && endDate >= conflictStart;
      
      if (hasOverlap) {
        console.log('⚠️ Found conflict:', conflict);
      }
      
      return hasOverlap;
    });

    setConflicts(dateConflicts);

    // Generate suggestions if there are conflicts
    if (dateConflicts.length > 0) {
      generateSuggestions();
    } else {
      setSuggestions([]);
    }
  };

  const generateSuggestions = () => {
    if (!availabilityData.available_dates) {
      setSuggestions([]);
      return;
    }

    console.log('💡 Generating date suggestions...');

    // Get available dates and suggest alternatives
    const availableDates = availabilityData.available_dates;
    const suggestions = [];

    // Suggest next 3 available date ranges based on rental type
    for (let i = 0; i < availableDates.length && suggestions.length < 3; i++) {
      const availableDate = availableDates[i];
      let suggestedEndDate;

      if (rentalType === 'hourly') {
        suggestedEndDate = availableDate; // Same day for hourly
      } else {
        const endDateObj = parseDateAsLocal(availableDate);
        if (endDateObj) {
          if (rentalType === 'weekly') {
            endDateObj.setDate(endDateObj.getDate() + 7);
          } else { // daily
            endDateObj.setDate(endDateObj.getDate() + 1);
          }
          suggestedEndDate = formatDateToYYYYMMDD(endDateObj);
        } else {
          suggestedEndDate = availableDate; // Fallback
        }
      }

      suggestions.push({
        startDate: availableDate,
        endDate: suggestedEndDate,
        label: formatDateRange(availableDate, suggestedEndDate)
      });
    }

    console.log('💡 Generated suggestions:', suggestions);
    setSuggestions(suggestions);
  };

  const formatDateRange = (start, end) => {
    const startFormatted = formatDate(start);
    const endFormatted = formatDate(end);
    
    if (start === end) {
      return `${startFormatted} (Same Day)`;
    }
    
    return `${startFormatted} - ${endFormatted}`;
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    
    try {
      const date = parseDateAsLocal(dateStr);
      if (!date) return dateStr;
      return date.toLocaleDateString('en-GB', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      });
    } catch (err) {
      return dateStr;
    }
  };

  const handleDateInputChange = (field, value) => {
    console.log('📅 Date input changed:', field, value);
    onDateChange(field, value);
  };

  const applySuggestion = (suggestion) => {
    console.log('✅ Applying suggestion:', suggestion);
    onDateChange('startDate', suggestion.startDate);
    onDateChange('endDate', suggestion.endDate);
  };

  const getDateStatus = (dateStr) => {
    if (!availabilityData.available_dates || !availabilityData.conflicts) {
      return 'unknown';
    }

    const isAvailable = availabilityData.available_dates.includes(dateStr);
    const hasConflict = availabilityData.conflicts.some(conflict => 
      dateStr >= conflict.rental_start_date && dateStr <= conflict.rental_end_date
    );

    if (hasConflict) return 'conflict';
    if (isAvailable) return 'available';
    return 'unknown';
  };

  const renderAvailabilityPreview = () => {
    if (!selectedVehicleId) {
      return (
        <div className="text-sm text-gray-500 text-center py-4">
        </div>
      );
    }

    if (loading) {
      return (
        <div className="flex items-center justify-center py-4">
          <RefreshCw className="h-4 w-4 animate-spin text-blue-500 mr-2" />
          <span className="text-sm text-blue-600">Loading availability...</span>
        </div>
      );
    }

    // Get next 7 days using Morocco timezone
    const next7Days = getMoroccoNextDays(7);

    return (
      <div className="grid grid-cols-7 gap-1 text-xs">
        {next7Days.map((dateStr, index) => {
          const status = getDateStatus(dateStr);
          const isToday = isMoroccoToday(dateStr);
          const date = parseDateAsLocal(dateStr);
          const dayName = date ? date.toLocaleDateString('en', { weekday: 'short' }) : '';
          const dayNumber = date ? date.getDate() : '';
          
          return (
            <div
              key={dateStr}
              className={`p-2 rounded text-center border ${
                status === 'available' 
                  ? 'bg-green-50 border-green-200 text-green-700' 
                  : status === 'conflict'
                  ? 'bg-red-50 border-red-200 text-red-700'
                  : 'bg-gray-50 border-gray-200 text-gray-500'
              } ${isToday ? 'ring-2 ring-blue-300' : ''}`}
            >
              <div className="font-medium">{dayName}</div>
              <div className="text-xs">{dayNumber}</div>
              <div className="mt-1">
                {status === 'available' && <CheckCircle className="h-3 w-3 mx-auto text-green-500" />}
                {status === 'conflict' && <AlertTriangle className="h-3 w-3 mx-auto text-red-500" />}
                {status === 'unknown' && <Clock className="h-3 w-3 mx-auto text-gray-400" />}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-4">
        <Calendar className="h-5 w-5 text-green-600" />
        <h3 className="text-lg font-semibold text-green-900">📅 Smart Date Selection</h3>
      </div>

      {/* Date Input Fields */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Start Date *
          </label>
          <input
            type="date"
            value={startDate || ''}
            onChange={(e) => handleDateInputChange('startDate', e.target.value)}
            min={getMoroccoTodayString()}
            disabled={disabled}
            className={`w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 ${
              conflicts.length > 0 ? 'border-red-300 bg-red-50' : 'border-gray-300'
            }`}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            End Date *
          </label>
          <input
            type="date"
            value={endDate || ''}
            onChange={(e) => handleDateInputChange('endDate', e.target.value)}
            min={startDate || getMoroccoTodayString()}
            disabled={disabled || (rentalType === 'hourly')}
            className={`w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500 ${
              conflicts.length > 0 ? 'border-red-300 bg-red-50' : 'border-gray-300'
            } ${rentalType === 'hourly' ? 'bg-gray-100 cursor-not-allowed' : ''}`}
          />
          {rentalType === 'hourly' && (
            <p className="text-xs text-gray-500 mt-1">End date auto-set for hourly rentals</p>
          )}
        </div>
      </div>

      {/* Conflict Warnings */}
      {conflicts.length > 0 && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-md">
          <div className="flex items-start">
            <AlertTriangle className="h-5 w-5 text-red-400 mt-0.5 mr-3" />
            <div>
              <h4 className="text-sm font-medium text-red-800">Date Conflict Detected</h4>
              <div className="mt-2 text-sm text-red-700">
                <p>The selected dates conflict with existing rentals:</p>
                <ul className="list-disc list-inside mt-1">
                  {conflicts.map((conflict, index) => (
                    <li key={index}>
                      {formatDate(conflict.rental_start_date)} - {formatDate(conflict.rental_end_date)}
                      {conflict.customer_name && ` (${conflict.customer_name})`}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Alternative Suggestions */}
      {suggestions.length > 0 && (
        <div className="p-4 bg-blue-50 border border-blue-200 rounded-md">
          <h4 className="text-sm font-medium text-blue-800 mb-3">💡 Alternative Dates Available</h4>
          <div className="space-y-2">
            {suggestions.map((suggestion, index) => (
              <button
                key={index}
                onClick={() => applySuggestion(suggestion)}
                className="w-full text-left px-3 py-2 bg-white border border-blue-200 rounded hover:bg-blue-50 transition-colors"
                disabled={disabled}
              >
                <span className="text-sm text-blue-700">{suggestion.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Availability Preview */}

      {/* Status Summary */}
      {selectedVehicleId && startDate && endDate && (
        <div className={`p-3 rounded-md border ${
          conflicts.length > 0 
            ? 'bg-red-50 border-red-200' 
            : 'bg-green-50 border-green-200'
        }`}>
          <div className="flex items-center">
            {conflicts.length > 0 ? (
              <>
                <AlertTriangle className="h-4 w-4 text-red-500 mr-2" />
                <span className="text-sm font-medium text-red-700">
                  ❌ Selected dates have conflicts - please choose alternative dates
                </span>
              </>
            ) : (
              <>
                <CheckCircle className="h-4 w-4 text-green-500 mr-2" />
                <span className="text-sm font-medium text-green-700">
                  ✅ Selected dates are available for booking
                </span>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default SmartDatePicker;