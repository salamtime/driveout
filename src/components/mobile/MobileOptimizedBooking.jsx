import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useDispatch, useSelector } from 'react-redux';
import { 
  Calendar, 
  Clock, 
  MapPin, 
  Users, 
  CreditCard, 
  ChevronLeft, 
  ChevronRight,
  Check,
  AlertCircle,
  Loader2
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { createBooking } from '../../store/slices/bookingsSlice';
import { fetchVehicles } from '../../store/slices/vehiclesSlice';
import PerformanceMonitor from '../../utils/PerformanceMonitor';
import CacheService from '../../services/CacheService';

const MobileOptimizedBooking = ({ onComplete, onCancel }) => {
  const { t } = useTranslation();
  const dispatch = useDispatch();
  
  // Redux state
  const { vehicles, loading: vehiclesLoading } = useSelector(state => state.vehicles);
  const { loading: bookingLoading } = useSelector(state => state.bookings);
  
  // Local state
  const [currentStep, setCurrentStep] = useState(0);
  const [bookingData, setBookingData] = useState({
    tour_type: '',
    vehicle_id: '',
    date: '',
    time: '',
    duration: 2,
    group_size: 1,
    customer_name: '',
    customer_email: '',
    customer_phone: '',
    special_requests: '',
    payment_method: 'card'
  });
  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [touchStart, setTouchStart] = useState(null);
  const [touchEnd, setTouchEnd] = useState(null);
  
  const cache = useRef(new CacheService('mobile_booking'));
  const stepRefs = useRef([]);

  // Booking steps configuration
  const steps = [
    {
      id: 'tour-selection',
      title: t('booking.steps.selectTour', 'Select Tour'),
      icon: MapPin,
      component: TourSelectionStep
    },
    {
      id: 'vehicle-selection',
      title: t('booking.steps.selectVehicle', 'Choose Vehicle'),
      icon: Calendar,
      component: VehicleSelectionStep
    },
    {
      id: 'datetime-selection',
      title: t('booking.steps.selectDateTime', 'Date & Time'),
      icon: Clock,
      component: DateTimeSelectionStep
    },
    {
      id: 'group-details',
      title: t('booking.steps.groupDetails', 'Group Details'),
      icon: Users,
      component: GroupDetailsStep
    },
    {
      id: 'customer-info',
      title: t('booking.steps.customerInfo', 'Your Information'),
      icon: Users,
      component: CustomerInfoStep
    },
    {
      id: 'payment',
      title: t('booking.steps.payment', 'Payment'),
      icon: CreditCard,
      component: PaymentStep
    },
    {
      id: 'confirmation',
      title: t('booking.steps.confirmation', 'Confirmation'),
      icon: Check,
      component: ConfirmationStep
    }
  ];

  useEffect(() => {
    // Load vehicles on mount
    dispatch(fetchVehicles());
    
    // Load cached booking data if available
    loadCachedData();
    
    // Record performance metric
    PerformanceMonitor.recordUserInteraction({
      type: 'booking_flow_start',
      element: 'mobile_booking_component',
      duration: 0,
      success: true
    });
  }, [dispatch]);

  // Cache booking data as user progresses
  useEffect(() => {
    if (Object.keys(bookingData).some(key => bookingData[key])) {
      cache.current.set('booking_progress', { currentStep, bookingData }, 30 * 60 * 1000); // 30 minutes
    }
  }, [bookingData, currentStep]);

  const loadCachedData = async () => {
    try {
      const cached = await cache.current.get('booking_progress');
      if (cached) {
        setCurrentStep(cached.currentStep);
        setBookingData(cached.bookingData);
      }
    } catch (error) {
      console.error('Error loading cached booking data:', error);
    }
  };

  // Touch gesture handling for swipe navigation
  const handleTouchStart = (e) => {
    setTouchEnd(null);
    setTouchStart(e.targetTouches[0].clientX);
  };

  const handleTouchMove = (e) => {
    setTouchEnd(e.targetTouches[0].clientX);
  };

  const handleTouchEnd = () => {
    if (!touchStart || !touchEnd) return;
    
    const distance = touchStart - touchEnd;
    const isLeftSwipe = distance > 50;
    const isRightSwipe = distance < -50;

    if (isLeftSwipe && currentStep < steps.length - 1) {
      handleNext();
    }
    if (isRightSwipe && currentStep > 0) {
      handlePrevious();
    }
  };

  const handleNext = () => {
    if (validateCurrentStep()) {
      setCurrentStep(prev => Math.min(prev + 1, steps.length - 1));
      
      // Scroll to top of next step
      if (stepRefs.current[currentStep + 1]) {
        stepRefs.current[currentStep + 1].scrollIntoView({ 
          behavior: 'smooth', 
          block: 'start' 
        });
      }
    }
  };

  const handlePrevious = () => {
    setCurrentStep(prev => Math.max(prev - 1, 0));
  };

  const validateCurrentStep = () => {
    const step = steps[currentStep];
    const newErrors = {};

    switch (step.id) {
      case 'tour-selection':
        if (!bookingData.tour_type) {
          newErrors.tour_type = t('validation.tourTypeRequired', 'Please select a tour type');
        }
        break;
      
      case 'vehicle-selection':
        if (!bookingData.vehicle_id) {
          newErrors.vehicle_id = t('validation.vehicleRequired', 'Please select a vehicle');
        }
        break;
      
      case 'datetime-selection':
        if (!bookingData.date) {
          newErrors.date = t('validation.dateRequired', 'Please select a date');
        }
        if (!bookingData.time) {
          newErrors.time = t('validation.timeRequired', 'Please select a time');
        }
        break;
      
      case 'group-details':
        if (!bookingData.group_size || bookingData.group_size < 1) {
          newErrors.group_size = t('validation.groupSizeRequired', 'Please specify group size');
        }
        break;
      
      case 'customer-info':
        if (!bookingData.customer_name) {
          newErrors.customer_name = t('validation.nameRequired', 'Name is required');
        }
        if (!bookingData.customer_email) {
          newErrors.customer_email = t('validation.emailRequired', 'Email is required');
        }
        if (!bookingData.customer_phone) {
          newErrors.customer_phone = t('validation.phoneRequired', 'Phone is required');
        }
        break;
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validateCurrentStep()) return;

    setIsSubmitting(true);
    
    try {
      const startTime = performance.now();
      
      await dispatch(createBooking(bookingData)).unwrap();
      
      // Clear cached data on successful submission
      await cache.current.invalidate('booking_progress');
      
      // Record performance metric
      PerformanceMonitor.recordUserInteraction({
        type: 'booking_submission',
        element: 'mobile_booking_form',
        duration: performance.now() - startTime,
        success: true
      });
      
      // Move to confirmation step
      setCurrentStep(steps.length - 1);
      
      if (onComplete) {
        onComplete(bookingData);
      }
    } catch (error) {
      console.error('Booking submission error:', error);
      
      PerformanceMonitor.recordError({
        type: 'booking',
        message: error.message,
        context: { step: currentStep, bookingData },
        severity: 'error'
      });
      
      setErrors({ 
        _general: error.message || t('errors.bookingFailed', 'Failed to create booking') 
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const updateBookingData = (field, value) => {
    setBookingData(prev => ({
      ...prev,
      [field]: value
    }));
    
    // Clear field error if it exists
    if (errors[field]) {
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[field];
        return newErrors;
      });
    }
  };

  const CurrentStepComponent = steps[currentStep].component;
  const progress = ((currentStep + 1) / steps.length) * 100;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header with progress */}
      <div className="bg-white shadow-sm border-b sticky top-0 z-10">
        <div className="px-4 py-3">
          <div className="flex items-center justify-between mb-3">
            <button
              onClick={onCancel}
              className="p-2 text-gray-600 hover:text-gray-800 transition-colors"
            >
              <ChevronLeft className="h-6 w-6" />
            </button>
            <h1 className="text-lg font-semibold text-gray-900">
              {t('booking.title', 'Book Your Adventure')}
            </h1>
            <div className="w-10" /> {/* Spacer */}
          </div>
          
          {/* Progress bar */}
          <div className="w-full bg-gray-200 rounded-full h-2">
            <motion.div
              className="bg-blue-600 h-2 rounded-full"
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.3 }}
            />
          </div>
          
          {/* Step indicator */}
          <div className="flex justify-between mt-2 text-xs text-gray-500">
            <span>{currentStep + 1} of {steps.length}</span>
            <span>{steps[currentStep].title}</span>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div 
        className="flex-1 overflow-hidden"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={currentStep}
            initial={{ x: 300, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -300, opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="h-full"
            ref={el => stepRefs.current[currentStep] = el}
          >
            <div className="p-4 pb-24">
              <CurrentStepComponent
                bookingData={bookingData}
                updateBookingData={updateBookingData}
                errors={errors}
                vehicles={vehicles}
                vehiclesLoading={vehiclesLoading}
              />
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Footer with navigation */}
      <div className="bg-white border-t p-4 fixed bottom-0 left-0 right-0">
        <div className="flex gap-3">
          {currentStep > 0 && currentStep < steps.length - 1 && (
            <button
              onClick={handlePrevious}
              className="flex-1 px-4 py-3 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50 transition-colors"
            >
              {t('common.previous', 'Previous')}
            </button>
          )}
          
          {currentStep < steps.length - 2 && (
            <button
              onClick={handleNext}
              className="flex-1 px-4 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={Object.keys(errors).length > 0}
            >
              {t('common.next', 'Next')}
            </button>
          )}
          
          {currentStep === steps.length - 2 && (
            <button
              onClick={handleSubmit}
              disabled={isSubmitting || Object.keys(errors).length > 0}
              className="flex-1 px-4 py-3 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t('booking.submitting', 'Submitting...')}
                </>
              ) : (
                t('booking.confirmBooking', 'Confirm Booking')
              )}
            </button>
          )}
        </div>
        
        {/* Error display */}
        {errors._general && (
          <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-red-600 flex-shrink-0" />
            <span className="text-sm text-red-700">{errors._general}</span>
          </div>
        )}
      </div>
    </div>
  );
};

// Step Components
const TourSelectionStep = ({ bookingData, updateBookingData, errors }) => {
  const { t } = useTranslation();
  
  const tourTypes = [
    {
      id: 'desert_adventure',
      name: t('tours.desertAdventure', 'Desert Adventure'),
      description: t('tours.desertDescription', 'Explore vast desert landscapes'),
      duration: '2-3 hours',
      difficulty: 'Moderate',
      image: '/images/desert-tour.jpg'
    },
    {
      id: 'mountain_trail',
      name: t('tours.mountainTrail', 'Mountain Trail'),
      description: t('tours.mountainDescription', 'Scenic mountain paths and views'),
      duration: '3-4 hours',
      difficulty: 'Challenging',
      image: '/images/mountain-tour.jpg'
    },
    {
      id: 'sunset_tour',
      name: t('tours.sunsetTour', 'Sunset Tour'),
      description: t('tours.sunsetDescription', 'Beautiful sunset views'),
      duration: '2 hours',
      difficulty: 'Easy',
      image: '/images/sunset-tour.jpg'
    }
  ];

  return (
    <div className="space-y-4">
      <div className="text-center mb-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">
          {t('booking.selectTourType', 'Choose Your Adventure')}
        </h2>
        <p className="text-gray-600">
          {t('booking.selectTourDescription', 'Select the tour that matches your adventure level')}
        </p>
      </div>

      <div className="space-y-3">
        {tourTypes.map((tour) => (
          <motion.div
            key={tour.id}
            whileTap={{ scale: 0.98 }}
            className={`p-4 border-2 rounded-lg cursor-pointer transition-all ${
              bookingData.tour_type === tour.id
                ? 'border-blue-500 bg-blue-50'
                : 'border-gray-200 bg-white hover:border-gray-300'
            }`}
            onClick={() => updateBookingData('tour_type', tour.id)}
          >
            <div className="flex items-center space-x-4">
              <div className="w-16 h-16 bg-gray-200 rounded-lg flex-shrink-0">
                {/* Tour image placeholder */}
                <div className="w-full h-full bg-gradient-to-br from-blue-400 to-blue-600 rounded-lg flex items-center justify-center">
                  <MapPin className="h-8 w-8 text-white" />
                </div>
              </div>
              
              <div className="flex-1">
                <h3 className="font-semibold text-gray-900">{tour.name}</h3>
                <p className="text-sm text-gray-600 mb-2">{tour.description}</p>
                <div className="flex items-center space-x-4 text-xs text-gray-500">
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {tour.duration}
                  </span>
                  <span>{tour.difficulty}</span>
                </div>
              </div>
              
              {bookingData.tour_type === tour.id && (
                <Check className="h-6 w-6 text-blue-600" />
              )}
            </div>
          </motion.div>
        ))}
      </div>

      {errors.tour_type && (
        <div className="text-red-600 text-sm mt-2 flex items-center gap-2">
          <AlertCircle className="h-4 w-4" />
          {errors.tour_type}
        </div>
      )}
    </div>
  );
};

const VehicleSelectionStep = ({ bookingData, updateBookingData, errors, vehicles, vehiclesLoading }) => {
  const { t } = useTranslation();

  if (vehiclesLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        <span className="ml-3 text-gray-600">{t('common.loading', 'Loading...')}</span>
      </div>
    );
  }

  const availableVehicles = vehicles.filter(v => v.status === 'available');

  return (
    <div className="space-y-4">
      <div className="text-center mb-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">
          {t('booking.selectVehicle', 'Choose Your Ride')}
        </h2>
        <p className="text-gray-600">
          {t('booking.selectVehicleDescription', 'Pick the perfect vehicle for your adventure')}
        </p>
      </div>

      <div className="space-y-3">
        {availableVehicles.map((vehicle) => (
          <motion.div
            key={vehicle.id}
            whileTap={{ scale: 0.98 }}
            className={`p-4 border-2 rounded-lg cursor-pointer transition-all ${
              bookingData.vehicle_id === vehicle.id
                ? 'border-blue-500 bg-blue-50'
                : 'border-gray-200 bg-white hover:border-gray-300'
            }`}
            onClick={() => updateBookingData('vehicle_id', vehicle.id)}
          >
            <div className="flex items-center space-x-4">
              <div className="w-16 h-16 bg-gray-200 rounded-lg flex-shrink-0">
                <div className="w-full h-full bg-gradient-to-br from-green-400 to-green-600 rounded-lg flex items-center justify-center">
                  <Calendar className="h-8 w-8 text-white" />
                </div>
              </div>
              
              <div className="flex-1">
                <h3 className="font-semibold text-gray-900">{vehicle.name}</h3>
                <p className="text-sm text-gray-600">{vehicle.model}</p>
                <div className="flex items-center space-x-4 text-xs text-gray-500 mt-1">
                  <span>{vehicle.year}</span>
                  <span>{vehicle.plate_number}</span>
                </div>
              </div>
              
              {bookingData.vehicle_id === vehicle.id && (
                <Check className="h-6 w-6 text-blue-600" />
              )}
            </div>
          </motion.div>
        ))}
      </div>

      {errors.vehicle_id && (
        <div className="text-red-600 text-sm mt-2 flex items-center gap-2">
          <AlertCircle className="h-4 w-4" />
          {errors.vehicle_id}
        </div>
      )}
    </div>
  );
};

const DateTimeSelectionStep = ({ bookingData, updateBookingData, errors }) => {
  const { t } = useTranslation();
  
  const timeSlots = [
    '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00'
  ];

  const today = new Date().toISOString().split('T')[0];

  return (
    <div className="space-y-6">
      <div className="text-center mb-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">
          {t('booking.selectDateTime', 'When would you like to go?')}
        </h2>
        <p className="text-gray-600">
          {t('booking.selectDateTimeDescription', 'Choose your preferred date and time')}
        </p>
      </div>

      {/* Date Selection */}
      <div className="space-y-3">
        <label className="block text-sm font-medium text-gray-700">
          {t('booking.selectDate', 'Select Date')}
        </label>
        <input
          type="date"
          min={today}
          value={bookingData.date}
          onChange={(e) => updateBookingData('date', e.target.value)}
          className={`w-full p-3 border rounded-lg text-lg ${
            errors.date ? 'border-red-500' : 'border-gray-300'
          }`}
        />
        {errors.date && (
          <div className="text-red-600 text-sm flex items-center gap-2">
            <AlertCircle className="h-4 w-4" />
            {errors.date}
          </div>
        )}
      </div>

      {/* Time Selection */}
      <div className="space-y-3">
        <label className="block text-sm font-medium text-gray-700">
          {t('booking.selectTime', 'Select Time')}
        </label>
        <div className="grid grid-cols-3 gap-2">
          {timeSlots.map((time) => (
            <motion.button
              key={time}
              whileTap={{ scale: 0.95 }}
              onClick={() => updateBookingData('time', time)}
              className={`p-3 border rounded-lg text-center font-medium transition-all ${
                bookingData.time === time
                  ? 'border-blue-500 bg-blue-50 text-blue-700'
                  : 'border-gray-300 text-gray-700 hover:border-gray-400'
              }`}
            >
              {time}
            </motion.button>
          ))}
        </div>
        {errors.time && (
          <div className="text-red-600 text-sm flex items-center gap-2">
            <AlertCircle className="h-4 w-4" />
            {errors.time}
          </div>
        )}
      </div>
    </div>
  );
};

const GroupDetailsStep = ({ bookingData, updateBookingData, errors }) => {
  const { t } = useTranslation();

  return (
    <div className="space-y-6">
      <div className="text-center mb-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">
          {t('booking.groupDetails', 'Group Details')}
        </h2>
        <p className="text-gray-600">
          {t('booking.groupDetailsDescription', 'Tell us about your group')}
        </p>
      </div>

      {/* Group Size */}
      <div className="space-y-3">
        <label className="block text-sm font-medium text-gray-700">
          {t('booking.groupSize', 'Group Size')}
        </label>
        <div className="flex items-center space-x-4">
          <button
            onClick={() => updateBookingData('group_size', Math.max(1, bookingData.group_size - 1))}
            className="w-12 h-12 border border-gray-300 rounded-lg flex items-center justify-center text-xl font-bold hover:bg-gray-50"
          >
            -
          </button>
          <span className="text-2xl font-bold min-w-[3rem] text-center">
            {bookingData.group_size}
          </span>
          <button
            onClick={() => updateBookingData('group_size', Math.min(8, bookingData.group_size + 1))}
            className="w-12 h-12 border border-gray-300 rounded-lg flex items-center justify-center text-xl font-bold hover:bg-gray-50"
          >
            +
          </button>
        </div>
        <p className="text-sm text-gray-500">
          {t('booking.groupSizeNote', 'Maximum 8 people per booking')}
        </p>
        {errors.group_size && (
          <div className="text-red-600 text-sm flex items-center gap-2">
            <AlertCircle className="h-4 w-4" />
            {errors.group_size}
          </div>
        )}
      </div>

      {/* Duration */}
      <div className="space-y-3">
        <label className="block text-sm font-medium text-gray-700">
          {t('booking.duration', 'Duration (hours)')}
        </label>
        <div className="grid grid-cols-3 gap-2">
          {[1, 2, 3, 4].map((hours) => (
            <motion.button
              key={hours}
              whileTap={{ scale: 0.95 }}
              onClick={() => updateBookingData('duration', hours)}
              className={`p-3 border rounded-lg text-center font-medium transition-all ${
                bookingData.duration === hours
                  ? 'border-blue-500 bg-blue-50 text-blue-700'
                  : 'border-gray-300 text-gray-700 hover:border-gray-400'
              }`}
            >
              {hours}h
            </motion.button>
          ))}
        </div>
      </div>

      {/* Special Requests */}
      <div className="space-y-3">
        <label className="block text-sm font-medium text-gray-700">
          {t('booking.specialRequests', 'Special Requests (Optional)')}
        </label>
        <textarea
          value={bookingData.special_requests}
          onChange={(e) => updateBookingData('special_requests', e.target.value)}
          placeholder={t('booking.specialRequestsPlaceholder', 'Any special requirements or requests...')}
          className="w-full p-3 border border-gray-300 rounded-lg resize-none"
          rows={3}
        />
      </div>
    </div>
  );
};

const CustomerInfoStep = ({ bookingData, updateBookingData, errors }) => {
  const { t } = useTranslation();

  return (
    <div className="space-y-6">
      <div className="text-center mb-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">
          {t('booking.customerInfo', 'Your Information')}
        </h2>
        <p className="text-gray-600">
          {t('booking.customerInfoDescription', 'We need your details to confirm the booking')}
        </p>
      </div>

      <div className="space-y-4">
        {/* Name */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-700">
            {t('booking.fullName', 'Full Name')}
          </label>
          <input
            type="text"
            value={bookingData.customer_name}
            onChange={(e) => updateBookingData('customer_name', e.target.value)}
            className={`w-full p-3 border rounded-lg ${
              errors.customer_name ? 'border-red-500' : 'border-gray-300'
            }`}
            placeholder={t('booking.fullNamePlaceholder', 'Enter your full name')}
          />
          {errors.customer_name && (
            <div className="text-red-600 text-sm flex items-center gap-2">
              <AlertCircle className="h-4 w-4" />
              {errors.customer_name}
            </div>
          )}
        </div>

        {/* Email */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-700">
            {t('booking.email', 'Email Address')}
          </label>
          <input
            type="email"
            value={bookingData.customer_email}
            onChange={(e) => updateBookingData('customer_email', e.target.value)}
            className={`w-full p-3 border rounded-lg ${
              errors.customer_email ? 'border-red-500' : 'border-gray-300'
            }`}
            placeholder={t('booking.emailPlaceholder', 'Enter your email address')}
          />
          {errors.customer_email && (
            <div className="text-red-600 text-sm flex items-center gap-2">
              <AlertCircle className="h-4 w-4" />
              {errors.customer_email}
            </div>
          )}
        </div>

        {/* Phone */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-700">
            {t('booking.phone', 'Phone Number')}
          </label>
          <input
            type="tel"
            value={bookingData.customer_phone}
            onChange={(e) => updateBookingData('customer_phone', e.target.value)}
            className={`w-full p-3 border rounded-lg ${
              errors.customer_phone ? 'border-red-500' : 'border-gray-300'
            }`}
            placeholder={t('booking.phonePlaceholder', 'Enter your phone number')}
          />
          {errors.customer_phone && (
            <div className="text-red-600 text-sm flex items-center gap-2">
              <AlertCircle className="h-4 w-4" />
              {errors.customer_phone}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const PaymentStep = ({ bookingData, updateBookingData }) => {
  const { t } = useTranslation();

  const paymentMethods = [
    { id: 'card', name: t('payment.creditCard', 'Credit Card'), icon: CreditCard },
    { id: 'cash', name: t('payment.cash', 'Pay on Arrival'), icon: Users }
  ];

  return (
    <div className="space-y-6">
      <div className="text-center mb-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">
          {t('booking.payment', 'Payment Method')}
        </h2>
        <p className="text-gray-600">
          {t('booking.paymentDescription', 'Choose how you would like to pay')}
        </p>
      </div>

      <div className="space-y-3">
        {paymentMethods.map((method) => {
          const Icon = method.icon;
          return (
            <motion.div
              key={method.id}
              whileTap={{ scale: 0.98 }}
              className={`p-4 border-2 rounded-lg cursor-pointer transition-all ${
                bookingData.payment_method === method.id
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200 bg-white hover:border-gray-300'
              }`}
              onClick={() => updateBookingData('payment_method', method.id)}
            >
              <div className="flex items-center space-x-4">
                <Icon className="h-6 w-6 text-gray-600" />
                <span className="font-medium text-gray-900">{method.name}</span>
                {bookingData.payment_method === method.id && (
                  <Check className="h-6 w-6 text-blue-600 ml-auto" />
                )}
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Booking Summary */}
      <div className="bg-gray-50 p-4 rounded-lg">
        <h3 className="font-semibold text-gray-900 mb-3">
          {t('booking.summary', 'Booking Summary')}
        </h3>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-600">{t('booking.tour', 'Tour')}:</span>
            <span className="font-medium">{bookingData.tour_type?.replace('_', ' ')}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">{t('booking.date', 'Date')}:</span>
            <span className="font-medium">{bookingData.date}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">{t('booking.time', 'Time')}:</span>
            <span className="font-medium">{bookingData.time}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">{t('booking.groupSize', 'Group Size')}:</span>
            <span className="font-medium">{bookingData.group_size} people</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">{t('booking.duration', 'Duration')}:</span>
            <span className="font-medium">{bookingData.duration} hours</span>
          </div>
          <div className="border-t pt-2 mt-2">
            <div className="flex justify-between font-semibold">
              <span>{t('booking.total', 'Total')}:</span>
              <span>${(bookingData.group_size * bookingData.duration * 50).toFixed(2)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const ConfirmationStep = ({ bookingData }) => {
  const { t } = useTranslation();

  return (
    <div className="text-center space-y-6">
      <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto">
        <Check className="h-10 w-10 text-green-600" />
      </div>
      
      <div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">
          {t('booking.confirmed', 'Booking Confirmed!')}
        </h2>
        <p className="text-gray-600">
          {t('booking.confirmationMessage', 'Your adventure is booked. We\'ll send you a confirmation email shortly.')}
        </p>
      </div>

      <div className="bg-gray-50 p-4 rounded-lg text-left">
        <h3 className="font-semibold text-gray-900 mb-3">
          {t('booking.bookingDetails', 'Booking Details')}
        </h3>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-600">{t('booking.customer', 'Customer')}:</span>
            <span className="font-medium">{bookingData.customer_name}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">{t('booking.email', 'Email')}:</span>
            <span className="font-medium">{bookingData.customer_email}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">{t('booking.tour', 'Tour')}:</span>
            <span className="font-medium">{bookingData.tour_type?.replace('_', ' ')}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">{t('booking.dateTime', 'Date & Time')}:</span>
            <span className="font-medium">{bookingData.date} at {bookingData.time}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MobileOptimizedBooking;