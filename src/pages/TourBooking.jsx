import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { calculateTax } from '../services/taxSettingsService';
import toast from 'react-hot-toast';

const TourBooking = () => {
  const { t } = useTranslation();
  const tr = (en, fr) => t(en, fr);
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
      standard: { name: tr('Standard Tour', 'Tour standard'), duration: tr('2 hours', '2 heures'), multiplier: 1 },
      extended: { name: tr('Extended Tour', 'Tour prolongé'), duration: tr('4 hours', '4 heures'), multiplier: 1.8 },
      sunset: { name: tr('Sunset Tour', 'Tour au coucher du soleil'), duration: tr('3 hours', '3 heures'), multiplier: 1.5 },
      adventure: { name: tr('Adventure Tour', "Tour d'aventure"), duration: tr('6 hours', '6 heures'), multiplier: 2.5 }
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
      toast.error(tr('Failed to load available time slots', 'Impossible de charger les créneaux disponibles'));
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
      toast.error(tr('Please fill in all required fields', 'Veuillez remplir tous les champs obligatoires'));
    }
  };

  const handlePrevStep = () => {
    setCurrentStep(prev => Math.max(prev - 1, 1));
  };

  const handleSubmitBooking = async () => {
    if (!validateStep(4)) {
      toast.error(tr('Please complete all required fields', 'Veuillez compléter tous les champs obligatoires'));
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

      toast.success(tr('Booking created successfully!', 'Réservation créée avec succès !'));
      setCurrentStep(5); // Move to confirmation step
      
    } catch (error) {
      console.error('Error creating booking:', error);
      toast.error(tr('Failed to create booking. Please try again.', 'Impossible de créer la réservation. Veuillez réessayer.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderStep1 = () => (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-900 mb-6">{tr('Select Your Tour', 'Choisissez votre tour')}</h2>
      
      {/* Tour Type Selection */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-3">{tr('Tour Type', 'Type de tour')}</label>
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
                ${(pricingConfig.basePricePerQuad * tour.multiplier).toFixed(0)} {tr('per quad', 'par quad')}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Number of Quads */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-3">{tr('Number of Quads', 'Nombre de quads')}</label>
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
          {tr('Total Participants', 'Participants au total')} ({tr('Max', 'Max')} {bookingData.numberOfQuads * pricingConfig.maxPassengersPerQuad})
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
        <h3 className="font-semibold text-gray-900 mb-3">{tr('Pricing Breakdown', 'Détail du tarif')}</h3>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span>{tr('Base Price per Quad:', 'Prix de base par quad :')}</span>
            <span>${(pricingConfig.basePricePerQuad * pricingConfig.tourTypes[bookingData.tourType].multiplier).toFixed(0)}</span>
          </div>
          <div className="flex justify-between">
            <span>{tr('Number of Quads:', 'Nombre de quads :')}</span>
            <span>× {bookingData.numberOfQuads}</span>
          </div>
          <div className="flex justify-between font-medium">
            <span>{tr('Quad Total:', 'Total des quads :')}</span>
            <span>${pricing.basePrice.toFixed(2)}</span>
          </div>
          <div className="flex justify-between">
            <span>{tr('Participants:', 'Participants :')}</span>
            <span>{bookingData.totalParticipants} {tr('people', 'personnes')}</span>
          </div>
          <div className="flex justify-between text-xs text-gray-600">
            <span>• {tr('Included:', 'Inclus :')} {bookingData.numberOfQuads} {tr(bookingData.numberOfQuads !== 1 ? 'passengers' : 'passenger', bookingData.numberOfQuads !== 1 ? 'passagers' : 'passager')}</span>
            <span>• {tr('Extra:', 'Extra :')} {pricing.extraPassengers} {tr(pricing.extraPassengers !== 1 ? 'passengers' : 'passenger', pricing.extraPassengers !== 1 ? 'passagers' : 'passager')}</span>
          </div>
          {pricing.extraPassengers > 0 && (
            <div className="flex justify-between font-medium">
              <span>{tr('Extra Passenger Fees:', 'Frais passager supplémentaire :')}</span>
              <span>{pricing.extraPassengers} × ${pricingConfig.extraPassengerFee} = ${pricing.extraPassengerFees.toFixed(2)}</span>
            </div>
          )}
          <div className="border-t pt-2 flex justify-between font-medium">
            <span>{tr('Subtotal:', 'Sous-total :')}</span>
            <span>${pricing.subtotal.toFixed(2)}</span>
          </div>
          {pricing.taxApplied && (
            <div className="flex justify-between">
              <span>{tr('Tax', 'Taxe')} ({pricing.taxPercentage.toFixed(1)}%) :</span>
              <span>${pricing.taxAmount.toFixed(2)}</span>
            </div>
          )}
          <div className="border-t pt-2 flex justify-between text-lg font-bold text-blue-600">
            <span>{tr('Total:', 'Total :')}</span>
            <span>${pricing.total.toFixed(2)}</span>
          </div>
        </div>
        
        {/* Calculation Verification */}
        <div className="mt-3 p-2 bg-blue-50 rounded text-xs text-blue-800">
          <strong>{tr('Calculation:', 'Calcul :')}</strong> ${pricing.subtotal.toFixed(2)} ({tr('subtotal', 'sous-total')})
          {pricing.taxApplied && ` + ${pricing.taxAmount.toFixed(2)} (${tr('tax', 'taxe')})`} = ${pricing.total.toFixed(2)}
        </div>
      </div>
    </div>
  );

  const renderStep2 = () => (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-900 mb-6">{tr('Select Date & Time', "Choisissez la date et l'heure")}</h2>
      
      {/* Date Selection */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-3">{tr('Select Date', 'Choisissez la date')}</label>
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
          <label className="block text-sm font-medium text-gray-700 mb-3">{tr('Select Time', "Choisissez l'heure")}</label>
          {isLoadingAvailability ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              <span className="ml-2">{tr('Loading available times...', 'Chargement des créneaux disponibles...')}</span>
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
      <h2 className="text-2xl font-bold text-gray-900 mb-6">{tr('Customer Information', 'Informations client')}</h2>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">{tr('Full Name', 'Nom complet')} *</label>
          <input
            type="text"
            value={bookingData.customerInfo.name}
            onChange={(e) => handleCustomerInfoChange('name', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder={tr('Enter your full name', 'Entrez votre nom complet')}
          />
        </div>
        
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">{tr('Email Address', 'Adresse e-mail')} *</label>
          <input
            type="email"
            value={bookingData.customerInfo.email}
            onChange={(e) => handleCustomerInfoChange('email', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder={tr('Enter your email', 'Entrez votre e-mail')}
          />
        </div>
        
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">{tr('Phone Number', 'Numéro de téléphone')} *</label>
          <input
            type="tel"
            value={bookingData.customerInfo.phone}
            onChange={(e) => handleCustomerInfoChange('phone', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder={tr('Enter your phone number', 'Entrez votre numéro de téléphone')}
          />
        </div>
        
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">{tr('Emergency Contact', "Contact d'urgence")}</label>
          <input
            type="text"
            value={bookingData.customerInfo.emergencyContact}
            onChange={(e) => handleCustomerInfoChange('emergencyContact', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder={tr('Emergency contact name', "Nom du contact d'urgence")}
          />
        </div>
        
        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-2">{tr('Emergency Phone', "Téléphone d'urgence")}</label>
          <input
            type="tel"
            value={bookingData.customerInfo.emergencyPhone}
            onChange={(e) => handleCustomerInfoChange('emergencyPhone', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder={tr('Emergency contact phone', "Téléphone du contact d'urgence")}
          />
        </div>
      </div>
    </div>
  );

  const renderStep4 = () => (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-900 mb-6">{tr('Participant Details', 'Détails des participants')}</h2>
      
      {bookingData.participants.map((participant, index) => (
        <div key={index} className="bg-gray-50 p-4 rounded-lg">
          <h3 className="font-semibold text-gray-900 mb-4">{tr('Participant', 'Participant')} {index + 1}</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">{tr('Name', 'Nom')} *</label>
              <input
                type="text"
                value={participant.name}
                onChange={(e) => handleParticipantChange(index, 'name', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder={tr('Participant name', 'Nom du participant')}
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">{tr('Age', 'Âge')} *</label>
              <input
                type="number"
                value={participant.age}
                onChange={(e) => handleParticipantChange(index, 'age', e.target.value)}
                min="16"
                max="80"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder={tr('Age', 'Âge')}
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">{tr('Experience Level', "Niveau d'expérience")}</label>
              <select
                value={participant.experience}
                onChange={(e) => handleParticipantChange(index, 'experience', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="beginner">{tr('Beginner', 'Débutant')}</option>
                <option value="intermediate">{tr('Intermediate', 'Intermédiaire')}</option>
                <option value="advanced">{tr('Advanced', 'Avancé')}</option>
              </select>
            </div>
          </div>
        </div>
      ))}
      
      {/* Special Requirements */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">{tr('Special Requirements', 'Exigences particulières')}</label>
        <textarea
          value={bookingData.specialRequirements}
          onChange={(e) => handleInputChange('specialRequirements', e.target.value)}
          rows={3}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder={tr('Any special requirements or notes...', 'Exigences particulières ou notes...')}
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
          {tr('I accept the', "J'accepte les")}{' '}
          <a href="#" className="text-blue-600 hover:text-blue-500">
            {tr('Terms and Conditions', 'Conditions générales')}
          </a>{' '}
          {tr('and', 'et')}{' '}
          <a href="#" className="text-blue-600 hover:text-blue-500">
            {tr('Privacy Policy', 'Politique de confidentialité')}
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
      
      <h2 className="text-2xl font-bold text-gray-900">{tr('Booking Confirmed!', 'Réservation confirmée !')}</h2>
      <p className="text-gray-600">
        {tr('Your tour booking has been successfully created. You will receive a confirmation email shortly.', 'Votre réservation de tour a bien été créée. Vous recevrez bientôt un e-mail de confirmation.')}
      </p>
      
      <div className="bg-gray-50 p-6 rounded-lg text-left max-w-md mx-auto">
        <h3 className="font-semibold text-gray-900 mb-4">{tr('Booking Summary', 'Résumé de la réservation')}</h3>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span>{tr('Tour:', 'Tour :')}</span>
            <span>{pricingConfig.tourTypes[bookingData.tourType].name}</span>
          </div>
          <div className="flex justify-between">
            <span>{tr('Date:', 'Date :')}</span>
            <span>{bookingData.selectedDate}</span>
          </div>
          <div className="flex justify-between">
            <span>{tr('Time:', 'Heure :')}</span>
            <span>{bookingData.selectedTime}</span>
          </div>
          <div className="flex justify-between">
            <span>{tr('Participants:', 'Participants :')}</span>
            <span>{bookingData.totalParticipants}</span>
          </div>
          <div className="border-t pt-2 flex justify-between font-semibold">
            <span>{tr('Total:', 'Total :')}</span>
            <span>${pricing.total.toFixed(2)}</span>
          </div>
        </div>
      </div>
      
      <button
        onClick={() => navigate('/')}
        className="bg-blue-600 text-white px-6 py-2 rounded-md hover:bg-blue-700 transition-colors"
      >
        {tr('Return to Home', "Retour à l'accueil")}
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
              <span>{tr('Tour Details', 'Détails du tour')}</span>
              <span>{tr('Date & Time', 'Date et heure')}</span>
              <span>{tr('Customer Info', 'Infos client')}</span>
              <span>{tr('Participants', 'Participants')}</span>
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
                {tr('Previous', 'Précédent')}
              </button>
              
              {currentStep < 4 ? (
                <button
                  onClick={handleNextStep}
                  disabled={!validateStep(currentStep)}
                  className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {tr('Next', 'Suivant')}
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
                      {tr('Creating Booking...', 'Création de la réservation...')}
                    </>
                  ) : (
                    tr('Confirm Booking', 'Confirmer la réservation')
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
              <h3 className="text-lg font-semibold text-gray-900 mb-4">{tr('Payment Information', 'Informations de paiement')}</h3>
              
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span>{tr('Payment Type', 'Type de paiement')}</span>
                  <span className="font-medium">{tr('Credit Card', 'Carte bancaire')}</span>
                </div>
                
                <div className="border-t pt-3">
                  <div className="flex justify-between">
                    <span>{tr('Base Price per Quad:', 'Prix de base par quad :')}</span>
                    <span>${(pricingConfig.basePricePerQuad * pricingConfig.tourTypes[bookingData.tourType].multiplier).toFixed(0)}</span>
                  </div>
                  
                  <div className="flex justify-between">
                    <span>{tr('Number of Quads:', 'Nombre de quads :')}</span>
                    <span>× {bookingData.numberOfQuads}</span>
                  </div>
                  
                  <div className="flex justify-between font-medium">
                    <span>{tr('Quad Total:', 'Total des quads :')}</span>
                    <span>${pricing.basePrice.toFixed(2)}</span>
                  </div>
                  
                  <div className="flex justify-between mt-2">
                    <span>{tr('Participants:', 'Participants :')}</span>
                    <span>{bookingData.totalParticipants} {tr('people', 'personnes')}</span>
                  </div>
                  
                  {pricing.extraPassengers > 0 && (
                    <div className="flex justify-between font-medium">
                      <span>{tr('Extra Passenger Fees:', 'Frais passager supplémentaire :')}</span>
                      <span>{pricing.extraPassengers} × ${pricingConfig.extraPassengerFee}</span>
                    </div>
                  )}
                  
                  <div className="flex justify-between font-medium mt-2">
                    <span>{tr('Subtotal:', 'Sous-total :')}</span>
                    <span>${pricing.subtotal.toFixed(2)}</span>
                  </div>
                  
                  {pricing.taxApplied && (
                    <div className="flex justify-between">
                      <span>{tr('Tax', 'Taxe')} ({pricing.taxPercentage.toFixed(1)}%) :</span>
                      <span>${pricing.taxAmount.toFixed(2)}</span>
                    </div>
                  )}
                </div>
                
                <div className="border-t pt-3 flex justify-between text-lg font-bold text-blue-600">
                  <span>{tr('Total:', 'Total :')}</span>
                  <span>${pricing.total.toFixed(2)}</span>
                </div>
              </div>
              
              <div className="mt-4 p-3 bg-green-50 rounded-lg">
                <p className="text-xs text-green-800 font-medium">
                  ✓ {tr('Transparent Pricing - No Hidden Fees', 'Tarification transparente - Aucun frais caché')}
                </p>
                <p className="text-xs text-green-600 mt-1">
                  ${pricing.subtotal.toFixed(2)} + ${pricing.taxAmount.toFixed(2)} = ${pricing.total.toFixed(2)}
                </p>
              </div>
              
              <div className="mt-3 p-3 bg-blue-50 rounded-lg">
                <p className="text-xs text-blue-800">
                  💳 {tr('Secure payment processing with Stripe', 'Paiement sécurisé avec Stripe')}
                </p>
                <p className="text-xs text-blue-600 mt-1">
                  {tr('Your payment information is encrypted and secure', 'Vos informations de paiement sont chiffrées et sécurisées')}
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
