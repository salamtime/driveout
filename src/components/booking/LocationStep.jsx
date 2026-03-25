import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../utils/supabaseClient';

const LocationStep = ({ bookingData, updateBookingData, onNext, onPrevious }) => {
  const { t } = useTranslation();
  const [errors, setErrors] = useState({});
  const [locations, setLocations] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  
  const [localData, setLocalData] = useState({
    pickupLocationId: bookingData.pickupLocationId || null,
    deliveryRequired: bookingData.deliveryRequired || false,
    deliveryLocation: bookingData.deliveryLocation || null,
    deliveryAddress: bookingData.deliveryAddress || '',
    deliveryFee: bookingData.deliveryFee || 0
  });
  
  // Fetch locations on component mount
  useEffect(() => {
    const fetchLocations = async () => {
      setIsLoading(true);
      try {
        // In a real implementation, replace with actual table name from system design
        const { data, error } = await supabase
          .from('saharax_0u4w4d_locations')
          .select('*');
          
        if (error) {
          throw error;
        }
        
        if (data) {
          setLocations(data);
          
          // If we have a preselected location ID but no data,
          // and the location exists in our fetched data, set it
          if (bookingData.pickupLocationId && !localData.pickupLocation) {
            const preselectedLocation = data.find(loc => loc.id === bookingData.pickupLocationId);
            if (preselectedLocation) {
              setLocalData(prev => ({
                ...prev,
                pickupLocation: preselectedLocation
              }));
            }
          }
        }
      } catch (error) {
        console.error("Error fetching locations:", error);
        // For demo purposes, use sample data if API call fails
        const sampleLocations = [
          { id: 1, name: 'Marrakech Center', address: '123 Main St, Marrakech', coordinates: {lat: 31.6295, lng: -7.9811} },
          { id: 2, name: 'Agadir Beach', address: '45 Beach Rd, Agadir', coordinates: {lat: 30.4278, lng: -9.5981} },
          { id: 3, name: 'Merzouga Desert', address: 'Desert Entrance, Merzouga', coordinates: {lat: 31.0914, lng: -4.0096} }
        ];
        setLocations(sampleLocations);
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchLocations();
  }, [bookingData.pickupLocationId]);

  const handlePickupLocationChange = (locationId) => {
    const selectedLocation = locations.find(loc => loc.id === parseInt(locationId, 10));
    setLocalData(prev => ({ 
      ...prev, 
      pickupLocationId: parseInt(locationId, 10),
      pickupLocation: selectedLocation
    }));
    setErrors(prev => ({ ...prev, pickupLocation: null }));
  };
  
  const handleDeliveryToggle = () => {
    setLocalData(prev => ({ 
      ...prev, 
      deliveryRequired: !prev.deliveryRequired,
      // Reset delivery location data when toggled off
      ...(!prev.deliveryRequired ? {} : { deliveryLocation: null, deliveryAddress: '', deliveryFee: 0 })
    }));
  };
  
  const handleDeliveryAddressChange = (e) => {
    setLocalData(prev => ({ 
      ...prev, 
      deliveryAddress: e.target.value 
    }));
    
    // For demo, calculate a simple delivery fee based on address length
    // In real implementation, this would use Google Maps API for distance calculation
    const mockDeliveryFee = Math.max(5, Math.min(e.target.value.length, 20));
    setLocalData(prev => ({ ...prev, deliveryFee: mockDeliveryFee }));
    
    setErrors(prev => ({ ...prev, deliveryAddress: null }));
  };
  
  const validateForm = () => {
    const newErrors = {};
    
    if (!localData.pickupLocationId && !localData.deliveryRequired) {
      newErrors.pickupLocation = 'Please select a pickup location';
    }
    
    if (localData.deliveryRequired && !localData.deliveryAddress.trim()) {
      newErrors.deliveryAddress = 'Please provide a delivery address';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };
  
  const handleSubmit = () => {
    if (validateForm()) {
      updateBookingData(localData);
      onNext();
    }
  };
  
  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }
  
  return (
    <div className="location-step">
      <h2 className="text-2xl font-semibold mb-6">{t('rental.steps.location')}</h2>
      
      <div className="flex flex-col md:flex-row gap-4 mb-8">
        <div
          className={`
            flex-1 p-4 border rounded-lg cursor-pointer transition-all
            ${!localData.deliveryRequired ? 'bg-blue-500 text-white border-blue-500' : 'bg-white border-gray-300'}
          `}
          onClick={() => setLocalData(prev => ({ ...prev, deliveryRequired: false }))}
        >
          <div className="font-medium">{t('rental.location.pickup')}</div>
          <p className="text-sm mt-1">
            {!localData.deliveryRequired ? 'Select a pickup location below' : 'Pick up your ATV at one of our locations'}
          </p>
        </div>
        
        <div
          className={`
            flex-1 p-4 border rounded-lg cursor-pointer transition-all
            ${localData.deliveryRequired ? 'bg-blue-500 text-white border-blue-500' : 'bg-white border-gray-300'}
          `}
          onClick={() => setLocalData(prev => ({ ...prev, deliveryRequired: true }))}
        >
          <div className="font-medium">{t('rental.location.delivery')}</div>
          <p className="text-sm mt-1">
            {localData.deliveryRequired ? 'Enter your delivery address below' : 'Get your ATV delivered to your location'}
          </p>
        </div>
      </div>
      
      {!localData.deliveryRequired ? (
        <div className="mb-6">
          <label className="block text-gray-700 font-medium mb-2">
            {t('rental.location.pickupPoint')}
          </label>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {locations.map(location => (
              <div 
                key={location.id}
                className={`
                  p-4 border rounded-lg cursor-pointer transition-all
                  ${localData.pickupLocationId === location.id 
                    ? 'bg-blue-100 border-blue-500' 
                    : 'bg-white border-gray-300 hover:border-blue-300'}
                `}
                onClick={() => handlePickupLocationChange(location.id)}
              >
                <div className="font-medium">{location.name}</div>
                <p className="text-sm text-gray-600 mt-1">{location.address}</p>
              </div>
            ))}
          </div>
          {errors.pickupLocation && (
            <p className="text-red-500 text-sm mt-1">{errors.pickupLocation}</p>
          )}
        </div>
      ) : (
        <div className="mb-6">
          <label className="block text-gray-700 font-medium mb-2" htmlFor="deliveryAddress">
            {t('rental.location.deliveryLocation')}
          </label>
          <textarea
            id="deliveryAddress"
            value={localData.deliveryAddress}
            onChange={handleDeliveryAddressChange}
            className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            rows="3"
            placeholder="Enter your full address for delivery"
          ></textarea>
          {errors.deliveryAddress && (
            <p className="text-red-500 text-sm mt-1">{errors.deliveryAddress}</p>
          )}
          
          {localData.deliveryAddress && (
            <div className="mt-4 p-3 bg-gray-100 rounded-lg">
              <div className="flex justify-between items-center">
                <span className="text-gray-700">{t('rental.location.deliveryFee')}:</span>
                <span className="font-medium">${localData.deliveryFee}</span>
              </div>
            </div>
          )}
        </div>
      )}
      
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
        >
          {t('rental.buttons.next')}
        </button>
      </div>
    </div>
  );
};

export default LocationStep;