import { useMemo } from 'react';
import { useSelector } from 'react-redux';
import { selectVehicles } from '../store/slices/vehiclesSlice';
import { selectActiveRentals } from '../store/slices/rentalsSlice';

export const useDashboardStats = () => {
  const vehicles = useSelector(selectVehicles);
  const rentals = useSelector(selectActiveRentals);
  
  const stats = useMemo(() => {
    // Calculate active rentals from rentals slice
    const activeRentalsCount = rentals?.length || 0;
    
    // Calculate available vehicles from vehicles slice
    const availableVehiclesCount = vehicles?.filter(vehicle => 
      vehicle.status === 'available'
    ).length || 0;
    
    // Calculate rented vehicles from vehicles slice (alternative method)
    const rentedVehiclesCount = vehicles?.filter(vehicle => 
      vehicle.status === 'rented'
    ).length || 0;
    
    // Use the higher count between rentals table and vehicle status
    const finalActiveRentals = Math.max(activeRentalsCount, rentedVehiclesCount);
    
    return {
      activeRentals: finalActiveRentals,
      availableVehicles: availableVehiclesCount,
      totalVehicles: vehicles?.length || 0,
      rentedVehicles: rentedVehiclesCount
    };
  }, [vehicles, rentals]);
  
  return stats;
};