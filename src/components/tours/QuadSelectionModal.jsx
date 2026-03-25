import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useSelector, useDispatch } from 'react-redux';
import { getAvailableVehiclesForBooking } from '../../store/slices/vehiclesSlice';
import { checkBookingConflicts } from '../../store/slices/bookingsSlice';

const QuadSelectionModal = ({ 
  isOpen, 
  onClose, 
  selectedDate, 
  selectedTime, 
  duration = 4,
  location,
  onQuadSelection,
  maxParticipants = 8 
}) => {
  console.log('🔍 QuadSelectionModal.jsx - all props:', { 
    isOpen, 
    onClose, 
    selectedDate, 
    selectedTime, 
    duration,
    location,
    onQuadSelection,
    maxParticipants 
  });
  console.log('🔍 QuadSelectionModal.jsx - received location:', location);
  
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const { availableForBooking, loading, vehicles } = useSelector(state => state.vehicles);
  const { conflicts } = useSelector(state => state.bookings || { conflicts: [] });
  const [selectedQuads, setSelectedQuads] = useState([]);
  const [participantCounts, setParticipantCounts] = useState({});
  const [availabilityChecking, setAvailabilityChecking] = useState(false);
  
  // DEBUG: Log full Redux state
  console.log('🔍 QuadSelectionModal - Full Redux state:', useSelector(state => state));
  console.log('🔍 QuadSelectionModal - vehicles array:', vehicles);
  console.log('🔍 QuadSelectionModal - availableForBooking:', availableForBooking);
  
  // Enhanced vehicle filtering with real-time availability
  const getDisplayVehicles = () => {
    let vehiclesToDisplay = [];
    
    if (availableForBooking?.availableVehicles?.length > 0) {
      vehiclesToDisplay = availableForBooking.availableVehicles;
    } else {
      // Fallback to direct vehicles with filtering
      vehiclesToDisplay = (vehicles || []).filter(vehicle => {
        // Filter by ATV types
        const atvTypes = ['performance', 'utility', 'youth', 'sideBySide', 'quad'];
        if (!atvTypes.includes(vehicle.type)) return false;
        
        // Must be available status
        if (vehicle.status !== 'available') return false;
        
        // Filter out vehicles in maintenance
        if (vehicle.maintenanceStatus && vehicle.maintenanceStatus !== 'active') return false;
        
        // Location filter
        if (location && vehicle.location && vehicle.location.toLowerCase() !== location.toLowerCase()) return false;
        
        return true;
      });
    }
    
    // Additional real-time filtering based on conflicts
    return vehiclesToDisplay.filter(vehicle => {
      const hasConflict = conflicts.some(conflict => 
        conflict.conflictingVehicles && conflict.conflictingVehicles.includes(vehicle.id)
      );
      return !hasConflict;
    });
  };

  const displayVehicles = getDisplayVehicles();
  console.log('🔍 displayVehicles after enhanced filtering:', displayVehicles);

  // Calculate end time for availability check
  const getEndDateTime = () => {
    if (!selectedDate || !selectedTime) return null;
    const startDateTime = new Date(`${selectedDate}T${selectedTime}`);
    const endDateTime = new Date(startDateTime);
    endDateTime.setHours(endDateTime.getHours() + duration);
    return endDateTime.toISOString();
  };

  // Fetch available quads when modal opens
  useEffect(() => {
    console.log('🔍 QuadSelectionModal: useEffect triggered with props:', {
      isOpen,
      selectedDate,
      selectedTime,
      location,
      duration
    });
    
    if (isOpen && selectedDate && selectedTime && location) {
      const startDateTime = `${selectedDate}T${selectedTime}:00`;
      const endDateTime = getEndDateTime();
      
      console.log('🔍 QuadSelectionModal: Fetching available vehicles with params:', {
        startDate: startDateTime,
        endDate: endDateTime,
        location: location,
        vehicleType: ['quad', 'performance', 'utility', 'youth', 'sideBySide']
      });
      
      // Include all ATV types in search
      dispatch(getAvailableVehiclesForBooking({
        startDate: startDateTime,
        endDate: endDateTime,
        location: location,
        vehicleType: ['quad', 'performance', 'utility', 'youth', 'sideBySide']
      }));
    } else {
      console.log('❌ QuadSelectionModal: Missing required parameters:', {
        isOpen: !!isOpen,
        selectedDate: !!selectedDate,
        selectedTime: !!selectedTime,
        location: !!location
      });
      
      // FALLBACK: If no search criteria, use all vehicles from Redux directly
      if (isOpen && vehicles && vehicles.length > 0) {
        console.log('🔄 QuadSelectionModal: Using fallback - direct vehicles from Redux');
      }
    }
  }, [isOpen, selectedDate, selectedTime, location, duration, dispatch, vehicles]);

  // Handle quad selection with conflict checking
  const handleQuadToggle = async (quadId) => {
    setSelectedQuads(prev => {
      const isSelected = prev.includes(quadId);
      if (isSelected) {
        // Remove quad and its participant count
        const newSelection = prev.filter(id => id !== quadId);
        const newCounts = { ...participantCounts };
        delete newCounts[quadId];
        setParticipantCounts(newCounts);
        return newSelection;
      } else {
        // Check for conflicts before adding
        if (selectedDate && selectedTime) {
          const startDateTime = `${selectedDate}T${selectedTime}:00`;
          const endDateTime = getEndDateTime();
          
          dispatch(checkBookingConflicts({
            vehicleIds: [quadId],
            startDate: startDateTime,
            endDate: endDateTime
          }));
        }
        
        // Add quad with default 1 participant
        const newSelection = [...prev, quadId];
        setParticipantCounts(prev => ({ ...prev, [quadId]: 1 }));
        return newSelection;
      }
    });
  };

  // Handle participant count change
  const handleParticipantCountChange = (quadId, count) => {
    if (count >= 1 && count <= 2) {
      setParticipantCounts(prev => ({
        ...prev,
        [quadId]: count
      }));
    }
  };

  // Calculate total participants
  const totalParticipants = Object.values(participantCounts).reduce((sum, count) => sum + count, 0);

  // Handle confirmation
  const handleConfirm = () => {
    const quadSelections = selectedQuads.map(quadId => {
      const quad = displayVehicles.find(v => v.id === quadId);
      return {
        quadId,
        quadName: quad ? `${quad.name} ${quad.model}` : `Quad ${quadId}`,
        participantCount: participantCounts[quadId] || 1
      };
    });

    onQuadSelection({
      selectedQuads: quadSelections,
      totalParticipants,
      totalQuads: selectedQuads.length
    });
    onClose();
  };

  // Reset selections when modal closes
  useEffect(() => {
    if (!isOpen) {
      setSelectedQuads([]);
      setParticipantCounts({});
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[1001] flex items-center justify-center bg-black bg-opacity-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl mx-4 max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold">Select Quads for Tour</h2>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700 transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Tour Details */}
          <div className="bg-blue-50 p-4 rounded-lg mb-6">
            <h3 className="font-semibold text-blue-900 mb-2">Tour Details</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <span className="text-blue-700 font-medium">Date:</span>
                <p className="text-blue-900">{selectedDate}</p>
              </div>
              <div>
                <span className="text-blue-700 font-medium">Time:</span>
                <p className="text-blue-900">{selectedTime}</p>
              </div>
              <div>
                <span className="text-blue-700 font-medium">Duration:</span>
                <p className="text-blue-900">{duration} hours</p>
              </div>
              <div>
                <span className="text-blue-700 font-medium">Location:</span>
                <p className="text-blue-900">{location}</p>
              </div>
            </div>
          </div>

          {/* Participant Summary */}
          <div className="bg-green-50 p-4 rounded-lg mb-6">
            <div className="flex justify-between items-center">
              <div>
                <span className="text-green-700 font-medium">Selected Quads:</span>
                <span className="ml-2 text-green-900 font-bold">{selectedQuads.length}</span>
              </div>
              <div>
                <span className="text-green-700 font-medium">Total Participants:</span>
                <span className="ml-2 text-green-900 font-bold">{totalParticipants}</span>
                <span className="text-green-600 text-sm ml-1">/ {maxParticipants} max</span>
              </div>
            </div>
          </div>

          {/* Available Quads */}
          <div className="mb-6">
            <h3 className="text-lg font-semibold mb-4">Available Quads</h3>
            
            {loading ? (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                <p className="mt-2 text-gray-600">Loading available quads...</p>
              </div>
            ) : displayVehicles.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-gray-600">No quads available for the selected time and location.</p>
                <p className="text-sm text-gray-500 mt-2">Please try a different time or location.</p>
                <div className="mt-4 p-4 bg-gray-100 rounded text-left text-xs">
                  <strong>Debug Info:</strong><br/>
                  Total Vehicles: {availableForBooking.totalCount}<br/>
                  Search Criteria: {JSON.stringify(availableForBooking.searchCriteria, null, 2)}<br/>
                  Direct Vehicles Array: {vehicles ? vehicles.length : 'null'}<br/>
                  Vehicle Details: {JSON.stringify(vehicles, null, 2)}
                </div>
                
                {/* FALLBACK: Show vehicles directly if available */}
                {vehicles && vehicles.length > 0 && (
                  <div className="mt-6">
                    <h4 className="font-semibold text-red-600 mb-4">FALLBACK: Direct Vehicle Access</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {vehicles.filter(v => ['performance', 'utility', 'youth', 'sideBySide', 'quad'].includes(v.type)).map((quad) => {
                        const isSelected = selectedQuads.includes(quad.id);
                        const participantCount = participantCounts[quad.id] || 1;
                        
                        return (
                          <div
                            key={quad.id}
                            className={`border-2 rounded-lg p-4 cursor-pointer transition-all ${
                              isSelected 
                                ? 'border-blue-500 bg-blue-50' 
                                : 'border-gray-300 hover:border-blue-300'
                            }`}
                            onClick={() => handleQuadToggle(quad.id)}
                          >
                            <div className="flex items-center justify-between mb-3">
                              <h4 className="font-semibold text-gray-900">{quad.name} {quad.model}</h4>
                              <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                                isSelected ? 'border-blue-500 bg-blue-500' : 'border-gray-300'
                              }`}>
                                {isSelected && (
                                  <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                  </svg>
                                )}
                              </div>
                            </div>
                            
                            <div className="text-sm text-gray-600 mb-3">
                              <p><span className="font-medium">Type:</span> {quad.type}</p>
                              <p><span className="font-medium">Status:</span> 
                                <span className="ml-1 px-2 py-1 bg-green-100 text-green-800 rounded-full text-xs">
                                  {quad.status}
                                </span>
                              </p>
                              <p><span className="font-medium">Location:</span> {quad.location}</p>
                            </div>

                            {isSelected && (
                              <div className="border-t pt-3">
                                <label className="block text-sm font-medium text-gray-700 mb-2">
                                  Participants for this quad:
                                </label>
                                <div className="flex items-center gap-3">
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleParticipantCountChange(quad.id, participantCount - 1);
                                    }}
                                    disabled={participantCount <= 1}
                                    className="w-8 h-8 rounded-full border border-gray-300 flex items-center justify-center hover:bg-gray-100 disabled:opacity-50"
                                  >
                                    -
                                  </button>
                                  <span className="w-8 text-center font-semibold">{participantCount}</span>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleParticipantCountChange(quad.id, participantCount + 1);
                                    }}
                                    disabled={participantCount >= 2}
                                    className="w-8 h-8 rounded-full border border-gray-300 flex items-center justify-center hover:bg-gray-100 disabled:opacity-50"
                                  >
                                    +
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {displayVehicles.map((quad) => {
                  const isSelected = selectedQuads.includes(quad.id);
                  const participantCount = participantCounts[quad.id] || 1;
                  
                  return (
                    <div
                      key={quad.id}
                      className={`border-2 rounded-lg p-4 cursor-pointer transition-all ${
                        isSelected 
                          ? 'border-blue-500 bg-blue-50' 
                          : 'border-gray-300 hover:border-blue-300'
                      }`}
                      onClick={() => handleQuadToggle(quad.id)}
                    >
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="font-semibold text-gray-900">{quad.name}</h4>
                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                          isSelected ? 'border-blue-500 bg-blue-500' : 'border-gray-300'
                        }`}>
                          {isSelected && (
                            <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                            </svg>
                          )}
                        </div>
                      </div>
                      
                      <div className="text-sm text-gray-600 mb-3">
                        <p><span className="font-medium">Model:</span> {quad.model}</p>
                        <p><span className="font-medium">Capacity:</span> {quad.capacity || 2} persons</p>
                        <p><span className="font-medium">Status:</span> 
                          <span className="ml-1 px-2 py-1 bg-green-100 text-green-800 rounded-full text-xs">
                            Available
                          </span>
                        </p>
                      </div>

                      {isSelected && (
                        <div className="border-t pt-3">
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            Participants for this quad:
                          </label>
                          <div className="flex items-center gap-3">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleParticipantCountChange(quad.id, participantCount - 1);
                              }}
                              disabled={participantCount <= 1}
                              className="w-8 h-8 rounded-full border border-gray-300 flex items-center justify-center hover:bg-gray-100 disabled:opacity-50"
                            >
                              -
                            </button>
                            <span className="w-8 text-center font-semibold">{participantCount}</span>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleParticipantCountChange(quad.id, participantCount + 1);
                              }}
                              disabled={participantCount >= 2 || totalParticipants >= maxParticipants}
                              className="w-8 h-8 rounded-full border border-gray-300 flex items-center justify-center hover:bg-gray-100 disabled:opacity-50"
                            >
                              +
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex justify-end gap-4">
            <button
              onClick={onClose}
              className="px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              disabled={selectedQuads.length === 0 || totalParticipants === 0}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Confirm Selection ({selectedQuads.length} quads, {totalParticipants} participants)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default QuadSelectionModal;