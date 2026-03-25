import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import FuelService from '../services/FuelService';
import VehicleService from '../services/VehicleService';
import { format } from 'date-fns';

const useFuel = () => {
  // State for tank monitoring
  const [tankLevel, setTankLevel] = useState(0);
  const [tankCapacity, setTankCapacity] = useState(1000); // Default: 1000L
  const [tankPercentage, setTankPercentage] = useState(0);
  const [externalRefills, setExternalRefills] = useState([]);
  
  // State for quad fueling logs
  const [quadFuelings, setQuadFuelings] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  
  // Status states
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  
  // Auth state for permissions
  const { user } = useAuth();
  const userRole = user?.role;
  
  // Permission checks
  const canEditDelete = ['admin', 'manager', 'owner'].includes(userRole);
  
  // Initialize and load data
  useEffect(() => {
    const loadInitialData = async () => {
      setLoading(true);
      try {
        // Load tank data
        const tankData = await FuelService.getTankStatus();
        setTankLevel(tankData.currentLevel);
        setTankCapacity(tankData.capacity);
        setTankPercentage((tankData.currentLevel / tankData.capacity) * 100);
        
        // Load external refills
        const refills = await FuelService.getExternalRefills();
        setExternalRefills(refills);
        
        // Load quad fuelings
        const fuelings = await FuelService.getQuadFuelings();
        setQuadFuelings(fuelings);
        
        // Load vehicles for quad fueling association
        console.log('🚗 Loading vehicles from VehicleService...');
        const vehicleData = await VehicleService.getAllVehicles();
        console.log('🚗 Raw vehicle data received:', vehicleData);
        console.log('🚗 Vehicle count:', vehicleData.length);
        
        if (vehicleData.length > 0) {
          console.log('🚗 First vehicle:', vehicleData[0]);
          console.log('🚗 Vehicle statuses:', vehicleData.map(v => ({ id: v.id, name: v.name, status: v.status })));
          
          const activeVehicles = vehicleData.filter(v => v.status === 'active' || v.status === 'available');
          console.log('🚗 Active/Available vehicles:', activeVehicles.length, activeVehicles.map(v => ({ id: v.id, name: v.name, status: v.status })));
        }
        
        setVehicles(vehicleData);
        
        setLoading(false);
      } catch (err) {
        console.error('Error loading fuel data:', err);
        setError('Failed to load fuel management data. Please try again later.');
        setLoading(false);
      }
    };
    
    loadInitialData();
  }, []);
  
  // Helper to format dates consistently
  const formatDate = useCallback((dateString) => {
    try {
      const date = new Date(dateString);
      return format(date, 'MMM d, yyyy - HH:mm');
    } catch (err) {
      console.error('Error formatting date:', err);
      return dateString || 'Unknown date';
    }
  }, []);
  
  // Get vehicle name by ID
  const getVehicleName = useCallback((vehicleId) => {
    const vehicle = vehicles.find(v => v.id === vehicleId);
    return vehicle ? vehicle.name || `${vehicle.brand} ${vehicle.model}` : vehicleId;
  }, [vehicles]);
  
  // External refill operations
  const addExternalRefill = useCallback(async (refillData) => {
    setLoading(true);
    setError(null);
    try {
      const newRefill = await FuelService.addExternalRefill({
        ...refillData,
        createdBy: user?.username || userRole
      });
      
      // Update tank level
      const updatedTankData = await FuelService.getTankStatus();
      setTankLevel(updatedTankData.currentLevel);
      setTankPercentage((updatedTankData.currentLevel / updatedTankData.capacity) * 100);
      
      // Add new refill to the list
      setExternalRefills(prev => [newRefill, ...prev]);
      
      setSuccess('External refill added successfully');
      setLoading(false);
      return newRefill;
    } catch (err) {
      console.error('Error adding external refill:', err);
      setError('Failed to add external refill. Please try again.');
      setLoading(false);
      throw err;
    }
  }, [user, userRole]);
  
  const updateExternalRefill = useCallback(async (refillId, updatedData) => {
    setLoading(true);
    setError(null);
    try {
      const updated = await FuelService.updateExternalRefill(refillId, updatedData);
      
      // Update tank level if volume changed
      if ('volume' in updatedData) {
        const updatedTankData = await FuelService.getTankStatus();
        setTankLevel(updatedTankData.currentLevel);
        setTankPercentage((updatedTankData.currentLevel / updatedTankData.capacity) * 100);
      }
      
      // Update refill in the list
      setExternalRefills(prev => 
        prev.map(refill => refill.id === refillId ? { ...refill, ...updatedData } : refill)
      );
      
      setSuccess('External refill updated successfully');
      setLoading(false);
      return updated;
    } catch (err) {
      console.error('Error updating external refill:', err);
      setError('Failed to update external refill. Please try again.');
      setLoading(false);
      throw err;
    }
  }, []);
  
  const deleteExternalRefill = useCallback(async (refillId) => {
    setLoading(true);
    setError(null);
    try {
      await FuelService.deleteExternalRefill(refillId);
      
      // Update tank level
      const updatedTankData = await FuelService.getTankStatus();
      setTankLevel(updatedTankData.currentLevel);
      setTankPercentage((updatedTankData.currentLevel / updatedTankData.capacity) * 100);
      
      // Remove refill from the list
      setExternalRefills(prev => prev.filter(refill => refill.id !== refillId));
      
      setSuccess('External refill deleted successfully');
      setLoading(false);
    } catch (err) {
      console.error('Error deleting external refill:', err);
      setError('Failed to delete external refill. Please try again.');
      setLoading(false);
      throw err;
    }
  }, []);
  
  // Quad fueling operations
  const addQuadFueling = useCallback(async (fuelingData) => {
    setLoading(true);
    setError(null);
    try {
      // Check if there's enough fuel in the tank
      if (fuelingData.volume > tankLevel) {
        setError(`Not enough fuel in the main tank. Currently available: ${tankLevel}L`);
        setLoading(false);
        throw new Error('Not enough fuel in the tank');
      }
      
      const newFueling = await FuelService.addQuadFueling({
        ...fuelingData,
        createdBy: user?.username || userRole
      });
      
      // Update tank level
      const updatedTankData = await FuelService.getTankStatus();
      setTankLevel(updatedTankData.currentLevel);
      setTankPercentage((updatedTankData.currentLevel / updatedTankData.capacity) * 100);
      
      // Add new fueling to the list
      setQuadFuelings(prev => [newFueling, ...prev]);
      
      setSuccess('Vehicle fueled successfully');
      setLoading(false);
      return newFueling;
    } catch (err) {
      console.error('Error adding quad fueling:', err);
      setError(err.message || 'Failed to add quad fueling. Please try again.');
      setLoading(false);
      throw err;
    }
  }, [tankLevel, user, userRole]);
  
  const updateQuadFueling = useCallback(async (fuelingId, updatedData) => {
    setLoading(true);
    setError(null);
    try {
      // Find the original fueling to calculate volume difference
      const originalFueling = quadFuelings.find(f => f.id === fuelingId);
      
      if (updatedData.volume > originalFueling.volume) {
        // Check if additional fuel is available
        const additionalVolume = updatedData.volume - originalFueling.volume;
        if (additionalVolume > tankLevel) {
          setError(`Not enough fuel in the main tank for this change. Currently available: ${tankLevel}L`);
          setLoading(false);
          throw new Error('Not enough fuel in the tank');
        }
      }
      
      const updated = await FuelService.updateQuadFueling(fuelingId, updatedData);
      
      // Update tank level if volume changed
      if ('volume' in updatedData) {
        const updatedTankData = await FuelService.getTankStatus();
        setTankLevel(updatedTankData.currentLevel);
        setTankPercentage((updatedTankData.currentLevel / updatedTankData.capacity) * 100);
      }
      
      // Update fueling in the list
      setQuadFuelings(prev => 
        prev.map(fueling => fueling.id === fuelingId ? { ...fueling, ...updatedData } : fueling)
      );
      
      setSuccess('Fueling record updated successfully');
      setLoading(false);
      return updated;
    } catch (err) {
      console.error('Error updating quad fueling:', err);
      setError(err.message || 'Failed to update quad fueling. Please try again.');
      setLoading(false);
      throw err;
    }
  }, [quadFuelings, tankLevel]);
  
  const deleteQuadFueling = useCallback(async (fuelingId) => {
    setLoading(true);
    setError(null);
    try {
      await FuelService.deleteQuadFueling(fuelingId);
      
      // Update tank level
      const updatedTankData = await FuelService.getTankStatus();
      setTankLevel(updatedTankData.currentLevel);
      setTankPercentage((updatedTankData.currentLevel / updatedTankData.capacity) * 100);
      
      // Remove fueling from the list
      setQuadFuelings(prev => prev.filter(fueling => fueling.id !== fuelingId));
      
      setSuccess('Fueling record deleted successfully');
      setLoading(false);
    } catch (err) {
      console.error('Error deleting quad fueling:', err);
      setError('Failed to delete quad fueling record. Please try again.');
      setLoading(false);
      throw err;
    }
  }, []);
  
  // State clearing helpers
  const clearError = useCallback(() => setError(null), []);
  const clearSuccess = useCallback(() => setSuccess(null), []);
  
  // Refresh vehicles list (for when new vehicles are added)
  const refreshVehicles = useCallback(async () => {
    try {
      console.log('🔄 Refreshing vehicles list...');
      const vehicleData = await VehicleService.getAllVehicles();
      console.log('🚗 Refreshed vehicle data:', vehicleData);
      setVehicles(vehicleData);
      return vehicleData;
    } catch (err) {
      console.error('Error refreshing vehicles:', err);
      // Don't throw error, just log it
    }
  }, []);
  
  return {
    // Tank data
    tankLevel,
    tankCapacity,
    tankPercentage,
    externalRefills,
    
    // Quad fueling data
    quadFuelings,
    vehicles,
    
    // Status
    loading,
    error,
    success,
    
    // Operations for external refills
    addExternalRefill,
    updateExternalRefill,
    deleteExternalRefill,
    
    // Operations for quad fuelings
    addQuadFueling,
    updateQuadFueling,
    deleteQuadFueling,
    
    // Helper functions
    formatDate,
    getVehicleName,
    refreshVehicles,
    
    // Auth and permissions
    userRole,
    canEditDelete,
    
    // Error and success handling
    clearError,
    clearSuccess
  };
};

export default useFuel;