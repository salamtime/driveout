import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { calculateTax } from '../services/taxSettingsService';
import toast from 'react-hot-toast';

const TourBooking = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  
  // Booking state
  const [bookingData, setBookingData] = useState({
    tourType: 'standard',
    numberOfQuads: 1,
    totalParticipants: 1,
    selectedDate: '',
    selectedTime: '',
    customerInfo: {
      name: '',
      email: '',
      phone: '',
      emergencyContact: '',
      emergencyPhone: ''
    },
    participants: [{ name: '', age: '', experience: 'beginner' }],
    specialRequirements: '',
    termsAccepted: false
  });

  // Pricing configuration - Updated to use configurable tax
  const [pricingConfig] = useState({
    basePricePerQuad: 50,
    extraPassengerFee: 15,
    maxPassengersPerQuad: 2,
    tourTypes: {
      standard: { name: 'Standard Tour', duration: '2 hours', multiplier: 1 },
      extended: { name: 'Extended Tour', duration: '4 hours', multiplier: 1.8 },
      sunset: { name: 'Sunset Tour', duration: '3 hours', multiplier: 1.5 },
      adventure: { name: 'Adventure Tour', duration: '6 hours', multiplier: 2.5 }
    }
  });

  // UI state
  const [currentStep, setCurrentStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [availableTimeSlots, setAvailableTimeSlots] = useState([]);
  const [isLoadingAvailability, setIsLoadingAvailability] = useState(false);
  
  // Tax calculation state
  const [taxCalculation, setTaxCalculation] = useState({
    taxAmount: 0,
    total: 0,
    taxApplied: false,
    taxPercentage: 0
  });

  // Calculate pricing with configurable tax
  const calculatePricing = async () => {
    const { numberOfQuads, totalParticipants, tourType } = bookingData;
    const tourMultiplier = pricingConfig.tourTypes[tourType].multiplier;
    
    // Base price calculation
    const basePrice = pricingConfig.basePricePerQuad * numberOfQuads * tourMultiplier;
    
    // Extra passenger calculation - 1 passenger included per quad
    const maxIncludedPassengers = numberOfQuads * 1; // 1 passenger included per quad
    const extraPassengers = Math.max(0, totalParticipants - maxIncludedPassengers);
    const extraPassengerFees = extraPassengers * pricingConfig.extraPassengerFee;
    
    // Calculate subtotal
    const subtotal = basePrice + extraPassengerFees;
    
    // Calculate tax using configurable tax system
    const taxResult = await calculateTax(subtotal, 'tour');
    
    return {
      basePrice,
      extraPassengers,
      extraPassengerFees,
      subtotal,
      taxAmount: taxResult.taxAmount,
      total: taxResult.total,
      taxApplied: taxResult.taxApplied,
      taxPercentage: taxResult.taxPercentage
    };
  };

  // Update pricing when booking data changes
  useEffect(() => {
    const updatePricing = async () => {
      const pricing = await calculatePricing();
      setTaxCalculation({
        taxAmount: pricing.taxAmount,
        total: pricing.total,
        taxApplied: pricing.taxApplied,
        taxPercentage: pricing.taxPercentage
      });
    };
    
    updatePricing();
  }, [bookingData.numberOfQuads, bookingData.totalParticipants, bookingData.tourType]);

  // Get current pricing (synchronous version for rendering)
  const getCurrentPricing = () => {
    const { numberOfQuads, totalParticipants, tourType } = bookingData;
    const tourMultiplier = pricingConfig.tourTypes[tourType].multiplier;
    
    // Base price calculation
    const basePrice = pricingConfig.basePricePerQuad * numberOfQuads * tourMultiplier;
    
    // Extra passenger calculation
    const maxIncludedPassengers = numberOfQuads * 1;
    const extraPassengers = Math.max(0, totalParticipants - maxIncludedPassengers);
    const extraPassengerFees = extraPassengers * pricingConfig.extraPassengerFee;
    
    // Calculate subtotal
    const subtotal = basePrice + extraPassengerFees;
    
    return {
      basePrice,
      extraPassengers,
      extraPassengerFees,
      subtotal,
      taxAmount: taxCalculation.taxAmount,
      total: taxCalculation.total || subtotal,
      taxApplied: taxCalculation.taxApplied,
      taxPercentage: taxCalculation.taxPercentage
    };
  };

  const pricing = getCurrentPricing();

  // Load available time slots when date changes
  useEffect(() => {
    if (bookingData.selectedDate) {
      loadAvailableTimeSlots(bookingData.selectedDate);
    }
  }, [bookingData.selectedDate]);

  // Update participants array when total participants changes
  useEffect(() => {
    const { totalParticipants } = bookingData;
    const currentParticipants = bookingData.participants.length;
    
    if (totalParticipants > currentParticipants) {
      // Add new participants
      const newParticipants = [...bookingData.participants];
      for (let i = currentParticipants; i < totalParticipants; i++) {
        newParticipants.push({ name: '', age: '', experience: 'beginner' });
      }
      setBookingData(prev => ({ ...prev, participants: newParticipants }));
    } else if (totalParticipants < currentParticipants) {
      // Remove excess participants
      setBookingData(prev => ({
        ...prev,
        participants: prev.participants.slice(0, totalParticipants)
      }));
    }
  }, [bookingData.totalParticipants]);

  const loadAvailableTimeSlots = async (date) => {
    setIsLoadingAvailability(true);
    try {
      // Generate available time slots (9 AM to 5 PM, every 2 hours)
      const timeSlots = [
        '09:00', '11:00', '13:00', '15:00', '17:00'
      ];
      
      // TODO: Check against existing bookings to filter out unavailable slots
      setAvailableTimeSlots(timeSlots);
    } catch (error) {
      console.error('Error loading availability:', error);
      toast.error('Failed to load available time slots');
    } finally {
      setIsLoadingAvailability(false);
    }
  };

  const handleInputChange = (field, value) => {
    setBookingData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleCustomerInfoChange = (field, value) => {
    setBookingData(prev => ({
      ...prev,
      customerInfo: {
        ...prev.customerInfo,
        [field]: value
      }
    }));
  };

  const handleParticipantChange = (index, field, value) => {
    setBookingData(prev => ({
      ...prev,
      participants: prev.participants.map((participant, i) =>
        i === index ? { ...participant, [field]: value } : participant
      )
    }));
  };

  const validateStep = (step) => {
    switch (step) {
      case 1:
        return bookingData.tourType && bookingData.numberOfQuads > 0 && bookingData.totalParticipants > 0;
      case 2:
        return bookingData.selectedDate && bookingData.selectedTime;
      case 3:
        const { customerInfo } = bookingData;
        return customerInfo.name && customerInfo.email && customerInfo.phone;
      case 4:
        return bookingData.participants.every(p => p.name && p.age) && bookingData.termsAccepted;
      default:
        return true;
    }
  };

  const handleNextStep = () => {
    if (validateStep(currentStep)) {
      setCurrentStep(prev => Math.min(prev + 1, 5));
    } else {
      toast.error('Please fill in all required fields');
    }
  };

  const handlePrevStep = () => {
    setCurrentStep(prev => Math.max(prev - 1, 1));
  };

  const handleSubmitBooking = async () => {
    if (!validateStep(4)) {
      toast.error('Please complete all required fields');
      return;
    }

    setIsSubmitting(true);
    try {
      // Create booking in database with tax snapshot
      const bookingRecord = {
        tour_type: bookingData.tourType,
        number_of_quads: bookingData.numberOfQuads,
        total_participants: bookingData.totalParticipants,
        tour_date: bookingData.selectedDate,
        tour_time: bookingData.selectedTime,
        customer_name: bookingData.customerInfo.name,
        customer_email: bookingData.customerInfo.email,
        customer_phone: bookingData.customerInfo.phone,
        emergency_contact: bookingData.customerInfo.emergencyContact,
        emergency_phone: bookingData.customerInfo.emergencyPhone,
        special_requirements: bookingData.specialRequirements,
        base_price: pricing.basePrice,
        extra_passenger_fees: pricing.extraPassengerFees,
        subtotal_amount: pricing.subtotal,
        tax_enabled: pricing.taxApplied,
        tax_percent_applied: pricing.taxPercentage,
        tax_amount: pricing.taxAmount,
        total_amount: pricing.total,
        booking_status: 'pending',
        payment_status: 'pending',
        created_at: new Date().toISOString()
      };

      const { data: booking, error: bookingError } = await supabase
        .from('tour_bookings')
        .insert([bookingRecord])
        .select()
        .single();

      if (bookingError) throw bookingError;

      // Save participants
      const participantRecords = bookingData.participants.map((participant, index) => ({
        booking_id: booking.id,
        name: participant.name,
        age: parseInt(participant.age),
        experience_level: participant.experience,
        participant_number: index + 1
      }));

      const { error: participantsError } = await supabase
        .from('tour_participants')
        .insert(participantRecords);

      if (participantsError) throw participantsError;

      toast.success('Booking created successfully!');
      setCurrentStep(5); // Move to confirmation step
      
    } catch (error) {
      console.error('Error creating booking:', error);
      toast.error('Failed to create booking. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderStep1 = () => (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-900 mb-6">Select Your Tour</h2>
      
      {/* Tour Type Selection */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-3">Tour Type</label>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Object.entries(pricingConfig.tourTypes).map(([key, tour]) => (
            <div
              key={key}
              onClick={() => handleInputChange('tourType', key)}
              className={`p-4 border-2 rounded-lg cursor-pointer transition-colors ${
                bookingData.tourType === key
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <h3 className="font-semibold text-gray-900">{tour.name}</h3>
              <p className="text-sm text-gray-600">{tour.duration}</p>
              <p className="text-lg font-bold text-blue-600 mt-2">
                ${(pricingConfig.basePricePerQuad * tour.multiplier).toFixed(0)} per quad
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Number of Quads */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-3">Number of Quads</label>
        <div className="flex items-center space-x-4">
          <button
            onClick={() => handleInputChange('numberOfQuads', Math.max(1, bookingData.numberOfQuads - 1))}
            className="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center hover:bg-gray-300 transition-colors"
          >
            -
          </button>
          <span className="text-xl font-semibold w-12 text-center">{bookingData.numberOfQuads}</span>
          <button
            onClick={() => handleInputChange('numberOfQuads', bookingData.numberOfQuads + 1)}
            className="w-10 h-10 bg-blue-500 text-white rounded-full flex items-center justify-center hover:bg-blue-600 transition-colors"
          >
            +
          </button>
        </div>
      </div>

      {/* Total Participants */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-3">
          Total Participants (Max {bookingData.numberOfQuads * pricingConfig.maxPassengersPerQuad})
        </label>
        <div className="flex items-center space-x-4">
          <button
            onClick={() => handleInputChange('totalParticipants', Math.max(1, bookingData.totalParticipants - 1))}
            className="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center hover:bg-gray-300 transition-colors"
          >
            -
          </button>
          <span className="text-xl font-semibold w-12 text-center">{bookingData.totalParticipants}</span>
          <button
            onClick={() => handleInputChange('totalParticipants', Math.min(
              bookingData.numberOfQuads * pricingConfig.maxPassengersPerQuad,
              bookingData.totalParticipants + 1
            ))}
            className="w-10 h-10 bg-blue-500 text-white rounded-full flex items-center justify-center hover:bg-blue-600 transition-colors"
          >
            +
          </button>
        </div>
      </div>

      {/* Updated Pricing Preview with Configurable Tax */}
      <div className="bg-gray-50 p-4 rounded-lg">
        <h3 className="font-semibold text-gray-900 mb-3">Pricing Breakdown</h3>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span>Base Price per Quad:</span>
            <span>${(pricingConfig.basePricePerQuad * pricingConfig.tourTypes[bookingData.tourType].multiplier).toFixed(0)}</span>
          </div>
          <div className="flex justify-between">
            <span>Number of Quads:</span>
            <span>× {bookingData.numberOfQuads}</span>
          </div>
          <div className="flex justify-between font-medium">
            <span>Quad Total:</span>
            <span>${pricing.basePrice.toFixed(2)}</span>
          </div>
          <div className="flex justify-between">
            <span>Participants:</span>
            <span>{bookingData.totalParticipants} people</span>
          </div>
          <div className="flex justify-between text-xs text-gray-600">
            <span>• Included: {bookingData.numberOfQuads} passenger{bookingData.numberOfQuads !== 1 ? 's' : ''}</span>
            <span>• Extra: {pricing.extraPassengers} passenger{pricing.extraPassengers !== 1 ? 's' : ''}</span>
          </div>
          {pricing.extraPassengers > 0 && (
            <div className="flex justify-between font-medium">
              <span>Extra Passenger Fees:</span>
              <span>{pricing.extraPassengers} × ${pricingConfig.extraPassengerFee} = ${pricing.extraPassengerFees.toFixed(2)}</span>
            </div>
          )}
          <div className="border-t pt-2 flex justify-between font-medium">
            <span>Subtotal:</span>
            <span>${pricing.subtotal.toFixed(2)}</span>
          </div>
          {pricing.taxApplied && (
            <div className="flex justify-between">
              <span>Tax ({pricing.taxPercentage.toFixed(1)}%):</span>
              <span>${pricing.taxAmount.toFixed(2)}</span>
            </div>
          )}
          <div className="border-t pt-2 flex justify-between text-lg font-bold text-blue-600">
            <span>Total:</span>
            <span>${pricing.total.toFixed(2)}</span>
          </div>
        </div>
        
        {/* Calculation Verification */}
        <div className="mt-3 p-2 bg-blue-50 rounded text-xs text-blue-800">
          <strong>Calculation:</strong> ${pricing.subtotal.toFixed(2)} (subtotal) 
          {pricing.taxApplied && ` + ${pricing.taxAmount.toFixed(2)} (tax)`} = ${pricing.total.toFixed(2)}
        </div>
      </div>
    </div>
  );

  const renderStep2 = () => (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-900 mb-6">Select Date & Time</h2>
      
      {/* Date Selection */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-3">Select Date</label>
        <input
          type="date"
          value={bookingData.selectedDate}
          onChange={(e) => handleInputChange('selectedDate', e.target.value)}
          min={new Date().toISOString().split('T')[0]}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Time Selection */}
      {bookingData.selectedDate && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-3">Select Time</label>
          {isLoadingAvailability ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              <span className="ml-2">Loading available times...</span>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {availableTimeSlots.map((time) => (
                <button
                  key={time}
                  onClick={() => handleInputChange('selectedTime', time)}
                  className={`p-3 border-2 rounded-lg transition-colors ${
                    bookingData.selectedTime === time
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  {time}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );

  const renderStep3 = () => (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-900 mb-6">Customer Information</h2>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Full Name *</label>
          <input
            type="text"
            value={bookingData.customerInfo.name}
            onChange={(e) => handleCustomerInfoChange('name', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Enter your full name"
          />
        </div>
        
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Email Address *</label>
          <input
            type="email"
            value={bookingData.customerInfo.email}
            onChange={(e) => handleCustomerInfoChange('email', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Enter your email"
          />
        </div>
        
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Phone Number *</label>
          <input
            type="tel"
            value={bookingData.customerInfo.phone}
            onChange={(e) => handleCustomerInfoChange('phone', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Enter your phone number"
          />
        </div>
        
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Emergency Contact</label>
          <input
            type="text"
            value={bookingData.customerInfo.emergencyContact}
            onChange={(e) => handleCustomerInfoChange('emergencyContact', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Emergency contact name"
          />
        </div>
        
        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-2">Emergency Phone</label>
          <input
            type="tel"
            value={bookingData.customerInfo.emergencyPhone}
            onChange={(e) => handleCustomerInfoChange('emergencyPhone', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Emergency contact phone"
          />
        </div>
      </div>
    </div>
  );

  const renderStep4 = () => (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-900 mb-6">Participant Details</h2>
      
      {bookingData.participants.map((participant, index) => (
        <div key={index} className="bg-gray-50 p-4 rounded-lg">
          <h3 className="font-semibold text-gray-900 mb-4">Participant {index + 1}</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Name *</label>
              <input
                type="text"
                value={participant.name}
                onChange={(e) => handleParticipantChange(index, 'name', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Participant name"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Age *</label>
              <input
                type="number"
                value={participant.age}
                onChange={(e) => handleParticipantChange(index, 'age', e.target.value)}
                min="16"
                max="80"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Age"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Experience Level</label>
              <select
                value={participant.experience}
                onChange={(e) => handleParticipantChange(index, 'experience', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="beginner">Beginner</option>
                <option value="intermediate">Intermediate</option>
                <option value="advanced">Advanced</option>
              </select>
            </div>
          </div>
        </div>
      ))}
      
      {/* Special Requirements */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Special Requirements</label>
        <textarea
          value={bookingData.specialRequirements}
          onChange={(e) => handleInputChange('specialRequirements', e.target.value)}
          rows={3}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="Any special requirements or notes..."
        />
      </div>
      
      {/* Terms and Conditions */}
      <div className="flex items-start space-x-3">
        <input
          type="checkbox"
          id="terms"
          checked={bookingData.termsAccepted}
          onChange={(e) => handleInputChange('termsAccepted', e.target.checked)}
          className="mt-1 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
        />
        <label htmlFor="terms" className="text-sm text-gray-700">
          I accept the{' '}
          <a href="#" className="text-blue-600 hover:text-blue-500">
            Terms and Conditions
          </a>{' '}
          and{' '}
          <a href="#" className="text-blue-600 hover:text-blue-500">
            Privacy Policy
          </a>
        </label>
      </div>
    </div>
  );

  const renderStep5 = () => (
    <div className="text-center space-y-6">
      <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
        <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      </div>
      
      <h2 className="text-2xl font-bold text-gray-900">Booking Confirmed!</h2>
      <p className="text-gray-600">
        Your tour booking has been successfully created. You will receive a confirmation email shortly.
      </p>
      
      <div className="bg-gray-50 p-6 rounded-lg text-left max-w-md mx-auto">
        <h3 className="font-semibold text-gray-900 mb-4">Booking Summary</h3>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span>Tour:</span>
            <span>{pricingConfig.tourTypes[bookingData.tourType].name}</span>
          </div>
          <div className="flex justify-between">
            <span>Date:</span>
            <span>{bookingData.selectedDate}</span>
          </div>
          <div className="flex justify-between">
            <span>Time:</span>
            <span>{bookingData.selectedTime}</span>
          </div>
          <div className="flex justify-between">
            <span>Participants:</span>
            <span>{bookingData.totalParticipants}</span>
          </div>
          <div className="border-t pt-2 flex justify-between font-semibold">
            <span>Total:</span>
            <span>${pricing.total.toFixed(2)}</span>
          </div>
        </div>
      </div>
      
      <button
        onClick={() => navigate('/')}
        className="bg-blue-600 text-white px-6 py-2 rounded-md hover:bg-blue-700 transition-colors"
      >
        Return to Home
      </button>
    </div>
  );

  const renderStepContent = () => {
    switch (currentStep) {
      case 1: return renderStep1();
      case 2: return renderStep2();
      case 3: return renderStep3();
      case 4: return renderStep4();
      case 5: return renderStep5();
      default: return renderStep1();
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Progress Bar */}
        {currentStep < 5 && (
          <div className="mb-8">
            <div className="flex items-center justify-between">
              {[1, 2, 3, 4].map((step) => (
                <div
                  key={step}
                  className={`flex items-center ${step < 4 ? 'flex-1' : ''}`}
                >
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                      step <= currentStep
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-300 text-gray-600'
                    }`}
                  >
                    {step}
                  </div>
                  {step < 4 && (
                    <div
                      className={`flex-1 h-1 mx-4 ${
                        step < currentStep ? 'bg-blue-600' : 'bg-gray-300'
                      }`}
                    />
                  )}
                </div>
              ))}
            </div>
            <div className="flex justify-between mt-2 text-xs text-gray-600">
              <span>Tour Details</span>
              <span>Date & Time</span>
              <span>Customer Info</span>
              <span>Participants</span>
            </div>
          </div>
        )}

        {/* Main Content */}
        <div className="bg-white rounded-lg shadow-sm p-6 md:p-8">
          {renderStepContent()}
          
          {/* Navigation Buttons */}
          {currentStep < 5 && (
            <div className="flex justify-between mt-8 pt-6 border-t">
              <button
                onClick={handlePrevStep}
                disabled={currentStep === 1}
                className="px-6 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Previous
              </button>
              
              {currentStep < 4 ? (
                <button
                  onClick={handleNextStep}
                  disabled={!validateStep(currentStep)}
                  className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Next
                </button>
              ) : (
                <button
                  onClick={handleSubmitBooking}
                  disabled={!validateStep(4) || isSubmitting}
                  className="px-6 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center"
                >
                  {isSubmitting ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                      Creating Booking...
                    </>
                  ) : (
                    'Confirm Booking'
                  )}
                </button>
              )}
            </div>
          )}
        </div>

        {/* Updated Pricing Sidebar with Configurable Tax */}
        {currentStep < 5 && (
          <div className="hidden lg:block fixed right-8 top-1/2 transform -translate-y-1/2 w-80">
            <div className="bg-white rounded-lg shadow-lg p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Payment Information</h3>
              
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span>Payment Type</span>
                  <span className="font-medium">Credit Card</span>
                </div>
                
                <div className="border-t pt-3">
                  <div className="flex justify-between">
                    <span>Base Price per Quad:</span>
                    <span>${(pricingConfig.basePricePerQuad * pricingConfig.tourTypes[bookingData.tourType].multiplier).toFixed(0)}</span>
                  </div>
                  
                  <div className="flex justify-between">
                    <span>Number of Quads:</span>
                    <span>× {bookingData.numberOfQuads}</span>
                  </div>
                  
                  <div className="flex justify-between font-medium">
                    <span>Quad Total:</span>
                    <span>${pricing.basePrice.toFixed(2)}</span>
                  </div>
                  
                  <div className="flex justify-between mt-2">
                    <span>Participants:</span>
                    <span>{bookingData.totalParticipants} people</span>
                  </div>
                  
                  {pricing.extraPassengers > 0 && (
                    <div className="flex justify-between font-medium">
                      <span>Extra Passenger Fees:</span>
                      <span>{pricing.extraPassengers} × ${pricingConfig.extraPassengerFee}</span>
                    </div>
                  )}
                  
                  <div className="flex justify-between font-medium mt-2">
                    <span>Subtotal:</span>
                    <span>${pricing.subtotal.toFixed(2)}</span>
                  </div>
                  
                  {pricing.taxApplied && (
                    <div className="flex justify-between">
                      <span>Tax ({pricing.taxPercentage.toFixed(1)}%):</span>
                      <span>${pricing.taxAmount.toFixed(2)}</span>
                    </div>
                  )}
                </div>
                
                <div className="border-t pt-3 flex justify-between text-lg font-bold text-blue-600">
                  <span>Total:</span>
                  <span>${pricing.total.toFixed(2)}</span>
                </div>
              </div>
              
              <div className="mt-4 p-3 bg-green-50 rounded-lg">
                <p className="text-xs text-green-800 font-medium">
                  ✓ Transparent Pricing - No Hidden Fees
                </p>
                <p className="text-xs text-green-600 mt-1">
                  ${pricing.subtotal.toFixed(2)} + ${pricing.taxAmount.toFixed(2)} = ${pricing.total.toFixed(2)}
                </p>
              </div>
              
              <div className="mt-3 p-3 bg-blue-50 rounded-lg">
                <p className="text-xs text-blue-800">
                  💳 Secure payment processing with Stripe
                </p>
                <p className="text-xs text-blue-600 mt-1">
                  Your payment information is encrypted and secure
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default TourBooking;