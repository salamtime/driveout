import React, { useState, useEffect } from 'react';
import { Car, Clock, AlertTriangle, CheckCircle, RefreshCw } from 'lucide-react';
import VehicleService from '../services/VehicleService';
import TransactionalRentalService from '../services/TransactionalRentalService';

const SmartVehicleSelector = ({
  startDate,
  endDate,
  selectedVehicleId,
  onVehicleChange,
  excludeRentalId = null,
  disabled = false
}) => {
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [availabilityStatus, setAvailabilityStatus] = useState({});
  const [checkingAvailability, setCheckingAvailability] = useState(false);
  const [conflictDetails, setConflictDetails] = useState({});
  const availabilityCheckTimeout = React.useRef(null);

  useEffect(() => {
    loadVehicles();
  }, []);

  useEffect(() => {
    if (startDate && endDate && vehicles.length > 0) {
      // Debounce availability checks to prevent 429 rate limiting
      if (availabilityCheckTimeout.current) {
        clearTimeout(availabilityCheckTimeout.current);
      }
      availabilityCheckTimeout.current = setTimeout(() => {
        checkAllVehicleAvailability();
      }, 500);
    }

    return () => {
      if (availabilityCheckTimeout.current) {
        clearTimeout(availabilityCheckTimeout.current);
      }
    };
  }, [startDate, endDate, vehicles, excludeRentalId]);

  const loadVehicles = async () => {
    try {
      setLoading(true);
      const vehicleData = await VehicleService.getAllVehicles();

      console.log('🚗 RAW vehicles from VehicleService:', vehicleData?.map(v => ({ id: v.id, name: v.name, status: v.status })));
      
      // CRITICAL FIX: Filter out vehicles that are NOT available for rental
      // Only show vehicles with 'available' status
      const activeVehicles = vehicleData.filter(v => {
        const status = (v.status || '').toLowerCase();
        // Only include vehicles with 'available' status
        const isAvailable = status === 'available';
        
        if (!isAvailable) {
          console.log(`🚫 FILTERED OUT: Vehicle ${v.id} (${v.name}) - Status: ${v.status}`);
        }
        
        return isAvailable;
      });

      console.log('🚗 Loaded all vehicles:', vehicleData.length);
      console.log('✅ Filtered to available vehicles only:', activeVehicles.length);
      console.log('🔧 Filtered out (maintenance/out_of_service/rented/reserved):', vehicleData.length - activeVehicles.length);
      
      setVehicles(activeVehicles || []);
      setError(null);
    } catch (err) {
      console.error('❌ Error loading vehicles:', err);
      setError('Failed to load vehicles. Please refresh the page.');
    } finally {
      setLoading(false);
    }
  };

  const checkAllVehicleAvailability = async () => {
    if (!startDate || !endDate) {
      console.log('⚠️ No dates provided for availability check');
      return;
    }

    setCheckingAvailability(true);
    console.log('🔍 Checking availability for all vehicles:', {
      startDate,
      endDate,
      vehicleCount: vehicles.length
    });

    const newAvailabilityStatus = {};
    const newConflictDetails = {};

    try {
      for (let i = 0; i < vehicles.length; i++) {
        const vehicle = vehicles[i];
        // Add 200ms delay between requests to prevent 429 rate limiting
        if (i > 0) {
          await new Promise(resolve => setTimeout(resolve, 200));
        }
        try {
          console.log(`🔍 Checking vehicle ${vehicle.id} (${vehicle.name}) - Status: ${vehicle.status}`);
          
          const availabilityResult = await TransactionalRentalService.checkVehicleAvailability(
            vehicle.id,
            startDate.split('T')[0],
            endDate.split('T')[0],
            startDate,
            endDate,
            excludeRentalId
          );

          if (availabilityResult.isAvailable) {
            newAvailabilityStatus[vehicle.id] = 'available';
            console.log(`✅ Vehicle ${vehicle.id} is available`);
          } else {
            newAvailabilityStatus[vehicle.id] = 'conflict';
            newConflictDetails[vehicle.id] = availabilityResult;
            console.log(`❌ Vehicle ${vehicle.id} has conflict:`, availabilityResult.reason);
          }
        } catch (vehicleError) {
          console.error(`❌ Error checking vehicle ${vehicle.id}:`, vehicleError);
          newAvailabilityStatus[vehicle.id] = 'available'; // FALLBACK: assume available if check fails
        }
      }

      setAvailabilityStatus(newAvailabilityStatus);
      setConflictDetails(newConflictDetails);

      if (selectedVehicleId && newAvailabilityStatus[selectedVehicleId] === 'conflict') {
        console.log('⚠️ Selected vehicle has conflict, finding alternatives...');
        suggestAlternativeVehicle(newAvailabilityStatus);
      }

    } catch (error) {
      console.error('❌ Error in availability checking:', error);
      setError('Failed to check vehicle availability. Please try again.');
    } finally {
      setCheckingAvailability(false);
    }
  };

  const suggestAlternativeVehicle = (availabilityMap) => {
    const selectedVehicle = vehicles.find(v => v.id.toString() === selectedVehicleId?.toString());
    
    if (selectedVehicle) {
      const sameModelAvailable = vehicles.find(v => 
        v.model === selectedVehicle.model && 
        availabilityMap[v.id] === 'available'
      );

      if (sameModelAvailable) {
        console.log('💡 Suggesting same model alternative:', sameModelAvailable.name);
        return;
      }

      const anyAvailable = vehicles.find(v => availabilityMap[v.id] === 'available');
      if (anyAvailable) {
        console.log('💡 Suggesting any available alternative:', anyAvailable.name);
      }
    }
  };

  const handleVehicleSelect = (vehicleId) => {
    if (disabled) return;

    const vehicle = vehicles.find(v => v.id.toString() === vehicleId.toString());
    const status = availabilityStatus[vehicleId];

    console.log('🚗 Vehicle selection attempt:', {
      vehicleId,
      vehicleName: vehicle?.name,
      vehicleStatus: vehicle?.status,
      availabilityStatus: status,
      hasConflict: status === 'conflict'
    });

    if (status === 'conflict') {
      console.log('⚠️ Selecting vehicle with known conflict');
    }

    onVehicleChange(vehicleId);
  };

  const getAvailabilityIcon = (vehicleId) => {
    const status = availabilityStatus[vehicleId];
    
    switch (status) {
      case 'available':
        return <CheckCircle className="h-5 w-5 text-green-500" />;
      case 'conflict':
        return <AlertTriangle className="h-5 w-5 text-red-500" />;
      case 'error':
        return <AlertTriangle className="h-5 w-5 text-gray-400" />;
      default:
        return <Clock className="h-5 w-5 text-gray-400" />;
    }
  };

  const getAvailabilityText = (vehicleId) => {
    const status = availabilityStatus[vehicleId];
    const conflict = conflictDetails[vehicleId];
    
    switch (status) {
      case 'available':
        return <span className="text-green-600 font-medium">Available</span>;
      case 'conflict':
        return (
          <div className="text-red-600">
            <span className="font-medium">Conflict</span>
            {conflict?.nextAvailable && (
              <div className="text-xs text-red-500 mt-1">
                Next: {new Date(conflict.nextAvailable).toLocaleString()}
              </div>
            )}
          </div>
        );
      case 'error':
        return <span className="text-gray-500">Check failed</span>;
      default:
        return <span className="text-gray-400">Checking...</span>;
    }
  };

  const getVehicleCardClass = (vehicleId) => {
    const isSelected = selectedVehicleId?.toString() === vehicleId?.toString();
    const status = availabilityStatus[vehicleId];
    
    let baseClass = "relative p-4 border rounded-lg cursor-pointer transition-all duration-200 ";
    
    if (disabled) {
      baseClass += "opacity-50 cursor-not-allowed ";
    }
    
    if (isSelected) {
      if (status === 'conflict') {
        baseClass += "border-red-500 bg-red-50 ";
      } else if (status === 'available') {
        baseClass += "border-green-500 bg-green-50 ";
      } else {
        baseClass += "border-blue-500 bg-blue-50 ";
      }
    } else {
      if (status === 'conflict') {
        baseClass += "border-red-200 bg-red-25 hover:border-red-300 ";
      } else if (status === 'available') {
        baseClass += "border-green-200 bg-white hover:border-green-300 hover:bg-green-25 ";
      } else {
        baseClass += "border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50 ";
      }
    }
    
    return baseClass;
  };

  const getAvailableVehicles = () => {
    return vehicles.filter(vehicle => availabilityStatus[vehicle.id] === 'available');
  };

  const getConflictVehicles = () => {
    return vehicles.filter(vehicle => availabilityStatus[vehicle.id] === 'conflict');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <RefreshCw className="h-6 w-6 animate-spin text-blue-500 mr-2" />
        <span className="text-gray-600">Loading vehicles...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-md p-4">
        <div className="flex">
          <AlertTriangle className="h-5 w-5 text-red-400 mt-0.5 mr-3" />
          <div>
            <h3 className="text-sm font-medium text-red-800">Error Loading Vehicles</h3>
            <p className="text-sm text-red-700 mt-1">{error}</p>
            <button
              onClick={loadVehicles}
              className="mt-2 text-sm text-red-600 underline hover:text-red-800"
            >
              Try Again
            </button>
          </div>
        </div>
      </div>
    );
  }

  const availableVehicles = getAvailableVehicles();
  const conflictVehicles = getConflictVehicles();

  return (
    <div className="space-y-4">
      {startDate && endDate && (
        <div className="bg-blue-50 border border-blue-200 rounded-md p-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <Car className="h-5 w-5 text-blue-500 mr-2" />
              <span className="text-sm font-medium text-blue-900">
                Availability Status for Selected Period
              </span>
            </div>
            {checkingAvailability && (
              <div className="flex items-center text-sm text-blue-600">
                <RefreshCw className="h-4 w-4 animate-spin mr-1" />
                Checking...
              </div>
            )}
          </div>
          
          <div className="mt-2 flex gap-4 text-sm">
            <div className="flex items-center">
              <CheckCircle className="h-4 w-4 text-green-500 mr-1" />
              <span className="text-green-700">{availableVehicles.length} Available</span>
            </div>
            <div className="flex items-center">
              <AlertTriangle className="h-4 w-4 text-red-500 mr-1" />
              <span className="text-red-700">{conflictVehicles.length} Conflicts</span>
            </div>
          </div>
        </div>
      )}

      {availableVehicles.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-green-800 mb-3 flex items-center">
            <CheckCircle className="h-4 w-4 mr-2" />
            Available Vehicles ({availableVehicles.length})
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {availableVehicles.map((vehicle) => (
              <div
                key={vehicle.id}
                onClick={() => handleVehicleSelect(vehicle.id)}
                className={getVehicleCardClass(vehicle.id)}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center">
                      <Car className="h-4 w-4 text-gray-500 mr-2" />
                      <h3 className="font-medium text-gray-900">{vehicle.name}</h3>
                    </div>
                    <p className="text-sm text-gray-600 mt-1">{vehicle.model}</p>
                    <p className="text-xs text-gray-500 mt-1">
                      Type: {vehicle.vehicle_type || 'ATV'}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      Plate Number: {vehicle.plate_number || '—'}
                    </p>
                  </div>
                  <div className="flex flex-col items-end">
                    {getAvailabilityIcon(vehicle.id)}
                    <div className="mt-2 text-right">
                      {getAvailabilityText(vehicle.id)}
                    </div>
                  </div>
                </div>
                
                {selectedVehicleId?.toString() === vehicle.id?.toString() && (
                  <div className="absolute top-2 right-2">
                    <div className="bg-green-500 text-white text-xs px-2 py-1 rounded">
                      Selected
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {conflictVehicles.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-red-800 mb-3 flex items-center">
            <AlertTriangle className="h-4 w-4 mr-2" />
            Unavailable Vehicles ({conflictVehicles.length})
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {conflictVehicles.map((vehicle) => (
              <div
                key={vehicle.id}
                onClick={() => handleVehicleSelect(vehicle.id)}
                className={getVehicleCardClass(vehicle.id)}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center">
                      <Car className="h-4 w-4 text-gray-500 mr-2" />
                      <h3 className="font-medium text-gray-900">{vehicle.name}</h3>
                    </div>
                    <p className="text-sm text-gray-600 mt-1">{vehicle.model}</p>
                    <p className="text-xs text-gray-500 mt-1">
                      Type: {vehicle.vehicle_type || 'ATV'}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      Plate Number: {vehicle.plate_number || '—'}
                    </p>
                  </div>
                  <div className="flex flex-col items-end">
                    {getAvailabilityIcon(vehicle.id)}
                    <div className="mt-2 text-right">
                      {getAvailabilityText(vehicle.id)}
                    </div>
                  </div>
                </div>
                
                {selectedVehicleId?.toString() === vehicle.id?.toString() && (
                  <div className="absolute top-2 right-2">
                    <div className="bg-red-500 text-white text-xs px-2 py-1 rounded">
                      Selected (Conflict)
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {vehicles.length === 0 && !loading && (
        <div className="text-center py-8">
          <Car className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-600">No available vehicles found.</p>
          <p className="text-sm text-gray-500 mt-2">All vehicles are currently in maintenance, out of service, or already rented.</p>
          <button
            onClick={loadVehicles}
            className="mt-2 text-blue-600 hover:text-blue-800 underline"
          >
            Refresh Vehicles
          </button>
        </div>
      )}

      {selectedVehicleId && availabilityStatus[selectedVehicleId] === 'conflict' && availableVehicles.length > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4">
          <div className="flex">
            <AlertTriangle className="h-5 w-5 text-yellow-400 mt-0.5 mr-3" />
            <div>
              <h3 className="text-sm font-medium text-yellow-800">
                Selected Vehicle Not Available
              </h3>
              <p className="text-sm text-yellow-700 mt-1">
                The selected vehicle has a scheduling conflict. Here are available alternatives:
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {availableVehicles.slice(0, 3).map(vehicle => (
                  <button
                    key={vehicle.id}
                    onClick={() => handleVehicleSelect(vehicle.id)}
                    className="px-3 py-1 text-xs bg-yellow-100 text-yellow-800 rounded-full hover:bg-yellow-200 transition-colors"
                  >
                    Switch to {vehicle.name}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SmartVehicleSelector;