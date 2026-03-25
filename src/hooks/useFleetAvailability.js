import { useState, useEffect, useCallback } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { fetchVehicles } from '../store/slices/vehiclesSlice';

export const useFleetAvailability = (criteria) => {
  const dispatch = useDispatch();
  const { availableForBooking, vehicles, loading } = useSelector(state => state.vehicles);
  const [isChecking, setIsChecking] = useState(false);
  const [lastCheck, setLastCheck] = useState(null);

  const checkAvailability = useCallback(async (newCriteria = criteria) => {
    if (!newCriteria || !newCriteria.startDate || !newCriteria.endDate) {
      return { availableVehicles: [], totalCount: 0 };
    }

    setIsChecking(true);
    try {
      // Fetch all vehicles instead of non-existent booking function
      const result = await dispatch(fetchVehicles());
      setLastCheck(Date.now());
      return result.payload || { availableVehicles: [], totalCount: 0 };
    } catch (error) {
      console.error('Error checking availability:', error);
      return { availableVehicles: [], totalCount: 0 };
    } finally {
      setIsChecking(false);
    }
  }, [dispatch, criteria]);

  // Auto-refresh every 30 seconds if criteria is provided
  useEffect(() => {
    if (!criteria) return;

    const interval = setInterval(() => {
      checkAvailability();
    }, 30000); // 30 seconds

    return () => clearInterval(interval);
  }, [checkAvailability, criteria]);

  // Initial check when criteria changes
  useEffect(() => {
    if (criteria) {
      checkAvailability();
    }
  }, [checkAvailability]);

  return {
    availableVehicles: availableForBooking?.availableVehicles || [],
    totalCount: availableForBooking?.totalCount || 0,
    isChecking: isChecking || loading,
    lastCheck,
    checkAvailability,
    refresh: () => checkAvailability()
  };
};

export const useVehicleStatus = (vehicleIds) => {
  const { vehicles } = useSelector(state => state.vehicles);
  const [vehicleStatuses, setVehicleStatuses] = useState([]);

  useEffect(() => {
    if (!vehicleIds || !Array.isArray(vehicleIds) || !vehicles) {
      setVehicleStatuses([]);
      return;
    }

    const statuses = vehicleIds.map(id => {
      const vehicle = vehicles.find(v => v.id === id);
      if (!vehicle) {
        return { id, status: 'not_found', name: 'Unknown Vehicle' };
      }

      return {
        id: vehicle.id,
        name: vehicle.name,
        model: vehicle.model,
        status: vehicle.status,
        location: vehicle.location,
        maintenanceStatus: vehicle.maintenanceStatus,
        currentBookings: vehicle.currentBookings || [],
        lastUpdated: vehicle.lastUpdated
      };
    });

    setVehicleStatuses(statuses);
  }, [vehicleIds, vehicles]);

  return vehicleStatuses;
};

export default useFleetAvailability;