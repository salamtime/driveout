import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useDispatch, useSelector } from 'react-redux';
import { fetchVehicles } from '../../store/slices/vehiclesSlice';
import { supabase } from '../../utils/supabaseClient';

const VehicleStep = ({ bookingData, updateBookingData, onNext, onPrevious }) => {
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const { vehicles, isLoading } = useSelector(state => state.vehicles);
  const [availableVehicles, setAvailableVehicles] = useState([]);
  const [errors, setErrors] = useState({});
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  
  const [localData, setLocalData] = useState({
    vehicleId: bookingData.vehicleId || null,
    selectedVehicle: null,
    startDate: bookingData.startDate || null,
    endDate: bookingData.endDate || null,
    totalPrice: bookingData.totalPrice || 0
  });
  
  // Fetch vehicles on component mount
  useEffect(() => {
    const filters = {};
    
    if (bookingData.pickupLocationId) {
      filters.locationId = bookingData.pickupLocationId;
    }
    
    dispatch(fetchVehicles(filters));
  }, [dispatch, bookingData.pickupLocationId]);
  
  // Calculate rental dates based on rental type and duration
  useEffect(() => {
    const now = new Date();
    const start = new Date(now);
    start.setHours(10, 0, 0, 0); // 10:00 AM
    
    const end = new Date(start);
    
    // Calculate end date based on rental type and duration
    switch (bookingData.rentalType) {
      case 'hourly':
        end.setHours(start.getHours() + bookingData.duration);
        break;
      case 'daily':
        end.setDate(start.getDate() + bookingData.duration);
        break;
      case 'weekly':
        end.setDate(start.getDate() + (bookingData.duration * 7));
        break;
      case 'monthly':
        end.setMonth(start.getMonth() + bookingData.duration);
        break;
      default:
        break;
    }
    
    setStartDate(start.toISOString().split('T')[0]);
    setEndDate(end.toISOString().split('T')[0]);
    
    setLocalData(prev => ({
      ...prev,
      startDate: start,
      endDate: end
    }));
    
  }, [bookingData.rentalType, bookingData.duration]);
  
  // Check availability of vehicles for the selected dates
  useEffect(() => {
    const checkAvailability = async () => {
      if (!vehicles.length || !localData.startDate || !localData.endDate) return;
      
      const startDateStr = localData.startDate.toISOString();
      const endDateStr = localData.endDate.toISOString();
      
      try {
        // In a real implementation, this would be a more sophisticated query
        // Here we're doing a simple check
        const { data, error } = await supabase
          .from('saharax_0u4w4d_bookings')
          .select('vehicle_id')
          .or(`start_date.lte.${endDateStr},end_date.gte.${startDateStr}`)
          .in('status', ['confirmed', 'in_progress']);
        
        if (error) throw error;
        
        // Extract vehicle IDs that are already booked
        const bookedVehicleIds = data.map(booking => booking.vehicle_id);
        
        // Filter out booked vehicles
        const available = vehicles.filter(vehicle => !bookedVehicleIds.includes(vehicle.id));
        setAvailableVehicles(available);
        
        // If we have a preselected vehicle ID, check if it's still available
        if (bookingData.vehicleId) {
          // Added defensive check for available array
          const isStillAvailable = available && available.some(v => v.id === bookingData.vehicleId);
          if (isStillAvailable) {
            const preselected = available.find(v => v.id === bookingData.vehicleId);
            setLocalData(prev => ({
              ...prev,
              vehicleId: bookingData.vehicleId,
              selectedVehicle: preselected,
              totalPrice: calculatePrice(preselected)
            }));
          } else {
            // Clear the selection if the preselected vehicle is not available
            setLocalData(prev => ({
              ...prev,
              vehicleId: null,
              selectedVehicle: null
            }));
          }
        }
      } catch (error) {
        console.error("Error checking vehicle availability:", error);
        // Fall back to showing all vehicles if the check fails
        setAvailableVehicles(vehicles);
      }
    };
    
    checkAvailability();
  }, [vehicles, localData.startDate, localData.endDate, bookingData.vehicleId]);
  
  const handleVehicleSelect = (vehicle) => {
    setLocalData(prev => ({
      ...prev,
      vehicleId: vehicle.id,
      selectedVehicle: vehicle,
      totalPrice: calculatePrice(vehicle)
    }));
    setErrors({});
  };
  
  const calculatePrice = (vehicle) => {
    if (!vehicle) return 0;
    
    let baseRate;
    let duration = bookingData.duration;
    
    switch (bookingData.rentalType) {
      case 'hourly':
        baseRate = vehicle.hourly_rate;
        break;
      case 'daily':
        baseRate = vehicle.daily_rate || (vehicle.hourly_rate * 8); // Fallback calculation
        duration = bookingData.duration;
        break;
      case 'weekly':
        baseRate = vehicle.weekly_rate || (vehicle.daily_rate * 6); // Fallback calculation
        duration = bookingData.duration;
        break;
      case 'monthly':
        baseRate = vehicle.monthly_rate || (vehicle.weekly_rate * 3.5); // Fallback calculation
        duration = bookingData.duration;
        break;
      default:
        baseRate = vehicle.hourly_rate;
    }
    
    let total = baseRate * duration;
    
    // Add delivery fee if applicable
    if (bookingData.deliveryRequired) {
      total += bookingData.deliveryFee || 0;
    }
    
    return Math.round(total * 100) / 100; // Round to 2 decimal places
  };
  
  const handleSubmit = () => {
    if (!localData.vehicleId) {
      setErrors({ vehicle: 'Please select a vehicle' });
      return;
    }
    
    updateBookingData({
      vehicleId: localData.vehicleId,
      selectedVehicle: localData.selectedVehicle,
      startDate: localData.startDate,
      endDate: localData.endDate,
      totalPrice: localData.totalPrice
    });
    
    onNext();
  };
  
  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }
  
  return (
    <div className="vehicle-step">
      <h2 className="text-2xl font-semibold mb-6">{t('rental.steps.vehicle')}</h2>
      
      <div className="mb-6">
        <div className="flex justify-between items-center bg-gray-100 p-4 rounded-lg">
          <div>
            <div className="text-gray-700">{t('rental.duration.label')}</div>
            <div className="font-medium">
              {bookingData.duration} {bookingData.rentalType === 'hourly' 
                ? t('rental.duration.hours') 
                : bookingData.rentalType === 'daily' 
                  ? t('rental.duration.days')
                  : bookingData.rentalType === 'weekly'
                    ? t('rental.duration.weeks')
                    : t('rental.duration.months')}
            </div>
          </div>
          <div>
            <div className="text-gray-700">{t('rental.location.pickup')}</div>
            <div className="font-medium">
              {bookingData.deliveryRequired 
                ? t('rental.location.delivery') 
                : bookingData.pickupLocation?.name || 'Selected Location'}
            </div>
          </div>
          <div>
            <div className="text-gray-700">{t('rental.vehicle.price')}</div>
            <div className="font-medium">
              {localData.totalPrice > 0 ? `$${localData.totalPrice}` : '-'}
            </div>
          </div>
        </div>
      </div>
      
      <div className="mb-6">
        <div className="flex justify-between mb-4">
          <h3 className="font-semibold text-lg">{t('rental.steps.vehicle')}</h3>
          <div className="text-gray-700">
            {startDate} - {endDate}
          </div>
        </div>
        
        {availableVehicles.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-gray-500">No vehicles available for the selected dates and location.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {availableVehicles.map(vehicle => (
              <div 
                key={vehicle.id}
                className={`
                  border rounded-lg overflow-hidden cursor-pointer transition-all
                  ${localData.vehicleId === vehicle.id 
                    ? 'border-blue-500 ring-2 ring-blue-500' 
                    : 'border-gray-300 hover:border-blue-300'}
                `}
                onClick={() => handleVehicleSelect(vehicle)}
              >
                <div className="h-40 bg-gray-200">
                  <img 
                    src={vehicle.image_url || '/assets/images/atv-placeholder.jpg'} 
                    alt={vehicle.model} 
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="p-4">
                  <h4 className="font-bold">{vehicle.model}</h4>
                  <div className="flex justify-between mt-2">
                    <span className="text-gray-700">
                      {vehicle.power_cc}cc
                    </span>
                    <span className="text-gray-700">
                      {vehicle.capacity} {t('tours.people')}
                    </span>
                  </div>
                  <div className="flex justify-between items-center mt-4">
                    <span className="font-medium">
                      {bookingData.rentalType === 'hourly' && `$${vehicle.hourly_rate}/${t('rental.duration.hours')}`}
                      {bookingData.rentalType === 'daily' && `$${vehicle.daily_rate || (vehicle.hourly_rate * 8)}/${t('rental.duration.days')}`}
                      {bookingData.rentalType === 'weekly' && `$${vehicle.weekly_rate || (vehicle.daily_rate * 6)}/${t('rental.duration.weeks')}`}
                      {bookingData.rentalType === 'monthly' && `$${vehicle.monthly_rate || (vehicle.weekly_rate * 3.5)}/${t('rental.duration.months')}`}
                    </span>
                    <span className="text-blue-500 font-bold">
                      ${calculatePrice(vehicle)}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
        
        {errors.vehicle && (
          <p className="text-red-500 text-sm mt-2">{errors.vehicle}</p>
        )}
      </div>
      
      <div className="flex justify-between mt-8">
        <button
          type="button"
          onClick={onPrevious}
          className="px-6 py-3 bg-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-400 transition-colors"
        >
          {t('rental.buttons.back')}
        </button>
        
        <button
          type="button"
          onClick={handleSubmit}
          className="px-6 py-3 bg-blue-500 text-white font-medium rounded-lg hover:bg-blue-600 transition-colors"
          disabled={availableVehicles.length === 0}
        >
          {t('rental.buttons.next')}
        </button>
      </div>
    </div>
  );
};

export default VehicleStep;