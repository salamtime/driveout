import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';

// Redux actions
import { setNotification } from '../store/slices/appSlice';
import { createRentalBooking } from '../store/slices/bookingsSlice';

// Payment components
import PaymentForm from '../components/payment/PaymentForm';
import PaymentStatus from '../components/payment/PaymentStatus';

const RentalBooking = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const dispatch = useDispatch();
  
  // Get vehicle id from query params if available
  const queryParams = new URLSearchParams(location.search);
  const preSelectedVehicleId = queryParams.get('vehicle') ? parseInt(queryParams.get('vehicle'), 10) : null;
  
  // Get redux state
  const { user, isAuthenticated } = useSelector((state) => state.auth);
  const { loading } = useSelector((state) => state.bookings);
  
  // Local state for the booking flow
  const [currentStep, setCurrentStep] = useState(1);
  const [paymentStatus, setPaymentStatus] = useState(null); // null, 'processing', 'success', 'failed'
  const [paymentResult, setPaymentResult] = useState(null);
  const [bookingData, setBookingData] = useState({
    rental_type: 'hourly', // hourly, daily, weekly
    city_id: null,
    location_id: null,
    vehicle_id: null,
    start_date: '',
    end_date: '',
    start_time: '10:00',
    duration: 1,
    total_price: 0,
    additional_requests: '',
    num_riders: 1,
    required_license: false,
    drop_off_type: 'location', // location, pickup
    pickup_location: '',
    drop_off_location: '',
    agree_to_fee: false,
    delivery_fee: 0
  });
  
  // Available cities
  const cities = [
    { id: 1, name: t('locations.marrakech') },
    { id: 2, name: t('locations.merzouga') },
    { id: 3, name: t('locations.agafay') }
  ];
  
  // Available locations (would be filtered by city in a real app)
  const locations = [
    { id: 1, city_id: 1, name: t('locations.medina'), fee: 50 },
    { id: 2, city_id: 1, name: t('locations.palmerie'), fee: 75 },
    { id: 3, city_id: 2, name: t('locations.desert_camp'), fee: 100 },
    { id: 4, city_id: 3, name: t('locations.desert_camp'), fee: 120 }
  ];
  
  // Steps for booking process
  const steps = [
    { id: 1, title: t('bookings.steps.locationSelection') },
    { id: 2, title: t('bookings.steps.vehicleSelection') },
    { id: 3, title: t('bookings.steps.bookingDetails') },
    { id: 4, title: t('bookings.steps.review') },
    { id: 5, title: t('bookings.steps.payment') },
    { id: 6, title: t('bookings.steps.confirmation') }
  ];
  
  // Filter locations by selected city
  const filteredLocations = bookingData.city_id
    ? locations.filter(loc => loc.city_id === bookingData.city_id)
    : [];
  
  // Available vehicles (in a real app, this would come from the API based on location)
  const vehicles = [
    { id: 1, name: 'Adventure ATV 250', power_cc: 250, max_riders: 2, hourly_price: 300, daily_price: 1500, weekly_price: 7000 },
    { id: 2, name: 'Explorer ATV 400', power_cc: 400, max_riders: 1, hourly_price: 400, daily_price: 2000, weekly_price: 9000 },
    { id: 3, name: 'Desert Quad 300', power_cc: 300, max_riders: 2, hourly_price: 350, daily_price: 1800, weekly_price: 8500 }
  ];
  
  // Handle pre-selected vehicle
  useEffect(() => {
    if (preSelectedVehicleId) {
      handleVehicleSelect(preSelectedVehicleId);
      // If we already have a vehicle, skip to step 1 (don't auto-advance)
      if (currentStep === 2) {
        setCurrentStep(2);
      }
    }
  }, [preSelectedVehicleId]);

  useEffect(() => {
    // Redirect to login if not authenticated and trying to complete booking
    if (!isAuthenticated && currentStep >= 4) {
      dispatch(setNotification({
        type: 'warning',
        message: t('booking.loginRequired')
      }));
      navigate('/auth', { state: { from: '/rental-booking' } });
    }
  }, [currentStep, isAuthenticated, dispatch, navigate, t]);

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setBookingData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };
  
  const handleCitySelect = (cityId) => {
    // Reset location when changing city
    setBookingData(prev => ({
      ...prev,
      city_id: cityId,
      location_id: null
    }));
  };
  
  const handleLocationSelect = (locationId) => {
    const selectedLocation = locations.find(loc => loc.id === locationId);
    setBookingData(prev => ({
      ...prev,
      location_id: locationId,
      delivery_fee: selectedLocation?.fee || 0
    }));
  };
  
  const handleVehicleSelect = (vehicleId) => {
    const selectedVehicle = vehicles.find(v => v.id === vehicleId);
    const priceKey = bookingData.rental_type === 'hourly' ? 'hourly_price' : 
                    bookingData.rental_type === 'daily' ? 'daily_price' : 'weekly_price';
    
    setBookingData(prev => ({
      ...prev,
      vehicle_id: vehicleId,
      total_price: calculateTotalPrice(selectedVehicle[priceKey], prev.rental_type, prev.duration)
    }));
  };
  
  const handleDropOffTypeChange = (type) => {
    setBookingData(prev => ({
      ...prev,
      drop_off_type: type
    }));
  };
  
  const calculateTotalPrice = (basePrice, rentalType, duration) => {
    let multiplier = 1;
    
    switch (rentalType) {
      case 'hourly':
        multiplier = duration;
        break;
      case 'daily':
        multiplier = duration;
        break;
      case 'weekly':
        multiplier = duration * 7;
        break;
      default:
        multiplier = 1;
    }
    
    return basePrice * multiplier;
  };
  
  const handleDurationChange = (e) => {
    const { value } = e.target;
    const selectedVehicle = vehicles.find(v => v.id === bookingData.vehicle_id);
    
    if (selectedVehicle) {
      const priceKey = bookingData.rental_type === 'hourly' ? 'hourly_price' : 
                      bookingData.rental_type === 'daily' ? 'daily_price' : 'weekly_price';
      
      setBookingData(prev => ({
        ...prev,
        duration: parseInt(value, 10),
        total_price: calculateTotalPrice(selectedVehicle[priceKey], prev.rental_type, parseInt(value, 10))
      }));
    } else {
      setBookingData(prev => ({
        ...prev,
        duration: parseInt(value, 10)
      }));
    }
  };
  
  const handleRentalTypeChange = (type) => {
    const selectedVehicle = vehicles.find(v => v.id === bookingData.vehicle_id);
    
    if (selectedVehicle) {
      const priceKey = type === 'hourly' ? 'hourly_price' : 
                      type === 'daily' ? 'daily_price' : 'weekly_price';
      
      setBookingData(prev => ({
        ...prev,
        rental_type: type,
        total_price: calculateTotalPrice(selectedVehicle[priceKey], type, prev.duration)
      }));
    } else {
      setBookingData(prev => ({
        ...prev,
        rental_type: type
      }));
    }
  };
  
  const nextStep = () => {
    if (currentStep < steps.length) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      setCurrentStep(currentStep + 1);
    }
  };
  
  const prevStep = () => {
    if (currentStep > 1) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      setCurrentStep(currentStep - 1);
    }
  };
  
  const handleSubmit = async () => {
    if (!isAuthenticated) {
      dispatch(setNotification({
        type: 'error',
        message: t('booking.loginRequired')
      }));
      return;
    }
    
    if (bookingData.drop_off_type === 'pickup' && !bookingData.agree_to_fee) {
      dispatch(setNotification({
        type: 'warning',
        message: t('booking.mustAgreeToFee')
      }));
      return;
    }
    
    const bookingPayload = {
      ...bookingData,
      user_email: user.email,
      payment_status: 'pending',
      // Format dates and times correctly
      start_datetime: `${bookingData.start_date}T${bookingData.start_time}:00`,
      end_datetime: bookingData.rental_type === 'hourly'
        ? new Date(new Date(`${bookingData.start_date}T${bookingData.start_time}:00`).getTime() + bookingData.duration * 60 * 60 * 1000).toISOString()
        : `${bookingData.end_date}T${bookingData.start_time}:00`
    };
    
    try {
      const result = await dispatch(createRentalBooking(bookingPayload)).unwrap();
      // Store booking result and move to payment step
      setBookingData(prevData => ({
        ...prevData,
        id: result.id // Save the booking ID for payment processing
      }));
      setCurrentStep(5); // Move to payment step
    } catch (error) {
      dispatch(setNotification({
        type: 'error',
        message: error || t('booking.errorCreating')
      }));
    }
  };
  
  // Handle payment completion
  const handlePaymentComplete = (result) => {
    setPaymentResult(result);
    setPaymentStatus('success');
    
    // Update booking with payment information
    if (result && result.status === 'succeeded') {
      // Update booking status in UI - backend updates are handled by the payment service
      dispatch(setNotification({
        type: 'success',
        message: t('booking.payment.paymentSuccessful')
      }));
    }
  };
  
  const renderLocationSelectionStep = () => (
    <div className="space-y-4 sm:space-y-6">
      <div className="bg-white p-4 sm:p-6 rounded-lg shadow-md">
        <h3 className="text-lg sm:text-xl font-semibold mb-3 sm:mb-4">{t('booking.selectCity')}</h3>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4 mb-6 sm:mb-8">
          {cities.map(city => (
            <div 
              key={city.id}
              className={`border rounded-md p-4 sm:p-6 cursor-pointer transition-all hover:shadow-md flex flex-col items-center justify-center text-center
                ${bookingData.city_id === city.id ? 'border-blue-500 bg-blue-50 shadow-md' : 'border-gray-200'}`}
              onClick={() => handleCitySelect(city.id)}
            >
              <h4 className="font-medium text-base sm:text-lg">{city.name}</h4>
            </div>
          ))}
        </div>
        
        {bookingData.city_id && (
          <>
            <h3 className="text-lg sm:text-xl font-semibold mb-3 sm:mb-4">{t('booking.selectPickupLocation')}</h3>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              {filteredLocations.map(location => (
                <div 
                  key={location.id}
                  className={`border rounded-md p-3 sm:p-4 cursor-pointer transition-all hover:shadow-md
                    ${bookingData.location_id === location.id ? 'border-blue-500 bg-blue-50 shadow' : 'border-gray-200'}`}
                  onClick={() => handleLocationSelect(location.id)}
                >
                  <h4 className="font-medium text-base">{location.name}</h4>
                  {location.fee > 0 && (
                    <div className="flex items-center justify-between mt-2">
                      <p className="text-xs sm:text-sm text-gray-500">{t('booking.deliveryFee')}:</p>
                      <span className="text-sm sm:text-base font-medium text-blue-500">{location.fee} MAD</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
      
      <div className="flex flex-col-reverse sm:flex-row sm:justify-between gap-3 sm:gap-0">
        <button 
          onClick={() => navigate('/')}
          className="w-full sm:w-auto px-4 sm:px-6 py-2 sm:py-3 border border-gray-300 rounded-md font-medium text-sm sm:text-base"
        >
          {t('common.cancel')}
        </button>
        <button 
          onClick={nextStep}
          disabled={!bookingData.location_id}
          className={`w-full sm:w-auto px-4 sm:px-6 py-2 sm:py-3 rounded-md font-medium text-sm sm:text-base ${!bookingData.location_id ? 
            'bg-gray-300 cursor-not-allowed' : 'bg-blue-500 text-white hover:bg-blue-600'}`}
        >
          {t('common.next')}
        </button>
      </div>
    </div>
  );
  
  const renderVehicleSelectionStep = () => (
    <div className="space-y-4 sm:space-y-6">
      <div className="bg-white p-4 sm:p-6 rounded-lg shadow-md">
        <h3 className="text-lg sm:text-xl font-semibold mb-3 sm:mb-4">{t('bookings.selectVehicle')}</h3>
        
        {vehicles.length === 0 ? (
          <p className="text-center text-gray-500 py-6 sm:py-10">{t('vehicles.noVehiclesAvailable')}</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
            {vehicles.map(vehicle => {
              const priceKey = bookingData.rental_type === 'hourly' ? 'hourly_price' : 
                bookingData.rental_type === 'daily' ? 'daily_price' : 'weekly_price';
              
              return (
                <div 
                  key={vehicle.id}
                  className={`border rounded-md overflow-hidden
                    ${bookingData.vehicle_id === vehicle.id ? 'border-blue-500 ring-2 ring-blue-500 shadow-md' : 'border-gray-200'}`}
                >
                  <div className="h-36 sm:h-48 bg-gray-200 relative">
                    {/* Placeholder for vehicle image */}
                    <div className="absolute inset-0 flex items-center justify-center bg-gray-300">
                      <span className="text-gray-500">{vehicle.name}</span>
                    </div>
                  </div>
                  
                  <div className="p-3 sm:p-4">
                    <h4 className="font-medium text-base sm:text-lg">{vehicle.name}</h4>
                    <div className="flex items-center text-gray-600 mt-1 text-xs sm:text-sm">
                      <span>{vehicle.power_cc} CC</span>
                      <span className="mx-2">•</span>
                      <span>{vehicle.max_riders} {t('vehicles.riders')}</span>
                    </div>
                    
                    <div className="mt-3 sm:mt-4">
                      <div className="flex justify-between mb-2">
                        <button
                          className={`px-2 sm:px-3 py-1 rounded-md text-xs sm:text-sm ${bookingData.rental_type === 'hourly' 
                            ? 'bg-blue-500 text-white' : 'bg-gray-200'}`}
                          onClick={() => handleRentalTypeChange('hourly')}
                        >
                          {t('booking.hourly')}
                        </button>
                        <button
                          className={`px-2 sm:px-3 py-1 rounded-md text-xs sm:text-sm ${bookingData.rental_type === 'daily' 
                            ? 'bg-blue-500 text-white' : 'bg-gray-200'}`}
                          onClick={() => handleRentalTypeChange('daily')}
                        >
                          {t('booking.daily')}
                        </button>
                        <button
                          className={`px-2 sm:px-3 py-1 rounded-md text-xs sm:text-sm ${bookingData.rental_type === 'weekly' 
                            ? 'bg-blue-500 text-white' : 'bg-gray-200'}`}
                          onClick={() => handleRentalTypeChange('weekly')}
                        >
                          {t('booking.weekly')}
                        </button>
                      </div>
                    </div>
                    
                    <div className="mt-2 sm:mt-3 font-semibold text-base sm:text-lg">
                      {vehicle[priceKey]} MAD 
                      <span className="text-xs sm:text-sm font-normal">
                        / {bookingData.rental_type === 'hourly' ? t('booking.hour') : 
                          bookingData.rental_type === 'daily' ? t('booking.day') : t('booking.week')}
                      </span>
                    </div>
                    
                    <button 
                      onClick={() => handleVehicleSelect(vehicle.id)}
                      className={`mt-2 sm:mt-3 w-full py-2 sm:py-3 rounded-md text-center font-medium text-xs sm:text-sm ${bookingData.vehicle_id === vehicle.id ? 
                        'bg-blue-600 text-white' : 'bg-blue-500 text-white hover:bg-blue-600'}`}
                    >
                      {bookingData.vehicle_id === vehicle.id ? t('vehicles.selected') : t('vehicles.select')}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      
      <div className="flex flex-col-reverse sm:flex-row sm:justify-between gap-3 sm:gap-0">
        <button 
          onClick={prevStep}
          className="w-full sm:w-auto px-4 sm:px-6 py-2 sm:py-3 border border-gray-300 rounded-md font-medium text-sm sm:text-base">
          {t('common.back')}
        </button>
        
        <button 
          onClick={nextStep}
          disabled={!bookingData.vehicle_id}
          className={`w-full sm:w-auto px-4 sm:px-6 py-2 sm:py-3 rounded-md font-medium text-sm sm:text-base ${!bookingData.vehicle_id ? 
            'bg-gray-300 cursor-not-allowed' : 'bg-blue-500 text-white hover:bg-blue-600'}`}>
          {t('common.next')}
        </button>
      </div>
    </div>
  );
  
  const renderBookingDetailsStep = () => (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-lg shadow-md">
        <h3 className="text-xl font-semibold mb-4">{t('booking.rentalDetails')}</h3>
        
        <div className="space-y-4">
          <div>
            <label className="block text-gray-700 mb-2 font-medium">{t('booking.pickupDate')}</label>
            <input
              type="date"
              name="start_date"
              value={bookingData.start_date}
              onChange={handleInputChange}
              min={new Date().toISOString().split('T')[0]}
              className="w-full p-3 border rounded-md text-lg"
              required
            />
          </div>
          
          <div>
            <label className="block text-gray-700 mb-2 font-medium">{t('booking.pickupTime')}</label>
            <input
              type="time"
              name="start_time"
              value={bookingData.start_time}
              onChange={handleInputChange}
              className="w-full p-3 border rounded-md text-lg"
              required
            />
          </div>
          
          <div>
            <label className="block text-gray-700 mb-2 font-medium">{t('booking.duration')}</label>
            {bookingData.rental_type === 'hourly' && (
              <select
                name="duration"
                value={bookingData.duration}
                onChange={handleDurationChange}
                className="w-full p-3 border rounded-md text-lg"
                required
              >
                {[1, 2, 3, 4, 6, 8].map(hours => (
                  <option key={hours} value={hours}>{hours} {hours === 1 ? t('booking.hour') : t('booking.hours')}</option>
                ))}
              </select>
            )}
            
            {bookingData.rental_type === 'daily' && (
              <select
                name="duration"
                value={bookingData.duration}
                onChange={handleDurationChange}
                className="w-full p-3 border rounded-md text-lg"
                required
              >
                {[1, 2, 3, 4, 5, 6].map(days => (
                  <option key={days} value={days}>{days} {days === 1 ? t('booking.day') : t('booking.days')}</option>
                ))}
              </select>
            )}
            
            {bookingData.rental_type === 'weekly' && (
              <select
                name="duration"
                value={bookingData.duration}
                onChange={handleDurationChange}
                className="w-full p-3 border rounded-md text-lg"
                required
              >
                {[1, 2, 3, 4].map(weeks => (
                  <option key={weeks} value={weeks}>{weeks} {weeks === 1 ? t('booking.week') : t('booking.weeks')}</option>
                ))}
              </select>
            )}
          </div>
        </div>
      </div>
      
      <div className="bg-white p-6 rounded-lg shadow-md">
        <h3 className="text-xl font-semibold mb-4">{t('booking.dropOffMethod')}</h3>
        
        <div className="space-y-4">
          <div className="flex flex-col space-y-4">
            <div 
              className={`border rounded-md p-4 cursor-pointer transition-all hover:shadow-md
                ${bookingData.drop_off_type === 'location' ? 'border-blue-500 bg-blue-50 shadow' : 'border-gray-200'}`}
              onClick={() => handleDropOffTypeChange('location')}
            >
              <div className="flex items-center">
                <div className="h-6 w-6 rounded-full border-2 border-blue-500 flex items-center justify-center mr-3">
                  {bookingData.drop_off_type === 'location' && (
                    <div className="h-3 w-3 rounded-full bg-blue-500" />
                  )}
                </div>
                <h4 className="font-medium">{t('booking.returnToLocation')}</h4>
              </div>
              <p className="text-gray-600 mt-2 ml-9">{t('booking.returnToLocationDesc')}</p>
            </div>
            
            <div 
              className={`border rounded-md p-4 cursor-pointer transition-all hover:shadow-md
                ${bookingData.drop_off_type === 'pickup' ? 'border-blue-500 bg-blue-50 shadow' : 'border-gray-200'}`}
              onClick={() => handleDropOffTypeChange('pickup')}
            >
              <div className="flex items-center">
                <div className="h-6 w-6 rounded-full border-2 border-blue-500 flex items-center justify-center mr-3">
                  {bookingData.drop_off_type === 'pickup' && (
                    <div className="h-3 w-3 rounded-full bg-blue-500" />
                  )}
                </div>
                <h4 className="font-medium">{t('booking.requestPickup')}</h4>
              </div>
              <p className="text-gray-600 mt-2 ml-9">{t('booking.requestPickupDesc')}</p>
              
              {bookingData.drop_off_type === 'pickup' && (
                <div className="mt-4 ml-9 p-3 bg-gray-50 rounded-md border border-gray-200">
                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id="agree_fee"
                      name="agree_to_fee"
                      checked={bookingData.agree_to_fee}
                      onChange={handleInputChange}
                      className="h-5 w-5 text-blue-600"
                    />
                    <label htmlFor="agree_fee" className="text-sm">
                      {t('booking.agreeToFee', { fee: bookingData.delivery_fee })}
                    </label>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      
      <div className="bg-white p-6 rounded-lg shadow-md">
        <h3 className="text-xl font-semibold mb-4">{t('booking.additionalInfo')}</h3>
        
        <div className="space-y-4">
          <div>
            <label className="block text-gray-700 mb-2 font-medium">{t('booking.numberOfRiders')}</label>
            <select
              name="num_riders"
              value={bookingData.num_riders}
              onChange={handleInputChange}
              className="w-full p-3 border rounded-md text-lg"
            >
              {[1, 2].map(num => (
                <option key={num} value={num}>{num} {num === 1 ? t('vehicles.rider') : t('vehicles.riders')}</option>
              ))}
            </select>
          </div>
          
          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="license_check"
              name="required_license"
              checked={bookingData.required_license}
              onChange={handleInputChange}
              className="h-5 w-5 text-blue-600"
            />
            <label htmlFor="license_check" className="font-medium">
              {t('booking.hasValidLicense')}
            </label>
          </div>
          
          <div>
            <label className="block text-gray-700 mb-2 font-medium">{t('booking.additionalRequests')} ({t('common.optional')})</label>
            <textarea
              name="additional_requests"
              value={bookingData.additional_requests}
              onChange={handleInputChange}
              placeholder={t('booking.additionalRequestsPlaceholder')}
              className="w-full p-3 border rounded-md text-lg"
              rows="3"
            />
          </div>
        </div>
      </div>
      
      <div className="flex justify-between">
        <button 
          onClick={prevStep}
          className="px-6 py-3 border border-gray-300 rounded-md font-medium">
          {t('common.back')}
        </button>
        
        <button 
          onClick={nextStep}
          disabled={!bookingData.start_date || !bookingData.required_license || (bookingData.drop_off_type === 'pickup' && !bookingData.agree_to_fee)}
          className={`px-6 py-3 rounded-md font-medium text-lg ${!bookingData.start_date || !bookingData.required_license || (bookingData.drop_off_type === 'pickup' && !bookingData.agree_to_fee) ? 
            'bg-gray-300 cursor-not-allowed' : 'bg-blue-500 text-white hover:bg-blue-600'}`}>
          {t('common.next')}
        </button>
      </div>
    </div>
  );
  
  const renderReviewStep = () => {
    const selectedVehicle = vehicles.find(v => v.id === bookingData.vehicle_id) || {};
    const selectedCity = cities.find(c => c.id === bookingData.city_id) || {};
    const selectedLocation = locations.find(l => l.id === bookingData.location_id) || {};
    
    // Calculate end date/time based on duration
    let endDateTime;
    if (bookingData.start_date) {
      const startDate = new Date(`${bookingData.start_date}T${bookingData.start_time}`);
      
      if (bookingData.rental_type === 'hourly') {
        endDateTime = new Date(startDate.getTime() + bookingData.duration * 60 * 60 * 1000);
      } else if (bookingData.rental_type === 'daily') {
        endDateTime = new Date(startDate.getTime() + bookingData.duration * 24 * 60 * 60 * 1000);
      } else { // weekly
        endDateTime = new Date(startDate.getTime() + bookingData.duration * 7 * 24 * 60 * 60 * 1000);
      }
    }
    
    const formatDateTime = (date) => {
      if (!date) return '';
      return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    };
    
    return (
      <div className="space-y-6">
        <div className="bg-white p-6 rounded-lg shadow-md">
          <h3 className="text-xl font-semibold mb-4">{t('booking.reviewBooking')}</h3>
          
          <div className="space-y-6">
            <div className="border-b pb-4">
              <h4 className="font-medium text-lg mb-2">{t('booking.locationDetails')}</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <p className="text-gray-600">{t('booking.city')}</p>
                  <p className="font-medium">{selectedCity.name}</p>
                </div>
                <div>
                  <p className="text-gray-600">{t('booking.pickupLocation')}</p>
                  <p className="font-medium">{selectedLocation.name}</p>
                </div>
              </div>
            </div>
            
            <div className="border-b pb-4">
              <h4 className="font-medium text-lg mb-2">{t('booking.vehicleDetails')}</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <p className="text-gray-600">{t('vehicles.vehicle')}</p>
                  <p className="font-medium">{selectedVehicle.name}</p>
                </div>
                <div>
                  <p className="text-gray-600">{t('vehicles.specifications')}</p>
                  <p className="font-medium">{selectedVehicle.power_cc} CC • {selectedVehicle.max_riders} {t('vehicles.riders')}</p>
                </div>
              </div>
            </div>
            
            <div className="border-b pb-4">
              <h4 className="font-medium text-lg mb-2">{t('booking.rentalDetails')}</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <p className="text-gray-600">{t('booking.rentalType')}</p>
                  <p className="font-medium">
                    {bookingData.rental_type === 'hourly' ? t('booking.hourlyRental') :
                      bookingData.rental_type === 'daily' ? t('booking.dailyRental') : t('booking.weeklyRental')}
                  </p>
                </div>
                <div>
                  <p className="text-gray-600">{t('booking.duration')}</p>
                  <p className="font-medium">
                    {bookingData.duration} {' '}
                    {bookingData.rental_type === 'hourly' ? 
                      (bookingData.duration === 1 ? t('booking.hour') : t('booking.hours')) :
                    bookingData.rental_type === 'daily' ? 
                      (bookingData.duration === 1 ? t('booking.day') : t('booking.days')) :
                      (bookingData.duration === 1 ? t('booking.week') : t('booking.weeks'))}
                  </p>
                </div>
                <div>
                  <p className="text-gray-600">{t('booking.pickupDateTime')}</p>
                  <p className="font-medium">{bookingData.start_date} {bookingData.start_time}</p>
                </div>
                <div>
                  <p className="text-gray-600">{t('booking.returnDateTime')}</p>
                  <p className="font-medium">{formatDateTime(endDateTime)}</p>
                </div>
                <div className="md:col-span-2">
                  <p className="text-gray-600">{t('booking.dropOffMethod')}</p>
                  <p className="font-medium">
                    {bookingData.drop_off_type === 'location' ? 
                      t('booking.returnToLocation') : t('booking.requestPickup')}
                  </p>
                </div>
              </div>
            </div>
            
            <div className="border-b pb-4">
              <h4 className="font-medium text-lg mb-2">{t('booking.additionalInfo')}</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <p className="text-gray-600">{t('booking.numberOfRiders')}</p>
                  <p className="font-medium">{bookingData.num_riders}</p>
                </div>
                <div>
                  <p className="text-gray-600">{t('booking.validLicense')}</p>
                  <p className="font-medium">{bookingData.required_license ? t('common.yes') : t('common.no')}</p>
                </div>
                {bookingData.additional_requests && (
                  <div className="md:col-span-2">
                    <p className="text-gray-600">{t('booking.additionalRequests')}</p>
                    <p className="font-medium">{bookingData.additional_requests}</p>
                  </div>
                )}
              </div>
            </div>
            
            <div>
              <h4 className="font-medium text-lg mb-2">{t('booking.pricingSummary')}</h4>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <p>{t('booking.basePrice')}</p>
                  <p>{bookingData.total_price} MAD</p>
                </div>
                
                {bookingData.drop_off_type === 'pickup' && bookingData.delivery_fee > 0 && (
                  <div className="flex justify-between">
                    <p>{t('booking.pickupFee')}</p>
                    <p>{bookingData.delivery_fee} MAD</p>
                  </div>
                )}
                
                <div className="flex justify-between font-semibold text-lg pt-2 border-t">
                  <p>{t('booking.totalPrice')}</p>
                  <p>
                    {bookingData.total_price + 
                      (bookingData.drop_off_type === 'pickup' ? bookingData.delivery_fee : 0)} MAD
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
        
        <div className="flex justify-between">
          <button 
            onClick={prevStep}
            className="px-6 py-3 border border-gray-300 rounded-md font-medium">
            {t('common.back')}
          </button>
          
          <button 
            onClick={handleSubmit}
            disabled={loading}
            className="px-6 py-3 bg-blue-500 text-white rounded-md font-medium text-lg hover:bg-blue-600 disabled:bg-blue-300">
            {loading ? t('common.processing') : t('booking.confirmBooking')}
          </button>
        </div>
      </div>
    );
  };
  
  const renderConfirmationStep = () => (
    <div className="space-y-6">
      <div className="bg-white p-8 rounded-lg shadow-md text-center">
        <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <svg className="w-10 h-10 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
          </svg>
        </div>
        
        <h3 className="text-2xl font-bold mb-2">{t('booking.bookingConfirmed')}</h3>
        <p className="text-gray-600 mb-6">{t('booking.bookingConfirmedDesc')}</p>
        
        <div className="mb-8 p-4 bg-blue-50 border border-blue-200 rounded-md text-center">
          <p className="font-medium text-blue-800">{t('booking.bookingReference')}: SX-{Math.floor(Math.random() * 10000)}</p>
        </div>
        
        <div className="space-y-4">
          <button
            onClick={() => navigate('/')}
            className="w-full px-6 py-3 bg-blue-500 text-white rounded-md font-medium hover:bg-blue-600"
          >
            {t('common.backToHome')}
          </button>
          
          <button
            onClick={() => navigate('/profile/bookings')}
            className="w-full px-6 py-3 border border-gray-300 rounded-md font-medium"
          >
            {t('booking.viewMyBookings')}
          </button>
        </div>
      </div>
    </div>
  );

  // Render payment step
  const renderPaymentStep = () => (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-lg shadow-md">
        <h3 className="text-xl font-semibold mb-4">{t('booking.payment')}</h3>
        
        {paymentStatus === 'success' ? (
          <PaymentStatus 
            status="succeeded"
            bookingId={bookingData.id}
            totalAmount={bookingData.total_price + (bookingData.drop_off_type === 'pickup' ? bookingData.delivery_fee : 0)}
            onComplete={() => setCurrentStep(6)}
          />
        ) : paymentStatus === 'failed' ? (
          <PaymentStatus 
            status="failed"
            onComplete={() => setPaymentStatus(null)}
          />
        ) : paymentStatus === 'processing' ? (
          <PaymentStatus status="processing" />
        ) : (
          <PaymentForm 
            booking={{
              id: bookingData.id, 
              totalPrice: bookingData.total_price + (bookingData.drop_off_type === 'pickup' ? bookingData.delivery_fee : 0),
              type: 'rental',
              user_email: user?.email
            }}
            onPaymentComplete={handlePaymentComplete}
          />
        )}
      </div>
      
      <div className="flex justify-between">
        <button 
          onClick={prevStep}
          disabled={paymentStatus === 'processing'}
          className="px-6 py-3 border border-gray-300 rounded-md font-medium disabled:opacity-50">
          {t('common.back')}
        </button>
        
        {paymentStatus === 'success' && (
          <button 
            onClick={() => setCurrentStep(6)}
            className="px-6 py-3 bg-blue-500 text-white rounded-md font-medium text-lg hover:bg-blue-600">
            {t('common.next')}
          </button>
        )}
      </div>
    </div>
  );

  // Render the step content based on current step
  const renderStep = () => {
    switch (currentStep) {
      case 1:
        return renderLocationSelectionStep();
      case 2:
        return renderVehicleSelectionStep();
      case 3:
        return renderBookingDetailsStep();
      case 4:
        return renderReviewStep();
      case 5:
        return renderPaymentStep();
      case 6:
        return renderConfirmationStep();
      default:
        return renderLocationSelectionStep();
    }
  };

  return (
    <div className="container mx-auto py-4 sm:py-6 px-3 sm:px-4 max-w-6xl">
      {/* Progress Steps */}
      <div className="mb-6 sm:mb-8">
        <div className="flex justify-between items-center">
          {steps.map((step) => (
            <div 
              key={step.id} 
              className={`flex flex-col items-center ${currentStep >= step.id ? 'text-blue-500' : 'text-gray-400'} flex-1`}
            >
              <div className={`h-6 w-6 sm:h-8 sm:w-8 rounded-full flex items-center justify-center ${currentStep >= step.id ? 'bg-blue-500 text-white' : 'bg-gray-200'} mb-1 sm:mb-2 text-xs sm:text-sm`}>
                {step.id}
              </div>
              <div className="text-xs sm:text-sm text-center hidden sm:block">{step.title}</div>
            </div>
          ))}
        </div>
        <div className="flex mt-1 sm:mt-2 mb-3 sm:mb-4">
          {steps.slice(0, -1).map((step) => (
            <div key={`line-${step.id}`} className="flex-1">
              <div className={`h-1 ${currentStep > step.id ? 'bg-blue-500' : 'bg-gray-200'}`}></div>
            </div>
          ))}
        </div>
      </div>

      {/* Current Step Title - Mobile Only */}
      <div className="block sm:hidden mb-4">
        <h2 className="text-xl font-semibold text-center">{steps[currentStep-1]?.title}</h2>
      </div>

      {/* Main Content */}
      <div className="pb-6 sm:pb-10">
        {renderStep()}
      </div>
    </div>
  );
};

export default RentalBooking;
